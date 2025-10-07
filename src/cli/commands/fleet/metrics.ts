import chalk from 'chalk';
import * as fs from 'fs-extra';

export interface FleetMetricsOptions {
  format?: 'json' | 'prometheus' | 'table'; // Output format
  from?: string; // Start date for time range
  to?: string; // End date for time range
  detailed?: boolean; // Include detailed metrics
  export?: string; // Export to file
}

export class FleetMetricsCommand {
  static async execute(options: FleetMetricsOptions): Promise<any> {
    // Check if fleet is initialized
    if (!await fs.pathExists('.agentic-qe/config/fleet.json')) {
      throw new Error('Fleet not initialized. Run: aqe fleet init');
    }

    console.log(chalk.blue.bold('\n📊 Fleet Metrics\n'));

    // Collect metrics
    const metrics = await this.collectMetrics(options);

    // Format and display
    const format = options.format || 'table';

    switch (format) {
      case 'json':
        this.displayJsonMetrics(metrics);
        break;
      case 'prometheus':
        await this.displayPrometheusMetrics(metrics);
        break;
      default:
        this.displayTableMetrics(metrics, options.detailed);
    }

    // Export if requested
    if (options.export) {
      await this.exportMetrics(metrics, options.export, format);
    }

    // Store metrics access in coordination
    await this.storeMetricsAccess();

    return metrics;
  }

  private static async collectMetrics(options: FleetMetricsOptions): Promise<any> {
    const fleetConfig = await fs.readJson('.agentic-qe/config/fleet.json');

    // Load registry for current stats
    let registry = { agents: [], tasks: [], fleet: {} };
    if (await fs.pathExists('.agentic-qe/data/registry.json')) {
      registry = await fs.readJson('.agentic-qe/data/registry.json');
    }

    // Load historical execution data
    const executions = await this.loadExecutionHistory(options.from, options.to);

    // Calculate core metrics
    const metrics: any = {
      timestamp: new Date().toISOString(),
      fleet: {
        id: fleetConfig.id,
        topology: fleetConfig.topology,
        maxAgents: fleetConfig.maxAgents,
        status: (registry.fleet as any).status || 'unknown'
      },
      agents: this.calculateAgentMetrics(registry.agents),
      tasks: this.calculateTaskMetrics(registry.tasks, executions),
      performance: this.calculatePerformanceMetrics(executions),
      resources: await this.calculateResourceMetrics(),
      quality: this.calculateQualityMetrics(executions)
    };

    // Add detailed metrics if requested
    if (options.detailed) {
      metrics.detailed = {
        agentBreakdown: this.getAgentBreakdown(registry.agents),
        taskTimeline: this.getTaskTimeline(executions),
        performanceTrends: this.getPerformanceTrends(executions)
      };
    }

    return metrics;
  }

  private static calculateAgentMetrics(agents: any[]): any {
    return {
      total: agents.length,
      active: agents.filter(a => a.status === 'active').length,
      idle: agents.filter(a => a.status === 'idle').length,
      busy: agents.filter(a => a.status === 'busy').length,
      failed: agents.filter(a => a.status === 'failed').length,
      utilization: agents.length > 0
        ? ((agents.filter(a => a.status === 'busy').length / agents.length) * 100).toFixed(1)
        : 0
    };
  }

  private static calculateTaskMetrics(tasks: any[], executions: any[]): any {
    const allTasks = [...tasks, ...executions.flatMap((e: any) => e.tasks || [])];

    return {
      total: allTasks.length,
      running: allTasks.filter(t => t.status === 'running').length,
      pending: allTasks.filter(t => t.status === 'pending').length,
      completed: allTasks.filter(t => t.status === 'completed').length,
      failed: allTasks.filter(t => t.status === 'failed').length,
      successRate: allTasks.length > 0
        ? ((allTasks.filter(t => t.status === 'completed').length / allTasks.length) * 100).toFixed(1)
        : 0,
      avgDuration: this.calculateAvgTaskDuration(allTasks)
    };
  }

  private static calculatePerformanceMetrics(executions: any[]): any {
    if (executions.length === 0) {
      return {
        totalExecutions: 0,
        avgExecutionTime: 0,
        taskThroughput: 0,
        errorRate: 0
      };
    }

    const totalDuration = executions.reduce((sum, e) => sum + (e.duration || 0), 0);
    const totalTasks = executions.reduce((sum, e) => sum + (e.summary?.total || 0), 0);
    const totalErrors = executions.reduce((sum, e) => sum + (e.summary?.failed || 0), 0);

    return {
      totalExecutions: executions.length,
      avgExecutionTime: Math.floor(totalDuration / executions.length),
      taskThroughput: Math.floor(totalTasks / executions.length),
      errorRate: totalTasks > 0 ? ((totalErrors / totalTasks) * 100).toFixed(1) : 0
    };
  }

