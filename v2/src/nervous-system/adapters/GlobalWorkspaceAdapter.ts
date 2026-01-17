/**
 * Global Workspace Adapter for RuVector Nervous System
 *
 * Implements Global Workspace Theory for agent coordination:
 * - Limited attention capacity (Miller's Law: 7 +/- 2 items)
 * - Salience-based competition for attention slots
 * - Natural bottleneck prevents information overload
 * - Agents check if they have attention before full execution
 *
 * @see Baars, B.J. (1988) A Cognitive Theory of Consciousness
 * @module nervous-system/adapters/GlobalWorkspaceAdapter
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import init, {
  GlobalWorkspace,
  WorkspaceItem,
} from '@ruvector/nervous-system-wasm';

/**
 * Resolve WASM file path from node_modules
 * Works in both CommonJS and ESM environments
 */
function resolveWasmPath(): string {
  // Try to resolve from require.resolve (CommonJS)
  try {
    const packagePath = require.resolve('@ruvector/nervous-system-wasm');
    const packageDir = packagePath.substring(0, packagePath.lastIndexOf('/'));
    return join(packageDir, 'ruvector_nervous_system_wasm_bg.wasm');
  } catch {
    // Fallback: look relative to process.cwd()
    return join(
      process.cwd(),
      'node_modules',
      '@ruvector',
      'nervous-system-wasm',
      'ruvector_nervous_system_wasm_bg.wasm'
    );
  }
}

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Agent representation for workspace broadcasting
 *
 * Agents broadcast their representations to compete for limited attention slots.
 * High-salience items win attention; low-salience items are filtered out.
 */
export interface AgentRepresentation {
  /** Unique identifier for the agent */
  agentId: string;

  /** Content vector - can be embeddings, state representations, or priority signals */
  content: number[] | Float32Array;

  /** Salience/priority value (0.0-1.0). Higher = more important */
  salience: number;

  /** Unix timestamp in milliseconds when representation was created */
  timestamp: number;
}

/**
 * Result of workspace attention competition
 */
export interface AttentionResult {
  /** Agent ID that won attention */
  agentId: string;

  /** Current salience after decay/competition */
  salience: number;

  /** Original content vector */
  content: Float32Array;

  /** Whether this agent currently holds attention */
  hasAttention: boolean;

  /** Rank in attention hierarchy (0 = most salient) */
  rank: number;
}

/**
 * Workspace occupancy metrics
 */
export interface WorkspaceOccupancy {
  /** Current number of items in workspace */
  current: number;

  /** Maximum capacity of workspace */
  capacity: number;

  /** Available slots remaining */
  available: number;

  /** Load as percentage (0.0-1.0) */
  load: number;

  /** Whether workspace is full */
  isFull: boolean;

  /** Whether workspace is empty */
  isEmpty: boolean;
}

/**
 * Synchronization metrics for agent coordination
 */
export interface SynchronizationMetrics {
  /** Average salience across all workspace items */
  averageSalience: number;

  /** Number of active attention holders */
  activeAgents: number;

  /** Time since last competition (ms) */
  timeSinceCompetition: number;

  /** Synchronization score (0.0-1.0) based on salience distribution */
  synchronizationScore: number;
}

/**
 * Configuration options for GlobalWorkspaceAdapter
 */
export interface GlobalWorkspaceConfig {
  /** Maximum attention capacity (default: 7, per Miller's Law) */
  capacity?: number;

  /** Minimum salience threshold for acceptance (default: 0.1) */
  threshold?: number;

  /** Salience decay rate per competition cycle (default: 0.05) */
  decayRate?: number;

  /** Default item lifetime in milliseconds (default: 30000) */
  defaultLifetimeMs?: number;
}

/**
 * Global Workspace interface defining the adapter contract
 */
export interface IGlobalWorkspace {
  /**
   * Broadcast an agent representation to the workspace
   * @param rep - Agent representation to broadcast
   * @returns True if accepted into workspace, false if rejected
   */
  broadcast(rep: AgentRepresentation): boolean;

  /**
   * Run competition for attention slots
   * Applies salience decay and removes expired/low-salience items
   */
  compete(): void;

