/**
 * Cache identity, closed-document status totals, hover/CodeLens agreement,
 * and the absence of the resolveCodeLens debug probe.
 */
import * as assert from "node:assert";
import * as vscode from "vscode";
import { cacheManager } from "../../core/cache";
import { normalizePackageName, versionCacheKey } from "../../core/packageName";
import { PyDepsCodeLensProvider } from "../../providers/codeLensProvider";
import { PyDepsHoverProvider } from "../../providers/hoverProvider";
import { getPackageVersions } from "../../providers/versionService";
import type { StatusBarManager } from "../../utils/statusBar";

const token = {
	isCancellationRequested: false,
	onCancellationRequested: () => ({ dispose: () => {} }),
} as unknown as vscode.CancellationToken;

function document(
	uri: string,
	content: string,
	fileName = "requirements.txt",
): vscode.TextDocument {
	return {
		fileName,
		languageId: "pip-requirements",
		version: 1,
		uri: { toString: () => uri },
		getText: () => content,
	} as unknown as vscode.TextDocument;
}

function setOpenDocuments(docs: vscode.TextDocument[]): void {
	Object.assign(vscode.workspace, { textDocuments: docs });
}

function pypiResponse(versions: string[]) {
	const releases: Record<string, Array<{ yanked: boolean }>> = {};
	for (const version of versions) {
		releases[version] = [{ yanked: false }];
	}
	return {
		ok: true,
		status: 200,
		json: async () => ({ info: { summary: "A package" }, releases }),
	};
}

async function waitFor(predicate: () => boolean): Promise<void> {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > 2000) {
			throw new Error("timed out");
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

describe("PEP 503 cache keys", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		cacheManager.clear();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		cacheManager.clear();
	});

	it("normalizes separators and case", () => {
		assert.strictEqual(normalizePackageName("Foo_Bar"), "foo-bar");
		assert.strictEqual(normalizePackageName("foo.bar"), "foo-bar");
		assert.strictEqual(normalizePackageName("foo--bar"), "foo-bar");
		assert.strictEqual(normalizePackageName("Foo_Bar[Extra]"), "foo-bar");
		assert.strictEqual(
			versionCacheKey("Foo_Bar", "https://pypi.org/"),
			versionCacheKey("foo-bar", "https://pypi.org"),
		);
	});

	it("reuses one registry response for equivalent names", async () => {
		let calls = 0;
		globalThis.fetch = (async () => {
			calls++;
			return pypiResponse(["1.2.3"]);
		}) as unknown as typeof fetch;

		const first = await getPackageVersions("foo-bar");
		const second = await getPackageVersions("Foo_Bar");
		const third = await getPackageVersions("FOO.BAR");
		assert.strictEqual(calls, 1);
		assert.deepStrictEqual(first.versions, ["1.2.3"]);
		assert.deepStrictEqual(second.versions, ["1.2.3"]);
		assert.deepStrictEqual(third.versions, ["1.2.3"]);
	});
});

