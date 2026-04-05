/**
 * Shared RVF Adapter Singleton
 *
 * Provides a single RvfNativeAdapter instance for .agentic-qe/patterns.rvf.
 * Used by both the kernel (agent branching) and DreamEngine (COW dreams)
 * to avoid dual file handles to the same .rvf file.
 *
 * Returns null when native bindings are unavailable — callers degrade
 * gracefully.
 *
 * @module integrations/ruvector/shared-rvf-adapter
 */

import type { RvfNativeAdapter } from './rvf-native-adapter.js';

let sharedAdapter: RvfNativeAdapter | null = null;
let initAttempted = false;

/**
 * Get or create the shared RvfNativeAdapter singleton for patterns.rvf.
 *
 * @param dataDir - Data directory (default: .agentic-qe)
 * @param dimensions - Vector dimensions (default: 384)
 * @returns The shared adapter, or null if native bindings are unavailable
 */
export function getSharedRvfAdapter(
  dataDir = '.agentic-qe',
  dimensions = 384,
): RvfNativeAdapter | null {
  if (initAttempted) return sharedAdapter;
  initAttempted = true;

  try {
    // Dynamic require to match the bundled build pattern used elsewhere
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isRvfNativeAvailable, createRvfStore } = require('./rvf-native-adapter.js');

    if (!isRvfNativeAvailable()) {
      console.warn(
        '[RVF] Native bindings unavailable — agent branching and dream COW disabled. ' +
        'Install @ruvector/rvf-node to enable.',
      );
      return null;
    }

    const path = require('path');
    sharedAdapter = createRvfStore(
      path.join(dataDir, 'patterns.rvf'),
      dimensions,
    );
    return sharedAdapter;
  } catch (error) {
    console.warn(
      '[RVF] Shared adapter init failed:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/** Close the shared adapter and reset the singleton. */
export function resetSharedRvfAdapter(): void {
  if (sharedAdapter) {
    try { sharedAdapter.close(); } catch { /* best effort */ }
    sharedAdapter = null;
  }
  initAttempted = false;
}