  /**
   * Retrieve top-k attention winners
   * @param k - Number of top items to retrieve
   * @returns Array of attention results sorted by salience
   */
  retrieveTopK(k: number): AttentionResult[];

  /**
   * Get current workspace occupancy metrics
   * @returns Occupancy information
   */
  getOccupancy(): WorkspaceOccupancy;

  /**
   * Get agent synchronization metrics
   * @returns Synchronization information
   */
  getSynchronization(): SynchronizationMetrics;

  /**
   * Check if a specific agent currently has attention
   * @param agentId - Agent ID to check
   * @returns True if agent has attention slot
   */
  hasAttention(agentId: string): boolean;

  /**
   * Clear all items from workspace
   */
  clear(): void;

  /**
   * Dispose of resources
   */
  dispose(): void;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Global Workspace Adapter wrapping WASM GlobalWorkspace
 *
 * Provides agent coordination through limited attention capacity.
 * Based on Global Workspace Theory, this creates a natural bottleneck
 * that prevents information overload while ensuring high-priority
 * items receive processing resources.
 *
 * @example
 * ```typescript
 * // Initialize adapter
 * const workspace = await GlobalWorkspaceAdapter.create({ capacity: 7 });
 *
 * // Agent broadcasts its representation
 * const accepted = workspace.broadcast({
 *   agentId: 'test-generator',
 *   content: new Float32Array([0.9, 0.8, 0.7]),
 *   salience: 0.85,
 *   timestamp: Date.now()
 * });
 *
 * // Run competition
 * workspace.compete();
 *
 * // Check if agent has attention before executing
 * if (workspace.hasAttention('test-generator')) {
 *   // Execute full agent logic
 * }
 *
 * // Get top attention winners
 * const winners = workspace.retrieveTopK(4);
 * ```
 */
export class GlobalWorkspaceAdapter implements IGlobalWorkspace {
  private workspace: GlobalWorkspace;
  private agentSourceMap: Map<number, string>;
  private sourceIdCounter: number;
  private lastCompetitionTime: number;
  private config: Required<GlobalWorkspaceConfig>;

  /** Whether WASM has been initialized */
  private static wasmInitialized = false;

  /**
   * Private constructor - use create() factory method
   */
  private constructor(config: Required<GlobalWorkspaceConfig>) {
    this.config = config;
    this.agentSourceMap = new Map();
    this.sourceIdCounter = 0;
    this.lastCompetitionTime = Date.now();

    // Create workspace with threshold if specified
    if (config.threshold > 0) {
      this.workspace = GlobalWorkspace.with_threshold(
        config.capacity,
        config.threshold
      );
    } else {
      this.workspace = new GlobalWorkspace(config.capacity);
    }

    // Set decay rate
    this.workspace.set_decay_rate(config.decayRate);
  }

  /**
   * Initialize WASM module for Node.js environment
   *
   * Must be called before creating any GlobalWorkspaceAdapter instances.
   * Safe to call multiple times - will only initialize once.
   */
  static async initializeWasm(): Promise<void> {
    if (GlobalWorkspaceAdapter.wasmInitialized) {
      return;
    }

    // Find the WASM file in node_modules
    const wasmPath = resolveWasmPath();

    // Load WASM bytes
    const wasmBytes = readFileSync(wasmPath);

    // Initialize with the buffer
    await init(wasmBytes);
    GlobalWorkspaceAdapter.wasmInitialized = true;
  }

