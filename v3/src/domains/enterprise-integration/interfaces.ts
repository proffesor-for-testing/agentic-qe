/**
 * Agentic QE v3 - Enterprise Integration Domain Interfaces
 *
 * Bounded Context: Enterprise Integration
 * Responsibility: SOAP/WSDL, message broker, SAP RFC/BAPI/IDoc/OData,
 *                 ESB routing/transformation, WMS, and observability testing
 *
 * ADR-059: Enterprise Integration Testing Gap Closure
 */

import type { Result } from '../../shared/types/index.js';

// ============================================================================
// Protocol Types
// ============================================================================

export type MiddlewareProtocol = 'soap' | 'jms' | 'amqp' | 'mqtt' | 'kafka' | 'ibm-mq' | 'rabbitmq';

export type SapInterfaceType = 'rfc' | 'bapi' | 'idoc' | 'odata-v2' | 'odata-v4' | 'fiori';

export type MessageFormat = 'xml' | 'json' | 'flat-file' | 'edi-x12' | 'edifact' | 'idoc' | 'csv';

export type TransformationType = 'xslt' | 'esql' | 'dataweave' | 'mapping' | 'custom';

// ============================================================================
// SOAP/WSDL Testing
// ============================================================================

export interface WsdlDefinition {
  readonly url: string;
  readonly version: '1.1' | '1.2';
  readonly services: WsdlService[];
  readonly schemas: XsdSchema[];
}

export interface WsdlService {
  readonly name: string;
  readonly port: string;
  readonly binding: string;
  readonly operations: SoapOperation[];
}

export interface SoapOperation {
  readonly name: string;
  readonly input: string;
  readonly output: string;
  readonly faults: string[];
  readonly action?: string;
}

export interface XsdSchema {
  readonly namespace: string;
  readonly types: string[];
  readonly content: string;
}

export interface SoapTestResult {
  readonly operation: string;
  readonly passed: boolean;
  readonly request: string;
  readonly response: string;
  readonly validationErrors: SoapValidationError[];
  readonly duration: number;
}

export interface SoapValidationError {
  readonly type: 'schema' | 'envelope' | 'header' | 'fault' | 'security';
  readonly path: string;
  readonly message: string;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
}

// ============================================================================
// Message Broker Testing
// ============================================================================

export interface MessageBrokerConfig {
  readonly protocol: MiddlewareProtocol;
  readonly host: string;
  readonly port: number;
  readonly credentials?: BrokerCredentials;
  readonly options?: Record<string, unknown>;
}

export interface BrokerCredentials {
  readonly username: string;
  readonly password: string;
  readonly channel?: string; // IBM MQ specific
  readonly queueManager?: string; // IBM MQ specific
}

export interface MessageTestCase {
  readonly id: string;
  readonly queue: string;
  readonly message: MessagePayload;
  readonly expectedOutcome: MessageOutcome;
  readonly timeout: number;
}

export interface MessagePayload {
  readonly headers: Record<string, string>;
  readonly body: string;
  readonly format: MessageFormat;
  readonly correlationId?: string;
  readonly replyTo?: string;
  readonly priority?: number;
}

export interface MessageOutcome {
  readonly delivered: boolean;
  readonly transformedTo?: MessageFormat;
  readonly routedTo?: string;
  readonly dlq?: boolean;
  readonly retryCount?: number;
}

export interface MessageTestResult {
  readonly testCaseId: string;
  readonly passed: boolean;
  readonly sentAt: Date;
  readonly receivedAt?: Date;
  readonly latency?: number;
  readonly actualOutcome: MessageOutcome;
  readonly errors: string[];
}

export interface DlqTestResult {
  readonly queue: string;
  readonly messageCount: number;
  readonly poisonMessages: number;
  readonly reprocessable: number;
  readonly errors: DlqError[];
}

export interface DlqError {
  readonly messageId: string;
  readonly reason: string;
  readonly retryCount: number;
  readonly lastAttempt: Date;
}

// ============================================================================
// SAP RFC/BAPI Testing
// ============================================================================

