/**
 * Code Complexity Analysis Tool
 * Cyclomatic and cognitive complexity analysis with hotspot detection
 *
 * @module code-quality/analyze-complexity
 * @version 1.0.0
 */

import { SecureRandom } from '../../../../utils/SecureRandom.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface ComplexityAnalysisParams {
  /** Source code to analyze */
  sourceCode: string;
  /** File path for context */
  filePath: string;
  /** Programming language */
  language: 'typescript' | 'javascript' | 'python' | 'java';
  /** Cyclomatic complexity threshold for hotspot detection */
  cyclomaticThreshold?: number;
  /** Cognitive complexity threshold for hotspot detection */
  cognitiveThreshold?: number;
  /** Include per-function analysis */
  includePerFunction?: boolean;
  /** Include refactoring recommendations */
  includeRecommendations?: boolean;
}

export interface ComplexityMetric {
  /** Cyclomatic complexity score (minimum: 1) */
  cyclomatic: number;
  /** Cognitive complexity score */
  cognitive: number;
  /** Lines of code (excluding comments) */
  linesOfCode: number;
  /** Function/method count */
  functionCount: number;
  /** Average complexity per function */
  averageComplexityPerFunction: number;
  /** Maximum complexity in any function */
  maxComplexity: number;
}

export interface FunctionComplexity {
  /** Function name or location */
  name: string;
  /** Starting line number */
  startLine: number;
  /** Ending line number */
  endLine: number;
  /** Cyclomatic complexity */
  cyclomatic: number;
  /** Cognitive complexity */
  cognitive: number;
  /** Lines of code in function */
  linesOfCode: number;
  /** Parameter count */
  parameters: number;
  /** Nesting depth */
  nestingDepth: number;
  /** Is hotspot (exceeds threshold) */
  isHotspot: boolean;
}

export interface ComplexityHotspot {
  /** Function name */
  name: string;
  /** Starting line number */
  startLine: number;
  /** Hotspot type */
  type: 'cyclomatic' | 'cognitive' | 'size';
  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Current value */
  current: number;
  /** Threshold exceeded */
  threshold: number;
  /** Excess percentage */
  excessPercentage: number;
  /** Recommended action */
  recommendation: string;
}

export interface ComplexityAnalysisResult {
  /** File path analyzed */
  filePath: string;
  /** Overall complexity metrics */
  overallMetrics: ComplexityMetric;
  /** Per-function analysis */
  functionMetrics?: FunctionComplexity[];
  /** Detected hotspots */
  hotspots: ComplexityHotspot[];
  /** Quality score (0-100, higher is better) */
  qualityScore: number;
  /** Analysis summary */
  summary: {
    totalFunctions: number;
    hotspotsDetected: number;
    criticalHotspots: number;
    averageComplexity: number;
    maxComplexity: number;
  };
  /** Refactoring recommendations */
  recommendations?: string[];
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
 * Count decision points for cyclomatic complexity
 */
function countDecisionPoints(code: string): number {
  // Pattern: keywords that increase cyclomatic complexity
  const decisionPatterns = [
    /\b(if|else\s+if)\b/g,        // if/else if
    /\bcase\b/g,                   // switch case
    /\bfor\b/g,                    // for loop
    /\bforeach\b/g,                // foreach (C#, etc.)
    /\bwhile\b/g,                  // while loop
    /\bdo\b/g,                     // do-while
    /\bcatch\b/g,                  // catch block
    /\?\s*[^:]+\s*:/g,            // ternary operator
    /\|\|/g,                       // logical OR
    /&&/g,                         // logical AND
    /\btry\b/g,                    // try block (adds complexity)
  ];

  let count = 0;
  for (const pattern of decisionPatterns) {
    const matches = code.match(pattern);
    count += matches ? matches.length : 0;
  }

  return count;
}

/**
 * Calculate cognitive complexity with nesting penalty
 * Cognitive complexity penalizes nesting more heavily than cyclomatic
 */
function calculateCognitiveComplexity(code: string): number {
  let complexity = 0;
  let currentNesting = 0;
  let maxNesting = 0;

  // Track braces to understand nesting
  for (const char of code) {
    if (char === '{') {
      currentNesting++;
      maxNesting = Math.max(maxNesting, currentNesting);
    } else if (char === '}') {
      currentNesting = Math.max(0, currentNesting - 1);
    }
  }

  // Base complexity: decision points
  const decisionPoints = countDecisionPoints(code);
  complexity = decisionPoints + 1; // Minimum 1

  // Add nesting penalty (each level above 1 adds weight)
  complexity += Math.max(0, maxNesting - 1) * 2;

  return complexity;
}

/**
 * Extract lines of code (excluding comments and blank lines)
 */
function extractLinesOfCode(code: string): number {
  const lines = code.split('\n');
  let count = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and comment-only lines
    if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('#') &&
        !trimmed.startsWith('*') && !trimmed.startsWith('/*') && !trimmed.startsWith('*/')) {
      count++;
    }
  }

  return count;
}

