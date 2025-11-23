/**
 * Pattern Evaluator
 *
 * Uses regex patterns to detect code issues like:
 * - Hardcoded secrets (API keys, passwords, tokens)
 * - SQL injection vulnerabilities
 * - XSS vulnerabilities
 * - Other security and quality patterns
 *
 * @module constitution/evaluators/pattern-evaluator
 * @version 1.0.0
 */

import type { RuleCondition } from '../schema';
import { BaseEvaluator, type CheckResult, type EvaluationContext } from './base';

/**
 * Pattern detection result
 */
interface PatternMatch {
  /** Pattern that was matched */
  pattern: string;
  /** Line number of match */
  line: number;
  /** Matched text */
  match: string;
  /** Context around the match */
  context?: string;
}

/**
 * Security and quality patterns
 */
const PATTERNS = {
  // Hardcoded secrets
  hardcodedSecrets: [
    /(?:password|passwd|pwd)\s*[=:]\s*["'](?![\s*])[^"'\s]{8,}["']/gi,
    /(?:api[_-]?key|apikey)\s*[=:]\s*["'][^"'\s]{16,}["']/gi,
    /(?:secret|token)\s*[=:]\s*["'][^"'\s]{16,}["']/gi,
    /(?:access[_-]?key)\s*[=:]\s*["'][^"'\s]{16,}["']/gi,
    /(?:private[_-]?key)\s*[=:]\s*["'][^"'\s]{16,}["']/gi,
    /\b[A-Za-z0-9]{32,}\b/g, // Long alphanumeric strings (potential tokens)
  ],

  // SQL injection patterns
  sqlInjection: [
    /['"]\s*\+\s*\w+\s*\+\s*["']/g, // String concatenation in SQL
    /execute\s*\(\s*["']SELECT/gi,
    /execute\s*\(\s*["']INSERT/gi,
    /execute\s*\(\s*["']UPDATE/gi,
    /execute\s*\(\s*["']DELETE/gi,
    /query\s*\(\s*["'].*\s*\+/gi, // Query with concatenation
  ],

  // XSS patterns
  xss: [
    /innerHTML\s*=\s*[^;]+/g,
    /document\.write\s*\(/g,
    /dangerouslySetInnerHTML/g,
    /eval\s*\(/g,
    /setTimeout\s*\(\s*["']/g,
    /setInterval\s*\(\s*["']/g,
  ],

  // Error handling issues
  unhandledErrors: [
    /new\s+Promise\s*\(\s*\([^)]*\)\s*=>\s*\{[^}]*\}/g, // Promise without catch
    /async\s+function[^{]*\{(?!.*try).*await/gs, // Async without try-catch
  ],

  // Documentation issues
  undocumented: [
    /export\s+(?:async\s+)?function\s+\w+\s*\([^)]*\)\s*(?:\:\s*[^{]+)?\s*\{(?!\s*\/\*\*)/g,
    /export\s+class\s+\w+(?!\s*{[\s\S]*?\/\*\*)/g,
  ],
};

/**
 * Fields that pattern evaluator can check
 */
const PATTERN_FIELDS = new Set([
  'hardcoded_secrets_detected',
  'potential_sql_injection',
  'potential_xss',
  'unhandled_errors',
  'documentation_exists',
]);

/**
 * Pattern Evaluator for regex-based code analysis
 */
export class PatternEvaluator extends BaseEvaluator {
  readonly type = 'pattern' as const;

  canHandle(condition: RuleCondition): boolean {
    return PATTERN_FIELDS.has(condition.field);
  }

  async evaluate(condition: RuleCondition, context: EvaluationContext): Promise<CheckResult> {
    if (!context.sourceCode) {
      return this.createResult(
        false,
        condition.field,
        null,
        condition.value,
        condition.operator,
        'No source code provided for pattern analysis'
      );
    }

    try {
      // Detect patterns based on field
      const matches = this.detectPatterns(condition.field, context.sourceCode);

      // Determine actual value based on field type
      const actualValue = this.getActualValue(condition.field, matches);

      // Compare against expected value
      const passed = this.compareValues(actualValue, condition.operator, condition.value);

      // Build result with pattern matches as metadata
      const result = this.createResult(
        passed,
        condition.field,
        actualValue,
        condition.value,
        condition.operator
      );

      if (matches.length > 0) {
        result.metadata = {
          matchCount: matches.length,
          matches: matches.slice(0, 5), // Include first 5 matches
        };
      }

      return result;
    } catch (error) {
      return this.createResult(
        false,
        condition.field,
        null,
        condition.value,
        condition.operator,
        `Pattern analysis failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Detect patterns in source code
   * @param field - Field to check
   * @param sourceCode - Source code to analyze
   * @returns Array of pattern matches
   */
  private detectPatterns(field: string, sourceCode: string): PatternMatch[] {
    const patterns = this.getPatternsForField(field);
    const matches: PatternMatch[] = [];
    const lines = sourceCode.split('\n');

    for (const pattern of patterns) {
      lines.forEach((line, index) => {
        const regex = new RegExp(pattern.source, pattern.flags);
        const lineMatches = line.matchAll(regex);

        for (const match of lineMatches) {
          matches.push({
            pattern: pattern.source,
            line: index + 1,
            match: match[0],
            context: this.getContext(lines, index),
          });
        }
      });
    }

    return matches;
  }

  /**
   * Get patterns for a specific field
   * @param field - Field name
   * @returns Array of regex patterns
   */
  private getPatternsForField(field: string): RegExp[] {
    switch (field) {
      case 'hardcoded_secrets_detected':
        return PATTERNS.hardcodedSecrets;
      case 'potential_sql_injection':
        return PATTERNS.sqlInjection;
      case 'potential_xss':
        return PATTERNS.xss;
      case 'unhandled_errors':
        return PATTERNS.unhandledErrors;
      case 'documentation_exists':
        return PATTERNS.undocumented;
      default:
        return [];
    }
  }

  /**
   * Get actual value based on field type
   * @param field - Field name
   * @param matches - Pattern matches
   * @returns Actual value for comparison
   */
  private getActualValue(field: string, matches: PatternMatch[]): boolean | number {
    // For boolean fields (detected/exists), return true if matches found
    if (field.endsWith('_detected') || field === 'documentation_exists') {
      // For documentation_exists, invert the logic (matches = undocumented code)
      return field === 'documentation_exists' ? matches.length === 0 : matches.length > 0;
    }

    // For other fields, return count
    return matches.length;
  }

  /**
   * Get context lines around a match
   * @param lines - All source lines
   * @param lineIndex - Index of matched line
   * @param contextLines - Number of context lines
   * @returns Context string
   */
  private getContext(lines: string[], lineIndex: number, contextLines: number = 2): string {
    const start = Math.max(0, lineIndex - contextLines);
    const end = Math.min(lines.length, lineIndex + contextLines + 1);
    return lines.slice(start, end).join('\n');
  }
}

/**
 * Custom pattern evaluator for user-defined patterns
 */
export class CustomPatternEvaluator extends BaseEvaluator {
  readonly type = 'pattern' as const;
  private customPatterns = new Map<string, RegExp[]>();

  /**
   * Register a custom pattern
   * @param field - Field name
   * @param patterns - Regex patterns
   */
  registerPattern(field: string, patterns: RegExp[]): void {
    this.customPatterns.set(field, patterns);
  }

  canHandle(condition: RuleCondition): boolean {
    return this.customPatterns.has(condition.field);
  }

  async evaluate(condition: RuleCondition, context: EvaluationContext): Promise<CheckResult> {
    if (!context.sourceCode) {
      return this.createResult(
        false,
        condition.field,
        null,
        condition.value,
        condition.operator,
        'No source code provided for pattern analysis'
      );
    }

    const patterns = this.customPatterns.get(condition.field) || [];
    const lines = context.sourceCode.split('\n');
    let matchCount = 0;

    for (const pattern of patterns) {
      for (const line of lines) {
        if (pattern.test(line)) {
          matchCount++;
        }
      }
    }

    const actualValue = matchCount > 0;
    const passed = this.compareValues(actualValue, condition.operator, condition.value);

    return this.createResult(
      passed,
      condition.field,
      actualValue,
      condition.value,
      condition.operator
    );
  }
}
