/**
 * Agentic QE v3 - Consensus Enabled Domain Mixin
 * CONSENSUS-MIXIN-001: Reusable mixin for multi-model consensus verification
 *
 * This mixin allows any domain coordinator to leverage multi-model consensus
 * verification for high-stakes decisions without duplicating consensus logic.
 *
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 2: Multi-Model Verification
 */

import {
  ConsensusEngine,
  ConsensusResult,
  ConsensusStats as ConsensusStatsType,
  SecurityFinding,
  SecurityFindingCategory,
  VerificationOptions,
  createConsensusEngine,
  registerProvidersFromEnv,
  DEFAULT_CONSENSUS_CONFIG,
} from '../consensus';

// Re-export ConsensusStats for use by domain coordinators
export type { ConsensusStats } from '../consensus';
import {
  DomainFinding,
  FindingSeverity,
  isHighStakesFinding,
} from '../consensus/domain-findings';
import { Result, ok, err, Severity } from '../../shared/types';
import { toError } from '../../shared/error-utils.js';

// ============================================================================
// Configuration Interface
// ============================================================================

/**
 * Configuration for consensus-enabled domains
 */
export interface ConsensusEnabledConfig {
  /** Whether to enable consensus verification */
  readonly enableConsensus: boolean;

  /** Minimum confidence threshold requiring consensus verification */
  readonly consensusThreshold: number;

  /** Finding types that require consensus verification */
  readonly verifyFindingTypes: string[];

  /** Consensus strategy to use */
  readonly strategy: 'majority' | 'weighted' | 'unanimous';

  /** Minimum number of models required for consensus */
  readonly minModels: number;

  /** Timeout per model in milliseconds */
  readonly modelTimeout: number;

  /** Severity levels requiring consensus */
  readonly verifySeverities: FindingSeverity[];

  /** Enable logging for consensus operations */
  readonly enableLogging: boolean;
}

/**
 * Default consensus configuration
 */
export const DEFAULT_CONSENSUS_ENABLED_CONFIG: ConsensusEnabledConfig = {
  enableConsensus: true,
  consensusThreshold: 0.7,
  verifyFindingTypes: [],
  strategy: 'weighted',
  minModels: 2,
  modelTimeout: 60000,
  verifySeverities: ['critical', 'high'],
  enableLogging: false,
};

// ============================================================================
// Mixin Interface
// ============================================================================

/**
 * Interface for consensus-enabled domain coordinators
 */
export interface IConsensusEnabledDomain {
  /**
   * Initialize the consensus engine
   *
   * Call this in the domain coordinator's initialize() method.
   */
  initializeConsensus(): Promise<void>;

  /**
   * Dispose the consensus engine
   *
   * Call this in the domain coordinator's dispose() method.
   */
  disposeConsensus(): Promise<void>;

  /**
   * Check if consensus engine is available
   */
  isConsensusAvailable(): boolean;

  /**
   * Verify a single finding using multi-model consensus
   *
   * @param finding - The finding to verify
   * @param options - Optional verification options
   * @returns Promise resolving to consensus result
   */
  verifyFinding<T>(
    finding: DomainFinding<T>,
    options?: VerificationOptions
  ): Promise<Result<ConsensusResult, Error>>;

  /**
   * Check if a finding requires consensus verification
   *
   * @param finding - The finding to check
   * @returns true if consensus verification is required
   */
  requiresConsensus<T>(finding: DomainFinding<T>): boolean;

  /**
   * Verify multiple findings in batch
   *
   * @param findings - Array of findings to verify
   * @param options - Optional verification options
   * @returns Promise resolving to array of consensus results
   */
  verifyFindings<T>(
    findings: DomainFinding<T>[],
    options?: VerificationOptions
  ): Promise<Result<ConsensusResult[], Error>>;

  /**
   * Get consensus statistics
   *
   * @returns Current consensus statistics
   */
  getConsensusStats(): ConsensusStatsType | undefined;
}

