/**
 * PEP 440 version parsing and ordering.
 *
 * Sort key, following the packaging reference implementation:
 *   (epoch, release, pre, post, dev, local)
 * with trailing zeros stripped from the release, dev-only releases sorting
 * before alphas, and local segments sorting after the same version without one.
 */

const NEG = Number.NEGATIVE_INFINITY;
const POS = Number.POSITIVE_INFINITY;

/**
 * release, then optional pre, post, dev, and local.
 * Separators `.`, `-`, and `_` are equivalent. `c` / `pre` / `preview` are rc.
 * A bare `-N` tail (`1.0-1`) is an implicit post release.
 */
const VERSION_PATTERN =
	/^v?(?:(\d+)!)?(\d+(?:\.\d+)*)(?:[-_.]?(alpha|beta|preview|pre|rc|a|b|c)[-_.]?(\d*))?(?:(?:-(\d+))|(?:[-_.]?(post|rev|r)[-_.]?(\d*)))?(?:[-_.]?dev[-_.]?(\d*))?(?:\+([0-9a-z]+(?:[-_.][0-9a-z]+)*))?$/i;

export interface Pep440Version {
	epoch: number;
	/** Numeric release segments, without trailing-zero normalization. */
	release: number[];
	/** [rank, number]. Rank is 0 alpha, 1 beta, 2 rc. */
	pre: [number, number] | null;
	post: number | null;
	dev: number | null;
	local: Array<number | string> | null;
}

function preRank(letter: string): number {
	const normalized = letter.toLowerCase();
	if (normalized === "a" || normalized === "alpha") {
		return 0;
	}
	if (normalized === "b" || normalized === "beta") {
		return 1;
	}
	return 2;
}

function parseLocal(local: string): Array<number | string> {
	return local.split(/[-_.]/).map((part) => {
		if (/^\d+$/.test(part)) {
			return parseInt(part, 10);
		}
		return part.toLowerCase();
	});
}

/**
 * Parse a PEP 440 version. Returns null when the string is not a version
 * (callers keep their previous fallback rather than throwing).
 */
export function parsePep440(version: string): Pep440Version | null {
	const match = VERSION_PATTERN.exec(version.trim());
	if (!match) {
		return null;
	}

	const release = match[2].split(".").map((part) => parseInt(part, 10));
	const pre =
		match[3] === undefined
			? null
			: ([preRank(match[3]), match[4] ? parseInt(match[4], 10) : 0] as [
					number,
					number,
				]);

	let post: number | null = null;
	if (match[5] !== undefined) {
		post = parseInt(match[5], 10);
	} else if (match[6] !== undefined) {
		post = match[7] ? parseInt(match[7], 10) : 0;
	}

	const dev =
		match[8] === undefined ? null : match[8] ? parseInt(match[8], 10) : 0;
	const local = match[9] === undefined ? null : parseLocal(match[9]);

	return {
		epoch: match[1] ? parseInt(match[1], 10) : 0,
		release,
		pre,
		post,
		dev,
		local,
	};
}

export function isPep440Prerelease(version: string): boolean {
	const parsed = parsePep440(version);
	if (!parsed) {
		return false;
	}
	// A post-release of an rc (`1.0.0rc1.post1`) is still a pre-release.
	// A developmental release is too, including `1.0.post1.dev1`.
	// A local label (`1.0+cpu`) does not make a final release a pre-release.
	return parsed.pre !== null || parsed.dev !== null;
}

function stripTrailingZeros(release: number[]): number[] {
	let end = release.length;
	while (end > 1 && release[end - 1] === 0) {
		end--;
	}
	return release.slice(0, end);
}

function preKey(version: Pep440Version): [number, number] {
	if (version.pre) {
		return version.pre;
	}
	// `1.0.dev1` sorts before `1.0a1`. A post+dev release does not.
	if (version.dev !== null && version.post === null) {
		return [NEG, 0];
	}
	return [POS, 0];
}

function comparePair(left: [number, number], right: [number, number]): number {
	if (left[0] !== right[0]) {
		return left[0] < right[0] ? -1 : 1;
	}
	if (left[1] !== right[1]) {
		return left[1] < right[1] ? -1 : 1;
	}
	return 0;
}

