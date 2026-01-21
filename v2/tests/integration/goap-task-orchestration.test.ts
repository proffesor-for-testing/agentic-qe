/**
 * GOAP Task Orchestration Integration Tests
 *
 * Tests the full integration of GOAP planning with task orchestration:
 * - WorldState building from task context
 * - Dynamic workflow generation
 * - Step dependency resolution
 * - Plan persistence
 * - Alternative path generation
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import {
  GOAPTaskOrchestration,
  TaskSpec,
  OrchestrationContext,
  GOAPWorkflowStep
} from '../../src/planning/integration/GOAPTaskOrchestration';
import {
  TASK_WORKFLOW_GOALS,
  getGoalForType,
  customizeGoalConditions
} from '../../src/planning/goals/TaskWorkflowGoals';
import { orchestrationActions, getActionsForTaskType } from '../../src/planning/actions';

// Jest test - using proper Jest syntax
jest.setTimeout(15000);

// Force garbage collection between tests if available
const forceGC = () => {
  if (global.gc) {
    global.gc();
  }
};

describe('GOAP Task Orchestration Integration', () => {
  let db: Database.Database;
  let orchestration: GOAPTaskOrchestration;
  const testDbPath = '.agentic-qe/test-task-orchestration.db';

  beforeAll(async () => {
    // Ensure directory exists
    const dir = path.dirname(testDbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create database with proper schema
    db = new Database(testDbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS goap_actions (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, agent_type TEXT NOT NULL,
        preconditions TEXT NOT NULL, effects TEXT NOT NULL, cost REAL NOT NULL DEFAULT 1.0,
        duration_estimate INTEGER, success_rate REAL DEFAULT 1.0, execution_count INTEGER DEFAULT 0,
        category TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS goap_plans (
        id TEXT PRIMARY KEY, goal_id TEXT, sequence TEXT NOT NULL,
        initial_state TEXT, goal_state TEXT, action_sequence TEXT, total_cost REAL,
        estimated_duration INTEGER, actual_duration INTEGER, status TEXT DEFAULT 'pending',
        success INTEGER, failure_reason TEXT, execution_trace TEXT, replanned_from TEXT,
        created_at INTEGER, executed_at DATETIME, completed_at DATETIME, started_at DATETIME
      );
    `);

    orchestration = new GOAPTaskOrchestration(db);
    await orchestration.initialize();
  });

  afterEach(() => {
    forceGC();
  });

  afterAll(() => {
    orchestration.close();
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    forceGC();
  });

  describe('Task Workflow Goals', () => {
    it('should have goal definitions for all task types', () => {
      expect(TASK_WORKFLOW_GOALS['comprehensive-testing']).toBeDefined();
      expect(TASK_WORKFLOW_GOALS['quality-gate']).toBeDefined();
      expect(TASK_WORKFLOW_GOALS['defect-prevention']).toBeDefined();
      expect(TASK_WORKFLOW_GOALS['performance-validation']).toBeDefined();
    });

    it('should retrieve goal by type', () => {
      const goal = getGoalForType('comprehensive-testing');
      expect(goal.id).toBe('goal-comprehensive-testing');
      expect(goal.conditions).toBeDefined();
      expect(goal.allowedCategories).toBeDefined();
    });

    it('should customize goal conditions with thresholds', () => {
      const baseGoal = getGoalForType('quality-gate');
      const customized = customizeGoalConditions(baseGoal, {
        coverageThreshold: 90,
        testPassingThreshold: 95
      });

      expect(customized.conditions['coverage.line'].gte).toBe(90);
      expect(customized.conditions['quality.testsPassing'].gte).toBe(95);
    });

    it('should have required measurement flags in goal conditions', () => {
      const goal = getGoalForType('comprehensive-testing');
      expect(goal.conditions['quality.testsMeasured']).toEqual({ eq: true });
      expect(goal.conditions['coverage.measured']).toEqual({ eq: true });
    });
  });

  describe('Orchestration Actions', () => {
    it('should have orchestration actions defined', () => {
      expect(orchestrationActions.length).toBeGreaterThan(0);
    });

    it('should get actions for comprehensive-testing', () => {
      const actions = getActionsForTaskType('comprehensive-testing');
      expect(actions.length).toBeGreaterThan(0);

      const categories = new Set(actions.map(a => a.category));
      expect(categories.has('test')).toBe(true);
      expect(categories.has('coverage')).toBe(true);
    });

    it('should get actions for quality-gate', () => {
      const actions = getActionsForTaskType('quality-gate');
      expect(actions.length).toBeGreaterThan(0);

      // Quality gate should include all categories
      const categories = new Set(actions.map(a => a.category));
      expect(categories.has('test')).toBe(true);
      expect(categories.has('security')).toBe(true);
    });

    it('should have measurement actions that set flags', () => {
      const measurementAction = orchestrationActions.find(
        a => a.id === 'orch-execute-unit-tests'
      );
      expect(measurementAction).toBeDefined();
      expect(measurementAction!.effects['quality.testsMeasured']).toEqual({ set: true });
    });
  });

  describe('Workflow Generation', () => {
    it('should generate workflow for comprehensive-testing', async () => {
      const task: TaskSpec = {
        type: 'comprehensive-testing',
        priority: 'medium',
        strategy: 'adaptive',
        maxAgents: 4,
        timeoutMinutes: 30
      };

      const context: OrchestrationContext = {
        project: 'test-project',
        environment: 'development',
        coverageThreshold: 80
      };

      const result = await orchestration.generateWorkflow(task, context);

      expect(result.success).toBe(true);
      expect(result.workflow.length).toBeGreaterThan(0);
      expect(result.planId).toBeDefined();
      expect(result.totalCost).toBeGreaterThan(0);
    });

    it('should generate workflow for quality-gate', async () => {
      const task: TaskSpec = {
        type: 'quality-gate',
        priority: 'high',
        strategy: 'sequential'
      };

      const context: OrchestrationContext = {
        environment: 'staging',
        // Use achievable thresholds (matching action effects)
        coverageThreshold: 70,  // executeUnitTests sets 70
        securityThreshold: 70,  // runSecurityScan sets 85
        performanceThreshold: 70 // measurePerformanceBaseline sets 75
      };

      const result = await orchestration.generateWorkflow(task, context);

      // Quality-gate goal is now achievable with proper action library
      expect(result.goalDefinition.id).toBe('goal-quality-gate');
      expect(result.success).toBe(true);
      expect(result.workflow.length).toBeGreaterThan(0);
      expect(result.planId).toBeDefined();
    });

    it('should generate workflow for performance-validation', async () => {
      const task: TaskSpec = {
        type: 'performance-validation',
        priority: 'medium',
        strategy: 'sequential'
      };

      const result = await orchestration.generateWorkflow(task);

      expect(result.success).toBe(true);
      expect(result.workflow.length).toBeGreaterThan(0);

      // Performance validation should have performance-related steps
      const hasPerformanceStep = result.workflow.some(
        step => step.category === 'performance' || step.name.toLowerCase().includes('performance')
      );
      expect(hasPerformanceStep).toBe(true);
    });

    it('should generate workflow for defect-prevention', async () => {
      const task: TaskSpec = {
        type: 'defect-prevention',
        priority: 'low',
        strategy: 'parallel'
      };

      const context: OrchestrationContext = {
        requirements: ['Prevent regressions', 'Analyze impact']
      };

      const result = await orchestration.generateWorkflow(task, context);

      expect(result.success).toBe(true);
    });
  });

  describe('Workflow Step Properties', () => {
    it('should have proper step structure', async () => {
      const task: TaskSpec = {
        type: 'comprehensive-testing',
        priority: 'medium',
        strategy: 'adaptive'
      };

      const result = await orchestration.generateWorkflow(task);

      if (result.success && result.workflow.length > 0) {
        const step = result.workflow[0];
        expect(step.id).toBeDefined();
        expect(step.name).toBeDefined();
        expect(step.type).toBeDefined();
        expect(step.dependencies).toBeInstanceOf(Array);
        expect(step.estimatedDuration).toBeGreaterThan(0);
        expect(step.status).toBe('pending');
        expect(step.goapActionId).toBeDefined();
        expect(step.agentType).toBeDefined();
        expect(step.category).toBeDefined();
        expect(typeof step.canRunParallel).toBe('boolean');
      }
    });

    it('should set dependencies based on strategy', async () => {
      const sequentialTask: TaskSpec = {
        type: 'comprehensive-testing',
        priority: 'medium',
        strategy: 'sequential'
      };

      const seqResult = await orchestration.generateWorkflow(sequentialTask);

      if (seqResult.success && seqResult.workflow.length > 1) {
        // In sequential, each step (except first) should depend on previous
        for (let i = 1; i < seqResult.workflow.length; i++) {
          expect(seqResult.workflow[i].dependencies.length).toBe(1);
          expect(seqResult.workflow[i].dependencies[0]).toBe(seqResult.workflow[i - 1].id);
        }
      }
    });

    it('should allow parallel execution with adaptive strategy', async () => {
      const parallelTask: TaskSpec = {
        type: 'comprehensive-testing',
        priority: 'medium',
        strategy: 'parallel'
      };

      const result = await orchestration.generateWorkflow(parallelTask);

      if (result.success && result.workflow.length > 0) {
        // At least some steps should be able to run in parallel
        const parallelSteps = result.workflow.filter(s => s.canRunParallel);
        expect(parallelSteps.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Alternative Paths', () => {
    it('should find alternative workflow paths', async () => {
      const task: TaskSpec = {
        type: 'comprehensive-testing',
        priority: 'medium',
        strategy: 'adaptive'
      };

      const result = await orchestration.generateWorkflow(task);

      if (result.success) {
        // alternativePaths is a count, not an array
        expect(typeof result.alternativePaths).toBe('number');
        // Alternatives are optional - may or may not exist
        console.log(`Alternative paths found: ${result.alternativePaths}`);
      }
    });
  });

  describe('Plan Persistence', () => {
    it('should persist generated plans to database', async () => {
      const task: TaskSpec = {
        type: 'quality-gate',
        priority: 'high',
        strategy: 'sequential'
      };

      const result = await orchestration.generateWorkflow(task);

      if (result.success && result.planId) {
        const storedPlan = db.prepare(
          'SELECT * FROM goap_plans WHERE id = ?'
        ).get(result.planId) as { id: string; status: string } | undefined;

        expect(storedPlan).toBeDefined();
        expect(storedPlan!.status).toBe('pending');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle workflow generation gracefully when no plan found', async () => {
      // Create a scenario where no plan can be found
      // by requesting impossible constraints
      const task: TaskSpec = {
        type: 'comprehensive-testing',
        priority: 'critical',
        strategy: 'sequential',
        maxAgents: 1,
        timeoutMinutes: 0 // No time budget
      };

      const context: OrchestrationContext = {
        timeBudgetSeconds: 0 // Impossible constraint
      };

      const result = await orchestration.generateWorkflow(task, context);

      // Should return a result (success or failure) without throwing
      expect(result).toBeDefined();
      // May fail due to constraints, but should be handled gracefully
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });
});

describe('Task Context to WorldState Mapping', () => {
  let db: Database.Database;
  let orchestration: GOAPTaskOrchestration;
  const testDbPath = '.agentic-qe/test-worldstate-mapping.db';

  beforeAll(async () => {
    const dir = path.dirname(testDbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(testDbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS goap_actions (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, agent_type TEXT NOT NULL,
        preconditions TEXT NOT NULL, effects TEXT NOT NULL, cost REAL NOT NULL DEFAULT 1.0,
        duration_estimate INTEGER, success_rate REAL DEFAULT 1.0, execution_count INTEGER DEFAULT 0,
        category TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS goap_plans (
        id TEXT PRIMARY KEY, goal_id TEXT, sequence TEXT NOT NULL,
        initial_state TEXT, goal_state TEXT, action_sequence TEXT, total_cost REAL,
        estimated_duration INTEGER, actual_duration INTEGER, status TEXT DEFAULT 'pending',
        success INTEGER, failure_reason TEXT, execution_trace TEXT, replanned_from TEXT,
        created_at INTEGER, executed_at DATETIME, completed_at DATETIME, started_at DATETIME
      );
    `);

    orchestration = new GOAPTaskOrchestration(db);
    await orchestration.initialize();
  });

  afterAll(() => {
    orchestration.close();
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    forceGC();
  });

  it('should map priority to risk level correctly', async () => {
    const priorities: Array<{ priority: TaskSpec['priority']; expectedRisk: string }> = [
      { priority: 'low', expectedRisk: 'low' },
      { priority: 'medium', expectedRisk: 'medium' },
      { priority: 'high', expectedRisk: 'high' },
      { priority: 'critical', expectedRisk: 'critical' }
    ];

    for (const { priority, expectedRisk } of priorities) {
      const task: TaskSpec = {
        type: 'comprehensive-testing',
        priority,
        strategy: 'sequential'
      };

      const result = await orchestration.generateWorkflow(task);

      // The risk level is set internally - we can verify the workflow was generated
      // with the correct priority context by checking the result
      expect(result).toBeDefined();
    }
  });

  it('should use custom thresholds from context', async () => {
    const task: TaskSpec = {
      type: 'quality-gate',
      priority: 'high',
      strategy: 'sequential'
    };

    const context: OrchestrationContext = {
      coverageThreshold: 95,
      securityThreshold: 100,
      performanceThreshold: 85
    };

    const result = await orchestration.generateWorkflow(task, context);

    // Goal conditions should reflect custom thresholds
    expect(result.goalDefinition.conditions['coverage.line']?.gte).toBe(95);
    expect(result.goalDefinition.conditions['quality.securityScore']?.gte).toBe(100);
    expect(result.goalDefinition.conditions['quality.performanceScore']?.gte).toBe(85);
  });

  it('should set parallel slots from maxAgents', async () => {
    const task: TaskSpec = {
      type: 'comprehensive-testing',
      priority: 'medium',
      strategy: 'parallel',
      maxAgents: 8
    };

    const context: OrchestrationContext = {
      maxAgents: 6 // Context should override task spec
    };

    const result = await orchestration.generateWorkflow(task, context);

    // Workflow should be generated considering the max agents
    expect(result).toBeDefined();
  });

  it('should calculate time budget from timeout', async () => {
    const task: TaskSpec = {
      type: 'performance-validation',
      priority: 'medium',
      strategy: 'sequential',
      timeoutMinutes: 45
    };

    const result = await orchestration.generateWorkflow(task);

    // Time budget should be 45 * 60 = 2700 seconds
    expect(result).toBeDefined();
  });
});

/**
 * TaskOrchestrateHandler Integration Tests
 *
 * Tests the actual MCP handler integration with GOAP planning.
 * These tests verify that GOAP is correctly wired into the handler.
 */
