import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'yaml';
import { glob } from 'glob';
import { Agent, AgentSchema, AgentRegistryEntry } from '../types/agent';
import { Logger } from '../utils/Logger';

const logger = new Logger('agent-loader');

export class AgentLoader {
  private agentsPath: string;
  private registry: Map<string, AgentRegistryEntry> = new Map();

  constructor(agentsPath: string = 'agents') {
    this.agentsPath = path.resolve(agentsPath);
  }

  /**
   * Load all agent definitions from YAML and Markdown files
   */
  async loadAllAgents(): Promise<AgentRegistryEntry[]> {
    try {
      logger.info(`Loading agents from: ${this.agentsPath}`);

      // Find YAML agent definition files only
      // Note: MD files in .claude/agents/qe/ are documentation for Claude Code,
      // not executable agent definitions
      const agentFiles = await glob('**/agent.yaml', {
        cwd: this.agentsPath,
        absolute: true
      });

      logger.info(`Found ${agentFiles.length} YAML agent definition files`);

      const agents: AgentRegistryEntry[] = [];
      const loadPromises = agentFiles.map(async (filePath) => {
        try {
          const agent = await this.loadAgent(filePath);
          if (agent) {
            agents.push(agent);
            this.registry.set(agent.agent.name, agent);
          }
        } catch (error) {
          logger.error(`Failed to load agent from ${filePath}:`, error);
        }
      });

      await Promise.all(loadPromises);
      logger.info(`Successfully loaded ${agents.length} agents`);

      return agents;
    } catch (error) {
      logger.error('Failed to load agents:', error);
      throw new Error(`Agent loading failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load a single agent from YAML file
   */
  async loadAgent(filePath: string): Promise<AgentRegistryEntry | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Parse YAML (our primary agent definition format)
      const data = yaml.parse(content);

      // Validate against schema
      const agent = AgentSchema.parse(data);

      const stats = await fs.stat(filePath);

      const entry: AgentRegistryEntry = {
        agent,
        filePath,
        lastModified: stats.mtime,
        isRegistered: false,
      };

      logger.debug(`Loaded agent: ${agent.name} from ${filePath}`);
      return entry;
    } catch (error) {
      logger.error(`Failed to load agent from ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Load agent by name
   */
  async loadAgentByName(name: string): Promise<AgentRegistryEntry | null> {
    // Check registry first
    if (this.registry.has(name)) {
      return this.registry.get(name)!;
    }

    // Try to find and load agent (YAML first, then Markdown)
    const agentPath = path.join(this.agentsPath, name, 'agent.yaml');
    if (await fs.pathExists(agentPath)) {
      return this.loadAgent(agentPath);
    }

    // Try markdown file
    const markdownPath = path.join(this.agentsPath, `${name}.md`);
    if (await fs.pathExists(markdownPath)) {
      return this.loadAgent(markdownPath);
    }

    logger.warn(`Agent not found: ${name}`);
    return null;
  }

  /**
   * Get all loaded agents
   */
  getLoadedAgents(): AgentRegistryEntry[] {
    return Array.from(this.registry.values());
  }

  /**
   * Get agent by name from registry
   */
  getAgent(name: string): AgentRegistryEntry | null {
    return this.registry.get(name) || null;
  }

  /**
   * Filter agents by category
   */
  getAgentsByCategory(category: string): AgentRegistryEntry[] {
    return Array.from(this.registry.values())
      .filter(entry => entry.agent.category === category);
  }

  /**
   * Filter agents by capabilities
   */
  getAgentsByCapability(capability: string): AgentRegistryEntry[] {
    return Array.from(this.registry.values())
      .filter(entry =>
        entry.agent.capabilities?.includes(capability) || false
      );
  }

  /**
   * Filter agents by PACT level
   */
  getAgentsByPactLevel(level: number): AgentRegistryEntry[] {
    return Array.from(this.registry.values())
      .filter(entry => entry.agent.pactLevel === level);
  }

  /**
   * Search agents by tags
   */
  getAgentsByTags(tags: string[]): AgentRegistryEntry[] {
    return Array.from(this.registry.values())
      .filter(entry => {
        const agentTags = entry.agent.tags || [];
        return tags.some(tag => agentTags.includes(tag));
      });
  }

  /**
   * Validate agent definition
   */
  validateAgent(agent: any): { valid: boolean; errors: string[] } {
    try {
      AgentSchema.parse(agent);
      return { valid: true, errors: [] };
    } catch (error) {
      const errors = (error as any).issues?.map((issue: any) =>
        `${issue.path.join('.')}: ${issue.message}`
      ) || [error instanceof Error ? error.message : String(error)];
      return { valid: false, errors };
    }
  }

  /**
   * Watch for agent file changes
   */
  async watchAgents(callback: (event: string, agent: AgentRegistryEntry) => void): Promise<void> {
    // Implementation would use fs.watch or chokidar for file watching
    // For now, we'll implement a simple polling mechanism
    logger.info('Agent file watching not yet implemented');
  }

  /**
   * Reload agent from file
   */
  async reloadAgent(name: string): Promise<AgentRegistryEntry | null> {
    const entry = this.registry.get(name);
    if (!entry) {
      logger.warn(`Cannot reload unknown agent: ${name}`);
      return null;
    }

    try {
      const reloadedEntry = await this.loadAgent(entry.filePath);
      if (reloadedEntry) {
        this.registry.set(name, reloadedEntry);
        logger.info(`Reloaded agent: ${name}`);
        return reloadedEntry;
      }
    } catch (error) {
      logger.error(`Failed to reload agent ${name}:`, error);
    }

    return null;
  }

  /**
   * Export agent definitions
   */
  async exportAgents(outputPath: string, format: 'yaml' | 'json' = 'yaml'): Promise<void> {
    const agents = Array.from(this.registry.values()).map(entry => entry.agent);

    let content: string;
    if (format === 'json') {
      content = JSON.stringify(agents, null, 2);
    } else {
      content = yaml.stringify(agents);
    }

    await fs.writeFile(outputPath, content, 'utf-8');
    logger.info(`Exported ${agents.length} agents to ${outputPath}`);
  }

  /**
   * Get agent statistics
   */
  getStatistics(): {
    total: number;
    byCategory: Record<string, number>;
    byPactLevel: Record<number, number>;
    registered: number;
  } {
    const agents = Array.from(this.registry.values());

    const byCategory: Record<string, number> = {};
    const byPactLevel: Record<number, number> = {};
    let registered = 0;

    agents.forEach(entry => {
      // Category stats
      const category = entry.agent.category;
      byCategory[category] = (byCategory[category] || 0) + 1;

      // PACT level stats
      const pactLevel = entry.agent.pactLevel || 0;
      byPactLevel[pactLevel] = (byPactLevel[pactLevel] || 0) + 1;

      // Registration stats
      if (entry.isRegistered) {
        registered++;
      }
    });

    return {
      total: agents.length,
      byCategory,
      byPactLevel,
      registered,
    };
  }

  /**
   * Clear registry
   */
  clearRegistry(): void {
    this.registry.clear();
    logger.info('Agent registry cleared');
  }

  /**
   * Parse markdown file with frontmatter
   */
  private parseMarkdownWithFrontmatter(content: string): { frontmatter: any; body: string } {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (match) {
      const frontmatterYaml = match[1];
      const body = match[2].trim();

      try {
        const frontmatter = yaml.parse(frontmatterYaml);
        return { frontmatter, body };
      } catch (error) {
        logger.warn('Failed to parse frontmatter YAML, using empty frontmatter');
        return { frontmatter: {}, body: content };
      }
    }

    return { frontmatter: {}, body: content };
  }

  /**
   * Convert markdown agent definition to schema format
   */
  private convertMarkdownAgentToSchema(frontmatter: any, systemPrompt: string, filePath: string): any {
    const fileName = path.basename(filePath, '.md');

    // Convert hooks from string format to array format
    const convertedHooks: Record<string, string[]> = {};
    if (frontmatter.hooks) {
      for (const [hookName, hookValue] of Object.entries(frontmatter.hooks)) {
        if (typeof hookValue === 'string') {
          // Split multiline string commands into array
          convertedHooks[hookName] = (hookValue as string)
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        } else if (Array.isArray(hookValue)) {
          convertedHooks[hookName] = hookValue;
        } else {
          convertedHooks[hookName] = [];
        }
      }
    }

    return {
      name: frontmatter.name || fileName,
      version: frontmatter.version || frontmatter.metadata?.version || '1.0.0',
      description: frontmatter.description || frontmatter.metadata?.description || `${fileName} agent`,
      author: frontmatter.author || frontmatter.metadata?.author || 'agentic-qe',
      category: frontmatter.category || frontmatter.metadata?.category || frontmatter.type || 'quality-engineering',
      model: frontmatter.model || frontmatter.metadata?.model || 'claude-sonnet-4',
      temperature: frontmatter.temperature || frontmatter.metadata?.temperature,
      max_tokens: frontmatter.max_tokens || frontmatter.metadata?.max_tokens,
      pactLevel: frontmatter.pactLevel || frontmatter.metadata?.pactLevel,
      system_prompt: systemPrompt,
      capabilities: frontmatter.capabilities || [],
      permissions: frontmatter.permissions || [],
      tags: frontmatter.tags || [],
      hooks: convertedHooks,
      metadata: {
        ...frontmatter.metadata,
        color: frontmatter.color,
        priority: frontmatter.priority
      }
    };
  }
}

// Export singleton instance
export const agentLoader = new AgentLoader();