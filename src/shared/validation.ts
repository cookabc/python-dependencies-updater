/** Isolated validation and conflict-aware application inputs. No git reset or stash. */
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { type Command, runCommand } from "./processRunner";
export interface ValidatedFile {
	relativePath: string;
	before: string | null;
	after: string;
}
export interface ValidationResult {
	files: ValidatedFile[];
	testsRun: boolean;
	inputs: Record<string, string>;
}
export const excluded = new Set([
	"node_modules",
	".git",
	".venv",
	"venv",
	".vscode-test",
	"__pycache__",
	".pytest_cache",
	".mypy_cache",
]);
/** Validate a snapshot, preserving all original files even on cancellation/failure. */
export async function validateSnapshot(options: {
	root: string;
	manifest: string;
	proposedText: string;
	commands: Command[];
	testCommands: Command[];
	lockfiles: string[];
	signal?: AbortSignal;
	log?: (text: string) => void;
}): Promise<ValidationResult> {
	const temp = await fs.mkdtemp(path.join(os.tmpdir(), "dependency-check-"));
	const snapshot = path.join(temp, "project");
	const names = [...new Set([options.manifest, ...options.lockfiles])];
	const originals = new Map<string, string | null>();

	try {
		for (const name of names)
			if (
				path.isAbsolute(name) ||
				path
					.relative(options.root, path.resolve(options.root, name))
					.startsWith("..")
			)
				throw new Error("Validation files must stay inside the project.");
		for (const name of names)
			originals.set(name, await readOptional(path.join(options.root, name)));
		await fs.cp(options.root, snapshot, {
			recursive: true,
			filter: async (source) => {
				if (options.signal?.aborted) throw new Error("Validation cancelled");
				if (source !== options.root && excluded.has(path.basename(source)))
					return false;
				// External symlinks could write back into the original project.
				if ((await fs.lstat(source)).isSymbolicLink()) return false;
				return true;
			},
		});
		const inputs = await inputHashes(snapshot);
		await fs.writeFile(
			path.join(snapshot, options.manifest),
			options.proposedText,
		);
		for (const command of [...options.commands, ...options.testCommands]) {
			if (options.signal?.aborted) throw new Error("Validation cancelled");
			options.log?.(`\n> ${command.executable} ${command.args.join(" ")}\n`);
			const result = await runCommand(
				command,
				snapshot,
				options.signal,
				options.log,
			);
			if (result.code !== 0)
				throw new Error(
					`${command.executable} exited with code ${result.code}. See the validation output.`,
				);
		}
		const files: ValidatedFile[] = [];
		for (const name of names) {
			const after = await readOptional(path.join(snapshot, name));
			const before = originals.get(name) ?? null;
			if (after !== null && after !== before)
				files.push({ relativePath: name, before, after });
		}
		// Commands may rewrite the manifest; never silently accept that rewrite.
		const finalManifest = await readOptional(
			path.join(snapshot, options.manifest),
		);
		if (finalManifest !== options.proposedText)
			throw new Error(
				"A validation command changed the proposed dependency file. Review its output before retrying.",
			);
		return { files, testsRun: options.testCommands.length > 0, inputs };
	} finally {
		await fs.rm(temp, { recursive: true, force: true });
	}
}
/** Missing is distinct from empty; all other read errors must surface. */
export async function readOptional(file: string): Promise<string | null> {
	try {
		return await fs.readFile(file, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

/** Fingerprint source inputs so a successful check cannot approve a later project edit. */
export async function inputHashes(
	root: string,
): Promise<Record<string, string>> {
	const hashes: Record<string, string> = {};
	async function walk(dir: string): Promise<void> {
		for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
			if (excluded.has(entry.name) || entry.isSymbolicLink()) continue;
			const file = path.join(dir, entry.name);
			if (entry.isDirectory()) await walk(file);
			else if (entry.isFile())
				hashes[path.relative(root, file)] = createHash("sha256")
					.update(await fs.readFile(file))
					.digest("hex");
		}
	}
	await walk(root);
	return hashes;
}
/** Object insertion order is irrelevant to input identity. */
export function sameInputs(
	a: Record<string, string>,
	b: Record<string, string>,
): boolean {
	return (
		Object.keys(a).length === Object.keys(b).length &&
		Object.entries(a).every(([key, value]) => b[key] === value)
	);
}
