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

  // Regression test for H5 (devil's advocate finding):
  // The expected-field fallback used to be `||`-chained, which treated
  // falsy-but-valid values (count: 0, url: '', value: '') as missing and
  // reported `expected: null`. Switched to ?? to preserve them.
  describe('H5 regression: falsy expected values', () => {
    // We can't actually invoke the console/network paths without a real
    // vibium, so exercise buildEvalScript directly to prove element_count
    // with count:0 is encoded correctly.
    it('buildEvalScript handles element_count with count: 0', () => {
      const script = assertModule.buildEvalScript({
        kind: 'element_count',
        selector: '.row',
        op: '==',
        count: 0,
      });
      expect(script).toContain('.row');
      expect(script).toContain('0');
    });
  });

  // CodeQL js/regex-injection fix — safeRegex guards RegExp construction
  // from user-supplied `--checks` pattern strings against ReDoS by capping
  // length and catching invalid syntax. Required by CodeQL on PR #421.
  describe('CodeQL regression: safeRegex guards user patterns', () => {
    it('exports safeRegex and MAX_REGEX_PATTERN_LENGTH', () => {
      expect(typeof assertModule.safeRegex).toBe('function');
      expect(typeof assertModule.MAX_REGEX_PATTERN_LENGTH).toBe('number');
      expect(assertModule.MAX_REGEX_PATTERN_LENGTH).toBeGreaterThanOrEqual(1024);
    });

    it('returns a working RegExp for normal input', () => {
      const { re, error } = assertModule.safeRegex('^hello\\s+world$');
      expect(error).toBeNull();
      expect(re).toBeInstanceOf(RegExp);
      expect(re.test('hello world')).toBe(true);
      expect(re.test('bye')).toBe(false);
    });

    it('rejects non-string input', () => {
      const { re, error } = assertModule.safeRegex(42);
      expect(re).toBeNull();
      expect(error).toMatch(/pattern must be a string/);
    });

    it('rejects invalid regex syntax without throwing', () => {
      const { re, error } = assertModule.safeRegex('(unclosed');
      expect(re).toBeNull();
      expect(error).toMatch(/invalid regex/);
    });

    it('rejects patterns longer than MAX_REGEX_PATTERN_LENGTH', () => {
      const long = 'a'.repeat(assertModule.MAX_REGEX_PATTERN_LENGTH + 1);
      const { re, error } = assertModule.safeRegex(long);
      expect(re).toBeNull();
      expect(error).toMatch(/pattern too long/);
    });

    it('accepts exactly MAX_REGEX_PATTERN_LENGTH characters', () => {
      const maxed = 'a'.repeat(assertModule.MAX_REGEX_PATTERN_LENGTH);
      const { re, error } = assertModule.safeRegex(maxed);
      expect(error).toBeNull();
      expect(re).toBeInstanceOf(RegExp);
    });
  });

  // Regression test for B2 (devil's advocate finding):
  // runConsoleCheck and runNetworkCheck used to fail-open when `vibium
  // console --json` errored, silently reporting no_console_errors as pass.
  // The new contract returns an `unavailable` sentinel that runCheck
  // surfaces as `passed: false, unavailable: true`.
  describe('B2 regression: unavailable sentinel shape', () => {
    it('unavailable() returns ok:false with unavailable:true', () => {
      const result = assertModule.unavailable(new Error('command not found'));
      expect(result.ok).toBe(false);
      expect(result.unavailable).toBe(true);
      expect(result.message).toContain('vibium telemetry unavailable');
      expect(result.message).toContain('command not found');
    });

    it('unavailable() accepts string errors', () => {
      const result = assertModule.unavailable('stderr text');
      expect(result.ok).toBe(false);
      expect(result.unavailable).toBe(true);
      expect(result.message).toContain('stderr text');
    });
  });
});