/**
 * Extract function/method definitions
 */
function extractFunctions(
  code: string,
  language: string
): Array<{ name: string; startLine: number; endLine: number; content: string }> {
  const functions: Array<{ name: string; startLine: number; endLine: number; content: string }> = [];
  const lines = code.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Pattern matching for function declarations based on language
    let functionMatch: RegExpMatchArray | null = null;
    let name = '';

    if (language === 'typescript' || language === 'javascript') {
      functionMatch = line.match(/(?:function|async\s+function|\w+\s*\(|const\s+(\w+)\s*=\s*(?:async\s*)?\()\s*(\w+)?/);
      if (functionMatch) {
        name = functionMatch[1] || functionMatch[2] || `function_${i}`;
      }
    } else if (language === 'python') {
      functionMatch = line.match(/^\s*(?:async\s+)?def\s+(\w+)\s*\(/);
      if (functionMatch) {
        name = functionMatch[1];
      }
    } else if (language === 'java') {
      functionMatch = line.match(/(?:public|private|protected)?\s+(?:static\s+)?(?:\w+\s+)+(\w+)\s*\(/);
      if (functionMatch) {
        name = functionMatch[1];
      }
    }

    if (functionMatch && name) {
      // Find matching closing brace
      let braceCount = 0;
      let endLine = i;
      let foundStart = false;

      for (let j = i; j < lines.length; j++) {
        const funcLine = lines[j];
        for (const char of funcLine) {
          if (char === '{') {
            braceCount++;
            foundStart = true;
          } else if (char === '}') {
            braceCount--;
            if (foundStart && braceCount === 0) {
              endLine = j;
              break;
            }
          }
        }
        if (foundStart && braceCount === 0) break;
      }

      functions.push({
        name,
        startLine: i + 1,
        endLine: endLine + 1,
        content: lines.slice(i, endLine + 1).join('\n')
      });

      i = endLine + 1;
    } else {
      i++;
    }
  }

  return functions;
}

/**
 * Calculate nesting depth for a code block
 */
function calculateNestingDepth(code: string): number {
  let maxNesting = 0;
  let currentNesting = 0;

  for (const char of code) {
    if (char === '{' || char === '[' || char === '(') {
      currentNesting++;
      maxNesting = Math.max(maxNesting, currentNesting);
    } else if (char === '}' || char === ']' || char === ')') {
      currentNesting = Math.max(0, currentNesting - 1);
    }
  }

  return maxNesting;
}

/**
 * Determine hotspot severity based on excess percentage
 */
function determineSeverity(excessPercentage: number): 'low' | 'medium' | 'high' | 'critical' {
  if (excessPercentage >= 200) return 'critical';
  if (excessPercentage >= 100) return 'high';
  if (excessPercentage >= 50) return 'medium';
  return 'low';
}

/**
 * Generate refactoring recommendations
 */
function generateRecommendations(
  hotspots: ComplexityHotspot[],
  overallMetrics: ComplexityMetric
): string[] {
  const recommendations: string[] = [];

  // Group hotspots by type
  const cyclomaticHotspots = hotspots.filter(h => h.type === 'cyclomatic');
  const cognitiveHotspots = hotspots.filter(h => h.type === 'cognitive');
  const sizeHotspots = hotspots.filter(h => h.type === 'size');

  if (cyclomaticHotspots.length > 0) {
    const critical = cyclomaticHotspots.filter(h => h.severity === 'critical');
    if (critical.length > 0) {
      recommendations.push(
        `Apply Extract Method refactoring to ${critical.length} function(s) with critical cyclomatic complexity`
      );
    }
    recommendations.push('Use Strategy or State pattern to reduce complex conditional logic');
    recommendations.push('Consider polymorphism instead of switch statements');
  }

  if (cognitiveHotspots.length > 0) {
    recommendations.push('Use early returns (guard clauses) to reduce nesting levels');
    recommendations.push('Extract nested loops and conditionals into separate methods');
    recommendations.push('Replace nested ternary operators with if-else or helper methods');
  }

  if (sizeHotspots.length > 0) {
    recommendations.push('Split large functions into focused, single-responsibility methods');
    recommendations.push('Move related functionality into separate classes or modules');
  }

  if (overallMetrics.averageComplexityPerFunction > 10) {
    recommendations.push('Target: Keep average function complexity under 10 for maintainability');
  }

  if (overallMetrics.maxComplexity > 30) {
    recommendations.push('Critical: Functions with complexity > 30 are extremely difficult to test');
  }

  return recommendations;
}

/**
 * Calculate quality score based on complexity metrics
 */
function calculateQualityScore(
  metrics: ComplexityMetric,
  hotspots: ComplexityHotspot[]
): number {
  let score = 100;

  // Deduct points for hotspots
  for (const hotspot of hotspots) {
    const deduction = {
      'low': 3,
      'medium': 8,
      'high': 15,
      'critical': 25
    }[hotspot.severity];
    score -= deduction;
  }

  // Deduct for overall complexity
  if (metrics.cyclomatic > 15) score -= 10;
  if (metrics.averageComplexityPerFunction > 15) score -= 15;
  if (metrics.linesOfCode > 500) score -= 5;

  return Math.max(0, Math.min(100, score));
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze code complexity with hotspot detection
 * Provides cyclomatic and cognitive complexity metrics with actionable recommendations
 */
export async function analyzeComplexity(
  params: ComplexityAnalysisParams
): Promise<ComplexityAnalysisResult> {
  const startTime = Date.now();
  const {
    sourceCode,
    filePath,
    language,
    cyclomaticThreshold = 10,
    cognitiveThreshold = 15,
    includePerFunction = true,
    includeRecommendations = true
  } = params;

  // Calculate overall metrics
  const decisionPoints = countDecisionPoints(sourceCode);
  const cyclomaticComplexity = decisionPoints + 1;
  const cognitiveComplexity = calculateCognitiveComplexity(sourceCode);
  const linesOfCode = extractLinesOfCode(sourceCode);
  const functions = extractFunctions(sourceCode, language);
  const functionCount = functions.length || 1;
  const averageComplexityPerFunction = functionCount > 0
    ? cyclomaticComplexity / functionCount
    : cyclomaticComplexity;

  // Find max complexity
  let maxComplexity = cyclomaticComplexity;

  // Per-function analysis
  let functionMetrics: FunctionComplexity[] | undefined;
  if (includePerFunction && functions.length > 0) {
    functionMetrics = functions.map(func => {
      const funcCyclomatic = countDecisionPoints(func.content) + 1;
      const funcCognitive = calculateCognitiveComplexity(func.content);
      const funcLoc = extractLinesOfCode(func.content);
      const funcNesting = calculateNestingDepth(func.content);
      const funcParams = (func.content.match(/\([^)]*\)/)?.[0]?.split(',') || []).length;

      maxComplexity = Math.max(maxComplexity, funcCyclomatic);

      return {
        name: func.name,
        startLine: func.startLine,
        endLine: func.endLine,
        cyclomatic: funcCyclomatic,
        cognitive: funcCognitive,
        linesOfCode: funcLoc,
        parameters: funcParams,
        nestingDepth: funcNesting,
        isHotspot: funcCyclomatic > cyclomaticThreshold || funcCognitive > cognitiveThreshold
      };
    });
  }

  // Detect hotspots
  const hotspots: ComplexityHotspot[] = [];

  if (cyclomaticComplexity > cyclomaticThreshold) {
    hotspots.push({
      name: 'Overall',
      startLine: 1,
      type: 'cyclomatic',
      severity: determineSeverity(((cyclomaticComplexity - cyclomaticThreshold) / cyclomaticThreshold) * 100),
      current: cyclomaticComplexity,
      threshold: cyclomaticThreshold,
      excessPercentage: ((cyclomaticComplexity - cyclomaticThreshold) / cyclomaticThreshold) * 100,
      recommendation: 'Break down complex logic into smaller, focused functions'
    });
  }

  if (cognitiveComplexity > cognitiveThreshold) {
    hotspots.push({
      name: 'Overall',
      startLine: 1,
      type: 'cognitive',
      severity: determineSeverity(((cognitiveComplexity - cognitiveThreshold) / cognitiveThreshold) * 100),
      current: cognitiveComplexity,
      threshold: cognitiveThreshold,
      excessPercentage: ((cognitiveComplexity - cognitiveThreshold) / cognitiveThreshold) * 100,
      recommendation: 'Reduce nesting levels and simplify control flow'
    });
  }

  // Per-function hotspots
  if (functionMetrics) {
    for (const func of functionMetrics) {
      if (func.cyclomatic > cyclomaticThreshold) {
        hotspots.push({
          name: func.name,
          startLine: func.startLine,
          type: 'cyclomatic',
          severity: determineSeverity(((func.cyclomatic - cyclomaticThreshold) / cyclomaticThreshold) * 100),
          current: func.cyclomatic,
          threshold: cyclomaticThreshold,
          excessPercentage: ((func.cyclomatic - cyclomaticThreshold) / cyclomaticThreshold) * 100,
          recommendation: `Extract method: ${func.name} has excessive cyclomatic complexity`
        });
      }

      if (func.cognitive > cognitiveThreshold) {
        hotspots.push({
          name: func.name,
          startLine: func.startLine,
          type: 'cognitive',
          severity: determineSeverity(((func.cognitive - cognitiveThreshold) / cognitiveThreshold) * 100),
          current: func.cognitive,
          threshold: cognitiveThreshold,
          excessPercentage: ((func.cognitive - cognitiveThreshold) / cognitiveThreshold) * 100,
          recommendation: `Refactor: ${func.name} has high cognitive complexity due to nesting`
        });
      }

      if (func.linesOfCode > 100) {
        hotspots.push({
          name: func.name,
          startLine: func.startLine,
          type: 'size',
          severity: func.linesOfCode > 300 ? 'critical' : func.linesOfCode > 200 ? 'high' : 'medium',
          current: func.linesOfCode,
          threshold: 100,
          excessPercentage: ((func.linesOfCode - 100) / 100) * 100,
          recommendation: `Split: ${func.name} is too large (${func.linesOfCode} lines)`
        });
      }
    }
  }

  const overallMetrics: ComplexityMetric = {
    cyclomatic: cyclomaticComplexity,
    cognitive: cognitiveComplexity,
    linesOfCode,
    functionCount,
    averageComplexityPerFunction,
    maxComplexity
  };

  const qualityScore = calculateQualityScore(overallMetrics, hotspots);
  const recommendations = includeRecommendations
    ? generateRecommendations(hotspots, overallMetrics)
    : [];

  const criticalHotspots = hotspots.filter(h => h.severity === 'critical').length;

  return {
    filePath,
    overallMetrics,
    functionMetrics,
    hotspots,
    qualityScore,
    summary: {
      totalFunctions: functionCount,
      hotspotsDetected: hotspots.length,
      criticalHotspots,
      averageComplexity: averageComplexityPerFunction,
      maxComplexity
    },
    recommendations,
    metadata: {
      timestamp: new Date().toISOString(),
      analysisTimeMs: Date.now() - startTime,
      language,
      linesAnalyzed: sourceCode.split('\n').length
    }
  };
}
