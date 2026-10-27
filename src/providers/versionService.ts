/**
 * Version Service - coordinates cache, PyPI client, and version resolver
 * Validates: Requirements 4.1, 4.2, 6.2, 6.3
 */

import { cacheManager } from "../core/cache";
import { versionCacheKey } from "../core/packageName";
import { resolveLatest } from "../core/versionResolver";
import type { PackageVersions, VersionInfo } from "../types";
import { Logger } from "../utils/logger";
import { fetchVersions } from "./pypiClient";

/**
 * Cache key includes the registry so that switching registries cannot serve
 * data fetched from the previous one, and the package name is PEP 503
 * normalized so `foo_bar` and `foo-bar` share one entry.
 */
function cacheKey(packageName: string, registryUrl?: string): string {
	return versionCacheKey(packageName, registryUrl);
}

/**
 * Fetch (or take from cache) the raw version list of a package.
 * Resolution against a specifier happens separately per dependency, so that
 * two dependencies on the same package with different specifiers share one
 * network fetch.
 */
export async function getPackageVersions(
	packageName: string,
	cacheTTLMinutes: number = 60,
	registryUrl?: string,
): Promise<PackageVersions> {
	const key = cacheKey(packageName, registryUrl);
	const cached = cacheManager.get(key, cacheTTLMinutes);
	if (cached) {
		return cached;
	}

	Logger.log(`Fetching PyPI versions for ${packageName}`);
	const result = await fetchVersions(packageName, registryUrl);

	if (!result.success || !result.data) {
		throw Object.assign(new Error(result.error ?? "fetch-error"), {
			fetchError: result.error ?? "fetch-error",
		});
	}

	cacheManager.set(key, result.data);
	return result.data;
}

/**
 * Get the latest compatible version for a package
 */
export async function getLatestCompatible(
	packageName: string,
	specifier: string,
	includePrerelease: boolean = false,
	cacheTTLMinutes: number = 60,
	registryUrl?: string,
): Promise<VersionInfo> {
	try {
		const packageVersions = await getPackageVersions(
			packageName,
			cacheTTLMinutes,
			registryUrl,
		);

		const resolved = resolveLatest(
			packageVersions.versions,
			specifier,
			includePrerelease,
		);

		if (!resolved.found) {
			return {
				packageName,
				latestCompatible: null,
				error: "no-compatible-version",
			};
		}

		return {
			packageName,
			latestCompatible: resolved.version!,
			summary: packageVersions.summary,
		};
	} catch (e: any) {
		const fetchError = e?.fetchError;
		if (fetchError === "not-found") {
			Logger.error(`Package ${packageName} not found on PyPI`);
			return { packageName, latestCompatible: null, error: "not-found" };
		}
		Logger.error(
			`Failed to fetch versions for ${packageName}: ${fetchError ?? e}`,
		);
		return { packageName, latestCompatible: null, error: "fetch-error" };
	}
}
