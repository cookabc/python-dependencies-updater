import * as assert from "assert";
import { PackageJsonParser } from "../../core/packageJsonParser";

describe("PackageJsonParser", () => {
	it("should parse dependencies correctly", () => {
		const parser = new PackageJsonParser();
		const json = `{
            "dependencies": {
                "react": "^18.0.0"
            },
            "devDependencies": {
                "typescript": "5.0.0"
            }
        }`;
		const deps = parser.parse(json);

		assert.strictEqual(deps.length, 2);

		const react = deps.find((d) => d.name === "react");
		assert.ok(react);
		assert.strictEqual(react!.currentVersion, "^18.0.0");
		assert.strictEqual(react!.isDev, false);

		const ts = deps.find((d) => d.name === "typescript");
		assert.ok(ts);
		assert.strictEqual(ts!.currentVersion, "5.0.0");
		assert.strictEqual(ts!.isDev, true);
	});

	it("should handle empty files", () => {
		const parser = new PackageJsonParser();
		const deps = parser.parse("");
		assert.strictEqual(deps.length, 0);
	});

	it("should handle files without dependencies", () => {
		const parser = new PackageJsonParser();
		const deps = parser.parse('{"name": "test"}');
		assert.strictEqual(deps.length, 0);
	});
});
