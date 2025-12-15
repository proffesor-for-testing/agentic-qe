/**
 * Consensus Propose Handler Test Suite
 *
 * Tests for creating consensus proposals for multi-agent decision making.
 * Follows TDD RED phase - tests written before implementation verification.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ConsensusProposeHandler } from '@mcp/handlers/memory/consensus-propose';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

// Mock services to prevent heavy initialization (database, EventBus, etc.)
jest.mock('../../../../src/mcp/services/AgentRegistry.js');
jest.mock('../../../../src/mcp/services/HookExecutor.js');

describe('ConsensusProposeHandler', () => {
  let handler: ConsensusProposeHandler;
  let mockRegistry: any;
  let mockHookExecutor: any;
  let proposals: Map<string, any>;

  beforeEach(() => {
    mockRegistry = { getAgent: jest.fn(), listAgents: jest.fn().mockReturnValue([]) } as any;
    mockHookExecutor = { executePreTask: jest.fn().mockResolvedValue(undefined), executePostTask: jest.fn().mockResolvedValue(undefined), executePostEdit: jest.fn().mockResolvedValue(undefined), notify: jest.fn().mockResolvedValue(undefined) } as any;
    proposals = new Map();
    handler = new ConsensusProposeHandler(mockRegistry, mockHookExecutor, proposals);
  });

  afterEach(async () => {
    proposals.clear();
  });

  describe('Happy Path - Create Proposal', () => {
    it('should create consensus proposal successfully', async () => {
      // GIVEN: Valid proposal parameters
      // WHEN: Creating proposal
      const response = await handler.handle({
        proposalId: 'prop-001',
        topic: 'test-strategy-selection',
        proposal: {
          strategy: 'integration-first',
          framework: 'jest',
          coverage: 90
        },
        votingAgents: ['qe-test-generator', 'qe-quality-gate', 'qe-coverage-analyzer'],
        quorum: 0.67
      });

      // THEN: Proposal created successfully
      expect(response.success).toBe(true);
      expect(response.data.created).toBe(true);
      expect(response.data.proposalId).toBe('prop-001');
      expect(response.data.topic).toBe('test-strategy-selection');
      expect(response.data.votingAgents).toHaveLength(3);
      expect(response.data.quorum).toBe(0.67);
      expect(response.data.status).toBe('pending');
      expect(response.data.expiresAt).toBeDefined();
    });

    it('should create proposal with custom timeout', async () => {
      // GIVEN: Proposal with 600 second timeout
      // WHEN: Creating proposal
      const response = await handler.handle({
        proposalId: 'prop-timeout',
        topic: 'architecture-decision',
        proposal: { architecture: 'microservices' },
        votingAgents: ['agent-1', 'agent-2'],
        quorum: 0.5,
        timeout: 600
      });

      // THEN: Proposal created with correct expiration
      expect(response.success).toBe(true);
      const expiresAt = response.data.expiresAt;
      const expectedExpiry = Date.now() + (600 * 1000);
      expect(expiresAt).toBeGreaterThan(Date.now());
      expect(expiresAt).toBeLessThanOrEqual(expectedExpiry + 1000); // 1s tolerance
    });

    it('should create proposal with default 300 second timeout', async () => {
      // GIVEN: Proposal without timeout specified
      // WHEN: Creating proposal
      const response = await handler.handle({
        proposalId: 'prop-default-timeout',
        topic: 'test-decision',
        proposal: { decision: 'proceed' },
        votingAgents: ['agent-1'],
        quorum: 1.0
      });

      // THEN: Default 300s timeout applied
      expect(response.success).toBe(true);
      const expiresAt = response.data.expiresAt;
      const expectedExpiry = Date.now() + (300 * 1000);
      expect(expiresAt).toBeGreaterThan(Date.now());
      expect(expiresAt).toBeLessThanOrEqual(expectedExpiry + 1000);
    });

    it('should create proposal with metadata', async () => {
      // GIVEN: Proposal with rich metadata
      const metadata = {
        context: 'QE swarm coordination',
        priority: 'high',
        relatedIssues: ['ISSUE-123', 'ISSUE-456'],
        createdBy: 'qe-orchestrator'
      };

      // WHEN: Creating proposal
      const response = await handler.handle({
        proposalId: 'prop-meta',
        topic: 'test-coverage-threshold',
        proposal: { threshold: 85 },
        votingAgents: ['agent-1', 'agent-2'],
        quorum: 0.5,
        metadata
      });

      // THEN: Proposal created with metadata
      expect(response.success).toBe(true);
      const proposal = proposals.get('prop-meta');
      expect(proposal.metadata).toEqual(metadata);
    });

    it('should support various quorum values', async () => {
      // GIVEN: Different quorum requirements
      const quorumValues = [0.5, 0.67, 0.75, 1.0];

      // WHEN: Creating proposals with different quorums
      for (let i = 0; i < quorumValues.length; i++) {
        const response = await handler.handle({
          proposalId: `prop-quorum-${i}`,
          topic: 'test-topic',
          proposal: { test: true },
          votingAgents: ['agent-1', 'agent-2', 'agent-3'],
          quorum: quorumValues[i]
        });

        // THEN: Each quorum accepted
        expect(response.success).toBe(true);
        expect(response.data.quorum).toBe(quorumValues[i]);
      }
    });

    it('should support complex proposal data structures', async () => {
      // GIVEN: Complex proposal object
      const complexProposal = {
        testStrategy: {
          phases: ['unit', 'integration', 'e2e'],
          coverage: {
            unit: 90,
            integration: 80,
            e2e: 70
          },
          frameworks: ['jest', 'playwright'],
          parallel: true
        },
        timeline: {
          start: '2025-01-01',
          end: '2025-01-31'
        },
        resources: ['agent-1', 'agent-2', 'agent-3']
      };

      // WHEN: Creating proposal with complex data
      const response = await handler.handle({
        proposalId: 'prop-complex',
        topic: 'comprehensive-test-plan',
        proposal: complexProposal,
        votingAgents: ['qe-test-generator', 'qe-quality-gate'],
        quorum: 0.5
      });

      // THEN: Complex structure preserved
      expect(response.success).toBe(true);
      const proposal = proposals.get('prop-complex');
      expect(proposal.proposal).toEqual(complexProposal);
      expect(proposal.proposal.testStrategy.phases).toHaveLength(3);
    });
  });

  describe('Input Validation', () => {
    it('should reject missing proposalId', async () => {
      // GIVEN: Missing proposalId parameter
      // WHEN: Creating proposal
      const response = await handler.handle({
        topic: 'test',
        proposal: { data: 'test' },
        votingAgents: ['agent-1'],
        quorum: 0.5
      } as any);

      // THEN: Validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('proposalId');
    });

    it('should reject missing topic', async () => {
      // GIVEN: Missing topic parameter
      // WHEN: Creating proposal
      const response = await handler.handle({
        proposalId: 'prop-1',
        proposal: { data: 'test' },
        votingAgents: ['agent-1'],
        quorum: 0.5
      } as any);

      // THEN: Validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('topic');
    });

    it('should reject missing proposal', async () => {
      // GIVEN: Missing proposal parameter
      // WHEN: Creating proposal
      const response = await handler.handle({
        proposalId: 'prop-1',
        topic: 'test',
        votingAgents: ['agent-1'],
        quorum: 0.5
      } as any);

      // THEN: Validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('proposal');
    });

    it('should reject missing votingAgents', async () => {
      // GIVEN: Missing votingAgents parameter
      // WHEN: Creating proposal
      const response = await handler.handle({
        proposalId: 'prop-1',
        topic: 'test',
        proposal: { data: 'test' },
        quorum: 0.5
      } as any);

      // THEN: Validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('votingAgents');
    });

    it('should reject missing quorum', async () => {
      // GIVEN: Missing quorum parameter
      // WHEN: Creating proposal
      const response = await handler.handle({
        proposalId: 'prop-1',
        topic: 'test',
        proposal: { data: 'test' },
        votingAgents: ['agent-1']
      } as any);

      // THEN: Validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('quorum');
    });

    it('should reject quorum below 0', async () => {
      // GIVEN: Negative quorum
      // WHEN: Creating proposal
      const response = await handler.handle({
        proposalId: 'prop-invalid-quorum',
        topic: 'test',
        proposal: { data: 'test' },
        votingAgents: ['agent-1'],
        quorum: -0.5
      });

      // THEN: Validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('Quorum must be between 0 and 1');
    });

    it('should reject quorum above 1', async () => {
      // GIVEN: Quorum greater than 1
      // WHEN: Creating proposal
      const response = await handler.handle({
        proposalId: 'prop-invalid-quorum-2',
        topic: 'test',
        proposal: { data: 'test' },
        votingAgents: ['agent-1'],
        quorum: 1.5
      });

      // THEN: Validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('Quorum must be between 0 and 1');
    });

    it('should accept edge case quorum values 0 and 1', async () => {
      // GIVEN: Edge case quorum values
      // WHEN: Creating proposals with quorum 0 and 1
      const response1 = await handler.handle({
        proposalId: 'prop-quorum-0',
        topic: 'test',
        proposal: { data: 'test' },
        votingAgents: ['agent-1'],
        quorum: 0
      });

      const response2 = await handler.handle({
        proposalId: 'prop-quorum-1',
        topic: 'test',
        proposal: { data: 'test' },
        votingAgents: ['agent-1'],
        quorum: 1
      });

      // THEN: Both accepted
      expect(response1.success).toBe(true);
      expect(response2.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should reject duplicate proposal ID', async () => {
      // GIVEN: Proposal already exists
      await handler.handle({
        proposalId: 'duplicate-prop',
        topic: 'test',
        proposal: { data: 'original' },
        votingAgents: ['agent-1'],
        quorum: 0.5
      });

      // WHEN: Creating proposal with same ID
      const response = await handler.handle({
        proposalId: 'duplicate-prop',
        topic: 'test',
        proposal: { data: 'duplicate' },
        votingAgents: ['agent-1'],
        quorum: 0.5
      });

      // THEN: Error returned
      expect(response.success).toBe(false);
      expect(response.error).toContain('Proposal already exists');
      expect(response.error).toContain('duplicate-prop');
    });
  });

  describe('Proposal Expiration', () => {
    it('should expire proposal after timeout', async () => {
      // GIVEN: Proposal with short timeout
      jest.useFakeTimers();

      await handler.handle({
        proposalId: 'expire-test',
        topic: 'test',
        proposal: { data: 'test' },
        votingAgents: ['agent-1'],
        quorum: 1.0,
        timeout: 2
      });

      const proposal = proposals.get('expire-test');
      expect(proposal.status).toBe('pending');

      // WHEN: Time passes beyond timeout
      jest.advanceTimersByTime(3000);

      // THEN: Proposal expired
      expect(proposal.status).toBe('expired');

      jest.useRealTimers();
    });

    it('should not expire proposal before timeout', async () => {
      // GIVEN: Proposal with timeout
      jest.useFakeTimers();

      await handler.handle({
        proposalId: 'no-expire-test',
        topic: 'test',
        proposal: { data: 'test' },
        votingAgents: ['agent-1'],
        quorum: 1.0,
        timeout: 5
      });

      // WHEN: Time passes but not beyond timeout
      jest.advanceTimersByTime(3000);

      // THEN: Proposal still pending
      const proposal = proposals.get('no-expire-test');
      expect(proposal.status).toBe('pending');

      jest.useRealTimers();
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in proposalId', async () => {
      // GIVEN: ProposalIds with special characters
      const specialIds = [
        'prop-with-dashes',
        'prop_with_underscores',
        'prop.with.dots',
        'prop-2025-01-01'
      ];

      // WHEN: Creating proposals with special IDs
      for (const proposalId of specialIds) {
        const response = await handler.handle({
          proposalId,
          topic: 'test',
          proposal: { data: 'test' },
          votingAgents: ['agent-1'],
          quorum: 0.5
        });

        // THEN: All successful
        expect(response.success).toBe(true);
      }
    });

    it('should handle empty votingAgents array', async () => {
      // GIVEN: Empty votingAgents array
      // WHEN: Creating proposal
      const response = await handler.handle({
        proposalId: 'empty-voters',
        topic: 'test',
        proposal: { data: 'test' },
        votingAgents: [],
        quorum: 0.5
      });

      // THEN: Proposal created (will never reach consensus)
      expect(response.success).toBe(true);
      expect(response.data.votingAgents).toHaveLength(0);
    });

    it('should handle single voting agent', async () => {
      // GIVEN: Single voting agent with quorum 1.0
      // WHEN: Creating proposal
      const response = await handler.handle({
        proposalId: 'single-voter',
        topic: 'test',
        proposal: { data: 'test' },
        votingAgents: ['sole-agent'],
        quorum: 1.0
      });

      // THEN: Proposal created
      expect(response.success).toBe(true);
      expect(response.data.votingAgents).toHaveLength(1);
    });

    it('should handle many voting agents', async () => {
      // GIVEN: 50 voting agents
      const manyAgents = Array.from({ length: 50 }, (_, i) => `agent-${i}`);

      // WHEN: Creating proposal
      const response = await handler.handle({
        proposalId: 'many-voters',
        topic: 'test',
        proposal: { data: 'test' },
        votingAgents: manyAgents,
        quorum: 0.6
      });

      // THEN: Proposal created with all agents
      expect(response.success).toBe(true);
      expect(response.data.votingAgents).toHaveLength(50);
    });

    it('should handle null values in proposal data', async () => {
      // GIVEN: Proposal with null values
      // WHEN: Creating proposal
      const response = await handler.handle({
        proposalId: 'null-data',
        topic: 'test',
        proposal: {
          field1: 'value',
          field2: null,
          field3: undefined
        },
        votingAgents: ['agent-1'],
        quorum: 0.5
      });

      // THEN: Proposal created
      expect(response.success).toBe(true);
    });

    it('should handle empty metadata object', async () => {
      // GIVEN: Empty metadata
      // WHEN: Creating proposal
      const response = await handler.handle({
        proposalId: 'empty-meta',
        topic: 'test',
        proposal: { data: 'test' },
        votingAgents: ['agent-1'],
        quorum: 0.5,
        metadata: {}
      });

      // THEN: Proposal created with empty metadata
      expect(response.success).toBe(true);
      const proposal = proposals.get('empty-meta');
      expect(proposal.metadata).toEqual({});
    });

    it('should handle very long timeout values', async () => {
      // GIVEN: Very long timeout (1 year in seconds)
      const oneYear = 365 * 24 * 60 * 60;

      // WHEN: Creating proposal with long timeout
      const response = await handler.handle({
        proposalId: 'long-timeout',
        topic: 'test',
        proposal: { data: 'test' },
        votingAgents: ['agent-1'],
        quorum: 0.5,
        timeout: oneYear
      });

      // THEN: Proposal created successfully
      expect(response.success).toBe(true);
      const expiresAt = response.data.expiresAt;
      expect(expiresAt).toBeGreaterThan(Date.now());
    });
  });

  describe('Hook Integration', () => {
    it('should execute notification hook on proposal creation', async () => {
      // GIVEN: Mock hook executor
      const notifySpy = jest.spyOn(mockHookExecutor, 'notify');

      // WHEN: Creating proposal
      await handler.handle({
        proposalId: 'hook-test',
        topic: 'test-decision',
        proposal: { decision: 'proceed' },
        votingAgents: ['agent-1'],
        quorum: 1.0
      });

      // THEN: Notification hook executed
      expect(notifySpy).toHaveBeenCalledWith({
        message: expect.stringContaining('Consensus proposal created'),
        level: 'info'
      });
    });
  });

  describe('Proposal Storage', () => {
    it('should store proposal with all required fields', async () => {
      // GIVEN: Valid proposal parameters
      // WHEN: Creating proposal
      await handler.handle({
        proposalId: 'storage-test',
        topic: 'test-topic',
        proposal: { data: 'test-data' },
        votingAgents: ['agent-1', 'agent-2'],
        quorum: 0.5,
        timeout: 300,
        metadata: { key: 'value' }
      });

      // THEN: Proposal stored with all fields
      const proposal = proposals.get('storage-test');
      expect(proposal).toBeDefined();
      expect(proposal.proposalId).toBe('storage-test');
      expect(proposal.topic).toBe('test-topic');
      expect(proposal.proposal).toEqual({ data: 'test-data' });
      expect(proposal.votingAgents).toEqual(['agent-1', 'agent-2']);
      expect(proposal.quorum).toBe(0.5);
      expect(proposal.timeout).toBe(300);
      expect(proposal.metadata).toEqual({ key: 'value' });
      expect(proposal.createdAt).toBeDefined();
      expect(proposal.expiresAt).toBeDefined();
      expect(proposal.votes).toBeDefined();
      expect(proposal.votes.size).toBe(0);
      expect(proposal.status).toBe('pending');
    });
  });

  describe('Performance', () => {
    it('should create proposal within reasonable time', async () => {
      // GIVEN: Valid proposal parameters
      // WHEN: Creating proposal
      const startTime = Date.now();
      await handler.handle({
        proposalId: 'perf-test',
        topic: 'test',
        proposal: { data: 'test' },
        votingAgents: ['agent-1'],
        quorum: 0.5
      });
      const endTime = Date.now();

      // THEN: Completed within 100ms
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle bulk proposal creation efficiently', async () => {
      // GIVEN: 50 proposals to create
      const startTime = Date.now();

      // WHEN: Creating 50 proposals
      const promises = Array.from({ length: 50 }, (_, i) =>
        handler.handle({
          proposalId: `bulk-prop-${i}`,
          topic: 'bulk-test',
          proposal: { id: i },
          votingAgents: ['agent-1'],
          quorum: 0.5
        })
      );

      await Promise.all(promises);
      const endTime = Date.now();

      // THEN: Completed within 500ms
      expect(endTime - startTime).toBeLessThan(500);
      expect(proposals.size).toBe(50);
    });
  });
});
