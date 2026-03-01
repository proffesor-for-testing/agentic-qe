/**
 * Agentic QE v3 - MCP Security: JSON Schema Validator
 * Validates all MCP tool inputs using JSON Schema (ADR-012)
 *
 * Features:
 * - Type-safe JSON Schema validation
 * - Custom validators and formats
 * - Detailed validation error messages
 * - Schema caching for performance
 */

import { createSafeRegex, isRegexSafe } from './validators/regex-safety-validator.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * JSON Schema type definitions
 */
export type JSONSchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null';

/**
 * JSON Schema format definitions
 */
export type JSONSchemaFormat =
  | 'date'
  | 'date-time'
  | 'time'
  | 'email'
  | 'uri'
  | 'uri-reference'
  | 'uuid'
  | 'hostname'
  | 'ipv4'
  | 'ipv6'
  | 'regex'
  | 'json-pointer'
  | 'relative-json-pointer'
  | 'file-path'
  | 'safe-path';

/**
 * JSON Schema definition
 */
export interface JSONSchema {
  type?: JSONSchemaType | JSONSchemaType[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean | JSONSchema;
  items?: JSONSchema | JSONSchema[];
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: JSONSchemaFormat;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  description?: string;
  title?: string;
  $ref?: string;
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  not?: JSONSchema;
  if?: JSONSchema;
  then?: JSONSchema;
  else?: JSONSchema;
}

/**
 * Validation error
 */
export interface ValidationError {
  path: string;
  message: string;
  keyword: string;
  schemaPath: string;
  params?: Record<string, unknown>;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Custom format validator
 */
export type FormatValidator = (value: string) => boolean;

/**
 * Schema validator configuration
 */
export interface SchemaValidatorConfig {
  strictMode?: boolean;
  coerceTypes?: boolean;
  removeAdditional?: boolean;
  customFormats?: Record<string, FormatValidator>;
}

// ============================================================================
// Built-in Format Validators
// ============================================================================

const BUILTIN_FORMATS: Record<string, FormatValidator> = {
  'date': (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)),

  'date-time': (value) => {
    // ISO 8601 date-time format
    const iso8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;
    return iso8601.test(value) && !isNaN(Date.parse(value));
  },

  'time': (value) => /^\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value),

  'email': (value) => {
    // RFC 5322 simplified
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
  },

  'uri': (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },

