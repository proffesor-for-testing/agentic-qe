import chalk from 'chalk';
import * as fs from 'fs-extra';

export interface FleetScaleOptions {
  agents: number;
  force?: boolean;
}

export class FleetScaleCommand {
  static async execute(options: FleetScaleOptions): Promise<void> {
    // Validate input
    if (options.agents < 1 || options.agents > 100) {
      throw new Error('Invalid agent count. Must be between 1 and 100');
    }

    // Load current configuration
    const fleetConfig = await fs.readJson('.agentic-qe/config/fleet.json');
    const currentAgents = fleetConfig.maxAgents;

    console.log(chalk.blue(`⚙️  Scaling fleet from ${currentAgents} to ${options.agents} agents...`));

    // Update fleet configuration
    fleetConfig.maxAgents = options.agents;
    fleetConfig.lastScaled = new Date().toISOString();
    fleetConfig.scalingHistory = fleetConfig.scalingHistory || [];
    fleetConfig.scalingHistory.push({
      from: currentAgents,
      to: options.agents,
      timestamp: new Date().toISOString()
    });

    await fs.writeJson('.agentic-qe/config/fleet.json', fleetConfig, { spaces: 2 });

    // Store in coordination
    await this.storeScalingOperation(currentAgents, options.agents);

    console.log(chalk.green('✅ Fleet scaled successfully'));
    console.log(chalk.gray(`  Previous: ${currentAgents} agents`));
    console.log(chalk.gray(`  Current: ${options.agents} agents`));
    console.log(chalk.gray(`  Change: ${options.agents > currentAgents ? '+' : ''}${options.agents - currentAgents}`));
  }

  private static async storeScalingOperation(from: number, to: number): Promise<void> {
    const script = `npx claude-flow@alpha memory store --key "aqe/fleet/scaling" --value '{"from":${from},"to":${to},"timestamp":"${new Date().toISOString()}"}'`;

    // Store scaling script for later execution
    await fs.writeFile(
      '.agentic-qe/scripts/last-scaling.sh',
      `#!/bin/bash\n${script}\n`
    );
    await fs.chmod('.agentic-qe/scripts/last-scaling.sh', '755');
  }
}
