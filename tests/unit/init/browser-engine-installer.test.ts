/**
 * Browser Engine Installer (Vibium) — unit tests
 *
 * TDD London school: we inject a spawner so tests never touch PATH, the
 * network, or global npm. The spawner is a simple function that returns
 * canned `SpawnSyncReturns` objects.
 */

import { describe, it, expect } from 'vitest';
import type { SpawnSyncReturns } from 'node:child_process';

import {
  installBrowserEngine,
  detectVibium,
  type Spawner,
} from '../../../src/init/browser-engine-installer.js';

type MockCall = { bin: string; args: string[] };

function canned(overrides: Partial<SpawnSyncReturns<string>>): SpawnSyncReturns<string> {
  return {
    pid: 1,
    status: 0,
    signal: null,
    stdout: '',
    stderr: '',
    output: [],
    ...overrides,
  } as SpawnSyncReturns<string>;
}

function enoent(): SpawnSyncReturns<string> {
  return canned({
    status: null,
    error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
  });
}

function makeSpawner(
  responses: (call: MockCall, index: number) => SpawnSyncReturns<string>
): { spawner: Spawner; calls: MockCall[] } {
  const calls: MockCall[] = [];
  const spawner: Spawner = (bin, args) => {
    const call: MockCall = { bin, args };
    calls.push(call);
    return responses(call, calls.length - 1);
  };
  return { spawner, calls };
}

