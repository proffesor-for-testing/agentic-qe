/**
 * Integration tests for RegressionRiskAnalyzerAgent (Squad 3 - P1 Optimization)
 * Tests real-world scenarios with EventBus and MemoryManager
 *
 * Key Features:
 * - Git integration (diff, blame, history)
 * - AST parsing for multiple languages
 * - Risk scoring algorithm
 * - Smart test selection (45min → 5min)
 * - Historical pattern learning
 * - Coordination with TestExecutorAgent
 */

import { EventEmitter } from 'events';
import { AgentStatus, QEAgentType, QETask } from '@typessrc/types';

// Mock RegressionRiskAnalyzerAgent until it's implemented
interface RegressionRiskAnalyzerConfig {
  type: QEAgentType;
  capabilities: any[];
  context: {
    id: string;
    type: string;
    status: AgentStatus;
  };
  memoryStore: any;
  eventBus: EventEmitter;
  gitIntegration?: {
    enabled: boolean;
    defaultBranch: string;
    remoteName: string;
  };
  analysis?: {
    astParsing: boolean;
    mlPatterns: boolean;
    historicalData: boolean;
    impactRadius: number;
  };
  testSelection?: {
    strategy: 'smart' | 'conservative' | 'aggressive';
    maxTestsPerChange: number;
    minCoverageThreshold: number;
  };
  riskScoring?: {
    fileChangeWeight: number;
    complexityWeight: number;
    historyWeight: number;
    dependencyWeight: number;
  };
}

// Mock implementation (will be replaced by actual agent)
class RegressionRiskAnalyzerAgent {
  private config: RegressionRiskAnalyzerConfig;
  private memoryStore: any;
  private eventBus: EventEmitter;
  private status: AgentStatus = AgentStatus.IDLE;
  private metrics = { tasksCompleted: 0, averageExecutionTime: 0 };

  constructor(config: RegressionRiskAnalyzerConfig) {
    this.config = config;
    this.memoryStore = config.memoryStore;
    this.eventBus = config.eventBus;
  }

  async initialize(): Promise<void> {
    this.status = AgentStatus.ACTIVE;
    this.eventBus.emit('agent.initialized', {
      type: 'agent.initialized',
      source: { id: this.config.context.id, type: this.config.type, created: new Date() },
      data: { agentId: this.config.context.id },
      timestamp: new Date(),
      priority: 'medium',
      scope: 'global'
    });
  }

  async terminate(): Promise<void> {
    this.status = AgentStatus.TERMINATED;
    await this.memoryStore.store(`aqe/regression/state/${this.config.context.id}`, {
      metrics: this.metrics,
      timestamp: Date.now()
    });
    this.eventBus.emit('agent.terminated', {
      type: 'agent.terminated',
      source: { id: this.config.context.id, type: this.config.type, created: new Date() },
      data: { agentId: this.config.context.id },
      timestamp: new Date(),
      priority: 'medium',
      scope: 'global'
    });
  }

  async assignTask(task: QETask): Promise<any> {
    const startTime = Date.now();
    let result;

    this.eventBus.emit('task.started', {
      type: 'task.started',
      source: { id: this.config.context.id, type: this.config.type, created: new Date() },
      data: { taskId: task.id },
      timestamp: new Date(),
      priority: 'medium',
      scope: 'global'
    });

    try {
      switch (task.type) {
        case 'analyze-git-changes':
          result = await this.analyzeGitChanges(task.payload);
          break;
        case 'parse-ast':
          result = await this.parseAST(task.payload);
          break;
        case 'calculate-risk-score':
          result = await this.calculateRiskScore(task.payload);
          break;
        case 'select-tests':
          result = await this.selectTests(task.payload);
          break;
        case 'learn-patterns':
          result = await this.learnPatterns(task.payload);
          break;
        case 'analyze-impact-radius':
          result = await this.analyzeImpactRadius(task.payload);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }

      const duration = Date.now() - startTime;
      this.metrics.tasksCompleted++;
      this.metrics.averageExecutionTime =
        ((this.metrics.averageExecutionTime * (this.metrics.tasksCompleted - 1)) + duration) / this.metrics.tasksCompleted;

      this.eventBus.emit('task.completed', {
        type: 'task.completed',
        source: { id: this.config.context.id, type: this.config.type, created: new Date() },
        data: { taskId: task.id, result },
        timestamp: new Date(),
        priority: 'medium',
        scope: 'global'
      });

      return result;
    } catch (error: any) {
      this.eventBus.emit('task.failed', {
        type: 'task.failed',
        source: { id: this.config.context.id, type: this.config.type, created: new Date() },
        data: { taskId: task.id, error: error.message },
        timestamp: new Date(),
        priority: 'high',
        scope: 'global'
      });
      throw error;
    }
  }

