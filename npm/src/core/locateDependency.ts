import type { DependencySection, ParsedDependency } from "../types";

export interface TextRange {
	start: number;
	end: number;
}

export interface LocateOptions {
	/** Section the user clicked. Absent for callers that predate the argument. */
	section?: DependencySection;
	/**
	 * Range captured when the lens was built. Used when it still wraps the
	 * version string, and as a tie-break when the document has shifted.
	 */
	hint?: TextRange;
}

/**
 * Find the version string to replace.
 *
 * The lens range is the occurrence the user clicked. When that text is still
 * the quoted version, it wins — the first name+version match in the file may
 * be a different section (`devDependencies` vs `peerDependencies`).
 * When the range is stale, match name + version inside the clicked section
 * and do not fall through to another section.
 */
export function locateDependencyRange(
	text: string,
	deps: ParsedDependency[],
	packageName: string,
	currentVersion: string,
	options: LocateOptions = {},
): TextRange | undefined {
	const { section, hint } = options;
	const quoted = `"${currentVersion}"`;

	if (hint && text.slice(hint.start, hint.end) === quoted) {
		const owner = ownerAt(deps, hint);
		const samePackage = !owner || owner.name === packageName;
		const sameSection = !section || !owner || owner.section === section;
		if (samePackage && sameSection) {
			return { start: hint.start, end: hint.end };
		}
	}

	const inSection = (dep: ParsedDependency) =>
		!section || dep.section === section;
	const exact = deps.filter(
		(dep) =>
			dep.name === packageName &&
			inSection(dep) &&
			text.slice(dep.versionRange.start, dep.versionRange.end) === quoted,
	);
	const exactHit = pick(exact, hint);
	if (exactHit) {
		return rangeOf(exactHit);
	}

	const byVersion = deps.filter(
		(dep) =>
			dep.name === packageName &&
			inSection(dep) &&
			dep.currentVersion === currentVersion,
	);
	const versionHit = pick(byVersion, hint);
	if (versionHit) {
		return rangeOf(versionHit);
	}

	// A single dependency of this name can still be found without a section
	// (the update command used to omit it). Several matches stay untouched.
	if (!section) {
		const byName = deps.filter((dep) => dep.name === packageName);
		if (byName.length === 1) {
			return rangeOf(byName[0]);
		}
	}
	return undefined;
}

function ownerAt(
	deps: ParsedDependency[],
	hint: TextRange,
): ParsedDependency | undefined {
	return deps.find(
		(dep) =>
			hint.start >= dep.versionRange.start && hint.end <= dep.versionRange.end,
	);
}

function pick(
	deps: ParsedDependency[],
	hint: TextRange | undefined,
): ParsedDependency | undefined {
	if (deps.length === 0) {
		return undefined;
	}
	if (deps.length === 1 || !hint) {
		return deps.length === 1 ? deps[0] : undefined;
	}
	const ranked = deps.slice().sort((a, b) => {
		const da = Math.abs(a.versionRange.start - hint.start);
		const db = Math.abs(b.versionRange.start - hint.start);
		return da - db;
	});
	return ranked[0];
}

function rangeOf(dep: ParsedDependency): TextRange {
	return { start: dep.versionRange.start, end: dep.versionRange.end };
}
