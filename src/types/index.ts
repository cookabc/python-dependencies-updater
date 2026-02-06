/**
 * Type definitions for py-deps-hint
 */

export interface ParsedDependency {
  packageName: string;
  versionSpecifier: string;
  line: number;
  startColumn: number;
  endColumn: number;
}

export interface PyProjectDependency {
  packageName: string;
  versionSpecifier: string;
  line: number;
  startColumn: number;
  endColumn: number;
  section: "project.dependencies" | "project.optional-dependencies";
  extra?: string; // For optional dependencies
  path: string[]; // TOML path to the dependency
}

export interface PackageVersions {
  packageName: string;
  versions: string[];
  summary?: string;
  fetchedAt: number;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export interface VersionConstraint {
  operator: "==" | "!=" | ">=" | "<=" | ">" | "<" | "~=";
  version: string;
}

export interface ResolveResult {
  found: boolean;
  version?: string;
  reason?: "no-compatible-version";
}

export interface PyPIClientResult {
  success: boolean;
  data?: PackageVersions;
  error?: "not-found" | "network-error" | "parse-error";
}

export interface VersionInfo {
  packageName: string;
  latestCompatible: string | null;
  summary?: string;
  error?: "not-found" | "no-compatible-version" | "fetch-error";
}

export interface VersionAnalysis {
  currentVersion: string;
  latestVersion: string;
  updateType: "patch" | "minor" | "major";
  isBreakingChange: boolean;
  riskLevel: "low" | "medium" | "high";
}

export interface ExtensionConfig {
  enabled: boolean;
  showPrerelease: boolean;
  cacheTTLMinutes: number;
  supportPyProject: boolean;
  registryUrl: string;
}

export interface FileType {
  type: "requirements" | "pyproject";
  languageId: "pip-requirements" | "toml";
}
