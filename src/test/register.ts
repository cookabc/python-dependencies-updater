/**
 * Test bootstrap that provides a vscode module mock.
 * Compiled to out/test/register.js by `tsc -p ./` (see the `test` script);
 * at runtime it rewrites resolution of "vscode" to the compiled mock so that
 * modules importing 'vscode' can run outside the extension host.
 */
const Module = require("node:module");
const path = require("node:path");

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (
	request: string,
	parent: unknown,
	isMain: boolean,
	options: unknown,
) {
	if (request === "vscode") {
		return path.resolve(__dirname, "__mocks__", "vscode.js");
	}
	return originalResolveFilename.call(this, request, parent, isMain, options);
};
