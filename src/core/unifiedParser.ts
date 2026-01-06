/**
 * Unified Parser - delegates to appropriate parser based on file format
 */

import * as vscode from 'vscode';
import { parseDocument as parseRequirementsDocument } from './parser';
import { parsePyprojectDocument } from './pyprojectParser';
import type { ParsedDependency } from '../types';

export function parseDocumentByFormat(
    document: vscode.TextDocument
): ParsedDependency[] {
    if (document.languageId === 'pip-requirements') {
        return parseRequirementsDocument(document.getText());
    } else if (document.languageId === 'toml') {
        return parsePyprojectDocument(document.getText());
    }

    return [];
}

export function isSupportedFormat(languageId: string): boolean {
    return languageId === 'pip-requirements' || languageId === 'toml';
}
