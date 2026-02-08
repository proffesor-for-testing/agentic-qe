/**
 * Agentic QE v3 - SOAP/WSDL Testing Service
 * Parses WSDL definitions, generates SOAP test requests,
 * and validates SOAP responses against schema.
 *
 * ADR-063: Enterprise Integration Testing Gap Closure
 */

import { Result, ok, err } from '../../../shared/types/index.js';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import type {
  WsdlDefinition,
  WsdlService,
  SoapOperation,
  XsdSchema,
  SoapTestResult,
  SoapValidationError,
} from '../interfaces.js';

/**
 * Configuration for the SOAP/WSDL service
 */
export interface SoapWsdlServiceConfig {
  /** Enable strict schema validation on SOAP responses */
  strictValidation: boolean;
  /** Default SOAP version to use when not specified */
  defaultSoapVersion: '1.1' | '1.2';
  /** Maximum depth for XSD type resolution */
  maxSchemaDepth: number;
  /** Cache parsed WSDL definitions */
  cacheDefinitions: boolean;
  /** Timeout for SOAP operation tests in milliseconds */
  operationTimeout: number;
}

const DEFAULT_CONFIG: SoapWsdlServiceConfig = {
  strictValidation: true,
  defaultSoapVersion: '1.1',
  maxSchemaDepth: 20,
  cacheDefinitions: true,
  operationTimeout: 30000,
};

/**
 * SOAP/WSDL Testing Service
 * Provides WSDL parsing, SOAP request generation, and response validation
 */
export class SoapWsdlService {
  private readonly config: SoapWsdlServiceConfig;
  private readonly wsdlCache: Map<string, WsdlDefinition> = new Map();

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<SoapWsdlServiceConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // WSDL Parsing
  // ============================================================================

