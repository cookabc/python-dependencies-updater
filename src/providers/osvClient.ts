/**
 * OSV.dev client for known-vulnerability lookups.
 *
 * Only exact pins are queried. A range like `>=2.0` does not say what is
 * actually installed, and asking OSV about the lower bound would report
 * vulnerabilities for a version the user may not run.
 */

import { normalizePackageName } from "../core/packageName";
import { Logger } from "../utils/logger";

const DEFAULT_OSV_BASE = "https://api.osv.dev";
const TIMEOUT_MS = 10000;
const MAX_BATCH = 1000;

/**
 * Base URL for OSV. The UAT suite points this at a local stub so the
 * vulnerability path runs in a real editor without reaching the network; a
 * proxy deployment can use it for the same reason.
 */
function osvBase(): string {
	return (process.env.PYDEPS_OSV_BASE || DEFAULT_OSV_BASE).replace(/\/+$/, "");
}

export interface OsvQuery {
	packageName: string;
	version: string;
}

export interface OsvVulnerability {
	id: string;
	summary?: string;
	/** Severity from `database_specific`, e.g. "HIGH". Absent when unknown. */
	severity?: string;
	aliases: string[];
}

/** Stable key for matching a result back to the dependency it came from. */
export function osvKey(packageName: string, version: string): string {
	return `${normalizePackageName(packageName)}@${version}`;
}

interface BatchResponse {
	results?: Array<{ vulns?: Array<{ id: string }> } | undefined>;
}

/** One advisory, as returned by `GET /v1/vulns/{id}`. */
interface VulnerabilityDetail {
	id?: string;
	summary?: string;
	aliases?: string[];
	database_specific?: { severity?: string };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			method: "POST",
			signal: controller.signal,
			headers: {
				"Content-Type": "application/json",
				"User-Agent": "VSCode-Python-Dependencies-Updater",
			},
			body: JSON.stringify(body),
		});
		if (!response.ok) {
			throw new Error(`OSV request failed with status ${response.status}`);
		}
		return (await response.json()) as T;
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * Vulnerability ids per queried pin. Packages with no known vulnerabilities
 * are absent from the map, so `map.get(key)` being undefined means "clean or
 * unknown" — callers treat both as no warning.
 */
export async function queryVulnerabilities(
	queries: OsvQuery[],
): Promise<Map<string, string[]>> {
	const found = new Map<string, string[]>();
	if (queries.length === 0) {
		return found;
	}

	for (let i = 0; i < queries.length; i += MAX_BATCH) {
		const chunk = queries.slice(i, i + MAX_BATCH);
		let data: BatchResponse;
		try {
			data = await postJson<BatchResponse>(`${osvBase()}/v1/querybatch`, {
				queries: chunk.map((query) => ({
					package: {
						name: normalizePackageName(query.packageName),
						ecosystem: "PyPI",
					},
					version: query.version,
				})),
			});
		} catch (error) {
			// A failed lookup must not read as "no vulnerabilities"; the caller
			// keeps whatever it showed before and the next scan retries.
			Logger.error("OSV batch query failed:", error);
			throw error;
		}

		const results = data.results;
		if (
			!Array.isArray(results) ||
			results.length !== chunk.length ||
			results.some(
				(result) => !result || typeof result !== "object" || "error" in result,
			)
		) {
			throw new Error(
				"OSV returned an incomplete response. Retry the vulnerability check.",
			);
		}
		for (let j = 0; j < chunk.length; j++) {
			const vulns = results[j]?.vulns;
			if (!vulns || vulns.length === 0) {
				continue;
			}
			const ids = vulns.map((vuln) => vuln.id).filter(Boolean);
			if (ids.length > 0) {
				found.set(osvKey(chunk[j].packageName, chunk[j].version), ids);
			}
		}
	}

	return found;
}

/**
 * Details for one advisory. Used when the user opens the vulnerability
 * report, so the extra request only happens on demand.
 */
export async function fetchVulnerabilityDetail(
	id: string,
): Promise<OsvVulnerability | null> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const response = await fetch(
			`${osvBase()}/v1/vulns/${encodeURIComponent(id)}`,
			{
				signal: controller.signal,
				headers: { "User-Agent": "VSCode-Python-Dependencies-Updater" },
			},
		);
		if (!response.ok) {
			return null;
		}
		const vuln = (await response.json()) as VulnerabilityDetail;
		if (!vuln?.id) {
			return null;
		}
		return {
			id: vuln.id,
			summary: vuln.summary,
			severity: vuln.database_specific?.severity,
			aliases: vuln.aliases ?? [],
		};
	} catch (error) {
		Logger.error(`Failed to fetch OSV detail for ${id}:`, error);
		return null;
	} finally {
		clearTimeout(timeoutId);
	}
}
