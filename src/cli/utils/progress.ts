/**
 * Progress Indicators for AQE v3 CLI
 *
 * Provides multi-bar progress for parallel agent operations,
 * spinners for async operations, and ETA estimation.
 *
 * Implementation per ADR-041 requirements.
 */

import cliProgress, { SingleBar, MultiBar, Presets } from 'cli-progress';
import ora, { Ora } from 'ora';
import chalk from 'chalk';
import { getCLIConfig, shouldUseColors } from '../config/cli-config.js';

// ============================================================================
// Types
// ============================================================================

export interface AgentProgress {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number; // 0-100
  eta?: number; // remaining ms
  message?: string;
}

export interface FleetProgressOptions {
  title?: string;
  showEta?: boolean;
  showPercentage?: boolean;
  format?: string;
}

export interface SpinnerOptions {
  text: string;
  color?: 'cyan' | 'green' | 'yellow' | 'red' | 'blue' | 'magenta' | 'white';
  spinner?: 'dots' | 'dots2' | 'dots3' | 'line' | 'star' | 'star2' | 'flip' | 'hamburger' | 'growVertical' | 'growHorizontal' | 'balloon' | 'balloon2' | 'noise' | 'bounce' | 'boxBounce' | 'boxBounce2' | 'triangle' | 'arc' | 'circle' | 'squareCorners' | 'circleQuarters' | 'circleHalves' | 'squish' | 'toggle' | 'toggle2' | 'toggle3' | 'toggle4' | 'toggle5' | 'toggle6' | 'toggle7' | 'toggle8' | 'toggle9' | 'toggle10' | 'toggle11' | 'toggle12' | 'toggle13' | 'arrow' | 'arrow2' | 'arrow3' | 'bouncingBar' | 'bouncingBall' | 'smiley' | 'monkey' | 'hearts' | 'clock' | 'earth' | 'material' | 'moon' | 'runner' | 'pong' | 'shark' | 'dqpb' | 'weather' | 'christmas' | 'grenade' | 'point' | 'layer' | 'betaWave';
}

export interface EtaEstimate {
  remainingMs: number;
  estimatedCompletion: Date;
  formatted: string;
}

// ============================================================================
// Fleet Progress Manager - Multi-bar progress for parallel agents
// ============================================================================

export class FleetProgressManager {
  private multiBar: MultiBar;
  private agentBars: Map<string, SingleBar> = new Map();
  private agentStates: Map<string, AgentProgress> = new Map();
  private fleetBar: SingleBar | null = null;
  private startTime: number = Date.now();
  private options: FleetProgressOptions;
  private isActive: boolean = false;

  constructor(options: FleetProgressOptions = {}) {
    // Load config-based defaults (ADR-041 config integration)
    const cliConfig = getCLIConfig();
    const useColors = shouldUseColors();

    this.options = {
      title: 'Fleet Progress',
      showEta: cliConfig.progress.showETA,
      showPercentage: true,
      ...options,
    };

    // Custom format for multi-bar display (respects color config)
    const barColor = useColors ? chalk.cyan('{bar}') : '{bar}';
    const format = this.options.format ||
      `{name} ${barColor} {percentage}% | {status} {eta}`;

    this.multiBar = new MultiBar({
      clearOnComplete: false,
      hideCursor: true,
      format,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      forceRedraw: true,
      fps: Math.round(1000 / cliConfig.progress.updateIntervalMs), // Use config update rate
    }, Presets.shades_classic);
  }

  /**
   * Start the fleet progress display
   */
  start(totalAgents: number): void {
    this.isActive = true;
    this.startTime = Date.now();

    // Create fleet-level progress bar
    console.log(chalk.blue(`\n${this.options.title}\n`));

    this.fleetBar = this.multiBar.create(100, 0, {
      name: chalk.white('Fleet Progress'.padEnd(30)),
      status: '',
      eta: '',
    });
  }

  /**
   * Add an agent to track
   */
  addAgent(agent: AgentProgress): void {
    if (!this.isActive) return;

    this.agentStates.set(agent.id, agent);

    const bar = this.multiBar.create(100, agent.progress, {
      name: chalk.gray(this.truncateName(agent.name, 30).padEnd(30)),
      status: this.getStatusIcon(agent.status),
      eta: agent.eta ? this.formatEta(agent.eta) : '',
    });

    this.agentBars.set(agent.id, bar);
    this.updateFleetProgress();
  }

