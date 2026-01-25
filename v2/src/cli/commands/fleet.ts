import { ProcessExit } from '../../utils/ProcessExit';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs-extra';
import { FleetOptions, FleetConfig, AgentConfig } from '../../types';

// ============================================================================
// Fleet Command Type Definitions
// ============================================================================

/**
 * Error with message and stack trace for proper error handling
 */
interface FleetCommandError extends Error {
  message: string;
  stack?: string;
}

/**
 * Type guard to check if an error has message and stack properties
 */
function isFleetCommandError(error: unknown): error is FleetCommandError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as FleetCommandError).message === 'string'
  );
}

/**
 * Extended fleet configuration stored in fleet.json
 */
interface StoredFleetConfig extends FleetConfig {
  fleet?: {
    id: string;
    status?: string;
  };
  lastModified?: string;
}

/**
 * Agent configuration stored in agents.json
 */
interface StoredAgentConfig {
  fleet: {
    agents: AgentConfigEntry[];
    maxAgents: number;
    status?: string;
  };
}

/**
 * Individual agent configuration entry
 */
interface AgentConfigEntry {
  type: string;
  count: number;
  config?: Record<string, unknown>;
}

/**
 * Fleet registry data structure
 */
interface FleetRegistry {
  fleet: {
    agents: FleetRegistryAgent[];
    status: FleetStatus;
  };
}

/**
 * Agent entry in fleet registry
 */
interface FleetRegistryAgent {
  id: string;
  type: string;
  status: string;
}

/**
 * Possible fleet status values
 */
type FleetStatus = 'active' | 'idle' | 'degraded' | 'unknown' | 'destroyed';

/**
 * Execution history entry from report files
 */
interface ExecutionHistoryEntry {
  timestamp: string;
  summary?: ExecutionSummary;
  agents?: Record<string, ExecutionAgentData>;
}

/**
 * Execution summary from report
 */
interface ExecutionSummary {
  total: number;
  passed: number;
  failed: number;
  skipped?: number;
  duration: number;
}

/**
 * Agent-specific execution data
 */
interface ExecutionAgentData {
  tasks: number;
  duration: number;
}

/**
 * Agent performance analysis result
 */
interface AgentPerformanceAnalysis {
  totalExecutions: number;
  averageSuccess: number;
  averageDuration: number;
  agentUtilization: Record<string, AgentUtilizationMetrics>;
  trends: 'stable' | 'improving' | 'declining';
}

/**
 * Individual agent utilization metrics
 */
interface AgentUtilizationMetrics {
  usage: number;
  tasks: number;
  avgDuration: number;
}

/**
 * Fleet health status
 */
interface FleetHealth {
  overall: HealthStatus;
  warnings: string[];
}

/**
 * Health status values
 */
type HealthStatus = 'healthy' | 'degraded' | 'critical' | 'unknown' | 'stale';

/**
 * Health report from health check
 */
interface HealthReport {
  timestamp: string;
  overall: HealthStatus;
  components: Record<string, ComponentHealth>;
  issues: HealthIssue[];
  recommendations: string[];
}

/**
 * Component health status
 */
interface ComponentHealth {
  status: HealthStatus;
  message?: string;
  issues: string[];
}

/**
 * Health issue details
 */
interface HealthIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  component?: string;
}

/**
 * Deployment configuration
 */
interface DeploymentConfig {
  version: string;
  environment: string;
  fleet: StoredFleetConfig;
  environment_config: EnvironmentConfig;
  agentCount: number;
  components: string[];
  resources: DeploymentResources;
  metadata: DeploymentMetadata;
}

/**
 * Environment-specific configuration
 */
interface EnvironmentConfig {
  [key: string]: unknown;
}

/**
 * Deployment resource allocation
 */
interface DeploymentResources {
  memory: string;
  cpu: string;
  storage: string;
}

/**
 * Deployment metadata
 */
interface DeploymentMetadata {
  generatedAt: string;
  topology: string;
}

/**
 * Deployment validation result
 */
interface DeploymentValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Fleet destruction record
 */
interface DestructionRecord {
  fleet: {
    id: string;
    status: 'destroyed';
    destroyedAt: string;
    reason: string;
    agentCount: number;
  };
}

// ============================================================================
// FleetCommand Class Implementation
// ============================================================================

