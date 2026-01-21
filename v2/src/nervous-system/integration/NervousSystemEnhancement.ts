/**
 * NervousSystemEnhancement - Mixin to Wire Nervous System into QE BaseAgent
 *
 * This module provides a mixin/enhancement to wire all nervous system integration
 * components into QE BaseAgent, enabling:
 * - HDC-accelerated pattern storage (50ns binding operations)
 * - BTSP one-shot learning from failures (vs 10+ examples with RL)
 * - Global Workspace attention coordination (Miller's Law: 7+/-2 items)
 * - Circadian duty cycling (5-50x compute savings)
 *
 * Architecture:
 * - enhanceWithNervousSystem(): Factory function to add capabilities to existing agent
 * - WithNervousSystem(): Class decorator for auto-enhancement
 * - NervousSystemFleetCoordinator: Fleet-wide coordination manager
 *
 * @module nervous-system/integration/NervousSystemEnhancement
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger.js';
import type { BaseAgent } from '../../agents/BaseAgent.js';

// Import all integration components
import {
  HybridPatternStore,
  HybridPatternStoreConfig,
  createHybridPatternStore,
} from './HybridPatternStore.js';
import type { HdcMemoryConfig } from '../adapters/HdcMemoryAdapter.js';
import type {
  TestPattern,
  PatternSearchResult,
} from '../../core/memory/IPatternStore.js';

import {
  BTSPLearningEngine,
  BTSPLearningEngineConfig,
  BTSPLearningOutcome,
  BTSPStrategyRecommendation,
  createBTSPLearningEngine,
} from './BTSPLearningEngine.js';
import type { BTSPAdapterConfig } from '../adapters/BTSPAdapter.js';
import type {
  TaskState,
  LearningFeedback,
} from '../../learning/types.js';

import {
  WorkspaceAgentCoordinator,
  WorkspaceAgentCoordinatorConfig,
  AgentWorkspaceItem,
  TaskCoordinationRequest,
  TaskCoordinationResult,
  createWorkspaceCoordinator,
} from './WorkspaceAgent.js';
import type {
  GlobalWorkspaceConfig,
  AttentionResult,
  WorkspaceOccupancy,
} from '../adapters/GlobalWorkspaceAdapter.js';

import {
  CircadianAgentManager,
  CircadianAgentManagerConfig,
  AgentPhaseConfig,
  EnergySavingsReport,
  CriticalityLevel,
} from './CircadianAgent.js';
import type {
  CircadianController,
  CircadianPhase,
  CircadianConfig,
  CircadianMetrics,
} from '../adapters/CircadianController.js';
import { createTestingController } from '../adapters/CircadianController.js';

import { SwarmMemoryManager } from '../../core/memory/SwarmMemoryManager.js';

// Import persistence components
import type { NervousSystemPersistenceManager } from '../persistence/NervousSystemPersistenceManager.js';
import { serializeHdcMemory, deserializeHdcMemory } from '../persistence/HdcSerializer.js';
import { serializeBTSP, deserializeBTSP } from '../persistence/BTSPSerializer.js';
import { serializeCircadian, deserializeCircadian } from '../persistence/CircadianSerializer.js';
import type { HdcSerializedState, BTSPSerializedState, CircadianSerializedState } from '../persistence/INervousSystemStore.js';
import { Hypervector } from '../wasm-loader.js';

// ============================================================================
// Configuration Interfaces
// ============================================================================

/**
 * Configuration for opting into nervous system features
 */
export interface NervousSystemConfig {
  /** Enable HDC-accelerated pattern storage (50ns binding) */
  enableHdcPatterns?: boolean;

  /** Enable BTSP one-shot learning from failures */
  enableOneShotLearning?: boolean;

  /** Enable Global Workspace attention coordination */
  enableWorkspaceCoordination?: boolean;

  /** Enable Circadian duty cycling (5-50x compute savings) */
  enableCircadianCycling?: boolean;

  /** HDC configuration overrides */
  hdcConfig?: Partial<HdcMemoryConfig>;

  /** BTSP configuration overrides */
  btspConfig?: Partial<BTSPAdapterConfig>;

  /** Workspace configuration overrides */
  workspaceConfig?: Partial<GlobalWorkspaceConfig>;

  /** Circadian configuration overrides */
  circadianConfig?: Partial<CircadianConfig>;

  /** Hybrid pattern store configuration */
  patternStoreConfig?: Partial<HybridPatternStoreConfig>;

  /** BTSP learning engine configuration */
  btspLearningConfig?: Partial<BTSPLearningEngineConfig>;

  /** Workspace coordinator configuration */
  workspaceCoordinatorConfig?: Partial<WorkspaceAgentCoordinatorConfig>;

  /** Agent phase configuration for circadian management */
  agentPhaseConfig?: Partial<AgentPhaseConfig>;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Task failure information for one-shot learning
 */
export interface TaskFailure {
  /** Task identifier */
  taskId: string;

  /** Error message */
  error: string;

  /** Task state when failure occurred */
  state: TaskState;

  /** Optional context metadata */
  context?: Record<string, unknown>;