  /**
   * Update an agent's progress
   */
  updateAgent(
    agentId: string,
    progress: number,
    options?: { status?: AgentProgress['status']; message?: string; eta?: number }
  ): void {
    if (!this.isActive) return;

    const state = this.agentStates.get(agentId);
    const bar = this.agentBars.get(agentId);

    if (!state || !bar) return;

    // Update state
    state.progress = Math.min(100, Math.max(0, progress));
    if (options?.status) state.status = options.status;
    if (options?.message) state.message = options.message;
    if (options?.eta !== undefined) state.eta = options.eta;

    // Update bar
    bar.update(state.progress, {
      name: this.getAgentNameDisplay(state),
      status: this.getStatusIcon(state.status),
      eta: state.eta ? this.formatEta(state.eta) : '',
    });

    this.updateFleetProgress();
  }

  /**
   * Mark an agent as completed
   */
  completeAgent(agentId: string, success: boolean = true): void {
    if (!this.isActive) return;

    const state = this.agentStates.get(agentId);
    const bar = this.agentBars.get(agentId);

    if (!state || !bar) return;

    state.status = success ? 'completed' : 'failed';
    state.progress = success ? 100 : state.progress;

    bar.update(state.progress, {
      name: this.getAgentNameDisplay(state),
      status: this.getStatusIcon(state.status),
      eta: '',
    });

    this.updateFleetProgress();
  }

  /**
   * Stop the progress display
   */
  stop(): void {
    if (!this.isActive) return;

    this.isActive = false;
    this.multiBar.stop();

    // Print summary
    const completed = Array.from(this.agentStates.values())
      .filter(a => a.status === 'completed').length;
    const failed = Array.from(this.agentStates.values())
      .filter(a => a.status === 'failed').length;
    const total = this.agentStates.size;
    const duration = Date.now() - this.startTime;

    console.log('');
    if (failed === 0) {
      console.log(chalk.green(`All ${completed}/${total} agents completed successfully (${this.formatDuration(duration)})`));
    } else {
      console.log(chalk.yellow(`${completed}/${total} agents completed, ${failed} failed (${this.formatDuration(duration)})`));
    }
    console.log('');
  }

  /**
   * Update the fleet-level progress bar
   */
  private updateFleetProgress(): void {
    if (!this.fleetBar) return;

    const agents = Array.from(this.agentStates.values());
    const totalProgress = agents.reduce((sum, a) => sum + a.progress, 0);
    const avgProgress = agents.length > 0 ? Math.round(totalProgress / agents.length) : 0;

    const completed = agents.filter(a => a.status === 'completed').length;
    const running = agents.filter(a => a.status === 'running').length;

    this.fleetBar.update(avgProgress, {
      status: chalk.gray(`${completed}/${agents.length} complete, ${running} running`),
      eta: this.options.showEta ? this.estimateFleetEta(agents) : '',
    });
  }

  private getAgentNameDisplay(agent: AgentProgress): string {
    const name = this.truncateName(agent.name, 26);
    switch (agent.status) {
      case 'completed':
        return chalk.green(name.padEnd(30));
      case 'failed':
        return chalk.red(name.padEnd(30));
      case 'running':
        return chalk.yellow(name.padEnd(30));
      default:
        return chalk.gray(name.padEnd(30));
    }
  }

  private getStatusIcon(status: AgentProgress['status']): string {
    switch (status) {
      case 'completed':
        return chalk.green('\u2713'); // checkmark
      case 'failed':
        return chalk.red('\u2717'); // X
      case 'running':
        return chalk.yellow('\u25B6'); // play
      default:
        return chalk.gray('\u25CB'); // circle
    }
  }

  private truncateName(name: string, maxLength: number): string {
    if (name.length <= maxLength) return name;
    return name.slice(0, maxLength - 3) + '...';
  }

  private formatEta(ms: number): string {
    if (ms <= 0) return '';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    return `${Math.round(ms / 3600000)}h`;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  }

