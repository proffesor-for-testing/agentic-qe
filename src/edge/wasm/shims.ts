/**
 * WASM Shims - Browser-Compatible Alternatives for Node.js APIs
 *
 * Provides browser-compatible implementations for Node.js built-in modules:
 * - crypto -> Web Crypto API
 * - events -> Custom EventEmitter
 * - Buffer -> Uint8Array
 *
 * Phase 0: @ruvector/edge integration
 * Target: Chrome 87+, Firefox 89+, Safari 15+
 *
 * @module edge/wasm/shims
 */

import type {
  IBrowserCrypto,
  BrowserEventEmitter,
  BrowserEventHandler,
  BrowserMemoryStore,
  BrowserMemoryRecord,
} from '../types/browser-agent.types';

// ============================================
// Crypto Shim (Web Crypto API)
// ============================================

/**
 * Browser-compatible crypto implementation using Web Crypto API
 * Provides all SecureRandom functionality without Node.js crypto module
 */
export class BrowserCrypto implements IBrowserCrypto {
  /**
   * Generate cryptographically secure random bytes
   * Uses crypto.getRandomValues() which is available in all modern browsers
   */
  randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  /**
   * Generate RFC4122 v4 UUID
   * Uses crypto.randomUUID() (Chrome 92+, Firefox 95+, Safari 15.4+)
   * Falls back to manual generation for older browsers
   */
  randomUUID(): string {
    // Use native implementation if available
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    // Fallback for older browsers
    const bytes = this.randomBytes(16);
    // Set version (4) and variant (RFC4122)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  /**
   * Generate cryptographically secure random integer in range [min, max)
   * Uses rejection sampling to avoid modulo bias
   */
  randomInt(min: number, max: number): number {
    if (min >= max) {
      throw new Error(`Invalid range: min (${min}) must be less than max (${max})`);
    }

    const range = max - min;

    // Calculate the number of bits needed
    const bitsNeeded = Math.ceil(Math.log2(range));
    const bytesNeeded = Math.ceil(bitsNeeded / 8);
    const maxValid = Math.pow(2, bitsNeeded);

    // Rejection sampling to avoid modulo bias
    let result: number;
    do {
      const bytes = this.randomBytes(bytesNeeded);
      result = 0;
      for (let i = 0; i < bytesNeeded; i++) {
        result = (result << 8) | bytes[i];
      }
      // Mask to get only the bits we need
      result = result & (maxValid - 1);
    } while (result >= range);

    return min + result;
  }

  /**
   * Generate cryptographically secure random float in range [0, 1)
   */
  randomFloat(): number {
    // Use 53 bits for maximum precision (JavaScript number precision)
    const bytes = this.randomBytes(7);
    let value = 0;
    for (let i = 0; i < 7; i++) {
      value = value * 256 + bytes[i];
    }
    // Mask to 53 bits and divide by 2^53
    return (value & 0x1fffffffffffff) / 0x20000000000000;
  }

  /**
   * Hash data with SHA-256 using Web Crypto API
   */
  async sha256(data: Uint8Array | string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const dataBytes = typeof data === 'string' ? encoder.encode(data) : data;
    // Create a new ArrayBuffer copy to satisfy BufferSource type constraints
    const buffer = new ArrayBuffer(dataBytes.byteLength);
    new Uint8Array(buffer).set(dataBytes);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return new Uint8Array(hashBuffer);
  }

  /**
   * Generate hex-encoded random ID
   */
  generateId(length: number = 16): string {
    const bytes = this.randomBytes(length);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Generate random string with custom alphabet
   */
  randomString(length: number, alphabet: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += alphabet[this.randomInt(0, alphabet.length)];
    }
    return result;
  }

  /**
   * Generate random boolean with optional bias
   */
  randomBoolean(trueProbability: number = 0.5): boolean {
    if (trueProbability < 0 || trueProbability > 1) {
      throw new Error('Probability must be between 0 and 1');
    }
    return this.randomFloat() < trueProbability;
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   */
  shuffle<T>(array: T[]): T[] {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.randomInt(0, i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /**
   * Select random element from array
   */
  choice<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot choose from empty array');
    }
    return array[this.randomInt(0, array.length)];
  }
}

// ============================================
// EventEmitter Shim
// ============================================

/**
 * Browser-compatible EventEmitter implementation
 * Replaces Node.js events module
 */
export class BrowserEventEmitterImpl implements BrowserEventEmitter {
  private handlers: Map<string, Set<BrowserEventHandler>> = new Map();
  private onceHandlers: Map<string, Set<BrowserEventHandler>> = new Map();

  /**
   * Register event handler
   */
  on(event: string, handler: BrowserEventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  /**
   * Unregister event handler
   */
  off(event: string, handler: BrowserEventHandler): void {
    this.handlers.get(event)?.delete(handler);
    this.onceHandlers.get(event)?.delete(handler);
  }

  /**
   * Register one-time event handler
   */
  once(event: string, handler: BrowserEventHandler): void {
    if (!this.onceHandlers.has(event)) {
      this.onceHandlers.set(event, new Set());
    }
    this.onceHandlers.get(event)!.add(handler);
  }

  /**
   * Emit event to all handlers
   */
  emit(event: string, data: unknown): void {
    // Execute regular handlers
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          const result = handler(data as any);
          // Handle async handlers
          if (result instanceof Promise) {
            result.catch((err) => console.error(`Event handler error for ${event}:`, err));
          }
        } catch (err) {
          console.error(`Event handler error for ${event}:`, err);
        }
      });
    }

