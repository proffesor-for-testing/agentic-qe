/**
 * Agentic QE v3 - Enterprise Integration Domain Plugin
 * Integrates the enterprise integration domain into the kernel
 *
 * ADR-063: Enterprise Integration Testing Gap Closure
 */

import { DomainName, DomainEvent, Result, err } from '../../shared/types/index.js';
import type {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
} from '../../kernel/interfaces.js';
import { BaseDomainPlugin, TaskHandler } from '../domain-interface.js';
import type {
  // SOAP/WSDL
  WsdlDefinition,
  SoapTestResult,
  // Message Broker
  MessageBrokerConfig,
  MessageTestCase,
  MessageTestResult,
  DlqTestResult,
  // SAP RFC/BAPI
  RfcConnection,
  BapiCall,
  BapiTestResult,
  // SAP IDoc
  IDocDefinition,
  IDocTestResult,
  // OData
  ODataMetadata,
  ODataTestResult,
  // ESB/Middleware
  MessageFlow,
  MessagePayload,
  MiddlewareTestResult,
  TransformationSpec,
  // SoD
  SodRuleset,
  SodAnalysisResult,
} from './interfaces.js';
import { toError } from '../../shared/error-utils.js';
import {
  EnterpriseIntegrationCoordinator,
  EnterpriseIntegrationEvents,
  CoordinatorConfig,
  WorkflowStatus,
} from './coordinator.js';

/**
 * Plugin configuration options
 */
export interface EnterpriseIntegrationPluginConfig {
  coordinator?: Partial<CoordinatorConfig>;
}

/**
 * Enterprise Integration Domain API
 */
export interface EnterpriseIntegrationAPI {
  // SOAP/WSDL
  validateWsdl(url: string): Promise<Result<WsdlDefinition>>;
  testSoapOperation(wsdl: WsdlDefinition, operation: string, input: unknown): Promise<Result<SoapTestResult>>;

  // Message Broker
  testMessageFlow(config: MessageBrokerConfig, testCase: MessageTestCase): Promise<Result<MessageTestResult>>;
  testDlqHandling(config: MessageBrokerConfig, queue: string): Promise<Result<DlqTestResult>>;

  // SAP RFC/BAPI
  testBapiCall(connection: RfcConnection, bapi: BapiCall): Promise<Result<BapiTestResult>>;

  // SAP IDoc
  validateIdoc(definition: IDocDefinition, content: string): Promise<Result<IDocTestResult>>;

  // OData
  validateODataMetadata(serviceUrl: string): Promise<Result<ODataMetadata>>;
  testODataEntitySet(metadata: ODataMetadata, entitySet: string): Promise<Result<ODataTestResult>>;

  // ESB/Middleware
  validateMessageFlow(flow: MessageFlow, input: MessagePayload): Promise<Result<MiddlewareTestResult>>;
  validateTransformation(spec: TransformationSpec, input: string, expectedOutput: string): Promise<Result<boolean>>;

  // SoD Analysis
  analyzeSod(userId: string, ruleset: SodRuleset): Promise<Result<SodAnalysisResult>>;
}

/**
 * Extended API with internal access
 */
export interface EnterpriseIntegrationExtendedAPI extends EnterpriseIntegrationAPI {
  /** Get the internal coordinator */
  getCoordinator(): EnterpriseIntegrationCoordinator;

  /** Get active workflows */
  getActiveWorkflows(): WorkflowStatus[];
}

/**
 * Enterprise Integration Domain Plugin
 * Provides SOAP/WSDL, message broker, SAP RFC/BAPI/IDoc, OData,
 * ESB/middleware, and SoD analysis testing capabilities
 */
export class EnterpriseIntegrationPlugin extends BaseDomainPlugin {
  private coordinator: EnterpriseIntegrationCoordinator | null = null;
  private readonly pluginConfig: EnterpriseIntegrationPluginConfig;

  constructor(
    eventBus: EventBus,
    memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: EnterpriseIntegrationPluginConfig = {}
  ) {
    super(eventBus, memory);
    this.pluginConfig = config;
  }

