import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'yaml';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';

const logger = new Logger('agent-factory');

// Import types - we'll define these if they don't exist
export interface Agent {
  name: string;
  version?: string;
  description?: string;
  author?: string;
  category?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  system_prompt?: string;
  tools?: any[];
  capabilities?: string[];
  tags?: string[];
  example_prompts?: string[];
  [key: string]: any;
}

export interface AgentInstance {
  id: string;
  name: string;
  type?: string;
  capabilities: string[];
  tools: Map<string, any>;
  definition: Agent;
  initialize(): Promise<void>;
  execute(task: string, context?: any): Promise<any>;
  destroy(): Promise<void>;
  on(event: string, listener: Function): void;
  off(event: string, listener: Function): void;
}

export interface AgentFactoryConfig {
  agentsDirectory: string;
  defaultModel?: string;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
  enableHooks?: boolean;
  enableStateManagement?: boolean;
  enableEventEmission?: boolean;
}

export interface AgentEvent {
  type: string;
  agentId: string;
  agentName: string;
  timestamp: Date;
  data?: any;
}

/**
 * Simple YAML agent implementation
 */
class YamlAgent extends EventEmitter implements AgentInstance {
  id: string;
  name: string;
  type?: string;
  capabilities: string[];
  tools: Map<string, any>;
  definition: Agent;

