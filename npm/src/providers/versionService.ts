import { type IMemento, PackageCache } from "../core/cache";
import {
	DEFAULT_REGISTRY,
	normalizeRegistryUrl,
	registryForPackage,
	tokenSecretKey,
	versionCacheKey,
} from "../core/registryConfig";
import type { PackageDetails, PackageVersionInfo } from "../types";
import { Logger } from "../utils/logger";
import { NpmClient } from "./npmClient";

/** How long a failed fetch suppresses new attempts */
const FAILURE_TTL_MS = 5 * 60 * 1000;
/** How long hover enrichment stays cached (success or failure) */
const DETAILS_TTL_MS = 5 * 60 * 1000;

interface FailureEntry {
	message: string;
	timestamp: number;
}

interface DetailsEntry {
	data: PackageDetails | null;
	timestamp: number;
}

/** The subset of VS Code SecretStorage this service needs. */
export interface RegistrySecretStore {
	get(key: string): Thenable<string | undefined>;
}

export interface VersionServiceOptions {
	scopedRegistries?: ReadonlyMap<string, string>;
	secrets?: RegistrySecretStore;
	requestTimeoutMs?: number;
}

export class VersionService {
	private cache: PackageCache;
	private showPrerelease: boolean;
	private defaultRegistry: string | null;
	private scopedRegistries: Map<string, string>;
	private secrets?: RegistrySecretStore;
	private readonly requestTimeoutMs: number;
	private clients: Map<string, NpmClient> = new Map();
	// Negative cache, keyed like the version cache (registry + pre-release +
	// name) so a failure on one registry does not suppress another.
	private failures: Map<string, FailureEntry> = new Map();
	private details: Map<string, DetailsEntry> = new Map();

	constructor(
		cacheTTLMinutes = 60,
		registryUrl?: string,
		memento?: IMemento,
		showPrerelease = false,
		options?: VersionServiceOptions,
	) {
		this.cache = new PackageCache(cacheTTLMinutes, memento);
		this.showPrerelease = showPrerelease;
		this.defaultRegistry =
			registryUrl === undefined
				? DEFAULT_REGISTRY
				: normalizeRegistryUrl(registryUrl);
		this.scopedRegistries = new Map(options?.scopedRegistries ?? []);
		this.secrets = options?.secrets;
		this.requestTimeoutMs = options?.requestTimeoutMs ?? 10_000;
	}

	/** Registry that will be queried for this package, or null when none is usable. */
	public registryFor(packageName: string): string | null {
		return registryForPackage(
			packageName,
			this.defaultRegistry,
			this.scopedRegistries,
		);
	}

	public setScopedRegistries(scopes: ReadonlyMap<string, string>): void {
		this.scopedRegistries = new Map(scopes);
		this.clients.clear();
	}

	public setSecrets(secrets: RegistrySecretStore): void {
		this.secrets = secrets;
		this.clients.clear();
	}

	/** Drop cached clients and failures after a token is saved or removed. */
	public invalidateCredentials(): void {
		this.clients.clear();
		this.failures.clear();
	}

	public getCachedPackageInfo(
		packageName: string,
	): PackageVersionInfo | undefined {
		const key = this.cacheKeyFor(packageName);
		if (!key) {
			return undefined;
		}
		return this.cache.get(key);
	}

	/** Error message if the package failed to fetch recently, else undefined */
	public getFailure(packageName: string): string | undefined {
		const key = this.failureKey(packageName);
		const entry = this.failures.get(key);
		if (!entry) {
			return undefined;
		}
		if (Date.now() - entry.timestamp > FAILURE_TTL_MS) {
			this.failures.delete(key);
			return undefined;
		}
		return entry.message;
	}

	public clearFailure(packageName: string): void {
		this.failures.delete(this.failureKey(packageName));
	}

	public async getPackageInfo(
		packageName: string,
	): Promise<PackageVersionInfo | null> {
		const key = this.cacheKeyFor(packageName);
		if (!key) {
			this.rememberFailure(packageName, "Invalid registry URL");
			return null;
		}

		const cached = this.cache.get(key);
		if (cached) {
			this.failures.delete(key);
			return cached;
		}
		if (this.getFailure(packageName)) {
			return null;
		}

		const registry = this.registryFor(packageName);
		const client = registry ? await this.clientFor(registry) : null;
		if (!registry || !client) {
			this.rememberFailure(packageName, "Invalid registry URL");
			return null;
		}

		Logger.log(`Fetching info for ${packageName}`);
		const result = await client.fetchPackageInfo(
			packageName,
			this.showPrerelease,
		);
		if (result.exists && result.package.latestVersion) {
			this.cache.set(key, result.package);
			this.failures.delete(key);
			return result.package;
		}

		if (!result.exists) {
			Logger.error(`Package ${packageName} not found`);
		} else if (result.error) {
			Logger.error(`Error fetching ${packageName}: ${result.error}`);
		}
		this.rememberFailure(packageName, result.error ?? "Unknown error");
		return null;
	}

	/**
	 * Description/homepage for the hover, from the version manifest.
	 * Cached briefly (including misses) so hover is not a request magnet.
	 */
	public async getPackageDetails(
		packageName: string,
		version: string,
	): Promise<PackageDetails | undefined> {
		const base = this.cacheKeyFor(packageName);
		if (!base || !version) {
			return undefined;
		}
		const key = `${base}|ver:${version}`;
		const cached = this.details.get(key);
		if (cached && Date.now() - cached.timestamp < DETAILS_TTL_MS) {
			return cached.data ?? undefined;
		}

		const registry = this.registryFor(packageName);
		const client = registry ? await this.clientFor(registry) : null;
		const data = client
			? await client.fetchPackageDetails(packageName, version)
			: null;
		this.details.set(key, { data: data ?? null, timestamp: Date.now() });
		return data ?? undefined;
	}

	public updateConfiguration(
		ttlMinutes: number,
		registryUrl?: string,
		memento?: IMemento,
		showPrerelease?: boolean,
	) {
		// A new cache reloads globalState. Keys include the registry path and
		// the pre-release flag, so an entry computed for the other mode is
		// not a hit.
		this.cache = new PackageCache(ttlMinutes, memento);
		if (registryUrl !== undefined) {
			this.defaultRegistry = normalizeRegistryUrl(registryUrl);
		}
		if (showPrerelease !== undefined) {
			this.showPrerelease = showPrerelease;
		}
		this.clients.clear();
		this.failures.clear();
		this.details.clear();
	}

	private cacheKeyFor(packageName: string): string | null {
		const registry = this.registryFor(packageName);
		if (!registry) {
			return null;
		}
		return versionCacheKey(registry, packageName, this.showPrerelease);
	}

	private failureKey(packageName: string): string {
		return (
			this.cacheKeyFor(packageName) ??
			`invalid|${this.showPrerelease ? "1" : "0"}|${packageName}`
		);
	}

	private rememberFailure(packageName: string, message: string): void {
		this.failures.set(this.failureKey(packageName), {
			message,
			timestamp: Date.now(),
		});
	}

	private async clientFor(registry: string): Promise<NpmClient | null> {
		const normalized = normalizeRegistryUrl(registry);
		if (!normalized) {
			return null;
		}
		const stored = this.secrets
			? await this.secrets.get(tokenSecretKey(normalized))
			: undefined;
		const token = stored?.trim() || undefined;
		const existing = this.clients.get(normalized);
		if (existing?.hasAuthToken(token)) {
			return existing;
		}
		const client = new NpmClient(normalized, token, this.requestTimeoutMs);
		this.clients.set(normalized, client);
		return client;
	}
}
