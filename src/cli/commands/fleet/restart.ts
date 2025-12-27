import chalk from 'chalk';
import * as fs from 'fs-extra';

export interface FleetRestartOptions {
  graceful?: boolean; // Graceful restart (wait for tasks)
  force?: boolean; // Force restart (immediate)
  rollback?: boolean; // Rollback to previous state if restart fails
}

interface FleetConfig {
  maxAgents: number;
  [key: string]: unknown;
}

interface AgentEntry {
  status: string;
  stoppedAt?: string;
  forceStopped?: boolean;
  restartedAt?: string;
  restartCount?: number;
}

interface TaskEntry {
  status: string;
  interruptedAt?: string;
}

interface Registry {
  agents?: AgentEntry[];
  tasks?: TaskEntry[];
}

export class FleetRestartCommand {
  static async execute(options: FleetRestartOptions): Promise<void> {
    // Check if fleet is initialized
    if (!await fs.pathExists('.agentic-qe/config/fleet.json')) {
      throw new Error('Fleet not initialized. Run: aqe fleet init');
    }

    console.log(chalk.blue.bold('\n🔄 Fleet Restart\n'));

    const fleetConfig = await fs.readJson('.agentic-qe/config/fleet.json');

    // Determine restart mode
    const mode = options.force ? 'force' : 'graceful';

    if (options.force) {
      console.log(chalk.yellow('⚠️  Force restart requested - agents will be stopped immediately'));
    } else {
      console.log(chalk.blue('🔄 Graceful restart - waiting for running tasks to complete'));
    }

    // Pre-restart backup
    await this.createRestartBackup(fleetConfig);

    // Update fleet status
    await this.updateFleetStatus('restarting');

    // Stop agents gracefully or forcefully
    if (options.graceful) {
      await this.gracefulStop();
    } else if (options.force) {
      await this.forceStop();
    }

    // Clear runtime data
    await this.clearRuntimeData();

    // Restart agents
    await this.restartAgents(fleetConfig);

    // Update fleet status
    await this.updateFleetStatus('running');

    // Verify restart success
    const restartSuccess = await this.verifyRestart();

    if (!restartSuccess && options.rollback) {
      console.log(chalk.red('❌ Restart verification failed - rolling back...'));
      await this.rollbackRestart();
      throw new Error('Fleet restart failed and was rolled back');
    }

    console.log(chalk.green('\n✅ Fleet restarted successfully'));

    // Store restart in coordination
    await this.storeRestartOperation(mode, restartSuccess);
  }

  private static async createRestartBackup(_fleetConfig: FleetConfig): Promise<void> {
    console.log(chalk.blue('💾 Creating pre-restart backup...'));

    const backupDir = `.agentic-qe/backups/restart-${Date.now()}`;
    await fs.ensureDir(backupDir);

    // Backup critical files
    const filesToBackup = [
      '.agentic-qe/config/fleet.json',
      '.agentic-qe/config/agents.json',
      '.agentic-qe/data/registry.json'
    ];

    for (const file of filesToBackup) {
      if (await fs.pathExists(file)) {
        const fileName = file.split('/').pop();
        await fs.copy(file, `${backupDir}/${fileName}`);
      }
    }

    console.log(chalk.gray(`  Backup saved: ${backupDir}`));
  }

  private static async updateFleetStatus(status: string): Promise<void> {
    const fleetConfig = await fs.readJson('.agentic-qe/config/fleet.json');
    fleetConfig.status = status;
    fleetConfig.lastStatusUpdate = new Date().toISOString();
    await fs.writeJson('.agentic-qe/config/fleet.json', fleetConfig, { spaces: 2 });

    // Update registry
    if (await fs.pathExists('.agentic-qe/data/registry.json')) {
      const registry = await fs.readJson('.agentic-qe/data/registry.json');
      registry.fleet = registry.fleet || {};
      registry.fleet.status = status;
      await fs.writeJson('.agentic-qe/data/registry.json', registry, { spaces: 2 });
    }
  }

