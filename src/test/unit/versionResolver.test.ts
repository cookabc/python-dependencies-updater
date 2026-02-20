
import * as assert from 'assert';
import { parseVersion, compareVersions, satisfies, resolve, parseSpecifier } from '../../core/versionResolver';

describe('Version Resolver', () => {
    describe('parseVersion', () => {
        it('should parse simple versions', () => {
            assert.deepStrictEqual(parseVersion('1.0.0'), [1, 0, 0]);
            assert.deepStrictEqual(parseVersion('2.1'), [2, 1, 0]);
        });

        it('should ignore pre-release tags for parsing', () => {
            assert.deepStrictEqual(parseVersion('1.0.0-alpha'), [1, 0, 0]);
            assert.deepStrictEqual(parseVersion('2.1.0rc1'), [2, 1, 0]);
        });
    });

    describe('compareVersions', () => {
        it('should correctly compare standard versions', () => {
            assert.strictEqual(compareVersions('1.0.0', '1.0.1'), -1);
            assert.strictEqual(compareVersions('1.1.0', '1.0.9'), 1);
            assert.strictEqual(compareVersions('1.0.0', '1.0.0'), 0);
        });

        it('should handle pre-release versions', () => {
            assert.strictEqual(compareVersions('1.0.0-alpha', '1.0.0'), -1);
            assert.strictEqual(compareVersions('1.0.0', '1.0.0-beta'), 1);
        });

        it('should correctly compare standard versions', () => {
            assert.strictEqual(compareVersions('1.0.0', '1.0.1'), -1);
            assert.strictEqual(compareVersions('1.1.0', '1.0.9'), 1);
            assert.strictEqual(compareVersions('1.0.0', '1.0.0'), 0);
            assert.strictEqual(compareVersions('2.0.0', '1.0.0'), 1);
        });

        it('should correctly compare pre-release versions (alpha < beta < rc)', () => {
            // alpha < beta
            assert.strictEqual(compareVersions('1.0.0a1', '1.0.0b1'), -1);
            assert.strictEqual(compareVersions('1.0.0alpha1', '1.0.0beta1'), -1);

            // beta < rc
            assert.strictEqual(compareVersions('1.0.0b1', '1.0.0rc1'), -1);
            assert.strictEqual(compareVersions('1.0.0beta1', '1.0.0pre1'), -1);

            // rc < final
            assert.strictEqual(compareVersions('1.0.0rc1', '1.0.0'), -1);

            // dev < alpha
            assert.strictEqual(compareVersions('1.0.0dev1', '1.0.0a1'), -1);
        });

        it('should correctly compare post-release versions', () => {
            // final < post
            assert.strictEqual(compareVersions('1.0.0', '1.0.0.post1'), -1);

            // post1 < post2
            assert.strictEqual(compareVersions('1.0.0.post1', '1.0.0.post2'), -1);
        });

        it('should correctly compare pre-release numbers', () => {
            assert.strictEqual(compareVersions('1.0.0a1', '1.0.0a2'), -1);
            assert.strictEqual(compareVersions('1.0.0b1', '1.0.0b2'), -1);
            assert.strictEqual(compareVersions('1.0.0rc1', '1.0.0rc2'), -1);
        });

        it('should correctly compare numeric parts vs pre-release', () => {
            // 1.0.0 < 1.0.1a1
            assert.strictEqual(compareVersions('1.0.0', '1.0.1a1'), -1);
            // 1.0.1a1 < 1.0.1
            assert.strictEqual(compareVersions('1.0.1a1', '1.0.1'), -1);
        });

        it('should handle complex pre-release patterns', () => {
            assert.strictEqual(compareVersions('1.0.0a1', '1.0.0.a1'), 0);
        });
    });

    describe('satisfies', () => {
        it('should handle == operator', () => {
            assert.strictEqual(satisfies('1.0.0', [{ operator: '==', version: '1.0.0' }]), true);
            assert.strictEqual(satisfies('1.0.1', [{ operator: '==', version: '1.0.0' }]), false);
        });

        it('should handle >= operator', () => {
            assert.strictEqual(satisfies('1.1.0', [{ operator: '>=', version: '1.0.0' }]), true);
            assert.strictEqual(satisfies('0.9.0', [{ operator: '>=', version: '1.0.0' }]), false);
        });

        it('should reflect multiple constraints', () => {
            const constraints = [
                { operator: '>=', version: '1.0.0' } as any,
                { operator: '<', version: '2.0.0' } as any
            ];
            assert.strictEqual(satisfies('1.5.0', constraints), true);
            assert.strictEqual(satisfies('2.0.0', constraints), false);
            assert.strictEqual(satisfies('0.9.9', constraints), false);
        });
    });

    describe('resolve', () => {
        const versions = ['0.9.0', '1.0.0', '1.1.0', '1.2.0-beta', '2.0.0'];

        it('should find latest compatible version', () => {
            const result = resolve(versions, '>=1.0.0,<2.0.0');
            assert.strictEqual(result.found, true);
            assert.strictEqual(result.version, '1.1.0');
        });

        it('should ignore pre-releases by default', () => {
            const result = resolve(versions, '>=1.0.0');
            assert.strictEqual(result.found, true);
            assert.strictEqual(result.version, '2.0.0');
            assert.notStrictEqual(result.version, '1.2.0-beta');
        });

        it('should include pre-releases if requested', () => {
            // If the constraint allows it and we enable includePrerelease
            // But standard resolve implementation filters them out unless explicitly matched or flag set?
            // The current implementation filters `!includePrerelease && isPrerelease(v)`
            const result = resolve(versions, '>=1.1.0', true);
            assert.strictEqual(result.found, true);
            assert.strictEqual(result.version, '2.0.0'); // 2.0.0 is > 1.2.0-beta

            // Let's try to match ONLY the beta
            const betaVersions = ['1.2.0-beta'];
            const res = resolve(betaVersions, '>=1.0.0', true);
            assert.strictEqual(res.found, true);
            assert.strictEqual(res.version, '1.2.0-beta');
        });
    });

    describe('~= compatible release operator (PEP 440)', () => {
        it('~=X.Y.Z should allow same major.minor', () => {
            // ~=1.4.2 means >=1.4.2, ==1.4.*
            assert.strictEqual(satisfies('1.4.5', [{ operator: '~=', version: '1.4.2' }]), true);
            assert.strictEqual(satisfies('1.4.2', [{ operator: '~=', version: '1.4.2' }]), true);
        });

        it('~=X.Y.Z should reject different minor', () => {
            assert.strictEqual(satisfies('1.5.0', [{ operator: '~=', version: '1.4.2' }]), false);
        });

        it('~=X.Y.Z should reject lower version', () => {
            assert.strictEqual(satisfies('1.4.1', [{ operator: '~=', version: '1.4.2' }]), false);
        });

        it('~=X.Y should allow same major', () => {
            // ~=2.1 means >=2.1, ==2.*
            assert.strictEqual(satisfies('2.1.0', [{ operator: '~=', version: '2.1' }]), true);
            assert.strictEqual(satisfies('2.5.0', [{ operator: '~=', version: '2.1' }]), true);
        });

        it('~=X.Y should reject different major', () => {
            assert.strictEqual(satisfies('3.0.0', [{ operator: '~=', version: '2.1' }]), false);
        });

        it('~=X.Y should reject lower version', () => {
            assert.strictEqual(satisfies('2.0.0', [{ operator: '~=', version: '2.1' }]), false);
        });

        it('should resolve with ~= constraint', () => {
            const versions = ['1.3.0', '1.4.0', '1.4.5', '1.5.0', '2.0.0'];
            const result = resolve(versions, '~=1.4.0');
            assert.strictEqual(result.found, true);
            assert.strictEqual(result.version, '1.4.5');
        });
    });
});