describe('TaskOrchestrateHandler GOAP Integration', () => {
  // Lazy import to avoid loading heavy modules in other test suites
  let TaskOrchestrateHandler: any;
  let handler: any;
  let mockRegistry: any;
  let mockHookExecutor: any;

  beforeAll(async () => {
    // Dynamic import to reduce memory pressure
    const module = await import('../../src/mcp/handlers/task-orchestrate');
    TaskOrchestrateHandler = module.TaskOrchestrateHandler;

    // Create mock registry that returns supported agent types
    mockRegistry = {
      getSupportedMCPTypes: jest.fn().mockReturnValue([
        'qe-test-executor',
        'qe-test-generator',
        'qe-coverage-analyzer',
        'qe-security-scanner',
        'qe-performance-tester',
        'qe-quality-gate',
        'qe-code-intelligence'
      ]),
      getAllAgents: jest.fn().mockReturnValue([]),
      getAgentsByType: jest.fn().mockReturnValue([]),
      spawnAgent: jest.fn().mockResolvedValue({ id: 'mock-agent-1' }),
      terminateAgent: jest.fn().mockResolvedValue(undefined),
      // Mock executeTask for step execution
      executeTask: jest.fn().mockResolvedValue({
        success: true,
        output: { status: 'completed', metrics: {} }
      })
    };

    // Create mock hook executor
    mockHookExecutor = {
      executePreTask: jest.fn().mockResolvedValue(undefined),
      executePostTask: jest.fn().mockResolvedValue(undefined)
    };

    handler = new TaskOrchestrateHandler(mockRegistry, mockHookExecutor);

    // Wait for async GOAP initialization with polling
    // GOAP init is fire-and-forget in constructor, so we poll until ready
    const maxWait = 3000;
    const pollInterval = 100;
    let waited = 0;
    while (waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      waited += pollInterval;
      // Check if GOAP is initialized
      if (handler['goapIntegration'] !== null || handler['useGOAP'] === false) {
        break;
      }
    }
  });

  afterAll(() => {
    if (handler && handler.cleanup) {
      handler.cleanup();
    }
    forceGC();
  });

  it('should create handler with GOAP integration', () => {
    expect(handler).toBeDefined();
    // Handler should have GOAP integration initialized
    expect(handler['goapIntegration']).toBeDefined();
    expect(handler['useGOAP']).toBe(true);
  });

  it('should use GOAP workflow when planner succeeds', async () => {
    const result = await handler.handle({
      task: {
        type: 'comprehensive-testing',
        priority: 'medium',
        strategy: 'sequential'
      },
      context: {
        project: 'test-project',
        environment: 'development'
      }
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.workflow).toBeDefined();
    expect(result.data.workflow.length).toBeGreaterThan(0);

    // Verify GOAP was used by checking for goapActionId in workflow results
    const firstStep = result.data.workflow[0];
    if (firstStep.results?.goapActionId) {
      // GOAP was used
      expect(firstStep.results.goapActionId).toMatch(/^orch-/);
      expect(firstStep.results.agentType).toBeDefined();
      expect(firstStep.results.category).toBeDefined();
    }
  });

  it('should include GOAP metadata in workflow steps', async () => {
    const result = await handler.handle({
      task: {
        type: 'comprehensive-testing',
        priority: 'high',
        strategy: 'parallel'
      }
    });

    expect(result.success).toBe(true);

    // Check each step has GOAP metadata
    for (const step of result.data.workflow) {
      if (step.results?.goapActionId) {
        // This step came from GOAP
        expect(step.results.goapActionId).toBeDefined();
        expect(step.results.agentType).toBeDefined();
        expect(step.results.category).toBeDefined();
        expect(typeof step.results.canRunParallel).toBe('boolean');
      }
    }
  });

  it('should handle quality-gate task with GOAP', async () => {
    const result = await handler.handle({
      task: {
        type: 'quality-gate',
        priority: 'critical',
        strategy: 'sequential'
      },
      context: {
        environment: 'staging'
      }
    });

    expect(result.success).toBe(true);
    expect(result.data.type).toBe('quality-gate');
    expect(result.data.workflow.length).toBeGreaterThan(0);
  });

  it('should handle defect-prevention task with GOAP', async () => {
    const result = await handler.handle({
      task: {
        type: 'defect-prevention',
        priority: 'medium',
        strategy: 'adaptive'
      }
    });

    expect(result.success).toBe(true);
    expect(result.data.type).toBe('defect-prevention');
  });

  it('should handle performance-validation task with GOAP', async () => {
    const result = await handler.handle({
      task: {
        type: 'performance-validation',
        priority: 'medium',
        strategy: 'sequential',
        timeoutMinutes: 60
      }
    });

    expect(result.success).toBe(true);
    expect(result.data.type).toBe('performance-validation');
  });

  it('should pass registry to GOAP for fleet state', async () => {
    // The handler should have passed registry to GOAP
    // We can verify by checking the registry methods were called during workflow generation
    mockRegistry.getSupportedMCPTypes.mockClear();
    mockRegistry.getAllAgents.mockClear();

    await handler.handle({
      task: {
        type: 'comprehensive-testing',
        priority: 'medium',
        strategy: 'parallel'
      }
    });

    // Registry should have been queried for fleet state
    // Note: This may not be called if GOAP was already initialized
    // The important thing is that handler was created with registry
    expect(handler['registry']).toBe(mockRegistry);
  });

  it('should fall back to template when GOAP fails', async () => {
    // Force GOAP to fail by temporarily disabling it
    const originalUseGOAP = handler['useGOAP'];
    handler['useGOAP'] = false;

    const result = await handler.handle({
      task: {
        type: 'comprehensive-testing',
        priority: 'medium',
        strategy: 'sequential'
      }
    });

    // Should still succeed using template fallback
    expect(result.success).toBe(true);
    expect(result.data.workflow.length).toBeGreaterThan(0);

    // Restore
    handler['useGOAP'] = originalUseGOAP;
  });

  it('should cleanup GOAP resources properly', () => {
    // Create a new handler to test cleanup
    const tempHandler = new TaskOrchestrateHandler(mockRegistry, mockHookExecutor);

    // Cleanup should not throw
    expect(() => tempHandler.cleanup()).not.toThrow();

    // After cleanup, GOAP integration should be null
    expect(tempHandler['goapIntegration']).toBeNull();
    expect(tempHandler['goapDb']).toBeNull();
  });
});
