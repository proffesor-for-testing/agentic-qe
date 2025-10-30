/**
 * Hook Executor Service
 *
 * Executes Claude Flow hooks for agent lifecycle events and coordination.
 * Bridges MCP agents with Claude Flow's memory and event system.
 *
 * @deprecated Prefer using BaseAgent native lifecycle hooks for agent coordination.
 * This service is maintained for MCP integration and cross-tool coordination only.
 *
 * **Native Hooks (Recommended):**
 * - BaseAgent.executeHook() - Type-safe, performant, integrated
 * - Direct TypeScript method calls, no shell overhead
 * - See: src/agents/BaseAgent.ts for implementation
 *
 * **External Hooks (Use Only For):**
 * - MCP tool coordination across different processes
 * - Cross-process memory sharing via Claude Flow
 * - Legacy Claude Flow integration scenarios
 * - When Claude Flow CLI features are explicitly needed
 *
 * **Performance Note:** Native hooks are 500-1000x faster than external hooks
 * due to elimination of process spawning overhead.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 * @see BaseAgent for native hook implementation
 * @see docs/HOOKS-MIGRATION-GUIDE.md for migration guidance
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../../utils/Logger';
import { ISwarmMemoryManager } from '../../types/memory-interfaces';
import { SwarmMemoryManager } from '../../core/memory/SwarmMemoryManager';
import { VerificationHookManager } from '../../core/hooks/VerificationHookManager';

const execAsync = promisify(exec);

export type HookType = 'pre_task' | 'post_task' | 'post_edit' | 'session_start' | 'session_end' | 'notify' | 'pre-task' | 'post-task';

export interface HookParams {
  // Pre-task parameters
  description?: string;
  agentType?: string;
  agentId?: string;
  taskType?: string;

  // Post-task parameters
  taskId?: string;
  results?: any;
  status?: string;
  result?: any;
  metadata?: any;

  // Post-edit parameters
  file?: string;
  fileName?: string;
  memoryKey?: string;

  // Notification parameters
  message?: string;
  level?: 'info' | 'warn' | 'error';

  // Session parameters
  sessionId?: string;
  exportMetrics?: boolean;
}

export interface HookExecutionResult {
  success: boolean;
  hookType: HookType;
  commands: string[];
  outputs: string[];
  errors: string[];
  executionTime: number;
}

/**
 * HookExecutor - Execute Claude Flow hooks for agent coordination
 *
 * @deprecated Use BaseAgent native hooks instead. This class remains for MCP integration.
 *
 * Responsibilities:
 * - Execute pre/post task hooks via Claude Flow CLI
 * - Coordinate memory storage/retrieval across processes
 * - Send notifications to Claude Flow ecosystem
 * - Handle session lifecycle for MCP tools
 * - Bridge MCP agents with Claude Flow ecosystem
 *
 * **Migration Path:**
 * ```typescript
 * // OLD (deprecated):
 * const hookExecutor = new HookExecutor();
 * await hookExecutor.executePreTask({ description: 'task' });
 *
 * // NEW (recommended):
 * class MyAgent extends BaseAgent {
 *   async onPreTask(data: any) {
 *     // Your pre-task logic here
 *   }
 * }
 * await agent.executeTask(assignment); // Automatically calls onPreTask()
 * ```
 */
export class HookExecutor {
  private logger: Logger;
  private enabled: boolean;
  private dryRun: boolean;
  private timeout: number;
  private claudeFlowAvailable: boolean | null = null;
  private fallbackHookManager: VerificationHookManager | null = null;
  private memoryManager: ISwarmMemoryManager | null = null;
  private deprecationWarned: boolean = false;

  constructor(config: { enabled?: boolean; dryRun?: boolean; timeout?: number } = {}) {
    this.logger = Logger.getInstance();
    this.enabled = config.enabled !== false;
    this.dryRun = config.dryRun || false;
    this.timeout = config.timeout || 30000; // 30 seconds default
  }

