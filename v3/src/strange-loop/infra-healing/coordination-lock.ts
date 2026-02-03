/**
 * Coordination Lock
 * ADR-057: Infrastructure Self-Healing Extension
 *
 * In-process async mutex keyed by service name.
 * Prevents duplicate recovery attempts for the same infrastructure service.
 * Includes TTL auto-expiry to prevent stale locks from blocking recovery.
 */

import type { CoordinationLockEntry, LockAcquireResult } from './types.js';

// ============================================================================
// Coordination Lock
// ============================================================================

/**
 * Async mutex for coordinating infrastructure recovery operations.
 * Keyed by service name — only one recovery can run per service at a time.
 */
export class CoordinationLock {
  private locks: Map<string, CoordinationLockEntry> = new Map();
  private readonly defaultTtlMs: number;

  constructor(defaultTtlMs: number = 120_000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Attempt to acquire the lock for a service.
   * Returns immediately — does not block.
   */
  acquire(serviceName: string, holderId: string, ttlMs?: number): LockAcquireResult {
    this.evictExpired();

    const existing = this.locks.get(serviceName);
    if (existing) {
      return {
        acquired: false,
        currentHolder: existing.holderId,
        expiresAt: existing.acquiredAt + existing.ttlMs,
      };
    }

    const entry: CoordinationLockEntry = {
      serviceName,
      holderId,
      acquiredAt: Date.now(),
      ttlMs: ttlMs ?? this.defaultTtlMs,
    };

    this.locks.set(serviceName, entry);
    return { acquired: true };
  }

  /**
   * Release the lock for a service.
   * Only the holder can release it.
   * Returns true if the lock was released, false if not held or wrong holder.
   */
  release(serviceName: string, holderId: string): boolean {
    const existing = this.locks.get(serviceName);
    if (!existing) return false;
    if (existing.holderId !== holderId) return false;

    this.locks.delete(serviceName);
    return true;
  }

  /**
   * Check if a service is currently locked.
   */
  isLocked(serviceName: string): boolean {
    this.evictExpired();
    return this.locks.has(serviceName);
  }

  /**
   * Get the lock entry for a service (if any).
   */
  getLock(serviceName: string): CoordinationLockEntry | undefined {
    this.evictExpired();
    return this.locks.get(serviceName);
  }

  /**
   * Get all active (non-expired) locks.
   */
  getActiveLocks(): readonly CoordinationLockEntry[] {
    this.evictExpired();
    return Array.from(this.locks.values());
  }

  /**
   * Force-release all locks (for shutdown/reset).
   */
  releaseAll(): void {
    this.locks.clear();
  }

  /**
   * Evict expired locks based on TTL.
   */
  private evictExpired(): void {
    const now = Date.now();
    for (const [serviceName, entry] of this.locks) {
      if (now >= entry.acquiredAt + entry.ttlMs) {
        this.locks.delete(serviceName);
      }
    }
  }
}

/**
 * Factory function for creating a CoordinationLock.
 */
export function createCoordinationLock(defaultTtlMs?: number): CoordinationLock {
  return new CoordinationLock(defaultTtlMs);
}
