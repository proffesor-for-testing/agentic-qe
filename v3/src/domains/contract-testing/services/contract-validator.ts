/**
 * Agentic QE v3 - Contract Validator Service
 * Implements IContractValidationService for API contract validation (Pact-style)
 */

import { Result, ok, err } from '../../../shared/types/index.js';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import type { HybridRouter, ChatResponse } from '../../../shared/llm/index.js';
import { createSafeRegex } from '../../../mcp/security/validators/regex-safety-validator.js';
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
import { CONTRACT_CONSTANTS, LLM_ANALYSIS_CONSTANTS } from '../../constants.js';

/**
 * Configuration for the contract validator
 */
export interface ContractValidatorConfig {
  strictMode: boolean;
  validateExamples: boolean;
  maxSchemaDepth: number;
  cacheValidations: boolean;
  /** ADR-051: Enable LLM-powered contract analysis */
  enableLLMAnalysis: boolean;
  /** ADR-051: Model tier for LLM calls (1=Haiku, 2=Sonnet, 4=Opus) */
  llmModelTier: number;
  /** ADR-051: Max tokens for LLM responses */
  llmMaxTokens: number;
}

const DEFAULT_CONFIG: ContractValidatorConfig = {
  strictMode: true,
  validateExamples: true,
  maxSchemaDepth: CONTRACT_CONSTANTS.MAX_SCHEMA_DEPTH,
  cacheValidations: true,
  enableLLMAnalysis: true, // On by default - opt-out (ADR-051)
  llmModelTier: 2, // Sonnet for balanced analysis
  llmMaxTokens: LLM_ANALYSIS_CONSTANTS.MAX_TOKENS,
};

/**
 * Dependencies for ContractValidatorService
 */
export interface ContractValidatorDependencies {
  memory: MemoryBackend;
  llmRouter?: HybridRouter;
}

/**
 * GraphQL schema parsing types
 */
interface GraphQLSchemaInfo {
  types: Record<string, GraphQLTypeDef>;
  queryType: string | null;
  mutationType: string | null;
  subscriptionType: string | null;
  errors: string[];
}

interface GraphQLTypeDef {
  kind: 'type' | 'input' | 'interface' | 'enum';
  fields: Record<string, GraphQLFieldDef>;
  implements: string | null;
}

interface GraphQLFieldDef {
  type: string;
  arguments?: Record<string, { type: string }>;
}

interface GraphQLOperationInfo {
  type: 'query' | 'mutation' | 'subscription';
  name: string | null;
  fields: GraphQLField[];
  variableDefinitions: Record<string, { type: string; required: boolean }>;
  errors: string[];
}

interface GraphQLField {
  name: string;
  alias?: string;
  arguments?: Record<string, unknown>;
  selections?: GraphQLField[];
}

/** Extended validation report with cache timestamp */
interface CachedValidationReport extends ValidationReport {
  cachedAt?: number;
}

/**
 * Contract Validation Service Implementation
 * Validates API contracts against schemas and specifications
 */
export class ContractValidatorService implements IContractValidationService {
  private readonly config: ContractValidatorConfig;
  private readonly memory: MemoryBackend;
  private readonly llmRouter?: HybridRouter;
  private readonly validationCache: Map<string, CachedValidationReport> = new Map();

  /** Maximum number of validations to cache */
  private readonly MAX_CACHED_VALIDATIONS = CONTRACT_CONSTANTS.MAX_CACHED_VALIDATIONS;
  /** Cache TTL in milliseconds (1 hour) */
  private readonly CACHE_TTL_MS = CONTRACT_CONSTANTS.CACHE_TTL_MS;

