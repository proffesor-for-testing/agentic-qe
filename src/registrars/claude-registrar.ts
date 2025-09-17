import * as fs from 'fs-extra';
import * as path from 'path';
import { Agent, AgentRegistryEntry, ClaudeAgentConfig, ClaudeCommandConfig } from '../types/agent';
import { Logger } from '../utils/Logger';

const logger = new Logger('claude-registrar');

export class ClaudeRegistrar {
  private claudeAgentsPath: string;
  private claudeCommandsPath: string;

  constructor(
    claudeAgentsPath: string = '.claude/agents/qe',
    claudeCommandsPath: string = '.claude/commands/qe'
  ) {
    this.claudeAgentsPath = path.resolve(claudeAgentsPath);
    this.claudeCommandsPath = path.resolve(claudeCommandsPath);
  }

  /**
   * Register all agents with Claude Code
   */
  async registerAllAgents(agents: AgentRegistryEntry[]): Promise<void> {
    try {
      logger.info(`Registering ${agents.length} agents with Claude Code`);

      // Ensure directories exist
      await this.ensureDirectories();

      // Register agents and commands in parallel
      const registrationPromises = agents.map(async (entry) => {
        try {
          await this.registerAgent(entry);
          await this.registerCommand(entry);
          entry.isRegistered = true;
          logger.debug(`Registered agent: ${entry.agent.name}`);
        } catch (error) {
          logger.error(`Failed to register agent ${entry.agent.name}:`, error);
        }
      });

      await Promise.all(registrationPromises);
      logger.info('Agent registration completed');
    } catch (error) {
      logger.error('Failed to register agents:', error);
      throw new Error(`Agent registration failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Register a single agent with Claude Code
   */
  async registerAgent(entry: AgentRegistryEntry): Promise<void> {
    const { agent } = entry;

    // Create Claude agent configuration
    const claudeConfig: ClaudeAgentConfig = {
      name: agent.name,
      description: agent.description,
      instructions: this.generateInstructions(agent),
      model: agent.model,
      temperature: agent.temperature,
      maxTokens: agent.max_tokens,
      tools: this.extractTools(agent),
      capabilities: agent.capabilities,
    };

    // Write agent configuration
    const agentConfigPath = path.join(this.claudeAgentsPath, `${agent.name}.json`);
    await fs.writeJson(agentConfigPath, claudeConfig, { spaces: 2 });

    entry.claudeAgentPath = agentConfigPath;
    logger.debug(`Created Claude agent config: ${agentConfigPath}`);
  }

  /**
   * Register a command for the agent
   */
  async registerCommand(entry: AgentRegistryEntry): Promise<void> {
    const { agent } = entry;

    // Create Claude command configuration
    const commandConfig: ClaudeCommandConfig = {
      name: `qe-${agent.name}`,
      description: `Execute ${agent.name} agent for quality engineering tasks`,
      usage: `qe-${agent.name} [options] <task>`,
      handler: this.generateCommandHandler(agent),
      parameters: this.extractParameters(agent),
    };

    // Write command configuration
    const commandConfigPath = path.join(this.claudeCommandsPath, `${agent.name}.js`);
    await fs.writeFile(commandConfigPath, this.generateCommandScript(commandConfig), 'utf-8');

    entry.claudeCommandPath = commandConfigPath;
    logger.debug(`Created Claude command: ${commandConfigPath}`);
  }

  /**
   * Generate instructions for Claude agent
   */
  private generateInstructions(agent: Agent): string {
    let instructions = '';

    // Add system prompt if available
    if (agent.system_prompt) {
      instructions += agent.system_prompt + '\n\n';
    }

    // Add role and capabilities
    instructions += `You are a ${agent.name} agent specialized in ${agent.description}.\n\n`;

    if (agent.capabilities && agent.capabilities.length > 0) {
      instructions += 'Your capabilities include:\n';
      agent.capabilities.forEach(capability => {
        instructions += `- ${capability}\n`;
      });
      instructions += '\n';
    }

    // Add PACT level information
    if (agent.pactLevel) {
      instructions += `PACT Classification Level: ${agent.pactLevel}\n`;
      instructions += this.getPactLevelDescription(agent.pactLevel) + '\n\n';
    }

    // Add workflow integration
    instructions += 'INTEGRATION REQUIREMENTS:\n';
    instructions += '1. Use Claude-Flow coordination hooks before and after operations\n';
    instructions += '2. Store intermediate results in swarm memory\n';
    instructions += '3. Coordinate with other agents through the swarm topology\n';
    instructions += '4. Follow SPARC methodology for systematic development\n\n';

    // Add example prompts
    if (agent.example_prompts && agent.example_prompts.length > 0) {
      instructions += 'Example use cases:\n';
      agent.example_prompts.forEach(prompt => {
        instructions += `- "${prompt}"\n`;
      });
      instructions += '\n';
    }

    // Add Claude-Flow hooks
    instructions += 'REQUIRED HOOKS:\n';
    instructions += 'Before starting work:\n';
    instructions += '  npx claude-flow@alpha hooks pre-task --description "[task description]"\n';
    instructions += 'After completing work:\n';
    instructions += '  npx claude-flow@alpha hooks post-task --task-id "[task-id]"\n\n';

    return instructions;
  }

  /**
   * Extract tools from agent definition
   */
  private extractTools(agent: Agent): string[] {
    const tools: string[] = [];

    if (agent.tools) {
      agent.tools.forEach(tool => {
        tools.push(tool.name);
      });
    }

    // Add common QE tools
    tools.push(...[
      'bash',
      'read_file',
      'write_file',
      'search_files',
      'run_tests'
    ]);

    return [...new Set(tools)]; // Remove duplicates
  }

  /**
   * Extract parameters from agent definition
   */
  private extractParameters(agent: Agent): ClaudeCommandConfig['parameters'] {
    const parameters: ClaudeCommandConfig['parameters'] = {};

    if (agent.parameters) {
      Object.entries(agent.parameters).forEach(([key, param]) => {
        parameters[key] = {
          type: param.type,
          description: param.description,
          default: param.default,
          required: param.default === undefined,
        };
      });
    }

    // Add common parameters
    parameters.task = {
      type: 'string',
      description: 'Task description or instruction',
      required: true,
    };

    parameters.coordination = {
      type: 'boolean',
      description: 'Enable Claude-Flow coordination',
      default: true,
    };

    parameters.memory_namespace = {
      type: 'string',
      description: 'Memory namespace for coordination',
      default: 'qe-agents',
    };

    return parameters;
  }

  /**
   * Generate command handler for agent
   */
  private generateCommandHandler(agent: Agent): string {
    return `
async function handle(params) {
  const { task, coordination = true, memory_namespace = 'qe-agents' } = params;

  try {
    // Pre-task coordination hook
    if (coordination) {
      await exec('npx claude-flow@alpha hooks pre-task --description "' + task + '"');
    }

    // Execute agent-specific logic
    const result = await execute${agent.name.replace(/-/g, '')}Task(task, params);

    // Post-task coordination hook
    if (coordination) {
      await exec('npx claude-flow@alpha hooks post-task --task-id "' + result.taskId + '"');
    }

    return result;
  } catch (error) {
    console.error('Agent execution failed:', error);
    throw error;
  }
}

async function execute${agent.name.replace(/-/g, '')}Task(task, params) {
  // Agent-specific implementation
  console.log('Executing ${agent.name} with task:', task);

  // Return structured result
  return {
    taskId: 'task-' + Date.now(),
    agent: '${agent.name}',
    status: 'completed',
    result: 'Task executed successfully',
    data: {}
  };
}

module.exports = { handle };
    `.trim();
  }

  /**
   * Generate command script
   */
  private generateCommandScript(config: ClaudeCommandConfig): string {
    return `#!/usr/bin/env node
/**
 * Claude Code Command: ${config.name}
 * Description: ${config.description}
 * Generated by AQE CLI
 */

${config.handler}
`;
  }

  /**
   * Get PACT level description
   */
  private getPactLevelDescription(level: number): string {
    const descriptions = {
      1: 'Passive - Responds to explicit instructions',
      2: 'Proactive - Anticipates needs and suggests actions',
      3: 'Autonomous - Makes independent decisions within scope',
      4: 'Collaborative - Coordinates with other agents',
      5: 'Targeted - Focuses on specific domain expertise'
    };

    return descriptions[level] || 'Unknown PACT level';
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    await fs.ensureDir(this.claudeAgentsPath);
    await fs.ensureDir(this.claudeCommandsPath);
    logger.debug(`Ensured directories: ${this.claudeAgentsPath}, ${this.claudeCommandsPath}`);
  }

  /**
   * Unregister agent from Claude Code
   */
  async unregisterAgent(entry: AgentRegistryEntry): Promise<void> {
    try {
      if (entry.claudeAgentPath && await fs.pathExists(entry.claudeAgentPath)) {
        await fs.remove(entry.claudeAgentPath);
      }

      if (entry.claudeCommandPath && await fs.pathExists(entry.claudeCommandPath)) {
        await fs.remove(entry.claudeCommandPath);
      }

      entry.isRegistered = false;
      logger.info(`Unregistered agent: ${entry.agent.name}`);
    } catch (error) {
      logger.error(`Failed to unregister agent ${entry.agent.name}:`, error);
      throw error;
    }
  }

  /**
   * Update agent registration
   */
  async updateAgent(entry: AgentRegistryEntry): Promise<void> {
    await this.unregisterAgent(entry);
    await this.registerAgent(entry);
    await this.registerCommand(entry);
    entry.isRegistered = true;
    logger.info(`Updated agent registration: ${entry.agent.name}`);
  }

  /**
   * List registered agents
   */
  async listRegisteredAgents(): Promise<string[]> {
    try {
      const agentFiles = await fs.readdir(this.claudeAgentsPath);
      return agentFiles
        .filter(file => file.endsWith('.json'))
        .map(file => path.basename(file, '.json'));
    } catch (error) {
      logger.error('Failed to list registered agents:', error);
      return [];
    }
  }

  /**
   * Clean up orphaned registrations
   */
  async cleanup(validAgents: string[]): Promise<void> {
    try {
      const registeredAgents = await this.listRegisteredAgents();
      const orphanedAgents = registeredAgents.filter(name => !validAgents.includes(name));

      const cleanupPromises = orphanedAgents.map(async (name) => {
        const agentPath = path.join(this.claudeAgentsPath, `${name}.json`);
        const commandPath = path.join(this.claudeCommandsPath, `${name}.js`);

        if (await fs.pathExists(agentPath)) {
          await fs.remove(agentPath);
        }
        if (await fs.pathExists(commandPath)) {
          await fs.remove(commandPath);
        }

        logger.info(`Cleaned up orphaned agent: ${name}`);
      });

      await Promise.all(cleanupPromises);

      if (orphanedAgents.length > 0) {
        logger.info(`Cleaned up ${orphanedAgents.length} orphaned agent registrations`);
      }
    } catch (error) {
      logger.error('Failed to cleanup orphaned registrations:', error);
    }
  }
}

// Export singleton instance
export const claudeRegistrar = new ClaudeRegistrar();