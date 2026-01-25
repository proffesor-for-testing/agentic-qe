import { EventEmitter } from 'events';
import { SwarmMemoryManager, SerializableValue } from '../memory/SwarmMemoryManager';

export interface ConsensusProposal {
  id: string;
  decision: string;
  quorum: number;
  proposer?: string;
}

export interface ConsensusState {
  decision: string;
  proposer: string;
  votes: string[];
  quorum: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

/**
 * Type guard to validate that a value is a ConsensusState
 */
function isConsensusState(value: unknown): value is ConsensusState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.decision === 'string' &&
    typeof obj.proposer === 'string' &&
    Array.isArray(obj.votes) &&
    obj.votes.every((v: unknown) => typeof v === 'string') &&
    typeof obj.quorum === 'number' &&
    (obj.status === 'pending' || obj.status === 'approved' || obj.status === 'rejected') &&
    typeof obj.createdAt === 'number'
  );
}

/**
 * Convert ConsensusState to a serializable record for memory storage
 */
function toSerializable(state: ConsensusState): Record<string, unknown> {
  return {
    decision: state.decision,
    proposer: state.proposer,
    votes: state.votes,
    quorum: state.quorum,
    status: state.status,
    createdAt: state.createdAt
  };
}

/**
 * Parse a SerializableValue into a ConsensusState, returning null if invalid
 */
function parseConsensusState(value: SerializableValue | null): ConsensusState | null {
  if (value === null || !isConsensusState(value)) {
    return null;
  }
  return value;
}

/**
 * ConsensusGating - Implements consensus-based decision making for agent swarms
 *
 * Features:
 * - Quorum-based voting
 * - Proposal and voting lifecycle
 * - Event-driven consensus notifications
 * - Persistent state management
 */
export class ConsensusGating extends EventEmitter {
  constructor(private memory: SwarmMemoryManager) {
    super();
  }

  /**
   * Propose a decision for consensus
   * Returns proposal ID for voting
   */
  async propose(proposal: ConsensusProposal): Promise<string> {
    const agentId = proposal.proposer || 'system';

    const state: ConsensusState = {
      decision: proposal.decision,
      proposer: agentId,
      votes: [agentId], // Proposer automatically votes for their proposal
      quorum: proposal.quorum,
      status: 'pending',
      createdAt: Date.now()
    };

    await this.memory.store(`consensus:${proposal.id}`, toSerializable(state), {
      partition: 'consensus_state',
      ttl: 604800 // 7 days
    });

    this.emit('consensus:proposed', { ...proposal, proposer: agentId });

    return proposal.id;
  }

  /**
   * Vote on a proposal
   * Returns true if consensus is reached
   */
  async vote(proposalId: string, agentId: string): Promise<boolean> {
    const rawState = await this.memory.retrieve(`consensus:${proposalId}`, {
      partition: 'consensus_state'
    });

    const state = parseConsensusState(rawState);

    if (!state) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    if (state.status !== 'pending') {
      throw new Error(`Proposal ${proposalId} is already ${state.status}`);
    }

    // Prevent duplicate votes - if already voted, consensus not yet reached (still pending)
    if (state.votes.includes(agentId)) {
      return false;
    }

    state.votes.push(agentId);

    // Check if quorum is reached (+1 for proposer)
    if (state.votes.length >= state.quorum + 1) {
      state.status = 'approved';
      await this.memory.store(`consensus:${proposalId}`, toSerializable(state), {
        partition: 'consensus_state'
      });
      this.emit('consensus:reached', state);
      return true;
    }

    await this.memory.store(`consensus:${proposalId}`, toSerializable(state), {
      partition: 'consensus_state'
    });

    this.emit('consensus:vote-cast', { proposalId, agentId, votesCount: state.votes.length });

    return false;
  }

  /**
   * Get current state of a proposal
   */
  async getProposalState(proposalId: string): Promise<ConsensusState | null> {
    const rawState = await this.memory.retrieve(`consensus:${proposalId}`, {
      partition: 'consensus_state'
    });
    return parseConsensusState(rawState);
  }

  /**
   * Reject a proposal (requires proposer or admin privileges)
   */
  async reject(proposalId: string, agentId: string): Promise<void> {
    const rawState = await this.memory.retrieve(`consensus:${proposalId}`, {
      partition: 'consensus_state'
    });

    const state = parseConsensusState(rawState);

    if (!state) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    // Only proposer can reject their own proposal
    if (state.proposer !== agentId && agentId !== 'admin') {
      throw new Error(`Only proposer or admin can reject proposal`);
    }

    state.status = 'rejected';
    await this.memory.store(`consensus:${proposalId}`, toSerializable(state), {
      partition: 'consensus_state'
    });

    this.emit('consensus:rejected', { proposalId, rejectedBy: agentId });
  }

  /**
   * Wait for consensus on a proposal
   *
   * REFACTORED: Event-driven pattern using Promise.race eliminates race condition
   * Old pattern: setTimeout could fire while consensus was being reached
   * New pattern: Events win the race, timeout only triggers if no event arrives
   */
  async waitForConsensus(proposalId: string, timeout: number = 60000): Promise<boolean> {
    const state = await this.getProposalState(proposalId);

    if (!state) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    // Already resolved - return immediately (no race condition)
    if (state.status === 'approved') {
      return true;
    }

    if (state.status === 'rejected') {
      return false;
    }

    // Event-driven wait with timeout protection using Promise.race
    // Eliminates race: whichever resolves first wins
    return Promise.race([
      // Event-driven path: wait for actual consensus event
      new Promise<boolean>((resolve) => {
        const listener = (eventState: ConsensusState) => {
          if (eventState.decision === state.decision) {
            this.removeListener('consensus:reached', listener);
            this.removeListener('consensus:rejected', listener);
            resolve(eventState.status === 'approved');
          }
        };

        this.on('consensus:reached', listener);
        this.on('consensus:rejected', listener);
      }),
      // Timeout protection (only for failure case, doesn't interfere with event)
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), timeout);
      })
    ]);
  }
}
