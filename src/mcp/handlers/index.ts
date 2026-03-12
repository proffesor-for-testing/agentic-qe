/**
 * Agentic QE v3 - MCP Handlers Index
 * Exports all MCP tool handlers
 */

// Core handlers
export {
  handleFleetInit,
  handleFleetStatus,
  handleFleetHealth,
  handleAQEHealth,
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

// ADR-057: Infrastructure self-healing handlers
export {
  handleInfraHealingStatus,
  handleInfraHealingFeedOutput,
  handleInfraHealingRecover,
  setInfraHealingOrchestrator,
} from './domain-handlers';

// Team handlers (ADR-064)
export {
  handleTeamList,
  handleTeamHealth,
  handleTeamMessage,
  handleTeamBroadcast,
  handleTeamScale,
  handleTeamRebalance,
} from './team-handlers';

// Memory handlers
export {
  handleMemoryStore,
  handleMemoryRetrieve,
  handleMemoryQuery,
  handleMemoryDelete,
  handleMemoryUsage,
  handleMemoryShare,
} from './memory-handlers';

// Pipeline handlers (Imp-9: YAML Deterministic Pipelines)
export {
  handlePipelineLoad,
  handlePipelineRun,
  handlePipelineList,
  handlePipelineValidate,
  getPipelineRegistry,
  getPipelineLoader,
  type PipelineLoadParams,
  type PipelineLoadResult,
  type PipelineRunParams,
  type PipelineRunResult,
  type PipelineListParams,
  type PipelineListResult,
  type PipelineValidateParams,
  type PipelineValidateResult,
} from './pipeline-handlers.js';

// Validation pipeline handler (BMAD-003)
export {
  handleValidationPipeline,
  type ValidationPipelineParams,
  type ValidationPipelineResult,
} from './validation-pipeline-handler.js';

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