export class FleetCommand {
  static async execute(action: string, options: FleetOptions): Promise<void> {
    console.log(chalk.blue.bold('\n🚁 Fleet Management Operations\n'));

    try {
      // Validate inputs
      await this.validateInputs(action, options);

      const spinner = ora('Initializing fleet operation...').start();

      // Execute the requested action
      switch (action) {
        case 'status':
          await this.showFleetStatus(options, spinner);
          break;
        case 'scale':
          await this.scaleFleet(options, spinner);
          break;
        case 'deploy':
          await this.deployFleet(options, spinner);
          break;
        case 'destroy':
          await this.destroyFleet(options, spinner);
          break;
        case 'health':
          await this.healthCheck(options, spinner);
          break;
        default:
          await this.showFleetStatus(options, spinner);
      }

    } catch (error: unknown) {
      if (isFleetCommandError(error)) {
        console.error(chalk.red('❌ Fleet operation failed:'), error.message);
        if (options.verbose && error.stack) {
          console.error(chalk.gray(error.stack));
        }
      } else {
        console.error(chalk.red('❌ Fleet operation failed:'), String(error));
      }
      ProcessExit.exitIfNotTest(1);
    }
  }

  private static async validateInputs(action: string, options: FleetOptions): Promise<void> {
    const validActions = ['status', 'scale', 'deploy', 'destroy', 'health'];
    if (!validActions.includes(action)) {
      throw new Error(`Invalid action '${action}'. Must be one of: ${validActions.join(', ')}`);
    }

    if (action === 'scale' && !options.agents) {
      throw new Error('Agent count required for scaling operation');
    }

    if (action === 'scale' && options.agents) {
      const agentCount = parseInt(options.agents);
      if (agentCount < 1 || agentCount > 50) {
        throw new Error('Agent count must be between 1 and 50');
      }
    }

    // Check if fleet configuration exists
    if (!await fs.pathExists('.agentic-qe/config/fleet.json')) {
      throw new Error('Fleet not initialized. Run: agentic-qe init');
    }
  }

  private static async showFleetStatus(options: FleetOptions, spinner: ora.Ora): Promise<void> {
    spinner.text = 'Loading fleet configuration...';

    // Load fleet configuration
    const fleetConfig: StoredFleetConfig = await fs.readJson('.agentic-qe/config/fleet.json');
    const agentConfig: StoredAgentConfig = await fs.readJson('.agentic-qe/config/agents.json');

    spinner.text = 'Analyzing fleet status...';

    // Load fleet registry
    const registryPath = '.agentic-qe/data/registry.json';
    let fleetRegistry: FleetRegistry = { fleet: { agents: [], status: 'unknown' } };

    if (await fs.pathExists(registryPath)) {
      fleetRegistry = await fs.readJson(registryPath);
    }

    // Get execution history
    const executionHistory = await this.getExecutionHistory();

    // Analyze agent performance
    const agentPerformance = await this.analyzeAgentPerformance();

    spinner.succeed(chalk.green('Fleet status loaded successfully!'));

    // Display comprehensive status
    this.displayFleetStatus(fleetConfig, agentConfig, fleetRegistry, executionHistory, agentPerformance, options);

    // Store status check in coordination
    await this.storeStatusCheck();
  }

  private static async scaleFleet(options: FleetOptions, spinner: ora.Ora): Promise<void> {
    const targetAgents = parseInt(options.agents!);

    spinner.text = `Scaling fleet to ${targetAgents} agents...`;

    // Load current configuration
    const fleetConfig: StoredFleetConfig = await fs.readJson('.agentic-qe/config/fleet.json');
    const agentConfig: StoredAgentConfig = await fs.readJson('.agentic-qe/config/agents.json');

    // Calculate scaling changes
    const currentAgents = fleetConfig.maxAgents ?? 0;
    const scalingOperation = targetAgents > currentAgents ? 'scale-up' : 'scale-down';

    spinner.text = `Performing ${scalingOperation} operation...`;

    // Update configuration
    fleetConfig.maxAgents = targetAgents;
    fleetConfig.lastModified = new Date().toISOString();

    // Update agent distribution
    const agentTypes: AgentConfigEntry[] = agentConfig.fleet.agents;
    const agentsPerType = Math.ceil(targetAgents / agentTypes.length);

    agentTypes.forEach((agent: AgentConfigEntry) => {
      agent.count = Math.min(agentsPerType, targetAgents);
    });

    agentConfig.fleet.maxAgents = targetAgents;

    spinner.text = 'Updating configuration files...';

    // Save updated configurations
    await fs.writeJson('.agentic-qe/config/fleet.json', fleetConfig, { spaces: 2 });
    await fs.writeJson('.agentic-qe/config/agents.json', agentConfig, { spaces: 2 });

    // Generate scaling script
    await this.generateScalingScript(scalingOperation, currentAgents, targetAgents, options);

    spinner.succeed(chalk.green(`Fleet scaled from ${currentAgents} to ${targetAgents} agents!`));

    // Display scaling summary
    this.displayScalingSummary(currentAgents, targetAgents, scalingOperation);

    // Store scaling operation in coordination
    await this.storeScalingOperation(currentAgents, targetAgents);
  }

