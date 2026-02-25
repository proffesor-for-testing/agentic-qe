/**
 * Init Orchestrator - Thin Phase Runner
 * ADR-025: Enhanced Init with Self-Configuration
 *
 * A lightweight orchestrator that runs init phases in sequence.
 * This replaces the monolithic InitOrchestrator in init-wizard.ts.
 */

import type { AQEInitConfig, InitResult, InitStepResult } from './types.js';
import { createDefaultConfig } from './types.js';
import { toErrorMessage } from '../shared/error-utils.js';
import {
  getDefaultPhases,
  type InitPhase,
  type InitContext,
  type InitOptions,
  type PhaseResult,
} from './phases/index.js';

/**
 * Orchestrator options
 */
export interface OrchestratorOptions extends InitOptions {
  /** Project root directory */
  projectRoot: string;
  /** Custom phases (overrides defaults) */
  customPhases?: InitPhase[];
}

/**
 * Thin Init Orchestrator
 * Runs phases in sequence, collecting results
 */
export class ModularInitOrchestrator {
  private phases: InitPhase[];
  private context: InitContext;

  constructor(options: OrchestratorOptions) {
    this.context = this.createContext(options);
    this.phases = options.customPhases ?? getDefaultPhases();
  }

  /**
   * Create init context
   */
  private createContext(options: OrchestratorOptions): InitContext {
    return {
      projectRoot: options.projectRoot,
      options: {
        autoMode: options.autoMode,
        upgrade: options.upgrade,
        skipPatterns: options.skipPatterns,
        minimal: options.minimal,
        autoMigrate: options.autoMigrate,
        withN8n: options.withN8n,
        withOpenCode: options.withOpenCode,
        withKiro: options.withKiro,
        n8nApiConfig: options.n8nApiConfig,
        wizardAnswers: options.wizardAnswers,
        noGovernance: options.noGovernance,
      },
      config: {},
      enhancements: {
        claudeFlow: false,
        ruvector: false,
      },
      results: new Map(),
      services: {
        log: (msg: string) => console.log(msg),
        warn: (msg: string) => console.warn(msg),
        error: (msg: string) => console.error(msg),
      },
    };
  }

  /**
   * Run all phases and return result
   */
  async initialize(): Promise<InitResult> {
    const startTime = Date.now();
    const steps: InitStepResult[] = [];

    try {
      // Sort phases by order
      const sortedPhases = [...this.phases].sort((a, b) => a.order - b.order);

      // Run each phase
      for (const phase of sortedPhases) {
        // Check if phase should run
        const shouldRun = await phase.shouldRun(this.context);
        if (!shouldRun) {
          continue;
        }

        // Log phase start
        console.log(`\n📋 ${phase.description}...`);

        // Execute phase
        const result = await phase.execute(this.context);

        // Store result
        this.context.results.set(phase.name, result);

        // Record step
        steps.push({
          step: phase.description,
          status: result.success ? 'success' : 'error',
          message: result.message || '',
          durationMs: result.durationMs,
        });

        // Handle critical failure
        if (!result.success && phase.critical) {
          console.error(`\n❌ Critical phase failed: ${phase.name}`);

          // Try rollback if available
          if (phase.rollback) {
            try {
              await phase.rollback(this.context);
            } catch (rollbackError) {
              console.error(`Rollback failed: ${rollbackError}`);
            }
          }

          return this.createFailureResult(steps, startTime);
        }

        // Check for skip remaining
        if (result.skipRemaining) {
          break;
        }
      }

      return this.createSuccessResult(steps, startTime);
    } catch (error) {
      // Unexpected error
      steps.push({
        step: 'Initialization Failed',
        status: 'error',
        message: toErrorMessage(error),
        durationMs: 0,
      });

      return this.createFailureResult(steps, startTime);
    }
  }

