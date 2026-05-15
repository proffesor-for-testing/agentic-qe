/**
 * Agentic QE v3 - Agent Routing
 * ADR-021: QE ReasoningBank for Pattern Learning
 * ADR-095: ε-greedy exploration with Q-value blending and mincut safety gate
 *
 * Static agent capability mapping and routing score calculation
 * used by QEReasoningBank.routeTask().
 */

import { randomInt } from 'crypto';
import type { QEDomain } from './qe-patterns.js';

// ============================================================================
// Agent Capability Profile
// ============================================================================

/**
 * Profile describing an agent's domains, capabilities, performance, and language expertise.
 */
export interface AgentCapabilityProfile {
  domains: QEDomain[];
  capabilities: string[];
  performanceScore: number;
  /** Languages this agent has expertise in (for language-aware routing) */
  languages?: string[];
}

// ============================================================================
// Agent Capabilities Map
// ============================================================================

/**
 * Static mapping of QE agent types to their capability profiles.
 */
export const AGENT_CAPABILITIES: Record<string, AgentCapabilityProfile> = {
  'qe-test-generator': {
    domains: ['test-generation'],
    capabilities: ['test-generation', 'tdd', 'bdd', 'unit-test', 'integration-test'],
    performanceScore: 0.85,
    languages: ['typescript', 'javascript', 'python', 'java', 'csharp', 'go', 'rust', 'swift', 'kotlin', 'dart'],
  },
  'qe-coverage-analyzer': {
    domains: ['coverage-analysis'],
    capabilities: ['coverage-analysis', 'gap-detection', 'risk-scoring'],
    performanceScore: 0.92,
    languages: ['typescript', 'javascript', 'python', 'java', 'csharp', 'go', 'rust', 'swift', 'kotlin', 'dart'],
  },
  'qe-coverage-specialist': {
    domains: ['coverage-analysis'],
    capabilities: ['sublinear-analysis', 'branch-coverage', 'mutation-testing'],
    performanceScore: 0.88,
    languages: ['typescript', 'javascript'],
  },
  'qe-test-architect': {
    domains: ['test-generation', 'coverage-analysis'],
    capabilities: ['test-strategy', 'test-pyramid', 'architecture'],
    performanceScore: 0.9,
    languages: ['typescript', 'javascript', 'python', 'java', 'csharp', 'go', 'rust', 'swift', 'kotlin', 'dart'],
  },
  'qe-api-contract-validator': {
    domains: ['contract-testing'],
    capabilities: ['contract-testing', 'openapi', 'graphql', 'pact'],
    performanceScore: 0.87,
  },
  'qe-security-auditor': {
    domains: ['security-compliance'],
    capabilities: ['sast', 'dast', 'vulnerability', 'owasp'],
    performanceScore: 0.82,
  },
  'qe-visual-tester': {
    domains: ['visual-accessibility'],
    capabilities: ['screenshot', 'visual-regression', 'percy', 'chromatic'],
    performanceScore: 0.8,
  },
  'qe-a11y-ally': {
    domains: ['visual-accessibility'],
    capabilities: ['wcag', 'aria', 'screen-reader', 'contrast'],
    performanceScore: 0.85,
  },
  'qe-performance-tester': {
    domains: ['chaos-resilience'],
    capabilities: ['load-testing', 'stress-testing', 'k6', 'artillery'],
    performanceScore: 0.83,
  },
  'qe-flaky-investigator': {
    domains: ['test-execution'],
    capabilities: ['flaky-detection', 'test-stability', 'retry'],
    performanceScore: 0.78,
  },
  'qe-chaos-engineer': {
    domains: ['chaos-resilience'],
    capabilities: ['chaos-testing', 'resilience', 'fault-injection'],
    performanceScore: 0.75,
  },
};

// ============================================================================
// Agent Score Calculation
// ============================================================================

/**
 * Scored agent with reasoning trace.
 *
 * ADR-095 telemetry fields (all optional, populated only when the
 * corresponding signal source is wired):
 *   - `staticScore`: the pre-blend score (domain + capability + perf + …)
 *   - `qWeight`, `qValue`: when Q-table data was available
 *   - `exploration`: true if this agent was promoted to position 0 by the
 *     ε-greedy policy rather than scored to the top deterministically
 */
