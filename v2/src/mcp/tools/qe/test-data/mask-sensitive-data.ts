/**
 * Mask Sensitive Data Tool
 *
 * GDPR-compliant data masking with multiple anonymization strategies
 * Supports tokenization, hashing, masking, and substitution
 *
 * @module test-data/mask-sensitive-data
 * @version 1.0.0
 */

import { seededRandom } from '../../../../utils/SeededRandom.js';

/**
 * Anonymization strategies
 */
export enum AnonymizationStrategy {
  MASK = 'mask',
  HASH = 'hash',
  TOKENIZE = 'tokenize',
  GENERALIZE = 'generalize',
  SUBSTITUTE = 'substitute',
  REDACT = 'redact'
}

/**
 * Data classification
 */
export enum DataClassification {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  RESTRICTED = 'restricted',
  PII = 'pii',
  SENSITIVE = 'sensitive'
}

/**
 * Sensitive field definition
 */
export interface SensitiveFieldDef {
  name: string;
  classification: DataClassification;
  type: string;
  strategy: AnonymizationStrategy;
  caseSensitive?: boolean;
  preserveFormat?: boolean;
}

/**
 * Masking configuration
 */
export interface MaskSensitiveDataParams {
  /** Records to mask */
  data: Array<Record<string, unknown>>;

  /** Sensitive field definitions */
  sensitiveFields: SensitiveFieldDef[];

  /** Default anonymization strategy (default: 'mask') */
  defaultStrategy?: AnonymizationStrategy;

  /** Enable GDPR compliance validation */
  gdprCompliant?: boolean;

  /** Enable audit logging */
  auditLog?: boolean;

  /** Random seed for reproducibility */
  seed?: number;

  /** Salt for hashing operations */
  salt?: string;

  /** K-anonymity minimum group size */
  kAnonymity?: number;

  /** Preserve referential integrity for foreign keys */
  preserveIntegrity?: boolean;
}

/**
 * Masking statistics
 */
export interface MaskingStatistics {
  /** Total records processed */
  recordsProcessed: number;

  /** Fields masked */
  fieldsMasked: string[];

  /** Masking operations by strategy */
  maskingByStrategy: { [key in AnonymizationStrategy]?: number };

  /** Total masking operations */
  totalMaskingOps: number;

  /** Data loss assessment */
  dataLossPercentage: number;

  /** Processing duration (milliseconds) */
  duration: number;

  /** Estimated information loss (0-1) */
  informationLoss: number;
}

/**
 * GDPR compliance result
 */
export interface GDPRComplianceResult {
  compliant: boolean;
  violations: string[];
  recommendations: string[];
  anonymityLevel: 'identifiable' | 'quasi-identifiable' | 'anonymous';
}

/**
 * Mask sensitive data result
 */
export interface MaskSensitiveDataResult {
  /** Masked data */
  data: Array<Record<string, unknown>>;

  /** Original data size (bytes) */
  originalSize: number;

  /** Masked data size (bytes) */
  maskedSize: number;

  /** Mapping of original to masked values (if tokenization used) */
  tokenMap?: { [key: string]: string };

  /** Audit log of masking operations */
  auditLog?: MaskingAuditEntry[];

  /** Masking statistics */
  statistics: MaskingStatistics;

  /** GDPR compliance assessment */
  gdprCompliance?: GDPRComplianceResult;

  /** Processing success */
  success: boolean;

  /** Any warnings */
  warnings: string[];
}

/**
 * Audit log entry
 */
export interface MaskingAuditEntry {
  timestamp: number;
  fieldName: string;
  strategy: AnonymizationStrategy;
  classification: DataClassification;
  recordIndex: number;
  originalValueHash: string;
  maskedValueHash: string;
}

/**
 * Simple hash function for audit logging (non-cryptographic)
 */
function simpleHash(value: unknown): string {
  const str = JSON.stringify(value);
  let hash = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return Math.abs(hash).toString(36);
}

/**
 * Masking utilities
 */
class MaskingUtil {
  private tokenMap: Map<string, string> = new Map();
  private salt: string;
  private seed: number;

  constructor(seed?: number, salt?: string) {
    this.seed = seed || Date.now();
    this.salt = salt || 'gdpr-mask-salt';
  }

  /**
   * Mask value - show first and last character
   */
  mask(value: unknown, fieldType: string = 'string'): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    const str = String(value);

    if (str.length <= 2) {
      return '***';
    }

