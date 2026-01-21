/**
 * Nervous System State Store Interface
 *
 * Defines the contract for persisting nervous system component state.
 * Implementations can store to SQLite, Supabase, file system, etc.
 *
 * @module nervous-system/persistence/INervousSystemStore
 */

import type { CircadianState, CircadianMetrics } from '../adapters/CircadianController.js';

/**
 * Component types that can be persisted
 */
export type NervousSystemComponent = 'hdc' | 'btsp' | 'circadian' | 'workspace';

/**
 * Serialized HDC state format
 */
export interface HdcSerializedState {
  /** Schema version for migration support */
  version: number;
  /** Hypervector dimension (default 10000) */
  dimension: number;
  /** Codebook mappings: type -> hypervector bytes */
  codebooks: {
    type: Array<[string, Uint8Array]>;
    domain: Array<[string, Uint8Array]>;
    framework: Array<[string, Uint8Array]>;
  };
  /** Role vectors for structured encoding */
  roleVectors: {
    type: Uint8Array;
    domain: Uint8Array;
    content: Uint8Array;
    framework: Uint8Array;
  };
  /** Stored patterns: key -> hypervector bytes */
  patterns: Array<{
    key: string;
    vector: Uint8Array;
    metadata?: Record<string, unknown>;
  }>;
  /** Timestamp of serialization */
  serializedAt: number;
}

/**
 * Serialized BTSP state format
 */
export interface BTSPSerializedState {
  /** Schema version for migration support */
  version: number;
  /** Configuration used to create the adapter */
  config: {
    inputSize: number;
    outputSize: number;
    tau: number;
    plateauThreshold: number;
    ewcLambda: number;
    maxCapacity: number;
  };
  /** BTSP layer weights (Float32Array serialized as base64 or array) */
  weights: number[];
  /** Fisher diagonal for EWC consolidation */
  fisherDiagonal: number[];
  /** Consolidated weight reference point */
  consolidatedWeights: number[];
  /** Number of associations stored */
  associationCount: number;
  /** Stored associations (pattern -> target) */
  associations: Array<{
    pattern: number[];
    target: number[];
  }>;
  /** Timestamp of serialization */
  serializedAt: number;
}

/**
 * Serialized Circadian state format
 */
export interface CircadianSerializedState {
  /** Schema version for migration support */
  version: number;
  /** Current state snapshot */
  state: CircadianState;
  /** Accumulated metrics */
  metrics: CircadianMetrics;
  /** Last phase change timestamp */
  lastPhaseChange: number;
  /** Modulation start time (if active) */
  modulationStartTime?: number;
  /** Timestamp of serialization */
  serializedAt: number;
}

/**
 * Metadata about stored state
 */
export interface StoredStateMetadata {
  /** Agent ID that owns this state */
  agentId: string;
  /** Component type */
  component: NervousSystemComponent;
  /** Schema version */
  version: number;
  /** When the state was stored */
  storedAt: Date;
  /** When the state was last updated */
  updatedAt: Date;
  /** Size in bytes */
  sizeBytes: number;
}

/**
 * Interface for nervous system state persistence
 *
 * Implementations should handle:
 * - Binary data storage (for HDC/BTSP)
 * - JSON data storage (for Circadian)
 * - Atomic updates
 * - Error recovery
 */
export interface INervousSystemStore {
  /**
   * Initialize the store (create tables, connect, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the store gracefully
   */
  shutdown(): Promise<void>;

  // ============================================
  // HDC State Operations
  // ============================================

  /**
   * Save HDC memory state
   * @param agentId - Agent identifier
   * @param state - Serialized HDC state
   */
  saveHdcState(agentId: string, state: HdcSerializedState): Promise<void>;

  /**
   * Load HDC memory state
   * @param agentId - Agent identifier
   * @returns Serialized state or null if not found
   */
  loadHdcState(agentId: string): Promise<HdcSerializedState | null>;

  /**
   * Delete HDC state for an agent
   * @param agentId - Agent identifier
   */
  deleteHdcState(agentId: string): Promise<void>;

  // ============================================
  // BTSP State Operations
  // ============================================

  /**
   * Save BTSP learner state
   * @param agentId - Agent identifier
   * @param state - Serialized BTSP state
   */
  saveBtspState(agentId: string, state: BTSPSerializedState): Promise<void>;

  /**
   * Load BTSP learner state
   * @param agentId - Agent identifier
   * @returns Serialized state or null if not found
   */
  loadBtspState(agentId: string): Promise<BTSPSerializedState | null>;

  /**
   * Delete BTSP state for an agent
   * @param agentId - Agent identifier
   */
  deleteBtspState(agentId: string): Promise<void>;

  // ============================================
  // Circadian State Operations
  // ============================================

  /**
   * Save circadian controller state
   * @param agentId - Agent identifier
   * @param state - Serialized circadian state
   */
  saveCircadianState(agentId: string, state: CircadianSerializedState): Promise<void>;

  /**
   * Load circadian controller state
   * @param agentId - Agent identifier
   * @returns Serialized state or null if not found
   */
  loadCircadianState(agentId: string): Promise<CircadianSerializedState | null>;

  /**
   * Delete circadian state for an agent
   * @param agentId - Agent identifier
   */
  deleteCircadianState(agentId: string): Promise<void>;

  // ============================================
  // Bulk Operations
  // ============================================

  /**
   * Delete all state for an agent
   * @param agentId - Agent identifier
   */
  deleteAllState(agentId: string): Promise<void>;

  /**
   * List all agents with stored state
   * @returns Array of agent IDs
   */
  listAgents(): Promise<string[]>;

  /**
   * Get metadata about stored state
   * @param agentId - Agent identifier
   * @param component - Optional: specific component
   * @returns Metadata array
   */
  getStateMetadata(
    agentId: string,
    component?: NervousSystemComponent
  ): Promise<StoredStateMetadata[]>;

  // ============================================
  // Store Information
  // ============================================

  /**
   * Get information about the store implementation
   */
  getStoreInfo(): {
    type: 'sqlite' | 'supabase' | 'file' | 'memory';
    version: string;
    location?: string;
  };
}

/**
 * Factory function type for creating stores
 */
export type NervousSystemStoreFactory = (
  config?: Record<string, unknown>
) => INervousSystemStore;