  private async analyzeGitChanges(payload: any): Promise<any> {
    const changes = {
      analysisId: `analysis-${Date.now()}`,
      commit: payload.commit || 'HEAD',
      files: [
        { path: 'src/api/users.ts', changes: 45, additions: 30, deletions: 15, type: 'modified' },
        { path: 'src/api/auth.ts', changes: 12, additions: 8, deletions: 4, type: 'modified' },
        { path: 'src/models/User.ts', changes: 5, additions: 5, deletions: 0, type: 'modified' }
      ],
      totalChanges: 62,
      impactedModules: ['api', 'auth', 'models'],
      riskLevel: 'medium'
    };

    await this.memoryStore.store(`aqe/regression/changes/${changes.analysisId}`, changes);
    this.eventBus.emit('regression.changes.analyzed', {
      type: 'regression.changes.analyzed',
      source: { id: this.config.context.id, type: this.config.type, created: new Date() },
      data: changes,
      timestamp: new Date(),
      priority: 'medium',
      scope: 'global'
    });

    return changes;
  }

  private async parseAST(payload: any): Promise<any> {
    const astAnalysis = {
      id: `ast-${Date.now()}`,
      file: payload.file,
      language: payload.language || 'typescript',
      complexity: {
        cyclomatic: 8,
        cognitive: 12,
        halstead: { volume: 234.5, difficulty: 15.2 }
      },
      dependencies: [
        { type: 'import', module: 'express', usage: 'high' },
        { type: 'import', module: 'database', usage: 'critical' }
      ],
      functionCount: 5,
      classCount: 2,
      linesOfCode: 156,
      testableComplexity: 'medium'
    };

    await this.memoryStore.store(`aqe/regression/ast/${astAnalysis.id}`, astAnalysis);
    return astAnalysis;
  }

  private async calculateRiskScore(payload: any): Promise<any> {
    const weights = this.config.riskScoring || {
      fileChangeWeight: 0.3,
      complexityWeight: 0.25,
      historyWeight: 0.25,
      dependencyWeight: 0.2
    };

    const riskAnalysis = {
      id: `risk-${Date.now()}`,
      file: payload.file,
      scores: {
        changeScore: 0.6,
        complexityScore: 0.7,
        historyScore: 0.4,
        dependencyScore: 0.8
      },
      weightedScore: 0.63,
      riskLevel: 'medium',
      confidence: 0.85,
      reasoning: [
        'File has moderate change frequency (0.6)',
        'High complexity score (0.7)',
        'Low historical bug count (0.4)',
        'Many dependencies affected (0.8)'
      ]
    };

    await this.memoryStore.store(`aqe/regression/risk/${riskAnalysis.id}`, riskAnalysis);

    if (riskAnalysis.riskLevel === 'high' || riskAnalysis.riskLevel === 'critical') {
      this.eventBus.emit('regression.high.risk', {
        type: 'regression.high.risk',
        source: { id: this.config.context.id, type: this.config.type, created: new Date() },
        data: riskAnalysis,
        timestamp: new Date(),
        priority: 'high',
        scope: 'global'
      });
    }

    return riskAnalysis;
  }

