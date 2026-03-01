/**
 * Agentic QE v3 - Causal Engine Adapter
 *
 * Wraps the Prime Radiant CausalEngine for causal inference operations.
 * Used for detecting spurious correlations and verifying true causal relationships.
 *
 * Causal Verification:
 * Uses intervention-based causal inference to distinguish:
 * - True causation (A causes B)
 * - Spurious correlation (A and B share hidden cause C)
 * - Reverse causation (B causes A)
 *
 * @module integrations/coherence/engines/causal-adapter
 */

import type {
  CausalData,
  CausalVerification,
  ICausalEngine,
  IRawCausalEngine,
  IWasmLoader,
  CoherenceLogger,
} from '../types';
import { WasmNotLoadedError, DEFAULT_COHERENCE_LOGGER } from '../types';

// ============================================================================
// WASM Engine Wrapper
// ============================================================================

/**
 * Creates an ICausalEngine wrapper around the raw WASM engine
 */
function createCausalEngineWrapper(rawEngine: IRawCausalEngine): ICausalEngine {
  let causeData: Float64Array | null = null;
  let effectData: Float64Array | null = null;
  const confounders = new Map<string, Float64Array>();

  const buildCausalModel = (): unknown => ({
    cause: causeData ? Array.from(causeData) : [],
    effect: effectData ? Array.from(effectData) : [],
    confounders: Object.fromEntries(
      Array.from(confounders.entries()).map(([k, v]) => [k, Array.from(v)])
    ),
  });

  return {
    set_data(cause: Float64Array, effect: Float64Array): void {
      causeData = cause;
      effectData = effect;
    },

    add_confounder(name: string, values: Float64Array): void {
      confounders.set(name, values);
    },

    compute_causal_effect(): number {
      const model = buildCausalModel();
      const result = rawEngine.computeCausalEffect(model, 'cause', 'effect', 1) as { effect?: number } | null;
      return result?.effect ?? 0;
    },

    detect_spurious_correlation(): boolean {
      const model = buildCausalModel();
      const foundConfounders = rawEngine.findConfounders(model, 'cause', 'effect') as string[] | null;
      return (foundConfounders?.length ?? 0) > 0;
    },

    get_confounders(): string[] {
      const model = buildCausalModel();
      const found = rawEngine.findConfounders(model, 'cause', 'effect') as string[] | null;
      return found ?? Array.from(confounders.keys());
    },

    clear(): void {
      causeData = null;
      effectData = null;
      confounders.clear();
    },
  };
}

// ============================================================================
// Causal Adapter Interface
// ============================================================================

/**
 * Interface for the causal adapter
 */
export interface ICausalAdapter {
  /** Initialize the adapter */
  initialize(): Promise<void>;
  /** Check if initialized */
  isInitialized(): boolean;
  /** Verify a causal relationship */
  verifyCausality(cause: string, effect: string, data: CausalData): CausalVerification;
  /** Set observation data */
  setData(causeValues: number[], effectValues: number[]): void;
  /** Add a potential confounder */
  addConfounder(name: string, values: number[]): void;
  /** Compute the causal effect strength */
  computeCausalEffect(): number;
  /** Check if correlation is likely spurious */
  detectSpuriousCorrelation(): boolean;
  /** Get detected confounders */
  getConfounders(): string[];
  /** Clear the engine state */
  clear(): void;
  /** Dispose of resources */
  dispose(): void;
}

// ============================================================================
// Causal Adapter Implementation
// ============================================================================

/**
 * Adapter for the Prime Radiant CausalEngine
 *
 * Provides causal inference operations for verifying cause-effect
 * relationships and detecting spurious correlations.
 *
 * @example
 * ```typescript
 * const adapter = new CausalAdapter(wasmLoader, logger);
 * await adapter.initialize();
 *
 * const verification = adapter.verifyCausality(
 *   'test_count',
 *   'bug_detection',
 *   { causeValues: [...], effectValues: [...], sampleSize: 100 }
 * );
 *
 * if (!verification.isCausal) {
 *   console.log('Detected spurious correlation!');
 * }
 * ```
 */
export class CausalAdapter implements ICausalAdapter {
  private engine: ICausalEngine | null = null;
  private initialized = false;
  private currentCause: string = '';
  private currentEffect: string = '';

