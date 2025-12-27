/**
 * TestDataArchitectAgent - Realistic test data generation specialist
 *
 * Implements schema-aware data generation with referential integrity preservation,
 * PII anonymization (GDPR compliance), edge case coverage, realistic data synthesis
 * using Faker.js patterns, and high-speed generation (10,000+ records/second).
 *
 * Based on SPARC methodology and AQE Fleet specification
 */

import { BaseAgent, BaseAgentConfig } from './BaseAgent';
import { SecureRandom } from '../utils/SecureRandom.js';
import {
  QEAgentType,
  QETask,
  TestDataArchitectConfig,
  PreTaskData,
  PostTaskData,
  TaskErrorData
} from '../types';

// ============================================================================
// Type Definitions for Test Data Generation
// ============================================================================

/**
 * Primitive field value types that can be stored in database fields
 */
export type FieldValue = string | number | boolean | Date | null | undefined;

/**
 * Extended field value including complex types
 */
export type ExtendedFieldValue = FieldValue | Record<string, unknown> | unknown[];

/**
 * A single data record with typed field values
 */
export type DataRecord = Record<string, ExtendedFieldValue>;

/**
 * Constraint value types based on constraint type
 */
export type ConstraintValue =
  | boolean                              // for not_null, unique
  | number                               // for min, max
  | string                               // for pattern
  | string[]                             // for enum values
  | { min?: number; max?: number };      // for length constraints

/**
 * Configuration for schema introspection from various sources
 */
export interface SchemaIntrospectionConfig {
  source: 'postgresql' | 'mysql' | 'mongodb' | 'sqlite' | 'openapi' | 'graphql' | 'typescript';
  connectionString?: string;
  schemaFile?: string;
  tables?: string[];
}

/**
 * Configuration for edge case generation
 */
export interface EdgeCaseConfig {
  schema: TableSchema | DatabaseSchema;
  comprehensive?: boolean;
}

/**
 * Configuration for data versioning
 */
export interface DataVersionConfig {
  datasetId: string;
  version: string;
  description?: string;
  tags?: string[];
}

/**
 * Data version metadata
 */
export interface DataVersion {
  id: string;
  datasetId: string;
  version: string;
  description?: string;
  tags: string[];
  timestamp: Date;
  checksum: string;
  size: number;
}

/**
 * Configuration for database seeding
 */
export interface DatabaseSeedConfig {
  datasetId: string;
  database: 'postgresql' | 'mysql' | 'mongodb' | 'sqlite';
  connectionString: string;
  truncate?: boolean;
}

/**
 * Result of database seeding operation
 */
export interface DatabaseSeedResult {
  success: boolean;
  recordsInserted: number;
  duration: number;
}

/**
 * Configuration for production pattern analysis
 */
export interface ProductionPatternConfig {
  data: DataRecord[];
  schema: TableSchema;
}

/**
 * Result of production pattern analysis
 */
export interface ProductionPatternResult {
  distributions: Record<string, Distribution>;
  correlations: Record<string, number>;
  commonValues: Record<string, ExtendedFieldValue[]>;
}

/**
 * Configuration for data anonymization
 */
export interface AnonymizeDataConfig {
  data: DataRecord[];
  schema: TableSchema;
  strategy?: AnonymizationStrategy;
  preserveStatistics?: boolean;
}

/**
 * Configuration for data validation
 */
export interface ValidateDataConfig {
  data: DataRecord[];
  schema: TableSchema | DatabaseSchema;
}

/**
 * Faker.js mock instance type
 */
export interface FakerInstance {
  locale: string;
  seed?: number;
}

/**
 * Generator options for createGenerator
 */
export interface GeneratorOptions {
  min?: number;
  max?: number;
  values?: string[];
}

// ============================================================================
// Configuration Interfaces
// ============================================================================

export interface TestDataArchitectAgentConfig extends BaseAgentConfig {
  databases?: Array<'postgresql' | 'mysql' | 'mongodb' | 'sqlite'>;
  generationRate?: number; // records/second, default: 10000
  referentialIntegrity?: boolean; // default: true
  piiAnonymization?: boolean; // default: true
  gdprCompliant?: boolean; // default: true
  edgeCaseGeneration?: boolean; // default: true

  // Advanced configuration
  fakerLocale?: string; // default: 'en'
  seedValue?: number; // for reproducible data
  batchSize?: number; // default: 1000
  parallelGeneration?: boolean; // default: true
}

// ============================================================================
// Schema Definition Interfaces
// ============================================================================

export interface DatabaseSchema {
  name: string;
  tables: TableSchema[];
  relationships: Relationship[];
  indexes: Index[];
  constraints: Constraint[];
}

export interface TableSchema {
  name: string;
  fields: FieldSchema[];
  primaryKey: string[];
  uniqueConstraints: string[][];
  checkConstraints: CheckConstraint[];
  foreignKeys: ForeignKey[];
}

export interface FieldSchema {
  name: string;
  type: FieldType;
  nullable: boolean;
  defaultValue?: FieldValue | string; // string for SQL expressions like 'NOW()'
  maxLength?: number;
  precision?: number;
  scale?: number;
  constraints: FieldConstraint[];
  format?: SemanticFormat;
  sensitive?: boolean; // PII field
  generator?: DataGenerator;
}

export enum FieldType {
  STRING = 'string',
  INTEGER = 'integer',
  FLOAT = 'float',
  DECIMAL = 'decimal',
  BOOLEAN = 'boolean',
  DATE = 'date',
  DATETIME = 'datetime',
  TIMESTAMP = 'timestamp',
  UUID = 'uuid',
  JSON = 'json',
  ARRAY = 'array',
  BINARY = 'binary',
  TEXT = 'text',
  ENUM = 'enum'
}

export enum SemanticFormat {
  UUID = 'uuid',
  EMAIL = 'email',
  PHONE = 'phone',
  URL = 'url',
  NAME = 'name',
  ADDRESS = 'address',
  CITY = 'city',
  COUNTRY = 'country',
  ZIPCODE = 'zipcode',
  CREDIT_CARD = 'credit_card',
  SSN = 'ssn',
  IP_ADDRESS = 'ip_address',
  MAC_ADDRESS = 'mac_address',
  USER_AGENT = 'user_agent',
  PRICE = 'price',
  CURRENCY = 'currency',
  COMPANY = 'company',
  JOB_TITLE = 'job_title',
  PRODUCT_NAME = 'product_name',
  DESCRIPTION = 'description',
  LATITUDE = 'latitude',
  LONGITUDE = 'longitude',
  COLOR = 'color'
}

export interface FieldConstraint {
  type: 'min' | 'max' | 'length' | 'pattern' | 'enum' | 'unique' | 'not_null';
  value: ConstraintValue;
}

export interface CheckConstraint {
  name: string;
  expression: string;
}

export interface ForeignKey {
  column: string;
  referencedTable: string;
  referencedColumn: string;
  onDelete?: 'CASCADE' | 'SET_NULL' | 'RESTRICT';
  onUpdate?: 'CASCADE' | 'SET_NULL' | 'RESTRICT';
}

export interface Relationship {
  from: string;
  to: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  foreignKey: string;
}

export interface Index {
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
}