  /** Timestamp of failure */
  timestamp: number;
}

/**
 * Workspace item for broadcasting
 */
export interface WorkspaceItem {
  /** Unique identifier */
  id: string;

  /** Content payload */
  content: unknown;

  /** Priority level (0-1) */
  priority: number;

  /** Relevance score (0-1) */
  relevance: number;

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Strategy recommendation from nervous system
 */
export interface StrategyRecommendation {
  /** Recommended strategy name */
  strategy: string;

  /** Confidence level (0-1) */
  confidence: number;

  /** Expected improvement percentage */
  expectedImprovement: number;

  /** Reasoning for recommendation */
  reasoning: string;

  /** Alternative strategies */
  alternatives?: string[];
}

/**
 * Comprehensive nervous system statistics
 */
export interface NervousSystemStats {
  /** Whether nervous system is initialized */
  initialized: boolean;

  /** HDC pattern store stats */
  hdc?: {
    enabled: boolean;
    patternCount: number;
    hdcAvailable: boolean;
    avgSearchTimeNs?: number;
    hdcHitRate?: number;
  };

  /** BTSP learning stats */
  btsp?: {
    enabled: boolean;
    totalExperiences: number;
    oneShotLearnings: number;
    avgRecallConfidence: number;
    capacityUtilization: number;
  };

  /** Workspace coordination stats */
  workspace?: {
    enabled: boolean;
    registeredAgents: number;
    occupancy: WorkspaceOccupancy;
    hasAttention: boolean;
  };

  /** Circadian cycling stats */
  circadian?: {
    enabled: boolean;
    currentPhase: CircadianPhase;
    savingsPercentage: number;
    costReductionFactor: number;
    isActive: boolean;
  };
}

/**
 * Fleet-wide nervous system statistics
 */
export interface FleetNervousSystemStats {
  /** Total agents in fleet */
  totalAgents: number;

  /** Agents with nervous system enabled */
  enhancedAgents: number;

  /** Aggregate HDC stats */
  hdcStats?: {
    totalPatterns: number;
    avgHitRate: number;
  };

  /** Aggregate BTSP stats */
  btspStats?: {
    totalExperiences: number;
    avgRecallConfidence: number;
  };

  /** Workspace coordination stats */
  workspaceStats?: {
    occupancy: WorkspaceOccupancy;
    attentionWinners: string[];
  };

  /** Circadian fleet stats */
  circadianStats?: {
    phase: CircadianPhase;
    activeAgents: number;
    sleepingAgents: number;
    savingsPercentage: number;
  };
}

// ============================================================================
// Enhanced Agent Interface
// ============================================================================

/**
 * Interface for agents enhanced with nervous system capabilities
 */
export interface NervousSystemEnhancedAgent {
  // HDC Pattern methods
  storePatternHdc?(pattern: TestPattern): Promise<void>;
  searchPatternsHdc?(embedding: number[], k: number): Promise<PatternSearchResult[]>;

  // BTSP Learning methods
  learnOneShot?(failure: TaskFailure): Promise<void>;
  recallStrategy?(state: TaskState): Promise<StrategyRecommendation | null>;

  // Workspace coordination methods
  broadcastToWorkspace?(item: WorkspaceItem): Promise<boolean>;
  getWorkspaceItems?(): Promise<AgentWorkspaceItem[]>;
  hasAttention?(): Promise<boolean>;

  // Circadian methods
  getCurrentPhase?(): CircadianPhase;
  shouldBeActive?(): boolean;
  getEnergySavings?(): EnergySavingsReport;

  // Combined nervous system stats
  getNervousSystemStats(): NervousSystemStats;
}

// ============================================================================
// Internal State for Enhanced Agents
// ============================================================================

/**
 * State attached to enhanced agents
 * Exported for use in persistence operations
 */
export interface NervousSystemState {
  config: NervousSystemConfig;
  initialized: boolean;
  logger: Logger;

  // Components
  patternStore?: HybridPatternStore;
  btspEngine?: BTSPLearningEngine;
  workspaceCoordinator?: WorkspaceAgentCoordinator;
  circadianManager?: CircadianAgentManager;
  circadianController?: CircadianController;

