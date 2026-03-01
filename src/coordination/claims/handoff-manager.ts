/**
 * Agentic QE v3 - Handoff Manager
 * Manages transitions between human and agent claimants
 *
 * Use cases:
 * - Agent requests human review of generated tests
 * - Human requests agent assistance with investigation
 * - Escalation when agent is stuck
 * - Graceful handoff with context preservation
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Claim,
  Claimant,
  ClaimantType,
  PendingHandoff,
  HandoffInput,
  IHandoffManager,
  IClaimService,
  IClaimRepository,
} from './interfaces';
import { EventBus } from '../../kernel/interfaces';
import { DomainEvent, DomainName, AgentType } from '../../shared/types';

// ============================================================================
// Handoff Configuration
// ============================================================================

export interface HandoffManagerConfig {
  /** Timeout for pending handoffs (ms) */
  handoffTimeoutMs: number;

  /** How often to check for timed out handoffs (ms) */
  checkIntervalMs: number;

  /** Maximum pending handoffs per claim */
  maxPendingPerClaim: number;

  /** Default agent type for agent assist requests */
  defaultAgentType: AgentType;

  /** Enable notifications */
  enableNotifications: boolean;
}

const DEFAULT_CONFIG: HandoffManagerConfig = {
  handoffTimeoutMs: 3600000, // 1 hour
  checkIntervalMs: 60000, // 1 minute
  maxPendingPerClaim: 3,
  defaultAgentType: 'specialist',
  enableNotifications: true,
};

// ============================================================================
// Handoff Manager Implementation
// ============================================================================

export class HandoffManager implements IHandoffManager {
  private readonly config: HandoffManagerConfig;
  private readonly pendingHandoffs = new Map<string, PendingHandoff>();
  private checkTimer: NodeJS.Timeout | null = null;
  private initialized = false;

  constructor(
    private readonly claimService: IClaimService,
    private readonly repository: IClaimRepository,
    private readonly eventBus?: EventBus,
    config: Partial<HandoffManagerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Start cleanup timer
    this.checkTimer = setInterval(
      () => this.cleanupExpiredHandoffs().catch(console.error),
      this.config.checkIntervalMs
    );

    this.initialized = true;
  }

  async dispose(): Promise<void> {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    this.pendingHandoffs.clear();
    this.initialized = false;
  }

  // ============================================================================
  // Handoff Requests
  // ============================================================================

  async requestHumanReview(claimId: string, notes?: string): Promise<void> {
    const claim = await this.repository.get(claimId);

    if (!claim) {
      throw new Error(`Claim not found: ${claimId}`);
    }

    if (!claim.claimant || claim.claimant.type !== 'agent') {
      throw new Error('Claim must be held by an agent to request human review');
    }

    // Check pending limit
    const existingCount = this.getPendingCountForClaim(claimId);
    if (existingCount >= this.config.maxPendingPerClaim) {
      throw new Error(`Maximum pending handoffs (${this.config.maxPendingPerClaim}) reached for claim`);
    }

    const handoff: PendingHandoff = {
      id: `handoff_${uuidv4()}`,
      claimId,
      claim,
      requestedBy: claim.claimant,
      requestedAt: new Date(),
      targetType: 'human',
      notes,
    };

    this.pendingHandoffs.set(handoff.id, handoff);

    // Emit notification event
    await this.emitHandoffRequestedEvent(handoff);
  }

  async requestAgentAssist(claimId: string, preferredDomain?: DomainName): Promise<void> {
    const claim = await this.repository.get(claimId);

    if (!claim) {
      throw new Error(`Claim not found: ${claimId}`);
    }

    if (!claim.claimant || claim.claimant.type !== 'human') {
      throw new Error('Claim must be held by a human to request agent assistance');
    }

    // Check pending limit
    const existingCount = this.getPendingCountForClaim(claimId);
    if (existingCount >= this.config.maxPendingPerClaim) {
      throw new Error(`Maximum pending handoffs (${this.config.maxPendingPerClaim}) reached for claim`);
    }

    const handoff: PendingHandoff = {
      id: `handoff_${uuidv4()}`,
      claimId,
      claim,
      requestedBy: claim.claimant,
      requestedAt: new Date(),
      targetType: 'agent',
      preferredDomain: preferredDomain || claim.domain,
    };

    this.pendingHandoffs.set(handoff.id, handoff);

    // Emit notification event
    await this.emitHandoffRequestedEvent(handoff);
  }

  // ============================================================================
  // Handoff Completion
  // ============================================================================