  private estimateFleetEta(agents: AgentProgress[]): string {
    const incomplete = agents.filter(a => a.status === 'running' || a.status === 'pending');
    if (incomplete.length === 0) return '';

    // Use the longest individual ETA or estimate based on progress rate
    const etas = incomplete.map(a => a.eta || 0).filter(e => e > 0);
    if (etas.length > 0) {
      const maxEta = Math.max(...etas);
      return chalk.gray(`ETA: ${this.formatEta(maxEta)}`);
    }

    // Estimate based on elapsed time and progress
    const elapsed = Date.now() - this.startTime;
    const avgProgress = incomplete.reduce((sum, a) => sum + a.progress, 0) / incomplete.length;
    if (avgProgress > 0) {
      const estimatedTotal = elapsed / (avgProgress / 100);
      const remaining = Math.max(0, estimatedTotal - elapsed);
      return chalk.gray(`ETA: ${this.formatEta(remaining)}`);
    }

    return '';
  }
}

// ============================================================================
// Single Progress Bar - For simple operations
// ============================================================================

export class SimpleProgress {
  private bar: SingleBar;
  private startTime: number = Date.now();

  constructor(options: { title?: string; total?: number } = {}) {
    const format = `${options.title || 'Progress'} ${chalk.cyan('{bar}')} {percentage}% | {value}/{total} | {duration}s`;

    this.bar = new cliProgress.SingleBar({
      format,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      clearOnComplete: false,
    }, Presets.shades_classic);

    this.bar.start(options.total || 100, 0);
  }

  update(value: number): void {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
    this.bar.update(value, { duration });
  }

  increment(delta: number = 1): void {
    this.bar.increment(delta);
  }

  stop(): void {
    this.bar.stop();
    console.log('');
  }
}

// ============================================================================
// Spinner Utilities
// ============================================================================

export class SpinnerManager {
  private spinner: Ora | null = null;

  /**
   * Start a spinner with the given text
   */
  start(options: SpinnerOptions | string): Ora {
    const opts = typeof options === 'string' ? { text: options } : options;

    this.spinner = ora({
      text: opts.text,
      color: opts.color || 'cyan',
      spinner: opts.spinner || 'dots',
    });

    this.spinner.start();
    return this.spinner;
  }

  /**
   * Update the spinner text
   */
  update(text: string): void {
    if (this.spinner) {
      this.spinner.text = text;
    }
  }

  /**
   * Stop spinner with success
   */
  succeed(text?: string): void {
    if (this.spinner) {
      this.spinner.succeed(text);
      this.spinner = null;
    }
  }

  /**
   * Stop spinner with failure
   */
  fail(text?: string): void {
    if (this.spinner) {
      this.spinner.fail(text);
      this.spinner = null;
    }
  }

  /**
   * Stop spinner with warning
   */
  warn(text?: string): void {
    if (this.spinner) {
      this.spinner.warn(text);
      this.spinner = null;
    }
  }

  /**
   * Stop spinner with info
   */
  info(text?: string): void {
    if (this.spinner) {
      this.spinner.info(text);
      this.spinner = null;
    }
  }

  /**
   * Stop the spinner without any icon
   */
  stop(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }
}

/**
 * Create a spinner that automatically shows elapsed time
 */
export function createTimedSpinner(text: string): {
  spinner: Ora;
  stop: () => void;
  succeed: (msg?: string) => void;
  fail: (msg?: string) => void;
} {
  const startTime = Date.now();
  const spinner = ora({ text, color: 'cyan' }).start();

  const updateTimer = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    spinner.text = `${text} (${elapsed}s)`;
  }, 100);
  updateTimer.unref?.();

  const cleanup = () => {
    clearInterval(updateTimer);
  };

  return {
    spinner,
    stop: () => {
      cleanup();
      spinner.stop();
    },
    succeed: (msg?: string) => {
      cleanup();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      spinner.succeed(msg || `${text} (${elapsed}s)`);
    },
    fail: (msg?: string) => {
      cleanup();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      spinner.fail(msg || `${text} failed (${elapsed}s)`);
    },
  };
}

// ============================================================================
// ETA Estimation Utilities
// ============================================================================

export class EtaEstimator {
  private samples: Array<{ timestamp: number; progress: number }> = [];
  private startTime: number;
  private windowSize: number;

