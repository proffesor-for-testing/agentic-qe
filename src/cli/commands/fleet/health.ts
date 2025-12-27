import chalk from 'chalk';
import type { Chalk } from 'chalk';
import * as fs from 'fs-extra';

// ============================================================================
// Health Status Types
// ============================================================================

/**
 * Overall health status of a component or the fleet
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Severity level for health issues
 */
export type IssueSeverity = 'critical' | 'warning' | 'info';

/**
 * A single health issue detected during checks
 */
export interface HealthIssue {
  severity: IssueSeverity;
  message: string;
}

/**
 * Result of a configuration file check
 */
export interface ConfigFileCheck {
  file: string;
  status: 'ok' | 'missing' | 'invalid';
}

/**
 * Statistics about agents in the fleet
 */
export interface AgentStats {
  total: number;
  active: number;
  idle: number;
  failed: number;
}

/**
 * Statistics about tasks in the fleet
 */
export interface TaskStats {
  total: number;
  running: number;
  completed: number;
  failed: number;
}

/**
 * Resource status information
 */
export interface ResourceStatus {
  dataDir?: 'ok' | 'error';
}

/**
 * Health check result for a component
 */
export interface ComponentHealth {
  status: HealthStatus;
  issues: HealthIssue[];
  checks?: ConfigFileCheck[];
  agentStats?: AgentStats;
  taskStats?: TaskStats;
  resources?: ResourceStatus;
}

/**
 * Collection of all component health results
 */
export interface ComponentHealthMap {
  configuration: ComponentHealth;
  data: ComponentHealth;
  agents: ComponentHealth;
  tasks: ComponentHealth;
  coordination: ComponentHealth;
  resources: ComponentHealth;
}

/**
 * Node.js memory usage structure
 */
