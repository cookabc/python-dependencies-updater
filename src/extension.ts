/**
 * Extension Entry Point
 * Validates: Requirements 1.1, 1.2, 1.3, 8.1, 8.2, 8.3
 */

import * as vscode from "vscode";
import { type BatchUpdate, planRelocatedEdits } from "./core/batchUpdate";
import { cacheManager } from "./core/cache";
import { isSupportedFormat, parseDependencies } from "./core/unifiedParser";
import { analyzeVersionUpdate } from "./core/versionAnalyzer";
import { isCoveredBySpecifier } from "./core/versionResolver";
import { PyDepsCodeLensProvider } from "./providers/codeLensProvider";
import { PyDepsHoverProvider } from "./providers/hoverProvider";
import { getLatestCompatible } from "./providers/versionService";
import { getConfig, onConfigChange } from "./utils/configuration";
import {
	extractVersionNumber,
	planLineUpdate,
	shouldOfferVersionUpdate,
} from "./utils/dependencyUtils";
import { t } from "./utils/i18n";
import { Logger } from "./utils/logger";
import { StatusBarManager } from "./utils/statusBar";

const DEBOUNCE_DELAY = 300;
let debounceTimer: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext): void {
	Logger.init("Python Dependencies");
	Logger.log("Python Dependencies Updater is now active");

	// Initialize cache with persistence
	cacheManager.setMemento(context.globalState);

	// Initialize status bar
	const statusBar = new StatusBarManager();
	context.subscriptions.push(statusBar);

	// Register command for updating version
	const updateVersionCommand = vscode.commands.registerCommand(
		"pyDepsHint.updateVersion",
		async (
			document: vscode.TextDocument,
			line: number,
			packageName: string,
			newVersion: string,
			startColumn?: number,
		) => {
			const lineText = document.lineAt(line).text;
			const isTOML = document.languageId === "toml";

			// Search from the dependency's own column: several dependencies can
			// share one line in a TOML single-line array. Marker-only lines,
			// bare names and URL references have no version to rewrite — return
			// before any Major warning so confirming does not touch the marker.
			const planned = planLineUpdate(
				lineText,
				newVersion,
				isTOML,
				startColumn ?? 0,
			);
			if (!planned) {
				return;
			}

			// Analyze update risk against the floor/pin, not an exclusion or marker.
			const analysis = analyzeVersionUpdate(planned.currentVersion, newVersion);

			// Show confirmation for major updates
			if (analysis.riskLevel === "high") {
				const choice = await vscode.window.showWarningMessage(
					`⚠️ ${t("majorUpdateDetected")}\n\n${packageName}: ${planned.currentVersion} → ${newVersion}\n\n${t("continueQuestion")}`,
					{ modal: true },
					t("updateAnyway"),
				);

				if (choice !== t("updateAnyway")) {
					return;
				}
			}

			const range = new vscode.Range(
				line,
				planned.match.startIndex,
				line,
				planned.match.endIndex,
			);

			const edit = new vscode.WorkspaceEdit();
			edit.replace(document.uri, range, planned.replacement);
			await vscode.workspace.applyEdit(edit);

			vscode.window.showInformationMessage(
				`${t("updated")} ${packageName} ${t("updateTo")} ${newVersion}`,
			);
		},
	);

	context.subscriptions.push(updateVersionCommand);

	// Register command for updating all versions
	const updateAllCommand = vscode.commands.registerCommand(
		"pyDepsHint.updateAllVersions",
		async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || !isSupportedFormat(editor.document.languageId)) {
				vscode.window.showErrorMessage(t("openRequirements"));
				return;
			}

			const document = editor.document;
			const documentVersionAtStart = document.version;
			const deps = parseDependencies(document.fileName, document.getText());
			const config = getConfig();

			const pendingSafe: BatchUpdate[] = [];
			const riskyUpdates: Array<BatchUpdate & { currentVersion: string }> = [];

			// First pass: identify safe and risky updates with progress
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: t("updateAll"),
					cancellable: true,
				},
				async (progress, progressToken) => {
					let completed = 0;
					const results = await Promise.all(
						deps.map(async (dep) => {
							if (progressToken.isCancellationRequested) {
								return null;
							}
							try {
								const versionInfo = await getLatestCompatible(
									dep.packageName,
									dep.versionSpecifier,
									config.showPrerelease,
									config.cacheTTLMinutes,
									config.registryUrl,
								);
								completed++;
								progress.report({
									message: `${dep.packageName} (${completed}/${deps.length})`,
									increment: (1 / deps.length) * 100,
								});
								return { dep, versionInfo };
							} catch {
								completed++;
								progress.report({
									increment: (1 / deps.length) * 100,
								});
								return null;
							}
						}),
					);

					for (const result of results) {
						if (progressToken.isCancellationRequested) {
							break;
						}
						if (!result?.versionInfo.latestCompatible) {
							continue;
						}

						const { dep, versionInfo } = result;
						const currentVersion = extractVersionNumber(dep.versionSpecifier);
						const newVersion = versionInfo.latestCompatible!;

						if (
							currentVersion &&
							currentVersion !== newVersion &&
							!isCoveredBySpecifier(newVersion, dep.versionSpecifier) &&
							shouldOfferVersionUpdate(dep.versionSpecifier, newVersion)
						) {
							const analysis = analyzeVersionUpdate(currentVersion, newVersion);

							if (analysis.riskLevel === "high") {
								riskyUpdates.push({
									dep,
									currentVersion,
									newVersion,
									kind: "risky",
								});
							} else {
								// Do not build the edit yet. `dep.line` is from the
								// pre-fetch snapshot and is wrong if the user inserted
								// or deleted lines while the registry was answering.
								pendingSafe.push({ dep, newVersion, kind: "safe" });
							}
						}
					}
				},
			);

			// Handle risky updates with confirmation. Safe edits are not
			// applied until after this dialog, so a change made while it is
			// open is included in the same re-parse.
			let applyRisky = false;
			if (riskyUpdates.length > 0) {
				const riskyList = riskyUpdates
					.map(
						(u) =>
							`• ${u.dep.packageName}: ${u.currentVersion} → ${u.newVersion} (Major)`,
					)
					.join("\n");

				const choice = await vscode.window.showWarningMessage(
					t("majorFound", riskyUpdates.length) +
						"\n\n" +
						riskyList +
						"\n\nHow would you like to proceed?",
					{ modal: true },
					t("updateSafeOnly"),
					t("updateAllRisky"),
				);

				if (choice === undefined) {
					// User clicked Cancel (VS Code provides this automatically)
					return;
				}
				applyRisky = choice === t("updateAllRisky");
				// "Update Safe Only" leaves applyRisky false.
			}

			if (document.version !== documentVersionAtStart) {
				Logger.log(
					"Document changed during update-all; re-matching dependencies against the current text",
				);
			}

			const currentText = document.getText();
			const plannedEdits = planRelocatedEdits({
				updates: applyRisky ? [...pendingSafe, ...riskyUpdates] : pendingSafe,
				fileName: document.fileName,
				currentText,
				isTOML: document.languageId === "toml",
			});

			const edit = new vscode.WorkspaceEdit();
			for (const plannedEdit of plannedEdits) {
				const range = new vscode.Range(
					plannedEdit.line,
					plannedEdit.startColumn,
					plannedEdit.line,
					plannedEdit.endColumn,
				);
				edit.replace(document.uri, range, plannedEdit.replacement);
			}

			const safeUpdates = plannedEdits.filter(
				(item) => item.kind === "safe",
			).length;
			const confirmedRiskyUpdates = plannedEdits.filter(
				(item) => item.kind === "risky",
			).length;
			const totalUpdates = safeUpdates + confirmedRiskyUpdates;

			if (totalUpdates > 0) {
				await vscode.workspace.applyEdit(edit);

				let message = `${t("updated")} ${totalUpdates} ${t("packages")}`;
				if (riskyUpdates.length > 0 && confirmedRiskyUpdates === 0) {
					message += ` ${t("majorSkipped", riskyUpdates.length)}`;
				}

				vscode.window.showInformationMessage(message);
			} else {
				vscode.window.showInformationMessage(t("noUpdates"));
			}
		},
	);

	context.subscriptions.push(updateAllCommand);

	// Register command for showing up-to-date status (no-op, just for styling)
	const showUpToDateCommand = vscode.commands.registerCommand(
		"pyDepsHint.showUpToDate",
		(_packageName: string, _version: string) => {
			// This is just for styling purposes, no action needed
		},
	);

	context.subscriptions.push(showUpToDateCommand);

	// Register command for opening package on PyPI
	const openOnPyPICommand = vscode.commands.registerCommand(
		"pyDepsHint.openOnPyPI",
		(packageName: string) => {
			const config = getConfig();
			const baseUrl = config.registryUrl.replace(/\/+$/, "");
			const url = `${baseUrl}/project/${encodeURIComponent(packageName)}/`;
			vscode.env.openExternal(vscode.Uri.parse(url));
		},
	);

	context.subscriptions.push(openOnPyPICommand);

	// Register CodeLens Provider for version information and updates
	const selector: vscode.DocumentSelector = [
		{ language: "pip-requirements", scheme: "file" },
		{ language: "toml", scheme: "file" },
	];

	const codeLensProvider = new PyDepsCodeLensProvider(statusBar);
	const codeLensDisposable = vscode.languages.registerCodeLensProvider(
		selector,
		codeLensProvider,
	);

	context.subscriptions.push(codeLensDisposable);

	// Register Hover Provider for package descriptions
	const hoverProvider = new PyDepsHoverProvider();
	const hoverDisposable = vscode.languages.registerHoverProvider(
		selector,
		hoverProvider,
	);

	context.subscriptions.push(hoverDisposable);

	// Closed files must leave the dependency cache. Otherwise the status
	// bar keeps counting every requirements file the user has ever opened.
	const closeDisposable = vscode.workspace.onDidCloseTextDocument((closed) => {
		codeLensProvider.forgetDocument(closed.uri);
	});
	context.subscriptions.push(closeDisposable);

	// Handle document changes with debounce (Requirement 1.2, 1.3)
	const changeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
		if (isSupportedFormat(event.document.languageId)) {
			if (debounceTimer) {
				clearTimeout(debounceTimer);
			}

			debounceTimer = setTimeout(async () => {
				// Refresh CodeLens (status bar is updated by the CodeLens provider)
				codeLensProvider.refresh();
			}, DEBOUNCE_DELAY);
		}
	});

	context.subscriptions.push(changeDisposable);

	// Handle configuration changes
	const configDisposable = onConfigChange(() => {
		// Cached data may come from a different registry or predate a settings
		// change (e.g. showPrerelease); drop it so the new config takes effect.
		codeLensProvider.clearCache();
		codeLensProvider.refresh();
	});

	context.subscriptions.push(configDisposable);
}

export function deactivate(): void {
	// Clear debounce timer
	if (debounceTimer) {
		clearTimeout(debounceTimer);
	}

	// The persisted cache is deliberately kept: it is the point of
	// persisting it. Entries expire lazily via the configured TTL.
}
