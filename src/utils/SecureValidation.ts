/**
 * Secure Validation Utility
 *
 * Provides safe parameter validation without eval() or code execution.
 * Replaces string-based validators with type-safe validation functions.
 *
 * Security: NO eval(), NO Function(), NO code strings
 *
 * @module utils/SecureValidation
 */

import { Logger } from './Logger';

const logger = Logger.getInstance();

/**
 * Validation configuration types
 */
export interface ValidationConfig {
  /** Required parameter names */
  requiredParams?: string[];
  /** Type checks: param name -> expected type */
  typeChecks?: Record<string, ValidationType>;
  /** Range checks for numbers */
  rangeChecks?: Record<string, { min?: number; max?: number }>;
  /** Pattern checks using RegExp */
  patternChecks?: Record<string, RegExp>;
  /** Length checks for strings/arrays */
  lengthChecks?: Record<string, { min?: number; max?: number }>;
  /** Enum checks: param name -> allowed values */
  enumChecks?: Record<string, any[]>;
  /** Custom validator ID (references predefined validators) */
  customValidatorId?: string;
}

/**
 * Supported validation types
 */
export type ValidationType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'function'
  | 'undefined'
  | 'null';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Secure validation utility class
 *
 * @example
 * ```typescript
 * const config: ValidationConfig = {
 *   requiredParams: ['name', 'age'],
 *   typeChecks: { name: 'string', age: 'number' },
 *   rangeChecks: { age: { min: 0, max: 150 } }
 * };
 *
 * const result = SecureValidation.validate(config, { name: 'John', age: 30 });
 * // result.valid = true
 *
 * const result2 = SecureValidation.validate(config, { name: 'John', age: 200 });
 * // result2.valid = false
 * // result2.errors = ['Parameter age (200) exceeds maximum (150)']
 * ```
 */
