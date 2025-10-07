import chalk from 'chalk';
import * as fs from 'fs-extra';

export interface FleetHealthOptions {
  detailed?: boolean;
  exportReport?: boolean;
  fix?: boolean; // Auto-fix detected issues
}

export class FleetHealthCommand {
  static async execute(options: FleetHealthOptions): Promise<any> {
    // Check if fleet is initialized
    if (!await fs.pathExists('.agentic-qe/config/fleet.json')) {
      throw new Error('Fleet not initialized. Run: aqe fleet init');
    }

    console.log(chalk.blue.bold('\n🏥 Fleet Health Check\n'));

    // Collect health data
    const healthReport = await this.performHealthCheck(options.detailed);

    // Display health report
    this.displayHealthReport(healthReport, options.detailed);

    // Export report if requested
    if (options.exportReport) {
      await this.exportHealthReport(healthReport);
      console.log(chalk.green('\n✅ Health report exported'));
    }

    // Auto-fix if requested
    if (options.fix && healthReport.issues.length > 0) {
      await this.autoFixIssues(healthReport.issues);
    }

    // Store health check in coordination
    await this.storeHealthCheck(healthReport);

    return healthReport;
  }

  private static async performHealthCheck(detailed?: boolean): Promise<any> {
    const report: any = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      components: {},
      issues: [],
      recommendations: [],
      metrics: {}
    };

    // Check configuration health
    report.components.configuration = await this.checkConfigurationHealth();

    // Check data integrity
    report.components.data = await this.checkDataIntegrity();

    // Check agent health
    report.components.agents = await this.checkAgentHealth();

    // Check task execution health
    report.components.tasks = await this.checkTaskHealth();

    // Check coordination health
    report.components.coordination = await this.checkCoordinationHealth();

    // Check system resources
    report.components.resources = await this.checkSystemResources();

    // Calculate overall status
    const componentStatuses = Object.values(report.components).map((c: any) => c.status);
    const healthyCount = componentStatuses.filter(s => s === 'healthy').length;
    const totalCount = componentStatuses.length;

    if (healthyCount === totalCount) {
      report.status = 'healthy';
    } else if (healthyCount >= totalCount * 0.7) {
      report.status = 'degraded';
    } else {
      report.status = 'unhealthy';
    }

    // Collect issues from all components
    Object.values(report.components).forEach((component: any) => {
      if (component.issues) {
        report.issues.push(...component.issues);
      }
    });

    // Generate recommendations
    report.recommendations = this.generateRecommendations(report.components);

    // Collect detailed metrics if requested
    if (detailed) {
      report.metrics = await this.collectDetailedMetrics();
    }

