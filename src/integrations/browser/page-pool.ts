/**
 * Browser Page Pool
 *
 * Manages concurrent browser pages with state tracking for parallel E2E execution.
 * Follows the ConnectionPoolImpl pattern from src/mcp/connection-pool.ts.
 *
 * @module integrations/browser/page-pool
 */

import { randomUUID } from 'crypto';
import type {
  PageState,
  PooledPage,
  BrowserPagePoolConfig,
  PagePoolStats,
} from './page-pool-types';
import { DEFAULT_PAGE_POOL_CONFIG } from './page-pool-types';

// ============================================================================
// Browser Page Pool
// ============================================================================

/**
 * Browser Page Pool
 *
 * Manages a pool of browser pages for concurrent E2E test execution.
 * Uses semaphore pattern for thread-safe acquisition and idle set for O(1) lookup.
 */
export class BrowserPagePool {
  private readonly pages = new Map<string, PooledPage>();
  private readonly readyPages = new Set<string>();
  private readonly config: BrowserPagePoolConfig;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  // Performance tracking
  private totalRequests = 0;
  private cacheHits = 0;
  private acquisitionTimes: number[] = [];
  private readonly MAX_SAMPLES = 100;

  // Semaphore for async acquire
  private acquireQueue: Array<(page: PooledPage | null) => void> = [];
  private processing = false;

  constructor(config?: Partial<BrowserPagePoolConfig>) {
    this.config = { ...DEFAULT_PAGE_POOL_CONFIG, ...config };
  }

  /**
   * Initialize the pool, pre-warming minPages
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    for (let i = 0; i < this.config.minPages; i++) {
      this.createPage();
    }

    if (this.config.healthCheckIntervalMs > 0) {
      this.healthCheckInterval = setInterval(() => {
        this.runHealthChecks();
      }, this.config.healthCheckIntervalMs);

      if (this.healthCheckInterval.unref) {
        this.healthCheckInterval.unref();
      }
    }

    this.initialized = true;
  }

  /**
   * Acquire a ready page from the pool (sync fast path)
   */
  acquire(): PooledPage | null {
    const start = performance.now();
    this.totalRequests++;

    for (const pageId of this.readyPages) {
      const page = this.pages.get(pageId);
      if (page && page.health >= this.config.healthThreshold) {
        page.state = 'busy';
        page.lastUsedAt = Date.now();
        this.readyPages.delete(pageId);
        this.cacheHits++;
        this.trackAcquisitionTime(performance.now() - start);
        return page;
      }
      this.readyPages.delete(pageId);
    }

    // Try to create a new page if under capacity (not a cache hit — page is new)
    if (this.pages.size < this.config.maxPages) {
      const page = this.createPage();
      page.state = 'busy';
      this.readyPages.delete(page.id);
      this.trackAcquisitionTime(performance.now() - start);
      return page;
    }

    this.trackAcquisitionTime(performance.now() - start);
    return null;
  }

  /**
   * Acquire a page asynchronously (thread-safe for concurrent callers)
   */
  acquireAsync(): Promise<PooledPage | null> {
    return new Promise((resolve) => {
      this.acquireQueue.push(resolve);
      this.processQueue();
    });
  }

  /**
   * Release a page back to the pool.
   * If there are pending acquireAsync waiters, resolves the next one immediately.
   */
  release(pageId: string): void {
    const page = this.pages.get(pageId);
    if (!page) return;

    page.state = 'ready';
    page.lastUsedAt = Date.now();
    page.requestsServed++;

    if (page.health >= this.config.healthThreshold) {
      // If a waiter is queued, give this page directly to them
      if (this.acquireQueue.length > 0) {
        const resolve = this.acquireQueue.shift()!;
        page.state = 'busy';
        page.lastUsedAt = Date.now();
        this.totalRequests++;
        this.cacheHits++;
        resolve(page);
        return;
      }
      this.readyPages.add(pageId);
    }
  }

  /**
   * Mark a page as errored
   */
  markError(pageId: string): void {
    const page = this.pages.get(pageId);
    if (!page) return;

    page.state = 'error';
    page.errorCount++;
    page.health = Math.max(0, page.health - 0.3);
    this.readyPages.delete(pageId);
  }

