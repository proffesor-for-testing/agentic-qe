/**
 * Agentic QE v3 - Contract Testing Domain Interfaces
 *
 * Bounded Context: Contract Testing
 * Responsibility: API contracts, consumer-driven contracts, schema validation
 */

import type { DomainEvent, Result, DomainName } from '../../shared/types/index.js';
import type { FilePath, Version } from '../../shared/value-objects/index.js';
import type { QueenMinCutBridge } from '../../coordination/mincut/queen-integration.js';
import type { WeakVertex } from '../../coordination/mincut/interfaces.js';
import type { ConsensusStats } from '../../coordination/mixins/consensus-enabled-domain';

// ============================================================================
// Value Objects
// ============================================================================

/**
 * API Contract definition
 */
export interface ApiContract {
  readonly id: string;
  readonly name: string;
  readonly version: Version;
  readonly type: ContractType;
  readonly provider: ServiceInfo;
  readonly consumers: ServiceInfo[];
  readonly endpoints: ContractEndpoint[];
  readonly schemas: SchemaDefinition[];
}

export type ContractType = 'rest' | 'graphql' | 'grpc' | 'event' | 'message';

export interface ServiceInfo {
  readonly name: string;
  readonly version: string;
  readonly team?: string;
  readonly repository?: string;
}

export interface ContractEndpoint {
  readonly path: string;
  readonly method: HttpMethod;
  readonly requestSchema?: string;
  readonly responseSchema?: string;
  readonly headers?: Record<string, string>;
  readonly examples: EndpointExample[];
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface EndpointExample {
  readonly name: string;
  readonly request: unknown;
  readonly response: unknown;
  readonly statusCode: number;
}

export interface SchemaDefinition {
  readonly id: string;
  readonly name: string;
  readonly type: 'json-schema' | 'openapi' | 'graphql' | 'protobuf' | 'avro';
  readonly content: string;
}

/**
 * Contract verification result
 */
export interface VerificationResult {
  readonly contractId: string;
  readonly provider: string;
  readonly consumer: string;
  readonly passed: boolean;
  readonly failures: ContractFailure[];
  readonly warnings: ContractWarning[];
  readonly timestamp: Date;
}

export interface ContractFailure {
  readonly endpoint: string;
  readonly type: FailureType;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly message: string;
}

export type FailureType =
  | 'missing-endpoint'
  | 'schema-mismatch'
  | 'status-code-mismatch'
  | 'header-mismatch'
  | 'response-body-mismatch'
  | 'timeout'
  | 'connection-error';

export interface ContractWarning {
  readonly endpoint: string;
  readonly message: string;
  readonly severity: 'high' | 'medium' | 'low';
}

/**
 * Breaking change detection
 */
export interface BreakingChange {
  readonly type: BreakingChangeType;
  readonly location: string;
  readonly description: string;
  readonly impact: 'high' | 'medium' | 'low';
  readonly affectedConsumers: string[];
  readonly migrationPath?: string;
}

export type BreakingChangeType =
  | 'removed-endpoint'
  | 'removed-field'
  | 'type-change'
  | 'required-field-added'
  | 'enum-value-removed'
  | 'response-code-change';

// ============================================================================
// Domain Events
// ============================================================================

export interface ContractVerifiedEvent extends DomainEvent {
  readonly type: 'ContractVerifiedEvent';
  readonly contractId: string;
  readonly provider: string;
  readonly consumer: string;
  readonly passed: boolean;
  readonly failureCount: number;
}

export interface BreakingChangeDetectedEvent extends DomainEvent {
  readonly type: 'BreakingChangeDetectedEvent';
  readonly contractId: string;
  readonly changes: BreakingChange[];
  readonly affectedConsumers: string[];
}

export interface ContractPublishedEvent extends DomainEvent {
  readonly type: 'ContractPublishedEvent';
  readonly contractId: string;
  readonly version: string;
  readonly provider: string;
}

export interface ConsumerContractCreatedEvent extends DomainEvent {
  readonly type: 'ConsumerContractCreatedEvent';
  readonly contractId: string;
  readonly consumer: string;
  readonly provider: string;
  readonly interactionCount: number;
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Contract Validation Service
 * Validates API contracts against schemas
 */
export interface IContractValidationService {
  /**
   * Validate contract structure
   */
  validateContract(contract: ApiContract): Promise<Result<ValidationReport>>;

  /**
   * Validate request against schema
   */
  validateRequest(request: unknown, schema: SchemaDefinition): Promise<Result<SchemaValidationResult>>;