  async completeHandoff(handoffId: string, toClaimant: Claimant): Promise<Claim> {
    const handoff = this.pendingHandoffs.get(handoffId);

    if (!handoff) {
      throw new Error(`Pending handoff not found: ${handoffId}`);
    }

    // Verify target type matches
    if (toClaimant.type !== handoff.targetType) {
      throw new Error(
        `Claimant type mismatch: expected ${handoff.targetType}, got ${toClaimant.type}`
      );
    }

    // Get current claim state
    const claim = await this.repository.get(handoff.claimId);

    if (!claim) {
      throw new Error(`Claim no longer exists: ${handoff.claimId}`);
    }

    // Perform the handoff
    const handoffInput: HandoffInput = {
      claimId: handoff.claimId,
      fromClaimant: handoff.requestedBy,
      toClaimant,
      notes: handoff.notes,
      context: {
        handoffId,
        requestedAt: handoff.requestedAt.toISOString(),
        targetType: handoff.targetType,
      },
    };

    const updatedClaim = await this.claimService.handoff(handoffInput);

    // Remove from pending
    this.pendingHandoffs.delete(handoffId);

    // Emit completion event
    await this.emitHandoffCompletedEvent(handoff, toClaimant);

    return updatedClaim;
  }

  // ============================================================================
  // Handoff Cancellation
  // ============================================================================

