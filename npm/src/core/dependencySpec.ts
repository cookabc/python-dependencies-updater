import * as semver from "semver";

export interface RegistryDependency {
	/** Package name to query on the registry (the alias target for `npm:` specs). */
	registryName: string;
}

/**
 * npm alias: `npm:<name>` or `npm:<name>@<range>`, including scoped names
 * (`npm:@scope/pkg@^1.2.3`). The version may itself contain spaces.
 */
const NPM_ALIAS = /^npm:(@[^@/\s]+\/[^@/\s]+|[^@/\s]+)(?:@([\s\S]+))?$/i;

export function parseNpmAlias(
	spec: string,
): { name: string; version: string | null } | null {
	const match = spec.trim().match(NPM_ALIAS);
	if (!match) {
		return null;
	}
	const version = match[2]?.trim();
	return { name: match[1], version: version ? version : null };
}

/**
 * True when `spec` is not a registry semver range: any URI/protocol
 * (`workspace:`, `file:`, `link:`, `git:`, `github:`, `http(s):`, `git+ssh:`, …),
 * a git host shorthand (`user/repo#ref`), or a dist-tag (`latest`, `next`, …).
 *
 * `npm:` aliases are protocol-shaped but are not decided here — callers strip
 * them with `parseNpmAlias` first. Sending these specs' package names to the
 * public registry leaks private workspace names and can rewrite local paths.
 */
export function isNonRegistrySpec(spec: string): boolean {
	const trimmed = spec.trim();
	if (!trimmed) {
		return true;
	}
	if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
		return true;
	}
	// github/gitlab/bitbucket shorthand without an explicit protocol
	if (/^[^/\s]+\/[^/\s]+/.test(trimmed)) {
		return true;
	}
	try {
		return semver.validRange(trimmed) === null;
	} catch {
		return true;
	}
}

/**
 * Registry target for a dependency, or null when the spec must not be looked
 * up or offered as a one-click upgrade.
 */
export function registryDependency(
	packageName: string,
	spec: string,
): RegistryDependency | null {
	const trimmed = spec.trim();
	if (!trimmed) {
		return null;
	}
	const alias = parseNpmAlias(trimmed);
	if (alias) {
		if (!alias.version || isNonRegistrySpec(alias.version)) {
			return null;
		}
		return { registryName: alias.name };
	}
	if (isNonRegistrySpec(trimmed)) {
		return null;
	}
	return { registryName: packageName };
}

/** Version range inside a spec, with an `npm:` alias prefix removed. */
export function versionRangeOf(spec: string): string | null {
	const trimmed = spec.trim();
	const alias = parseNpmAlias(trimmed);
	const range = (alias ? alias.version : trimmed)?.trim() ?? "";
	if (!range || isNonRegistrySpec(range)) {
		return null;
	}
	return range;
}
