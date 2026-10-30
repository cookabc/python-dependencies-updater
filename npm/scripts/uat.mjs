/**
 * UAT runner: launches a real VS Code with the built extension, a fixture
 * workspace and a local mock npm registry, then runs
 * src/test/uat/suite.ts (compiled to out/test/uat/suite.js) inside it.
 *
 * The mock serves abbreviated (corgi) metadata for the Accept header the
 * client sends and a version manifest for the hover-detail fetch, so the
 * description/homepage path is exercised without a full packument.
 *
 * Usage: npm run uat
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
// 隔离测试输入与短路径配置目录，避免修改仓库样例或超出 socket 路径限制。
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "vsc-uat-"));
const fixture = path.join(sandbox, "workspace");
const profile = path.join(sandbox, "profile");
fs.cpSync(path.join(here, "uat-fixture"), fixture, { recursive: true });

const corgi = (latest, versions) => ({
	name: "x",
	"dist-tags": { latest },
	versions: Object.fromEntries(versions.map((v) => [v, {}])),
});
const full = (data) => data;

const registry = {
	react: {
		corgi: corgi("17.0.3", ["17.0.2", "17.0.3"]),
		full: full({
			name: "react",
			description: "React is a library for building user interfaces",
			homepage: "https://react.dev",
			"dist-tags": { latest: "17.0.3" },
			versions: { "17.0.2": {}, "17.0.3": {} },
		}),
	},
	"@scope/thing": {
		corgi: corgi("1.1.0", ["1.0.0", "1.1.0"]),
		full: full({ name: "@scope/thing", description: "A scoped thing" }),
	},
	"react-dom": {
		corgi: corgi("18.2.0", ["17.0.2", "18.2.0"]),
		full: full({ name: "react-dom" }),
	},
	leftpad: {
		corgi: corgi("1.3.0", ["1.3.0"]),
		full: full({ name: "leftpad" }),
	},
	"prerelease-pkg": {
		corgi: corgi("1.9.0", ["1.9.0", "2.0.0-beta.1"]),
		full: full({ name: "prerelease-pkg" }),
	},
};

let corgiHits = 0;
const fullHits = {};
const notFoundHits = [];

const server = http.createServer((req, res) => {
	if ((req.url ?? "") === "/__stats") {
		res.writeHead(200, { "content-type": "application/json" });
		res.end(JSON.stringify({ corgiHits, fullHits, notFoundHits }));
		return;
	}
	const pathOnly = (req.url ?? "").split("?")[0];
	const segments = pathOnly.split("/").filter(Boolean);
	// Scoped names keep the slash encoded (`@scope%2Fpkg`), so the first
	// segment is the package and the second, when present, is the version.
	const name = decodeURIComponent(segments[0] ?? "");
	const version = segments[1] ? decodeURIComponent(segments.slice(1).join("/")) : undefined;
	const accept = req.headers.accept ?? "";
	if (!registry[name] || name === "nullpkg") {
		notFoundHits.push(`${name}(${accept.includes("install-v1") ? "corgi" : "full"})`);
		res.writeHead(404).end("not found");
		return;
	}
	if (accept.includes("vnd.npm.install-v1")) {
		corgiHits++;
		res.writeHead(200, { "content-type": "application/json" });
		res.end(JSON.stringify(registry[name].corgi));
		return;
	}
	// Hover asks for one version manifest, not the whole packument.
	if (version) {
		const key = `${name}@${version}`;
		fullHits[key] = (fullHits[key] ?? 0) + 1;
		const doc = registry[name].full;
		res.writeHead(200, { "content-type": "application/json" });
		res.end(
			JSON.stringify({
				name,
				version,
				description: doc.description,
				homepage: doc.homepage,
			}),
		);
		return;
	}
	fullHits[name] = (fullHits[name] ?? 0) + 1;
	res.writeHead(200, { "content-type": "application/json" });
	res.end(JSON.stringify(registry[name].full));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
console.log(`mock npm registry on http://127.0.0.1:${port}`);

fs.mkdirSync(path.join(fixture, ".vscode"), { recursive: true });
fs.writeFileSync(
	path.join(fixture, ".vscode", "settings.json"),
	JSON.stringify({ "npmDeps.registryUrl": `http://127.0.0.1:${port}` }, null, 2),
);

try {
	await runTests({
		extensionDevelopmentPath: root,
		extensionTestsPath: path.join(root, "out", "test", "uat", "suite.js"),
		launchArgs: [fixture, "--disable-extensions", "--disable-gpu", `--user-data-dir=${profile}`],
		extensionTestsEnv: { UAT_FIXTURE: fixture, UAT_NPM: `http://127.0.0.1:${port}` },
	});
	console.log("UAT PASSED");
} catch (err) {
	console.error("UAT FAILED:", err?.message ?? err);
	process.exitCode = 1;
} finally {
	server.close();
	fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