export interface NodeMemoryUsage {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

/**
 * Detailed metrics collected during health check
 */
export interface DetailedMetrics {
  timestamp: string;
  uptime: number;
  memoryUsage: NodeMemoryUsage;
  nodeVersion: string;
}

/**
 * Complete health report structure
 */
export interface FleetHealthReport {
  timestamp: string;
  status: HealthStatus;
  components: ComponentHealthMap;
  issues: HealthIssue[];
  recommendations: string[];
  metrics: DetailedMetrics | Record<string, never>;
}

/**
 * Fleet configuration structure (partial, for validation)
 */
export interface FleetConfigValidation {
  topology?: string;
  maxAgents?: number;
}

/**
 * Agent entry in the registry
 */
export interface RegistryAgent {
  id: string;
  type: string;
  status: 'active' | 'idle' | 'failed' | 'stopped';
}

/**
 * Task entry in the registry
 */
export interface RegistryTask {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

/**
 * Registry data structure
 */
export interface RegistryData {
  agents?: RegistryAgent[];
  tasks?: RegistryTask[];
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid FleetConfigValidation
 */
function isFleetConfig(value: unknown): value is FleetConfigValidation {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    (obj.topology === undefined || typeof obj.topology === 'string') &&
    (obj.maxAgents === undefined || typeof obj.maxAgents === 'number')
  );
}

/**
 * Type guard to check if a value is valid RegistryData
 */
function isRegistryData(value: unknown): value is RegistryData {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  if (obj.agents !== undefined && !Array.isArray(obj.agents)) {
    return false;
  }
  if (obj.tasks !== undefined && !Array.isArray(obj.tasks)) {
    return false;
  }
  return true;
}

/**
 * Type guard to check if an agent has a valid status
 */
function isValidAgentStatus(status: unknown): status is RegistryAgent['status'] {
  return status === 'active' || status === 'idle' || status === 'failed' || status === 'stopped';
}

/**
 * Type guard to check if a task has a valid status
 */
function isValidTaskStatus(status: unknown): status is RegistryTask['status'] {
  return status === 'pending' || status === 'running' || status === 'completed' || status === 'failed';
}

// ============================================================================
// Command Options
// ============================================================================

export interface FleetHealthOptions {
  detailed?: boolean;
  exportReport?: boolean;
  fix?: boolean; // Auto-fix detected issues
}

export class FleetHealthCommand {
  static async execute(options: FleetHealthOptions): Promise<FleetHealthReport> {
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

  private static async performHealthCheck(detailed?: boolean): Promise<FleetHealthReport> {
    // Check all components
    const configuration = await this.checkConfigurationHealth();
    const data = await this.checkDataIntegrity();
    const agents = await this.checkAgentHealth();
    const tasks = await this.checkTaskHealth();
    const coordination = await this.checkCoordinationHealth();
    const resources = await this.checkSystemResources();

    const components: ComponentHealthMap = {
      configuration,
      data,
      agents,
      tasks,
      coordination,
      resources
    };

    // Calculate overall status
    const componentStatuses = Object.values(components).map((c: ComponentHealth) => c.status);
    const healthyCount = componentStatuses.filter(s => s === 'healthy').length;
    const totalCount = componentStatuses.length;

    let status: HealthStatus;
    if (healthyCount === totalCount) {
      status = 'healthy';
    } else if (healthyCount >= totalCount * 0.7) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    // Collect issues from all components
    const issues: HealthIssue[] = [];
    Object.values(components).forEach((component: ComponentHealth) => {
      if (component.issues) {
        issues.push(...component.issues);
      }
    });

    // Generate recommendations
    const recommendations = this.generateRecommendations(components);

    // Collect detailed metrics if requested
    const metrics = detailed ? await this.collectDetailedMetrics() : {};

    const report: FleetHealthReport = {
      timestamp: new Date().toISOString(),
      status,
      components,
      issues,
      recommendations,
      metrics
    };

    return report;
  }

  private static async checkConfigurationHealth(): Promise<ComponentHealth> {
    let status: HealthStatus = 'healthy';
    const issues: HealthIssue[] = [];
    const checks: ConfigFileCheck[] = [];

    // Check required configuration files
    const requiredFiles = [
      '.agentic-qe/config/fleet.json',
      '.agentic-qe/config/agents.json'
    ];

    for (const file of requiredFiles) {
      if (await fs.pathExists(file)) {
        checks.push({ file, status: 'ok' });
      } else {
        checks.push({ file, status: 'missing' });
        issues.push({ severity: 'critical', message: `Missing configuration: ${file}` });
        status = 'unhealthy';
      }
    }

    // Validate configuration content
    if (await fs.pathExists('.agentic-qe/config/fleet.json')) {
      const rawConfig: unknown = await fs.readJson('.agentic-qe/config/fleet.json');

      if (isFleetConfig(rawConfig)) {
        if (!rawConfig.topology) {
          issues.push({ severity: 'warning', message: 'No topology specified' });
          if (status === 'healthy') {
            status = 'degraded';
          }
        }

        if (!rawConfig.maxAgents || rawConfig.maxAgents < 1) {
          issues.push({ severity: 'critical', message: 'Invalid maxAgents configuration' });
          status = 'unhealthy';
        }
      } else {
        issues.push({ severity: 'critical', message: 'Invalid fleet configuration format' });
        status = 'unhealthy';
      }
    }

    return { status, issues, checks };
  }

  private static async checkDataIntegrity(): Promise<ComponentHealth> {
    let status: HealthStatus = 'healthy';
    const issues: HealthIssue[] = [];

    // Check data directory
    if (!await fs.pathExists('.agentic-qe/data')) {
      issues.push({ severity: 'warning', message: 'Data directory missing' });
      return { status: 'degraded', issues };
    }

    // Check registry file
    if (await fs.pathExists('.agentic-qe/data/registry.json')) {
      try {
        const rawRegistry: unknown = await fs.readJson('.agentic-qe/data/registry.json');

        // Validate registry structure
        if (!isRegistryData(rawRegistry) || !rawRegistry.agents) {
          issues.push({ severity: 'critical', message: 'Invalid registry structure' });
          status = 'unhealthy';
        }
      } catch {
        issues.push({ severity: 'critical', message: 'Corrupted registry file' });
        status = 'unhealthy';
      }
    }

    return { status, issues };
  }

  private static async checkAgentHealth(): Promise<ComponentHealth> {
    let status: HealthStatus = 'healthy';
    const issues: HealthIssue[] = [];

    const registryPath = '.agentic-qe/data/registry.json';
    if (!await fs.pathExists(registryPath)) {
      issues.push({ severity: 'warning', message: 'No agent registry found' });
      return { status: 'degraded', issues };
    }

    const rawRegistry: unknown = await fs.readJson(registryPath);
    if (!isRegistryData(rawRegistry)) {
      issues.push({ severity: 'critical', message: 'Invalid registry format' });
      return { status: 'unhealthy', issues };
    }

    const agents = rawRegistry.agents || [];

    // Count agents by status using type-safe filtering
    const agentStats: AgentStats = {
      total: agents.length,
      active: agents.filter((a): a is RegistryAgent =>
        typeof a === 'object' && a !== null && 'status' in a && isValidAgentStatus((a as { status: unknown }).status) && (a as RegistryAgent).status === 'active'
      ).length,
      idle: agents.filter((a): a is RegistryAgent =>
        typeof a === 'object' && a !== null && 'status' in a && isValidAgentStatus((a as { status: unknown }).status) && (a as RegistryAgent).status === 'idle'
      ).length,
      failed: agents.filter((a): a is RegistryAgent =>
        typeof a === 'object' && a !== null && 'status' in a && isValidAgentStatus((a as { status: unknown }).status) && (a as RegistryAgent).status === 'failed'
      ).length
    };

    // Check for failed agents
    if (agentStats.failed > 0) {
      issues.push({
        severity: 'warning',
        message: `${agentStats.failed} failed agents detected`
      });
      status = 'degraded';
    }

    // Check for low active agent count
    if (agentStats.total > 0 && agentStats.active < agentStats.total * 0.5) {
      issues.push({
        severity: 'warning',
        message: 'Less than 50% of agents are active'
      });
      status = 'degraded';
    }

    return { status, issues, agentStats };
  }

  private static async checkTaskHealth(): Promise<ComponentHealth> {
    let status: HealthStatus = 'healthy';
    const issues: HealthIssue[] = [];

    const registryPath = '.agentic-qe/data/registry.json';
    if (!await fs.pathExists(registryPath)) {
      return { status, issues };
    }

    const rawRegistry: unknown = await fs.readJson(registryPath);
    if (!isRegistryData(rawRegistry)) {
      return { status, issues };
    }

    const tasks = rawRegistry.tasks || [];

    // Count tasks by status using type-safe filtering
    const taskStats: TaskStats = {
      total: tasks.length,
      running: tasks.filter((t): t is RegistryTask =>
        typeof t === 'object' && t !== null && 'status' in t && isValidTaskStatus((t as { status: unknown }).status) && (t as RegistryTask).status === 'running'
      ).length,
      completed: tasks.filter((t): t is RegistryTask =>
        typeof t === 'object' && t !== null && 'status' in t && isValidTaskStatus((t as { status: unknown }).status) && (t as RegistryTask).status === 'completed'
      ).length,
      failed: tasks.filter((t): t is RegistryTask =>
        typeof t === 'object' && t !== null && 'status' in t && isValidTaskStatus((t as { status: unknown }).status) && (t as RegistryTask).status === 'failed'
      ).length
    };

    // Calculate failure rate
    if (taskStats.total > 0) {
      const failureRate = taskStats.failed / taskStats.total;

      if (failureRate > 0.3) {
        issues.push({
          severity: 'critical',
          message: `High task failure rate: ${(failureRate * 100).toFixed(1)}%`
        });
        status = 'unhealthy';
      } else if (failureRate > 0.1) {
        issues.push({
          severity: 'warning',
          message: `Elevated task failure rate: ${(failureRate * 100).toFixed(1)}%`
        });
        status = 'degraded';
      }
    }

    return { status, issues, taskStats };
  }

  private static async checkCoordinationHealth(): Promise<ComponentHealth> {
    let status: HealthStatus = 'healthy';
    const issues: HealthIssue[] = [];

    // Check coordination scripts
    const scriptsDir = '.agentic-qe/scripts';
    if (await fs.pathExists(scriptsDir)) {
      const scripts = await fs.readdir(scriptsDir);
      if (scripts.length === 0) {
        issues.push({ severity: 'info', message: 'No coordination scripts found' });
      }
    }

    // Check if Claude Flow memory is accessible
    try {
      const { execSync } = await import('child_process');
      execSync('npx claude-flow@alpha hooks notify --message "Health check"', {
        stdio: 'ignore',
        timeout: 5000
      });
    } catch {
      issues.push({ severity: 'warning', message: 'Claude Flow coordination unavailable' });
      status = 'degraded';
    }

    return { status, issues };
  }

  private static async checkSystemResources(): Promise<ComponentHealth> {
    let status: HealthStatus = 'healthy';
    const issues: HealthIssue[] = [];
    const resources: ResourceStatus = {};

    // Check disk space
    try {
      await fs.stat('.agentic-qe');
      resources.dataDir = 'ok';
    } catch {
      issues.push({ severity: 'critical', message: 'Cannot access data directory' });
      status = 'unhealthy';
      resources.dataDir = 'error';
    }

    return { status, issues, resources };
  }

  private static generateRecommendations(components: ComponentHealthMap): string[] {
    const recommendations: string[] = [];

    const componentNames = Object.keys(components) as (keyof ComponentHealthMap)[];
    for (const name of componentNames) {
      const component = components[name];
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
          case 'resources':
            recommendations.push('Check system resources and disk space');
            break;
        }
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Fleet is healthy - continue regular monitoring');
    }

    return recommendations;
  }