  'uri-reference': (value) => {
    // Can be relative or absolute
    if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) {
      return true;
    }
    return BUILTIN_FORMATS['uri'](value);
  },

  'uuid': (value) => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  },

  'hostname': (value) => {
    return /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(value);
  },

  'ipv4': (value) => {
    const parts = value.split('.');
    if (parts.length !== 4) return false;
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255 && part === String(num);
    });
  },

  'ipv6': (value) => {
    // Simplified IPv6 validation
    return /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::([0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^([0-9a-fA-F]{1,4}:){1,7}:$|^([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$/.test(value);
  },

  'regex': (value) => {
    // Validate pattern is both syntactically valid and safe from ReDoS
    return isRegexSafe(value).safe && createSafeRegex(value) !== null;
  },

  'json-pointer': (value) => {
    return value === '' || /^\/(?:[^~/]|~0|~1)*$/.test(value);
  },

  'relative-json-pointer': (value) => {
    return /^[0-9]+(?:#|(?:\/(?:[^~/]|~0|~1)*))?$/.test(value);
  },

  // Security-focused formats
  'file-path': (value) => {
    // Basic file path validation - alphanumeric, dots, slashes, underscores, hyphens
    return /^[a-zA-Z0-9._\/-]+$/.test(value) && value.length <= 4096;
  },

  'safe-path': (value) => {
    // Safe path - no traversal, no absolute paths starting with /
    if (value.includes('..') || value.startsWith('/')) {
      return false;
    }
    return /^[a-zA-Z0-9._\/-]+$/.test(value);
  },
};

// ============================================================================
// Schema Validator Implementation
// ============================================================================

/**
 * JSON Schema Validator for MCP tool inputs
 */
export class SchemaValidator {
  private readonly config: SchemaValidatorConfig;
  private readonly formats: Map<string, FormatValidator>;
  private readonly schemaCache: Map<string, JSONSchema>;

  constructor(config: SchemaValidatorConfig = {}) {
    this.config = {
      strictMode: true,
      coerceTypes: false,
      removeAdditional: false,
      ...config,
    };

    this.formats = new Map(Object.entries(BUILTIN_FORMATS));
    this.schemaCache = new Map();

    // Add custom formats
    if (config.customFormats) {
      for (const [name, validator] of Object.entries(config.customFormats)) {
        this.formats.set(name, validator);
      }
    }
  }

  /**
   * Register a custom format validator
   */
  registerFormat(name: string, validator: FormatValidator): void {
    this.formats.set(name, validator);
  }

  /**
   * Register a schema for caching
   */
  registerSchema(id: string, schema: JSONSchema): void {
    this.schemaCache.set(id, schema);
  }

  /**
   * Validate data against a schema
   */
  validate(data: unknown, schema: JSONSchema): ValidationResult {
    const errors: ValidationError[] = [];
    this.validateValue(data, schema, '', '#', errors);
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate and return typed result
   */
  validateTyped<T>(data: unknown, schema: JSONSchema): { valid: true; data: T } | { valid: false; errors: ValidationError[] } {
    const result = this.validate(data, schema);
    if (result.valid) {
      return { valid: true, data: data as T };
    }
    return { valid: false, errors: result.errors };
  }

  /**
   * Create a validator function for a schema
   */
  compile<T>(schema: JSONSchema): (data: unknown) => ValidationResult & { data?: T } {
    return (data: unknown) => {
      const result = this.validate(data, schema);
      if (result.valid) {
        return { ...result, data: data as T };
      }
      return result;
    };
  }

  // ============================================================================
  // Private Validation Methods
  // ============================================================================

  private validateValue(
    data: unknown,
    schema: JSONSchema,
    path: string,
    schemaPath: string,
    errors: ValidationError[]
  ): void {
    // Handle $ref
    if (schema.$ref) {
      const refSchema = this.schemaCache.get(schema.$ref);
      if (refSchema) {
        this.validateValue(data, refSchema, path, `${schemaPath}/$ref`, errors);
        return;
      } else {
        errors.push({
          path,
          message: `Cannot resolve $ref: ${schema.$ref}`,
          keyword: '$ref',
          schemaPath: `${schemaPath}/$ref`,
        });
        return;
      }
    }

    // Handle combinators
    if (schema.allOf) {
      for (let i = 0; i < schema.allOf.length; i++) {
        this.validateValue(data, schema.allOf[i], path, `${schemaPath}/allOf/${i}`, errors);
      }
    }

    if (schema.anyOf) {
      const anyOfErrors: ValidationError[][] = [];
      let anyValid = false;
      for (let i = 0; i < schema.anyOf.length; i++) {
        const subErrors: ValidationError[] = [];
        this.validateValue(data, schema.anyOf[i], path, `${schemaPath}/anyOf/${i}`, subErrors);
        if (subErrors.length === 0) {
          anyValid = true;
          break;
        }
        anyOfErrors.push(subErrors);
      }
      if (!anyValid) {
        errors.push({
          path,
          message: 'Data must match at least one schema in anyOf',
          keyword: 'anyOf',
          schemaPath: `${schemaPath}/anyOf`,
          params: { errors: anyOfErrors },
        });
      }
    }

    if (schema.oneOf) {
      const validCount = schema.oneOf.filter((subSchema, i) => {
        const subErrors: ValidationError[] = [];
        this.validateValue(data, subSchema, path, `${schemaPath}/oneOf/${i}`, subErrors);
        return subErrors.length === 0;
      }).length;

      if (validCount !== 1) {
        errors.push({
          path,
          message: `Data must match exactly one schema in oneOf (matched ${validCount})`,
          keyword: 'oneOf',
          schemaPath: `${schemaPath}/oneOf`,
        });
      }
    }

    if (schema.not) {
      const notErrors: ValidationError[] = [];
      this.validateValue(data, schema.not, path, `${schemaPath}/not`, notErrors);
      if (notErrors.length === 0) {
        errors.push({
          path,
          message: 'Data must NOT match the schema in not',
          keyword: 'not',
          schemaPath: `${schemaPath}/not`,
        });
      }
    }

    // Handle conditional schemas
    if (schema.if) {
      const ifErrors: ValidationError[] = [];
      this.validateValue(data, schema.if, path, `${schemaPath}/if`, ifErrors);
      if (ifErrors.length === 0 && schema.then) {
        this.validateValue(data, schema.then, path, `${schemaPath}/then`, errors);
      } else if (ifErrors.length > 0 && schema.else) {
        this.validateValue(data, schema.else, path, `${schemaPath}/else`, errors);
      }
    }

    // Handle const
    if (schema.const !== undefined) {
      if (!this.deepEqual(data, schema.const)) {
        errors.push({
          path,
          message: `Value must be equal to constant: ${JSON.stringify(schema.const)}`,
          keyword: 'const',
          schemaPath: `${schemaPath}/const`,
        });
      }
    }

    // Handle enum
    if (schema.enum !== undefined) {
      if (!schema.enum.some(e => this.deepEqual(data, e))) {
        errors.push({
          path,
          message: `Value must be one of: ${schema.enum.map(e => JSON.stringify(e)).join(', ')}`,
          keyword: 'enum',
          schemaPath: `${schemaPath}/enum`,
        });
      }
    }

    // Handle type validation
    if (schema.type !== undefined) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      const actualType = this.getType(data);

      if (!types.includes(actualType)) {
        // Special case: integer is also a number
        if (!(actualType === 'integer' && types.includes('number'))) {
          errors.push({
            path,
            message: `Expected type ${types.join(' or ')}, got ${actualType}`,
            keyword: 'type',
            schemaPath: `${schemaPath}/type`,
          });
          return; // Don't continue validation if type is wrong
        }
      }

      // Type-specific validations
      switch (actualType) {
        case 'string':
          this.validateString(data as string, schema, path, schemaPath, errors);
          break;
        case 'number':
        case 'integer':
          this.validateNumber(data as number, schema, path, schemaPath, errors);
          break;
        case 'array':
          this.validateArray(data as unknown[], schema, path, schemaPath, errors);
          break;
        case 'object':
          this.validateObject(data as Record<string, unknown>, schema, path, schemaPath, errors);
          break;
      }
    } else {
      // No type specified, validate based on actual type
      const actualType = this.getType(data);
      switch (actualType) {
        case 'string':
          this.validateString(data as string, schema, path, schemaPath, errors);
          break;
        case 'number':
        case 'integer':
          this.validateNumber(data as number, schema, path, schemaPath, errors);
          break;
        case 'array':
          this.validateArray(data as unknown[], schema, path, schemaPath, errors);
          break;
        case 'object':
          this.validateObject(data as Record<string, unknown>, schema, path, schemaPath, errors);
          break;
      }
    }
  }

  private validateString(
    data: string,
    schema: JSONSchema,
    path: string,
    schemaPath: string,
    errors: ValidationError[]
  ): void {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push({
        path,
        message: `String must be at least ${schema.minLength} characters`,
        keyword: 'minLength',
        schemaPath: `${schemaPath}/minLength`,
      });
    }

    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push({
        path,
        message: `String must be at most ${schema.maxLength} characters`,
        keyword: 'maxLength',
        schemaPath: `${schemaPath}/maxLength`,
      });
    }

    if (schema.pattern !== undefined) {
      const regex = createSafeRegex(schema.pattern);
      if (regex === null) {
        errors.push({
          path,
          message: `Unsafe or invalid pattern: ${schema.pattern}`,
          keyword: 'pattern',
          schemaPath: `${schemaPath}/pattern`,
        });
      } else if (!regex.test(data)) {
        errors.push({
          path,
          message: `String must match pattern: ${schema.pattern}`,
          keyword: 'pattern',
          schemaPath: `${schemaPath}/pattern`,
        });
      }
    }

    if (schema.format !== undefined) {
      const validator = this.formats.get(schema.format);
      if (validator && !validator(data)) {
        errors.push({
          path,
          message: `String must be a valid ${schema.format}`,
          keyword: 'format',
          schemaPath: `${schemaPath}/format`,
        });
      }
    }
  }

  private validateNumber(
    data: number,
    schema: JSONSchema,
    path: string,
    schemaPath: string,
    errors: ValidationError[]
  ): void {
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push({
        path,
        message: `Number must be >= ${schema.minimum}`,
        keyword: 'minimum',
        schemaPath: `${schemaPath}/minimum`,
      });
    }

    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push({
        path,
        message: `Number must be <= ${schema.maximum}`,
        keyword: 'maximum',
        schemaPath: `${schemaPath}/maximum`,
      });
    }

    if (schema.exclusiveMinimum !== undefined && data <= schema.exclusiveMinimum) {
      errors.push({
        path,
        message: `Number must be > ${schema.exclusiveMinimum}`,
        keyword: 'exclusiveMinimum',
        schemaPath: `${schemaPath}/exclusiveMinimum`,
      });
    }

    if (schema.exclusiveMaximum !== undefined && data >= schema.exclusiveMaximum) {
      errors.push({
        path,
        message: `Number must be < ${schema.exclusiveMaximum}`,
        keyword: 'exclusiveMaximum',
        schemaPath: `${schemaPath}/exclusiveMaximum`,
      });
    }
  }

  private validateArray(
    data: unknown[],
    schema: JSONSchema,
    path: string,
    schemaPath: string,
    errors: ValidationError[]
  ): void {
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push({
        path,
        message: `Array must have at least ${schema.minItems} items`,
        keyword: 'minItems',
        schemaPath: `${schemaPath}/minItems`,
      });
    }

    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      errors.push({
        path,
        message: `Array must have at most ${schema.maxItems} items`,
        keyword: 'maxItems',
        schemaPath: `${schemaPath}/maxItems`,
      });
    }

    if (schema.uniqueItems === true) {
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i++) {
        const key = JSON.stringify(data[i]);
        if (seen.has(key)) {
          errors.push({
            path,
            message: 'Array items must be unique',
            keyword: 'uniqueItems',
            schemaPath: `${schemaPath}/uniqueItems`,
          });
          break;
        }
        seen.add(key);
      }
    }

    if (schema.items !== undefined) {
      if (Array.isArray(schema.items)) {
        // Tuple validation
        for (let i = 0; i < schema.items.length; i++) {
          if (i < data.length) {
            this.validateValue(
              data[i],
              schema.items[i],
              `${path}[${i}]`,
              `${schemaPath}/items/${i}`,
              errors
            );
          }
        }
      } else {
        // Array items validation
        for (let i = 0; i < data.length; i++) {
          this.validateValue(
            data[i],
            schema.items,
            `${path}[${i}]`,
            `${schemaPath}/items`,
            errors
          );
        }
      }
    }
  }

  private validateObject(
    data: Record<string, unknown>,
    schema: JSONSchema,
    path: string,
    schemaPath: string,
    errors: ValidationError[]
  ): void {
    // Check required properties
    if (schema.required) {
      for (const required of schema.required) {
        if (!(required in data)) {
          errors.push({
            path: path ? `${path}.${required}` : required,
            message: `Required property '${required}' is missing`,
            keyword: 'required',
            schemaPath: `${schemaPath}/required`,
          });
        }
      }
    }

    // Validate properties
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in data) {
          this.validateValue(
            data[key],
            propSchema,
            path ? `${path}.${key}` : key,
            `${schemaPath}/properties/${key}`,
            errors
          );
        }
      }
    }

    // Check additional properties
    if (this.config.strictMode && schema.additionalProperties === false) {
      const definedProps = new Set(Object.keys(schema.properties || {}));
      for (const key of Object.keys(data)) {
        if (!definedProps.has(key)) {
          errors.push({
            path: path ? `${path}.${key}` : key,
            message: `Additional property '${key}' is not allowed`,
            keyword: 'additionalProperties',
            schemaPath: `${schemaPath}/additionalProperties`,
          });
        }
      }
    } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const definedProps = new Set(Object.keys(schema.properties || {}));
      for (const [key, value] of Object.entries(data)) {
        if (!definedProps.has(key)) {
          this.validateValue(
            value,
            schema.additionalProperties,
            path ? `${path}.${key}` : key,
            `${schemaPath}/additionalProperties`,
            errors
          );
        }
      }
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private getType(value: unknown): JSONSchemaType {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'number';
    }
    return typeof value as JSONSchemaType;
  }

  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, i) => this.deepEqual(item, b[i]));
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(key =>
        key in (b as object) &&
        this.deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
      );
    }

    return false;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new schema validator instance
 */
