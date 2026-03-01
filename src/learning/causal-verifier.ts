/**
 * Agentic QE v3 - Causal Verifier
 * ADR-052 Phase 3 Action A3.3: Integrate CausalEngine with Causal Discovery
 *
 * Provides causal verification using the Prime Radiant CausalEngine from
 * prime-radiant-advanced-wasm. Integrates intervention-based causal inference
 * with the existing STDP-based causal discovery modules.
 *
 * Use Cases:
 * - Verify if pattern application causally leads to test success/failure
 * - Detect spurious correlations in test failure cascades
 * - Validate causal links in the STDP-based causal graph
 * - Distinguish true causation from confounded relationships
 *
 * @module learning/causal-verifier
 *
 * @example
 * ```typescript
 * import { createCausalVerifier } from './learning/causal-verifier';
 * import { wasmLoader } from './integrations/coherence/wasm-loader';
 *
 * const verifier = createCausalVerifier(wasmLoader);
 * await verifier.initialize();
 *
 * // Verify pattern causality
 * const result = await verifier.verifyPatternCausality(
 *   'pattern-tdd-unit-tests',
 *   'success',
 *   { testCount: 50, coverage: 0.85 }
 * );
 *
 * if (result.isSpurious) {
 *   console.log('Spurious correlation detected!');
 * }
 * ```
 */

import type { CausalAdapter, ICausalAdapter } from '../integrations/coherence/engines/causal-adapter.js';
import type { CausalData, CausalVerification, IWasmLoader } from '../integrations/coherence/types.js';
import { createCausalAdapter } from '../integrations/coherence/engines/causal-adapter.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Direction of a causal relationship
 */
export type CausalDirection = 'forward' | 'reverse' | 'bidirectional' | 'none';

/**
 * Result of causal verification
 */
export interface CausalVerificationResult {
  /** Name of the cause variable */
  cause: string;
  /** Name of the effect variable */
  effect: string;
  /** Whether the correlation is spurious */
  isSpurious: boolean;
  /** Direction of the causal relationship */
  direction: CausalDirection;
  /** Confidence in the causal analysis (0-1) */
  confidence: number;
  /** Effect strength (0-1) */
  effectStrength: number;
  /** Detected confounders */
  confounders: string[];
  /** Human-readable explanation */
  explanation: string;
  /** Analysis duration in milliseconds */
  durationMs: number;
  /** Intervention result details */
  interventionResult?: {
    /** Do-calculus result */
    doCalcResult: number;
    /** Counterfactual analysis */
    counterfactual: number;
  };
}

/**
 * Options for causal verification
 */
export interface CausalVerificationOptions {
  /** Optional confounders to control for */
  confounders?: Record<string, number[]>;
  /** Minimum sample size for reliable analysis (default: 30) */
  minSampleSize?: number;
  /** Confidence threshold for verification (default: 0.7) */
  confidenceThreshold?: number;
}

// ============================================================================
// Causal Verifier Implementation
// ============================================================================

/**
 * Causal Verifier using Prime Radiant CausalEngine
 *
 * Integrates intervention-based causal inference with the existing
 * STDP-based causal discovery modules. Provides rigorous verification
 * of causal relationships and spurious correlation detection.
 */
export class CausalVerifier {
  private causalAdapter: ICausalAdapter | null = null;
  private initialized = false;

  /**
   * Create a new CausalVerifier
   *
   * @param wasmLoader - WASM module loader for coherence engines
   */
  constructor(private readonly wasmLoader: IWasmLoader) {}

