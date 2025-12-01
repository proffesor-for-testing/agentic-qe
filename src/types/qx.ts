/**
 * Quality Experience (QX) Type Definitions
 * 
 * QX = Marriage between QA (Quality Advocacy) and UX (User Experience)
 * Goal: Co-create Quality Experience for everyone associated with the product
 * 
 * Based on: https://talesoftesting.com/quality-experienceqx-co-creating-quality-experience-for-everyone-associated-with-the-product/
 */

// ============================================================================
// Core QX Analysis Types
// ============================================================================

/**
 * Comprehensive QX Analysis Result
 */
export interface QXAnalysis {
  /** Overall QX score (0-100) */
  overallScore: number;
  
  /** QX grade (A/B/C/D/F) */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  
  /** Timestamp of analysis */
  timestamp: Date;
  
  /** Target URL or product identifier */
  target: string;
  
  /** Problem understanding and analysis */
  problemAnalysis: ProblemAnalysis;
  
  /** User needs assessment */
  userNeeds: UserNeedsAnalysis;
  
  /** Business needs assessment */
  businessNeeds: BusinessNeedsAnalysis;
  
  /** Oracle problems detected (if any) */
  oracleProblems: OracleProblem[];
  
  /** Impact analysis results */
  impactAnalysis: ImpactAnalysis;
  
  /** Applied heuristics and results */
  heuristics: QXHeuristicResult[];
  
  /** Contextual recommendations */
  recommendations: QXRecommendation[];
  
  /** Integration with testability scoring */
  testabilityIntegration?: TestabilityIntegration;
  
  /** Raw context collected during analysis */
  context: QXContext;
}

/**
 * Problem Understanding and Analysis
 * Rule of Three: If you can't think of at least three ways the design could fail,
 * you haven't tested the design enough.
 */
export interface ProblemAnalysis {
  /** What problem is being solved? */
  problemStatement: string;
  
  /** Is the problem simple or complex? */
  complexity: 'simple' | 'moderate' | 'complex';
  
  /** Problem breakdown into sub-problems */
  breakdown: string[];
  
  /** Potential failure modes (Rule of Three - minimum 3) */
  potentialFailures: Array<{
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    likelihood: 'unlikely' | 'possible' | 'likely' | 'very-likely';
  }>;
  
  /** Clarity score (0-100) */
  clarityScore: number;
}

/**
 * User Needs Analysis
 */
export interface UserNeedsAnalysis {
  /** Identified user needs */
  needs: Array<{
    description: string;
    priority: 'must-have' | 'should-have' | 'nice-to-have';
    addressed: boolean;
    notes?: string;
  }>;
  
  /** Are user needs appropriate for the problem? */
  suitability: 'excellent' | 'good' | 'adequate' | 'poor';
  
  /** Information that invalidates/challenges user needs */
  challenges: string[];
  
  /** User needs alignment score (0-100) */
  alignmentScore: number;
}

/**
 * Business Needs Analysis
 */
export interface BusinessNeedsAnalysis {
  /** Primary goal: ease of business vs user experience */
  primaryGoal: 'business-ease' | 'user-experience' | 'balanced';
  
  /** Business KPIs affected */
  kpisAffected: string[];
  
  /** Cross-team impact */
  crossTeamImpact: Array<{
    team: string;
    impactType: 'positive' | 'negative' | 'neutral' | 'unknown';
    description: string;
  }>;
  
  /** Does business ease compromise user experience? */
  compromisesUX: boolean;
  
  /** Does UX improvement impact business KPIs? */
  impactsKPIs: boolean;
  
  /** Business needs alignment score (0-100) */
  alignmentScore: number;
}

/**
 * Oracle Problem - When testers can't decide quality criteria
 */
export interface OracleProblem {
  /** Type of oracle problem */
  type: 'user-vs-business' | 'missing-information' | 'stakeholder-conflict' | 'unclear-criteria' | 'technical-constraint';
  
  /** Description of the problem */
  description: string;
  
  /** Severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  /** Conflicting stakeholders (if applicable) */
  stakeholders?: string[];
  
  /** Missing information needed for resolution */
  missingInfo?: string[];
  
  /** Recommended resolution approach */
  resolutionApproach: string[];
  
  /** Supporting data/statistics */
  supportingData?: Record<string, any>;
}

/**
 * Comprehensive Impact Analysis
 */
export interface ImpactAnalysis {
  /** Visible impacts */
  visible: ImpactMap;
  
  /** Invisible/hidden impacts */
  invisible: ImpactMap;
  
  /** What must not change? */
  immutableRequirements: string[];
  
  /** Overall impact score (0-100, higher = more impact/risk) */
  overallImpactScore: number;
}

/**
 * Impact mapping for different areas
 */
