/**
 * Advanced CLI Commands Test Suite
 *
 * Comprehensive tests for 15 advanced CLI commands with real implementations
 */

import { Database } from '@utils/Database';
import { MemoryManager } from '@core/MemoryManager';
import { FleetManager } from '@core/FleetManager';
import { Logger } from '@utils/Logger';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';

// Command imports
import { compact } from '@cli/commands/memory/compact';
import { vacuum } from '@cli/commands/memory/vacuum';
import { stats } from '@cli/commands/memory/stats';
import { optimize } from '@cli/commands/fleet/optimize';
import { backup } from '@cli/commands/fleet/backup';
import { recover } from '@cli/commands/fleet/recover';
import { clone } from '@cli/commands/agent/clone';
import { migrate } from '@cli/commands/agent/migrate';
import { benchmark } from '@cli/commands/agent/benchmark';
import { analyzeFailures } from '@cli/commands/test/analyze-failures';
import { flakiness } from '@cli/commands/test/flakiness';
import { mutate } from '@cli/commands/test/mutate';
import { trends } from '@cli/commands/quality/trends';
import { compare } from '@cli/commands/quality/compare';
import { baseline } from '@cli/commands/quality/baseline';

const TEST_DATA_DIR = join(__dirname, '../data/cli-advanced');
const TEST_DB_PATH = join(TEST_DATA_DIR, 'test-advanced.db');

