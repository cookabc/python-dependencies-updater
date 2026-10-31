/** Native VS Code report, diff and isolated validation workflow. Shared between extensions. */
import * as path from "node:path";
import * as vscode from "vscode";
import { type DependencyGraph, dependencyPaths } from "./dependencyGraph";
import type { Command } from "./processRunner";
import {
	inputHashes,
	readOptional,
	sameInputs,
	validateSnapshot,
} from "./validation";
export interface ProjectAdapter {
	namespace: string;
	supports(fileName: string): boolean;
	lockfiles: string[];
	report(document: vscode.TextDocument, root: string): Promise<DependencyGraph>;
	advisories(
		packages: { packageName: string; version: string }[],
	): Promise<Map<string, string[]>>;
	propose(document: vscode.TextDocument): Promise<string>;
	plan(
		root: string,
		manifest: string,
	): Promise<{ commands: Command[]; testCommands: Command[] }>;
}
/** Find the nearest supported lockfile within the current workspace boundary. */
export async function projectRoot(
	document: vscode.TextDocument,
	lockfiles: string[],
): Promise<string> {
	const boundary = vscode.workspace.getWorkspaceFolder(document.uri)?.uri
		.fsPath;
	let dir = path.dirname(document.uri.fsPath);
	const fallback = dir;
	for (;;) {
		for (const file of lockfiles)
			if ((await readOptional(path.join(dir, file))) !== null) return dir;
		if (!boundary || dir === boundary) return fallback;
		const parent = path.dirname(dir);
		if (parent === dir || path.relative(boundary, parent).startsWith(".."))
			return fallback;
		dir = parent;
	}
}
/** Escape data from registries and project files before inserting Markdown. */
function escapeMarkdown(text: string): string {
	return text.replace(/[\\`*_[\]<>|]/g, "\\$&").replace(/[\r\n]+/g, " ");
}
function publicRegistry(registry: string | undefined): boolean {
	if (!registry) return false;
	try {
		return [
			"registry.npmjs.org",
			"registry.npmjs.com",
			"pypi.org",
			"files.pythonhosted.org",
		].includes(new URL(registry).hostname);
	} catch {
		return false;
	}
}
/** Register additive commands; existing one-click editing remains available. */
export function registerProjectTools(
	context: vscode.ExtensionContext,
	adapter: ProjectAdapter,
): void {
	const output = vscode.window.createOutputChannel(
		`${adapter.namespace}: Dependency Validation`,
	);
	context.subscriptions.push(output);
	const active = () => {
		const document = vscode.window.activeTextEditor?.document;
		if (!document || !adapter.supports(document.fileName))
			throw new Error(
				"Open a supported dependency file, then run the command again.",
			);
		return document;
	};
	const error = (cause: unknown) =>
		void vscode.window.showErrorMessage(
			cause instanceof Error ? cause.message : String(cause),
		);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${adapter.namespace}.dependencyReport`,
			async () => {
				try {
					const doc = active();
					const root = await projectRoot(doc, adapter.lockfiles);
					const graph = await adapter.report(doc, root);
					const paths = dependencyPaths(graph);
					const config = vscode.workspace.getConfiguration(
						adapter.namespace,
						doc.uri,
					);
					const enabled = config.get<boolean>("checkVulnerabilities", true);
					const queried = graph.packages.filter((p) =>
						publicRegistry(p.registry),
					);
					// Private and non-registry sources stay local; do not submit them to public OSV.
					let found = new Map<string, string[]>();
					let state = enabled
						? "Complete for public registry packages"
						: "Disabled";
					if (enabled) {
						try {
							found = await adapter.advisories(
								queried.map((p) => ({
									packageName: p.name,
									version: p.version,
								})),
							);
						} catch {
							state =
								"Failed — vulnerability status is unknown; rerun this report to retry";
						}
					}
					const key = (name: string, version: string) =>
						`${name.toLowerCase()}@${version}`;
					const declarations = graph.declarations ?? [];
					const declarationLines = declarations.length
						? [
								"## Manifest declarations",
								"",
								"| Dependency | Declared version | Resolved versions |",
								"| --- | --- | --- |",
								...declarations.map(
									(dep) =>
										`| ${escapeMarkdown(dep.name)} | ${escapeMarkdown(dep.specifier)} | ${escapeMarkdown([...new Set(graph.packages.filter((node) => node.name === (dep.resolvedName ?? dep.name)).map((node) => node.version))].join(", ") || "Not resolved in this lockfile")} |`,
								),
								"",
								"## Resolved dependencies",
								"",
							]
						: [];
					const lines = [
						"# Dependency report",
						"",
						`Source: ${escapeMarkdown(graph.format)}`,
						`Vulnerability check: ${state}`,
						"",
						...graph.warnings.map((w) => `- ${w}`),
						...declarationLines,
						"",
						"| Resolved package | Relationship | Known vulnerabilities | Dependency path |",
						"| --- | --- | --- | --- |",
					];
					for (const node of graph.packages) {
						const ids = found.get(key(node.name, node.version)) ?? [];
						const status = !enabled
							? "Not checked"
							: !publicRegistry(node.registry)
								? "Not checked (private or non-registry source)"
								: state.startsWith("Failed")
									? "Unknown"
									: ids.length
										? ids
												.map(
													(id) =>
														`[${escapeMarkdown(id)}](https://osv.dev/vulnerability/${encodeURIComponent(id)})`,
												)
												.join(", ")
										: "None reported";
						lines.push(
							`| ${escapeMarkdown(node.name)} ${escapeMarkdown(node.version)} | ${node.direct ? "Direct" : "Transitive / other lockfile branch"} | ${status} | ${escapeMarkdown((paths.get(node.id) ?? []).join(" → ") || "Path not resolved")} |`,
						);
					}
					if (!graph.packages.length)
						lines.push("", "No resolved packages were found.");
					const report = await vscode.workspace.openTextDocument({
						content: lines.join("\n"),
						language: "markdown",
					});
					await vscode.window.showTextDocument(report, { preview: true });
				} catch (cause) {
					error(cause);
				}
			},
		),
	);
	let validating = false;
	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${adapter.namespace}.previewAndValidate`,
			async () => {
				if (validating) {
					error(
						new Error(
							"Validation is already running. Wait for it to finish or cancel it.",
						),
					);
					return;
				}
				validating = true;
				try {
					if (!vscode.workspace.isTrusted)
						throw new Error(
							"Trust this workspace before running package-manager or test commands.",
						);
					const document = active();
					const original = document.getText();
					const root = await projectRoot(document, adapter.lockfiles);
					const manifest = path.relative(root, document.uri.fsPath);
					const otherDirty = vscode.workspace.textDocuments.some(
						(d) =>
							d.isDirty &&
							d.uri.toString() !== document.uri.toString() &&
							!path.relative(root, d.uri.fsPath).startsWith(".."),
					);
					if (otherDirty)
						throw new Error(
							"Save other edited files in this project so validation uses the code you are reviewing.",
						);
					const diskManifest = await readOptional(document.uri.fsPath);
					const proposed = await adapter.propose(document);
					if (proposed === original) {
						void vscode.window.showInformationMessage(
							"No declaration changes are proposed under the current policy. Use your package manager to refresh versions already allowed by a range.",
						);
						return;
					}
					const preview = await vscode.workspace.openTextDocument({
						content: proposed,
						language: document.languageId,
					});
					await vscode.commands.executeCommand(
						"vscode.diff",
						document.uri,
						preview.uri,
						"Dependency update preview",
					);
					const plan = await adapter.plan(root, manifest);
					const commands = [...plan.commands, ...plan.testCommands]
						.map((c) => `${c.executable} ${c.args.join(" ")}`)
						.join("\n");
					const choice = await vscode.window.showInformationMessage(
						`Validate this proposal in a temporary project copy?\nProject: ${root}\n\n${commands}\n\n${plan.testCommands.length ? "Project checks will run." : "No project tests are configured; only dependency resolution will be checked."}`,
						{ modal: true },
						"Validate proposal",
					);
					if (choice !== "Validate proposal") return;
					if (preview.getText() !== proposed)
						throw new Error(
							"The preview was edited. Make the desired edits in the dependency file, then rerun the preview to validate them.",
						);
					output.clear();
					output.show(true);
					const controller = new AbortController();
					const result = await vscode.window.withProgress(
						{
							location: vscode.ProgressLocation.Notification,
							title: "Validating dependency updates in a temporary copy",
							cancellable: true,
						},
						async (_progress, token) => {
							const listener = token.onCancellationRequested(() =>
								controller.abort(),
							);
							try {
								return await validateSnapshot({
									root,
									manifest,
									proposedText: proposed,
									commands: plan.commands,
									testCommands: plan.testCommands,
									lockfiles: adapter.lockfiles,
									signal: controller.signal,
									log: (text) => output.append(text),
								});
							} finally {
								listener.dispose();
							}
						},
					);
					const apply = await vscode.window.showInformationMessage(
						result.testsRun
							? "Dependency resolution and configured project checks passed. Apply the manifest and lockfile changes?"
							: "Dependency resolution passed. Project tests were not run. Apply the manifest and lockfile changes?",
						{ modal: true },
						"Apply changes",
					);
					if (apply !== "Apply changes") return;
					if (preview.getText() !== proposed)
						throw new Error(
							"The preview changed during validation. Rerun the command before applying.",
						);
					// The original manifest may contain unsaved edits; compare its editor snapshot separately.
					if (
						document.getText() !== original ||
						(await readOptional(document.uri.fsPath)) !== diskManifest
					)
						throw new Error(
							"The dependency file changed during validation. Rerun the preview before applying.",
						);
					for (const file of result.files) {
						if (file.relativePath === manifest) continue;
						const uri = vscode.Uri.file(path.join(root, file.relativePath));
						if (
							vscode.workspace.textDocuments.some(
								(d) => d.uri.toString() === uri.toString() && d.isDirty,
							) ||
							(await readOptional(uri.fsPath)) !== file.before
						)
							throw new Error(
								`${file.relativePath} changed during validation. Rerun the preview before applying.`,
							);
					}
					if (
						vscode.workspace.textDocuments.some(
							(d) =>
								d.isDirty &&
								d.uri.toString() !== document.uri.toString() &&
								!path.relative(root, d.uri.fsPath).startsWith(".."),
						) ||
						!sameInputs(result.inputs, await inputHashes(root))
					)
						throw new Error(
							"Project inputs changed during validation. Rerun the preview before applying.",
						);
					const edit = new vscode.WorkspaceEdit();
					for (const file of result.files) {
						const uri = vscode.Uri.file(path.join(root, file.relativePath));
						if (file.before === null)
							edit.createFile(uri, { ignoreIfExists: false });
						const target =
							file.before === null
								? null
								: await vscode.workspace.openTextDocument(uri);
						edit.replace(
							uri,
							target
								? new vscode.Range(
										target.positionAt(0),
										target.positionAt(target.getText().length),
									)
								: new vscode.Range(0, 0, 0, 0),
							file.after,
						);
					}
					// Dirty manifests can equal the final file even when the disk differs.
					if (!result.files.some((f) => f.relativePath === manifest))
						edit.replace(
							document.uri,
							new vscode.Range(
								document.positionAt(0),
								document.positionAt(original.length),
							),
							proposed,
						);
					if (!(await vscode.workspace.applyEdit(edit)))
						throw new Error(
							"VS Code could not apply the validated changes. Review the files and retry.",
						);
					void vscode.window.showInformationMessage(
						"Applied validated manifest and lockfile edits. Review and save them; Undo reverts this edit. The original installed environment was not changed.",
					);
				} catch (cause) {
					error(cause);
				} finally {
					validating = false;
				}
			},
		),
	);
}