  // Tracking
  registeredWithWorkspace: boolean;
  registeredWithCircadian: boolean;
}

// WeakMap to store state without modifying agent prototype chain
const nervousSystemStates = new WeakMap<BaseAgent, NervousSystemState>();

// ============================================================================
// Enhancement Factory Function
// ============================================================================

/**
 * Factory function to enhance a BaseAgent with nervous system capabilities
 *
 * This function adds nervous system features to an existing agent instance
 * without modifying its class definition. It uses a mixin pattern to add
 * new methods while preserving the original agent's functionality.
 *
 * @param agent - The BaseAgent instance to enhance
 * @param config - Configuration for nervous system features
 * @returns The enhanced agent with nervous system capabilities
 *
 * @example
 * ```typescript
 * const agent = await TestGeneratorAgent.create();
 * const enhancedAgent = await enhanceWithNervousSystem(agent, {
 *   enableHdcPatterns: true,
 *   enableOneShotLearning: true,
 *   enableWorkspaceCoordination: true,
 *   enableCircadianCycling: true,
 * });
 *
 * // Use HDC patterns
 * await enhancedAgent.storePatternHdc(pattern);
 * const results = await enhancedAgent.searchPatternsHdc(embedding, 10);
 *
 * // Use one-shot learning
 * await enhancedAgent.learnOneShot({ taskId: 'task-1', error: 'Timeout', state, timestamp: Date.now() });
 * const strategy = await enhancedAgent.recallStrategy(currentState);
 *
 * // Check workspace attention
 * if (await enhancedAgent.hasAttention()) {
 *   // Proceed with full execution
 * }
 *
 * // Check circadian phase
 * if (enhancedAgent.shouldBeActive()) {
 *   // Run compute-intensive operations
 * }
 *
 * // Get comprehensive stats
 * const stats = enhancedAgent.getNervousSystemStats();
 * ```
 */
export async function enhanceWithNervousSystem<T extends BaseAgent>(
  agent: T,
  config: NervousSystemConfig
): Promise<T & NervousSystemEnhancedAgent> {
  const logger = Logger.getInstance();
  const agentId = agent.getAgentId();

  // Initialize state
  const state: NervousSystemState = {
    config,
    initialized: false,
    logger,
    registeredWithWorkspace: false,
    registeredWithCircadian: false,
  };

  nervousSystemStates.set(agent, state);

  // Initialize HDC Pattern Store
  if (config.enableHdcPatterns) {
    try {
      state.patternStore = createHybridPatternStore({
        dimension: 384,
        metric: 'cosine',
        enableMetrics: true,
        hdc: {
          similarityThreshold: 0.7,
          maxRetrievalResults: 100,
          autoInit: true,
          ...config.hdcConfig,
        },
        ...config.patternStoreConfig,
      });
      await state.patternStore.initialize();
      log(state, `HDC Pattern Store initialized for agent ${agentId.id}`);
    } catch (error) {
      logWarn(state, `HDC Pattern Store initialization failed: ${(error as Error).message}`);
    }
  }

  // Initialize BTSP Learning Engine
  if (config.enableOneShotLearning) {
    try {
      // Get memory store from agent
      const memoryStore = getAgentMemoryStore(agent);
      if (memoryStore instanceof SwarmMemoryManager) {
        state.btspEngine = createBTSPLearningEngine(agentId.id, memoryStore, {
          oneShotThreshold: 0,
          recallConfidenceThreshold: 0.6,
          consolidationInterval: 100,
          autoConsolidate: true,
          btspWeight: 0.7,
          btsp: config.btspConfig,
          ...config.btspLearningConfig,
        });
        await state.btspEngine.initialize();
        log(state, `BTSP Learning Engine initialized for agent ${agentId.id}`);
      } else {
        logWarn(state, 'BTSP requires SwarmMemoryManager');
      }
    } catch (error) {
      logWarn(state, `BTSP Learning Engine initialization failed: ${(error as Error).message}`);
    }
  }

  // Initialize Workspace Coordinator (will be connected to fleet coordinator if available)
  if (config.enableWorkspaceCoordination) {
    try {
      state.workspaceCoordinator = await createWorkspaceCoordinator();
      await state.workspaceCoordinator.registerAgent(agent);
      state.registeredWithWorkspace = true;
      log(state, `Workspace Coordinator initialized for agent ${agentId.id}`);
    } catch (error) {
      logWarn(state, `Workspace Coordinator initialization failed: ${(error as Error).message}`);
    }
  }

  // Initialize Circadian Manager
  if (config.enableCircadianCycling) {
    try {
      // Create a circadian controller for this agent
      state.circadianController = await createTestingController(60000); // 1 minute cycles for testing

      state.circadianManager = new CircadianAgentManager({
        controller: state.circadianController,
        defaultCriticality: 'medium',
        autoRegister: true,
        checkIntervalMs: 1000,
        debug: config.debug ?? false,
      });

      // Register agent with circadian manager
      const phaseConfig: AgentPhaseConfig = {
        agentId: agentId.id,
        agentType: agentId.type,
        criticalityLevel: (config.agentPhaseConfig?.criticalityLevel as CriticalityLevel) ?? 'medium',
        minActiveHours: config.agentPhaseConfig?.minActiveHours ?? 4,
        canRest: config.agentPhaseConfig?.canRest ?? true,
        customDutyFactor: config.agentPhaseConfig?.customDutyFactor,
        tags: config.agentPhaseConfig?.tags,
      };

      await state.circadianManager.registerAgent(agent, phaseConfig);
      state.circadianManager.start();
      state.registeredWithCircadian = true;
      log(state, `Circadian Manager initialized for agent ${agentId.id}`);
    } catch (error) {
      logWarn(state, `Circadian Manager initialization failed: ${(error as Error).message}`);
    }
  }

  state.initialized = true;

  // Attach methods to agent
  const enhancedAgent = agent as T & NervousSystemEnhancedAgent;

  // HDC Pattern methods
  if (state.patternStore) {
    enhancedAgent.storePatternHdc = async (pattern: TestPattern): Promise<void> => {
      const st = nervousSystemStates.get(agent);
      if (!st?.patternStore) throw new Error('HDC Pattern Store not available');
      await st.patternStore.storePattern(pattern);
    };

    enhancedAgent.searchPatternsHdc = async (
      embedding: number[],
      k: number
    ): Promise<PatternSearchResult[]> => {
      const st = nervousSystemStates.get(agent);
      if (!st?.patternStore) return [];
      return st.patternStore.searchSimilar(embedding, { k });
    };
  }

  // BTSP Learning methods
  if (state.btspEngine) {
    enhancedAgent.learnOneShot = async (failure: TaskFailure): Promise<void> => {
      const st = nervousSystemStates.get(agent);
      if (!st?.btspEngine) throw new Error('BTSP Learning Engine not available');

      // Convert failure to learning experience
      const feedback: LearningFeedback = {
        taskId: failure.taskId,
        rating: 0,
        issues: [failure.error],
        suggestions: [],
        timestamp: new Date(failure.timestamp),
        source: 'system',
      };
      await st.btspEngine.learnFromExecution(
        { type: 'failure-task', payload: { taskId: failure.taskId, context: failure.context } },
        { success: false, error: failure.error },
        feedback
      );
    };

    enhancedAgent.recallStrategy = async (
      taskState: TaskState
    ): Promise<StrategyRecommendation | null> => {
      const st = nervousSystemStates.get(agent);
      if (!st?.btspEngine) return null;

      const recommendation = await st.btspEngine.recommendWithBTSP(taskState);
      return {
        strategy: recommendation.strategy,
        confidence: recommendation.confidence,
        expectedImprovement: recommendation.expectedImprovement,
        reasoning: recommendation.reasoning,
        alternatives: recommendation.alternatives?.map(a =>
          typeof a === 'string' ? a : a.strategy
        ),
      };
    };
  }

  // Workspace coordination methods
  if (state.workspaceCoordinator) {
    enhancedAgent.broadcastToWorkspace = async (item: WorkspaceItem): Promise<boolean> => {
      const st = nervousSystemStates.get(agent);
      if (!st?.workspaceCoordinator) return false;

      const workspaceItem: AgentWorkspaceItem = {
        id: item.id,
        agentId: agentId.id,
        agentType: agentId.type,
        content: item.content,
        priority: item.priority,
        relevance: item.relevance,
        timestamp: Date.now(),
        metadata: item.metadata,
      };

      return st.workspaceCoordinator.agentBroadcast(agentId.id, workspaceItem);
    };

    enhancedAgent.getWorkspaceItems = async (): Promise<AgentWorkspaceItem[]> => {
      const st = nervousSystemStates.get(agent);
      if (!st?.workspaceCoordinator) return [];
      return st.workspaceCoordinator.getRelevantItems(agentId.type);
    };

    enhancedAgent.hasAttention = async (): Promise<boolean> => {
      const st = nervousSystemStates.get(agent);
      if (!st?.workspaceCoordinator) return true; // Default to true if not using workspace
      return st.workspaceCoordinator.hasAttention(agentId.id);
    };
  }

  // Circadian methods
  if (state.circadianManager && state.circadianController) {
    enhancedAgent.getCurrentPhase = (): CircadianPhase => {
      const st = nervousSystemStates.get(agent);
      if (!st?.circadianController) return 'Active';
      return st.circadianController.getPhase();
    };

    enhancedAgent.shouldBeActive = (): boolean => {
      const st = nervousSystemStates.get(agent);
      if (!st?.circadianManager) return true;
      return st.circadianManager.shouldBeActive(agentId.id);
    };

    enhancedAgent.getEnergySavings = (): EnergySavingsReport => {
      const st = nervousSystemStates.get(agent);
      if (!st?.circadianManager) {
        return {
          savedCycles: 0,
          savingsPercentage: 0,
          totalRestTime: 0,
          totalActiveTime: 0,
          averageDutyFactor: 1,
          costReductionFactor: 1,
        };
      }
      return st.circadianManager.getEnergySavings();
    };
  }

  // Combined stats method
  enhancedAgent.getNervousSystemStats = (): NervousSystemStats => {
    const st = nervousSystemStates.get(agent);
    if (!st) {
      return { initialized: false };
    }

    const stats: NervousSystemStats = {
      initialized: st.initialized,
    };

    // HDC stats
    if (st.patternStore) {
      const hdcMetrics = st.patternStore.getHdcMetrics();
      stats.hdc = {
        enabled: true,
        patternCount: 0, // Will be populated asynchronously
        hdcAvailable: st.patternStore.isHdcAvailable(),
        avgSearchTimeNs: hdcMetrics.avgSearchTime,
        hdcHitRate: hdcMetrics.hdcHitRate,
      };

      // Async stats - populate pattern count
      st.patternStore.getStats().then(patternStats => {
        if (stats.hdc) {
          stats.hdc.patternCount = patternStats.count;
        }
      }).catch(() => { /* ignore */ });
    }

    // BTSP stats
    if (st.btspEngine) {
      const btspMetrics = st.btspEngine.getMetrics();
      stats.btsp = {
        enabled: true,
        totalExperiences: btspMetrics.totalExperiences,
        oneShotLearnings: btspMetrics.btspLearningCount,
        avgRecallConfidence: btspMetrics.avgBTSPRecallConfidence,
        capacityUtilization: btspMetrics.btspCapacityUtilization,
      };
    }

    // Workspace stats
    if (st.workspaceCoordinator) {
      const occupancy = st.workspaceCoordinator.getOccupancy();
      const agentInfo = st.workspaceCoordinator.getAgentInfo(agentId.id);
      stats.workspace = {
        enabled: true,
        registeredAgents: st.workspaceCoordinator.getAgentCount(),
        occupancy,
        hasAttention: agentInfo?.hasAttention ?? false,
      };
    }

    // Circadian stats
    if (st.circadianManager && st.circadianController) {
      const savings = st.circadianManager.getEnergySavings();
      stats.circadian = {
        enabled: true,
        currentPhase: st.circadianController.getPhase(),
        savingsPercentage: savings.savingsPercentage,
        costReductionFactor: savings.costReductionFactor,
        isActive: st.circadianManager.shouldBeActive(agentId.id),
      };
    }

    return stats;
  };

  log(state, `Agent ${agentId.id} enhanced with nervous system capabilities`);

  return enhancedAgent;
}

// ============================================================================
// Persistence Functions
// ============================================================================

/**
 * Save nervous system state for an agent
 *
 * Serializes all nervous system components (HDC, BTSP, Circadian) and saves
 * them using the persistence manager. Call this in agent terminate() to
 * preserve learned patterns across sessions.
 *
 * @param agent - The agent to save state for
 * @param persistenceManager - The persistence manager to use
 * @returns Promise resolving when state is saved
 *
 * @example
 * ```typescript
 * // In agent terminate():
 * await saveNervousSystemState(this, persistenceManager);
 * ```
 */
export async function saveNervousSystemState(
  agent: BaseAgent,
  persistenceManager: NervousSystemPersistenceManager
): Promise<void> {
  const state = nervousSystemStates.get(agent);
  if (!state || !state.initialized) {
    return; // No nervous system state to save
  }

  const agentId = agent.getAgentId().id;
  const logger = state.logger;

  try {
    const savePromises: Promise<void>[] = [];

    // Save HDC state
    if (state.patternStore) {
      const hdcAdapter = state.patternStore.getHdcAdapter();
      if (hdcAdapter && hdcAdapter.isInitialized()) {
        const hdcState = serializeHdcMemory(hdcAdapter);
        savePromises.push(persistenceManager.saveHdcState(agentId, hdcState));
        logger.debug(`[${agentId}] Serialized HDC state: ${hdcState.patterns.length} patterns`);
      }
    }

    // Save BTSP state
    if (state.btspEngine) {
      const btspAdapter = state.btspEngine.getBTSPAdapter();
      if (btspAdapter && btspAdapter.isInitialized()) {
        const btspState = serializeBTSP(btspAdapter);
        savePromises.push(persistenceManager.saveBtspState(agentId, btspState));
        logger.debug(`[${agentId}] Serialized BTSP state: ${btspState.associationCount} associations`);
      }
    }

    // Save Circadian state
    if (state.circadianController) {
      const circadianState = serializeCircadian(state.circadianController);
      savePromises.push(persistenceManager.saveCircadianState(agentId, circadianState));
      logger.debug(`[${agentId}] Serialized Circadian state: phase=${circadianState.state.phase}`);
    }

    await Promise.all(savePromises);
    logger.info(`[${agentId}] Nervous system state saved successfully`);
  } catch (error) {
    logger.warn(`[${agentId}] Failed to save nervous system state:`, error);
    throw error;
  }
}

/**
 * Restore nervous system state for an agent
 *
 * Loads serialized state from the persistence manager and restores it into
 * the agent's nervous system components. Call this in agent initialize()
 * after nervous system enhancement to restore prior learnings.
 *
 * @param agent - The agent to restore state for
 * @param persistenceManager - The persistence manager to use
 * @returns Promise resolving when state is restored
 *
 * @example
 * ```typescript
 * // In agent initialize() after nervous system init:
 * await restoreNervousSystemState(this, persistenceManager);
 * ```
 */
export async function restoreNervousSystemState(
  agent: BaseAgent,
  persistenceManager: NervousSystemPersistenceManager
): Promise<void> {
  const state = nervousSystemStates.get(agent);
  if (!state || !state.initialized) {
    return; // No nervous system to restore into
  }

  const agentId = agent.getAgentId().id;
  const logger = state.logger;

  try {
    // Load all states in parallel
    const [hdcState, btspState, circadianState] = await Promise.all([
      persistenceManager.loadHdcState(agentId),
      persistenceManager.loadBtspState(agentId),
      persistenceManager.loadCircadianState(agentId),
    ]);

    // Restore HDC state
    if (hdcState && state.patternStore) {
      const hdcAdapter = state.patternStore.getHdcAdapter();
      if (hdcAdapter && hdcAdapter.isInitialized()) {
        deserializeHdcMemory(hdcState, hdcAdapter, Hypervector);
        logger.info(`[${agentId}] Restored HDC state: ${hdcState.patterns.length} patterns`);
      }
    }

    // Restore BTSP state
    if (btspState && state.btspEngine) {
      const btspAdapter = state.btspEngine.getBTSPAdapter();
      if (btspAdapter && btspAdapter.isInitialized()) {
        deserializeBTSP(btspState, btspAdapter);
        logger.info(`[${agentId}] Restored BTSP state: ${btspState.associationCount} associations`);
      }
    }

    // Restore Circadian state
    if (circadianState && state.circadianController) {
      deserializeCircadian(circadianState, state.circadianController);
      logger.info(`[${agentId}] Restored Circadian state: phase=${circadianState.state.phase}`);
    }

    logger.info(`[${agentId}] Nervous system state restored successfully`);
  } catch (error) {
    logger.warn(`[${agentId}] Failed to restore nervous system state:`, error);
    // Don't throw - agent can work with fresh state
  }
}

/**
 * Check if an agent has nervous system state that needs saving
 *
 * @param agent - The agent to check
 * @returns True if agent has initialized nervous system
 */
export function hasNervousSystemState(agent: BaseAgent): boolean {
  const state = nervousSystemStates.get(agent);
  return state?.initialized ?? false;
}

/**
 * Get nervous system state for an agent (for advanced use cases)
 *
 * @param agent - The agent to get state for
 * @returns The internal state or undefined
 */
export function getNervousSystemState(agent: BaseAgent): NervousSystemState | undefined {
  return nervousSystemStates.get(agent);
}

// ============================================================================
// Class Decorator
// ============================================================================

/**
 * Decorator for agent class to auto-enhance with nervous system
 *
 * This decorator wraps the agent class constructor to automatically
 * enhance instances with nervous system capabilities. The decorator
 * intercepts the initialize() method to add nervous system enhancement.
 *
 * @param config - Configuration for nervous system features
 * @returns Class decorator function
 *
 * @example
 * ```typescript
 * @WithNervousSystem({
 *   enableHdcPatterns: true,
 *   enableOneShotLearning: true,
 *   enableWorkspaceCoordination: true,
 *   enableCircadianCycling: true,
 * })
 * class MyTestAgent extends BaseAgent {
 *   // ... agent implementation
 * }
 *
 * // Instances are automatically enhanced
 * const agent = new MyTestAgent(config);
 * await agent.initialize();
 * // Now has all nervous system methods available
 * ```
 */
export function WithNervousSystem(
  config: NervousSystemConfig
): <T extends new (...args: any[]) => BaseAgent>(constructor: T) => T {
  return function <T extends new (...args: any[]) => BaseAgent>(constructor: T): T {
    // Store the original initialize method
    const originalInitialize = constructor.prototype.initialize;

    // Override the initialize method on the prototype
    constructor.prototype.initialize = async function (this: BaseAgent): Promise<void> {
      // Call the original initialize
      await originalInitialize.call(this);

      // Check if already enhanced
      const existingState = nervousSystemStates.get(this);
      if (!existingState?.initialized) {
        // Enhance with nervous system
        await enhanceWithNervousSystem(this, config);
      }
    };

    // Add a marker to identify enhanced classes
    Object.defineProperty(constructor, '_nervousSystemConfig', {
      value: config,
      writable: false,
      enumerable: false,
    });

    return constructor;
  };
}

// ============================================================================
// Fleet Coordinator
// ============================================================================

/**
 * Global coordinator for fleet-wide nervous system management
 *
 * Manages workspace coordination and circadian cycling across all agents
 * in a fleet, enabling coordinated attention and duty cycling.
 *
 * @example
 * ```typescript
 * const fleetCoordinator = new NervousSystemFleetCoordinator();
 * await fleetCoordinator.initialize();
 *
 * // Register agents
 * for (const agent of fleet.getAgents()) {
 *   await fleetCoordinator.registerAgent(agent, {
 *     enableWorkspaceCoordination: true,
 *     enableCircadianCycling: true,
 *   });
 * }
 *
 * // Fleet-wide operations
 * await fleetCoordinator.broadcastToAllAgents({
 *   id: 'fleet-alert',
 *   content: { type: 'priority-change' },
 *   priority: 0.9,
 *   relevance: 1.0,
 * });
 *
 * // Enter rest phase for compute savings
 * await fleetCoordinator.enterFleetRestPhase();
 *
 * // Get fleet statistics
 * const stats = fleetCoordinator.getFleetStats();
 * console.log(`Fleet savings: ${stats.circadianStats?.savingsPercentage}%`);
 * ```
 */
export class NervousSystemFleetCoordinator extends EventEmitter {
  private readonly logger = Logger.getInstance();
  private workspaceCoordinator?: WorkspaceAgentCoordinator;
  private circadianManager?: CircadianAgentManager;
  private circadianController?: CircadianController;
  private registeredAgents: Map<string, { agent: BaseAgent; config: NervousSystemConfig }> = new Map();
  private initialized = false;
  private debug: boolean;

