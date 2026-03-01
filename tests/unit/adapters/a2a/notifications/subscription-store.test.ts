/**
 * Tests for A2A Subscription Store
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SubscriptionStore,
  createSubscriptionStore,
  type WebhookConfig,
} from '../../../../../src/adapters/a2a/notifications/subscription-store.js';

describe('SubscriptionStore', () => {
  let store: SubscriptionStore;

  const createWebhookConfig = (overrides?: Partial<WebhookConfig>): WebhookConfig => ({
    url: 'https://example.com/webhook',
    secret: 'test-secret',
    events: ['task.completed', 'task.failed'],
    timeout: 30000,
    maxRetries: 5,
    ...overrides,
  });

  beforeEach(() => {
    store = createSubscriptionStore({
      enableAutoCleanup: false, // Disable for tests
    });
  });

  afterEach(() => {
    store.destroy();
  });

  describe('create', () => {
    it('should create a subscription', () => {
      const config = createWebhookConfig();
      const sub = store.create('task-123', config);

      expect(sub).toBeDefined();
      expect(sub.id).toBeDefined();
      expect(sub.taskId).toBe('task-123');
      expect(sub.webhookConfig).toEqual(config);
      expect(sub.status).toBe('active');
      expect(sub.deliveryCount).toBe(0);
      expect(sub.failureCount).toBe(0);
      expect(sub.consecutiveFailures).toBe(0);
    });

    it('should create subscription with custom ID', () => {
      const config = createWebhookConfig();
      const sub = store.create('task-123', config, { id: 'custom-id' });

      expect(sub.id).toBe('custom-id');
    });

    it('should create subscription with context ID', () => {
      const config = createWebhookConfig();
      const sub = store.create('task-123', config, { contextId: 'ctx-456' });

      expect(sub.contextId).toBe('ctx-456');
    });

    it('should set expiration date', () => {
      const config = createWebhookConfig();
      const expiresAt = new Date(Date.now() + 3600000);
      const sub = store.create('task-123', config, { expiresAt });

      expect(sub.expiresAt).toEqual(expiresAt);
    });

    it('should throw on duplicate ID', () => {
      const config = createWebhookConfig();
      store.create('task-123', config, { id: 'sub-1' });

      expect(() => store.create('task-456', config, { id: 'sub-1' })).toThrow(
        'already exists'
      );
    });

    it('should enforce per-task limit', () => {
      const store2 = createSubscriptionStore({
        maxSubscriptionsPerTask: 2,
        enableAutoCleanup: false,
      });

      const config = createWebhookConfig();
      store2.create('task-123', config);
      store2.create('task-123', config);

      expect(() => store2.create('task-123', config)).toThrow('Maximum subscriptions per task');

      store2.destroy();
    });
  });

  describe('get', () => {
    it('should retrieve a subscription by ID', () => {
      const config = createWebhookConfig();
      const created = store.create('task-123', config);
      const retrieved = store.get(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
    });

    it('should return null for non-existent ID', () => {
      expect(store.get('non-existent')).toBeNull();
    });
  });

  describe('getForTask', () => {
    it('should get first active subscription for task', () => {
      const config = createWebhookConfig();
      const sub1 = store.create('task-123', config);
      store.create('task-123', config);

      const result = store.getForTask('task-123');
      expect(result).not.toBeNull();
      expect(result!.id).toBe(sub1.id);
    });

    it('should return null for task without subscriptions', () => {
      expect(store.getForTask('no-task')).toBeNull();
    });
  });

  describe('update', () => {
    it('should update subscription status', () => {
      const config = createWebhookConfig();
      const sub = store.create('task-123', config);

      const updated = store.update(sub.id, { status: 'paused' });
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('paused');
    });

    it('should increment delivery count', () => {
      const config = createWebhookConfig();
      const sub = store.create('task-123', config);

      store.update(sub.id, { incrementDeliveryCount: true });
      store.update(sub.id, { incrementDeliveryCount: true });

      const updated = store.get(sub.id);
      expect(updated!.deliveryCount).toBe(2);
    });

    it('should auto-fail on max consecutive failures', () => {
      const store2 = createSubscriptionStore({
        maxConsecutiveFailures: 3,
        enableAutoCleanup: false,
      });

      const config = createWebhookConfig();
      const sub = store2.create('task-123', config);

      store2.update(sub.id, { consecutiveFailures: 3 });

      const updated = store2.get(sub.id);
      expect(updated!.status).toBe('failed');

      store2.destroy();
    });

    it('should return null for non-existent subscription', () => {
      expect(store.update('non-existent', { status: 'paused' })).toBeNull();
    });
  });

  describe('recordSuccess', () => {
    it('should record successful delivery', () => {
      const config = createWebhookConfig();
      const sub = store.create('task-123', config);

      store.update(sub.id, { consecutiveFailures: 5, lastError: 'previous error' });
      store.recordSuccess(sub.id);

      const updated = store.get(sub.id);
      expect(updated!.deliveryCount).toBe(1);
      expect(updated!.consecutiveFailures).toBe(0);
      expect(updated!.lastError).toBeUndefined();
      expect(updated!.lastSuccessAt).toBeDefined();
    });
  });

  describe('recordFailure', () => {
    it('should record failed delivery', () => {
      const config = createWebhookConfig();
      const sub = store.create('task-123', config);

      store.recordFailure(sub.id, 'Connection timeout');

      const updated = store.get(sub.id);
      expect(updated!.deliveryCount).toBe(1);
      expect(updated!.failureCount).toBe(1);
      expect(updated!.consecutiveFailures).toBe(1);
      expect(updated!.lastError).toBe('Connection timeout');
    });
  });

  describe('delete', () => {
    it('should delete a subscription', () => {
      const config = createWebhookConfig();
      const sub = store.create('task-123', config);

      expect(store.delete(sub.id)).toBe(true);
      expect(store.get(sub.id)).toBeNull();
    });

    it('should return false for non-existent subscription', () => {
      expect(store.delete('non-existent')).toBe(false);
    });
  });

  describe('deleteForTask', () => {
    it('should delete all subscriptions for a task', () => {
      const config = createWebhookConfig();
      store.create('task-123', config);
      store.create('task-123', config);
      store.create('task-456', config);

      const deleted = store.deleteForTask('task-123');

      expect(deleted).toBe(2);
      expect(store.listByTask('task-123')).toHaveLength(0);
      expect(store.listByTask('task-456')).toHaveLength(1);
    });
  });

  describe('listByTask', () => {
    it('should list all subscriptions for a task', () => {
      const config = createWebhookConfig();
      store.create('task-123', config);
      store.create('task-123', config);
      store.create('task-456', config);

      const subs = store.listByTask('task-123');
      expect(subs).toHaveLength(2);
      expect(subs.every((s) => s.taskId === 'task-123')).toBe(true);
    });

    it('should return empty array for task without subscriptions', () => {
      expect(store.listByTask('no-task')).toHaveLength(0);
    });
  });

  describe('listByContext', () => {
    it('should list subscriptions by context', () => {
      const config = createWebhookConfig();
      store.create('task-1', config, { contextId: 'ctx-1' });
      store.create('task-2', config, { contextId: 'ctx-1' });
      store.create('task-3', config, { contextId: 'ctx-2' });

      const subs = store.listByContext('ctx-1');
      expect(subs).toHaveLength(2);
    });
  });

  describe('getSubscribersForEvent', () => {
    it('should get subscribers for specific event', () => {
      store.create('task-123', createWebhookConfig({ events: ['task.completed'] }));
      store.create('task-123', createWebhookConfig({ events: ['task.failed'] }));
      store.create('task-123', createWebhookConfig({ events: ['task.completed', 'task.failed'] }));

      const completedSubs = store.getSubscribersForEvent('task-123', 'task.completed');
      expect(completedSubs).toHaveLength(2);

      const failedSubs = store.getSubscribersForEvent('task-123', 'task.failed');
      expect(failedSubs).toHaveLength(2);
    });

    it('should exclude expired subscriptions', () => {
      const pastDate = new Date(Date.now() - 1000);
      store.create('task-123', createWebhookConfig(), { expiresAt: pastDate });

      const subs = store.getSubscribersForEvent('task-123', 'task.completed');
      expect(subs).toHaveLength(0);
    });
  });

  describe('query', () => {
    it('should filter by status', () => {
      const config = createWebhookConfig();
      const sub1 = store.create('task-1', config);
      const sub2 = store.create('task-2', config);

      store.update(sub2.id, { status: 'paused' });

      const active = store.query({ status: 'active' });
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(sub1.id);
    });

    it('should support pagination', () => {
      const config = createWebhookConfig();
      for (let i = 0; i < 10; i++) {
        store.create(`task-${i}`, config);
      }

      const page1 = store.query({ limit: 3 });
      expect(page1).toHaveLength(3);

      const page2 = store.query({ limit: 3, offset: 3 });
      expect(page2).toHaveLength(3);
      expect(page2[0].id).not.toBe(page1[0].id);
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', () => {
      const config = createWebhookConfig();
      const sub1 = store.create('task-1', config);
      store.create('task-2', config, { contextId: 'ctx-1' });

      store.update(sub1.id, { status: 'failed' });
      store.recordSuccess(sub1.id);

      const stats = store.getStats();
      expect(stats.total).toBe(2);
      expect(stats.byStatus.active).toBe(1);
      expect(stats.byStatus.failed).toBe(1);
      expect(stats.totalDeliveries).toBe(1);
      expect(stats.uniqueTasks).toBe(2);
      expect(stats.uniqueContexts).toBe(1);
    });
  });

  describe('cleanupExpired', () => {
    it('should remove expired subscriptions', () => {
      const config = createWebhookConfig();
      const pastDate = new Date(Date.now() - 1000);
      const futureDate = new Date(Date.now() + 3600000);

      store.create('task-1', config, { expiresAt: pastDate });
      store.create('task-2', config, { expiresAt: futureDate });

      const cleaned = store.cleanupExpired();
      expect(cleaned).toBe(1);
      expect(store.size).toBe(1);
    });
  });

  describe('cleanupFailed', () => {
    it('should remove failed subscriptions', () => {
      const config = createWebhookConfig();
      const sub = store.create('task-1', config);
      store.create('task-2', config);

      store.update(sub.id, { status: 'failed' });

      const cleaned = store.cleanupFailed();
      expect(cleaned).toBe(1);
      expect(store.size).toBe(1);
    });
  });
});
