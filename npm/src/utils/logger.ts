import { createRequire } from "node:module";

const nodeRequire = createRequire(__filename);

let channel: { appendLine(line: string): void; show(): void } | undefined;

export class Logger {
	public static init(name: string) {
		// Loaded on demand so unit tests can import services without the
		// extension host's `vscode` module.
		const vscode = nodeRequire("vscode") as typeof import("vscode");
		channel = vscode.window.createOutputChannel(name);
	}

	public static log(message: string) {
		if (!channel) return;
		const timestamp = new Date().toISOString();
		channel.appendLine(`[${timestamp}] [INFO] ${message}`);
	}

	public static error(message: string, error?: any) {
		if (!channel) return;
		const timestamp = new Date().toISOString();
		channel.appendLine(`[${timestamp}] [ERROR] ${message}`);
		if (error) {
			channel.appendLine(error.stack || error.message || String(error));
		}
	}

	public static show() {
		if (channel) {
			channel.show();
		}
	}
}