export interface ScoredAgent {
  agent: string;
  score: number;
  reasoning: string[];
  /** ADR-095: pre-blend static score for retrospective explainability */
  staticScore?: number;
  /** ADR-095: Q-value influence (0..MAX_Q_WEIGHT) on the final score */
  qWeight?: number;
  /** ADR-095: raw q_value from rl_q_values, for telemetry */
  qValue?: number;
  /** ADR-095: number of (state_key, action_key) visits behind the Q value */
  qVisits?: number;
  /** ADR-095: true when ε-greedy promoted this agent over the greedy winner */
  exploration?: boolean;
}

/**
 * Routing weight configuration.
 */
export interface RoutingWeights {
  similarity: number;
  performance: number;
  capabilities: number;
  /** Weight for language match boost (default: 1.0) */
  language?: number;
}

// ============================================================================
// ADR-095: Q-Value Blending + ε-Greedy Exploration
// ============================================================================

/**
 * Maximum Q-value influence on the final score.
 *
 * 0.4 means a fully-mature Q-value can move the score by up to ±0.2 (since
 * normalizedQ ranges over (0, 1) and the static contribution clamps the
 * upper bound). This is intentionally bounded so Q-values inform rather
 * than override the static features.
 *
 * Tuning: post-deploy telemetry will tell us whether agents are actually
 * being separated by Q-values. If the avg `q_weight` in routing_outcomes
 * climbs but quality_score doesn't improve, this constant is too high.
 */
export const MAX_Q_WEIGHT = 0.4;

/**
 * Number of (state_key, action_key) visits at which qWeight saturates at
 * MAX_Q_WEIGHT. Below this, qWeight ramps linearly from 0.
 *
 * 20 visits at the default 30-min worker tick + typical session cadence
 * implies ~1 week of activity before a (state, agent) pair drives the
 * decision. Adjust downward if cold-start latency proves problematic.
 */
export const QWEIGHT_RAMP_VISITS = 20;

/**
 * Q-value lookup callback supplied by the caller (QEReasoningBank.routeTask).
 * Returns undefined when the (stateKey, agentType) pair has no recorded
 * Q-value yet — caller does not need to handle missing-row vs zero-visits.
 */
export type QValueLookup = (agentType: string) =>
  | { qValue: number; visits: number }
  | undefined;

/**
 * Sigmoid mapping R → (0, 1) for Q-value normalization before blending.
 * A fresh row with q_value = 0 contributes 0.5 (neutral); negative q_values
 * (after a failure, given the asymmetric -1.0 penalty from ADR-061) push
 * the contribution toward 0, positive q_values toward 1.
 */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Blend a static score with a Q-value contribution.
 *
 *   effectiveScore = staticScore * (1 - qWeight) + normalizedQ * qWeight
 *
 * Returns { score, qWeight, qValue, qVisits } so callers can attach the
 * telemetry fields to the ScoredAgent record.
 */
export function blendStaticAndQValue(
  staticScore: number,
  qLookup: { qValue: number; visits: number } | undefined,
): { score: number; qWeight: number; qValue: number; qVisits: number } {
  if (!qLookup || qLookup.visits === 0) {
    return { score: staticScore, qWeight: 0, qValue: 0, qVisits: 0 };
  }
  const qWeight = Math.min(qLookup.visits / QWEIGHT_RAMP_VISITS, 1) * MAX_Q_WEIGHT;
  const normalizedQ = sigmoid(qLookup.qValue);
  return {
    score: staticScore * (1 - qWeight) + normalizedQ * qWeight,
    qWeight,
    qValue: qLookup.qValue,
    qVisits: qLookup.visits,
  };
}

/**
 * Resolve the per-decision ε for the exploration policy.
 *
 * Priority order:
 *   1. AQE_ROUTER_EXPLORATION_RATE env var (operator override, fixed)
 *   2. Default base rate (0.05)
 * The result is then multiplied by the mincut safety gate (caller passes
 * `topologyCritical` derived from getSharedMinCutMonitor().isCritical()):
 * critical topology → 0.2x dampening, healthy/unknown → 1.0x.
 *
 * Returns a number in [0, 1].
 */
export function resolveExplorationRate(opts: {
  envOverride?: string;
  topologyCritical?: boolean;
}): { epsilon: number; baseEpsilon: number; safetyMultiplier: number } {
  const envValue = opts.envOverride;
  const parsed = envValue !== undefined ? Number.parseFloat(envValue) : NaN;
  const baseEpsilon = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : 0.05;
  const safetyMultiplier = opts.topologyCritical ? 0.2 : 1.0;
  const epsilon = Math.min(Math.max(baseEpsilon * safetyMultiplier, 0), 1);
  return { epsilon, baseEpsilon, safetyMultiplier };
}

