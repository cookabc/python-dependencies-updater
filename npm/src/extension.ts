import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { locateDependencyRange } from "./core/locateDependency";
import { PackageJsonParser } from "./core/packageJsonParser";
import {
	loadScopedRegistries,
	normalizeRegistryUrl,
	npmrcSearchPaths,
	packageWebUrl,
	tokenSecretKey,
} from "./core/registryConfig";
import { VersionResolver } from "./core/versionResolver";
import { NpmCodeLensProvider } from "./providers/codeLensProvider";
import { NpmHoverProvider } from "./providers/hoverProvider";
import { VersionService } from "./providers/versionService";
import {
	type DependencySection,
	type PackageVersionInfo,
	type ParsedDependency,
	UpdateRisk,
} from "./types";
import { t } from "./utils/i18n";
import { Logger } from "./utils/logger";
import { StatusBarManager } from "./utils/statusBar";

/**
 * Re-locate a dependency in the current document by name + current version
 * string. CodeLens arguments may predate later edits; the returned range is
 * guaranteed to wrap the version string we decided to replace, or undefined
 * when the dependency is gone.
 */
function locateDependency(
	document: vscode.TextDocument,
	parser: PackageJsonParser,
	packageName: string,
	currentVersion: string,
	section?: DependencySection,
	hint?: vscode.Range,
): vscode.Range | undefined {
	const text = document.getText();
	const found = locateDependencyRange(
		text,
		parser.parse(text),
		packageName,
		currentVersion,
		{
			section,
			hint: hint
				? {
						start: document.offsetAt(hint.start),
						end: document.offsetAt(hint.end),
					}
				: undefined,
		},
	);
	if (!found) {
		return undefined;
	}
	return new vscode.Range(
		document.positionAt(found.start),
		document.positionAt(found.end),
	);
}

function readScopedRegistries(): Map<string, string> {
	const roots = (vscode.workspace.workspaceFolders ?? []).map(
		(folder) => folder.uri.fsPath,
	);
	return loadScopedRegistries(npmrcSearchPaths(roots, os.homedir()));
}