export interface ImpactMap {
  /** GUI process flow impact */
  guiFlow?: {
    forEndUser: string[];
    forInternalUser: string[];
  };
  
  /** Impact on user feelings */
  userFeelings?: Array<{
    feeling: 'happy' | 'confused' | 'frustrated' | 'overwhelmed' | 'satisfied' | 'neutral';
    context: string;
    likelihood: 'low' | 'medium' | 'high';
  }> | string[]; // Allow simplified string array
  
  /** Cross-functional team impacts */
  crossFunctional?: Array<{
    team: string;
    impact: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  
  /** Data-dependent impacts */
  dataDependent?: string[];
  
  /** Performance impacts */
  performance?: string[];
  
  /** Security impacts */
  security?: string[];
  
  /** Accessibility impacts */
  accessibility?: string[];

  /** Impact score (0-100) for this category */
  score?: number;
}

/**
 * UX Testing Heuristic Result
 */
export interface QXHeuristicResult {
  /** Heuristic name */
  name: string;
  
  /** Heuristic type (enum value) */
  heuristicType?: string;
  
  /** Category */
  category: 'problem' | 'user-needs' | 'business-needs' | 'balance' | 'impact' | 'creativity' | 'design';
  
  /** Applied successfully? */
  applied: boolean;
  
  /** Score (0-100) */
  score: number;
  
  /** Findings */
  findings: string[];
  
  /** Issues detected */
  issues: Array<{
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
  
  /** Recommendations */
  recommendations: string[];
}

/**
 * QX Recommendation
 */
export interface QXRecommendation {
  /** Principle or area */
  principle: string;
  
  /** Recommendation text */
  recommendation: string;
  
  /** Severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  /** Impact percentage (0-100) */
  impact: number;
  
  /** Implementation effort */
  effort: 'low' | 'medium' | 'high';
  
  /** Priority */
  priority: number;
  
  /** Category */
  category: 'ux' | 'qa' | 'qx' | 'technical' | 'process' | 'design';
  
  /** Supporting evidence */
  evidence?: string[];
  
  /** Impact as percentage (for display) */
  impactPercentage?: number;
  
  /** Estimated effort description */
  estimatedEffort?: string;
}

/**
 * Integration with Testability Scoring
 */
export interface TestabilityIntegration {
  /** Testability score (if available) */
  testabilityScore?: number;
  
  /** Testability grade */
  testabilityGrade?: 'A' | 'B' | 'C' | 'D' | 'F';
  
  /** 10 Principles scores */
  principles?: {
    observability: number;
    controllability: number;
    simplicity: number;
    transparency: number;
    explainability: number;
    similarity: number;
    stability: number;
    unbugginess: number;
    smallness: number;
    decomposability: number;
  };
  
  /** How testability relates to QX */
  qxRelation: string[];
  
  /** Combined insights */
  combinedInsights: string[];
}

/**
 * Context collected during QX analysis
 */
export interface QXContext {
  /** URL or product identifier */
  url?: string;
  
  /** Page title */
  title?: string;
  
  /** Framework detected */
  framework?: string;
  
  /** DOM metrics */
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
  
  /** Semantic quality */
  semanticQuality?: {
    ariaLabels: number;
    semanticElements: number;
    dataAttributes: number;
  };
  
  /** Error/warning indicators */
  errorIndicators?: {
    consoleErrors?: number | string[];
    consoleWarnings?: number;
    examples?: string[];
    hasErrorMessages?: boolean;
  };
  
  /** Performance metrics */
  performance?: {
    loadTime?: number;
    domContentLoaded?: number;
    domReady?: number;
    firstContentfulPaint?: number;
    firstPaint?: number;
  };
  
  /** Accessibility insights */
  accessibility?: {
    violations?: number;
    warnings?: number;
    passed?: number;
    ariaLabelsCount?: number;
    altTextsCoverage?: number;
    focusableElementsCount?: number;
    landmarkRoles?: number;
  };

  /** Page metadata */
  metadata?: {
    description?: string;
    keywords?: string;
    viewport?: string;
  };
  
  /** Error details if collection failed */
  error?: string;
  
  /** Custom context */
  custom?: Record<string, any>;
}

// ============================================================================
// QX Heuristics Definitions
// ============================================================================

/**
 * Available QX Heuristics
 */
export enum QXHeuristic {
  // Problem Analysis
  PROBLEM_UNDERSTANDING = 'problem-understanding',
  RULE_OF_THREE = 'rule-of-three',
  PROBLEM_COMPLEXITY = 'problem-complexity',
  
  // User Needs
  USER_NEEDS_IDENTIFICATION = 'user-needs-identification',
  USER_NEEDS_SUITABILITY = 'user-needs-suitability',
  USER_NEEDS_VALIDATION = 'user-needs-validation',
  
