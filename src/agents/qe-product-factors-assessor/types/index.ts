/**
 * QE Product Factors Assessor - Type Definitions
 *
 * Based on James Bach's Heuristic Test Strategy Model (HTSM) v6.3
 * Product Factors: SFDIPOT (Structure, Function, Data, Interfaces, Platform, Operations, Time)
 */

// =============================================================================
// SFDIPOT Categories and Subcategories
// =============================================================================

/**
 * HTSM Product Factors - 7 primary categories
 */
export enum HTSMCategory {
  STRUCTURE = 'STRUCTURE',
  FUNCTION = 'FUNCTION',
  DATA = 'DATA',
  INTERFACES = 'INTERFACES',
  PLATFORM = 'PLATFORM',
  OPERATIONS = 'OPERATIONS',
  TIME = 'TIME'
}

/**
 * STRUCTURE subcategories - What the product is
 */
export enum StructureSubcategory {
  Code = 'Code',
  Hardware = 'Hardware',
  NonPhysical = 'NonPhysical',
  Dependencies = 'Dependencies',
  Documentation = 'Documentation'
}

/**
 * FUNCTION subcategories - What the product does
 */
export enum FunctionSubcategory {
  Application = 'Application',
  Calculation = 'Calculation',
  ErrorHandling = 'ErrorHandling',
  StateTransition = 'StateTransition',
  Security = 'Security',
  Startup = 'Startup',
  Shutdown = 'Shutdown'
}

/**
 * DATA subcategories - What the product processes
 */
export enum DataSubcategory {
  InputOutput = 'InputOutput',
  Lifecycle = 'Lifecycle',
  Cardinality = 'Cardinality',
  Boundaries = 'Boundaries',
  Persistence = 'Persistence',
  Types = 'Types',
  Selection = 'Selection'
}

/**
 * INTERFACES subcategories - How the product connects
 */
export enum InterfacesSubcategory {
  UserInterface = 'UserInterface',
  ApiSdk = 'ApiSdk',
  SystemInterface = 'SystemInterface',
  ImportExport = 'ImportExport',
  Messaging = 'Messaging'
}

/**
 * PLATFORM subcategories - What the product depends upon
 */
export enum PlatformSubcategory {
  Browser = 'Browser',
  OperatingSystem = 'OperatingSystem',
  Hardware = 'Hardware',
  ExternalSoftware = 'ExternalSoftware',
  InternalComponents = 'InternalComponents'
}

/**
 * OPERATIONS subcategories - How the product is used
 */
export enum OperationsSubcategory {
  CommonUse = 'CommonUse',
  UncommonUse = 'UncommonUse',
  ExtremeUse = 'ExtremeUse',
  DisfavoredUse = 'DisfavoredUse',
  Users = 'Users',
  Environment = 'Environment'
}

/**
 * TIME subcategories - When things happen
 */
export enum TimeSubcategory {
  Timing = 'Timing',
  Concurrency = 'Concurrency',
  Scheduling = 'Scheduling',
  Timeout = 'Timeout',
  Sequencing = 'Sequencing'
}

/**
 * Union type for all subcategories
 */
export type HTSMSubcategory =
  | StructureSubcategory
  | FunctionSubcategory
  | DataSubcategory
  | InterfacesSubcategory
  | PlatformSubcategory
  | OperationsSubcategory
  | TimeSubcategory;

/**
 * SFDIPOT subcategories mapping
 */
export const SFDIPOT_SUBCATEGORIES: Record<HTSMCategory, string[]> = {
  [HTSMCategory.STRUCTURE]: Object.values(StructureSubcategory),
  [HTSMCategory.FUNCTION]: Object.values(FunctionSubcategory),
  [HTSMCategory.DATA]: Object.values(DataSubcategory),
  [HTSMCategory.INTERFACES]: Object.values(InterfacesSubcategory),
  [HTSMCategory.PLATFORM]: Object.values(PlatformSubcategory),
  [HTSMCategory.OPERATIONS]: Object.values(OperationsSubcategory),
  [HTSMCategory.TIME]: Object.values(TimeSubcategory)
};

/**
 * Category descriptions from HTSM
 */
export const CATEGORY_DESCRIPTIONS: Record<HTSMCategory, string> = {
  [HTSMCategory.STRUCTURE]: 'Everything that comprises the physical product',
  [HTSMCategory.FUNCTION]: 'Everything the product does',
  [HTSMCategory.DATA]: 'Everything the product processes',
  [HTSMCategory.INTERFACES]: 'Every conduit by which the product is accessed or accesses other things',
  [HTSMCategory.PLATFORM]: 'Everything on which the product depends that is outside the project',
  [HTSMCategory.OPERATIONS]: 'How the product will be used',
  [HTSMCategory.TIME]: 'Any relationship between the product and time'
};

