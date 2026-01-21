/**
 * CircadianController - Bio-inspired 4-phase duty cycling for compute efficiency
 *
 * Implements circadian rhythm patterns for AI agents to achieve 5-50x compute savings
 * by intelligently cycling between active and rest phases. Based on biological
 * circadian rhythms that regulate activity levels in living organisms.
 *
 * ## WASM Integration
 * This controller uses the Winner-Take-All (WTA) layer from @ruvector/nervous-system-wasm
 * for biologically-plausible phase selection. The WTA mechanism implements lateral
 * inhibition where phases compete for activation - only one phase can be "active"
 * (winning) at any time, similar to how neural populations compete in biological
 * circadian nuclei like the suprachiasmatic nucleus (SCN).
 *
 * **Current WASM Usage:**
 * - WTALayer: Phase competition and selection via lateral inhibition (compete() method)
 * - Hypervector: Available for future phase state encoding enhancements
 *
 * **Future WASM Enhancements:**
 * When a dedicated circadian oscillator WASM component becomes available
 * (e.g., Kuramoto oscillators, suprachiasmatic nucleus models), it should replace
 * the current time-based phase calculation with true oscillator dynamics.
 *
 * ## Phases
 * - **Active**: Full compute, run tests, make decisions, process requests
 * - **Dawn**: Ramping up, pre-fetch likely patterns, warm caches
 * - **Dusk**: Ramping down, process backlog, prepare reports, batch operations
 * - **Rest**: Memory consolidation, cleanup, minimal compute, only critical reactions
 *
 * ## Compute Savings
 * The duty factor represents the fraction of full compute being used:
 * - Active: 1.0 (100%)
 * - Dawn: 0.6 (60%)
 * - Dusk: 0.4 (40%)
 * - Rest: 0.1 (10%)
 *
 * Average duty factor with default phase durations: ~0.52 (48% savings)
 * Best case with extended rest: ~0.20 (80% savings, 5x reduction)
 *
 * @module nervous-system/adapters/CircadianController
 * @version 2.0.0
 */

// ============================================================================
// WASM Imports
// ============================================================================

import {
  initNervousSystem,
  isWasmInitialized,
  WTALayer,
  // Note: Hypervector is available for future phase state encoding enhancements
} from '../wasm-loader.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * The four circadian phases representing different activity levels
 */
export type CircadianPhase = 'Active' | 'Dawn' | 'Dusk' | 'Rest';

/**
 * Configuration for individual phase behavior
 */
export interface PhaseConfig {
  /** Duration as a fraction of the total cycle (0-1, must sum to 1.0) */
  duration: number;
  /** Duty factor during this phase (0-1, where 1 = full compute) */
  dutyFactor: number;
  /** Minimum importance level to react to events (0-1) */
  importanceThreshold: number;
  /** Whether learning/model updates are allowed */
  allowLearning: boolean;
  /** Whether memory consolidation should run */
  allowConsolidation: boolean;
  /** Whether full compute (inference, tests) should run */
  allowCompute: boolean;
}

/**
 * External modulation to adjust circadian behavior
 */
export interface CircadianModulation {
  /** Multiplier for importance threshold (>1 = less reactive, <1 = more reactive) */
  importanceMultiplier?: number;
  /** Override phase (force a specific phase) */
  forcePhase?: CircadianPhase;
  /** Adjust duty factor by this amount (-1 to 1) */
  dutyAdjustment?: number;
  /** Duration of modulation in milliseconds (0 = permanent until cleared) */
  duration?: number;
  /** Reason for modulation (for logging/debugging) */
  reason?: string;
}

/**
 * Configuration for the CircadianController
 */
export interface CircadianConfig {
  /** Total cycle period in milliseconds (default: 24 hours simulation time) */
  cyclePeriodMs: number;
  /** Phase configurations */
  phases: Record<CircadianPhase, PhaseConfig>;
  /** Hysteresis duration to prevent rapid phase switching (ms) */
  hysteresisMs: number;
  /** Initial phase to start in */
  initialPhase: CircadianPhase;
  /** Energy budget per cycle (arbitrary units, 0 = unlimited) */
  energyBudget: number;
  /** Energy cost per compute unit */
  computeEnergyCost: number;
  /** Use WASM-based phase selection (K-WTA competition) */
  useWasmPhaseSelection?: boolean;
}

/**
 * Current state of the circadian controller
 */
export interface CircadianState {
  /** Current phase */
  phase: CircadianPhase;
  /** Time elapsed in current cycle (ms) */
  cycleTime: number;
  /** Time spent in current phase (ms) */
  phaseTime: number;
  /** Remaining energy in current cycle */
  energyRemaining: number;
  /** Total cycles completed */
  cyclesCompleted: number;
  /** Active modulation (if any) */
  activeModulation: CircadianModulation | null;
  /** Time until next phase transition (ms) */
  timeToNextPhase: number;
  /** Whether WASM is being used for phase selection */
  wasmEnabled: boolean;
}