  /**
   * Parse a WSDL definition from XML content.
   * Extracts services, ports, bindings, operations, and associated XSD schemas.
   */
  async parseWsdl(url: string, wsdlContent: string): Promise<Result<WsdlDefinition>> {
    try {
      // Check cache first
      if (this.config.cacheDefinitions && this.wsdlCache.has(url)) {
        return ok(this.wsdlCache.get(url)!);
      }

      if (!wsdlContent || wsdlContent.trim() === '') {
        return err(new Error('WSDL content is empty'));
      }

      // Detect SOAP version from WSDL content
      const version = this.detectSoapVersion(wsdlContent);

      // Extract schemas from the WSDL
      const schemas = this.extractSchemas(wsdlContent);

      // Extract services and their operations
      const services = this.extractServices(wsdlContent);

      // Validate extracted structure
      const validationErrors = this.validateWsdlStructure(services, schemas);
      if (validationErrors.length > 0) {
        return err(new Error(
          `WSDL validation failed: ${validationErrors.map(e => e.message).join('; ')}`
        ));
      }

      const definition: WsdlDefinition = {
        url,
        version,
        services,
        schemas,
      };

      // Cache the parsed definition
      if (this.config.cacheDefinitions) {
        this.wsdlCache.set(url, definition);
      }

      // Store in memory for cross-service access
      await this.memory.set(
        `enterprise-integration:wsdl:${encodeURIComponent(url)}`,
        {
          url,
          version,
          serviceCount: services.length,
          operationCount: services.reduce((sum, s) => sum + s.operations.length, 0),
          schemaCount: schemas.length,
          parsedAt: new Date().toISOString(),
        },
        { namespace: 'enterprise-integration', persist: true }
      );

      return ok(definition);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // SOAP Request Generation
  // ============================================================================

  /**
   * Generate a SOAP test request envelope for a given operation.
   * Creates a well-formed SOAP XML request with proper namespace declarations.
   */
  generateSoapRequest(
    wsdl: WsdlDefinition,
    operationName: string,
    inputData: Record<string, unknown>
  ): Result<string> {
    try {
      // Find the operation in the WSDL
      const operation = this.findOperation(wsdl, operationName);
      if (!operation) {
        return err(new Error(
          `Operation '${operationName}' not found in WSDL. Available operations: ${this.listOperations(wsdl).join(', ')}`
        ));
      }

      // Build the SOAP envelope
      const soapNamespace = wsdl.version === '1.2'
        ? 'http://www.w3.org/2003/05/soap-envelope'
        : 'http://schemas.xmlsoap.org/soap/envelope/';

      const bodyContent = this.buildRequestBody(operation, inputData);

      const envelope = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<soap:Envelope xmlns:soap="${soapNamespace}">`,
        `  <soap:Header>`,
        operation.action ? `    <Action xmlns="http://www.w3.org/2005/08/addressing">${this.escapeXml(operation.action)}</Action>` : '',
        `  </soap:Header>`,
        `  <soap:Body>`,
        `    ${bodyContent}`,
        `  </soap:Body>`,
        `</soap:Envelope>`,
      ].filter(line => line !== '').join('\n');

      return ok(envelope);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // SOAP Response Validation
  // ============================================================================

  /**
   * Validate a SOAP response against the WSDL schema for a given operation.
   * Checks envelope structure, header compliance, body schema, and fault handling.
   */
  async validateSoapResponse(
    wsdl: WsdlDefinition,
    operationName: string,
    responseXml: string
  ): Promise<Result<SoapTestResult>> {
    const startTime = Date.now();
    try {
      if (!responseXml || responseXml.trim() === '') {
        return ok({
          operation: operationName,
          passed: false,
          request: '',
          response: responseXml,
          validationErrors: [{
            type: 'envelope',
            path: '/',
            message: 'Response is empty',
            severity: 'critical',
          }],
          duration: Date.now() - startTime,
        });
      }

      const operation = this.findOperation(wsdl, operationName);
      if (!operation) {
        return err(new Error(`Operation '${operationName}' not found in WSDL`));
      }

      const validationErrors: SoapValidationError[] = [];

      // Validate SOAP envelope structure
      this.validateEnvelopeStructure(responseXml, wsdl.version, validationErrors);

      // Validate SOAP headers
      this.validateSoapHeaders(responseXml, validationErrors);

      // Check for SOAP faults
      this.validateSoapFaults(responseXml, operation, validationErrors);

      // Validate response body against the operation output schema
      this.validateResponseBody(responseXml, operation, wsdl.schemas, validationErrors);

      // Validate security headers if present
      this.validateSecurityHeaders(responseXml, validationErrors);

      const result: SoapTestResult = {
        operation: operationName,
        passed: validationErrors.length === 0,
        request: '',
        response: responseXml,
        validationErrors,
        duration: Date.now() - startTime,
      };

      // Store test result for learning
      await this.memory.set(
        `enterprise-integration:soap-test:${operationName}:${Date.now()}`,
        {
          operation: operationName,
          passed: result.passed,
          errorCount: validationErrors.length,
          duration: result.duration,
          timestamp: new Date().toISOString(),
        },
        { namespace: 'enterprise-integration', ttl: 86400 * 30 }
      );

      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Test a complete SOAP operation end-to-end: generate request, validate response.
   */
  async testOperation(
    wsdl: WsdlDefinition,
    operationName: string,
    inputData: Record<string, unknown>,
    responseXml: string
  ): Promise<Result<SoapTestResult>> {
    const startTime = Date.now();

    // Generate request
    const requestResult = this.generateSoapRequest(wsdl, operationName, inputData);
    if (!requestResult.success) {
      return err(requestResult.error);
    }

    // Validate response
    const validationResult = await this.validateSoapResponse(wsdl, operationName, responseXml);
    if (!validationResult.success) {
      return err(validationResult.error);
    }

    // Return combined result with request included
    return ok({
      ...validationResult.value,
      request: requestResult.value,
      duration: Date.now() - startTime,
    });
  }

  /**
   * List all operations available in a WSDL definition.
   */
  listOperations(wsdl: WsdlDefinition): string[] {
    const operations: string[] = [];
    for (const service of wsdl.services) {
      for (const op of service.operations) {
        operations.push(op.name);
      }
    }
    return operations;
  }

  /**
   * Clear cached WSDL definitions.
   */
  clearCache(): void {
    this.wsdlCache.clear();
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private detectSoapVersion(wsdlContent: string): '1.1' | '1.2' {
    if (wsdlContent.includes('http://www.w3.org/2003/05/soap-envelope') ||
        wsdlContent.includes('soap12:')) {
      return '1.2';
    }
    return this.config.defaultSoapVersion;
  }

  private extractSchemas(wsdlContent: string): XsdSchema[] {
    const schemas: XsdSchema[] = [];

    // Extract <types><schema>...</schema></types> blocks
    const typesMatch = wsdlContent.match(/<(?:\w+:)?types>([\s\S]*?)<\/(?:\w+:)?types>/gi);
    if (!typesMatch) return schemas;

    for (const typesBlock of typesMatch) {
      const schemaMatches = typesBlock.match(
        /<(?:\w+:)?schema([^>]*)>([\s\S]*?)<\/(?:\w+:)?schema>/gi
      );
      if (!schemaMatches) continue;

      for (const schemaMatch of schemaMatches) {
        const nsMatch = schemaMatch.match(/targetNamespace=["']([^"']*)["']/);
        const namespace = nsMatch ? nsMatch[1] : '';

        // Extract type names (complexType and simpleType)
        const types: string[] = [];
        const typeNameRegex = /<(?:\w+:)?(?:complex|simple)Type\s+name=["']([^"']*)["']/gi;
        let typeMatch: RegExpExecArray | null;
        while ((typeMatch = typeNameRegex.exec(schemaMatch)) !== null) {
          types.push(typeMatch[1]);
        }

        // Extract element names
        const elementRegex = /<(?:\w+:)?element\s+name=["']([^"']*)["']/gi;
        let elementMatch: RegExpExecArray | null;
        while ((elementMatch = elementRegex.exec(schemaMatch)) !== null) {
          types.push(elementMatch[1]);
        }

        schemas.push({
          namespace,
          types,
          content: schemaMatch,
        });
      }
    }

    return schemas;
  }

  private extractServices(wsdlContent: string): WsdlService[] {
    const services: WsdlService[] = [];

    // Extract <service> elements
    const serviceRegex = /<(?:\w+:)?service\s+name=["']([^"']*)["']/gi;
    const portRegex = /<(?:\w+:)?port\s+name=["']([^"']*)["']\s+binding=["']([^"']*)["']/gi;

    let serviceMatch: RegExpExecArray | null;
    while ((serviceMatch = serviceRegex.exec(wsdlContent)) !== null) {
      const serviceName = serviceMatch[1];

      // Find the port for this service
      let portName = '';
      let binding = '';
      const portMatch = portRegex.exec(wsdlContent);
      if (portMatch) {
        portName = portMatch[1];
        binding = portMatch[2];
      }

      // Extract operations from portType or binding
      const operations = this.extractOperations(wsdlContent, binding);

      services.push({
        name: serviceName,
        port: portName,
        binding,
        operations,
      });
    }

    // If no service elements found, try to extract operations from portType
    if (services.length === 0) {
      const operations = this.extractOperationsFromPortType(wsdlContent);
      if (operations.length > 0) {
        services.push({
          name: 'DefaultService',
          port: 'DefaultPort',
          binding: 'DefaultBinding',
          operations,
        });
      }
    }

    return services;
  }

  private extractOperations(wsdlContent: string, _binding: string): SoapOperation[] {
    return this.extractOperationsFromPortType(wsdlContent);
  }

  private extractOperationsFromPortType(wsdlContent: string): SoapOperation[] {
    const operations: SoapOperation[] = [];

    // Match <operation> elements within portType or binding
    const opRegex = /<(?:\w+:)?operation\s+name=["']([^"']*)["']/gi;
    const operationNames = new Set<string>();

    let opMatch: RegExpExecArray | null;
    while ((opMatch = opRegex.exec(wsdlContent)) !== null) {
      const name = opMatch[1];
      if (operationNames.has(name)) continue;
      operationNames.add(name);

      // Find input/output message references
      const opBlock = this.extractOperationBlock(wsdlContent, name);
      const input = this.extractMessageRef(opBlock, 'input');
      const output = this.extractMessageRef(opBlock, 'output');
      const faults = this.extractFaultRefs(opBlock);
      const action = this.extractSoapAction(wsdlContent, name);

      operations.push({
        name,
        input,
        output,
        faults,
        action,
      });
    }

    return operations;
  }

  private extractOperationBlock(wsdlContent: string, operationName: string): string {
    const escapedName = operationName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `<(?:\\w+:)?operation\\s+name=["']${escapedName}["'][^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?operation>`,
      'i'
    );
    const match = wsdlContent.match(regex);
    return match ? match[0] : '';
  }

  private extractMessageRef(opBlock: string, type: 'input' | 'output'): string {
    const regex = new RegExp(
      `<(?:\\w+:)?${type}[^>]*(?:message=["']([^"']*)["']|name=["']([^"']*)["'])[^>]*/>`,
      'i'
    );
    const match = opBlock.match(regex);
    if (match) {
      return (match[1] || match[2] || '').replace(/^.*:/, '');
    }
    // Try non-self-closing tag
    const altRegex = new RegExp(
      `<(?:\\w+:)?${type}[^>]*(?:message=["']([^"']*)["']|name=["']([^"']*)["'])[^>]*>`,
      'i'
    );
    const altMatch = opBlock.match(altRegex);
    return altMatch ? (altMatch[1] || altMatch[2] || '').replace(/^.*:/, '') : '';
  }

  private extractFaultRefs(opBlock: string): string[] {
    const faults: string[] = [];
    const faultRegex = /<(?:\w+:)?fault[^>]*name=["']([^"']*)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = faultRegex.exec(opBlock)) !== null) {
      faults.push(match[1]);
    }
    return faults;
  }

  private extractSoapAction(wsdlContent: string, operationName: string): string | undefined {
    const escapedName = operationName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `<(?:\\w+:)?operation\\s+name=["']${escapedName}["'][\\s\\S]*?soapAction=["']([^"']*)["']`,
      'i'
    );
    const match = wsdlContent.match(regex);
    return match ? match[1] : undefined;
  }

  private validateWsdlStructure(
    services: WsdlService[],
    _schemas: XsdSchema[]
  ): SoapValidationError[] {
    const errors: SoapValidationError[] = [];

    if (services.length === 0) {
      errors.push({
        type: 'schema',
        path: '/wsdl:definitions/wsdl:service',
        message: 'WSDL must define at least one service',
        severity: 'critical',
      });
    }

    for (const service of services) {
      if (!service.name || service.name.trim() === '') {
        errors.push({
          type: 'schema',
          path: '/wsdl:definitions/wsdl:service/@name',
          message: 'Service name is required',
          severity: 'critical',
        });
      }

      if (service.operations.length === 0) {
        errors.push({
          type: 'schema',
          path: `/wsdl:definitions/wsdl:service[@name='${service.name}']`,
          message: `Service '${service.name}' has no operations defined`,
          severity: 'high',
        });
      }

      for (const op of service.operations) {
        if (!op.input) {
          errors.push({
            type: 'schema',
            path: `/wsdl:definitions/wsdl:portType/wsdl:operation[@name='${op.name}']/wsdl:input`,
            message: `Operation '${op.name}' is missing input message`,
            severity: 'medium',
          });
        }
      }
    }

    return errors;
  }

  private findOperation(wsdl: WsdlDefinition, operationName: string): SoapOperation | undefined {
    for (const service of wsdl.services) {
      const op = service.operations.find(o => o.name === operationName);
      if (op) return op;
    }
    return undefined;
  }

  private buildRequestBody(
    operation: SoapOperation,
    inputData: Record<string, unknown>
  ): string {
    const elements = Object.entries(inputData)
      .map(([key, value]) => `      <${this.escapeXml(key)}>${this.serializeValue(value)}</${this.escapeXml(key)}>`)
      .join('\n');

    return [
      `<${this.escapeXml(operation.name)}>`,
      elements,
      `    </${this.escapeXml(operation.name)}>`,
    ].join('\n');
  }

  private serializeValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object' && !Array.isArray(value)) {
      return Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => `<${this.escapeXml(k)}>${this.serializeValue(v)}</${this.escapeXml(k)}>`)
        .join('');
    }
    if (Array.isArray(value)) {
      return value.map(item => this.serializeValue(item)).join('');
    }
    return this.escapeXml(String(value));
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private validateEnvelopeStructure(
    responseXml: string,
    version: '1.1' | '1.2',
    errors: SoapValidationError[]
  ): void {
    const expectedNamespace = version === '1.2'
      ? 'http://www.w3.org/2003/05/soap-envelope'
      : 'http://schemas.xmlsoap.org/soap/envelope/';

    // Check for Envelope element
    if (!/<(?:\w+:)?Envelope/i.test(responseXml)) {
      errors.push({
        type: 'envelope',
        path: '/soap:Envelope',
        message: 'Response is missing SOAP Envelope element',
        severity: 'critical',
      });
      return;
    }

    // Check for correct namespace
    if (!responseXml.includes(expectedNamespace)) {
      errors.push({
        type: 'envelope',
        path: '/soap:Envelope/@xmlns',
        message: `Expected SOAP ${version} namespace '${expectedNamespace}'`,
        severity: 'high',
      });
    }

    // Check for Body element
    if (!/<(?:\w+:)?Body/i.test(responseXml)) {
      errors.push({
        type: 'envelope',
        path: '/soap:Envelope/soap:Body',
        message: 'Response is missing SOAP Body element',
        severity: 'critical',
      });
    }
  }

