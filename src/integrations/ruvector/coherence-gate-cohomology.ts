/**
 * Coherence Gate - CohomologyEngine WASM Lazy Loader
 *
 * Lazily loads the CohomologyEngine from prime-radiant-advanced-wasm.
 * Returns null when the WASM module is unavailable, allowing fallback
 * to word-frequency cosine similarity.
 *
 * @module integrations/ruvector/coherence-gate-cohomology
 * @see ADR-083-coherence-gated-agent-actions.md
 */

import { createRequire } from 'module';
import { LoggerFactory } from '../../logging/index.js';

const esmRequire = createRequire(import.meta.url);
const logger = LoggerFactory.create('coherence-gate-cohomology');

/**
 * Minimal interface for the CohomologyEngine from prime-radiant-advanced-wasm.
 */
export interface ICohomologyEngine {
  consistencyEnergy(graph: {
    nodes: Array<{ id: number; label: string; section: number[]; weight: number }>;
    edges: Array<{
      source: number;
      target: number;
      weight: number;
      restriction_map: number[];
      source_dim: number;
      target_dim: number;
    }>;
  }): number;
}

let cohomologyEngine: ICohomologyEngine | null = null;
let cohomologyLoadAttempted = false;

/**
 * Lazily load the CohomologyEngine from prime-radiant-advanced-wasm.
 * Returns null if the WASM module is unavailable.
 */
export function getCohomologyEngine(): ICohomologyEngine | null {
  if (cohomologyLoadAttempted) return cohomologyEngine;
  cohomologyLoadAttempted = true;

  try {
    const pr = esmRequire('prime-radiant-advanced-wasm');
    const fs = esmRequire('fs');
    const path = esmRequire('path');
    const wasmPath = path.join(
      path.dirname(require.resolve('prime-radiant-advanced-wasm')),
      'prime_radiant_advanced_wasm_bg.wasm',
    );
    pr.initSync({ module: fs.readFileSync(wasmPath) });
    cohomologyEngine = new pr.CohomologyEngine() as ICohomologyEngine;
    logger.info('CohomologyEngine loaded from prime-radiant-advanced-wasm');
  } catch (err) {
    logger.debug('CohomologyEngine unavailable, using word-frequency fallback', { error: String(err) });
    cohomologyEngine = null;
  }

  return cohomologyEngine;
}

/**
 * Reset the CohomologyEngine loader state (for testing).
 */
export function resetCohomologyEngineLoader(): void {
  cohomologyEngine = null;
  cohomologyLoadAttempted = false;
}
