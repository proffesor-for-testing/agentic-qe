/**
 * Agentic QE v3 - Session Operation Cache
 * Imp-15: Session Reuse for Repeated Operations
 *
 * Lightweight fingerprint-based cache for operation results that provides
 * O(1) exact-match lookups before falling back to HNSW similarity search.
 * Supplements (does not replace) the EarlyExitTokenOptimizer.
 *
 * Architecture:
 * - SHA-256 fingerprint from canonicalized (domain + action + input)
 * - In-memory Map for O(1) lookups
 * - Optional SQLite persistence via kv_store (namespace: 'session_cache')
 * - TTL-based expiry, LRU-ish eviction at capacity
 */

import { createHash } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface CachedOperation {
  fingerprint: string;
  domain: string;
  action: string;
  result: Record<string, unknown>;
  tokensSaved: number;
  cachedAt: number;
  hitCount: number;
  lastHitAt: number;
}

export interface SessionCacheConfig {
  /** Enable the cache (default: true) */
  enabled: boolean;
  /** Maximum entries in memory (default: 500) */
  maxEntries: number;
  /** TTL in milliseconds (default: 1 hour) */
  ttlMs: number;
  /** Persist across sessions via SQLite kv_store (default: true) */
  persistToDb: boolean;
}

export interface SessionCacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  estimatedTokensSaved: number;
}

export const DEFAULT_SESSION_CACHE_CONFIG: SessionCacheConfig = {
  enabled: true,
  maxEntries: 500,
  ttlMs: 60 * 60 * 1000, // 1 hour
  persistToDb: true,
};

// ============================================================================
// Canonical JSON (deterministic, recursively sorted keys)
// ============================================================================

/**
 * Produce a deterministic JSON string with recursively sorted object keys.
 * Ensures identical logical objects always produce the same fingerprint.
 */
function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(v => canonicalStringify(v)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k]));
  return '{' + pairs.join(',') + '}';
}

// ============================================================================
// Implementation
// ============================================================================

export class SessionOperationCache {
  private cache: Map<string, CachedOperation> = new Map();
  private config: SessionCacheConfig;
  private hits = 0;
  private misses = 0;

  constructor(config?: Partial<SessionCacheConfig>) {
    this.config = { ...DEFAULT_SESSION_CACHE_CONFIG, ...config };
  }

  /**
   * Compute a deterministic fingerprint from domain + action + input.
   * Uses SHA-256 of the canonicalized JSON (recursively sorted keys), truncated to 16 hex chars.
   */
  computeFingerprint(domain: string, action: string, input: Record<string, unknown>): string {
    const canonical = canonicalStringify({ action, domain, input });
    return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
  }

  /**
   * Look up a cached result by fingerprint.
   * Returns null on miss or expired entry.
   */
  get(fingerprint: string): CachedOperation | null {
    if (!this.config.enabled) return null;

    const entry = this.cache.get(fingerprint);
    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.cachedAt > this.config.ttlMs) {
      this.cache.delete(fingerprint);
      this.misses++;
      return null;
    }

    entry.hitCount++;
    entry.lastHitAt = Date.now();
    this.hits++;
    return entry;
  }

  /**
   * Store an operation result in the cache.
   */
  set(
    fingerprint: string,
    domain: string,
    action: string,
    result: Record<string, unknown>,
    estimatedTokens: number,
  ): void {
    if (!this.config.enabled) return;

    // Evict oldest if at capacity
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    const entry: CachedOperation = {
      fingerprint,
      domain,
      action,
      result,
      tokensSaved: estimatedTokens,
      cachedAt: Date.now(),
      hitCount: 0,
      lastHitAt: 0,
    };

    this.cache.set(fingerprint, entry);

    // Persist to DB (fire-and-forget, non-blocking)
    if (this.config.persistToDb) {
      this.persistEntry(entry);
    }
  }

  /**
   * Load persisted cache entries from SQLite kv_store.
   * Called on service initialization. Gracefully degrades if DB unavailable.
   */
  loadFromDb(): void {
    try {
      const db = tryGetDb();
      if (!db) return;

      const cutoffMs = Date.now() - this.config.ttlMs;
      const rows = db.prepare(
        `SELECT key, value FROM kv_store
         WHERE namespace = 'session_cache'
         AND created_at > ?
         ORDER BY created_at DESC LIMIT ?`
      ).all(cutoffMs, this.config.maxEntries) as { key: string; value: string }[];

      for (const row of rows) {
        try {
          const entry = JSON.parse(row.value) as CachedOperation;
          if (Date.now() - entry.cachedAt <= this.config.ttlMs) {
            this.cache.set(entry.fingerprint, entry);
          }
        } catch {
          /* skip corrupt entries */
        }
      }
    } catch {
      /* graceful degradation - cache works without persistence */
    }
  }

  /** Get cache statistics */
  getStats(): SessionCacheStats {
    const total = this.hits + this.misses;
    let totalSaved = 0;
    for (const entry of this.cache.values()) {
      totalSaved += entry.tokensSaved * entry.hitCount;
    }
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      estimatedTokensSaved: totalSaved,
    };
  }

  /** Clear all cache entries and reset counters */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /** Evict the oldest entry by cachedAt */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.cachedAt < oldestTime) {
        oldestTime = entry.cachedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) this.cache.delete(oldestKey);
  }

  /** Persist a single entry to kv_store */
  private persistEntry(entry: CachedOperation): void {
    try {
      const db = tryGetDb();
      if (!db) return;
      db.prepare(
        `INSERT OR REPLACE INTO kv_store (key, namespace, value, created_at)
         VALUES (?, 'session_cache', ?, ?)`
      ).run(`session_cache:${entry.fingerprint}`, JSON.stringify(entry), Date.now());
    } catch {
      /* non-critical - cache works without persistence */
    }
  }
}

// ============================================================================
// DB Helper
// ============================================================================

/**
 * Attempt to get the unified memory database.
 * Returns null if unavailable (graceful degradation).
 */
function tryGetDb(): ReturnType<import('../kernel/unified-memory.js').UnifiedMemoryManager['getDatabase']> | null {
  try {
    // Dynamic require to avoid circular dependencies at import time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getUnifiedMemory } = require('../kernel/unified-memory.js');
    const um = getUnifiedMemory();
    if (!um.isInitialized()) return null;
    return um.getDatabase();
  } catch {
    return null;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: SessionOperationCache | null = null;

export function getSessionCache(config?: Partial<SessionCacheConfig>): SessionOperationCache {
  if (!instance) {
    instance = new SessionOperationCache(config);
    instance.loadFromDb();
  }
  return instance;
}

/** Reset the singleton (for testing) */
export function resetSessionCache(): void {
  if (instance) {
    instance.clear();
  }
  instance = null;
}
