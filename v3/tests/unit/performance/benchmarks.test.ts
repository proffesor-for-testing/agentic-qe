/**
 * Agentic QE v3 - Performance Module Tests
 * Tests for profiler, optimizer, benchmarks, and CI gates
 *
 * Issue #177 Targets:
 * - AG-UI streaming: <100ms p95
 * - A2A task submission: <200ms p95
 * - A2UI surface generation: <150ms p95
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
  // Profiler
  PerformanceProfiler,
  createProfiler,
  getGlobalProfiler,
  resetGlobalProfiler,
  // Optimizer
  PerformanceOptimizer,
  createOptimizer,
  ObjectPool,
  EventBatcher,
  LRUCache,
  // Benchmarks
  BenchmarkSuite,
  createBenchmarkSuite,
  PERFORMANCE_TARGETS,
  // CI Gates
  CIPerformanceGates,
  createCIGates,
} from '../../../src/performance/index.js';

// ============================================================================
// Profiler Tests
// ============================================================================

describe('PerformanceProfiler', () => {
  let profiler: PerformanceProfiler;

  beforeEach(() => {
    profiler = createProfiler({ enabled: true, trackMemory: false });
  });

  afterEach(() => {
    profiler.destroy();
  });

  describe('Section Profiling', () => {
    it('should start and end a section', () => {
      const section = profiler.startSection('test-section');
      expect(section.name).toBe('test-section');
      expect(section.startTime).toBeDefined();

      const timing = profiler.endSection(section);
      expect(timing.name).toBe('test-section');
      expect(timing.duration).toBeGreaterThanOrEqual(0);
    });

    it('should track multiple sections', () => {
      const section1 = profiler.startSection('section-1');
      const section2 = profiler.startSection('section-2');

      profiler.endSection(section1);
      profiler.endSection(section2);

      const results = profiler.getResults();
      expect(results.sectionCount).toBe(2);
    });

    it('should calculate section statistics', () => {
      for (let i = 0; i < 10; i++) {
        const section = profiler.startSection('repeated-section');
        // Simulate some work
        for (let j = 0; j < 1000; j++) {
          Math.random();
        }
        profiler.endSection(section);
      }

      const stats = profiler.getSectionResults('repeated-section');
      expect(stats).not.toBeNull();
      expect(stats!.count).toBe(10);
      expect(stats!.avgTime).toBeGreaterThan(0);
      expect(stats!.p50).toBeGreaterThanOrEqual(0);
      expect(stats!.p95).toBeGreaterThanOrEqual(stats!.p50);
      expect(stats!.p99).toBeGreaterThanOrEqual(stats!.p95);
    });

    it('should return null for unknown section', () => {
      const stats = profiler.getSectionResults('unknown-section');
      expect(stats).toBeNull();
    });
  });

  describe('Measure Methods', () => {
    it('should measure async operations', async () => {
      const result = await profiler.measure('async-op', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 42;
      });

      expect(result).toBe(42);

      const stats = profiler.getSectionResults('async-op');
      expect(stats).not.toBeNull();
      expect(stats!.avgTime).toBeGreaterThanOrEqual(9); // Allow some timing variance
    });

    it('should measure sync operations', () => {
      const result = profiler.measureSync('sync-op', () => {
        let sum = 0;
        for (let i = 0; i < 10000; i++) {
          sum += i;
        }
        return sum;
      });

      expect(result).toBe(49995000);

      const stats = profiler.getSectionResults('sync-op');
      expect(stats).not.toBeNull();
    });

    it('should handle errors in measured operations', async () => {
      await expect(
        profiler.measure('error-op', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      // Section should still be recorded
      const stats = profiler.getSectionResults('error-op');
      expect(stats).not.toBeNull();
    });
  });

  describe('Enable/Disable', () => {
    it('should disable profiling', () => {
      profiler.disable();
      expect(profiler.isEnabled()).toBe(false);

      const section = profiler.startSection('disabled-section');
      profiler.endSection(section);

      // Timings should not be recorded
      const stats = profiler.getSectionResults('disabled-section');
      expect(stats).toBeNull();
    });

    it('should enable profiling', () => {
      profiler.disable();
      profiler.enable();
      expect(profiler.isEnabled()).toBe(true);
    });
  });

  describe('Results', () => {
    it('should return complete profile results', () => {
      profiler.enable();

      for (let i = 0; i < 5; i++) {
        const section = profiler.startSection('results-section');
        profiler.endSection(section);
      }

      const results = profiler.getResults();
      expect(results.sections.length).toBeGreaterThan(0);
      expect(results.totalDuration).toBeGreaterThanOrEqual(0);
      expect(results.enabled).toBe(true);
      expect(results.startedAt).toBeGreaterThan(0);
    });

    it('should sort sections by total time', () => {
      // Fast section
      for (let i = 0; i < 5; i++) {
        const section = profiler.startSection('fast');
        profiler.endSection(section);
      }

      // Slow section
      for (let i = 0; i < 5; i++) {
        const section = profiler.startSection('slow');
        for (let j = 0; j < 100000; j++) Math.random();
        profiler.endSection(section);
      }

      const results = profiler.getResults();
      expect(results.sections[0].name).toBe('slow');
    });

    it('should get raw timings', () => {
      for (let i = 0; i < 3; i++) {
        const section = profiler.startSection('raw-test');
        profiler.endSection(section);
      }

      const timings = profiler.getRawTimings('raw-test');
      expect(timings.length).toBe(3);
      expect(timings[0].name).toBe('raw-test');
    });
  });

  describe('Reset', () => {
    it('should reset all profiling data', () => {
      const section = profiler.startSection('reset-test');
      profiler.endSection(section);

      profiler.reset();

      const stats = profiler.getSectionResults('reset-test');
      expect(stats).toBeNull();

      const results = profiler.getResults();
      expect(results.sectionCount).toBe(0);
    });
  });

  describe('Global Profiler', () => {
    afterEach(() => {
      resetGlobalProfiler();
    });

    it('should provide a global profiler instance', () => {
      const global1 = getGlobalProfiler();
      const global2 = getGlobalProfiler();
      expect(global1).toBe(global2);
    });

    it('should reset global profiler', () => {
      const global1 = getGlobalProfiler();
      resetGlobalProfiler();
      const global2 = getGlobalProfiler();
      expect(global1).not.toBe(global2);
    });
  });
});

// ============================================================================
// Optimizer Tests
// ============================================================================

describe('PerformanceOptimizer', () => {
  let optimizer: PerformanceOptimizer;

  beforeEach(() => {
    optimizer = createOptimizer();
  });

  afterEach(() => {
    optimizer.destroy();
  });

  describe('Object Pool', () => {
    it('should acquire and release objects', () => {
      const pool = new ObjectPool<{ value: number }>(
        () => ({ value: 0 }),
        (obj) => { obj.value = 0; },
        10
      );

      const obj1 = pool.acquire();
      obj1.value = 42;
      pool.release(obj1);

      const obj2 = pool.acquire();
      expect(obj2.value).toBe(0); // Should be reset
    });

    it('should track pool statistics', () => {
      const pool = new ObjectPool<Record<string, unknown>>(
        () => ({}),
        (obj) => { for (const key in obj) delete obj[key]; },
        10
      );

      for (let i = 0; i < 5; i++) {
        pool.acquire();
      }

      const stats = pool.getStats();
      expect(stats.acquireCount).toBe(5);
      expect(stats.createCount).toBe(5);
    });

    it('should prewarm the pool', () => {
      const pool = new ObjectPool<Record<string, unknown>>(
        () => ({}),
        () => {},
        100
      );

      pool.prewarm(50);

      const stats = pool.getStats();
      expect(stats.poolSize).toBe(50);
    });

    it('should respect max pool size', () => {
      const pool = new ObjectPool<Record<string, unknown>>(
        () => ({}),
        () => {},
        5
      );

      const objects: Record<string, unknown>[] = [];
      for (let i = 0; i < 10; i++) {
        objects.push(pool.acquire());
      }

      for (const obj of objects) {
        pool.release(obj);
      }

      const stats = pool.getStats();
      expect(stats.poolSize).toBe(5); // Max size respected
    });
  });

  describe('Event Batcher', () => {
    it('should batch events', () => {
      const batcher = new EventBatcher<number>(5, 100);
      const batches: number[][] = [];

      batcher.on('batch', (events: number[]) => {
        batches.push(events);
      });

      for (let i = 0; i < 5; i++) {
        batcher.add(i);
      }

      expect(batches.length).toBe(1);
      expect(batches[0]).toEqual([0, 1, 2, 3, 4]);

      batcher.destroy();
    });

    it('should flush on interval', async () => {
      const batcher = new EventBatcher<number>(100, 50);
      const batches: number[][] = [];

      batcher.on('batch', (events: number[]) => {
        batches.push(events);
      });

      batcher.add(1);
      batcher.add(2);

      // Wait for flush interval
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(batches.length).toBe(1);
      expect(batches[0]).toEqual([1, 2]);

      batcher.destroy();
    });

    it('should track batcher statistics', () => {
      const batcher = new EventBatcher<number>(10, 1000);

      for (let i = 0; i < 25; i++) {
        batcher.add(i);
      }

      const stats = batcher.getStats();
      expect(stats.eventCount).toBe(25);
      expect(stats.batchCount).toBe(2); // 10 + 10, 5 pending

      batcher.destroy();
    });
  });

  describe('LRU Cache', () => {
    it('should cache and retrieve values', () => {
      const cache = new LRUCache<string, number>(100, 60000);

      cache.set('key1', 42);
      expect(cache.get('key1')).toBe(42);
    });

    it('should return undefined for missing keys', () => {
      const cache = new LRUCache<string, number>(100, 60000);
      expect(cache.get('missing')).toBeUndefined();
    });

    it('should evict LRU entries', () => {
      const cache = new LRUCache<string, number>(3, 60000);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' to make it recently used
      cache.get('a');

      // Add new entry, should evict 'b'
      cache.set('d', 4);

      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false); // Evicted
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });

    it('should expire entries by TTL', () => {
      vi.useFakeTimers();

      const cache = new LRUCache<string, number>(100, 100); // 100ms TTL

      cache.set('key', 42);
      expect(cache.get('key')).toBe(42);

      // Advance time past TTL
      vi.advanceTimersByTime(150);

      expect(cache.get('key')).toBeUndefined();

      vi.useRealTimers();
    });

    it('should track cache statistics', () => {
      const cache = new LRUCache<string, number>(100, 60000);

      cache.set('a', 1);
      cache.get('a'); // Hit
      cache.get('a'); // Hit
      cache.get('b'); // Miss

      const stats = cache.getStats();
      expect(stats.hitCount).toBe(2);
      expect(stats.missCount).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.67, 1);
    });
  });

  describe('Optimizer Methods', () => {
    it('should optimize AG-UI streaming', () => {
      const emitter = new EventEmitter();
      const optimized = optimizer.optimizeAGUIStreaming(emitter);

      expect(optimized.getOptimizationStats).toBeDefined();

      const stats = optimized.getOptimizationStats();
      expect(stats.batching).toBeDefined();
    });

    it('should optimize A2A tasking', () => {
      const taskManager = {
        getTask: (id: string) => ({ id, status: 'submitted' }),
      };

      const optimized = optimizer.optimizeA2ATasking(taskManager);
      expect(optimized.getOptimizationStats).toBeDefined();

      // First call - cache miss
      const task1 = optimized.getTask('task-1');
      expect(task1.id).toBe('task-1');

      // Second call - cache hit
      const task2 = optimized.getTask('task-1');
      expect(task2).toEqual(task1);
    });

    it('should optimize A2UI surfaces', () => {
      const surfaceGenerator = {
        getSurface: (id: string) => ({ id, components: [] }),
        generateSurfaceUpdate: (id: string) => ({ id, version: 1 }),
      };

      const optimized = optimizer.optimizeA2UISurfaces(surfaceGenerator);
      expect(optimized.getOptimizationStats).toBeDefined();
    });

    it('should create optimized events', () => {
      const event = optimizer.createOptimizedEvent('TEST', { data: 123 });
      expect(event.type).toBe('TEST');
      expect(event.data).toBe(123);

      optimizer.releaseEvent(event);
    });

    it('should prewarm pools', () => {
      optimizer.prewarm(50);
      const stats = optimizer.getStats();
      expect(stats.eventPool.poolSize).toBe(50);
    });

    it('should return optimization statistics', () => {
      const stats = optimizer.getStats();
      expect(stats.config).toBeDefined();
      expect(stats.eventPool).toBeDefined();
      expect(stats.messagePool).toBeDefined();
      expect(stats.componentPool).toBeDefined();
      expect(stats.surfaceCache).toBeDefined();
      expect(stats.taskCache).toBeDefined();
      expect(stats.eventBatcher).toBeDefined();
    });
  });
});

// ============================================================================
// Benchmark Suite Tests
// ============================================================================

describe('BenchmarkSuite', () => {
  let suite: BenchmarkSuite;

  beforeEach(() => {
    suite = createBenchmarkSuite({
      iterations: 100,
      warmupIterations: 10,
      forceGC: false,
    });
  });

  afterEach(() => {
    suite.destroy();
  });

  describe('Individual Benchmarks', () => {
    it('should benchmark AG-UI event emission', async () => {
      const result = await suite.benchmarkAGUIEventEmission();
      expect(result.name).toBe('AGUI Event Emission');
      expect(result.iterations).toBe(100);
      expect(result.opsPerSecond).toBeGreaterThan(0);
      expect(result.p95).toBeGreaterThanOrEqual(0);
    });

    it('should benchmark AG-UI state sync', async () => {
      const result = await suite.benchmarkAGUIStateSync();
      expect(result.name).toBe('AGUI State Sync');
      expect(result.avgTime).toBeGreaterThanOrEqual(0);
    });

    it('should benchmark AG-UI SSE streaming', async () => {
      const result = await suite.benchmarkAGUISSEStreaming();
      expect(result.name).toBe('AGUI SSE Streaming');
      expect(result.target).toBe(PERFORMANCE_TARGETS.aguiSSEStreaming.p95);
    });

    it('should benchmark A2A task submission', async () => {
      const result = await suite.benchmarkA2ATaskSubmission();
      expect(result.name).toBe('A2A Task Submission');
      expect(result.target).toBe(PERFORMANCE_TARGETS.a2aTaskSubmission.p95);
    });

    it('should benchmark A2A agent discovery', async () => {
      const result = await suite.benchmarkA2AAgentDiscovery();
      expect(result.name).toBe('A2A Agent Discovery');
    });

    it('should benchmark A2A JSON-RPC parsing', async () => {
      const result = await suite.benchmarkA2AJSONRPCParsing();
      expect(result.name).toBe('A2A JSON-RPC Parsing');
    });

    it('should benchmark A2UI surface generation', async () => {
      const result = await suite.benchmarkA2UISurfaceGeneration();
      expect(result.name).toBe('A2UI Surface Generation');
      expect(result.target).toBe(PERFORMANCE_TARGETS.a2uiSurfaceGeneration.p95);
    });

    it('should benchmark A2UI data binding', async () => {
      const result = await suite.benchmarkA2UIDataBinding();
      expect(result.name).toBe('A2UI Data Binding');
    });

    it('should benchmark A2UI component validation', async () => {
      const result = await suite.benchmarkA2UIComponentValidation();
      expect(result.name).toBe('A2UI Component Validation');
    });

    it('should benchmark end-to-end flow', async () => {
      const result = await suite.benchmarkEndToEndFlow();
      expect(result.name).toBe('End-to-End Flow');
    });

    it('should benchmark memory under load', async () => {
      const result = await suite.benchmarkMemoryUnderLoad();
      expect(result.name).toBe('Memory Under Load');
      expect(result.memoryDelta).toBeDefined();
    });
  });

  describe('Run All Benchmarks', () => {
    it('should run all benchmarks', async () => {
      const results = await suite.runAll();

      expect(results.results.length).toBeGreaterThan(0);
      expect(results.totalDuration).toBeGreaterThan(0);
      expect(results.system.nodeVersion).toBeDefined();
      expect(results.system.platform).toBeDefined();
    });

    it('should determine overall pass/fail', async () => {
      const results = await suite.runAll();
      expect(typeof results.allPassed).toBe('boolean');
    });
  });

  describe('Results Access', () => {
    it('should get all results', async () => {
      await suite.benchmarkAGUIEventEmission();
      await suite.benchmarkA2ATaskSubmission();

      const results = suite.getResults();
      expect(results.length).toBe(2);
    });

    it('should get result by name', async () => {
      await suite.benchmarkAGUIEventEmission();

      const result = suite.getResult('AGUI Event Emission');
      expect(result).toBeDefined();
      expect(result!.name).toBe('AGUI Event Emission');
    });

    it('should clear results', async () => {
      await suite.benchmarkAGUIEventEmission();
      suite.clearResults();

      const results = suite.getResults();
      expect(results.length).toBe(0);
    });
  });

  describe('Performance Targets', () => {
    it('should have defined performance targets', () => {
      expect(PERFORMANCE_TARGETS.aguiSSEStreaming.p95).toBe(100);
      expect(PERFORMANCE_TARGETS.a2aTaskSubmission.p95).toBe(200);
      expect(PERFORMANCE_TARGETS.a2uiSurfaceGeneration.p95).toBe(150);
      expect(PERFORMANCE_TARGETS.memoryPeak).toBe(4 * 1024 * 1024 * 1024);
      expect(PERFORMANCE_TARGETS.throughput).toBe(1000);
    });
  });
});

// ============================================================================
// CI Gates Tests
// ============================================================================

describe('CIPerformanceGates', () => {
  let gates: CIPerformanceGates;

  beforeEach(() => {
    gates = createCIGates();
  });

  describe('Individual Gate Checks', () => {
    it('should check AG-UI latency - pass', () => {
      const result = gates.checkAGUILatency(50);
      expect(result.passed).toBe(true);
      expect(result.gate).toBe('AG-UI Streaming Latency');
      expect(result.severity).toBe('pass');
    });

    it('should check AG-UI latency - fail', () => {
      const result = gates.checkAGUILatency(150);
      expect(result.passed).toBe(false);
      expect(result.severity).toBe('fail');
    });

    it('should check AG-UI latency - warn', () => {
      const result = gates.checkAGUILatency(90); // 90% of 100ms target
      expect(result.passed).toBe(true);
      expect(result.severity).toBe('warn');
    });

    it('should check A2A latency - pass', () => {
      const result = gates.checkA2ALatency(100);
      expect(result.passed).toBe(true);
    });

    it('should check A2A latency - fail', () => {
      const result = gates.checkA2ALatency(250);
      expect(result.passed).toBe(false);
    });

    it('should check A2UI latency - pass', () => {
      const result = gates.checkA2UILatency(100);
      expect(result.passed).toBe(true);
    });

    it('should check A2UI latency - fail', () => {
      const result = gates.checkA2UILatency(200);
      expect(result.passed).toBe(false);
    });

    it('should check memory usage - pass', () => {
      const result = gates.checkMemoryUsage(2 * 1024 * 1024 * 1024); // 2GB
      expect(result.passed).toBe(true);
    });

    it('should check memory usage - fail', () => {
      const result = gates.checkMemoryUsage(5 * 1024 * 1024 * 1024); // 5GB
      expect(result.passed).toBe(false);
    });

    it('should check throughput - pass', () => {
      const result = gates.checkThroughput(1500);
      expect(result.passed).toBe(true);
    });

    it('should check throughput - fail', () => {
      const result = gates.checkThroughput(500);
      expect(result.passed).toBe(false);
    });

    it('should calculate margin correctly', () => {
      const result = gates.checkAGUILatency(50);
      expect(result.margin).toBe(50); // 50ms under 100ms target = 50%
    });
  });

  describe('Check All Gates', () => {
    it('should check all gates from benchmark results', () => {
      const results = {
        results: [
          {
            name: 'AGUI SSE Streaming',
            iterations: 100,
            opsPerSecond: 10000,
            avgTime: 0.1,
            p50: 0.08,
            p95: 50,
            p99: 80,
            maxTime: 100,
            minTime: 0.05,
            memoryDelta: 1000,
            passed: true,
            target: 100,
            timestamp: Date.now(),
          },
          {
            name: 'A2A Task Submission',
            iterations: 100,
            opsPerSecond: 5000,
            avgTime: 0.2,
            p50: 0.15,
            p95: 100,
            p99: 150,
            maxTime: 200,
            minTime: 0.1,
            memoryDelta: 2000,
            passed: true,
            target: 200,
            timestamp: Date.now(),
          },
        ],
        allPassed: true,
        totalDuration: 1000,
        startedAt: Date.now() - 1000,
        endedAt: Date.now(),
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          cpus: 4,
          memory: 16 * 1024 * 1024 * 1024,
        },
      };

      const gateResults = gates.checkAll(results);
      expect(gateResults.length).toBeGreaterThan(0);
    });
  });

  describe('Report Generation', () => {
    it('should generate CI report', () => {
      const results = {
        results: [
          {
            name: 'AGUI SSE Streaming',
            iterations: 100,
            opsPerSecond: 10000,
            avgTime: 0.1,
            p50: 0.08,
            p95: 50,
            p99: 80,
            maxTime: 100,
            minTime: 0.05,
            memoryDelta: 1000,
            passed: true,
            target: 100,
            timestamp: Date.now(),
          },
        ],
        allPassed: true,
        totalDuration: 1000,
        startedAt: Date.now() - 1000,
        endedAt: Date.now(),
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          cpus: 4,
          memory: 16 * 1024 * 1024 * 1024,
        },
      };

      const report = gates.generateReport(results);

      expect(report.summary).toBeDefined();
      expect(report.gates.length).toBeGreaterThan(0);
      expect(report.exitCode).toBeDefined();
      expect(report.environment.nodeVersion).toBe(process.version);
    });

    it('should generate exit code 0 for all passed', () => {
      const results = {
        results: [
          {
            name: 'AGUI SSE Streaming',
            iterations: 100,
            opsPerSecond: 10000,
            avgTime: 0.1,
            p50: 0.08,
            p95: 50,
            p99: 80,
            maxTime: 100,
            minTime: 0.05,
            memoryDelta: 1000,
            passed: true,
            target: 100,
            timestamp: Date.now(),
          },
        ],
        allPassed: true,
        totalDuration: 1000,
        startedAt: Date.now() - 1000,
        endedAt: Date.now(),
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          cpus: 4,
          memory: 16 * 1024 * 1024 * 1024,
        },
      };

      const exitCode = gates.getExitCode(results);
      expect(exitCode).toBe(0);
    });

    it('should generate exit code 1 for failures', () => {
      const results = {
        results: [
          {
            name: 'AGUI SSE Streaming',
            iterations: 100,
            opsPerSecond: 1000,
            avgTime: 1,
            p50: 0.8,
            p95: 150, // Exceeds 100ms target
            p99: 200,
            maxTime: 250,
            minTime: 0.5,
            memoryDelta: 1000,
            passed: false,
            target: 100,
            timestamp: Date.now(),
          },
        ],
        allPassed: false,
        totalDuration: 1000,
        startedAt: Date.now() - 1000,
        endedAt: Date.now(),
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          cpus: 4,
          memory: 16 * 1024 * 1024 * 1024,
        },
      };

      const exitCode = gates.getExitCode(results);
      expect(exitCode).toBe(1);
    });
  });

  describe('Report Formatting', () => {
    it('should format report as text', () => {
      const report = {
        summary: 'Test summary',
        gates: [
          {
            passed: true,
            gate: 'Test Gate',
            actual: 50,
            target: 100,
            margin: 50,
            message: 'Test message',
            severity: 'pass' as const,
          },
        ],
        recommendations: ['Test recommendation'],
        exitCode: 0,
        timestamp: Date.now(),
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          ci: false,
        },
        performance: {
          totalTests: 1,
          passed: 1,
          failed: 0,
          warnings: 0,
        },
      };

      const text = gates.formatReportText(report);
      expect(text).toContain('PERFORMANCE REPORT');
      expect(text).toContain('[PASS]');
      expect(text).toContain('Test Gate');
    });

    it('should format report as markdown', () => {
      const report = {
        summary: 'Test summary',
        gates: [
          {
            passed: true,
            gate: 'Test Gate',
            actual: 50,
            target: 100,
            margin: 50,
            message: 'Test message',
            severity: 'pass' as const,
          },
        ],
        recommendations: [],
        exitCode: 0,
        timestamp: Date.now(),
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          ci: false,
        },
        performance: {
          totalTests: 1,
          passed: 1,
          failed: 0,
          warnings: 0,
        },
      };

      const md = gates.formatReportMarkdown(report);
      expect(md).toContain('# Agentic QE v3');
      expect(md).toContain('| Status |');
      expect(md).toContain('PASS');
    });

    it('should format report as JSON', () => {
      const report = {
        summary: 'Test summary',
        gates: [],
        recommendations: [],
        exitCode: 0,
        timestamp: Date.now(),
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          ci: false,
        },
        performance: {
          totalTests: 0,
          passed: 0,
          failed: 0,
          warnings: 0,
        },
      };

      const json = gates.formatReportJSON(report);
      const parsed = JSON.parse(json);
      expect(parsed.exitCode).toBe(0);
    });
  });

  describe('Recommendations', () => {
    it('should generate recommendations for failures', () => {
      const results = {
        results: [
          {
            name: 'AGUI SSE Streaming',
            iterations: 100,
            opsPerSecond: 1000,
            avgTime: 1,
            p50: 0.8,
            p95: 150,
            p99: 200,
            maxTime: 250,
            minTime: 0.5,
            memoryDelta: 1000,
            passed: false,
            target: 100,
            timestamp: Date.now(),
          },
        ],
        allPassed: false,
        totalDuration: 1000,
        startedAt: Date.now() - 1000,
        endedAt: Date.now(),
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          cpus: 4,
          memory: 16 * 1024 * 1024 * 1024,
        },
      };

      const report = gates.generateReport(results);
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations[0]).toContain('CRITICAL');
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Performance Module Integration', () => {
  it('should run complete benchmark and gate check flow', async () => {
    // Create components
    const suite = createBenchmarkSuite({
      iterations: 50,
      warmupIterations: 5,
      forceGC: false,
    });
    const gates = createCIGates();

    try {
      // Run a subset of benchmarks
      await suite.benchmarkAGUIEventEmission();
      await suite.benchmarkA2ATaskSubmission();
      await suite.benchmarkA2UISurfaceGeneration();

      // Get results
      const results = {
        results: suite.getResults(),
        allPassed: suite.getResults().every(r => r.passed),
        totalDuration: 1000,
        startedAt: Date.now() - 1000,
        endedAt: Date.now(),
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          cpus: 4,
          memory: 16 * 1024 * 1024 * 1024,
        },
      };

      // Generate report
      const report = gates.generateReport(results);

      expect(report.summary).toBeDefined();
      expect(report.gates.length).toBeGreaterThan(0);
      expect([0, 1, 2]).toContain(report.exitCode);
    } finally {
      suite.destroy();
    }
  });

  it('should optimize and measure performance improvement', async () => {
    const optimizer = createOptimizer();
    const profiler = createProfiler({ enabled: true, trackMemory: false });
    profiler.enable();

    try {
      // Measure without optimization
      const unoptimizedTimes: number[] = [];
      for (let i = 0; i < 100; i++) {
        const section = profiler.startSection('unoptimized');
        const emitter = new EventEmitter();
        emitter.emit('event', { data: i });
        profiler.endSection(section);
      }

      // Measure with optimization (using object pooling)
      const optimizedTimes: number[] = [];
      optimizer.prewarm(100);
      for (let i = 0; i < 100; i++) {
        const section = profiler.startSection('optimized');
        const event = optimizer.createOptimizedEvent('event', { data: i });
        optimizer.releaseEvent(event);
        profiler.endSection(section);
      }

      const results = profiler.getResults();
      expect(results.sections.length).toBe(2);
    } finally {
      optimizer.destroy();
      profiler.destroy();
    }
  });
});
