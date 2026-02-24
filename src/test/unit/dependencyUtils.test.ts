import * as assert from 'assert';
import { extractVersionNumber } from '../../utils/dependencyUtils';

describe('Dependency Utils - extractVersionNumber', () => {
    it('should extract exact version with ==', () => {
        assert.strictEqual(extractVersionNumber('==1.2.3'), '1.2.3');
    });

    it('should extract version with >=', () => {
        assert.strictEqual(extractVersionNumber('>=2.0.0'), '2.0.0');
    });

    it('should extract version with <=', () => {
        assert.strictEqual(extractVersionNumber('<=3.1.4'), '3.1.4');
    });

    it('should extract version with ~= ', () => {
        assert.strictEqual(extractVersionNumber('~= 0.5'), '0.5');
    });

    it('should extract version with ^ (caret)', () => {
        assert.strictEqual(extractVersionNumber('^1.0.0'), '1.0.0');
    });

    it('should handle quoted versions', () => {
        assert.strictEqual(extractVersionNumber('"1.2.3"'), '1.2.3');
        assert.strictEqual(extractVersionNumber("'4.5.6'"), '4.5.6');
    });

    it('should handle quoted versions with operators', () => {
        assert.strictEqual(extractVersionNumber('">=1.2.3"'), '1.2.3');
    });

    it('should handle versions without operators', () => {
        assert.strictEqual(extractVersionNumber('1.2.3'), '1.2.3');
    });

    it('should handle whitespace', () => {
        assert.strictEqual(extractVersionNumber('  == 1.2.3  '), '1.2.3');
    });

    it('should return empty string for null/undefined/empty input', () => {
        assert.strictEqual(extractVersionNumber(''), '');
        // @ts-ignore
        assert.strictEqual(extractVersionNumber(null), '');
        // @ts-ignore
        assert.strictEqual(extractVersionNumber(undefined), '');
    });
});
