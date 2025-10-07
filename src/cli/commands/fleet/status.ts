import chalk from 'chalk';
import * as fs from 'fs-extra';

export interface FleetStatusOptions {
  detailed?: boolean;
  format?: 'json' | 'table';
}

export class FleetStatusCommand {
  static async execute(options: FleetStatusOptions): Promise<any> {
    // Check if fleet is initialized
    if (!await fs.pathExists('.agentic-qe/config/fleet.json')) {
      throw new Error('Fleet not initialized. Run: aqe fleet init');
    }

    // Load fleet configuration
    const fleetConfig = await fs.readJson('.agentic-qe/config/fleet.json');
    const agentRegistry = await fs.readJson('.agentic-qe/data/registry.json');

    // Build status object
    const status = {
      id: fleetConfig.id,
      topology: fleetConfig.topology,
      maxAgents: fleetConfig.maxAgents,
      activeAgents: agentRegistry.agents.filter((a: any) => a.status === 'active').length,
      totalAgents: agentRegistry.agents.length,
      runningTasks: agentRegistry.tasks.filter((t: any) => t.status === 'running').length,
      completedTasks: agentRegistry.tasks.filter((t: any) => t.status === 'completed').length,
      status: fleetConfig.status,
      uptime: Date.now() - new Date(fleetConfig.createdAt).getTime()
    };

    if (options.format === 'json') {
      console.log(JSON.stringify(status, null, 2));
    } else {
      this.displayStatus(status, options.detailed);
    }

    return status;
  }

  private static displayStatus(status: any, detailed?: boolean): void {
    console.log(chalk.blue('\n📊 Fleet Status Dashboard\n'));
    console.log(chalk.gray(`  Fleet ID: ${status.id}`));
    console.log(chalk.gray(`  Topology: ${status.topology}`));
    console.log(chalk.gray(`  Status: ${status.status}`));
    console.log(chalk.gray(`  Max Agents: ${status.maxAgents}`));
    console.log(chalk.gray(`  Active Agents: ${status.activeAgents}/${status.totalAgents}`));
    console.log(chalk.gray(`  Running Tasks: ${status.runningTasks}`));
    console.log(chalk.gray(`  Completed Tasks: ${status.completedTasks}`));
    console.log(chalk.gray(`  Uptime: ${this.formatUptime(status.uptime)}`));
  }

  private static formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}