  constructor(
    dependencies: ContractValidatorDependencies,
    config: Partial<ContractValidatorConfig> = {}
  ) {
    this.memory = dependencies.memory;
    this.llmRouter = dependencies.llmRouter;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * ADR-051: Check if LLM analysis is available
   */
  private isLLMAnalysisAvailable(): boolean {
    return this.config.enableLLMAnalysis && this.llmRouter !== undefined;
  }

  /**
   * ADR-051: Get model name for tier
   */
  private getModelForTier(tier: number): string {
    const models: Record<number, string> = {
      1: 'claude-3-haiku-20240307',
      2: 'claude-sonnet-4-20250514',
      3: 'claude-sonnet-4-20250514',
      4: 'claude-opus-4-20250514',
    };
    return models[tier] || models[2];
  }

  /**
   * ADR-051: LLM-powered contract analysis
   */
  private async analyzeContractWithLLM(contract: ApiContract): Promise<string | null> {
    if (!this.isLLMAnalysisAvailable()) return null;

    try {
      const consumerNames = contract.consumers.map(c => c.name).join(', ');
      const response = await this.llmRouter!.chat({
        model: this.getModelForTier(this.config.llmModelTier),
        messages: [{
          role: 'user',
          content: `Analyze this API contract for potential issues:
Provider: ${contract.provider.name}
Consumers: ${consumerNames}
Version: ${contract.version.toString()}
Endpoints: ${contract.endpoints?.length || 0}

Provide:
1. Potential compatibility issues
2. Missing or unclear specifications
3. Recommendations for improvement`
        }],
        maxTokens: this.config.llmMaxTokens,
      });
      return response.content;
    } catch (error) {
      console.warn('[ContractValidatorService] LLM analysis failed:', error);
      return null;
    }
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
        this.cacheValidation(cacheKey, report);
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
    warnings: string[]
  ): void {
    // GraphQL schema validation with syntax checking
    const lines = content.split('\n');
    let braceDepth = 0;
    let hasTypeDefinition = false;
    let hasQueryType = false;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum].trim();

      // Skip comments and empty lines
      if (line.startsWith('#') || line === '') continue;

      // Check for type definitions
      if (line.startsWith('type ') || line.startsWith('input ') || line.startsWith('interface ') || line.startsWith('enum ')) {
        hasTypeDefinition = true;
        if (line.startsWith('type Query')) {
          hasQueryType = true;
        }
      }

      // Check for schema definition
      if (line.startsWith('schema ') || line.startsWith('schema{')) {
        hasTypeDefinition = true;
      }

      // Track brace depth for balance check
      braceDepth += (line.match(/{/g) || []).length;
      braceDepth -= (line.match(/}/g) || []).length;

      // Check for invalid syntax patterns
      if (line.includes('::')) {
        errors.push({
          path: `schema.${schemaId}.line${lineNum + 1}`,
          message: 'Invalid double colon in GraphQL schema',
          code: 'INVALID_GRAPHQL_SYNTAX',
        });
      }

      // Check for field definitions without type
      if (line.includes(':') && !line.includes('type ') && !line.includes('schema')) {
        const colonIndex = line.indexOf(':');
        const afterColon = line.slice(colonIndex + 1).trim();
        if (afterColon === '' || afterColon === '{') {
          errors.push({
            path: `schema.${schemaId}.line${lineNum + 1}`,
            message: 'Field definition missing type',
            code: 'INVALID_GRAPHQL_FIELD',
          });
        }
      }
    }

    // Check for required elements
    if (!hasTypeDefinition) {
      errors.push({
        path: `schema.${schemaId}`,
        message: 'GraphQL schema must contain type definitions',
        code: 'INVALID_GRAPHQL',
      });
    }

    // Check for balanced braces
    if (braceDepth !== 0) {
      errors.push({
        path: `schema.${schemaId}`,
        message: 'GraphQL schema has unbalanced braces',
        code: 'INVALID_GRAPHQL_BRACES',
      });
    }

