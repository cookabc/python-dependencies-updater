/**
 * Version Resolver for Python package versions
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import type { ResolveResult, VersionConstraint } from "../types";

// Pre-release identifiers
// A pre-release segment (a/alpha/b/beta/c/rc/pre/preview/dev) with its number,
// optionally followed by a .postN tail (PEP 440: X.Y.ZaN.postM is still a pre-release).
// ".post" alone is a POST-release and must NOT match, so the tag has to be at the
// end of the version (optionally closing with the post tail).
const PRERELEASE_SUFFIX_REGEX =
	/(?:a|alpha|b|beta|c|rc|pre|preview|dev)\d*(?:\.post\d*)?$/i;

// Pre-compiled regexes for performance
const VERSION_CLEAN_REGEX = /[a-zA-Z].*/g;
const POST_REGEX = /post\.?(\d*)/;
const DEV_REGEX = /dev\.?(\d*)/;
const ALPHA_REGEX = /(?:^|[.\d\-_])(a|alpha)\.?(\d*)/;
const BETA_REGEX = /(?:^|[.\d\-_])(b|beta)\.?(\d*)/;
const RC_REGEX = /(?:^|[.\d\-_])(rc|pre|c)\.?(\d*)/;

/**
 * Check if a version string is a pre-release version
 */
export function isPrerelease(version: string): boolean {
	return PRERELEASE_SUFFIX_REGEX.test(version.trim());
}

/**
 * Parse a version string into comparable parts
 * Returns array of numbers for comparison
 */