// ============================================================================
// Domain Finding to Security Finding Conversion
// ============================================================================

/**
 * Convert a generic DomainFinding to SecurityFinding format for the consensus engine
 */
function toSecurityFinding<T>(
  finding: DomainFinding<T>,
  category: SecurityFindingCategory = 'other'
): SecurityFinding {
  // Map FindingSeverity to Severity
  const severityMap: Record<FindingSeverity, Severity> = {
    critical: 'critical',
    high: 'high',
    medium: 'medium',
    low: 'low',
    info: 'info',
  };

  // Extract location from payload if available
  const payload = finding.payload as Record<string, unknown>;
  const location = (payload?.location as SecurityFinding['location']) || {
    file: 'unknown',
  };

  // Extract evidence from payload if available
  const evidence = (payload?.evidence as SecurityFinding['evidence']) || [];

  return {
    id: finding.id,
    type: finding.type,
    category,
    severity: severityMap[finding.severity || 'medium'],
    description: finding.description,
    location,
    evidence,
    detectedAt: finding.detectedAt,
    detectedBy: finding.detectedBy,
    correlationId: finding.correlationId,
    metadata: {
      originalFinding: finding,
      domainContext: finding.context,
    },
  };
}

// ============================================================================
// Consensus Enabled Mixin Class
// ============================================================================

/**
 * Mixin class that adds consensus verification capabilities to any domain coordinator
 *
 * This is designed to be used with TypeScript's class composition pattern.
 * Domain coordinators can extend this mixin to gain consensus verification capabilities.
 *
 * @example
 * ```typescript
 * class MyDomainCoordinator extends ConsensusEnabledMixin {
 *   constructor(config: MyConfig) {
 *     super({
 *       enableConsensus: true,
 *       consensusThreshold: 0.8,
 *       verifyFindingTypes: ['vulnerability', 'defect'],
 *       strategy: 'weighted',
 *       minModels: 2,
 *       modelTimeout: 30000,
 *       verifySeverities: ['critical', 'high'],
 *       enableLogging: true,
 *     });
 *   }
 *
 *   async initialize(): Promise<void> {
 *     await this.initializeConsensus();
 *     // ... other initialization
 *   }
 *
 *   async dispose(): Promise<void> {
 *     await this.disposeConsensus();
 *     // ... other cleanup
 *   }
 *
 *   async processFindings(findings: DomainFinding[]): Promise<void> {
 *     for (const finding of findings) {
 *       if (this.requiresConsensus(finding)) {
 *         const result = await this.verifyFinding(finding);
 *         if (result.success && result.value.verdict === 'verified') {
 *           // Take action on verified finding
 *         }
 *       }
 *     }
 *   }
 * }
 * ```
 */
export class ConsensusEnabledMixin implements IConsensusEnabledDomain {
  protected readonly consensusConfig: ConsensusEnabledConfig;
  protected consensusEngine: ConsensusEngine | undefined;
  protected consensusInitialized: boolean = false;