  private validateSoapHeaders(
    responseXml: string,
    errors: SoapValidationError[]
  ): void {
    // If Header element exists, validate its structure
    const headerMatch = responseXml.match(/<(?:\w+:)?Header>([\s\S]*?)<\/(?:\w+:)?Header>/i);
    if (headerMatch) {
      const headerContent = headerMatch[1].trim();
      // Header should contain well-formed XML elements
      if (headerContent && !this.isWellFormedXmlFragment(headerContent)) {
        errors.push({
          type: 'header',
          path: '/soap:Envelope/soap:Header',
          message: 'SOAP Header contains malformed XML',
          severity: 'medium',
        });
      }
    }
  }

  private validateSoapFaults(
    responseXml: string,
    operation: SoapOperation,
    errors: SoapValidationError[]
  ): void {
    const hasFault = /<(?:\w+:)?Fault/i.test(responseXml);
    if (!hasFault) return;

    // Validate fault structure
    const faultCodeMatch = responseXml.match(/<(?:\w+:)?faultcode>([\s\S]*?)<\/(?:\w+:)?faultcode>/i) ||
                           responseXml.match(/<(?:\w+:)?Code>([\s\S]*?)<\/(?:\w+:)?Code>/i);

    if (!faultCodeMatch) {
      errors.push({
        type: 'fault',
        path: '/soap:Envelope/soap:Body/soap:Fault/faultcode',
        message: 'SOAP Fault is missing fault code',
        severity: 'medium',
      });
    }

    const faultStringMatch = responseXml.match(/<(?:\w+:)?faultstring>([\s\S]*?)<\/(?:\w+:)?faultstring>/i) ||
                             responseXml.match(/<(?:\w+:)?Reason>([\s\S]*?)<\/(?:\w+:)?Reason>/i);

    if (!faultStringMatch) {
      errors.push({
        type: 'fault',
        path: '/soap:Envelope/soap:Body/soap:Fault/faultstring',
        message: 'SOAP Fault is missing fault string/reason',
        severity: 'medium',
      });
    }

    // Check if the fault name matches a declared fault in the operation
    if (operation.faults.length > 0) {
      const detailMatch = responseXml.match(/<(?:\w+:)?detail>([\s\S]*?)<\/(?:\w+:)?detail>/i) ||
                          responseXml.match(/<(?:\w+:)?Detail>([\s\S]*?)<\/(?:\w+:)?Detail>/i);

      if (!detailMatch) {
        errors.push({
          type: 'fault',
          path: '/soap:Envelope/soap:Body/soap:Fault/detail',
          message: 'SOAP Fault should include detail element for declared faults',
          severity: 'low',
        });
      }
    }
  }

