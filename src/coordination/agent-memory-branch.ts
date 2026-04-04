/**
 * Agent Memory Branching via RVF Copy-on-Write (ADR-067)
 *
 * Provides per-agent isolated memory branches using RVF's COW derive().
 * Each spawned agent gets a lightweight .rvf branch file that shares
 * the parent's data via copy-on-write. Writes are isolated to the branch.
 *
 * Lifecycle:
 *   spawn → createBranch() → agent works on isolated branch
 *   success → mergeBranch() → changed vectors flow back to parent
 *   failure → discardBranch() → delete branch file (zero cost)
 *
 * Storage cost: ~0.5% of parent for typical agent workloads
 * (only changed vectors are physically copied).
 *
 * @module coordination/agent-memory-branch
 */

import { existsSync, mkdirSync, unlinkSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import type {
  RvfNativeAdapter,
} from '../integrations/ruvector/rvf-native-adapter.js';
import type { WitnessChain } from '../audit/witness-chain.js';

// ============================================================================
// Types
// ============================================================================

export interface BranchHandle {
  /** Agent ID that owns this branch */
  agentId: string;
  /** Path to the child .rvf file */
  childPath: string;
  /** Path to the parent .rvf file */
  parentPath: string;
  /** The child RVF adapter (for agent to use) */
  childAdapter: RvfNativeAdapter;
  /** When the branch was created */
  createdAt: number;
  /**
   * Ingest log — records vectors the agent added to the child.
   * On merge, these are replayed into the parent. This is necessary
   * because the RVF NAPI doesn't expose "read vector by ID."
   */
  ingestLog: Array<{ id: string; vector: Float32Array }>;
}

export interface BranchInfo {
  /** Agent ID (derived from filename) */
  agentId: string;
  /** Path to the branch .rvf file */
  path: string;
  /** File size in bytes */
  sizeBytes: number;
  /** When the file was last modified */
  modifiedAt: Date;
}

export type MergeStrategy = 'child-wins' | 'parent-wins';

export interface MergeResult {
  /** Number of vectors merged from child to parent */
  vectorsMerged: number;
  /** Strategy used */
  strategy: MergeStrategy;
  /** Duration of merge in milliseconds */
  durationMs: number;
}

export interface AgentMemoryBranchConfig {
  /** Directory to store branch .rvf files (default: .agentic-qe/branches/) */
  branchDir: string;
  /** Default merge strategy (default: child-wins) */
  defaultStrategy: MergeStrategy;
  /** Max age in ms before orphan cleanup (default: 1 hour) */
  orphanMaxAgeMs: number;
}

const DEFAULT_CONFIG: AgentMemoryBranchConfig = {
  branchDir: '.agentic-qe/branches',
  defaultStrategy: 'child-wins',
  orphanMaxAgeMs: 3600_000, // 1 hour
};

// ============================================================================
// AgentMemoryBranch Service
// ============================================================================

export class AgentMemoryBranch {
  private readonly config: AgentMemoryBranchConfig;
  private readonly parentAdapter: RvfNativeAdapter;
  private readonly activeBranches = new Map<string, BranchHandle>();
  private witnessChain: WitnessChain | null = null;

  constructor(
    parentAdapter: RvfNativeAdapter,
    config?: Partial<AgentMemoryBranchConfig>,
  ) {
    this.parentAdapter = parentAdapter;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Attach a witness chain for merge/discard audit trail */
  setWitnessChain(wc: WitnessChain): void {
    this.witnessChain = wc;
  }

  // --------------------------------------------------------------------------
  // Branch Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Create a COW branch for an agent.
   * The child .rvf inherits all parent data via copy-on-write.
   * Reads fall through to parent; writes are isolated to the child.
   */
  createBranch(agentId: string): BranchHandle {
    if (this.activeBranches.has(agentId)) {
      throw new Error(`Branch already exists for agent ${agentId}`);
    }

    // Ensure branch directory exists
    if (!existsSync(this.config.branchDir)) {
      mkdirSync(this.config.branchDir, { recursive: true });
    }

    const childPath = join(this.config.branchDir, `${agentId}.rvf`);
    const parentPath = this.parentAdapter.path();

    // COW derive — creates lightweight child sharing parent's data
    const childAdapter = this.parentAdapter.derive(childPath);

    const handle: BranchHandle = {
      agentId,
      childPath,
      parentPath,
      childAdapter,
      createdAt: Date.now(),
      ingestLog: [],
    };

    this.activeBranches.set(agentId, handle);

    return handle;
  }

  /**
   * Record a vector that an agent ingested into its branch.
   * This log is replayed into the parent on merge (child-wins strategy).
   *
   * Agents MUST call this alongside childAdapter.ingest() so that
   * merge can replay the actual vectors into the parent.
   */
  recordIngest(agentId: string, entries: Array<{ id: string; vector: Float32Array }>): void {
    const handle = this.activeBranches.get(agentId);
    if (!handle) return;
    for (const entry of entries) {
      handle.ingestLog.push({ id: entry.id, vector: entry.vector });
    }
  }

  /**
   * Merge a successful agent's branch back to the parent.
   * Replays the agent's ingest log into the parent (child-wins) or
   * discards all child changes (parent-wins).
   */
  async mergeBranch(
    handle: BranchHandle,
    strategy?: MergeStrategy,
  ): Promise<MergeResult> {
    const mergeStrategy = strategy ?? this.config.defaultStrategy;
    const startTime = performance.now();
    let vectorsMerged = 0;

    if (mergeStrategy === 'child-wins' && handle.ingestLog.length > 0) {
      // Replay the agent's ingest log into the parent
      // These are the actual vectors the agent wrote — no zero-vector placeholders
      try {
        const result = this.parentAdapter.ingest(handle.ingestLog);
        vectorsMerged = result.accepted;
      } catch (error) {
        console.warn(
          `[AgentMemoryBranch] Merge replay failed for ${handle.agentId}:`,
          error,
        );
      }
    }
    // parent-wins: nothing to do — child changes are discarded

    // Record in witness chain
    this.witnessChain?.append(
      'BRANCH_MERGE',
      {
        agentId: handle.agentId,
        strategy: mergeStrategy,
        vectorsMerged,
        branchPath: handle.childPath,
      },
      `agent-${handle.agentId}`,
    );

    // Cleanup child
    this.cleanupBranchFile(handle);
    this.activeBranches.delete(handle.agentId);

    return {
      vectorsMerged,
      strategy: mergeStrategy,
      durationMs: performance.now() - startTime,
    };
  }

  /**
   * Discard a failed agent's branch.
   * Simply deletes the child .rvf file — zero computational cost.
   */
  discardBranch(handle: BranchHandle): void {
    // Record in witness chain
    this.witnessChain?.append(
      'BRANCH_MERGE', // using existing action type for discard
      {
        agentId: handle.agentId,
        action: 'discard',
        branchPath: handle.childPath,
      },
      `agent-${handle.agentId}`,
    );

    this.cleanupBranchFile(handle);
    this.activeBranches.delete(handle.agentId);
  }

  // --------------------------------------------------------------------------
  // Branch Management
  // --------------------------------------------------------------------------

  /** Get active branch for an agent (if any) */
  getBranch(agentId: string): BranchHandle | undefined {
    return this.activeBranches.get(agentId);
  }

  /** List all active branches */
  getActiveBranches(): BranchHandle[] {
    return Array.from(this.activeBranches.values());
  }

  /** List all branch files on disk (including orphans) */
  listBranchFiles(): BranchInfo[] {
    if (!existsSync(this.config.branchDir)) return [];

    const files = readdirSync(this.config.branchDir)
      .filter(f => f.endsWith('.rvf'));

    return files.map(f => {
      const fullPath = join(this.config.branchDir, f);
      const stat = statSync(fullPath);
      return {
        agentId: basename(f, '.rvf'),
        path: fullPath,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime,
      };
    });
  }

  /**
   * Clean up orphaned branch files older than maxAge.
   * An orphan is a .rvf file in branchDir with no active branch.
   */
  cleanupOrphans(maxAgeMs?: number): number {
    const maxAge = maxAgeMs ?? this.config.orphanMaxAgeMs;
    const now = Date.now();
    let cleaned = 0;

    for (const info of this.listBranchFiles()) {
      const age = now - info.modifiedAt.getTime();
      if (age > maxAge && !this.activeBranches.has(info.agentId)) {
        try {
          unlinkSync(info.path);
          // Also remove idmap sidecar if present
          const idmapPath = `${info.path}.idmap.json`;
          if (existsSync(idmapPath)) unlinkSync(idmapPath);
          cleaned++;
        } catch {
          // Best effort cleanup
        }
      }
    }

    return cleaned;
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private cleanupBranchFile(handle: BranchHandle): void {
    try {
      handle.childAdapter.close();
    } catch { /* best effort */ }

    try {
      if (existsSync(handle.childPath)) {
        unlinkSync(handle.childPath);
      }
      // Remove idmap sidecar
      const idmapPath = `${handle.childPath}.idmap.json`;
      if (existsSync(idmapPath)) {
        unlinkSync(idmapPath);
      }
    } catch { /* best effort */ }
  }
}
