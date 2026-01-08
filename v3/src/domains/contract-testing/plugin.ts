/**
 * Agentic QE v3 - Contract Testing Domain Plugin
 * Integrates the contract testing domain into the kernel
 */

import { DomainName, DomainEvent, Result } from '../../shared/types/index.js';
import type {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
} from '../../kernel/interfaces.js';
import { BaseDomainPlugin } from '../domain-interface.js';
import { FilePath } from '../../shared/value-objects/index.js';
import type {
  ApiContract,
  ProviderVerificationReport,
  PreReleaseReport,
  ValidationReport,
  SchemaValidationResult,
  OpenAPIValidationResult,
  CompatibilityReport,
  BreakingChange,
  MigrationGuide,
  SchemaDefinition,
  GraphQLValidationResult,
  SchemaComparisonResult,
  IContractValidationService,
  IApiCompatibilityService,
  ISchemaValidationService,
} from './interfaces.js';
import {
  ContractTestingCoordinator,
  CoordinatorConfig,
  WorkflowStatus,
} from './coordinator.js';
import {
  ContractValidatorService,
  ContractValidatorConfig,
} from './services/contract-validator.js';
import {
  ApiCompatibilityService,
  ApiCompatibilityConfig,
} from './services/api-compatibility.js';
import {
  SchemaValidatorService,
  SchemaValidatorConfig,
} from './services/schema-validator.js';

/**
 * Plugin configuration options
 */
export interface ContractTestingPluginConfig {
  coordinator?: Partial<CoordinatorConfig>;
  contractValidator?: Partial<ContractValidatorConfig>;
  apiCompatibility?: Partial<ApiCompatibilityConfig>;
  schemaValidator?: Partial<SchemaValidatorConfig>;
}

/**
 * Contract Testing Domain API
 */
export interface ContractTestingAPI {
  // Contract Management
  registerContract(contract: ApiContract): Promise<Result<string>>;
  verifyAllConsumers(providerName: string, providerUrl: string): Promise<Result<ProviderVerificationReport>>;
  preReleaseCheck(providerName: string, newContractPath: FilePath): Promise<Result<PreReleaseReport>>;
  importFromOpenAPI(specPath: FilePath): Promise<Result<ApiContract>>;
  exportToOpenAPI(contractId: string): Promise<Result<string>>;

  // Contract Validation
  validateContract(contract: ApiContract): Promise<Result<ValidationReport>>;
  validateRequest(request: unknown, schema: SchemaDefinition): Promise<Result<SchemaValidationResult>>;
  validateResponse(response: unknown, schema: SchemaDefinition): Promise<Result<SchemaValidationResult>>;
  validateOpenAPI(spec: string): Promise<Result<OpenAPIValidationResult>>;

  // API Compatibility
  compareVersions(oldContract: ApiContract, newContract: ApiContract): Promise<Result<CompatibilityReport>>;
  isBackwardCompatible(oldContract: ApiContract, newContract: ApiContract): Promise<Result<boolean>>;
  getBreakingChanges(oldContract: ApiContract, newContract: ApiContract): Promise<Result<BreakingChange[]>>;
  generateMigrationGuide(breakingChanges: BreakingChange[]): Promise<Result<MigrationGuide>>;

  // Schema Validation
  validateJsonSchema(data: unknown, schema: object): Promise<Result<SchemaValidationResult>>;
  validateGraphQLSchema(schema: string): Promise<Result<GraphQLValidationResult>>;
  compareSchemas(oldSchema: SchemaDefinition, newSchema: SchemaDefinition): Promise<Result<SchemaComparisonResult>>;
  inferSchema(samples: unknown[]): Promise<Result<SchemaDefinition>>;
}

/**
 * Extended API with internal access
 */
export interface ContractTestingExtendedAPI extends ContractTestingAPI {
  /** Get the internal coordinator */
  getCoordinator(): ContractTestingCoordinator;

  /** Get the contract validator service */
  getContractValidator(): IContractValidationService;

  /** Get the API compatibility service */
  getApiCompatibility(): IApiCompatibilityService;

  /** Get the schema validator service */
  getSchemaValidator(): ISchemaValidationService;

