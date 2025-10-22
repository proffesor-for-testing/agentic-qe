import { OptimizerAgent } from '../../../src/agents/OptimizerAgent';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { EventBus } from '../../../src/core/EventBus';
import { TaskAssignment } from '../../../src/core/types';
import * as path from 'path';
import * as fs from 'fs-extra';

describe('OptimizerAgent Comprehensive Tests', () => {
  let agent: OptimizerAgent;
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventBus;
  const testDbPath = path.join(process.cwd(), '.swarm/test-optimizer.db');

  beforeAll(async () => {
    await fs.ensureDir(path.dirname(testDbPath));
    memoryStore = new SwarmMemoryManager(testDbPath);
    await memoryStore.initialize();
    eventBus = EventBus.getInstance();
    await eventBus.initialize();
  });

  beforeEach(async () => {
    agent = new OptimizerAgent('optimizer-test-001');
    await agent.initialize();
  });

  afterEach(async () => {
    if (agent) {
      await agent.terminate();
    }
  });

  afterAll(async () => {
    await eventBus.shutdown();
    await memoryStore.close();
    await fs.remove(testDbPath);
  });

  describe('Performance Optimization', () => {
    it('should optimize algorithm performance', async () => {
      const optimized = await agent['optimizeAlgorithm']({
        code: 'for(let i=0; i<n; i++) { /* O(n) */ }',
        targetComplexity: 'O(log n)'
      });
      expect(optimized).toHaveProperty('improved');
    });

    it('should detect O(n²) operations', async () => {
      const detected = await agent['detectQuadraticOps'](`
        for(let i=0; i<n; i++) {
          for(let j=0; j<n; j++) {}
        }
      `);
      expect(detected).toBe(true);
    });

    it('should suggest cache optimizations', async () => {
      const suggestions = await agent['suggestCaching']({
        function: 'expensiveComputation',
        callFrequency: 1000
      });
      expect(suggestions).toContain('memoization');
    });

    it('should optimize memory usage', async () => {
      const optimized = await agent['optimizeMemory']({
        allocations: 1000,
        peakUsage: 500 * 1024 * 1024
      });
      expect(optimized).toHaveProperty('reduction');
    });

    it('should parallelize operations', async () => {
      const parallelized = await agent['parallelizeOps']([
        async () => 1,
        async () => 2,
        async () => 3
      ]);
      expect(parallelized).toHaveLength(3);
    });

    it('should optimize database queries', async () => {
      const optimized = await agent['optimizeQuery']({
        sql: 'SELECT * FROM users WHERE id IN (SELECT ...)',
        type: 'nested'
      });
      expect(optimized).toHaveProperty('optimized');
    });

    it('should reduce bundle size', async () => {
      const reduced = await agent['reduceBundleSize']({
        modules: ['lodash', 'moment'],
        currentSize: 1024 * 1024
      });
      expect(reduced.newSize).toBeLessThan(1024 * 1024);
    });

    it('should optimize render performance', async () => {
      const optimized = await agent['optimizeRendering']({
        components: 50,
        rerenders: 100
      });
      expect(optimized).toHaveProperty('virtualDOM');
    });

    it('should implement lazy loading', async () => {
      const lazy = await agent['implementLazyLoading']({
        routes: ['/home', '/about', '/contact']
      });
      expect(lazy.every(r => r.lazy)).toBe(true);
    });

    it('should optimize network requests', async () => {
      const optimized = await agent['optimizeNetwork']({
        requests: 50,
        duplicates: 10
      });
      expect(optimized.requests).toBeLessThan(50);
    });
  });

  describe('Bottleneck Detection', () => {
    it('should identify CPU bottlenecks', async () => {
      const bottlenecks = await agent['detectCPUBottlenecks']({
        processes: [
          { name: 'heavy', cpu: 95 },
          { name: 'light', cpu: 5 }
        ]
      });
      expect(bottlenecks).toContain('heavy');
    });

    it('should identify memory bottlenecks', async () => {
      const bottlenecks = await agent['detectMemoryBottlenecks']({
        heapUsed: 900 * 1024 * 1024,
        heapTotal: 1024 * 1024 * 1024
      });
      expect(bottlenecks).toBeDefined();
    });

    it('should identify I/O bottlenecks', async () => {
      const bottlenecks = await agent['detectIOBottlenecks']({
        diskOps: 10000,
        avgLatency: 500
      });
      expect(bottlenecks.severity).toBe('high');
    });

    it('should identify network bottlenecks', async () => {
      const bottlenecks = await agent['detectNetworkBottlenecks']({
        latency: 1000,
        throughput: 100
      });
      expect(bottlenecks).toHaveProperty('recommendations');
    });

    it('should profile function execution', async () => {
      const profile = await agent['profileFunction'](async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      expect(profile.duration).toBeGreaterThan(90);
    });

    it('should identify hot paths', async () => {
      const hotPaths = await agent['identifyHotPaths']({
        traces: [
          { path: 'A->B->C', frequency: 1000 },
          { path: 'A->D', frequency: 10 }
        ]
      });
      expect(hotPaths[0].path).toBe('A->B->C');
    });

    it('should measure time complexity', async () => {
      const complexity = await agent['measureComplexity']({
        inputs: [10, 100, 1000],
        times: [1, 10, 100]
      });
      expect(complexity).toBe('O(n)');
    });

    it('should detect memory leaks', async () => {
      const leaks = await agent['detectMemoryLeaks']({
        snapshots: [
          { time: 0, heap: 100 },
          { time: 1000, heap: 200 },
          { time: 2000, heap: 300 }
        ]
      });
      expect(leaks.detected).toBe(true);
    });

    it('should analyze thread contention', async () => {
      const contention = await agent['analyzeContention']({
        threads: 8,
        locks: 100,
        waitTime: 5000
      });
      expect(contention.severity).toBeDefined();
    });

    it('should profile garbage collection', async () => {
      const gcProfile = await agent['profileGC']({
        collections: 100,
        pauseTime: 50
      });
      expect(gcProfile).toHaveProperty('frequency');
    });
  });

  describe('Resource Allocation', () => {
    it('should allocate CPU resources', async () => {
      const allocation = await agent['allocateCPU']({
        tasks: [
          { name: 'high', priority: 10 },
          { name: 'low', priority: 1 }
        ],
        cores: 4
      });
      expect(allocation['high']).toBeGreaterThan(allocation['low']);
    });

    it('should allocate memory resources', async () => {
      const allocation = await agent['allocateMemory']({
        processes: [
          { name: 'large', required: 512 },
          { name: 'small', required: 64 }
        ],
        total: 1024
      });
      expect(allocation['large']).toBe(512);
    });

    it('should balance load across workers', async () => {
      const balanced = await agent['balanceLoad']({
        workers: 4,
        tasks: Array(100).fill({ weight: 1 })
      });
      expect(balanced.every(w => w.length === 25)).toBe(true);
    });

    it('should implement rate limiting', async () => {
      const limiter = await agent['implementRateLimit']({
        maxRequests: 100,
        windowMs: 60000
      });
      expect(limiter).toHaveProperty('limit');
    });

    it('should optimize thread pool size', async () => {
      const optimal = await agent['optimizeThreadPool']({
        cpuCores: 8,
        workload: 'io-bound'
      });
      expect(optimal.threads).toBeGreaterThan(8);
    });

    it('should implement circuit breaker', async () => {
      const breaker = await agent['implementCircuitBreaker']({
        failureThreshold: 5,
        timeout: 10000
      });
      expect(breaker).toHaveProperty('state');
    });

    it('should optimize connection pool', async () => {
      const optimized = await agent['optimizeConnectionPool']({
        min: 2,
        max: 10,
        usage: [5, 8, 3, 9, 7]
      });
      expect(optimized.recommended).toBeDefined();
    });

    it('should implement priority queue', async () => {
      const queue = await agent['implementPriorityQueue']([
        { task: 'low', priority: 1 },
        { task: 'high', priority: 10 }
      ]);
      expect(queue[0].task).toBe('high');
    });

    it('should schedule tasks efficiently', async () => {
      const schedule = await agent['scheduleTasks']({
        tasks: [
          { duration: 10, deadline: 100 },
          { duration: 5, deadline: 50 }
        ]
      });
      expect(schedule[0].deadline).toBe(50);
    });

    it('should implement backpressure', async () => {
      const backpressure = await agent['implementBackpressure']({
        incomingRate: 1000,
        processingRate: 500
      });
      expect(backpressure.applied).toBe(true);
    });
  });

  describe('Caching Strategies', () => {
    it('should implement LRU cache', async () => {
      const cache = await agent['implementLRU']({ capacity: 100 });
      expect(cache).toHaveProperty('set');
      expect(cache).toHaveProperty('get');
    });

    it('should implement LFU cache', async () => {
      const cache = await agent['implementLFU']({ capacity: 100 });
      expect(cache).toHaveProperty('frequency');
    });

    it('should optimize cache hit rate', async () => {
      const optimized = await agent['optimizeCacheHitRate']({
        hits: 700,
        misses: 300,
        capacity: 1000
      });
      expect(optimized.newCapacity).toBeGreaterThan(1000);
    });

    it('should implement write-through cache', async () => {
      const cache = await agent['implementWriteThrough']({
        storage: 'disk',
        cacheSize: 1024
      });
      expect(cache.strategy).toBe('write-through');
    });

    it('should implement cache invalidation', async () => {
      const invalidation = await agent['implementCacheInvalidation']({
        strategy: 'ttl',
        ttl: 3600
      });
      expect(invalidation).toHaveProperty('ttl');
    });
  });

  describe('Integration & Coordination', () => {
    it('should coordinate with other agents', async () => {
      await memoryStore.store('aqe/fleet/status', { agents: 5 }, {
        partition: 'coordination'
      });
      const coordinated = await agent['coordinateOptimization']();
      expect(coordinated).toBe(true);
    });

    it('should share optimization insights', async () => {
      await agent['shareInsights']({
        optimization: 'cache',
        improvement: 2.5
      });
      const stored = await memoryStore.retrieve('aqe/optimizer/insights', {
        partition: 'coordination'
      });
      expect(stored).toBeDefined();
    });

    it('should emit optimization events', async () => {
      const eventPromise = new Promise(resolve => {
        eventBus.on('optimization:complete', resolve);
      });
      agent['emitOptimizationComplete']({ taskId: 'test' });
      await expect(eventPromise).resolves.toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle optimization failures gracefully', async () => {
      const result = await agent['safeOptimize'](async () => {
        throw new Error('Cannot optimize');
      });
      expect(result).toHaveProperty('error');
    });

    it('should retry failed optimizations', async () => {
      let attempts = 0;
      const result = await agent['retryOptimization'](async () => {
        attempts++;
        if (attempts < 3) throw new Error('Fail');
        return { success: true };
      }, 5);
      expect(result.success).toBe(true);
    });
  });
});