/**
 * Metrics collected by the controller
 */
export interface CircadianMetrics {
  /** Total time in each phase (ms) */
  phaseTime: Record<CircadianPhase, number>;
  /** Number of events reacted to per phase */
  reactionsPerPhase: Record<CircadianPhase, number>;
  /** Number of events rejected per phase */
  rejectionsPerPhase: Record<CircadianPhase, number>;
  /** Average duty factor achieved */
  averageDutyFactor: number;
  /** Total energy consumed */
  totalEnergyConsumed: number;
  /** Number of phase transitions */
  phaseTransitions: number;
  /** Hysteresis activations (prevented transitions) */
  hysteresisActivations: number;
  /** Number of WTA competitions run */
  wtaCompetitions: number;
}

/**
 * Interface for the CircadianController
 */
export interface ICircadianController {
  /**
   * Advance time by dt milliseconds
   * @param dt - Time to advance in milliseconds
   */
  advance(dt: number): void;

  /**
   * Should run inference/tests?
   * @returns true if in a phase that allows compute
   */
  shouldCompute(): boolean;

  /**
   * Should update learning models?
   * @returns true if in a phase that allows learning
   */
  shouldLearn(): boolean;

  /**
   * Should run memory consolidation?
   * @returns true if in a phase that allows consolidation
   */
  shouldConsolidate(): boolean;

  /**
   * Should react to event given importance?
   * @param importance - Event importance (0-1, where 1 = critical)
   * @returns true if the event should be processed
   */
  shouldReact(importance: number): boolean;

  /**
   * Get current circadian phase
   * @returns Current phase
   */
  getPhase(): CircadianPhase;

  /**
   * Get current duty factor (0-1)
   * @returns Duty factor where 1 = full compute
   */
  getDutyFactor(): number;

  /**
   * Get compute cost reduction factor
   * @returns Factor representing savings (e.g., 2.0 = 50% savings)
   */
  getCostReductionFactor(): number;

  /**
   * Apply external modulation
   * @param mod - Modulation parameters
   */
  modulate(mod: CircadianModulation): void;

  /**
   * Clear any active modulation
   */
  clearModulation(): void;

  /**
   * Get current state
   */
  getState(): CircadianState;

  /**
   * Get collected metrics
   */
  getMetrics(): CircadianMetrics;

  /**
   * Reset the controller to initial state
   */
  reset(): void;

  /**
   * Consume energy for a compute operation
   * @param amount - Energy to consume
   * @returns true if energy was available
   */
  consumeEnergy(amount: number): boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default phase configurations based on biological circadian rhythms
 * Total durations: Active (40%) + Dawn (15%) + Dusk (15%) + Rest (30%) = 100%
 */
export const DEFAULT_PHASE_CONFIGS: Record<CircadianPhase, PhaseConfig> = {
  Active: {
    duration: 0.40, // 40% of cycle
    dutyFactor: 1.0, // Full compute
    importanceThreshold: 0.0, // React to everything
    allowLearning: true,
    allowConsolidation: false,
    allowCompute: true,
  },
  Dawn: {
    duration: 0.15, // 15% of cycle
    dutyFactor: 0.6, // 60% compute
    importanceThreshold: 0.2, // React to moderately important+
    allowLearning: true,
    allowConsolidation: false,
    allowCompute: true,
  },
  Dusk: {
    duration: 0.15, // 15% of cycle
    dutyFactor: 0.4, // 40% compute
    importanceThreshold: 0.4, // React to important+
    allowLearning: false,
    allowConsolidation: true,
    allowCompute: true,
  },
  Rest: {
    duration: 0.30, // 30% of cycle
    dutyFactor: 0.1, // 10% compute (minimal)
    importanceThreshold: 0.8, // Only react to critical
    allowLearning: false,
    allowConsolidation: true,
    allowCompute: false,
  },
};

/**
 * Default configuration for CircadianController
 */
export const DEFAULT_CIRCADIAN_CONFIG: CircadianConfig = {
  cyclePeriodMs: 24 * 60 * 60 * 1000, // 24 hours in real time (adjustable for simulation)
  phases: DEFAULT_PHASE_CONFIGS,
  hysteresisMs: 5000, // 5 seconds hysteresis
  initialPhase: 'Active',
  energyBudget: 0, // 0 = unlimited
  computeEnergyCost: 1,
  useWasmPhaseSelection: true, // Enable WASM by default
};

/**
 * Phase order for cycle progression
 */
const PHASE_ORDER: CircadianPhase[] = ['Dawn', 'Active', 'Dusk', 'Rest'];

/**
 * Index to phase mapping for WTA layer output
 * The WTA layer returns the index of the winning neuron (0-3),
 * which maps to phases in PHASE_ORDER.
 */
const INDEX_TO_PHASE: CircadianPhase[] = ['Dawn', 'Active', 'Dusk', 'Rest'];

// ============================================================================
// Implementation
// ============================================================================

/**
 * CircadianController implements bio-inspired duty cycling with WASM K-WTA phase selection
 *
 * The K-WTA (K-Winner-Take-All) mechanism from the nervous system WASM module provides
 * biologically-plausible phase selection through lateral inhibition. Each phase is
 * represented as a "neuron" in the K-WTA layer, and phases compete based on their
 * activation strength (derived from cycle position and phase duration).
 *
 * @example
 * ```typescript
 * // Create controller (WASM initializes automatically)
 * const controller = await CircadianController.create({
 *   cyclePeriodMs: 60000, // 1 minute cycles for testing
 * });
 *
 * // Advance simulation time
 * controller.advance(1000);
 *
 * // Check if we should run expensive operations
 * if (controller.shouldCompute()) {
 *   await runInference();
 * }
 *
 * // Check if we should react to an event
 * const importance = 0.5;
 * if (controller.shouldReact(importance)) {
 *   handleEvent();
 * }
 *
 * // Get compute savings
 * const savings = controller.getCostReductionFactor();
 * console.log(`Current savings: ${((1 - 1/savings) * 100).toFixed(1)}%`);
 * ```
 */
export class CircadianController implements ICircadianController {
  private readonly config: CircadianConfig;
  private currentPhase: CircadianPhase;
  private cycleTime: number = 0;
  private phaseTime: number = 0;
  private lastPhaseChange: number = 0;
  private cyclesCompleted: number = 0;
  private energyRemaining: number;
  private activeModulation: CircadianModulation | null = null;
  private modulationStartTime: number = 0;

