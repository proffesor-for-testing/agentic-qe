/**
 * qe-browser: batch.js unit tests
 *
 * Tests the M6 pre-validation pass and the dispatch contract. The actual
 * vibium calls are not exercised here — those go through the smoke test.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const batch = require('../../../.claude/skills/qe-browser/scripts/batch.js');

describe('qe-browser batch', () => {
  describe('VALID_ACTIONS', () => {
    it('exposes the documented action whitelist', () => {
      expect(batch.VALID_ACTIONS.has('go')).toBe(true);
      expect(batch.VALID_ACTIONS.has('click')).toBe(true);
      expect(batch.VALID_ACTIONS.has('fill')).toBe(true);
      expect(batch.VALID_ACTIONS.has('assert')).toBe(true);
      expect(batch.VALID_ACTIONS.has('typo_action')).toBe(false);
    });
  });

  // M6 regression — devil's-advocate finding:
  // batch.js originally validated each step lazily during dispatch, so a
  // typo in step 17 surfaced AFTER steps 1-16 had already executed.
  // validateAllSteps() now walks every step's required fields BEFORE the
  // first vibium call.
  describe('M6: validateStep / validateAllSteps', () => {
    it('passes a well-formed go step', () => {
      expect(batch.validateStep({ action: 'go', url: 'https://example.com' }, 0)).toBeNull();
    });

    it('flags missing url on go', () => {
      const err = batch.validateStep({ action: 'go' }, 0);
      expect(err).toMatch(/missing "url"/);
      expect(err).toContain('step 0');
    });

    it('flags an unknown action', () => {
      const err = batch.validateStep({ action: 'clikc', selector: '#x' }, 3);
      expect(err).toMatch(/unknown action "clikc"/);
      expect(err).toContain('step 3');
    });

    it('flags click without ref or selector', () => {
      const err = batch.validateStep({ action: 'click' }, 1);
      expect(err).toMatch(/missing "ref" or "selector"/);
    });

    it('accepts click with ref', () => {
      expect(batch.validateStep({ action: 'click', ref: '@e1' }, 0)).toBeNull();
    });

    it('accepts click with selector', () => {
      expect(batch.validateStep({ action: 'click', selector: 'button' }, 0)).toBeNull();
    });

    it('flags fill without text (even when target is set)', () => {
      const err = batch.validateStep({ action: 'fill', selector: '#email' }, 2);
      expect(err).toMatch(/"text" must be a string/);
    });

    it('accepts fill with text=""', () => {
      // Empty string is a legitimate value (clear the input).
      expect(
        batch.validateStep({ action: 'fill', selector: '#email', text: '' }, 0)
      ).toBeNull();
    });

    it('flags assert without checks array', () => {
      const err = batch.validateStep({ action: 'assert' }, 5);
      expect(err).toMatch(/"checks" must be an array/);
    });

    it('accepts assert with empty checks array', () => {
      // No checks is a no-op but not an error — keep dispatch consistent.
      expect(batch.validateStep({ action: 'assert', checks: [] }, 0)).toBeNull();
    });

    it('flags non-object steps', () => {
      const err = batch.validateStep(null, 0);
      expect(err).toMatch(/must be an object/);
    });

    it('validateAllSteps returns errors from EVERY bad step', () => {
      const steps = [
        { action: 'go', url: 'https://example.com' },
        { action: 'click' }, // missing target
        { action: 'unknown_op' }, // unknown action
        { action: 'fill', selector: '#x' }, // missing text
      ];
      const errors = batch.validateAllSteps(steps);
      expect(errors.length).toBe(3);
      expect(errors[0]).toContain('step 1');
      expect(errors[1]).toContain('step 2');
      expect(errors[2]).toContain('step 3');
    });

    it('validateAllSteps returns [] for an all-valid plan', () => {
      const steps = [
        { action: 'go', url: 'https://example.com' },
        { action: 'fill', selector: '#email', text: 'a@b.c' },
        { action: 'click', ref: '@e1' },
        { action: 'wait_url', pattern: '/dashboard' },
        { action: 'assert', checks: [{ kind: 'no_console_errors' }] },
      ];
      expect(batch.validateAllSteps(steps)).toEqual([]);
    });
  });
});