  constructor(windowSize: number = 10) {
    this.startTime = Date.now();
    this.windowSize = windowSize;
  }

  /**
   * Add a progress sample
   */
  addSample(progress: number): void {
    const now = Date.now();
    this.samples.push({ timestamp: now, progress });

    // Keep only recent samples for better accuracy
    if (this.samples.length > this.windowSize) {
      this.samples.shift();
    }
  }

  /**
   * Estimate remaining time based on progress rate
   */
  estimate(currentProgress: number): EtaEstimate | null {
    if (this.samples.length < 2 || currentProgress >= 100) {
      return null;
    }

    // Calculate average progress rate from samples
    const firstSample = this.samples[0];
    const lastSample = this.samples[this.samples.length - 1];
    const timeDiff = lastSample.timestamp - firstSample.timestamp;
    const progressDiff = lastSample.progress - firstSample.progress;

    if (timeDiff <= 0 || progressDiff <= 0) {
      return null;
    }

    const progressPerMs = progressDiff / timeDiff;
    const remainingProgress = 100 - currentProgress;
    const remainingMs = Math.round(remainingProgress / progressPerMs);

    const estimatedCompletion = new Date(Date.now() + remainingMs);

    return {
      remainingMs,
      estimatedCompletion,
      formatted: this.formatEta(remainingMs),
    };
  }

  /**
   * Get elapsed time
   */
  getElapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Format ETA for display
   */
  private formatEta(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) {
      const mins = Math.floor(ms / 60000);
      const secs = Math.round((ms % 60000) / 1000);
      return `${mins}m ${secs}s`;
    }
    const hours = Math.floor(ms / 3600000);
    const mins = Math.round((ms % 3600000) / 60000);
    return `${hours}h ${mins}m`;
  }

  /**
   * Reset the estimator
   */
  reset(): void {
    this.samples = [];
    this.startTime = Date.now();
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a simple spinner for async operations
 */
export function withSpinner<T>(
  text: string,
  operation: () => Promise<T>
): Promise<T> {
  const { spinner, succeed, fail } = createTimedSpinner(text);

  return operation()
    .then((result) => {
      succeed();
      return result;
    })
    .catch((error) => {
      fail();
      throw error;
    });
}

/**
 * Create a progress bar for a list of items
 */
export async function withProgress<T, R>(
  items: T[],
  title: string,
  operation: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const progress = new SimpleProgress({ title, total: items.length });
  const results: R[] = [];

  for (let i = 0; i < items.length; i++) {
    results.push(await operation(items[i], i));
    progress.update(i + 1);
  }

  progress.stop();
  return results;
}

/**
 * Track parallel operations with multi-bar progress
 */
export async function trackParallelOperations<T>(
  operations: Array<{
    id: string;
    name: string;
    operation: () => Promise<T>;
  }>,
  options?: FleetProgressOptions
): Promise<Array<{ id: string; result?: T; error?: Error }>> {
  const manager = new FleetProgressManager(options);
  manager.start(operations.length);

  // Add all agents as pending
  for (const op of operations) {
    manager.addAgent({
      id: op.id,
      name: op.name,
      status: 'pending',
      progress: 0,
    });
  }

  // Execute all operations in parallel
  const results = await Promise.all(
    operations.map(async (op) => {
      manager.updateAgent(op.id, 0, { status: 'running' });

      try {
        // Simulate progress updates (actual progress would come from the operation)
        const progressInterval = setInterval(() => {
          const currentAgent = manager['agentStates'].get(op.id);
          if (currentAgent && currentAgent.progress < 90) {
            manager.updateAgent(op.id, currentAgent.progress + 10);
          }
        }, 200);

        const result = await op.operation();

        clearInterval(progressInterval);
        manager.completeAgent(op.id, true);

        return { id: op.id, result };
      } catch (error) {
        manager.completeAgent(op.id, false);
        return { id: op.id, error: error as Error };
      }
    })
  );

  manager.stop();
  return results;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  FleetProgressManager,
  SimpleProgress,
  SpinnerManager,
  EtaEstimator,
  withSpinner,
  withProgress,
  trackParallelOperations,
  createTimedSpinner,
};