function compareLocalPart(
	left: number | string,
	right: number | string,
): number {
	const leftNum = typeof left === "number";
	const rightNum = typeof right === "number";
	if (leftNum && rightNum) {
		if (left !== right) {
			return left < right ? -1 : 1;
		}
		return 0;
	}
	// Numeric local segments sort after alphanumeric ones.
	if (leftNum) {
		return 1;
	}
	if (rightNum) {
		return -1;
	}
	if (left !== right) {
		return left < right ? -1 : 1;
	}
	return 0;
}

function compareLocal(
	left: Array<number | string> | null,
	right: Array<number | string> | null,
): number {
	if (left === null && right === null) {
		return 0;
	}
	if (left === null) {
		return -1;
	}
	if (right === null) {
		return 1;
	}
	const length = Math.max(left.length, right.length);
	for (let i = 0; i < length; i++) {
		if (i >= left.length) {
			return -1;
		}
		if (i >= right.length) {
			return 1;
		}
		const cmp = compareLocalPart(left[i], right[i]);
		if (cmp !== 0) {
			return cmp;
		}
	}
	return 0;
}

export function compareParsed(
	left: Pep440Version,
	right: Pep440Version,
): number {
	if (left.epoch !== right.epoch) {
		return left.epoch < right.epoch ? -1 : 1;
	}

	const leftRelease = stripTrailingZeros(left.release);
	const rightRelease = stripTrailingZeros(right.release);
	const length = Math.max(leftRelease.length, rightRelease.length);
	for (let i = 0; i < length; i++) {
		const leftPart = leftRelease[i] ?? 0;
		const rightPart = rightRelease[i] ?? 0;
		if (leftPart !== rightPart) {
			return leftPart < rightPart ? -1 : 1;
		}
	}

	const pre = comparePair(preKey(left), preKey(right));
	if (pre !== 0) {
		return pre;
	}

	const leftPost = left.post === null ? NEG : left.post;
	const rightPost = right.post === null ? NEG : right.post;
	if (leftPost !== rightPost) {
		return leftPost < rightPost ? -1 : 1;
	}

	const leftDev = left.dev === null ? POS : left.dev;
	const rightDev = right.dev === null ? POS : right.dev;
	if (leftDev !== rightDev) {
		return leftDev < rightDev ? -1 : 1;
	}

	return compareLocal(left.local, right.local);
}

function compareFallback(left: string, right: string): number {
	if (left === right) {
		return 0;
	}
	return left < right ? -1 : 1;
}

/** PEP 440 ordering. Unparsed strings sort before any real version. */
export function comparePep440(left: string, right: string): number {
	const parsedLeft = parsePep440(left);
	const parsedRight = parsePep440(right);
	if (!parsedLeft || !parsedRight) {
		if (!parsedLeft && !parsedRight) {
			return compareFallback(left, right);
		}
		return parsedLeft ? 1 : -1;
	}
	return compareParsed(parsedLeft, parsedRight);
}

/**
 * Equality for `==` / `!=`. A specifier without a local version ignores the
 * candidate's local version (`==1.0` matches `1.0+cpu`); one that includes a
 * local version compares it.
 */
export function pep440SpecifierEqual(
	version: string,
	specVersion: string,
): boolean {
	const parsedVersion = parsePep440(version);
	const parsedSpec = parsePep440(specVersion);
	if (!parsedVersion || !parsedSpec) {
		return version.trim() === specVersion.trim();
	}
	if (parsedSpec.local === null) {
		return (
			compareParsed(
				{ ...parsedVersion, local: null },
				{ ...parsedSpec, local: null },
			) === 0
		);
	}
	return compareParsed(parsedVersion, parsedSpec) === 0;
}

/** Release numbers padded to at least three segments, for risk analysis. */
export function releaseNumbers(version: string): number[] {
	const parsed = parsePep440(version);
	const parts = parsed ? parsed.release.slice() : [0];
	while (parts.length < 3) {
		parts.push(0);
	}
	return parts;
}
