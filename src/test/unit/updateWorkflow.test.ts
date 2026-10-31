import * as assert from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { dependencyPaths } from "../../shared/dependencyGraph";
import { runCommand, validationEnvironment } from "../../shared/processRunner";
import { policyAllows, sameMaintenanceLine } from "../../shared/updatePolicy";
import {
	inputHashes,
	sameInputs,
	validateSnapshot,
} from "../../shared/validation";

describe("Deterministic update policies", () => {
	const now = Date.parse("2026-10-31T00:00:00Z");
	it("waits for the release age and excludes unknown timestamps only when enabled", () => {
		assert.strictEqual(policyAllows("pkg", "1.0.0", undefined, { now }), true);
		assert.strictEqual(
			policyAllows("pkg", "1.0.0", undefined, {
				now,
				minimumReleaseAgeDays: 3,
			}),
			false,
		);
		assert.strictEqual(
			policyAllows("pkg", "1.0.0", "2026-10-30T00:00:00Z", {
				now,
				minimumReleaseAgeDays: 3,
			}),
			false,
		);
		assert.strictEqual(
			policyAllows("pkg", "1.0.0", "2026-10-28T00:00:00Z", {
				now,
				minimumReleaseAgeDays: 3,
			}),
			true,
		);
	});
	it("honours ignored exact versions without ignoring the rest of a package", () => {
		assert.strictEqual(
			policyAllows("pkg", "2.0.0", undefined, {
				ignoredVersions: { pkg: ["2.0.0"] },
			}),
			false,
		);
		assert.strictEqual(
			policyAllows("pkg", "2.0.1", undefined, {
				ignoredVersions: { pkg: ["2.0.0"] },
			}),
			true,
		);
	});
	it("automatically resumes deferred packages after their deadline", () => {
		assert.strictEqual(
			policyAllows("pkg", "1.0.0", undefined, {
				now,
				deferredPackages: { pkg: "2026-11-01T00:00:00Z" },
			}),
			false,
		);
		assert.strictEqual(
			policyAllows("pkg", "1.0.0", undefined, {
				now,
				deferredPackages: { pkg: "2026-10-30T00:00:00Z" },
			}),
			true,
		);
	});
	it("keeps initial-development compatible updates in their minor line", () => {
		assert.strictEqual(
			sameMaintenanceLine([0, 3], [0, 4], "compatible"),
			false,
		);
		assert.strictEqual(sameMaintenanceLine([0, 3], [0, 3], "compatible"), true);
		assert.strictEqual(sameMaintenanceLine([2, 3], [2, 4], "compatible"), true);
		assert.strictEqual(sameMaintenanceLine([2, 3], [2, 4], "patch"), false);
	});
});

describe("Ecosystem package-name identity", () => {
	it("does not conflate npm names that differ by punctuation", () => {
		assert.strictEqual(
			policyAllows("foo-bar", "1.0.0", undefined, {
				ignoredVersions: { foo_bar: ["1.0.0"] },
			}),
			true,
		);
		assert.strictEqual(
			policyAllows("foo-bar", "1.0.0", undefined, {
				packageNameNormalization: "python",
				ignoredVersions: { foo_bar: ["1.0.0"] },
			}),
			false,
		);
	});
});

describe("Resolved dependency paths", () => {
	it("finds the shortest root path and terminates on dependency cycles", () => {
		const graph = {
			format: "test",
			warnings: [],
			packages: [
				{
					id: "a",
					name: "a",
					version: "1",
					direct: true,
					dependencies: ["b", "c"],
				},
				{
					id: "b",
					name: "b",
					version: "1",
					direct: false,
					dependencies: ["a", "c"],
				},
				{ id: "c", name: "c", version: "1", direct: false, dependencies: [] },
			],
		};
		assert.deepStrictEqual(dependencyPaths(graph).get("c"), ["a@1", "c@1"]);
	});
});

