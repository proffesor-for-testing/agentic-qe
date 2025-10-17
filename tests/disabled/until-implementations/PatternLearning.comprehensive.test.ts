import { PatternLearningSystem } from '../../../src/learning/PatternLearningSystem';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { EventBus } from '../../../src/core/EventBus';
import * as path from 'path';
import * as fs from 'fs-extra';

describe('PatternLearning Comprehensive Tests', () => {
  let learningSystem: PatternLearningSystem;
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventBus;
  const testDbPath = path.join(process.cwd(), '.swarm/test-pattern-learning.db');

  beforeAll(async () => {
    await fs.ensureDir(path.dirname(testDbPath));
    memoryStore = new SwarmMemoryManager(testDbPath);
    await memoryStore.initialize();
    eventBus = EventBus.getInstance();
    await eventBus.initialize();
  });

  beforeEach(() => {
    learningSystem = new PatternLearningSystem(memoryStore, eventBus);
  });

  afterAll(async () => {
    await eventBus.shutdown();
    await memoryStore.close();
    await fs.remove(testDbPath);
  });

  describe('Pattern Recognition', () => {
    it('should recognize success patterns', async () => {
      const patterns = await learningSystem.recognizeSuccessPatterns([
        { action: 'test-generation', outcome: 'success', context: { framework: 'jest' } },
        { action: 'test-generation', outcome: 'success', context: { framework: 'jest' } },
        { action: 'test-generation', outcome: 'failure', context: { framework: 'mocha' } }
      ]);
      expect(patterns).toContain('jest-success');
    });

    it('should recognize failure patterns', async () => {
      const patterns = await learningSystem.recognizeFailurePatterns([
        { action: 'deploy', outcome: 'failure', error: 'timeout' },
        { action: 'deploy', outcome: 'failure', error: 'timeout' },
        { action: 'deploy', outcome: 'success', error: null }
      ]);
      expect(patterns).toContain('deploy-timeout');
    });

    it('should identify temporal patterns', async () => {
      const events = [
        { type: 'error', timestamp: Date.now() },
        { type: 'error', timestamp: Date.now() + 1000 },
        { type: 'error', timestamp: Date.now() + 2000 }
      ];
      const temporal = await learningSystem.identifyTemporalPatterns(events);
      expect(temporal.frequency).toBe('regular');
    });

    it('should detect sequential patterns', async () => {
      const sequences = [
        ['A', 'B', 'C', 'success'],
        ['A', 'B', 'C', 'success'],
        ['A', 'D', 'failure']
      ];
      const pattern = await learningSystem.detectSequentialPattern(sequences);
      expect(pattern.sequence).toEqual(['A', 'B', 'C']);
    });

    it('should recognize code patterns', async () => {
      const codeSnippets = [
        'function test() { expect(true).toBe(true); }',
        'function test2() { expect(false).toBe(false); }',
        'function test3() { expect(1).toBe(1); }'
      ];
      const patterns = await learningSystem.recognizeCodePatterns(codeSnippets);
      expect(patterns).toContain('expect-pattern');
    });

    it('should identify anti-patterns', async () => {
      const code = [
        'var globalVar = 10;',
        'function foo() { return globalVar; }',
        'function bar() { globalVar++; }'
      ];
      const antiPatterns = await learningSystem.identifyAntiPatterns(code);
      expect(antiPatterns).toContain('global-state');
    });

    it('should detect error patterns', async () => {
      const errors = [
        { message: 'Connection timeout', code: 'ETIMEDOUT' },
        { message: 'Connection timeout', code: 'ETIMEDOUT' },
        { message: 'Invalid input', code: 'EINVAL' }
      ];
      const patterns = await learningSystem.detectErrorPatterns(errors);
      expect(patterns[0].type).toBe('ETIMEDOUT');
      expect(patterns[0].frequency).toBe(2);
    });

    it('should recognize performance patterns', async () => {
      const metrics = [
        { operation: 'query', duration: 1000 },
        { operation: 'query', duration: 1100 },
        { operation: 'query', duration: 900 }
      ];
      const pattern = await learningSystem.recognizePerformancePattern(metrics);
      expect(pattern.avgDuration).toBeCloseTo(1000, -1);
    });

    it('should identify usage patterns', async () => {
      const usage = [
        { feature: 'auth', timestamp: Date.now(), user: 'user1' },
        { feature: 'auth', timestamp: Date.now() + 100, user: 'user2' },
        { feature: 'dashboard', timestamp: Date.now() + 200, user: 'user1' }
      ];
      const patterns = await learningSystem.identifyUsagePatterns(usage);
      expect(patterns.mostUsed).toBe('auth');
    });

    it('should detect clustering patterns', async () => {
      const dataPoints = [
        { x: 1, y: 1 },
        { x: 1.5, y: 1.2 },
        { x: 10, y: 10 },
        { x: 10.5, y: 10.2 }
      ];
      const clusters = await learningSystem.detectClusters(dataPoints);
      expect(clusters).toHaveLength(2);
    });
  });

  describe('Pattern Learning', () => {
    it('should learn from successful outcomes', async () => {
      await learningSystem.learnFromSuccess({
        action: 'optimization',
        context: { algorithm: 'cache' },
        improvement: 2.5
      });
      const learned = await learningSystem.getLearnedPattern('optimization');
      expect(learned.confidence).toBeGreaterThan(0);
    });

    it('should learn from failures', async () => {
      await learningSystem.learnFromFailure({
        action: 'deployment',
        context: { environment: 'production' },
        error: 'insufficient-resources'
      });
      const learned = await learningSystem.getLearnedPattern('deployment');
      expect(learned.warnings).toContain('insufficient-resources');
    });

    it('should update pattern confidence', async () => {
      await learningSystem.recordPatternMatch('test-pattern', true);
      await learningSystem.recordPatternMatch('test-pattern', true);
      await learningSystem.recordPatternMatch('test-pattern', false);

      const pattern = await learningSystem.getPattern('test-pattern');
      expect(pattern.confidence).toBeCloseTo(0.67, 1);
    });

    it('should decay old patterns', async () => {
      await learningSystem.addPattern('old-pattern', {
        timestamp: Date.now() - 90 * 24 * 60 * 60 * 1000 // 90 days ago
      });
      await learningSystem.decayPatterns(30); // Decay patterns older than 30 days
      const pattern = await learningSystem.getPattern('old-pattern');
      expect(pattern.confidence).toBeLessThan(1);
    });

    it('should reinforce frequently used patterns', async () => {
      for (let i = 0; i < 10; i++) {
        await learningSystem.usePattern('frequent-pattern');
      }
      const pattern = await learningSystem.getPattern('frequent-pattern');
      expect(pattern.useCount).toBe(10);
      expect(pattern.confidence).toBeGreaterThan(0.5);
    });

    it('should merge similar patterns', async () => {
      await learningSystem.addPattern('pattern-a', { features: ['f1', 'f2'] });
      await learningSystem.addPattern('pattern-b', { features: ['f1', 'f2', 'f3'] });
      await learningSystem.mergeSimilarPatterns(0.8); // 80% similarity threshold
      const merged = await learningSystem.getPattern('pattern-a');
      expect(merged.merged).toBe(true);
    });

    it('should learn optimal parameters', async () => {
      const results = [
        { params: { threads: 4 }, performance: 100 },
        { params: { threads: 8 }, performance: 180 },
        { params: { threads: 16 }, performance: 150 }
      ];
      const optimal = await learningSystem.learnOptimalParams(results, 'threads');
      expect(optimal.threads).toBe(8);
    });

    it('should learn from expert feedback', async () => {
      await learningSystem.incorporateExpertFeedback({
        pattern: 'test-generation',
        feedback: 'good',
        expert: 'senior-dev',
        weight: 2.0
      });
      const pattern = await learningSystem.getPattern('test-generation');
      expect(pattern.expertApproved).toBe(true);
    });

    it('should implement transfer learning', async () => {
      await learningSystem.addPattern('source-pattern', {
        domain: 'testing',
        knowledge: { coverage: 0.9 }
      });
      await learningSystem.transferLearning('source-pattern', 'target-domain');
      const transferred = await learningSystem.getPattern('target-domain-pattern');
      expect(transferred).toBeDefined();
    });

    it('should learn hierarchical patterns', async () => {
      await learningSystem.learnHierarchy([
        { level: 1, pattern: 'unit-test' },
        { level: 2, pattern: 'integration-test' },
        { level: 3, pattern: 'e2e-test' }
      ]);
      const hierarchy = await learningSystem.getPatternHierarchy();
      expect(hierarchy.levels).toBe(3);
    });
  });

  describe('Pattern Prediction', () => {
    it('should predict next pattern in sequence', async () => {
      await learningSystem.learnSequence(['A', 'B', 'C', 'D']);
      await learningSystem.learnSequence(['A', 'B', 'C', 'D']);
      const predicted = await learningSystem.predictNext(['A', 'B', 'C']);
      expect(predicted).toBe('D');
    });

    it('should predict outcome probability', async () => {
      await learningSystem.recordOutcome('action-1', 'success');
      await learningSystem.recordOutcome('action-1', 'success');
      await learningSystem.recordOutcome('action-1', 'failure');
      const probability = await learningSystem.predictOutcome('action-1');
      expect(probability.success).toBeCloseTo(0.67, 1);
    });

    it('should predict execution time', async () => {
      await learningSystem.recordExecution('task-1', 100);
      await learningSystem.recordExecution('task-1', 120);
      await learningSystem.recordExecution('task-1', 110);
      const predicted = await learningSystem.predictExecutionTime('task-1');
      expect(predicted).toBeCloseTo(110, -1);
    });

    it('should predict resource requirements', async () => {
      await learningSystem.recordResourceUsage('job-1', { cpu: 80, memory: 512 });
      await learningSystem.recordResourceUsage('job-1', { cpu: 85, memory: 520 });
      const predicted = await learningSystem.predictResourceNeeds('job-1');
      expect(predicted.cpu).toBeCloseTo(82.5, 0);
    });

    it('should predict bottlenecks', async () => {
      const history = [
        { component: 'database', load: 90 },
        { component: 'database', load: 95 },
        { component: 'api', load: 50 }
      ];
      const predicted = await learningSystem.predictBottleneck(history);
      expect(predicted.component).toBe('database');
    });

    it('should predict optimal configuration', async () => {
      const history = [
        { config: { cacheSize: 100 }, performance: 80 },
        { config: { cacheSize: 200 }, performance: 90 },
        { config: { cacheSize: 300 }, performance: 85 }
      ];
      const optimal = await learningSystem.predictOptimalConfig(history);
      expect(optimal.cacheSize).toBe(200);
    });
  });

  describe('Pattern Storage & Retrieval', () => {
    it('should store patterns in memory', async () => {
      await learningSystem.storePattern('test-pattern', {
        confidence: 0.9,
        frequency: 10
      });
      const stored = await memoryStore.retrieve('aqe/patterns/test-pattern', {
        partition: 'learning'
      });
      expect(stored).toBeDefined();
    });

    it('should retrieve patterns by category', async () => {
      await learningSystem.storePattern('test-1', { category: 'testing' });
      await learningSystem.storePattern('opt-1', { category: 'optimization' });
      const patterns = await learningSystem.getPatternsByCategory('testing');
      expect(patterns).toHaveLength(1);
    });

    it('should query patterns by confidence', async () => {
      await learningSystem.storePattern('high', { confidence: 0.9 });
      await learningSystem.storePattern('low', { confidence: 0.3 });
      const highConfidence = await learningSystem.getPatternsByConfidence(0.8);
      expect(highConfidence).toHaveLength(1);
      expect(highConfidence[0].id).toBe('high');
    });

    it('should export pattern database', async () => {
      await learningSystem.storePattern('p1', { data: 'test' });
      await learningSystem.storePattern('p2', { data: 'test2' });
      const exported = await learningSystem.exportPatterns();
      expect(exported.patterns).toHaveLength(2);
    });

    it('should import pattern database', async () => {
      const patterns = {
        patterns: [
          { id: 'imported-1', confidence: 0.8 },
          { id: 'imported-2', confidence: 0.7 }
        ]
      };
      await learningSystem.importPatterns(patterns);
      const imported = await learningSystem.getPattern('imported-1');
      expect(imported).toBeDefined();
    });
  });

  describe('Pattern Optimization', () => {
    it('should optimize pattern matching speed', async () => {
      const patterns = Array(1000).fill(null).map((_, i) => ({
        id: `pattern-${i}`,
        features: Array(10).fill(null).map((_, j) => `f${j}`)
      }));
      await learningSystem.buildPatternIndex(patterns);
      const start = Date.now();
      await learningSystem.matchPattern({ features: ['f1', 'f2'] });
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(10); // Should be very fast with index
    });

    it('should compress pattern storage', async () => {
      const largePattern = {
        id: 'large',
        data: Array(1000).fill('x').join('')
      };
      await learningSystem.storePattern('large', largePattern);
      await learningSystem.compressPatterns();
      const compressed = await learningSystem.getPattern('large');
      expect(compressed.compressed).toBe(true);
    });

    it('should prune low-confidence patterns', async () => {
      await learningSystem.storePattern('low-conf', { confidence: 0.1 });
      await learningSystem.storePattern('high-conf', { confidence: 0.9 });
      await learningSystem.prunePatterns(0.5); // Remove patterns below 0.5
      const patterns = await learningSystem.getAllPatterns();
      expect(patterns.find(p => p.id === 'low-conf')).toBeUndefined();
    });
  });

  describe('Event Handling', () => {
    it('should emit pattern learned events', async () => {
      const eventPromise = new Promise(resolve => {
        eventBus.on('pattern:learned', resolve);
      });
      await learningSystem.learnFromSuccess({ action: 'test' });
      await expect(eventPromise).resolves.toBeDefined();
    });

    it('should handle pattern update events', async () => {
      const handled = await learningSystem.handlePatternUpdate({
        type: 'pattern.update',
        payload: { patternId: 'test' }
      });
      expect(handled).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle learning failures gracefully', async () => {
      const result = await learningSystem.safeLearning(async () => {
        throw new Error('Learning failed');
      });
      expect(result).toHaveProperty('error');
    });

    it('should recover from corrupted patterns', async () => {
      await memoryStore.store('aqe/patterns/corrupt', 'invalid-json', {
        partition: 'learning'
      });
      const pattern = await learningSystem.getPattern('corrupt');
      expect(pattern).toBeNull();
    });
  });
});
