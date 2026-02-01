/**
 * A2A Push Notifications Module
 *
 * Provides webhook-based push notifications for A2A task events.
 * Implements the A2A protocol's pushNotifications capability.
 *
 * @module adapters/a2a/notifications
 * @see https://a2a-protocol.org/latest/specification/
 *
 * @example
 * ```typescript
 * import {
 *   createWebhookService,
 *   generateSignatureHeader,
 *   verifySignature,
 * } from './notifications';
 *
 * // Create webhook service
 * const webhookService = createWebhookService();
 *
 * // Subscribe to task notifications
 * webhookService.subscribe('task-123', {
 *   url: 'https://example.com/webhooks/a2a',
 *   secret: 'webhook-secret',
 *   events: ['task.completed', 'task.failed'],
 *   timeout: 30000,
 *   maxRetries: 5,
 * });
 *
 * // Notify on state change
 * await webhookService.notifyStateChange('task-123', 'completed', 'working');
 *
 * // Verify incoming webhook signature (on receiver side)
 * const result = verifySignature(
 *   requestBody,
 *   request.headers['X-A2A-Signature'],
 *   'webhook-secret'
 * );
 * if (!result.valid) {
 *   throw new Error(result.error);
 * }
 * ```
 */

// ============================================================================
// Signature Utilities
// ============================================================================

export {
  SIGNATURE_HEADER,
  SIGNATURE_VERSION,
  DEFAULT_MAX_AGE_MS,
  MIN_TIMESTAMP,
  type ParsedSignature,
  type VerificationResult,
  generateSignature,
  generateSignatureHeader,
  parseSignatureHeader,
  verifySignature,
  isValidSignature,
} from './signature.js';

// ============================================================================
// Subscription Store
// ============================================================================

export {
  type SubscriptionStatus,
  type Subscription,
  type CreateSubscriptionOptions,
  type UpdateSubscriptionOptions,
  type SubscriptionQueryOptions,
  type SubscriptionStats,
  type SubscriptionStoreConfig,
  DEFAULT_SUBSCRIPTION_STORE_CONFIG,
  SubscriptionStore,
  createSubscriptionStore,
} from './subscription-store.js';

// ============================================================================
// Retry Queue
// ============================================================================

export {
  type RetryConfig,
  type PendingDelivery,
  type DeliveryAttemptResult,
  type QueueStats,
  type RetryQueueConfig,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_QUEUE_CONFIG,
  RetryQueue,
  createRetryQueue,
} from './retry-queue.js';

// ============================================================================
// Webhook Service
// ============================================================================

export {
  type WebhookEvent,
  type WebhookConfig,
  type WebhookPayload,
  type WebhookEventData,
  type DeliveryResult,
  type WebhookServiceConfig,
  type HttpClient,
  type HttpResponse,
  type WebhookMetrics,
  DEFAULT_WEBHOOK_CONFIG,
  DEFAULT_SERVICE_CONFIG,
  statusToEvent,
  WebhookService,
  createWebhookService,
} from './webhook-service.js';

// ============================================================================
// Convenience Types
// ============================================================================

/**
 * All webhook event types
 */
export const WEBHOOK_EVENTS = [
  'task.submitted',
  'task.working',
  'task.completed',
  'task.failed',
  'task.canceled',
  'task.input_required',
  'task.auth_required',
  'task.rejected',
  'task.artifact_created',
] as const;

/**
 * Task state change events
 */
export const STATE_CHANGE_EVENTS = [
  'task.submitted',
  'task.working',
  'task.completed',
  'task.failed',
  'task.canceled',
  'task.input_required',
  'task.auth_required',
  'task.rejected',
] as const;

/**
 * Terminal state events (task is complete)
 */
export const TERMINAL_EVENTS = [
  'task.completed',
  'task.failed',
  'task.canceled',
  'task.rejected',
] as const;
