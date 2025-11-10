/**
 * Requirements Validation Tool - INVEST Criteria Analysis
 *
 * Validates requirements against INVEST criteria (Independent, Negotiable, Valuable,
 * Estimable, Small, Testable) and SMART framework (Specific, Measurable, Achievable,
 * Relevant, Time-bound) with detailed scoring and recommendations.
 *
 * Features:
 * - Multi-criteria validation with weighted scoring
 * - Ambiguous language detection using NLP patterns
 * - Testability analysis with clarity assessment
 * - Acceptance criteria validation with SMART framework
 * - Risk indicators and improvement recommendations
 * - Detailed validation report generation
 *
 * @module tools/qe/requirements/validate-requirements
 * @version 1.0.0
 * @author Agentic QE Team - Phase 3
 * @date 2025-11-09
 */

import type { QEToolResponse, Priority } from '../shared/types.js';

// ==================== Types ====================

/**
 * Requirement validation input
 */
export interface RequirementInput {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria?: string[];
  priority?: Priority;
  type?: 'functional' | 'non-functional' | 'technical' | 'business';
  dependencies?: string[];
}

/**
 * Individual INVEST criteria evaluation
 */
export interface InvestCriterionEvaluation {
  criterion: 'independent' | 'negotiable' | 'valuable' | 'estimable' | 'small' | 'testable';
  description: string;
  score: number;
  passed: boolean;
  issues: string[];
  recommendations: string[];
}

/**
 * Overall requirement validation result
 */
export interface RequirementValidationResult {
  requirementId: string;
  overallScore: number;
  passed: boolean;
  investCriteria: InvestCriterionEvaluation[];
  smartAnalysis: SmartAnalysis;
  acceptanceCriteria: AcceptanceCriteriaAnalysis;
  languageClarity: LanguageClarity;
  testabilityScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  keyIssues: string[];
  recommendations: string[];
  metadata: ValidationMetadata;
}

/**
 * SMART framework analysis
 */
export interface SmartAnalysis {
  specific: SpecificEvaluation;
  measurable: MeasurableEvaluation;
  achievable: AchievableEvaluation;
  relevant: RelevantEvaluation;
  timeBound: TimeBoundEvaluation;
  overallScore: number;
}

/**
 * Specific evaluation
 */
export interface SpecificEvaluation {
  score: number;
  passed: boolean;
  issues: string[];
  details: string;
  recommendations?: string[];
}

/**
 * Measurable evaluation
 */
export interface MeasurableEvaluation {
  score: number;
  passed: boolean;
  issues: string[];
  metrics: string[];
  details: string;
  recommendations?: string[];
}

/**
 * Achievable evaluation
 */
export interface AchievableEvaluation {
  score: number;
  passed: boolean;
  issues: string[];
  technicalFeasibility: string;
  resourceEstimate: string;
  recommendations?: string[];
}

/**
 * Relevant evaluation
 */
export interface RelevantEvaluation {
  score: number;
  passed: boolean;
  issues: string[];
  businessValue: string;
  stakeholderAlignment: string;
  recommendations?: string[];
}

/**
 * Time-bound evaluation
 */
export interface TimeBoundEvaluation {
  score: number;
  passed: boolean;
  issues: string[];
  performanceTarget: string;
  deadline: string;
  recommendations?: string[];
}

/**
 * Acceptance criteria analysis
 */
export interface AcceptanceCriteriaAnalysis {
  present: boolean;
  count: number;
  validCount: number;
  issues: string[];
  enhancedCriteria: string[];
  score: number;
}

/**
 * Language clarity assessment
 */
export interface LanguageClarity {
  vagueness: number;
  ambiguity: number;
  clarity: number;
  vagueTerms: string[];
  ambiguousTerms: string[];
  suggestions: string[];
}

/**
 * Validation metadata
 */
export interface ValidationMetadata {
  validatedAt: string;
  duration: number;
  version: string;
  validationRules: string[];
}

/**
 * Validation parameters
 */
export interface ValidateRequirementsParams {
  requirements: RequirementInput[];
  includeRecommendations?: boolean;
  strictMode?: boolean;
}

/**
 * Batch validation result
 */
