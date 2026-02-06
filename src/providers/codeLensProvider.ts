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
import { analyzeVersionUpdate } from "../core/versionAnalyzer";
import { t } from "../utils/i18n";

interface DepCodeLens extends vscode.CodeLens {
  dep: AnyDependency;
  document: vscode.TextDocument;
}

export class PyDepsCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> =
    new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> =
    this._onDidChangeCodeLenses.event;

  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
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

    // Return placeholder CodeLens items with loading state
    const codeLenses: vscode.CodeLens[] = [];
    for (const dep of dependencies) {
      const range = new vscode.Range(
        dep.line,
        dep.endColumn,
        dep.line,
        dep.endColumn,
      );

      // Version check lens (resolved async)
      const versionLens: DepCodeLens = Object.assign(
        new vscode.CodeLens(range, {
          title: "$(loading~spin) Checking...",
          command: "",
        }),
        { dep, document },
      );
      codeLenses.push(versionLens);

      // "Open on PyPI" lens (no resolve needed)
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
  ): Promise<vscode.CodeLens | null> {
    const depLens = codeLens as DepCodeLens;
    if (!depLens.dep) {
      return codeLens;
    }

    if (token.isCancellationRequested) {
      return null;
    }

    const config = getConfig();
    const dep = depLens.dep;
    const document = depLens.document;

    try {
      const packageNameWithoutExtras = dep.packageName.split("[")[0];
      const versionInfo = await getLatestCompatible(
        packageNameWithoutExtras,
        "",
        config.showPrerelease,
        config.cacheTTLMinutes,
        config.registryUrl,
      );

      if (versionInfo.error || !versionInfo.latestCompatible) {
        return null;
      }

      const versionWithoutOperator = dep.versionSpecifier.replace(/^[=<>!~\^]+/, "");
      const currentVersion = versionWithoutOperator.replace(/["']/g, "");
      const latestVersion = versionInfo.latestCompatible;

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

      return codeLens;
    } catch {
      return null;
    }
  }
}
