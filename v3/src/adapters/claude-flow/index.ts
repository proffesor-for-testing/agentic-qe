/**
 * Claude Flow Adapters
 * Bridges for optional Claude Flow MCP integration
 *
 * These adapters provide enhanced capabilities when Claude Flow is installed:
 * - SONA trajectory tracking for reinforcement learning
 * - 3-tier model routing (haiku/sonnet/opus)
 * - Codebase pretrain analysis
 *
 * When Claude Flow is not available, they gracefully fall back to:
 * - Local SQLite trajectory storage
 * - Rule-based model routing
 * - AQE's built-in project analyzer
 */

export type {
  Trajectory,
  TrajectoryStep,
  ModelRoutingResult,
  ModelRoutingOutcome,
  PretrainResult,
  ClaudeFlowPattern,
  PatternSearchResult,
  BridgeStatus,
} from './types.js';

export {
  TrajectoryBridge,
  createTrajectoryBridge,
} from './trajectory-bridge.js';

export {
  ModelRouterBridge,
  createModelRouterBridge,
} from './model-router-bridge.js';

export {
  PretrainBridge,
  createPretrainBridge,
} from './pretrain-bridge.js';

/**
 * Unified Claude Flow bridge that manages all sub-bridges
 */
export class ClaudeFlowBridge {
  readonly trajectory: TrajectoryBridge;
  readonly modelRouter: ModelRouterBridge;
  readonly pretrain: PretrainBridge;

  private initialized = false;

  constructor(private options: { projectRoot: string }) {
    this.trajectory = new TrajectoryBridge(options);
    this.modelRouter = new ModelRouterBridge(options);
    this.pretrain = new PretrainBridge(options);
  }

  /**
   * Initialize all bridges
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await Promise.all([
      this.trajectory.initialize(),
      this.modelRouter.initialize(),
      this.pretrain.initialize(),
    ]);

    this.initialized = true;
  }

  /**
   * Get bridge status
   */
  getStatus(): BridgeStatus {
    return {
      available: this.isAvailable(),
      features: {
        trajectories: this.trajectory.isClaudeFlowAvailable(),
        modelRouting: this.modelRouter.isClaudeFlowAvailable(),
        pretrain: this.pretrain.isClaudeFlowAvailable(),
        patternSearch: this.trajectory.isClaudeFlowAvailable(), // Uses same check
      },
    };
  }

  /**
   * Check if any Claude Flow features are available
   */
  isAvailable(): boolean {
    return (
      this.trajectory.isClaudeFlowAvailable() ||
      this.modelRouter.isClaudeFlowAvailable() ||
      this.pretrain.isClaudeFlowAvailable()
    );
  }
}

/**
 * Create unified Claude Flow bridge
 */
export function createClaudeFlowBridge(options: { projectRoot: string }): ClaudeFlowBridge {
  return new ClaudeFlowBridge(options);
}

// Re-export bridge classes for direct use
import { TrajectoryBridge } from './trajectory-bridge.js';
import { ModelRouterBridge } from './model-router-bridge.js';
import { PretrainBridge } from './pretrain-bridge.js';
import type { BridgeStatus } from './types.js';
