import { AnalystAgent } from '../../../src/agents/AnalystAgent';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { EventBus } from '../../../src/core/EventBus';
import { TaskAssignment } from '../../../src/core/types';
import * as path from 'path';
import * as fs from 'fs-extra';

describe('AnalystAgent Comprehensive Tests', () => {
  let agent: AnalystAgent;
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventBus;
  const testDbPath = path.join(process.cwd(), '.swarm/test-analyst.db');

  beforeAll(async () => {
    await fs.ensureDir(path.dirname(testDbPath));
    memoryStore = new SwarmMemoryManager(testDbPath);
    await memoryStore.initialize();
    eventBus = EventBus.getInstance();
    await eventBus.initialize();
  });

  beforeEach(async () => {
    agent = new AnalystAgent('analyst-test-001');
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

  describe('Analysis Capabilities', () => {
    it('should analyze code quality metrics', async () => {
      const task: TaskAssignment = {
        id: 'task-001',
        agentId: agent['agentId'],
        task: { id: 'analyze-quality', description: 'Analyze code quality' },
        priority: 'high',
        status: 'assigned',
        assignedAt: Date.now()
      };

      const result = await agent.executeTask(task);
      expect(result).toBeDefined();
      expect(result.status).toBe('completed');
    });

    it('should detect code patterns', async () => {
      const patterns = await agent['detectPatterns']({
        code: 'function test() { return true; }',
        language: 'typescript'
      });
      expect(patterns).toBeInstanceOf(Array);
    });

    it('should generate insights from data', async () => {
      const insights = await agent['generateInsights']({
        metrics: { complexity: 10, coverage: 0.8 }
      });
      expect(insights).toHaveProperty('recommendations');
    });

    it('should calculate complexity scores', async () => {
      const score = await agent['calculateComplexity']('function a() {}');
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should identify bottlenecks', async () => {
      const bottlenecks = await agent['identifyBottlenecks']({
        performance: [{ name: 'slow', time: 1000 }]
      });
      expect(bottlenecks).toBeInstanceOf(Array);
    });

    it('should analyze dependencies', async () => {
      const deps = await agent['analyzeDependencies'](['package.json']);
      expect(deps).toHaveProperty('dependencies');
    });

    it('should detect security vulnerabilities', async () => {
      const vulns = await agent['detectVulnerabilities']({
        packages: ['old-package@1.0.0']
      });
      expect(vulns).toBeInstanceOf(Array);
    });

    it('should generate quality reports', async () => {
      const report = await agent['generateQualityReport']({
        coverage: 0.8,
        complexity: 5
      });
      expect(report).toHaveProperty('score');
    });

    it('should analyze test coverage', async () => {
      const coverage = await agent['analyzeTestCoverage']({
        statements: 80,
        branches: 70
      });
      expect(coverage).toHaveProperty('percentage');
    });

    it('should detect code smells', async () => {
      const smells = await agent['detectCodeSmells']('function veryLongFunction() {}');
      expect(smells).toBeInstanceOf(Array);
    });
  });

  describe('Data Processing', () => {
    it('should process large datasets', async () => {
      const data = Array(1000).fill({ value: Math.random() });
      const result = await agent['processDataset'](data);
      expect(result).toBeDefined();
    });

    it('should aggregate metrics', async () => {
      const metrics = [
        { name: 'test1', value: 10 },
        { name: 'test2', value: 20 }
      ];
      const aggregated = await agent['aggregateMetrics'](metrics);
      expect(aggregated).toHaveProperty('total');
    });

    it('should filter irrelevant data', async () => {
      const filtered = await agent['filterData']([1, 2, 3, 4, 5], n => n > 2);
      expect(filtered).toEqual([3, 4, 5]);
    });

    it('should transform data structures', async () => {
      const transformed = await agent['transformData']({ a: 1 }, { a: 'number' });
      expect(transformed).toBeDefined();
    });

    it('should validate data integrity', async () => {
      const valid = await agent['validateData']({ required: 'value' }, ['required']);
      expect(valid).toBe(true);
    });

    it('should handle missing data gracefully', async () => {
      const result = await agent['handleMissingData']({ incomplete: true });
      expect(result).toHaveProperty('handled');
    });

    it('should normalize data values', async () => {
      const normalized = await agent['normalizeData']([10, 20, 30]);
      expect(normalized.every(n => n >= 0 && n <= 1)).toBe(true);
    });

    it('should detect anomalies in data', async () => {
      const anomalies = await agent['detectAnomalies']([1, 1, 1, 100, 1]);
      expect(anomalies).toContain(100);
    });

    it('should correlate data points', async () => {
      const correlation = await agent['correlateData']([1, 2, 3], [2, 4, 6]);
      expect(typeof correlation).toBe('number');
    });

    it('should sample data efficiently', async () => {
      const sample = await agent['sampleData'](Array(1000).fill(0), 100);
      expect(sample.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Report Generation', () => {
    it('should generate markdown reports', async () => {
      const markdown = await agent['generateMarkdownReport']({
        title: 'Test Report',
        data: { key: 'value' }
      });
      expect(markdown).toContain('# Test Report');
    });

    it('should generate JSON reports', async () => {
      const json = await agent['generateJSONReport']({ metrics: [] });
      expect(typeof json).toBe('string');
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should generate HTML reports', async () => {
      const html = await agent['generateHTMLReport']({ content: 'test' });
      expect(html).toContain('<html');
    });

    it('should include visualizations', async () => {
      const report = await agent['addVisualizations']({
        charts: [{ type: 'bar', data: [] }]
      });
      expect(report).toHaveProperty('visualizations');
    });

    it('should format timestamps correctly', async () => {
      const formatted = await agent['formatTimestamp'](Date.now());
      expect(formatted).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('should highlight critical issues', async () => {
      const highlighted = await agent['highlightIssues']([
        { severity: 'critical', message: 'Error' }
      ]);
      expect(highlighted[0]).toHaveProperty('highlighted');
    });

    it('should generate executive summaries', async () => {
      const summary = await agent['generateSummary']({
        details: 'Long detailed report...'
      });
      expect(summary.length).toBeLessThan(500);
    });

    it('should create comparison reports', async () => {
      const comparison = await agent['compareReports'](
        { score: 80 },
        { score: 90 }
      );
      expect(comparison).toHaveProperty('difference');
    });

    it('should export reports to multiple formats', async () => {
      const exports = await agent['exportReport']({ data: {} }, ['json', 'md']);
      expect(exports).toHaveProperty('json');
      expect(exports).toHaveProperty('md');
    });

    it('should schedule report generation', async () => {
      const scheduled = await agent['scheduleReport']({
        interval: '1h',
        type: 'quality'
      });
      expect(scheduled).toHaveProperty('scheduleId');
    });
  });

  describe('Memory Integration', () => {
    it('should store analysis results', async () => {
      await agent['storeAnalysis']('test-key', { result: 'data' });
      const stored = await memoryStore.retrieve('aqe/analyst/test-key', {
        partition: 'coordination'
      });
      expect(stored).toBeDefined();
    });

    it('should retrieve historical data', async () => {
      await memoryStore.store('aqe/analyst/history', { value: 123 }, {
        partition: 'coordination'
      });
      const data = await agent['retrieveHistory']('history');
      expect(data).toBeDefined();
    });

    it('should cache expensive computations', async () => {
      const result1 = await agent['cachedComputation']('key1', async () => 42);
      const result2 = await agent['cachedComputation']('key1', async () => 99);
      expect(result1).toBe(result2);
    });
  });

  describe('Event Handling', () => {
    it('should emit analysis complete events', async () => {
      const eventPromise = new Promise(resolve => {
        eventBus.on('analysis:complete', resolve);
      });

      agent['emitAnalysisComplete']({ taskId: 'test' });
      await expect(eventPromise).resolves.toBeDefined();
    });

    it('should handle fleet status events', async () => {
      const handled = await agent['handleFleetStatus']({
        type: 'fleet.status',
        payload: { agents: 5 }
      });
      expect(handled).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should recover from analysis failures', async () => {
      const result = await agent['analyzeWithRetry'](async () => {
        throw new Error('Temporary failure');
      }, 3);
      expect(result).toBeDefined();
    });

    it('should log errors properly', async () => {
      await expect(
        agent['logError'](new Error('Test error'))
      ).resolves.not.toThrow();
    });

    it('should handle malformed input', async () => {
      const result = await agent['safeAnalyze'](null);
      expect(result).toHaveProperty('error');
    });
  });
});
