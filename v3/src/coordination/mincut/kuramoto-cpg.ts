/**
 * Agentic QE v3 - Kuramoto Central Pattern Generator
 * ADR-032: Time Crystal Scheduling (Kuramoto CPG oscillators)
 *
 * Implements self-sustaining phase-based scheduling using coupled oscillators
 * based on the Kuramoto model. This module provides emergent scheduling without
 * external timers through synchronized oscillation.
 *
 * Key Concepts:
 * - OscillatorNeuron: Phase-coupled oscillator implementing Kuramoto dynamics
 * - KuramotoCPG: Self-sustaining oscillator-based scheduler
 * - Order Parameter: Measures synchronization (r=0 desync, r=1 sync)
 * - Winner-take-all: Highest activity oscillator determines current phase
 *
 * Kuramoto equation: dφ/dt = ω + K * Σ sin(φⱼ - φᵢ)
 *
 * @see https://en.wikipedia.org/wiki/Kuramoto_model
 * @see https://en.wikipedia.org/wiki/Central_pattern_generator
 */

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Oscillator state for serialization/debugging
 */
export interface OscillatorState {
  id: number;
  phase: number; // Current phase angle (0 to 2π)
  omega: number; // Natural angular frequency (rad/ms)
  amplitude: number;
  activity: number; // Current activity level
}

/**
 * CPG (Central Pattern Generator) configuration
 */
export interface CPGConfig {
  /** Number of phases in the crystal */
  numPhases: number;

  /** Oscillation frequency (Hz) - how fast phases cycle */
  frequency: number;

  /** Coupling strength between adjacent phases (Kuramoto K parameter) */
  coupling: number;

  /** Stability threshold for phase transitions */
  stabilityThreshold: number;

  /** Time step for simulation (ms) */
  dt: number;

  /** Phase transition threshold (activity level to trigger transition) */
  transitionThreshold: number;
}

/**
 * Default CPG configuration for demo/testing
 */
export const DEFAULT_CPG_CONFIG: CPGConfig = {
  numPhases: 4,
  frequency: 0.1, // 0.1 Hz = 10s per cycle in demo mode
  coupling: 0.3, // Moderate coupling strength
  stabilityThreshold: 0.1,
  dt: 100, // 100ms time steps
  transitionThreshold: 0.8,
};

/**
 * Production CPG configuration for real workloads
 */
export const PRODUCTION_CPG_CONFIG: CPGConfig = {
  numPhases: 4,
  frequency: 0.001, // 0.001 Hz = ~17 min per full cycle
  coupling: 0.3,
  stabilityThreshold: 0.1,
  dt: 1000, // 1s time steps
  transitionThreshold: 0.8,
};

/**
 * Test types for phase-based execution
 */
export type TestPhaseType =
  | 'unit'
  | 'integration'
  | 'e2e'
  | 'performance'
  | 'security'
  | 'visual'
  | 'accessibility'
  | 'contract';

/**
 * Quality thresholds for phase completion
 */
export interface PhaseQualityThresholds {
  /** Minimum pass rate to proceed (0-1) */
  minPassRate: number;

  /** Maximum flaky test tolerance (0-1) */
  maxFlakyRatio: number;

  /** Minimum coverage requirement (0-1) */
  minCoverage: number;
}

/**
 * Agent configuration for a test phase
 */
export interface PhaseAgentConfig {
  /** Agent types to use in this phase */
  agents: string[];

  /** Parallelism level */
  parallelism: number;
}

/**
 * Test execution phase definition for Kuramoto CPG
 */
export interface CPGTestPhase {
  /** Phase identifier (0 to n-1) */
  id: number;

  /** Phase name */
  name: string;

  /** Test types executed in this phase */
  testTypes: TestPhaseType[];

  /** Expected duration (ms) */
  expectedDuration: number;

  /** Quality thresholds for phase completion */
  qualityThresholds: PhaseQualityThresholds;

  /** Phase-specific agent configuration */
  agentConfig: PhaseAgentConfig;
}

/**
 * Phase transition event from Kuramoto CPG
 */
export interface CPGPhaseTransition {
  /** Source phase index */
  from: number;

  /** Target phase index */
  to: number;

  /** Simulation timestamp (ms) */
  timestamp: number;

  /** Source phase definition */
  fromPhase: CPGTestPhase;

  /** Target phase definition */
  toPhase: CPGTestPhase;

  /** Order parameter at transition */
  orderParameter: number;
}

/**
 * Result of executing a CPG test phase
 */
export interface CPGPhaseResult {
  /** Phase identifier */
  phaseId: number;