describe("CodeLens cache, status bar, and debug logging", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
		cacheManager.clear();
		setOpenDocuments([]);
	});

	it("does not log a UAT probe from resolveCodeLens", async () => {
		const errors: string[] = [];
		const original = console.error;
		console.error = (...args: unknown[]) => {
			errors.push(args.map(String).join(" "));
		};
		try {
			const provider = new PyDepsCodeLensProvider();
			const lens = new vscode.CodeLens(new vscode.Range(0, 0, 0, 0));
			await provider.resolveCodeLens(lens, token);
		} finally {
			console.error = original;
		}
		assert.ok(!errors.join("\n").includes("UAT-PROBE"));
	});

	it("shares the in-memory version cache across PEP 503 names", async () => {
		let calls = 0;
		// Only registry lookups count here. The vulnerability scan also uses
		// fetch, and its requests say nothing about version-cache sharing.
		globalThis.fetch = (async (input: any) => {
			const url = typeof input === "string" ? input : String(input?.url ?? "");
			if (url.includes("pypi.org")) {
				calls++;
			}
			return pypiResponse(["1.0.0", "2.0.0"]);
		}) as unknown as typeof fetch;

		const provider = new PyDepsCodeLensProvider();
		const first = document(
			"file:///tmp/foo-underscore.txt",
			"Foo_Bar==1.0.0\n",
		);
		setOpenDocuments([first]);
		const firstLens = provider
			.provideCodeLenses(first, token)
			.find((lens) => !lens.command);
		assert.ok(firstLens);
		const loaded = new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("timed out")), 2000);
			provider.onDidChangeCodeLenses(() => {
				void provider.resolveCodeLens(firstLens, token).then((lens) => {
					if (lens.command?.title.includes("2.0.0")) {
						clearTimeout(timer);
						resolve();
					}
				});
			});
		});
		await provider.resolveCodeLens(firstLens, token);
		await loaded;
		cacheManager.clear();

		const second = document("file:///tmp/foo-hyphen.txt", "foo-bar==1.0.0\n");
		setOpenDocuments([second]);
		const secondLens = provider
			.provideCodeLenses(second, token)
			.find((lens) => !lens.command);
		assert.ok(secondLens);
		const resolved = await provider.resolveCodeLens(secondLens, token);
		assert.strictEqual(calls, 1);
		assert.match(resolved.command?.title ?? "", /2\.0\.0/);
	});

	it("drops closed documents from the status bar total", async () => {
		globalThis.fetch = (async () =>
			pypiResponse(["1.0.0", "2.0.0"])) as unknown as typeof fetch;

		const status = {
			updatesAvailable: -1,
			totalPackages: -1,
			updateStatus(updatesAvailable: number, totalPackages: number) {
				this.updatesAvailable = updatesAvailable;
				this.totalPackages = totalPackages;
			},
		};
		const provider = new PyDepsCodeLensProvider(
			status as unknown as StatusBarManager,
		);
		const flask = document("file:///tmp/a/requirements.txt", "flask==1.0.0\n");
		const django = document(
			"file:///tmp/b/requirements.txt",
			"django==1.0.0\n",
		);
		setOpenDocuments([flask, django]);

		for (const doc of [flask, django]) {
			const lens = provider
				.provideCodeLenses(doc, token)
				.find((item) => !item.command);
			assert.ok(lens);
			await provider.resolveCodeLens(lens, token);
		}
		await waitFor(() => status.updatesAvailable === 2);
		assert.strictEqual(status.totalPackages, 2);

		provider.forgetDocument(flask.uri);
		assert.strictEqual(status.updatesAvailable, 1);
		assert.strictEqual(status.totalPackages, 1);

		setOpenDocuments([flask, django]);
		provider.provideCodeLenses(flask, token);
		assert.strictEqual(status.updatesAvailable, 2);

		setOpenDocuments([django]);
		provider.forgetDocument({
			toString: () => "file:///not-open",
		} as vscode.Uri);
		assert.strictEqual(status.updatesAvailable, 1);
		assert.strictEqual(status.totalPackages, 1);
	});
});

describe("Hover respects the dependency specifier", () => {
	beforeEach(() => {
		cacheManager.clear();
	});

	afterEach(() => {
		cacheManager.clear();
	});

	it("shows the newest version inside the range, not the absolute latest", async () => {
		cacheManager.set(versionCacheKey("requests"), {
			packageName: "requests",
			versions: ["2.0.0", "2.5.0a1", "2.9.0", "3.1.0", "4.0.0"],
			summary: "HTTP for Humans",
			fetchedAt: Date.now(),
		});
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () => {
			throw new Error("hover should resolve from the specifier cache");
		}) as unknown as typeof fetch;

		try {
			const provider = new PyDepsHoverProvider();
			const doc = document(
				"file:///tmp/requirements.txt",
				"requests>=2.0,<3\nrequests==2.0.0\n",
			);
			const ranged = await provider.provideHover(
				doc,
				new vscode.Position(0, 1),
				token,
			);
			const pinned = await provider.provideHover(
				doc,
				new vscode.Position(1, 1),
				token,
			);
			assert.ok(ranged);
			assert.ok(pinned);
			const rangedText = (ranged.contents as unknown as vscode.MarkdownString)
				.value;
			const pinnedText = (pinned.contents as unknown as vscode.MarkdownString)
				.value;
			assert.match(rangedText, /2\.9\.0/);
			assert.ok(!rangedText.includes("4.0.0"));
			assert.match(pinnedText, /4\.0\.0/);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
