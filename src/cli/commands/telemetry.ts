/**
 * Telemetry CLI Commands
 *
 * Commands for querying and monitoring telemetry data including metrics,
 * traces, token usage, and system status.
 */

import chalk from 'chalk';
import { getCostTracker, TokenMetrics } from '../../telemetry/metrics/collectors/cost';
import { getSystemMetrics } from '../../telemetry/metrics/system-metrics';
import { isTelemetryInitialized, defaultTelemetryConfig } from '../../telemetry/bootstrap';
import { trace, context } from '@opentelemetry/api';

/**
 * Display telemetry status
 *
 * Shows whether telemetry is initialized and configured
 */
export async function statusCommand(options: { json?: boolean }): Promise<void> {
  const status = {
    initialized: isTelemetryInitialized(),
    serviceName: defaultTelemetryConfig.serviceName,
    serviceVersion: defaultTelemetryConfig.serviceVersion,
    environment: defaultTelemetryConfig.environment,
    otlpEndpoint: defaultTelemetryConfig.otlpEndpoint || 'not configured',
    metricsEndpoint: defaultTelemetryConfig.metricsEndpoint || defaultTelemetryConfig.otlpEndpoint || 'not configured',
    exporters: {
      console: defaultTelemetryConfig.enableConsoleExport || false,
      grpc: defaultTelemetryConfig.useGrpc || false,
      autoInstrumentation: defaultTelemetryConfig.enableAutoInstrumentation !== false,
    },
    config: {
      traceSampleRate: defaultTelemetryConfig.traceSampleRate || 1.0,
      metricExportInterval: `${(defaultTelemetryConfig.metricExportInterval || 60000) / 1000}s`,
    },
  };

  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  // Display formatted status
  console.log(chalk.blue.bold('\n📊 Telemetry Status\n'));

  const statusIcon = status.initialized ? chalk.green('✅') : chalk.red('❌');
  console.log(`${statusIcon} Initialized: ${chalk.bold(status.initialized ? 'Yes' : 'No')}`);

  console.log(chalk.blue('\n🔧 Configuration:'));
  console.log(`  Service:     ${chalk.cyan(status.serviceName)} v${status.serviceVersion}`);
  console.log(`  Environment: ${chalk.cyan(status.environment)}`);
  console.log(`  OTLP:        ${chalk.cyan(status.otlpEndpoint)}`);
  console.log(`  Metrics:     ${chalk.cyan(status.metricsEndpoint)}`);

  console.log(chalk.blue('\n📤 Exporters:'));
  console.log(`  Console:     ${status.exporters.console ? chalk.green('✅ Enabled') : chalk.gray('❌ Disabled')}`);
  console.log(`  gRPC:        ${status.exporters.grpc ? chalk.green('✅ Enabled') : chalk.yellow('⚠️  HTTP')}`);
  console.log(`  Auto-Instr:  ${status.exporters.autoInstrumentation ? chalk.green('✅ Enabled') : chalk.gray('❌ Disabled')}`);

  console.log(chalk.blue('\n⚙️  Settings:'));
  console.log(`  Trace Sample Rate: ${chalk.cyan((status.config.traceSampleRate * 100).toFixed(0) + '%')}`);
  console.log(`  Metric Interval:   ${chalk.cyan(status.config.metricExportInterval)}\n`);
}

/**
 * Query and display metrics
 *
 * Shows various metrics including token usage, costs, and system metrics
 */
export async function metricsCommand(
  metricName?: string,
  options: { json?: boolean; agent?: string } = {}
): Promise<void> {
  const costTracker = getCostTracker();

  // If specific metric requested, handle it
  if (metricName) {
    switch (metricName.toLowerCase()) {
      case 'tokens':
        await showTokenMetrics(options);
        return;
      case 'cost':
      case 'costs':
        await showCostMetrics(options);
        return;
      case 'system':
        await showSystemMetrics(options);
        return;
      default:
        console.error(chalk.red(`❌ Unknown metric: ${metricName}`));
        console.log(chalk.yellow('\nAvailable metrics: tokens, cost, system'));
        process.exit(1);
    }
  }

  // Show all metrics summary
  if (options.json) {
    const fleetMetrics = costTracker.getFleetMetrics();
    const allAgentMetricsMap = costTracker.getAllAgentMetrics();
    const allAgentMetrics: TokenMetrics[] = [];
    allAgentMetricsMap.forEach(value => allAgentMetrics.push(value));

    console.log(JSON.stringify({
      fleet: fleetMetrics,
      agents: allAgentMetrics,
      timestamp: Date.now(),
    }, null, 2));
    return;
  }

  // Display formatted summary
  console.log(chalk.blue.bold('\n📊 Fleet Metrics Summary\n'));

  const fleetMetrics = costTracker.getFleetMetrics();
  if (!fleetMetrics) {
    console.log(chalk.yellow('⚠️  No metrics available yet. Run some agents first.'));
    return;
  }

  // Fleet-wide metrics
  console.log(chalk.blue('🌐 Fleet-Wide:'));
  console.table({
    'Total Tokens': {
      Input: fleetMetrics.tokens.inputTokens.toLocaleString(),
      Output: fleetMetrics.tokens.outputTokens.toLocaleString(),
      Total: fleetMetrics.tokens.totalTokens.toLocaleString(),
    },
    'Total Cost': {
      Input: `$${fleetMetrics.cost.inputCost.toFixed(4)}`,
      Output: `$${fleetMetrics.cost.outputCost.toFixed(4)}`,
      Total: chalk.bold(`$${fleetMetrics.cost.totalCost.toFixed(4)}`),
    },
  });

  if (fleetMetrics.cost.cacheSavings && fleetMetrics.cost.cacheSavings > 0) {
    console.log(chalk.green(`💰 Cache Savings: $${fleetMetrics.cost.cacheSavings.toFixed(4)}`));
  }

  // Per-agent breakdown
  const agentMetricsMap = costTracker.getAllAgentMetrics();
  const agentMetrics: TokenMetrics[] = [];
  agentMetricsMap.forEach(value => agentMetrics.push(value));

  if (agentMetrics.length > 0) {
    console.log(chalk.blue('\n🤖 Per-Agent Breakdown:'));

    const agentData = agentMetrics.reduce((acc, m) => {
      acc[m.id] = {
        Tokens: m.tokens.totalTokens.toLocaleString(),
        Cost: `$${m.cost.totalCost.toFixed(4)}`,
        Provider: m.provider,
        Model: m.model,
      };
      return acc;
    }, {} as Record<string, any>);

    console.table(agentData);
  }

  console.log();
}

