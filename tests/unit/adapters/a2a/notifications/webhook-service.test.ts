/**
 * Tests for A2A Webhook Service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  WebhookService,
  createWebhookService,
  type HttpClient,
  type HttpResponse,
  type WebhookPayload,
  type WebhookConfig,
  statusToEvent,
} from '../../../../../src/adapters/a2a/notifications/webhook-service.js';
import { verifySignature, SIGNATURE_HEADER } from '../../../../../src/adapters/a2a/notifications/signature.js';

describe('WebhookService', () => {
  let service: WebhookService;
  let mockHttpClient: HttpClient;
  let lastRequest: {
    url: string;
    body: string;
    headers: Record<string, string>;
  } | null;

  const createConfig = (overrides?: Partial<WebhookConfig>): WebhookConfig => ({
    url: 'https://example.com/webhook',
    secret: 'test-secret',
    events: ['task.completed', 'task.failed'],
    timeout: 30000,
    maxRetries: 3,
    ...overrides,
  });

  const createPayload = (overrides?: Partial<WebhookPayload>): WebhookPayload => ({
    event: 'task.completed',
    taskId: 'task-123',
    timestamp: new Date().toISOString(),
    data: { status: 'completed' },
    ...overrides,
  });

  beforeEach(() => {
    lastRequest = null;

    mockHttpClient = {
      post: vi.fn().mockImplementation(async (url, body, headers) => {
        lastRequest = { url, body, headers };
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          body: '',
        };
      }),
    };

    service = createWebhookService({
      httpClient: mockHttpClient,
      retryQueueConfig: {
        enableAutoProcessing: false,
      },
    });
  });

  afterEach(() => {
    service.destroy();
  });

  describe('subscribe', () => {
    it('should create a subscription', () => {
      const sub = service.subscribe('task-123', {
        url: 'https://example.com/webhook',
        secret: 'secret',
        events: ['task.completed'],
      });

      expect(sub).toBeDefined();
      expect(sub.taskId).toBe('task-123');
      expect(sub.status).toBe('active');
    });

    it('should use default values for optional config', () => {
      const sub = service.subscribe('task-123', {
        url: 'https://example.com/webhook',
        secret: 'secret',
      });

      expect(sub.webhookConfig.timeout).toBe(30000);
      expect(sub.webhookConfig.maxRetries).toBe(5);
    });
  });

  describe('getSubscription', () => {
    it('should retrieve subscription for task', () => {
      service.subscribe('task-123', {
        url: 'https://example.com/webhook',
        secret: 'secret',
      });

      const sub = service.getSubscription('task-123');
      expect(sub).not.toBeNull();
      expect(sub!.taskId).toBe('task-123');
    });

    it('should return null for non-existent task', () => {
      expect(service.getSubscription('no-task')).toBeNull();
    });
  });

  describe('unsubscribe', () => {
    it('should remove subscriptions for task', () => {
      service.subscribe('task-123', {
        url: 'https://example.com/webhook',
        secret: 'secret',
      });

      const removed = service.unsubscribe('task-123');
      expect(removed).toBe(1);
      expect(service.getSubscription('task-123')).toBeNull();
    });
  });

  describe('deliver', () => {
    it('should deliver payload successfully', async () => {
      const config = createConfig();
      const payload = createPayload();

      const result = await service.deliver(config, payload);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.attempts).toBe(1);
      expect(result.queued).toBe(false);
    });

    it('should send correct headers', async () => {
      const config = createConfig();
      const payload = createPayload();

      await service.deliver(config, payload);

      expect(lastRequest).not.toBeNull();
      expect(lastRequest!.headers[SIGNATURE_HEADER]).toBeDefined();
      expect(lastRequest!.headers['Content-Type']).toBe('application/json');
      expect(lastRequest!.headers['X-A2A-Timestamp']).toBeDefined();
    });

    it('should send valid signature', async () => {
      const config = createConfig();
      const payload = createPayload();

      await service.deliver(config, payload);

      const signature = lastRequest!.headers[SIGNATURE_HEADER];
      const result = verifySignature(lastRequest!.body, signature, config.secret);

      expect(result.valid).toBe(true);
    });

    it('should queue for retry on 5xx errors', async () => {
      mockHttpClient.post = vi.fn().mockResolvedValue({
        status: 500,
        statusText: 'Internal Server Error',
      });

      const config = createConfig();
      const payload = createPayload();

      const result = await service.deliver(config, payload);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(500);
      expect(result.queued).toBe(true);
      expect(result.deliveryId).toBeDefined();
    });

    it('should queue for retry on 429', async () => {
      mockHttpClient.post = vi.fn().mockResolvedValue({
        status: 429,
        statusText: 'Too Many Requests',
      });

      const config = createConfig();
      const payload = createPayload();

      const result = await service.deliver(config, payload);

      expect(result.queued).toBe(true);
    });

    it('should not retry on 4xx errors (except 429)', async () => {
      mockHttpClient.post = vi.fn().mockResolvedValue({
        status: 400,
        statusText: 'Bad Request',
      });

      const config = createConfig();
      const payload = createPayload();

      const result = await service.deliver(config, payload);

      expect(result.success).toBe(false);
      expect(result.queued).toBe(false);
    });

    it('should queue on network error', async () => {
      mockHttpClient.post = vi.fn().mockRejectedValue(new Error('Network error'));

      const config = createConfig();
      const payload = createPayload();

      const result = await service.deliver(config, payload);

      expect(result.success).toBe(false);
      expect(result.queued).toBe(true);
      expect(result.error).toBe('Network error');
    });
  });

  describe('deliverWithRetry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should succeed on first attempt', async () => {
      const config = createConfig();
      const payload = createPayload();

      const resultPromise = service.deliverWithRetry(config, payload);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
    });

    it('should retry on failure', async () => {
      mockHttpClient.post = vi.fn()
        .mockResolvedValueOnce({ status: 500, statusText: 'Error' })
        .mockResolvedValueOnce({ status: 500, statusText: 'Error' })
        .mockResolvedValueOnce({ status: 200, statusText: 'OK' });

      const config = createConfig({ maxRetries: 5 });
      const payload = createPayload();

      const resultPromise = service.deliverWithRetry(config, payload);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
    });

    it('should give up after max retries', async () => {
      mockHttpClient.post = vi.fn().mockResolvedValue({ status: 500 });

      const config = createConfig({ maxRetries: 2 });
      const payload = createPayload();

      const resultPromise = service.deliverWithRetry(config, payload);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(2);
    });
  });

  describe('notifySubscribers', () => {
    it('should deliver to all subscribers', async () => {
      service.subscribe('task-123', {
        url: 'https://sub1.example.com/webhook',
        secret: 'secret1',
        events: ['task.completed'],
      });

      service.subscribe('task-123', {
        url: 'https://sub2.example.com/webhook',
        secret: 'secret2',
        events: ['task.completed'],
      });

      const results = await service.notifySubscribers(
        'task-123',
        'task.completed',
        { status: 'completed' }
      );

      expect(results.size).toBe(2);
      expect(mockHttpClient.post).toHaveBeenCalledTimes(2);
    });

    it('should only notify subscribed events', async () => {
      service.subscribe('task-123', {
        url: 'https://example.com/webhook',
        secret: 'secret',
        events: ['task.completed'],
      });

      const results = await service.notifySubscribers(
        'task-123',
        'task.failed',
        { status: 'failed' }
      );

      expect(results.size).toBe(0);
      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });

    it('should update subscription stats on success', async () => {
      const sub = service.subscribe('task-123', {
        url: 'https://example.com/webhook',
        secret: 'secret',
        events: ['task.completed'],
      });

      await service.notifySubscribers(
        'task-123',
        'task.completed',
        { status: 'completed' }
      );

      const updated = service.getSubscriptionStore().get(sub.id);
      expect(updated).not.toBeNull();
      expect(updated!.deliveryCount).toBe(1);
      expect(updated!.lastSuccessAt).toBeDefined();
    });

    it('should update subscription stats on failure', async () => {
      mockHttpClient.post = vi.fn().mockResolvedValue({ status: 500 });

      const sub = service.subscribe('task-123', {
        url: 'https://example.com/webhook',
        secret: 'secret',
        events: ['task.completed'],
      });

      await service.notifySubscribers(
        'task-123',
        'task.completed',
        { status: 'completed' }
      );

      const updated = service.getSubscriptionStore().get(sub.id);
      expect(updated).not.toBeNull();
      expect(updated!.failureCount).toBe(1);
      expect(updated!.lastError).toBeDefined();
    });
  });

  describe('notifyStateChange', () => {
    it('should notify with correct event and data', async () => {
      service.subscribe('task-123', {
        url: 'https://example.com/webhook',
        secret: 'secret',
        events: ['task.completed'],
      });

      await service.notifyStateChange('task-123', 'completed', 'working');

      expect(lastRequest).not.toBeNull();
      const payload = JSON.parse(lastRequest!.body);
      expect(payload.event).toBe('task.completed');
      expect(payload.data.status).toBe('completed');
      expect(payload.data.previousStatus).toBe('working');
    });

    it('should include error info for failed status', async () => {
      service.subscribe('task-123', {
        url: 'https://example.com/webhook',
        secret: 'secret',
        events: ['task.failed'],
      });

      await service.notifyStateChange(
        'task-123',
        'failed',
        'working',
        { message: 'Something went wrong', code: 'ERR_001' }
      );

      const payload = JSON.parse(lastRequest!.body);
      expect(payload.data.error).toEqual({
        message: 'Something went wrong',
        code: 'ERR_001',
      });
    });
  });

  describe('notifyArtifactCreated', () => {
    it('should notify with artifact info', async () => {
      service.subscribe('task-123', {
        url: 'https://example.com/webhook',
        secret: 'secret',
        events: ['task.artifact_created'],
      });

      await service.notifyArtifactCreated('task-123', {
        id: 'artifact-1',
        name: 'output.json',
        mimeType: 'application/json',
        size: 1024,
      });

      const payload = JSON.parse(lastRequest!.body);
      expect(payload.event).toBe('task.artifact_created');
      expect(payload.data.artifact).toEqual({
        id: 'artifact-1',
        name: 'output.json',
        mimeType: 'application/json',
        size: 1024,
      });
    });
  });

  describe('statusToEvent', () => {
    it('should map all task statuses correctly', () => {
      expect(statusToEvent('submitted')).toBe('task.submitted');
      expect(statusToEvent('working')).toBe('task.working');
      expect(statusToEvent('completed')).toBe('task.completed');
      expect(statusToEvent('failed')).toBe('task.failed');
      expect(statusToEvent('canceled')).toBe('task.canceled');
      expect(statusToEvent('input_required')).toBe('task.input_required');
      expect(statusToEvent('auth_required')).toBe('task.auth_required');
      expect(statusToEvent('rejected')).toBe('task.rejected');
    });
  });

  describe('getMetrics', () => {
    it('should track delivery metrics', async () => {
      const config = createConfig();

      // Successful delivery
      await service.deliver(config, createPayload());

      // Failed delivery
      mockHttpClient.post = vi.fn().mockResolvedValue({ status: 400 });
      await service.deliver(config, createPayload());

      const metrics = service.getMetrics();

      expect(metrics.totalDeliveries).toBe(2);
      expect(metrics.successfulDeliveries).toBe(1);
      expect(metrics.failedDeliveries).toBe(1);
      expect(metrics.successRate).toBe(0.5);
    });

    it('should track events by type', async () => {
      const config = createConfig();

      await service.deliver(config, createPayload({ event: 'task.completed' }));
      await service.deliver(config, createPayload({ event: 'task.completed' }));
      await service.deliver(config, createPayload({ event: 'task.failed' }));

      const metrics = service.getMetrics();

      expect(metrics.byEvent['task.completed']).toBe(2);
      expect(metrics.byEvent['task.failed']).toBe(1);
    });

    it('should calculate average response time', async () => {
      const config = createConfig();

      // Add delay to mock
      mockHttpClient.post = vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { status: 200 };
      });

      await service.deliver(config, createPayload());
      await service.deliver(config, createPayload());

      const metrics = service.getMetrics();

      expect(metrics.avgResponseTimeMs).toBeGreaterThan(0);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics', async () => {
      const config = createConfig();
      await service.deliver(config, createPayload());

      service.resetMetrics();

      const metrics = service.getMetrics();
      expect(metrics.totalDeliveries).toBe(0);
      expect(metrics.successfulDeliveries).toBe(0);
    });
  });
});
