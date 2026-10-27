/**
 * Utility functions for dependency version extraction and replacement.
 *
 * Upgrades bump only the lower bound or pin (`>=`, `>`, `==`, `===`, `~=`, `^`).
 * Upper bounds (`<`, `<=`), exclusions (`!=`), environment markers (`; ...`)
 * and comments stay as written. `~=` keeps its original release precision so
 * `~=4.2` is not rewritten to `~=4.2.16` (which would shrink `<5` to `<4.3`).
 */

import { compareVersions } from "../core/versionResolver";

export interface VersionMatch {
	/** The full specifier that an edit replaces (every constraint, no marker). */
	fullMatch: string;
	/** Operator of the constraint that represents the current floor/pin. */
	operator: string;
	/** Version of that floor/pin, used for risk analysis. */
	version: string;
	startIndex: number;
	endIndex: number;
}

const CONSTRAINT_PATTERN = /(===|==|!=|>=|<=|>|<|~=|\^)(\s*)([^\s,]+)/g;

/**
 * A PEP 440 direct reference (`pkg @ https://...` or `pkg @ file://...`).
 * The part after `@` is a URL, not a version to bump.
 */
export function isDirectReference(specifier: string): boolean {
	if (!specifier) {
		return false;
	}
	const head = specifier.split("#")[0]?.split(";")[0]?.trim() ?? "";
	return head.startsWith("@");
}

/**
 * True when the specifier contains a version constraint an upgrade could
 * target. Marker-only requirements, bare names and direct URL references
 * do not.
 */
export function hasVersionConstraint(specifier: string): boolean {
	if (!specifier?.trim() || isDirectReference(specifier)) {
		return false;
	}
	const head = specifier.split("#")[0]?.split(";")[0] ?? "";
	return /(===|==|!=|>=|<=|>|<|~=|\^)\s*[^\s,;]+/.test(head);
}

function isUpdatableOperator(operator: string, version: string): boolean {
	if (version.endsWith(".*")) {
		return false;
	}
	return (
		operator === ">=" ||
		operator === ">" ||
		operator === "~=" ||
		operator === "==" ||
		operator === "===" ||
		operator === "^"
	);
}

function releaseSegments(version: string): string[] {
	const match = version.trim().match(/^(\d+(?:\.\d+)*)/);
	if (!match) {
		return [version.trim()];
	}
	return match[1].split(".");
}

/**
 * Keep the release precision of a compatible-release pin.
 * `~=4.2` + `4.2.16` stays `4.2`; `~=4.2.1` + `4.2.16` becomes `4.2.16`.
 */
export function truncateToCompatiblePrecision(
	newVersion: string,
	current: string,
): string {
	const precision = releaseSegments(current).length;
	const match = newVersion.match(/^(\d+(?:\.\d+)*)([\s\S]*)$/);
	if (!match) {
		return newVersion;
	}
	const parts = match[1].split(".");
	if (parts.length <= precision) {
		return newVersion;
	}
	return parts.slice(0, precision).join(".");
}

function rewriteSpecifier(specifier: string, newVersion: string): string {
	return specifier.replace(
		new RegExp(CONSTRAINT_PATTERN.source, "g"),
		(full, operator: string, spacing: string, version: string) => {
			if (!isUpdatableOperator(operator, version)) {
				return full;
			}
			const nextOperator = operator === ">" ? ">=" : operator;
			const nextVersion =
				operator === "~="
					? truncateToCompatiblePrecision(newVersion, version)
					: newVersion;
			return `${nextOperator}${spacing}${nextVersion}`;
		},
	);
}

/** Quote that is still open at `index`, if the cursor sits inside a string. */
function enclosingQuote(line: string, index: number): string | null {
	let quote: string | null = null;
	const stop = Math.min(index, line.length);
	for (let i = 0; i < stop; i++) {
		const ch = line[i];
		if (quote) {
			if (ch === quote) {
				quote = null;
			}
		} else if (ch === '"' || ch === "'") {
			quote = ch;
		}
	}
	return quote;
}

/**
 * End of the region that can hold this dependency's version constraints.
 * Stops before environment markers (`;`), comments (`#`) and, once inside a
 * quoted TOML string, the closing quote — so a later dependency on the same
 * line is not part of this specifier.
 */
function constraintSearchEnd(
	line: string,
	searchFrom: number,
	isTOML: boolean,
): number {
	const opening = isTOML ? enclosingQuote(line, searchFrom) : null;
	for (let i = searchFrom; i < line.length; i++) {
		const ch = line[i];
		if (ch === ";" || ch === "#") {
			return i;
		}
		if (opening && ch === opening) {
			return i;
		}
	}
	return line.length;
}

function isDirectReferenceAt(
	line: string,
	searchFrom: number,
	end: number,
): boolean {
	const window = line.slice(searchFrom, end);
	return /^[A-Za-z0-9._-]*(?:\[[^\]]*\])?\s*@/.test(window);
}

interface ParsedConstraint {
	operator: string;
	version: string;
	start: number;
	end: number;
}

function parseConstraints(specifier: string): ParsedConstraint[] {
	const constraints: ParsedConstraint[] = [];
	const regex = new RegExp(CONSTRAINT_PATTERN.source, "g");
	for (const match of specifier.matchAll(regex)) {
		if (match.index === undefined) {
			continue;
		}
		constraints.push({
			operator: match[1],
			version: match[3],
			start: match.index,
			end: match.index + match[0].length,
		});
	}
	return constraints;
}

