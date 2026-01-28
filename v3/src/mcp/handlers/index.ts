/**
 * Agentic QE v3 - MCP Handlers Index
 * Exports all MCP tool handlers
 */

// Core handlers
export {
  handleFleetInit,
  handleFleetStatus,
  handleFleetHealth,
  getFleetState,
  isFleetInitialized,
  disposeFleet,
} from './core-handlers';

// Task handlers
export {
  handleTaskSubmit,
  handleTaskList,
  handleTaskStatus,
  handleTaskCancel,
  handleTaskOrchestrate,
  // ADR-051: Model routing handlers
  handleModelRoute,
  handleRoutingMetrics,
  type TaskOrchestrateResult,
  type ModelRouteParams,
  type ModelRouteResult,
  type RoutingMetricsParams,
  type RoutingMetricsResult,
} from './task-handlers';

// Agent handlers
export {
  handleAgentList,
  handleAgentSpawn,
  handleAgentMetrics,
  handleAgentStatus,
} from './agent-handlers';

// Domain handlers (wrapped with experience capture - ADR-051)
export {
  handleTestGenerate,
  handleTestExecute,
  handleCoverageAnalyze,
  handleQualityAssess,
  handleSecurityScan,
  handleContractValidate,
  handleAccessibilityTest,
  handleChaosTest,
  handleDefectPredict,
  handleRequirementsValidate,
  handleCodeIndex,
  resetTaskExecutor,
} from './wrapped-domain-handlers.js';

// Memory handlers
export {
  handleMemoryStore,
  handleMemoryRetrieve,
  handleMemoryQuery,
  handleMemoryDelete,
  handleMemoryUsage,
  handleMemoryShare,
} from './memory-handlers';

// Cross-phase handlers
export {
  handleCrossPhaseStore,
  handleCrossPhaseQuery,
  handleAgentComplete,
  handlePhaseStart,
  handlePhaseEnd,
  handleCrossPhaseStats,
  handleFormatSignals,
  handleCrossPhaseCleanup,
  resetCrossPhaseHandlers,
  type StoreSignalParams,
  type StoreSignalResult,
  type QuerySignalsParams,
  type QuerySignalsResult,
  type AgentCompleteParams,
  type AgentCompleteResult,
  type PhaseEventParams,
  type PhaseStartResult,
  type PhaseEndResult,
  type CrossPhaseStatsResult,
  type FormatSignalsParams,
  type FormatSignalsResult,
} from './cross-phase-handlers';