// =============================================================================
// Priority and Automation Fitness
// =============================================================================

/**
 * Risk-based priority levels
 */
export enum Priority {
  P0 = 'P0', // Critical - Data loss, security, system down
  P1 = 'P1', // High - Major feature broken
  P2 = 'P2', // Medium - Minor feature impact
  P3 = 'P3'  // Low - Edge cases, nice-to-have
}

/**
 * Priority metadata for display
 */
export const PRIORITY_METADATA: Record<Priority, { label: string; description: string; cssClass: string }> = {
  [Priority.P0]: {
    label: 'Critical',
    description: 'Data loss, security breach, or complete system failure',
    cssClass: 'priority-p0'
  },
  [Priority.P1]: {
    label: 'High',
    description: 'Major feature broken or significant user impact',
    cssClass: 'priority-p1'
  },
  [Priority.P2]: {
    label: 'Medium',
    description: 'Minor feature impact or degraded experience',
    cssClass: 'priority-p2'
  },
  [Priority.P3]: {
    label: 'Low',
    description: 'Edge cases, cosmetic issues, or rare scenarios',
    cssClass: 'priority-p3'
  }
};

/**
 * Automation fitness recommendations
 */
export enum AutomationFitness {
  API = 'api-level',
  Integration = 'integration-level',
  E2E = 'e2e-level',
  Human = 'human-exploration',
  Performance = 'performance',
  Security = 'security',
  Visual = 'visual',
  Accessibility = 'accessibility',
  Concurrency = 'concurrency'
}

/**
 * Automation fitness metadata for display
 */
export const AUTOMATION_FITNESS_METADATA: Record<AutomationFitness, { label: string; cssClass: string }> = {
  [AutomationFitness.API]: { label: 'Automate on API level', cssClass: 'automation-api' },
  [AutomationFitness.Integration]: { label: 'Automate on Integration level', cssClass: 'automation-integration' },
  [AutomationFitness.E2E]: { label: 'Automate on E2E level', cssClass: 'automation-e2e' },
  [AutomationFitness.Human]: { label: 'Human testers must explore', cssClass: 'automation-human' },
  [AutomationFitness.Performance]: { label: 'Performance testing recommended', cssClass: 'automation-performance' },
  [AutomationFitness.Security]: { label: 'Security testing recommended', cssClass: 'automation-security' },
  [AutomationFitness.Visual]: { label: 'Visual regression testing', cssClass: 'automation-visual' },
  [AutomationFitness.Accessibility]: { label: 'Accessibility audit required', cssClass: 'automation-accessibility' },
  [AutomationFitness.Concurrency]: { label: 'Concurrency testing required', cssClass: 'automation-concurrency' }
};

// =============================================================================
// Input Types
// =============================================================================

/**
 * User Story structure
 */
export interface UserStory {
  id: string;
  title?: string;
  asA: string;      // Role/persona
  iWant: string;    // Feature/action
  soThat: string;   // Benefit/value
  acceptanceCriteria?: string[];
  rawText?: string;
}

/**
 * Epic structure
 */
export interface Epic {
  id: string;
  title: string;
  description: string;
  userStories?: UserStory[];
  rawText?: string;
}

/**
 * Functional Specification
 */
export interface FunctionalSpec {
  id: string;
  title: string;
  sections: SpecSection[];
  rawText?: string;
}

export interface SpecSection {
  heading: string;
  content: string;
  subsections?: SpecSection[];
}

/**
 * Technical Architecture
 */
export interface TechnicalArchitecture {
  components?: ArchitectureComponent[];
  integrations?: Integration[];
  dataFlows?: DataFlow[];
  rawText?: string;
}

export interface ArchitectureComponent {
  name: string;
  type: 'service' | 'database' | 'queue' | 'cache' | 'external' | 'ui';
  description?: string;
  dependencies?: string[];
}

export interface Integration {
  source: string;
  target: string;
  type: 'sync' | 'async' | 'event';
  protocol?: string;
}

export interface DataFlow {
  name: string;
  steps: string[];
}

/**
 * Assessment Input - all supported input types
 */
export interface AssessmentInput {
  /** User stories - text, markdown, or parsed */
  userStories?: string | UserStory[];

  /** Epics - text or parsed */
  epics?: string | Epic[];

  /** Functional specifications - text or parsed */
  functionalSpecs?: string | FunctionalSpec[];

  /** Technical architecture - text or parsed */
  architecture?: string | TechnicalArchitecture;

  /** Root directory of codebase to analyze */
  codebaseRootDir?: string;

  /** Production website URL to analyze */
  websiteUrl?: string;

