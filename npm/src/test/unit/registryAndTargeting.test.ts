/**
 * Medium-priority review fixes: dist-tag latest, cache identity, which
 * dependency a lens edits, request timeout / version manifests, private
 * registries, and stable releases after a prerelease range.
 */
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type IMemento, PACKAGE_CACHE_STORAGE_KEY } from "../../core/cache";
import { locateDependencyRange } from "../../core/locateDependency";
import { PackageJsonParser } from "../../core/packageJsonParser";
import {
	loadScopedRegistries,
	normalizeRegistryUrl,
	packageWebUrl,
	parseNpmrc,
	tokenSecretKey,
	versionCacheKey,
} from "../../core/registryConfig";
import { VersionResolver } from "../../core/versionResolver";
import {
	NpmClient,
	type RegistryVersionMeta,
	selectLatest,
	versionDocumentUrl,
} from "../../providers/npmClient";
import { VersionService } from "../../providers/versionService";

class MockMemento implements IMemento {
	private storage = new Map<string, unknown>();

	get<T>(key: string): T | undefined;
	get<T>(key: string, defaultValue: T): T;
	get(key: string, defaultValue?: unknown) {
		return this.storage.get(key) ?? defaultValue;
	}

	update(key: string, value: unknown): PromiseLike<void> {
		this.storage.set(key, value);
		return Promise.resolve();
	}
}

class MemorySecrets {
	readonly values = new Map<string, string>();

	get(key: string): Promise<string | undefined> {
		return Promise.resolve(this.values.get(key));
	}

	store(key: string, value: string): void {
		this.values.set(key, value);
	}
}

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	} as Response;
}

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("Latest version selection", () => {
	const versions: Record<string, RegistryVersionMeta> = {
		"1.0.0": {},
		"1.2.0": {},
		"2.0.0": { deprecated: "use 1.x" },
		"3.0.0-rc.1": {},
		"9.9.9": {},
	};

	it("uses dist-tags.latest when pre-releases are off, not the max version", () => {
		assert.strictEqual(selectLatest(versions, "1.2.0", false), "1.2.0");
	});

	it("skips a deprecated dist-tag and a deprecated version in the scan", () => {
		assert.strictEqual(selectLatest(versions, "2.0.0", false), "9.9.9");
		const onlyDeprecated: Record<string, RegistryVersionMeta> = {
			"1.0.0": { deprecated: "gone" },
			"2.0.0-rc.1": { deprecated: "gone" },
		};
		assert.strictEqual(selectLatest(onlyDeprecated, "1.0.0", true), null);
	});

	it("includes a pre-release only when asked", () => {
		assert.strictEqual(selectLatest(versions, "1.2.0", true), "9.9.9");
		const withPre: Record<string, RegistryVersionMeta> = {
			"1.0.0": {},
			"2.0.0-rc.1": {},
		};
		assert.strictEqual(selectLatest(withPre, "1.0.0", false), "1.0.0");
		assert.strictEqual(selectLatest(withPre, "1.0.0", true), "2.0.0-rc.1");
	});

	it("does not let a deprecated pre-release outrank the stable tag", () => {
		const table: Record<string, RegistryVersionMeta> = {
			"1.0.0": {},
			"3.0.0-rc.1": { deprecated: "nope" },
		};
		assert.strictEqual(selectLatest(table, "1.0.0", true), "1.0.0");
	});

	it("reads dist-tags.latest from the registry client", async () => {
		const urls: string[] = [];
		globalThis.fetch = (async (url: string) => {
			urls.push(String(url));
			return jsonResponse({
				"dist-tags": { latest: "1.2.0" },
				versions: { "1.2.0": {}, "9.0.0": {} },
			});
		}) as typeof fetch;
		const client = new NpmClient("https://registry.example.test/");
		const result = await client.fetchPackageInfo("left-pad", false);
		assert.strictEqual(result.package.latestVersion, "1.2.0");
		assert.deepStrictEqual(urls, ["https://registry.example.test/left-pad"]);
	});
});

