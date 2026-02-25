/**
 * Phase Interface - Modular Init System
 * ADR-025: Enhanced Init with Self-Configuration
 *
 * Defines the contract for init phases that can be composed
 * into a pipeline for flexible initialization.
 */

import type { ProjectAnalysis, AQEInitConfig } from '../types.js';
import { toErrorMessage, toError } from '../../shared/error-utils.js';

/**
 * Result of running an init phase
 */
export interface PhaseResult<T = unknown> {
  /** Whether the phase succeeded */
  success: boolean;
  /** Phase output data */
  data?: T;
  /** Error if phase failed */
  error?: Error;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Optional message for logging */
  message?: string;
  /** Whether to skip subsequent phases */
  skipRemaining?: boolean;
}

/**
 * Enhancement availability status
 */
export interface EnhancementStatus {
  claudeFlow: boolean;
  claudeFlowVersion?: string;
  ruvector: boolean;
  ruvectorVersion?: string;
}

/**
 * Context passed through init phases
 */
export interface InitContext {
  /** Project root directory */
  projectRoot: string;

  /** CLI options passed to init */
  options: InitOptions;

  /** Configuration being built up through phases */
  config: Partial<AQEInitConfig>;

  /** Project analysis result (set by analysis phase) */
  analysis?: ProjectAnalysis;

  /** Available enhancements detected */
  enhancements: EnhancementStatus;

  /** Results from completed phases */
  results: Map<string, PhaseResult>;

  /** V2 detection result (if applicable) */
  v2Detection?: V2DetectionResult;

  /** Shared services for phases */
  services: {
    /** Log a message */
    log: (message: string) => void;
    /** Log a warning */
    warn: (message: string) => void;
    /** Log an error */
    error: (message: string) => void;
  };
}

/**
 * Options passed to aqe init command
 */
export interface InitOptions {
  /** Skip wizard and use auto-configuration */
  autoMode?: boolean;
  /** Upgrade existing installation (overwrite skills, agents, validation) */
  upgrade?: boolean;
  /** Skip pattern loading */
  skipPatterns?: boolean;
  /** Minimal configuration (no skills, patterns, workers) */
  minimal?: boolean;
  /** Automatically migrate from v2 if detected */
  autoMigrate?: boolean;
  /** Install n8n workflow testing platform */
  withN8n?: boolean;
  /** N8n API configuration */
  n8nApiConfig?: {
    baseUrl?: string;
    apiKey?: string;
  };
  /** Custom wizard answers */
  wizardAnswers?: Record<string, unknown>;
  /** Skip governance installation (ADR-058) - governance is ON by default */
  noGovernance?: boolean;
  /** Install OpenCode agent/skill/tool provisioning */
  withOpenCode?: boolean;
  /** Install AWS Kiro IDE integration (agents, skills, hooks, steering) */
  withKiro?: boolean;
}

/**
 * V2 installation detection result
 */
export interface V2DetectionResult {
  detected: boolean;
  memoryDbPath?: string;
  configPath?: string;
  agentsPath?: string;
  hasMemoryDb: boolean;
  hasConfig: boolean;
  hasAgents: boolean;
  version?: string;
}

/**
 * Init phase interface
 * Each phase is a self-contained unit of initialization logic
 */
export interface InitPhase<TResult = unknown> {
  /** Unique phase name (used as key in results map) */
  readonly name: string;

  /** Human-readable description */
  readonly description: string;

  /** Execution order (lower runs first) */
  readonly order: number;

  /** If true, failure stops the entire init process */
  readonly critical: boolean;

  /** Phase names that must complete before this phase */
  readonly requiresPhases?: readonly string[];

  /** Enhancement names that this phase uses (optional) */
  readonly requiresEnhancements?: readonly string[];

  /**
   * Determine if this phase should run
   * @param context Current init context
   * @returns true if phase should execute
   */
  shouldRun(context: InitContext): Promise<boolean>;

  /**
   * Execute the phase
   * @param context Current init context
   * @returns Phase result with data or error
   */
  execute(context: InitContext): Promise<PhaseResult<TResult>>;

  /**
   * Optional rollback if phase fails and cleanup is needed
   * @param context Current init context
   */
  rollback?(context: InitContext): Promise<void>;
}

/**
 * Base class for init phases with common functionality
 */
export abstract class BasePhase<TResult = unknown> implements InitPhase<TResult> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly order: number;
  abstract readonly critical: boolean;

  readonly requiresPhases?: readonly string[];
  readonly requiresEnhancements?: readonly string[];

  /**
   * Default shouldRun - always returns true
   * Override in subclass for conditional execution
   */
  async shouldRun(_context: InitContext): Promise<boolean> {
    return true;
  }

  /**
   * Execute with timing wrapper
   */
  async execute(context: InitContext): Promise<PhaseResult<TResult>> {
    const startTime = Date.now();

    try {
      const data = await this.run(context);
      return {
        success: true,
        data,
        durationMs: Date.now() - startTime,
        message: `${this.description} completed`,
      };
    } catch (error) {
      return {
        success: false,
        error: toError(error),
        durationMs: Date.now() - startTime,
        message: `${this.description} failed: ${toErrorMessage(error)}`,
      };
    }
  }

  /**
   * Implement phase logic here
   * @param context Init context
   * @returns Phase result data
   */
  protected abstract run(context: InitContext): Promise<TResult>;

  /**
   * Check if required phases have completed successfully
   */
  protected checkDependencies(context: InitContext): boolean {
    if (!this.requiresPhases?.length) return true;

    for (const phaseName of this.requiresPhases) {
      const result = context.results.get(phaseName);
      if (!result?.success) {
        context.services.warn(`Phase ${this.name} requires ${phaseName} which has not completed`);
        return false;
      }
    }
    return true;
  }

  /**
   * Check if required enhancements are available
   */
  protected checkEnhancements(context: InitContext): boolean {
    if (!this.requiresEnhancements?.length) return true;

    for (const enhancement of this.requiresEnhancements) {
      const available = enhancement === 'claudeFlow'
        ? context.enhancements.claudeFlow
        : enhancement === 'ruvector'
        ? context.enhancements.ruvector
        : false;

      if (!available) {
        context.services.warn(`Phase ${this.name} requires ${enhancement} which is not available`);
        return false;
      }
    }
    return true;
  }
}

/**
 * Phase registry for managing available phases
 */
export class PhaseRegistry {
  private phases: Map<string, InitPhase> = new Map();

  /**
   * Register a phase
   */
  register(phase: InitPhase): void {
    if (this.phases.has(phase.name)) {
      throw new Error(`Phase ${phase.name} is already registered`);
    }
    this.phases.set(phase.name, phase);
  }

  /**
   * Get a phase by name
   */
  get(name: string): InitPhase | undefined {
    return this.phases.get(name);
  }

  /**
   * Get all phases sorted by order
   */
  getOrdered(): InitPhase[] {
    return Array.from(this.phases.values())
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Check if a phase is registered
   */
  has(name: string): boolean {
    return this.phases.has(name);
  }
}

/**
 * Create a new phase registry with default phases
 */
export function createPhaseRegistry(): PhaseRegistry {
  return new PhaseRegistry();
}
