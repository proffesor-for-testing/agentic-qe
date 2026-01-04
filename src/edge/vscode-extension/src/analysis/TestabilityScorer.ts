/**
 * TestabilityScorer - Score code testability on a scale of 0-100
 *
 * Analyzes code for testability based on multiple factors:
 * - Cyclomatic complexity (lower is better)
 * - Number of dependencies (fewer is better)
 * - Side effects (none is best)
 * - Parameter count (fewer is better)
 * - Return type clarity
 * - Global state access
 * - I/O operations
 * - Coupling patterns
 *
 * @module vscode-extension/analysis/TestabilityScorer
 * @version 0.1.0
 */

import * as ts from 'typescript';
import type { ExtractedFunction } from './FunctionExtractor';
import { ComplexityCalculator, type ComplexityResult } from './ComplexityCalculator';

/**
 * Testability score result
 */
export interface TestabilityScore {
  /**
   * Overall testability score (0-100)
   */
  score: number;

  /**
   * Score category
   */
  category: TestabilityCategory;

  /**
   * Breakdown of individual factor scores
   */
  factors: TestabilityFactors;

  /**
   * Detected hard-to-test patterns
   */
  antiPatterns: AntiPattern[];

  /**
   * Improvement suggestions
   */
  suggestions: TestabilitySuggestion[];

  /**
   * Detailed explanation
   */
  explanation: string;
}

/**
 * Testability category
 */
export type TestabilityCategory =
  | 'excellent'  // 80-100
  | 'good'       // 60-79
  | 'moderate'   // 40-59
  | 'poor'       // 20-39
  | 'very-poor'; // 0-19

/**
 * Individual testability factors
 */
export interface TestabilityFactors {
  /**
   * Complexity score (0-20, higher is better)
   */
  complexity: FactorScore;

  /**
   * Dependencies score (0-20, higher is better)
   */
  dependencies: FactorScore;

  /**
   * Side effects score (0-20, higher is better)
   */
  sideEffects: FactorScore;

  /**
   * Parameters score (0-15, higher is better)
   */
  parameters: FactorScore;

  /**
   * Return type score (0-10, higher is better)
   */
  returnType: FactorScore;

  /**
   * Coupling score (0-15, higher is better)
   */
  coupling: FactorScore;
}

/**
 * Individual factor score
 */
export interface FactorScore {
  /**
   * Score value
   */
  value: number;

  /**
   * Maximum possible score
   */
  max: number;

  /**
   * Reason for this score
   */
  reason: string;
}

/**
 * Anti-pattern detection
 */
export interface AntiPattern {
  /**
   * Anti-pattern type
   */
  type: AntiPatternType;

  /**
   * Severity level
   */
  severity: 'critical' | 'major' | 'minor';

  /**
   * Location in code (if applicable)
   */
  location?: {
    line: number;
    column: number;
  };

  /**
   * Description of the issue
   */
  description: string;

  /**
   * Suggested fix
   */
  fix: string;
}

/**
 * Types of anti-patterns
 */
export type AntiPatternType =
  | 'global-state'
  | 'singleton-access'
  | 'tight-coupling'
  | 'hidden-dependency'
  | 'side-effect'
  | 'non-deterministic'
  | 'mutable-shared-state'
  | 'god-function'
  | 'deep-nesting'
  | 'constructor-work'
  | 'service-locator'
  | 'static-cling'
  | 'temporal-coupling';

/**
 * Testability improvement suggestion
 */
export interface TestabilitySuggestion {
  /**
   * Priority (1 = highest)
   */
  priority: number;

  /**
   * Category of improvement
   */
  category: 'refactor' | 'extract' | 'inject' | 'simplify' | 'design';

  /**
   * Suggestion title
   */
  title: string;

  /**
   * Detailed description
   */
  description: string;

  /**
   * Expected score improvement
   */
  expectedImprovement: number;
}

/**
 * Scorer options
 */
export interface TestabilityScorerOptions {
  /**
   * Maximum acceptable complexity
   */
  maxComplexity?: number;

  /**
   * Maximum acceptable parameters
   */
  maxParameters?: number;

  /**
   * Maximum acceptable dependencies
   */
  maxDependencies?: number;

  /**
   * Strict mode (penalize more harshly)
   */
  strictMode?: boolean;
}

/**
 * Default scorer options
 */
