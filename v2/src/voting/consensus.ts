/**
 * Consensus Algorithms for Agent Voting
 *
 * Implements three consensus mechanisms:
 * 1. Majority Consensus - Simple majority voting
 * 2. Weighted Consensus - Expertise-based weighting
 * 3. Bayesian Consensus - Probabilistic inference
 */

import {
  Vote,
  VoteType,
  VoteTally,
  ConsensusResult,
  ConsensusConfig,
  AgentExpertise,
  BayesianPrior,
  AgreementMetrics,
  Clause
} from './protocol';

/**
 * Calculate vote tally from collected votes
 */
export function calculateVoteTally(votes: Vote[], clause: Clause): VoteTally {
  const approvals = votes.filter(v => v.vote === VoteType.APPROVE).length;
  const rejections = votes.filter(v => v.vote === VoteType.REJECT).length;
  const abstentions = votes.filter(v => v.vote === VoteType.ABSTAIN).length;

  return {
    clauseId: clause.id,
    approvals,
    rejections,
    abstentions,
    totalVotes: votes.length,
    requiredQuorum: clause.requiredQuorum,
    votes
  };
}

/**
 * Majority Consensus Algorithm
 *
 * Simple majority voting with quorum requirements
 * - Requires minimum quorum participation
 * - Approves if >50% of votes are approvals
 * - Handles ties with configurable tie-breaker
 */
export function majorityConsensus(
  tally: VoteTally,
  config: ConsensusConfig
): ConsensusResult {
  const { approvals, rejections, abstentions, totalVotes, requiredQuorum } = tally;

  // Filter out low-confidence votes
  const validVotes = tally.votes.filter(v => v.confidence >= config.confidenceThreshold);
  const validApprovals = validVotes.filter(v => v.vote === VoteType.APPROVE).length;
  const validRejections = validVotes.filter(v => v.vote === VoteType.REJECT).length;
  const validTotal = validVotes.length;

  // Check quorum
  const quorumMet = validTotal >= Math.max(requiredQuorum, config.minimumQuorum);

  if (!quorumMet) {
    return {
      clauseId: tally.clauseId,
      decision: 'disputed',
      confidence: 0,
      agreement: 0,
      algorithm: 'majority',
      metadata: {
        totalVotes,
        approvals,
        rejections,
        abstentions,
        quorumMet: false
      }
    };
  }

  // Calculate approval percentage (excluding abstentions)
  const votingTotal = validApprovals + validRejections;
  const approvalRate = votingTotal > 0 ? validApprovals / votingTotal : 0;

  // Determine decision
  let decision: 'approved' | 'rejected' | 'disputed';

  if (approvalRate > config.approvalThreshold) {
    decision = 'approved';
  } else if (approvalRate < (1 - config.approvalThreshold)) {
    decision = 'rejected';
  } else {
    // Tie - use tie-breaker
    decision = handleTieBreaker(config.tieBreaker, tally);
  }

  // Calculate confidence based on vote distribution
  const confidence = calculateMajorityConfidence(
    validApprovals,
    validRejections,
    validTotal
  );

  // Calculate agreement (how unified the vote is)
  const agreement = calculateAgreement(validApprovals, validRejections, validTotal);

  // Identify disputed agents (those who voted against the decision)
  const disputedAgents = tally.votes
    .filter(v => {
      if (decision === 'approved') return v.vote === VoteType.REJECT;
      if (decision === 'rejected') return v.vote === VoteType.APPROVE;
      return false;
    })
    .map(v => v.agentId);

  return {
    clauseId: tally.clauseId,
    decision,
    confidence,
    agreement,
    algorithm: 'majority',
    metadata: {
      totalVotes,
      approvals,
      rejections,
      abstentions,
      quorumMet
    },
    disputedAgents: disputedAgents.length > 0 ? disputedAgents : undefined
  };
}

/**
 * Weighted Consensus Algorithm
 *
 * Uses agent expertise to weight votes
 * - Agents with higher expertise have more influence
 * - Historical accuracy affects weight
 * - Supports multiple weighting strategies
 */
