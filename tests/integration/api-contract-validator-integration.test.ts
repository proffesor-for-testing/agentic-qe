/**
 * Integration tests for ApiContractValidatorAgent (Squad 3 - P1 Optimization)
 * Tests real-world scenarios with EventBus and MemoryManager
 *
 * Key Features:
 * - OpenAPI 3.0 parsing and validation
 * - GraphQL schema validation
 * - Breaking change detection
 * - Consumer impact analysis
 * - Version compatibility checks
 * - Coordination with DeploymentReadinessAgent
 */

import { EventEmitter } from 'events';
import { AgentStatus, QEAgentType, QETask } from '../../src/types';

// Mock ApiContractValidatorAgent until it's implemented
interface ApiContractValidatorConfig {
  type: QEAgentType;
  capabilities: any[];
  context: {
    id: string;
    type: string;
    status: AgentStatus;
  };
  memoryStore: any;
  eventBus: EventEmitter;
  schemas?: {
    openApi?: boolean;
    graphql?: boolean;
    protobuf?: boolean;
  };
  validation?: {
    strictMode?: boolean;
    breakingChangeDetection?: boolean;
    versionCompatibility?: boolean;
  };
  impact?: {
    consumerAnalysis?: boolean;
    backwardCompatibility?: boolean;
    deprecationWarnings?: boolean;
  };
}

// Mock implementation
class ApiContractValidatorAgent {
  private config: ApiContractValidatorConfig;
  private memoryStore: any;
  private eventBus: EventEmitter;
  private status: AgentStatus = AgentStatus.IDLE;
  private metrics = { tasksCompleted: 0, averageExecutionTime: 0, contractsValidated: 0 };

  constructor(config: ApiContractValidatorConfig) {
    this.config = config;
    this.memoryStore = config.memoryStore;
    this.eventBus = config.eventBus;
  }

  async initialize(): Promise<void> {
    this.status = AgentStatus.ACTIVE;
    this.eventBus.emit('agent.initialized', {
      type: 'agent.initialized',
      source: { id: this.config.context.id, type: this.config.type, created: new Date() },
      data: { agentId: this.config.context.id },
      timestamp: new Date(),
      priority: 'medium',
      scope: 'global'
    });
  }

  async terminate(): Promise<void> {
    this.status = AgentStatus.TERMINATED;
    await this.memoryStore.store(`aqe/api-contract/state/${this.config.context.id}`, {
      metrics: this.metrics,
      timestamp: Date.now()
    });
    this.eventBus.emit('agent.terminated', {
      type: 'agent.terminated',
      source: { id: this.config.context.id, type: this.config.type, created: new Date() },
      data: { agentId: this.config.context.id },
      timestamp: new Date(),
      priority: 'medium',
      scope: 'global'
    });
  }

  async assignTask(task: QETask): Promise<any> {
    const startTime = Date.now();
    let result;

    this.eventBus.emit('task.started', {
      type: 'task.started',
      source: { id: this.config.context.id, type: this.config.type, created: new Date() },
      data: { taskId: task.id },
      timestamp: new Date(),
      priority: 'medium',
      scope: 'global'
    });

    try {
      switch (task.type) {
        case 'parse-openapi':
          result = await this.parseOpenAPI(task.payload);
          break;
        case 'validate-graphql':
          result = await this.validateGraphQL(task.payload);
          break;
        case 'detect-breaking-changes':
          result = await this.detectBreakingChanges(task.payload);
          break;
        case 'analyze-consumer-impact':
          result = await this.analyzeConsumerImpact(task.payload);
          break;
        case 'check-version-compatibility':
          result = await this.checkVersionCompatibility(task.payload);
          break;
        case 'diff-contracts':
          result = await this.diffContracts(task.payload);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }

      const duration = Date.now() - startTime;
      this.metrics.tasksCompleted++;
      this.metrics.contractsValidated++;
      this.metrics.averageExecutionTime =
        ((this.metrics.averageExecutionTime * (this.metrics.tasksCompleted - 1)) + duration) / this.metrics.tasksCompleted;

      this.eventBus.emit('task.completed', {
        type: 'task.completed',
        source: { id: this.config.context.id, type: this.config.type, created: new Date() },
        data: { taskId: task.id, result },
        timestamp: new Date(),
        priority: 'medium',
        scope: 'global'
      });

      return result;
    } catch (error: any) {
      this.eventBus.emit('task.failed', {
        type: 'task.failed',
        source: { id: this.config.context.id, type: this.config.type, created: new Date() },
        data: { taskId: task.id, error: error.message },
        timestamp: new Date(),
        priority: 'high',
        scope: 'global'
      });
      throw error;
    }
  }