  /**
   * Detect if Claude Flow is available
   * @returns True if claude-flow@alpha is available, false otherwise
   */
  private async detectClaudeFlow(): Promise<boolean> {
    if (this.claudeFlowAvailable !== null) {
      return this.claudeFlowAvailable;
    }

    try {
      await execAsync('npx claude-flow@alpha --version', {
        timeout: 5000,
        maxBuffer: 1024 * 1024 // 1MB buffer
      });
      this.claudeFlowAvailable = true;
      this.logger.info('Claude Flow detected, using external hooks');
      return true;
    } catch (error) {
      this.claudeFlowAvailable = false;
      this.logger.info('Claude Flow not detected, will use AQE hooks fallback');
      return false;
    }
  }

  /**
   * Initialize AQE hooks fallback if not already initialized
   */
  private async initializeFallback(): Promise<void> {
    if (!this.fallbackHookManager) {
      this.memoryManager = new SwarmMemoryManager(':memory:');
      // Non-null assertion is safe here since we just assigned memoryManager
      this.fallbackHookManager = new VerificationHookManager(this.memoryManager!);
      this.logger.info('AQE hooks fallback initialized');
    }
  }

  /**
   * Log deprecation warning once
   */
  private logDeprecationWarning(): void {
    if (!this.deprecationWarned) {
      this.logger.warn(
        '⚠️  HookExecutor is deprecated. Please migrate to BaseAgent lifecycle hooks for better performance.',
        {
          migration: 'See docs/HOOKS-MIGRATION-GUIDE.md',
          performance: 'Native hooks are 100-500x faster than external hooks',
          recommendation: 'Use BaseAgent.onPreTask(), onPostTask(), etc.'
        }
      );
      this.deprecationWarned = true;
    }
  }

