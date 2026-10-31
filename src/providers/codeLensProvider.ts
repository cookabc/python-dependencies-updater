/**
 * CodeLens Provider for requirements.txt and pyproject.toml
 * Provides version information and clickable update links
 */

import * as vscode from "vscode";
import { versionCacheKey } from "../core/packageName";
import { eligibleVersions, pythonTarget } from "../core/recommendation";
import { type AnyDependency, parseDependencies } from "../core/unifiedParser";
import { analyzeVersionUpdate } from "../core/versionAnalyzer";
import { isCoveredBySpecifier, resolveLatest } from "../core/versionResolver";
import {
	collectVulnerabilityTargets,
	pinnedVersion,
} from "../core/vulnerabilityScan";
import type { PackageVersions, VersionInfo } from "../types";
import { getConfig } from "../utils/configuration";
import {
	classifyVersionLens,
	extractVersionNumber,
	hasVersionConstraint,
	shouldOfferVersionUpdate,
	specifierForResolution,
} from "../utils/dependencyUtils";
import { t } from "../utils/i18n";
import { Logger } from "../utils/logger";
import type { StatusBarManager } from "../utils/statusBar";
import { osvKey, queryVulnerabilities } from "./osvClient";
import { getPackageVersions } from "./versionService";

/** How long a failed check stays sticky before the next resolve retries it */
const ERROR_RETRY_MS = 5 * 60 * 1000;

interface VersionCacheEntry {
	status: "loading" | "success" | "error";
	/** Raw version list; resolution happens per dependency on use */
	versions?: PackageVersions;
	versionInfo?: VersionInfo;
	timestamp: number;
}

/**
 * Custom CodeLens that stores dependency and document info for resolution
 */
class DependencyCodeLens extends vscode.CodeLens {
	constructor(
		range: vscode.Range,
		public readonly dependency: AnyDependency,
		public readonly document: vscode.TextDocument,
	) {
		super(range);
	}
}

export class PyDepsCodeLensProvider implements vscode.CodeLensProvider {
	private _onDidChangeCodeLenses: vscode.EventEmitter<void> =
		new vscode.EventEmitter<void>();
	public readonly onDidChangeCodeLenses: vscode.Event<void> =
		this._onDidChangeCodeLenses.event;

	// Cache for fetched version data: "registry|package" -> entry
	private versionCache: Map<string, VersionCacheEntry> = new Map();
	// Cache for parsed dependencies: document URI -> { version, dependencies }
	private dependencyCache: Map<
		string,
		{ version: number; dependencies: AnyDependency[] }
	> = new Map();
	// Vulnerability ids per pinned dependency: "package@version" -> ids
	private vulnerabilityCache: Map<string, string[]> = new Map();
	// Pins already sent to OSV, so a failed lookup is not retried on every paint
	private scannedPins: Set<string> = new Set();
	private scanFailed = false;
	public retryVulnerabilityScan(): void {
		this.scanFailed = false;
		this.scannedPins.clear();
		this.refresh();
	}
	// Track pending fetches to avoid duplicate requests
	private pendingFetches: Set<string> = new Set();
	// Optional status bar for update counts
	private statusBar?: StatusBarManager;
	// Bearer token for a private registry, read from SecretStorage
	private registryToken?: string;

	constructor(statusBar?: StatusBarManager) {
		this.statusBar = statusBar;
	}

	/**
	 * Set the bearer token used for registry requests. Dropping the version
	 * cache is the caller's job: a cached answer was fetched with the old
	 * credentials.
	 */
	public setRegistryToken(token: string | undefined): void {
		this.registryToken = token;
	}

	public refresh(): void {
		this._onDidChangeCodeLenses.fire();
	}