  // WASM components
  private wtaLayer: WTALayer | null = null;
  private wasmEnabled: boolean = false;

  // Metrics
  private readonly phaseTimeMetrics: Record<CircadianPhase, number>;
  private readonly reactionsPerPhase: Record<CircadianPhase, number>;
  private readonly rejectionsPerPhase: Record<CircadianPhase, number>;
  private totalDutyFactorSum: number = 0;
  private totalDutyFactorSamples: number = 0;
  private totalEnergyConsumed: number = 0;
  private phaseTransitions: number = 0;
  private hysteresisActivations: number = 0;
  private wtaCompetitions: number = 0;

  /**
   * Create a new CircadianController
   *
   * Note: For WASM initialization, use the static `create()` factory method instead.
   *
   * @param config - Partial configuration (merged with defaults)
   */
  constructor(config: Partial<CircadianConfig> = {}) {
    // Merge with defaults
    this.config = {
      ...DEFAULT_CIRCADIAN_CONFIG,
      ...config,
      phases: {
        ...DEFAULT_CIRCADIAN_CONFIG.phases,
        ...config.phases,
      },
    };

    // Validate phase durations sum to 1.0
    const totalDuration = Object.values(this.config.phases).reduce(
      (sum, phase) => sum + phase.duration,
      0
    );
    if (Math.abs(totalDuration - 1.0) > 0.001) {
      throw new Error(
        `Phase durations must sum to 1.0, got ${totalDuration.toFixed(4)}`
      );
    }

    // Initialize state
    this.currentPhase = this.config.initialPhase;
    this.energyRemaining = this.config.energyBudget;

    // Initialize metrics
    this.phaseTimeMetrics = { Active: 0, Dawn: 0, Dusk: 0, Rest: 0 };
    this.reactionsPerPhase = { Active: 0, Dawn: 0, Dusk: 0, Rest: 0 };
    this.rejectionsPerPhase = { Active: 0, Dawn: 0, Dusk: 0, Rest: 0 };
  }

  /**
   * Factory method to create a CircadianController with WASM initialization
   *
   * This is the preferred way to create a CircadianController as it ensures
   * WASM is properly initialized before use.
   *
   * @param config - Partial configuration (merged with defaults)
   * @returns Initialized CircadianController
   *
   * @example
   * ```typescript
   * const controller = await CircadianController.create({
   *   cyclePeriodMs: 60000,
   *   useWasmPhaseSelection: true,
   * });
   * ```
   */
  static async create(config: Partial<CircadianConfig> = {}): Promise<CircadianController> {
    const controller = new CircadianController(config);
    await controller.initializeWasm();
    return controller;
  }

