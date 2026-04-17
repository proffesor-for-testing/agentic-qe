/**
 * ADR-093: Cyber Verification pin tests.
 * Security agents must route to Sonnet 4.6 on both the advisor path and
 * the direct chat path until AQE_CYBER_VERIFIED=true.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  applyCyberPin,
  shouldCyberPin,
  isOpus47,
  CYBER_PINNED_AGENTS,
  CYBER_PIN_ADVISOR_FALLBACK,
  CYBER_PIN_CHAT_FALLBACK,
} from '../../../src/routing/security/cyber-pin';

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

    it('passes non-4.7 models through unchanged for pinned agents', () => {
      expect(
        applyCyberPin('qe-pentest-validator', 'anthropic/claude-sonnet-4.6', CYBER_PIN_CHAT_FALLBACK, {}),
      ).toBe('anthropic/claude-sonnet-4.6');
    });
  });
});
