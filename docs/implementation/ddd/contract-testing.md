# Contract Testing Domain

## Bounded Context Overview

**Domain**: Contract Testing
**Responsibility**: API contracts, consumer-driven contracts, schema validation
**Location**: `src/domains/contract-testing/`

The Contract Testing domain ensures API compatibility between services through consumer-driven contracts, schema validation, breaking change detection, and migration planning.

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **API Contract** | Formal specification of API behavior |
| **Consumer** | Service that calls an API |
| **Provider** | Service that exposes an API |
| **Breaking Change** | Incompatible API modification |
| **Schema** | Data structure specification |
| **Pact** | Consumer-driven contract format |
| **Verification** | Testing provider against consumer contracts |
| **Migration** | Process of updating to new API version |

## Domain Model

### Aggregates

#### ApiContract (Aggregate Root)
Complete API contract definition.

```typescript
interface ApiContract {
  id: string;
  name: string;
  version: Version;
  type: ContractType;
  provider: ServiceInfo;
  consumers: ServiceInfo[];
  endpoints: ContractEndpoint[];
  schemas: SchemaDefinition[];
}
```

#### VerificationResult (Aggregate Root)
Result of contract verification.

```typescript
interface VerificationResult {
  contractId: string;
  provider: string;
  consumer: string;
  passed: boolean;
  failures: ContractFailure[];
  warnings: ContractWarning[];
  timestamp: Date;
}
```

### Entities

#### ContractEndpoint
Individual API endpoint in contract.

```typescript
interface ContractEndpoint {
  path: string;
  method: HttpMethod;
  requestSchema?: string;
  responseSchema?: string;
  headers?: Record<string, string>;
  examples: EndpointExample[];
}
```

#### BreakingChange
Detected incompatible change.

```typescript
interface BreakingChange {
  type: BreakingChangeType;
  location: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  affectedConsumers: string[];
  migrationPath?: string;
}
```

#### SchemaDefinition
Schema specification.

```typescript
interface SchemaDefinition {
  id: string;
  name: string;
  type: 'json-schema' | 'openapi' | 'graphql' | 'protobuf' | 'avro';
  content: string;
}
```

### Value Objects

#### ContractType
```typescript
type ContractType = 'rest' | 'graphql' | 'grpc' | 'event' | 'message';
```

#### HttpMethod
```typescript
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
```

#### BreakingChangeType
```typescript
type BreakingChangeType =
  | 'removed-endpoint'
  | 'removed-field'
  | 'type-change'
  | 'required-field-added'
  | 'enum-value-removed'
  | 'response-code-change';
```

#### FailureType
```typescript
type FailureType =
  | 'missing-endpoint'
  | 'schema-mismatch'
  | 'status-code-mismatch'
  | 'header-mismatch'
  | 'response-body-mismatch'
  | 'timeout'
  | 'connection-error';
```

#### ServiceInfo
Service identification.

```typescript
interface ServiceInfo {
  readonly name: string;
  readonly version: string;
  readonly team?: string;
  readonly repository?: string;
}
```

## Domain Services

### IContractTestingCoordinator
Primary coordinator for the domain.

```typescript
interface IContractTestingCoordinator {
  registerContract(contract: ApiContract): Promise<Result<string>>;
  verifyAllConsumers(providerName: string, providerUrl: string): Promise<Result<ProviderVerificationReport>>;
  preReleaseCheck(providerName: string, newContractPath: FilePath): Promise<Result<PreReleaseReport>>;
  importFromOpenAPI(specPath: FilePath): Promise<Result<ApiContract>>;
  exportToOpenAPI(contractId: string): Promise<Result<string>>;
  prioritizeContracts(contracts: ApiContract[], context: ContractPrioritizationContext): Promise<Result<ContractPrioritizationResult>>;

  // MinCut integration (ADR-047)
  setMinCutBridge(bridge: QueenMinCutBridge): void;
  isTopologyHealthy(): boolean;
  getDomainWeakVertices(): WeakVertex[];

  // Consensus integration (MM-001)
  isConsensusAvailable(): boolean;
  getConsensusStats(): ConsensusStats | undefined;
  verifyContractViolation(violation: ContractViolationInfo, confidence: number): Promise<boolean>;
  verifyBreakingChange(change: BreakingChangeInfo, confidence: number): Promise<boolean>;
}
```

### IContractValidationService
Contract structure validation.

```typescript
interface IContractValidationService {
  validateContract(contract: ApiContract): Promise<Result<ValidationReport>>;
  validateRequest(request: unknown, schema: SchemaDefinition): Promise<Result<SchemaValidationResult>>;
  validateResponse(response: unknown, schema: SchemaDefinition): Promise<Result<SchemaValidationResult>>;
  validateOpenAPI(spec: string): Promise<Result<OpenAPIValidationResult>>;
}
```

### IContractVerificationService
Provider verification against contracts.

```typescript
interface IContractVerificationService {
  verifyProvider(providerUrl: string, contracts: ApiContract[]): Promise<Result<VerificationResult[]>>;
  verifyConsumerContract(providerUrl: string, contract: ApiContract, consumerName: string): Promise<Result<VerificationResult>>;
  verifyWithMocks(contract: ApiContract, mocks: MockResponse[]): Promise<Result<VerificationResult>>;
}
```

### IApiCompatibilityService
Breaking change detection.

