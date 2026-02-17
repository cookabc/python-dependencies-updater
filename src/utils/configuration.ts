/**
 * Configuration Manager
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 */

import * as vscode from "vscode";
import type { ExtensionConfig } from "../types";

const CONFIG_SECTION = "pyDepsHint";

/**
 * Get current extension configuration
 */
export function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const registryUrl = config.get<string>("registryUrl", "https://pypi.org");

  return {
    enabled: config.get<boolean>("enabled", true),
    showPrerelease: config.get<boolean>("showPrerelease", false),
    cacheTTLMinutes: config.get<number>("cacheTTLMinutes", 60),
    supportPyProject: config.get<boolean>("supportPyProject", true),
    registryUrl: validateRegistryUrl(registryUrl),
  };
}

/**
 * Validates the registry URL to ensure it's a valid web URL
 */
export function validateRegistryUrl(url: string): string {
  const defaultUrl = "https://pypi.org";
  if (!url || typeof url !== "string") {
    return defaultUrl;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return url;
    }
  } catch {
    // Fallback to default
  }

  return defaultUrl;
}

/**
 * Register a callback for configuration changes
 */
export function onConfigChange(
  callback: (config: ExtensionConfig) => void,
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(CONFIG_SECTION)) {
      callback(getConfig());
    }
  });
}