  /**
   * Factory method to create a new GlobalWorkspaceAdapter
   *
   * @param config - Configuration options
   * @returns Initialized GlobalWorkspaceAdapter instance
   *
   * @example
   * ```typescript
   * const workspace = await GlobalWorkspaceAdapter.create({
   *   capacity: 7,        // Miller's Law: 7 +/- 2
   *   threshold: 0.1,     // Minimum salience to enter workspace
   *   decayRate: 0.05,    // Salience decay per competition
   *   defaultLifetimeMs: 30000  // 30 second lifetime
   * });
   * ```
   */
  static async create(
    config: GlobalWorkspaceConfig = {}
  ): Promise<GlobalWorkspaceAdapter> {
    // Ensure WASM is initialized
    await GlobalWorkspaceAdapter.initializeWasm();

    // Apply defaults (Miller's Law: 7 +/- 2, we use 7)
    const fullConfig: Required<GlobalWorkspaceConfig> = {
      capacity: config.capacity ?? 7,
      threshold: config.threshold ?? 0.1,
      decayRate: config.decayRate ?? 0.05,
      defaultLifetimeMs: config.defaultLifetimeMs ?? 30000,
    };

    // Validate capacity (Miller's Law bounds)
    if (fullConfig.capacity < 4 || fullConfig.capacity > 9) {
      console.warn(
        `[GlobalWorkspaceAdapter] Capacity ${fullConfig.capacity} outside Miller's Law bounds (4-9). ` +
          'Consider using 5-7 for optimal agent coordination.'
      );
    }

    return new GlobalWorkspaceAdapter(fullConfig);
  }

  /**
   * Synchronous factory method for when WASM is pre-initialized
   *
   * @param config - Configuration options
   * @returns GlobalWorkspaceAdapter instance
   * @throws Error if WASM is not initialized
   */
  static createSync(config: GlobalWorkspaceConfig = {}): GlobalWorkspaceAdapter {
    if (!GlobalWorkspaceAdapter.wasmInitialized) {
      throw new Error(
        '[GlobalWorkspaceAdapter] WASM not initialized. Call initializeWasm() first or use create().'
      );
    }

    const fullConfig: Required<GlobalWorkspaceConfig> = {
      capacity: config.capacity ?? 7,
      threshold: config.threshold ?? 0.1,
      decayRate: config.decayRate ?? 0.05,
      defaultLifetimeMs: config.defaultLifetimeMs ?? 30000,
    };

    return new GlobalWorkspaceAdapter(fullConfig);
  }

  /**
   * Get or create a source ID for an agent
   */
  private getSourceId(agentId: string): number {
    // Check if agent already has a source ID
    for (const [sourceId, id] of this.agentSourceMap) {
      if (id === agentId) {
        return sourceId;
      }
    }

    // Assign new source ID
    const sourceId = this.sourceIdCounter++;
    this.agentSourceMap.set(sourceId, agentId);
    return sourceId;
  }

  /**
   * Get agent ID from source ID
   */
  private getAgentId(sourceId: number): string | undefined {
    return this.agentSourceMap.get(sourceId);
  }

  /**
   * Broadcast an agent representation to the workspace
   *
   * The representation competes for one of the limited attention slots.
   * High-salience items are more likely to be accepted and maintained.
   *
   * @param rep - Agent representation to broadcast
   * @returns True if accepted into workspace, false if rejected
   */
  broadcast(rep: AgentRepresentation): boolean {
    // Validate salience bounds
    const salience = Math.max(0, Math.min(1, rep.salience));

    // Convert content to Float32Array if needed
    const content =
      rep.content instanceof Float32Array
        ? rep.content
        : new Float32Array(rep.content);

    // Get/create source ID for agent
    const sourceId = this.getSourceId(rep.agentId);

    // Convert timestamp to BigInt (WASM requires BigInt for timestamp)
    const timestamp = BigInt(rep.timestamp);

    // Create workspace item
    const item = new WorkspaceItem(content, salience, sourceId, timestamp);

    // Broadcast to workspace
    const accepted = this.workspace.broadcast(item);

    return accepted;
  }

  /**
   * Run competition for attention slots
   *
   * This applies salience decay, removes expired items,
   * and updates the attention hierarchy based on current salience values.
   */
  compete(): void {
    this.workspace.compete();
    this.lastCompetitionTime = Date.now();
  }

  /**
   * Retrieve top-k attention winners
   *
   * Returns the k most salient items currently in the workspace,
   * sorted by salience (highest first).
   *
   * @param k - Number of top items to retrieve (clamped to available)
   * @returns Array of attention results
   */
  retrieveTopK(k: number): AttentionResult[] {
    // Handle empty workspace
    if (this.workspace.len === 0) {
      return [];
    }

    // Clamp k to valid range
    const clampedK = Math.max(1, Math.min(k, this.workspace.len));

    // Get top-k from WASM - returns array of Maps
    const rawItems = this.workspace.retrieve_top_k(clampedK);

    // Handle case where workspace returns undefined or non-array
    if (!rawItems || !Array.isArray(rawItems)) {
      return [];
    }

    // Convert to AttentionResult array
    const results: AttentionResult[] = [];

    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i];

