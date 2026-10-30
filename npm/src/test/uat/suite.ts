/**
 * UAT suite — runs inside a real VS Code instance launched by scripts/uat.mjs.
 * Exercises the extension end-to-end against a local mock npm registry.
 */
import * as assert from "node:assert";
import * as path from "node:path";
import * as vscode from "vscode";
import { PackageJsonParser } from "../../core/packageJsonParser";
import { VersionService } from "../../providers/versionService";

const NPM = process.env.UAT_NPM ?? "http://127.0.0.1:0";
const FIXTURE =
	process.env.UAT_FIXTURE ??
	path.resolve(__dirname, "../../../scripts/uat-fixture");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const parser = new PackageJsonParser();

async function lensesFor(doc: vscode.TextDocument): Promise<vscode.CodeLens[]> {
	return (
		(await vscode.commands.executeCommand<vscode.CodeLens[]>(
			"vscode.executeCodeLensProvider",
			doc.uri,
			200,
		)) ?? []
	);
}

interface LensSummary {
	title: string;
	cmd: string;
	args: unknown[];
}

function summarize(lenses: vscode.CodeLens[]): LensSummary[] {
	return lenses.map((l) => ({
		title: l.command?.title ?? "(no command)",
		cmd: l.command?.command ?? "(none)",
		args: l.command?.arguments ?? [],
	}));
}

async function waitForLenses(
	doc: vscode.TextDocument,
	pred: (lenses: vscode.CodeLens[]) => boolean,
	timeoutMs = 20000,
): Promise<vscode.CodeLens[]> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const lenses = await lensesFor(doc);
		if (pred(lenses)) {
			return lenses;
		}
		if (Date.now() > deadline) {
			assert.fail(
				`lenses did not settle; got:\n${JSON.stringify(summarize(lenses), null, 1)}`,
			);
		}
		await sleep(300);
	}
}