  constructor(options?: { debug?: boolean }) {
    super();
    this.debug = options?.debug ?? false;
  }

  /**
   * Initialize the fleet coordinator
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize workspace coordinator
      this.workspaceCoordinator = await createWorkspaceCoordinator();
      this.log('Fleet workspace coordinator initialized');

      // Initialize circadian controller and manager
      this.circadianController = await createTestingController(60000);
      this.circadianManager = new CircadianAgentManager({
        controller: this.circadianController,
        defaultCriticality: 'medium',
        autoRegister: false,
        checkIntervalMs: 1000,
        debug: this.debug,
      });
      this.circadianManager.start();
      this.log('Fleet circadian manager initialized');

      this.initialized = true;
    } catch (error) {
      this.logger.error('Fleet coordinator initialization failed:', error);
      throw error;
    }
  }

  /**
   * Ensure coordinator is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('NervousSystemFleetCoordinator not initialized. Call initialize() first.');
    }
  }

  /**
   * Register an agent for fleet-wide nervous system coordination
   *
   * @param agent - The agent to register
   * @param config - Nervous system configuration for this agent
   */
  async registerAgent(agent: BaseAgent, config: NervousSystemConfig): Promise<void> {
    this.ensureInitialized();

    const agentId = agent.getAgentId();

    // Register with workspace coordinator if enabled
    if (config.enableWorkspaceCoordination && this.workspaceCoordinator) {
      await this.workspaceCoordinator.registerAgent(agent);
      this.log(`Agent ${agentId.id} registered with fleet workspace`);
    }

    // Register with circadian manager if enabled
    if (config.enableCircadianCycling && this.circadianManager) {
      const phaseConfig: AgentPhaseConfig = {
        agentId: agentId.id,
        agentType: agentId.type,
        criticalityLevel: (config.agentPhaseConfig?.criticalityLevel as CriticalityLevel) ?? 'medium',
        minActiveHours: config.agentPhaseConfig?.minActiveHours ?? 4,
        canRest: config.agentPhaseConfig?.canRest ?? true,
        customDutyFactor: config.agentPhaseConfig?.customDutyFactor,
        tags: config.agentPhaseConfig?.tags,
      };

      await this.circadianManager.registerAgent(agent, phaseConfig);
      this.log(`Agent ${agentId.id} registered with fleet circadian manager`);
    }

    this.registeredAgents.set(agentId.id, { agent, config });
    this.emit('agent:registered', { agentId: agentId.id, agentType: agentId.type });
  }

