/**
 * Agentic QE v3 - MCP Security: Validation Orchestrator
 * Coordinates all validation strategies using the Strategy Pattern
 */

import {
  IValidationOrchestrator,
  IValidationStrategy,
  ValidationResult,
  RiskLevel,
} from './interfaces';
import { PathTraversalValidator } from './path-traversal-validator';
import { RegexSafetyValidator } from './regex-safety-validator';
import { CommandValidator } from './command-validator';
import { InputSanitizer } from './input-sanitizer';
import { CryptoValidator } from './crypto-validator';

// ============================================================================
// Validation Orchestrator Implementation
// ============================================================================

/**
 * Validation Orchestrator
 * Coordinates multiple validation strategies and provides a unified interface
 */
export class ValidationOrchestrator implements IValidationOrchestrator {
  private strategies: Map<string, IValidationStrategy> = new Map();

  /**
   * Create a new orchestrator with default validators
   */
  constructor(registerDefaults = true) {
    if (registerDefaults) {
      this.registerDefaultStrategies();
    }
  }

  /**
   * Register the default validation strategies
   */
  private registerDefaultStrategies(): void {
    this.registerStrategy(new PathTraversalValidator());
    this.registerStrategy(new RegexSafetyValidator());
    this.registerStrategy(new CommandValidator());
    // Note: InputSanitizer and CryptoValidator don't implement IValidationStrategy
    // They have their own interfaces (IInputSanitizationStrategy, ICryptoValidationStrategy)
    // They can be accessed directly through the facade
  }

  /**
   * Register a validation strategy
   */
  public registerStrategy(strategy: IValidationStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  /**
   * Get a registered strategy by name
   */
  public getStrategy(name: string): IValidationStrategy | undefined {
    return this.strategies.get(name);
  }

  /**
   * Get all registered strategy names
   */
  public getStrategyNames(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Validate using a specific strategy
   */
  public validateWith<TResult extends ValidationResult>(
    strategyName: string,
    input: unknown,
    options?: unknown
  ): TResult {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Strategy '${strategyName}' not found`);
    }
    return strategy.validate(input, options) as TResult;
  }

  /**
   * Run all registered validators on an input
   * Useful for comprehensive input validation
   */
  public validateAll(input: unknown): Map<string, ValidationResult> {
    const results = new Map<string, ValidationResult>();

    for (const [name, strategy] of this.strategies) {
      try {
        results.set(name, strategy.validate(input));
      } catch (error) {
        results.set(name, {
          valid: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          riskLevel: 'high' as RiskLevel,
        });
      }
    }

    return results;
  }

  /**
   * Check if any validator found issues
   */
  public hasIssues(results: Map<string, ValidationResult>): boolean {
    for (const result of results.values()) {
      if (!result.valid) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the highest risk level from validation results
   */
  public getHighestRisk(results: Map<string, ValidationResult>): RiskLevel {
    const riskOrder: RiskLevel[] = ['none', 'low', 'medium', 'high', 'critical'];
    let highest: RiskLevel = 'none';

    for (const result of results.values()) {
      const currentIndex = riskOrder.indexOf(result.riskLevel);
      const highestIndex = riskOrder.indexOf(highest);
      if (currentIndex > highestIndex) {
        highest = result.riskLevel;
      }
    }

    return highest;
  }

  /**
   * Get all issues from validation results
   */
  public getAllIssues(results: Map<string, ValidationResult>): Array<{
    validator: string;
    error: string;
    riskLevel: RiskLevel;
  }> {
    const issues: Array<{ validator: string; error: string; riskLevel: RiskLevel }> = [];

    for (const [name, result] of results) {
      if (!result.valid && result.error) {
        issues.push({
          validator: name,
          error: result.error,
          riskLevel: result.riskLevel,
        });
      }
    }

    return issues;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultOrchestrator: ValidationOrchestrator | null = null;

/**
 * Get the default validation orchestrator instance
 */
export function getOrchestrator(): ValidationOrchestrator {
  if (!defaultOrchestrator) {
    defaultOrchestrator = new ValidationOrchestrator();
  }
  return defaultOrchestrator;
}

/**
 * Create a new validation orchestrator
 */
export function createOrchestrator(registerDefaults = true): ValidationOrchestrator {
  return new ValidationOrchestrator(registerDefaults);
}
