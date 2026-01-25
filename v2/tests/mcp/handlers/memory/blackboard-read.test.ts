/**
 * Blackboard Read Handler Test Suite
 *
 * Tests for reading coordination hints from blackboard pattern.
 * Follows TDD RED phase - tests written before implementation verification.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BlackboardReadHandler } from '@mcp/handlers/memory/blackboard-read';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

// Mock services to prevent heavy initialization (database, EventBus, etc.)
jest.mock('../../../../src/mcp/services/AgentRegistry.js');
jest.mock('../../../../src/mcp/services/HookExecutor.js');

describe('BlackboardReadHandler', () => {
  let handler: BlackboardReadHandler;
  let mockRegistry: any;
  let mockHookExecutor: any;
  let blackboard: Map<string, any[]>;

  beforeEach(() => {
    mockRegistry = { getAgent: jest.fn(), listAgents: jest.fn().mockReturnValue([]) } as any;
    mockHookExecutor = { executePreTask: jest.fn().mockResolvedValue(undefined), executePostTask: jest.fn().mockResolvedValue(undefined), executePostEdit: jest.fn().mockResolvedValue(undefined), notify: jest.fn().mockResolvedValue(undefined) } as any;
    blackboard = new Map();
    handler = new BlackboardReadHandler(mockRegistry, mockHookExecutor, blackboard);
  });

  afterEach(async () => {
    blackboard.clear();
  });

  describe('Happy Path - Read Hints', () => {
    it('should read hints from topic successfully', async () => {
      // GIVEN: Topic with hints
      blackboard.set('test-results', [
        {
          id: 'hint-1',
          message: 'Test suite completed',
          priority: 'medium',
          agentId: 'qe-test-generator',
          timestamp: Date.now(),
          metadata: { coverage: 85 }
        },
        {
          id: 'hint-2',
          message: 'Coverage analysis done',
          priority: 'low',
          agentId: 'qe-coverage-analyzer',
          timestamp: Date.now(),
          metadata: { gaps: 5 }
        }
      ]);

      // WHEN: Reading from topic
      const response = await handler.handle({
        topic: 'test-results',
        agentId: 'qe-quality-gate'
      });

      // THEN: Hints returned successfully
      expect(response.success).toBe(true);
      expect(response.data.topic).toBe('test-results');
      expect(response.data.hints).toHaveLength(2);
      expect(response.data.count).toBe(2);
      expect(response.data.hints[0].id).toBe('hint-1');
      expect(response.data.hints[0].message).toBe('Test suite completed');
    });

    it('should return empty array for non-existent topic', async () => {
      // GIVEN: Topic does not exist
      // WHEN: Reading from non-existent topic
      const response = await handler.handle({
        topic: 'non-existent-topic',
        agentId: 'agent-1'
      });

      // THEN: Empty hints array returned
      expect(response.success).toBe(true);
      expect(response.data.hints).toHaveLength(0);
      expect(response.data.count).toBe(0);
    });

    it('should include hint metadata in response', async () => {
      // GIVEN: Hints with rich metadata
      blackboard.set('coordination', [
        {
          id: 'hint-1',
          message: 'Test message',
          priority: 'medium',
          agentId: 'agent-1',
          timestamp: Date.now(),
          metadata: {
            testSuite: 'UserService',
            framework: 'jest',
            tags: ['critical', 'regression']
          }
        }
      ]);

      // WHEN: Reading hints
      const response = await handler.handle({
        topic: 'coordination',
        agentId: 'agent-2'
      });

      // THEN: Metadata included in response
      expect(response.data.hints[0].metadata).toEqual({
        testSuite: 'UserService',
        framework: 'jest',
        tags: ['critical', 'regression']
      });
    });
  });

  describe('Priority Filtering', () => {
    beforeEach(() => {
      // Set up hints with different priorities
      blackboard.set('priority-test', [
        {
          id: 'low-1',
          message: 'Low priority',
          priority: 'low',
          agentId: 'agent-1',
          timestamp: Date.now(),
          metadata: {}
        },
        {
          id: 'medium-1',
          message: 'Medium priority',
          priority: 'medium',
          agentId: 'agent-1',
          timestamp: Date.now(),
          metadata: {}
        },
        {
          id: 'high-1',
          message: 'High priority',
          priority: 'high',
          agentId: 'agent-1',
          timestamp: Date.now(),
          metadata: {}
        },
        {
          id: 'critical-1',
          message: 'Critical priority',
          priority: 'critical',
          agentId: 'agent-1',
          timestamp: Date.now(),
          metadata: {}
        }
      ]);
    });

    it('should filter by minimum priority - low', async () => {
      // GIVEN: Hints with various priorities
      // WHEN: Reading with minPriority=low
      const response = await handler.handle({
        topic: 'priority-test',
        agentId: 'agent-1',
        minPriority: 'low'
      });

      // THEN: All hints returned (low and above)
      expect(response.data.hints).toHaveLength(4);
    });

    it('should filter by minimum priority - medium', async () => {
      // GIVEN: Hints with various priorities
      // WHEN: Reading with minPriority=medium
      const response = await handler.handle({
        topic: 'priority-test',
        agentId: 'agent-1',
        minPriority: 'medium'
      });

      // THEN: Only medium, high, critical returned
      expect(response.data.hints).toHaveLength(3);
      expect(response.data.hints.map((h: any) => h.priority)).toContain('medium');
      expect(response.data.hints.map((h: any) => h.priority)).toContain('high');
      expect(response.data.hints.map((h: any) => h.priority)).toContain('critical');
    });

    it('should filter by minimum priority - high', async () => {
      // GIVEN: Hints with various priorities
      // WHEN: Reading with minPriority=high
      const response = await handler.handle({
        topic: 'priority-test',
        agentId: 'agent-1',
        minPriority: 'high'
      });

      // THEN: Only high and critical returned
      expect(response.data.hints).toHaveLength(2);
      expect(response.data.hints.map((h: any) => h.priority)).toContain('high');
      expect(response.data.hints.map((h: any) => h.priority)).toContain('critical');
    });

    it('should filter by minimum priority - critical', async () => {
      // GIVEN: Hints with various priorities
      // WHEN: Reading with minPriority=critical
      const response = await handler.handle({
        topic: 'priority-test',
        agentId: 'agent-1',
        minPriority: 'critical'
      });

      // THEN: Only critical returned
      expect(response.data.hints).toHaveLength(1);
      expect(response.data.hints[0].priority).toBe('critical');
    });
  });

  describe('Time Filtering', () => {
    it('should filter by timestamp - since parameter', async () => {
      // GIVEN: Hints with different timestamps
      const now = Date.now();
      const oneHourAgo = now - 3600000;
      const twoHoursAgo = now - 7200000;

      blackboard.set('time-test', [
        {
          id: 'old-hint',
          message: 'Old hint',
          priority: 'low',
          agentId: 'agent-1',
          timestamp: twoHoursAgo,
          metadata: {}
        },
        {
          id: 'recent-hint',
          message: 'Recent hint',
          priority: 'low',
          agentId: 'agent-1',
          timestamp: oneHourAgo,
          metadata: {}
        },
        {
          id: 'new-hint',
          message: 'New hint',
          priority: 'low',
          agentId: 'agent-1',
          timestamp: now,
          metadata: {}
        }
      ]);

      // WHEN: Reading hints since one hour ago
      const response = await handler.handle({
        topic: 'time-test',
        agentId: 'agent-1',
        since: oneHourAgo
      });

      // THEN: Only hints from one hour ago or later returned
      expect(response.data.hints).toHaveLength(2);
      expect(response.data.hints.map((h: any) => h.id)).toContain('recent-hint');
      expect(response.data.hints.map((h: any) => h.id)).toContain('new-hint');
      expect(response.data.hints.map((h: any) => h.id)).not.toContain('old-hint');
    });

    it('should return all hints when since is in future', async () => {
      // GIVEN: Hints with current timestamps
      const now = Date.now();
      blackboard.set('future-test', [
        {
          id: 'hint-1',
          message: 'Hint 1',
          priority: 'low',
          agentId: 'agent-1',
          timestamp: now,
          metadata: {}
        }
      ]);

      // WHEN: Reading with future timestamp
      const futureTime = now + 3600000;
      const response = await handler.handle({
        topic: 'future-test',
        agentId: 'agent-1',
        since: futureTime
      });

      // THEN: No hints returned (all older than since)
      expect(response.data.hints).toHaveLength(0);
    });
  });

  describe('Sorting', () => {
    it('should sort by priority descending, then timestamp descending', async () => {
      // GIVEN: Hints with mixed priorities and timestamps
      const now = Date.now();
      blackboard.set('sort-test', [
        {
          id: 'low-old',
          message: 'Low priority old',
          priority: 'low',
          agentId: 'agent-1',
          timestamp: now - 3000,
          metadata: {}
        },
        {
          id: 'high-new',
          message: 'High priority new',
          priority: 'high',
          agentId: 'agent-1',
          timestamp: now,
          metadata: {}
        },
        {
          id: 'medium-mid',
          message: 'Medium priority mid',
          priority: 'medium',
          agentId: 'agent-1',
          timestamp: now - 1000,
          metadata: {}
        },
        {
          id: 'high-old',
          message: 'High priority old',
          priority: 'high',
          agentId: 'agent-1',
          timestamp: now - 2000,
          metadata: {}
        }
      ]);

      // WHEN: Reading hints
      const response = await handler.handle({
        topic: 'sort-test',
        agentId: 'agent-1'
      });

      // THEN: Sorted correctly (high priority first, then by recency)
      const hints = response.data.hints;
      expect(hints[0].id).toBe('high-new');  // high + newest
      expect(hints[1].id).toBe('high-old');  // high + older
      expect(hints[2].id).toBe('medium-mid'); // medium
      expect(hints[3].id).toBe('low-old');    // low
    });
  });

  describe('Limit Parameter', () => {
    it('should apply default limit of 50', async () => {
      // GIVEN: 60 hints in topic
      const hints = Array.from({ length: 60 }, (_, i) => ({
        id: `hint-${i}`,
        message: `Message ${i}`,
        priority: 'low',
        agentId: 'agent-1',
        timestamp: Date.now(),
        metadata: {}
      }));
      blackboard.set('limit-test', hints);

      // WHEN: Reading without limit parameter
      const response = await handler.handle({
        topic: 'limit-test',
        agentId: 'agent-1'
      });

      // THEN: Only 50 hints returned (default limit)
      expect(response.data.hints).toHaveLength(50);
    });

    it('should apply custom limit', async () => {
      // GIVEN: 50 hints in topic
      const hints = Array.from({ length: 50 }, (_, i) => ({
        id: `hint-${i}`,
        message: `Message ${i}`,
        priority: 'low',
        agentId: 'agent-1',
        timestamp: Date.now(),
        metadata: {}
      }));
      blackboard.set('custom-limit-test', hints);

      // WHEN: Reading with limit=10
      const response = await handler.handle({
        topic: 'custom-limit-test',
        agentId: 'agent-1',
        limit: 10
      });

      // THEN: Only 10 hints returned
      expect(response.data.hints).toHaveLength(10);
    });

    it('should return all hints if limit exceeds count', async () => {
      // GIVEN: 5 hints in topic
      const hints = Array.from({ length: 5 }, (_, i) => ({
        id: `hint-${i}`,
        message: `Message ${i}`,
        priority: 'low',
        agentId: 'agent-1',
        timestamp: Date.now(),
        metadata: {}
      }));
      blackboard.set('small-limit-test', hints);

      // WHEN: Reading with limit=100
      const response = await handler.handle({
        topic: 'small-limit-test',
        agentId: 'agent-1',
        limit: 100
      });

      // THEN: All 5 hints returned
      expect(response.data.hints).toHaveLength(5);
    });
  });

  describe('Input Validation', () => {
    it('should reject missing topic', async () => {
      // GIVEN: Missing topic parameter
      // WHEN: Reading hints
      const response = await handler.handle({
        agentId: 'agent-1'
      } as any);

      // THEN: Validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('topic');
    });

    it('should reject missing agentId', async () => {
      // GIVEN: Missing agentId parameter
      // WHEN: Reading hints
      const response = await handler.handle({
        topic: 'test'
      } as any);

      // THEN: Validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('agentId');
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in topic names', async () => {
      // GIVEN: Topic with special characters
      const specialTopic = 'test:topic/with-special.chars_123';
      blackboard.set(specialTopic, [
        {
          id: 'hint-1',
          message: 'Test',
          priority: 'low',
          agentId: 'agent-1',
          timestamp: Date.now(),
          metadata: {}
        }
      ]);

      // WHEN: Reading from special topic
      const response = await handler.handle({
        topic: specialTopic,
        agentId: 'agent-1'
      });

      // THEN: Hints returned successfully
      expect(response.success).toBe(true);
      expect(response.data.hints).toHaveLength(1);
    });

    it('should handle hints with missing optional metadata fields', async () => {
      // GIVEN: Hint without metadata
      blackboard.set('minimal-hint', [
        {
          id: 'hint-1',
          message: 'Minimal hint',
          priority: 'low',
          agentId: 'agent-1',
          timestamp: Date.now(),
          metadata: {}
        }
      ]);

      // WHEN: Reading hints
      const response = await handler.handle({
        topic: 'minimal-hint',
        agentId: 'agent-1'
      });

      // THEN: Hint returned with empty metadata
      expect(response.success).toBe(true);
      expect(response.data.hints[0].metadata).toEqual({});
    });

    it('should handle combined filters - priority, time, limit', async () => {
      // GIVEN: Many hints with various properties
      const now = Date.now();
      const hints = [
        { id: '1', message: 'M1', priority: 'low', agentId: 'a1', timestamp: now - 5000, metadata: {} },
        { id: '2', message: 'M2', priority: 'medium', agentId: 'a1', timestamp: now - 4000, metadata: {} },
        { id: '3', message: 'M3', priority: 'high', agentId: 'a1', timestamp: now - 3000, metadata: {} },
        { id: '4', message: 'M4', priority: 'critical', agentId: 'a1', timestamp: now - 2000, metadata: {} },
        { id: '5', message: 'M5', priority: 'high', agentId: 'a1', timestamp: now - 1000, metadata: {} },
        { id: '6', message: 'M6', priority: 'medium', agentId: 'a1', timestamp: now, metadata: {} }
      ];
      blackboard.set('combined-filter', hints);

      // WHEN: Reading with minPriority=medium, since=(now-3500), limit=2
      const response = await handler.handle({
        topic: 'combined-filter',
        agentId: 'agent-1',
        minPriority: 'medium',
        since: now - 3500,
        limit: 2
      });

      // THEN: Filtered and limited correctly
      // Should include: critical, high (recent), medium (recent)
      // After sorting: critical, high (recent)
      // After limit: top 2
      expect(response.data.hints.length).toBeLessThanOrEqual(2);
      expect(response.data.hints.every((h: any) =>
        ['medium', 'high', 'critical'].includes(h.priority)
      )).toBe(true);
    });

    it('should handle reading from topic with only expired hints', async () => {
      // GIVEN: Topic exists but all hints expired (filtered by time)
      const veryOldTimestamp = Date.now() - 86400000; // 24 hours ago
      blackboard.set('expired-hints', [
        {
          id: 'hint-1',
          message: 'Old hint',
          priority: 'low',
          agentId: 'agent-1',
          timestamp: veryOldTimestamp,
          metadata: {}
        }
      ]);

      // WHEN: Reading recent hints only
      const response = await handler.handle({
        topic: 'expired-hints',
        agentId: 'agent-1',
        since: Date.now() - 3600000 // Last hour only
      });

      // THEN: No hints returned
      expect(response.success).toBe(true);
      expect(response.data.hints).toHaveLength(0);
    });
  });

  describe('Performance', () => {
    it('should read hints within reasonable time', async () => {
      // GIVEN: Topic with 10 hints
      const hints = Array.from({ length: 10 }, (_, i) => ({
        id: `hint-${i}`,
        message: `Message ${i}`,
        priority: 'low',
        agentId: 'agent-1',
        timestamp: Date.now(),
        metadata: {}
      }));
      blackboard.set('perf-test', hints);

      // WHEN: Reading hints
      const startTime = Date.now();
      await handler.handle({
        topic: 'perf-test',
        agentId: 'agent-1'
      });
      const endTime = Date.now();

      // THEN: Completed within 100ms
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle large result sets efficiently', async () => {
      // GIVEN: Topic with 1000 hints
      const hints = Array.from({ length: 1000 }, (_, i) => ({
        id: `hint-${i}`,
        message: `Message ${i}`,
        priority: 'low',
        agentId: 'agent-1',
        timestamp: Date.now(),
        metadata: {}
      }));
      blackboard.set('large-perf-test', hints);

      // WHEN: Reading with default limit
      const startTime = Date.now();
      await handler.handle({
        topic: 'large-perf-test',
        agentId: 'agent-1'
      });
      const endTime = Date.now();

      // THEN: Completed within 200ms
      expect(endTime - startTime).toBeLessThan(200);
    });
  });
});