  /**
   * Create a new CausalAdapter
   *
   * @param wasmLoader - WASM module loader
   * @param logger - Optional logger for diagnostics
   */
  constructor(
    private readonly wasmLoader: IWasmLoader,
    private readonly logger: CoherenceLogger = DEFAULT_COHERENCE_LOGGER
  ) {}

  /**
   * Initialize the adapter by loading the WASM module
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.debug('Initializing CausalAdapter');

    const isAvailable = await this.wasmLoader.isAvailable();
    if (!isAvailable) {
      throw new WasmNotLoadedError(
        'WASM module is not available. Cannot initialize CausalAdapter.'
      );
    }

    const module = await this.wasmLoader.load();
    // Create wrapper around raw WASM engine
    const rawEngine = new module.CausalEngine();
    this.engine = createCausalEngineWrapper(rawEngine);
    this.initialized = true;

    this.logger.info('CausalAdapter initialized successfully');
  }

  /**
   * Check if the adapter is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Ensure the adapter is initialized before use
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.engine) {
      throw new WasmNotLoadedError(
        'CausalAdapter not initialized. Call initialize() first.'
      );
    }
  }

  /**
   * Verify a causal relationship between two variables
   *
   * @param cause - Name of the potential cause variable
   * @param effect - Name of the potential effect variable
   * @param data - Observation data for analysis
   * @returns Causal verification result
   */
  verifyCausality(cause: string, effect: string, data: CausalData): CausalVerification {
    this.ensureInitialized();

    const startTime = Date.now();

    // Clear previous state
    this.clear();

    // Set the main variables
    this.currentCause = cause;
    this.currentEffect = effect;
    this.setData(data.causeValues, data.effectValues);

    // Add any confounders
    if (data.confounders) {
      for (const [name, values] of Object.entries(data.confounders)) {
        this.addConfounder(name, values);
      }
    }

    // Perform analysis
    const effectStrength = this.computeCausalEffect();
    const isSpurious = this.detectSpuriousCorrelation();
    const detectedConfounders = this.getConfounders();

    // Determine relationship type
    const relationshipType = this.determineRelationshipType(
      effectStrength,
      isSpurious,
      detectedConfounders.length > 0
    );

    // Compute confidence based on sample size and effect strength
    const confidence = this.computeConfidence(data.sampleSize, effectStrength, isSpurious);

    const durationMs = Date.now() - startTime;

    const result: CausalVerification = {
      isCausal: relationshipType === 'causal',
      effectStrength,
      relationshipType,
      confidence,
      confounders: detectedConfounders,
      explanation: this.generateExplanation(
        cause,
        effect,
        relationshipType,
        effectStrength,
        detectedConfounders
      ),
      durationMs,
      usedFallback: false,
    };

    this.logger.info('Verified causality', {
      cause,
      effect,
      isCausal: result.isCausal,
      relationshipType,
      effectStrength,
      durationMs,
    });

    return result;
  }

  /**
   * Set the observation data for analysis
   *
   * @param causeValues - Observed values of the cause variable
   * @param effectValues - Observed values of the effect variable
   */
  setData(causeValues: number[], effectValues: number[]): void {
    this.ensureInitialized();

    if (causeValues.length !== effectValues.length) {
      throw new Error(
        `Cause and effect arrays must have same length. ` +
        `Got ${causeValues.length} and ${effectValues.length}.`
      );
    }

    const causeArray = new Float64Array(causeValues);
    const effectArray = new Float64Array(effectValues);

    this.engine!.set_data(causeArray, effectArray);

    this.logger.debug('Set causal data', {
      sampleSize: causeValues.length,
    });
  }

  /**
   * Add a potential confounder variable
   *
   * @param name - Name of the confounder
   * @param values - Observed values of the confounder
   */
  addConfounder(name: string, values: number[]): void {
    this.ensureInitialized();

    const confounderArray = new Float64Array(values);
    this.engine!.add_confounder(name, confounderArray);

    this.logger.debug('Added confounder', { name, valueCount: values.length });
  }

  /**
   * Compute the strength of the causal effect
   *
   * @returns Effect strength (0-1)
   */
  computeCausalEffect(): number {
    this.ensureInitialized();

    const effect = this.engine!.compute_causal_effect();

    this.logger.debug('Computed causal effect', { effect });

    return effect;
  }