  /**
   * Unregister an agent from fleet coordination
   *
   * @param agentId - ID of the agent to unregister
   */
  async unregisterAgent(agentId: string): Promise<void> {
    this.ensureInitialized();

    const entry = this.registeredAgents.get(agentId);
    if (!entry) return;

    // Unregister from workspace
    if (entry.config.enableWorkspaceCoordination && this.workspaceCoordinator) {
      await this.workspaceCoordinator.unregisterAgent(agentId);
    }

    // Unregister from circadian
    if (entry.config.enableCircadianCycling && this.circadianManager) {
      await this.circadianManager.unregisterAgent(agentId);
    }

    this.registeredAgents.delete(agentId);
    this.emit('agent:unregistered', { agentId });
    this.log(`Agent ${agentId} unregistered from fleet`);
  }

  // ============================================================================
  // Fleet-Wide Operations
  // ============================================================================

  /**
   * Broadcast a workspace item to all agents in the fleet
   *
   * @param item - The workspace item to broadcast
   */
  async broadcastToAllAgents(item: WorkspaceItem): Promise<void> {
    this.ensureInitialized();

    if (!this.workspaceCoordinator) {
      throw new Error('Workspace coordinator not available');
    }

    // Broadcast to workspace - all registered agents will receive it
    const entries = Array.from(this.registeredAgents.entries());
    for (const [agentId, entry] of entries) {
      if (entry.config.enableWorkspaceCoordination) {
        const workspaceItem: AgentWorkspaceItem = {
          id: `${item.id}-${agentId}`,
          agentId,
          agentType: entry.agent.getAgentId().type,
          content: item.content,
          priority: item.priority,
          relevance: item.relevance,
          timestamp: Date.now(),
          metadata: item.metadata,
        };

        await this.workspaceCoordinator.agentBroadcast(agentId, workspaceItem);
      }
    }

    // Run competition to allocate attention
    await this.workspaceCoordinator.runCompetition();

    this.log(`Broadcast item ${item.id} to ${this.registeredAgents.size} agents`);
  }