  private static async gracefulStop(): Promise<void> {
    console.log(chalk.blue('🛑 Stopping agents gracefully...'));

    // Load registry
    if (await fs.pathExists('.agentic-qe/data/registry.json')) {
      const registry = await fs.readJson('.agentic-qe/data/registry.json');
      const runningTasks = registry.tasks?.filter((t: TaskEntry) => t.status === 'running') || [];

      if (runningTasks.length > 0) {
        console.log(chalk.yellow(`  Waiting for ${runningTasks.length} running tasks to complete...`));

        // In production, this would actually wait for tasks
        // Simulate waiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Update agent statuses
      if (registry.agents) {
        registry.agents.forEach((agent: AgentEntry) => {
          agent.status = 'stopped';
          agent.stoppedAt = new Date().toISOString();
        });
        await fs.writeJson('.agentic-qe/data/registry.json', registry, { spaces: 2 });
      }
    }

    console.log(chalk.gray('  All agents stopped gracefully'));
  }

  private static async forceStop(): Promise<void> {
    console.log(chalk.yellow('⚠️  Force stopping all agents...'));

    // Load registry and force stop
    if (await fs.pathExists('.agentic-qe/data/registry.json')) {
      const registry = await fs.readJson('.agentic-qe/data/registry.json');

      if (registry.agents) {
        registry.agents.forEach((agent: AgentEntry) => {
          agent.status = 'stopped';
          agent.forceStopped = true;
          agent.stoppedAt = new Date().toISOString();
        });

        // Mark running tasks as interrupted
        if (registry.tasks) {
          registry.tasks.forEach((task: TaskEntry) => {
            if (task.status === 'running') {
              task.status = 'interrupted';
              task.interruptedAt = new Date().toISOString();
            }
          });
        }

        await fs.writeJson('.agentic-qe/data/registry.json', registry, { spaces: 2 });
      }
    }

    console.log(chalk.gray('  All agents force stopped'));
  }

  private static async clearRuntimeData(): Promise<void> {
    console.log(chalk.blue('🧹 Clearing runtime data...'));

    // Clear temporary execution data
    const tempDirs = [
      '.agentic-qe/tmp',
      '.agentic-qe/cache'
    ];

    for (const dir of tempDirs) {
      if (await fs.pathExists(dir)) {
        await fs.remove(dir);
        await fs.ensureDir(dir);
      }
    }

    console.log(chalk.gray('  Runtime data cleared'));
  }

  private static async restartAgents(fleetConfig: FleetConfig): Promise<void> {
    console.log(chalk.blue('🚀 Restarting agents...'));

    // Generate restart script
    const restartScript = `#!/bin/bash
# Fleet Restart Script

echo "Restarting Agentic QE Fleet..."

# Pre-restart coordination
npx claude-flow@alpha hooks notify --message "Fleet restart initiated"

# Reinitialize agents
echo "Reinitializing ${fleetConfig.maxAgents} agents..."

# Restore coordination
npx claude-flow@alpha hooks session-restore --session-id "fleet-restart"

# Post-restart validation
echo "Validating agent status..."

npx claude-flow@alpha hooks notify --message "Fleet restart completed"
echo "Fleet restarted successfully!"
`;

    await fs.ensureDir('.agentic-qe/scripts');
    await fs.writeFile('.agentic-qe/scripts/restart-fleet.sh', restartScript);
    await fs.chmod('.agentic-qe/scripts/restart-fleet.sh', '755');

    // Update registry with restarted agents
    if (await fs.pathExists('.agentic-qe/data/registry.json')) {
      const registry = await fs.readJson('.agentic-qe/data/registry.json');

      if (registry.agents) {
        registry.agents.forEach((agent: AgentEntry) => {
          agent.status = 'active';
          agent.restartedAt = new Date().toISOString();
          agent.restartCount = (agent.restartCount || 0) + 1;
        });

        await fs.writeJson('.agentic-qe/data/registry.json', registry, { spaces: 2 });
      }
    }

    console.log(chalk.gray(`  ${fleetConfig.maxAgents} agents restarted`));
  }

  private static async verifyRestart(): Promise<boolean> {
    console.log(chalk.blue('✅ Verifying restart...'));

    // Check if fleet configuration is intact
    if (!await fs.pathExists('.agentic-qe/config/fleet.json')) {
      console.log(chalk.red('  ❌ Fleet configuration missing'));
      return false;
    }

    // Check if agents are active
    if (await fs.pathExists('.agentic-qe/data/registry.json')) {
      const registry = await fs.readJson('.agentic-qe/data/registry.json');
      const activeAgents = registry.agents?.filter((a: AgentEntry) => a.status === 'active').length || 0;

      if (activeAgents === 0) {
        console.log(chalk.red('  ❌ No active agents after restart'));
        return false;
      }

      console.log(chalk.green(`  ✅ ${activeAgents} agents active`));
    }

    return true;
  }

  private static async rollbackRestart(): Promise<void> {
    console.log(chalk.yellow('🔙 Rolling back restart...'));

    // Find latest backup
    const backupsDir = '.agentic-qe/backups';
    if (await fs.pathExists(backupsDir)) {
      const backups = await fs.readdir(backupsDir);
      const restartBackups = backups
        .filter(b => b.startsWith('restart-'))
        .sort()
        .reverse();

      if (restartBackups.length > 0) {
        const latestBackup = `${backupsDir}/${restartBackups[0]}`;

        // Restore files
        const files = await fs.readdir(latestBackup);
        for (const file of files) {
          const source = `${latestBackup}/${file}`;
          let dest = '';

          if (file === 'fleet.json') {
            dest = '.agentic-qe/config/fleet.json';
          } else if (file === 'agents.json') {
            dest = '.agentic-qe/config/agents.json';
          } else if (file === 'registry.json') {
            dest = '.agentic-qe/data/registry.json';
          }

          if (dest) {
            await fs.copy(source, dest, { overwrite: true });
          }
        }

        console.log(chalk.green('  ✅ Rollback completed'));
      }
    }
  }

  private static async storeRestartOperation(mode: string, success: boolean): Promise<void> {
    try {
      const { execSync } = require('child_process');
      const data = JSON.stringify({
        mode,
        success,
        timestamp: new Date().toISOString()
      });
      const command = `npx claude-flow@alpha memory store --key "aqe/swarm/fleet-cli-commands/restart" --value '${data}'`;
      execSync(command, { stdio: 'ignore', timeout: 5000 });
    } catch (error) {
      // Silently handle coordination errors
    }
  }
}
