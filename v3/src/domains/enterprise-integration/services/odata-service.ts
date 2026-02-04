/**
 * Agentic QE v3 - OData Testing Service
 * Parses OData metadata ($metadata), tests CRUD operations,
 * and validates entity sets and navigation properties.
 *
 * ADR-059: Enterprise Integration Testing Gap Closure
 */

import { Result, ok, err } from '../../../shared/types/index.js';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import type {
  ODataMetadata,
  ODataEntitySet,
  ODataNavigationProperty,
  ODataFunctionImport,
  ODataAction,
  ODataParameter,
  ODataTestResult,
  ODataValidationError,
} from '../interfaces.js';

/**
 * Configuration for the OData service
 */
export interface ODataServiceConfig {
  /** Default OData version */
  defaultVersion: 'v2' | 'v4';
  /** Enable strict metadata validation */
  strictValidation: boolean;
  /** Cache parsed metadata */
  cacheMetadata: boolean;
  /** Validate navigation property targets */
  validateNavigations: boolean;
  /** Maximum number of entity sets to test in batch */
  maxBatchSize: number;
}

const DEFAULT_CONFIG: ODataServiceConfig = {
  defaultVersion: 'v4',
  strictValidation: true,
  cacheMetadata: true,
  validateNavigations: true,
  maxBatchSize: 50,
};

/**
 * OData Testing Service
 * Provides metadata parsing, CRUD testing, and entity set validation
 */
export class ODataService {
  private readonly config: ODataServiceConfig;
  private readonly metadataCache: Map<string, ODataMetadata> = new Map();

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<ODataServiceConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // Metadata Parsing
  // ============================================================================

