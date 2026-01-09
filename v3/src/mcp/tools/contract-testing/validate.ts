/**
 * Agentic QE v3 - Contract Testing MCP Tool
 *
 * qe/contracts/validate - Validate API contracts and detect breaking changes
 *
 * This tool wraps the contract-testing domain services:
 * - ContractValidatorService for contract/schema validation
 * - ApiCompatibilityService for breaking change detection
 */

import { MCPToolBase, MCPToolConfig, MCPToolContext, MCPToolSchema } from '../base.js';
import { ToolResult } from '../../types.js';
import { MemoryBackend } from '../../../kernel/interfaces.js';
import { Version } from '../../../shared/value-objects/index.js';
import { ContractValidatorService } from '../../../domains/contract-testing/services/contract-validator.js';
import { ApiCompatibilityService } from '../../../domains/contract-testing/services/api-compatibility.js';
import {
  ApiContract,
  SchemaDefinition,
  BreakingChange as DomainBreakingChange,
  ValidationError as DomainValidationError,
  Deprecation as DomainDeprecation,
} from '../../../domains/contract-testing/interfaces.js';

// ============================================================================
// Types
// ============================================================================

export interface ContractValidateParams {
  contractPath?: string;
  contractContent?: string;
  providerUrl?: string;
  consumerName?: string;
  baselineVersion?: string;
  baselineContent?: string;
  checkBreakingChanges?: boolean;
  format?: 'openapi' | 'pact' | 'graphql' | 'asyncapi';
  [key: string]: unknown;
}

export interface ContractValidateResult {
  isValid: boolean;
  validationErrors: ValidationError[];
  breakingChanges?: BreakingChange[];
  verificationResult?: VerificationResult;
  compatibility: CompatibilityReport;
  recommendations: string[];
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
}

export interface BreakingChange {
  type: 'removed-endpoint' | 'removed-field' | 'type-change' | 'required-field-added' | 'enum-value-removed';
  location: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  affectedConsumers: string[];
  migrationPath?: string;
}

export interface VerificationResult {
  provider: string;
  consumer: string;
  passed: boolean;
  failures: ContractFailure[];
  warnings: ContractWarning[];
}

export interface ContractFailure {
  endpoint: string;
  type: 'schema-mismatch' | 'status-code-mismatch' | 'missing-endpoint' | 'response-body-mismatch';
  expected: string;
  actual: string;
  message: string;
}

export interface ContractWarning {
  endpoint: string;
  message: string;
  severity: 'high' | 'medium' | 'low';
}

export interface CompatibilityReport {
  isBackwardCompatible: boolean;
  breakingChangeCount: number;
  nonBreakingChangeCount: number;
  deprecations: Deprecation[];
}

export interface Deprecation {
  location: string;
  reason: string;
  removalVersion?: string;
  replacement?: string;
}

// ============================================================================
// Minimal Memory Backend for Standalone Operation
// ============================================================================

function createMinimalMemoryBackend(): MemoryBackend {
  const store = new Map<string, { value: unknown; ttl?: number; created: number }>();

  return {
    async get<T>(key: string): Promise<T | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.ttl && Date.now() - entry.created > entry.ttl * 1000) {
        store.delete(key);
        return null;
      }
      return entry.value as T;
    },
    async set(key: string, value: unknown, options?: { ttl?: number }): Promise<void> {
      store.set(key, { value, ttl: options?.ttl, created: Date.now() });
    },
    async delete(key: string): Promise<boolean> {
      return store.delete(key);
    },
    async search(pattern: string, limit = 100): Promise<string[]> {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      const matches: string[] = [];
      for (const key of store.keys()) {
        if (regex.test(key)) {
          matches.push(key);
          if (matches.length >= limit) break;
        }
      }
      return matches;
    },
    async vectorSearch(_embedding: number[], _limit = 10): Promise<Array<{ key: string; similarity: number }>> {
      return [];
    },
    async storeVector(_key: string, _embedding: number[], _metadata?: Record<string, unknown>): Promise<void> {
      // Minimal implementation
    },
  };
}

// ============================================================================
// Tool Implementation
// ============================================================================

