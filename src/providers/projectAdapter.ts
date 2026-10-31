import * as path from "node:path";
import { type BatchUpdate, planRelocatedEdits } from "../core/batchUpdate";
import { parsePythonLock } from "../core/lockfile";
import { pythonTarget } from "../core/recommendation";
import { parseDependencies } from "../core/unifiedParser";
import type { Command } from "../shared/processRunner";
import type { ProjectAdapter } from "../shared/projectTools";
import { readOptional } from "../shared/validation";
import { getConfig } from "../utils/configuration";
import {
	shouldOfferVersionUpdate,
	specifierForResolution,
} from "../utils/dependencyUtils";
import { osvKey, queryVulnerabilities } from "./osvClient";
import { checkedUpgradeTargets } from "./upgradeGuard";
import { getLatestCompatible } from "./versionService";
/** Project operations use the same recommendation and rewrite rules as inline updates. */
export function pythonProjectAdapter(
	token: () => Promise<string | undefined>,
): ProjectAdapter {
	return {
		namespace: "pyDepsHint",
		supports: (name) =>
			/\/(?:requirements[^/]*\.txt|pyproject\.toml)$/.test(name),
		lockfiles: ["uv.lock", "poetry.lock"],
		advisories: queryVulnerabilities,
		async report(document, root) {
			for (const format of ["uv", "poetry"] as const) {
				const text = await readOptional(path.join(root, `${format}.lock`));
				if (text !== null) {
					const dependencies = parseDependencies(
						document.fileName,
						document.getText(),
					);
					const graph = parsePythonLock(
						text,
						format,
						dependencies.map((d) => d.packageName),
					);
					graph.declarations = dependencies.map((dep) => ({
						name: dep.packageName,
						specifier: dep.versionSpecifier,
						resolvedName: dep.packageName.toLowerCase().replace(/[-_.]+/g, "-"),
					}));
					return graph;
				}
			}
			throw new Error(
				"No uv.lock or poetry.lock was found for this project. Generate one with the project's package manager, then retry.",
			);
		},
		async propose(document) {
			const config = {
				...getConfig(),
				targetPythonVersion: pythonTarget(
					document.fileName,
					getConfig().targetPythonVersion,
				),
			};
			const text = document.getText();
			const dependencies = parseDependencies(document.fileName, text);
			const credential = await token();
			const updates: BatchUpdate[] = [];
			for (const dep of dependencies) {
				const result = await getLatestCompatible(
					dep.packageName,
					specifierForResolution(dep),
					config.showPrerelease,
					config.cacheTTLMinutes,
					config.registryUrl,
					credential,
					config,
				);
				if (result.error && result.error !== "no-compatible-version")
					throw new Error(
						`${dep.packageName}: version lookup failed. Retry before validating updates.`,
					);
				if (
					result.latestCompatible &&
					shouldOfferVersionUpdate(
						dep.versionSpecifier,
						result.latestCompatible,
					)
				)
					updates.push({
						dep,
						newVersion: result.latestCompatible,
						kind: "risky",
					});
			}
			const accepted = await checkedUpgradeTargets(
				updates.map((u) => ({
					packageName: u.dep.packageName,
					version: u.newVersion,
				})),
				config.checkVulnerabilities,
			);
			const edits = planRelocatedEdits({
				updates: updates.filter((u) =>
					accepted.has(osvKey(u.dep.packageName, u.newVersion)),
				),
				fileName: document.fileName,
				currentText: text,
				isTOML: document.fileName.endsWith(".toml"),
			});
			const lines = text.split("\n");
			for (const edit of edits.sort(
				(a, b) => b.line - a.line || b.startColumn - a.startColumn,
			))
				lines[edit.line] =
					lines[edit.line].slice(0, edit.startColumn) +
					edit.replacement +
					lines[edit.line].slice(edit.endColumn);
			return lines.join("\n");
		},
		async plan(root, manifest) {
			if (manifest !== "pyproject.toml")
				throw new Error(
					"Isolated validation currently supports the root pyproject.toml only. Use inline updates and the native package-manager workflow for requirements files or nested Python projects.",
				);
			const config = (await import("vscode")).workspace.getConfiguration(
				"pyDepsHint",
			);
			const tests = config.get<Command[]>("validationCommands", []);
			if ((await readOptional(path.join(root, "uv.lock"))) !== null)
				return {
					commands: [
						{ executable: "uv", args: ["lock"] },
						{
							executable: "uv",
							args: ["sync", "--no-install-project", "--no-python-downloads"],
						},
					],
					testCommands: tests,
				};
			if ((await readOptional(path.join(root, "poetry.lock"))) !== null)
				return {
					commands: [
						{ executable: "poetry", args: ["lock"] },
						{
							executable: "poetry",
							args: ["install", "--no-interaction", "--no-root"],
						},
					],
					testCommands: tests,
				};
			throw new Error(
				"Validation currently requires uv.lock or poetry.lock. Generate the lockfile first; inline updates remain available.",
			);
		},
	};
}
