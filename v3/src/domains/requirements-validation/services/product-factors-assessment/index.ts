/**
 * Product Factors Assessment Module
 *
 * SFDIPOT-based product factors analysis using James Bach's HTSM framework.
 * Provides comprehensive test idea generation, clarifying questions,
 * and multiple output formats.
 *
 * Key Features:
 * - SFDIPOT framework: Structure, Function, Data, Interfaces, Platform, Operations, Time
 * - 7 categories with 37 subcategories for comprehensive coverage
 * - Brutal Honesty validation (Bach/Ramsay/Linus modes)
 * - Domain pattern detection with confidence scoring
 * - Code intelligence integration for architecture-aware analysis
 * - Multiple output formats: HTML, JSON, Markdown, Gherkin
 *
 * @example
 * ```typescript
 * import { ProductFactorsService } from './product-factors-assessment';
 *
 * const service = new ProductFactorsService({
 *   enableBrutalHonesty: true,
 *   defaultOutputFormat: 'html',
 * });
 *
 * const result = await service.assess({
 *   userStories: 'As a user, I want to login securely so that my account is protected',
 *   assessmentName: 'Login Feature Assessment',
 * });
 *
 * console.log(`Generated ${result.testIdeas.length} test ideas`);
 * ```
 */

// ============================================================================
// Main Service
// ============================================================================

export {
  ProductFactorsService,
  createProductFactorsService,
  type ProductFactorsServiceConfig,
} from './product-factors-service.js';

// ============================================================================
// Types
// ============================================================================

export {
  // Enums
  HTSMCategory,
  Priority,
  AutomationFitness,

  // Interfaces
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

  // Constants
  SFDIPOT_SUBCATEGORIES,
  CATEGORY_DESCRIPTIONS,

  // Utilities
  generateTestId,
} from './types/index.js';

// ============================================================================
// Analyzers
// ============================================================================

export {
  SFDIPOTAnalyzer,
  BrutalHonestyAnalyzer,
  brutalHonestyAnalyzer,
  BrutalHonestySeverity,
  BrutalHonestyMode,
} from './analyzers/index.js';
export type {
  AnalysisInput,
  SubcategoryAnalysis,
  CategoryAnalysisResult,
  ExtendedAnalysisResult,
  BrutalHonestyFinding,
  RequirementsQualityScore,
  TestIdeaValidation,
  EnhancedQuestion,
  ACTestabilityResult,
  ScoringRubricExplanation,
} from './analyzers/index.js';

// ============================================================================
// Parsers
// ============================================================================

export {
  UserStoryParser,
  DocumentParser,
  ArchitectureParser,
  type ParsedUserStoryResult,
  type ParsedDocumentResult,
  type ParsedArchitectureResult,
} from './parsers/index.js';

// ============================================================================
// Generators
// ============================================================================

export {
  TestIdeaGenerator,
  QuestionGenerator,
  type TestIdeaGeneratorConfig,
  type QuestionGeneratorConfig,
} from './generators/index.js';

// ============================================================================
// Formatters
// ============================================================================

export {
  HTMLFormatter,
  JSONFormatter,
  MarkdownFormatter,
  GherkinFormatter,
  type JSONFormatterOptions,
  type MarkdownFormatterOptions,
  type GherkinFormatterOptions,
} from './formatters/index.js';

// ============================================================================
// Patterns
// ============================================================================

export {
  domainPatternRegistry,
  DomainPatternRegistry,
  DOMAIN_PATTERNS,
  type DomainPattern,
  type DomainBSPattern,
  type DomainTestTemplate,
  type DomainDetectionResult,
} from './patterns/index.js';

// ============================================================================
// Skills Integration
// ============================================================================

export {
  SkillIntegration,
  SKILL_MAPPINGS,
  type SkillMapping,
} from './skills/index.js';

// ============================================================================
// Code Intelligence
// ============================================================================

export {
  CodebaseAnalyzer,
  type CodebaseAnalyzerConfig,
} from './code-intelligence/index.js';
