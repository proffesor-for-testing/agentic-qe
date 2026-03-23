/**
 * Agentic QE v3 - Agent Routing
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Static agent capability mapping and routing score calculation
 * used by QEReasoningBank.routeTask().
 */

import type { QEDomain } from './qe-patterns.js';

// ============================================================================
// Agent Capability Profile
// ============================================================================

/**
 * Profile describing an agent's domains, capabilities, and performance.
 */
export interface AgentCapabilityProfile {
  domains: QEDomain[];
  capabilities: string[];
  performanceScore: number;
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
  },
  'qe-coverage-analyzer': {
    domains: ['coverage-analysis'],
    capabilities: ['coverage-analysis', 'gap-detection', 'risk-scoring'],
    performanceScore: 0.92,
  },
  'qe-coverage-specialist': {
    domains: ['coverage-analysis'],
    capabilities: ['sublinear-analysis', 'branch-coverage', 'mutation-testing'],
    performanceScore: 0.88,
  },
  'qe-test-architect': {
    domains: ['test-generation', 'coverage-analysis'],
    capabilities: ['test-strategy', 'test-pyramid', 'architecture'],
    performanceScore: 0.9,
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
 */
export interface ScoredAgent {
  agent: string;
  score: number;
  reasoning: string[];
}

/**
 * Routing weight configuration.
 */
export interface RoutingWeights {
  similarity: number;
  performance: number;
  capabilities: number;
}

/**
 * Calculate agent scores for a routing request.
 *
 * @param detectedDomains - Domains detected from the task description
 * @param requestCapabilities - Required capabilities from the routing request
 * @param agentDomainPatternCounts - Map from agent type to number of matching patterns
 * @param routingWeights - Weights for the scoring components
 * @param agentCapabilities - Agent capability map (defaults to AGENT_CAPABILITIES)
 * @returns Sorted array of scored agents (highest score first)
 */
export function calculateAgentScores(
  detectedDomains: QEDomain[],
  requestCapabilities: string[] | undefined,
  agentDomainPatternCounts: Map<string, number>,
  routingWeights: RoutingWeights,
  agentCapabilities: Record<string, AgentCapabilityProfile> = AGENT_CAPABILITIES,
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

    // Pattern similarity boost
    const patternCount = agentDomainPatternCounts.get(agentType) || 0;
    if (patternCount > 0) {
      const patternBoost = Math.min(0.1, patternCount * 0.02);
      score += patternBoost;
      reasoning.push(`Pattern matches: ${patternCount}`);
    }

    agentScores.push({ agent: agentType, score, reasoning });
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
