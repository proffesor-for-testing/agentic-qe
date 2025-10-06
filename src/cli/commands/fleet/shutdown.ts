import chalk from 'chalk';
import * as fs from 'fs-extra';

export interface FleetShutdownOptions {
  graceful?: boolean; // Wait for tasks to complete
  archive?: boolean; // Archive data before shutdown
  force?: boolean; // Force shutdown immediately
  preserve?: boolean; // Preserve state for later restart
}

export class FleetShutdownCommand {
  static async execute(options: FleetShutdownOptions): Promise<void> {
    // Check if fleet is initialized
    if (!await fs.pathExists('.agentic-qe/config/fleet.json')) {
      throw new Error('Fleet not initialized. Run: aqe fleet init');
    }

    console.log(chalk.blue.bold('\n⏹️  Fleet Shutdown\n'));

    const fleetConfig = await fs.readJson('.agentic-qe/config/fleet.json');

    // Confirm shutdown
    if (!options.force && !options.graceful) {
      console.log(chalk.yellow('⚠️  This will shut down the entire fleet. Use --graceful for safe shutdown.'));
    }

    // Archive data if requested
    if (options.archive) {
      await this.archiveFleetData(fleetConfig);
    }

    // Update status to shutting down
    await this.updateFleetStatus('shutting_down');

    // Graceful shutdown
    if (options.graceful) {
      await this.gracefulShutdown();
    } else if (options.force) {
      await this.forceShutdown();
    } else {
      await this.standardShutdown();
    }

    // Preserve state if requested
    if (options.preserve) {
      await this.preserveState(fleetConfig);
    } else {
      // Clean up runtime data
      await this.cleanupRuntimeData();
    }

    // Update final status
    await this.updateFleetStatus('shutdown');

    // Generate shutdown report
    await this.generateShutdownReport(fleetConfig, options);

    console.log(chalk.green('\n✅ Fleet shut down successfully'));

    // Store shutdown in coordination
    await this.storeShutdownOperation(options);
  }

  private static async archiveFleetData(fleetConfig: any): Promise<void> {
    console.log(chalk.blue('📦 Archiving fleet data...'));

    const archiveDir = `.agentic-qe/archive/shutdown-${Date.now()}`;
    await fs.ensureDir(archiveDir);

    // Archive directories
    const dirsToArchive = [
      '.agentic-qe/config',
      '.agentic-qe/data',
      '.agentic-qe/reports',
      '.agentic-qe/logs'
    ];

    for (const dir of dirsToArchive) {
      if (await fs.pathExists(dir)) {
        const dirName = dir.split('/').pop();
        await fs.copy(dir, `${archiveDir}/${dirName}`, { overwrite: true });
      }
    }

    // Create archive manifest
    const manifest = {
      fleetId: fleetConfig.id,
      topology: fleetConfig.topology,
      maxAgents: fleetConfig.maxAgents,
      archivedAt: new Date().toISOString(),
      reason: 'shutdown'
    };

    await fs.writeJson(`${archiveDir}/manifest.json`, manifest, { spaces: 2 });

    console.log(chalk.gray(`  Archive saved: ${archiveDir}`));
  }

  private static async updateFleetStatus(status: string): Promise<void> {
    const fleetConfig = await fs.readJson('.agentic-qe/config/fleet.json');
    fleetConfig.status = status;
    fleetConfig.lastStatusUpdate = new Date().toISOString();

    if (status === 'shutdown') {
      fleetConfig.shutdownAt = new Date().toISOString();
    }

    await fs.writeJson('.agentic-qe/config/fleet.json', fleetConfig, { spaces: 2 });

    // Update registry
    if (await fs.pathExists('.agentic-qe/data/registry.json')) {
      const registry = await fs.readJson('.agentic-qe/data/registry.json');
      registry.fleet = registry.fleet || {};
      registry.fleet.status = status;
      await fs.writeJson('.agentic-qe/data/registry.json', registry, { spaces: 2 });
    }
  }