export function weightedConsensus(
  tally: VoteTally,
  expertiseMap: Map<string, AgentExpertise>,
  config: ConsensusConfig
): ConsensusResult {
  const { requiredQuorum, votes } = tally;

  // Filter valid votes
  const validVotes = votes.filter(v => v.confidence >= config.confidenceThreshold);

  // Check quorum
  const quorumMet = validVotes.length >= Math.max(requiredQuorum, config.minimumQuorum);

  if (!quorumMet) {
    return {
      clauseId: tally.clauseId,
      decision: 'disputed',
      confidence: 0,
      agreement: 0,
      algorithm: 'weighted',
      metadata: {
        totalVotes: tally.totalVotes,
        approvals: tally.approvals,
        rejections: tally.rejections,
        abstentions: tally.abstentions,
        quorumMet: false
      }
    };
  }

  // Calculate weighted votes
  let weightedApprovals = 0;
  let weightedRejections = 0;
  let totalWeight = 0;

  const strategy = config.weightingStrategy || 'linear';

  for (const vote of validVotes) {
    if (vote.vote === VoteType.ABSTAIN) continue;

    const expertise = expertiseMap.get(vote.agentId);
    const weight = calculateAgentWeight(expertise, vote, strategy);

    totalWeight += weight;

    if (vote.vote === VoteType.APPROVE) {
      weightedApprovals += weight;
    } else if (vote.vote === VoteType.REJECT) {
      weightedRejections += weight;
    }
  }

  // Calculate weighted approval rate
  const weightedApprovalRate = totalWeight > 0 ? weightedApprovals / totalWeight : 0;

  // Determine decision
  let decision: 'approved' | 'rejected' | 'disputed';

  if (weightedApprovalRate > config.approvalThreshold) {
    decision = 'approved';
  } else if (weightedApprovalRate < (1 - config.approvalThreshold)) {
    decision = 'rejected';
  } else {
    decision = handleTieBreaker(config.tieBreaker, tally);
  }

  // Calculate confidence based on weighted distribution and vote confidence
  const confidence = calculateWeightedConfidence(
    weightedApprovals,
    weightedRejections,
    totalWeight,
    validVotes
  );

  // Calculate agreement
  const agreement = calculateAgreement(
    weightedApprovals,
    weightedRejections,
    totalWeight
  );

  // Identify disputed agents
  const disputedAgents = votes
    .filter(v => {
      if (decision === 'approved') return v.vote === VoteType.REJECT;
      if (decision === 'rejected') return v.vote === VoteType.APPROVE;
      return false;
    })
    .map(v => v.agentId);

  return {
    clauseId: tally.clauseId,
    decision,
    confidence,
    agreement,
    algorithm: 'weighted',
    metadata: {
      totalVotes: tally.totalVotes,
      approvals: tally.approvals,
      rejections: tally.rejections,
      abstentions: tally.abstentions,
      quorumMet
    },
    disputedAgents: disputedAgents.length > 0 ? disputedAgents : undefined
  };
}

/**
 * Bayesian Consensus Algorithm
 *
 * Uses Bayesian inference to update beliefs based on votes
 * - Incorporates prior beliefs about clause approval
 * - Updates posterior probability with each vote
 * - Accounts for vote confidence and agent expertise
 */
