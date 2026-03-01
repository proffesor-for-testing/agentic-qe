/**
 * Governance-Aware Domain Mixin
 *
 * Provides @claude-flow/guidance governance integration for domain coordinators.
 * Enables MemoryWriteGate checks for memory operations and ConstitutionalEnforcer
 * invariant validation for security scans and destructive operations.
 *
 * Usage:
 * ```typescript
 * class MyCoordinator {
 *   private readonly governanceMixin: GovernanceAwareDomainMixin;
 *
 *   constructor() {
 *     this.governanceMixin = createGovernanceAwareMixin('my-domain', {
 *       enableGovernance: true,
 *       requireSecurityScan: true,
 *       requireBackupBeforeDelete: true,
 *     });
 *   }
 *
 *   async storePattern(key: string, value: unknown) {
 *     const decision = await this.governanceMixin.validateMemoryWrite(key, value);
 *     if (!decision.allowed && this.governanceMixin.isStrictMode()) {
 *       throw new Error(decision.reason);
 *     }
 *     await this.memory.set(key, value);
 *     this.governanceMixin.registerPattern(key, value);
 *   }
 * }
 * ```
 *
 * @module coordination/mixins/governance-aware-domain
 * @see ADR-058-guidance-governance-integration.md
 */

import type { DomainName } from '../../shared/types/index.js';
import {
  memoryWriteGateIntegration,
  createMemoryPattern,
  isMemoryWriteGateEnabled,
  isStrictMode,
  constitutionalEnforcer,
  isConstitutionalEnforcerEnabled,
  complianceReporter,
  isComplianceReporterEnabled,
  type MemoryWriteGateDecision,
  type InvariantCheck,
} from '../../governance/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for governance-aware domain mixin
 */
export interface GovernanceAwareConfig {
  /** Enable governance checks (default: true) */
  enableGovernance: boolean;
  /** Require security scan for auth-related changes (default: false) */
  requireSecurityScan: boolean;
  /** Require backup before destructive operations (default: true) */
  requireBackupBeforeDelete: boolean;
  /** Log governance decisions (default: false) */
  logDecisions: boolean;
}

/**
 * Memory write validation result
 */
export interface MemoryWriteValidation {
  allowed: boolean;
  reason?: string;
  conflictingPatterns?: string[];
  shouldWarn: boolean;
}

/**
 * Security scan validation result
 */
export interface SecurityScanValidation {
  allowed: boolean;
  reason?: string;
  invariantCheck?: InvariantCheck;
}

/**
 * Backup validation result
 */
export interface BackupValidation {
  allowed: boolean;
  reason?: string;
  invariantCheck?: InvariantCheck;
}

/**
 * Interface for governance-aware domain operations
 */
export interface IGovernanceAwareDomain {
  /** Validate a memory write operation */
  validateMemoryWrite(
    key: string,
    value: unknown,
    tags?: string[]
  ): Promise<MemoryWriteValidation>;

  /** Register a pattern after successful memory write */
  registerPattern(key: string, value: unknown, tags?: string[]): void;

  /** Check if security scan is required for a change */
  validateSecurityScanRequired(
    changeId: string,
    affectsAuthCode: boolean,
    scanResult?: { vulnerabilities: number; scanned: boolean }
  ): Promise<SecurityScanValidation>;

  /** Check if backup is required before a destructive operation */
  validateBackupRequired(
    targetPath: string,
    backupInfo?: { source: string; destination: string; verified: boolean }
  ): Promise<BackupValidation>;

  /** Check if governance is enabled */
  isGovernanceEnabled(): boolean;

  /** Check if strict mode is active */
  isStrictMode(): boolean;

  /** Get domain name */
  getDomainName(): DomainName;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: GovernanceAwareConfig = {
  enableGovernance: true,
  requireSecurityScan: false,
  requireBackupBeforeDelete: true,
  logDecisions: false,
};

// ============================================================================
// Mixin Implementation
// ============================================================================

/**
 * Governance-aware domain mixin class
 *
 * Provides governance integration for domain coordinators without
 * requiring inheritance. Uses the existing governance infrastructure.
 */
export class GovernanceAwareDomainMixin implements IGovernanceAwareDomain {
  private readonly domainName: DomainName;
  private readonly config: GovernanceAwareConfig;

