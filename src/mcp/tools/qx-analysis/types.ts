/**
 * Agentic QE v3 - QX (Quality Experience) Analysis Types
 *
 * QX = Marriage between QA (Quality Advocacy) and UX (User Experience)
 * Goal: Co-create Quality Experience for everyone associated with the product
 *
 * Based on methodology by Lalitkumar Bhamare / Tales of Testing
 * https://talesoftesting.com/quality-experienceqx-co-creating-quality-experience-for-everyone-associated-with-the-product/
 */

// ============================================================================
// QX Heuristics (23+ programmatic heuristics)
// ============================================================================

export enum QXHeuristic {
  // Problem Analysis (H1.x)
  PROBLEM_UNDERSTANDING = 'H1.1-problem-understanding',
  RULE_OF_THREE = 'H1.2-rule-of-three',
  PROBLEM_COMPLEXITY = 'H1.3-problem-complexity',

  // User Needs (H2.x)
  USER_NEEDS_IDENTIFICATION = 'H2.1-user-needs-identification',
  USER_NEEDS_SUITABILITY = 'H2.2-user-needs-suitability',
  USER_NEEDS_VALIDATION = 'H2.3-user-needs-validation',

  // Business Needs (H3.x)
  BUSINESS_NEEDS_IDENTIFICATION = 'H3.1-business-needs-identification',
  USER_VS_BUSINESS_BALANCE = 'H3.2-user-vs-business-balance',
  KPI_IMPACT_ANALYSIS = 'H3.3-kpi-impact-analysis',

  // Finding Balance / Oracle Resolution (H4.x)
  ORACLE_PROBLEM_DETECTION = 'H4.1-oracle-problem-detection',
  WHAT_MUST_NOT_CHANGE = 'H4.2-what-must-not-change',
  SUPPORTING_DATA_ANALYSIS = 'H4.3-supporting-data-analysis',

  // Impact Analysis (H5.x)
  GUI_FLOW_IMPACT = 'H5.1-gui-flow-impact',
  USER_FEELINGS_IMPACT = 'H5.2-user-feelings-impact',
  CROSS_FUNCTIONAL_IMPACT = 'H5.3-cross-functional-impact',
  DATA_DEPENDENT_IMPACT = 'H5.4-data-dependent-impact',

  // Creativity (H6.x)
  COMPETITIVE_ANALYSIS = 'H6.1-competitive-analysis',
  DOMAIN_INSPIRATION = 'H6.2-domain-inspiration',
  INNOVATIVE_SOLUTIONS = 'H6.3-innovative-solutions',

  // Design Quality (H7.x)
  EXACTNESS_AND_CLARITY = 'H7.1-exactness-and-clarity',
  INTUITIVE_DESIGN = 'H7.2-intuitive-design',
  COUNTER_INTUITIVE_DESIGN = 'H7.3-counter-intuitive-design',
  CONSISTENCY_ANALYSIS = 'H7.4-consistency-analysis',
}

export type HeuristicCategory =
  | 'problem'
  | 'user-needs'
  | 'business-needs'
  | 'balance'
  | 'impact'
  | 'creativity'
  | 'design';

// ============================================================================
// Core QX Analysis Types
// ============================================================================

export interface QXContext {
  url?: string;
  title?: string;
  framework?: string;
  domMetrics?: {
    totalElements: number;
    interactiveElements: number;
    forms: number;
    inputs: number;
    buttons: number;
    semanticStructure?: {
      hasNav: boolean;
      hasHeader: boolean;
      hasFooter: boolean;
      hasMain: boolean;
      hasAside: boolean;
      hasArticle: boolean;
      hasSection: boolean;
    };
  };
  accessibility?: {
    violations?: number;
    warnings?: number;
    passed?: number;
    ariaLabelsCount?: number;
    altTextsCoverage?: number;
    focusableElementsCount?: number;
    landmarkRoles?: number;
  };
  performance?: {
    loadTime?: number;
    domContentLoaded?: number;
    firstContentfulPaint?: number;
  };
  metadata?: {
    description?: string;
    keywords?: string;
    viewport?: string;
  };
  errorIndicators?: {
    hasErrorMessages?: boolean;
    consoleErrors?: number;
    consoleWarnings?: number;
  };
}

