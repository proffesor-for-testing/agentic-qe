/**
 * Unit Tests for Consensus Algorithms
 *
 * Tests majority, weighted, and Bayesian consensus
 */

import {
  Vote,
  VoteType,
  VoteTally,
  ConsensusConfig,
  AgentExpertise,
  BayesianPrior,
  Clause
} from '../../src/voting/protocol';

import {
  calculateVoteTally,
  majorityConsensus,
  weightedConsensus,
  bayesianConsensus,
  calculateAgreementMetrics
} from '../../src/voting/consensus';

describe('Consensus Algorithms', () => {
  // Test data setup
  const mockClause: Clause = {
    id: 'clause-1',
    text: 'Test clause',
    category: 'test',
    priority: 1,
    requiredQuorum: 3
  };

  const defaultConfig: ConsensusConfig = {
    algorithm: 'majority',
    minimumQuorum: 3,
    approvalThreshold: 0.5,
    confidenceThreshold: 0.3,
    tieBreaker: 'reject'
  };

  describe('calculateVoteTally', () => {
    it('should correctly tally votes', () => {
      const votes: Vote[] = [
        { agentId: 'agent-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.9, timestamp: Date.now() },
        { agentId: 'agent-2', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.8, timestamp: Date.now() },
        { agentId: 'agent-3', clauseId: 'clause-1', vote: VoteType.REJECT, confidence: 0.7, timestamp: Date.now() },
        { agentId: 'agent-4', clauseId: 'clause-1', vote: VoteType.ABSTAIN, confidence: 0.5, timestamp: Date.now() }
      ];

      const tally = calculateVoteTally(votes, mockClause);

      expect(tally.approvals).toBe(2);
      expect(tally.rejections).toBe(1);
      expect(tally.abstentions).toBe(1);
      expect(tally.totalVotes).toBe(4);
    });

    it('should handle empty votes', () => {
      const tally = calculateVoteTally([], mockClause);

      expect(tally.approvals).toBe(0);
      expect(tally.rejections).toBe(0);
      expect(tally.abstentions).toBe(0);
      expect(tally.totalVotes).toBe(0);
    });
  });

  describe('majorityConsensus', () => {
    it('should approve with simple majority', () => {
      const votes: Vote[] = [
        { agentId: 'agent-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.9, timestamp: Date.now() },
        { agentId: 'agent-2', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.8, timestamp: Date.now() },
        { agentId: 'agent-3', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.85, timestamp: Date.now() },
        { agentId: 'agent-4', clauseId: 'clause-1', vote: VoteType.REJECT, confidence: 0.7, timestamp: Date.now() }
      ];

      const tally = calculateVoteTally(votes, mockClause);
      const result = majorityConsensus(tally, defaultConfig);

      expect(result.decision).toBe('approved');
      expect(result.metadata.quorumMet).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.agreement).toBeGreaterThan(0.5);
    });

    it('should reject with majority rejections', () => {
      const votes: Vote[] = [
        { agentId: 'agent-1', clauseId: 'clause-1', vote: VoteType.REJECT, confidence: 0.9, timestamp: Date.now() },
        { agentId: 'agent-2', clauseId: 'clause-1', vote: VoteType.REJECT, confidence: 0.8, timestamp: Date.now() },
        { agentId: 'agent-3', clauseId: 'clause-1', vote: VoteType.REJECT, confidence: 0.85, timestamp: Date.now() },
        { agentId: 'agent-4', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.7, timestamp: Date.now() }
      ];

      const tally = calculateVoteTally(votes, mockClause);
      const result = majorityConsensus(tally, defaultConfig);

      expect(result.decision).toBe('rejected');
      expect(result.disputedAgents).toContain('agent-4');
    });

    it('should handle quorum not met', () => {
      const votes: Vote[] = [
        { agentId: 'agent-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.9, timestamp: Date.now() },
        { agentId: 'agent-2', clauseId: 'clause-1', vote: VoteType.REJECT, confidence: 0.8, timestamp: Date.now() }
      ];

      const tally = calculateVoteTally(votes, mockClause);
      const result = majorityConsensus(tally, defaultConfig);

      expect(result.decision).toBe('disputed');
      expect(result.metadata.quorumMet).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should filter low-confidence votes', () => {
      const votes: Vote[] = [
        { agentId: 'agent-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.9, timestamp: Date.now() },
        { agentId: 'agent-2', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.8, timestamp: Date.now() },
        { agentId: 'agent-3', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.85, timestamp: Date.now() },
        { agentId: 'agent-4', clauseId: 'clause-1', vote: VoteType.REJECT, confidence: 0.2, timestamp: Date.now() } // Below threshold
      ];

      const tally = calculateVoteTally(votes, mockClause);
      const result = majorityConsensus(tally, defaultConfig);

      expect(result.decision).toBe('approved');
      expect(result.disputedAgents).toBeUndefined(); // Low confidence vote ignored
    });

    it('should handle exact tie', () => {
      const votes: Vote[] = [
        { agentId: 'agent-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.9, timestamp: Date.now() },
        { agentId: 'agent-2', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.8, timestamp: Date.now() },
        { agentId: 'agent-3', clauseId: 'clause-1', vote: VoteType.REJECT, confidence: 0.85, timestamp: Date.now() },
        { agentId: 'agent-4', clauseId: 'clause-1', vote: VoteType.REJECT, confidence: 0.7, timestamp: Date.now() }
      ];

      const tally = calculateVoteTally(votes, mockClause);
      const result = majorityConsensus(tally, defaultConfig);

      // With tie-breaker set to 'reject'
      expect(result.decision).toBe('rejected');
    });

    it('should handle all abstentions', () => {
      const votes: Vote[] = [
        { agentId: 'agent-1', clauseId: 'clause-1', vote: VoteType.ABSTAIN, confidence: 0.9, timestamp: Date.now() },
        { agentId: 'agent-2', clauseId: 'clause-1', vote: VoteType.ABSTAIN, confidence: 0.8, timestamp: Date.now() },
        { agentId: 'agent-3', clauseId: 'clause-1', vote: VoteType.ABSTAIN, confidence: 0.85, timestamp: Date.now() }
      ];

      const tally = calculateVoteTally(votes, mockClause);
      const result = majorityConsensus(tally, defaultConfig);

      expect(result.decision).toBe('disputed');
    });
  });

  describe('weightedConsensus', () => {
    const expertiseMap = new Map<string, AgentExpertise>([
      ['expert-1', {
        agentId: 'expert-1',
        domain: 'security',
        expertiseLevel: 0.9,
        successRate: 0.95,
        totalVotes: 100,
        correctVotes: 95
      }],
      ['expert-2', {
        agentId: 'expert-2',
        domain: 'security',
        expertiseLevel: 0.7,
        successRate: 0.8,
        totalVotes: 50,
        correctVotes: 40
      }],
      ['novice-1', {
        agentId: 'novice-1',
        domain: 'security',
        expertiseLevel: 0.3,
        successRate: 0.6,
        totalVotes: 10,
        correctVotes: 6
      }]
    ]);

    const weightedConfig: ConsensusConfig = {
      ...defaultConfig,
      algorithm: 'weighted',
      weightingStrategy: 'linear'
    };

    it('should weight expert votes more heavily', () => {
      const votes: Vote[] = [
        { agentId: 'expert-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.95, timestamp: Date.now() },
        { agentId: 'novice-1', clauseId: 'clause-1', vote: VoteType.REJECT, confidence: 0.7, timestamp: Date.now() },
        { agentId: 'expert-2', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.85, timestamp: Date.now() }
      ];

      const tally = calculateVoteTally(votes, mockClause);
      const result = weightedConsensus(tally, expertiseMap, weightedConfig);

      expect(result.decision).toBe('approved');
      expect(result.algorithm).toBe('weighted');
    });

    it('should handle exponential weighting', () => {
      const expConfig: ConsensusConfig = {
        ...weightedConfig,
        weightingStrategy: 'exponential'
      };

      const votes: Vote[] = [
        { agentId: 'expert-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.95, timestamp: Date.now() },
        { agentId: 'novice-1', clauseId: 'clause-1', vote: VoteType.REJECT, confidence: 0.9, timestamp: Date.now() },
        { agentId: 'novice-1', clauseId: 'clause-1', vote: VoteType.REJECT, confidence: 0.85, timestamp: Date.now() }
      ];

      const tally = calculateVoteTally(votes, mockClause);
      const result = weightedConsensus(tally, expertiseMap, expConfig);

      // Expert vote should still dominate due to exponential weighting
      expect(result.decision).toBe('approved');
    });

    it('should handle unknown agents with default weight', () => {
      const votes: Vote[] = [
        { agentId: 'unknown-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.8, timestamp: Date.now() },
        { agentId: 'unknown-2', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.7, timestamp: Date.now() },
        { agentId: 'unknown-3', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.9, timestamp: Date.now() }
      ];

      const tally = calculateVoteTally(votes, mockClause);
      const result = weightedConsensus(tally, new Map(), weightedConfig);

      expect(result.decision).toBe('approved');
    });

    it('should handle sigmoid weighting strategy', () => {
      const sigmoidConfig: ConsensusConfig = {
        ...weightedConfig,
        weightingStrategy: 'sigmoid'
      };

      const votes: Vote[] = [
        { agentId: 'expert-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.95, timestamp: Date.now() },
        { agentId: 'expert-2', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.85, timestamp: Date.now() },
        { agentId: 'novice-1', clauseId: 'clause-1', vote: VoteType.REJECT, confidence: 0.7, timestamp: Date.now() }
      ];

      const tally = calculateVoteTally(votes, mockClause);
      const result = weightedConsensus(tally, expertiseMap, sigmoidConfig);

      expect(result.decision).toBe('approved');
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('bayesianConsensus', () => {
    const expertiseMap = new Map<string, AgentExpertise>([
      ['reliable-1', {
        agentId: 'reliable-1',
        domain: 'security',
        expertiseLevel: 0.9,
        successRate: 0.9,
        totalVotes: 100,
        correctVotes: 90
      }],
      ['reliable-2', {
        agentId: 'reliable-2',
        domain: 'security',
        expertiseLevel: 0.8,
        successRate: 0.85,
        totalVotes: 80,
        correctVotes: 68
      }],
      ['unreliable-1', {
        agentId: 'unreliable-1',
        domain: 'security',
        expertiseLevel: 0.4,
        successRate: 0.5,
        totalVotes: 20,
        correctVotes: 10
      }]
    ]);

    const prior: BayesianPrior = {
      clauseId: 'clause-1',
      priorProbability: 0.5, // Neutral prior
      priorConfidence: 0.3,
      evidenceWeight: 0.7
    };

    const bayesianConfig: ConsensusConfig = {
      ...defaultConfig,
      algorithm: 'bayesian'
    };

    it('should update belief with reliable agent votes', () => {
      const votes: Vote[] = [
        { agentId: 'reliable-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.95, timestamp: Date.now() },
        { agentId: 'reliable-2', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.9, timestamp: Date.now() },
        { agentId: 'unreliable-1', clauseId: 'clause-1', vote: VoteType.REJECT, confidence: 0.6, timestamp: Date.now() }
      ];

      const tally = calculateVoteTally(votes, mockClause);
      const result = bayesianConsensus(tally, prior, expertiseMap, bayesianConfig);

      expect(result.decision).toBe('approved');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should handle strong prior belief', () => {
      const strongPrior: BayesianPrior = {
        clauseId: 'clause-1',
        priorProbability: 0.9, // Strong belief it should be approved
        priorConfidence: 0.8,
        evidenceWeight: 0.3 // Low weight on new evidence
      };

      const votes: Vote[] = [
        { agentId: 'reliable-1', clauseId: 'clause-1', vote: VoteType.REJECT, confidence: 0.9, timestamp: Date.now() },
        { agentId: 'reliable-2', clauseId: 'clause-1', vote: VoteType.REJECT, confidence: 0.85, timestamp: Date.now() }
      ];

      const tally = calculateVoteTally(votes, mockClause);
      const result = bayesianConsensus(tally, strongPrior, expertiseMap, bayesianConfig);

      // Strong prior should resist evidence somewhat
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle abstentions in Bayesian update', () => {
      const votes: Vote[] = [
        { agentId: 'reliable-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.9, timestamp: Date.now() },
        { agentId: 'reliable-2', clauseId: 'clause-1', vote: VoteType.ABSTAIN, confidence: 0.5, timestamp: Date.now() },
        { agentId: 'unreliable-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.7, timestamp: Date.now() }
      ];

      const tally = calculateVoteTally(votes, mockClause);
      const result = bayesianConsensus(tally, prior, expertiseMap, bayesianConfig);

      expect(result.decision).toBe('approved');
    });

    it('should result in disputed when evidence is weak', () => {
      const votes: Vote[] = [
        { agentId: 'unreliable-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.5, timestamp: Date.now() },
        { agentId: 'reliable-1', clauseId: 'clause-1', vote: VoteType.REJECT, confidence: 0.6, timestamp: Date.now() },
        { agentId: 'reliable-2', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.55, timestamp: Date.now() }
      ];

      const tally = calculateVoteTally(votes, mockClause);

      // Set higher approval threshold to make decision harder
      const strictConfig: ConsensusConfig = {
        ...bayesianConfig,
        approvalThreshold: 0.7
      };

      const result = bayesianConsensus(tally, prior, expertiseMap, strictConfig);

      expect(result.decision).toBe('disputed');
    });

    it('should handle agents with no expertise data', () => {
      const votes: Vote[] = [
        { agentId: 'unknown-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.8, timestamp: Date.now() },
        { agentId: 'unknown-2', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.75, timestamp: Date.now() },
        { agentId: 'unknown-3', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.85, timestamp: Date.now() }
      ];

      const tally = calculateVoteTally(votes, mockClause);
      const result = bayesianConsensus(tally, prior, new Map(), bayesianConfig);

      // Should default to 0.5 accuracy for unknown agents
      expect(result.decision).toBe('approved');
    });
  });

  describe('calculateAgreementMetrics', () => {
    it('should calculate perfect agreement', () => {
      const votes: Vote[] = [
        { agentId: 'agent-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.9, timestamp: Date.now() },
        { agentId: 'agent-2', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.8, timestamp: Date.now() },
        { agentId: 'agent-3', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.85, timestamp: Date.now() }
      ];

      const metrics = calculateAgreementMetrics(votes);

      expect(metrics.overallAgreement).toBe(1);
      expect(metrics.unanimity).toBe(true);
      expect(metrics.polarization).toBe(0);
    });

    it('should calculate split decision', () => {
      const votes: Vote[] = [
        { agentId: 'agent-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.9, timestamp: Date.now() },
        { agentId: 'agent-2', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.8, timestamp: Date.now() },
        { agentId: 'agent-3', clauseId: 'clause-1', vote: VoteType.REJECT, confidence: 0.85, timestamp: Date.now() },
        { agentId: 'agent-4', clauseId: 'clause-1', vote: VoteType.REJECT, confidence: 0.75, timestamp: Date.now() }
      ];

      const metrics = calculateAgreementMetrics(votes);

      expect(metrics.overallAgreement).toBeLessThan(1);
      expect(metrics.unanimity).toBe(false);
      expect(metrics.polarization).toBeGreaterThan(0);
    });

    it('should ignore abstentions in pairwise agreement', () => {
      const votes: Vote[] = [
        { agentId: 'agent-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.9, timestamp: Date.now() },
        { agentId: 'agent-2', clauseId: 'clause-1', vote: VoteType.ABSTAIN, confidence: 0.5, timestamp: Date.now() },
        { agentId: 'agent-3', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.85, timestamp: Date.now() }
      ];

      const metrics = calculateAgreementMetrics(votes);

      expect(metrics.unanimity).toBe(true); // Only non-abstaining votes count
    });

    it('should calculate average confidence', () => {
      const votes: Vote[] = [
        { agentId: 'agent-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.8, timestamp: Date.now() },
        { agentId: 'agent-2', clauseId: 'clause-1', vote: VoteType.REJECT, confidence: 0.6, timestamp: Date.now() },
        { agentId: 'agent-3', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 1.0, timestamp: Date.now() }
      ];

      const metrics = calculateAgreementMetrics(votes);

      expect(metrics.confidence).toBeCloseTo(0.8, 1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single vote', () => {
      const votes: Vote[] = [
        { agentId: 'agent-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.9, timestamp: Date.now() }
      ];

      const tally = calculateVoteTally(votes, mockClause);
      const result = majorityConsensus(tally, defaultConfig);

      // Quorum not met
      expect(result.decision).toBe('disputed');
    });

    it('should handle zero votes', () => {
      const votes: Vote[] = [];

      const tally = calculateVoteTally(votes, mockClause);
      const result = majorityConsensus(tally, defaultConfig);

      expect(result.decision).toBe('disputed');
      expect(result.confidence).toBe(0);
    });

    it('should handle all votes below confidence threshold', () => {
      const votes: Vote[] = [
        { agentId: 'agent-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.2, timestamp: Date.now() },
        { agentId: 'agent-2', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.1, timestamp: Date.now() },
        { agentId: 'agent-3', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.15, timestamp: Date.now() }
      ];

      const tally = calculateVoteTally(votes, mockClause);
      const result = majorityConsensus(tally, defaultConfig);

      expect(result.decision).toBe('disputed');
    });

    it('should handle numerical precision in weighted voting', () => {
      const expertiseMap = new Map<string, AgentExpertise>([
        ['agent-1', {
          agentId: 'agent-1',
          domain: 'test',
          expertiseLevel: 0.33333333,
          successRate: 0.66666666,
          totalVotes: 3,
          correctVotes: 2
        }]
      ]);

      const votes: Vote[] = [
        { agentId: 'agent-1', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.77777777, timestamp: Date.now() },
        { agentId: 'agent-2', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.88888888, timestamp: Date.now() },
        { agentId: 'agent-3', clauseId: 'clause-1', vote: VoteType.APPROVE, confidence: 0.99999999, timestamp: Date.now() }
      ];

      const tally = calculateVoteTally(votes, mockClause);
      const weightedConfig: ConsensusConfig = {
        ...defaultConfig,
        algorithm: 'weighted'
      };

      const result = weightedConsensus(tally, expertiseMap, weightedConfig);

      expect(result.decision).toBe('approved');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
});