  /** Name for the assessment (used in output file naming) */
  assessmentName?: string;

  /** Output format(s) to generate */
  outputFormat?: OutputFormat | OutputFormat[];

  /** Filter to specific SFDIPOT categories */
  includeCategories?: HTSMCategory[];

  /** Enable LLM for context-aware questions */
  useLLM?: boolean;

  // =========================================================================
  // Code Intelligence Options (Phase 1-3)
  // =========================================================================

  /** Enable code intelligence for automated codebase analysis */
  enableCodeIntelligence?: boolean;

  /** Include C4 architecture diagrams in output */
  includeC4Diagrams?: boolean;

  /** Enable module coupling analysis for risk prioritization */
  enableCouplingAnalysis?: boolean;

  /** Enable semantic search for pattern detection */
  enableSemanticSearch?: boolean;
}

// =============================================================================
// Code Intelligence Types
// =============================================================================

/**
 * Detected external system from code intelligence
 */
export interface DetectedExternalSystem {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** System type (database, cache, queue, api, etc.) */
  type: 'database' | 'cache' | 'queue' | 'api' | 'storage' | 'auth' | 'monitoring' | 'cloud';
  /** Specific technology (e.g., PostgreSQL, Redis) */
  technology: string;
  /** Package that indicated this dependency */
  detectedFrom: string;
  /** Relationship type */
  relationship: 'stores_data_in' | 'uses' | 'sends_messages_to' | 'authenticates_with';
}

/**
 * Detected component from code intelligence
 */
export interface DetectedComponent {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Component type */
  type: 'layer' | 'module' | 'feature' | 'package';
  /** Architectural boundary (e.g., 'Business Logic', 'Data Access') */
  boundary?: string;
  /** Technology/framework */
  technology?: string;
  /** Files in this component */
  files: string[];
  /** Component responsibilities */
  responsibilities?: string[];
}

/**
 * Component relationship from code intelligence
 */
export interface DetectedRelationship {
  /** Source component ID */
  sourceId: string;
  /** Target component ID */
  targetId: string;
  /** Relationship type */
  type: 'imports' | 'calls' | 'uses' | 'depends_on' | 'extends' | 'implements';
  /** Relationship weight (number of references) */
  weight?: number;
}

/**
 * Module coupling result
 */
export interface ModuleCouplingInfo {
  /** Module A */
  moduleA: string;
  /** Module B */
  moduleB: string;
  /** Coupling strength (0-1) */
  couplingStrength: number;
  /** Is this circular? */
  isCircular: boolean;
  /** Recommended action */
  recommendation?: string;
}

/**
 * C4 Diagram output
 */
export interface C4Diagrams {
  /** C4 Context diagram (Mermaid syntax) */
  context?: string;
  /** C4 Container diagram (Mermaid syntax) */
  container?: string;
  /** C4 Component diagram (Mermaid syntax) */
  component?: string;
  /** Dependency graph (Mermaid syntax) */
  dependency?: string;
}

/**
 * Code Intelligence Analysis Result
 */
export interface CodeIntelligenceResult {
  /** Detected external systems (PLATFORM category) */
  externalSystems: DetectedExternalSystem[];
  /** Detected components (STRUCTURE/INTERFACES) */
  components: DetectedComponent[];
  /** Component relationships */
  relationships: DetectedRelationship[];
  /** Module coupling info (for risk prioritization) */
  couplingAnalysis?: ModuleCouplingInfo[];
  /** C4 diagrams */
  c4Diagrams?: C4Diagrams;
  /** Analysis metadata */
  metadata: {
    filesAnalyzed: number;
    componentsDetected: number;
    externalSystemsDetected: number;
    analysisTimeMs: number;
  };
}

/**
 * Output formats
 */
export type OutputFormat = 'html' | 'json' | 'markdown' | 'gherkin' | 'all';

// =============================================================================
// Output Types
// =============================================================================

/**
 * Test Idea - generated test case suggestion
 */
export interface TestIdea {
  /** Unique identifier (e.g., TC-STRU-A1B2C3D4) */
  id: string;

  /** SFDIPOT category */
  category: HTSMCategory;

  /** Subcategory within the category */
  subcategory: string;

  /** Test idea description */
  description: string;

  /** Risk-based priority */
  priority: Priority;

  /** Automation recommendation */
  automationFitness: AutomationFitness;

  /** Traceability to source requirement */
  sourceRequirement?: string;

  /** Additional tags */
  tags?: string[];

  /** Rationale for this test idea */
  rationale?: string;
}

/**
 * Clarifying Question - question for coverage gaps
 */
export interface ClarifyingQuestion {
  /** SFDIPOT category this question relates to */
  category: HTSMCategory;