describe("Version cache identity", () => {
	it("differs for the pre-release flag and for paths on the same host", () => {
		assert.notStrictEqual(
			versionCacheKey("https://reg.test/a", "react", false),
			versionCacheKey("https://reg.test/a", "react", true),
		);
		assert.notStrictEqual(
			versionCacheKey("https://reg.test/a", "react", false),
			versionCacheKey("https://reg.test/b", "react", false),
		);
		assert.strictEqual(
			versionCacheKey("https://reg.test/a/", "react", false),
			versionCacheKey("https://reg.test/a", "react", false),
		);
	});

	it("does not reuse a stable entry after showPrerelease is turned on", async () => {
		const registry = "https://reg.test/a";
		const memento = new MockMemento();
		memento.update(PACKAGE_CACHE_STORAGE_KEY, {
			[versionCacheKey(registry, "react", false)]: {
				data: { name: "react", latestVersion: "1.2.3" },
				timestamp: Date.now(),
			},
		});
		let fetches = 0;
		globalThis.fetch = (async () => {
			fetches++;
			return jsonResponse({
				"dist-tags": { latest: "1.2.3" },
				versions: { "1.2.3": {}, "2.0.0-beta.1": {} },
			});
		}) as typeof fetch;

		const service = new VersionService(60, `${registry}/`, memento, false);
		assert.strictEqual(
			(await service.getPackageInfo("react"))?.latestVersion,
			"1.2.3",
		);
		assert.strictEqual(fetches, 0, "a fresh stable entry must be a cache hit");

		service.updateConfiguration(60, registry, memento, true);
		assert.strictEqual(service.getCachedPackageInfo("react"), undefined);
		assert.strictEqual(
			(await service.getPackageInfo("react"))?.latestVersion,
			"2.0.0-beta.1",
		);
		assert.strictEqual(fetches, 1);

		const otherPath = new VersionService(
			60,
			"https://reg.test/b",
			memento,
			false,
		);
		assert.strictEqual(otherPath.getCachedPackageInfo("react"), undefined);
	});
});

describe("Dependency targeting", () => {
	const parser = new PackageJsonParser();
	const text = `{
		"devDependencies": { "react": "^17.0.2" },
		"peerDependencies": { "react": "^17.0.2" }
	}`;
	const deps = parser.parse(text);
	const dev = deps.find((dep) => dep.section === "devDependencies");
	const peer = deps.find((dep) => dep.section === "peerDependencies");

	it("parses the section each dependency came from", () => {
		assert.ok(dev);
		assert.ok(peer);
		assert.notStrictEqual(dev?.versionRange.start, peer?.versionRange.start);
	});

	it("edits the clicked peer range, not the earlier devDependencies copy", () => {
		const located = locateDependencyRange(text, deps, "react", "^17.0.2", {
			section: "peerDependencies",
			hint: peer?.versionRange,
		});
		assert.deepStrictEqual(located, peer?.versionRange);
	});

	it("keeps the peer section when the clicked range is stale", () => {
		const located = locateDependencyRange(text, deps, "react", "^17.0.2", {
			section: "peerDependencies",
			hint: { start: 0, end: 3 },
		});
		assert.deepStrictEqual(located, peer?.versionRange);
	});

	it("does not follow a hint that now lands in another section", () => {
		const located = locateDependencyRange(text, deps, "react", "^17.0.2", {
			section: "peerDependencies",
			hint: dev?.versionRange,
		});
		assert.deepStrictEqual(located, peer?.versionRange);
	});

	it("still finds the only match when the command has no section", () => {
		const single = '{ "dependencies": { "react": "17.0.2" } }';
		const parsed = parser.parse(single);
		const located = locateDependencyRange(single, parsed, "react", "17.0.2", {
			hint: { start: 0, end: 2 },
		});
		assert.deepStrictEqual(located, parsed[0].versionRange);
	});
});

