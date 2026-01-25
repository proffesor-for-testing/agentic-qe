/**
 * Voting Protocol Types and Interfaces
 *
 * Defines the data structures for consensus voting in agent coordination
 */

/**
 * Vote type for constitutional clauses
 */
export enum VoteType {
  APPROVE = 'approve',
  REJECT = 'reject',
  ABSTAIN = 'abstain'
}

/**
 * Individual vote cast by an agent
 */
export interface Vote {
  agentId: string;
  clauseId: string;
  vote: VoteType;
  confidence: number; // 0-1 scale
  reasoning?: string;
  timestamp: number;
}

/**
 * Agent expertise profile for weighted voting
 */
export interface AgentExpertise {
  agentId: string;
  domain: string;
  expertiseLevel: number; // 0-1 scale
  successRate: number; // Historical accuracy
  totalVotes: number;
  correctVotes: number;
}

/**
 * Clause being voted on
 */
export interface Clause {
  id: string;
  text: string;
  category: string;
  priority: number;
  requiredQuorum: number;
}

/**
 * Voting session configuration
 */
export interface VotingSession {
  id: string;
  clauses: Clause[];
  participants: string[]; // Agent IDs
  startTime: number;
  deadline?: number;
  status: 'active' | 'completed' | 'expired';
}

/**
 * Vote tally for a clause
 */
export interface VoteTally {
  clauseId: string;
  approvals: number;
  rejections: number;
  abstentions: number;
  totalVotes: number;
  requiredQuorum: number;
  votes: Vote[];
}

/**
 * Consensus result
 */
export interface ConsensusResult {
  clauseId: string;
  decision: 'approved' | 'rejected' | 'disputed';
  confidence: number; // 0-1 scale
  agreement: number; // 0-1 scale (how much agents agree)
  algorithm: 'majority' | 'weighted' | 'bayesian';
  metadata: {
    totalVotes: number;
    approvals: number;
    rejections: number;
    abstentions: number;
    quorumMet: boolean;
  };
  disputedAgents?: string[]; // Agents who disagreed with final decision
}

/**
 * Bayesian prior beliefs for consensus
 */
export interface BayesianPrior {
  clauseId: string;
  priorProbability: number; // Prior belief that clause should be approved
  priorConfidence: number; // Strength of prior belief
  evidenceWeight: number; // How much to weight new evidence
}

/**
 * Configuration for consensus algorithms
 */
export interface ConsensusConfig {
  algorithm: 'majority' | 'weighted' | 'bayesian';
  minimumQuorum: number; // Minimum votes required
  approvalThreshold: number; // 0-1, percentage needed for approval
  confidenceThreshold: number; // 0-1, minimum confidence for valid vote
  tieBreaker: 'reject' | 'approve' | 'proposer'; // How to handle ties
  weightingStrategy?: 'linear' | 'exponential' | 'sigmoid';
  bayesianPriors?: Map<string, BayesianPrior>;
}

/**
 * Agreement metrics between agents
 */
export interface AgreementMetrics {
  clauseId: string;
  agentPairs: Map<string, number>; // Pairwise agreement scores
  overallAgreement: number; // Cohen's kappa or similar
  polarization: number; // How divided are the agents
  confidence: number; // Average confidence of votes
  unanimity: boolean; // All agents agree
}
