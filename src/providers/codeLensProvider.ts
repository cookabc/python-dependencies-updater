/**
 * CodeLens Provider for requirements.txt and pyproject.toml
 * Provides version information and clickable update links
 */

import * as vscode from "vscode";
import { type AnyDependency, parseDependencies } from "../core/unifiedParser";
import { analyzeVersionUpdate } from "../core/versionAnalyzer";
import { isCoveredBySpecifier, resolveLatest } from "../core/versionResolver";
import type { PackageVersions, VersionInfo } from "../types";
import { getConfig } from "../utils/configuration";
import {
	classifyVersionLens,
	extractVersionNumber,
	hasVersionConstraint,
	shouldOfferVersionUpdate,
} from "../utils/dependencyUtils";
import { t } from "../utils/i18n";
import { Logger } from "../utils/logger";
import type { StatusBarManager } from "../utils/statusBar";
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
	// Track pending fetches to avoid duplicate requests
	private pendingFetches: Set<string> = new Set();
	// Optional status bar for update counts
	private statusBar?: StatusBarManager;

	constructor(statusBar?: StatusBarManager) {
		this.statusBar = statusBar;
	}

	public refresh(): void {
		this._onDidChangeCodeLenses.fire();
	}

	public clearCache(): void {
		this.versionCache.clear();
		this.dependencyCache.clear();
		this.pendingFetches.clear();
	}

	private cacheKey(packageName: string, registryUrl: string): string {
		return `${registryUrl.replace(/\/+$/, "")}|${packageName.toLowerCase()}`;
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
		return codeLenses;
	}

	/**
	 * Resolve the newest usable version for one dependency from the raw list,
	 * honouring the dependency's own specifier (==, >=, ~=, wildcards, markers).
	 */
	private resolveForDependency(
		dep: AnyDependency,
		raw: PackageVersions,
		showPrerelease: boolean,
	): string | null {
		const specifier =
			"section" in dep
				? dep.versionSpecifier
				: dep.versionSpecifier.replace(/\\+$/, "");
		const resolved = resolveLatest(raw.versions, specifier, showPrerelease);
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
		console.error(
			`[UAT-PROBE] resolveCodeLens entered; instanceof=${codeLens instanceof DependencyCodeLens}, ctor=${(codeLens as any)?.constructor?.name}`,
		);
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
					riskText = " ⚠️ Major";
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
					],
					tooltip: `Click to update ${dep.packageName} from ${currentVersion} to ${latestVersion}\nUpdate type: ${analysis.updateType}\nRisk level: ${analysis.riskLevel}`,
				};
			}
		}

		return codeLens;
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
		if (!this.statusBar) {
			return;
		}

		const config = getConfig();
		let updatesAvailable = 0;
		let totalChecked = 0;

		for (const entry of this.versionCache.values()) {
			if (entry.status === "success") {
				totalChecked++;
			}
		}

		// Count updates from the last known dependency set
		for (const cached of this.dependencyCache.values()) {
			for (const dep of cached.dependencies) {
				const key = this.cacheKey(
					dep.packageName.split("[")[0],
					config.registryUrl,
				);
				const vEntry = this.versionCache.get(key);
				if (vEntry?.status === "success" && vEntry.versions) {
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

		this.statusBar.updateStatus(updatesAvailable, totalChecked);
	}
}