export interface QXHeuristicResult {
  id: QXHeuristic;
  name: string;
  category: HeuristicCategory;
  applied: boolean;
  score: number;
  findings: string[];
  issues: Array<{
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
  recommendations: string[];
}

export interface ProblemAnalysis {
  problemStatement: string;
  complexity: 'simple' | 'moderate' | 'complex';
  breakdown: string[];
  potentialFailures: Array<{
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    likelihood: 'unlikely' | 'possible' | 'likely' | 'very-likely';
  }>;
  clarityScore: number;
}

export interface UserNeedsAnalysis {
  needs: Array<{
    description: string;
    priority: 'must-have' | 'should-have' | 'nice-to-have';
    addressed: boolean;
    notes?: string;
  }>;
  suitability: 'excellent' | 'good' | 'adequate' | 'poor';
  challenges: string[];
  alignmentScore: number;
}

export interface BusinessNeedsAnalysis {
  primaryGoal: 'business-ease' | 'user-experience' | 'balanced';
  kpisAffected: string[];
  crossTeamImpact: Array<{
    team: string;
    impactType: 'positive' | 'negative' | 'neutral' | 'unknown';
    description: string;
  }>;
  compromisesUX: boolean;
  impactsKPIs: boolean;
  alignmentScore: number;
}

export interface CreativityAnalysis {
  innovativeApproaches: Array<{
    description: string;
    inspirationSource: string;
    applicability: 'high' | 'medium' | 'low';
    novelty: 'highly-novel' | 'moderately-novel' | 'incremental';
  }>;
  domainsExplored: string[];
  perspectives: string[];
  creativityScore: number;
  notes: string[];
}

export interface DesignAnalysis {
  exactness: {
    clarity: 'excellent' | 'good' | 'adequate' | 'poor';
    clearElements: string[];
    unclearElements: string[];
    score: number;
  };
  intuitive: {
    followsConventions: boolean;
    intuitivePatterns: string[];
    culturalIssues: string[];
    score: number;
  };
  counterIntuitive: {
    deviations: Array<{
      element: string;
      expectedBehavior: string;
      actualBehavior: string;
      impact: 'positive' | 'negative' | 'neutral';
      justification?: string;
    }>;
    innovativeJustification: boolean;
    freshEyesPerspective: boolean;
    issuesCount: number;
  };
  overallDesignScore: number;
}

export interface OracleProblem {
  type:
    | 'user-vs-business'
    | 'missing-information'
    | 'stakeholder-conflict'
    | 'unclear-criteria'
    | 'technical-constraint';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  stakeholders?: string[];
  missingInfo?: string[];
  resolutionApproach: string[];
  supportingData?: Record<string, unknown>;
}

export interface ImpactAnalysis {
  visible: {
    guiFlow?: {
      forEndUser: string[];
      forInternalUser: string[];
    };
    userFeelings: string[];
    score?: number;
  };
  invisible: {
    performance: string[];
    security: string[];
    score?: number;
  };
  immutableRequirements: string[];
  overallImpactScore: number;
}

export interface QXRecommendation {
  principle: string;
  recommendation: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  impact: number;
  effort: 'low' | 'medium' | 'high';
  priority: number;
  category: 'ux' | 'qa' | 'qx' | 'technical' | 'process' | 'design';
  evidence?: string[];
}

// ============================================================================
// Full QX Analysis Result
// ============================================================================

export interface QXAnalysisResult {
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  timestamp: string;
  target: string;
  problemAnalysis: ProblemAnalysis;
  userNeeds: UserNeedsAnalysis;
  businessNeeds: BusinessNeedsAnalysis;
  creativityAnalysis: CreativityAnalysis;
  designAnalysis: DesignAnalysis;
  oracleProblems: OracleProblem[];
  impactAnalysis: ImpactAnalysis;
  heuristics: QXHeuristicResult[];
  recommendations: QXRecommendation[];
  context: QXContext;
}

// ============================================================================
// Tool Parameters
// ============================================================================

export interface QXAnalyzeParams {
  /** Target URL or identifier to analyze */
  target: string;
  /** Pre-collected context (optional - if not provided, will use minimal context) */
  context?: QXContext;
  /** Analysis mode */
  mode?: 'full' | 'quick' | 'targeted';
  /** Specific heuristics to apply (default: all) */
  heuristics?: QXHeuristic[];
  /** Minimum oracle problem severity to report */
  minOracleSeverity?: 'low' | 'medium' | 'high' | 'critical';
  /** Include creativity analysis from diverse domains */
  includeCreativity?: boolean;
  /** Include design quality analysis */
  includeDesign?: boolean;
  [key: string]: unknown;
}

export interface QXHeuristicsParams {
  /** Pre-collected context */
  context: QXContext;
  /** Problem analysis */
  problemAnalysis: ProblemAnalysis;
  /** User needs analysis */
  userNeeds: UserNeedsAnalysis;
  /** Business needs analysis */
  businessNeeds: BusinessNeedsAnalysis;
  /** Specific heuristics to apply (default: all) */
  heuristics?: QXHeuristic[];
  [key: string]: unknown;
}

export interface QXOracleDetectParams {
  /** Pre-collected context */
  context: QXContext;
  /** User needs analysis */
  userNeeds: UserNeedsAnalysis;
  /** Business needs analysis */
  businessNeeds: BusinessNeedsAnalysis;
  /** Minimum severity to report */
  minSeverity?: 'low' | 'medium' | 'high' | 'critical';
  [key: string]: unknown;
}

export interface QXImpactParams {
  /** Pre-collected context */
  context: QXContext;
  /** Problem analysis */
  problemAnalysis: ProblemAnalysis;
  [key: string]: unknown;
}

export interface QXReportParams {
  /** Complete QX analysis result */
  analysis: QXAnalysisResult;
  /** Output format */
  format?: 'html' | 'json' | 'markdown';
  /** Output path (optional) */
  outputPath?: string;
  /** Include signature intro boxes */
  includeSignatureBoxes?: boolean;
  [key: string]: unknown;
}
