/**
 * Agentic QE v3 - API Compatibility Service
 * Implements IApiCompatibilityService for detecting breaking changes
 */

import { Result, ok, err } from '../../../shared/types/index.js';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import type {
  IApiCompatibilityService,
  ApiContract,
  BreakingChange,
  CompatibilityReport,
  NonBreakingChange,
  Deprecation,
  MigrationGuide,
  MigrationStep,
  ContractEndpoint,
  SchemaDefinition,
} from '../interfaces.js';

/**
 * Configuration for the API compatibility service
 */
export interface ApiCompatibilityConfig {
  strictEnumValidation: boolean;
  allowOptionalToRequired: boolean;
  trackDeprecations: boolean;
  maxMigrationSteps: number;
}

const DEFAULT_CONFIG: ApiCompatibilityConfig = {
  strictEnumValidation: true,
  allowOptionalToRequired: false,
  trackDeprecations: true,
  maxMigrationSteps: 50,
};

/**
 * API Compatibility Service Implementation
 * Detects breaking changes between API contract versions
 */
export class ApiCompatibilityService implements IApiCompatibilityService {
  private readonly config: ApiCompatibilityConfig;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<ApiCompatibilityConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Compare two contract versions
   */
  async compareVersions(
    oldContract: ApiContract,
    newContract: ApiContract
  ): Promise<Result<CompatibilityReport>> {
    try {
      const breakingChanges: BreakingChange[] = [];
      const nonBreakingChanges: NonBreakingChange[] = [];
      const deprecations: Deprecation[] = [];

      // Compare endpoints
      await this.compareEndpoints(
        oldContract.endpoints,
        newContract.endpoints,
        oldContract.consumers.map((c) => c.name),
        breakingChanges,
        nonBreakingChanges
      );

      // Compare schemas
      await this.compareSchemas(
        oldContract.schemas,
        newContract.schemas,
        oldContract.consumers.map((c) => c.name),
        breakingChanges,
        nonBreakingChanges
      );

      // Detect deprecations
      if (this.config.trackDeprecations) {
        this.detectDeprecations(oldContract, newContract, deprecations);
      }

      const report: CompatibilityReport = {
        isCompatible: breakingChanges.length === 0,
        breakingChanges,
        nonBreakingChanges,
        deprecations,
      };

      // Store comparison result
      await this.storeComparisonResult(oldContract, newContract, report);

      return ok(report);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Check if new version is backward compatible
   */
  async isBackwardCompatible(
    oldContract: ApiContract,
    newContract: ApiContract
  ): Promise<Result<boolean>> {
    const result = await this.compareVersions(oldContract, newContract);
    if (!result.success) {
      return result;
    }
    return ok(result.value.breakingChanges.length === 0);
  }

  /**
   * Get breaking changes between versions
   */
  async getBreakingChanges(
    oldContract: ApiContract,
    newContract: ApiContract
  ): Promise<Result<BreakingChange[]>> {
    const result = await this.compareVersions(oldContract, newContract);
    if (!result.success) {
      return result;
    }
    return ok(result.value.breakingChanges);
  }

  /**
   * Generate migration guide
   */
  async generateMigrationGuide(
    breakingChanges: BreakingChange[]
  ): Promise<Result<MigrationGuide>> {
    try {
      if (breakingChanges.length === 0) {
        return ok({
          fromVersion: 'unknown',
          toVersion: 'unknown',
          steps: [],
          estimatedEffort: 'trivial',
        });
      }

      const steps: MigrationStep[] = [];
      let stepOrder = 1;

      // Group changes by type for ordered migration
      const removedEndpoints = breakingChanges.filter((c) => c.type === 'removed-endpoint');
      const typeChanges = breakingChanges.filter((c) => c.type === 'type-change');
      const requiredFields = breakingChanges.filter((c) => c.type === 'required-field-added');
      const removedFields = breakingChanges.filter((c) => c.type === 'removed-field');
      const enumChanges = breakingChanges.filter((c) => c.type === 'enum-value-removed');
      const responseCodeChanges = breakingChanges.filter((c) => c.type === 'response-code-change');

      // Add steps for required field additions first (usually need code updates)
      for (const change of requiredFields) {
        steps.push(this.createMigrationStep(stepOrder++, change, 'required-field'));
      }

      // Add steps for type changes
      for (const change of typeChanges) {
        steps.push(this.createMigrationStep(stepOrder++, change, 'type-change'));
      }

      // Add steps for enum value removals
      for (const change of enumChanges) {
        steps.push(this.createMigrationStep(stepOrder++, change, 'enum-change'));
      }

      // Add steps for removed fields
      for (const change of removedFields) {
        steps.push(this.createMigrationStep(stepOrder++, change, 'removed-field'));
      }

      // Add steps for response code changes
      for (const change of responseCodeChanges) {
        steps.push(this.createMigrationStep(stepOrder++, change, 'response-code'));
      }

      // Add steps for removed endpoints last
      for (const change of removedEndpoints) {
        steps.push(this.createMigrationStep(stepOrder++, change, 'removed-endpoint'));
      }

      // Limit steps
      const limitedSteps = steps.slice(0, this.config.maxMigrationSteps);

      // Estimate effort
      const estimatedEffort = this.estimateEffort(breakingChanges);

      return ok({
        fromVersion: 'previous',
        toVersion: 'current',
        steps: limitedSteps,
        estimatedEffort,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async compareEndpoints(
    oldEndpoints: ContractEndpoint[],
    newEndpoints: ContractEndpoint[],
    consumers: string[],
    breakingChanges: BreakingChange[],
    nonBreakingChanges: NonBreakingChange[]
  ): Promise<void> {
    const oldEndpointMap = this.buildEndpointMap(oldEndpoints);
    const newEndpointMap = this.buildEndpointMap(newEndpoints);

    // Check for removed endpoints
    const oldEntries = Array.from(oldEndpointMap.entries());
    for (const [key, oldEndpoint] of oldEntries) {
      if (!newEndpointMap.has(key)) {
        breakingChanges.push({
          type: 'removed-endpoint',
          location: `${oldEndpoint.method} ${oldEndpoint.path}`,
          description: `Endpoint ${oldEndpoint.method} ${oldEndpoint.path} has been removed`,
          impact: 'high',
          affectedConsumers: consumers,
          migrationPath: 'Find alternative endpoint or remove usage',
        });
      }
    }

    // Check for added endpoints (non-breaking)
    const newEntries = Array.from(newEndpointMap.entries());
    for (const [key, newEndpoint] of newEntries) {
      if (!oldEndpointMap.has(key)) {
        nonBreakingChanges.push({
          type: 'added-endpoint',
          location: `${newEndpoint.method} ${newEndpoint.path}`,
          description: `New endpoint ${newEndpoint.method} ${newEndpoint.path} added`,
        });
      }
    }

    // Compare matching endpoints
    for (const [key, oldEndpoint] of oldEntries) {
      const newEndpoint = newEndpointMap.get(key);
      if (newEndpoint) {
        await this.compareEndpointDetails(
          oldEndpoint,
          newEndpoint,
          consumers,
          breakingChanges,
          nonBreakingChanges
        );
      }
    }
  }

  private async compareEndpointDetails(
    oldEndpoint: ContractEndpoint,
    newEndpoint: ContractEndpoint,
    consumers: string[],
    breakingChanges: BreakingChange[],
    _nonBreakingChanges: NonBreakingChange[]
  ): Promise<void> {
    const location = `${oldEndpoint.method} ${oldEndpoint.path}`;

    // Compare request schema reference
    if (oldEndpoint.requestSchema !== newEndpoint.requestSchema) {
      breakingChanges.push({
        type: 'type-change',
        location: `${location} request`,
        description: `Request schema changed from '${oldEndpoint.requestSchema || 'none'}' to '${newEndpoint.requestSchema || 'none'}'`,
        impact: 'high',
        affectedConsumers: consumers,
      });
    }

    // Compare response schema reference
    if (oldEndpoint.responseSchema !== newEndpoint.responseSchema) {
      breakingChanges.push({
        type: 'type-change',
        location: `${location} response`,
        description: `Response schema changed from '${oldEndpoint.responseSchema || 'none'}' to '${newEndpoint.responseSchema || 'none'}'`,
        impact: 'medium',
        affectedConsumers: consumers,
      });
    }

    // Compare expected status codes from examples
    const oldStatusCodes = new Set(oldEndpoint.examples.map((e) => e.statusCode));
    const newStatusCodes = new Set(newEndpoint.examples.map((e) => e.statusCode));

    const oldStatusCodesArray = Array.from(oldStatusCodes);
    for (const code of oldStatusCodesArray) {
      if (!newStatusCodes.has(code)) {
        breakingChanges.push({
          type: 'response-code-change',
          location: `${location} status ${code}`,
          description: `Status code ${code} is no longer documented`,
          impact: 'low',
          affectedConsumers: consumers,
        });
      }
    }
  }

  private async compareSchemas(
    oldSchemas: SchemaDefinition[],
    newSchemas: SchemaDefinition[],
    consumers: string[],
    breakingChanges: BreakingChange[],
    nonBreakingChanges: NonBreakingChange[]
  ): Promise<void> {
    const oldSchemaMap = new Map(oldSchemas.map((s) => [s.id, s]));
    const newSchemaMap = new Map(newSchemas.map((s) => [s.id, s]));

    // Check for removed schemas
    const oldSchemaIds = Array.from(oldSchemaMap.keys());
    for (const id of oldSchemaIds) {
      if (!newSchemaMap.has(id)) {
        breakingChanges.push({
          type: 'removed-field',
          location: `schema:${id}`,
          description: `Schema '${id}' has been removed`,
          impact: 'high',
          affectedConsumers: consumers,
        });
      }
    }

    // Check for added schemas (non-breaking)
    const newSchemaIds = Array.from(newSchemaMap.keys());
    for (const id of newSchemaIds) {
      if (!oldSchemaMap.has(id)) {
        nonBreakingChanges.push({
          type: 'added-field',
          location: `schema:${id}`,
          description: `New schema '${id}' added`,
        });
      }
    }

    // Compare matching schemas
    const oldSchemaEntries = Array.from(oldSchemaMap.entries());
    for (const [id, oldSchema] of oldSchemaEntries) {
      const newSchema = newSchemaMap.get(id);
      if (newSchema) {
        await this.compareSchemaContent(
          oldSchema,
          newSchema,
          consumers,
          breakingChanges,
          nonBreakingChanges
        );
      }
    }
  }

  private async compareSchemaContent(
    oldSchema: SchemaDefinition,
    newSchema: SchemaDefinition,
    consumers: string[],
    breakingChanges: BreakingChange[],
    nonBreakingChanges: NonBreakingChange[]
  ): Promise<void> {
    // Only compare JSON Schema content
    if (oldSchema.type !== 'json-schema' || newSchema.type !== 'json-schema') {
      return;
    }

    try {
      const oldContent = JSON.parse(oldSchema.content) as Record<string, unknown>;
      const newContent = JSON.parse(newSchema.content) as Record<string, unknown>;

      // Compare properties
      const oldProps = (oldContent.properties as Record<string, unknown>) || {};
      const newProps = (newContent.properties as Record<string, unknown>) || {};
      const oldRequired = (oldContent.required as string[]) || [];
      const newRequired = (newContent.required as string[]) || [];

      // Check for removed properties
      for (const prop of Object.keys(oldProps)) {
        if (!(prop in newProps)) {
          breakingChanges.push({
            type: 'removed-field',
            location: `schema:${oldSchema.id}.${prop}`,
            description: `Property '${prop}' has been removed from schema '${oldSchema.id}'`,
            impact: 'high',
            affectedConsumers: consumers,
          });
        }
      }

      // Check for added properties
      for (const prop of Object.keys(newProps)) {
        if (!(prop in oldProps)) {
          nonBreakingChanges.push({
            type: 'added-field',
            location: `schema:${newSchema.id}.${prop}`,
            description: `Property '${prop}' added to schema '${newSchema.id}'`,
          });
        }
      }

      // Check for new required fields (breaking if field existed as optional)
      for (const req of newRequired) {
        if (!oldRequired.includes(req)) {
          if (req in oldProps) {
            // Was optional, now required
            if (!this.config.allowOptionalToRequired) {
              breakingChanges.push({
                type: 'required-field-added',
                location: `schema:${newSchema.id}.${req}`,
                description: `Property '${req}' changed from optional to required in schema '${newSchema.id}'`,
                impact: 'high',
                affectedConsumers: consumers,
              });
            }
          } else if (req in newProps) {
            // New required field
            breakingChanges.push({
              type: 'required-field-added',
              location: `schema:${newSchema.id}.${req}`,
              description: `New required property '${req}' added to schema '${newSchema.id}'`,
              impact: 'high',
              affectedConsumers: consumers,
            });
          }
        }
      }

      // Check for type changes
      for (const prop of Object.keys(oldProps)) {
        if (prop in newProps) {
          const oldPropDef = oldProps[prop] as Record<string, unknown>;
          const newPropDef = newProps[prop] as Record<string, unknown>;

          if (oldPropDef.type !== newPropDef.type) {
            breakingChanges.push({
              type: 'type-change',
              location: `schema:${oldSchema.id}.${prop}`,
              description: `Type of '${prop}' changed from '${oldPropDef.type}' to '${newPropDef.type}'`,
              impact: 'high',
              affectedConsumers: consumers,
            });
          }

          // Check enum values
          if (this.config.strictEnumValidation) {
            const oldEnum = oldPropDef.enum as unknown[] | undefined;
            const newEnum = newPropDef.enum as unknown[] | undefined;

            if (oldEnum && newEnum) {
              for (const value of oldEnum) {
                if (!newEnum.includes(value)) {
                  breakingChanges.push({
                    type: 'enum-value-removed',
                    location: `schema:${oldSchema.id}.${prop}`,
                    description: `Enum value '${value}' removed from '${prop}'`,
                    impact: 'medium',
                    affectedConsumers: consumers,
                  });
                }
              }

              for (const value of newEnum) {
                if (!oldEnum.includes(value)) {
                  nonBreakingChanges.push({
                    type: 'added-enum-value',
                    location: `schema:${newSchema.id}.${prop}`,
                    description: `Enum value '${value}' added to '${prop}'`,
                  });
                }
              }
            }
          }
        }
      }
    } catch {
      // Unable to parse schema content
    }
  }

  private detectDeprecations(
    oldContract: ApiContract,
    newContract: ApiContract,
    deprecations: Deprecation[]
  ): void {
    // Detect deprecations by comparing old and new contracts

    // Build endpoint maps for comparison
    const oldEndpoints = this.buildEndpointMap(oldContract.endpoints);
    const newEndpoints = this.buildEndpointMap(newContract.endpoints);

    // Check for endpoints in old contract that are missing or marked deprecated in new
    for (const [key, oldEndpoint] of oldEndpoints) {
      const newEndpoint = newEndpoints.get(key);

      if (!newEndpoint) {
        // Endpoint removed - this is a deprecation leading to removal
        deprecations.push({
          location: `${oldEndpoint.method} ${oldEndpoint.path}`,
          reason: 'Endpoint has been removed in the new version',
          removalVersion: newContract.version.toString(),
        });
      }
    }

    // Check for deprecated markers in schema content
    for (const schema of newContract.schemas) {
      this.detectSchemaDeprecations(schema, deprecations, newContract.version);
    }

    // Check for deprecated patterns in endpoint paths
    for (const endpoint of newContract.endpoints) {
      // Check if path indicates deprecation (e.g., /v1/ when /v2/ exists)
      if (endpoint.path.includes('/deprecated/')) {
        deprecations.push({
          location: `${endpoint.method} ${endpoint.path}`,
          reason: 'Endpoint path indicates deprecation',
        });
      }

      // Check response schemas for deprecated fields
      if (endpoint.responseSchema) {
        const schema = newContract.schemas.find(
          (s) => s.name === endpoint.responseSchema
        );
        if (schema) {
          this.detectSchemaDeprecations(
            schema,
            deprecations,
            newContract.version,
            `${endpoint.method} ${endpoint.path}`
          );
        }
      }
    }
  }

  private detectSchemaDeprecations(
    schema: SchemaDefinition,
    deprecations: Deprecation[],
    version: Version,
    context?: string
  ): void {
    // Parse schema content to find deprecated markers
    try {
      const schemaContent =
        typeof schema.content === 'string'
          ? JSON.parse(schema.content)
          : schema.content;

      this.scanObjectForDeprecations(
        schemaContent,
        schema.name,
        deprecations,
        version,
        context
      );
    } catch {
      // Unable to parse schema - skip deprecation detection
    }
  }

  private scanObjectForDeprecations(
    obj: unknown,
    path: string,
    deprecations: Deprecation[],
    version: Version,
    context?: string
  ): void {
    if (!obj || typeof obj !== 'object') return;

    const record = obj as Record<string, unknown>;

    // Check for deprecated field marker
    if (record.deprecated === true) {
      const location = context ? `${context} -> ${path}` : path;
      deprecations.push({
        location,
        reason:
          typeof record.description === 'string'
            ? record.description
            : 'Field marked as deprecated',
        removalVersion:
          typeof record.removalVersion === 'string'
            ? record.removalVersion
            : undefined,
        replacement:
          typeof record.replacement === 'string'
            ? record.replacement
            : undefined,
      });
    }

    // Check for x-deprecated extension (OpenAPI convention)
    if (record['x-deprecated'] === true) {
      const location = context ? `${context} -> ${path}` : path;
      deprecations.push({
        location,
        reason:
          typeof record['x-deprecated-message'] === 'string'
            ? record['x-deprecated-message']
            : 'Element marked as deprecated via x-deprecated',
        removalVersion: version.toString(),
      });
    }

    // Recursively check nested objects
    if (record.properties && typeof record.properties === 'object') {
      const props = record.properties as Record<string, unknown>;
      for (const [propName, propValue] of Object.entries(props)) {
        this.scanObjectForDeprecations(
          propValue,
          `${path}.${propName}`,
          deprecations,
          version,
          context
        );
      }
    }

    // Check items for array schemas
    if (record.items && typeof record.items === 'object') {
      this.scanObjectForDeprecations(
        record.items,
        `${path}[]`,
        deprecations,
        version,
        context
      );
    }
  }

  private buildEndpointMap(
    endpoints: ContractEndpoint[]
  ): Map<string, ContractEndpoint> {
    const map = new Map<string, ContractEndpoint>();
    for (const endpoint of endpoints) {
      const key = `${endpoint.method}:${endpoint.path}`;
      map.set(key, endpoint);
    }
    return map;
  }

  private createMigrationStep(
    order: number,
    change: BreakingChange,
    stepType: string
  ): MigrationStep {
    let description: string;
    let codeChanges: string | undefined;
    let automated = false;

    switch (stepType) {
      case 'required-field':
        description = `Add required field: ${change.description}`;
        codeChanges = `// Add the new required field to your request/data objects\n// Location: ${change.location}`;
        automated = false;
        break;

      case 'type-change':
        description = `Update type: ${change.description}`;
        codeChanges = `// Update the type at ${change.location}\n// Follow the new type specification`;
        automated = false;
        break;

      case 'enum-change':
        description = `Update enum usage: ${change.description}`;
        codeChanges = `// Remove usage of deprecated enum value at ${change.location}`;
        automated = true;
        break;

      case 'removed-field':
        description = `Remove field usage: ${change.description}`;
        codeChanges = `// Remove references to ${change.location}`;
        automated = true;
        break;

      case 'response-code':
        description = `Update response handling: ${change.description}`;
        codeChanges = `// Update error handling for ${change.location}`;
        automated = false;
        break;

      case 'removed-endpoint':
        description = `Migrate from removed endpoint: ${change.description}`;
        codeChanges = change.migrationPath
          ? `// ${change.migrationPath}`
          : `// Find alternative for ${change.location}`;
        automated = false;
        break;

      default:
        description = change.description;
        codeChanges = undefined;
        automated = false;
    }

    return {
      order,
      description,
      codeChanges,
      automated,
    };
  }

  private estimateEffort(
    breakingChanges: BreakingChange[]
  ): 'trivial' | 'minor' | 'moderate' | 'major' {
    if (breakingChanges.length === 0) return 'trivial';

    const highImpactCount = breakingChanges.filter((c) => c.impact === 'high').length;
    const mediumImpactCount = breakingChanges.filter((c) => c.impact === 'medium').length;

    if (highImpactCount > 5 || breakingChanges.length > 10) return 'major';
    if (highImpactCount > 2 || mediumImpactCount > 5) return 'moderate';
    if (highImpactCount > 0 || breakingChanges.length > 3) return 'minor';
    return 'trivial';
  }

  private async storeComparisonResult(
    oldContract: ApiContract,
    newContract: ApiContract,
    report: CompatibilityReport
  ): Promise<void> {
    const key = `contract-testing:comparison:${oldContract.id}:${oldContract.version.toString()}:${newContract.version.toString()}`;
    await this.memory.set(
      key,
      {
        oldVersion: oldContract.version.toString(),
        newVersion: newContract.version.toString(),
        isCompatible: report.isCompatible,
        breakingChangeCount: report.breakingChanges.length,
        timestamp: new Date().toISOString(),
      },
      {
        namespace: 'contract-testing',
        ttl: 86400 * 90, // 90 days
      }
    );
  }
}
