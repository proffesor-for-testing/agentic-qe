/**
 * Task Orchestrate Handler Test Suite
 *
 * Tests for complex task orchestration across agents.
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TaskOrchestrateHandler } from '@mcp/handlers/task-orchestrate';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

// Mock services
jest.mock('../../../src/mcp/services/AgentRegistry.js');
jest.mock('../../../src/mcp/services/HookExecutor.js');

describe('TaskOrchestrateHandler', () => {
  let handler: TaskOrchestrateHandler;
  let mockAgentRegistry: AgentRegistry;
  let mockHookExecutor: HookExecutor;

  beforeEach(() => {
    mockAgentRegistry = {
      spawnAgent: jest.fn().mockResolvedValue({
        id: 'agent-orchestrated-1234567890-abc123',
        agent: {
          getStatus: jest.fn().mockReturnValue({ status: 'active' })
        }
      }),
      getAgent: jest.fn(),
      listAgents: jest.fn(),
      executeTask: jest.fn().mockResolvedValue({ status: 'completed', data: {} })
    } as any;

    mockHookExecutor = {
      executePreTask: jest.fn().mockResolvedValue(undefined),
      executePostTask: jest.fn().mockResolvedValue(undefined),
      notify: jest.fn().mockResolvedValue(undefined)
    } as any;

    handler = new TaskOrchestrateHandler(mockAgentRegistry, mockHookExecutor);
  });

  describe('Happy Path', () => {
    it('should orchestrate task successfully', async () => {
      const response = await handler.handle({
        task: {
          type: 'comprehensive-testing',
          priority: 'medium',
          strategy: 'parallel',
          timeoutMinutes: 30
        },
        context: {}
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.id).toBeDefined();
      expect(response.data.type).toBe('comprehensive-testing');
    });

    it('should handle parallel strategy', async () => {
      const response = await handler.handle({
        task: {
          type: 'quality-gate',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5
        },
        context: {}
      });

      expect(response.success).toBe(true);
      expect(response.data.strategy).toBe('parallel');
    });

    it('should handle sequential strategy', async () => {
      const response = await handler.handle({
        task: {
          type: 'defect-prevention',
          priority: 'low',
          strategy: 'sequential',
          maxAgents: 3
        },
        context: {}
      });

      expect(response.success).toBe(true);
      expect(response.data.strategy).toBe('sequential');
    });

    it('should handle adaptive strategy', async () => {
      const response = await handler.handle({
        task: {
          type: 'performance-validation',
          priority: 'critical',
          strategy: 'adaptive'
        },
        context: {}
      });

      expect(response.success).toBe(true);
      expect(response.data.strategy).toBe('adaptive');
    });
  });

  describe('Validation', () => {
    it('should reject missing task', async () => {
      const response = await handler.handle({} as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should reject invalid task type', async () => {
      const response = await handler.handle({
        task: {
          type: 'invalid-type' as any,
          priority: 'medium',
          strategy: 'parallel'
        }
      });

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/invalid.*type/i);
    });

    it('should reject invalid priority', async () => {
      const response = await handler.handle({
        task: {
          type: 'quality-gate',
          priority: 'invalid-priority' as any,
          strategy: 'parallel'
        }
      });

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/invalid.*priority/i);
    });

    it('should reject invalid strategy', async () => {
      const response = await handler.handle({
        task: {
          type: 'quality-gate',
          priority: 'medium',
          strategy: 'invalid-strategy' as any
        }
      });

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/invalid.*strategy/i);
    });
  });

  describe('Workflow Creation', () => {
    it('should create workflow steps for comprehensive-testing', async () => {
      const response = await handler.handle({
        task: {
          type: 'comprehensive-testing',
          priority: 'medium',
          strategy: 'parallel'
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.workflow).toBeDefined();
      expect(response.data.workflow.length).toBeGreaterThan(0);
    });

    it('should assign agents to workflow steps', async () => {
      const response = await handler.handle({
        task: {
          type: 'quality-gate',
          priority: 'high',
          strategy: 'parallel'
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.assignments).toBeDefined();
      expect(response.data.assignments.length).toBeGreaterThan(0);
    });

    it('should initialize progress tracking', async () => {
      const response = await handler.handle({
        task: {
          type: 'defect-prevention',
          priority: 'medium',
          strategy: 'sequential'
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.progress).toBeDefined();
      expect(response.data.progress.totalSteps).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle registry failures gracefully', async () => {
      const mockFailingRegistry = {
        spawnAgent: jest.fn().mockRejectedValue(new Error('Registry unavailable'))
      } as any;

      const failingHandler = new TaskOrchestrateHandler(mockFailingRegistry, mockHookExecutor);

      const response = await failingHandler.handle({
        task: {
          type: 'comprehensive-testing',
          priority: 'medium',
          strategy: 'parallel'
        }
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Registry unavailable');
    });
  });

  describe('Hook Execution', () => {
    it('should call pre-task hook', async () => {
      await handler.handle({
        task: {
          type: 'quality-gate',
          priority: 'medium',
          strategy: 'parallel'
        }
      });

      expect(mockHookExecutor.executePreTask).toHaveBeenCalled();
    });

    it('should call post-task hook on success', async () => {
      await handler.handle({
        task: {
          type: 'quality-gate',
          priority: 'medium',
          strategy: 'parallel'
        }
      });

      expect(mockHookExecutor.executePostTask).toHaveBeenCalled();
    });
  });
});
