/**
 * ADR-093: Cyber Verification pin tests for MultiModelExecutor.
 * Security agents must route to Sonnet 4.6 until AQE_CYBER_VERIFIED=true.
 */

import { describe, it, expect } from 'vitest';
import { applyCyberPin } from '../../../src/routing/advisor/multi-model-executor';

describe('ADR-093 applyCyberPin', () => {
  const OPUS = 'anthropic/claude-opus-4.7';
  const SONNET_FALLBACK = 'anthropic/claude-sonnet-4.6';

  it.each([
    'qe-pentest-validator',
    'qe-security-auditor',
    'qe-security-scanner',
  ])('should pin %s to Sonnet 4.6 when AQE_CYBER_VERIFIED is unset', (agent) => {
    const env = {};
    expect(applyCyberPin(agent, OPUS, env)).toBe(SONNET_FALLBACK);
  });

  it.each([
    'qe-pentest-validator',
    'qe-security-auditor',
    'qe-security-scanner',
  ])('should lift the pin on %s when AQE_CYBER_VERIFIED=true', (agent) => {
    const env = { AQE_CYBER_VERIFIED: 'true' };
    expect(applyCyberPin(agent, OPUS, env)).toBe(OPUS);
  });

  it('should not pin non-security agents', () => {
    const env = {};
    expect(applyCyberPin('qe-test-architect', OPUS, env)).toBe(OPUS);
    expect(applyCyberPin('qe-coverage-specialist', OPUS, env)).toBe(OPUS);
  });

  it('should pass through requested model if it is not Opus 4.7', () => {
    const env = {};
    const other = 'anthropic/claude-sonnet-4.6';
    expect(applyCyberPin('qe-pentest-validator', other, env)).toBe(other);
  });

  it('should pin when the model ID is the canonical claude-opus-4-7 form', () => {
    const env = {};
    expect(applyCyberPin('qe-security-scanner', 'claude-opus-4-7', env)).toBe(
      SONNET_FALLBACK,
    );
  });

  it('should reject truthy-but-non-"true" AQE_CYBER_VERIFIED values', () => {
    expect(applyCyberPin('qe-pentest-validator', OPUS, { AQE_CYBER_VERIFIED: '1' })).toBe(
      SONNET_FALLBACK,
    );
    expect(applyCyberPin('qe-pentest-validator', OPUS, { AQE_CYBER_VERIFIED: 'yes' })).toBe(
      SONNET_FALLBACK,
    );
  });
});
