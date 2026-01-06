/**
 * Dependency Parser for pyproject.toml files
 * Parses dependencies from [project.dependencies] and [project.optional-dependencies] sections
 */

import * as toml from '@iarna/toml';
import type { ParsedDependency } from '../types';

const DEPENDENCY_REGEX = /^([a-zA-Z0-9._-]+)(?:\[[^\]]*\])?\s*(.*)$/;

/**
 * Parse a single dependency string from TOML
 * Returns null if the dependency should be skipped
 */
function parseDependencyString(
    depString: string,
    lineNumber: number,
    lineText: string
): ParsedDependency | null {
    const trimmed = depString.trim();

    if (trimmed === '') {
        return null;
    }

    if (trimmed.startsWith('#')) {
        return null;
    }

    if (trimmed.startsWith('.') || trimmed.startsWith('/') || trimmed.includes('file://')) {
        return null;
    }

    if (trimmed.includes('://')) {
        const hasProtocol = /^(https?|git|svn|hg|bzr):\/\//.test(trimmed);
        if (hasProtocol) {
            return null;
        }
    }

    const match = trimmed.match(DEPENDENCY_REGEX);

    if (!match) {
        return null;
    }

    const packageName = match[1];
    const versionSpecifier = match[2].trim();

    const startColumn = lineText.indexOf(packageName);
    const endColumn = lineText.length;

    return {
        packageName,
        versionSpecifier,
        line: lineNumber,
        startColumn,
        endColumn
    };
}

/**
 * Parse pyproject.toml and return all dependencies
 * Supports both old PEP 518 and new PEP 621 formats
 */
export function parsePyprojectDocument(content: string): ParsedDependency[] {
    const dependencies: ParsedDependency[] = [];

    try {
        const parsed = toml.parse(content) as any;

        const lines = content.split('\n');

        if (parsed.project) {
            if (Array.isArray(parsed.project.dependencies)) {
                parsed.project.dependencies.forEach((dep: string) => {
                    const parsedDep = findAndParseDependency(dep, lines);
                    if (parsedDep) {
                        dependencies.push(parsedDep);
                    }
                });
            }

            // Handle optional-dependencies (use bracket notation for kebab-case keys)
            const optionalDeps = parsed.project['optional-dependencies'];
            if (optionalDeps) {
                if (Array.isArray(optionalDeps)) {
                    optionalDeps.forEach((dep: string) => {
                        const parsedDep = findAndParseDependency(dep, lines);
                        if (parsedDep) {
                            dependencies.push(parsedDep);
                        }
                    });
                } else if (typeof optionalDeps === 'object') {
                    // optional-dependencies is a dict of extras
                    const extras: Record<string, string[]> = optionalDeps;
                    Object.keys(extras).forEach(extraName => {
                        const extraDepsList = extras[extraName];
                        if (Array.isArray(extraDepsList)) {
                            extraDepsList.forEach((dep: string) => {
                                const parsedDep = findAndParseDependency(dep, lines);
                                if (parsedDep) {
                                    dependencies.push(parsedDep);
                                }
                            });
                        }
                    });
                }
            }
        }
        // PEP 518 format: tool.poetry.dependencies or similar
        else if (parsed.tool && parsed.tool.poetry && Array.isArray(parsed.tool.poetry.dependencies)) {
            // Poetry format is more complex (may include dev dependencies)
            // For now, skip poetry format as it has nested objects
            return [];
        }
        // Legacy setuptools format
        else if (parsed.install_requires && Array.isArray(parsed.install_requires)) {
            parsed.install_requires.forEach((dep: string) => {
                const parsedDep = findAndParseDependency(dep, lines);
                if (parsedDep) {
                    dependencies.push(parsedDep);
                }
            });
        }
    } catch (error) {
        console.error('Error parsing TOML:', error);
    }

    return dependencies;
}

function findAndParseDependency(dep: string, lines: string[]): ParsedDependency | null {
    let lineNumber = -1;
    let lineText = '';

    for (let i = 0; i < lines.length; i++) {
        const trimmedLine = lines[i].trim();

        if (trimmedLine === dep) {
            lineNumber = i;
            lineText = lines[i];
            break;
        }
    }

    if (lineNumber >= 0) {
        return parseDependencyString(dep, lineNumber, lineText);
    }

    return null;
}

/**
 * Format a ParsedDependency back to a dependency string
 * Used for round-trip testing
 */
export function formatPyprojectDependency(dep: ParsedDependency): string {
    if (dep.versionSpecifier) {
        return `"${dep.packageName}${dep.versionSpecifier}"`;
    }
    return `"${dep.packageName}"`;
}