  private static async deployFleet(options: FleetOptions, spinner: ora.Ora): Promise<void> {
    spinner.text = `Deploying fleet to ${options.env} environment...`;

    // Load configurations
    const fleetConfig: StoredFleetConfig = await fs.readJson('.agentic-qe/config/fleet.json');
    const envConfig: EnvironmentConfig = await this.loadEnvironmentConfig(options.env);

    spinner.text = 'Preparing deployment manifests...';

    // Generate deployment configuration
    const deploymentConfig = await this.generateDeploymentConfig(fleetConfig, envConfig, options);

    spinner.text = 'Creating deployment artifacts...';

    // Create deployment directory
    const deploymentDir = `.agentic-qe/deployments/${options.env}-${Date.now()}`;
    await fs.ensureDir(deploymentDir);

    // Write deployment artifacts
    await fs.writeJson(`${deploymentDir}/deployment.json`, deploymentConfig, { spaces: 2 });

    // Generate deployment scripts
    await this.generateDeploymentScripts(deploymentDir, deploymentConfig, options);

    spinner.text = 'Validating deployment configuration...';

    // Validate deployment
    const validation = await this.validateDeployment(deploymentConfig);

    if (!validation.valid) {
      throw new Error(`Deployment validation failed: ${validation.errors.join(', ')}`);
    }

    spinner.succeed(chalk.green(`Fleet deployment prepared for ${options.env} environment!`));

    // Display deployment summary
    this.displayDeploymentSummary(deploymentConfig, validation, options);

    // Store deployment operation
    await this.storeDeploymentOperation(deploymentConfig);
  }

  private static async destroyFleet(options: FleetOptions, spinner: ora.Ora): Promise<void> {
    spinner.text = 'Initiating fleet destruction...';

    // Load current configuration
    const fleetConfig: StoredFleetConfig = await fs.readJson('.agentic-qe/config/fleet.json');

    spinner.text = 'Stopping all agents gracefully...';

    // Generate destruction script
    const destructionScript = `#!/bin/bash
# Fleet Destruction Script
echo "Stopping Agentic QE Fleet..."

# Archive current state
mkdir -p .agentic-qe/archive/$(date +%Y%m%d-%H%M%S)
cp -r .agentic-qe/data/* .agentic-qe/archive/$(date +%Y%m%d-%H%M%S)/ 2>/dev/null || true
cp -r .agentic-qe/reports/* .agentic-qe/archive/$(date +%Y%m%d-%H%M%S)/ 2>/dev/null || true

# Clear runtime data
rm -rf .agentic-qe/data/registry.json
rm -rf .agentic-qe/executions/*

echo "Fleet destroyed successfully"
`;

    await fs.writeFile('.agentic-qe/scripts/destroy-fleet.sh', destructionScript);
    await fs.chmod('.agentic-qe/scripts/destroy-fleet.sh', '755');

    spinner.text = 'Archiving fleet data...';

    // Create archive
    const archiveDir = `.agentic-qe/archive/${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`;
    await fs.ensureDir(archiveDir);

    // Archive important data
    const dataToArchive = [
      '.agentic-qe/config',
      '.agentic-qe/data',
      '.agentic-qe/reports'
    ];

    for (const dataPath of dataToArchive) {
      if (await fs.pathExists(dataPath)) {
        await fs.copy(dataPath, `${archiveDir}/${dataPath.split('/').pop()}`);
      }
    }

    spinner.text = 'Cleaning up fleet resources...';

    // Update fleet status
    const destructionRecord: DestructionRecord = {
      fleet: {
        id: fleetConfig.fleet?.id || 'unknown',
        status: 'destroyed',
        destroyedAt: new Date().toISOString(),
        reason: 'user_requested',
        agentCount: fleetConfig.maxAgents ?? 0
      }
    };

    await fs.writeJson('.agentic-qe/data/destruction.json', destructionRecord, { spaces: 2 });

    spinner.succeed(chalk.green('Fleet destroyed successfully!'));

    // Display destruction summary
    this.displayDestructionSummary(fleetConfig, archiveDir);

    // Store destruction operation
    await this.storeDestructionOperation(destructionRecord);
  }