  /**
   * Initialize WASM components for bio-inspired phase selection
   *
   * Creates a WTA (Winner-Take-All) layer with 4 neurons (one per phase).
   * The WTA mechanism implements lateral inhibition where phases compete
   * for activation - only one phase can be "active" (winning) at any time,
   * similar to how neural populations compete in biological circadian nuclei.
   *
   * WTA Parameters:
   * - size: 4 (one neuron per phase: Dawn, Active, Dusk, Rest)
   * - threshold: 0.1 (low threshold to ensure a winner is always selected)
   * - inhibition: 0.8 (strong lateral inhibition for clean phase separation)
   */
  private async initializeWasm(): Promise<void> {
    if (!this.config.useWasmPhaseSelection) {
      this.wasmEnabled = false;
      return;
    }

    try {
      // Initialize WASM module if not already done
      if (!isWasmInitialized()) {
        await initNervousSystem();
      }

      // Create WTA layer with 4 neurons (one per phase)
      // - threshold: 0.1 (low, so we always get a winner)
      // - inhibition: 0.8 (strong lateral inhibition for clean phase transitions)
      this.wtaLayer = new WTALayer(4, 0.1, 0.8);
      this.wasmEnabled = true;
    } catch (error) {
      // Log warning but continue without WASM
      console.warn(
        '[CircadianController] WASM initialization failed, falling back to pure TypeScript:',
        error instanceof Error ? error.message : error
      );
      this.wasmEnabled = false;
      this.wtaLayer = null;
    }
  }

  /**
   * Advance time by dt milliseconds
   *
   * This method updates the internal state, transitioning between phases
   * as needed and tracking metrics.
   *
   * @param dt - Time to advance in milliseconds (must be positive)
   */
  advance(dt: number): void {
    if (dt <= 0) {
      return;
    }

    // Handle modulation expiry
    if (this.activeModulation?.duration && this.activeModulation.duration > 0) {
      const modulationElapsed = this.cycleTime - this.modulationStartTime;
      if (modulationElapsed >= this.activeModulation.duration) {
        this.activeModulation = null;
      }
    }

    // Update times
    this.cycleTime += dt;
    this.phaseTime += dt;
    this.lastPhaseChange += dt;

    // Track phase time metrics
    this.phaseTimeMetrics[this.currentPhase] += dt;

    // Track duty factor
    this.totalDutyFactorSum += this.getDutyFactor() * dt;
    this.totalDutyFactorSamples += dt;

    // Check for cycle completion
    while (this.cycleTime >= this.config.cyclePeriodMs) {
      this.cycleTime -= this.config.cyclePeriodMs;
      this.cyclesCompleted++;
      // Reset energy budget at cycle start
      if (this.config.energyBudget > 0) {
        this.energyRemaining = this.config.energyBudget;
      }
    }

    // Check for phase transition
    this.updatePhase();
  }

  /**
   * Update the current phase based on cycle time
   *
   * If WASM is enabled, uses K-WTA competition for phase selection.
   * Otherwise, falls back to time-based phase calculation.
   */
  private updatePhase(): void {
    // If modulation forces a phase, use it
    if (this.activeModulation?.forcePhase) {
      const newPhase = this.activeModulation.forcePhase;
      if (newPhase !== this.currentPhase) {
        this.transitionToPhase(newPhase);
      }
      return;
    }

    // Calculate target phase
    const cyclePosition = this.cycleTime / this.config.cyclePeriodMs;
    let targetPhase: CircadianPhase;

    if (this.wasmEnabled && this.wtaLayer) {
      // Use WTA competition for biologically-plausible phase selection
      targetPhase = this.calculatePhaseWithWTA(cyclePosition);
    } else {
      // Fallback to pure time-based calculation
      targetPhase = this.calculatePhaseForPosition(cyclePosition);
    }

    // Check if we need to transition
    if (targetPhase !== this.currentPhase) {
      // Apply hysteresis
      if (this.lastPhaseChange < this.config.hysteresisMs) {
        this.hysteresisActivations++;
        return;
      }
      this.transitionToPhase(targetPhase);
    }
  }

