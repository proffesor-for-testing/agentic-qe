/**
 * Learning Scheduler Module
 *
 * Provides scheduling infrastructure for the Nightly-Learner system:
 * - IdleDetector: Monitor system idle state
 * - SleepScheduler: Orchestrate learning cycles
 * - SleepCycle: Execute learning phases
 * - TimeBasedTrigger: Cron-like fallback scheduling
 *
 * @module src/learning/scheduler
 */

export { IdleDetector, IdleDetectorConfig, IdleState } from './IdleDetector';
export {
  SleepScheduler,
  SleepSchedulerConfig,
  SleepSchedulerState,
  LearningBudget,
  ScheduleConfig,
} from './SleepScheduler';
export {
  SleepCycle,
  SleepCycleConfig,
  SleepPhase,
  PhaseResult,
  CycleSummary,
} from './SleepCycle';
export {
  TimeBasedTrigger,
  TimeBasedTriggerConfig,
  TriggerEvent,
} from './TimeBasedTrigger';
