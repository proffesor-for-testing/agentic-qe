/**
 * TypeScript Interface Definitions for V2-to-V3 Migration Compatibility Layer
 *
 * This file contains all type definitions and interfaces for the agent migration
 * compatibility layer. It is designed to be copied into v3/src/migration/types.ts
 * with minimal modifications.
 *
 * @module migration/types
 * @version 1.0.0
 */

import { DomainName, AgentType } from '../shared/types';
import { EventBus } from '../kernel/interfaces';

// ============================================================================
// Mapping Types
// ============================================================================

/**
 * Types of agent mappings for different migration scenarios
 */
export enum MappingType {
  /** Direct 1:1 upgrade - same name, enhanced functionality */
  DIRECT = 'direct',

  /** Renamed agent - v2_compat field required */
  RENAMED = 'renamed',

  /** New v3-only agent - no v2 equivalent */
  NEW = 'new',

  /** Consolidated - multiple v2 agents merged into single v3 */
  CONSOLIDATED = 'consolidated',

  /** Split - single v2 agent split into multiple v3 agents */
  SPLIT = 'split',
}

/**
 * V2 to V3 agent mapping configuration
 *
 * Example:
 * ```typescript
 * {
 *   v2Name: 'qe-test-generator',
 *   v3Name: 'qe-test-architect',
 *   domain: 'test-generation',
 *   deprecated: true,
 *   deprecatedIn: '3.0.0',
 *   removedIn: '4.0.0',
 *   notes: 'Renamed to reflect strategic planning role',
 *   mappingType: MappingType.RENAMED
 * }
 * ```
 */
export interface AgentMapping {
  /** V2 agent name (e.g., 'qe-test-generator') */
  readonly v2Name: string;

  /** V3 agent name (e.g., 'qe-test-architect') */
  readonly v3Name: string;

  /** Domain the agent belongs to */
  readonly domain: DomainName;

  /** Whether the v2 name is deprecated */
  readonly deprecated: boolean;

  /** Version when deprecated (e.g., '3.0.0') */
  readonly deprecatedIn?: string;

  /** Version when v2 support will be removed (e.g., '4.0.0') */
  readonly removedIn?: string;

  /** Migration notes and guidance */
  readonly notes?: string;

  /** Mapping type for special handling */
  readonly mappingType: MappingType;

  /** For CONSOLIDATED mappings: list of v2 agents merged */
  readonly consolidatedFrom?: string[];

  /** For SPLIT mappings: list of v3 agents created */
  readonly splitInto?: string[];
}

// ============================================================================
// Resolution Types
// ============================================================================

/**
 * Agent name resolution result
 *
 * Returned by `resolve()` and `resolveBatch()` methods
 */
export interface AgentResolution {
  /** Whether resolution was successful */
  readonly success: boolean;

  /** Resolved v3 agent name (null if resolution failed) */
  readonly v3Name: string | null;

  /** Original name provided for resolution */
  readonly originalName: string;

  /** Whether input was a v2 agent name */
  readonly wasV2: boolean;

  /** Domain the agent belongs to (null if unknown) */
  readonly domain: DomainName | null;

  /** Deprecation warning if v2 agent used */
  readonly warning?: DeprecationWarning;

  /** Migration path suggestions */
  readonly migrationPath?: MigrationPath;

  /** Additional metadata */
  readonly metadata?: {
    /** Mapping type used */
    readonly mappingType?: MappingType;

    /** Whether agent is newly added in v3 */
    readonly isNew?: boolean;

    /** Related agents (for consolidated/split mappings) */
    readonly relatedAgents?: string[];
  };
}

// ============================================================================
// Deprecation Warning Types
// ============================================================================

/**
 * Warning severity levels
 */
export type WarningLevel = 'info' | 'warning' | 'error';

/**
 * Deprecation warning details
 *
 * Emitted when a v2 agent name is used
 */
export interface DeprecationWarning {
  /** Warning severity level */
  readonly level: WarningLevel;

  /** Human-readable warning message */
  readonly message: string;

  /** Version when feature was deprecated */
  readonly deprecatedIn: string;

  /** Version when feature will be removed */
  readonly removedIn: string;

  /** Documentation URL for migration guide */
  readonly docsUrl?: string;

  /** Whether auto-fix is available */
  readonly canAutoFix: boolean;

  /** Suggested fix command */
  readonly fixCommand?: string;

  /** Additional context */
  readonly context?: {
    /** Original agent name */
    readonly v2Name: string;

    /** Target agent name */
    readonly v3Name: string;

    /** Domain name */
    readonly domain: DomainName;
  };
}

// ============================================================================
// Migration Path Types
// ============================================================================

/**
 * Migration effort estimate
 */
export type MigrationEffort = 'low' | 'medium' | 'high';

/**
 * Migration priority level
 */
