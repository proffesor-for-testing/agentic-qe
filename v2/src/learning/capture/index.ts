/**
 * Experience Capture Module
 *
 * Provides experience capture infrastructure for the Nightly-Learner system:
 * - ExperienceCapture: Store agent execution experiences
 * - ExecutionRecorder: Hook into agent execution pipeline
 *
 * @module src/learning/capture
 */

export {
  ExperienceCapture,
  ExperienceCaptureConfig,
  CapturedExperience,
  AgentExecutionEvent,
  CaptureStats,
} from './ExperienceCapture';

export {
  ExecutionRecorder,
  ExecutionRecorderConfig,
  RecordedExecution,
} from './ExecutionRecorder';
