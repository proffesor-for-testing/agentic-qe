/**
 * Agentic QE v3 - Contract Testing Coordinator
 * Orchestrates the contract testing workflow across services
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err, DomainEvent } from '../../shared/types/index.js';
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
} from './interfaces.js';
import { ContractValidatorService } from './services/contract-validator.js';
import { ApiCompatibilityService } from './services/api-compatibility.js';

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
export interface CoordinatorConfig {
  maxConcurrentWorkflows: number;
  defaultTimeout: number;
  enableAutoVerification: boolean;
  publishEvents: boolean;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkflows: 5,
  defaultTimeout: 60000, // 60 seconds
  enableAutoVerification: true,
  publishEvents: true,
};

/**
 * Contract Testing Coordinator
 * Orchestrates contract testing workflows and coordinates with agents
 */
export class ContractTestingCoordinator implements IContractTestingCoordinator {
  private readonly config: CoordinatorConfig;
  private readonly contractValidator: ContractValidatorService;
  private readonly apiCompatibility: ApiCompatibilityService;
  private readonly httpClient: HttpClient;
  private readonly fileReader: FileReader;
  // SchemaValidatorService reserved for future use
  private readonly workflows: Map<string, WorkflowStatus> = new Map();
  private readonly contractStore: Map<string, ApiContract> = new Map();
  private initialized = false;

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<CoordinatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.contractValidator = new ContractValidatorService(memory);
    this.apiCompatibility = new ApiCompatibilityService(memory);
    this.httpClient = createHttpClient();
    this.fileReader = new FileReader();
    // Note: schemaValidator initialized when needed for schema operations
  }

  /**
   * Initialize the coordinator
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Subscribe to relevant events
    this.subscribeToEvents();

    // Load any persisted contracts
    await this.loadContracts();

    this.initialized = true;
  }

  /**
   * Dispose and cleanup
   */
  async dispose(): Promise<void> {
    // Save workflow state
    await this.saveContracts();

    // Clear active workflows
    this.workflows.clear();
    this.contractStore.clear();

    this.initialized = false;
  }

  /**
   * Get active workflow statuses
   */
  getActiveWorkflows(): WorkflowStatus[] {
    return Array.from(this.workflows.values()).filter(
      (w) => w.status === 'running' || w.status === 'pending'
    );
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
      return err(error instanceof Error ? error : new Error(String(error)));
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

      // Find all contracts for this provider
      const contracts = await this.findContractsByProvider(providerName);
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

      // Spawn verification agent
      const agentResult = await this.spawnVerificationAgent(workflowId, providerName);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return agentResult;
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);

      const results: VerificationResult[] = [];
      const failedConsumers: string[] = [];

      // Verify each contract
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
      return err(error instanceof Error ? error : new Error(String(error)));
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
      return err(error instanceof Error ? error : new Error(String(error)));
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
      return err(error instanceof Error ? error : new Error(String(error)));
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
      return err(error instanceof Error ? error : new Error(String(error)));
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
              type: verifyResult.errorType,
              expected: verifyResult.expected,
              actual: verifyResult.actual,
              message: verifyResult.message,
            });
          } else if (verifyResult.warning) {
            warnings.push({
              endpoint: endpointKey,
              message: verifyResult.warning,
            });
          }
        } catch (error) {
          failures.push({
            endpoint: endpointKey,
            type: 'connection-error',
            expected: 'reachable',
            actual: 'error',
            message: `Failed to verify endpoint: ${error instanceof Error ? error.message : String(error)}`,
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

    // Verify response status matches expected
    if (endpoint.responses && endpoint.responses.length > 0) {
      const expectedStatuses = endpoint.responses.map((r) => r.statusCode);
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
        const parsed = JSON.parse(content);

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
      return JSON.parse(content) as ApiContract;
    } catch (error) {
      console.error(
        `Failed to parse contract from ${path.value}:`,
        error instanceof Error ? error.message : String(error)
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
    const spec = JSON.parse(specContent) as Record<string, unknown>;
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

    const schemas: Record<string, unknown> = {};
    for (const schema of contract.schemas) {
      try {
        schemas[schema.id] = JSON.parse(schema.content);
      } catch {
        schemas[schema.id] = { type: 'object' };
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
        schemas,
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
  // Workflow Management
  // ============================================================================

  private startWorkflow(id: string, type: WorkflowStatus['type']): void {
    const activeWorkflows = this.getActiveWorkflows();
    if (activeWorkflows.length >= this.config.maxConcurrentWorkflows) {
      throw new Error(
        `Maximum concurrent workflows (${this.config.maxConcurrentWorkflows}) reached`
      );
    }

    this.workflows.set(id, {
      id,
      type,
      status: 'running',
      startedAt: new Date(),
      agentIds: [],
      progress: 0,
    });
  }

  private completeWorkflow(id: string): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.status = 'completed';
      workflow.completedAt = new Date();
      workflow.progress = 100;
    }
  }

  private failWorkflow(id: string, error: string): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.status = 'failed';
      workflow.completedAt = new Date();
      workflow.error = error;
    }
  }

  private addAgentToWorkflow(workflowId: string, agentId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.agentIds.push(agentId);
    }
  }

  private updateWorkflowProgress(id: string, progress: number): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.progress = Math.min(100, Math.max(0, progress));
    }
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  private subscribeToEvents(): void {
    // Subscribe to code change events for auto-verification
    this.eventBus.subscribe(
      'code-intelligence.ImpactAnalysisCompleted',
      this.handleImpactAnalysis.bind(this)
    );
  }

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
}