export type MigrationPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Single migration step
 */
export interface MigrationStep {
  /** Step order (1-indexed) */
  readonly order: number;

  /** Step description */
  readonly description: string;

  /** Whether step can be automated */
  readonly automated: boolean;

  /** CLI command for automation */
  readonly command?: string;

  /** Expected outcome */
  readonly expectedOutcome?: string;

  /** Rollback instructions */
  readonly rollback?: string;
}

/**
 * Migration path recommendation
 *
 * Provides step-by-step guidance for migrating from v2 to v3
 */
export interface MigrationPath {
  /** Current agent name (v2) */
  readonly from: string;

  /** Target agent name (v3) */
  readonly to: string;

  /** Step-by-step migration instructions */
  readonly steps: MigrationStep[];

  /** Estimated migration effort */
  readonly effort: MigrationEffort;

  /** Breaking changes in migration */
  readonly breakingChanges: string[];

  /** Configuration changes required */
  readonly configChanges?: ConfigChange[];

  /** Code changes required */
  readonly codeChanges?: CodeChange[];

  /** Testing recommendations */
  readonly testingRecommendations?: string[];
}

/**
 * Configuration change required for migration
 */
export interface ConfigChange {
  /** File path */
  readonly file: string;

  /** Field to change */
  readonly field: string;

  /** Old value */
  readonly oldValue: unknown;

  /** New value */
  readonly newValue: unknown;

  /** Change description */
  readonly description: string;
}

/**
 * Code change required for migration
 */
export interface CodeChange {
  /** File path */
  readonly file: string;

  /** Change type */
  readonly type: 'rename' | 'modify' | 'delete' | 'add';

  /** Description */
  readonly description: string;

  /** Code snippet (before) */
  readonly before?: string;

  /** Code snippet (after) */
  readonly after?: string;
}

// ============================================================================
// Migration Report Types
// ============================================================================

/**
 * Migration item in report
 */
export interface MigrationItem {
  /** V2 agent name */
  readonly v2Name: string;

  /** V3 agent name */
  readonly v3Name: string;

  /** Domain */
  readonly domain: DomainName;

  /** Migration priority */
  readonly priority: MigrationPriority;

  /** Migration effort */
  readonly effort: MigrationEffort;

  /** Whether migration has breaking changes */
  readonly breakingChanges: boolean;

  /** Number of breaking changes */
  readonly breakingChangeCount: number;

  /** Mapping type */
  readonly mappingType: MappingType;
}

/**
 * Migration report summary
 */
export interface MigrationSummary {
  /** Number of v2 agents in use */
  readonly v2Count: number;

  /** Number of v3 agents in use */
  readonly v3Count: number;

  /** Number of unknown agents */
  readonly unknownCount: number;

  /** Migration progress percentage (0-100) */
  readonly migrationProgress: number;

  /** Estimated total effort */
  readonly totalEffort: MigrationEffort;

  /** Number of blocking issues */
  readonly blockingIssues: number;
}

/**
 * Complete migration report
 *
 * Generated by `generateMigrationReport()` method
 */
export interface MigrationReport {
  /** Total agents analyzed */
  readonly total: number;

  /** Agents requiring migration */
  readonly needsMigration: MigrationItem[];

  /** Already using v3 format */
  readonly alreadyV3: string[];

  /** Unknown agents (not in mapping) */
  readonly unknown: string[];

  /** Summary statistics */
  readonly summary: MigrationSummary;

  /** Recommended migration order */
  readonly recommendedOrder: string[];

  /** Migration timeline estimate */
  readonly estimatedTimeline?: {
    /** Estimated completion date */
    readonly completionDate: Date;

    /** Total hours estimated */
    readonly totalHours: number;

    /** By priority breakdown */
    readonly byPriority: {
      readonly critical: number;
      readonly high: number;
      readonly medium: number;
      readonly low: number;
    };
  };
}

// ============================================================================
// Usage Statistics Types
// ============================================================================

/**
 * Agent usage entry
 */
export interface AgentUsageEntry {
  /** Agent name */
  readonly name: string;

  /** Number of times used */
  readonly count: number;

  /** First seen timestamp */
  readonly firstSeen: Date;

  /** Last seen timestamp */
  readonly lastSeen: Date;

  /** Whether agent is v2 format */
  readonly isV2: boolean;
}

/**
 * Usage statistics for v2 agent tracking
 *
 * Helps identify which v2 agents are actively used
 */
export interface UsageStats {
  /** Total resolutions performed */
  readonly totalResolutions: number;

  /** V2 agent usage count by name */
  readonly v2Usage: Map<string, number>;

  /** V3 agent usage count by name */
  readonly v3Usage: Map<string, number>;

  /** Failed resolutions (unknown agents) */
  readonly failures: number;

  /** First activity timestamp */
  readonly startedAt: Date;

