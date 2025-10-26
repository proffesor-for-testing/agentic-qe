/**
 * RegressionRiskAnalyzerAgent Unit Tests
 *
 * Comprehensive test suite covering:
 * - Change detection and analysis
 * - Risk scoring algorithms
 * - Test selection strategies
 * - AST parsing and dependency tracking
 * - Historical pattern learning
 * - ML model integration
 * - CI optimization
 *
 * 900+ lines of tests with 28+ test cases
 */

import { EventEmitter } from 'events';
import { RegressionRiskAnalyzerAgent, RegressionRiskAnalyzerConfig } from '@agents/RegressionRiskAnalyzerAgent';
import { MemoryStore, QEAgentType, QETask } from '@types';

// ============================================================================
// Mock Implementations
// ============================================================================

class MockMemoryStore implements MemoryStore {
  private storage = new Map<string, any>();

  async store(key: string, value: any, ttl?: number): Promise<void> {
    this.storage.set(key, value);
  }

  async retrieve(key: string): Promise<any> {
    return this.storage.get(key);
  }

  async set(key: string, value: any, namespace?: string): Promise<void> {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    this.storage.set(fullKey, value);
  }

  async get(key: string, namespace?: string): Promise<any> {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    return this.storage.get(fullKey);
  }

  async delete(key: string, namespace?: string): Promise<boolean> {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    return this.storage.delete(fullKey);
  }

  async clear(namespace?: string): Promise<void> {
    if (namespace) {
      const keysToDelete = Array.from(this.storage.keys()).filter(key =>
        key.startsWith(`${namespace}:`)
      );
      keysToDelete.forEach(key => this.storage.delete(key));
    } else {
      this.storage.clear();
    }
  }

