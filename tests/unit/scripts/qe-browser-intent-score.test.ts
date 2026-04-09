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
      // After the Phase 3 eval-contract fix: vibium eval returns the LAST
      // expression's value (NOT console.log output), so we wrap in
      // JSON.stringify and lib/vibium.js's unwrapEvalResult parses the
      // result string back. console.log was wrong from the start.
      const script = mod.buildScript('search_field', null);
      expect(script).toContain('JSON.stringify');
      expect(script).not.toContain('console.log');
    });

    it('contains all 15 scorer function names', () => {
      const script = mod.buildScript('submit_form', null);
      for (const intent of mod.VALID_INTENTS) {
        expect(script).toContain(intent);
      }
    });

    // Regression test for B1 (devil's advocate finding):
    // String.prototype.replace with a string argument interprets $&, $`,
    // $', $1-$9 in the REPLACEMENT string. Scopes with these sequences
    // used to corrupt the generated script. The split/join fix below must
    // perform literal substitution.
    describe('B1 regression: String.replace special characters', () => {
      it('handles scope selector with $& (whole match marker)', () => {
        const script = mod.buildScript('submit_form', 'div[data-x="$&"]');
        // After JSON.stringify: "div[data-x=\"$&\"]" — the $& must land
        // literally inside the generated script, NOT be replaced with the
        // placeholder token.
        expect(script).toContain('"div[data-x=\\"$&\\"]"');
        expect(script).not.toContain('__SCOPE__');
      });

      it('handles scope with $`, $\' backreference markers', () => {
        const script = mod.buildScript('primary_cta', "span[data-y='$`$\\'x']");
        expect(script).not.toContain('__SCOPE__');
      });

      it('handles scope with $1 numeric backreference marker', () => {
        const script = mod.buildScript('accept_cookies', 'button[data-id="$1"]');
        expect(script).toContain('"button[data-id=\\"$1\\"]"');
        expect(script).not.toContain('__SCOPE__');
      });

      it('handles intent name containing $ (defensive — VALID_INTENTS does not, but future-proof)', () => {
        // Even though no current VALID_INTENTS entry contains $, the split/join
        // implementation should be robust if one ever does.
        const script = mod.buildScript('submit_form', null);
        expect(script).not.toContain('__INTENT__');
      });
    });
  });
});
