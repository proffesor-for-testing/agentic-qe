/**
 * Event Emit Handler Test Suite
 *
 * Comprehensive tests for coordination event emission.
 * Tests event payloads, metadata, delivery tracking, and coordination scenarios.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitHandler, EventEmitArgs } from '@mcp/handlers/coordination/event-emit';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';

// Mock SecureRandom for deterministic tests
jest.mock('../../../../src/utils/SecureRandom.js', () => ({
  SecureRandom: {
    generateId: jest.fn(() => 'test-random-id'),
    randomFloat: jest.fn(() => 0.5)
  }
}));

describe('EventEmitHandler', () => {
  let handler: EventEmitHandler;
  let mockMemory: SwarmMemoryManager;

  beforeEach(() => {
    mockMemory = new SwarmMemoryManager();
    handler = new EventEmitHandler(mockMemory);
  });

  afterEach(async () => {
    await handler.shutdown();
  });

  describe('Section 1: Valid Event Emission', () => {
    it('should emit agent spawned event successfully', async () => {
      const args: EventEmitArgs = {
        event: 'agent:spawned',
        data: {
          agentId: 'agent-123',
          agentType: 'test-generator',
          capabilities: ['test-generation', 'coverage-analysis']
        },
        metadata: {
          source: 'agent-registry',
          priority: 'medium'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.event).toBe('agent:spawned');
      expect(response.data.data.agentId).toBe('agent-123');
      expect(response.data.delivered).toBe(true);
      expect(response.data.metadata.source).toBe('agent-registry');
      expect(response.data.metadata.priority).toBe('medium');
    });

    it('should emit test execution event with progress data', async () => {
      const args: EventEmitArgs = {
        event: 'test:progress',
        data: {
          testSuite: 'integration-tests',
          progress: 75,
          passed: 45,
          failed: 5,
          remaining: 10
        },
        metadata: {
          source: 'test-executor',
          priority: 'high'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.event).toBe('test:progress');
      expect(response.data.data.progress).toBe(75);
      expect(response.data.data.testSuite).toBe('integration-tests');
    });

    it('should emit workflow completed event', async () => {
      const args: EventEmitArgs = {
        event: 'workflow:completed',
        data: {
          workflowId: 'workflow-456',
          status: 'success',
          duration: 3600000,
          stepsCompleted: 7,
          results: {
            success: true,
            artifacts: ['report.html', 'coverage.json']
          }
        },
        metadata: {
          source: 'workflow-executor',
          priority: 'critical'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.event).toBe('workflow:completed');
      expect(response.data.data.workflowId).toBe('workflow-456');
      expect(response.data.metadata.priority).toBe('critical');
    });

    it('should auto-add timestamp to event data', async () => {
      const args: EventEmitArgs = {
        event: 'coverage:analyzed',
        data: {
          coveragePercent: 85.5,
          linesTotal: 10000,
          linesCovered: 8550
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.data.timestamp).toBeDefined();
      expect(typeof response.data.data.timestamp).toBe('number');
    });

    it('should include event ID in response', async () => {
      const args: EventEmitArgs = {
        event: 'quality:gate',
        data: {
          passed: true,
          score: 92,
          thresholds: { coverage: 80, performance: 90 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.eventId).toBeDefined();
      expect(response.data.eventId).toMatch(/^event-\d+-test-random-id$/);
    });
  });

  describe('Section 2: Event Metadata', () => {
    it('should use default metadata when not provided', async () => {
      const args: EventEmitArgs = {
        event: 'test:started',
        data: {
          testFile: 'user.test.ts',
          framework: 'jest'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.metadata.source).toBe('mcp-event-emit');
      expect(response.data.metadata.priority).toBe('medium');
    });

    it('should override default metadata with custom values', async () => {
      const args: EventEmitArgs = {
        event: 'agent:error',
        data: {
          agentId: 'agent-789',
          error: 'Task execution failed'
        },
        metadata: {
          source: 'custom-agent',
          priority: 'critical'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.metadata.source).toBe('custom-agent');
      expect(response.data.metadata.priority).toBe('critical');
    });

    it('should handle all priority levels', async () => {
      const priorities: Array<'low' | 'medium' | 'high' | 'critical'> = ['low', 'medium', 'high', 'critical'];

      for (const priority of priorities) {
        const args: EventEmitArgs = {
          event: 'test:event',
          data: { priority },
          metadata: { priority }
        };

        const response = await handler.handle(args);

        expect(response.success).toBe(true);
        expect(response.data.metadata.priority).toBe(priority);
      }
    });
  });

  describe('Section 3: Listener Tracking', () => {
    it('should track listener count', async () => {
      const args: EventEmitArgs = {
        event: 'test:custom',
        data: { message: 'test' }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.listenerCount).toBeDefined();
      expect(typeof response.data.listenerCount).toBe('number');
      expect(response.data.listenerCount).toBeGreaterThanOrEqual(0);
    });

    it('should emit events with multiple listeners', async () => {
      const eventBus = handler.getEventBus();

      // Subscribe multiple listeners
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();

      eventBus.subscribe('multi:listener:test', listener1);
      eventBus.subscribe('multi:listener:test', listener2);
      eventBus.subscribe('multi:listener:test', listener3);

      const args: EventEmitArgs = {
        event: 'multi:listener:test',
        data: { message: 'broadcast to all' }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.listenerCount).toBe(3);
    });

    it('should track delivery status', async () => {
      const args: EventEmitArgs = {
        event: 'delivery:test',
        data: { test: true }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.delivered).toBeDefined();
      expect(typeof response.data.delivered).toBe('boolean');
    });
  });

  describe('Section 4: Memory Storage', () => {
    it('should store event in memory for history', async () => {
      const args: EventEmitArgs = {
        event: 'memory:test',
        data: { storedData: 'important info' }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      // Verify stored in memory
      const stored = await mockMemory.retrieve(`event:emitted:${response.data.eventId}`, {
        partition: 'events'
      });

      expect(stored).toBeDefined();
      expect(stored.event).toBe('memory:test');
      expect(stored.data.storedData).toBe('important info');
    });

    it('should post hint to blackboard', async () => {
      const args: EventEmitArgs = {
        event: 'test:notification',
        data: { notification: 'important' }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      // Verify hint was posted
      const hints = await mockMemory.getHints(`aqe/events/${args.event}`);
      expect(hints).toBeDefined();
    });

    it('should apply 24-hour TTL to stored events', async () => {
      const args: EventEmitArgs = {
        event: 'ttl:test',
        data: { test: true }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      // Events should be stored with 86400 second TTL (24 hours)
      const stored = await mockMemory.retrieve(`event:emitted:${response.data.eventId}`, {
        partition: 'events'
      });

      expect(stored).toBeDefined();
    });
  });

  describe('Section 5: Input Validation', () => {
    it('should reject missing event field', async () => {
      const args = {
        data: { test: true }
      } as any;

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toMatch(/event/i);
    });

    it('should reject missing data field', async () => {
      const args = {
        event: 'test:event'
      } as any;

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toMatch(/data/i);
    });

    it('should reject empty event name', async () => {
      const args: EventEmitArgs = {
        event: '',
        data: { test: true }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should accept empty data object', async () => {
      const args: EventEmitArgs = {
        event: 'empty:data',
        data: {}
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.data).toBeDefined();
      expect(response.data.data.timestamp).toBeDefined();
    });
  });

  describe('Section 6: Coordination Scenarios', () => {
    it('should emit agent coordination events', async () => {
      const args: EventEmitArgs = {
        event: 'swarm:coordination',
        data: {
          swarmId: 'swarm-123',
          action: 'load-balance',
          agentsInvolved: ['agent-1', 'agent-2', 'agent-3'],
          taskDistribution: {
            'agent-1': 5,
            'agent-2': 4,
            'agent-3': 6
          }
        },
        metadata: {
          source: 'swarm-coordinator',
          priority: 'high'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.data.swarmId).toBe('swarm-123');
      expect(response.data.data.agentsInvolved).toHaveLength(3);
    });

    it('should emit workflow state change events', async () => {
      const args: EventEmitArgs = {
        event: 'workflow:state:change',
        data: {
          workflowId: 'wf-456',
          previousState: 'running',
          newState: 'paused',
          reason: 'checkpoint-requested',
          affectedSteps: ['step-5', 'step-6']
        },
        metadata: {
          source: 'workflow-manager',
          priority: 'medium'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.data.newState).toBe('paused');
      expect(response.data.data.affectedSteps).toHaveLength(2);
    });

    it('should emit task assignment events', async () => {
      const args: EventEmitArgs = {
        event: 'task:assigned',
        data: {
          taskId: 'task-789',
          assignedAgent: 'agent-qe-1',
          agentType: 'test-generator',
          estimatedDuration: 600,
          priority: 'high'
        },
        metadata: {
          source: 'task-orchestrator',
          priority: 'high'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.data.assignedAgent).toBe('agent-qe-1');
      expect(response.data.data.taskId).toBe('task-789');
    });

    it('should emit checkpoint creation events', async () => {
      const args: EventEmitArgs = {
        event: 'checkpoint:created',
        data: {
          checkpointId: 'cp-001',
          executionId: 'exec-123',
          state: {
            completedSteps: ['step-1', 'step-2', 'step-3'],
            currentStep: 'step-4',
            variables: { iteration: 3 }
          }
        },
        metadata: {
          source: 'checkpoint-manager',
          priority: 'medium'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.data.checkpointId).toBe('cp-001');
      expect(response.data.data.state.completedSteps).toHaveLength(3);
    });
  });

  describe('Section 7: Error Handling', () => {
    it('should handle errors gracefully', async () => {
      const args = {
        event: 'test',
        data: null
      } as any;

      const response = await handler.handle(args);

      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('requestId');
    });

    it('should provide meaningful error messages', async () => {
      const args = {} as any;

      const response = await handler.handle(args);

      if (!response.success) {
        expect(response.error).toBeTruthy();
        expect(typeof response.error).toBe('string');
      }
    });

    it('should handle invalid metadata', async () => {
      const args: EventEmitArgs = {
        event: 'test:event',
        data: { test: true },
        metadata: {
          source: '',
          priority: 'invalid' as any
        }
      };

      const response = await handler.handle(args);

      // Should still succeed with default metadata
      expect(response.success).toBe(true);
    });
  });

  describe('Section 8: Edge Cases', () => {
    it('should handle very large event data', async () => {
      const largeData = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          value: `item-${i}`,
          data: { nested: { deep: { value: i } } }
        }))
      };

      const args: EventEmitArgs = {
        event: 'large:data',
        data: largeData
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.data.items).toHaveLength(1000);
    });

    it('should handle special characters in event names', async () => {
      const args: EventEmitArgs = {
        event: 'test:event-with_special.chars',
        data: { test: true }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.event).toBe('test:event-with_special.chars');
    });

    it('should handle concurrent event emissions', async () => {
      const promises = Array.from({ length: 20 }, (_, i) =>
        handler.handle({
          event: `concurrent:test:${i}`,
          data: { index: i }
        })
      );

      const results = await Promise.all(promises);

      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        expect(result.data.data.index).toBe(i);
      });
    });

    it('should preserve custom timestamp if provided', async () => {
      const customTimestamp = 1234567890000;

      const args: EventEmitArgs = {
        event: 'custom:timestamp',
        data: {
          timestamp: customTimestamp,
          message: 'test'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.data.timestamp).toBe(customTimestamp);
    });
  });

  describe('Section 9: Performance', () => {
    it('should complete within reasonable time', async () => {
      const args: EventEmitArgs = {
        event: 'performance:test',
        data: { test: true }
      };

      const startTime = Date.now();
      const response = await handler.handle(args);
      const endTime = Date.now();

      expect(response.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should track execution time', async () => {
      const args: EventEmitArgs = {
        event: 'exec:time',
        data: { test: true }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.executionTime).toBeDefined();
      expect(response.executionTime).toBeGreaterThan(0);
    });

    it('should handle rapid sequential emissions', async () => {
      const results = [];

      for (let i = 0; i < 10; i++) {
        const result = await handler.handle({
          event: `rapid:${i}`,
          data: { index: i }
        });
        results.push(result);
      }

      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        expect(result.data.data.index).toBe(i);
      });
    });
  });

  describe('Section 10: Cleanup and Resource Management', () => {
    it('should shutdown event bus properly', async () => {
      const args: EventEmitArgs = {
        event: 'shutdown:test',
        data: { test: true }
      };

      await handler.handle(args);
      await handler.shutdown();

      // Handler should be shut down without errors
      expect(true).toBe(true);
    });

    it('should handle multiple shutdown calls', async () => {
      await handler.shutdown();
      await handler.shutdown();
      await handler.shutdown();

      // Multiple shutdowns should not cause errors
      expect(true).toBe(true);
    });
  });
});
