/**
 * UAT runner: launches a real VS Code with the built extension, a fixture
 * workspace and a local mock PyPI registry, then runs src/test/uat/suite.ts
 * (compiled to out/test/uat/suite.js) inside it.
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

// 每次从明确的旧版本开始，验证升级路径而非依赖上次测试的写回结果。
fs.writeFileSync(path.join(fixture, "requirements.txt"), 'flask==2.0.0\nrequests>=2.28.0\nnumpy>=1.24.0 ; python_version >= "3.9"\n');

const release = (yanked = false) => [{ yanked }];
const pypi = {
	flask: { summary: "Flask web framework", releases: { "2.0.0": release(), "2.1.0": release() } },
	requests: { summary: "Python HTTP for Humans", releases: { "2.28.0": release(), "2.31.0": release() } },
	numpy: { summary: "NumPy arrays", releases: { "1.24.0": release(), "1.26.0": release() } },
	starlette: { summary: "Starlette ASGI", releases: { "0.36.3": release(), "0.37.2": release() } },
	yankedpkg: { summary: "Only old files survive", releases: { "1.0.0": release(), "2.0.0": release(true) } },
	postpkg: { summary: "Post releases are final", releases: { "1.0.0": release(), "1.0.1.post1": release() } },
};

const server = http.createServer((req, res) => {
	const match = req.url?.match(/^\/pypi\/([^/]+)\/json/);
	if (match) {
		const data = pypi[decodeURIComponent(match[1])];
		if (!data) {
			res.writeHead(404).end("not found");
			return;
		}
		res.writeHead(200, { "content-type": "application/json" });
		res.end(JSON.stringify({ info: { summary: data.summary }, releases: data.releases }));
		return;
	}
	res.writeHead(404).end();
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
console.log(`mock PyPI on http://127.0.0.1:${port}`);

fs.mkdirSync(path.join(fixture, ".vscode"), { recursive: true });
fs.writeFileSync(
	path.join(fixture, ".vscode", "settings.json"),
	JSON.stringify({ "pyDepsHint.registryUrl": `http://127.0.0.1:${port}` }, null, 2),
);

try {
	await runTests({
		extensionDevelopmentPath: root,
		extensionTestsPath: path.join(root, "out", "test", "uat", "suite.js"),
		launchArgs: [fixture, "--disable-extensions", "--disable-gpu", `--user-data-dir=${profile}`],
		extensionTestsEnv: { UAT_FIXTURE: fixture, UAT_PYPI: `http://127.0.0.1:${port}` },
	});
	console.log("UAT PASSED");
} catch (err) {
	console.error("UAT FAILED:", err?.message ?? err);
	process.exitCode = 1;
} finally {
	server.close();
	fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