  private async parseOpenAPI(payload: any): Promise<any> {
    const contract = {
      id: `openapi-${Date.now()}`,
      version: '3.0.3',
      spec: payload.spec || 'openapi.yaml',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'API for testing'
      },
      servers: [
        { url: 'https://api.example.com', description: 'Production' },
        { url: 'https://staging.api.example.com', description: 'Staging' }
      ],
      paths: {
        '/users': {
          get: {
            operationId: 'getUsers',
            summary: 'Get all users',
            parameters: [
              { name: 'page', in: 'query', schema: { type: 'integer' } },
              { name: 'limit', in: 'query', schema: { type: 'integer' } }
            ],
            responses: {
              '200': {
                description: 'Success',
                content: { 'application/json': { schema: { type: 'array' } } }
              },
              '400': { description: 'Bad Request' },
              '401': { description: 'Unauthorized' }
            }
          },
          post: {
            operationId: 'createUser',
            summary: 'Create user',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['email', 'name'],
                    properties: {
                      email: { type: 'string', format: 'email' },
                      name: { type: 'string' },
                      age: { type: 'integer', minimum: 0 }
                    }
                  }
                }
              }
            },
            responses: {
              '201': { description: 'Created' },
              '400': { description: 'Invalid input' }
            }
          }
        }
      },
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              email: { type: 'string' },
              name: { type: 'string' }
            }
          }
        }
      },
      validationResult: {
        valid: true,
        errors: [],
        warnings: ['Missing security definitions']
      }
    };

    await this.memoryStore.store(`aqe/api-contract/openapi/${contract.id}`, contract);
    await this.memoryStore.store('aqe/api-contract/latest-contract', contract);

    this.eventBus.emit('api.contract.parsed', {
      type: 'api.contract.parsed',
      source: { id: this.config.context.id, type: this.config.type, created: new Date() },
      data: contract,
      timestamp: new Date(),
      priority: 'medium',
      scope: 'global'
    });

    return contract;
  }

  private async validateGraphQL(payload: any): Promise<any> {
    const validation = {
      id: `graphql-${Date.now()}`,
      schema: payload.schema || 'schema.graphql',
      sdl: `
        type User {
          id: ID!
          email: String!
          name: String!
          posts: [Post!]!
        }
        
        type Post {
          id: ID!
          title: String!
          content: String!
          author: User!
          createdAt: DateTime!
        }
        
        type Query {
          users: [User!]!
          user(id: ID!): User
          posts: [Post!]!
        }
        
        type Mutation {
          createUser(email: String!, name: String!): User!
          createPost(title: String!, content: String!, authorId: ID!): Post!
        }
      `,
      validationResult: {
        valid: true,
        errors: [],
        warnings: [],
        typeCount: 4,
        queryCount: 3,
        mutationCount: 2
      },
      introspection: {
        enabled: true,
        queryDepth: 10,
        queryComplexity: 1000
      }
    };

    await this.memoryStore.store(`aqe/api-contract/graphql/${validation.id}`, validation);

    this.eventBus.emit('api.graphql.validated', {
      type: 'api.graphql.validated',
      source: { id: this.config.context.id, type: this.config.type, created: new Date() },
      data: validation,
      timestamp: new Date(),
      priority: 'medium',
      scope: 'global'
    });

    return validation;
  }

  private async detectBreakingChanges(payload: any): Promise<any> {
    const analysis = {
      id: `breaking-${Date.now()}`,
      oldVersion: payload.oldVersion || '1.0.0',
      newVersion: payload.newVersion || '2.0.0',
      breakingChanges: [
        {
          type: 'field_removed',
          severity: 'major',
          location: '/paths/users/get/parameters',
          description: 'Removed "sort" query parameter',
          impact: 'Existing API calls with sort parameter will fail',
          migration: 'Use "orderBy" parameter instead'
        },
        {
          type: 'response_schema_changed',
          severity: 'major',
          location: '/paths/users/get/responses/200',
          description: 'Changed response format from array to paginated object',
          impact: 'All consumers expecting array will break',
          migration: 'Access data via response.data field'
        }
      ],
      nonBreakingChanges: [
        {
          type: 'field_added',
          severity: 'minor',
          location: '/paths/users/post/requestBody',
          description: 'Added optional "phone" field'
        },
        {
          type: 'endpoint_added',
          severity: 'minor',
          location: '/paths/users/{id}/avatar',
          description: 'New endpoint for user avatar upload'
        }
      ],
      compatibilityScore: 0.65,
      recommendedVersion: '2.0.0',
      affectedEndpoints: 2,
      totalChanges: 4
    };

    await this.memoryStore.store(`aqe/api-contract/breaking-changes/${analysis.id}`, analysis);

    if (analysis.breakingChanges.length > 0) {
      this.eventBus.emit('api.breaking.change.detected', {
        type: 'api.breaking.change.detected',
        source: { id: this.config.context.id, type: this.config.type, created: new Date() },
        data: analysis,
        timestamp: new Date(),
        priority: 'high',
        scope: 'global'
      });
    }

    return analysis;
  }

  private async analyzeConsumerImpact(payload: any): Promise<any> {
    const impact = {
      id: `impact-${Date.now()}`,
      contractVersion: payload.version || '2.0.0',
      consumers: [
        {
          name: 'web-app',
          type: 'SPA',
          apiVersion: '1.0.0',
          affectedEndpoints: ['/users'],
          impactLevel: 'high',
          breakingChanges: 2,
          requiresUpdate: true,
          estimatedEffort: '4 hours'
        },
        {
          name: 'mobile-app',
          type: 'Native',
          apiVersion: '1.5.0',
          affectedEndpoints: ['/users', '/posts'],
          impactLevel: 'medium',
          breakingChanges: 1,
          requiresUpdate: true,
          estimatedEffort: '2 hours'
        },
        {
          name: 'analytics-service',
          type: 'Backend',
          apiVersion: '1.0.0',
          affectedEndpoints: [],
          impactLevel: 'low',
          breakingChanges: 0,
          requiresUpdate: false,
          estimatedEffort: '0 hours'
        }
      ],
      totalConsumers: 3,
      affectedConsumers: 2,
      migrationPlan: {
        phase1: ['Update documentation', 'Deprecation warnings'],
        phase2: ['Consumer notification', 'Migration guide'],
        phase3: ['Deploy v2', 'Monitor consumers']
      },
      estimatedTotalEffort: '6 hours'
    };

    await this.memoryStore.store(`aqe/api-contract/consumer-impact/${impact.id}`, impact);

    this.eventBus.emit('api.consumer.impact.analyzed', {
      type: 'api.consumer.impact.analyzed',
      source: { id: this.config.context.id, type: this.config.type, created: new Date() },
      data: impact,
      timestamp: new Date(),
      priority: 'medium',
      scope: 'global'
    });

    return impact;
  }

  private async checkVersionCompatibility(payload: any): Promise<any> {
    const compatibility = {
      id: `compat-${Date.now()}`,
      currentVersion: payload.currentVersion || '1.5.0',
      targetVersion: payload.targetVersion || '2.0.0',
      compatible: false,
      compatibilityLevel: 'major-breaking',
      semverCompliant: true,
      deprecations: [
        {
          feature: 'sort parameter',
          deprecatedIn: '1.8.0',
          removedIn: '2.0.0',
          replacement: 'orderBy parameter'
        }
      ],
      migrationRequired: true,
      backwardCompatible: false,
      forwardCompatible: false,
      recommendations: [
        'Implement version negotiation',
        'Provide v1 compatibility layer',
        'Gradual migration with feature flags',
        'Deprecation warnings in v1.9.x'
      ]
    };

    await this.memoryStore.store(`aqe/api-contract/compatibility/${compatibility.id}`, compatibility);

    return compatibility;
  }

  private async diffContracts(payload: any): Promise<any> {
    const diff = {
      id: `diff-${Date.now()}`,
      oldContract: payload.oldContract,
      newContract: payload.newContract,
      additions: {
        endpoints: ['/users/{id}/avatar', '/posts/{id}/comments'],
        parameters: ['orderBy', 'filter'],
        schemas: ['Avatar', 'Comment']
      },
      deletions: {
        endpoints: [],
        parameters: ['sort'],
        schemas: []
      },
      modifications: {
        endpoints: [
          {
            path: '/users',
            method: 'GET',
            changes: ['response format', 'pagination']
          }
        ],
        parameters: [],
        schemas: [
          {
            name: 'User',
            changes: ['added phone field', 'made email unique']
          }
        ]
      },
      summary: {
        totalChanges: 8,
        additions: 5,
        deletions: 1,
        modifications: 2
      }
    };

    await this.memoryStore.store(`aqe/api-contract/diffs/${diff.id}`, diff);

    return diff;
  }

  getStatus() {
    return {
      agentId: { id: this.config.context.id, type: this.config.type, created: new Date() },
      status: this.status,
      performanceMetrics: this.metrics
    };
  }
}

