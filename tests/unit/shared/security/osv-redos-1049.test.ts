/**
 * #1049 CodeQL js/polynomial-redos: version and URL handling on repo- or
 * env-controlled input is linear, and the rewritten version check accepts
 * exactly what the original regex accepted.
 */

import { describe, it, expect } from 'vitest';
import { isConcreteVersion, MAX_VERSION_LENGTH } from '../../../../src/shared/security/osv-lookup';
import { resolveOSVBaseUrl, MAX_OSV_URL_LENGTH } from '../../../../src/shared/security/osv-client';
import { parseLockfile } from '../../../../src/domains/security-compliance/services/scanners/lockfile-versions';

/** The original (polynomially backtracking) definition, used only on short inputs as the oracle. */
const ORIGINAL = (v: string): boolean =>
  /^\d+(\.\d+)*([-+._]?[0-9A-Za-z][0-9A-Za-z.+-]*)?$/.test(v) && !/(^|\.)[xX*](\.|$)/.test(v);

function* strings(alphabet: string[], maxLength: number): Generator<string> {
  let level = [''];
  for (let len = 1; len <= maxLength; len++) {
    const next: string[] = [];
    for (const prefix of level) for (const c of alphabet) next.push(prefix + c);
    yield* next;
    level = next;
  }
}

const elapsed = (fn: () => unknown): number => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

describe('isConcreteVersion is linear and equivalent to the original regex (#1049)', () => {
  it('agrees with the original regex on every string up to length 6 over the relevant alphabet', () => {
    const alphabet = ['1', '0', '.', '-', '+', '_', 'a', 'x', '*', ' ', 'X'];
    let checked = 0;
    for (const s of strings(alphabet, 6)) {
      if (isConcreteVersion(s) !== ORIGINAL(s)) throw new Error(`mismatch for ${JSON.stringify(s)}: original ${ORIGINAL(s)}`);
      checked++;
    }
    expect(checked).toBeGreaterThan(1_000_000);
  });

  it('agrees on real-world versions and the tricky re-split forms', () => {
    for (const v of ['4.17.15', '1.0rc1', '2.0.0-beta.1', '1.2.3+build.5', '1.2_beta', '1.2.-beta', '1_2.3', '1.2.3_4_5',
      '11.', '12.-', '1.', '1.x', '1.2.*', 'v1.2.3', '^1.2.3', '1..2', '1.2.', '', '1.0.0-rc.1+sha.abc', '20240101', '1.2.3 ']) {
      expect(isConcreteVersion(v), v).toBe(ORIGINAL(v));
    }
  });

  it(`rejects versions longer than ${MAX_VERSION_LENGTH} characters`, () => {
    expect(isConcreteVersion(`1.${'0'.repeat(MAX_VERSION_LENGTH - 2)}`)).toBe(true);
    expect(isConcreteVersion(`1.${'0'.repeat(MAX_VERSION_LENGTH - 1)}`)).toBe(false);
  });

  it('a 50k-character adversarial version string returns fast', () => {
    const adversarial = ['1', '.1'.repeat(25_000), '!'].join('');
    const underscore = ['1', '.1'.repeat(25_000), '_', 'a'.repeat(10), '!'].join('');
    expect(elapsed(() => {
      expect(isConcreteVersion(adversarial)).toBe(false);
      expect(isConcreteVersion(underscore)).toBe(false);
    })).toBeLessThan(50);
    // The shape check alone (no length cap) is linear too: 256 chars of the worst case.
    expect(elapsed(() => isConcreteVersion(`1${'.1'.repeat(127)}!`))).toBeLessThan(5);
  });
});

describe('AQE_OSV_API_URL is bounded and trailing slashes are stripped linearly (#1049)', () => {
  it('strips any number of trailing slashes', () => {
    expect(resolveOSVBaseUrl({ AQE_OSV_API_URL: 'https://osv.internal.example///' })).toBe('https://osv.internal.example');
    expect(resolveOSVBaseUrl({ AQE_OSV_API_URL: 'https://osv.internal.example/v1/' })).toBe('https://osv.internal.example/v1');
  });

  it(`treats a value longer than ${MAX_OSV_URL_LENGTH} characters as invalid, quickly`, () => {
    const long = `https://osv.example/${'/'.repeat(50_000)}x`;
    expect(elapsed(() => expect(() => resolveOSVBaseUrl({ AQE_OSV_API_URL: long })).toThrow(/longer than 2048/))).toBeLessThan(50);
    const atLimit = `https://osv.example/${'a'.repeat(MAX_OSV_URL_LENGTH - 'https://osv.example/'.length)}`;
    expect(resolveOSVBaseUrl({ AQE_OSV_API_URL: atLimit })).toBe(atLimit);
  });
});

describe('pnpm-lock parsing stays linear on adversarial lines (#1049)', () => {
  it('long whitespace before an embedded \\r, many "(" and "_" do not backtrack', () => {
    const value = `${' '.repeat(20_000)}x\ry`;
    const lock = ["lockfileVersion: '9.0'", '', 'importers:', '', '  .:', '    dependencies:',
      `      lodash:${value}`, '      ms:', `        specifier:${value}`, `        version: 2.1.3${'('.repeat(20_000)}\r`,
      `      qs: 6.7.0${'_'.repeat(20_000)}\r`, ''].join('\n');
    let index: ReturnType<typeof parseLockfile> | undefined;
    expect(elapsed(() => { index = parseLockfile('pnpm-lock.yaml', lock); })).toBeLessThan(200);
    expect(index!.resolve('', 'ms', '2.1.3')).toMatchObject({ version: '2.1.3' });
    expect(index!.resolve('', 'qs', '6.7.0')).toMatchObject({ version: '6.7.0' });
  });
});
