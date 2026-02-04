/**
 * Version Resolver for Python package versions
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import type { VersionConstraint, ResolveResult } from '../types';

// Pre-release identifiers
const PRERELEASE_PATTERNS = ['a', 'alpha', 'b', 'beta', 'rc', 'dev', 'pre', 'post'];

/**
 * Check if a version string is a pre-release version
 */
export function isPrerelease(version: string): boolean {
    const lower = version.toLowerCase();
    return PRERELEASE_PATTERNS.some(pattern => lower.includes(pattern));
}

/**
 * Parse a version string into comparable parts
 * Returns array of numbers for comparison
 */
export function parseVersion(version: string): number[] {
    // Remove any pre-release suffix for numeric comparison
    const cleanVersion = version.replace(/[a-zA-Z].*/g, '');
    const parts = cleanVersion.split('.').map(p => {
        const num = parseInt(p, 10);
        return isNaN(num) ? 0 : num;
    });
    
    // Ensure at least 3 parts for comparison
    while (parts.length < 3) {
        parts.push(0);
    }
    
    return parts;
}

/**
 * Compare two version strings
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareVersions(a: string, b: string): number {
    const partsA = parseVersion(a);
    const partsB = parseVersion(b);
    
    const maxLen = Math.max(partsA.length, partsB.length);
    
    for (let i = 0; i < maxLen; i++) {
        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;
        
        if (numA < numB) {return -1;}
        if (numA > numB) {return 1;}
    }
    
    // If numeric parts are equal, pre-release versions are less than release
    const aIsPrerelease = isPrerelease(a);
    const bIsPrerelease = isPrerelease(b);
    
    if (aIsPrerelease && !bIsPrerelease) {return -1;}
    if (!aIsPrerelease && bIsPrerelease) {return 1;}
    
    return 0;
}

/**
 * Parse a version specifier string into constraints
 * Supports: ==, !=, >=, <=, >, <, ~=
 * Supports comma-separated multiple constraints
 */
export function parseSpecifier(specifier: string): VersionConstraint[] {
    if (!specifier || specifier.trim() === '') {
        return [];
    }
    
    const constraints: VersionConstraint[] = [];
    const parts = specifier.split(',').map(p => p.trim()).filter(p => p);
    
    for (const part of parts) {
        const match = part.match(/^(==|!=|>=|<=|>|<|~=)\s*(.+)$/);
        if (match) {
            constraints.push({
                operator: match[1] as VersionConstraint['operator'],
                version: match[2].trim()
            });
        }
    }
    
    return constraints;
}

/**
 * Check if a version satisfies a single constraint
 */
function satisfiesConstraint(version: string, constraint: VersionConstraint): boolean {
    const cmp = compareVersions(version, constraint.version);
    
    switch (constraint.operator) {
        case '==':
            return cmp === 0;
        case '!=':
            return cmp !== 0;
        case '>=':
            return cmp >= 0;
        case '<=':
            return cmp <= 0;
        case '>':
            return cmp > 0;
        case '<':
            return cmp < 0;
        case '~=':
            // Compatible release: ~=X.Y means >=X.Y, ==X.*
            // ~=X.Y.Z means >=X.Y.Z, ==X.Y.*
            const constraintParts = parseVersion(constraint.version);
            const versionParts = parseVersion(version);
            
            // Must be >= constraint version
            if (cmp < 0) {return false;}
            
            // Major version must match
            if (versionParts[0] !== constraintParts[0]) {return false;}
            
            // If constraint has minor, minor must match
            if (constraintParts.length > 1 && constraint.version.includes('.')) {
                const constraintMinor = constraintParts[1];
                if (versionParts[1] !== constraintMinor) {return false;}
            }
            
            return true;
        default:
            return false;
    }
}

/**
 * Check if a version satisfies all constraints
 */
export function satisfies(version: string, constraints: VersionConstraint[]): boolean {
    if (constraints.length === 0) {
        return true;
    }
    
    return constraints.every(c => satisfiesConstraint(version, c));
}

/**
 * Resolve the latest compatible version from a list
 */
export function resolve(
    versions: string[],
    specifier: string,
    includePrerelease: boolean = false
): ResolveResult {
    if (versions.length === 0) {
        return { found: false, reason: 'no-compatible-version' };
    }
    
    const constraints = parseSpecifier(specifier);
    
    // Filter versions
    let candidates = versions.filter(v => {
        // Filter pre-releases unless explicitly included
        if (!includePrerelease && isPrerelease(v)) {
            return false;
        }
        
        // Check constraints
        return satisfies(v, constraints);
    });
    
    if (candidates.length === 0) {
        return { found: false, reason: 'no-compatible-version' };
    }
    
    // Sort descending and return the highest
    candidates.sort((a, b) => compareVersions(b, a));
    
    return {
        found: true,
        version: candidates[0]
    };
}
