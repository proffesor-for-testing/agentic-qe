/**
 * HTSM (Heuristic Test Strategy Model) Type Definitions
 * Based on James Bach's HTSM v6.3 (2024)
 */

// ============================================================================
// HTSM Product Element Categories
// ============================================================================

export type HTSMCategory =
  | 'STRUCTURE'
  | 'FUNCTION'
  | 'DATA'
  | 'INTERFACES'
  | 'PLATFORM'
  | 'OPERATIONS'
  | 'TIME';

// Structure subcategories
export type StructureSubcategory =
  | 'Code'
  | 'Hardware'
  | 'Service'
  | 'NonExecutableFiles'
  | 'Collateral';

// Function subcategories
export type FunctionSubcategory =
  | 'BusinessRules'
  | 'MultiUserSocial'
  | 'Calculation'
  | 'SecurityRelated'
  | 'Transformations'
  | 'StateTransitions'
  | 'Multimedia'
  | 'ErrorHandling'
  | 'Interactions'
  | 'Testability';

// Data subcategories
export type DataSubcategory =
  | 'InputOutput'
  | 'Preset'
  | 'Persistent'
  | 'Interdependent'
  | 'SequencesCombinations'
  | 'Cardinality'
  | 'BigLittle'
  | 'InvalidNoise'
  | 'Lifecycle';

// Interfaces subcategories
export type InterfacesSubcategory =
  | 'UserInterfaces'
  | 'SystemInterfaces'
  | 'ApiSdk'
  | 'ImportExport';

// Platform subcategories
export type PlatformSubcategory =
  | 'ExternalHardware'
  | 'ExternalSoftware'
  | 'EmbeddedComponents'
  | 'ProductFootprint';

// Operations subcategories
export type OperationsSubcategory =
  | 'Users'
  | 'Environment'
  | 'CommonUse'
  | 'UncommonUse'
  | 'ExtremeUse'
  | 'DisfavoredUse';

// Time subcategories
export type TimeSubcategory =
  | 'TimeRelatedData'
  | 'InputOutputTiming'
  | 'Pacing'
  | 'Concurrency';

export type HTSMSubcategory =
  | StructureSubcategory
  | FunctionSubcategory
  | DataSubcategory
  | InterfacesSubcategory
  | PlatformSubcategory
  | OperationsSubcategory
  | TimeSubcategory;

// ============================================================================
// HTSM Classification
// ============================================================================

export interface HTSMClassification {
  category: HTSMCategory;
  subcategory: HTSMSubcategory;
  confidence: number; // 0-1 confidence score
  rationale: string;
}

export interface HTSMCoverage {
  primary: HTSMClassification;
  secondary: HTSMClassification[];
}

// ============================================================================
// Test Case Types
// ============================================================================

export type TestPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type TestType = 'unit' | 'integration' | 'e2e' | 'api' | 'performance' | 'security';

export interface TestStep {
  type: 'given' | 'when' | 'then' | 'and' | 'but';
  text: string;
  data?: Record<string, unknown>;
}

export interface RiskAssessment {
  score: number; // 0-1
  factors: string[];
  businessImpact: 'critical' | 'high' | 'medium' | 'low';
  technicalComplexity: 'high' | 'medium' | 'low';
}

export interface Traceability {
  requirementId?: string;
  userStoryId?: string;
  epicId?: string;
  acceptanceCriteriaId?: string;
  codeModules?: string[];
}

export interface TestCase {
  id: string;
  name: string;
  description: string;
  type: TestType;
  htsm: HTSMCoverage;
  priority: TestPriority;
  risk: RiskAssessment;
  traceability: Traceability;
  preconditions: string[];
  steps: TestStep[];
  expectedResults: string[];
  testData?: Record<string, unknown>;
  tags: string[];
  estimatedDurationMs?: number;
  automated: boolean;
}

// ============================================================================
// Document Types
// ============================================================================

export interface UserStory {
  id: string;
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  acceptanceCriteria: AcceptanceCriteria[];
  priority?: TestPriority;
  epicId?: string;
  tags?: string[];
}

