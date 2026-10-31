/** Check exact upgrade targets before editing either manifest or lockfile. */
import * as vscode from "vscode";
import { acceptedUpgradeTargets } from "../shared/upgradeChecks";
import { type OsvQuery, osvKey, queryVulnerabilities } from "./osvClient";
/** A failed query is unknown, never clean. Batch upgrades omit known-vulnerable targets. */
export async function checkedUpgradeTargets(
	targets: OsvQuery[],
	enabled: boolean,
): Promise<Set<string>> {
	const accepted = await acceptedUpgradeTargets(
		targets,
		enabled,
		queryVulnerabilities,
		osvKey,
	);
	if (
		accepted.size <
		new Set(targets.map((t) => osvKey(t.packageName, t.version))).size
	) {
		void vscode.window.showWarningMessage(
			"Skipped upgrade targets with known vulnerabilities. Run Show Dependency Report for advisory details.",
		);
	}
	return accepted;
}
