import * as semver from "semver";
import {
	DEFAULT_REGISTRY,
	encodeRegistryName,
	normalizeRegistryUrl,
} from "../core/registryConfig";
import type { NpmClientResult, PackageDetails } from "../types";

/** Metadata copied off an abbreviated packument version object. */
export interface RegistryVersionMeta {
	deprecated?: string;
}

interface Packument {
	"dist-tags"?: { latest?: string };
	versions?: Record<string, RegistryVersionMeta | undefined>;
	description?: string;
	homepage?: string;
}

const USER_AGENT = "vscode-npm-dependencies-updater";

/**
 * Highest version in `versions`, optionally including pre-releases.
 * Invalid versions are ignored. Deprecated filtering happens in `selectLatest`,
 * which is what the registry client uses.
 */
export function pickLatest(
	versions: string[],
	includePrerelease: boolean,
): string | null {
	const candidates = versions.filter((version) => {
		if (!semver.valid(version)) {
			return false;
		}
		if (!includePrerelease && semver.prerelease(version)) {
			return false;
		}
		return true;
	});
	if (candidates.length === 0) {
		return null;
	}
	return candidates.sort(semver.rcompare)[0];
}

/**
 * Version to offer as latest.
 * With pre-releases off, `dist-tags.latest` wins even when a higher version
 * was published — that tag is npm's definition of latest. A deprecated tag
 * is skipped. The version scan (pre-releases on, or no usable tag) drops
 * deprecated versions.
 */
export function selectLatest(
	versions: Record<string, RegistryVersionMeta | undefined> | undefined,
	distTagsLatest: string | undefined,
	includePrerelease: boolean,
): string | null {
	const table = versions ?? {};
	if (!includePrerelease && isUsableDistTag(distTagsLatest, table, false)) {
		return distTagsLatest ?? null;
	}
	const names = Object.keys(table).filter(
		(version) => !isDeprecated(table[version]),
	);
	const scanned = pickLatest(names, includePrerelease);
	if (scanned) {
		return scanned;
	}
	if (isUsableDistTag(distTagsLatest, table, includePrerelease)) {
		return distTagsLatest ?? null;
	}
	return null;
}

/** Abbreviated packument (`Accept: application/vnd.npm.install-v1+json`). */
export function packumentUrl(registryUrl: string, packageName: string): string {
	return `${registryUrl}/${encodeRegistryName(packageName)}`;
}

/**
 * One version's manifest. Description and homepage live here, and the
 * document is far smaller than the full packument.
 */
export function versionDocumentUrl(
	registryUrl: string,
	packageName: string,
	version: string,
): string {
	return `${packumentUrl(registryUrl, packageName)}/${encodeURIComponent(version)}`;
}

/** @deprecated Use `encodeRegistryName`. Kept so existing imports keep working. */
export function registryPath(packageName: string): string {
	return encodeRegistryName(packageName);
}

export class NpmClient {
	private readonly registryUrl: string | null;
	private readonly authToken: string | undefined;
	private readonly timeoutMs: number;
	private activeRequests = 0;
	private requestQueue: (() => void)[] = [];
	private readonly MAX_CONCURRENT_REQUESTS = 5;

	constructor(
		registryUrl: string = DEFAULT_REGISTRY,
		authToken?: string,
		timeoutMs = 10_000,
	) {
		this.registryUrl = normalizeRegistryUrl(registryUrl);
		const token = authToken?.trim();
		this.authToken = token ? token : undefined;
		this.timeoutMs = timeoutMs;
	}

	public hasAuthToken(token: string | undefined): boolean {
		const trimmed = token?.trim();
		return this.authToken === (trimmed ? trimmed : undefined);
	}

	public async fetchPackageInfo(
		packageName: string,
		includePrerelease = false,
	): Promise<NpmClientResult> {
		if (!this.registryUrl) {
			return missing(packageName, "Invalid registry URL");
		}
		await this.enqueue();
		try {
			return await this.doFetch(packageName, includePrerelease);
		} finally {
			this.dequeue();
		}
	}