/**
 * Show token usage metrics
 */
async function showTokenMetrics(options: { json?: boolean; agent?: string }): Promise<void> {
  const costTracker = getCostTracker();

  if (options.agent) {
    const metrics = costTracker.getAgentMetrics(options.agent);
    if (!metrics) {
      console.error(chalk.red(`❌ No metrics found for agent: ${options.agent}`));
      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify(metrics.tokens, null, 2));
      return;
    }

    console.log(chalk.blue.bold(`\n🎯 Token Usage: ${options.agent}\n`));
    console.table({
      'Input Tokens': metrics.tokens.inputTokens.toLocaleString(),
      'Output Tokens': metrics.tokens.outputTokens.toLocaleString(),
      'Cache Write': (metrics.tokens.cacheCreationTokens || 0).toLocaleString(),
      'Cache Read': (metrics.tokens.cacheReadTokens || 0).toLocaleString(),
      'Total': chalk.bold(metrics.tokens.totalTokens.toLocaleString()),
    });
    return;
  }

  // Show fleet-wide token usage
  const fleetMetrics = costTracker.getFleetMetrics();
  if (!fleetMetrics) {
    console.log(chalk.yellow('⚠️  No token metrics available yet.'));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(fleetMetrics.tokens, null, 2));
    return;
  }

  console.log(chalk.blue.bold('\n🔢 Fleet Token Usage\n'));
  console.table({
    Type: {
      'Input': fleetMetrics.tokens.inputTokens.toLocaleString(),
      'Output': fleetMetrics.tokens.outputTokens.toLocaleString(),
      'Cache Write': (fleetMetrics.tokens.cacheCreationTokens || 0).toLocaleString(),
      'Cache Read': (fleetMetrics.tokens.cacheReadTokens || 0).toLocaleString(),
      'Total': chalk.bold(fleetMetrics.tokens.totalTokens.toLocaleString()),
    },
  });
  console.log();
}

/**
 * Show cost metrics
 */
async function showCostMetrics(options: { json?: boolean; agent?: string }): Promise<void> {
  const costTracker = getCostTracker();

  if (options.agent) {
    const metrics = costTracker.getAgentMetrics(options.agent);
    if (!metrics) {
      console.error(chalk.red(`❌ No metrics found for agent: ${options.agent}`));
      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify(metrics.cost, null, 2));
      return;
    }

    console.log(chalk.blue.bold(`\n💰 Cost Breakdown: ${options.agent}\n`));
    console.table({
      'Input Cost': `$${metrics.cost.inputCost.toFixed(6)}`,
      'Output Cost': `$${metrics.cost.outputCost.toFixed(6)}`,
      'Cache Write': `$${(metrics.cost.cacheWriteCost || 0).toFixed(6)}`,
      'Cache Read': `$${(metrics.cost.cacheReadCost || 0).toFixed(6)}`,
      'Total': chalk.bold(`$${metrics.cost.totalCost.toFixed(6)}`),
      'Cache Savings': metrics.cost.cacheSavings
        ? chalk.green(`$${metrics.cost.cacheSavings.toFixed(6)}`)
        : '$0.000000',
    });
    return;
  }

  // Show fleet-wide costs
  const fleetMetrics = costTracker.getFleetMetrics();
  if (!fleetMetrics) {
    console.log(chalk.yellow('⚠️  No cost metrics available yet.'));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(fleetMetrics.cost, null, 2));
    return;
  }

  console.log(chalk.blue.bold('\n💸 Fleet Cost Breakdown\n'));
  console.table({
    Component: {
      'Input': `$${fleetMetrics.cost.inputCost.toFixed(4)}`,
      'Output': `$${fleetMetrics.cost.outputCost.toFixed(4)}`,
      'Cache Write': `$${(fleetMetrics.cost.cacheWriteCost || 0).toFixed(4)}`,
      'Cache Read': `$${(fleetMetrics.cost.cacheReadCost || 0).toFixed(4)}`,
      'Total': chalk.bold(`$${fleetMetrics.cost.totalCost.toFixed(4)}`),
    },
  });

  if (fleetMetrics.cost.cacheSavings && fleetMetrics.cost.cacheSavings > 0) {
    console.log(chalk.green(`\n💰 Total Cache Savings: $${fleetMetrics.cost.cacheSavings.toFixed(4)}`));
    const savingsPercent = (fleetMetrics.cost.cacheSavings / (fleetMetrics.cost.totalCost + fleetMetrics.cost.cacheSavings)) * 100;
    console.log(chalk.green(`   Savings Rate: ${savingsPercent.toFixed(1)}%\n`));
  } else {
    console.log();
  }
}

