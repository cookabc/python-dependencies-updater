/** Portable exact-target checks. Network failure propagates instead of becoming a clean result. */
export interface UpgradeTarget {
	packageName: string;
	version: string;
}
export async function acceptedUpgradeTargets(
	targets: UpgradeTarget[],
	enabled: boolean,
	query: (targets: UpgradeTarget[]) => Promise<Map<string, string[]>>,
	key: (name: string, version: string) => string,
): Promise<Set<string>> {
	const unique = new Map(
		targets.map((target) => [key(target.packageName, target.version), target]),
	);
	const accepted = new Set(unique.keys());
	if (!enabled || !unique.size) return accepted;
	const results = await query([...unique.values()]);
	for (const [id, advisories] of results)
		if (advisories.length) accepted.delete(id);
	return accepted;
}
