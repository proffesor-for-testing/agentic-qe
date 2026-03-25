/**
 * Agent Routing Language Boost Tests
 *
 * Tests for Phase 5 language-aware routing:
 * - Language match boost in calculateAgentScores
 * - Language field in AgentCapabilityProfile
 * - Backward compatibility (no language = no boost)
 *
 * @see Issue #324 — Multi-language Phase 5
 */

import { describe, it, expect } from 'vitest';

import {
  calculateAgentScores,
  AGENT_CAPABILITIES,
  type RoutingWeights,
  type AgentCapabilityProfile,
} from '../../../src/learning/agent-routing.js';

const DEFAULT_WEIGHTS: RoutingWeights = {
  similarity: 1.0,
  performance: 1.0,
  capabilities: 1.0,
  language: 1.0,
};

const emptyPatterns = new Map<string, number>();

describe('Language-Aware Agent Routing', () => {
  it('should boost agents with matching language', () => {
    const scoresWithLang = calculateAgentScores(
      ['test-generation'],
      undefined,
      emptyPatterns,
      DEFAULT_WEIGHTS,
      AGENT_CAPABILITIES,
      'java',
    );

    const scoresWithoutLang = calculateAgentScores(
      ['test-generation'],
      undefined,
      emptyPatterns,
      DEFAULT_WEIGHTS,
      AGENT_CAPABILITIES,
    );

    // Find the test-generator agent in both results
    const withLang = scoresWithLang.find(s => s.agent === 'qe-test-generator');
    const withoutLang = scoresWithoutLang.find(s => s.agent === 'qe-test-generator');

    expect(withLang).toBeDefined();
    expect(withoutLang).toBeDefined();
    expect(withLang!.score).toBeGreaterThan(withoutLang!.score);
    expect(withLang!.reasoning).toContain('Language match: java');
  });

  it('should not boost agents without language capability', () => {
    const customCapabilities: Record<string, AgentCapabilityProfile> = {
      'agent-with-lang': {
        domains: ['test-generation'],
        capabilities: ['test-generation'],
        performanceScore: 0.8,
        languages: ['java', 'kotlin'],
      },
      'agent-without-lang': {
        domains: ['test-generation'],
        capabilities: ['test-generation'],
        performanceScore: 0.8,
        // No languages field
      },
    };

    const scores = calculateAgentScores(
      ['test-generation'],
      undefined,
      emptyPatterns,
      DEFAULT_WEIGHTS,
      customCapabilities,
      'java',
    );

    const withLang = scores.find(s => s.agent === 'agent-with-lang')!;
    const withoutLang = scores.find(s => s.agent === 'agent-without-lang')!;

    expect(withLang.score).toBeGreaterThan(withoutLang.score);
  });

  it('should not apply boost when language does not match', () => {
    const customCapabilities: Record<string, AgentCapabilityProfile> = {
      'ts-only-agent': {
        domains: ['test-generation'],
        capabilities: ['test-generation'],
        performanceScore: 0.8,
        languages: ['typescript'],
      },
    };

    const scoresWithRust = calculateAgentScores(
      ['test-generation'],
      undefined,
      emptyPatterns,
      DEFAULT_WEIGHTS,
      customCapabilities,
      'rust',
    );

    const scoresNoLang = calculateAgentScores(
      ['test-generation'],
      undefined,
      emptyPatterns,
      DEFAULT_WEIGHTS,
      customCapabilities,
    );

    const withRust = scoresWithRust.find(s => s.agent === 'ts-only-agent')!;
    const noLang = scoresNoLang.find(s => s.agent === 'ts-only-agent')!;

    // No boost when language doesn't match
    expect(withRust.score).toBe(noLang.score);
  });

  it('should respect language weight configuration', () => {
    const fullWeight: RoutingWeights = { similarity: 1, performance: 1, capabilities: 1, language: 1.0 };
    const halfWeight: RoutingWeights = { similarity: 1, performance: 1, capabilities: 1, language: 0.5 };

    const scoresFull = calculateAgentScores(
      ['test-generation'],
      undefined,
      emptyPatterns,
      fullWeight,
      AGENT_CAPABILITIES,
      'java',
    );

    const scoresHalf = calculateAgentScores(
      ['test-generation'],
      undefined,
      emptyPatterns,
      halfWeight,
      AGENT_CAPABILITIES,
      'java',
    );

    const full = scoresFull.find(s => s.agent === 'qe-test-generator')!;
    const half = scoresHalf.find(s => s.agent === 'qe-test-generator')!;

    // Full weight should give higher score than half weight
    expect(full.score).toBeGreaterThan(half.score);
  });

  it('should be case-insensitive for language matching', () => {
    const scores = calculateAgentScores(
      ['test-generation'],
      undefined,
      emptyPatterns,
      DEFAULT_WEIGHTS,
      AGENT_CAPABILITIES,
      'Java', // uppercase
    );

    const generator = scores.find(s => s.agent === 'qe-test-generator')!;
    expect(generator.reasoning).toContain('Language match: Java');
  });

  it('should work with backward-compatible RoutingWeights (no language field)', () => {
    const oldStyleWeights: RoutingWeights = {
      similarity: 1.0,
      performance: 1.0,
      capabilities: 1.0,
      // no language field — should default to 1.0
    };

    const scores = calculateAgentScores(
      ['test-generation'],
      undefined,
      emptyPatterns,
      oldStyleWeights,
      AGENT_CAPABILITIES,
      'python',
    );

    const generator = scores.find(s => s.agent === 'qe-test-generator')!;
    expect(generator.reasoning).toContain('Language match: python');
  });

  it('should include languages in AGENT_CAPABILITIES for key agents', () => {
    // Verify the static capabilities map has language data
    expect(AGENT_CAPABILITIES['qe-test-generator'].languages).toBeDefined();
    expect(AGENT_CAPABILITIES['qe-test-generator'].languages).toContain('java');
    expect(AGENT_CAPABILITIES['qe-test-generator'].languages).toContain('rust');
    expect(AGENT_CAPABILITIES['qe-coverage-analyzer'].languages).toContain('go');
    expect(AGENT_CAPABILITIES['qe-coverage-analyzer'].languages).toContain('swift');
  });
});
