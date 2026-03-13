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

// ============================================================================
// Trigger Optimizer (ADR-056 Phase 5)
// ============================================================================

export {
  TriggerOptimizer,
  createTriggerOptimizer,
  parseSkillFrontmatter,
} from './trigger-optimizer.js';

export type {
  SkillMetadata,
  TriggerAnalysisConfig,
  TriggerAnalysisResult,
  TriggerSuggestion,
  TriggerOptimizationReport,
} from './trigger-optimizer.js';

// ============================================================================
// Version Comparator (ADR-056: A/B testing between skill versions)
// ============================================================================

export {
  VersionComparator,
  createVersionComparator,
} from './version-comparator.js';

export type {
  VersionComparisonConfig,
  SkillVersion,
  VersionComparisonResult,
  VersionResult,
  ComparisonStats,
  TestCaseComparison,
} from './version-comparator.js';

// ============================================================================
// Structured Validation Pipeline (BMAD-003)
// ============================================================================

export {
  runPipeline,
  formatPipelineReport,
} from './pipeline.js';

export type {
  StepCategory,
  StepSeverity,
  StepStatus,
  Finding,
  ValidationContext,
  ValidationStep,
  StepResult,
  PipelineConfig,
  PipelineResult,
} from './pipeline.js';

// ============================================================================
// Requirements Validation Steps (BMAD-003)
// ============================================================================

export {
  REQUIREMENTS_VALIDATION_STEPS,
  createRequirementsPipeline,
  // Individual steps
  formatCheckStep,
  completenessCheckStep,
  investCriteriaStep,
  smartAcceptanceStep,
  testabilityScoreStep,
  vagueTermStep,
  informationDensityStep,
  traceabilityCheckStep,
  implementationLeakageStep,
  domainComplianceStep,
  dependencyAnalysisStep,
  bddScenarioStep,
  holisticQualityStep,
} from './steps/requirements.js';

// ============================================================================
// Agent MCP Dependency Validation (Issue #342 Item 1)
// ============================================================================

export {
  scanMcpReferences,
  deduplicateByServer,
  getAvailableMcpServers,
  validateAgentMcpDeps,
  validateFleetMcpDeps,
} from './steps/agent-mcp-validator.js';

export type {
  McpToolReference,
  AgentMcpValidationResult,
  FleetMcpValidationResult,
} from './steps/agent-mcp-validator.js';
