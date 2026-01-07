/**
 * Agentic QE v3 - Requirements Validation Domain Interfaces
 *
 * Bounded Context: Requirements Validation
 * Responsibility: Pre-development requirements analysis, BDD, testability scoring
 */

import type { DomainEvent, Result } from '../../shared/types/index.js';

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
