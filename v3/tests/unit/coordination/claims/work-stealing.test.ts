/**
 * Unit tests for Work Stealing Coordinator
 * ADR-016: Collaborative Test Task Claims
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  WorkStealingCoordinator,
  createWorkStealingCoordinator,
  calculateStealPriority,
  canAgentHandleClaimType,
} from '../../../../src/coordination/claims/work-stealing';
import {
  ClaimService,
  InMemoryClaimRepository,
} from '../../../../src/coordination/claims';
import {
  Claim,
  Claimant,
  IClaimRepository,
  IClaimService,
  CoverageGapMetadata,
  FlakyTestMetadata,
} from '../../../../src/coordination/claims/interfaces';
import { DomainName, DomainEvent, AgentType } from '../../../../src/shared/types';
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

function createTestClaimant(id: string, domain: DomainName = 'test-generation'): Claimant {
  return {
    id,
    type: 'agent',
    name: `Agent ${id}`,
    domain,
    agentType: 'generator',
  };
}

function createTestClaim(id: string, options: Partial<Claim> = {}): Claim {
  return {
    id,
    type: 'coverage-gap',
    status: 'available',
    priority: 'p1',
    domain: 'test-generation',
    title: `Test claim ${id}`,
    metadata: {
      filePath: 'src/test.ts',
      uncoveredLines: [1, 2, 3],
      currentCoverage: 50,
      targetCoverage: 80,
    } as CoverageGapMetadata,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    stealCount: 0,
    ...options,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('WorkStealingCoordinator', () => {
  let repository: InMemoryClaimRepository;
  let eventBus: MockEventBus;
  let claimService: ClaimService;
  let coordinator: WorkStealingCoordinator;

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

    coordinator = createWorkStealingCoordinator(claimService, repository, eventBus, {
      enabled: false, // Disable auto-check for tests
      idleThresholdMs: 1000,
      stealBatchSize: 5,
      checkIntervalMs: 100000,
      prioritizeByPriority: true,
      allowCrossDomain: false,
    });

    await coordinator.initialize();
  });

  afterEach(async () => {
    await coordinator.dispose();
    await claimService.dispose();
  });

  describe('agent registration', () => {
    it('should register an agent for tracking', () => {
      const agent = createTestClaimant('agent_1');
      coordinator.registerAgent(agent);

      const tracked = coordinator.getTrackedAgents();
      expect(tracked.length).toBe(1);
      expect(tracked[0].agentId).toBe('agent_1');
    });

    it('should unregister an agent', () => {
      const agent = createTestClaimant('agent_1');
      coordinator.registerAgent(agent);
      coordinator.unregisterAgent('agent_1');

      const tracked = coordinator.getTrackedAgents();
      expect(tracked.length).toBe(0);
    });

    it('should track agent activity', () => {
      const agent = createTestClaimant('agent_1');
      coordinator.registerAgent(agent);

      coordinator.recordActivity('agent_1', 'claim_1');

      const after = coordinator.getTrackedAgents()[0];
      expect(after.currentClaimId).toBe('claim_1');
    });
  });

  describe('getIdleAgents', () => {
    it('should return agents idle beyond threshold', async () => {
      const agent1 = createTestClaimant('agent_1');
      const agent2 = createTestClaimant('agent_2');

      coordinator.registerAgent(agent1);
      coordinator.registerAgent(agent2);

      // Make agent1 stale by setting old activity time
      coordinator.setAgentActivityTime('agent_1', new Date(Date.now() - 5000)); // 5 seconds ago

      // agent2 has current claim
      coordinator.recordActivity('agent_2', 'claim_123');

      const idleAgents = coordinator.getIdleAgents();

      // agent1 should be idle (no claim, old activity)
      expect(idleAgents.some(a => a.id === 'agent_1')).toBe(true);

      // agent2 should NOT be idle (has current claim)
      expect(idleAgents.some(a => a.id === 'agent_2')).toBe(false);
    });
  });

  describe('getBusyAgents', () => {
    it('should return agents with active claims', () => {
      const agent1 = createTestClaimant('agent_1');
      const agent2 = createTestClaimant('agent_2');

      coordinator.registerAgent(agent1);
      coordinator.registerAgent(agent2);

      coordinator.recordActivity('agent_1', 'claim_1');

      const busyAgents = coordinator.getBusyAgents();
      expect(busyAgents.some(a => a.id === 'agent_1')).toBe(true);
    });
  });

  describe('getStealableClaims', () => {
    it('should return stale claims for idle agent', async () => {
      // Create a claimed but stale claim
      const claim = createTestClaim('claim_1', {
        status: 'claimed',
        claimant: createTestClaimant('busy_agent'),
        updatedAt: new Date(Date.now() - 60000), // 1 minute ago
      });
      await repository.create(claim);

      const idleAgent = createTestClaimant('idle_agent');
      const stealable = await coordinator.getStealableClaims(idleAgent);

      expect(stealable.length).toBe(1);
      expect(stealable[0].id).toBe('claim_1');
    });

    it('should not return claims from same agent', async () => {
      const agent = createTestClaimant('agent_1');

      const claim = createTestClaim('claim_1', {
        status: 'claimed',
        claimant: agent,
        updatedAt: new Date(Date.now() - 60000),
      });
      await repository.create(claim);

      const stealable = await coordinator.getStealableClaims(agent);
      expect(stealable.length).toBe(0);
    });

    it('should filter by domain when cross-domain disabled', async () => {
      const claim = createTestClaim('claim_1', {
        status: 'claimed',
        domain: 'test-execution',
        claimant: createTestClaimant('other', 'test-execution'),
        updatedAt: new Date(Date.now() - 60000),
      });
      await repository.create(claim);

      const agent = createTestClaimant('agent_1', 'test-generation');
      const stealable = await coordinator.getStealableClaims(agent);

      // Should not include claim from different domain
      expect(stealable.length).toBe(0);
    });

    it('should sort by priority when configured', async () => {
      const claimP2 = createTestClaim('claim_p2', {
        status: 'claimed',
        priority: 'p2',
        claimant: createTestClaimant('busy_1'),
        updatedAt: new Date(Date.now() - 60000),
      });
      const claimP0 = createTestClaim('claim_p0', {
        status: 'claimed',
        priority: 'p0',
        claimant: createTestClaimant('busy_2'),
        updatedAt: new Date(Date.now() - 60000),
      });

      await repository.create(claimP2);
      await repository.create(claimP0);

      const agent = createTestClaimant('idle_agent');
      const stealable = await coordinator.getStealableClaims(agent);

      expect(stealable[0].priority).toBe('p0');
      expect(stealable[1].priority).toBe('p2');
    });
  });

  describe('checkAndSteal', () => {
    it('should steal claims for idle agents', async () => {
      const busyAgent = createTestClaimant('busy_agent');
      const staleTime = new Date(Date.now() - 60000); // 1 minute ago

      // Create claim directly in repository as already stale (bypassing service update behavior)
      const staleClaim = createTestClaim('stale_claim', {
        status: 'claimed',
        domain: 'test-generation',
        claimant: busyAgent,
        claimedAt: staleTime,
        updatedAt: staleTime, // Set stale time directly
      });
      await repository.create(staleClaim);

      // Register an idle agent
      const idleAgent = createTestClaimant('idle_agent');
      coordinator.registerAgent(idleAgent);

      // Force activity to be old using the proper method
      coordinator.setAgentActivityTime('idle_agent', new Date(Date.now() - 5000));

      const stolen = await coordinator.checkAndSteal();
      expect(stolen).toBe(1);

      // Verify claim was stolen
      const updatedClaim = await claimService.getClaim(staleClaim.id);
      expect(updatedClaim?.claimant?.id).toBe('idle_agent');
      expect(updatedClaim?.stealCount).toBe(1);
    });

    it('should respect batch size limit', async () => {
      // Create multiple stale claims
      for (let i = 0; i < 10; i++) {
        const claim = await claimService.createClaim({
          type: 'coverage-gap',
          priority: 'p1',
          domain: 'test-generation',
          title: `Stale claim ${i}`,
          metadata: {
            filePath: `test${i}.ts`,
            uncoveredLines: [1],
            currentCoverage: 50,
            targetCoverage: 80,
          } as CoverageGapMetadata,
        });

        await claimService.claim({
          claimId: claim.id,
          claimant: createTestClaimant(`busy_${i}`),
        });

        // Make stale
        const claimed = await repository.get(claim.id);
        if (claimed) {
          await repository.update({
            ...claimed,
            updatedAt: new Date(Date.now() - 60000),
          });
        }
      }

      // Register idle agents
      for (let i = 0; i < 10; i++) {
        const agent = createTestClaimant(`idle_${i}`);
        coordinator.registerAgent(agent);
        coordinator.setAgentActivityTime(`idle_${i}`, new Date(Date.now() - 5000));
      }

      const stolen = await coordinator.checkAndSteal();
      // Should respect batch size of 5
      expect(stolen).toBeLessThanOrEqual(5);
    });

    it('should emit work stealing event', async () => {
      const busyAgent = createTestClaimant('busy');
      const staleTime = new Date(Date.now() - 60000); // 1 minute ago

      // Create claim directly in repository as already stale (bypassing service update behavior)
      const staleClaim = createTestClaim('stale_event_claim', {
        status: 'claimed',
        domain: 'test-generation',
        claimant: busyAgent,
        claimedAt: staleTime,
        updatedAt: staleTime, // Set stale time directly
      });
      await repository.create(staleClaim);

      const idleAgent = createTestClaimant('idle');
      coordinator.registerAgent(idleAgent);
      coordinator.setAgentActivityTime('idle', new Date(Date.now() - 5000));

      eventBus.clear();
      await coordinator.checkAndSteal();

      const stealEvents = eventBus.publishedEvents.filter(
        e => e.type === 'ClaimsWorkStealingOccurred'
      );
      expect(stealEvents.length).toBe(1);
    });
  });

  describe('markClaimCompleted', () => {
    it('should clear current claim for agent', () => {
      const agent = createTestClaimant('agent_1');
      coordinator.registerAgent(agent);
      coordinator.recordActivity('agent_1', 'claim_1');

      let tracked = coordinator.getTrackedAgents();
      expect(tracked[0].currentClaimId).toBe('claim_1');

      coordinator.markClaimCompleted('agent_1');

      tracked = coordinator.getTrackedAgents();
      expect(tracked[0].currentClaimId).toBeUndefined();
    });
  });

  describe('enable/disable', () => {
    it('should enable work stealing', () => {
      expect(coordinator.isEnabled()).toBe(false);

      coordinator.enable();
      expect(coordinator.isEnabled()).toBe(true);

      coordinator.disable();
      expect(coordinator.isEnabled()).toBe(false);
    });
  });
});

describe('calculateStealPriority', () => {
  it('should give higher priority to p0 claims', () => {
    const p0Claim = createTestClaim('p0', { priority: 'p0' });
    const p2Claim = createTestClaim('p2', { priority: 'p2' });

    const p0Score = calculateStealPriority(p0Claim);
    const p2Score = calculateStealPriority(p2Claim);

    expect(p0Score).toBeGreaterThan(p2Score);
  });

  it('should give higher priority to stale claims', () => {
    const staleClaim = createTestClaim('stale', {
      updatedAt: new Date(Date.now() - 120000), // 2 minutes ago
    });
    const freshClaim = createTestClaim('fresh', {
      updatedAt: new Date(),
    });

    const staleScore = calculateStealPriority(staleClaim);
    const freshScore = calculateStealPriority(freshClaim);

    expect(staleScore).toBeGreaterThan(freshScore);
  });

  it('should give higher priority to claims with close deadlines', () => {
    const urgentClaim = createTestClaim('urgent', {
      deadline: new Date(Date.now() + 1800000), // 30 minutes
    });
    const relaxedClaim = createTestClaim('relaxed', {
      deadline: new Date(Date.now() + 86400000 * 2), // 2 days
    });

    const urgentScore = calculateStealPriority(urgentClaim);
    const relaxedScore = calculateStealPriority(relaxedClaim);

    expect(urgentScore).toBeGreaterThan(relaxedScore);
  });

  it('should penalize claims with high steal count', () => {
    const newClaim = createTestClaim('new', { stealCount: 0 });
    const stolenClaim = createTestClaim('stolen', { stealCount: 2 });

    const newScore = calculateStealPriority(newClaim);
    const stolenScore = calculateStealPriority(stolenClaim);

    expect(newScore).toBeGreaterThan(stolenScore);
  });
});

describe('canAgentHandleClaimType', () => {
  it('should allow generator agents for coverage gaps', () => {
    expect(canAgentHandleClaimType('generator', 'coverage-gap')).toBe(true);
  });

  it('should allow tester agents for flaky tests', () => {
    expect(canAgentHandleClaimType('tester', 'flaky-test')).toBe(true);
  });

  it('should allow analyzer agents for defect investigation', () => {
    expect(canAgentHandleClaimType('analyzer', 'defect-investigation')).toBe(true);
  });

  it('should allow reviewer agents for test review', () => {
    expect(canAgentHandleClaimType('reviewer', 'test-review')).toBe(true);
  });

  it('should allow undefined agent type for any claim', () => {
    expect(canAgentHandleClaimType(undefined, 'coverage-gap')).toBe(true);
    expect(canAgentHandleClaimType(undefined, 'flaky-test')).toBe(true);
  });

  it('should reject mismatched agent types', () => {
    expect(canAgentHandleClaimType('coordinator', 'coverage-gap')).toBe(false);
    expect(canAgentHandleClaimType('optimizer', 'flaky-test')).toBe(false);
  });
});
