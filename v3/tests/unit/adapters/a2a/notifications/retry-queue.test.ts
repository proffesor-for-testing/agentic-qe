/**
 * Tests for A2A Retry Queue
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RetryQueue,
  createRetryQueue,
  type PendingDelivery,
  type DeliveryAttemptResult,
  DEFAULT_RETRY_CONFIG,
} from '../../../../../src/adapters/a2a/notifications/retry-queue.js';

describe('RetryQueue', () => {
  let queue: RetryQueue;

  const createDelivery = (overrides?: Partial<PendingDelivery>): PendingDelivery => ({
    id: `delivery-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    subscriptionId: 'sub-123',
    taskId: 'task-123',
    url: 'https://example.com/webhook',
    secret: 'test-secret',
    payload: JSON.stringify({ event: 'task.completed' }),
    originalTimestamp: new Date(),
    attempt: 1,
    scheduledAt: new Date(),
    retryConfig: DEFAULT_RETRY_CONFIG,
    ...overrides,
  });

  beforeEach(() => {
    queue = createRetryQueue({
      enableAutoProcessing: false, // Manual processing for tests
    });
  });

  afterEach(() => {
    queue.destroy();
  });

  describe('enqueue', () => {
    it('should add delivery to queue', () => {
      const delivery = createDelivery();
      queue.enqueue(delivery);

      expect(queue.size).toBe(1);
      expect(queue.has(delivery.id)).toBe(true);
    });

    it('should get delivery by ID', () => {
      const delivery = createDelivery();
      queue.enqueue(delivery);

      const retrieved = queue.get(delivery.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.taskId).toBe(delivery.taskId);
    });

    it('should emit enqueued event', () => {
      const listener = vi.fn();
      queue.on('enqueued', listener);

      const delivery = createDelivery();
      queue.enqueue(delivery);

      expect(listener).toHaveBeenCalledWith({ delivery });
    });

    it('should evict oldest when at capacity', () => {
      const queue2 = createRetryQueue({
        maxQueueSize: 2,
        enableAutoProcessing: false,
      });

      const evictedListener = vi.fn();
      queue2.on('evicted', evictedListener);

      const delivery1 = createDelivery({ id: 'oldest' });
      const delivery2 = createDelivery({ id: 'middle' });
      const delivery3 = createDelivery({ id: 'newest' });

      queue2.enqueue(delivery1);
      queue2.enqueue(delivery2);
      queue2.enqueue(delivery3);

      expect(queue2.size).toBe(2);
      expect(queue2.has('oldest')).toBe(false);
      expect(evictedListener).toHaveBeenCalled();

      queue2.destroy();
    });
  });

  describe('enqueueNew', () => {
    it('should create and enqueue a new delivery', () => {
      const delivery = queue.enqueueNew({
        subscriptionId: 'sub-123',
        taskId: 'task-456',
        url: 'https://example.com/webhook',
        secret: 'secret',
        payload: '{"test": true}',
      });

      expect(delivery.id).toBeDefined();
      expect(delivery.taskId).toBe('task-456');
      expect(delivery.attempt).toBe(1);
      expect(queue.has(delivery.id)).toBe(true);
    });
  });

  describe('remove', () => {
    it('should remove delivery from queue', () => {
      const delivery = createDelivery();
      queue.enqueue(delivery);

      expect(queue.remove(delivery.id)).toBe(true);
      expect(queue.size).toBe(0);
    });

    it('should return false for non-existent delivery', () => {
      expect(queue.remove('non-existent')).toBe(false);
    });

    it('should emit removed event', () => {
      const listener = vi.fn();
      queue.on('removed', listener);

      const delivery = createDelivery();
      queue.enqueue(delivery);
      queue.remove(delivery.id);

      expect(listener).toHaveBeenCalledWith({ id: delivery.id });
    });
  });

  describe('removeBySubscription', () => {
    it('should remove all deliveries for subscription', () => {
      queue.enqueue(createDelivery({ id: 'd1', subscriptionId: 'sub-1' }));
      queue.enqueue(createDelivery({ id: 'd2', subscriptionId: 'sub-1' }));
      queue.enqueue(createDelivery({ id: 'd3', subscriptionId: 'sub-2' }));

      const removed = queue.removeBySubscription('sub-1');

      expect(removed).toBe(2);
      expect(queue.size).toBe(1);
    });
  });

  describe('removeByTask', () => {
    it('should remove all deliveries for task', () => {
      queue.enqueue(createDelivery({ id: 'd1', taskId: 'task-1' }));
      queue.enqueue(createDelivery({ id: 'd2', taskId: 'task-1' }));
      queue.enqueue(createDelivery({ id: 'd3', taskId: 'task-2' }));

      const removed = queue.removeByTask('task-1');

      expect(removed).toBe(2);
      expect(queue.size).toBe(1);
    });
  });

  describe('processQueue', () => {
    it('should process ready deliveries', async () => {
      const mockDeliveryFn = vi.fn().mockResolvedValue({
        success: true,
        statusCode: 200,
        shouldRetry: false,
      });

      queue.setDeliveryFunction(mockDeliveryFn);

      const delivery = createDelivery();
      queue.enqueue(delivery);

      await queue.processQueue();

      expect(mockDeliveryFn).toHaveBeenCalledWith(delivery);
      expect(queue.size).toBe(0); // Removed on success
    });

    it('should not process future scheduled deliveries', async () => {
      const mockDeliveryFn = vi.fn().mockResolvedValue({ success: true });
      queue.setDeliveryFunction(mockDeliveryFn);

      const futureDelivery = createDelivery({
        scheduledAt: new Date(Date.now() + 60000),
      });
      queue.enqueue(futureDelivery);

      await queue.processQueue();

      expect(mockDeliveryFn).not.toHaveBeenCalled();
      expect(queue.size).toBe(1);
    });

    it('should reschedule on failure with retry', async () => {
      const mockDeliveryFn = vi.fn().mockResolvedValue({
        success: false,
        statusCode: 500,
        shouldRetry: true,
        error: 'Server error',
      });

      queue.setDeliveryFunction(mockDeliveryFn);

      const delivery = createDelivery({ attempt: 1 });
      queue.enqueue(delivery);

      await queue.processQueue();

      const updated = queue.get(delivery.id);
      expect(updated).toBeDefined();
      expect(updated!.attempt).toBe(2);
      expect(updated!.lastError).toBe('Server error');
      expect(updated!.scheduledAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should remove on max attempts reached', async () => {
      const mockDeliveryFn = vi.fn().mockResolvedValue({
        success: false,
        shouldRetry: true,
      });

      queue.setDeliveryFunction(mockDeliveryFn);

      const delivery = createDelivery({
        attempt: 5,
        retryConfig: { ...DEFAULT_RETRY_CONFIG, maxAttempts: 5 },
      });
      queue.enqueue(delivery);

      await queue.processQueue();

      expect(queue.size).toBe(0);
    });

    it('should emit success event', async () => {
      const successListener = vi.fn();
      queue.on('success', successListener);

      const mockDeliveryFn = vi.fn().mockResolvedValue({
        success: true,
        statusCode: 200,
        shouldRetry: false,
      });

      queue.setDeliveryFunction(mockDeliveryFn);

      const delivery = createDelivery();
      queue.enqueue(delivery);

      await queue.processQueue();

      expect(successListener).toHaveBeenCalled();
    });

    it('should emit failed event when giving up', async () => {
      const failedListener = vi.fn();
      queue.on('failed', failedListener);

      const mockDeliveryFn = vi.fn().mockResolvedValue({
        success: false,
        shouldRetry: false, // Not retryable
      });

      queue.setDeliveryFunction(mockDeliveryFn);

      const delivery = createDelivery();
      queue.enqueue(delivery);

      await queue.processQueue();

      expect(failedListener).toHaveBeenCalled();
    });

    it('should emit retrying event', async () => {
      const retryingListener = vi.fn();
      queue.on('retrying', retryingListener);

      const mockDeliveryFn = vi.fn().mockResolvedValue({
        success: false,
        shouldRetry: true,
      });

      queue.setDeliveryFunction(mockDeliveryFn);

      const delivery = createDelivery();
      queue.enqueue(delivery);

      await queue.processQueue();

      expect(retryingListener).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      const mockDeliveryFn = vi.fn()
        .mockResolvedValueOnce({ success: true, shouldRetry: false })
        .mockResolvedValueOnce({ success: false, shouldRetry: false });

      queue.setDeliveryFunction(mockDeliveryFn);

      queue.enqueue(createDelivery({ id: 'd1' }));
      queue.enqueue(createDelivery({ id: 'd2' }));
      queue.enqueue(createDelivery({
        id: 'd3',
        scheduledAt: new Date(Date.now() + 60000),
      }));

      await queue.processQueue();

      const stats = queue.getStats();
      expect(stats.totalItems).toBe(1);
      expect(stats.totalProcessed).toBe(2);
      expect(stats.totalSuccess).toBe(1);
      expect(stats.totalFailed).toBe(1);
      expect(stats.scheduledForLater).toBe(1);
      expect(stats.readyToProcess).toBe(0);
    });

    it('should track by attempt count', () => {
      queue.enqueue(createDelivery({ attempt: 1 }));
      queue.enqueue(createDelivery({ attempt: 1 }));
      queue.enqueue(createDelivery({ attempt: 2 }));
      queue.enqueue(createDelivery({ attempt: 3 }));

      const stats = queue.getStats();
      expect(stats.byAttempt[1]).toBe(2);
      expect(stats.byAttempt[2]).toBe(1);
      expect(stats.byAttempt[3]).toBe(1);
    });
  });

  describe('clearFailed', () => {
    it('should remove items at max attempts', () => {
      queue.enqueue(createDelivery({ attempt: 5, retryConfig: { ...DEFAULT_RETRY_CONFIG, maxAttempts: 5 } }));
      queue.enqueue(createDelivery({ attempt: 3, retryConfig: { ...DEFAULT_RETRY_CONFIG, maxAttempts: 5 } }));
      queue.enqueue(createDelivery({ attempt: 5, retryConfig: { ...DEFAULT_RETRY_CONFIG, maxAttempts: 5 } }));

      const cleared = queue.clearFailed();

      expect(cleared).toBe(2);
      expect(queue.size).toBe(1);
    });
  });

  describe('exponential backoff', () => {
    it('should calculate correct delays', async () => {
      const mockDeliveryFn = vi.fn().mockResolvedValue({
        success: false,
        shouldRetry: true,
      });

      queue.setDeliveryFunction(mockDeliveryFn);

      // First attempt
      const delivery = createDelivery({
        retryConfig: {
          maxAttempts: 5,
          baseDelayMs: 1000,
          maxDelayMs: 60000,
          backoffMultiplier: 2,
          jitterEnabled: false,
        },
      });
      queue.enqueue(delivery);

      const beforeProcess = Date.now();
      await queue.processQueue();

      const updated = queue.get(delivery.id);
      const delay = updated!.scheduledAt.getTime() - beforeProcess;

      // Should be approximately 1000ms (base delay * 2^0)
      // Allow some tolerance for test timing variations
      expect(delay).toBeGreaterThanOrEqual(900);
      expect(delay).toBeLessThanOrEqual(3000);
    });

    it('should cap delay at maxDelayMs', async () => {
      const mockDeliveryFn = vi.fn().mockResolvedValue({
        success: false,
        shouldRetry: true,
      });

      queue.setDeliveryFunction(mockDeliveryFn);

      const delivery = createDelivery({
        attempt: 10, // High attempt number
        retryConfig: {
          maxAttempts: 20,
          baseDelayMs: 1000,
          maxDelayMs: 5000, // Low max
          backoffMultiplier: 2,
          jitterEnabled: false,
        },
      });
      queue.enqueue(delivery);

      const beforeProcess = Date.now();
      await queue.processQueue();

      const updated = queue.get(delivery.id);
      const delay = updated!.scheduledAt.getTime() - beforeProcess;

      // Should be capped at 5000ms
      expect(delay).toBeLessThanOrEqual(5500);
    });
  });

  describe('auto processing', () => {
    it('should start and stop processing timer', async () => {
      const queue2 = createRetryQueue({
        enableAutoProcessing: true,
        processingIntervalMs: 100,
      });

      const mockDeliveryFn = vi.fn().mockResolvedValue({ success: true });
      queue2.setDeliveryFunction(mockDeliveryFn);

      queue2.enqueue(createDelivery());

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(mockDeliveryFn).toHaveBeenCalled();

      queue2.stopProcessing();
      queue2.destroy();
    });
  });
});
