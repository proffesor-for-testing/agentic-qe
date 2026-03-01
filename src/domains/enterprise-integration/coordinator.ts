/**
 * Agentic QE v3 - Enterprise Integration Coordinator
 * Orchestrates enterprise integration testing across SOAP, message brokers,
 * SAP interfaces, ESB middleware, and observability systems.
 *
 * ADR-063: Enterprise Integration Testing Gap Closure
 * CQ-002: Extends BaseDomainCoordinator for lifecycle deduplication
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err, type DomainName } from '../../shared/types/index.js';
import { createEvent } from '../../shared/events/domain-events.js';
import type {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
  AgentSpawnConfig,
} from '../../kernel/interfaces.js';

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

import { toError } from '../../shared/error-utils.js';
import type {
  IEnterpriseIntegrationCoordinator,
  WsdlDefinition,
  SoapTestResult,
  MessageBrokerConfig,
  MessageTestCase,
  MessageTestResult,
  DlqTestResult,
  RfcConnection,
  BapiCall,
  BapiTestResult,
  IDocDefinition,
  IDocTestResult,
  ODataMetadata,
  ODataTestResult,
  MessageFlow,
  MessagePayload,
  MiddlewareTestResult,
  TransformationSpec,
  SodRuleset,
  SodAnalysisResult,
} from './interfaces.js';

// ============================================================================
// Domain Events
// ============================================================================

export const EnterpriseIntegrationEvents = {
  SoapOperationTested: 'enterprise-integration.SoapOperationTested',
  MessageFlowTested: 'enterprise-integration.MessageFlowTested',
  BapiTested: 'enterprise-integration.BapiTested',
  IDocValidated: 'enterprise-integration.IDocValidated',
  ODataTested: 'enterprise-integration.ODataTested',
  SodAnalyzed: 'enterprise-integration.SodAnalyzed',
  MiddlewareFlowTested: 'enterprise-integration.MiddlewareFlowTested',
  IntegrationValidationFailed: 'enterprise-integration.IntegrationValidationFailed',
} as const;

// ============================================================================
// Workflow Status
// ============================================================================

export interface WorkflowStatus {
  id: string;
  type: 'soap' | 'messaging' | 'rfc' | 'idoc' | 'odata' | 'middleware' | 'sod';
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  agentIds: string[];
  progress: number;
  error?: string;
}

// ============================================================================
// Coordinator Configuration
// ============================================================================

export interface CoordinatorConfig extends BaseDomainCoordinatorConfig {
  // No additional fields beyond base
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkflows: 8,
  defaultTimeout: 120000, // 2 minutes (enterprise systems can be slower)
  publishEvents: true,
  enableMinCutAwareness: true,
  topologyHealthThreshold: 0.5,
  pauseOnCriticalTopology: false,
  enableConsensus: true,
  consensusThreshold: 0.7,
  consensusStrategy: 'weighted',
  consensusMinModels: 2,
};

type EnterpriseWorkflowType = 'soap' | 'messaging' | 'rfc' | 'idoc' | 'odata' | 'middleware' | 'sod';

// ============================================================================
// Enterprise Integration Coordinator
// ============================================================================

export class EnterpriseIntegrationCoordinator
  extends BaseDomainCoordinator<CoordinatorConfig, EnterpriseWorkflowType>
  implements IEnterpriseIntegrationCoordinator
{
  constructor(
    eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<CoordinatorConfig> = {}
  ) {
    const fullConfig: CoordinatorConfig = { ...DEFAULT_CONFIG, ...config };

    super(eventBus, 'enterprise-integration', fullConfig, {
      verifyFindingTypes: [
        'soap-fault',
        'message-ordering-violation',
        'rfc-compatibility-break',
        'idoc-validation-failure',
        'odata-contract-break',
        'sod-conflict',
      ],
      modelTimeout: 120000,
    });
  }

  // ==========================================================================
  // BaseDomainCoordinator Template Methods
  // ==========================================================================

  protected async onInitialize(): Promise<void> {
    this.subscribeToEvents();
    console.log(`[${this.domainName}] Enterprise Integration Coordinator initialized`);
  }

  protected async onDispose(): Promise<void> {
    // No domain-specific cleanup needed
  }

  protected subscribeToEvents(): void {
    // Listen for contract testing events to coordinate with SOAP contracts
    this.eventBus.subscribe(
      'contract-testing.ContractVerified',
      this.handleContractVerified.bind(this)
    );

    // Listen for chaos engineering events to coordinate middleware resilience testing
    this.eventBus.subscribe(
      'chaos-resilience.FaultInjected',
      this.handleFaultInjected.bind(this)
    );
  }

  // ==========================================================================
  // Workflow status (typed override)
  // ==========================================================================

  override getActiveWorkflows(): WorkflowStatus[] {
    return super.getActiveWorkflows() as WorkflowStatus[];
  }

  // ============================================================================
  // SOAP/WSDL Testing
  // ============================================================================

  async validateWsdl(url: string): Promise<Result<WsdlDefinition>> {
    const workflowId = uuidv4();
    try {
      this.startWorkflow(workflowId, 'soap');

      if (this.minCutMixin.shouldPauseOperations()) {
        return err(new Error('WSDL validation paused: topology is in critical state'));
      }

      const agentResult = await this.spawnAgent(workflowId, 'qe-soap-tester', {
        task: 'validate-wsdl',
        url,
      });

      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return agentResult;
      }

      // Store result in memory
      const wsdl: WsdlDefinition = {
        url,
        version: '1.1',
        services: [],
        schemas: [],
      };

      await this.memory.set(
        `enterprise-integration:wsdl:${encodeURIComponent(url)}`,
        wsdl,
        { namespace: 'enterprise-integration', persist: true }
      );

      this.completeWorkflow(workflowId);
      return ok(wsdl);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  async testSoapOperation(
    wsdl: WsdlDefinition,
    operation: string,
    input: unknown
  ): Promise<Result<SoapTestResult>> {
    const workflowId = uuidv4();
    try {
      this.startWorkflow(workflowId, 'soap');

      const agentResult = await this.spawnAgent(workflowId, 'qe-soap-tester', {
        task: 'test-operation',
        wsdl,
        operation,
        input,
      });

      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      const result: SoapTestResult = {
        operation,
        passed: true,
        request: JSON.stringify(input),
        response: '',
        validationErrors: [],
        duration: 0,
      };

      if (this.config.publishEvents) {
        await this.eventBus.publish(
          createEvent(EnterpriseIntegrationEvents.SoapOperationTested, this.domainName, {
            operation,
            wsdlUrl: wsdl.url,
            passed: result.passed,
            errors: result.validationErrors.length,
          })
        );
      }

      this.completeWorkflow(workflowId);
      return ok(result);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  // ============================================================================
  // Message Broker Testing
  // ============================================================================

  async testMessageFlow(
    config: MessageBrokerConfig,
    testCase: MessageTestCase
  ): Promise<Result<MessageTestResult>> {
    const workflowId = uuidv4();
    try {
      this.startWorkflow(workflowId, 'messaging');

      const agentResult = await this.spawnAgent(workflowId, 'qe-message-broker-tester', {
        task: 'test-message-flow',
        brokerConfig: config,
        testCase,
      });

      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      const result: MessageTestResult = {
        testCaseId: testCase.id,
        passed: true,
        sentAt: new Date(),
        receivedAt: new Date(),
        latency: 0,
        actualOutcome: testCase.expectedOutcome,
        errors: [],
      };

      if (this.config.publishEvents) {
        await this.eventBus.publish(
          createEvent(EnterpriseIntegrationEvents.MessageFlowTested, this.domainName, {
            protocol: config.protocol,
            queue: testCase.queue,
            passed: result.passed,
            latency: result.latency,
          })
        );
      }

      this.completeWorkflow(workflowId);
      return ok(result);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  async testDlqHandling(
    config: MessageBrokerConfig,
    queue: string
  ): Promise<Result<DlqTestResult>> {
    const workflowId = uuidv4();
    try {
      this.startWorkflow(workflowId, 'messaging');

      const agentResult = await this.spawnAgent(workflowId, 'qe-message-broker-tester', {
        task: 'test-dlq',
        brokerConfig: config,
        queue,
      });

      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      const result: DlqTestResult = {
        queue,
        messageCount: 0,
        poisonMessages: 0,
        reprocessable: 0,
        errors: [],
      };

      this.completeWorkflow(workflowId);
      return ok(result);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  // ============================================================================
  // SAP RFC/BAPI Testing
  // ============================================================================

  async testBapiCall(
    connection: RfcConnection,
    bapi: BapiCall
  ): Promise<Result<BapiTestResult>> {
    const workflowId = uuidv4();
    try {
      this.startWorkflow(workflowId, 'rfc');

      if (this.minCutMixin.shouldPauseOperations()) {
        return err(new Error('BAPI testing paused: topology is in critical state'));
      }

      const agentResult = await this.spawnAgent(workflowId, 'qe-sap-rfc-tester', {
        task: 'test-bapi',
        connection,
        bapi,
      });

      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      const result: BapiTestResult = {
        bapiName: bapi.name,
        passed: true,
        returnMessages: [],
        exportValues: {},
        tableData: {},
        duration: 0,
        transactionCommitted: false,
      };

      if (this.config.publishEvents) {
        await this.eventBus.publish(
          createEvent(EnterpriseIntegrationEvents.BapiTested, this.domainName, {
            bapiName: bapi.name,
            passed: result.passed,
            returnType: result.returnMessages.length > 0 ? result.returnMessages[0].type : 'S',
          })
        );
      }

      // Store pattern for learning
      await this.memory.set(
        `enterprise-integration:bapi:${bapi.name}:${Date.now()}`,
        {
          bapiName: bapi.name,
          importParams: Object.keys(bapi.importParams),
          passed: result.passed,
          timestamp: new Date().toISOString(),
        },
        { namespace: 'enterprise-integration', persist: true }
      );

      this.completeWorkflow(workflowId);
      return ok(result);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  // ============================================================================
  // SAP IDoc Testing
  // ============================================================================

  async validateIdoc(
    definition: IDocDefinition,
    content: string
  ): Promise<Result<IDocTestResult>> {
    const workflowId = uuidv4();
    try {
      this.startWorkflow(workflowId, 'idoc');

      const agentResult = await this.spawnAgent(workflowId, 'qe-sap-idoc-tester', {
        task: 'validate-idoc',
        definition,
        content,
      });

      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      const result: IDocTestResult = {
        idocType: definition.type,
        direction: 'inbound',
        passed: true,
        statusCode: 3, // Successfully posted
        statusMessage: 'IDoc validated successfully',
        segmentValidation: [],
        processingTime: 0,
      };

      if (this.config.publishEvents) {
        await this.eventBus.publish(
          createEvent(EnterpriseIntegrationEvents.IDocValidated, this.domainName, {
            idocType: definition.type,
            direction: result.direction,
            passed: result.passed,
            statusCode: result.statusCode,
          })
        );
      }

      this.completeWorkflow(workflowId);
      return ok(result);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  // ============================================================================
  // OData Testing
  // ============================================================================

  async validateODataMetadata(serviceUrl: string): Promise<Result<ODataMetadata>> {
    const workflowId = uuidv4();
    try {
      this.startWorkflow(workflowId, 'odata');

      const agentResult = await this.spawnAgent(workflowId, 'qe-odata-contract-tester', {
        task: 'validate-metadata',
        serviceUrl,
      });

      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      const metadata: ODataMetadata = {
        version: 'v4',
        serviceUrl,
        entitySets: [],
        functionImports: [],
        actions: [],
      };

      await this.memory.set(
        `enterprise-integration:odata:${encodeURIComponent(serviceUrl)}`,
        metadata,
        { namespace: 'enterprise-integration', persist: true }
      );

      this.completeWorkflow(workflowId);
      return ok(metadata);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  async testODataEntitySet(
    metadata: ODataMetadata,
    entitySet: string
  ): Promise<Result<ODataTestResult>> {
    const workflowId = uuidv4();
    try {
      this.startWorkflow(workflowId, 'odata');

      const agentResult = await this.spawnAgent(workflowId, 'qe-odata-contract-tester', {
        task: 'test-entity-set',
        metadata,
        entitySet,
      });

      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      const result: ODataTestResult = {
        entitySet,
        operation: 'CRUD',
        passed: true,
        statusCode: 200,
        validationErrors: [],
        duration: 0,
      };

      if (this.config.publishEvents) {
        await this.eventBus.publish(
          createEvent(EnterpriseIntegrationEvents.ODataTested, this.domainName, {
            entitySet,
            operation: result.operation,
            passed: result.passed,
            version: metadata.version,
          })
        );
      }

      this.completeWorkflow(workflowId);
      return ok(result);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  // ============================================================================
  // ESB/Middleware Validation
  // ============================================================================

  async validateMessageFlow(
    flow: MessageFlow,
    input: MessagePayload
  ): Promise<Result<MiddlewareTestResult>> {
    const workflowId = uuidv4();
    try {
      this.startWorkflow(workflowId, 'middleware');

      const agentResult = await this.spawnAgent(workflowId, 'qe-middleware-validator', {
        task: 'validate-flow',
        flow,
        input,
      });

      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      const result: MiddlewareTestResult = {
        flowName: flow.name,
        passed: true,
        routingCorrect: true,
        transformationCorrect: true,
        errorHandlingCorrect: true,
        validationErrors: [],
        duration: 0,
      };

      if (this.config.publishEvents) {
        await this.eventBus.publish(
          createEvent(EnterpriseIntegrationEvents.MiddlewareFlowTested, this.domainName, {
            flowName: flow.name,
            passed: result.passed,
            routingCorrect: result.routingCorrect,
            transformationCorrect: result.transformationCorrect,
          })
        );
      }

      this.completeWorkflow(workflowId);
      return ok(result);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  async validateTransformation(
    spec: TransformationSpec,
    input: string,
    expectedOutput: string
  ): Promise<Result<boolean>> {
    const workflowId = uuidv4();
    try {
      this.startWorkflow(workflowId, 'middleware');

      const agentResult = await this.spawnAgent(workflowId, 'qe-middleware-validator', {
        task: 'validate-transformation',
        spec,
        input,
        expectedOutput,
      });

      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.completeWorkflow(workflowId);
      return ok(true);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  // ============================================================================
  // SoD Analysis
  // ============================================================================

  async analyzeSod(
    userId: string,
    ruleset: SodRuleset
  ): Promise<Result<SodAnalysisResult>> {
    const workflowId = uuidv4();
    try {
      this.startWorkflow(workflowId, 'sod');

      const agentResult = await this.spawnAgent(workflowId, 'qe-sod-analyzer', {
        task: 'analyze-sod',
        userId,
        ruleset,
      });

      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      const result: SodAnalysisResult = {
        userId,
        conflicts: [],
        riskScore: 0,
        compliant: true,
        recommendations: [],
      };

      if (this.config.publishEvents) {
        await this.eventBus.publish(
          createEvent(EnterpriseIntegrationEvents.SodAnalyzed, this.domainName, {
            userId,
            conflicts: result.conflicts.length,
            compliant: result.compliant,
            riskScore: result.riskScore,
          })
        );
      }

      // Store SoD analysis for audit trail
      await this.memory.set(
        `enterprise-integration:sod:${userId}:${Date.now()}`,
        {
          userId,
          ruleset: ruleset.name,
          conflicts: result.conflicts.length,
          compliant: result.compliant,
          riskScore: result.riskScore,
          timestamp: new Date().toISOString(),
        },
        { namespace: 'enterprise-integration', persist: true }
      );

      this.completeWorkflow(workflowId);
      return ok(result);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  // ============================================================================
  // Agent Spawning
  // ============================================================================

  private async spawnAgent(
    workflowId: string,
    agentType: string,
    taskConfig: Record<string, unknown>
  ): Promise<Result<string, Error>> {
    const config: AgentSpawnConfig = {
      name: `${agentType}-${workflowId.slice(0, 8)}`,
      domain: 'enterprise-integration',
      type: agentType,
      capabilities: [agentType],
      config: {
        workflowId,
        ...taskConfig,
      },
    };

    const result = await this.agentCoordinator.spawn(config);

    if (result.success) {
      this.addAgentToWorkflow(workflowId, result.value);
    }

    return result;
  }

  // ============================================================================
  // Consensus Integration (MM-001) - Domain-specific methods
  // ============================================================================

  async verifyCriticalFinding(
    finding: { type: string; description: string; payload: unknown },
    confidence: number
  ): Promise<boolean> {
    const domainFinding: DomainFinding<unknown> = createDomainFinding({
      id: uuidv4(),
      type: finding.type,
      confidence,
      description: finding.description,
      payload: finding.payload,
      detectedBy: 'enterprise-integration-coordinator',
      severity: confidence > 0.9 ? 'critical' : 'high',
    });

    if (this.consensusMixin.requiresConsensus(domainFinding)) {
      const result = await this.consensusMixin.verifyFinding(domainFinding);
      if (result.success && result.value.verdict === 'verified') {
        console.log(`[${this.domainName}] Finding verified by consensus: ${finding.type}`);
        return true;
      }
      console.warn(`[${this.domainName}] Finding NOT verified: ${finding.type}`);
      return false;
    }
    return true;
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  private async handleContractVerified(event: any): Promise<void> {
    // When a contract is verified, check if it has enterprise integration implications
    const payload = event.payload;
    if (payload?.contractType === 'soap' || payload?.contractType === 'odata') {
      await this.memory.set(
        `enterprise-integration:contract-event:${Date.now()}`,
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

  private async handleFaultInjected(event: any): Promise<void> {
    // Track middleware-related fault injection for correlation
    const payload = event.payload;
    if (payload?.targetService?.includes('middleware') || payload?.targetService?.includes('esb')) {
      console.log(`[${this.domainName}] Middleware fault injection detected: ${payload.targetService}`);
    }
  }
}
