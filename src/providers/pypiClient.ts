/**
 * PyPI API Client
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

import type { PackageVersions, PyPIClientResult } from '../types';

interface PyPIResponse {
    info?: { summary?: string };
    releases: Record<string, unknown[]>;
}

// Concurrency limiter
class ConcurrencyLimiter {
    private running = 0;
    private queue: Array<() => void> = [];
    
    constructor(private maxConcurrent: number) {}
    
    async acquire(): Promise<void> {
        if (this.running < this.maxConcurrent) {
            this.running++;
            return;
        }
        
        return new Promise<void>(resolve => {
            this.queue.push(resolve);
        });
    }
    
    release(): void {
        this.running--;
        const next = this.queue.shift();
        if (next) {
            this.running++;
            next();
        }
    }
}

const limiter = new ConcurrencyLimiter(5);
const TIMEOUT_MS = 10000;

const DEFAULT_REGISTRY = 'https://pypi.org';

/**
 * Fetch version data from PyPI for a package
 */
export async function fetchVersions(packageName: string, registryUrl?: string): Promise<PyPIClientResult> {
    await limiter.acquire();
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        
        const baseUrl = (registryUrl || DEFAULT_REGISTRY).replace(/\/+$/, '');
        const url = `${baseUrl}/pypi/${encodeURIComponent(packageName)}/json`;
        
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'Accept': 'application/json'
            }
        });
        
        clearTimeout(timeoutId);
        
        if (response.status === 404) {
            return { success: false, error: 'not-found' };
        }
        
        if (!response.ok) {
            return { success: false, error: 'network-error' };
        }
        
        const data = await response.json() as PyPIResponse;
        
        if (!data.releases || typeof data.releases !== 'object') {
            return { success: false, error: 'parse-error' };
        }
        
        const versions = Object.keys(data.releases);
        
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
        if (error instanceof Error && error.name === 'AbortError') {
            return { success: false, error: 'network-error' };
        }
        return { success: false, error: 'network-error' };
    } finally {
        limiter.release();
    }
}