  /**
   * Remove errored and timed-out pages, maintain minPages
   */
  prune(): number {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [id, page] of this.pages) {
      const isError = page.state === 'error' || page.health < this.config.healthThreshold;
      const isIdleExpired =
        page.state === 'ready' && now - page.lastUsedAt > this.config.idleTimeoutMs;

      if (isError || isIdleExpired) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.pages.delete(id);
      this.readyPages.delete(id);
    }

    // Maintain minimum pages
    while (this.pages.size < this.config.minPages) {
      this.createPage();
    }

    return toRemove.length;
  }

  /**
   * Get pool statistics
   */
  getStats(): PagePoolStats {
    let readyCount = 0;
    let busyCount = 0;
    let errorCount = 0;

    for (const page of this.pages.values()) {
      switch (page.state) {
        case 'ready':
          readyCount++;
          break;
        case 'busy':
          busyCount++;
          break;
        case 'error':
          errorCount++;
          break;
      }
    }

    const avg =
      this.acquisitionTimes.length > 0
        ? this.acquisitionTimes.reduce((a, b) => a + b, 0) / this.acquisitionTimes.length
        : 0;

    return {
      totalPages: this.pages.size,
      readyPages: readyCount,
      busyPages: busyCount,
      errorPages: errorCount,
      poolHitRate: this.totalRequests > 0 ? this.cacheHits / this.totalRequests : 0,
      avgAcquisitionTimeMs: avg,
    };
  }

  /**
   * Shut down the pool and release all resources
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    for (const page of this.pages.values()) {
      page.state = 'closed';
    }

    this.pages.clear();
    this.readyPages.clear();
    this.initialized = false;

    // Reject any pending acquire requests
    for (const resolve of this.acquireQueue) {
      resolve(null);
    }
    this.acquireQueue = [];
  }

  /**
   * Get a page by id (for diagnostics)
   */
  getPage(pageId: string): PooledPage | undefined {
    return this.pages.get(pageId);
  }

  /**
   * Get all pages (for diagnostics)
   */
  getAllPages(): PooledPage[] {
    return Array.from(this.pages.values());
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private createPage(): PooledPage {
    const id = `page-${randomUUID().split('-')[0]}`;
    const now = Date.now();
    const page: PooledPage = {
      id,
      state: 'ready',
      createdAt: now,
      lastUsedAt: now,
      health: 1.0,
      errorCount: 0,
      requestsServed: 0,
    };
    this.pages.set(id, page);
    this.readyPages.add(id);
    return page;
  }

  private processQueue(): void {
    if (this.processing || this.acquireQueue.length === 0) return;
    this.processing = true;

    const resolve = this.acquireQueue.shift()!;
    try {
      resolve(this.acquire());
    } finally {
      this.processing = false;
      if (this.acquireQueue.length > 0) {
        setImmediate(() => this.processQueue());
      }
    }
  }

  private runHealthChecks(): void {
    for (const page of this.pages.values()) {
      if (page.state === 'closed') continue;

      // Degrade health based on error rate
      const total = page.requestsServed + page.errorCount;
      if (total > 0) {
        const errorRate = page.errorCount / total;
        page.health = Math.max(0, 1 - errorRate * 0.8);
      }

      const wasReady = this.readyPages.has(page.id);
      const isHealthy = page.health >= this.config.healthThreshold;

      if (page.state === 'ready' && !isHealthy) {
        page.state = 'error';
        this.readyPages.delete(page.id);
      } else if (page.state === 'error' && isHealthy && !wasReady) {
        page.state = 'ready';
        this.readyPages.add(page.id);
      }
    }

    this.prune();
  }

  private trackAcquisitionTime(ms: number): void {
    this.acquisitionTimes.push(ms);
    if (this.acquisitionTimes.length > this.MAX_SAMPLES) {
      this.acquisitionTimes.shift();
    }
  }
}

/**
 * Create a new browser page pool instance
 */
export function createBrowserPagePool(
  config?: Partial<BrowserPagePoolConfig>
): BrowserPagePool {
  return new BrowserPagePool(config);
}