export interface AcceptanceCriteria {
  id: string;
  description: string;
  testable: boolean;
  testConditions?: string[];
}

export interface Epic {
  id: string;
  title: string;
  description: string;
  userStories: string[];
  businessValue: string;
}

export interface FunctionalSpec {
  id: string;
  title: string;
  overview: string;
  requirements: Requirement[];
  constraints: string[];
  assumptions: string[];
}

export interface Requirement {
  id: string;
  description: string;
  type: 'functional' | 'non-functional';
  priority: TestPriority;
  acceptance: string[];
}

export interface TechnicalArchitecture {
  components: ArchitectureComponent[];
  interfaces: InterfaceDefinition[];
  dataFlows: DataFlow[];
  technologies: Technology[];
  constraints: string[];
}

export interface ArchitectureComponent {
  name: string;
  type: 'service' | 'database' | 'ui' | 'api' | 'queue' | 'cache';
  description: string;
  dependencies: string[];
  interfaces: string[];
}

export interface InterfaceDefinition {
  name: string;
  type: 'rest' | 'graphql' | 'grpc' | 'websocket' | 'event';
  endpoints?: string[];
  dataFormat: string;
}

export interface DataFlow {
  from: string;
  to: string;
  dataType: string;
  protocol: string;
}

export interface Technology {
  name: string;
  category: 'language' | 'framework' | 'database' | 'infrastructure';
  version?: string;
}

// ============================================================================
// Analysis Results
// ============================================================================

export interface TestableElement {
  id: string;
  source: 'userStory' | 'epic' | 'spec' | 'architecture';
  sourceId: string;
  type: 'action' | 'condition' | 'data' | 'interface' | 'constraint';
  description: string;
  suggestedHTSM: HTSMCategory[];
}

export interface HTSMAnalysisResult {
  category: HTSMCategory;
  elements: TestableElement[];
  testOpportunities: TestOpportunity[];
  coverage: number; // 0-100 percentage
}

export interface TestOpportunity {
  id: string;
  htsmCategory: HTSMCategory;
  htsmSubcategory: HTSMSubcategory;
  description: string;
  technique: TestTechnique;
  priority: TestPriority;
  sourceElements: string[];
}

export type TestTechnique =
  | 'equivalence-partitioning'
  | 'boundary-value-analysis'
  | 'decision-table'
  | 'state-transition'
  | 'pairwise'
  | 'error-guessing'
  | 'exploratory'
  | 'risk-based'
  | 'scenario-based';

// ============================================================================
// Output Formats
// ============================================================================

export interface GherkinFeature {
  name: string;
  description: string;
  tags: string[];
  background?: GherkinBackground;
  scenarios: GherkinScenario[];
}

export interface GherkinBackground {
  steps: TestStep[];
}

export interface GherkinScenario {
  name: string;
  tags: string[];
  steps: TestStep[];
  examples?: GherkinExamples;
}

export interface GherkinExamples {
  headers: string[];
  rows: string[][];
}

export interface TestSuite {
  id: string;
  name: string;
  description: string;
  sourceRequirements: string[];
  tests: TestCase[];
  htsmCoverage: HTSMCoverageReport;
  traceabilityMatrix: TraceabilityMatrix;
  generatedAt: string;
}

export interface HTSMCoverageReport {
  overall: number;
  byCategory: Record<HTSMCategory, CategoryCoverage>;
  gaps: CoverageGap[];
}

export interface CategoryCoverage {
  category: HTSMCategory;
  testCount: number;
  subcategories: Record<string, number>;
  coverage: number;
}

export interface CoverageGap {
  category: HTSMCategory;
  subcategory?: HTSMSubcategory;
  severity: 'critical' | 'high' | 'medium' | 'low';
  recommendation: string;
}

export interface TraceabilityMatrix {
  requirements: TraceabilityRow[];
  coverage: number;
}

export interface TraceabilityRow {
  requirementId: string;
  requirementDescription: string;
  testCaseIds: string[];
  htsmCategories: HTSMCategory[];
  coverage: 'full' | 'partial' | 'none';
}
