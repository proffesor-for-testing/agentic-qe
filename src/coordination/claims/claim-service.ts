/**
 * Agentic QE v3 - Claim Service
 * Core service for managing test task claims
 *
 * Features:
 * - Create, claim, release, steal claims
 * - Automatic expiry of stale claims
 * - Event emission for claim lifecycle
 * - Metrics collection
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Claim,
  ClaimMetadata,
  ClaimStatus,
  ClaimType,
  ClaimFilter,
  ClaimSortOptions,
  ClaimEvent,
  ClaimEventType,
  ClaimMetrics,
  ClaimServiceConfig,
  ClaimExpiryConfig,
  CreateClaimInput,
  ClaimInput,
  ReleaseClaimInput,
  StealClaimInput,
  HandoffInput,
  Claimant,
  IClaimService,
  IClaimRepository,
} from './interfaces';
import { EventBus, Subscription } from '../../kernel/interfaces';
import { DomainEvent, DomainName } from '../../shared/types';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_EXPIRY_CONFIG: ClaimExpiryConfig = {
  defaultAgentTtlMs: 300000, // 5 minutes for agents
  defaultHumanTtlMs: 3600000, // 1 hour for humans
  expiryCheckIntervalMs: 60000, // Check every minute
  staleThresholdMs: 180000, // 3 minutes without activity
  maxStealCount: 3,
};

const DEFAULT_CONFIG: ClaimServiceConfig = {
  expiry: DEFAULT_EXPIRY_CONFIG,
  workStealing: {
    enabled: true,
    idleThresholdMs: 30000,
    stealBatchSize: 5,
    checkIntervalMs: 30000,
    prioritizeByPriority: true,
    allowCrossDomain: false,
  },
  enableEvents: true,
  enableMetrics: true,
  metricsIntervalMs: 60000,
};

// ============================================================================
// Claim Service Implementation
// ============================================================================

export class ClaimService implements IClaimService {
  private readonly config: ClaimServiceConfig;
  private expiryTimer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  private initialized = false;

  // Metrics counters
  private metrics: {
    totalCreated: number;
    totalCompleted: number;
    totalAbandoned: number;
    totalExpired: number;
    totalStolen: number;
    totalHandoffs: number;
    claimTimes: number[];
    completionTimes: number[];
  } = {
    totalCreated: 0,
    totalCompleted: 0,
    totalAbandoned: 0,
    totalExpired: 0,
    totalStolen: 0,
    totalHandoffs: 0,
    claimTimes: [],
    completionTimes: [],
  };

  constructor(
    private readonly repository: IClaimRepository,
    private readonly eventBus?: EventBus,
    config: Partial<ClaimServiceConfig> = {}
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      expiry: { ...DEFAULT_CONFIG.expiry, ...config.expiry },
      workStealing: { ...DEFAULT_CONFIG.workStealing, ...config.workStealing },
    };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Start expiry checker
    this.expiryTimer = setInterval(
      () => this.expireStale().catch(console.error),
      this.config.expiry.expiryCheckIntervalMs
    );

    // Start metrics collection
    if (this.config.enableMetrics) {
      this.metricsTimer = setInterval(
        () => this.collectMetrics().catch(console.error),
        this.config.metricsIntervalMs
      );
    }

    this.initialized = true;

    await this.emitEvent('ClaimCreated', {
      id: 'service',
      type: 'coverage-gap',
      status: 'available',
      title: 'Service initialized',
    } as unknown as Claim, 'ClaimCreated');
  }

  async dispose(): Promise<void> {
    if (this.expiryTimer) {
      clearInterval(this.expiryTimer);
      this.expiryTimer = null;
    }

    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }

    this.initialized = false;
  }

  // ============================================================================
  // Claim Creation
  // ============================================================================

  async createClaim<T extends ClaimMetadata>(input: CreateClaimInput<T>): Promise<Claim<T>> {
    const now = new Date();
    const claim: Claim<T> = {
      id: `claim_${uuidv4()}`,
      type: input.type,
      status: 'available',
      priority: input.priority,
      severity: input.severity,
      domain: input.domain,
      title: input.title,
      description: input.description,
      metadata: input.metadata,
      tags: input.tags || [],
      deadline: input.deadline,
      estimatedEffort: input.estimatedEffort,
      correlationId: input.correlationId || uuidv4(),
      relatedClaims: input.relatedClaims,
      createdAt: now,
      updatedAt: now,
      stealCount: 0,
    };

    await this.repository.create(claim as Claim);
    this.metrics.totalCreated++;

    await this.emitEvent('ClaimCreated', claim as Claim, 'ClaimCreated');

    return claim;
  }

  // ============================================================================
  // Claiming
  // ============================================================================

  async claim(input: ClaimInput): Promise<Claim> {
    const claim = await this.repository.get(input.claimId);

    if (!claim) {
      throw new Error(`Claim not found: ${input.claimId}`);
    }

    if (claim.status !== 'available') {
      throw new Error(`Claim is not available: ${claim.status}`);
    }

    const ttlMs = input.ttlMs || this.getDefaultTtl(input.claimant.type);
    const now = new Date();

    const updated: Claim = {
      ...claim,
      status: 'claimed',
      claimant: input.claimant,
      claimedAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
      updatedAt: now,
    };

    await this.repository.update(updated);

    // Track claim time
    const claimTime = now.getTime() - claim.createdAt.getTime();
    this.metrics.claimTimes.push(claimTime);
    if (this.metrics.claimTimes.length > 1000) {
      this.metrics.claimTimes.shift();
    }

    await this.emitEvent('ClaimClaimed', updated, 'ClaimClaimed', { claimant: input.claimant });

    return updated;
  }

  // ============================================================================
  // Releasing
  // ============================================================================

  async release(input: ReleaseClaimInput): Promise<Claim> {
    const claim = await this.repository.get(input.claimId);

    if (!claim) {
      throw new Error(`Claim not found: ${input.claimId}`);
    }

    if (claim.claimant?.id !== input.claimantId) {
      throw new Error(`Claimant mismatch: expected ${claim.claimant?.id}, got ${input.claimantId}`);
    }

    const now = new Date();
    let newStatus: ClaimStatus;
    let eventType: ClaimEventType;

    switch (input.reason) {
      case 'completed':
        newStatus = 'completed';
        eventType = 'ClaimCompleted';
        this.metrics.totalCompleted++;

        // Track completion time
        if (claim.claimedAt) {
          const completionTime = now.getTime() - claim.claimedAt.getTime();
          this.metrics.completionTimes.push(completionTime);
          if (this.metrics.completionTimes.length > 1000) {
            this.metrics.completionTimes.shift();
          }
        }
        break;

      case 'abandoned':
        newStatus = 'abandoned';
        eventType = 'ClaimAbandoned';
        this.metrics.totalAbandoned++;
        break;

      case 'handoff':
        // Handoff keeps it claimed but changes claimant
        newStatus = 'claimed';
        eventType = 'ClaimHandoff';
        this.metrics.totalHandoffs++;
        break;

      case 'stolen':
        // Should be handled by steal() method
        newStatus = 'claimed';
        eventType = 'ClaimStolen';
        this.metrics.totalStolen++;
        break;

      default:
        newStatus = 'available';
        eventType = 'ClaimReleased';
    }

    const updated: Claim = {
      ...claim,
      status: newStatus,
      claimant: input.reason === 'handoff' || input.reason === 'stolen'
        ? claim.claimant
        : undefined,
      result: input.result,
      updatedAt: now,
      expiresAt: undefined,
      previousClaimants: claim.claimant
        ? [...(claim.previousClaimants || []), claim.claimant]
        : claim.previousClaimants,
    };

    await this.repository.update(updated);

    await this.emitEvent(eventType, updated, eventType, {
      previousClaimant: claim.claimant,
      result: input.result,
    });

    return updated;
  }

  // ============================================================================
  // Stealing
  // ============================================================================

  async steal(input: StealClaimInput): Promise<Claim> {
    const claim = await this.repository.get(input.claimId);

    if (!claim) {
      throw new Error(`Claim not found: ${input.claimId}`);
    }

    if (claim.status !== 'claimed' && claim.status !== 'in-progress') {
      throw new Error(`Claim cannot be stolen: ${claim.status}`);
    }

    if (claim.stealCount >= this.config.expiry.maxStealCount) {
      throw new Error(`Claim has been stolen too many times: ${claim.stealCount}`);
    }

    const previousClaimant = claim.claimant;
    const now = new Date();
    const ttlMs = this.getDefaultTtl(input.newClaimant.type);

    const updated: Claim = {
      ...claim,
      status: 'claimed',
      claimant: input.newClaimant,
      claimedAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
      updatedAt: now,
      stealCount: claim.stealCount + 1,
      previousClaimants: previousClaimant
        ? [...(claim.previousClaimants || []), previousClaimant]
        : claim.previousClaimants,
    };

    await this.repository.update(updated);
    this.metrics.totalStolen++;

    await this.emitEvent('ClaimStolen', updated, 'ClaimStolen', {
      previousClaimant,
      newClaimant: input.newClaimant,
      reason: input.reason,
    });

    return updated;
  }

  // ============================================================================
  // Handoff
  // ============================================================================

  async handoff(input: HandoffInput): Promise<Claim> {
    const claim = await this.repository.get(input.claimId);

    if (!claim) {
      throw new Error(`Claim not found: ${input.claimId}`);
    }

    if (claim.claimant?.id !== input.fromClaimant.id) {
      throw new Error(`Claimant mismatch: expected ${claim.claimant?.id}, got ${input.fromClaimant.id}`);
    }

    const now = new Date();
    const ttlMs = this.getDefaultTtl(input.toClaimant.type);

    const updated: Claim = {
      ...claim,
      claimant: input.toClaimant,
      claimedAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
      updatedAt: now,
      previousClaimants: [...(claim.previousClaimants || []), input.fromClaimant],
    };

    await this.repository.update(updated);
    this.metrics.totalHandoffs++;

    await this.emitEvent('ClaimHandoff', updated, 'ClaimHandoff', {
      fromClaimant: input.fromClaimant,
      toClaimant: input.toClaimant,
      notes: input.notes,
      context: input.context,
    });

    return updated;
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  async getClaim(claimId: string): Promise<Claim | undefined> {
    return this.repository.get(claimId);
  }

  async findClaims(filter: ClaimFilter, sort?: ClaimSortOptions): Promise<Claim[]> {
    return this.repository.find(filter, sort);
  }

  async getAvailableForClaimant(claimant: Claimant): Promise<Claim[]> {
    const filter: ClaimFilter = {
      status: 'available',
    };

    // If agent, filter by domain
    if (claimant.type === 'agent' && claimant.domain) {
      filter.domain = claimant.domain;
    }

    const claims = await this.repository.find(filter);

    // Sort by priority and deadline
    return claims.sort((a, b) => {
      const priorityOrder = { p0: 0, p1: 1, p2: 2, p3: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // Then by deadline (earliest first)
      if (a.deadline && b.deadline) {
        return a.deadline.getTime() - b.deadline.getTime();
      }
      if (a.deadline) return -1;
      if (b.deadline) return 1;

      // Then by creation time (oldest first)
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  async getClaimsForClaimant(claimantId: string): Promise<Claim[]> {
    return this.repository.find({
      claimantId,
      status: ['claimed', 'in-progress', 'blocked'],
    });
  }

  // ============================================================================
  // Expiry Management
  // ============================================================================

  async expireStale(): Promise<number> {
    const expired = await this.repository.findExpired();
    let count = 0;

    for (const claim of expired) {
      try {
        const updated: Claim = {
          ...claim,
          status: 'expired',
          claimant: undefined,
          expiresAt: undefined,
          updatedAt: new Date(),
          previousClaimants: claim.claimant
            ? [...(claim.previousClaimants || []), claim.claimant]
            : claim.previousClaimants,
        };

        await this.repository.update(updated);
        this.metrics.totalExpired++;
        count++;

        await this.emitEvent('ClaimExpired', updated, 'ClaimExpired', {
          previousClaimant: claim.claimant,
        });
      } catch (error) {
        console.error(`Failed to expire claim ${claim.id}:`, error);
      }
    }

    return count;
  }

  // ============================================================================
  // Metrics
  // ============================================================================

  getMetrics(): ClaimMetrics {
    const avgClaimTime = this.metrics.claimTimes.length > 0
      ? this.metrics.claimTimes.reduce((a, b) => a + b, 0) / this.metrics.claimTimes.length
      : 0;

    const avgCompletionTime = this.metrics.completionTimes.length > 0
      ? this.metrics.completionTimes.reduce((a, b) => a + b, 0) / this.metrics.completionTimes.length
      : 0;

    // These would need async calls in a real implementation
    // For now, return cached/estimated values
    return {
      totalCreated: this.metrics.totalCreated,
      totalCompleted: this.metrics.totalCompleted,
      totalAbandoned: this.metrics.totalAbandoned,
      totalExpired: this.metrics.totalExpired,
      totalStolen: this.metrics.totalStolen,
      totalHandoffs: this.metrics.totalHandoffs,
      currentAvailable: 0, // Would need async count
      currentClaimed: 0, // Would need async count
      avgTimeToClaimMs: avgClaimTime,
      avgTimeToCompleteMs: avgCompletionTime,
      byType: {
        'coverage-gap': 0,
        'flaky-test': 0,
        'defect-investigation': 0,
        'test-review': 0,
      },
      byStatus: {
        available: 0,
        claimed: 0,
        'in-progress': 0,
        blocked: 0,
        completed: 0,
        abandoned: 0,
        expired: 0,
      },
      byDomain: {} as Record<DomainName, number>,
    };
  }

  // ============================================================================
  // Status Updates
  // ============================================================================

  async updateStatus(claimId: string, status: ClaimStatus, claimantId?: string): Promise<Claim> {
    const claim = await this.repository.get(claimId);

    if (!claim) {
      throw new Error(`Claim not found: ${claimId}`);
    }

    // Verify claimant if provided
    if (claimantId && claim.claimant?.id !== claimantId) {
      throw new Error(`Claimant mismatch: expected ${claim.claimant?.id}, got ${claimantId}`);
    }

    const updated: Claim = {
      ...claim,
      status,
      updatedAt: new Date(),
    };

    await this.repository.update(updated);

    await this.emitEvent('ClaimStatusChanged', updated, 'ClaimStatusChanged', {
      previousStatus: claim.status,
      newStatus: status,
    });

    return updated;
  }

  // ============================================================================
  // Priority Escalation
  // ============================================================================

  async escalatePriority(claimId: string): Promise<Claim> {
    const claim = await this.repository.get(claimId);

    if (!claim) {
      throw new Error(`Claim not found: ${claimId}`);
    }

    const priorityOrder = ['p3', 'p2', 'p1', 'p0'] as const;
    const currentIndex = priorityOrder.indexOf(claim.priority);

    if (currentIndex >= priorityOrder.length - 1) {
      throw new Error('Claim already at highest priority');
    }

    const newPriority = priorityOrder[currentIndex + 1];

    const updated: Claim = {
      ...claim,
      priority: newPriority,
      updatedAt: new Date(),
    };

    await this.repository.update(updated);

    await this.emitEvent('ClaimPriorityEscalated', updated, 'ClaimPriorityEscalated', {
      previousPriority: claim.priority,
      newPriority,
    });

    return updated;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private getDefaultTtl(claimantType: 'agent' | 'human'): number {
    return claimantType === 'agent'
      ? this.config.expiry.defaultAgentTtlMs
      : this.config.expiry.defaultHumanTtlMs;
  }

  private async emitEvent(
    type: ClaimEventType,
    claim: Claim,
    eventType: ClaimEventType,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.config.enableEvents || !this.eventBus) return;

    const event: DomainEvent<ClaimEvent> = {
      id: uuidv4(),
      type: `Claims${type}`,
      timestamp: new Date(),
      source: claim.domain,
      correlationId: claim.correlationId,
      payload: {
        type: eventType,
        claimId: claim.id,
        claim,
        timestamp: new Date(),
        metadata,
      },
    };

    await this.eventBus.publish(event);
  }

  private async collectMetrics(): Promise<void> {
    // Update current counts
    try {
      const [available, claimed] = await Promise.all([
        this.repository.count({ status: 'available' }),
        this.repository.count({ status: ['claimed', 'in-progress'] }),
      ]);

      // Store in memory for historical tracking
      if (this.eventBus) {
        await this.eventBus.publish({
          id: uuidv4(),
          type: 'ClaimsMetricsCollected',
          timestamp: new Date(),
          source: 'coverage-analysis' as DomainName,
          payload: {
            ...this.getMetrics(),
            currentAvailable: available,
            currentClaimed: claimed,
          },
        });
      }
    } catch (error) {
      console.error('Failed to collect claim metrics:', error);
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a claim service with the given repository and event bus
 */
export function createClaimService(
  repository: IClaimRepository,
  eventBus?: EventBus,
  config?: Partial<ClaimServiceConfig>
): IClaimService {
  return new ClaimService(repository, eventBus, config);
}
