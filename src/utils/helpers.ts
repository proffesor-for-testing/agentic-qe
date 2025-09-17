import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as uuid from 'uuid';
import { Agent, QEFrameworkConfig } from '../types/agent';

const execAsync = promisify(exec);

/**
 * Utility functions for AQE Framework
 */

// File system utilities
export const fsUtils = {
  /**
   * Ensure directory exists
   */
  async ensureDir(dirPath: string): Promise<void> {
    await fs.ensureDir(dirPath);
  },

  /**
   * Check if file exists
   */
  async exists(filePath: string): Promise<boolean> {
    return fs.pathExists(filePath);
  },

  /**
   * Read JSON file safely
   */
  async readJson<T>(filePath: string): Promise<T | null> {
    try {
      return await fs.readJson(filePath);
    } catch {
      return null;
    }
  },

  /**
   * Write JSON file safely
   */
  async writeJson(filePath: string, data: any): Promise<void> {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeJson(filePath, data, { spaces: 2 });
  },

  /**
   * Find files matching pattern
   */
  async findFiles(pattern: string, baseDir: string = process.cwd()): Promise<string[]> {
    const glob = require('glob');
    return new Promise((resolve, reject) => {
      glob(pattern, { cwd: baseDir, absolute: true }, (err: any, files: string[]) => {
        if (err) reject(err);
        else resolve(files);
      });
    });
  },

  /**
   * Get file modification time
   */
  async getModTime(filePath: string): Promise<Date | null> {
    try {
      const stats = await fs.stat(filePath);
      return stats.mtime;
    } catch {
      return null;
    }
  },
};

// String utilities
export const stringUtils = {
  /**
   * Convert to kebab-case
   */
  kebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  },

  /**
   * Convert to camelCase
   */
  camelCase(str: string): string {
    return str
      .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
      .replace(/^[A-Z]/, (c) => c.toLowerCase());
  },

  /**
   * Convert to PascalCase
   */
  pascalCase(str: string): string {
    const camel = stringUtils.camelCase(str);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
  },

  /**
   * Truncate string with ellipsis
   */
  truncate(str: string, length: number): string {
    return str.length > length ? str.slice(0, length - 3) + '...' : str;
  },

  /**
   * Generate random ID
   */
  randomId(): string {
    return uuid.v4().slice(0, 8);
  },

  /**
   * Generate task ID
   */
  taskId(agentName?: string): string {
    const id = uuid.v4().slice(0, 8);
    return agentName ? `${agentName}-${id}` : `task-${id}`;
  },
};

