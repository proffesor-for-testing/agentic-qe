/**
 * Agentic QE v3 - SAP Integration Testing Service
 * Tests SAP RFC/BAPI calls and validates IDoc structure and segments.
 *
 * ADR-063: Enterprise Integration Testing Gap Closure
 */

import { Result, ok, err } from '../../../shared/types/index.js';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import type {
  RfcConnection,
  BapiCall,
  BapiTestResult,
  BapiReturn,
  IDocDefinition,
  IDocSegment,
  IDocField,
  IDocTestResult,
  SegmentValidation,
  FieldValidationError,
} from '../interfaces.js';

/**
 * Configuration for the SAP integration service
 */
export interface SapIntegrationServiceConfig {
  /** Default language for SAP connections */
  defaultLanguage: string;
  /** Validate BAPI return messages strictly */
  strictReturnValidation: boolean;
  /** Maximum IDoc segment depth for recursive validation */
  maxSegmentDepth: number;
  /** Cache BAPI metadata */
  cacheBapiMetadata: boolean;
  /** Timeout for RFC calls in milliseconds */
  rfcTimeout: number;
}

const DEFAULT_CONFIG: SapIntegrationServiceConfig = {
  defaultLanguage: 'EN',
  strictReturnValidation: true,
  maxSegmentDepth: 10,
  cacheBapiMetadata: true,
  rfcTimeout: 60000,
};

/**
 * SAP Integration Testing Service
 * Provides RFC/BAPI call testing and IDoc structure validation
 */
export class SapIntegrationService {
  private readonly config: SapIntegrationServiceConfig;
  private readonly bapiMetadataCache: Map<string, Record<string, unknown>> = new Map();

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<SapIntegrationServiceConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // RFC/BAPI Testing
  // ============================================================================

  /**
   * Validate an RFC connection configuration.
   * Checks for required fields and valid system number format.
   */
  validateConnection(connection: RfcConnection): Result<string[]> {
    const errors: string[] = [];

    if (!connection.ashost || connection.ashost.trim() === '') {
      errors.push('Application server host (ashost) is required');
    }

    if (!connection.sysnr || connection.sysnr.trim() === '') {
      errors.push('System number (sysnr) is required');
    } else if (!/^\d{2}$/.test(connection.sysnr)) {
      errors.push('System number (sysnr) must be a 2-digit number (e.g., "00", "01")');
    }

    if (!connection.client || connection.client.trim() === '') {
      errors.push('Client number is required');
    } else if (!/^\d{3}$/.test(connection.client)) {
      errors.push('Client number must be a 3-digit number (e.g., "100", "800")');
    }

    if (!connection.user || connection.user.trim() === '') {
      errors.push('User is required');
    }

    if (!connection.lang || connection.lang.trim() === '') {
      errors.push('Language is required');
    } else if (connection.lang.length !== 2) {
      errors.push('Language must be a 2-character ISO code (e.g., "EN", "DE")');
    }

    return ok(errors);
  }

  /**
   * Validate a BAPI call structure.
   * Checks for required parameters, naming conventions, and parameter structure.
   */
  validateBapiCall(bapi: BapiCall): Result<string[]> {
    const errors: string[] = [];

    if (!bapi.name || bapi.name.trim() === '') {
      errors.push('BAPI name is required');
    } else {
      // BAPI naming convention check
      if (!bapi.name.startsWith('BAPI_') && !bapi.name.startsWith('RFC_') &&
          !bapi.name.startsWith('Z_') && !bapi.name.startsWith('/')) {
        errors.push(
          `BAPI name '${bapi.name}' does not follow SAP naming conventions (expected BAPI_*, RFC_*, Z_*, or /<namespace>/)`
        );
      }

      // Length check (SAP function module names are max 30 chars)
      if (bapi.name.length > 30) {
        errors.push(`BAPI name '${bapi.name}' exceeds SAP maximum of 30 characters`);
      }
    }

    if (!bapi.importParams || Object.keys(bapi.importParams).length === 0) {
      errors.push('At least one import parameter is required');
    }

    // Validate parameter names follow SAP naming conventions
    if (bapi.importParams) {
      for (const paramName of Object.keys(bapi.importParams)) {
        if (paramName.length > 30) {
          errors.push(`Import parameter name '${paramName}' exceeds SAP maximum of 30 characters`);
        }
      }
    }

    return ok(errors);
  }