    // Preserve format for specific types
    if (fieldType === 'email') {
      const [localPart, domain] = str.split('@');
      return `${localPart[0]}***@${domain}`;
    }

    if (fieldType === 'phone') {
      return `+1***${str.slice(-4)}`;
    }

    return `${str[0]}***${str[str.length - 1]}`;
  }

  /**
   * Hash value - deterministic one-way function
   */
  hash(value: unknown): string {
    const str = String(value) + this.salt;
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    return 'h_' + Math.abs(hash).toString(36).substring(0, 16);
  }

  /**
   * Tokenize - consistent one-to-one replacement
   */
  tokenize(value: unknown): string {
    const key = String(value);

    if (!this.tokenMap.has(key)) {
      const token = 't_' + this.generateToken();
      this.tokenMap.set(key, token);
    }

    return this.tokenMap.get(key) as string;
  }

  /**
   * Generate random token
   */
  private generateToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';

    for (let i = 0; i < 12; i++) {
      result += chars[Math.floor(seededRandom.random() * chars.length)];
    }

    return result;
  }

  /**
   * Generalize - reduce precision/detail
   */
  generalize(value: unknown, fieldType: string): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    // For numbers: round to nearest 10
    if (typeof value === 'number') {
      return Math.round(value / 10) * 10;
    }

    // For dates: keep only year-month
    if (fieldType === 'date') {
      const dateStr = String(value);
      return dateStr.substring(0, 7); // YYYY-MM
    }

    // For strings: truncate
    return String(value).substring(0, 5) + '***';
  }

  /**
   * Substitute - replace with generic value
   */
  substitute(value: unknown, fieldType: string): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    switch (fieldType) {
      case 'email':
        return 'redacted@example.com';

      case 'phone':
        return '+1-555-0000';

      case 'name':
        return 'Redacted';

      case 'address':
        return 'Redacted Address';

      case 'ssn':
        return 'XXX-XX-XXXX';

      default:
        return '[REDACTED]';
    }
  }

  /**
   * Redact - complete removal/replacement
   */
  redact(value: unknown): string {
    return '[REDACTED]';
  }

  /**
   * Get token map for reconstruction
   */
  getTokenMap(): { [key: string]: string } {
    const map: { [key: string]: string } = {};

    this.tokenMap.forEach((value: string, key: string) => {
      map[key] = value;
    });

    return map;
  }
}

/**
 * Mask sensitive data
 *
 * Applies GDPR-compliant anonymization to sensitive data fields.
 * Supports multiple strategies for different privacy requirements.
 *
 * @param params - Masking parameters
 * @returns Promise resolving to masked data result
 *
 * @example
 * ```typescript
 * const result = await maskSensitiveData({
 *   data: [
 *     { id: 1, email: 'john.doe@example.com', name: 'John Doe', age: 35 },
 *     { id: 2, email: 'jane.smith@example.com', name: 'Jane Smith', age: 28 }
 *   ],
 *   sensitiveFields: [
 *     { name: 'email', classification: DataClassification.PII, type: 'email', strategy: AnonymizationStrategy.MASK },
 *     { name: 'name', classification: DataClassification.PII, type: 'name', strategy: AnonymizationStrategy.SUBSTITUTE }
 *   ],
 *   gdprCompliant: true
 * });
 *
 * console.log(`Masked ${result.statistics.fieldsMasked.length} fields`);
 * console.log(`GDPR Compliant: ${result.gdprCompliance?.compliant}`);
 * ```
 */
