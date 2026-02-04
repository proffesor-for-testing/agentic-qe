/**
 * Agentic QE v3 - Enterprise Integration Domain
 * SOAP/WSDL, message broker, SAP RFC/BAPI/IDoc/OData,
 * ESB routing/transformation, and SoD analysis
 *
 * ADR-059: Enterprise Integration Testing Gap Closure
 *
 * This module exports the public API for the enterprise-integration domain.
 */

// ============================================================================
// Coordinator
// ============================================================================

export {
  EnterpriseIntegrationCoordinator,
  EnterpriseIntegrationEvents,
  type WorkflowStatus,
  type CoordinatorConfig,
} from './coordinator.js';

// ============================================================================
// Plugin
// ============================================================================

export {
  EnterpriseIntegrationPlugin,
  createEnterpriseIntegrationPlugin,
} from './plugin.js';

export type {
  EnterpriseIntegrationPluginConfig,
  EnterpriseIntegrationAPI,
  EnterpriseIntegrationExtendedAPI,
} from './plugin.js';

// ============================================================================
// Interfaces (Types Only)
// ============================================================================

export type {
  // Protocol Types
  MiddlewareProtocol,
  SapInterfaceType,
  MessageFormat,
  TransformationType,

  // SOAP/WSDL
  WsdlDefinition,
  WsdlService,
  SoapOperation,
  XsdSchema,
  SoapTestResult,
  SoapValidationError,

  // Message Broker
  MessageBrokerConfig,
  BrokerCredentials,
  MessageTestCase,
  MessagePayload,
  MessageOutcome,
  MessageTestResult,
  DlqTestResult,
  DlqError,

  // SAP RFC/BAPI
  RfcConnection,
  BapiCall,
  BapiTestResult,
  BapiReturn,

  // SAP IDoc
  IDocDefinition,
  IDocSegment,
  IDocField,
  IDocTestResult,
  SegmentValidation,
  FieldValidationError,

  // OData
  ODataMetadata,
  ODataEntitySet,
  ODataNavigationProperty,
  ODataFunctionImport,
  ODataAction,
  ODataParameter,
  ODataTestResult,
  ODataValidationError,

  // ESB/Middleware
  MessageFlow,
  FlowNode,
  FlowConnection,
  RoutingRule,
  TransformationSpec,
  MiddlewareTestResult,
  MiddlewareValidationError,

  // SoD Analysis
  SodRuleset,
  SodRule,
  SapFunction,
  AuthorizationObject,
  AuthorizationField,
  SodAnalysisResult,
  SodConflict,

  // Coordinator Interface
  IEnterpriseIntegrationCoordinator,

  // Domain Events
  SoapOperationTestedEvent,
  MessageFlowTestedEvent,
  BapiTestedEvent,
  IDocValidatedEvent,
  ODataTestedEvent,
  SodAnalyzedEvent,
  MiddlewareFlowTestedEvent,
} from './interfaces.js';
