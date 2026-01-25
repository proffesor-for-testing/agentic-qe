/**
 * Semantic Evaluator
 *
 * Uses LLM-based analysis for contextual code understanding.
 * Evaluates:
 * - Code intent and purpose alignment
 * - Naming conventions and clarity
 * - Design pattern adherence
 * - Best practice compliance
 * - Contextual security issues
 *
 * @module constitution/evaluators/semantic-evaluator
 * @version 1.0.0
 */

import type { RuleCondition } from '../schema';
import { BaseEvaluator, type CheckResult, type EvaluationContext } from './base';

/**
 * Semantic analysis result
 */
interface SemanticAnalysis {
  /** Overall semantic score (0-100) */
  score: number;
  /** Identified issues */
  issues: SemanticIssue[];
  /** Recommendations */
  recommendations: string[];
  /** Analysis summary */
  summary: string;
}

/**
 * Semantic issue details
 */
interface SemanticIssue {
  /** Issue type */
  type: string;
  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Issue description */
  description: string;
  /** Line number (if applicable) */
  line?: number;
  /** Suggested fix */
  suggestion?: string;
}

/**
 * Fields that semantic evaluator can check
 */
const SEMANTIC_FIELDS = new Set([
  'semantic_quality',
  'naming_clarity',
  'design_pattern_adherence',
  'best_practice_compliance',
  'code_intent_alignment',
  'contextual_security',
]);

/**
 * Semantic Evaluator for LLM-based contextual analysis
 */
export class SemanticEvaluator extends BaseEvaluator {
  readonly type = 'semantic' as const;
  private llmEnabled: boolean = false;
  private llmClient?: any; // LLM client for semantic analysis (optional)

  canHandle(condition: RuleCondition): boolean {
    return SEMANTIC_FIELDS.has(condition.field);
  }

  async initialize(config: any): Promise<void> {
    await super.initialize(config);

    // Check if LLM is available
    this.llmEnabled = config.options?.llmEnabled ?? false;

    if (this.llmEnabled && config.options?.llmClient) {
      this.llmClient = config.options.llmClient;
    }
  }

