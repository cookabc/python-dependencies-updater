/**
 * Reproductions for the high-priority upgrade bugs:
 * multi-constraint rewrites, pyproject name-prefix collisions, and
 * unversioned / marker / URL dependencies offering a bogus Update lens.
 */
import * as assert from "node:assert";
import { parse } from "../../core/parser";
import { parsePyProjectDocument } from "../../core/pyprojectParser";
import { analyzeVersionUpdate } from "../../core/versionAnalyzer";
import { PyDepsCodeLensProvider } from "../../providers/codeLensProvider";
import {
	classifyVersionLens,
	extractVersionNumber,
	planLineUpdate,
} from "../../utils/dependencyUtils";

function applyUpdate(
	line: string,
	newVersion: string,
	isTOML = false,
	fromColumn = 0,
): string {
	const planned = planLineUpdate(line, newVersion, isTOML, fromColumn);
	assert.ok(planned, `expected a rewrite of: ${line}`);
	return (
		line.slice(0, planned.match.startIndex) +
		planned.replacement +
		line.slice(planned.match.endIndex)
	);
}

describe("Upgrade correctness: multi-constraint specifiers", () => {
	it("bumps the lower bound and keeps the upper bound", () => {
		assert.strictEqual(
			applyUpdate("requests>=2.0,<3.0", "2.32.3"),
			"requests>=2.32.3,<3.0",
		);
		assert.strictEqual(
			applyUpdate("requests >= 2.0, < 3.0", "2.32.3"),
			"requests >= 2.32.3, < 3.0",
		);
	});

	it("bumps the lower bound and keeps exclusions", () => {
		const planned = planLineUpdate("foo!=1.5,>=1.0", "1.9", false);
		assert.ok(planned);
		assert.strictEqual(planned.currentVersion, "1.0");
		assert.strictEqual(applyUpdate("foo!=1.5,>=1.0", "1.9"), "foo!=1.5,>=1.9");
		assert.strictEqual(
			applyUpdate("foo != 1.5, >= 1.0", "1.9"),
			"foo != 1.5, >= 1.9",
		);
	});

	it("does not treat an exclusion as the current version for risk analysis", () => {
		const current = extractVersionNumber("!=2.0,>=1.0");
		assert.strictEqual(current, "1.0");
		const analysis = analyzeVersionUpdate(current, "1.9.0");
		assert.strictEqual(analysis.updateType, "minor");
		assert.strictEqual(analysis.riskLevel, "medium");
	});

	it("preserves compatible-release precision", () => {
		assert.strictEqual(planLineUpdate("django~=4.2", "4.2.16", false), null);
		assert.strictEqual(applyUpdate("django~=4.2", "4.3.1"), "django~=4.3");
		assert.strictEqual(
			applyUpdate("django~=4.2.1", "4.2.16"),
			"django~=4.2.16",
		);
		assert.strictEqual(classifyVersionLens("~=4.2", "4.2.16"), "up-to-date");
		assert.strictEqual(classifyVersionLens("~=4.2", "4.3.1"), "update");
	});

	it("turns an exclusive lower bound into an inclusive one at the new version", () => {
		assert.strictEqual(
			applyUpdate("requests>2.0,<3.0", "2.32.3"),
			"requests>=2.32.3,<3.0",
		);
	});

	it("keeps a versioned requirement's environment marker", () => {
		assert.strictEqual(
			applyUpdate('requests>=2.0 ; python_version >= "3.8"', "2.32.3"),
			'requests>=2.32.3 ; python_version >= "3.8"',
		);
		assert.strictEqual(
			applyUpdate("holidays==0.89 ; python_version >= '3.12'", "0.91"),
			"holidays==0.91 ; python_version >= '3.12'",
		);
	});

	it("rewrites a TOML exclusion without inverting it", () => {
		const line = '"foo!=1.5,>=1.0"';
		assert.strictEqual(
			applyUpdate(line, "1.9", true, line.indexOf("foo")),
			'"foo!=1.5,>=1.9"',
		);
	});
});

