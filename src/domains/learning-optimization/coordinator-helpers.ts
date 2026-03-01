/**
 * Learning Optimization - Helper Methods
 * Extracted from coordinator.ts for CQ-004 (file size reduction)
 *
 * Contains: experience retrieval, strategy management, metric calculation,
 * domain relationships, pattern similarity, checksum
 */

import {
  Result,
  ok,
  DomainName,
  ALL_DOMAINS,
} from '../../shared/types/index.js';
import { TimeRange } from '../../shared/value-objects/index.js';
import type { MemoryBackend } from '../../kernel/interfaces.js';
import type {
  Experience,
  LearnedPattern,
  Knowledge,
  OptimizedStrategy,
} from './interfaces.js';

/**
 * Get experiences for a specific domain within a time range
 */
export async function getExperiencesForDomain(
  memory: MemoryBackend,
  domain: DomainName,
  timeRange: TimeRange
): Promise<Result<Experience[]>> {
  const keys = await memory.search(
    `learning:experience:index:domain:${domain}:*`,
    500
  );
  const experiences: Experience[] = [];

  for (const key of keys) {
    const experienceId = await memory.get<string>(key);
    if (experienceId) {
      const experience = await memory.get<Experience>(
        `learning:experience:${experienceId}`
      );
      if (experience && timeRange.contains(experience.timestamp)) {
        experiences.push(experience);
      }
    }
  }

  return ok(experiences);
}

/**
 * Get current strategy for a domain
 */
export async function getCurrentStrategy(
  memory: MemoryBackend,
  domain: DomainName
): Promise<{
  name: string;
  parameters: Record<string, unknown>;
  expectedOutcome: Record<string, number>;
}> {
  const strategyKey = `learning:strategy:current:${domain}`;
  const existing = await memory.get<{
    name: string;
    parameters: Record<string, unknown>;
    expectedOutcome: Record<string, number>;
  }>(strategyKey);

  if (existing) {
    return existing;
  }

  return {
    name: `default-${domain}`,
    parameters: {
      timeout: 30000,
      retryCount: 3,
      concurrency: 4,
    },
    expectedOutcome: {
      success_rate: 0.8,
    },
  };
}

/**
 * Store strategy for a domain
 */
export async function storeStrategy(
  memory: MemoryBackend,
  domain: DomainName,
  strategy: { name: string; parameters: Record<string, unknown>; expectedOutcome: Record<string, number> }
): Promise<void> {
  await memory.set(`learning:strategy:current:${domain}`, strategy, {
    namespace: 'learning-optimization',
    persist: true,
  });
}

/**
 * Calculate metric value from experiences
 */
export function calculateMetricValue(
  experiences: Experience[],
  metric: string
): number {
  const values = experiences
    .map((e) => (e.result.outcome[metric] as number) ?? 0)
    .filter((v) => !isNaN(v));

  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Get related domains for cross-domain knowledge transfer
 */
export function getRelatedDomains(domain: DomainName): DomainName[] {
  const relationships: Record<DomainName, DomainName[]> = {
    'test-generation': ['test-execution', 'coverage-analysis'],
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
    'learning-optimization': ALL_DOMAINS.filter((d) => d !== 'learning-optimization'),
    'enterprise-integration': ['contract-testing', 'security-compliance', 'quality-assessment'],
    'coordination': ALL_DOMAINS.filter((d) => d !== 'coordination'),
  };

  return relationships[domain] || [];
}

/**
 * Find groups of similar patterns
 */
export function findSimilarPatterns(patterns: LearnedPattern[]): LearnedPattern[][] {
  const groups: LearnedPattern[][] = [];
  const assigned = new Set<string>();

  for (const pattern of patterns) {
    if (assigned.has(pattern.id)) continue;

    const group = [pattern];
    assigned.add(pattern.id);

    for (const other of patterns) {
      if (assigned.has(other.id)) continue;

      if (
        pattern.type === other.type &&
        pattern.domain === other.domain &&
        contextsOverlap(pattern.context, other.context)
      ) {
        group.push(other);
        assigned.add(other.id);
      }
    }

    if (group.length >= 2) {
      groups.push(group);
    }
  }

  return groups;
}

/**
 * Check if two contexts overlap (share tags)
 */
export function contextsOverlap(
  a: { tags: string[] },
  b: { tags: string[] }
): boolean {
  return a.tags.some((tag) => b.tags.includes(tag));
}

/**
 * Calculate checksum for model export
 */
export function calculateChecksum(
  patterns: LearnedPattern[],
  knowledge: Knowledge[],
  strategies: OptimizedStrategy[]
): string {
  const data = JSON.stringify({
    patternCount: patterns.length,
    knowledgeCount: knowledge.length,
    strategyCount: strategies.length,
    patternIds: patterns.map((p) => p.id).sort(),
    knowledgeIds: knowledge.map((k) => k.id).sort(),
    strategyIds: strategies.map((s) => s.id).sort(),
  });

  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return Math.abs(hash).toString(16);
}
