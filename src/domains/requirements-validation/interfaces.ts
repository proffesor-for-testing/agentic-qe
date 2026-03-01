/**
 * Agentic QE v3 - Requirements Validation Domain Interfaces
 *
 * Bounded Context: Requirements Validation
 * Responsibility: Pre-development requirements analysis, BDD, testability scoring
 */

import type { DomainEvent, Result } from '../../shared/types/index.js';
import type { QueenMinCutBridge } from '../../coordination/mincut/queen-integration.js';

// ============================================================================
// Value Objects
// ============================================================================

/**
 * Testability score for a requirement (0-100)
 */
export interface TestabilityScore {
  readonly value: number;
  readonly category: 'excellent' | 'good' | 'fair' | 'poor';
  readonly factors: TestabilityFactor[];
}

export interface TestabilityFactor {
  readonly name: string;
  readonly score: number;
  readonly weight: number;
  readonly issues: string[];
}

/**
 * BDD scenario in Gherkin format
 */
export interface BDDScenario {
  readonly id: string;
  readonly feature: string;
  readonly scenario: string;
  readonly given: string[];
  readonly when: string[];
  readonly then: string[];
  readonly tags: string[];
  readonly examples?: DataTable;
}

export interface DataTable {
  readonly headers: string[];
  readonly rows: string[][];
}

/**
 * User story or requirement
 */
export interface Requirement {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly acceptanceCriteria: string[];
  readonly type: 'user-story' | 'functional' | 'non-functional' | 'technical';
  readonly priority: 'critical' | 'high' | 'medium' | 'low';
  readonly status: 'draft' | 'reviewed' | 'approved' | 'implemented';
}

// ============================================================================
// Domain Events
// ============================================================================

export interface RequirementAnalyzedEvent extends DomainEvent {
  readonly type: 'RequirementAnalyzedEvent';
  readonly requirementId: string;
  readonly testabilityScore: TestabilityScore;
  readonly suggestedImprovements: string[];
}

export interface BDDScenariosGeneratedEvent extends DomainEvent {
  readonly type: 'BDDScenariosGeneratedEvent';
  readonly requirementId: string;
  readonly scenarios: BDDScenario[];
  readonly coverageEstimate: number;
}

export interface RequirementValidatedEvent extends DomainEvent {
  readonly type: 'RequirementValidatedEvent';
  readonly requirementId: string;
  readonly isValid: boolean;
  readonly validationErrors: ValidationError[];
}

export interface ValidationError {
  readonly code: string;
  readonly message: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly suggestion?: string;
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Testability Scoring Service
 * Evaluates how testable requirements are
 */
export interface ITestabilityScoringService {
  /**
   * Score a requirement's testability
   */
  scoreRequirement(requirement: Requirement): Promise<Result<TestabilityScore>>;

  /**
   * Score multiple requirements
   */
  scoreRequirements(requirements: Requirement[]): Promise<Result<Map<string, TestabilityScore>>>;

  /**
   * Get improvement suggestions
   */
  suggestImprovements(
    requirement: Requirement,
    score: TestabilityScore
  ): Promise<Result<string[]>>;

  /**
   * Check if requirement meets minimum testability threshold
   */
  meetsThreshold(score: TestabilityScore, threshold: number): boolean;
}

/**
 * BDD Scenario Generation Service
 * Generates Gherkin scenarios from requirements
 */
export interface IBDDGenerationService {
  /**
   * Generate BDD scenarios from requirement
   */
  generateScenarios(requirement: Requirement): Promise<Result<BDDScenario[]>>;

  /**
   * Generate scenarios with examples (data tables)
   */
  generateScenariosWithExamples(
    requirement: Requirement,
    exampleCount: number
  ): Promise<Result<BDDScenario[]>>;

  /**
   * Convert scenarios to Gherkin text format
   */
  toGherkin(scenarios: BDDScenario[]): string;

  /**
   * Parse Gherkin text to scenarios
   */
  parseGherkin(gherkinText: string): Result<BDDScenario[]>;
}

/**
 * Requirements Validation Service
 * Validates requirement quality and completeness
 */
export interface IRequirementsValidationService {
  /**
   * Validate a single requirement
   */
  validate(requirement: Requirement): Promise<Result<ValidationError[]>>;

