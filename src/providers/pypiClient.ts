/**
 * PyPI API Client
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

import type { PackageVersions, PyPIClientResult } from '../types';
import { Logger } from '../utils/logger';

interface PyPIResponse {
    info?: { summary?: string };
    releases: Record<string, unknown[]>;
}

// Concurrency limiter
const MAX_CONCURRENT_REQUESTS = 5;
const TIMEOUT_MS = 10000;
const DEFAULT_REGISTRY = 'https://pypi.org';
let activeRequests = 0;
const requestQueue: (() => void)[] = [];

async function enqueue(): Promise<void> {
    if (activeRequests < MAX_CONCURRENT_REQUESTS) {
        activeRequests++;
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        requestQueue.push(resolve);
    });
}

function dequeue(): void {
    activeRequests--;
    const next = requestQueue.shift();
    if (next) {
        activeRequests++;
        next();
    }
}

async function makeRequest(url: string): Promise<PyPIResponse> {
    await enqueue();
    try {
        return await doMakeRequest(url);
    } finally {
        dequeue();
    }
}

async function doMakeRequest(url: string): Promise<PyPIResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'VSCode-Python-Dependencies-Updater'
            }
        });

        if (response.status === 404) {
            throw new Error('404');
        }

        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        return await response.json() as PyPIResponse;
    } catch (e: any) {
        if (e.name === 'AbortError') {
            throw new Error('Timeout');
        }
        throw e;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Fetch version data from PyPI for a package
 */
export async function fetchVersions(packageName: string, registryUrl?: string): Promise<PyPIClientResult> {
    Logger.log(`fetchVersions called for ${packageName}`);

    try {
        const baseUrl = (registryUrl || DEFAULT_REGISTRY).replace(/\/+$/, '');
        const url = `${baseUrl}/pypi/${encodeURIComponent(packageName)}/json`;

        const data = await makeRequest(url);

        if (!data.releases || typeof data.releases !== 'object') {
            Logger.error(`Invalid data structure for ${packageName}`);
            return { success: false, error: 'parse-error' };
        }

        const versions = Object.keys(data.releases);
        Logger.log(`Success ${packageName}: ${versions.length} versions found`);

        return {
            success: true,
            data: {
                packageName,
                versions,
                summary: data.info?.summary || undefined,
                fetchedAt: Date.now()
            }
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg === '404') {
            return { success: false, error: 'not-found' };
        }
        if (msg === 'Timeout' || (error instanceof Error && (error as any).code === 'ETIMEDOUT')) {
            return { success: false, error: 'network-error' };
        }
        Logger.error(`Final catch error for ${packageName}:`, error);
        return { success: false, error: 'network-error' };
    }
}
