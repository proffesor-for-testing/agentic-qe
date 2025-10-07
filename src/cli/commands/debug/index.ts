/**
 * Debug & Diagnostics Commands Index
 * Exports all debug and diagnostics commands
 */

export { debugAgent } from './agent';
export type {
  DebugAgentOptions,
  DebugAgentResult,
  LogEntry,
  AgentState,
} from './agent';

export { runDiagnostics } from './diagnostics';
export type {
  DiagnosticsOptions,
  DiagnosticsResult,
  DiagnosticCheck,
} from './diagnostics';

export { healthCheck } from './health-check';
export type {
  HealthCheckOptions,
  HealthCheckResult,
  ComponentHealth,
  PerformanceMetrics,
} from './health-check';

export { troubleshoot } from './troubleshoot';
export type {
  TroubleshootOptions,
  TroubleshootResult,
  ResolutionStep,
  SimilarIssue,
} from './troubleshoot';

export { traceExecution } from './trace';
export type {
  TraceOptions,
  TraceResult,
  Trace,
  TraceStep,
} from './trace';

export { profilePerformance } from './profile';
export type {
  ProfileOptions,
  ProfileResult,
  Profile,
  CPUProfile,
  MemoryProfile,
  HotFunction,
  ProfileComparison,
} from './profile';
