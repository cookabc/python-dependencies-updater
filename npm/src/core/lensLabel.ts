import { UpdateRisk } from "../types";

/** Localised strings the lens labels are built from. */
export interface LensLabels {
	updateTo: string;
	majorUpdate: string;
	minorUpdate: string;
	patchUpdate: string;
}

export interface LensLabel {
	title: string;
	tooltip: string;
}

/**
 * CodeLens title and tooltip for an available update.
 *
 * Both describe the same thing: the update on offer. The tooltip must not
 * start from the up-to-date wording — a lens that says "Update to 2.0.0"
 * while its tooltip reads "Up to date: 2.0.0" contradicts itself.
 */
export function updateLensLabel(
	risk: UpdateRisk,
	latestVersion: string,
	labels: LensLabels,
): LensLabel {
	if (risk === UpdateRisk.High) {
		return {
			title: `$(warning) ${labels.updateTo} ${latestVersion} ⚠️ ${labels.majorUpdate}`,
			tooltip: `${labels.updateTo} ${latestVersion} (${labels.majorUpdate})`,
		};
	}
	if (risk === UpdateRisk.Medium) {
		return {
			title: `$(info) ${labels.updateTo} ${latestVersion} ${labels.minorUpdate}`,
			tooltip: `${labels.updateTo} ${latestVersion} (${labels.minorUpdate})`,
		};
	}
	return {
		title: `$(arrow-circle-up) ${labels.updateTo} ${latestVersion}`,
		tooltip: `${labels.updateTo} ${latestVersion} (${labels.patchUpdate})`,
	};
}
