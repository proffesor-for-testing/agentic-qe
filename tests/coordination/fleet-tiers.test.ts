/**
 * Unit tests for Fleet Tier Configuration & Selection
 * ADR-064 Phase 1D: Tiered Fleet Activation
 *
 * Tests TierConfig defaults, TierSelector selection logic,
 * custom overrides, escalation/de-escalation, and allocation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_TIER_CONFIGS,
  getDefaultTierConfig,
  validateTierConfig,
  ALL_USER_FACING_DOMAINS,
  CORE_PRIORITY_DOMAINS,
} from '../../src/coordination/fleet-tiers/tier-config.js';
import { FLEET_TIER_ORDER } from '../../src/coordination/fleet-tiers/types.js';
import {
  TierSelector,
  createTierSelector,
} from '../../src/coordination/fleet-tiers/tier-selector.js';
import type {
  FleetTier,
  TierConfig,
  TierSelectionContext,
} from '../../src/coordination/fleet-tiers/types.js';

// ============================================================================
// Default Tier Configurations
// ============================================================================

describe('Fleet Tiers - Default Tier Configurations', () => {
  it('should have all four default tiers defined', () => {
    expect(DEFAULT_TIER_CONFIGS).toHaveProperty('smoke');
    expect(DEFAULT_TIER_CONFIGS).toHaveProperty('standard');
    expect(DEFAULT_TIER_CONFIGS).toHaveProperty('deep');
    expect(DEFAULT_TIER_CONFIGS).toHaveProperty('crisis');
  });

  it('smoke tier: 3 max agents, Agent Teams disabled', () => {
    const smoke = DEFAULT_TIER_CONFIGS.smoke;
    expect(smoke.tier).toBe('smoke');
    expect(smoke.maxAgents).toBe(3);
    expect(smoke.agentTeamsEnabled).toBe(false);
    expect(smoke.estimatedCost).toBe('minimal');
  });

  it('standard tier: 7 max agents, Agent Teams not enabled (optional)', () => {
    const standard = DEFAULT_TIER_CONFIGS.standard;
    expect(standard.tier).toBe('standard');
    expect(standard.maxAgents).toBe(7);
    expect(standard.agentTeamsEnabled).toBe(false);
    expect(standard.estimatedCost).toBe('moderate');
  });

  it('deep tier: 15 max agents, Agent Teams enabled', () => {
    const deep = DEFAULT_TIER_CONFIGS.deep;
    expect(deep.tier).toBe('deep');
    expect(deep.maxAgents).toBe(15);
    expect(deep.agentTeamsEnabled).toBe(true);
    expect(deep.estimatedCost).toBe('high');
  });

  it('crisis tier: 15 max agents, Agent Teams enabled', () => {
    const crisis = DEFAULT_TIER_CONFIGS.crisis;
    expect(crisis.tier).toBe('crisis');
    expect(crisis.maxAgents).toBe(15);
    expect(crisis.agentTeamsEnabled).toBe(true);
    expect(crisis.estimatedCost).toBe('unlimited');
  });

  it('getDefaultTierConfig returns correct config for each tier', () => {
    for (const tier of FLEET_TIER_ORDER) {
      const config = getDefaultTierConfig(tier);
      expect(config).toBe(DEFAULT_TIER_CONFIGS[tier]);
    }
  });

  it('all default configs pass validation', () => {
    for (const tier of FLEET_TIER_ORDER) {
      const errors = validateTierConfig(DEFAULT_TIER_CONFIGS[tier]);
      expect(errors).toEqual([]);
    }
  });
});

// ============================================================================
// Tier Selector - Context-Based Selection
// ============================================================================

describe('Fleet Tiers - TierSelector', () => {
  let selector: TierSelector;

  beforeEach(() => {
    selector = new TierSelector();
  });

  it('should select smoke for a single-file commit', () => {
    const result = selector.selectTier({
      trigger: 'commit',
      changedFiles: 1,
    });
    expect(result.selectedTier).toBe('smoke');
    expect(result.config.tier).toBe('smoke');
    expect(result.reason.toLowerCase()).toContain('commit');
  });

  it('should select standard for a normal PR', () => {
    const result = selector.selectTier({
      trigger: 'pr',
      changedFiles: 3,
    });
    expect(result.selectedTier).toBe('standard');
    expect(result.config.maxAgents).toBe(7);
  });

  it('should select deep for a pre-release trigger', () => {
    const result = selector.selectTier({
      trigger: 'release',
    });
    expect(result.selectedTier).toBe('deep');
    expect(result.config.agentTeamsEnabled).toBe(true);
  });

  it('should select crisis for a production incident', () => {
    const result = selector.selectTier({
      trigger: 'incident',
    });
    expect(result.selectedTier).toBe('crisis');
    expect(result.config.estimatedCost).toBe('unlimited');
  });

  it('should escalate PR to deep when changedFiles exceeds threshold', () => {
    const result = selector.selectTier({
      trigger: 'pr',
      changedFiles: 15,
    });
    expect(result.selectedTier).toBe('deep');
    expect(result.reason).toContain('deep');
  });

  it('should escalate PR to deep when affected domains exceed threshold', () => {
    const result = selector.selectTier({
      trigger: 'pr',
      changedFiles: 2,
      affectedDomains: ['test-generation', 'coverage-analysis', 'quality-assessment', 'security-compliance'],
    });
    expect(result.selectedTier).toBe('deep');
    expect(result.reason).toContain('domain');
  });

  it('should select crisis when isHotfix is true regardless of trigger', () => {
    const result = selector.selectTier({
      trigger: 'pr',
      isHotfix: true,
    });
    expect(result.selectedTier).toBe('crisis');
    expect(result.reason).toContain('Hotfix');
  });

  it('should respect manualOverride above all other logic', () => {
    const result = selector.selectTier({
      trigger: 'commit',
      changedFiles: 1,
      manualOverride: 'deep',
    });
    expect(result.selectedTier).toBe('deep');
    expect(result.reason).toContain('Manual override');
  });
});

// ============================================================================
// Custom Config & Listing
// ============================================================================

describe('Fleet Tiers - Custom Config & Accessors', () => {
  it('custom tier config overrides defaults', () => {
    const customSmoke: TierConfig = {
      ...DEFAULT_TIER_CONFIGS.smoke,
      maxAgents: 5,
      description: 'Custom smoke with 5 agents',
    };
    const selector = new TierSelector({ smoke: customSmoke });
    const result = selector.selectTier({ trigger: 'commit' });
    expect(result.config.maxAgents).toBe(5);
    expect(result.config.description).toBe('Custom smoke with 5 agents');
  });

  it('list all tiers via FLEET_TIER_ORDER', () => {
    expect(FLEET_TIER_ORDER).toEqual(['smoke', 'standard', 'deep', 'crisis']);
    expect(FLEET_TIER_ORDER).toHaveLength(4);
  });

  it('tier cost estimation maps to expected levels', () => {
    const costs: Record<FleetTier, string> = {
      smoke: 'minimal',
      standard: 'moderate',
      deep: 'high',
      crisis: 'unlimited',
    };
    for (const [tier, expectedCost] of Object.entries(costs)) {
      expect(DEFAULT_TIER_CONFIGS[tier as FleetTier].estimatedCost).toBe(expectedCost);
    }
  });

  it('agent count respects tier limits in allocation', () => {
    const selector = new TierSelector();
    const smokeConfig = DEFAULT_TIER_CONFIGS.smoke;
    const allocations = selector.allocateAgents(smokeConfig);

    const totalAllocated = allocations.reduce((sum, a) => sum + a.agentCount, 0);
    expect(totalAllocated).toBeLessThanOrEqual(smokeConfig.maxAgents);
  });

  it('tier domains filtering returns only configured domains', () => {
    const smoke = DEFAULT_TIER_CONFIGS.smoke;
    // Smoke tier only covers test-execution and quality-assessment
    expect(smoke.domains).toContain('test-execution');
    expect(smoke.domains).toContain('quality-assessment');
    expect(smoke.domains).not.toContain('security-compliance');
  });

  it('selector context evaluation: schedule trigger defaults to smoke', () => {
    const selector = new TierSelector();
    const result = selector.selectTier({ trigger: 'schedule' });
    expect(result.selectedTier).toBe('smoke');
    expect(result.reason).toContain('smoke');
  });

  it('factory function createTierSelector creates a valid instance', () => {
    const selector = createTierSelector();
    expect(selector).toBeInstanceOf(TierSelector);
    const result = selector.selectTier({ trigger: 'pr' });
    expect(result.selectedTier).toBe('standard');
  });

  it('factory function with custom configs creates valid instance', () => {
    const selector = createTierSelector({
      standard: { ...DEFAULT_TIER_CONFIGS.standard, maxAgents: 10 },
    });
    const result = selector.selectTier({ trigger: 'pr' });
    expect(result.config.maxAgents).toBe(10);
  });
});

// ============================================================================
// Escalation / De-escalation & Stats
// ============================================================================

describe('Fleet Tiers - Escalation, De-escalation & Stats', () => {
  let selector: TierSelector;

  beforeEach(() => {
    selector = new TierSelector();
  });

  it('escalate from smoke to standard', () => {
    const result = selector.escalate('smoke', 'Flaky test detected');
    expect(result.selectedTier).toBe('standard');
    expect(result.reason).toContain('Escalated');
  });

  it('escalate from crisis stays at crisis', () => {
    const result = selector.escalate('crisis', 'Already max');
    expect(result.selectedTier).toBe('crisis');
    expect(result.reason).toContain('cannot escalate');
  });

  it('de-escalate from deep to standard', () => {
    const result = selector.deescalate('deep');
    expect(result.selectedTier).toBe('standard');
    expect(result.reason).toContain('De-escalated');
  });

  it('de-escalate from smoke stays at smoke', () => {
    const result = selector.deescalate('smoke');
    expect(result.selectedTier).toBe('smoke');
    expect(result.reason).toContain('cannot de-escalate');
  });

  it('stats track selection history correctly', () => {
    selector.selectTier({ trigger: 'commit' });
    selector.selectTier({ trigger: 'pr' });
    selector.selectTier({ trigger: 'incident' });
    selector.escalate('smoke', 'test');

    const stats = selector.getStats();
    expect(stats.totalSelections).toBe(4);
    expect(stats.selectionsByTier.smoke).toBe(1);
    expect(stats.selectionsByTier.standard).toBeGreaterThanOrEqual(1);
    expect(stats.selectionsByTier.crisis).toBe(1);
    expect(stats.escalationCount).toBe(1);
    expect(stats.recentSelections.length).toBe(4);
  });
});
