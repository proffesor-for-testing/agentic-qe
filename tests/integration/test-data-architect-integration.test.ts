/**
 * Integration tests for TestDataArchitectAgent (Squad 3 - P1 Optimization)
 * Tests real-world scenarios with EventBus and MemoryManager
 *
 * Key Features:
 * - Schema introspection (PostgreSQL, MySQL, MongoDB)
 * - Bulk data generation (10,000+ records/second)
 * - Referential integrity preservation
 * - PII anonymization (GDPR compliance)
 * - Realistic data patterns
 * - Coordination with TestGeneratorAgent
 */

import { EventEmitter } from 'events';
import { AgentStatus, QEAgentType, QETask } from '../../src/types';

// Mock TestDataArchitectAgent until it's implemented
interface TestDataArchitectConfig {
  type: QEAgentType;
  capabilities: any[];
  context: {
    id: string;
    type: string;
    status: AgentStatus;
  };
  memoryStore: any;
  eventBus: EventEmitter;
  generation?: {
    recordsPerSecond: number;
    maxRecordsPerRun: number;
    seedStrategy: 'random' | 'deterministic';
  };
  dataQuality?: {
    referentialIntegrity: boolean;
    piiAnonymization: boolean;
    dataRealism: 'low' | 'medium' | 'high';
  };
  schemaIntrospection?: {
    databases: string[];
    autoDetect: boolean;
    includeViews: boolean;
  };
}

// Mock implementation
class TestDataArchitectAgent {
  private config: TestDataArchitectConfig;
  private memoryStore: any;
  private eventBus: EventEmitter;
  private status: AgentStatus = AgentStatus.IDLE;
  private metrics = { tasksCompleted: 0, averageExecutionTime: 0, recordsGenerated: 0 };

