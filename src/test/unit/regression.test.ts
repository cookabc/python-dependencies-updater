/**
 * Regression tests for the 2026-10 correctness fixes:
 * scoped version extraction, TOML file detection, wildcard/===/marker
 * specifier support, post-release filtering and yanked-release filtering.
 */
import * as assert from "node:assert";
import { parseDependencies } from "../../core/unifiedParser";
import {
	isPrerelease,
	parseSpecifier,
	resolve,
	satisfies,
} from "../../core/versionResolver";
import { filterInstallableVersions } from "../../providers/pypiClient";
import {
	buildVersionReplacement,
	extractVersionFromLine,
	extractVersionNumber,
} from "../../utils/dependencyUtils";

describe("Regression: scoped version extraction", () => {
	const content =
		'[project]\nname = "x"\ndependencies = ["flask>=2.0", "requests>=2.28"]\n';
	const lines = content.split("\n");

	it("extracts each dependency's own version inside a single-line array", () => {
		const deps = parseDependencies("pyproject.toml", content);
		assert.strictEqual(deps.length, 2);
		assert.deepStrictEqual(
			deps.map((d) => d.packageName),
			["flask", "requests"],
		);

		const flask = extractVersionFromLine(
			lines[deps[0].line],
			true,
			deps[0].startColumn,
		);
		const requests = extractVersionFromLine(
			lines[deps[1].line],
			true,
			deps[1].startColumn,
		);
		assert.strictEqual(flask!.version, "2.0");
		assert.strictEqual(requests!.version, "2.28");
	});

	it("updates requests without touching flask on the same line", () => {
		const deps = parseDependencies("pyproject.toml", content);
		const line = lines[deps[1].line];
		const match = extractVersionFromLine(line, true, deps[1].startColumn)!;
		const replacement = buildVersionReplacement(line, "2.32.0", true, match);
		const start = line.slice(0, match.startIndex);
		const end = line.slice(match.endIndex);
		const updated = start + replacement + end;
		assert.strictEqual(
			updated,
			'dependencies = ["flask>=2.0", "requests>=2.32.0"]',
		);
	});

	it("extractVersionNumber drops environment markers", () => {
		assert.strictEqual(
			extractVersionNumber('>=1.0; python_version >= "3.9"'),
			"1.0",
		);
	});
});

describe("Regression: TOML file detection", () => {
	it("ignores non-pyproject TOML files entirely", () => {
		const cargo =
			'[package]\nname = "serde"\nversion = "1.0.2"\n\n[dependencies]\nserde_json = "1.0"\n';
		assert.deepStrictEqual(parseDependencies("Cargo.toml", cargo), []);
		assert.deepStrictEqual(
			parseDependencies("rust-toolchain.toml", 'channel = "stable"\n'),
			[],
		);
	});

	it("ignores Pipfile.toml (not a PEP 621 manifest)", () => {
		assert.deepStrictEqual(
			parseDependencies("Pipfile.toml", '[packages]\nrequests = "*"\n'),
			[],
		);
	});

	it("still parses pyproject.toml with a [project] section", () => {
		const deps = parseDependencies(
			"pyproject.toml",
			'[project]\ndependencies = ["flask>=2.0"]\n',
		);
		assert.strictEqual(deps.length, 1);
		assert.strictEqual(deps[0].packageName, "flask");
	});
});

describe("Regression: specifier semantics", () => {
	it("treats post-releases as non-prereleases", () => {
		assert.strictEqual(isPrerelease("1.0.0.post1"), false);
		assert.strictEqual(isPrerelease("1.0.0"), false);
	});

	it("treats pre-releases with a .post tail as prereleases", () => {
		assert.strictEqual(isPrerelease("2.0.0b1.post2"), true);
		assert.strictEqual(isPrerelease("1.0.0rc1"), true);
		assert.strictEqual(isPrerelease("1.0.0.dev1"), true);
	});

	it("strips environment markers when parsing specifiers", () => {
		const constraints = parseSpecifier('>=1.24; python_version >= "3.9"');
		assert.deepStrictEqual(constraints, [{ operator: ">=", version: "1.24" }]);
	});

	it("supports == wildcard constraints", () => {
		assert.strictEqual(satisfies("1.2.9", parseSpecifier("==1.2.*")), true);
		assert.strictEqual(satisfies("1.3.0", parseSpecifier("==1.2.*")), false);
		assert.strictEqual(satisfies("1.2.0", parseSpecifier("==1.2.*")), true);
	});

	it("supports != wildcard constraints", () => {
		assert.strictEqual(satisfies("1.3.0", parseSpecifier("!=1.2.*")), true);
		assert.strictEqual(satisfies("1.2.5", parseSpecifier("!=1.2.*")), false);
	});

	it("resolves the newest version within a wildcard range", () => {
		const result = resolve(["1.2.0", "1.2.9", "1.3.0"], "==1.2.*");
		assert.strictEqual(result.found, true);
		assert.strictEqual(result.version, "1.2.9");
	});

	it("supports === arbitrary equality", () => {
		assert.strictEqual(satisfies("1.0.0", parseSpecifier("===1.0.0")), true);
		assert.strictEqual(satisfies("1.0.0", parseSpecifier("===1.0")), false);
	});
});

describe("Regression: installable version filtering", () => {
	it("drops yanked-only and empty releases", () => {
		const releases = {
			"1.0.0": [{ yanked: false }],
			"1.1.0": [{ yanked: true }, { yanked: true }],
			"1.2.0": [],
		};
		assert.deepStrictEqual(filterInstallableVersions(releases as any), [
			"1.0.0",
		]);
	});

	it("keeps releases with at least one non-yanked file", () => {
		const releases = { "2.0.0": [{ yanked: true }, { yanked: false }] };
		assert.deepStrictEqual(filterInstallableVersions(releases as any), [
			"2.0.0",
		]);
	});
});