describe("Registry requests", () => {
	it("aborts a body that is still being read", async () => {
		globalThis.fetch = (async (_url: string, init?: RequestInit) => {
			const signal = init?.signal;
			assert.ok(signal, "request must be abortable");
			return {
				ok: true,
				status: 200,
				json: () =>
					new Promise((resolve, reject) => {
						const timer = setTimeout(() => {
							resolve({
								"dist-tags": { latest: "1.0.0" },
								versions: { "1.0.0": {} },
							});
						}, 200);
						const onAbort = () => {
							clearTimeout(timer);
							const error = new Error("The operation was aborted");
							error.name = "AbortError";
							reject(error);
						};
						if (signal.aborted) {
							onAbort();
						} else {
							signal.addEventListener("abort", onAbort, { once: true });
						}
					}),
			} as Response;
		}) as typeof fetch;

		const client = new NpmClient(
			"https://registry.example.test",
			undefined,
			30,
		);
		const result = await client.fetchPackageInfo("left-pad", false);
		assert.strictEqual(result.error, "Request timed out");
		assert.strictEqual(result.package.latestVersion, "");
	});

	it("loads the version manifest for hover details", async () => {
		const urls: string[] = [];
		globalThis.fetch = (async (url: string) => {
			urls.push(String(url));
			return jsonResponse({
				description: "A library",
				homepage: "https://example.com",
			});
		}) as typeof fetch;

		assert.strictEqual(
			versionDocumentUrl(
				"https://registry.example.test",
				"@scope/pkg",
				"1.2.3",
			),
			"https://registry.example.test/@scope%2Fpkg/1.2.3",
		);
		const client = new NpmClient("https://registry.example.test");
		const details = await client.fetchPackageDetails("react", "18.2.0");
		assert.deepStrictEqual(urls, [
			"https://registry.example.test/react/18.2.0",
		]);
		assert.strictEqual(details?.description, "A library");
		assert.strictEqual(details?.homepage, "https://example.com");

		const service = new VersionService(60, "https://registry.example.test");
		const viaService = await service.getPackageDetails("@scope/pkg", "1.2.3");
		assert.strictEqual(
			urls[1],
			"https://registry.example.test/@scope%2Fpkg/1.2.3",
		);
		assert.strictEqual(viaService?.description, "A library");
	});
});

