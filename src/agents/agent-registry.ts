import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'yaml';
import { Agent, AgentSchema, AgentRegistryEntry, ClaudeAgentConfig, ClaudeCommandConfig } from '../types/agent';
import { Logger } from '../utils/Logger';
import { AgentLoader } from '../loaders/agent-loader';

const logger = new Logger('agent-registry');

export interface AgentRegistryOptions {
  agentsPath?: string;
  claudeAgentsPath?: string;
  claudeCommandsPath?: string;
  autoWatch?: boolean;
  validateOnLoad?: boolean;
  cacheEnabled?: boolean;
}

export interface AgentSearchOptions {
  category?: string;
  capabilities?: string[];
  tags?: string[];
  pactLevel?: number;
  searchText?: string;
  limit?: number;
  sortBy?: 'name' | 'category' | 'lastModified' | 'pactLevel';
  sortOrder?: 'asc' | 'desc';
}

export interface AgentRegistryStats {
  total: number;
  loaded: number;
  registered: number;
  byCategory: Record<string, number>;
  byPactLevel: Record<number, number>;
  byTags: Record<string, number>;
  lastScanTime?: Date;
  errors: number;
}

/**
 * Comprehensive Agent Registry System
 *
 * Scans the agents/ folder for YAML files, validates agent definitions,
 * creates a registry mapping agent names to configurations, and provides
 * methods to spawn agents by name.
 */
export class AgentRegistry {
  private registry: Map<string, AgentRegistryEntry> = new Map();
  private agentsPath: string;
  private claudeAgentsPath: string;
  private claudeCommandsPath: string;
  private options: AgentRegistryOptions;
  private lastScanTime?: Date;
  private scanErrors: string[] = [];
  private agentLoader: AgentLoader;

  constructor(options: AgentRegistryOptions = {}) {
    this.options = {
      agentsPath: 'agents',  // Primary source: YAML agent definitions
      claudeAgentsPath: '.claude/agents',  // Claude integration docs
      claudeCommandsPath: '.claude/commands',
      autoWatch: false,
      validateOnLoad: true,
      cacheEnabled: true,
      ...options,
    };

    this.agentsPath = path.resolve(this.options.agentsPath!);
    this.claudeAgentsPath = path.resolve(this.options.claudeAgentsPath!);
    this.claudeCommandsPath = path.resolve(this.options.claudeCommandsPath!);
    this.agentLoader = new AgentLoader(this.agentsPath);
  }