  /** Phase name */
  phaseName: string;

  /** Test pass rate (0-1) */
  passRate: number;

  /** Flaky test ratio (0-1) */
  flakyRatio: number;

  /** Code coverage achieved (0-1) */
  coverage: number;

  /** Actual duration in ms */
  duration: number;

  /** Total tests executed */
  testsRun: number;

  /** Tests that passed */
  testsPassed: number;

  /** Tests that failed */
  testsFailed: number;

  /** Tests that were skipped */
  testsSkipped: number;

  /** Whether quality thresholds were met */
  qualityMet: boolean;
}

/**
 * Default test phases for Kuramoto CPG
 */
export const DEFAULT_CPG_TEST_PHASES: CPGTestPhase[] = [
  {
    id: 0,
    name: 'Unit',
    testTypes: ['unit'],
    expectedDuration: 30000,
    qualityThresholds: {
      minPassRate: 0.99,
      maxFlakyRatio: 0.01,
      minCoverage: 0.8,
    },
    agentConfig: {
      agents: ['qe-test-executor'],
      parallelism: 8,
    },
  },
  {
    id: 1,
    name: 'Integration',
    testTypes: ['integration', 'contract'],
    expectedDuration: 120000,
    qualityThresholds: {
      minPassRate: 0.95,
      maxFlakyRatio: 0.05,
      minCoverage: 0.7,
    },
    agentConfig: {
      agents: ['qe-test-executor', 'qe-contract-validator'],
      parallelism: 4,
    },
  },
  {
    id: 2,
    name: 'E2E',
    testTypes: ['e2e', 'visual', 'accessibility'],
    expectedDuration: 300000,
    qualityThresholds: {
      minPassRate: 0.9,
      maxFlakyRatio: 0.1,
      minCoverage: 0.6,
    },
    agentConfig: {
      agents: ['qe-test-executor', 'qe-visual-tester'],
      parallelism: 2,
    },
  },
  {
    id: 3,
    name: 'Performance',
    testTypes: ['performance', 'security'],
    expectedDuration: 600000,
    qualityThresholds: {
      minPassRate: 0.95,
      maxFlakyRatio: 0.02,
      minCoverage: 0.5,
    },
    agentConfig: {
      agents: ['qe-performance-tester', 'qe-security-scanner'],
      parallelism: 1,
    },
  },
];

// ============================================================================
// Oscillator Neuron Implementation (Kuramoto Model)
// ============================================================================

/**
 * Oscillator Neuron implementing Kuramoto dynamics
 *
 * Models a single oscillator in the CPG network.
 * Kuramoto equation: dφ/dt = ω + K * Σ sin(φⱼ - φᵢ)
 *
 * @see https://en.wikipedia.org/wiki/Kuramoto_model
 */
export class OscillatorNeuron {
  private id: number;
  private phase: number; // Current phase angle (0 to 2π)
  private omega: number; // Natural angular frequency (rad/ms)
  private amplitude: number;
  private activity: number;

  /**
   * Create a new oscillator neuron
   *
   * @param id - Unique oscillator identifier
   * @param frequencyHz - Natural frequency in Hz
   * @param phaseOffset - Initial phase offset in radians
   * @param amplitude - Oscillation amplitude (default 1.0)
   */
  constructor(
    id: number,
    frequencyHz: number,
    phaseOffset: number = 0,
    amplitude: number = 1.0
  ) {
    this.id = id;
    // Convert Hz to rad/ms: ω = 2π * f / 1000
    this.omega = (2 * Math.PI * frequencyHz) / 1000;
    this.phase = this.normalizePhase(phaseOffset);
    this.amplitude = amplitude;
    this.activity = this.amplitude * Math.cos(this.phase);
  }

  /**
   * Integrate oscillator dynamics over one time step
   *
   * @param dt - Time step in milliseconds
   * @param couplingInput - Sum of coupling forces from other oscillators
   */
  integrate(dt: number, couplingInput: number): void {
    const dPhase = (this.omega + couplingInput) * dt;
    this.phase += dPhase;
    this.phase = this.normalizePhase(this.phase);
    this.activity = this.amplitude * Math.cos(this.phase);
  }

  /**
   * Integrate with frequency modulation based on quality feedback
   *
   * @param dt - Time step in milliseconds
   * @param couplingInput - Sum of coupling forces
   * @param frequencyModulation - Modulation (-1 to 1): slow on poor quality, speed on good
   */
  integrateWithModulation(
    dt: number,
    couplingInput: number,
    frequencyModulation: number = 0
  ): void {
    const modulatedOmega = this.omega * (1 + frequencyModulation * 0.5);
    const dPhase = (modulatedOmega + couplingInput) * dt;
    this.phase += dPhase;
    this.phase = this.normalizePhase(this.phase);
    this.activity = this.amplitude * Math.cos(this.phase);
  }

