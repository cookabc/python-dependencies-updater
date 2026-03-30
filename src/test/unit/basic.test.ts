import * as assert from "assert";
import {
  detectFileType,
  FileType,
  parseDependencies,
} from "../../core/unifiedParser";

describe("Unified Parser - File Variants", () => {
  it("should detect requirements-dev.txt as requirements format", () => {
    const result = detectFileType("requirements-dev.txt", "flask==2.0.0");
    assert.strictEqual(result.type, FileType.Requirements);
    assert.strictEqual(result.isValid, true);
  });

  it("should detect requirements-test.txt as requirements format", () => {
    const result = detectFileType("requirements-test.txt", "pytest>=7.0");
    assert.strictEqual(result.type, FileType.Requirements);
    assert.strictEqual(result.isValid, true);
  });

  it("should parse dependencies from requirements-dev.txt", () => {
    const content = "pytest>=7.0.0\nblack>=23.0.0";
    const result = parseDependencies("requirements-dev.txt", content);
    assert.strictEqual(result.length, 2);
  });
});