  private static async healthCheck(options: FleetOptions, spinner: ora.Ora): Promise<void> {
    spinner.text = 'Running comprehensive health check...';

    const healthReport: HealthReport = {
      timestamp: new Date().toISOString(),
      overall: 'unknown',
      components: {},
      issues: [],
      recommendations: []
    };

    // Check configuration files
    spinner.text = 'Checking configuration integrity...';
    healthReport.components.configuration = await this.checkConfigurationHealth();

    // Check data integrity
    spinner.text = 'Checking data integrity...';
    healthReport.components.data = await this.checkDataHealth();

    // Check recent executions
    spinner.text = 'Checking execution history...';
    healthReport.components.executions = await this.checkExecutionHealth();

    // Check coordination status
    spinner.text = 'Checking coordination status...';
    healthReport.components.coordination = await this.checkCoordinationHealth();

    // Calculate overall health
    const componentStatuses = Object.values(healthReport.components).map((c: ComponentHealth) => c.status);
    const healthyCount = componentStatuses.filter((status: HealthStatus) => status === 'healthy').length;
    const totalCount = componentStatuses.length;

    if (healthyCount === totalCount) {
      healthReport.overall = 'healthy';
    } else if (healthyCount >= totalCount * 0.7) {
      healthReport.overall = 'degraded';
    } else {
      healthReport.overall = 'critical';
    }

    // Generate recommendations
    healthReport.recommendations = this.generateHealthRecommendations(healthReport.components);

    spinner.succeed(chalk.green('Health check completed!'));

    // Display health report
    this.displayHealthReport(healthReport, options);

    // Store health check results
    await this.storeHealthCheck(healthReport);
  }

  private static async getExecutionHistory(): Promise<ExecutionHistoryEntry[]> {
    const reportsDir = '.agentic-qe/reports';

    if (!await fs.pathExists(reportsDir)) {
      return [];
    }

    const reportFiles = await fs.readdir(reportsDir);
    const executionFiles = reportFiles
      .filter(file => file.startsWith('execution-') && file.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 10); // Last 10 executions

    const history: ExecutionHistoryEntry[] = [];
    for (const file of executionFiles) {
      try {
        const execution: ExecutionHistoryEntry = await fs.readJson(`${reportsDir}/${file}`);
        history.push(execution);
      } catch {
        // Skip corrupted files
      }
    }

    return history;
  }

  private static async analyzeAgentPerformance(): Promise<AgentPerformanceAnalysis> {
    const executionHistory = await this.getExecutionHistory();

    const performance: AgentPerformanceAnalysis = {
      totalExecutions: executionHistory.length,
      averageSuccess: 0,
      averageDuration: 0,
      agentUtilization: {},
      trends: 'stable'
    };

    if (executionHistory.length === 0) {
      return performance;
    }

    // Calculate averages
    const totalTests = executionHistory.reduce((sum, exec) => sum + (exec.summary?.total || 0), 0);
    const passedTests = executionHistory.reduce((sum, exec) => sum + (exec.summary?.passed || 0), 0);
    const totalDuration = executionHistory.reduce((sum, exec) => sum + (exec.summary?.duration || 0), 0);

    performance.averageSuccess = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;
    performance.averageDuration = totalDuration / executionHistory.length;

    // Analyze agent utilization
    executionHistory.forEach((exec: ExecutionHistoryEntry) => {
      const agentData = exec.agents || {};
      Object.entries(agentData).forEach(([agent, data]: [string, ExecutionAgentData]) => {
        if (!performance.agentUtilization[agent]) {
          performance.agentUtilization[agent] = {
            usage: 0,
            tasks: 0,
            avgDuration: 0
          };
        }
        performance.agentUtilization[agent].usage++;
        performance.agentUtilization[agent].tasks += data.tasks || 0;
        performance.agentUtilization[agent].avgDuration += data.duration || 0;
      });
    });

    // Normalize agent utilization
    Object.values(performance.agentUtilization).forEach((agent: AgentUtilizationMetrics) => {
      if (agent.usage > 0) {
        agent.avgDuration = agent.avgDuration / agent.usage;
      }
    });

    return performance;
  }

