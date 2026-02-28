/**
 * Status Bar Manager
 */

import * as vscode from 'vscode';
import { t } from '../utils/i18n';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    
    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'pyDepsHint.updateAllVersions';
    }
    
    updateStatus(updatesAvailable: number, totalPackages: number) {
        if (updatesAvailable === 0) {
            this.statusBarItem.text = `$(check) ${t('statusBarUpToDate', totalPackages)}`;
            this.statusBarItem.tooltip = t('statusBarTooltipUpToDate');
            this.statusBarItem.backgroundColor = undefined;
        } else {
            this.statusBarItem.text = `$(warning) ${t('statusBarUpdatesAvailable', updatesAvailable)}`;
            this.statusBarItem.tooltip = t('statusBarTooltipUpdates', updatesAvailable, totalPackages);
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
        
        this.statusBarItem.show();
    }
    
    hide() {
        this.statusBarItem.hide();
    }
    
    dispose() {
        this.statusBarItem.dispose();
    }
}