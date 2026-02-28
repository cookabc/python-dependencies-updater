/**
 * Test register script that provides a vscode module mock.
 * Required before tests so that modules importing 'vscode' don't fail.
 */
const Module = require('module');
const path = require('path');

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: unknown, isMain: boolean, options: unknown) {
    if (request === 'vscode') {
        return path.resolve(__dirname, '__mocks__', 'vscode.ts');
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
};
