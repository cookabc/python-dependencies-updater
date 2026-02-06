/**
 * Dependency Parser for requirements.txt files
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */

import type { ParsedDependency } from '../types';

// Package name: letters, numbers, dots, underscores, hyphens
// Extras: optional [extra1,extra2] after package name
// Version specifier: everything after the package name and extras
const DEPENDENCY_REGEX = /^([a-zA-Z0-9._-]+)(?:\[[^\]]*\])?\s*(.*)$/;

/**
 * Check if a line should be skipped (empty, comment, special directive)
 */
function shouldSkipLine(line: string): boolean {
    const trimmed = line.trim();
    
    // Empty or whitespace only
    if (trimmed === '') {
        return true;
    }
    
    // Comment line
    if (trimmed.startsWith('#')) {
        return true;
    }
    
    // Editable install
    if (trimmed.startsWith('-e')) {
        return true;
    }
    
    // Requirements file reference
    if (trimmed.startsWith('-r')) {
        return true;
    }
    
    // Other pip options
    if (trimmed.startsWith('-')) {
        return true;
    }
    
    // Local path (starts with . or / or contains file://)
    if (trimmed.startsWith('.') || trimmed.startsWith('/') || trimmed.includes('file://')) {
        return true;
    }
    
    // URL-based dependency
    if (/^(https?|git|svn|hg|bzr):\/\//.test(trimmed)) {
        return true;
    }
    
    return false;
}

/**
 * Parse a single line from requirements.txt
 * Returns null if the line should be skipped
 */
export function parse(line: string, lineNumber: number): ParsedDependency | null {
    if (shouldSkipLine(line)) {
        return null;
    }
    
    const trimmed = line.trim();
    const match = trimmed.match(DEPENDENCY_REGEX);
    
    if (!match) {
        return null;
    }
    
    const packageName = match[1];
    const versionSpecifier = match[2].trim();
    
    // Find the actual position in the original line
    const startColumn = line.indexOf(packageName);
    const endColumn = line.length;
    
    return {
        packageName,
        versionSpecifier,
        line: lineNumber,
        startColumn,
        endColumn
    };
}

/**
 * Parse an entire document and return all valid dependencies
 */
export function parseDocument(content: string): ParsedDependency[] {
    const lines = content.split('\n');
    const dependencies: ParsedDependency[] = [];
    
    for (let i = 0; i < lines.length; i++) {
        const parsed = parse(lines[i], i);
        if (parsed) {
            dependencies.push(parsed);
        }
    }
    
    return dependencies;
}

/**
 * Format a ParsedDependency back to a dependency string
 * Used for round-trip testing
 */
export function format(dep: ParsedDependency): string {
    if (dep.versionSpecifier) {
        return `${dep.packageName}${dep.versionSpecifier}`;
    }
    return dep.packageName;
}
