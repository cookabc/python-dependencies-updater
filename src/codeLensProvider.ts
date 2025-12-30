/**
 * CodeLens Provider for requirements.txt
 * Provides version information and clickable update links
 */

import * as vscode from 'vscode';
import { parseDocument } from './parser';
import { getLatestCompatible } from './versionService';
import { getConfig } from './configuration';
import { t } from './i18n';

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
                const latestVersion = versionInfo.latestCompatible;
                
                const range = new vscode.Range(dep.line, dep.endColumn, dep.line, dep.endColumn);
                
                let codeLens: vscode.CodeLens;
                
                if (currentVersion === latestVersion) {
                    // Up to date - show with green check and muted text
                    codeLens = new vscode.CodeLens(range, {
                        title: `$(check-all) ${t('upToDate')}`,
                        command: 'pyDepsHint.showUpToDate',
                        arguments: [dep.packageName, latestVersion],
                        tooltip: `${dep.packageName} ${latestVersion} is up to date`
                    });
                } else {
                    // Update available - show with bright arrow and version
                    codeLens = new vscode.CodeLens(range, {
                        title: `$(arrow-circle-up) ${t('updateTo')} ${latestVersion}`,
                        command: 'pyDepsHint.updateVersion',
                        arguments: [document, dep.line, dep.packageName, latestVersion],
                        tooltip: `Click to update ${dep.packageName} from ${currentVersion} to ${latestVersion}`
                    });
                }
                
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