  private static async gracefulShutdown(): Promise<void> {
    console.log(chalk.blue('🛑 Graceful shutdown initiated...'));

    // Load registry
    if (await fs.pathExists('.agentic-qe/data/registry.json')) {
      const registry = await fs.readJson('.agentic-qe/data/registry.json');

      // Wait for running tasks
      const runningTasks = registry.tasks?.filter((t: any) => t.status === 'running') || [];
      if (runningTasks.length > 0) {
        console.log(chalk.yellow(`  Waiting for ${runningTasks.length} tasks to complete...`));

        // Simulate waiting for tasks
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Mark remaining tasks as cancelled
        registry.tasks?.forEach((task: any) => {
          if (task.status === 'running') {
            task.status = 'cancelled';
            task.cancelledAt = new Date().toISOString();
            task.reason = 'fleet_shutdown';
          }
        });
      }

      // Stop all agents gracefully
      registry.agents?.forEach((agent: any) => {
        agent.status = 'stopped';
        agent.stoppedAt = new Date().toISOString();
        agent.shutdownReason = 'graceful';
      });

      await fs.writeJson('.agentic-qe/data/registry.json', registry, { spaces: 2 });
    }

    console.log(chalk.gray('  All agents stopped gracefully'));
  }

  private static async forceShutdown(): Promise<void> {
    console.log(chalk.yellow('⚠️  Force shutdown initiated...'));

    // Load registry
    if (await fs.pathExists('.agentic-qe/data/registry.json')) {
      const registry = await fs.readJson('.agentic-qe/data/registry.json');

      // Immediately stop all agents
      registry.agents?.forEach((agent: any) => {
        agent.status = 'stopped';
        agent.stoppedAt = new Date().toISOString();
        agent.shutdownReason = 'force';
      });

      // Cancel all tasks
      registry.tasks?.forEach((task: any) => {
        if (task.status !== 'completed' && task.status !== 'failed') {
          task.status = 'cancelled';
          task.cancelledAt = new Date().toISOString();
          task.reason = 'force_shutdown';
        }
      });

      await fs.writeJson('.agentic-qe/data/registry.json', registry, { spaces: 2 });
    }

    console.log(chalk.gray('  All agents force stopped'));
  }