function floorRank(operator: string): number {
	switch (operator) {
		case ">=":
		case ">":
			return 3;
		case "~=":
		case "^":
			return 2;
		case "==":
		case "===":
			return 1;
		default:
			return 0;
	}
}

/**
 * Extract the version specifier that an upgrade is allowed to rewrite.
 *
 * `fromColumn` is the dependency's own start column. Several dependencies can
 * share one TOML line, and environment markers contain operators (`python_version
 * >= "3.8"`) that must not be treated as the package version.
 *
 * Returns null when there is nothing to bump: no version, a direct URL
 * reference, only exclusions/upper bounds, or only wildcards.
 */
export function extractVersionFromLine(
	line: string,
	isTOML: boolean,
	fromColumn = 0,
): VersionMatch | null {
	const searchFrom = Math.max(0, Math.min(fromColumn, line.length));
	const regionEnd = constraintSearchEnd(line, searchFrom, isTOML);
	if (isDirectReferenceAt(line, searchFrom, regionEnd)) {
		return null;
	}

	const region = line.slice(searchFrom, regionEnd);
	const constraints = parseConstraints(region);
	const updatable = constraints.filter((constraint) =>
		isUpdatableOperator(constraint.operator, constraint.version),
	);
	if (updatable.length === 0 || constraints.length === 0) {
		return null;
	}

	let floor = updatable[0];
	for (const constraint of updatable.slice(1)) {
		const rank = floorRank(constraint.operator);
		const bestRank = floorRank(floor.operator);
		if (
			rank > bestRank ||
			(rank === bestRank &&
				compareVersions(constraint.version, floor.version) > 0)
		) {
			floor = constraint;
		}
	}

	const first = constraints[0];
	const last = constraints[constraints.length - 1];
	const startIndex = searchFrom + first.start;
	const endIndex = searchFrom + last.end;

	return {
		fullMatch: line.slice(startIndex, endIndex),
		operator: floor.operator,
		version: floor.version,
		startIndex,
		endIndex,
	};
}

/**
 * Build the replacement for the specifier span from {@link extractVersionFromLine}.
 * Preserves every constraint that is not the lower bound or pin.
 */
export function buildVersionReplacement(
	line: string,
	newVersion: string,
	isTOML: boolean,
	match?: VersionMatch,
): string {
	const currentMatch = match || extractVersionFromLine(line, isTOML);
	if (!currentMatch) {
		return `==${newVersion}`;
	}
	return rewriteSpecifier(currentMatch.fullMatch, newVersion);
}

export interface PlannedUpdate {
	match: VersionMatch;
	replacement: string;
	/** Current floor/pin used for breaking-change detection. */
	currentVersion: string;
}

/**
 * Plan a one-dependency upgrade.
 * Returns null when the line has no bumpable version or the rewrite would
 * not change the file (for example `~=4.2` already covers `4.2.16`).
 */
export function planLineUpdate(
	line: string,
	newVersion: string,
	isTOML: boolean,
	fromColumn = 0,
): PlannedUpdate | null {
	const match = extractVersionFromLine(line, isTOML, fromColumn);
	if (!match) {
		return null;
	}
	const replacement = buildVersionReplacement(line, newVersion, isTOML, match);
	if (replacement === match.fullMatch) {
		return null;
	}
	return {
		match,
		replacement,
		currentVersion: match.version,
	};
}

/**
 * Whether offering "Update to {latest}" would change the specifier.
 * Direct references, bare names and marker-only lines are never updates.
 * A `~=` pin whose precision-preserving rewrite is a no-op is not an update
 * either — rewriting `~=4.2` to `~=4.2.16` would narrow the range.
 */
export function shouldOfferVersionUpdate(
	specifier: string,
	latestVersion: string,
): boolean {
	if (!latestVersion || !hasVersionConstraint(specifier)) {
		return false;
	}
	return planLineUpdate(`pkg${specifier}`, latestVersion, false, 0) !== null;
}

export type VersionLensKind =
	| "hidden"
	| "no-compatible"
	| "up-to-date"
	| "update";

/**
 * Decide which version CodeLens a dependency should get once the registry
 * has answered. Unversioned and URL dependencies stay hidden so they never
 * show an Update action (or a Major warning derived from an empty version).
 */
export function classifyVersionLens(
	specifier: string,
	latestVersion: string | null,
): VersionLensKind {
	if (!hasVersionConstraint(specifier)) {
		return "hidden";
	}
	if (!latestVersion) {
		return "no-compatible";
	}
	if (!shouldOfferVersionUpdate(specifier, latestVersion)) {
		return "up-to-date";
	}
	return "update";
}

/**
 * Extract the version number an upgrade is relative to.
 * e.g. "==1.0.0" -> "1.0.0", "!=1.5,>=1.0" -> "1.0", "<=3" -> "3".
 * Environment markers ("; python_version >= '3.9'") are ignored.
 */
export function extractVersionNumber(specifier: string): string {
	if (!specifier || isDirectReference(specifier)) {
		return "";
	}
	const withoutQuotes = specifier.replace(/["']/g, "");
	const match = extractVersionFromLine(`pkg${withoutQuotes}`, false, 0);
	if (match) {
		return match.version;
	}
	const head = withoutQuotes.split(";")[0]?.trim() ?? "";
	const first = head.split(",")[0]?.trim() ?? "";
	return first.replace(/^(===|==|!=|>=|<=|>|<|~=|\^)\s*/, "").trim();
}
