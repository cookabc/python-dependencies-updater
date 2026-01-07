/**
 * pyproject.toml Parser for Python dependency management
 * Supports [project] dependencies and [project.optional-dependencies]
 * Uses text-based parsing for better reliability
 */

import type { PyProjectDependency } from "../types";

// Package name regex (same as requirements.txt)
const PACKAGE_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * Parse a pyproject.toml document and extract dependencies
 */
export function parsePyProjectDocument(content: string): PyProjectDependency[] {
  const dependencies: PyProjectDependency[] = [];
  const lines = content.split("\n");

  let currentSection = "";
  let currentExtra: string | undefined;
  let inDependenciesArray = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Track current TOML section
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      currentSection = trimmed.slice(1, -1);
      inDependenciesArray = false;

      // Reset currentExtra when leaving optional-dependencies section
      if (!currentSection.includes("optional-dependencies")) {
        currentExtra = undefined;
      }
      continue;
    }

    // Handle [project] section main dependencies
    if (
      currentSection === "project" &&
      trimmed.includes("dependencies") &&
      trimmed.includes("=") &&
      trimmed.includes("[")
    ) {
      inDependenciesArray = true;
      currentExtra = undefined;
      continue;
    }

    // Handle [project.optional-dependencies] section
    if (currentSection.startsWith("project.optional-dependencies")) {
      // Extract extra name from section like "project.optional-dependencies.dev"
      const parts = currentSection.split(".");
      if (parts.length >= 4) {
        currentExtra = parts[3];
      }

      // In optional-dependencies section, any line ending with "=[" starts an array
      if (currentSection.includes("optional-dependencies")) {
        // Check if this looks like an optional group definition (e.g., "dev = [")
        const match = trimmed.match(/^([a-zA-Z0-9._-]+)\s*=\s*\[.*$/);
        if (match) {
          currentExtra = match[1];
          inDependenciesArray = true;
          continue;
        }
      }

      // Check for generic dependencies array in optional section
      if (
        trimmed.includes("dependencies") &&
        trimmed.includes("=") &&
        trimmed.includes("[")
      ) {
        inDependenciesArray = true;
        continue;
      }
    }

    // End of dependencies array
    if (trimmed === "]" && inDependenciesArray) {
      inDependenciesArray = false;
      continue;
    }

    // Parse dependencies within arrays
    if (inDependenciesArray && currentSection) {
      const section =
        currentSection === "project"
          ? "project.dependencies"
          : "project.optional-dependencies";

      const dep = parseDependencyLine(trimmed, section as any, i, currentExtra);
      if (dep) {
        dependencies.push(dep);
      }
    }
  }

  console.log(
    `[PyProjectParser] Total dependencies parsed: ${dependencies.length}`,
  );
  console.log(
    `[PyProjectParser] Dependency breakdown:`,
    dependencies.map((d) => ({
      name: d.packageName,
      section: d.section,
      extra: d.extra || "none",
    })),
  );
  return dependencies;
}

/**
 * Parse a single dependency line
 */
function parseDependencyLine(
  line: string,
  section: "project.dependencies" | "project.optional-dependencies",
  lineNumber: number,
  extra?: string,
): PyProjectDependency | null {
  const trimmed = line.trim();

  // Skip empty lines, comments, and structural elements
  if (
    !trimmed ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("[") ||
    trimmed === "]" ||
    trimmed === ","
  ) {
    return null;
  }

  const cleanLine = trimmed
    .replace(/^["']/, "")
    .replace(/["',]+$/, "")
    .trim();

  // Skip if it's just quotes or brackets
  if (!cleanLine || cleanLine === "[" || cleanLine === "]") {
    return null;
  }

  const match = cleanLine.match(/^([a-zA-Z0-9][a-zA-Z0-9._-]*)(?:\[[^\]]*\])?\s*(.*)$/);

  if (!match) {
    return null;
  }

  const packageName = match[1];
  const versionSpecifier = match[2] ? match[2].trim() : "";

  // Validate package name
  if (!PACKAGE_NAME_REGEX.test(packageName)) {
    return null;
  }

  // Find position in original line for CodeLens placement
  const startColumn = line.indexOf(packageName);
  const endColumn = line.length;

  return {
    packageName,
    versionSpecifier,
    section,
    extra,
    path: extra
      ? ["project", "optional-dependencies", extra, packageName]
      : ["project", "dependencies", packageName],
    line: lineNumber,
    startColumn,
    endColumn,
  };
}

/**
 * Format a PyProjectDependency back to a dependency string
 */
export function formatPyProjectDependency(dep: PyProjectDependency): string {
  if (dep.versionSpecifier) {
    return `${dep.packageName}${dep.versionSpecifier}`;
  }
  return dep.packageName;
}

/**
 * Convert pyproject dependency to requirements.txt format for compatibility
 */
export function toRequirementsFormat(dep: PyProjectDependency): string {
  let result = dep.packageName;

  if (dep.versionSpecifier) {
    result += dep.versionSpecifier;
  }

  // Add extra for optional dependencies
  if (dep.extra) {
    result += `[${dep.extra}]`;
  }

  return result;
}

/**
 * Check if a file is a pyproject.toml file based on its content
 */
export function isPyProjectToml(content: string): boolean {
  try {
    return (
      content.includes("[project]") || content.includes("project.dependencies")
    );
  } catch {
    return false;
  }
}
