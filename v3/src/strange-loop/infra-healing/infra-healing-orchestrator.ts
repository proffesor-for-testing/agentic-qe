/**
 * Infrastructure Healing Orchestrator
 * ADR-057: Infrastructure Self-Healing Extension
 *
 * Top-level coordinator that wires TestOutputObserver, InfraActionExecutor,
 * RecoveryPlaybook, and CoordinationLock together. Provides a simple API:
 *
 *   const orchestrator = createInfraHealingOrchestrator({ ... });
 *   orchestrator.feedTestOutput(testStderr);
 *   const result = await orchestrator.runRecoveryCycle();
 *
 * Designed to work alongside (not replace) the existing StrangeLoopOrchestrator.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  InfraHealingConfig,
  InfraHealingStats,
  CommandRunner,
  ServiceRecoveryResult,
} from './types.js';
import { DEFAULT_INFRA_HEALING_CONFIG, createEmptyStats } from './types.js';
import { TestOutputObserver, createTestOutputObserver } from './test-output-observer.js';
import { RecoveryPlaybook, createRecoveryPlaybook } from './recovery-playbook.js';
import { CoordinationLock, createCoordinationLock } from './coordination-lock.js';
import { InfraActionExecutor, createInfraActionExecutor } from './infra-action-executor.js';
import type { InfraErrorSignature } from './types.js';

// ============================================================================
// Orchestrator Options
// ============================================================================

/**
 * Options for creating an InfraHealingOrchestrator.
 * All dependencies injected via this options object.
 */
export interface InfraHealingOrchestratorOptions {
  /** Command runner for shell execution (inject NoOpCommandRunner for tests) */
  commandRunner: CommandRunner;
  /** YAML playbook content (string) or path to YAML file */
  playbook: string;
  /** Whether playbook is a file path (true) or inline YAML (false) */
  playbookIsFile?: boolean;
  /** Custom error signatures (extends defaults) */
  customSignatures?: readonly InfraErrorSignature[];
  /** Variable overrides for playbook interpolation */
  variables?: Record<string, string>;
  /** Configuration overrides */
  config?: Partial<InfraHealingConfig>;
}

// ============================================================================
// Infrastructure Healing Orchestrator
// ============================================================================

/**
 * Orchestrates infrastructure self-healing during test execution.
 *
 * Usage:
 * 1. Create with createInfraHealingOrchestrator()
 * 2. Call feedTestOutput() with test runner stderr/stdout
 * 3. Call runRecoveryCycle() to detect and recover failing services
 * 4. Call getStats() to check recovery metrics
 */
export class InfraHealingOrchestrator {
  private readonly observer: TestOutputObserver;
  private readonly playbook: RecoveryPlaybook;
  private readonly lock: CoordinationLock;
  private readonly executor: InfraActionExecutor;
  private readonly config: InfraHealingConfig;
  private readonly stats: InfraHealingStats;
  private initialized = false;

  constructor(
    observer: TestOutputObserver,
    playbook: RecoveryPlaybook,
    lock: CoordinationLock,
    executor: InfraActionExecutor,
    config: InfraHealingConfig,
  ) {
    this.observer = observer;
    this.playbook = playbook;
    this.lock = lock;
    this.executor = executor;
    this.config = config;
    this.stats = createEmptyStats();
  }

  /**
   * Feed test output (stdout + stderr) for analysis.
   * Can be called multiple times — each call observes the new output.
   */
  feedTestOutput(output: string): void {
    const observation = this.observer.observe(output);
    this.stats.totalObservations++;
    this.stats.infraFailuresDetected += observation.infraFailures.length;

    // Update per-service failure counts
    for (const failure of observation.infraFailures) {
      if (failure.serviceName) {
        if (!this.stats.byService[failure.serviceName]) {
          this.stats.byService[failure.serviceName] = { failures: 0, recoveries: 0, successes: 0 };
        }
        this.stats.byService[failure.serviceName].failures++;
      }
    }
  }

