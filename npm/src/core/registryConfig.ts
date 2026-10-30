import * as fs from "node:fs";
import * as path from "node:path";

/** Public npm registry used when the user has not configured another. */
export const DEFAULT_REGISTRY = "https://registry.npmjs.org";

/**
 * SecretStorage key for a bearer token. The registry URL is normalized so the
 * same registry never gets two keys because of a trailing slash.
 */
export function tokenSecretKey(registryUrl: string): string {
	return `npmDeps.token.${encodeURIComponent(registryUrl)}`;
}

/**
 * Accept only http(s) registry URLs. Anything else (empty, `javascript:`,
 * `file:`, a bare host) is rejected so a bad setting cannot be fetched and
 * cannot fall through to the public registry.
 * Userinfo is dropped; tokens belong in SecretStorage, not the URL.
 */
export function normalizeRegistryUrl(
	input: string | undefined | null,
): string | null {
	if (!input) {
		return null;
	}
	const trimmed = input.trim();
	if (!trimmed) {
		return null;
	}
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return null;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		return null;
	}
	if (!url.hostname) {
		return null;
	}
	url.username = "";
	url.password = "";
	const pathname = url.pathname.replace(/\/+$/, "");
	return `${url.origin}${pathname}`;
}

/** `@scope` of a scoped package name, or null for an unscoped name. */
export function scopeOf(packageName: string): string | null {
	const match = /^(@[^/]+)\/.+$/.exec(packageName);
	return match ? match[1].toLowerCase() : null;
}

/**
 * Registry that should serve `packageName`. A scope entry wins over the
 * default. A null default means "do not fetch" — never the public registry.
 */
export function registryForPackage(
	packageName: string,
	defaultRegistry: string | null,
	scopedRegistries: ReadonlyMap<string, string>,
): string | null {
	const scope = scopeOf(packageName);
	if (scope) {
		const scoped = scopedRegistries.get(scope);
		if (scoped) {
			return scoped;
		}
	}
	return defaultRegistry;
}

/**
 * Cache identity for one registry. Path is included so two registries on the
 * same host (`/npm-a` and `/npm-b`) do not share entries. The pre-release
 * flag is included so toggling it cannot reuse a previously computed latest.
 */
export function versionCacheKey(
	registryUrl: string,
	packageName: string,
	showPrerelease: boolean,
): string {
	const registry = normalizeRegistryUrl(registryUrl) ?? registryUrl;
	return `${registry}|prerelease=${showPrerelease ? "1" : "0"}|${packageName}`;
}

/**
 * `@scope:registry=` lines from an npmrc. Comments and every other key,
 * including `:_authToken`, are ignored — tokens are not read from disk.
 */
export function parseNpmrc(text: string): Map<string, string> {
	const scopes = new Map<string, string>();
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#") || line.startsWith(";")) {
			continue;
		}
		const match = /^(@[^:\s]+)\s*:\s*registry\s*=\s*(.+)$/i.exec(line);
		if (!match) {
			continue;
		}
		const url = normalizeRegistryUrl(unquote(match[2]));
		if (!url) {
			continue;
		}
		scopes.set(match[1].toLowerCase(), url);
	}
	return scopes;
}

/**
 * Merge `@scope:registry` entries from npmrc files. Later files win, so pass
 * the user npmrc first and each project npmrc after it.
 */
export function loadScopedRegistries(
	npmrcPaths: string[],
): Map<string, string> {
	const merged = new Map<string, string>();
	for (const file of npmrcPaths) {
		let text: string;
		try {
			text = fs.readFileSync(file, "utf8");
		} catch {
			continue;
		}
		for (const [scope, url] of parseNpmrc(text)) {
			merged.set(scope, url);
		}
	}
	return merged;
}

/** User npmrc, then each workspace root, so a project file overrides the user. */
export function npmrcSearchPaths(
	workspaceRoots: string[],
	homeDir: string,
): string[] {
	return [
		path.join(homeDir, ".npmrc"),
		...workspaceRoots.map((root) => path.join(root, ".npmrc")),
	];
}

/**
 * Page to open for a package. The public registry has a website; every other
 * registry opens its own package document so a private name is not sent to
 * npmjs.com.
 */
export function packageWebUrl(
	registryUrl: string | null | undefined,
	packageName: string,
): string | null {
	// null means the caller already knows the registry is unusable. Falling
	// back to npmjs would publish a private package name.
	if (registryUrl === null) {
		return null;
	}
	const normalized = normalizeRegistryUrl(registryUrl ?? DEFAULT_REGISTRY);
	if (!normalized) {
		return null;
	}
	const host = new URL(normalized).hostname;
	if (host === "registry.npmjs.org" || host === "registry.npmjs.com") {
		return `https://www.npmjs.com/package/${packageName}`;
	}
	return `${normalized}/${encodeRegistryName(packageName)}`;
}

/** Encode the slash in a scoped name and leave `@` intact, per the registry API. */
export function encodeRegistryName(packageName: string): string {
	return packageName.replace("/", "%2F");
}

function unquote(value: string): string {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1).trim();
	}
	return trimmed;
}
