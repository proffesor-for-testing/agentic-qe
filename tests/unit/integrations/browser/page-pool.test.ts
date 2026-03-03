/**
 * Tests for Browser Page Pool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BrowserPagePool,
  createBrowserPagePool,
} from '../../../../src/integrations/browser/page-pool';

describe('BrowserPagePool', () => {
  let pool: BrowserPagePool;

  beforeEach(async () => {
    pool = new BrowserPagePool({
      maxPages: 4,
      minPages: 2,
      idleTimeoutMs: 5000,
      healthCheckIntervalMs: 0, // disable for tests
      healthThreshold: 0.5,
    });
    await pool.initialize();
  });

  afterEach(async () => {
    await pool.shutdown();
  });

  it('pre-warms minPages on initialize', () => {
    const stats = pool.getStats();
    expect(stats.totalPages).toBe(2);
    expect(stats.readyPages).toBe(2);
  });

  it('acquires a ready page', () => {
    const page = pool.acquire();
    expect(page).toBeTruthy();
    expect(page?.state).toBe('busy');

    const stats = pool.getStats();
    expect(stats.busyPages).toBe(1);
    expect(stats.readyPages).toBe(1);
  });

  it('releases a page back to ready state', () => {
    const page = pool.acquire()!;
    pool.release(page.id);

    const released = pool.getPage(page.id);
    expect(released?.state).toBe('ready');
    expect(released?.requestsServed).toBe(1);
  });

  it('creates new pages up to maxPages', () => {
    const pages = [];
    for (let i = 0; i < 4; i++) {
      const p = pool.acquire();
      expect(p).toBeTruthy();
      pages.push(p!);
    }

    const stats = pool.getStats();
    expect(stats.totalPages).toBe(4);
    expect(stats.busyPages).toBe(4);
  });

  it('returns null when pool is exhausted', () => {
    for (let i = 0; i < 4; i++) {
      pool.acquire();
    }
    const extra = pool.acquire();
    expect(extra).toBeNull();
  });

  it('marks a page as errored', () => {
    const page = pool.acquire()!;
    pool.markError(page.id);

    const errored = pool.getPage(page.id);
    expect(errored?.state).toBe('error');
    expect(errored?.errorCount).toBe(1);
    expect(errored?.health).toBeLessThan(1.0);
  });

  it('prunes error pages and maintains minPages', () => {
    const page = pool.acquire()!;
    pool.markError(page.id);

    const pruned = pool.prune();
    expect(pruned).toBeGreaterThanOrEqual(1);

    const stats = pool.getStats();
    expect(stats.totalPages).toBeGreaterThanOrEqual(2); // minPages maintained
    expect(stats.errorPages).toBe(0);
  });

  it('tracks pool hit rate', () => {
    pool.acquire();
    pool.acquire();
    const stats = pool.getStats();
    expect(stats.poolHitRate).toBeGreaterThan(0);
  });

  it('acquireAsync works', async () => {
    const page = await pool.acquireAsync();
    expect(page).toBeTruthy();
    expect(page?.state).toBe('busy');
  });

  it('shutdown closes all pages', async () => {
    pool.acquire();
    pool.acquire();
    await pool.shutdown();

    const stats = pool.getStats();
    expect(stats.totalPages).toBe(0);
  });

  it('getAllPages returns all pages', () => {
    const pages = pool.getAllPages();
    expect(pages).toHaveLength(2);
  });

  it('handles release of unknown pageId gracefully', () => {
    expect(() => pool.release('unknown-id')).not.toThrow();
  });

  it('handles markError of unknown pageId gracefully', () => {
    expect(() => pool.markError('unknown-id')).not.toThrow();
  });
});

describe('createBrowserPagePool', () => {
  it('creates a pool with default config', () => {
    const pool = createBrowserPagePool();
    expect(pool).toBeInstanceOf(BrowserPagePool);
  });

  it('creates a pool with custom config', () => {
    const pool = createBrowserPagePool({ maxPages: 10 });
    expect(pool).toBeInstanceOf(BrowserPagePool);
  });
});
