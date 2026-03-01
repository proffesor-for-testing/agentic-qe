/**
 * Agentic QE v3 - Work Stealing Coordinator
 * Enables idle agents to steal stale claims for load balancing
 *
 * Work stealing algorithm:
 * 1. Identify idle agents (no claims, idle > threshold)
 * 2. Find stale claims (claimed but inactive > threshold)
 * 3. Match idle agents to stealable claims by domain/capability
 * 4. Execute steal with proper handoff semantics
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Claim,
  Claimant,
  ClaimType,
  WorkStealingConfig,
  IWorkStealingCoordinator,
  IClaimService,
  IClaimRepository,
  StealClaimInput,
} from './interfaces';
import { EventBus } from '../../kernel/interfaces';
import { DomainEvent, DomainName, AgentType } from '../../shared/types';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_WORK_STEALING_CONFIG: WorkStealingConfig = {
  enabled: true,
  idleThresholdMs: 30000, // 30 seconds
  stealBatchSize: 5,
  checkIntervalMs: 30000, // Check every 30 seconds
  prioritizeByPriority: true,
  allowCrossDomain: false,
};

// ============================================================================
// Agent Activity Tracking
// ============================================================================

interface AgentActivity {
  agentId: string;
  claimant: Claimant;
  lastActivityAt: Date;
  currentClaimId?: string;
}

// ============================================================================
// Work Stealing Coordinator Implementation
// ============================================================================

export class WorkStealingCoordinator implements IWorkStealingCoordinator {
  private readonly config: WorkStealingConfig;
  private readonly agentActivity = new Map<string, AgentActivity>();
  private checkTimer: NodeJS.Timeout | null = null;
  private initialized = false;

  constructor(
    private readonly claimService: IClaimService,
    private readonly repository: IClaimRepository,
    private readonly eventBus?: EventBus,
    config: Partial<WorkStealingConfig> = {}
  ) {
    this.config = { ...DEFAULT_WORK_STEALING_CONFIG, ...config };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.enabled) {
      this.checkTimer = setInterval(
        () => this.checkAndSteal().catch(console.error),
        this.config.checkIntervalMs
      );
    }

    this.initialized = true;
  }

  async dispose(): Promise<void> {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    this.agentActivity.clear();
    this.initialized = false;
  }

  // ============================================================================
  // Work Stealing Logic
  // ============================================================================

  async checkAndSteal(): Promise<number> {
    // Note: enabled only controls the automatic timer, manual calls always work
    const idleAgents = this.getIdleAgents();
    if (idleAgents.length === 0) return 0;

    let totalStolen = 0;

    for (const agent of idleAgents) {
      // Check batch limit per round
      if (totalStolen >= this.config.stealBatchSize) break;

      const stealableClaims = await this.getStealableClaims(agent);
      if (stealableClaims.length === 0) continue;

      // Steal the best matching claim
      const claim = stealableClaims[0];

      try {
        const stealInput: StealClaimInput = {
          claimId: claim.id,
          newClaimant: agent,
          reason: 'stale',
        };

        await this.claimService.steal(stealInput);
        totalStolen++;

        // Update agent activity
        this.recordActivity(agent.id, claim.id);

        // Emit event
        await this.emitStealEvent(claim, agent);
      } catch (error) {
        console.error(`Failed to steal claim ${claim.id} for agent ${agent.id}:`, error);
      }
    }

    return totalStolen;
  }

  async getStealableClaims(idleAgent: Claimant): Promise<Claim[]> {
    // Find stale claims
    const staleClaims = await this.repository.findStale(this.config.idleThresholdMs);

    // Filter by agent compatibility
    const compatible = staleClaims.filter(claim => {
      // Must be in claimed status
      if (claim.status !== 'claimed' && claim.status !== 'in-progress') {
        return false;
      }

      // Don't steal from same agent
      if (claim.claimant?.id === idleAgent.id) {
        return false;
      }

      // Check domain compatibility
      if (!this.config.allowCrossDomain && idleAgent.domain) {
        if (claim.domain !== idleAgent.domain) {
          return false;
        }
      }

      // Check steal count limit
      // (handled in claim service, but good to filter early)

      return true;
    });

    // Sort by priority if configured
    if (this.config.prioritizeByPriority) {
      const priorityOrder = { p0: 0, p1: 1, p2: 2, p3: 3 };
      compatible.sort((a, b) => {
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;

        // Then by staleness (oldest update first)
        return a.updatedAt.getTime() - b.updatedAt.getTime();
      });
    } else {
      // Sort by staleness only
      compatible.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
    }

    return compatible;
  }

  // ============================================================================
  // Agent Activity Tracking
  // ============================================================================

  recordActivity(agentId: string, claimId?: string): void {
    const existing = this.agentActivity.get(agentId);

    if (existing) {
      this.agentActivity.set(agentId, {
        ...existing,
        lastActivityAt: new Date(),
        currentClaimId: claimId ?? existing.currentClaimId,
      });
    }
  }

  /**
   * Register an agent for activity tracking
   */
  registerAgent(claimant: Claimant): void {
    this.agentActivity.set(claimant.id, {
      agentId: claimant.id,
      claimant,
      lastActivityAt: new Date(),
    });
  }

  /**
   * Unregister an agent from activity tracking
   */
  unregisterAgent(agentId: string): void {
    this.agentActivity.delete(agentId);
  }

  getIdleAgents(): Claimant[] {
    const now = Date.now();
    const threshold = this.config.idleThresholdMs;

    const idleAgents: Claimant[] = [];

    for (const activity of this.agentActivity.values()) {
      const idleTime = now - activity.lastActivityAt.getTime();

      if (idleTime >= threshold && !activity.currentClaimId) {
        idleAgents.push(activity.claimant);
      }
    }

    return idleAgents;
  }

  getBusyAgents(): Claimant[] {
    const now = Date.now();
    const threshold = this.config.idleThresholdMs;

    const busyAgents: Claimant[] = [];

    for (const activity of this.agentActivity.values()) {
      const idleTime = now - activity.lastActivityAt.getTime();

      if (idleTime < threshold || activity.currentClaimId) {
        busyAgents.push(activity.claimant);
      }
    }

    return busyAgents;
  }

  /**
   * Mark an agent as having completed their current claim
   */
  markClaimCompleted(agentId: string): void {
    const existing = this.agentActivity.get(agentId);

    if (existing) {
      this.agentActivity.set(agentId, {
        ...existing,
        lastActivityAt: new Date(),
        currentClaimId: undefined,
      });
    }
  }

  /**
   * Get all tracked agents
   */
  getTrackedAgents(): AgentActivity[] {
    return Array.from(this.agentActivity.values());
  }

  /**
   * Set activity time for an agent (for testing purposes)
   */
  setAgentActivityTime(agentId: string, time: Date): void {
    const existing = this.agentActivity.get(agentId);
    if (existing) {
      this.agentActivity.set(agentId, {
        ...existing,
        lastActivityAt: time,
      });
    }
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Enable work stealing
   */
  enable(): void {
    if (!this.checkTimer) {
      this.checkTimer = setInterval(
        () => this.checkAndSteal().catch(console.error),
        this.config.checkIntervalMs
      );
    }
  }

  /**
   * Disable work stealing
   */
  disable(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * Check if work stealing is enabled
   */
  isEnabled(): boolean {
    return this.checkTimer !== null;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<WorkStealingConfig>): void {
    Object.assign(this.config, config);

    // Restart timer if interval changed
    if (config.checkIntervalMs && this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = setInterval(
        () => this.checkAndSteal().catch(console.error),
        this.config.checkIntervalMs
      );
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async emitStealEvent(claim: Claim, newClaimant: Claimant): Promise<void> {
    if (!this.eventBus) return;

    const event: DomainEvent = {
      id: uuidv4(),
      type: 'ClaimsWorkStealingOccurred',
      timestamp: new Date(),
      source: claim.domain,
      correlationId: claim.correlationId,
      payload: {
        claimId: claim.id,
        previousClaimant: claim.claimant,
        newClaimant,
        staleDuration: Date.now() - claim.updatedAt.getTime(),
        stealCount: claim.stealCount + 1,
      },
    };

    await this.eventBus.publish(event);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a work stealing coordinator
 */
export function createWorkStealingCoordinator(
  claimService: IClaimService,
  repository: IClaimRepository,
  eventBus?: EventBus,
  config?: Partial<WorkStealingConfig>
): WorkStealingCoordinator {
  return new WorkStealingCoordinator(claimService, repository, eventBus, config);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if an agent can work on a specific claim type
 */
export function canAgentHandleClaimType(
  agentType: AgentType | undefined,
  claimType: ClaimType
): boolean {
  if (!agentType) return true; // Allow if no type specified

  const typeMapping: Record<ClaimType, AgentType[]> = {
    'coverage-gap': ['generator', 'tester', 'analyzer'],
    'flaky-test': ['tester', 'analyzer', 'validator'],
    'defect-investigation': ['analyzer', 'validator', 'specialist'],
    'test-review': ['reviewer', 'validator', 'coordinator'],
  };

  const allowedTypes = typeMapping[claimType];
  return allowedTypes.includes(agentType);
}

/**
 * Calculate priority score for work stealing
 * Higher score = higher priority to steal
 */
export function calculateStealPriority(claim: Claim): number {
  let score = 0;

  // Priority weight (p0 = 100, p1 = 75, p2 = 50, p3 = 25)
  const priorityScores = { p0: 100, p1: 75, p2: 50, p3: 25 };
  score += priorityScores[claim.priority];

  // Staleness weight (older = higher priority)
  const staleness = Date.now() - claim.updatedAt.getTime();
  score += Math.min(staleness / 60000, 50); // Max 50 points for staleness

  // Deadline weight (closer deadline = higher priority)
  if (claim.deadline) {
    const timeToDeadline = claim.deadline.getTime() - Date.now();
    if (timeToDeadline < 3600000) {
      // Less than 1 hour
      score += 50;
    } else if (timeToDeadline < 86400000) {
      // Less than 1 day
      score += 25;
    }
  }

  // Steal count penalty (already stolen multiple times)
  score -= claim.stealCount * 10;

  return score;
}