  /**
   * Validate requirement for specific criteria
   */
  validateAgainstCriteria(
    requirement: Requirement,
    criteria: ValidationCriteria
  ): Promise<Result<ValidationError[]>>;

  /**
   * Check for ambiguity in requirement language
   */
  detectAmbiguity(requirement: Requirement): Promise<Result<AmbiguityReport>>;

  /**
   * Analyze requirement dependencies
   */
  analyzeDependencies(requirements: Requirement[]): Promise<Result<DependencyGraph>>;
}

export interface ValidationCriteria {
  readonly requireAcceptanceCriteria: boolean;
  readonly minTestabilityScore: number;
  readonly forbiddenTerms: string[];
  readonly requiredTags: string[];
}

export interface AmbiguityReport {
  readonly ambiguousTerms: AmbiguousTerm[];
  readonly overallScore: number;
  readonly suggestions: string[];
}

export interface AmbiguousTerm {
  readonly term: string;
  readonly context: string;
  readonly alternatives: string[];
}

export interface DependencyGraph {
  readonly nodes: RequirementNode[];
  readonly edges: DependencyEdge[];
}

export interface RequirementNode {
  readonly id: string;
  readonly title: string;
  readonly type: Requirement['type'];
}

export interface DependencyEdge {
  readonly from: string;
  readonly to: string;
  readonly type: 'depends-on' | 'blocks' | 'related-to';
}

// ============================================================================
// Repository Interfaces
// ============================================================================

export interface IRequirementRepository {
  findById(id: string): Promise<Requirement | null>;
  findByStatus(status: Requirement['status']): Promise<Requirement[]>;
  findByPriority(priority: Requirement['priority']): Promise<Requirement[]>;
  save(requirement: Requirement): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface IBDDScenarioRepository {
  findByRequirementId(requirementId: string): Promise<BDDScenario[]>;
  findByFeature(feature: string): Promise<BDDScenario[]>;
  findByTag(tag: string): Promise<BDDScenario[]>;
  save(scenario: BDDScenario): Promise<void>;
  saveAll(scenarios: BDDScenario[]): Promise<void>;
}

// ============================================================================
// Coordinator Interface
// ============================================================================

export interface IRequirementsValidationCoordinator {
  /**
   * Full requirements analysis workflow
   */
  analyzeRequirement(requirementId: string): Promise<Result<RequirementAnalysis>>;

  /**
   * Generate test artifacts from requirement
   */
  generateTestArtifacts(requirementId: string): Promise<Result<TestArtifacts>>;

  /**
   * Validate sprint requirements
   */
  validateSprintRequirements(requirementIds: string[]): Promise<Result<SprintValidation>>;

  // MinCut integration methods (ADR-047)
  setMinCutBridge(bridge: QueenMinCutBridge): void;
  isTopologyHealthy(): boolean;

