/**
 * CodeLens Provider for requirements.txt and pyproject.toml
 * Provides version information and clickable update links
 */

import * as vscode from "vscode";
import {
  parseDependencies,
  type AnyDependency,
} from "../core/unifiedParser";
import { getLatestCompatible } from "./versionService";
import { getConfig } from "../utils/configuration";
import { extractVersionNumber } from "../utils/dependencyUtils";
import { analyzeVersionUpdate } from "../core/versionAnalyzer";
import { t } from "../utils/i18n";
import { Logger } from "../utils/logger";
import type { VersionInfo } from "../types";

interface VersionCacheEntry {
  status: "loading" | "success" | "error";
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

  // Cache for version info: packageName -> VersionCacheEntry
  private versionCache: Map<string, VersionCacheEntry> = new Map();
  // Track pending fetches to avoid duplicate requests
  private pendingFetches: Set<string> = new Set();

  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  public clearCache(): void {
    this.versionCache.clear();
    this.pendingFetches.clear();
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.CodeLens[] {
    const config = getConfig();

    if (!config.enabled) {
      return [];
    }

    // Skip pyproject.toml if support is disabled
    if (document.languageId === "toml" && !config.supportPyProject) {
      return [];
    }

    const fileName = document.fileName;
    const content = document.getText();
    const dependencies = parseDependencies(fileName, content);

    const codeLenses: vscode.CodeLens[] = [];
    for (const dep of dependencies) {
      const range = new vscode.Range(
        dep.line,
        dep.endColumn,
        dep.line,
        dep.endColumn,
      );

      // Create placeholder CodeLens for version info
      const versionLens = new DependencyCodeLens(range, dep, document);
      codeLenses.push(versionLens);

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

  async resolveCodeLens(
    codeLens: vscode.CodeLens,
    token: vscode.CancellationToken,
  ): Promise<vscode.CodeLens> {
    if (!(codeLens instanceof DependencyCodeLens)) {
      return codeLens;
    }

    const dep = codeLens.dependency;
    const document = codeLens.document;

    const config = getConfig();
    const packageNameWithoutExtras = dep.packageName.split("[")[0];
    const cacheKey = packageNameWithoutExtras.toLowerCase();
    const cached = this.versionCache.get(cacheKey);

    if (!cached || cached.status === "loading") {
      codeLens.command = {
        title: `$(sync~spin) ${t("checking")}...`,
        command: "pyDepsHint.showUpToDate",
        arguments: [dep.packageName, "loading"],
        tooltip: `Checking latest version for ${dep.packageName}...`,
      };

      if (!this.pendingFetches.has(cacheKey)) {
        this.fetchVersionAsync(packageNameWithoutExtras, config);
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
      const versionInfo = cached.versionInfo!;
      const currentVersion = extractVersionNumber(dep.versionSpecifier);
      const latestVersion = versionInfo.latestCompatible!;

      if (currentVersion === latestVersion) {
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
          arguments: [document, dep.line, dep.packageName, latestVersion],
          tooltip: `Click to update ${dep.packageName} from ${currentVersion} to ${latestVersion}\nUpdate type: ${analysis.updateType}\nRisk level: ${analysis.riskLevel}`,
        };
      }
    }

    return codeLens;
   }

   private async fetchVersionAsync(
     packageName: string,
     config: ReturnType<typeof getConfig>,
   ): Promise<void> {
     const cacheKey = packageName.toLowerCase();
 
     // Mark as pending
     this.pendingFetches.add(cacheKey);
 
     // Set loading state
     this.versionCache.set(cacheKey, {
       status: "loading",
       timestamp: Date.now(),
     });
 
     try {
        Logger.log(`Fetching version for ${packageName}`);
        const versionInfo = await getLatestCompatible(
          packageName,
          "",
          config.showPrerelease,
          config.cacheTTLMinutes,
          config.registryUrl,
        );
  
        Logger.log(`Got version info for ${packageName}: ${JSON.stringify(versionInfo)}`);
  
        if (versionInfo.error || !versionInfo.latestCompatible) {
          this.versionCache.set(cacheKey, {
            status: "error",
            versionInfo,
            timestamp: Date.now(),
          });
        } else {
          this.versionCache.set(cacheKey, {
            status: "success",
            versionInfo,
            timestamp: Date.now(),
          });
        }
      } catch (e) {
        Logger.error(`Error fetching ${packageName}:`, e);
        this.versionCache.set(cacheKey, {
          status: "error",
          versionInfo: { packageName, latestCompatible: null, error: "fetch-error" },
          timestamp: Date.now(),
        });
      } finally {
       this.pendingFetches.delete(cacheKey);
       // Trigger refresh to update the CodeLens display
       this._onDidChangeCodeLenses.fire();
     }
   }
 }

