/**
 * A2A Webhook Service
 *
 * Delivers webhook notifications for A2A task events with signature verification,
 * retry logic, and subscription management integration.
 *
 * @module adapters/a2a/notifications/webhook-service
 * @see https://a2a-protocol.org/latest/specification/
 */

import { EventEmitter } from 'events';
import type { TaskStatus } from '../jsonrpc/methods.js';
import {
  generateSignatureHeader,
  SIGNATURE_HEADER,
} from './signature.js';
import {
  SubscriptionStore,
  createSubscriptionStore,
  type Subscription,
  type SubscriptionStoreConfig,
} from './subscription-store.js';
import {
  RetryQueue,
  createRetryQueue,
  type RetryConfig,
  type RetryQueueConfig,
  type PendingDelivery,
  type DeliveryAttemptResult,
} from './retry-queue.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Webhook event types
 */
export type WebhookEvent =
  | 'task.submitted'
  | 'task.working'
  | 'task.completed'
  | 'task.failed'
  | 'task.canceled'
  | 'task.input_required'
  | 'task.auth_required'
  | 'task.rejected'
  | 'task.artifact_created';

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  /** Webhook URL for notifications */
  url: string;
  /** Secret for signing webhook payloads */
  secret: string;
  /** Events to subscribe to */
  events: WebhookEvent[];
  /** Request timeout in milliseconds */
  timeout: number;
  /** Maximum retry attempts */
  maxRetries: number;
}

/**
 * Webhook payload structure
 */