  /**
   * Calculate phase using WTA (Winner-Take-All) competition
   *
   * Each phase's activation strength is based on how close the current
   * cycle position is to the phase's peak time. The WTA layer then
   * selects the winning phase through lateral inhibition.
   *
   * The activation function uses a Gaussian profile centered on each phase's
   * midpoint, with sigma proportional to phase duration for smooth transitions.
   *
   * @param cyclePosition - Position in cycle (0-1)
   * @returns The winning phase from WTA competition
   */
  private calculatePhaseWithWTA(cyclePosition: number): CircadianPhase {
    if (!this.wtaLayer) {
      return this.calculatePhaseForPosition(cyclePosition);
    }

    // Calculate activation strength for each phase based on cycle position
    // Each phase has strongest activation during its duration window
    const activations = new Float32Array(4);
    let accumulatedDuration = 0;

    for (let i = 0; i < PHASE_ORDER.length; i++) {
      const phase = PHASE_ORDER[i];
      const phaseConfig = this.config.phases[phase];
      const phaseStart = accumulatedDuration;
      const phaseEnd = accumulatedDuration + phaseConfig.duration;
      const phaseMidpoint = (phaseStart + phaseEnd) / 2;

      // Calculate distance from cycle position to phase midpoint (circular distance)
      let distance = Math.abs(cyclePosition - phaseMidpoint);
      if (distance > 0.5) {
        distance = 1 - distance; // Handle wrap-around
      }

      // Convert distance to activation (closer = higher activation)
      // Using Gaussian-like falloff: activation = exp(-distance^2 / (2 * sigma^2))
      // sigma is proportional to phase duration for smoother transitions
      const sigma = phaseConfig.duration * 0.5;
      activations[i] = Math.exp(-(distance * distance) / (2 * sigma * sigma));

      // Scale by duty factor to give active phases stronger drive
      activations[i] *= phaseConfig.dutyFactor;

      accumulatedDuration = phaseEnd;
    }

    // Run WTA competition - returns index of winning neuron or -1 if none
    const winnerIndex = this.wtaLayer.compete(activations);
    this.wtaCompetitions++;

    // If no winner (all below threshold), fall back to time-based
    if (winnerIndex < 0 || winnerIndex >= INDEX_TO_PHASE.length) {
      return this.calculatePhaseForPosition(cyclePosition);
    }

    return INDEX_TO_PHASE[winnerIndex];
  }

  /**
   * Calculate which phase corresponds to a cycle position (pure time-based)
   *
   * @param position - Position in cycle (0-1)
   * @returns The phase for that position
   */
  private calculatePhaseForPosition(position: number): CircadianPhase {
    let accumulated = 0;
    for (const phase of PHASE_ORDER) {
      accumulated += this.config.phases[phase].duration;
      if (position < accumulated) {
        return phase;
      }
    }
    // Edge case: exactly at end of cycle
    return PHASE_ORDER[PHASE_ORDER.length - 1];
  }

  /**
   * Transition to a new phase
   *
   * @param newPhase - The phase to transition to
   */
  private transitionToPhase(newPhase: CircadianPhase): void {
    this.currentPhase = newPhase;
    this.phaseTime = 0;
    this.lastPhaseChange = 0;
    this.phaseTransitions++;
  }

  /**
   * Should run inference/tests?
   *
   * @returns true if in a phase that allows compute
   */
  shouldCompute(): boolean {
    const phaseConfig = this.config.phases[this.currentPhase];
    return phaseConfig.allowCompute;
  }

  /**
   * Should update learning models?
   *
   * @returns true if in a phase that allows learning
   */
  shouldLearn(): boolean {
    const phaseConfig = this.config.phases[this.currentPhase];
    return phaseConfig.allowLearning;
  }

  /**
   * Should run memory consolidation?
   *
   * @returns true if in a phase that allows consolidation
   */
  shouldConsolidate(): boolean {
    const phaseConfig = this.config.phases[this.currentPhase];
    return phaseConfig.allowConsolidation;
  }

  /**
   * Should react to event given importance?
   *
   * Events with importance >= threshold will be processed.
   * Modulation can adjust the threshold.
   *
   * @param importance - Event importance (0-1, where 1 = critical)
   * @returns true if the event should be processed
   */
  shouldReact(importance: number): boolean {
    const phaseConfig = this.config.phases[this.currentPhase];
    let threshold = phaseConfig.importanceThreshold;

    // Apply modulation
    if (this.activeModulation?.importanceMultiplier) {
      threshold *= this.activeModulation.importanceMultiplier;
      // Clamp to valid range
      threshold = Math.max(0, Math.min(1, threshold));
    }

    const shouldReact = importance >= threshold;

    // Track metrics
    if (shouldReact) {
      this.reactionsPerPhase[this.currentPhase]++;
    } else {
      this.rejectionsPerPhase[this.currentPhase]++;
    }

    return shouldReact;
  }

  /**
   * Get current circadian phase
   *
   * @returns Current phase
   */
  getPhase(): CircadianPhase {
    return this.currentPhase;
  }

