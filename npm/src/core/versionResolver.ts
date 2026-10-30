import * as semver from "semver";
import { UpdateRisk } from "../types";
import { parseNpmAlias, versionRangeOf } from "./dependencySpec";

/**
 * Result of rewriting one range to `latest`:
 * - a string when a safe, style-preserving rewrite exists
 * - null when the spec must not be one-click upgraded
 */
type Rewrite = string | null;

export class VersionResolver {
	public static isUpdateAvailable(
		currentVersion: string,
		latestVersion: string,
	): boolean {
		return (
			VersionResolver.formatNewVersion(currentVersion, latestVersion) !== null
		);
	}

	public static calculateUpdateRisk(
		currentVersion: string,
		latestVersion: string,
	): UpdateRisk {
		const diff = VersionResolver.getDiffType(currentVersion, latestVersion);
		if (diff === "major" || diff === "premajor") {
			return UpdateRisk.High;
		}
		if (diff === "minor" || diff === "preminor") {
			return UpdateRisk.Medium;
		}
		return UpdateRisk.Low;
	}

	public static getDiffType(
		currentVersion: string,
		latestVersion: string,
	): semver.ReleaseType | null {
		try {
			const latest = semver.parse(latestVersion);
			const baseline = riskBaseline(currentVersion, latest);
			if (!baseline || !latest) {
				return null;
			}
			return semver.diff(baseline, latest);
		} catch {
			return null;
		}
	}

	/**
	 * Rewrite `currentVersionStr` so it includes `newVersionStr`, preserving
	 * the user's operator / wildcard style. Returns null when no safe rewrite
	 * exists (non-registry specs, wildcards that already cover the target,
	 * or compound ranges the target falls outside of).
	 */
	public static formatNewVersion(
		currentVersionStr: string,
		newVersionStr: string,
	): string | null {
		try {
			const latest = semver.parse(newVersionStr);
			if (!latest) {
				return null;
			}
			const trimmed = currentVersionStr.trim();
			const alias = parseNpmAlias(trimmed);
			const range = versionRangeOf(trimmed);
			if (!range) {
				return null;
			}
			// Floor keeps its prerelease (`^2.0.0-beta.3` → `2.0.0-beta.3`).
			// `2.0.0` is newer than that floor, so the stable release is an
			// update even though the caret range already admits it. Coercing
			// the floor to `2.0.0` would hide the release that just shipped.
			const min = semver.minVersion(range);
			if (!min || !semver.gt(latest, min)) {
				return null;
			}
			const rewritten = rewriteRange(range, latest);
			if (!rewritten || rewritten.trim() === range) {
				return null;
			}
			if (semver.validRange(rewritten) === null) {
				return null;
			}
			if (!semver.satisfies(latest, rewritten)) {
				return null;
			}
			return alias ? `npm:${alias.name}@${rewritten}` : rewritten;
		} catch {
			return null;
		}
	}

	/** True when `latestVersion` is already allowed by the current spec. */
	public static specIncludes(
		currentVersion: string,
		latestVersion: string,
	): boolean {
		try {
			const latest = semver.parse(latestVersion);
			const range = versionRangeOf(currentVersion);
			if (!latest || !range) {
				return false;
			}
			return semver.satisfies(latest, range);
		} catch {
			return false;
		}
	}
}

/**
 * Floor used for risk: the alternative that already accepts `latest` when the
 * spec is an OR, otherwise the minimum of the whole range. Versions are never
 * pulled out of arbitrary strings with `semver.coerce`.
 */
function riskBaseline(
	currentVersion: string,
	latest: semver.SemVer | null,
): semver.SemVer | null {
	const range = versionRangeOf(currentVersion);
	if (!range) {
		return null;
	}
	if (latest && range.includes("||")) {
		const match = range
			.split("||")
			.map((part) => part.trim())
			.find((part) => {
				try {
					return semver.satisfies(latest, part);
				} catch {
					return false;
				}
			});
		if (match) {
			return semver.minVersion(match);
		}
	}
	return semver.minVersion(range);
}

function rewriteRange(spec: string, latest: semver.SemVer): Rewrite {
	if (spec.includes("||")) {
		return rewriteOr(spec, latest);
	}
	if (/^\S+\s+-\s+\S+$/.test(spec)) {
		return rewriteHyphen(spec, latest);
	}
	if (/[\s,]/.test(spec)) {
		return rewriteAnd(spec, latest);
	}
	return rewriteToken(spec, latest);
}

/**
 * Bump only an alternative that already accepts `latest`. If `latest` is
 * outside every alternative, refuse — rewriting one side would produce a
 * conflicting range such as `^3.0.0 || ^2.0.0`.
 */
function rewriteOr(spec: string, latest: semver.SemVer): Rewrite {
	const alternatives = spec.split("||").map((part) => part.trim());
	const next = alternatives.slice();
	for (let i = 0; i < alternatives.length; i++) {
		const alternative = alternatives[i];
		if (!semver.satisfies(latest, alternative)) {
			continue;
		}
		const bumped = rewriteRange(alternative, latest);
		if (bumped && bumped !== alternative) {
			next[i] = bumped;
			return next.join(" || ");
		}
	}
	return null;
}

