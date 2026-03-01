/**
 * Shared RVF Dual-Writer Singleton
 *
 * Provides a lazy-initialized singleton RvfDualWriter for production use.
 * Follows the same pattern as getSharedMemoryBackend() in mcp/tools/base.ts.
 *
 * All QEReasoningBank instances share one RvfDualWriter so that RVF
 * replication is centralized and consistent.
 *
 * Graceful degradation: when @ruvector/rvf-node native binding is
 * unavailable, getSharedRvfDualWriter() returns null and all callers
 * continue with SQLite-only operation.
 */

// All RVF imports are dynamic to avoid pulling native .node files into the bundle.
// Type-only import for RvfDualWriter (erased at runtime).
import type { RvfDualWriter } from './rvf-dual-writer.js';

// ============================================================================
// Singleton State
// ============================================================================

let sharedDualWriter: RvfDualWriter | null = null;
let initPromise: Promise<RvfDualWriter | null> | null = null;
/** Tracks whether we already attempted init (to avoid retrying on null result) */
let initAttempted = false;

// ============================================================================
// Public API
// ============================================================================

/**
 * Get or create the shared RvfDualWriter singleton.
 *
 * Returns null when:
 * - AQE_RVF_MODE=sqlite-only (operator override)
 * - Native RVF binding is not available on this platform
 * - Unified memory DB handle cannot be obtained
 *
 * The writer is initialized in dual-write mode by default:
 * SQLite stays source of truth, RVF receives best-effort replication.
 */
export async function getSharedRvfDualWriter(): Promise<RvfDualWriter | null> {
  // Return cached result (including null)
  if (initAttempted && !initPromise) {
    return sharedDualWriter;
  }

  // Wait for in-progress initialization
  if (initPromise) {
    return initPromise;
  }

  // Start initialization
  initPromise = (async (): Promise<RvfDualWriter | null> => {
    try {
      // Env override: operator can force sqlite-only
      const rvfMode = process.env.AQE_RVF_MODE;
      if (rvfMode === 'sqlite-only') {
        return null;
      }

      // Auto-detect native availability (dynamic import to avoid bundling .node files)
      const { isRvfNativeAvailable } = await import('./rvf-native-adapter.js');
      if (!isRvfNativeAvailable()) {
        return null;
      }

      // Get DB handle from unified memory
      const { getUnifiedMemory } = await import('../../kernel/unified-memory.js');
      const unifiedMemory = getUnifiedMemory();
      const db = unifiedMemory.getDatabase();

      if (!db) {
        return null;
      }

      // Create dual-writer (dynamic import to avoid bundling .node files)
      const { RvfDualWriter: DualWriterClass } = await import('./rvf-dual-writer.js');
      const writer = new DualWriterClass(db, {
        rvfPath: '.agentic-qe/brain.rvf',
        mode: 'dual-write',
        dimensions: 384,
      });

      await writer.initialize();
      sharedDualWriter = writer;
      return writer;
    } catch (error) {
      // RVF initialization failed — degrade to sqlite-only
      if (process.env.DEBUG || process.env.AQE_VERBOSE) {
        console.debug('[RVF] Dual-writer init failed, degrading to sqlite-only:', error instanceof Error ? error.message : error);
      }
      return null;
    } finally {
      initAttempted = true;
      initPromise = null;
      // Register our reset function with MCP base module for synchronous cleanup.
      // Runs once regardless of success/failure. Dynamic import avoids hard dependency.
      import('../../mcp/tools/base.js')
        .then(({ registerRvfResetFn }) => registerRvfResetFn(resetSharedRvfDualWriter))
        .catch(() => { /* MCP base module not available (CLI context) — skip */ });
    }
  })();

  return initPromise;
}

/**
 * Get the cached RvfDualWriter synchronously.
 *
 * Returns the instance if already initialized, or null if not yet
 * initialized or if native RVF is unavailable.
 */
export function getSharedRvfDualWriterSync(): RvfDualWriter | null {
  return sharedDualWriter;
}

/**
 * Reset the shared RvfDualWriter singleton.
 *
 * Closes the RVF store and clears cached state.
 * Used in tests and during shutdown.
 */
export function resetSharedRvfDualWriter(): void {
  if (sharedDualWriter) {
    try {
      sharedDualWriter.close();
    } catch {
      // Ignore close errors during cleanup
    }
    sharedDualWriter = null;
  }
  initPromise = null;
  initAttempted = false;
}