export class ContractValidateTool extends MCPToolBase<ContractValidateParams, ContractValidateResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/contracts/validate',
    description: 'Validate API contracts, detect breaking changes, and verify provider-consumer compatibility.',
    domain: 'contract-testing',
    schema: CONTRACT_VALIDATE_SCHEMA,
    streaming: true,
    timeout: 180000,
  };

  private contractValidator: ContractValidatorService | null = null;
  private apiCompatibility: ApiCompatibilityService | null = null;

  private getServices(context: MCPToolContext): {
    contractValidator: ContractValidatorService;
    apiCompatibility: ApiCompatibilityService;
  } {
    if (!this.contractValidator || !this.apiCompatibility) {
      const memory = (context as Record<string, unknown>).memory as MemoryBackend || createMinimalMemoryBackend();
      this.contractValidator = new ContractValidatorService(memory);
      this.apiCompatibility = new ApiCompatibilityService(memory);
    }
    return {
      contractValidator: this.contractValidator,
      apiCompatibility: this.apiCompatibility,
    };
  }

  async execute(
    params: ContractValidateParams,
    context: MCPToolContext
  ): Promise<ToolResult<ContractValidateResult>> {
    const {
      contractPath,
      contractContent,
      providerUrl,
      consumerName,
      baselineVersion,
      baselineContent,
      checkBreakingChanges = true,
      format = 'openapi',
    } = params;

    const { contractValidator, apiCompatibility } = this.getServices(context);

    try {
      if (!contractPath && !contractContent) {
        return { success: false, error: 'Either contractPath or contractContent is required' };
      }

      this.emitStream(context, {
        status: 'validating',
        message: `Validating ${format} contract`,
      });

      if (this.isAborted(context)) {
        return { success: false, error: 'Operation aborted' };
      }

      const content = contractContent || contractPath || '';
      const validationErrors: ValidationError[] = [];
      let breakingChanges: BreakingChange[] | undefined;
      let verificationResult: VerificationResult | undefined;
      let compatibility: CompatibilityReport;

      // Validate based on format
      if (format === 'openapi') {
        // Use real OpenAPI validation
        const openApiResult = await contractValidator.validateOpenAPI(content);

        if (openApiResult.success) {
          const result = openApiResult.value;

          // Convert domain errors to MCP format
          for (const error of result.errors) {
            validationErrors.push({
              path: error.path,
              message: error.message,
              code: error.code,
              severity: 'error',
            });
          }

          // Add warnings
          for (const warning of result.warnings) {
            validationErrors.push({
              path: '',
              message: warning,
              code: 'WARNING',
              severity: 'warning',
            });
          }

          this.emitStream(context, {
            status: 'analyzed',
            message: `Found ${result.endpointCount} endpoints, ${result.schemaCount} schemas`,
          });
        }
      } else {
        // Build contract object for other formats
        const contract = this.buildContractFromContent(content, format, consumerName);

        // Validate contract structure using real service
        const validationResult = await contractValidator.validateContract(contract);

        if (validationResult.success) {
          const report = validationResult.value;

          // Convert domain errors to MCP format
          for (const error of report.errors) {
            validationErrors.push(this.convertValidationError(error));
          }

          // Add warnings
          for (const warning of report.warnings) {
            validationErrors.push({
              path: '',
              message: warning,
              code: 'WARNING',
              severity: 'warning',
            });
          }
        }
      }

      // Check breaking changes if baseline provided
      if (checkBreakingChanges && (baselineVersion || baselineContent)) {
        this.emitStream(context, {
          status: 'comparing',
          message: 'Detecting breaking changes',
        });

        const currentContract = this.buildContractFromContent(content, format, consumerName);
        const baselineContract = this.buildContractFromContent(
          baselineContent || content,
          format,
          consumerName,
          baselineVersion
        );

        const compatibilityResult = await apiCompatibility.compareVersions(
          baselineContract,
          currentContract
        );

        if (compatibilityResult.success) {
          breakingChanges = compatibilityResult.value.breakingChanges.map(c =>
            this.convertBreakingChange(c)
          );

          compatibility = {
            isBackwardCompatible: compatibilityResult.value.isCompatible,
            breakingChangeCount: compatibilityResult.value.breakingChanges.length,
            nonBreakingChangeCount: compatibilityResult.value.nonBreakingChanges.length,
            deprecations: compatibilityResult.value.deprecations.map(d =>
              this.convertDeprecation(d)
            ),
          };
        } else {
          compatibility = this.generateDefaultCompatibility(validationErrors, breakingChanges);
        }
      } else {
        compatibility = this.generateDefaultCompatibility(validationErrors, breakingChanges);
      }

      // Verify against provider if URL provided
      if (providerUrl) {
        this.emitStream(context, {
          status: 'verifying',
          message: 'Verifying against provider',
        });

        verificationResult = await this.verifyAgainstProvider(
          providerUrl,
          consumerName || 'default',
          content,
          format,
          contractValidator
        );
      }

      const isValid = validationErrors.filter(e => e.severity === 'error').length === 0;

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        validationErrors,
        breakingChanges,
        verificationResult
      );

      this.emitStream(context, {
        status: 'complete',
        message: isValid ? 'Contract is valid' : `Found ${validationErrors.length} issues`,
        progress: 100,
      });

      return {
        success: true,
        data: {
          isValid,
          validationErrors,
          breakingChanges,
          verificationResult,
          compatibility,
          recommendations,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Contract validation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private buildContractFromContent(
    content: string,
    format: string,
    consumerName?: string,
    version?: string
  ): ApiContract {
    const contractId = `contract-${Date.now()}`;
    const contractVersion = Version.parse(version || '1.0.0');
    const schemas: SchemaDefinition[] = [];
    const endpoints: ApiContract['endpoints'] = [];

    // Parse content based on format
    if (format === 'openapi') {
      try {
        const parsed = JSON.parse(content);

        // Extract schemas from components
        const components = parsed.components as Record<string, unknown> | undefined;
        const schemasDef = (components?.schemas as Record<string, unknown>) || {};

        for (const [name, schemaContent] of Object.entries(schemasDef)) {
          schemas.push({
            id: name,
            name,
            type: 'openapi',
            content: JSON.stringify(schemaContent),
          });
        }

        // Extract endpoints from paths
        const paths = (parsed.paths as Record<string, unknown>) || {};
        for (const [path, methods] of Object.entries(paths)) {
          if (typeof methods === 'object' && methods !== null) {
            const methodsObj = methods as Record<string, unknown>;
            const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

            for (const method of httpMethods) {
              if (method in methodsObj) {
                const operation = methodsObj[method] as Record<string, unknown>;
                endpoints.push({
                  path,
                  method: method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS',
                  description: (operation.summary as string) || (operation.description as string) || '',
                  examples: [],
                });
              }
            }
          }
        }
      } catch {
        // Unable to parse - return minimal contract
      }
    } else if (format === 'graphql') {
      schemas.push({
        id: 'graphql-schema',
        name: 'GraphQL Schema',
        type: 'graphql',
        content,
      });
    } else if (format === 'pact') {
      try {
        const parsed = JSON.parse(content);
        const interactions = (parsed.interactions as Array<Record<string, unknown>>) || [];

        for (const interaction of interactions) {
          const request = interaction.request as Record<string, unknown> | undefined;
          if (request) {
            endpoints.push({
              path: (request.path as string) || '/',
              method: ((request.method as string) || 'GET').toUpperCase() as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
              description: (interaction.description as string) || '',
              examples: [],
            });
          }
        }
      } catch {
        // Unable to parse
      }
    }

    return {
      id: contractId,
      name: `${format}-contract`,
      version: contractVersion,
      type: format as 'rest' | 'graphql' | 'grpc' | 'event',
      provider: {
        name: 'provider',
        version: '1.0.0',
      },
      consumers: [
        {
          name: consumerName || 'default',
          version: '1.0.0',
        },
      ],
      endpoints,
      schemas,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [format],
      },
    };
  }

  private convertValidationError(error: DomainValidationError): ValidationError {
    return {
      path: error.path,
      message: error.message,
      code: error.code,
      severity: 'error',
    };
  }

  private convertBreakingChange(change: DomainBreakingChange): BreakingChange {
    return {
      type: change.type as BreakingChange['type'],
      location: change.location,
      description: change.description,
      impact: change.impact,
      affectedConsumers: change.affectedConsumers,
      migrationPath: change.migrationPath,
    };
  }

  private convertDeprecation(deprecation: DomainDeprecation): Deprecation {
    return {
      location: deprecation.location,
      reason: deprecation.reason,
      removalVersion: deprecation.removalVersion,
      replacement: deprecation.replacement,
    };
  }

  private generateDefaultCompatibility(
    errors: ValidationError[],
    breakingChanges?: BreakingChange[]
  ): CompatibilityReport {
    return {
      isBackwardCompatible: !breakingChanges || breakingChanges.length === 0,
      breakingChangeCount: breakingChanges?.length || 0,
      nonBreakingChangeCount: errors.filter(e => e.severity !== 'error').length,
      deprecations: [],
    };
  }

  private async verifyAgainstProvider(
    providerUrl: string,
    consumerName: string,
    contractContent: string,
    format: string,
    contractValidator: ContractValidatorService
  ): Promise<VerificationResult> {
    const failures: ContractFailure[] = [];
    const warnings: ContractWarning[] = [];

    // Build contract and verify
    const contract = this.buildContractFromContent(contractContent, format, consumerName);

    // Validate each endpoint against the provider
    for (const endpoint of contract.endpoints) {
      try {
        // Construct the full URL
        const url = `${providerUrl}${endpoint.path}`;

        // Make a simple request to verify the endpoint exists
        const response = await fetch(url, {
          method: endpoint.method === 'GET' ? 'GET' : 'OPTIONS',
          headers: {
            'Accept': 'application/json',
          },
        });

        if (!response.ok && response.status !== 405) {
          // 405 is acceptable for OPTIONS on some endpoints
          if (response.status === 404) {
            failures.push({
              endpoint: `${endpoint.method} ${endpoint.path}`,
              type: 'missing-endpoint',
              expected: 'Endpoint should exist',
              actual: `Got ${response.status}`,
              message: `Endpoint not found at provider`,
            });
          } else {
            warnings.push({
              endpoint: `${endpoint.method} ${endpoint.path}`,
              message: `Unexpected status ${response.status}`,
              severity: 'medium',
            });
          }
        }

        // If there's a response schema, validate the response
        if (endpoint.responseSchema && response.ok) {
          const responseBody = await response.json();
          const schema = contract.schemas.find(s => s.id === endpoint.responseSchema);

          if (schema) {
            const validationResult = await contractValidator.validateResponse(responseBody, schema);
            if (validationResult.success && !validationResult.value.isValid) {
              for (const error of validationResult.value.errors) {
                failures.push({
                  endpoint: `${endpoint.method} ${endpoint.path}`,
                  type: 'schema-mismatch',
                  expected: `Schema ${endpoint.responseSchema}`,
                  actual: error.message,
                  message: `Response does not match schema: ${error.message}`,
                });
              }
            }
          }
        }
      } catch (error) {
        // Network error or other issue
        warnings.push({
          endpoint: `${endpoint.method} ${endpoint.path}`,
          message: `Failed to verify: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'high',
        });
      }
    }

    return {
      provider: providerUrl,
      consumer: consumerName,
      passed: failures.length === 0,
      failures,
      warnings,
    };
  }

  private generateRecommendations(
    errors: ValidationError[],
    breakingChanges?: BreakingChange[],
    verification?: VerificationResult
  ): string[] {
    const recs: string[] = [];

    // Check for validation errors
    const errorCount = errors.filter(e => e.severity === 'error').length;
    if (errorCount > 0) {
      recs.push(`Fix ${errorCount} validation error${errorCount > 1 ? 's' : ''} before deploying`);
    }

    // Check for breaking changes
    if (breakingChanges && breakingChanges.length > 0) {
      const highImpact = breakingChanges.filter(c => c.impact === 'high').length;
      if (highImpact > 0) {
        recs.push(`Address ${highImpact} high-impact breaking change${highImpact > 1 ? 's' : ''} before release`);
      }
      recs.push('Coordinate with affected consumers before releasing breaking changes');
      recs.push('Consider versioning the API to maintain backward compatibility');
    }

    // Check verification results
    if (verification) {
      if (!verification.passed) {
        recs.push(`Provider verification failed with ${verification.failures.length} failure${verification.failures.length > 1 ? 's' : ''}`);

        // Specific recommendations based on failure types
        const missingEndpoints = verification.failures.filter(f => f.type === 'missing-endpoint');
        if (missingEndpoints.length > 0) {
          recs.push('Ensure all contract endpoints are implemented in the provider');
        }

        const schemaMismatches = verification.failures.filter(f => f.type === 'schema-mismatch');
        if (schemaMismatches.length > 0) {
          recs.push('Update provider responses to match the contract schema');
        }
      }

      if (verification.warnings.length > 0) {
        const highSeverity = verification.warnings.filter(w => w.severity === 'high');
        if (highSeverity.length > 0) {
          recs.push('Investigate high-severity verification warnings');
        }
      }
    }

    // Check for warnings
    const warningCount = errors.filter(e => e.severity === 'warning').length;
    if (warningCount > 0) {
      recs.push(`Review ${warningCount} warning${warningCount > 1 ? 's' : ''} for potential issues`);
    }

    // Default recommendation if everything is good
    if (recs.length === 0) {
      recs.push('Contract is valid and backward compatible');
    }

    return recs;
  }
}

// ============================================================================
// Schema
// ============================================================================

const CONTRACT_VALIDATE_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    contractPath: {
      type: 'string',
      description: 'Path to contract file',
    },
    contractContent: {
      type: 'string',
      description: 'Contract content as string',
    },
    providerUrl: {
      type: 'string',
      description: 'Provider URL for verification',
    },
    consumerName: {
      type: 'string',
      description: 'Consumer name for contract',
    },
    baselineVersion: {
      type: 'string',
      description: 'Baseline version for breaking change detection',
    },
    baselineContent: {
      type: 'string',
      description: 'Baseline contract content for comparison',
    },
    checkBreakingChanges: {
      type: 'boolean',
      description: 'Check for breaking changes',
      default: true,
    },
    format: {
      type: 'string',
      description: 'Contract format',
      enum: ['openapi', 'pact', 'graphql', 'asyncapi'],
      default: 'openapi',
    },
  },
};
