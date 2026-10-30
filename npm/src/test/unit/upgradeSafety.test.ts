/**
 * One-click upgrades must write a range that includes the target version,
 * keep wildcard style, and never touch non-registry specs.
 */
import * as assert from "node:assert";
import * as semver from "semver";
import { registryDependency, versionRangeOf } from "../../core/dependencySpec";
import { PackageJsonParser } from "../../core/packageJsonParser";
import { VersionResolver } from "../../core/versionResolver";
import { UpdateRisk } from "../../types";

function rangeOf(spec: string): string {
	return versionRangeOf(spec) ?? spec;
}

function expectUpgrade(
	current: string,
	latest: string,
	expected: string,
): void {
	assert.strictEqual(
		VersionResolver.formatNewVersion(current, latest),
		expected,
		`${current} → ${latest}`,
	);
	assert.strictEqual(
		semver.satisfies(latest, rangeOf(expected)),
		true,
		`${expected} should include ${latest}`,
	);
	assert.strictEqual(
		VersionResolver.isUpdateAvailable(current, latest),
		true,
		`${current} should offer an upgrade to ${latest}`,
	);
}

function expectNoUpgrade(current: string, latest: string): void {
	assert.strictEqual(
		VersionResolver.formatNewVersion(current, latest),
		null,
		`${current} → ${latest} should not be rewritten`,
	);
	assert.strictEqual(
		VersionResolver.isUpdateAvailable(current, latest),
		false,
		`${current} should not offer an upgrade to ${latest}`,
	);
}

describe("Upgrade safety: ranges that would become empty or conflicting", () => {
	it("refuses an AND range whose upper bound excludes the target", () => {
		expectNoUpgrade(">=1.0.0 <2.0.0", "3.1.0");
		expectUpgrade(">=1.0.0 <2.0.0", "1.5.0", ">=1.5.0 <2.0.0");
		expectUpgrade(">=1.2 <2.0", "1.4.0", ">=1.4.0 <2.0");
	});

	it("refuses a hyphen range whose end excludes the target", () => {
		expectNoUpgrade("1.2.3 - 2.3.4", "3.0.0");
		expectUpgrade("1.2.3 - 2.3.4", "1.4.0", "1.4.0 - 2.3.4");
	});

	it("refuses an OR range when the target is outside every alternative", () => {
		expectNoUpgrade("^1.0.0 || ^2.0.0", "3.0.0");
		expectUpgrade("^1.0.0 || ^2.0.0", "1.4.0", "^1.4.0 || ^2.0.0");
		expectUpgrade("^1.0.0 || ^2.0.0", "2.3.0", "^1.0.0 || ^2.3.0");
	});

	it("keeps wildcards as wildcards", () => {
		expectNoUpgrade("1.x", "1.5.0");
		expectNoUpgrade("1.*", "1.5.0");
		expectNoUpgrade("1.2.x", "1.2.9");
		expectNoUpgrade("1.2", "1.2.5");
		expectNoUpgrade("1", "1.9.0");
		expectNoUpgrade("*", "9.9.9");
		expectNoUpgrade("x", "9.9.9");
		expectUpgrade("1.x", "2.3.4", "2.x");
		expectUpgrade("1.*", "3.0.0", "3.*");
		expectUpgrade("1.X", "2.0.0", "2.X");
		expectUpgrade("1.2.x", "1.3.4", "1.3.x");
		expectUpgrade("1.2.*", "2.0.1", "2.0.*");
		expectUpgrade("1.x.x", "3.2.1", "3.x.x");
		expectUpgrade("1.2", "1.5.1", "1.5");
		expectUpgrade("1", "2.3.4", "2");
		expectNoUpgrade("^1.x", "1.5.0");
		expectUpgrade("^1.x", "2.3.0", "^2.x");
		expectNoUpgrade("~1.2.x", "1.2.8");
		expectUpgrade("~1.2.x", "1.3.4", "~1.3.x");
	});

	it("preserves simple operator style, including when the major changes", () => {
		expectUpgrade("^1.0.0", "1.1.0", "^1.1.0");
		expectUpgrade("^1.0.0", "3.1.0", "^3.1.0");
		expectUpgrade("~1.2.3", "1.2.5", "~1.2.5");
		expectUpgrade("~1.2.3", "1.3.0", "~1.3.0");
		expectUpgrade("1.2.3", "1.5.0", "1.5.0");
		expectUpgrade("=1.2.3", "1.5.0", "=1.5.0");
		expectUpgrade("v1.2.3", "1.5.0", "v1.5.0");
		// `>` does not include its endpoint; `>=` does.
		expectUpgrade(">1.0.0", "1.5.0", ">=1.5.0");
		expectUpgrade(">1.0.0 <2.0.0", "1.5.0", ">=1.5.0 <2.0.0");
		expectNoUpgrade("<2.0.0", "1.5.0");
		expectNoUpgrade("<=1.5.0", "1.5.0");
	});

	it("does not downgrade", () => {
		expectNoUpgrade("1.2.3", "1.2.3");
		expectNoUpgrade("1.2.3", "1.0.0");
		expectNoUpgrade("^2.0.0", "1.9.0");
	});

	it("rewrites npm aliases without dropping the alias", () => {
		expectUpgrade("npm:lodash@^4.17.0", "4.17.21", "npm:lodash@^4.17.21");
		expectUpgrade(
			"npm:@types/node@^20.1.0",
			"20.11.0",
			"npm:@types/node@^20.11.0",
		);
		expectUpgrade(
			"npm:lodash@>=4.0.0 <5.0.0",
			"4.17.21",
			"npm:lodash@>=4.17.21 <5.0.0",
		);
		expectNoUpgrade("npm:lodash@>=4.0.0 <5.0.0", "5.0.0");
		expectNoUpgrade("npm:lodash@latest", "4.17.21");
	});

	it("does not invent a version from a non-registry spec", () => {
		for (const spec of [
			"file:../pkg-2",
			"link:../pkg",
			"workspace:^1.0.0",
			"workspace:*",
			"github:user/repo#v1.2.0",
			"github:user/repo#semver:^1.2.0",
			"git+https://github.com/user/repo.git#v1.2.0",
			"git+ssh://git@github.com/user/repo.git#v1.2.0",
			"https://example.com/pkg.tgz",
			"http://example.com/pkg.tgz",
			"user/repo#v1.2.0",
			"latest",
			"next",
			"canary",
		]) {
			expectNoUpgrade(spec, "3.0.0");
		}
		assert.strictEqual(
			VersionResolver.calculateUpdateRisk("file:../pkg-2", "3.0.0"),
			UpdateRisk.Low,
		);
		assert.strictEqual(
			VersionResolver.getDiffType("file:../pkg-2", "3.0.0"),
			null,
		);
		assert.strictEqual(
			VersionResolver.calculateUpdateRisk("^1.0.0 || ^2.0.0", "2.3.0"),
			UpdateRisk.Medium,
		);
	});
});

