/**
 * Agentic QE v3 - Time Crystal Scheduling
 * ADR-032: Kuramoto CPG oscillators for self-sustaining scheduling
 *
 * Time Crystal Scheduling uses coupled oscillators (Central Pattern Generator)
 * to create emergent, self-sustaining test execution schedules. The system
 * doesn't need external cron jobs because it generates its own periodic patterns.
 *
 * Key concepts:
 * - Kuramoto model: Phase synchronization through coupling
 * - CPG (Central Pattern Generator): Rhythmic output without external timing
 * - Winner-take-all: Highest activity oscillator determines current phase
 * - Quality gating: Phase transitions require passing quality thresholds
 * - Self-repair: Crystal re-synchronizes after quality failures
 *
 * @module time-crystal
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Test Phase Types
  TestType,
  TestPhase,
  PhaseThresholds,
  PhaseAgentConfig,

  // CPG Configuration
  CPGConfig,

  // Phase Transitions
  PhaseTransition,
  PhaseResult,

  // Oscillator State
  OscillatorState,
  CouplingEntry,

  // Scheduler State
  SchedulerState,
  SchedulerOptions,

  // Test Runner Reference (for SchedulerOptions)
  TestRunnerRef,

  // Health Monitoring
  CrystalHealth,
  CrystalHealthStatus,
  CrystalIssue,

  // Events
  TimeCrystalEventType,
  TimeCrystalEvent,
} from './types';

export {
  DEFAULT_CPG_CONFIG,
  PRODUCTION_CPG_CONFIG,
  FAST_CPG_CONFIG,
  DEFAULT_SCHEDULER_OPTIONS,
} from './types';

// ============================================================================
// Oscillator
// ============================================================================

export {
  OscillatorNeuron,
  computeOrderParameter,
  computePhaseCoherence,
  createEvenlySpacedOscillators,
  buildRingCouplingMatrix,
  buildAllToAllCouplingMatrix,
} from './oscillator';

// ============================================================================
// Scheduler
// ============================================================================

export {
  TimeCrystalScheduler,
  createDefaultScheduler,
} from './scheduler';

export type { TimeCrystalEventHandler } from './scheduler';

// ============================================================================
// Phase Executor
// ============================================================================

export {
  PhaseExecutor,
  QualityGateEvaluator,
  createMockTestRunner,
  createFailingTestRunner,
} from './phase-executor';

export type {
  TestRunner,
  TestRunnerOptions,
  TestRunnerResult,
  TestDetail,
  QualityGateResult,
  GateEvaluation,
} from './phase-executor';

// ============================================================================
// Test Runners (Real Execution)
// ============================================================================

export {
  // Real test runner implementations
  VitestTestRunner,
  JestTestRunner,

  // Factory function
  createTestRunner,
  runTests,

  // Auto-detection utility
  detectTestRunner,

  // Errors
  TestExecutionError,
  TestOutputParseError,
} from './test-runner';

export type {
  SubprocessTestRunnerConfig,
} from './test-runner';

// ============================================================================
// Default Phases
// ============================================================================

export {
  // Standard Thresholds
  STRICT_UNIT_THRESHOLDS,
  STANDARD_INTEGRATION_THRESHOLDS,
  RELAXED_E2E_THRESHOLDS,
  PERFORMANCE_THRESHOLDS,
  SECURITY_THRESHOLDS,

  // Agent Configs
  HIGH_PARALLELISM_CONFIG,
  MEDIUM_PARALLELISM_CONFIG,
  LOW_PARALLELISM_CONFIG,
  SEQUENTIAL_CONFIG,

  // Phase Presets
  DEFAULT_TEST_PHASES,
  FAST_TEST_PHASES,
  COMPREHENSIVE_TEST_PHASES,
  SECURITY_FOCUSED_PHASES,

  // Builder Utilities
  createPhase,
  scalePhases,
  adjustThresholds,
  mergePhases,
  getPhasesForProjectType,
} from './default-phases';