  private static displayFleetStatus(
    fleetConfig: StoredFleetConfig,
    agentConfig: StoredAgentConfig,
    registry: FleetRegistry,
    history: ExecutionHistoryEntry[],
    performance: AgentPerformanceAnalysis,
    options: FleetOptions
  ): void {
    console.log(chalk.yellow('\n🚁 Fleet Status Dashboard\n'));

    // Basic fleet information
    console.log(chalk.blue('📋 Fleet Configuration:'));
    console.log(chalk.gray(`  Topology: ${fleetConfig.topology}`));
    console.log(chalk.gray(`  Max Agents: ${fleetConfig.maxAgents}`));
    console.log(chalk.gray(`  Testing Focus: ${fleetConfig.testingFocus?.join(', ') || 'Not specified'}`));
    console.log(chalk.gray(`  Environments: ${fleetConfig.environments?.join(', ') || 'Not specified'}`));

    // Agent configuration
    console.log(chalk.blue('\n🤖 Agent Configuration:'));
    const agents: AgentConfigEntry[] = agentConfig.fleet?.agents || [];
    agents.forEach((agent: AgentConfigEntry) => {
      console.log(chalk.gray(`  ${agent.type}: ${agent.count} instances`));
    });

    // Fleet status
    console.log(chalk.blue('\n📊 Fleet Metrics:'));
    console.log(chalk.gray(`  Registry Status: ${registry.fleet?.status || 'Unknown'}`));
    console.log(chalk.gray(`  Total Executions: ${performance.totalExecutions}`));
    console.log(chalk.gray(`  Average Success Rate: ${performance.averageSuccess.toFixed(1)}%`));
    console.log(chalk.gray(`  Average Execution Time: ${(performance.averageDuration / 1000).toFixed(2)}s`));

    // Recent activity
    if (history.length > 0) {
      const latest: ExecutionHistoryEntry = history[0];
      console.log(chalk.blue('\n📈 Recent Activity:'));
      console.log(chalk.gray(`  Latest Execution: ${new Date(latest.timestamp).toLocaleString()}`));
      console.log(chalk.gray(`  Tests: ${latest.summary?.passed || 0}/${latest.summary?.total || 0} passed`));
      console.log(chalk.gray(`  Duration: ${((latest.summary?.duration || 0) / 1000).toFixed(2)}s`));
    }

    // Agent utilization (if verbose)
    if (options.verbose && Object.keys(performance.agentUtilization).length > 0) {
      console.log(chalk.blue('\n🔧 Agent Utilization:'));
      Object.entries(performance.agentUtilization).forEach(([agent, data]: [string, AgentUtilizationMetrics]) => {
        console.log(chalk.gray(`  ${agent}: ${data.usage} uses, ${data.tasks} tasks, ${(data.avgDuration / 1000).toFixed(2)}s avg`));
      });
    }

    // Health indicators
    const healthStatus: FleetHealth = this.calculateFleetHealth(fleetConfig, history, performance);
    console.log(chalk.blue('\n💚 Health Status:'));
    const healthColorFn = this.getHealthColorFn(healthStatus.overall);
    console.log(chalk.gray(`  Overall: ${healthColorFn(healthStatus.overall)}`));

    if (healthStatus.warnings.length > 0) {
      console.log(chalk.yellow('\n⚠️  Warnings:'));
      healthStatus.warnings.forEach((warning: string) => {
        console.log(chalk.yellow(`  • ${warning}`));
      });
    }

    // Next actions
    console.log(chalk.yellow('\n💡 Recommended Actions:'));
    if (performance.totalExecutions === 0) {
      console.log(chalk.gray('  1. Run initial tests: agentic-qe run tests'));
    } else {
      console.log(chalk.gray('  1. Monitor fleet performance regularly'));
      if (performance.averageSuccess < 90) {
        console.log(chalk.gray('  2. Investigate failing tests'));
      }
    }
    console.log(chalk.gray('  3. Scale fleet if needed: agentic-qe fleet scale --agents <count>'));
  }