  // Business Needs
  BUSINESS_NEEDS_IDENTIFICATION = 'business-needs-identification',
  USER_VS_BUSINESS_BALANCE = 'user-vs-business-balance',
  KPI_IMPACT_ANALYSIS = 'kpi-impact-analysis',
  
  // Finding Balance (Oracle Resolution)
  ORACLE_PROBLEM_DETECTION = 'oracle-problem-detection',
  WHAT_MUST_NOT_CHANGE = 'what-must-not-change',
  SUPPORTING_DATA_ANALYSIS = 'supporting-data-analysis',
  
  // Impact Analysis
  GUI_FLOW_IMPACT = 'gui-flow-impact',
  USER_FEELINGS_IMPACT = 'user-feelings-impact',
  CROSS_FUNCTIONAL_IMPACT = 'cross-functional-impact',
  DATA_DEPENDENT_IMPACT = 'data-dependent-impact',
  
  // Creativity
  COMPETITIVE_ANALYSIS = 'competitive-analysis',
  DOMAIN_INSPIRATION = 'domain-inspiration',
  INNOVATIVE_SOLUTIONS = 'innovative-solutions',
  
  // Design Quality
  EXACTNESS_AND_CLARITY = 'exactness-and-clarity',
  INTUITIVE_DESIGN = 'intuitive-design',
  COUNTER_INTUITIVE_DESIGN = 'counter-intuitive-design',
  CONSISTENCY_ANALYSIS = 'consistency-analysis'
}

/**
 * QX Heuristic Configuration
 */
export interface QXHeuristicConfig {
  /** Which heuristics to apply */
  enabledHeuristics: QXHeuristic[];
  
  /** Heuristic-specific configuration */
  heuristicOptions?: {
    [key in QXHeuristic]?: Record<string, any>;
  };
  
  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;
  
  /** Enable competitive analysis */
  enableCompetitiveAnalysis?: boolean;
  
  /** Competitor URLs for comparison */
  competitorUrls?: string[];
}

// ============================================================================
// QX Agent Configuration
// ============================================================================

/**
 * Configuration for QX Partner Agent
 */
export interface QXPartnerConfig {
  /** QX analysis mode */
  analysisMode: 'full' | 'quick' | 'targeted';
  
  /** Heuristics configuration */
  heuristics: QXHeuristicConfig;
  
  /** Enable testability integration */
  integrateTestability: boolean;
  
  /** Testability scoring skill path */
  testabilityScoringPath?: string;
  
  /** Enable oracle problem detection */
  detectOracleProblems: boolean;
  
  /** Minimum oracle problem severity to report */
  minOracleSeverity?: 'low' | 'medium' | 'high' | 'critical';
  
  /** Enable collaborative features */
  collaboration?: {
    /** Coordinate with UX agents */
    coordinateWithUX: boolean;
    
    /** Coordinate with QA agents */
    coordinateWithQA: boolean;
    
    /** Share insights with quality analyzer */
    shareWithQualityAnalyzer: boolean;
  };
  
  /** Output format */
  outputFormat?: 'json' | 'html' | 'markdown' | 'all';
  
  /** Custom thresholds */
  thresholds?: {
    minQXScore?: number;
    minProblemClarity?: number;
    minUserNeedsAlignment?: number;
    minBusinessAlignment?: number;
  };
}

/**
 * QX Task Types
 */
export enum QXTaskType {
  /** Perform full QX analysis */
  FULL_ANALYSIS = 'qx-full-analysis',
  
  /** Detect oracle problems only */
  ORACLE_DETECTION = 'qx-oracle-detection',
  
  /** Analyze user vs business needs balance */
  BALANCE_ANALYSIS = 'qx-balance-analysis',
  
  /** Perform impact analysis */
  IMPACT_ANALYSIS = 'qx-impact-analysis',
  
  /** Apply specific heuristic */
  APPLY_HEURISTIC = 'qx-apply-heuristic',
  
  /** Generate QX recommendations */
  GENERATE_RECOMMENDATIONS = 'qx-generate-recommendations',
  
  /** Integrate with testability scoring */
  INTEGRATE_TESTABILITY = 'qx-integrate-testability'
}

/**
 * QX Task Parameters
 */
export interface QXTaskParams {
  /** Task type */
  type: QXTaskType;
  
  /** Target URL or product */
  target: string;
  
  /** Task-specific parameters */
  params?: {
    /** Specific heuristic to apply (for APPLY_HEURISTIC) */
    heuristic?: QXHeuristic;
    
    /** Competitor URLs for comparison */
    competitors?: string[];
    
    /** Additional context */
    context?: Record<string, any>;
    
    /** Testability results (if pre-computed) */
    testabilityResults?: any;
  };
  
  /** Configuration overrides */
  config?: Partial<QXPartnerConfig>;
}
