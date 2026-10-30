/**
 * Status Bar Manager
 */

import * as vscode from "vscode";
import { t } from "../utils/i18n";

export class StatusBarManager {
	private statusBarItem: vscode.StatusBarItem;

	constructor() {
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100,
		);
		this.statusBarItem.command = "pyDepsHint.updateAllVersions";
	}

	/**
	 * `vulnerable` counts pinned dependencies with at least one known
	 * vulnerability. It takes precedence over the update count: a known
	 * vulnerability matters more than a version being behind.
	 */
	updateStatus(
		updatesAvailable: number,
		totalPackages: number,
		vulnerable: number = 0,
	) {
		if (vulnerable > 0) {
			this.statusBarItem.text = `$(shield) ${t("statusBarVulnerable", vulnerable)}`;
			this.statusBarItem.tooltip = t("statusBarVulnerable", vulnerable);
			this.statusBarItem.backgroundColor = new vscode.ThemeColor(
				"statusBarItem.errorBackground",
			);
		} else if (updatesAvailable === 0) {
			this.statusBarItem.text = `$(check) ${t("statusBarUpToDate", totalPackages)}`;
			this.statusBarItem.tooltip = t("statusBarTooltipUpToDate");
			this.statusBarItem.backgroundColor = undefined;
		} else {
			this.statusBarItem.text = `$(warning) ${t("statusBarUpdatesAvailable", updatesAvailable)}`;
			this.statusBarItem.tooltip = t(
				"statusBarTooltipUpdates",
				updatesAvailable,
				totalPackages,
			);
			this.statusBarItem.backgroundColor = new vscode.ThemeColor(
				"statusBarItem.warningBackground",
			);
		}

		this.statusBarItem.show();
	}

	hide() {
		this.statusBarItem.hide();
	}

	dispose() {
		this.statusBarItem.dispose();
	}
}
