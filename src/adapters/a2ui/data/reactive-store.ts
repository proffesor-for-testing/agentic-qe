/**
 * Reactive Data Store
 *
 * Provides a reactive data store with path-specific subscriptions,
 * change detection, and batch updates for A2UI data binding.
 *
 * @module adapters/a2ui/data/reactive-store
 */

import {
  resolvePointer,
  setAtPointer,
  deleteAtPointer,
  isParentPointer,
  parseJsonPointer,
  buildJsonPointer,
  pointerExists,
} from './json-pointer-resolver.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Callback for store change notifications
 */
export type ChangeCallback<T = unknown> = (value: T, previousValue: T | undefined) => void;

/**
 * Callback for global change notifications
 */
export type GlobalChangeCallback = (
  data: Record<string, unknown>,
  changes: StoreChange[]
) => void;

/**
 * Store change record
 */
export interface StoreChange {
  /** The JSON Pointer path that changed */
  readonly path: string;
  /** The new value */
  readonly newValue: unknown;
  /** The previous value */
  readonly previousValue: unknown;
  /** Type of change */
  readonly type: 'set' | 'delete' | 'batch';
}

/**
 * Batch update operation
 */
export interface BatchUpdate {
  /** JSON Pointer path */
  readonly pointer: string;
  /** Value to set (undefined for delete) */
  readonly value: unknown;
  /** Operation type */
  readonly operation?: 'set' | 'delete';
}

/**
 * Subscription handle for unsubscribing
 */
export interface Subscription {
  /** Unsubscribe from changes */
  unsubscribe: () => void;
}

/**
 * Reactive store configuration
 */
export interface ReactiveStoreConfig {
  /** Initial data */
  readonly initialData?: Record<string, unknown>;
  /** Whether to deep clone data on get/set (default: true) */
  readonly deepClone?: boolean;
  /** Whether to emit changes synchronously (default: true) */
  readonly synchronous?: boolean;
  /** Debounce time for async notifications (ms) */
  readonly debounceMs?: number;
}

/**
 * Interface for reactive data store
 */
export interface IReactiveStore {
  /** Get entire data object */
  getData(): Record<string, unknown>;
  /** Set entire data object */
  setData(data: Record<string, unknown>): void;
  /** Get value at path */
  getAt<T>(pointer: string): T | undefined;
  /** Set value at path */
  setAt(pointer: string, value: unknown): void;
  /** Delete value at path */
  deleteAt(pointer: string): boolean;
  /** Check if path exists */
  has(pointer: string): boolean;
  /** Subscribe to changes at path */
  subscribe<T>(pointer: string, callback: ChangeCallback<T>): Subscription;
  /** Subscribe to any change */
  subscribeAll(callback: GlobalChangeCallback): Subscription;
  /** Batch multiple updates with single notification */
  batch(updates: BatchUpdate[]): void;
  /** Get current subscription count */
  getSubscriptionCount(): number;
  /** Clear all data and subscriptions */
  clear(): void;
}

// ============================================================================
// Internal Types
// ============================================================================

interface PathSubscription {
  pointer: string;
  callback: ChangeCallback;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Reactive Data Store
 *
 * Provides a reactive store with:
 * - Path-specific subscriptions using JSON Pointers
 * - Change detection and notification
 * - Batch updates for performance
 * - Global change subscriptions
 */
export class ReactiveStore implements IReactiveStore {
  private data: Record<string, unknown>;
  private readonly config: Required<ReactiveStoreConfig>;
  private readonly pathSubscriptions: Map<string, Set<PathSubscription>> = new Map();
  private readonly globalSubscriptions: Set<GlobalChangeCallback> = new Set();
  private subscriptionIdCounter = 0;
  private pendingNotifications: StoreChange[] = [];
  private notificationTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: ReactiveStoreConfig = {}) {
    this.config = {
      initialData: {},
      deepClone: true,
      synchronous: true,
      debounceMs: 16,
      ...config,
    };

    this.data = this.config.deepClone
      ? this.deepClone(this.config.initialData || {})
      : { ...(this.config.initialData || {}) };
  }

