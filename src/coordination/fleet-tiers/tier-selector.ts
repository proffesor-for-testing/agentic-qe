/**
 * Agentic QE v3 - Fleet Tier Selector
 * ADR-064 Phase 1D: Tiered Fleet Activation Configuration
 *
 * Determines the appropriate fleet activation tier based on context
 * (trigger type, changed files, affected domains, severity, etc.)
 * and allocates agents across domains accordingly.
 */

import type {
  FleetTier,
  TierConfig,
  TierSelectionContext,
  TierSelectionResult,
  AgentAllocation,
  TierSelectionRecord,
  TierSelectionStats,
} from './types';
import { FLEET_TIER_ORDER } from './types';
import {
  DEFAULT_TIER_CONFIGS,
  DEFAULT_DOMAIN_AGENT_MAP,
  ALL_USER_FACING_DOMAINS,
  CORE_PRIORITY_DOMAINS,
} from './tier-config';

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of recent selections to retain in history */
const MAX_HISTORY_SIZE = 200;

/** Threshold: PRs with more changed files than this may escalate to deep */
const LARGE_PR_FILE_THRESHOLD = 10;

/** Threshold: PRs affecting more domains than this may escalate to deep */
const LARGE_PR_DOMAIN_THRESHOLD = 3;

// ============================================================================
// TierSelector Class
// ============================================================================

/**
 * Selects the appropriate fleet activation tier based on context and
 * allocates agents across affected domains.
 *
 * @example
 * ```typescript
 * const selector = new TierSelector();
 *
 * const result = selector.selectTier({
 *   trigger: 'pr',
 *   changedFiles: 15,
 *   affectedDomains: ['test-generation', 'coverage-analysis'],
 * });
 *
 * console.log(result.selectedTier); // 'deep'
 * console.log(result.reason);       // 'PR with >10 changed files ...'
 * ```
 */
export class TierSelector {
  private readonly configs: Readonly<Record<FleetTier, TierConfig>>;
  private readonly history: TierSelectionRecord[] = [];
  private escalationCount = 0;
  private deescalationCount = 0;