export function bayesianConsensus(
  tally: VoteTally,
  prior: BayesianPrior,
  expertiseMap: Map<string, AgentExpertise>,
  config: ConsensusConfig
): ConsensusResult {
  const { requiredQuorum, votes } = tally;

  // Filter valid votes
  const validVotes = votes.filter(v => v.confidence >= config.confidenceThreshold);

  // Check quorum
  const quorumMet = validVotes.length >= Math.max(requiredQuorum, config.minimumQuorum);

  if (!quorumMet) {
    return {
      clauseId: tally.clauseId,
      decision: 'disputed',
      confidence: 0,
      agreement: 0,
      algorithm: 'bayesian',
      metadata: {
        totalVotes: tally.totalVotes,
        approvals: tally.approvals,
        rejections: tally.rejections,
        abstentions: tally.abstentions,
        quorumMet: false
      }
    };
  }

  // Start with prior probability
  let posteriorApproval = prior.priorProbability;
  let posteriorRejection = 1 - prior.priorProbability;

  // Bayesian update with each vote
  for (const vote of validVotes) {
    if (vote.vote === VoteType.ABSTAIN) continue;

    const expertise = expertiseMap.get(vote.agentId);

    // Likelihood: P(vote | true state)
    // High expertise agents are more likely to be correct
    const accuracy = expertise ? expertise.successRate : 0.5;

    // Update based on vote
    if (vote.vote === VoteType.APPROVE) {
      // P(approve | should approve) = accuracy
      // P(approve | should reject) = 1 - accuracy
      const likelihood = accuracy * vote.confidence;
      const falsePositive = (1 - accuracy) * vote.confidence;

      // Bayesian update
      const evidence = likelihood * posteriorApproval + falsePositive * posteriorRejection;
      if (evidence > 0) {
        posteriorApproval = (likelihood * posteriorApproval) / evidence;
        posteriorRejection = 1 - posteriorApproval;
      }
    } else if (vote.vote === VoteType.REJECT) {
      // P(reject | should reject) = accuracy
      // P(reject | should approve) = 1 - accuracy
      const likelihood = accuracy * vote.confidence;
      const falseNegative = (1 - accuracy) * vote.confidence;

      // Bayesian update
      const evidence = likelihood * posteriorRejection + falseNegative * posteriorApproval;
      if (evidence > 0) {
        posteriorRejection = (likelihood * posteriorRejection) / evidence;
        posteriorApproval = 1 - posteriorRejection;
      }
    }

    // Apply evidence weight to prevent over-updating
    posteriorApproval = prior.priorProbability * (1 - prior.evidenceWeight) +
                        posteriorApproval * prior.evidenceWeight;
    posteriorRejection = 1 - posteriorApproval;
  }

  // Determine decision based on posterior probability
  let decision: 'approved' | 'rejected' | 'disputed';

  if (posteriorApproval > config.approvalThreshold) {
    decision = 'approved';
  } else if (posteriorRejection > config.approvalThreshold) {
    decision = 'rejected';
  } else {
    decision = 'disputed';
  }

  // Confidence is the posterior probability of the decision
  const confidence = decision === 'approved' ? posteriorApproval :
                     decision === 'rejected' ? posteriorRejection :
                     Math.max(posteriorApproval, posteriorRejection);

  // Agreement based on how close votes align with posterior
  const agreement = calculateBayesianAgreement(validVotes, posteriorApproval);

  // Identify disputed agents
  const disputedAgents = votes
    .filter(v => {
      if (decision === 'approved') return v.vote === VoteType.REJECT;
      if (decision === 'rejected') return v.vote === VoteType.APPROVE;
      return false;
    })
    .map(v => v.agentId);

  return {
    clauseId: tally.clauseId,
    decision,
    confidence,
    agreement,
    algorithm: 'bayesian',
    metadata: {
      totalVotes: tally.totalVotes,
      approvals: tally.approvals,
      rejections: tally.rejections,
      abstentions: tally.abstentions,
      quorumMet
    },
    disputedAgents: disputedAgents.length > 0 ? disputedAgents : undefined
  };
}

/**
 * Calculate agreement metrics between agents
 */