  /**
   * Validate response against schema
   */
  validateResponse(response: unknown, schema: SchemaDefinition): Promise<Result<SchemaValidationResult>>;

  /**
   * Validate OpenAPI/Swagger specification
   */
  validateOpenAPI(spec: string): Promise<Result<OpenAPIValidationResult>>;
}

export interface ValidationReport {
  readonly isValid: boolean;
  readonly errors: ValidationError[];
  readonly warnings: string[];
}

export interface ValidationError {
  readonly path: string;
  readonly message: string;
  readonly code: string;
}

export interface SchemaValidationResult {
  readonly isValid: boolean;
  readonly errors: SchemaError[];
}

export interface SchemaError {
  readonly path: string;
  readonly keyword: string;
  readonly message: string;
  readonly params: Record<string, unknown>;
}

export interface OpenAPIValidationResult {
  readonly isValid: boolean;
  readonly specVersion: string;
  readonly errors: ValidationError[];
  readonly warnings: string[];
  readonly endpointCount: number;
  readonly schemaCount: number;
}

/**
 * Contract Verification Service
 * Verifies provider against consumer contracts
 */
export interface IContractVerificationService {
  /**
   * Verify provider against consumer contracts
   */
  verifyProvider(
    providerUrl: string,
    contracts: ApiContract[]
  ): Promise<Result<VerificationResult[]>>;

  /**
   * Verify single consumer contract
   */
  verifyConsumerContract(
    providerUrl: string,
    contract: ApiContract,
    consumerName: string
  ): Promise<Result<VerificationResult>>;

  /**
   * Run verification with mock responses
   */
  verifyWithMocks(
    contract: ApiContract,
    mocks: MockResponse[]
  ): Promise<Result<VerificationResult>>;
}

export interface MockResponse {
  readonly endpoint: string;
  readonly method: HttpMethod;
  readonly statusCode: number;
  readonly body: unknown;
  readonly headers?: Record<string, string>;
}

/**
 * API Compatibility Service
 * Detects breaking changes between versions
 */
export interface IApiCompatibilityService {
  /**
   * Compare two contract versions
   */
  compareVersions(
    oldContract: ApiContract,
    newContract: ApiContract
  ): Promise<Result<CompatibilityReport>>;

  /**
   * Check if new version is backward compatible
   */
  isBackwardCompatible(
    oldContract: ApiContract,
    newContract: ApiContract
  ): Promise<Result<boolean>>;

  /**
   * Get breaking changes between versions
   */
  getBreakingChanges(
    oldContract: ApiContract,
    newContract: ApiContract
  ): Promise<Result<BreakingChange[]>>;

  /**
   * Generate migration guide
   */
  generateMigrationGuide(
    breakingChanges: BreakingChange[]
  ): Promise<Result<MigrationGuide>>;
}

export interface CompatibilityReport {
  readonly isCompatible: boolean;
  readonly breakingChanges: BreakingChange[];
  readonly nonBreakingChanges: NonBreakingChange[];
  readonly deprecations: Deprecation[];
}

export interface NonBreakingChange {
  readonly type: 'added-endpoint' | 'added-field' | 'added-enum-value' | 'optional-field-added';
  readonly location: string;
  readonly description: string;
}

export interface Deprecation {
  readonly location: string;
  readonly reason: string;
  readonly removalVersion?: string;
  readonly replacement?: string;
}

export interface MigrationGuide {
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly steps: MigrationStep[];
  readonly estimatedEffort: 'trivial' | 'minor' | 'moderate' | 'major';
}

export interface MigrationStep {
  readonly order: number;
  readonly description: string;
  readonly codeChanges?: string;
  readonly automated: boolean;
}

/**
 * Schema Validation Service
 * Validates data against various schema formats
 */
export interface ISchemaValidationService {
  /**
   * Validate JSON Schema
   */
  validateJsonSchema(data: unknown, schema: object): Promise<Result<SchemaValidationResult>>;

  /**
   * Validate GraphQL schema
   */
  validateGraphQLSchema(schema: string): Promise<Result<GraphQLValidationResult>>;

  /**
   * Compare schemas for compatibility
   */
  compareSchemas(
    oldSchema: SchemaDefinition,
    newSchema: SchemaDefinition
  ): Promise<Result<SchemaComparisonResult>>;