export interface WebhookPayload {
  /** Event type */
  event: WebhookEvent;
  /** Task ID */
  taskId: string;
  /** Context ID (for multi-turn) */
  contextId?: string;
  /** Event timestamp (ISO 8601) */
  timestamp: string;
  /** Event-specific data */
  data: WebhookEventData;
  /** Protocol metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Event-specific data
 */
export interface WebhookEventData {
  /** Current task status */
  status?: TaskStatus;
  /** Previous status (for state changes) */
  previousStatus?: TaskStatus;
  /** Error information (for failures) */
  error?: {
    message: string;
    code?: string;
  };
  /** Artifact information (for artifact events) */
  artifact?: {
    id: string;
    name: string;
    mimeType?: string;
    size?: number;
  };
  /** Additional context */
  [key: string]: unknown;
}

/**
 * Delivery result
 */
export interface DeliveryResult {
  /** Whether delivery was successful */
  success: boolean;
  /** HTTP status code */
  statusCode?: number;
  /** Error message if failed */
  error?: string;
  /** Response time in milliseconds */
  responseTimeMs: number;
  /** Number of attempts */
  attempts: number;
  /** Whether delivery was queued for retry */
  queued: boolean;
  /** Delivery ID if queued */
  deliveryId?: string;
}

/**
 * Webhook service configuration
 */
export interface WebhookServiceConfig {
  /** User agent for webhook requests */
  userAgent?: string;
  /** Default timeout in milliseconds */
  defaultTimeoutMs?: number;
  /** Default retry configuration */
  defaultRetryConfig?: Partial<RetryConfig>;
  /** Subscription store configuration */
  subscriptionStoreConfig?: SubscriptionStoreConfig;
  /** Retry queue configuration */
  retryQueueConfig?: RetryQueueConfig;
  /** HTTP client for making requests (injectable for testing) */
  httpClient?: HttpClient;
  /** Enable metrics collection */
  enableMetrics?: boolean;
}

/**
 * HTTP client interface for making requests
 */
export interface HttpClient {
  post(
    url: string,
    body: string,
    headers: Record<string, string>,
    timeout: number
  ): Promise<HttpResponse>;
}

/**
 * HTTP response interface
 */
export interface HttpResponse {
  status: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Webhook service metrics
 */
export interface WebhookMetrics {
  /** Total deliveries attempted */
  totalDeliveries: number;
  /** Successful deliveries */
  successfulDeliveries: number;
  /** Failed deliveries (after retries) */
  failedDeliveries: number;
  /** Average response time (ms) */
  avgResponseTimeMs: number;
  /** Delivery success rate (0-1) */
  successRate: number;
  /** Deliveries by event type */
  byEvent: Record<WebhookEvent, number>;
  /** Active subscriptions */
  activeSubscriptions: number;
  /** Items in retry queue */
  retryQueueSize: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_WEBHOOK_CONFIG: Partial<WebhookConfig> = {
  timeout: 30000,
  maxRetries: 5,
  events: ['task.completed', 'task.failed'],
};

export const DEFAULT_SERVICE_CONFIG: Required<Omit<WebhookServiceConfig, 'httpClient'>> = {
  userAgent: 'A2A-Webhook-Service/1.0',
  defaultTimeoutMs: 30000,
  defaultRetryConfig: {
    maxAttempts: 5,
    baseDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
  },
  subscriptionStoreConfig: {},
  retryQueueConfig: {},
  enableMetrics: true,
};

// ============================================================================
// Status to Event Mapping
// ============================================================================

/**
 * Map task status to webhook event
 */
export function statusToEvent(status: TaskStatus): WebhookEvent {
  const mapping: Record<TaskStatus, WebhookEvent> = {
    submitted: 'task.submitted',
    working: 'task.working',
    completed: 'task.completed',
    failed: 'task.failed',
    canceled: 'task.canceled',
    input_required: 'task.input_required',
    auth_required: 'task.auth_required',
    rejected: 'task.rejected',
  };
  return mapping[status];
}

// ============================================================================
// Default HTTP Client
// ============================================================================

/**
 * Create a default HTTP client using fetch
 */
function createDefaultHttpClient(): HttpClient {
  return {
    async post(
      url: string,
      body: string,
      headers: Record<string, string>,
      timeout: number
    ): Promise<HttpResponse> {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body,
          signal: controller.signal,
        });

        // Convert headers to plain object
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        return {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: await response.text(),
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}

// ============================================================================
// Webhook Service Implementation
// ============================================================================

/**
 * A2A Webhook Service
 *
 * Manages webhook subscriptions and delivers notifications for task events.
 * Supports signature verification, exponential backoff retries, and metrics.
 */
export class WebhookService extends EventEmitter {
  private readonly config: Required<Omit<WebhookServiceConfig, 'httpClient'>>;
  private readonly httpClient: HttpClient;
  private readonly subscriptionStore: SubscriptionStore;
  private readonly retryQueue: RetryQueue;

  // Metrics
  private metrics = {
    totalDeliveries: 0,
    successfulDeliveries: 0,
    failedDeliveries: 0,
    totalResponseTimeMs: 0,
    byEvent: {} as Record<WebhookEvent, number>,
  };

  constructor(config: WebhookServiceConfig = {}) {
    super();
    this.config = {
      ...DEFAULT_SERVICE_CONFIG,
      ...config,
    };

    this.httpClient = config.httpClient ?? createDefaultHttpClient();
    this.subscriptionStore = createSubscriptionStore(this.config.subscriptionStoreConfig);
    this.retryQueue = createRetryQueue(this.config.retryQueueConfig);

    // Set up retry queue delivery function
    this.retryQueue.setDeliveryFunction(this.processRetry.bind(this));

    // Forward events
    this.retryQueue.on('success', (e) => this.emit('retrySuccess', e));
    this.retryQueue.on('failed', (e) => this.emit('retryFailed', e));
    this.retryQueue.on('error', (e) => this.emit('error', e));
  }

  // ============================================================================
  // Subscription Management
  // ============================================================================

  /**
   * Create a subscription for a task
   */
  subscribe(
    taskId: string,
    webhookConfig: Partial<WebhookConfig> & { url: string; secret: string },
    options?: { contextId?: string; expiresAt?: Date }
  ): Subscription {
    const fullConfig: WebhookConfig = {
      ...DEFAULT_WEBHOOK_CONFIG,
      ...webhookConfig,
    } as WebhookConfig;

    return this.subscriptionStore.create(taskId, fullConfig, {
      contextId: options?.contextId,
      expiresAt: options?.expiresAt,
    });
  }

  /**
   * Get subscription for a task
   */
  getSubscription(taskId: string): Subscription | null {
    return this.subscriptionStore.getForTask(taskId);
  }

  /**
   * Remove subscription for a task
   */
  unsubscribe(taskId: string): number {
    // Also remove pending retries
    this.retryQueue.removeByTask(taskId);
    return this.subscriptionStore.deleteForTask(taskId);
  }

  /**
   * List subscriptions for a task
   */
  listSubscriptions(taskId: string): Subscription[] {
    return this.subscriptionStore.listByTask(taskId);
  }

  // ============================================================================
  // Delivery
  // ============================================================================

  /**
   * Deliver a webhook notification
   */
  async deliver(
    config: WebhookConfig,
    payload: WebhookPayload
  ): Promise<DeliveryResult> {
    const startTime = Date.now();
    const payloadString = JSON.stringify(payload);

    // Update metrics
    if (this.config.enableMetrics) {
      this.metrics.totalDeliveries++;
      this.metrics.byEvent[payload.event] = (this.metrics.byEvent[payload.event] ?? 0) + 1;
    }

    try {
      const result = await this.attemptDelivery(config, payloadString);
      const responseTimeMs = Date.now() - startTime;

      if (result.success) {
        if (this.config.enableMetrics) {
          this.metrics.successfulDeliveries++;
          this.metrics.totalResponseTimeMs += responseTimeMs;
        }

        return {
          success: true,
          statusCode: result.statusCode,
          responseTimeMs,
          attempts: 1,
          queued: false,
        };
      }

      // Delivery failed - queue for retry if appropriate
      if (this.shouldRetry(result.statusCode)) {
        const delivery = this.retryQueue.enqueueNew({
          subscriptionId: 'direct-delivery',
          taskId: payload.taskId,
          url: config.url,
          secret: config.secret,
          payload: payloadString,
          retryConfig: {
            maxAttempts: config.maxRetries,
            ...this.config.defaultRetryConfig,
          },
          metadata: { event: payload.event },
        });

        return {
          success: false,
          statusCode: result.statusCode,
          error: result.error,
          responseTimeMs,
          attempts: 1,
          queued: true,
          deliveryId: delivery.id,
        };
      }

      // Non-retryable error
      if (this.config.enableMetrics) {
        this.metrics.failedDeliveries++;
      }

      return {
        success: false,
        statusCode: result.statusCode,
        error: result.error,
        responseTimeMs,
        attempts: 1,
        queued: false,
      };
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Queue for retry on network errors
      const delivery = this.retryQueue.enqueueNew({
        subscriptionId: 'direct-delivery',
        taskId: payload.taskId,
        url: config.url,
        secret: config.secret,
        payload: payloadString,
        retryConfig: {
          maxAttempts: config.maxRetries,
          ...this.config.defaultRetryConfig,
        },
        metadata: { event: payload.event },
      });

      return {
        success: false,
        error: errorMessage,
        responseTimeMs,
        attempts: 1,
        queued: true,
        deliveryId: delivery.id,
      };
    }
  }

  /**
   * Deliver with automatic retry
   */
  async deliverWithRetry(
    config: WebhookConfig,
    payload: WebhookPayload
  ): Promise<DeliveryResult> {
    const startTime = Date.now();
    const payloadString = JSON.stringify(payload);
    let attempts = 0;
    let lastResult: { success: boolean; statusCode?: number; error?: string } = {
      success: false,
      error: 'No attempts made',
    };

    const retryConfig = {
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      backoffMultiplier: 2,
      ...this.config.defaultRetryConfig,
      maxAttempts: config.maxRetries, // Must be last to override default
    };
    const { maxAttempts, baseDelayMs, maxDelayMs, backoffMultiplier } = retryConfig;

    while (attempts < maxAttempts) {
      attempts++;

      try {
        lastResult = await this.attemptDelivery(config, payloadString);

        if (lastResult.success) {
          const responseTimeMs = Date.now() - startTime;

          if (this.config.enableMetrics) {
            this.metrics.totalDeliveries++;
            this.metrics.successfulDeliveries++;
            this.metrics.totalResponseTimeMs += responseTimeMs;
            this.metrics.byEvent[payload.event] = (this.metrics.byEvent[payload.event] ?? 0) + 1;
          }

          return {
            success: true,
            statusCode: lastResult.statusCode,
            responseTimeMs,
            attempts,
            queued: false,
          };
        }

        // Check if we should retry
        if (!this.shouldRetry(lastResult.statusCode)) {
          break;
        }

        // Wait before retry with exponential backoff
        if (attempts < maxAttempts) {
          const delay = Math.min(
            baseDelayMs * Math.pow(backoffMultiplier, attempts - 1),
            maxDelayMs
          );
          await this.sleep(delay);
        }
      } catch (error) {
        lastResult = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };

        // Wait before retry for network errors
        if (attempts < maxAttempts) {
          const delay = Math.min(
            baseDelayMs * Math.pow(backoffMultiplier, attempts - 1),
            maxDelayMs
          );
          await this.sleep(delay);
        }
      }
    }

    // All attempts failed
    const responseTimeMs = Date.now() - startTime;

    if (this.config.enableMetrics) {
      this.metrics.totalDeliveries++;
      this.metrics.failedDeliveries++;
    }

    return {
      success: false,
      statusCode: lastResult.statusCode,
      error: lastResult.error,
      responseTimeMs,
      attempts,
      queued: false,
    };
  }

  /**
   * Notify subscribers of a task event
   */
  async notifySubscribers(
    taskId: string,
    event: WebhookEvent,
    data: WebhookEventData,
    contextId?: string
  ): Promise<Map<string, DeliveryResult>> {
    const results = new Map<string, DeliveryResult>();
    const subscribers = this.subscriptionStore.getSubscribersForEvent(taskId, event);

    if (subscribers.length === 0) {
      return results;
    }

    const payload: WebhookPayload = {
      event,
      taskId,
      contextId,
      timestamp: new Date().toISOString(),
      data,
    };

    // Deliver to all subscribers in parallel
    const deliveryPromises = subscribers.map(async (subscription) => {
      const result = await this.deliver(subscription.webhookConfig, payload);

      // Update subscription stats
      if (result.success) {
        this.subscriptionStore.recordSuccess(subscription.id);
      } else {
        this.subscriptionStore.recordFailure(
          subscription.id,
          result.error ?? 'Unknown error'
        );
      }

      return { subscriptionId: subscription.id, result };
    });

    const deliveryResults = await Promise.allSettled(deliveryPromises);

    for (const settledResult of deliveryResults) {
      if (settledResult.status === 'fulfilled') {
        results.set(settledResult.value.subscriptionId, settledResult.value.result);
      }
    }

    return results;
  }

  /**
   * Notify subscribers of a task state change
   */
  async notifyStateChange(
    taskId: string,
    newStatus: TaskStatus,
    previousStatus?: TaskStatus,
    error?: { message: string; code?: string },
    contextId?: string
  ): Promise<Map<string, DeliveryResult>> {
    const event = statusToEvent(newStatus);
    const data: WebhookEventData = {
      status: newStatus,
      previousStatus,
      error,
    };

    return this.notifySubscribers(taskId, event, data, contextId);
  }

  /**
   * Notify subscribers of artifact creation
   */
  async notifyArtifactCreated(
    taskId: string,
    artifact: {
      id: string;
      name: string;
      mimeType?: string;
      size?: number;
    },
    contextId?: string
  ): Promise<Map<string, DeliveryResult>> {
    const data: WebhookEventData = {
      artifact,
    };

    return this.notifySubscribers(taskId, 'task.artifact_created', data, contextId);
  }

  // ============================================================================
  // Metrics
  // ============================================================================

  /**
   * Get service metrics
   */
  getMetrics(): WebhookMetrics {
    const subscriptionStats = this.subscriptionStore.getStats();
    const queueStats = this.retryQueue.getStats();

    return {
      totalDeliveries: this.metrics.totalDeliveries,
      successfulDeliveries: this.metrics.successfulDeliveries,
      failedDeliveries: this.metrics.failedDeliveries,
      avgResponseTimeMs:
        this.metrics.successfulDeliveries > 0
          ? this.metrics.totalResponseTimeMs / this.metrics.successfulDeliveries
          : 0,
      successRate:
        this.metrics.totalDeliveries > 0
          ? this.metrics.successfulDeliveries / this.metrics.totalDeliveries
          : 0,
      byEvent: { ...this.metrics.byEvent } as Record<WebhookEvent, number>,
      activeSubscriptions: subscriptionStats.byStatus.active,
      retryQueueSize: queueStats.totalItems,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      totalResponseTimeMs: 0,
      byEvent: {} as Record<WebhookEvent, number>,
    };
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Get subscription store for direct access
   */
  getSubscriptionStore(): SubscriptionStore {
    return this.subscriptionStore;
  }

  /**
   * Get retry queue for direct access
   */
  getRetryQueue(): RetryQueue {
    return this.retryQueue;
  }

  /**
   * Destroy the service
   */
  destroy(): void {
    this.subscriptionStore.destroy();
    this.retryQueue.destroy();
    this.removeAllListeners();
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Attempt a single delivery
   */
  private async attemptDelivery(
    config: WebhookConfig,
    payloadString: string
  ): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const timestamp = Date.now();
    const signatureHeader = generateSignatureHeader(payloadString, config.secret, timestamp);

    const headers: Record<string, string> = {
      [SIGNATURE_HEADER]: signatureHeader,
      'User-Agent': this.config.userAgent,
      'Content-Type': 'application/json',
      'X-A2A-Timestamp': timestamp.toString(),
    };

    try {
      const response = await this.httpClient.post(
        config.url,
        payloadString,
        headers,
        config.timeout
      );

      const success = response.status >= 200 && response.status < 300;

      return {
        success,
        statusCode: response.status,
        error: success ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Process a retry from the queue
   */
  private async processRetry(delivery: PendingDelivery): Promise<DeliveryAttemptResult> {
    const config: WebhookConfig = {
      url: delivery.url,
      secret: delivery.secret,
      events: [], // Not used for retry
      timeout: this.config.defaultTimeoutMs,
      maxRetries: delivery.retryConfig.maxAttempts,
    };

    const startTime = Date.now();
    const result = await this.attemptDelivery(config, delivery.payload);
    const responseTimeMs = Date.now() - startTime;

    if (result.success) {
      if (this.config.enableMetrics) {
        this.metrics.successfulDeliveries++;
        this.metrics.totalResponseTimeMs += responseTimeMs;
      }

      // Update subscription stats if we have a subscription ID
      if (delivery.subscriptionId !== 'direct-delivery') {
        this.subscriptionStore.recordSuccess(delivery.subscriptionId);
      }
    }

    return {
      success: result.success,
      statusCode: result.statusCode,
      error: result.error,
      responseTimeMs,
      shouldRetry: !result.success && this.shouldRetry(result.statusCode),
    };
  }

  /**
   * Check if a status code is retryable
   */
  private shouldRetry(statusCode?: number): boolean {
    if (statusCode === undefined) {
      // Network error - retry
      return true;
    }

    // Retry on 5xx errors and rate limiting
    return statusCode >= 500 || statusCode === 429;
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new webhook service
 */
export function createWebhookService(config: WebhookServiceConfig = {}): WebhookService {
  return new WebhookService(config);
}
