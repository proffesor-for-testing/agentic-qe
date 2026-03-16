/**
 * Transfer Coherence Gate Stub (Task 2.3)
 *
 * Provides a pass-through coherence gate for cross-domain transfer validation.
 * When the `useCoherenceGate` feature flag is enabled, the factory function
 * returns the real CoherenceGate (backed by prime-radiant-advanced-wasm).
 * Otherwise, returns the pass-through stub.
 *
 * The interface is stable and must not change when the real implementation
 * is swapped in.
 *
 * @module integrations/ruvector/transfer-coherence-stub
 */

import { createRequire } from 'module';
import { getRuVectorFeatureFlags } from './feature-flags.js';

const esmRequire = createRequire(import.meta.url);

// ============================================================================
// Interface
// ============================================================================

/**
 * Coherence validation result for a cross-domain transfer.
 */
export interface CoherenceValidation {
  /** Whether the transfer is approved by the coherence gate */
  approved: boolean;
  /** Coherence energy score (lower = more coherent). Undefined when stub is used. */
  energy?: number;
  /** Reason for rejection (only set when approved is false) */
  rejectionReason?: string;
}

/**
 * Interface for the transfer coherence gate.
 *
 * Validates that a pattern transfer between domains does not introduce
 * contradictions or reduce overall system coherence. The gate evaluates
 * the energy landscape of the target domain with the proposed pattern
 * and rejects transfers that would destabilize learned knowledge.
 */
export interface ITransferCoherenceGate {
  /**
   * Validate whether a pattern can be transferred to a target domain
   * without introducing coherence violations.
   *
   * @param pattern - The pattern to transfer (any pattern-like object with domain info)
   * @param targetDomain - The domain to transfer the pattern into
   * @returns Validation result with approval status and optional energy score
   */
  validateTransfer(
    pattern: { id?: string; domain?: string; confidence?: number; [key: string]: unknown },
    targetDomain: string,
  ): CoherenceValidation;
}

// ============================================================================
// Stub Implementation
// ============================================================================

/**
 * Stub coherence gate that always approves transfers.
 *
 * This is a pass-through implementation used until the real coherence gate
 * (ADR-083) is implemented in Task 3.1. It serves as a placeholder to
 * keep the transfer pipeline functional while the coherence system is
 * being developed.
 */
export class TransferCoherenceStub implements ITransferCoherenceGate {
  /**
   * Always approves the transfer (pass-through stub).
   *
   * @param _pattern - Ignored in stub
   * @param _targetDomain - Ignored in stub
   * @returns Always returns { approved: true }
   */
  validateTransfer(
    _pattern: { id?: string; domain?: string; confidence?: number; [key: string]: unknown },
    _targetDomain: string,
  ): CoherenceValidation {
    return { approved: true };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a transfer coherence gate.
 *
 * When the `useCoherenceGate` feature flag is enabled, returns the real
 * CoherenceGate backed by sheaf cohomology energy computation.
 * Otherwise returns the pass-through stub.
 */
export function createTransferCoherenceGate(): ITransferCoherenceGate {
  if (getRuVectorFeatureFlags().useCoherenceGate) {
    try {
      // Dynamic require to avoid circular dependency at module level
      const { CoherenceGate } = esmRequire('./coherence-gate.js');
      return new CoherenceGate();
    } catch {
      // Fall through to stub if CoherenceGate fails to load
    }
  }
  return new TransferCoherenceStub();
}