export interface BatchValidationResult {
  requirementsValidated: number;
  passCount: number;
  failCount: number;
  criticalIssuesCount: number;
  averageScore: number;
  results: RequirementValidationResult[];
  summary: ValidationSummary;
}

/**
 * Validation summary
 */
export interface ValidationSummary {
  passRate: number;
  avgInvestScore: number;
  avgSmartScore: number;
  avgTestabilityScore: number;
  commonIssues: string[];
  topRecommendations: string[];
}

// ==================== Language Pattern Detection ====================

const VAGUE_TERMS = /\b(fast|slow|good|bad|nice|easy|hard|better|worse|large|small)\b/gi;
const AMBIGUOUS_MODALS = /\b(should|could|might|may|probably|possibly|perhaps)\b/gi;
const SUBJECTIVE_TERMS = /\b(user-friendly|intuitive|simple|complex|efficient|robust)\b/gi;
const PASSIVE_VOICE = /\b(is|are|was|were|be|been|being)\s+\w+ed\b/gi;
const PASSIVE_CONSTRUCTION = /\b(to be|to have been)\b/gi;

// ==================== Main Validation Function ====================

/**
 * Validate requirements against INVEST criteria and SMART framework
 *
 * @param params - Validation parameters
 * @returns Batch validation result for all requirements
 */
