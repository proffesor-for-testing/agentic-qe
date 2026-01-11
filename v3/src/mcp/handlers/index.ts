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
} from './task-handlers';

// Agent handlers
export {
  handleAgentList,
  handleAgentSpawn,
  handleAgentMetrics,
  handleAgentStatus,
} from './agent-handlers';

// Domain handlers
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
} from './domain-handlers';

// Memory handlers
export {
  handleMemoryStore,
  handleMemoryRetrieve,
  handleMemoryQuery,
  handleMemoryDelete,
  handleMemoryUsage,
  handleMemoryShare,
} from './memory-handlers';
