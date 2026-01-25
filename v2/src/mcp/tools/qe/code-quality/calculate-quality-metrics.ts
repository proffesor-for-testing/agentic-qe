/**
 * Code Quality Metrics Calculator
 * Maintainability, reliability, and security score calculation
 *
 * @module code-quality/calculate-quality-metrics
 * @version 1.0.0
 */

import { SecureRandom } from '../../../../utils/SecureRandom.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface QualityMetricsParams {
  /** Source code to analyze */
  sourceCode: string;
  /** File path for context */
  filePath: string;
  /** Programming language */
  language: 'typescript' | 'javascript' | 'python' | 'java';
  /** Code coverage percentage (0-100) */
  coveragePercentage?: number;
  /** Number of code smells detected */
  codeSmells?: number;
  /** Duplication percentage (0-100) */
  duplicationPercentage?: number;
  /** Include security analysis */
  includeSecurityAnalysis?: boolean;
  /** Include technical debt calculation */
  includeTechnicalDebt?: boolean;
}

export interface MaintainabilityScore {
  /** Maintainability Index (0-100, higher is better) */
  index: number;
  /** Readability score (0-100) */
  readability: number;
  /** Modularity score (0-100) */
  modularity: number;
  /** Documentation coverage (0-100) */
  documentationCoverage: number;
  /** Consistency score (0-100) */
  consistency: number;
}

export interface ReliabilityScore {
  /** Reliability Index (0-100) */
  index: number;
  /** Test coverage adequacy (0-100) */
  testCoverage: number;
  /** Error handling score (0-100) */
  errorHandling: number;
  /** Code smell density (0-100, 100 = no smells) */
  codeSmellDensity: number;
  /** Cyclomatic complexity impact (0-100) */
  complexityImpact: number;
}

export interface SecurityScore {
  /** Security Index (0-100) */
  index: number;
  /** Vulnerability risk (0-100, 100 = no risk) */
  vulnerabilityRisk: number;
  /** Input validation coverage (0-100) */
  inputValidation: number;
  /** Dependency safety (0-100) */
  dependencySafety: number;
  /** Sensitive data handling (0-100) */
  sensitiveDataHandling: number;
}

export interface TechnicalDebt {
  /** Total technical debt in person-hours */
  hoursOfDebt: number;
  /** Debt breakdown by category */
  breakdown: {
    category: string;
    hours: number;
    percentage: number;
  }[];
  /** Debt trend (increasing/stable/decreasing) */
  trend: 'increasing' | 'stable' | 'decreasing';
  /** Estimated payoff time (hours) */
  payoffHours: number;
  /** Priority items for debt reduction */
  topPriorities: string[];
}