  /**
   * Initialize the causal verifier by loading the WASM module
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const isAvailable = await this.wasmLoader.isAvailable();
    if (!isAvailable) {
      throw new Error(
        'WASM module is not available. Cannot initialize CausalVerifier. ' +
        'Ensure prime-radiant-advanced-wasm is installed.'
      );
    }

    this.causalAdapter = await createCausalAdapter(this.wasmLoader);
    this.initialized = true;
  }

  /**
   * Check if the verifier is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Ensure the verifier is initialized before use
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.causalAdapter) {
      throw new Error('CausalVerifier not initialized. Call initialize() first.');
    }
  }

  /**
   * Verify a causal relationship between two variables
   *
   * @param cause - Name of the potential cause variable
   * @param effect - Name of the potential effect variable
   * @param causeValues - Observed values of the cause
   * @param effectValues - Observed values of the effect
   * @param options - Optional verification settings
   * @returns Causal verification result
   *
   * @example
   * ```typescript
   * const result = await verifier.verifyCausalLink(
   *   'test_count',
   *   'bug_detection_rate',
   *   [10, 20, 30, 40, 50],
   *   [0.1, 0.2, 0.3, 0.4, 0.5]
   * );
   * ```
   */
  async verifyCausalLink(
    cause: string,
    effect: string,
    causeValues: number[],
    effectValues: number[],
    options: CausalVerificationOptions = {}
  ): Promise<CausalVerificationResult> {
    this.ensureInitialized();

    const {
      confounders = {},
      minSampleSize = 30,
      confidenceThreshold = 0.7,
    } = options;

    // Validate sample size
    if (causeValues.length < minSampleSize) {
      throw new Error(
        `Sample size ${causeValues.length} is below minimum ${minSampleSize}. ` +
        'Cannot perform reliable causal analysis.'
      );
    }

    if (causeValues.length !== effectValues.length) {
      throw new Error(
        `Cause and effect arrays must have same length. ` +
        `Got ${causeValues.length} and ${effectValues.length}.`
      );
    }

    // Build causal data
    const causalData: CausalData = {
      causeValues,
      effectValues,
      sampleSize: causeValues.length,
      confounders,
    };

    // Perform verification using the adapter
    const verification: CausalVerification = this.causalAdapter!.verifyCausality(
      cause,
      effect,
      causalData
    );

    // Determine causal direction
    const direction = this.determineDirection(verification);

    // Build intervention result
    const interventionResult = {
      doCalcResult: verification.effectStrength,
      counterfactual: this.estimateCounterfactual(verification),
    };

    return {
      cause,
      effect,
      isSpurious: verification.relationshipType === 'spurious',
      direction,
      confidence: verification.confidence,
      effectStrength: verification.effectStrength,
      confounders: verification.confounders,
      explanation: verification.explanation,
      durationMs: verification.durationMs,
      interventionResult,
    };
  }

  /**
   * Verify if pattern application causally leads to a specific outcome
   *
   * @param patternId - Pattern identifier
   * @param outcome - Expected outcome: 'success' or 'failure'
   * @param context - Context data with observations
   * @returns Causal verification result
   *
   * @example
   * ```typescript
   * const result = await verifier.verifyPatternCausality(
   *   'pattern-tdd-unit-tests',
   *   'success',
   *   {
   *     patternApplications: [1, 1, 0, 1, 1],
   *     testSuccesses: [1, 1, 0, 1, 1]
   *   }
   * );
   * ```
   */
  async verifyPatternCausality(
    patternId: string,
    outcome: 'success' | 'failure',
    context: {
      patternApplications: number[];
      outcomes: number[];
      confounders?: Record<string, number[]>;
    }
  ): Promise<CausalVerificationResult> {
    const { patternApplications, outcomes, confounders } = context;

    return this.verifyCausalLink(
      `pattern:${patternId}`,
      `outcome:${outcome}`,
      patternApplications,
      outcomes,
      { confounders }
    );
  }

