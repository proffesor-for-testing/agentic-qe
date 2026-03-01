/**
 * Infrastructure Action Executor
 * ADR-057: Infrastructure Self-Healing Extension
 *
 * Executes infrastructure recovery using a health-check → recover → backoff → verify
 * cycle. Uses CommandRunner (DI) for shell execution so tests can inject NoOpCommandRunner.
 *
 * This is NOT an ActionExecutor implementation — it's the recovery engine that
 * CompositeActionExecutor delegates to for infrastructure-specific actions.
 */

import type {
  CommandRunner,
  CommandResult,
  ServiceRecoveryPlan,
  RecoveryAttemptResult,
  ServiceRecoveryResult,
  InfraHealingStats,
} from './types.js';
import { createEmptyStats } from './types.js';
import type { RecoveryPlaybook } from './recovery-playbook.js';
import type { CoordinationLock } from './coordination-lock.js';

// ============================================================================
// NoOp Command Runner (for testing)
// ============================================================================

/**
 * NoOp command runner for testing — follows existing NoOpActionExecutor pattern.
 * Returns configurable results per command.
 */
export class NoOpCommandRunner implements CommandRunner {
  private responses: Map<string, CommandResult> = new Map();
  private callLog: Array<{ command: string; timeoutMs: number }> = [];

  async run(command: string, timeoutMs: number): Promise<CommandResult> {
    this.callLog.push({ command, timeoutMs });

    const result =
      this.responses.get(command) ??
      this.findPrefixMatch(command) ??
      { exitCode: 0, stdout: '', stderr: '', durationMs: 10, timedOut: false };

    return result;
  }

  /** Configure a response for a specific command */
  setResponse(command: string, result: Partial<CommandResult>): void {
    this.responses.set(command, {
      exitCode: 0,
      stdout: '',
      stderr: '',
      durationMs: 10,
      timedOut: false,
      ...result,
    });
  }

  /** Get the call log for assertions */
  getCalls(): ReadonlyArray<{ command: string; timeoutMs: number }> {
    return this.callLog;
  }

  /** Clear call log and responses */
  reset(): void {
    this.callLog = [];
    this.responses.clear();
  }

  private findPrefixMatch(command: string): CommandResult | undefined {
    for (const [key, value] of this.responses) {
      if (command.startsWith(key)) return value;
    }
    return undefined;
  }
}

// ============================================================================
// Shell Command Runner (real implementation)
// ============================================================================

/**
 * Real command runner using child_process.execFile for security.
 * Wraps commands in sh -c for shell interpretation.
 */
export class ShellCommandRunner implements CommandRunner {
  async run(command: string, timeoutMs: number): Promise<CommandResult> {
    const { execFile } = await import('node:child_process');
    const startTime = Date.now();

    return new Promise<CommandResult>((resolve) => {
      const child = execFile(
        '/bin/sh',
        ['-c', command],
        { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - startTime;
          const timedOut = (error?.message?.includes('TIMEOUT') ||
            (error as NodeJS.ErrnoException)?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') ?? false;

          const errWithCode = error as NodeJS.ErrnoException & { code?: string | number } | null;
          const exitCode = error ? (typeof errWithCode?.code === 'number' ? errWithCode.code : 1) : 0;
          resolve({
            exitCode,
            stdout: stdout ?? '',
            stderr: stderr ?? '',
            durationMs,
            timedOut,
          });
        },
      );

      // Handle kill timeout
      child.on('error', () => {
        resolve({
          exitCode: 1,
          stdout: '',
          stderr: 'Process execution error',
          durationMs: Date.now() - startTime,
          timedOut: false,
        });
      });
    });
  }
}

// ============================================================================
// Infrastructure Action Executor
// ============================================================================

/**
 * Executes infrastructure recovery for a specific service using:
 * 1. Health check — confirm service is actually down
 * 2. Recovery commands — run in order
 * 3. Exponential backoff — wait between retries
 * 4. Verification — confirm service is back up
 */
export class InfraActionExecutor {
  private readonly runner: CommandRunner;
  private readonly playbook: RecoveryPlaybook;
  private readonly lock: CoordinationLock;
  private readonly stats: InfraHealingStats;

  constructor(
    runner: CommandRunner,
    playbook: RecoveryPlaybook,
    lock: CoordinationLock,
  ) {
    this.runner = runner;
    this.playbook = playbook;
    this.lock = lock;
    this.stats = createEmptyStats();
  }

