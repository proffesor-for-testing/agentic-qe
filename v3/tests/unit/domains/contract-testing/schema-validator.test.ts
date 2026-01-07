/**
 * Agentic QE v3 - Schema Validator Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchemaValidatorService } from '../../../../src/domains/contract-testing/services/schema-validator';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
import type { SchemaDefinition } from '../../../../src/domains/contract-testing/interfaces';

// Mock MemoryBackend
function createMockMemoryBackend(): MemoryBackend {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
    has: vi.fn().mockResolvedValue(false),
    search: vi.fn().mockResolvedValue([]),
    vectorSearch: vi.fn().mockResolvedValue([]),
    storeVector: vi.fn().mockResolvedValue(undefined),
  };
}

describe('SchemaValidatorService', () => {
  let service: SchemaValidatorService;
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    mockMemory = createMockMemoryBackend();
    service = new SchemaValidatorService(mockMemory);
  });

  describe('validateJsonSchema', () => {
    it('should validate data matching schema', async () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };

      const result = await service.validateJsonSchema({ name: 'John', age: 30 }, schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isValid).toBe(true);
        expect(result.value.errors).toHaveLength(0);
      }
    });

    it('should return error for missing required field', async () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['name', 'email'],
      };

      const result = await service.validateJsonSchema({ name: 'John' }, schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.errors.some((e) => e.keyword === 'required')).toBe(true);
      }
    });

    it('should return error for type mismatch', async () => {
      const schema = {
        type: 'object',
        properties: {
          count: { type: 'number' },
        },
      };

      const result = await service.validateJsonSchema({ count: 'not a number' }, schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.errors.some((e) => e.keyword === 'type')).toBe(true);
      }
    });

    it('should validate array items', async () => {
      const schema = {
        type: 'array',
        items: { type: 'number' },
      };

      const validResult = await service.validateJsonSchema([1, 2, 3], schema);
      const invalidResult = await service.validateJsonSchema([1, 'two', 3], schema);

      expect(validResult.success && validResult.value.isValid).toBe(true);
      expect(invalidResult.success && !invalidResult.value.isValid).toBe(true);
    });

    it('should validate minLength and maxLength', async () => {
      const schema = {
        type: 'string',
        minLength: 3,
        maxLength: 10,
      };

      const tooShort = await service.validateJsonSchema('ab', schema);
      const tooLong = await service.validateJsonSchema('this is too long', schema);
      const justRight = await service.validateJsonSchema('hello', schema);

      expect(tooShort.success && tooShort.value.errors.some((e) => e.keyword === 'minLength')).toBe(true);
      expect(tooLong.success && tooLong.value.errors.some((e) => e.keyword === 'maxLength')).toBe(true);
      expect(justRight.success && justRight.value.isValid).toBe(true);
    });

    it('should validate enum values', async () => {
      const schema = {
        type: 'string',
        enum: ['red', 'green', 'blue'],
      };

      const valid = await service.validateJsonSchema('red', schema);
      const invalid = await service.validateJsonSchema('yellow', schema);

      expect(valid.success && valid.value.isValid).toBe(true);
      expect(invalid.success && invalid.value.errors.some((e) => e.keyword === 'enum')).toBe(true);
    });

    it('should validate number minimum and maximum', async () => {
      const schema = {
        type: 'number',
        minimum: 0,
        maximum: 100,
      };

      const tooSmall = await service.validateJsonSchema(-5, schema);
      const tooBig = await service.validateJsonSchema(150, schema);
      const inRange = await service.validateJsonSchema(50, schema);

      expect(tooSmall.success && tooSmall.value.errors.some((e) => e.keyword === 'minimum')).toBe(true);
      expect(tooBig.success && tooBig.value.errors.some((e) => e.keyword === 'maximum')).toBe(true);
      expect(inRange.success && inRange.value.isValid).toBe(true);
    });

    it('should validate string patterns', async () => {
      const schema = {
        type: 'string',
        pattern: '^[A-Z][a-z]+$',
      };

      const valid = await service.validateJsonSchema('Hello', schema);
      const invalid = await service.validateJsonSchema('hello', schema);

      expect(valid.success && valid.value.isValid).toBe(true);
      expect(invalid.success && invalid.value.errors.some((e) => e.keyword === 'pattern')).toBe(true);
    });

    it('should validate email format', async () => {
      const schema = {
        type: 'string',
        format: 'email',
      };

      const valid = await service.validateJsonSchema('test@example.com', schema);
      const invalid = await service.validateJsonSchema('not-an-email', schema);

      expect(valid.success && valid.value.isValid).toBe(true);
      expect(invalid.success && invalid.value.errors.some((e) => e.keyword === 'format')).toBe(true);
    });

    it('should validate uuid format', async () => {
      const schema = {
        type: 'string',
        format: 'uuid',
      };

      const valid = await service.validateJsonSchema('550e8400-e29b-41d4-a716-446655440000', schema);
      const invalid = await service.validateJsonSchema('not-a-uuid', schema);

      expect(valid.success && valid.value.isValid).toBe(true);
      expect(invalid.success && invalid.value.errors.some((e) => e.keyword === 'format')).toBe(true);
    });

    it('should handle anyOf validation', async () => {
      const schema = {
        anyOf: [{ type: 'string' }, { type: 'number' }],
      };

      const validString = await service.validateJsonSchema('hello', schema);
      const validNumber = await service.validateJsonSchema(42, schema);
      const invalid = await service.validateJsonSchema(true, schema);

      expect(validString.success && validString.value.isValid).toBe(true);
      expect(validNumber.success && validNumber.value.isValid).toBe(true);
      expect(invalid.success && invalid.value.errors.some((e) => e.keyword === 'anyOf')).toBe(true);
    });

    it('should respect maximum recursion depth', async () => {
      const strictService = new SchemaValidatorService(mockMemory, { maxRecursionDepth: 2 });
      const deepSchema = {
        type: 'object',
        properties: {
          level1: {
            type: 'object',
            properties: {
              level2: {
                type: 'object',
                properties: {
                  level3: { type: 'string' },
                },
              },
            },
          },
        },
      };

      const result = await strictService.validateJsonSchema(
        { level1: { level2: { level3: 'deep' } } },
        deepSchema
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.errors.some((e) => e.keyword === 'maxDepth')).toBe(true);
      }
    });
  });

  describe('validateGraphQLSchema', () => {
    it('should validate valid GraphQL schema', async () => {
      const schema = `
        type Query {
          users: [User]
          user(id: ID!): User
        }

        type User {
          id: ID!
          name: String!
          email: String
        }
      `;

      const result = await service.validateGraphQLSchema(schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isValid).toBe(true);
        expect(result.value.typeCount).toBeGreaterThan(0);
        expect(result.value.queryCount).toBeGreaterThan(0);
      }
    });

    it('should detect unbalanced braces', async () => {
      const schema = `
        type Query {
          users: [User]

        type User {
          id: ID!
        }
      `;

      const result = await service.validateGraphQLSchema(schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.errors.some((e) => e.message.includes('braces'))).toBe(true);
      }
    });

    it('should require Query type or schema definition', async () => {
      const schema = `
        type User {
          id: ID!
          name: String!
        }
      `;

      const result = await service.validateGraphQLSchema(schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.errors.some((e) => e.message.includes('Query'))).toBe(true);
      }
    });

    it('should count mutations', async () => {
      const schema = `
        type Query {
          users: [User]
        }

        type Mutation {
          createUser(name: String!): User
          deleteUser(id: ID!): Boolean
        }

        type User {
          id: ID!
          name: String!
        }
      `;

      const result = await service.validateGraphQLSchema(schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.mutationCount).toBeGreaterThan(0);
      }
    });

    it('should detect invalid double colon syntax', async () => {
      const schema = `
        type Query {
          users:: [User]
        }
      `;

      const result = await service.validateGraphQLSchema(schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.errors.some((e) => e.message.includes('double colon'))).toBe(true);
      }
    });
  });

  describe('compareSchemas', () => {
    it('should detect compatible schemas', async () => {
      const oldSchema: SchemaDefinition = {
        id: 'user-v1',
        name: 'User',
        type: 'json-schema',
        content: JSON.stringify({
          type: 'object',
          properties: { name: { type: 'string' } },
        }),
      };

      const newSchema: SchemaDefinition = {
        id: 'user-v2',
        name: 'User',
        type: 'json-schema',
        content: JSON.stringify({
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string' }, // Added optional field
          },
        }),
      };

      const result = await service.compareSchemas(oldSchema, newSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isCompatible).toBe(true);
        expect(result.value.additions).toContain('email');
      }
    });

    it('should detect incompatible type changes', async () => {
      const oldSchema: SchemaDefinition = {
        id: 'data-v1',
        name: 'Data',
        type: 'json-schema',
        content: JSON.stringify({ type: 'object' }),
      };

      const newSchema: SchemaDefinition = {
        id: 'data-v2',
        name: 'Data',
        type: 'json-schema',
        content: JSON.stringify({ type: 'array' }),
      };

      const result = await service.compareSchemas(oldSchema, newSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isCompatible).toBe(false);
        expect(result.value.modifications.some((m) => m.isBreaking)).toBe(true);
      }
    });

    it('should detect removed properties', async () => {
      const oldSchema: SchemaDefinition = {
        id: 'item-v1',
        name: 'Item',
        type: 'json-schema',
        content: JSON.stringify({
          type: 'object',
          properties: { id: { type: 'string' }, price: { type: 'number' } },
        }),
      };

      const newSchema: SchemaDefinition = {
        id: 'item-v2',
        name: 'Item',
        type: 'json-schema',
        content: JSON.stringify({
          type: 'object',
          properties: { id: { type: 'string' } }, // price removed
        }),
      };

      const result = await service.compareSchemas(oldSchema, newSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isCompatible).toBe(false);
        expect(result.value.removals).toContain('price');
      }
    });

    it('should detect schema type change as breaking', async () => {
      const oldSchema: SchemaDefinition = {
        id: 'data-v1',
        name: 'Data',
        type: 'json-schema',
        content: JSON.stringify({ type: 'object' }),
      };

      const newSchema: SchemaDefinition = {
        id: 'data-v2',
        name: 'Data',
        type: 'graphql',
        content: 'type Data { id: ID! }',
      };

      const result = await service.compareSchemas(oldSchema, newSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isCompatible).toBe(false);
        expect(result.value.modifications.some((m) => m.path === 'type' && m.isBreaking)).toBe(true);
      }
    });

    it('should compare GraphQL schemas', async () => {
      const oldSchema: SchemaDefinition = {
        id: 'api-v1',
        name: 'API',
        type: 'graphql',
        content: 'type Query { users: [User] } type User { id: ID! }',
      };

      const newSchema: SchemaDefinition = {
        id: 'api-v2',
        name: 'API',
        type: 'graphql',
        content: 'type Query { users: [User] } type User { id: ID! } type Post { id: ID! }',
      };

      const result = await service.compareSchemas(oldSchema, newSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.additions).toContain('type:Post');
      }
    });
  });

  describe('inferSchema', () => {
    it('should infer schema from sample objects', async () => {
      const samples = [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
        { name: 'Bob', age: 35 },
      ];

      const result = await service.inferSchema(samples);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.type).toBe('json-schema');
        const content = JSON.parse(result.value.content);
        expect(content.type).toBe('object');
        expect(content.properties.name.type).toBe('string');
        expect(content.properties.age.type).toBe('integer');
      }
    });

    it('should return error for empty samples', async () => {
      const result = await service.inferSchema([]);

      expect(result.success).toBe(false);
    });

    it('should infer array schema', async () => {
      const samples = [[1, 2, 3], [4, 5], [6, 7, 8, 9]];

      const result = await service.inferSchema(samples);

      expect(result.success).toBe(true);
      if (result.success) {
        const content = JSON.parse(result.value.content);
        expect(content.type).toBe('array');
        expect(content.items.type).toBe('integer');
      }
    });

    it('should infer email format', async () => {
      const samples = [
        { email: 'user1@example.com' },
        { email: 'user2@test.org' },
        { email: 'admin@company.net' },
      ];

      const result = await service.inferSchema(samples);

      expect(result.success).toBe(true);
      if (result.success) {
        const content = JSON.parse(result.value.content);
        expect(content.properties.email.format).toBe('email');
      }
    });

    it('should infer date-time format', async () => {
      const samples = [
        { timestamp: '2024-01-15T10:30:00Z' },
        { timestamp: '2024-02-20T14:45:00Z' },
      ];

      const result = await service.inferSchema(samples);

      expect(result.success).toBe(true);
      if (result.success) {
        const content = JSON.parse(result.value.content);
        expect(content.properties.timestamp.format).toBe('date-time');
      }
    });

    it('should store inferred schema in memory', async () => {
      const samples = [{ id: 1 }, { id: 2 }];

      await service.inferSchema(samples);

      expect(mockMemory.set).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle null values based on schema', async () => {
      const schema = {
        type: 'object',
        properties: {
          value: { type: 'string', nullable: true },
        },
      };

      const result = await service.validateJsonSchema({ value: null }, schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isValid).toBe(true);
      }
    });

    it('should reject null in strict mode when not nullable', async () => {
      const strictService = new SchemaValidatorService(mockMemory, { strictMode: true });
      const schema = {
        type: 'object',
        properties: {
          value: { type: 'string' },
        },
      };

      const result = await strictService.validateJsonSchema({ value: null }, schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.errors.some((e) => e.message.includes('null'))).toBe(true);
      }
    });

    it('should validate unique items in arrays', async () => {
      const schema = {
        type: 'array',
        items: { type: 'number' },
        uniqueItems: true,
      };

      const unique = await service.validateJsonSchema([1, 2, 3], schema);
      const duplicate = await service.validateJsonSchema([1, 2, 2], schema);

      expect(unique.success && unique.value.isValid).toBe(true);
      expect(duplicate.success && duplicate.value.errors.some((e) => e.keyword === 'uniqueItems')).toBe(true);
    });

    it('should validate multipleOf for numbers', async () => {
      const schema = {
        type: 'number',
        multipleOf: 5,
      };

      const valid = await service.validateJsonSchema(15, schema);
      const invalid = await service.validateJsonSchema(17, schema);

      expect(valid.success && valid.value.isValid).toBe(true);
      expect(invalid.success && invalid.value.errors.some((e) => e.keyword === 'multipleOf')).toBe(true);
    });
  });
});
