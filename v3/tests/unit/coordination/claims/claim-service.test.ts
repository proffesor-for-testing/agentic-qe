/**
 * Unit tests for Claim Service
 * ADR-016: Collaborative Test Task Claims
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ClaimService,
  createClaimService,
  InMemoryClaimRepository,
  createInMemoryClaimRepository,
} from '../../../../src/coordination/claims';
import {
  Claim,
  ClaimType,
  ClaimStatus,
  Claimant,
  CreateClaimInput,
  CoverageGapMetadata,
  FlakyTestMetadata,
  IClaimRepository,
} from '../../../../src/coordination/claims/interfaces';
import { DomainName, DomainEvent } from '../../../../src/shared/types';
import { EventBus, Subscription } from '../../../../src/kernel/interfaces';

// ============================================================================
// Mock Event Bus
// ============================================================================

class MockEventBus implements EventBus {
  public publishedEvents: DomainEvent[] = [];
  private handlers = new Map<string, Set<(event: DomainEvent) => Promise<void>>>();

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    this.publishedEvents.push(event);

    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        await handler(event);
      }
    }
  }

  subscribe<T>(
    eventType: string,
    handler: (event: DomainEvent<T>) => Promise<void>
  ): Subscription {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as (event: DomainEvent) => Promise<void>);

    return {
      unsubscribe: () => {
        this.handlers.get(eventType)?.delete(handler as (event: DomainEvent) => Promise<void>);
      },
      active: true,
    };
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

  async dispose(): Promise<void> {
    this.handlers.clear();
  }

  clear(): void {
    this.publishedEvents = [];
  }
}

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestClaimant(type: 'agent' | 'human' = 'agent'): Claimant {
  return {
    id: `${type}_${Date.now()}`,
    type,
    name: type === 'agent' ? 'Test Agent' : 'Test User',
    domain: 'test-generation' as DomainName,
    agentType: type === 'agent' ? 'generator' : undefined,
  };
}

function createCoverageGapInput(): CreateClaimInput<CoverageGapMetadata> {
  return {
    type: 'coverage-gap',
    priority: 'p1',
    domain: 'test-generation',
    title: 'UserService needs test coverage',
    description: 'Methods authenticate() and logout() are not tested',
    metadata: {
      filePath: 'src/services/user.service.ts',
      uncoveredLines: [45, 46, 47, 89, 90],
      currentCoverage: 65,
      targetCoverage: 80,
      complexity: 15,
    },
    tags: ['authentication', 'high-value'],
    estimatedEffort: 30,
  };
}

function createFlakyTestInput(): CreateClaimInput<FlakyTestMetadata> {
  return {
    type: 'flaky-test',
    priority: 'p0',
    severity: 'high',
    domain: 'test-execution',
    title: 'Flaky test: should handle concurrent requests',
    metadata: {
      testFilePath: 'tests/integration/api.test.ts',
      testName: 'should handle concurrent requests',
      flakinessRate: 0.15,
      recentFailures: 3,
      totalRuns: 20,
      lastFailure: new Date(),
      suspectedCauses: ['race condition', 'timing issue'],
    },
    tags: ['flaky', 'integration'],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ClaimService', () => {
  let repository: IClaimRepository;
  let eventBus: MockEventBus;
  let service: ClaimService;

  beforeEach(async () => {
    repository = createInMemoryClaimRepository();
    eventBus = new MockEventBus();
    service = new ClaimService(repository, eventBus, {
      enableEvents: true,
      enableMetrics: false,
      expiry: {
        defaultAgentTtlMs: 60000,
        defaultHumanTtlMs: 120000,
        expiryCheckIntervalMs: 100000, // Long interval to prevent auto-expire
        staleThresholdMs: 30000,
        maxStealCount: 3,
      },
    });

    await service.initialize();
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe('createClaim', () => {
    it('should create a coverage gap claim', async () => {
      const input = createCoverageGapInput();
      const claim = await service.createClaim(input);

      expect(claim.id).toMatch(/^claim_/);
      expect(claim.type).toBe('coverage-gap');
      expect(claim.status).toBe('available');
      expect(claim.priority).toBe('p1');
      expect(claim.domain).toBe('test-generation');
      expect(claim.title).toBe('UserService needs test coverage');
      expect(claim.metadata.filePath).toBe('src/services/user.service.ts');
      expect(claim.metadata.uncoveredLines).toEqual([45, 46, 47, 89, 90]);
      expect(claim.tags).toContain('authentication');
      expect(claim.stealCount).toBe(0);
    });

    it('should create a flaky test claim', async () => {
      const input = createFlakyTestInput();
      const claim = await service.createClaim(input);

      expect(claim.type).toBe('flaky-test');
      expect(claim.severity).toBe('high');
      expect(claim.metadata.flakinessRate).toBe(0.15);
      expect(claim.metadata.suspectedCauses).toContain('race condition');
    });

    it('should emit ClaimCreated event', async () => {
      await service.createClaim(createCoverageGapInput());

      const createEvents = eventBus.publishedEvents.filter(
        e => e.type === 'ClaimsClaimCreated'
      );
      expect(createEvents.length).toBeGreaterThan(0);
    });

    it('should set correlation ID', async () => {
      const claim = await service.createClaim(createCoverageGapInput());
      expect(claim.correlationId).toBeDefined();
    });
  });

  describe('claim', () => {
    it('should claim an available claim', async () => {
      const created = await service.createClaim(createCoverageGapInput());
      const claimant = createTestClaimant('agent');

      const claimed = await service.claim({
        claimId: created.id,
        claimant,
      });

      expect(claimed.status).toBe('claimed');
      expect(claimed.claimant).toEqual(claimant);
      expect(claimed.claimedAt).toBeDefined();
      expect(claimed.expiresAt).toBeDefined();
    });

    it('should set expiry based on claimant type', async () => {
      const created = await service.createClaim(createCoverageGapInput());
      const agent = createTestClaimant('agent');

      const claimed = await service.claim({
        claimId: created.id,
        claimant: agent,
      });

      // Agent TTL is 60000ms
      const expectedExpiry = claimed.claimedAt!.getTime() + 60000;
      expect(Math.abs(claimed.expiresAt!.getTime() - expectedExpiry)).toBeLessThan(100);
    });

    it('should throw for non-existent claim', async () => {
      const claimant = createTestClaimant('agent');

      await expect(
        service.claim({ claimId: 'non_existent', claimant })
      ).rejects.toThrow('Claim not found');
    });

    it('should throw for already claimed claim', async () => {
      const created = await service.createClaim(createCoverageGapInput());
      const claimant1 = createTestClaimant('agent');
      const claimant2 = createTestClaimant('agent');

      await service.claim({ claimId: created.id, claimant: claimant1 });

      await expect(
        service.claim({ claimId: created.id, claimant: claimant2 })
      ).rejects.toThrow('not available');
    });

    it('should emit ClaimClaimed event', async () => {
      const created = await service.createClaim(createCoverageGapInput());
      eventBus.clear();

      await service.claim({
        claimId: created.id,
        claimant: createTestClaimant('agent'),
      });

      const claimEvents = eventBus.publishedEvents.filter(
        e => e.type === 'ClaimsClaimClaimed'
      );
      expect(claimEvents.length).toBe(1);
    });
  });

  describe('release', () => {
    it('should release with completed status', async () => {
      const created = await service.createClaim(createCoverageGapInput());
      const claimant = createTestClaimant('agent');
      await service.claim({ claimId: created.id, claimant });

      const released = await service.release({
        claimId: created.id,
        claimantId: claimant.id,
        reason: 'completed',
        result: {
          success: true,
          summary: 'Tests generated successfully',
          artifacts: ['tests/user.service.test.ts'],
          timeSpent: 25,
        },
      });

      expect(released.status).toBe('completed');
      expect(released.result?.success).toBe(true);
      expect(released.result?.artifacts).toContain('tests/user.service.test.ts');
    });

    it('should release with abandoned status', async () => {
      const created = await service.createClaim(createCoverageGapInput());
      const claimant = createTestClaimant('agent');
      await service.claim({ claimId: created.id, claimant });

      const released = await service.release({
        claimId: created.id,
        claimantId: claimant.id,
        reason: 'abandoned',
      });

      expect(released.status).toBe('abandoned');
      expect(released.previousClaimants).toContain(claimant);
    });

    it('should throw for claimant mismatch', async () => {
      const created = await service.createClaim(createCoverageGapInput());
      const claimant = createTestClaimant('agent');
      await service.claim({ claimId: created.id, claimant });

      await expect(
        service.release({
          claimId: created.id,
          claimantId: 'wrong_claimant',
          reason: 'completed',
        })
      ).rejects.toThrow('Claimant mismatch');
    });

    it('should track completion metrics', async () => {
      const created = await service.createClaim(createCoverageGapInput());
      const claimant = createTestClaimant('agent');
      await service.claim({ claimId: created.id, claimant });

      const metricsBefore = service.getMetrics();
      expect(metricsBefore.totalCompleted).toBe(0);

      await service.release({
        claimId: created.id,
        claimantId: claimant.id,
        reason: 'completed',
      });

      const metricsAfter = service.getMetrics();
      expect(metricsAfter.totalCompleted).toBe(1);
    });
  });

  describe('steal', () => {
    it('should steal a claimed claim', async () => {
      const created = await service.createClaim(createCoverageGapInput());
      const originalClaimant = createTestClaimant('agent');
      await service.claim({ claimId: created.id, claimant: originalClaimant });

      const newClaimant: Claimant = {
        id: 'new_agent',
        type: 'agent',
        name: 'New Agent',
        domain: 'test-generation',
      };

      const stolen = await service.steal({
        claimId: created.id,
        newClaimant,
        reason: 'stale',
      });

      expect(stolen.claimant).toEqual(newClaimant);
      expect(stolen.stealCount).toBe(1);
      expect(stolen.previousClaimants).toContain(originalClaimant);
    });

    it('should throw when max steal count reached', async () => {
      const created = await service.createClaim(createCoverageGapInput());
      const claimant1 = createTestClaimant('agent');
      await service.claim({ claimId: created.id, claimant: claimant1 });

      // Steal 3 times (max)
      for (let i = 0; i < 3; i++) {
        const newClaimant: Claimant = {
          id: `stealer_${i}`,
          type: 'agent',
          name: `Stealer ${i}`,
          domain: 'test-generation',
        };
        await service.steal({
          claimId: created.id,
          newClaimant,
          reason: 'stale',
        });
      }

      // Fourth steal should fail
      await expect(
        service.steal({
          claimId: created.id,
          newClaimant: {
            id: 'stealer_4',
            type: 'agent',
            name: 'Stealer 4',
            domain: 'test-generation',
          },
          reason: 'stale',
        })
      ).rejects.toThrow('stolen too many times');
    });

    it('should emit ClaimStolen event', async () => {
      const created = await service.createClaim(createCoverageGapInput());
      await service.claim({
        claimId: created.id,
        claimant: createTestClaimant('agent'),
      });
      eventBus.clear();

      await service.steal({
        claimId: created.id,
        newClaimant: {
          id: 'stealer',
          type: 'agent',
          name: 'Stealer',
          domain: 'test-generation',
        },
        reason: 'idle-agent',
      });

      const stealEvents = eventBus.publishedEvents.filter(
        e => e.type === 'ClaimsClaimStolen'
      );
      expect(stealEvents.length).toBe(1);
    });
  });

  describe('handoff', () => {
    it('should hand off claim between claimants', async () => {
      const created = await service.createClaim(createCoverageGapInput());
      const agent = createTestClaimant('agent');
      await service.claim({ claimId: created.id, claimant: agent });

      const human: Claimant = {
        id: 'user_123',
        type: 'human',
        name: 'John Reviewer',
      };

      const handed = await service.handoff({
        claimId: created.id,
        fromClaimant: agent,
        toClaimant: human,
        notes: 'Please review generated tests',
      });

      expect(handed.claimant).toEqual(human);
      expect(handed.previousClaimants).toContain(agent);
    });

    it('should update expiry for new claimant type', async () => {
      const created = await service.createClaim(createCoverageGapInput());
      const agent = createTestClaimant('agent');
      await service.claim({ claimId: created.id, claimant: agent });

      const human: Claimant = {
        id: 'user_123',
        type: 'human',
        name: 'John Reviewer',
      };

      const handed = await service.handoff({
        claimId: created.id,
        fromClaimant: agent,
        toClaimant: human,
      });

      // Human TTL is 120000ms
      const expectedExpiry = handed.claimedAt!.getTime() + 120000;
      expect(Math.abs(handed.expiresAt!.getTime() - expectedExpiry)).toBeLessThan(100);
    });
  });

  describe('findClaims', () => {
    beforeEach(async () => {
      // Create multiple claims
      await service.createClaim({
        ...createCoverageGapInput(),
        priority: 'p0',
        tags: ['critical'],
      });
      await service.createClaim({
        ...createCoverageGapInput(),
        priority: 'p1',
      });
      await service.createClaim({
        ...createFlakyTestInput(),
        domain: 'test-execution',
      });
    });

    it('should filter by type', async () => {
      const results = await service.findClaims({ type: 'coverage-gap' });
      expect(results.length).toBe(2);
      expect(results.every(c => c.type === 'coverage-gap')).toBe(true);
    });

    it('should filter by priority', async () => {
      const results = await service.findClaims({ priority: 'p0' });
      expect(results.length).toBe(2); // 1 coverage-gap p0, 1 flaky-test p0
    });

    it('should filter by domain', async () => {
      const results = await service.findClaims({ domain: 'test-execution' });
      expect(results.length).toBe(1);
      expect(results[0].type).toBe('flaky-test');
    });

    it('should filter by tags', async () => {
      const results = await service.findClaims({ tags: ['critical'] });
      expect(results.length).toBe(1);
      expect(results[0].tags).toContain('critical');
    });

    it('should filter by status', async () => {
      const results = await service.findClaims({ status: 'available' });
      expect(results.length).toBe(3);
    });

    it('should limit results', async () => {
      const results = await service.findClaims({ limit: 2 });
      expect(results.length).toBe(2);
    });
  });

  describe('getAvailableForClaimant', () => {
    it('should return claims for agent domain', async () => {
      await service.createClaim({
        ...createCoverageGapInput(),
        domain: 'test-generation',
      });
      await service.createClaim({
        ...createFlakyTestInput(),
        domain: 'test-execution',
      });

      const agent: Claimant = {
        id: 'agent_1',
        type: 'agent',
        name: 'Test Gen Agent',
        domain: 'test-generation',
      };

      const available = await service.getAvailableForClaimant(agent);
      expect(available.length).toBe(1);
      expect(available[0].domain).toBe('test-generation');
    });

    it('should return all available claims for humans', async () => {
      await service.createClaim({
        ...createCoverageGapInput(),
        domain: 'test-generation',
      });
      await service.createClaim({
        ...createFlakyTestInput(),
        domain: 'test-execution',
      });

      const human: Claimant = {
        id: 'user_1',
        type: 'human',
        name: 'Tester',
      };

      const available = await service.getAvailableForClaimant(human);
      expect(available.length).toBe(2);
    });

    it('should sort by priority', async () => {
      await service.createClaim({
        ...createCoverageGapInput(),
        priority: 'p2',
      });
      await service.createClaim({
        ...createCoverageGapInput(),
        priority: 'p0',
      });
      await service.createClaim({
        ...createCoverageGapInput(),
        priority: 'p1',
      });

      const agent = createTestClaimant('agent');
      const available = await service.getAvailableForClaimant(agent);

      expect(available[0].priority).toBe('p0');
      expect(available[1].priority).toBe('p1');
      expect(available[2].priority).toBe('p2');
    });
  });

  describe('expireStale', () => {
    it('should expire claims past their expiry time', async () => {
      // Create and claim
      const created = await service.createClaim(createCoverageGapInput());
      const claimant = createTestClaimant('agent');
      await service.claim({
        claimId: created.id,
        claimant,
        ttlMs: 1, // Very short TTL
      });

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 10));

      const expired = await service.expireStale();
      expect(expired).toBe(1);

      const claim = await service.getClaim(created.id);
      expect(claim?.status).toBe('expired');
    });
  });

  describe('updateStatus', () => {
    it('should update claim status', async () => {
      const created = await service.createClaim(createCoverageGapInput());
      const claimant = createTestClaimant('agent');
      await service.claim({ claimId: created.id, claimant });

      const updated = await (service as ClaimService).updateStatus(
        created.id,
        'in-progress',
        claimant.id
      );

      expect(updated.status).toBe('in-progress');
    });

    it('should emit ClaimStatusChanged event', async () => {
      const created = await service.createClaim(createCoverageGapInput());
      const claimant = createTestClaimant('agent');
      await service.claim({ claimId: created.id, claimant });
      eventBus.clear();

      await (service as ClaimService).updateStatus(
        created.id,
        'in-progress',
        claimant.id
      );

      const statusEvents = eventBus.publishedEvents.filter(
        e => e.type === 'ClaimsClaimStatusChanged'
      );
      expect(statusEvents.length).toBe(1);
    });
  });

  describe('escalatePriority', () => {
    it('should escalate priority', async () => {
      const created = await service.createClaim({
        ...createCoverageGapInput(),
        priority: 'p2',
      });

      const escalated = await (service as ClaimService).escalatePriority(created.id);
      expect(escalated.priority).toBe('p1');

      const escalatedAgain = await (service as ClaimService).escalatePriority(created.id);
      expect(escalatedAgain.priority).toBe('p0');
    });

    it('should throw when already at highest priority', async () => {
      const created = await service.createClaim({
        ...createCoverageGapInput(),
        priority: 'p0',
      });

      await expect(
        (service as ClaimService).escalatePriority(created.id)
      ).rejects.toThrow('already at highest priority');
    });
  });

  describe('metrics', () => {
    it('should track claim metrics', async () => {
      // Create claims
      await service.createClaim(createCoverageGapInput());
      await service.createClaim(createFlakyTestInput());

      // Claim and complete one
      const claim = await service.createClaim(createCoverageGapInput());
      const claimant = createTestClaimant('agent');
      await service.claim({ claimId: claim.id, claimant });
      await service.release({
        claimId: claim.id,
        claimantId: claimant.id,
        reason: 'completed',
      });

      const metrics = service.getMetrics();
      expect(metrics.totalCreated).toBe(3);
      expect(metrics.totalCompleted).toBe(1);
    });
  });
});

describe('InMemoryClaimRepository', () => {
  let repository: InMemoryClaimRepository;

  beforeEach(() => {
    repository = new InMemoryClaimRepository();
  });

  it('should create and get claim', async () => {
    const claim: Claim = {
      id: 'claim_1',
      type: 'coverage-gap',
      status: 'available',
      priority: 'p1',
      domain: 'test-generation',
      title: 'Test claim',
      metadata: {} as CoverageGapMetadata,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      stealCount: 0,
    };

    await repository.create(claim);
    const retrieved = await repository.get('claim_1');

    expect(retrieved).toEqual(claim);
  });

  it('should throw on duplicate create', async () => {
    const claim: Claim = {
      id: 'claim_1',
      type: 'coverage-gap',
      status: 'available',
      priority: 'p1',
      domain: 'test-generation',
      title: 'Test claim',
      metadata: {} as CoverageGapMetadata,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      stealCount: 0,
    };

    await repository.create(claim);
    await expect(repository.create(claim)).rejects.toThrow('already exists');
  });

  it('should update claim', async () => {
    const claim: Claim = {
      id: 'claim_1',
      type: 'coverage-gap',
      status: 'available',
      priority: 'p1',
      domain: 'test-generation',
      title: 'Test claim',
      metadata: {} as CoverageGapMetadata,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      stealCount: 0,
    };

    await repository.create(claim);
    await repository.update({ ...claim, status: 'claimed' });

    const retrieved = await repository.get('claim_1');
    expect(retrieved?.status).toBe('claimed');
  });

  it('should delete claim', async () => {
    const claim: Claim = {
      id: 'claim_1',
      type: 'coverage-gap',
      status: 'available',
      priority: 'p1',
      domain: 'test-generation',
      title: 'Test claim',
      metadata: {} as CoverageGapMetadata,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      stealCount: 0,
    };

    await repository.create(claim);
    const deleted = await repository.delete('claim_1');

    expect(deleted).toBe(true);
    expect(await repository.get('claim_1')).toBeUndefined();
  });

  it('should find claims with filter', async () => {
    const claim1: Claim = {
      id: 'claim_1',
      type: 'coverage-gap',
      status: 'available',
      priority: 'p0',
      domain: 'test-generation',
      title: 'Test claim 1',
      metadata: {} as CoverageGapMetadata,
      tags: ['urgent'],
      createdAt: new Date(),
      updatedAt: new Date(),
      stealCount: 0,
    };

    const claim2: Claim = {
      id: 'claim_2',
      type: 'flaky-test',
      status: 'claimed',
      priority: 'p1',
      domain: 'test-execution',
      title: 'Test claim 2',
      metadata: {} as FlakyTestMetadata,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      stealCount: 0,
    };

    await repository.create(claim1);
    await repository.create(claim2);

    const byType = await repository.find({ type: 'coverage-gap' });
    expect(byType.length).toBe(1);

    const byStatus = await repository.find({ status: 'available' });
    expect(byStatus.length).toBe(1);

    const byPriority = await repository.find({ priority: 'p0' });
    expect(byPriority.length).toBe(1);

    const byTags = await repository.find({ tags: ['urgent'] });
    expect(byTags.length).toBe(1);
  });

  it('should count claims', async () => {
    const claim1: Claim = {
      id: 'claim_1',
      type: 'coverage-gap',
      status: 'available',
      priority: 'p1',
      domain: 'test-generation',
      title: 'Test 1',
      metadata: {} as CoverageGapMetadata,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      stealCount: 0,
    };

    const claim2: Claim = {
      id: 'claim_2',
      type: 'coverage-gap',
      status: 'claimed',
      priority: 'p1',
      domain: 'test-generation',
      title: 'Test 2',
      metadata: {} as CoverageGapMetadata,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      stealCount: 0,
    };

    await repository.create(claim1);
    await repository.create(claim2);

    const count = await repository.count({ type: 'coverage-gap' });
    expect(count).toBe(2);

    const availableCount = await repository.count({ status: 'available' });
    expect(availableCount).toBe(1);
  });

  it('should find expired claims', async () => {
    const expiredClaim: Claim = {
      id: 'claim_1',
      type: 'coverage-gap',
      status: 'claimed',
      priority: 'p1',
      domain: 'test-generation',
      title: 'Expired claim',
      metadata: {} as CoverageGapMetadata,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() - 1000), // Already expired
      stealCount: 0,
    };

    const validClaim: Claim = {
      id: 'claim_2',
      type: 'coverage-gap',
      status: 'claimed',
      priority: 'p1',
      domain: 'test-generation',
      title: 'Valid claim',
      metadata: {} as CoverageGapMetadata,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 60000), // Not expired
      stealCount: 0,
    };

    await repository.create(expiredClaim);
    await repository.create(validClaim);

    const expired = await repository.findExpired();
    expect(expired.length).toBe(1);
    expect(expired[0].id).toBe('claim_1');
  });

  it('should find stale claims', async () => {
    const staleClaim: Claim = {
      id: 'claim_1',
      type: 'coverage-gap',
      status: 'claimed',
      priority: 'p1',
      domain: 'test-generation',
      title: 'Stale claim',
      metadata: {} as CoverageGapMetadata,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(Date.now() - 60000), // Updated 1 minute ago
      stealCount: 0,
    };

    const freshClaim: Claim = {
      id: 'claim_2',
      type: 'coverage-gap',
      status: 'claimed',
      priority: 'p1',
      domain: 'test-generation',
      title: 'Fresh claim',
      metadata: {} as CoverageGapMetadata,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(), // Just updated
      stealCount: 0,
    };

    await repository.create(staleClaim);
    await repository.create(freshClaim);

    const stale = await repository.findStale(30000); // 30 second threshold
    expect(stale.length).toBe(1);
    expect(stale[0].id).toBe('claim_1');
  });
});