  /** Subcategory this question addresses */
  subcategory: string;

  /** The question text */
  question: string;

  /** Why this question is important */
  rationale: string;

  /** Whether generated by LLM or template */
  source: 'llm' | 'template';
}

/**
 * Category Analysis Result
 */
export interface CategoryAnalysis {
  category: HTSMCategory;
  testIdeas: TestIdea[];
  clarifyingQuestions: ClarifyingQuestion[];
  coverage: {
    subcategoriesCovered: string[];
    subcategoriesMissing: string[];
    coveragePercentage: number;
  };
}

/**
 * Assessment Summary Statistics
 */
export interface AssessmentSummary {
  totalTestIdeas: number;
  byCategory: Record<HTSMCategory, number>;
  byPriority: Record<Priority, number>;
  byAutomationFitness: Record<AutomationFitness, number>;
  totalClarifyingQuestions: number;
  overallCoverageScore: number;
  generatedAt: Date;
}

/**
 * Full Assessment Output
 */
export interface AssessmentOutput {
  /** Assessment name/title */
  name: string;

  /** Source documents used */
  sourceDocuments: string[];

  /** Analysis by category */
  categoryAnalysis: Map<HTSMCategory, CategoryAnalysis>;

  /** All test ideas (flattened) */
  testIdeas: TestIdea[];

  /** All clarifying questions (flattened) */
  clarifyingQuestions: ClarifyingQuestion[];

  /** Summary statistics */
  summary: AssessmentSummary;

  /** HTML output (if requested) */
  html?: string;

  /** JSON output (if requested) */
  json?: string;

  /** Markdown output (if requested) */
  markdown?: string;

  /** Gherkin features (if requested) */
  gherkin?: Map<string, string>;

  /** Code intelligence analysis result (if enabled) */
  codeIntelligence?: CodeIntelligenceResult;

  /** C4 architecture diagrams (if requested) */
  c4Diagrams?: C4Diagrams;
}

// =============================================================================
// Context Detection Types
// =============================================================================

/**
 * Detected project context/domain
 */
export interface ProjectContext {
  /** Primary domain */
  domain: ProjectDomain;

  /** Additional domain hints */
  domainHints: string[];

  /** Project type */
  projectType: ProjectType;

  /** Detected constraints */
  constraints: string[];

  /** Key entities extracted from input */
  entities: ExtractedEntities;
}

export type ProjectDomain =
  | 'ecommerce'
  | 'healthcare'
  | 'finance'
  | 'social'
  | 'saas'
  | 'infrastructure'
  | 'ml-ai'
  | 'sustainability'
  | 'accessibility'
  | 'generic';

export type ProjectType = 'startup' | 'enterprise' | 'regulated' | 'internal' | 'generic';

/**
 * Entities extracted from input for context-aware generation
 */
export interface ExtractedEntities {
  /** User roles/personas */
  actors: string[];

  /** Features/capabilities */
  features: string[];

  /** Data types mentioned */
  dataTypes: string[];

  /** Integrations/external systems */
  integrations: string[];

  /** Actions/verbs */
  actions: string[];
}

// =============================================================================
// Agent Task Types
// =============================================================================

/**
 * Task types supported by QEProductFactorsAssessor
 */
export type ProductFactorsTaskType =
  | 'assess'              // Full assessment
  | 'analyze-sfdipot'     // SFDIPOT analysis only
  | 'generate-questions'  // Clarifying questions only
  | 'generate-tests'      // Test ideas only
  | 'format-output';      // Format existing analysis

/**
 * Task payload for the agent
 */
export interface ProductFactorsTaskPayload {
  type: ProductFactorsTaskType;
  input: AssessmentInput;
  options?: {
    /** Skip LLM-powered question generation */
    skipLLM?: boolean;
    /** Maximum test ideas per subcategory */
    maxTestIdeasPerSubcategory?: number;
    /** Minimum priority to include */
    minPriority?: Priority;
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique test ID
 */
export function generateTestId(category: HTSMCategory): string {
  const prefix = category.substring(0, 4).toUpperCase();
  const hash = Math.random().toString(16).substring(2, 10).toUpperCase();
  return `TC-${prefix}-${hash}`;
}

/**
 * Get all subcategories for a category
 */
export function getSubcategories(category: HTSMCategory): string[] {
  return SFDIPOT_SUBCATEGORIES[category] || [];
}

/**
 * Check if a string matches a category
 */
export function matchCategory(text: string): HTSMCategory | null {
  const normalized = text.toUpperCase();
  for (const category of Object.values(HTSMCategory)) {
    if (normalized.includes(category)) {
      return category;
    }
  }
  return null;
}