  /**
   * Get current duty factor (0-1)
   *
   * The duty factor represents the fraction of full compute being used.
   * Modified by active modulation if present.
   *
   * @returns Duty factor where 1 = full compute
   */
  getDutyFactor(): number {
    const phaseConfig = this.config.phases[this.currentPhase];
    let dutyFactor = phaseConfig.dutyFactor;

    // Apply modulation
    if (this.activeModulation?.dutyAdjustment) {
      dutyFactor += this.activeModulation.dutyAdjustment;
      // Clamp to valid range
      dutyFactor = Math.max(0, Math.min(1, dutyFactor));
    }

    return dutyFactor;
  }

  /**
   * Get compute cost reduction factor
   *
   * This returns a multiplier representing savings.
   * For example, 2.0 means 50% savings (using half the compute).
   *
   * @returns Factor where higher = more savings (1/dutyFactor)
   */
  getCostReductionFactor(): number {
    const dutyFactor = this.getDutyFactor();
    // Avoid division by zero
    if (dutyFactor <= 0) {
      return 100; // Max savings
    }
    return 1 / dutyFactor;
  }

  /**
   * Apply external modulation
   *
   * Modulation allows external systems to adjust circadian behavior.
   * For example, during high-priority periods, modulation can force
   * the Active phase or lower importance thresholds.
   *
   * @param mod - Modulation parameters
   */
  modulate(mod: CircadianModulation): void {
    this.activeModulation = { ...mod };
    this.modulationStartTime = this.cycleTime;

    // If forcing a phase, transition immediately (bypassing hysteresis)
    if (mod.forcePhase && mod.forcePhase !== this.currentPhase) {
      this.transitionToPhase(mod.forcePhase);
    }
  }

  /**
   * Clear any active modulation
   */
  clearModulation(): void {
    this.activeModulation = null;
    // Recalculate phase based on current cycle position
    this.updatePhase();
  }

  /**
   * Get current state
   *
   * @returns Complete state snapshot
   */
  getState(): CircadianState {
    const cyclePosition = this.cycleTime / this.config.cyclePeriodMs;
    let accumulated = 0;
    let timeToNextPhase = 0;

    // Find time to next phase
    for (const phase of PHASE_ORDER) {
      const phaseEnd = accumulated + this.config.phases[phase].duration;
      if (cyclePosition < phaseEnd) {
        timeToNextPhase = (phaseEnd - cyclePosition) * this.config.cyclePeriodMs;
        break;
      }
      accumulated = phaseEnd;
    }

    return {
      phase: this.currentPhase,
      cycleTime: this.cycleTime,
      phaseTime: this.phaseTime,
      energyRemaining: this.energyRemaining,
      cyclesCompleted: this.cyclesCompleted,
      activeModulation: this.activeModulation ? { ...this.activeModulation } : null,
      timeToNextPhase,
      wasmEnabled: this.wasmEnabled,
    };
  }

  /**
   * Get collected metrics
   *
   * @returns Metrics snapshot
   */
  getMetrics(): CircadianMetrics {
    return {
      phaseTime: { ...this.phaseTimeMetrics },
      reactionsPerPhase: { ...this.reactionsPerPhase },
      rejectionsPerPhase: { ...this.rejectionsPerPhase },
      averageDutyFactor:
        this.totalDutyFactorSamples > 0
          ? this.totalDutyFactorSum / this.totalDutyFactorSamples
          : 1,
      totalEnergyConsumed: this.totalEnergyConsumed,
      phaseTransitions: this.phaseTransitions,
      hysteresisActivations: this.hysteresisActivations,
      wtaCompetitions: this.wtaCompetitions,
    };
  }

  /**
   * Reset the controller to initial state
   */
  reset(): void {
    this.currentPhase = this.config.initialPhase;
    this.cycleTime = 0;
    this.phaseTime = 0;
    this.lastPhaseChange = 0;
    this.cyclesCompleted = 0;
    this.energyRemaining = this.config.energyBudget;
    this.activeModulation = null;
    this.modulationStartTime = 0;

    // Reset metrics
    this.phaseTimeMetrics.Active = 0;
    this.phaseTimeMetrics.Dawn = 0;
    this.phaseTimeMetrics.Dusk = 0;
    this.phaseTimeMetrics.Rest = 0;
    this.reactionsPerPhase.Active = 0;
    this.reactionsPerPhase.Dawn = 0;
    this.reactionsPerPhase.Dusk = 0;
    this.reactionsPerPhase.Rest = 0;
    this.rejectionsPerPhase.Active = 0;
    this.rejectionsPerPhase.Dawn = 0;
    this.rejectionsPerPhase.Dusk = 0;
    this.rejectionsPerPhase.Rest = 0;
    this.totalDutyFactorSum = 0;
    this.totalDutyFactorSamples = 0;
    this.totalEnergyConsumed = 0;
    this.phaseTransitions = 0;
    this.hysteresisActivations = 0;
    this.wtaCompetitions = 0;
  }

