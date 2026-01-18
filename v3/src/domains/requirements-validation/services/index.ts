/**
 * Agentic QE v3 - Requirements Validation Services
 * Service layer exports for the requirements-validation domain
 */

export {
  RequirementsValidatorService,
  type RequirementsValidatorConfig,
} from './requirements-validator.js';

export {
  BDDScenarioWriterService,
  type BDDScenarioWriterConfig,
} from './bdd-scenario-writer.js';

export {
  TestabilityScorerService,
  type TestabilityScorerConfig,
  type FactorWeights,
} from './testability-scorer.js';

// ============================================================================
// Product Factors Assessment (SFDIPOT)
// ============================================================================

export {
  // Main Service
  ProductFactorsService,
  createProductFactorsService,
  type ProductFactorsServiceConfig,

  // Types
  HTSMCategory,
  Priority,
  AutomationFitness,
  type TestIdea,
  type ClarifyingQuestion,
  type AssessmentInput,
  type AssessmentOutput,
  type AssessmentSummary,
  type CategoryAnalysis,
  type ProjectContext,
  type UserStory,
  type Epic,
  type FunctionalSpec,
  type TechnicalArchitecture,
  type ArchitectureComponent,
  type Integration,
  type DataFlow,
  type ExtractedEntities,
  type DetectedDomain,
  type CodeIntelligenceResult,
  SFDIPOT_SUBCATEGORIES,
  CATEGORY_DESCRIPTIONS,
  generateTestId,

  // Analyzers
  SFDIPOTAnalyzer,
  BrutalHonestyAnalyzer,
  brutalHonestyAnalyzer,
  type AnalysisInput,
  type SubcategoryAnalysis,
  type CategoryAnalysisResult,
  type ExtendedAnalysisResult,
  BrutalHonestySeverity,
  BrutalHonestyMode,
  type BrutalHonestyFinding,
  type RequirementsQualityScore,
  type TestIdeaValidation,
  type EnhancedQuestion,
  type ACTestabilityResult,
  type ScoringRubricExplanation,

  // Parsers
  UserStoryParser,
  DocumentParser,
  ArchitectureParser,
  type ParsedUserStoryResult,
  type ParsedDocumentResult,
  type ParsedArchitectureResult,

  // Generators
  TestIdeaGenerator,
  QuestionGenerator,
  type TestIdeaGeneratorConfig,
  type QuestionGeneratorConfig,

  // Formatters
  HTMLFormatter,
  JSONFormatter,
  MarkdownFormatter,
  GherkinFormatter,
  type JSONFormatterOptions,
  type MarkdownFormatterOptions,
  type GherkinFormatterOptions,

  // Patterns
  domainPatternRegistry,
  DomainPatternRegistry,
  DOMAIN_PATTERNS,
  type DomainPattern,
  type DomainBSPattern,
  type DomainTestTemplate,
  type DomainDetectionResult,

  // Skills Integration
  SkillIntegration,
  SKILL_MAPPINGS,
  type SkillMapping,

  // Code Intelligence
  CodebaseAnalyzer,
  type CodebaseAnalyzerConfig,
} from './product-factors-assessment/index.js';
