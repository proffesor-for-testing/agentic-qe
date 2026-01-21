/**
 * Consensus Vote Handler
 *
 * Handles voting on consensus proposals with quorum checking.
 * Implements the consensus_vote MCP tool for agent coordination.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { BaseHandler, HandlerResponse } from '../base-handler';
import { AgentRegistry } from '../../services/AgentRegistry';
import { HookExecutor } from '../../services/HookExecutor';

export interface ConsensusVoteParams {
  proposalId: string;
  agentId: string;
  vote: 'approve' | 'reject' | 'abstain';
  rationale?: string;
  checkConsensus?: boolean;
}

/**
 * Handles consensus voting operations for QE agent coordination
 */
export class ConsensusVoteHandler extends BaseHandler {
  private proposals: Map<string, any>;

  constructor(
    private registry: AgentRegistry,
    private hookExecutor: HookExecutor,
    proposals: Map<string, any>
  ) {
    super();
    this.proposals = proposals;
  }

  /**
   * Handle consensus vote request
   */
  async handle(args: ConsensusVoteParams): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      // Validate required fields
      this.validateRequired(args, ['proposalId', 'agentId', 'vote']);

      const {
        proposalId,
        agentId,
        vote,
        rationale = '',
        checkConsensus = true
      } = args;

      // Get proposal
      const proposal = this.proposals.get(proposalId);
      if (!proposal) {
        throw new Error(`Proposal not found: ${proposalId}`);
      }

      // Check if proposal is still active
      if (proposal.status !== 'pending') {
        throw new Error(`Proposal is not active: ${proposal.status}`);
      }

      // Check if proposal has expired
      if (Date.now() > proposal.expiresAt) {
        proposal.status = 'expired';
        throw new Error('Proposal has expired');
      }

      // Check if agent is authorized to vote
      if (!proposal.votingAgents.includes(agentId)) {
        throw new Error(`Agent not authorized to vote: ${agentId}`);
      }

      // Check if agent has already voted
      if (proposal.votes.has(agentId)) {
        throw new Error(`Agent has already voted: ${agentId}`);
      }

      // Record vote
      proposal.votes.set(agentId, {
        vote,
        rationale,
        timestamp: Date.now()
      });

      // Check consensus if requested
      let consensusReached = false;
      let consensusResult: 'approved' | 'rejected' | null = null;

      if (checkConsensus) {
        const result = this.checkConsensus(proposal);
        consensusReached = result.reached;
        consensusResult = result.result;

        if (consensusReached) {
          proposal.status = consensusResult!;
        }
      }

      // Execute notification hook
      await this.hookExecutor.notify({
        message: `Vote cast on proposal ${proposalId} by ${agentId}: ${vote}`,
        level: 'info'
      });

      this.log('info', `Vote cast on proposal ${proposalId}`, {
        agentId,
        vote,
        consensusReached,
        consensusResult
      });

      return this.createSuccessResponse({
        voted: true,
        proposalId,
        agentId,
        vote,
        voteCount: proposal.votes.size,
        totalVoters: proposal.votingAgents.length,
        consensusReached,
        consensusResult,
        proposalStatus: proposal.status
      }, requestId);

    } catch (error) {
      this.log('error', 'Failed to cast vote', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  /**
   * Check if consensus has been reached
   */
  private checkConsensus(proposal: any): { reached: boolean; result: 'approved' | 'rejected' | null } {
    const totalVoters = proposal.votingAgents.length;
    const votesNeeded = Math.ceil(totalVoters * proposal.quorum);

    // Count votes
    let approveCount = 0;
    let rejectCount = 0;
    let abstainCount = 0;

    for (const voteData of proposal.votes.values()) {
      if (voteData.vote === 'approve') approveCount++;
      else if (voteData.vote === 'reject') rejectCount++;
      else if (voteData.vote === 'abstain') abstainCount++;
    }

    // Check if consensus reached
    if (approveCount >= votesNeeded) {
      return { reached: true, result: 'approved' };
    }

    // Check if rejection is inevitable (not enough votes left to approve)
    const votesRemaining = totalVoters - proposal.votes.size;
    if (approveCount + votesRemaining < votesNeeded) {
      return { reached: true, result: 'rejected' };
    }

    return { reached: false, result: null };
  }
}
