/** Portable lockfile report model. Lockfiles describe resolved, not installed, versions. */
export interface LockedPackage {
	id: string;
	name: string;
	version: string;
	dependencies: string[];
	direct: boolean;
	registry?: string;
}
export interface DependencyGraph {
	format: string;
	declarations?: { name: string; specifier: string; resolvedName?: string }[];
	packages: LockedPackage[];
	warnings: string[];
}
/** Shortest root-to-package path, with cycle protection. */
export function dependencyPaths(graph: DependencyGraph): Map<string, string[]> {
	const nodes = new Map(graph.packages.map((p) => [p.id, p]));
	const paths = new Map<string, string[]>();
	const queue: string[] = [];
	for (const node of graph.packages) {
		if (node.direct) {
			paths.set(node.id, [`${node.name}@${node.version}`]);
			queue.push(node.id);
		}
	}
	for (let i = 0; i < queue.length; i++) {
		const node = nodes.get(queue[i]);
		if (!node) continue;
		for (const id of node.dependencies) {
			const child = nodes.get(id);
			if (!child || paths.has(id)) continue;
			paths.set(id, [
				...(paths.get(node.id) ?? []),
				`${child.name}@${child.version}`,
			]);
			queue.push(id);
		}
	}
	return paths;
}
