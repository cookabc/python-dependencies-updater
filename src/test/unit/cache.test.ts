import * as assert from "assert";
import { CacheManager } from "../../core/cache";

describe("Cache Manager", () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager();
  });

  it("should store and retrieve data", () => {
    const data = {
      packageName: "flask",
      versions: ["1.0", "2.0"],
      fetchedAt: Date.now(),
    };
    cache.set("flask", data);
    const result = cache.get("flask");
    assert.deepStrictEqual(result, data);
  });

  it("should be case-insensitive", () => {
    const data = {
      packageName: "Flask",
      versions: ["1.0"],
      fetchedAt: Date.now(),
    };
    cache.set("Flask", data);
    assert.ok(cache.get("flask"));
    assert.ok(cache.get("FLASK"));
  });

  it("should return null for missing keys", () => {
    assert.strictEqual(cache.get("nonexistent"), null);
  });

  it("should evict expired entries", () => {
    const data = {
      packageName: "flask",
      versions: ["1.0"],
      fetchedAt: Date.now() - 120 * 60 * 1000,
    };
    cache.set("flask", data);
    // Entry was "fetched" 2 hours ago, but cache.set sets its own timestamp.
    // We need to manipulate the timestamp directly:
    // Instead, test via isExpired
    const entry = { data, timestamp: Date.now() - 120 * 60 * 1000 };
    assert.strictEqual(cache.isExpired(entry, 60), true);
  });

  it("should not evict fresh entries", () => {
    const data = {
      packageName: "flask",
      versions: ["1.0"],
      fetchedAt: Date.now(),
    };
    const entry = { data, timestamp: Date.now() };
    assert.strictEqual(cache.isExpired(entry, 60), false);
  });

  it("should clear all entries", () => {
    cache.set("a", { packageName: "a", versions: [], fetchedAt: Date.now() });
    cache.set("b", { packageName: "b", versions: [], fetchedAt: Date.now() });
    assert.strictEqual(cache.size(), 2);
    cache.clear();
    assert.strictEqual(cache.size(), 0);
  });

  it("should report correct size", () => {
    assert.strictEqual(cache.size(), 0);
    cache.set("flask", {
      packageName: "flask",
      versions: [],
      fetchedAt: Date.now(),
    });
    assert.strictEqual(cache.size(), 1);
  });
});