  constructor(domainName: DomainName, config: Partial<GovernanceAwareConfig> = {}) {
    this.domainName = domainName;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate a memory write operation using MemoryWriteGate
   *
   * @param key - The memory key
   * @param value - The value to store
   * @param tags - Optional tags for the pattern
   * @returns Validation result
   */
  async validateMemoryWrite(
    key: string,
    value: unknown,
    tags?: string[]
  ): Promise<MemoryWriteValidation> {
    if (!this.config.enableGovernance || !isMemoryWriteGateEnabled()) {
      return { allowed: true, shouldWarn: false };
    }

    try {
      const memoryPattern = createMemoryPattern(key, value, this.domainName, { tags });
      const decision = await memoryWriteGateIntegration.evaluateWrite(memoryPattern);

      if (!decision.allowed) {
        // Record violation
        if (isComplianceReporterEnabled()) {
          complianceReporter.recordViolation({
            type: 'contradiction',
            severity: 'medium',
            gate: 'memoryWriteGate',
            description: `Memory write blocked in ${this.domainName} for key ${key}: ${decision.reason}`,
            context: {
              domain: this.domainName,
              key,
              reason: decision.reason,
              conflictingPatterns: decision.conflictingPatterns,
            },
          });
        }

        if (this.config.logDecisions) {
          console.warn(`[GovernanceMixin:${this.domainName}] Memory write blocked: ${decision.reason}`);
        }

        return {
          allowed: false,
          reason: decision.reason,
          conflictingPatterns: decision.conflictingPatterns?.map(p => p.key),
          shouldWarn: !isStrictMode(),
        };
      }

      return { allowed: true, shouldWarn: false };
    } catch (error) {
      // Log error but don't block on governance failures
      console.error(`[GovernanceMixin:${this.domainName}] Memory validation error:`, error);
      return { allowed: true, shouldWarn: true };
    }
  }

  /**
   * Register a pattern after successful memory write
   *
   * @param key - The memory key
   * @param value - The stored value
   * @param tags - Optional tags for the pattern
   */
  registerPattern(key: string, value: unknown, tags?: string[]): void {
    if (!this.config.enableGovernance || !isMemoryWriteGateEnabled()) {
      return;
    }

    try {
      const memoryPattern = createMemoryPattern(key, value, this.domainName, { tags });
      memoryWriteGateIntegration.registerPattern(memoryPattern);

      if (this.config.logDecisions) {
        console.log(`[GovernanceMixin:${this.domainName}] Pattern registered: ${key}`);
      }
    } catch (error) {
      console.error(`[GovernanceMixin:${this.domainName}] Pattern registration error:`, error);
    }
  }

  /**
   * Validate security scan requirement (Constitutional Invariant #2)
   *
   * @param changeId - Unique identifier for the change
   * @param affectsAuthCode - Whether the change affects authentication code
   * @param scanResult - Optional existing security scan result
   * @returns Validation result
   */
  async validateSecurityScanRequired(
    changeId: string,
    affectsAuthCode: boolean,
    scanResult?: { vulnerabilities: number; scanned: boolean }
  ): Promise<SecurityScanValidation> {
    if (!this.config.enableGovernance || !this.config.requireSecurityScan) {
      return { allowed: true };
    }

    if (!isConstitutionalEnforcerEnabled()) {
      return { allowed: true };
    }

    // If not affecting auth code, always allowed
    if (!affectsAuthCode) {
      return { allowed: true };
    }

    // Build security scan object for constitutional check
    const securityScan = scanResult?.scanned ? {
      changeId,
      status: 'complete' as const,
      criticalVulnerabilities: scanResult.vulnerabilities,
      highVulnerabilities: 0,
      mediumVulnerabilities: 0,
      lowVulnerabilities: 0,
      timestamp: Date.now(),
    } : undefined;

    const check = constitutionalEnforcer.checkSecurityScanRequirement(
      changeId,
      affectsAuthCode,
      securityScan
    );

    if (!check.passed) {
      // Record violation
      if (isComplianceReporterEnabled()) {
        complianceReporter.recordViolation({
          type: 'invariant_violated',
          severity: 'critical',
          gate: 'constitutionalEnforcer',
          description: `Security scan required in ${this.domainName}: ${check.violationDetails}`,
          context: {
            domain: this.domainName,
            changeId,
            affectsAuthCode,
            invariantId: check.invariantId,
            violationDetails: check.violationDetails,
          },
        });
      }

      if (this.config.logDecisions) {
        console.warn(`[GovernanceMixin:${this.domainName}] Security scan required: ${check.violationDetails}`);
      }

      if (isStrictMode()) {
        return {
          allowed: false,
          reason: check.violationDetails,
          invariantCheck: check,
        };
      }
    }

    return { allowed: true, invariantCheck: check };
  }

  /**
   * Validate backup requirement before destructive operation (Constitutional Invariant #3)
   *
   * @param targetPath - Path of the target to be deleted
   * @param backupInfo - Optional backup information
   * @returns Validation result
   */
  async validateBackupRequired(
    targetPath: string,
    backupInfo?: { source: string; destination: string; verified: boolean }
  ): Promise<BackupValidation> {
    if (!this.config.enableGovernance || !this.config.requireBackupBeforeDelete) {
      return { allowed: true };
    }

    if (!isConstitutionalEnforcerEnabled()) {
      return { allowed: true };
    }

    // Build delete operation object
    const deleteOperation = {
      type: 'delete' as const,
      target: targetPath,
      timestamp: Date.now(),
    };

    // Build backup object if provided
    const backup = backupInfo ? {
      source: backupInfo.source,
      destination: backupInfo.destination,
      timestamp: Date.now() - 1000, // Backup should be before delete
      verified: backupInfo.verified,
    } : undefined;

    const check = constitutionalEnforcer.checkBackupBeforeDelete(deleteOperation, backup);

    if (!check.passed) {
      // Record violation
      if (isComplianceReporterEnabled()) {
        complianceReporter.recordViolation({
          type: 'invariant_violated',
          severity: 'high',
          gate: 'constitutionalEnforcer',
          description: `Backup required in ${this.domainName} before delete: ${check.violationDetails}`,
          context: {
            domain: this.domainName,
            targetPath,
            hasBackup: !!backupInfo,
            backupVerified: backupInfo?.verified,
            invariantId: check.invariantId,
            violationDetails: check.violationDetails,
          },
        });
      }

      if (this.config.logDecisions) {
        console.warn(`[GovernanceMixin:${this.domainName}] Backup required: ${check.violationDetails}`);
      }

      if (isStrictMode()) {
        return {
          allowed: false,
          reason: check.violationDetails,
          invariantCheck: check,
        };
      }
    }

    return { allowed: true, invariantCheck: check };
  }

  /**
   * Check if governance is enabled
   */
  isGovernanceEnabled(): boolean {
    return this.config.enableGovernance;
  }

  /**
   * Check if strict mode is active
   */
  isStrictMode(): boolean {
    return isStrictMode();
  }

  /**
   * Get domain name
   */
  getDomainName(): DomainName {
    return this.domainName;
  }

  /**
   * Get current configuration
   */
  getConfig(): GovernanceAwareConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a governance-aware domain mixin
 *
 * @param domainName - The domain name
 * @param config - Optional configuration
 * @returns Configured mixin instance
 */
export function createGovernanceAwareMixin(
  domainName: DomainName,
  config: Partial<GovernanceAwareConfig> = {}
): GovernanceAwareDomainMixin {
  return new GovernanceAwareDomainMixin(domainName, config);
}

/**
 * Create a governance mixin with security scan requirement
 * (for security-compliance domain)
 */
export function createSecurityGovernanceMixin(
  domainName: DomainName = 'security-compliance'
): GovernanceAwareDomainMixin {
  return new GovernanceAwareDomainMixin(domainName, {
    enableGovernance: true,
    requireSecurityScan: true,
    requireBackupBeforeDelete: true,
    logDecisions: true,
  });
}

/**
 * Create a governance mixin with backup requirement
 * (for domains that handle destructive operations)
 */
export function createDestructiveOpsGovernanceMixin(
  domainName: DomainName
): GovernanceAwareDomainMixin {
  return new GovernanceAwareDomainMixin(domainName, {
    enableGovernance: true,
    requireSecurityScan: false,
    requireBackupBeforeDelete: true,
    logDecisions: true,
  });
}