  // Consensus integration methods (MM-001)
  isConsensusAvailable(): boolean;
}

export interface RequirementAnalysis {
  readonly requirement: Requirement;
  readonly testabilityScore: TestabilityScore;
  readonly validationErrors: ValidationError[];
  readonly ambiguityReport: AmbiguityReport;
  readonly suggestedImprovements: string[];
}

export interface TestArtifacts {
  readonly requirementId: string;
  readonly bddScenarios: BDDScenario[];
  readonly gherkinFiles: GherkinFile[];
  readonly testCaseOutlines: TestCaseOutline[];
}

export interface GherkinFile {
  readonly path: string;
  readonly content: string;
  readonly scenarioCount: number;
}

export interface TestCaseOutline {
  readonly id: string;
  readonly title: string;
  readonly steps: string[];
  readonly expectedResults: string[];
  readonly testData: Record<string, unknown>;
}

export interface SprintValidation {
  readonly totalRequirements: number;
  readonly validRequirements: number;
  readonly averageTestability: number;
  readonly blockers: ValidationBlocker[];
  readonly recommendations: string[];
}

export interface ValidationBlocker {
  readonly requirementId: string;
  readonly reason: string;
  readonly severity: 'critical' | 'high' | 'medium';
}

// ============================================================================
// SFDIPOT Product Factors Assessment (James Bach's HTSM)
// ============================================================================

/**
 * SFDIPOT Category - The 7 Product Factors
 */
export type SFDIPOTCategory =
  | 'structure'
  | 'function'
  | 'data'
  | 'interfaces'
  | 'platform'
  | 'operations'
  | 'time';

/**
 * Test idea priority levels
 */
export type TestPriority = 'p0' | 'p1' | 'p2' | 'p3';

/**
 * Automation fitness recommendation
 */
export type AutomationFitness =
  | 'unit'
  | 'integration'
  | 'e2e'
  | 'human-exploration'
  | 'performance'
  | 'security';

/**
 * Generated test idea from SFDIPOT analysis
 */
export interface TestIdea {
  readonly id: string;
  readonly description: string;
  readonly category: SFDIPOTCategory;
  readonly subcategory: string;
  readonly priority: TestPriority;
  readonly automationFitness: AutomationFitness;
  readonly reference?: string;
  readonly humanReason?: string; // Required when automationFitness is 'human-exploration'
}

/**
 * Clarifying question surfaced during SFDIPOT analysis
 */
export interface ClarifyingQuestion {
  readonly id: string;
  readonly question: string;
  readonly category: SFDIPOTCategory;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly context: string;
  readonly suggestedAnswer?: string;
}

/**
 * SFDIPOT category analysis result
 */
export interface CategoryAnalysis {
  readonly category: SFDIPOTCategory;
  readonly coveragePercentage: number;
  readonly subcategoriesAnalyzed: string[];
  readonly testIdeasGenerated: number;
  readonly entitiesDetected: string[];
  readonly riskFactors: string[];
}

/**
 * Domain detection result
 */
export interface DomainDetection {
  readonly domain: string;
  readonly confidence: number;
  readonly requiredPatterns: string[];
  readonly riskWeights: Record<SFDIPOTCategory, number>;
}

/**
 * Priority distribution metrics
 */
export interface PriorityDistribution {
  readonly p0: number;
  readonly p1: number;
  readonly p2: number;
  readonly p3: number;
}

/**
 * Automation fitness distribution metrics
 */
export interface AutomationDistribution {
  readonly unit: number;
  readonly integration: number;
  readonly e2e: number;
  readonly humanExploration: number;
  readonly performance: number;
  readonly security: number;
}

/**
 * Complete SFDIPOT assessment result
 */
export interface SFDIPOTAssessment {
  readonly id: string;
  readonly epicId: string;
  readonly epicTitle: string;
  readonly timestamp: Date;
  readonly qualityScore: number;
  readonly testIdeas: TestIdea[];
  readonly clarifyingQuestions: ClarifyingQuestion[];
  readonly categoryAnalysis: CategoryAnalysis[];
  readonly domainDetection: DomainDetection;
  readonly priorityDistribution: PriorityDistribution;
  readonly automationDistribution: AutomationDistribution;
  readonly outputFormats: ('html' | 'json' | 'markdown' | 'gherkin')[];
}

/**
 * SFDIPOT assessment configuration
 */
export interface SFDIPOTConfig {
  readonly maxTestIdeasPerSubcategory: number;
  readonly minQualityScore: number;
  readonly enableBrutalHonesty: boolean;
  readonly outputFormats: ('html' | 'json' | 'markdown' | 'gherkin')[];
  readonly domainHints?: string[];
  readonly priorityOverrides?: Partial<Record<SFDIPOTCategory, TestPriority>>;
}

/**
 * Assessment input document types
 */
export interface AssessmentInput {
  readonly epics?: Epic[];
  readonly userStories?: UserStory[];
  readonly functionalSpecs?: FunctionalSpec[];
  readonly architectureDocs?: ArchitectureDoc[];
  readonly codebaseUrl?: string;
  readonly websiteUrl?: string;
}

export interface Epic {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly userStories: UserStory[];
  readonly acceptanceCriteria: string[];
}

export interface UserStory {
  readonly id: string;
  readonly title: string;
  readonly asA: string;
  readonly iWant: string;
  readonly soThat: string;
  readonly acceptanceCriteria: string[];
}

export interface FunctionalSpec {
  readonly id: string;
  readonly title: string;
  readonly sections: SpecSection[];
}

export interface SpecSection {
  readonly heading: string;
  readonly content: string;
  readonly subsections?: SpecSection[];
}

export interface ArchitectureDoc {
  readonly id: string;
  readonly title: string;
  readonly components: ComponentSpec[];
  readonly integrations: IntegrationSpec[];
}

export interface ComponentSpec {
  readonly name: string;
  readonly type: string;
  readonly description: string;
  readonly dependencies: string[];
}

export interface IntegrationSpec {
  readonly source: string;
  readonly target: string;
  readonly protocol: string;
  readonly description: string;
}

/**
 * SFDIPOT Assessment Service Interface
 */
export interface ISFDIPOTAssessmentService {
  /**
   * Perform full SFDIPOT assessment on input documents
   */
  assess(input: AssessmentInput, config?: Partial<SFDIPOTConfig>): Promise<Result<SFDIPOTAssessment>>;