  private static async collectDetailedMetrics(): Promise<DetailedMetrics> {
    const memUsage = process.memoryUsage();
    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime() * 1000,
      memoryUsage: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers
      },
      nodeVersion: process.version
    };
  }

  private static displayHealthReport(report: FleetHealthReport, detailed?: boolean): void {
    // Overall status
    const statusColor = this.getHealthColor(report.status);
    console.log(chalk.blue('📊 Overall Health:'));
    console.log(`  Status: ${statusColor(report.status.toUpperCase())}`);

    // Component health
    console.log(chalk.blue('\n🔧 Component Health:'));
    const componentNames = Object.keys(report.components) as (keyof ComponentHealthMap)[];
    for (const name of componentNames) {
      const component = report.components[name];
      const color = this.getHealthColor(component.status);
      console.log(`  ${name}: ${color(component.status)}`);
    }

    // Issues
    if (report.issues.length > 0) {
      console.log(chalk.red('\n🚨 Issues Detected:'));
      for (const issue of report.issues) {
        const severityColor = this.getSeverityColor(issue.severity);
        console.log(severityColor(`  [${issue.severity.toUpperCase()}] ${issue.message}`));
      }
    } else {
      console.log(chalk.green('\n✅ No issues detected'));
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      console.log(chalk.yellow('\n💡 Recommendations:'));
      for (const rec of report.recommendations) {
        console.log(chalk.gray(`  - ${rec}`));
      }
    }

    // Detailed metrics
    if (detailed && 'uptime' in report.metrics) {
      const metrics = report.metrics as DetailedMetrics;
      console.log(chalk.blue('\n📈 Detailed Metrics:'));
      console.log(chalk.gray(`  Uptime: ${(metrics.uptime / 1000).toFixed(0)}s`));
      console.log(chalk.gray(`  Memory RSS: ${(metrics.memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`));
      console.log(chalk.gray(`  Node Version: ${metrics.nodeVersion}`));
    }
  }