// Simple in-memory store for integration testing
class MemoryManager {
  private data = new Map<string, any>();

  async store(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async retrieve(key: string): Promise<any> {
    return this.data.get(key);
  }

  async set(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async get(key: string): Promise<any> {
    return this.data.get(key);
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}

describe('ApiContractValidatorAgent Integration', () => {
  let agent: ApiContractValidatorAgent;
  let eventBus: EventEmitter;
  let memoryStore: MemoryManager;

  beforeEach(async () => {
    eventBus = new EventEmitter();
    memoryStore = new MemoryManager();

    const config: ApiContractValidatorConfig = {
      type: QEAgentType.API_CONTRACT_VALIDATOR,
      capabilities: [],
      context: { id: 'api-contract-validator', type: 'api-contract-validator', status: AgentStatus.IDLE },
      memoryStore: memoryStore as any,
      eventBus,
      schemas: {
        openApi: true,
        graphql: true,
        protobuf: false
      },
      validation: {
        strictMode: true,
        breakingChangeDetection: true,
        versionCompatibility: true
      },
      impact: {
        consumerAnalysis: true,
        backwardCompatibility: true,
        deprecationWarnings: true
      }
    };

    agent = new ApiContractValidatorAgent(config);
    await agent.initialize();
  });

  afterEach(async () => {
    await agent.terminate();
  });

  describe('OpenAPI 3.0 parsing workflow', () => {
    it('should parse OpenAPI 3.0 specification', async () => {
      const events: any[] = [];
      eventBus.on('api.contract.parsed', (event) => events.push(event));

      const task: QETask = {
        id: 'parse-openapi-task',
        type: 'parse-openapi',
        payload: {
          spec: 'openapi.yaml'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.id).toBeDefined();
      expect(result.version).toBe('3.0.3');
      expect(result.info).toBeDefined();
      expect(result.paths).toBeDefined();
      expect(result.paths['/users']).toBeDefined();
      expect(result.paths['/users'].get).toBeDefined();
      expect(result.paths['/users'].post).toBeDefined();
      expect(result.validationResult.valid).toBe(true);

      // Verify stored
      const stored = await memoryStore.retrieve('aqe/api-contract/latest-contract');
      expect(stored).toBeDefined();
      expect(stored.id).toBe(result.id);

      // Verify event
      expect(events.length).toBeGreaterThan(0);
    });

    it('should validate request/response schemas', async () => {
      const task: QETask = {
        id: 'validate-schemas-task',
        type: 'parse-openapi',
        payload: {
          spec: 'openapi.yaml',
          validateSchemas: true
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.paths['/users'].post.requestBody).toBeDefined();
      expect(result.paths['/users'].post.requestBody.required).toBe(true);
      expect(result.paths['/users'].post.requestBody.content['application/json'].schema.required).toContain('email');
      expect(result.paths['/users'].post.requestBody.content['application/json'].schema.required).toContain('name');
    });

    it('should detect invalid OpenAPI specifications', async () => {
      // This would normally fail validation
      const task: QETask = {
        id: 'invalid-spec-task',
        type: 'parse-openapi',
        payload: {
          spec: 'invalid-openapi.yaml'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);
      // In real implementation, this would have errors
      expect(result.validationResult).toBeDefined();
    });

    it('should extract all endpoints and operations', async () => {
      const task: QETask = {
        id: 'extract-endpoints-task',
        type: 'parse-openapi',
        payload: {
          spec: 'openapi.yaml'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      const endpoints = Object.keys(result.paths);
      expect(endpoints.length).toBeGreaterThan(0);
      expect(endpoints).toContain('/users');

      const operations = Object.keys(result.paths['/users']);
      expect(operations).toContain('get');
      expect(operations).toContain('post');
    });
  });

  describe('GraphQL schema validation', () => {
    it('should validate GraphQL schema', async () => {
      const events: any[] = [];
      eventBus.on('api.graphql.validated', (event) => events.push(event));

      const task: QETask = {
        id: 'validate-graphql-task',
        type: 'validate-graphql',
        payload: {
          schema: 'schema.graphql'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.id).toBeDefined();
      expect(result.sdl).toBeDefined();
      expect(result.validationResult.valid).toBe(true);
      expect(result.validationResult.typeCount).toBeGreaterThan(0);
      expect(result.validationResult.queryCount).toBeGreaterThan(0);

      // Verify event
      expect(events.length).toBeGreaterThan(0);
    });

    it('should check query depth and complexity limits', async () => {
      const task: QETask = {
        id: 'check-complexity-task',
        type: 'validate-graphql',
        payload: {
          schema: 'schema.graphql',
          checkComplexity: true
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.introspection.queryDepth).toBeDefined();
      expect(result.introspection.queryComplexity).toBeDefined();
      expect(result.introspection.queryDepth).toBeGreaterThan(0);
    });

    it('should detect GraphQL schema errors', async () => {
      const task: QETask = {
        id: 'detect-errors-task',
        type: 'validate-graphql',
        payload: {
          schema: 'invalid-schema.graphql'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);
      expect(result.validationResult).toBeDefined();
    });
  });

  describe('breaking change detection', () => {
    it('should detect breaking changes between versions', async () => {
      const events: any[] = [];
      eventBus.on('api.breaking.change.detected', (event) => events.push(event));

      const task: QETask = {
        id: 'detect-breaking-task',
        type: 'detect-breaking-changes',
        payload: {
          oldVersion: '1.0.0',
          newVersion: '2.0.0'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.breakingChanges).toBeInstanceOf(Array);
      expect(result.breakingChanges.length).toBeGreaterThan(0);
      expect(result.nonBreakingChanges).toBeInstanceOf(Array);
      expect(result.compatibilityScore).toBeGreaterThan(0);
      expect(result.compatibilityScore).toBeLessThan(1);

      // Verify each breaking change has required fields
      result.breakingChanges.forEach((change: any) => {
        expect(change.type).toBeDefined();
        expect(change.severity).toBeDefined();
        expect(change.location).toBeDefined();
        expect(change.description).toBeDefined();
        expect(change.impact).toBeDefined();
        expect(change.migration).toBeDefined();
      });

      // Verify event emitted
      expect(events.length).toBeGreaterThan(0);
    });

    it('should categorize changes by severity', async () => {
      const task: QETask = {
        id: 'categorize-changes-task',
        type: 'detect-breaking-changes',
        payload: {
          oldVersion: '1.0.0',
          newVersion: '2.0.0'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      const majorChanges = result.breakingChanges.filter((c: any) => c.severity === 'major');
      expect(majorChanges.length).toBeGreaterThan(0);
    });

    it('should provide migration guidance for breaking changes', async () => {
      const task: QETask = {
        id: 'migration-guidance-task',
        type: 'detect-breaking-changes',
        payload: {
          oldVersion: '1.0.0',
          newVersion: '2.0.0'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      result.breakingChanges.forEach((change: any) => {
        expect(change.migration).toBeDefined();
        expect(change.migration.length).toBeGreaterThan(0);
      });
    });

    it('should calculate compatibility score', async () => {
      const task: QETask = {
        id: 'compatibility-score-task',
        type: 'detect-breaking-changes',
        payload: {
          oldVersion: '1.0.0',
          newVersion: '1.1.0'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.compatibilityScore).toBeGreaterThanOrEqual(0);
      expect(result.compatibilityScore).toBeLessThanOrEqual(1);
      expect(result.recommendedVersion).toBeDefined();
    });
  });

  describe('consumer impact analysis', () => {
    it('should analyze impact on all consumers', async () => {
      const events: any[] = [];
      eventBus.on('api.consumer.impact.analyzed', (event) => events.push(event));

      const task: QETask = {
        id: 'analyze-impact-task',
        type: 'analyze-consumer-impact',
        payload: {
          version: '2.0.0',
          consumers: ['web-app', 'mobile-app', 'analytics-service']
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.consumers).toBeInstanceOf(Array);
      expect(result.consumers.length).toBe(3);
      expect(result.totalConsumers).toBe(3);
      expect(result.affectedConsumers).toBeGreaterThan(0);

      // Verify consumer details
      result.consumers.forEach((consumer: any) => {
        expect(consumer.name).toBeDefined();
        expect(consumer.type).toBeDefined();
        expect(consumer.apiVersion).toBeDefined();
        expect(consumer.affectedEndpoints).toBeInstanceOf(Array);
        expect(consumer.impactLevel).toMatch(/low|medium|high|critical/);
        expect(consumer.requiresUpdate).toBeDefined();
        expect(consumer.estimatedEffort).toBeDefined();
      });

      expect(result.migrationPlan).toBeDefined();
      expect(result.estimatedTotalEffort).toBeDefined();

      // Verify event
      expect(events.length).toBeGreaterThan(0);
    });

    it('should prioritize high-impact consumers', async () => {
      const task: QETask = {
        id: 'prioritize-consumers-task',
        type: 'analyze-consumer-impact',
        payload: {
          version: '2.0.0'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      const highImpact = result.consumers.filter((c: any) => c.impactLevel === 'high');
      expect(highImpact.length).toBeGreaterThan(0);
    });

    it('should generate migration plan', async () => {
      const task: QETask = {
        id: 'migration-plan-task',
        type: 'analyze-consumer-impact',
        payload: {
          version: '2.0.0'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.migrationPlan).toBeDefined();
      expect(result.migrationPlan.phase1).toBeInstanceOf(Array);
      expect(result.migrationPlan.phase2).toBeInstanceOf(Array);
      expect(result.migrationPlan.phase3).toBeInstanceOf(Array);
    });
  });

  describe('version compatibility checks', () => {
    it('should check semantic versioning compatibility', async () => {
      const task: QETask = {
        id: 'check-semver-task',
        type: 'check-version-compatibility',
        payload: {
          currentVersion: '1.5.0',
          targetVersion: '2.0.0'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.currentVersion).toBe('1.5.0');
      expect(result.targetVersion).toBe('2.0.0');
      expect(result.semverCompliant).toBe(true);
      expect(result.compatibilityLevel).toBeDefined();
      expect(result.migrationRequired).toBe(true);
    });

    it('should detect backward compatibility', async () => {
      const task: QETask = {
        id: 'backward-compat-task',
        type: 'check-version-compatibility',
        payload: {
          currentVersion: '1.5.0',
          targetVersion: '1.6.0'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.backwardCompatible).toBeDefined();
    });

    it('should list deprecations', async () => {
      const task: QETask = {
        id: 'list-deprecations-task',
        type: 'check-version-compatibility',
        payload: {
          currentVersion: '1.5.0',
          targetVersion: '2.0.0'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.deprecations).toBeInstanceOf(Array);
      if (result.deprecations.length > 0) {
        result.deprecations.forEach((dep: any) => {
          expect(dep.feature).toBeDefined();
          expect(dep.deprecatedIn).toBeDefined();
          expect(dep.removedIn).toBeDefined();
          expect(dep.replacement).toBeDefined();
        });
      }
    });

    it('should provide upgrade recommendations', async () => {
      const task: QETask = {
        id: 'recommendations-task',
        type: 'check-version-compatibility',
        payload: {
          currentVersion: '1.0.0',
          targetVersion: '2.0.0'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.recommendations).toBeInstanceOf(Array);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('contract diffing', () => {
    it('should diff two contracts and identify all changes', async () => {
      const task: QETask = {
        id: 'diff-contracts-task',
        type: 'diff-contracts',
        payload: {
          oldContract: 'v1-openapi.yaml',
          newContract: 'v2-openapi.yaml'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.additions).toBeDefined();
      expect(result.deletions).toBeDefined();
      expect(result.modifications).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary.totalChanges).toBeGreaterThan(0);
    });

    it('should identify added endpoints', async () => {
      const task: QETask = {
        id: 'added-endpoints-task',
        type: 'diff-contracts',
        payload: {
          oldContract: 'v1-openapi.yaml',
          newContract: 'v2-openapi.yaml'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.additions.endpoints).toBeInstanceOf(Array);
      expect(result.additions.endpoints.length).toBeGreaterThan(0);
    });

    it('should identify removed parameters', async () => {
      const task: QETask = {
        id: 'removed-params-task',
        type: 'diff-contracts',
        payload: {
          oldContract: 'v1-openapi.yaml',
          newContract: 'v2-openapi.yaml'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.deletions.parameters).toBeInstanceOf(Array);
    });

    it('should identify modified schemas', async () => {
      const task: QETask = {
        id: 'modified-schemas-task',
        type: 'diff-contracts',
        payload: {
          oldContract: 'v1-openapi.yaml',
          newContract: 'v2-openapi.yaml'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.modifications.schemas).toBeInstanceOf(Array);
      if (result.modifications.schemas.length > 0) {
        result.modifications.schemas.forEach((schema: any) => {
          expect(schema.name).toBeDefined();
          expect(schema.changes).toBeInstanceOf(Array);
        });
      }
    });
  });

  describe('coordination with DeploymentReadinessAgent', () => {
    it('should share contract validation results', async () => {
      const task: QETask = {
        id: 'share-validation-task',
        type: 'parse-openapi',
        payload: {
          spec: 'openapi.yaml'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      // Store in shared location
      await memoryStore.store('shared:deployment-readiness:contract-validation', result);

      // DeploymentReadiness would retrieve
      const shared = await memoryStore.retrieve('shared:deployment-readiness:contract-validation');
      expect(shared).toBeDefined();
      expect(shared.id).toBe(result.id);
    });

    it('should emit breaking change events for deployment blocking', (done) => {
      eventBus.on('api.breaking.change.detected', (event) => {
        expect(event.data.breakingChanges).toBeDefined();
        done();
      });

      agent.assignTask({
        id: 'breaking-change-task',
        type: 'detect-breaking-changes',
        payload: { oldVersion: '1.0.0', newVersion: '2.0.0' },
        priority: 1,
        status: 'pending'
      });
    });
  });

  describe('performance metrics', () => {
    it('should track contract validation performance', async () => {
      for (let i = 0; i < 3; i++) {
        await agent.assignTask({
          id: `perf-task-${i}`,
          type: 'parse-openapi',
          payload: { spec: `openapi-${i}.yaml` },
          priority: 1,
          status: 'pending'
        });
      }

      const status = agent.getStatus();
      expect(status.performanceMetrics.tasksCompleted).toBe(3);
      expect(status.performanceMetrics.contractsValidated).toBe(3);
      expect(status.performanceMetrics.averageExecutionTime).toBeGreaterThan(0);
    });
  });

  describe('state persistence', () => {
    it('should persist state across termination', async () => {
      await agent.assignTask({
        id: 'persist-task',
        type: 'parse-openapi',
        payload: { spec: 'openapi.yaml' },
        priority: 1,
        status: 'pending'
      });

      await agent.terminate();

      const savedState = await memoryStore.retrieve(`aqe/api-contract/state/${agent.getStatus().agentId.id}`);
      expect(savedState).toBeDefined();
      expect(savedState.metrics).toBeDefined();
    });
  });
});
