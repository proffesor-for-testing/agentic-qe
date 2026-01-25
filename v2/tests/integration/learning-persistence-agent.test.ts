/**
 * Agent Learning Persistence Integration Tests
 * Tests that learning data persists through full TestGeneratorAgent lifecycle
 *
 * This test complements learning-persistence.test.ts by testing:
 * - Full agent initialization → task execution → termination → restart cycle
 * - Real TestGeneratorAgent with all its dependencies
 * - Database persistence across agent restarts (the critical bug fix)
 * - Integration with BaseAgent's learning hooks (onPreTask, onPostTask)
 *
 * Critical Fix Verification: Ensures learning data survives agent restarts
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import * as path from 'path';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { TestGeneratorAgent } from '../../src/agents/TestGeneratorAgent';
import { QEAgentType, TestType } from '../../src/types';

describe('Agent Learning Persistence Integration', () => {
  let memoryStore: SwarmMemoryManager;
  let agent: TestGeneratorAgent;
  let testDbPath: string;
  const TEST_DIR = path.join(process.cwd(), '.test-agent-learning-persistence');

  beforeEach(async () => {
    // Create unique test directory and database for each test
    const testId = Date.now();
    await fs.ensureDir(TEST_DIR);
    testDbPath = path.join(TEST_DIR, `agent-learning-${testId}.db`);

    // Initialize memory store with unique database
    memoryStore = new SwarmMemoryManager(testDbPath);
    await memoryStore.initialize();

    // Create agent with learning enabled
    agent = new TestGeneratorAgent({
      type: QEAgentType.TEST_GENERATOR,
      capabilities: [],
      context: {
        projectRoot: process.cwd(),
        configPath: path.join(process.cwd(), '.agentic-qe', 'config'),
        mode: 'test',
        teamId: 'test-team',
        timestamp: Date.now()
      },
      memoryStore,
      eventBus: new EventEmitter(),
      enableLearning: true, // CRITICAL: Learning must be enabled
      learningConfig: {
        enabled: true,
        learningRate: 0.1,
        discountFactor: 0.95,
        explorationRate: 0.3,
        explorationDecay: 0.995,
        minExplorationRate: 0.01
      }
    });

    await agent.initialize();
  });

  afterEach(async () => {
    // Clean up agent and database
    if (agent) {
      await agent.terminate();
    }
    if (memoryStore) {
      await memoryStore.close();
    }
    // Remove test directory
    await fs.remove(TEST_DIR);
  });

  /**
   * Test 1: Q-values persistence through agent lifecycle
   * Verifies that Q-values are written to database after task execution
   */
  it('should persist Q-values to database after agent task execution', async () => {
    // Execute a test generation task
    const task = {
      id: 'agent-task-1',
      type: QEAgentType.TEST_GENERATOR,
      description: 'Generate unit tests for user service',
      priority: 'high' as const,
      requirements: {
        capabilities: ['jest-test-generation'],
        estimatedDuration: 5000,
        dependencies: []
      },
      payload: {
        sourceCode: {
          files: [{
            path: 'src/user.service.ts',
            content: 'class UserService { getUser(id: string) { return { id, name: "User" }; } }',
            language: 'typescript'
          }],
          complexityMetrics: {
            cyclomaticComplexity: 2,
            cognitiveComplexity: 1,
            functionCount: 1,
            linesOfCode: 10
          }
        },
        framework: 'jest',
        coverage: {
          target: 80,
          type: 'line' as const
        },
        constraints: {
          maxTests: 10,
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      }
    };

    const result = await agent.executeTask({
      id: 'assignment-1',
      task,
      agentId: agent['agentId'].id,
      assignedAt: new Date(),
      status: 'assigned'
    });

    // Verify task succeeded
    expect(result).toBeDefined();
    expect(result.testSuite).toBeDefined();
    expect(result.testSuite.tests.length).toBeGreaterThan(0);

    // Verify Q-values were persisted to database
    const qValues = await memoryStore.getAllQValues(agent['agentId'].id);

    expect(qValues).toBeDefined();
    expect(Array.isArray(qValues)).toBe(true);
    expect(qValues.length).toBeGreaterThan(0);

    // Verify Q-value structure
    const firstQValue = qValues[0];
    expect(firstQValue).toHaveProperty('state');
    expect(firstQValue).toHaveProperty('action');
    expect(firstQValue).toHaveProperty('value');
    expect(typeof firstQValue.value).toBe('number');
  }, 30000);

  /**
   * Test 2: Learning data survives agent restart
   * CRITICAL: Verifies the persistence fix - data must survive agent lifecycle
   */
  it('should persist learning data across agent restarts', async () => {
    // === PHASE 1: First agent execution ===
    const task = {
      id: 'restart-task',
      type: QEAgentType.TEST_GENERATOR,
      description: 'Task for restart test',
      priority: 'high' as const,
      requirements: {
        capabilities: ['jest-test-generation'],
        estimatedDuration: 5000,
        dependencies: []
      },
      payload: {
        sourceCode: {
          files: [{
            path: 'src/persistent.service.ts',
            content: 'class PersistentService { getData() { return { id: 1, value: "test" }; } }',
            language: 'typescript'
          }],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            functionCount: 1,
            linesOfCode: 6
          }
        },
        framework: 'jest',
        coverage: { target: 80, type: 'line' as const },
        constraints: {
          maxTests: 5,
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      }
    };

    await agent.executeTask({
      id: 'assignment-restart',
      task,
      agentId: agent['agentId'].id,
      assignedAt: new Date(),
      status: 'assigned'
    });

    // Get Q-values and experiences from first agent
    const qValues1 = await memoryStore.getAllQValues(agent['agentId'].id);
    const count1 = qValues1.length;

    expect(count1).toBeGreaterThan(0);

    // Verify database has learning experiences
    const db = (memoryStore as any).db;
    const experienceCount1 = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM learning_experiences
    `).get();

    expect(experienceCount1.cnt).toBeGreaterThan(0);

    // Store agent ID for second agent
    const firstAgentId = agent['agentId'].id;

    // === PHASE 2: Terminate first agent ===
    await agent.terminate();

    // === PHASE 3: Create new agent with SAME database ===
    const agent2 = new TestGeneratorAgent({
      type: QEAgentType.TEST_GENERATOR,
      capabilities: [],
      context: {
        projectRoot: process.cwd(),
        configPath: path.join(process.cwd(), '.agentic-qe', 'config'),
        mode: 'test',
        teamId: 'test-team',
        timestamp: Date.now()
      },
      memoryStore, // SAME memory store = SAME database
      eventBus: new EventEmitter(),
      enableLearning: true,
      learningConfig: {
        enabled: true,
        learningRate: 0.1,
        discountFactor: 0.95,
        explorationRate: 0.3
      }
    });

    await agent2.initialize();

    // === PHASE 4: Verify data persisted ===
    // Second agent should load existing Q-values from database
    const qValues2 = await memoryStore.getAllQValues(agent2['agentId'].id);

    // CRITICAL: Q-values should still exist after restart
    expect(qValues2).toBeDefined();
    expect(qValues2.length).toBeGreaterThanOrEqual(count1);

    // Verify database still has learning experiences
    const experienceCount2 = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM learning_experiences
    `).get();

    expect(experienceCount2.cnt).toBeGreaterThanOrEqual(experienceCount1.cnt);

    // Verify database integrity
    const integrityCheck = db.pragma('integrity_check');
    expect(integrityCheck[0]).toEqual({ integrity_check: 'ok' });

    // Clean up second agent
    await agent2.terminate();
    agent = null as any; // Prevent double cleanup in afterEach
  }, 60000);

  /**
   * Test 3: Multiple tasks accumulate learning data
   * Verifies that Q-values and experiences accumulate correctly
   */
  it('should accumulate learning data across multiple tasks', async () => {
    // Create 3 different tasks
    const tasks = [
      {
        id: 'multi-task-1',
        type: QEAgentType.TEST_GENERATOR,
        description: 'First task',
        priority: 'high' as const,
        requirements: {
          capabilities: ['jest-test-generation'],
          estimatedDuration: 5000,
          dependencies: []
        },
        payload: {
          sourceCode: {
            files: [{
              path: 'src/service1.ts',
              content: 'class Service1 { method1() { return "test1"; } }',
              language: 'typescript'
            }],
            complexityMetrics: {
              cyclomaticComplexity: 1,
              cognitiveComplexity: 1,
              functionCount: 1,
              linesOfCode: 5
            }
          },
          framework: 'jest',
          coverage: { target: 80, type: 'line' as const },
          constraints: {
            maxTests: 5,
            maxExecutionTime: 30000,
            testTypes: [TestType.UNIT]
          }
        }
      },
      {
        id: 'multi-task-2',
        type: QEAgentType.TEST_GENERATOR,
        description: 'Second task',
        priority: 'medium' as const,
        requirements: {
          capabilities: ['jest-test-generation'],
          estimatedDuration: 5000,
          dependencies: []
        },
        payload: {
          sourceCode: {
            files: [{
              path: 'src/service2.ts',
              content: 'class Service2 { method2() { return 42; } }',
              language: 'typescript'
            }],
            complexityMetrics: {
              cyclomaticComplexity: 1,
              cognitiveComplexity: 1,
              functionCount: 1,
              linesOfCode: 5
            }
          },
          framework: 'jest',
          coverage: { target: 85, type: 'branch' as const },
          constraints: {
            maxTests: 5,
            maxExecutionTime: 30000,
            testTypes: [TestType.UNIT]
          }
        }
      },
      {
        id: 'multi-task-3',
        type: QEAgentType.TEST_GENERATOR,
        description: 'Third task',
        priority: 'low' as const,
        requirements: {
          capabilities: ['jest-test-generation'],
          estimatedDuration: 5000,
          dependencies: []
        },
        payload: {
          sourceCode: {
            files: [{
              path: 'src/service3.ts',
              content: 'class Service3 { method3() { return true; } }',
              language: 'typescript'
            }],
            complexityMetrics: {
              cyclomaticComplexity: 1,
              cognitiveComplexity: 1,
              functionCount: 1,
              linesOfCode: 5
            }
          },
          framework: 'jest',
          coverage: { target: 90, type: 'function' as const },
          constraints: {
            maxTests: 5,
            maxExecutionTime: 30000,
            testTypes: [TestType.UNIT]
          }
        }
      }
    ];

    // Track Q-values after each task
    const qValueCounts: number[] = [];

    // Execute all tasks sequentially
    for (let i = 0; i < tasks.length; i++) {
      await agent.executeTask({
        id: `assignment-multi-${i + 1}`,
        task: tasks[i],
        agentId: agent['agentId'].id,
        assignedAt: new Date(),
        status: 'assigned'
      });

      // Get Q-value count after each task
      const qValues = await memoryStore.getAllQValues(agent['agentId'].id);
      qValueCounts.push(qValues.length);
    }

    // Verify Q-values accumulated
    expect(qValueCounts[0]).toBeGreaterThan(0);
    expect(qValueCounts[1]).toBeGreaterThanOrEqual(qValueCounts[0]); // Should accumulate
    expect(qValueCounts[2]).toBeGreaterThanOrEqual(qValueCounts[1]); // Should accumulate

    // Verify final count is at least 3 (one per task minimum)
    expect(qValueCounts[2]).toBeGreaterThanOrEqual(3);

    // Verify database has all experiences
    const db = (memoryStore as any).db;
    const experienceCount = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM learning_experiences
      WHERE agent_id = ?
    `).get(agent['agentId'].id);

    expect(experienceCount.cnt).toBeGreaterThanOrEqual(3);
  }, 90000);

  /**
   * Test 4: Learning status reflects database state
   * Verifies that agent learning status correctly reports persisted data
   */
  it('should report accurate learning status from database', async () => {
    // Execute a task to generate learning data
    const task = {
      id: 'status-task',
      type: QEAgentType.TEST_GENERATOR,
      description: 'Task for status check',
      priority: 'medium' as const,
      requirements: {
        capabilities: ['jest-test-generation'],
        estimatedDuration: 5000,
        dependencies: []
      },
      payload: {
        sourceCode: {
          files: [{
            path: 'src/status.service.ts',
            content: 'class StatusService { checkStatus() { return "OK"; } }',
            language: 'typescript'
          }],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            functionCount: 1,
            linesOfCode: 5
          }
        },
        framework: 'jest',
        coverage: { target: 80, type: 'line' as const },
        constraints: {
          maxTests: 5,
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      }
    };

    await agent.executeTask({
      id: 'assignment-status',
      task,
      agentId: agent['agentId'].id,
      assignedAt: new Date(),
      status: 'assigned'
    });

    // Get learning status
    const learningStatus = agent.getLearningStatus();

    expect(learningStatus).toBeDefined();
    expect(learningStatus!.enabled).toBe(true);
    expect(learningStatus!.totalExperiences).toBeGreaterThan(0);
    expect(learningStatus!.explorationRate).toBeGreaterThan(0);
    expect(learningStatus!.patterns).toBeGreaterThanOrEqual(0);

    // Verify patterns can be retrieved
    const patterns = agent.getLearnedPatterns();
    expect(Array.isArray(patterns)).toBe(true);
  }, 30000);

  /**
   * Test 5: Database schema verification
   * Ensures learning tables have correct structure for persistence
   */
  it('should maintain correct database schema for learning', async () => {
    // Execute a task to initialize learning tables
    const task = {
      id: 'schema-task',
      type: QEAgentType.TEST_GENERATOR,
      description: 'Task for schema check',
      priority: 'medium' as const,
      requirements: {
        capabilities: ['jest-test-generation'],
        estimatedDuration: 5000,
        dependencies: []
      },
      payload: {
        sourceCode: {
          files: [{
            path: 'src/schema.service.ts',
            content: 'class SchemaService { verify() { return true; } }',
            language: 'typescript'
          }],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            functionCount: 1,
            linesOfCode: 5
          }
        },
        framework: 'jest',
        coverage: { target: 80, type: 'line' as const },
        constraints: {
          maxTests: 5,
          maxExecutionTime: 30000,
          testTypes: [TestType.UNIT]
        }
      }
    };

    await agent.executeTask({
      id: 'assignment-schema',
      task,
      agentId: agent['agentId'].id,
      assignedAt: new Date(),
      status: 'assigned'
    });

    const db = (memoryStore as any).db;

    // Verify learning tables exist
    const tables = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type='table'
    `).all();

    const tableNames = tables.map((t: any) => t.name);
    expect(tableNames).toContain('q_values');
    expect(tableNames).toContain('learning_experiences');

    // Verify q_values table schema
    const qValuesSchema = db.prepare(`
      PRAGMA table_info(q_values)
    `).all();

    const qValuesColumns = qValuesSchema.map((col: any) => col.name);
    expect(qValuesColumns).toContain('agent_id');
    expect(qValuesColumns).toContain('state');
    expect(qValuesColumns).toContain('action');
    expect(qValuesColumns).toContain('value');

    // Verify learning_experiences table schema
    const experiencesSchema = db.prepare(`
      PRAGMA table_info(learning_experiences)
    `).all();

    const experiencesColumns = experiencesSchema.map((col: any) => col.name);
    expect(experiencesColumns).toContain('agent_id');
    expect(experiencesColumns).toContain('state');
    expect(experiencesColumns).toContain('action');
    expect(experiencesColumns).toContain('reward');
    expect(experiencesColumns).toContain('next_state');

    // Verify data exists in tables
    const qValueCount = db.prepare(`
      SELECT COUNT(*) as cnt FROM q_values
    `).get().cnt;

    const experienceCount = db.prepare(`
      SELECT COUNT(*) as cnt FROM learning_experiences
    `).get().cnt;

    expect(qValueCount).toBeGreaterThan(0);
    expect(experienceCount).toBeGreaterThan(0);

    // Verify database integrity
    const integrityCheck = db.pragma('integrity_check');
    expect(integrityCheck[0]).toEqual({ integrity_check: 'ok' });
  }, 30000);
});
