/**
 * Agentic QE v3 - Validation Module
 * ADR-056 Phase 5: Swarm-based parallel skill validation
 *
 * This module provides validation infrastructure for skills and agents:
 * - SwarmSkillValidator: Parallel skill validation using Claude Flow swarms
 * - ParallelEvalRunner: Worker pool-based parallel eval execution
 * - Cross-model validation support
 * - Integration with SkillValidationLearner
 *
 * @module validation
 */

// ============================================================================
// Swarm Skill Validator
// ============================================================================

export {
  // Main class
  SwarmSkillValidator,
  createSwarmSkillValidator,

  // Configuration
  DEFAULT_SWARM_VALIDATION_CONFIG,

  // Constants
  P0_SKILLS,
  DEFAULT_VALIDATION_MODELS,
} from './swarm-skill-validator.js';

export type {
  // Configuration types
  SwarmValidationConfig,
  SwarmTopology,

  // Result types
  SwarmValidationResult,
  SwarmValidationSummary,

  // Function types
  SkillValidatorFn,
} from './swarm-skill-validator.js';

// ============================================================================
// Parallel Eval Runner (ADR-056 Phase 5)
// ============================================================================

export {
  ParallelEvalRunner,
  createParallelEvalRunner,
  DEFAULT_PARALLEL_EVAL_CONFIG,
  MockLLMExecutor,
} from './parallel-eval-runner.js';

export type {
  ParallelEvalConfig,
  EvalTestCase,
  EvalTestCaseInput,
  EvalTestCaseExpectedOutput,
  EvalTestCaseValidation,
  EvalSuite,
  TestCaseTask,
  ParallelEvalResult,
  WorkerMessage,
  WorkerProgress,
  EvalProgress,
  LLMExecutor,
} from './parallel-eval-runner.js';

// ============================================================================
// Validation Result Aggregator (ADR-056 Phase 5)
// ============================================================================

export {
  ValidationResultAggregator,
  createValidationResultAggregator,
} from './validation-result-aggregator.js';

export type {
  AggregatedValidationReport,
  AggregatorConfig,
  CrossModelReport,
  IssueSeverity,
  ModelAnomaly,
  ParallelValidationRunResult,
  RegressionReport,
  SkillValidationSummary,
  ValidationIssue,
} from './validation-result-aggregator.js';
