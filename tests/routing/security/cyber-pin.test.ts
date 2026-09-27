/**
 * ADR-093: Cyber Verification pin tests.
 * Security agents must route to Sonnet 4.6 (not the default Sonnet) on both the advisor path
 * and the direct chat path, instead of any Opus/Fable model >= 4.7, until
 * AQE_CYBER_VERIFIED=true.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  applyCyberPin,
  shouldCyberPin,
  isOpus47,
  isCyberGatedModel,
  CYBER_PINNED_AGENTS,
  CYBER_PIN_ADVISOR_FALLBACK,
  CYBER_PIN_CHAT_FALLBACK,
} from '../../../src/routing/security/cyber-pin';
import {
  DEFAULT_OPUS_MODEL,
  DEFAULT_SONNET_MODEL,
  getClaudeModelForTier,
} from '../../../src/shared/llm/model-registry';

describe('ADR-093 cyber-pin', () => {
  const OPUS_OPENROUTER = 'anthropic/claude-opus-4.7';
  const OPUS_CANONICAL = 'claude-opus-4-7';
  const OPUS_BEDROCK = 'anthropic.claude-opus-4-7-v1:0';

  describe('pinned agent list', () => {
    it('includes all 4 security/pentest agents from the Cyber Verification application', () => {
      expect(CYBER_PINNED_AGENTS).toEqual([
        'qe-pentest-validator',
        'qe-security-auditor',
        'qe-security-scanner',
        'qe-security-reviewer',
      ]);
    });

    it('matches the agent list in docs/security/cyber-verification-application.md', () => {
      // Cross-check: the application file (§3 table) must list the same agents.
      // If someone edits one side without the other, this test catches it.
      const appPath = join(process.cwd(), 'docs/security/cyber-verification-application.md');
      const raw = readFileSync(appPath, 'utf8');
      for (const agent of CYBER_PINNED_AGENTS) {
        expect(raw).toContain(agent);
      }
    });
  });

  describe('isOpus47 model-id detection', () => {
    it.each([OPUS_OPENROUTER, OPUS_CANONICAL, OPUS_BEDROCK])(
      'detects %s as Opus 4.7',
      (id) => expect(isOpus47(id)).toBe(true),
    );

    it.each(['claude-opus-4-5', 'anthropic/claude-opus-4', 'claude-sonnet-4-6'])(
      'does not detect %s as Opus 4.7',
      (id) => expect(isOpus47(id)).toBe(false),
    );
  });

  describe('isCyberGatedModel (every Opus/Fable model >= 4.7)', () => {
    it.each([
      // Opus 4.7 in all forms (original ADR-093 gate)
      OPUS_CANONICAL, OPUS_OPENROUTER, OPUS_BEDROCK,
      // later Opus/Fable models, canonical
      'claude-opus-4-8', 'claude-opus-5', 'claude-opus-5-5', 'claude-fable-5', 'claude-fable-5-1',
      // OpenRouter (dotted) forms
      'anthropic/claude-opus-4.8', 'anthropic/claude-opus-5', 'anthropic/claude-opus-5.5', 'anthropic/claude-fable-5.1',
      // Bedrock forms
      'anthropic.claude-opus-4-8', 'anthropic.claude-opus-5', 'anthropic.claude-opus-5-5',
      'anthropic.claude-fable-5', 'anthropic.claude-fable-5-1', 'anthropic.claude-fable-5-1-v1:0',
      'anthropic/claude-fable-5',
    ])('gates %s', (id) => expect(isCyberGatedModel(id)).toBe(true));

    it.each([
      'claude-sonnet-4-6', 'anthropic/claude-sonnet-4.6', 'claude-sonnet-5', 'anthropic/claude-sonnet-5',
      'claude-haiku-4-5', 'claude-haiku-4-5-20251001',
      // Opus below 4.7, including dated snapshots whose date must not parse as a minor version
      'claude-opus-4-5', 'claude-opus-4-5-20251101', 'anthropic/claude-opus-4.5', 'claude-opus-4-6',
      'claude-opus-4-20250514', 'anthropic/claude-opus-4', 'claude-opus-4-1-20250805',
      'gpt-6-sol', 'qwen3-coder:30b',
    ])('does not gate %s', (id) => expect(isCyberGatedModel(id)).toBe(false));

    it('gates the routing tier-4 model, so tier escalation cannot bypass the pin', () => {
      expect(DEFAULT_OPUS_MODEL).toBe(getClaudeModelForTier(4));
      expect(isCyberGatedModel(getClaudeModelForTier(4))).toBe(true);
    });

    it('does not gate the tier 1-3 models or the pin fallbacks themselves', () => {
      for (const id of [
        getClaudeModelForTier(1), getClaudeModelForTier(2), getClaudeModelForTier(3),
        CYBER_PIN_CHAT_FALLBACK, CYBER_PIN_ADVISOR_FALLBACK,
      ]) {
        expect(isCyberGatedModel(id)).toBe(false);
      }
    });

    it('keeps isOpus47 as an alias of isCyberGatedModel', () => {
      expect(isOpus47).toBe(isCyberGatedModel);
    });
  });

  describe('pin fallbacks', () => {
    it('fall back to Sonnet 4.6, independent of the default Sonnet (chat: canonical, advisor: OpenRouter form)', () => {
      expect(CYBER_PIN_CHAT_FALLBACK).toBe('claude-sonnet-4-6');
      expect(CYBER_PIN_ADVISOR_FALLBACK).toBe('anthropic/claude-sonnet-4.6');
      expect(CYBER_PIN_CHAT_FALLBACK).not.toBe(DEFAULT_SONNET_MODEL);
    });
  });

  describe('shouldCyberPin', () => {
    it('pins every cyber-sensitive agent when env flag unset', () => {
      for (const agent of CYBER_PINNED_AGENTS) {
        expect(shouldCyberPin(agent, {})).toBe(true);
      }
    });

    it('lifts pin only on exact "true" — "1" and "yes" do not count', () => {
      const agent = 'qe-security-auditor';
      expect(shouldCyberPin(agent, { AQE_CYBER_VERIFIED: 'true' })).toBe(false);
      expect(shouldCyberPin(agent, { AQE_CYBER_VERIFIED: '1' })).toBe(true);
      expect(shouldCyberPin(agent, { AQE_CYBER_VERIFIED: 'yes' })).toBe(true);
    });

    it('does not pin non-security agents', () => {
      expect(shouldCyberPin('qe-test-architect', {})).toBe(false);
      expect(shouldCyberPin('qe-coverage-specialist', {})).toBe(false);
    });
  });

  describe('applyCyberPin (advisor fallback)', () => {
    it.each(CYBER_PINNED_AGENTS)(
      '%s → advisor fallback when env unset and model is Opus 4.7',
      (agent) => {
        expect(applyCyberPin(agent, OPUS_OPENROUTER, CYBER_PIN_ADVISOR_FALLBACK, {})).toBe(
          CYBER_PIN_ADVISOR_FALLBACK,
        );
      },
    );

    it('lifts pin when AQE_CYBER_VERIFIED=true', () => {
      expect(
        applyCyberPin('qe-pentest-validator', OPUS_OPENROUTER, CYBER_PIN_ADVISOR_FALLBACK, {
          AQE_CYBER_VERIFIED: 'true',
        }),
      ).toBe(OPUS_OPENROUTER);
    });
  });

  describe('applyCyberPin (chat fallback — canonical + Bedrock form)', () => {
    it('pins canonical claude-opus-4-7 for qe-security-reviewer', () => {
      expect(applyCyberPin('qe-security-reviewer', OPUS_CANONICAL, CYBER_PIN_CHAT_FALLBACK, {})).toBe(
        CYBER_PIN_CHAT_FALLBACK,
      );
    });

    it('pins bedrock ARN form for qe-security-scanner', () => {
      expect(applyCyberPin('qe-security-scanner', OPUS_BEDROCK, CYBER_PIN_CHAT_FALLBACK, {})).toBe(
        CYBER_PIN_CHAT_FALLBACK,
      );
    });

    it.each(['claude-opus-5', 'anthropic/claude-opus-5', 'claude-opus-5-5', 'claude-fable-5-1', OPUS_CANONICAL])(
      'pins %s for pinned agents',
      (id) => {
        expect(applyCyberPin('qe-security-auditor', id, CYBER_PIN_CHAT_FALLBACK, {})).toBe(
          CYBER_PIN_CHAT_FALLBACK,
        );
      },
    );

    it.each(['anthropic/claude-sonnet-4.6', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'])(
      'passes non-gated model %s through unchanged for pinned agents',
      (id) => {
        expect(applyCyberPin('qe-pentest-validator', id, CYBER_PIN_CHAT_FALLBACK, {})).toBe(id);
      },
    );

    it('does not pin gated models for non-security agents', () => {
      expect(applyCyberPin('qe-test-architect', 'claude-opus-5', CYBER_PIN_CHAT_FALLBACK, {})).toBe(
        'claude-opus-5',
      );
    });

    it('lifts the pin on opus-5 when AQE_CYBER_VERIFIED=true', () => {
      expect(
        applyCyberPin('qe-security-auditor', 'claude-opus-5', CYBER_PIN_CHAT_FALLBACK, {
          AQE_CYBER_VERIFIED: 'true',
        }),
      ).toBe('claude-opus-5');
    });
  });
});
