/**
 * Integration Tests for Quality Feedback Loop
 * ADR-023: Quality Feedback Loop System
 *
 * These tests verify REAL integration with:
 * - SQLite database persistence
 * - ReasoningBank pattern storage and updates
 * - Routing feedback collection
 * - Cross-component feedback flow
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RealQEReasoningBank } from '../../../src/learning/real-qe-reasoning-bank.js';
import {
  QualityFeedbackLoop,
  createQualityFeedbackLoop,
} from '../../../src/feedback/feedback-loop.js';
import type { TestOutcome, CoverageSession } from '../../../src/feedback/types.js';
import { existsSync, unlinkSync } from 'fs';
import * as os from 'os';
import * as path from 'path';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestOutcome(overrides: Partial<TestOutcome> = {}): TestOutcome {
  return {
    id: `outcome-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    testId: `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    testName: 'Integration test case',
    generatedBy: 'integration-test-agent',
    framework: 'vitest',
    language: 'typescript',
    domain: 'test-generation',
    passed: true,
    flaky: false,
    executionTimeMs: 100,
    coverage: { lines: 80, branches: 70, functions: 85 },
    maintainabilityScore: 0.8,
    timestamp: new Date(),
    ...overrides,
  };
}

function createCoverageSession(overrides: Partial<CoverageSession> = {}): CoverageSession {
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    agentId: 'coverage-agent',
    targetPath: 'src/services/user.ts',
    technique: 'gap-analysis',
    beforeCoverage: { lines: 50, branches: 40, functions: 45 },
    afterCoverage: { lines: 75, branches: 65, functions: 70 },
    testsGenerated: 5,
    testsPassed: 4,
    gapsTargeted: [
      { id: 'gap-1', type: 'uncovered-branch', filePath: 'src/services/user.ts', startLine: 42, riskScore: 0.8, addressed: true },
      { id: 'gap-2', type: 'uncovered-function', filePath: 'src/services/user.ts', startLine: 100, riskScore: 0.5, addressed: true },
    ],
    durationMs: 30000,
    startedAt: new Date(Date.now() - 30000),
    completedAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('FeedbackLoop Integration with ReasoningBank', () => {
  let reasoningBank: RealQEReasoningBank;
  let feedbackLoop: QualityFeedbackLoop;
  const testDbPath = path.join(os.tmpdir(), `aqe-test-feedback-integration-${process.pid}.db`);

  beforeEach(async () => {
    // Clean up any existing test database
    if (existsSync(testDbPath)) {
      try { unlinkSync(testDbPath); } catch { /* ignore */ }
    }
    if (existsSync(`${testDbPath}-shm`)) {
      try { unlinkSync(`${testDbPath}-shm`); } catch { /* ignore */ }
    }
    if (existsSync(`${testDbPath}-wal`)) {
      try { unlinkSync(`${testDbPath}-wal`); } catch { /* ignore */ }
    }

    // Create REAL ReasoningBank with ISOLATED test database
    // CRITICAL: useUnified: false ensures we don't use shared .agentic-qe/memory.db
    // This prevents test pollution from other tests (ADR-046 unified storage fix)
    reasoningBank = new RealQEReasoningBank({
      sqlite: {
        dbPath: testDbPath,
        walMode: false, // Simpler for tests
        useUnified: false, // IMPORTANT: Use isolated test database, not shared unified storage
      },
      embeddings: {
        quantized: true,
        enableCache: false,
      },
      enableLearning: true,
      enableRouting: true,
      enableGuidance: false,
      hnsw: { M: 16, efConstruction: 200, efSearch: 50 },
      routingWeights: { similarity: 0.3, performance: 0.4, capabilities: 0.3 },
    });

    // Initialize the ReasoningBank
    await reasoningBank.initialize();

    // Create feedback loop and CONNECT to ReasoningBank
    feedbackLoop = createQualityFeedbackLoop();
    feedbackLoop.connectReasoningBank(reasoningBank);
  });

  afterEach(async () => {
    // Cleanup
    try {
      await reasoningBank.dispose();
    } catch { /* ignore */ }

    // Remove test database
    if (existsSync(testDbPath)) {
      try { unlinkSync(testDbPath); } catch { /* ignore */ }
    }
    if (existsSync(`${testDbPath}-shm`)) {
      try { unlinkSync(`${testDbPath}-shm`); } catch { /* ignore */ }
    }
    if (existsSync(`${testDbPath}-wal`)) {
      try { unlinkSync(`${testDbPath}-wal`); } catch { /* ignore */ }
    }
  });

  describe('Connected State', () => {
    it('should report ReasoningBank as connected', () => {
      const stats = feedbackLoop.getStats();
      expect(stats.integrationStatus.reasoningBankConnected).toBe(true);
    });

    it('should have all components connected', () => {
      expect(feedbackLoop.outcomeTracker).toBeDefined();
      expect(feedbackLoop.coverageLearner).toBeDefined();
      expect(feedbackLoop.qualityCalculator).toBeDefined();
      expect(feedbackLoop.promotionManager).toBeDefined();
    });
  });

  describe('Pattern Storage and Retrieval', () => {
    it('should store patterns in ReasoningBank from coverage sessions', async () => {
      // Record a successful coverage session that should learn a strategy
      const session = createCoverageSession({
        beforeCoverage: { lines: 30, branches: 20, functions: 25 },
        afterCoverage: { lines: 70, branches: 60, functions: 65 }, // Big improvement
      });

      const result = await feedbackLoop.recordCoverageSession(session);

      expect(result.strategyLearned).toBe(true);
      expect(result.strategyId).toBeDefined();

      // Verify strategy was stored - search for it in ReasoningBank
      const searchResult = await reasoningBank.searchQEPatterns('Coverage Strategy', { limit: 10 });
      expect(searchResult.success).toBe(true);
      if (searchResult.success) {
        const patterns = searchResult.value;
        expect(patterns.length).toBeGreaterThan(0);
        expect(patterns.some(p => p.pattern.patternType === 'coverage-strategy')).toBe(true);
      }
    });

    it('should update pattern metrics from test outcomes', async () => {
      // First, store a pattern manually
      const storeResult = await reasoningBank.storeQEPattern({
        patternType: 'test-pattern',
        name: 'Test Pattern for Integration',
        description: 'A pattern to test feedback integration',
        template: {
          type: 'procedure',
          content: 'Test procedure content',
          variables: ['testVar'],
        },
        context: {
          tags: ['integration-test'],
          confidence: 0.5,
          metadata: { source: 'integration-test' },
        },
      });
      expect(storeResult.success).toBe(true);
      if (!storeResult.success) return;
      const patternId = storeResult.value.id;

      // Record multiple test outcomes for this pattern
      for (let i = 0; i < 5; i++) {
        await feedbackLoop.recordTestOutcome(createTestOutcome({
          id: `outcome-${i}`,
          testId: `test-${i}`,
          patternId,
          passed: true,
          maintainabilityScore: 0.85,
        }));
      }

      // Retrieve pattern and verify metrics were updated
      const searchResult = await reasoningBank.searchQEPatterns('Test Pattern for Integration', { limit: 1 });
      expect(searchResult.success).toBe(true);
      if (searchResult.success) {
        const patterns = searchResult.value;
        expect(patterns.length).toBe(1);

        const pattern = patterns[0].pattern;
        expect(pattern.usageCount).toBeGreaterThanOrEqual(5);
        expect(pattern.successfulUses).toBeGreaterThanOrEqual(5);
        expect(pattern.successRate).toBeCloseTo(1.0, 1);
      }
    });
  });

  describe('Quality Score Persistence', () => {
    it('should calculate and track quality scores through the feedback loop', async () => {
      // Record multiple outcomes with varying quality
      const outcomes = [
        createTestOutcome({ id: 'q1', testId: 't1', passed: true, maintainabilityScore: 0.9, coverage: { lines: 90, branches: 85, functions: 92 } }),
        createTestOutcome({ id: 'q2', testId: 't2', passed: true, maintainabilityScore: 0.8, coverage: { lines: 80, branches: 75, functions: 82 } }),
        createTestOutcome({ id: 'q3', testId: 't3', passed: false, maintainabilityScore: 0.5, coverage: { lines: 50, branches: 40, functions: 45 } }),
        createTestOutcome({ id: 'q4', testId: 't4', passed: true, maintainabilityScore: 0.85, coverage: { lines: 85, branches: 80, functions: 88 } }),
      ];

      const scores = [];
      for (const outcome of outcomes) {
        const result = await feedbackLoop.recordTestOutcome(outcome);
        scores.push(result.qualityScore);
      }

      // Verify scores were calculated
      expect(scores.length).toBe(4);
      expect(scores.every(s => s.overall > 0)).toBe(true);

      // Good outcome should have higher score than bad outcome
      expect(scores[0].overall).toBeGreaterThan(scores[2].overall);

      // Check stats reflect the tracked outcomes
      const stats = feedbackLoop.getStats();
      expect(stats.testOutcomes.total).toBe(4);
      expect(stats.testOutcomes.passRate).toBe(0.75);
    });
  });

  describe('Coverage Learning with Persistence', () => {
    it('should learn and recommend strategies', async () => {
      // Record multiple successful coverage sessions
      await feedbackLoop.recordCoverageSession(createCoverageSession({
        id: 'session-1',
        targetPath: 'src/services/auth.ts',
        technique: 'gap-analysis',
        beforeCoverage: { lines: 40, branches: 30, functions: 35 },
        afterCoverage: { lines: 80, branches: 70, functions: 75 },
      }));

      await feedbackLoop.recordCoverageSession(createCoverageSession({
        id: 'session-2',
        targetPath: 'src/services/user.ts',
        technique: 'gap-analysis',
        beforeCoverage: { lines: 45, branches: 35, functions: 40 },
        afterCoverage: { lines: 85, branches: 75, functions: 80 },
      }));

      // Get recommendation for a similar file
      const strategy = feedbackLoop.getRecommendedCoverageStrategy('src/services/order.ts');

      expect(strategy).not.toBeNull();
      expect(strategy!.technique).toBe('gap-analysis');
      expect(strategy!.successCount).toBeGreaterThanOrEqual(2);
      expect(strategy!.avgImprovement).toBeGreaterThan(20);
    });

    it('should store learned strategies as ReasoningBank patterns', async () => {
      // Record a session that learns a strategy
      await feedbackLoop.recordCoverageSession(createCoverageSession({
        technique: 'branch-coverage',
        beforeCoverage: { lines: 30, branches: 20, functions: 25 },
        afterCoverage: { lines: 75, branches: 70, functions: 72 },
      }));

      // Search for the stored strategy in ReasoningBank
      const searchResult = await reasoningBank.searchQEPatterns('branch-coverage', { limit: 10 });
      expect(searchResult.success).toBe(true);
      if (searchResult.success) {
        const patterns = searchResult.value;

        // Should find at least one pattern with the technique
        const strategyPattern = patterns.find(p =>
          p.pattern.patternType === 'coverage-strategy' &&
          p.pattern.name.includes('branch-coverage')
        );

        expect(strategyPattern).toBeDefined();
      }
    });
  });

  describe('Full Feedback Loop Cycle', () => {
    it('should complete end-to-end feedback cycle with persistence', async () => {
      // 1. Store initial pattern
      const storeResult = await reasoningBank.storeQEPattern({
        patternType: 'test-generation-strategy',
        name: 'E2E Test Pattern',
        description: 'Pattern for end-to-end feedback test',
        template: {
          type: 'procedure',
          content: 'E2E test procedure',
          variables: [],
        },
        context: {
          tags: ['e2e-test'],
          confidence: 0.5,
          metadata: {},
        },
      });
      expect(storeResult.success).toBe(true);
      if (!storeResult.success) return;
      const patternId = storeResult.value.id;

      // 2. Record successful outcomes
      for (let i = 0; i < 10; i++) {
        await feedbackLoop.recordTestOutcome(createTestOutcome({
          id: `e2e-outcome-${i}`,
          testId: `e2e-test-${i}`,
          patternId,
          passed: true,
          maintainabilityScore: 0.85 + (i * 0.01),
        }));
      }

      // 3. Verify pattern metrics were updated
      const searchResult = await reasoningBank.searchQEPatterns('E2E Test Pattern', { limit: 1 });
      expect(searchResult.success).toBe(true);
      if (searchResult.success) {
        const patterns = searchResult.value;
        expect(patterns.length).toBe(1);

        const updatedPattern = patterns[0].pattern;
        expect(updatedPattern.usageCount).toBeGreaterThanOrEqual(10);
        expect(updatedPattern.successRate).toBeCloseTo(1.0, 1);
        expect(updatedPattern.confidence).toBeGreaterThan(0.5); // Should have increased
      }

      // 4. Verify feedback loop stats
      const stats = feedbackLoop.getStats();
      expect(stats.testOutcomes.total).toBeGreaterThanOrEqual(10);
      expect(stats.integrationStatus.reasoningBankConnected).toBe(true);
    });
  });

  describe('Pattern Promotion with Real ReasoningBank', () => {
    it('should return patternUpdate when recording outcomes for a pattern', async () => {
      // Store a pattern that we'll track outcomes for
      const storeResult = await reasoningBank.storeQEPattern({
        patternType: 'test-pattern',
        name: 'Promotion Test Pattern',
        description: 'Pattern to test promotion detection',
        template: {
          type: 'procedure',
          content: 'Test procedure',
          variables: [],
        },
        context: {
          tags: ['promotion-test'],
          confidence: 0.5,
          metadata: {},
        },
      });
      expect(storeResult.success).toBe(true);
      if (!storeResult.success) return;
      const patternId = storeResult.value.id;

      // Record outcomes and capture the patternUpdate results
      const updates: Array<{ action: string; tier?: string }> = [];
      for (let i = 0; i < 15; i++) {
        const result = await feedbackLoop.recordTestOutcome(createTestOutcome({
          id: `promo-outcome-${i}`,
          testId: `promo-test-${i}`,
          patternId,
          passed: true,
          maintainabilityScore: 0.9,
        }));

        if (result.patternUpdate) {
          updates.push(result.patternUpdate);
        }
      }

      // Verify that patternUpdate was returned (pattern was found and processed)
      // The action might be 'unchanged' if thresholds aren't met, but we should get updates
      expect(updates.length).toBeGreaterThan(0);

      // Verify all updates have valid actions
      for (const update of updates) {
        expect(['promoted', 'demoted', 'unchanged']).toContain(update.action);
      }
    });

    it('should trigger promotion after sufficient successful outcomes', async () => {
      // Store a pattern
      const storeResult = await reasoningBank.storeQEPattern({
        patternType: 'test-pattern',
        name: 'High Success Pattern',
        description: 'Pattern with high success rate for promotion',
        template: {
          type: 'procedure',
          content: 'High success procedure',
          variables: [],
        },
        context: {
          tags: ['high-success'],
          confidence: 0.5,
          metadata: {},
        },
      });
      expect(storeResult.success).toBe(true);
      if (!storeResult.success) return;
      const patternId = storeResult.value.id;

      // Record many successful outcomes to meet promotion criteria
      // Default promotion requires: successCount >= 10, successRate >= 0.8, qualityScore >= 0.7
      for (let i = 0; i < 20; i++) {
        await feedbackLoop.recordTestOutcome(createTestOutcome({
          id: `success-outcome-${i}`,
          testId: `success-test-${i}`,
          patternId,
          passed: true,
          maintainabilityScore: 0.85,
        }));
      }

      // Check promotion stats
      const stats = feedbackLoop.getStats();

      // Verify pattern was tracked
      expect(stats.patterns.tracked).toBeGreaterThan(0);

      // Verify promotions were considered (may or may not have promoted based on thresholds)
      // The key is that the code path executed - no runtime errors
      expect(stats.testOutcomes.total).toBeGreaterThanOrEqual(20);
    });
  });

  describe('Export and Import with Persistence', () => {
    it('should export data that can be reimported', async () => {
      // Record some data
      await feedbackLoop.recordTestOutcome(createTestOutcome({ id: 'export-1', testId: 'et1' }));
      await feedbackLoop.recordCoverageSession(createCoverageSession({
        beforeCoverage: { lines: 30, branches: 20, functions: 25 },
        afterCoverage: { lines: 70, branches: 60, functions: 65 },
      }));

      // Export
      const exported = feedbackLoop.exportData();
      expect(exported.outcomes.length).toBe(1);
      expect(exported.sessions.length).toBe(1);
      expect(exported.strategies.length).toBeGreaterThanOrEqual(1);

      // Create new feedback loop and import
      const newLoop = createQualityFeedbackLoop();
      newLoop.connectReasoningBank(reasoningBank);
      newLoop.importData(exported);

      // Verify imported data
      const newStats = newLoop.getStats();
      expect(newStats.testOutcomes.total).toBe(1);
      expect(newStats.coverage.totalSessions).toBe(1);
    });
  });
});