  getPhase(): number {
    return this.phase;
  }
  getActivity(): number {
    return this.activity;
  }
  getId(): number {
    return this.id;
  }
  getOmega(): number {
    return this.omega;
  }
  getAmplitude(): number {
    return this.amplitude;
  }

  setAmplitude(amplitude: number): void {
    this.amplitude = amplitude;
    this.activity = this.amplitude * Math.cos(this.phase);
  }

  setFrequency(frequencyHz: number): void {
    this.omega = (2 * Math.PI * frequencyHz) / 1000;
  }

  reset(phase: number): void {
    this.phase = this.normalizePhase(phase);
    this.activity = this.amplitude * Math.cos(this.phase);
  }

  getState(): OscillatorState {
    return {
      id: this.id,
      phase: this.phase,
      omega: this.omega,
      amplitude: this.amplitude,
      activity: this.activity,
    };
  }

  restoreState(state: OscillatorState): void {
    if (state.id !== this.id) {
      throw new Error(`State id mismatch: expected ${this.id}, got ${state.id}`);
    }
    this.phase = state.phase;
    this.omega = state.omega;
    this.amplitude = state.amplitude;
    this.activity = state.activity;
  }

  /**
   * Compute Kuramoto coupling input from another oscillator
   *
   * @param other - The other oscillator
   * @param couplingStrength - Coupling strength K
   * @returns Coupling force: K * sin(φⱼ - φᵢ)
   */
  computeCouplingFrom(other: OscillatorNeuron, couplingStrength: number): number {
    const phaseDiff = other.getPhase() - this.phase;
    return couplingStrength * Math.sin(phaseDiff);
  }

  /**
   * Check if this oscillator is in phase with another
   */
  isInPhaseWith(other: OscillatorNeuron, tolerance: number = 0.1): boolean {
    const phaseDiff = Math.abs(this.phase - other.getPhase());
    const normalizedDiff = Math.min(phaseDiff, 2 * Math.PI - phaseDiff);
    return normalizedDiff <= tolerance;
  }

  private normalizePhase(phase: number): number {
    const TWO_PI = 2 * Math.PI;
    while (phase >= TWO_PI) phase -= TWO_PI;
    while (phase < 0) phase += TWO_PI;
    return phase;
  }

