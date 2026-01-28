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

// Test Idea Transformer Service
export {
  TestIdeaTransformerService,
  createTestIdeaTransformerService,
  type ITestIdeaTransformerService,
  type TestIdeaTransformerConfig,
  type TransformationRule,
  type TransformationResult,
  type TransformHTMLResult,
} from './services/test-idea-transformer.js';

// Quality Criteria Service (HTSM/QCSD)
export {
  QualityCriteriaService,
  createQualityCriteriaService,
  type IQualityCriteriaService,
  type QualityCriteriaServiceConfig,
  type QualityCriteriaInput,
  type QualityCriteriaOutput,
  type QualityCriteriaAnalysis,
  type QualityCriteriaRecommendation,
  type HTSMCategory,
  type EvidenceType,
  type EvidencePoint,
  type Priority,
  HTSM_CATEGORIES,
  NEVER_OMIT_CATEGORIES,
  PRIORITY_DEFINITIONS,
} from './services/quality-criteria/index.js';

// QCSD Ideation Swarm Plugin
export {
  QCSDIdeationPlugin,
  createQCSDIdeationPlugin,
  type QualityCriterion,
  type HTSMCategory as QCSDHTSMCategory,
  type TestabilityAssessment,
  type RiskAssessment,
  type RiskFactor,
  type ThreatModel,
  type STRIDEThreat,
  type IdeationReport,
} from './qcsd-ideation-plugin.js';

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