  /**
   * Get the entire data object
   *
   * @returns Copy of the data object (or reference if deepClone is false)
   */
  getData(): Record<string, unknown> {
    return this.config.deepClone ? this.deepClone(this.data) : this.data;
  }

  /**
   * Set the entire data object
   *
   * @param data - New data object
   */
  setData(data: Record<string, unknown>): void {
    const previousData = this.data;
    this.data = this.config.deepClone ? this.deepClone(data) : { ...data };

    const changes: StoreChange[] = [{
      path: '',
      newValue: this.data,
      previousValue: previousData,
      type: 'set',
    }];

    this.notifyChanges(changes);
  }

  /**
   * Get value at a specific path
   *
   * @param pointer - JSON Pointer path
   * @returns Value at path, or undefined if not found
   */
  getAt<T>(pointer: string): T | undefined {
    const value = resolvePointer<T>(this.data, pointer);
    if (value === undefined) {
      return undefined;
    }
    return this.config.deepClone ? this.deepClone(value) : value;
  }

  /**
   * Set value at a specific path
   *
   * @param pointer - JSON Pointer path
   * @param value - Value to set
   */
  setAt(pointer: string, value: unknown): void {
    const previousValue = resolvePointer(this.data, pointer);
    const clonedValue = this.config.deepClone ? this.deepClone(value) : value;

    setAtPointer(this.data, pointer, clonedValue);

    const changes: StoreChange[] = [{
      path: pointer,
      newValue: clonedValue,
      previousValue,
      type: 'set',
    }];

    this.notifyChanges(changes);
  }

  /**
   * Delete value at a specific path
   *
   * @param pointer - JSON Pointer path
   * @returns True if value was deleted
   */
  deleteAt(pointer: string): boolean {
    const previousValue = resolvePointer(this.data, pointer);
    if (previousValue === undefined) {
      return false;
    }

    const deleted = deleteAtPointer(this.data, pointer);
    if (!deleted) {
      return false;
    }

    const changes: StoreChange[] = [{
      path: pointer,
      newValue: undefined,
      previousValue,
      type: 'delete',
    }];

    this.notifyChanges(changes);
    return true;
  }

  /**
   * Check if a path exists in the data
   *
   * @param pointer - JSON Pointer path
   * @returns True if path exists
   */
  has(pointer: string): boolean {
    return pointerExists(this.data, pointer);
  }

  /**
   * Subscribe to changes at a specific path
   *
   * The callback will be invoked when:
   * - The exact path changes
   * - A parent path changes (which affects this path)
   * - A child path changes (if watching an object/array)
   *
   * @param pointer - JSON Pointer path to watch
   * @param callback - Callback invoked on change
   * @returns Subscription handle with unsubscribe method
   */
  subscribe<T>(pointer: string, callback: ChangeCallback<T>): Subscription {
    const subscription: PathSubscription = {
      pointer,
      callback: callback as ChangeCallback,
    };

    // Get or create subscription set for this path
    let subscriptions = this.pathSubscriptions.get(pointer);
    if (!subscriptions) {
      subscriptions = new Set();
      this.pathSubscriptions.set(pointer, subscriptions);
    }
    subscriptions.add(subscription);

    // Return unsubscribe handle
    return {
      unsubscribe: () => {
        const subs = this.pathSubscriptions.get(pointer);
        if (subs) {
          subs.delete(subscription);
          if (subs.size === 0) {
            this.pathSubscriptions.delete(pointer);
          }
        }
      },
    };
  }

  /**
   * Subscribe to any change in the store
   *
   * @param callback - Callback invoked on any change
   * @returns Subscription handle with unsubscribe method
   */
  subscribeAll(callback: GlobalChangeCallback): Subscription {
    this.globalSubscriptions.add(callback);

    return {
      unsubscribe: () => {
        this.globalSubscriptions.delete(callback);
      },
    };
  }

