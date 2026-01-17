/**
 * RuVector Nervous System Integration
 *
 * Bio-inspired neural components for QE agents:
 * - HDC: Hyperdimensional Computing for pattern storage (<100ns)
 * - BTSP: One-shot learning from single examples
 * - K-WTA: Sub-microsecond reflex decisions
 * - Global Workspace: Agent attention coordination (4-7 items)
 * - Circadian: Duty cycling for compute efficiency
 *
 * @module nervous-system
 */

// Re-export core WASM components
export {
  default as initNervousSystem,
  BTSPLayer,
  BTSPAssociativeMemory,
  BTSPSynapse,
  Hypervector,
  HdcMemory,
  WTALayer,
  KWTALayer,
  GlobalWorkspace,
  WorkspaceItem,
  version as nervousSystemVersion,
  available_mechanisms,
  performance_targets,
  biological_references,
} from '@ruvector/nervous-system-wasm';

// Export adapters (to be implemented)
export * from './adapters/HdcMemoryAdapter.js';
export * from './adapters/BTSPAdapter.js';
export * from './adapters/ReflexLayer.js';
export * from './adapters/GlobalWorkspaceAdapter.js';
export * from './adapters/CircadianController.js';

// Export integration components (named to avoid conflicts with adapters)
export {
  HybridPatternStore,
  type HybridPatternStoreConfig,
  createHybridPatternStore,
  createHighPerformanceHybridStore,
} from './integration/HybridPatternStore.js';

export {
  WorkspaceAgentCoordinator,
  type AgentWorkspaceItem,
  type TaskCoordinationRequest,
  type TaskCoordinationResult,
  type WorkspaceAgentCoordinatorConfig,
  createWorkspaceCoordinator,
  createFocusedCoordinator,
  createExpandedCoordinator,
} from './integration/WorkspaceAgent.js';

export {
  CircadianAgentManager,
  type AgentPhaseConfig,
  type ManagedAgentState,
  type EnergySavingsReport,
  type CriticalityLevel,
  type CircadianAgentManagerConfig,
} from './integration/CircadianAgent.js';

export {
  BTSPLearningEngine,
  type BTSPLearningEngineConfig,
  type BTSPLearningOutcome,
  type BTSPLearningMetrics,
  createBTSPLearningEngine,
} from './integration/BTSPLearningEngine.js';

export {
  enhanceWithNervousSystem,
  WithNervousSystem,
  NervousSystemFleetCoordinator,
  type NervousSystemConfig,
  type NervousSystemEnhancedAgent,
  type NervousSystemStats,
  type FleetNervousSystemStats,
} from './integration/NervousSystemEnhancement.js';

// Export wasm-loader utilities
export {
  initNervousSystem as initWasm,
  isWasmInitialized,
  ensureInitialized,
  getWasmInfo,
} from './wasm-loader.js';