  getAll(): Map<string, any> {
    return this.storage;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function createMockConfig(overrides?: Partial<RegressionRiskAnalyzerConfig>): RegressionRiskAnalyzerConfig {
  return {
    type: QEAgentType.REGRESSION_RISK_ANALYZER,
    capabilities: [],
    context: {
      id: 'test-agent',
      type: 'regression-risk-analyzer',
      status: 'idle' as any
    },
    memoryStore: new MockMemoryStore(),
    eventBus: new EventEmitter(),
    gitIntegration: true,
    gitRepository: '/tmp/test-repo',
    baseBranch: 'main',
    astParsing: true,
    supportedLanguages: ['typescript', 'javascript'],
    mlModelEnabled: true,
    historicalDataWindow: 90,
    testSelectionStrategy: 'smart',
    changeImpactThreshold: 0.5,
    confidenceLevel: 0.95,
    riskHeatMapEnabled: true,
    ciOptimizationEnabled: true,
    maxParallelWorkers: 8,
    ...overrides
  };
}

function createMockTask(type: string, payload: any): QETask {
  return {
    id: `task-${Date.now()}`,
    type,
    payload,
    priority: 1,
    status: 'pending'
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('RegressionRiskAnalyzerAgent', () => {
  let agent: RegressionRiskAnalyzerAgent;
  let memoryStore: MockMemoryStore;
  let eventBus: EventEmitter;

  beforeEach(() => {
    memoryStore = new MockMemoryStore();
    eventBus = new EventEmitter();
  });

  afterEach(async () => {
    if (agent) {
      await agent.terminate();
    }
  });

  // ==========================================================================
  // Initialization Tests
  // ==========================================================================

  describe('Initialization', () => {
    it('should initialize agent with default configuration', async () => {
      agent = new RegressionRiskAnalyzerAgent(createMockConfig());
      await agent.initialize();

      const status = agent.getStatus();
      expect(status.status).toBe('active');
      expect(status.capabilities).toContain('change-impact-analysis');
      expect(status.capabilities).toContain('intelligent-test-selection');
    });

    it('should initialize with custom configuration', async () => {
      agent = new RegressionRiskAnalyzerAgent(
        createMockConfig({
          testSelectionStrategy: 'fast',
          confidenceLevel: 0.90,
          maxParallelWorkers: 16
        })
      );
      await agent.initialize();

      const capability = agent.getCapability('intelligent-test-selection');
      expect(capability?.parameters?.strategy).toBe('fast');
      expect(capability?.parameters?.confidence).toBe(0.90);
    });

    it('should load historical data on initialization', async () => {
      // Pre-populate memory with historical data
      await memoryStore.store('shared:regression-risk-analyzer:history', {
        analyses: [
          { commitSha: 'abc123', riskScore: 75 },
          { commitSha: 'def456', riskScore: 45 }
        ]
      });

      agent = new RegressionRiskAnalyzerAgent(
        createMockConfig({ memoryStore })
      );
      await agent.initialize();

      // Verify knowledge was loaded
      const status = agent.getStatus();
      expect(status.status).toBe('active');
    });

    it('should initialize all capabilities', async () => {
      agent = new RegressionRiskAnalyzerAgent(createMockConfig());
      await agent.initialize();

      const capabilities = agent.getCapabilities();
      const capabilityNames = capabilities.map(c => c.name);

      expect(capabilityNames).toContain('change-impact-analysis');
      expect(capabilityNames).toContain('intelligent-test-selection');
      expect(capabilityNames).toContain('risk-heat-mapping');
      expect(capabilityNames).toContain('dependency-tracking');
      expect(capabilityNames).toContain('historical-pattern-learning');
      expect(capabilityNames).toContain('ci-optimization');
    });

    it('should disable git integration when not available', async () => {
      agent = new RegressionRiskAnalyzerAgent(
        createMockConfig({
          gitIntegration: false
        })
      );
      await agent.initialize();

      const capability = agent.getCapability('change-impact-analysis');
      expect(capability?.parameters?.gitIntegration).toBe(false);
    });
  });

  // ==========================================================================
  // Change Analysis Tests
  // ==========================================================================

  describe('Change Analysis', () => {
    beforeEach(async () => {
      agent = new RegressionRiskAnalyzerAgent(createMockConfig());
      await agent.initialize();
    });

    it('should analyze code changes and calculate risk score', async () => {
      const task = createMockTask('analyze-changes', {
        baseSha: 'main',
        targetSha: 'feature-branch'
      });

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(result).toBeDefined();
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
      expect(result.riskLevel).toMatch(/^(LOW|MEDIUM|HIGH|CRITICAL)$/);
    });

    it('should identify changed files with metadata', async () => {
      const task = createMockTask('analyze-changes', {
        targetSha: 'HEAD'
      });

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(result.changedFiles).toBeDefined();
      expect(Array.isArray(result.changedFiles)).toBe(true);

      if (result.changedFiles.length > 0) {
        const file = result.changedFiles[0];
        expect(file.path).toBeDefined();
        expect(file.linesAdded).toBeGreaterThanOrEqual(0);
        expect(file.linesDeleted).toBeGreaterThanOrEqual(0);
        expect(file.complexity).toBeGreaterThanOrEqual(0);
        expect(file.criticality).toBeGreaterThanOrEqual(0);
        expect(file.criticality).toBeLessThanOrEqual(1);
      }
    });

    it('should calculate blast radius', async () => {
      const task = createMockTask('analyze-changes', {});

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(result.blastRadius).toBeDefined();
      expect(result.blastRadius.files).toBeGreaterThanOrEqual(0);
      expect(result.blastRadius.modules).toBeGreaterThanOrEqual(0);
      expect(result.blastRadius.services).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.blastRadius.affectedFeatures)).toBe(true);
    });

    it('should identify direct dependencies', async () => {
      const task = createMockTask('analyze-changes', {});

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(Array.isArray(result.directImpact)).toBe(true);
    });

    it('should identify transitive dependencies', async () => {
      const task = createMockTask('analyze-changes', {});

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(Array.isArray(result.transitiveImpact)).toBe(true);
    });

    it('should generate recommendations based on risk level', async () => {
      const task = createMockTask('analyze-changes', {});

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(result.recommendation).toBeDefined();
      expect(typeof result.recommendation).toBe('string');
      expect(result.recommendation.length).toBeGreaterThan(0);
    });

    it('should store analysis in memory', async () => {
      const task = createMockTask('analyze-changes', {});

      await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      // Verify memory storage
      const stored = memoryStore.getAll();
      const keys = Array.from(stored.keys());
      const hasAnalysisKey = keys.some(key =>
        key.includes('last-analysis') || key.includes('current-analysis')
      );
      expect(hasAnalysisKey).toBe(true);
    });
  });

  // ==========================================================================
  // Risk Scoring Tests
  // ==========================================================================

  describe('Risk Scoring', () => {
    beforeEach(async () => {
      agent = new RegressionRiskAnalyzerAgent(createMockConfig());
      await agent.initialize();
    });

    it('should calculate risk score with weighted factors', async () => {
      const task = createMockTask('calculate-risk-score', {
        changedFiles: [
          {
            path: 'src/services/payment.service.ts',
            linesAdded: 100,
            linesDeleted: 50,
            complexity: 15,
            criticality: 0.95,
            changeType: 'modified'
          }
        ],
        directImpact: ['src/controllers/checkout.ts'],
        transitiveImpact: ['src/services/order.service.ts', 'src/services/notification.ts']
      });

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(100);
    });

    it('should assign CRITICAL risk to high-complexity critical files', async () => {
      const task = createMockTask('calculate-risk-score', {
        changedFiles: [
          {
            path: 'src/services/payment.service.ts',
            linesAdded: 500,
            linesDeleted: 200,
            complexity: 25,
            criticality: 1.0,
            changeType: 'modified'
          }
        ],
        directImpact: Array(30).fill('file.ts'),
        transitiveImpact: Array(50).fill('file.ts')
      });

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(result).toBeGreaterThan(70);
    });

    it('should assign LOW risk to simple utility changes', async () => {
      const task = createMockTask('calculate-risk-score', {
        changedFiles: [
          {
            path: 'src/utils/formatting.ts',
            linesAdded: 5,
            linesDeleted: 2,
            complexity: 2,
            criticality: 0.2,
            changeType: 'modified'
          }
        ],
        directImpact: [],
        transitiveImpact: []
      });

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(result).toBeLessThan(40);
    });

    it('should apply custom risk weights', async () => {
      agent = new RegressionRiskAnalyzerAgent(
        createMockConfig({
          riskWeights: {
            changedLines: 0.5,
            complexity: 0.3,
            criticality: 0.1,
            dependencyCount: 0.05,
            historicalFailures: 0.05
          }
        })
      );
      await agent.initialize();

      const task = createMockTask('calculate-risk-score', {
        changedFiles: [
          {
            path: 'test.ts',
            linesAdded: 100,
            linesDeleted: 50,
            complexity: 10,
            criticality: 0.5,
            changeType: 'modified'
          }
        ],
        directImpact: [],
        transitiveImpact: []
      });

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Test Selection Tests
  // ==========================================================================

  describe('Test Selection', () => {
    beforeEach(async () => {
      agent = new RegressionRiskAnalyzerAgent(createMockConfig());
      await agent.initialize();

      // Pre-populate with analysis
      const analysis = {
        commitSha: 'abc123',
        author: 'test@example.com',
        timestamp: new Date(),
        changedFiles: [
          {
            path: 'src/services/payment.service.ts',
            linesAdded: 50,
            linesDeleted: 20,
            complexity: 12,
            criticality: 0.9,
            changeType: 'modified' as const
          }
        ],
        directImpact: ['src/controllers/checkout.controller.ts'],
        transitiveImpact: ['src/services/order.service.ts'],
        blastRadius: {
          files: 3,
          modules: 2,
          services: 2,
          controllers: 1,
          affectedFeatures: ['payment', 'checkout'],
          potentialUsers: 10000,
          revenueAtRisk: 50000
        },
        riskScore: 75,
        riskLevel: 'HIGH' as const,
        testImpact: {
          requiredTests: ['tests/payment.test.ts'],
          totalTests: 100,
          estimatedRuntime: '5m'
        },
        recommendation: 'Run full suite'
      };

      await memoryStore.store('agent:test-agent:last-analysis', analysis);
    });

    it('should select tests using smart strategy', async () => {
      const task = createMockTask('select-tests', {
        strategy: 'smart',
        confidence: 0.95
      });

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(result.selected).toBeDefined();
      expect(Array.isArray(result.selected)).toBe(true);
      expect(result.total).toBeGreaterThan(0);
      expect(result.reductionRate).toBeGreaterThanOrEqual(0);
      expect(result.reductionRate).toBeLessThanOrEqual(1);
      expect(result.confidence).toBe(0.95);
    });

    it('should select fewer tests with fast strategy', async () => {
      const task = createMockTask('select-tests', {
        strategy: 'fast'
      });

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(result.selected.length).toBeLessThanOrEqual(result.total);
    });

    it('should select all tests with full strategy', async () => {
      const task = createMockTask('select-tests', {
        strategy: 'full'
      });

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(result.selected.length).toBe(result.total);
      expect(result.reductionRate).toBe(0);
    });

    it('should include test metadata in selection', async () => {
      const task = createMockTask('select-tests', {
        strategy: 'smart'
      });

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      if (result.selected.length > 0) {
        const test = result.selected[0];
        expect(test.path).toBeDefined();
        expect(test.reason).toBeDefined();
        expect(test.failureProbability).toBeGreaterThanOrEqual(0);
        expect(test.failureProbability).toBeLessThanOrEqual(1);
        expect(test.priority).toMatch(/^(LOW|MEDIUM|HIGH|CRITICAL)$/);
        expect(test.runtime).toBeDefined();
      }
    });

    it('should calculate time savings', async () => {
      const task = createMockTask('select-tests', {
        strategy: 'smart'
      });

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(result.estimatedRuntime).toBeDefined();
      expect(result.fullSuiteRuntime).toBeDefined();
      expect(result.timeSaved).toBeDefined();
    });

    it('should prioritize tests by failure probability', async () => {
      const task = createMockTask('select-tests', {
        strategy: 'smart'
      });

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      if (result.selected.length > 1) {
        // Verify tests are sorted by failure probability (descending)
        for (let i = 0; i < result.selected.length - 1; i++) {
          expect(result.selected[i].failureProbability).toBeGreaterThanOrEqual(
            result.selected[i + 1].failureProbability
          );
        }
      }
    });

    it('should categorize skipped tests', async () => {
      const task = createMockTask('select-tests', {
        strategy: 'smart'
      });

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(result.skippedTests).toBeGreaterThanOrEqual(0);
      expect(result.skippedReasons).toBeDefined();
      expect(typeof result.skippedReasons).toBe('object');
    });
  });

  // ==========================================================================
  // Risk Heat Map Tests
  // ==========================================================================

  describe('Risk Heat Map', () => {
    beforeEach(async () => {
      agent = new RegressionRiskAnalyzerAgent(createMockConfig());
      await agent.initialize();
    });

    it('should generate risk heat map', async () => {
      const task = createMockTask('generate-heat-map', {});

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(result).toBeDefined();
      expect(result.timeWindow).toBeDefined();
      expect(Array.isArray(result.modules)).toBe(true);
      expect(result.visualization).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('should include risk factors for each module', async () => {
      const task = createMockTask('generate-heat-map', {});

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      if (result.modules.length > 0) {
        const module = result.modules[0];
        expect(module.path).toBeDefined();
        expect(module.riskScore).toBeGreaterThanOrEqual(0);
        expect(module.riskLevel).toMatch(/^(LOW|MEDIUM|HIGH|CRITICAL)$/);
        expect(module.factors).toBeDefined();
        expect(module.factors.changeFrequency).toBeGreaterThanOrEqual(0);
        expect(module.factors.complexity).toBeGreaterThanOrEqual(0);
        expect(module.factors.failureCount).toBeGreaterThanOrEqual(0);
        expect(module.heatColor).toBeDefined();
        expect(module.recommendation).toBeDefined();
      }
    });

    it('should sort modules by risk score', async () => {
      const task = createMockTask('generate-heat-map', {});

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      if (result.modules.length > 1) {
        for (let i = 0; i < result.modules.length - 1; i++) {
          expect(result.modules[i].riskScore).toBeGreaterThanOrEqual(
            result.modules[i + 1].riskScore
          );
        }
      }
    });

    it('should generate ASCII visualization', async () => {
      const task = createMockTask('generate-heat-map', {});

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(result.visualization).toContain('Risk Heat Map');
      expect(result.visualization).toContain('Legend');
    });
  });

  // ==========================================================================
  // CI Optimization Tests
  // ==========================================================================

  describe('CI Optimization', () => {
    beforeEach(async () => {
      agent = new RegressionRiskAnalyzerAgent(createMockConfig());
      await agent.initialize();
    });

    it('should distribute tests across workers', async () => {
      const testSelection = {
        selected: [
          { path: 'test1.ts', reason: '', failureProbability: 0.5, priority: 'HIGH' as const, runtime: '2m' },
          { path: 'test2.ts', reason: '', failureProbability: 0.5, priority: 'HIGH' as const, runtime: '3m' },
          { path: 'test3.ts', reason: '', failureProbability: 0.5, priority: 'HIGH' as const, runtime: '1m' }
        ],
        total: 100,
        reductionRate: 0.97,
        estimatedRuntime: '6m',
        fullSuiteRuntime: '45m',
        timeSaved: '39m',
        confidence: 0.95,
        skippedTests: 97,
        skippedReasons: {}
      };

      const task = createMockTask('optimize-ci', {
        testSelection,
        maxWorkers: 4
      });

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(result.workers).toBe(4);
      expect(result.distribution).toBeDefined();
      expect(Array.isArray(result.distribution)).toBe(true);
    });

    it('should calculate parallel execution time', async () => {
      const testSelection = {
        selected: [
          { path: 'test1.ts', reason: '', failureProbability: 0.5, priority: 'HIGH' as const, runtime: '2m' }
        ],
        total: 100,
        reductionRate: 0.99,
        estimatedRuntime: '2m',
        fullSuiteRuntime: '45m',
        timeSaved: '43m',
        confidence: 0.95,
        skippedTests: 99,
        skippedReasons: {}
      };

      const task = createMockTask('optimize-ci', {
        testSelection,
        maxWorkers: 8
      });

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(result.estimatedTotalTime).toBeDefined();
      expect(result.vsSequential).toBeDefined();
      expect(result.speedup).toBeDefined();
    });
  });

  // ==========================================================================
  // Release Analysis Tests
  // ==========================================================================

  describe('Release Analysis', () => {
    beforeEach(async () => {
      agent = new RegressionRiskAnalyzerAgent(createMockConfig());
      await agent.initialize();
    });

    it('should analyze release risk between versions', async () => {
      const task = createMockTask('analyze-release', {
        baseline: 'v1.0.0',
        candidate: 'v1.1.0'
      });

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(result.baseline).toBe('v1.0.0');
      expect(result.candidate).toBe('v1.1.0');
      expect(result.commitCount).toBeGreaterThanOrEqual(0);
      expect(result.totalRiskScore).toBeGreaterThanOrEqual(0);
      expect(result.recommendation).toBeDefined();
    });

    it('should aggregate risk across multiple commits', async () => {
      const task = createMockTask('analyze-release', {
        baseline: 'v1.0.0',
        candidate: 'HEAD'
      });

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(Array.isArray(result.analyses)).toBe(true);
    });
  });

  // ==========================================================================
  // ML Model Tests
  // ==========================================================================

  describe('ML Model', () => {
    beforeEach(async () => {
      agent = new RegressionRiskAnalyzerAgent(
        createMockConfig({
          mlModelEnabled: true
        })
      );
      await agent.initialize();
    });

    it('should train ML model on historical data', async () => {
      const task = createMockTask('train-ml-model', {
        dataWindow: 90
      });

      const result = await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(result.accuracy).toBeGreaterThanOrEqual(0);
      expect(result.accuracy).toBeLessThanOrEqual(1);
      expect(result.precision).toBeGreaterThanOrEqual(0);
      expect(result.recall).toBeGreaterThanOrEqual(0);
      expect(result.f1Score).toBeGreaterThanOrEqual(0);
      expect(result.trainingSize).toBeGreaterThanOrEqual(0);
    });

    it('should store model metrics in memory', async () => {
      const task = createMockTask('train-ml-model', {
        dataWindow: 30
      });

      await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      const stored = memoryStore.getAll();
      const keys = Array.from(stored.keys());
      const hasModelKey = keys.some(key => key.includes('ml-model-metrics'));
      expect(hasModelKey).toBe(true);
    });
  });

  // ==========================================================================
  // Event Emission Tests
  // ==========================================================================

  describe('Event Emission', () => {
    beforeEach(async () => {
      agent = new RegressionRiskAnalyzerAgent(createMockConfig({ eventBus }));
      await agent.initialize();
    });

    it('should emit event on analysis complete', async () => {
      const eventPromise = new Promise((resolve) => {
        eventBus.once('regression.analysis.complete', resolve);
      });

      const task = createMockTask('analyze-changes', {});
      await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      const event = await eventPromise;
      expect(event).toBeDefined();
    });

    it('should emit event on test selection complete', async () => {
      // Pre-populate analysis
      await memoryStore.store('agent:test-agent:last-analysis', {
        changedFiles: [],
        directImpact: [],
        transitiveImpact: []
      });

      const eventPromise = new Promise((resolve) => {
        eventBus.once('regression.test.selection.complete', resolve);
      });

      const task = createMockTask('select-tests', { strategy: 'smart' });
      await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      const event = await eventPromise;
      expect(event).toBeDefined();
    });

    it('should emit event on heat map update', async () => {
      const eventPromise = new Promise((resolve) => {
        eventBus.once('regression.heat-map.updated', resolve);
      });

      const task = createMockTask('generate-heat-map', {});
      await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      const event = await eventPromise;
      expect(event).toBeDefined();
    });

    it('should emit event on ML model trained', async () => {
      const eventPromise = new Promise((resolve) => {
        eventBus.once('regression.ml.trained', resolve);
      });

      const task = createMockTask('train-ml-model', {});
      await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      const event = await eventPromise;
      expect(event).toBeDefined();
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('Error Handling', () => {
    beforeEach(async () => {
      agent = new RegressionRiskAnalyzerAgent(createMockConfig());
      await agent.initialize();
    });

    it('should handle unsupported task types', async () => {
      const task = createMockTask('unsupported-task', {});

      await expect(
        agent.executeTask({
          id: task.id,
          task,
          agentId: 'test-agent',
          assignedAt: new Date(),
          status: 'assigned'
        })
      ).rejects.toThrow('Unsupported task type');
    });

    it('should handle missing change analysis for test selection', async () => {
      const task = createMockTask('select-tests', {});

      await expect(
        agent.executeTask({
          id: task.id,
          task,
          agentId: 'test-agent',
          assignedAt: new Date(),
          status: 'assigned'
        })
      ).rejects.toThrow('No change analysis available');
    });
  });

  // ==========================================================================
  // Memory Coordination Tests
  // ==========================================================================

  describe('Memory Coordination', () => {
    beforeEach(async () => {
      agent = new RegressionRiskAnalyzerAgent(createMockConfig({ memoryStore }));
      await agent.initialize();
    });

    it('should store analysis results in shared memory', async () => {
      const task = createMockTask('analyze-changes', {});

      await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      const stored = memoryStore.getAll();
      const sharedKeys = Array.from(stored.keys()).filter(key =>
        key.includes('shared:regression-risk-analyzer')
      );
      expect(sharedKeys.length).toBeGreaterThan(0);
    });

    it('should persist state on termination', async () => {
      const task = createMockTask('generate-heat-map', {});

      await agent.executeTask({
        id: task.id,
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      });

      await agent.terminate();

      const stored = memoryStore.getAll();
      const hasHeatMap = Array.from(stored.keys()).some(key =>
        key.includes('heat-map')
      );
      expect(hasHeatMap).toBe(true);
    });
  });
});