  /**
   * Create success result
   */
  private createSuccessResult(steps: InitStepResult[], startTime: number): InitResult {
    const config = this.context.config as AQEInitConfig;

    // Extract summary from phase results
    const learningResult = this.context.results.get('learning');
    const codeIntelResult = this.context.results.get('code-intelligence');
    const assetsResult = this.context.results.get('assets');
    const hooksResult = this.context.results.get('hooks');
    const mcpResult = this.context.results.get('mcp');
    const claudeMdResult = this.context.results.get('claude-md');
    const workersResult = this.context.results.get('workers');

    return {
      success: true,
      config: config || createDefaultConfig('unknown', this.context.projectRoot),
      steps,
      summary: {
        projectAnalyzed: this.context.results.has('analysis'),
        configGenerated: this.context.results.has('configuration'),
        codeIntelligenceIndexed: (codeIntelResult?.data as Record<string, unknown> | undefined)?.entries as number ?? 0,
        patternsLoaded: (learningResult?.data as Record<string, unknown> | undefined)?.patternsLoaded as number ?? 0,
        skillsInstalled: (assetsResult?.data as Record<string, unknown> | undefined)?.skillsInstalled as number ?? 0,
        agentsInstalled: (assetsResult?.data as Record<string, unknown> | undefined)?.agentsInstalled as number ?? 0,
        hooksConfigured: (hooksResult?.data as Record<string, unknown> | undefined)?.configured as boolean ?? false,
        mcpConfigured: (mcpResult?.data as Record<string, unknown> | undefined)?.configured as boolean ?? false,
        claudeMdGenerated: (claudeMdResult?.data as Record<string, unknown> | undefined)?.generated as boolean ?? false,
        workersStarted: (workersResult?.data as Record<string, unknown> | undefined)?.workersConfigured as number ?? 0,
      },
      totalDurationMs: Date.now() - startTime,
      timestamp: new Date(),
    };
  }

  /**
   * Create failure result
   */
  private createFailureResult(steps: InitStepResult[], startTime: number): InitResult {
    return {
      success: false,
      config: createDefaultConfig('unknown', this.context.projectRoot),
      steps,
      summary: {
        projectAnalyzed: false,
        configGenerated: false,
        codeIntelligenceIndexed: 0,
        patternsLoaded: 0,
        skillsInstalled: 0,
        agentsInstalled: 0,
        hooksConfigured: false,
        mcpConfigured: false,
        claudeMdGenerated: false,
        workersStarted: 0,
      },
      totalDurationMs: Date.now() - startTime,
      timestamp: new Date(),
    };
  }

  /**
   * Get phase by name
   */
  getPhase(name: string): InitPhase | undefined {
    return this.phases.find(p => p.name === name);
  }

  /**
   * Get all phases
   */
  getPhases(): InitPhase[] {
    return [...this.phases];
  }

  /**
   * Get context (for testing)
   */
  getContext(): InitContext {
    return this.context;
  }
}

/**
 * Factory function
 */
export function createModularInitOrchestrator(options: OrchestratorOptions): ModularInitOrchestrator {
  return new ModularInitOrchestrator(options);
}

/**
 * Quick initialization with auto-configuration
 */
export async function quickInitModular(projectRoot: string): Promise<InitResult> {
  const orchestrator = createModularInitOrchestrator({
    projectRoot,
    autoMode: true,
  });
  return await orchestrator.initialize();
}

/**
 * Format init result for display
 */
export function formatInitResultModular(result: InitResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push('│                    AQE v3 Initialization                     │');
  lines.push('├─────────────────────────────────────────────────────────────┤');

  // Steps
  for (const step of result.steps) {
    const icon = step.status === 'success' ? '✓' : step.status === 'error' ? '✗' : '○';
    const stepName = step.step.substring(0, 48).padEnd(48);
    lines.push(`│  ${icon} ${stepName} ${String(step.durationMs).padStart(4)}ms │`);
  }

  lines.push('├─────────────────────────────────────────────────────────────┤');

  // Summary
  lines.push(`│  Project: ${result.config.project.name.substring(0, 45).padEnd(45)} │`);
  lines.push(`│  Type: ${result.config.project.type.padEnd(48)} │`);
  lines.push(`│  Code Intel: ${String(result.summary.codeIntelligenceIndexed).padEnd(43)} │`);
  lines.push(`│  Patterns: ${String(result.summary.patternsLoaded).padEnd(45)} │`);
  lines.push(`│  Skills: ${String(result.summary.skillsInstalled).padEnd(47)} │`);
  lines.push(`│  Agents: ${String(result.summary.agentsInstalled).padEnd(47)} │`);
  lines.push(`│  Workers: ${String(result.summary.workersStarted).padEnd(46)} │`);
  lines.push(`│  Hooks: ${result.summary.hooksConfigured ? 'Yes' : 'No'.padEnd(48)} │`);
  lines.push(`│  MCP: ${result.summary.mcpConfigured ? 'Yes' : 'No'.padEnd(50)} │`);
  lines.push(`│  CLAUDE.md: ${result.summary.claudeMdGenerated ? 'Yes' : 'No'.padEnd(44)} │`);

  lines.push('├─────────────────────────────────────────────────────────────┤');

  // Final status
  const status = result.success
    ? '✓ AQE v3 initialized successfully'
    : '✗ Initialization failed';
  lines.push(`│  ${status.padEnd(57)} │`);

  lines.push('└─────────────────────────────────────────────────────────────┘');
  lines.push('');

  return lines.join('\n');
}