  /**
   * Enter fleet-wide rest phase for compute savings
   */
  async enterFleetRestPhase(): Promise<void> {
    this.ensureInitialized();

    if (!this.circadianManager) {
      throw new Error('Circadian manager not available');
    }

    await this.circadianManager.enterRestPhase();
    this.emit('fleet:rest', { timestamp: Date.now() });
    this.log('Fleet entered rest phase');
  }

  /**
   * Wake the fleet from rest phase
   */
  async wakeFleet(): Promise<void> {
    this.ensureInitialized();

    if (!this.circadianManager) {
      throw new Error('Circadian manager not available');
    }

    await this.circadianManager.enterActivePhase();
    this.emit('fleet:wake', { timestamp: Date.now() });
    this.log('Fleet woke from rest phase');
  }

  /**
   * Coordinate a task across multiple agents
   *
   * @param request - Task coordination request
   * @returns Coordination result
   */
  async coordinateTask(request: TaskCoordinationRequest): Promise<TaskCoordinationResult> {
    this.ensureInitialized();

    if (!this.workspaceCoordinator) {
      throw new Error('Workspace coordinator not available');
    }

    return this.workspaceCoordinator.coordinateTask(request);
  }

  // ============================================================================
  // Statistics and Monitoring
  // ============================================================================