describe("Isolated update validation", function () {
	this.timeout(15000);
	let root: string;
	beforeEach(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), "updater-test-"));
		await fs.writeFile(path.join(root, "manifest.json"), '{"version":"1"}');
		await fs.writeFile(path.join(root, "lock.json"), "old-lock");
	});
	afterEach(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});
	const command = (script: string) => ({
		executable: process.execPath,
		args: ["-e", script],
	});
	const options = () => ({
		root,
		manifest: "manifest.json",
		proposedText: '{"version":"2"}',
		lockfiles: ["lock.json"],
		commands: [],
		testCommands: [],
	});
	it("returns only the validated manifest and lock edits, leaving the real project untouched", async () => {
		const result = await validateSnapshot({
			...options(),
			commands: [
				command('require("fs").writeFileSync("lock.json","new-lock")'),
			],
			testCommands: [
				command(
					'if(JSON.parse(require("fs").readFileSync("manifest.json")).version!=="2")process.exit(1)',
				),
			],
		});
		assert.strictEqual(result.testsRun, true);
		assert.strictEqual(result.files.length, 2);
		assert.strictEqual(
			result.files.find((f) => f.relativePath === "lock.json")?.after,
			"new-lock",
		);
		assert.strictEqual(
			await fs.readFile(path.join(root, "lock.json"), "utf8"),
			"old-lock",
		);
		assert.strictEqual(
			await fs.readFile(path.join(root, "manifest.json"), "utf8"),
			'{"version":"1"}',
		);
		assert.strictEqual(
			sameInputs(result.inputs, await inputHashes(root)),
			true,
		);
	});
	it("preserves original manifest/lock on failed project checks", async () => {
		await assert.rejects(
			validateSnapshot({
				...options(),
				commands: [
					command('require("fs").writeFileSync("lock.json","broken-lock")'),
				],
				testCommands: [command("process.exit(7)")],
			}),
			/code 7/,
		);
		assert.strictEqual(
			await fs.readFile(path.join(root, "lock.json"), "utf8"),
			"old-lock",
		);
	});
	it("never reports tests as passed when none ran", async () => {
		const result = await validateSnapshot(options());
		assert.strictEqual(result.testsRun, false);
	});
	it("rejects a package-manager rewrite of the reviewed manifest", async () => {
		await assert.rejects(
			validateSnapshot({
				...options(),
				commands: [
					command('require("fs").writeFileSync("manifest.json","unexpected")'),
				],
			}),
			/changed the proposed/,
		);
	});
	it("tracks newly generated lockfiles distinctly from empty files", async () => {
		await fs.rm(path.join(root, "lock.json"));
		const result = await validateSnapshot({
			...options(),
			commands: [command('require("fs").writeFileSync("lock.json","")')],
		});
		assert.deepStrictEqual(
			result.files.find((f) => f.relativePath === "lock.json"),
			{ relativePath: "lock.json", before: null, after: "" },
		);
	});
	it("detects edits to source inputs while validation was running", async () => {
		await fs.writeFile(path.join(root, "source.ts"), "before");
		const result = await validateSnapshot(options());
		await fs.writeFile(path.join(root, "source.ts"), "after");
		assert.strictEqual(
			sameInputs(result.inputs, await inputHashes(root)),
			false,
		);
	});
	it("excludes installed environments from snapshots", async () => {
		await fs.mkdir(path.join(root, "node_modules"));
		await fs.writeFile(path.join(root, "node_modules", "sentinel"), "keep");
		await validateSnapshot({
			...options(),
			testCommands: [
				command(
					'if(require("fs").existsSync("node_modules/sentinel"))process.exit(1)',
				),
			],
		});
		assert.strictEqual(
			await fs.readFile(path.join(root, "node_modules", "sentinel"), "utf8"),
			"keep",
		);
	});
	it("does not follow symlinks back into the original project", async function () {
		if (process.platform === "win32") this.skip();
		await fs.symlink(
			path.join(root, "lock.json"),
			path.join(root, "linked-lock"),
		);
		await validateSnapshot({
			...options(),
			testCommands: [
				command('if(require("fs").existsSync("linked-lock"))process.exit(1)'),
			],
		});
	});
	it("cancels a running check without changing the original lockfile", async () => {
		const controller = new AbortController();
		await assert.rejects(
			validateSnapshot({
				...options(),
				commands: [command('console.log("ready");setInterval(()=>{},1000)')],
				signal: controller.signal,
				log: (text) => {
					if (text.includes("ready")) controller.abort();
				},
			}),
			/cancelled/,
		);
		assert.strictEqual(
			await fs.readFile(path.join(root, "lock.json"), "utf8"),
			"old-lock",
		);
	});
	it("times out commands and keeps shell metacharacters as ordinary arguments", async () => {
		const result = await runCommand(
			{
				executable: process.execPath,
				args: [
					"-e",
					"process.stdout.write(process.argv[1])",
					"$(touch sentinel); literal",
				],
			},
			root,
		);
		assert.strictEqual(result.output, "$(touch sentinel); literal");
		await assert.rejects(
			runCommand(
				command("setInterval(()=>{},1000)"),
				root,
				undefined,
				undefined,
				50,
			),
			/timed out/,
		);
	});
});