export function calculateAgreementMetrics(votes: Vote[]): AgreementMetrics {
  const clauseId = votes[0]?.clauseId || '';
  const agentVotes = new Map<string, VoteType>();

  // Build agent vote map
  for (const vote of votes) {
    agentVotes.set(vote.agentId, vote.vote);
  }

  // Calculate pairwise agreement
  const agentPairs = new Map<string, number>();
  const agents = Array.from(agentVotes.keys());

  let totalPairs = 0;
  let agreementSum = 0;

  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const agent1 = agents[i];
      const agent2 = agents[j];
      const vote1 = agentVotes.get(agent1);
      const vote2 = agentVotes.get(agent2);

      if (vote1 === VoteType.ABSTAIN || vote2 === VoteType.ABSTAIN) continue;

      const pairKey = `${agent1}:${agent2}`;
      const agrees = vote1 === vote2 ? 1 : 0;
      agentPairs.set(pairKey, agrees);

      agreementSum += agrees;
      totalPairs++;
    }
  }

  const overallAgreement = totalPairs > 0 ? agreementSum / totalPairs : 0;

  // Calculate polarization (variance from mean)
  const approvals = votes.filter(v => v.vote === VoteType.APPROVE).length;
  const rejections = votes.filter(v => v.vote === VoteType.REJECT).length;
  const total = approvals + rejections;
  const approvalRate = total > 0 ? approvals / total : 0.5;

  // Polarization is high when approval rate is near 0.5
  const polarization = 1 - Math.abs(approvalRate - 0.5) * 2;

  // Average confidence
  const avgConfidence = votes.reduce((sum, v) => sum + v.confidence, 0) / votes.length;

  // Check unanimity
  const firstVote = votes.find(v => v.vote !== VoteType.ABSTAIN)?.vote;
  const unanimity = votes
    .filter(v => v.vote !== VoteType.ABSTAIN)
    .every(v => v.vote === firstVote);

  return {
    clauseId,
    agentPairs,
    overallAgreement,
    polarization,
    confidence: avgConfidence,
    unanimity
  };
}

// ========== Helper Functions ==========

/**
 * Handle tie-breaking logic
 */
function handleTieBreaker(
  tieBreaker: 'reject' | 'approve' | 'proposer',
  tally: VoteTally
): 'approved' | 'rejected' | 'disputed' {
  if (tieBreaker === 'approve') return 'approved';
  if (tieBreaker === 'reject') return 'rejected';

  // For 'proposer' tie-breaker, we'd need the proposer's vote
  // Default to disputed for now
  return 'disputed';
}

/**
 * Calculate confidence for majority consensus
 */
function calculateMajorityConfidence(
  approvals: number,
  rejections: number,
  total: number
): number {
  if (total === 0) return 0;

  const winningVotes = Math.max(approvals, rejections);
  const losingVotes = Math.min(approvals, rejections);

  // Confidence is higher when margin is larger
  const margin = (winningVotes - losingVotes) / total;
  const participation = total / (approvals + rejections);

  return (margin * 0.7 + participation * 0.3);
}

/**
 * Calculate confidence for weighted consensus
 */
function calculateWeightedConfidence(
  weightedApprovals: number,
  weightedRejections: number,
  totalWeight: number,
  votes: Vote[]
): number {
  if (totalWeight === 0) return 0;

  const weightedMargin = Math.abs(weightedApprovals - weightedRejections) / totalWeight;
  const avgVoteConfidence = votes.reduce((sum, v) => sum + v.confidence, 0) / votes.length;

  return (weightedMargin * 0.6 + avgVoteConfidence * 0.4);
}

/**
 * Calculate agreement metric (how unified the vote is)
 */
function calculateAgreement(
  approvals: number,
  rejections: number,
  total: number
): number {
  if (total === 0) return 0;

  // Agreement is high when votes are unified
  const majoritySize = Math.max(approvals, rejections);
  return majoritySize / total;
}

/**
 * Calculate Bayesian agreement (how well votes align with posterior)
 */
function calculateBayesianAgreement(votes: Vote[], posteriorApproval: number): number {
  if (votes.length === 0) return 0;

  let alignmentSum = 0;
  let voteCount = 0;

  for (const vote of votes) {
    if (vote.vote === VoteType.ABSTAIN) continue;

    // How well does this vote align with the posterior?
    const alignment = vote.vote === VoteType.APPROVE ?
                      posteriorApproval * vote.confidence :
                      (1 - posteriorApproval) * vote.confidence;

    alignmentSum += alignment;
    voteCount++;
  }

  return voteCount > 0 ? alignmentSum / voteCount : 0;
}

/**
 * Calculate agent weight based on expertise and vote
 */
