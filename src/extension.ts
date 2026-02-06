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

const DEBOUNCE_DELAY = 300;
let debounceTimer: NodeJS.Timeout | undefined;

function buildVersionReplacement(
  lineText: string,
  newVersion: string,
  isTOML: boolean,
): string {
  if (isTOML) {
    // Extract the version operator from the line
    const versionMatch = lineText.match(/([=<>!~^]+)\s*[^"',]+/);
    if (versionMatch) {
      const operator = versionMatch[1];
      return `${operator}${newVersion}`;
    }
    // Default to exact version if no operator found
    return `==${newVersion}`;
  }
  return `==${newVersion}`;
}

export function activate(context: vscode.ExtensionContext): void {
  console.log("Python Dependencies Updater is now active");

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

      const versionPattern = isTOML
        ? /[=<>!~\^]+\s*([^"',]+)/
        : /==([^\s]+)/;
      const currentVersionMatch = lineText.match(versionPattern);
      const currentVersion = currentVersionMatch
        ? currentVersionMatch[1].replace(/["']/g, "")
        : "";

      // Analyze update risk
      const analysis = analyzeVersionUpdate(currentVersion, newVersion);

      // Show confirmation for major updates
      if (analysis.riskLevel === "high") {
        const choice = await vscode.window.showWarningMessage(
          `⚠️ Major version update detected!\n\n${packageName}: ${currentVersion} → ${newVersion}\n\nThis may include breaking changes. Continue?`,
          { modal: true },
          "Update Anyway",
        );

        if (choice !== "Update Anyway") {
          return;
        }
      }

      const edit = new vscode.WorkspaceEdit();
      const versionRegex = isTOML
        ? /([=<>!~\^]+)\s*[^"',]+/
        : /==([\d\w\.\-\+]+)/;
      const match = lineText.match(versionRegex);

      if (match) {
        const versionPart = match[0];
        const startIndex = match.index!;
        const endIndex = startIndex + versionPart.length;

        const replacement = buildVersionReplacement(
          versionPart,
          newVersion,
          isTOML,
        );
        const range = new vscode.Range(line, startIndex, line, endIndex);
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
        dep: any;
        currentVersion: string;
        newVersion: string;
        analysis: any;
      }> = [];

      // First pass: identify safe and risky updates with progress
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: t("updateAll"),
          cancellable: true,
        },
        async (progress, progressToken) => {
          for (let idx = 0; idx < deps.length; idx++) {
            if (progressToken.isCancellationRequested) {
              break;
            }
            const dep = deps[idx];
            progress.report({
              message: `${dep.packageName} (${idx + 1}/${deps.length})`,
              increment: (1 / deps.length) * 100,
            });
            try {
              const versionInfo = await getLatestCompatible(
                dep.packageName,
                "",
                config.showPrerelease,
                config.cacheTTLMinutes,
                config.registryUrl,
              );
              if (versionInfo.latestCompatible) {
                const currentVersion = dep.versionSpecifier.replace(/^==/, "");
                const newVersion = versionInfo.latestCompatible;

                if (currentVersion !== newVersion) {
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
                    const versionRegex = isTOML
                      ? /([=<>!~\^]+)\s*[^"',]+/
                      : /==([\d\w\.\-\+]+)/;
                    const match = lineText.match(versionRegex);

                    if (match) {
                      const versionPart = match[0];
                      const startIndex = match.index!;
                      const endIndex = startIndex + versionPart.length;

                      const replacement = buildVersionReplacement(
                        versionPart,
                        newVersion,
                        isTOML,
                      );
                      const range = new vscode.Range(
                        dep.line,
                        startIndex,
                        dep.line,
                        endIndex,
                      );
                      edit.replace(document.uri, range, replacement);
                      safeUpdates++;
                    }
                  }
                }
              }
            } catch {
              // Skip failed packages
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
          `⚠️ Found ${riskyUpdates.length} major version update(s) that may include breaking changes:\n\n${riskyList}\n\nHow would you like to proceed?`,
          { modal: true },
          "Update Safe Only",
          "Update All (Including Risky)",
        );

        if (choice === undefined) {
          // User clicked Cancel (VS Code provides this automatically)
          return;
        } else if (choice === "Update All (Including Risky)") {
          const isTOML = document.languageId === "toml";
          for (const update of riskyUpdates) {
            const lineText = document.lineAt(update.dep.line).text;
            const versionRegex = isTOML
              ? /([=<>!~\^]+)\s*[^"',]+/
              : /==([\d\w\.\-\+]+)/;
            const match = lineText.match(versionRegex);

            if (match) {
              const versionPart = match[0];
              const startIndex = match.index!;
              const endIndex = startIndex + versionPart.length;

              const replacement = buildVersionReplacement(
                versionPart,
                update.newVersion,
                isTOML,
              );
              const range = new vscode.Range(
                update.dep.line,
                startIndex,
                update.dep.line,
                endIndex,
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

  const codeLensProvider = new PyDepsCodeLensProvider();
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
        // Refresh CodeLens
        codeLensProvider.refresh();

        // Update status bar
        await updateStatusBar(event.document, statusBar);
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

// Helper function to update status bar
async function updateStatusBar(
  document: vscode.TextDocument,
  statusBar: StatusBarManager,
) {
  const config = getConfig();
  if (!config.enabled) {
    statusBar.hide();
    return;
  }

  const deps = parseDependencies(document.fileName, document.getText());
  let updatesAvailable = 0;

  for (const dep of deps) {
    try {
      const versionInfo = await getLatestCompatible(
        dep.packageName,
        "",
        config.showPrerelease,
        config.cacheTTLMinutes,
        config.registryUrl,
      );
      if (versionInfo.latestCompatible) {
        const versionPattern =
          document.languageId === "toml" ? /^[=<>!~\^]+\s*["']?/ : /^==/;
        const currentVersion = dep.versionSpecifier
          .replace(versionPattern, "")
          .replace(/["']/g, "");
        if (currentVersion !== versionInfo.latestCompatible) {
          updatesAvailable++;
        }
      }
    } catch {
      // Skip failed packages
    }
  }

  statusBar.updateStatus(updatesAvailable, deps.length);
}
