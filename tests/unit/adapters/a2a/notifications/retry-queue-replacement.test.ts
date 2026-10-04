import { describe, it, expect, vi } from 'vitest';
import type { DeliveryAttemptResult } from '../../../../../src/adapters/a2a/notifications/retry-queue.js';
import { RetryQueue } from '../../../../../src/adapters/a2a/notifications/retry-queue.js';
const params = {
  subscriptionId: 's',
  taskId: 't',
  url: 'http://localhost',
  secret: 'test',
  payload: '{}',
};
describe('revoked webhook deliveries', () => {
  it('does not delete a replacement with the same ID when an older send completes', async () => {
    const queue = new RetryQueue({ enableAutoProcessing: false });
    let resolve!: (value: DeliveryAttemptResult) => void;
    queue.setDeliveryFunction(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const first = queue.enqueueNew(params);
    const running = queue.processQueue();
    const replacement = { ...first, payload: 'new payload' };
    queue.enqueue(replacement);
    resolve({ success: true, shouldRetry: false });
    await running;
    expect(queue.get(first.id)).toBe(replacement);
    expect(queue.getStats().totalSuccess).toBe(0);
    queue.destroy();
  });
  it('does not emit a retry for a delivery cancelled while the sender rejects', async () => {
    const queue = new RetryQueue({ enableAutoProcessing: false });
    let reject!: (reason: unknown) => void;
    const retry = vi.fn();
    queue.on('retrying', retry);
    queue.setDeliveryFunction(
      () =>
        new Promise((_, r) => {
          reject = r;
        }),
    );
    const first = queue.enqueueNew(params);
    const running = queue.processQueue();
    queue.remove(first.id);
    reject(new Error('network'));
    await running;
    expect(retry).not.toHaveBeenCalled();
    expect(queue.size).toBe(0);
    queue.destroy();
  });
});
