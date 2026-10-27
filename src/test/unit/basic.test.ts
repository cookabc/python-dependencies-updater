import * as assert from "node:assert";
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

	it("parses a requirements file that only contains extras", () => {
		const content = "requests[security]>=2.0\nuvicorn[standard]==0.20.0\n";
		const result = parseDependencies("requirements.txt", content);
		assert.strictEqual(result.length, 2);
		assert.strictEqual(result[0].packageName, "requests");
		assert.strictEqual(result[0].versionSpecifier, ">=2.0");
		assert.strictEqual(result[1].packageName, "uvicorn");
		assert.strictEqual(result[1].versionSpecifier, "==0.20.0");
	});

	it("detects an extras-only dependency list without a requirements file name", () => {
		const content = "requests[security,socks]>=2.0\n";
		const detection = detectFileType("deps.txt", content);
		assert.strictEqual(detection.type, FileType.Requirements);
		assert.strictEqual(detection.isValid, true);
		const result = parseDependencies("deps.txt", content);
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].packageName, "requests");
		assert.strictEqual(result[0].versionSpecifier, ">=2.0");
	});
});