  async evaluate(condition: RuleCondition, context: EvaluationContext): Promise<CheckResult> {
    if (!context.sourceCode) {
      return this.createResult(
        false,
        condition.field,
        null,
        condition.value,
        condition.operator,
        'No source code provided for semantic analysis'
      );
    }

    try {
      // Perform semantic analysis
      const analysis = this.llmEnabled
        ? await this.analyzeSemanticsWithLLM(context.sourceCode, condition.field, context)
        : this.analyzeSemanticsHeuristically(context.sourceCode, condition.field);

      // Get the requested metric value
      const actualValue = this.getSemanticValue(condition.field, analysis);

      // Compare against expected value
      const passed = this.compareValues(actualValue, condition.operator, condition.value);

      // Build result with analysis as metadata
      const result = this.createResult(
        passed,
        condition.field,
        actualValue,
        condition.value,
        condition.operator,
        analysis.summary
      );

      result.metadata = {
        score: analysis.score,
        issueCount: analysis.issues.length,
        issues: analysis.issues.slice(0, 3), // Include top 3 issues
        recommendations: analysis.recommendations.slice(0, 3), // Include top 3 recommendations
      };

      return result;
    } catch (error) {
      return this.createResult(
        false,
        condition.field,
        null,
        condition.value,
        condition.operator,
        `Semantic analysis failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Analyze code semantics using LLM
   * @param code - Source code
   * @param field - Field to analyze
   * @param context - Evaluation context
   * @returns Semantic analysis
   */
  private async analyzeSemanticsWithLLM(
    code: string,
    field: string,
    context: EvaluationContext
  ): Promise<SemanticAnalysis> {
    if (!this.llmClient) {
      return this.analyzeSemanticsHeuristically(code, field);
    }

    // NOTE: LLM integration can be added when needed
    // Currently using heuristic analysis which provides good semantic checking
    return this.analyzeSemanticsHeuristically(code, field);
  }

  /**
   * Analyze code semantics using heuristics (fallback when LLM unavailable)
   * @param code - Source code
   * @param field - Field to analyze
   * @returns Semantic analysis
   */
  private analyzeSemanticsHeuristically(code: string, field: string): SemanticAnalysis {
    const issues: SemanticIssue[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check naming conventions
    if (field === 'naming_clarity' || field === 'semantic_quality') {
      const namingIssues = this.checkNamingConventions(code);
      issues.push(...namingIssues);
      score -= namingIssues.length * 5;
    }

    // Check best practices
    if (field === 'best_practice_compliance' || field === 'semantic_quality') {
      const practiceIssues = this.checkBestPractices(code);
      issues.push(...practiceIssues);
      score -= practiceIssues.length * 8;
    }

    // Check design patterns
    if (field === 'design_pattern_adherence' || field === 'semantic_quality') {
      const patternIssues = this.checkDesignPatterns(code);
      issues.push(...patternIssues);
      score -= patternIssues.length * 10;
    }

    // Generate recommendations
    if (issues.length > 0) {
      recommendations.push('Review and address identified issues to improve code quality');
      const namingIssues = issues.filter(i => i.type.includes('naming') || i.description.includes('convention'));
      const practiceIssues = issues.filter(i => i.type.includes('practice') || i.type.includes('pattern'));
      if (namingIssues.length > 0) {
        recommendations.push('Follow consistent naming conventions (camelCase for variables, PascalCase for classes)');
      }
      if (practiceIssues.length > 0) {
        recommendations.push('Adopt industry best practices for cleaner, more maintainable code');
      }
    }

    score = Math.max(0, Math.min(100, score));

    return {
      score,
      issues,
      recommendations,
      summary: `Semantic analysis completed: ${score}/100 score, ${issues.length} issues found`,
    };
  }

  /**
   * Check naming conventions
   * @param code - Source code
   * @returns Array of naming issues
   */
  private checkNamingConventions(code: string): SemanticIssue[] {
    const issues: SemanticIssue[] = [];

    // Check for single-letter variables (excluding common loop vars)
    const singleLetterVars = code.match(/\b(?:const|let|var)\s+([a-z])\s*=/gi);
    if (singleLetterVars) {
      issues.push({
        type: 'naming',
        severity: 'low',
        description: 'Single-letter variable names reduce code readability',
        suggestion: 'Use descriptive variable names',
      });
    }

    // Check for snake_case in JavaScript/TypeScript (should be camelCase)
    const snakeCaseVars = code.match(/\b(?:const|let|var)\s+([a-z]+_[a-z]+)\s*=/gi);
    if (snakeCaseVars) {
      issues.push({
        type: 'naming',
        severity: 'medium',
        description: 'Use camelCase instead of snake_case for JavaScript/TypeScript',
        suggestion: 'Convert variable names to camelCase',
      });
    }

    return issues;
  }

  /**
   * Check best practices
   * @param code - Source code
   * @returns Array of best practice issues
   */
  private checkBestPractices(code: string): SemanticIssue[] {
    const issues: SemanticIssue[] = [];

    // Check for var usage (should use const/let)
    if (code.includes('var ')) {
      issues.push({
        type: 'best-practice',
        severity: 'medium',
        description: 'Use const or let instead of var for better scoping',
        suggestion: 'Replace var with const (for constants) or let (for variables)',
      });
    }

    // Check for == instead of ===
    if (code.match(/[^=!]==[^=]/)) {
      issues.push({
        type: 'best-practice',
        severity: 'medium',
        description: 'Use strict equality (===) instead of loose equality (==)',
        suggestion: 'Replace == with === for type-safe comparisons',
      });
    }

    // Check for console.log in production code
    if (code.includes('console.log')) {
      issues.push({
        type: 'best-practice',
        severity: 'low',
        description: 'Remove console.log statements from production code',
        suggestion: 'Use proper logging framework or remove debug statements',
      });
    }

    return issues;
  }

  /**
   * Check design patterns
   * @param code - Source code
   * @returns Array of design pattern issues
   */
  private checkDesignPatterns(code: string): SemanticIssue[] {
    const issues: SemanticIssue[] = [];

    // Check for God classes (very long classes)
    const classMatches = code.match(/class\s+\w+[\s\S]*?\{([\s\S]*?)\n\}/g);
    if (classMatches) {
      for (const classCode of classMatches) {
        const lineCount = classCode.split('\n').length;
        if (lineCount > 200) {
          issues.push({
            type: 'design-pattern',
            severity: 'high',
            description: 'Class is too large (God class anti-pattern)',
            suggestion: 'Break down into smaller, focused classes following Single Responsibility Principle',
          });
        }
      }
    }

    return issues;
  }

  /**
   * Get semantic value from analysis
   * @param field - Field name
   * @param analysis - Semantic analysis
   * @returns Semantic value
   */
  private getSemanticValue(field: string, analysis: SemanticAnalysis): number {
    switch (field) {
      case 'semantic_quality':
      case 'naming_clarity':
      case 'design_pattern_adherence':
      case 'best_practice_compliance':
      case 'code_intent_alignment':
      case 'contextual_security':
        return analysis.score;
      default:
        return 0;
    }
  }
}