  private static async standardShutdown(): Promise<void> {
    console.log(chalk.blue('🛑 Standard shutdown initiated...'));

    // Load registry
    if (await fs.pathExists('.agentic-qe/data/registry.json')) {
      const registry = await fs.readJson('.agentic-qe/data/registry.json');

      // Give tasks brief time to complete
      const runningTasks = registry.tasks?.filter((t: any) => t.status === 'running') || [];
      if (runningTasks.length > 0) {
        console.log(chalk.yellow(`  Allowing ${runningTasks.length} tasks brief time to complete...`));
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // Stop agents
      registry.agents?.forEach((agent: any) => {
        agent.status = 'stopped';
        agent.stoppedAt = new Date().toISOString();
        agent.shutdownReason = 'standard';
      });

      await fs.writeJson('.agentic-qe/data/registry.json', registry, { spaces: 2 });
    }

    console.log(chalk.gray('  All agents stopped'));
  }

  private static async preserveState(fleetConfig: any): Promise<void> {
    console.log(chalk.blue('💾 Preserving fleet state...'));

    const stateDir = '.agentic-qe/state';
    await fs.ensureDir(stateDir);

    // Save state snapshot
    const state = {
      fleetConfig,
      preservedAt: new Date().toISOString(),
      canRestore: true
    };

    // Copy critical files to state directory
    const filesToPreserve = [
      '.agentic-qe/config/fleet.json',
      '.agentic-qe/config/agents.json',
      '.agentic-qe/data/registry.json'
    ];

    for (const file of filesToPreserve) {
      if (await fs.pathExists(file)) {
        const fileName = file.split('/').pop();
        await fs.copy(file, `${stateDir}/${fileName}`, { overwrite: true });
      }
    }

    await fs.writeJson(`${stateDir}/state.json`, state, { spaces: 2 });

    console.log(chalk.gray('  State preserved - can be restored with: aqe fleet restart --restore'));
  }

  private static async cleanupRuntimeData(): Promise<void> {
    console.log(chalk.blue('🧹 Cleaning up runtime data...'));

    // Clear temporary and cache directories
    const cleanupDirs = [
      '.agentic-qe/tmp',
      '.agentic-qe/cache',
      '.agentic-qe/locks'
    ];

    for (const dir of cleanupDirs) {
      if (await fs.pathExists(dir)) {
        await fs.remove(dir);
      }
    }

    // Clear active execution data
    if (await fs.pathExists('.agentic-qe/data/registry.json')) {
      const registry = await fs.readJson('.agentic-qe/data/registry.json');

      // Keep only historical data
      registry.agents = [];
      registry.tasks = registry.tasks?.filter((t: any) => t.status === 'completed' || t.status === 'failed') || [];

      await fs.writeJson('.agentic-qe/data/registry.json', registry, { spaces: 2 });
    }

    console.log(chalk.gray('  Runtime data cleaned'));
  }

  private static async generateShutdownReport(fleetConfig: any, options: FleetShutdownOptions): Promise<void> {
    const reportsDir = '.agentic-qe/reports';
    await fs.ensureDir(reportsDir);

    // Load registry for stats
    let registry = { agents: [], tasks: [] };
    if (await fs.pathExists('.agentic-qe/data/registry.json')) {
      registry = await fs.readJson('.agentic-qe/data/registry.json');
    }

    const report = {
      fleetId: fleetConfig.id,
      topology: fleetConfig.topology,
      maxAgents: fleetConfig.maxAgents,
      shutdownMode: options.force ? 'force' : options.graceful ? 'graceful' : 'standard',
      shutdownAt: new Date().toISOString(),
      archived: options.archive || false,
      statePreserved: options.preserve || false,
      statistics: {
        totalAgents: registry.agents.length,
        stoppedAgents: registry.agents.filter((a: any) => a.status === 'stopped').length,
        totalTasks: registry.tasks.length,
        completedTasks: registry.tasks.filter((t: any) => t.status === 'completed').length,
        cancelledTasks: registry.tasks.filter((t: any) => t.status === 'cancelled').length
      }
    };

    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const reportFile = `${reportsDir}/shutdown-${timestamp}.json`;
    await fs.writeJson(reportFile, report, { spaces: 2 });

    console.log(chalk.blue('\n📊 Shutdown Summary:'));
    console.log(chalk.gray(`  Fleet ID: ${report.fleetId}`));
    console.log(chalk.gray(`  Mode: ${report.shutdownMode}`));
    console.log(chalk.gray(`  Agents Stopped: ${report.statistics.stoppedAgents}/${report.statistics.totalAgents}`));
    console.log(chalk.gray(`  Tasks Completed: ${report.statistics.completedTasks}/${report.statistics.totalTasks}`));
    if (report.statistics.cancelledTasks > 0) {
      console.log(chalk.yellow(`  Tasks Cancelled: ${report.statistics.cancelledTasks}`));
    }
    console.log(chalk.gray(`  Report: ${reportFile}`));
  }

  private static async storeShutdownOperation(options: FleetShutdownOptions): Promise<void> {
    try {
      const { execSync } = require('child_process');
      const data = JSON.stringify({
        mode: options.force ? 'force' : options.graceful ? 'graceful' : 'standard',
        archived: options.archive || false,
        preserved: options.preserve || false,
        timestamp: new Date().toISOString()
      });
      const command = `npx claude-flow@alpha memory store --key "aqe/swarm/fleet-cli-commands/shutdown" --value '${data}'`;
      execSync(command, { stdio: 'ignore', timeout: 5000 });
    } catch (error) {
      // Silently handle coordination errors
    }
  }
}
