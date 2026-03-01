/**
 * Agentic QE v3 - Base Domain Coordinator
 * CQ-002: Abstract base class that deduplicates lifecycle boilerplate
 * across all 13 domain coordinators.
 *
 * Extracts the common patterns:
 * - MinCut mixin lifecycle (ADR-047)
 * - Consensus mixin lifecycle (MM-001)
 * - Governance mixin lifecycle (ADR-058)
 * - Workflow management (start, complete, fail, progress)
 * - Event subscription scaffolding
 * - Initialized guard
 *
 * Each coordinator extends this and implements:
 * - onInitialize(): domain-specific initialization
 * - onDispose(): domain-specific cleanup
 * - subscribeToEvents(): domain-specific event subscriptions
 */

import type { DomainName } from '../shared/types/index.js';
import type { EventBus } from '../kernel/interfaces.js';

// MinCut mixin (ADR-047)
import {
  MinCutAwareDomainMixin,
  createMinCutAwareMixin,
} from '../coordination/mixins/mincut-aware-domain.js';
import type { QueenMinCutBridge } from '../coordination/mincut/queen-integration.js';
import type { WeakVertex } from '../coordination/mincut/interfaces.js';

// Consensus mixin (MM-001)
import {
  ConsensusEnabledMixin,
  createConsensusEnabledMixin,
  type ConsensusEnabledConfig,
} from '../coordination/mixins/consensus-enabled-domain.js';

// Governance mixin (ADR-058)
import {
  GovernanceAwareDomainMixin,
  createGovernanceAwareMixin,
} from '../coordination/mixins/governance-aware-domain.js';

// ============================================================================
// Workflow Status (shared across all coordinators)
// ============================================================================

/**
 * Generic workflow status tracking used by all domain coordinators.
 * Each coordinator defines its own union of workflow type strings.
 */
export interface BaseWorkflowStatus {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  agentIds: string[];
  progress: number;
  error?: string;
}

// ============================================================================
// Base Coordinator Configuration
// ============================================================================

/**
 * Common configuration fields shared by all domain coordinators.
 */
export interface BaseDomainCoordinatorConfig {
  maxConcurrentWorkflows: number;
  defaultTimeout: number;
  publishEvents: boolean;
  // MinCut integration (ADR-047)
  enableMinCutAwareness: boolean;
  topologyHealthThreshold: number;
  pauseOnCriticalTopology: boolean;
  // Consensus integration (MM-001)
  enableConsensus: boolean;
  consensusThreshold: number;
  consensusStrategy: 'majority' | 'weighted' | 'unanimous';
  consensusMinModels: number;
}

// ============================================================================
// Base Domain Coordinator
// ============================================================================

/**
 * Abstract base class for all domain coordinators.
 *
 * Provides concrete implementations for:
 * - MinCut topology awareness (setMinCutBridge, isTopologyHealthy, etc.)
 * - Consensus lifecycle (initializeConsensus, disposeConsensus, etc.)
 * - Governance mixin access
 * - Workflow management (start, complete, fail, progress tracking)
 * - Initialization guard pattern
 *
 * Subclasses implement:
 * - onInitialize(): domain-specific setup (RL integrations, services, etc.)
 * - onDispose(): domain-specific teardown
 * - subscribeToEvents(): domain-specific event subscriptions
 */
export abstract class BaseDomainCoordinator<
  TConfig extends BaseDomainCoordinatorConfig = BaseDomainCoordinatorConfig,
  TWorkflowType extends string = string,