export async function run(): Promise<void> {
	const pkgDoc = await vscode.workspace.openTextDocument(
		path.join(FIXTURE, "package.json"),
	);

	// ---------- lenses resolve against the mock registry ----------
	const lenses = await waitForLenses(pkgDoc, (ls) => {
		const updateLenses = ls.filter(
			(l) => l.command?.command === "npmDeps.updateVersion",
		);
		return updateLenses.length >= 2;
	});
	// 5 dependencies (3 deps + 1 dev + 1 peer) × 2 lenses each
	assert.strictEqual(lenses.length, 10, `expected 10 lenses`);

	// react: 17.0.2 → 17.0.3 (patch, no modal)
	const reactLens = lenses.find(
		(l) =>
			l.command?.command === "npmDeps.updateVersion" &&
			l.command.arguments?.[2] === "react",
	);
	assert.ok(reactLens, "no update lens for react");
	assert.ok(
		String(reactLens.command?.title).includes("17.0.3"),
		`react lens should suggest 17.0.3, got: ${reactLens.command?.title}`,
	);

	// ---------- hover uses the FULL document for description/homepage ----------
	const text = pkgDoc.getText();
	const reactNameOffset = text.indexOf('"react"') + 1; // inside the key
	const hoverPos = pkgDoc.positionAt(reactNameOffset);
	const hovers =
		(await vscode.commands.executeCommand<vscode.Hover[]>(
			"vscode.executeHoverProvider",
			pkgDoc.uri,
			hoverPos,
		)) ?? [];
	const hoverText = hovers
		.flatMap((h) => h.contents)
		.map((c) => (c instanceof vscode.MarkdownString ? c.value : String(c)))
		.join("\n");
	assert.ok(
		hoverText.includes("React is a library for building user interfaces"),
		`hover should carry the full-document description, got: ${hoverText}`,
	);
	assert.ok(
		hoverText.includes("https://react.dev"),
		`hover should carry the homepage link, got: ${hoverText}`,
	);

	// ---------- updateVersion survives a stale range ----------
	// Capture react's version range, then edit the document above it so the
	// captured offsets no longer point at the version string.
	const deps = parser.parse(pkgDoc.getText());
	const reactDep = deps.find((d) => d.name === "react")!;
	const staleRange = new vscode.Range(
		pkgDoc.positionAt(reactDep.versionRange.start),
		pkgDoc.positionAt(reactDep.versionRange.end),
	);
	const firstLine = new vscode.Position(0, 0);
	const edit = new vscode.WorkspaceEdit();
	edit.insert(pkgDoc.uri, firstLine, "// a comment line inserted above\n");
	await vscode.workspace.applyEdit(edit);

	await vscode.commands.executeCommand(
		"npmDeps.updateVersion",
		pkgDoc.uri,
		staleRange,
		"react",
		"17.0.2",
		"17.0.3",
	);
	const updatedText = pkgDoc.getText();
	assert.ok(
		updatedText.includes('"react": "17.0.3"'),
		`react should be bumped despite the stale range:\n${updatedText}`,
	);
	assert.ok(
		updatedText.includes("// a comment line inserted above"),
		"the inserted comment must survive the update",
	);
	// nothing else may have been touched by the stale-range replacement
	assert.strictEqual(
		(updatedText.match(/17\.0\.3/g) ?? []).length,
		1,
		"exactly one 17.0.3 in the document",
	);

	// ---------- 404 → error lens with retry ----------
	// nullpkg 404s; after its fetch fails the lens offers the retry command
	const nullLens = await waitForLenses(pkgDoc, (ls) =>
		Boolean(
			ls.find(
				(l) =>
					l.command?.command === "npmDeps.retryFetch" &&
					l.command.arguments?.[0] === "nullpkg",
			),
		),
	);
	const retryLens = nullLens.find(
		(l) =>
			l.command?.command === "npmDeps.retryFetch" &&
			l.command.arguments?.[0] === "nullpkg",
	)!;
	assert.ok(
		String(retryLens.command?.title).includes("Check failed"),
		`error lens should say check failed, got: ${retryLens.command?.title}`,
	);

	// ---------- Update All: bumps non-peer, leaves peer and unknown alone ----------
	await vscode.window.showTextDocument(pkgDoc);
	await vscode.commands.executeCommand("npmDeps.updateAllVersions");
	const afterAll = pkgDoc.getText();
	assert.ok(
		afterAll.includes('"react": "17.0.3"'),
		`react should stay at 17.0.3 after update-all:\n${afterAll}`,
	);
	assert.ok(
		afterAll.includes('"@scope/thing": "1.1.0"'),
		`@scope/thing should be bumped to 1.1.0:\n${afterAll}`,
	);
	assert.ok(
		afterAll.includes('"leftpad": "1.3.0"'),
		"leftpad is already up to date",
	);
	assert.ok(
		afterAll.includes('"react-dom": "^17.0.0"'),
		`peerDependencies must not be batch-updated:\n${afterAll}`,
	);
	assert.ok(
		afterAll.includes('"nullpkg": "^1.0.0"'),
		"unknown package must be left alone",
	);

	// ---------- negative cache suppresses repeat fetches ----------
	async function stats(): Promise<{ notFoundHits: string[] }> {
		const res = await fetch(`${NPM}/__stats`);
		return (await res.json()) as { notFoundHits: string[] };
	}
	const nullHits = (s: { notFoundHits: string[] }) =>
		s.notFoundHits.filter((entry) => entry.startsWith("nullpkg")).length;
	const before = nullHits(await stats());
	// A hover would re-request without the negative cache
	await vscode.commands.executeCommand(
		"vscode.executeHoverProvider",
		pkgDoc.uri,
		pkgDoc.positionAt(pkgDoc.getText().indexOf('"nullpkg"') + 1),
	);
	await sleep(500);
	const after = nullHits(await stats());
	assert.strictEqual(
		after,
		before,
		`hover on a failed package must be served from the negative cache (${before} -> ${after})`,
	);

	// ---------- showPrerelease picks the pre-release as latest ----------
	const service = new VersionService(60, NPM, undefined, true);
	const withPre = await service.getPackageInfo("prerelease-pkg");
	assert.strictEqual(withPre?.latestVersion, "2.0.0-beta.1");
	const service2 = new VersionService(60, NPM, undefined, false);
	const withoutPre = await service2.getPackageInfo("prerelease-pkg");
	assert.strictEqual(withoutPre?.latestVersion, "1.9.0");

	console.log("UAT suite finished OK");
}