  /**
   * Generate schema from sample data
   */
  inferSchema(samples: unknown[]): Promise<Result<SchemaDefinition>>;
}

export interface GraphQLValidationResult {
  readonly isValid: boolean;
  readonly errors: GraphQLError[];
  readonly typeCount: number;
  readonly queryCount: number;
  readonly mutationCount: number;
}

export interface GraphQLError {
  readonly message: string;
  readonly locations: Array<{ line: number; column: number }>;
}

export interface SchemaComparisonResult {
  readonly isCompatible: boolean;
  readonly additions: string[];
  readonly removals: string[];
  readonly modifications: SchemaModification[];
}

export interface SchemaModification {
  readonly path: string;
  readonly oldType: string;
  readonly newType: string;
  readonly isBreaking: boolean;
}

// ============================================================================
// Repository Interfaces
// ============================================================================

export interface IContractRepository {
  findById(id: string): Promise<ApiContract | null>;
  findByProvider(provider: string): Promise<ApiContract[]>;
  findByConsumer(consumer: string): Promise<ApiContract[]>;
  findLatestVersion(name: string): Promise<ApiContract | null>;
  save(contract: ApiContract): Promise<void>;
  publish(contract: ApiContract): Promise<void>;
}

export interface IVerificationResultRepository {
  findByContractId(contractId: string): Promise<VerificationResult[]>;
  findLatest(contractId: string, consumer: string): Promise<VerificationResult | null>;
  findFailed(since: Date): Promise<VerificationResult[]>;
  save(result: VerificationResult): Promise<void>;
}

// ============================================================================
// Coordinator Interface
// ============================================================================

/**
 * Context for contract prioritization
 */
export interface ContractPrioritizationContext {
  readonly urgency: number;
  readonly providerLoad: number;
  readonly consumerCount: number;
}

/**
 * Result of contract prioritization
 */
export interface ContractPrioritizationResult {
  readonly orderedContracts: ApiContract[];
  readonly strategy: string;
  readonly confidence: number;
}

export interface IContractTestingCoordinator {
  /**
   * Register new contract
   */
  registerContract(contract: ApiContract): Promise<Result<string>>;

  /**
   * Verify all consumer contracts for provider
   */
  verifyAllConsumers(providerName: string, providerUrl: string): Promise<Result<ProviderVerificationReport>>;

  /**
   * Check for breaking changes before release
   */
  preReleaseCheck(
    providerName: string,
    newContractPath: FilePath
  ): Promise<Result<PreReleaseReport>>;

  /**
   * Generate contract from OpenAPI spec
   */
  importFromOpenAPI(specPath: FilePath): Promise<Result<ApiContract>>;

  /**
   * Export contract to OpenAPI spec
   */
  exportToOpenAPI(contractId: string): Promise<Result<string>>;

  /**
   * Prioritize contracts for validation using SARSA RL
   * Uses learned patterns to determine optimal validation order
   */
  prioritizeContracts(
    contracts: ApiContract[],
    context: ContractPrioritizationContext
  ): Promise<Result<ContractPrioritizationResult>>;

  // MinCut integration methods (ADR-047)
  setMinCutBridge(bridge: QueenMinCutBridge): void;
  isTopologyHealthy(): boolean;
  getDomainWeakVertices(): WeakVertex[];
  isDomainWeakPoint(): boolean;
  getTopologyBasedRouting(targetDomains: DomainName[]): DomainName[];

  // Consensus integration methods (MM-001)
  isConsensusAvailable(): boolean;
  getConsensusStats(): ConsensusStats | undefined;
  verifyContractViolation(
    violation: { consumer: string; provider: string; endpoint: string; type: string },
    confidence: number
  ): Promise<boolean>;
  verifyBreakingChange(
    change: { path: string; type: string; affectedConsumers: string[]; description: string },
    confidence: number
  ): Promise<boolean>;
  verifySchemaIncompatibility(
    incompatibility: { schema: string; field: string; expected: string; actual: string },
    confidence: number
  ): Promise<boolean>;
}

export interface ProviderVerificationReport {
  readonly provider: string;
  readonly totalConsumers: number;
  readonly passedConsumers: number;
  readonly failedConsumers: string[];
  readonly results: VerificationResult[];
  readonly canDeploy: boolean;
}

export interface PreReleaseReport {
  readonly breakingChanges: BreakingChange[];
  readonly affectedConsumers: AffectedConsumer[];
  readonly canRelease: boolean;
  readonly recommendations: string[];
}

export interface AffectedConsumer {
  readonly name: string;
  readonly team?: string;
  readonly breakingChanges: BreakingChange[];
  readonly notified: boolean;
}
