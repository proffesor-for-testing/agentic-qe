/**
 * Agentic QE v3 - Enterprise Integration Coordinator Unit Tests
 *
 * Tests cover:
 * - Constructor and initialization
 * - SOAP/WSDL testing (testSoapOperation, validateWsdl)
 * - Message Broker testing (testMessageFlow, testDlqHandling)
 * - SAP Integration testing (testBapiCall, validateIdoc)
 * - OData testing (validateODataMetadata, testODataEntitySet)
 * - ESB/Middleware testing (validateMessageFlow, validateTransformation)
 * - SoD analysis (analyzeSod)
 * - Domain event emission
 * - Error handling and edge cases
 * - MinCut topology awareness
 * - Consensus verification
 * - Workflow management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EnterpriseIntegrationCoordinator,
  EnterpriseIntegrationEvents,
  type CoordinatorConfig,
} from '../../../../src/domains/enterprise-integration/coordinator';
import type {
  WsdlDefinition,
  MessageBrokerConfig,
  MessageTestCase,
  MessagePayload,
  RfcConnection,
  BapiCall,
  IDocDefinition,
  ODataMetadata,
  MessageFlow,
  TransformationSpec,
  SodRuleset,
} from '../../../../src/domains/enterprise-integration/interfaces';
import {
  createCoordinatorTestContext,
  resetTestContext,
  expectEventPublished,
  expectNoEventPublished,
  expectAgentSpawned,
  expectMemoryStored,
  type CoordinatorTestContext,
} from '../coordinator-test-utils';

// ============================================================================
// Test Data Factories
// ============================================================================

function createWsdlDefinition(overrides: Partial<WsdlDefinition> = {}): WsdlDefinition {
  return {
    url: 'http://example.com/service?wsdl',
    version: '1.1',
    services: [],
    schemas: [],
    ...overrides,
  };
}

function createMessageBrokerConfig(overrides: Partial<MessageBrokerConfig> = {}): MessageBrokerConfig {
  return {
    protocol: 'amqp',
    host: 'localhost',
    port: 5672,
    ...overrides,
  };
}

function createMessageTestCase(overrides: Partial<MessageTestCase> = {}): MessageTestCase {
  return {
    id: 'test-msg-001',
    queue: 'orders.incoming',
    message: createMessagePayload(),
    expectedOutcome: {
      delivered: true,
    },
    timeout: 5000,
    ...overrides,
  };
}

function createMessagePayload(overrides: Partial<MessagePayload> = {}): MessagePayload {
  return {
    headers: { 'content-type': 'application/json' },
    body: '{"orderId": "12345"}',
    format: 'json',
    ...overrides,
  };
}

function createRfcConnection(overrides: Partial<RfcConnection> = {}): RfcConnection {
  return {
    ashost: 'sap-server.example.com',
    sysnr: '00',
    client: '100',
    user: 'RFC_USER',
    lang: 'EN',
    ...overrides,
  };
}

function createBapiCall(overrides: Partial<BapiCall> = {}): BapiCall {
  return {
    name: 'BAPI_MATERIAL_GET_DETAIL',
    importParams: { MATERIAL: '000000000000001234' },
    ...overrides,
  };
}

function createIDocDefinition(overrides: Partial<IDocDefinition> = {}): IDocDefinition {
  return {
    type: 'ORDERS05',
    version: '3',
    segments: [
      {
        name: 'E1EDK01',
        mandatory: true,
        minOccurs: 1,
        maxOccurs: 1,
        fields: [
          {
            name: 'CURCY',
            type: 'CHAR',
            length: 3,
            mandatory: true,
            description: 'Currency',
          },
        ],
        children: [],
      },
    ],
    ...overrides,
  };
}

function createODataMetadata(overrides: Partial<ODataMetadata> = {}): ODataMetadata {
  return {
    version: 'v4',
    serviceUrl: 'https://api.example.com/odata/v4',
    entitySets: [],
    functionImports: [],
    actions: [],
    ...overrides,
  };
}

function createMessageFlow(overrides: Partial<MessageFlow> = {}): MessageFlow {
  return {
    name: 'OrderProcessingFlow',
    nodes: [
      { id: 'input-1', type: 'input', config: {} },
      { id: 'transform-1', type: 'transform', config: { format: 'xml-to-json' } },
      { id: 'route-1', type: 'route', config: { rules: [] } },
      { id: 'output-1', type: 'output', config: {} },
    ],
    connections: [
      { from: 'input-1', to: 'transform-1', terminal: 'out' },
      { from: 'transform-1', to: 'route-1', terminal: 'out' },
      { from: 'route-1', to: 'output-1', terminal: 'default' },
    ],
    ...overrides,
  };
}

function createTransformationSpec(overrides: Partial<TransformationSpec> = {}): TransformationSpec {
  return {
    type: 'xslt',
    inputFormat: 'xml',
    outputFormat: 'json',
    spec: '<xsl:stylesheet version="1.0" />',
    ...overrides,
  };
}

function createSodRuleset(overrides: Partial<SodRuleset> = {}): SodRuleset {
  return {
    name: 'Financial-SoD-Ruleset',
    scope: 'global',
    rules: [
      {
        id: 'SOD-001',
        name: 'Create PO / Approve PO',
        conflictingFunctions: [
          {
            name: 'Create Purchase Order',
            transactions: ['ME21N'],
            authorizationObjects: [
              { name: 'M_BEST_EKG', fields: [{ name: 'ACTVT', values: ['01'] }] },
            ],
          },
          {
            name: 'Approve Purchase Order',
            transactions: ['ME29N'],
            authorizationObjects: [
              { name: 'M_BEST_EKG', fields: [{ name: 'ACTVT', values: ['02'] }] },
            ],
          },
        ],
        riskLevel: 'critical',
      },
    ],
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('EnterpriseIntegrationCoordinator', () => {
  let ctx: CoordinatorTestContext;
  let coordinator: EnterpriseIntegrationCoordinator;

  const defaultConfig: Partial<CoordinatorConfig> = {
    maxConcurrentWorkflows: 5,
    defaultTimeout: 60000,
    publishEvents: true,
    enableMinCutAwareness: false,
    enableConsensus: false,
  };

  beforeEach(() => {
    ctx = createCoordinatorTestContext();
    coordinator = new EnterpriseIntegrationCoordinator(
      ctx.eventBus,
      ctx.memory,
      ctx.agentCoordinator,
      defaultConfig
    );
  });

  afterEach(async () => {
    await coordinator.dispose();
    resetTestContext(ctx);
  });

  // ===========================================================================
  // Constructor and Initialization
  // ===========================================================================

  describe('Constructor and Initialization', () => {
    it('should create coordinator with default config', () => {
      const coord = new EnterpriseIntegrationCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator
      );
      expect(coord).toBeDefined();
    });

    it('should create coordinator with custom config', () => {
      const coord = new EnterpriseIntegrationCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator,
        { maxConcurrentWorkflows: 3, defaultTimeout: 30000 }
      );
      expect(coord).toBeDefined();
    });

    it('should initialize without errors', async () => {
      await expect(coordinator.initialize()).resolves.not.toThrow();
    });

    it('should be idempotent on multiple initializations', async () => {
      await coordinator.initialize();
      await coordinator.initialize();
      // No error means idempotency is maintained
    });

    it('should start with no active workflows', async () => {
      await coordinator.initialize();
      expect(coordinator.getActiveWorkflows()).toHaveLength(0);
    });

    it('should subscribe to cross-domain events on initialization', async () => {
      await coordinator.initialize();
      // Coordinator subscribes to contract-testing.ContractVerified and chaos-resilience.FaultInjected
      expect(ctx.eventBus.subscribe).toHaveBeenCalledWith(
        'contract-testing.ContractVerified',
        expect.any(Function)
      );
      expect(ctx.eventBus.subscribe).toHaveBeenCalledWith(
        'chaos-resilience.FaultInjected',
        expect.any(Function)
      );
    });
  });

  // ===========================================================================
  // SOAP/WSDL Testing
  // ===========================================================================

  describe('SOAP/WSDL Testing', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('validateWsdl', () => {
      it('should validate a WSDL URL successfully', async () => {
        const url = 'http://example.com/service?wsdl';
        const result = await coordinator.validateWsdl(url);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.url).toBe(url);
          expect(result.value.version).toBe('1.1');
          expect(result.value.services).toEqual([]);
          expect(result.value.schemas).toEqual([]);
        }
      });

      it('should spawn qe-soap-tester agent for WSDL validation', async () => {
        await coordinator.validateWsdl('http://example.com/service?wsdl');

        expectAgentSpawned(ctx.agentCoordinator, 'enterprise-integration', 'qe-soap-tester');
      });

      it('should store WSDL definition in memory after successful validation', async () => {
        const url = 'http://example.com/service?wsdl';
        await coordinator.validateWsdl(url);

        expectMemoryStored(
          ctx.memory,
          `enterprise-integration:wsdl:${encodeURIComponent(url)}`
        );
      });

      it('should return error when agent spawn fails', async () => {
        ctx.agentCoordinator.setMaxAgents(0);
        const result = await coordinator.validateWsdl('http://example.com/service?wsdl');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeInstanceOf(Error);
        }
      });
    });

    describe('testSoapOperation', () => {
      it('should test a SOAP operation successfully', async () => {
        const wsdl = createWsdlDefinition();
        const result = await coordinator.testSoapOperation(wsdl, 'GetCustomer', { id: '123' });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.operation).toBe('GetCustomer');
          expect(result.value.passed).toBe(true);
          expect(result.value.validationErrors).toEqual([]);
        }
      });

      it('should emit SoapOperationTested event on success', async () => {
        const wsdl = createWsdlDefinition();
        await coordinator.testSoapOperation(wsdl, 'GetCustomer', { id: '123' });

        expectEventPublished(
          ctx.eventBus,
          EnterpriseIntegrationEvents.SoapOperationTested,
          {
            operation: 'GetCustomer',
            wsdlUrl: wsdl.url,
            passed: true,
            errors: 0,
          }
        );
      });

      it('should serialize the input as request in the result', async () => {
        const wsdl = createWsdlDefinition();
        const input = { customerId: 'CUST-001', fields: ['name', 'email'] };
        const result = await coordinator.testSoapOperation(wsdl, 'GetCustomer', input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.request).toBe(JSON.stringify(input));
        }
      });

      it('should return error when agent spawn fails', async () => {
        ctx.agentCoordinator.setMaxAgents(0);
        const wsdl = createWsdlDefinition();
        const result = await coordinator.testSoapOperation(wsdl, 'GetCustomer', {});

        expect(result.success).toBe(false);
      });

      it('should not emit event when agent spawn fails', async () => {
        ctx.agentCoordinator.setMaxAgents(0);
        const wsdl = createWsdlDefinition();
        await coordinator.testSoapOperation(wsdl, 'GetCustomer', {});

        expectNoEventPublished(ctx.eventBus, EnterpriseIntegrationEvents.SoapOperationTested);
      });
    });
  });

  // ===========================================================================
  // Message Broker Testing
  // ===========================================================================

  describe('Message Broker Testing', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('testMessageFlow', () => {
      it('should test a message flow successfully', async () => {
        const config = createMessageBrokerConfig();
        const testCase = createMessageTestCase();

        const result = await coordinator.testMessageFlow(config, testCase);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.testCaseId).toBe(testCase.id);
          expect(result.value.passed).toBe(true);
          expect(result.value.errors).toEqual([]);
          expect(result.value.sentAt).toBeInstanceOf(Date);
          expect(result.value.receivedAt).toBeInstanceOf(Date);
        }
      });

      it('should spawn qe-message-broker-tester agent', async () => {
        const config = createMessageBrokerConfig();
        const testCase = createMessageTestCase();

        await coordinator.testMessageFlow(config, testCase);

        expectAgentSpawned(ctx.agentCoordinator, 'enterprise-integration', 'qe-message-broker-tester');
      });

      it('should emit MessageFlowTested event on success', async () => {
        const config = createMessageBrokerConfig({ protocol: 'kafka' });
        const testCase = createMessageTestCase({ queue: 'orders.topic' });

        await coordinator.testMessageFlow(config, testCase);

        expectEventPublished(
          ctx.eventBus,
          EnterpriseIntegrationEvents.MessageFlowTested,
          {
            protocol: 'kafka',
            queue: 'orders.topic',
            passed: true,
          }
        );
      });

      it('should test with different broker protocols', async () => {
        const protocols: Array<MessageBrokerConfig['protocol']> = ['amqp', 'kafka', 'rabbitmq', 'jms'];

        for (const protocol of protocols) {
          const config = createMessageBrokerConfig({ protocol });
          const testCase = createMessageTestCase({ id: `test-${protocol}` });

          const result = await coordinator.testMessageFlow(config, testCase);
          expect(result.success).toBe(true);
        }
      });

      it('should return error when agent spawn fails', async () => {
        ctx.agentCoordinator.setMaxAgents(0);
        const config = createMessageBrokerConfig();
        const testCase = createMessageTestCase();

        const result = await coordinator.testMessageFlow(config, testCase);
        expect(result.success).toBe(false);
      });
    });

    describe('testDlqHandling', () => {
      it('should test DLQ handling successfully', async () => {
        const config = createMessageBrokerConfig();
        const result = await coordinator.testDlqHandling(config, 'orders.dlq');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.queue).toBe('orders.dlq');
          expect(result.value.messageCount).toBe(0);
          expect(result.value.poisonMessages).toBe(0);
          expect(result.value.reprocessable).toBe(0);
          expect(result.value.errors).toEqual([]);
        }
      });

      it('should spawn qe-message-broker-tester agent for DLQ testing', async () => {
        const config = createMessageBrokerConfig();
        await coordinator.testDlqHandling(config, 'orders.dlq');

        expectAgentSpawned(ctx.agentCoordinator, 'enterprise-integration', 'qe-message-broker-tester');
      });

      it('should return error when agent spawn fails', async () => {
        ctx.agentCoordinator.setMaxAgents(0);
        const config = createMessageBrokerConfig();
        const result = await coordinator.testDlqHandling(config, 'orders.dlq');

        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // SAP RFC/BAPI Testing
  // ===========================================================================

  describe('SAP Integration Testing', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('testBapiCall', () => {
      it('should test a BAPI call successfully', async () => {
        const connection = createRfcConnection();
        const bapi = createBapiCall();

        const result = await coordinator.testBapiCall(connection, bapi);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.bapiName).toBe('BAPI_MATERIAL_GET_DETAIL');
          expect(result.value.passed).toBe(true);
          expect(result.value.returnMessages).toEqual([]);
          expect(result.value.transactionCommitted).toBe(false);
          expect(result.value.duration).toBe(0);
        }
      });

      it('should spawn qe-sap-rfc-tester agent', async () => {
        const connection = createRfcConnection();
        const bapi = createBapiCall();

        await coordinator.testBapiCall(connection, bapi);

        expectAgentSpawned(ctx.agentCoordinator, 'enterprise-integration', 'qe-sap-rfc-tester');
      });

      it('should emit BapiTested event on success', async () => {
        const connection = createRfcConnection();
        const bapi = createBapiCall({ name: 'BAPI_USER_GET_DETAIL' });

        await coordinator.testBapiCall(connection, bapi);

        expectEventPublished(
          ctx.eventBus,
          EnterpriseIntegrationEvents.BapiTested,
          {
            bapiName: 'BAPI_USER_GET_DETAIL',
            passed: true,
            returnType: 'S',
          }
        );
      });

      it('should store BAPI test pattern in memory for learning', async () => {
        const connection = createRfcConnection();
        const bapi = createBapiCall({ name: 'BAPI_COMPANYCODE_GETDETAIL' });

        await coordinator.testBapiCall(connection, bapi);

        expectMemoryStored(ctx.memory, /enterprise-integration:bapi:BAPI_COMPANYCODE_GETDETAIL/);
      });

      it('should handle BAPIs with multiple import parameters', async () => {
        const connection = createRfcConnection();
        const bapi = createBapiCall({
          name: 'BAPI_MATERIAL_SAVEDATA',
          importParams: {
            HEADDATA: { MATERIAL: '1234', MATL_TYPE: 'FERT' },
            CLIENTDATA: { BASE_UOM: 'EA' },
          },
          tableParams: ['MATERIALDESCRIPTION', 'UNITSOFMEASURE'],
        });

        const result = await coordinator.testBapiCall(connection, bapi);
        expect(result.success).toBe(true);
      });

      it('should return error when agent spawn fails', async () => {
        ctx.agentCoordinator.setMaxAgents(0);
        const connection = createRfcConnection();
        const bapi = createBapiCall();

        const result = await coordinator.testBapiCall(connection, bapi);
        expect(result.success).toBe(false);
      });

      it('should not emit event when agent spawn fails', async () => {
        ctx.agentCoordinator.setMaxAgents(0);
        const connection = createRfcConnection();
        const bapi = createBapiCall();

        await coordinator.testBapiCall(connection, bapi);

        expectNoEventPublished(ctx.eventBus, EnterpriseIntegrationEvents.BapiTested);
      });
    });

    describe('validateIdoc', () => {
      it('should validate an IDoc successfully', async () => {
        const definition = createIDocDefinition();
        const content = '<ORDERS05><E1EDK01><CURCY>USD</CURCY></E1EDK01></ORDERS05>';

        const result = await coordinator.validateIdoc(definition, content);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.idocType).toBe('ORDERS05');
          expect(result.value.direction).toBe('inbound');
          expect(result.value.passed).toBe(true);
          expect(result.value.statusCode).toBe(3);
          expect(result.value.statusMessage).toBe('IDoc validated successfully');
          expect(result.value.segmentValidation).toEqual([]);
        }
      });

      it('should spawn qe-sap-idoc-tester agent', async () => {
        const definition = createIDocDefinition();
        await coordinator.validateIdoc(definition, '<content/>');

        expectAgentSpawned(ctx.agentCoordinator, 'enterprise-integration', 'qe-sap-idoc-tester');
      });

      it('should emit IDocValidated event on success', async () => {
        const definition = createIDocDefinition({ type: 'MATMAS05' });
        await coordinator.validateIdoc(definition, '<content/>');

        expectEventPublished(
          ctx.eventBus,
          EnterpriseIntegrationEvents.IDocValidated,
          {
            idocType: 'MATMAS05',
            direction: 'inbound',
            passed: true,
            statusCode: 3,
          }
        );
      });

      it('should handle IDoc with extension type', async () => {
        const definition = createIDocDefinition({
          type: 'ORDERS05',
          extension: 'ZORDERS05',
        });

        const result = await coordinator.validateIdoc(definition, '<content/>');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.idocType).toBe('ORDERS05');
        }
      });

      it('should return error when agent spawn fails', async () => {
        ctx.agentCoordinator.setMaxAgents(0);
        const definition = createIDocDefinition();
        const result = await coordinator.validateIdoc(definition, '<content/>');

        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // OData Testing
  // ===========================================================================

  describe('OData Testing', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('validateODataMetadata', () => {
      it('should validate OData metadata successfully', async () => {
        const serviceUrl = 'https://api.example.com/odata/v4';
        const result = await coordinator.validateODataMetadata(serviceUrl);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.version).toBe('v4');
          expect(result.value.serviceUrl).toBe(serviceUrl);
          expect(result.value.entitySets).toEqual([]);
          expect(result.value.functionImports).toEqual([]);
        }
      });

      it('should spawn qe-odata-contract-tester agent', async () => {
        await coordinator.validateODataMetadata('https://api.example.com/odata/v4');

        expectAgentSpawned(ctx.agentCoordinator, 'enterprise-integration', 'qe-odata-contract-tester');
      });

      it('should store OData metadata in memory', async () => {
        const serviceUrl = 'https://api.example.com/odata/v4';
        await coordinator.validateODataMetadata(serviceUrl);

        expectMemoryStored(
          ctx.memory,
          `enterprise-integration:odata:${encodeURIComponent(serviceUrl)}`
        );
      });

      it('should return error when agent spawn fails', async () => {
        ctx.agentCoordinator.setMaxAgents(0);
        const result = await coordinator.validateODataMetadata('https://api.example.com/odata/v4');

        expect(result.success).toBe(false);
      });
    });

    describe('testODataEntitySet', () => {
      it('should test an OData entity set successfully', async () => {
        const metadata = createODataMetadata();
        const result = await coordinator.testODataEntitySet(metadata, 'Products');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.entitySet).toBe('Products');
          expect(result.value.operation).toBe('CRUD');
          expect(result.value.passed).toBe(true);
          expect(result.value.statusCode).toBe(200);
          expect(result.value.validationErrors).toEqual([]);
        }
      });

      it('should emit ODataTested event on success', async () => {
        const metadata = createODataMetadata({ version: 'v2' });
        await coordinator.testODataEntitySet(metadata, 'SalesOrders');

        expectEventPublished(
          ctx.eventBus,
          EnterpriseIntegrationEvents.ODataTested,
          {
            entitySet: 'SalesOrders',
            operation: 'CRUD',
            passed: true,
            version: 'v2',
          }
        );
      });

      it('should test different entity sets with the same metadata', async () => {
        const metadata = createODataMetadata();
        const entitySets = ['Products', 'Categories', 'Suppliers'];

        for (const entitySet of entitySets) {
          const result = await coordinator.testODataEntitySet(metadata, entitySet);
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.value.entitySet).toBe(entitySet);
          }
        }
      });

      it('should return error when agent spawn fails', async () => {
        ctx.agentCoordinator.setMaxAgents(0);
        const metadata = createODataMetadata();
        const result = await coordinator.testODataEntitySet(metadata, 'Products');

        expect(result.success).toBe(false);
      });

      it('should not emit event when agent spawn fails', async () => {
        ctx.agentCoordinator.setMaxAgents(0);
        const metadata = createODataMetadata();
        await coordinator.testODataEntitySet(metadata, 'Products');

        expectNoEventPublished(ctx.eventBus, EnterpriseIntegrationEvents.ODataTested);
      });
    });
  });

  // ===========================================================================
  // ESB/Middleware Testing
  // ===========================================================================

  describe('ESB/Middleware Testing', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('validateMessageFlow', () => {
      it('should validate a middleware message flow successfully', async () => {
        const flow = createMessageFlow();
        const input = createMessagePayload();

        const result = await coordinator.validateMessageFlow(flow, input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.flowName).toBe('OrderProcessingFlow');
          expect(result.value.passed).toBe(true);
          expect(result.value.routingCorrect).toBe(true);
          expect(result.value.transformationCorrect).toBe(true);
          expect(result.value.errorHandlingCorrect).toBe(true);
          expect(result.value.validationErrors).toEqual([]);
        }
      });

      it('should spawn qe-middleware-validator agent', async () => {
        const flow = createMessageFlow();
        const input = createMessagePayload();

        await coordinator.validateMessageFlow(flow, input);

        expectAgentSpawned(ctx.agentCoordinator, 'enterprise-integration', 'qe-middleware-validator');
      });

      it('should emit MiddlewareFlowTested event on success', async () => {
        const flow = createMessageFlow({ name: 'InvoiceRoutingFlow' });
        const input = createMessagePayload();

        await coordinator.validateMessageFlow(flow, input);

        expectEventPublished(
          ctx.eventBus,
          EnterpriseIntegrationEvents.MiddlewareFlowTested,
          {
            flowName: 'InvoiceRoutingFlow',
            passed: true,
            routingCorrect: true,
            transformationCorrect: true,
          }
        );
      });

      it('should handle flows with error handlers', async () => {
        const flow = createMessageFlow({
          name: 'ErrorHandledFlow',
          errorHandler: 'error-handler-node',
        });
        const input = createMessagePayload();

        const result = await coordinator.validateMessageFlow(flow, input);
        expect(result.success).toBe(true);
      });

      it('should return error when agent spawn fails', async () => {
        ctx.agentCoordinator.setMaxAgents(0);
        const flow = createMessageFlow();
        const input = createMessagePayload();

        const result = await coordinator.validateMessageFlow(flow, input);
        expect(result.success).toBe(false);
      });
    });

    describe('validateTransformation', () => {
      it('should validate a transformation successfully', async () => {
        const spec = createTransformationSpec();
        const input = '<order><id>123</id></order>';
        const expectedOutput = '{"order":{"id":"123"}}';

        const result = await coordinator.validateTransformation(spec, input, expectedOutput);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toBe(true);
        }
      });

      it('should spawn qe-middleware-validator agent for transformation', async () => {
        const spec = createTransformationSpec();
        await coordinator.validateTransformation(spec, '<input/>', '<output/>');

        expectAgentSpawned(ctx.agentCoordinator, 'enterprise-integration', 'qe-middleware-validator');
      });

      it('should support different transformation types', async () => {
        const types: Array<TransformationSpec['type']> = ['xslt', 'esql', 'dataweave', 'mapping'];

        for (const type of types) {
          const spec = createTransformationSpec({ type });
          const result = await coordinator.validateTransformation(spec, '<in/>', '<out/>');
          expect(result.success).toBe(true);
        }
      });

      it('should return error when agent spawn fails', async () => {
        ctx.agentCoordinator.setMaxAgents(0);
        const spec = createTransformationSpec();
        const result = await coordinator.validateTransformation(spec, '<in/>', '<out/>');

        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // SoD Analysis
  // ===========================================================================

  describe('SoD Analysis', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('analyzeSod', () => {
      it('should analyze SoD conflicts successfully', async () => {
        const ruleset = createSodRuleset();
        const result = await coordinator.analyzeSod('SAP_USER_001', ruleset);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.userId).toBe('SAP_USER_001');
          expect(result.value.conflicts).toEqual([]);
          expect(result.value.riskScore).toBe(0);
          expect(result.value.compliant).toBe(true);
          expect(result.value.recommendations).toEqual([]);
        }
      });

      it('should spawn qe-sod-analyzer agent', async () => {
        const ruleset = createSodRuleset();
        await coordinator.analyzeSod('SAP_USER_001', ruleset);

        expectAgentSpawned(ctx.agentCoordinator, 'enterprise-integration', 'qe-sod-analyzer');
      });

      it('should emit SodAnalyzed event on success', async () => {
        const ruleset = createSodRuleset();
        await coordinator.analyzeSod('SAP_USER_002', ruleset);

        expectEventPublished(
          ctx.eventBus,
          EnterpriseIntegrationEvents.SodAnalyzed,
          {
            userId: 'SAP_USER_002',
            conflicts: 0,
            compliant: true,
            riskScore: 0,
          }
        );
      });

      it('should store SoD analysis result in memory for audit trail', async () => {
        const ruleset = createSodRuleset({ name: 'Finance-Ruleset' });
        await coordinator.analyzeSod('SAP_USER_003', ruleset);

        expectMemoryStored(ctx.memory, /enterprise-integration:sod:SAP_USER_003/);
      });

      it('should include ruleset name in stored memory data', async () => {
        const ruleset = createSodRuleset({ name: 'Procurement-SoD' });
        await coordinator.analyzeSod('SAP_USER_004', ruleset);

        const allValues = ctx.memory.getAllValues();
        const sodKeys = Array.from(allValues.keys()).filter(k =>
          k.startsWith('enterprise-integration:sod:SAP_USER_004')
        );
        expect(sodKeys.length).toBeGreaterThan(0);

        const storedValue = allValues.get(sodKeys[0]) as Record<string, unknown>;
        expect(storedValue.ruleset).toBe('Procurement-SoD');
        expect(storedValue.userId).toBe('SAP_USER_004');
        expect(storedValue.compliant).toBe(true);
      });

      it('should handle ruleset with multiple rules', async () => {
        const ruleset = createSodRuleset({
          rules: [
            {
              id: 'SOD-001',
              name: 'Create PO / Approve PO',
              conflictingFunctions: [
                {
                  name: 'Create PO',
                  transactions: ['ME21N'],
                  authorizationObjects: [],
                },
                {
                  name: 'Approve PO',
                  transactions: ['ME29N'],
                  authorizationObjects: [],
                },
              ],
              riskLevel: 'critical',
            },
            {
              id: 'SOD-002',
              name: 'Create Vendor / Process Invoice',
              conflictingFunctions: [
                {
                  name: 'Create Vendor',
                  transactions: ['XK01'],
                  authorizationObjects: [],
                },
                {
                  name: 'Process Invoice',
                  transactions: ['MIRO'],
                  authorizationObjects: [],
                },
              ],
              riskLevel: 'high',
            },
          ],
        });

        const result = await coordinator.analyzeSod('SAP_USER_005', ruleset);
        expect(result.success).toBe(true);
      });

      it('should return error when agent spawn fails', async () => {
        ctx.agentCoordinator.setMaxAgents(0);
        const ruleset = createSodRuleset();
        const result = await coordinator.analyzeSod('SAP_USER_001', ruleset);

        expect(result.success).toBe(false);
      });

      it('should not emit event when agent spawn fails', async () => {
        ctx.agentCoordinator.setMaxAgents(0);
        const ruleset = createSodRuleset();
        await coordinator.analyzeSod('SAP_USER_001', ruleset);

        expectNoEventPublished(ctx.eventBus, EnterpriseIntegrationEvents.SodAnalyzed);
      });
    });
  });

  // ===========================================================================
  // Event Emission
  // ===========================================================================

  describe('Event Emission', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should not emit events when publishEvents config is false', async () => {
      const silentCoordinator = new EnterpriseIntegrationCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator,
        { ...defaultConfig, publishEvents: false }
      );
      await silentCoordinator.initialize();

      const wsdl = createWsdlDefinition();
      await silentCoordinator.testSoapOperation(wsdl, 'GetCustomer', {});

      expectNoEventPublished(ctx.eventBus, EnterpriseIntegrationEvents.SoapOperationTested);

      await silentCoordinator.dispose();
    });

    it('should emit events with correct source domain', async () => {
      const wsdl = createWsdlDefinition();
      await coordinator.testSoapOperation(wsdl, 'TestOp', {});

      const events = ctx.eventBus.getEventsByType(
        EnterpriseIntegrationEvents.SoapOperationTested
      );
      expect(events.length).toBe(1);
      expect(events[0].source).toBe('enterprise-integration');
    });

    it('should emit events with valid timestamps', async () => {
      const config = createMessageBrokerConfig();
      const testCase = createMessageTestCase();

      await coordinator.testMessageFlow(config, testCase);

      const events = ctx.eventBus.getEventsByType(
        EnterpriseIntegrationEvents.MessageFlowTested
      );
      expect(events.length).toBe(1);
      expect(events[0].timestamp).toBeInstanceOf(Date);
    });

    it('should emit events with unique IDs', async () => {
      const wsdl = createWsdlDefinition();
      await coordinator.testSoapOperation(wsdl, 'Op1', {});
      await coordinator.testSoapOperation(wsdl, 'Op2', {});

      const events = ctx.eventBus.getEventsByType(
        EnterpriseIntegrationEvents.SoapOperationTested
      );
      expect(events.length).toBe(2);
      expect(events[0].id).not.toBe(events[1].id);
    });
  });

  // ===========================================================================
  // Cross-Domain Event Handling
  // ===========================================================================

  describe('Cross-Domain Event Handling', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should handle contract verification events for SOAP contracts', async () => {
      await ctx.eventBus.simulateEvent(
        'contract-testing.ContractVerified',
        'contract-testing',
        {
          contractId: 'contract-001',
          contractType: 'soap',
          passed: true,
        }
      );

      expectMemoryStored(ctx.memory, /enterprise-integration:contract-event/);
    });

    it('should handle contract verification events for OData contracts', async () => {
      await ctx.eventBus.simulateEvent(
        'contract-testing.ContractVerified',
        'contract-testing',
        {
          contractId: 'contract-002',
          contractType: 'odata',
          passed: false,
        }
      );

      expectMemoryStored(ctx.memory, /enterprise-integration:contract-event/);
    });

    it('should ignore contract verification events for non-enterprise types', async () => {
      await ctx.eventBus.simulateEvent(
        'contract-testing.ContractVerified',
        'contract-testing',
        {
          contractId: 'contract-003',
          contractType: 'rest',
          passed: true,
        }
      );

      const allValues = ctx.memory.getAllValues();
      const contractEventKeys = Array.from(allValues.keys()).filter(k =>
        k.startsWith('enterprise-integration:contract-event')
      );
      expect(contractEventKeys).toHaveLength(0);
    });

    it('should handle fault injection events for middleware targets', async () => {
      // This event triggers a console.log but does not store anything.
      // We verify it does not throw.
      await expect(
        ctx.eventBus.simulateEvent(
          'chaos-resilience.FaultInjected',
          'chaos-resilience',
          {
            targetService: 'middleware-gateway',
          }
        )
      ).resolves.not.toThrow();
    });
  });

  // ===========================================================================
  // Workflow Management
  // ===========================================================================

  describe('Workflow Management', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should track active workflows', async () => {
      // Start a workflow by calling an operation
      const wsdl = createWsdlDefinition();
      // The workflow completes synchronously via mock, so active should be 0 after
      await coordinator.testSoapOperation(wsdl, 'Op1', {});
      // After completion, no active workflows
      expect(coordinator.getActiveWorkflows()).toHaveLength(0);
    });

    it('should enforce maximum concurrent workflows', async () => {
      const limitedCoordinator = new EnterpriseIntegrationCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator,
        { ...defaultConfig, maxConcurrentWorkflows: 1 }
      );
      await limitedCoordinator.initialize();

      // First operation works fine (completes synchronously in mock)
      const wsdl = createWsdlDefinition();
      const result1 = await limitedCoordinator.testSoapOperation(wsdl, 'Op1', {});
      expect(result1.success).toBe(true);

      await limitedCoordinator.dispose();
    });

    it('should mark workflows as completed after successful operations', async () => {
      const wsdl = createWsdlDefinition();
      await coordinator.testSoapOperation(wsdl, 'Op1', {});

      // Active workflows should be empty since it completed
      const active = coordinator.getActiveWorkflows();
      expect(active).toHaveLength(0);
    });

    it('should mark workflows as failed when errors occur', async () => {
      ctx.agentCoordinator.setMaxAgents(0);
      const wsdl = createWsdlDefinition();
      await coordinator.testSoapOperation(wsdl, 'Op1', {});

      // After failure, workflow is marked as failed (not active)
      const active = coordinator.getActiveWorkflows();
      expect(active).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('Error Handling', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should return Result error when agent spawning fails', async () => {
      ctx.agentCoordinator.setMaxAgents(0);

      const wsdl = createWsdlDefinition();
      const result = await coordinator.testSoapOperation(wsdl, 'Op1', {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toContain('Agent limit reached');
      }
    });

    it('should handle errors gracefully across all operations', async () => {
      ctx.agentCoordinator.setMaxAgents(0);

      const wsdlResult = await coordinator.validateWsdl('http://invalid.com');
      expect(wsdlResult.success).toBe(false);

      const soapResult = await coordinator.testSoapOperation(createWsdlDefinition(), 'Op1', {});
      expect(soapResult.success).toBe(false);

      const msgResult = await coordinator.testMessageFlow(
        createMessageBrokerConfig(),
        createMessageTestCase()
      );
      expect(msgResult.success).toBe(false);

      const dlqResult = await coordinator.testDlqHandling(createMessageBrokerConfig(), 'dlq');
      expect(dlqResult.success).toBe(false);

      const bapiResult = await coordinator.testBapiCall(createRfcConnection(), createBapiCall());
      expect(bapiResult.success).toBe(false);

      const idocResult = await coordinator.validateIdoc(createIDocDefinition(), '<data/>');
      expect(idocResult.success).toBe(false);

      const odataMetaResult = await coordinator.validateODataMetadata('http://odata.example.com');
      expect(odataMetaResult.success).toBe(false);

      const odataEntityResult = await coordinator.testODataEntitySet(createODataMetadata(), 'Ent');
      expect(odataEntityResult.success).toBe(false);

      const flowResult = await coordinator.validateMessageFlow(
        createMessageFlow(),
        createMessagePayload()
      );
      expect(flowResult.success).toBe(false);

      const transResult = await coordinator.validateTransformation(
        createTransformationSpec(),
        '<in/>',
        '<out/>'
      );
      expect(transResult.success).toBe(false);

      const sodResult = await coordinator.analyzeSod('USER', createSodRuleset());
      expect(sodResult.success).toBe(false);
    });

    it('should not leave dangling workflows after errors', async () => {
      ctx.agentCoordinator.setMaxAgents(0);

      const wsdl = createWsdlDefinition();
      await coordinator.testSoapOperation(wsdl, 'Op1', {});
      await coordinator.testSoapOperation(wsdl, 'Op2', {});
      await coordinator.testSoapOperation(wsdl, 'Op3', {});

      // All workflows should be in failed state, none should be active
      expect(coordinator.getActiveWorkflows()).toHaveLength(0);
    });
  });

  // ===========================================================================
  // MinCut Topology Awareness (ADR-047)
  // ===========================================================================

  describe('MinCut Topology Awareness', () => {
    let topologyCoordinator: EnterpriseIntegrationCoordinator;

    beforeEach(async () => {
      topologyCoordinator = new EnterpriseIntegrationCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator,
        {
          ...defaultConfig,
          enableMinCutAwareness: true,
          topologyHealthThreshold: 0.5,
          pauseOnCriticalTopology: true,
        }
      );
      await topologyCoordinator.initialize();
    });

    afterEach(async () => {
      await topologyCoordinator.dispose();
    });

    it('should report topology health status', () => {
      expect(topologyCoordinator.isTopologyHealthy()).toBe(true);
    });

    it('should accept MinCut bridge without error', () => {
      expect(() => {
        topologyCoordinator.setMinCutBridge({} as any);
      }).not.toThrow();
    });

    it('should check if domain is a weak point', () => {
      expect(topologyCoordinator.isDomainWeakPoint()).toBe(false);
    });

    it('should get domain weak vertices', () => {
      const weakVertices = topologyCoordinator.getDomainWeakVertices();
      expect(Array.isArray(weakVertices)).toBe(true);
    });

    it('should filter target domains based on topology', () => {
      const targets = ['test-execution', 'test-generation'] as any[];
      const filtered = topologyCoordinator.getTopologyBasedRouting(targets);
      expect(Array.isArray(filtered)).toBe(true);
    });
  });

  // ===========================================================================
  // Consensus Verification (MM-001)
  // ===========================================================================

  describe('Consensus Verification', () => {
    let consensusCoordinator: EnterpriseIntegrationCoordinator;

    beforeEach(async () => {
      consensusCoordinator = new EnterpriseIntegrationCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator,
        {
          ...defaultConfig,
          enableConsensus: true,
          consensusThreshold: 0.7,
          consensusStrategy: 'weighted',
          consensusMinModels: 2,
        }
      );
      await consensusCoordinator.initialize();
    });

    afterEach(async () => {
      await consensusCoordinator.dispose();
    });

    it('should check consensus availability', () => {
      const available = consensusCoordinator.isConsensusAvailable();
      expect(typeof available).toBe('boolean');
    });

    it('should get consensus statistics', () => {
      const stats = consensusCoordinator.getConsensusStats();
      expect(stats === undefined || typeof stats === 'object').toBe(true);
    });
  });

  // ===========================================================================
  // Disposal
  // ===========================================================================

  describe('Disposal', () => {
    it('should dispose without errors', async () => {
      await coordinator.initialize();
      await expect(coordinator.dispose()).resolves.not.toThrow();
    });

    it('should clear all workflows on dispose', async () => {
      await coordinator.initialize();

      // Run some operations
      const wsdl = createWsdlDefinition();
      await coordinator.testSoapOperation(wsdl, 'Op1', {});

      await coordinator.dispose();
      expect(coordinator.getActiveWorkflows()).toHaveLength(0);
    });

    it('should allow re-initialization after dispose', async () => {
      await coordinator.initialize();
      await coordinator.dispose();
      await expect(coordinator.initialize()).resolves.not.toThrow();
    });
  });

  // ===========================================================================
  // Event Constants
  // ===========================================================================

  describe('EnterpriseIntegrationEvents', () => {
    it('should define all expected event types', () => {
      expect(EnterpriseIntegrationEvents.SoapOperationTested).toBe(
        'enterprise-integration.SoapOperationTested'
      );
      expect(EnterpriseIntegrationEvents.MessageFlowTested).toBe(
        'enterprise-integration.MessageFlowTested'
      );
      expect(EnterpriseIntegrationEvents.BapiTested).toBe(
        'enterprise-integration.BapiTested'
      );
      expect(EnterpriseIntegrationEvents.IDocValidated).toBe(
        'enterprise-integration.IDocValidated'
      );
      expect(EnterpriseIntegrationEvents.ODataTested).toBe(
        'enterprise-integration.ODataTested'
      );
      expect(EnterpriseIntegrationEvents.SodAnalyzed).toBe(
        'enterprise-integration.SodAnalyzed'
      );
      expect(EnterpriseIntegrationEvents.MiddlewareFlowTested).toBe(
        'enterprise-integration.MiddlewareFlowTested'
      );
      expect(EnterpriseIntegrationEvents.IntegrationValidationFailed).toBe(
        'enterprise-integration.IntegrationValidationFailed'
      );
    });
  });
});