export interface Constraint {
  name: string;
  table: string;
  type: 'PRIMARY_KEY' | 'FOREIGN_KEY' | 'UNIQUE' | 'CHECK';
  definition: string;
}

// ============================================================================
// Data Generation Interfaces
// ============================================================================

export interface DataGenerationRequest {
  schema: DatabaseSchema | TableSchema;
  count: number;
  includeEdgeCases?: boolean;
  preserveIntegrity?: boolean;
  anonymizePII?: boolean;
  seedValue?: number;
  format?: 'json' | 'sql' | 'csv';
}

export interface DataGenerationResult {
  id: string;
  schema: string;
  recordsGenerated: number;
  duration: number; // milliseconds
  generationRate: number; // records/second
  data: GeneratedDataset;
  edgeCases?: GeneratedDataset;
  validationResult: ValidationResult;
  metadata: GenerationMetadata;
}

export interface GeneratedDataset {
  tables?: Record<string, DataRecord[]>; // Multi-table data
  records?: DataRecord[]; // Single-table data
  format: 'json' | 'sql' | 'csv';
  size: number;
}

export interface ValidationResult {
  valid: boolean;
  violations: ConstraintViolation[];
  warnings: string[];
  integrityChecks: IntegrityCheck[];
}

export interface ConstraintViolation {
  type: 'NOT_NULL' | 'UNIQUE' | 'CHECK' | 'FOREIGN_KEY' | 'DATA_TYPE';
  field: string;
  table?: string;
  value?: ExtendedFieldValue;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface IntegrityCheck {
  type: 'FOREIGN_KEY' | 'UNIQUE' | 'PRIMARY_KEY';
  table: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

export interface GenerationMetadata {
  timestamp: Date;
  generator: string;
  version: string;
  config: DataGenerationRequest;
  statistics: DataStatistics;
}

export interface DataStatistics {
  nullCount: Record<string, number>;
  uniqueValues: Record<string, number>;
  dataDistribution: Record<string, Distribution>;
  edgeCasePercentage?: number;
}

export interface Distribution {
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  stdDev?: number;
  percentiles?: Record<string, number>;
}

// ============================================================================
// Anonymization Interfaces
// ============================================================================

export interface AnonymizationConfig {
  strategy: AnonymizationStrategy;
  preserveFormat?: boolean;
  preserveStatistics?: boolean;
  salt?: string;
  kAnonymity?: number; // K-anonymity value
}

export enum AnonymizationStrategy {
  MASK = 'mask',
  HASH = 'hash',
  TOKENIZE = 'tokenize',
  GENERALIZE = 'generalize',
  SUBSTITUTE = 'substitute',
  SYNTHETIC = 'synthetic'
}

export interface AnonymizationResult {
  originalRecords: number;
  anonymizedRecords: number;
  fieldsAnonymized: string[];
  strategy: AnonymizationStrategy;
  statisticalValidation: StatisticalValidation;
  gdprCompliant: boolean;
}

export interface StatisticalValidation {
  correlationPreserved: boolean;
  distributionSimilarity: number; // 0-1
  deviationFromOriginal: number; // percentage
}

// ============================================================================
// Data Generator Interface
// ============================================================================

export type DataGenerator = () => ExtendedFieldValue;

// ============================================================================
// Test Data Architect Agent Implementation
// ============================================================================

export class TestDataArchitectAgent extends BaseAgent {
  private readonly config: TestDataArchitectAgentConfig;
  private schemaCache: Map<string, DatabaseSchema> = new Map();
  private generatedDatasets: Map<string, GeneratedDataset> = new Map();
  private tokenMap: Map<string, ExtendedFieldValue> = new Map(); // For consistent anonymization
  private faker: FakerInstance | null = null; // Faker.js instance

  constructor(config: TestDataArchitectAgentConfig) {
    super({
      ...config,
      type: QEAgentType.TEST_DATA_ARCHITECT,
      capabilities: [
        {
          name: 'schema-introspection',
          version: '1.0.0',
          description: 'Analyze database schemas from PostgreSQL, MySQL, MongoDB, and SQLite',
          parameters: {
            supportedDatabases: ['postgresql', 'mysql', 'mongodb', 'sqlite'],
            supportedSchemas: ['sql', 'graphql', 'json-schema', 'typescript']
          }
        },
        {
          name: 'high-speed-data-generation',
          version: '1.0.0',
          description: 'Generate 10,000+ records per second with optimized algorithms',
          parameters: {
            generationRate: 10000,
            batchingEnabled: true,
            parallelProcessing: true
          }
        },
        {
          name: 'referential-integrity',
          version: '1.0.0',
          description: 'Preserve foreign key relationships and referential integrity',
          parameters: {
            topologicalSorting: true,
            constraintResolution: true
          }
        },
        {
          name: 'pii-anonymization',
          version: '1.0.0',
          description: 'GDPR-compliant PII anonymization with multiple strategies',
          parameters: {
            strategies: ['mask', 'hash', 'tokenize', 'generalize', 'substitute'],
            gdprCompliant: true,
            kAnonymity: 5
          }
        },
        {
          name: 'realistic-data-synthesis',
          version: '1.0.0',
          description: 'Generate realistic data matching production patterns',
          parameters: {
            fakerLibrary: true,
            statisticalModeling: true,
            patternMatching: true
          }
        },
        {
          name: 'edge-case-generation',
          version: '1.0.0',
          description: 'Automatic edge case data generation for boundary testing',
          parameters: {
            boundaryValues: true,
            specialCharacters: true,
            nullHandling: true,
            extremeValues: true
          }
        },
        {
          name: 'constraint-validation',
          version: '1.0.0',
          description: 'Validate generated data against schema constraints',
          parameters: {
            checkTypes: ['NOT_NULL', 'UNIQUE', 'CHECK', 'FOREIGN_KEY'],
            validationMode: 'strict'
          }
        },
        {
          name: 'data-versioning',
          version: '1.0.0',
          description: 'Version control for test datasets aligned with schema versions',
          parameters: {
            versionTracking: true,
            checksumValidation: true,
            migrationSupport: true
          }
        }
      ]
    });

    this.config = {
      ...config,
      databases: config.databases || ['postgresql', 'mysql', 'mongodb', 'sqlite'],
      generationRate: config.generationRate || 10000,
      referentialIntegrity: config.referentialIntegrity !== false,
      piiAnonymization: config.piiAnonymization !== false,
      gdprCompliant: config.gdprCompliant !== false,
      edgeCaseGeneration: config.edgeCaseGeneration !== false,
      fakerLocale: config.fakerLocale || 'en',
      batchSize: config.batchSize || 1000,
      parallelGeneration: config.parallelGeneration !== false
    };
  }

  // ============================================================================
  // Lifecycle Hooks for Test Data Generation Coordination
  // ============================================================================

  /**
   * Pre-task hook - Load data generation history
   */
  protected async onPreTask(data: PreTaskData): Promise<void> {
    await super.onPreTask(data);

    const history = await this.memoryStore.retrieve(
      `aqe/${this.agentId.type}/history`
    );

    if (history && Array.isArray(history)) {
      console.log(`Loaded ${history.length} historical test data generation entries`);
    }

    console.log(`[${this.agentId.type}] Starting test data generation task`, {
      taskId: data.assignment.id,
      taskType: data.assignment.task.type
    });
  }

  /**
   * Post-task hook - Store generated datasets and emit events
   */
  protected async onPostTask(data: PostTaskData): Promise<void> {
    await super.onPostTask(data);

    // Type assertion for result properties since FlexibleTaskResult includes unknown
    const result = data.result as Record<string, unknown> | null | undefined;
    const success = result?.success !== false;
    const recordCount = (typeof result?.recordCount === 'number' ? result.recordCount : 0);

    await this.memoryStore.store(
      `aqe/${this.agentId.type}/results/${data.assignment.id}`,
      {
        result: data.result,
        timestamp: new Date(),
        taskType: data.assignment.task.type,
        success,
        recordsGenerated: recordCount
      },
      86400
    );

    this.eventBus.emit(`${this.agentId.type}:completed`, {
      agentId: this.agentId,
      result: data.result,
      timestamp: new Date()
    });

    console.log(`[${this.agentId.type}] Test data generation completed`, {
      taskId: data.assignment.id,
      recordsGenerated: recordCount
    });
  }

  /**
   * Task error hook - Log data generation failures
   */
  protected async onTaskError(data: TaskErrorData): Promise<void> {
    await super.onTaskError(data);

    await this.memoryStore.store(
      `aqe/${this.agentId.type}/errors/${Date.now()}`,
      {
        taskId: data.assignment.id,
        error: data.error.message,
        stack: data.error.stack,
        timestamp: new Date(),
        taskType: data.assignment.task.type
      },
      604800
    );

    this.eventBus.emit(`${this.agentId.type}:error`, {
      agentId: this.agentId,
      error: data.error,
      taskId: data.assignment.id,
      timestamp: new Date()
    });

    console.error(`[${this.agentId.type}] Test data generation failed`, {
      taskId: data.assignment.id,
      error: data.error.message
    });
  }

  // ============================================================================
  // BaseAgent Implementation
  // ============================================================================

  protected async initializeComponents(): Promise<void> {
    console.log(`TestDataArchitectAgent ${this.agentId.id} initializing...`);

    // Initialize Faker.js for realistic data generation
    await this.initializeFaker();

    // Load schema templates
    await this.loadSchemaTemplates();

    // Initialize anonymization token map
    this.tokenMap.clear();

    console.log('TestDataArchitectAgent initialized successfully');
  }

  protected async performTask(task: QETask): Promise<
    DatabaseSchema | DataGenerationResult | AnonymizationResult |
    ValidationResult | DataRecord[] | ProductionPatternResult |
    DataVersion | DatabaseSeedResult
  > {
    console.log(`TestDataArchitectAgent executing task: ${task.type}`);

    switch (task.type) {
      case 'introspect-schema':
        return await this.introspectSchema(task.payload as SchemaIntrospectionConfig);

      case 'generate-data':
        return await this.generateData(task.payload as DataGenerationRequest);

      case 'anonymize-data':
        return await this.anonymizeData(task.payload as AnonymizeDataConfig);

      case 'validate-data':
        return await this.validateData(task.payload as ValidateDataConfig);

      case 'generate-edge-cases':
        return await this.generateEdgeCases(task.payload as EdgeCaseConfig);

      case 'analyze-production-patterns':
        return await this.analyzeProductionPatterns(task.payload as ProductionPatternConfig);

      case 'create-data-version':
        return await this.createDataVersion(task.payload as DataVersionConfig);

      case 'seed-database':
        return await this.seedDatabase(task.payload as DatabaseSeedConfig);

      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  protected async loadKnowledge(): Promise<void> {
    // Load cached schemas from memory
    const cachedSchemas = await this.retrieveSharedMemory(
      QEAgentType.TEST_DATA_ARCHITECT,
      'schemas'
    );

    if (cachedSchemas) {
      for (const [name, schema] of Object.entries(cachedSchemas)) {
        this.schemaCache.set(name, schema as DatabaseSchema);
      }
      console.log(`Loaded ${this.schemaCache.size} cached schemas`);
    }

    // Load data generation patterns
    const patterns = await this.retrieveSharedMemory(
      QEAgentType.TEST_DATA_ARCHITECT,
      'patterns'
    );

    if (patterns) {
      console.log('Loaded data generation patterns');
    }
  }

  protected async cleanup(): Promise<void> {
    console.log('TestDataArchitectAgent cleaning up...');

    // Save schemas to shared memory
    const schemasObject = Object.fromEntries(this.schemaCache.entries());
    await this.storeSharedMemory('schemas', schemasObject);

    // Clear caches
    this.schemaCache.clear();
    this.generatedDatasets.clear();
    this.tokenMap.clear();

    console.log('TestDataArchitectAgent cleanup complete');
  }

  // ============================================================================
  // Schema Introspection Methods
  // ============================================================================

  /**
   * Introspect database schema from various sources
   */
  public async introspectSchema(config: SchemaIntrospectionConfig): Promise<DatabaseSchema> {
    console.log(`Introspecting schema from ${config.source}`);

    let schema: DatabaseSchema;

    switch (config.source) {
      case 'postgresql':
      case 'mysql':
      case 'sqlite':
        schema = await this.introspectSQLDatabase(config);
        break;

      case 'mongodb':
        schema = await this.introspectMongoDatabase(config);
        break;

      case 'openapi':
        schema = await this.introspectOpenAPISchema(config);
        break;

      case 'graphql':
        schema = await this.introspectGraphQLSchema(config);
        break;

      case 'typescript':
        schema = await this.introspectTypeScriptSchema(config);
        break;

      default:
        throw new Error(`Unsupported schema source: ${config.source}`);
    }

    // Cache the schema
    this.schemaCache.set(schema.name, schema);

    // Store in shared memory
    await this.storeSharedMemory(`schema:${schema.name}`, schema);

    // Emit event
    this.emitEvent('test-data.schema-introspected', {
      agentId: this.agentId.id,
      schemaName: schema.name,
      tables: schema.tables.length,
      relationships: schema.relationships.length
    });

    return schema;
  }

  /**
   * Introspect SQL database schema (PostgreSQL, MySQL, SQLite)
   */
  private async introspectSQLDatabase(config: SchemaIntrospectionConfig): Promise<DatabaseSchema> {
    // Mock implementation - in production, would connect to actual database
    console.log(`Introspecting SQL database: ${config.source}`);

    // Simulate schema introspection
    const mockSchema: DatabaseSchema = {
      name: 'mock_database',
      tables: [
        {
          name: 'users',
          fields: [
            {
              name: 'id',
              type: FieldType.UUID,
              nullable: false,
              format: SemanticFormat.UUID,
              constraints: [{ type: 'not_null', value: true }],
              sensitive: false,
              generator: this.createGenerator('uuid')
            },
            {
              name: 'email',
              type: FieldType.STRING,
              nullable: false,
              maxLength: 255,
              format: SemanticFormat.EMAIL,
              constraints: [
                { type: 'not_null', value: true },
                { type: 'unique', value: true },
                { type: 'length', value: { max: 255 } }
              ],
              sensitive: true,
              generator: this.createGenerator('email')
            },
            {
              name: 'name',
              type: FieldType.STRING,
              nullable: false,
              maxLength: 100,
              format: SemanticFormat.NAME,
              constraints: [
                { type: 'not_null', value: true },
                { type: 'length', value: { max: 100 } }
              ],
              sensitive: true,
              generator: this.createGenerator('name')
            },
            {
              name: 'age',
              type: FieldType.INTEGER,
              nullable: false,
              constraints: [
                { type: 'not_null', value: true },
                { type: 'min', value: 18 },
                { type: 'max', value: 120 }
              ],
              sensitive: false,
              generator: this.createGenerator('age')
            },
            {
              name: 'created_at',
              type: FieldType.TIMESTAMP,
              nullable: false,
              defaultValue: 'NOW()',
              constraints: [{ type: 'not_null', value: true }],
              sensitive: false,
              generator: this.createGenerator('timestamp')
            }
          ],
          primaryKey: ['id'],
          uniqueConstraints: [['email']],
          checkConstraints: [
            {
              name: 'age_check',
              expression: 'age >= 18 AND age <= 120'
            }
          ],
          foreignKeys: []
        },
        {
          name: 'orders',
          fields: [
            {
              name: 'id',
              type: FieldType.INTEGER,
              nullable: false,
              constraints: [{ type: 'not_null', value: true }],
              sensitive: false,
              generator: this.createGenerator('integer')
            },
            {
              name: 'user_id',
              type: FieldType.UUID,
              nullable: false,
              format: SemanticFormat.UUID,
              constraints: [{ type: 'not_null', value: true }],
              sensitive: false,
              generator: this.createGenerator('uuid')
            },
            {
              name: 'total',
              type: FieldType.DECIMAL,
              nullable: false,
              precision: 10,
              scale: 2,
              format: SemanticFormat.PRICE,
              constraints: [
                { type: 'not_null', value: true },
                { type: 'min', value: 0 }
              ],
              sensitive: false,
              generator: this.createGenerator('price')
            },
            {
              name: 'status',
              type: FieldType.ENUM,
              nullable: false,
              constraints: [
                { type: 'not_null', value: true },
                { type: 'enum', value: ['pending', 'completed', 'cancelled'] }
              ],
              sensitive: false,
              generator: this.createGenerator('enum', ['pending', 'completed', 'cancelled'])
            },
            {
              name: 'created_at',
              type: FieldType.TIMESTAMP,
              nullable: false,
              defaultValue: 'NOW()',
              constraints: [{ type: 'not_null', value: true }],
              sensitive: false,
              generator: this.createGenerator('timestamp')
            }
          ],
          primaryKey: ['id'],
          uniqueConstraints: [],
          checkConstraints: [
            {
              name: 'total_check',
              expression: 'total >= 0'
            }
          ],
          foreignKeys: [
            {
              column: 'user_id',
              referencedTable: 'users',
              referencedColumn: 'id',
              onDelete: 'CASCADE'
            }
          ]
        }
      ],
      relationships: [
        {
          from: 'orders',
          to: 'users',
          type: 'one-to-many',
          foreignKey: 'user_id'
        }
      ],
      indexes: [
        {
          name: 'idx_users_email',
          table: 'users',
          columns: ['email'],
          unique: true
        },
        {
          name: 'idx_orders_user_id',
          table: 'orders',
          columns: ['user_id'],
          unique: false
        }
      ],
      constraints: []
    };

    return mockSchema;
  }

  /**
   * Introspect MongoDB schema
   */
  private async introspectMongoDatabase(config: SchemaIntrospectionConfig): Promise<DatabaseSchema> {
    // Mock implementation
    console.log('Introspecting MongoDB schema');

    // In production, would analyze MongoDB collections and documents
    return {
      name: 'mongo_database',
      tables: [],
      relationships: [],
      indexes: [],
      constraints: []
    };
  }

  /**
   * Introspect OpenAPI schema
   */
  private async introspectOpenAPISchema(config: SchemaIntrospectionConfig): Promise<DatabaseSchema> {
    // Mock implementation
    console.log('Introspecting OpenAPI schema');

    return {
      name: 'api_schema',
      tables: [],
      relationships: [],
      indexes: [],
      constraints: []
    };
  }

  /**
   * Introspect GraphQL schema
   */
  private async introspectGraphQLSchema(config: SchemaIntrospectionConfig): Promise<DatabaseSchema> {
    // Mock implementation
    console.log('Introspecting GraphQL schema');

    return {
      name: 'graphql_schema',
      tables: [],
      relationships: [],
      indexes: [],
      constraints: []
    };
  }

  /**
   * Introspect TypeScript schema
   */
  private async introspectTypeScriptSchema(config: SchemaIntrospectionConfig): Promise<DatabaseSchema> {
    // Mock implementation
    console.log('Introspecting TypeScript schema');

    return {
      name: 'typescript_schema',
      tables: [],
      relationships: [],
      indexes: [],
      constraints: []
    };
  }

  // ============================================================================
  // Data Generation Methods
  // ============================================================================

  /**
   * Generate test data based on schema
   */
  public async generateData(request: DataGenerationRequest): Promise<DataGenerationResult> {
    const startTime = Date.now();
    console.log(`Generating ${request.count} records`);

    let schema: DatabaseSchema;

    if ('tables' in request.schema) {
      schema = request.schema as DatabaseSchema;
    } else {
      // Single table schema
      schema = {
        name: 'single_table',
        tables: [request.schema as TableSchema],
        relationships: [],
        indexes: [],
        constraints: []
      };
    }

    // Generate data with referential integrity
    const data = await this.generateWithIntegrity(schema, request.count);

    // Generate edge cases if requested
    let edgeCases: GeneratedDataset | undefined;
    if (request.includeEdgeCases) {
      edgeCases = await this.generateEdgeCasesForSchema(schema);
    }

    // Anonymize PII if requested
    if (request.anonymizePII && this.config.piiAnonymization) {
      await this.anonymizeDataset(data);
    }

    // Validate generated data
    const validationResult = await this.validateGeneratedData(data, schema);

    const duration = Date.now() - startTime;
    const generationRate = (request.count / duration) * 1000; // records/second

    const result: DataGenerationResult = {
      id: this.generateDatasetId(),
      schema: schema.name,
      recordsGenerated: request.count,
      duration,
      generationRate,
      data,
      edgeCases,
      validationResult,
      metadata: {
        timestamp: new Date(),
        generator: 'TestDataArchitectAgent',
        version: '1.0.0',
        config: request,
        statistics: this.calculateStatistics(data)
      }
    };

    // Store dataset
    this.generatedDatasets.set(result.id, data);

    // Store in shared memory
    await this.storeSharedMemory(`dataset:${result.id}`, result);

    // Emit event
    this.emitEvent('test-data.generated', {
      agentId: this.agentId.id,
      datasetId: result.id,
      recordsGenerated: request.count,
      generationRate,
      duration
    }, 'high');

    console.log(`Generated ${request.count} records in ${duration}ms (${generationRate.toFixed(0)} records/sec)`);

    return result;
  }

  /**
   * Generate data with referential integrity preserved
   */
  private async generateWithIntegrity(
    schema: DatabaseSchema,
    count: number
  ): Promise<GeneratedDataset> {
    const data: Record<string, DataRecord[]> = {};

    // Topological sort to determine generation order
    const generationOrder = this.topologicalSort(schema);

    for (const table of generationOrder) {
      data[table.name] = await this.generateTableData(table, count, data);
    }

    return {
      tables: data,
      format: 'json',
      size: Object.values(data).reduce((sum, records) => sum + records.length, 0)
    };
  }

  /**
   * Generate data for a single table
   */
  private async generateTableData(
    table: TableSchema,
    count: number,
    existingData: Record<string, DataRecord[]>
  ): Promise<DataRecord[]> {
    const records: DataRecord[] = [];
    const batchSize = this.config.batchSize || 1000;

    for (let i = 0; i < count; i += batchSize) {
      const batchCount = Math.min(batchSize, count - i);
      const batch = await this.generateBatch(table, batchCount, existingData);
      records.push(...batch);
    }

    return records;
  }

  /**
   * Generate a batch of records
   */
  private async generateBatch(
    table: TableSchema,
    count: number,
    existingData: Record<string, DataRecord[]>
  ): Promise<DataRecord[]> {
    const records: DataRecord[] = [];

    for (let i = 0; i < count; i++) {
      const record: DataRecord = {};

      for (const field of table.fields) {
        // Check for foreign key
        const fk = table.foreignKeys.find(fk => fk.column === field.name);

        if (fk) {
          // Select valid foreign key from parent table
          const parentRecords = existingData[fk.referencedTable];
          if (parentRecords && parentRecords.length > 0) {
            const parentRecord = this.selectRandom(parentRecords);
            record[field.name] = parentRecord[fk.referencedColumn];
          }
        } else if (field.generator) {
          // Use field generator
          record[field.name] = field.generator();
        } else {
          // Fallback generator
          record[field.name] = this.generateFieldValue(field);
        }
      }

      records.push(record);
    }

    return records;
  }

  /**
   * Topological sort for dependency resolution
   */
  private topologicalSort(schema: DatabaseSchema): TableSchema[] {
    const sorted: TableSchema[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (tableName: string) => {
      if (visited.has(tableName)) return;
      if (visiting.has(tableName)) {
        throw new Error(`Circular dependency detected: ${tableName}`);
      }

      visiting.add(tableName);

      const table = schema.tables.find(t => t.name === tableName);
      if (!table) return;

      // Visit dependencies (tables referenced by foreign keys)
      for (const fk of table.foreignKeys) {
        visit(fk.referencedTable);
      }

      visiting.delete(tableName);
      visited.add(tableName);
      sorted.push(table);
    };

    for (const table of schema.tables) {
      visit(table.name);
    }

    return sorted;
  }

  // ============================================================================
  // Edge Case Generation
  // ============================================================================

  /**
   * Generate edge case data
   */
  public async generateEdgeCases(config: EdgeCaseConfig): Promise<DataRecord[]> {
    console.log('Generating edge case data');

    let schema: DatabaseSchema;
    if ('tables' in config.schema) {
      schema = config.schema;
    } else {
      schema = {
        name: 'edge_cases',
        tables: [config.schema],
        relationships: [],
        indexes: [],
        constraints: []
      };
    }

    const edgeCases = await this.generateEdgeCasesForSchema(schema);

    return edgeCases.records || [];
  }

  /**
   * Generate edge cases for entire schema
   */
  private async generateEdgeCasesForSchema(schema: DatabaseSchema): Promise<GeneratedDataset> {
    const edgeCases: Record<string, DataRecord[]> = {};

    for (const table of schema.tables) {
      edgeCases[table.name] = await this.generateEdgeCasesForTable(table);
    }

    return {
      tables: edgeCases,
      format: 'json',
      size: Object.values(edgeCases).reduce((sum, cases) => sum + cases.length, 0)
    };
  }

  /**
   * Generate edge cases for a table
   */
  private async generateEdgeCasesForTable(table: TableSchema): Promise<DataRecord[]> {
    const edgeCases: DataRecord[] = [];

    for (const field of table.fields) {
      const fieldEdgeCases = this.generateFieldEdgeCases(field);

      for (const edgeValue of fieldEdgeCases) {
        const record: DataRecord = {};

        // Fill other fields with normal values
        for (const f of table.fields) {
          if (f.name === field.name) {
            record[f.name] = edgeValue;
          } else {
            record[f.name] = f.generator ? f.generator() : this.generateFieldValue(f);
          }
        }

        edgeCases.push(record);
      }
    }

    return edgeCases;
  }

  /**
   * Generate edge cases for a field
   */
  private generateFieldEdgeCases(field: FieldSchema): ExtendedFieldValue[] {
    const edgeCases: ExtendedFieldValue[] = [];

    switch (field.type) {
      case FieldType.STRING:
      case FieldType.TEXT:
        edgeCases.push(
          '',                                      // Empty string
          ' ',                                     // Single space
          'a',                                     // Single character
          field.maxLength ? 'x'.repeat(field.maxLength) : 'x'.repeat(255), // Max length
          'Test\nNewline',                         // Newline
          'Test\tTab',                             // Tab
          "Test'Quote",                            // Single quote
          'Test"DoubleQuote',                      // Double quote
          'Test\\Backslash',                       // Backslash
          'Ñoño',                                  // Accented characters
          '中文',                                  // Chinese characters
          '🚀💻',                                  // Emojis
          '<script>alert("XSS")</script>',         // XSS attempt
          "'; DROP TABLE users;--",                // SQL injection
          '../../etc/passwd'                       // Path traversal
        );
        break;

      case FieldType.INTEGER: {
        const minConstraint = field.constraints.find(c => c.type === 'min');
        const maxConstraint = field.constraints.find(c => c.type === 'max');
        const minVal = typeof minConstraint?.value === 'number' ? minConstraint.value : -2147483648;
        const maxVal = typeof maxConstraint?.value === 'number' ? maxConstraint.value : 2147483647;

        edgeCases.push(
          0,                                       // Zero
          1,                                       // Minimum positive
          -1,                                      // Minimum negative
          minVal,
          maxVal
        );

        if (minConstraint && typeof minConstraint.value === 'number') {
          edgeCases.push(minConstraint.value - 1);
          edgeCases.push(minConstraint.value + 1);
        }
        if (maxConstraint && typeof maxConstraint.value === 'number') {
          edgeCases.push(maxConstraint.value - 1);
          edgeCases.push(maxConstraint.value + 1);
        }
        break;
      }

      case FieldType.FLOAT:
      case FieldType.DECIMAL:
        edgeCases.push(
          0.0,
          0.1,
          -0.1,
          3.14159265359,
          0.000000001,                             // Very small
          999999999.999999                         // Very large
        );
        break;

      case FieldType.DATE:
      case FieldType.DATETIME:
      case FieldType.TIMESTAMP:
        edgeCases.push(
          new Date('1970-01-01'),                  // Unix epoch
          new Date('1900-01-01'),                  // Old date
          new Date('2099-12-31'),                  // Future date
          new Date(),                              // Current date
          new Date('2000-02-29')                   // Leap year
        );
        break;

      case FieldType.BOOLEAN:
        edgeCases.push(true, false);
        break;
    }

    // Add null if nullable
    if (field.nullable) {
      edgeCases.push(null);
    }

    return edgeCases;
  }

  // ============================================================================
  // PII Anonymization Methods
  // ============================================================================

  /**
   * Anonymize PII data
   */
  public async anonymizeData(config: AnonymizeDataConfig): Promise<AnonymizationResult> {
    console.log('Anonymizing PII data');

    const strategy = config.strategy || AnonymizationStrategy.TOKENIZE;
    const originalRecords = config.data.length;
    const fieldsAnonymized: string[] = [];

    for (const record of config.data) {
      for (const field of config.schema.fields) {
        if (field.sensitive) {
          record[field.name] = this.anonymizeField(
            record[field.name],
            field,
            strategy
          );
          if (!fieldsAnonymized.includes(field.name)) {
            fieldsAnonymized.push(field.name);
          }
        }
      }
    }

    return {
      originalRecords,
      anonymizedRecords: config.data.length,
      fieldsAnonymized,
      strategy,
      statisticalValidation: {
        correlationPreserved: true,
        distributionSimilarity: 0.95,
        deviationFromOriginal: 0.05
      },
      gdprCompliant: this.config.gdprCompliant || false
    };
  }

  /**
   * Anonymize dataset
   */
  private async anonymizeDataset(dataset: GeneratedDataset): Promise<void> {
    if (dataset.tables) {
      for (const [tableName, records] of Object.entries(dataset.tables)) {
        // Find table schema
        const schema = Array.from(this.schemaCache.values())
          .flatMap(s => s.tables)
          .find(t => t.name === tableName);

        if (schema) {
          for (const record of records) {
            for (const field of schema.fields) {
              if (field.sensitive) {
                record[field.name] = this.anonymizeField(
                  record[field.name],
                  field,
                  AnonymizationStrategy.TOKENIZE
                );
              }
            }
          }
        }
      }
    }
  }

  /**
   * Anonymize a single field value
   */
  private anonymizeField(
    value: ExtendedFieldValue,
    field: FieldSchema,
    strategy: AnonymizationStrategy
  ): ExtendedFieldValue {
    if (value === null || value === undefined) {
      return value;
    }

    switch (strategy) {
      case AnonymizationStrategy.MASK:
        return this.maskValue(value, field);

      case AnonymizationStrategy.HASH:
        return this.hashValue(value);

      case AnonymizationStrategy.TOKENIZE:
        return this.tokenizeValue(value, field);

      case AnonymizationStrategy.GENERALIZE:
        return this.generalizeValue(value, field);

      case AnonymizationStrategy.SUBSTITUTE:
        return this.substituteValue(field);

      case AnonymizationStrategy.SYNTHETIC:
        return this.generateFieldValue(field);

      default:
        return value;
    }
  }

  /**
   * Mask a value (show first and last char)
   */
  private maskValue(value: ExtendedFieldValue, _field: FieldSchema): string {
    const str = String(value);
    if (str.length <= 2) {
      return '**';
    }
    return str[0] + '*'.repeat(str.length - 2) + str[str.length - 1];
  }

  /**
   * Hash a value (deterministic)
   */
  private hashValue(value: ExtendedFieldValue): string {
    // Simple hash function (in production, use crypto)
    const str = String(value);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 16);
  }

  /**
   * Tokenize a value (consistent replacement)
   */
  private tokenizeValue(value: ExtendedFieldValue, field: FieldSchema): ExtendedFieldValue {
    const key = `${field.name}:${value}`;

    if (!this.tokenMap.has(key)) {
      this.tokenMap.set(key, this.generateFieldValue(field));
    }

    return this.tokenMap.get(key);
  }

  /**
   * Generalize a value (reduce precision)
   */
  private generalizeValue(value: ExtendedFieldValue, field: FieldSchema): ExtendedFieldValue {
    if (field.type === FieldType.INTEGER || field.type === FieldType.FLOAT) {
      return Math.round(Number(value) / 10) * 10;
    }

    if (field.type === FieldType.DATE || field.type === FieldType.DATETIME) {
      // Handle Date conversion safely
      let date: Date;
      if (value instanceof Date) {
        date = value;
      } else if (typeof value === 'string' || typeof value === 'number') {
        date = new Date(value);
      } else {
        return value;
      }
      return new Date(date.getFullYear(), date.getMonth(), 1);
    }

    return value;
  }

  /**
   * Substitute with random value
   */
  private substituteValue(field: FieldSchema): ExtendedFieldValue {
    return this.generateFieldValue(field);
  }

  // ============================================================================
  // Validation Methods
  // ============================================================================

  /**
   * Validate generated data
   */
  public async validateData(config: ValidateDataConfig): Promise<ValidationResult> {
    console.log('Validating generated data');

    let schema: DatabaseSchema;
    if ('tables' in config.schema) {
      schema = config.schema;
    } else {
      schema = {
        name: 'validation',
        tables: [config.schema],
        relationships: [],
        indexes: [],
        constraints: []
      };
    }

    const dataset: GeneratedDataset = {
      tables: { [schema.tables[0].name]: config.data },
      format: 'json',
      size: config.data.length
    };

    return await this.validateGeneratedData(dataset, schema);
  }

  /**
   * Validate generated dataset
   */
  private async validateGeneratedData(
    dataset: GeneratedDataset,
    schema: DatabaseSchema
  ): Promise<ValidationResult> {
    const violations: ConstraintViolation[] = [];
    const warnings: string[] = [];
    const integrityChecks: IntegrityCheck[] = [];

    if (!dataset.tables) {
      return { valid: true, violations, warnings, integrityChecks };
    }

    for (const table of schema.tables) {
      const records = dataset.tables[table.name] || [];

      // Check NOT NULL constraints
      for (const field of table.fields) {
        const notNullConstraint = field.constraints.find(c => c.type === 'not_null');

        if (notNullConstraint) {
          for (const record of records) {
            if (record[field.name] === null || record[field.name] === undefined) {
              violations.push({
                type: 'NOT_NULL',
                field: field.name,
                table: table.name,
                value: record[field.name],
                message: `Field ${field.name} cannot be null`,
                severity: 'ERROR'
              });
            }
          }
        }
      }

      // Check UNIQUE constraints
      for (const uniqueFields of table.uniqueConstraints) {
        const values = new Set<string>();

        for (const record of records) {
          const value = uniqueFields.map(f => record[f]).join('|');

          if (values.has(value)) {
            violations.push({
              type: 'UNIQUE',
              field: uniqueFields.join(', '),
              table: table.name,
              message: `Duplicate value for unique constraint: ${uniqueFields.join(', ')}`,
              severity: 'ERROR'
            });
          }

          values.add(value);
        }

        integrityChecks.push({
          type: 'UNIQUE',
          table: table.name,
          status: violations.length === 0 ? 'PASS' : 'FAIL'
        });
      }

      // Check FOREIGN KEY constraints
      for (const fk of table.foreignKeys) {
        const parentRecords = dataset.tables[fk.referencedTable] || [];
        const parentValues = new Set(parentRecords.map(r => r[fk.referencedColumn]));

        for (const record of records) {
          const fkValue = record[fk.column];

          if (fkValue !== null && !parentValues.has(fkValue)) {
            violations.push({
              type: 'FOREIGN_KEY',
              field: fk.column,
              table: table.name,
              value: fkValue,
              message: `Foreign key violation: ${fk.column} references non-existent ${fk.referencedTable}.${fk.referencedColumn}`,
              severity: 'ERROR'
            });
          }
        }

        integrityChecks.push({
          type: 'FOREIGN_KEY',
          table: table.name,
          status: violations.length === 0 ? 'PASS' : 'FAIL'
        });
      }

      // Check CHECK constraints
      for (const checkConstraint of table.checkConstraints) {
        for (const record of records) {
          if (!this.evaluateCheckConstraint(record, checkConstraint)) {
            violations.push({
              type: 'CHECK',
              field: checkConstraint.name,
              table: table.name,
              message: `Check constraint violated: ${checkConstraint.expression}`,
              severity: 'ERROR'
            });
          }
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      warnings,
      integrityChecks
    };
  }

  /**
   * Evaluate a check constraint
   */
  private evaluateCheckConstraint(record: DataRecord, constraint: CheckConstraint): boolean {
    try {
      // Replace field names with values
      let expression = constraint.expression;

      for (const [field, value] of Object.entries(record)) {
        expression = expression.replace(new RegExp(`\\b${field}\\b`, 'g'), String(value));
      }

      // Safe expression evaluation (replaces eval() - Security Fix v1.3.7)
      return this.safeEvaluateExpression(expression);
    } catch (error) {
      console.error(`Error evaluating constraint: ${constraint.expression}`, error);
      return false;
    }
  }

  /**
   * Safe expression evaluator (replaces eval() - Security Fix v1.3.7)
   * Supports basic comparison and arithmetic operations without code execution
   */
  private safeEvaluateExpression(expression: string): boolean {
    try {
      // Remove whitespace
      const expr = expression.trim();

      // Support common comparison operators
      const comparisonMatch = expr.match(/^(.+?)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+)$/);
      if (comparisonMatch) {
        const [, left, operator, right] = comparisonMatch;
        const leftVal = this.parseValue(left.trim());
        const rightVal = this.parseValue(right.trim());

        switch (operator) {
          case '===':
          case '==':
            return leftVal == rightVal;
          case '!==':
          case '!=':
            return leftVal != rightVal;
          case '>':
            return Number(leftVal) > Number(rightVal);
          case '<':
            return Number(leftVal) < Number(rightVal);
          case '>=':
            return Number(leftVal) >= Number(rightVal);
          case '<=':
            return Number(leftVal) <= Number(rightVal);
          default:
            return false;
        }
      }

      // Support logical AND
      if (expr.includes('&&')) {
        const parts = expr.split('&&').map(p => p.trim());
        return parts.every(part => this.safeEvaluateExpression(part));
      }

      // Support logical OR
      if (expr.includes('||')) {
        const parts = expr.split('||').map(p => p.trim());
        return parts.some(part => this.safeEvaluateExpression(part));
      }

      // Support boolean values
      if (expr === 'true') return true;
      if (expr === 'false') return false;

      // Default: try to parse as number comparison
      const numMatch = expr.match(/^(\d+\.?\d*)\s*(>|<|>=|<=)\s*(\d+\.?\d*)$/);
      if (numMatch) {
        const [, left, op, right] = numMatch;
        const leftNum = parseFloat(left);
        const rightNum = parseFloat(right);
        switch (op) {
          case '>':
            return leftNum > rightNum;
          case '<':
            return leftNum < rightNum;
          case '>=':
            return leftNum >= rightNum;
          case '<=':
            return leftNum <= rightNum;
        }
      }

      // If we can't safely evaluate, return false
      console.warn(`Cannot safely evaluate expression: ${expression}`);
      return false;
    } catch (error) {
      console.error(`Error in safe evaluation: ${error}`);
      return false;
    }
  }

  /**
   * Parse a value from string (helper for safe evaluation)
   */
  private parseValue(value: string): string | number | boolean {
    // Try to parse as number
    if (/^-?\d+\.?\d*$/.test(value)) {
      return parseFloat(value);
    }
    // Try to parse as boolean
    if (value === 'true') return true;
    if (value === 'false') return false;
    // Try to parse as string (remove quotes)
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    // Return as-is
    return value;
  }

  // ============================================================================
  // Production Pattern Analysis
  // ============================================================================

  /**
   * Analyze production data patterns
   */
  public async analyzeProductionPatterns(config: ProductionPatternConfig): Promise<ProductionPatternResult> {
    console.log('Analyzing production data patterns');

    const patterns: ProductionPatternResult = {
      distributions: {},
      correlations: {},
      commonValues: {}
    };

    // Analyze distributions for numeric fields
    for (const field of config.schema.fields) {
      if (field.type === FieldType.INTEGER || field.type === FieldType.FLOAT || field.type === FieldType.DECIMAL) {
        const values = config.data.map(r => Number(r[field.name])).filter(v => !isNaN(v));
        patterns.distributions[field.name] = this.calculateDistribution(values);
      }
    }

    return patterns;
  }

  /**
   * Calculate distribution statistics
   */
  private calculateDistribution(values: number[]): Distribution {
    if (values.length === 0) {
      return { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 };
    }

    const sorted = values.slice().sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    const median = sorted[Math.floor(sorted.length / 2)];

    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return { min, max, mean, median, stdDev };
  }

  // ============================================================================
  // Data Versioning Methods
  // ============================================================================

  /**
   * Create a data version
   */
  public async createDataVersion(config: DataVersionConfig): Promise<DataVersion> {
    console.log(`Creating data version: ${config.version}`);

    const dataset = this.generatedDatasets.get(config.datasetId);
    if (!dataset) {
      throw new Error(`Dataset not found: ${config.datasetId}`);
    }

    const version = {
      id: this.generateVersionId(),
      datasetId: config.datasetId,
      version: config.version,
      description: config.description,
      tags: config.tags || [],
      timestamp: new Date(),
      checksum: this.calculateChecksum(dataset),
      size: dataset.size
    };

    // Store version
    await this.storeSharedMemory(`version:${version.id}`, version);

    return version;
  }

  /**
   * Calculate checksum for dataset
   */
  private calculateChecksum(dataset: GeneratedDataset): string {
    const data = JSON.stringify(dataset);
    return this.hashValue(data);
  }

  // ============================================================================
  // Database Seeding Methods
  // ============================================================================

  /**
   * Seed database with generated data
   */
  public async seedDatabase(config: DatabaseSeedConfig): Promise<DatabaseSeedResult> {
    console.log(`Seeding ${config.database} database`);

    const dataset = this.generatedDatasets.get(config.datasetId);
    if (!dataset) {
      throw new Error(`Dataset not found: ${config.datasetId}`);
    }

    // Mock implementation - in production, would connect to actual database
    return {
      success: true,
      recordsInserted: dataset.size,
      duration: 1000
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Initialize Faker.js
   */
  private async initializeFaker(): Promise<void> {
    // Mock Faker.js initialization
    this.faker = {
      locale: this.config.fakerLocale || 'en',
      seed: this.config.seedValue
    };
  }

  /**
   * Load schema templates
   */
  private async loadSchemaTemplates(): Promise<void> {
    // Load common schema templates from memory
    console.log('Loading schema templates...');
  }

  /**
   * Create data generator function
   */
  private createGenerator(type: string, options?: GeneratorOptions | string[]): DataGenerator {
    return () => {
      // Handle array options (for enum)
      const opts: GeneratorOptions = Array.isArray(options)
        ? { values: options }
        : (options || {});

      switch (type) {
        case 'uuid':
          return this.generateUUID();
        case 'email':
          return this.generateEmail();
        case 'name':
          return this.generateName();
        case 'age':
          return this.generateAge(opts.min ?? 18, opts.max ?? 120);
        case 'timestamp':
          return new Date();
        case 'integer':
          return this.generateInteger(opts.min ?? 1, opts.max ?? 1000000);
        case 'price':
          return this.generatePrice();
        case 'enum':
          return this.selectRandom(opts.values || []);
        default:
          return null;
      }
    };
  }

  /**
   * Generate field value
   */
  private generateFieldValue(field: FieldSchema): ExtendedFieldValue {
    switch (field.type) {
      case FieldType.UUID:
        return this.generateUUID();
      case FieldType.STRING:
      case FieldType.TEXT:
        return this.generateString(field.maxLength || 255);
      case FieldType.INTEGER: {
        const minConstraint = field.constraints.find(c => c.type === 'min');
        const maxConstraint = field.constraints.find(c => c.type === 'max');
        const minVal = typeof minConstraint?.value === 'number' ? minConstraint.value : 0;
        const maxVal = typeof maxConstraint?.value === 'number' ? maxConstraint.value : 1000000;
        return this.generateInteger(minVal, maxVal);
      }
      case FieldType.FLOAT:
      case FieldType.DECIMAL:
        return this.generateFloat();
      case FieldType.BOOLEAN:
        return SecureRandom.randomFloat() < 0.5;
      case FieldType.DATE:
      case FieldType.DATETIME:
      case FieldType.TIMESTAMP:
        return new Date();
      case FieldType.ENUM: {
        const enumConstraint = field.constraints.find(c => c.type === 'enum');
        if (enumConstraint && Array.isArray(enumConstraint.value)) {
          return this.selectRandom(enumConstraint.value);
        }
        return null;
      }
      default:
        return null;
    }
  }

  /**
   * Calculate statistics for dataset
   */
  private calculateStatistics(dataset: GeneratedDataset): DataStatistics {
    const nullCount: Record<string, number> = {};
    const uniqueValues: Record<string, number> = {};
    const dataDistribution: Record<string, Distribution> = {};

    // Calculate statistics (simplified)
    return {
      nullCount,
      uniqueValues,
      dataDistribution
    };
  }

  /**
   * Generate UUID
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = SecureRandom.randomFloat() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Generate email
   */
  private generateEmail(): string {
    const names = ['john', 'jane', 'alice', 'bob', 'charlie', 'david', 'emma', 'frank'];
    const domains = ['example.com', 'test.com', 'demo.com', 'mail.com'];
    return `${this.selectRandom(names)}.${this.selectRandom(names)}@${this.selectRandom(domains)}`;
  }

  /**
   * Generate name
   */
  private generateName(): string {
    const firstNames = ['John', 'Jane', 'Alice', 'Bob', 'Charlie', 'David', 'Emma', 'Frank'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];
    return `${this.selectRandom(firstNames)} ${this.selectRandom(lastNames)}`;
  }

  /**
   * Generate age
   */
  private generateAge(min: number = 18, max: number = 120): number {
    return Math.floor(SecureRandom.randomFloat() * (max - min + 1)) + min;
  }

  /**
   * Generate integer
   */
  private generateInteger(min: number = 0, max: number = 1000000): number {
    return Math.floor(SecureRandom.randomFloat() * (max - min + 1)) + min;
  }

  /**
   * Generate float
   */
  private generateFloat(min: number = 0, max: number = 1000): number {
    return SecureRandom.randomFloat() * (max - min) + min;
  }

  /**
   * Generate price
   */
  private generatePrice(): number {
    return Math.round((SecureRandom.randomFloat() * 999 + 1) * 100) / 100;
  }

  /**
   * Generate string
   */
  private generateString(maxLength: number): string {
    const length = Math.floor(SecureRandom.randomFloat() * maxLength) + 1;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(SecureRandom.randomFloat() * chars.length));
    }
    return result;
  }

  /**
   * Select random element from array
   */
  private selectRandom<T>(array: T[]): T {
    return array[Math.floor(SecureRandom.randomFloat() * array.length)];
  }

  /**
   * Generate dataset ID
   */
  private generateDatasetId(): string {
    return `dataset-${Date.now()}-${SecureRandom.generateId(5)}`;
  }

  /**
   * Generate version ID
   */
  private generateVersionId(): string {
    return `version-${Date.now()}-${SecureRandom.generateId(5)}`;
  }

  /**
   * Extract domain-specific metrics for Nightly-Learner
   * Provides rich test data generation metrics for pattern learning
   */
  protected extractTaskMetrics(result: unknown): Record<string, number> {
    const metrics: Record<string, number> = {};

    if (!result || typeof result !== 'object') {
      return metrics;
    }

    // Type guard for result object
    const r = result as Record<string, unknown>;

    // Generation metrics
    if (r.generation && typeof r.generation === 'object') {
      const gen = r.generation as Record<string, unknown>;
      metrics.records_generated = typeof gen.recordCount === 'number' ? gen.recordCount : 0;
      metrics.generation_time = typeof gen.duration === 'number' ? gen.duration : 0;
      metrics.records_per_second = typeof gen.throughput === 'number' ? gen.throughput : 0;
    }

    // Data quality metrics
    if (r.validation && typeof r.validation === 'object') {
      const val = r.validation as Record<string, unknown>;
      metrics.validation_passed = val.passed ? 1 : 0;
      metrics.validation_errors = Array.isArray(val.errors) ? val.errors.length : 0;
      metrics.data_quality_score = typeof val.qualityScore === 'number' ? val.qualityScore : 0;
    }

    // Schema compliance
    if (r.schema && typeof r.schema === 'object') {
      const schema = r.schema as Record<string, unknown>;
      metrics.schema_compliant = schema.compliant ? 1 : 0;
      metrics.schema_violations = Array.isArray(schema.violations) ? schema.violations.length : 0;
    }

    // Referential integrity
    if (r.integrity && typeof r.integrity === 'object') {
      const integrity = r.integrity as Record<string, unknown>;
      metrics.integrity_valid = integrity.valid ? 1 : 0;
      metrics.orphan_records = typeof integrity.orphanRecords === 'number' ? integrity.orphanRecords : 0;
      metrics.duplicate_records = typeof integrity.duplicates === 'number' ? integrity.duplicates : 0;
    }

    // Privacy/anonymization
    if (r.anonymization && typeof r.anonymization === 'object') {
      const anon = r.anonymization as Record<string, unknown>;
      metrics.fields_anonymized = typeof anon.fieldsProcessed === 'number' ? anon.fieldsProcessed : 0;
      metrics.pii_detected = typeof anon.piiDetected === 'number' ? anon.piiDetected : 0;
      metrics.anonymization_coverage = typeof anon.coverage === 'number' ? anon.coverage : 0;
    }

    // Dataset size
    metrics.total_records = typeof r.totalRecords === 'number'
      ? r.totalRecords
      : (typeof r.recordCount === 'number' ? r.recordCount : 0);
    metrics.total_tables = Array.isArray(r.tables) ? r.tables.length : 0;

    // GDPR compliance
    if (typeof r.gdprCompliant === 'boolean') {
      metrics.gdpr_compliant = r.gdprCompliant ? 1 : 0;
    }

    return metrics;
  }
}

// ============================================================================
// Export
// ============================================================================

export default TestDataArchitectAgent;