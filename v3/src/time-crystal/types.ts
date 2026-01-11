/**
 * Agentic QE v3 - Time Crystal Scheduling Types
 * ADR-032: Kuramoto CPG oscillators for self-sustaining scheduling
 *
 * Based on RuVector MinCut Analysis (time_crystal.rs):
 * Time crystals exhibit periodic self-sustaining patterns. The SNN equivalent
 * is a Central Pattern Generator - coupled oscillators that produce rhythmic
 * output without external timing.
 */

// ============================================================================
// Test Execution Phase Types
// ============================================================================

/**
 * Types of tests that can be executed
 */
export type TestType =
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
export interface PhaseThresholds {
  /** Minimum pass rate to proceed (0-1) */
  readonly minPassRate: number;

  /** Maximum flaky test tolerance (0-1) */
  readonly maxFlakyRatio: number;

  /** Minimum coverage requirement (0-1) */
  readonly minCoverage: number;
}

/**
 * Agent configuration for a phase
 */
export interface PhaseAgentConfig {
  /** Agent types to use in this phase */
  readonly agents: string[];

  /** Parallelism level */
  readonly parallelism: number;
}

/**
 * Test execution phase definition
 */
export interface TestPhase {
  /** Phase identifier (0 to n-1) */
  readonly id: number;

  /** Phase name */
  readonly name: string;

  /** Test types executed in this phase */
  readonly testTypes: TestType[];

  /** Expected duration (ms) */
  readonly expectedDuration: number;

  /** Quality thresholds for phase completion */
  readonly qualityThresholds: PhaseThresholds;

  /** Phase-specific agent configuration */
  readonly agentConfig: PhaseAgentConfig;
}

// ============================================================================
// CPG Configuration Types
// ============================================================================

/**
 * Central Pattern Generator configuration
 */
export interface CPGConfig {
  /** Number of phases in the crystal */
  readonly numPhases: number;

  /** Oscillation frequency (Hz) - how fast phases cycle */
  readonly frequency: number;

  /** Coupling strength between adjacent phases (Kuramoto K parameter) */
  readonly coupling: number;

  /** Stability threshold for phase transitions */
  readonly stabilityThreshold: number;

  /** Time step for simulation (ms) */
  readonly dt: number;

  /** Phase transition threshold (activity level to trigger transition) */
  readonly transitionThreshold: number;
}

/**
 * Default CPG configuration for demo/testing
 */
export const DEFAULT_CPG_CONFIG: CPGConfig = {
  numPhases: 4,
  frequency: 0.1,           // 0.1 Hz = 10s per cycle in demo mode
  coupling: 0.3,            // Moderate coupling strength
  stabilityThreshold: 0.1,
  dt: 100,                  // 100ms time steps
  transitionThreshold: 0.8,
};

/**
 * Production CPG configuration for real workloads
 */
export const PRODUCTION_CPG_CONFIG: CPGConfig = {
  numPhases: 4,
  frequency: 0.001,         // 0.001 Hz = ~17 min per full cycle
  coupling: 0.3,
  stabilityThreshold: 0.1,
  dt: 1000,                 // 1s time steps
  transitionThreshold: 0.8,
};

/**
 * Fast CPG configuration for testing
 */
export const FAST_CPG_CONFIG: CPGConfig = {
  numPhases: 4,
  frequency: 1.0,           // 1 Hz = 1s per cycle
  coupling: 0.3,
  stabilityThreshold: 0.1,
  dt: 10,                   // 10ms time steps
  transitionThreshold: 0.8,
};

// ============================================================================
// Phase Transition Types
// ============================================================================

/**
 * Represents a transition between test execution phases
 */
export interface PhaseTransition {
  /** Source phase index */
  readonly from: number;

  /** Target phase index */
  readonly to: number;

  /** Timestamp when transition occurred (simulation time in ms) */
  readonly timestamp: number;

  /** Source phase definition */
  readonly fromPhase: TestPhase;

  /** Target phase definition */
  readonly toPhase: TestPhase;
}

/**
 * Result of executing a test phase
 */
export interface PhaseResult {
  /** Phase identifier */
  readonly phaseId: number;

  /** Phase name */
  readonly phaseName: string;

  /** Test pass rate (0-1) */
  readonly passRate: number;

  /** Flaky test ratio (0-1) */
  readonly flakyRatio: number;

  /** Code coverage achieved (0-1) */
  readonly coverage: number;

  /** Actual duration in ms */
  readonly duration: number;

  /** Total tests executed */
  readonly testsRun: number;

  /** Tests that passed */
  readonly testsPassed: number;

  /** Tests that failed */
  readonly testsFailed: number;

  /** Tests that were skipped */
  readonly testsSkipped: number;

  /** Whether quality thresholds were met */
  readonly qualityMet: boolean;
}

// ============================================================================
// Oscillator Types
// ============================================================================

/**
 * State of an oscillator neuron
 */
export interface OscillatorState {
  /** Oscillator identifier */
  readonly id: number;