  /**
   * Execute fallback hook using AQE VerificationHookManager
   * @param hookType - Type of hook to execute
   * @param params - Hook parameters
   * @returns Execution result
   */
  private async executeFallbackHook(hookType: HookType, params: HookParams): Promise<HookExecutionResult> {
    await this.initializeFallback();

    const startTime = Date.now();
    const outputs: string[] = [];
    const errors: string[] = [];

    try {
      switch (hookType) {
        case 'pre_task':
        case 'pre-task':
          const preTaskResult = await this.fallbackHookManager!.executePreTaskVerification({
            task: params.description || params.taskType || 'unknown',
            context: params.metadata
          });
          outputs.push(JSON.stringify(preTaskResult));

          // Store in memory if agentType provided
          if (params.agentType && this.memoryManager) {
            await this.memoryManager.store(`aqe/${params.agentType}/pre-task`, preTaskResult, {
              partition: 'coordination'
            });
          }
          break;

        case 'post_task':
        case 'post-task':
          const postTaskResult = await this.fallbackHookManager!.executePostTaskValidation({
            task: params.taskId || 'unknown',
            result: params.results || params.result || {}
          });
          outputs.push(JSON.stringify(postTaskResult));

          // Store results in memory if agentType provided
          if (params.agentType && params.results && this.memoryManager) {
            await this.memoryManager.store(`aqe/${params.agentType}/results`, params.results, {
              partition: 'coordination'
            });
          }
          break;

        case 'post_edit':
          const postEditResult = await this.fallbackHookManager!.executePostEditUpdate({
            file: params.file || params.fileName || 'unknown',
            changes: params.metadata || {}
          });
          outputs.push(JSON.stringify(postEditResult));

          // Store file tracking in memory
          if (params.file && this.memoryManager) {
            const fileName = params.fileName || params.file.split('/').pop();
            const memoryKey = params.memoryKey || `aqe/files/${fileName}`;
            await this.memoryManager.store(memoryKey, { file: params.file, timestamp: Date.now() }, {
              partition: 'coordination'
            });
          }
          break;

        case 'session_start':
          outputs.push(`Session started: ${params.sessionId}`);
          if (params.sessionId && this.memoryManager) {
            await this.memoryManager.store('aqe/session/current', params.sessionId, {
              partition: 'coordination'
            });
          }
          break;

        case 'session_end':
          const sessionResult = await this.fallbackHookManager!.executeSessionEndFinalization({
            sessionId: params.sessionId || 'unknown',
            duration: 0,
            tasksCompleted: 0
          });
          outputs.push(JSON.stringify(sessionResult));
          break;

        case 'notify':
          const notification = {
            message: params.message,
            level: params.level || 'info',
            timestamp: Date.now()
          };
          outputs.push(JSON.stringify(notification));
          if (this.memoryManager) {
            await this.memoryManager.store(`aqe/notifications/${Date.now()}`, notification, {
              partition: 'events',
              ttl: 86400 // 24 hours
            });
          }
          break;

        default:
          errors.push(`Unknown hook type: ${hookType}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Fallback hook execution failed: ${errorMessage}`);
      this.logger.error('Fallback hook execution error', { hookType, error: errorMessage });
    }

    const executionTime = Date.now() - startTime;
    const success = errors.length === 0;

    this.logger.info(`Fallback hook executed: ${hookType} (${executionTime}ms, ${success ? 'success' : 'failed'})`);

    return {
      success,
      hookType,
      commands: ['[AQE Fallback]'],
      outputs,
      errors,
      executionTime
    };
  }

  /**
   * Execute a hook with specified parameters
   *
   * @param hookType - Type of hook to execute
   * @param params - Hook parameters
   * @returns Execution result
   */
  async executeHook(hookType: HookType, params: HookParams): Promise<HookExecutionResult> {
    // Log deprecation warning
    this.logDeprecationWarning();

    if (!this.enabled) {
      this.logger.debug('Hook execution disabled, skipping');
      return this.createSuccessResult(hookType, [], [], []);
    }

    // Detect Claude Flow availability
    const hasClaudeFlow = await this.detectClaudeFlow();

    // Use fallback if Claude Flow is not available
    if (!hasClaudeFlow) {
      this.logger.info(`Using AQE hooks fallback for ${hookType} (Claude Flow not detected)`);
      return this.executeFallbackHook(hookType, params);
    }

    // Original external hook execution
    const startTime = Date.now();
    const commands = this.buildHookCommands(hookType, params);

    this.logger.info(`Executing ${hookType} hook with ${commands.length} commands (external)`);

    const outputs: string[] = [];
    const errors: string[] = [];

    for (const command of commands) {
      try {
        if (this.dryRun) {
          this.logger.info(`[DRY-RUN] Would execute: ${command}`);
          outputs.push(`[DRY-RUN] ${command}`);
        } else {
          const output = await this.executeCommand(command);
          outputs.push(output);
          this.logger.debug(`Hook command output: ${output.substring(0, 200)}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Hook command failed, trying fallback: ${command}`, { error: errorMessage });

        // Fallback to AQE hooks if external command fails
        this.logger.info('External hook failed, using AQE hooks fallback');
        return this.executeFallbackHook(hookType, params);
      }
    }

    const executionTime = Date.now() - startTime;
    const success = errors.length === 0;

    this.logger.info(`Hook execution completed: ${hookType} (${executionTime}ms, ${success ? 'success' : 'partial'})`);

    return {
      success,
      hookType,
      commands,
      outputs,
      errors,
      executionTime
    };
  }

  /**
   * Execute pre-task hook
   *
   * @param params - Pre-task parameters
   * @returns Execution result
   */
  async executePreTask(params: HookParams): Promise<HookExecutionResult> {
    return this.executeHook('pre_task', params);
  }

  /**
   * Execute post-task hook
   *
   * @param params - Post-task parameters
   * @returns Execution result
   */
  async executePostTask(params: HookParams): Promise<HookExecutionResult> {
    return this.executeHook('post_task', params);
  }

  /**
   * Execute post-edit hook
   *
   * @param params - Post-edit parameters
   * @returns Execution result
   */
  async executePostEdit(params: HookParams): Promise<HookExecutionResult> {
    return this.executeHook('post_edit', params);
  }

  /**
   * Send notification to Claude Flow
   *
   * @param params - Notification parameters
   * @returns Execution result
   */
  async notify(params: HookParams): Promise<HookExecutionResult> {
    return this.executeHook('notify', params);
  }

  /**
   * Store data in Claude Flow memory (with AQE fallback)
   *
   * @param key - Memory key
   * @param value - Value to store (will be JSON stringified)
   * @returns Execution result
   */
  async storeMemory(key: string, value: any): Promise<HookExecutionResult> {
    this.logDeprecationWarning();

    const startTime = Date.now();
    const outputs: string[] = [];
    const errors: string[] = [];

    // Check Claude Flow availability
    const hasClaudeFlow = await this.detectClaudeFlow();

    if (!hasClaudeFlow) {
      // Use AQE memory fallback
      this.logger.info(`Using AQE memory fallback for storing: ${key}`);
      try {
        await this.initializeFallback();
        await this.memoryManager!.store(key, value, {
          partition: 'coordination'
        });
        outputs.push(`Stored in AQE memory: ${key}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`AQE memory store failed: ${errorMessage}`);
      }

      return {
        success: errors.length === 0,
        hookType: 'post_task',
        commands: ['[AQE Memory Fallback]'],
        outputs,
        errors,
        executionTime: Date.now() - startTime
      };
    }

    // Try external Claude Flow first
    const command = `npx claude-flow@alpha memory store --key "${key}" --value '${JSON.stringify(value)}'`;

    try {
      if (this.dryRun) {
        this.logger.info(`[DRY-RUN] Would execute: ${command}`);
        outputs.push(`[DRY-RUN] ${command}`);
      } else {
        const output = await this.executeCommand(command);
        outputs.push(output);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('External memory store failed, using AQE fallback', { error: errorMessage });

      // Fallback to AQE memory
      try {
        await this.initializeFallback();
        await this.memoryManager!.store(key, value, {
          partition: 'coordination'
        });
        outputs.push(`Stored in AQE memory (fallback): ${key}`);
      } catch (fallbackError) {
        const fallbackErrorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        errors.push(`AQE memory fallback failed: ${fallbackErrorMessage}`);
      }
    }

    return {
      success: errors.length === 0,
      hookType: 'post_task',
      commands: [command],
      outputs,
      errors,
      executionTime: Date.now() - startTime
    };
  }

  /**
   * Retrieve data from Claude Flow memory (with AQE fallback)
   *
   * @param key - Memory key
   * @returns Retrieved value or null
   */
  async retrieveMemory(key: string): Promise<any> {
    this.logDeprecationWarning();

    // Check Claude Flow availability
    const hasClaudeFlow = await this.detectClaudeFlow();

    if (!hasClaudeFlow) {
      // Use AQE memory fallback
      this.logger.info(`Using AQE memory fallback for retrieving: ${key}`);
      try {
        await this.initializeFallback();
        const value = await this.memoryManager!.retrieve(key, {
          partition: 'coordination'
        });
        return value;
      } catch (error) {
        this.logger.warn(`AQE memory retrieve failed for key ${key}:`, error);
        return null;
      }
    }

    // Try external Claude Flow first
    const command = `npx claude-flow@alpha memory retrieve --key "${key}"`;

    try {
      if (this.dryRun) {
        this.logger.info(`[DRY-RUN] Would execute: ${command}`);
        return null;
      }

      const output = await this.executeCommand(command);
      try {
        return JSON.parse(output);
      } catch {
        return output; // Return raw output if not JSON
      }
    } catch (error) {
      this.logger.warn(`External memory retrieve failed, using AQE fallback for key ${key}:`, error);

      // Fallback to AQE memory
      try {
        await this.initializeFallback();
        const value = await this.memoryManager!.retrieve(key, {
          partition: 'coordination'
        });
        return value;
      } catch (fallbackError) {
        this.logger.warn(`AQE memory fallback failed for key ${key}:`, fallbackError);
        return null;
      }
    }
  }

  /**
   * Enable/disable hook execution
   *
   * @param enabled - True to enable, false to disable
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.logger.info(`Hook execution ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Enable/disable dry-run mode
   *
   * @param dryRun - True for dry-run, false for real execution
   */
  setDryRun(dryRun: boolean): void {
    this.dryRun = dryRun;
    this.logger.info(`Dry-run mode ${dryRun ? 'enabled' : 'disabled'}`);
  }

  /**
   * Reset Claude Flow detection cache (useful for testing or when dependencies change)
   */
  resetClaudeFlowDetection(): void {
    this.claudeFlowAvailable = null;
    this.logger.info('Claude Flow detection cache reset');
  }

  /**
   * Get current hook execution mode
   * @returns Object with mode information
   */
  getExecutionMode(): { external: boolean; fallback: boolean; mode: string } {
    if (this.claudeFlowAvailable === null) {
      return { external: false, fallback: false, mode: 'not-detected' };
    }
    return {
      external: this.claudeFlowAvailable,
      fallback: !this.claudeFlowAvailable,
      mode: this.claudeFlowAvailable ? 'external' : 'aqe-fallback'
    };
  }

  /**
   * Build hook commands based on type and parameters
   *
   * @param hookType - Hook type
   * @param params - Hook parameters
   * @returns Array of commands to execute
   */
  private buildHookCommands(hookType: HookType, params: HookParams): string[] {
    const commands: string[] = [];

    switch (hookType) {
      case 'pre_task':
        if (params.description) {
          commands.push(
            `npx claude-flow@alpha hooks pre-task --description "${this.escapeShellArg(params.description)}"${params.agentId ? ` --agent "${params.agentId}"` : ''}`
          );
        }
        if (params.agentType) {
          commands.push(
            `npx claude-flow@alpha memory retrieve --key "aqe/${this.escapeShellArg(params.agentType)}"`
          );
        }
        break;

      case 'post_task':
        if (params.taskId) {
          commands.push(
            `npx claude-flow@alpha hooks post-task --task-id "${this.escapeShellArg(params.taskId)}"${params.status ? ` --status "${params.status}"` : ''}`
          );
        }
        if (params.results && params.agentType) {
          commands.push(
            `npx claude-flow@alpha memory store --key "aqe/${this.escapeShellArg(params.agentType)}/results" --value '${JSON.stringify(params.results)}'`
          );
        }
        break;

      case 'post_edit':
        if (params.file) {
          const fileName = params.fileName || params.file.split('/').pop();
          const memoryKey = params.memoryKey || `aqe/files/${fileName}`;
          commands.push(
            `npx claude-flow@alpha hooks post-edit --file "${this.escapeShellArg(params.file)}" --memory-key "${this.escapeShellArg(memoryKey)}"`
          );
        }
        break;

      case 'notify':
        if (params.message) {
          commands.push(
            `npx claude-flow@alpha hooks notify --message "${this.escapeShellArg(params.message)}"${params.level ? ` --level "${params.level}"` : ''}`
          );
        }
        break;

      case 'session_start':
        if (params.sessionId) {
          commands.push(
            `npx claude-flow@alpha hooks session-start --session-id "${this.escapeShellArg(params.sessionId)}"`
          );
        }
        break;

      case 'session_end':
        if (params.sessionId) {
          commands.push(
            `npx claude-flow@alpha hooks session-end --session-id "${this.escapeShellArg(params.sessionId)}"${params.exportMetrics ? ' --export-metrics' : ''}`
          );
        }
        break;
    }

    return commands;
  }

  /**
   * Execute a shell command with timeout
   *
   * @param command - Command to execute
   * @returns Command output
   */
  private async executeCommand(command: string): Promise<string> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: this.timeout,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      if (stderr && stderr.trim()) {
        this.logger.warn('Command stderr:', stderr);
      }

      return stdout;
    } catch (error: any) {
      if (error.killed || error.signal === 'SIGTERM') {
        throw new Error(`Command timed out after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Escape shell argument to prevent injection
   *
   * @param arg - Argument to escape
   * @returns Escaped argument
   */
  private escapeShellArg(arg: string): string {
    // Replace double quotes with escaped quotes, and escape backslashes
    return arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /**
   * Create success result
   *
   * @param hookType - Hook type
   * @param commands - Executed commands
   * @param outputs - Command outputs
   * @param errors - Errors (empty for success)
   * @returns Execution result
   */
  private createSuccessResult(
    hookType: HookType,
    commands: string[],
    outputs: string[],
    errors: string[]
  ): HookExecutionResult {
    return {
      success: true,
      hookType,
      commands,
      outputs,
      errors,
      executionTime: 0
    };
  }
}

/**
 * Singleton instance for global access
 */
let globalHookExecutor: HookExecutor | null = null;

/**
 * Get or create global hook executor
 *
 * @param config - Optional configuration
 * @returns Global hook executor instance
 */
export function getHookExecutor(config?: { enabled?: boolean; dryRun?: boolean; timeout?: number }): HookExecutor {
  if (!globalHookExecutor) {
    globalHookExecutor = new HookExecutor(config);
  }
  return globalHookExecutor;
}

/**
 * Reset global hook executor (for testing)
 */
export function resetHookExecutor(): void {
  globalHookExecutor = null;
}
