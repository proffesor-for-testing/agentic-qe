/**
 * Coordination Lock Tests
 * ADR-057: Infrastructure Self-Healing Extension
 *
 * Tests for the in-process async mutex that prevents duplicate
 * infrastructure recovery attempts.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CoordinationLock,
  createCoordinationLock,
} from '../../../../src/strange-loop/infra-healing/coordination-lock.js';

// ============================================================================
// Coordination Lock Tests
// ============================================================================

describe('CoordinationLock', () => {
  let lock: CoordinationLock;

  beforeEach(() => {
    lock = createCoordinationLock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Factory
  // ==========================================================================

  describe('createCoordinationLock', () => {
    it('creates a lock with default TTL', () => {
      const l = createCoordinationLock();
      expect(l).toBeInstanceOf(CoordinationLock);
    });

    it('creates a lock with custom TTL', () => {
      const l = createCoordinationLock(5000);
      expect(l).toBeInstanceOf(CoordinationLock);
    });
  });

  // ==========================================================================
  // Acquire
  // ==========================================================================

  describe('acquire()', () => {
    it('acquires lock for a service', () => {
      const result = lock.acquire('postgres', 'action-1');
      expect(result.acquired).toBe(true);
      expect(result.currentHolder).toBeUndefined();
    });

    it('fails to acquire lock already held by another holder', () => {
      lock.acquire('postgres', 'action-1');
      const result = lock.acquire('postgres', 'action-2');
      expect(result.acquired).toBe(false);
      expect(result.currentHolder).toBe('action-1');
      expect(result.expiresAt).toBeGreaterThan(0);
    });

    it('allows acquiring locks for different services', () => {
      const r1 = lock.acquire('postgres', 'action-1');
      const r2 = lock.acquire('redis', 'action-2');
      expect(r1.acquired).toBe(true);
      expect(r2.acquired).toBe(true);
    });

    it('allows the same holder to acquire different services', () => {
      const r1 = lock.acquire('postgres', 'action-1');
      const r2 = lock.acquire('redis', 'action-1');
      expect(r1.acquired).toBe(true);
      expect(r2.acquired).toBe(true);
    });

    it('accepts custom TTL per acquisition', () => {
      lock.acquire('postgres', 'action-1', 5000);
      const entry = lock.getLock('postgres');
      expect(entry?.ttlMs).toBe(5000);
    });
  });

  // ==========================================================================
  // Release
  // ==========================================================================

  describe('release()', () => {
    it('releases a lock held by the correct holder', () => {
      lock.acquire('postgres', 'action-1');
      const released = lock.release('postgres', 'action-1');
      expect(released).toBe(true);
      expect(lock.isLocked('postgres')).toBe(false);
    });

    it('refuses release by wrong holder', () => {
      lock.acquire('postgres', 'action-1');
      const released = lock.release('postgres', 'action-2');
      expect(released).toBe(false);
      expect(lock.isLocked('postgres')).toBe(true);
    });

    it('returns false for non-existent lock', () => {
      const released = lock.release('postgres', 'action-1');
      expect(released).toBe(false);
    });

    it('allows reacquisition after release', () => {
      lock.acquire('postgres', 'action-1');
      lock.release('postgres', 'action-1');
      const result = lock.acquire('postgres', 'action-2');
      expect(result.acquired).toBe(true);
    });
  });

  // ==========================================================================
  // isLocked
  // ==========================================================================

  describe('isLocked()', () => {
    it('returns false for unlocked service', () => {
      expect(lock.isLocked('postgres')).toBe(false);
    });

    it('returns true for locked service', () => {
      lock.acquire('postgres', 'action-1');
      expect(lock.isLocked('postgres')).toBe(true);
    });
  });

  // ==========================================================================
  // TTL Expiry
  // ==========================================================================

  describe('TTL auto-expiry', () => {
    it('evicts expired locks on isLocked()', () => {
      const shortLock = createCoordinationLock(50);
      shortLock.acquire('postgres', 'action-1');
      expect(shortLock.isLocked('postgres')).toBe(true);

      // Simulate time passing beyond TTL
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 100);
      expect(shortLock.isLocked('postgres')).toBe(false);
    });

    it('evicts expired locks on acquire()', () => {
      const shortLock = createCoordinationLock(50);
      shortLock.acquire('postgres', 'action-1');

      // Simulate time passing beyond TTL
      const future = Date.now() + 100;
      vi.spyOn(Date, 'now').mockReturnValue(future);

      const result = shortLock.acquire('postgres', 'action-2');
      expect(result.acquired).toBe(true);
    });
  });

  // ==========================================================================
  // getActiveLocks
  // ==========================================================================

  describe('getActiveLocks()', () => {
    it('returns empty array when no locks held', () => {
      expect(lock.getActiveLocks()).toHaveLength(0);
    });

    it('returns all active locks', () => {
      lock.acquire('postgres', 'action-1');
      lock.acquire('redis', 'action-2');
      const active = lock.getActiveLocks();
      expect(active).toHaveLength(2);
      expect(active.map((l) => l.serviceName)).toContain('postgres');
      expect(active.map((l) => l.serviceName)).toContain('redis');
    });

    it('excludes expired locks', () => {
      const shortLock = createCoordinationLock(50);
      shortLock.acquire('postgres', 'action-1');
      shortLock.acquire('redis', 'action-2', 999_999);

      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 100);
      const active = shortLock.getActiveLocks();
      expect(active).toHaveLength(1);
      expect(active[0].serviceName).toBe('redis');
    });
  });

  // ==========================================================================
  // releaseAll
  // ==========================================================================

  describe('releaseAll()', () => {
    it('releases all locks', () => {
      lock.acquire('postgres', 'action-1');
      lock.acquire('redis', 'action-2');
      lock.acquire('mongodb', 'action-3');

      lock.releaseAll();
      expect(lock.getActiveLocks()).toHaveLength(0);
      expect(lock.isLocked('postgres')).toBe(false);
      expect(lock.isLocked('redis')).toBe(false);
      expect(lock.isLocked('mongodb')).toBe(false);
    });
  });

  // ==========================================================================
  // getLock
  // ==========================================================================

  describe('getLock()', () => {
    it('returns undefined for non-existent lock', () => {
      expect(lock.getLock('postgres')).toBeUndefined();
    });

    it('returns lock entry for held lock', () => {
      lock.acquire('postgres', 'action-1');
      const entry = lock.getLock('postgres');
      expect(entry).toBeDefined();
      expect(entry!.serviceName).toBe('postgres');
      expect(entry!.holderId).toBe('action-1');
      expect(entry!.acquiredAt).toBeGreaterThan(0);
      expect(entry!.ttlMs).toBe(120_000);
    });
  });
});