describe('Advanced CLI Commands', () => {
  let database: Database;
  let memoryManager: MemoryManager;
  let fleetManager: FleetManager;

  beforeAll(async () => {
    // Setup test directory
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DATA_DIR, { recursive: true });
  });

  beforeEach(async () => {
    // Initialize database
    database = new Database(TEST_DB_PATH);
    await database.initialize();

    // Create memory_store table for MemoryManager
    await database.exec(`
      CREATE TABLE IF NOT EXISTS memory_store (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        namespace TEXT NOT NULL,
        ttl INTEGER,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
      )
    `);

    // Initialize memory manager
    memoryManager = new MemoryManager(database);
    await memoryManager.initialize();

    // Initialize fleet manager
    const config = {
      agents: [
        { type: 'test-generator', count: 2, config: {} },
        { type: 'test-executor', count: 2, config: {} }
      ],
      database: TEST_DB_PATH
    };
    fleetManager = new FleetManager(config);
    await fleetManager.initialize();
  });

  afterEach(async () => {
    await fleetManager?.stop();
    await memoryManager?.shutdown();
    await database?.close();
  });

  afterAll(() => {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  // MEMORY COMMANDS TESTS (12 tests)
  describe('Memory Commands', () => {
    describe('aqe memory compact', () => {
      it('should compact database and reclaim space', async () => {
        // Add test data
        for (let i = 0; i < 100; i++) {
          await memoryManager.store(`key-${i}`, { data: `value-${i}` }, { persist: true });
        }

        // Delete half of them
        for (let i = 0; i < 50; i++) {
          await memoryManager.delete(`key-${i}`);
        }

        const result = await compact({ database });

        expect(result.success).toBe(true);
        expect(result.sizeBeforeMB).toBeGreaterThan(0);
        expect(result.sizeAfterMB).toBeGreaterThan(0);
        expect(result.sizeBeforeMB).toBeGreaterThanOrEqual(result.sizeAfterMB);
        expect(result.spaceReclaimed).toBeGreaterThanOrEqual(0);
      });

      it('should handle empty database gracefully', async () => {
        const result = await compact({ database });

        expect(result.success).toBe(true);
        expect(result.sizeBeforeMB).toBeGreaterThanOrEqual(0);
      });

      it('should report detailed statistics', async () => {
        await memoryManager.store('test', { data: 'value' }, { persist: true });

        const result = await compact({ database });

        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('sizeBeforeMB');
        expect(result).toHaveProperty('sizeAfterMB');
        expect(result).toHaveProperty('spaceReclaimed');
        expect(result).toHaveProperty('duration');
      });

      it('should handle database errors gracefully', async () => {
        await database.close();

        const result = await compact({ database });

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    describe('aqe memory vacuum', () => {
      it('should vacuum database and optimize performance', async () => {
        // Create fragmentation by adding and deleting data
        for (let i = 0; i < 200; i++) {
          await memoryManager.store(`key-${i}`, { data: `value-${i}` }, { persist: true });
        }

        for (let i = 0; i < 150; i++) {
          await memoryManager.delete(`key-${i}`);
        }

        const result = await vacuum({ database });

        expect(result.success).toBe(true);
        expect(result.sizeBeforeMB).toBeGreaterThan(0);
        expect(result.sizeAfterMB).toBeGreaterThan(0);
        expect(result.pagesBefore).toBeGreaterThan(0);
        expect(result.pagesAfter).toBeGreaterThan(0);
      });

      it('should rebuild indexes during vacuum', async () => {
        await memoryManager.store('test1', 'value1', { persist: true });
        await memoryManager.store('test2', 'value2', { persist: true });

        const result = await vacuum({ database });

        expect(result.success).toBe(true);
        expect(result.indexesRebuilt).toBeGreaterThan(0);
      });

      it('should analyze database statistics', async () => {
        const result = await vacuum({ database, analyze: true });

        expect(result.success).toBe(true);
        expect(result.analyzed).toBe(true);
      });

      it('should respect vacuum mode (full vs incremental)', async () => {
        const resultFull = await vacuum({ database, mode: 'full' });
        expect(resultFull.mode).toBe('full');

        const resultIncremental = await vacuum({ database, mode: 'incremental' });
        expect(resultIncremental.mode).toBe('incremental');
      });
    });

    describe('aqe memory stats', () => {
      it('should display comprehensive memory statistics', async () => {
        await memoryManager.store('key1', 'value1', { namespace: 'test' });
        await memoryManager.store('key2', 'value2', { namespace: 'test' });
        await memoryManager.store('key3', 'value3', { namespace: 'prod', persist: true });

        const result = await stats({ memoryManager, database });

        expect(result.totalKeys).toBeGreaterThan(0);
        expect(result.totalSizeMB).toBeGreaterThan(0);
        expect(result.namespaces).toBeInstanceOf(Array);
        expect(result.namespaces.length).toBeGreaterThan(0);
      });

      it('should show namespace breakdown', async () => {
        await memoryManager.store('key1', 'value1', { namespace: 'ns1' });
        await memoryManager.store('key2', 'value2', { namespace: 'ns2' });

        const result = await stats({ memoryManager, database });

        expect(result.byNamespace).toBeDefined();
        expect(Object.keys(result.byNamespace).length).toBeGreaterThan(0);
      });

      it('should report memory vs disk storage', async () => {
        await memoryManager.store('mem-only', 'value1');
        await memoryManager.store('disk-too', 'value2', { persist: true });

        const result = await stats({ memoryManager, database });

        expect(result.memoryKeys).toBeGreaterThan(0);
        expect(result.diskKeys).toBeGreaterThan(0);
      });

      it('should calculate expiration statistics', async () => {
        await memoryManager.store('short-ttl', 'value', { ttl: 100 });
        await memoryManager.store('long-ttl', 'value', { ttl: 10000 });

        const result = await stats({ memoryManager, database });

        expect(result.expiringKeys).toBeGreaterThanOrEqual(0);
        expect(result.persistentKeys).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // FLEET COMMANDS TESTS (12 tests)
  describe('Fleet Commands', () => {
    describe('aqe fleet optimize', () => {
      it('should optimize fleet topology based on workload', async () => {
        const result = await optimize({ fleetManager });

        expect(result.success).toBe(true);
        expect(result.optimizations).toBeDefined();
        expect(result.currentTopology).toBeDefined();
        expect(result.recommendedTopology).toBeDefined();
      });

      it('should analyze agent workload distribution', async () => {
        const result = await optimize({ fleetManager });

        expect(result.workloadAnalysis).toBeDefined();
        expect(result.workloadAnalysis.totalAgents).toBeGreaterThan(0);
      });

      it('should suggest agent rebalancing', async () => {
        const result = await optimize({ fleetManager });

        expect(result.rebalanceNeeded).toBeDefined();
        if (result.rebalanceNeeded) {
          expect(result.rebalanceSuggestions).toBeDefined();
        }
      });

      it('should apply optimizations when auto-apply enabled', async () => {
        const result = await optimize({ fleetManager, autoApply: true });

        expect(result.success).toBe(true);
        expect(result.applied).toBe(true);
      });
    });

    describe('aqe fleet backup', () => {
      it('should create complete fleet state backup', async () => {
        const backupPath = join(TEST_DATA_DIR, 'fleet-backup.json');
        const result = await backup({ fleetManager, database, output: backupPath });

        expect(result.success).toBe(true);
        expect(result.backupPath).toBe(backupPath);
        expect(existsSync(backupPath)).toBe(true);
      });

      it('should backup fleet configuration', async () => {
        const backupPath = join(TEST_DATA_DIR, 'config-backup.json');
        const result = await backup({ fleetManager, database, output: backupPath });

        expect(result.backup.config).toBeDefined();
      });

      it('should backup all agent states', async () => {
        const backupPath = join(TEST_DATA_DIR, 'agents-backup.json');
        const result = await backup({ fleetManager, database, output: backupPath });

        expect(result.backup.agents).toBeDefined();
        expect(result.backup.agents.length).toBeGreaterThan(0);
      });

      it('should compress backup when requested', async () => {
        const backupPath = join(TEST_DATA_DIR, 'compressed.json.gz');
        const result = await backup({
          fleetManager,
          database,
          output: backupPath,
          compress: true
        });

        expect(result.success).toBe(true);
        expect(result.compressed).toBe(true);
      });
    });

    describe('aqe fleet recover', () => {
      it('should recover fleet from backup', async () => {
        // Create backup first
        const backupPath = join(TEST_DATA_DIR, 'recovery-backup.json');
        await backup({ fleetManager, database, output: backupPath });

        // Recover
        const result = await recover({
          fleetManager,
          database,
          backupPath
        });

        expect(result.success).toBe(true);
        expect(result.agentsRecovered).toBeGreaterThan(0);
      });

      it('should validate backup before recovery', async () => {
        const invalidPath = join(TEST_DATA_DIR, 'invalid.json');
        const result = await recover({
          fleetManager,
          database,
          backupPath: invalidPath
        });

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should restore agent configurations', async () => {
        const backupPath = join(TEST_DATA_DIR, 'config-recovery.json');
        await backup({ fleetManager, database, output: backupPath });

        const result = await recover({ fleetManager, database, backupPath });

        expect(result.configRestored).toBe(true);
      });

      it('should handle partial recovery gracefully', async () => {
        const backupPath = join(TEST_DATA_DIR, 'partial-backup.json');
        await backup({ fleetManager, database, output: backupPath });

        const result = await recover({
          fleetManager,
          database,
          backupPath,
          partial: true
        });

        expect(result.success).toBe(true);
        expect(result.warnings).toBeDefined();
      });
    });
  });

  // AGENT COMMANDS TESTS (12 tests)
  describe('Agent Commands', () => {
    describe('aqe agent clone', () => {
      it('should clone agent configuration', async () => {
        const agents = fleetManager.getAllAgents();
        const sourceAgent = agents[0];

        const result = await clone({
          fleetManager,
          sourceAgentId: sourceAgent.getId(),
          name: 'cloned-agent'
        });

        expect(result.success).toBe(true);
        expect(result.newAgentId).toBeDefined();
        expect(result.newAgentId).not.toBe(sourceAgent.getId());
      });

      it('should clone agent with modified config', async () => {
        const agents = fleetManager.getAllAgents();
        const sourceAgent = agents[0];

        const result = await clone({
          fleetManager,
          sourceAgentId: sourceAgent.getId(),
          name: 'modified-clone',
          configOverrides: { timeout: 5000 }
        });

        expect(result.success).toBe(true);
        expect(result.configModified).toBe(true);
      });

      it('should validate source agent exists', async () => {
        const result = await clone({
          fleetManager,
          sourceAgentId: 'non-existent',
          name: 'failed-clone'
        });

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should increment clone counter in metadata', async () => {
        const agents = fleetManager.getAllAgents();
        const sourceAgent = agents[0];

        await clone({ fleetManager, sourceAgentId: sourceAgent.getId(), name: 'clone1' });
        await clone({ fleetManager, sourceAgentId: sourceAgent.getId(), name: 'clone2' });

        const result = await clone({
          fleetManager,
          sourceAgentId: sourceAgent.getId(),
          name: 'clone3'
        });

        expect(result.cloneNumber).toBe(3);
      });
    });

    describe('aqe agent migrate', () => {
      it('should migrate agent to different fleet', async () => {
        const agents = fleetManager.getAllAgents();
        const sourceAgent = agents[0];

        const result = await migrate({
          sourceFleetManager: fleetManager,
          targetFleetManager: fleetManager, // Same for test
          agentId: sourceAgent.getId()
        });

        expect(result.success).toBe(true);
        expect(result.migrated).toBe(true);
      });

      it('should preserve agent state during migration', async () => {
        const agents = fleetManager.getAllAgents();
        const sourceAgent = agents[0];

        const result = await migrate({
          sourceFleetManager: fleetManager,
          targetFleetManager: fleetManager,
          agentId: sourceAgent.getId(),
          preserveState: true
        });

        expect(result.statePreserved).toBe(true);
      });

      it('should handle migration conflicts', async () => {
        const agents = fleetManager.getAllAgents();
        const sourceAgent = agents[0];

        const result = await migrate({
          sourceFleetManager: fleetManager,
          targetFleetManager: fleetManager,
          agentId: sourceAgent.getId(),
          conflictStrategy: 'rename'
        });

        expect(result.success).toBe(true);
        expect(result.conflicts).toBeDefined();
      });

      it('should validate target fleet compatibility', async () => {
        const agents = fleetManager.getAllAgents();
        const sourceAgent = agents[0];

        const result = await migrate({
          sourceFleetManager: fleetManager,
          targetFleetManager: fleetManager,
          agentId: sourceAgent.getId(),
          validateCompatibility: true
        });

        expect(result.compatible).toBe(true);
      });
    });

    describe('aqe agent benchmark', () => {
      it('should benchmark agent performance', async () => {
        const agents = fleetManager.getAllAgents();
        const agent = agents[0];

        const result = await benchmark({
          fleetManager,
          agentId: agent.getId(),
          iterations: 10
        });

        expect(result.success).toBe(true);
        expect(result.averageLatency).toBeGreaterThan(0);
        expect(result.throughput).toBeGreaterThan(0);
      });

      it('should measure task completion time', async () => {
        const agents = fleetManager.getAllAgents();
        const agent = agents[0];

        const result = await benchmark({
          fleetManager,
          agentId: agent.getId(),
          iterations: 5
        });

        expect(result.taskMetrics).toBeDefined();
        expect(result.taskMetrics.avgCompletionTime).toBeGreaterThan(0);
      });

      it('should calculate performance percentiles', async () => {
        const agents = fleetManager.getAllAgents();
        const agent = agents[0];

        const result = await benchmark({
          fleetManager,
          agentId: agent.getId(),
          iterations: 20
        });

        expect(result.percentiles).toBeDefined();
        expect(result.percentiles.p50).toBeDefined();
        expect(result.percentiles.p95).toBeDefined();
        expect(result.percentiles.p99).toBeDefined();
      });

      it('should compare against baseline if provided', async () => {
        const agents = fleetManager.getAllAgents();
        const agent = agents[0];

        const baseline = { averageLatency: 100, throughput: 50 };

        const result = await benchmark({
          fleetManager,
          agentId: agent.getId(),
          iterations: 10,
          baseline
        });

        expect(result.comparison).toBeDefined();
        expect(result.comparison.improvement).toBeDefined();
      });
    });
  });

  // TEST COMMANDS TESTS (12 tests)
  describe('Test Commands', () => {
    describe('aqe test analyze-failures', () => {
      it('should analyze test failure patterns', async () => {
        const testResults = {
          failures: [
            { test: 'test1', error: 'Timeout', timestamp: Date.now() },
            { test: 'test2', error: 'Assertion failed', timestamp: Date.now() },
            { test: 'test3', error: 'Timeout', timestamp: Date.now() }
          ]
        };

        const result = await analyzeFailures({ testResults, database });

        expect(result.success).toBe(true);
        expect(result.patterns).toBeDefined();
        expect(result.patterns.length).toBeGreaterThan(0);
      });

      it('should group failures by error type', async () => {
        const testResults = {
          failures: [
            { test: 'test1', error: 'Timeout', timestamp: Date.now() },
            { test: 'test2', error: 'Timeout', timestamp: Date.now() },
            { test: 'test3', error: 'Assertion', timestamp: Date.now() }
          ]
        };

        const result = await analyzeFailures({ testResults, database });

        expect(result.byErrorType).toBeDefined();
        expect(result.byErrorType['Timeout']).toBe(2);
        expect(result.byErrorType['Assertion']).toBe(1);
      });

      it('should identify recurring failures', async () => {
        const testResults = {
          failures: [
            { test: 'test1', error: 'Error', timestamp: Date.now() - 3600000 },
            { test: 'test1', error: 'Error', timestamp: Date.now() - 1800000 },
            { test: 'test1', error: 'Error', timestamp: Date.now() }
          ]
        };

        const result = await analyzeFailures({ testResults, database });

        expect(result.recurring).toBeDefined();
        expect(result.recurring.length).toBeGreaterThan(0);
      });

      it('should suggest fixes based on patterns', async () => {
        const testResults = {
          failures: [
            { test: 'test1', error: 'Connection timeout', timestamp: Date.now() }
          ]
        };

        const result = await analyzeFailures({ testResults, database });

        expect(result.suggestions).toBeDefined();
        expect(result.suggestions.length).toBeGreaterThan(0);
      });
    });

    describe('aqe test flakiness', () => {
      it('should detect flaky tests', async () => {
        const testHistory = [
          { test: 'test1', passed: true, timestamp: Date.now() - 7200000 },
          { test: 'test1', passed: false, timestamp: Date.now() - 3600000 },
          { test: 'test1', passed: true, timestamp: Date.now() },
          { test: 'test2', passed: true, timestamp: Date.now() - 7200000 },
          { test: 'test2', passed: true, timestamp: Date.now() }
        ];

        const result = await flakiness({ testHistory, database });

        expect(result.success).toBe(true);
        expect(result.flakyTests).toBeDefined();
        expect(result.flakyTests.length).toBeGreaterThan(0);
      });

      it('should calculate flakiness score', async () => {
        const testHistory = [
          { test: 'test1', passed: true, timestamp: Date.now() - 3600000 },
          { test: 'test1', passed: false, timestamp: Date.now() },
          { test: 'test1', passed: true, timestamp: Date.now() }
        ];

        const result = await flakiness({ testHistory, database });

        expect(result.flakyTests[0].flakinessScore).toBeDefined();
        expect(result.flakyTests[0].flakinessScore).toBeGreaterThan(0);
        expect(result.flakyTests[0].flakinessScore).toBeLessThanOrEqual(1);
      });

      it('should rank tests by flakiness', async () => {
        const testHistory = [
          { test: 'stable', passed: true, timestamp: Date.now() },
          { test: 'flaky', passed: true, timestamp: Date.now() - 1800000 },
          { test: 'flaky', passed: false, timestamp: Date.now() }
        ];

        const result = await flakiness({ testHistory, database });

        expect(result.flakyTests).toBeDefined();
        if (result.flakyTests.length > 1) {
          expect(result.flakyTests[0].flakinessScore)
            .toBeGreaterThanOrEqual(result.flakyTests[1].flakinessScore);
        }
      });

      it('should identify flakiness root causes', async () => {
        const testHistory = [
          { test: 'test1', passed: true, timestamp: Date.now(), metadata: { env: 'ci' } },
          { test: 'test1', passed: false, timestamp: Date.now(), metadata: { env: 'local' } }
        ];

        const result = await flakiness({ testHistory, database });

        expect(result.rootCauses).toBeDefined();
      });
    });

    describe('aqe test mutate', () => {
      it('should perform mutation testing', async () => {
        const sourceCode = `
          function add(a, b) {
            return a + b;
          }
        `;

        const result = await mutate({
          sourceCode,
          testSuite: 'test.spec.ts',
          database
        });

        expect(result.success).toBe(true);
        expect(result.mutants).toBeDefined();
        expect(result.mutants.length).toBeGreaterThan(0);
      });

      it('should calculate mutation score', async () => {
        const sourceCode = `function multiply(a, b) { return a * b; }`;

        const result = await mutate({
          sourceCode,
          testSuite: 'test.spec.ts',
          database
        });

        expect(result.mutationScore).toBeDefined();
        expect(result.mutationScore).toBeGreaterThanOrEqual(0);
        expect(result.mutationScore).toBeLessThanOrEqual(100);
      });

      it('should identify surviving mutants', async () => {
        const sourceCode = `function divide(a, b) { return a / b; }`;

        const result = await mutate({
          sourceCode,
          testSuite: 'test.spec.ts',
          database
        });

        expect(result.survivingMutants).toBeDefined();
      });

      it('should suggest additional tests for weak areas', async () => {
        const sourceCode = `function complex(a, b) {
          if (a > 0) return a + b;
          return a - b;
        }`;

        const result = await mutate({
          sourceCode,
          testSuite: 'test.spec.ts',
          database
        });

        expect(result.testSuggestions).toBeDefined();
      });
    });
  });

  // QUALITY COMMANDS TESTS (12 tests)
  describe('Quality Commands', () => {
    describe('aqe quality trends', () => {
      it('should show quality metrics over time', async () => {
        // Insert historical metrics
        await database.insertMetric({
          metricType: 'quality',
          metricName: 'test_coverage',
          metricValue: 0.75
        });

        const result = await trends({ database, timeRange: '30d' });

        expect(result.success).toBe(true);
        expect(result.metrics).toBeDefined();
        expect(result.timeRange).toBe('30d');
      });

      it('should calculate trend direction (improving/declining)', async () => {
        const result = await trends({ database, timeRange: '7d' });

        expect(result.trends).toBeDefined();
      });

      it('should highlight significant changes', async () => {
        const result = await trends({ database, timeRange: '24h' });

        expect(result.significantChanges).toBeDefined();
      });

      it('should support multiple time ranges', async () => {
        const ranges = ['24h', '7d', '30d'];

        for (const range of ranges) {
          const result = await trends({ database, timeRange: range });
          expect(result.success).toBe(true);
          expect(result.timeRange).toBe(range);
        }
      });
    });

    describe('aqe quality compare', () => {
      it('should compare quality between two points', async () => {
        const result = await compare({
          database,
          baseline: 'v1.0.0',
          current: 'v1.1.0'
        });

        expect(result.success).toBe(true);
        expect(result.comparison).toBeDefined();
      });

      it('should show metric deltas', async () => {
        const result = await compare({
          database,
          baseline: 'baseline',
          current: 'current'
        });

        expect(result.deltas).toBeDefined();
      });

      it('should identify regressions', async () => {
        const result = await compare({
          database,
          baseline: 'v1',
          current: 'v2'
        });

        expect(result.regressions).toBeDefined();
      });

      it('should highlight improvements', async () => {
        const result = await compare({
          database,
          baseline: 'old',
          current: 'new'
        });

        expect(result.improvements).toBeDefined();
      });
    });

    describe('aqe quality baseline', () => {
      it('should set quality baseline', async () => {
        const metrics = {
          coverage: 0.85,
          passRate: 0.95,
          performance: 100
        };

        const result = await baseline({
          database,
          metrics,
          name: 'v1.0.0'
        });

        expect(result.success).toBe(true);
        expect(result.baselineSet).toBe(true);
      });

      it('should retrieve existing baseline', async () => {
        await baseline({
          database,
          metrics: { coverage: 0.8 },
          name: 'test-baseline'
        });

        const result = await baseline({
          database,
          name: 'test-baseline',
          action: 'get'
        });

        expect(result.baseline).toBeDefined();
        expect(result.baseline.metrics.coverage).toBe(0.8);
      });

      it('should list all baselines', async () => {
        await baseline({ database, metrics: { coverage: 0.8 }, name: 'baseline1' });
        await baseline({ database, metrics: { coverage: 0.9 }, name: 'baseline2' });

        const result = await baseline({
          database,
          action: 'list'
        });

        expect(result.baselines).toBeDefined();
        expect(result.baselines.length).toBeGreaterThanOrEqual(2);
      });

      it('should delete baseline', async () => {
        await baseline({ database, metrics: { coverage: 0.7 }, name: 'to-delete' });

        const result = await baseline({
          database,
          name: 'to-delete',
          action: 'delete'
        });

        expect(result.success).toBe(true);
        expect(result.deleted).toBe(true);
      });
    });
  });
});