// System utilities
export const systemUtils = {
  /**
   * Execute shell command safely
   */
  async exec(command: string, options: { timeout?: number; cwd?: string } = {}): Promise<{ stdout: string; stderr: string }> {
    const { timeout = 30000, cwd = process.cwd() } = options;

    try {
      return await execAsync(command, { timeout, cwd });
    } catch (error) {
      throw new Error(`Command failed: ${command}\n${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /**
   * Check if command is available
   */
  async hasCommand(command: string): Promise<boolean> {
    try {
      await execAsync(`which ${command}`);
      return true;
    } catch {
      try {
        await execAsync(`where ${command}`); // Windows
        return true;
      } catch {
        return false;
      }
    }
  },

  /**
   * Get environment variable with default
   */
  env(key: string, defaultValue?: string): string | undefined {
    return process.env[key] || defaultValue;
  },

  /**
   * Check if running in CI
   */
  isCI(): boolean {
    return !!(process.env.CI || process.env.CONTINUOUS_INTEGRATION);
  },

  /**
   * Get system info
   */
  getSystemInfo(): { platform: string; arch: string; node: string } {
    return {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
    };
  },
};

// Validation utilities
export const validationUtils = {
  /**
   * Validate agent name
   */
  isValidAgentName(name: string): boolean {
    return /^[a-z][a-z0-9-]*[a-z0-9]$/.test(name) && name.length >= 3 && name.length <= 50;
  },

  /**
   * Validate PACT level
   */
  isValidPactLevel(level: number): boolean {
    return Number.isInteger(level) && level >= 1 && level <= 5;
  },

  /**
   * Validate swarm topology
   */
  isValidTopology(topology: string): boolean {
    return ['mesh', 'hierarchical', 'ring', 'star'].includes(topology);
  },

  /**
   * Validate configuration
   */
  validateConfig(config: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.agentsPath) {
      errors.push('agentsPath is required');
    }

    if (!config.swarm?.topology || !validationUtils.isValidTopology(config.swarm.topology)) {
      errors.push('Valid swarm topology is required');
    }

    if (!config.swarm?.maxAgents || config.swarm.maxAgents < 1) {
      errors.push('maxAgents must be positive');
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Validate agent definition
   */
  validateAgentDefinition(agent: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!agent.name || !validationUtils.isValidAgentName(agent.name)) {
      errors.push('Valid agent name is required');
    }

    if (!agent.description || agent.description.length < 10) {
      errors.push('Agent description must be at least 10 characters');
    }

    if (!agent.category) {
      errors.push('Agent category is required');
    }

    if (agent.pactLevel && !validationUtils.isValidPactLevel(agent.pactLevel)) {
      errors.push('PACT level must be between 1 and 5');
    }

    return { valid: errors.length === 0, errors };
  },
};

// Time utilities
export const timeUtils = {
  /**
   * Sleep for specified milliseconds
   */
  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Measure execution time
   */
  async measure<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    return { result, duration };
  },

  /**
   * Format duration
   */
  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  },

  /**
   * Parse duration string (e.g., "30s", "5m", "2h")
   */
  parseDuration(duration: string): number {
    const match = duration.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/);
    if (!match) throw new Error(`Invalid duration format: ${duration}`);

    const [, value, unit] = match;
    const num = parseFloat(value);

    switch (unit) {
      case 'ms': return num;
      case 's': return num * 1000;
      case 'm': return num * 60 * 1000;
      case 'h': return num * 60 * 60 * 1000;
      default: throw new Error(`Unknown time unit: ${unit}`);
    }
  },

  /**
   * Get timestamp
   */
  timestamp(): string {
    return new Date().toISOString();
  },
};

// Claude-Flow integration utilities
export const claudeFlowUtils = {
  /**
   * Check if Claude-Flow is available
   */
  async isAvailable(): Promise<boolean> {
    return systemUtils.hasCommand('npx') && systemUtils.hasCommand('claude-flow');
  },

  /**
   * Execute Claude-Flow command
   */
  async exec(command: string, options: { timeout?: number } = {}): Promise<any> {
    const { timeout = 30000 } = options;

    try {
      const { stdout } = await execAsync(`npx claude-flow@alpha ${command}`, { timeout });

      // Try to parse JSON response
      try {
        return JSON.parse(stdout);
      } catch {
        return { output: stdout };
      }
    } catch (error) {
      throw new Error(`Claude-Flow command failed: ${command}\n${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /**
   * Initialize swarm
   */
  async initSwarm(topology: string, maxAgents: number, swarmId?: string): Promise<string> {
    const id = swarmId || stringUtils.randomId();
    await claudeFlowUtils.exec(`swarm init --topology ${topology} --max-agents ${maxAgents} --id ${id}`);
    return id;
  },

  /**
   * Spawn agent
   */
  async spawnAgent(agentType: string, swarmId: string): Promise<void> {
    await claudeFlowUtils.exec(`agent spawn --type ${agentType} --swarm-id ${swarmId}`);
  },

  /**
   * Execute coordination hook
   */
  async executeHook(hookType: string, data: Record<string, any>): Promise<void> {
    const params = Object.entries(data)
      .map(([key, value]) => `--${key} "${value}"`)
      .join(' ');

    await claudeFlowUtils.exec(`hooks ${hookType} ${params}`);
  },

  /**
   * Get swarm status
   */
  async getSwarmStatus(swarmId?: string): Promise<any> {
    const cmd = swarmId ? `swarm status --id ${swarmId}` : 'swarm status';
    return claudeFlowUtils.exec(cmd);
  },
};

// Configuration utilities
export const configUtils = {
  /**
   * Load configuration from file
   */
  async loadConfig(configPath: string = 'qe.config.json'): Promise<QEFrameworkConfig | null> {
    return fsUtils.readJson<QEFrameworkConfig>(configPath);
  },

  /**
   * Save configuration to file
   */
  async saveConfig(config: QEFrameworkConfig, configPath: string = 'qe.config.json'): Promise<void> {
    await fsUtils.writeJson(configPath, config);
  },

  /**
   * Get default configuration
   */
  getDefaultConfig(): QEFrameworkConfig {
    return {
      version: '1.0.0',
      agentsPath: 'agents',
      claudeAgentsPath: '.claude/agents/qe',
      claudeCommandsPath: '.claude/commands/qe',
      swarm: {
        topology: 'mesh',
        strategy: 'balanced',
        maxAgents: 10,
        coordination: {
          memory: true,
          hooks: true,
          neural: false,
        },
      },
      logging: {
        level: 'info',
        file: 'qe.log',
      },
      claude_flow: {
        enabled: true,
        auto_spawn: true,
        coordination_hooks: true,
      },
    };
  },

  /**
   * Merge configurations
   */
  mergeConfig(base: QEFrameworkConfig, override: Partial<QEFrameworkConfig>): QEFrameworkConfig {
    return {
      ...base,
      ...override,
      swarm: { ...base.swarm, ...override.swarm },
      logging: { ...base.logging, ...override.logging },
      claude_flow: { ...base.claude_flow, ...override.claude_flow },
    };
  },
};

// Error utilities
export const errorUtils = {
  /**
   * Create structured error
   */
  createError(message: string, code?: string, data?: any): Error {
    const error = new Error(message) as any;
    if (code) error.code = code;
    if (data) error.data = data;
    return error;
  },

  /**
   * Handle async errors safely
   */
  async safeExecute<T>(fn: () => Promise<T>): Promise<{ success: boolean; data?: T; error?: Error }> {
    try {
      const data = await fn();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  },

  /**
   * Retry with exponential backoff
   */
  async retry<T>(
    fn: () => Promise<T>,
    options: { maxRetries?: number; baseDelay?: number } = {}
  ): Promise<T> {
    const { maxRetries = 3, baseDelay = 1000 } = options;

    let lastError: Error;

    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (i === maxRetries) break;

        const delay = baseDelay * Math.pow(2, i);
        await timeUtils.sleep(delay);
      }
    }

    throw lastError!;
  },
};

// Export all utilities
export default {
  fs: fsUtils,
  string: stringUtils,
  system: systemUtils,
  validation: validationUtils,
  time: timeUtils,
  claudeFlow: claudeFlowUtils,
  config: configUtils,
  error: errorUtils,
};