  async cancelHandoff(handoffId: string): Promise<void> {
    const handoff = this.pendingHandoffs.get(handoffId);

    if (!handoff) {
      throw new Error(`Pending handoff not found: ${handoffId}`);
    }

    this.pendingHandoffs.delete(handoffId);

    // Emit cancellation event
    await this.emitHandoffCancelledEvent(handoff);
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  async getPendingHandoffs(): Promise<PendingHandoff[]> {
    return Array.from(this.pendingHandoffs.values());
  }

  /**
   * Get pending handoffs for a specific claim
   */
  async getPendingForClaim(claimId: string): Promise<PendingHandoff[]> {
    return Array.from(this.pendingHandoffs.values()).filter(
      h => h.claimId === claimId
    );
  }

  /**
   * Get pending handoffs by target type
   */
  async getPendingByTargetType(targetType: ClaimantType): Promise<PendingHandoff[]> {
    return Array.from(this.pendingHandoffs.values()).filter(
      h => h.targetType === targetType
    );
  }

  /**
   * Get pending handoffs requested by a specific claimant
   */
  async getPendingByRequestor(requestorId: string): Promise<PendingHandoff[]> {
    return Array.from(this.pendingHandoffs.values()).filter(
      h => h.requestedBy.id === requestorId
    );
  }

  /**
   * Get a specific pending handoff
   */
  async getHandoff(handoffId: string): Promise<PendingHandoff | undefined> {
    return this.pendingHandoffs.get(handoffId);
  }

  // ============================================================================
  // Convenience Methods
  // ============================================================================

  /**
   * Find available agent for handoff
   */
  async findAvailableAgent(
    preferredDomain?: DomainName,
    preferredType?: AgentType
  ): Promise<Claimant | undefined> {
    // This would integrate with agent coordinator in a real implementation
    // For now, return undefined - caller should handle agent selection
    return undefined;
  }

  /**
   * Check if a claim has pending handoffs
   */
  hasPendingHandoffs(claimId: string): boolean {
    return this.getPendingCountForClaim(claimId) > 0;
  }

  /**
   * Get handoff statistics
   */
  getStatistics(): HandoffStatistics {
    const all = Array.from(this.pendingHandoffs.values());

    const byTargetType: Record<ClaimantType, number> = {
      agent: 0,
      human: 0,
    };

    for (const h of all) {
      byTargetType[h.targetType]++;
    }

    const avgWaitTime =
      all.length > 0
        ? all.reduce(
            (sum, h) => sum + (Date.now() - h.requestedAt.getTime()),
            0
          ) / all.length
        : 0;

    return {
      totalPending: all.length,
      byTargetType,
      avgWaitTimeMs: avgWaitTime,
      oldestHandoffAt: all.length > 0
        ? all.reduce(
            (oldest, h) =>
              h.requestedAt < oldest ? h.requestedAt : oldest,
            all[0].requestedAt
          )
        : undefined,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private getPendingCountForClaim(claimId: string): number {
    return Array.from(this.pendingHandoffs.values()).filter(
      h => h.claimId === claimId
    ).length;
  }

  private async cleanupExpiredHandoffs(): Promise<void> {
    const now = Date.now();
    const expired: PendingHandoff[] = [];

    for (const handoff of this.pendingHandoffs.values()) {
      const age = now - handoff.requestedAt.getTime();
      if (age >= this.config.handoffTimeoutMs) {
        expired.push(handoff);
      }
    }

    for (const handoff of expired) {
      this.pendingHandoffs.delete(handoff.id);
      await this.emitHandoffExpiredEvent(handoff);
    }
  }

  private async emitHandoffRequestedEvent(handoff: PendingHandoff): Promise<void> {
    if (!this.config.enableNotifications || !this.eventBus) return;

    const event: DomainEvent = {
      id: uuidv4(),
      type: 'ClaimsHandoffRequested',
      timestamp: new Date(),
      source: handoff.claim.domain,
      correlationId: handoff.claim.correlationId,
      payload: {
        handoffId: handoff.id,
        claimId: handoff.claimId,
        requestedBy: handoff.requestedBy,
        targetType: handoff.targetType,
        preferredDomain: handoff.preferredDomain,
        notes: handoff.notes,
      },
    };

    await this.eventBus.publish(event);
  }

  private async emitHandoffCompletedEvent(
    handoff: PendingHandoff,
    toClaimant: Claimant
  ): Promise<void> {
    if (!this.eventBus) return;

    const event: DomainEvent = {
      id: uuidv4(),
      type: 'ClaimsHandoffCompleted',
      timestamp: new Date(),
      source: handoff.claim.domain,
      correlationId: handoff.claim.correlationId,
      payload: {
        handoffId: handoff.id,
        claimId: handoff.claimId,
        fromClaimant: handoff.requestedBy,
        toClaimant,
        waitTimeMs: Date.now() - handoff.requestedAt.getTime(),
      },
    };

    await this.eventBus.publish(event);
  }

  private async emitHandoffCancelledEvent(handoff: PendingHandoff): Promise<void> {
    if (!this.eventBus) return;

    const event: DomainEvent = {
      id: uuidv4(),
      type: 'ClaimsHandoffCancelled',
      timestamp: new Date(),
      source: handoff.claim.domain,
      correlationId: handoff.claim.correlationId,
      payload: {
        handoffId: handoff.id,
        claimId: handoff.claimId,
        requestedBy: handoff.requestedBy,
        targetType: handoff.targetType,
      },
    };

    await this.eventBus.publish(event);
  }

  private async emitHandoffExpiredEvent(handoff: PendingHandoff): Promise<void> {
    if (!this.eventBus) return;

    const event: DomainEvent = {
      id: uuidv4(),
      type: 'ClaimsHandoffExpired',
      timestamp: new Date(),
      source: handoff.claim.domain,
      correlationId: handoff.claim.correlationId,
      payload: {
        handoffId: handoff.id,
        claimId: handoff.claimId,
        requestedBy: handoff.requestedBy,
        targetType: handoff.targetType,
        waitTimeMs: Date.now() - handoff.requestedAt.getTime(),
      },
    };

    await this.eventBus.publish(event);
  }
}

// ============================================================================
// Types
// ============================================================================

export interface HandoffStatistics {
  totalPending: number;
  byTargetType: Record<ClaimantType, number>;
  avgWaitTimeMs: number;
  oldestHandoffAt?: Date;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a handoff manager
 */
export function createHandoffManager(
  claimService: IClaimService,
  repository: IClaimRepository,
  eventBus?: EventBus,
  config?: Partial<HandoffManagerConfig>
): HandoffManager {
  return new HandoffManager(claimService, repository, eventBus, config);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Suggest appropriate claim type based on handoff context
 */
export function suggestClaimTypeForHandoff(
  currentClaimType: string,
  targetType: ClaimantType
): string {
  // When handing off to human, often for review
  if (targetType === 'human') {
    if (currentClaimType === 'coverage-gap') {
      return 'test-review';
    }
  }

  // When handing off to agent, often for investigation
  if (targetType === 'agent') {
    if (currentClaimType === 'test-review') {
      return 'defect-investigation';
    }
  }

  return currentClaimType;
}

/**
 * Calculate handoff priority based on claim and wait time
 */
export function calculateHandoffPriority(handoff: PendingHandoff): number {
  let priority = 0;

  // Base priority from claim
  const priorityScores = { p0: 100, p1: 75, p2: 50, p3: 25 };
  priority += priorityScores[handoff.claim.priority];

  // Wait time bonus (up to 50 points)
  const waitTime = Date.now() - handoff.requestedAt.getTime();
  priority += Math.min(waitTime / 60000, 50);

  // Deadline urgency
  if (handoff.claim.deadline) {
    const timeToDeadline = handoff.claim.deadline.getTime() - Date.now();
    if (timeToDeadline < 3600000) {
      // Less than 1 hour
      priority += 50;
    } else if (timeToDeadline < 86400000) {
      // Less than 1 day
      priority += 25;
    }
  }

  return priority;
}
