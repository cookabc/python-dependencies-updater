import * as assert from "assert";
import { type IMemento, PackageCache } from "../../core/cache";
import type { PackageVersionInfo } from "../../types";

class MockMemento implements IMemento {
	private storage = new Map<string, any>();
	public updateCalls = 0;

	get<T>(key: string): T | undefined;
	get<T>(key: string, defaultValue: T): T;
	get(key: string, defaultValue?: any) {
		return this.storage.get(key) ?? defaultValue;
	}

	update(key: string, value: any): PromiseLike<void> {
		this.updateCalls++;
		this.storage.set(key, value);
		return Promise.resolve();
	}
}

describe("PackageCache", function () {
	// Increase timeout for this suite as we might wait for debounce
	this.timeout(5000);

	it("should debounce saveToStorage calls", async () => {
		const memento = new MockMemento();
		const cache = new PackageCache(60, memento);

		const data: PackageVersionInfo = {
			name: "test-pkg",
			latestVersion: "1.0.0",
		};

		// Call set multiple times quickly
		cache.set("pkg1", data);
		cache.set("pkg2", data);
		cache.set("pkg3", data);

		// Allow some time for debounce to potentially fire (or not)
		await new Promise((resolve) => setTimeout(resolve, 1500));

		// We expect exactly 1 update call (the final state)
		// In the unoptimized version, this will be 3 (one for each set)
		assert.strictEqual(
			memento.updateCalls,
			1,
			`Expected 1 update call, but got ${memento.updateCalls}`,
		);
	});
});
