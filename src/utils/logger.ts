import * as vscode from 'vscode';

export class Logger {
    private static channel: vscode.OutputChannel;

    public static init(name: string) {
        this.channel = vscode.window.createOutputChannel(name);
    }

    public static log(message: string) {
        if (!this.channel) return;
        const timestamp = new Date().toISOString();
        this.channel.appendLine(`[${timestamp}] [INFO] ${message}`);
    }

    public static error(message: string, error?: any) {
        if (!this.channel) return;
        const timestamp = new Date().toISOString();
        this.channel.appendLine(`[${timestamp}] [ERROR] ${message}`);
        if (error) {
            this.channel.appendLine(error.stack || error.message || String(error));
        }
    }

    public static show() {
        if (this.channel) {
            this.channel.show();
        }
    }
}