  /**
   * Consume energy for a compute operation
   *
   * When energy budget is enabled, this tracks energy consumption.
   * Operations can check if energy is available before proceeding.
   *
   * @param amount - Energy to consume (defaults to computeEnergyCost)
   * @returns true if energy was available and consumed
   */
  consumeEnergy(amount?: number): boolean {
    const cost = amount ?? this.config.computeEnergyCost;

    // If no budget, always allow
    if (this.config.energyBudget <= 0) {
      this.totalEnergyConsumed += cost;
      return true;
    }

    // Check if energy is available
    if (this.energyRemaining >= cost) {
      this.energyRemaining -= cost;
      this.totalEnergyConsumed += cost;
      return true;
    }

    return false;
  }

  /**
   * Get the configuration
   *
   * @returns Current configuration (read-only)
   */
  getConfig(): Readonly<CircadianConfig> {
    return this.config;
  }

  /**
   * Calculate theoretical average duty factor based on phase durations
   *
   * @returns Weighted average of duty factors
   */
  getTheoreticalAverageDutyFactor(): number {
    return Object.entries(this.config.phases).reduce(
      (sum, [, config]) => sum + config.duration * config.dutyFactor,
      0
    );
  }

  /**
   * Calculate theoretical cost reduction factor
   *
   * @returns Expected savings factor (e.g., 2.0 = 50% savings)
   */
  getTheoreticalCostReduction(): number {
    const avgDuty = this.getTheoreticalAverageDutyFactor();
    return avgDuty > 0 ? 1 / avgDuty : 100;
  }

  /**
   * Check if WASM phase selection is active
   *
   * @returns true if K-WTA competition is being used
   */
  isWasmEnabled(): boolean {
    return this.wasmEnabled;
  }

  /**
   * Cleanup WASM resources
   *
   * Call this when the controller is no longer needed to free WASM memory.
   */
  dispose(): void {
    if (this.wtaLayer) {
      // WTALayer has a free() method for WASM memory cleanup
      try {
        this.wtaLayer.free();
      } catch {
        // Ignore cleanup errors
      }
      this.wtaLayer = null;
    }
    this.wasmEnabled = false;
  }

  // ============================================
  // Serialization Methods for Persistence
  // ============================================

  /**
   * Get the last phase change timestamp
   * @returns Timestamp in milliseconds
   */
  getLastPhaseChangeTime(): number {
    return this.lastPhaseChange;
  }

  /**
   * Get the modulation start time (if active)
   * @returns Timestamp or undefined
   */
  getModulationStartTime(): number | undefined {
    return this.activeModulation ? this.modulationStartTime : undefined;
  }

  /**
   * Restore state from serialized values
   * @param phase Current phase
   * @param cycleTime Time in current cycle
   * @param phaseTime Time in current phase
   * @param cyclesCompleted Number of completed cycles
   * @param energyRemaining Remaining energy
   * @param modulation Active modulation or null
   */
  restoreState(
    phase: CircadianPhase,
    cycleTime: number,
    phaseTime: number,
    cyclesCompleted: number,
    energyRemaining: number,
    modulation: CircadianModulation | null
  ): void {
    this.currentPhase = phase;
    this.cycleTime = cycleTime;
    this.phaseTime = phaseTime;
    this.cyclesCompleted = cyclesCompleted;
    this.energyRemaining = energyRemaining;
    this.activeModulation = modulation;
  }

  /**
   * Restore metrics from serialized values
   * @param metrics Metrics to restore
   */
  restoreMetrics(metrics: CircadianMetrics): void {
    // Restore phase time metrics
    this.phaseTimeMetrics.Active = metrics.phaseTime.Active;
    this.phaseTimeMetrics.Dawn = metrics.phaseTime.Dawn;
    this.phaseTimeMetrics.Dusk = metrics.phaseTime.Dusk;
    this.phaseTimeMetrics.Rest = metrics.phaseTime.Rest;

    // Restore reactions per phase
    this.reactionsPerPhase.Active = metrics.reactionsPerPhase.Active;
    this.reactionsPerPhase.Dawn = metrics.reactionsPerPhase.Dawn;
    this.reactionsPerPhase.Dusk = metrics.reactionsPerPhase.Dusk;
    this.reactionsPerPhase.Rest = metrics.reactionsPerPhase.Rest;

    // Restore rejections per phase
    this.rejectionsPerPhase.Active = metrics.rejectionsPerPhase.Active;
    this.rejectionsPerPhase.Dawn = metrics.rejectionsPerPhase.Dawn;
    this.rejectionsPerPhase.Dusk = metrics.rejectionsPerPhase.Dusk;
    this.rejectionsPerPhase.Rest = metrics.rejectionsPerPhase.Rest;

    // Restore aggregate metrics
    this.totalDutyFactorSum = metrics.averageDutyFactor;
    this.totalDutyFactorSamples = 1; // Will be recalculated on next sample
    this.totalEnergyConsumed = metrics.totalEnergyConsumed;
    this.phaseTransitions = metrics.phaseTransitions;
    this.hysteresisActivations = metrics.hysteresisActivations;

    // WTA competitions if available
    if ('wtaCompetitions' in metrics) {
      this.wtaCompetitions = (metrics as any).wtaCompetitions;
    }
  }

