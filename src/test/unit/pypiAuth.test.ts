/**
 * A private mirror (Artifactory, devpi, GitLab) answers only when the request
 * carries a bearer token. These tests pin the header behaviour so a token is
 * sent when configured and never invented when it is not.
 */
import * as assert from "node:assert";
import { fetchVersions } from "../../providers/pypiClient";

interface Captured {
	url: string;
	headers: Record<string, string>;
}

const originalFetch = globalThis.fetch;

function stubFetch(
	payload: unknown = { releases: { "1.0.0": [{}] } },
): Captured[] {
	const calls: Captured[] = [];
	globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
		calls.push({
			url: String(url),
			headers: { ...((init?.headers ?? {}) as Record<string, string>) },
		});
		return {
			ok: true,
			status: 200,
			json: async () => payload,
		} as unknown as Response;
	}) as unknown as typeof fetch;
	return calls;
}

describe("PyPI client authentication", () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("sends a bearer token when one is configured", async () => {
		const calls = stubFetch();
		await fetchVersions("requests", "https://mirror.example.com", "s3cret");
		assert.strictEqual(calls.length, 1);
		assert.strictEqual(calls[0].headers.Authorization, "Bearer s3cret");
	});

	it("sends no Authorization header for the public index", async () => {
		const calls = stubFetch();
		await fetchVersions("requests");
		assert.strictEqual(calls.length, 1);
		assert.strictEqual(calls[0].headers.Authorization, undefined);
	});

	it("does not send an empty token", async () => {
		const calls = stubFetch();
		await fetchVersions("requests", "https://mirror.example.com", "");
		assert.strictEqual(calls[0].headers.Authorization, undefined);
	});

	it("keeps the registry path in the request URL", async () => {
		const calls = stubFetch();
		await fetchVersions("requests", "https://mirror.example.com/pypi-proxy/");
		assert.strictEqual(
			calls[0].url,
			"https://mirror.example.com/pypi-proxy/pypi/requests/json",
		);
	});
});
