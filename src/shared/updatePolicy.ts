/** Portable update policy; keep the two extension copies in sync. */
export type UpdateStrategy = "latest" | "compatible" | "patch";
export interface UpdatePolicy {
	strategy?: UpdateStrategy;
	minimumReleaseAgeDays?: number;
	ignoredVersions?: Record<string, string[]>;
	deferredPackages?: Record<string, string>;
	now?: number;
	packageNameNormalization?: "python";
}
/** A policy decision is not a compatibility or security guarantee. */
export function policyAllows(
	name: string,
	version: string,
	published: string | undefined,
	policy: UpdatePolicy,
): boolean {
	const now = policy.now ?? Date.now();
	const normalize = (value: string) =>
		policy.packageNameNormalization === "python"
			? value.toLowerCase().replace(/[-_.]+/g, "-")
			: value.toLowerCase();
	const key = normalize(name);
	const ignored =
		Object.entries(policy.ignoredVersions ?? {}).find(
			([n]) => normalize(n) === key,
		)?.[1] ?? [];
	if (ignored.includes(version)) return false;
	const deferred = Object.entries(policy.deferredPackages ?? {}).find(
		([n]) => normalize(n) === key,
	)?.[1];
	if (deferred && Date.parse(deferred) > now) return false;
	const days = Math.max(0, policy.minimumReleaseAgeDays ?? 0);
	if (
		days > 0 &&
		(!published ||
			!Number.isFinite(Date.parse(published)) ||
			now - Date.parse(published) < days * 86400000)
	)
		return false;
	return true;
}
/** Initial-development minor changes require explicit review. */
export function sameMaintenanceLine(
	current: number[],
	candidate: number[],
	strategy: UpdateStrategy,
): boolean {
	if (strategy === "latest") return true;
	if (current[0] !== candidate[0]) return false;
	return (
		(strategy === "compatible" && current[0] !== 0) ||
		(current[1] ?? 0) === (candidate[1] ?? 0)
	);
}
