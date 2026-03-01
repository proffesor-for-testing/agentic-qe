/**
 * A2A Webhook Subscription Store
 *
 * Manages webhook subscriptions for task notifications with CRUD operations,
 * statistics tracking, and automatic cleanup of expired subscriptions.
 *
 * @module adapters/a2a/notifications/subscription-store
 * @see https://a2a-protocol.org/latest/specification/
 */

import { randomUUID } from 'crypto';
import type { WebhookConfig, WebhookEvent } from './webhook-service.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Webhook subscription status
 */
export type SubscriptionStatus = 'active' | 'paused' | 'failed' | 'expired';

/**
 * Webhook subscription record
 */
export interface Subscription {
  /** Unique subscription identifier */
  readonly id: string;
  /** Task ID this subscription is for */
  readonly taskId: string;
  /** Context ID (optional, for multi-turn subscriptions) */
  readonly contextId?: string;
  /** Webhook configuration */
  readonly webhookConfig: WebhookConfig;
  /** Current subscription status */
  status: SubscriptionStatus;
  /** Subscription creation timestamp */
  readonly createdAt: Date;
  /** Last delivery attempt timestamp */
  lastDeliveryAt?: Date;
  /** Last successful delivery timestamp */
  lastSuccessAt?: Date;
  /** Total number of delivery attempts */
  deliveryCount: number;
  /** Number of failed deliveries */
  failureCount: number;
  /** Consecutive failure count (resets on success) */
  consecutiveFailures: number;
  /** Last error message */
  lastError?: string;
  /** Subscription expiration timestamp */
  expiresAt?: Date;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Subscription creation options
 */
export interface CreateSubscriptionOptions {
  /** Explicit subscription ID (auto-generated if not provided) */
  id?: string;
  /** Context ID for multi-turn conversations */
  contextId?: string;
  /** Subscription expiration time */
  expiresAt?: Date;
  /** Initial metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Subscription update options
 */
export interface UpdateSubscriptionOptions {
  /** Update status */
  status?: SubscriptionStatus;
  /** Update webhook config */
  webhookConfig?: Partial<WebhookConfig>;
  /** Update last delivery timestamp */
  lastDeliveryAt?: Date;
  /** Update last success timestamp */
  lastSuccessAt?: Date;
  /** Increment delivery count */
  incrementDeliveryCount?: boolean;
  /** Increment failure count */
  incrementFailureCount?: boolean;
  /** Set consecutive failures */
  consecutiveFailures?: number;
  /** Update last error */
  lastError?: string | null;
  /** Update expiration */
  expiresAt?: Date | null;
  /** Merge metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Subscription query options
 */
export interface SubscriptionQueryOptions {
  /** Filter by task ID */
  taskId?: string;
  /** Filter by context ID */
  contextId?: string;
  /** Filter by status */
  status?: SubscriptionStatus | SubscriptionStatus[];
  /** Filter by event type */
  event?: WebhookEvent;
  /** Maximum results */
  limit?: number;
  /** Pagination offset */
  offset?: number;
  /** Include expired subscriptions */
  includeExpired?: boolean;
}

/**
 * Subscription store statistics
 */
export interface SubscriptionStats {
  /** Total subscriptions */
  total: number;
  /** Subscriptions by status */
  byStatus: Record<SubscriptionStatus, number>;
  /** Total deliveries attempted */
  totalDeliveries: number;
  /** Total failed deliveries */
  totalFailures: number;
  /** Unique tasks with subscriptions */
  uniqueTasks: number;
  /** Unique contexts with subscriptions */
  uniqueContexts: number;
}

/**
 * Store configuration
 */
export interface SubscriptionStoreConfig {
  /** Maximum subscriptions per task */
  maxSubscriptionsPerTask?: number;
  /** Maximum total subscriptions */
  maxTotalSubscriptions?: number;
  /** Default subscription TTL in milliseconds */
  defaultTtlMs?: number;
  /** Consecutive failures before marking failed */
  maxConsecutiveFailures?: number;
  /** Enable automatic cleanup of expired/failed subscriptions */
  enableAutoCleanup?: boolean;
  /** Cleanup interval in milliseconds */
  cleanupIntervalMs?: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_SUBSCRIPTION_STORE_CONFIG: Required<SubscriptionStoreConfig> = {
  maxSubscriptionsPerTask: 10,
  maxTotalSubscriptions: 10000,
  defaultTtlMs: 24 * 60 * 60 * 1000, // 24 hours
  maxConsecutiveFailures: 10,
  enableAutoCleanup: true,
  cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
};

// ============================================================================
// Subscription Store Implementation
// ============================================================================

/**
 * In-memory subscription store with indexing and automatic cleanup
 */
export class SubscriptionStore {
  private readonly config: Required<SubscriptionStoreConfig>;
  private readonly subscriptions: Map<string, Subscription> = new Map();
  private readonly taskIndex: Map<string, Set<string>> = new Map();
  private readonly contextIndex: Map<string, Set<string>> = new Map();
  private readonly statusIndex: Map<SubscriptionStatus, Set<string>> = new Map();
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(config: SubscriptionStoreConfig = {}) {
    this.config = { ...DEFAULT_SUBSCRIPTION_STORE_CONFIG, ...config };

    // Initialize status index
    const statuses: SubscriptionStatus[] = ['active', 'paused', 'failed', 'expired'];
    for (const status of statuses) {
      this.statusIndex.set(status, new Set());
    }

    // Start cleanup timer if enabled
    if (this.config.enableAutoCleanup && this.config.cleanupIntervalMs > 0) {
      this.startCleanupTimer();
    }
  }

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  /**
   * Create a new subscription
   */
  create(
    taskId: string,
    webhookConfig: WebhookConfig,
    options: CreateSubscriptionOptions = {}
  ): Subscription {
    // Check capacity
    if (this.subscriptions.size >= this.config.maxTotalSubscriptions) {
      throw new Error(`Maximum subscription limit reached: ${this.config.maxTotalSubscriptions}`);
    }

    // Check per-task limit
    const taskSubs = this.taskIndex.get(taskId);
    if (taskSubs && taskSubs.size >= this.config.maxSubscriptionsPerTask) {
      throw new Error(`Maximum subscriptions per task reached: ${this.config.maxSubscriptionsPerTask}`);
    }

    const now = new Date();
    const id = options.id ?? this.generateId();

    // Check for duplicate
    if (this.subscriptions.has(id)) {
      throw new Error(`Subscription with ID ${id} already exists`);
    }

    const subscription: Subscription = {
      id,
      taskId,
      contextId: options.contextId,
      webhookConfig,
      status: 'active',
      createdAt: now,
      deliveryCount: 0,
      failureCount: 0,
      consecutiveFailures: 0,
      expiresAt: options.expiresAt ?? new Date(now.getTime() + this.config.defaultTtlMs),
      metadata: options.metadata,
    };

    // Store subscription
    this.subscriptions.set(id, subscription);

    // Update indices
    this.addToTaskIndex(taskId, id);
    if (options.contextId) {
      this.addToContextIndex(options.contextId, id);
    }
    this.statusIndex.get('active')?.add(id);

    return subscription;
  }