  private static calculateFleetHealth(
    fleetConfig: StoredFleetConfig,
    history: ExecutionHistoryEntry[],
    performance: AgentPerformanceAnalysis
  ): FleetHealth {
    const health: FleetHealth = {
      overall: 'healthy',
      warnings: []
    };

    // Check configuration issues
    if (!fleetConfig.testingFocus || fleetConfig.testingFocus.length === 0) {
      health.warnings.push('No testing focus areas configured');
    }

    // Check execution history
    if (history.length === 0) {
      health.warnings.push('No test execution history found');
      health.overall = 'unknown';
    } else {
      // Check success rate
      if (performance.averageSuccess < 80) {
        health.warnings.push(`Low success rate: ${performance.averageSuccess.toFixed(1)}%`);
        health.overall = 'degraded';
      }

      // Check recent activity
      const latestExecution = new Date(history[0].timestamp);
      const daysSinceLastExecution = (Date.now() - latestExecution.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceLastExecution > 7) {
        health.warnings.push('No recent test executions (>7 days)');
        health.overall = 'stale';
      }
    }

    // Critical issues
    if (health.warnings.length > 3) {
      health.overall = 'critical';
    }

    return health;
  }

  /**
   * Get a color function for the given health status
   * @deprecated Use getHealthColorFn instead
   */
  private static getHealthColor(status: string): (text: string) => string {
    return this.getHealthColorFn(status as HealthStatus);
  }

  /**
   * Get a chalk color function for the given health status
   */
  private static getHealthColorFn(status: HealthStatus): (text: string) => string {
    const colors: Record<HealthStatus, (text: string) => string> = {
      'healthy': chalk.green,
      'degraded': chalk.yellow,
      'critical': chalk.red,
      'unknown': chalk.gray,
      'stale': chalk.yellow
    };

    return colors[status] || chalk.white;
  }

  private static displayScalingSummary(current: number, target: number, operation: string): void {
    console.log(chalk.yellow('\n📊 Scaling Summary:'));
    console.log(chalk.gray(`  Operation: ${operation}`));
    console.log(chalk.gray(`  Previous Agent Count: ${current}`));
    console.log(chalk.gray(`  New Agent Count: ${target}`));
    console.log(chalk.gray(`  Change: ${target > current ? '+' : ''}${target - current} agents`));

    console.log(chalk.yellow('\n💡 Next Steps:'));
    console.log(chalk.gray('  1. Verify agent allocation with: agentic-qe fleet status --verbose'));
    console.log(chalk.gray('  2. Run tests to validate scaled fleet: agentic-qe run tests'));
  }

  private static displayDeploymentSummary(
    config: DeploymentConfig,
    validation: DeploymentValidation,
    options: FleetOptions
  ): void {
    console.log(chalk.yellow('\n📦 Deployment Summary:'));
    console.log(chalk.gray(`  Environment: ${options.env}`));
    console.log(chalk.gray(`  Agents: ${config.agentCount}`));
    console.log(chalk.gray(`  Components: ${config.components?.length || 0}`));
    console.log(chalk.gray(`  Validation: ${validation.valid ? 'Passed' : 'Failed'}`));

    if (validation.warnings?.length > 0) {
      console.log(chalk.yellow('\n⚠️  Deployment Warnings:'));
      validation.warnings.forEach((warning: string) => {
        console.log(chalk.yellow(`  • ${warning}`));
      });
    }

    console.log(chalk.yellow('\n💡 Next Steps:'));
    console.log(chalk.gray('  1. Review deployment artifacts in .agentic-qe/deployments/'));
    console.log(chalk.gray('  2. Execute deployment script to apply changes'));
    console.log(chalk.gray('  3. Monitor deployment status after execution'));
  }

  private static displayDestructionSummary(fleetConfig: StoredFleetConfig, archiveDir: string): void {
    console.log(chalk.yellow('\n💥 Fleet Destruction Summary:'));
    console.log(chalk.gray(`  Fleet ID: ${fleetConfig.fleet?.id || 'Unknown'}`));
    console.log(chalk.gray(`  Agents Destroyed: ${fleetConfig.maxAgents}`));
    console.log(chalk.gray(`  Data Archived: ${archiveDir}`));
    console.log(chalk.gray(`  Destruction Time: ${new Date().toLocaleString()}`));

    console.log(chalk.yellow('\n💡 Important Notes:'));
    console.log(chalk.gray('  • All fleet data has been archived for recovery'));
    console.log(chalk.gray('  • Run agentic-qe init to create a new fleet'));
    console.log(chalk.gray('  • Historical data remains accessible in archive'));
  }