/**
 * Apply the ε-greedy exploration policy to a sorted score list.
 *
 * With probability ε (computed from resolveExplorationRate), swaps the
 * top-scored agent with a uniformly-random pick from positions 1..3 (or
 * fewer if the list is shorter). Mutates `agentScores` in place. The
 * promoted agent gets `exploration = true`.
 *
 * Uses `crypto.randomInt` for cryptographically-strong uniform sampling —
 * matches the codebase convention (randomUUID is imported from 'crypto'
 * in the same modules). Math.random() would work but breaks consistency.
 */
export function applyExplorationPolicy(
  agentScores: ScoredAgent[],
  epsilon: number,
): void {
  if (epsilon <= 0 || agentScores.length < 2) return;
  // Compare in micro-units so randomInt can do uniform sampling without
  // float arithmetic. ε = 0.05 → 50_000 micro-units in 1_000_000.
  const epsilonMicro = Math.round(epsilon * 1_000_000);
  if (epsilonMicro <= 0) return;
  if (randomInt(0, 1_000_000) >= epsilonMicro) return;

  // Pick from top alternatives (positions 1..min(3, length-1)).
  const ceiling = Math.min(4, agentScores.length);
  const exploreIdx = randomInt(1, ceiling);

  const explored = agentScores[exploreIdx];
  agentScores[exploreIdx] = agentScores[0];
  agentScores[0] = explored;
  agentScores[0].exploration = true;
  agentScores[0].reasoning = [...agentScores[0].reasoning, '(exploration)'];
}

/**
 * Derive a structural taskType from a free-form task description. Used to
 * build the q-learning state_key shared with the post-task Bellman update
 * (hooks-dream-learning.ts).
 *
 * Exported (rather than kept private in task-hooks) so QEReasoningBank can
 * compute the same state_key at routing time as post-task does at outcome
 * time — without that, the Q-table writer and reader would address
 * different keys.
 */
export function deriveTaskType(description: string): string {
  const d = description.toLowerCase();
  if (/\bgenerate[- ]?test|\btest[- ]?gen|\bgenerate.+spec/.test(d)) return 'test-generation';
  if (/\bcoverage|\banalyze.+cover/.test(d)) return 'coverage-analysis';
  if (/\bquality|\bassess|\baudit/.test(d)) return 'quality-assessment';
  if (/\bsecurity|\bvulnerab|\bcompliance/.test(d)) return 'security-compliance';
  if (/\bdefect|\bbug|\bdiagnos/.test(d)) return 'defect-intelligence';
  if (/\brequirement|\bspec\b/.test(d)) return 'requirements-validation';
  if (/\brefactor|\brewrite|\boptim/.test(d)) return 'refactoring';
  if (/\btest|\brun.+test/.test(d)) return 'test-execution';
  return 'unknown';
}

/**
 * Build the canonical Q-learning state_key. Must match the format used by
 * `updateHookRouterQValue` in hooks-dream-learning.ts — the writer and
 * reader must agree on the key shape.
 */
export function buildRoutingStateKey(opts: {
  taskType: string;
  priority?: string;
  domain?: string;
  complexityBucket: number;
}): string {
  return `${opts.taskType}|${opts.priority ?? 'normal'}|${opts.domain ?? 'any'}|${opts.complexityBucket}`;
}

/**
 * Compute the complexity bucket [0, 10] from a task description length.
 * Mirrors the formula in task-hooks.ts pre-task bridge.
 */
export function deriveComplexityBucket(description: string): number {
  return Math.max(0, Math.min(10, Math.round(Math.min(description.length / 200, 1) * 10)));
}

/**
 * Calculate agent scores for a routing request.
 *
 * @param detectedDomains - Domains detected from the task description
 * @param requestCapabilities - Required capabilities from the routing request
 * @param agentDomainPatternCounts - Map from agent type to number of matching patterns
 * @param routingWeights - Weights for the scoring components
 * @param agentCapabilities - Agent capability map (defaults to AGENT_CAPABILITIES)
 * @param requestLanguage - Optional language to boost agents with matching language expertise
 * @returns Sorted array of scored agents (highest score first)
 */