const DEFAULT_OPTIONS: TestabilityScorerOptions = {
  maxComplexity: 10,
  maxParameters: 4,
  maxDependencies: 5,
  strictMode: false,
};

/**
 * TestabilityScorer
 *
 * Analyzes code testability and provides actionable feedback.
 */
export class TestabilityScorer {
  private options: Required<TestabilityScorerOptions>;
  private complexityCalculator: ComplexityCalculator;
  private sourceFile: ts.SourceFile | null = null;

  constructor(options: TestabilityScorerOptions = {}) {
    this.options = {
      maxComplexity: options.maxComplexity ?? DEFAULT_OPTIONS.maxComplexity!,
      maxParameters: options.maxParameters ?? DEFAULT_OPTIONS.maxParameters!,
      maxDependencies: options.maxDependencies ?? DEFAULT_OPTIONS.maxDependencies!,
      strictMode: options.strictMode ?? DEFAULT_OPTIONS.strictMode!,
    };
    this.complexityCalculator = new ComplexityCalculator();
  }

  /**
   * Score testability for a function
   */
  score(func: ExtractedFunction): TestabilityScore {
    // Parse source for detailed analysis
    this.sourceFile = ts.createSourceFile(
      'temp.ts',
      func.sourceCode,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );

    // Calculate complexity
    const complexity = this.complexityCalculator.calculate(func);

    // Analyze all factors
    const factors = this.analyzeFactors(func, complexity);

    // Detect anti-patterns
    const antiPatterns = this.detectAntiPatterns(func, complexity);

    // Calculate total score
    const totalScore = this.calculateTotalScore(factors, antiPatterns);

    // Determine category
    const category = this.categorize(totalScore);

    // Generate suggestions
    const suggestions = this.generateSuggestions(func, factors, antiPatterns);

    // Generate explanation
    const explanation = this.generateExplanation(totalScore, factors, antiPatterns);

    return {
      score: totalScore,
      category,
      factors,
      antiPatterns,
      suggestions,
      explanation,
    };
  }

  /**
   * Analyze all testability factors
   */
  private analyzeFactors(
    func: ExtractedFunction,
    complexity: ComplexityResult
  ): TestabilityFactors {
    return {
      complexity: this.scoreComplexity(complexity),
      dependencies: this.scoreDependencies(func),
      sideEffects: this.scoreSideEffects(func),
      parameters: this.scoreParameters(func),
      returnType: this.scoreReturnType(func),
      coupling: this.scoreCoupling(func),
    };
  }

  /**
   * Score complexity factor (0-20)
   */
  private scoreComplexity(complexity: ComplexityResult): FactorScore {
    const maxScore = 20;
    const cc = complexity.cyclomaticComplexity;

    let score: number;
    let reason: string;

    if (cc <= 3) {
      score = maxScore;
      reason = 'Excellent - very simple logic';
    } else if (cc <= 5) {
      score = 17;
      reason = 'Good - straightforward logic';
    } else if (cc <= 10) {
      score = 12;
      reason = 'Moderate - some branching complexity';
    } else if (cc <= 15) {
      score = 7;
      reason = 'High - complex branching, hard to test all paths';
    } else if (cc <= 20) {
      score = 3;
      reason = 'Very high - too many paths to test effectively';
    } else {
      score = 0;
      reason = 'Extreme - nearly untestable complexity';
    }

    if (this.options.strictMode && cc > this.options.maxComplexity) {
      score = Math.max(0, score - 5);
      reason += ` (exceeds threshold of ${this.options.maxComplexity})`;
    }

    return { value: score, max: maxScore, reason };
  }

  /**
   * Score dependencies factor (0-20)
   */
  private scoreDependencies(func: ExtractedFunction): FactorScore {
    const maxScore = 20;
    const deps = func.dependencies.length;

    let score: number;
    let reason: string;

    if (deps === 0) {
      score = maxScore;
      reason = 'Excellent - no external dependencies';
    } else if (deps <= 2) {
      score = 17;
      reason = 'Good - few dependencies';
    } else if (deps <= 4) {
      score = 12;
      reason = 'Moderate - some dependencies to mock';
    } else if (deps <= 7) {
      score = 7;
      reason = 'High - many dependencies require mocking';
    } else {
      score = 2;
      reason = 'Very high - excessive dependencies';
    }

    // Check for hard-to-mock dependencies
    const hardDeps = this.findHardToMockDependencies(func);
    if (hardDeps.length > 0) {
      score = Math.max(0, score - hardDeps.length * 2);
      reason += ` (${hardDeps.length} hard-to-mock dependency/ies)`;
    }

    return { value: score, max: maxScore, reason };
  }

