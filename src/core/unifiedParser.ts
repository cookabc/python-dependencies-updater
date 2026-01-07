/**
 * Unified Parser for Python dependency files
 * Supports both requirements.txt and pyproject.toml formats
 */

import type { ParsedDependency, PyProjectDependency } from "../types";
import {
  parseDocument as parseRequirementsDocument,
  format as formatRequirement,
} from "./parser";
import {
  parsePyProjectDocument,
  formatPyProjectDependency,
  toRequirementsFormat as toRequirementsFormatPyProject,
} from "./pyprojectParser";

export type AnyDependency = ParsedDependency | PyProjectDependency;

/**
 * Supported file types
 */
export enum FileType {
  Requirements = "requirements",
  PyProject = "pyproject",
}

/**
 * File type detection result
 */
export interface FileTypeDetection {
  type: FileType;
  isValid: boolean;
  confidence: number; // 0-1, how confident we are about the detection
}

/**
 * Detect file type based on file path and content
 */
export function detectFileType(
  fileName: string,
  content: string,
): FileTypeDetection {
  // Check file extension/name first
  if (
    fileName.endsWith("pyproject.toml") ||
    fileName.endsWith("Pipfile.toml")
  ) {
    // Verify it's actually a pyproject.toml by checking for [project] section
    if (
      content.includes("[project]") ||
      content.includes("project.dependencies")
    ) {
      return { type: FileType.PyProject, isValid: true, confidence: 1.0 };
    }
  }

  if (
    fileName.endsWith("requirements.txt") ||
    fileName.endsWith(".requirements")
  ) {
    // For requirements.txt, we assume it's valid if it doesn't contain TOML syntax
    if (!content.includes("[") || !content.includes("]")) {
      return { type: FileType.Requirements, isValid: true, confidence: 0.9 };
    }
  }

  // Content-based detection
  const pyprojectIndicators = [
    "[project]",
    "[tool.",
    "[build-system]",
    "project.dependencies",
    "project.optional-dependencies",
  ];

  const hasPyProjectIndicators = pyprojectIndicators.some((indicator) => {
    return content.includes(indicator);
  });

  if (hasPyProjectIndicators) {
    return { type: FileType.PyProject, isValid: true, confidence: 0.95 };
  }

  // Default to requirements.txt if it looks like a Python requirements file
  if (content.match(/^[a-zA-Z0-9._-]+\s*[=<>!]/m)) {
    return { type: FileType.Requirements, isValid: true, confidence: 0.8 };
  }

  // Unknown format
  return { type: FileType.Requirements, isValid: false, confidence: 0.0 };
}

/**
 * Parse dependencies from any supported file format
 */
export function parseDependencies(
  fileName: string,
  content: string,
): AnyDependency[] {
  const detection = detectFileType(fileName, content);

  if (!detection.isValid) {
    return [];
  }

  switch (detection.type) {
    case FileType.PyProject:
      return parsePyProjectDocument(content);
    case FileType.Requirements:
    default:
      return parseRequirementsDocument(content);
  }
}

/**
 * Format a dependency back to its original format string
 */
export function formatDependency(dep: AnyDependency): string {
  if ("section" in dep) {
    // This is a PyProjectDependency
    return formatPyProjectDependency(dep);
  } else {
    // This is a ParsedDependency (requirements.txt)
    return formatRequirement(dep);
  }
}

/**
 * Convert any dependency to requirements.txt format
 */
export function toRequirementsFormat(dep: AnyDependency): string {
  if ("section" in dep) {
    // PyProjectDependency to requirements format
    return toRequirementsFormatPyProject(dep);
  } else {
    // ParsedDependency is already in requirements format
    return formatRequirement(dep);
  }
}

/**
 * Get file type from file name
 */
export function getFileTypeFromName(fileName: string): FileType | null {
  if (
    fileName.endsWith("pyproject.toml") ||
    fileName.endsWith("Pipfile.toml")
  ) {
    return FileType.PyProject;
  }

  if (
    fileName.endsWith("requirements.txt") ||
    fileName.endsWith(".requirements")
  ) {
    return FileType.Requirements;
  }

  return null;
}

/**
 * Check if a file is supported by this parser
 */
export function isSupportedFile(fileName: string, content?: string): boolean {
  const fileType = getFileTypeFromName(fileName);
  if (fileType) {
    return true;
  }

  // If content is provided, try content-based detection
  if (content) {
    const detection = detectFileType(fileName, content);
    return detection.isValid;
  }

  return false;
}

/**
 * Get dependency count by type
 */
export function getDependencyStats(deps: AnyDependency[]): {
  total: number;
  mainDependencies: number;
  optionalDependencies: number;
  byExtra: Record<string, number>;
} {
  const stats = {
    total: deps.length,
    mainDependencies: 0,
    optionalDependencies: 0,
    byExtra: {} as Record<string, number>,
  };

  for (const dep of deps) {
    if ("section" in dep) {
      // PyProjectDependency
      if (dep.section === "project.dependencies") {
        stats.mainDependencies++;
      } else if (dep.section === "project.optional-dependencies" && dep.extra) {
        stats.optionalDependencies++;
        stats.byExtra[dep.extra] = (stats.byExtra[dep.extra] || 0) + 1;
      }
    } else {
      // ParsedDependency (requirements.txt) - count as main dependency
      stats.mainDependencies++;
    }
  }

  return stats;
}

/**
 * Filter dependencies by type or criteria
 */
export function filterDependencies(
  deps: AnyDependency[],
  options: {
    includeMain?: boolean;
    includeOptional?: boolean;
    extras?: string[];
  } = {},
): AnyDependency[] {
  const { includeMain = true, includeOptional = true, extras = [] } = options;

  return deps.filter((dep) => {
    if ("section" in dep) {
      // PyProjectDependency
      if (dep.section === "project.dependencies") {
        return includeMain;
      } else if (dep.section === "project.optional-dependencies") {
        if (!includeOptional) {
          return false;
        }
        if (extras.length > 0 && !extras.includes(dep.extra || "")) {
          return false;
        }
        return true;
      }
    } else {
      // ParsedDependency - always include in main dependencies
      return includeMain;
    }
    return false;
  });
}

/**
 * Group dependencies by section or file structure
 */
export function groupDependencies(deps: AnyDependency[]): {
  main: AnyDependency[];
  optional: Record<string, AnyDependency[]>;
} {
  const result = {
    main: [] as AnyDependency[],
    optional: {} as Record<string, AnyDependency[]>,
  };

  for (const dep of deps) {
    if ("section" in dep) {
      // PyProjectDependency
      if (dep.section === "project.dependencies") {
        result.main.push(dep);
      } else if (dep.section === "project.optional-dependencies" && dep.extra) {
        if (!result.optional[dep.extra]) {
          result.optional[dep.extra] = [];
        }
        result.optional[dep.extra].push(dep);
      }
    } else {
      // ParsedDependency
      result.main.push(dep);
    }
  }

  return result;
}

export function isSupportedFormat(languageId: string): boolean {
  return languageId === "pip-requirements" || languageId === "toml";
}