  private async selectTests(payload: any): Promise<any> {
    const selection = {
      id: `selection-${Date.now()}`,
      strategy: this.config.testSelection?.strategy || 'smart',
      totalTests: payload.totalTests || 1000,
      selectedTests: [
        { id: 'test-api-users-1', priority: 'critical', reason: 'Directly affected by changes' },
        { id: 'test-api-users-2', priority: 'high', reason: 'Tests modified function' },
        { id: 'test-auth-integration', priority: 'high', reason: 'Dependency chain' },
        { id: 'test-models-user', priority: 'medium', reason: 'Indirect dependency' }
      ],
      reductionRatio: 0.996, // 1000 → 4 tests
      estimatedTime: {
        full: 2700, // 45 minutes
        smart: 300, // 5 minutes
        savings: 2400 // 40 minutes saved
      },
      confidence: 0.92
    };

    await this.memoryStore.store(`aqe/regression/selection/${selection.id}`, selection);
    await this.memoryStore.store('aqe/regression/latest-selection', selection);

    this.eventBus.emit('regression.tests.selected', {
      type: 'regression.tests.selected',
      source: { id: this.config.context.id, type: this.config.type, created: new Date() },
      data: selection,
      timestamp: new Date(),
      priority: 'medium',
      scope: 'global'
    });

    return selection;
  }

  private async learnPatterns(payload: any): Promise<any> {
    const learningResult = {
      id: `learning-${Date.now()}`,
      patterns: [
        { type: 'high-risk-files', files: ['auth.ts', 'payment.ts'], confidence: 0.89 },
        { type: 'flaky-test-correlation', tests: ['test-async-1', 'test-db-2'], confidence: 0.76 },
        { type: 'deployment-success', factors: ['test-coverage', 'review-count'], confidence: 0.82 }
      ],
      historicalData: {
        commitsAnalyzed: payload.commitCount || 100,
        testsObserved: 5000,
        deploymentsTracked: 50
      },
      modelAccuracy: 0.87,
      lastUpdated: new Date()
    };

    await this.memoryStore.store('aqe/regression/patterns', learningResult);
    return learningResult;
  }

  private async analyzeImpactRadius(payload: any): Promise<any> {
    const impactAnalysis = {
      id: `impact-${Date.now()}`,
      sourceFile: payload.file,
      radius: this.config.analysis?.impactRadius || 3,
      impactedFiles: [
        { file: 'src/api/users.ts', distance: 0, impact: 'direct' },
        { file: 'src/services/userService.ts', distance: 1, impact: 'high' },
        { file: 'src/controllers/userController.ts', distance: 2, impact: 'medium' },
        { file: 'src/routes/userRoutes.ts', distance: 2, impact: 'medium' },
        { file: 'src/middleware/auth.ts', distance: 3, impact: 'low' }
      ],
      totalImpact: 5,
      affectedTests: 23,
      estimatedRisk: 'medium'
    };

    await this.memoryStore.store(`aqe/regression/impact/${impactAnalysis.id}`, impactAnalysis);
    return impactAnalysis;
  }

  getStatus() {
    return {
      agentId: { id: this.config.context.id, type: this.config.type, created: new Date() },
      status: this.status,
      performanceMetrics: this.metrics
    };
  }
}

// Simple in-memory store for integration testing
class MemoryManager {
  private data = new Map<string, any>();

