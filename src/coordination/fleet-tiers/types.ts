/**
 * Agentic QE v3 - Fleet Tier Types
 * ADR-064 Phase 1D: Tiered Fleet Activation Configuration
 *
 * Defines the type system for fleet activation tiers. Each tier controls
 * how many agents activate based on task complexity, balancing cost against
 * thoroughness. Tiers range from lightweight smoke runs (every commit) to
 * full crisis mode (production incidents).
 */

// ============================================================================
// Core Tier Types
// ============================================================================

/**
 * Fleet activation tiers ordered from cheapest to most expensive.
 *
 * - smoke: Lightweight validation on every commit (2-3 agents)
 * - standard: Standard PR validation (up to 7 agents)
 * - deep: Pre-release / critical path validation (up to 15 agents)
 * - crisis: Production incident response with competing hypotheses (15 agents, unlimited cost)
 */
export type FleetTier = 'smoke' | 'standard' | 'deep' | 'crisis';

/**
 * Ordered list of fleet tiers from lowest to highest activation level.
 * Used for escalation/de-escalation traversal.
 */
export const FLEET_TIER_ORDER: readonly FleetTier[] = [
  'smoke',
  'standard',
  'deep',
  'crisis',
] as const;

/**
 * Cost category for a tier's estimated resource consumption.
 */
export type TierCostLevel = 'minimal' | 'moderate' | 'high' | 'unlimited';

// ============================================================================
// Trigger Types
// ============================================================================

/**
 * Event types that can trigger fleet tier activation.
 */
export type TierTriggerType =
  | 'commit'
  | 'pr'
  | 'release'
  | 'incident'
  | 'manual'
  | 'schedule';

/**
 * What triggers a tier activation.
 * Conditions are an open record allowing domain-specific trigger criteria.
 */
export interface TierTrigger {
  /** Type of event that triggers this tier */
  readonly type: TierTriggerType;

  /** Optional conditions that must be met for this trigger */
  readonly conditions?: Record<string, unknown>;
}

// ============================================================================
// Tier Configuration
// ============================================================================

/**
 * Configuration for a single fleet activation tier.
 * Immutable by design -- tier configs are created once and reused.
 */
export interface TierConfig {
  /** Which tier this configuration describes */
  readonly tier: FleetTier;

  /** Maximum number of agents that may be activated in this tier */
  readonly maxAgents: number;

  /** Whether agent teams (multi-agent collaboration groups) are enabled */
  readonly agentTeamsEnabled: boolean;

  /**
   * Which domains are activated.
   * Use the literal `['all']` to indicate all 13 user-facing domains.
   */
  readonly domains: readonly string[];

  /** Estimated cost category for this tier */
  readonly estimatedCost: TierCostLevel;

  /** Human-readable description of the tier's purpose */
  readonly description: string;

  /** Events that may activate this tier */
  readonly triggers: readonly TierTrigger[];
}

// ============================================================================
// Selection Context & Result
// ============================================================================

/**
 * Context provided to the tier selector to determine which tier should activate.
 * All fields except `trigger` are optional so callers can provide as much or
 * as little information as available.
 */
export interface TierSelectionContext {
  /** The event type that initiated this selection */
  readonly trigger: TierTriggerType;

  /** Number of files changed (for PR/commit triggers) */
  readonly changedFiles?: number;

  /** Domain names affected by the change */
  readonly affectedDomains?: readonly string[];

  /** Severity level (for incident triggers) */
  readonly severity?: string;

  /** Whether this is a hotfix deployment */
  readonly isHotfix?: boolean;

  /** Manual override to force a specific tier */
  readonly manualOverride?: FleetTier;
}

/**
 * Which agents to activate in a specific domain.
 */
export interface AgentAllocation {
  /** Domain receiving agents */
  readonly domain: string;

  /** Number of agents allocated to this domain */
  readonly agentCount: number;

  /** Types of agents to activate in this domain */
  readonly agentTypes: readonly string[];
}

/**
 * Result of tier selection including the chosen tier, its config,
 * the reasoning, and concrete agent allocation plan.
 */
export interface TierSelectionResult {
  /** The tier that was selected */
  readonly selectedTier: FleetTier;

  /** Full configuration for the selected tier */
  readonly config: TierConfig;

  /** Human-readable reason for the selection */
  readonly reason: string;

  /** Per-domain agent allocation plan */
  readonly agentAllocation: readonly AgentAllocation[];
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * A single tier selection history entry for statistics tracking.
 */
export interface TierSelectionRecord {
  /** The tier that was selected */
  readonly tier: FleetTier;

  /** Why this tier was selected */
  readonly reason: string;

  /** When the selection was made (epoch ms) */
  readonly timestamp: number;

  /** The trigger type that initiated the selection */
  readonly trigger: TierTriggerType;
}

/**
 * Aggregated statistics about tier selections over time.
 */
export interface TierSelectionStats {
  /** Total number of tier selections performed */
  readonly totalSelections: number;

  /** Count of selections per tier */
  readonly selectionsByTier: Readonly<Record<FleetTier, number>>;

  /** Count of escalations performed */
  readonly escalationCount: number;

  /** Count of de-escalations performed */
  readonly deescalationCount: number;

  /** Most recent selection records (capped) */
  readonly recentSelections: readonly TierSelectionRecord[];
}
