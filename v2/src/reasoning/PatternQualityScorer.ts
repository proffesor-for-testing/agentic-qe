/**
 * PatternQualityScorer - Comprehensive pattern quality assessment
 *
 * Calculates multi-dimensional quality scores for test patterns
 * Includes readability, completeness, specificity, reusability, and success rate
 *
 * @module reasoning/PatternQualityScorer
 * @version 1.0.0
 */

/**
 * Pattern quality components
 */
export interface QualityComponents {
  readability: number; // 0-1
  completeness: number; // 0-1
  specificity: number; // 0-1
  reusability: number; // 0-1
  successRate: number; // 0-1
  overall: number; // 0-1 weighted average
}

/**
 * Pattern for quality scoring
 */
export interface ScoredPattern {
  id: string;
  name: string;
  code: string;
  template?: string;
  description?: string;
  tags?: string[];
  usageCount?: number;
  metadata?: {
    successRate?: number;
    [key: string]: any;
  };
}

/**
 * PatternQualityScorer for comprehensive quality assessment
 */
export class PatternQualityScorer {
  private weights = {
    readability: 0.2,
    completeness: 0.2,
    specificity: 0.2,
    reusability: 0.2,
    successRate: 0.2
  };

  /**
   * Calculate comprehensive quality score for a pattern
   *
   * @param pattern - Pattern to score
   * @returns Quality components and overall score
   */
  calculateQuality(pattern: ScoredPattern): QualityComponents {
    const readability = this.scoreReadability(pattern.code);
    const completeness = this.scoreCompleteness(pattern);
    const specificity = this.scoreSpecificity(pattern);
    const reusability = this.scoreReusability(pattern);
    const successRate = pattern.metadata?.successRate ?? 0.5;

    const overall =
      readability * this.weights.readability +
      completeness * this.weights.completeness +
      specificity * this.weights.specificity +
      reusability * this.weights.reusability +
      successRate * this.weights.successRate;

    return {
      readability,
      completeness,
      specificity,
      reusability,
      successRate,
      overall
    };
  }

