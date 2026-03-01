/**
 * Agentic QE v3 - Contract Testing Coordinator
 * Orchestrates the contract testing workflow across services
 *
 * CQ-002: Extends BaseDomainCoordinator for lifecycle deduplication
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err, DomainEvent, type DomainName } from '../../shared/types/index.js';
import { toError, toErrorMessage } from '../../shared/error-utils.js';
import { FilePath, Version } from '../../shared/value-objects/index.js';
import { HttpClient, createHttpClient } from '../../shared/http/index.js';
import { FileReader } from '../../shared/io/index.js';
import type {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
  AgentSpawnConfig,
} from '../../kernel/interfaces.js';
import { createEvent } from '../../shared/events/domain-events.js';
import type {
  IContractTestingCoordinator,
  ApiContract,
  VerificationResult,
  ProviderVerificationReport,
  PreReleaseReport,
  BreakingChange,
  AffectedConsumer,
  ContractEndpoint,
  SchemaDefinition,
  HttpMethod,
  ContractType,
  FailureType,
  ContractPrioritizationContext,
  ContractPrioritizationResult,
} from './interfaces.js';
import { ContractValidatorService } from './services/contract-validator.js';
import { ApiCompatibilityService } from './services/api-compatibility.js';
import { SARSAAlgorithm } from '../../integrations/rl-suite/algorithms/sarsa.js';
import { PersistentSONAEngine, createPersistentSONAEngine } from '../../integrations/ruvector/sona-persistence.js';
import type { RLState, RLAction } from '../../integrations/rl-suite/interfaces.js';

import type { QueenMinCutBridge } from '../../coordination/mincut/queen-integration.js';

import {
  type DomainFinding,
  createDomainFinding,
} from '../../coordination/consensus/domain-findings.js';

// CQ-002: Base domain coordinator
import {
  BaseDomainCoordinator,
  type BaseDomainCoordinatorConfig,
  type BaseWorkflowStatus,
} from '../base-domain-coordinator.js';
import { safeJsonParse } from '../../shared/safe-json.js';

/**
 * Contract Testing Events
 */
export const ContractTestingEvents = {
  ContractVerified: 'contract-testing.ContractVerified',
  BreakingChangeDetected: 'contract-testing.BreakingChangeDetected',
  ContractPublished: 'contract-testing.ContractPublished',
  ConsumerContractCreated: 'contract-testing.ConsumerContractCreated',
  VerificationFailed: 'contract-testing.VerificationFailed',
} as const;

/**
 * Workflow status tracking
 */
export interface WorkflowStatus {
  id: string;
  type: 'verify' | 'compare' | 'import' | 'export';
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  agentIds: string[];
  progress: number;
  error?: string;
}

/**
 * Coordinator configuration
 */
export interface CoordinatorConfig extends BaseDomainCoordinatorConfig {
  enableAutoVerification: boolean;
  enableSARSA: boolean;
  enableQESONA: boolean;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkflows: 5,
  defaultTimeout: 60000, // 60 seconds
  enableAutoVerification: true,
  publishEvents: true,
  enableSARSA: true,
  enableQESONA: true,
  // MinCut integration defaults (ADR-047)
  enableMinCutAwareness: true,
  topologyHealthThreshold: 0.5,
  pauseOnCriticalTopology: false,
  // Consensus integration defaults (MM-001)
  enableConsensus: true,
  consensusThreshold: 0.7,
  consensusStrategy: 'weighted',
  consensusMinModels: 2,
};

type ContractWorkflowType = 'verify' | 'compare' | 'import' | 'export';

/**
 * Contract Testing Coordinator
 * Orchestrates contract testing workflows and coordinates with agents
 *
 * CQ-002: Extends BaseDomainCoordinator
 */