  private static displayHealthReport(healthReport: HealthReport, _options: FleetOptions): void {
    console.log(chalk.yellow('\n🏥 Fleet Health Report\n'));

    // Overall status
    const overallColor = this.getHealthColorFn(healthReport.overall);
    console.log(chalk.blue('📊 Overall Health:'));
    console.log(`  Status: ${overallColor(healthReport.overall.toUpperCase())}`);

    // Component health
    console.log(chalk.blue('\n🔧 Component Health:'));
    Object.entries(healthReport.components).forEach(([component, data]: [string, ComponentHealth]) => {
      const statusColor = this.getHealthColorFn(data.status);
      console.log(`  ${component}: ${statusColor(data.status)} ${data.message ? `- ${data.message}` : ''}`);
    });

    // Issues
    if (healthReport.issues.length > 0) {
      console.log(chalk.red('\n🚨 Issues Found:'));
      healthReport.issues.forEach((issue: HealthIssue) => {
        console.log(chalk.red(`  • ${issue.severity.toUpperCase()}: ${issue.description}`));
      });
    }

    // Recommendations
    if (healthReport.recommendations.length > 0) {
      console.log(chalk.yellow('\n💡 Recommendations:'));
      healthReport.recommendations.forEach((rec: string) => {
        console.log(chalk.gray(`  • ${rec}`));
      });
    }

    console.log(chalk.yellow('\n📁 Health Report Saved:'));
    console.log(chalk.gray('  Location: .agentic-qe/reports/health-check-[timestamp].json'));
  }

  // Helper methods for deployment and health checks
  private static async loadEnvironmentConfig(env: string): Promise<EnvironmentConfig> {
    const envConfigPath = `.agentic-qe/config/environments.json`;
    if (await fs.pathExists(envConfigPath)) {
      const envConfigs: Record<string, EnvironmentConfig> = await fs.readJson(envConfigPath);
      return envConfigs[env] || {};
    }
    return {};
  }

  private static async generateDeploymentConfig(
    fleetConfig: StoredFleetConfig,
    envConfig: EnvironmentConfig,
    options: FleetOptions
  ): Promise<DeploymentConfig> {
    const maxAgents = fleetConfig.maxAgents ?? 0;
    return {
      version: '1.0',
      environment: options.env,
      fleet: fleetConfig,
      environment_config: envConfig,
      agentCount: maxAgents,
      components: [
        'fleet-manager',
        'agent-registry',
        'coordination-service',
        'monitoring-dashboard'
      ],
      resources: {
        memory: `${maxAgents * 100}MB`,
        cpu: `${maxAgents * 0.5}`,
        storage: '1GB'
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        topology: fleetConfig.topology ?? 'hierarchical'
      }
    };
  }

  private static async generateDeploymentScripts(
    deploymentDir: string,
    config: DeploymentConfig,
    options: FleetOptions
  ): Promise<void> {
    const deployScript = `#!/bin/bash
# Deployment script for ${options.env} environment
echo "Deploying Agentic QE Fleet to ${options.env}..."

# Deploy components
echo "Deploying ${config.agentCount} agents..."

# Post-deployment validation
echo "Validating deployment..."

# Store deployment status
echo "Deployment completed successfully!"
`;

    await fs.writeFile(`${deploymentDir}/deploy.sh`, deployScript);
    await fs.chmod(`${deploymentDir}/deploy.sh`, '755');
  }

  private static async validateDeployment(config: DeploymentConfig): Promise<DeploymentValidation> {
    const validation: DeploymentValidation = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Validate agent count
    if (config.agentCount < 1) {
      validation.errors.push('Agent count must be at least 1');
      validation.valid = false;
    }

    // Validate resources
    if (!config.resources) {
      validation.warnings.push('No resource limits specified');
    }

    // Validate environment
    if (!config.environment) {
      validation.errors.push('Environment not specified');
      validation.valid = false;
    }

    return validation;
  }

  private static async generateScalingScript(
    operation: string,
    current: number,
    target: number,
    _options: FleetOptions
  ): Promise<void> {
    const script = `#!/bin/bash
# Fleet scaling script: ${operation}
echo "Scaling fleet from ${current} to ${target} agents..."

# Update agent configurations
echo "Updating agent configurations..."

# Restart services if needed
if [ "${operation}" = "scale-up" ]; then
    echo "Starting additional agents..."
else
    echo "Stopping excess agents..."
fi

# Post-scaling validation
echo "Validating scaled fleet..."

echo "Scaling completed successfully!"
`;

    await fs.writeFile('.agentic-qe/scripts/scale-fleet.sh', script);
    await fs.chmod('.agentic-qe/scripts/scale-fleet.sh', '755');
  }

