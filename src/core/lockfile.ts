/** uv and Poetry lockfile graphs. Conditional branches are retained explicitly. */
import * as TOML from "@iarna/toml";
import type { DependencyGraph, LockedPackage } from "../shared/dependencyGraph";

interface Dependency {
	name: string;
	version?: string;
	source?: Record<string, unknown>;
}
interface Entry {
	name: string;
	version: string;
	source?: {
		registry?: string;
		url?: string;
		type?: string;
		editable?: string;
		virtual?: string;
		directory?: string;
		git?: string;
	};
	dependencies?: Dependency[] | Record<string, unknown>;
	"optional-dependencies"?: Record<string, Dependency[]>;
	"dev-dependencies"?: Record<string, Dependency[]>;
}
const normalize = (name: string) => name.toLowerCase().replace(/[-_.]+/g, "-");
/** Names come from the selected manifest, including optional and development groups. */
export function parsePythonLock(
	text: string,
	format: "uv" | "poetry",
	directNames: string[],
): DependencyGraph {
	const data = TOML.parse(text) as unknown as { package?: Entry[] };
	if (!Array.isArray(data.package))
		throw new Error(
			"The lockfile has no package table. Regenerate it with the project's package manager.",
		);
	const direct = new Set(directNames.map(normalize));
	const entries = data.package;
	if (
		entries.some(
			(e) => !e || typeof e.name !== "string" || typeof e.version !== "string",
		)
	)
		throw new Error("Malformed package entry in lockfile.");
	const nodes: LockedPackage[] = entries.map((e, index) => ({
		id: `${normalize(e.name)}@${e.version}#${index}`,
		name: normalize(e.name),
		version: e.version,
		dependencies: [],
		direct: direct.has(normalize(e.name)),
		registry:
			format === "uv"
				? e.source?.registry
				: e.source
					? e.source.type === "legacy"
						? e.source.url
						: undefined
					: "https://pypi.org/simple",
	}));
	const byName = new Map<string, LockedPackage[]>();
	for (const node of nodes)
		byName.set(node.name, [...(byName.get(node.name) ?? []), node]);
	for (const node of nodes) {
		const entry = entries[Number(node.id.split("#").at(-1))];
		const deps: Dependency[] = Array.isArray(entry.dependencies)
			? entry.dependencies
			: Object.keys(entry.dependencies ?? {}).map((name) => ({ name }));
		for (const dep of [
			...deps,
			...Object.values(entry["optional-dependencies"] ?? {}).flat(),
			...Object.values(entry["dev-dependencies"] ?? {}).flat(),
		]) {
			const matches = byName.get(normalize(dep.name)) ?? [];
			for (const target of matches)
				if (!dep.version || dep.version === target.version)
					node.dependencies.push(target.id);
		}
	}
	return {
		format,
		packages: nodes,
		warnings: [
			"All lockfile branches and optional groups are included; a finding does not prove the package is installed or active on this platform.",
		],
	};
}