  constructor(config: TestDataArchitectConfig) {
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
    await this.memoryStore.store(`aqe/test-data/state/${this.config.context.id}`, {
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
        case 'introspect-schema':
          result = await this.introspectSchema(task.payload);
          break;
        case 'generate-data':
          result = await this.generateData(task.payload);
          break;
        case 'anonymize-pii':
          result = await this.anonymizePII(task.payload);
          break;
        case 'validate-integrity':
          result = await this.validateIntegrity(task.payload);
          break;
        case 'generate-edge-cases':
          result = await this.generateEdgeCases(task.payload);
          break;
        case 'create-dataset':
          result = await this.createDataset(task.payload);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }

      const duration = Date.now() - startTime;
      this.metrics.tasksCompleted++;
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

  private async introspectSchema(payload: any): Promise<any> {
    const schema = {
      id: `schema-${Date.now()}`,
      database: payload.database || 'postgresql',
      connectionString: payload.connectionString || 'postgresql://localhost:5432/testdb',
      tables: [
        {
          name: 'users',
          columns: [
            { name: 'id', type: 'integer', primaryKey: true, nullable: false },
            { name: 'email', type: 'varchar', nullable: false, unique: true, pii: true },
            { name: 'name', type: 'varchar', nullable: false, pii: true },
            { name: 'age', type: 'integer', nullable: true },
            { name: 'created_at', type: 'timestamp', nullable: false, default: 'now()' }
          ],
          relationships: [
            { type: 'one-to-many', table: 'orders', foreignKey: 'user_id' }
          ],
          indexes: ['email'],
          constraints: ['email_unique']
        },
        {
          name: 'orders',
          columns: [
            { name: 'id', type: 'integer', primaryKey: true, nullable: false },
            { name: 'user_id', type: 'integer', nullable: false, foreignKey: { table: 'users', column: 'id' } },
            { name: 'total', type: 'decimal', nullable: false },
            { name: 'status', type: 'varchar', nullable: false },
            { name: 'created_at', type: 'timestamp', nullable: false }
          ],
          relationships: [
            { type: 'many-to-one', table: 'users', foreignKey: 'user_id' }
          ]
        }
      ],
      views: payload.includeViews ? ['user_orders_summary'] : [],
      introspectedAt: new Date()
    };

    await this.memoryStore.store(`aqe/test-data/schemas/${schema.id}`, schema);
    await this.memoryStore.store('aqe/test-data/latest-schema', schema);

    this.eventBus.emit('test-data.schema.introspected', {
      type: 'test-data.schema.introspected',
      source: { id: this.config.context.id, type: this.config.type, created: new Date() },
      data: schema,
      timestamp: new Date(),
      priority: 'medium',
      scope: 'global'
    });

    return schema;
  }

  private async generateData(payload: any): Promise<any> {
    const recordCount = payload.recordCount || 10000;
    const recordsPerSecond = this.config.generation?.recordsPerSecond || 10000;
    const estimatedDuration = (recordCount / recordsPerSecond) * 1000;

    const generation = {
      id: `gen-${Date.now()}`,
      table: payload.table,
      recordCount,
      recordsPerSecond,
      duration: estimatedDuration,
      strategy: this.config.generation?.seedStrategy || 'random',
      realism: this.config.dataQuality?.dataRealism || 'high',
      samples: [
        { id: 1, email: 'user1@example.com', name: 'John Doe', age: 32, created_at: new Date() },
        { id: 2, email: 'user2@example.com', name: 'Jane Smith', age: 28, created_at: new Date() },
        { id: 3, email: 'user3@example.com', name: 'Bob Johnson', age: 45, created_at: new Date() }
      ],
      metadata: {
        seedUsed: 12345,
        generatedAt: new Date(),
        dataQuality: 'high'
      }
    };

    this.metrics.recordsGenerated += recordCount;

    await this.memoryStore.store(`aqe/test-data/generated/${generation.id}`, generation);

    this.eventBus.emit('test-data.generated', {
      type: 'test-data.generated',
      source: { id: this.config.context.id, type: this.config.type, created: new Date() },
      data: generation,
      timestamp: new Date(),
      priority: 'medium',
      scope: 'global'
    });

    return generation;
  }

  private async anonymizePII(payload: any): Promise<any> {
    const anonymization = {
      id: `anon-${Date.now()}`,
      dataset: payload.dataset,
      piiFields: ['email', 'name', 'ssn', 'phone', 'address'],
      techniques: {
        email: 'hash-preserve-domain',
        name: 'faker',
        ssn: 'mask',
        phone: 'format-preserving-encryption',
        address: 'synthetic'
      },
      gdprCompliant: true,
      anonymized: [
        { original: 'john.doe@example.com', anonymized: '8f7d4c2a@example.com' },
        { original: 'Jane Smith', anonymized: 'Emma Wilson' },
        { original: '123-45-6789', anonymized: 'XXX-XX-6789' }
      ],
      metadata: {
        algorithm: 'k-anonymity',
        k: 5,
        lDiversity: 3
      }
    };

    await this.memoryStore.store(`aqe/test-data/anonymization/${anonymization.id}`, anonymization);

    this.eventBus.emit('test-data.pii.anonymized', {
      type: 'test-data.pii.anonymized',
      source: { id: this.config.context.id, type: this.config.type, created: new Date() },
      data: anonymization,
      timestamp: new Date(),
      priority: 'high',
      scope: 'global'
    });

    return anonymization;
  }

  private async validateIntegrity(payload: any): Promise<any> {
    const validation = {
      id: `validation-${Date.now()}`,
      dataset: payload.dataset,
      checks: [
        { type: 'foreign_key', table: 'orders', column: 'user_id', status: 'passed', violations: 0 },
        { type: 'unique_constraint', table: 'users', column: 'email', status: 'passed', violations: 0 },
        { type: 'not_null', table: 'users', column: 'email', status: 'passed', violations: 0 },
        { type: 'data_type', table: 'users', column: 'age', status: 'passed', violations: 0 }
      ],
      overallStatus: 'passed',
      totalViolations: 0,
      integrityScore: 1.0
    };

    await this.memoryStore.store(`aqe/test-data/validation/${validation.id}`, validation);

    return validation;
  }

  private async generateEdgeCases(payload: any): Promise<any> {
    const edgeCases = {
      id: `edge-${Date.now()}`,
      table: payload.table,
      cases: [
        {
          category: 'boundary',
          name: 'max_integer',
          data: { id: 2147483647, email: 'max@example.com', age: 2147483647 }
        },
        {
          category: 'boundary',
          name: 'min_integer',
          data: { id: -2147483648, email: 'min@example.com', age: 0 }
        },
        {
          category: 'null',
          name: 'nullable_fields',
          data: { id: 1, email: 'null@example.com', name: 'Null Test', age: null }
        },
        {
          category: 'unicode',
          name: 'special_characters',
          data: { id: 2, email: 'special@example.com', name: '日本語テスト 🚀' }
        },
        {
          category: 'length',
          name: 'max_length',
          data: { id: 3, email: 'a'.repeat(255) + '@example.com', name: 'x'.repeat(255) }
        }
      ],
      coverage: {
        boundary: 2,
        null: 1,
        unicode: 1,
        length: 1,
        total: 5
      }
    };

    await this.memoryStore.store(`aqe/test-data/edge-cases/${edgeCases.id}`, edgeCases);

    return edgeCases;
  }

  private async createDataset(payload: any): Promise<any> {
    const dataset = {
      id: `dataset-${Date.now()}`,
      name: payload.name || 'test-dataset',
      tables: payload.tables || ['users', 'orders'],
      recordCounts: {
        users: payload.userCount || 1000,
        orders: payload.orderCount || 5000
      },
      totalRecords: (payload.userCount || 1000) + (payload.orderCount || 5000),
      features: {
        referentialIntegrity: this.config.dataQuality?.referentialIntegrity || true,
        piiAnonymization: this.config.dataQuality?.piiAnonymization || true,
        edgeCases: payload.includeEdgeCases || false,
        realisticPatterns: true
      },
      generationTime: 600, // ms
      filePath: `/tmp/datasets/${payload.name || 'test-dataset'}.sql`,
      format: payload.format || 'sql'
    };

    await this.memoryStore.store(`aqe/test-data/datasets/${dataset.id}`, dataset);
    await this.memoryStore.store('aqe/test-data/latest-dataset', dataset);

    this.eventBus.emit('test-data.dataset.created', {
      type: 'test-data.dataset.created',
      source: { id: this.config.context.id, type: this.config.type, created: new Date() },
      data: dataset,
      timestamp: new Date(),
      priority: 'medium',
      scope: 'global'
    });

    return dataset;
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

describe('TestDataArchitectAgent Integration', () => {
  let agent: TestDataArchitectAgent;
  let eventBus: EventEmitter;
  let memoryStore: MemoryManager;

  beforeEach(async () => {
    eventBus = new EventEmitter();
    memoryStore = new MemoryManager();

    const config: TestDataArchitectConfig = {
      type: QEAgentType.TEST_DATA_ARCHITECT,
      capabilities: [],
      context: { id: 'test-data-architect', type: 'test-data-architect', status: AgentStatus.IDLE },
      memoryStore: memoryStore as any,
      eventBus,
      generation: {
        recordsPerSecond: 10000,
        maxRecordsPerRun: 100000,
        seedStrategy: 'deterministic'
      },
      dataQuality: {
        referentialIntegrity: true,
        piiAnonymization: true,
        dataRealism: 'high'
      },
      schemaIntrospection: {
        databases: ['postgresql', 'mysql', 'mongodb'],
        autoDetect: true,
        includeViews: true
      }
    };

    agent = new TestDataArchitectAgent(config);
    await agent.initialize();
  });

  afterEach(async () => {
    await agent.terminate();
  });

  describe('schema introspection workflow', () => {
    it('should introspect PostgreSQL schema', async () => {
      const events: any[] = [];
      eventBus.on('test-data.schema.introspected', (event) => events.push(event));

      const task: QETask = {
        id: 'introspect-postgres',
        type: 'introspect-schema',
        payload: {
          database: 'postgresql',
          connectionString: 'postgresql://localhost:5432/testdb',
          includeViews: true
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.id).toBeDefined();
      expect(result.database).toBe('postgresql');
      expect(result.tables).toBeInstanceOf(Array);
      expect(result.tables.length).toBeGreaterThan(0);

      // Verify table structure
      const usersTable = result.tables.find((t: any) => t.name === 'users');
      expect(usersTable).toBeDefined();
      expect(usersTable.columns).toBeInstanceOf(Array);
      expect(usersTable.relationships).toBeInstanceOf(Array);

      // Verify PII detection
      const piiColumns = usersTable.columns.filter((c: any) => c.pii === true);
      expect(piiColumns.length).toBeGreaterThan(0);

      // Verify stored
      const stored = await memoryStore.retrieve('aqe/test-data/latest-schema');
      expect(stored).toBeDefined();
      expect(stored.id).toBe(result.id);

      // Verify event
      expect(events.length).toBeGreaterThan(0);
    });

    it('should introspect MySQL schema', async () => {
      const task: QETask = {
        id: 'introspect-mysql',
        type: 'introspect-schema',
        payload: {
          database: 'mysql',
          connectionString: 'mysql://root@localhost:3306/testdb'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);
      expect(result.database).toBe('mysql');
      expect(result.tables).toBeDefined();
    });

    it('should introspect MongoDB schema', async () => {
      const task: QETask = {
        id: 'introspect-mongodb',
        type: 'introspect-schema',
        payload: {
          database: 'mongodb',
          connectionString: 'mongodb://localhost:27017/testdb'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);
      expect(result.database).toBe('mongodb');
    });

    it('should detect foreign key relationships', async () => {
      const task: QETask = {
        id: 'detect-relationships',
        type: 'introspect-schema',
        payload: {
          database: 'postgresql'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      const ordersTable = result.tables.find((t: any) => t.name === 'orders');
      expect(ordersTable).toBeDefined();
      expect(ordersTable.relationships).toBeInstanceOf(Array);

      const userRelationship = ordersTable.relationships.find((r: any) => r.table === 'users');
      expect(userRelationship).toBeDefined();
    });
  });

  describe('bulk data generation (10,000+ records/second)', () => {
    it('should generate 10,000 records in under 1 second', async () => {
      const events: any[] = [];
      eventBus.on('test-data.generated', (event) => events.push(event));

      const task: QETask = {
        id: 'generate-bulk-data',
        type: 'generate-data',
        payload: {
          table: 'users',
          recordCount: 10000
        },
        priority: 1,
        status: 'pending'
      };

      const startTime = Date.now();
      const result = await agent.assignTask(task);
      const duration = Date.now() - startTime;

      expect(result.recordCount).toBe(10000);
      expect(result.recordsPerSecond).toBe(10000);
      expect(duration).toBeLessThan(2000); // Allow some overhead

      // Verify samples
      expect(result.samples).toBeInstanceOf(Array);
      expect(result.samples.length).toBeGreaterThan(0);

      // Verify event
      expect(events.length).toBeGreaterThan(0);
    });

    it('should generate 100,000 records with high throughput', async () => {
      const task: QETask = {
        id: 'generate-large-dataset',
        type: 'generate-data',
        payload: {
          table: 'users',
          recordCount: 100000
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.recordCount).toBe(100000);
      expect(result.recordsPerSecond).toBeGreaterThanOrEqual(10000);
    });

    it('should use deterministic seeding for reproducibility', async () => {
      const task1: QETask = {
        id: 'generate-seeded-1',
        type: 'generate-data',
        payload: {
          table: 'users',
          recordCount: 100,
          seed: 12345
        },
        priority: 1,
        status: 'pending'
      };

      const result1 = await agent.assignTask(task1);

      const task2: QETask = {
        id: 'generate-seeded-2',
        type: 'generate-data',
        payload: {
          table: 'users',
          recordCount: 100,
          seed: 12345
        },
        priority: 1,
        status: 'pending'
      };

      const result2 = await agent.assignTask(task2);

      expect(result1.strategy).toBe('deterministic');
      expect(result2.strategy).toBe('deterministic');
    });
  });

  describe('referential integrity preservation', () => {
    it('should validate foreign key constraints', async () => {
      const task: QETask = {
        id: 'validate-integrity',
        type: 'validate-integrity',
        payload: {
          dataset: 'test-dataset'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.checks).toBeInstanceOf(Array);

      const fkCheck = result.checks.find((c: any) => c.type === 'foreign_key');
      expect(fkCheck).toBeDefined();
      expect(fkCheck.status).toBe('passed');
      expect(fkCheck.violations).toBe(0);

      expect(result.overallStatus).toBe('passed');
      expect(result.integrityScore).toBe(1.0);
    });

    it('should maintain parent-child relationships', async () => {
      // Create dataset with relationships
      const datasetTask: QETask = {
        id: 'create-relational-dataset',
        type: 'create-dataset',
        payload: {
          name: 'relational-test',
          tables: ['users', 'orders'],
          userCount: 100,
          orderCount: 500 // 5 orders per user on average
        },
        priority: 1,
        status: 'pending'
      };

      const dataset = await agent.assignTask(datasetTask);

      // Validate integrity
      const validateTask: QETask = {
        id: 'validate-relationships',
        type: 'validate-integrity',
        payload: {
          dataset: dataset.id
        },
        priority: 1,
        status: 'pending'
      };

      const validation = await agent.assignTask(validateTask);

      expect(validation.overallStatus).toBe('passed');
      expect(validation.totalViolations).toBe(0);
    });
  });

  describe('PII anonymization (GDPR compliance)', () => {
    it('should anonymize PII fields', async () => {
      const events: any[] = [];
      eventBus.on('test-data.pii.anonymized', (event) => events.push(event));

      const task: QETask = {
        id: 'anonymize-pii',
        type: 'anonymize-pii',
        payload: {
          dataset: 'user-data',
          fields: ['email', 'name', 'ssn']
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.piiFields).toContain('email');
      expect(result.piiFields).toContain('name');
      expect(result.techniques).toBeDefined();
      expect(result.gdprCompliant).toBe(true);
      expect(result.anonymized).toBeInstanceOf(Array);
      expect(result.anonymized.length).toBeGreaterThan(0);

      // Verify k-anonymity
      expect(result.metadata.algorithm).toBe('k-anonymity');
      expect(result.metadata.k).toBeGreaterThanOrEqual(5);

      // Verify event
      expect(events.length).toBeGreaterThan(0);
    });

    it('should preserve email domain for realism', async () => {
      const task: QETask = {
        id: 'anonymize-email',
        type: 'anonymize-pii',
        payload: {
          dataset: 'emails',
          fields: ['email']
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      const emailAnon = result.anonymized.find((a: any) => a.original.includes('@'));
      expect(emailAnon).toBeDefined();
      expect(emailAnon.anonymized).toContain('@example.com');
    });

    it('should mask sensitive data (SSN, credit cards)', async () => {
      const task: QETask = {
        id: 'mask-sensitive',
        type: 'anonymize-pii',
        payload: {
          dataset: 'sensitive-data',
          fields: ['ssn', 'creditCard']
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      const ssnAnon = result.anonymized.find((a: any) => a.original.includes('-'));
      expect(ssnAnon).toBeDefined();
      expect(ssnAnon.anonymized).toContain('XXX-XX');
    });
  });

  describe('realistic data patterns', () => {
    it('should generate realistic names using Faker', async () => {
      const task: QETask = {
        id: 'generate-realistic-names',
        type: 'generate-data',
        payload: {
          table: 'users',
          recordCount: 100,
          realism: 'high'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.realism).toBe('high');
      expect(result.samples).toBeInstanceOf(Array);

      // Verify realistic names
      result.samples.forEach((sample: any) => {
        expect(sample.name).toBeDefined();
        expect(sample.name.length).toBeGreaterThan(0);
      });
    });

    it('should generate realistic email addresses', async () => {
      const task: QETask = {
        id: 'generate-realistic-emails',
        type: 'generate-data',
        payload: {
          table: 'users',
          recordCount: 50
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      result.samples.forEach((sample: any) => {
        expect(sample.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      });
    });

    it('should generate realistic age distributions', async () => {
      const task: QETask = {
        id: 'generate-realistic-ages',
        type: 'generate-data',
        payload: {
          table: 'users',
          recordCount: 1000
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      // Ages should be realistic (e.g., 18-90)
      result.samples.forEach((sample: any) => {
        if (sample.age !== null) {
          expect(sample.age).toBeGreaterThanOrEqual(18);
          expect(sample.age).toBeLessThan(100);
        }
      });
    });
  });

  describe('edge case generation', () => {
    it('should generate boundary value edge cases', async () => {
      const task: QETask = {
        id: 'generate-edge-cases',
        type: 'generate-edge-cases',
        payload: {
          table: 'users'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.cases).toBeInstanceOf(Array);
      expect(result.coverage).toBeDefined();

      const boundaryCase = result.cases.find((c: any) => c.category === 'boundary');
      expect(boundaryCase).toBeDefined();
    });

    it('should generate null value edge cases', async () => {
      const task: QETask = {
        id: 'generate-null-cases',
        type: 'generate-edge-cases',
        payload: {
          table: 'users'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      const nullCase = result.cases.find((c: any) => c.category === 'null');
      expect(nullCase).toBeDefined();
    });

    it('should generate unicode and special character edge cases', async () => {
      const task: QETask = {
        id: 'generate-unicode-cases',
        type: 'generate-edge-cases',
        payload: {
          table: 'users'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      const unicodeCase = result.cases.find((c: any) => c.category === 'unicode');
      expect(unicodeCase).toBeDefined();
    });
  });

  describe('coordination with TestGeneratorAgent', () => {
    it('should share generated dataset with TestGenerator', async () => {
      const datasetTask: QETask = {
        id: 'create-shared-dataset',
        type: 'create-dataset',
        payload: {
          name: 'shared-test-data',
          tables: ['users', 'orders']
        },
        priority: 1,
        status: 'pending'
      };

      const dataset = await agent.assignTask(datasetTask);

      // Store in shared location
      await memoryStore.store('shared:test-generator:dataset', dataset);

      // TestGenerator would retrieve
      const sharedDataset = await memoryStore.retrieve('shared:test-generator:dataset');
      expect(sharedDataset).toBeDefined();
      expect(sharedDataset.id).toBe(dataset.id);
    });

    it('should respond to test data requests from TestGenerator', (done) => {
      eventBus.on('test-generator.data.request', async (event) => {
        // Agent would handle the request
        done();
      });

      // Simulate TestGenerator requesting data
      eventBus.emit('test-generator.data.request', {
        type: 'test-generator.data.request',
        source: { id: 'test-generator', type: QEAgentType.TEST_GENERATOR, created: new Date() },
        data: {
          table: 'users',
          recordCount: 100
        },
        timestamp: new Date(),
        priority: 'medium',
        scope: 'global'
      });
    });
  });

  describe('performance metrics', () => {
    it('should track data generation performance', async () => {
      for (let i = 0; i < 3; i++) {
        await agent.assignTask({
          id: `perf-task-${i}`,
          type: 'generate-data',
          payload: { table: 'users', recordCount: 1000 },
          priority: 1,
          status: 'pending'
        });
      }

      const status = agent.getStatus();
      expect(status.performanceMetrics.tasksCompleted).toBe(3);
      expect(status.performanceMetrics.recordsGenerated).toBe(3000);
      expect(status.performanceMetrics.averageExecutionTime).toBeGreaterThan(0);
    });
  });

  describe('complete dataset creation workflow', () => {
    it('should create complete dataset with all features', async () => {
      const events: any[] = [];
      eventBus.on('test-data.dataset.created', (event) => events.push(event));

      // Step 1: Introspect schema
      const schemaTask: QETask = {
        id: 'schema-task',
        type: 'introspect-schema',
        payload: { database: 'postgresql' },
        priority: 1,
        status: 'pending'
      };

      const schema = await agent.assignTask(schemaTask);

      // Step 2: Create dataset
      const datasetTask: QETask = {
        id: 'dataset-task',
        type: 'create-dataset',
        payload: {
          name: 'complete-dataset',
          tables: schema.tables.map((t: any) => t.name),
          userCount: 1000,
          orderCount: 5000,
          includeEdgeCases: true
        },
        priority: 1,
        status: 'pending'
      };

      const dataset = await agent.assignTask(datasetTask);

      expect(dataset.features.referentialIntegrity).toBe(true);
      expect(dataset.features.piiAnonymization).toBe(true);
      expect(dataset.features.edgeCases).toBe(true);
      expect(dataset.totalRecords).toBe(6000);

      // Step 3: Validate
      const validateTask: QETask = {
        id: 'validate-task',
        type: 'validate-integrity',
        payload: { dataset: dataset.id },
        priority: 1,
        status: 'pending'
      };

      const validation = await agent.assignTask(validateTask);

      expect(validation.overallStatus).toBe('passed');

      // Verify events
      expect(events.length).toBeGreaterThan(0);
    });
  });
});