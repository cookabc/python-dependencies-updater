/**
 * Version Resolver for Python package versions
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 *
 * Ordering and pre-release detection follow PEP 440 (epochs, pre/post/dev,
 * local versions). See pep440.ts.
 */

import type { ResolveResult, VersionConstraint } from "../types";
import {
	comparePep440,
	isPep440Prerelease,
	parsePep440,
	pep440SpecifierEqual,
	releaseNumbers,
} from "./pep440";

/**
 * Check if a version string is a pre-release version.
 * Includes pre-releases that also carry a post or local segment
 * (`1.0.0rc1.post1`, `1.0rc1+cpu`) and developmental releases.
 * Post-only (`1.0.0.post1`) and local-only (`1.0+cpu`) releases are final.
 */
export function isPrerelease(version: string): boolean {
	return isPep440Prerelease(version);
}

/**
 * Parse a version string into its release numbers.
 * Epoch and pre/post/dev/local segments are not included; at least three
 * components are returned so major/minor/patch indexing stays stable.
 */
export function parseVersion(version: string): number[] {
	return releaseNumbers(version);
}

/**
 * Compare two version strings per PEP 440.
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b.
 */
export function compareVersions(a: string, b: string): number {
	return comparePep440(a, b);
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
 * Check if a version satisfies a wildcard constraint (==1.2.* / !=1.2.*).
 * Prefix matching compares epoch and the release segments before `.*`.
 * Missing segments on the candidate are treated as 0 (`1.2` matches `==1.2.0.*`).
 */
function satisfiesWildcard(
	version: string,
	constraint: VersionConstraint,
): boolean {
	const prefix = parsePep440(constraint.version.slice(0, -2));
	const parsed = parsePep440(version);
	if (!prefix || !parsed) {
		return false;
	}
	if (prefix.epoch !== parsed.epoch) {
		return false;
	}
	for (let i = 0; i < prefix.release.length; i++) {
		if ((parsed.release[i] ?? 0) !== prefix.release[i]) {
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

	if (constraint.operator === "==" || constraint.operator === "!=") {
		const equal = pep440SpecifierEqual(version, constraint.version);
		return constraint.operator === "==" ? equal : !equal;
	}

	const cmp = compareVersions(version, constraint.version);

	switch (constraint.operator) {
		case "===":
			return version.trim() === constraint.version.trim();
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
			// ~=X.Y means >=X.Y, ==X.*
			// ~=X.Y.Z means >=X.Y.Z, ==X.Y.*
			// Epochs must match; a `1!` release is not compatible with epoch 0.
			if (cmp < 0) {
				return false;
			}

			const constraintParsed = parsePep440(constraint.version);
			const versionParsed = parsePep440(version);
			if (!constraintParsed || !versionParsed) {
				return false;
			}
			if (constraintParsed.epoch !== versionParsed.epoch) {
				return false;
			}

			const constraintSegments = constraintParsed.release;
			for (let i = 0; i < constraintSegments.length - 1; i++) {
				if ((versionParsed.release[i] ?? 0) !== constraintSegments[i]) {
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
