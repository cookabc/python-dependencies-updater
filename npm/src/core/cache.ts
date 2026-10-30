import type { PackageVersionInfo } from "../types";

export interface IMemento {
	get<T>(key: string): T | undefined;
	get<T>(key: string, defaultValue: T): T;
	update(key: string, value: any): PromiseLike<void>;
}

interface CacheEntry {
	data: PackageVersionInfo;
	timestamp: number;
}

export const PACKAGE_CACHE_STORAGE_KEY = "npm-deps-updater-cache";

export class PackageCache {
	private cache: Map<string, CacheEntry> = new Map();
	private ttl: number = 60 * 60 * 1000; // 60 minutes default
	private memento?: IMemento;
	private readonly STORAGE_KEY = PACKAGE_CACHE_STORAGE_KEY;
	private saveTimeout: ReturnType<typeof setTimeout> | undefined;

	constructor(ttlMinutes: number = 60, memento?: IMemento) {
		this.ttl = ttlMinutes * 60 * 1000;
		this.memento = memento;
		this.loadFromStorage();
	}

	private loadFromStorage(): void {
		if (!this.memento) return;

		const stored = this.memento.get<Record<string, CacheEntry>>(
			this.STORAGE_KEY,
		);
		if (stored) {
			// Restore from storage, filter out expired entries
			const now = Date.now();
			for (const [key, entry] of Object.entries(stored)) {
				if (now - entry.timestamp < this.ttl) {
					this.cache.set(key, entry);
				}
			}
		}
	}

	private saveToStorage(): void {
		if (!this.memento) return;

		const storageObj: Record<string, CacheEntry> = {};
		this.cache.forEach((value, key) => {
			storageObj[key] = value;
		});
		this.memento.update(this.STORAGE_KEY, storageObj);
	}

	private debouncedSave(): void {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}

		this.saveTimeout = setTimeout(() => {
			this.saveToStorage();
			this.saveTimeout = undefined;
		}, 1000);
	}

	public get(packageName: string): PackageVersionInfo | undefined {
		const entry = this.cache.get(packageName);
		if (!entry) {
			return undefined;
		}

		if (Date.now() - entry.timestamp > this.ttl) {
			this.cache.delete(packageName);
			this.debouncedSave();
			return undefined;
		}

		return entry.data;
	}

	public set(packageName: string, data: PackageVersionInfo): void {
		this.cache.set(packageName, {
			data,
			timestamp: Date.now(),
		});
		this.debouncedSave();
	}

	public clear(): void {
		this.cache.clear();
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
			this.saveTimeout = undefined;
		}
		if (this.memento) {
			this.memento.update(this.STORAGE_KEY, undefined);
		}
	}
}
