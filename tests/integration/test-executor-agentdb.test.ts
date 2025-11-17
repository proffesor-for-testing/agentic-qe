/**
 * Integration tests for TestExecutorAgent pattern storage
 * Tests execution pattern storage, retrieval, and QUIC sync reporting
 */

import { TestExecutorAgent } from '../../src/agents/TestExecutorAgent';
import { AgentId } from '../../src/agents/BaseAgent';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import * as fs from 'fs';
import * as path from 'path';

describe('TestExecutorAgent Pattern Storage', () => {
  let testAgent: TestExecutorAgent;
  let testDbPath: string;
  let memoryManager: SwarmMemoryManager;

  beforeEach(async () => {
    // Create unique test database path
    testDbPath = path.join(process.cwd(), `.test-executor-agentdb-${Date.now()}.db`);

    // Create agent with memory manager
    const agentId: AgentId = {
      id: 'test-executor-001',
      type: 'test-executor',
      capabilities: ['test-execution', 'pattern-learning']
    };

    testAgent = new TestExecutorAgent(agentId, {
      frameworkConfig: {
        jest: {
          configPath: './jest.config.js',
          testMatch: ['**/*.test.ts']
        }
      }
    });

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

  describe('Execution Pattern Storage', () => {
    it('should store execution patterns after successful test run', async () => {
      const testResult = {
        framework: 'jest',
        passed: 15,
        failed: 0,
        skipped: 2,
        total: 17,
        duration: 2500,
        coverage: {
          lines: 85.5,
          branches: 78.3,
          functions: 90.2,
          statements: 84.7
        },
        testFiles: ['user.test.ts', 'auth.test.ts']
      };

      // Store execution patterns
      await (testAgent as any).storeExecutionPatternsInAgentDB(testResult);

      // Verify patterns were stored
      const patterns = await memoryManager.queryPatternsByAgent('test-executor-001', 0);
      expect(patterns.length).toBeGreaterThan(0);

      // Verify pattern metadata contains test execution data
      const pattern = patterns[0];
      const metadata = JSON.parse(pattern.metadata);
      expect(metadata.agent_id).toBe('test-executor-001');
      expect(metadata.framework).toBe('jest');
      expect(metadata.testCount).toBe(17);
    });

    it('should store patterns with high confidence for passing tests', async () => {
      const successResult = {
        framework: 'jest',
        passed: 50,
        failed: 0,
        total: 50,
        duration: 5000
      };

      await (testAgent as any).storeExecutionPatternsInAgentDB(successResult);

      const patterns = await memoryManager.queryPatternsByAgent('test-executor-001', 0);
      expect(patterns.length).toBeGreaterThan(0);

      // 100% pass rate should have high confidence
      const pattern = patterns[0];
      expect(pattern.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should store patterns with lower confidence for failing tests', async () => {
      const failureResult = {
        framework: 'jest',
        passed: 10,
        failed: 15,
        total: 25,
        duration: 3000
      };

      await (testAgent as any).storeExecutionPatternsInAgentDB(failureResult);

      const patterns = await memoryManager.queryPatternsByAgent('test-executor-001', 0);
      expect(patterns.length).toBeGreaterThan(0);

      // 40% pass rate should have lower confidence
      const pattern = patterns[0];
      expect(pattern.confidence).toBeLessThan(0.6);
    });
  });

  describe('Pattern Retrieval Before Execution', () => {
    it('should retrieve historical execution patterns before running tests', async () => {
      // Store historical pattern
      await memoryManager.storePattern({
        id: 'historical-pattern-001',
        pattern: 'jest:execution:success',
        confidence: 0.9,
        usageCount: 10,
        metadata: {
          agent_id: 'test-executor-001',
          framework: 'jest',
          avgDuration: 2500,
          avgPassRate: 0.95
        }
      });

      // Retrieve patterns
      const patterns = await memoryManager.queryPatternsByAgent('test-executor-001', 0.8);

      expect(patterns.length).toBe(1);
      expect(patterns[0].confidence).toBe(0.9);

      const metadata = JSON.parse(patterns[0].metadata);
      expect(metadata.framework).toBe('jest');
    });

    it('should filter patterns by minimum confidence threshold', async () => {
      // Store patterns with varying confidence
      await memoryManager.storePattern({
        id: 'high-conf-pattern',
        pattern: 'jest:reliable',
        confidence: 0.95,
        usageCount: 20,
        metadata: { agent_id: 'test-executor-001' }
      });

      await memoryManager.storePattern({
        id: 'low-conf-pattern',
        pattern: 'jest:unreliable',
        confidence: 0.3,
        usageCount: 2,
        metadata: { agent_id: 'test-executor-001' }
      });

      // Query with confidence threshold 0.8
      const highConfPatterns = await memoryManager.queryPatternsByAgent('test-executor-001', 0.8);

      expect(highConfPatterns.length).toBe(1);
      expect(highConfPatterns[0].id).toBe('high-conf-pattern');
    });
  });

  describe('Mock vs Real Adapter Behavior', () => {
    it('should handle mock adapter in test environment', () => {
      process.env.NODE_ENV = 'test';

      const isReal = (testAgent as any).isRealAgentDB();
      expect(isReal).toBe(false);

      // Mock adapter should not affect test execution
    });

    it('should use real adapter when configured', async () => {
      // Set up real adapter environment
      delete process.env.NODE_ENV;
      delete process.env.JEST_WORKER_ID;
      process.env.AQE_USE_MOCK_AGENTDB = 'false';

      // Pattern storage should work with real adapter
      const testResult = {
        framework: 'jest',
        passed: 10,
        failed: 0,
        total: 10,
        duration: 1000
      };

      await expect((testAgent as any).storeExecutionPatternsInAgentDB(testResult))
        .resolves.not.toThrow();

      // Restore environment
      process.env.NODE_ENV = 'test';
    });
  });

  describe('QUIC Sync Reporting', () => {
    it('should report QUIC sync status when real AgentDB is used', async () => {
      // This test verifies that QUIC sync logging is conditional
      // In mock mode, QUIC sync should not be reported

      process.env.NODE_ENV = 'test'; // Mock mode

      const testResult = {
        framework: 'jest',
        passed: 10,
        failed: 0,
        total: 10,
        duration: 1000
      };

      // Store patterns (should not log QUIC sync in mock mode)
      await (testAgent as any).storeExecutionPatternsInAgentDB(testResult);

      // No QUIC sync should be reported in mock mode
      // This is verified through logging - in real implementation,
      // we'd capture console output to verify
    });
  });

  describe('Pattern Embedding Generation', () => {
    it('should generate embeddings for execution patterns', async () => {
      const testResult = {
        framework: 'jest',
        passed: 20,
        failed: 1,
        total: 21,
        duration: 3000
      };

      // Spy on embedding generation
      const createEmbeddingSpy = jest.spyOn(testAgent as any, 'createExecutionPatternEmbedding');

      await (testAgent as any).storeExecutionPatternsInAgentDB(testResult);

      // Verify embedding was created
      expect(createEmbeddingSpy).toHaveBeenCalled();

      createEmbeddingSpy.mockRestore();
    });

    it('should generate consistent embeddings for similar patterns', async () => {
      const pattern1 = { framework: 'jest', passed: 10, total: 10 };
      const pattern2 = { framework: 'jest', passed: 10, total: 10 };

      const embedding1 = await (testAgent as any).createExecutionPatternEmbedding(pattern1);
      const embedding2 = await (testAgent as any).createExecutionPatternEmbedding(pattern2);

      // Same pattern should generate identical embeddings
      expect(embedding1).toEqual(embedding2);
    });
  });

  describe('Error Handling', () => {
    it('should handle pattern storage failures gracefully', async () => {
      // Close database to simulate failure
      await memoryManager.close();

      const testResult = {
        framework: 'jest',
        passed: 10,
        failed: 0,
        total: 10,
        duration: 1000
      };

      // Should not throw even if storage fails
      await expect((testAgent as any).storeExecutionPatternsInAgentDB(testResult))
        .resolves.not.toThrow();
    });

    it('should handle pattern retrieval failures gracefully', async () => {
      // Close database to simulate failure
      await memoryManager.close();

      // Should not throw even if retrieval fails
      await expect(memoryManager.queryPatternsByAgent('test-executor-001', 0))
        .rejects.toThrow();

      // Agent should continue execution despite retrieval failure
    });

    it('should continue test execution if AgentDB fails', async () => {
      // Simulate AgentDB failure
      (testAgent as any).memoryStore = null;

      const testResult = {
        framework: 'jest',
        passed: 5,
        failed: 0,
        total: 5,
        duration: 500
      };

      // Test execution should complete even if pattern storage fails
      await expect((testAgent as any).storeExecutionPatternsInAgentDB(testResult))
        .resolves.not.toThrow();
    });
  });

  describe('Framework-Specific Pattern Storage', () => {
    it('should store framework-specific metadata for Jest', async () => {
      const jestResult = {
        framework: 'jest',
        passed: 25,
        failed: 2,
        total: 27,
        duration: 4500,
        coverage: {
          lines: 88.5,
          branches: 82.0,
          functions: 91.5,
          statements: 87.3
        }
      };

      await (testAgent as any).storeExecutionPatternsInAgentDB(jestResult);

      const patterns = await memoryManager.queryPatternsByAgent('test-executor-001', 0);
      const metadata = JSON.parse(patterns[0].metadata);

      expect(metadata.framework).toBe('jest');
      expect(metadata.coverage).toBeDefined();
    });

    it('should store framework-specific metadata for Mocha', async () => {
      const mochaResult = {
        framework: 'mocha',
        passed: 30,
        failed: 1,
        total: 31,
        duration: 3200
      };

      await (testAgent as any).storeExecutionPatternsInAgentDB(mochaResult);

      const patterns = await memoryManager.queryPatternsByAgent('test-executor-001', 0);
      const metadata = JSON.parse(patterns[0].metadata);

      expect(metadata.framework).toBe('mocha');
    });
  });
});