  /**
   * Score side effects factor (0-20)
   */
  private scoreSideEffects(func: ExtractedFunction): FactorScore {
    const maxScore = 20;
    const effects = this.detectSideEffects(func);

    let score: number;
    let reason: string;

    if (effects.length === 0) {
      score = maxScore;
      reason = 'Excellent - pure function with no side effects';
    } else if (effects.length === 1) {
      score = 14;
      reason = `Good - single side effect: ${effects[0]}`;
    } else if (effects.length <= 3) {
      score = 8;
      reason = `Moderate - ${effects.length} side effects`;
    } else {
      score = 2;
      reason = `Poor - ${effects.length} side effects make testing difficult`;
    }

    // Extra penalty for non-deterministic effects
    const nonDeterministic = effects.filter(
      (e) =>
        e.includes('Date') ||
        e.includes('random') ||
        e.includes('setTimeout') ||
        e.includes('setInterval')
    );
    if (nonDeterministic.length > 0) {
      score = Math.max(0, score - 5);
      reason += ' (includes non-deterministic operations)';
    }

    return { value: score, max: maxScore, reason };
  }

  /**
   * Score parameters factor (0-15)
   */
  private scoreParameters(func: ExtractedFunction): FactorScore {
    const maxScore = 15;
    const paramCount = func.parameters.length;

    let score: number;
    let reason: string;

    if (paramCount === 0) {
      score = maxScore;
      reason = 'Excellent - no parameters to set up';
    } else if (paramCount <= 2) {
      score = 13;
      reason = 'Good - few parameters';
    } else if (paramCount <= 4) {
      score = 9;
      reason = 'Moderate - several parameters to configure';
    } else if (paramCount <= 6) {
      score = 5;
      reason = 'High - many parameters require setup';
    } else {
      score = 1;
      reason = 'Very high - too many parameters';
    }

    // Check for complex parameter types
    const complexParams = func.parameters.filter(
      (p) =>
        p.type?.includes('=>') || // function parameter
        p.type?.includes('...') || // rest parameter
        (p.type?.includes('<') && p.type?.includes('>')) // generic
    );

    if (complexParams.length > 0) {
      score = Math.max(0, score - 2);
      reason += ` (${complexParams.length} complex parameter type(s))`;
    }

    return { value: score, max: maxScore, reason };
  }

  /**
   * Score return type factor (0-10)
   */
  private scoreReturnType(func: ExtractedFunction): FactorScore {
    const maxScore = 10;

    let score: number;
    let reason: string;

    if (!func.returnType) {
      score = 4;
      reason = 'Missing return type annotation - harder to verify';
    } else if (func.returnType === 'void') {
      score = 6;
      reason = 'Void return - must verify via side effects';
    } else if (func.returnType.includes('Promise')) {
      score = 7;
      reason = 'Async return - requires async testing';
    } else if (
      func.returnType === 'boolean' ||
      func.returnType === 'number' ||
      func.returnType === 'string'
    ) {
      score = maxScore;
      reason = 'Simple return type - easy to assert';
    } else {
      score = 8;
      reason = 'Defined return type - verifiable';
    }

    return { value: score, max: maxScore, reason };
  }

  /**
   * Score coupling factor (0-15)
   */
  private scoreCoupling(func: ExtractedFunction): FactorScore {
    const maxScore = 15;
    const couplingIssues = this.detectCouplingIssues(func);

    let score: number;
    let reason: string;

    if (couplingIssues.length === 0) {
      score = maxScore;
      reason = 'Excellent - loosely coupled';
    } else if (couplingIssues.length === 1) {
      score = 11;
      reason = `Good - minor coupling: ${couplingIssues[0]}`;
    } else if (couplingIssues.length <= 3) {
      score = 6;
      reason = `Moderate - ${couplingIssues.length} coupling issues`;
    } else {
      score = 2;
      reason = `Poor - tightly coupled (${couplingIssues.length} issues)`;
    }

    return { value: score, max: maxScore, reason };
  }