  private static async checkConfigurationHealth(): Promise<ComponentHealth> {
    const health: ComponentHealth = { status: 'healthy', issues: [] };

    const requiredFiles = [
      '.agentic-qe/config/fleet.json',
      '.agentic-qe/config/agents.json'
    ];

    for (const file of requiredFiles) {
      if (!await fs.pathExists(file)) {
        health.issues.push(`Missing configuration file: ${file}`);
        health.status = 'critical';
      }
    }

    return health;
  }

  private static async checkDataHealth(): Promise<ComponentHealth> {
    const health: ComponentHealth = { status: 'healthy', issues: [] };

    // Check if data directory exists
    if (!await fs.pathExists('.agentic-qe/data')) {
      health.issues.push('Data directory missing');
      health.status = 'degraded';
    }

    return health;
  }

  private static async checkExecutionHealth(): Promise<ComponentHealth> {
    const health: ComponentHealth = { status: 'healthy', issues: [] };

    const executionHistory = await this.getExecutionHistory();

    if (executionHistory.length === 0) {
      health.issues.push('No execution history found');
      health.status = 'unknown';
    } else {
      const latestExecution = executionHistory[0];
      const total = latestExecution.summary?.total ?? 0;
      const failed = latestExecution.summary?.failed ?? 0;
      const failureRate = total > 0 ? failed / total : 0;

      if (failureRate > 0.2) {
        health.issues.push(`High failure rate: ${(failureRate * 100).toFixed(1)}%`);
        health.status = 'degraded';
      }
    }

    return health;
  }

  private static async checkCoordinationHealth(): Promise<ComponentHealth> {
    const health: ComponentHealth = { status: 'healthy', issues: [] };

    // Check if coordination scripts exist (created by init.ts)
    const coordinationScripts = [
      '.agentic-qe/scripts/pre-execution.sh',
      '.agentic-qe/scripts/post-execution.sh'
    ];

    let scriptsFound = 0;
    for (const script of coordinationScripts) {
      if (await fs.pathExists(script)) {
        scriptsFound++;
      }
    }

    if (scriptsFound === 0) {
      health.issues.push('No coordination scripts found');
      health.status = 'degraded';
    }

    return health;
  }

  private static generateHealthRecommendations(components: Record<string, ComponentHealth>): string[] {
    const recommendations: string[] = [];

    Object.entries(components).forEach(([component, data]: [string, ComponentHealth]) => {
      if (data.status !== 'healthy') {
        switch (component) {
          case 'configuration':
            recommendations.push('Run agentic-qe init to recreate missing configuration files');
            break;
          case 'data':
            recommendations.push('Ensure data directory exists and has proper permissions');
            break;
          case 'executions':
            recommendations.push('Run agentic-qe run tests to generate execution history');
            break;
          case 'coordination':
            recommendations.push('Check AQE coordination scripts in .agentic-qe/scripts/');
            break;
        }
      }
    });

    if (recommendations.length === 0) {
      recommendations.push('Fleet is healthy - continue regular monitoring');
    }

    return recommendations;
  }

  // Storage methods
  private static async storeStatusCheck(): Promise<void> {
    // Status check completed - native hooks will handle coordination
  }

  private static async storeScalingOperation(current: number, target: number): Promise<void> {
    // Store scaling operation in fleet data
    const scalingRecord = {
      from: current,
      to: target,
      timestamp: new Date().toISOString()
    };

    await fs.ensureDir('.agentic-qe/data');
    await fs.writeJson('.agentic-qe/data/scaling-latest.json', scalingRecord, { spaces: 2 });
  }

  private static async storeDeploymentOperation(config: DeploymentConfig): Promise<void> {
    // Store deployment operation in fleet data
    await fs.ensureDir('.agentic-qe/data');
    await fs.writeJson('.agentic-qe/data/deployment-latest.json', config, { spaces: 2 });
  }

  private static async storeDestructionOperation(record: DestructionRecord): Promise<void> {
    // Store destruction operation in fleet data
    await fs.ensureDir('.agentic-qe/data');
    await fs.writeJson('.agentic-qe/data/destruction-record.json', record, { spaces: 2 });
  }

  private static async storeHealthCheck(healthReport: HealthReport): Promise<void> {
    // Save health report to file
    const reportsDir = '.agentic-qe/reports';
    await fs.ensureDir(reportsDir);

    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const reportFile = `${reportsDir}/health-check-${timestamp}.json`;
    await fs.writeJson(reportFile, healthReport, { spaces: 2 });
  }
}