describe('browser-engine-installer', () => {
  describe('detectVibium', () => {
    it('extracts semver from stdout v-prefixed output', () => {
      const { spawner, calls } = makeSpawner(() => canned({ stdout: 'v26.3.18\n' }));
      const result = detectVibium(spawner);
      expect(result).toBe('26.3.18');
      expect(calls).toEqual([{ bin: 'vibium', args: ['--version'] }]);
    });

    it('returns null when vibium is not installed', () => {
      const { spawner } = makeSpawner(() => enoent());
      expect(detectVibium(spawner)).toBeNull();
    });

    it('returns "unknown" when vibium exits 0 with empty stdout AND empty stderr', () => {
      const { spawner } = makeSpawner(() => canned({ stdout: '   \n', stderr: '' }));
      expect(detectVibium(spawner)).toBe('unknown');
    });

    // H1 regression — devil's-advocate finding:
    // Many Go CLIs (including some Vibium versions) write --version output to
    // stderr. detectVibium used to read only stdout and silently report 'unknown'.
    describe('H1 regression: stderr fallback', () => {
      it('reads version from stderr when stdout is empty', () => {
        const { spawner } = makeSpawner(() => canned({ stdout: '', stderr: 'v26.3.18\n' }));
        expect(detectVibium(spawner)).toBe('26.3.18');
      });

      it('prefers stdout over stderr when both have content', () => {
        const { spawner } = makeSpawner(() =>
          canned({ stdout: 'v26.3.18\n', stderr: '26.0.0\n' })
        );
        expect(detectVibium(spawner)).toBe('26.3.18');
      });

      it('extracts semver from verbose output like "vibium version 26.3.18"', () => {
        const { spawner } = makeSpawner(() => canned({ stdout: 'vibium version 26.3.18 (linux/amd64)\n' }));
        expect(detectVibium(spawner)).toBe('26.3.18');
      });

      it('handles semver with prerelease tag', () => {
        const { spawner } = makeSpawner(() => canned({ stdout: 'v27.0.0-rc.1\n' }));
        expect(detectVibium(spawner)).toBe('27.0.0-rc.1');
      });

      it('falls back to first whitespace token when no semver match', () => {
        const { spawner } = makeSpawner(() => canned({ stdout: 'unknown-build foo\n' }));
        expect(detectVibium(spawner)).toBe('unknown-build');
      });
    });
  });

  describe('installBrowserEngine', () => {
    it('returns skipped when options.skip is true', () => {
      const result = installBrowserEngine({ skip: true });
      expect(result.status).toBe('skipped');
      expect(result.packageSpec).toBe('vibium');
    });

    it('returns already-installed when vibium is on PATH', () => {
      const { spawner, calls } = makeSpawner(() => canned({ stdout: 'v26.3.18\n' }));
      const result = installBrowserEngine({ spawner });
      expect(result.status).toBe('already-installed');
      // H1 fix: detectVibium now extracts the bare semver, dropping the v prefix.
      expect(result.version).toBe('26.3.18');
      // Only the detection call, no npm install attempt.
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ bin: 'vibium', args: ['--version'] });
    });

    it('returns npm-unavailable when npm is missing', () => {
      const { spawner, calls } = makeSpawner((call) => {
        if (call.bin === 'vibium') return enoent();
        if (call.bin === 'npm') return enoent();
        throw new Error(`unexpected bin: ${call.bin}`);
      });
      const result = installBrowserEngine({ spawner });
      expect(result.status).toBe('npm-unavailable');
      expect(result.message).toMatch(/npm is not available/i);
      // vibium check + npm check, no install attempt
      expect(calls).toHaveLength(2);
    });

    it('installs via npm when vibium is missing but npm works', () => {
      let vibiumChecks = 0;
      const { spawner, calls } = makeSpawner((call) => {
        if (call.bin === 'vibium') {
          vibiumChecks += 1;
          // First call: not installed. Second call (post-install): installed.
          return vibiumChecks === 1 ? enoent() : canned({ stdout: 'v26.3.18' });
        }
        if (call.bin === 'npm' && call.args[0] === '--version') {
          return canned({ stdout: '10.2.0' });
        }
        if (call.bin === 'npm' && call.args[0] === 'install') {
          return canned({ stdout: 'added 1 package' });
        }
        throw new Error(`unexpected call: ${call.bin} ${call.args.join(' ')}`);
      });

      const result = installBrowserEngine({ spawner });
      expect(result.status).toBe('installed');
      // H1 fix: detectVibium now extracts the bare semver.
      expect(result.version).toBe('26.3.18');
      // vibium check, npm check, npm install, vibium re-check
      expect(calls).toHaveLength(4);
      expect(calls[2]).toEqual({ bin: 'npm', args: ['install', '-g', 'vibium'] });
    });

    it('returns install-failed when npm install exits non-zero', () => {
      const { spawner } = makeSpawner((call) => {
        if (call.bin === 'vibium') return enoent();
        if (call.bin === 'npm' && call.args[0] === '--version') {
          return canned({ stdout: '10.2.0' });
        }
        return canned({ status: 1, stderr: 'EACCES: permission denied' });
      });
      const result = installBrowserEngine({ spawner });
      expect(result.status).toBe('install-failed');
      expect(result.message).toContain('EACCES');
    });

    it('respects a custom packageSpec', () => {
      const { spawner, calls } = makeSpawner(() => canned({ stdout: 'v26.3.18' }));
      const result = installBrowserEngine({ spawner, packageSpec: 'vibium@26.3.18' });
      expect(result.packageSpec).toBe('vibium@26.3.18');
      // Already-installed detection path should not trigger npm install.
      expect(calls).toHaveLength(1);
    });

    it('uses a custom npm binary when provided', () => {
      let vibiumChecks = 0;
      const { spawner, calls } = makeSpawner((call) => {
        if (call.bin === 'vibium') {
          vibiumChecks += 1;
          return vibiumChecks === 1 ? enoent() : canned({ stdout: 'v26.3.18' });
        }
        return canned({ stdout: 'ok' });
      });

      const result = installBrowserEngine({ spawner, npmBin: '/usr/local/bin/npm' });
      expect(result.status).toBe('installed');
      const npmCalls = calls.filter((c) => c.bin === '/usr/local/bin/npm');
      expect(npmCalls).toHaveLength(2);
    });
  });
});
