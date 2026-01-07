/**
 * Agentic QE v3 - Contract Validator Service
 * Implements IContractValidationService for API contract validation (Pact-style)
 */

import { Result, ok, err } from '../../../shared/types/index.js';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import type {
  IContractValidationService,
  ApiContract,
  SchemaDefinition,
  ValidationReport,
  ValidationError,
  SchemaValidationResult,
  SchemaError,
  OpenAPIValidationResult,
  ContractEndpoint,
} from '../interfaces.js';

/**
 * Configuration for the contract validator
 */
export interface ContractValidatorConfig {
  strictMode: boolean;
  validateExamples: boolean;
  maxSchemaDepth: number;
  cacheValidations: boolean;
}

const DEFAULT_CONFIG: ContractValidatorConfig = {
  strictMode: true,
  validateExamples: true,
  maxSchemaDepth: 20,
  cacheValidations: true,
};

/**
 * Contract Validation Service Implementation
 * Validates API contracts against schemas and specifications
 */
export class ContractValidatorService implements IContractValidationService {
  private readonly config: ContractValidatorConfig;
  private readonly validationCache: Map<string, ValidationReport> = new Map();

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<ContractValidatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate contract structure
   */
  async validateContract(contract: ApiContract): Promise<Result<ValidationReport>> {
    try {
      // Check cache first
      const cacheKey = this.getCacheKey(contract);
      if (this.config.cacheValidations && this.validationCache.has(cacheKey)) {
        return ok(this.validationCache.get(cacheKey)!);
      }

      const errors: ValidationError[] = [];
      const warnings: string[] = [];

      // Validate basic contract structure
      this.validateContractStructure(contract, errors, warnings);

      // Validate provider info
      this.validateServiceInfo(contract.provider, 'provider', errors);

      // Validate consumers
      for (const consumer of contract.consumers) {
        this.validateServiceInfo(consumer, `consumer:${consumer.name}`, errors);
      }

      // Validate endpoints
      for (const endpoint of contract.endpoints) {
        await this.validateEndpoint(endpoint, contract.schemas, errors, warnings);
      }

      // Validate schemas
      for (const schema of contract.schemas) {
        await this.validateSchemaDefinition(schema, errors, warnings);
      }

      // Validate examples if enabled
      if (this.config.validateExamples) {
        await this.validateEndpointExamples(contract, errors, warnings);
      }

      const report: ValidationReport = {
        isValid: errors.length === 0,
        errors,
        warnings,
      };

      // Cache the result
      if (this.config.cacheValidations) {
        this.validationCache.set(cacheKey, report);
      }

      // Store validation history
      await this.storeValidationHistory(contract.id, report);

      return ok(report);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Validate request against schema
   */
  async validateRequest(
    request: unknown,
    schema: SchemaDefinition
  ): Promise<Result<SchemaValidationResult>> {
    try {
      const errors: SchemaError[] = [];

      switch (schema.type) {
        case 'json-schema':
          await this.validateAgainstJsonSchema(request, schema.content, errors);
          break;
        case 'openapi':
          await this.validateAgainstOpenAPISchema(request, schema.content, errors);
          break;
        case 'graphql':
          await this.validateAgainstGraphQLSchema(request, schema.content, errors);
          break;
        default:
          errors.push({
            path: '',
            keyword: 'unsupported',
            message: `Schema type '${schema.type}' is not supported for request validation`,
            params: { schemaType: schema.type },
          });
      }

      return ok({
        isValid: errors.length === 0,
        errors,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Validate response against schema
   */
  async validateResponse(
    response: unknown,
    schema: SchemaDefinition
  ): Promise<Result<SchemaValidationResult>> {
    try {
      const errors: SchemaError[] = [];

      switch (schema.type) {
        case 'json-schema':
          await this.validateAgainstJsonSchema(response, schema.content, errors);
          break;
        case 'openapi':
          await this.validateAgainstOpenAPISchema(response, schema.content, errors);
          break;
        case 'graphql':
          await this.validateAgainstGraphQLSchema(response, schema.content, errors);
          break;
        default:
          errors.push({
            path: '',
            keyword: 'unsupported',
            message: `Schema type '${schema.type}' is not supported for response validation`,
            params: { schemaType: schema.type },
          });
      }

      return ok({
        isValid: errors.length === 0,
        errors,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Validate OpenAPI/Swagger specification
   */
  async validateOpenAPI(spec: string): Promise<Result<OpenAPIValidationResult>> {
    try {
      const errors: ValidationError[] = [];
      const warnings: string[] = [];
      let specVersion = 'unknown';
      let endpointCount = 0;
      let schemaCount = 0;

      // Parse the spec
      let parsedSpec: Record<string, unknown>;
      try {
        parsedSpec = JSON.parse(spec);
      } catch {
        // Try YAML parsing
        // For now, we'll treat it as JSON
        return ok({
          isValid: false,
          specVersion: 'unknown',
          errors: [
            {
              path: '',
              message: 'Failed to parse OpenAPI specification',
              code: 'PARSE_ERROR',
            },
          ],
          warnings: [],
          endpointCount: 0,
          schemaCount: 0,
        });
      }

      // Detect spec version
      if (parsedSpec.openapi) {
        specVersion = parsedSpec.openapi as string;
      } else if (parsedSpec.swagger) {
        specVersion = `swagger-${parsedSpec.swagger}`;
      }

      // Validate OpenAPI 3.x structure
      if (specVersion.startsWith('3.')) {
        this.validateOpenAPI3Structure(parsedSpec, errors, warnings);
      } else if (specVersion.startsWith('swagger-2')) {
        this.validateSwagger2Structure(parsedSpec, errors, warnings);
      } else {
        errors.push({
          path: '',
          message: `Unsupported OpenAPI version: ${specVersion}`,
          code: 'UNSUPPORTED_VERSION',
        });
      }

      // Count endpoints
      const paths = (parsedSpec.paths as Record<string, unknown>) || {};
      for (const [_path, methods] of Object.entries(paths)) {
        if (typeof methods === 'object' && methods !== null) {
          const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
          for (const method of httpMethods) {
            if (method in methods) {
              endpointCount++;
            }
          }
        }
      }

      // Count schemas
      const components = parsedSpec.components as Record<string, unknown> | undefined;
      const schemas = (components?.schemas as Record<string, unknown>) || {};
      schemaCount = Object.keys(schemas).length;

      // Also count definitions for Swagger 2
      const definitions = (parsedSpec.definitions as Record<string, unknown>) || {};
      schemaCount += Object.keys(definitions).length;

      return ok({
        isValid: errors.length === 0,
        specVersion,
        errors,
        warnings,
        endpointCount,
        schemaCount,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private getCacheKey(contract: ApiContract): string {
    return `${contract.id}:${contract.version.toString()}`;
  }

  private validateContractStructure(
    contract: ApiContract,
    errors: ValidationError[],
    warnings: string[]
  ): void {
    if (!contract.id || contract.id.trim() === '') {
      errors.push({
        path: 'id',
        message: 'Contract ID is required',
        code: 'REQUIRED_FIELD',
      });
    }

    if (!contract.name || contract.name.trim() === '') {
      errors.push({
        path: 'name',
        message: 'Contract name is required',
        code: 'REQUIRED_FIELD',
      });
    }

    if (!contract.type) {
      errors.push({
        path: 'type',
        message: 'Contract type is required',
        code: 'REQUIRED_FIELD',
      });
    }

    if (contract.endpoints.length === 0) {
      if (this.config.strictMode) {
        errors.push({
          path: 'endpoints',
          message: 'Contract must have at least one endpoint',
          code: 'EMPTY_ENDPOINTS',
        });
      } else {
        warnings.push('Contract has no endpoints defined');
      }
    }

    if (contract.consumers.length === 0) {
      warnings.push('No consumers defined for contract');
    }
  }

  private validateServiceInfo(
    info: { name: string; version: string; team?: string },
    path: string,
    errors: ValidationError[]
  ): void {
    if (!info.name || info.name.trim() === '') {
      errors.push({
        path: `${path}.name`,
        message: 'Service name is required',
        code: 'REQUIRED_FIELD',
      });
    }

    if (!info.version || info.version.trim() === '') {
      errors.push({
        path: `${path}.version`,
        message: 'Service version is required',
        code: 'REQUIRED_FIELD',
      });
    }
  }

  private async validateEndpoint(
    endpoint: ContractEndpoint,
    schemas: SchemaDefinition[],
    errors: ValidationError[],
    warnings: string[]
  ): Promise<void> {
    if (!endpoint.path || endpoint.path.trim() === '') {
      errors.push({
        path: 'endpoint.path',
        message: 'Endpoint path is required',
        code: 'REQUIRED_FIELD',
      });
    }

    if (!endpoint.method) {
      errors.push({
        path: 'endpoint.method',
        message: 'HTTP method is required',
        code: 'REQUIRED_FIELD',
      });
    }

    // Validate schema references
    if (endpoint.requestSchema) {
      const found = schemas.some((s) => s.id === endpoint.requestSchema);
      if (!found) {
        errors.push({
          path: `endpoint.${endpoint.path}.requestSchema`,
          message: `Request schema '${endpoint.requestSchema}' not found`,
          code: 'INVALID_REFERENCE',
        });
      }
    }

    if (endpoint.responseSchema) {
      const found = schemas.some((s) => s.id === endpoint.responseSchema);
      if (!found) {
        errors.push({
          path: `endpoint.${endpoint.path}.responseSchema`,
          message: `Response schema '${endpoint.responseSchema}' not found`,
          code: 'INVALID_REFERENCE',
        });
      }
    }

    // Warn about missing examples
    if (endpoint.examples.length === 0) {
      warnings.push(`Endpoint ${endpoint.method} ${endpoint.path} has no examples`);
    }
  }

  private async validateSchemaDefinition(
    schema: SchemaDefinition,
    errors: ValidationError[],
    warnings: string[]
  ): Promise<void> {
    if (!schema.id || schema.id.trim() === '') {
      errors.push({
        path: 'schema.id',
        message: 'Schema ID is required',
        code: 'REQUIRED_FIELD',
      });
    }

    if (!schema.content || schema.content.trim() === '') {
      errors.push({
        path: `schema.${schema.id}.content`,
        message: 'Schema content is required',
        code: 'REQUIRED_FIELD',
      });
      return;
    }

    // Validate schema based on type
    switch (schema.type) {
      case 'json-schema':
        this.validateJsonSchemaContent(schema.content, schema.id, errors, warnings);
        break;
      case 'openapi':
        // OpenAPI schemas are validated as JSON Schema subset
        this.validateJsonSchemaContent(schema.content, schema.id, errors, warnings);
        break;
      case 'graphql':
        this.validateGraphQLSchemaContent(schema.content, schema.id, errors, warnings);
        break;
      case 'protobuf':
        this.validateProtobufContent(schema.content, schema.id, errors, warnings);
        break;
      case 'avro':
        this.validateAvroContent(schema.content, schema.id, errors, warnings);
        break;
    }
  }

  private validateJsonSchemaContent(
    content: string,
    schemaId: string,
    errors: ValidationError[],
    _warnings: string[]
  ): void {
    try {
      const parsed = JSON.parse(content);

      // Basic JSON Schema validation
      if (typeof parsed !== 'object' || parsed === null) {
        errors.push({
          path: `schema.${schemaId}`,
          message: 'JSON Schema must be an object',
          code: 'INVALID_SCHEMA',
        });
      }
    } catch {
      errors.push({
        path: `schema.${schemaId}`,
        message: 'Invalid JSON in schema content',
        code: 'INVALID_JSON',
      });
    }
  }

  private validateGraphQLSchemaContent(
    content: string,
    schemaId: string,
    errors: ValidationError[],
    _warnings: string[]
  ): void {
    // Basic GraphQL schema validation (stub)
    if (!content.includes('type') && !content.includes('schema')) {
      errors.push({
        path: `schema.${schemaId}`,
        message: 'GraphQL schema must contain type definitions',
        code: 'INVALID_GRAPHQL',
      });
    }
  }

  private validateProtobufContent(
    content: string,
    schemaId: string,
    errors: ValidationError[],
    _warnings: string[]
  ): void {
    // Basic Protobuf validation (stub)
    if (!content.includes('message') && !content.includes('syntax')) {
      errors.push({
        path: `schema.${schemaId}`,
        message: 'Protobuf schema must contain message definitions',
        code: 'INVALID_PROTOBUF',
      });
    }
  }

  private validateAvroContent(
    content: string,
    schemaId: string,
    errors: ValidationError[],
    _warnings: string[]
  ): void {
    try {
      const parsed = JSON.parse(content);
      if (!parsed.type) {
        errors.push({
          path: `schema.${schemaId}`,
          message: 'Avro schema must have a type field',
          code: 'INVALID_AVRO',
        });
      }
    } catch {
      errors.push({
        path: `schema.${schemaId}`,
        message: 'Invalid JSON in Avro schema',
        code: 'INVALID_JSON',
      });
    }
  }

  private async validateEndpointExamples(
    contract: ApiContract,
    errors: ValidationError[],
    _warnings: string[]
  ): Promise<void> {
    for (const endpoint of contract.endpoints) {
      for (const example of endpoint.examples) {
        // Validate request example against schema
        if (endpoint.requestSchema && example.request !== undefined) {
          const schema = contract.schemas.find((s) => s.id === endpoint.requestSchema);
          if (schema) {
            const result = await this.validateRequest(example.request, schema);
            if (result.success && !result.value.isValid) {
              errors.push({
                path: `endpoint.${endpoint.path}.example.${example.name}.request`,
                message: `Request example does not match schema: ${result.value.errors.map((e) => e.message).join(', ')}`,
                code: 'EXAMPLE_VALIDATION_FAILED',
              });
            }
          }
        }

        // Validate response example against schema
        if (endpoint.responseSchema && example.response !== undefined) {
          const schema = contract.schemas.find((s) => s.id === endpoint.responseSchema);
          if (schema) {
            const result = await this.validateResponse(example.response, schema);
            if (result.success && !result.value.isValid) {
              errors.push({
                path: `endpoint.${endpoint.path}.example.${example.name}.response`,
                message: `Response example does not match schema: ${result.value.errors.map((e) => e.message).join(', ')}`,
                code: 'EXAMPLE_VALIDATION_FAILED',
              });
            }
          }
        }
      }
    }
  }

  private async validateAgainstJsonSchema(
    data: unknown,
    schemaContent: string,
    errors: SchemaError[]
  ): Promise<void> {
    try {
      const schema = JSON.parse(schemaContent);

      // Basic type validation (stub - in production use ajv or similar)
      this.basicTypeValidation(data, schema, '', errors);
    } catch {
      errors.push({
        path: '',
        keyword: 'parse',
        message: 'Failed to parse JSON Schema',
        params: {},
      });
    }
  }

  private async validateAgainstOpenAPISchema(
    data: unknown,
    schemaContent: string,
    errors: SchemaError[]
  ): Promise<void> {
    // OpenAPI schemas are a subset of JSON Schema
    await this.validateAgainstJsonSchema(data, schemaContent, errors);
  }

  private async validateAgainstGraphQLSchema(
    _data: unknown,
    _schemaContent: string,
    errors: SchemaError[]
  ): Promise<void> {
    // GraphQL validation would require parsing the schema
    // For now, just do basic validation
    errors.push({
      path: '',
      keyword: 'graphql',
      message: 'GraphQL validation not fully implemented',
      params: {},
    });
  }

  private basicTypeValidation(
    data: unknown,
    schema: Record<string, unknown>,
    path: string,
    errors: SchemaError[],
    depth: number = 0
  ): void {
    if (depth > this.config.maxSchemaDepth) {
      errors.push({
        path,
        keyword: 'maxDepth',
        message: 'Maximum schema depth exceeded',
        params: { maxDepth: this.config.maxSchemaDepth },
      });
      return;
    }

    const type = schema.type as string | undefined;
    if (!type) return;

    const actualType = this.getJsonType(data);

    if (type === 'object' && actualType === 'object') {
      const properties = (schema.properties as Record<string, unknown>) || {};
      const required = (schema.required as string[]) || [];
      const dataObj = data as Record<string, unknown>;

      // Check required properties
      for (const prop of required) {
        if (!(prop in dataObj)) {
          errors.push({
            path: path ? `${path}.${prop}` : prop,
            keyword: 'required',
            message: `Required property '${prop}' is missing`,
            params: { missingProperty: prop },
          });
        }
      }

      // Validate each property
      for (const [prop, propSchema] of Object.entries(properties)) {
        if (prop in dataObj) {
          this.basicTypeValidation(
            dataObj[prop],
            propSchema as Record<string, unknown>,
            path ? `${path}.${prop}` : prop,
            errors,
            depth + 1
          );
        }
      }
    } else if (type === 'array' && actualType === 'array') {
      const items = schema.items as Record<string, unknown> | undefined;
      if (items) {
        const dataArr = data as unknown[];
        for (let i = 0; i < dataArr.length; i++) {
          this.basicTypeValidation(
            dataArr[i],
            items,
            `${path}[${i}]`,
            errors,
            depth + 1
          );
        }
      }
    } else if (type !== actualType) {
      // Allow integer as number
      if (!(type === 'number' && actualType === 'integer')) {
        errors.push({
          path,
          keyword: 'type',
          message: `Expected type '${type}' but got '${actualType}'`,
          params: { expectedType: type, actualType },
        });
      }
    }
  }

  private getJsonType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'number';
    }
    return typeof value;
  }

  private validateOpenAPI3Structure(
    spec: Record<string, unknown>,
    errors: ValidationError[],
    warnings: string[]
  ): void {
    // Required fields for OpenAPI 3.x
    if (!spec.info) {
      errors.push({
        path: 'info',
        message: 'OpenAPI 3.x requires info object',
        code: 'REQUIRED_FIELD',
      });
    } else {
      const info = spec.info as Record<string, unknown>;
      if (!info.title) {
        errors.push({
          path: 'info.title',
          message: 'API title is required',
          code: 'REQUIRED_FIELD',
        });
      }
      if (!info.version) {
        errors.push({
          path: 'info.version',
          message: 'API version is required',
          code: 'REQUIRED_FIELD',
        });
      }
    }

    if (!spec.paths) {
      warnings.push('No paths defined in OpenAPI specification');
    }
  }

  private validateSwagger2Structure(
    spec: Record<string, unknown>,
    errors: ValidationError[],
    warnings: string[]
  ): void {
    // Required fields for Swagger 2
    if (!spec.info) {
      errors.push({
        path: 'info',
        message: 'Swagger 2 requires info object',
        code: 'REQUIRED_FIELD',
      });
    }

    if (!spec.paths) {
      warnings.push('No paths defined in Swagger specification');
    }

    // Swagger 2 requires host or basePath for some operations
    if (!spec.host && !spec.basePath) {
      warnings.push('No host or basePath defined in Swagger specification');
    }
  }

  private async storeValidationHistory(
    contractId: string,
    report: ValidationReport
  ): Promise<void> {
    const historyKey = `contract-testing:validation:${contractId}:${Date.now()}`;
    await this.memory.set(historyKey, report, {
      namespace: 'contract-testing',
      ttl: 86400 * 30, // 30 days
    });
  }
}