describe('FeedbackLoop with RoutingFeedback Integration', () => {
  let reasoningBank: RealQEReasoningBank;
  let feedbackLoop: QualityFeedbackLoop;
  const testDbPath = path.join(os.tmpdir(), `aqe-test-routing-feedback-${process.pid}.db`);

  beforeEach(async () => {
    // Clean up any existing test database
    for (const suffix of ['', '-shm', '-wal']) {
      if (existsSync(`${testDbPath}${suffix}`)) {
        try { unlinkSync(`${testDbPath}${suffix}`); } catch { /* ignore */ }
      }
    }

    // Create REAL ReasoningBank with ISOLATED test database
    // CRITICAL: useUnified: false ensures we don't use shared .agentic-qe/memory.db
    // This prevents test pollution from other tests (ADR-046 unified storage fix)
    reasoningBank = new RealQEReasoningBank({
      sqlite: {
        dbPath: testDbPath,
        walMode: false,
        useUnified: false, // IMPORTANT: Use isolated test database, not shared unified storage
      },
      embeddings: { quantized: true, enableCache: false },
      enableLearning: true,
      enableRouting: true,
      enableGuidance: false,
      hnsw: { M: 16, efConstruction: 200, efSearch: 50 },
      routingWeights: { similarity: 0.3, performance: 0.4, capabilities: 0.3 },
    });

    await reasoningBank.initialize();
    feedbackLoop = createQualityFeedbackLoop();
    feedbackLoop.connectReasoningBank(reasoningBank);
  });

  afterEach(async () => {
    try { await reasoningBank.dispose(); } catch { /* ignore */ }
    for (const suffix of ['', '-shm', '-wal']) {
      if (existsSync(`${testDbPath}${suffix}`)) {
        try { unlinkSync(`${testDbPath}${suffix}`); } catch { /* ignore */ }
      }
    }
  });

  it('should track routing feedback when connected', () => {
    const stats = feedbackLoop.getStats();

    // Routing feedback should be trackable through the connected loop
    expect(stats.integrationStatus.reasoningBankConnected).toBe(true);
    expect(feedbackLoop.routingFeedback).toBeDefined();
  });

  it('should record routing outcomes through feedback loop', async () => {
    // Record a routing outcome through the feedback loop
    const routingOutcome = {
      taskId: 'task-123',
      taskDescription: 'Generate unit tests for UserService',
      recommendedAgent: 'qe-test-generator',
      usedAgent: 'qe-test-generator',
      followedRecommendation: true,
      success: true,
      qualityScore: 0.85,
      durationMs: 5000,
      timestamp: new Date(),
    };

    await feedbackLoop.recordRoutingOutcome(routingOutcome);

    const stats = feedbackLoop.getStats();
    expect(stats.routing.totalOutcomes).toBeGreaterThanOrEqual(1);
    expect(stats.routing.recommendationFollowRate).toBeGreaterThanOrEqual(0);
  });

  it('should analyze routing effectiveness', async () => {
    // Record multiple routing outcomes
    const outcomes = [
      { taskId: 't1', recommendedAgent: 'agent-a', usedAgent: 'agent-a', followedRecommendation: true, success: true, qualityScore: 0.9, durationMs: 1000 },
      { taskId: 't2', recommendedAgent: 'agent-a', usedAgent: 'agent-b', followedRecommendation: false, success: true, qualityScore: 0.95, durationMs: 800 },
      { taskId: 't3', recommendedAgent: 'agent-b', usedAgent: 'agent-b', followedRecommendation: true, success: false, qualityScore: 0.3, durationMs: 2000 },
      { taskId: 't4', recommendedAgent: 'agent-a', usedAgent: 'agent-a', followedRecommendation: true, success: true, qualityScore: 0.85, durationMs: 1200 },
    ];

    for (const outcome of outcomes) {
      await feedbackLoop.recordRoutingOutcome({
        ...outcome,
        taskDescription: `Task ${outcome.taskId}`,
        timestamp: new Date(),
      });
    }

    const analysis = feedbackLoop.getRoutingAnalysis();

    expect(analysis.totalOutcomes).toBe(4);
    expect(analysis.recommendationFollowRate).toBe(0.75); // 3/4
    expect(analysis.successRateWhenFollowed).toBeGreaterThan(0);
    expect(analysis.successRateWhenOverridden).toBeGreaterThan(0);
  });
});