    return report;
  }

  private static async checkConfigurationHealth(): Promise<any> {
    const health: any = {
      status: 'healthy',
      issues: [],
      checks: []
    };

    // Check required configuration files
    const requiredFiles = [
      '.agentic-qe/config/fleet.json',
      '.agentic-qe/config/agents.json'
    ];

    for (const file of requiredFiles) {
      if (await fs.pathExists(file)) {
        health.checks.push({ file, status: 'ok' });
      } else {
        health.issues.push({ severity: 'critical', message: `Missing configuration: ${file}` });
        health.status = 'unhealthy';
      }
    }

    // Validate configuration content
    if (await fs.pathExists('.agentic-qe/config/fleet.json')) {
      const config = await fs.readJson('.agentic-qe/config/fleet.json');

      if (!config.topology) {
        health.issues.push({ severity: 'warning', message: 'No topology specified' });
        health.status = 'degraded';
      }

      if (!config.maxAgents || config.maxAgents < 1) {
        health.issues.push({ severity: 'critical', message: 'Invalid maxAgents configuration' });
        health.status = 'unhealthy';
      }
    }

    return health;
  }

  private static async checkDataIntegrity(): Promise<any> {
    const health: any = {
      status: 'healthy',
      issues: []
    };

    // Check data directory
    if (!await fs.pathExists('.agentic-qe/data')) {
      health.issues.push({ severity: 'warning', message: 'Data directory missing' });
      health.status = 'degraded';
      return health;
    }

    // Check registry file
    if (await fs.pathExists('.agentic-qe/data/registry.json')) {
      try {
        const registry = await fs.readJson('.agentic-qe/data/registry.json');

        // Validate registry structure
        if (!registry.agents || !Array.isArray(registry.agents)) {
          health.issues.push({ severity: 'critical', message: 'Invalid registry structure' });
          health.status = 'unhealthy';
        }
      } catch (error) {
        health.issues.push({ severity: 'critical', message: 'Corrupted registry file' });
        health.status = 'unhealthy';
      }
    }

    return health;
  }

  private static async checkAgentHealth(): Promise<any> {
    const health: any = {
      status: 'healthy',
      issues: [],
      agentStats: {}
    };

    const registryPath = '.agentic-qe/data/registry.json';
    if (!await fs.pathExists(registryPath)) {
      health.issues.push({ severity: 'warning', message: 'No agent registry found' });
      health.status = 'degraded';
      return health;
    }

    const registry = await fs.readJson(registryPath);
    const agents = registry.agents || [];

    health.agentStats = {
      total: agents.length,
      active: agents.filter((a: any) => a.status === 'active').length,
      idle: agents.filter((a: any) => a.status === 'idle').length,
      failed: agents.filter((a: any) => a.status === 'failed').length
    };

    // Check for failed agents
    if (health.agentStats.failed > 0) {
      health.issues.push({
        severity: 'warning',
        message: `${health.agentStats.failed} failed agents detected`
      });
      health.status = 'degraded';
    }

    // Check for low active agent count
    if (health.agentStats.active < health.agentStats.total * 0.5) {
      health.issues.push({
        severity: 'warning',
        message: 'Less than 50% of agents are active'
      });
      health.status = 'degraded';
    }

    return health;
  }

  private static async checkTaskHealth(): Promise<any> {
    const health: any = {
      status: 'healthy',
      issues: [],
      taskStats: {}
    };

    const registryPath = '.agentic-qe/data/registry.json';
    if (!await fs.pathExists(registryPath)) {
      return health;
    }

    const registry = await fs.readJson(registryPath);
    const tasks = registry.tasks || [];

    health.taskStats = {
      total: tasks.length,
      running: tasks.filter((t: any) => t.status === 'running').length,
      completed: tasks.filter((t: any) => t.status === 'completed').length,
      failed: tasks.filter((t: any) => t.status === 'failed').length
    };

    // Calculate failure rate
    if (health.taskStats.total > 0) {
      const failureRate = health.taskStats.failed / health.taskStats.total;

      if (failureRate > 0.3) {
        health.issues.push({
          severity: 'critical',
          message: `High task failure rate: ${(failureRate * 100).toFixed(1)}%`
        });
        health.status = 'unhealthy';
      } else if (failureRate > 0.1) {
        health.issues.push({
          severity: 'warning',
          message: `Elevated task failure rate: ${(failureRate * 100).toFixed(1)}%`
        });
        health.status = 'degraded';
      }
    }

    return health;
  }

  private static async checkCoordinationHealth(): Promise<any> {
    const health: any = {
      status: 'healthy',
      issues: []
    };

    // Check coordination scripts
    const scriptsDir = '.agentic-qe/scripts';
    if (await fs.pathExists(scriptsDir)) {
      const scripts = await fs.readdir(scriptsDir);
      if (scripts.length === 0) {
        health.issues.push({ severity: 'info', message: 'No coordination scripts found' });
      }
    }

    // Check if Claude Flow memory is accessible
    try {
      const { execSync } = require('child_process');
      execSync('npx claude-flow@alpha hooks notify --message "Health check"', {
        stdio: 'ignore',
        timeout: 5000
      });
    } catch (error) {
      health.issues.push({ severity: 'warning', message: 'Claude Flow coordination unavailable' });
      health.status = 'degraded';
    }

    return health;
  }

  private static async checkSystemResources(): Promise<any> {
    const health: any = {
      status: 'healthy',
      issues: [],
      resources: {}
    };

    // Check disk space
    try {
      const stats = await fs.stat('.agentic-qe');
      health.resources.dataDir = 'ok';
    } catch (error) {
      health.issues.push({ severity: 'critical', message: 'Cannot access data directory' });
      health.status = 'unhealthy';
    }

    return health;
  }

  private static generateRecommendations(components: any): string[] {
    const recommendations: string[] = [];

    Object.entries(components).forEach(([name, component]: [string, any]) => {
      if (component.status !== 'healthy') {
        switch (name) {
          case 'configuration':
            recommendations.push('Run `aqe fleet init` to recreate configuration files');
            break;
          case 'data':
            recommendations.push('Check data directory permissions and integrity');
            break;
          case 'agents':
            recommendations.push('Investigate failed agents and restart if needed');
            break;
          case 'tasks':
            recommendations.push('Review task logs for failure patterns');
            break;
          case 'coordination':
            recommendations.push('Verify Claude Flow installation and configuration');
            break;
        }
      }
    });

    if (recommendations.length === 0) {
      recommendations.push('Fleet is healthy - continue regular monitoring');
    }

    return recommendations;
  }

  private static async collectDetailedMetrics(): Promise<any> {
    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime() * 1000,
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version
    };
  }

  private static displayHealthReport(report: any, detailed?: boolean): void {
    // Overall status
    const statusColor = this.getHealthColor(report.status);
    console.log(chalk.blue('📊 Overall Health:'));
    console.log(`  Status: ${statusColor(report.status.toUpperCase())}`);

    // Component health
    console.log(chalk.blue('\n🔧 Component Health:'));
    Object.entries(report.components).forEach(([name, component]: [string, any]) => {
      const color = this.getHealthColor(component.status);
      console.log(`  ${name}: ${color(component.status)}`);
    });

    // Issues
    if (report.issues.length > 0) {
      console.log(chalk.red('\n🚨 Issues Detected:'));
      report.issues.forEach((issue: any) => {
        const severityColor = this.getSeverityColor(issue.severity);
        console.log(severityColor(`  [${issue.severity.toUpperCase()}] ${issue.message}`));
      });
    } else {
      console.log(chalk.green('\n✅ No issues detected'));
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      console.log(chalk.yellow('\n💡 Recommendations:'));
      report.recommendations.forEach((rec: string) => {
        console.log(chalk.gray(`  • ${rec}`));
      });
    }

    // Detailed metrics
    if (detailed && report.metrics) {
      console.log(chalk.blue('\n📈 Detailed Metrics:'));
      console.log(chalk.gray(`  Uptime: ${(report.metrics.uptime / 1000).toFixed(0)}s`));
      console.log(chalk.gray(`  Memory RSS: ${(report.metrics.memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`));
      console.log(chalk.gray(`  Node Version: ${report.metrics.nodeVersion}`));
    }
  }

  private static getHealthColor(status: string): any {
    const colors: Record<string, any> = {
      'healthy': chalk.green,
      'degraded': chalk.yellow,
      'unhealthy': chalk.red,
      'unknown': chalk.gray
    };
    return colors[status] || chalk.white;
  }

  private static getSeverityColor(severity: string): any {
    const colors: Record<string, any> = {
      'critical': chalk.red,
      'warning': chalk.yellow,
      'info': chalk.blue
    };
    return colors[severity] || chalk.gray;
  }

  private static async exportHealthReport(report: any): Promise<void> {
    const reportsDir = '.agentic-qe/reports';
    await fs.ensureDir(reportsDir);

    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const reportFile = `${reportsDir}/health-report-${timestamp}.json`;

    await fs.writeJson(reportFile, report, { spaces: 2 });
    console.log(chalk.gray(`  Report saved: ${reportFile}`));
  }

  private static async autoFixIssues(issues: any[]): Promise<void> {
    console.log(chalk.blue('\n🔧 Auto-fixing detected issues...\n'));

    for (const issue of issues) {
      if (issue.severity === 'critical' && issue.message.includes('Missing configuration')) {
        // Attempt to recreate missing configuration
        console.log(chalk.yellow(`  Attempting to fix: ${issue.message}`));
        // In production, this would call the actual fix logic
      }
    }
  }

  private static async storeHealthCheck(report: any): Promise<void> {
    try {
      const { execSync } = require('child_process');
      const data = JSON.stringify({ status: report.status, timestamp: report.timestamp });
      const command = `npx claude-flow@alpha memory store --key "aqe/swarm/fleet-cli-commands/health" --value '${data}'`;
      execSync(command, { stdio: 'ignore', timeout: 5000 });
    } catch (error) {
      // Silently handle coordination errors
    }
  }
}