  /** Last activity timestamp */
  readonly lastActivityAt: Date;

  /** Top 10 most used v2 agents */
  readonly topV2Agents: AgentUsageEntry[];

  /** Top 10 most used v3 agents */
  readonly topV3Agents: AgentUsageEntry[];
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Compatibility layer configuration
 *
 * Controls behavior of the compatibility layer
 */
export interface V2CompatConfig {
  /** Enable v2 compatibility layer */
  readonly enabled: boolean;

  /** Show deprecation warnings in console */
  readonly showWarnings: boolean;

  /** Fail on v2 usage in strict mode */
  readonly strictMode: boolean;

  /** Auto-migrate v2 names to v3 (auto-fix) */
  readonly autoMigrate: boolean;

  /** Log all v2 agent usage for migration tracking */
  readonly trackUsage: boolean;

  /** Maximum warnings to cache (prevents memory bloat) */
  readonly maxWarnings?: number;

  /** TTL for usage stats in seconds */
  readonly statsTTL?: number;

  /** Custom deprecation warning handler */
  readonly onDeprecation?: (warning: DeprecationWarning) => void;

  /** Custom migration report handler */
  readonly onMigrationReport?: (report: MigrationReport) => void;

  /** Warning level threshold (only emit warnings >= this level) */
  readonly warningThreshold?: WarningLevel;

  /** Domains to enable compatibility for (null = all domains) */
  readonly enabledDomains?: DomainName[] | null;
}

// ============================================================================
// Core Interface
// ============================================================================

/**
 * Agent Compatibility Layer Interface
 *
 * Main interface for v2 to v3 agent name resolution and migration utilities
 */
export interface IAgentCompatLayer {
  /**
   * Resolve an agent name (v2 or v3) to v3 format
   *
   * @param agentName - Agent name to resolve
   * @returns Resolution result with v3 name and metadata
   *
   * @example
   * ```typescript
   * const resolution = compatLayer.resolve('qe-test-generator');
   * if (resolution.success) {
   *   console.log(`Resolved to: ${resolution.v3Name}`);
   *   if (resolution.wasV2) {
   *     console.warn(resolution.warning?.message);
   *   }
   * }
   * ```
   */
  resolve(agentName: string): AgentResolution;

  /**
   * Batch resolve multiple agent names
   *
   * @param agentNames - Array of agent names to resolve
   * @returns Array of resolution results
   *
   * @example
   * ```typescript
   * const resolutions = compatLayer.resolveBatch([
   *   'qe-test-generator',
   *   'qe-coverage-analyzer'
   * ]);
   * ```
   */
  resolveBatch(agentNames: string[]): AgentResolution[];

  /**
   * Check if an agent name is v2 format
   *
   * @param agentName - Agent name to check
   * @returns True if agent is v2 format
   *
   * @example
   * ```typescript
   * if (compatLayer.isV2Agent('qe-test-generator')) {
   *   console.log('This is a v2 agent name');
   * }
   * ```
   */
  isV2Agent(agentName: string): boolean;

  /**
   * Check if an agent name is v3 format
   *
   * @param agentName - Agent name to check
   * @returns True if agent is v3 format
   */
  isV3Agent(agentName: string): boolean;

  /**
   * Get v2 name for a v3 agent (reverse lookup)
   *
   * @param v3Name - V3 agent name
   * @returns V2 name or null if not found
   *
   * @example
   * ```typescript
   * const v2Name = compatLayer.getV2Name('qe-test-architect');
   * // Returns: 'qe-test-generator'
   * ```
   */
  getV2Name(v3Name: string): string | null;

  /**
   * Get all agent mappings
   *
   * @returns Array of all agent mappings
   */
  getAllMappings(): ReadonlyArray<AgentMapping>;

  /**
   * Get mappings filtered by domain
   *
   * @param domain - Domain to filter by
   * @returns Array of mappings for the domain
   */
  getMappingsByDomain(domain: DomainName): ReadonlyArray<AgentMapping>;

  /**
   * Get mappings filtered by type
   *
   * @param type - Mapping type to filter by
   * @returns Array of mappings of the specified type
   */
  getMappingsByType(type: MappingType): ReadonlyArray<AgentMapping>;

  /**
   * Generate migration report for a set of agents
   *
   * @param usedAgents - Array of agent names currently in use
   * @returns Migration report with actionable recommendations
   *
   * @example
   * ```typescript
   * const report = compatLayer.generateMigrationReport([
   *   'qe-test-generator',
   *   'qe-coverage-analyzer',
   *   'qe-test-architect'
   * ]);
   *
   * console.log(`Migration Progress: ${report.summary.migrationProgress}%`);
   * console.log(`Agents to migrate: ${report.needsMigration.length}`);
   * ```
   */
  generateMigrationReport(usedAgents: string[]): MigrationReport;

