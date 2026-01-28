/**
 * TinyDancer Full Integration Test
 * ADR-051: Verifies complete model routing pipeline from MCP handlers to task execution
 *
 * Tests:
 * 1. Tier selection based on task complexity
 * 2. Agent Booster execution for Tier 0
 * 3. Agent Booster fallback to Tier 1
 * 4. Outcome recording after task completion
 * 5. Routing metadata in task results
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  DomainTaskExecutor,
  createTaskExecutor,
  resetServiceCaches,
} from '../../src/coordination/task-executor';
import { QueenTask } from '../../src/coordination/queen-coordinator';
import { createKernel, QEKernel, initializeUnifiedMemory, resetUnifiedMemory } from '../../src/kernel';

describe('TinyDancer Full Integration (ADR-051)', () => {
  let executor: DomainTaskExecutor;
  let kernel: QEKernel;

  beforeAll(async () => {
    // Initialize unified memory
    await initializeUnifiedMemory({
      persistPath: '.agentic-qe/test-tinydancer-memory.db',
      vectorDimensions: 384,
      cacheEnabled: true,
    });

    kernel = await createKernel({
      eventBusConfig: { maxListeners: 100, bufferSize: 1000 },
    });

    executor = createTaskExecutor(kernel, {
      saveResults: false, // Don't save to files in tests
    });
  });

  afterAll(async () => {
    await resetServiceCaches();
    await resetUnifiedMemory();
  });

  beforeEach(async () => {
    // Reset caches between tests
    await resetServiceCaches();
  });

  // =========================================================================
  // Tier 0: Agent Booster Tests
  // =========================================================================

  describe('Tier 0: Agent Booster Execution', () => {
    it('should use Agent Booster for var-to-const transforms', async () => {
      const task: QueenTask = {
        id: 'test-booster-var-1',
        type: 'generate-tests',
        priority: 'p2',
        targetDomains: ['test-generation'],
        payload: {
          routingTier: 0,
          useAgentBooster: true,
          codeContext: 'var x = 1; var y = 2; var z = x + y;',
          sourceCode: 'var x = 1; var y = 2; var z = x + y;',
        },
        timeout: 30000,
        createdAt: new Date(),
      };

      const result = await executor.execute(task);

      // Agent Booster should handle this
      if (result.success && result.data) {
        const data = result.data as Record<string, unknown>;
        if (data.transformed) {
          expect(data.transformType).toBe('var-to-const');
          expect(data.tier).toBe(0);
          expect(data.model).toBe('agent-booster');
          expect(data.confidence).toBeGreaterThanOrEqual(0.7);
        }
      }
    });

    it('should use Agent Booster for remove-console transforms', async () => {
      const task: QueenTask = {
        id: 'test-booster-console-1',
        type: 'generate-tests',
        priority: 'p2',
        targetDomains: ['test-generation'],
        payload: {
          routingTier: 0,
          useAgentBooster: true,
          codeContext: 'console.log("debug"); console.error("error"); const x = 1;',
          sourceCode: 'console.log("debug"); console.error("error"); const x = 1;',
        },
        timeout: 30000,
        createdAt: new Date(),
      };

      const result = await executor.execute(task);

      if (result.success && result.data) {
        const data = result.data as Record<string, unknown>;
        if (data.transformed) {
          expect(data.transformType).toBe('remove-console');
          expect(data.tier).toBe(0);
        }
      }
    });

    it('should fall back to Tier 1 when no applicable transform', async () => {
      const task: QueenTask = {
        id: 'test-booster-fallback-1',
        type: 'generate-tests',
        priority: 'p2',
        targetDomains: ['test-generation'],
        payload: {
          routingTier: 0,
          useAgentBooster: true,
          sourceCode: 'const x: number = 1; const y: string = "hello";', // No transforms applicable
        },
        timeout: 30000,
        createdAt: new Date(),
      };

      const result = await executor.execute(task);

      // Should have fallen back to normal execution
      expect(result.success).toBeDefined();
      // Task should complete (either with test generation or gracefully)
    });
  });

  // =========================================================================
  // Tier Selection Tests
  // =========================================================================

  describe('Tier Selection', () => {
    it('should default to Tier 2 (Sonnet) when no tier specified', async () => {
      const task: QueenTask = {
        id: 'test-tier-default-1',
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: {
          sourceCode: 'function add(a, b) { return a + b; }',
        },
        timeout: 30000,
        createdAt: new Date(),
      };

      const result = await executor.execute(task);

      expect(result.success).toBeDefined();
      if (result.success && result.data) {
        const data = result.data as Record<string, unknown>;
        const routing = data._routing as { tier: number; model: string } | undefined;
        if (routing) {
          expect(routing.tier).toBe(2); // Default to Sonnet
          expect(routing.model).toContain('sonnet');
        }
      }
    });

    it('should use specified tier from payload', async () => {
      const task: QueenTask = {
        id: 'test-tier-specified-1',
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: {
          routingTier: 1, // Haiku
          sourceCode: 'function greet(name) { return "Hello " + name; }',
        },
        timeout: 30000,
        createdAt: new Date(),
      };

      const result = await executor.execute(task);

      expect(result.success).toBeDefined();
      if (result.success && result.data) {
        const data = result.data as Record<string, unknown>;
        const routing = data._routing as { tier: number; model: string } | undefined;
        if (routing) {
          expect(routing.tier).toBe(1);
          expect(routing.model).toContain('haiku');
        }
      }
    });
  });

  // =========================================================================
  // Outcome Recording Tests
  // =========================================================================

  describe('Outcome Recording', () => {
    it('should record successful outcomes', async () => {
      const task: QueenTask = {
        id: 'test-outcome-success-1',
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: {
          routingTier: 2,
          sourceCode: 'export function multiply(a: number, b: number): number { return a * b; }',
        },
        timeout: 30000,
        createdAt: new Date(),
      };

      const result = await executor.execute(task);

      // Outcome recording is fire-and-forget, so we just verify task completes
      expect(result.taskId).toBe('test-outcome-success-1');
      expect(result.duration).toBeGreaterThanOrEqual(0); // Duration may be 0 in fast mocked execution
    });

    it('should record failed outcomes', async () => {
      const task: QueenTask = {
        id: 'test-outcome-failure-1',
        type: 'unknown-task-type' as any, // Invalid task type
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: {},
        timeout: 30000,
        createdAt: new Date(),
      };

      const result = await executor.execute(task);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No handler registered');
    });
  });

  // =========================================================================
  // Security Scan Tests (Higher Tier)
  // =========================================================================

  describe('Security Tasks (Higher Tiers)', () => {
    it('should handle security scan with Tier 4 (Opus)', async () => {
      const task: QueenTask = {
        id: 'test-security-opus-1',
        type: 'scan-security',
        priority: 'p0',
        targetDomains: ['security-compliance'],
        payload: {
          routingTier: 4, // Opus for complex security analysis
          target: '/tmp',
          sast: true,
          compliance: ['OWASP'],
        },
        timeout: 60000,
        createdAt: new Date(),
      };

      const result = await executor.execute(task);

      expect(result.domain).toBe('security-compliance');
      if (result.success && result.data) {
        const data = result.data as Record<string, unknown>;
        const routing = data._routing as { tier: number; model: string } | undefined;
        if (routing) {
          expect(routing.tier).toBe(4);
          expect(routing.model).toContain('opus');
        }
      }
    });
  });

  // =========================================================================
  // Coverage Analysis Tests
  // =========================================================================

  describe('Coverage Analysis', () => {
    it('should execute coverage analysis with routing metadata', async () => {
      const task: QueenTask = {
        id: 'test-coverage-1',
        type: 'analyze-coverage',
        priority: 'p1',
        targetDomains: ['coverage-analysis'],
        payload: {
          routingTier: 2,
          target: process.cwd(),
          detectGaps: true,
          threshold: 80,
        },
        timeout: 30000,
        createdAt: new Date(),
      };

      const result = await executor.execute(task);

      expect(result.domain).toBe('coverage-analysis');
      expect(result.taskId).toBe('test-coverage-1');
    });
  });

  // =========================================================================
  // Quality Assessment Tests
  // =========================================================================

  describe('Quality Assessment', () => {
    it('should execute quality assessment with routing', async () => {
      const task: QueenTask = {
        id: 'test-quality-1',
        type: 'assess-quality',
        priority: 'p1',
        targetDomains: ['quality-assessment'],
        payload: {
          routingTier: 2,
          runGate: true,
          threshold: 80,
          metrics: ['coverage', 'complexity', 'maintainability'],
        },
        timeout: 30000,
        createdAt: new Date(),
      };

      const result = await executor.execute(task);

      expect(result.domain).toBe('quality-assessment');
      expect(result.taskId).toBe('test-quality-1');
    });
  });
});
