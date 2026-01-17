/**
 * ExecutionRecorder - Hooks into agent execution for automatic capture
 *
 * Integrates with AgentRegistry to automatically capture all agent
 * executions for the learning pipeline.
 *
 * Part of the Nightly-Learner Phase 1 implementation.
 *
 * @version 1.0.0
 * @module src/learning/capture/ExecutionRecorder
 */

import { EventEmitter } from 'events';
import { ExperienceCapture, AgentExecutionEvent, CapturedExperience } from './ExperienceCapture';
import { Logger } from '../../utils/Logger';

export interface ExecutionRecorderConfig {
  /** Filter agent types to record. Default: all */
  agentTypeFilter?: string[];
  /** Filter task types to record. Default: all */
  taskTypeFilter?: string[];
  /** Minimum duration to record (ms). Default: 0 */
  minDuration?: number;
  /** Only record successful executions. Default: false */
  successOnly?: boolean;
  /** Enable debug logging */
  debug?: boolean;
}

export interface RecordedExecution {
  experience: CapturedExperience;
  recordedAt: Date;
  filtered: boolean;
  filterReason?: string;
}

/**
 * ExecutionRecorder automatically records agent executions
 *
 * @example
 * ```typescript
 * const capture = new ExperienceCapture();
 * const recorder = new ExecutionRecorder(capture, {
 *   agentTypeFilter: ['test-generator', 'coverage-analyzer'],
 * });
 *
 * await recorder.start();
 *
 * // Later, record an execution
 * recorder.recordExecution({
 *   agentId: 'agent-123',
 *   // ...
 * });
 * ```
 */
export class ExecutionRecorder extends EventEmitter {
  private capture: ExperienceCapture;
  private config: Required<ExecutionRecorderConfig>;
  private logger: Logger;
  private isRunning: boolean = false;
  private recordCount: number = 0;
  private filterCount: number = 0;

  constructor(capture: ExperienceCapture, config?: ExecutionRecorderConfig) {
    super();
    this.capture = capture;
    this.logger = Logger.getInstance();

    this.config = {
      agentTypeFilter: config?.agentTypeFilter || [],
      taskTypeFilter: config?.taskTypeFilter || [],
      minDuration: config?.minDuration ?? 0,
      successOnly: config?.successOnly ?? false,
      debug: config?.debug ?? false,
    };
  }

  /**
   * Start recording executions
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('[ExecutionRecorder] Already running');
      return;
    }

    this.isRunning = true;

    this.logger.info('[ExecutionRecorder] Started', {
      agentTypeFilter: this.config.agentTypeFilter.length > 0 ? this.config.agentTypeFilter : 'all',
      taskTypeFilter: this.config.taskTypeFilter.length > 0 ? this.config.taskTypeFilter : 'all',
      successOnly: this.config.successOnly,
    });

    this.emit('started');
  }

  /**
   * Stop recording
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    this.logger.info('[ExecutionRecorder] Stopped', {
      recordCount: this.recordCount,
      filterCount: this.filterCount,
    });

    this.emit('stopped');
  }

  /**
   * Record an agent execution
   */
  async recordExecution(event: AgentExecutionEvent): Promise<RecordedExecution | null> {
    if (!this.isRunning) {
      this.logger.warn('[ExecutionRecorder] Not running, cannot record');
      return null;
    }

    // Check filters
    const filterResult = this.shouldRecord(event);
    if (!filterResult.shouldRecord) {
      this.filterCount++;

      if (this.config.debug) {
        this.logger.debug('[ExecutionRecorder] Execution filtered', {
          agentType: event.agentType,
          reason: filterResult.reason,
        });
      }

      return {
        experience: null as any,
        recordedAt: new Date(),
        filtered: true,
        filterReason: filterResult.reason,
      };
    }

    try {
      const experienceId = await this.capture.captureExecution(event);
      this.recordCount++;

      if (this.config.debug) {
        this.logger.debug('[ExecutionRecorder] Execution recorded', {
          experienceId,
          agentType: event.agentType,
          taskType: event.taskType,
        });
      }

      this.emit('recorded', { experienceId, event });

      return {
        experience: { id: experienceId } as CapturedExperience,
        recordedAt: new Date(),
        filtered: false,
      };
    } catch (error) {
      this.logger.error('[ExecutionRecorder] Failed to record execution', { error });
      this.emit('error', error);
      return null;
    }
  }

  /**
   * Create a hook function for AgentRegistry integration
   */
  createAgentHook(): (event: AgentExecutionEvent) => Promise<void> {
    return async (event: AgentExecutionEvent) => {
      await this.recordExecution(event);
    };
  }

  /**
   * Check if an execution should be recorded
   */
  private shouldRecord(event: AgentExecutionEvent): { shouldRecord: boolean; reason?: string } {
    // Check agent type filter
    if (this.config.agentTypeFilter.length > 0) {
      if (!this.config.agentTypeFilter.includes(event.agentType)) {
        return { shouldRecord: false, reason: `Agent type ${event.agentType} not in filter` };
      }
    }

    // Check task type filter
    if (this.config.taskTypeFilter.length > 0) {
      if (!this.config.taskTypeFilter.includes(event.taskType)) {
        return { shouldRecord: false, reason: `Task type ${event.taskType} not in filter` };
      }
    }

    // Check minimum duration
    if (event.duration < this.config.minDuration) {
      return { shouldRecord: false, reason: `Duration ${event.duration}ms below minimum ${this.config.minDuration}ms` };
    }

    // Check success only
    if (this.config.successOnly && !event.success) {
      return { shouldRecord: false, reason: 'Only recording successful executions' };
    }

    return { shouldRecord: true };
  }

  /**
   * Get recording statistics
   */
  getStats(): { recordCount: number; filterCount: number; captureStats: any } {
    return {
      recordCount: this.recordCount,
      filterCount: this.filterCount,
      captureStats: this.capture.getStats(),
    };
  }

  /**
   * Update filter configuration
   */
  updateFilters(config: Partial<ExecutionRecorderConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };

    this.logger.info('[ExecutionRecorder] Filters updated', {
      agentTypeFilter: this.config.agentTypeFilter,
      taskTypeFilter: this.config.taskTypeFilter,
    });
  }

  /**
   * Check if recorder is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }
}

export default ExecutionRecorder;
