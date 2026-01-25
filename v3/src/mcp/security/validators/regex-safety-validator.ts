/**
 * Agentic QE v3 - MCP Security: Regex Safety Validator
 * Implements the Strategy Pattern for ReDoS prevention
 */

import {
  IRegexValidationStrategy,
  RegexSafetyResult,
  RegexValidationOptions,
  RiskLevel,
  ValidationResult,
} from './interfaces';

// ============================================================================
// Constants
// ============================================================================

/**
 * Patterns that can cause ReDoS (Regular Expression Denial of Service)
 */
export const REDOS_PATTERNS = [
  /\(\.\*\)\+/,              // (.*)+
  /\(\.\+\)\+/,              // (.+)+
  /\([^)]*\?\)\+/,           // (...?)+
  /\([^)]*\*\)\+/,           // (...*)+
  /\([^)]*\+\)\+/,           // (...+)+
  /\(\[.*?\]\+\)\+/,         // ([...]+)+
  /\(\[.*?\]\*\)\+/,         // ([...]*)+
  /\(\[.*?\]\?\)\+/,         // ([...]?)+
  /\(\[.*?\]\*\)\*/,         // ([...]*)*
  /\.\*\.\*/,                // .*.*
  /\.\+\.\+/,                // .+.+
  /\(\.\|\.\)/,              // (.|.)
];

/**
 * Maximum allowed regex complexity (nested quantifiers)
 */
const MAX_REGEX_COMPLEXITY = 3;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Count nested quantifier depth in a regex pattern
 */
export function countQuantifierNesting(pattern: string): number {
  let maxDepth = 0;
  let currentDepth = 0;
  let inGroup = false;
  let escaped = false;

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '(') {
      inGroup = true;
      continue;
    }

    if (char === ')') {
      inGroup = false;
      // Check if followed by quantifier
      const next = pattern[i + 1];
      if (next === '*' || next === '+' || next === '?' || next === '{') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      }
      continue;
    }

    if ((char === '*' || char === '+' || char === '?') && !inGroup) {
      currentDepth = 1;
      maxDepth = Math.max(maxDepth, currentDepth);
    }
  }

  return maxDepth;
}

/**
 * Check for exponential backtracking potential
 */
export function hasExponentialBacktracking(pattern: string): boolean {
  // Simplified check for common exponential patterns
  const dangerous = [
    /\(\[^\\]*\]\+\)\+/,     // ([...]+)+
    /\(\[^\\]*\]\*\)\*/,     // ([...]*)*
    /\([^)]+\|[^)]+\)\+/,    // (a|b)+
    /\(\.\*\)[*+]/,          // (.*)+, (.*)*
    /\(\.\+\)[*+]/,          // (.+)+, (.+)*
  ];

  return dangerous.some(d => d.test(pattern));
}

// ============================================================================
// Regex Safety Validator Implementation
// ============================================================================

/**
 * Regex Safety Validator Strategy
 * Validates regex patterns to prevent ReDoS attacks
 */
export class RegexSafetyValidator implements IRegexValidationStrategy {
  public readonly name = 'regex-safety';

  private maxComplexity: number;

  constructor(maxComplexity = MAX_REGEX_COMPLEXITY) {
    this.maxComplexity = maxComplexity;
  }

  /**
   * Get the primary risk level this validator addresses
   */
  public getRiskLevel(): RiskLevel {
    return 'high';
  }

  /**
   * Validate a regex pattern (IValidationStrategy interface)
   */
  public validate(
    pattern: string,
    options: RegexValidationOptions = {}
  ): ValidationResult {
    const { maxLength = 10000, maxComplexity = this.maxComplexity } = options;

    if (pattern.length > maxLength) {
      return {
        valid: false,
        error: `Pattern exceeds maximum length of ${maxLength}`,
        riskLevel: 'medium',
      };
    }

    const result = this.isRegexSafe(pattern, maxComplexity);
    return {
      valid: result.safe,
      error: result.error,
      riskLevel: result.safe ? 'none' : 'high',
    };
  }

  /**
   * Check if a regex pattern is safe from ReDoS
   */
  public isRegexSafe(pattern: string, maxComplexity = this.maxComplexity): RegexSafetyResult {
    const riskyPatterns: string[] = [];

    // Check for known ReDoS patterns
    for (const redosPattern of REDOS_PATTERNS) {
      if (redosPattern.test(pattern)) {
        riskyPatterns.push(redosPattern.source);
      }
    }

    // Check nesting depth of quantifiers
    const quantifierDepth = countQuantifierNesting(pattern);
    if (quantifierDepth > maxComplexity) {
      riskyPatterns.push(`Quantifier nesting depth: ${quantifierDepth} (max: ${maxComplexity})`);
    }

    // Check for exponential backtracking potential
    if (hasExponentialBacktracking(pattern)) {
      riskyPatterns.push('Exponential backtracking potential detected');
    }

    return {
      safe: riskyPatterns.length === 0,
      pattern,
      escapedPattern: this.escapeRegex(pattern),
      riskyPatterns,
      error: riskyPatterns.length > 0 ? 'Pattern may cause ReDoS' : undefined,
    };
  }

  /**
   * Escape special regex characters in a string
   */
  public escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Create a safe regex with validation
   */
  public createSafeRegex(
    pattern: string,
    flags?: string,
    maxLength = 10000
  ): RegExp | null {
    const safety = this.isRegexSafe(pattern);

    if (!safety.safe) {
      return null;
    }

    if (pattern.length > maxLength) {
      return null;
    }

    try {
      return new RegExp(pattern, flags);
    } catch {
      return null;
    }
  }
}

// ============================================================================
// Standalone Functions (for backward compatibility)
// ============================================================================

const defaultValidator = new RegexSafetyValidator();

export const isRegexSafe = (pattern: string): RegexSafetyResult =>
  defaultValidator.isRegexSafe(pattern);

export const escapeRegex = (str: string): string =>
  defaultValidator.escapeRegex(str);

export const createSafeRegex = (
  pattern: string,
  flags?: string,
  maxLength?: number
): RegExp | null => defaultValidator.createSafeRegex(pattern, flags, maxLength);
