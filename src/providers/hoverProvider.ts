/**
 * Hover Provider for Python dependency files
 * Shows package description from PyPI on hover
 */

import * as vscode from "vscode";
import { parseDependencies } from "../core/unifiedParser";
import { getLatestCompatible } from "./versionService";
import { getConfig } from "../utils/configuration";
import { t } from "../utils/i18n";
import { Logger } from "../utils/logger";

export class PyDepsHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.Hover | null> {
    const config = getConfig();

    if (!config.enabled) {
      return null;
    }

    if (document.languageId === "toml" && !config.supportPyProject) {
      return null;
    }

    const dependencies = parseDependencies(
      document.fileName,
      document.getText(),
    );

    // Find the dependency at the current position
    const dep = dependencies.find(
      (d) => d.line === position.line && position.character >= d.startColumn && position.character <= d.endColumn,
    );

    if (!dep || token.isCancellationRequested) {
      return null;
    }

    Logger.log(`Providing hover for ${dep.packageName}`);
    try {
      const packageNameWithoutExtras = dep.packageName.split("[")[0];
      const versionInfo = await getLatestCompatible(
        packageNameWithoutExtras,
        "",
        config.showPrerelease,
        config.cacheTTLMinutes,
        config.registryUrl,
      );

      if (token.isCancellationRequested) {
        return null;
      }

      const markdown = new vscode.MarkdownString();
      markdown.isTrusted = true;
      markdown.supportHtml = true;

      markdown.appendMarkdown(`### ${dep.packageName}\n\n`);

      if (versionInfo.summary) {
        markdown.appendMarkdown(`${versionInfo.summary}\n\n`);
      }

      if (versionInfo.latestCompatible) {
        markdown.appendMarkdown(`**${t('latest')}:** ${versionInfo.latestCompatible}\n\n`);
      }

      const baseUrl = config.registryUrl.replace(/\/+$/, '');
      markdown.appendMarkdown(
        `[Open on PyPI](${baseUrl}/project/${encodeURIComponent(packageNameWithoutExtras)}/)`,
      );

      const range = new vscode.Range(
        dep.line,
        dep.startColumn,
        dep.line,
        dep.endColumn,
      );

      return new vscode.Hover(markdown, range);
    } catch (e) {
      Logger.error(`Hover error for ${dep.packageName}`, e);
      return null;
    }
  }
}