	/**
	 * Description and homepage for one known version. The abbreviated
	 * packument omits both; the version document has them without pulling
	 * every historical version.
	 */
	public async fetchPackageDetails(
		packageName: string,
		version: string,
	): Promise<PackageDetails | null> {
		if (!this.registryUrl || !version) {
			return null;
		}
		const url = versionDocumentUrl(this.registryUrl, packageName, version);
		const result = await this.request(url, "application/json");
		if (result.kind !== "json") {
			return null;
		}
		return {
			description: result.json.description,
			homepage: result.json.homepage,
		};
	}

	private enqueue(): Promise<void> {
		if (this.activeRequests < this.MAX_CONCURRENT_REQUESTS) {
			this.activeRequests++;
			return Promise.resolve();
		}
		return new Promise((resolve) => {
			this.requestQueue.push(resolve);
		});
	}

	private dequeue(): void {
		this.activeRequests--;
		const next = this.requestQueue.shift();
		if (next) {
			this.activeRequests++;
			next();
		}
	}

	private async doFetch(
		packageName: string,
		includePrerelease: boolean,
	): Promise<NpmClientResult> {
		const url = packumentUrl(this.registryUrl as string, packageName);
		const result = await this.request(
			url,
			"application/vnd.npm.install-v1+json",
		);
		if (result.kind === "error") {
			return missing(packageName, result.error);
		}
		if (result.kind === "status") {
			if (result.status === 404) {
				return missing(packageName, "Package not found");
			}
			return missing(packageName, `Registry returned ${result.status}`);
		}

		const latestVersion = selectLatest(
			result.json.versions,
			result.json["dist-tags"]?.latest,
			includePrerelease,
		);
		if (!latestVersion) {
			return {
				package: { name: packageName, latestVersion: "" },
				exists: true,
				error: "No latest version found",
			};
		}
		return {
			package: {
				name: packageName,
				latestVersion,
				summary: result.json.description,
				homepage: result.json.homepage,
			},
			exists: true,
		};
	}

	/**
	 * The abort timer stays armed until the body has been read. Clearing it
	 * when headers arrive lets a slow body hang past the timeout.
	 */
	private async request(
		url: string,
		accept: string,
	): Promise<
		| { kind: "json"; json: Packument }
		| { kind: "status"; status: number }
		| { kind: "error"; error: string }
	> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
		try {
			const headers: Record<string, string> = {
				Accept: accept,
				"User-Agent": USER_AGENT,
			};
			if (this.authToken) {
				headers.Authorization = `Bearer ${this.authToken}`;
			}
			const response = await fetch(url, {
				signal: controller.signal,
				headers,
			});
			if (!response.ok) {
				return { kind: "status", status: response.status };
			}
			const json = (await response.json()) as Packument;
			return { kind: "json", json };
		} catch (e: unknown) {
			const name = e instanceof Error ? e.name : "";
			const message = e instanceof Error ? e.message : String(e);
			return {
				kind: "error",
				error: name === "AbortError" ? "Request timed out" : message,
			};
		} finally {
			clearTimeout(timeoutId);
		}
	}
}

function missing(packageName: string, error: string): NpmClientResult {
	return {
		package: { name: packageName, latestVersion: "" },
		exists: false,
		error,
	};
}

function isDeprecated(meta: RegistryVersionMeta | undefined): boolean {
	return typeof meta?.deprecated === "string" && meta.deprecated.length > 0;
}

function isUsableDistTag(
	version: string | undefined,
	table: Record<string, RegistryVersionMeta | undefined>,
	allowPrerelease: boolean,
): boolean {
	if (!version || !semver.valid(version)) {
		return false;
	}
	if (!allowPrerelease && semver.prerelease(version)) {
		return false;
	}
	return !isDeprecated(table[version]);
}
