import * as assert from "node:assert";
import {
	parsePyProjectDocument,
	poetryConstraintToPep440,
} from "../../core/pyprojectParser";

describe("PyProject Parser", () => {
	it("should parse [project] dependencies", () => {
		const content = `[project]
name = "my-project"
dependencies = [
    "flask==2.0.0",
    "requests>=2.28.0",
]`;
		const result = parsePyProjectDocument(content);
		assert.strictEqual(result.length, 2);
		assert.strictEqual(result[0].packageName, "flask");
		assert.strictEqual(result[0].versionSpecifier, "==2.0.0");
		assert.strictEqual(result[0].section, "project.dependencies");
		assert.strictEqual(result[1].packageName, "requests");
	});

	it("should parse [project.optional-dependencies]", () => {
		const content = `[project.optional-dependencies]
dev = [
    "pytest>=7.0.0",
    "black>=23.0.0",
]`;
		const result = parsePyProjectDocument(content);
		assert.strictEqual(result.length, 2);
		assert.strictEqual(result[0].section, "project.optional-dependencies");
		assert.strictEqual(result[0].extra, "dev");
		assert.strictEqual(result[0].packageName, "pytest");
	});

	it("should parse inline arrays", () => {
		const content = `[project]
name = "test"
dependencies = ["flask==2.0.0", "requests>=2.28.0"]`;
		const result = parsePyProjectDocument(content);
		assert.strictEqual(result.length, 2);
		assert.strictEqual(result[0].packageName, "flask");
		assert.strictEqual(result[1].packageName, "requests");
	});

	it("should parse inline optional-dependencies arrays", () => {
		const content = `[project.optional-dependencies]
dev = ["pytest>=7.0", "black>=23.0"]`;
		const result = parsePyProjectDocument(content);
		assert.strictEqual(result.length, 2);
		assert.strictEqual(result[0].extra, "dev");
	});

	it("should skip comments and empty lines", () => {
		const content = `[project]
dependencies = [
    # this is a comment
    "flask==2.0.0",

    "requests>=2.28.0",
]`;
		const result = parsePyProjectDocument(content);
		assert.strictEqual(result.length, 2);
	});

	it("should handle packages with extras", () => {
		const content = `[project]
dependencies = [
    "uvicorn[standard]==0.20.0",
]`;
		const result = parsePyProjectDocument(content);
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].packageName, "uvicorn");
	});

	it("should handle empty dependencies array", () => {
		const content = `[project]
dependencies = []`;
		const result = parsePyProjectDocument(content);
		assert.strictEqual(result.length, 0);
	});

	it("should handle multiple optional dependency groups", () => {
		const content = `[project.optional-dependencies]
dev = [
    "pytest>=7.0.0",
]
docs = [
    "sphinx>=5.0",
]`;
		const result = parsePyProjectDocument(content);
		assert.strictEqual(result.length, 2);
		assert.strictEqual(result[0].extra, "dev");
		assert.strictEqual(result[1].extra, "docs");
	});

	it("should return empty for non-pyproject content", () => {
		const content = `[tool.black]
line-length = 88`;
		const result = parsePyProjectDocument(content);
		assert.strictEqual(result.length, 0);
	});

	describe("PEP 735 [dependency-groups]", () => {
		it("parses a dependency group", () => {
			const content = `[dependency-groups]
dev = [
    "pytest>=7.0.0",
    "ruff==0.5.0",
]`;
			const result = parsePyProjectDocument(content);
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].packageName, "pytest");
			assert.strictEqual(result[0].versionSpecifier, ">=7.0.0");
			assert.strictEqual(result[0].section, "dependency-groups");
			assert.strictEqual(result[0].extra, "dev");
			assert.strictEqual(result[1].packageName, "ruff");
		});

		it("parses several groups in one table", () => {
			const content = `[dependency-groups]
dev = ["pytest>=7.0.0"]
docs = ["sphinx>=5.0"]`;
			const result = parsePyProjectDocument(content);
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].extra, "dev");
			assert.strictEqual(result[1].extra, "docs");
			assert.strictEqual(result[1].section, "dependency-groups");
		});

		it("skips include-group tables, which carry no version", () => {
			const content = `[dependency-groups]
test = [
    {include-group = "dev"},
    "pytest>=7.0.0",
]`;
			const result = parsePyProjectDocument(content);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].packageName, "pytest");
		});

		it("keeps the same requirement in two groups on its own lines", () => {
			const content = `[dependency-groups]
dev = [
    "pytest>=7.0.0",
]
test = [
    "pytest>=7.0.0",
]`;
			const result = parsePyProjectDocument(content);
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].extra, "dev");
			assert.strictEqual(result[1].extra, "test");
			assert.notStrictEqual(result[0].line, result[1].line);
		});

		it("parses groups alongside project dependencies", () => {
			const content = `[project]
name = "demo"
dependencies = [
    "flask==2.0.0",
]

[dependency-groups]
dev = [
    "pytest>=7.0.0",
]`;
			const result = parsePyProjectDocument(content);
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].section, "project.dependencies");
			assert.strictEqual(result[1].section, "dependency-groups");
			assert.strictEqual(result[1].extra, "dev");
		});
	});

	describe("Poetry tables", () => {
		it("parses [tool.poetry.dependencies]", () => {
			const content = `[tool.poetry.dependencies]
requests = "^2.31.0"
flask = "^3.0"
`;
			const result = parsePyProjectDocument(content);
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].packageName, "requests");
			assert.strictEqual(result[0].versionSpecifier, ">=2.31.0,<3.0.0");
			assert.strictEqual(result[0].section, "tool.poetry.dependencies");
		});

		it("reads the version out of an inline table", () => {
			const content = `[tool.poetry.dependencies]
flask = { version = "^3.0", extras = ["async"] }
`;
			const result = parsePyProjectDocument(content);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].packageName, "flask");
			assert.strictEqual(result[0].versionSpecifier, ">=3.0,<4.0");
		});

		it("skips the python constraint, which is not a PyPI package", () => {
			const content = `[tool.poetry.dependencies]
python = "^3.11"
requests = "^2.31.0"
`;
			const result = parsePyProjectDocument(content);
			assert.deepStrictEqual(
				result.map((d) => d.packageName),
				["requests"],
			);
		});

		it("skips git and path sources, which have no registry version", () => {
			const content = `[tool.poetry.dependencies]
django = { git = "https://github.com/django/django.git" }
mylib = { path = "../mylib" }
requests = "^2.31.0"
`;
			const result = parsePyProjectDocument(content);
			assert.deepStrictEqual(
				result.map((d) => d.packageName),
				["requests"],
			);
		});

		it("parses dev-dependencies and group dependencies", () => {
			const content = `[tool.poetry.dev-dependencies]
black = "^24.0"

[tool.poetry.group.docs.dependencies]
sphinx = "^7.0"
`;
			const result = parsePyProjectDocument(content);
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].section, "tool.poetry.dev-dependencies");
			assert.strictEqual(result[1].section, "tool.poetry.group");
			assert.strictEqual(result[1].extra, "docs");
		});

		it("does not confuse a name repeated across tables", () => {
			const content = `[tool.poetry.dependencies]
pytest = "^7.0"

[tool.poetry.group.dev.dependencies]
pytest = "^8.0"
`;
			const result = parsePyProjectDocument(content);
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].versionSpecifier, ">=7.0,<8.0");
			assert.strictEqual(result[1].versionSpecifier, ">=8.0,<9.0");
			assert.notStrictEqual(result[0].line, result[1].line);
		});
	});

	describe("poetryConstraintToPep440", () => {
		it("converts caret ranges at the first non-zero segment", () => {
			assert.strictEqual(
				poetryConstraintToPep440("^2.31.0"),
				">=2.31.0,<3.0.0",
			);
			assert.strictEqual(poetryConstraintToPep440("^0.2.3"), ">=0.2.3,<0.3.0");
			assert.strictEqual(poetryConstraintToPep440("^0.0.3"), ">=0.0.3,<0.0.4");
		});

		it("converts tilde ranges at the minor segment", () => {
			assert.strictEqual(poetryConstraintToPep440("~1.2.3"), ">=1.2.3,<1.3.0");
			assert.strictEqual(poetryConstraintToPep440("~1.2"), ">=1.2,<1.3.0");
			assert.strictEqual(poetryConstraintToPep440("~1"), ">=1,<2.0.0");
		});

		it("passes PEP 440 constraints through untouched", () => {
			assert.strictEqual(poetryConstraintToPep440(">=1.0,<2.0"), ">=1.0,<2.0");
			assert.strictEqual(poetryConstraintToPep440("==1.2.3"), "==1.2.3");
			assert.strictEqual(poetryConstraintToPep440("*"), "*");
		});
	});
});
