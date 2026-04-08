/**
 * qe-browser: assert.js unit tests
 *
 * Verifies pure-logic bits of the assertion runner — script building and
 * check-kind validation — without spawning a real Vibium browser.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// Load the CJS helper from the skill directory.
const assertModule = require('../../../.claude/skills/qe-browser/scripts/assert.js');

describe('qe-browser assert helpers', () => {
  describe('CHECK_KINDS', () => {
    it('includes all 16 documented kinds', () => {
      const kinds = Array.from(assertModule.CHECK_KINDS as Set<string>);
      expect(kinds).toContain('url_contains');
      expect(kinds).toContain('url_equals');
      expect(kinds).toContain('text_visible');
      expect(kinds).toContain('text_hidden');
      expect(kinds).toContain('selector_visible');
      expect(kinds).toContain('selector_hidden');
      expect(kinds).toContain('value_equals');
      expect(kinds).toContain('attribute_equals');
      expect(kinds).toContain('no_console_errors');
      expect(kinds).toContain('no_failed_requests');
      expect(kinds).toContain('response_status');
      expect(kinds).toContain('request_url_seen');
      expect(kinds).toContain('console_message_matches');
      expect(kinds).toContain('element_count');
      expect(kinds).toContain('title_matches');
      expect(kinds).toContain('page_source_contains');
      expect(kinds.length).toBe(16);
    });
  });

  describe('buildEvalScript', () => {
    it('returns a JS expression for url_contains', () => {
      const script = assertModule.buildEvalScript({
        kind: 'url_contains',
        text: '/dashboard',
      });
      expect(script).toContain('location.href');
      expect(script).toContain('"/dashboard"');
    });

    it('returns a JS expression for selector_visible with escaped selector', () => {
      const script = assertModule.buildEvalScript({
        kind: 'selector_visible',
        selector: '#user-menu',
      });
      expect(script).toContain('querySelector');
      expect(script).toContain('"#user-menu"');
      expect(script).toContain('getBoundingClientRect');
    });

    it('encodes element_count with comparison operator', () => {
      const script = assertModule.buildEvalScript({
        kind: 'element_count',
        selector: '.result',
        op: '>=',
        count: 5,
      });
      expect(script).toContain('querySelectorAll');
      expect(script).toContain('".result"');
      expect(script).toContain('5');
      expect(script).toContain('>=');
    });

    it('returns null for unknown kind', () => {
      const script = assertModule.buildEvalScript({ kind: 'totally_fake' });
      expect(script).toBeNull();
    });

    it('safely escapes quotes in text via JSON.stringify', () => {
      const script = assertModule.buildEvalScript({
        kind: 'text_visible',
        text: 'Say "hello" now',
      });
      expect(script).toContain('"Say \\"hello\\" now"');
    });
  });

  describe('runCheck contract', () => {
    it('rejects non-object inputs', () => {
      const result = assertModule.runCheck(null);
      expect(result.passed).toBe(false);
      expect(result.message).toMatch(/check must be an object/);
    });

    it('rejects unknown kinds before touching vibium', () => {
      const result = assertModule.runCheck({ kind: 'not_real' });
      expect(result.passed).toBe(false);
      expect(result.message).toMatch(/unknown check kind/);
    });
  });
});
