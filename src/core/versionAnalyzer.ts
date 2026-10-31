/**
 * Version Analysis utilities
 */

import type { VersionAnalysis } from "../types";
import { parsePep440 } from "./pep440";
import { parseVersion } from "./versionResolver";

/**
 * Analyze version difference and risk level.
 * An epoch change (`1.0` → `1!1.0`) is a breaking update even when the
 * release numbers themselves did not move.
 */
export function analyzeVersionUpdate(
	current: string,
	latest: string,
): VersionAnalysis {
	const currentEpoch = parsePep440(current)?.epoch;
	const latestEpoch = parsePep440(latest)?.epoch;
	if (
		currentEpoch !== undefined &&
		latestEpoch !== undefined &&
		currentEpoch !== latestEpoch
	) {
		return {
			currentVersion: current,
			latestVersion: latest,
			updateType: "major",
			isBreakingChange: true,
			riskLevel: "high",
		};
	}

	const currentParts = parseVersion(current);
	const latestParts = parseVersion(latest);

	let updateType: "patch" | "minor" | "major" = "patch";
	let isBreakingChange = false;
	let riskLevel: "low" | "medium" | "high" = "low";

	const [currentMajor, currentMinor] = currentParts;
	const [latestMajor, latestMinor] = latestParts;

	if (currentMajor !== latestMajor) {
		updateType = "major";
		isBreakingChange = true;
		riskLevel = "high";
	} else if (currentMinor !== latestMinor) {
		updateType = "minor";
		riskLevel = currentMajor === 0 ? "high" : "medium";
		isBreakingChange = currentMajor === 0;
	} else {
		updateType = "patch";
		riskLevel = "low";
	}

	return {
		currentVersion: current,
		latestVersion: latest,
		updateType,
		isBreakingChange,
		riskLevel,
	};
}
