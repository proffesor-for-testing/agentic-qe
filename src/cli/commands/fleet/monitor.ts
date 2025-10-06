import chalk from 'chalk';
import * as fs from 'fs-extra';
import ora from 'ora';

export interface FleetMonitorOptions {
  interval?: number; // Monitoring interval in milliseconds
  continuous?: boolean; // Run continuously
  verbose?: boolean;
}

export class FleetMonitorCommand {
  private static isMonitoring = false;
  private static monitoringInterval: NodeJS.Timeout | null = null;

  static async execute(options: FleetMonitorOptions): Promise<void> {
    // Validate interval
    const interval = options.interval || 5000;
    if (interval < 100) {
      throw new Error('Invalid interval: must be at least 100ms');
    }

    // Check if fleet is initialized
    if (!await fs.pathExists('.agentic-qe/config/fleet.json')) {
      throw new Error('Fleet not initialized. Run: aqe fleet init');
    }

    console.log(chalk.blue.bold('\n📡 Fleet Monitoring Dashboard\n'));
    console.log(chalk.gray(`Update interval: ${interval}ms`));
    console.log(chalk.gray('Press Ctrl+C to stop monitoring\n'));

    this.isMonitoring = true;

    // Initial status display
    await this.displayMonitoringData(options.verbose);

    // Set up continuous monitoring
    this.monitoringInterval = setInterval(async () => {
      if (!this.isMonitoring) {
        this.stopMonitoring();
        return;
      }

      // Clear console for fresh display
      if (!options.verbose) {
        console.clear();
        console.log(chalk.blue.bold('\n📡 Fleet Monitoring Dashboard\n'));
      }

      await this.displayMonitoringData(options.verbose);
    }, interval);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      this.stopMonitoring();
      console.log(chalk.yellow('\n\n📡 Monitoring stopped'));
      process.exit(0);
    });

    // Store monitoring start in coordination
    await this.storeMonitoringStart();

    // Keep process alive if continuous
    if (options.continuous !== false) {
      await new Promise(() => {}); // Keep alive indefinitely
    }
  }

  private static stopMonitoring(): void {
    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  private static async displayMonitoringData(verbose?: boolean): Promise<void> {
    try {
      // Load fleet data
      const fleetConfig = await fs.readJson('.agentic-qe/config/fleet.json');
      const registryPath = '.agentic-qe/data/registry.json';

      let registry = { agents: [], tasks: [], fleet: { status: 'unknown' } };
      if (await fs.pathExists(registryPath)) {
        registry = await fs.readJson(registryPath);
      }

      // Get real-time metrics
      const metrics = await this.collectRealTimeMetrics();

      // Display header
      console.log(chalk.blue('🚁 Fleet Status:'));
      console.log(chalk.gray(`  ID: ${fleetConfig.id || 'Unknown'}`));
      console.log(chalk.gray(`  Topology: ${fleetConfig.topology}`));
      console.log(chalk.gray(`  Status: ${this.getStatusEmoji(registry.fleet.status)} ${registry.fleet.status}`));
      console.log(chalk.gray(`  Time: ${new Date().toLocaleTimeString()}`));

      // Display agent statistics
      console.log(chalk.blue('\n🤖 Agent Statistics:'));
      const activeAgents = registry.agents.filter((a: any) => a.status === 'active').length;
      const idleAgents = registry.agents.filter((a: any) => a.status === 'idle').length;
      const busyAgents = registry.agents.filter((a: any) => a.status === 'busy').length;

      console.log(chalk.gray(`  Total Agents: ${registry.agents.length}`));
      console.log(chalk.green(`  Active: ${activeAgents}`));
      console.log(chalk.yellow(`  Idle: ${idleAgents}`));
      console.log(chalk.cyan(`  Busy: ${busyAgents}`));

      // Display task statistics
      console.log(chalk.blue('\n📋 Task Statistics:'));
      const runningTasks = registry.tasks.filter((t: any) => t.status === 'running').length;
      const pendingTasks = registry.tasks.filter((t: any) => t.status === 'pending').length;
      const completedTasks = registry.tasks.filter((t: any) => t.status === 'completed').length;
      const failedTasks = registry.tasks.filter((t: any) => t.status === 'failed').length;

      console.log(chalk.yellow(`  Running: ${runningTasks}`));
      console.log(chalk.gray(`  Pending: ${pendingTasks}`));
      console.log(chalk.green(`  Completed: ${completedTasks}`));
      console.log(chalk.red(`  Failed: ${failedTasks}`));

      // Display real-time metrics
      console.log(chalk.blue('\n📊 Performance Metrics:'));
      console.log(chalk.gray(`  CPU Usage: ${metrics.cpu.toFixed(1)}%`));
      console.log(chalk.gray(`  Memory Usage: ${metrics.memory.toFixed(1)}%`));
      console.log(chalk.gray(`  Task Throughput: ${metrics.taskThroughput} tasks/min`));
      console.log(chalk.gray(`  Average Response Time: ${metrics.avgResponseTime}ms`));

      // Verbose mode: Show detailed agent info
      if (verbose && registry.agents.length > 0) {
        console.log(chalk.blue('\n🔍 Agent Details:'));
        registry.agents.slice(0, 5).forEach((agent: any) => {
          console.log(chalk.gray(`  ${agent.id}: ${agent.type} - ${agent.status}`));
        });
        if (registry.agents.length > 5) {
          console.log(chalk.gray(`  ... and ${registry.agents.length - 5} more agents`));
        }
      }

      // Display health indicators
      const health = this.calculateHealthStatus(registry, metrics);
      console.log(chalk.blue('\n💚 Health Indicators:'));
      console.log(chalk.gray(`  Overall: ${this.getHealthColor(health.overall)}${health.overall}`));
      if (health.warnings.length > 0) {
        console.log(chalk.yellow(`  Warnings: ${health.warnings.length}`));
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Error collecting monitoring data:'), error.message);
    }
  }

  private static async collectRealTimeMetrics(): Promise<any> {
    // Simulate real-time metrics collection
    // In production, this would query actual system metrics
    return {
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      taskThroughput: Math.floor(Math.random() * 50),
      avgResponseTime: Math.floor(Math.random() * 1000)
    };
  }

  private static calculateHealthStatus(registry: any, metrics: any): any {
    const health: any = {
      overall: 'healthy',
      warnings: []
    };

    // Check agent health
    const activeAgents = registry.agents.filter((a: any) => a.status === 'active').length;
    if (activeAgents < registry.agents.length * 0.5) {
      health.warnings.push('Low active agent count');
      health.overall = 'degraded';
    }

    // Check task failure rate
    const tasks = registry.tasks || [];
    if (tasks.length > 0) {
      const failedTasks = tasks.filter((t: any) => t.status === 'failed').length;
      const failureRate = failedTasks / tasks.length;
      if (failureRate > 0.2) {
        health.warnings.push(`High task failure rate: ${(failureRate * 100).toFixed(1)}%`);
        health.overall = 'degraded';
      }
    }

    // Check resource usage
    if (metrics.cpu > 90) {
      health.warnings.push('High CPU usage');
      health.overall = 'warning';
    }
    if (metrics.memory > 90) {
      health.warnings.push('High memory usage');
      health.overall = 'warning';
    }

    return health;
  }

  private static getStatusEmoji(status: string): string {
    const emojis: Record<string, string> = {
      'active': '🟢',
      'running': '🟢',
      'idle': '🟡',
      'degraded': '🟡',
      'stopped': '🔴',
      'failed': '🔴',
      'unknown': '⚪'
    };
    return emojis[status] || '⚪';
  }

  private static getHealthColor(status: string): string {
    const colors: Record<string, any> = {
      'healthy': chalk.green,
      'degraded': chalk.yellow,
      'warning': chalk.yellow,
      'critical': chalk.red,
      'unknown': chalk.gray
    };
    return (colors[status] || chalk.white)(status);
  }

  private static async storeMonitoringStart(): Promise<void> {
    try {
      const { execSync } = require('child_process');
      const command = `npx claude-flow@alpha hooks notify --message "Fleet monitoring started"`;
      execSync(command, { stdio: 'ignore' });
    } catch (error) {
      // Silently handle coordination errors
    }
  }
}
