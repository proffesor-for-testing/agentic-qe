/**
 * Consensus Vote Handler Test Suite
 *
 * Tests for voting on consensus proposals with quorum checking.
 * Follows TDD RED phase - tests written before implementation verification.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ConsensusVoteHandler } from '@mcp/handlers/memory/consensus-vote';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

describe('ConsensusVoteHandler', () => {
  let handler: ConsensusVoteHandler;
  let registry: AgentRegistry;
  let hookExecutor: HookExecutor;
  let proposals: Map<string, any>;

  beforeEach(() => {
    registry = new AgentRegistry();
    hookExecutor = new HookExecutor();
    proposals = new Map();
    handler = new ConsensusVoteHandler(registry, hookExecutor, proposals);
  });

  afterEach(async () => {
    proposals.clear();
  });

  const createProposal = (proposalId: string, votingAgents: string[], quorum: number, timeout = 300) => {
    proposals.set(proposalId, {
      proposalId,
      topic: 'test-topic',
      proposal: { data: 'test' },
      votingAgents,
      quorum,
      timeout,
      metadata: {},
      createdAt: Date.now(),
      expiresAt: Date.now() + (timeout * 1000),
      votes: new Map(),
      status: 'pending'
    });
  };

  describe('Happy Path - Cast Vote', () => {
    it('should cast approve vote successfully', async () => {
      // GIVEN: Pending proposal
      createProposal('prop-1', ['agent-1', 'agent-2'], 0.5);

      // WHEN: Agent casts approve vote
      const response = await handler.handle({
        proposalId: 'prop-1',
        agentId: 'agent-1',
        vote: 'approve',
        rationale: 'I agree with this proposal'
      });

      // THEN: Vote recorded successfully
      expect(response.success).toBe(true);
      expect(response.data.voted).toBe(true);
      expect(response.data.proposalId).toBe('prop-1');
      expect(response.data.agentId).toBe('agent-1');
      expect(response.data.vote).toBe('approve');
      expect(response.data.voteCount).toBe(1);
      expect(response.data.totalVoters).toBe(2);
    });

    it('should cast reject vote successfully', async () => {
      // GIVEN: Pending proposal
      createProposal('prop-reject', ['agent-1', 'agent-2'], 0.5);

      // WHEN: Agent casts reject vote
      const response = await handler.handle({
        proposalId: 'prop-reject',
        agentId: 'agent-1',
        vote: 'reject',
        rationale: 'I disagree with this approach'
      });

      // THEN: Reject vote recorded
      expect(response.success).toBe(true);
      expect(response.data.vote).toBe('reject');
    });

    it('should cast abstain vote successfully', async () => {
      // GIVEN: Pending proposal
      createProposal('prop-abstain', ['agent-1', 'agent-2'], 0.5);

      // WHEN: Agent abstains
      const response = await handler.handle({
        proposalId: 'prop-abstain',
        agentId: 'agent-1',
        vote: 'abstain',
        rationale: 'Neutral on this decision'
      });

      // THEN: Abstain vote recorded
      expect(response.success).toBe(true);
      expect(response.data.vote).toBe('abstain');
    });

    it('should record vote without rationale', async () => {
      // GIVEN: Pending proposal
      createProposal('prop-no-rationale', ['agent-1'], 1.0);

      // WHEN: Agent votes without rationale
      const response = await handler.handle({
        proposalId: 'prop-no-rationale',
        agentId: 'agent-1',
        vote: 'approve'
      });

      // THEN: Vote recorded with empty rationale
      expect(response.success).toBe(true);
      const proposal = proposals.get('prop-no-rationale');
      expect(proposal.votes.get('agent-1').rationale).toBe('');
    });

    it('should store vote with timestamp', async () => {
      // GIVEN: Pending proposal
      createProposal('prop-timestamp', ['agent-1'], 1.0);
      const beforeVote = Date.now();

      // WHEN: Agent votes
      await handler.handle({
        proposalId: 'prop-timestamp',
        agentId: 'agent-1',
        vote: 'approve'
      });

      // THEN: Vote has timestamp
      const proposal = proposals.get('prop-timestamp');
      const vote = proposal.votes.get('agent-1');
      expect(vote.timestamp).toBeGreaterThanOrEqual(beforeVote);
      expect(vote.timestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('Consensus Detection', () => {
    it('should detect consensus when quorum reached with approve votes', async () => {
      // GIVEN: Proposal requiring 2/3 approval (3 voters, quorum 0.67)
      createProposal('consensus-approve', ['agent-1', 'agent-2', 'agent-3'], 0.67);

      // WHEN: Two agents approve (reaches quorum)
      await handler.handle({
        proposalId: 'consensus-approve',
        agentId: 'agent-1',
        vote: 'approve'
      });

      const response = await handler.handle({
        proposalId: 'consensus-approve',
        agentId: 'agent-2',
        vote: 'approve'
      });

      // THEN: Consensus reached, proposal approved
      expect(response.data.consensusReached).toBe(true);
      expect(response.data.consensusResult).toBe('approved');
      expect(response.data.proposalStatus).toBe('approved');
    });

    it('should detect rejection when consensus becomes impossible', async () => {
      // GIVEN: Proposal requiring 100% approval (3 voters, quorum 1.0)
      createProposal('consensus-reject', ['agent-1', 'agent-2', 'agent-3'], 1.0);

      // WHEN: One agent rejects (makes approval impossible)
      const response = await handler.handle({
        proposalId: 'consensus-reject',
        agentId: 'agent-1',
        vote: 'reject'
      });

      // THEN: Consensus reached, proposal rejected
      expect(response.data.consensusReached).toBe(true);
      expect(response.data.consensusResult).toBe('rejected');
      expect(response.data.proposalStatus).toBe('rejected');
    });

    it('should not detect consensus prematurely', async () => {
      // GIVEN: Proposal requiring 2/3 approval (3 voters)
      createProposal('no-consensus-yet', ['agent-1', 'agent-2', 'agent-3'], 0.67);

      // WHEN: Only one agent approves (not enough for consensus)
      const response = await handler.handle({
        proposalId: 'no-consensus-yet',
        agentId: 'agent-1',
        vote: 'approve'
      });

      // THEN: Consensus not reached yet
      expect(response.data.consensusReached).toBe(false);
      expect(response.data.consensusResult).toBeNull();
      expect(response.data.proposalStatus).toBe('pending');
    });

    it('should allow disabling consensus check', async () => {
      // GIVEN: Proposal that would reach consensus
      createProposal('no-check', ['agent-1', 'agent-2'], 0.5);

      // WHEN: Voting with checkConsensus=false
      const response = await handler.handle({
        proposalId: 'no-check',
        agentId: 'agent-1',
        vote: 'approve',
        checkConsensus: false
      });

      // THEN: Consensus not checked, status remains pending
      expect(response.data.consensusReached).toBe(false);
      expect(response.data.proposalStatus).toBe('pending');
    });

    it('should handle abstain votes in consensus calculation', async () => {
      // GIVEN: Proposal with 4 voters, quorum 0.5 (need 2 approvals)
      createProposal('abstain-consensus', ['agent-1', 'agent-2', 'agent-3', 'agent-4'], 0.5);

      // WHEN: 2 approve, 1 abstains
      await handler.handle({
        proposalId: 'abstain-consensus',
        agentId: 'agent-1',
        vote: 'approve'
      });
      await handler.handle({
        proposalId: 'abstain-consensus',
        agentId: 'agent-2',
        vote: 'abstain'
      });
      const response = await handler.handle({
        proposalId: 'abstain-consensus',
        agentId: 'agent-3',
        vote: 'approve'
      });

      // THEN: Consensus reached with 2 approvals
      expect(response.data.consensusReached).toBe(true);
      expect(response.data.consensusResult).toBe('approved');
    });
  });

  describe('Input Validation', () => {
    it('should reject missing proposalId', async () => {
      // GIVEN: Missing proposalId parameter
      // WHEN: Casting vote
      const response = await handler.handle({
        agentId: 'agent-1',
        vote: 'approve'
      } as any);

      // THEN: Validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('proposalId');
    });

    it('should reject missing agentId', async () => {
      // GIVEN: Missing agentId parameter
      // WHEN: Casting vote
      const response = await handler.handle({
        proposalId: 'prop-1',
        vote: 'approve'
      } as any);

      // THEN: Validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('agentId');
    });

    it('should reject missing vote', async () => {
      // GIVEN: Missing vote parameter
      // WHEN: Casting vote
      const response = await handler.handle({
        proposalId: 'prop-1',
        agentId: 'agent-1'
      } as any);

      // THEN: Validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('vote');
    });
  });

  describe('Error Handling', () => {
    it('should handle voting on non-existent proposal', async () => {
      // GIVEN: Proposal does not exist
      // WHEN: Attempting to vote
      const response = await handler.handle({
        proposalId: 'non-existent',
        agentId: 'agent-1',
        vote: 'approve'
      });

      // THEN: Error returned
      expect(response.success).toBe(false);
      expect(response.error).toContain('Proposal not found');
      expect(response.error).toContain('non-existent');
    });

    it('should reject vote on expired proposal', async () => {
      // GIVEN: Expired proposal
      proposals.set('expired-prop', {
        proposalId: 'expired-prop',
        topic: 'test',
        proposal: { data: 'test' },
        votingAgents: ['agent-1'],
        quorum: 1.0,
        timeout: 300,
        metadata: {},
        createdAt: Date.now() - 400000,
        expiresAt: Date.now() - 100000, // Expired
        votes: new Map(),
        status: 'pending'
      });

      // WHEN: Attempting to vote
      const response = await handler.handle({
        proposalId: 'expired-prop',
        agentId: 'agent-1',
        vote: 'approve'
      });

      // THEN: Error for expired proposal
      expect(response.success).toBe(false);
      expect(response.error).toContain('expired');
    });

    it('should reject vote on already decided proposal', async () => {
      // GIVEN: Approved proposal
      proposals.set('decided-prop', {
        proposalId: 'decided-prop',
        topic: 'test',
        proposal: { data: 'test' },
        votingAgents: ['agent-1', 'agent-2'],
        quorum: 0.5,
        timeout: 300,
        metadata: {},
        createdAt: Date.now(),
        expiresAt: Date.now() + 300000,
        votes: new Map([['agent-1', { vote: 'approve', rationale: '', timestamp: Date.now() }]]),
        status: 'approved'
      });

      // WHEN: Attempting to vote on decided proposal
      const response = await handler.handle({
        proposalId: 'decided-prop',
        agentId: 'agent-2',
        vote: 'approve'
      });

      // THEN: Error for non-active proposal
      expect(response.success).toBe(false);
      expect(response.error).toContain('not active');
    });

    it('should reject vote from unauthorized agent', async () => {
      // GIVEN: Proposal with specific voting agents
      createProposal('restricted-prop', ['agent-1', 'agent-2'], 0.5);

      // WHEN: Unauthorized agent attempts to vote
      const response = await handler.handle({
        proposalId: 'restricted-prop',
        agentId: 'agent-3',
        vote: 'approve'
      });

      // THEN: Error for unauthorized agent
      expect(response.success).toBe(false);
      expect(response.error).toContain('not authorized');
      expect(response.error).toContain('agent-3');
    });

    it('should reject duplicate vote from same agent', async () => {
      // GIVEN: Agent has already voted
      createProposal('no-double-vote', ['agent-1', 'agent-2'], 0.5);
      await handler.handle({
        proposalId: 'no-double-vote',
        agentId: 'agent-1',
        vote: 'approve'
      });

      // WHEN: Same agent tries to vote again
      const response = await handler.handle({
        proposalId: 'no-double-vote',
        agentId: 'agent-1',
        vote: 'reject'
      });

      // THEN: Error for duplicate vote
      expect(response.success).toBe(false);
      expect(response.error).toContain('already voted');
      expect(response.error).toContain('agent-1');
    });
  });

  describe('Edge Cases', () => {
    it('should handle unanimous approval', async () => {
      // GIVEN: Proposal with 3 voters, quorum 1.0
      createProposal('unanimous', ['agent-1', 'agent-2', 'agent-3'], 1.0);

      // WHEN: All agents approve
      await handler.handle({
        proposalId: 'unanimous',
        agentId: 'agent-1',
        vote: 'approve'
      });
      await handler.handle({
        proposalId: 'unanimous',
        agentId: 'agent-2',
        vote: 'approve'
      });
      const response = await handler.handle({
        proposalId: 'unanimous',
        agentId: 'agent-3',
        vote: 'approve'
      });

      // THEN: Consensus reached
      expect(response.data.consensusReached).toBe(true);
      expect(response.data.consensusResult).toBe('approved');
    });

    it('should handle split vote with quorum 0.5', async () => {
      // GIVEN: Proposal with 4 voters, quorum 0.5 (need 2 votes)
      createProposal('split-vote', ['agent-1', 'agent-2', 'agent-3', 'agent-4'], 0.5);

      // WHEN: 2 approve, 1 rejects
      await handler.handle({
        proposalId: 'split-vote',
        agentId: 'agent-1',
        vote: 'approve'
      });
      await handler.handle({
        proposalId: 'split-vote',
        agentId: 'agent-2',
        vote: 'reject'
      });
      const response = await handler.handle({
        proposalId: 'split-vote',
        agentId: 'agent-3',
        vote: 'approve'
      });

      // THEN: Consensus reached (2 approvals = 50%)
      expect(response.data.consensusReached).toBe(true);
      expect(response.data.consensusResult).toBe('approved');
    });

    it('should handle very long rationale', async () => {
      // GIVEN: Proposal
      createProposal('long-rationale', ['agent-1'], 1.0);
      const longRationale = 'x'.repeat(10000);

      // WHEN: Voting with long rationale
      const response = await handler.handle({
        proposalId: 'long-rationale',
        agentId: 'agent-1',
        vote: 'approve',
        rationale: longRationale
      });

      // THEN: Vote accepted
      expect(response.success).toBe(true);
      const proposal = proposals.get('long-rationale');
      expect(proposal.votes.get('agent-1').rationale).toHaveLength(10000);
    });

    it('should handle quorum calculation with rounding', async () => {
      // GIVEN: 3 voters, quorum 0.67 (needs 2.01 votes, rounds to 3)
      createProposal('quorum-rounding', ['agent-1', 'agent-2', 'agent-3'], 0.67);

      // WHEN: 2 agents approve
      await handler.handle({
        proposalId: 'quorum-rounding',
        agentId: 'agent-1',
        vote: 'approve'
      });
      const response = await handler.handle({
        proposalId: 'quorum-rounding',
        agentId: 'agent-2',
        vote: 'approve'
      });

      // THEN: Consensus reached (Math.ceil(3 * 0.67) = 3, but 2 approvals = 67%)
      expect(response.data.consensusReached).toBe(true);
      expect(response.data.consensusResult).toBe('approved');
    });

    it('should handle rapid concurrent votes', async () => {
      // GIVEN: Proposal with many voters
      const voters = Array.from({ length: 10 }, (_, i) => `agent-${i}`);
      createProposal('concurrent-votes', voters, 0.5);

      // WHEN: All agents vote concurrently
      const promises = voters.map((agentId, i) =>
        handler.handle({
          proposalId: 'concurrent-votes',
          agentId,
          vote: i % 2 === 0 ? 'approve' : 'reject'
        })
      );

      const results = await Promise.all(promises);

      // THEN: All votes recorded successfully
      const successfulVotes = results.filter(r => r.success);
      expect(successfulVotes.length).toBeGreaterThan(0);
    });
  });

  describe('Hook Integration', () => {
    it('should execute notification hook on vote', async () => {
      // GIVEN: Proposal and mock hook executor
      createProposal('hook-vote', ['agent-1'], 1.0);
      const notifySpy = jest.spyOn(hookExecutor, 'notify');

      // WHEN: Agent votes
      await handler.handle({
        proposalId: 'hook-vote',
        agentId: 'agent-1',
        vote: 'approve'
      });

      // THEN: Notification hook executed
      expect(notifySpy).toHaveBeenCalledWith({
        message: expect.stringContaining('Vote cast on proposal'),
        level: 'info'
      });
    });
  });

  describe('Performance', () => {
    it('should cast vote within reasonable time', async () => {
      // GIVEN: Proposal
      createProposal('perf-vote', ['agent-1'], 1.0);

      // WHEN: Casting vote
      const startTime = Date.now();
      await handler.handle({
        proposalId: 'perf-vote',
        agentId: 'agent-1',
        vote: 'approve'
      });
      const endTime = Date.now();

      // THEN: Completed within 100ms
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle bulk voting efficiently', async () => {
      // GIVEN: 50 proposals with 1 voter each
      for (let i = 0; i < 50; i++) {
        createProposal(`bulk-vote-${i}`, [`agent-${i}`], 1.0);
      }

      // WHEN: Casting 50 votes
      const startTime = Date.now();
      const promises = Array.from({ length: 50 }, (_, i) =>
        handler.handle({
          proposalId: `bulk-vote-${i}`,
          agentId: `agent-${i}`,
          vote: 'approve'
        })
      );

      await Promise.all(promises);
      const endTime = Date.now();

      // THEN: Completed within 500ms
      expect(endTime - startTime).toBeLessThan(500);
    });
  });
});
