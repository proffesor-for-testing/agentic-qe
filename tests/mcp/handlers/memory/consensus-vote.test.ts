/**
 * memory/consensus-vote Test Suite
 *
 * Tests for consensus voting with quorum.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ConsensusVoteHandler } from '@mcp/handlers/memory/consensus-vote';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

describe('ConsensusVoteHandler', () => {
  let handler: ConsensusVoteHandler;
  let mockRegistry: AgentRegistry;
  let mockHookExecutor: HookExecutor;
  let mockProposals: Map<string, any>;

  beforeEach(() => {
    mockRegistry = {} as AgentRegistry;
    mockHookExecutor = {
      notify: jest.fn().mockResolvedValue(undefined)
    } as any;
    mockProposals = new Map();
    handler = new ConsensusVoteHandler(mockRegistry, mockHookExecutor, mockProposals);
  });

  const createProposal = (proposalId: string, votingAgents: string[], quorum: number = 0.66) => {
    mockProposals.set(proposalId, {
      proposalId,
      topic: 'test-topic',
      proposal: { test: 'data' },
      votingAgents,
      quorum,
      timeout: 300,
      metadata: {},
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
      votes: new Map(),
      status: 'pending'
    });
  };

  describe('Happy Path', () => {
    it('should cast vote successfully', async () => {
      createProposal('prop-001', ['agent-1', 'agent-2', 'agent-3'], 0.66);

      const response = await handler.handle({
        proposalId: 'prop-001',
        agentId: 'agent-1',
        vote: 'approve',
        rationale: 'Looks good to me'
      });

      expect(response.success).toBe(true);
      expect(response.data.voted).toBe(true);
      expect(response.data.proposalId).toBe('prop-001');
      expect(response.data.agentId).toBe('agent-1');
      expect(response.data.vote).toBe('approve');
    });

    it('should return expected data structure', async () => {
      createProposal('prop-002', ['agent-1'], 1.0);

      const response = await handler.handle({
        proposalId: 'prop-002',
        agentId: 'agent-1',
        vote: 'approve'
      });

      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('metadata');
      expect(response.metadata).toHaveProperty('requestId');
      expect(response.data).toHaveProperty('voted');
      expect(response.data).toHaveProperty('proposalId');
      expect(response.data).toHaveProperty('agentId');
      expect(response.data).toHaveProperty('vote');
      expect(response.data).toHaveProperty('voteCount');
      expect(response.data).toHaveProperty('totalVoters');
      expect(response.data).toHaveProperty('consensusReached');
      expect(response.data).toHaveProperty('consensusResult');
      expect(response.data).toHaveProperty('proposalStatus');
    });

    it('should store vote in proposal', async () => {
      createProposal('prop-003', ['agent-1', 'agent-2'], 0.5);

      await handler.handle({
        proposalId: 'prop-003',
        agentId: 'agent-1',
        vote: 'approve',
        rationale: 'Good proposal'
      });

      const proposal = mockProposals.get('prop-003');
      expect(proposal.votes.has('agent-1')).toBe(true);

      const voteData = proposal.votes.get('agent-1');
      expect(voteData.vote).toBe('approve');
      expect(voteData.rationale).toBe('Good proposal');
      expect(voteData.timestamp).toBeDefined();
    });

    it('should handle vote without rationale', async () => {
      createProposal('prop-004', ['agent-1'], 1.0);

      const response = await handler.handle({
        proposalId: 'prop-004',
        agentId: 'agent-1',
        vote: 'approve'
      });

      expect(response.success).toBe(true);

      const proposal = mockProposals.get('prop-004');
      const voteData = proposal.votes.get('agent-1');
      expect(voteData.rationale).toBe('');
    });

    it('should execute notification hook on vote', async () => {
      createProposal('prop-005', ['agent-1'], 1.0);

      await handler.handle({
        proposalId: 'prop-005',
        agentId: 'agent-1',
        vote: 'approve'
      });

      expect(mockHookExecutor.notify).toHaveBeenCalledWith({
        message: expect.stringContaining('prop-005'),
        level: 'info'
      });
    });
  });

  describe('Vote Types', () => {
    it('should accept approve vote', async () => {
      createProposal('vote-approve', ['agent-1'], 1.0);

      const response = await handler.handle({
        proposalId: 'vote-approve',
        agentId: 'agent-1',
        vote: 'approve'
      });

      expect(response.success).toBe(true);
      expect(response.data.vote).toBe('approve');
    });

    it('should accept reject vote', async () => {
      createProposal('vote-reject', ['agent-1'], 1.0);

      const response = await handler.handle({
        proposalId: 'vote-reject',
        agentId: 'agent-1',
        vote: 'reject'
      });

      expect(response.success).toBe(true);
      expect(response.data.vote).toBe('reject');
    });

    it('should accept abstain vote', async () => {
      createProposal('vote-abstain', ['agent-1'], 1.0);

      const response = await handler.handle({
        proposalId: 'vote-abstain',
        agentId: 'agent-1',
        vote: 'abstain'
      });

      expect(response.success).toBe(true);
      expect(response.data.vote).toBe('abstain');
    });
  });

  describe('Quorum Detection', () => {
    it('should detect consensus when quorum is reached (approval)', async () => {
      createProposal('quorum-reached', ['agent-1', 'agent-2', 'agent-3'], 0.66);

      await handler.handle({
        proposalId: 'quorum-reached',
        agentId: 'agent-1',
        vote: 'approve'
      });

      const response = await handler.handle({
        proposalId: 'quorum-reached',
        agentId: 'agent-2',
        vote: 'approve'
      });

      expect(response.success).toBe(true);
      expect(response.data.consensusReached).toBe(true);
      expect(response.data.consensusResult).toBe('approved');
      expect(response.data.proposalStatus).toBe('approved');
    });

    it('should detect consensus with 100% quorum', async () => {
      createProposal('quorum-100', ['agent-1', 'agent-2'], 1.0);

      await handler.handle({
        proposalId: 'quorum-100',
        agentId: 'agent-1',
        vote: 'approve'
      });

      const response = await handler.handle({
        proposalId: 'quorum-100',
        agentId: 'agent-2',
        vote: 'approve'
      });

      expect(response.success).toBe(true);
      expect(response.data.consensusReached).toBe(true);
      expect(response.data.consensusResult).toBe('approved');
    });

    it('should detect consensus with 50% quorum', async () => {
      createProposal('quorum-50', ['agent-1', 'agent-2'], 0.5);

      const response = await handler.handle({
        proposalId: 'quorum-50',
        agentId: 'agent-1',
        vote: 'approve'
      });

      expect(response.success).toBe(true);
      expect(response.data.consensusReached).toBe(true);
      expect(response.data.consensusResult).toBe('approved');
    });

    it('should detect rejection when approval is impossible', async () => {
      createProposal('quorum-reject', ['agent-1', 'agent-2', 'agent-3'], 0.66);

      await handler.handle({
        proposalId: 'quorum-reject',
        agentId: 'agent-1',
        vote: 'reject'
      });

      const response = await handler.handle({
        proposalId: 'quorum-reject',
        agentId: 'agent-2',
        vote: 'reject'
      });

      expect(response.success).toBe(true);
      expect(response.data.consensusReached).toBe(true);
      expect(response.data.consensusResult).toBe('rejected');
    });

    it('should not reach consensus with partial votes', async () => {
      createProposal('quorum-partial', ['agent-1', 'agent-2', 'agent-3'], 0.66);

      const response = await handler.handle({
        proposalId: 'quorum-partial',
        agentId: 'agent-1',
        vote: 'approve'
      });

      expect(response.success).toBe(true);
      expect(response.data.consensusReached).toBe(false);
      expect(response.data.consensusResult).toBe(null);
      expect(response.data.proposalStatus).toBe('pending');
    });

    it('should handle abstain votes in quorum calculation', async () => {
      createProposal('quorum-abstain', ['agent-1', 'agent-2', 'agent-3'], 0.66);

      await handler.handle({
        proposalId: 'quorum-abstain',
        agentId: 'agent-1',
        vote: 'abstain'
      });

      await handler.handle({
        proposalId: 'quorum-abstain',
        agentId: 'agent-2',
        vote: 'approve'
      });

      const response = await handler.handle({
        proposalId: 'quorum-abstain',
        agentId: 'agent-3',
        vote: 'approve'
      });

      expect(response.success).toBe(true);
      expect(response.data.consensusReached).toBe(true);
      expect(response.data.consensusResult).toBe('approved');
    });
  });

  describe('Vote Counting', () => {
    it('should track vote count correctly', async () => {
      createProposal('vote-count', ['agent-1', 'agent-2', 'agent-3'], 0.66);

      const response1 = await handler.handle({
        proposalId: 'vote-count',
        agentId: 'agent-1',
        vote: 'approve'
      });

      expect(response1.data.voteCount).toBe(1);
      expect(response1.data.totalVoters).toBe(3);

      const response2 = await handler.handle({
        proposalId: 'vote-count',
        agentId: 'agent-2',
        vote: 'approve'
      });

      expect(response2.data.voteCount).toBe(2);
      expect(response2.data.totalVoters).toBe(3);
    });

    it('should handle mixed votes', async () => {
      createProposal('mixed-votes', ['a1', 'a2', 'a3', 'a4', 'a5'], 0.6);

      await handler.handle({ proposalId: 'mixed-votes', agentId: 'a1', vote: 'approve' });
      await handler.handle({ proposalId: 'mixed-votes', agentId: 'a2', vote: 'approve' });
      await handler.handle({ proposalId: 'mixed-votes', agentId: 'a3', vote: 'reject' });

      const response = await handler.handle({
        proposalId: 'mixed-votes',
        agentId: 'a4',
        vote: 'approve'
      });

      expect(response.success).toBe(true);
      expect(response.data.voteCount).toBe(4);
      expect(response.data.consensusReached).toBe(true);
      expect(response.data.consensusResult).toBe('approved');
    });
  });

  describe('Input Validation', () => {
    it('should reject missing proposalId', async () => {
      const response = await handler.handle({
        agentId: 'agent-1',
        vote: 'approve'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toContain('proposalId');
    });

    it('should reject missing agentId', async () => {
      const response = await handler.handle({
        proposalId: 'prop-001',
        vote: 'approve'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toContain('agentId');
    });

    it('should reject missing vote', async () => {
      const response = await handler.handle({
        proposalId: 'prop-001',
        agentId: 'agent-1'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toContain('vote');
    });

    it('should reject non-existent proposal', async () => {
      const response = await handler.handle({
        proposalId: 'non-existent',
        agentId: 'agent-1',
        vote: 'approve'
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Proposal not found');
    });

    it('should reject vote on non-pending proposal', async () => {
      const proposal = {
        proposalId: 'closed-prop',
        topic: 'test',
        proposal: {},
        votingAgents: ['agent-1'],
        quorum: 1.0,
        timeout: 300,
        metadata: {},
        createdAt: Date.now(),
        expiresAt: Date.now() + 300000,
        votes: new Map(),
        status: 'approved'
      };
      mockProposals.set('closed-prop', proposal);

      const response = await handler.handle({
        proposalId: 'closed-prop',
        agentId: 'agent-1',
        vote: 'approve'
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('not active');
    });

    it('should reject vote on expired proposal', async () => {
      const proposal = {
        proposalId: 'expired-prop',
        topic: 'test',
        proposal: {},
        votingAgents: ['agent-1'],
        quorum: 1.0,
        timeout: 300,
        metadata: {},
        createdAt: Date.now() - 400000,
        expiresAt: Date.now() - 100000,
        votes: new Map(),
        status: 'pending'
      };
      mockProposals.set('expired-prop', proposal);

      const response = await handler.handle({
        proposalId: 'expired-prop',
        agentId: 'agent-1',
        vote: 'approve'
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('expired');
    });

    it('should reject unauthorized agent', async () => {
      createProposal('auth-test', ['agent-1', 'agent-2'], 1.0);

      const response = await handler.handle({
        proposalId: 'auth-test',
        agentId: 'unauthorized-agent',
        vote: 'approve'
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('not authorized to vote');
    });

    it('should reject duplicate vote from same agent', async () => {
      createProposal('duplicate-vote', ['agent-1', 'agent-2'], 1.0);

      await handler.handle({
        proposalId: 'duplicate-vote',
        agentId: 'agent-1',
        vote: 'approve'
      });

      const response = await handler.handle({
        proposalId: 'duplicate-vote',
        agentId: 'agent-1',
        vote: 'approve'
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('already voted');
    });
  });

  describe('CheckConsensus Parameter', () => {
    it('should skip consensus check when checkConsensus is false', async () => {
      createProposal('no-check', ['agent-1'], 1.0);

      const response = await handler.handle({
        proposalId: 'no-check',
        agentId: 'agent-1',
        vote: 'approve',
        checkConsensus: false
      });

      expect(response.success).toBe(true);
      expect(response.data.consensusReached).toBe(false);
      expect(response.data.consensusResult).toBe(null);

      const proposal = mockProposals.get('no-check');
      expect(proposal.status).toBe('pending');
    });

    it('should check consensus by default', async () => {
      createProposal('default-check', ['agent-1'], 1.0);

      const response = await handler.handle({
        proposalId: 'default-check',
        agentId: 'agent-1',
        vote: 'approve'
      });

      expect(response.success).toBe(true);
      expect(response.data.consensusReached).toBe(true);
      expect(response.data.consensusResult).toBe('approved');
    });
  });

  describe('Edge Cases', () => {
    it('should handle single voter proposal', async () => {
      createProposal('single-voter', ['solo-agent'], 1.0);

      const response = await handler.handle({
        proposalId: 'single-voter',
        agentId: 'solo-agent',
        vote: 'approve'
      });

      expect(response.success).toBe(true);
      expect(response.data.consensusReached).toBe(true);
      expect(response.data.totalVoters).toBe(1);
    });

    it('should handle large number of voters', async () => {
      const agents = Array.from({ length: 100 }, (_, i) => `agent-${i}`);
      createProposal('many-voters', agents, 0.5);

      for (let i = 0; i < 50; i++) {
        await handler.handle({
          proposalId: 'many-voters',
          agentId: `agent-${i}`,
          vote: 'approve'
        });
      }

      const response = await handler.handle({
        proposalId: 'many-voters',
        agentId: 'agent-50',
        vote: 'approve'
      });

      expect(response.success).toBe(true);
      expect(response.data.consensusReached).toBe(true);
    });

    it('should handle very long rationale', async () => {
      createProposal('long-rationale', ['agent-1'], 1.0);

      const longRationale = 'A'.repeat(10000);

      const response = await handler.handle({
        proposalId: 'long-rationale',
        agentId: 'agent-1',
        vote: 'approve',
        rationale: longRationale
      });

      expect(response.success).toBe(true);

      const proposal = mockProposals.get('long-rationale');
      const voteData = proposal.votes.get('agent-1');
      expect(voteData.rationale.length).toBe(10000);
    });

    it('should handle concurrent votes on same proposal', async () => {
      const agents = Array.from({ length: 10 }, (_, i) => `agent-${i}`);
      createProposal('concurrent-votes', agents, 0.5);

      const promises = agents.map(agentId =>
        handler.handle({
          proposalId: 'concurrent-votes',
          agentId,
          vote: 'approve'
        })
      );

      const results = await Promise.all(promises);

      const successfulVotes = results.filter(r => r.success);
      expect(successfulVotes.length).toBe(10);

      const proposal = mockProposals.get('concurrent-votes');
      expect(proposal.votes.size).toBe(10);
    });

    it('should handle zero quorum requirement', async () => {
      createProposal('zero-quorum', ['agent-1', 'agent-2'], 0.0);

      const response = await handler.handle({
        proposalId: 'zero-quorum',
        agentId: 'agent-1',
        vote: 'approve'
      });

      expect(response.success).toBe(true);
      expect(response.data.consensusReached).toBe(true);
      expect(response.data.consensusResult).toBe('approved');
    });

    it('should handle special characters in agentId', async () => {
      createProposal('special-chars', ['agent-1@domain.com'], 1.0);

      const response = await handler.handle({
        proposalId: 'special-chars',
        agentId: 'agent-1@domain.com',
        vote: 'approve'
      });

      expect(response.success).toBe(true);
    });

    it('should preserve vote timestamp ordering', async () => {
      createProposal('timestamp-order', ['a1', 'a2', 'a3'], 0.66);

      await handler.handle({ proposalId: 'timestamp-order', agentId: 'a1', vote: 'approve' });
      await new Promise(resolve => setTimeout(resolve, 10));

      await handler.handle({ proposalId: 'timestamp-order', agentId: 'a2', vote: 'approve' });
      await new Promise(resolve => setTimeout(resolve, 10));

      await handler.handle({ proposalId: 'timestamp-order', agentId: 'a3', vote: 'approve' });

      const proposal = mockProposals.get('timestamp-order');
      const timestamps = Array.from(proposal.votes.values()).map((v: any) => v.timestamp);

      expect(timestamps[0]).toBeLessThan(timestamps[1]);
      expect(timestamps[1]).toBeLessThan(timestamps[2]);
    });
  });

  describe('Performance', () => {
    it('should complete vote within reasonable time', async () => {
      createProposal('perf-test', ['agent-1'], 1.0);

      const startTime = Date.now();
      await handler.handle({
        proposalId: 'perf-test',
        agentId: 'agent-1',
        vote: 'approve'
      });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle rapid sequential votes efficiently', async () => {
      const agents = Array.from({ length: 100 }, (_, i) => `agent-${i}`);
      createProposal('rapid-votes', agents, 0.5);

      const startTime = Date.now();
      for (const agentId of agents) {
        await handler.handle({
          proposalId: 'rapid-votes',
          agentId,
          vote: 'approve'
        });
      }
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000);
    });
  });

  describe('Response Structure', () => {
    it('should always include requestId', async () => {
      createProposal('reqid-test', ['agent-1'], 1.0);

      const response = await handler.handle({
        proposalId: 'reqid-test',
        agentId: 'agent-1',
        vote: 'approve'
      });

      expect(response).toHaveProperty('metadata');
      expect(response.metadata).toHaveProperty('requestId');
      expect(typeof response.metadata.requestId).toBe('string');
    });

    it('should provide meaningful error messages', async () => {
      const response = await handler.handle({} as any);

      if (!response.success) {
        expect(response.error).toBeTruthy();
        expect(typeof response.error).toBe('string');
        expect(response.error.length).toBeGreaterThan(0);
      }
    });
  });
});
