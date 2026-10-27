/**
 * Update All must plan every edit — including safe patch/minor bumps —
 * from the document as it is after the registry requests, not from the
 * line numbers captured before those requests.
 */
import * as assert from "node:assert";
import {
	type BatchUpdate,
	type PlannedEdit,
	planRelocatedEdits,
} from "../../core/batchUpdate";
import { parseDependencies } from "../../core/unifiedParser";

function applyEdits(content: string, edits: PlannedEdit[]): string {
	const lines = content.split("\n");
	const ordered = [...edits].sort((a, b) => {
		if (a.line !== b.line) {
			return b.line - a.line;
		}
		return b.startColumn - a.startColumn;
	});
	for (const edit of ordered) {
		const line = lines[edit.line];
		lines[edit.line] =
			line.slice(0, edit.startColumn) +
			edit.replacement +
			line.slice(edit.endColumn);
	}
	return lines.join("\n");
}

describe("Update All relocation", () => {
	const baseline = "flask==1.0.0\nrequests==2.0.0\n";

	function safeUpdates(): BatchUpdate[] {
		const deps = parseDependencies("requirements.txt", baseline);
		return deps.map((dep) => ({
			dep,
			// Both are non-major, so the command used to edit them from the
			// snapshot before it re-located anything.
			newVersion: dep.packageName === "flask" ? "1.0.1" : "2.32.3",
			kind: "safe" as const,
		}));
	}

	it("rewrites safe updates on the lines they occupy now", () => {
		const current = `# added while versions were loading

${baseline}`;
		const edits = planRelocatedEdits({
			updates: safeUpdates(),
			fileName: "requirements.txt",
			currentText: current,
			isTOML: false,
		});

		assert.deepStrictEqual(
			edits.map((edit) => edit.line),
			[2, 3],
		);
		assert.ok(edits.every((edit) => edit.kind === "safe"));
		assert.strictEqual(
			applyEdits(current, edits),
			`# added while versions were loading

flask==1.0.1
requests==2.32.3
`,
		);
	});

	it("does not edit a comment inserted between two safe updates", () => {
		const current = "flask==1.0.0\n# inserted\nrequests==2.0.0\n";
		const edits = planRelocatedEdits({
			updates: safeUpdates(),
			fileName: "requirements.txt",
			currentText: current,
			isTOML: false,
		});
		const requests = edits.find((edit) => edit.packageName === "requests");
		assert.ok(requests);
		assert.strictEqual(requests.line, 2);
		assert.strictEqual(
			applyEdits(current, edits),
			"flask==1.0.1\n# inserted\nrequests==2.32.3\n",
		);
	});

	it("skips a safe update whose dependency was deleted", () => {
		const current = "requests==2.0.0\n";
		const edits = planRelocatedEdits({
			updates: safeUpdates(),
			fileName: "requirements.txt",
			currentText: current,
			isTOML: false,
		});
		assert.strictEqual(edits.length, 1);
		assert.strictEqual(edits[0].packageName, "requests");
		assert.strictEqual(edits[0].line, 0);
		assert.strictEqual(applyEdits(current, edits), "requests==2.32.3\n");
	});

	it("still rewrites an unchanged document", () => {
		const edits = planRelocatedEdits({
			updates: safeUpdates(),
			fileName: "requirements.txt",
			currentText: baseline,
			isTOML: false,
		});
		assert.deepStrictEqual(
			edits.map((edit) => edit.line),
			[0, 1],
		);
		assert.strictEqual(
			applyEdits(baseline, edits),
			"flask==1.0.1\nrequests==2.32.3\n",
		);
	});

	it("relocates a risky update with the same pass as the safe ones", () => {
		const current = `\n${baseline}`;
		const deps = parseDependencies("requirements.txt", baseline);
		const updates: BatchUpdate[] = [
			{ dep: deps[0], newVersion: "1.0.1", kind: "safe" },
			{ dep: deps[1], newVersion: "3.0.0", kind: "risky" },
		];
		const edits = planRelocatedEdits({
			updates,
			fileName: "requirements.txt",
			currentText: current,
			isTOML: false,
		});
		assert.deepStrictEqual(
			edits.map((edit) => [edit.packageName, edit.line, edit.kind]),
			[
				["flask", 1, "safe"],
				["requests", 2, "risky"],
			],
		);
		assert.strictEqual(
			applyEdits(current, edits),
			"\nflask==1.0.1\nrequests==3.0.0\n",
		);
	});

	it("does not confuse two pyproject entries that share a name", () => {
		const baselineToml = `[project]
dependencies = ["flask>=2.0"]

[project.optional-dependencies]
dev = ["flask>=1.0"]
`;
		const current = `# shifted\n${baselineToml}`;
		const deps = parseDependencies("pyproject.toml", baselineToml);
		assert.strictEqual(deps.length, 2);
		const updates: BatchUpdate[] = deps.map((dep) => ({
			dep,
			newVersion: "extra" in dep && dep.extra === "dev" ? "1.2.0" : "2.3.0",
			kind: "safe" as const,
		}));
		const edits = planRelocatedEdits({
			updates,
			fileName: "pyproject.toml",
			currentText: current,
			isTOML: true,
		});
		assert.strictEqual(
			applyEdits(current, edits),
			`# shifted
[project]
dependencies = ["flask>=2.3.0"]

[project.optional-dependencies]
dev = ["flask>=1.2.0"]
`,
		);
	});
});
