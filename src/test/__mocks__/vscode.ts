/**
 * Minimal vscode module mock for unit tests running outside the extension host.
 * This mock is registered via --require in the test setup.
 */

export const env = {
    language: 'en',
};

export class MarkdownString {
    isTrusted = false;
    supportHtml = false;
    private parts: string[] = [];

    appendMarkdown(value: string) {
        this.parts.push(value);
        return this;
    }

    appendText(value: string) {
        this.parts.push(value);
        return this;
    }

    get value() {
        return this.parts.join('');
    }
}

export class Range {
    constructor(
        public startLine: number,
        public startCharacter: number,
        public endLine: number,
        public endCharacter: number,
    ) {}
}

export class Position {
    constructor(
        public line: number, 
        public character: number,
    ) {}
}

export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
}

export class ThemeColor {
    constructor(public id: string) {}
}

export const window = {
    createStatusBarItem: (_alignment?: StatusBarAlignment, _priority?: number) => ({
        text: '',
        tooltip: '',
        command: '',
        backgroundColor: undefined as ThemeColor | undefined,
        show: () => {},
        hide: () => {},
        dispose: () => {},
    }),
    showInformationMessage: async (..._args: unknown[]) => undefined,
    showWarningMessage: async (..._args: unknown[]) => undefined,
    showErrorMessage: async (..._args: unknown[]) => undefined,
};

export const workspace = {
    getConfiguration: (_section?: string) => ({
        get: <T>(_key: string, defaultValue?: T) => defaultValue,
    }),
    onDidChangeConfiguration: () => ({ dispose: () => {} }),
};

export const commands = {
    registerCommand: () => ({ dispose: () => {} }),
};

export const languages = {
    registerCodeLensProvider: () => ({ dispose: () => {} }),
    registerHoverProvider: () => ({ dispose: () => {} }),
};

export class EventEmitter<T> {
    private listeners: ((e: T) => void)[] = [];
    event = (listener: (e: T) => void) => {
        this.listeners.push(listener);
        return { dispose: () => {} };
    };
    fire(data: T) {
        this.listeners.forEach(l => l(data));
    }
    dispose() {}
}

export class Uri {
    static parse(value: string) { return { toString: () => value }; }
    static file(path: string) { return { toString: () => path, fsPath: path }; }
}

export class Hover {
    constructor(public contents: unknown, public range?: Range) {}
}

export class CodeLens {
    command?: { title: string; command: string; arguments?: unknown[] };
    constructor(public range: Range, command?: { title: string; command: string; arguments?: unknown[] }) {
        this.command = command;
    }
}

export class Disposable {
    constructor(private callOnDispose: () => void) {}
    dispose() { this.callOnDispose(); }
}

// For ProgressLocation enum
export enum ProgressLocation {
    SourceControl = 1,
    Window = 10,
    Notification = 15,
}

export class CancellationTokenSource {
    token = { isCancellationRequested: false };
    cancel() { this.token.isCancellationRequested = true; }
    dispose() {}
}