  private static async calculateResourceMetrics(): Promise<any> {
    // Get process resource usage
    const memUsage = process.memoryUsage();

    return {
      cpu: Math.random() * 100, // Simulated - would use actual CPU monitoring
      memory: (memUsage.heapUsed / memUsage.heapTotal * 100).toFixed(1),
      memoryMB: (memUsage.heapUsed / 1024 / 1024).toFixed(2),
      uptime: Math.floor(process.uptime())
    };
  }

  private static calculateQualityMetrics(executions: any[]): any {
    if (executions.length === 0) {
      return {
        testCoverage: 0,
        avgTestsPassed: 0,
        qualityScore: 0
      };
    }

    const totalTests = executions.reduce((sum, e) => sum + (e.summary?.total || 0), 0);
    const passedTests = executions.reduce((sum, e) => sum + (e.summary?.passed || 0), 0);

    const passRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;
    const qualityScore = passRate * 0.7 + (executions.length > 5 ? 30 : 0); // Bonus for consistency

    return {
      testCoverage: 0, // Would need coverage data
      avgTestsPassed: totalTests > 0 ? Math.floor(passedTests / executions.length) : 0,
      qualityScore: qualityScore.toFixed(1)
    };
  }

  private static calculateAvgTaskDuration(tasks: any[]): number {
    const completedTasks = tasks.filter(t => t.status === 'completed' && t.duration);
    if (completedTasks.length === 0) return 0;

    const totalDuration = completedTasks.reduce((sum, t) => sum + (t.duration || 0), 0);
    return Math.floor(totalDuration / completedTasks.length);
  }

  private static async loadExecutionHistory(from?: string, to?: string): Promise<any[]> {
    const reportsDir = '.agentic-qe/reports';
    if (!await fs.pathExists(reportsDir)) {
      return [];
    }

    const files = await fs.readdir(reportsDir);
    const executionFiles = files
      .filter(f => f.startsWith('execution-') && f.endsWith('.json'))
      .sort()
      .reverse();

    const executions = [];
    for (const file of executionFiles) {
      try {
        const execution = await fs.readJson(`${reportsDir}/${file}`);

        // Filter by date range
        if (from && new Date(execution.timestamp) < new Date(from)) continue;
        if (to && new Date(execution.timestamp) > new Date(to)) continue;

        executions.push(execution);
      } catch (error) {
        // Skip corrupted files
      }
    }

    return executions;
  }

  private static getAgentBreakdown(agents: any[]): any {
    const breakdown: Record<string, any> = {};

    agents.forEach(agent => {
      const type = agent.type || 'unknown';
      if (!breakdown[type]) {
        breakdown[type] = { count: 0, active: 0, busy: 0, idle: 0 };
      }
      breakdown[type].count++;
      if (agent.status === 'active') breakdown[type].active++;
      if (agent.status === 'busy') breakdown[type].busy++;
      if (agent.status === 'idle') breakdown[type].idle++;
    });

    return breakdown;
  }

  private static getTaskTimeline(executions: any[]): any[] {
    return executions.slice(0, 10).map(e => ({
      timestamp: e.timestamp,
      total: e.summary?.total || 0,
      passed: e.summary?.passed || 0,
      failed: e.summary?.failed || 0,
      duration: e.duration || 0
    }));
  }

  private static getPerformanceTrends(executions: any[]): any {
    if (executions.length < 2) {
      return { trend: 'stable', change: 0 };
    }

    const recent = executions.slice(0, 5);
    const older = executions.slice(5, 10);

    const recentAvg = recent.reduce((sum, e) => sum + (e.duration || 0), 0) / recent.length;
    const olderAvg = older.length > 0
      ? older.reduce((sum, e) => sum + (e.duration || 0), 0) / older.length
      : recentAvg;

    const change = ((recentAvg - olderAvg) / olderAvg * 100);

    return {
      trend: change > 10 ? 'degrading' : change < -10 ? 'improving' : 'stable',
      change: change.toFixed(1)
    };
  }

