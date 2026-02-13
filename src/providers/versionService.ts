/**
 * Version Service - coordinates cache, PyPI client, and version resolver
 * Validates: Requirements 4.1, 4.2, 6.2, 6.3
 */

import { cacheManager } from '../core/cache';
import { fetchVersions } from './pypiClient';
import { resolve } from '../core/versionResolver';
import type { VersionInfo } from '../types';
import { Logger } from '../utils/logger';

/**
 * Get the latest compatible version for a package
 */
export async function getLatestCompatible(
    packageName: string,
    specifier: string,
    includePrerelease: boolean = false,
    cacheTTLMinutes: number = 60,
    registryUrl?: string
): Promise<VersionInfo> {
    // Check cache first
    let packageVersions = cacheManager.get(packageName, cacheTTLMinutes);
    
    // Fetch from PyPI if not cached
    if (!packageVersions) {
        Logger.log(`Fetching PyPI versions for ${packageName}`);
        const result = await fetchVersions(packageName, registryUrl);
        
        if (!result.success) {
            if (result.error === 'not-found') {
                Logger.error(`Package ${packageName} not found on PyPI`);
                return { packageName, latestCompatible: null, error: 'not-found' };
            }
            Logger.error(`Failed to fetch versions for ${packageName}: ${result.error}`);
            return { packageName, latestCompatible: null, error: 'fetch-error' };
        }
        
        packageVersions = result.data!;
        cacheManager.set(packageName, packageVersions);
    }
    
    // Resolve the latest compatible version
    const resolved = resolve(packageVersions.versions, specifier, includePrerelease);
    
    if (!resolved.found) {
        return { packageName, latestCompatible: null, error: 'no-compatible-version' };
    }
    
    return {
        packageName,
        latestCompatible: resolved.version!,
        summary: packageVersions.summary
    };
}