  // ============================================================================
  // DomainPlugin Interface Implementation
  // ============================================================================

  get name(): DomainName {
    return 'enterprise-integration';
  }

  get version(): string {
    return '1.0.0';
  }

  get dependencies(): DomainName[] {
    // Enterprise integration can optionally use contract-testing for SOAP/OData contracts
    return [];
  }

  /**
   * Get the domain's public API
   */
  getAPI<T>(): T {
    const api: EnterpriseIntegrationExtendedAPI = {
      // SOAP/WSDL
      validateWsdl: this.validateWsdl.bind(this),
      testSoapOperation: this.testSoapOperation.bind(this),

      // Message Broker
      testMessageFlow: this.testMessageFlow.bind(this),
      testDlqHandling: this.testDlqHandling.bind(this),

      // SAP RFC/BAPI
      testBapiCall: this.testBapiCall.bind(this),

      // SAP IDoc
      validateIdoc: this.validateIdoc.bind(this),

      // OData
      validateODataMetadata: this.validateODataMetadata.bind(this),
      testODataEntitySet: this.testODataEntitySet.bind(this),

      // ESB/Middleware
      validateMessageFlow: this.validateMessageFlow.bind(this),
      validateTransformation: this.validateTransformation.bind(this),

      // SoD Analysis
      analyzeSod: this.analyzeSod.bind(this),

      // Internal access methods
      getCoordinator: () => this.coordinator!,
      getActiveWorkflows: () => this.coordinator?.getActiveWorkflows() || [],
    };

    return api as T;
  }

  // ============================================================================
  // Task Handlers (Queen-Domain Integration)
  // ============================================================================

