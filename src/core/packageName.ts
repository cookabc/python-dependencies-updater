/**
 * Package name normalization shared by the in-memory and persisted caches.
 * PEP 503: lowercase, and collapse every run of `-`, `_`, or `.` to one `-`.
 */

const DEFAULT_REGISTRY = "https://pypi.org";

export function normalizePackageName(name: string): string {
	const base = name.split("[")[0]?.trim() ?? "";
	return base.toLowerCase().replace(/[-_.]+/g, "-");
}

/**
 * Cache key for a package on a registry. `Foo_Bar` and `foo-bar` share one
 * entry; a trailing slash on the registry does not create a second entry.
 */
export function versionCacheKey(
	packageName: string,
	registryUrl?: string,
): string {
	const registry = (registryUrl || DEFAULT_REGISTRY).replace(/\/+$/, "");
	return `metadata-v2|${registry}|${normalizePackageName(packageName)}`;
}