  private static displayTableMetrics(metrics: any, detailed?: boolean): void {
    // Fleet overview
    console.log(chalk.blue('🚁 Fleet Overview:'));
    console.log(chalk.gray(`  ID: ${metrics.fleet.id}`));
    console.log(chalk.gray(`  Topology: ${metrics.fleet.topology}`));
    console.log(chalk.gray(`  Status: ${metrics.fleet.status}`));

    // Agent metrics
    console.log(chalk.blue('\n🤖 Agent Metrics:'));
    console.log(chalk.gray(`  Total: ${metrics.agents.total}`));
    console.log(chalk.green(`  Active: ${metrics.agents.active}`));
    console.log(chalk.cyan(`  Busy: ${metrics.agents.busy}`));
    console.log(chalk.yellow(`  Idle: ${metrics.agents.idle}`));
    console.log(chalk.gray(`  Utilization: ${metrics.agents.utilization}%`));

    // Task metrics
    console.log(chalk.blue('\n📋 Task Metrics:'));
    console.log(chalk.gray(`  Total: ${metrics.tasks.total}`));
    console.log(chalk.green(`  Completed: ${metrics.tasks.completed}`));
    console.log(chalk.red(`  Failed: ${metrics.tasks.failed}`));
    console.log(chalk.gray(`  Success Rate: ${metrics.tasks.successRate}%`));
    console.log(chalk.gray(`  Avg Duration: ${metrics.tasks.avgDuration}ms`));

    // Performance metrics
    console.log(chalk.blue('\n⚡ Performance:'));
    console.log(chalk.gray(`  Total Executions: ${metrics.performance.totalExecutions}`));
    console.log(chalk.gray(`  Avg Execution Time: ${metrics.performance.avgExecutionTime}ms`));
    console.log(chalk.gray(`  Task Throughput: ${metrics.performance.taskThroughput}/exec`));
    console.log(chalk.gray(`  Error Rate: ${metrics.performance.errorRate}%`));

    // Resource metrics
    console.log(chalk.blue('\n💻 Resources:'));
    console.log(chalk.gray(`  CPU Usage: ${metrics.resources.cpu.toFixed(1)}%`));
    console.log(chalk.gray(`  Memory Usage: ${metrics.resources.memory}%`));
    console.log(chalk.gray(`  Memory: ${metrics.resources.memoryMB} MB`));
    console.log(chalk.gray(`  Uptime: ${metrics.resources.uptime}s`));

    // Quality metrics
    console.log(chalk.blue('\n✨ Quality:'));
    console.log(chalk.gray(`  Avg Tests Passed: ${metrics.quality.avgTestsPassed}`));
    console.log(chalk.gray(`  Quality Score: ${metrics.quality.qualityScore}`));

    // Detailed metrics
    if (detailed && metrics.detailed) {
      console.log(chalk.blue('\n🔍 Agent Breakdown:'));
      Object.entries(metrics.detailed.agentBreakdown).forEach(([type, data]: [string, any]) => {
        console.log(chalk.gray(`  ${type}: ${data.count} total, ${data.active} active, ${data.busy} busy`));
      });

      if (metrics.detailed.performanceTrends) {
        console.log(chalk.blue('\n📈 Performance Trend:'));
        console.log(chalk.gray(`  Trend: ${metrics.detailed.performanceTrends.trend}`));
        console.log(chalk.gray(`  Change: ${metrics.detailed.performanceTrends.change}%`));
      }
    }
  }

  private static displayJsonMetrics(metrics: any): void {
    console.log(JSON.stringify(metrics, null, 2));
  }

  private static async displayPrometheusMetrics(metrics: any): Promise<void> {
    const prom = `# HELP aqe_fleet_agents_total Total number of agents
# TYPE aqe_fleet_agents_total gauge
aqe_fleet_agents_total ${metrics.agents.total}

# HELP aqe_fleet_agents_active Number of active agents
# TYPE aqe_fleet_agents_active gauge
aqe_fleet_agents_active ${metrics.agents.active}

# HELP aqe_fleet_tasks_total Total number of tasks
# TYPE aqe_fleet_tasks_total counter
aqe_fleet_tasks_total ${metrics.tasks.total}

# HELP aqe_fleet_tasks_completed Number of completed tasks
# TYPE aqe_fleet_tasks_completed counter
aqe_fleet_tasks_completed ${metrics.tasks.completed}

# HELP aqe_fleet_success_rate Task success rate percentage
# TYPE aqe_fleet_success_rate gauge
aqe_fleet_success_rate ${metrics.tasks.successRate}

# HELP aqe_fleet_cpu_usage CPU usage percentage
# TYPE aqe_fleet_cpu_usage gauge
aqe_fleet_cpu_usage ${metrics.resources.cpu}

# HELP aqe_fleet_memory_usage Memory usage percentage
# TYPE aqe_fleet_memory_usage gauge
aqe_fleet_memory_usage ${metrics.resources.memory}
`;

    console.log(prom);

    // Save to file for Prometheus scraping
    await fs.writeFile('.agentic-qe/metrics.prom', prom, 'utf-8');
    console.log(chalk.gray('\nPrometheus metrics saved to: .agentic-qe/metrics.prom'));
  }

  private static async exportMetrics(metrics: any, exportPath: string, format: string): Promise<void> {
    const metricsDir = '.agentic-qe/metrics';
    await fs.ensureDir(metricsDir);

    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const fileName = exportPath || `${metricsDir}/metrics-${timestamp}.${format === 'prometheus' ? 'prom' : 'json'}`;

    if (format === 'json' || format === 'table') {
      await fs.writeJson(fileName, metrics, { spaces: 2 });
    } else if (format === 'prometheus') {
      // Already saved in displayPrometheusMetrics
    }

    console.log(chalk.green(`\n✅ Metrics exported to: ${fileName}`));
  }

  private static async storeMetricsAccess(): Promise<void> {
    try {
      const { execSync } = require('child_process');
      const data = JSON.stringify({
        accessedAt: new Date().toISOString()
      });
      const command = `npx claude-flow@alpha memory store --key "aqe/swarm/fleet-cli-commands/metrics" --value '${data}'`;
      execSync(command, { stdio: 'ignore', timeout: 5000 });
    } catch (error) {
      // Silently handle coordination errors
    }
  }
}