  /**
   * Get a subscription by ID
   */
  get(subscriptionId: string): Subscription | null {
    return this.subscriptions.get(subscriptionId) ?? null;
  }

  /**
   * Get a subscription for a specific task (first active one)
   */
  getForTask(taskId: string): Subscription | null {
    const subIds = this.taskIndex.get(taskId);
    if (!subIds) {
      return null;
    }

    // Return first active subscription
    for (const id of subIds) {
      const sub = this.subscriptions.get(id);
      if (sub && sub.status === 'active') {
        return sub;
      }
    }

    return null;
  }

  /**
   * Check if a subscription exists
   */
  has(subscriptionId: string): boolean {
    return this.subscriptions.has(subscriptionId);
  }

  /**
   * Update a subscription
   */
  update(subscriptionId: string, updates: UpdateSubscriptionOptions): Subscription | null {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return null;
    }

    const oldStatus = subscription.status;

    // Apply updates
    if (updates.status !== undefined) {
      subscription.status = updates.status;
    }
    if (updates.webhookConfig) {
      Object.assign(subscription.webhookConfig, updates.webhookConfig);
    }
    if (updates.lastDeliveryAt !== undefined) {
      subscription.lastDeliveryAt = updates.lastDeliveryAt;
    }
    if (updates.lastSuccessAt !== undefined) {
      subscription.lastSuccessAt = updates.lastSuccessAt;
    }
    if (updates.incrementDeliveryCount) {
      subscription.deliveryCount++;
    }
    if (updates.incrementFailureCount) {
      subscription.failureCount++;
    }
    if (updates.consecutiveFailures !== undefined) {
      subscription.consecutiveFailures = updates.consecutiveFailures;
    }
    if (updates.lastError !== undefined) {
      subscription.lastError = updates.lastError ?? undefined;
    }
    if (updates.expiresAt !== undefined) {
      subscription.expiresAt = updates.expiresAt ?? undefined;
    }
    if (updates.metadata) {
      subscription.metadata = { ...subscription.metadata, ...updates.metadata };
    }

