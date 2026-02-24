import * as assert from 'assert';
import { analyzeVersionUpdate } from '../../core/versionAnalyzer';

describe('Version Analyzer', () => {
    it('should detect patch updates', () => {
        const result = analyzeVersionUpdate('1.0.0', '1.0.1');
        assert.strictEqual(result.updateType, 'patch');
        assert.strictEqual(result.riskLevel, 'low');
        assert.strictEqual(result.isBreakingChange, false);
    });

    it('should detect minor updates', () => {
        const result = analyzeVersionUpdate('1.0.0', '1.1.0');
        assert.strictEqual(result.updateType, 'minor');
        assert.strictEqual(result.riskLevel, 'medium');
        assert.strictEqual(result.isBreakingChange, false);
    });

    it('should detect major updates', () => {
        const result = analyzeVersionUpdate('1.0.0', '2.0.0');
        assert.strictEqual(result.updateType, 'major');
        assert.strictEqual(result.riskLevel, 'high');
        assert.strictEqual(result.isBreakingChange, true);
    });

    it('should handle versions with pre-release suffixes', () => {
        const result = analyzeVersionUpdate('1.0.0', '2.0.0rc1');
        assert.strictEqual(result.updateType, 'major');
        assert.strictEqual(result.riskLevel, 'high');
    });

    it('should handle pre-release to final version (same major.minor)', () => {
        const result = analyzeVersionUpdate('1.0.0rc1', '1.0.0');
        assert.strictEqual(result.updateType, 'patch');
        assert.strictEqual(result.riskLevel, 'low');
    });

    it('should handle final to next pre-release (minor update)', () => {
        const result = analyzeVersionUpdate('1.0.0', '1.1.0a1');
        assert.strictEqual(result.updateType, 'minor');
        assert.strictEqual(result.riskLevel, 'medium');
    });

    it('should handle pre-release to next pre-release (patch update)', () => {
        const result = analyzeVersionUpdate('1.0.0a1', '1.0.0a2');
        assert.strictEqual(result.updateType, 'patch');
        assert.strictEqual(result.riskLevel, 'low');
    });

    it('should handle versions with dots in pre-release', () => {
        const result = analyzeVersionUpdate('1.0.0', '1.0.1.rc1');
        assert.strictEqual(result.updateType, 'patch');
        assert.strictEqual(result.riskLevel, 'low');
    });

    it('should handle two-segment pre-release versions', () => {
        const result = analyzeVersionUpdate('1.0rc1', '1.0');
        assert.strictEqual(result.updateType, 'patch');
        assert.strictEqual(result.riskLevel, 'low');
    });

    it('should handle two-segment versions', () => {
        const result = analyzeVersionUpdate('1.0', '1.1');
        assert.strictEqual(result.updateType, 'minor');
        assert.strictEqual(result.riskLevel, 'medium');
    });

    it('should preserve version strings in result', () => {
        const result = analyzeVersionUpdate('1.2.3', '1.2.4');
        assert.strictEqual(result.currentVersion, '1.2.3');
        assert.strictEqual(result.latestVersion, '1.2.4');
    });
});