	/**
	 * Vulnerability lenses for the dependencies already parsed for `uri`.
	 *
	 * `vscode.executeCodeLensProvider` answers from a snapshot taken before the
	 * scan fires its change event, so it cannot observe the shield in the same
	 * run that produced it. The UAT suite reads the provider directly through
	 * this instead of polling a stale snapshot.
	 */
	public vulnerabilityLensesFor(uri: string): vscode.CodeLens[] {
		const cached = this.dependencyCache.get(uri);
		if (!cached) {
			return [];
		}
		const result: vscode.CodeLens[] = [];
		for (const dep of cached.dependencies) {
			const pinned = pinnedVersion(dep.versionSpecifier);
			if (!pinned) {
				continue;
			}
			const packageName = dep.packageName.split("[")[0];
			const ids = this.vulnerabilityCache.get(osvKey(packageName, pinned));
			if (!ids || ids.length === 0) {
				continue;
			}
			const range = new vscode.Range(
				dep.line,
				dep.endColumn,
				dep.line,
				dep.endColumn,
			);
			result.push(
				new vscode.CodeLens(range, {
					title: `$(shield) ${t("vulnerable", ids.length)}`,
					command: "pyDepsHint.showVulnerabilities",
					arguments: [packageName, pinned, ids],
				}),
			);
		}
		return result;
	}

	public clearCache(): void {
		this.scanFailed = false;
		this.versionCache.clear();
		this.dependencyCache.clear();
		this.vulnerabilityCache.clear();
		this.scannedPins.clear();
		this.pendingFetches.clear();
	}

	/**
	 * Drop a closed document so its dependencies no longer inflate the
	 * status bar. The version cache is kept: another open file may use it.
	 */
	public forgetDocument(uri: vscode.Uri): void {
		this.dependencyCache.delete(uri.toString());
		this.updateStatusBar();
	}

	private cacheKey(packageName: string, registryUrl: string): string {
		return versionCacheKey(packageName, registryUrl);
	}

	private openDocumentUris(): Set<string> | null {
		const documents = vscode.workspace.textDocuments;
		if (!documents) {
			return null;
		}
		return new Set(documents.map((document) => document.uri.toString()));
	}

	/** Closed documents are not part of the status total. */
	private evictClosedDocuments(): void {
		const open = this.openDocumentUris();
		if (!open) {
			return;
		}
		for (const uri of this.dependencyCache.keys()) {
			if (!open.has(uri)) {
				this.dependencyCache.delete(uri);
			}
		}
	}

