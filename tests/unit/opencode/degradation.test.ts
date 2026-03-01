/**
 * Provider Graceful Degradation Tests
 *
 * Validates that AQE skill/agent invocations degrade gracefully based on
 * the model provider's capability tier:
 * - tier1-any: Works on all providers (simple transforms)
 * - tier2-good: Works on capable models (code gen, analysis)
 * - tier3-best: Needs best models (architecture, security audit)
 *
 * When a provider cannot meet the required tier, the system should:
 * - Warn the user
 * - Suggest alternative actions or lower-tier skills
 * - Never silently produce low-quality output
 */

import { describe, it, expect } from 'vitest';
import { ModelTier } from '../../../packages/aqe-opencode-types/src/index';

// =============================================================================
// Provider Capability Definitions
// =============================================================================

interface ProviderProfile {
  providerId: string;
  modelId: string;
  tier: ModelTier;
}

const PROVIDERS: Record<string, ProviderProfile> = {
  'claude-opus': {
    providerId: 'anthropic',
    modelId: 'claude-opus-4-6',
    tier: ModelTier.Tier3Best,
  },
  'claude-sonnet': {
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    tier: ModelTier.Tier3Best,
  },
  'gpt-4o': {
    providerId: 'openai',
    modelId: 'gpt-4o',
    tier: ModelTier.Tier2Good,
  },
  'gpt-4o-mini': {
    providerId: 'openai',
    modelId: 'gpt-4o-mini',
    tier: ModelTier.Tier1Any,
  },
  'ollama-llama': {
    providerId: 'ollama',
    modelId: 'llama3.2',
    tier: ModelTier.Tier1Any,
  },
};

// =============================================================================
// Tier Comparison Logic
// =============================================================================

const TIER_ORDER: Record<ModelTier, number> = {
  [ModelTier.Tier1Any]: 1,
  [ModelTier.Tier2Good]: 2,
  [ModelTier.Tier3Best]: 3,
};

interface DegradationResult {
  allowed: boolean;
  warning?: string;
  alternatives?: string[];
}

/**
 * Check whether a provider meets the requirements of a skill's tier.
 */
function checkProviderDegradation(
  providerTier: ModelTier,
  requiredTier: ModelTier
): DegradationResult {
  const providerLevel = TIER_ORDER[providerTier];
  const requiredLevel = TIER_ORDER[requiredTier];

  if (providerLevel >= requiredLevel) {
    return { allowed: true };
  }

  // Provider is below the required tier
  const alternatives: string[] = [];
  if (requiredLevel === 3 && providerLevel === 2) {
    alternatives.push('Use a tier3 model (Claude Sonnet/Opus) for best results');
    alternatives.push('Proceed with reduced quality and review output manually');
  } else if (requiredLevel >= 2 && providerLevel === 1) {
    alternatives.push('Use a tier2+ model for code generation and analysis');
    alternatives.push('Break the task into simpler sub-tasks');
  }

  return {
    allowed: false,
    warning: `Provider tier ${providerTier} is below required tier ${requiredTier}. ` +
      'Output quality may be degraded.',
    alternatives,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('Provider Graceful Degradation', () => {
  it('should allow tier1 skills on any provider', () => {
    const requiredTier = ModelTier.Tier1Any;

    for (const [name, provider] of Object.entries(PROVIDERS)) {
      const result = checkProviderDegradation(provider.tier, requiredTier);
      expect(result.allowed, `${name} should allow tier1 skills`).toBe(true);
      expect(result.warning).toBeUndefined();
    }
  });

  it('should allow tier2 skills on tier2 and tier3 providers', () => {
    const requiredTier = ModelTier.Tier2Good;

    // Tier2 and tier3 providers should be fine
    const tier2PlusProviders = ['claude-opus', 'claude-sonnet', 'gpt-4o'];
    for (const name of tier2PlusProviders) {
      const result = checkProviderDegradation(PROVIDERS[name].tier, requiredTier);
      expect(result.allowed, `${name} should allow tier2 skills`).toBe(true);
    }
  });

  it('should warn for tier3 skills on GPT-4o-mini', () => {
    const result = checkProviderDegradation(
      PROVIDERS['gpt-4o-mini'].tier,
      ModelTier.Tier3Best
    );

    expect(result.allowed).toBe(false);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('below required tier');
  });

  it('should warn for tier2 skills on tier1-only providers', () => {
    const result = checkProviderDegradation(
      PROVIDERS['ollama-llama'].tier,
      ModelTier.Tier2Good
    );

    expect(result.allowed).toBe(false);
    expect(result.warning).toBeDefined();
  });

  it('should suggest alternatives for blocked skills', () => {
    const result = checkProviderDegradation(
      PROVIDERS['gpt-4o-mini'].tier,
      ModelTier.Tier3Best
    );

    expect(result.alternatives).toBeDefined();
    expect(result.alternatives!.length).toBeGreaterThan(0);
    expect(result.alternatives!.some((a) => a.includes('tier3') || a.includes('tier2'))).toBe(true);
  });

  it('should proceed without warning for matching tier', () => {
    // Claude Opus is tier3, running a tier3 skill
    const result = checkProviderDegradation(
      PROVIDERS['claude-opus'].tier,
      ModelTier.Tier3Best
    );

    expect(result.allowed).toBe(true);
    expect(result.warning).toBeUndefined();
    expect(result.alternatives).toBeUndefined();
  });

  it('should allow higher-tier providers for lower-tier skills', () => {
    // Claude Opus (tier3) running a tier1 skill
    const result = checkProviderDegradation(
      PROVIDERS['claude-opus'].tier,
      ModelTier.Tier1Any
    );

    expect(result.allowed).toBe(true);
  });

  it('should warn for tier3 skills on tier2-only providers', () => {
    const result = checkProviderDegradation(
      PROVIDERS['gpt-4o'].tier,
      ModelTier.Tier3Best
    );

    expect(result.allowed).toBe(false);
    expect(result.warning).toContain('below required tier');
    expect(result.alternatives).toBeDefined();
    expect(result.alternatives!.some((a) => a.includes('tier3'))).toBe(true);
  });
});