  private validateResponseBody(
    responseXml: string,
    operation: SoapOperation,
    schemas: XsdSchema[],
    errors: SoapValidationError[]
  ): void {
    // Skip body validation if there is a fault
    if (/<(?:\w+:)?Fault/i.test(responseXml)) return;

    const bodyMatch = responseXml.match(/<(?:\w+:)?Body>([\s\S]*?)<\/(?:\w+:)?Body>/i);
    if (!bodyMatch) return;

    const bodyContent = bodyMatch[1].trim();

    if (!bodyContent) {
      if (operation.output) {
        errors.push({
          type: 'schema',
          path: '/soap:Envelope/soap:Body',
          message: `Expected response body for operation '${operation.name}' output '${operation.output}'`,
          severity: 'high',
        });
      }
      return;
    }

    // Validate that the response element matches the expected output type
    if (operation.output) {
      const expectedElement = operation.output.replace(/Response$/, 'Response');
      const hasExpectedElement = new RegExp(
        `<(?:\\w+:)?${expectedElement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'i'
      ).test(bodyContent);

      if (!hasExpectedElement && this.config.strictValidation) {
        errors.push({
          type: 'schema',
          path: `/soap:Envelope/soap:Body/${expectedElement}`,
          message: `Response body does not contain expected element '${expectedElement}'`,
          severity: 'high',
        });
      }
    }

    // Validate against XSD schemas if available
    for (const schema of schemas) {
      this.validateBodyAgainstSchema(bodyContent, schema, errors);
    }
  }

  private validateBodyAgainstSchema(
    bodyContent: string,
    schema: XsdSchema,
    errors: SoapValidationError[]
  ): void {
    // Check for namespace consistency
    if (schema.namespace) {
      const usesNamespace = bodyContent.includes(schema.namespace);
      const referencesTypes = schema.types.some(type =>
        new RegExp(`<(?:\\w+:)?${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(bodyContent)
      );

      if (referencesTypes && !usesNamespace && this.config.strictValidation) {
        errors.push({
          type: 'schema',
          path: '/soap:Envelope/soap:Body',
          message: `Response uses types from schema '${schema.namespace}' but does not declare the namespace`,
          severity: 'medium',
        });
      }
    }
  }

  private validateSecurityHeaders(
    responseXml: string,
    errors: SoapValidationError[]
  ): void {
    // Check for WS-Security headers if present
    const wsSecMatch = responseXml.match(
      /<(?:\w+:)?Security[^>]*xmlns[^>]*wsse[^>]*>([\s\S]*?)<\/(?:\w+:)?Security>/i
    );

    if (wsSecMatch) {
      const secContent = wsSecMatch[1];

      // Validate timestamp if present
      const timestampMatch = secContent.match(
        /<(?:\w+:)?Timestamp[^>]*>([\s\S]*?)<\/(?:\w+:)?Timestamp>/i
      );
      if (timestampMatch) {
        const hasCreated = /<(?:\w+:)?Created>/i.test(timestampMatch[1]);
        const hasExpires = /<(?:\w+:)?Expires>/i.test(timestampMatch[1]);

        if (!hasCreated) {
          errors.push({
            type: 'security',
            path: '/soap:Header/wsse:Security/wsu:Timestamp/wsu:Created',
            message: 'WS-Security Timestamp is missing Created element',
            severity: 'medium',
          });
        }
        if (!hasExpires) {
          errors.push({
            type: 'security',
            path: '/soap:Header/wsse:Security/wsu:Timestamp/wsu:Expires',
            message: 'WS-Security Timestamp is missing Expires element',
            severity: 'low',
          });
        }
      }
    }
  }

  private isWellFormedXmlFragment(content: string): boolean {
    // Simple well-formedness check: balanced tags
    const openTags: string[] = [];
    const tagRegex = /<\/?(\w+[\w:.-]*)[^>]*\/?>/g;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(content)) !== null) {
      const fullMatch = match[0];
      const tagName = match[1];

      if (fullMatch.endsWith('/>')) {
        // Self-closing tag, no need to track
        continue;
      }

      if (fullMatch.startsWith('</')) {
        // Closing tag
        if (openTags.length === 0 || openTags[openTags.length - 1] !== tagName) {
          return false;
        }
        openTags.pop();
      } else {
        // Opening tag
        openTags.push(tagName);
      }
    }

    return openTags.length === 0;
  }
}