  /**
   * Score code readability
   * Factors: line length, complexity, comments, naming
   *
   * @param code - Code to score
   * @returns Readability score (0-1)
   */
  scoreReadability(code: string): number {
    let score = 1.0;

    // Line length penalty
    const lines = code.split('\n');
    const avgLineLength = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;
    if (avgLineLength > 100) {
      score -= 0.2;
    } else if (avgLineLength > 80) {
      score -= 0.1;
    }

    // Complexity penalty (nesting depth)
    const maxNesting = this.calculateMaxNesting(code);
    if (maxNesting > 4) {
      score -= 0.3;
    } else if (maxNesting > 3) {
      score -= 0.15;
    }

    // Comment bonus
    const commentRatio = this.calculateCommentRatio(code);
    if (commentRatio > 0.1 && commentRatio < 0.4) {
      score += 0.1;
    }

    // Descriptive naming bonus
    const hasDescriptiveNames = this.hasDescriptiveNaming(code);
    if (hasDescriptiveNames) {
      score += 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Score pattern completeness
   * Factors: assertions, setup/teardown, error handling, documentation
   *
   * @param pattern - Pattern to score
   * @returns Completeness score (0-1)
   */
  scoreCompleteness(pattern: ScoredPattern): number {
    let score = 0;

    // Has assertions
    if (this.hasAssertions(pattern.code)) {
      score += 0.3;
    }

    // Has setup/teardown
    if (this.hasSetupTeardown(pattern.code)) {
      score += 0.2;
    }

    // Has error handling
    if (this.hasErrorHandling(pattern.code)) {
      score += 0.2;
    }

    // Has description
    if (pattern.description && pattern.description.length > 20) {
      score += 0.15;
    }

    // Has tags
    if (pattern.tags && pattern.tags.length > 0) {
      score += 0.1;
    }

    // Has template
    if (pattern.template) {
      score += 0.05;
    }

    return Math.min(1, score);
  }

  /**
   * Score pattern specificity
   * Higher score = more specific and targeted pattern
   * Factors: domain-specific terms, clear use case, focused scope
   *
   * @param pattern - Pattern to score
   * @returns Specificity score (0-1)
   */
  scoreSpecificity(pattern: ScoredPattern): number {
    let score = 0.5; // Base score

    // Domain-specific terms bonus
    const domainTerms = this.countDomainTerms(pattern);
    score += Math.min(domainTerms * 0.1, 0.3);

    // Clear use case (description)
    if (pattern.description) {
      const hasUseCase = /should|when|given|test|verify/i.test(pattern.description);
      if (hasUseCase) {
        score += 0.1;
      }
    }

    // Focused scope (not too generic)
    const isGeneric = this.isGenericPattern(pattern);
    if (!isGeneric) {
      score += 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Score pattern reusability
   * Factors: parameterization, modularity, usage count, adaptability
   *
   * @param pattern - Pattern to score
   * @returns Reusability score (0-1)
   */
  scoreReusability(pattern: ScoredPattern): number {
    let score = 0;

    // Has parameterization
    if (this.hasParameterization(pattern.code)) {
      score += 0.3;
    }

    // Is modular (focused, single responsibility)
    if (this.isModular(pattern.code)) {
      score += 0.2;
    }

    // Usage count (proven reusability)
    const usageCount = pattern.usageCount || 0;
    if (usageCount > 10) {
      score += 0.3;
    } else if (usageCount > 5) {
      score += 0.2;
    } else if (usageCount > 0) {
      score += 0.1;
    }

    // Has template (enables adaptation)
    if (pattern.template) {
      score += 0.2;
    }

    return Math.min(1, score);
  }

  // Private helper methods

  /**
   * Calculate maximum nesting depth in code
   */
  private calculateMaxNesting(code: string): number {
    let maxDepth = 0;
    let currentDepth = 0;

    for (const char of code) {
      if (char === '{' || char === '(') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === '}' || char === ')') {
        currentDepth--;
      }
    }

    return maxDepth;
  }

  /**
   * Calculate comment ratio in code
   */
  private calculateCommentRatio(code: string): number {
    const lines = code.split('\n');
    const commentLines = lines.filter(line =>
      line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*')
    ).length;

    return commentLines / Math.max(lines.length, 1);
  }

  /**
   * Check if code has descriptive naming
   */
  private hasDescriptiveNaming(code: string): boolean {
    // Check for meaningful variable/function names (not single char or generic)
    const identifiers = code.match(/\b[a-z_][a-zA-Z0-9_]{2,}\b/g) || [];
    const descriptive = identifiers.filter(id =>
      !['test', 'data', 'result', 'value', 'temp', 'tmp', 'foo', 'bar'].includes(id.toLowerCase())
    );

    return descriptive.length / Math.max(identifiers.length, 1) > 0.6;
  }

  /**
   * Check if code has assertions
   */
  private hasAssertions(code: string): boolean {
    const assertionPatterns = [
      /expect\(/,
      /assert\./,
      /should\./,
      /\.to\./,
      /\.toBe/,
      /\.toEqual/,
      /\.toContain/
    ];

    return assertionPatterns.some(pattern => pattern.test(code));
  }

  /**
   * Check if code has setup/teardown
   */
  private hasSetupTeardown(code: string): boolean {
    const setupPatterns = [
      /beforeEach/,
      /afterEach/,
      /beforeAll/,
      /afterAll/,
      /setUp/,
      /tearDown/
    ];

    return setupPatterns.some(pattern => pattern.test(code));
  }

  /**
   * Check if code has error handling
   */
  private hasErrorHandling(code: string): boolean {
    const errorPatterns = [
      /try\s*{/,
      /catch\s*\(/,
      /toThrow/,
      /\.rejects/,
      /Error\(/
    ];

    return errorPatterns.some(pattern => pattern.test(code));
  }

  /**
   * Count domain-specific terms in pattern
   */
  private countDomainTerms(pattern: ScoredPattern): number {
    const text = `${pattern.name} ${pattern.description || ''} ${pattern.tags?.join(' ') || ''}`;
    const domainTerms = [
      'authentication', 'authorization', 'validation', 'api', 'database',
      'service', 'controller', 'repository', 'model', 'entity',
      'async', 'promise', 'callback', 'middleware', 'handler',
      'request', 'response', 'endpoint', 'route', 'query'
    ];

    let count = 0;
    for (const term of domainTerms) {
      if (text.toLowerCase().includes(term)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Check if pattern is too generic
   */
  private isGenericPattern(pattern: ScoredPattern): boolean {
    const genericNames = [
      'test', 'basic test', 'simple test', 'example', 'sample',
      'generic', 'default', 'standard', 'common'
    ];

    const name = pattern.name.toLowerCase();
    return genericNames.some(generic => name.includes(generic));
  }

  /**
   * Check if code has parameterization
   */
  private hasParameterization(code: string): boolean {
    // Check for function parameters or template placeholders
    const hasParams = /\([a-zA-Z_][a-zA-Z0-9_,\s]*\)/.test(code);
    const hasPlaceholders = /\{\{[^}]+\}\}/.test(code);

    return hasParams || hasPlaceholders;
  }

  /**
   * Check if code is modular (focused, single responsibility)
   */
  private isModular(code: string): boolean {
    const lines = code.split('\n').filter(line => line.trim().length > 0);

    // Not too long (focused)
    if (lines.length > 50) {
      return false;
    }

    // Single describe/test block (not nested)
    const describeCount = (code.match(/describe\(/g) || []).length;
    const testCount = (code.match(/\b(it|test)\(/g) || []).length;

    return describeCount <= 1 && testCount <= 3;
  }

  /**
   * Set custom weights for quality components
   *
   * @param weights - Custom weights (must sum to 1.0)
   */
  setWeights(weights: Partial<typeof this.weights>): void {
    this.weights = { ...this.weights, ...weights };

    // Normalize to sum to 1.0
    const sum = Object.values(this.weights).reduce((a, b) => a + b, 0);
    if (sum !== 1.0) {
      for (const key in this.weights) {
        this.weights[key as keyof typeof this.weights] /= sum;
      }
    }
  }

  /**
   * Get current weights
   */
  getWeights(): typeof this.weights {
    return { ...this.weights };
  }
}

export default PatternQualityScorer;
