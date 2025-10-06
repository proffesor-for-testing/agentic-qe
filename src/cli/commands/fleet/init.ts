import chalk from 'chalk';
import * as fs from 'fs-extra';

export interface FleetInitOptions {
  topology: 'hierarchical' | 'mesh' | 'ring' | 'adaptive';
  maxAgents: number;
  config?: string;
}

export class FleetInitCommand {
  static async execute(options: FleetInitOptions): Promise<void> {
    // Validate inputs
    await this.validateInputs(options);

    console.log(chalk.blue('🚀 Initializing Agentic QE Fleet...'));

    // Create directory structure
    await this.createDirectories();

    // Create fleet configuration
    const fleetConfig = {
      id: `fleet-${Date.now()}`,
      topology: options.topology,
      maxAgents: options.maxAgents,
      status: 'initialized',
      createdAt: new Date().toISOString()
    };

    await fs.writeJson('.agentic-qe/config/fleet.json', fleetConfig, { spaces: 2 });

    // Initialize agent registry
    const agentRegistry = {
      fleet: fleetConfig,
      agents: [],
      tasks: []
    };

    await fs.writeJson('.agentic-qe/data/registry.json', agentRegistry, { spaces: 2 });

    console.log(chalk.green('✅ Fleet initialized successfully'));
    console.log(chalk.gray(`  Topology: ${options.topology}`));
    console.log(chalk.gray(`  Max Agents: ${options.maxAgents}`));
  }

  private static async validateInputs(options: FleetInitOptions): Promise<void> {
    const validTopologies = ['hierarchical', 'mesh', 'ring', 'adaptive'];
    if (!validTopologies.includes(options.topology)) {
      throw new Error(`Invalid topology. Must be one of: ${validTopologies.join(', ')}`);
    }

    if (options.maxAgents < 1 || options.maxAgents > 100) {
      throw new Error('maxAgents must be between 1 and 100');
    }
  }

  private static async createDirectories(): Promise<void> {
    const dirs = [
      '.agentic-qe/config',
      '.agentic-qe/data',
      '.agentic-qe/logs',
      '.agentic-qe/reports'
    ];

    for (const dir of dirs) {
      await fs.ensureDir(dir);
    }
  }
}