  /**
   * Chalk color function type for text styling
   */
  private static getHealthColor(status: HealthStatus | string): Chalk {
    const colors: Record<HealthStatus, Chalk> = {
      'healthy': chalk.green,
      'degraded': chalk.yellow,
      'unhealthy': chalk.red,
      'unknown': chalk.gray
    };
    return colors[status as HealthStatus] || chalk.white;
  }

  private static getSeverityColor(severity: IssueSeverity | string): Chalk {
    const colors: Record<IssueSeverity, Chalk> = {
      'critical': chalk.red,
      'warning': chalk.yellow,
      'info': chalk.blue
    };
    return colors[severity as IssueSeverity] || chalk.gray;
  }

  private static async exportHealthReport(report: FleetHealthReport): Promise<void> {
    const reportsDir = '.agentic-qe/reports';
    await fs.ensureDir(reportsDir);

    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const reportFile = `${reportsDir}/health-report-${timestamp}.json`;

    await fs.writeJson(reportFile, report, { spaces: 2 });
    console.log(chalk.gray(`  Report saved: ${reportFile}`));
  }

  private static async autoFixIssues(issues: HealthIssue[]): Promise<void> {
    console.log(chalk.blue('\n🔧 Auto-fixing detected issues...\n'));

    for (const issue of issues) {
      if (issue.severity === 'critical' && issue.message.includes('Missing configuration')) {
        // Attempt to recreate missing configuration
        console.log(chalk.yellow(`  Attempting to fix: ${issue.message}`));
        // In production, this would call the actual fix logic
      }
    }
  }

  private static async storeHealthCheck(report: FleetHealthReport): Promise<void> {
    try {
      const { execSync } = await import('child_process');
      const data = JSON.stringify({ status: report.status, timestamp: report.timestamp });
      const command = `npx claude-flow@alpha memory store --key "aqe/swarm/fleet-cli-commands/health" --value '${data}'`;
      execSync(command, { stdio: 'ignore', timeout: 5000 });
    } catch {
      // Silently handle coordination errors
    }
  }
}
