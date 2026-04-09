/**
 * qe-browser: lib/vibium.js unit tests
 *
 * Pure-function helpers (parseArgs, envelope, unwrapEvalResult). The shell-out
 * functions (vibium, vibiumJson, vibiumEval) are exercised by the smoke test.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const lib = require('../../../.claude/skills/qe-browser/scripts/lib/vibium.js');

describe('qe-browser lib/vibium', () => {
  describe('parseArgs', () => {
    it('parses --key value (space form)', () => {
      const args = lib.parseArgs(['--name', 'homepage', '--threshold', '0.05']);
      expect(args.name).toBe('homepage');
      expect(args.threshold).toBe('0.05');
    });

    it('treats --flag with no value as boolean true', () => {
      const args = lib.parseArgs(['--include-hidden', '--json']);
      expect(args['include-hidden']).toBe(true);
      expect(args.json).toBe(true);
    });

    it('treats --flag1 --flag2 as two booleans, not key=value', () => {
      const args = lib.parseArgs(['--update-baseline', '--summary-only']);
      expect(args['update-baseline']).toBe(true);
      expect(args['summary-only']).toBe(true);
    });

    it('ignores positional arguments before flags', () => {
      const args = lib.parseArgs(['positional', '--name', 'foo']);
      expect(args.name).toBe('foo');
    });

    // M5 regression — devil's-advocate finding:
    // Previously --threshold=0.5 set args['threshold=0.5'] = true and the
    // real `threshold` key was never populated. The fix splits on the first
    // '=' so both forms work and the value survives intact.
    describe('M5: --key=value form', () => {
      it('parses --threshold=0.05 into key/value', () => {
        const args = lib.parseArgs(['--threshold=0.05']);
        expect(args.threshold).toBe('0.05');
        expect(args['threshold=0.05']).toBeUndefined();
      });

      it('parses --name=homepage', () => {
        const args = lib.parseArgs(['--name=homepage']);
        expect(args.name).toBe('homepage');
      });

      it('only splits on the FIRST = so values containing = survive', () => {
        // URLs and base64 commonly contain `=`. The value must be preserved.
        const args = lib.parseArgs(['--url=https://example.com/?foo=bar&baz=qux']);
        expect(args.url).toBe('https://example.com/?foo=bar&baz=qux');
      });

      it('handles empty value: --key=', () => {
        const args = lib.parseArgs(['--name=']);
        expect(args.name).toBe('');
      });

      it('mixes --key value and --key=value forms in one call', () => {
        const args = lib.parseArgs([
          '--name=homepage',
          '--threshold',
          '0.02',
          '--update-baseline',
        ]);
        expect(args.name).toBe('homepage');
        expect(args.threshold).toBe('0.02');
        expect(args['update-baseline']).toBe(true);
      });
    });
  });

  describe('envelope', () => {
    it('produces a structured JSON envelope with required keys', () => {
      const env = lib.envelope({
        operation: 'test',
        summary: 'ok',
        status: 'success',
        details: { foo: 'bar' },
        metadata: { ms: 42 },
      });
      expect(env.skillName).toBe('qe-browser');
      expect(env.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(env.trustTier).toBe(3);
      expect(env.status).toBe('success');
      expect(env.output.operation).toBe('test');
      expect(env.output.summary).toBe('ok');
      expect(env.output.foo).toBe('bar');
      expect(env.metadata.ms).toBe(42);
      expect(env.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('omits the vibiumUnavailable flag on the happy path', () => {
      // Top-level flag should NOT be set unless explicitly requested, so the
      // 99% success case keeps the original envelope shape.
      const env = lib.envelope({ operation: 'x', summary: 'y' });
      expect('vibiumUnavailable' in env).toBe(false);
    });
  });

  // F1 (Phase 6): missing-vibium contract
  describe('F1: VibiumUnavailableError + unavailableEnvelope + runOrSkip', () => {
    describe('VibiumUnavailableError', () => {
      it('is exported and is an Error subclass', () => {
        expect(typeof lib.VibiumUnavailableError).toBe('function');
        const err = new lib.VibiumUnavailableError('test');
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(lib.VibiumUnavailableError);
      });

      it('has a stable code property for cross-module duck typing', () => {
        const err = new lib.VibiumUnavailableError('test');
        expect(err.code).toBe('BROWSER_ENGINE_UNAVAILABLE');
        expect(err.name).toBe('VibiumUnavailableError');
      });

      it('preserves the message', () => {
        const err = new lib.VibiumUnavailableError('vibium binary not found on PATH');
        expect(err.message).toContain('vibium binary not found');
      });
    });

    describe('unavailableEnvelope', () => {
      it('returns the documented skipped envelope shape', () => {
        const env = lib.unavailableEnvelope('assert', 'vibium not found');
        expect(env.skillName).toBe('qe-browser');
        expect(env.status).toBe('skipped');
        expect(env.vibiumUnavailable).toBe(true);
        expect(env.output.operation).toBe('assert');
        expect(env.output.reason).toBe('browser-engine-unavailable');
        expect(env.output.error).toBe('vibium not found');
        expect(Array.isArray(env.output.remediation)).toBe(true);
        expect(env.output.remediation.join(' ')).toMatch(/npm install -g vibium/);
        expect(env.output.remediation.join(' ')).toMatch(/aqe init/);
      });
    });

    describe('runOrSkip', () => {
      it('passes through the inner function return value on the happy path', () => {
        const result = lib.runOrSkip('test-op', () => 0);
        expect(result).toBe(0);
      });

      it('catches VibiumUnavailableError and emits a skipped envelope', () => {
        // Capture stdout for the duration of the call so we can inspect
        // the emitted JSON.
        const originalWrite = process.stdout.write.bind(process.stdout);
        const captured: string[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        process.stdout.write = ((chunk: any) => {
          captured.push(String(chunk));
          return true;
        }) as any;
        let exitCode: number;
        try {
          exitCode = lib.runOrSkip('intent-score', () => {
            throw new lib.VibiumUnavailableError(
              'vibium binary not found on PATH. Install via `npm install -g vibium` or run `aqe init`.'
            );
          });
        } finally {
          process.stdout.write = originalWrite as any;
        }
        expect(exitCode).toBe(2); // skipped exit code
        const out = JSON.parse(captured.join(''));
        expect(out.status).toBe('skipped');
        expect(out.vibiumUnavailable).toBe(true);
        expect(out.output.operation).toBe('intent-score');
        expect(out.output.reason).toBe('browser-engine-unavailable');
      });

      it('also catches duck-typed errors with code: BROWSER_ENGINE_UNAVAILABLE', () => {
        // Some downstream wrappers may rebuild the error from JSON, losing
        // the prototype chain. The duck-type fallback should still trigger.
        const originalWrite = process.stdout.write.bind(process.stdout);
        const captured: string[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        process.stdout.write = ((chunk: any) => {
          captured.push(String(chunk));
          return true;
        }) as any;
        let exitCode: number;
        try {
          exitCode = lib.runOrSkip('assert', () => {
            const err = new Error('not found');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (err as any).code = 'BROWSER_ENGINE_UNAVAILABLE';
            throw err;
          });
        } finally {
          process.stdout.write = originalWrite as any;
        }
        expect(exitCode).toBe(2);
        const out = JSON.parse(captured.join(''));
        expect(out.status).toBe('skipped');
      });

      it('re-throws unrelated errors so they fail loudly', () => {
        expect(() =>
          lib.runOrSkip('test', () => {
            throw new Error('something else broke');
          })
        ).toThrow('something else broke');
      });
    });

    describe('emit() exit codes', () => {
      // Capture stdout, run emit, return the exit code without polluting test logs.
      function captured(env: any) {
        const originalWrite = process.stdout.write.bind(process.stdout);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        process.stdout.write = (() => true) as any;
        try {
          return lib.emit(env);
        } finally {
          process.stdout.write = originalWrite as any;
        }
      }

      it('returns 0 for status: success', () => {
        expect(captured(lib.envelope({ operation: 'x', summary: 'ok', status: 'success' }))).toBe(0);
      });

      it('returns 1 for status: failed', () => {
        expect(captured(lib.envelope({ operation: 'x', summary: 'no', status: 'failed' }))).toBe(1);
      });

      it('returns 2 for status: skipped', () => {
        expect(captured(lib.unavailableEnvelope('x', 'no vibium'))).toBe(2);
      });
    });
  });
});
