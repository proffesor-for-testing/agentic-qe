/**
 * Requirements Validation Handler with REAL Analysis
 * Uses NLP patterns and heuristics to validate requirement testability
 */

import type {
  RequirementsValidateParams,
  RequirementsValidateResult,
  RequirementValidationResult,
  RequirementValidationIssue
} from '../../types/advanced';

// Testability keywords and patterns
const TESTABLE_VERBS = ['shall', 'must', 'will', 'should', 'can', 'authenticate', 'validate', 'return', 'display', 'save', 'delete', 'update'];
const MEASURABLE_TERMS = ['within', 'at least', 'no more than', 'maximum', 'minimum', 'exactly', 'between'];
const VAGUE_TERMS = ['fast', 'slow', 'good', 'bad', 'properly', 'correctly', 'appropriately', 'efficiently'];
const AMBIGUOUS_TERMS = ['some', 'few', 'many', 'several', 'various', 'adequate', 'reasonable'];

export async function requirementsValidate(
  params: RequirementsValidateParams
): Promise<RequirementsValidateResult> {
  const { requirements, strictMode = false, generateTestSuggestions = false } = params;

  if (requirements.length === 0) {
    return {
      totalRequirements: 0,
      testableCount: 0,
      validationResults: [],
      overallScore: 0,
      recommendations: ['No requirements provided for validation']
    };
  }

  const validationResults: RequirementValidationResult[] = [];
  let testableCount = 0;

  for (const requirement of requirements) {
    const result = validateRequirement(requirement, strictMode, generateTestSuggestions);
    validationResults.push(result);
    if (result.isTestable) {
      testableCount++;
    }
  }

  const overallScore = validationResults.reduce((sum, r) => sum + r.testabilityScore, 0) / requirements.length;
  const recommendations = generateRecommendations(validationResults, overallScore);

  return {
    totalRequirements: requirements.length,
    testableCount,
    validationResults,
    overallScore,
    recommendations
  };
}

function validateRequirement(
  requirement: string,
  strictMode: boolean,
  generateSuggestions: boolean
): RequirementValidationResult {
  const issues: RequirementValidationIssue[] = [];
  let testabilityScore = 1.0;

  // Check for testable verbs
  const hasTestableVerb = TESTABLE_VERBS.some(verb =>
    requirement.toLowerCase().includes(verb)
  );
  if (!hasTestableVerb) {
    issues.push({
      type: 'untestable',
      message: 'Requirement lacks clear action verb',
      severity: 'high',
      suggestion: 'Use verbs like "shall", "must", "will" to specify behavior'
    });
    testabilityScore -= 0.3;
  }

  // Check for vague terms (match whole words only)
  const vagueTerm = VAGUE_TERMS.find(term => {
    const regex = new RegExp(`\\b${term}\\b`, 'i');
    return regex.test(requirement);
  });
  if (vagueTerm) {
    issues.push({
      type: 'vague',
      message: `Contains vague term: "${vagueTerm}"`,
      severity: 'high',
      suggestion: `Replace "${vagueTerm}" with specific, measurable criteria`
    });
    testabilityScore -= 0.4;
  }

  // Check for ambiguous terms (match whole words only)
  const ambiguousTerm = AMBIGUOUS_TERMS.find(term => {
    const regex = new RegExp(`\\b${term}\\b`, 'i');
    return regex.test(requirement);
  });
  if (ambiguousTerm) {
    issues.push({
      type: 'ambiguity',
      message: `Contains ambiguous term: "${ambiguousTerm}"`,
      severity: 'medium',
      suggestion: `Specify exact quantities instead of "${ambiguousTerm}"`
    });
    testabilityScore -= 0.2;
  }

  // Check for measurability in performance requirements
  const hasMeasurableMetric = MEASURABLE_TERMS.some(term =>
    requirement.toLowerCase().includes(term)
  );
  const seemsLikePerformanceReq = requirement.toLowerCase().match(/time|speed|latency|throughput|concurrent/);
  if (seemsLikePerformanceReq && !hasMeasurableMetric) {
    issues.push({
      type: 'missing-criteria',
      message: 'Performance requirement lacks measurable criteria',
      severity: 'high',
      suggestion: 'Add specific metrics (e.g., "within 200ms", "at least 1000 requests/sec")'
    });
    testabilityScore -= 0.3;
  }

  // Check for acceptance criteria markers
  const hasAcceptanceCriteria = requirement.includes('Given') || requirement.includes('When') || requirement.includes('Then');
  if (strictMode && !hasAcceptanceCriteria) {
    issues.push({
      type: 'missing-criteria',
      message: 'Missing explicit acceptance criteria',
      severity: 'medium',
      suggestion: 'Add Given-When-Then scenarios or specify exact expected outcomes'
    });
    testabilityScore -= 0.1;
  }

  // Ensure score doesn't go negative
  testabilityScore = Math.max(0, testabilityScore);

  const isTestable = testabilityScore >= 0.6;

  let testSuggestions: string[] | undefined;
  if (generateSuggestions && isTestable) {
    testSuggestions = generateTestSuggestions(requirement);
  }

  return {
    requirement,
    isTestable,
    testabilityScore,
    issues,
    testSuggestions
  };
}

function generateTestSuggestions(requirement: string): string[] {
  const suggestions: string[] = [];
  const lower = requirement.toLowerCase();

  if (lower.includes('login') || lower.includes('authenticate')) {
    suggestions.push('Test valid credentials');
    suggestions.push('Test invalid credentials');
    suggestions.push('Test locked account scenario');
  }

  if (lower.includes('api') || lower.includes('endpoint')) {
    suggestions.push('Test successful response');
    suggestions.push('Test error handling (4xx, 5xx)');
    suggestions.push('Test input validation');
  }

  if (lower.includes('within') || lower.includes('performance')) {
    suggestions.push('Load test with expected volume');
    suggestions.push('Measure response time distribution');
    suggestions.push('Test under degraded conditions');
  }

  if (lower.includes('validate') || lower.includes('check')) {
    suggestions.push('Test valid input');
    suggestions.push('Test invalid input');
    suggestions.push('Test boundary conditions');
  }

  if (suggestions.length === 0) {
    suggestions.push('Create positive test case');
    suggestions.push('Create negative test case');
    suggestions.push('Test edge cases');
  }

  return suggestions;
}

function generateRecommendations(
  validationResults: RequirementValidationResult[],
  overallScore: number
): string[] {
  const recommendations: string[] = [];

  const highIssuesCount = validationResults.reduce(
    (count, r) => count + r.issues.filter(i => i.severity === 'high').length,
    0
  );

  if (overallScore < 0.5) {
    recommendations.push('Critical: Most requirements are not testable. Consider a requirements workshop to refine them.');
  } else if (overallScore < 0.7) {
    recommendations.push('Moderate: Several requirements need clarification to improve testability.');
  } else if (overallScore >= 0.9) {
    recommendations.push('Excellent: Requirements are well-defined and testable.');
  }

  if (highIssuesCount > 0) {
    recommendations.push(`${highIssuesCount} high-severity issues detected. Address vague and ambiguous terms first.`);
  }

  const untestableCount = validationResults.filter(r => !r.isTestable).length;
  if (untestableCount > 0) {
    recommendations.push(`${untestableCount} requirements are untestable. Add specific, measurable criteria.`);
  }

  recommendations.push('Consider using BDD format (Given-When-Then) for clearer acceptance criteria.');

  return recommendations;
}