function calculateAgentWeight(
  expertise: AgentExpertise | undefined,
  vote: Vote,
  strategy: 'linear' | 'exponential' | 'sigmoid'
): number {
  if (!expertise) {
    // Default weight for unknown agents
    return vote.confidence * 0.5;
  }

  const baseWeight = expertise.expertiseLevel * expertise.successRate;
  const confidenceWeight = vote.confidence;

  let weight: number;

  switch (strategy) {
    case 'linear':
      weight = baseWeight * confidenceWeight;
      break;

    case 'exponential':
      // Exponential amplifies expertise differences
      weight = Math.pow(baseWeight, 2) * confidenceWeight;
      break;

    case 'sigmoid':
      // Sigmoid normalizes extreme values
      weight = (1 / (1 + Math.exp(-5 * (baseWeight - 0.5)))) * confidenceWeight;
      break;

    default:
      weight = baseWeight * confidenceWeight;
  }

  return Math.max(0, Math.min(1, weight)); // Clamp to [0, 1]
}

// ========== Engine & Factory Classes ==========

/**
 * ConsensusEngine - Main consensus processing engine
 *
 * Provides a unified interface to all consensus algorithms
 */
export class ConsensusEngine {
  constructor(private config: ConsensusConfig) {}

  /**
   * Execute consensus based on configured algorithm
   */
  execute(
    tally: VoteTally,
    expertiseMap?: Map<string, AgentExpertise>,
    priors?: Map<string, BayesianPrior>
  ): ConsensusResult {
    switch (this.config.algorithm) {
      case 'majority':
        return majorityConsensus(tally, this.config);

      case 'weighted':
        if (!expertiseMap) {
          throw new Error('Expertise map required for weighted consensus');
        }
        return weightedConsensus(tally, expertiseMap, this.config);

      case 'bayesian':
        if (!expertiseMap || !priors) {
          throw new Error('Expertise map and priors required for Bayesian consensus');
        }
        const prior = priors.get(tally.clauseId);
        if (!prior) {
          throw new Error(`No prior found for clause ${tally.clauseId}`);
        }
        return bayesianConsensus(tally, prior, expertiseMap, this.config);

      default:
        throw new Error(`Unknown algorithm: ${this.config.algorithm}`);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ConsensusConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ConsensusConfig {
    return { ...this.config };
  }
}

/**
 * ConsensusFactory - Creates consensus engines with preset configurations
 */
export class ConsensusFactory {
  /**
   * Create a majority consensus engine with default settings
   */
  static createMajority(overrides?: Partial<ConsensusConfig>): ConsensusEngine {
    const defaultConfig: ConsensusConfig = {
      algorithm: 'majority',
      minimumQuorum: 3,
      approvalThreshold: 0.5,
      confidenceThreshold: 0.3,
      tieBreaker: 'reject'
    };

    return new ConsensusEngine({ ...defaultConfig, ...overrides });
  }

  /**
   * Create a weighted consensus engine with default settings
   */
  static createWeighted(
    strategy: 'linear' | 'exponential' | 'sigmoid' = 'linear',
    overrides?: Partial<ConsensusConfig>
  ): ConsensusEngine {
    const defaultConfig: ConsensusConfig = {
      algorithm: 'weighted',
      minimumQuorum: 3,
      approvalThreshold: 0.5,
      confidenceThreshold: 0.3,
      tieBreaker: 'reject',
      weightingStrategy: strategy
    };

    return new ConsensusEngine({ ...defaultConfig, ...overrides });
  }

  /**
   * Create a Bayesian consensus engine with default settings
   */
  static createBayesian(
    priors: Map<string, BayesianPrior>,
    overrides?: Partial<ConsensusConfig>
  ): ConsensusEngine {
    const defaultConfig: ConsensusConfig = {
      algorithm: 'bayesian',
      minimumQuorum: 3,
      approvalThreshold: 0.6,
      confidenceThreshold: 0.4,
      tieBreaker: 'proposer' as 'proposer' | 'reject' | 'approve',
      bayesianPriors: priors
    };

    return new ConsensusEngine({ ...defaultConfig, ...overrides });
  }

  /**
   * Create a custom consensus engine
   */
  static createCustom(config: ConsensusConfig): ConsensusEngine {
    return new ConsensusEngine(config);
  }
}
