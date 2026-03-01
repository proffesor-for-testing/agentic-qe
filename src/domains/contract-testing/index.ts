/**
 * Agentic QE v3 - Contract Testing Domain
 * API contracts, consumer-driven contracts, schema validation
 *
 * This module exports the public API for the contract-testing domain.
 */

// ============================================================================
// Domain Plugin (Primary Export)
// ============================================================================

export {
  ContractTestingPlugin,
  createContractTestingPlugin,
  type ContractTestingPluginConfig,
  type ContractTestingAPI,
  type ContractTestingExtendedAPI,
} from './plugin.js';

// ============================================================================
// Coordinator
// ============================================================================

export {
  ContractTestingCoordinator,
  ContractTestingEvents,
  type WorkflowStatus,
  type CoordinatorConfig,
} from './coordinator.js';

// ============================================================================
// Services
// ============================================================================

export {
  ContractValidatorService,
  type ContractValidatorConfig,
} from './services/contract-validator.js';

export {
  ApiCompatibilityService,
  type ApiCompatibilityConfig,
} from './services/api-compatibility.js';

export {
  SchemaValidatorService,
  type SchemaValidatorConfig,
} from './services/schema-validator.js';

// ============================================================================
// Interfaces (Types Only)
// ============================================================================

export type {
  // Value Objects
  ApiContract,
  ContractType,
  ServiceInfo,
  ContractEndpoint,
  HttpMethod,
  EndpointExample,
  SchemaDefinition,

  // Verification Results
  VerificationResult,
  ContractFailure,
  FailureType,
  ContractWarning,

  // Breaking Changes
  BreakingChange,
  BreakingChangeType,

  // Validation
  ValidationReport,
  ValidationError,
  SchemaValidationResult,
  SchemaError,
  OpenAPIValidationResult,

  // Compatibility
  CompatibilityReport,
  NonBreakingChange,
  Deprecation,
  MigrationGuide,
  MigrationStep,

  // GraphQL
  GraphQLValidationResult,
  GraphQLError,

  // Schema Comparison
  SchemaComparisonResult,
  SchemaModification,

  // Provider Reports
  ProviderVerificationReport,
  PreReleaseReport,
  AffectedConsumer,

  // Mock
  MockResponse,

  // Service Interfaces
  IContractValidationService,
  IContractVerificationService,
  IApiCompatibilityService,
  ISchemaValidationService,

  // Repository Interfaces
  IContractRepository,
  IVerificationResultRepository,

  // Coordinator Interface
  IContractTestingCoordinator,

  // Domain Events
  ContractVerifiedEvent,
  BreakingChangeDetectedEvent,
  ContractPublishedEvent,
  ConsumerContractCreatedEvent,
} from './interfaces.js';
