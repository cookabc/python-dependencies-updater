
/**
 * Utility functions for dependency version extraction and replacement
 */

export interface VersionMatch {
    fullMatch: string;
    operator: string;
    version: string;
    startIndex: number;
    endIndex: number;
}

/**
 * Extract version specifier from a line of text
 * @param line The text line
 * @param isTOML Whether the file is TOML
 */
export function extractVersionFromLine(line: string, isTOML: boolean): VersionMatch | null {
    // Regex to find version specifier
    // Matches: operator (group 1) followed by version (group 2)
    // Operators: ==, >=, <=, !=, ~=, >, <, ^ (caret for semver/poetry)

    // For TOML: inside quotes, often has spaces?
    // ">= 1.0"
    // Regex: /([=<>!~\^]+)\s*([^"',\s\]\}]+)/

    // For requirements.txt:
    // ==1.0, >=1.0
    // Regex: /([=<>!~\^]+)\s*([^\s#;]+)/

    const versionRegex = isTOML
        ? /([=<>!~\^]+)\s*([^"',\s\]\}]+)/
        : /([=<>!~\^]+)\s*([^\s#;]+)/;

    const match = line.match(versionRegex);

    if (match) {
        return {
            fullMatch: match[0],
            operator: match[1],
            version: match[2],
            startIndex: match.index!,
            endIndex: match.index! + match[0].length
        };
    }

    return null;
}

/**
 * Build the replacement string for a version update
 * Preserves the operator if found, otherwise defaults to ==
 */
export function buildVersionReplacement(
    line: string,
    newVersion: string,
    isTOML: boolean,
    match?: VersionMatch
): string {
    const currentMatch = match || extractVersionFromLine(line, isTOML);

    if (currentMatch) {
        return `${currentMatch.operator}${newVersion}`;
    }

    // Fallback if no version found
    return `==${newVersion}`;
}

/**
 * Extract just the version number from a specifier string
 * e.g. "==1.0.0" -> "1.0.0", ">=2.0" -> "2.0"
 */
export function extractVersionNumber(specifier: string): string {
    if (!specifier) { return ''; }
    // Remove quotes
    let clean = specifier.replace(/["']/g, '');
    // Trim to remove leading/trailing whitespace
    clean = clean.trim();
    // Remove operators at start
    clean = clean.replace(/^[=<>!~\^]+/, '');
    return clean.trim();
}
