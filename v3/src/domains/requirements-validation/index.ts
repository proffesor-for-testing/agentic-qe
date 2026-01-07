/**
 * Agentic QE v3 - Requirements Validation Domain
 * Pre-development requirements analysis, BDD, and testability scoring
 *
 * This module exports the public API for the requirements-validation domain.
 */

// ============================================================================
// Domain Plugin (Primary Export)
// ============================================================================

export {
  RequirementsValidationPlugin,
  createRequirementsValidationPlugin,
  type RequirementsValidationPluginConfig,
  type RequirementsValidationAPI,
  type RequirementsValidationExtendedAPI,
} from './plugin.js';

// ============================================================================
// Coordinator
// ============================================================================

export {
  RequirementsValidationCoordinator,
  RequirementsValidationEvents,
  type CoordinatorConfig,
  type WorkflowStatus,
} from './coordinator.js';

// ============================================================================
// Services
// ============================================================================

export {
  RequirementsValidatorService,
  type RequirementsValidatorConfig,
} from './services/requirements-validator.js';

export {
  BDDScenarioWriterService,
  type BDDScenarioWriterConfig,
} from './services/bdd-scenario-writer.js';

export {
  TestabilityScorerService,
  type TestabilityScorerConfig,
  type FactorWeights,
} from './services/testability-scorer.js';

// ============================================================================
// Interfaces (Types Only)
// ============================================================================

export type {
  // Value Objects
  TestabilityScore,
  TestabilityFactor,
  BDDScenario,
  DataTable,
  Requirement,

  // Events
  RequirementAnalyzedEvent,
  BDDScenariosGeneratedEvent,
  RequirementValidatedEvent,
  ValidationError,

  // Service Interfaces
  ITestabilityScoringService,
  IBDDGenerationService,
  IRequirementsValidationService,
  ValidationCriteria,
  AmbiguityReport,
  AmbiguousTerm,
  DependencyGraph,
  RequirementNode,
  DependencyEdge,

  // Repository Interfaces
  IRequirementRepository,
  IBDDScenarioRepository,

  // Coordinator Interface
  IRequirementsValidationCoordinator,
  RequirementAnalysis,
  TestArtifacts,
  GherkinFile,
  TestCaseOutline,
  SprintValidation,
  ValidationBlocker,
} from './interfaces.js';
