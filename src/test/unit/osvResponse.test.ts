import * as assert from "node:assert";
import { queryVulnerabilities } from "../../providers/osvClient";

describe("OSV response completeness", () => {
	const original = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = original;
	});
	const reply = (body: unknown) => {
		globalThis.fetch = (async () =>
			({ ok: true, json: async () => body }) as Response) as typeof fetch;
	};
	it("does not report an incomplete response as no known vulnerabilities", async () => {
		reply({ results: [] });
		await assert.rejects(
			queryVulnerabilities([{ packageName: "pkg", version: "1.0.0" }]),
			/incomplete/,
		);
	});
	it("does not treat a query-level error as a clean result", async () => {
		reply({ results: [{ error: "unavailable" }] });
		await assert.rejects(
			queryVulnerabilities([{ packageName: "pkg", version: "1.0.0" }]),
			/incomplete/,
		);
	});
	it("accepts an explicit clean result for every queried version", async () => {
		reply({ results: [{}] });
		assert.strictEqual(
			(await queryVulnerabilities([{ packageName: "pkg", version: "1.0.0" }]))
				.size,
			0,
		);
	});
});