    // Execute and remove once handlers
    const onceHandlers = this.onceHandlers.get(event);
    if (onceHandlers) {
      onceHandlers.forEach((handler) => {
        try {
          const result = handler(data as any);
          if (result instanceof Promise) {
            result.catch((err) => console.error(`Once handler error for ${event}:`, err));
          }
        } catch (err) {
          console.error(`Once handler error for ${event}:`, err);
        }
      });
      this.onceHandlers.delete(event);
    }
  }

  /**
   * Remove all listeners for an event (or all events)
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this.handlers.delete(event);
      this.onceHandlers.delete(event);
    } else {
      this.handlers.clear();
      this.onceHandlers.clear();
    }
  }

  /**
   * Get listener count for an event
   */
  listenerCount(event: string): number {
    return (this.handlers.get(event)?.size ?? 0) + (this.onceHandlers.get(event)?.size ?? 0);
  }

  /**
   * Get all registered event names
   */
  eventNames(): string[] {
    const names = new Set<string>();
    this.handlers.forEach((_, key) => names.add(key));
    this.onceHandlers.forEach((_, key) => names.add(key));
    return Array.from(names);
  }
}

// ============================================
// Memory Store Shim (IndexedDB)
// ============================================

const DEFAULT_DB_NAME = 'agentic-qe-browser';
const DEFAULT_STORE_NAME = 'memory';

/**
 * IndexedDB-backed memory store for browser agents
 * Provides persistent storage with TTL support
 */
export class IndexedDBMemoryStore implements BrowserMemoryStore {
  private db: IDBDatabase | null = null;
  private dbName: string;
  private storeName: string;
  private initPromise: Promise<void> | null = null;

  constructor(dbName: string = DEFAULT_DB_NAME, storeName: string = DEFAULT_STORE_NAME) {
    this.dbName = dbName;
    this.storeName = storeName;
  }

