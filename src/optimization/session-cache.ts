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
import * as path from 'path';
import { findProjectRoot } from '../kernel/project-root.js';

/**
 * Build identity mixed into every cache fingerprint so persisted entries never
 * outlive the code that produced them. `__CLI_VERSION__` is substituted at bundle
 * time; in source/test runs it is undefined and we fall back to a dev marker.
 *
 * `AQE_SESSION_CACHE_SALT` lets an operator force a cold cache without deleting
 * anything (e.g. after a local rebuild that keeps the same version string).
 */
function getBuildIdentity(): string {
  const version = typeof __CLI_VERSION__ !== 'undefined' ? __CLI_VERSION__ : 'dev';
  const salt = (process.env.AQE_SESSION_CACHE_SALT ?? '').trim();
  return salt ? `${version}+${salt}` : version;
}

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

/**
 * Where a cached operation ran (#998). Arguments alone do not identify a
 * result: the same relative `target: "."` means a different tree in another
 * project, and a file argument means different content after an edit.
 */
export interface CacheScope {
  /** Resolved project root. Defaults to `findProjectRoot()`. */
  projectRoot?: string;
  /** Working directory relative arguments resolve against. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Fingerprints of the inputs the operation reads (absolute path, mtime, size). */
  inputs?: Record<string, unknown>;
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
  // Honor JSON's array holes, undefined fields and toJSON (for example Date)
  // before ordering keys. Hand-built fragments can conflate distinct inputs.
  const normalized: unknown = JSON.parse(JSON.stringify(value));
  function encode(item: unknown): string {
    if (item === null || typeof item !== 'object') return JSON.stringify(item);
    if (Array.isArray(item)) return '[' + item.map(encode).join(',') + ']';
    const obj = item as Record<string, unknown>;
    return '{' + Object.keys(obj).sort()
      .map(key => JSON.stringify(key) + ':' + encode(obj[key])).join(',') + '}';
  }
  return encode(normalized);
}

function resolveScope(scope?: CacheScope): Required<CacheScope> {
  let projectRoot = scope?.projectRoot;
  if (!projectRoot) {
    try { projectRoot = findProjectRoot(); } catch { projectRoot = ''; }
  }
  let cwd = scope?.cwd;
  if (!cwd) {
    try { cwd = process.cwd(); } catch { cwd = ''; }
  }
  return {
    projectRoot: projectRoot ? path.resolve(projectRoot) : '',
    cwd: cwd ? path.resolve(cwd) : '',
    inputs: scope?.inputs ?? {},
  };
}

// ============================================================================
// Implementation
// ============================================================================

export class SessionOperationCache {
  private cache: Map<string, CachedOperation> = new Map();
  private config: SessionCacheConfig;
  private hits = 0;
  private misses = 0;
  private generation = 0;
  private readonly resolveMemory: () => UnifiedMemory | null;

  /**
   * @param resolveMemory Where persisted entries live; defaults to the shared
   *   UnifiedMemoryManager once it is initialized (injectable for tests).
   */
  constructor(config?: Partial<SessionCacheConfig>, resolveMemory: () => UnifiedMemory | null = tryGetMemory) {
    this.config = { ...DEFAULT_SESSION_CACHE_CONFIG, ...config };
    this.resolveMemory = resolveMemory;
  }