describe("Upgrade safety: registry lookup targets", () => {
	it("skips non-registry specs and resolves npm aliases", () => {
		assert.strictEqual(
			registryDependency("internal-ui", "workspace:^1.0.0"),
			null,
		);
		assert.strictEqual(registryDependency("internal-ui", "workspace:*"), null);
		assert.strictEqual(registryDependency("local", "file:../pkg-2"), null);
		assert.strictEqual(registryDependency("linked", "link:../pkg"), null);
		assert.strictEqual(
			registryDependency("gh", "github:user/repo#v1.2.0"),
			null,
		);
		assert.strictEqual(
			registryDependency("tarball", "https://example.com/pkg.tgz"),
			null,
		);
		assert.strictEqual(registryDependency("react", "latest"), null);
		assert.strictEqual(registryDependency("react", "next"), null);
		assert.deepStrictEqual(registryDependency("react", "^18.0.0"), {
			registryName: "react",
		});
		assert.deepStrictEqual(
			registryDependency("my-lodash", "npm:lodash@^4.17.0"),
			{ registryName: "lodash" },
		);
		assert.deepStrictEqual(
			registryDependency("my-types", "npm:@types/node@^20.0.0"),
			{ registryName: "@types/node" },
		);
	});

	it("parser emits only registry specs, with alias targets", () => {
		const parser = new PackageJsonParser();
		const deps = parser.parse(`{
			"dependencies": {
				"internal-ui": "workspace:^1.0.0",
				"internal-wild": "workspace:*",
				"local": "file:../pkg-2",
				"linked": "link:../pkg",
				"gh": "github:user/repo#v1.2.0",
				"giturl": "git+https://github.com/user/repo.git#v1.2.0",
				"tarball": "https://example.com/pkg.tgz",
				"plain": "http://example.com/pkg.tgz",
				"shorthand": "user/repo#v1.2.0",
				"tag": "latest",
				"channel": "next",
				"react": "^18.0.0",
				"wildcard": "1.x",
				"aliased": "npm:lodash@^4.17.0"
			},
			"devDependencies": {
				"typescript": "5.0.0"
			},
			"peerDependencies": {
				"host": "workspace:^2.0.0"
			},
			"optionalDependencies": {
				"scoped-alias": "npm:@types/node@^20.0.0",
				"beta-pin": "1.2.3-beta.1"
			}
		}`);

		assert.deepStrictEqual(
			deps.map((d) => `${d.name}=>${d.registryName}`),
			[
				"react=>react",
				"wildcard=>wildcard",
				"aliased=>lodash",
				"typescript=>typescript",
				"scoped-alias=>@types/node",
				"beta-pin=>beta-pin",
			],
		);
		assert.strictEqual(
			deps.find((d) => d.name === "aliased")?.currentVersion,
			"npm:lodash@^4.17.0",
		);
		assert.strictEqual(deps.find((d) => d.name === "typescript")?.isDev, true);
		assert.strictEqual(
			deps.find((d) => d.name === "scoped-alias")?.currentVersion,
			"npm:@types/node@^20.0.0",
		);
		assert.ok(
			!deps.some((d) =>
				["internal-ui", "local", "gh", "tag", "host", "shorthand"].includes(
					d.name,
				),
			),
		);
	});
});
