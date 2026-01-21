/**
 * Phase Scheduler - Simple State Machine
 *
 * This replaces the 890-line Kuramoto CPG oscillator with a ~100-line
 * state machine that does exactly what users need: run test phases
 * in order with quality gates.
 *
 * No oscillators. No coupling matrices. No crystals.
 * Just a state machine that runs tests.
 */

import type {
  TestPhase,
  PhaseResult,
  QualityThresholds,
  PhaseExecutor,
} from './interfaces';
import { DEFAULT_TEST_PHASES } from './interfaces';

// ============================================================================
// Scheduler State
// ============================================================================

export type SchedulerState = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

export interface SchedulerConfig {
  /** Test phases to execute */
  phases: TestPhase[];

  /** Stop on first phase failure? */
  failFast: boolean;

  /** Retry failed phases? */
  retryFailedPhases: boolean;

  /** Max retries per phase */
  maxRetries: number;

  /** Callback when phase completes */
  onPhaseComplete?: (result: PhaseResult) => void;

  /** Callback when all phases complete */
  onAllComplete?: (results: PhaseResult[]) => void;

  /** Callback on error */
  onError?: (error: Error, phase: TestPhase) => void;
}

export interface SchedulerStats {
  state: SchedulerState;
  currentPhaseIndex: number;
  totalPhases: number;
  completedPhases: number;
  failedPhases: number;
  results: PhaseResult[];
  startTime?: Date;
  endTime?: Date;
  durationMs?: number;
}

// ============================================================================
// Phase Scheduler Implementation
// ============================================================================

export class PhaseScheduler {
  private state: SchedulerState = 'idle';
  private currentPhaseIndex = 0;
  private results: PhaseResult[] = [];
  private startTime?: Date;
  private endTime?: Date;
  private abortController?: AbortController;

  constructor(
    private readonly executor: PhaseExecutor,
    private readonly config: SchedulerConfig = {
      phases: DEFAULT_TEST_PHASES,
      failFast: true,
      retryFailedPhases: false,
      maxRetries: 1,
    }
  ) {}

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Run all test phases sequentially
   */
  async run(): Promise<PhaseResult[]> {
    if (this.state === 'running') {
      throw new Error('Scheduler is already running');
    }

    this.state = 'running';
    this.currentPhaseIndex = 0;
    this.results = [];
    this.startTime = new Date();
    this.abortController = new AbortController();

    try {
      for (const phase of this.config.phases) {
        // Check if paused (pause() can be called externally during execution)
        // Use type assertion because TS narrows this.state after assignment above
        if ((this.state as SchedulerState) === 'paused') {
          await this.waitForResume();
        }

        if (this.abortController.signal.aborted) {
          break;
        }

        const result = await this.executePhaseWithRetry(phase);
        this.results.push(result);
        this.currentPhaseIndex++;

        this.config.onPhaseComplete?.(result);

        if (!result.success && this.config.failFast) {
          this.state = 'failed';
          break;
        }
      }

      this.endTime = new Date();
      this.state = this.results.every((r) => r.success) ? 'completed' : 'failed';
      this.config.onAllComplete?.(this.results);

      return this.results;
    } catch (error) {
      this.state = 'failed';
      this.endTime = new Date();
      throw error;
    }
  }

  /**
   * Run a specific phase by ID
   */
  async runPhase(phaseId: string): Promise<PhaseResult> {
    const phase = this.config.phases.find((p) => p.id === phaseId);
    if (!phase) {
      throw new Error(`Phase not found: ${phaseId}`);
    }

    return this.executePhaseWithRetry(phase);
  }

  /**
   * Pause execution after current phase completes
   */
  pause(): void {
    if (this.state === 'running') {
      this.state = 'paused';
    }
  }

  /**
   * Resume paused execution
   */
  resume(): void {
    if (this.state === 'paused') {
      this.state = 'running';
    }
  }

  /**
   * Abort execution immediately
   */
  async abort(): Promise<void> {
    this.abortController?.abort();
    await this.executor.abort();
    this.state = 'idle';
  }

  /**
   * Get current scheduler stats
   */
  getStats(): SchedulerStats {
    const durationMs =
      this.startTime && this.endTime
        ? this.endTime.getTime() - this.startTime.getTime()
        : this.startTime
          ? Date.now() - this.startTime.getTime()
          : undefined;

    return {
      state: this.state,
      currentPhaseIndex: this.currentPhaseIndex,
      totalPhases: this.config.phases.length,
      completedPhases: this.results.filter((r) => r.success).length,
      failedPhases: this.results.filter((r) => !r.success).length,
      results: [...this.results],
      startTime: this.startTime,
      endTime: this.endTime,
      durationMs,
    };
  }

  /**
   * Check if scheduler is ready to run
   */
  async isReady(): Promise<boolean> {
    return this.executor.isReady();
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private async executePhaseWithRetry(phase: TestPhase): Promise<PhaseResult> {
    let lastResult: PhaseResult | undefined;
    const maxAttempts = this.config.retryFailedPhases ? this.config.maxRetries : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        lastResult = await this.executor.execute(phase);

        if (lastResult.success || !this.config.retryFailedPhases) {
          return lastResult;
        }
      } catch (error) {
        this.config.onError?.(error as Error, phase);

        if (attempt === maxAttempts) {
          return this.createErrorResult(phase, error as Error);
        }
      }
    }

    return lastResult!;
  }

  private createErrorResult(phase: TestPhase, error: Error): PhaseResult {
    return {
      phaseId: phase.id,
      phaseName: phase.name,
      success: false,
      passRate: 0,
      flakyRatio: 0,
      coverage: 0,
      durationMs: 0,
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      testResults: [],
      flakyTests: [],
      error: error.message,
    };
  }

  private waitForResume(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.state !== 'paused') {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a phase scheduler with default configuration
 */
export function createPhaseScheduler(
  executor: PhaseExecutor,
  config?: Partial<SchedulerConfig>
): PhaseScheduler {
  return new PhaseScheduler(executor, {
    phases: DEFAULT_TEST_PHASES,
    failFast: true,
    retryFailedPhases: false,
    maxRetries: 1,
    ...config,
  });
}

/**
 * Check if quality thresholds are met
 */
export function checkQualityThresholds(
  result: PhaseResult,
  thresholds: QualityThresholds
): boolean {
  return (
    result.passRate >= thresholds.minPassRate &&
    result.flakyRatio <= thresholds.maxFlakyRatio &&
    result.coverage >= thresholds.minCoverage
  );
}