    // Update status index if changed
    if (updates.status !== undefined && oldStatus !== updates.status) {
      this.statusIndex.get(oldStatus)?.delete(subscriptionId);
      this.statusIndex.get(updates.status)?.add(subscriptionId);
    }

    // Check for auto-fail on consecutive failures
    if (
      subscription.consecutiveFailures >= this.config.maxConsecutiveFailures &&
      subscription.status === 'active'
    ) {
      subscription.status = 'failed';
      this.statusIndex.get('active')?.delete(subscriptionId);
      this.statusIndex.get('failed')?.add(subscriptionId);
    }

    return subscription;
  }

  /**
   * Record a successful delivery
   */
  recordSuccess(subscriptionId: string): Subscription | null {
    const now = new Date();
    return this.update(subscriptionId, {
      lastDeliveryAt: now,
      lastSuccessAt: now,
      incrementDeliveryCount: true,
      consecutiveFailures: 0,
      lastError: null,
    });
  }

  /**
   * Record a failed delivery
   */
  recordFailure(subscriptionId: string, error: string): Subscription | null {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return null;
    }

    return this.update(subscriptionId, {
      lastDeliveryAt: new Date(),
      incrementDeliveryCount: true,
      incrementFailureCount: true,
      consecutiveFailures: subscription.consecutiveFailures + 1,
      lastError: error,
    });
  }

  /**
   * Delete a subscription
   */
  delete(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    // Remove from indices
    this.removeFromTaskIndex(subscription.taskId, subscriptionId);
    if (subscription.contextId) {
      this.removeFromContextIndex(subscription.contextId, subscriptionId);
    }
    this.statusIndex.get(subscription.status)?.delete(subscriptionId);

    // Remove subscription
    this.subscriptions.delete(subscriptionId);

    return true;
  }

  /**
   * Delete all subscriptions for a task
   */
  deleteForTask(taskId: string): number {
    const subIds = this.taskIndex.get(taskId);
    if (!subIds) {
      return 0;
    }

    let deleted = 0;
    for (const id of [...subIds]) {
      if (this.delete(id)) {
        deleted++;
      }
    }

    return deleted;
  }

  // ============================================================================
  // Query Operations
  // ============================================================================

