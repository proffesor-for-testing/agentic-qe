/**
 * Type definitions for Advanced MCP Tools
 * Requirements Validation, BDD Generation, Production Intelligence, API Changes, Mutation Testing
 */

// Requirements Validation Types
export interface RequirementValidationIssue {
  type: 'ambiguity' | 'missing-criteria' | 'untestable' | 'vague' | 'contradiction';
  message: string;
  severity: 'low' | 'medium' | 'high';
  suggestion?: string;
}

export interface RequirementValidationResult {
  requirement: string;
  isTestable: boolean;
  testabilityScore: number;
  issues: RequirementValidationIssue[];
  testSuggestions?: string[];
}

export interface RequirementsValidateParams {
  requirements: string[];
  strictMode?: boolean;
  generateTestSuggestions?: boolean;
}

export interface RequirementsValidateResult {
  totalRequirements: number;
  testableCount: number;
  validationResults: RequirementValidationResult[];
  overallScore: number;
  recommendations: string[];
}

// BDD Generation Types
export interface BDDScenario {
  title: string;
  feature: string;
  given: string[];
  when: string[];
  then: string[];
  tags?: string[];
}

export interface BDDTestData {
  validExamples: any[];
  invalidExamples: any[];
  edgeCases: any[];
}

export interface RequirementsGenerateBDDParams {
  requirement: string;
  format?: 'gherkin' | 'cucumber' | 'plain';
  includeEdgeCases?: boolean;
  generateTestCode?: boolean;
  framework?: 'jest' | 'mocha' | 'jasmine' | 'cucumber-js';
  extractTestData?: boolean;
}

export interface RequirementsGenerateBDDResult {
  scenarios: BDDScenario[];
  cucumberFeature?: string;
  testCode?: string;
  testData?: BDDTestData;
}

// Production Incident Replay Types
export interface ProductionIncident {
  id: string;
  timestamp: string;
  type: 'error' | 'performance' | 'security' | 'availability';
  message: string;
  stackTrace?: string;
  context?: Record<string, any>;
  metrics?: Record<string, number>;
  sourceCode?: string;
}

export interface RootCauseAnalysis {
  category: 'code-defect' | 'infrastructure' | 'data' | 'configuration' | 'external-dependency';
  confidence: number;
  suggestedFixes: string[];
  affectedComponents: string[];
}

export interface CodeContext {
  relevantFiles: string[];
  suspiciousFunctions: string[];
  codeSnippets: Record<string, string>;
}

export interface ProductionIncidentReplayParams {
  incident: ProductionIncident;
  analyzeRootCause?: boolean;
  generateRegressionTests?: boolean;
  linkSimilarIncidents?: boolean;
}

export interface ProductionIncidentReplayResult {
  testGenerated: boolean;
  testCode: string;
  reproducible: boolean;
  rootCauseAnalysis?: RootCauseAnalysis;
  codeContext?: CodeContext;
  regressionTests?: string[];
  similarIncidents?: string[];
}

// RUM Analysis Types
export interface UserAction {
  type: 'pageview' | 'click' | 'api-call' | 'error' | 'scroll' | 'input';
  path?: string;
  element?: string;
  endpoint?: string;
  message?: string;
  timestamp: number;
  duration?: number;
  position?: number;
}

export interface RUMData {
  sessionId: string;
  userActions: UserAction[];
  metrics?: Record<string, number>;
}

export interface PerformanceBottleneck {
  action: string;
  duration: number;
  threshold: number;
  severity: 'low' | 'medium' | 'high';
  recommendation: string;
}

export interface ErrorPattern {
  message: string;
  frequency: number;
  affectedActions: string[];
}

export interface BehaviorInsights {
  patterns: string[];
  anomalies: string[];
  suggestions: string[];
}

export interface ProductionRUMAnalyzeParams {
  rumData: RUMData;
  detectBottlenecks?: boolean;
  generateTests?: boolean;
  analyzeBehavior?: boolean;
}

export interface ProductionRUMAnalyzeResult {
  analyzed: boolean;
  userJourney: string[];
  performanceMetrics: Record<string, number>;
  bottlenecks?: PerformanceBottleneck[];
  generatedTests?: string;
  errorPatterns?: ErrorPattern[];
  behaviorInsights?: BehaviorInsights;
}

// API Breaking Changes Types
export interface APIChange {
  type: 'addition' | 'removal' | 'parameter-change' | 'return-type-change' | 'signature-change';
  element: string;
  oldSignature?: string;
  newSignature?: string;
  severity: 'minor' | 'major' | 'breaking';
  description: string;
}

export interface APIBreakingChangesParams {
  oldAPI: string;
  newAPI: string;
  language?: 'typescript' | 'javascript' | 'python' | 'java';
  calculateSemver?: boolean;
  generateMigrationGuide?: boolean;
}

export interface APIBreakingChangesResult {
  hasBreakingChanges: boolean;
  changes: APIChange[];
  semverRecommendation?: 'major' | 'minor' | 'patch';
  migrationGuide?: string;
}

// Mutation Testing Types
export interface MutationOperator {
  name: string;
  description: string;
  applied: number;
}

export interface SurvivedMutant {
  location: string;
  operator: string;
  originalCode: string;
  mutatedCode: string;
  reason: string;
}

export interface MutationTestExecuteParams {
  sourceCode: string;
  testCode: string;
  language?: 'javascript' | 'typescript' | 'python';
  operators?: string[];
  timeout?: number;
  calculateCoverage?: boolean;
  generateSuggestions?: boolean;
}

export interface MutationTestExecuteResult {
  totalMutants: number;
  killedMutants: number;
  survivedMutants: number;
  mutationScore: number;
  mutationCoverage?: number;
  mutationsByOperator?: Record<string, number>;
  survivors?: SurvivedMutant[];
  suggestions?: string[];
  timedOut?: number;
}
