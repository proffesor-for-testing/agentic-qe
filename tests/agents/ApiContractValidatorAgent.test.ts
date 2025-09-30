/**
 * Unit tests for ApiContractValidatorAgent
 * Following TDD approach with comprehensive test coverage
 */

import { EventEmitter } from 'events';
import { ApiContractValidatorAgent } from '../../src/agents/ApiContractValidatorAgent';
import {
  AgentStatus,
  QEAgentType,
  ApiContractValidatorConfig,
  MemoryStore,
  AgentContext,
  WEEK3_EVENT_TYPES
} from '../../src/types';

describe('ApiContractValidatorAgent', () => {
  let agent: ApiContractValidatorAgent;
  let mockMemoryStore: MemoryStore;
  let mockEventBus: EventEmitter;
  let mockContext: AgentContext;

  const sampleOpenAPISchema = {
    openapi: '3.0.0',
    info: {
      title: 'User API',
      version: '1.0.0'
    },
    paths: {
      '/users/{id}': {
        get: {
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' }
            }
          ],
          responses: {
            200: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['id', 'email', 'name'],
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      email: { type: 'string', format: 'email' },
                      name: { type: 'string' },
                      age: { type: 'integer', minimum: 0, maximum: 120 }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  };

  beforeEach(() => {
    mockMemoryStore = {
      store: jest.fn().mockResolvedValue(undefined),
      retrieve: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(true),
      clear: jest.fn().mockResolvedValue(undefined)
    };

    mockEventBus = new EventEmitter();
    mockContext = {
      id: 'test-context',
      type: 'test',
      status: AgentStatus.IDLE
    };

    const config: ApiContractValidatorConfig = {
      schemaFormats: ['openapi', 'swagger', 'graphql'],
      breakingChangeDetection: true,
      semanticVersioning: true,
      consumerImpactAnalysis: true,
      contractDiffing: true
    };

    agent = new ApiContractValidatorAgent({
      type: QEAgentType.API_CONTRACT_VALIDATOR,
      capabilities: [
        {
          name: 'schema-validation',
          version: '1.0.0',
          description: 'Validates API schemas'
        }
      ],
      context: mockContext,
      memoryStore: mockMemoryStore,
      eventBus: mockEventBus,
      validatorConfig: config
    });
  });

  afterEach(async () => {
    if (agent) {
      await agent.terminate();
    }
    // Clean up event listeners
    mockEventBus.removeAllListeners();
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  describe('Initialization', () => {
    it('should initialize with correct agent type', () => {
      expect(agent.getStatus().agentId.type).toBe(QEAgentType.API_CONTRACT_VALIDATOR);
    });

    it('should have all required capabilities', () => {
      const capabilities = agent.getCapabilities();
      expect(capabilities.some(cap => cap.name === 'schema-validation')).toBe(true);
    });

    it('should initialize in INITIALIZING status', () => {
      expect(agent.getStatus().status).toBe(AgentStatus.INITIALIZING);
    });

    it('should transition to ACTIVE status after initialization', async () => {
      await agent.initialize();
      expect(agent.getStatus().status).toBe(AgentStatus.ACTIVE);
    });
  });

  describe('OpenAPI Schema Validation', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should validate a valid OpenAPI schema', async () => {
      const result = await agent.validateContract({
        schema: sampleOpenAPISchema,
        format: 'openapi'
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields in schema', async () => {
      const invalidSchema = {
        openapi: '3.0.0',
        info: {
          title: 'Invalid API'
          // Missing version
        },
        paths: {}
      };

      const result = await agent.validateContract({
        schema: invalidSchema,
        format: 'openapi'
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate request parameters', async () => {
      const request = {
        params: { id: '550e8400-e29b-41d4-a716-446655440000' },
        query: {},
        body: {}
      };

      const response = {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'alice@example.com',
          name: 'Alice Johnson',
          age: 30
        }
      };

      const result = await agent.validateRequestResponse({
        request,
        response,
        schema: sampleOpenAPISchema,
        endpoint: '/users/{id}',
        method: 'get'
      });

      expect(result.valid).toBe(true);
    });

    it('should detect missing required path parameters', async () => {
      const request = {
        params: {}, // Missing 'id'
        query: {},
        body: {}
      };

      const response = {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: {}
      };

      const result = await agent.validateRequestResponse({
        request,
        response,
        schema: sampleOpenAPISchema,
        endpoint: '/users/{id}',
        method: 'get'
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'MISSING_PATH_PARAM')).toBe(true);
    });

    it('should validate response schema', async () => {
      const request = {
        params: { id: '550e8400-e29b-41d4-a716-446655440000' },
        query: {},
        body: {}
      };

      const invalidResponse = {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          id: 'not-a-uuid', // Invalid UUID
          email: 'invalid-email', // Invalid email
          // name missing - required field
          age: 150 // Exceeds maximum
        }
      };

      const result = await agent.validateRequestResponse({
        request,
        response: invalidResponse,
        schema: sampleOpenAPISchema,
        endpoint: '/users/{id}',
        method: 'get'
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Breaking Change Detection', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should detect removed endpoints as breaking changes', async () => {
      const baselineSchema = {
        ...sampleOpenAPISchema,
        paths: {
          ...sampleOpenAPISchema.paths,
          '/users': {
            get: {
              responses: {
                200: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: { type: 'object' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const candidateSchema = sampleOpenAPISchema; // Missing /users endpoint

      const result = await agent.detectBreakingChanges({
        baseline: baselineSchema,
        candidate: candidateSchema
      });

      expect(result.hasBreakingChanges).toBe(true);
      expect(result.breaking.some(c => c.type === 'ENDPOINT_REMOVED')).toBe(true);
    });

    it('should detect removed required fields as breaking changes', async () => {
      const baselineSchema = sampleOpenAPISchema;

      const candidateSchema = {
        ...sampleOpenAPISchema,
        paths: {
          '/users/{id}': {
            get: {
              ...sampleOpenAPISchema.paths['/users/{id}'].get,
              responses: {
                200: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        required: ['id', 'email'], // 'name' removed
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          email: { type: 'string', format: 'email' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = await agent.detectBreakingChanges({
        baseline: baselineSchema,
        candidate: candidateSchema
      });

      expect(result.hasBreakingChanges).toBe(true);
      expect(result.breaking.some(c => c.type === 'REQUIRED_FIELD_REMOVED')).toBe(true);
    });

    it('should detect parameter type changes as breaking', async () => {
      const baselineSchema = {
        ...sampleOpenAPISchema,
        paths: {
          '/users/{id}': {
            post: {
              parameters: [
                {
                  name: 'quantity',
                  in: 'query',
                  schema: { type: 'integer' }
                }
              ],
              responses: { 201: { description: 'Created' } }
            }
          }
        }
      };

      const candidateSchema = {
        ...sampleOpenAPISchema,
        paths: {
          '/users/{id}': {
            post: {
              parameters: [
                {
                  name: 'quantity',
                  in: 'query',
                  schema: { type: 'string' } // Type changed
                }
              ],
              responses: { 201: { description: 'Created' } }
            }
          }
        }
      };

      const result = await agent.detectBreakingChanges({
        baseline: baselineSchema,
        candidate: candidateSchema
      });

      expect(result.hasBreakingChanges).toBe(true);
      expect(result.breaking.some(c => c.type === 'PARAM_TYPE_CHANGED')).toBe(true);
    });

    it('should allow adding optional fields as non-breaking', async () => {
      const baselineSchema = sampleOpenAPISchema;

      const candidateSchema = {
        ...sampleOpenAPISchema,
        paths: {
          '/users/{id}': {
            get: {
              ...sampleOpenAPISchema.paths['/users/{id}'].get,
              responses: {
                200: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        required: ['id', 'email', 'name'],
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          email: { type: 'string', format: 'email' },
                          name: { type: 'string' },
                          age: { type: 'integer' },
                          profilePicture: { type: 'string' } // New optional field
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = await agent.detectBreakingChanges({
        baseline: baselineSchema,
        candidate: candidateSchema
      });

      expect(result.hasBreakingChanges).toBe(false);
      expect(result.nonBreaking.some(c => c.type === 'FIELD_ADDED')).toBe(true);
    });

    it('should detect new required parameters as breaking', async () => {
      const baselineSchema = sampleOpenAPISchema;

      const candidateSchema = {
        ...sampleOpenAPISchema,
        paths: {
          '/users/{id}': {
            get: {
              parameters: [
                ...sampleOpenAPISchema.paths['/users/{id}'].get.parameters,
                {
                  name: 'apiKey',
                  in: 'header',
                  required: true,
                  schema: { type: 'string' }
                }
              ],
              responses: sampleOpenAPISchema.paths['/users/{id}'].get.responses
            }
          }
        }
      };

      const result = await agent.detectBreakingChanges({
        baseline: baselineSchema,
        candidate: candidateSchema
      });

      expect(result.hasBreakingChanges).toBe(true);
      expect(result.breaking.some(c => c.type === 'NEW_REQUIRED_PARAM')).toBe(true);
    });
  });

  describe('Semantic Versioning Validation', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should require major version bump for breaking changes', async () => {
      const changes = {
        breaking: [
          {
            type: 'REQUIRED_FIELD_REMOVED',
            severity: 'CRITICAL' as const,
            field: 'username'
          }
        ],
        nonBreaking: [],
        hasBreakingChanges: true
      };

      const result = await agent.validateVersionBump({
        currentVersion: '2.4.0',
        proposedVersion: '2.5.0',
        changes
      });

      expect(result.valid).toBe(false);
      expect(result.requiredBump).toBe('MAJOR');
    });

    it('should accept major version bump for breaking changes', async () => {
      const changes = {
        breaking: [
          {
            type: 'REQUIRED_FIELD_REMOVED',
            severity: 'CRITICAL' as const,
            field: 'username'
          }
        ],
        nonBreaking: [],
        hasBreakingChanges: true
      };

      const result = await agent.validateVersionBump({
        currentVersion: '2.4.0',
        proposedVersion: '3.0.0',
        changes
      });

      expect(result.valid).toBe(true);
      expect(result.actualBump).toBe('MAJOR');
    });

    it('should require minor version bump for new features', async () => {
      const changes = {
        breaking: [],
        nonBreaking: [
          {
            type: 'FIELD_ADDED',
            field: 'profilePicture'
          }
        ],
        hasBreakingChanges: false
      };

      const result = await agent.validateVersionBump({
        currentVersion: '2.4.0',
        proposedVersion: '2.4.1',
        changes
      });

      expect(result.valid).toBe(false);
      expect(result.requiredBump).toBe('MINOR');
    });

    it('should accept patch version for bug fixes only', async () => {
      const changes = {
        breaking: [],
        nonBreaking: [],
        hasBreakingChanges: false
      };

      const result = await agent.validateVersionBump({
        currentVersion: '2.4.0',
        proposedVersion: '2.4.1',
        changes
      });

      expect(result.valid).toBe(true);
      expect(result.actualBump).toBe('PATCH');
    });
  });

  describe('Consumer Impact Analysis', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should identify affected consumers', async () => {
      const changes = {
        breaking: [
          {
            type: 'REQUIRED_FIELD_REMOVED',
            endpoint: 'GET /users/{id}',
            field: 'username',
            severity: 'CRITICAL' as const
          }
        ],
        nonBreaking: []
      };

      const consumers = [
        {
          name: 'Mobile App',
          team: 'Mobile Engineering',
          contact: 'mobile@example.com',
          apiUsage: [
            {
              endpoint: '/users/{id}',
              method: 'GET',
              requestsPerDay: 450000
            }
          ]
        },
        {
          name: 'Web App',
          team: 'Web Engineering',
          contact: 'web@example.com',
          apiUsage: [
            {
              endpoint: '/products',
              method: 'GET',
              requestsPerDay: 200000
            }
          ]
        }
      ];

      const result = await agent.analyzeConsumerImpact({
        changes,
        consumers
      });

      expect(result.totalAffectedConsumers).toBe(1);
      expect(result.impacts[0].consumer).toBe('Mobile App');
    });

    it('should calculate migration effort', async () => {
      const changes = {
        breaking: [
          {
            type: 'PARAM_TYPE_CHANGED',
            endpoint: 'POST /orders',
            param: 'quantity',
            oldType: 'integer',
            newType: 'string',
            severity: 'HIGH' as const
          }
        ],
        nonBreaking: []
      };

      const consumers = [
        {
          name: 'Partner Integration',
          team: 'External',
          contact: 'partner@example.com',
          apiUsage: [
            {
              endpoint: '/orders',
              method: 'POST',
              requestsPerDay: 120000
            }
          ]
        }
      ];

      const result = await agent.analyzeConsumerImpact({
        changes,
        consumers
      });

      expect(result.impacts[0].estimatedMigrationTime).toBeDefined();
      expect(result.impacts[0].priority).toBeDefined();
    });
  });

  describe('GraphQL Schema Validation', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should validate GraphQL schema syntax', async () => {
      const validGraphQLSchema = `
        type Query {
          user(id: ID!): User
          users: [User!]!
        }

        type User {
          id: ID!
          email: String!
          name: String!
          age: Int
        }
      `;

      const result = await agent.validateContract({
        schema: validGraphQLSchema,
        format: 'graphql'
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect GraphQL syntax errors', async () => {
      const invalidGraphQLSchema = `
        type Query {
          user(id: ID!): User
          users: [User!]!

        type User {
          id: ID!
          email: String!
          name String! // Missing colon
        }
      `;

      const result = await agent.validateContract({
        schema: invalidGraphQLSchema,
        format: 'graphql'
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect removed GraphQL types as breaking', async () => {
      const baselineSchema = `
        type Query {
          user(id: ID!): User
          post(id: ID!): Post
        }

        type User {
          id: ID!
          username: String!
        }

        type Post {
          id: ID!
          title: String!
        }
      `;

      const candidateSchema = `
        type Query {
          user(id: ID!): User
        }

        type User {
          id: ID!
          username: String!
        }
      `;

      const result = await agent.detectBreakingChanges({
        baseline: baselineSchema,
        candidate: candidateSchema,
        format: 'graphql'
      });

      expect(result.hasBreakingChanges).toBe(true);
      expect(result.breaking.some(c => c.type === 'TYPE_REMOVED')).toBe(true);
    });
  });

  describe('Contract Diffing', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should generate detailed diff report', async () => {
      const baselineSchema = sampleOpenAPISchema;

      const candidateSchema = {
        ...sampleOpenAPISchema,
        paths: {
          '/users/{id}': {
            get: {
              ...sampleOpenAPISchema.paths['/users/{id}'].get,
              responses: {
                200: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        required: ['id', 'email', 'name'],
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          email: { type: 'string', format: 'email' },
                          name: { type: 'string' },
                          age: { type: 'integer' },
                          profilePicture: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = await agent.generateDiff({
        baseline: baselineSchema,
        candidate: candidateSchema,
        format: 'markdown'
      });

      expect(result).toContain('profilePicture');
      expect(result).toContain('was added');
    });
  });

  describe('Migration Guide Generation', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should generate migration guide for breaking changes', async () => {
      const changes = {
        breaking: [
          {
            type: 'REQUIRED_FIELD_REMOVED',
            endpoint: 'GET /users/{id}',
            field: 'username',
            severity: 'CRITICAL' as const,
            message: "Required field 'username' was removed"
          }
        ],
        nonBreaking: [
          {
            type: 'FIELD_ADDED',
            endpoint: 'GET /users/{id}',
            field: 'profilePicture',
            message: "Optional field 'profilePicture' was added"
          }
        ]
      };

      const result = await agent.generateMigrationGuide({
        fromVersion: '2.4.0',
        toVersion: '3.0.0',
        changes
      });

      expect(result).toContain('Migration Guide');
      expect(result).toContain('username');
      expect(result).toContain('Breaking Changes');
    });
  });

  describe('Memory Integration', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should store validation results in memory', async () => {
      const result = await agent.validateContract({
        schema: sampleOpenAPISchema,
        format: 'openapi'
      });

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        expect.stringContaining('validation-result'),
        expect.objectContaining({
          result: expect.objectContaining({ valid: true })
        }),
        undefined
      );
    });

    it('should store breaking changes in memory', async () => {
      const changes = await agent.detectBreakingChanges({
        baseline: sampleOpenAPISchema,
        candidate: sampleOpenAPISchema
      });

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        expect.stringContaining('breaking-changes'),
        expect.any(Object),
        undefined
      );
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should emit event when contract is validated', async () => {
      const eventHandler = jest.fn();
      mockEventBus.on(WEEK3_EVENT_TYPES.API_CONTRACT_VALIDATED, eventHandler);

      await agent.validateContract({
        schema: sampleOpenAPISchema,
        format: 'openapi'
      });

      expect(eventHandler).toHaveBeenCalled();
    });

    it('should emit event when breaking changes are detected', async () => {
      const eventHandler = jest.fn();
      mockEventBus.on(WEEK3_EVENT_TYPES.BREAKING_CHANGE_DETECTED, eventHandler);

      const baselineSchema = {
        openapi: '3.0.0',
        info: { title: 'User API', version: '1.0.0' },
        paths: {
          '/users/{id}': {
            get: {
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
              ],
              responses: {
                200: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        required: ['id', 'email', 'name', 'username'], // username is here
                        properties: {
                          id: { type: 'string' },
                          email: { type: 'string' },
                          name: { type: 'string' },
                          username: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      // candidate has username removed - breaking change
      await agent.detectBreakingChanges({
        baseline: baselineSchema,
        candidate: sampleOpenAPISchema
      });

      expect(eventHandler).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should handle invalid schema gracefully', async () => {
      const invalidSchema = null;

      await expect(
        agent.validateContract({
          schema: invalidSchema as any,
          format: 'openapi'
        })
      ).rejects.toThrow();
    });

    it('should handle malformed OpenAPI schema', async () => {
      const malformedSchema = {
        openapi: '3.0.0',
        // Missing required fields
      };

      const result = await agent.validateContract({
        schema: malformedSchema,
        format: 'openapi'
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});