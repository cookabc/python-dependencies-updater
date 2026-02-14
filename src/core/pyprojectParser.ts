import * as toml from '@iarna/toml';
import type { PyProjectDependency } from "../types";

const PACKAGE_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

interface PyProject {
  project?: {
    dependencies?: string[];
    'optional-dependencies'?: Record<string, string[]>;
  };
}

/**
 * Parse a pyproject.toml document and extract dependencies using @iarna/toml
 */
export function parsePyProjectDocument(content: string): PyProjectDependency[] {
  try {
    const parsed = toml.parse(content) as PyProject;
    const dependencies: PyProjectDependency[] = [];
    const lines = content.split('\n');

    // 1. Parse [project.dependencies]
    if (parsed.project?.dependencies) {
      dependencies.push(...extractDependencies(
        parsed.project.dependencies,
        'project.dependencies',
        lines,
        content
      ));
    }

    // 2. Parse [project.optional-dependencies]
    if (parsed.project?.['optional-dependencies']) {
      for (const [extra, deps] of Object.entries(parsed.project['optional-dependencies'])) {
        dependencies.push(...extractDependencies(
          deps,
          'project.optional-dependencies',
          lines,
          content,
          extra
        ));
      }
    }

    return dependencies;
  } catch (e) {
    // Fallback or silent failure for invalid TOML
    return [];
  }
}

function extractDependencies(
  deps: string[],
  section: "project.dependencies" | "project.optional-dependencies",
  lines: string[],
  content: string,
  extra?: string
): PyProjectDependency[] {
  const result: PyProjectDependency[] = [];

  for (const depString of deps) {
    // Parse the dependency string (e.g., "flask==2.0.0")
    // Simple regex to split package name from specifier
    const match = depString.match(/^([a-zA-Z0-9][a-zA-Z0-9._-]*)(?:\[[^\]]*\])?\s*(.*)$/);
    if (!match) {continue;}

    const packageName = match[1];
    const versionSpecifier = match[2]?.trim() || "";

    if (!PACKAGE_NAME_REGEX.test(packageName)) {continue;}

    // Find the line number in the original content
    // This is a bit tricky with TOML since the parser doesn't give line numbers.
    // We search for the dependency string in the lines.
    // Note: This might be inaccurate if the same dependency string appears multiple times (e.g. comments).
    // A robust solution would track position, but for now we scan lines.
    const lineIndex = findDependencyLine(lines, depString, section, extra);

    if (lineIndex !== -1) {
      const line = lines[lineIndex];
      const startColumn = line.indexOf(packageName); // Approximate
      const endColumn = line.length;

      result.push({
        packageName,
        versionSpecifier,
        section,
        extra,
        path: extra
          ? ["project", "optional-dependencies", extra, packageName]
          : ["project", "dependencies", packageName],
        line: lineIndex,
        startColumn: startColumn !== -1 ? startColumn : 0,
        endColumn
      });
    }
  }

  return result;
}

function findDependencyLine(
  lines: string[],
  depString: string,
  section: string,
  extra?: string
): number {
  // Heuristic to find the line number
  // We search for the string inside quotes
  // We also try to respect the section context if possible (simplified here)
  
  // Create a regex that matches the dependency string within quotes
  // Escape special regex characters in depString
  const escapedDep = depString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`['"]${escapedDep}['"]`);

  // State machine to track section
  let currentSection = "";
  let currentExtra = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Update section
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1);
      if (!currentSection.includes('optional-dependencies')) {
        currentExtra = "";
      }
      continue;
    }

    // Update extra for optional-dependencies
    if (currentSection.includes('optional-dependencies')) {
       const match = line.match(/^([a-zA-Z0-9._-]+)\s*=/);
       if (match) {
         currentExtra = match[1];
       }
    }

    // Check match
    if (regex.test(line)) {
      // Verify context
      if (section === 'project.dependencies') {
        if (currentSection === 'project' || currentSection === 'project.dependencies') {return i;}
      } else if (section === 'project.optional-dependencies') {
        // Check if we are in [project.optional-dependencies]
        // If extra is provided, try to ensure we are in the right block
        // This is a best-effort heuristic
        if (currentSection.startsWith('project.optional-dependencies')) {
            // Either [project.optional-dependencies] table or [project.optional-dependencies.extra]
            if (currentSection === `project.optional-dependencies.${extra}`) {return i;}
            if (currentSection === 'project.optional-dependencies' && currentExtra === extra) {return i;}
        }
      }
    }
  }

  // Fallback: just find the first occurrence if context matching failed (e.g. inline tables)
  for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {return i;}
  }

  return -1;
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
    const parsed = toml.parse(content) as any;
    return !!(parsed.project && (parsed.project.dependencies || parsed.project['optional-dependencies']));
  } catch {
    return false;
  }
}