export function parseVersion(version: string): number[] {
	// Remove any pre-release suffix for numeric comparison
	const cleanVersion = version.replace(VERSION_CLEAN_REGEX, "");
	const parts = cleanVersion.split(".").map((p) => {
		const num = parseInt(p, 10);
		return Number.isNaN(num) ? 0 : num;
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

		if (numA < numB) {
			return -1;
		}
		if (numA > numB) {
			return 1;
		}
	}

	// If numeric parts are equal, compare based on pre-release/post-release status
	// Priorities: dev < alpha < beta < rc < final < post
	const infoA = getPrereleaseInfo(a);
	const infoB = getPrereleaseInfo(b);

	if (infoA.type !== infoB.type) {
		return infoA.type < infoB.type ? -1 : 1;
	}

	if (infoA.number !== infoB.number) {
		return infoA.number < infoB.number ? -1 : 1;
	}

	return 0;
}

/**
 * Extract pre-release information from version string
 * Returns type (0-5) and number for comparison
 */
function getPrereleaseInfo(version: string): { type: number; number: number } {
	const lower = version.toLowerCase();

	// Check types in order of precedence or specific matching
	// Order: dev (0) < alpha (1) < beta (2) < rc (3) < final (4) < post (5)

	if (lower.includes("post")) {
		const match = lower.match(POST_REGEX);
		if (match) {
			return { type: 5, number: match[1] ? parseInt(match[1], 10) : 0 };
		}
	}

	if (lower.includes("dev")) {
		const match = lower.match(DEV_REGEX);
		if (match) {
			return { type: 0, number: match[1] ? parseInt(match[1], 10) : 0 };
		}
	}

	let match = lower.match(ALPHA_REGEX);
	if (match) {
		return { type: 1, number: match[2] ? parseInt(match[2], 10) : 0 };
	}

	match = lower.match(BETA_REGEX);
	if (match) {
		return { type: 2, number: match[2] ? parseInt(match[2], 10) : 0 };
	}

	match = lower.match(RC_REGEX);
	if (match) {
		return { type: 3, number: match[2] ? parseInt(match[2], 10) : 0 };
	}

	return { type: 4, number: 0 };
}

/**
 * Parse a version specifier string into constraints
 * Supports: ===, ==, !=, >=, <=, >, <, ~=, and wildcards (==1.2.* / !=1.2.*)
 * Supports comma-separated multiple constraints
 * Environment markers ("; python_version >= '3.9'") are stripped
 */
export function parseSpecifier(specifier: string): VersionConstraint[] {
	if (!specifier || specifier.trim() === "") {
		return [];
	}

	const constraints: VersionConstraint[] = [];
	const parts = specifier
		.split(",")
		.map((p) => p.split(";")[0].trim())
		.filter((p) => p);

	for (const part of parts) {
		const match = part.match(/^(===|==|!=|>=|<=|>|<|~=)\s*(.+)$/);
		if (match) {
			constraints.push({
				operator: match[1] as VersionConstraint["operator"],
				version: match[2].trim(),
			});
		}
	}

	return constraints;
}

/**
 * Check if a version satisfies a wildcard constraint (==1.2.* / !=1.2.*)
 * Per PEP 440, prefix matching compares the numeric segments before the ".*"
 */
function satisfiesWildcard(
	version: string,
	constraint: VersionConstraint,
): boolean {
	const prefix = constraint.version
		.slice(0, -2)
		.split(".")
		.map((p) => parseInt(p, 10) || 0);
	const versionParts = parseVersion(version);

	for (let i = 0; i < prefix.length; i++) {
		if ((versionParts[i] || 0) !== prefix[i]) {
			return false;
		}
	}
	return true;
}

/**
 * Check if a version satisfies a single constraint
 */
function satisfiesConstraint(
	version: string,
	constraint: VersionConstraint,
): boolean {
	// Wildcards are only valid with == and != per PEP 440
	if (
		constraint.version.endsWith(".*") &&
		(constraint.operator === "==" || constraint.operator === "!=")
	) {
		const matched = satisfiesWildcard(version, constraint);
		return constraint.operator === "==" ? matched : !matched;
	}

	const cmp = compareVersions(version, constraint.version);

	switch (constraint.operator) {
		case "===":
			return version.trim() === constraint.version.trim();
		case "==":
			return cmp === 0;
		case "!=":
			return cmp !== 0;
		case ">=":
			return cmp >= 0;
		case "<=":
			return cmp <= 0;
		case ">":
			return cmp > 0;
		case "<":
			return cmp < 0;
		case "~=": {
			// Compatible release per PEP 440:
			// ~=X.Y means >=X.Y, <(X+1).0
			// ~=X.Y.Z means >=X.Y.Z, <X.(Y+1).0
			if (cmp < 0) {
				return false;
			}

			const constraintSegments = constraint.version
				.split(".")
				.map((p) => parseInt(p, 10) || 0);
			const versionParts = parseVersion(version);

			// Lock all segments except the last specified one
			for (let i = 0; i < constraintSegments.length - 1; i++) {
				if (versionParts[i] !== constraintSegments[i]) {
					return false;
				}
			}

			return true;
		}
		default:
			return false;
	}
}

/**
 * Check if a version satisfies all constraints
 */
export function satisfies(
	version: string,
	constraints: VersionConstraint[],
): boolean {
	if (constraints.length === 0) {
		return true;
	}

	return constraints.every((c) => satisfiesConstraint(version, c));
}

/**
 * Resolve the latest compatible version from a list
 */
export function resolve(
	versions: string[],
	specifier: string,
	includePrerelease: boolean = false,
): ResolveResult {
	if (versions.length === 0) {
		return { found: false, reason: "no-compatible-version" };
	}

	const constraints = parseSpecifier(specifier);

	// Filter versions
	const candidates = versions.filter((v) => {
		// Filter pre-releases unless explicitly included
		if (!includePrerelease && isPrerelease(v)) {
			return false;
		}

		// Check constraints
		return satisfies(v, constraints);
	});

	if (candidates.length === 0) {
		return { found: false, reason: "no-compatible-version" };
	}

	// Sort descending and return the highest
	candidates.sort((a, b) => compareVersions(b, a));

	return {
		found: true,
		version: candidates[0],
	};
}

/**
 * Resolve the version to suggest for an update.
 *
 * Range constraints (>=, ~=, wildcards, upper bounds) are honoured — a pin
 * like ">=2.0,<3.0" must never be pushed to 4.x. A bare exact pin ("==2.0.0")
 * has no upper bound to respect: its whole purpose is to be bumped, so the
 * suggestion is the absolute latest (pre-releases still filtered unless
 * requested).
 */
export function resolveLatest(
	versions: string[],
	specifier: string,
	includePrerelease: boolean = false,
): ResolveResult {
	const constraints = parseSpecifier(specifier);
	const isBareExactPin =
		constraints.length === 1 &&
		constraints[0].operator === "==" &&
		!constraints[0].version.endsWith(".*");

	if (isBareExactPin) {
		return resolve(versions, "", includePrerelease);
	}
	return resolve(versions, specifier, includePrerelease);
}

/**
 * True when `version` already satisfies a wildcard specifier, i.e. the pin
 * ("==0.36.*") already covers the newest release and rewriting it to an
 * exact version would only narrow the range.
 */
export function isCoveredBySpecifier(
	version: string,
	specifier: string,
): boolean {
	if (!specifier.includes(".*")) {
		return false;
	}
	return satisfies(version, parseSpecifier(specifier));
}
