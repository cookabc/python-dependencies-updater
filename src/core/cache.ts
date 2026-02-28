/**
 * Cache Manager for PyPI version data
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
 */

import * as vscode from 'vscode';
import type { PackageVersions, CacheEntry } from '../types';

export class CacheManager {
    private cache: Map<string, CacheEntry<PackageVersions>> = new Map();
    private memento?: vscode.Memento;
    private readonly STORAGE_KEY = 'py-deps-updater-cache';
    private saveTimeout: ReturnType<typeof setTimeout> | undefined;
    
    constructor(memento?: vscode.Memento) {
        this.memento = memento;
        this.loadFromStorage();
    }

    private loadFromStorage(): void {
        if (!this.memento) {return;}
        const stored = this.memento.get<Record<string, CacheEntry<PackageVersions>>>(this.STORAGE_KEY);
        if (stored) {
            for (const [key, entry] of Object.entries(stored)) {
                this.cache.set(key, entry);
            }
        }
    }

    private saveToStorage(): void {
        if (!this.memento) {return;}
        const storageObj: Record<string, CacheEntry<PackageVersions>> = {};
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

    /**
     * Get cached data for a package
     * Returns null if not found or expired
     */
    get(key: string, ttlMinutes: number = 60): PackageVersions | null {
        const entry = this.cache.get(key.toLowerCase());
        
        if (!entry) {
            return null;
        }
        
        if (this.isExpired(entry, ttlMinutes)) {
            this.cache.delete(key.toLowerCase());
            this.debouncedSave();
            return null;
        }
        
        return entry.data;
    }
    
    /**
     * Store package version data in cache
     */
    set(key: string, data: PackageVersions): void {
        this.cache.set(key.toLowerCase(), {
            data,
            timestamp: Date.now()
        });
        this.debouncedSave();
    }
    
    /**
     * Check if a cache entry has expired
     */
    isExpired(entry: CacheEntry<PackageVersions>, ttlMinutes: number): boolean {
        const ttlMs = ttlMinutes * 60 * 1000;
        return Date.now() - entry.timestamp > ttlMs;
    }
    
    /**
     * Clear all cached data
     */
    clear(): void {
        this.cache.clear();
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = undefined;
        }
        if (this.memento) {
            this.memento.update(this.STORAGE_KEY, undefined);
        }
    }
    
    /**
     * Get the number of cached entries
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * Initialize with memento for persistence
     */
    public setMemento(memento: vscode.Memento): void {
        this.memento = memento;
        this.loadFromStorage();
    }
}

// Singleton instance
export const cacheManager = new CacheManager();