/** `1.2.3 - 2.3.4` includes its endpoint. Refuse when `latest` is outside. */
function rewriteHyphen(spec: string, latest: semver.SemVer): Rewrite {
	const match = spec.match(/^(\S+)\s+-\s+(\S+)$/);
	if (!match) {
		return null;
	}
	if (!semver.satisfies(latest, spec)) {
		return null;
	}
	const result = `${latest.version} - ${match[2]}`;
	return result === spec ? null : result;
}

/**
 * Raise the first lower bound and keep upper bounds. The caller rejects the
 * result when `latest` is no longer inside it (`>=3.1.0 <2.0.0`).
 */
function rewriteAnd(spec: string, latest: semver.SemVer): Rewrite {
	const pieces = spec.split(/[\s,]+/).filter(Boolean);
	if (pieces.length < 2) {
		return null;
	}
	let replaced = false;
	const next = pieces.map((part) => {
		if (replaced || part.startsWith("<")) {
			return part;
		}
		const rewritten = rewriteToken(part, latest);
		if (rewritten && rewritten !== part) {
			replaced = true;
			return rewritten;
		}
		return part;
	});
	if (!replaced) {
		return null;
	}
	return spec.includes(",") ? next.join(", ") : next.join(" ");
}

function rewriteToken(token: string, latest: semver.SemVer): Rewrite {
	const split = splitOperator(token.trim());
	if (!split) {
		return null;
	}
	const { op, space, rest } = split;

	// Bare x-ranges (`1.x`, `1.2`, `*`) stay wildcards. Widen only when
	// `latest` falls outside the bucket; never pin them to an exact version.
	if (op === "" && isBareXRange(rest)) {
		return rewriteBareXRange(rest, latest);
	}
	if (isWildcardBody(rest)) {
		if (op === "<" || op === "<=") {
			return null;
		}
		const bare = rewriteBareXRange(rest, latest);
		if (!bare) {
			return null;
		}
		const outOp = op === ">" ? ">=" : op;
		return applyOperator(outOp, space, bare);
	}
	// A pure upper bound cannot be raised to include a newer release.
	if (op === "<" || op === "<=") {
		return null;
	}
	const parsed = semver.parse(rest);
	const partial = /^\d+(?:\.\d+)?$/.test(rest);
	if (!parsed && !(partial && op !== "")) {
		return null;
	}
	// `>1.2.3` does not include 1.2.3; `>=` does.
	const outOp = op === ">" ? ">=" : op;
	return applyOperator(outOp, space, latest.version);
}

function applyOperator(op: string, space: string, version: string): string {
	if (op === "v") {
		return `v${version}`;
	}
	if (op === "") {
		return version;
	}
	return `${op}${space}${version}`;
}

function splitOperator(
	token: string,
): { op: string; space: string; rest: string } | null {
	if (!token) {
		return null;
	}
	const match = token.match(/^(>=|<=|>|<|=|\^|~)(\s*)(\S+)$/);
	if (match) {
		return { op: match[1], space: match[2], rest: match[3] };
	}
	if (/^v\d/i.test(token)) {
		return { op: "v", space: "", rest: token.slice(1) };
	}
	if (/^[\d*xX]/.test(token)) {
		return { op: "", space: "", rest: token };
	}
	return null;
}

/** `1`, `1.2`, `1.x`, `1.2.*`, `*` — ranges whose shape is the wildcard. */
function isBareXRange(rest: string): boolean {
	if (/^(?:\*|x|X)$/.test(rest)) {
		return true;
	}
	if (isWildcardBody(rest)) {
		return true;
	}
	return /^\d+$/.test(rest) || /^\d+\.\d+$/.test(rest);
}

function isWildcardBody(rest: string): boolean {
	return (
		/^(\*|x|X|\d+)(?:\.(\*|x|X|\d+)){0,2}$/.test(rest) && /[xX*]/.test(rest)
	);
}

/**
 * Returns the widened wildcard, or null when `latest` is already inside it
 * (so the spec must not be narrowed to an exact version).
 */
function rewriteBareXRange(rest: string, latest: semver.SemVer): Rewrite {
	if (/^(?:\*|x|X)$/.test(rest)) {
		return null;
	}

	let match = rest.match(/^(\d+)\.(\d+)\.([xX*])$/);
	if (match) {
		if (
			latest.major === Number(match[1]) &&
			latest.minor === Number(match[2])
		) {
			return null;
		}
		return `${latest.major}.${latest.minor}.${match[3]}`;
	}

	match = rest.match(/^(\d+)\.([xX*])(?:\.([xX*]))?$/);
	if (match) {
		if (latest.major === Number(match[1])) {
			return null;
		}
		return match[3]
			? `${latest.major}.${match[2]}.${match[3]}`
			: `${latest.major}.${match[2]}`;
	}

	match = rest.match(/^(\d+)\.(\d+)$/);
	if (match) {
		if (
			latest.major === Number(match[1]) &&
			latest.minor === Number(match[2])
		) {
			return null;
		}
		return `${latest.major}.${latest.minor}`;
	}

	match = rest.match(/^(\d+)$/);
	if (match) {
		if (latest.major === Number(match[1])) {
			return null;
		}
		return String(latest.major);
	}

	return null;
}