```typescript
interface IApiCompatibilityService {
  compareVersions(oldContract: ApiContract, newContract: ApiContract): Promise<Result<CompatibilityReport>>;
  isBackwardCompatible(oldContract: ApiContract, newContract: ApiContract): Promise<Result<boolean>>;
  getBreakingChanges(oldContract: ApiContract, newContract: ApiContract): Promise<Result<BreakingChange[]>>;
  generateMigrationGuide(breakingChanges: BreakingChange[]): Promise<Result<MigrationGuide>>;
}
```

### ISchemaValidationService
Schema format validation.

```typescript
interface ISchemaValidationService {
  validateJsonSchema(data: unknown, schema: object): Promise<Result<SchemaValidationResult>>;
  validateGraphQLSchema(schema: string): Promise<Result<GraphQLValidationResult>>;
  compareSchemas(oldSchema: SchemaDefinition, newSchema: SchemaDefinition): Promise<Result<SchemaComparisonResult>>;
  inferSchema(samples: unknown[]): Promise<Result<SchemaDefinition>>;
}
```

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `ContractVerifiedEvent` | Verification complete | `{ contractId, provider, consumer, passed, failureCount }` |
| `BreakingChangeDetectedEvent` | Breaking change found | `{ contractId, changes, affectedConsumers }` |
| `ContractPublishedEvent` | Contract published | `{ contractId, version, provider }` |
| `ConsumerContractCreatedEvent` | Consumer contract added | `{ contractId, consumer, provider, interactionCount }` |

## SARSA RL Integration

The domain uses SARSA reinforcement learning for contract prioritization:

```typescript
interface ContractPrioritizationContext {
  readonly urgency: number;           // 0-1 urgency level
  readonly providerLoad: number;      // Current provider load
  readonly consumerCount: number;     // Number of consumers
}

interface ContractPrioritizationResult {
  readonly orderedContracts: ApiContract[];
  readonly strategy: string;
  readonly confidence: number;
}
```

## Repositories

```typescript
interface IContractRepository {
  findById(id: string): Promise<ApiContract | null>;
  findByProvider(provider: string): Promise<ApiContract[]>;
  findByConsumer(consumer: string): Promise<ApiContract[]>;
  findLatestVersion(name: string): Promise<ApiContract | null>;
  save(contract: ApiContract): Promise<void>;
  publish(contract: ApiContract): Promise<void>;
}

interface IVerificationResultRepository {
  findByContractId(contractId: string): Promise<VerificationResult[]>;
  findLatest(contractId: string, consumer: string): Promise<VerificationResult | null>;
  findFailed(since: Date): Promise<VerificationResult[]>;
  save(result: VerificationResult): Promise<void>;
}
```

## Context Integration

### Upstream Dependencies
- OpenAPI/Swagger specifications
- GraphQL schemas
- Protobuf definitions

### Downstream Consumers
- **Quality Assessment**: Contract compliance in gates
- **Security Compliance**: API security validation
- CI/CD pipelines: Pre-release checks

### Anti-Corruption Layer
The domain abstracts different contract formats (Pact, OpenAPI, GraphQL SDL) through the `ApiContract` interface and format-specific importers.

## Task Handlers

| Task Type | Handler | Description |
|-----------|---------|-------------|
| `register-contract` | `registerContract()` | Add new contract |
| `verify-provider` | `verifyAllConsumers()` | Verify against all consumers |
| `pre-release-check` | `preReleaseCheck()` | Breaking change detection |
| `import-openapi` | `importFromOpenAPI()` | Import from spec |
| `prioritize-contracts` | `prioritizeContracts()` | RL-based prioritization |

## Configuration Constants

```typescript
const CONTRACT_CONSTANTS = {
  DEFAULT_TIMEOUT_MS: 60000,
  QUICK_TIMEOUT_MS: 10000,
  MAX_CACHED_VALIDATIONS: 1000,
  CACHE_TTL_MS: 3600000,
  CONTRACT_TTL_SECONDS: 86400,
  MIGRATION_TTL_SECONDS: 86400 * 90,
  MAX_RECURSION_DEPTH: 10,
  MAX_SCHEMA_DEPTH: 20,
  MAX_MIGRATION_STEPS: 50,
  DEFAULT_SEARCH_LIMIT: 100,
  HIGH_IMPACT_THRESHOLD: 5,
  BREAKING_CHANGE_THRESHOLD: 10,
  DEFAULT_PROVIDER_LOAD: 50,
  HIGH_PROVIDER_LOAD_THRESHOLD: 80,
};
```

## Breaking Change Detection

```typescript
function detectBreakingChanges(
  oldContract: ApiContract,
  newContract: ApiContract
): BreakingChange[] {
  const changes: BreakingChange[] = [];

  // Check for removed endpoints
  for (const oldEndpoint of oldContract.endpoints) {
    const newEndpoint = findEndpoint(newContract, oldEndpoint.path, oldEndpoint.method);
    if (!newEndpoint) {
      changes.push({
        type: 'removed-endpoint',
        location: `${oldEndpoint.method} ${oldEndpoint.path}`,
        description: 'Endpoint was removed',
        impact: 'high',
        affectedConsumers: oldContract.consumers.map(c => c.name),
      });
    }
  }

  // Check for schema changes
  for (const oldSchema of oldContract.schemas) {
    const newSchema = findSchema(newContract, oldSchema.id);
    if (newSchema) {
      const schemaChanges = compareSchemas(oldSchema, newSchema);
      changes.push(...schemaChanges);
    }
  }

  return changes;
}
```

## ADR References

- **ADR-047**: MinCut topology for distributed verification
- **MM-001**: Consensus for breaking change verification