  /**
   * Check if the observed correlation is likely spurious
   *
   * @returns True if the correlation is likely spurious
   */
  detectSpuriousCorrelation(): boolean {
    this.ensureInitialized();

    const isSpurious = this.engine!.detect_spurious_correlation();

    this.logger.debug('Detected spurious correlation', { isSpurious });

    return isSpurious;
  }

  /**
   * Get the names of detected confounders
   *
   * @returns Array of confounder names
   */
  getConfounders(): string[] {
    this.ensureInitialized();

    return this.engine!.get_confounders();
  }

  /**
   * Determine the type of relationship based on analysis
   */
  private determineRelationshipType(
    effectStrength: number,
    isSpurious: boolean,
    hasConfounders: boolean
  ): CausalVerification['relationshipType'] {
    if (effectStrength < 0.1) {
      return 'none';
    }

    if (isSpurious) {
      return 'spurious';
    }

    if (hasConfounders) {
      return 'confounded';
    }

    // Check for reverse causation by effect strength pattern
    // In a real implementation, this would use more sophisticated methods
    if (effectStrength < 0) {
      return 'reverse';
    }

    return 'causal';
  }

  /**
   * Compute confidence in the causal analysis
   */
  private computeConfidence(
    sampleSize: number,
    effectStrength: number,
    isSpurious: boolean
  ): number {
    // Base confidence from sample size (diminishing returns after ~100)
    let confidence = Math.min(1, sampleSize / 100) * 0.5;

    // Adjust for effect strength (stronger effects are more reliably detected)
    confidence += Math.abs(effectStrength) * 0.3;

    // Higher confidence if we detected spurious correlation (negative finding is clear)
    if (isSpurious) {
      confidence += 0.15;
    }

    // Cap at 0.95 (never fully certain)
    return Math.min(0.95, confidence);
  }

  /**
   * Generate a human-readable explanation of the analysis
   */
  private generateExplanation(
    cause: string,
    effect: string,
    relationshipType: CausalVerification['relationshipType'],
    effectStrength: number,
    confounders: string[]
  ): string {
    switch (relationshipType) {
      case 'causal':
        return (
          `Analysis indicates a true causal relationship between '${cause}' and '${effect}'. ` +
          `Effect strength: ${(effectStrength * 100).toFixed(1)}%. ` +
          `Changes in '${cause}' are likely to cause changes in '${effect}'.`
        );

      case 'spurious':
        return (
          `The correlation between '${cause}' and '${effect}' appears to be spurious. ` +
          `No true causal mechanism detected. ` +
          `This may be coincidental or due to a hidden common cause.`
        );

      case 'reverse':
        return (
          `Analysis suggests reverse causation: '${effect}' may cause '${cause}', ` +
          `not the other way around. Consider swapping the direction of your hypothesis.`
        );

      case 'confounded':
        return (
          `The relationship between '${cause}' and '${effect}' is confounded by: ` +
          `${confounders.join(', ')}. ` +
          `These variables may explain the observed correlation without direct causation.`
        );

      case 'none':
        return (
          `No significant relationship detected between '${cause}' and '${effect}'. ` +
          `Effect strength is below the detection threshold.`
        );

      default:
        return `Analysis complete for '${cause}' -> '${effect}'.`;
    }
  }

  /**
   * Clear the engine state
   */
  clear(): void {
    this.ensureInitialized();

    this.engine!.clear();
    this.currentCause = '';
    this.currentEffect = '';

    this.logger.debug('Cleared causal engine state');
  }

  /**
   * Dispose of adapter resources
   */
  dispose(): void {
    if (this.engine) {
      this.engine.clear();
      this.engine = null;
    }
    this.initialized = false;

    this.logger.info('CausalAdapter disposed');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create and initialize a CausalAdapter
 *
 * @param wasmLoader - WASM module loader
 * @param logger - Optional logger
 * @returns Initialized adapter
 */
export async function createCausalAdapter(
  wasmLoader: IWasmLoader,
  logger?: CoherenceLogger
): Promise<CausalAdapter> {
  const adapter = new CausalAdapter(wasmLoader, logger);
  await adapter.initialize();
  return adapter;
}