  /**
   * Create a new TierSelector.
   *
   * @param customConfigs - Optional custom tier configurations.
   *   Falls back to DEFAULT_TIER_CONFIGS for any tier not provided.
   */
  constructor(customConfigs?: Partial<Record<FleetTier, TierConfig>>) {
    this.configs = {
      ...DEFAULT_TIER_CONFIGS,
      ...customConfigs,
    };
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Select the appropriate tier based on the provided context.
   *
   * Selection priority:
   * 1. Manual override (highest)
   * 2. Incident or hotfix -> crisis
   * 3. Release -> deep
   * 4. PR with >10 files or >3 affected domains -> deep
   * 5. PR -> standard
   * 6. Commit -> smoke (lowest)
   *
   * @param context - The selection context describing the triggering event
   * @returns The tier selection result with allocation plan
   */
  selectTier(context: TierSelectionContext): TierSelectionResult {
    let tier: FleetTier;
    let reason: string;

    // 1. Manual override always wins
    if (context.manualOverride) {
      tier = context.manualOverride;
      reason = `Manual override to "${tier}" tier`;
      return this.buildResult(tier, reason, context);
    }

    // 2. Incident or hotfix -> crisis
    if (context.trigger === 'incident' || context.isHotfix) {
      tier = 'crisis';
      reason = context.isHotfix
        ? 'Hotfix deployment triggers crisis-level validation'
        : 'Production incident triggers crisis-level response';
      return this.buildResult(tier, reason, context);
    }

    // 3. Release -> deep
    if (context.trigger === 'release') {
      tier = 'deep';
      reason = 'Pre-release validation requires deep tier across all domains';
      return this.buildResult(tier, reason, context);
    }

    // 4. PR with large scope -> deep
    if (context.trigger === 'pr') {
      const largeFileCount =
        context.changedFiles !== undefined &&
        context.changedFiles > LARGE_PR_FILE_THRESHOLD;

      const largeDomainCount =
        context.affectedDomains !== undefined &&
        context.affectedDomains.length > LARGE_PR_DOMAIN_THRESHOLD;

      if (largeFileCount || largeDomainCount) {
        tier = 'deep';
        const reasons: string[] = [];
        if (largeFileCount) {
          reasons.push(`>${LARGE_PR_FILE_THRESHOLD} changed files (${context.changedFiles})`);
        }
        if (largeDomainCount) {
          reasons.push(`>${LARGE_PR_DOMAIN_THRESHOLD} affected domains (${context.affectedDomains!.length})`);
        }
        reason = `PR escalated to deep tier: ${reasons.join(' and ')}`;
        return this.buildResult(tier, reason, context);
      }

      // 5. Normal PR -> standard
      tier = 'standard';
      reason = 'Pull request triggers standard tier validation';
      return this.buildResult(tier, reason, context);
    }

    // 6. Commit or any other trigger -> smoke
    tier = 'smoke';
    reason =
      context.trigger === 'commit'
        ? 'Commit triggers lightweight smoke validation'
        : `Trigger "${context.trigger}" defaults to smoke tier`;
    return this.buildResult(tier, reason, context);
  }

  /**
   * Allocate agents across affected domains respecting the tier's maxAgents limit.
   *
   * Allocation strategy:
   * - If no affected domains provided, use the tier's configured domains
   * - Prioritize core domains (test-generation, coverage-analysis, quality-assessment)
   * - Distribute remaining agents proportionally across other domains
   * - Each domain gets at least 1 agent if there is budget
   *
   * @param tier - The tier configuration to allocate against
   * @param affectedDomains - Optional list of affected domain names
   * @returns Array of agent allocations per domain
   */
  allocateAgents(
    tier: TierConfig,
    affectedDomains?: readonly string[]
  ): AgentAllocation[] {
    // Determine which domains to allocate to
    const targetDomains = this.resolveTargetDomains(tier, affectedDomains);

    if (targetDomains.length === 0) {
      return [];
    }

    const maxAgents = tier.maxAgents;

    // If we have fewer or equal domains than agents, give at least 1 each
    // and distribute surplus to priority domains
    if (targetDomains.length >= maxAgents) {
      // More domains than agents: prioritize core domains, then first-come
      return this.allocateWithPriority(targetDomains, maxAgents);
    }

    // More agents than domains: give 1 to each, then distribute extras
    return this.allocateWithSurplus(targetDomains, maxAgents);
  }

  /**
   * Escalate from the current tier to the next higher tier.
   * Cannot escalate beyond crisis.
   *
   * @param currentTier - The current fleet tier
   * @param reason - Human-readable reason for escalation
   * @returns The tier selection result for the escalated tier
   */
  escalate(currentTier: FleetTier, reason: string): TierSelectionResult {
    const currentIndex = FLEET_TIER_ORDER.indexOf(currentTier);
    const nextIndex = Math.min(currentIndex + 1, FLEET_TIER_ORDER.length - 1);
    const nextTier = FLEET_TIER_ORDER[nextIndex];

    const escalated = currentTier !== nextTier;
    const escalationReason = escalated
      ? `Escalated from "${currentTier}" to "${nextTier}": ${reason}`
      : `Already at maximum tier "${currentTier}", cannot escalate further`;

    if (escalated) {
      this.escalationCount++;
    }

    return this.buildResult(nextTier, escalationReason, { trigger: 'manual' });
  }

  /**
   * De-escalate from the current tier to the next lower tier.
   * Cannot de-escalate below smoke.
   *
   * @param currentTier - The current fleet tier
   * @returns The tier selection result for the de-escalated tier
   */
  deescalate(currentTier: FleetTier): TierSelectionResult {
    const currentIndex = FLEET_TIER_ORDER.indexOf(currentTier);
    const prevIndex = Math.max(currentIndex - 1, 0);
    const prevTier = FLEET_TIER_ORDER[prevIndex];

    const deescalated = currentTier !== prevTier;
    const reason = deescalated
      ? `De-escalated from "${currentTier}" to "${prevTier}"`
      : `Already at minimum tier "${currentTier}", cannot de-escalate further`;

    if (deescalated) {
      this.deescalationCount++;
    }

    return this.buildResult(prevTier, reason, { trigger: 'manual' });
  }

  /**
   * Retrieve selection history and aggregated statistics.
   *
   * @returns Aggregated tier selection statistics
   */
  getStats(): TierSelectionStats {
    const selectionsByTier: Record<FleetTier, number> = {
      smoke: 0,
      standard: 0,
      deep: 0,
      crisis: 0,
    };

    for (const record of this.history) {
      selectionsByTier[record.tier]++;
    }

    return {
      totalSelections: this.history.length,
      selectionsByTier,
      escalationCount: this.escalationCount,
      deescalationCount: this.deescalationCount,
      recentSelections: [...this.history].slice(-20),
    };
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Build a complete TierSelectionResult, record it in history, and return it.
   */
  private buildResult(
    tier: FleetTier,
    reason: string,
    context: Pick<TierSelectionContext, 'trigger' | 'affectedDomains'>
  ): TierSelectionResult {
    const config = this.configs[tier];
    const agentAllocation = this.allocateAgents(
      config,
      context.affectedDomains
    );

    // Record in history
    const record: TierSelectionRecord = {
      tier,
      reason,
      timestamp: Date.now(),
      trigger: context.trigger,
    };
    this.history.push(record);

    // Trim history to prevent unbounded growth
    if (this.history.length > MAX_HISTORY_SIZE) {
      this.history.splice(0, this.history.length - MAX_HISTORY_SIZE);
    }

    return {
      selectedTier: tier,
      config,
      reason,
      agentAllocation,
    };
  }

  /**
   * Resolve which domains to target for allocation.
   * Intersects affected domains with the tier's configured domains.
   */
  private resolveTargetDomains(
    tier: TierConfig,
    affectedDomains?: readonly string[]
  ): string[] {
    // Get the tier's allowed domains
    const tierDomains: readonly string[] =
      tier.domains.includes('all')
        ? ALL_USER_FACING_DOMAINS
        : tier.domains;

    if (!affectedDomains || affectedDomains.length === 0) {
      return [...tierDomains];
    }

    // Intersect affected domains with tier-allowed domains
    const tierDomainSet = new Set(tierDomains);
    const intersected = affectedDomains.filter((d) => tierDomainSet.has(d));

    // If no intersection, fall back to tier's default domains
    return intersected.length > 0 ? intersected : [...tierDomains];
  }

  /**
   * Allocate agents when there are more domains than available agents.
   * Prioritizes core domains.
   */
  private allocateWithPriority(
    domains: string[],
    maxAgents: number
  ): AgentAllocation[] {
    const coreDomainSet = new Set(CORE_PRIORITY_DOMAINS as readonly string[]);
    const allocations: AgentAllocation[] = [];
    let remaining = maxAgents;

    // First pass: allocate 1 agent to each core domain that's in the list
    const coreDomains = domains.filter((d) => coreDomainSet.has(d));
    const nonCoreDomains = domains.filter((d) => !coreDomainSet.has(d));

    for (const domain of coreDomains) {
      if (remaining <= 0) break;
      allocations.push(this.createAllocation(domain, 1));
      remaining--;
    }

    // Second pass: allocate 1 agent to each non-core domain
    for (const domain of nonCoreDomains) {
      if (remaining <= 0) break;
      allocations.push(this.createAllocation(domain, 1));
      remaining--;
    }

    return allocations;
  }

  /**
   * Allocate agents when there are more agents than domains.
   * Gives 1 to each domain, then distributes surplus to core domains.
   */
  private allocateWithSurplus(
    domains: string[],
    maxAgents: number
  ): AgentAllocation[] {
    const coreDomainSet = new Set(CORE_PRIORITY_DOMAINS as readonly string[]);

    // Start with 1 agent per domain
    const counts = new Map<string, number>();
    for (const domain of domains) {
      counts.set(domain, 1);
    }
    let remaining = maxAgents - domains.length;

    // Distribute surplus to core domains first
    const coreDomains = domains.filter((d) => coreDomainSet.has(d));
    const nonCoreDomains = domains.filter((d) => !coreDomainSet.has(d));

    // Round-robin surplus to core domains
    let coreIndex = 0;
    while (remaining > 0 && coreDomains.length > 0) {
      const domain = coreDomains[coreIndex % coreDomains.length];
      counts.set(domain, (counts.get(domain) ?? 0) + 1);
      remaining--;
      coreIndex++;

      // After giving 2 extra to each core domain, start distributing to non-core
      if (coreIndex >= coreDomains.length * 2) break;
    }

    // Distribute any remaining to non-core domains
    let nonCoreIndex = 0;
    while (remaining > 0 && nonCoreDomains.length > 0) {
      const domain = nonCoreDomains[nonCoreIndex % nonCoreDomains.length];
      counts.set(domain, (counts.get(domain) ?? 0) + 1);
      remaining--;
      nonCoreIndex++;
    }

    // If still remaining (no non-core domains), give to core domains
    while (remaining > 0 && coreDomains.length > 0) {
      const domain = coreDomains[coreIndex % coreDomains.length];
      counts.set(domain, (counts.get(domain) ?? 0) + 1);
      remaining--;
      coreIndex++;
    }

    // Build allocations preserving domain order
    return domains.map((domain) =>
      this.createAllocation(domain, counts.get(domain) ?? 1)
    );
  }

  /**
   * Create an AgentAllocation for a domain with the given agent count.
   */
  private createAllocation(domain: string, agentCount: number): AgentAllocation {
    const agentTypes = DEFAULT_DOMAIN_AGENT_MAP[domain] ?? ['specialist'];
    return {
      domain,
      agentCount,
      agentTypes: [...agentTypes],
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new TierSelector instance with optional custom configurations.
 *
 * @param customConfigs - Optional partial tier configs to override defaults
 * @returns A new TierSelector instance
 *
 * @example
 * ```typescript
 * // Use all defaults
 * const selector = createTierSelector();
 *
 * // Override smoke tier to use 5 agents
 * const customSelector = createTierSelector({
 *   smoke: { ...getDefaultTierConfig('smoke'), maxAgents: 5 },
 * });
 * ```
 */
export function createTierSelector(
  customConfigs?: Partial<Record<FleetTier, TierConfig>>
): TierSelector {
  return new TierSelector(customConfigs);
}