export interface QualityMetricsResult {
  /** File path analyzed */
  filePath: string;
  /** Maintainability score and components */
  maintainability: MaintainabilityScore;
  /** Reliability score and components */
  reliability: ReliabilityScore;
  /** Security score and components */
  security: SecurityScore;
  /** Overall quality score (0-100) */
  overallScore: number;
  /** Quality rating */
  rating: 'A' | 'B' | 'C' | 'D' | 'F';
  /** Technical debt analysis */
  technicalDebt?: TechnicalDebt;
  /** Quality grade interpretation */
  interpretation: string;
  /** Improvement priorities */
  priorities: Array<{
    category: string;
    issue: string;
    impact: 'high' | 'medium' | 'low';
    effort: 'high' | 'medium' | 'low';
  }>;
  /** Analysis metadata */
  metadata: {
    timestamp: string;
    analysisTimeMs: number;
    language: string;
    linesAnalyzed: number;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate Halstead metrics for readability
 */
function calculateHalsteadReadability(code: string): number {
  // Simplified Halstead implementation
  const tokens = code.match(/\b\w+\b/g) || [];
  const uniqueTokens = new Set(tokens);
  const uniqueOperators = code.match(/[+\-*/%=!<>&|^~?:.,;()[\]{}]/g) || [];
  const uniqueOperatorsSet = new Set(uniqueOperators);

  // Calculate vocabulary and length
  const vocabulary = uniqueTokens.size + uniqueOperatorsSet.size;
  const length = tokens.length + uniqueOperators.length;

  if (vocabulary === 0) return 50;

  // Readability decreases with complexity
  const complexity = (length / vocabulary) * Math.log2(vocabulary);
  const readability = Math.max(0, Math.min(100, 100 - (complexity / 10)));

  return readability;
}

/**
 * Calculate modularity score based on function/method distribution
 */
function calculateModularity(code: string, language: string): number {
  // Extract functions/methods
  let functionPattern: RegExp;

  if (language === 'typescript' || language === 'javascript') {
    functionPattern = /(?:function|const\s+\w+\s*=|(?:async\s+)?function|\s*\w+\s*\()/g;
  } else if (language === 'python') {
    functionPattern = /^\s*(?:async\s+)?def\s+\w+\s*\(/gm;
  } else if (language === 'java') {
    functionPattern = /(?:public|private|protected)?\s+(?:static\s+)?(?:\w+\s+)+\w+\s*\(/g;
  } else {
    functionPattern = /function\s+\w+/g;
  }

  const functions = code.match(functionPattern) || [];
  const loc = code.split('\n').length;
  const averageLocPerFunction = functions.length > 0 ? loc / functions.length : loc;

  // Ideal: 50-100 LOC per function
  if (averageLocPerFunction < 50) return 90;
  if (averageLocPerFunction < 100) return 95;
  if (averageLocPerFunction < 200) return 75;
  if (averageLocPerFunction < 500) return 50;
  return 25;
}

/**
 * Calculate documentation coverage
 */
function calculateDocumentationCoverage(code: string, language: string): number {
  // Count documentation lines
  let docPatterns: RegExp;

  if (language === 'typescript' || language === 'javascript') {
    docPatterns = /\/\*\*[\s\S]*?\*\/|\/\/\s*@\w+/g;
  } else if (language === 'python') {
    docPatterns = /"""[\s\S]*?"""|'''[\s\S]*?'''|#\s*@\w+/g;
  } else if (language === 'java') {
    docPatterns = /\/\*\*[\s\S]*?\*\/|\/\/\s*@\w+/g;
  } else {
    docPatterns = /\/\*[\s\S]*?\*\/|\/\/.*$/gm;
  }

  const docLines = (code.match(docPatterns) || []).length;
  const totalLines = code.split('\n').length;

  // Ideal: 20-30% documentation
  const docPercentage = (docLines / Math.max(1, totalLines)) * 100;

  if (docPercentage < 5) return 30;
  if (docPercentage < 10) return 50;
  if (docPercentage < 20) return 70;
  if (docPercentage < 40) return 90;
  return Math.min(100, docPercentage);
}

/**
 * Calculate code consistency score
 */
function calculateConsistency(code: string, language: string): number {
  let score = 100;

  // Check indentation consistency
  const lines = code.split('\n');
  const indentPatterns: string[] = [];

  for (const line of lines) {
    if (line.trim()) {
      const match = line.match(/^(\s*)/);
      if (match) {
        indentPatterns.push(match[1]);
      }
    }
  }

  // Detect mixed indentation (tabs vs spaces)
  const hasTabs = indentPatterns.some(p => p.includes('\t'));
  const hasSpaces = indentPatterns.some(p => p.includes(' ') && !p.includes('\t'));

  if (hasTabs && hasSpaces) {
    score -= 20; // Mixed indentation
  }

  // Check naming conventions
  const camelCaseVars = (code.match(/\b[a-z][a-zA-Z0-9]*\b/g) || []).length;
  const snake_case_vars = (code.match(/\b[a-z_][a-z0-9_]*\b/g) || []).length;
  const PascalCaseClasses = (code.match(/\b[A-Z][a-zA-Z0-9]*\b/g) || []).length;

  const namingConsistency = Math.max(camelCaseVars, snake_case_vars, PascalCaseClasses) /
    (camelCaseVars + snake_case_vars + PascalCaseClasses || 1);

  if (namingConsistency < 0.6) {
    score -= 15; // Inconsistent naming
  }

  return Math.max(20, score);
}

/**
 * Calculate error handling score
 */
function calculateErrorHandling(code: string, language: string): number {
  let score = 50;

  // Count try-catch blocks
  const tryCatchBlocks = code.match(/try\s*{[\s\S]*?}\s*catch/g) || [];
  const totalCodeBlocks = code.match(/{[\s\S]*?}/g) || [];

  if (totalCodeBlocks.length > 0) {
    const tryRatio = tryCatchBlocks.length / totalCodeBlocks.length;
    score += tryRatio * 30; // Up to 30 points for error handling
  }

  // Check for error logging
  const errorLogging = code.match(/(console\.error|logger\.error|log\.error|throw new Error)/g) || [];
  if (errorLogging.length > 0) {
    score += 15;
  }

  // Check for validation
  const validationPatterns = code.match(/(if\s*\(|throw|assert|validate)/g) || [];
  if (validationPatterns.length > 5) {
    score += 5;
  }

  return Math.min(100, score);
}

/**
 * Detect security issues
 */
function detectSecurityIssues(code: string, language: string): number {
  let riskScore = 100; // Start with perfect score

  // Check for dangerous patterns
  const dangerousPatterns = [
    /eval\s*\(/g,                    // eval() usage
    /new Function\s*\(/g,            // Function constructor
    /innerHTML\s*=/g,                // innerHTML assignment (XSS risk)
    /SQL.*`.*\$\{/g,                // SQL injection patterns
    /password\s*[:=]\s*["'][^"']*["']/g, // Hardcoded passwords
    /secret\s*[:=]\s*["'][^"']*["']/g,   // Hardcoded secrets
    /api[_-]?key\s*[:=]\s*["'][^"']*["']/g, // Hardcoded API keys
  ];

  for (const pattern of dangerousPatterns) {
    const matches = code.match(pattern) || [];
    riskScore -= matches.length * 10;
  }

  // Check for input validation
  const validationPatterns = code.match(/(sanitize|validate|escape|encodeURI)/g) || [];
  riskScore += validationPatterns.length * 5;

  return Math.max(10, Math.min(100, riskScore));
}

/**
 * Calculate test coverage impact on reliability
 */
function calculateTestCoverageImpact(coverage: number): number {
  // Non-linear scale favoring higher coverage
  if (coverage >= 90) return 100;
  if (coverage >= 80) return 90;
  if (coverage >= 70) return 75;
  if (coverage >= 50) return 50;
  if (coverage >= 30) return 30;
  return 10;
}

/**
 * Calculate cyclomatic complexity impact
 */
function calculateComplexityImpact(code: string): number {
  const decisionPoints = (code.match(/\b(if|else|for|while|case|catch)\b/g) || []).length;
  const lines = code.split('\n').length;

  const averageComplexity = lines > 0 ? decisionPoints / lines : 0;

  // Lower complexity is better for reliability
  if (averageComplexity < 0.1) return 100;
  if (averageComplexity < 0.2) return 85;
  if (averageComplexity < 0.35) return 70;
  if (averageComplexity < 0.5) return 50;
  return 25;
}

/**
 * Calculate technical debt in person-hours
 */
function calculateTechnicalDebt(
  code: string,
  maintainability: number,
  reliability: number,
  security: number,
  codeSmells: number
): TechnicalDebt {
  const loc = code.split('\n').length;
  const hoursFactor = loc / 100; // Roughly 100 LOC per person-hour to refactor

  // Debt categories
  const breakdown = [];

  // Maintainability debt
  const maintDebt = (100 - maintainability) / 100 * hoursFactor * 2;
  breakdown.push({
    category: 'Maintainability Issues',
    hours: maintDebt,
    percentage: maintDebt / (maintDebt + reliability / 100 * hoursFactor + security / 100 * hoursFactor + codeSmells * 0.5) * 100
  });

  // Reliability debt
  const reliabDebt = (100 - reliability) / 100 * hoursFactor * 1.5;
  breakdown.push({
    category: 'Reliability Issues',
    hours: reliabDebt,
    percentage: reliabDebt / (maintDebt + reliabDebt + security / 100 * hoursFactor + codeSmells * 0.5) * 100
  });

  // Security debt
  const secDebt = (100 - security) / 100 * hoursFactor * 2.5;
  breakdown.push({
    category: 'Security Vulnerabilities',
    hours: secDebt,
    percentage: secDebt / (maintDebt + reliabDebt + secDebt + codeSmells * 0.5) * 100
  });

  // Code smell debt
  const smellDebt = codeSmells * 0.5;
  breakdown.push({
    category: 'Code Smells',
    hours: smellDebt,
    percentage: smellDebt / (maintDebt + reliabDebt + secDebt + smellDebt) * 100
  });

  const totalDebt = maintDebt + reliabDebt + secDebt + smellDebt;

  return {
    hoursOfDebt: Math.round(totalDebt),
    breakdown: breakdown.map(b => ({
      ...b,
      percentage: Math.round(b.percentage)
    })),
    trend: 'stable', // Would need historical data for actual trend
    payoffHours: Math.round(totalDebt / 4), // Assuming 1 person working part-time
    topPriorities: [
      'Reduce cyclomatic complexity in high-debt functions',
      'Improve test coverage for critical paths',
      'Address security vulnerabilities',
      'Refactor code with multiple smells'
    ]
  };
}

/**
 * Determine quality rating
 */
function determineRating(overallScore: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (overallScore >= 90) return 'A';
  if (overallScore >= 80) return 'B';
  if (overallScore >= 70) return 'C';
  if (overallScore >= 60) return 'D';
  return 'F';
}

/**
 * Generate improvement priorities
 */
function generatePriorities(
  maintainability: MaintainabilityScore,
  reliability: ReliabilityScore,
  security: SecurityScore
): Array<{
  category: string;
  issue: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'high' | 'medium' | 'low';
}> {
  const priorities: Array<{
    category: string;
    issue: string;
    impact: 'high' | 'medium' | 'low';
    effort: 'high' | 'medium' | 'low';
  }> = [];

  // Maintainability issues
  if (maintainability.index < 50) {
    priorities.push({
      category: 'Maintainability',
      issue: 'Critical: Code is difficult to understand and maintain',
      impact: 'high',
      effort: 'high'
    });
  } else if (maintainability.index < 70) {
    priorities.push({
      category: 'Maintainability',
      issue: 'Major: Refactoring needed for improved readability',
      impact: 'medium',
      effort: 'medium'
    });
  }

  if (maintainability.documentationCoverage < 30) {
    priorities.push({
      category: 'Documentation',
      issue: 'Add comprehensive code documentation',
      impact: 'medium',
      effort: 'medium'
    });
  }

  // Reliability issues
  if (reliability.index < 50) {
    priorities.push({
      category: 'Reliability',
      issue: 'Critical: Improve test coverage and error handling',
      impact: 'high',
      effort: 'high'
    });
  }

  if (reliability.testCoverage < 50) {
    priorities.push({
      category: 'Testing',
      issue: 'Increase unit test coverage to 80%+ minimum',
      impact: 'high',
      effort: 'high'
    });
  }

  if (reliability.codeSmellDensity < 70) {
    priorities.push({
      category: 'Code Quality',
      issue: 'Address code smells and anti-patterns',
      impact: 'medium',
      effort: 'medium'
    });
  }

  // Security issues
  if (security.index < 60) {
    priorities.push({
      category: 'Security',
      issue: 'Critical: Address security vulnerabilities',
      impact: 'high',
      effort: 'high'
    });
  }

  if (security.inputValidation < 70) {
    priorities.push({
      category: 'Security',
      issue: 'Improve input validation and sanitization',
      impact: 'high',
      effort: 'medium'
    });
  }

  return priorities.slice(0, 5); // Return top 5 priorities
}

// ============================================================================
// Main Calculation Function
// ============================================================================

/**
 * Calculate comprehensive code quality metrics
 * Combines maintainability, reliability, and security into actionable scores
 */
export async function calculateQualityMetrics(
  params: QualityMetricsParams
): Promise<QualityMetricsResult> {
  const startTime = Date.now();
  const {
    sourceCode,
    filePath,
    language,
    coveragePercentage = 60,
    codeSmells = 5,
    duplicationPercentage = 5,
    includeSecurityAnalysis = true,
    includeTechnicalDebt = true
  } = params;

  const linesAnalyzed = sourceCode.split('\n').length;

  // ========== MAINTAINABILITY SCORE ==========
  const readability = calculateHalsteadReadability(sourceCode);
  const modularity = calculateModularity(sourceCode, language);
  const documentationCoverage = calculateDocumentationCoverage(sourceCode, language);
  const consistency = calculateConsistency(sourceCode, language);

  // Weighted maintainability index
  const maintainabilityIndex = Math.round(
    readability * 0.25 +
    modularity * 0.25 +
    documentationCoverage * 0.25 +
    consistency * 0.25
  );

  const maintainability: MaintainabilityScore = {
    index: maintainabilityIndex,
    readability: Math.round(readability),
    modularity: Math.round(modularity),
    documentationCoverage: Math.round(documentationCoverage),
    consistency: Math.round(consistency)
  };

  // ========== RELIABILITY SCORE ==========
  const testCoverageImpact = calculateTestCoverageImpact(coveragePercentage);
  const errorHandling = calculateErrorHandling(sourceCode, language);
  const codeSmellDensity = Math.max(0, 100 - (codeSmells * 10));
  const complexityImpact = calculateComplexityImpact(sourceCode);

  const reliabilityIndex = Math.round(
    testCoverageImpact * 0.35 +
    errorHandling * 0.25 +
    codeSmellDensity * 0.25 +
    complexityImpact * 0.15
  );

  const reliability: ReliabilityScore = {
    index: reliabilityIndex,
    testCoverage: testCoverageImpact,
    errorHandling: Math.round(errorHandling),
    codeSmellDensity: Math.round(codeSmellDensity),
    complexityImpact: Math.round(complexityImpact)
  };

  // ========== SECURITY SCORE ==========
  let securityIndex = 75;
  let vulnerabilityRisk = 75;
  let inputValidation = 65;
  let dependencySafety = 80;
  let sensitiveDataHandling = 70;

  if (includeSecurityAnalysis) {
    vulnerabilityRisk = detectSecurityIssues(sourceCode, language);
    inputValidation = (sourceCode.match(/(sanitize|validate|escape)/g) || []).length > 2 ? 80 : 50;
    sensitiveDataHandling = sourceCode.includes('password') || sourceCode.includes('secret')
      ? 40
      : 85;

    securityIndex = Math.round(
      vulnerabilityRisk * 0.35 +
      inputValidation * 0.25 +
      dependencySafety * 0.2 +
      sensitiveDataHandling * 0.2
    );
  }

  const security: SecurityScore = {
    index: securityIndex,
    vulnerabilityRisk: vulnerabilityRisk,
    inputValidation: inputValidation,
    dependencySafety: dependencySafety,
    sensitiveDataHandling: sensitiveDataHandling
  };

  // ========== OVERALL SCORE ==========
  const overallScore = Math.round(
    maintainability.index * 0.33 +
    reliability.index * 0.33 +
    security.index * 0.34
  );

  const rating = determineRating(overallScore);

  // ========== INTERPRETATION ==========
  const interpretations: Record<'A' | 'B' | 'C' | 'D' | 'F', string> = {
    'A': 'Excellent code quality. Well-maintained, reliable, and secure. Ready for production.',
    'B': 'Good code quality. Some improvements recommended. Suitable for production with minor refinements.',
    'C': 'Acceptable code quality. Significant improvements needed. Consider refactoring.',
    'D': 'Poor code quality. Major refactoring required. High maintenance risk.',
    'F': 'Critical code quality issues. Immediate action required. Not recommended for production.'
  };

  const interpretation = interpretations[rating];

  // ========== TECHNICAL DEBT ==========
  let technicalDebt: TechnicalDebt | undefined;
  if (includeTechnicalDebt) {
    technicalDebt = calculateTechnicalDebt(
      sourceCode,
      maintainability.index,
      reliability.index,
      security.index,
      codeSmells
    );
  }

  // ========== PRIORITIES ==========
  const priorities = generatePriorities(maintainability, reliability, security);

  return {
    filePath,
    maintainability,
    reliability,
    security,
    overallScore,
    rating,
    technicalDebt,
    interpretation,
    priorities,
    metadata: {
      timestamp: new Date().toISOString(),
      analysisTimeMs: Date.now() - startTime,
      language,
      linesAnalyzed
    }
  };
}
