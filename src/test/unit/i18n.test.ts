
import { getLocale } from '../../utils/i18n';
import * as assert from 'assert';

describe('i18n Logic', () => {
    describe('getLocale', () => {
        it('should return English for en', () => {
            assert.strictEqual(getLocale('en'), 'en');
        });

        it('should return zh-cn for zh-cn', () => {
            assert.strictEqual(getLocale('zh-cn'), 'zh-cn');
        });

        it('should fallback to fr for fr-ca', () => {
            assert.strictEqual(getLocale('fr-ca'), 'fr');
        });

        it('should fallback to de for de-ch', () => {
            assert.strictEqual(getLocale('de-ch'), 'de');
        });

        it('should handle zh variants correctly', () => {
            assert.strictEqual(getLocale('zh-tw'), 'zh-tw');
            assert.strictEqual(getLocale('zh-hk'), 'zh-tw');
            assert.strictEqual(getLocale('zh-sg'), 'zh-cn');
        });

        it('should default to en for unknown languages', () => {
            assert.strictEqual(getLocale('xx-yy'), 'en');
        });
    });
});