  /** Current phase angle (0 to 2*PI radians) */
  readonly phase: number;

  /** Natural angular frequency (rad/ms) */
  readonly omega: number;

  /** Oscillation amplitude */
  readonly amplitude: number;

  /** Current activity level (-1 to 1) */
  readonly activity: number;
}

/**
 * Coupling matrix entry
 */
export interface CouplingEntry {
  /** Source oscillator index */
  readonly from: number;

  /** Target oscillator index */
  readonly to: number;

  /** Coupling strength */
  readonly strength: number;
}

// ============================================================================
// Scheduler Types
// ============================================================================

/**
 * Time Crystal Scheduler state
 */
export interface SchedulerState {
  /** Whether the scheduler is running */
  readonly running: boolean;

  /** Current simulation time (ms) */
  readonly time: number;

  /** Current active phase index */
  readonly currentPhase: number;

  /** Phase transition history */
  readonly phaseHistory: number[];

  /** Oscillator states */
  readonly oscillatorStates: OscillatorState[];

  /** Whether crystal is exhibiting stable periodic behavior */
  readonly isStable: boolean;
}

/**
 * Test runner interface for real test execution
 * Full implementation in phase-executor.ts
 */
export interface TestRunnerRef {
  run(
    testTypes: string[],
    options: {
      parallelism: number;
      timeout: number;
      collectCoverage: boolean;
      retryFailed: boolean;
      maxRetries: number;
      filter?: string;
    }
  ): Promise<{
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    flaky: number;
    coverage: number;
    duration: number;
  }>;
}

/**
 * Scheduler configuration options
 */
export interface SchedulerOptions {
  /** CPG configuration */
  readonly cpgConfig: CPGConfig;

  /** Whether to auto-start on creation */
  readonly autoStart: boolean;

  /** Maximum phase history to retain */
  readonly maxHistoryLength: number;

  /**
   * Test runner for REAL test execution.
   * Use VitestTestRunner or JestTestRunner from test-runner.ts.
   * If not provided, scheduler uses MOCK MODE with deterministic fake data.
   */
  readonly testRunner?: TestRunnerRef;

  /** Callback for phase transitions */
  readonly onPhaseTransition?: (transition: PhaseTransition) => void | Promise<void>;

  /** Callback for phase execution */
  readonly onPhaseExecute?: (phase: TestPhase) => Promise<PhaseResult>;

  /** Callback for quality gate failures */
  readonly onQualityFailure?: (phase: TestPhase, result: PhaseResult) => void | Promise<void>;
}

/**
 * Default scheduler options
 */
export const DEFAULT_SCHEDULER_OPTIONS: Omit<SchedulerOptions, 'onPhaseTransition' | 'onPhaseExecute' | 'onQualityFailure'> = {
  cpgConfig: DEFAULT_CPG_CONFIG,
  autoStart: false,
  maxHistoryLength: 1000,
};

// ============================================================================
// Crystal Health Types
// ============================================================================

/**
 * Crystal health status
 */
export type CrystalHealthStatus = 'healthy' | 'degraded' | 'unstable' | 'broken';

/**
 * Crystal health metrics
 */
export interface CrystalHealth {
  /** Overall health status */
  readonly status: CrystalHealthStatus;

  /** Whether oscillators are synchronized */
  readonly synchronized: boolean;

  /** Order parameter (0-1, higher = more synchronized) */
  readonly orderParameter: number;

  /** Phase coherence measure */
  readonly coherence: number;

  /** Number of completed cycles */
  readonly completedCycles: number;

  /** Average cycle duration (ms) */
  readonly averageCycleDuration: number;

  /** Phase execution success rate */
  readonly phaseSuccessRate: number;

  /** Issues detected */
  readonly issues: CrystalIssue[];
}

/**
 * Crystal issue
 */
export interface CrystalIssue {
  /** Issue type */
  readonly type: 'desynchronization' | 'quality_failure' | 'stall' | 'oscillation_decay';

  /** Issue severity */
  readonly severity: 'low' | 'medium' | 'high' | 'critical';

  /** Human-readable description */
  readonly message: string;

  /** Timestamp when detected */
  readonly timestamp: number;

  /** Affected phase (if applicable) */
  readonly affectedPhase?: number;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Time Crystal event types
 */
export type TimeCrystalEventType =
  | 'crystal:started'
  | 'crystal:stopped'
  | 'crystal:tick'
  | 'phase:transition'
  | 'phase:started'
  | 'phase:completed'
  | 'phase:failed'
  | 'quality:failure'
  | 'crystal:repair'
  | 'crystal:stable'
  | 'crystal:unstable';

/**
 * Base Time Crystal event
 */
export interface TimeCrystalEvent {
  /** Event type */
  readonly type: TimeCrystalEventType;

  /** Timestamp (simulation time in ms) */
  readonly timestamp: number;

  /** Event payload */
  readonly payload: Record<string, unknown>;
}
