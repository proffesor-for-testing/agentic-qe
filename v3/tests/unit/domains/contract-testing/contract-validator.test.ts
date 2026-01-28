/**
 * Agentic QE v3 - Contract Validator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContractValidatorService } from '../../../../src/domains/contract-testing/services/contract-validator';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
import type { ApiContract, SchemaDefinition } from '../../../../src/domains/contract-testing/interfaces';
import { Version } from '../../../../src/shared/value-objects';

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

// Factory for creating test contracts
function createTestContract(overrides: Partial<ApiContract> = {}): ApiContract {
  return {
    id: 'test-contract-1',
    name: 'Test Contract',
    version: Version.create(1, 0, 0),
    type: 'rest',
    provider: { name: 'UserService', version: '1.0.0', team: 'platform' },
    consumers: [{ name: 'WebApp', version: '2.0.0' }],
    endpoints: [
      {
        path: '/users',
        method: 'GET',
        requestSchema: 'get-users-request',
        responseSchema: 'get-users-response',
        examples: [
          { name: 'success', request: {}, response: { users: [] }, statusCode: 200 },
        ],
      },
    ],
    schemas: [
      {
        id: 'get-users-request',
        name: 'GetUsersRequest',
        type: 'json-schema',
        content: JSON.stringify({ type: 'object', properties: {} }),
      },
      {
        id: 'get-users-response',
        name: 'GetUsersResponse',
        type: 'json-schema',
        content: JSON.stringify({
          type: 'object',
          properties: { users: { type: 'array', items: { type: 'object' } } },
        }),
      },
    ],
    ...overrides,
  };
}

describe('ContractValidatorService', () => {
  let service: ContractValidatorService;
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    mockMemory = createMockMemoryBackend();
    service = new ContractValidatorService({ memory: mockMemory });
  });

  describe('validateContract', () => {
    it('should validate a valid contract successfully', async () => {
      const contract = createTestContract();

      const result = await service.validateContract(contract);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isValid).toBe(true);
        expect(result.value.errors).toHaveLength(0);
      }
    });

    it('should return errors for contract with missing id', async () => {
      const contract = createTestContract({ id: '' });

      const result = await service.validateContract(contract);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.errors.some((e) => e.path === 'id')).toBe(true);
      }
    });

    it('should return errors for contract with missing name', async () => {
      const contract = createTestContract({ name: '' });

      const result = await service.validateContract(contract);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.errors.some((e) => e.code === 'REQUIRED_FIELD')).toBe(true);
      }
    });

    it('should return errors for empty endpoints in strict mode', async () => {
      const strictService = new ContractValidatorService({ memory: mockMemory }, { strictMode: true });
      const contract = createTestContract({ endpoints: [] });

      const result = await strictService.validateContract(contract);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.errors.some((e) => e.code === 'EMPTY_ENDPOINTS')).toBe(true);
      }
    });

    it('should return warning for empty endpoints in non-strict mode', async () => {
      const nonStrictService = new ContractValidatorService({ memory: mockMemory }, { strictMode: false });
      const contract = createTestContract({ endpoints: [] });

      const result = await nonStrictService.validateContract(contract);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.warnings.some((w) => w.includes('no endpoints'))).toBe(true);
      }
    });

    it('should validate schema references and report missing schemas', async () => {
      const contract = createTestContract({
        endpoints: [
          {
            path: '/test',
            method: 'POST',
            requestSchema: 'nonexistent-schema',
            responseSchema: 'get-users-response',
            examples: [],
          },
        ],
      });

      const result = await service.validateContract(contract);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.errors.some((e) => e.code === 'INVALID_REFERENCE')).toBe(true);
      }
    });

    it('should cache validation results when caching is enabled', async () => {
      const cachingService = new ContractValidatorService({ memory: mockMemory }, { cacheValidations: true });
      const contract = createTestContract();

      const result1 = await cachingService.validateContract(contract);
      const result2 = await cachingService.validateContract(contract);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      // Memory.set should only be called once for caching
      expect(mockMemory.set).toHaveBeenCalledTimes(1);
    });

    it('should warn when contract has no consumers', async () => {
      const contract = createTestContract({ consumers: [] });

      const result = await service.validateContract(contract);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.warnings.some((w) => w.includes('No consumers'))).toBe(true);
      }
    });
  });

  describe('validateRequest', () => {
    it('should validate request against JSON schema successfully', async () => {
      const schema: SchemaDefinition = {
        id: 'user-schema',
        name: 'UserSchema',
        type: 'json-schema',
        content: JSON.stringify({
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
          required: ['name'],
        }),
      };

      const result = await service.validateRequest({ name: 'John', age: 30 }, schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isValid).toBe(true);
      }
    });

    it('should return errors for invalid request data', async () => {
      const schema: SchemaDefinition = {
        id: 'user-schema',
        name: 'UserSchema',
        type: 'json-schema',
        content: JSON.stringify({
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
        }),
      };

      const result = await service.validateRequest({ name: 123 }, schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.errors.length).toBeGreaterThan(0);
      }
    });

    it('should handle unsupported schema types', async () => {
      const schema: SchemaDefinition = {
        id: 'custom-schema',
        name: 'CustomSchema',
        type: 'protobuf' as const,
        content: 'message Test {}',
      };

      const result = await service.validateRequest({ test: true }, schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.errors.some((e) => e.keyword === 'unsupported')).toBe(true);
      }
    });
  });

  describe('validateResponse', () => {
    it('should validate response against JSON schema', async () => {
      const schema: SchemaDefinition = {
        id: 'response-schema',
        name: 'ResponseSchema',
        type: 'json-schema',
        content: JSON.stringify({
          type: 'object',
          properties: {
            data: { type: 'array' },
            total: { type: 'number' },
          },
        }),
      };

      const result = await service.validateResponse({ data: [1, 2, 3], total: 3 }, schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isValid).toBe(true);
      }
    });
  });

  describe('validateOpenAPI', () => {
    it('should validate OpenAPI 3.x specification', async () => {
      const spec = JSON.stringify({
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: { responses: { '200': { description: 'Success' } } },
          },
        },
        components: {
          schemas: { User: { type: 'object' } },
        },
      });

      const result = await service.validateOpenAPI(spec);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isValid).toBe(true);
        expect(result.value.specVersion).toBe('3.0.0');
        expect(result.value.endpointCount).toBe(1);
        expect(result.value.schemaCount).toBe(1);
      }
    });

    it('should validate Swagger 2.x specification', async () => {
      const spec = JSON.stringify({
        swagger: '2.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/items': {
            get: { responses: { '200': { description: 'Success' } } },
            post: { responses: { '201': { description: 'Created' } } },
          },
        },
        definitions: {
          Item: { type: 'object' },
          Error: { type: 'object' },
        },
      });

      const result = await service.validateOpenAPI(spec);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.specVersion).toBe('swagger-2.0');
        expect(result.value.endpointCount).toBe(2);
        expect(result.value.schemaCount).toBe(2);
      }
    });

    it('should return errors for invalid JSON', async () => {
      const invalidSpec = 'not valid json {{{';

      const result = await service.validateOpenAPI(invalidSpec);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.errors.some((e) => e.code === 'PARSE_ERROR')).toBe(true);
      }
    });

    it('should return errors for missing required OpenAPI fields', async () => {
      const spec = JSON.stringify({
        openapi: '3.0.0',
        // Missing 'info' object
        paths: {},
      });

      const result = await service.validateOpenAPI(spec);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.errors.some((e) => e.path === 'info')).toBe(true);
      }
    });

    it('should return errors for unsupported OpenAPI version', async () => {
      const spec = JSON.stringify({
        openapi: '4.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
      });

      const result = await service.validateOpenAPI(spec);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.errors.some((e) => e.code === 'UNSUPPORTED_VERSION')).toBe(true);
      }
    });
  });
});