  /**
   * Verify a causal link in the STDP-based causal graph
   *
   * This integrates with the existing CausalGraphImpl to verify
   * whether a discovered causal edge is a true causal relationship
   * or a spurious correlation.
   *
   * @param sourceEvent - Source event type
   * @param targetEvent - Target event type
   * @param observations - Temporal observations of the events
   * @returns Causal verification result
   *
   * @example
   * ```typescript
   * const result = await verifier.verifyCausalEdge(
   *   'test_failed',
   *   'build_failed',
   *   {
   *     sourceOccurrences: [1, 0, 1, 1, 0],
   *     targetOccurrences: [0, 0, 1, 1, 0],
   *   }
   * );
   * ```
   */
  async verifyCausalEdge(
    sourceEvent: string,
    targetEvent: string,
    observations: {
      sourceOccurrences: number[];
      targetOccurrences: number[];
      confounders?: Record<string, number[]>;
    }
  ): Promise<CausalVerificationResult> {
    const { sourceOccurrences, targetOccurrences, confounders } = observations;

    return this.verifyCausalLink(
      sourceEvent,
      targetEvent,
      sourceOccurrences,
      targetOccurrences,
      { confounders }
    );
  }

  /**
   * Batch verify multiple causal links
   *
   * @param links - Array of causal links to verify
   * @returns Array of verification results
   */
  async verifyBatch(
    links: Array<{
      cause: string;
      effect: string;
      causeValues: number[];
      effectValues: number[];
      options?: CausalVerificationOptions;
    }>
  ): Promise<CausalVerificationResult[]> {
    this.ensureInitialized();

    const results: CausalVerificationResult[] = [];

    for (const link of links) {
      const result = await this.verifyCausalLink(
        link.cause,
        link.effect,
        link.causeValues,
        link.effectValues,
        link.options
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Determine the direction of the causal relationship
   */
  private determineDirection(verification: CausalVerification): CausalDirection {
    const { relationshipType, effectStrength } = verification;

    if (relationshipType === 'none' || relationshipType === 'spurious') {
      return 'none';
    }

    if (relationshipType === 'reverse') {
      return 'reverse';
    }

    if (relationshipType === 'confounded') {
      // Confounded relationships might still have directionality
      return effectStrength > 0.5 ? 'forward' : 'bidirectional';
    }

    // causal type
    return effectStrength > 0.3 ? 'forward' : 'bidirectional';
  }

  /**
   * Estimate counterfactual effect
   *
   * This is a simplified estimation. In a full implementation,
   * this would use the CausalEngine's counterfactual methods.
   */
  private estimateCounterfactual(verification: CausalVerification): number {
    const { effectStrength, relationshipType } = verification;

    if (relationshipType === 'spurious' || relationshipType === 'none') {
      return 0;
    }

    // Estimate counterfactual as inverse of observed effect
    return 1 - effectStrength;
  }

  /**
   * Clear the engine state
   */
  clear(): void {
    if (this.causalAdapter) {
      this.causalAdapter.clear();
    }
  }

  /**
   * Dispose of verifier resources
   */
  dispose(): void {
    if (this.causalAdapter) {
      this.causalAdapter.dispose();
      this.causalAdapter = null;
    }
    this.initialized = false;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create and initialize a CausalVerifier
 *
 * @param wasmLoader - WASM module loader
 * @returns Initialized causal verifier
 *
 * @example
 * ```typescript
 * import { createCausalVerifier } from './learning/causal-verifier';
 * import { wasmLoader } from './integrations/coherence/wasm-loader';
 *
 * const verifier = await createCausalVerifier(wasmLoader);
 * ```
 */
export async function createCausalVerifier(
  wasmLoader: IWasmLoader
): Promise<CausalVerifier> {
  const verifier = new CausalVerifier(wasmLoader);
  await verifier.initialize();
  return verifier;
}

/**
 * Create a CausalVerifier without initializing
 *
 * Use this when you want to delay initialization or handle it manually.
 *
 * @param wasmLoader - WASM module loader
 * @returns Uninitialized causal verifier
 */
export function createUninitializedCausalVerifier(
  wasmLoader: IWasmLoader
): CausalVerifier {
  return new CausalVerifier(wasmLoader);
}
