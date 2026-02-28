/**
 * Extension Entry Point
 * Validates: Requirements 1.1, 1.2, 1.3, 8.1, 8.2, 8.3
 */

import * as vscode from "vscode";
import { PyDepsCodeLensProvider } from "./providers/codeLensProvider";
import { PyDepsHoverProvider } from "./providers/hoverProvider";
import { onConfigChange, getConfig } from "./utils/configuration";
import { cacheManager } from "./core/cache";
import { parseDependencies, isSupportedFormat } from "./core/unifiedParser";
import { getLatestCompatible } from "./providers/versionService";
import { analyzeVersionUpdate } from "./core/versionAnalyzer";
import { StatusBarManager } from "./utils/statusBar";
import { t } from "./utils/i18n";
import { Logger } from "./utils/logger";
import {
    extractVersionFromLine,
    buildVersionReplacement,
    extractVersionNumber
} from "./utils/dependencyUtils";
import type { VersionAnalysis } from "./types";
import type { AnyDependency } from "./core/unifiedParser";

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
    ) => {
      const lineText = document.lineAt(line).text;
      const isTOML = document.languageId === "toml";

      const match = extractVersionFromLine(lineText, isTOML);
      const currentVersion = match ? match.version : "";

      // Analyze update risk
      const analysis = analyzeVersionUpdate(currentVersion, newVersion);

      // Show confirmation for major updates
      if (analysis.riskLevel === "high") {
        const choice = await vscode.window.showWarningMessage(
          `⚠️ Major version update detected!\n\n${packageName}: ${currentVersion} → ${newVersion}\n\nThis may include breaking changes. Continue?`,
          { modal: true },
          t("updateAnyway"),
        );

        if (choice !== t("updateAnyway")) {
          return;
        }
      }

      if (match) {
        const replacement = buildVersionReplacement(
          lineText,
          newVersion,
          isTOML,
          match
        );
        const range = new vscode.Range(line, match.startIndex, line, match.endIndex);

        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, range, replacement);
        await vscode.workspace.applyEdit(edit);

        vscode.window.showInformationMessage(
          `${t("updated")} ${packageName} ${t("updateTo")} ${newVersion}`,
        );
      }
    },
  );

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
      const deps = parseDependencies(document.fileName, document.getText());
      const config = getConfig();

      const edit = new vscode.WorkspaceEdit();
      let safeUpdates = 0;
      let riskyUpdates: Array<{
        dep: AnyDependency;
        currentVersion: string;
        newVersion: string;
        analysis: VersionAnalysis;
      }> = [];

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
                  "",
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
            if (!result || !result.versionInfo.latestCompatible) {
              continue;
            }

            const { dep, versionInfo } = result;
            const currentVersion = extractVersionNumber(dep.versionSpecifier);
            const newVersion = versionInfo.latestCompatible!;

            if (currentVersion && currentVersion !== newVersion) {
              const analysis = analyzeVersionUpdate(currentVersion, newVersion);

              if (analysis.riskLevel === "high") {
                riskyUpdates.push({
                  dep,
                  currentVersion,
                  newVersion,
                  analysis,
                });
              } else {
                const lineText = document.lineAt(dep.line).text;
                const isTOML = document.languageId === "toml";
                const match = extractVersionFromLine(lineText, isTOML);

                if (match) {
                  const replacement = buildVersionReplacement(
                    lineText,
                    newVersion,
                    isTOML,
                    match
                  );
                  const range = new vscode.Range(
                    dep.line,
                    match.startIndex,
                    dep.line,
                    match.endIndex,
                  );
                  edit.replace(document.uri, range, replacement);
                  safeUpdates++;
                }
              }
            }
          }
        },
      );

      // Handle risky updates with confirmation
      let confirmedRiskyUpdates = 0;
      if (riskyUpdates.length > 0) {
        const riskyList = riskyUpdates
          .map(
            (u) =>
              `• ${u.dep.packageName}: ${u.currentVersion} → ${u.newVersion} (Major)`,
          )
          .join("\n");

        const choice = await vscode.window.showWarningMessage(
          t("majorFound", riskyUpdates.length) + "\n\n" + riskyList + "\n\nHow would you like to proceed?",
          { modal: true },
          t("updateSafeOnly"),
          t("updateAllRisky"),
        );

        if (choice === undefined) {
          // User clicked Cancel (VS Code provides this automatically)
          return;
        } else if (choice === t("updateAllRisky")) {
          const isTOML = document.languageId === "toml";
          for (const update of riskyUpdates) {
            const lineText = document.lineAt(update.dep.line).text;
            const match = extractVersionFromLine(lineText, isTOML);

            if (match) {
              const replacement = buildVersionReplacement(
                lineText,
                update.newVersion,
                isTOML,
                match
              );
              const range = new vscode.Range(
                update.dep.line,
                match.startIndex,
                update.dep.line,
                match.endIndex,
              );
              edit.replace(document.uri, range, replacement);
              confirmedRiskyUpdates++;
            }
          }
        }
        // If 'Update Safe Only', we don't add risky updates to edit
      }

      const totalUpdates = safeUpdates + confirmedRiskyUpdates;

      if (totalUpdates > 0) {
        await vscode.workspace.applyEdit(edit);

        let message = `${t("updated")} ${totalUpdates} ${t("packages")}`;
        if (riskyUpdates.length > 0 && confirmedRiskyUpdates === 0) {
          message += ` (${riskyUpdates.length} major updates skipped)`;
        }

        vscode.window.showInformationMessage(message);
      } else {
        vscode.window.showInformationMessage(t("noUpdates"));
      }
    },
  );

  // Register command for showing up-to-date status (no-op, just for styling)
  const showUpToDateCommand = vscode.commands.registerCommand(
    "pyDepsHint.showUpToDate",
    (packageName: string, version: string) => {
      // This is just for styling purposes, no action needed
    },
  );

  context.subscriptions.push(showUpToDateCommand);

  // Register command for opening package on PyPI
  const openOnPyPICommand = vscode.commands.registerCommand(
    "pyDepsHint.openOnPyPI",
    (packageName: string) => {
      const config = getConfig();
      const baseUrl = config.registryUrl.replace(/\/+$/, '');
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
    // Refresh CodeLens when config changes
    codeLensProvider.refresh();
  });

  context.subscriptions.push(configDisposable);
}

export function deactivate(): void {
  // Clear debounce timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Clear cache
  cacheManager.clear();
}