    // Warn if no Query type
    if (hasTypeDefinition && !hasQueryType && !content.includes('schema {')) {
      warnings.push(`Schema ${schemaId} has no Query type defined`);
    }
  }

  private validateProtobufContent(
    content: string,
    schemaId: string,
    errors: ValidationError[],
    warnings: string[]
  ): void {
    // Protobuf schema validation with syntax checking
    const lines = content.split('\n');
    let braceDepth = 0;
    let hasMessage = false;
    let hasSyntax = false;
    let syntaxVersion: string | null = null;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum].trim();

      // Skip comments and empty lines
      if (line.startsWith('//') || line === '') continue;

      // Check for syntax declaration
      const syntaxMatch = line.match(/^syntax\s*=\s*["']proto(\d)["']\s*;?/);
      if (syntaxMatch) {
        hasSyntax = true;
        syntaxVersion = syntaxMatch[1];
      }

      // Check for message definitions
      if (line.startsWith('message ')) {
        hasMessage = true;
        // Check for valid message name
        const msgMatch = line.match(/^message\s+([A-Z][a-zA-Z0-9_]*)\s*\{?/);
        if (!msgMatch) {
          warnings.push(`Message name should start with uppercase letter at line ${lineNum + 1}`);
        }
      }

      // Check for enum definitions
      if (line.startsWith('enum ')) {
        hasMessage = true; // Enums are also valid definitions
      }

      // Check for service definitions
      if (line.startsWith('service ')) {
        hasMessage = true;
      }

      // Track brace depth
      braceDepth += (line.match(/{/g) || []).length;
      braceDepth -= (line.match(/}/g) || []).length;

      // Check for field definitions (inside messages)
      const fieldMatch = line.match(/^\s*(optional|required|repeated)?\s*(\w+)\s+(\w+)\s*=\s*(\d+)/);
      if (fieldMatch) {
        const [, modifier, , , fieldNum] = fieldMatch;
        const num = parseInt(fieldNum, 10);

        // Field numbers should be positive and within valid range
        if (num <= 0 || num > 536870911) {
          errors.push({
            path: `schema.${schemaId}.line${lineNum + 1}`,
            message: `Invalid field number ${num}`,
            code: 'INVALID_PROTOBUF_FIELD_NUMBER',
          });
        }

        // Warn about reserved field numbers
        if (num >= 19000 && num <= 19999) {
          warnings.push(`Field number ${num} is in reserved range (19000-19999) at line ${lineNum + 1}`);
        }

        // Check for required in proto3
        if (modifier === 'required' && syntaxVersion === '3') {
          errors.push({
            path: `schema.${schemaId}.line${lineNum + 1}`,
            message: 'Required fields are not allowed in proto3',
            code: 'INVALID_PROTOBUF_REQUIRED',
          });
        }
      }
    }

    // Check for required elements
    if (!hasMessage) {
      errors.push({
        path: `schema.${schemaId}`,
        message: 'Protobuf schema must contain message, enum, or service definitions',
        code: 'INVALID_PROTOBUF',
      });
    }

    // Check for balanced braces
    if (braceDepth !== 0) {
      errors.push({
        path: `schema.${schemaId}`,
        message: 'Protobuf schema has unbalanced braces',
        code: 'INVALID_PROTOBUF_BRACES',
      });
    }

    // Warn if no syntax declaration
    if (!hasSyntax) {
      warnings.push(`Schema ${schemaId} has no syntax declaration (defaults to proto2)`);
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

      // JSON Schema validation with type, required, constraints, and nested object/array support
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
    data: unknown,
    schemaContent: string,
    errors: SchemaError[]
  ): Promise<void> {
    // Parse the GraphQL schema to extract type definitions
    const schemaInfo = this.parseGraphQLSchema(schemaContent);
    if (schemaInfo.errors.length > 0) {
      for (const schemaError of schemaInfo.errors) {
        errors.push({
          path: '',
          keyword: 'schema',
          message: schemaError,
          params: {},
        });
      }
      return;
    }

    // Validate the data (expected to be a GraphQL operation)
    if (typeof data !== 'object' || data === null) {
      errors.push({
        path: '',
        keyword: 'type',
        message: 'GraphQL request must be an object with query/mutation',
        params: {},
      });
      return;
    }

    const request = data as Record<string, unknown>;
    const query = request.query as string | undefined;
    const variables = request.variables as Record<string, unknown> | undefined;

    if (!query || typeof query !== 'string') {
      errors.push({
        path: 'query',
        keyword: 'required',
        message: 'GraphQL request must contain a query string',
        params: {},
      });
      return;
    }

    // Parse and validate the operation
    const operationInfo = this.parseGraphQLOperation(query);
    if (operationInfo.errors.length > 0) {
      for (const opError of operationInfo.errors) {
        errors.push({
          path: 'query',
          keyword: 'syntax',
          message: opError,
          params: {},
        });
      }
      return;
    }

    // Validate operation type exists in schema
    const operationType = operationInfo.type; // 'query' | 'mutation' | 'subscription'
    const rootType = this.getRootTypeForOperation(operationType, schemaInfo);
    if (!rootType) {
      errors.push({
        path: 'query',
        keyword: 'operation',
        message: `Schema does not support ${operationType} operations`,
        params: { operationType },
      });
      return;
    }

    // Validate selected fields exist on the root type
    for (const field of operationInfo.fields) {
      const fieldDef = schemaInfo.types[rootType]?.fields[field.name];
      if (!fieldDef) {
        errors.push({
          path: `query.${field.name}`,
          keyword: 'field',
          message: `Field '${field.name}' does not exist on type '${rootType}'`,
          params: { field: field.name, type: rootType },
        });
      } else {
        // Validate arguments if provided
        if (field.arguments) {
          for (const [argName, _argValue] of Object.entries(field.arguments)) {
            if (!fieldDef.arguments?.[argName]) {
              errors.push({
                path: `query.${field.name}.${argName}`,
                keyword: 'argument',
                message: `Unknown argument '${argName}' on field '${field.name}'`,
                params: { argument: argName, field: field.name },
              });
            }
          }
        }

        // Validate nested field selections
        if (field.selections && field.selections.length > 0) {
          const fieldType = this.unwrapGraphQLType(fieldDef.type);
          this.validateGraphQLSelections(
            field.selections,
            fieldType,
            schemaInfo,
            `query.${field.name}`,
            errors
          );
        }
      }
    }

    // Validate variables against operation variable definitions
    if (variables && operationInfo.variableDefinitions) {
      for (const [varName, varDef] of Object.entries(operationInfo.variableDefinitions)) {
        if (varDef.required && !(varName in variables)) {
          errors.push({
            path: `variables.${varName}`,
            keyword: 'required',
            message: `Required variable '${varName}' is missing`,
            params: { variable: varName },
          });
        }
        if (varName in variables) {
          this.validateGraphQLVariableType(variables[varName], varDef.type, `variables.${varName}`, errors);
        }
      }
    }
  }

  /**
   * Parse GraphQL schema to extract type definitions
   */
  private parseGraphQLSchema(schemaContent: string): GraphQLSchemaInfo {
    const info: GraphQLSchemaInfo = {
      types: {},
      queryType: null,
      mutationType: null,
      subscriptionType: null,
      errors: [],
    };

    const lines = schemaContent.split('\n');
    let currentType: string | null = null;
    let currentTypeKind: 'type' | 'input' | 'interface' | 'enum' | null = null;
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip comments and empty lines
      if (line.startsWith('#') || line === '') continue;

      // Detect schema definition
      const schemaMatch = line.match(/^schema\s*\{?/);
      if (schemaMatch) {
        // Parse schema block to find root types
        let schemaBlock = line;
        if (!line.includes('}')) {
          for (let j = i + 1; j < lines.length; j++) {
            schemaBlock += ' ' + lines[j].trim();
            if (lines[j].includes('}')) break;
          }
        }
        const queryMatch = schemaBlock.match(/query\s*:\s*(\w+)/);
        const mutationMatch = schemaBlock.match(/mutation\s*:\s*(\w+)/);
        const subscriptionMatch = schemaBlock.match(/subscription\s*:\s*(\w+)/);
        if (queryMatch) info.queryType = queryMatch[1];
        if (mutationMatch) info.mutationType = mutationMatch[1];
        if (subscriptionMatch) info.subscriptionType = subscriptionMatch[1];
        continue;
      }

      // Detect type definitions
      const typeMatch = line.match(/^(type|input|interface|enum)\s+(\w+)(?:\s+implements\s+(\w+))?\s*\{?/);
      if (typeMatch) {
        currentTypeKind = typeMatch[1] as 'type' | 'input' | 'interface' | 'enum';
        currentType = typeMatch[2];
        info.types[currentType] = {
          kind: currentTypeKind,
          fields: {},
          implements: typeMatch[3] || null,
        };

        // Default Query/Mutation/Subscription types
        if (currentType === 'Query' && !info.queryType) info.queryType = 'Query';
        if (currentType === 'Mutation' && !info.mutationType) info.mutationType = 'Mutation';
        if (currentType === 'Subscription' && !info.subscriptionType) info.subscriptionType = 'Subscription';

        if (line.includes('{')) braceDepth++;
        continue;
      }

      // Track brace depth
      if (line.includes('{')) braceDepth++;
      if (line.includes('}')) {
        braceDepth--;
        if (braceDepth === 0) {
          currentType = null;
          currentTypeKind = null;
        }
        continue;
      }

      // Parse field definitions within a type
      if (currentType && currentTypeKind !== 'enum') {
        const fieldMatch = line.match(/^(\w+)(?:\s*\(([^)]*)\))?\s*:\s*(.+?)(?:\s*@.*)?$/);
        if (fieldMatch) {
          const fieldName = fieldMatch[1];
          const argsStr = fieldMatch[2];
          const fieldType = fieldMatch[3].trim();

          const fieldDef: GraphQLFieldDef = {
            type: fieldType,
            arguments: {},
          };

          // Parse arguments
          if (argsStr) {
            const argMatches = argsStr.matchAll(/(\w+)\s*:\s*([^,\)]+)/g);
            for (const argMatch of argMatches) {
              fieldDef.arguments![argMatch[1]] = { type: argMatch[2].trim() };
            }
          }

          info.types[currentType].fields[fieldName] = fieldDef;
        }
      }

      // Parse enum values
      if (currentType && currentTypeKind === 'enum') {
        const enumValue = line.match(/^(\w+)(?:\s*@.*)?$/);
        if (enumValue) {
          info.types[currentType].fields[enumValue[1]] = { type: 'EnumValue' };
        }
      }
    }

    // Validate schema has at least a query type
    if (!info.queryType && Object.keys(info.types).length > 0) {
      // Check if there's a Query type defined
      if (!info.types['Query']) {
        info.errors.push('GraphQL schema must define a Query type or schema definition');
      }
    }

    return info;
  }

  /**
   * Parse GraphQL operation (query/mutation/subscription)
   */
  private parseGraphQLOperation(query: string): GraphQLOperationInfo {
    const info: GraphQLOperationInfo = {
      type: 'query',
      name: null,
      fields: [],
      variableDefinitions: {},
      errors: [],
    };

    // Remove comments
    const cleanQuery = query.replace(/#[^\n]*/g, '').trim();

    // Detect operation type
    const operationMatch = cleanQuery.match(/^(query|mutation|subscription)(?:\s+(\w+))?\s*(?:\(([^)]*)\))?\s*\{/);
    if (operationMatch) {
      info.type = operationMatch[1] as 'query' | 'mutation' | 'subscription';
      info.name = operationMatch[2] || null;

      // Parse variable definitions
      if (operationMatch[3]) {
        const varMatches = operationMatch[3].matchAll(/\$(\w+)\s*:\s*([^,\)!]+)(!)?/g);
        for (const varMatch of varMatches) {
          info.variableDefinitions[varMatch[1]] = {
            type: varMatch[2].trim(),
            required: !!varMatch[3],
          };
        }
      }
    } else if (cleanQuery.startsWith('{')) {
      // Anonymous query
      info.type = 'query';
    } else if (!cleanQuery.includes('{')) {
      info.errors.push('Invalid GraphQL operation: missing selection set');
      return info;
    }

    // Extract the selection set
    const selectionSetMatch = cleanQuery.match(/\{([\s\S]*)\}/);
    if (!selectionSetMatch) {
      info.errors.push('Invalid GraphQL operation: could not parse selection set');
      return info;
    }

    // Parse fields from selection set
    info.fields = this.parseGraphQLSelectionSet(selectionSetMatch[1]);

    return info;
  }

  /**
   * Parse GraphQL selection set into field list
   */
  private parseGraphQLSelectionSet(selectionSet: string): GraphQLField[] {
    const fields: GraphQLField[] = [];
    let depth = 0;
    let currentField = '';
    let i = 0;

    while (i < selectionSet.length) {
      const char = selectionSet[i];

      if (char === '{') {
        depth++;
        currentField += char;
      } else if (char === '}') {
        depth--;
        currentField += char;
      } else if ((char === '\n' || char === ' ' || char === ',') && depth === 0) {
        if (currentField.trim()) {
          const field = this.parseGraphQLField(currentField.trim());
          if (field) fields.push(field);
        }
        currentField = '';
      } else {
        currentField += char;
      }
      i++;
    }

    // Handle last field
    if (currentField.trim()) {
      const field = this.parseGraphQLField(currentField.trim());
      if (field) fields.push(field);
    }

    return fields;
  }

  /**
   * Parse a single GraphQL field
   */
  private parseGraphQLField(fieldStr: string): GraphQLField | null {
    // Handle alias
    const aliasMatch = fieldStr.match(/^(\w+)\s*:\s*(.+)$/);
    let fieldContent = fieldStr;
    let alias: string | undefined;
    if (aliasMatch && !aliasMatch[2].includes('(') && !aliasMatch[2].includes('{')) {
      // This might be a type annotation in variable, not an alias - skip
    } else if (aliasMatch && (aliasMatch[2].match(/^\w/) || aliasMatch[2].includes('('))) {
      alias = aliasMatch[1];
      fieldContent = aliasMatch[2];
    }

    // Parse field name and arguments
    const fieldMatch = fieldContent.match(/^(\w+)(?:\s*\(([^)]*)\))?(?:\s*\{([\s\S]*)\})?$/);
    if (!fieldMatch) {
      // Try without nested selection
      const simpleMatch = fieldContent.match(/^(\w+)(?:\s*\(([^)]*)\))?/);
      if (simpleMatch) {
        return {
          name: simpleMatch[1],
          alias,
          arguments: simpleMatch[2] ? this.parseGraphQLArguments(simpleMatch[2]) : undefined,
        };
      }
      return null;
    }

    const field: GraphQLField = {
      name: fieldMatch[1],
      alias,
    };

    // Parse arguments
    if (fieldMatch[2]) {
      field.arguments = this.parseGraphQLArguments(fieldMatch[2]);
    }

    // Parse nested selections
    if (fieldMatch[3]) {
      field.selections = this.parseGraphQLSelectionSet(fieldMatch[3]);
    }

    return field;
  }

  /**
   * Parse GraphQL arguments
   */
  private parseGraphQLArguments(argsStr: string): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    const argMatches = argsStr.matchAll(/(\w+)\s*:\s*([^,\)]+)/g);
    for (const match of argMatches) {
      const value = match[2].trim();
      // Parse value (handle variables, strings, numbers, booleans)
      if (value.startsWith('$')) {
        args[match[1]] = { _variable: value.substring(1) };
      } else if (value.startsWith('"') || value.startsWith("'")) {
        args[match[1]] = value.slice(1, -1);
      } else if (value === 'true') {
        args[match[1]] = true;
      } else if (value === 'false') {
        args[match[1]] = false;
      } else if (value === 'null') {
        args[match[1]] = null;
      } else if (!isNaN(Number(value))) {
        args[match[1]] = Number(value);
      } else {
        args[match[1]] = value; // Enum value
      }
    }
    return args;
  }

  /**
   * Get root type name for operation type
   */
  private getRootTypeForOperation(
    operationType: 'query' | 'mutation' | 'subscription',
    schemaInfo: GraphQLSchemaInfo
  ): string | null {
    switch (operationType) {
      case 'query':
        return schemaInfo.queryType;
      case 'mutation':
        return schemaInfo.mutationType;
      case 'subscription':
        return schemaInfo.subscriptionType;
      default:
        return null;
    }
  }

  /**
   * Unwrap GraphQL type (remove [], !)
   */
  private unwrapGraphQLType(type: string): string {
    return type.replace(/[\[\]!]/g, '').trim();
  }

  /**
   * Validate nested field selections
   */
  private validateGraphQLSelections(
    selections: GraphQLField[],
    typeName: string,
    schemaInfo: GraphQLSchemaInfo,
    path: string,
    errors: SchemaError[]
  ): void {
    const typeDef = schemaInfo.types[typeName];
    if (!typeDef) {
      // Could be a scalar type, skip validation
      if (['String', 'Int', 'Float', 'Boolean', 'ID'].includes(typeName)) {
        if (selections.length > 0) {
          errors.push({
            path,
            keyword: 'selection',
            message: `Cannot select fields on scalar type '${typeName}'`,
            params: { type: typeName },
          });
        }
      }
      return;
    }

    for (const selection of selections) {
      const fieldDef = typeDef.fields[selection.name];
      if (!fieldDef) {
        errors.push({
          path: `${path}.${selection.name}`,
          keyword: 'field',
          message: `Field '${selection.name}' does not exist on type '${typeName}'`,
          params: { field: selection.name, type: typeName },
        });
      } else if (selection.selections && selection.selections.length > 0) {
        const nestedType = this.unwrapGraphQLType(fieldDef.type);
        this.validateGraphQLSelections(
          selection.selections,
          nestedType,
          schemaInfo,
          `${path}.${selection.name}`,
          errors
        );
      }
    }
  }

  /**
   * Validate variable type matches expected GraphQL type
   */
  private validateGraphQLVariableType(
    value: unknown,
    expectedType: string,
    path: string,
    errors: SchemaError[]
  ): void {
    const baseType = this.unwrapGraphQLType(expectedType);
    const isNonNull = expectedType.endsWith('!');
    const isList = expectedType.includes('[');

    if (value === null || value === undefined) {
      if (isNonNull) {
        errors.push({
          path,
          keyword: 'type',
          message: `Variable cannot be null (expected ${expectedType})`,
          params: { expectedType },
        });
      }
      return;
    }

    if (isList) {
      if (!Array.isArray(value)) {
        errors.push({
          path,
          keyword: 'type',
          message: `Expected array for type ${expectedType}`,
          params: { expectedType, actualType: typeof value },
        });
      }
      return;
    }

    // Validate scalar types
    switch (baseType) {
      case 'String':
      case 'ID':
        if (typeof value !== 'string') {
          errors.push({
            path,
            keyword: 'type',
            message: `Expected string for type ${baseType}`,
            params: { expectedType: baseType, actualType: typeof value },
          });
        }
        break;
      case 'Int':
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          errors.push({
            path,
            keyword: 'type',
            message: `Expected integer for type Int`,
            params: { expectedType: 'Int', actualType: typeof value },
          });
        }
        break;
      case 'Float':
        if (typeof value !== 'number') {
          errors.push({
            path,
            keyword: 'type',
            message: `Expected number for type Float`,
            params: { expectedType: 'Float', actualType: typeof value },
          });
        }
        break;
      case 'Boolean':
        if (typeof value !== 'boolean') {
          errors.push({
            path,
            keyword: 'type',
            message: `Expected boolean for type Boolean`,
            params: { expectedType: 'Boolean', actualType: typeof value },
          });
        }
        break;
      // Custom types - basic object validation
      default:
        if (typeof value !== 'object') {
          errors.push({
            path,
            keyword: 'type',
            message: `Expected object for type ${baseType}`,
            params: { expectedType: baseType, actualType: typeof value },
          });
        }
    }
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
      const dataArr = data as unknown[];

      // Validate array constraints
      this.validateArrayConstraints(dataArr, schema, path, errors);

      // Validate each item
      if (items) {
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
    } else if (type === 'string' && actualType === 'string') {
      // Validate string constraints
      this.validateStringConstraints(data as string, schema, path, errors);
    } else if ((type === 'number' || type === 'integer') && (actualType === 'number' || actualType === 'integer')) {
      // Validate number constraints
      this.validateNumberConstraints(data as number, schema, path, errors);
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

    // Check enum constraint (applies to any type)
    if (schema.enum) {
      const enumValues = schema.enum as unknown[];
      if (!enumValues.some((v) => JSON.stringify(v) === JSON.stringify(data))) {
        errors.push({
          path,
          keyword: 'enum',
          message: `Value must be one of: ${enumValues.map((v) => JSON.stringify(v)).join(', ')}`,
          params: { allowedValues: enumValues },
        });
      }
    }
  }

  private validateStringConstraints(
    data: string,
    schema: Record<string, unknown>,
    path: string,
    errors: SchemaError[]
  ): void {
    const minLength = schema.minLength as number | undefined;
    const maxLength = schema.maxLength as number | undefined;
    const pattern = schema.pattern as string | undefined;

    if (minLength !== undefined && data.length < minLength) {
      errors.push({
        path,
        keyword: 'minLength',
        message: `String must be at least ${minLength} characters`,
        params: { limit: minLength, actual: data.length },
      });
    }

    if (maxLength !== undefined && data.length > maxLength) {
      errors.push({
        path,
        keyword: 'maxLength',
        message: `String must be at most ${maxLength} characters`,
        params: { limit: maxLength, actual: data.length },
      });
    }

    if (pattern) {
      const regex = createSafeRegex(pattern);
      if (regex && !regex.test(data)) {
        errors.push({
          path,
          keyword: 'pattern',
          message: `String must match pattern: ${pattern}`,
          params: { pattern },
        });
      }
      // If regex is null (unsafe/invalid pattern), skip validation
    }
  }

  private validateNumberConstraints(
    data: number,
    schema: Record<string, unknown>,
    path: string,
    errors: SchemaError[]
  ): void {
    const minimum = schema.minimum as number | undefined;
    const maximum = schema.maximum as number | undefined;
    const exclusiveMinimum = schema.exclusiveMinimum as number | undefined;
    const exclusiveMaximum = schema.exclusiveMaximum as number | undefined;
    const multipleOf = schema.multipleOf as number | undefined;

    if (minimum !== undefined && data < minimum) {
      errors.push({
        path,
        keyword: 'minimum',
        message: `Number must be >= ${minimum}`,
        params: { limit: minimum, actual: data },
      });
    }

    if (maximum !== undefined && data > maximum) {
      errors.push({
        path,
        keyword: 'maximum',
        message: `Number must be <= ${maximum}`,
        params: { limit: maximum, actual: data },
      });
    }

    if (exclusiveMinimum !== undefined && data <= exclusiveMinimum) {
      errors.push({
        path,
        keyword: 'exclusiveMinimum',
        message: `Number must be > ${exclusiveMinimum}`,
        params: { limit: exclusiveMinimum, actual: data },
      });
    }

    if (exclusiveMaximum !== undefined && data >= exclusiveMaximum) {
      errors.push({
        path,
        keyword: 'exclusiveMaximum',
        message: `Number must be < ${exclusiveMaximum}`,
        params: { limit: exclusiveMaximum, actual: data },
      });
    }

    if (multipleOf !== undefined && data % multipleOf !== 0) {
      errors.push({
        path,
        keyword: 'multipleOf',
        message: `Number must be a multiple of ${multipleOf}`,
        params: { multipleOf, actual: data },
      });
    }
  }

  private validateArrayConstraints(
    data: unknown[],
    schema: Record<string, unknown>,
    path: string,
    errors: SchemaError[]
  ): void {
    const minItems = schema.minItems as number | undefined;
    const maxItems = schema.maxItems as number | undefined;
    const uniqueItems = schema.uniqueItems as boolean | undefined;

    if (minItems !== undefined && data.length < minItems) {
      errors.push({
        path,
        keyword: 'minItems',
        message: `Array must have at least ${minItems} items`,
        params: { limit: minItems, actual: data.length },
      });
    }

    if (maxItems !== undefined && data.length > maxItems) {
      errors.push({
        path,
        keyword: 'maxItems',
        message: `Array must have at most ${maxItems} items`,
        params: { limit: maxItems, actual: data.length },
      });
    }

    if (uniqueItems) {
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i++) {
        const serialized = JSON.stringify(data[i]);
        if (seen.has(serialized)) {
          errors.push({
            path: `${path}[${i}]`,
            keyword: 'uniqueItems',
            message: 'Array items must be unique',
            params: { duplicateIndex: i },
          });
          break;
        }
        seen.add(serialized);
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

  /**
   * Cache validation with size limits and TTL tracking.
   * Enforces LRU eviction when cache is full.
   */
  private cacheValidation(key: string, report: ValidationReport): void {
    // Enforce size limit before adding
    if (this.validationCache.size >= this.MAX_CACHED_VALIDATIONS) {
      const firstKey = this.validationCache.keys().next().value;
      if (firstKey) {
        this.validationCache.delete(firstKey);
      }
    }
    this.validationCache.set(key, { ...report, cachedAt: Date.now() });
  }

  /**
   * Clear expired cache entries based on TTL.
   * @returns Number of entries cleaned up
   */
  cleanupCache(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, report] of this.validationCache) {
      if (now - (report.cachedAt || 0) > this.CACHE_TTL_MS) {
        this.validationCache.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * Dispose of all resources and clear caches.
   * Call this method when the service is no longer needed.
   */
  destroy(): void {
    this.validationCache.clear();
  }
}