  clone(): OscillatorNeuron {
    const clone = new OscillatorNeuron(this.id, 0, 0, this.amplitude);
    clone.restoreState(this.getState());
    return clone;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Compute the Kuramoto order parameter for a set of oscillators
 *
 * The order parameter r measures synchronization:
 *   r * e^(iψ) = (1/N) * Σ e^(iφⱼ)
 *
 * @param oscillators - Array of oscillator neurons
 * @returns Object containing order parameter r (0=desync, 1=sync) and mean phase psi
 */
export function computeOrderParameter(oscillators: OscillatorNeuron[]): {
  r: number;
  psi: number;
} {
  if (oscillators.length === 0) {
    return { r: 0, psi: 0 };
  }

  let sumCos = 0;
  let sumSin = 0;

  for (const osc of oscillators) {
    const phase = osc.getPhase();
    sumCos += Math.cos(phase);
    sumSin += Math.sin(phase);
  }

  const n = oscillators.length;
  const meanCos = sumCos / n;
  const meanSin = sumSin / n;

  const r = Math.sqrt(meanCos * meanCos + meanSin * meanSin);
  const psi = Math.atan2(meanSin, meanCos);

  return { r, psi };
}

/**
 * Create evenly spaced oscillators for a CPG
 */
export function createEvenlySpacedOscillators(
  count: number,
  frequencyHz: number
): OscillatorNeuron[] {
  const oscillators: OscillatorNeuron[] = [];
  for (let i = 0; i < count; i++) {
    const phaseOffset = (2 * Math.PI * i) / count;
    oscillators.push(new OscillatorNeuron(i, frequencyHz, phaseOffset));
  }
  return oscillators;
}

/**
 * Build a ring coupling matrix for nearest-neighbor coupling
 */
export function buildRingCouplingMatrix(
  count: number,
  couplingStrength: number
): number[][] {
  const matrix: number[][] = Array(count)
    .fill(null)
    .map(() => Array(count).fill(0));

  for (let i = 0; i < count; i++) {
    const prev = (i + count - 1) % count;
    const next = (i + 1) % count;
    matrix[i][prev] = couplingStrength;
    matrix[i][next] = couplingStrength;
  }

  return matrix;
}

// ============================================================================
// Kuramoto CPG Implementation
// ============================================================================

/**
 * Kuramoto Central Pattern Generator
 *
 * Creates a self-sustaining schedule by using coupled oscillators that
 * naturally cycle through test phases without external timing signals.
 *
 * @see ADR-032: Time Crystal Scheduling
 */
export class KuramotoCPG {
  private readonly phases: CPGTestPhase[];
  private readonly config: CPGConfig;
  private oscillators: OscillatorNeuron[];
  private coupling: number[][];
  private currentPhase: number = 0;
  private time: number = 0;
  private phaseHistory: number[] = [];
  private running: boolean = false;
  private paused: boolean = false;
  private cycleCount: number = 0;
  private lastCycleStartTime: number = 0;
  private cycleDurations: number[] = [];
  private qualityFailures: number = 0;
  private consecutiveFailures: number = 0;
  private phaseResults: Map<number, CPGPhaseResult[]> = new Map();

  // Event handlers
  private onTransition?: (transition: CPGPhaseTransition) => Promise<void>;
  private onTick?: (state: {
    time: number;
    currentPhase: number;
    orderParameter: number;
  }) => void;

  constructor(
    phases: CPGTestPhase[] = DEFAULT_CPG_TEST_PHASES,
    config: CPGConfig = DEFAULT_CPG_CONFIG
  ) {
    if (phases.length === 0) {
      throw new Error('At least one test phase is required');
    }

    this.phases = phases;
    this.config = { ...config, numPhases: phases.length };
    this.oscillators = createEvenlySpacedOscillators(
      this.config.numPhases,
      this.config.frequency
    );
    this.coupling = buildRingCouplingMatrix(
      this.config.numPhases,
      this.config.coupling
    );

    for (let i = 0; i < this.phases.length; i++) {
      this.phaseResults.set(i, []);
    }
  }

  /**
   * Set callback for phase transitions
   */
  setTransitionHandler(
    handler: (transition: CPGPhaseTransition) => Promise<void>
  ): void {
    this.onTransition = handler;
  }

  /**
   * Set callback for tick events
   */
  setTickHandler(
    handler: (state: {
      time: number;
      currentPhase: number;
      orderParameter: number;
    }) => void
  ): void {
    this.onTick = handler;
  }

  /**
   * Run one integration tick
   *
   * @returns CPGPhaseTransition if a transition occurred, null otherwise
   */
  tick(): CPGPhaseTransition | null {
    if (!this.running || this.paused) {
      return null;
    }

    const dt = this.config.dt;
    this.time += dt;

    // 1. Compute Kuramoto coupling inputs
    const n = this.oscillators.length;
    const couplingInputs = new Array(n).fill(0);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j && this.coupling[i][j] !== 0) {
          couplingInputs[i] += this.oscillators[i].computeCouplingFrom(
            this.oscillators[j],
            this.coupling[i][j]
          );
        }
      }
    }

    // 2. Integrate oscillator dynamics
    for (let i = 0; i < n; i++) {
      this.oscillators[i].integrate(dt, couplingInputs[i]);
    }

    // 3. Winner-take-all: highest activity determines current phase
    let winner = 0;
    let maxActivity = this.oscillators[0].getActivity();

    for (let i = 1; i < n; i++) {
      const activity = this.oscillators[i].getActivity();
      if (activity > maxActivity) {
        maxActivity = activity;
        winner = i;
      }
    }

    // Compute order parameter
    const { r: orderParameter } = computeOrderParameter(this.oscillators);

    // Emit tick event
    if (this.onTick) {
      this.onTick({
        time: this.time,
        currentPhase: this.currentPhase,
        orderParameter,
      });
    }

    // 4. Check for phase transition
    if (
      winner !== this.currentPhase &&
      maxActivity >= this.config.transitionThreshold
    ) {
      const oldPhase = this.currentPhase;
      this.currentPhase = winner;
      this.phaseHistory.push(winner);

      // Check for cycle completion (returned to phase 0)
      if (winner === 0 && oldPhase === this.phases.length - 1) {
        this.cycleCount++;
        const cycleDuration = this.time - this.lastCycleStartTime;
        this.cycleDurations.push(cycleDuration);
        this.lastCycleStartTime = this.time;

        if (this.cycleDurations.length > 100) {
          this.cycleDurations.shift();
        }
      }

      // Prune history
      if (this.phaseHistory.length > 1000) {
        this.phaseHistory.shift();
      }

      const transition: CPGPhaseTransition = {
        from: oldPhase,
        to: winner,
        timestamp: this.time,
        fromPhase: this.phases[oldPhase],
        toPhase: this.phases[winner],
        orderParameter,
      };

      return transition;
    }