  /**
   * Get comprehensive fleet-wide statistics
   *
   * @returns Fleet nervous system statistics
   */
  getFleetStats(): FleetNervousSystemStats {
    const stats: FleetNervousSystemStats = {
      totalAgents: this.registeredAgents.size,
      enhancedAgents: 0,
    };

    // Count enhanced agents
    const allEntries = Array.from(this.registeredAgents.values());
    for (const entry of allEntries) {
      if (
        entry.config.enableHdcPatterns ||
        entry.config.enableOneShotLearning ||
        entry.config.enableWorkspaceCoordination ||
        entry.config.enableCircadianCycling
      ) {
        stats.enhancedAgents++;
      }
    }

    // Workspace stats
    if (this.workspaceCoordinator) {
      const occupancy = this.workspaceCoordinator.getOccupancy();
      const winners = this.workspaceCoordinator.getAttentionWinners();
      stats.workspaceStats = {
        occupancy,
        attentionWinners: winners.map(w => w.agentId),
      };
    }

    // Circadian stats
    if (this.circadianManager && this.circadianController) {
      const managerStats = this.circadianManager.getStats();
      stats.circadianStats = {
        phase: this.circadianController.getPhase(),
        activeAgents: managerStats.activeAgents,
        sleepingAgents: managerStats.sleepingAgents,
        savingsPercentage: managerStats.savings.savingsPercentage,
      };
    }

    return stats;
  }

