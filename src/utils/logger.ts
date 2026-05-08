import * as vscode from "vscode";

export class Logger {
	private static channel: vscode.OutputChannel;

	public static init(name: string) {
		Logger.channel = vscode.window.createOutputChannel(name);
	}

	public static log(message: string) {
		if (!Logger.channel) {
			return;
		}
		const timestamp = new Date().toISOString();
		Logger.channel.appendLine(`[${timestamp}] [INFO] ${message}`);
	}

	public static error(message: string, error?: any) {
		if (!Logger.channel) {
			return;
		}
		const timestamp = new Date().toISOString();
		Logger.channel.appendLine(`[${timestamp}] [ERROR] ${message}`);
		if (error) {
			Logger.channel.appendLine(error.stack || error.message || String(error));
		}
	}

	public static show() {
		if (Logger.channel) {
			Logger.channel.show();
		}
	}
}
