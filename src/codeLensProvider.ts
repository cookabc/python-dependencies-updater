/**
 * CodeLens Provider for requirements.txt
 * Provides clickable "Update" links for each dependency
 */

import * as vscode from 'vscode';
import { parseDocument } from './parser';
import { getLatestCompatible } from './versionService';
import { getConfig } from './configuration';

export class PyDepsCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
    
    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }
    async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        const config = getConfig();
        
        if (!config.enabled) {
            return [];
        }
        
        const codeLenses: vscode.CodeLens[] = [];
        const dependencies = parseDocument(document.getText());
        
        // Process dependencies in parallel
        const promises = dependencies.map(async dep => {
            if (token.isCancellationRequested) {
                return null;
            }
            
            try {
                // Get latest version
                const versionInfo = await getLatestCompatible(
                    dep.packageName,
                    '',
                    config.showPrerelease,
                    config.cacheTTLMinutes
                );
                
                if (versionInfo.error || !versionInfo.latestCompatible) {
                    return null;
                }
                
                // Extract current version
                const currentVersion = dep.versionSpecifier.replace(/^==/, '');
                
                // Only show update if versions differ
                if (currentVersion === versionInfo.latestCompatible) {
                    return null;
                }
                
                const range = new vscode.Range(dep.line, dep.endColumn, dep.line, dep.endColumn);
                
                const codeLens = new vscode.CodeLens(range, {
                    title: `↗ Update to ${versionInfo.latestCompatible}`,
                    command: 'pyDepsHint.updateVersion',
                    arguments: [document, dep.line, dep.packageName, versionInfo.latestCompatible]
                });
                
                return codeLens;
            } catch {
                return null;
            }
        });
        
        const results = await Promise.all(promises);
        
        for (const codeLens of results) {
            if (codeLens) {
                codeLenses.push(codeLens);
            }
        }
        
        return codeLenses;
    }
}