	provideCodeLenses(
		document: vscode.TextDocument,
		_token: vscode.CancellationToken,
	): vscode.CodeLens[] {
		const config = getConfig();

		if (!config.enabled) {
			return [];
		}

		// Skip pyproject.toml if support is disabled
		if (document.languageId === "toml" && !config.supportPyProject) {
			return [];
		}

		const cacheKey = document.uri.toString();
		const cached = this.dependencyCache.get(cacheKey);

		let dependencies: AnyDependency[];
		if (cached && cached.version === document.version) {
			dependencies = cached.dependencies;
		} else {
			const fileName = document.fileName;
			const content = document.getText();
			dependencies = parseDependencies(fileName, content);
			this.dependencyCache.set(cacheKey, {
				version: document.version,
				dependencies,
			});
		}

		const codeLenses: vscode.CodeLens[] = [];
		for (const dep of dependencies) {
			const range = new vscode.Range(
				dep.line,
				dep.endColumn,
				dep.line,
				dep.endColumn,
			);

			// Bare names, marker-only requirements and PEP 508 direct references
			// have nothing to bump. Skip the version lens entirely so they
			// never resolve into an "Update" action.
			if (hasVersionConstraint(dep.versionSpecifier)) {
				const versionLens = new DependencyCodeLens(range, dep, document);
				codeLenses.push(versionLens);
			}

			// Only an exact pin names a version OSV can be asked about.
			if (config.checkVulnerabilities) {
				const pinned = pinnedVersion(dep.versionSpecifier);
				if (pinned) {
					const packageNameWithoutExtras = dep.packageName.split("[")[0];
					const ids = this.vulnerabilityCache.get(
						osvKey(packageNameWithoutExtras, pinned),
					);
					if (ids && ids.length > 0) {
						codeLenses.push(
							new vscode.CodeLens(range, {
								title: `$(shield) ${t("vulnerable", ids.length)}`,
								command: "pyDepsHint.showVulnerabilities",
								arguments: [packageNameWithoutExtras, pinned, ids],
								tooltip: t(
									"vulnerableTooltip",
									packageNameWithoutExtras,
									pinned,
								),
							}),
						);
					}
				}
			}

			// "Open on PyPI" lens (added immediately as it's static)
			const packageNameWithoutExtras = dep.packageName.split("[")[0];
			codeLenses.push(
				new vscode.CodeLens(range, {
					title: "$(link-external) PyPI",
					command: "pyDepsHint.openOnPyPI",
					arguments: [packageNameWithoutExtras],
					tooltip: `Open ${packageNameWithoutExtras} on PyPI`,
				}),
			);
		}

		if (config.checkVulnerabilities) {
			this.scanVulnerabilitiesAsync(dependencies);
		}

		// Re-opening a file hits the version cache without a new fetch.
		// Refresh the status bar then, so a document that was closed and
		// reopened is counted again. Skip the first paint, before any
		// lookup has succeeded, so the bar does not flash "0 up to date".
		if (this.hasResolvedVersion(dependencies, config.registryUrl)) {
			this.updateStatusBar();
		}
		if (this.scanFailed && config.checkVulnerabilities)
			codeLenses.push(
				new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
					title: "$(shield) Vulnerability check failed — retry",
					command: "pyDepsHint.retryVulnerabilityScan",
					tooltip: "Vulnerability status is unknown. Click to retry the check.",
				}),
			);
		return codeLenses;
	}

	private hasResolvedVersion(
		dependencies: AnyDependency[],
		registryUrl: string,
	): boolean {
		return dependencies.some((dep) => {
			const key = this.cacheKey(dep.packageName.split("[")[0], registryUrl);
			return this.versionCache.get(key)?.status === "success";
		});
	}

	/**
	 * Resolve the newest usable version for one dependency from the raw list,
	 * honouring the dependency's own specifier (==, >=, ~=, wildcards, markers).
	 */
	private resolveForDependency(
		dep: AnyDependency,
		raw: PackageVersions,
		showPrerelease: boolean,
		fileName?: string,
	): string | null {
		const resolved = resolveLatest(
			eligibleVersions(raw, specifierForResolution(dep), {
				...getConfig(),
				targetPythonVersion: fileName
					? pythonTarget(fileName, getConfig().targetPythonVersion)
					: getConfig().targetPythonVersion,
			}),
			specifierForResolution(dep),
			showPrerelease,
		);
		return resolved.found ? resolved.version! : null;
	}

	/** Wildcard pins that already cover the latest release need no rewrite */
	private isCovered(dep: AnyDependency, latest: string): boolean {
		return isCoveredBySpecifier(latest, dep.versionSpecifier);
	}

	async resolveCodeLens(
		codeLens: vscode.CodeLens,
		_token: vscode.CancellationToken,
	): Promise<vscode.CodeLens> {
		if (!(codeLens instanceof DependencyCodeLens)) {
			return codeLens;
		}

		const dep = codeLens.dependency;
		const document = codeLens.document;

		const config = getConfig();
		const packageNameWithoutExtras = dep.packageName.split("[")[0];
		const key = this.cacheKey(packageNameWithoutExtras, config.registryUrl);
		const cached = this.versionCache.get(key);

		// Error entries are sticky for ERROR_RETRY_MS so a flaky network does
		// not spam the registry, but recover automatically afterwards.
		const staleError =
			cached?.status === "error" &&
			Date.now() - cached.timestamp > ERROR_RETRY_MS;

		if (!cached || cached.status === "loading" || staleError) {
			codeLens.command = {
				title: `$(sync~spin) ${t("checking")}...`,
				command: "pyDepsHint.showUpToDate",
				arguments: [dep.packageName, "loading"],
				tooltip: `Checking latest version for ${dep.packageName}...`,
			};

			if (!this.pendingFetches.has(key)) {
				this.fetchVersionsAsync(packageNameWithoutExtras, config, key);
			}
		} else if (cached.status === "error") {
			const error = cached.versionInfo?.error;
			let errorMsg = t("checkFailed");
			let tooltip = `Failed to check updates for ${dep.packageName}`;
			const icon = "$(error)";

			if (error === "not-found") {
				errorMsg = `${icon} Package not found`;
				tooltip = `Package ${dep.packageName} was not found on the registry`;
			} else if (error === "fetch-error") {
				errorMsg = `${icon} Connection failed`;
				tooltip = `Could not connect to registry to check ${dep.packageName}`;
			} else {
				errorMsg = `${icon} ${errorMsg}`;
			}

			codeLens.command = {
				title: errorMsg,
				command: "pyDepsHint.showUpToDate",
				arguments: [dep.packageName, "error"],
				tooltip: tooltip,
			};
		} else {
			const raw = cached.versions!;
			const latestVersion = this.resolveForDependency(
				dep,
				raw,
				config.showPrerelease,
				document.fileName,
			);
			const currentVersion = extractVersionNumber(dep.versionSpecifier);
			const lensKind = classifyVersionLens(dep.versionSpecifier, latestVersion);

			if (lensKind === "hidden") {
				return codeLens;
			}

			if (!latestVersion) {
				// The dependency's own constraint matches nothing newer/valid —
				// nothing to suggest, which is different from an up-to-date pin.
				codeLens.command = {
					title: `$(info) ${t("noCompatible")}`,
					command: "pyDepsHint.showUpToDate",
					arguments: [dep.packageName, "no-compatible"],
					tooltip: `${dep.packageName}: no version satisfies ${dep.versionSpecifier || "(any)"}`,
				};
			} else if (
				lensKind === "up-to-date" ||
				currentVersion === latestVersion ||
				this.isCovered(dep, latestVersion)
			) {
				codeLens.command = {
					title: `$(check-all) ${t("upToDate")}`,
					command: "pyDepsHint.showUpToDate",
					arguments: [dep.packageName, latestVersion],
					tooltip: `${dep.packageName} ${latestVersion} is up to date`,
				};
			} else {
				const analysis = analyzeVersionUpdate(currentVersion, latestVersion);
				let icon = "$(arrow-circle-up)";
				let riskText = "";

				if (analysis.riskLevel === "high") {
					icon = "$(warning)";
					riskText =
						analysis.updateType === "major"
							? " Major"
							: " 0.x — review required";
				} else if (analysis.riskLevel === "medium") {
					icon = "$(info)";
					riskText = " Minor";
				}

				codeLens.command = {
					title: `${icon} ${t("updateTo")} ${latestVersion}${riskText}`,
					command: "pyDepsHint.updateVersion",
					arguments: [
						document,
						dep.line,
						dep.packageName,
						latestVersion,
						dep.startColumn,
						dep.versionSpecifier,
					],
					tooltip: `Click to update ${dep.packageName} from ${currentVersion} to ${latestVersion}\nUpdate type: ${analysis.updateType}\nReview level: ${analysis.riskLevel} (version heuristic only; tests have not been run)`,
				};
			}
		}

		return codeLens;
	}

	/**
	 * Query OSV for every exact pin in the document, once per pin.
	 *
	 * One batched request covers all of them. A pin that was already sent is
	 * not sent again, so a failed lookup does not repeat on every repaint;
	 * `clearCache` resets that when settings change.
	 */
	private async scanVulnerabilitiesAsync(
		dependencies: AnyDependency[],
	): Promise<void> {
		const pending = collectVulnerabilityTargets(dependencies).filter(
			(target) => !this.scannedPins.has(target.key),
		);
		if (pending.length === 0) {
			return;
		}
		for (const target of pending) {
			this.scannedPins.add(target.key);
		}

		try {
			const found = await queryVulnerabilities(
				pending.map((target) => ({
					packageName: target.packageName,
					version: target.version,
				})),
			);
			let changed = false;
			for (const [key, ids] of found) {
				if (!this.vulnerabilityCache.has(key)) {
					changed = true;
				}
				this.vulnerabilityCache.set(key, ids);
			}
			if (changed) {
				this._onDidChangeCodeLenses.fire();
				this.updateStatusBar();
			}
		} catch (error) {
			// The pins stay in `scannedPins`, so this is reported once rather
			// than retried on every repaint.
			Logger.error("Vulnerability scan failed:", error);
			this.scanFailed = true;
			this.refresh();
		}
	}

	private async fetchVersionsAsync(
		packageName: string,
		config: ReturnType<typeof getConfig>,
		key: string,
	): Promise<void> {
		// Mark as pending
		this.pendingFetches.add(key);

		// Set loading state
		this.versionCache.set(key, {
			status: "loading",
			timestamp: Date.now(),
		});

		try {
			Logger.log(`Fetching version for ${packageName}`);
			const versions = await getPackageVersions(
				packageName,
				config.cacheTTLMinutes,
				config.registryUrl,
				this.registryToken,
			);

			this.versionCache.set(key, {
				status: "success",
				versions,
				timestamp: Date.now(),
			});
		} catch (e: any) {
			Logger.error(`Error fetching ${packageName}:`, e);
			const fetchError = e?.fetchError;
			this.versionCache.set(key, {
				status: "error",
				versionInfo: {
					packageName,
					latestCompatible: null,
					error:
						fetchError === "not-found"
							? "not-found"
							: fetchError === "parse-error"
								? "not-found"
								: "fetch-error",
				},
				timestamp: Date.now(),
			});
		} finally {
			this.pendingFetches.delete(key);
			// Trigger refresh to update the CodeLens display
			this._onDidChangeCodeLenses.fire();
			// Update status bar from cached version data
			this.updateStatusBar();
		}
	}

	private updateStatusBar(): void {
		// Always drop closed files, even when no status bar is attached,
		// so the dependency cache cannot grow for the life of the window.
		this.evictClosedDocuments();
		if (!this.statusBar) {
			return;
		}

		const config = getConfig();
		let updatesAvailable = 0;
		let totalChecked = 0;
		let vulnerablePins = 0;

		// Only dependencies still in an open document. Historical files
		// that were closed must not keep adding to the total.
		for (const cached of this.dependencyCache.values()) {
			for (const dep of cached.dependencies) {
				if (config.checkVulnerabilities) {
					const pinned = pinnedVersion(dep.versionSpecifier);
					if (pinned) {
						const ids = this.vulnerabilityCache.get(
							osvKey(dep.packageName.split("[")[0], pinned),
						);
						if (ids && ids.length > 0) {
							vulnerablePins++;
						}
					}
				}

				const key = this.cacheKey(
					dep.packageName.split("[")[0],
					config.registryUrl,
				);
				const vEntry = this.versionCache.get(key);
				if (vEntry?.status === "success" && vEntry.versions) {
					totalChecked++;
					const latest = this.resolveForDependency(
						dep,
						vEntry.versions,
						config.showPrerelease,
					);
					if (
						latest &&
						shouldOfferVersionUpdate(dep.versionSpecifier, latest) &&
						!this.isCovered(dep, latest)
					) {
						updatesAvailable++;
					}
				}
			}
		}

		this.statusBar.updateStatus(updatesAvailable, totalChecked, vulnerablePins);
	}
}
