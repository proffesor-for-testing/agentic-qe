/**
 * Integration tests for BaseAgent AgentDB integration
 * Tests pattern storage, retrieval, and mock vs real adapter behavior
 */

import { BaseAgent } from '../../src/agents/BaseAgent';
import { AgentId, TaskRequirements, TaskResult } from '../../src/agents/BaseAgent';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { RealAgentDBAdapter } from '../../src/core/memory/RealAgentDBAdapter';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

// Test agent implementation
class TestAgent extends BaseAgent {
  constructor(id: AgentId) {
    super(id);
  }

  async executeTask(requirements: TaskRequirements): Promise<TaskResult> {
    return {
      success: true,
      data: { message: 'Task completed' },
      metadata: { executionTime: 100 }
    };
  }
}

describe('BaseAgent AgentDB Integration', () => {
  let testAgent: TestAgent;
  let testDbPath: string;
  let memoryManager: SwarmMemoryManager;

  beforeEach(async () => {
    // P1 FIX: Use UUID for guaranteed uniqueness + OS temp dir for proper cleanup
    // Prevents race conditions in parallel test execution
    testDbPath = path.join(os.tmpdir(), `test-agentdb-${randomUUID()}.db`);

    // Safety check: Verify file doesn't exist (should never happen with UUID)
    if (fs.existsSync(testDbPath)) {
      throw new Error(`Test database already exists: ${testDbPath}. This should not happen with UUID.`);
    }

    // Create agent with memory manager
    const agentId: AgentId = {
      id: 'test-agent-001',
      type: 'test',
      capabilities: ['testing']
    };
    testAgent = new TestAgent(agentId);

    // Initialize memory manager
    memoryManager = new SwarmMemoryManager(testDbPath);
    await memoryManager.initialize();

    // Set up agent with memory
    (testAgent as any).memoryStore = memoryManager;
  });

  afterEach(async () => {
    // Cleanup test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Pattern Storage in onPostTask', () => {
    it('should store patterns after successful task execution', async () => {
      const requirements: TaskRequirements = {
        capabilities: ['testing'],
        context: { testData: 'sample' }
      };

      const result: TaskResult = {
        success: true,
        data: { output: 'test result' }
      };

      // Call onPostTask to store patterns
      await (testAgent as any).onPostTask(requirements, result, 150);

      // Verify patterns were stored
      const patterns = await memoryManager.queryPatternsByAgent('test-agent-001', 0);
      expect(patterns.length).toBeGreaterThan(0);

      // Verify pattern metadata
      const pattern = patterns[0];
      expect(pattern.metadata).toBeDefined();
      const metadata = JSON.parse(pattern.metadata);
      expect(metadata.agent_id).toBe('test-agent-001');
    });

    it('should store patterns with correct confidence based on success', async () => {
      const requirements: TaskRequirements = {
        capabilities: ['testing']
      };

      const successResult: TaskResult = {
        success: true,
        data: { output: 'success' }
      };

      await (testAgent as any).onPostTask(requirements, successResult, 100);

      const patterns = await memoryManager.queryPatternsByAgent('test-agent-001', 0);
      expect(patterns.length).toBeGreaterThan(0);

      // Success should have higher confidence
      const successPattern = patterns[0];
      expect(successPattern.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('Pattern Retrieval in onPreTask', () => {
    it('should retrieve patterns before task execution', async () => {
      // First store some patterns
      await memoryManager.storePattern({
        id: 'pattern-001',
        pattern: 'test:pattern:success',
        confidence: 0.85,
        usageCount: 5,
        metadata: { agent_id: 'test-agent-001', task: 'testing' }
      });

      const requirements: TaskRequirements = {
        capabilities: ['testing']
      };

      // Call onPreTask to retrieve patterns
      const context = await (testAgent as any).onPreTask(requirements);

      expect(context).toBeDefined();
      // Patterns should be loaded from memory
    });

    it('should handle empty database gracefully', async () => {
      const requirements: TaskRequirements = {
        capabilities: ['testing']
      };

      // Call onPreTask with empty database
      const context = await (testAgent as any).onPreTask(requirements);

      // Should not throw error, just return empty or default context
      expect(context).toBeDefined();
    });
  });

  describe('Error Pattern Storage in onTaskError', () => {
    it('should store error patterns when task fails', async () => {
      const requirements: TaskRequirements = {
        capabilities: ['testing']
      };

      const error = new Error('Test failure');

      // Call onTaskError to store error pattern
      await (testAgent as any).onTaskError(requirements, error);

      // Verify error patterns were stored
      const patterns = await memoryManager.queryPatternsByAgent('test-agent-001', 0);
      expect(patterns.length).toBeGreaterThan(0);

      // Verify pattern has error metadata
      const pattern = patterns[0];
      const metadata = JSON.parse(pattern.metadata);
      expect(metadata.agent_id).toBe('test-agent-001');
      expect(pattern.confidence).toBeLessThan(0.5); // Error patterns have low confidence
    });
  });

  describe('Mock vs Real Adapter Detection', () => {
    it('should detect mock adapter in test environment', () => {
      // Set test environment
      process.env.NODE_ENV = 'test';

      const isReal = (testAgent as any).isRealAgentDB();
      expect(isReal).toBe(false);
    });

    it('should detect real adapter in production environment', () => {
      // Set production environment
      const originalEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;
      delete process.env.JEST_WORKER_ID;
      process.env.AQE_USE_MOCK_AGENTDB = 'false';

      // Create real AgentDB adapter
      const realAdapter = new RealAgentDBAdapter({
        dbPath: testDbPath,
        dimension: 384
      });

      (testAgent as any).agentDB = realAdapter;

      const isReal = (testAgent as any).isRealAgentDB();
      expect(isReal).toBe(true);

      // Restore environment
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Agent-Specific Pattern Filtering', () => {
    it('should only retrieve patterns for the specific agent', async () => {
      // Store patterns for different agents
      await memoryManager.storePattern({
        id: 'pattern-agent-1',
        pattern: 'agent1:pattern',
        confidence: 0.8,
        usageCount: 1,
        metadata: { agent_id: 'test-agent-001' }
      });

      await memoryManager.storePattern({
        id: 'pattern-agent-2',
        pattern: 'agent2:pattern',
        confidence: 0.8,
        usageCount: 1,
        metadata: { agent_id: 'other-agent-002' }
      });

      // Query patterns for test-agent-001
      const patterns = await memoryManager.queryPatternsByAgent('test-agent-001', 0);

      expect(patterns.length).toBe(1);
      expect(patterns[0].id).toBe('pattern-agent-1');

      const metadata = JSON.parse(patterns[0].metadata);
      expect(metadata.agent_id).toBe('test-agent-001');
    });

    it('should not leak patterns between agents', async () => {
      // Store patterns for agent 1
      await memoryManager.storePattern({
        id: 'secret-pattern',
        pattern: 'sensitive:data',
        confidence: 0.9,
        usageCount: 10,
        metadata: { agent_id: 'agent-001', secret: 'confidential' }
      });

      // Query patterns for agent 2
      const patterns = await memoryManager.queryPatternsByAgent('agent-002', 0);

      // Should not find agent 1's patterns
      expect(patterns.length).toBe(0);
    });
  });

  describe('AgentDB Error Handling', () => {
    it('should continue task execution if pattern storage fails', async () => {
      // Simulate storage failure by closing database
      await memoryManager.close();

      const requirements: TaskRequirements = {
        capabilities: ['testing']
      };

      const result: TaskResult = {
        success: true,
        data: { output: 'test' }
      };

      // onPostTask should not throw even if storage fails
      await expect((testAgent as any).onPostTask(requirements, result, 100))
        .resolves.not.toThrow();
    });

    it('should continue task execution if pattern retrieval fails', async () => {
      // Simulate retrieval failure by closing database
      await memoryManager.close();

      const requirements: TaskRequirements = {
        capabilities: ['testing']
      };

      // onPreTask should not throw even if retrieval fails
      await expect((testAgent as any).onPreTask(requirements))
        .resolves.not.toThrow();
    });
  });
});