export interface RfcConnection {
  readonly ashost: string;
  readonly sysnr: string;
  readonly client: string;
  readonly user: string;
  readonly lang: string;
}

export interface BapiCall {
  readonly name: string;
  readonly importParams: Record<string, unknown>;
  readonly exportParams?: string[];
  readonly tableParams?: string[];
  readonly changingParams?: Record<string, unknown>;
}

export interface BapiTestResult {
  readonly bapiName: string;
  readonly passed: boolean;
  readonly returnMessages: BapiReturn[];
  readonly exportValues: Record<string, unknown>;
  readonly tableData: Record<string, unknown[]>;
  readonly duration: number;
  readonly transactionCommitted: boolean;
}

export interface BapiReturn {
  readonly type: 'S' | 'E' | 'W' | 'I' | 'A';
  readonly id: string;
  readonly number: string;
  readonly message: string;
  readonly logNo: string;
  readonly logMsgNo: string;
  readonly messageV1?: string;
  readonly messageV2?: string;
  readonly messageV3?: string;
  readonly messageV4?: string;
}

// ============================================================================
// SAP IDoc Testing
// ============================================================================

export interface IDocDefinition {
  readonly type: string;
  readonly extension?: string;
  readonly version: string;
  readonly segments: IDocSegment[];
}

export interface IDocSegment {
  readonly name: string;
  readonly mandatory: boolean;
  readonly minOccurs: number;
  readonly maxOccurs: number;
  readonly fields: IDocField[];
  readonly children: IDocSegment[];
}

export interface IDocField {
  readonly name: string;
  readonly type: 'CHAR' | 'NUMC' | 'DATS' | 'TIMS' | 'CURR' | 'QUAN' | 'DEC';
  readonly length: number;
  readonly mandatory: boolean;
  readonly description: string;
}

export interface IDocTestResult {
  readonly idocType: string;
  readonly direction: 'inbound' | 'outbound';
  readonly passed: boolean;
  readonly statusCode: number;
  readonly statusMessage: string;
  readonly segmentValidation: SegmentValidation[];
  readonly processingTime: number;
}

export interface SegmentValidation {
  readonly segment: string;
  readonly valid: boolean;
  readonly fieldErrors: FieldValidationError[];
}

export interface FieldValidationError {
  readonly field: string;
  readonly expected: string;
  readonly actual: string;
  readonly rule: string;
}

// ============================================================================
// OData Contract Testing
// ============================================================================

export interface ODataMetadata {
  readonly version: 'v2' | 'v4';
  readonly serviceUrl: string;
  readonly entitySets: ODataEntitySet[];
  readonly functionImports: ODataFunctionImport[];
  readonly actions?: ODataAction[];
}

export interface ODataEntitySet {
  readonly name: string;
  readonly entityType: string;
  readonly navigationProperties: ODataNavigationProperty[];
  readonly filterable: boolean;
  readonly sortable: boolean;
  readonly pageable: boolean;
}

export interface ODataNavigationProperty {
  readonly name: string;
  readonly target: string;
  readonly multiplicity: '0..1' | '1' | '*';
}

export interface ODataFunctionImport {
  readonly name: string;
  readonly httpMethod: 'GET' | 'POST';
  readonly parameters: ODataParameter[];
  readonly returnType?: string;
}

export interface ODataAction {
  readonly name: string;
  readonly parameters: ODataParameter[];
  readonly returnType?: string;
  readonly isBound: boolean;
}

export interface ODataParameter {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
  readonly mode?: 'In' | 'Out' | 'InOut';
}

export interface ODataTestResult {
  readonly entitySet: string;
  readonly operation: string;
  readonly passed: boolean;
  readonly statusCode: number;
  readonly validationErrors: ODataValidationError[];
  readonly duration: number;
}

export interface ODataValidationError {
  readonly type: 'metadata' | 'response' | 'navigation' | 'batch' | 'concurrency' | 'query';
  readonly path: string;
  readonly message: string;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
}