      // WASM returns Maps with keys: content, id, salience, source_module, timestamp
      let sourceModule: number;
      let salience: number;
      let content: Float32Array;

      if (item instanceof Map) {
        // Handle Map return type from WASM
        sourceModule = item.get('source_module') ?? 0;
        salience = item.get('salience') ?? 0;
        const rawContent = item.get('content');
        content = rawContent instanceof Float32Array
          ? rawContent
          : new Float32Array(Array.isArray(rawContent) ? rawContent : []);
      } else {
        // Fallback for direct property access (WorkspaceItem)
        sourceModule =
          typeof item.source_module === 'number' ? item.source_module : 0;
        salience = typeof item.salience === 'number' ? item.salience : 0;
        content =
          item.content instanceof Float32Array
            ? item.content
            : typeof item.get_content === 'function'
              ? item.get_content()
              : new Float32Array(0);
      }

      const agentId = this.getAgentId(sourceModule) ?? `unknown-${sourceModule}`;

      results.push({
        agentId,
        salience,
        content,
        hasAttention: true,
        rank: i,
      });
    }

    return results;
  }

  /**
   * Get current workspace occupancy metrics
   *
   * @returns Occupancy information including load, capacity, and availability
   */
  getOccupancy(): WorkspaceOccupancy {
    const current = this.workspace.len;
    const capacity = this.workspace.capacity;
    const available = this.workspace.available_slots();
    const load = this.workspace.current_load();

    return {
      current,
      capacity,
      available,
      load,
      isFull: this.workspace.is_full(),
      isEmpty: this.workspace.is_empty(),
    };
  }

  /**
   * Get agent synchronization metrics
   *
   * Provides metrics for understanding agent coordination quality:
   * - Average salience indicates overall activity level
   * - Synchronization score measures salience distribution uniformity
   *
   * @returns Synchronization metrics
   */
  getSynchronization(): SynchronizationMetrics {
    const averageSalience = this.workspace.average_salience();
    const activeAgents = this.workspace.len;
    const timeSinceCompetition = Date.now() - this.lastCompetitionTime;

    // Calculate synchronization score based on salience distribution
    // Higher score means more uniform distribution (better coordination)
    // Low variance = high sync, high variance = low sync
    let synchronizationScore = 0;

    if (activeAgents > 0) {
      const topItems = this.retrieveTopK(activeAgents);
      if (topItems.length > 1) {
        // Calculate variance in salience
        const saliences = topItems.map((t) => t.salience);
        const mean = saliences.reduce((a, b) => a + b, 0) / saliences.length;
        const variance =
          saliences.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) /
          saliences.length;

        // Convert variance to synchronization score (inverse relationship)
        // Max variance for [0,1] range is 0.25 (all at 0 or 1)
        synchronizationScore = Math.max(0, 1 - variance * 4);
      } else if (topItems.length === 1) {
        synchronizationScore = 1; // Single agent is perfectly synchronized
      }
    }

    return {
      averageSalience,
      activeAgents,
      timeSinceCompetition,
      synchronizationScore,
    };
  }

  /**
   * Check if a specific agent currently has attention
   *
   * Use this to determine if an agent should execute its full logic
   * or defer to higher-priority agents.
   *
   * @param agentId - Agent ID to check
   * @returns True if agent has an attention slot
   */
  hasAttention(agentId: string): boolean {
    // Handle empty workspace
    if (this.workspace.len === 0) {
      return false;
    }

    // Retrieve all current items - returns array of Maps
    const rawItems = this.workspace.retrieve();

    if (!rawItems || !Array.isArray(rawItems)) {
      return false;
    }

    // Check if agent has a representation in workspace
    for (const item of rawItems) {
      let sourceModule: number;

      if (item instanceof Map) {
        sourceModule = item.get('source_module') ?? -1;
      } else {
        sourceModule =
          typeof item.source_module === 'number' ? item.source_module : -1;
      }

      const itemAgentId = this.getAgentId(sourceModule);

      if (itemAgentId === agentId) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the most salient agent currently in workspace
   *
   * @returns AgentId of most salient agent, or undefined if workspace empty
   */
  getMostSalient(): string | undefined {
    const item = this.workspace.most_salient();

    if (!item) {
      return undefined;
    }

    const sourceModule = item.source_module;
    return this.getAgentId(sourceModule);
  }

  /**
   * Update salience for a specific agent
   *
   * Note: The WASM GlobalWorkspace returns serialized Maps from retrieve(),
   * so direct salience updates on items are not possible. To update an agent's
   * salience, you need to broadcast a new representation with the updated value.
   *
   * @param agentId - Agent to update
   * @param newSalience - New salience value (0.0-1.0)
   * @returns True if agent exists in source map (update requires re-broadcast)
   */
  updateAgentSalience(agentId: string, newSalience: number): boolean {
    // Check if agent exists in source map
    let sourceId: number | undefined;
    for (const [id, aid] of this.agentSourceMap.entries()) {
      if (aid === agentId) {
        sourceId = id;
        break;
      }
    }

    if (sourceId === undefined) {
      return false;
    }

    // Note: WASM retrieve() returns Maps, not live WorkspaceItem references
    // To update salience, the agent must broadcast a new representation
    // This method returns true if the agent is known, indicating a re-broadcast is needed
    console.warn(
      `[GlobalWorkspaceAdapter] updateAgentSalience: Agent "${agentId}" found. ` +
      `To update salience to ${newSalience}, broadcast a new representation.`
    );

    return true;
  }

  /**
   * Clear all items from workspace
   */
  clear(): void {
    this.workspace.clear();
    this.agentSourceMap.clear();
    this.sourceIdCounter = 0;
  }

  /**
   * Dispose of resources
   *
   * Call this when done with the adapter to free WASM memory.
   */
  dispose(): void {
    this.workspace.free();
    this.agentSourceMap.clear();
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<Required<GlobalWorkspaceConfig>> {
    return { ...this.config };
  }

  /**
   * Get adapter statistics for debugging
   */
  getStats(): {
    occupancy: WorkspaceOccupancy;
    synchronization: SynchronizationMetrics;
    config: Required<GlobalWorkspaceConfig>;
    agentCount: number;
  } {
    return {
      occupancy: this.getOccupancy(),
      synchronization: this.getSynchronization(),
      config: this.getConfig(),
      agentCount: this.agentSourceMap.size,
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a default GlobalWorkspaceAdapter with Miller's Law capacity
 *
 * Convenience function for quick initialization.
 *
 * @returns Initialized GlobalWorkspaceAdapter with default settings
 */
export async function createGlobalWorkspace(): Promise<GlobalWorkspaceAdapter> {
  return GlobalWorkspaceAdapter.create({ capacity: 7 });
}

/**
 * Create a GlobalWorkspaceAdapter optimized for focused attention (4 items)
 *
 * Use this for scenarios requiring very focused agent coordination.
 *
 * @returns Initialized GlobalWorkspaceAdapter with capacity 4
 */
export async function createFocusedWorkspace(): Promise<GlobalWorkspaceAdapter> {
  return GlobalWorkspaceAdapter.create({
    capacity: 4,
    threshold: 0.2, // Higher threshold for focused attention
    decayRate: 0.08, // Faster decay to maintain focus
  });
}

/**
 * Create a GlobalWorkspaceAdapter with expanded attention (9 items)
 *
 * Use this for scenarios requiring broader agent coordination.
 *
 * @returns Initialized GlobalWorkspaceAdapter with capacity 9
 */
export async function createExpandedWorkspace(): Promise<GlobalWorkspaceAdapter> {
  return GlobalWorkspaceAdapter.create({
    capacity: 9,
    threshold: 0.05, // Lower threshold for broader inclusion
    decayRate: 0.03, // Slower decay to maintain more items
  });
}
