/**
 * Plan "Update All" edits against the document as it is now.
 *
 * Version lookups can take long enough for the user to insert or delete
 * lines. Edits must be built from a fresh parse, not from the line numbers
 * captured before those requests. Safe and risky updates go through the
 * same relocation so a patch bump cannot land on the wrong line.
 */

import { planLineUpdate } from "../utils/dependencyUtils";
import type { AnyDependency } from "./unifiedParser";
import { parseDependencies } from "./unifiedParser";

export interface BatchUpdate {
	dep: AnyDependency;
	newVersion: string;
	kind: "safe" | "risky";
}

export interface PlannedEdit {
	line: number;
	startColumn: number;
	endColumn: number;
	replacement: string;
	packageName: string;
	kind: "safe" | "risky";
}

function dependencyKey(dep: AnyDependency): string {
	const extra = "extra" in dep ? (dep.extra ?? "") : "";
	return `${dep.packageName}|${extra}`;
}

/**
 * Match each update to the current document by package name and extra,
 * in document order, and plan the rewrite from the current line text.
 * A dependency that disappeared while versions were loading is skipped.
 */
export function planRelocatedEdits(options: {
	updates: BatchUpdate[];
	fileName: string;
	currentText: string;
	isTOML: boolean;
}): PlannedEdit[] {
	const currentDeps = parseDependencies(options.fileName, options.currentText);
	const byKey = new Map<string, AnyDependency[]>();
	for (const dep of currentDeps) {
		const key = dependencyKey(dep);
		const list = byKey.get(key) ?? [];
		list.push(dep);
		byKey.set(key, list);
	}

	const lines = options.currentText.split("\n");
	const edits: PlannedEdit[] = [];
	for (const update of options.updates) {
		const target = byKey.get(dependencyKey(update.dep))?.shift();
		if (!target) {
			continue;
		}
		const lineText = lines[target.line];
		if (lineText === undefined) {
			continue;
		}
		const planned = planLineUpdate(
			lineText,
			update.newVersion,
			options.isTOML,
			target.startColumn,
		);
		if (!planned) {
			continue;
		}
		edits.push({
			line: target.line,
			startColumn: planned.match.startIndex,
			endColumn: planned.match.endIndex,
			replacement: planned.replacement,
			packageName: target.packageName,
			kind: update.kind,
		});
	}
	return edits;
}
