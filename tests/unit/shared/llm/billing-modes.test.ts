/**
 * ADR-123 — billing-mode resolution + startup notice tests.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveBillingMode,
  billingModeForType,
  billingNotice,
} from '../../../../src/shared/llm/billing-modes';

describe('billingModeForType', () => {
  it('should_classifyClaudeApiAsMeteredApi', () => {
    expect(billingModeForType('claude')).toBe('metered-api');
  });
  it('should_classifyClaudeCodeAsSubscription', () => {
    expect(billingModeForType('claude-code')).toBe('subscription');
  });
  it('should_classifyCognitumAsMeteredCapped', () => {
    expect(billingModeForType('cognitum')).toBe('metered-capped');
  });
  it('should_classifyOllamaAsLocal', () => {
    expect(billingModeForType('ollama')).toBe('local');
  });
});

describe('resolveBillingMode', () => {
  it('should_preferInstanceBillingMode_over_typeDefault', () => {
    // A provider that overrides its type's default wins.
    expect(resolveBillingMode({ type: 'claude', billingMode: 'local' })).toBe('local');
  });

  it('should_fallBackToTypeDefault_when_instanceModeAbsent', () => {
    expect(resolveBillingMode({ type: 'cognitum' })).toBe('metered-capped');
  });
});

describe('billingNotice', () => {
  it('should_warnAboutApiBilling_when_meteredApi', () => {
    const notice = billingNotice('claude', 'metered-api');
    expect(notice).toContain('pay-per-token');
    expect(notice).toContain('AQE_LLM_PROVIDER=claude-code');
  });

  it('should_reassureAboutServerSideCap_when_meteredCapped', () => {
    expect(billingNotice('cognitum', 'metered-capped')).toContain('hard spend cap');
  });

  it('should_reassureAboutSubscription_when_subscription', () => {
    expect(billingNotice('claude-code', 'subscription')).toContain('subscription');
  });

  it('should_returnUndefined_when_local', () => {
    expect(billingNotice('ollama', 'local')).toBeUndefined();
  });
});
