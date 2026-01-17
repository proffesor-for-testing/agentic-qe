/**
 * Consensus Propose Handler
 *
 * Handles creation of consensus proposals for multi-agent decision making.
 * Implements the consensus_propose MCP tool for agent coordination.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { BaseHandler, HandlerResponse } from '../base-handler';
import { AgentRegistry } from '../../services/AgentRegistry';
import { HookExecutor } from '../../services/HookExecutor';

export interface ConsensusProposalParams {
  proposalId: string;
  topic: string;
  proposal: any;
  votingAgents: string[];
  quorum: number;
  timeout?: number;
  metadata?: Record<string, any>;
}

interface Proposal {
  proposalId: string;
  topic: string;
  proposal: any;
  votingAgents: string[];
  quorum: number;
  timeout: number;
  metadata: Record<string, any>;
  createdAt: number;
  expiresAt: number;
  votes: Map<string, { vote: string; rationale: string; timestamp: number }>;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

/**
 * Handles consensus proposal operations for QE agent coordination
 */
export class ConsensusProposeHandler extends BaseHandler {

  constructor(
    private registry: AgentRegistry,
    private hookExecutor: HookExecutor,
    private proposals: Map<string, Proposal>
  ) {
    super();
  }

  /**
   * Handle consensus propose request
   */
  async handle(args: ConsensusProposalParams): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      // Validate required fields
      this.validateRequired(args, ['proposalId', 'topic', 'proposal', 'votingAgents', 'quorum']);

      const {
        proposalId,
        topic,
        proposal,
        votingAgents,
        quorum,
        timeout = 300,
        metadata = {}
      } = args;

      // Validate quorum
      if (quorum < 0 || quorum > 1) {
        throw new Error('Quorum must be between 0 and 1');
      }

      // Check if proposal already exists
      if (this.proposals.has(proposalId)) {
        throw new Error(`Proposal already exists: ${proposalId}`);
      }

      const now = Date.now();
      const expiresAt = now + (timeout * 1000);

      // Create proposal
      const newProposal: Proposal = {
        proposalId,
        topic,
        proposal,
        votingAgents,
        quorum,
        timeout,
        metadata,
        createdAt: now,
        expiresAt,
        votes: new Map(),
        status: 'pending'
      };

      this.proposals.set(proposalId, newProposal);

      // Set expiration timer
      setTimeout(() => {
        this.expireProposal(proposalId);
      }, timeout * 1000);

      // Execute notification hook
      await this.hookExecutor.notify({
        message: `Consensus proposal created: ${proposalId} - ${topic}`,
        level: 'info'
      });

      this.log('info', `Consensus proposal created: ${proposalId}`, {
        topic,
        votingAgents: votingAgents.length,
        quorum
      });

      return this.createSuccessResponse({
        created: true,
        proposalId,
        topic,
        votingAgents,
        quorum,
        expiresAt,
        status: 'pending'
      }, requestId);

    } catch (error) {
      this.log('error', 'Failed to create consensus proposal', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  /**
   * Expire proposal
   */
  private expireProposal(proposalId: string): void {
    const proposal = this.proposals.get(proposalId);
    if (proposal && proposal.status === 'pending') {
      proposal.status = 'expired';
      this.log('info', `Proposal expired: ${proposalId}`);
    }
  }
}
