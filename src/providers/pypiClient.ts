/**
 * PyPI API Client
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

import type { PyPIClientResult } from "../types";
import { Logger } from "../utils/logger";

interface PyPIResponse {
	info?: { summary?: string };
	releases: Record<string, unknown[]>;
}

// Concurrency limiter
const MAX_CONCURRENT_REQUESTS = 5;
const TIMEOUT_MS = 10000;
const DEFAULT_REGISTRY = "https://pypi.org";
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

async function makeRequest(url: string, token?: string): Promise<PyPIResponse> {
	await enqueue();
	try {
		return await doMakeRequest(url, token);
	} finally {
		dequeue();
	}
}

async function doMakeRequest(
	url: string,
	token?: string,
): Promise<PyPIResponse> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const headers: Record<string, string> = {
			Accept: "application/json",
			"User-Agent": "VSCode-Python-Dependencies-Updater",
		};
		// Private mirrors (Artifactory, devpi, GitLab) authenticate with a
		// bearer token; the public index ignores one if configured by mistake.
		if (token) {
			headers.Authorization = `Bearer ${token}`;
		}

		const response = await fetch(url, {
			signal: controller.signal,
			headers,
		});

		if (response.status === 404) {
			throw new Error("404");
		}

		if (!response.ok) {
			throw new Error(`Request failed with status ${response.status}`);
		}

		return (await response.json()) as PyPIResponse;
	} catch (e: any) {
		if (e.name === "AbortError") {
			throw new Error("Timeout");
		}
		throw e;
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * Pick installable versions from a PyPI JSON "releases" map.
 * Drops releases with no files and releases where every file is yanked —
 * neither can be installed, so they must never be suggested as updates.
 */
export function filterInstallableVersions(
	releases: Record<string, unknown[]>,
): string[] {
	return Object.entries(releases)
		.filter(([, files]) => {
			if (!Array.isArray(files)) {
				return false;
			}
			return files.some(
				(file) =>
					file && typeof file === "object" && (file as any).yanked !== true,
			);
		})
		.map(([version]) => version);
}

/**
 * Fetch version data from PyPI for a package
 */
export async function fetchVersions(
	packageName: string,
	registryUrl?: string,
	token?: string,
): Promise<PyPIClientResult> {
	Logger.log(`fetchVersions called for ${packageName}`);

	try {
		const baseUrl = (registryUrl || DEFAULT_REGISTRY).replace(/\/+$/, "");
		const url = `${baseUrl}/pypi/${encodeURIComponent(packageName)}/json`;

		const data = await makeRequest(url, token);

		if (!data.releases || typeof data.releases !== "object") {
			Logger.error(`Invalid data structure for ${packageName}`);
			return { success: false, error: "parse-error" };
		}

		const versions = filterInstallableVersions(data.releases);
		Logger.log(`Success ${packageName}: ${versions.length} versions found`);

		return {
			success: true,
			data: {
				packageName,
				versions,
				summary: data.info?.summary || undefined,
				fetchedAt: Date.now(),
			},
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		if (msg === "404") {
			return { success: false, error: "not-found" };
		}
		if (
			msg === "Timeout" ||
			(error instanceof Error && (error as any).code === "ETIMEDOUT")
		) {
			return { success: false, error: "network-error" };
		}
		Logger.error(`Final catch error for ${packageName}:`, error);
		return { success: false, error: "network-error" };
	}
}
