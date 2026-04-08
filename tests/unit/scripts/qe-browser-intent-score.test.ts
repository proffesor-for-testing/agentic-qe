/**
 * qe-browser: intent-score.js unit tests
 *
 * Verifies the script builder and intent whitelist.
 * The actual scoring runs in the browser via `vibium eval`, so we only test
 * the builder here — the scorer itself is validated by the eval harness.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mod = require('../../../.claude/skills/qe-browser/scripts/intent-score.js');

describe('qe-browser intent-score', () => {
  describe('VALID_INTENTS', () => {
    it('exposes all 15 documented intents', () => {
      expect(mod.VALID_INTENTS).toEqual(
        expect.arrayContaining([
          'submit_form',
          'close_dialog',
          'primary_cta',
          'search_field',
          'next_step',
          'dismiss',
          'auth_action',
          'back_navigation',
          'fill_email',
          'fill_password',
          'fill_username',
          'accept_cookies',
          'main_content',
          'pagination_next',
          'pagination_prev',
        ])
      );
      expect(mod.VALID_INTENTS.length).toBe(15);
    });
  });

  describe('buildScript', () => {
    it('embeds the intent literal', () => {
      const script = mod.buildScript('submit_form', null);
      expect(script).toContain('"submit_form"');
    });

    it('uses null when no scope given', () => {
      const script = mod.buildScript('primary_cta', undefined);
      expect(script).toContain('null');
    });

    it('embeds the scope selector when given', () => {
      const script = mod.buildScript('accept_cookies', '#cookie-banner');
      expect(script).toContain('"#cookie-banner"');
    });

    it('wraps output in JSON.stringify for round-trip safety', () => {
      const script = mod.buildScript('search_field', null);
      expect(script).toContain('JSON.stringify');
      expect(script).toContain('console.log');
    });

    it('contains all 15 scorer function names', () => {
      const script = mod.buildScript('submit_form', null);
      for (const intent of mod.VALID_INTENTS) {
        expect(script).toContain(intent);
      }
    });
  });
});