describe("Private registries", () => {
	it("accepts http(s) URLs and rejects anything else", () => {
		assert.strictEqual(
			normalizeRegistryUrl("https://registry.npmjs.org/"),
			"https://registry.npmjs.org",
		);
		assert.strictEqual(
			normalizeRegistryUrl("http://127.0.0.1:4873/"),
			"http://127.0.0.1:4873",
		);
		assert.strictEqual(
			normalizeRegistryUrl(
				"https://npm.example.com/artifactory/api/npm/local/",
			),
			"https://npm.example.com/artifactory/api/npm/local",
		);
		assert.strictEqual(
			normalizeRegistryUrl("https://user:s3cret@npm.example.com/repo"),
			"https://npm.example.com/repo",
		);
		assert.strictEqual(normalizeRegistryUrl("javascript:alert(1)"), null);
		assert.strictEqual(normalizeRegistryUrl("file:///etc/passwd"), null);
		assert.strictEqual(normalizeRegistryUrl("not a url"), null);
		assert.strictEqual(normalizeRegistryUrl("   "), null);
	});

	it("reads @scope:registry and ignores tokens and the default registry line", () => {
		const text = `
			# comment
			; also a comment
			registry=https://evil.example
			@myorg:registry=https://npm.myorg.example/repo/
			@other:registry = "https://npm.other.example"
			//npm.myorg.example/:_authToken=super-secret
			@broken:registry=not a url
		`;
		const scopes = parseNpmrc(text);
		assert.strictEqual(scopes.get("@myorg"), "https://npm.myorg.example/repo");
		assert.strictEqual(scopes.get("@other"), "https://npm.other.example");
		assert.strictEqual(scopes.has("@broken"), false);
		assert.ok(!JSON.stringify([...scopes]).includes("super-secret"));
		assert.ok(!JSON.stringify([...scopes]).includes("evil.example"));
	});

	it("lets a project npmrc override the user npmrc", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "npmrc-"));
		try {
			const user = path.join(root, "user");
			const project = path.join(root, "project");
			fs.writeFileSync(
				user,
				"@myorg:registry=https://user.example\n//user.example/:_authToken=leak\n",
			);
			fs.writeFileSync(
				project,
				"@myorg:registry=https://project.example\n@other:registry=https://other.example\n",
			);
			const scopes = loadScopedRegistries([user, project]);
			assert.strictEqual(scopes.get("@myorg"), "https://project.example");
			assert.strictEqual(scopes.get("@other"), "https://other.example");
			assert.ok(!JSON.stringify([...scopes]).includes("leak"));
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("routes scoped packages and sends the SecretStorage bearer token", async () => {
		const secrets = new MemorySecrets();
		secrets.store(tokenSecretKey("https://npm.myorg.test"), "s3cret");
		const seen: { url: string; auth: string | null }[] = [];
		globalThis.fetch = (async (url: string, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			seen.push({ url: String(url), auth: headers.get("authorization") });
			return jsonResponse({
				"dist-tags": { latest: "1.0.0" },
				versions: { "1.0.0": {} },
			});
		}) as typeof fetch;

		const service = new VersionService(
			60,
			"https://registry.npmjs.org",
			undefined,
			false,
			{
				scopedRegistries: new Map([["@myorg", "https://npm.myorg.test"]]),
				secrets,
			},
		);
		await service.getPackageInfo("@myorg/widget");
		await service.getPackageInfo("react");
		assert.deepStrictEqual(seen[0], {
			url: "https://npm.myorg.test/@myorg%2Fwidget",
			auth: "Bearer s3cret",
		});
		assert.deepStrictEqual(seen[1], {
			url: "https://registry.npmjs.org/react",
			auth: null,
		});

		secrets.store(tokenSecretKey("https://npm.myorg.test"), "rotated");
		service.invalidateCredentials();
		await service.getPackageInfo("@myorg/other");
		assert.strictEqual(seen[2].auth, "Bearer rotated");
	});

	it("does not fetch the public registry when registryUrl is invalid", async () => {
		const urls: string[] = [];
		globalThis.fetch = (async (url: string) => {
			urls.push(String(url));
			return jsonResponse({});
		}) as typeof fetch;
		const service = new VersionService(60, "javascript:alert(1)");
		const info = await service.getPackageInfo("secret-pkg");
		assert.strictEqual(info, null);
		assert.deepStrictEqual(urls, []);
		assert.strictEqual(
			service.getFailure("secret-pkg"),
			"Invalid registry URL",
		);
		assert.strictEqual(service.registryFor("secret-pkg"), null);
	});

	it("opens npmjs.com only for the public registry", () => {
		assert.strictEqual(
			packageWebUrl("https://registry.npmjs.org", "@scope/pkg"),
			"https://www.npmjs.com/package/@scope/pkg",
		);
		assert.strictEqual(
			packageWebUrl("https://npm.myorg.test/repo/", "@myorg/widget"),
			"https://npm.myorg.test/repo/@myorg%2Fwidget",
		);
		assert.strictEqual(packageWebUrl(null, "secret-pkg"), null);
		assert.strictEqual(
			packageWebUrl("javascript:alert(1)", "secret-pkg"),
			null,
		);
	});
});

describe("Stable release after a prerelease range", () => {
	it("offers 2.0.0 to a user still on ^2.0.0-beta.3", () => {
		// The caret already admits 2.0.0. That must not count as up to date:
		// the spec text is still the beta and should move onto the release.
		assert.strictEqual(
			VersionResolver.specIncludes("^2.0.0-beta.3", "2.0.0"),
			true,
		);
		assert.strictEqual(
			VersionResolver.isUpdateAvailable("^2.0.0-beta.3", "2.0.0"),
			true,
		);
		assert.strictEqual(
			VersionResolver.formatNewVersion("^2.0.0-beta.3", "2.0.0"),
			"^2.0.0",
		);
		assert.strictEqual(
			VersionResolver.formatNewVersion("~2.0.0-beta.3", "2.0.0"),
			"~2.0.0",
		);
		assert.strictEqual(
			VersionResolver.formatNewVersion("2.0.0-beta.3", "2.0.0"),
			"2.0.0",
		);
		assert.strictEqual(
			semverSatisfiesRewritten("^2.0.0-beta.3", "2.0.0"),
			true,
		);
	});
});

function semverSatisfiesRewritten(current: string, latest: string): boolean {
	const rewritten = VersionResolver.formatNewVersion(current, latest);
	if (!rewritten) {
		return false;
	}
	return VersionResolver.specIncludes(rewritten, latest);
}
