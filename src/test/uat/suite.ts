/**
 * UAT suite — runs inside a real VS Code instance launched by scripts/uat.mjs.
 * Exercises the extension end-to-end against a local mock PyPI registry.
 */
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

const PYPI = process.env.UAT_PYPI ?? "http://127.0.0.1:0";
const FIXTURE = path.resolve(__dirname, "../../../scripts/uat-fixture");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function lensesFor(doc: vscode.TextDocument): Promise<vscode.CodeLens[]> {
	return (
		(await vscode.commands.executeCommand<vscode.CodeLens[]>(
			"vscode.executeCodeLensProvider",
			doc.uri,
			200,
		)) ?? []
	);
}

function isSettled(lens: vscode.CodeLens): boolean {
	const cmd = lens.command?.command;
	const arg1 = lens.command?.arguments?.[1];
	if (cmd === "pyDepsHint.updateVersion") {
		return true;
	}
	return cmd === "pyDepsHint.showUpToDate" && arg1 !== "loading";
}

function settledCount(lenses: vscode.CodeLens[]): number {
	return lenses.filter(isSettled).length;
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
				`lenses did not settle; got:\n${JSON.stringify(
					lenses.map((l) => l.command?.title ?? "(no command)"),
					null,
					1,
				)}`,
			);
		}
		await sleep(300);
	}
}

function versionLens(
	lenses: vscode.CodeLens[],
	packageName: string,
): vscode.CodeLens {
	const dump = JSON.stringify(
		lenses.map((l) => ({
			title: l.command?.title,
			cmd: l.command?.command,
			args: l.command?.arguments?.slice(0, 3),
		})),
		null,
		1,
	);
	const found = lenses.find(
		(l) =>
			l.command?.command === "pyDepsHint.updateVersion" &&
			l.command.arguments?.[2] === packageName,
	);
	assert.ok(
		found,
		`no resolved version lens for ${packageName}; got:\n${dump}`,
	);
	return found;
}

function upToDateLens(
	lenses: vscode.CodeLens[],
	packageName: string,
): vscode.CodeLens {
	const dump = JSON.stringify(
		lenses
			.filter((l) => l.command?.arguments?.[0] === packageName)
			.map((l) => ({ title: l.command?.title, args: l.command?.arguments })),
	);
	const found = lenses.find(
		(l) =>
			l.command?.command === "pyDepsHint.showUpToDate" &&
			l.command.arguments?.[0] === packageName &&
			String(l.command.arguments?.[1]).match(/^\d/),
	);
	assert.ok(found, `no up-to-date lens for ${packageName}; got:\n${dump}`);
	return found;
}

export async function run(): Promise<void> {
	// ---------- requirements.txt ----------
	const reqDoc = await vscode.workspace.openTextDocument(
		path.join(FIXTURE, "requirements.txt"),
	);
	const reqLenses = await waitForLenses(reqDoc, (ls) => settledCount(ls) >= 3);

	// suggestion respects specifier + mock data; markers don't leak into it
	const flask = versionLens(reqLenses, "flask");
	assert.ok(
		String(flask.command?.title).includes("2.1.0"),
		`flask lens should suggest 2.1.0, got: ${flask.command?.title}`,
	);
	const numpy = versionLens(reqLenses, "numpy");
	assert.ok(
		String(numpy.command?.title).includes("1.26.0"),
		`numpy lens should suggest 1.26.0, got: ${numpy.command?.title}`,
	);

	// hover shows the mock summary from the registry
	const hovers =
		(await vscode.commands.executeCommand<vscode.Hover[]>(
			"vscode.executeHoverProvider",
			reqDoc.uri,
			new vscode.Position(0, 2),
		)) ?? [];
	const hoverText = hovers
		.flatMap((h) => h.contents)
		.map((c) => (c instanceof vscode.MarkdownString ? c.value : String(c)))
		.join("\n")
		.replace(/&nbsp;/g, " ");
	assert.ok(
		hoverText.includes("Flask web framework"),
		`hover should contain the registry summary, got: ${hoverText}`,
	);

	// update flask via its own lens arguments
	await vscode.commands.executeCommand(
		flask.command!.command,
		...flask.command!.arguments!,
	);
	assert.ok(
		reqDoc.getText().includes("flask==2.1.0"),
		`requirements.txt should have flask==2.1.0, got:\n${reqDoc.getText()}`,
	);

	// ---------- pyproject.toml: single-line array corruption fix ----------
	const ppDoc = await vscode.workspace.openTextDocument(
		path.join(FIXTURE, "pyproject.toml"),
	);
	const ppLenses = await waitForLenses(ppDoc, (ls) => settledCount(ls) >= 6);

	// updating "requests" must not touch flask on the same line
	const ppRequests = versionLens(ppLenses, "requests");
	await vscode.commands.executeCommand(
		ppRequests.command!.command,
		...ppRequests.command!.arguments!,
	);
	assert.strictEqual(
		ppDoc
			.getText()
			.includes('dependencies = ["flask>=2.0.0", "requests>=2.31.0"]'),
		true,
		`single-line array update corrupted the file:\n${ppDoc.getText()}`,
	);

	// wildcard pin: latest (0.36.3) is already covered by ==0.36.* → up to date
	const starlette = upToDateLens(ppLenses, "starlette");
	assert.ok(
		String(starlette.command?.arguments?.[1]).startsWith("0.36."),
		`starlette should resolve inside the wildcard, got: ${starlette.command?.arguments?.[1]}`,
	);

	// post release is a valid suggestion, yanked-only release is not
	const post = versionLens(ppLenses, "postpkg");
	assert.ok(
		String(post.command?.title).includes("1.0.1.post1"),
		`postpkg should suggest 1.0.1.post1, got: ${post.command?.title}`,
	);
	const yanked = versionLens(ppLenses, "yankedpkg");
	assert.ok(
		String(yanked.command?.title).includes("1.0.0") &&
			!String(yanked.command?.title).includes("2.0.0"),
		`yankedpkg must not suggest the yanked-only 2.0.0, got: ${yanked.command?.title}`,
	);

	// unknown package → error lens
	const ghost = ppLenses.find(
		(l) =>
			l.command?.command === "pyDepsHint.showUpToDate" &&
			l.command.arguments?.[0] === "ghostpkg" &&
			l.command.arguments?.[1] === "error",
	);
	assert.ok(ghost, "ghostpkg should show the error lens");

	// ---------- Cargo.toml is not a Python manifest ----------
	const cargoDoc = await vscode.workspace.openTextDocument(
		path.join(FIXTURE, "Cargo.toml"),
	);
	await sleep(500);
	const cargoLenses = await lensesFor(cargoDoc);
	assert.strictEqual(
		cargoLenses.length,
		0,
		`Cargo.toml must not get CodeLenses, got: ${JSON.stringify(cargoLenses.map((l) => l.command?.title))}`,
	);

	// ---------- Update All ----------
	await vscode.window.showTextDocument(reqDoc);
	await vscode.commands.executeCommand("pyDepsHint.updateAllVersions");
	await reqDoc.save();
	const onDisk = fs.readFileSync(reqDoc.uri.fsPath, "utf8");
	assert.ok(
		onDisk.includes("flask==2.1.0") &&
			onDisk.includes("requests>=2.31.0") &&
			onDisk.includes("numpy>=1.26.0"),
		`Update All should bump all three requirements, file on disk:\n${onDisk}`,
	);

	console.log("UAT suite finished OK");
}