import { acceptedUpgradeTargets } from "../../shared/upgradeChecks";

describe("Upgrade target protection", () => {
	const key = (name: string, version: string) => `${name}@${version}`;
	it("checks the destination version and omits vulnerable destinations", async () => {
		let received: unknown;
		const accepted = await acceptedUpgradeTargets(
			[
				{ packageName: "a", version: "2.0.0" },
				{ packageName: "b", version: "3.0.0" },
			],
			true,
			async (targets) => {
				received = targets;
				return new Map([["a@2.0.0", ["GHSA-test"]]]);
			},
			key,
		);
		assert.deepStrictEqual(received, [
			{ packageName: "a", version: "2.0.0" },
			{ packageName: "b", version: "3.0.0" },
		]);
		assert.deepStrictEqual([...accepted], ["b@3.0.0"]);
	});
	it("aborts the operation on unknown vulnerability status", async () => {
		await assert.rejects(
			acceptedUpgradeTargets(
				[{ packageName: "a", version: "2.0.0" }],
				true,
				async () => {
					throw new Error("offline");
				},
				key,
			),
			/offline/,
		);
	});
	it("respects explicitly disabled vulnerability checking", async () => {
		let called = false;
		const accepted = await acceptedUpgradeTargets(
			[{ packageName: "a", version: "2.0.0" }],
			false,
			async () => {
				called = true;
				return new Map();
			},
			key,
		);
		assert.strictEqual(called, false);
		assert.ok(accepted.has("a@2.0.0"));
	});
	it("deduplicates repeated exact targets before requesting advisories", async () => {
		let count = 0;
		await acceptedUpgradeTargets(
			[
				{ packageName: "a", version: "2.0.0" },
				{ packageName: "a", version: "2.0.0" },
			],
			true,
			async (targets) => {
				count = targets.length;
				return new Map();
			},
			key,
		);
		assert.strictEqual(count, 1);
	});
});

describe("Validation environment routing", () => {
	it("forces package-manager environments and prefixes into the temporary copy", () => {
		const env = validationEnvironment("/tmp/project-copy");
		assert.strictEqual(env.VIRTUAL_ENV, undefined);
		assert.strictEqual(env.PYTHONPATH, undefined);
		assert.strictEqual(env.NODE_PATH, undefined);
		assert.strictEqual(
			env.UV_PROJECT_ENVIRONMENT,
			path.join("/tmp/project-copy", ".venv"),
		);
		assert.strictEqual(env.npm_config_prefix, "/tmp/project-copy");
		assert.strictEqual(env.npm_config_global, "false");
		assert.strictEqual(env.POETRY_VIRTUALENVS_IN_PROJECT, "true");
	});
});

describe("Validation executable lookup", () => {
	it("does not resolve tools through the original virtualenv or node_modules", () => {
		const env = validationEnvironment("/tmp/copied-project", {
			VIRTUAL_ENV: "/original/.venv",
			PATH: [
				"/original/.venv/bin",
				"/global/bin",
				"/original/node_modules/.bin",
			].join(path.delimiter),
		});
		assert.strictEqual(env.PATH, "/global/bin");
		assert.strictEqual(env.VIRTUAL_ENV, undefined);
	});
});