export function calculateAgentScores(
  detectedDomains: QEDomain[],
  requestCapabilities: string[] | undefined,
  agentDomainPatternCounts: Map<string, number>,
  routingWeights: RoutingWeights,
  agentCapabilities: Record<string, AgentCapabilityProfile> = AGENT_CAPABILITIES,
  requestLanguage?: string,
  /**
   * ADR-095: optional per-agent Q-value lookup. When provided, the static
   * score is blended with the Q-value contribution via blendStaticAndQValue.
   * When omitted (or returning undefined for every agent), behavior is
   * identical to the pre-ADR-095 deterministic scoring.
   */
  qValueLookup?: QValueLookup,
): ScoredAgent[] {
  const agentScores: ScoredAgent[] = [];

  for (const [agentType, profile] of Object.entries(agentCapabilities)) {
    let score = 0;
    const reasoning: string[] = [];

    // Domain match (0-0.4)
    const domainMatch = detectedDomains.filter((d) =>
      profile.domains.includes(d)
    ).length;
    const domainScore =
      domainMatch > 0 ? (domainMatch / detectedDomains.length) * 0.4 : 0;
    score += domainScore * routingWeights.similarity;
    if (domainScore > 0) {
      reasoning.push(`Domain match: ${(domainScore * 100).toFixed(0)}%`);
    }

    // Capability match (0-0.3)
    if (requestCapabilities && requestCapabilities.length > 0) {
      const capMatch = requestCapabilities.filter((c) =>
        profile.capabilities.some(
          (pc) => pc.toLowerCase().includes(c.toLowerCase())
        )
      ).length;
      const capScore =
        capMatch > 0 ? (capMatch / requestCapabilities.length) * 0.3 : 0;
      score += capScore * routingWeights.capabilities;
      if (capScore > 0) {
        reasoning.push(`Capability match: ${(capScore * 100).toFixed(0)}%`);
      }
    } else {
      score += 0.15 * routingWeights.capabilities;
    }

    // Historical performance (0-0.3)
    score += profile.performanceScore * 0.3 * routingWeights.performance;
    reasoning.push(`Performance score: ${(profile.performanceScore * 100).toFixed(0)}%`);

    // Language match boost (0-0.15)
    if (requestLanguage && profile.languages && profile.languages.length > 0) {
      const langWeight = routingWeights.language ?? 1.0;
      const langLower = requestLanguage.toLowerCase();
      const hasLanguage = profile.languages.some(l => l.toLowerCase() === langLower);
      if (hasLanguage) {
        const langBoost = 0.15 * langWeight;
        score += langBoost;
        reasoning.push(`Language match: ${requestLanguage}`);
      }
    }

    // Pattern similarity boost
    const patternCount = agentDomainPatternCounts.get(agentType) || 0;
    if (patternCount > 0) {
      const patternBoost = Math.min(0.1, patternCount * 0.02);
      score += patternBoost;
      reasoning.push(`Pattern matches: ${patternCount}`);
    }

    // ADR-095: blend Q-value if a lookup is provided
    const staticScore = score;
    if (qValueLookup) {
      const q = qValueLookup(agentType);
      const blended = blendStaticAndQValue(staticScore, q);
      score = blended.score;
      if (blended.qWeight > 0) {
        reasoning.push(
          `Q-bonus (w=${blended.qWeight.toFixed(2)}, v=${blended.qVisits})`,
        );
      }
      agentScores.push({
        agent: agentType,
        score,
        reasoning,
        staticScore,
        qWeight: blended.qWeight,
        qValue: blended.qValue,
        qVisits: blended.qVisits,
      });
    } else {
      agentScores.push({ agent: agentType, score, reasoning, staticScore });
    }
  }

  // Sort by score descending
  agentScores.sort((a, b) => b.score - a.score);

  return agentScores;
}

// ============================================================================
// Cross-Domain Compatibility Matrix
// ============================================================================

/**
 * Domain compatibility matrix for cross-domain pattern transfer.
 * Maps each domain to its related domains (same as TransferSpecialistService).
 */
export const RELATED_DOMAINS: Record<QEDomain, QEDomain[]> = {
  'test-generation': ['test-execution', 'coverage-analysis', 'requirements-validation'],
  'test-execution': ['test-generation', 'coverage-analysis', 'quality-assessment'],
  'coverage-analysis': ['test-generation', 'test-execution', 'quality-assessment'],
  'quality-assessment': ['test-execution', 'coverage-analysis', 'defect-intelligence'],
  'defect-intelligence': ['quality-assessment', 'code-intelligence'],
  'requirements-validation': ['test-generation', 'quality-assessment'],
  'code-intelligence': ['defect-intelligence', 'security-compliance'],
  'security-compliance': ['code-intelligence', 'quality-assessment'],
  'contract-testing': ['test-generation', 'test-execution'],
  'visual-accessibility': ['quality-assessment'],
  'chaos-resilience': ['test-execution', 'quality-assessment'],
  'learning-optimization': ['test-generation', 'test-execution', 'coverage-analysis', 'quality-assessment', 'defect-intelligence'],
};
