/**
 * Agentic QE v3 - Schema Validation Service
 * Implements ISchemaValidationService for schema validation (JSON Schema, OpenAPI, GraphQL)
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types/index.js';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import type {
  ISchemaValidationService,
  SchemaDefinition,
  SchemaValidationResult,
  SchemaError,
  GraphQLValidationResult,
  GraphQLError,
  SchemaComparisonResult,
  SchemaModification,
} from '../interfaces.js';

/**
 * Configuration for the schema validator
 */
export interface SchemaValidatorConfig {
  strictMode: boolean;
  allowAdditionalProperties: boolean;
  maxRecursionDepth: number;
  inferenceMinSamples: number;
}

const DEFAULT_CONFIG: SchemaValidatorConfig = {
  strictMode: false,
  allowAdditionalProperties: true,
  maxRecursionDepth: 10,
  inferenceMinSamples: 3,
};

/**
 * Schema Validation Service Implementation
 * Validates data against various schema formats
 */
export class SchemaValidatorService implements ISchemaValidationService {
  private readonly config: SchemaValidatorConfig;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<SchemaValidatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate JSON Schema
   */
  async validateJsonSchema(
    data: unknown,
    schema: object
  ): Promise<Result<SchemaValidationResult>> {
    try {
      const errors: SchemaError[] = [];

      this.validateValue(data, schema as Record<string, unknown>, '', errors, 0);

      const result: SchemaValidationResult = {
        isValid: errors.length === 0,
        errors,
      };

      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Validate GraphQL schema
   */
  async validateGraphQLSchema(schema: string): Promise<Result<GraphQLValidationResult>> {
    try {
      const errors: GraphQLError[] = [];
      let typeCount = 0;
      let queryCount = 0;
      let mutationCount = 0;

      // GraphQL schema parsing and validation using line-based analysis
      const lines = schema.split('\n');
      let inType = false;
      let inQuery = false;
      let inMutation = false;
      let braceDepth = 0;

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum].trim();

        // Skip comments and empty lines
        if (line.startsWith('#') || line === '') continue;

        // Detect type definitions
        if (line.startsWith('type ')) {
          const typeName = line.split(/\s+/)[1]?.replace(/{.*/, '').trim();

          if (typeName === 'Query') {
            inQuery = true;
          } else if (typeName === 'Mutation') {
            inMutation = true;
          } else {
            typeCount++;
          }
          inType = true;
        }

        // Track brace depth
        braceDepth += (line.match(/{/g) || []).length;
        braceDepth -= (line.match(/}/g) || []).length;

        // Count fields in Query/Mutation
        if (inQuery && line.includes(':') && !line.startsWith('type')) {
          queryCount++;
        }
        if (inMutation && line.includes(':') && !line.startsWith('type')) {
          mutationCount++;
        }

        // Reset when type ends
        if (braceDepth === 0 && inType) {
          inType = false;
          inQuery = false;
          inMutation = false;
        }

        // Basic syntax validation
        if (line.includes('::')) {
          errors.push({
            message: 'Invalid double colon in type definition',
            locations: [{ line: lineNum + 1, column: line.indexOf('::') + 1 }],
          });
        }
      }

      // Check for unbalanced braces
      if (braceDepth !== 0) {
        errors.push({
          message: 'Unbalanced braces in schema',
          locations: [{ line: lines.length, column: 1 }],
        });
      }

      // Check for required types
      if (!schema.includes('type Query') && !schema.includes('schema {')) {
        errors.push({
          message: 'GraphQL schema must have a Query type or schema definition',
          locations: [{ line: 1, column: 1 }],
        });
      }

      return ok({
        isValid: errors.length === 0,
        errors,
        typeCount,
        queryCount,
        mutationCount,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Compare schemas for compatibility
   */
  async compareSchemas(
    oldSchema: SchemaDefinition,
    newSchema: SchemaDefinition
  ): Promise<Result<SchemaComparisonResult>> {
    try {
      const additions: string[] = [];
      const removals: string[] = [];
      const modifications: SchemaModification[] = [];

      // Only compare same type schemas
      if (oldSchema.type !== newSchema.type) {
        return ok({
          isCompatible: false,
          additions: [],
          removals: [],
          modifications: [
            {
              path: 'type',
              oldType: oldSchema.type,
              newType: newSchema.type,
              isBreaking: true,
            },
          ],
        });
      }

      switch (oldSchema.type) {
        case 'json-schema':
        case 'openapi':
          this.compareJsonSchemas(
            oldSchema.content,
            newSchema.content,
            additions,
            removals,
            modifications
          );
          break;

        case 'graphql':
          this.compareGraphQLSchemas(
            oldSchema.content,
            newSchema.content,
            additions,
            removals,
            modifications
          );
          break;

        case 'protobuf':
          this.compareProtobufSchemas(
            oldSchema.content,
            newSchema.content,
            additions,
            removals,
            modifications
          );
          break;

        case 'avro':
          this.compareAvroSchemas(
            oldSchema.content,
            newSchema.content,
            additions,
            removals,
            modifications
          );
          break;
      }

      const hasBreakingChanges = modifications.some((m) => m.isBreaking) || removals.length > 0;

      // Store comparison result
      await this.storeComparisonResult(oldSchema, newSchema, {
        isCompatible: !hasBreakingChanges,
        additions,
        removals,
        modifications,
      });

      return ok({
        isCompatible: !hasBreakingChanges,
        additions,
        removals,
        modifications,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate schema from sample data
   */
  async inferSchema(samples: unknown[]): Promise<Result<SchemaDefinition>> {
    try {
      if (samples.length === 0) {
        return err(new Error('At least one sample is required for schema inference'));
      }

      if (samples.length < this.config.inferenceMinSamples) {
        // Warning: fewer samples may lead to incomplete schema
      }

      const inferredSchema = this.inferFromSamples(samples);

      const schemaDefinition: SchemaDefinition = {
        id: `inferred-${uuidv4().slice(0, 8)}`,
        name: 'InferredSchema',
        type: 'json-schema',
        content: JSON.stringify(inferredSchema, null, 2),
      };

      // Store inferred schema
      await this.memory.set(
        `contract-testing:schema:${schemaDefinition.id}`,
        schemaDefinition,
        { namespace: 'contract-testing' }
      );

      return ok(schemaDefinition);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Private Validation Methods
  // ============================================================================

  private validateValue(
    value: unknown,
    schema: Record<string, unknown>,
    path: string,
    errors: SchemaError[],
    depth: number
  ): void {
    if (depth > this.config.maxRecursionDepth) {
      errors.push({
        path,
        keyword: 'maxDepth',
        message: 'Maximum recursion depth exceeded',
        params: { maxDepth: this.config.maxRecursionDepth },
      });
      return;
    }

    // Handle nullable
    if (value === null) {
      if (schema.nullable === true || schema.type === 'null') {
        return;
      }
      if (this.config.strictMode) {
        errors.push({
          path,
          keyword: 'type',
          message: 'Value cannot be null',
          params: {},
        });
      }
      return;
    }

    const schemaType = schema.type as string | string[] | undefined;

    // Handle oneOf, anyOf, allOf
    if (schema.oneOf) {
      this.validateOneOf(value, schema.oneOf as Record<string, unknown>[], path, errors, depth);
      return;
    }
    if (schema.anyOf) {
      this.validateAnyOf(value, schema.anyOf as Record<string, unknown>[], path, errors, depth);
      return;
    }
    if (schema.allOf) {
      this.validateAllOf(value, schema.allOf as Record<string, unknown>[], path, errors, depth);
      return;
    }

    // Validate type
    if (schemaType) {
      const types = Array.isArray(schemaType) ? schemaType : [schemaType];
      const actualType = this.getJsonType(value);

      if (!types.some((t) => this.typesMatch(actualType, t))) {
        errors.push({
          path,
          keyword: 'type',
          message: `Expected type '${types.join(' | ')}' but got '${actualType}'`,
          params: { expectedType: types, actualType },
        });
        return;
      }
    }

    // Type-specific validation
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      this.validateObject(value as Record<string, unknown>, schema, path, errors, depth);
    } else if (Array.isArray(value)) {
      this.validateArray(value, schema, path, errors, depth);
    } else if (typeof value === 'string') {
      this.validateString(value, schema, path, errors);
    } else if (typeof value === 'number') {
      this.validateNumber(value, schema, path, errors);
    }

    // Validate enum
    if (schema.enum) {
      const enumValues = schema.enum as unknown[];
      if (!enumValues.includes(value)) {
        errors.push({
          path,
          keyword: 'enum',
          message: `Value must be one of: ${enumValues.map((v) => JSON.stringify(v)).join(', ')}`,
          params: { allowedValues: enumValues },
        });
      }
    }

    // Validate const
    if ('const' in schema) {
      if (value !== schema.const) {
        errors.push({
          path,
          keyword: 'const',
          message: `Value must be ${JSON.stringify(schema.const)}`,
          params: { expected: schema.const },
        });
      }
    }
  }

  private validateObject(
    value: Record<string, unknown>,
    schema: Record<string, unknown>,
    path: string,
    errors: SchemaError[],
    depth: number
  ): void {
    const properties = (schema.properties as Record<string, Record<string, unknown>>) || {};
    const required = (schema.required as string[]) || [];
    const additionalProperties = schema.additionalProperties;

    // Check required properties
    for (const prop of required) {
      if (!(prop in value)) {
        errors.push({
          path: path ? `${path}.${prop}` : prop,
          keyword: 'required',
          message: `Required property '${prop}' is missing`,
          params: { missingProperty: prop },
        });
      }
    }

    // Validate each property
    for (const [prop, propValue] of Object.entries(value)) {
      const propPath = path ? `${path}.${prop}` : prop;

      if (prop in properties) {
        this.validateValue(propValue, properties[prop], propPath, errors, depth + 1);
      } else if (this.config.strictMode && additionalProperties === false) {
        errors.push({
          path: propPath,
          keyword: 'additionalProperties',
          message: `Property '${prop}' is not allowed`,
          params: { additionalProperty: prop },
        });
      } else if (typeof additionalProperties === 'object') {
        this.validateValue(
          propValue,
          additionalProperties as Record<string, unknown>,
          propPath,
          errors,
          depth + 1
        );
      }
    }

    // Validate minProperties / maxProperties
    const propCount = Object.keys(value).length;
    if (typeof schema.minProperties === 'number' && propCount < schema.minProperties) {
      errors.push({
        path,
        keyword: 'minProperties',
        message: `Object must have at least ${schema.minProperties} properties`,
        params: { limit: schema.minProperties, actual: propCount },
      });
    }
    if (typeof schema.maxProperties === 'number' && propCount > schema.maxProperties) {
      errors.push({
        path,
        keyword: 'maxProperties',
        message: `Object must have at most ${schema.maxProperties} properties`,
        params: { limit: schema.maxProperties, actual: propCount },
      });
    }
  }

  private validateArray(
    value: unknown[],
    schema: Record<string, unknown>,
    path: string,
    errors: SchemaError[],
    depth: number
  ): void {
    const items = schema.items as Record<string, unknown> | undefined;

    // Validate items
    if (items) {
      for (let i = 0; i < value.length; i++) {
        this.validateValue(value[i], items, `${path}[${i}]`, errors, depth + 1);
      }
    }

    // Validate minItems / maxItems
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      errors.push({
        path,
        keyword: 'minItems',
        message: `Array must have at least ${schema.minItems} items`,
        params: { limit: schema.minItems, actual: value.length },
      });
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      errors.push({
        path,
        keyword: 'maxItems',
        message: `Array must have at most ${schema.maxItems} items`,
        params: { limit: schema.maxItems, actual: value.length },
      });
    }

    // Validate uniqueItems
    if (schema.uniqueItems === true) {
      const seen = new Set<string>();
      for (let i = 0; i < value.length; i++) {
        const serialized = JSON.stringify(value[i]);
        if (seen.has(serialized)) {
          errors.push({
            path: `${path}[${i}]`,
            keyword: 'uniqueItems',
            message: 'Array items must be unique',
            params: { duplicateIndex: i },
          });
        }
        seen.add(serialized);
      }
    }
  }

  private validateString(
    value: string,
    schema: Record<string, unknown>,
    path: string,
    errors: SchemaError[]
  ): void {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push({
        path,
        keyword: 'minLength',
        message: `String must be at least ${schema.minLength} characters`,
        params: { limit: schema.minLength, actual: value.length },
      });
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      errors.push({
        path,
        keyword: 'maxLength',
        message: `String must be at most ${schema.maxLength} characters`,
        params: { limit: schema.maxLength, actual: value.length },
      });
    }
    if (typeof schema.pattern === 'string') {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        errors.push({
          path,
          keyword: 'pattern',
          message: `String must match pattern '${schema.pattern}'`,
          params: { pattern: schema.pattern },
        });
      }
    }

    // Validate format
    if (typeof schema.format === 'string') {
      this.validateFormat(value, schema.format, path, errors);
    }
  }

  private validateNumber(
    value: number,
    schema: Record<string, unknown>,
    path: string,
    errors: SchemaError[]
  ): void {
    if (typeof schema.minimum === 'number') {
      if (schema.exclusiveMinimum === true) {
        if (value <= schema.minimum) {
          errors.push({
            path,
            keyword: 'exclusiveMinimum',
            message: `Number must be greater than ${schema.minimum}`,
            params: { limit: schema.minimum, actual: value },
          });
        }
      } else if (value < schema.minimum) {
        errors.push({
          path,
          keyword: 'minimum',
          message: `Number must be at least ${schema.minimum}`,
          params: { limit: schema.minimum, actual: value },
        });
      }
    }

    if (typeof schema.maximum === 'number') {
      if (schema.exclusiveMaximum === true) {
        if (value >= schema.maximum) {
          errors.push({
            path,
            keyword: 'exclusiveMaximum',
            message: `Number must be less than ${schema.maximum}`,
            params: { limit: schema.maximum, actual: value },
          });
        }
      } else if (value > schema.maximum) {
        errors.push({
          path,
          keyword: 'maximum',
          message: `Number must be at most ${schema.maximum}`,
          params: { limit: schema.maximum, actual: value },
        });
      }
    }

    if (typeof schema.multipleOf === 'number') {
      const remainder = value % schema.multipleOf;
      if (Math.abs(remainder) > 1e-10) {
        errors.push({
          path,
          keyword: 'multipleOf',
          message: `Number must be a multiple of ${schema.multipleOf}`,
          params: { multipleOf: schema.multipleOf, actual: value },
        });
      }
    }
  }

  private validateFormat(
    value: string,
    format: string,
    path: string,
    errors: SchemaError[]
  ): void {
    let isValid = true;

    switch (format) {
      case 'email':
        isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        break;
      case 'uri':
      case 'url':
        try {
          new URL(value);
        } catch {
          isValid = false;
        }
        break;
      case 'uuid':
        isValid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
        break;
      case 'date':
        isValid = !isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}$/.test(value);
        break;
      case 'date-time':
        isValid = !isNaN(Date.parse(value));
        break;
      case 'time':
        isValid = /^\d{2}:\d{2}(:\d{2})?/.test(value);
        break;
      case 'ipv4':
        isValid = /^(\d{1,3}\.){3}\d{1,3}$/.test(value);
        break;
      case 'ipv6':
        isValid = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(value);
        break;
      default:
        // Unknown format, skip validation
        return;
    }

    if (!isValid) {
      errors.push({
        path,
        keyword: 'format',
        message: `String must be a valid ${format}`,
        params: { format },
      });
    }
  }

  private validateOneOf(
    value: unknown,
    schemas: Record<string, unknown>[],
    path: string,
    errors: SchemaError[],
    depth: number
  ): void {
    const validCount = schemas.reduce((count, schema) => {
      const subErrors: SchemaError[] = [];
      this.validateValue(value, schema, path, subErrors, depth + 1);
      return count + (subErrors.length === 0 ? 1 : 0);
    }, 0);

    if (validCount !== 1) {
      errors.push({
        path,
        keyword: 'oneOf',
        message: `Value must match exactly one schema (matched ${validCount})`,
        params: { matched: validCount },
      });
    }
  }

  private validateAnyOf(
    value: unknown,
    schemas: Record<string, unknown>[],
    path: string,
    errors: SchemaError[],
    depth: number
  ): void {
    const hasValid = schemas.some((schema) => {
      const subErrors: SchemaError[] = [];
      this.validateValue(value, schema, path, subErrors, depth + 1);
      return subErrors.length === 0;
    });

    if (!hasValid) {
      errors.push({
        path,
        keyword: 'anyOf',
        message: 'Value must match at least one schema',
        params: {},
      });
    }
  }

  private validateAllOf(
    value: unknown,
    schemas: Record<string, unknown>[],
    path: string,
    errors: SchemaError[],
    depth: number
  ): void {
    for (const schema of schemas) {
      this.validateValue(value, schema, path, errors, depth + 1);
    }
  }

  private getJsonType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'number';
    }
    return typeof value;
  }

  private typesMatch(actual: string, expected: string): boolean {
    if (actual === expected) return true;
    if (expected === 'number' && actual === 'integer') return true;
    return false;
  }

  // ============================================================================
  // Schema Comparison Methods
  // ============================================================================

  private compareJsonSchemas(
    oldContent: string,
    newContent: string,
    additions: string[],
    removals: string[],
    modifications: SchemaModification[]
  ): void {
    try {
      const oldSchema = JSON.parse(oldContent) as Record<string, unknown>;
      const newSchema = JSON.parse(newContent) as Record<string, unknown>;

      this.compareSchemaObjects(oldSchema, newSchema, '', additions, removals, modifications);
    } catch {
      modifications.push({
        path: '',
        oldType: 'unparseable',
        newType: 'unparseable',
        isBreaking: true,
      });
    }
  }

  private compareSchemaObjects(
    oldSchema: Record<string, unknown>,
    newSchema: Record<string, unknown>,
    path: string,
    additions: string[],
    removals: string[],
    modifications: SchemaModification[]
  ): void {
    const oldProps = (oldSchema.properties as Record<string, unknown>) || {};
    const newProps = (newSchema.properties as Record<string, unknown>) || {};
    const oldRequired = new Set((oldSchema.required as string[]) || []);
    const newRequired = new Set((newSchema.required as string[]) || []);

    // Check for removed properties
    for (const prop of Object.keys(oldProps)) {
      if (!(prop in newProps)) {
        const propPath = path ? `${path}.${prop}` : prop;
        removals.push(propPath);
      }
    }

    // Check for added properties
    for (const prop of Object.keys(newProps)) {
      if (!(prop in oldProps)) {
        const propPath = path ? `${path}.${prop}` : prop;
        additions.push(propPath);

        // New required property is breaking
        if (newRequired.has(prop)) {
          modifications.push({
            path: propPath,
            oldType: 'undefined',
            newType: 'required',
            isBreaking: true,
          });
        }
      }
    }

    // Check for type changes
    if (oldSchema.type !== newSchema.type) {
      modifications.push({
        path: path || 'root',
        oldType: String(oldSchema.type || 'any'),
        newType: String(newSchema.type || 'any'),
        isBreaking: true,
      });
    }

    // Check for required changes
    const newRequiredArray = Array.from(newRequired);
    for (const prop of newRequiredArray) {
      if (!oldRequired.has(prop) && prop in oldProps) {
        const propPath = path ? `${path}.${prop}` : prop;
        modifications.push({
          path: propPath,
          oldType: 'optional',
          newType: 'required',
          isBreaking: true,
        });
      }
    }
  }

  private compareGraphQLSchemas(
    oldContent: string,
    newContent: string,
    additions: string[],
    removals: string[],
    _modifications: SchemaModification[]
  ): void {
    // Extract types from both schemas (simplified)
    const oldTypes = this.extractGraphQLTypes(oldContent);
    const newTypes = this.extractGraphQLTypes(newContent);

    for (const typeName of oldTypes) {
      if (!newTypes.includes(typeName)) {
        removals.push(`type:${typeName}`);
      }
    }

    for (const typeName of newTypes) {
      if (!oldTypes.includes(typeName)) {
        additions.push(`type:${typeName}`);
      }
    }
  }

  private extractGraphQLTypes(schema: string): string[] {
    const types: string[] = [];
    const typeRegex = /type\s+(\w+)/g;
    let match;
    while ((match = typeRegex.exec(schema)) !== null) {
      types.push(match[1]);
    }
    return types;
  }

  private compareProtobufSchemas(
    oldContent: string,
    newContent: string,
    additions: string[],
    removals: string[],
    _modifications: SchemaModification[]
  ): void {
    // Extract messages from both schemas
    const oldMessages = this.extractProtobufMessages(oldContent);
    const newMessages = this.extractProtobufMessages(newContent);

    for (const msg of oldMessages) {
      if (!newMessages.includes(msg)) {
        removals.push(`message:${msg}`);
      }
    }

    for (const msg of newMessages) {
      if (!oldMessages.includes(msg)) {
        additions.push(`message:${msg}`);
      }
    }
  }

  private extractProtobufMessages(schema: string): string[] {
    const messages: string[] = [];
    const msgRegex = /message\s+(\w+)/g;
    let match;
    while ((match = msgRegex.exec(schema)) !== null) {
      messages.push(match[1]);
    }
    return messages;
  }

  private compareAvroSchemas(
    oldContent: string,
    newContent: string,
    _additions: string[],
    _removals: string[],
    modifications: SchemaModification[]
  ): void {
    try {
      const oldSchema = JSON.parse(oldContent) as Record<string, unknown>;
      const newSchema = JSON.parse(newContent) as Record<string, unknown>;

      // Compare type
      if (oldSchema.type !== newSchema.type) {
        modifications.push({
          path: 'type',
          oldType: String(oldSchema.type),
          newType: String(newSchema.type),
          isBreaking: true,
        });
      }

      // Compare name
      if (oldSchema.name !== newSchema.name) {
        modifications.push({
          path: 'name',
          oldType: String(oldSchema.name),
          newType: String(newSchema.name),
          isBreaking: true,
        });
      }
    } catch {
      modifications.push({
        path: '',
        oldType: 'unparseable',
        newType: 'unparseable',
        isBreaking: true,
      });
    }
  }

  // ============================================================================
  // Schema Inference
  // ============================================================================

  private inferFromSamples(samples: unknown[]): Record<string, unknown> {
    if (samples.length === 0) {
      return { type: 'null' };
    }

    // Merge inferred types from all samples
    const types = samples.map((s) => this.inferType(s));
    return this.mergeTypes(types);
  }

  private inferType(value: unknown): Record<string, unknown> {
    if (value === null) {
      return { type: 'null' };
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return { type: 'array', items: {} };
      }
      const itemTypes = value.map((item) => this.inferType(item));
      return { type: 'array', items: this.mergeTypes(itemTypes) };
    }

    if (typeof value === 'object') {
      const properties: Record<string, Record<string, unknown>> = {};
      const required: string[] = [];

      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        properties[key] = this.inferType(val);
        if (val !== undefined) {
          required.push(key);
        }
      }

      return { type: 'object', properties, required };
    }

    if (typeof value === 'string') {
      const format = this.inferStringFormat(value);
      return format ? { type: 'string', format } : { type: 'string' };
    }

    if (typeof value === 'number') {
      return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
    }

    if (typeof value === 'boolean') {
      return { type: 'boolean' };
    }

    return {};
  }

  private inferStringFormat(value: string): string | null {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return 'uuid';
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return 'date-time';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
    try {
      new URL(value);
      return 'uri';
    } catch {
      return null;
    }
  }

  private mergeTypes(types: Record<string, unknown>[]): Record<string, unknown> {
    if (types.length === 0) return {};
    if (types.length === 1) return types[0];

    // Get unique types
    const typeSet = new Set(types.map((t) => t.type as string));

    if (typeSet.size === 1) {
      // All same type, merge properties if object
      const baseType = types[0].type as string;

      if (baseType === 'object') {
        const allProperties = new Map<string, Record<string, unknown>[]>();
        const allRequired = new Set<string>();

        for (const type of types) {
          const props = (type.properties as Record<string, Record<string, unknown>>) || {};
          const req = (type.required as string[]) || [];

          for (const [key, val] of Object.entries(props)) {
            if (!allProperties.has(key)) {
              allProperties.set(key, []);
            }
            allProperties.get(key)!.push(val);
          }

          for (const r of req) {
            allRequired.add(r);
          }
        }

        const mergedProps: Record<string, Record<string, unknown>> = {};
        const allPropertiesEntries = Array.from(allProperties.entries());
        for (const [key, vals] of allPropertiesEntries) {
          mergedProps[key] = this.mergeTypes(vals);
        }

        // Only required if in all samples
        const allRequiredArray = Array.from(allRequired);
        const commonRequired = allRequiredArray.filter((r) =>
          types.every((t) => ((t.required as string[]) || []).includes(r))
        );

        return {
          type: 'object',
          properties: mergedProps,
          required: commonRequired,
        };
      }

      if (baseType === 'array') {
        const itemTypes = types
          .map((t) => t.items as Record<string, unknown>)
          .filter((i) => i && Object.keys(i).length > 0);
        return {
          type: 'array',
          items: itemTypes.length > 0 ? this.mergeTypes(itemTypes) : {},
        };
      }

      return types[0];
    }

    // Multiple types - use anyOf
    return {
      anyOf: types,
    };
  }

  private async storeComparisonResult(
    oldSchema: SchemaDefinition,
    newSchema: SchemaDefinition,
    result: SchemaComparisonResult
  ): Promise<void> {
    const key = `contract-testing:schema-comparison:${oldSchema.id}:${newSchema.id}:${Date.now()}`;
    await this.memory.set(
      key,
      {
        oldSchemaId: oldSchema.id,
        newSchemaId: newSchema.id,
        isCompatible: result.isCompatible,
        timestamp: new Date().toISOString(),
      },
      {
        namespace: 'contract-testing',
        ttl: 86400 * 30, // 30 days
      }
    );
  }
}
