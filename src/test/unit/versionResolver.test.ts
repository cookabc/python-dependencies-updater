import * as assert from "node:assert";
import {
	compareVersions,
	isPrerelease,
	parseSpecifier,
	parseVersion,
	resolve,
	satisfies,
} from "../../core/versionResolver";

describe("Version Resolver", () => {
	describe("parseVersion", () => {
		it("should parse simple versions", () => {
			assert.deepStrictEqual(parseVersion("1.0.0"), [1, 0, 0]);
			assert.deepStrictEqual(parseVersion("2.1"), [2, 1, 0]);
		});

		it("should ignore pre-release tags for parsing", () => {
			assert.deepStrictEqual(parseVersion("1.0.0-alpha"), [1, 0, 0]);
			assert.deepStrictEqual(parseVersion("2.1.0rc1"), [2, 1, 0]);
		});
	});

	describe("compareVersions", () => {
		it("should correctly compare standard versions", () => {
			assert.strictEqual(compareVersions("1.0.0", "1.0.1"), -1);
			assert.strictEqual(compareVersions("1.1.0", "1.0.9"), 1);
			assert.strictEqual(compareVersions("1.0.0", "1.0.0"), 0);
		});

		it("should handle pre-release versions", () => {
			assert.strictEqual(compareVersions("1.0.0-alpha", "1.0.0"), -1);
			assert.strictEqual(compareVersions("1.0.0", "1.0.0-beta"), 1);
		});

		it("should correctly compare standard versions", () => {
			assert.strictEqual(compareVersions("1.0.0", "1.0.1"), -1);
			assert.strictEqual(compareVersions("1.1.0", "1.0.9"), 1);
			assert.strictEqual(compareVersions("1.0.0", "1.0.0"), 0);
			assert.strictEqual(compareVersions("2.0.0", "1.0.0"), 1);
		});

		it("should correctly compare pre-release versions (alpha < beta < rc)", () => {
			// alpha < beta
			assert.strictEqual(compareVersions("1.0.0a1", "1.0.0b1"), -1);
			assert.strictEqual(compareVersions("1.0.0alpha1", "1.0.0beta1"), -1);

			// beta < rc
			assert.strictEqual(compareVersions("1.0.0b1", "1.0.0rc1"), -1);
			assert.strictEqual(compareVersions("1.0.0beta1", "1.0.0pre1"), -1);

			// rc < final
			assert.strictEqual(compareVersions("1.0.0rc1", "1.0.0"), -1);

			// dev < alpha
			assert.strictEqual(compareVersions("1.0.0dev1", "1.0.0a1"), -1);
		});

		it("should correctly compare post-release versions", () => {
			// final < post
			assert.strictEqual(compareVersions("1.0.0", "1.0.0.post1"), -1);

			// post1 < post2
			assert.strictEqual(compareVersions("1.0.0.post1", "1.0.0.post2"), -1);
		});

		it("should correctly compare pre-release numbers", () => {
			assert.strictEqual(compareVersions("1.0.0a1", "1.0.0a2"), -1);
			assert.strictEqual(compareVersions("1.0.0b1", "1.0.0b2"), -1);
			assert.strictEqual(compareVersions("1.0.0rc1", "1.0.0rc2"), -1);
		});

		it("should correctly compare numeric parts vs pre-release", () => {
			// 1.0.0 < 1.0.1a1
			assert.strictEqual(compareVersions("1.0.0", "1.0.1a1"), -1);
			// 1.0.1a1 < 1.0.1
			assert.strictEqual(compareVersions("1.0.1a1", "1.0.1"), -1);
		});

		it("should handle complex pre-release patterns", () => {
			assert.strictEqual(compareVersions("1.0.0a1", "1.0.0.a1"), 0);
		});

		it("orders a pre-release post segment before the final release", () => {
			// 1.0.0rc1.post1 is still an rc; the post segment only orders it
			// among other rcs. It must not sort above 1.0.0.
			assert.strictEqual(compareVersions("1.0.0rc1.post1", "1.0.0rc1"), 1);
			assert.strictEqual(compareVersions("1.0.0rc1.post1", "1.0.0"), -1);
			assert.strictEqual(compareVersions("1.0.0rc1.post1", "1.0.0rc2"), -1);
		});

		it("orders epochs ahead of the release numbers", () => {
			assert.strictEqual(compareVersions("1!1.0", "2.0"), 1);
			assert.strictEqual(compareVersions("1!0.1", "2020.1"), 1);
			assert.strictEqual(compareVersions("1!1.0", "1!2.0"), -1);
			assert.strictEqual(compareVersions("1!9.9", "2!0.1"), -1);
			assert.strictEqual(compareVersions("1.0", "1!1.0"), -1);
		});

		it("orders local versions after the plain release", () => {
			assert.strictEqual(compareVersions("1.0", "1.0+cpu"), -1);
			assert.strictEqual(compareVersions("1.0+aaa", "1.0+abc"), -1);
			assert.strictEqual(compareVersions("1.0+abc", "1.0+1"), -1);
			assert.strictEqual(compareVersions("1.0+ubuntu-1", "1.0+ubuntu.1"), 0);
			assert.strictEqual(compareVersions("1.0+5", "1.0+5.0"), -1);
		});

		it("treats separator and spelling aliases as the same version", () => {
			assert.strictEqual(compareVersions("1.0a1", "1.0.alpha.1"), 0);
			assert.strictEqual(compareVersions("1.0c1", "1.0rc1"), 0);
			assert.strictEqual(compareVersions("1.0pre1", "1.0preview1"), 0);
			assert.strictEqual(compareVersions("1.0-1", "1.0.post1"), 0);
			assert.strictEqual(compareVersions("1.0r1", "1.0.rev1"), 0);
			assert.strictEqual(compareVersions("v1.0.0", "1.0"), 0);
		});

		it("follows the PEP 440 version ordering examples", () => {
			const ordered = [
				"1.0.dev456",
				"1.0a1",
				"1.0a2.dev456",
				"1.0a12.dev456",
				"1.0a12",
				"1.0b1.dev456",
				"1.0b2",
				"1.0b2.post345.dev456",
				"1.0b2.post345",
				"1.0rc1.dev456",
				"1.0rc1",
				"1.0",
				"1.0.post456.dev34",
				"1.0.post456",
				"1.1.dev1",
			];
			for (let i = 0; i < ordered.length - 1; i++) {
				assert.strictEqual(
					compareVersions(ordered[i], ordered[i + 1]),
					-1,
					`${ordered[i]} should be < ${ordered[i + 1]}`,
				);
			}
		});
	});

	describe("satisfies", () => {
		it("should handle == operator", () => {
			assert.strictEqual(
				satisfies("1.0.0", [{ operator: "==", version: "1.0.0" }]),
				true,
			);
			assert.strictEqual(
				satisfies("1.0.1", [{ operator: "==", version: "1.0.0" }]),
				false,
			);
		});

		it("should handle >= operator", () => {
			assert.strictEqual(
				satisfies("1.1.0", [{ operator: ">=", version: "1.0.0" }]),
				true,
			);
			assert.strictEqual(
				satisfies("0.9.0", [{ operator: ">=", version: "1.0.0" }]),
				false,
			);
		});

		it("should reflect multiple constraints", () => {
			const constraints = [
				{ operator: ">=", version: "1.0.0" } as any,
				{ operator: "<", version: "2.0.0" } as any,
			];
			assert.strictEqual(satisfies("1.5.0", constraints), true);
			assert.strictEqual(satisfies("2.0.0", constraints), false);
			assert.strictEqual(satisfies("0.9.9", constraints), false);
		});
	});

	describe("resolve", () => {
		const versions = ["0.9.0", "1.0.0", "1.1.0", "1.2.0-beta", "2.0.0"];

		it("should find latest compatible version", () => {
			const result = resolve(versions, ">=1.0.0,<2.0.0");
			assert.strictEqual(result.found, true);
			assert.strictEqual(result.version, "1.1.0");
		});

		it("should ignore pre-releases by default", () => {
			const result = resolve(versions, ">=1.0.0");
			assert.strictEqual(result.found, true);
			assert.strictEqual(result.version, "2.0.0");
			assert.notStrictEqual(result.version, "1.2.0-beta");
		});

		it("should include pre-releases if requested", () => {
			// If the constraint allows it and we enable includePrerelease
			// But standard resolve implementation filters them out unless explicitly matched or flag set?
			// The current implementation filters `!includePrerelease && isPrerelease(v)`
			const result = resolve(versions, ">=1.1.0", true);
			assert.strictEqual(result.found, true);
			assert.strictEqual(result.version, "2.0.0"); // 2.0.0 is > 1.2.0-beta

			// Let's try to match ONLY the beta
			const betaVersions = ["1.2.0-beta"];
			const res = resolve(betaVersions, ">=1.0.0", true);
			assert.strictEqual(res.found, true);
			assert.strictEqual(res.version, "1.2.0-beta");
		});
	});

	describe("~= compatible release operator (PEP 440)", () => {
		it("~=X.Y.Z should allow same major.minor", () => {
			// ~=1.4.2 means >=1.4.2, ==1.4.*
			assert.strictEqual(
				satisfies("1.4.5", [{ operator: "~=", version: "1.4.2" }]),
				true,
			);
			assert.strictEqual(
				satisfies("1.4.2", [{ operator: "~=", version: "1.4.2" }]),
				true,
			);
		});

		it("~=X.Y.Z should reject different minor", () => {
			assert.strictEqual(
				satisfies("1.5.0", [{ operator: "~=", version: "1.4.2" }]),
				false,
			);
		});

		it("~=X.Y.Z should reject lower version", () => {
			assert.strictEqual(
				satisfies("1.4.1", [{ operator: "~=", version: "1.4.2" }]),
				false,
			);
		});

		it("~=X.Y should allow same major", () => {
			// ~=2.1 means >=2.1, ==2.*
			assert.strictEqual(
				satisfies("2.1.0", [{ operator: "~=", version: "2.1" }]),
				true,
			);
			assert.strictEqual(
				satisfies("2.5.0", [{ operator: "~=", version: "2.1" }]),
				true,
			);
		});

		it("~=X.Y should reject different major", () => {
			assert.strictEqual(
				satisfies("3.0.0", [{ operator: "~=", version: "2.1" }]),
				false,
			);
		});

		it("~=X.Y should reject lower version", () => {
			assert.strictEqual(
				satisfies("2.0.0", [{ operator: "~=", version: "2.1" }]),
				false,
			);
		});

		it("should resolve with ~= constraint", () => {
			const versions = ["1.3.0", "1.4.0", "1.4.5", "1.5.0", "2.0.0"];
			const result = resolve(versions, "~=1.4.0");
			assert.strictEqual(result.found, true);
			assert.strictEqual(result.version, "1.4.5");
		});

		it("requires the same epoch for a compatible release", () => {
			assert.strictEqual(satisfies("1!1.5", parseSpecifier("~=1!1.0")), true);
			assert.strictEqual(satisfies("1.5", parseSpecifier("~=1!1.0")), false);
			assert.strictEqual(satisfies("2!1.5", parseSpecifier("~=1!1.0")), false);
		});
	});

	describe("PEP 440 pre-release and local versions", () => {
		it("sees a pre-release hidden by a local label", () => {
			assert.strictEqual(isPrerelease("1.0rc1+cpu"), true);
			assert.strictEqual(isPrerelease("1.0.0rc1.post1"), true);
			assert.strictEqual(isPrerelease("1.0.0.post1.dev1"), true);
			assert.strictEqual(isPrerelease("1.0+cpu"), false);
			assert.strictEqual(isPrerelease("1.0.0.post1"), false);
		});

		it("does not suggest a local pre-release over the final release", () => {
			const result = resolve(
				["1.0rc1+cpu", "1.0.0rc1.post1", "1.0.0", "1.0+cpu"],
				"",
			);
			assert.strictEqual(result.found, true);
			assert.strictEqual(result.version, "1.0+cpu");
		});

		it("picks the highest epoch", () => {
			const result = resolve(["2020.1", "2.0.0", "1!0.1"], "");
			assert.strictEqual(result.version, "1!0.1");
		});

		it("strips the epoch before exposing release numbers", () => {
			assert.deepStrictEqual(parseVersion("1!2.1.0"), [2, 1, 0]);
			assert.deepStrictEqual(parseVersion("v1.2.3"), [1, 2, 3]);
		});

		it("ignores local versions on == unless the specifier has one", () => {
			assert.strictEqual(
				satisfies("1.2.3+cpu", parseSpecifier("==1.2.3")),
				true,
			);
			assert.strictEqual(
				satisfies("1.2.3+cpu", parseSpecifier("==1.2.3+cpu")),
				true,
			);
			assert.strictEqual(
				satisfies("1.2.3+gpu", parseSpecifier("==1.2.3+cpu")),
				false,
			);
			assert.strictEqual(
				satisfies("1.2.3", parseSpecifier("==1.2.3+cpu")),
				false,
			);
		});

		it("matches wildcard prefixes only inside the same epoch", () => {
			assert.strictEqual(
				satisfies("1!1.2.3", parseSpecifier("==1.2.*")),
				false,
			);
			assert.strictEqual(
				satisfies("1!1.2.3", parseSpecifier("==1!1.2.*")),
				true,
			);
			assert.strictEqual(satisfies("1.2", parseSpecifier("==1.2.0.*")), true);
		});
	});
});