  /**
   * Batch multiple updates with a single notification
   *
   * Updates are applied in order, and subscribers are notified once
   * after all updates are complete.
   *
   * @param updates - Array of updates to apply
   */
  batch(updates: BatchUpdate[]): void {
    const changes: StoreChange[] = [];

    for (const update of updates) {
      const previousValue = resolvePointer(this.data, update.pointer);

      if (update.operation === 'delete' || update.value === undefined) {
        const deleted = deleteAtPointer(this.data, update.pointer);
        if (deleted) {
          changes.push({
            path: update.pointer,
            newValue: undefined,
            previousValue,
            type: 'delete',
          });
        }
      } else {
        const clonedValue = this.config.deepClone
          ? this.deepClone(update.value)
          : update.value;
        setAtPointer(this.data, update.pointer, clonedValue);
        changes.push({
          path: update.pointer,
          newValue: clonedValue,
          previousValue,
          type: 'batch',
        });
      }
    }

    if (changes.length > 0) {
      this.notifyChanges(changes);
    }
  }

  /**
   * Get the current number of subscriptions
   */
  getSubscriptionCount(): number {
    let count = this.globalSubscriptions.size;
    for (const subs of this.pathSubscriptions.values()) {
      count += subs.size;
    }
    return count;
  }

  /**
   * Clear all data and subscriptions
   */
  clear(): void {
    this.data = {};
    this.pathSubscriptions.clear();
    this.globalSubscriptions.clear();
    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout);
      this.notificationTimeout = null;
    }
    this.pendingNotifications = [];
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Notify subscribers of changes
   */
  private notifyChanges(changes: StoreChange[]): void {
    if (this.config.synchronous) {
      this.processNotifications(changes);
    } else {
      this.pendingNotifications.push(...changes);
      this.scheduleNotifications();
    }
  }

  /**
   * Schedule asynchronous notifications
   */
  private scheduleNotifications(): void {
    if (this.notificationTimeout !== null) {
      return;
    }

    this.notificationTimeout = setTimeout(() => {
      this.notificationTimeout = null;
      const changes = this.pendingNotifications;
      this.pendingNotifications = [];
      this.processNotifications(changes);
    }, this.config.debounceMs);
  }

  /**
   * Process and dispatch notifications
   */
  private processNotifications(changes: StoreChange[]): void {
    // Notify global subscribers
    if (this.globalSubscriptions.size > 0) {
      const data = this.getData();
      for (const callback of this.globalSubscriptions) {
        try {
          callback(data, changes);
        } catch (error) {
          console.error('Error in global subscription callback:', error);
        }
      }
    }

    // Notify path-specific subscribers
    const notifiedSubscriptions = new Set<PathSubscription>();

    for (const change of changes) {
      // Find all subscriptions that should be notified for this change
      for (const [subscribedPath, subscriptions] of this.pathSubscriptions) {
        if (this.shouldNotifyPath(subscribedPath, change.path)) {
          for (const sub of subscriptions) {
            if (!notifiedSubscriptions.has(sub)) {
              notifiedSubscriptions.add(sub);
              try {
                const currentValue = resolvePointer(this.data, sub.pointer);
                // For path subscriptions, we provide the value at their subscribed path
                sub.callback(
                  this.config.deepClone ? this.deepClone(currentValue) : currentValue,
                  change.previousValue
                );
              } catch (error) {
                console.error('Error in path subscription callback:', error);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Check if a subscribed path should be notified for a change at a given path
   */
  private shouldNotifyPath(subscribedPath: string, changedPath: string): boolean {
    // Root subscription gets all changes
    if (subscribedPath === '') {
      return true;
    }

    // Exact match
    if (subscribedPath === changedPath) {
      return true;
    }

    // Changed path is a parent of subscribed path
    // (e.g., subscribed to /a/b, changed /a)
    if (isParentPointer(changedPath, subscribedPath)) {
      return true;
    }

    // Subscribed path is a parent of changed path
    // (e.g., subscribed to /a, changed /a/b)
    if (isParentPointer(subscribedPath, changedPath)) {
      return true;
    }

    return false;
  }

  /**
   * Deep clone a value
   */
  private deepClone<T>(value: T): T {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value !== 'object') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.deepClone(item)) as unknown as T;
    }

    if (value instanceof Date) {
      return new Date(value.getTime()) as unknown as T;
    }

    if (value instanceof Map) {
      const result = new Map();
      for (const [k, v] of value) {
        result.set(k, this.deepClone(v));
      }
      return result as unknown as T;
    }

    if (value instanceof Set) {
      const result = new Set();
      for (const v of value) {
        result.add(this.deepClone(v));
      }
      return result as unknown as T;
    }

    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      result[key] = this.deepClone((value as Record<string, unknown>)[key]);
    }
    return result as T;
  }
}

/**
 * Create a reactive store with the given configuration
 */
export function createReactiveStore(
  config?: ReactiveStoreConfig
): ReactiveStore {
  return new ReactiveStore(config);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a computed value that updates when dependencies change
 *
 * @param store - Reactive store
 * @param dependencies - Array of paths this computation depends on
 * @param compute - Function to compute the value
 * @param callback - Callback to invoke when computed value changes
 * @returns Subscription handle
 */
export function createComputed<T>(
  store: IReactiveStore,
  dependencies: string[],
  compute: (data: Record<string, unknown>) => T,
  callback: (value: T) => void
): Subscription {
  let previousValue: T | undefined;

  const update = () => {
    const data = store.getData();
    const newValue = compute(data);
    if (newValue !== previousValue) {
      previousValue = newValue;
      callback(newValue);
    }
  };

  // Initial computation
  update();

  // Subscribe to all dependencies
  const subscriptions: Subscription[] = [];
  for (const dep of dependencies) {
    subscriptions.push(store.subscribe(dep, update));
  }

  return {
    unsubscribe: () => {
      for (const sub of subscriptions) {
        sub.unsubscribe();
      }
    },
  };
}

/**
 * Create a selector that extracts and transforms data
 *
 * @param store - Reactive store
 * @param path - Path to select from
 * @param transform - Transform function (optional)
 * @returns Current transformed value and subscribe function
 */
export function createSelector<T, R = T>(
  store: IReactiveStore,
  path: string,
  transform?: (value: T | undefined) => R
): {
  getValue: () => R;
  subscribe: (callback: (value: R) => void) => Subscription;
} {
  const getValue = (): R => {
    const value = store.getAt<T>(path);
    return transform ? transform(value) : (value as unknown as R);
  };

  const subscribe = (callback: (value: R) => void): Subscription => {
    return store.subscribe<T>(path, (value) => {
      const transformed = transform ? transform(value) : (value as unknown as R);
      callback(transformed);
    });
  };

  return { getValue, subscribe };
}

/**
 * Merge multiple stores into a single namespace
 *
 * @param stores - Map of namespace to store
 * @returns Combined store interface
 */
export function combineStores(
  stores: Map<string, IReactiveStore>
): {
  getAt: <T>(namespace: string, pointer: string) => T | undefined;
  setAt: (namespace: string, pointer: string, value: unknown) => void;
  subscribe: <T>(
    namespace: string,
    pointer: string,
    callback: ChangeCallback<T>
  ) => Subscription;
} {
  const getAt = <T>(namespace: string, pointer: string): T | undefined => {
    const store = stores.get(namespace);
    return store?.getAt<T>(pointer);
  };

  const setAt = (namespace: string, pointer: string, value: unknown): void => {
    const store = stores.get(namespace);
    store?.setAt(pointer, value);
  };

  const subscribe = <T>(
    namespace: string,
    pointer: string,
    callback: ChangeCallback<T>
  ): Subscription => {
    const store = stores.get(namespace);
    if (!store) {
      return { unsubscribe: () => {} };
    }
    return store.subscribe<T>(pointer, callback);
  };

  return { getAt, setAt, subscribe };
}
