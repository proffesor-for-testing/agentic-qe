/**
 * Blackboard Post Handler Test Suite
 *
 * Tests for posting coordination hints to blackboard pattern.
 * Follows TDD RED phase - tests written before implementation verification.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BlackboardPostHandler } from '@mcp/handlers/memory/blackboard-post';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

describe('BlackboardPostHandler', () => {
  let handler: BlackboardPostHandler;
  let registry: AgentRegistry;
  let hookExecutor: HookExecutor;
  let blackboard: Map<string, any[]>;

  beforeEach(() => {
    registry = new AgentRegistry();
    hookExecutor = new HookExecutor();
    blackboard = new Map();
    handler = new BlackboardPostHandler(registry, hookExecutor, blackboard);
  });

  afterEach(async () => {
    blackboard.clear();
  });

  describe('Happy Path - Post Hints', () => {
    it('should post hint to blackboard successfully', async () => {
      // GIVEN: Agent wants to post coordination hint
      // WHEN: Posting hint to topic
      const response = await handler.handle({
        topic: 'test-coordination',
        message: 'Test suite UserService completed with 85% coverage',
        priority: 'medium',
        agentId: 'qe-test-generator'
      });

      // THEN: Hint posted successfully
      expect(response.success).toBe(true);
      expect(response.data.posted).toBe(true);
      expect(response.data.hintId).toBeDefined();
      expect(response.data.topic).toBe('test-coordination');
      expect(response.data.priority).toBe('medium');
      expect(response.data.timestamp).toBeDefined();
    });

    it('should create new topic when posting to non-existent topic', async () => {
      // GIVEN: Topic does not exist
      expect(blackboard.has('new-topic')).toBe(false);

      // WHEN: Posting to new topic
      const response = await handler.handle({
        topic: 'new-topic',
        message: 'First message on this topic',
        priority: 'low',
        agentId: 'qe-quality-gate'
      });

      // THEN: Topic created and hint posted
      expect(response.success).toBe(true);
      expect(blackboard.has('new-topic')).toBe(true);
      expect(blackboard.get('new-topic')).toHaveLength(1);
    });

    it('should append hint to existing topic', async () => {
      // GIVEN: Topic with existing hints
      blackboard.set('test-results', [
        {
          id: 'hint-1',
          topic: 'test-results',
          message: 'First hint',
          priority: 'low',
          agentId: 'agent-1',
          metadata: {},
          timestamp: Date.now(),
          ttl: 0
        }
      ]);

      // WHEN: Posting new hint to existing topic
      const response = await handler.handle({
        topic: 'test-results',
        message: 'Second hint',
        priority: 'high',
        agentId: 'qe-test-generator'
      });

      // THEN: Hint appended to topic
      expect(response.success).toBe(true);
      expect(blackboard.get('test-results')).toHaveLength(2);
    });

    it('should include metadata in hint', async () => {
      // GIVEN: Hint with custom metadata
      const metadata = {
        testSuite: 'UserService',
        coverage: 85,
        framework: 'jest',
        tags: ['integration', 'critical']
      };

      // WHEN: Posting hint with metadata
      const response = await handler.handle({
        topic: 'test-coordination',
        message: 'Test suite completed',
        priority: 'medium',
        agentId: 'qe-test-generator',
        metadata
      });

      // THEN: Hint includes metadata
      expect(response.success).toBe(true);
      const hints = blackboard.get('test-coordination');
      expect(hints[0].metadata).toEqual(metadata);
    });

    it('should support all priority levels', async () => {
      // GIVEN: Different priority levels
      const priorities: Array<'low' | 'medium' | 'high' | 'critical'> = ['low', 'medium', 'high', 'critical'];

      // WHEN: Posting hints with different priorities
      for (const priority of priorities) {
        const response = await handler.handle({
          topic: 'priority-test',
          message: `Message with ${priority} priority`,
          priority,
          agentId: 'qe-quality-gate'
        });

        // THEN: Each priority accepted
        expect(response.success).toBe(true);
        expect(response.data.priority).toBe(priority);
      }

      expect(blackboard.get('priority-test')).toHaveLength(4);
    });

    it('should generate unique hint IDs', async () => {
      // GIVEN: Multiple hints to post
      const hintIds = new Set<string>();

      // WHEN: Posting multiple hints
      for (let i = 0; i < 10; i++) {
        const response = await handler.handle({
          topic: 'id-test',
          message: `Message ${i}`,
          priority: 'low',
          agentId: 'agent-1'
        });

        hintIds.add(response.data.hintId);
      }

      // THEN: All IDs are unique
      expect(hintIds.size).toBe(10);
    });
  });

  describe('TTL Functionality', () => {
    it('should set TTL on hint when specified', async () => {
      // GIVEN: Hint with TTL
      // WHEN: Posting hint with 60 second TTL
      const response = await handler.handle({
        topic: 'ttl-test',
        message: 'Temporary message',
        priority: 'low',
        agentId: 'agent-1',
        ttl: 60
      });

      // THEN: Hint has TTL
      expect(response.success).toBe(true);
      const hints = blackboard.get('ttl-test');
      expect(hints[0].ttl).toBe(60);
    });

    it('should expire hint after TTL', async () => {
      // GIVEN: Hint with short TTL
      jest.useFakeTimers();

      // WHEN: Posting hint with 2 second TTL
      await handler.handle({
        topic: 'expiry-test',
        message: 'Will expire soon',
        priority: 'low',
        agentId: 'agent-1',
        ttl: 2
      });

      expect(blackboard.get('expiry-test')).toHaveLength(1);

      // Fast forward 3 seconds
      jest.advanceTimersByTime(3000);

      // THEN: Hint expired and removed
      const hints = blackboard.get('expiry-test');
      expect(hints).toHaveLength(0);

      jest.useRealTimers();
    });

    it('should not expire hint with ttl=0', async () => {
      // GIVEN: Hint with no TTL
      jest.useFakeTimers();

      // WHEN: Posting hint without TTL
      await handler.handle({
        topic: 'permanent',
        message: 'Permanent message',
        priority: 'low',
        agentId: 'agent-1',
        ttl: 0
      });

      // Fast forward 10 seconds
      jest.advanceTimersByTime(10000);

      // THEN: Hint still exists
      expect(blackboard.get('permanent')).toHaveLength(1);

      jest.useRealTimers();
    });

    it('should handle multiple hints with different TTLs', async () => {
      // GIVEN: Multiple hints with different TTLs
      jest.useFakeTimers();

      // WHEN: Posting hints with TTL 1, 2, 3 seconds
      await handler.handle({
        topic: 'multi-ttl',
        message: 'Expires in 1s',
        priority: 'low',
        agentId: 'agent-1',
        ttl: 1
      });
      await handler.handle({
        topic: 'multi-ttl',
        message: 'Expires in 2s',
        priority: 'low',
        agentId: 'agent-1',
        ttl: 2
      });
      await handler.handle({
        topic: 'multi-ttl',
        message: 'Expires in 3s',
        priority: 'low',
        agentId: 'agent-1',
        ttl: 3
      });

      expect(blackboard.get('multi-ttl')).toHaveLength(3);

      // Fast forward 1.5 seconds
      jest.advanceTimersByTime(1500);
      // THEN: First hint expired
      expect(blackboard.get('multi-ttl')).toHaveLength(2);

      // Fast forward another 1 second (2.5s total)
      jest.advanceTimersByTime(1000);
      // THEN: Second hint expired
      expect(blackboard.get('multi-ttl')).toHaveLength(1);

      jest.useRealTimers();
    });
  });

  describe('Input Validation', () => {
    it('should reject missing topic', async () => {
      // GIVEN: Missing topic parameter
      // WHEN: Posting hint
      const response = await handler.handle({
        message: 'Test message',
        priority: 'low',
        agentId: 'agent-1'
      } as any);

      // THEN: Validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('topic');
    });

    it('should reject missing message', async () => {
      // GIVEN: Missing message parameter
      // WHEN: Posting hint
      const response = await handler.handle({
        topic: 'test',
        priority: 'low',
        agentId: 'agent-1'
      } as any);

      // THEN: Validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('message');
    });

    it('should reject missing priority', async () => {
      // GIVEN: Missing priority parameter
      // WHEN: Posting hint
      const response = await handler.handle({
        topic: 'test',
        message: 'Test message',
        agentId: 'agent-1'
      } as any);

      // THEN: Validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('priority');
    });

    it('should reject missing agentId', async () => {
      // GIVEN: Missing agentId parameter
      // WHEN: Posting hint
      const response = await handler.handle({
        topic: 'test',
        message: 'Test message',
        priority: 'low'
      } as any);

      // THEN: Validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('agentId');
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in topic names', async () => {
      // GIVEN: Topics with special characters
      const specialTopics = [
        'topic-with-dashes',
        'topic_with_underscores',
        'topic.with.dots',
        'topic/with/slashes',
        'topic:with:colons'
      ];

      // WHEN: Posting to each topic
      for (const topic of specialTopics) {
        const response = await handler.handle({
          topic,
          message: 'Test message',
          priority: 'low',
          agentId: 'agent-1'
        });

        // THEN: All successful
        expect(response.success).toBe(true);
        expect(blackboard.has(topic)).toBe(true);
      }
    });

    it('should handle very long messages', async () => {
      // GIVEN: Very long message
      const longMessage = 'x'.repeat(10000);

      // WHEN: Posting long message
      const response = await handler.handle({
        topic: 'long-message',
        message: longMessage,
        priority: 'low',
        agentId: 'agent-1'
      });

      // THEN: Message accepted
      expect(response.success).toBe(true);
      const hints = blackboard.get('long-message');
      expect(hints[0].message).toHaveLength(10000);
    });

    it('should handle empty metadata object', async () => {
      // GIVEN: Empty metadata
      // WHEN: Posting hint
      const response = await handler.handle({
        topic: 'test',
        message: 'Test',
        priority: 'low',
        agentId: 'agent-1',
        metadata: {}
      });

      // THEN: Hint posted successfully
      expect(response.success).toBe(true);
      const hints = blackboard.get('test');
      expect(hints[0].metadata).toEqual({});
    });

    it('should handle metadata with null and undefined values', async () => {
      // GIVEN: Metadata with null/undefined
      // WHEN: Posting hint
      const response = await handler.handle({
        topic: 'test',
        message: 'Test',
        priority: 'low',
        agentId: 'agent-1',
        metadata: {
          nullField: null,
          undefinedField: undefined,
          validField: 'value'
        }
      });

      // THEN: Hint posted successfully
      expect(response.success).toBe(true);
    });

    it('should handle rapid successive posts to same topic', async () => {
      // GIVEN: Multiple concurrent posts
      const promises = Array.from({ length: 20 }, (_, i) =>
        handler.handle({
          topic: 'concurrent-test',
          message: `Message ${i}`,
          priority: 'low',
          agentId: `agent-${i % 3}`
        })
      );

      // WHEN: Posting concurrently
      const results = await Promise.all(promises);

      // THEN: All successful and all hints preserved
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
      expect(blackboard.get('concurrent-test')).toHaveLength(20);
    });

    it('should handle Unicode characters in messages', async () => {
      // GIVEN: Message with Unicode
      const unicodeMessage = 'Test 测试 🚀 тест';

      // WHEN: Posting Unicode message
      const response = await handler.handle({
        topic: 'unicode',
        message: unicodeMessage,
        priority: 'low',
        agentId: 'agent-1'
      });

      // THEN: Unicode preserved
      expect(response.success).toBe(true);
      const hints = blackboard.get('unicode');
      expect(hints[0].message).toBe(unicodeMessage);
    });
  });

  describe('Hook Integration', () => {
    it('should execute notification hook with info level for low priority', async () => {
      // GIVEN: Mock hook executor
      const notifySpy = jest.spyOn(hookExecutor, 'notify');

      // WHEN: Posting low priority hint
      await handler.handle({
        topic: 'test',
        message: 'Low priority message',
        priority: 'low',
        agentId: 'agent-1'
      });

      // THEN: Hook called with info level
      expect(notifySpy).toHaveBeenCalledWith({
        message: expect.stringContaining('Blackboard hint posted'),
        level: 'info'
      });
    });

    it('should execute notification hook with warn level for high priority', async () => {
      // GIVEN: Mock hook executor
      const notifySpy = jest.spyOn(hookExecutor, 'notify');

      // WHEN: Posting high priority hint
      await handler.handle({
        topic: 'test',
        message: 'High priority message',
        priority: 'high',
        agentId: 'agent-1'
      });

      // THEN: Hook called with warn level
      expect(notifySpy).toHaveBeenCalledWith({
        message: expect.stringContaining('Blackboard hint posted'),
        level: 'warn'
      });
    });

    it('should execute notification hook with error level for critical priority', async () => {
      // GIVEN: Mock hook executor
      const notifySpy = jest.spyOn(hookExecutor, 'notify');

      // WHEN: Posting critical priority hint
      await handler.handle({
        topic: 'test',
        message: 'Critical issue',
        priority: 'critical',
        agentId: 'agent-1'
      });

      // THEN: Hook called with error level
      expect(notifySpy).toHaveBeenCalledWith({
        message: expect.stringContaining('Blackboard hint posted'),
        level: 'error'
      });
    });
  });

  describe('Performance', () => {
    it('should post hint within reasonable time', async () => {
      // GIVEN: Performance test setup
      // WHEN: Posting hint
      const startTime = Date.now();
      await handler.handle({
        topic: 'perf-test',
        message: 'Performance test message',
        priority: 'low',
        agentId: 'agent-1'
      });
      const endTime = Date.now();

      // THEN: Completed within 100ms
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle bulk posts efficiently', async () => {
      // GIVEN: 100 hints to post
      const startTime = Date.now();

      // WHEN: Posting 100 hints
      const promises = Array.from({ length: 100 }, (_, i) =>
        handler.handle({
          topic: 'bulk-test',
          message: `Message ${i}`,
          priority: 'low',
          agentId: 'agent-1'
        })
      );

      await Promise.all(promises);
      const endTime = Date.now();

      // THEN: Completed within 500ms
      expect(endTime - startTime).toBeLessThan(500);
      expect(blackboard.get('bulk-test')).toHaveLength(100);
    });
  });
});