describe("Upgrade correctness: pyproject name prefixes", () => {
	function upgrade(
		content: string,
		packageName: string,
		newVersion: string,
	): string {
		const deps = parsePyProjectDocument(content);
		const dep = deps.find((item) => item.packageName === packageName);
		assert.ok(dep, packageName);
		const line = content.split("\n")[dep.line];
		assert.ok(line.slice(dep.startColumn).startsWith(packageName));
		const follower = line[dep.startColumn + packageName.length];
		assert.ok(!follower || !/[A-Za-z0-9._-]/.test(follower));
		return applyUpdate(line, newVersion, true, dep.startColumn);
	}

	it("updates pytest and not pytest-cov when they share a line", () => {
		const content = `[project]
dependencies = ["pytest-cov>=4.0", "pytest>=7.0"]
`;
		const deps = parsePyProjectDocument(content);
		const cov = deps.find((dep) => dep.packageName === "pytest-cov");
		const pytest = deps.find((dep) => dep.packageName === "pytest");
		assert.ok(cov);
		assert.ok(pytest);
		assert.ok(pytest.startColumn > cov.endColumn);

		assert.strictEqual(
			upgrade(content, "pytest", "8.1.0"),
			'dependencies = ["pytest-cov>=4.0", "pytest>=8.1.0"]',
		);
	});

	it("updates pytest-cov when the shorter name comes first", () => {
		const content = `[project]
dependencies = ["pytest>=7.0", "pytest-cov>=4.0"]
`;
		assert.strictEqual(
			upgrade(content, "pytest-cov", "5.0.0"),
			'dependencies = ["pytest>=7.0", "pytest-cov>=5.0.0"]',
		);
		assert.strictEqual(
			upgrade(content, "pytest", "8.0.0"),
			'dependencies = ["pytest>=8.0.0", "pytest-cov>=4.0"]',
		);
	});
});

describe("Upgrade correctness: unversioned and URL dependencies", () => {
	it("does not rewrite a marker when the requirement has no version", () => {
		const line = 'requests ; python_version >= "3.8"';
		const parsed = parse(line, 0);
		assert.ok(parsed);
		assert.strictEqual(parsed.versionSpecifier, "");
		assert.strictEqual(planLineUpdate(line, "2.32.3", false), null);
		assert.strictEqual(
			planLineUpdate(line, "2.32.3", false, parsed.startColumn),
			null,
		);
		assert.strictEqual(classifyVersionLens("", "2.32.3"), "hidden");
		assert.strictEqual(
			classifyVersionLens('; python_version >= "3.8"', "2.32.3"),
			"hidden",
		);
	});

	it("does not rewrite a bare package name", () => {
		assert.strictEqual(planLineUpdate("requests", "2.32.3", false), null);
		assert.strictEqual(classifyVersionLens("", "2.32.3"), "hidden");
	});

	it("does not rewrite a PEP 508 direct reference", () => {
		const line = "pkg @ https://example.com/pkg-1.0.0.tar.gz";
		const parsed = parse(line, 0);
		assert.ok(parsed);
		assert.strictEqual(planLineUpdate(line, "1.2.3", false), null);
		assert.strictEqual(
			classifyVersionLens(parsed.versionSpecifier, "1.2.3"),
			"hidden",
		);
		assert.strictEqual(
			classifyVersionLens("@ https://example.com/pkg-1.0.0.tar.gz", "1.2.3"),
			"hidden",
		);
	});

	it("offers an update for a real lower bound inside a marker", () => {
		assert.strictEqual(
			classifyVersionLens('>=2.0,<3.0 ; python_version >= "3.8"', "2.32.3"),
			"update",
		);
	});
});

describe("Upgrade correctness: CodeLens", () => {
	const token = {
		isCancellationRequested: false,
		onCancellationRequested: () => ({ dispose: () => {} }),
	} as unknown as import("vscode").CancellationToken;

	function document(
		fileName: string,
		languageId: string,
		content: string,
	): import("vscode").TextDocument {
		return {
			fileName,
			languageId,
			version: 1,
			uri: { toString: () => `file:///${fileName}` },
			getText: () => content,
		} as unknown as import("vscode").TextDocument;
	}

	function countLenses(content: string, fileName: string, languageId: string) {
		const provider = new PyDepsCodeLensProvider();
		const lenses = provider.provideCodeLenses(
			document(fileName, languageId, content),
			token,
		);
		const pypi = lenses.filter(
			(lens) => lens.command?.command === "pyDepsHint.openOnPyPI",
		);
		const version = lenses.filter(
			(lens) => lens.command?.command !== "pyDepsHint.openOnPyPI",
		);
		return { pypi: pypi.length, version: version.length };
	}

	it("does not create an update lens for bare, marker-only, or URL requirements", () => {
		const content = [
			"requests",
			"flask==2.0.0",
			"pkg @ https://example.com/pkg-1.0.0.tar.gz",
			'requests ; python_version >= "3.8"',
			"django~=4.2",
		].join("\n");
		const counts = countLenses(content, "requirements.txt", "pip-requirements");
		assert.strictEqual(counts.pypi, 5);
		assert.strictEqual(counts.version, 2);
	});

	it("does not create an update lens for unversioned pyproject dependencies", () => {
		const content = `[project]
name = "demo"
dependencies = [
    "requests",
    "flask>=2.0",
    "pkg @ https://example.com/pkg-1.0.0.tar.gz",
    'requests ; python_version >= "3.8"',
]
`;
		const counts = countLenses(content, "pyproject.toml", "toml");
		assert.strictEqual(counts.pypi, 4);
		assert.strictEqual(counts.version, 1);
	});
});