  /**
   * Initialize IndexedDB connection
   */
  private async ensureDB(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    if (this.initPromise) {
      await this.initPromise;
      return this.db!;
    }

    this.initPromise = new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
          store.createIndex('namespace', 'namespace', { unique: false });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
      };
    });

    await this.initPromise;
    return this.db!;
  }

  /**
   * Store a value with optional TTL
   */
  async store(key: string, value: unknown, ttl?: number): Promise<void> {
    await this.set(key, value, 'default');
    if (ttl) {
      // TTL is stored in the record
      const db = await this.ensureDB();
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const record: BrowserMemoryRecord & { expiresAt?: number } = {
        key: `default:${key}`,
        value,
        namespace: 'default',
        timestamp: Date.now(),
        ttl,
        expiresAt: Date.now() + ttl,
      };

      await new Promise<void>((resolve, reject) => {
        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  }

  /**
   * Retrieve a value by key
   */
  async retrieve(key: string): Promise<unknown> {
    return this.get(key, 'default');
  }

  /**
   * Set with namespace support
   */
  async set(key: string, value: unknown, namespace: string = 'default'): Promise<void> {
    const db = await this.ensureDB();
    const transaction = db.transaction(this.storeName, 'readwrite');
    const store = transaction.objectStore(this.storeName);

    const record: BrowserMemoryRecord = {
      key: `${namespace}:${key}`,
      value,
      namespace,
      timestamp: Date.now(),
    };

    await new Promise<void>((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get with namespace support
   */
  async get(key: string, namespace: string = 'default'): Promise<unknown> {
    const db = await this.ensureDB();
    const transaction = db.transaction(this.storeName, 'readonly');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.get(`${namespace}:${key}`);

      request.onsuccess = () => {
        const record = request.result as (BrowserMemoryRecord & { expiresAt?: number }) | undefined;

        if (!record) {
          resolve(undefined);
          return;
        }

        // Check TTL expiration
        if (record.expiresAt && record.expiresAt < Date.now()) {
          // Expired - delete and return undefined
          this.delete(key, namespace).catch(console.error);
          resolve(undefined);
          return;
        }

        resolve(record.value);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete a key
   */
  async delete(key: string, namespace: string = 'default'): Promise<boolean> {
    const db = await this.ensureDB();
    const transaction = db.transaction(this.storeName, 'readwrite');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.delete(`${namespace}:${key}`);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all data in namespace (or all data if no namespace)
   */
  async clear(namespace?: string): Promise<void> {
    const db = await this.ensureDB();
    const transaction = db.transaction(this.storeName, 'readwrite');
    const store = transaction.objectStore(this.storeName);

    if (!namespace) {
      // Clear all
      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      return;
    }

    // Clear by namespace using index
    const index = store.index('namespace');
    const cursorRequest = index.openCursor(IDBKeyRange.only(namespace));

    await new Promise<void>((resolve, reject) => {
      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorRequest.onerror = () => reject(cursorRequest.error);
    });
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Cleanup expired entries
   */
  async cleanupExpired(): Promise<number> {
    const db = await this.ensureDB();
    const transaction = db.transaction(this.storeName, 'readwrite');
    const store = transaction.objectStore(this.storeName);
    const index = store.index('expiresAt');

    const now = Date.now();
    let deletedCount = 0;

    return new Promise((resolve, reject) => {
      const cursorRequest = index.openCursor(IDBKeyRange.upperBound(now));

      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          resolve(deletedCount);
        }
      };

      cursorRequest.onerror = () => reject(cursorRequest.error);
    });
  }
}

// ============================================
// LocalStorage Fallback Memory Store
// ============================================

/**
 * LocalStorage-backed memory store for browsers without IndexedDB
 * Simpler but with 5MB limit
 */
export class LocalStorageMemoryStore implements BrowserMemoryStore {
  private prefix: string;

  constructor(prefix: string = 'aqe:') {
    this.prefix = prefix;
  }

  private getKey(key: string, namespace: string = 'default'): string {
    return `${this.prefix}${namespace}:${key}`;
  }

  async store(key: string, value: unknown, ttl?: number): Promise<void> {
    const record = {
      value,
      timestamp: Date.now(),
      expiresAt: ttl ? Date.now() + ttl : undefined,
    };
    localStorage.setItem(this.getKey(key), JSON.stringify(record));
  }

  async retrieve(key: string): Promise<unknown> {
    return this.get(key);
  }

  async set(key: string, value: unknown, namespace?: string): Promise<void> {
    const record = {
      value,
      timestamp: Date.now(),
    };
    localStorage.setItem(this.getKey(key, namespace), JSON.stringify(record));
  }

  async get(key: string, namespace?: string): Promise<unknown> {
    const data = localStorage.getItem(this.getKey(key, namespace));
    if (!data) return undefined;

    try {
      const record = JSON.parse(data);

      // Check TTL
      if (record.expiresAt && record.expiresAt < Date.now()) {
        localStorage.removeItem(this.getKey(key, namespace));
        return undefined;
      }

      return record.value;
    } catch {
      return undefined;
    }
  }

  async delete(key: string, namespace?: string): Promise<boolean> {
    localStorage.removeItem(this.getKey(key, namespace));
    return true;
  }

  async clear(namespace?: string): Promise<void> {
    const prefix = namespace ? `${this.prefix}${namespace}:` : this.prefix;

    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }
}

// ============================================
// Logger Shim
// ============================================

/**
 * Browser-compatible logger implementation
 * Replaces Node.js Logger utility
 */
export class BrowserLogger {
  private static instance: BrowserLogger;
  private level: 'debug' | 'info' | 'warn' | 'error' = 'info';
  private prefix: string;

  private constructor(prefix: string = '[AQE]') {
    this.prefix = prefix;
  }

  static getInstance(prefix?: string): BrowserLogger {
    if (!BrowserLogger.instance) {
      BrowserLogger.instance = new BrowserLogger(prefix);
    }
    return BrowserLogger.instance;
  }

  setLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this.level = level;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.level === 'debug') {
      console.debug(`${this.prefix} ${message}`, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (['debug', 'info'].includes(this.level)) {
      console.info(`${this.prefix} ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (['debug', 'info', 'warn'].includes(this.level)) {
      console.warn(`${this.prefix} ${message}`, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    console.error(`${this.prefix} ${message}`, ...args);
  }
}

// ============================================
// Timing Utilities
// ============================================

/**
 * High-resolution timing for performance measurement
 * Uses Performance API instead of process.hrtime
 */
export function hrtime(): number {
  return performance.now();
}

/**
 * Calculate elapsed time in milliseconds
 */
export function elapsed(start: number): number {
  return performance.now() - start;
}

// ============================================
// Export Factory Functions
// ============================================

/**
 * Create browser crypto instance
 */
export function createBrowserCrypto(): IBrowserCrypto {
  return new BrowserCrypto();
}

/**
 * Create browser event emitter
 */
export function createBrowserEventEmitter(): BrowserEventEmitter {
  return new BrowserEventEmitterImpl();
}

/**
 * Create browser memory store (auto-detect best option)
 */
export function createBrowserMemoryStore(options?: { dbName?: string; prefix?: string }): BrowserMemoryStore {
  // Prefer IndexedDB if available
  if (typeof indexedDB !== 'undefined') {
    return new IndexedDBMemoryStore(options?.dbName);
  }

  // Fallback to localStorage
  if (typeof localStorage !== 'undefined') {
    return new LocalStorageMemoryStore(options?.prefix);
  }

  // In-memory fallback for environments without storage
  const memoryMap = new Map<string, unknown>();
  return {
    store: async (key, value) => {
      memoryMap.set(key, value);
    },
    retrieve: async (key) => memoryMap.get(key),
    set: async (key, value, namespace = 'default') => {
      memoryMap.set(`${namespace}:${key}`, value);
    },
    get: async (key, namespace = 'default') => memoryMap.get(`${namespace}:${key}`),
    delete: async (key, namespace = 'default') => memoryMap.delete(`${namespace}:${key}`),
    clear: async () => {
      memoryMap.clear();
    },
  };
}

/**
 * Create browser logger
 */
export function createBrowserLogger(prefix?: string): BrowserLogger {
  return BrowserLogger.getInstance(prefix);
}

// ============================================
// Unified WASM Shims Export
// ============================================

/**
 * Collection of all WASM shims for browser compatibility
 */
export const wasmShims = {
  crypto: createBrowserCrypto(),
  createCrypto: createBrowserCrypto,
  createEventEmitter: createBrowserEventEmitter,
  createMemoryStore: createBrowserMemoryStore,
  createLogger: createBrowserLogger,
  hrtime,
  elapsed,
  BrowserCrypto,
  BrowserEventEmitterImpl,
  IndexedDBMemoryStore,
  LocalStorageMemoryStore,
  BrowserLogger,
};
