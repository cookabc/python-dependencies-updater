/**
 * Extension Entry Point
 * Validates: Requirements 1.1, 1.2, 1.3, 8.1, 8.2, 8.3
 */

import * as vscode from 'vscode';
import { PyDepsCodeLensProvider } from './codeLensProvider';
import { onConfigChange } from './configuration';
import { cacheManager } from './cache';
import { parseDocument } from './parser';
import { getLatestCompatible } from './versionService';
import { t } from './i18n';

// Debounce timer for file changes
let debounceTimer: NodeJS.Timeout | undefined;
const DEBOUNCE_DELAY = 300; // ms (Requirement 1.3)

export function activate(context: vscode.ExtensionContext): void {
    console.log('py-deps-hint is now active');
    
    // Register command for updating version
    const updateVersionCommand = vscode.commands.registerCommand(
        'pyDepsHint.updateVersion',
        async (document: vscode.TextDocument, line: number, packageName: string, newVersion: string) => {
            const edit = new vscode.WorkspaceEdit();
            const lineText = document.lineAt(line).text;
            
            // Find the version part and replace it
            const versionRegex = /==[\d\w\.\-\+]+/;
            const match = lineText.match(versionRegex);
            
            if (match) {
                const range = new vscode.Range(
                    line,
                    match.index!,
                    line,
                    match.index! + match[0].length
                );
                edit.replace(document.uri, range, `==${newVersion}`);
                await vscode.workspace.applyEdit(edit);
                
                vscode.window.showInformationMessage(
                    `${t('updated')} ${packageName} ${t('updateTo')} ${newVersion}`
                );
            }
        }
    );
    
    // Register command for updating all versions
    const updateAllCommand = vscode.commands.registerCommand(
        'pyDepsHint.updateAllVersions',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'pip-requirements') {
                vscode.window.showErrorMessage(t('openRequirements'));
                return;
            }
            
            const document = editor.document;
            const deps = parseDocument(document.getText());
            
            const edit = new vscode.WorkspaceEdit();
            let updatedCount = 0;
            
            for (const dep of deps) {
                try {
                    const versionInfo = await getLatestCompatible(dep.packageName, '', false, 60);
                    if (versionInfo.latestCompatible) {
                        const lineText = document.lineAt(dep.line).text;
                        const versionRegex = /==[\d\w\.\-\+]+/;
                        const match = lineText.match(versionRegex);
                        
                        if (match) {
                            const range = new vscode.Range(
                                dep.line,
                                match.index!,
                                dep.line,
                                match.index! + match[0].length
                            );
                            edit.replace(document.uri, range, `==${versionInfo.latestCompatible}`);
                            updatedCount++;
                        }
                    }
                } catch {
                    // Skip failed packages
                }
            }
            
            if (updatedCount > 0) {
                await vscode.workspace.applyEdit(edit);
                vscode.window.showInformationMessage(`${t('updated')} ${updatedCount} ${t('packages')}`);
            } else {
                vscode.window.showInformationMessage(t('noUpdates'));
            }
        }
    );
    
    // Register command for showing up-to-date status (no-op, just for styling)
    const showUpToDateCommand = vscode.commands.registerCommand(
        'pyDepsHint.showUpToDate',
        (packageName: string, version: string) => {
            // This is just for styling purposes, no action needed
        }
    );
    
    context.subscriptions.push(showUpToDateCommand);
    
    // Register CodeLens Provider for version information and updates
    const selector: vscode.DocumentSelector = {
        language: 'pip-requirements',
        scheme: 'file'
    };
    
    const codeLensProvider = new PyDepsCodeLensProvider();
    const codeLensDisposable = vscode.languages.registerCodeLensProvider(
        selector,
        codeLensProvider
    );
    
    context.subscriptions.push(codeLensDisposable);
    
    // Handle document changes with debounce (Requirement 1.2, 1.3)
    const changeDisposable = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.languageId === 'pip-requirements') {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            
            debounceTimer = setTimeout(() => {
                // Refresh CodeLens
                codeLensProvider.refresh();
            }, DEBOUNCE_DELAY);
        }
    });
    
    context.subscriptions.push(changeDisposable);
    
    // Handle configuration changes
    const configDisposable = onConfigChange(() => {
        // Refresh CodeLens when config changes
        codeLensProvider.refresh();
    });
    
    context.subscriptions.push(configDisposable);
}

export function deactivate(): void {
    // Clear debounce timer
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    
    // Clear cache
    cacheManager.clear();
}
