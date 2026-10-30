/**
 * Regression tests for the 2026-10 fixes: compound version-range formatting,
 * peerDependencies flagging, scoped registry paths and pre-release picking.
 */
import * as assert from "node:assert";
import { PackageJsonParser } from "../../core/packageJsonParser";
import { VersionResolver } from "../../core/versionResolver";
import { pickLatest, registryPath } from "../../providers/npmClient";

describe("Regression: compound range formatting", () => {
	it("keeps the upper bound of AND ranges", () => {
		assert.strictEqual(
			VersionResolver.formatNewVersion(">=1.2 <2.0", "1.4.0"),
			">=1.4.0 <2.0",
		);
	});

	it("bumps the lower bound of hyphen ranges", () => {
		assert.strictEqual(
			VersionResolver.formatNewVersion("1.2.3 - 2.3.4", "1.4.0"),
			"1.4.0 - 2.3.4",
		);
	});

	it("bumps the OR alternative that already contains the target", () => {
		assert.strictEqual(
			VersionResolver.formatNewVersion("^1.0.0 || ^2.0.0", "1.4.0"),
			"^1.4.0 || ^2.0.0",
		);
		assert.strictEqual(
			VersionResolver.formatNewVersion("^1.0.0 || ^2.0.0", "2.3.0"),
			"^1.0.0 || ^2.3.0",
		);
	});

	it("still preserves simple prefixes", () => {
		assert.strictEqual(
			VersionResolver.formatNewVersion("^1.2.3", "1.4.0"),
			"^1.4.0",
		);
		assert.strictEqual(
			VersionResolver.formatNewVersion("~1.2.3", "1.4.0"),
			"~1.4.0",
		);
		assert.strictEqual(
			VersionResolver.formatNewVersion("1.2.3", "1.4.0"),
			"1.4.0",
		);
	});

	it("does not rewrite workspace specs", () => {
		assert.strictEqual(
			VersionResolver.formatNewVersion("workspace:^1.2.3", "1.4.0"),
			null,
		);
	});
});

describe("Regression: parser section flags", () => {
	const parser = new PackageJsonParser();

	it("flags peerDependencies and devDependencies", () => {
		const deps = parser.parse(
			'{"dependencies": {"a": "1.0.0"}, "devDependencies": {"b": "1.0.0"}, "peerDependencies": {"c": "^1.0.0"}}',
		);
		assert.strictEqual(deps.length, 3);
		assert.strictEqual(deps[0].isPeer, false);
		assert.strictEqual(deps[1].isDev, true);
		assert.strictEqual(deps[2].isPeer, true);
	});
});

describe("Regression: registry paths", () => {
	it("encodes scoped package names", () => {
		assert.strictEqual(registryPath("@angular/core"), "@angular%2Fcore");
		assert.strictEqual(registryPath("react"), "react");
	});
});

describe("Regression: pre-release picking", () => {
	it("excludes pre-releases by default", () => {
		assert.strictEqual(pickLatest(["1.0.0", "2.0.0-rc.1"], false), "1.0.0");
	});

	it("includes pre-releases when asked", () => {
		assert.strictEqual(pickLatest(["1.0.0", "2.0.0-rc.1"], true), "2.0.0-rc.1");
	});

	it("returns null for an empty list", () => {
		assert.strictEqual(pickLatest([], true), null);
	});
});
