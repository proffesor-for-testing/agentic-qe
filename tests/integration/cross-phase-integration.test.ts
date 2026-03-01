/**
 * Cross-Phase Memory Integration Tests
 *
 * Verifies the full pipeline: hooks → memory → retrieval → injection
 * Now using UnifiedMemoryManager (SQLite) for storage.
 *
 * @module cross-phase-integration.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  CrossPhaseMemoryService,
  resetCrossPhaseMemory,
} from '../../src/memory/cross-phase-memory.js';
import {
  resetCrossPhaseHookExecutor,
} from '../../src/hooks/cross-phase-hooks.js';
import {
  handleCrossPhaseStore,
  handleCrossPhaseQuery,
  handleCrossPhaseStats,
  handleFormatSignals,
  resetCrossPhaseHandlers,
} from '../../src/mcp/handlers/cross-phase-handlers.js';
import {
  ProductionRiskSignal,
  TestHealthSignal,
  RiskWeight,
  FactorWeight,
  FlakyPattern,
} from '../../src/types/cross-phase-signals.js';
import {
  UnifiedMemoryManager,
  resetUnifiedMemory,
} from '../../src/kernel/unified-memory.js';

describe('Cross-Phase Memory Integration', () => {
  let tempDir: string;
  let memoryService: CrossPhaseMemoryService;
  let unifiedMemory: UnifiedMemoryManager;

  beforeEach(async () => {
    // Reset all singletons
    resetCrossPhaseMemory();
    resetCrossPhaseHookExecutor();
    resetCrossPhaseHandlers();
    resetUnifiedMemory();

    // Create temp directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'cross-phase-test-'));
    const dbPath = join(tempDir, 'test-memory.db');

    // Create UnifiedMemoryManager with temp database
    unifiedMemory = UnifiedMemoryManager.getInstance({ dbPath });
    await unifiedMemory.initialize();

    // Initialize memory service with the test memory manager
    memoryService = new CrossPhaseMemoryService({
      memoryManager: unifiedMemory,
    });
    await memoryService.initialize();
  });

  afterEach(() => {
    // Close and reset memory
    resetUnifiedMemory();
    resetCrossPhaseMemory();

    // Cleanup temp directory
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Memory Service', () => {
    it('stores and retrieves strategic (risk) signals', async () => {
      const riskWeights: RiskWeight[] = [
        {
          category: 'authentication',
          weight: 0.85,
          confidence: 0.9,
          evidence: {
            defectCount: 15,
            percentageOfTotal: 23.5,
            severityDistribution: { critical: 3, high: 7, medium: 5 },
            timeRange: { start: '2025-01-01', end: '2025-06-30' },
          },
        },
      ];

      const recommendations = {
        forRiskAssessor: ['Prioritize authentication testing', 'Add OAuth2 test scenarios'],
        forQualityCriteria: ['Require auth-specific AC for all auth stories'],
      };

      // Store signal
      const signal = await memoryService.storeRiskSignal(riskWeights, recommendations);

      expect(signal.id).toMatch(/^risk-signal-/);
      expect(signal.loopType).toBe('strategic');
      expect(signal.riskWeights).toEqual(riskWeights);

      // Retrieve signals
      const retrieved = await memoryService.queryRiskSignals();
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].id).toBe(signal.id);
    });

    it('stores and retrieves tactical (SFDIPOT) signals', async () => {
      const factorWeights: FactorWeight[] = [
        {
          factor: 'Interfaces',
          weight: 0.75,
          defectPercentage: 32.5,
          commonPatterns: ['API contract violations', 'Message format errors'],
        },
      ];

      const signal = await memoryService.storeSFDIPOTSignal(
        factorWeights,
        'payment-processing',
        { forProductFactorsAssessor: ['Focus on interface testing'] }
      );

      expect(signal.loopType).toBe('tactical');
      expect(signal.featureContext).toBe('payment-processing');

      // Query with feature context filter
      const filtered = await memoryService.querySFDIPOTSignals('payment');
      expect(filtered).toHaveLength(1);

      const unfiltered = await memoryService.querySFDIPOTSignals('user-auth');
      expect(unfiltered).toHaveLength(0);
    });

    it('stores and retrieves operational (test health) signals', async () => {
      const flakyPatterns: FlakyPattern[] = [
        {
          pattern: 'async timeout in E2E tests',
          frequency: 0.15,
          affectedTests: ['login.spec.ts', 'checkout.spec.ts'],
          rootCause: 'Network timing variability',
          fix: 'Add explicit waits with retry logic',
        },
      ];

      const signal = await memoryService.storeTestHealthSignal(
        flakyPatterns,
        [{ reason: 'coverage < 80%', percentage: 45.2, trend: 'stable' }],
        { forTestArchitect: ['Review E2E timing'], antiPatterns: ['hardcoded waits'] }
      );

      expect(signal.loopType).toBe('operational');

      const retrieved = await memoryService.queryTestHealthSignals();
      expect(retrieved[0].flakyPatterns[0].pattern).toBe('async timeout in E2E tests');
    });

    it('stores and retrieves quality-criteria (AC) signals', async () => {
      const signal = await memoryService.storeACQualitySignal(
        [{ acPattern: 'User should be able to...', problem: 'Not testable', frequency: 0.4, betterPattern: 'Given/When/Then' }],
        [{ codeArea: 'src/auth', coveragePercentage: 45, rootCause: 'No AC', acImprovement: 'Add BDD scenarios' }],
        { forRequirementsValidator: ['Flag vague AC'], acTemplates: { login: 'Given valid creds...' } }
      );

      expect(signal.loopType).toBe('quality-criteria');

      const retrieved = await memoryService.queryACQualitySignals();
      expect(retrieved).toHaveLength(1);
    });

    it('provides accurate statistics', async () => {
      // Store signals in different loops
      await memoryService.storeRiskSignal([], { forRiskAssessor: [], forQualityCriteria: [] });
      await memoryService.storeRiskSignal([], { forRiskAssessor: [], forQualityCriteria: [] });
      await memoryService.storeSFDIPOTSignal([], 'test', { forProductFactorsAssessor: [] });
      await memoryService.storeTestHealthSignal([], [], { forTestArchitect: [], antiPatterns: [] });

      const stats = await memoryService.getStats();

      expect(stats.totalSignals).toBe(4);
      expect(stats.byLoop.strategic).toBe(2);
      expect(stats.byLoop.tactical).toBe(1);
      expect(stats.byLoop.operational).toBe(1);
      expect(stats.oldestSignal).not.toBeNull();
      expect(stats.newestSignal).not.toBeNull();
    });

    it('stores data in SQLite via UnifiedMemoryManager', async () => {
      // Store a signal with dynamically generated dates
      const now = new Date();
      const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

      await memoryService.storeRiskSignal(
        [{
          category: 'test',
          weight: 0.5,
          confidence: 0.8,
          evidence: {
            defectCount: 1,
            percentageOfTotal: 10,
            severityDistribution: {},
            timeRange: {
              start: sixMonthsAgo.toISOString().slice(0, 7),
              end: now.toISOString().slice(0, 7)
            }
          }
        }],
        { forRiskAssessor: [], forQualityCriteria: [] }
      );

      // Verify it's stored in SQLite by checking database stats
      const dbStats = unifiedMemory.getStats();
      const kvStoreTable = dbStats.tables.find(t => t.name === 'kv_store');
      expect(kvStoreTable).toBeDefined();
      expect(kvStoreTable!.rowCount).toBeGreaterThan(0);
    });
  });

  describe('MCP Handlers', () => {
    // Note: MCP handlers use the global singleton, so we need to ensure
    // they're reset properly. For these tests, we use a fresh service.

    it('handles cross-phase store via MCP', async () => {
      const result = await handleCrossPhaseStore({
        loop: 'strategic',
        data: {
          riskWeights: [
            {
              category: 'security',
              weight: 0.9,
              confidence: 0.85,
              evidence: {
                defectCount: 10,
                percentageOfTotal: 15,
                severityDistribution: { critical: 5 },
                timeRange: { start: '2025-01', end: '2025-06' },
              },
            },
          ],
          recommendations: {
            forRiskAssessor: ['Test recommendation'],
            forQualityCriteria: [],
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.signalId).toMatch(/^risk-signal-/);
      expect(result.loop).toBe('strategic');
    });

    it('handles cross-phase query via MCP', async () => {
      // Store first
      await handleCrossPhaseStore({
        loop: 'operational',
        data: {
          flakyPatterns: [{ pattern: 'test-flaky', frequency: 0.1, affectedTests: [], rootCause: 'timing', fix: 'retry' }],
          gateFailures: [],
          recommendations: { forTestArchitect: [], antiPatterns: [] },
        },
      });

      // Query
      const result = await handleCrossPhaseQuery({
        loop: 'operational',
      });

      expect(result.success).toBe(true);
      expect(result.count).toBeGreaterThanOrEqual(1);
      expect(result.signals[0].loopType).toBe('operational');
    });

    it('handles cross-phase stats via MCP', async () => {
      await handleCrossPhaseStore({
        loop: 'tactical',
        data: {
          factorWeights: [],
          featureContext: 'test-feature',
          recommendations: { forProductFactorsAssessor: [] },
        },
      });

      const result = await handleCrossPhaseStats();

      expect(result.success).toBe(true);
      expect(result.stats.totalSignals).toBeGreaterThanOrEqual(1);
    });

    it('formats signals for agent prompt injection', async () => {
      // Store a signal
      await handleCrossPhaseStore({
        loop: 'strategic',
        data: {
          riskWeights: [],
          recommendations: {
            forRiskAssessor: ['Test auth thoroughly'],
            forQualityCriteria: ['Add security AC'],
          },
        },
      });

      // Query it back
      const queryResult = await handleCrossPhaseQuery({ loop: 'strategic' });

      // Format for injection
      const formatResult = await handleFormatSignals({
        signals: queryResult.signals,
      });

      expect(formatResult.success).toBe(true);
      expect(formatResult.formatted).toContain('CROSS-PHASE LEARNING SIGNALS');
      expect(formatResult.formatted).toContain('strategic');
    });
  });

  describe('Full Pipeline Integration', () => {
    it('completes strategic feedback loop: Production → Ideation', async () => {
      // Step 1: Production agent (qe-defect-predictor) stores risk weights
      const storeResult = await handleCrossPhaseStore({
        loop: 'strategic',
        data: {
          riskWeights: [
            {
              category: 'payment-processing',
              weight: 0.88,
              confidence: 0.92,
              evidence: {
                defectCount: 23,
                percentageOfTotal: 34.5,
                severityDistribution: { critical: 8, high: 10, medium: 5 },
                timeRange: { start: '2025-01-01', end: '2025-06-30' },
              },
            },
          ],
          recommendations: {
            forRiskAssessor: [
              'Payment flows have 34.5% of production defects',
              'Prioritize payment testing in risk assessments',
            ],
            forQualityCriteria: [
              'Require payment-specific acceptance criteria',
              'Add currency edge case testing',
            ],
          },
        },
      });

      expect(storeResult.success).toBe(true);

      // Step 2: Ideation phase starts, retrieves signals
      const queryResult = await handleCrossPhaseQuery({
        loop: 'strategic',
        maxAge: '90d',
      });

      expect(queryResult.count).toBeGreaterThanOrEqual(1);
      const signal = queryResult.signals[0] as ProductionRiskSignal;
      expect(signal.recommendations.forRiskAssessor).toContain(
        'Payment flows have 34.5% of production defects'
      );

      // Step 3: Format for agent injection
      const formatted = await handleFormatSignals({ signals: queryResult.signals });
      expect(formatted.formatted).toContain('Payment flows have 34.5% of production defects');
    });

    it('completes operational feedback loop: CI/CD → Development', async () => {
      // Step 1: Quality gate stores flaky test patterns
      await handleCrossPhaseStore({
        loop: 'operational',
        data: {
          flakyPatterns: [
            {
              pattern: 'database connection race condition',
              frequency: 0.23,
              affectedTests: ['user-service.test.ts', 'order-service.test.ts'],
              rootCause: 'Shared DB state between tests',
              fix: 'Use test isolation with transactions',
            },
          ],
          gateFailures: [
            { reason: 'flaky tests > 5%', percentage: 8.5, trend: 'increasing' },
          ],
          recommendations: {
            forTestArchitect: [
              'Implement test isolation pattern',
              'Use database transactions for cleanup',
            ],
            antiPatterns: [
              'Avoid shared mutable state',
              'Never use sleep() for timing',
            ],
          },
        },
      });

      // Step 2: Development phase retrieves
      const queryResult = await handleCrossPhaseQuery({
        loop: 'operational',
        maxAge: '30d',
      });

      expect(queryResult.count).toBeGreaterThanOrEqual(1);
      const signal = queryResult.signals[0] as TestHealthSignal;
      expect(signal.flakyPatterns[0].fix).toContain('transactions');
    });
  });
});