export function activate(context: vscode.ExtensionContext) {
	Logger.init("NPM Dependencies");
	Logger.log(t("npmDeps") + " is now active!");

	const config = vscode.workspace.getConfiguration("npmDeps");
	const ttl = config.get<number>("cacheTTLMinutes", 60);
	const registryUrl = config.get<string>(
		"registryUrl",
		"https://registry.npmjs.org",
	);
	const enabled = config.get<boolean>("enabled", true);
	const showPrerelease = config.get<boolean>("showPrerelease", false);

	const versionService = new VersionService(
		ttl,
		registryUrl,
		context.globalState,
		showPrerelease,
	);
	versionService.setSecrets(context.secrets);
	versionService.setScopedRegistries(readScopedRegistries());
	const parser = new PackageJsonParser();
	const statusBar = new StatusBarManager();

	// Register Providers
	const codeLensProvider = new NpmCodeLensProvider(
		versionService,
		statusBar,
		enabled,
	);
	const hoverProvider = new NpmHoverProvider(versionService, enabled);

	// Listen for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("npmDeps")) {
				const newConfig = vscode.workspace.getConfiguration("npmDeps");
				const newEnabled = newConfig.get<boolean>("enabled", true);
				const newTtl = newConfig.get<number>("cacheTTLMinutes", 60);
				const newRegistryUrl = newConfig.get<string>(
					"registryUrl",
					"https://registry.npmjs.org",
				);
				const newShowPrerelease = newConfig.get<boolean>(
					"showPrerelease",
					false,
				);
				versionService.updateConfiguration(
					newTtl,
					newRegistryUrl,
					context.globalState,
					newShowPrerelease,
				);
				versionService.setScopedRegistries(readScopedRegistries());
				codeLensProvider.setEnabled(newEnabled);
				hoverProvider.setEnabled(newEnabled);
				codeLensProvider.refresh();
			}
		}),
	);

	const selector: vscode.DocumentSelector = [
		{ language: "json", pattern: "**/package.json" },
		{ language: "jsonc", pattern: "**/package.json" },
	];

	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider(selector, codeLensProvider),
		vscode.languages.registerHoverProvider(selector, hoverProvider),
		statusBar,
	);

	// Register Commands
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"npmDeps.updateVersion",
			async (
				uri: vscode.Uri,
				range: vscode.Range,
				packageName: string,
				currentVersion: string,
				newVersion: string,
				section?: DependencySection,
			) => {
				const formattedVersion = VersionResolver.formatNewVersion(
					currentVersion,
					newVersion,
				);
				if (!formattedVersion) {
					return;
				}

				const risk = VersionResolver.calculateUpdateRisk(
					currentVersion,
					newVersion,
				);

				if (risk === UpdateRisk.High) {
					const answer = await vscode.window.showWarningMessage(
						`Updating ${currentVersion} to ${newVersion} ${t("majorWarning")}`,
						{ modal: true },
						t("updateAnyway"),
					);
					if (answer !== t("updateAnyway")) {
						return;
					}
				}

				// The lens may have been rendered before earlier edits; aim the
				// edit at the dependency's current position, not a stale range
				let targetRange = range;
				const document = vscode.workspace.textDocuments.find(
					(d) => d.uri.toString() === uri.toString(),
				);
				if (document) {
					const located = locateDependency(
						document,
						parser,
						packageName,
						currentVersion,
						section,
						range,
					);
					if (located) {
						targetRange = located;
					} else {
						vscode.window.showWarningMessage(
							`${packageName}: ${t("checkFailed")}`,
						);
						return;
					}
				}

				const edit = new vscode.WorkspaceEdit();
				edit.replace(uri, targetRange, `"${formattedVersion}"`);
				await vscode.workspace.applyEdit(edit);

				// Refresh CodeLens
				codeLensProvider.refresh();
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"npmDeps.retryFetch",
			async (packageName: string) => {
				versionService.clearFailure(packageName);
				// Kick off a fresh attempt right away; the lens refreshes when
				// it completes (or fails again)
				void versionService.getPackageInfo(packageName).then(() => {
					codeLensProvider.refresh();
				});
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"npmDeps.showUpToDate",
			(packageName: string, version: string) => {
				vscode.window.showInformationMessage(
					`${packageName} ${t("packageUpToDate")} (v${version})`,
				);
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"npmDeps.openOnNpm",
			(packageName: string, registryUrl?: string | null) => {
				const page = packageWebUrl(registryUrl, packageName);
				if (!page) {
					vscode.window.showErrorMessage("Invalid registry URL");
					return;
				}
				vscode.env.openExternal(vscode.Uri.parse(page));
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("npmDeps.setRegistryToken", async () => {
			const configured = vscode.workspace.getConfiguration("npmDeps");
			const picks: { label: string; description?: string; url: string }[] = [];
			const fallback = normalizeRegistryUrl(
				configured.get<string>("registryUrl", "https://registry.npmjs.org"),
			);
			if (fallback) {
				picks.push({
					label: fallback,
					description: "Default registry",
					url: fallback,
				});
			}
			for (const [scope, url] of readScopedRegistries()) {
				picks.push({ label: url, description: scope, url });
			}
			picks.push({ label: "Other registry URL…", url: "" });
			const picked = await vscode.window.showQuickPick(picks, {
				title: "Registry for the auth token",
				ignoreFocusOut: true,
			});
			if (!picked) {
				return;
			}
			let url = picked.url;
			if (!url) {
				const input = await vscode.window.showInputBox({
					prompt: "Registry URL (http or https)",
					ignoreFocusOut: true,
				});
				if (input === undefined) {
					return;
				}
				const normalized = normalizeRegistryUrl(input);
				if (!normalized) {
					vscode.window.showErrorMessage(
						"Invalid registry URL. Use an http(s) URL.",
					);
					return;
				}
				url = normalized;
			}
			const token = await vscode.window.showInputBox({
				prompt: `Token for ${url}. Leave empty to remove the saved token.`,
				password: true,
				ignoreFocusOut: true,
			});
			if (token === undefined) {
				return;
			}
			const key = tokenSecretKey(url);
			if (token.trim() === "") {
				await context.secrets.delete(key);
				vscode.window.showInformationMessage(
					`Removed the saved token for ${url}`,
				);
			} else {
				await context.secrets.store(key, token.trim());
				vscode.window.showInformationMessage(`Saved the token for ${url}`);
			}
			versionService.invalidateCredentials();
			codeLensProvider.refresh();
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("npmDeps.updateAllVersions", async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || !editor.document.fileName.endsWith("package.json")) {
				vscode.window.showErrorMessage(t("openPackageJson"));
				return;
			}

			const document = editor.document;
			const documentVersionAtStart = document.version;
			const dependencies = parser.parse(document.getText());
			// peerDependencies express host compatibility windows; batch
			// updating them would silently narrow what hosts are supported
			const updatable = dependencies.filter((d) => !d.isPeer);

			// 1. Scan for updates (parallel)
			const updates: {
				dep: ParsedDependency;
				info: PackageVersionInfo;
				risk: UpdateRisk;
			}[] = [];

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: t("scanning"),
					cancellable: true,
				},
				async (progress, token) => {
					let completed = 0;
					const results = await Promise.allSettled(
						updatable.map(async (dep) => {
							if (token.isCancellationRequested) return null;
							const info = await versionService.getPackageInfo(
								dep.registryName,
							);
							completed++;
							progress.report({
								message: `${t("checking")} (${completed}/${updatable.length})`,
							});
							return { dep, info };
						}),
					);

					for (const result of results) {
						if (result.status === "fulfilled" && result.value) {
							const { dep, info } = result.value;
							if (
								info &&
								VersionResolver.isUpdateAvailable(
									dep.currentVersion,
									info.latestVersion,
								)
							) {
								const risk = VersionResolver.calculateUpdateRisk(
									dep.currentVersion,
									info.latestVersion,
								);
								updates.push({ dep, info, risk });
							}
						}
					}
				},
			);

			if (updates.length === 0) {
				vscode.window.showInformationMessage(t("allUpToDate"));
				return;
			}

			// 2. Classify updates
			const riskyUpdates = updates.filter((u) => u.risk === UpdateRisk.High);
			const safeUpdates = updates.filter((u) => u.risk !== UpdateRisk.High);

			let updatesToApply = updates;

			// 3. Prompt if risky
			if (riskyUpdates.length > 0) {
				const message =
					t("majorFound", riskyUpdates.length) +
					"\n\n" +
					riskyUpdates
						.map(
							(u) =>
								`• ${u.dep.name}: ${u.dep.currentVersion} → ${u.info.latestVersion}`,
						)
						.join("\n");

				const answer = await vscode.window.showWarningMessage(
					message,
					{ modal: true },
					t("updateSafeOnly"),
					t("updateAllRisky"),
				);

				if (answer === t("updateSafeOnly")) {
					updatesToApply = safeUpdates;
				} else if (answer === t("updateAllRisky")) {
					updatesToApply = updates;
				} else {
					return; // Cancel
				}
			}

			if (updatesToApply.length === 0) {
				return;
			}

			// 4. Apply updates — re-locating every dependency first, because the
			// scan can take a while and the user may have edited the document
			// in the meantime (stale offsets would replace the wrong text)
			const currentDeps =
				document.version === documentVersionAtStart
					? dependencies
					: parser.parse(document.getText());
			if (currentDeps !== dependencies) {
				Logger.log(
					`package.json changed during update-all; re-matching ${currentDeps.length} dependencies`,
				);
			}
			const freshByName = new Map<string, ParsedDependency[]>();
			if (currentDeps !== dependencies) {
				for (const d of currentDeps) {
					const depKey = `${d.section}|${d.name}|${d.currentVersion}`;
					const list = freshByName.get(depKey) ?? [];
					list.push(d);
					freshByName.set(depKey, list);
				}
			}

			const edit = new vscode.WorkspaceEdit();
			let applied = 0;
			for (const { dep, info } of updatesToApply) {
				const formattedVersion = VersionResolver.formatNewVersion(
					dep.currentVersion,
					info.latestVersion,
				);
				if (!formattedVersion) {
					continue;
				}

				let target = dep;
				if (currentDeps !== dependencies) {
					const list = freshByName.get(
						`${dep.section}|${dep.name}|${dep.currentVersion}`,
					);
					const located = list?.shift();
					if (!located) {
						continue;
					}
					target = located;
				}

				// Convert offsets to Range
				const startPos = document.positionAt(target.versionRange.start);
				const endPos = document.positionAt(target.versionRange.end);
				const range = new vscode.Range(startPos, endPos);

				edit.replace(document.uri, range, `"${formattedVersion}"`);
				applied++;
			}

			await vscode.workspace.applyEdit(edit);
			vscode.window.showInformationMessage(t("updatedCount", applied));
			codeLensProvider.refresh();
		}),
	);

	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument((document) => {
			if (isNpmrc(document.fileName)) {
				versionService.setScopedRegistries(readScopedRegistries());
				codeLensProvider.refresh();
			}
		}),
		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			versionService.setScopedRegistries(readScopedRegistries());
			codeLensProvider.refresh();
		}),
	);
}

function isNpmrc(fileName: string): boolean {
	return path.basename(fileName) === ".npmrc";
}

export function deactivate() {}