    return null;
  }

  /**
   * Start the CPG oscillation loop
   */
  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;
    this.paused = false;
    this.lastCycleStartTime = this.time;

    console.log('[KuramotoCPG] Starting self-sustaining scheduling');

    while (this.running) {
      if (this.paused) {
        await this.sleep(100);
        continue;
      }

      const transition = this.tick();

      if (transition && this.onTransition) {
        await this.onTransition(transition);
      }

      await this.sleep(this.config.dt);
    }
  }

  /**
   * Stop the CPG
   */
  stop(): void {
    this.running = false;
    this.paused = false;
    console.log('[KuramotoCPG] Stopped');
  }

  /**
   * Pause the CPG
   */
  pause(): void {
    this.paused = true;
  }

  /**
   * Resume the CPG
   */
  resume(): void {
    this.paused = false;
  }

  /**
   * Record phase result and adjust dynamics
   */
  recordPhaseResult(result: CPGPhaseResult): void {
    const results = this.phaseResults.get(result.phaseId);
    if (results) {
      results.push(result);
      if (results.length > 100) {
        results.shift();
      }
    }

    if (!result.qualityMet) {
      this.qualityFailures++;
      this.consecutiveFailures++;

      if (this.consecutiveFailures >= 3) {
        this.repairCrystal();
      }
    } else {
      this.consecutiveFailures = 0;
    }
  }

  /**
   * Repair crystal structure after quality failures
   */
  repairCrystal(): void {
    console.log('[KuramotoCPG] Repairing crystal structure');

    // Re-synchronize oscillators
    const n = this.oscillators.length;
    for (let i = 0; i < n; i++) {
      const targetPhase = (2 * Math.PI * i) / n;
      this.oscillators[i].reset(targetPhase);
    }

    this.consecutiveFailures = 0;
  }

  /**
   * Check if CPG is exhibiting stable periodic behavior
   */
  isStable(): boolean {
    if (this.phaseHistory.length < this.config.numPhases * 2) {
      return false;
    }

    const period = this.config.numPhases;
    const recent = this.phaseHistory.slice(-period * 2);

    for (let i = 0; i < period; i++) {
      if (recent[i] !== recent[i + period]) {
        return false;
      }
    }

    return true;
  }

  getCurrentPhase(): CPGTestPhase {
    return this.phases[this.currentPhase];
  }

  getCurrentPhaseIndex(): number {
    return this.currentPhase;
  }

  getOscillatorStates(): OscillatorState[] {
    return this.oscillators.map((o) => o.getState());
  }

  getOrderParameter(): { r: number; psi: number } {
    return computeOrderParameter(this.oscillators);
  }

  getCycleCount(): number {
    return this.cycleCount;
  }

  getTime(): number {
    return this.time;
  }

  isRunning(): boolean {
    return this.running;
  }

  isPaused(): boolean {
    return this.paused;
  }

  getPhases(): CPGTestPhase[] {
    return [...this.phases];
  }

  getConfig(): CPGConfig {
    return { ...this.config };
  }

  getStats(): {
    cycleCount: number;
    qualityFailures: number;
    isStable: boolean;
    orderParameter: number;
    avgCycleDuration: number;
  } {
    const { r } = this.getOrderParameter();
    const avgCycleDuration =
      this.cycleDurations.length > 0
        ? this.cycleDurations.reduce((a, b) => a + b, 0) /
          this.cycleDurations.length
        : 0;

    return {
      cycleCount: this.cycleCount,
      qualityFailures: this.qualityFailures,
      isStable: this.isStable(),
      orderParameter: r,
      avgCycleDuration,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a Kuramoto CPG with default configuration
 */
export function createKuramotoCPG(
  phases?: CPGTestPhase[],
  config?: Partial<CPGConfig>
): KuramotoCPG {
  return new KuramotoCPG(
    phases ?? DEFAULT_CPG_TEST_PHASES,
    config ? { ...DEFAULT_CPG_CONFIG, ...config } : DEFAULT_CPG_CONFIG
  );
}

/**
 * Create a production-configured Kuramoto CPG
 */
export function createProductionKuramotoCPG(
  phases?: CPGTestPhase[]
): KuramotoCPG {
  return new KuramotoCPG(phases ?? DEFAULT_CPG_TEST_PHASES, PRODUCTION_CPG_CONFIG);
}
