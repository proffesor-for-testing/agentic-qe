/**
 * Provider Status Command - Health dashboard for LLM providers
 *
 * Displays real-time health status of all registered LLM providers
 * including circuit breaker states, latency, and availability metrics.
 *
 * Usage:
 *   aqe providers status [options]
 *
 * Options:
 *   --detailed    Show detailed metrics for each provider
 *   --json        Output in JSON format
 *   --watch       Continuously monitor provider health
 *   --interval    Watch interval in seconds (default: 10)
 *
 * @module cli/commands/providers/status
 * @version 1.0.0
 */

import chalk from 'chalk';
import {
  ProviderHealthMonitor,
  ProviderHealthState
} from '../../../monitoring/ProviderHealthMonitor';
import { QuotaManager, QuotaStatus, createQuotaManager } from '../../../monitoring/QuotaManager';

export interface ProviderStatusOptions {
  detailed?: boolean;
  json?: boolean;
  watch?: boolean;
  interval?: number;
}

export interface ProviderStatusReport {
  timestamp: string;
  overallHealth: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  providers: ProviderHealthInfo[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    circuitOpen: number;
  };
}

export interface ProviderHealthInfo {
  id: string;
  name: string;
  healthy: boolean;
  circuitState: 'closed' | 'open' | 'half-open';
  latency: number;
  errorRate: number;
  availability: number;
  lastCheck: string;
  quota?: {
    dailyUsed: number;
    dailyLimit: number;
    minuteUsed: number;
    minuteLimit: number;
    percentageUsed: number;
    isExhausted: boolean;
  };
  lastError?: string;
}

/**
 * Provider Status Command
 */
export class ProviderStatusCommand {
  private static healthMonitor?: ProviderHealthMonitor;
  private static quotaManager?: QuotaManager;
  private static watchIntervalId?: NodeJS.Timeout;

  /**
   * Execute the provider status command
   */
  static async execute(options: ProviderStatusOptions = {}): Promise<ProviderStatusReport> {
    // Initialize monitoring components if not already initialized
    await this.initializeMonitoring();

    if (options.watch) {
      return this.startWatchMode(options);
    }

    const report = await this.generateStatusReport(options.detailed);

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      this.displayStatusReport(report, options.detailed);
    }

