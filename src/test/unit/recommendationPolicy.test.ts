import * as assert from "node:assert";
import { planRelocatedEdits } from "../../core/batchUpdate";
import { parsePythonLock } from "../../core/lockfile";
import { eligibleVersions } from "../../core/recommendation";
import { parseDependencies } from "../../core/unifiedParser";
import { analyzeVersionUpdate } from "../../core/versionAnalyzer";
import { dependencyPaths } from "../../shared/dependencyGraph";
import type { ExtensionConfig, PackageVersions } from "../../types";

const config: ExtensionConfig = {
	enabled: true,
	showPrerelease: false,
	cacheTTLMinutes: 60,
	supportPyProject: true,
	registryUrl: "https://pypi.org",
	checkVulnerabilities: true,
};
describe("Python recommendations", () => {
	const raw: PackageVersions = {
		packageName: "pkg",
		versions: ["1.0.0", "1.1.0", "2.0.0"],
		fetchedAt: 0,
		releases: {
			"1.0.0": [{ requiresPython: ">=3.8" }],
			"1.1.0": [{ requiresPython: ">=3.9,<3.12" }],
			"2.0.0": [{ requiresPython: ">=3.12" }],
		},
	};
	it("filters Requires-Python against the target interpreter", () =>
		assert.deepStrictEqual(
			eligibleVersions(raw, "==1.0.0", {
				...config,
				targetPythonVersion: "3.11.9",
			}),
			["1.0.0", "1.1.0"],
		));
	it("keeps compatibility unknown when no concrete interpreter is configured", () =>
		assert.deepStrictEqual(
			eligibleVersions(raw, "==1.0.0", config),
			raw.versions,
		));
	it("keeps maintenance strategies separate from interpreter compatibility", () =>
		assert.deepStrictEqual(
			eligibleVersions(raw, "==1.0.0", { ...config, strategy: "compatible" }),
			["1.0.0", "1.1.0"],
		));
	it("requires review for initial-development minor changes", () => {
		const a = analyzeVersionUpdate("0.36.3", "0.37.2");
		assert.strictEqual(a.updateType, "minor");
		assert.strictEqual(a.riskLevel, "high");
	});
	it("does not overwrite a constraint edited while a batch was fetching versions", () => {
		const [dep] = parseDependencies("requirements.txt", "pkg==1.0.0");
		const edits = planRelocatedEdits({
			updates: [{ dep, newVersion: "1.1.0", kind: "safe" }],
			fileName: "requirements.txt",
			currentText: "pkg==2.0.0",
			isTOML: false,
		});
		assert.deepStrictEqual(edits, []);
	});
});
describe("Python lockfile graphs", () => {
	it("keeps all uv conditional versions and optional dependency paths", () => {
		const graph = parsePythonLock(
			`version = 1
[[package]]
name = "app"
version = "1.0.0"
source = { virtual = "." }
dependencies = [{name="web"}]
[[package]]
name = "web"
version = "1.0.0"
source = {registry="https://pypi.org/simple"}
[package.optional-dependencies]
extra = [{name="leaf",version="2.0.0"}]
[[package]]
name = "leaf"
version = "2.0.0"
source = {registry="https://pypi.org/simple"}
[[package]]
name = "leaf"
version = "3.0.0"
source = {registry="https://pypi.org/simple"}
`,
			"uv",
			["web"],
		);
		const leaf = graph.packages.find(
			(p) => p.name === "leaf" && p.version === "2.0.0",
		);
		assert.ok(leaf);
		assert.deepStrictEqual(dependencyPaths(graph).get(leaf.id), [
			"web@1.0.0",
			"leaf@2.0.0",
		]);
		assert.strictEqual(
			graph.packages.filter((p) => p.name === "leaf").length,
			2,
		);
		assert.strictEqual(
			graph.packages.find((p) => p.name === "app")?.registry,
			undefined,
		);
	});
	it("reads Poetry dependencies and keeps git sources out of public-registry checks", () => {
		const graph = parsePythonLock(
			`[[package]]
name="web"
version="1.0.0"
[package.dependencies]
leaf=">=1"
[[package]]
name="leaf"
version="1.0.0"
[package.source]
type="git"
url="https://example.invalid/private"
`,
			"poetry",
			["web"],
		);
		assert.strictEqual(graph.packages[0].dependencies[0], graph.packages[1].id);
		assert.strictEqual(graph.packages[1].registry, undefined);
	});
	it("reports malformed lockfiles instead of returning an empty clean report", () =>
		assert.throws(
			() => parsePythonLock("version=1", "uv", []),
			/no package table/,
		));
});