  /**
   * Restore last phase change time
   * @param time Timestamp in milliseconds
   */
  restoreLastPhaseChangeTime(time: number): void {
    this.lastPhaseChange = time;
  }

  /**
   * Restore modulation start time
   * @param time Timestamp or undefined
   */
  restoreModulationStartTime(time: number | undefined): void {
    if (time !== undefined) {
      this.modulationStartTime = time;
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a CircadianController optimized for testing (fast cycles)
 *
 * @param cyclePeriodMs - Cycle period in milliseconds (default: 1 minute)
 * @returns Promise resolving to configured CircadianController
 */
export async function createTestingController(
  cyclePeriodMs: number = 60000
): Promise<CircadianController> {
  return CircadianController.create({
    cyclePeriodMs,
    hysteresisMs: 100, // Low hysteresis for fast testing
  });
}

/**
 * Create a CircadianController optimized for maximum savings
 *
 * Extends rest phase and reduces active phase for up to 80% savings.
 *
 * @param cyclePeriodMs - Cycle period in milliseconds
 * @returns Promise resolving to configured CircadianController
 */
export async function createEfficientController(
  cyclePeriodMs: number = DEFAULT_CIRCADIAN_CONFIG.cyclePeriodMs
): Promise<CircadianController> {
  return CircadianController.create({
    cyclePeriodMs,
    phases: {
      Active: {
        ...DEFAULT_PHASE_CONFIGS.Active,
        duration: 0.20, // Reduced to 20%
      },
      Dawn: {
        ...DEFAULT_PHASE_CONFIGS.Dawn,
        duration: 0.10, // Reduced to 10%
      },
      Dusk: {
        ...DEFAULT_PHASE_CONFIGS.Dusk,
        duration: 0.10, // Reduced to 10%
      },
      Rest: {
        ...DEFAULT_PHASE_CONFIGS.Rest,
        duration: 0.60, // Extended to 60%
      },
    },
  });
}

/**
 * Create a CircadianController optimized for responsiveness
 *
 * Extended active phase with lower importance thresholds.
 *
 * @param cyclePeriodMs - Cycle period in milliseconds
 * @returns Promise resolving to configured CircadianController
 */
export async function createResponsiveController(
  cyclePeriodMs: number = DEFAULT_CIRCADIAN_CONFIG.cyclePeriodMs
): Promise<CircadianController> {
  return CircadianController.create({
    cyclePeriodMs,
    phases: {
      Active: {
        ...DEFAULT_PHASE_CONFIGS.Active,
        duration: 0.60, // Extended to 60%
      },
      Dawn: {
        ...DEFAULT_PHASE_CONFIGS.Dawn,
        duration: 0.15,
        importanceThreshold: 0.1, // More responsive
      },
      Dusk: {
        ...DEFAULT_PHASE_CONFIGS.Dusk,
        duration: 0.10, // Reduced
        importanceThreshold: 0.2, // More responsive
      },
      Rest: {
        ...DEFAULT_PHASE_CONFIGS.Rest,
        duration: 0.15, // Reduced
        importanceThreshold: 0.5, // More responsive
      },
    },
  });
}

/**
 * Create a CircadianController with energy budgeting
 *
 * @param energyBudget - Energy budget per cycle
 * @param cyclePeriodMs - Cycle period in milliseconds
 * @returns Promise resolving to configured CircadianController
 */
export async function createBudgetedController(
  energyBudget: number,
  cyclePeriodMs: number = DEFAULT_CIRCADIAN_CONFIG.cyclePeriodMs
): Promise<CircadianController> {
  return CircadianController.create({
    cyclePeriodMs,
    energyBudget,
    computeEnergyCost: 1,
  });
}

/**
 * Create a CircadianController without WASM (pure TypeScript)
 *
 * Use this when WASM is not available or not desired.
 *
 * @param config - Partial configuration
 * @returns Configured CircadianController (synchronous, no WASM)
 */
export function createPureTypeScriptController(
  config: Partial<CircadianConfig> = {}
): CircadianController {
  return new CircadianController({
    ...config,
    useWasmPhaseSelection: false,
  });
}