  /**
   * Test a BAPI call by validating the call structure and analyzing the return messages.
   * Simulates BAPI execution analysis without requiring a live SAP connection.
   */
  async testBapiCall(
    connection: RfcConnection,
    bapi: BapiCall,
    returnMessages: BapiReturn[],
    exportValues: Record<string, unknown> = {},
    tableData: Record<string, unknown[]> = {}
  ): Promise<Result<BapiTestResult>> {
    const startTime = Date.now();
    try {
      // Validate connection
      const connectionResult = this.validateConnection(connection);
      if (connectionResult.success && connectionResult.value.length > 0) {
        return err(new Error(
          `Invalid RFC connection: ${connectionResult.value.join('; ')}`
        ));
      }

      // Validate BAPI call structure
      const callResult = this.validateBapiCall(bapi);
      if (callResult.success && callResult.value.length > 0) {
        return err(new Error(
          `Invalid BAPI call: ${callResult.value.join('; ')}`
        ));
      }

      // Analyze return messages
      const hasErrors = this.hasBapiErrors(returnMessages);
      const hasAbend = returnMessages.some(msg => msg.type === 'A');
      const passed = !hasErrors && !hasAbend;

      // Determine if transaction should be committed
      const transactionCommitted = passed && !hasAbend;

      // Validate export parameters if expected
      const exportValidationErrors = this.validateExportParams(
        bapi.exportParams || [],
        exportValues
      );

      // Validate table parameters if expected
      const tableValidationErrors = this.validateTableParams(
        bapi.tableParams || [],
        tableData
      );

      const allPassed = passed &&
        exportValidationErrors.length === 0 &&
        tableValidationErrors.length === 0;

      const result: BapiTestResult = {
        bapiName: bapi.name,
        passed: allPassed,
        returnMessages,
        exportValues,
        tableData,
        duration: Date.now() - startTime,
        transactionCommitted,
      };

      // Store test result for learning
      await this.memory.set(
        `enterprise-integration:bapi:${bapi.name}:${Date.now()}`,
        {
          bapiName: bapi.name,
          passed: allPassed,
          returnTypes: returnMessages.map(m => m.type),
          exportParamCount: Object.keys(exportValues).length,
          tableParamCount: Object.keys(tableData).length,
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

  // ============================================================================
  // IDoc Validation
  // ============================================================================

  /**
   * Validate an IDoc definition structure.
   * Checks segment hierarchy, field definitions, and cardinality.
   */
  validateIDocDefinition(definition: IDocDefinition): Result<string[]> {
    const errors: string[] = [];

    if (!definition.type || definition.type.trim() === '') {
      errors.push('IDoc type is required');
    }

    if (!definition.version || definition.version.trim() === '') {
      errors.push('IDoc version is required');
    }

    if (!definition.segments || definition.segments.length === 0) {
      errors.push('IDoc must have at least one segment');
      return ok(errors);
    }

    // Validate segment hierarchy
    this.validateSegmentHierarchy(definition.segments, '', errors, 0);

    return ok(errors);
  }

  /**
   * Validate IDoc content against its definition.
   * Checks segment presence, field values, cardinality, and data types.
   */
  async validateIDoc(
    definition: IDocDefinition,
    content: string
  ): Promise<Result<IDocTestResult>> {
    const startTime = Date.now();
    try {
      if (!content || content.trim() === '') {
        return ok({
          idocType: definition.type,
          direction: 'inbound',
          passed: false,
          statusCode: 51,
          statusMessage: 'IDoc content is empty',
          segmentValidation: [],
          processingTime: Date.now() - startTime,
        });
      }

      // Validate the definition first
      const defResult = this.validateIDocDefinition(definition);
      if (defResult.success && defResult.value.length > 0) {
        return err(new Error(
          `Invalid IDoc definition: ${defResult.value.join('; ')}`
        ));
      }

      // Parse the IDoc content into segment data
      const parsedSegments = this.parseIDocContent(content);

      // Validate segments against definition
      const segmentValidation: SegmentValidation[] = [];
      this.validateIDocSegments(
        definition.segments,
        parsedSegments,
        segmentValidation
      );

      // Determine overall status
      const hasErrors = segmentValidation.some(sv =>
        !sv.valid || sv.fieldErrors.length > 0
      );

      // SAP IDoc status codes:
      // 3  = Successfully posted
      // 51 = Error during application document posting
      // 53 = IDoc posted, no application document
      // 64 = IDoc ready to be transferred
      const statusCode = hasErrors ? 51 : 3;
      const statusMessage = hasErrors
        ? 'IDoc validation failed with field/segment errors'
        : 'IDoc validated successfully';

      const result: IDocTestResult = {
        idocType: definition.type,
        direction: 'inbound',
        passed: !hasErrors,
        statusCode,
        statusMessage,
        segmentValidation,
        processingTime: Date.now() - startTime,
      };

      // Store validation result for learning
      await this.memory.set(
        `enterprise-integration:idoc:${definition.type}:${Date.now()}`,
        {
          idocType: definition.type,
          passed: !hasErrors,
          statusCode,
          segmentCount: segmentValidation.length,
          errorCount: segmentValidation.reduce((sum, sv) => sum + sv.fieldErrors.length, 0),
          processingTime: result.processingTime,
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
   * Clear cached BAPI metadata.
   */
  clearCache(): void {
    this.bapiMetadataCache.clear();
  }

  // ============================================================================
  // Private Helper Methods - BAPI
  // ============================================================================

  private hasBapiErrors(returnMessages: BapiReturn[]): boolean {
    return returnMessages.some(msg => msg.type === 'E' || msg.type === 'A');
  }

  private validateExportParams(
    expectedParams: string[],
    exportValues: Record<string, unknown>
  ): string[] {
    const errors: string[] = [];

    for (const param of expectedParams) {
      if (!(param in exportValues)) {
        errors.push(`Expected export parameter '${param}' not found in response`);
      }
    }

    return errors;
  }

  private validateTableParams(
    expectedParams: string[],
    tableData: Record<string, unknown[]>
  ): string[] {
    const errors: string[] = [];

    for (const param of expectedParams) {
      if (!(param in tableData)) {
        errors.push(`Expected table parameter '${param}' not found in response`);
      }
    }

    return errors;
  }

  // ============================================================================
  // Private Helper Methods - IDoc
  // ============================================================================

  private validateSegmentHierarchy(
    segments: IDocSegment[],
    parentPath: string,
    errors: string[],
    depth: number
  ): void {
    if (depth > this.config.maxSegmentDepth) {
      errors.push(`Segment depth exceeds maximum of ${this.config.maxSegmentDepth}`);
      return;
    }

    for (const segment of segments) {
      const segPath = parentPath ? `${parentPath}/${segment.name}` : segment.name;

      if (!segment.name || segment.name.trim() === '') {
        errors.push(`Segment name is required at path '${parentPath || '/'}'`);
        continue;
      }

      // SAP segment names are max 27 chars and uppercase
      if (segment.name.length > 27) {
        errors.push(`Segment name '${segment.name}' exceeds SAP maximum of 27 characters`);
      }

      // Validate cardinality
      if (segment.minOccurs < 0) {
        errors.push(`Segment '${segPath}' minOccurs cannot be negative`);
      }

      if (segment.maxOccurs < segment.minOccurs) {
        errors.push(
          `Segment '${segPath}' maxOccurs (${segment.maxOccurs}) must be >= minOccurs (${segment.minOccurs})`
        );
      }

      // Validate fields
      for (const field of segment.fields) {
        this.validateIDocFieldDefinition(field, segPath, errors);
      }

      // Recurse into child segments
      if (segment.children && segment.children.length > 0) {
        this.validateSegmentHierarchy(segment.children, segPath, errors, depth + 1);
      }
    }
  }

  private validateIDocFieldDefinition(
    field: IDocField,
    segmentPath: string,
    errors: string[]
  ): void {
    if (!field.name || field.name.trim() === '') {
      errors.push(`Field name is required in segment '${segmentPath}'`);
    }

    if (field.length <= 0) {
      errors.push(
        `Field '${segmentPath}/${field.name}' length must be positive (got ${field.length})`
      );
    }

    // Validate type-specific constraints
    const validTypes: IDocField['type'][] = ['CHAR', 'NUMC', 'DATS', 'TIMS', 'CURR', 'QUAN', 'DEC'];
    if (!validTypes.includes(field.type)) {
      errors.push(
        `Field '${segmentPath}/${field.name}' has invalid type '${field.type}'. Valid: ${validTypes.join(', ')}`
      );
    }

    // Date fields must be length 8
    if (field.type === 'DATS' && field.length !== 8) {
      errors.push(
        `Field '${segmentPath}/${field.name}' of type DATS must have length 8 (YYYYMMDD)`
      );
    }

    // Time fields must be length 6
    if (field.type === 'TIMS' && field.length !== 6) {
      errors.push(
        `Field '${segmentPath}/${field.name}' of type TIMS must have length 6 (HHMMSS)`
      );
    }
  }

  private parseIDocContent(
    content: string
  ): Map<string, Array<Record<string, string>>> {
    const segments = new Map<string, Array<Record<string, string>>>();

    // IDoc flat file format: segment name in first 27 chars, data follows
    // Or JSON format with segment arrays
    try {
      // Try JSON format first
      const jsonContent = JSON.parse(content);
      if (typeof jsonContent === 'object' && jsonContent !== null) {
        for (const [segName, segData] of Object.entries(jsonContent)) {
          if (Array.isArray(segData)) {
            segments.set(segName, segData as Record<string, string>[]);
          } else if (typeof segData === 'object' && segData !== null) {
            segments.set(segName, [segData as Record<string, string>]);
          }
        }
        return segments;
      }
    } catch {
      // Not JSON, try flat file format
    }

    // Flat file format: each line is a segment record
    const lines = content.split('\n').filter(l => l.trim() !== '');
    for (const line of lines) {
      // First field (up to first whitespace or fixed position) is segment name
      const segName = line.substring(0, Math.min(27, line.length)).trim();
      if (segName) {
        if (!segments.has(segName)) {
          segments.set(segName, []);
        }
        segments.get(segName)!.push({ _raw: line });
      }
    }

    return segments;
  }

  private validateIDocSegments(
    definedSegments: IDocSegment[],
    parsedSegments: Map<string, Array<Record<string, string>>>,
    results: SegmentValidation[]
  ): void {
    for (const segment of definedSegments) {
      const segmentData = parsedSegments.get(segment.name);
      const occurrences = segmentData ? segmentData.length : 0;

      const fieldErrors: FieldValidationError[] = [];

      // Check cardinality
      if (segment.mandatory && occurrences === 0) {
        fieldErrors.push({
          field: segment.name,
          expected: `at least ${segment.minOccurs} occurrence(s)`,
          actual: '0 occurrences',
          rule: 'mandatory-segment',
        });
      }

      if (occurrences < segment.minOccurs) {
        fieldErrors.push({
          field: segment.name,
          expected: `>= ${segment.minOccurs} occurrences`,
          actual: `${occurrences} occurrences`,
          rule: 'minOccurs',
        });
      }

      if (segment.maxOccurs > 0 && occurrences > segment.maxOccurs) {
        fieldErrors.push({
          field: segment.name,
          expected: `<= ${segment.maxOccurs} occurrences`,
          actual: `${occurrences} occurrences`,
          rule: 'maxOccurs',
        });
      }

      // Validate fields within each occurrence
      if (segmentData) {
        for (const record of segmentData) {
          this.validateIDocFields(segment.fields, record, fieldErrors);
        }
      }

      results.push({
        segment: segment.name,
        valid: fieldErrors.length === 0,
        fieldErrors,
      });

      // Recurse into child segments
      if (segment.children && segment.children.length > 0) {
        this.validateIDocSegments(segment.children, parsedSegments, results);
      }
    }
  }

  private validateIDocFields(
    fields: IDocField[],
    record: Record<string, string>,
    errors: FieldValidationError[]
  ): void {
    // Skip raw-data-only records (flat file format)
    if ('_raw' in record && Object.keys(record).length === 1) return;

    for (const field of fields) {
      const value = record[field.name];

      // Check mandatory fields
      if (field.mandatory && (value === undefined || value === null || value === '')) {
        errors.push({
          field: field.name,
          expected: 'non-empty value',
          actual: value === undefined ? 'undefined' : `'${value}'`,
          rule: 'mandatory',
        });
        continue;
      }

      if (value === undefined || value === null) continue;

      // Validate length
      if (String(value).length > field.length) {
        errors.push({
          field: field.name,
          expected: `max length ${field.length}`,
          actual: `length ${String(value).length}`,
          rule: 'maxLength',
        });
      }

      // Validate type-specific format
      this.validateIDocFieldValue(field, String(value), errors);
    }
  }

  private validateIDocFieldValue(
    field: IDocField,
    value: string,
    errors: FieldValidationError[]
  ): void {
    switch (field.type) {
      case 'NUMC':
        if (!/^\d*$/.test(value)) {
          errors.push({
            field: field.name,
            expected: 'numeric characters only',
            actual: `'${value}'`,
            rule: 'type-NUMC',
          });
        }
        break;

      case 'DATS':
        if (value !== '00000000' && !/^\d{8}$/.test(value)) {
          errors.push({
            field: field.name,
            expected: 'YYYYMMDD format (8 digits)',
            actual: `'${value}'`,
            rule: 'type-DATS',
          });
        } else if (value !== '00000000' && /^\d{8}$/.test(value)) {
          const year = parseInt(value.substring(0, 4), 10);
          const month = parseInt(value.substring(4, 6), 10);
          const day = parseInt(value.substring(6, 8), 10);
          if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 9999) {
            errors.push({
              field: field.name,
              expected: 'valid date (YYYYMMDD)',
              actual: `'${value}'`,
              rule: 'type-DATS-valid',
            });
          }
        }
        break;

      case 'TIMS':
        if (!/^\d{6}$/.test(value)) {
          errors.push({
            field: field.name,
            expected: 'HHMMSS format (6 digits)',
            actual: `'${value}'`,
            rule: 'type-TIMS',
          });
        } else {
          const hours = parseInt(value.substring(0, 2), 10);
          const minutes = parseInt(value.substring(2, 4), 10);
          const seconds = parseInt(value.substring(4, 6), 10);
          if (hours > 23 || minutes > 59 || seconds > 59) {
            errors.push({
              field: field.name,
              expected: 'valid time (HH:00-23, MM:00-59, SS:00-59)',
              actual: `'${value}'`,
              rule: 'type-TIMS-valid',
            });
          }
        }
        break;

      case 'CURR':
      case 'QUAN':
      case 'DEC':
        if (!/^-?\d*\.?\d*$/.test(value.trim())) {
          errors.push({
            field: field.name,
            expected: 'decimal number',
            actual: `'${value}'`,
            rule: `type-${field.type}`,
          });
        }
        break;

      case 'CHAR':
        // CHAR accepts any character, just validate length (done above)
        break;
    }
  }
}