    return report;
  }

  /**
   * Initialize health monitor and quota manager with default providers
   */
  private static async initializeMonitoring(): Promise<void> {
    if (!this.healthMonitor) {
      this.healthMonitor = new ProviderHealthMonitor({
        checkIntervalMs: 30000,
        timeoutMs: 5000,
        failureThreshold: 3,
        recoveryTimeMs: 60000,
        healthyLatencyThresholdMs: 3000
      });
    }

    if (!this.quotaManager) {
      this.quotaManager = createQuotaManager();
    }

    // Register default providers for health monitoring if not already registered
    await this.registerDefaultProviders();
  }

  /**
   * Register default providers for monitoring
   */
  private static async registerDefaultProviders(): Promise<void> {
    const providers = [
      { id: 'groq', name: 'Groq LPU', checkFn: async () => this.checkGroqHealth() },
      { id: 'github-models', name: 'GitHub Models', checkFn: async () => this.checkGitHubModelsHealth() },
      { id: 'ollama', name: 'Ollama (Local)', checkFn: async () => this.checkOllamaHealth() },
      { id: 'claude', name: 'Claude (Anthropic)', checkFn: async () => this.checkClaudeHealth() },
      { id: 'openrouter', name: 'OpenRouter', checkFn: async () => this.checkOpenRouterHealth() }
    ];

    for (const provider of providers) {
      const existing = this.healthMonitor?.getProviderHealth(provider.id);
      if (!existing) {
        this.healthMonitor?.registerProvider(provider.id, provider.checkFn);
      }
    }
  }

  /**
   * Generate status report for all providers
   */
  private static async generateStatusReport(detailed?: boolean): Promise<ProviderStatusReport> {
    // Perform health checks on all providers
    await this.healthMonitor?.checkAllProviders();

    const allHealth = this.healthMonitor?.getAllProviderHealth() || new Map();
    const providers: ProviderHealthInfo[] = [];

    const providerNames: Record<string, string> = {
      'groq': 'Groq LPU',
      'github-models': 'GitHub Models',
      'ollama': 'Ollama (Local)',
      'claude': 'Claude (Anthropic)',
      'openrouter': 'OpenRouter'
    };

    for (const [id, health] of allHealth.entries()) {
      const info: ProviderHealthInfo = {
        id,
        name: providerNames[id] || id,
        healthy: health.healthy,
        circuitState: health.circuitState,
        latency: health.latency,
        errorRate: health.errorRate,
        availability: health.availability,
        lastCheck: health.lastCheck.toISOString(),
        lastError: health.lastError
      };

      // Add quota info if available
      const quota = this.quotaManager?.getQuotaStatus(id);
      if (quota) {
        info.quota = {
          dailyUsed: quota.dailyUsed,
          dailyLimit: quota.dailyLimit === Infinity ? -1 : quota.dailyLimit,
          minuteUsed: quota.minuteUsed,
          minuteLimit: quota.minuteLimit === Infinity ? -1 : quota.minuteLimit,
          percentageUsed: quota.percentageUsed,
          isExhausted: quota.isExhausted
        };
      }

      providers.push(info);
    }

    // Calculate summary
    const summary = {
      total: providers.length,
      healthy: providers.filter(p => p.healthy && p.circuitState === 'closed').length,
      degraded: providers.filter(p => !p.healthy && p.circuitState === 'closed').length,
      unhealthy: providers.filter(p => !p.healthy && p.circuitState === 'open').length,
      circuitOpen: providers.filter(p => p.circuitState === 'open').length
    };

    // Determine overall health
    let overallHealth: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
    if (summary.total === 0) {
      overallHealth = 'unknown';
    } else if (summary.healthy === summary.total) {
      overallHealth = 'healthy';
    } else if (summary.healthy > 0) {
      overallHealth = 'degraded';
    } else {
      overallHealth = 'unhealthy';
    }

    return {
      timestamp: new Date().toISOString(),
      overallHealth,
      providers,
      summary
    };
  }

  /**
   * Display status report in console
   */
  private static displayStatusReport(report: ProviderStatusReport, detailed?: boolean): void {
    console.log(chalk.blue.bold('\n🏥 LLM Provider Health Dashboard\n'));

    // Overall status
    const statusColor = this.getHealthColor(report.overallHealth);
    console.log(chalk.blue('📊 Overall Status:'), statusColor(report.overallHealth.toUpperCase()));
    console.log(chalk.gray(`   Last updated: ${new Date(report.timestamp).toLocaleString()}`));

    // Summary
    console.log(chalk.blue('\n📈 Summary:'));
    console.log(`   Total Providers: ${chalk.white(report.summary.total)}`);
    console.log(`   Healthy: ${chalk.green(report.summary.healthy)}`);
    if (report.summary.degraded > 0) {
      console.log(`   Degraded: ${chalk.yellow(report.summary.degraded)}`);
    }
    if (report.summary.unhealthy > 0) {
      console.log(`   Unhealthy: ${chalk.red(report.summary.unhealthy)}`);
    }
    if (report.summary.circuitOpen > 0) {
      console.log(`   Circuit Open: ${chalk.red(report.summary.circuitOpen)}`);
    }

    // Provider details
    console.log(chalk.blue('\n🔌 Provider Status:\n'));

    for (const provider of report.providers) {
      this.displayProviderStatus(provider, detailed);
    }

    // Legend
    console.log(chalk.gray('\n📖 Legend:'));
    console.log(chalk.gray('   Circuit: ') + chalk.green('●') + ' closed  ' + chalk.yellow('●') + ' half-open  ' + chalk.red('●') + ' open');
    console.log(chalk.gray('   Quota: Unlimited = -1'));
  }

  /**
   * Display individual provider status
   */
  private static displayProviderStatus(provider: ProviderHealthInfo, detailed?: boolean): void {
    const healthIcon = provider.healthy ? chalk.green('✓') : chalk.red('✗');
    const circuitIcon = this.getCircuitIcon(provider.circuitState);
    const nameColor = provider.healthy ? chalk.white : chalk.red;

    console.log(`  ${healthIcon} ${nameColor(provider.name.padEnd(20))} ${circuitIcon}`);

    if (detailed) {
      console.log(chalk.gray(`     Latency: ${provider.latency.toFixed(0)}ms`));
      console.log(chalk.gray(`     Availability: ${(provider.availability * 100).toFixed(1)}%`));
      console.log(chalk.gray(`     Error Rate: ${(provider.errorRate * 100).toFixed(1)}%`));

      if (provider.quota) {
        const quotaBar = this.getQuotaBar(provider.quota.percentageUsed);
        const dailyLimit = provider.quota.dailyLimit === -1 ? '∞' : provider.quota.dailyLimit.toString();
        console.log(chalk.gray(`     Quota: ${provider.quota.dailyUsed}/${dailyLimit} daily ${quotaBar}`));
        if (provider.quota.isExhausted) {
          console.log(chalk.red('     ⚠ Quota exhausted!'));
        }
      }

      if (provider.lastError) {
        console.log(chalk.red(`     Last Error: ${provider.lastError}`));
      }
    } else {
      // Compact view with latency and availability
      const latencyColor = provider.latency < 1000 ? chalk.green : provider.latency < 3000 ? chalk.yellow : chalk.red;
      console.log(chalk.gray(`     Latency: ${latencyColor(provider.latency.toFixed(0) + 'ms')}  |  Avail: ${(provider.availability * 100).toFixed(0)}%`));
    }

    console.log('');
  }

  /**
   * Start watch mode for continuous monitoring
   */
  private static async startWatchMode(options: ProviderStatusOptions): Promise<ProviderStatusReport> {
    const intervalMs = (options.interval || 10) * 1000;

    console.log(chalk.blue.bold('\n🔄 Provider Health Watch Mode'));
    console.log(chalk.gray(`   Refreshing every ${options.interval || 10} seconds. Press Ctrl+C to stop.\n`));

    const display = async () => {
      console.clear();
      const report = await this.generateStatusReport(options.detailed);

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        this.displayStatusReport(report, options.detailed);
      }

      return report;
    };

    // Initial display
    let lastReport = await display();

    // Set up interval
    this.watchIntervalId = setInterval(async () => {
      lastReport = await display();
    }, intervalMs);

    // Handle cleanup
    process.on('SIGINT', () => {
      this.stopWatch();
      process.exit(0);
    });

    return lastReport;
  }

  /**
   * Stop watch mode
   */
  static stopWatch(): void {
    if (this.watchIntervalId) {
      clearInterval(this.watchIntervalId);
      this.watchIntervalId = undefined;
      console.log(chalk.yellow('\n\n👋 Watch mode stopped.\n'));
    }
  }

  /**
   * Get color for health status
   */
  private static getHealthColor(status: string): typeof chalk.green {
    const colors: Record<string, typeof chalk.green> = {
      'healthy': chalk.green,
      'degraded': chalk.yellow,
      'unhealthy': chalk.red,
      'unknown': chalk.gray
    };
    return colors[status] || chalk.white;
  }

  /**
   * Get circuit state icon
   */
  private static getCircuitIcon(state: string): string {
    const icons: Record<string, string> = {
      'closed': chalk.green('●') + ' closed',
      'open': chalk.red('●') + ' open',
      'half-open': chalk.yellow('●') + ' half-open'
    };
    return icons[state] || chalk.gray('●') + ' unknown';
  }

  /**
   * Get quota usage bar
   */
  private static getQuotaBar(percentage: number): string {
    const width = 10;
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;

    let color = chalk.green;
    if (percentage > 80) color = chalk.red;
    else if (percentage > 50) color = chalk.yellow;

    return `[${color('█'.repeat(filled))}${chalk.gray('░'.repeat(empty))}]`;
  }

  // Health check functions for each provider
  private static async checkGroqHealth(): Promise<{ healthy: boolean; timestamp: Date; error?: string }> {
    // Check GROQ_API_KEY environment variable
    const hasKey = !!process.env.GROQ_API_KEY;
    return {
      healthy: hasKey,
      timestamp: new Date(),
      error: hasKey ? undefined : 'GROQ_API_KEY not set'
    };
  }

  private static async checkGitHubModelsHealth(): Promise<{ healthy: boolean; timestamp: Date; error?: string }> {
    // Check if in Codespaces or GITHUB_TOKEN exists
    const inCodespaces = process.env.CODESPACES === 'true';
    const hasToken = !!process.env.GITHUB_TOKEN;
    const healthy = inCodespaces || hasToken;
    return {
      healthy,
      timestamp: new Date(),
      error: healthy ? undefined : 'Not in Codespaces and GITHUB_TOKEN not set'
    };
  }

  private static async checkOllamaHealth(): Promise<{ healthy: boolean; timestamp: Date; error?: string }> {
    try {
      const response = await fetch('http://localhost:11434/api/version', {
        signal: AbortSignal.timeout(2000)
      });
      return {
        healthy: response.ok,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        healthy: false,
        timestamp: new Date(),
        error: 'Ollama not running on localhost:11434'
      };
    }
  }

  private static async checkClaudeHealth(): Promise<{ healthy: boolean; timestamp: Date; error?: string }> {
    const hasKey = !!process.env.ANTHROPIC_API_KEY;
    return {
      healthy: hasKey,
      timestamp: new Date(),
      error: hasKey ? undefined : 'ANTHROPIC_API_KEY not set'
    };
  }

  private static async checkOpenRouterHealth(): Promise<{ healthy: boolean; timestamp: Date; error?: string }> {
    const hasKey = !!process.env.OPENROUTER_API_KEY;
    return {
      healthy: hasKey,
      timestamp: new Date(),
      error: hasKey ? undefined : 'OPENROUTER_API_KEY not set'
    };
  }

  /**
   * Cleanup resources
   */
  static cleanup(): void {
    this.stopWatch();
    this.healthMonitor?.stopMonitoring();
    this.healthMonitor = undefined;
    // Stop quota manager cleanup interval
    if (this.quotaManager) {
      this.quotaManager.stopCleanup();
    }
    this.quotaManager = undefined;
  }
}
