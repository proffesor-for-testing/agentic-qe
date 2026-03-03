/**
 * Browser Page Pool Types
 *
 * Manages concurrent browser pages for parallel E2E test execution.
 * Follows the ConnectionPoolImpl pattern from src/mcp/connection-pool.ts.
 *
 * @module integrations/browser/page-pool-types
 */

// ============================================================================
// Page State
// ============================================================================

/**
 * State of a pooled browser page
 */
export type PageState = 'ready' | 'busy' | 'error' | 'closed';

/**
 * A managed browser page within the pool
 */
export interface PooledPage {
  /** Unique page identifier */
  id: string;
  /** Current page state */
  state: PageState;
  /** When the page was created (ms since epoch) */
  createdAt: number;
  /** When the page was last used (ms since epoch) */
  lastUsedAt: number;
  /** Health score (0-1, where 1 is healthy) */
  health: number;
  /** Current URL */
  url?: string;
  /** Cumulative error count */
  errorCount: number;
  /** Total requests served by this page */
  requestsServed: number;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Browser page pool configuration
 */
export interface BrowserPagePoolConfig {
  /** Maximum concurrent pages (default: 6) */
  maxPages: number;
  /** Minimum pre-warmed pages (default: 1) */
  minPages: number;
  /** Idle timeout before page is closed in ms (default: 120000) */
  idleTimeoutMs: number;
  /** Health check interval in ms (default: 15000) */
  healthCheckIntervalMs: number;
  /** Minimum health score to keep a page (default: 0.5) */
  healthThreshold: number;
}

/**
 * Default page pool configuration
 */
export const DEFAULT_PAGE_POOL_CONFIG: BrowserPagePoolConfig = {
  maxPages: 6,
  minPages: 1,
  idleTimeoutMs: 120_000,
  healthCheckIntervalMs: 15_000,
  healthThreshold: 0.5,
};

// ============================================================================
// Statistics
// ============================================================================

/**
 * Page pool statistics for monitoring
 */
export interface PagePoolStats {
  /** Total pages in the pool */
  totalPages: number;
  /** Pages ready for use */
  readyPages: number;
  /** Pages currently in use */
  busyPages: number;
  /** Pages in error state */
  errorPages: number;
  /** Ratio of successful acquisitions to total attempts */
  poolHitRate: number;
  /** Average time to acquire a page in ms */
  avgAcquisitionTimeMs: number;
}