  /**
   * Detect anti-patterns in the function
   */
  private detectAntiPatterns(
    func: ExtractedFunction,
    complexity: ComplexityResult
  ): AntiPattern[] {
    const antiPatterns: AntiPattern[] = [];
    const sourceCode = func.sourceCode.toLowerCase();

    // Global state access
    const globalPatterns = [
      'window.',
      'document.',
      'global.',
      'globalthis.',
      'process.env',
    ];
    for (const pattern of globalPatterns) {
      if (sourceCode.includes(pattern)) {
        antiPatterns.push({
          type: 'global-state',
          severity: 'major',
          description: `Accesses global state via ${pattern.replace('.', '')}`,
          fix: 'Inject global dependencies as parameters',
        });
        break;
      }
    }

    // Singleton access
    if (
      sourceCode.includes('.getinstance') ||
      sourceCode.includes('.instance')
    ) {
      antiPatterns.push({
        type: 'singleton-access',
        severity: 'major',
        description: 'Accesses singleton instance directly',
        fix: 'Inject the instance via constructor or parameter',
      });
    }

    // Non-deterministic operations
    if (
      sourceCode.includes('date.now') ||
      sourceCode.includes('new date') ||
      sourceCode.includes('math.random')
    ) {
      antiPatterns.push({
        type: 'non-deterministic',
        severity: 'major',
        description: 'Uses non-deterministic operations (Date, Math.random)',
        fix: 'Inject time/random providers for testability',
      });
    }

    // Constructor doing work (for constructors)
    if (func.kind === 'constructor' && func.bodyCode) {
      const hasConditionals =
        func.bodyCode.includes('if') ||
        func.bodyCode.includes('switch') ||
        func.bodyCode.includes('try');
      const hasLoops =
        func.bodyCode.includes('for') || func.bodyCode.includes('while');
      const hasAwait = func.bodyCode.includes('await');

      if (hasConditionals || hasLoops || hasAwait) {
        antiPatterns.push({
          type: 'constructor-work',
          severity: 'major',
          description: 'Constructor contains complex logic',
          fix: 'Move logic to factory method or separate initialization',
        });
      }
    }

    // God function
    if (complexity.cyclomaticComplexity > 20) {
      antiPatterns.push({
        type: 'god-function',
        severity: 'critical',
        description: `Function has complexity of ${complexity.cyclomaticComplexity}`,
        fix: 'Split into smaller, focused functions',
      });
    }

    // Deep nesting
    if (complexity.breakdown.nestedDepth > 4) {
      antiPatterns.push({
        type: 'deep-nesting',
        severity: 'major',
        description: `Nesting depth of ${complexity.breakdown.nestedDepth}`,
        fix: 'Flatten with early returns or extract nested blocks',
      });
    }

    // Static method calls (potential static cling)
    const staticCallPattern = /[A-Z][a-zA-Z]*\.[a-z][a-zA-Z]*\(/g;
    const staticMatches = func.sourceCode.match(staticCallPattern) || [];
    const nonTrivialStatics = staticMatches.filter(
      (m) =>
        !m.startsWith('Math.') &&
        !m.startsWith('Object.') &&
        !m.startsWith('Array.') &&
        !m.startsWith('JSON.') &&
        !m.startsWith('Promise.') &&
        !m.startsWith('console.')
    );
    if (nonTrivialStatics.length > 2) {
      antiPatterns.push({
        type: 'static-cling',
        severity: 'minor',
        description: 'Multiple static method dependencies',
        fix: 'Inject dependencies instead of calling static methods',
      });
    }

    // Hidden dependencies (file system, network, database)
    const ioPatterns = [
      'fs.',
      'fetch(',
      'http.',
      'https.',
      'axios.',
      '.query(',
      '.execute(',
      'localstorage',
      'sessionstorage',
      'indexeddb',
    ];
    for (const pattern of ioPatterns) {
      if (sourceCode.includes(pattern)) {
        antiPatterns.push({
          type: 'hidden-dependency',
          severity: 'major',
          description: `Hidden I/O dependency: ${pattern}`,
          fix: 'Extract I/O behind an interface and inject',
        });
        break;
      }
    }

    // Mutable shared state
    if (func.dependencies.some((d) => d.startsWith('_') || d.endsWith('State'))) {
      antiPatterns.push({
        type: 'mutable-shared-state',
        severity: 'minor',
        description: 'May access mutable shared state',
        fix: 'Use immutable patterns or pass state explicitly',
      });
    }

    return antiPatterns;
  }

  /**
   * Find hard-to-mock dependencies
   */
  private findHardToMockDependencies(func: ExtractedFunction): string[] {
    const hardDeps: string[] = [];
    const sourceCode = func.sourceCode.toLowerCase();

    // Check for direct instantiation
    const newPattern = /new\s+([A-Z][a-zA-Z]*)/g;
    const matches = func.sourceCode.matchAll(newPattern);
    for (const match of matches) {
      if (!['Array', 'Map', 'Set', 'Date', 'Error', 'Promise', 'Object'].includes(match[1])) {
        hardDeps.push(`new ${match[1]}`);
      }
    }

    // Check for module imports used directly
    const importPatterns = ['require(', 'import('];
    for (const pattern of importPatterns) {
      if (sourceCode.includes(pattern)) {
        hardDeps.push('dynamic import');
        break;
      }
    }

    return hardDeps;
  }

  /**
   * Detect side effects in a function
   */
  private detectSideEffects(func: ExtractedFunction): string[] {
    const effects: string[] = [];
    const sourceCode = func.sourceCode;

    // Console operations
    if (/console\.(log|warn|error|info|debug)/.test(sourceCode)) {
      effects.push('console output');
    }

    // DOM manipulation
    if (/document\.(get|query|create|append|remove)/.test(sourceCode)) {
      effects.push('DOM manipulation');
    }

    // Storage operations
    if (/localStorage|sessionStorage|indexedDB/.test(sourceCode)) {
      effects.push('browser storage');
    }

    // Network operations
    if (/fetch\(|axios\.|http\.|https\./.test(sourceCode)) {
      effects.push('network request');
    }

    // File system
    if (/fs\.|readFile|writeFile/.test(sourceCode)) {
      effects.push('file system');
    }

    // Timers
    if (/setTimeout|setInterval|requestAnimationFrame/.test(sourceCode)) {
      effects.push('timer');
    }

    // Date/random
    if (/Date\.now|new Date|Math\.random/.test(sourceCode)) {
      effects.push('Date/random');
    }

    // Event dispatch
    if (/emit\(|dispatch\(|trigger\(/.test(sourceCode)) {
      effects.push('event emission');
    }

    // Database
    if (/\.query\(|\.execute\(|\.insert\(|\.update\(|\.delete\(/.test(sourceCode)) {
      effects.push('database operation');
    }

    return effects;
  }

  /**
   * Detect coupling issues
   */
  private detectCouplingIssues(func: ExtractedFunction): string[] {
    const issues: string[] = [];
    const sourceCode = func.sourceCode;

    // Checking types directly (instead of duck typing)
    if (/instanceof\s+[A-Z]/.test(sourceCode)) {
      issues.push('instanceof checks');
    }

    // Accessing deep properties
    const deepAccess = sourceCode.match(/\w+\.\w+\.\w+\.\w+/g);
    if (deepAccess && deepAccess.length > 2) {
      issues.push('deep property access (Law of Demeter)');
    }

    // Many conditional checks on object type
    if ((sourceCode.match(/typeof\s+/g) || []).length > 3) {
      issues.push('excessive type checking');
    }

    // Circular references (importing and being imported by same module)
    if (func.dependencies.length > 10) {
      issues.push('excessive dependencies');
    }

    return issues;
  }

  /**
   * Calculate total score from factors and penalties
   */
  private calculateTotalScore(
    factors: TestabilityFactors,
    antiPatterns: AntiPattern[]
  ): number {
    // Sum up factor scores
    let total =
      factors.complexity.value +
      factors.dependencies.value +
      factors.sideEffects.value +
      factors.parameters.value +
      factors.returnType.value +
      factors.coupling.value;

    // Apply anti-pattern penalties
    for (const ap of antiPatterns) {
      switch (ap.severity) {
        case 'critical':
          total -= 15;
          break;
        case 'major':
          total -= 8;
          break;
        case 'minor':
          total -= 3;
          break;
      }
    }

    return Math.max(0, Math.min(100, total));
  }

  /**
   * Categorize score
   */
  private categorize(score: number): TestabilityCategory {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'moderate';
    if (score >= 20) return 'poor';
    return 'very-poor';
  }

  /**
   * Generate improvement suggestions
   */
  private generateSuggestions(
    func: ExtractedFunction,
    factors: TestabilityFactors,
    antiPatterns: AntiPattern[]
  ): TestabilitySuggestion[] {
    const suggestions: TestabilitySuggestion[] = [];
    let priority = 1;

    // Address critical anti-patterns first
    for (const ap of antiPatterns.filter((a) => a.severity === 'critical')) {
      suggestions.push({
        priority: priority++,
        category: 'refactor',
        title: `Fix critical issue: ${ap.type}`,
        description: `${ap.description}. ${ap.fix}`,
        expectedImprovement: 15,
      });
    }

    // Address complexity
    if (factors.complexity.value < 10) {
      suggestions.push({
        priority: priority++,
        category: 'extract',
        title: 'Reduce function complexity',
        description: 'Extract conditional branches into separate, well-named functions',
        expectedImprovement: 10,
      });
    }

    // Address dependencies
    if (factors.dependencies.value < 10) {
      suggestions.push({
        priority: priority++,
        category: 'inject',
        title: 'Inject dependencies',
        description: 'Pass dependencies as parameters instead of accessing them directly',
        expectedImprovement: 8,
      });
    }

    // Address side effects
    if (factors.sideEffects.value < 10) {
      suggestions.push({
        priority: priority++,
        category: 'design',
        title: 'Isolate side effects',
        description: 'Move I/O and side effects to the edges, keep core logic pure',
        expectedImprovement: 10,
      });
    }

    // Address parameters
    if (factors.parameters.value < 7) {
      suggestions.push({
        priority: priority++,
        category: 'refactor',
        title: 'Reduce parameter count',
        description: 'Consider using a parameter object or builder pattern',
        expectedImprovement: 5,
      });
    }

    // Address coupling
    if (factors.coupling.value < 8) {
      suggestions.push({
        priority: priority++,
        category: 'design',
        title: 'Reduce coupling',
        description: 'Use interfaces and dependency injection for looser coupling',
        expectedImprovement: 7,
      });
    }

    // Address major anti-patterns
    for (const ap of antiPatterns.filter((a) => a.severity === 'major')) {
      suggestions.push({
        priority: priority++,
        category: 'refactor',
        title: `Address: ${ap.type}`,
        description: `${ap.description}. ${ap.fix}`,
        expectedImprovement: 8,
      });
    }

    return suggestions.slice(0, 5); // Return top 5 suggestions
  }

  /**
   * Generate explanation text
   */
  private generateExplanation(
    score: number,
    factors: TestabilityFactors,
    antiPatterns: AntiPattern[]
  ): string {
    const parts: string[] = [];

    parts.push(`Testability score: ${score}/100 (${this.categorize(score)})`);

    // Highlight strengths
    const strengths: string[] = [];
    if (factors.complexity.value >= 15) strengths.push('low complexity');
    if (factors.dependencies.value >= 15) strengths.push('few dependencies');
    if (factors.sideEffects.value >= 15) strengths.push('minimal side effects');
    if (factors.parameters.value >= 12) strengths.push('clean signature');

    if (strengths.length > 0) {
      parts.push(`Strengths: ${strengths.join(', ')}`);
    }

    // Highlight weaknesses
    const weaknesses: string[] = [];
    if (factors.complexity.value < 10) weaknesses.push('high complexity');
    if (factors.dependencies.value < 10) weaknesses.push('many dependencies');
    if (factors.sideEffects.value < 10) weaknesses.push('side effects');
    if (factors.coupling.value < 8) weaknesses.push('tight coupling');

    if (weaknesses.length > 0) {
      parts.push(`Areas for improvement: ${weaknesses.join(', ')}`);
    }

    // Anti-patterns
    const criticalCount = antiPatterns.filter((a) => a.severity === 'critical').length;
    const majorCount = antiPatterns.filter((a) => a.severity === 'major').length;

    if (criticalCount > 0 || majorCount > 0) {
      parts.push(
        `Anti-patterns detected: ${criticalCount} critical, ${majorCount} major`
      );
    }

    return parts.join('. ');
  }

  /**
   * Score multiple functions and rank them
   */
  scoreAll(
    functions: ExtractedFunction[]
  ): Array<{ func: ExtractedFunction; score: TestabilityScore }> {
    const results = functions.map((func) => ({
      func,
      score: this.score(func),
    }));

    // Sort by score (lowest first - most needs improvement)
    results.sort((a, b) => a.score.score - b.score.score);

    return results;
  }
}
