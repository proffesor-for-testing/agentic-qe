/**
 * ADR-124 M3.5 — Codex CLI (subscription) provider unit tests.
 *
 * The LOAD-BEARING guarantee: the spawned CLI must NOT inherit an OpenAI API
 * key, or it could revert to per-token API billing instead of the user's
 * ChatGPT subscription. Mirrors the claude-code env-strip parity test.
 */

import { describe, it, expect } from 'vitest';
import {
  CodexProvider,
  API_BILLING_ENV_VARS,
  CODEX_DEFAULT_MODEL,
  DEFAULT_CODEX_CONFIG,
} from '../../../../../src/shared/llm/providers/codex';
import { billingModeForType } from '../../../../../src/shared/llm/billing-modes';

describe('CodexProvider.childEnv (env-strip)', () => {
  it('should_stripEveryApiBillingKey_when_presentInParentEnv', () => {
    const parent = {
      OPENAI_API_KEY: 'sk-openai-should-be-removed',
      CODEX_API_KEY: 'also-removed',
      PATH: '/usr/bin',
      HOME: '/home/user',
    };

    const child = CodexProvider.childEnv(parent);

    for (const key of API_BILLING_ENV_VARS) {
      expect(child[key]).toBeUndefined();
    }
    // Non-billing env is preserved so the CLI still works.
    expect(child.PATH).toBe('/usr/bin');
    expect(child.HOME).toBe('/home/user');
  });

  it('should_notMutateTheParentEnv', () => {
    const parent = { OPENAI_API_KEY: 'sk-x', PATH: '/bin' };

    CodexProvider.childEnv(parent);

    expect(parent.OPENAI_API_KEY).toBe('sk-x');
  });
});

describe('CodexProvider metadata', () => {
  it('should_declareSubscriptionBilling', () => {
    const provider = new CodexProvider();
    expect(provider.type).toBe('codex');
    expect(provider.billingMode).toBe('subscription');
  });

  it('should_resolveSubscriptionBillingFromBareType', () => {
    expect(billingModeForType('codex')).toBe('subscription');
  });

  it('should_reportZeroPerTokenCost', () => {
    const provider = new CodexProvider();
    expect(provider.getCostPerToken()).toEqual({ input: 0, output: 0 });
  });

  it('should_defaultToTheCliConfiguredModelSentinel', () => {
    expect(DEFAULT_CODEX_CONFIG.model).toBe(CODEX_DEFAULT_MODEL);
    const provider = new CodexProvider();
    expect(provider.getSupportedModels()).toContain(CODEX_DEFAULT_MODEL);
  });

  it('should_rejectEmbeddings_withActionableError', async () => {
    const provider = new CodexProvider();
    await expect(provider.embed('x')).rejects.toThrow(/does not support embeddings/i);
  });
});
