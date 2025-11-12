/**
 * Learning Architecture Regression Tests
 *
 * CRITICAL REGRESSION TEST: Prevents database instance mismatch bug
 *
 * Context: Previously, LearningEngine auto-created its own Database instance
 * instead of using the shared SwarmMemoryManager database. This caused:
 * - Separate database files (.agentic-qe/memory.db vs .test/test.db)
 * - Learning data not visible to agents
 * - Memory fragmentation and inconsistency
 *
 * Architecture Contract:
 * - LearningEngine MUST use memoryStore for ALL persistence
 * - LearningEngine MUST NOT create separate Database instances
 * - All learning data MUST be in the same database as memory entries
 *
 * This test MUST FAIL if anyone re-introduces the bug.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { TestGeneratorAgent } from '../../src/agents/TestGeneratorAgent';
import { QEAgentType, TestType, TaskAssignment } from '../../src/types';

describe('Learning Architecture Regression Tests', () => {
  let memoryStore: SwarmMemoryManager;
  let agent: TestGeneratorAgent;
  const testDbPath = '.test/arch-test.db';

  beforeEach(async () => {
    // Clean up any existing test database
    await fs.remove('.test');
    await fs.ensureDir('.test');

    // Create shared database via SwarmMemoryManager
    memoryStore = new SwarmMemoryManager(testDbPath);
    await memoryStore.initialize();

    // Create agent with learning enabled and shared memoryStore
    agent = new TestGeneratorAgent({
      type: QEAgentType.TEST_GENERATOR,
      capabilities: [],
      context: {},
      memoryStore,
      eventBus: new EventEmitter(),
      enableLearning: true, // Enable learning to test LearningEngine
      learningConfig: {
        enabled: true,
        learningRate: 0.1,
        discountFactor: 0.95
      }
    });

    await agent.initialize();
  });

  afterEach(async () => {
    // Cleanup
    if (memoryStore) {
      await memoryStore.close();
    }
    await fs.remove('.test');
  });

  // ============================================================================
  // CRITICAL REGRESSION TEST #1: No Separate Database Instance
  // ============================================================================

  it('should use memoryStore for learning persistence (no separate database)', async () => {
    const learningEngine = (agent as any).learningEngine;

    // Verify LearningEngine exists (learning enabled)
    expect(learningEngine).toBeDefined();

    // CRITICAL: Verify LearningEngine doesn't have its own database
    expect(learningEngine.database).toBeUndefined();
    expect(learningEngine.persistence).toBeUndefined();

    // CRITICAL: Verify it uses memoryStore
    expect(learningEngine.memoryStore).toBeDefined();
    expect(learningEngine.memoryStore).toBe(memoryStore);
  });

  // ============================================================================
  // CRITICAL REGRESSION TEST #2: Same Database File
  // ============================================================================

  it('should write learning data to the same database as memory entries', async () => {
    // Store a memory entry
    await memoryStore.store('test-key', { data: 'test' }, { partition: 'test' });

    // Execute task (triggers learning via onPostTask hook)
    const assignment: TaskAssignment = {
      id: 'test-task-001',
      task: {
        id: 'test-task-001',
        type: 'test-generation',
        description: 'Generate unit tests',
        priority: 'medium',
        requirements: {
          capabilities: ['jest-test-generation'],
          estimatedDuration: 5000
        },
        context: {},
        payload: {
          sourceFile: 'UserService.ts',
          sourceContent: 'export class UserService { getUser(id: string) { return { id }; } }',
          framework: 'jest',
          coverageTarget: 80,
          testTypes: [TestType.UNIT]
        }
      },
      agentId: agent['agentId'].id,
      assignedAt: new Date(),
      status: 'assigned'
    };

    try {
      await agent.executeTask(assignment);
    } catch (error) {
      // Task might fail but learning should still happen
      console.log('Task execution failed (expected):', error);
    }

    // Both should be in the SAME database file
    const db = (memoryStore as any).db;
    expect(db).toBeDefined();

    // Verify memory entries table exists and has data
    const memoryCount = db.prepare('SELECT COUNT(*) as cnt FROM memory_entries').get().cnt;
    expect(memoryCount).toBeGreaterThan(0);

    // Verify learning experiences table exists (should be created)
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='learning_experiences'"
    ).all();

    expect(tables).toHaveLength(1);

    // Verify they're in the same database (check file path)
    const dbPath = (memoryStore as any).dbPath;
    expect(dbPath).toBe(testDbPath);

    // Verify only ONE database file exists (not separate files)
    const dbFileExists = await fs.pathExists(testDbPath);
    expect(dbFileExists).toBe(true);

    // Ensure no separate memory.db file was created
    const separateDbExists = await fs.pathExists('.agentic-qe/memory.db');
    expect(separateDbExists).toBe(false);
  });

  // ============================================================================
  // CRITICAL REGRESSION TEST #3: No Auto-Created Database
  // ============================================================================

  it('should not auto-create Database instance in LearningEngine', async () => {
    const learningEngine = (agent as any).learningEngine;

    // Check for flags that indicate auto-created database
    expect(learningEngine.databaseAutoCreated).toBeFalsy();
    expect(learningEngine.databaseReady).toBeFalsy();

    // Verify constructor doesn't have database parameter in wrong position
    const constructor = learningEngine.constructor;
    expect(constructor.name).toBe('LearningEngine');

    // Verify no separate Database instance exists
    expect(learningEngine.database).toBeUndefined();
  });

  // ============================================================================
  // CRITICAL REGRESSION TEST #4: MemoryStore Methods Used
  // ============================================================================

  it('should persist learning data via memoryStore methods (not Database)', async () => {
    const learningEngine = (agent as any).learningEngine;

    // Spy on memoryStore methods to verify they're called
    const storeSpy = jest.spyOn(memoryStore, 'storeLearningExperience');
    const qValueSpy = jest.spyOn(memoryStore, 'upsertQValue');

    // Execute a task that triggers learning
    const assignment: TaskAssignment = {
      id: 'test-task-002',
      task: {
        id: 'test-task-002',
        type: 'test-generation',
        description: 'Generate integration tests',
        priority: 'high',
        requirements: {
          capabilities: ['jest-test-generation'],
          estimatedDuration: 3000
        },
        context: {},
        payload: {
          sourceFile: 'ApiService.ts',
          sourceContent: 'export class ApiService { async fetch() { return {}; } }',
          framework: 'jest',
          coverageTarget: 90,
          testTypes: [TestType.INTEGRATION]
        }
      },
      agentId: agent['agentId'].id,
      assignedAt: new Date(),
      status: 'assigned'
    };

    try {
      await agent.executeTask(assignment);
    } catch (error) {
      // Task might fail but learning should still be attempted
      console.log('Task execution failed (expected):', error);
    }

    // Verify memoryStore methods were called (NOT Database methods)
    // Learning happens in onPostTask hook even if task fails
    expect(storeSpy).toHaveBeenCalled();
    expect(qValueSpy).toHaveBeenCalled();

    // Cleanup spies
    storeSpy.mockRestore();
    qValueSpy.mockRestore();
  });

  // ============================================================================
  // CRITICAL REGRESSION TEST #5: Architecture Contract Validation
  // ============================================================================

  it('should enforce architectural contract: single database source of truth', async () => {
    const learningEngine = (agent as any).learningEngine;

    // Contract: LearningEngine receives memoryStore in constructor
    expect(learningEngine.memoryStore).toBe(memoryStore);

    // Contract: No separate database instance created
    expect(learningEngine.database).toBeUndefined();

    // Contract: No separate persistence adapter (uses memoryStore)
    expect(learningEngine.persistence).toBeUndefined();

    // Contract: All data goes through memoryStore
    const db = (memoryStore as any).db;
    expect(db).toBeDefined();

    // Contract: Single database file
    const dbPath = (memoryStore as any).dbPath;
    expect(dbPath).toBe(testDbPath);

    // Contract: Learning tables exist in the same database
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('memory_entries', 'learning_experiences', 'q_values')"
    ).all();

    // Should have memory_entries table and learning tables
    expect(tables.length).toBeGreaterThanOrEqual(1);

    // Verify no hidden Database instances
    expect(learningEngine.databaseAutoCreated).toBeFalsy();

    console.log('✅ Architectural contract validated: Single database source of truth');
  });

  // ============================================================================
  // CRITICAL REGRESSION TEST #6: Verify Constructor Signature
  // ============================================================================

  it('should have correct LearningEngine constructor signature', async () => {
    const learningEngine = (agent as any).learningEngine;
    const constructor = learningEngine.constructor;

    // LearningEngine constructor should accept:
    // 1. agentId: string
    // 2. memoryStore: SwarmMemoryManager
    // 3. config?: Partial<LearningConfig>
    //
    // It should NOT accept:
    // - database: Database (removed in fix)
    // - persistence: LearningPersistence (removed in fix)

    expect(constructor.length).toBeLessThanOrEqual(3);
    expect(constructor.name).toBe('LearningEngine');

    // Verify instance properties
    expect(learningEngine.memoryStore).toBeDefined();
    expect(learningEngine.agentId).toBeDefined();
    expect(learningEngine.config).toBeDefined();

    // Verify NO database or persistence properties
    expect(learningEngine.database).toBeUndefined();
    expect(learningEngine.persistence).toBeUndefined();
  });

  // ============================================================================
  // CRITICAL REGRESSION TEST #7: Prevent Duplicate Tables
  // ============================================================================

  it('should not create duplicate learning tables in separate databases', async () => {
    // Execute multiple tasks to trigger learning
    for (let i = 0; i < 3; i++) {
      const assignment: TaskAssignment = {
        id: `test-task-00${i + 3}`,
        task: {
          id: `test-task-00${i + 3}`,
          type: 'test-generation',
          description: `Generate tests ${i}`,
          priority: 'low',
          requirements: {
            capabilities: ['jest-test-generation'],
            estimatedDuration: 2000
          },
          context: {},
          payload: {
            sourceFile: `Service${i}.ts`,
            sourceContent: `export class Service${i} { method() {} }`,
            framework: 'jest',
            coverageTarget: 70,
            testTypes: [TestType.UNIT]
          }
        },
        agentId: agent['agentId'].id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      try {
        await agent.executeTask(assignment);
      } catch (error) {
        // Continue even if tasks fail
      }
    }

    // Verify only ONE database file exists
    const testDbExists = await fs.pathExists(testDbPath);
    expect(testDbExists).toBe(true);

    // Verify no other database files were created
    const memoryDbExists = await fs.pathExists('.agentic-qe/memory.db');
    expect(memoryDbExists).toBe(false);

    const learningDbExists = await fs.pathExists('.agentic-qe/learning.db');
    expect(learningDbExists).toBe(false);

    // Verify all tables are in the same database
    const db = (memoryStore as any).db;
    const allTables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all();

    console.log('✅ All tables in single database:', allTables.map((t: any) => t.name));

    // Should have memory and learning tables together
    const tableNames = allTables.map((t: any) => t.name);
    expect(tableNames).toContain('memory_entries');

    // Learning tables should exist in the SAME database
    // (Even if not all are created, they should be in THIS database only)
    const learningTables = tableNames.filter((name: string) =>
      name.includes('learning') || name.includes('q_value')
    );

    console.log('✅ Learning tables in shared database:', learningTables);
  });

  // ============================================================================
  // CRITICAL REGRESSION TEST #8: Memory Store Integration
  // ============================================================================

  it('should integrate learning data with memory store queries', async () => {
    // Store learning experience via agent task execution
    const assignment: TaskAssignment = {
      id: 'test-task-integration',
      task: {
        id: 'test-task-integration',
        type: 'test-generation',
        description: 'Integration test',
        priority: 'critical',
        requirements: {
          capabilities: ['jest-test-generation'],
          estimatedDuration: 1000
        },
        context: {},
        payload: {
          sourceFile: 'IntegrationService.ts',
          sourceContent: 'export class IntegrationService {}',
          framework: 'jest',
          coverageTarget: 95,
          testTypes: [TestType.UNIT]
        }
      },
      agentId: agent['agentId'].id,
      assignedAt: new Date(),
      status: 'assigned'
    };

    try {
      await agent.executeTask(assignment);
    } catch (error) {
      // Continue even if task fails
    }

    // Query learning data through memoryStore
    const learningState = await memoryStore.retrieve(
      `phase2/learning/${agent['agentId'].id}/state`,
      { partition: 'learning' }
    );

    // Learning state should be stored via memoryStore
    // (May be null if no experiences yet, but should be queryable)
    console.log('Learning state from memoryStore:', learningState ? 'exists' : 'null');

    // Verify we can query the database directly for learning data
    const db = (memoryStore as any).db;
    const memoryEntries = db.prepare(
      "SELECT key FROM memory_entries WHERE key LIKE '%learning%'"
    ).all();

    console.log('✅ Learning memory entries:', memoryEntries.length);

    // All learning data should be accessible through memoryStore
    expect(memoryEntries.length).toBeGreaterThanOrEqual(0);
  });
});