export function createSchemaValidator(config?: SchemaValidatorConfig): SchemaValidator {
  return new SchemaValidator(config);
}

/**
 * Create a strict schema validator (no additional properties allowed)
 */
export function createStrictSchemaValidator(): SchemaValidator {
  return new SchemaValidator({
    strictMode: true,
    removeAdditional: false,
    coerceTypes: false,
  });
}

// ============================================================================
// Pre-defined Schemas for MCP Tools
// ============================================================================

/**
 * Common parameter schemas
 */
export const CommonSchemas = {
  FilePath: {
    type: 'string' as const,
    format: 'safe-path' as const,
    maxLength: 4096,
    description: 'A safe file path without traversal',
  },

  Domain: {
    type: 'string' as const,
    enum: [
      'test-generation',
      'test-execution',
      'coverage-analysis',
      'quality-assessment',
      'defect-intelligence',
      'requirements-validation',
      'code-intelligence',
      'security-compliance',
      'contract-testing',
      'visual-accessibility',
      'chaos-resilience',
      'learning-optimization',
    ],
    description: 'QE domain name',
  },

  Priority: {
    type: 'string' as const,
    enum: ['p0', 'p1', 'p2', 'p3', 'low', 'medium', 'high', 'critical'],
    description: 'Task priority level',
  },

  UUID: {
    type: 'string' as const,
    format: 'uuid' as const,
    description: 'UUID identifier',
  },

  PositiveInteger: {
    type: 'integer' as const,
    minimum: 1,
    description: 'Positive integer',
  },

  Percentage: {
    type: 'number' as const,
    minimum: 0,
    maximum: 100,
    description: 'Percentage value (0-100)',
  },

  NonEmptyString: {
    type: 'string' as const,
    minLength: 1,
    maxLength: 10000,
    description: 'Non-empty string',
  },

  Email: {
    type: 'string' as const,
    format: 'email' as const,
    description: 'Email address',
  },

  URL: {
    type: 'string' as const,
    format: 'uri' as const,
    description: 'URL',
  },

  DateTime: {
    type: 'string' as const,
    format: 'date-time' as const,
    description: 'ISO 8601 date-time',
  },
};

// ============================================================================
// Default Instance
// ============================================================================

let defaultValidator: SchemaValidator | null = null;

/**
 * Get the default schema validator instance
 */
export function getSchemaValidator(): SchemaValidator {
  if (!defaultValidator) {
    defaultValidator = createSchemaValidator();
  }
  return defaultValidator;
}
