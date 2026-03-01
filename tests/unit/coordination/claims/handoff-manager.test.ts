/**
 * Unit tests for Handoff Manager
 * ADR-016: Collaborative Test Task Claims
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  HandoffManager,
  createHandoffManager,
  suggestClaimTypeForHandoff,
  calculateHandoffPriority,
} from '../../../../src/coordination/claims/handoff-manager';
import {
  ClaimService,
  InMemoryClaimRepository,
} from '../../../../src/coordination/claims';
import {
  Claim,
  Claimant,
  PendingHandoff,
  CoverageGapMetadata,
} from '../../../../src/coordination/claims/interfaces';
import { DomainName, DomainEvent } from '../../../../src/shared/types';
import { EventBus, Subscription } from '../../../../src/kernel/interfaces';

// ============================================================================
// Mock Event Bus
// ============================================================================

class MockEventBus implements EventBus {
  public publishedEvents: DomainEvent[] = [];

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    this.publishedEvents.push(event);
  }

  subscribe<T>(
    _eventType: string,
    _handler: (event: DomainEvent<T>) => Promise<void>
  ): Subscription {
    return { unsubscribe: () => {}, active: true };
  }

  subscribeToChannel(
    _domain: DomainName,
    _handler: (event: DomainEvent) => Promise<void>
  ): Subscription {
    return { unsubscribe: () => {}, active: true };
  }

  async getHistory(): Promise<DomainEvent[]> {
    return this.publishedEvents;
  }

  async dispose(): Promise<void> {}

  clear(): void {
    this.publishedEvents = [];
  }
}

// ============================================================================
// Test Fixtures
// ============================================================================

function createAgentClaimant(id: string = 'agent_1'): Claimant {
  return {
    id,
    type: 'agent',
    name: 'Test Agent',
    domain: 'test-generation',
    agentType: 'generator',
  };
}

function createHumanClaimant(id: string = 'user_1'): Claimant {
  return {
    id,
    type: 'human',
    name: 'Test User',
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('HandoffManager', () => {
  let repository: InMemoryClaimRepository;
  let eventBus: MockEventBus;
  let claimService: ClaimService;
  let handoffManager: HandoffManager;

  beforeEach(async () => {
    repository = new InMemoryClaimRepository();
    eventBus = new MockEventBus();
    claimService = new ClaimService(repository, eventBus, {
      enableEvents: true,
      enableMetrics: false,
      expiry: {
        defaultAgentTtlMs: 60000,
        defaultHumanTtlMs: 120000,
        expiryCheckIntervalMs: 100000,
        staleThresholdMs: 30000,
        maxStealCount: 3,
      },
    });

    await claimService.initialize();

    handoffManager = createHandoffManager(claimService, repository, eventBus, {
      handoffTimeoutMs: 60000,
      checkIntervalMs: 100000, // Long interval for tests
      maxPendingPerClaim: 3,
      enableNotifications: true,
    });

    await handoffManager.initialize();
  });

  afterEach(async () => {
    await handoffManager.dispose();
    await claimService.dispose();
  });

  describe('requestHumanReview', () => {
    it('should create pending handoff for human review', async () => {
      // Create and claim
      const claim = await claimService.createClaim({
        type: 'coverage-gap',
        priority: 'p1',
        domain: 'test-generation',
        title: 'Test claim',
        metadata: {
          filePath: 'test.ts',
          uncoveredLines: [1],
          currentCoverage: 50,
          targetCoverage: 80,
        } as CoverageGapMetadata,
      });

      const agent = createAgentClaimant();
      await claimService.claim({ claimId: claim.id, claimant: agent });

      await handoffManager.requestHumanReview(claim.id, 'Please review generated tests');

      const pending = await handoffManager.getPendingHandoffs();
      expect(pending.length).toBe(1);
      expect(pending[0].claimId).toBe(claim.id);
      expect(pending[0].targetType).toBe('human');
      expect(pending[0].notes).toBe('Please review generated tests');
    });

    it('should throw if claim not held by agent', async () => {
      const claim = await claimService.createClaim({
        type: 'coverage-gap',
        priority: 'p1',
        domain: 'test-generation',
        title: 'Test claim',
        metadata: {
          filePath: 'test.ts',
          uncoveredLines: [1],
          currentCoverage: 50,
          targetCoverage: 80,
        } as CoverageGapMetadata,
      });

      const human = createHumanClaimant();
      await claimService.claim({ claimId: claim.id, claimant: human });

      await expect(
        handoffManager.requestHumanReview(claim.id)
      ).rejects.toThrow('must be held by an agent');
    });

    it('should emit handoff requested event', async () => {
      const claim = await claimService.createClaim({
        type: 'coverage-gap',
        priority: 'p1',
        domain: 'test-generation',
        title: 'Test claim',
        metadata: {
          filePath: 'test.ts',
          uncoveredLines: [1],
          currentCoverage: 50,
          targetCoverage: 80,
        } as CoverageGapMetadata,
      });

      await claimService.claim({
        claimId: claim.id,
        claimant: createAgentClaimant(),
      });

      eventBus.clear();
      await handoffManager.requestHumanReview(claim.id);

      const events = eventBus.publishedEvents.filter(
        e => e.type === 'ClaimsHandoffRequested'
      );
      expect(events.length).toBe(1);
    });

    it('should enforce max pending limit', async () => {
      const claim = await claimService.createClaim({
        type: 'coverage-gap',
        priority: 'p1',
        domain: 'test-generation',
        title: 'Test claim',
        metadata: {
          filePath: 'test.ts',
          uncoveredLines: [1],
          currentCoverage: 50,
          targetCoverage: 80,
        } as CoverageGapMetadata,
      });

      await claimService.claim({
        claimId: claim.id,
        claimant: createAgentClaimant(),
      });

      // Create max pending handoffs
      await handoffManager.requestHumanReview(claim.id);
      await handoffManager.requestHumanReview(claim.id);
      await handoffManager.requestHumanReview(claim.id);

      // Fourth should fail
      await expect(
        handoffManager.requestHumanReview(claim.id)
      ).rejects.toThrow('Maximum pending handoffs');
    });
  });

  describe('requestAgentAssist', () => {
    it('should create pending handoff for agent assistance', async () => {
      const claim = await claimService.createClaim({
        type: 'test-review',
        priority: 'p1',
        domain: 'test-generation',
        title: 'Review needed',
        metadata: {
          testFilePath: 'test.ts',
          sourceFilePath: 'src.ts',
          testCount: 5,
          generatorAgentId: 'gen_1',
          generatedAt: new Date(),
        },
      });

      const human = createHumanClaimant();
      await claimService.claim({ claimId: claim.id, claimant: human });

      await handoffManager.requestAgentAssist(claim.id, 'defect-intelligence');

      const pending = await handoffManager.getPendingHandoffs();
      expect(pending.length).toBe(1);
      expect(pending[0].targetType).toBe('agent');
      expect(pending[0].preferredDomain).toBe('defect-intelligence');
    });

    it('should throw if claim not held by human', async () => {
      const claim = await claimService.createClaim({
        type: 'coverage-gap',
        priority: 'p1',
        domain: 'test-generation',
        title: 'Test claim',
        metadata: {
          filePath: 'test.ts',
          uncoveredLines: [1],
          currentCoverage: 50,
          targetCoverage: 80,
        } as CoverageGapMetadata,
      });

      const agent = createAgentClaimant();
      await claimService.claim({ claimId: claim.id, claimant: agent });

      await expect(
        handoffManager.requestAgentAssist(claim.id)
      ).rejects.toThrow('must be held by a human');
    });
  });

  describe('completeHandoff', () => {
    it('should complete handoff from agent to human', async () => {
      const claim = await claimService.createClaim({
        type: 'coverage-gap',
        priority: 'p1',
        domain: 'test-generation',
        title: 'Test claim',
        metadata: {
          filePath: 'test.ts',
          uncoveredLines: [1],
          currentCoverage: 50,
          targetCoverage: 80,
        } as CoverageGapMetadata,
      });

      const agent = createAgentClaimant();
      await claimService.claim({ claimId: claim.id, claimant: agent });

      await handoffManager.requestHumanReview(claim.id, 'Review needed');
      const pending = await handoffManager.getPendingHandoffs();
      const handoff = pending[0];

      const human = createHumanClaimant();
      const updatedClaim = await handoffManager.completeHandoff(handoff.id, human);

      expect(updatedClaim.claimant?.id).toBe(human.id);
      expect(updatedClaim.previousClaimants).toContainEqual(agent);

      // Pending should be cleared
      const remainingPending = await handoffManager.getPendingHandoffs();
      expect(remainingPending.length).toBe(0);
    });

    it('should throw if claimant type mismatch', async () => {
      const claim = await claimService.createClaim({
        type: 'coverage-gap',
        priority: 'p1',
        domain: 'test-generation',
        title: 'Test claim',
        metadata: {
          filePath: 'test.ts',
          uncoveredLines: [1],
          currentCoverage: 50,
          targetCoverage: 80,
        } as CoverageGapMetadata,
      });

      await claimService.claim({
        claimId: claim.id,
        claimant: createAgentClaimant(),
      });

      await handoffManager.requestHumanReview(claim.id);
      const pending = await handoffManager.getPendingHandoffs();
      const handoff = pending[0];

      // Try to complete with agent instead of human
      await expect(
        handoffManager.completeHandoff(handoff.id, createAgentClaimant('other'))
      ).rejects.toThrow('Claimant type mismatch');
    });

    it('should emit handoff completed event', async () => {
      const claim = await claimService.createClaim({
        type: 'coverage-gap',
        priority: 'p1',
        domain: 'test-generation',
        title: 'Test claim',
        metadata: {
          filePath: 'test.ts',
          uncoveredLines: [1],
          currentCoverage: 50,
          targetCoverage: 80,
        } as CoverageGapMetadata,
      });

      await claimService.claim({
        claimId: claim.id,
        claimant: createAgentClaimant(),
      });

      await handoffManager.requestHumanReview(claim.id);
      const pending = await handoffManager.getPendingHandoffs();

      eventBus.clear();
      await handoffManager.completeHandoff(pending[0].id, createHumanClaimant());

      const events = eventBus.publishedEvents.filter(
        e => e.type === 'ClaimsHandoffCompleted'
      );
      expect(events.length).toBe(1);
    });
  });

  describe('cancelHandoff', () => {
    it('should cancel pending handoff', async () => {
      const claim = await claimService.createClaim({
        type: 'coverage-gap',
        priority: 'p1',
        domain: 'test-generation',
        title: 'Test claim',
        metadata: {
          filePath: 'test.ts',
          uncoveredLines: [1],
          currentCoverage: 50,
          targetCoverage: 80,
        } as CoverageGapMetadata,
      });

      await claimService.claim({
        claimId: claim.id,
        claimant: createAgentClaimant(),
      });

      await handoffManager.requestHumanReview(claim.id);
      const pending = await handoffManager.getPendingHandoffs();
      expect(pending.length).toBe(1);

      await handoffManager.cancelHandoff(pending[0].id);

      const remaining = await handoffManager.getPendingHandoffs();
      expect(remaining.length).toBe(0);
    });

    it('should emit handoff cancelled event', async () => {
      const claim = await claimService.createClaim({
        type: 'coverage-gap',
        priority: 'p1',
        domain: 'test-generation',
        title: 'Test claim',
        metadata: {
          filePath: 'test.ts',
          uncoveredLines: [1],
          currentCoverage: 50,
          targetCoverage: 80,
        } as CoverageGapMetadata,
      });

      await claimService.claim({
        claimId: claim.id,
        claimant: createAgentClaimant(),
      });

      await handoffManager.requestHumanReview(claim.id);
      const pending = await handoffManager.getPendingHandoffs();

      eventBus.clear();
      await handoffManager.cancelHandoff(pending[0].id);

      const events = eventBus.publishedEvents.filter(
        e => e.type === 'ClaimsHandoffCancelled'
      );
      expect(events.length).toBe(1);
    });
  });

  describe('getPendingHandoffs', () => {
    it('should return all pending handoffs', async () => {
      // Create multiple claims and handoffs
      for (let i = 0; i < 3; i++) {
        const claim = await claimService.createClaim({
          type: 'coverage-gap',
          priority: 'p1',
          domain: 'test-generation',
          title: `Claim ${i}`,
          metadata: {
            filePath: `test${i}.ts`,
            uncoveredLines: [1],
            currentCoverage: 50,
            targetCoverage: 80,
          } as CoverageGapMetadata,
        });

        await claimService.claim({
          claimId: claim.id,
          claimant: createAgentClaimant(`agent_${i}`),
        });

        await handoffManager.requestHumanReview(claim.id);
      }

      const pending = await handoffManager.getPendingHandoffs();
      expect(pending.length).toBe(3);
    });
  });

  describe('getPendingForClaim', () => {
    it('should return pending handoffs for specific claim', async () => {
      const claim1 = await claimService.createClaim({
        type: 'coverage-gap',
        priority: 'p1',
        domain: 'test-generation',
        title: 'Claim 1',
        metadata: {
          filePath: 'test1.ts',
          uncoveredLines: [1],
          currentCoverage: 50,
          targetCoverage: 80,
        } as CoverageGapMetadata,
      });

      const claim2 = await claimService.createClaim({
        type: 'coverage-gap',
        priority: 'p1',
        domain: 'test-generation',
        title: 'Claim 2',
        metadata: {
          filePath: 'test2.ts',
          uncoveredLines: [1],
          currentCoverage: 50,
          targetCoverage: 80,
        } as CoverageGapMetadata,
      });

      await claimService.claim({
        claimId: claim1.id,
        claimant: createAgentClaimant('agent_1'),
      });
      await claimService.claim({
        claimId: claim2.id,
        claimant: createAgentClaimant('agent_2'),
      });

      await handoffManager.requestHumanReview(claim1.id);
      await handoffManager.requestHumanReview(claim2.id);

      const forClaim1 = await handoffManager.getPendingForClaim(claim1.id);
      expect(forClaim1.length).toBe(1);
      expect(forClaim1[0].claimId).toBe(claim1.id);
    });
  });

  describe('getPendingByTargetType', () => {
    it('should filter by target type', async () => {
      const claim1 = await claimService.createClaim({
        type: 'coverage-gap',
        priority: 'p1',
        domain: 'test-generation',
        title: 'Agent claim',
        metadata: {
          filePath: 'test1.ts',
          uncoveredLines: [1],
          currentCoverage: 50,
          targetCoverage: 80,
        } as CoverageGapMetadata,
      });

      const claim2 = await claimService.createClaim({
        type: 'test-review',
        priority: 'p1',
        domain: 'test-generation',
        title: 'Human claim',
        metadata: {
          testFilePath: 'test.ts',
          sourceFilePath: 'src.ts',
          testCount: 5,
          generatorAgentId: 'gen_1',
          generatedAt: new Date(),
        },
      });

      await claimService.claim({
        claimId: claim1.id,
        claimant: createAgentClaimant(),
      });
      await claimService.claim({
        claimId: claim2.id,
        claimant: createHumanClaimant(),
      });

      await handoffManager.requestHumanReview(claim1.id);
      await handoffManager.requestAgentAssist(claim2.id);

      const forHumans = await handoffManager.getPendingByTargetType('human');
      expect(forHumans.length).toBe(1);

      const forAgents = await handoffManager.getPendingByTargetType('agent');
      expect(forAgents.length).toBe(1);
    });
  });

  describe('hasPendingHandoffs', () => {
    it('should return true if claim has pending handoffs', async () => {
      const claim = await claimService.createClaim({
        type: 'coverage-gap',
        priority: 'p1',
        domain: 'test-generation',
        title: 'Test claim',
        metadata: {
          filePath: 'test.ts',
          uncoveredLines: [1],
          currentCoverage: 50,
          targetCoverage: 80,
        } as CoverageGapMetadata,
      });

      await claimService.claim({
        claimId: claim.id,
        claimant: createAgentClaimant(),
      });

      expect(handoffManager.hasPendingHandoffs(claim.id)).toBe(false);

      await handoffManager.requestHumanReview(claim.id);

      expect(handoffManager.hasPendingHandoffs(claim.id)).toBe(true);
    });
  });

  describe('getStatistics', () => {
    it('should return handoff statistics', async () => {
      const claim = await claimService.createClaim({
        type: 'coverage-gap',
        priority: 'p1',
        domain: 'test-generation',
        title: 'Test claim',
        metadata: {
          filePath: 'test.ts',
          uncoveredLines: [1],
          currentCoverage: 50,
          targetCoverage: 80,
        } as CoverageGapMetadata,
      });

      await claimService.claim({
        claimId: claim.id,
        claimant: createAgentClaimant(),
      });

      await handoffManager.requestHumanReview(claim.id);

      const stats = handoffManager.getStatistics();
      expect(stats.totalPending).toBe(1);
      expect(stats.byTargetType.human).toBe(1);
      expect(stats.byTargetType.agent).toBe(0);
    });
  });
});

describe('suggestClaimTypeForHandoff', () => {
  it('should suggest test-review when handing coverage-gap to human', () => {
    const suggestion = suggestClaimTypeForHandoff('coverage-gap', 'human');
    expect(suggestion).toBe('test-review');
  });

  it('should suggest defect-investigation when handing test-review to agent', () => {
    const suggestion = suggestClaimTypeForHandoff('test-review', 'agent');
    expect(suggestion).toBe('defect-investigation');
  });

  it('should return same type for unmatched combinations', () => {
    const suggestion = suggestClaimTypeForHandoff('flaky-test', 'human');
    expect(suggestion).toBe('flaky-test');
  });
});

describe('calculateHandoffPriority', () => {
  it('should give higher priority to urgent claims', () => {
    const claim: Claim = {
      id: 'claim_1',
      type: 'coverage-gap',
      status: 'claimed',
      priority: 'p0',
      domain: 'test-generation',
      title: 'Test',
      metadata: {} as CoverageGapMetadata,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      stealCount: 0,
    };

    const p0Handoff: PendingHandoff = {
      id: 'h1',
      claimId: 'claim_1',
      claim,
      requestedBy: createAgentClaimant(),
      requestedAt: new Date(),
      targetType: 'human',
    };

    const p2Handoff: PendingHandoff = {
      id: 'h2',
      claimId: 'claim_2',
      claim: { ...claim, priority: 'p2' },
      requestedBy: createAgentClaimant(),
      requestedAt: new Date(),
      targetType: 'human',
    };

    const p0Priority = calculateHandoffPriority(p0Handoff);
    const p2Priority = calculateHandoffPriority(p2Handoff);

    expect(p0Priority).toBeGreaterThan(p2Priority);
  });

  it('should give higher priority to longer waiting handoffs', () => {
    const claim: Claim = {
      id: 'claim_1',
      type: 'coverage-gap',
      status: 'claimed',
      priority: 'p1',
      domain: 'test-generation',
      title: 'Test',
      metadata: {} as CoverageGapMetadata,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      stealCount: 0,
    };

    const oldHandoff: PendingHandoff = {
      id: 'h1',
      claimId: 'claim_1',
      claim,
      requestedBy: createAgentClaimant(),
      requestedAt: new Date(Date.now() - 3600000), // 1 hour ago
      targetType: 'human',
    };

    const newHandoff: PendingHandoff = {
      id: 'h2',
      claimId: 'claim_2',
      claim,
      requestedBy: createAgentClaimant(),
      requestedAt: new Date(),
      targetType: 'human',
    };

    const oldPriority = calculateHandoffPriority(oldHandoff);
    const newPriority = calculateHandoffPriority(newHandoff);

    expect(oldPriority).toBeGreaterThan(newPriority);
  });

  it('should give higher priority to claims with close deadlines', () => {
    const claimWithDeadline: Claim = {
      id: 'claim_1',
      type: 'coverage-gap',
      status: 'claimed',
      priority: 'p1',
      domain: 'test-generation',
      title: 'Test',
      metadata: {} as CoverageGapMetadata,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deadline: new Date(Date.now() + 1800000), // 30 minutes
      stealCount: 0,
    };

    const claimWithoutDeadline: Claim = {
      id: 'claim_2',
      type: 'coverage-gap',
      status: 'claimed',
      priority: 'p1',
      domain: 'test-generation',
      title: 'Test',
      metadata: {} as CoverageGapMetadata,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      stealCount: 0,
    };

    const urgentHandoff: PendingHandoff = {
      id: 'h1',
      claimId: 'claim_1',
      claim: claimWithDeadline,
      requestedBy: createAgentClaimant(),
      requestedAt: new Date(),
      targetType: 'human',
    };

    const normalHandoff: PendingHandoff = {
      id: 'h2',
      claimId: 'claim_2',
      claim: claimWithoutDeadline,
      requestedBy: createAgentClaimant(),
      requestedAt: new Date(),
      targetType: 'human',
    };

    const urgentPriority = calculateHandoffPriority(urgentHandoff);
    const normalPriority = calculateHandoffPriority(normalHandoff);

    expect(urgentPriority).toBeGreaterThan(normalPriority);
  });
});
