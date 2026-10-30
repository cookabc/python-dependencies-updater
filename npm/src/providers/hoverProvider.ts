import * as vscode from "vscode";
import { PackageJsonParser } from "../core/packageJsonParser";
import { t } from "../utils/i18n";
import { Logger } from "../utils/logger";
import type { VersionService } from "./versionService";

export class NpmHoverProvider implements vscode.HoverProvider {
	private parser: PackageJsonParser;
	private versionService: VersionService;
	private enabled: boolean;

	constructor(versionService: VersionService, enabled: boolean = true) {
		this.parser = new PackageJsonParser();
		this.versionService = versionService;
		this.enabled = enabled;
	}

	public setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	public async provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken,
	): Promise<vscode.Hover | undefined> {
		if (!this.enabled) {
			return undefined;
		}

		const dependencies = this.parser.parse(document.getText());
		const offset = document.offsetAt(position);

		const dep = dependencies.find(
			(d) =>
				(offset >= d.nameRange.start && offset <= d.nameRange.end) ||
				(offset >= d.versionRange.start && offset <= d.versionRange.end),
		);

		if (!dep) {
			return undefined;
		}

		Logger.log(`Providing hover for ${dep.registryName}`);
		const info = await this.versionService.getPackageInfo(dep.registryName);
		if (!info) {
			// A fresh failure means a retry is pointless right now; an
			// uncached package is still being fetched
			return this.versionService.getFailure(dep.registryName)
				? undefined
				: new vscode.Hover(`${t("checking")} ${dep.registryName}...`);
		}

		// description/homepage come from the version manifest, not the packument
		const details = await this.versionService.getPackageDetails(
			dep.registryName,
			info.latestVersion,
		);
		const summary = details?.description ?? info.summary;
		const homepage = details?.homepage ?? info.homepage;

		const md = new vscode.MarkdownString();
		md.appendMarkdown(`**${info.name}**\n\n`);
		if (summary) {
			md.appendMarkdown(`${summary}\n\n`);
		}
		md.appendMarkdown(`${t("latest")}: **${info.latestVersion}**\n`);
		md.appendMarkdown(`Current: **${dep.currentVersion}**\n\n`);

		if (homepage) {
			md.appendMarkdown(`[Homepage](${homepage})`);
		}

		return new vscode.Hover(md);
	}
}