  /**
   * List subscriptions for a task
   */
  listByTask(taskId: string): Subscription[] {
    const subIds = this.taskIndex.get(taskId);
    if (!subIds) {
      return [];
    }

    return [...subIds]
      .map((id) => this.subscriptions.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * List subscriptions for a context
   */
  listByContext(contextId: string): Subscription[] {
    const subIds = this.contextIndex.get(contextId);
    if (!subIds) {
      return [];
    }

    return [...subIds]
      .map((id) => this.subscriptions.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * List active subscriptions for a task
   */
  listActiveByTask(taskId: string): Subscription[] {
    return this.listByTask(taskId).filter((s) => s.status === 'active');
  }

  /**
   * Query subscriptions with filtering
   */
  query(options: SubscriptionQueryOptions = {}): Subscription[] {
    let results: Subscription[] = [...this.subscriptions.values()];

    // Filter by task
    if (options.taskId) {
      const taskSubIds = this.taskIndex.get(options.taskId);
      if (!taskSubIds) {
        return [];
      }
      results = results.filter((s) => taskSubIds.has(s.id));
    }

    // Filter by context
    if (options.contextId) {
      const contextSubIds = this.contextIndex.get(options.contextId);
      if (!contextSubIds) {
        return [];
      }
      results = results.filter((s) => contextSubIds.has(s.id));
    }

    // Filter by status
    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      results = results.filter((s) => statuses.includes(s.status));
    }

    // Filter by event
    if (options.event) {
      results = results.filter((s) => s.webhookConfig.events.includes(options.event!));
    }

    // Filter expired unless explicitly included
    if (!options.includeExpired) {
      const now = new Date();
      results = results.filter((s) => !s.expiresAt || s.expiresAt > now);
    }

    // Sort by creation time (newest first)
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;

    return results.slice(offset, offset + limit);
  }

  /**
   * Get all active subscriptions that should receive a specific event
   */
  getSubscribersForEvent(taskId: string, event: WebhookEvent): Subscription[] {
    const subs = this.listActiveByTask(taskId);
    const now = new Date();

    return subs.filter((s) => {
      // Check expiration
      if (s.expiresAt && s.expiresAt <= now) {
        return false;
      }
      // Check if subscribed to this event
      return s.webhookConfig.events.includes(event);
    });
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get subscription statistics
   */
  getStats(): SubscriptionStats {
    const byStatus: Record<SubscriptionStatus, number> = {
      active: 0,
      paused: 0,
      failed: 0,
      expired: 0,
    };

    let totalDeliveries = 0;
    let totalFailures = 0;

    for (const [status, ids] of this.statusIndex) {
      byStatus[status] = ids.size;
    }

    for (const sub of this.subscriptions.values()) {
      totalDeliveries += sub.deliveryCount;
      totalFailures += sub.failureCount;
    }

    return {
      total: this.subscriptions.size,
      byStatus,
      totalDeliveries,
      totalFailures,
      uniqueTasks: this.taskIndex.size,
      uniqueContexts: this.contextIndex.size,
    };
  }

  /**
   * Get total subscription count
   */
  get size(): number {
    return this.subscriptions.size;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clean up expired subscriptions
   */
  cleanupExpired(): number {
    const now = new Date();
    const expiredIds: string[] = [];

    for (const [id, sub] of this.subscriptions) {
      if (sub.expiresAt && sub.expiresAt <= now) {
        expiredIds.push(id);
      }
    }

    for (const id of expiredIds) {
      const sub = this.subscriptions.get(id);
      if (sub) {
        sub.status = 'expired';
        this.statusIndex.get('active')?.delete(id);
        this.statusIndex.get('expired')?.add(id);
      }
      this.delete(id);
    }

    return expiredIds.length;
  }

  /**
   * Clean up failed subscriptions
   */
  cleanupFailed(): number {
    const failedIds = [...(this.statusIndex.get('failed') ?? [])];
    let deleted = 0;

    for (const id of failedIds) {
      if (this.delete(id)) {
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Clear all subscriptions
   */
  clear(): void {
    this.subscriptions.clear();
    this.taskIndex.clear();
    this.contextIndex.clear();
    for (const ids of this.statusIndex.values()) {
      ids.clear();
    }
  }

  /**
   * Destroy the store
   */
  destroy(): void {
    this.stopCleanupTimer();
    this.clear();
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private generateId(): string {
    return `sub-${Date.now()}-${randomUUID().split('-')[0]}`;
  }

  private addToTaskIndex(taskId: string, subscriptionId: string): void {
    let taskSubs = this.taskIndex.get(taskId);
    if (!taskSubs) {
      taskSubs = new Set();
      this.taskIndex.set(taskId, taskSubs);
    }
    taskSubs.add(subscriptionId);
  }

  private removeFromTaskIndex(taskId: string, subscriptionId: string): void {
    const taskSubs = this.taskIndex.get(taskId);
    if (taskSubs) {
      taskSubs.delete(subscriptionId);
      if (taskSubs.size === 0) {
        this.taskIndex.delete(taskId);
      }
    }
  }

  private addToContextIndex(contextId: string, subscriptionId: string): void {
    let contextSubs = this.contextIndex.get(contextId);
    if (!contextSubs) {
      contextSubs = new Set();
      this.contextIndex.set(contextId, contextSubs);
    }
    contextSubs.add(subscriptionId);
  }

  private removeFromContextIndex(contextId: string, subscriptionId: string): void {
    const contextSubs = this.contextIndex.get(contextId);
    if (contextSubs) {
      contextSubs.delete(subscriptionId);
      if (contextSubs.size === 0) {
        this.contextIndex.delete(contextId);
      }
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, this.config.cleanupIntervalMs);

    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new subscription store
 */
export function createSubscriptionStore(config: SubscriptionStoreConfig = {}): SubscriptionStore {
  return new SubscriptionStore(config);
}