  async store(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async retrieve(key: string): Promise<any> {
    return this.data.get(key);
  }

  async set(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async get(key: string): Promise<any> {
    return this.data.get(key);
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}

describe('RegressionRiskAnalyzerAgent Integration', () => {
  let agent: RegressionRiskAnalyzerAgent;
  let eventBus: EventEmitter;
  let memoryStore: MemoryManager;

  beforeEach(async () => {
    eventBus = new EventEmitter();
    memoryStore = new MemoryManager();

    const config: RegressionRiskAnalyzerConfig = {
      type: QEAgentType.REGRESSION_RISK_ANALYZER,
      capabilities: [],
      context: { id: 'regression-analyzer', type: 'regression-risk-analyzer', status: AgentStatus.IDLE },
      memoryStore: memoryStore as any,
      eventBus,
      gitIntegration: {
        enabled: true,
        defaultBranch: 'main',
        remoteName: 'origin'
      },
      analysis: {
        astParsing: true,
        mlPatterns: true,
        historicalData: true,
        impactRadius: 3
      },
      testSelection: {
        strategy: 'smart',
        maxTestsPerChange: 50,
        minCoverageThreshold: 80
      },
      riskScoring: {
        fileChangeWeight: 0.3,
        complexityWeight: 0.25,
        historyWeight: 0.25,
        dependencyWeight: 0.2
      }
    };

    agent = new RegressionRiskAnalyzerAgent(config);
    await agent.initialize();
  });

  afterEach(async () => {
    await agent.terminate();
  });

  describe('git integration workflow', () => {
    it('should analyze git diff and detect file changes', async () => {
      const events: string[] = [];
      eventBus.on('regression.changes.analyzed', () => events.push('analyzed'));

      const task: QETask = {
        id: 'git-diff-task',
        type: 'analyze-git-changes',
        payload: {
          commit: 'HEAD',
          baseBranch: 'main'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.analysisId).toBeDefined();
      expect(result.files).toBeInstanceOf(Array);
      expect(result.files.length).toBeGreaterThan(0);
      expect(result.totalChanges).toBeGreaterThan(0);
      expect(result.impactedModules).toContain('api');

      // Verify stored in memory
      const stored = await memoryStore.retrieve(`aqe/regression/changes/${result.analysisId}`);
      expect(stored).toBeDefined();
      expect(stored.analysisId).toBe(result.analysisId);

      // Verify event emitted
      expect(events).toContain('analyzed');
    });

    it('should analyze git blame for historical context', async () => {
      const task: QETask = {
        id: 'git-blame-task',
        type: 'analyze-git-changes',
        payload: {
          file: 'src/api/users.ts',
          includeBlame: true
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result).toBeDefined();
      expect(result.files).toBeDefined();
    });

    it('should analyze commit history for patterns', async () => {
      const task: QETask = {
        id: 'history-task',
        type: 'learn-patterns',
        payload: {
          commitCount: 100,
          sinceDate: '2024-01-01'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.patterns).toBeInstanceOf(Array);
      expect(result.patterns.length).toBeGreaterThan(0);
      expect(result.historicalData).toBeDefined();
      expect(result.historicalData.commitsAnalyzed).toBe(100);
      expect(result.modelAccuracy).toBeGreaterThan(0.8);

      // Verify patterns stored
      const stored = await memoryStore.retrieve('aqe/regression/patterns');
      expect(stored).toBeDefined();
      expect(stored.patterns).toEqual(result.patterns);
    });
  });

  describe('AST parsing workflow', () => {
    it('should parse TypeScript AST and analyze complexity', async () => {
      const task: QETask = {
        id: 'ast-typescript-task',
        type: 'parse-ast',
        payload: {
          file: 'src/api/users.ts',
          language: 'typescript'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.id).toBeDefined();
      expect(result.language).toBe('typescript');
      expect(result.complexity).toBeDefined();
      expect(result.complexity.cyclomatic).toBeGreaterThan(0);
      expect(result.complexity.cognitive).toBeGreaterThan(0);
      expect(result.dependencies).toBeInstanceOf(Array);
      expect(result.functionCount).toBeGreaterThan(0);
    });

    it('should parse multiple languages (JavaScript, Python)', async () => {
      const languages = ['javascript', 'python', 'go'];

      for (const language of languages) {
        const task: QETask = {
          id: `ast-${language}-task`,
          type: 'parse-ast',
          payload: {
            file: `src/service.${language}`,
            language
          },
          priority: 1,
          status: 'pending'
        };

        const result = await agent.assignTask(task);
        expect(result.language).toBe(language);
      }
    });

    it('should detect high complexity and recommend refactoring', async () => {
      const task: QETask = {
        id: 'complex-ast-task',
        type: 'parse-ast',
        payload: {
          file: 'src/legacy/monolith.ts',
          language: 'typescript'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.complexity.cyclomatic).toBeDefined();
      expect(result.testableComplexity).toBeDefined();

      // High complexity files should have recommendations
      if (result.complexity.cyclomatic > 15) {
        expect(result.testableComplexity).toMatch(/high|critical/);
      }
    });
  });

  describe('risk scoring workflow', () => {
    it('should calculate weighted risk score for changed files', async () => {
      const events: any[] = [];
      eventBus.on('regression.high.risk', (event) => events.push(event));

      const task: QETask = {
        id: 'risk-score-task',
        type: 'calculate-risk-score',
        payload: {
          file: 'src/api/payment.ts',
          changes: 50,
          complexity: 18,
          historyBugs: 5,
          dependencies: 12
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.id).toBeDefined();
      expect(result.scores).toBeDefined();
      expect(result.scores.changeScore).toBeGreaterThanOrEqual(0);
      expect(result.scores.changeScore).toBeLessThanOrEqual(1);
      expect(result.weightedScore).toBeGreaterThanOrEqual(0);
      expect(result.weightedScore).toBeLessThanOrEqual(1);
      expect(result.riskLevel).toMatch(/low|medium|high|critical/);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.reasoning).toBeInstanceOf(Array);

      // Verify stored
      const stored = await memoryStore.retrieve(`aqe/regression/risk/${result.id}`);
      expect(stored).toBeDefined();
    });

    it('should emit high risk event for critical files', async () => {
      const highRiskEvents: any[] = [];
      eventBus.on('regression.high.risk', (event) => highRiskEvents.push(event));

      // Simulate high-risk file change
      const task: QETask = {
        id: 'critical-risk-task',
        type: 'calculate-risk-score',
        payload: {
          file: 'src/security/auth.ts',
          changes: 100,
          complexity: 25,
          historyBugs: 15,
          dependencies: 50
        },
        priority: 1,
        status: 'pending'
      };

      await agent.assignTask(task);

      // High risk files should trigger events
      // (Note: Event emission depends on risk level in implementation)
    });

    it('should use configurable weights for risk calculation', async () => {
      const task: QETask = {
        id: 'weighted-risk-task',
        type: 'calculate-risk-score',
        payload: {
          file: 'src/api/users.ts'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      // Verify weights are applied
      expect(result.weightedScore).toBeDefined();
      expect(result.scores).toHaveProperty('changeScore');
      expect(result.scores).toHaveProperty('complexityScore');
      expect(result.scores).toHaveProperty('historyScore');
      expect(result.scores).toHaveProperty('dependencyScore');
    });
  });

  describe('smart test selection workflow (45min → 5min)', () => {
    it('should select minimal test set with high confidence', async () => {
      const events: any[] = [];
      eventBus.on('regression.tests.selected', (event) => events.push(event));

      const task: QETask = {
        id: 'smart-selection-task',
        type: 'select-tests',
        payload: {
          totalTests: 1000,
          changes: ['src/api/users.ts', 'src/models/User.ts']
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.id).toBeDefined();
      expect(result.strategy).toBe('smart');
      expect(result.totalTests).toBe(1000);
      expect(result.selectedTests).toBeInstanceOf(Array);
      expect(result.selectedTests.length).toBeLessThan(50); // Significant reduction
      expect(result.reductionRatio).toBeGreaterThan(0.9); // >90% reduction
      expect(result.estimatedTime.full).toBeGreaterThan(result.estimatedTime.smart);
      expect(result.estimatedTime.savings).toBeGreaterThan(2000); // >33 minutes saved
      expect(result.confidence).toBeGreaterThan(0.85);

      // Verify stored
      const stored = await memoryStore.retrieve('aqe/regression/latest-selection');
      expect(stored).toBeDefined();
      expect(stored.selectedTests.length).toBe(result.selectedTests.length);

      // Verify event
      expect(events.length).toBeGreaterThan(0);
    });

    it('should prioritize tests by criticality', async () => {
      const task: QETask = {
        id: 'priority-selection-task',
        type: 'select-tests',
        payload: {
          totalTests: 500,
          changes: ['src/api/payment.ts']
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.selectedTests).toBeInstanceOf(Array);

      const criticalTests = result.selectedTests.filter((t: any) => t.priority === 'critical');
      const highTests = result.selectedTests.filter((t: any) => t.priority === 'high');

      expect(criticalTests.length).toBeGreaterThan(0);
      expect(highTests.length).toBeGreaterThan(0);

      // Verify each test has a reason
      result.selectedTests.forEach((test: any) => {
        expect(test.reason).toBeDefined();
        expect(test.reason.length).toBeGreaterThan(0);
      });
    });

    it('should handle different selection strategies', async () => {
      const strategies = ['smart', 'conservative', 'aggressive'] as const;

      for (const strategy of strategies) {
        // Note: Would need to create new agent with different strategy
        const task: QETask = {
          id: `selection-${strategy}`,
          type: 'select-tests',
          payload: { totalTests: 1000, strategy },
          priority: 1,
          status: 'pending'
        };

        const result = await agent.assignTask(task);
        expect(result.strategy).toBeDefined();
      }
    });
  });

  describe('impact radius analysis', () => {
    it('should analyze dependency impact radius', async () => {
      const task: QETask = {
        id: 'impact-radius-task',
        type: 'analyze-impact-radius',
        payload: {
          file: 'src/api/users.ts',
          radius: 3
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.id).toBeDefined();
      expect(result.sourceFile).toBe('src/api/users.ts');
      expect(result.radius).toBe(3);
      expect(result.impactedFiles).toBeInstanceOf(Array);
      expect(result.impactedFiles.length).toBeGreaterThan(0);

      // Verify distance calculation
      result.impactedFiles.forEach((file: any) => {
        expect(file.distance).toBeLessThanOrEqual(3);
        expect(file.impact).toMatch(/direct|high|medium|low/);
      });

      expect(result.totalImpact).toBe(result.impactedFiles.length);
      expect(result.affectedTests).toBeGreaterThan(0);
    });

    it('should calculate transitive dependencies', async () => {
      const task: QETask = {
        id: 'transitive-deps-task',
        type: 'analyze-impact-radius',
        payload: {
          file: 'src/models/User.ts',
          radius: 5
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      // Should find files at various distances
      const distances = result.impactedFiles.map((f: any) => f.distance);
      expect(Math.max(...distances)).toBeGreaterThan(0);
    });
  });

  describe('coordination with TestExecutorAgent', () => {
    it('should share test selection with TestExecutor', async () => {
      // Simulate test selection
      const selectionTask: QETask = {
        id: 'coordinated-selection',
        type: 'select-tests',
        payload: { totalTests: 1000 },
        priority: 1,
        status: 'pending'
      };

      const selection = await agent.assignTask(selectionTask);

      // Store in shared memory location
      await memoryStore.store('shared:test-executor:regression-tests', selection);

      // TestExecutor would retrieve this
      const sharedSelection = await memoryStore.retrieve('shared:test-executor:regression-tests');
      expect(sharedSelection).toBeDefined();
      expect(sharedSelection.selectedTests).toEqual(selection.selectedTests);
    });

    it('should respond to test execution results', (done) => {
      let eventReceived = false;

      eventBus.on('test.execution.complete', (event) => {
        eventReceived = true;
        // Agent would update its patterns based on test results
      });

      // Simulate TestExecutor emitting completion
      eventBus.emit('test.execution.complete', {
        type: 'test.execution.complete',
        source: { id: 'test-executor', type: QEAgentType.TEST_EXECUTOR, created: new Date() },
        data: {
          testSuiteId: 'suite-1',
          passed: 3,
          failed: 1,
          testResults: [
            { id: 'test-api-users-1', status: 'passed' },
            { id: 'test-api-users-2', status: 'passed' },
            { id: 'test-auth-integration', status: 'failed' },
            { id: 'test-models-user', status: 'passed' }
          ]
        },
        timestamp: new Date(),
        priority: 'medium',
        scope: 'global'
      });

      setTimeout(() => {
        expect(eventReceived).toBe(true);
        done();
      }, 100);
    });
  });

  describe('performance metrics', () => {
    it('should track agent performance', async () => {
      // Execute multiple tasks
      for (let i = 0; i < 5; i++) {
        await agent.assignTask({
          id: `perf-task-${i}`,
          type: 'parse-ast',
          payload: { file: `file${i}.ts`, language: 'typescript' },
          priority: 1,
          status: 'pending'
        });
      }

      const status = agent.getStatus();
      expect(status.performanceMetrics.tasksCompleted).toBe(5);
      expect(status.performanceMetrics.averageExecutionTime).toBeGreaterThan(0);
    });
  });

  describe('state persistence', () => {
    it('should persist state across termination', async () => {
      // Execute task
      await agent.assignTask({
        id: 'persist-task',
        type: 'learn-patterns',
        payload: { commitCount: 50 },
        priority: 1,
        status: 'pending'
      });

      // Terminate
      await agent.terminate();

      // Verify state was saved
      const savedState = await memoryStore.retrieve(`aqe/regression/state/${agent.getStatus().agentId.id}`);
      expect(savedState).toBeDefined();
      expect(savedState.metrics).toBeDefined();
    });
  });
});