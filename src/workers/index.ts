/**
 * Agentic QE v3 - Workers Module
 * ADR-014: Background Workers for QE Monitoring
 *
 * This module provides background worker functionality for continuous
 * monitoring and optimization of the QE system.
 *
 * Workers:
 * - test-health (5 min): Monitor test suite health metrics
 * - coverage-tracker (10 min): Track coverage trends over time
 * - flaky-detector (15 min): Detect flaky test patterns
 * - security-scan (30 min): Security vulnerability scanning
 * - quality-gate (5 min): Continuous gate evaluation
 * - learning-consolidation (30 min): Pattern consolidation
 * - defect-predictor (15 min): ML defect prediction
 * - regression-monitor (10 min): Watch for regressions
 * - performance-baseline (1 hour): Performance trend tracking
 * - compliance-checker (30 min): ADR/DDD compliance checking
 */

// Core interfaces
export * from './interfaces';

// Base worker class
export { BaseWorker } from './base-worker';

// Worker manager
export { WorkerManagerImpl } from './worker-manager';

// Daemon
export {
  QEDaemon,
  createDaemon,
  getDaemon,
  resetDaemon,
  type DaemonConfig,
} from './daemon';

// All workers
export {
  TestHealthWorker,
  CoverageTrackerWorker,
  FlakyDetectorWorker,
  SecurityScanWorker,
  QualityGateWorker,
  LearningConsolidationWorker,
  DefectPredictorWorker,
  RegressionMonitorWorker,
  PerformanceBaselineWorker,
  ComplianceCheckerWorker,
} from './workers';

/**
 * Worker registry - all available workers with metadata
 */
export const WORKER_REGISTRY = {
  'test-health': {
    name: 'Test Health Monitor',
    intervalMs: 5 * 60 * 1000,
    priority: 'high',
    description: 'Monitors test suite health metrics',
  },
  'coverage-tracker': {
    name: 'Coverage Tracker',
    intervalMs: 10 * 60 * 1000,
    priority: 'high',
    description: 'Tracks coverage trends over time',
  },
  'flaky-detector': {
    name: 'Flaky Test Detector',
    intervalMs: 15 * 60 * 1000,
    priority: 'high',
    description: 'Detects flaky test patterns',
  },
  'security-scan': {
    name: 'Security Scanner',
    intervalMs: 30 * 60 * 1000,
    priority: 'critical',
    description: 'Security vulnerability scanning',
  },
  'quality-gate': {
    name: 'Quality Gate Evaluator',
    intervalMs: 5 * 60 * 1000,
    priority: 'critical',
    description: 'Continuous quality gate evaluation',
  },
  'learning-consolidation': {
    name: 'Learning Consolidation',
    intervalMs: 30 * 60 * 1000,
    priority: 'normal',
    description: 'Cross-domain pattern consolidation',
  },
  'defect-predictor': {
    name: 'Defect Predictor',
    intervalMs: 15 * 60 * 1000,
    priority: 'high',
    description: 'ML-based defect prediction',
  },
  'regression-monitor': {
    name: 'Regression Monitor',
    intervalMs: 10 * 60 * 1000,
    priority: 'high',
    description: 'Watches for regressions',
  },
  'performance-baseline': {
    name: 'Performance Baseline Tracker',
    intervalMs: 60 * 60 * 1000,
    priority: 'normal',
    description: 'Performance trend tracking',
  },
  'compliance-checker': {
    name: 'Compliance Checker',
    intervalMs: 30 * 60 * 1000,
    priority: 'normal',
    description: 'ADR/DDD compliance checking',
  },
} as const;

export type WorkerId = keyof typeof WORKER_REGISTRY;