  /**
   * Analyze a single category
   */
  analyzeCategory(
    input: AssessmentInput,
    category: SFDIPOTCategory
  ): Promise<Result<CategoryAnalysis>>;

  /**
   * Generate test ideas for specific category
   */
  generateTestIdeas(
    analysis: CategoryAnalysis,
    config?: Partial<SFDIPOTConfig>
  ): Promise<Result<TestIdea[]>>;

  /**
   * Surface clarifying questions from coverage gaps
   */
  generateClarifyingQuestions(
    assessment: SFDIPOTAssessment
  ): Promise<Result<ClarifyingQuestion[]>>;

  /**
   * Export assessment to specified format
   */
  export(
    assessment: SFDIPOTAssessment,
    format: 'html' | 'json' | 'markdown' | 'gherkin'
  ): Promise<Result<string>>;
}

/**
 * Domain event for SFDIPOT assessment completion
 */
export interface SFDIPOTAssessmentCompletedEvent extends DomainEvent {
  readonly type: 'SFDIPOTAssessmentCompletedEvent';
  readonly assessmentId: string;
  readonly epicId: string;
  readonly testIdeasCount: number;
  readonly qualityScore: number;
  readonly categoryCoverage: Record<SFDIPOTCategory, number>;
}

// ============================================================================
// Test Idea Rewriting Service
// ============================================================================

/**
 * Test idea transformation result
 */
export interface TestIdeaTransformation {
  readonly originalId: string;
  readonly original: string;
  readonly transformed: string;
  readonly verbUsed: string;
  readonly verbCategory: 'interaction' | 'trigger' | 'measurement' | 'state' | 'observation';
}

/**
 * Rewriting result
 */
export interface RewritingResult {
  readonly inputFile: string;
  readonly outputFile: string;
  readonly testIdeasProcessed: number;
  readonly verifyPatternsFound: number;
  readonly transformationsApplied: number;
  readonly remainingVerifyPatterns: number;
  readonly qualityScore: number;
  readonly transformations: TestIdeaTransformation[];
}

/**
 * Test Idea Rewriting Service Interface
 */
export interface ITestIdeaRewritingService {
  /**
   * Transform all "Verify" patterns in a file
   */
  rewrite(inputPath: string, outputPath?: string): Promise<Result<RewritingResult>>;

  /**
   * Transform a single test idea
   */
  rewriteTestIdea(testIdea: string): Promise<Result<TestIdeaTransformation>>;

  /**
   * Validate no "Verify" patterns remain
   */
  validate(content: string): Promise<Result<{ isClean: boolean; remainingPatterns: string[] }>>;

  /**
   * Batch transform multiple files
   */
  batchRewrite(
    inputDir: string,
    outputDir: string,
    pattern?: string
  ): Promise<Result<RewritingResult[]>>;
}