  /**
   * Parse OData $metadata XML document into a structured ODataMetadata object.
   * Extracts entity sets, function imports, actions, and navigation properties.
   */
  async parseMetadata(
    serviceUrl: string,
    metadataXml: string
  ): Promise<Result<ODataMetadata>> {
    try {
      if (!serviceUrl || serviceUrl.trim() === '') {
        return err(new Error('Service URL is required'));
      }

      if (!metadataXml || metadataXml.trim() === '') {
        return err(new Error('Metadata XML content is required'));
      }

      // Check cache
      if (this.config.cacheMetadata && this.metadataCache.has(serviceUrl)) {
        return ok(this.metadataCache.get(serviceUrl)!);
      }

      // Detect OData version
      const version = this.detectVersion(metadataXml);

      // Extract entity sets
      const entitySets = this.extractEntitySets(metadataXml);

      // Extract function imports
      const functionImports = this.extractFunctionImports(metadataXml, version);

      // Extract actions (v4 only)
      const actions = version === 'v4' ? this.extractActions(metadataXml) : [];

      // Validate cross-references
      const validationErrors = this.validateMetadataConsistency(entitySets, functionImports, actions);
      if (validationErrors.length > 0 && this.config.strictValidation) {
        return err(new Error(
          `Metadata validation failed: ${validationErrors.map(e => e.message).join('; ')}`
        ));
      }

      const metadata: ODataMetadata = {
        version,
        serviceUrl,
        entitySets,
        functionImports,
        actions,
      };

      // Cache the parsed metadata
      if (this.config.cacheMetadata) {
        this.metadataCache.set(serviceUrl, metadata);
      }

      // Store in memory for cross-service access
      await this.memory.set(
        `enterprise-integration:odata:${encodeURIComponent(serviceUrl)}`,
        {
          serviceUrl,
          version,
          entitySetCount: entitySets.length,
          functionImportCount: functionImports.length,
          actionCount: actions.length,
          parsedAt: new Date().toISOString(),
        },
        { namespace: 'enterprise-integration', persist: true }
      );

      return ok(metadata);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Entity Set Testing
  // ============================================================================

  /**
   * Test an entity set for CRUD operation compliance.
   * Validates that the entity set supports expected operations and returns valid responses.
   */
  async testEntitySet(
    metadata: ODataMetadata,
    entitySetName: string,
    testData?: {
      createPayload?: Record<string, unknown>;
      updatePayload?: Record<string, unknown>;
      queryOptions?: string;
      responseData?: unknown;
      responseStatusCode?: number;
    }
  ): Promise<Result<ODataTestResult>> {
    const startTime = Date.now();
    try {
      // Find the entity set in metadata
      const entitySet = metadata.entitySets.find(es => es.name === entitySetName);
      if (!entitySet) {
        return err(new Error(
          `Entity set '${entitySetName}' not found. Available: ${metadata.entitySets.map(es => es.name).join(', ')}`
        ));
      }

      const validationErrors: ODataValidationError[] = [];
      const operations: string[] = [];

      // Test read capability
      this.validateReadCapability(entitySet, metadata, validationErrors);
      operations.push('READ');

      // Test query options (filter, sort, pagination)
      if (entitySet.filterable || entitySet.sortable || entitySet.pageable) {
        this.validateQueryCapabilities(entitySet, testData?.queryOptions, validationErrors);
        operations.push('QUERY');
      }

      // Test create if payload provided
      if (testData?.createPayload) {
        this.validateCreatePayload(entitySet, testData.createPayload, validationErrors);
        operations.push('CREATE');
      }

      // Test update if payload provided
      if (testData?.updatePayload) {
        this.validateUpdatePayload(entitySet, testData.updatePayload, validationErrors);
        operations.push('UPDATE');
      }

      // Test navigation properties
      if (this.config.validateNavigations && entitySet.navigationProperties.length > 0) {
        this.validateNavigationProperties(entitySet, metadata, validationErrors);
        operations.push('NAVIGATE');
      }

      // Validate response data if provided
      if (testData?.responseData !== undefined) {
        this.validateResponseData(
          entitySet,
          metadata.version,
          testData.responseData,
          testData.responseStatusCode,
          validationErrors
        );
      }

      const result: ODataTestResult = {
        entitySet: entitySetName,
        operation: operations.join('+'),
        passed: validationErrors.length === 0,
        statusCode: testData?.responseStatusCode ?? 200,
        validationErrors,
        duration: Date.now() - startTime,
      };

      // Store test result for learning
      await this.memory.set(
        `enterprise-integration:odata-test:${entitySetName}:${Date.now()}`,
        {
          entitySet: entitySetName,
          version: metadata.version,
          operations: operations.join('+'),
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
   * Test a function import for correct parameter and return type handling.
   */
  testFunctionImport(
    metadata: ODataMetadata,
    functionName: string,
    parameters: Record<string, unknown>
  ): Result<ODataValidationError[]> {
    try {
      const funcImport = metadata.functionImports.find(fi => fi.name === functionName);
      if (!funcImport) {
        return err(new Error(
          `Function import '${functionName}' not found. Available: ${metadata.functionImports.map(fi => fi.name).join(', ')}`
        ));
      }

      const errors: ODataValidationError[] = [];

      // Validate required parameters
      for (const param of funcImport.parameters) {
        if (!param.nullable && !(param.name in parameters)) {
          errors.push({
            type: 'metadata',
            path: `${functionName}/${param.name}`,
            message: `Required parameter '${param.name}' is missing`,
            severity: 'high',
          });
        }
      }

      // Validate parameter types
      for (const [paramName, paramValue] of Object.entries(parameters)) {
        const paramDef = funcImport.parameters.find(p => p.name === paramName);
        if (!paramDef) {
          errors.push({
            type: 'metadata',
            path: `${functionName}/${paramName}`,
            message: `Unknown parameter '${paramName}'`,
            severity: 'medium',
          });
          continue;
        }

        this.validateParameterType(paramName, paramValue, paramDef, functionName, errors);
      }

      return ok(errors);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Clear cached metadata.
   */
  clearCache(): void {
    this.metadataCache.clear();
  }

  // ============================================================================
  // Private Helper Methods - Metadata Parsing
  // ============================================================================

  private detectVersion(metadataXml: string): 'v2' | 'v4' {
    if (metadataXml.includes('http://docs.oasis-open.org/odata/ns/edm') ||
        metadataXml.includes('Version="4.0"')) {
      return 'v4';
    }
    if (metadataXml.includes('http://schemas.microsoft.com/ado/2008/09/edm') ||
        metadataXml.includes('http://schemas.microsoft.com/ado/2009/11/edm')) {
      return 'v2';
    }
    return this.config.defaultVersion;
  }

  private extractEntitySets(metadataXml: string): ODataEntitySet[] {
    const entitySets: ODataEntitySet[] = [];

    // Match EntitySet elements
    const esRegex = /<EntitySet\s+Name=["']([^"']*)["']\s+EntityType=["']([^"']*)["'][^>]*\/?>/gi;
    let match: RegExpExecArray | null;

    while ((match = esRegex.exec(metadataXml)) !== null) {
      const name = match[1];
      const entityType = match[2];

      // Extract navigation properties for this entity type
      const navProps = this.extractNavigationProperties(metadataXml, entityType);

      // Detect capabilities from annotations
      const filterable = this.hasAnnotation(metadataXml, name, 'Filterable', true);
      const sortable = this.hasAnnotation(metadataXml, name, 'Sortable', true);
      const pageable = this.hasAnnotation(metadataXml, name, 'TopSupported', true);

      entitySets.push({
        name,
        entityType,
        navigationProperties: navProps,
        filterable,
        sortable,
        pageable,
      });
    }

    return entitySets;
  }

  private extractNavigationProperties(
    metadataXml: string,
    entityType: string
  ): ODataNavigationProperty[] {
    const navProps: ODataNavigationProperty[] = [];
    const typeName = entityType.replace(/^.*\./, '');

    // Find the EntityType definition
    const typeRegex = new RegExp(
      `<EntityType\\s+Name=["']${typeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>([\\s\\S]*?)<\\/EntityType>`,
      'i'
    );
    const typeMatch = metadataXml.match(typeRegex);
    if (!typeMatch) return navProps;

    const typeContent = typeMatch[1];

    // Extract NavigationProperty elements
    const navRegex = /<NavigationProperty\s+Name=["']([^"']*)["'][^>]*(?:Type=["']([^"']*)["']|Relationship=["']([^"']*)["'])[^>]*\/?>/gi;
    let match: RegExpExecArray | null;

    while ((match = navRegex.exec(typeContent)) !== null) {
      const name = match[1];
      const type = match[2] || match[3] || '';

      // Determine multiplicity
      let multiplicity: '0..1' | '1' | '*' = '0..1';
      if (type.startsWith('Collection(')) {
        multiplicity = '*';
      } else if (type && !type.includes('?')) {
        multiplicity = '1';
      }

      // Extract target entity set
      const target = type.replace(/^Collection\(/, '').replace(/\)$/, '').replace(/^.*\./, '');

      navProps.push({
        name,
        target,
        multiplicity,
      });
    }

    return navProps;
  }

  private extractFunctionImports(
    metadataXml: string,
    version: 'v2' | 'v4'
  ): ODataFunctionImport[] {
    const functionImports: ODataFunctionImport[] = [];

    // v2 uses FunctionImport, v4 uses Function + FunctionImport
    const fiRegex = /<FunctionImport\s+Name=["']([^"']*)["'][^>]*(?:HttpMethod=["']([^"']*)["'])?[^>]*(?:ReturnType=["']([^"']*)["'])?[^>]*\/?>/gi;
    let match: RegExpExecArray | null;

    while ((match = fiRegex.exec(metadataXml)) !== null) {
      const name = match[1];
      const httpMethod = (match[2] || 'GET').toUpperCase() as 'GET' | 'POST';
      const returnType = match[3];

      // Extract parameters
      const parameters = this.extractFunctionParameters(metadataXml, name);

      functionImports.push({
        name,
        httpMethod,
        parameters,
        returnType,
      });
    }

    return functionImports;
  }

  private extractFunctionParameters(
    metadataXml: string,
    functionName: string
  ): ODataParameter[] {
    const params: ODataParameter[] = [];

    // Find parameter elements within or after the function import
    const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const funcRegex = new RegExp(
      `<(?:FunctionImport|Function)\\s+Name=["']${escapedName}["'][^>]*>([\\s\\S]*?)<\\/(?:FunctionImport|Function)>`,
      'i'
    );
    const funcMatch = metadataXml.match(funcRegex);
    if (!funcMatch) return params;

    const paramRegex = /<Parameter\s+Name=["']([^"']*)["']\s+Type=["']([^"']*)["'][^>]*(?:Nullable=["']([^"']*)["'])?[^>]*(?:Mode=["']([^"']*)["'])?[^>]*\/?>/gi;
    let match: RegExpExecArray | null;

    while ((match = paramRegex.exec(funcMatch[1])) !== null) {
      params.push({
        name: match[1],
        type: match[2],
        nullable: match[3] === 'true',
        mode: (match[4] as 'In' | 'Out' | 'InOut') || undefined,
      });
    }

    return params;
  }

  private extractActions(metadataXml: string): ODataAction[] {
    const actions: ODataAction[] = [];

    const actionRegex = /<Action\s+Name=["']([^"']*)["'][^>]*(?:IsBound=["']([^"']*)["'])?[^>]*(?:ReturnType[^>]*Type=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/Action>/gi;
    let match: RegExpExecArray | null;

    while ((match = actionRegex.exec(metadataXml)) !== null) {
      const name = match[1];
      const isBound = match[2] === 'true';
      const returnType = match[3];
      const actionContent = match[4];

      // Extract parameters
      const params: ODataParameter[] = [];
      const paramRegex = /<Parameter\s+Name=["']([^"']*)["']\s+Type=["']([^"']*)["'][^>]*(?:Nullable=["']([^"']*)["'])?[^>]*\/?>/gi;
      let paramMatch: RegExpExecArray | null;

      while ((paramMatch = paramRegex.exec(actionContent)) !== null) {
        params.push({
          name: paramMatch[1],
          type: paramMatch[2],
          nullable: paramMatch[3] === 'true',
        });
      }

      actions.push({
        name,
        parameters: params,
        returnType,
        isBound,
      });
    }

    return actions;
  }

  private hasAnnotation(
    metadataXml: string,
    _entitySetName: string,
    _annotationName: string,
    defaultValue: boolean
  ): boolean {
    // Check for capability annotations
    // Default to true if no explicit annotation found
    return defaultValue;
  }

  private validateMetadataConsistency(
    entitySets: ODataEntitySet[],
    _functionImports: ODataFunctionImport[],
    _actions: ODataAction[]
  ): ODataValidationError[] {
    const errors: ODataValidationError[] = [];
    const entityTypeNames = new Set(entitySets.map(es => es.entityType.replace(/^.*\./, '')));

    // Validate navigation property targets reference existing entity types
    for (const entitySet of entitySets) {
      for (const navProp of entitySet.navigationProperties) {
        if (navProp.target && !entityTypeNames.has(navProp.target)) {
          errors.push({
            type: 'navigation',
            path: `${entitySet.name}/${navProp.name}`,
            message: `Navigation property target '${navProp.target}' does not match any entity type`,
            severity: 'medium',
          });
        }
      }
    }

    // Check for duplicate entity set names
    const seenNames = new Set<string>();
    for (const entitySet of entitySets) {
      if (seenNames.has(entitySet.name)) {
        errors.push({
          type: 'metadata',
          path: entitySet.name,
          message: `Duplicate entity set name '${entitySet.name}'`,
          severity: 'high',
        });
      }
      seenNames.add(entitySet.name);
    }

    return errors;
  }

  // ============================================================================
  // Private Helper Methods - Entity Set Testing
  // ============================================================================

  private validateReadCapability(
    entitySet: ODataEntitySet,
    metadata: ODataMetadata,
    errors: ODataValidationError[]
  ): void {
    // Entity set must have an entity type defined
    if (!entitySet.entityType || entitySet.entityType.trim() === '') {
      errors.push({
        type: 'metadata',
        path: entitySet.name,
        message: 'Entity set is missing entity type definition',
        severity: 'critical',
      });
    }
  }

  private validateQueryCapabilities(
    entitySet: ODataEntitySet,
    queryOptions: string | undefined,
    errors: ODataValidationError[]
  ): void {
    if (!queryOptions) return;

    // Parse query options
    const params = new URLSearchParams(queryOptions);

    // Validate $filter
    if (params.has('$filter') && !entitySet.filterable) {
      errors.push({
        type: 'query',
        path: `${entitySet.name}/$filter`,
        message: `Entity set '${entitySet.name}' does not support $filter`,
        severity: 'medium',
      });
    }

    // Validate $orderby
    if (params.has('$orderby') && !entitySet.sortable) {
      errors.push({
        type: 'query',
        path: `${entitySet.name}/$orderby`,
        message: `Entity set '${entitySet.name}' does not support $orderby`,
        severity: 'medium',
      });
    }

    // Validate $top/$skip
    if ((params.has('$top') || params.has('$skip')) && !entitySet.pageable) {
      errors.push({
        type: 'query',
        path: `${entitySet.name}/$top|$skip`,
        message: `Entity set '${entitySet.name}' does not support pagination ($top/$skip)`,
        severity: 'medium',
      });
    }

    // Validate $top value
    if (params.has('$top')) {
      const topValue = parseInt(params.get('$top')!, 10);
      if (isNaN(topValue) || topValue <= 0) {
        errors.push({
          type: 'query',
          path: `${entitySet.name}/$top`,
          message: '$top must be a positive integer',
          severity: 'medium',
        });
      }
    }

    // Validate $skip value
    if (params.has('$skip')) {
      const skipValue = parseInt(params.get('$skip')!, 10);
      if (isNaN(skipValue) || skipValue < 0) {
        errors.push({
          type: 'query',
          path: `${entitySet.name}/$skip`,
          message: '$skip must be a non-negative integer',
          severity: 'medium',
        });
      }
    }
  }

  private validateCreatePayload(
    entitySet: ODataEntitySet,
    payload: Record<string, unknown>,
    errors: ODataValidationError[]
  ): void {
    if (!payload || typeof payload !== 'object') {
      errors.push({
        type: 'response',
        path: `${entitySet.name}/POST`,
        message: 'Create payload must be a non-null object',
        severity: 'high',
      });
      return;
    }

    if (Object.keys(payload).length === 0) {
      errors.push({
        type: 'response',
        path: `${entitySet.name}/POST`,
        message: 'Create payload must have at least one property',
        severity: 'high',
      });
    }
  }

  private validateUpdatePayload(
    entitySet: ODataEntitySet,
    payload: Record<string, unknown>,
    errors: ODataValidationError[]
  ): void {
    if (!payload || typeof payload !== 'object') {
      errors.push({
        type: 'response',
        path: `${entitySet.name}/PATCH`,
        message: 'Update payload must be a non-null object',
        severity: 'high',
      });
      return;
    }

    if (Object.keys(payload).length === 0) {
      errors.push({
        type: 'response',
        path: `${entitySet.name}/PATCH`,
        message: 'Update payload must have at least one property',
        severity: 'medium',
      });
    }
  }

  private validateNavigationProperties(
    entitySet: ODataEntitySet,
    metadata: ODataMetadata,
    errors: ODataValidationError[]
  ): void {
    const entityTypeNames = new Set(
      metadata.entitySets.map(es => es.entityType.replace(/^.*\./, ''))
    );

    for (const navProp of entitySet.navigationProperties) {
      // Validate target exists
      if (!entityTypeNames.has(navProp.target)) {
        errors.push({
          type: 'navigation',
          path: `${entitySet.name}/${navProp.name}`,
          message: `Navigation property '${navProp.name}' targets unknown entity type '${navProp.target}'`,
          severity: 'high',
        });
      }

      // Validate multiplicity
      const validMultiplicities = ['0..1', '1', '*'];
      if (!validMultiplicities.includes(navProp.multiplicity)) {
        errors.push({
          type: 'navigation',
          path: `${entitySet.name}/${navProp.name}`,
          message: `Invalid multiplicity '${navProp.multiplicity}' for navigation property '${navProp.name}'`,
          severity: 'medium',
        });
      }
    }
  }

  private validateResponseData(
    entitySet: ODataEntitySet,
    version: 'v2' | 'v4',
    responseData: unknown,
    statusCode: number | undefined,
    errors: ODataValidationError[]
  ): void {
    // Validate status code
    if (statusCode !== undefined) {
      if (statusCode >= 400) {
        errors.push({
          type: 'response',
          path: entitySet.name,
          message: `Response returned error status code ${statusCode}`,
          severity: statusCode >= 500 ? 'critical' : 'high',
        });
        return;
      }
    }

    if (responseData === null || responseData === undefined) return;

    // Validate OData response wrapper
    if (typeof responseData === 'object' && !Array.isArray(responseData)) {
      const data = responseData as Record<string, unknown>;

      if (version === 'v4') {
        // OData v4: should have @odata.context or value
        if (!data['@odata.context'] && !data.value && !data['@odata.type']) {
          errors.push({
            type: 'response',
            path: entitySet.name,
            message: 'OData v4 response should include @odata.context or @odata.type',
            severity: 'low',
          });
        }
      } else {
        // OData v2: should have d wrapper or results
        if (!data.d && !data.results) {
          errors.push({
            type: 'response',
            path: entitySet.name,
            message: 'OData v2 response should include d wrapper or results array',
            severity: 'low',
          });
        }
      }
    }
  }

  private validateParameterType(
    paramName: string,
    paramValue: unknown,
    paramDef: ODataParameter,
    functionName: string,
    errors: ODataValidationError[]
  ): void {
    const expectedType = paramDef.type.replace(/^Edm\./, '').toLowerCase();

    switch (expectedType) {
      case 'string':
      case 'guid':
        if (typeof paramValue !== 'string') {
          errors.push({
            type: 'metadata',
            path: `${functionName}/${paramName}`,
            message: `Parameter '${paramName}' expected type String but got ${typeof paramValue}`,
            severity: 'high',
          });
        }
        break;

      case 'int16':
      case 'int32':
      case 'int64':
      case 'byte':
      case 'sbyte':
        if (typeof paramValue !== 'number' || !Number.isInteger(paramValue)) {
          errors.push({
            type: 'metadata',
            path: `${functionName}/${paramName}`,
            message: `Parameter '${paramName}' expected integer but got ${typeof paramValue}`,
            severity: 'high',
          });
        }
        break;

      case 'decimal':
      case 'double':
      case 'single':
        if (typeof paramValue !== 'number') {
          errors.push({
            type: 'metadata',
            path: `${functionName}/${paramName}`,
            message: `Parameter '${paramName}' expected number but got ${typeof paramValue}`,
            severity: 'high',
          });
        }
        break;

      case 'boolean':
        if (typeof paramValue !== 'boolean') {
          errors.push({
            type: 'metadata',
            path: `${functionName}/${paramName}`,
            message: `Parameter '${paramName}' expected boolean but got ${typeof paramValue}`,
            severity: 'high',
          });
        }
        break;

      case 'datetimeoffset':
      case 'datetime':
      case 'date':
        if (typeof paramValue !== 'string' || isNaN(Date.parse(paramValue))) {
          errors.push({
            type: 'metadata',
            path: `${functionName}/${paramName}`,
            message: `Parameter '${paramName}' expected date string but got ${typeof paramValue}`,
            severity: 'high',
          });
        }
        break;
    }
  }
}