export class ContractTestingCoordinator
  extends BaseDomainCoordinator<CoordinatorConfig, ContractWorkflowType>
  implements IContractTestingCoordinator
{
  private readonly contractValidator: ContractValidatorService;
  private readonly apiCompatibility: ApiCompatibilityService;
  private readonly httpClient: HttpClient;
  private readonly fileReader: FileReader;
  // SchemaValidatorService reserved for future use
  private readonly contractStore: Map<string, ApiContract> = new Map();

  // RL Integration: SARSA for contract validation ordering
  private sarsaAlgorithm?: SARSAAlgorithm;

  // SONA Integration: PersistentSONAEngine for contract pattern learning (patterns survive restarts)
  private qesona?: PersistentSONAEngine;

  constructor(
    eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<CoordinatorConfig> = {}
  ) {
    const fullConfig: CoordinatorConfig = { ...DEFAULT_CONFIG, ...config };

    super(eventBus, 'contract-testing', fullConfig, {
      verifyFindingTypes: ['contract-violation', 'breaking-change', 'schema-incompatibility'],
    });

    this.contractValidator = new ContractValidatorService({ memory });
    this.apiCompatibility = new ApiCompatibilityService(memory);
    this.httpClient = createHttpClient();
    this.fileReader = new FileReader();
    // Note: schemaValidator initialized when needed for schema operations
  }

  // ==========================================================================
  // BaseDomainCoordinator Template Methods
  // ==========================================================================

  protected async onInitialize(): Promise<void> {
    // Initialize SARSA algorithm if enabled
    if (this.config.enableSARSA) {
      try {
        this.sarsaAlgorithm = new SARSAAlgorithm({
          stateSize: 10,
          actionSize: 4,
          hiddenLayers: [64, 64],
        });
        // First call to predict will initialize the algorithm
        console.log('[contract-testing] SARSA algorithm created successfully');
      } catch (error) {
        console.error('[contract-testing] Failed to create SARSA:', error);
        throw new Error(`SARSA creation failed: ${toErrorMessage(error)}`);
      }
    }

    // Initialize PersistentSONAEngine if enabled (patterns survive restarts)
    if (this.config.enableQESONA) {
      try {
        this.qesona = await createPersistentSONAEngine({
          domain: 'contract-testing',
          loadOnInit: true,
          autoSaveInterval: 60000, // Save every minute
          maxPatterns: 5000,
          minConfidence: 0.6,
        });
        console.log('[contract-testing] PersistentSONAEngine initialized successfully');
      } catch (error) {
        // Log and continue - SONA is enhancement, not critical
        console.error('[contract-testing] Failed to initialize PersistentSONAEngine:', error);
        console.warn('[contract-testing] Continuing without SONA pattern persistence');
        this.qesona = undefined;
      }
    }

    // Subscribe to relevant events
    this.subscribeToEvents();

    // Load any persisted contracts
    await this.loadContracts();
  }

  protected async onDispose(): Promise<void> {
    // Save workflow state
    await this.saveContracts();

    // Dispose PersistentSONAEngine (flushes pending saves)
    if (this.qesona) {
      await this.qesona.close();
      this.qesona = undefined;
    }

    // Clear SARSA (no explicit dispose method exists)
    this.sarsaAlgorithm = undefined;

    // Clear contract store
    this.contractStore.clear();
  }

  protected subscribeToEvents(): void {
    // Subscribe to code change events for auto-verification
    this.eventBus.subscribe(
      'code-intelligence.ImpactAnalysisCompleted',
      this.handleImpactAnalysis.bind(this)
    );
  }

  // ==========================================================================
  // Workflow status (typed override)
  // ==========================================================================

  override getActiveWorkflows(): WorkflowStatus[] {
    return super.getActiveWorkflows() as WorkflowStatus[];
  }

  // ============================================================================
  // IContractTestingCoordinator Implementation
  // ============================================================================

  /**
   * Register new contract
   */
  async registerContract(contract: ApiContract): Promise<Result<string>> {
    try {
      // Validate the contract first
      const validationResult = await this.contractValidator.validateContract(contract);
      if (!validationResult.success) {
        return validationResult;
      }

      if (!validationResult.value.isValid) {
        const errors = validationResult.value.errors.map((e) => e.message).join('; ');
        return err(new Error(`Contract validation failed: ${errors}`));
      }

      // Store the contract
      this.contractStore.set(contract.id, contract);

      // Persist to memory
      await this.memory.set(`contract-testing:contract:${contract.id}`, contract, {
        namespace: 'contract-testing',
        persist: true,
      });

      // Publish event
      if (this.config.publishEvents) {
        await this.publishContractRegistered(contract);
      }

      return ok(contract.id);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Verify all consumer contracts for provider
   */
  async verifyAllConsumers(
    providerName: string,
    providerUrl: string
  ): Promise<Result<ProviderVerificationReport>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'verify');

      // ADR-047: Check topology health before expensive operations
      if (this.config.enableMinCutAwareness && !this.isTopologyHealthy()) {
        console.warn(`[${this.domainName}] Topology degraded, using conservative verification strategy`);
        // Continue with reduced parallelism when topology is unhealthy
      }

      // ADR-047: Check if operations should be paused due to critical topology
      if (this.minCutMixin.shouldPauseOperations()) {
        return err(new Error('Contract verification paused: topology is in critical state'));
      }

      // Find all contracts for this provider
      let contracts = await this.findContractsByProvider(providerName);
      if (contracts.length === 0) {
        this.completeWorkflow(workflowId);
        return ok({
          provider: providerName,
          totalConsumers: 0,
          passedConsumers: 0,
          failedConsumers: [],
          results: [],
          canDeploy: true,
        });
      }

      // ================================================================
      // SARSA Integration: Prioritize contracts before verification
      // ================================================================
      if (this.config.enableSARSA && contracts.length > 1) {
        const prioritizationContext: ContractPrioritizationContext = {
          urgency: 5, // Default medium urgency
          providerLoad: 50, // Assume moderate load
          consumerCount: contracts.reduce((sum, c) => sum + c.consumers.length, 0),
        };

        const prioritizationResult = await this.prioritizeContracts(contracts, prioritizationContext);
        if (prioritizationResult.success) {
          contracts = prioritizationResult.value.orderedContracts;
          console.log(
            `[contract-testing] Using ${prioritizationResult.value.strategy} strategy for contract verification order (confidence: ${prioritizationResult.value.confidence.toFixed(2)})`
          );
        }
      }

      // Spawn verification agent
      const agentResult = await this.spawnVerificationAgent(workflowId, providerName);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return agentResult;
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);

      const results: VerificationResult[] = [];
      const failedConsumers: string[] = [];

      // Verify each contract in SARSA-optimized order
      for (const contract of contracts) {
        for (const consumer of contract.consumers) {
          const result = await this.verifyConsumerContract(contract, consumer.name, providerUrl);
          results.push(result);

          if (!result.passed) {
            failedConsumers.push(consumer.name);

            // Publish failure event
            if (this.config.publishEvents) {
              await this.publishVerificationFailed(contract, consumer.name, result);
            }
          } else {
            // Publish success event
            if (this.config.publishEvents) {
              await this.publishContractVerified(contract, consumer.name, result);
            }
          }
        }

        this.updateWorkflowProgress(workflowId, (results.length / contracts.length) * 100);
      }

      // Stop the agent
      await this.agentCoordinator.stop(agentResult.value);

      this.completeWorkflow(workflowId);

      const uniqueFailedConsumers = Array.from(new Set(failedConsumers));
      const passedConsumers = contracts.flatMap((c) => c.consumers.map((cs) => cs.name))
        .filter((c) => !uniqueFailedConsumers.includes(c)).length;

      return ok({
        provider: providerName,
        totalConsumers: contracts.reduce((sum, c) => sum + c.consumers.length, 0),
        passedConsumers,
        failedConsumers: uniqueFailedConsumers,
        results,
        canDeploy: uniqueFailedConsumers.length === 0,
      });
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  /**
   * Check for breaking changes before release
   */
  async preReleaseCheck(
    providerName: string,
    newContractPath: FilePath
  ): Promise<Result<PreReleaseReport>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'compare');

      // ADR-047: Check topology health before expensive operations
      if (this.config.enableMinCutAwareness && !this.isTopologyHealthy()) {
        console.warn(`[${this.domainName}] Topology degraded, using conservative pre-release check`);
      }

      // ADR-047: Check if operations should be paused due to critical topology
      if (this.minCutMixin.shouldPauseOperations()) {
        return err(new Error('Pre-release check paused: topology is in critical state'));
      }

      // Load new contract from path using FileReader
      const newContract = await this.loadContractFromPath(newContractPath);
      if (!newContract) {
        this.failWorkflow(workflowId, 'Failed to load contract from path');
        return err(new Error('Failed to load contract from path'));
      }

      // Find current contract
      const currentContracts = await this.findContractsByProvider(providerName);
      const currentContract = currentContracts.length > 0 ? currentContracts[0] : null;

      if (!currentContract) {
        // No existing contract - all changes are non-breaking
        this.completeWorkflow(workflowId);
        return ok({
          breakingChanges: [],
          affectedConsumers: [],
          canRelease: true,
          recommendations: ['No existing contract found. This will be the first version.'],
        });
      }

      // Compare contracts
      const comparisonResult = await this.apiCompatibility.compareVersions(
        currentContract,
        newContract
      );

      if (!comparisonResult.success) {
        this.failWorkflow(workflowId, comparisonResult.error.message);
        return comparisonResult;
      }

      const { breakingChanges, deprecations } = comparisonResult.value;

      // Determine affected consumers
      const affectedConsumers: AffectedConsumer[] = [];
      for (const consumer of currentContract.consumers) {
        const consumerBreakingChanges = breakingChanges.filter((bc) =>
          bc.affectedConsumers.includes(consumer.name)
        );

        if (consumerBreakingChanges.length > 0) {
          affectedConsumers.push({
            name: consumer.name,
            team: consumer.team,
            breakingChanges: consumerBreakingChanges,
            notified: false,
          });
        }
      }

      // Generate recommendations
      const recommendations: string[] = [];
      if (breakingChanges.length > 0) {
        recommendations.push(`${breakingChanges.length} breaking changes detected. Coordinate with affected consumers before release.`);

        // Generate migration guide
        const migrationResult = await this.apiCompatibility.generateMigrationGuide(breakingChanges);
        if (migrationResult.success) {
          recommendations.push(`Migration effort estimated as: ${migrationResult.value.estimatedEffort}`);
        }
      }

      if (deprecations.length > 0) {
        recommendations.push(`${deprecations.length} deprecations detected. Consider communicating removal timeline.`);
      }

      if (breakingChanges.length === 0 && deprecations.length === 0) {
        recommendations.push('No breaking changes detected. Safe to release.');
      }

      // Publish breaking change event if any
      if (this.config.publishEvents && breakingChanges.length > 0) {
        await this.publishBreakingChangeDetected(
          newContract.id,
          breakingChanges,
          affectedConsumers.map((c) => c.name)
        );
      }

      this.completeWorkflow(workflowId);

      return ok({
        breakingChanges,
        affectedConsumers,
        canRelease: breakingChanges.length === 0,
        recommendations,
      });
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  /**
   * Generate contract from OpenAPI spec
   */
  async importFromOpenAPI(specPath: FilePath): Promise<Result<ApiContract>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'import');

      // Load and validate OpenAPI spec using FileReader
      const specContent = await this.loadFileContent(specPath);
      if (!specContent) {
        this.failWorkflow(workflowId, 'Failed to load OpenAPI spec');
        return err(new Error('Failed to load OpenAPI spec'));
      }

      // Validate the OpenAPI spec
      const validationResult = await this.contractValidator.validateOpenAPI(specContent);
      if (!validationResult.success) {
        this.failWorkflow(workflowId, validationResult.error.message);
        return validationResult;
      }

      if (!validationResult.value.isValid) {
        const errors = validationResult.value.errors.map((e) => e.message).join('; ');
        this.failWorkflow(workflowId, errors);
        return err(new Error(`Invalid OpenAPI spec: ${errors}`));
      }

      // Parse and convert to ApiContract
      const contract = this.parseOpenAPIToContract(specContent);

      // Store the contract
      this.contractStore.set(contract.id, contract);
      await this.memory.set(`contract-testing:contract:${contract.id}`, contract, {
        namespace: 'contract-testing',
        persist: true,
      });

      this.completeWorkflow(workflowId);

      return ok(contract);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  /**
   * Export contract to OpenAPI spec
   */
  async exportToOpenAPI(contractId: string): Promise<Result<string>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'export');

      // Find the contract
      const contract = this.contractStore.get(contractId);
      if (!contract) {
        this.failWorkflow(workflowId, 'Contract not found');
        return err(new Error(`Contract not found: ${contractId}`));
      }

      // Convert to OpenAPI
      const openAPISpec = this.contractToOpenAPI(contract);

      this.completeWorkflow(workflowId);

      return ok(openAPISpec);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async verifyConsumerContract(
    contract: ApiContract,
    consumerName: string,
    providerUrl: string
  ): Promise<VerificationResult> {
    const failures: VerificationResult['failures'] = [];
    const warnings: VerificationResult['warnings'] = [];

    // Skip real HTTP for non-HTTP URLs (test mode)
    const isRealUrl =
      providerUrl.startsWith('http://') || providerUrl.startsWith('https://');

    for (const endpoint of contract.endpoints) {
      const endpointUrl = `${providerUrl}${endpoint.path}`;
      const endpointKey = `${endpoint.method} ${endpoint.path}`;

      if (isRealUrl) {
        // Make actual HTTP request to verify endpoint
        try {
          const verifyResult = await this.verifyEndpoint(
            endpointUrl,
            endpoint.method,
            endpoint
          );

          if (!verifyResult.success) {
            failures.push({
              endpoint: endpointKey,
              type: verifyResult.errorType as FailureType,
              expected: verifyResult.expected,
              actual: verifyResult.actual,
              message: verifyResult.message,
            });
          } else if (verifyResult.warning) {
            warnings.push({
              endpoint: endpointKey,
              message: verifyResult.warning,
              severity: 'low',
            });
          }
        } catch (error) {
          failures.push({
            endpoint: endpointKey,
            type: 'connection-error',
            expected: 'reachable',
            actual: 'error',
            message: `Failed to verify endpoint: ${toErrorMessage(error)}`,
          });
        }
      } else {
        // Simulation mode for non-HTTP URLs (testing)
        // Endpoint is considered valid if URL is non-empty
        if (!providerUrl) {
          failures.push({
            endpoint: endpointKey,
            type: 'connection-error',
            expected: 'reachable',
            actual: 'unreachable',
            message: `Endpoint ${endpointKey} is not reachable (no provider URL)`,
          });
        }
      }
    }

    return {
      contractId: contract.id,
      provider: contract.provider.name,
      consumer: consumerName,
      passed: failures.length === 0,
      failures,
      warnings,
      timestamp: new Date(),
    };
  }

  private async verifyEndpoint(
    url: string,
    method: HttpMethod,
    endpoint: ContractEndpoint
  ): Promise<{
    success: boolean;
    errorType: string;
    expected: string;
    actual: string;
    message: string;
    warning?: string;
  }> {
    const timeout = 10000;
    const requestOptions = { timeout, retries: 1, circuitBreaker: false };

    let result;
    switch (method) {
      case 'GET':
      case 'HEAD':
        result = await this.httpClient.get(url, requestOptions);
        break;
      case 'POST':
        result = await this.httpClient.post(url, {}, requestOptions);
        break;
      case 'PUT':
        result = await this.httpClient.put(url, {}, requestOptions);
        break;
      case 'PATCH':
        result = await this.httpClient.patch(url, {}, requestOptions);
        break;
      case 'DELETE':
        result = await this.httpClient.delete(url, requestOptions);
        break;
      case 'OPTIONS':
        result = await this.httpClient.get(url, requestOptions);
        break;
      default:
        result = await this.httpClient.get(url, requestOptions);
    }

    if (!result.success) {
      return {
        success: false,
        errorType: 'connection-error',
        expected: 'successful response',
        actual: `error: ${result.error.message}`,
        message: `Endpoint unreachable: ${result.error.message}`,
      };
    }

    const response = result.value;

    // Verify response status matches expected - use examples for expected status codes
    if (endpoint.examples && endpoint.examples.length > 0) {
      const expectedStatuses = endpoint.examples.map((e) => e.statusCode);
      if (!expectedStatuses.includes(response.status)) {
        return {
          success: false,
          errorType: 'status-mismatch',
          expected: expectedStatuses.join(' or '),
          actual: String(response.status),
          message: `Expected status ${expectedStatuses.join('/')} but got ${response.status}`,
        };
      }
    }

    // Check for deprecation warnings
    let warning: string | undefined;
    const deprecationHeader = response.headers.get('Deprecation');
    if (deprecationHeader) {
      warning = `Endpoint is deprecated: ${deprecationHeader}`;
    }

    return {
      success: true,
      errorType: '',
      expected: '',
      actual: '',
      message: 'Endpoint verified successfully',
      warning,
    };
  }

  private async findContractsByProvider(providerName: string): Promise<ApiContract[]> {
    const contracts: ApiContract[] = [];

    const contractValues = Array.from(this.contractStore.values());
    for (const contract of contractValues) {
      if (contract.provider.name === providerName) {
        contracts.push(contract);
      }
    }

    // Also search in memory
    const keys = await this.memory.search(`contract-testing:contract:*`, 100);
    for (const key of keys) {
      const stored = await this.memory.get<ApiContract>(key);
      if (stored && stored.provider.name === providerName) {
        if (!this.contractStore.has(stored.id)) {
          contracts.push(stored);
        }
      }
    }

    return contracts;
  }

  private async loadContractFromPath(path: FilePath): Promise<ApiContract | null> {
    // Read contract file from path using FileReader
    const content = await this.loadFileContent(path);
    if (!content) {
      return null;
    }

    try {
      // Determine file type and parse accordingly
      const filePath = path.value.toLowerCase();

      if (filePath.endsWith('.json')) {
        // Parse as JSON contract or OpenAPI spec
        const parsed = safeJsonParse(content);

        // Check if it's an OpenAPI spec
        if (parsed.openapi || parsed.swagger) {
          return this.parseOpenAPIToContract(content);
        }

        // Assume it's a direct contract format
        return parsed as ApiContract;
      } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        // YAML support would require a YAML parser
        // For now, log a warning and return null
        console.warn('YAML contract files not yet supported:', path.value);
        return null;
      }

      // Try parsing as JSON anyway
      return safeJsonParse(content) as ApiContract;
    } catch (error) {
      console.error(
        `Failed to parse contract from ${path.value}:`,
        toErrorMessage(error)
      );
      return null;
    }
  }

  private async loadFileContent(path: FilePath): Promise<string | null> {
    // Read file content using FileReader
    const result = await this.fileReader.readFile(path.value);

    if (!result.success) {
      console.error(`Failed to read file ${path.value}:`, result.error);
      return null;
    }

    return result.value;
  }

  private parseOpenAPIToContract(specContent: string): ApiContract {
    const spec = safeJsonParse(specContent) as Record<string, unknown>;
    const info = (spec.info || {}) as Record<string, unknown>;
    const paths = (spec.paths || {}) as Record<string, Record<string, unknown>>;

    const endpoints: ContractEndpoint[] = [];
    const schemas: SchemaDefinition[] = [];

    // Extract endpoints
    for (const [path, methods] of Object.entries(paths)) {
      const httpMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
      for (const method of httpMethods) {
        const operation = methods[method.toLowerCase()] as Record<string, unknown> | undefined;
        if (operation) {
          endpoints.push({
            path,
            method,
            requestSchema: this.extractRequestSchema(operation),
            responseSchema: this.extractResponseSchema(operation),
            headers: {},
            examples: [],
          });
        }
      }
    }

    // Extract schemas
    const components = (spec.components || {}) as Record<string, unknown>;
    const schemasDef = (components.schemas || {}) as Record<string, unknown>;
    for (const [name, schemaDef] of Object.entries(schemasDef)) {
      schemas.push({
        id: name,
        name,
        type: 'openapi',
        content: JSON.stringify(schemaDef),
      });
    }

    return {
      id: uuidv4(),
      name: (info.title as string) || 'Imported Contract',
      version: Version.parse((info.version as string) || '1.0.0'),
      type: 'rest' as ContractType,
      provider: {
        name: (info.title as string) || 'Unknown Provider',
        version: (info.version as string) || '1.0.0',
      },
      consumers: [],
      endpoints,
      schemas,
    };
  }

  private extractRequestSchema(operation: Record<string, unknown>): string | undefined {
    const requestBody = operation.requestBody as Record<string, unknown> | undefined;
    if (requestBody) {
      const content = requestBody.content as Record<string, unknown> | undefined;
      if (content) {
        const jsonContent = content['application/json'] as Record<string, unknown> | undefined;
        if (jsonContent?.schema) {
          const ref = (jsonContent.schema as Record<string, unknown>).$ref as string | undefined;
          if (ref) {
            return ref.split('/').pop();
          }
        }
      }
    }
    return undefined;
  }

  private extractResponseSchema(operation: Record<string, unknown>): string | undefined {
    const responses = operation.responses as Record<string, unknown> | undefined;
    if (responses) {
      const successResponse = (responses['200'] || responses['201']) as Record<string, unknown> | undefined;
      if (successResponse) {
        const content = successResponse.content as Record<string, unknown> | undefined;
        if (content) {
          const jsonContent = content['application/json'] as Record<string, unknown> | undefined;
          if (jsonContent?.schema) {
            const ref = (jsonContent.schema as Record<string, unknown>).$ref as string | undefined;
            if (ref) {
              return ref.split('/').pop();
            }
          }
        }
      }
    }
    return undefined;
  }

  private contractToOpenAPI(contract: ApiContract): string {
    const paths: Record<string, Record<string, unknown>> = {};

    for (const endpoint of contract.endpoints) {
      if (!paths[endpoint.path]) {
        paths[endpoint.path] = {};
      }

      const operation: Record<string, unknown> = {
        summary: `${endpoint.method} ${endpoint.path}`,
        responses: {
          '200': {
            description: 'Success',
            content: endpoint.responseSchema
              ? {
                  'application/json': {
                    schema: { $ref: `#/components/schemas/${endpoint.responseSchema}` },
                  },
                }
              : undefined,
          },
        },
      };

      if (endpoint.requestSchema) {
        operation.requestBody = {
          content: {
            'application/json': {
              schema: { $ref: `#/components/schemas/${endpoint.requestSchema}` },
            },
          },
        };
      }

      paths[endpoint.path][endpoint.method.toLowerCase()] = operation;
    }

    const schemasObj: Record<string, unknown> = {};
    for (const schema of contract.schemas) {
      try {
        schemasObj[schema.id] = safeJsonParse(schema.content);
      } catch {
        schemasObj[schema.id] = { type: 'object' };
      }
    }

    const openAPISpec = {
      openapi: '3.0.3',
      info: {
        title: contract.name,
        version: contract.version.toString(),
      },
      paths,
      components: {
        schemas: schemasObj,
      },
    };

    return JSON.stringify(openAPISpec, null, 2);
  }

  // ============================================================================
  // Agent Spawning
  // ============================================================================

  private async spawnVerificationAgent(
    workflowId: string,
    providerName: string
  ): Promise<Result<string, Error>> {
    const config: AgentSpawnConfig = {
      name: `contract-verifier-${workflowId.slice(0, 8)}`,
      domain: 'contract-testing',
      type: 'validator',
      capabilities: ['contract-verification', 'http-testing'],
      config: {
        workflowId,
        providerName,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  // ============================================================================
  // Event Publishing
  // ============================================================================

  private async publishContractRegistered(contract: ApiContract): Promise<void> {
    const event = createEvent(ContractTestingEvents.ContractPublished, 'contract-testing', {
      contractId: contract.id,
      version: contract.version.toString(),
      provider: contract.provider.name,
    });

    await this.eventBus.publish(event);
  }

  private async publishContractVerified(
    contract: ApiContract,
    consumer: string,
    result: VerificationResult
  ): Promise<void> {
    const event = createEvent(ContractTestingEvents.ContractVerified, 'contract-testing', {
      contractId: contract.id,
      provider: contract.provider.name,
      consumer,
      passed: result.passed,
      failureCount: result.failures.length,
    });

    await this.eventBus.publish(event);
  }

  private async publishVerificationFailed(
    contract: ApiContract,
    consumer: string,
    result: VerificationResult
  ): Promise<void> {
    const event = createEvent(ContractTestingEvents.VerificationFailed, 'contract-testing', {
      contractId: contract.id,
      provider: contract.provider.name,
      consumer,
      failures: result.failures.map((f) => ({
        endpoint: f.endpoint,
        type: f.type,
        message: f.message,
      })),
    });

    await this.eventBus.publish(event);
  }

  private async publishBreakingChangeDetected(
    contractId: string,
    changes: BreakingChange[],
    affectedConsumers: string[]
  ): Promise<void> {
    const event = createEvent(ContractTestingEvents.BreakingChangeDetected, 'contract-testing', {
      contractId,
      changes,
      affectedConsumers,
    });

    await this.eventBus.publish(event);
  }

  // ============================================================================
  // SARSA Integration: Contract Validation Ordering
  // ============================================================================

  /**
   * Prioritize contracts for validation using SARSA
   * Uses learned patterns to determine optimal validation order
   */
  async prioritizeContracts(
    contracts: ApiContract[],
    context: ContractPrioritizationContext
  ): Promise<Result<ContractPrioritizationResult>> {
    if (!this.sarsaAlgorithm || !this.config.enableSARSA) {
      // Return contracts in default order if SARSA is disabled
      return ok({
        orderedContracts: contracts,
        strategy: 'default',
        confidence: 1.0,
      });
    }

    if (contracts.length === 0) {
      return ok({
        orderedContracts: [],
        strategy: 'empty',
        confidence: 1.0,
      });
    }

    try {
      // Create state from context
      const state: RLState = {
        id: `contract-priority-${Date.now()}`,
        features: [
          context.urgency / 10, // Normalize 0-1
          context.providerLoad / 100,
          context.consumerCount / 50,
          contracts.length / 100,
          contracts.filter((c) => c.version.major >= 2).length / Math.max(1, contracts.length),
          contracts.reduce((sum, c) => sum + c.endpoints.length, 0) / 1000,
          contracts.reduce((sum, c) => sum + c.consumers.length, 0) / 100,
          contracts.filter((c) => c.type === 'graphql').length / Math.max(1, contracts.length),
          contracts.filter((c) => c.type === 'rest').length / Math.max(1, contracts.length),
          contracts.filter((c) => c.schemas.length > 5).length / Math.max(1, contracts.length),
        ],
      };

      // Get SARSA prediction for ordering strategy
      const prediction = await this.sarsaAlgorithm.predict(state);

      // Apply the suggested ordering strategy
      let prioritized = [...contracts];
      let strategy = 'default';

      switch (prediction.action.type) {
        case 'sequence-early':
          // Prioritize high-risk contracts (newer versions, more endpoints)
          prioritized.sort((a, b) => {
            const scoreA = a.version.major * 10 + a.version.minor + a.endpoints.length * 0.1;
            const scoreB = b.version.major * 10 + b.version.minor + b.endpoints.length * 0.1;
            return scoreB - scoreA;
          });
          strategy = 'high-risk-first';
          break;

        case 'sequence-late':
          // Prioritize low-risk contracts (stable, fewer endpoints)
          prioritized.sort((a, b) => {
            const scoreA = a.version.major * 10 + a.version.minor + a.endpoints.length * 0.1;
            const scoreB = b.version.major * 10 + b.version.minor + b.endpoints.length * 0.1;
            return scoreA - scoreB;
          });
          strategy = 'low-risk-first';
          break;

        case 'predict-high':
          // Prioritize by consumer count (most used first)
          prioritized.sort((a, b) => b.consumers.length - a.consumers.length);
          strategy = 'high-consumer-first';
          break;

        default:
          strategy = 'default';
          break;
      }

      // Train SARSA with feedback (will be updated after verification)
      const reward = await this.calculateOrderingReward(prioritized, context);
      const action: RLAction = prediction.action;

      await this.sarsaAlgorithm.train({
        state,
        action,
        reward,
        nextState: state,
        done: true,
      });

      console.log(
        `[contract-testing] SARSA prioritized ${contracts.length} contracts using ${strategy} strategy (confidence: ${prediction.confidence.toFixed(2)})`
      );

      return ok({
        orderedContracts: prioritized,
        strategy,
        confidence: prediction.confidence,
      });
    } catch (error) {
      console.error('[contract-testing] SARSA prioritization failed:', error);
      // Return original contracts on error (graceful degradation)
      return ok({
        orderedContracts: contracts,
        strategy: 'fallback',
        confidence: 0.5,
      });
    }
  }

  /**
   * Calculate reward for contract ordering
   */
  private async calculateOrderingReward(
    contracts: ApiContract[],
    context: { urgency: number; providerLoad: number }
  ): Promise<number> {
    // Base reward
    let reward = 0.5;

    // Reward for prioritizing high-impact contracts
    const highImpact = contracts.slice(0, Math.ceil(contracts.length / 3));
    const avgConsumers = highImpact.reduce((sum, c) => sum + c.consumers.length, 0) / highImpact.length;
    reward += Math.min(0.3, avgConsumers / 50);

    // Reward for matching urgency
    if (context.urgency > 7) {
      const criticalCount = highImpact.filter((c) => c.version.major === 0).length;
      reward += Math.min(0.2, criticalCount / highImpact.length);
    }

    // Penalty for ordering under high load
    if (context.providerLoad > 80) {
      reward -= 0.1;
    }

    return Math.max(0, Math.min(1, reward));
  }

  // ============================================================================
  // QESONA Integration: Contract Pattern Learning
  // ============================================================================

  /**
   * Store contract validation pattern for learning
   */
  async storeContractPattern(
    contract: ApiContract,
    validationSuccess: boolean,
    quality: number
  ): Promise<void> {
    if (!this.qesona || !this.config.enableQESONA) {
      return;
    }

    try {
      const state: RLState = {
        id: `contract-${contract.id}`,
        features: [
          contract.version.major / 10,
          contract.version.minor / 10,
          contract.endpoints.length / 100,
          contract.consumers.length / 50,
          contract.schemas.length / 50,
          contract.type === 'rest' ? 1 : 0,
          contract.type === 'graphql' ? 1 : 0,
          contract.endpoints.filter((e) => e.method === 'GET').length / 100,
          contract.endpoints.filter((e) => e.method === 'POST').length / 100,
          contract.endpoints.filter((e) => e.responseSchema).length / 100,
        ],
      };

      const action: RLAction = {
        type: validationSuccess ? 'validate' : 'reject',
        value: quality,
      };

      this.qesona.createPattern(
        state,
        action,
        {
          reward: validationSuccess ? quality : -quality,
          success: validationSuccess,
          quality,
        },
        'test-generation',
        'contract-testing',
        {
          contractId: contract.id,
          provider: contract.provider.name,
          version: contract.version.toString(),
        }
      );

      console.log(`[contract-testing] Stored pattern for contract ${contract.id} (success: ${validationSuccess}, quality: ${quality.toFixed(2)})`);
    } catch (error) {
      console.error('[contract-testing] Failed to store contract pattern:', error);
    }
  }

  /**
   * Adapt contract validation strategies using learned patterns
   */
  async adaptContractPatterns(contract: ApiContract): Promise<{
    shouldValidate: boolean;
    confidence: number;
    strategy: string;
  }> {
    if (!this.qesona || !this.config.enableQESONA) {
      return {
        shouldValidate: true,
        confidence: 0.5,
        strategy: 'default',
      };
    }

    try {
      const state: RLState = {
        id: `contract-${contract.id}`,
        features: [
          contract.version.major / 10,
          contract.version.minor / 10,
          contract.endpoints.length / 100,
          contract.consumers.length / 50,
          contract.schemas.length / 50,
          contract.type === 'rest' ? 1 : 0,
          contract.type === 'graphql' ? 1 : 0,
          contract.endpoints.filter((e) => e.method === 'GET').length / 100,
          contract.endpoints.filter((e) => e.method === 'POST').length / 100,
          contract.endpoints.filter((e) => e.responseSchema).length / 100,
        ],
      };

      const adaptation = await this.qesona.adaptPattern(
        state,
        'test-generation',
        'contract-testing'
      );

      if (adaptation.success && adaptation.pattern) {
        const shouldValidate = adaptation.pattern.outcome.success;
        const strategy = adaptation.pattern.action.type;

        console.log(
          `[contract-testing] QESONA adapted pattern for ${contract.id}: shouldValidate=${shouldValidate}, confidence=${adaptation.similarity.toFixed(2)}`
        );

        return {
          shouldValidate,
          confidence: adaptation.similarity,
          strategy,
        };
      }

      return {
        shouldValidate: true,
        confidence: 0.5,
        strategy: 'default',
      };
    } catch (error) {
      console.error('[contract-testing] QESONA pattern adaptation failed:', error);
      return {
        shouldValidate: true,
        confidence: 0.5,
        strategy: 'default',
      };
    }
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  private async handleImpactAnalysis(event: DomainEvent): Promise<void> {
    // Auto-verify contracts when code changes affect API endpoints
    const payload = event.payload as {
      changedFiles: string[];
      impactedFiles: string[];
    };

    // Check if any changed files are contract-related
    const contractFiles = payload.changedFiles.filter(
      (f) => f.includes('contract') || f.includes('api') || f.includes('openapi')
    );

    if (contractFiles.length > 0 && this.config.enableAutoVerification) {
      // Could trigger automatic verification
      // For now, just store the info for manual review
      await this.memory.set(
        `contract-testing:pending-verification:${Date.now()}`,
        { changedFiles: contractFiles, timestamp: new Date().toISOString() },
        { namespace: 'contract-testing', ttl: 3600 }
      );
    }
  }

  // ============================================================================
  // State Persistence
  // ============================================================================

  private async loadContracts(): Promise<void> {
    const keys = await this.memory.search('contract-testing:contract:*', 100);
    for (const key of keys) {
      const contract = await this.memory.get<ApiContract>(key);
      if (contract) {
        this.contractStore.set(contract.id, contract);
      }
    }
  }

  private async saveContracts(): Promise<void> {
    const entries = Array.from(this.contractStore.entries());
    for (const [id, contract] of entries) {
      await this.memory.set(`contract-testing:contract:${id}`, contract, {
        namespace: 'contract-testing',
        persist: true,
      });
    }
  }

  // ============================================================================
  // Consensus Integration (MM-001) - Domain-specific methods
  // ============================================================================

  /**
   * Verify a contract violation using multi-model consensus
   */
  async verifyContractViolation(
    violation: { consumer: string; provider: string; endpoint: string; type: string },
    confidence: number
  ): Promise<boolean> {
    const finding: DomainFinding<typeof violation> = createDomainFinding({
      id: uuidv4(),
      type: 'contract-violation',
      confidence,
      description: `Verify contract violation: ${violation.consumer} -> ${violation.provider} (${violation.endpoint}, ${violation.type})`,
      payload: violation,
      detectedBy: 'contract-testing-coordinator',
      severity: confidence > 0.9 ? 'critical' : 'high',
    });

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        console.log(`[${this.domainName}] Contract violation verified by consensus`);
        return true;
      }
      console.warn(`[${this.domainName}] Contract violation NOT verified: ${result.success ? result.value.verdict : result.error.message}`);
      return false;
    }
    return true; // No consensus needed
  }

  /**
   * Verify a breaking change detection using multi-model consensus
   */
  async verifyBreakingChange(
    change: { path: string; type: string; affectedConsumers: string[]; description: string },
    confidence: number
  ): Promise<boolean> {
    const finding: DomainFinding<typeof change> = createDomainFinding({
      id: uuidv4(),
      type: 'breaking-change',
      confidence,
      description: `Verify breaking change: ${change.path} (${change.type}) affecting ${change.affectedConsumers.length} consumers`,
      payload: change,
      detectedBy: 'contract-testing-coordinator',
      severity: 'critical', // Breaking changes are always critical
    });

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        console.log(`[${this.domainName}] Breaking change at '${change.path}' verified by consensus`);
        return true;
      }
      console.warn(`[${this.domainName}] Breaking change NOT verified: ${result.success ? result.value.verdict : result.error.message}`);
      return false;
    }
    return true; // No consensus needed
  }

  /**
   * Verify a schema incompatibility using multi-model consensus
   */
  async verifySchemaIncompatibility(
    incompatibility: { schema: string; field: string; expected: string; actual: string },
    confidence: number
  ): Promise<boolean> {
    const finding: DomainFinding<typeof incompatibility> = createDomainFinding({
      id: uuidv4(),
      type: 'schema-incompatibility',
      confidence,
      description: `Verify schema incompatibility: ${incompatibility.schema}.${incompatibility.field} (expected ${incompatibility.expected}, got ${incompatibility.actual})`,
      payload: incompatibility,
      detectedBy: 'contract-testing-coordinator',
      severity: confidence > 0.85 ? 'high' : 'medium',
    });

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        console.log(`[${this.domainName}] Schema incompatibility verified by consensus`);
        return true;
      }
      console.warn(`[${this.domainName}] Schema incompatibility NOT verified: ${result.success ? result.value.verdict : result.error.message}`);
      return false;
    }
    return true; // No consensus needed
  }
}