  /**
   * Compute a deterministic fingerprint from build + domain + action + input.
   * Uses SHA-256 of the canonicalized JSON (recursively sorted keys), truncated to 16 hex chars.
   *
   * The build identity is part of the key on purpose. Entries are persisted to
   * `kv_store` and survive process restarts *and package upgrades*, so a
   * fingerprint over inputs alone means an upgraded install keeps replaying the
   * previous version's answers until the TTL lapses — the fix looks like it did
   * not work. That is exactly what happened while verifying issue #569: a
   * project analyzed before the fix kept returning the old fabricated coverage
   * numbers (`lineCoverage: 0, measured: true`) from cache, while an untouched
   * project returned the corrected result.
   *
   * Including the version means an upgrade misses cleanly rather than serving
   * stale answers; entries from the old build simply age out.
   *
   * The scope (project root, working directory and input fingerprints) is part
   * of the key too (#998): without it a relative target returned another
   * project's cached result. When no scope is passed, the current project root
   * and working directory are used, so every caller is project-scoped.
   */
  computeFingerprint(
    domain: string,
    action: string,
    input: Record<string, unknown>,
    scope?: CacheScope,
  ): string {
    const canonical = canonicalStringify({
      action, build: getBuildIdentity(), domain, input, scope: resolveScope(scope),
    });
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
    if (!this.cache.has(fingerprint) && this.cache.size >= this.config.maxEntries) {
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
      const db = this.resolveMemory()?.getDatabase();
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
    this.generation++;
  }

  /** Revision used to keep in-flight reads from repopulating a stale cache. */
  getGeneration(): number {
    return this.generation;
  }

  /** Evict all cached reads, including persisted rows, after a stateful call. */
  invalidateAll(): number {
    const removed = this.cache.size;
    this.cache.clear();
    this.generation++;
    if (this.config.persistToDb) {
      // #1274: runs after every state-changing tool call, so it must not wait
      // synchronously on a locked memory.db. Queued writes keep their order,
      // so a later persistEntry still lands after this delete.
      this.persistInBackground((db) => db.prepare("DELETE FROM kv_store WHERE namespace = 'session_cache'").run());
    }
    return removed;
  }

  /**
   * Invalidate every cached entry for a domain. Issue #535: a mutating tool
   * (e.g. memory_delete / memory_store) must evict the sibling read entries in
   * its domain, or a follow-up memory_retrieve serves a stale "found" result
   * from cache and the delete looks like a no-op. Also drops the persisted
   * rows so a later loadFromDb() can't resurrect the stale entries. Returns the
   * number of entries removed.
   */
  invalidateDomain(domain: string): number {
    this.generation++;
    let removed = 0;
    for (const [key, entry] of this.cache) {
      if (entry.domain === domain) {
        this.cache.delete(key);
        this.deletePersisted(entry.fingerprint);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Persist a cache change without blocking the caller (#1274). The write goes
   * through the shared connection's writeWhenUnlocked queue: with memory.db
   * unlocked and nothing queued it runs at once, as before; while another
   * process holds the lock it retries asynchronously for the usual busy_timeout
   * instead of freezing the MCP server's event loop. Failure is non-critical,
   * since the in-memory cache is already up to date.
   */
  private persistInBackground(write: (db: Db) => unknown): void {
    const um = this.resolveMemory();
    if (!um) return;
    try {
      const db = um.getDatabase();
      um.writeWhenUnlocked(() => write(db)).catch(() => { /* cache works without persistence */ });
    } catch {
      /* cache works without persistence */
    }
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
    const value = JSON.stringify(entry);
    const createdAt = Date.now();
    this.persistInBackground((db) => db.prepare(
      `INSERT OR REPLACE INTO kv_store (key, namespace, value, created_at)
       VALUES (?, 'session_cache', ?, ?)`
    ).run(`session_cache:${entry.fingerprint}`, value, createdAt));
  }

  /** Delete a single persisted entry from kv_store (used by invalidateDomain). */
  private deletePersisted(fingerprint: string): void {
    this.persistInBackground((db) => db.prepare(
      `DELETE FROM kv_store WHERE namespace = 'session_cache' AND key = ?`
    ).run(`session_cache:${fingerprint}`));
  }
}

// ============================================================================
// DB Helper
// ============================================================================

type UnifiedMemory = import('../kernel/unified-memory.js').UnifiedMemoryManager;
type Db = ReturnType<UnifiedMemory['getDatabase']>;

/**
 * Attempt to get the initialized unified memory manager.
 * Returns null if unavailable (graceful degradation).
 */
function tryGetMemory(): UnifiedMemory | null {
  try {
    // Dynamic require to avoid circular dependencies at import time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getUnifiedMemory } = require('../kernel/unified-memory.js');
    const um = getUnifiedMemory();
    return um.isInitialized() ? um : null;
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