/**
 * Show system metrics
 */
async function showSystemMetrics(options: { json?: boolean }): Promise<void> {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  const metrics = {
    memory: {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
      external: memUsage.external,
      heapUsedMB: (memUsage.heapUsed / 1024 / 1024).toFixed(2),
      heapTotalMB: (memUsage.heapTotal / 1024 / 1024).toFixed(2),
      rssMB: (memUsage.rss / 1024 / 1024).toFixed(2),
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
      userMs: (cpuUsage.user / 1000).toFixed(2),
      systemMs: (cpuUsage.system / 1000).toFixed(2),
    },
    uptime: {
      seconds: process.uptime(),
      formatted: formatUptime(process.uptime()),
    },
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  };

  if (options.json) {
    console.log(JSON.stringify(metrics, null, 2));
    return;
  }

  console.log(chalk.blue.bold('\n💻 System Metrics\n'));

  console.log(chalk.blue('Memory Usage:'));
  console.table({
    'Heap Used': `${metrics.memory.heapUsedMB} MB`,
    'Heap Total': `${metrics.memory.heapTotalMB} MB`,
    'RSS': `${metrics.memory.rssMB} MB`,
    'Usage': `${((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(1)}%`,
  });

  console.log(chalk.blue('CPU Usage:'));
  console.table({
    'User': `${metrics.cpu.userMs} ms`,
    'System': `${metrics.cpu.systemMs} ms`,
    'Total': `${(parseFloat(metrics.cpu.userMs) + parseFloat(metrics.cpu.systemMs)).toFixed(2)} ms`,
  });

  console.log(chalk.blue('Process Info:'));
  console.log(`  PID:      ${metrics.process.pid}`);
  console.log(`  Node:     ${metrics.process.nodeVersion}`);
  console.log(`  Platform: ${metrics.process.platform} (${metrics.process.arch})`);
  console.log(`  Uptime:   ${metrics.uptime.formatted}\n`);
}

/**
 * View trace by ID or recent traces by agent
 */
export async function traceCommand(
  traceId?: string,
  options: { agent?: string; limit?: number; json?: boolean } = {}
): Promise<void> {
  // Note: This is a placeholder for actual trace viewing functionality
  // In a production system, this would query the OTLP backend or local trace storage

  if (options.json) {
    console.log(JSON.stringify({
      error: 'Trace viewing requires OTLP backend configuration',
      suggestion: 'Configure OTEL_EXPORTER_OTLP_ENDPOINT to enable trace viewing',
    }, null, 2));
    return;
  }

  console.log(chalk.yellow('\n⚠️  Trace Viewing\n'));
  console.log('Trace viewing requires an OpenTelemetry backend (Jaeger, Zipkin, etc.)');
  console.log('\nTo enable trace viewing:');
  console.log(chalk.cyan('  1. Set up an OTLP collector or backend'));
  console.log(chalk.cyan('  2. Configure OTEL_EXPORTER_OTLP_ENDPOINT environment variable'));
  console.log(chalk.cyan('  3. Restart the fleet with telemetry enabled'));
  console.log('\nExample backends:');
  console.log('  • Jaeger:  https://www.jaegertracing.io/');
  console.log('  • Zipkin:  https://zipkin.io/');
  console.log('  • Grafana: https://grafana.com/oss/tempo/\n');

  if (traceId) {
    console.log(chalk.gray(`Looking for trace: ${traceId}`));
  }

  if (options.agent) {
    console.log(chalk.gray(`Filtering by agent: ${options.agent}`));
  }

  console.log(chalk.gray('\nTrace data will be available once backend is configured.\n'));
}

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * Export Prometheus metrics
 */
export async function exportPrometheusCommand(): Promise<void> {
  const costTracker = getCostTracker();
  const prometheusMetrics = costTracker.exportPrometheusMetrics();

  console.log(prometheusMetrics);
}
