import { describe, expect, it, vi } from 'vitest';
import { RetryQueue } from '../../../../../src/adapters/a2a/notifications/retry-queue.js';

describe('Retry queue replacement at capacity', () => {
  it('keeps unrelated deliveries and delivers the replacement exactly once', async () => {
    const queue = new RetryQueue({ enableAutoProcessing: false, maxQueueSize: 2 });
    const params = { subscriptionId: 's', taskId: 't', url: 'http://localhost', secret: 'test', payload: 'first' };
    try {
      const first = queue.enqueueNew(params);
      const second = queue.enqueueNew({ ...params, payload: 'old second' });
      const evicted = vi.fn();
      queue.on('evicted', evicted);
      queue.enqueue({ ...second, payload: 'replacement second', scheduledAt: new Date(0) });
      expect(queue.has(first.id)).toBe(true);
      expect(queue.size).toBe(2);
      expect(evicted).not.toHaveBeenCalled();
      const delivered: string[] = [];
      queue.setDeliveryFunction(async delivery => {
        delivered.push(delivery.payload);
        return { success: true, shouldRetry: false };
      });
      await queue.processQueue();
      expect(delivered.sort()).toEqual(['first', 'replacement second']);
      expect(queue.size).toBe(0);
    } finally {
      queue.destroy();
    }
  });
});