  /** Get active workflows */
  getActiveWorkflows(): WorkflowStatus[];
}

/**
 * Contract Testing Domain Plugin
 * Provides API contract validation, consumer-driven contracts, and schema validation
 */
export class ContractTestingPlugin extends BaseDomainPlugin {
  private coordinator: ContractTestingCoordinator | null = null;
  private contractValidator: ContractValidatorService | null = null;
  private apiCompatibility: ApiCompatibilityService | null = null;
  private schemaValidator: SchemaValidatorService | null = null;
  private readonly pluginConfig: ContractTestingPluginConfig;

  constructor(
    eventBus: EventBus,
    memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: ContractTestingPluginConfig = {}
  ) {
    super(eventBus, memory);
    this.pluginConfig = config;
  }

  // ============================================================================
  // DomainPlugin Interface Implementation
  // ============================================================================

  get name(): DomainName {
    return 'contract-testing';
  }

  get version(): string {
    return '1.0.0';
  }

  get dependencies(): DomainName[] {
    // Contract testing can optionally use code intelligence for impact analysis
    return [];
  }

  /**
   * Get the domain's public API
   */
  getAPI<T>(): T {
    const api: ContractTestingExtendedAPI = {
      // Contract Management (coordinator methods)
      registerContract: this.registerContract.bind(this),
      verifyAllConsumers: this.verifyAllConsumers.bind(this),
      preReleaseCheck: this.preReleaseCheck.bind(this),
      importFromOpenAPI: this.importFromOpenAPI.bind(this),
      exportToOpenAPI: this.exportToOpenAPI.bind(this),

      // Contract Validation (service methods)
      validateContract: this.validateContract.bind(this),
      validateRequest: this.validateRequest.bind(this),
      validateResponse: this.validateResponse.bind(this),
      validateOpenAPI: this.validateOpenAPI.bind(this),

      // API Compatibility (service methods)
      compareVersions: this.compareVersions.bind(this),
      isBackwardCompatible: this.isBackwardCompatible.bind(this),
      getBreakingChanges: this.getBreakingChanges.bind(this),
      generateMigrationGuide: this.generateMigrationGuide.bind(this),

      // Schema Validation (service methods)
      validateJsonSchema: this.validateJsonSchema.bind(this),
      validateGraphQLSchema: this.validateGraphQLSchema.bind(this),
      compareSchemas: this.compareSchemas.bind(this),
      inferSchema: this.inferSchema.bind(this),

      // Internal access methods
      getCoordinator: () => this.coordinator!,
      getContractValidator: () => this.contractValidator!,
      getApiCompatibility: () => this.apiCompatibility!,
      getSchemaValidator: () => this.schemaValidator!,
      getActiveWorkflows: () => this.coordinator?.getActiveWorkflows() || [],
    };

    return api as T;
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  protected async onInitialize(): Promise<void> {
    // Create services
    this.contractValidator = new ContractValidatorService(
      this.memory,
      this.pluginConfig.contractValidator
    );

    this.apiCompatibility = new ApiCompatibilityService(
      this.memory,
      this.pluginConfig.apiCompatibility
    );

    this.schemaValidator = new SchemaValidatorService(
      this.memory,
      this.pluginConfig.schemaValidator
    );

    // Create coordinator
    this.coordinator = new ContractTestingCoordinator(
      this.eventBus,
      this.memory,
      this.agentCoordinator,
      this.pluginConfig.coordinator
    );

    // Initialize coordinator
    await this.coordinator.initialize();

    // Update health status
    this.updateHealth({
      status: 'healthy',
      agents: { total: 0, active: 0, idle: 0, failed: 0 },
      lastActivity: new Date(),
      errors: [],
    });
  }

  protected async onDispose(): Promise<void> {
    if (this.coordinator) {
      await this.coordinator.dispose();
    }

    this.coordinator = null;
    this.contractValidator = null;
    this.apiCompatibility = null;
    this.schemaValidator = null;
  }

  protected subscribeToEvents(): void {
    // Subscribe to code change events for contract impact analysis
    this.eventBus.subscribe(
      'code-intelligence.ImpactAnalysisCompleted',
      this.handleImpactAnalysis.bind(this)
    );

    // Subscribe to quality gate events
    this.eventBus.subscribe(
      'quality-assessment.QualityGateEvaluated',
      this.handleQualityGate.bind(this)
    );

    // Subscribe to release events
    this.eventBus.subscribe(
      'release.PreReleaseStarted',
      this.handlePreRelease.bind(this)
    );
  }

  protected async onEvent(event: DomainEvent): Promise<void> {
    // Track activity
    this.updateHealth({
      lastActivity: new Date(),
    });

    // Route to appropriate handler based on event type
    switch (event.type) {
      case 'code-intelligence.ImpactAnalysisCompleted':
        await this.handleImpactAnalysis(event);
        break;
      case 'quality-assessment.QualityGateEvaluated':
        await this.handleQualityGate(event);
        break;
      default:
        // No specific handling needed
        break;
    }
  }

  // ============================================================================
  // API Implementation - Contract Management
  // ============================================================================

  private async registerContract(contract: ApiContract): Promise<Result<string>> {
    this.ensureInitialized();
    try {
      const result = await this.coordinator!.registerContract(contract);
      if (result.success) {
        this.trackSuccessfulOperation('register');
      } else {
        this.trackFailedOperation(new Error(result.error.message));
      }
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async verifyAllConsumers(
    providerName: string,
    providerUrl: string
  ): Promise<Result<ProviderVerificationReport>> {
    this.ensureInitialized();
    try {
      const result = await this.coordinator!.verifyAllConsumers(providerName, providerUrl);
      if (result.success) {
        this.trackSuccessfulOperation('verify');
      } else {
        this.trackFailedOperation(new Error(result.error.message));
      }
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async preReleaseCheck(
    providerName: string,
    newContractPath: FilePath
  ): Promise<Result<PreReleaseReport>> {
    this.ensureInitialized();
    try {
      return await this.coordinator!.preReleaseCheck(providerName, newContractPath);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async importFromOpenAPI(specPath: FilePath): Promise<Result<ApiContract>> {
    this.ensureInitialized();
    try {
      return await this.coordinator!.importFromOpenAPI(specPath);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async exportToOpenAPI(contractId: string): Promise<Result<string>> {
    this.ensureInitialized();
    try {
      return await this.coordinator!.exportToOpenAPI(contractId);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // API Implementation - Contract Validation
  // ============================================================================

  private async validateContract(contract: ApiContract): Promise<Result<ValidationReport>> {
    this.ensureInitialized();
    try {
      return await this.contractValidator!.validateContract(contract);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async validateRequest(
    request: unknown,
    schema: SchemaDefinition
  ): Promise<Result<SchemaValidationResult>> {
    this.ensureInitialized();
    try {
      return await this.contractValidator!.validateRequest(request, schema);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async validateResponse(
    response: unknown,
    schema: SchemaDefinition
  ): Promise<Result<SchemaValidationResult>> {
    this.ensureInitialized();
    try {
      return await this.contractValidator!.validateResponse(response, schema);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async validateOpenAPI(spec: string): Promise<Result<OpenAPIValidationResult>> {
    this.ensureInitialized();
    try {
      return await this.contractValidator!.validateOpenAPI(spec);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // API Implementation - API Compatibility
  // ============================================================================

  private async compareVersions(
    oldContract: ApiContract,
    newContract: ApiContract
  ): Promise<Result<CompatibilityReport>> {
    this.ensureInitialized();
    try {
      return await this.apiCompatibility!.compareVersions(oldContract, newContract);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async isBackwardCompatible(
    oldContract: ApiContract,
    newContract: ApiContract
  ): Promise<Result<boolean>> {
    this.ensureInitialized();
    try {
      return await this.apiCompatibility!.isBackwardCompatible(oldContract, newContract);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async getBreakingChanges(
    oldContract: ApiContract,
    newContract: ApiContract
  ): Promise<Result<BreakingChange[]>> {
    this.ensureInitialized();
    try {
      return await this.apiCompatibility!.getBreakingChanges(oldContract, newContract);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async generateMigrationGuide(
    breakingChanges: BreakingChange[]
  ): Promise<Result<MigrationGuide>> {
    this.ensureInitialized();
    try {
      return await this.apiCompatibility!.generateMigrationGuide(breakingChanges);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // API Implementation - Schema Validation
  // ============================================================================

  private async validateJsonSchema(
    data: unknown,
    schema: object
  ): Promise<Result<SchemaValidationResult>> {
    this.ensureInitialized();
    try {
      return await this.schemaValidator!.validateJsonSchema(data, schema);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async validateGraphQLSchema(
    schema: string
  ): Promise<Result<GraphQLValidationResult>> {
    this.ensureInitialized();
    try {
      return await this.schemaValidator!.validateGraphQLSchema(schema);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async compareSchemas(
    oldSchema: SchemaDefinition,
    newSchema: SchemaDefinition
  ): Promise<Result<SchemaComparisonResult>> {
    this.ensureInitialized();
    try {
      return await this.schemaValidator!.compareSchemas(oldSchema, newSchema);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async inferSchema(samples: unknown[]): Promise<Result<SchemaDefinition>> {
    this.ensureInitialized();
    try {
      return await this.schemaValidator!.inferSchema(samples);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private async handleImpactAnalysis(event: DomainEvent): Promise<void> {
    // Impact analysis completed - check if contracts are affected
    const payload = event.payload as {
      analysisId: string;
      changedFiles: string[];
      impactedFiles: string[];
    };

    // Check if any API files were changed
    const apiFiles = payload.changedFiles.filter(
      (f) => f.includes('/api/') || f.includes('/routes/') || f.includes('controller')
    );

    if (apiFiles.length > 0) {
      // Store for potential contract verification
      await this.memory.set(
        `contract-testing:pending-impact:${payload.analysisId}`,
        payload,
        { namespace: 'contract-testing', ttl: 3600 } // 1 hour
      );
    }
  }

  private async handleQualityGate(event: DomainEvent): Promise<void> {
    // Quality gate evaluated - check if contract testing was included
    const payload = event.payload as {
      gateId: string;
      passed: boolean;
      checks: Array<{ name: string; passed: boolean }>;
    };

    const contractCheck = payload.checks.find((c) => c.name === 'contract-testing');
    if (!contractCheck) {
      // Contract testing was not included in quality gate
      // Could add warning to memory
      await this.memory.set(
        `contract-testing:quality-gate-warning:${payload.gateId}`,
        { warning: 'Contract testing not included in quality gate', timestamp: new Date().toISOString() },
        { namespace: 'contract-testing', ttl: 86400 }
      );
    }
  }

  private async handlePreRelease(event: DomainEvent): Promise<void> {
    // Pre-release started - trigger automatic contract verification
    const payload = event.payload as {
      providerName?: string;
      serviceName?: string;
      version?: string;
      providerUrl?: string;
      contractPath?: string;
    };

    // Extract provider name from payload (support multiple field names)
    const providerName = payload.providerName || payload.serviceName;
    if (!providerName) {
      // Cannot verify without provider name - store warning for review
      await this.memory.set(
        `contract-testing:pre-release-warning:${event.id}`,
        {
          warning: 'Pre-release event received without provider/service name',
          eventId: event.id,
          timestamp: new Date().toISOString(),
        },
        { namespace: 'contract-testing', ttl: 86400 }
      );
      return;
    }

    // Store pre-release verification request
    const verificationKey = `contract-testing:pre-release:${event.id}`;
    await this.memory.set(
      verificationKey,
      {
        providerName,
        version: payload.version,
        status: 'pending',
        startedAt: new Date().toISOString(),
      },
      { namespace: 'contract-testing', ttl: 3600 }
    );

    // If contract path provided, run pre-release check for breaking changes
    if (payload.contractPath) {
      try {
        const contractPath = FilePath.create(payload.contractPath);
        const preReleaseResult = await this.preReleaseCheck(providerName, contractPath);

        if (preReleaseResult.success) {
          const report = preReleaseResult.value;
          await this.memory.set(
            verificationKey,
            {
              providerName,
              version: payload.version,
              status: report.canRelease ? 'passed' : 'failed',
              completedAt: new Date().toISOString(),
              breakingChanges: report.breakingChanges.length,
              affectedConsumers: report.affectedConsumers.length,
              recommendations: report.recommendations,
            },
            { namespace: 'contract-testing', ttl: 86400 }
          );

          // Publish verification result event
          this.eventBus.publish({
            id: `${event.id}-result`,
            type: 'contract-testing.PreReleaseVerificationCompleted',
            source: 'contract-testing',
            timestamp: new Date(),
            payload: {
              providerName,
              version: payload.version,
              canRelease: report.canRelease,
              breakingChanges: report.breakingChanges.length,
              affectedConsumers: report.affectedConsumers.map((c) => c.name),
            },
          });
        }
      } catch (error) {
        // Store error but don't throw - event handlers should be resilient
        await this.memory.set(
          verificationKey,
          {
            providerName,
            version: payload.version,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
            completedAt: new Date().toISOString(),
          },
          { namespace: 'contract-testing', ttl: 86400 }
        );
      }
    }

    // If provider URL provided, verify all consumer contracts
    if (payload.providerUrl) {
      try {
        const verificationResult = await this.verifyAllConsumers(providerName, payload.providerUrl);

        if (verificationResult.success) {
          const report = verificationResult.value;
          await this.memory.set(
            `${verificationKey}:verification`,
            {
              providerName,
              version: payload.version,
              status: report.canDeploy ? 'passed' : 'failed',
              completedAt: new Date().toISOString(),
              totalConsumers: report.totalConsumers,
              passedConsumers: report.passedConsumers,
              failedConsumers: report.failedConsumers,
            },
            { namespace: 'contract-testing', ttl: 86400 }
          );

          // Publish consumer verification result event
          this.eventBus.publish({
            id: `${event.id}-consumer-result`,
            type: 'contract-testing.ConsumerVerificationCompleted',
            source: 'contract-testing',
            timestamp: new Date(),
            payload: {
              providerName,
              version: payload.version,
              canDeploy: report.canDeploy,
              totalConsumers: report.totalConsumers,
              passedConsumers: report.passedConsumers,
              failedConsumers: report.failedConsumers,
            },
          });
        }
      } catch (error) {
        // Store error but don't throw
        await this.memory.set(
          `${verificationKey}:verification`,
          {
            providerName,
            version: payload.version,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
            completedAt: new Date().toISOString(),
          },
          { namespace: 'contract-testing', ttl: 86400 }
        );
      }
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('ContractTestingPlugin is not initialized');
    }

    if (!this.coordinator || !this.contractValidator || !this.apiCompatibility || !this.schemaValidator) {
      throw new Error('ContractTestingPlugin services are not available');
    }
  }

  private handleError<T>(error: unknown): Result<T, Error> {
    const err = error instanceof Error ? error : new Error(String(error));

    // Track error
    const currentHealth = this.getHealth();
    this.updateHealth({
      errors: [...currentHealth.errors.slice(-9), err.message],
      status: currentHealth.errors.length >= 5 ? 'degraded' : currentHealth.status,
    });

    return { success: false, error: err };
  }

  private trackSuccessfulOperation(_operation: string): void {
    const health = this.getHealth();
    this.updateHealth({
      agents: {
        ...health.agents,
        total: health.agents.total + 1,
        idle: health.agents.idle + 1,
      },
      lastActivity: new Date(),
    });
  }

  private trackFailedOperation(error: Error): void {
    const health = this.getHealth();
    this.updateHealth({
      agents: {
        ...health.agents,
        failed: health.agents.failed + 1,
      },
      errors: [...health.errors.slice(-9), error.message],
    });
  }
}

/**
 * Factory function to create a ContractTestingPlugin
 */
export function createContractTestingPlugin(
  eventBus: EventBus,
  memory: MemoryBackend,
  agentCoordinator: AgentCoordinator,
  config?: ContractTestingPluginConfig
): ContractTestingPlugin {
  return new ContractTestingPlugin(eventBus, memory, agentCoordinator, config);
}
