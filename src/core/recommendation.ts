/** Filter registry versions before resolving the dependency's own constraint. */
import * as fs from "node:fs";
import * as path from "node:path";
import { policyAllows, sameMaintenanceLine } from "../shared/updatePolicy";
import type { ExtensionConfig, PackageVersions } from "../types";
import { extractVersionNumber } from "../utils/dependencyUtils";
import { parsePep440 } from "./pep440";
import { parseSpecifier, parseVersion, satisfies } from "./versionResolver";
/** A concrete interpreter version, never the extension host's runtime. */
export function pythonTarget(
	fileName: string,
	configured?: string,
): string | undefined {
	if (configured?.trim()) return configured.trim();
	let dir = path.dirname(fileName);
	for (;;) {
		try {
			const value = fs
				.readFileSync(path.join(dir, ".python-version"), "utf8")
				.trim();
			if (/^\d+\.\d+\.\d+$/.test(value)) return value;
		} catch {}
		const parent = path.dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}
/** Missing Requires-Python remains unknown rather than proving compatibility. */
export function eligibleVersions(
	raw: PackageVersions,
	specifier: string,
	config: ExtensionConfig,
): string[] {
	const current = extractVersionNumber(specifier);
	return raw.versions.filter((version) => {
		if (
			current &&
			config.strategy &&
			config.strategy !== "latest" &&
			parsePep440(current)?.epoch !== parsePep440(version)?.epoch
		)
			return false;
		const files = raw.releases?.[version];
		const eligible = files?.filter(
			(file) =>
				!config.targetPythonVersion ||
				!file.requiresPython ||
				satisfies(
					config.targetPythonVersion,
					parseSpecifier(file.requiresPython),
				),
		);
		if (files?.length && !eligible?.length) return false;
		const published = (eligible ?? files)
			?.map((f) => f.publishedAt)
			.filter((s): s is string => !!s)
			.sort()[0];
		if (
			!policyAllows(raw.packageName, version, published, {
				...config,
				packageNameNormalization: "python",
			})
		)
			return false;
		return (
			!current ||
			sameMaintenanceLine(
				parseVersion(current),
				parseVersion(version),
				config.strategy ?? "latest",
			)
		);
	});
}