  protected override getTaskHandlers(): Map<string, TaskHandler> {
    return new Map([
      ['enterprise-integration:soap-test', async (payload): Promise<Result<unknown, Error>> => {
        if (!this.coordinator) {
          return err(new Error('Enterprise integration coordinator not initialized'));
        }
        const wsdl = payload.wsdl as WsdlDefinition | undefined;
        const operation = payload.operation as string | undefined;
        const input = payload.input;

        if (payload.url && !wsdl) {
          // Validate WSDL from URL
          return this.coordinator.validateWsdl(payload.url as string);
        }
        if (!wsdl || !operation) {
          return err(new Error('Invalid soap-test payload: missing wsdl or operation'));
        }
        return this.coordinator.testSoapOperation(wsdl, operation, input);
      }],

      ['enterprise-integration:message-broker-test', async (payload): Promise<Result<unknown, Error>> => {
        if (!this.coordinator) {
          return err(new Error('Enterprise integration coordinator not initialized'));
        }
        const brokerConfig = payload.brokerConfig as MessageBrokerConfig | undefined;
        const testCase = payload.testCase as MessageTestCase | undefined;
        const queue = payload.queue as string | undefined;

        if (!brokerConfig) {
          return err(new Error('Invalid message-broker-test payload: missing brokerConfig'));
        }
        // DLQ handling mode
        if (queue && !testCase) {
          return this.coordinator.testDlqHandling(brokerConfig, queue);
        }
        if (!testCase) {
          return err(new Error('Invalid message-broker-test payload: missing testCase'));
        }
        return this.coordinator.testMessageFlow(brokerConfig, testCase);
      }],

      ['enterprise-integration:sap-rfc-test', async (payload): Promise<Result<unknown, Error>> => {
        if (!this.coordinator) {
          return err(new Error('Enterprise integration coordinator not initialized'));
        }
        const connection = payload.connection as RfcConnection | undefined;
        const bapi = payload.bapi as BapiCall | undefined;

        if (!connection || !bapi) {
          return err(new Error('Invalid sap-rfc-test payload: missing connection or bapi'));
        }
        return this.coordinator.testBapiCall(connection, bapi);
      }],

      ['enterprise-integration:sap-idoc-validate', async (payload): Promise<Result<unknown, Error>> => {
        if (!this.coordinator) {
          return err(new Error('Enterprise integration coordinator not initialized'));
        }
        const definition = payload.definition as IDocDefinition | undefined;
        const content = payload.content as string | undefined;

        if (!definition || !content) {
          return err(new Error('Invalid sap-idoc-validate payload: missing definition or content'));
        }
        return this.coordinator.validateIdoc(definition, content);
      }],

      ['enterprise-integration:odata-test', async (payload): Promise<Result<unknown, Error>> => {
        if (!this.coordinator) {
          return err(new Error('Enterprise integration coordinator not initialized'));
        }
        const serviceUrl = payload.serviceUrl as string | undefined;
        const metadata = payload.metadata as ODataMetadata | undefined;
        const entitySet = payload.entitySet as string | undefined;

        if (serviceUrl && !metadata) {
          // Validate metadata from URL
          return this.coordinator.validateODataMetadata(serviceUrl);
        }
        if (!metadata || !entitySet) {
          return err(new Error('Invalid odata-test payload: missing metadata or entitySet'));
        }
        return this.coordinator.testODataEntitySet(metadata, entitySet);
      }],

      ['enterprise-integration:esb-flow-test', async (payload): Promise<Result<unknown, Error>> => {
        if (!this.coordinator) {
          return err(new Error('Enterprise integration coordinator not initialized'));
        }
        const flow = payload.flow as MessageFlow | undefined;
        const input = payload.input as MessagePayload | undefined;
        const spec = payload.spec as TransformationSpec | undefined;

        // Transformation validation mode
        if (spec) {
          const transformInput = payload.transformInput as string | undefined;
          const expectedOutput = payload.expectedOutput as string | undefined;
          if (!transformInput || !expectedOutput) {
            return err(new Error('Invalid esb-flow-test payload: missing transformInput or expectedOutput for transformation'));
          }
          return this.coordinator.validateTransformation(spec, transformInput, expectedOutput);
        }

        if (!flow || !input) {
          return err(new Error('Invalid esb-flow-test payload: missing flow or input'));
        }
        return this.coordinator.validateMessageFlow(flow, input);
      }],

      ['enterprise-integration:sod-analyze', async (payload): Promise<Result<unknown, Error>> => {
        if (!this.coordinator) {
          return err(new Error('Enterprise integration coordinator not initialized'));
        }
        const userId = payload.userId as string | undefined;
        const ruleset = payload.ruleset as SodRuleset | undefined;

        if (!userId || !ruleset) {
          return err(new Error('Invalid sod-analyze payload: missing userId or ruleset'));
        }
        return this.coordinator.analyzeSod(userId, ruleset);
      }],
    ]);
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  protected async onInitialize(): Promise<void> {
    // Create coordinator
    this.coordinator = new EnterpriseIntegrationCoordinator(
      this.eventBus,
      this.memory,
      this.agentCoordinator,
      this.pluginConfig.coordinator
    );

    // Initialize coordinator
    await this.coordinator.initialize();

    // Issue #205 fix: Start with 'idle' status (0 agents)
    this.updateHealth({
      status: 'idle',
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
  }

  protected subscribeToEvents(): void {
    // Subscribe to contract testing events for SOAP/OData contract correlation
    this.eventBus.subscribe(
      'contract-testing.ContractVerified',
      this.handleContractVerified.bind(this)
    );

    // Subscribe to quality gate events
    this.eventBus.subscribe(
      'quality-assessment.QualityGateEvaluated',
      this.handleQualityGate.bind(this)
    );

    // Subscribe to chaos resilience events for middleware fault correlation
    this.eventBus.subscribe(
      'chaos-resilience.FaultInjected',
      this.handleFaultInjected.bind(this)
    );
  }

  protected async onEvent(event: DomainEvent): Promise<void> {
    // Track activity
    this.updateHealth({
      lastActivity: new Date(),
    });

    // Route to appropriate handler based on event type
    switch (event.type) {
      case 'contract-testing.ContractVerified':
        await this.handleContractVerified(event);
        break;
      case 'quality-assessment.QualityGateEvaluated':
        await this.handleQualityGate(event);
        break;
      case 'chaos-resilience.FaultInjected':
        await this.handleFaultInjected(event);
        break;
      default:
        // No specific handling needed
        break;
    }
  }

  // ============================================================================
  // API Implementation - SOAP/WSDL
  // ============================================================================

  private async validateWsdl(url: string): Promise<Result<WsdlDefinition>> {
    this.ensureInitialized();
    try {
      const result = await this.coordinator!.validateWsdl(url);
      if (result.success) {
        this.trackSuccessfulOperation('validateWsdl');
      } else {
        this.trackFailedOperation(new Error(result.error.message));
      }
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async testSoapOperation(
    wsdl: WsdlDefinition,
    operation: string,
    input: unknown
  ): Promise<Result<SoapTestResult>> {
    this.ensureInitialized();
    try {
      const result = await this.coordinator!.testSoapOperation(wsdl, operation, input);
      if (result.success) {
        this.trackSuccessfulOperation('testSoapOperation');
      } else {
        this.trackFailedOperation(new Error(result.error.message));
      }
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // API Implementation - Message Broker
  // ============================================================================

  private async testMessageFlow(
    config: MessageBrokerConfig,
    testCase: MessageTestCase
  ): Promise<Result<MessageTestResult>> {
    this.ensureInitialized();
    try {
      const result = await this.coordinator!.testMessageFlow(config, testCase);
      if (result.success) {
        this.trackSuccessfulOperation('testMessageFlow');
      } else {
        this.trackFailedOperation(new Error(result.error.message));
      }
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async testDlqHandling(
    config: MessageBrokerConfig,
    queue: string
  ): Promise<Result<DlqTestResult>> {
    this.ensureInitialized();
    try {
      const result = await this.coordinator!.testDlqHandling(config, queue);
      if (result.success) {
        this.trackSuccessfulOperation('testDlqHandling');
      } else {
        this.trackFailedOperation(new Error(result.error.message));
      }
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // API Implementation - SAP RFC/BAPI
  // ============================================================================

  private async testBapiCall(
    connection: RfcConnection,
    bapi: BapiCall
  ): Promise<Result<BapiTestResult>> {
    this.ensureInitialized();
    try {
      const result = await this.coordinator!.testBapiCall(connection, bapi);
      if (result.success) {
        this.trackSuccessfulOperation('testBapiCall');
      } else {
        this.trackFailedOperation(new Error(result.error.message));
      }
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // API Implementation - SAP IDoc
  // ============================================================================

  private async validateIdoc(
    definition: IDocDefinition,
    content: string
  ): Promise<Result<IDocTestResult>> {
    this.ensureInitialized();
    try {
      const result = await this.coordinator!.validateIdoc(definition, content);
      if (result.success) {
        this.trackSuccessfulOperation('validateIdoc');
      } else {
        this.trackFailedOperation(new Error(result.error.message));
      }
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // API Implementation - OData
  // ============================================================================

  private async validateODataMetadata(
    serviceUrl: string
  ): Promise<Result<ODataMetadata>> {
    this.ensureInitialized();
    try {
      const result = await this.coordinator!.validateODataMetadata(serviceUrl);
      if (result.success) {
        this.trackSuccessfulOperation('validateODataMetadata');
      } else {
        this.trackFailedOperation(new Error(result.error.message));
      }
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async testODataEntitySet(
    metadata: ODataMetadata,
    entitySet: string
  ): Promise<Result<ODataTestResult>> {
    this.ensureInitialized();
    try {
      const result = await this.coordinator!.testODataEntitySet(metadata, entitySet);
      if (result.success) {
        this.trackSuccessfulOperation('testODataEntitySet');
      } else {
        this.trackFailedOperation(new Error(result.error.message));
      }
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // API Implementation - ESB/Middleware
  // ============================================================================

  private async validateMessageFlow(
    flow: MessageFlow,
    input: MessagePayload
  ): Promise<Result<MiddlewareTestResult>> {
    this.ensureInitialized();
    try {
      const result = await this.coordinator!.validateMessageFlow(flow, input);
      if (result.success) {
        this.trackSuccessfulOperation('validateMessageFlow');
      } else {
        this.trackFailedOperation(new Error(result.error.message));
      }
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async validateTransformation(
    spec: TransformationSpec,
    input: string,
    expectedOutput: string
  ): Promise<Result<boolean>> {
    this.ensureInitialized();
    try {
      const result = await this.coordinator!.validateTransformation(spec, input, expectedOutput);
      if (result.success) {
        this.trackSuccessfulOperation('validateTransformation');
      } else {
        this.trackFailedOperation(new Error(result.error.message));
      }
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // API Implementation - SoD Analysis
  // ============================================================================

  private async analyzeSod(
    userId: string,
    ruleset: SodRuleset
  ): Promise<Result<SodAnalysisResult>> {
    this.ensureInitialized();
    try {
      const result = await this.coordinator!.analyzeSod(userId, ruleset);
      if (result.success) {
        this.trackSuccessfulOperation('analyzeSod');
      } else {
        this.trackFailedOperation(new Error(result.error.message));
      }
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private async handleContractVerified(event: DomainEvent): Promise<void> {
    // Contract verified - check if it involves enterprise integration protocols
    const payload = event.payload as {
      contractId: string;
      contractType?: string;
      passed: boolean;
    };

    if (payload.contractType === 'soap' || payload.contractType === 'odata') {
      // Store for correlation with enterprise integration test results
      await this.memory.set(
        `enterprise-integration:contract-verified:${payload.contractId}`,
        {
          contractId: payload.contractId,
          type: payload.contractType,
          passed: payload.passed,
          timestamp: new Date().toISOString(),
        },
        { namespace: 'enterprise-integration', ttl: 86400 }
      );
    }
  }

  private async handleQualityGate(event: DomainEvent): Promise<void> {
    // Quality gate evaluated - check if enterprise integration was included
    const payload = event.payload as {
      gateId: string;
      passed: boolean;
      checks: Array<{ name: string; passed: boolean }>;
    };

    const enterpriseCheck = payload.checks.find((c) => c.name === 'enterprise-integration');
    if (!enterpriseCheck) {
      // Enterprise integration testing was not included in quality gate
      await this.memory.set(
        `enterprise-integration:quality-gate-warning:${payload.gateId}`,
        { warning: 'Enterprise integration testing not included in quality gate', timestamp: new Date().toISOString() },
        { namespace: 'enterprise-integration', ttl: 86400 }
      );
    }
  }

  private async handleFaultInjected(event: DomainEvent): Promise<void> {
    // Chaos fault injection detected - correlate with middleware/broker tests
    const payload = event.payload as {
      targetService?: string;
      faultType?: string;
      faultId?: string;
    };

    const isMiddlewareTarget =
      payload.targetService?.includes('middleware') ||
      payload.targetService?.includes('esb') ||
      payload.targetService?.includes('broker') ||
      payload.targetService?.includes('mq');

    if (isMiddlewareTarget) {
      await this.memory.set(
        `enterprise-integration:fault-correlation:${payload.faultId || Date.now()}`,
        {
          targetService: payload.targetService,
          faultType: payload.faultType,
          timestamp: new Date().toISOString(),
        },
        { namespace: 'enterprise-integration', ttl: 3600 }
      );
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('EnterpriseIntegrationPlugin is not initialized');
    }

    if (!this.coordinator) {
      throw new Error('EnterpriseIntegrationPlugin coordinator is not available');
    }
  }

  private handleError<T>(error: unknown): Result<T, Error> {
    const err = toError(error);

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
 * Factory function to create an EnterpriseIntegrationPlugin
 */
export function createEnterpriseIntegrationPlugin(
  eventBus: EventBus,
  memory: MemoryBackend,
  agentCoordinator: AgentCoordinator,
  config?: EnterpriseIntegrationPluginConfig
): EnterpriseIntegrationPlugin {
  return new EnterpriseIntegrationPlugin(eventBus, memory, agentCoordinator, config);
}