export class SecureValidation {
  /**
   * Validate parameters against configuration
   *
   * @param config Validation configuration
   * @param params Parameters to validate
   * @returns Validation result with errors
   */
  static validate(config: ValidationConfig, params: Record<string, any>): ValidationResult {
    const errors: string[] = [];

    try {
      // 1. Required parameters check
      if (config.requiredParams) {
        for (const paramName of config.requiredParams) {
          if (params[paramName] === undefined) {
            errors.push(`Required parameter '${paramName}' is missing`);
          }
        }
      }

      // 2. Type checks
      if (config.typeChecks) {
        for (const [paramName, expectedType] of Object.entries(config.typeChecks)) {
          if (params[paramName] !== undefined) {
            if (!this.validateType(params[paramName], expectedType)) {
              errors.push(
                `Parameter '${paramName}' has invalid type (expected ${expectedType}, got ${typeof params[paramName]})`
              );
            }
          }
        }
      }

      // 3. Range checks (for numbers)
      if (config.rangeChecks) {
        for (const [paramName, range] of Object.entries(config.rangeChecks)) {
          const value = params[paramName];
          if (value !== undefined && typeof value === 'number') {
            if (range.min !== undefined && value < range.min) {
              errors.push(`Parameter '${paramName}' (${value}) is below minimum (${range.min})`);
            }
            if (range.max !== undefined && value > range.max) {
              errors.push(`Parameter '${paramName}' (${value}) exceeds maximum (${range.max})`);
            }
          }
        }
      }

      // 4. Pattern checks (RegExp)
      if (config.patternChecks) {
        for (const [paramName, pattern] of Object.entries(config.patternChecks)) {
          const value = params[paramName];
          if (value !== undefined && typeof value === 'string') {
            if (!pattern.test(value)) {
              errors.push(`Parameter '${paramName}' does not match required pattern`);
            }
          }
        }
      }

      // 5. Length checks (for strings/arrays)
      if (config.lengthChecks) {
        for (const [paramName, length] of Object.entries(config.lengthChecks)) {
          const value = params[paramName];
          if (value !== undefined) {
            const len = typeof value === 'string' || Array.isArray(value) ? value.length : -1;
            if (len >= 0) {
              if (length.min !== undefined && len < length.min) {
                errors.push(`Parameter '${paramName}' length (${len}) is below minimum (${length.min})`);
              }
              if (length.max !== undefined && len > length.max) {
                errors.push(`Parameter '${paramName}' length (${len}) exceeds maximum (${length.max})`);
              }
            }
          }
        }
      }

      // 6. Enum checks
      if (config.enumChecks) {
        for (const [paramName, allowedValues] of Object.entries(config.enumChecks)) {
          const value = params[paramName];
          if (value !== undefined) {
            if (!allowedValues.includes(value)) {
              errors.push(
                `Parameter '${paramName}' has invalid value (must be one of: ${allowedValues.join(', ')})`
              );
            }
          }
        }
      }

      // 7. Custom validator (predefined only)
      if (config.customValidatorId) {
        const customErrors = this.runCustomValidator(config.customValidatorId, params);
        errors.push(...customErrors);
      }

    } catch (error) {
      logger.error('Validation error:', error);
      errors.push(`Validation failed: ${(error as Error).message}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate type of a value
   *
   * @param value Value to check
   * @param expectedType Expected type
   * @returns True if type matches
   */
  private static validateType(value: any, expectedType: ValidationType): boolean {
    if (expectedType === 'null') {
      return value === null;
    }
    if (expectedType === 'array') {
      return Array.isArray(value);
    }
    return typeof value === expectedType;
  }

  /**
   * Run predefined custom validator
   *
   * Security: Only predefined validators allowed, no dynamic code execution
   *
   * @param validatorId Validator identifier
   * @param params Parameters to validate
   * @returns Array of error messages
   */
  private static runCustomValidator(validatorId: string, params: Record<string, any>): string[] {
    const errors: string[] = [];

    // Whitelist of allowed custom validators
    switch (validatorId) {
      case 'valid-identifier':
        // JavaScript identifier validation
        for (const [key, value] of Object.entries(params)) {
          if (typeof value === 'string') {
            if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value)) {
              errors.push(`Parameter '${key}' is not a valid JavaScript identifier`);
            }
          }
        }
        break;

      case 'no-prototype-pollution':
        // Check for prototype pollution attempts
        const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
        for (const key of Object.keys(params)) {
          if (dangerousKeys.includes(key)) {
            errors.push(`Dangerous key '${key}' detected (prototype pollution attempt)`);
          }
        }
        break;

      case 'safe-file-path':
        // Validate file paths don't contain traversal
        for (const [key, value] of Object.entries(params)) {
          if (typeof value === 'string') {
            if (value.includes('..') || value.includes('~')) {
              errors.push(`Parameter '${key}' contains unsafe path traversal`);
            }
          }
        }
        break;

      case 'no-shell-metacharacters':
        // Check for shell metacharacters
        const shellMetachars = /[;&|`$<>(){}[\]!]/;
        for (const [key, value] of Object.entries(params)) {
          if (typeof value === 'string') {
            if (shellMetachars.test(value)) {
              errors.push(`Parameter '${key}' contains shell metacharacters`);
            }
          }
        }
        break;

      default:
        errors.push(`Unknown custom validator: ${validatorId}`);
    }

    return errors;
  }

  /**
   * Create validation config for required parameters
   *
   * @param paramNames Required parameter names
   * @returns Validation configuration
   */
  static createRequiredParamsConfig(paramNames: string[]): ValidationConfig {
    return {
      requiredParams: paramNames
    };
  }

  /**
   * Create validation config for type checking
   *
   * @param typeMap Parameter name -> type mapping
   * @returns Validation configuration
   */
  static createTypeCheckConfig(typeMap: Record<string, ValidationType>): ValidationConfig {
    return {
      typeChecks: typeMap
    };
  }

  /**
   * Validate without throwing exceptions
   *
   * @param config Validation configuration
   * @param params Parameters to validate
   * @returns True if valid, false otherwise
   */
  static isValid(config: ValidationConfig, params: Record<string, any>): boolean {
    const result = this.validate(config, params);
    return result.valid;
  }

  /**
   * Validate and throw on error
   *
   * @param config Validation configuration
   * @param params Parameters to validate
   * @throws ValidationError if validation fails
   */
  static validateOrThrow(config: ValidationConfig, params: Record<string, any>): void {
    const result = this.validate(config, params);
    if (!result.valid) {
      throw new ValidationError('Validation failed', result.errors);
    }
  }
}

/**
 * Validation error class
 */
export class ValidationError extends Error {
  constructor(message: string, public errors: string[]) {
    super(`${message}: ${errors.join(', ')}`);
    this.name = 'ValidationError';
  }
}
