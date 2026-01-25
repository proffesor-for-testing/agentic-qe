/**
 * Agentic QE v3 - Schema Validator Tests
 * Tests for JSON Schema validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SchemaValidator,
  createSchemaValidator,
  createStrictSchemaValidator,
  CommonSchemas,
  type JSONSchema,
} from '../../../../src/mcp/security/schema-validator';

describe('SchemaValidator', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = createSchemaValidator();
  });

  describe('type validation', () => {
    it('should validate string type', () => {
      const schema: JSONSchema = { type: 'string' };

      expect(validator.validate('hello', schema).valid).toBe(true);
      expect(validator.validate(123, schema).valid).toBe(false);
      expect(validator.validate(null, schema).valid).toBe(false);
    });

    it('should validate number type', () => {
      const schema: JSONSchema = { type: 'number' };

      expect(validator.validate(42, schema).valid).toBe(true);
      expect(validator.validate(3.14, schema).valid).toBe(true);
      expect(validator.validate('42', schema).valid).toBe(false);
    });

    it('should validate integer type', () => {
      const schema: JSONSchema = { type: 'integer' };

      expect(validator.validate(42, schema).valid).toBe(true);
      expect(validator.validate(3.14, schema).valid).toBe(false);
      expect(validator.validate('42', schema).valid).toBe(false);
    });

    it('should validate boolean type', () => {
      const schema: JSONSchema = { type: 'boolean' };

      expect(validator.validate(true, schema).valid).toBe(true);
      expect(validator.validate(false, schema).valid).toBe(true);
      expect(validator.validate('true', schema).valid).toBe(false);
    });

    it('should validate array type', () => {
      const schema: JSONSchema = { type: 'array' };

      expect(validator.validate([1, 2, 3], schema).valid).toBe(true);
      expect(validator.validate([], schema).valid).toBe(true);
      expect(validator.validate({ length: 3 }, schema).valid).toBe(false);
    });

    it('should validate object type', () => {
      const schema: JSONSchema = { type: 'object' };

      expect(validator.validate({}, schema).valid).toBe(true);
      expect(validator.validate({ a: 1 }, schema).valid).toBe(true);
      expect(validator.validate([1, 2], schema).valid).toBe(false);
    });

    it('should validate null type', () => {
      const schema: JSONSchema = { type: 'null' };

      expect(validator.validate(null, schema).valid).toBe(true);
      expect(validator.validate(undefined, schema).valid).toBe(false);
    });

    it('should validate multiple types', () => {
      const schema: JSONSchema = { type: ['string', 'number'] };

      expect(validator.validate('hello', schema).valid).toBe(true);
      expect(validator.validate(42, schema).valid).toBe(true);
      expect(validator.validate(true, schema).valid).toBe(false);
    });
  });

  describe('string validation', () => {
    it('should validate minLength', () => {
      const schema: JSONSchema = { type: 'string', minLength: 3 };

      expect(validator.validate('abc', schema).valid).toBe(true);
      expect(validator.validate('ab', schema).valid).toBe(false);
    });

    it('should validate maxLength', () => {
      const schema: JSONSchema = { type: 'string', maxLength: 5 };

      expect(validator.validate('abc', schema).valid).toBe(true);
      expect(validator.validate('abcdef', schema).valid).toBe(false);
    });

    it('should validate pattern', () => {
      const schema: JSONSchema = { type: 'string', pattern: '^[a-z]+$' };

      expect(validator.validate('abc', schema).valid).toBe(true);
      expect(validator.validate('ABC', schema).valid).toBe(false);
      expect(validator.validate('abc123', schema).valid).toBe(false);
    });

    it('should validate format: email', () => {
      const schema: JSONSchema = { type: 'string', format: 'email' };

      expect(validator.validate('test@example.com', schema).valid).toBe(true);
      expect(validator.validate('invalid-email', schema).valid).toBe(false);
    });

    it('should validate format: uri', () => {
      const schema: JSONSchema = { type: 'string', format: 'uri' };

      expect(validator.validate('https://example.com', schema).valid).toBe(true);
      expect(validator.validate('not a url', schema).valid).toBe(false);
    });

    it('should validate format: uuid', () => {
      const schema: JSONSchema = { type: 'string', format: 'uuid' };

      expect(validator.validate('550e8400-e29b-41d4-a716-446655440000', schema).valid).toBe(true);
      expect(validator.validate('not-a-uuid', schema).valid).toBe(false);
    });

    it('should validate format: date-time', () => {
      const schema: JSONSchema = { type: 'string', format: 'date-time' };

      expect(validator.validate('2024-01-15T10:30:00Z', schema).valid).toBe(true);
      expect(validator.validate('2024-01-15', schema).valid).toBe(false);
    });

    it('should validate format: safe-path', () => {
      const schema: JSONSchema = { type: 'string', format: 'safe-path' };

      expect(validator.validate('src/file.ts', schema).valid).toBe(true);
      expect(validator.validate('../etc/passwd', schema).valid).toBe(false);
      expect(validator.validate('/etc/passwd', schema).valid).toBe(false);
    });
  });

  describe('number validation', () => {
    it('should validate minimum', () => {
      const schema: JSONSchema = { type: 'number', minimum: 0 };

      expect(validator.validate(0, schema).valid).toBe(true);
      expect(validator.validate(10, schema).valid).toBe(true);
      expect(validator.validate(-1, schema).valid).toBe(false);
    });

    it('should validate maximum', () => {
      const schema: JSONSchema = { type: 'number', maximum: 100 };

      expect(validator.validate(100, schema).valid).toBe(true);
      expect(validator.validate(50, schema).valid).toBe(true);
      expect(validator.validate(101, schema).valid).toBe(false);
    });

    it('should validate exclusiveMinimum', () => {
      const schema: JSONSchema = { type: 'number', exclusiveMinimum: 0 };

      expect(validator.validate(1, schema).valid).toBe(true);
      expect(validator.validate(0, schema).valid).toBe(false);
    });

    it('should validate exclusiveMaximum', () => {
      const schema: JSONSchema = { type: 'number', exclusiveMaximum: 100 };

      expect(validator.validate(99, schema).valid).toBe(true);
      expect(validator.validate(100, schema).valid).toBe(false);
    });
  });

  describe('array validation', () => {
    it('should validate minItems', () => {
      const schema: JSONSchema = { type: 'array', minItems: 2 };

      expect(validator.validate([1, 2], schema).valid).toBe(true);
      expect(validator.validate([1], schema).valid).toBe(false);
    });

    it('should validate maxItems', () => {
      const schema: JSONSchema = { type: 'array', maxItems: 3 };

      expect(validator.validate([1, 2, 3], schema).valid).toBe(true);
      expect(validator.validate([1, 2, 3, 4], schema).valid).toBe(false);
    });

    it('should validate uniqueItems', () => {
      const schema: JSONSchema = { type: 'array', uniqueItems: true };

      expect(validator.validate([1, 2, 3], schema).valid).toBe(true);
      expect(validator.validate([1, 2, 2], schema).valid).toBe(false);
    });

    it('should validate items schema', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'string' },
      };

      expect(validator.validate(['a', 'b', 'c'], schema).valid).toBe(true);
      expect(validator.validate(['a', 123, 'c'], schema).valid).toBe(false);
    });

    it('should validate tuple items', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: [{ type: 'string' }, { type: 'number' }],
      };

      expect(validator.validate(['a', 1], schema).valid).toBe(true);
      expect(validator.validate([1, 'a'], schema).valid).toBe(false);
    });
  });

  describe('object validation', () => {
    it('should validate required properties', () => {
      const schema: JSONSchema = {
        type: 'object',
        required: ['name', 'age'],
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };

      expect(validator.validate({ name: 'John', age: 30 }, schema).valid).toBe(true);
      expect(validator.validate({ name: 'John' }, schema).valid).toBe(false);
    });

    it('should validate property types', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
        },
      };

      expect(validator.validate({ name: 'John', age: 30 }, schema).valid).toBe(true);
      expect(validator.validate({ name: 123, age: 30 }, schema).valid).toBe(false);
    });

    it('should reject additional properties when strict', () => {
      const strictValidator = createStrictSchemaValidator();
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: false,
      };

      expect(strictValidator.validate({ name: 'John' }, schema).valid).toBe(true);
      expect(strictValidator.validate({ name: 'John', extra: true }, schema).valid).toBe(false);
    });

    it('should validate additional properties with schema', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: { type: 'number' },
      };

      expect(validator.validate({ name: 'John', score: 100 }, schema).valid).toBe(true);
      expect(validator.validate({ name: 'John', score: 'high' }, schema).valid).toBe(false);
    });
  });

  describe('combinators', () => {
    it('should validate allOf', () => {
      const schema: JSONSchema = {
        allOf: [
          { type: 'object', properties: { name: { type: 'string' } } },
          { type: 'object', properties: { age: { type: 'number' } } },
        ],
      };

      expect(validator.validate({ name: 'John', age: 30 }, schema).valid).toBe(true);
    });

    it('should validate anyOf', () => {
      const schema: JSONSchema = {
        anyOf: [{ type: 'string' }, { type: 'number' }],
      };

      expect(validator.validate('hello', schema).valid).toBe(true);
      expect(validator.validate(42, schema).valid).toBe(true);
      expect(validator.validate(true, schema).valid).toBe(false);
    });

    it('should validate oneOf', () => {
      const schema: JSONSchema = {
        oneOf: [
          { type: 'number', minimum: 0, maximum: 10 },
          { type: 'number', minimum: 20, maximum: 30 },
        ],
      };

      expect(validator.validate(5, schema).valid).toBe(true);
      expect(validator.validate(25, schema).valid).toBe(true);
      expect(validator.validate(15, schema).valid).toBe(false); // Matches neither
    });

    it('should validate not', () => {
      const schema: JSONSchema = {
        not: { type: 'string' },
      };

      expect(validator.validate(42, schema).valid).toBe(true);
      expect(validator.validate('hello', schema).valid).toBe(false);
    });
  });

  describe('enum and const', () => {
    it('should validate enum', () => {
      const schema: JSONSchema = {
        enum: ['red', 'green', 'blue'],
      };

      expect(validator.validate('red', schema).valid).toBe(true);
      expect(validator.validate('yellow', schema).valid).toBe(false);
    });

    it('should validate const', () => {
      const schema: JSONSchema = {
        const: 'exact-value',
      };

      expect(validator.validate('exact-value', schema).valid).toBe(true);
      expect(validator.validate('other-value', schema).valid).toBe(false);
    });
  });

  describe('conditional validation', () => {
    it('should validate if/then/else', () => {
      const schema: JSONSchema = {
        if: { properties: { type: { const: 'premium' } } },
        then: { properties: { discount: { minimum: 20 } } },
        else: { properties: { discount: { maximum: 10 } } },
      };

      expect(validator.validate({ type: 'premium', discount: 25 }, schema).valid).toBe(true);
      expect(validator.validate({ type: 'basic', discount: 5 }, schema).valid).toBe(true);
      expect(validator.validate({ type: 'premium', discount: 5 }, schema).valid).toBe(false);
    });
  });

  describe('$ref resolution', () => {
    it('should resolve $ref to registered schema', () => {
      const addressSchema: JSONSchema = {
        type: 'object',
        properties: {
          street: { type: 'string' },
          city: { type: 'string' },
        },
        required: ['street', 'city'],
      };

      validator.registerSchema('address', addressSchema);

      const personSchema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          address: { $ref: 'address' },
        },
      };

      const valid = {
        name: 'John',
        address: { street: '123 Main St', city: 'Boston' },
      };

      const invalid = {
        name: 'John',
        address: { street: '123 Main St' }, // Missing city
      };

      expect(validator.validate(valid, personSchema).valid).toBe(true);
      expect(validator.validate(invalid, personSchema).valid).toBe(false);
    });

    it('should report error for unresolved $ref', () => {
      const schema: JSONSchema = { $ref: 'nonexistent' };
      const result = validator.validate({}, schema);

      expect(result.valid).toBe(false);
      expect(result.errors[0].keyword).toBe('$ref');
    });
  });

  describe('custom format validators', () => {
    it('should support custom format validators', () => {
      validator.registerFormat('phone', (value) => {
        return /^\+?[1-9]\d{1,14}$/.test(value);
      });

      const schema: JSONSchema = { type: 'string', format: 'phone' };

      expect(validator.validate('+12025551234', schema).valid).toBe(true);
      expect(validator.validate('invalid-phone', schema).valid).toBe(false);
    });
  });

  describe('compile', () => {
    it('should create reusable validator function', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer', minimum: 0 },
        },
        required: ['name'],
      };

      const validate = validator.compile<{ name: string; age?: number }>(schema);

      const result1 = validate({ name: 'John', age: 30 });
      expect(result1.valid).toBe(true);
      expect(result1.data).toEqual({ name: 'John', age: 30 });

      const result2 = validate({ age: -5 });
      expect(result2.valid).toBe(false);
    });
  });

  describe('CommonSchemas', () => {
    it('should validate FilePath', () => {
      const result1 = validator.validate('src/file.ts', CommonSchemas.FilePath);
      expect(result1.valid).toBe(true);

      const result2 = validator.validate('../etc/passwd', CommonSchemas.FilePath);
      expect(result2.valid).toBe(false);
    });

    it('should validate Domain', () => {
      const result1 = validator.validate('test-generation', CommonSchemas.Domain);
      expect(result1.valid).toBe(true);

      const result2 = validator.validate('invalid-domain', CommonSchemas.Domain);
      expect(result2.valid).toBe(false);
    });

    it('should validate Priority', () => {
      const result1 = validator.validate('p0', CommonSchemas.Priority);
      expect(result1.valid).toBe(true);

      const result2 = validator.validate('critical', CommonSchemas.Priority);
      expect(result2.valid).toBe(true);

      const result3 = validator.validate('invalid', CommonSchemas.Priority);
      expect(result3.valid).toBe(false);
    });

    it('should validate Percentage', () => {
      const result1 = validator.validate(50, CommonSchemas.Percentage);
      expect(result1.valid).toBe(true);

      const result2 = validator.validate(101, CommonSchemas.Percentage);
      expect(result2.valid).toBe(false);
    });
  });

  describe('error messages', () => {
    it('should provide detailed error messages', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2 },
          age: { type: 'integer', minimum: 0 },
        },
        required: ['name'],
      };

      const result = validator.validate({ name: 'A', age: -1 }, schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].path).toBe('name');
      expect(result.errors[0].keyword).toBe('minLength');
      expect(result.errors[1].path).toBe('age');
      expect(result.errors[1].keyword).toBe('minimum');
    });
  });
});
