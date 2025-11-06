/**
 * memory/blackboard-read Test Suite
 *
 * Tests for reading coordination hints from blackboard.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BlackboardReadHandler } from '@mcp/handlers/memory/blackboard-read';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

describe('BlackboardReadHandler', () => {
  let handler: BlackboardReadHandler;
  let mockRegistry: AgentRegistry;
  let mockHookExecutor: HookExecutor;
  let mockBlackboard: Map<string, any[]>;

  beforeEach(() => {
    mockRegistry = {} as AgentRegistry;
    mockHookExecutor = {} as HookExecutor;
    mockBlackboard = new Map();
    handler = new BlackboardReadHandler(mockRegistry, mockHookExecutor, mockBlackboard);
  });

  describe('Happy Path', () => {
    it('should read hints from blackboard successfully', async () => {
      const testHints = [
        {
          id: 'hint-1',
          message: 'Test coverage below threshold',
          priority: 'high',
          agentId: 'test-gen-1',
          timestamp: Date.now(),
          metadata: { module: 'auth' }
        },
        {
          id: 'hint-2',
          message: 'Performance degradation detected',
          priority: 'critical',
          agentId: 'perf-monitor-1',
          timestamp: Date.now() - 1000,
          metadata: { endpoint: '/api/login' }
        }
      ];

      mockBlackboard.set('testing', testHints);

      const response = await handler.handle({
        topic: 'testing',
        agentId: 'qe-coordinator-1'
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.topic).toBe('testing');
      expect(response.data.hints).toHaveLength(2);
      expect(response.data.count).toBe(2);
    });

    it('should return hints with complete data structure', async () => {
      const testHints = [
        {
          id: 'hint-1',
          message: 'Security vulnerability detected',
          priority: 'critical',
          agentId: 'security-scanner-1',
          timestamp: Date.now(),
          metadata: { cve: 'CVE-2024-1234', severity: 'high' }
        }
      ];

      mockBlackboard.set('security', testHints);

      const response = await handler.handle({
        topic: 'security',
        agentId: 'security-coordinator-1'
      });

      expect(response.success).toBe(true);
      expect(response.data.hints[0]).toHaveProperty('id');
      expect(response.data.hints[0]).toHaveProperty('message');
      expect(response.data.hints[0]).toHaveProperty('priority');
      expect(response.data.hints[0]).toHaveProperty('agentId');
      expect(response.data.hints[0]).toHaveProperty('timestamp');
      expect(response.data.hints[0]).toHaveProperty('metadata');
      expect(response.data.hints[0].metadata.cve).toBe('CVE-2024-1234');
    });

    it('should return empty hints array for non-existent topic', async () => {
      const response = await handler.handle({
        topic: 'non-existent-topic',
        agentId: 'test-agent-1'
      });

      expect(response.success).toBe(true);
      expect(response.data.hints).toHaveLength(0);
      expect(response.data.count).toBe(0);
    });

    it('should handle multiple topics independently', async () => {
      const testingHints = [
        {
          id: 'test-1',
          message: 'Test hint',
          priority: 'medium',
          agentId: 'agent-1',
          timestamp: Date.now(),
          metadata: {}
        }
      ];

      const performanceHints = [
        {
          id: 'perf-1',
          message: 'Performance hint',
          priority: 'high',
          agentId: 'agent-2',
          timestamp: Date.now(),
          metadata: {}
        },
        {
          id: 'perf-2',
          message: 'Another performance hint',
          priority: 'medium',
          agentId: 'agent-3',
          timestamp: Date.now(),
          metadata: {}
        }
      ];

      mockBlackboard.set('testing', testingHints);
      mockBlackboard.set('performance', performanceHints);

      const testingResponse = await handler.handle({
        topic: 'testing',
        agentId: 'reader-1'
      });

      const performanceResponse = await handler.handle({
        topic: 'performance',
        agentId: 'reader-2'
      });

      expect(testingResponse.data.count).toBe(1);
      expect(performanceResponse.data.count).toBe(2);
    });
  });

  describe('Priority Filtering', () => {
    beforeEach(() => {
      const mixedPriorityHints = [
        {
          id: 'hint-1',
          message: 'Low priority hint',
          priority: 'low',
          agentId: 'agent-1',
          timestamp: Date.now(),
          metadata: {}
        },
        {
          id: 'hint-2',
          message: 'Medium priority hint',
          priority: 'medium',
          agentId: 'agent-2',
          timestamp: Date.now(),
          metadata: {}
        },
        {
          id: 'hint-3',
          message: 'High priority hint',
          priority: 'high',
          agentId: 'agent-3',
          timestamp: Date.now(),
          metadata: {}
        },
        {
          id: 'hint-4',
          message: 'Critical priority hint',
          priority: 'critical',
          agentId: 'agent-4',
          timestamp: Date.now(),
          metadata: {}
        }
      ];

      mockBlackboard.set('testing', mixedPriorityHints);
    });

    it('should filter hints by minimum priority - low', async () => {
      const response = await handler.handle({
        topic: 'testing',
        agentId: 'reader-1',
        minPriority: 'low'
      });

      expect(response.success).toBe(true);
      expect(response.data.count).toBe(4);
    });

    it('should filter hints by minimum priority - medium', async () => {
      const response = await handler.handle({
        topic: 'testing',
        agentId: 'reader-1',
        minPriority: 'medium'
      });

      expect(response.success).toBe(true);
      expect(response.data.count).toBe(3);
      expect(response.data.hints.every((h: any) =>
        ['medium', 'high', 'critical'].includes(h.priority)
      )).toBe(true);
    });

    it('should filter hints by minimum priority - high', async () => {
      const response = await handler.handle({
        topic: 'testing',
        agentId: 'reader-1',
        minPriority: 'high'
      });

      expect(response.success).toBe(true);
      expect(response.data.count).toBe(2);
      expect(response.data.hints.every((h: any) =>
        ['high', 'critical'].includes(h.priority)
      )).toBe(true);
    });

    it('should filter hints by minimum priority - critical', async () => {
      const response = await handler.handle({
        topic: 'testing',
        agentId: 'reader-1',
        minPriority: 'critical'
      });

      expect(response.success).toBe(true);
      expect(response.data.count).toBe(1);
      expect(response.data.hints[0].priority).toBe('critical');
    });

    it('should sort hints by priority (highest first)', async () => {
      const response = await handler.handle({
        topic: 'testing',
        agentId: 'reader-1'
      });

      expect(response.success).toBe(true);
      const priorities = response.data.hints.map((h: any) => h.priority);
      expect(priorities).toEqual(['critical', 'high', 'medium', 'low']);
    });
  });

  describe('Time-based Filtering', () => {
    it('should filter hints by timestamp - since parameter', async () => {
      const now = Date.now();
      const hints = [
        {
          id: 'hint-1',
          message: 'Old hint',
          priority: 'medium',
          agentId: 'agent-1',
          timestamp: now - 3600000, // 1 hour ago
          metadata: {}
        },
        {
          id: 'hint-2',
          message: 'Recent hint',
          priority: 'high',
          agentId: 'agent-2',
          timestamp: now - 600000, // 10 minutes ago
          metadata: {}
        },
        {
          id: 'hint-3',
          message: 'Very recent hint',
          priority: 'critical',
          agentId: 'agent-3',
          timestamp: now - 60000, // 1 minute ago
          metadata: {}
        }
      ];

      mockBlackboard.set('testing', hints);

      const response = await handler.handle({
        topic: 'testing',
        agentId: 'reader-1',
        since: now - 1200000 // 20 minutes ago
      });

      expect(response.success).toBe(true);
      expect(response.data.count).toBe(2);
      expect(response.data.hints.every((h: any) => h.timestamp >= now - 1200000)).toBe(true);
    });

    it('should combine priority and time filtering', async () => {
      const now = Date.now();
      const hints = [
        {
          id: 'hint-1',
          message: 'Old low priority',
          priority: 'low',
          agentId: 'agent-1',
          timestamp: now - 3600000,
          metadata: {}
        },
        {
          id: 'hint-2',
          message: 'Recent high priority',
          priority: 'high',
          agentId: 'agent-2',
          timestamp: now - 600000,
          metadata: {}
        },
        {
          id: 'hint-3',
          message: 'Recent low priority',
          priority: 'low',
          agentId: 'agent-3',
          timestamp: now - 300000,
          metadata: {}
        }
      ];

      mockBlackboard.set('testing', hints);

      const response = await handler.handle({
        topic: 'testing',
        agentId: 'reader-1',
        minPriority: 'high',
        since: now - 1200000
      });

      expect(response.success).toBe(true);
      expect(response.data.count).toBe(1);
      expect(response.data.hints[0].id).toBe('hint-2');
    });

    it('should sort by priority first, then by timestamp', async () => {
      const now = Date.now();
      const hints = [
        {
          id: 'hint-1',
          message: 'Older high priority',
          priority: 'high',
          agentId: 'agent-1',
          timestamp: now - 600000,
          metadata: {}
        },
        {
          id: 'hint-2',
          message: 'Newer high priority',
          priority: 'high',
          agentId: 'agent-2',
          timestamp: now - 300000,
          metadata: {}
        },
        {
          id: 'hint-3',
          message: 'Medium priority',
          priority: 'medium',
          agentId: 'agent-3',
          timestamp: now - 100000,
          metadata: {}
        }
      ];

      mockBlackboard.set('testing', hints);

      const response = await handler.handle({
        topic: 'testing',
        agentId: 'reader-1'
      });

      expect(response.success).toBe(true);
      expect(response.data.hints[0].id).toBe('hint-2'); // Newest high priority first
      expect(response.data.hints[1].id).toBe('hint-1'); // Older high priority second
      expect(response.data.hints[2].id).toBe('hint-3'); // Medium priority last
    });
  });

  describe('Pagination', () => {
    beforeEach(() => {
      const manyHints = Array.from({ length: 100 }, (_, i) => ({
        id: `hint-${i}`,
        message: `Hint ${i}`,
        priority: ['low', 'medium', 'high', 'critical'][i % 4],
        agentId: `agent-${i}`,
        timestamp: Date.now() - (i * 1000),
        metadata: { index: i }
      }));

      mockBlackboard.set('testing', manyHints);
    });

    it('should apply default limit of 50 hints', async () => {
      const response = await handler.handle({
        topic: 'testing',
        agentId: 'reader-1'
      });

      expect(response.success).toBe(true);
      expect(response.data.count).toBe(50);
    });

    it('should respect custom limit parameter', async () => {
      const response = await handler.handle({
        topic: 'testing',
        agentId: 'reader-1',
        limit: 10
      });

      expect(response.success).toBe(true);
      expect(response.data.count).toBe(10);
    });

    it('should return all hints if limit exceeds available', async () => {
      mockBlackboard.set('small-topic', [
        {
          id: 'hint-1',
          message: 'Only hint',
          priority: 'medium',
          agentId: 'agent-1',
          timestamp: Date.now(),
          metadata: {}
        }
      ]);

      const response = await handler.handle({
        topic: 'small-topic',
        agentId: 'reader-1',
        limit: 100
      });

      expect(response.success).toBe(true);
      expect(response.data.count).toBe(1);
    });

    it('should limit results after filtering', async () => {
      const response = await handler.handle({
        topic: 'testing',
        agentId: 'reader-1',
        minPriority: 'high',
        limit: 5
      });

      expect(response.success).toBe(true);
      expect(response.data.count).toBeLessThanOrEqual(5);
      expect(response.data.hints.every((h: any) =>
        ['high', 'critical'].includes(h.priority)
      )).toBe(true);
    });
  });

  describe('Input Validation', () => {
    it('should reject missing topic', async () => {
      const response = await handler.handle({
        agentId: 'test-agent-1'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('topic');
    });

    it('should reject missing agentId', async () => {
      const response = await handler.handle({
        topic: 'testing'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('agentId');
    });

    it('should reject completely empty input', async () => {
      const response = await handler.handle({} as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should handle invalid priority gracefully', async () => {
      mockBlackboard.set('testing', [
        {
          id: 'hint-1',
          message: 'Test',
          priority: 'medium',
          agentId: 'agent-1',
          timestamp: Date.now(),
          metadata: {}
        }
      ]);

      const response = await handler.handle({
        topic: 'testing',
        agentId: 'agent-1',
        minPriority: 'invalid' as any
      });

      // Should either filter correctly or handle gracefully
      expect(response).toHaveProperty('success');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty blackboard', async () => {
      const response = await handler.handle({
        topic: 'empty-topic',
        agentId: 'agent-1'
      });

      expect(response.success).toBe(true);
      expect(response.data.hints).toEqual([]);
      expect(response.data.count).toBe(0);
    });

    it('should handle hints with missing metadata', async () => {
      mockBlackboard.set('testing', [
        {
          id: 'hint-1',
          message: 'No metadata',
          priority: 'medium',
          agentId: 'agent-1',
          timestamp: Date.now()
        } as any
      ]);

      const response = await handler.handle({
        topic: 'testing',
        agentId: 'reader-1'
      });

      expect(response.success).toBe(true);
      expect(response.data.hints[0]).toHaveProperty('metadata');
    });

    it('should handle very large limit values', async () => {
      mockBlackboard.set('testing', [
        {
          id: 'hint-1',
          message: 'Test',
          priority: 'medium',
          agentId: 'agent-1',
          timestamp: Date.now(),
          metadata: {}
        }
      ]);

      const response = await handler.handle({
        topic: 'testing',
        agentId: 'agent-1',
        limit: Number.MAX_SAFE_INTEGER
      });

      expect(response.success).toBe(true);
      expect(response.data.count).toBe(1);
    });

    it('should handle concurrent reads from same topic', async () => {
      const testHints = Array.from({ length: 20 }, (_, i) => ({
        id: `hint-${i}`,
        message: `Test ${i}`,
        priority: 'medium',
        agentId: `agent-${i}`,
        timestamp: Date.now(),
        metadata: {}
      }));

      mockBlackboard.set('concurrent-topic', testHints);

      const promises = Array.from({ length: 10 }, (_, i) =>
        handler.handle({
          topic: 'concurrent-topic',
          agentId: `reader-${i}`,
          limit: 5
        })
      );

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.data.count).toBeLessThanOrEqual(5);
      });
    });

    it('should handle special characters in topic names', async () => {
      const specialTopic = 'testing/sub-topic:with-special-chars';
      mockBlackboard.set(specialTopic, [
        {
          id: 'hint-1',
          message: 'Special topic',
          priority: 'medium',
          agentId: 'agent-1',
          timestamp: Date.now(),
          metadata: {}
        }
      ]);

      const response = await handler.handle({
        topic: specialTopic,
        agentId: 'agent-1'
      });

      expect(response.success).toBe(true);
      expect(response.data.count).toBe(1);
    });

    it('should handle future timestamps gracefully', async () => {
      const futureTime = Date.now() + 3600000;
      mockBlackboard.set('testing', [
        {
          id: 'hint-1',
          message: 'Future hint',
          priority: 'medium',
          agentId: 'agent-1',
          timestamp: futureTime,
          metadata: {}
        }
      ]);

      const response = await handler.handle({
        topic: 'testing',
        agentId: 'agent-1',
        since: Date.now()
      });

      expect(response.success).toBe(true);
      expect(response.data.count).toBe(1);
    });
  });

  describe('Performance', () => {
    it('should complete read operation within reasonable time', async () => {
      const hints = Array.from({ length: 1000 }, (_, i) => ({
        id: `hint-${i}`,
        message: `Performance test ${i}`,
        priority: ['low', 'medium', 'high', 'critical'][i % 4],
        agentId: `agent-${i}`,
        timestamp: Date.now() - (i * 1000),
        metadata: { index: i }
      }));

      mockBlackboard.set('performance', hints);

      const startTime = Date.now();
      const response = await handler.handle({
        topic: 'performance',
        agentId: 'perf-reader',
        minPriority: 'high',
        limit: 50
      });
      const endTime = Date.now();

      expect(response.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle rapid sequential reads efficiently', async () => {
      mockBlackboard.set('rapid-reads', [
        {
          id: 'hint-1',
          message: 'Rapid read test',
          priority: 'medium',
          agentId: 'agent-1',
          timestamp: Date.now(),
          metadata: {}
        }
      ]);

      const startTime = Date.now();
      for (let i = 0; i < 100; i++) {
        await handler.handle({
          topic: 'rapid-reads',
          agentId: `reader-${i}`
        });
      }
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000);
    });
  });

  describe('Response Structure', () => {
    it('should always include requestId', async () => {
      mockBlackboard.set('testing', []);

      const response = await handler.handle({
        topic: 'testing',
        agentId: 'agent-1'
      });

      expect(response).toHaveProperty('metadata');
      expect(response.metadata).toHaveProperty('requestId');
      expect(typeof response.metadata.requestId).toBe('string');
    });

    it('should include proper metadata in response', async () => {
      mockBlackboard.set('testing', [
        {
          id: 'hint-1',
          message: 'Test with rich metadata',
          priority: 'high',
          agentId: 'agent-1',
          timestamp: Date.now(),
          metadata: {
            module: 'auth',
            testType: 'unit',
            framework: 'jest',
            coverage: 75.5
          }
        }
      ]);

      const response = await handler.handle({
        topic: 'testing',
        agentId: 'reader-1'
      });

      expect(response.success).toBe(true);
      expect(response.data.hints[0].metadata).toHaveProperty('module');
      expect(response.data.hints[0].metadata).toHaveProperty('testType');
      expect(response.data.hints[0].metadata).toHaveProperty('framework');
      expect(response.data.hints[0].metadata.coverage).toBe(75.5);
    });
  });
});