  /**
   * Get migration path for a specific v2 agent
   *
   * @param v2Name - V2 agent name
   * @returns Migration path or null if not found
   *
   * @example
   * ```typescript
   * const path = compatLayer.getMigrationPath('qe-test-generator');
   * if (path) {
   *   console.log(`Migrating ${path.from} → ${path.to}`);
   *   path.steps.forEach(step => {
   *     console.log(`${step.order}. ${step.description}`);
   *   });
   * }
   * ```
   */
  getMigrationPath(v2Name: string): MigrationPath | null;

  /**
   * Get usage statistics for migration tracking
   *
   * @returns Current usage statistics
   */
  getUsageStats(): UsageStats;

  /**
   * Clear usage statistics
   *
   * Resets all usage counters and tracked data
   */
  clearUsageStats(): void;

  /**
   * Export usage data for analysis
   *
   * @returns Serializable usage data
   */
  exportUsageData(): {
    readonly stats: UsageStats;
    readonly warnings: DeprecationWarning[];
    readonly report: MigrationReport;
  };

  /**
   * Get configuration
   *
   * @returns Current configuration
   */
  getConfig(): Readonly<V2CompatConfig>;

  /**
   * Update configuration
   *
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<V2CompatConfig>): void;
}

// ============================================================================
// Deprecation Logger Interface
// ============================================================================

/**
 * Deprecation Logger Interface
 *
 * Centralized logging and tracking of deprecation warnings
 */
export interface IDeprecationLogger {
  /**
   * Emit a deprecation warning
   *
   * @param warning - Deprecation warning to emit
   */
  warn(warning: DeprecationWarning): void;

  /**
   * Get all emitted warnings
   *
   * @returns Array of warnings
   */
  getWarnings(): ReadonlyArray<DeprecationWarning>;

  /**
   * Get warnings filtered by level
   *
   * @param level - Warning level to filter by
   * @returns Array of warnings matching the level
   */
  getWarningsByLevel(level: WarningLevel): ReadonlyArray<DeprecationWarning>;

  /**
   * Clear all warnings
   */
  clearWarnings(): void;

  /**
   * Check if a specific warning has been emitted
   *
   * @param v2Name - V2 agent name
   * @returns True if warning exists for this agent
   */
  hasWarning(v2Name: string): boolean;
}

// ============================================================================
// Migration Reporter Interface
// ============================================================================

/**
 * Migration Reporter Interface
 *
 * Generates and formats migration reports
 */
export interface IMigrationReporter {
  /**
   * Generate migration report
   *
   * @param usedAgents - Array of agent names
   * @returns Complete migration report
   */
  generateReport(usedAgents: string[]): MigrationReport;

  /**
   * Format report as Markdown
   *
   * @param report - Migration report
   * @returns Markdown-formatted report
   */
  formatAsMarkdown(report: MigrationReport): string;

  /**
   * Format report as JSON
   *
   * @param report - Migration report
   * @returns JSON string
   */
  formatAsJSON(report: MigrationReport): string;

  /**
   * Format report as CLI table
   *
   * @param report - Migration report
   * @returns CLI-formatted table
   */
  formatAsCLITable(report: MigrationReport): string;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base migration error
 */
export abstract class MigrationErrorBase extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Agent resolution error
 */
export class AgentResolutionError extends MigrationErrorBase {
  constructor(
    public readonly agentName: string,
    public readonly reason: string
  ) {
    super(
      `Failed to resolve agent "${agentName}": ${reason}`,
      'AGENT_RESOLUTION_ERROR'
    );
  }
}

/**
 * Deprecation error (thrown in strict mode)
 */
export class DeprecationError extends MigrationErrorBase {
  constructor(
    public readonly warning: DeprecationWarning
  ) {
    super(warning.message, 'DEPRECATION_ERROR');
  }
}

/**
 * Migration error
 */
export class MigrationError extends MigrationErrorBase {
  constructor(
    message: string,
    public readonly migrationItem?: MigrationItem
  ) {
    super(message, 'MIGRATION_ERROR');
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends MigrationErrorBase {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message, 'CONFIGURATION_ERROR');
  }
}

// ============================================================================
// Factory Types
// ============================================================================

/**
 * Factory function for creating AgentCompatLayer
 */
export type AgentCompatLayerFactory = (
  mappings: AgentMapping[],
  config: V2CompatConfig,
  eventBus: EventBus
) => IAgentCompatLayer;

/**
 * Factory function for creating DeprecationLogger
 */
export type DeprecationLoggerFactory = (
  eventBus: EventBus,
  config: V2CompatConfig
) => IDeprecationLogger;

/**
 * Factory function for creating MigrationReporter
 */
export type MigrationReporterFactory = (
  compatLayer: IAgentCompatLayer
) => IMigrationReporter;