  /**
   * Run a recovery cycle for all currently-failing services.
   * Returns recovery results for each service attempted.
   */
  async runRecoveryCycle(): Promise<readonly ServiceRecoveryResult[]> {
    const failingServices = this.observer.getFailingServices();
    if (failingServices.size === 0) return [];

    const results: ServiceRecoveryResult[] = [];
    let activeRecoveries = 0;

    for (const serviceName of failingServices) {
      if (activeRecoveries >= this.config.maxConcurrentRecoveries) break;

      // Skip if no playbook entry
      if (!this.playbook.getRecoveryPlan(serviceName)) continue;

      // Skip if already locked (recovery in progress)
      if (this.lock.isLocked(serviceName)) {
        this.stats.lockContentionEvents++;
        continue;
      }

      activeRecoveries++;
      const actionId = uuidv4();
      const result = await this.executor.recoverService(serviceName, actionId);
      results.push(result);

      // Merge executor stats
      this.mergeExecutorStats();
    }

    // Clear observation if all services recovered
    const stillFailing = this.observer.getFailingServices();
    if (stillFailing.size === 0) {
      this.observer.clearObservation();
    }

    return results;
  }

  /**
   * Get the test output observer (for wiring into InfraAwareAgentProvider).
   */
  getObserver(): TestOutputObserver {
    return this.observer;
  }

  /**
   * Get the recovery playbook (for wiring into InfraAwareAgentProvider).
   */
  getPlaybook(): RecoveryPlaybook {
    return this.playbook;
  }

  /**
   * Get the coordination lock.
   */
  getLock(): CoordinationLock {
    return this.lock;
  }

  /**
   * Get the infrastructure action executor.
   */
  getExecutor(): InfraActionExecutor {
    return this.executor;
  }

  /**
   * Get aggregated statistics.
   */
  getStats(): Readonly<InfraHealingStats> {
    this.mergeExecutorStats();
    return this.stats;
  }

  /**
   * Check if the orchestrator has been initialized with a loaded playbook.
   */
  isReady(): boolean {
    return this.playbook.isLoaded();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private mergeExecutorStats(): void {
    const execStats = this.executor.getStats();
    this.stats.recoveriesAttempted = execStats.recoveriesAttempted;
    this.stats.recoveriesSucceeded = execStats.recoveriesSucceeded;
    this.stats.recoveriesFailed = execStats.recoveriesFailed;

    // Merge per-service recovery stats from executor
    for (const [service, execServiceStats] of Object.entries(execStats.byService)) {
      if (!this.stats.byService[service]) {
        this.stats.byService[service] = { failures: 0, recoveries: 0, successes: 0 };
      }
      this.stats.byService[service].recoveries = execServiceStats.recoveries;
      this.stats.byService[service].successes = execServiceStats.successes;
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Factory function for creating a fully-wired InfraHealingOrchestrator.
 * Handles playbook loading, component creation, and dependency wiring.
 */
export async function createInfraHealingOrchestrator(
  options: InfraHealingOrchestratorOptions,
): Promise<InfraHealingOrchestrator> {
  const config: InfraHealingConfig = {
    ...DEFAULT_INFRA_HEALING_CONFIG,
    ...options.config,
  };

  // Create components
  const observer = createTestOutputObserver(options.customSignatures);
  const playbook = createRecoveryPlaybook(options.variables);
  const lock = createCoordinationLock(config.lockTtlMs);

  // Load playbook
  if (options.playbookIsFile !== false && !options.playbook.includes('\n')) {
    // Looks like a file path
    await playbook.loadFromFile(options.playbook);
  } else {
    // Inline YAML content
    playbook.loadFromString(options.playbook);
  }

  const executor = createInfraActionExecutor(options.commandRunner, playbook, lock);

  return new InfraHealingOrchestrator(observer, playbook, lock, executor, config);
}

/**
 * Synchronous factory for creating an InfraHealingOrchestrator with inline YAML.
 * Useful for tests where you don't want async setup.
 */
export function createInfraHealingOrchestratorSync(
  options: Omit<InfraHealingOrchestratorOptions, 'playbookIsFile'>,
): InfraHealingOrchestrator {
  const config: InfraHealingConfig = {
    ...DEFAULT_INFRA_HEALING_CONFIG,
    ...options.config,
  };

  const observer = createTestOutputObserver(options.customSignatures);
  const playbook = createRecoveryPlaybook(options.variables);
  const lock = createCoordinationLock(config.lockTtlMs);

  // Load inline YAML
  playbook.loadFromString(options.playbook);

  const executor = createInfraActionExecutor(options.commandRunner, playbook, lock);

  return new InfraHealingOrchestrator(observer, playbook, lock, executor, config);
}
