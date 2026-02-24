/**
 * Version Analysis utilities
 */

import type { VersionAnalysis } from '../types';
import { parseVersion } from './versionResolver';

/**
 * Analyze version difference and risk level
 */
export function analyzeVersionUpdate(current: string, latest: string): VersionAnalysis {
    const currentParts = parseVersion(current);
    const latestParts = parseVersion(latest);
    
    let updateType: 'patch' | 'minor' | 'major' = 'patch';
    let isBreakingChange = false;
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    
    const [currentMajor, currentMinor] = currentParts;
    const [latestMajor, latestMinor] = latestParts;

    if (currentMajor !== latestMajor) {
        updateType = 'major';
        isBreakingChange = true;
        riskLevel = 'high';
    } else if (currentMinor !== latestMinor) {
        updateType = 'minor';
        riskLevel = 'medium';
    } else {
        updateType = 'patch';
        riskLevel = 'low';
    }
    
    return {
        currentVersion: current,
        latestVersion: latest,
        updateType,
        isBreakingChange,
        riskLevel
    };
}