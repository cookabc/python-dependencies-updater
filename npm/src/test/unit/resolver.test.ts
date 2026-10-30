import * as assert from "assert";
import { VersionResolver } from "../../core/versionResolver";
import { UpdateRisk } from "../../types";

describe("VersionResolver", () => {
	describe("isUpdateAvailable", () => {
		it("should detect updates", () => {
			assert.strictEqual(
				VersionResolver.isUpdateAvailable("1.0.0", "1.0.1"),
				true,
			);
			assert.strictEqual(
				VersionResolver.isUpdateAvailable("1.0.0", "2.0.0"),
				true,
			);
		});

		it("should return false for same version", () => {
			assert.strictEqual(
				VersionResolver.isUpdateAvailable("1.0.0", "1.0.0"),
				false,
			);
		});

		it("should return false for older version", () => {
			assert.strictEqual(
				VersionResolver.isUpdateAvailable("1.0.1", "1.0.0"),
				false,
			);
		});

		it("should handle carets and tildes", () => {
			// ^1.0.0 means >=1.0.0 <2.0.0.
			// If latest is 1.0.1, it is > 1.0.0 (coerced).
			assert.strictEqual(
				VersionResolver.isUpdateAvailable("^1.0.0", "1.0.1"),
				true,
			);
		});
	});

	describe("calculateUpdateRisk", () => {
		it("should identify patch updates as low risk", () => {
			assert.strictEqual(
				VersionResolver.calculateUpdateRisk("1.0.0", "1.0.1"),
				UpdateRisk.Low,
			);
		});

		it("should identify minor updates as medium risk", () => {
			assert.strictEqual(
				VersionResolver.calculateUpdateRisk("1.0.0", "1.1.0"),
				UpdateRisk.Medium,
			);
		});

		it("should identify major updates as high risk", () => {
			assert.strictEqual(
				VersionResolver.calculateUpdateRisk("1.0.0", "2.0.0"),
				UpdateRisk.High,
			);
		});
	});

	describe("formatNewVersion", () => {
		it("should preserve caret", () => {
			assert.strictEqual(
				VersionResolver.formatNewVersion("^1.0.0", "1.1.0"),
				"^1.1.0",
			);
		});

		it("should preserve tilde", () => {
			assert.strictEqual(
				VersionResolver.formatNewVersion("~1.0.0", "1.1.0"),
				"~1.1.0",
			);
		});

		it("should preserve exact version", () => {
			assert.strictEqual(
				VersionResolver.formatNewVersion("1.0.0", "1.1.0"),
				"1.1.0",
			);
		});
	});
});