  /**
   * Attempt to recover a service using its playbook entry.
   * Acquires a coordination lock to prevent duplicate recovery.
   */
  async recoverService(serviceName: string, actionId: string): Promise<ServiceRecoveryResult> {
    const plan = this.playbook.getRecoveryPlan(serviceName);
    if (!plan) {
      return {
        serviceName,
        recovered: false,
        totalAttempts: 0,
        attempts: [],
        totalDurationMs: 0,
        escalated: true,
        affectedTestIds: [],
      };
    }

    // Acquire lock
    const lockResult = this.lock.acquire(serviceName, actionId);
    if (!lockResult.acquired) {
      this.stats.lockContentionEvents++;
      return {
        serviceName,
        recovered: false,
        totalAttempts: 0,
        attempts: [],
        totalDurationMs: 0,
        escalated: false,
        affectedTestIds: [],
      };
    }

    const startTime = Date.now();
    const attempts: RecoveryAttemptResult[] = [];
    let recovered = false;

    try {
      this.stats.recoveriesAttempted++;
      this.updateServiceStats(serviceName, 'recoveries');

      for (let attempt = 1; attempt <= plan.maxRetries; attempt++) {
        const result = await this.executeRecoveryAttempt(plan, attempt);
        attempts.push(result);

        if (result.success) {
          recovered = true;
          this.stats.recoveriesSucceeded++;
          this.updateServiceStats(serviceName, 'successes');
          break;
        }

        // Backoff before next attempt (unless last attempt)
        if (attempt < plan.maxRetries) {
          const backoffMs = plan.backoffMs[attempt - 1] ?? plan.backoffMs[plan.backoffMs.length - 1] ?? 2000;
          await this.sleep(backoffMs);
        }
      }

      if (!recovered) {
        this.stats.recoveriesFailed++;
      }
    } finally {
      this.lock.release(serviceName, actionId);
    }

    return {
      serviceName,
      recovered,
      totalAttempts: attempts.length,
      attempts,
      totalDurationMs: Date.now() - startTime,
      escalated: !recovered,
      affectedTestIds: [],
    };
  }

  /**
   * Get recovery statistics.
   */
  getStats(): Readonly<InfraHealingStats> {
    return this.stats;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async executeRecoveryAttempt(
    plan: ServiceRecoveryPlan,
    attempt: number,
  ): Promise<RecoveryAttemptResult> {
    const startTime = Date.now();

    // 1. Health check — confirm service is actually down
    const healthCheckResult = await this.runner.run(
      plan.healthCheck.command,
      plan.healthCheck.timeoutMs,
    );

    // If health check passes, service is already up
    if (healthCheckResult.exitCode === 0) {
      return {
        serviceName: plan.serviceName,
        success: true,
        attempt,
        healthCheckResult,
        recoveryResults: [],
        durationMs: Date.now() - startTime,
        attemptedAt: startTime,
      };
    }

    // 2. Execute recovery commands in order
    const recoveryResults: CommandResult[] = [];
    for (const cmd of plan.recover) {
      const result = await this.runner.run(cmd.command, cmd.timeoutMs);
      recoveryResults.push(result);

      if (result.exitCode !== 0 && cmd.required) {
        return {
          serviceName: plan.serviceName,
          success: false,
          attempt,
          healthCheckResult,
          recoveryResults,
          durationMs: Date.now() - startTime,
          error: `Required recovery command failed: ${cmd.command}`,
          attemptedAt: startTime,
        };
      }
    }

    // 3. Verify recovery
    const verifyResult = await this.runner.run(
      plan.verify.command,
      plan.verify.timeoutMs,
    );

    const success = verifyResult.exitCode === 0;

    return {
      serviceName: plan.serviceName,
      success,
      attempt,
      healthCheckResult,
      recoveryResults,
      verifyResult,
      durationMs: Date.now() - startTime,
      error: success ? undefined : 'Verification failed after recovery',
      attemptedAt: startTime,
    };
  }

  private updateServiceStats(serviceName: string, field: 'failures' | 'recoveries' | 'successes'): void {
    if (!this.stats.byService[serviceName]) {
      this.stats.byService[serviceName] = { failures: 0, recoveries: 0, successes: 0 };
    }
    this.stats.byService[serviceName][field]++;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Factory function for creating an InfraActionExecutor.
 */
export function createInfraActionExecutor(
  runner: CommandRunner,
  playbook: RecoveryPlaybook,
  lock: CoordinationLock,
): InfraActionExecutor {
  return new InfraActionExecutor(runner, playbook, lock);
}