// ============================================================================
// ESB/Middleware Validation
// ============================================================================

export interface MessageFlow {
  readonly name: string;
  readonly nodes: FlowNode[];
  readonly connections: FlowConnection[];
  readonly errorHandler?: string;
}

export interface FlowNode {
  readonly id: string;
  readonly type: 'input' | 'output' | 'compute' | 'filter' | 'route' | 'transform' | 'aggregate';
  readonly config: Record<string, unknown>;
}

export interface FlowConnection {
  readonly from: string;
  readonly to: string;
  readonly terminal: string;
}

export interface RoutingRule {
  readonly name: string;
  readonly condition: string;
  readonly destination: string;
  readonly priority: number;
}

export interface TransformationSpec {
  readonly type: TransformationType;
  readonly inputFormat: MessageFormat;
  readonly outputFormat: MessageFormat;
  readonly spec: string;
}

export interface MiddlewareTestResult {
  readonly flowName: string;
  readonly passed: boolean;
  readonly routingCorrect: boolean;
  readonly transformationCorrect: boolean;
  readonly errorHandlingCorrect: boolean;
  readonly validationErrors: MiddlewareValidationError[];
  readonly duration: number;
}

export interface MiddlewareValidationError {
  readonly type: 'routing' | 'transformation' | 'protocol' | 'error-handling' | 'sequencing';
  readonly node?: string;
  readonly message: string;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
}

// ============================================================================
// SoD Analysis
// ============================================================================

export interface SodRuleset {
  readonly name: string;
  readonly rules: SodRule[];
  readonly scope: 'global' | 'company-code' | 'plant';
}

export interface SodRule {
  readonly id: string;
  readonly name: string;
  readonly conflictingFunctions: [SapFunction, SapFunction];
  readonly riskLevel: 'critical' | 'high' | 'medium' | 'low';
  readonly mitigatingControl?: string;
}

export interface SapFunction {
  readonly name: string;
  readonly transactions: string[];
  readonly authorizationObjects: AuthorizationObject[];
}

export interface AuthorizationObject {
  readonly name: string;
  readonly fields: AuthorizationField[];
}

export interface AuthorizationField {
  readonly name: string;
  readonly values: string[];
}

export interface SodAnalysisResult {
  readonly userId: string;
  readonly conflicts: SodConflict[];
  readonly riskScore: number;
  readonly compliant: boolean;
  readonly recommendations: string[];
}

export interface SodConflict {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly function1: string;
  readonly function2: string;
  readonly riskLevel: 'critical' | 'high' | 'medium' | 'low';
  readonly mitigated: boolean;
  readonly mitigatingControl?: string;
}

// ============================================================================
// Coordinator Interface
// ============================================================================

export interface IEnterpriseIntegrationCoordinator {
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

// ============================================================================
// Domain Events
// ============================================================================

export interface SoapOperationTestedEvent {
  readonly operation: string;
  readonly wsdlUrl: string;
  readonly passed: boolean;
  readonly errors: number;
}

export interface MessageFlowTestedEvent {
  readonly protocol: MiddlewareProtocol;
  readonly queue: string;
  readonly passed: boolean;
  readonly latency?: number;
}

export interface BapiTestedEvent {
  readonly bapiName: string;
  readonly passed: boolean;
  readonly returnType: string;
}

export interface IDocValidatedEvent {
  readonly idocType: string;
  readonly direction: 'inbound' | 'outbound';
  readonly passed: boolean;
  readonly statusCode: number;
}

export interface ODataTestedEvent {
  readonly entitySet: string;
  readonly operation: string;
  readonly passed: boolean;
  readonly version: 'v2' | 'v4';
}

export interface SodAnalyzedEvent {
  readonly userId: string;
  readonly conflicts: number;
  readonly compliant: boolean;
  readonly riskScore: number;
}

export interface MiddlewareFlowTestedEvent {
  readonly flowName: string;
  readonly passed: boolean;
  readonly routingCorrect: boolean;
  readonly transformationCorrect: boolean;
}