  constructor(definition: Agent, overrides?: Partial<Agent>) {
    super();
    this.definition = { ...definition, ...overrides };
    this.id = `${definition.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    this.name = this.definition.name;
    this.type = this.definition.category;
    this.capabilities = this.definition.capabilities || [];
    this.tools = new Map();

    // Initialize tools
    if (this.definition.tools) {
      for (const tool of this.definition.tools) {
        this.tools.set(tool.name, tool);
      }
    }
  }

  async initialize(): Promise<void> {
    logger.info(`Initializing agent: ${this.name}`);
    this.emit('initialized', { agentId: this.id, agentName: this.name });
  }

  async execute(task: string, context?: any): Promise<any> {
    logger.info(`Agent ${this.name} executing task: ${task}`);
    this.emit('task_started', { agentId: this.id, task });

    // Simulate execution with system prompt
    const result = {
      agent: this.name,
      task,
      system_prompt: this.definition.system_prompt,
      tools_available: Array.from(this.tools.keys()),
      capabilities: this.capabilities,
      timestamp: new Date().toISOString()
    };

    this.emit('task_completed', { agentId: this.id, task, result });
    return result;
  }

  async destroy(): Promise<void> {
    logger.info(`Destroying agent: ${this.name}`);
    this.removeAllListeners();
    this.emit('destroyed', { agentId: this.id, agentName: this.name });
  }
}

/**
 * Simple agent registry
 */
class DefaultAgentRegistry {
  private agents = new Map<string, AgentInstance>();

  register(agent: AgentInstance): void {
    this.agents.set(agent.id, agent);
  }

  get(id: string): AgentInstance | undefined {
    return this.agents.get(id);
  }

  list(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  clear(): void {
    this.agents.clear();
  }

  getStats(): any {
    return {
      totalAgents: this.agents.size,
      agentNames: Array.from(this.agents.values()).map(a => a.name)
    };
  }
}

/**
 * Main agent factory implementation
 */
export class DefaultAgentFactory extends EventEmitter {
  private registry: DefaultAgentRegistry;
  private config: AgentFactoryConfig;
  private yamlCache = new Map<string, { definition: Agent; lastModified: number }>();
  private availableAgentsCache: string[] | null = null;
  private cacheExpiry = 30000; // 30 seconds

  constructor(config: AgentFactoryConfig) {
    super();
    this.config = {
      enableHooks: true,
      enableStateManagement: true,
      enableEventEmission: true,
      ...config
    };
    this.registry = new DefaultAgentRegistry();

    logger.info('Agent factory initialized', {
      agentsDirectory: this.config.agentsDirectory,
      enableHooks: this.config.enableHooks,
      enableStateManagement: this.config.enableStateManagement
    });
  }

  async loadDefinition(yamlPath: string): Promise<Agent> {
    try {
      // Check cache first
      const stats = await fs.stat(yamlPath);
      const lastModified = stats.mtime.getTime();
      const cached = this.yamlCache.get(yamlPath);

      if (cached && cached.lastModified >= lastModified) {
        logger.debug(`Using cached definition for: ${yamlPath}`);
        return cached.definition;
      }

      // Load and parse YAML
      logger.debug(`Loading agent definition from: ${yamlPath}`);
      const yamlContent = await fs.readFile(yamlPath, 'utf-8');
      const definition = yaml.parse(yamlContent) as Agent;

      // Cache the definition
      this.yamlCache.set(yamlPath, { definition, lastModified });

      logger.debug(`Loaded agent definition: ${definition.name}`, {
        yamlPath,
        agentName: definition.name,
        capabilities: definition.capabilities?.length || 0,
        tools: definition.tools?.length || 0
      });

      return definition;
    } catch (error) {
      logger.error(`Failed to load agent definition: ${yamlPath}`, error);
      throw new Error(`Failed to load agent definition from ${yamlPath}: ${error}`);
    }
  }

  async createAgent(definition: Agent, overrides?: Partial<Agent>): Promise<AgentInstance> {
    try {
      logger.debug(`Creating agent instance: ${definition.name}`);

      // Create the agent instance
      const agent = new YamlAgent(definition, overrides);

      // Initialize the agent
      await agent.initialize();

      // Register the agent
      this.registry.register(agent);

      // Set up event forwarding if enabled
      if (this.config.enableEventEmission) {
        this.setupEventForwarding(agent);
      }

      // Emit creation event
      const creationEvent: AgentEvent = {
        type: 'created',
        agentId: agent.id,
        agentName: agent.name,
        timestamp: new Date(),
        data: {
          capabilities: agent.capabilities,
          tools: Array.from(agent.tools.keys()),
          type: agent.type
        }
      };
      this.emit('agent_created', creationEvent);

      logger.info(`Agent created successfully: ${agent.name} (${agent.id})`);

      return agent;
    } catch (error) {
      logger.error(`Failed to create agent: ${definition.name}`, error);
      throw new Error(`Failed to create agent '${definition.name}': ${error}`);
    }
  }

  async createFromFile(yamlPath: string, overrides?: Partial<Agent>): Promise<AgentInstance> {
    const definition = await this.loadDefinition(yamlPath);
    return this.createAgent(definition, overrides);
  }

  async createFromName(agentName: string, overrides?: Partial<Agent>): Promise<AgentInstance> {
    const yamlPath = await this.findAgentYamlPath(agentName);
    if (!yamlPath) {
      throw new Error(`Agent '${agentName}' not found in agents directory`);
    }
    return this.createFromFile(yamlPath, overrides);
  }

  async getAvailableAgents(): Promise<string[]> {
    // Use cache if available and not expired
    if (this.availableAgentsCache) {
      return [...this.availableAgentsCache];
    }

    try {
      const agentNames: string[] = [];
      const agentsDir = this.config.agentsDirectory;

      if (!(await fs.pathExists(agentsDir))) {
        logger.warn(`Agents directory does not exist: ${agentsDir}`);
        return [];
      }

      // Scan for agent directories
      const entries = await fs.readdir(agentsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const agentDir = path.join(agentsDir, entry.name);
          const yamlPath = path.join(agentDir, 'agent.yaml');

          if (await fs.pathExists(yamlPath)) {
            agentNames.push(entry.name);
          }
        }
      }

      // Cache the result
      this.availableAgentsCache = agentNames;

      // Clear cache after expiry
      setTimeout(() => {
        this.availableAgentsCache = null;
      }, this.cacheExpiry);

      logger.debug(`Found ${agentNames.length} available agents`);

      return agentNames;
    } catch (error) {
      logger.error('Failed to scan available agents', error);
      return [];
    }
  }

  getRegistry(): DefaultAgentRegistry {
    return this.registry;
  }

  async destroy(): Promise<void> {
    try {
      logger.info('Destroying agent factory');

      // Destroy all registered agents
      const agents = this.registry.list();
      await Promise.all(agents.map(agent => agent.destroy()));

      // Clear registry
      this.registry.clear();

      // Clear caches
      this.yamlCache.clear();
      this.availableAgentsCache = null;

      // Remove all listeners
      this.removeAllListeners();

      logger.info('Agent factory destroyed successfully');
    } catch (error) {
      logger.error('Failed to destroy agent factory', error);
    }
  }

  /**
   * Create multiple agents from a list of names
   */
  async createMultipleAgents(
    agentNames: string[],
    overrides?: Record<string, Partial<Agent>>
  ): Promise<AgentInstance[]> {
    const agents: AgentInstance[] = [];
    const errors: Array<{ name: string; error: Error }> = [];

    for (const agentName of agentNames) {
      try {
        const agentOverrides = overrides?.[agentName];
        const agent = await this.createFromName(agentName, agentOverrides);
        agents.push(agent);
      } catch (error) {
        errors.push({
          name: agentName,
          error: error instanceof Error ? error : new Error(String(error))
        });
      }
    }

    if (errors.length > 0) {
      logger.warn(`Failed to create ${errors.length} agents`);
    }

    return agents;
  }

  /**
   * Find agents by capability requirements
   */
  async findAgentsByCapabilities(capabilities: string[]): Promise<string[]> {
    const availableAgents = await this.getAvailableAgents();
    const matchingAgents: string[] = [];

    for (const agentName of availableAgents) {
      try {
        const yamlPath = await this.findAgentYamlPath(agentName);
        if (yamlPath) {
          const definition = await this.loadDefinition(yamlPath);
          const agentCapabilities = definition.capabilities || [];

          // Check if agent has all required capabilities
          const hasAllCapabilities = capabilities.every(cap =>
            agentCapabilities.includes(cap)
          );

          if (hasAllCapabilities) {
            matchingAgents.push(agentName);
          }
        }
      } catch (error) {
        logger.debug(`Failed to check capabilities for agent: ${agentName}`);
      }
    }

    return matchingAgents;
  }

  /**
   * Get factory statistics
   */
  getFactoryStats(): any {
    return {
      registeredAgents: this.registry.list().length,
      cachedDefinitions: this.yamlCache.size,
      availableAgents: this.availableAgentsCache?.length || 0,
      registryStats: this.registry.getStats()
    };
  }

  private async findAgentYamlPath(agentName: string): Promise<string | null> {
    const agentDir = path.join(this.config.agentsDirectory, agentName);
    const yamlPath = path.join(agentDir, 'agent.yaml');

    if (await fs.pathExists(yamlPath)) {
      return yamlPath;
    }

    return null;
  }

  private setupEventForwarding(agent: AgentInstance): void {
    const events = ['initialized', 'state_changed', 'task_started', 'task_completed', 'error', 'destroyed'];

    for (const eventType of events) {
      agent.on(eventType, (event: AgentEvent) => {
        this.emit(`agent_${eventType}`, event);
        this.emit('agent_event', event);
      });
    }
  }
}

/**
 * Factory builder for easier configuration
 */
export class AgentFactoryBuilder {
  private config: Partial<AgentFactoryConfig> = {};

  agentsDirectory(path: string): this {
    this.config.agentsDirectory = path;
    return this;
  }

  defaultModel(model: string): this {
    this.config.defaultModel = model;
    return this;
  }

  defaultTemperature(temperature: number): this {
    this.config.defaultTemperature = temperature;
    return this;
  }

  defaultMaxTokens(maxTokens: number): this {
    this.config.defaultMaxTokens = maxTokens;
    return this;
  }

  enableHooks(enable: boolean = true): this {
    this.config.enableHooks = enable;
    return this;
  }

  enableStateManagement(enable: boolean = true): this {
    this.config.enableStateManagement = enable;
    return this;
  }

  enableEventEmission(enable: boolean = true): this {
    this.config.enableEventEmission = enable;
    return this;
  }

  build(): DefaultAgentFactory {
    if (!this.config.agentsDirectory) {
      throw new Error('Agents directory is required');
    }

    return new DefaultAgentFactory(this.config as AgentFactoryConfig);
  }
}

/**
 * Convenience function to create a factory with default settings
 */
export function createAgentFactory(agentsDirectory: string): DefaultAgentFactory {
  return new AgentFactoryBuilder()
    .agentsDirectory(agentsDirectory)
    .build();
}

/**
 * Convenience function to create a factory builder
 */
export function agentFactory(): AgentFactoryBuilder {
  return new AgentFactoryBuilder();
}