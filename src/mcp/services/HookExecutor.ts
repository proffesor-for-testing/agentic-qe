/**
 * Hook Executor Service
 *
 * Executes Claude Flow hooks for agent lifecycle events and coordination.
 * Bridges MCP agents with Claude Flow's memory and event system.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../../utils/Logger';

const execAsync = promisify(exec);

export type HookType = 'pre_task' | 'post_task' | 'post_edit' | 'session_start' | 'session_end' | 'notify';

export interface HookParams {
  // Pre-task parameters
  description?: string;
  agentType?: string;
  agentId?: string;

  // Post-task parameters
  taskId?: string;
  results?: any;
  status?: string;

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
 * Responsibilities:
 * - Execute pre/post task hooks
 * - Coordinate memory storage/retrieval
 * - Send notifications to Claude Flow
 * - Handle session lifecycle
 * - Bridge MCP agents with Claude Flow ecosystem
 */
export class HookExecutor {
  private logger: Logger;
  private enabled: boolean;
  private dryRun: boolean;
  private timeout: number;

  constructor(config: { enabled?: boolean; dryRun?: boolean; timeout?: number } = {}) {
    this.logger = Logger.getInstance();
    this.enabled = config.enabled !== false;
    this.dryRun = config.dryRun || false;
    this.timeout = config.timeout || 30000; // 30 seconds default
  }

  /**
   * Execute a hook with specified parameters
   *
   * @param hookType - Type of hook to execute
   * @param params - Hook parameters
   * @returns Execution result
   */
  async executeHook(hookType: HookType, params: HookParams): Promise<HookExecutionResult> {
    if (!this.enabled) {
      this.logger.debug('Hook execution disabled, skipping');
      return this.createSuccessResult(hookType, [], [], []);
    }

    const startTime = Date.now();
    const commands = this.buildHookCommands(hookType, params);

    this.logger.info(`Executing ${hookType} hook with ${commands.length} commands`);

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
        this.logger.warn(`Hook command failed (non-fatal): ${command}`, { error: errorMessage });
        errors.push(errorMessage);
        // Continue with other commands - hooks are best-effort
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
   * Store data in Claude Flow memory
   *
   * @param key - Memory key
   * @param value - Value to store (will be JSON stringified)
   * @returns Execution result
   */
  async storeMemory(key: string, value: any): Promise<HookExecutionResult> {
    const command = `npx claude-flow@alpha memory store --key "${key}" --value '${JSON.stringify(value)}'`;

    const startTime = Date.now();
    const outputs: string[] = [];
    const errors: string[] = [];

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
      errors.push(errorMessage);
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
   * Retrieve data from Claude Flow memory
   *
   * @param key - Memory key
   * @returns Retrieved value or null
   */
  async retrieveMemory(key: string): Promise<any> {
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
      this.logger.warn(`Failed to retrieve memory key ${key}:`, error);
      return null;
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
