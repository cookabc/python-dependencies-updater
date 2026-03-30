import * as assert from "assert";
import { parsePyProjectDocument } from "../../core/pyprojectParser";

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
});