export async function validateRequirements(
  params: ValidateRequirementsParams
): Promise<QEToolResponse<BatchValidationResult>> {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    if (!params.requirements || params.requirements.length === 0) {
      throw new Error('At least one requirement must be provided');
    }

    const results: RequirementValidationResult[] = [];

    // Validate each requirement in parallel
    const validationPromises = params.requirements.map((req) =>
      validateSingleRequirement(req, params.strictMode ?? false)
    );

    const validatedResults = await Promise.all(validationPromises);
    results.push(...validatedResults);

    // Calculate summary statistics
    const passCount = results.filter((r) => r.passed).length;
    const failCount = results.length - passCount;
    const criticalCount = results.filter((r) => r.riskLevel === 'critical').length;

    const avgScore = results.reduce((sum, r) => sum + r.overallScore, 0) / results.length;
    const avgInvest = results.reduce(
      (sum, r) =>
        sum +
        (r.investCriteria.reduce((s, c) => s + c.score, 0) / r.investCriteria.length),
      0
    ) / results.length;
    const avgSmart = results.reduce((sum, r) => sum + r.smartAnalysis.overallScore, 0) / results.length;
    const avgTestability = results.reduce((sum, r) => sum + r.testabilityScore, 0) / results.length;

    // Compile common issues
    const issueCounts = new Map<string, number>();
    for (const result of results) {
      for (const issue of result.keyIssues) {
        issueCounts.set(issue, (issueCounts.get(issue) ?? 0) + 1);
      }
    }

    const commonIssues = Array.from(issueCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map((entry) => entry[0]);

    // Compile top recommendations
    const recCounts = new Map<string, number>();
    for (const result of results) {
      for (const rec of result.recommendations) {
        recCounts.set(rec, (recCounts.get(rec) ?? 0) + 1);
      }
    }

    const topRecommendations = Array.from(recCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map((entry) => entry[0]);

    const batchResult: BatchValidationResult = {
      requirementsValidated: params.requirements.length,
      passCount,
      failCount,
      criticalIssuesCount: criticalCount,
      averageScore: Math.round(avgScore * 100) / 100,
      results,
      summary: {
        passRate: Math.round((passCount / results.length) * 100),
        avgInvestScore: Math.round(avgInvest * 100) / 100,
        avgSmartScore: Math.round(avgSmart * 100) / 100,
        avgTestabilityScore: Math.round(avgTestability * 100) / 100,
        commonIssues,
        topRecommendations
      }
    };

    return createSuccessResponse(batchResult, requestId, Date.now() - startTime);
  } catch (error) {
    return createErrorResponse(error as Error, requestId, Date.now() - startTime);
  }
}

// ==================== Single Requirement Validation ====================

/**
 * Validate a single requirement
 */
async function validateSingleRequirement(
  requirement: RequirementInput,
  strictMode: boolean
): Promise<RequirementValidationResult> {
  // Evaluate all criteria in parallel
  const [
    investCriteria,
    smartAnalysis,
    acceptanceCriteria,
    languageClarity,
    testabilityScore
  ] = await Promise.all([
    evaluateInvestCriteria(requirement),
    analyzeSmart(requirement),
    analyzeAcceptanceCriteria(requirement),
    assessLanguageClarity(requirement),
    calculateTestability(requirement)
  ]);

  // Compile key issues
  const keyIssuesSet: Set<string> = new Set();

  investCriteria.forEach((ic) => {
    if (!ic.passed) {
      ic.issues.forEach((issue) => keyIssuesSet.add(issue));
    }
  });

  if (!smartAnalysis.specific.passed) {
    smartAnalysis.specific.issues.forEach((issue) => keyIssuesSet.add(issue));
  }

  if (!acceptanceCriteria.present) {
    keyIssuesSet.add('Missing acceptance criteria - requirement cannot be verified');
  }

  if (languageClarity.ambiguity > 0.5) {
    keyIssuesSet.add('Significant ambiguity detected in requirement text');
  }

  // Calculate risk level
  const investFailCount = investCriteria.filter((ic) => !ic.passed).length;
  const smartFailCount = Object.values(smartAnalysis)
    .filter((s) => typeof s === 'object' && 'passed' in s && !s.passed)
    .length;

  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (investFailCount >= 3 || smartFailCount >= 3 || testabilityScore < 4) {
    riskLevel = 'critical';
  } else if (investFailCount >= 2 || smartFailCount >= 2 || testabilityScore < 5.5) {
    riskLevel = 'high';
  } else if (investFailCount >= 1 || smartFailCount >= 1 || testabilityScore < 6.5) {
    riskLevel = 'medium';
  }

  // Compile recommendations
  const recommendationsSet = new Set<string>();

  investCriteria.forEach((ic) => {
    ic.recommendations.forEach((rec) => recommendationsSet.add(rec));
  });

  smartAnalysis.specific.recommendations?.forEach((rec) => recommendationsSet.add(rec));
  smartAnalysis.measurable.recommendations?.forEach((rec) => recommendationsSet.add(rec));
  smartAnalysis.achievable.recommendations?.forEach((rec) => recommendationsSet.add(rec));
  smartAnalysis.relevant.recommendations?.forEach((rec) => recommendationsSet.add(rec));
  smartAnalysis.timeBound.recommendations?.forEach((rec) => recommendationsSet.add(rec));

  if (!acceptanceCriteria.present) {
    recommendationsSet.add('Define acceptance criteria using Given-When-Then format');
    recommendationsSet.add('Ensure each criterion is independently verifiable');
  }

  if (languageClarity.clarity < 0.6) {
    languageClarity.suggestions.forEach((s) => recommendationsSet.add(s));
  }

  // Calculate overall score
  const investScore = investCriteria.reduce((sum, ic) => sum + ic.score, 0) / investCriteria.length;
  const overallScore = Math.round((investScore + smartAnalysis.overallScore + testabilityScore) / 3 * 100) / 100;
  const passed = investFailCount <= 1 && smartFailCount <= 1 && testabilityScore >= 6.0 && !strictMode;

  return {
    requirementId: requirement.id,
    overallScore,
    passed: passed && !strictMode ? true : !strictMode ? false : riskLevel === 'low',
    investCriteria,
    smartAnalysis,
    acceptanceCriteria,
    languageClarity,
    testabilityScore,
    riskLevel,
    keyIssues: Array.from(keyIssuesSet),
    recommendations: Array.from(recommendationsSet),
    metadata: {
      validatedAt: new Date().toISOString(),
      duration: 0,
      version: '1.0.0',
      validationRules: ['INVEST', 'SMART', 'Acceptance-Criteria', 'Language-Clarity', 'Testability']
    }
  };
}

// ==================== INVEST Criteria Evaluation ====================

/**
 * Evaluate all INVEST criteria
 */
async function evaluateInvestCriteria(requirement: RequirementInput): Promise<InvestCriterionEvaluation[]> {
  return [
    evaluateIndependent(requirement),
    evaluateNegotiable(requirement),
    evaluateValuable(requirement),
    evaluateEstimable(requirement),
    evaluateSmall(requirement),
    evaluateTestable(requirement)
  ];
}

/**
 * Evaluate Independent criterion
 */
function evaluateIndependent(requirement: RequirementInput): InvestCriterionEvaluation {
  const issues: string[] = [];
  const recommendations: string[] = [];

  let score = 2.0;

  // Check for dependency indicators
  const dependencyCount = requirement.dependencies?.length ?? 0;
  if (dependencyCount > 3) {
    score -= 0.5;
    issues.push(`High dependency count (${dependencyCount}) - consider breaking into smaller requirements`);
    recommendations.push('Identify and decouple interdependencies');
    recommendations.push('Define clear separation of concerns for each requirement');
  }

  // Check if requirement can be developed independently
  const text = `${requirement.title} ${requirement.description}`.toLowerCase();
  if (/(depends on|requires|after|before|prerequisite|only if)/i.test(text)) {
    if (dependencyCount <= 1) {
      score -= 0.3;
      issues.push('Requirement text indicates dependencies not listed in dependencies field');
      recommendations.push('Document all explicit dependencies');
    }
  }

  return {
    criterion: 'independent',
    description: 'Requirement can be developed independently without blocking other work',
    score: Math.max(0, score),
    passed: score >= 1.5,
    issues,
    recommendations
  };
}

/**
 * Evaluate Negotiable criterion
 */
function evaluateNegotiable(requirement: RequirementInput): InvestCriterionEvaluation {
  const issues: string[] = [];
  const recommendations: string[] = [];

  let score = 2.0;

  // Check for flexibility - should not be too prescriptive
  const text = `${requirement.title} ${requirement.description}`.toLowerCase();
  const prescriptiveTerms = /(must use|must implement|must follow|only via|only through)/gi;
  const prescriptiveMatches = text.match(prescriptiveTerms) ?? [];

  if (prescriptiveMatches.length > 2) {
    score -= 0.5;
    issues.push('Requirement is over-prescriptive, limiting negotiation space');
    recommendations.push('Focus on "what" needs to be achieved, not "how" to achieve it');
    recommendations.push('Allow team flexibility in implementation approach');
  }

  // Check for measurable acceptance without dictating approach
  if (!requirement.acceptanceCriteria || requirement.acceptanceCriteria.length === 0) {
    score -= 0.3;
    issues.push('Without acceptance criteria, requirement details cannot be negotiated');
    recommendations.push('Define clear acceptance criteria to enable discussion');
  }

  return {
    criterion: 'negotiable',
    description: 'Details are negotiable; what is fixed is the acceptance criteria',
    score: Math.max(0, score),
    passed: score >= 1.5,
    issues,
    recommendations
  };
}

/**
 * Evaluate Valuable criterion
 */
function evaluateValuable(requirement: RequirementInput): InvestCriterionEvaluation {
  const issues: string[] = [];
  const recommendations: string[] = [];

  let score = 2.0;

  // Check for business value articulation
  const text = `${requirement.title} ${requirement.description}`.toLowerCase();
  const valueKeywords = /(benefit|value|improve|increase|reduce|enable|allow|support|help)/gi;
  const valueMatches = text.match(valueKeywords) ?? [];

  if (valueMatches.length === 0) {
    score -= 0.7;
    issues.push('Business value or user benefit not articulated');
    recommendations.push('Explain how this requirement benefits the user or business');
    recommendations.push('Use "As a [user], I want [feature] so that [benefit]" format');
  }

  // Check if value is clear to stakeholders
  const stakeholderKeywords = /(user|customer|stakeholder|client|team|organization)/gi;
  const stakeholderMatches = text.match(stakeholderKeywords) ?? [];

  if (stakeholderMatches.length === 0) {
    score -= 0.3;
    issues.push('Stakeholders for this requirement not clearly identified');
    recommendations.push('Explicitly identify who benefits from this requirement');
  }

  return {
    criterion: 'valuable',
    description: 'Requirement has clear business or user value',
    score: Math.max(0, score),
    passed: score >= 1.5,
    issues,
    recommendations
  };
}

/**
 * Evaluate Estimable criterion
 */
function evaluateEstimable(requirement: RequirementInput): InvestCriterionEvaluation {
  const issues: string[] = [];
  const recommendations: string[] = [];

  let score = 2.0;

  const text = `${requirement.title} ${requirement.description}`.toLowerCase();

  // Check if requirement is specific enough to estimate
  const vagueTerms = /(vague|unclear|ambiguous|undefined|tbd|to be determined)/gi;
  if (vagueTerms.test(text)) {
    score -= 0.5;
    issues.push('Requirement contains indicators of vagueness preventing estimation');
    recommendations.push('Clarify ambiguous terms and provide specific examples');
  }

  // Check for scope indicators
  const scopeKeywords = /(scope|boundary|boundary|constraint|limit)/gi;
  if (!scopeKeywords.test(text)) {
    score -= 0.3;
    issues.push('Requirement scope or boundaries not clearly defined');
    recommendations.push('Define what is included and excluded from the requirement');
  }

  // Check for complexity indicators
  const complexKeywords = /(complex|complicated|difficult|challenging)/gi;
  if (complexKeywords.test(text) && !requirement.acceptanceCriteria) {
    score -= 0.4;
    issues.push('Complex requirement without acceptance criteria for estimation');
    recommendations.push('Break down complex requirements into smaller, estimable pieces');
  }

  return {
    criterion: 'estimable',
    description: 'Developer can estimate the size and effort required',
    score: Math.max(0, score),
    passed: score >= 1.5,
    issues,
    recommendations
  };
}

/**
 * Evaluate Small criterion
 */
function evaluateSmall(requirement: RequirementInput): InvestCriterionEvaluation {
  const issues: string[] = [];
  const recommendations: string[] = [];

  let score = 2.0;

  const text = `${requirement.title} ${requirement.description}`.toLowerCase();

  // Check description length - very long descriptions indicate scope creep
  if (requirement.description.length > 500) {
    score -= 0.4;
    issues.push('Requirement description is very long, indicating possible scope creep');
    recommendations.push('Break requirement into smaller, focused stories');
  }

  // Check for "and" operators - typically indicates multiple requirements
  const andCount = (requirement.description.match(/\band\b/gi) ?? []).length;
  if (andCount > 3) {
    score -= 0.5;
    issues.push(`Multiple concerns detected (${andCount} "and" operators) - possible scope combining`);
    recommendations.push('Split into separate requirements with single concerns');
  }

  // Check acceptance criteria count - too many indicates requirement is too large
  if (requirement.acceptanceCriteria && requirement.acceptanceCriteria.length > 8) {
    score -= 0.4;
    issues.push(`Excessive acceptance criteria (${requirement.acceptanceCriteria.length}) - requirement too large`);
    recommendations.push('Consolidate related criteria or split into smaller requirements');
  }

  // Check for "all users" or universal scope
  if (/(all users|everyone|global|entire system)/i.test(text)) {
    score -= 0.3;
    issues.push('Requirement targets all users/systems, potentially too large');
    recommendations.push('Consider phased rollout or user segment targeting');
  }

  return {
    criterion: 'small',
    description: 'Requirement is small enough to complete in one iteration',
    score: Math.max(0, score),
    passed: score >= 1.5,
    issues,
    recommendations
  };
}

/**
 * Evaluate Testable criterion
 */
function evaluateTestable(requirement: RequirementInput): InvestCriterionEvaluation {
  const issues: string[] = [];
  const recommendations: string[] = [];

  let score = 2.0;

  const text = `${requirement.title} ${requirement.description}`.toLowerCase();

  // Check if requirement has acceptance criteria (testability indicator)
  if (!requirement.acceptanceCriteria || requirement.acceptanceCriteria.length === 0) {
    score -= 1.0;
    issues.push('No acceptance criteria defined - requirement cannot be verified');
    recommendations.push('Define explicit acceptance criteria for verification');
  } else {
    // Check if acceptance criteria are measurable
    let measurableCount = 0;
    for (const criterion of requirement.acceptanceCriteria) {
      if (/\d+|success|fail|error|valid|invalid|complete|incorrect/i.test(criterion)) {
        measurableCount++;
      }
    }

    const measurablePercentage = measurableCount / requirement.acceptanceCriteria.length;
    if (measurablePercentage < 0.5) {
      score -= 0.4;
      issues.push('Acceptance criteria lack measurable success conditions');
      recommendations.push('Add specific, measurable success/failure conditions to criteria');
    }
  }

  // Check for vague/subjective language
  const vagueMatches = text.match(VAGUE_TERMS) ?? [];
  if (vagueMatches.length > 0) {
    score -= 0.3;
    const uniqueVague = Array.from(new Set(vagueMatches)).join(', ');
    issues.push(`Vague terms found: ${uniqueVague}`);
    recommendations.push('Replace vague terms with specific, measurable criteria');
  }

  return {
    criterion: 'testable',
    description: 'Requirement has clear acceptance criteria for verification',
    score: Math.max(0, score),
    passed: score >= 1.5,
    issues,
    recommendations
  };
}

// ==================== SMART Analysis ====================

/**
 * Analyze requirement using SMART framework
 */
async function analyzeSmart(requirement: RequirementInput): Promise<SmartAnalysis> {
  const text = `${requirement.title} ${requirement.description}`.toLowerCase();

  // Specific
  const specificIssues: string[] = [];
  const specificRecs: string[] = [];
  let specificScore = 2.0;

  if (text.length < 50) {
    specificScore -= 0.5;
    specificIssues.push('Description too brief for clear understanding');
    specificRecs.push('Expand with concrete details and examples');
  }

  const vagueMatches = text.match(VAGUE_TERMS);
  if (vagueMatches) {
    specificScore -= 0.3;
    const uniqueVague = Array.from(new Set(vagueMatches)).join(', ');
    specificIssues.push(`Vague terms: ${uniqueVague}`);
    specificRecs.push('Use precise, specific language');
  }

  specificScore = Math.max(0, specificScore);

  // Measurable
  const measurableIssues: string[] = [];
  const measurableRecs: string[] = [];
  const metrics: string[] = [];
  let measurableScore = 2.0;

  const numberMatches = text.match(/\d+/g) ?? [];
  const metricMatches = text.match(/(ms|seconds?|minutes?|hours?|%|percent|users?|requests?|MB|GB|KB|throughput|latency|response time)/gi) ?? [];

  if (numberMatches.length > 0) {
    metrics.push(...numberMatches);
  }

  if (metricMatches.length > 0) {
    metrics.push(...Array.from(new Set(metricMatches)));
  }

  if (metrics.length === 0 && (!requirement.acceptanceCriteria || requirement.acceptanceCriteria.length === 0)) {
    measurableScore -= 0.8;
    measurableIssues.push('No quantifiable metrics or acceptance criteria');
    measurableRecs.push('Add specific, measurable metrics (response time, success rate, etc.)');
  }

  measurableScore = Math.max(0, measurableScore);

  // Achievable
  const achievableIssues: string[] = [];
  const achievableRecs: string[] = [];
  let achievableScore = 2.0;
  let technicalFeasibility = 'Not evaluated';
  let resourceEstimate = 'Not specified';

  const complexIndicators = text.match(/(complex|difficult|challenging|requires significant|unprecedented)/gi);
  if (complexIndicators && !requirement.acceptanceCriteria) {
    achievableScore -= 0.3;
    achievableIssues.push('Complex requirement without clear technical approach');
    achievableRecs.push('Define technical approach or conduct POC');
    technicalFeasibility = 'Unclear - requires feasibility study';
  } else if (complexIndicators) {
    technicalFeasibility = 'Complex but with clear acceptance criteria';
  } else {
    technicalFeasibility = 'Appears technically achievable';
  }

  achievableScore = Math.max(0, achievableScore);

  // Relevant
  const relevantIssues: string[] = [];
  const relevantRecs: string[] = [];
  let relevantScore = 2.0;
  let businessValue = 'Not articulated';
  let stakeholderAlignment = 'Not specified';

  const valueMatches = text.match(/(benefit|value|improve|increase|reduce|enable|allow)/gi);
  if (valueMatches) {
    const uniqueValue = Array.from(new Set(valueMatches)).join(', ');
    businessValue = `Clear value: ${uniqueValue}`;
  } else {
    relevantScore -= 0.7;
    relevantIssues.push('Business value not articulated');
    relevantRecs.push('Explain business benefit and user value');
    businessValue = 'Not clear';
  }

  if (requirement.type) {
    stakeholderAlignment = `Typed as ${requirement.type}`;
  } else {
    relevantScore -= 0.2;
    relevantIssues.push('Requirement type not specified');
    stakeholderAlignment = 'Unknown';
  }

  relevantScore = Math.max(0, relevantScore);

  // Time-bound
  const timeBoundIssues: string[] = [];
  const timeBoundRecs: string[] = [];
  let timeBoundScore = 2.0;
  let performanceTarget = 'Not specified';
  let deadline = 'Not specified';

  const timeMatches = text.match(/(sprint|release|v\d+|deadline|within|by|phase|iteration)/gi);
  const perfMatches = text.match(/(response time|latency|timeout|duration|performance|throughput)/gi);

  if (perfMatches) {
    const uniquePerf = Array.from(new Set(perfMatches)).join(', ');
    performanceTarget = `Performance expectations present: ${uniquePerf}`;
  } else {
    timeBoundScore -= 0.3;
    timeBoundIssues.push('No performance or timing expectations');
    timeBoundRecs.push('Define response time, timeout, or throughput requirements');
  }

  if (timeMatches) {
    const uniqueTime = Array.from(new Set(timeMatches)).join(', ');
    deadline = `Timeline indicators: ${uniqueTime}`;
  }

  timeBoundScore = Math.max(0, timeBoundScore);

  const overallScore = Math.round(((specificScore + measurableScore + achievableScore + relevantScore + timeBoundScore) / 5) * 10) / 10;

  return {
    specific: {
      score: Math.round(specificScore * 10) / 10,
      passed: specificScore >= 1.5,
      issues: specificIssues,
      details: specificScore >= 1.5 ? 'Requirement is clearly defined' : 'Requirement needs clarification'
    },
    measurable: {
      score: Math.round(measurableScore * 10) / 10,
      passed: measurableScore >= 1.5,
      issues: measurableIssues,
      metrics,
      details: metrics.length > 0 ? `${metrics.length} metrics identified` : 'No measurable metrics found'
    },
    achievable: {
      score: Math.round(achievableScore * 10) / 10,
      passed: achievableScore >= 1.5,
      issues: achievableIssues,
      technicalFeasibility,
      resourceEstimate
    },
    relevant: {
      score: Math.round(relevantScore * 10) / 10,
      passed: relevantScore >= 1.5,
      issues: relevantIssues,
      businessValue,
      stakeholderAlignment
    },
    timeBound: {
      score: Math.round(timeBoundScore * 10) / 10,
      passed: timeBoundScore >= 1.5,
      issues: timeBoundIssues,
      performanceTarget,
      deadline
    },
    overallScore
  };
}

// ==================== Acceptance Criteria Analysis ====================

/**
 * Analyze acceptance criteria
 */
async function analyzeAcceptanceCriteria(
  requirement: RequirementInput
): Promise<AcceptanceCriteriaAnalysis> {
  if (!requirement.acceptanceCriteria || requirement.acceptanceCriteria.length === 0) {
    return {
      present: false,
      count: 0,
      validCount: 0,
      issues: ['No acceptance criteria defined'],
      enhancedCriteria: [],
      score: 0
    };
  }

  const issues: string[] = [];
  let validCount = 0;
  const enhancedCriteria: string[] = [];

  for (const criterion of requirement.acceptanceCriteria) {
    const isValid = criterion.length > 10 && /(\d+|success|fail|complete|error)/i.test(criterion);

    if (isValid) {
      validCount++;
      enhancedCriteria.push(criterion);
    } else {
      if (criterion.length <= 10) {
        issues.push(`Criterion too brief: "${criterion}"`);
        enhancedCriteria.push(`${criterion} (enhance with specific condition)`);
      }
      if (!/(\d+|success|fail|complete|error)/i.test(criterion)) {
        issues.push(`Criterion lacks measurable condition: "${criterion}"`);
        enhancedCriteria.push(`${criterion} (add specific success condition)`);
      }
    }
  }

  const score = Math.round((validCount / requirement.acceptanceCriteria.length) * 10);

  return {
    present: true,
    count: requirement.acceptanceCriteria.length,
    validCount,
    issues,
    enhancedCriteria,
    score
  };
}

// ==================== Language Clarity Assessment ====================

/**
 * Assess language clarity and ambiguity
 */
async function assessLanguageClarity(requirement: RequirementInput): Promise<LanguageClarity> {
  const text = `${requirement.title} ${requirement.description}`;

  const vagueMatches = text.match(VAGUE_TERMS) ?? [];
  const ambiguousMatches = text.match(AMBIGUOUS_MODALS) ?? [];
  const subjectiveMatches = text.match(SUBJECTIVE_TERMS) ?? [];
  const passiveMatches = text.match(PASSIVE_VOICE) ?? [];

  const totalClarity = text.length > 0
    ? 1 - ((vagueMatches.length + ambiguousMatches.length + subjectiveMatches.length + passiveMatches.length) / (text.length / 10))
    : 0;

  const clarity = Math.max(0, Math.min(1, totalClarity));
  const vagueness = (vagueMatches.length / Math.max(1, text.length / 20));
  const ambiguity = (ambiguousMatches.length / Math.max(1, text.length / 20));

  const suggestions: string[] = [];

  if (vagueMatches.length > 0) {
    const uniqueVague = Array.from(new Set(vagueMatches)).join(', ');
    suggestions.push(`Replace vague terms (${uniqueVague}) with specific metrics`);
  }

  if (ambiguousMatches.length > 0) {
    const uniqueAmbiguous = Array.from(new Set(ambiguousMatches)).join(', ');
    suggestions.push(`Use definitive language instead of ${uniqueAmbiguous}`);
  }

  if (subjectiveMatches.length > 0) {
    const uniqueSubjective = Array.from(new Set(subjectiveMatches)).join(', ');
    suggestions.push(`Replace subjective terms (${uniqueSubjective}) with objective criteria`);
  }

  if (passiveMatches.length > 0) {
    suggestions.push('Use active voice instead of passive voice for clarity');
  }

  return {
    vagueness: Math.round(Math.min(1, vagueness) * 100) / 100,
    ambiguity: Math.round(Math.min(1, ambiguity) * 100) / 100,
    clarity: Math.round(clarity * 100) / 100,
    vagueTerms: Array.from(new Set(vagueMatches)),
    ambiguousTerms: Array.from(new Set(ambiguousMatches)),
    suggestions
  };
}

// ==================== Testability Score ====================

/**
 * Calculate overall testability score (0-10)
 */
async function calculateTestability(requirement: RequirementInput): Promise<number> {
  let score = 5.0;

  // Acceptance criteria boost
  if (requirement.acceptanceCriteria && requirement.acceptanceCriteria.length >= 3) {
    score += 2.0;
  } else if (requirement.acceptanceCriteria && requirement.acceptanceCriteria.length > 0) {
    score += 1.0;
  } else {
    score -= 2.0;
  }

  // Description quality
  if (requirement.description.length > 100) {
    score += 0.5;
  }

  // Clarity
  const text = `${requirement.title} ${requirement.description}`.toLowerCase();
  const vagueCount = (text.match(VAGUE_TERMS) ?? []).length;
  const ambigCount = (text.match(AMBIGUOUS_MODALS) ?? []).length;

  if (vagueCount > 2) {
    score -= 1.0;
  }

  if (ambigCount > 2) {
    score -= 1.0;
  }

  // Type specification
  if (requirement.type) {
    score += 0.5;
  }

  return Math.round(Math.max(0, Math.min(10, score)) * 100) / 100;
}

// ==================== Utility Functions ====================

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req-val-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create success response
 */
function createSuccessResponse<T>(
  data: T,
  requestId: string,
  executionTime: number
): QEToolResponse<T> {
  return {
    success: true,
    data,
    metadata: {
      requestId,
      timestamp: new Date().toISOString(),
      executionTime,
      agent: 'requirements-validator',
      version: '1.0.0'
    }
  };
}

/**
 * Create error response
 */
function createErrorResponse(
  error: Error,
  requestId: string,
  executionTime: number
): QEToolResponse<never> {
  return {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    },
    metadata: {
      requestId,
      timestamp: new Date().toISOString(),
      executionTime,
      agent: 'requirements-validator',
      version: '1.0.0'
    }
  };
}
