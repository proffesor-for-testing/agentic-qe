/**
 * Agentic QE v3 - Adapters
 * Export all adapter implementations
 */

export { BrowserResultAdapter, createBrowserResultAdapter } from './browser-result-adapter.js';
export { TrajectoryAdapter, createTrajectoryAdapter } from './trajectory-adapter.js';

// Export browser trajectory types
export type {
  BrowserTrajectory,
  BrowserTrajectoryStep,
  BrowserContext,
  LearningOutcome,
  ActionSequence,
} from './trajectory-adapter.js';
