/**
 * Integration tests for ShardRetriever governance integration
 *
 * Tests verify:
 * - Shard loading from filesystem
 * - Shard parsing (rules, thresholds, invariants, agent constraints)
 * - Retrieval by domain
 * - Retrieval by intent/task type
 * - Relevance calculation
 * - Caching behavior
 * - Rule injection for context
 *
 * @see ADR-058-guidance-governance-integration.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  governanceFlags,
  DEFAULT_GOVERNANCE_FLAGS,
} from '../../../src/governance/feature-flags.js';
import {
  ShardRetrieverIntegration,
  shardRetrieverIntegration,
  DEFAULT_SHARD_RETRIEVER_FLAGS,
  type ShardContent,
  type TaskContext,
} from '../../../src/governance/shard-retriever-integration.js';

// Base path for the project root (where shards are located)
// Tests run from v3 directory, shards are in the parent agentic-qe-new directory
const PROJECT_ROOT = path.resolve(process.cwd(), '..');

describe('ShardRetriever Integration - ADR-058 Phase 3', () => {
  beforeEach(() => {
    // Reset to defaults before each test
    governanceFlags.reset();
    shardRetrieverIntegration.reset();

    // Ensure shardRetriever is enabled
    governanceFlags.updateFlags({
      shardRetriever: {
        ...DEFAULT_SHARD_RETRIEVER_FLAGS,
        enabled: true,
      },
    });
  });

  afterEach(() => {
    shardRetrieverIntegration.reset();
  });

  describe('Shard Loading', () => {
    it('should load all shards from filesystem', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      const shards = await retriever.loadAllShards();

      expect(shards.size).toBeGreaterThan(0);
      // We expect 12 domain shards based on the glob results
      expect(shards.size).toBe(12);
    });

    it('should load a specific shard by domain', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      const shard = await retriever.loadShard('test-generation');

      expect(shard).not.toBeNull();
      expect(shard!.domain).toBe('test-generation');
    });

    it('should return null for non-existent domain', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      const shard = await retriever.loadShard('non-existent-domain');

      expect(shard).toBeNull();
    });

    it('should handle invalid shards path gracefully', async () => {
      governanceFlags.updateFlags({
        shardRetriever: {
          ...DEFAULT_SHARD_RETRIEVER_FLAGS,
          shardsPath: '/invalid/path/to/shards',
        },
      });

      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      const shards = await retriever.loadAllShards();

      expect(shards.size).toBe(0);
      const stats = retriever.getShardStats();
      expect(stats.parseErrors.length).toBeGreaterThan(0);
    });

    it('should track loaded domains in stats', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.loadAllShards();

      const stats = retriever.getShardStats();
      expect(stats.loadedShards).toBe(12);
      expect(stats.domains).toContain('test-generation');
      expect(stats.domains).toContain('security-compliance');
      expect(stats.domains).toContain('coverage-analysis');
    });
  });

  describe('Shard Parsing', () => {
    let testShard: ShardContent | null;

    beforeEach(async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      testShard = await retriever.loadShard('test-generation');
    });

    it('should parse domain metadata', () => {
      expect(testShard).not.toBeNull();
      expect(testShard!.domain).toBe('test-generation');
      expect(testShard!.version).toBe('1.0.0');
      expect(testShard!.lastUpdated).toBeTruthy();
      expect(testShard!.parentConstitution).toContain('constitution.md');
    });

    it('should parse domain rules', () => {
      expect(testShard).not.toBeNull();
      expect(testShard!.rules.length).toBeGreaterThan(0);
      // Check for specific rule content
      expect(testShard!.rules.some(r => r.includes('Pattern-Driven Generation'))).toBe(true);
      expect(testShard!.rules.some(r => r.includes('Coherence Gate'))).toBe(true);
    });

    it('should parse quality thresholds', () => {
      expect(testShard).not.toBeNull();
      expect(Object.keys(testShard!.thresholds).length).toBeGreaterThan(0);

      // Check for specific thresholds
      const qualityScore = testShard!.thresholds['Quality Score'];
      expect(qualityScore).toBeDefined();
      expect(qualityScore.minimum).toBe(0.7);
      expect(qualityScore.target).toBe(0.85);
    });

    it('should parse invariants', () => {
      expect(testShard).not.toBeNull();
      expect(testShard!.invariants.length).toBeGreaterThan(0);
      // Check that invariants contain expected patterns
      expect(testShard!.invariants.some(i => i.includes('INVARIANT'))).toBe(true);
    });

    it('should parse patterns', () => {
      expect(testShard).not.toBeNull();
      expect(testShard!.patterns.length).toBeGreaterThan(0);

      const pattern = testShard!.patterns.find(p => p.name === 'Test Generator Service');
      expect(pattern).toBeDefined();
      expect(pattern!.location).toContain('test-generator.ts');
    });

    it('should parse agent constraints', () => {
      expect(testShard).not.toBeNull();

      const constraints = testShard!.agentConstraints;
      expect(constraints.primary.length).toBeGreaterThan(0);
      expect(constraints.primary.some(a => a.agentId === 'qe-test-architect')).toBe(true);
      expect(constraints.secondary.some(a => a.agentId === 'qe-tdd-specialist')).toBe(true);
    });

    it('should parse escalation triggers', () => {
      expect(testShard).not.toBeNull();
      expect(testShard!.escalationTriggers.length).toBeGreaterThan(0);

      const criticalTrigger = testShard!.escalationTriggers.find(
        t => t.severity === 'CRITICAL'
      );
      expect(criticalTrigger).toBeDefined();
      expect(criticalTrigger!.action).toContain('Escalate');
    });

    it('should parse memory namespace configuration', () => {
      expect(testShard).not.toBeNull();
      expect(testShard!.memoryNamespace.namespace).toContain('qe-patterns');
      expect(testShard!.memoryNamespace.contradictionCheck).toBe(true);
    });

    it('should parse integration points', () => {
      expect(testShard).not.toBeNull();
      expect(testShard!.integrationPoints.length).toBeGreaterThan(0);

      const coverageIntegration = testShard!.integrationPoints.find(
        p => p.domain === 'coverage-analysis'
      );
      expect(coverageIntegration).toBeDefined();
      expect(coverageIntegration!.type).toBe('Input');
    });

    it('should store raw content', () => {
      expect(testShard).not.toBeNull();
      expect(testShard!.rawContent.length).toBeGreaterThan(0);
      expect(testShard!.rawContent).toContain('# Test Generation Domain Shard');
    });
  });

  describe('Security Shard Parsing', () => {
    let securityShard: ShardContent | null;

    beforeEach(async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      securityShard = await retriever.loadShard('security-compliance');
    });

    it('should parse security-specific thresholds', () => {
      expect(securityShard).not.toBeNull();

      const securityScore = securityShard!.thresholds['Security Score'];
      expect(securityScore).toBeDefined();
      expect(securityScore.minimum).toBe(0.8);
      expect(securityScore.target).toBe(0.95);
    });

    it('should parse security escalation triggers', () => {
      expect(securityShard).not.toBeNull();

      // Should have critical security triggers
      const criticalTriggers = securityShard!.escalationTriggers.filter(
        t => t.severity === 'CRITICAL'
      );
      expect(criticalTriggers.length).toBeGreaterThan(0);
      expect(criticalTriggers.some(t => t.trigger.toLowerCase().includes('vulnerability'))).toBe(true);
    });

    it('should parse security agent constraints', () => {
      expect(securityShard).not.toBeNull();

      const constraints = securityShard!.agentConstraints;
      expect(constraints.primary.some(a => a.agentId === 'qe-security-scanner')).toBe(true);
    });
  });

  describe('Retrieval by Domain', () => {
    it('should retrieve shard by exact domain match', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      const shard = await retriever.retrieveByDomain('coverage-analysis');

      expect(shard).not.toBeNull();
      expect(shard!.domain).toBe('coverage-analysis');
    });

    it('should return null for unknown domain', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      const shard = await retriever.retrieveByDomain('unknown-domain');

      expect(shard).toBeNull();
    });
  });

  describe('Retrieval by Intent', () => {
    it('should retrieve shards matching intent keywords', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.initialize();

      const shards = await retriever.retrieveByIntent('security vulnerability scan');

      expect(shards.length).toBeGreaterThan(0);
      expect(shards.some(s => s.domain === 'security-compliance')).toBe(true);
    });

    it('should retrieve test-related shards for test intent', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.initialize();

      const shards = await retriever.retrieveByIntent('generate unit tests');

      expect(shards.length).toBeGreaterThan(0);
      expect(shards.some(s => s.domain === 'test-generation' || s.domain === 'test-execution')).toBe(true);
    });

    it('should retrieve coverage shards for coverage intent', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.initialize();

      const shards = await retriever.retrieveByIntent('analyze code coverage gaps');

      expect(shards.length).toBeGreaterThan(0);
      expect(shards.some(s => s.domain === 'coverage-analysis')).toBe(true);
    });

    it('should handle empty intent', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.initialize();

      const shards = await retriever.retrieveByIntent('');

      // Should return empty or few results for empty intent
      expect(shards.length).toBeLessThanOrEqual(DEFAULT_SHARD_RETRIEVER_FLAGS.maxShardsPerQuery);
    });

    it('should respect maxShardsPerQuery limit', async () => {
      governanceFlags.updateFlags({
        shardRetriever: {
          ...DEFAULT_SHARD_RETRIEVER_FLAGS,
          maxShardsPerQuery: 2,
        },
      });

      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.initialize();

      const shards = await retriever.retrieveByIntent('test security coverage quality');

      expect(shards.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Retrieval for Task', () => {
    it('should retrieve relevant shards for task type', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.initialize();

      const context: TaskContext = {
        taskType: 'test-generation',
        domain: 'test-generation', // Add explicit domain for higher relevance
      };

      const shards = await retriever.retrieveForTask('test-generation', context);

      expect(shards.length).toBeGreaterThan(0);
      expect(shards[0].domain).toBe('test-generation');
    });

    it('should consider domain in context', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.initialize();

      const context: TaskContext = {
        taskType: 'analysis',
        domain: 'security-compliance',
      };

      const shards = await retriever.retrieveForTask('analysis', context);

      expect(shards.length).toBeGreaterThan(0);
      expect(shards.some(s => s.domain === 'security-compliance')).toBe(true);
    });

    it('should consider agent ID in context', async () => {
      // Lower threshold to test agent ID matching
      governanceFlags.updateFlags({
        shardRetriever: {
          ...DEFAULT_SHARD_RETRIEVER_FLAGS,
          relevanceThreshold: 0.1, // Lower threshold to test agent matching
        },
      });

      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.initialize();

      const context: TaskContext = {
        taskType: 'task',
        agentId: 'qe-test-architect',
      };

      const shards = await retriever.retrieveForTask('task', context);

      // qe-test-architect is primary for test-generation
      expect(shards.length).toBeGreaterThan(0);
      // The shard containing qe-test-architect should be in results
      expect(shards.some(s => s.domain === 'test-generation')).toBe(true);
    });

    it('should boost security shards when requiresSecurity is true', async () => {
      // Lower threshold to verify security boost
      governanceFlags.updateFlags({
        shardRetriever: {
          ...DEFAULT_SHARD_RETRIEVER_FLAGS,
          relevanceThreshold: 0.15, // Lower threshold to test security boost
        },
      });

      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.initialize();

      const context: TaskContext = {
        taskType: 'general-task',
        requiresSecurity: true,
      };

      const shards = await retriever.retrieveForTask('general-task', context);

      // Security should have boosted relevance
      expect(shards.some(s => s.domain === 'security-compliance')).toBe(true);
    });

    it('should boost coverage shards when requiresCoverage is true', async () => {
      // Lower threshold to verify coverage boost
      governanceFlags.updateFlags({
        shardRetriever: {
          ...DEFAULT_SHARD_RETRIEVER_FLAGS,
          relevanceThreshold: 0.15, // Lower threshold to test coverage boost
        },
      });

      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.initialize();

      const context: TaskContext = {
        taskType: 'general-task',
        requiresCoverage: true,
      };

      const shards = await retriever.retrieveForTask('general-task', context);

      expect(shards.some(s => s.domain === 'coverage-analysis')).toBe(true);
    });

    it('should respect relevance threshold', async () => {
      governanceFlags.updateFlags({
        shardRetriever: {
          ...DEFAULT_SHARD_RETRIEVER_FLAGS,
          relevanceThreshold: 0.9, // Very high threshold
        },
      });

      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.initialize();

      const context: TaskContext = {
        taskType: 'some-random-task',
      };

      const shards = await retriever.retrieveForTask('some-random-task', context);

      // High threshold should filter out most shards
      expect(shards.length).toBeLessThan(12);
    });
  });

  describe('Relevance Calculation', () => {
    it('should give highest score to exact domain match', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      const shard = await retriever.loadShard('test-generation');

      const contextWithDomain: TaskContext = {
        taskType: 'any-task',
        domain: 'test-generation',
      };

      const contextWithoutDomain: TaskContext = {
        taskType: 'any-task',
      };

      const scoreWithDomain = retriever.calculateRelevance(shard!, contextWithDomain);
      const scoreWithoutDomain = retriever.calculateRelevance(shard!, contextWithoutDomain);

      expect(scoreWithDomain).toBeGreaterThan(scoreWithoutDomain);
    });

    it('should score based on task type matching', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      const shard = await retriever.loadShard('test-generation');

      const matchingContext: TaskContext = {
        taskType: 'test-generation',
      };

      const nonMatchingContext: TaskContext = {
        taskType: 'completely-unrelated-task',
      };

      const matchingScore = retriever.calculateRelevance(shard!, matchingContext);
      const nonMatchingScore = retriever.calculateRelevance(shard!, nonMatchingContext);

      expect(matchingScore).toBeGreaterThan(nonMatchingScore);
    });

    it('should consider keywords in context', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      const shard = await retriever.loadShard('security-compliance');

      const contextWithKeywords: TaskContext = {
        taskType: 'task',
        keywords: ['vulnerability', 'SAST', 'DAST'],
      };

      const contextWithoutKeywords: TaskContext = {
        taskType: 'task',
      };

      const scoreWithKeywords = retriever.calculateRelevance(shard!, contextWithKeywords);
      const scoreWithoutKeywords = retriever.calculateRelevance(shard!, contextWithoutKeywords);

      expect(scoreWithKeywords).toBeGreaterThan(scoreWithoutKeywords);
    });

    it('should cap relevance score at 1.0', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      const shard = await retriever.loadShard('test-generation');

      // Context with everything matching
      const maxContext: TaskContext = {
        taskType: 'test-generation',
        domain: 'test-generation',
        agentId: 'qe-test-architect',
        intent: 'generate tests',
        keywords: ['test', 'generation', 'TDD', 'pattern'],
      };

      const score = retriever.calculateRelevance(shard!, maxContext);

      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('Top Shards Selection', () => {
    it('should return top N shards by relevance', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.initialize();

      const context: TaskContext = {
        taskType: 'quality-assessment',
      };

      const topShards = await retriever.getTopShards(context, 3);

      expect(topShards.length).toBeLessThanOrEqual(3);
      // Should be sorted by relevance
      if (topShards.length >= 2) {
        const score1 = retriever.calculateRelevance(topShards[0], context);
        const score2 = retriever.calculateRelevance(topShards[1], context);
        expect(score1).toBeGreaterThanOrEqual(score2);
      }
    });

    it('should handle limit greater than available shards', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.initialize();

      const context: TaskContext = {
        taskType: 'task',
      };

      const topShards = await retriever.getTopShards(context, 100);

      // Should return all available shards
      expect(topShards.length).toBeLessThanOrEqual(12);
    });
  });

  describe('Rule Injection', () => {
    it('should inject rules for relevant context', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.initialize();

      const context: TaskContext = {
        taskType: 'test-generation',
        domain: 'test-generation',
      };

      const injected = await retriever.injectRulesForContext(context);

      expect(injected.rules.length).toBeGreaterThan(0);
      expect(injected.sourceDomains).toContain('test-generation');
      // Rules should be prefixed with domain
      expect(injected.rules.some(r => r.startsWith('[test-generation]'))).toBe(true);
    });

    it('should merge thresholds from multiple shards', async () => {
      // Lower threshold to ensure shards are retrieved
      governanceFlags.updateFlags({
        shardRetriever: {
          ...DEFAULT_SHARD_RETRIEVER_FLAGS,
          relevanceThreshold: 0.15,
        },
      });

      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.initialize();

      const context: TaskContext = {
        taskType: 'security-compliance',
        domain: 'security-compliance',
        requiresSecurity: true,
      };

      const injected = await retriever.injectRulesForContext(context);

      expect(Object.keys(injected.thresholds).length).toBeGreaterThan(0);
    });

    it('should aggregate agent constraints from shards', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.initialize();

      const context: TaskContext = {
        taskType: 'test-generation',
        domain: 'test-generation', // Explicit domain for higher relevance
      };

      const injected = await retriever.injectRulesForContext(context);

      expect(injected.constraints.primary.length).toBeGreaterThan(0);
      expect(injected.sourceDomains).toContain('test-generation');
    });

    it('should include escalation triggers', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.initialize();

      const context: TaskContext = {
        taskType: 'security-compliance',
        requiresSecurity: true,
      };

      const injected = await retriever.injectRulesForContext(context);

      expect(injected.escalations.length).toBeGreaterThan(0);
    });

    it('should return empty rules when no shards match', async () => {
      governanceFlags.updateFlags({
        shardRetriever: {
          ...DEFAULT_SHARD_RETRIEVER_FLAGS,
          relevanceThreshold: 1.0, // Impossible to match
        },
      });

      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.initialize();

      const context: TaskContext = {
        taskType: 'unknown-task',
      };

      const injected = await retriever.injectRulesForContext(context);

      expect(injected.rules.length).toBe(0);
      expect(injected.sourceDomains.length).toBe(0);
    });
  });

  describe('Caching Behavior', () => {
    it('should cache shards after loading', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);

      // First load
      await retriever.loadShard('test-generation');
      const stats1 = retriever.getCacheStats();
      expect(stats1.misses).toBe(1);

      // Second load should hit cache
      await retriever.loadShard('test-generation');
      const stats2 = retriever.getCacheStats();
      expect(stats2.hits).toBe(1);
    });

    it('should track cache hit rate', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);

      // Load multiple times
      await retriever.loadShard('test-generation'); // miss
      await retriever.loadShard('test-generation'); // hit
      await retriever.loadShard('test-generation'); // hit
      await retriever.loadShard('security-compliance'); // miss
      await retriever.loadShard('security-compliance'); // hit

      const stats = retriever.getCacheStats();
      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0.6);
    });

    it('should respect cache disabled flag', async () => {
      governanceFlags.updateFlags({
        shardRetriever: {
          ...DEFAULT_SHARD_RETRIEVER_FLAGS,
          cacheEnabled: false,
        },
      });

      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);

      await retriever.loadShard('test-generation');
      await retriever.loadShard('test-generation');

      const stats = retriever.getCacheStats();
      expect(stats.enabled).toBe(false);
      expect(stats.size).toBe(0);
    });

    it('should clear cache on reset', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);

      await retriever.loadAllShards();
      expect(retriever.getCacheStats().size).toBeGreaterThan(0);

      retriever.reset();
      expect(retriever.getCacheStats().size).toBe(0);
    });

    it('should clear cache with clearCache method', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);

      await retriever.loadAllShards();
      expect(retriever.getCacheStats().size).toBeGreaterThan(0);

      retriever.clearCache();
      expect(retriever.getCacheStats().size).toBe(0);
      expect(retriever.getCacheStats().hits).toBe(0);
      expect(retriever.getCacheStats().misses).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should provide shard stats', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.loadAllShards();

      const stats = retriever.getShardStats();

      expect(stats.totalShards).toBe(12);
      expect(stats.loadedShards).toBe(12);
      expect(stats.domains.length).toBe(12);
      expect(stats.lastRefresh).not.toBeNull();
      expect(stats.parseErrors.length).toBe(0);
    });

    it('should track parse errors in stats', async () => {
      governanceFlags.updateFlags({
        shardRetriever: {
          ...DEFAULT_SHARD_RETRIEVER_FLAGS,
          shardsPath: '/nonexistent/path',
        },
      });

      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.loadAllShards();

      const stats = retriever.getShardStats();
      expect(stats.parseErrors.length).toBeGreaterThan(0);
    });

    it('should provide cache stats', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      await retriever.loadAllShards();

      const stats = retriever.getCacheStats();

      expect(stats.enabled).toBe(true);
      expect(stats.size).toBe(12);
    });
  });

  describe('Feature Flag Integration', () => {
    it('should return empty results when disabled', async () => {
      governanceFlags.updateFlags({
        shardRetriever: {
          ...DEFAULT_SHARD_RETRIEVER_FLAGS,
          enabled: false,
        },
      });

      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);

      const shards = await retriever.loadAllShards();
      expect(shards.size).toBe(0);

      const shard = await retriever.loadShard('test-generation');
      expect(shard).toBeNull();

      const byIntent = await retriever.retrieveByIntent('test');
      expect(byIntent.length).toBe(0);
    });

    it('should respect global gate disable', async () => {
      governanceFlags.disableAllGates();

      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);

      const shards = await retriever.loadAllShards();
      expect(shards.size).toBe(0);
    });

    it('should use singleton instance', () => {
      expect(shardRetrieverIntegration).toBeDefined();
      expect(shardRetrieverIntegration).toBeInstanceOf(ShardRetrieverIntegration);
    });

    it('should use custom shards path from flags', async () => {
      governanceFlags.updateFlags({
        shardRetriever: {
          ...DEFAULT_SHARD_RETRIEVER_FLAGS,
          shardsPath: '.claude/guidance/shards', // Valid path
        },
      });

      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      const shards = await retriever.loadAllShards();

      expect(shards.size).toBe(12);
    });
  });

  describe('Error Handling', () => {
    it('should handle concurrent shard loads', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);

      const results = await Promise.all([
        retriever.loadShard('test-generation'),
        retriever.loadShard('security-compliance'),
        retriever.loadShard('coverage-analysis'),
        retriever.loadShard('test-generation'), // duplicate
      ]);

      expect(results[0]).not.toBeNull();
      expect(results[1]).not.toBeNull();
      expect(results[2]).not.toBeNull();
      expect(results[3]).not.toBeNull();
    });

    it('should initialize idempotently', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);

      await retriever.initialize();
      await retriever.initialize();
      await retriever.initialize();

      // Should still work correctly
      const shard = await retriever.loadShard('test-generation');
      expect(shard).not.toBeNull();
    });
  });

  describe('Domain Coverage', () => {
    const expectedDomains = [
      'test-generation',
      'test-execution',
      'coverage-analysis',
      'quality-assessment',
      'defect-intelligence',
      'requirements-validation',
      'code-intelligence',
      'security-compliance',
      'contract-testing',
      'visual-accessibility',
      'chaos-resilience',
      'learning-optimization',
    ];

    it('should load all 12 expected domain shards', async () => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      const shards = await retriever.loadAllShards();

      for (const domain of expectedDomains) {
        expect(shards.has(domain)).toBe(true);
      }
    });

    it.each(expectedDomains)('should parse %s shard with required fields', async (domain) => {
      const retriever = new ShardRetrieverIntegration(PROJECT_ROOT);
      const shard = await retriever.loadShard(domain);

      expect(shard).not.toBeNull();
      expect(shard!.domain).toBe(domain);
      expect(shard!.version).toBeTruthy();
      expect(shard!.rules.length).toBeGreaterThan(0);
      expect(Object.keys(shard!.thresholds).length).toBeGreaterThan(0);
      expect(shard!.agentConstraints.primary.length).toBeGreaterThan(0);
      expect(shard!.escalationTriggers.length).toBeGreaterThan(0);
    });
  });
});