  /**
   * Create a new ConsensusEnabledMixin
   *
   * @param config - Configuration for consensus verification
   */
  constructor(config: Partial<ConsensusEnabledConfig> = {}) {
    this.consensusConfig = {
      ...DEFAULT_CONSENSUS_ENABLED_CONFIG,
      ...config,
    };
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Initialize the consensus engine
   *
   * Call this in the domain coordinator's initialize() method.
   * Uses registerProvidersFromEnv to auto-detect available model providers.
   *
   * @throws Error if consensus initialization fails
   */
  async initializeConsensus(): Promise<void> {
    if (!this.consensusConfig.enableConsensus) {
      if (this.consensusConfig.enableLogging) {
        console.log('[ConsensusEnabledMixin] Consensus verification disabled');
      }
      return;
    }

    try {
      // Register providers from environment
      const registry = registerProvidersFromEnv(this.consensusConfig.enableLogging);
      const providers = registry.getAll();

      if (providers.length === 0) {
        if (this.consensusConfig.enableLogging) {
          console.warn(
            '[ConsensusEnabledMixin] No model providers available for consensus verification'
          );
        }
        return;
      }

      // Create consensus engine
      this.consensusEngine = createConsensusEngine({
        strategy: this.consensusConfig.strategy,
        models: providers,
        engineConfig: {
          minModels: Math.min(this.consensusConfig.minModels, providers.length),
          defaultModelTimeout: this.consensusConfig.modelTimeout,
          verifySeverities: this.consensusConfig.verifySeverities as Severity[],
          humanReviewThreshold: DEFAULT_CONSENSUS_CONFIG.humanReviewThreshold,
        },
      });

      this.consensusInitialized = true;

      if (this.consensusConfig.enableLogging) {
        console.log(
          `[ConsensusEnabledMixin] Initialized with ${providers.length} providers ` +
          `(strategy: ${this.consensusConfig.strategy})`
        );
      }
    } catch (error) {
      console.error('[ConsensusEnabledMixin] Failed to initialize consensus:', error);
      throw error;
    }
  }

  /**
   * Dispose the consensus engine
   *
   * Call this in the domain coordinator's dispose() method.
   */
  async disposeConsensus(): Promise<void> {
    if (this.consensusEngine) {
      await this.consensusEngine.dispose();
      this.consensusEngine = undefined;
      this.consensusInitialized = false;

      if (this.consensusConfig.enableLogging) {
        console.log('[ConsensusEnabledMixin] Consensus engine disposed');
      }
    }
  }

  // ============================================================================
  // IConsensusEnabledDomain Implementation
  // ============================================================================

  /**
   * Verify a single finding using multi-model consensus
   */
  async verifyFinding<T>(
    finding: DomainFinding<T>,
    options?: VerificationOptions
  ): Promise<Result<ConsensusResult, Error>> {
    // Check if consensus is available
    if (!this.consensusEngine || !this.consensusInitialized) {
      return err(new Error('Consensus engine not initialized'));
    }

    // Check if finding requires consensus
    if (!this.requiresConsensus(finding)) {
      return err(new Error(`Finding ${finding.id} does not require consensus verification`));
    }

    try {
      // Convert to SecurityFinding format
      const securityFinding = toSecurityFinding(finding, this.inferCategory(finding.type));

      // Verify using consensus engine
      const result = await this.consensusEngine.verify(securityFinding, {
        forceVerification: true,
        ...options,
      });

      if (this.consensusConfig.enableLogging && result.success) {
        console.log(
          `[ConsensusEnabledMixin] Finding ${finding.id} verified: ` +
          `verdict=${result.value.verdict}, confidence=${result.value.confidence.toFixed(2)}`
        );
      }

      return result;
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Check if a finding requires consensus verification
   */
  requiresConsensus<T>(finding: DomainFinding<T>): boolean {
    // Check if consensus is enabled
    if (!this.consensusConfig.enableConsensus) {
      return false;
    }

    // Check if finding type is in the verify list
    const typeMatches =
      this.consensusConfig.verifyFindingTypes.length === 0 ||
      this.consensusConfig.verifyFindingTypes.includes(finding.type);

    if (!typeMatches) {
      return false;
    }

    // Check severity
    if (finding.severity) {
      const severityMatches = this.consensusConfig.verifySeverities.includes(finding.severity);
      if (severityMatches) {
        return true;
      }
    }

    // Check confidence threshold
    return finding.confidence >= this.consensusConfig.consensusThreshold;
  }

  /**
   * Verify multiple findings in batch
   */
  async verifyFindings<T>(
    findings: DomainFinding<T>[],
    options?: VerificationOptions
  ): Promise<Result<ConsensusResult[], Error>> {
    // Check if consensus is available
    if (!this.consensusEngine || !this.consensusInitialized) {
      return err(new Error('Consensus engine not initialized'));
    }

    // Filter findings that require consensus
    const findingsRequiringConsensus = findings.filter(f => this.requiresConsensus(f));

    if (findingsRequiringConsensus.length === 0) {
      return ok([]);
    }

    try {
      // Convert all findings to SecurityFinding format
      const securityFindings = findingsRequiringConsensus.map(f =>
        toSecurityFinding(f, this.inferCategory(f.type))
      );

      // Verify batch
      const result = await this.consensusEngine.verifyBatch(securityFindings, {
        forceVerification: true,
        ...options,
      });

      if (this.consensusConfig.enableLogging && result.success) {
        const verified = result.value.filter(r => r.verdict === 'verified').length;
        console.log(
          `[ConsensusEnabledMixin] Batch verification complete: ` +
          `${verified}/${result.value.length} verified`
        );
      }

      return result;
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Get consensus statistics
   */
  getConsensusStats(): ConsensusStatsType | undefined {
    return this.consensusEngine?.getStats();
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Check if consensus engine is available
   */
  isConsensusAvailable(): boolean {
    return this.consensusInitialized && this.consensusEngine !== undefined;
  }

  /**
   * Get the consensus engine (for advanced usage)
   */
  protected getConsensusEngine(): ConsensusEngine | undefined {
    return this.consensusEngine;
  }

  /**
   * Infer security finding category from finding type
   */
  private inferCategory(findingType: string): SecurityFindingCategory {
    const categoryMap: Record<string, SecurityFindingCategory> = {
      // Security categories
      'sql-injection': 'injection',
      'command-injection': 'injection',
      'xss': 'input-validation',
      'authentication': 'authentication',
      'authorization': 'authorization',
      'crypto': 'cryptography',
      'hardcoded-secret': 'cryptography',
      'data-exposure': 'data-exposure',
      'pii-exposure': 'data-exposure',
      'misconfiguration': 'configuration',
      'vulnerable-dependency': 'dependency',
      'path-traversal': 'input-validation',
      'session': 'session-management',
      'timing': 'timing-attack',
      'dos': 'resource-management',
      'memory-leak': 'resource-management',
      'logging': 'logging',

      // Generic categories for non-security findings
      'vulnerability': 'other',
      'defect': 'other',
      'coverage-gap': 'other',
      'contract-violation': 'other',
      'quality-issue': 'other',
    };

    // Find matching category
    const lowercaseType = findingType.toLowerCase();
    for (const [pattern, category] of Object.entries(categoryMap)) {
      if (lowercaseType.includes(pattern)) {
        return category;
      }
    }

    return 'other';
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a consensus-enabled mixin instance
 *
 * @param config - Configuration for consensus verification
 * @returns ConsensusEnabledMixin instance
 *
 * @example
 * ```typescript
 * const mixin = createConsensusEnabledMixin({
 *   enableConsensus: true,
 *   consensusThreshold: 0.8,
 *   verifyFindingTypes: ['vulnerability'],
 *   strategy: 'weighted',
 *   minModels: 2,
 *   modelTimeout: 30000,
 * });
 *
 * await mixin.initializeConsensus();
 *
 * const result = await mixin.verifyFinding(finding);
 * ```
 */
export function createConsensusEnabledMixin(
  config: Partial<ConsensusEnabledConfig> = {}
): ConsensusEnabledMixin {
  return new ConsensusEnabledMixin(config);
}

// ============================================================================
// TypeScript Mixin Helper
// ============================================================================

/**
 * Type helper for mixing ConsensusEnabledMixin into other classes
 *
 * @example
 * ```typescript
 * // Define base class
 * class MyBaseCoordinator {
 *   // ... base implementation
 * }
 *
 * // Create mixed class
 * const ConsensusEnabledCoordinator = withConsensusEnabled(MyBaseCoordinator);
 *
 * class MyDomainCoordinator extends ConsensusEnabledCoordinator {
 *   // Now has access to consensus methods
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Constructor<T = object> = new (...args: any[]) => T;

/**
 * Apply ConsensusEnabledMixin to a base class
 *
 * This is a TypeScript mixin pattern that adds consensus capabilities
 * to any base class.
 *
 * @param Base - The base class to extend
 * @param config - Configuration for consensus verification
 * @returns Mixed class with consensus capabilities
 */
export function withConsensusEnabled<TBase extends Constructor>(
  Base: TBase,
  config: Partial<ConsensusEnabledConfig> = {}
): TBase & Constructor<IConsensusEnabledDomain> {
  return class extends Base {
    protected readonly consensusConfig: ConsensusEnabledConfig;
    protected consensusEngine: ConsensusEngine | undefined;
    protected consensusInitialized: boolean = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(...args: any[]) {
      super(...args);
      this.consensusConfig = {
        ...DEFAULT_CONSENSUS_ENABLED_CONFIG,
        ...config,
      };
    }

    async initializeConsensus(): Promise<void> {
      if (!this.consensusConfig.enableConsensus) {
        return;
      }

      const registry = registerProvidersFromEnv(this.consensusConfig.enableLogging);
      const providers = registry.getAll();

      if (providers.length === 0) {
        return;
      }

      this.consensusEngine = createConsensusEngine({
        strategy: this.consensusConfig.strategy,
        models: providers,
        engineConfig: {
          minModels: Math.min(this.consensusConfig.minModels, providers.length),
          defaultModelTimeout: this.consensusConfig.modelTimeout,
          verifySeverities: this.consensusConfig.verifySeverities as Severity[],
        },
      });

      this.consensusInitialized = true;
    }

    async disposeConsensus(): Promise<void> {
      if (this.consensusEngine) {
        await this.consensusEngine.dispose();
        this.consensusEngine = undefined;
        this.consensusInitialized = false;
      }
    }

    isConsensusAvailable(): boolean {
      return this.consensusInitialized && this.consensusEngine !== undefined;
    }

    async verifyFinding<T>(
      finding: DomainFinding<T>,
      options?: VerificationOptions
    ): Promise<Result<ConsensusResult, Error>> {
      if (!this.consensusEngine || !this.consensusInitialized) {
        return err(new Error('Consensus engine not initialized'));
      }

      if (!this.requiresConsensus(finding)) {
        return err(new Error(`Finding ${finding.id} does not require consensus verification`));
      }

      const securityFinding = toSecurityFinding(finding, 'other');
      return this.consensusEngine.verify(securityFinding, {
        forceVerification: true,
        ...options,
      });
    }

    requiresConsensus<T>(finding: DomainFinding<T>): boolean {
      if (!this.consensusConfig.enableConsensus) {
        return false;
      }

      const typeMatches =
        this.consensusConfig.verifyFindingTypes.length === 0 ||
        this.consensusConfig.verifyFindingTypes.includes(finding.type);

      if (!typeMatches) {
        return false;
      }

      if (finding.severity && this.consensusConfig.verifySeverities.includes(finding.severity)) {
        return true;
      }

      return finding.confidence >= this.consensusConfig.consensusThreshold;
    }

    async verifyFindings<T>(
      findings: DomainFinding<T>[],
      options?: VerificationOptions
    ): Promise<Result<ConsensusResult[], Error>> {
      if (!this.consensusEngine || !this.consensusInitialized) {
        return err(new Error('Consensus engine not initialized'));
      }

      const findingsRequiringConsensus = findings.filter(f => this.requiresConsensus(f));
      if (findingsRequiringConsensus.length === 0) {
        return ok([]);
      }

      const securityFindings = findingsRequiringConsensus.map(f => toSecurityFinding(f, 'other'));
      return this.consensusEngine.verifyBatch(securityFindings, {
        forceVerification: true,
        ...options,
      });
    }

    getConsensusStats(): ConsensusStatsType | undefined {
      return this.consensusEngine?.getStats();
    }
  } as TBase & Constructor<IConsensusEnabledDomain>;
}
