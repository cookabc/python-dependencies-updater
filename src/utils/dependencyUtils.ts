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
 * @param fromColumn Optional column to start searching from. Dependencies
 *   parsed from a TOML single-line array share one line, so callers must pass
 *   the dependency's startColumn — otherwise the assignment "=" (or another
 *   dependency's specifier) is matched instead of this dependency's version.
 */
export function extractVersionFromLine(
	line: string,
	isTOML: boolean,
	fromColumn = 0,
): VersionMatch | null {
	// Regex to find version specifier
	// Matches: operator (group 1) followed by version (group 2)
	// Operators: ==, >=, <=, !=, ~=, >, <, ^ (caret for semver/poetry)

	// For TOML: inside quotes, often has spaces?
	// ">= 1.0"
	// Regex: /([=<>!~\^]+)\s*([^"',\s\]\}]+)/

	// For requirements.txt:
	// ==1.0, >=1.0
	// Regex: /([=<>!~^]+)\s*([^\s#;]+)/

	const versionRegex = isTOML
		? /([=<>!~^]+)\s*([^"',\s\]}]+)/
		: /([=<>!~^]+)\s*([^\s#;]+)/;

	const searchFrom = Math.max(0, Math.min(fromColumn, line.length));
	const match = line.slice(searchFrom).match(versionRegex);

	if (match) {
		const startIndex = searchFrom + match.index!;
		return {
			fullMatch: match[0],
			operator: match[1],
			version: match[2],
			startIndex,
			endIndex: startIndex + match[0].length,
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
	match?: VersionMatch,
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
 * Environment markers ("; python_version >= '3.9'") are dropped
 */
export function extractVersionNumber(specifier: string): string {
	if (!specifier) {
		return "";
	}
	// Drop environment markers first: everything from the first ";"
	let clean = specifier.split(";")[0];
	// Remove quotes
	clean = clean.replace(/["']/g, "");
	// Trim to remove leading/trailing whitespace
	clean = clean.trim();
	// Remove operators at start
	clean = clean.replace(/^[=<>!~^]+/, "");
	return clean.trim();
}
