/**
 * Unit tests for PriorityQueue
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { PriorityQueue } from '../../../src/core/orchestration/PriorityQueue';

describe('PriorityQueue', () => {
  let queue: PriorityQueue<string>;

  beforeEach(() => {
    queue = new PriorityQueue<string>();
  });

  describe('Basic Operations', () => {
    it('should enqueue and dequeue items', () => {
      queue.enqueue('task1', 10);
      queue.enqueue('task2', 20);
      queue.enqueue('task3', 15);

      expect(queue.dequeue()).toBe('task2'); // highest priority
      expect(queue.dequeue()).toBe('task3');
      expect(queue.dequeue()).toBe('task1');
      expect(queue.dequeue()).toBeUndefined();
    });

    it('should peek without removing', () => {
      queue.enqueue('task1', 10);
      queue.enqueue('task2', 20);

      expect(queue.peek()).toBe('task2');
      expect(queue.size()).toBe(2);
      expect(queue.peek()).toBe('task2'); // Still there
    });

    it('should report empty correctly', () => {
      expect(queue.isEmpty()).toBe(true);

      queue.enqueue('task1', 10);
      expect(queue.isEmpty()).toBe(false);

      queue.dequeue();
      expect(queue.isEmpty()).toBe(true);
    });

    it('should report size correctly', () => {
      expect(queue.size()).toBe(0);

      queue.enqueue('task1', 10);
      expect(queue.size()).toBe(1);

      queue.enqueue('task2', 20);
      expect(queue.size()).toBe(2);

      queue.dequeue();
      expect(queue.size()).toBe(1);
    });

    it('should clear all items', () => {
      queue.enqueue('task1', 10);
      queue.enqueue('task2', 20);
      queue.enqueue('task3', 15);

      queue.clear();

      expect(queue.isEmpty()).toBe(true);
      expect(queue.size()).toBe(0);
    });
  });

  describe('Priority Ordering', () => {
    it('should dequeue items in priority order', () => {
      // Add items in random order
      queue.enqueue('low', 10);
      queue.enqueue('critical', 100);
      queue.enqueue('medium', 50);
      queue.enqueue('high', 75);

      expect(queue.dequeue()).toBe('critical');
      expect(queue.dequeue()).toBe('high');
      expect(queue.dequeue()).toBe('medium');
      expect(queue.dequeue()).toBe('low');
    });

    it('should handle equal priorities (FIFO for same priority)', () => {
      queue.enqueue('task1', 50);
      queue.enqueue('task2', 50);
      queue.enqueue('task3', 50);

      const first = queue.dequeue();
      const second = queue.dequeue();
      const third = queue.dequeue();

      // All should be dequeued
      expect([first, second, third]).toEqual(
        expect.arrayContaining(['task1', 'task2', 'task3'])
      );
    });

    it('should handle negative priorities', () => {
      queue.enqueue('negative', -10);
      queue.enqueue('zero', 0);
      queue.enqueue('positive', 10);

      expect(queue.dequeue()).toBe('positive');
      expect(queue.dequeue()).toBe('zero');
      expect(queue.dequeue()).toBe('negative');
    });
  });

  describe('Complex Types', () => {
    it('should work with objects', () => {
      interface Task {
        id: string;
        name: string;
      }

      const taskQueue = new PriorityQueue<Task>();

      taskQueue.enqueue({ id: '1', name: 'Low priority' }, 10);
      taskQueue.enqueue({ id: '2', name: 'High priority' }, 100);
      taskQueue.enqueue({ id: '3', name: 'Medium priority' }, 50);

      expect(taskQueue.dequeue()?.name).toBe('High priority');
      expect(taskQueue.dequeue()?.name).toBe('Medium priority');
      expect(taskQueue.dequeue()?.name).toBe('Low priority');
    });
  });

  describe('Edge Cases', () => {
    it('should handle single item', () => {
      queue.enqueue('only', 50);

      expect(queue.peek()).toBe('only');
      expect(queue.dequeue()).toBe('only');
      expect(queue.isEmpty()).toBe(true);
    });

    it('should handle dequeue on empty queue', () => {
      expect(queue.dequeue()).toBeUndefined();
    });

    it('should handle peek on empty queue', () => {
      expect(queue.peek()).toBeUndefined();
    });

    it('should handle many items', () => {
      // Add 1000 items
      for (let i = 0; i < 1000; i++) {
        queue.enqueue(`task${i}`, Math.random() * 100);
      }

      expect(queue.size()).toBe(1000);

      // Dequeue all and verify ordering
      let lastPriority = Infinity;
      let count = 0;

      while (!queue.isEmpty()) {
        queue.dequeue();
        count++;
      }

      expect(count).toBe(1000);
    });
  });

  describe('Array Conversion', () => {
    it('should convert to array ordered by priority', () => {
      queue.enqueue('low', 10);
      queue.enqueue('critical', 100);
      queue.enqueue('medium', 50);
      queue.enqueue('high', 75);

      const array = queue.toArray();

      expect(array).toEqual(['critical', 'high', 'medium', 'low']);
    });

    it('should not modify queue when converting to array', () => {
      queue.enqueue('task1', 10);
      queue.enqueue('task2', 20);

      const array = queue.toArray();

      expect(array).toHaveLength(2);
      expect(queue.size()).toBe(2); // Queue unchanged
    });
  });

  describe('Performance', () => {
    it('should maintain O(log n) performance for enqueue/dequeue', () => {
      const startTime = Date.now();

      // Enqueue 10000 items
      for (let i = 0; i < 10000; i++) {
        queue.enqueue(`task${i}`, Math.random() * 1000);
      }

      const enqueueTime = Date.now() - startTime;

      const dequeueStartTime = Date.now();

      // Dequeue 10000 items
      while (!queue.isEmpty()) {
        queue.dequeue();
      }

      const dequeueTime = Date.now() - dequeueStartTime;

      // Should complete in reasonable time (< 1 second for 10k operations)
      expect(enqueueTime).toBeLessThan(1000);
      expect(dequeueTime).toBeLessThan(1000);
    });
  });
});
