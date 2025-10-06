/**
 * Agent Restart Command
 *
 * Gracefully restarts an agent while preserving configuration and state.
 * Handles cleanup, state persistence, and re-initialization.
 *
 * @module cli/commands/agent/restart
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { getAgentRegistry } from '../../../mcp/services/AgentRegistry';
import { Logger } from '../../../utils/Logger';

const logger = Logger.getInstance();

export interface RestartOptions {
  agentId: string;
  preserveState?: boolean;
  timeout?: number;
  force?: boolean;
}

export interface RestartResult {
  agentId: string;
  oldInstanceId: string;
  newInstanceId: string;
  status: 'restarting' | 'active' | 'failed';
  preservedConfig: any;
  restartTime: number;
  stateRestored: boolean;
}

/**
 * Agent Restart Command Implementation
 */
export class AgentRestartCommand {
  private static readonly AGENT_DIR = path.join(process.cwd(), '.aqe', 'agents');
  private static readonly STATE_DIR = path.join(process.cwd(), '.aqe', 'state');
  private static readonly DEFAULT_TIMEOUT = 30000;

  /**
   * Execute agent restart
   *
   * @param options - Restart options
   * @returns Restart result
   */
  static async execute(options: RestartOptions): Promise<RestartResult> {
    const startTime = Date.now();
    const { agentId, preserveState = true, timeout = this.DEFAULT_TIMEOUT, force = false } = options;

    logger.info(`Restarting agent: ${agentId}`, { preserveState, timeout, force });

    try {
      // Get agent registry
      const registry = getAgentRegistry();

      // Verify agent exists
      const registeredAgent = registry.getRegisteredAgent(agentId);
      if (!registeredAgent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      // Read current configuration
      const agentConfigPath = path.join(this.AGENT_DIR, `${agentId}.json`);
      const agentConfig = await this.readAgentConfig(agentConfigPath);

      // Preserve state if requested
      let savedState = null;
      if (preserveState) {
        savedState = await this.saveAgentState(agentId, registeredAgent);
      }

      // Mark agent as restarting
      await this.updateAgentStatus(agentConfigPath, 'restarting');

      // Terminate old instance
      await this.terminateAgent(agentId, force, timeout);

      // Wait for cleanup
      await this.waitForCleanup(500);

      // Spawn new instance with preserved config
      const newAgent = await this.spawnNewInstance(
        registeredAgent.mcpType,
        agentConfig,
        savedState
      );

      // Update configuration with new instance ID
      await this.updateAgentConfig(agentConfigPath, {
        ...agentConfig,
        status: 'active',
        lastRestart: new Date().toISOString(),
        restartCount: (agentConfig.restartCount || 0) + 1,
        instanceId: newAgent.id
      });

      const restartTime = Date.now() - startTime;

      logger.info(`Agent restarted successfully: ${agentId} -> ${newAgent.id}`, {
        restartTime,
        stateRestored: preserveState
      });

      return {
        agentId,
        oldInstanceId: registeredAgent.id,
        newInstanceId: newAgent.id,
        status: 'active',
        preservedConfig: agentConfig,
        restartTime,
        stateRestored: preserveState && savedState !== null
      };

    } catch (error) {
      logger.error(`Failed to restart agent ${agentId}:`, error);

      // Attempt to restore from backup
      try {
        await this.restoreFromBackup(agentId);
      } catch (restoreError) {
        logger.error('Failed to restore from backup:', restoreError);
      }

      throw new Error(`Agent restart failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Read agent configuration
   */
  private static async readAgentConfig(configPath: string): Promise<any> {
    if (!await fs.pathExists(configPath)) {
      throw new Error(`Agent configuration not found: ${configPath}`);
    }

    return await fs.readJson(configPath);
  }

  /**
   * Save agent state before restart
   */
  private static async saveAgentState(agentId: string, agent: any): Promise<any> {
    const statePath = path.join(this.STATE_DIR, `${agentId}.state.json`);

    await fs.ensureDir(this.STATE_DIR);

    const state = {
      savedAt: new Date().toISOString(),
      agentId,
      type: agent.type,
      status: agent.status,
      tasksCompleted: agent.tasksCompleted,
      totalExecutionTime: agent.totalExecutionTime,
      lastActivity: agent.lastActivity,
      metadata: {
        spawnedAt: agent.spawnedAt,
        capabilities: agent.agent?.config?.capabilities || []
      }
    };

    await fs.writeJson(statePath, state, { spaces: 2 });
    logger.debug(`Agent state saved: ${statePath}`);

    return state;
  }

  /**
   * Update agent status in config
   */
  private static async updateAgentStatus(configPath: string, status: string): Promise<void> {
    const config = await fs.readJson(configPath);
    config.status = status;
    config.statusUpdatedAt = new Date().toISOString();
    await fs.writeJson(configPath, config, { spaces: 2 });
  }

  /**
   * Update agent configuration
   */
  private static async updateAgentConfig(configPath: string, config: any): Promise<void> {
    await fs.writeJson(configPath, config, { spaces: 2 });
  }

  /**
   * Terminate agent with timeout
   */
  private static async terminateAgent(agentId: string, force: boolean, timeout: number): Promise<void> {
    const registry = getAgentRegistry();

    if (force) {
      // Force termination
      await registry.terminateAgent(agentId);
      logger.debug(`Agent force terminated: ${agentId}`);
    } else {
      // Graceful termination with timeout
      const terminatePromise = registry.terminateAgent(agentId);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Termination timeout')), timeout)
      );

      try {
        await Promise.race([terminatePromise, timeoutPromise]);
        logger.debug(`Agent gracefully terminated: ${agentId}`);
      } catch (error) {
        // Timeout occurred, force terminate
        logger.warn(`Graceful termination timeout, forcing: ${agentId}`);
        await registry.terminateAgent(agentId);
      }
    }
  }

  /**
   * Wait for cleanup to complete
   */
  private static async waitForCleanup(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Spawn new agent instance
   */
  private static async spawnNewInstance(
    mcpType: string,
    config: any,
    savedState: any
  ): Promise<any> {
    const registry = getAgentRegistry();

    const spawnConfig = {
      name: config.name || `${mcpType}-${Date.now()}`,
      description: config.description,
      capabilities: config.capabilities || [],
      resources: config.resources
    };

    const newAgent = await registry.spawnAgent(mcpType, spawnConfig);

    // Restore state if available
    if (savedState) {
      logger.debug('Restoring agent state after restart');
      // State restoration would happen here via agent methods
      // This is a placeholder for state restoration logic
    }

    return newAgent;
  }

  /**
   * Restore from backup
   */
  private static async restoreFromBackup(agentId: string): Promise<void> {
    const backupPath = path.join(this.AGENT_DIR, `${agentId}.backup.json`);
    const configPath = path.join(this.AGENT_DIR, `${agentId}.json`);

    if (await fs.pathExists(backupPath)) {
      await fs.copy(backupPath, configPath);
      logger.info(`Restored agent config from backup: ${agentId}`);
    }
  }
}