  /**
   * Initialize the registry by scanning and loading all agents
   */
  async initialize(): Promise<void> {
    logger.info('Initializing agent registry...');

    try {
      await this.ensureDirectories();
      await this.scanAndLoadAgents();

      if (this.options.autoWatch) {
        await this.watchAgentChanges();
      }

      logger.info(`Agent registry initialized with ${this.registry.size} agents`);
    } catch (error) {
      logger.error('Failed to initialize agent registry:', error);
      throw new Error(`Agent registry initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Scan and load all agent definitions from YAML files
   * Note: .claude/agents/qe/ contains MD documentation for Claude Code,
   * not executable agent definitions.
   */
  async scanAndLoadAgents(): Promise<AgentRegistryEntry[]> {
    logger.info(`Scanning for YAML agents in: ${this.agentsPath}`);
    this.scanErrors = [];

    try {
      // Load YAML agent definitions (primary source of truth)
      const loadedAgents = await this.agentLoader.loadAllAgents();

      // Clear existing registry
      this.registry.clear();

      // Add all loaded agents to registry
      loadedAgents.forEach(agent => {
        // Detect Claude files for each agent
        this.detectClaudeFiles(agent);
        this.registry.set(agent.agent.name, agent);
      });

      this.lastScanTime = new Date();

      logger.info(`Successfully loaded ${loadedAgents.length} agents`);

      return loadedAgents;
    } catch (error) {
      const errorMsg = `Agent scanning failed: ${error instanceof Error ? error.message : String(error)}`;
      this.scanErrors.push(errorMsg);
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Load a single agent by name using the agent loader
   */
  async loadAgentByName(name: string): Promise<AgentRegistryEntry | null> {
    try {
      // Check if already in registry
      if (this.registry.has(name)) {
        return this.registry.get(name)!;
      }

      // Use agent loader to load by name
      const agent = await this.agentLoader.loadAgentByName(name);
      if (agent) {
        // Detect Claude files
        await this.detectClaudeFiles(agent);
        // Add to registry
        this.registry.set(agent.agent.name, agent);
        return agent;
      }

      return null;
    } catch (error) {
      logger.error(`Failed to load agent ${name}:`, error);
      return null;
    }
  }

  /**
   * Detect existing Claude agent and command files
   */
  private async detectClaudeFiles(entry: AgentRegistryEntry): Promise<void> {
    const agentName = entry.agent.name;

    // Check for Claude agent file
    const claudeAgentPath = path.join(this.claudeAgentsPath, `${agentName}.yaml`);
    if (await fs.pathExists(claudeAgentPath)) {
      entry.claudeAgentPath = claudeAgentPath;
    }

    // Check for Claude command file
    const claudeCommandPath = path.join(this.claudeCommandsPath, `${agentName}.yaml`);
    if (await fs.pathExists(claudeCommandPath)) {
      entry.claudeCommandPath = claudeCommandPath;
    }
  }

  /**
   * Get agent by name from registry
   */
  getAgent(name: string): AgentRegistryEntry | null {
    const agent = this.registry.get(name);
    if (!agent) {
      logger.debug(`Agent not found in registry: ${name}`);
      return null;
    }
    return agent;
  }

  /**
   * Get all loaded agents
   */
  getAllAgents(): AgentRegistryEntry[] {
    return Array.from(this.registry.values());
  }

  /**
   * Search agents with flexible criteria
   */
  searchAgents(options: AgentSearchOptions = {}): AgentRegistryEntry[] {
    let agents = Array.from(this.registry.values());

    // Filter by category
    if (options.category) {
      agents = agents.filter(entry => entry.agent.category === options.category);
    }

    // Filter by capabilities
    if (options.capabilities && options.capabilities.length > 0) {
      agents = agents.filter(entry => {
        const agentCapabilities = entry.agent.capabilities || [];
        return options.capabilities!.some(cap => agentCapabilities.includes(cap));
      });
    }

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      agents = agents.filter(entry => {
        const agentTags = entry.agent.tags || [];
        return options.tags!.some(tag => agentTags.includes(tag));
      });
    }

    // Filter by PACT level
    if (options.pactLevel !== undefined) {
      agents = agents.filter(entry => entry.agent.pactLevel === options.pactLevel);
    }

    // Text search in name, description, and tags
    if (options.searchText) {
      const searchLower = options.searchText.toLowerCase();
      agents = agents.filter(entry => {
        const agent = entry.agent;
        return (
          agent.name.toLowerCase().includes(searchLower) ||
          agent.description.toLowerCase().includes(searchLower) ||
          (agent.tags || []).some(tag => tag.toLowerCase().includes(searchLower))
        );
      });
    }

    // Sort results
    if (options.sortBy) {
      agents.sort((a, b) => {
        let aValue: any, bValue: any;

        switch (options.sortBy) {
          case 'name':
            aValue = a.agent.name;
            bValue = b.agent.name;
            break;
          case 'category':
            aValue = a.agent.category;
            bValue = b.agent.category;
            break;
          case 'lastModified':
            aValue = a.lastModified.getTime();
            bValue = b.lastModified.getTime();
            break;
          case 'pactLevel':
            aValue = a.agent.pactLevel || 0;
            bValue = b.agent.pactLevel || 0;
            break;
          default:
            aValue = a.agent.name;
            bValue = b.agent.name;
        }

        const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        return (options.sortOrder === 'desc') ? -comparison : comparison;
      });
    }

    // Limit results
    if (options.limit && options.limit > 0) {
      agents = agents.slice(0, options.limit);
    }

    return agents;
  }

  /**
   * Check if agent exists in registry
   */
  hasAgent(name: string): boolean {
    return this.registry.has(name);
  }

  /**
   * Register agent (mark as available for spawning)
   */
  registerAgent(name: string): boolean {
    const entry = this.registry.get(name);
    if (!entry) {
      logger.warn(`Cannot register unknown agent: ${name}`);
      return false;
    }

    entry.isRegistered = true;
    logger.info(`Registered agent: ${name}`);
    return true;
  }

  /**
   * Get comprehensive registry statistics
   */
  getStatistics(): AgentRegistryStats {
    const agents = Array.from(this.registry.values());

    const byCategory: Record<string, number> = {};
    const byPactLevel: Record<number, number> = {};
    const byTags: Record<string, number> = {};
    let registered = 0;

    agents.forEach(entry => {
      // Category stats
      const category = entry.agent.category;
      byCategory[category] = (byCategory[category] || 0) + 1;

      // PACT level stats
      const pactLevel = entry.agent.pactLevel || 0;
      byPactLevel[pactLevel] = (byPactLevel[pactLevel] || 0) + 1;

      // Tags stats
      (entry.agent.tags || []).forEach(tag => {
        byTags[tag] = (byTags[tag] || 0) + 1;
      });

      // Registration stats
      if (entry.isRegistered) {
        registered++;
      }
    });

    return {
      total: agents.length,
      loaded: agents.length,
      registered,
      byCategory,
      byPactLevel,
      byTags,
      lastScanTime: this.lastScanTime,
      errors: this.scanErrors.length,
    };
  }

  /**
   * Get agent names list
   */
  getAgentNames(): string[] {
    return Array.from(this.registry.keys()).sort();
  }

  /**
   * Get categories list
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    this.registry.forEach(entry => categories.add(entry.agent.category));
    return Array.from(categories).sort();
  }

  /**
   * Clear registry
   */
  clear(): void {
    this.registry.clear();
    this.scanErrors = [];
    this.lastScanTime = undefined;
    logger.info('Agent registry cleared');
  }

  /**
   * Watch for agent file changes (placeholder implementation)
   */
  private async watchAgentChanges(): Promise<void> {
    // TODO: Implement file watching with fs.watch or chokidar
    logger.info('Agent file watching not yet implemented');
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    await fs.ensureDir(this.agentsPath);
    await fs.ensureDir(this.claudeAgentsPath);
    await fs.ensureDir(this.claudeCommandsPath);
  }
}

// Export singleton instance
export const agentRegistry = new AgentRegistry();