> {
  protected readonly config: TConfig;
  protected readonly workflows: Map<string, BaseWorkflowStatus> = new Map();
  protected initialized = false;

  // MinCut topology awareness mixin (ADR-047)
  protected readonly minCutMixin: MinCutAwareDomainMixin;

  // Consensus verification mixin (MM-001)
  protected readonly consensusMixin: ConsensusEnabledMixin;

  // Governance mixin (ADR-058)
  protected readonly governanceMixin: GovernanceAwareDomainMixin;

  constructor(
    protected readonly eventBus: EventBus,
    protected readonly domainName: DomainName,
    config: TConfig,
    consensusConfig: Partial<ConsensusEnabledConfig>,
  ) {
    this.config = config;

    // Initialize MinCut-aware mixin (ADR-047)
    this.minCutMixin = createMinCutAwareMixin(this.domainName, {
      enableMinCutAwareness: this.config.enableMinCutAwareness,
      topologyHealthThreshold: this.config.topologyHealthThreshold,
      pauseOnCriticalTopology: this.config.pauseOnCriticalTopology,
    });

    // Initialize Consensus-enabled mixin (MM-001)
    this.consensusMixin = createConsensusEnabledMixin({
      enableConsensus: this.config.enableConsensus,
      consensusThreshold: this.config.consensusThreshold,
      strategy: this.config.consensusStrategy,
      minModels: this.config.consensusMinModels,
      modelTimeout: 60000,
      verifySeverities: ['critical', 'high'],
      enableLogging: false,
      ...consensusConfig,
    });

    // ADR-058: Initialize governance mixin
    this.governanceMixin = createGovernanceAwareMixin(this.domainName);
  }

  // ==========================================================================
  // Lifecycle Methods
  // ==========================================================================

  /**
   * Initialize the coordinator.
   * Handles consensus engine startup and delegates to onInitialize().
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Domain-specific initialization (event subscriptions, state loading, etc.)
    await this.onInitialize();

    // Initialize Consensus engine if enabled (MM-001)
    if (this.config.enableConsensus) {
      try {
        await this.consensusMixin.initializeConsensus();
        console.log(`[${this.domainName}] Consensus engine initialized`);
      } catch (error) {
        console.error(`[${this.domainName}] Failed to initialize consensus engine:`, error);
        console.warn(`[${this.domainName}] Continuing without consensus verification`);
      }
    }

    this.initialized = true;
  }

  /**
   * Dispose resources.
   * Handles consensus/mincut cleanup and delegates to onDispose().
   */
  async dispose(): Promise<void> {
    // Dispose Consensus engine (MM-001)
    try {
      await this.consensusMixin.disposeConsensus();
    } catch (error) {
      console.error(`[${this.domainName}] Error disposing consensus engine:`, error);
    }

    // Dispose MinCut mixin (ADR-047)
    this.minCutMixin.dispose();

    // Domain-specific cleanup
    await this.onDispose();

    this.workflows.clear();
    this.initialized = false;
  }

  /**
   * Domain-specific initialization logic.
   * Called during initialize() before consensus engine startup.
   */
  protected abstract onInitialize(): Promise<void>;

  /**
   * Domain-specific disposal logic.
   * Called during dispose() after consensus/mincut cleanup.
   */
  protected abstract onDispose(): Promise<void>;

  /**
   * Domain-specific event subscriptions.
   * Called by the subclass from within onInitialize().
   */
  protected abstract subscribeToEvents(): void;

  // ==========================================================================
  // MinCut Integration (ADR-047)
  // ==========================================================================

  setMinCutBridge(bridge: QueenMinCutBridge): void {
    this.minCutMixin.setMinCutBridge(bridge);
    console.log(`[${this.domainName}] MinCut bridge connected`);
  }

  isTopologyHealthy(): boolean {
    return this.minCutMixin.isTopologyHealthy();
  }

  getDomainWeakVertices(): WeakVertex[] {
    return this.minCutMixin.getDomainWeakVertices();
  }

  isDomainWeakPoint(): boolean {
    return this.minCutMixin.isDomainWeakPoint();
  }

  getTopologyBasedRouting(targetDomains: DomainName[]): DomainName[] {
    return this.minCutMixin.getTopologyBasedRouting(targetDomains);
  }

  // ==========================================================================
  // Consensus Integration (MM-001)
  // ==========================================================================

  isConsensusAvailable(): boolean {
    return this.consensusMixin.isConsensusAvailable?.() ?? false;
  }

  getConsensusStats() {
    return this.consensusMixin.getConsensusStats();
  }

  // ==========================================================================
  // Workflow Management
  // ==========================================================================

  getActiveWorkflows(): BaseWorkflowStatus[] {
    return Array.from(this.workflows.values()).filter(
      (w) => w.status === 'running' || w.status === 'pending'
    );
  }

  protected startWorkflow(id: string, type: TWorkflowType): void {
    const activeWorkflows = this.getActiveWorkflows();
    if (activeWorkflows.length >= this.config.maxConcurrentWorkflows) {
      throw new Error(
        `Maximum concurrent workflows (${this.config.maxConcurrentWorkflows}) reached`
      );
    }

    this.workflows.set(id, {
      id,
      type,
      status: 'running',
      startedAt: new Date(),
      agentIds: [],
      progress: 0,
    });
  }

  protected completeWorkflow(id: string): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.status = 'completed';
      workflow.completedAt = new Date();
      workflow.progress = 100;
    }
  }

  protected failWorkflow(id: string, error: string): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.status = 'failed';
      workflow.completedAt = new Date();
      workflow.error = error;
    }
  }

  protected addAgentToWorkflow(workflowId: string, agentId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.agentIds.push(agentId);
    }
  }

  protected updateWorkflowProgress(id: string, progress: number): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.progress = Math.min(100, Math.max(0, progress));
    }
  }
}
