/**
 * Enhanced Memory System Integration Tests
 * Tests session state persistence, workflow tracking, metrics collection,
 * cross-agent knowledge sharing, and error handling
 */

import { QEMemory, QEMemoryConfig } from '../../src/memory/QEMemory';
import { QEMemoryEntry, MemoryType } from '../../src/types';
import { Logger } from '../../src/utils/Logger';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

describe('Enhanced Memory System Integration', () => {
  let memory: QEMemory;
  let testDir: string;
  let logger: Logger;

  beforeAll(async () => {
    testDir = path.join(os.tmpdir(), 'qe-memory-test', Date.now().toString());
    await fs.ensureDir(testDir);
    logger = new Logger('MemoryTest', { level: 'debug' });
  });

  afterAll(async () => {
    if (memory) {
      await memory.destroy();
    }
    await fs.remove(testDir);
  });

  beforeEach(async () => {
    const config: QEMemoryConfig = {
      persistPath: path.join(testDir, 'memory.json'),
      maxEntries: 1000,
      defaultTTL: 30000, // 30 seconds for testing
      autoCleanup: true,
      cleanupInterval: 1000, // 1 second for testing
      compression: false
    };
    memory = new QEMemory(config, logger);
  });

  afterEach(async () => {
    if (memory) {
      await memory.destroy();
    }
  });

  describe('Session State Persistence and Retrieval', () => {
    it('should persist and retrieve session state across restarts', async () => {
      const sessionId = 'test-session-001';
      const sessionData: QEMemoryEntry = {
        key: 'session-state',
        value: {
          phase: 'analysis',
          currentAgent: 'risk-oracle',
          progress: 0.65,
          artifacts: ['report1.pdf', 'metrics.json']
        },
        type: 'session' as MemoryType,
        sessionId,
        agentId: 'coordinator',
        timestamp: new Date(),
        tags: ['session', 'state', 'persistent']
      };

      // Store session data
      await memory.store(sessionData);
      
      // Verify immediate retrieval
      const retrieved = await memory.get('session-state');
      expect(retrieved).toBeTruthy();
      expect(retrieved!.value).toEqual(sessionData.value);

      // Persist to disk
      await memory.persist();

      // Create new memory instance (simulating restart)
      await memory.destroy();
      const newConfig: QEMemoryConfig = {
        persistPath: path.join(testDir, 'memory.json'),
        maxEntries: 1000,
        defaultTTL: 30000
      };
      memory = new QEMemory(newConfig, logger);

      // Wait for loading
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify data survived restart
      const retrievedAfterRestart = await memory.get('session-state');
      expect(retrievedAfterRestart).toBeTruthy();
      expect(retrievedAfterRestart!.value).toEqual(sessionData.value);
      expect(retrievedAfterRestart!.sessionId).toBe(sessionId);
    });

    it('should handle multiple concurrent sessions', async () => {
      const sessions = [
        { id: 'session-1', phase: 'planning', agent: 'test-planner' },
        { id: 'session-2', phase: 'execution', agent: 'test-executor' },
        { id: 'session-3', phase: 'analysis', agent: 'test-analyzer' }
      ];

      // Store data for multiple sessions concurrently
      const storePromises = sessions.map(session => 
        memory.store({
          key: `${session.id}-state`,
          value: { phase: session.phase, currentAgent: session.agent },
          type: 'session' as MemoryType,
          sessionId: session.id,
          timestamp: new Date(),
          tags: ['session', 'concurrent']
        })
      );

      await Promise.all(storePromises);

      // Verify each session can retrieve its own data
      for (const session of sessions) {
        const sessionEntries = await memory.query({ sessionId: session.id });
        expect(sessionEntries).toHaveLength(1);
        expect(sessionEntries[0].value).toEqual({
          phase: session.phase,
          currentAgent: session.agent
        });
      }

      // Verify cross-session isolation
      const session1Entries = await memory.query({ sessionId: 'session-1' });
      const session2Entries = await memory.query({ sessionId: 'session-2' });
      
      expect(session1Entries[0].sessionId).toBe('session-1');
      expect(session2Entries[0].sessionId).toBe('session-2');
      expect(session1Entries[0].key).not.toBe(session2Entries[0].key);
    });
  });

  describe('Workflow Tracking Across Multiple Operations', () => {
    it('should track workflow progress across multiple phases', async () => {
      const workflowId = 'test-workflow-001';
      const phases = [
        { name: 'requirements', agent: 'requirements-explorer', status: 'completed' },
        { name: 'risk-analysis', agent: 'risk-oracle', status: 'in-progress' },
        { name: 'test-planning', agent: 'test-planner', status: 'pending' },
        { name: 'execution', agent: 'test-executor', status: 'pending' }
      ];

      // Store workflow metadata
      await memory.store({
        key: `${workflowId}-metadata`,
        value: {
          id: workflowId,
          name: 'Comprehensive Test Workflow',
          totalPhases: phases.length,
          startTime: new Date(),
          estimatedDuration: 3600000 // 1 hour
        },
        type: 'session' as MemoryType,
        sessionId: workflowId,
        timestamp: new Date(),
        tags: ['workflow', 'metadata']
      });

      // Store each phase
      for (const [index, phase] of phases.entries()) {
        await memory.store({
          key: `${workflowId}-phase-${index}`,
          value: {
            name: phase.name,
            order: index,
            agent: phase.agent,
            status: phase.status,
            progress: phase.status === 'completed' ? 1.0 : 0.0
          },
          type: 'session' as MemoryType,
          sessionId: workflowId,
          agentId: phase.agent,
          timestamp: new Date(),
          tags: ['workflow', 'phase', phase.name]
        });
      }

      // Query workflow progress
      const workflowEntries = await memory.query({
        sessionId: workflowId,
        tags: ['workflow'],
        sortBy: 'timestamp',
        sortOrder: 'asc'
      });

      expect(workflowEntries).toHaveLength(5); // metadata + 4 phases

      // Verify metadata
      const metadata = workflowEntries.find(e => e.key.includes('metadata'));
      expect(metadata).toBeTruthy();
      expect((metadata!.value as any).totalPhases).toBe(4);

      // Verify phase ordering
      const phaseEntries = workflowEntries
        .filter(e => e.key.includes('phase'))
        .sort((a, b) => (a.value as any).order - (b.value as any).order);

      expect(phaseEntries[0].value).toMatchObject({
        name: 'requirements',
        order: 0,
        status: 'completed'
      });

      expect(phaseEntries[1].value).toMatchObject({
        name: 'risk-analysis',
        order: 1,
        status: 'in-progress'
      });
    });

    it('should track dependencies between workflow phases', async () => {
      const workflowId = 'dependency-workflow';
      const dependencies = {
        'phase-1': [],
        'phase-2': ['phase-1'],
        'phase-3': ['phase-1', 'phase-2'],
        'phase-4': ['phase-3']
      };

      // Store dependency graph
      await memory.store({
        key: `${workflowId}-dependencies`,
        value: dependencies,
        type: 'session' as MemoryType,
        sessionId: workflowId,
        timestamp: new Date(),
        tags: ['workflow', 'dependencies']
      });

      // Store phase completion status
      for (const phase of Object.keys(dependencies)) {
        await memory.store({
          key: `${workflowId}-${phase}-status`,
          value: {
            phase,
            completed: phase === 'phase-1' || phase === 'phase-2',
            blockedBy: dependencies[phase].filter(dep => {
              // Simulate checking if dependency is complete
              return !(dep === 'phase-1' || dep === 'phase-2');
            })
          },
          type: 'session' as MemoryType,
          sessionId: workflowId,
          timestamp: new Date(),
          tags: ['workflow', 'phase-status', phase]
        });
      }

      // Query ready phases (no blocked dependencies)
      const statusEntries = await memory.query({
        sessionId: workflowId,
        tags: ['phase-status']
      });

      const readyPhases = statusEntries.filter(entry => {
        const status = entry.value as any;
        return status.blockedBy.length === 0;
      });

      expect(readyPhases).toHaveLength(3); // phase-1, phase-2, phase-3
      
      const readyPhaseNames = readyPhases.map(e => (e.value as any).phase);
      expect(readyPhaseNames).toContain('phase-1');
      expect(readyPhaseNames).toContain('phase-2');
      expect(readyPhaseNames).toContain('phase-3');
    });
  });

  describe('Metrics Collection and Querying', () => {
    it('should collect and aggregate performance metrics', async () => {
      const sessionId = 'metrics-session';
      const agents = ['test-executor', 'performance-tester', 'load-tester'];
      const metrics = [
        { agent: 'test-executor', metric: 'tests_run', value: 150, timestamp: new Date(Date.now() - 3000) },
        { agent: 'test-executor', metric: 'tests_passed', value: 142, timestamp: new Date(Date.now() - 2000) },
        { agent: 'performance-tester', metric: 'response_time_avg', value: 250, timestamp: new Date(Date.now() - 1000) },
        { agent: 'load-tester', metric: 'throughput', value: 1000, timestamp: new Date() }
      ];

      // Store metrics
      for (const metric of metrics) {
        await memory.store({
          key: `${metric.agent}-${metric.metric}-${metric.timestamp.getTime()}`,
          value: {
            metric: metric.metric,
            value: metric.value,
            unit: metric.metric.includes('time') ? 'ms' : 'count',
            agent: metric.agent
          },
          type: 'metric' as MemoryType,
          sessionId,
          agentId: metric.agent,
          timestamp: metric.timestamp,
          tags: ['metric', metric.metric, metric.agent]
        });
      }

      // Query metrics by time range
      const recentMetrics = await memory.query({
        sessionId,
        type: 'metric',
        startTime: new Date(Date.now() - 2500),
        sortBy: 'timestamp',
        sortOrder: 'desc'
      });

      expect(recentMetrics).toHaveLength(3); // Last 3 metrics

      // Query metrics by agent
      const executorMetrics = await memory.query({
        sessionId,
        agentId: 'test-executor',
        type: 'metric'
      });

      expect(executorMetrics).toHaveLength(2);
      expect(executorMetrics.every(m => m.agentId === 'test-executor')).toBe(true);

      // Query metrics by tag
      const responseTimeMetrics = await memory.query({
        sessionId,
        tags: ['response_time_avg']
      });

      expect(responseTimeMetrics).toHaveLength(1);
      expect((responseTimeMetrics[0].value as any).metric).toBe('response_time_avg');
    });

    it('should support complex metric aggregation queries', async () => {
      const sessionId = 'aggregation-session';
      const timeseriesData = [];
      const baseTime = Date.now() - 10000; // 10 seconds ago

      // Generate time series data
      for (let i = 0; i < 10; i++) {
        const timestamp = new Date(baseTime + i * 1000);
        timeseriesData.push({
          key: `cpu-usage-${i}`,
          value: {
            metric: 'cpu_usage',
            value: 20 + Math.random() * 60, // 20-80% CPU
            timestamp: timestamp.toISOString()
          },
          type: 'metric' as MemoryType,
          sessionId,
          agentId: 'system-monitor',
          timestamp,
          tags: ['metric', 'cpu_usage', 'system']
        });
      }

      // Store time series data
      await Promise.all(timeseriesData.map(data => memory.store(data)));

      // Query with pagination
      const page1 = await memory.query({
        sessionId,
        tags: ['cpu_usage'],
        sortBy: 'timestamp',
        sortOrder: 'asc',
        limit: 5,
        offset: 0
      });

      const page2 = await memory.query({
        sessionId,
        tags: ['cpu_usage'],
        sortBy: 'timestamp',
        sortOrder: 'asc',
        limit: 5,
        offset: 5
      });

      expect(page1).toHaveLength(5);
      expect(page2).toHaveLength(5);
      expect(page1[0].timestamp.getTime()).toBeLessThan(page1[4].timestamp.getTime());
      expect(page1[4].timestamp.getTime()).toBeLessThan(page2[0].timestamp.getTime());

      // Calculate aggregated metrics
      const allMetrics = await memory.query({
        sessionId,
        tags: ['cpu_usage']
      });

      const values = allMetrics.map(m => (m.value as any).value);
      const avgCpu = values.reduce((sum, val) => sum + val, 0) / values.length;
      const maxCpu = Math.max(...values);
      const minCpu = Math.min(...values);

      expect(avgCpu).toBeGreaterThan(20);
      expect(avgCpu).toBeLessThan(80);
      expect(maxCpu).toBeGreaterThan(avgCpu);
      expect(minCpu).toBeLessThan(avgCpu);
    });
  });

  describe('Cross-Agent Knowledge Sharing', () => {
    it('should enable agents to share knowledge across sessions', async () => {
      const sharedKnowledge = {
        testPatterns: {
          'api-testing': {
            bestPractices: [
              'Always validate response schemas',
              'Test error conditions',
              'Verify security headers'
            ],
            commonIssues: [
              'Missing error handling',
              'Inconsistent response formats'
            ]
          },
          'performance-testing': {
            thresholds: {
              responseTime: { p95: 500, p99: 1000 },
              throughput: { min: 100 }
            }
          }
        },
        riskAssessments: {
          'authentication': { severity: 'high', likelihood: 0.3 },
          'data-validation': { severity: 'medium', likelihood: 0.6 }
        }
      };

      // Agent 1 (risk-oracle) shares knowledge
      await memory.store({
        key: 'shared-risk-patterns',
        value: sharedKnowledge.riskAssessments,
        type: 'cache' as MemoryType,
        sessionId: 'knowledge-sharing',
        agentId: 'risk-oracle',
        timestamp: new Date(),
        tags: ['shared', 'risk', 'patterns', 'knowledge-base']
      });

      // Agent 2 (test-planner) shares knowledge
      await memory.store({
        key: 'shared-test-patterns',
        value: sharedKnowledge.testPatterns,
        type: 'cache' as MemoryType,
        sessionId: 'knowledge-sharing',
        agentId: 'test-planner',
        timestamp: new Date(),
        tags: ['shared', 'testing', 'patterns', 'knowledge-base']
      });

      // Agent 3 (performance-tester) queries shared knowledge
      const sharedPatterns = await memory.query({
        tags: ['shared', 'patterns']
      });

      expect(sharedPatterns).toHaveLength(2);

      // Verify knowledge accessibility
      const riskPatterns = sharedPatterns.find(p => p.key === 'shared-risk-patterns');
      const testPatterns = sharedPatterns.find(p => p.key === 'shared-test-patterns');

      expect(riskPatterns).toBeTruthy();
      expect(testPatterns).toBeTruthy();
      expect((riskPatterns!.value as any).authentication).toEqual({
        severity: 'high',
        likelihood: 0.3
      });

      // Agent 4 (api-tester) builds on shared knowledge
      const apiPatterns = (testPatterns!.value as any)['api-testing'];
      const enhancedApiPatterns = {
        ...apiPatterns,
        automationStrategies: [
          'Contract testing with Pact',
          'Schema validation with JSON Schema'
        ]
      };

      await memory.store({
        key: 'enhanced-api-patterns',
        value: enhancedApiPatterns,
        type: 'cache' as MemoryType,
        sessionId: 'knowledge-sharing',
        agentId: 'api-tester',
        timestamp: new Date(),
        tags: ['shared', 'api', 'enhanced', 'knowledge-base']
      });

      // Verify knowledge evolution
      const enhancedKnowledge = await memory.get('enhanced-api-patterns');
      expect(enhancedKnowledge).toBeTruthy();
      expect((enhancedKnowledge!.value as any).automationStrategies).toBeDefined();
      expect((enhancedKnowledge!.value as any).bestPractices).toBeDefined();
    });

    it('should support knowledge versioning and updates', async () => {
      const sessionId = 'knowledge-versioning';
      const baseKnowledge = {
        version: '1.0.0',
        testStrategies: [
          'Unit testing',
          'Integration testing'
        ],
        lastUpdated: new Date().toISOString()
      };

      // Store initial knowledge
      await memory.store({
        key: 'test-strategies-v1',
        value: baseKnowledge,
        type: 'cache' as MemoryType,
        sessionId,
        agentId: 'knowledge-curator',
        timestamp: new Date(),
        tags: ['knowledge', 'strategies', 'v1.0.0']
      });

      // Update knowledge with new version
      const updatedKnowledge = {
        version: '1.1.0',
        testStrategies: [
          ...baseKnowledge.testStrategies,
          'E2E testing',
          'Performance testing'
        ],
        lastUpdated: new Date().toISOString(),
        changelog: 'Added E2E and Performance testing strategies'
      };

      await memory.store({
        key: 'test-strategies-v1-1',
        value: updatedKnowledge,
        type: 'cache' as MemoryType,
        sessionId,
        agentId: 'knowledge-curator',
        timestamp: new Date(),
        tags: ['knowledge', 'strategies', 'v1.1.0', 'latest']
      });

      // Query for latest version
      const latestKnowledge = await memory.query({
        sessionId,
        tags: ['knowledge', 'strategies', 'latest']
      });

      expect(latestKnowledge).toHaveLength(1);
      expect((latestKnowledge[0].value as any).version).toBe('1.1.0');
      expect((latestKnowledge[0].value as any).testStrategies).toHaveLength(4);

      // Query knowledge history
      const knowledgeHistory = await memory.query({
        sessionId,
        tags: ['knowledge', 'strategies'],
        sortBy: 'timestamp',
        sortOrder: 'asc'
      });

      expect(knowledgeHistory).toHaveLength(2);
      expect((knowledgeHistory[0].value as any).version).toBe('1.0.0');
      expect((knowledgeHistory[1].value as any).version).toBe('1.1.0');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle memory corruption gracefully', async () => {
      const sessionId = 'corruption-test';
      
      // Store valid data
      await memory.store({
        key: 'valid-data',
        value: { test: 'data' },
        type: 'test-data' as MemoryType,
        sessionId,
        timestamp: new Date(),
        tags: ['valid']
      });

      // Simulate corruption by writing invalid JSON to persist file
      const persistPath = path.join(testDir, 'memory.json');
      await memory.persist();
      await fs.writeFile(persistPath, '{ invalid json }');

      // Create new memory instance and attempt to load corrupted data
      await memory.destroy();
      const newConfig: QEMemoryConfig = {
        persistPath,
        maxEntries: 1000,
        defaultTTL: 30000
      };
      
      // Should not throw, but should start with empty memory
      memory = new QEMemory(newConfig, logger);
      await new Promise(resolve => setTimeout(resolve, 100));

      const retrieved = await memory.get('valid-data');
      expect(retrieved).toBeNull(); // Data should be lost due to corruption

      // Memory should still be functional for new data
      await memory.store({
        key: 'recovery-data',
        value: { recovered: true },
        type: 'test-data' as MemoryType,
        sessionId: 'recovery',
        timestamp: new Date(),
        tags: ['recovery']
      });

      const recoveredData = await memory.get('recovery-data');
      expect(recoveredData).toBeTruthy();
      expect((recoveredData!.value as any).recovered).toBe(true);
    });

    it('should handle memory limit exceeded scenarios', async () => {
      // Create memory with very low limit
      await memory.destroy();
      const limitedConfig: QEMemoryConfig = {
        maxEntries: 3,
        defaultTTL: 30000,
        autoCleanup: false
      };
      memory = new QEMemory(limitedConfig, logger);

      const sessionId = 'limit-test';
      
      // Store data up to limit
      for (let i = 0; i < 3; i++) {
        await memory.store({
          key: `entry-${i}`,
          value: { index: i },
          type: 'test-data' as MemoryType,
          sessionId,
          timestamp: new Date(Date.now() + i * 1000), // Different timestamps
          tags: ['limit-test']
        });
      }

      // Verify all entries are stored
      let allEntries = await memory.query({ sessionId });
      expect(allEntries).toHaveLength(3);

      // Store one more entry (should trigger eviction)
      await memory.store({
        key: 'entry-overflow',
        value: { overflow: true },
        type: 'test-data' as MemoryType,
        sessionId,
        timestamp: new Date(),
        tags: ['limit-test', 'overflow']
      });

      // Should still have only 3 entries (oldest evicted)
      allEntries = await memory.query({ sessionId });
      expect(allEntries).toHaveLength(3);

      // Oldest entry should be gone
      const oldestEntry = await memory.get('entry-0');
      expect(oldestEntry).toBeNull();

      // Newest entry should be present
      const overflowEntry = await memory.get('entry-overflow');
      expect(overflowEntry).toBeTruthy();
      expect((overflowEntry!.value as any).overflow).toBe(true);
    });

    it('should handle TTL expiration correctly', async () => {
      const sessionId = 'ttl-test';
      
      // Store data with short TTL
      await memory.store({
        key: 'short-lived',
        value: { temporary: true },
        type: 'test-data' as MemoryType,
        sessionId,
        timestamp: new Date(),
        ttl: 100, // 100ms
        tags: ['temporary']
      });

      // Store data with long TTL
      await memory.store({
        key: 'long-lived',
        value: { permanent: true },
        type: 'test-data' as MemoryType,
        sessionId,
        timestamp: new Date(),
        ttl: 10000, // 10 seconds
        tags: ['permanent']
      });

      // Immediately verify both exist
      let shortLived = await memory.get('short-lived');
      let longLived = await memory.get('long-lived');
      
      expect(shortLived).toBeTruthy();
      expect(longLived).toBeTruthy();

      // Wait for short TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Short-lived should be expired, long-lived should remain
      shortLived = await memory.get('short-lived');
      longLived = await memory.get('long-lived');
      
      expect(shortLived).toBeNull();
      expect(longLived).toBeTruthy();

      // Verify cleanup was performed
      const stats = memory.getStats();
      expect(stats.totalEntries).toBe(1);
    });

    it('should handle concurrent access correctly', async () => {
      const sessionId = 'concurrent-test';
      const concurrencyLevel = 10;
      
      // Create multiple concurrent operations
      const operations = [];
      
      for (let i = 0; i < concurrencyLevel; i++) {
        operations.push(
          memory.store({
            key: `concurrent-${i}`,
            value: { index: i, timestamp: Date.now() },
            type: 'test-data' as MemoryType,
            sessionId,
            timestamp: new Date(),
            tags: ['concurrent']
          })
        );
      }

      // Wait for all operations to complete
      await Promise.all(operations);

      // Verify all entries were stored correctly
      const allEntries = await memory.query({ sessionId });
      expect(allEntries).toHaveLength(concurrencyLevel);

      // Verify data integrity
      for (let i = 0; i < concurrencyLevel; i++) {
        const entry = await memory.get(`concurrent-${i}`);
        expect(entry).toBeTruthy();
        expect((entry!.value as any).index).toBe(i);
      }

      // Test concurrent updates
      const updateOperations = [];
      for (let i = 0; i < concurrencyLevel; i++) {
        updateOperations.push(
          memory.update(`concurrent-${i}`, {
            value: { index: i, updated: true, updateTime: Date.now() }
          })
        );
      }

      const updateResults = await Promise.all(updateOperations);
      expect(updateResults.every(result => result === true)).toBe(true);

      // Verify updates were applied
      for (let i = 0; i < concurrencyLevel; i++) {
        const entry = await memory.get(`concurrent-${i}`);
        expect(entry).toBeTruthy();
        expect((entry!.value as any).updated).toBe(true);
      }
    });
  });

  describe('Performance Benchmarks', () => {
    it('should handle large-scale data operations efficiently', async () => {
      const sessionId = 'performance-test';
      const dataSize = 1000;
      
      // Benchmark bulk storage
      const startStore = Date.now();
      const storePromises = [];
      
      for (let i = 0; i < dataSize; i++) {
        storePromises.push(
          memory.store({
            key: `perf-${i}`,
            value: {
              index: i,
              data: `test-data-${i}`,
              timestamp: Date.now(),
              metadata: { type: 'performance-test' }
            },
            type: 'test-data' as MemoryType,
            sessionId,
            timestamp: new Date(),
            tags: ['performance', `batch-${Math.floor(i / 100)}`]
          })
        );
      }
      
      await Promise.all(storePromises);
      const storeTime = Date.now() - startStore;
      
      // Benchmark bulk retrieval
      const startQuery = Date.now();
      const allEntries = await memory.query({ sessionId });
      const queryTime = Date.now() - startQuery;
      
      // Benchmark individual lookups
      const startLookup = Date.now();
      const lookupPromises = [];
      for (let i = 0; i < 100; i++) {
        const randomIndex = Math.floor(Math.random() * dataSize);
        lookupPromises.push(memory.get(`perf-${randomIndex}`));
      }
      await Promise.all(lookupPromises);
      const lookupTime = Date.now() - startLookup;
      
      // Performance assertions
      expect(allEntries).toHaveLength(dataSize);
      expect(storeTime).toBeLessThan(dataSize * 10); // <10ms per entry on average
      expect(queryTime).toBeLessThan(1000); // <1s for full query
      expect(lookupTime).toBeLessThan(500); // <5ms per lookup on average
      
      console.log(`Performance metrics:`);
      console.log(`  Store ${dataSize} entries: ${storeTime}ms (${(storeTime/dataSize).toFixed(2)}ms/entry)`);
      console.log(`  Query ${dataSize} entries: ${queryTime}ms`);
      console.log(`  100 random lookups: ${lookupTime}ms (${(lookupTime/100).toFixed(2)}ms/lookup)`);
    });

    it('should efficiently handle complex queries', async () => {
      const sessionId = 'complex-query-test';
      const agents = ['agent-1', 'agent-2', 'agent-3'];
      const types: MemoryType[] = ['test-data', 'metric', 'cache'];
      const tags = ['tag-a', 'tag-b', 'tag-c'];
      
      // Create diverse dataset
      const entries = [];
      for (let i = 0; i < 500; i++) {
        entries.push({
          key: `complex-${i}`,
          value: { index: i, random: Math.random() },
          type: types[i % types.length],
          sessionId,
          agentId: agents[i % agents.length],
          timestamp: new Date(Date.now() + i * 1000),
          tags: [tags[i % tags.length], `batch-${Math.floor(i / 50)}`]
        });
      }
      
      await Promise.all(entries.map(entry => memory.store(entry)));
      
      // Benchmark complex queries
      const queries = [
        { sessionId, agentId: 'agent-1', type: 'test-data' as MemoryType },
        { sessionId, tags: ['tag-a', 'batch-5'] },
        { sessionId, startTime: new Date(Date.now() + 100000), endTime: new Date(Date.now() + 200000) },
        { sessionId, sortBy: 'timestamp' as const, sortOrder: 'desc' as const, limit: 50 }
      ];
      
      for (const query of queries) {
        const start = Date.now();
        const results = await memory.query(query);
        const queryTime = Date.now() - start;
        
        expect(queryTime).toBeLessThan(100); // <100ms for complex queries
        expect(results.length).toBeGreaterThan(0);
        
        console.log(`Complex query completed in ${queryTime}ms, returned ${results.length} results`);
      }
    });
  });
});