  /**
   * Get current attention winners
   *
   * @returns Array of agents that currently have attention
   */
  getAttentionWinners(): AttentionResult[] {
    if (!this.workspaceCoordinator) return [];
    return this.workspaceCoordinator.getAttentionWinners();
  }

  /**
   * Get current circadian phase
   *
   * @returns Current phase
   */
  getCurrentPhase(): CircadianPhase {
    if (!this.circadianController) return 'Active';
    return this.circadianController.getPhase();
  }

  /**
   * Get fleet energy savings report
   *
   * @returns Energy savings report
   */
  getEnergySavings(): EnergySavingsReport {
    if (!this.circadianManager) {
      return {
        savedCycles: 0,
        savingsPercentage: 0,
        totalRestTime: 0,
        totalActiveTime: 0,
        averageDutyFactor: 1,
        costReductionFactor: 1,
      };
    }
    return this.circadianManager.getEnergySavings();
  }

  /**
   * Advance circadian time (for testing/simulation)
   *
   * @param dt - Time to advance in milliseconds
   */
  advanceTime(dt: number): void {
    if (this.circadianManager) {
      this.circadianManager.advance(dt);
    }
  }

  /**
   * Cleanup and dispose of resources
   */
  async dispose(): Promise<void> {
    // Unregister all agents
    const agentIds = Array.from(this.registeredAgents.keys());
    for (const agentId of agentIds) {
      await this.unregisterAgent(agentId);
    }

    // Dispose components
    if (this.workspaceCoordinator) {
      this.workspaceCoordinator.dispose();
      this.workspaceCoordinator = undefined;
    }

    if (this.circadianManager) {
      await this.circadianManager.stop();
      this.circadianManager = undefined;
    }

    if (this.circadianController) {
      this.circadianController.dispose();
      this.circadianController = undefined;
    }

    this.registeredAgents.clear();
    this.initialized = false;
    this.removeAllListeners();

    this.log('Fleet coordinator disposed');
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private log(message: string): void {
    if (this.debug) {
      console.log(`[NervousSystemFleetCoordinator] ${message}`);
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the memory store from an agent (via reflection)
 */
function getAgentMemoryStore(agent: BaseAgent): unknown {
  // Access protected member via any cast
  return (agent as unknown as { memoryStore: unknown }).memoryStore;
}

/**
 * Log message if debug enabled
 */
function log(state: NervousSystemState, message: string): void {
  if (state.config.debug) {
    console.log(`[NervousSystemEnhancement] ${message}`);
  }
}

/**
 * Log warning
 */
function logWarn(state: NervousSystemState, message: string): void {
  state.logger.warn(`[NervousSystemEnhancement] ${message}`);
}

// ============================================================================
// Exports
// ============================================================================

export {
  // Re-export types from integration components for convenience
  TestPattern,
  PatternSearchResult,
  TaskState,
  AgentWorkspaceItem,
  TaskCoordinationRequest,
  TaskCoordinationResult,
  AttentionResult,
  WorkspaceOccupancy,
  CircadianPhase,
  CircadianMetrics,
  CriticalityLevel,
  AgentPhaseConfig,
};

// Re-export component creators for advanced usage
export {
  createHybridPatternStore,
  createBTSPLearningEngine,
  createWorkspaceCoordinator,
};