export async function maskSensitiveData(
  params: MaskSensitiveDataParams
): Promise<MaskSensitiveDataResult> {
  const startTime = Date.now();
  const warnings: string[] = [];
  const auditLog: MaskingAuditEntry[] = [];

  // Calculate original size
  const originalSize = Buffer.byteLength(JSON.stringify(params.data));

  // Initialize masking utility
  const maskingUtil = new MaskingUtil(params.seed, params.salt);

  // Create field lookup
  const sensitiveFieldMap = new Map<string, SensitiveFieldDef>();
  for (const field of params.sensitiveFields) {
    sensitiveFieldMap.set(field.name, field);
  }

  // Track masking operations
  const maskingStats: { [key in AnonymizationStrategy]?: number } = {};
  const fieldsMasked = new Set<string>();

  // Process each record
  const maskedData = params.data.map((record, recordIndex) => {
    const maskedRecord = { ...record };

    const processField = (fieldName: string, fieldDef: SensitiveFieldDef) => {
      if (fieldName in maskedRecord) {
        const originalValue = maskedRecord[fieldName];
        const strategy = fieldDef.strategy || params.defaultStrategy || AnonymizationStrategy.MASK;

        // Skip null/undefined
        if (originalValue === null || originalValue === undefined) {
          return;
        }

        // Apply masking strategy
        let maskedValue: unknown;

        switch (strategy) {
          case AnonymizationStrategy.MASK:
            maskedValue = maskingUtil.mask(originalValue, fieldDef.type);
            break;

          case AnonymizationStrategy.HASH:
            maskedValue = maskingUtil.hash(originalValue);
            break;

          case AnonymizationStrategy.TOKENIZE:
            maskedValue = maskingUtil.tokenize(originalValue);
            break;

          case AnonymizationStrategy.GENERALIZE:
            maskedValue = maskingUtil.generalize(originalValue, fieldDef.type);
            break;

          case AnonymizationStrategy.SUBSTITUTE:
            maskedValue = maskingUtil.substitute(originalValue, fieldDef.type);
            break;

          case AnonymizationStrategy.REDACT:
            maskedValue = maskingUtil.redact(originalValue);
            break;

          default:
            maskedValue = originalValue;
        }

        maskedRecord[fieldName] = maskedValue;
        fieldsMasked.add(fieldName);

        // Update statistics
        maskingStats[strategy] = (maskingStats[strategy] || 0) + 1;

        // Add audit log entry
        if (params.auditLog) {
          auditLog.push({
            timestamp: Date.now(),
            fieldName,
            strategy,
            classification: fieldDef.classification,
            recordIndex,
            originalValueHash: simpleHash(originalValue),
            maskedValueHash: simpleHash(maskedValue)
          });
        }
      }
    };

    // Process all sensitive fields
    sensitiveFieldMap.forEach((fieldDef: SensitiveFieldDef, fieldName: string) => {
      processField(fieldName, fieldDef);
    });

    return maskedRecord;
  });

  // Calculate statistics
  const duration = Date.now() - startTime;
  const maskedSize = Buffer.byteLength(JSON.stringify(maskedData));
  const totalMaskingOps = Object.values(maskingStats).reduce((sum, count) => sum + (count || 0), 0);
  const informationLoss = totalMaskingOps > 0 ? Math.min(1, totalMaskingOps / (params.data.length * params.sensitiveFields.length)) : 0;

  const statistics: MaskingStatistics = {
    recordsProcessed: params.data.length,
    fieldsMasked: Array.from(fieldsMasked),
    maskingByStrategy: maskingStats,
    totalMaskingOps,
    dataLossPercentage: ((originalSize - maskedSize) / originalSize) * 100,
    duration,
    informationLoss
  };

  // GDPR compliance check
  let gdprCompliance: GDPRComplianceResult | undefined;

  if (params.gdprCompliant) {
    const violations: string[] = [];
    const recommendations: string[] = [];

    // Check that all PII fields are masked
    for (const field of params.sensitiveFields) {
      if (field.classification === DataClassification.PII) {
        if (!fieldsMasked.has(field.name)) {
          violations.push(`PII field '${field.name}' was not masked`);
        }
      }
    }

    // Check anonymity level
    let anonymityLevel: 'identifiable' | 'quasi-identifiable' | 'anonymous' = 'identifiable';

    if (fieldsMasked.size >= params.sensitiveFields.filter(f => f.classification === DataClassification.PII).length) {
      if (informationLoss > 0.8) {
        anonymityLevel = 'anonymous';
      } else {
        anonymityLevel = 'quasi-identifiable';
        recommendations.push('Consider using stronger anonymization strategies for full anonymization');
      }
    }

    // Check k-anonymity
    if (params.kAnonymity && params.kAnonymity > 1) {
      recommendations.push(`Implement k-anonymity validation with k=${params.kAnonymity}`);
    }

    gdprCompliance = {
      compliant: violations.length === 0 && anonymityLevel !== 'identifiable',
      violations,
      recommendations,
      anonymityLevel
    };

    if (!gdprCompliance.compliant && violations.length > 0) {
      warnings.push(...violations);
    }
  }

  return {
    data: maskedData,
    originalSize,
    maskedSize,
    tokenMap: params.sensitiveFields.some(f => f.strategy === AnonymizationStrategy.TOKENIZE)
      ? maskingUtil.getTokenMap()
      : undefined,
    auditLog: params.auditLog ? auditLog : undefined,
    statistics,
    gdprCompliance,
    success: true,
    warnings
  };
}
