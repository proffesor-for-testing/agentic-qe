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
  });
});
