/**
 * CodeLens Provider for requirements.txt and pyproject.toml
 * Provides version information and clickable update links
 */

import * as vscode from "vscode";
import {
  parseDependencies,
  detectFileType,
  FileType,
  formatDependency,
  type AnyDependency,
} from "../core/unifiedParser";
import { getLatestCompatible } from "./versionService";
import { getConfig } from "../utils/configuration";
import { analyzeVersionUpdate } from "../core/versionAnalyzer";
import { t } from "../utils/i18n";
import type { PyProjectDependency, ParsedDependency } from "../types";

export class PyDepsCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> =
    new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> =
    this._onDidChangeCodeLenses.event;

  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): Promise<vscode.CodeLens[]> {
    const config = getConfig();

    if (!config.enabled) {
      return [];
    }

    // Skip pyproject.toml if support is disabled
    if (document.languageId === "toml" && !config.supportPyProject) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];
    const fileName = document.fileName;
    const content = document.getText();

    const dependencies = parseDependencies(fileName, content);

    // Process dependencies in parallel
    const promises = dependencies.map(async (dep: AnyDependency) => {
      if (token.isCancellationRequested) {
        return null;
      }

      try {
        const packageNameWithoutExtras = dep.packageName.split("[")[0];
        const versionInfo = await getLatestCompatible(
          packageNameWithoutExtras,
          "",
          config.showPrerelease,
          config.cacheTTLMinutes,
        );

        if (versionInfo.error || !versionInfo.latestCompatible) {
          return null;
        }

        const versionWithoutOperator = dep.versionSpecifier.replace(/^[=<>!~\^]+/, "");
        const currentVersion = versionWithoutOperator.replace(/["']/g, "");
        const latestVersion = versionInfo.latestCompatible;

        const range = new vscode.Range(
          dep.line,
          dep.endColumn,
          dep.line,
          dep.endColumn,
        );

        let codeLens: vscode.CodeLens;

        if (currentVersion === latestVersion) {
          // Up to date - show with green check and muted text
          codeLens = new vscode.CodeLens(range, {
            title: `$(check-all) ${t("upToDate")}`,
            command: "pyDepsHint.showUpToDate",
            arguments: [dep.packageName, latestVersion],
            tooltip: `${dep.packageName} ${latestVersion} is up to date`,
          });
        } else {
          // Analyze update risk
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

          // Update available - show with appropriate icon and risk level
          codeLens = new vscode.CodeLens(range, {
            title: `${icon} ${t("updateTo")} ${latestVersion}${riskText}`,
            command: "pyDepsHint.updateVersion",
            arguments: [document, dep.line, dep.packageName, latestVersion],
            tooltip: `Click to update ${dep.packageName} from ${currentVersion} to ${latestVersion}\nUpdate type: ${analysis.updateType}\nRisk level: ${analysis.riskLevel}`,
          });
        }

        return codeLens;
      } catch {
        return null;
      }
    });

    const results = await Promise.all(promises);

    for (const codeLens of results) {
      if (codeLens) {
        codeLenses.push(codeLens);
      }
    }

    return codeLenses;
  }
}
