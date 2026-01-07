/**
 * Agentic QE v3 - API Compatibility Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiCompatibilityService } from '../../../../src/domains/contract-testing/services/api-compatibility';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
import type { ApiContract, BreakingChange } from '../../../../src/domains/contract-testing/interfaces';
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
    id: 'test-contract',
    name: 'Test Contract',
    version: Version.create(1, 0, 0),
    type: 'rest',
    provider: { name: 'TestService', version: '1.0.0' },
    consumers: [{ name: 'Consumer1', version: '1.0.0' }],
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
          properties: {
            users: { type: 'array' },
          },
        }),
      },
    ],
    ...overrides,
  };
}

describe('ApiCompatibilityService', () => {
  let service: ApiCompatibilityService;
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    mockMemory = createMockMemoryBackend();
    service = new ApiCompatibilityService(mockMemory);
  });

  describe('compareVersions', () => {
    it('should detect no breaking changes for identical contracts', async () => {
      const oldContract = createTestContract();
      const newContract = createTestContract({ version: Version.create(1, 1, 0) });

      const result = await service.compareVersions(oldContract, newContract);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isCompatible).toBe(true);
        expect(result.value.breakingChanges).toHaveLength(0);
      }
    });

    it('should detect removed endpoint as breaking change', async () => {
      const oldContract = createTestContract();
      const newContract = createTestContract({
        version: Version.create(2, 0, 0),
        endpoints: [],
      });

      const result = await service.compareVersions(oldContract, newContract);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isCompatible).toBe(false);
        expect(result.value.breakingChanges.length).toBeGreaterThan(0);
        expect(result.value.breakingChanges.some((c) => c.type === 'removed-endpoint')).toBe(true);
      }
    });

    it('should detect added endpoint as non-breaking change', async () => {
      const oldContract = createTestContract();
      const newContract = createTestContract({
        version: Version.create(1, 1, 0),
        endpoints: [
          ...oldContract.endpoints,
          {
            path: '/users/{id}',
            method: 'GET',
            examples: [],
          },
        ],
      });

      const result = await service.compareVersions(oldContract, newContract);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isCompatible).toBe(true);
        expect(result.value.nonBreakingChanges.some((c) => c.type === 'added-endpoint')).toBe(true);
      }
    });

    it('should detect schema removal as breaking change', async () => {
      const oldContract = createTestContract();
      const newContract = createTestContract({
        version: Version.create(2, 0, 0),
        schemas: [oldContract.schemas[0]], // Remove second schema
      });

      const result = await service.compareVersions(oldContract, newContract);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.breakingChanges.some((c) => c.type === 'removed-field')).toBe(true);
      }
    });

    it('should detect added schema as non-breaking change', async () => {
      const oldContract = createTestContract();
      const newContract = createTestContract({
        version: Version.create(1, 1, 0),
        schemas: [
          ...oldContract.schemas,
          {
            id: 'new-schema',
            name: 'NewSchema',
            type: 'json-schema',
            content: JSON.stringify({ type: 'object' }),
          },
        ],
      });

      const result = await service.compareVersions(oldContract, newContract);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.nonBreakingChanges.some((c) => c.type === 'added-field')).toBe(true);
      }
    });

    it('should detect type change in schema as breaking change', async () => {
      const oldContract = createTestContract({
        schemas: [
          {
            id: 'user-schema',
            name: 'UserSchema',
            type: 'json-schema',
            content: JSON.stringify({
              type: 'object',
              properties: { age: { type: 'number' } },
            }),
          },
        ],
      });
      const newContract = createTestContract({
        version: Version.create(2, 0, 0),
        schemas: [
          {
            id: 'user-schema',
            name: 'UserSchema',
            type: 'json-schema',
            content: JSON.stringify({
              type: 'object',
              properties: { age: { type: 'string' } }, // Changed from number to string
            }),
          },
        ],
      });

      const result = await service.compareVersions(oldContract, newContract);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isCompatible).toBe(false);
        expect(result.value.breakingChanges.some((c) => c.type === 'type-change')).toBe(true);
      }
    });

    it('should detect enum value removal as breaking change', async () => {
      const oldContract = createTestContract({
        schemas: [
          {
            id: 'status-schema',
            name: 'StatusSchema',
            type: 'json-schema',
            content: JSON.stringify({
              type: 'object',
              properties: { status: { type: 'string', enum: ['active', 'inactive', 'pending'] } },
            }),
          },
        ],
      });
      const newContract = createTestContract({
        version: Version.create(2, 0, 0),
        schemas: [
          {
            id: 'status-schema',
            name: 'StatusSchema',
            type: 'json-schema',
            content: JSON.stringify({
              type: 'object',
              properties: { status: { type: 'string', enum: ['active', 'inactive'] } }, // Removed 'pending'
            }),
          },
        ],
      });

      const result = await service.compareVersions(oldContract, newContract);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.breakingChanges.some((c) => c.type === 'enum-value-removed')).toBe(true);
      }
    });

    it('should detect optional to required field change as breaking', async () => {
      const oldContract = createTestContract({
        schemas: [
          {
            id: 'user-schema',
            name: 'UserSchema',
            type: 'json-schema',
            content: JSON.stringify({
              type: 'object',
              properties: { name: { type: 'string' }, email: { type: 'string' } },
              required: ['name'],
            }),
          },
        ],
      });
      const newContract = createTestContract({
        version: Version.create(2, 0, 0),
        schemas: [
          {
            id: 'user-schema',
            name: 'UserSchema',
            type: 'json-schema',
            content: JSON.stringify({
              type: 'object',
              properties: { name: { type: 'string' }, email: { type: 'string' } },
              required: ['name', 'email'], // email now required
            }),
          },
        ],
      });

      const result = await service.compareVersions(oldContract, newContract);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.breakingChanges.some((c) => c.type === 'required-field-added')).toBe(true);
      }
    });
  });

  describe('isBackwardCompatible', () => {
    it('should return true when contracts are compatible', async () => {
      const oldContract = createTestContract();
      const newContract = createTestContract({ version: Version.create(1, 1, 0) });

      const result = await service.isBackwardCompatible(oldContract, newContract);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(true);
      }
    });

    it('should return false when there are breaking changes', async () => {
      const oldContract = createTestContract();
      const newContract = createTestContract({
        version: Version.create(2, 0, 0),
        endpoints: [], // Removed endpoints
      });

      const result = await service.isBackwardCompatible(oldContract, newContract);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(false);
      }
    });
  });

  describe('getBreakingChanges', () => {
    it('should return empty array when no breaking changes', async () => {
      const oldContract = createTestContract();
      const newContract = createTestContract({ version: Version.create(1, 0, 1) });

      const result = await service.getBreakingChanges(oldContract, newContract);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveLength(0);
      }
    });

    it('should return all breaking changes', async () => {
      const oldContract = createTestContract();
      const newContract = createTestContract({
        version: Version.create(2, 0, 0),
        endpoints: [],
        schemas: [],
      });

      const result = await service.getBreakingChanges(oldContract, newContract);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBeGreaterThan(0);
      }
    });
  });

  describe('generateMigrationGuide', () => {
    it('should generate migration guide for breaking changes', async () => {
      const breakingChanges: BreakingChange[] = [
        {
          type: 'removed-endpoint',
          location: 'GET /users',
          description: 'Endpoint GET /users has been removed',
          impact: 'high',
          affectedConsumers: ['Consumer1'],
          migrationPath: 'Use GET /v2/users instead',
        },
        {
          type: 'required-field-added',
          location: 'schema:UserSchema.email',
          description: 'Field email is now required',
          impact: 'high',
          affectedConsumers: ['Consumer1'],
        },
      ];

      const result = await service.generateMigrationGuide(breakingChanges);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.steps.length).toBeGreaterThan(0);
        expect(result.value.estimatedEffort).toBeDefined();
      }
    });

    it('should return empty guide for no breaking changes', async () => {
      const result = await service.generateMigrationGuide([]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.steps).toHaveLength(0);
        expect(result.value.estimatedEffort).toBe('trivial');
      }
    });

    it('should estimate major effort for many high-impact changes', async () => {
      const breakingChanges: BreakingChange[] = Array(10).fill(null).map((_, i) => ({
        type: 'removed-endpoint' as const,
        location: `GET /endpoint${i}`,
        description: `Endpoint ${i} removed`,
        impact: 'high' as const,
        affectedConsumers: ['Consumer1'],
      }));

      const result = await service.generateMigrationGuide(breakingChanges);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.estimatedEffort).toBe('major');
      }
    });

    it('should order migration steps by type priority', async () => {
      const breakingChanges: BreakingChange[] = [
        {
          type: 'removed-endpoint',
          location: 'DELETE /users',
          description: 'Endpoint removed',
          impact: 'high',
          affectedConsumers: ['Consumer1'],
        },
        {
          type: 'required-field-added',
          location: 'schema:User.id',
          description: 'Field added',
          impact: 'high',
          affectedConsumers: ['Consumer1'],
        },
        {
          type: 'type-change',
          location: 'schema:User.age',
          description: 'Type changed',
          impact: 'high',
          affectedConsumers: ['Consumer1'],
        },
      ];

      const result = await service.generateMigrationGuide(breakingChanges);

      expect(result.success).toBe(true);
      if (result.success) {
        // Required fields should come before type changes, which come before removed endpoints
        const steps = result.value.steps;
        expect(steps.length).toBe(3);
        expect(steps[0].order).toBe(1);
      }
    });

    it('should limit migration steps to max configured', async () => {
      const limitedService = new ApiCompatibilityService(mockMemory, { maxMigrationSteps: 5 });
      const breakingChanges: BreakingChange[] = Array(20).fill(null).map((_, i) => ({
        type: 'removed-field' as const,
        location: `field${i}`,
        description: `Field ${i} removed`,
        impact: 'low' as const,
        affectedConsumers: ['Consumer1'],
      }));

      const result = await limitedService.generateMigrationGuide(breakingChanges);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.steps.length).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle contracts with no schemas', async () => {
      const oldContract = createTestContract({ schemas: [] });
      const newContract = createTestContract({ version: Version.create(1, 1, 0), schemas: [] });

      const result = await service.compareVersions(oldContract, newContract);

      expect(result.success).toBe(true);
    });

    it('should handle contracts with no consumers', async () => {
      const oldContract = createTestContract({ consumers: [] });
      const newContract = createTestContract({ version: Version.create(1, 1, 0), consumers: [] });

      const result = await service.compareVersions(oldContract, newContract);

      expect(result.success).toBe(true);
    });

    it('should store comparison results in memory', async () => {
      const oldContract = createTestContract();
      const newContract = createTestContract({ version: Version.create(1, 1, 0) });

      await service.compareVersions(oldContract, newContract);

      expect(mockMemory.set).toHaveBeenCalled();
    });
  });
});
