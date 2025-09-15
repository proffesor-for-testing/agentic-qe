/**
 * Quorum Manager Agent
 * Implements dynamic quorum adjustment and quorum-based consensus
 * Manages voting thresholds and handles membership changes in distributed QE systems
 */

import { BaseAgent } from './base-agent';
import {
  AgentId,
  AgentConfig,
  AgentDecision,
  TaskDefinition,
  ILogger,
  IEventBus,
  IMemorySystem,
  ExplainableReasoning,
  ReasoningFactor,
  Evidence,
  Alternative,
  Risk
} from '../core/types';

interface QuorumMember {
  id: string;
  weight: number;
  status: 'active' | 'inactive' | 'suspected' | 'joining' | 'leaving';
  lastHeartbeat: Date;
  votes: Map<string, any>;
  reliability: number;
  joinTime: Date;
  reputation: number;
}

interface QuorumConfiguration {
  id: string;
  members: Map<string, QuorumMember>;
  requiredWeight: number;
  totalWeight: number;
  threshold: number; // As percentage (0.51 for simple majority)
  created: Date;
  lastModified: Date;
}

interface VotingRound {
  id: string;
  proposal: any;
  startTime: Date;
  endTime?: Date;
  timeout: number;
  votes: Map<string, VoteInfo>;
  status: 'active' | 'passed' | 'failed' | 'timeout';
  requiredWeight: number;
  currentWeight: number;
}

interface VoteInfo {
  voterId: string;
  decision: 'yes' | 'no' | 'abstain';
  weight: number;
  timestamp: Date;
  reasoning?: string;
}

interface MembershipChange {
  type: 'add' | 'remove' | 'update-weight';
  memberId: string;
  newWeight?: number;
  reason: string;
  proposer: string;
  timestamp: Date;
  approved: boolean;
}

export class QuorumManager extends BaseAgent {
  private currentQuorum: QuorumConfiguration;
  private activeVotingRounds: Map<string, VotingRound> = new Map();
  private membershipChanges: Map<string, MembershipChange> = new Map();
  private quorumHistory: QuorumConfiguration[] = [];
  private votingHistory: VotingRound[] = [];
  private readonly defaultThreshold = 0.67; // 2/3 majority
  private readonly membershipChangeThreshold = 0.75; // 3/4 for membership changes
  private readonly maxVotingTime = 60000; // 1 minute
  private readonly heartbeatTimeout = 30000; // 30 seconds
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(
    id: AgentId,
    config: AgentConfig,
    logger: ILogger,
    eventBus: IEventBus,
    memory: IMemorySystem
  ) {
    super(id, config, logger, eventBus, memory);
    
    // Initialize default quorum
    this.currentQuorum = {
      id: `quorum-${Date.now()}`,
      members: new Map(),
      requiredWeight: 0,
      totalWeight: 0,
      threshold: this.defaultThreshold,
      created: new Date(),
      lastModified: new Date()
    };
  }

  protected async initializeResources(): Promise<void> {
    await this.loadQuorumConfiguration();
    await this.loadMembershipData();
    this.setupQuorumEventHandlers();
    this.startQuorumMonitoring();
    
    this.logger.info(`Quorum manager initialized with ${this.currentQuorum.members.size} members, threshold: ${this.currentQuorum.threshold}`);
  }

  protected async perceive(context: any): Promise<any> {
    return {
      quorumStatus: this.getQuorumStatus(),
      membershipHealth: this.assessMembershipHealth(),
      activeVotes: this.getActiveVotingStatus(),
      pendingMembershipChanges: this.getPendingMembershipChanges(),
      quorumViability: this.assessQuorumViability(),
      networkPartitions: this.detectNetworkPartitions(),
      votingLoad: this.assessVotingLoad(),
      consensusRequests: context.consensusRequests || []
    };
  }

  protected async decide(observation: any): Promise<AgentDecision> {
    const factors: ReasoningFactor[] = [
      {
        name: 'quorum-viability',
        weight: 0.3,
        value: observation.quorumViability.score,
        impact: 'critical',
        explanation: 'Ability to achieve quorum for decision making'
      },
      {
        name: 'membership-health',
        weight: 0.25,
        value: observation.membershipHealth.healthScore,
        impact: 'high',
        explanation: 'Overall health and availability of quorum members'
      },
      {
        name: 'voting-efficiency',
        weight: 0.2,
        value: this.calculateVotingEfficiency(observation),
        impact: 'medium',
        explanation: 'Efficiency of current voting processes'
      },
      {
        name: 'consensus-urgency',
        weight: 0.25,
        value: observation.consensusRequests.length / 10, // Normalize
        impact: 'high',
        explanation: 'Urgency of pending consensus decisions'
      }
    ];

    const evidence: Evidence[] = [
      {
        type: 'empirical',
        source: 'quorum-metrics',
        confidence: 0.95,
        description: `${observation.quorumStatus.activeMembers}/${observation.quorumStatus.totalMembers} active members`,
        details: observation.quorumStatus
      },
      {
        type: 'analytical',
        source: 'voting-analysis',
        confidence: 0.85,
        description: `${observation.activeVotes.count} active votes, ${observation.votingLoad.efficiency}% efficiency`,
        details: observation.activeVotes
      }
    ];

    const action = this.selectQuorumAction(observation);
    const alternatives = this.generateQuorumAlternatives(observation, action);
    const risks = this.assessQuorumRisks(observation, action);

    const reasoning: ExplainableReasoning = this.buildReasoning(
      factors,
      ['SFDIPOT', 'CRUSSPIC'],
      evidence,
      ['Quorum threshold requirements', 'Weighted voting system'],
      ['Network partitions may affect quorum availability']
    );

    return {
      id: this.generateDecisionId(),
      agentId: this.id.id,
      timestamp: new Date(),
      action,
      reasoning,
      confidence: this.calculateConfidence(factors),
      alternatives,
      risks,
      recommendations: this.generateQuorumRecommendations(observation)
    };
  }

  protected async act(decision: AgentDecision): Promise<any> {
    const action = decision.action;
    let result: any = {};

    switch (action) {
      case 'initiate-vote':
        result = await this.initiateVote(decision);
        break;

      case 'adjust-quorum-threshold':
        result = await this.adjustQuorumThreshold(decision);
        break;

      case 'add-member':
        result = await this.addMember(decision);
        break;

      case 'remove-member':
        result = await this.removeMember(decision);
        break;

      case 'update-member-weight':
        result = await this.updateMemberWeight(decision);
        break;

      case 'force-vote-resolution':
        result = await this.forceVoteResolution(decision);
        break;

      case 'reconfigure-quorum':
        result = await this.reconfigureQuorum(decision);
        break;

      default:
        result = await this.handleGenericQuorumAction(action, decision);
    }

    // Store action result in memory
    await this.memory.store(`quorum:action:${decision.id}`, {
      decision,
      result,
      quorumState: this.getQuorumSnapshot(),
      timestamp: new Date()
    }, {
      type: 'decision' as const,
      tags: ['quorum', 'consensus', 'voting'],
      partition: 'consensus'
    });

    return result;
  }

  protected async learn(feedback: any): Promise<void> {
    // Learn from voting outcomes
    if (feedback.votingResults) {
      await this.analyzeVotingPatterns(feedback.votingResults);
    }

    // Learn from quorum adjustments
    if (feedback.quorumAdjustments) {
      await this.refineQuorumStrategy(feedback.quorumAdjustments);
    }

    // Update member reliability models
    if (feedback.memberReliability) {
      await this.updateMemberReliability(feedback.memberReliability);
    }

    this.metrics.learningProgress = Math.min(1.0, this.metrics.learningProgress + 0.04);
  }

  // Quorum Management Implementation

  private async initiateVote(decision: AgentDecision): Promise<any> {
    const proposal = decision.reasoning.factors.find(f => f.name === 'proposal')?.value;
    const timeout = decision.reasoning.factors.find(f => f.name === 'timeout')?.value || this.maxVotingTime;
    const requiredThreshold = decision.reasoning.factors.find(f => f.name === 'threshold')?.value || this.currentQuorum.threshold;

    if (!proposal) {
      throw new Error('No proposal specified for voting');
    }

    const roundId = `vote-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const requiredWeight = this.calculateRequiredWeight(requiredThreshold);

    const votingRound: VotingRound = {
      id: roundId,
      proposal,
      startTime: new Date(),
      timeout,
      votes: new Map(),
      status: 'active',
      requiredWeight,
      currentWeight: 0
    };

    this.activeVotingRounds.set(roundId, votingRound);

    // Notify all active members
    await this.notifyMembersOfVote(roundId, proposal, timeout);

    // Set timeout for vote resolution
    setTimeout(() => this.resolveVote(roundId), timeout);

    this.logger.info(`Initiated vote ${roundId}, required weight: ${requiredWeight}/${this.currentQuorum.totalWeight}`);

    return {
      voteId: roundId,
      proposal,
      requiredWeight,
      totalWeight: this.currentQuorum.totalWeight,
      eligibleVoters: this.getActiveMembers().length,
      timeout
    };
  }

  private async adjustQuorumThreshold(decision: AgentDecision): Promise<any> {
    const newThreshold = decision.reasoning.factors.find(f => f.name === 'new-threshold')?.value;
    
    if (!newThreshold || newThreshold < 0.5 || newThreshold > 1.0) {
      throw new Error('Invalid threshold value, must be between 0.5 and 1.0');
    }

    const oldThreshold = this.currentQuorum.threshold;
    
    // Require supermajority for threshold changes
    const thresholdChangeVote = await this.initiateVote({
      id: 'threshold-change',
      agentId: this.id.id,
      timestamp: new Date(),
      action: 'initiate-vote',
      reasoning: {
        factors: [
          { name: 'proposal', weight: 1, value: { type: 'threshold-change', oldThreshold, newThreshold }, impact: 'critical', explanation: 'Quorum threshold adjustment' },
          { name: 'threshold', weight: 1, value: this.membershipChangeThreshold, impact: 'critical', explanation: 'Supermajority required for threshold changes' }
        ],
        heuristics: [],
        evidence: []
      },
      confidence: 0.9,
      alternatives: [],
      risks: [],
      recommendations: []
    });

    this.logger.info(`Initiated threshold change vote from ${oldThreshold} to ${newThreshold}`);

    return {
      oldThreshold,
      newThreshold,
      voteId: thresholdChangeVote.voteId,
      status: 'pending-vote'
    };
  }

  private async addMember(decision: AgentDecision): Promise<any> {
    const memberId = decision.reasoning.factors.find(f => f.name === 'member-id')?.value;
    const weight = decision.reasoning.factors.find(f => f.name === 'weight')?.value || 1;
    const reason = decision.reasoning.factors.find(f => f.name === 'reason')?.value || 'New member addition';

    if (!memberId) {
      throw new Error('Member ID required for addition');
    }

    if (this.currentQuorum.members.has(memberId)) {
      throw new Error(`Member ${memberId} already exists in quorum`);
    }

    // Create membership change proposal
    const changeId = `add-member-${memberId}-${Date.now()}`;
    const membershipChange: MembershipChange = {
      type: 'add',
      memberId,
      newWeight: weight,
      reason,
      proposer: this.id.id,
      timestamp: new Date(),
      approved: false
    };

    this.membershipChanges.set(changeId, membershipChange);

    // Initiate vote for membership change
    const membershipVote = await this.initiateVote({
      id: 'membership-vote',
      agentId: this.id.id,
      timestamp: new Date(),
      action: 'initiate-vote',
      reasoning: {
        factors: [
          { name: 'proposal', weight: 1, value: membershipChange, impact: 'high', explanation: 'Membership addition proposal' },
          { name: 'threshold', weight: 1, value: this.membershipChangeThreshold, impact: 'high', explanation: 'Supermajority required for membership changes' }
        ],
        heuristics: [],
        evidence: []
      },
      confidence: 0.8,
      alternatives: [],
      risks: [],
      recommendations: []
    });

    this.logger.info(`Initiated membership addition vote for ${memberId} with weight ${weight}`);

    return {
      memberId,
      weight,
      changeId,
      voteId: membershipVote.voteId,
      status: 'pending-vote'
    };
  }

  private async removeMember(decision: AgentDecision): Promise<any> {
    const memberId = decision.reasoning.factors.find(f => f.name === 'member-id')?.value;
    const reason = decision.reasoning.factors.find(f => f.name === 'reason')?.value || 'Member removal';

    if (!memberId) {
      throw new Error('Member ID required for removal');
    }

    const member = this.currentQuorum.members.get(memberId);
    if (!member) {
      throw new Error(`Member ${memberId} not found in quorum`);
    }

    // Create membership change proposal
    const changeId = `remove-member-${memberId}-${Date.now()}`;
    const membershipChange: MembershipChange = {
      type: 'remove',
      memberId,
      reason,
      proposer: this.id.id,
      timestamp: new Date(),
      approved: false
    };

    this.membershipChanges.set(changeId, membershipChange);

    // Initiate vote for membership change (excluding the member being removed)
    const membershipVote = await this.initiateVote({
      id: 'membership-removal-vote',
      agentId: this.id.id,
      timestamp: new Date(),
      action: 'initiate-vote',
      reasoning: {
        factors: [
          { name: 'proposal', weight: 1, value: membershipChange, impact: 'high', explanation: 'Membership removal proposal' },
          { name: 'threshold', weight: 1, value: this.membershipChangeThreshold, impact: 'high', explanation: 'Supermajority required for membership changes' }
        ],
        heuristics: [],
        evidence: []
      },
      confidence: 0.8,
      alternatives: [],
      risks: [],
      recommendations: []
    });

    this.logger.info(`Initiated membership removal vote for ${memberId}`);

    return {
      memberId,
      reason,
      changeId,
      voteId: membershipVote.voteId,
      currentWeight: member.weight,
      status: 'pending-vote'
    };
  }

  private async updateMemberWeight(decision: AgentDecision): Promise<any> {
    const memberId = decision.reasoning.factors.find(f => f.name === 'member-id')?.value;
    const newWeight = decision.reasoning.factors.find(f => f.name === 'new-weight')?.value;
    const reason = decision.reasoning.factors.find(f => f.name === 'reason')?.value || 'Weight update';

    if (!memberId || newWeight === undefined) {
      throw new Error('Member ID and new weight required');
    }

    const member = this.currentQuorum.members.get(memberId);
    if (!member) {
      throw new Error(`Member ${memberId} not found in quorum`);
    }

    const oldWeight = member.weight;

    // Create membership change proposal
    const changeId = `update-weight-${memberId}-${Date.now()}`;
    const membershipChange: MembershipChange = {
      type: 'update-weight',
      memberId,
      newWeight,
      reason,
      proposer: this.id.id,
      timestamp: new Date(),
      approved: false
    };

    this.membershipChanges.set(changeId, membershipChange);

    // Initiate vote for weight change
    const weightVote = await this.initiateVote({
      id: 'weight-update-vote',
      agentId: this.id.id,
      timestamp: new Date(),
      action: 'initiate-vote',
      reasoning: {
        factors: [
          { name: 'proposal', weight: 1, value: membershipChange, impact: 'medium', explanation: 'Member weight update proposal' },
          { name: 'threshold', weight: 1, value: this.defaultThreshold, impact: 'medium', explanation: 'Simple majority for weight changes' }
        ],
        heuristics: [],
        evidence: []
      },
      confidence: 0.8,
      alternatives: [],
      risks: [],
      recommendations: []
    });

    this.logger.info(`Initiated weight update vote for ${memberId}: ${oldWeight} → ${newWeight}`);

    return {
      memberId,
      oldWeight,
      newWeight,
      changeId,
      voteId: weightVote.voteId,
      status: 'pending-vote'
    };
  }

  // Voting Resolution

  private async resolveVote(voteId: string): Promise<void> {
    const vote = this.activeVotingRounds.get(voteId);
    if (!vote || vote.status !== 'active') {
      return;
    }

    const now = new Date();
    vote.endTime = now;

    // Calculate vote outcome
    const outcome = this.calculateVoteOutcome(vote);
    vote.status = outcome.passed ? 'passed' : (outcome.timedOut ? 'timeout' : 'failed');

    this.logger.info(`Vote ${voteId} resolved: ${vote.status}, weight: ${vote.currentWeight}/${vote.requiredWeight}`);

    // Apply vote result if passed
    if (outcome.passed) {
      await this.applyVoteResult(vote);
    }

    // Move to history
    this.votingHistory.push(vote);
    this.activeVotingRounds.delete(voteId);

    // Store vote result
    await this.memory.store(`quorum:vote:${voteId}`, {
      vote,
      outcome,
      timestamp: now
    }, {
      type: 'decision' as const,
      tags: ['quorum', 'vote', 'resolution'],
      partition: 'consensus'
    });

    // Emit vote completion event
    this.eventBus.emit('quorum:vote:resolved', {
      voteId,
      status: vote.status,
      outcome,
      quorumManager: this.id
    });
  }

  private calculateVoteOutcome(vote: VotingRound): any {
    const totalYesWeight = Array.from(vote.votes.values())
      .filter(v => v.decision === 'yes')
      .reduce((sum, v) => sum + v.weight, 0);

    const totalNoWeight = Array.from(vote.votes.values())
      .filter(v => v.decision === 'no')
      .reduce((sum, v) => sum + v.weight, 0);

    const abstainWeight = Array.from(vote.votes.values())
      .filter(v => v.decision === 'abstain')
      .reduce((sum, v) => sum + v.weight, 0);

    const totalVoteWeight = totalYesWeight + totalNoWeight + abstainWeight;
    const passed = totalYesWeight >= vote.requiredWeight;
    const timedOut = Date.now() - vote.startTime.getTime() >= vote.timeout;

    return {
      passed,
      timedOut,
      totalYesWeight,
      totalNoWeight,
      abstainWeight,
      totalVoteWeight,
      requiredWeight: vote.requiredWeight,
      participation: totalVoteWeight / this.currentQuorum.totalWeight
    };
  }

  private async applyVoteResult(vote: VotingRound): Promise<void> {
    const proposal = vote.proposal;

    switch (proposal.type) {
      case 'threshold-change':
        await this.applyThresholdChange(proposal);
        break;
      case 'add':
        await this.applyMemberAddition(proposal);
        break;
      case 'remove':
        await this.applyMemberRemoval(proposal);
        break;
      case 'update-weight':
        await this.applyWeightUpdate(proposal);
        break;
      default:
        await this.applyGenericProposal(proposal);
    }
  }

  private async applyThresholdChange(proposal: any): Promise<void> {
    const oldThreshold = this.currentQuorum.threshold;
    this.currentQuorum.threshold = proposal.newThreshold;
    this.currentQuorum.lastModified = new Date();
    this.recalculateRequiredWeight();

    this.logger.info(`Applied threshold change: ${oldThreshold} → ${proposal.newThreshold}`);
  }

  private async applyMemberAddition(proposal: MembershipChange): Promise<void> {
    const newMember: QuorumMember = {
      id: proposal.memberId,
      weight: proposal.newWeight || 1,
      status: 'active',
      lastHeartbeat: new Date(),
      votes: new Map(),
      reliability: 1.0,
      joinTime: new Date(),
      reputation: 0.5
    };

    this.currentQuorum.members.set(proposal.memberId, newMember);
    this.currentQuorum.totalWeight += newMember.weight;
    this.currentQuorum.lastModified = new Date();
    this.recalculateRequiredWeight();

    proposal.approved = true;

    this.logger.info(`Added member ${proposal.memberId} with weight ${newMember.weight}`);
  }

  private async applyMemberRemoval(proposal: MembershipChange): Promise<void> {
    const member = this.currentQuorum.members.get(proposal.memberId);
    if (member) {
      this.currentQuorum.totalWeight -= member.weight;
      this.currentQuorum.members.delete(proposal.memberId);
      this.currentQuorum.lastModified = new Date();
      this.recalculateRequiredWeight();

      proposal.approved = true;

      this.logger.info(`Removed member ${proposal.memberId}`);
    }
  }

  private async applyWeightUpdate(proposal: MembershipChange): Promise<void> {
    const member = this.currentQuorum.members.get(proposal.memberId);
    if (member && proposal.newWeight !== undefined) {
      const oldWeight = member.weight;
      this.currentQuorum.totalWeight = this.currentQuorum.totalWeight - oldWeight + proposal.newWeight;
      member.weight = proposal.newWeight;
      this.currentQuorum.lastModified = new Date();
      this.recalculateRequiredWeight();

      proposal.approved = true;

      this.logger.info(`Updated member ${proposal.memberId} weight: ${oldWeight} → ${proposal.newWeight}`);
    }
  }

  // Utility Methods

  private recalculateRequiredWeight(): void {
    this.currentQuorum.requiredWeight = this.calculateRequiredWeight(this.currentQuorum.threshold);
  }

  private calculateRequiredWeight(threshold: number): number {
    return Math.ceil(this.currentQuorum.totalWeight * threshold);
  }

  private getActiveMembers(): QuorumMember[] {
    return Array.from(this.currentQuorum.members.values())
      .filter(member => member.status === 'active');
  }

  private async notifyMembersOfVote(voteId: string, proposal: any, timeout: number): Promise<void> {
    const notification = {
      type: 'vote-notification',
      voteId,
      proposal,
      timeout,
      requiredWeight: this.currentQuorum.requiredWeight,
      totalWeight: this.currentQuorum.totalWeight,
      startTime: new Date()
    };

    // Store notification for members to retrieve
    await this.memory.store(`quorum:vote-notification:${voteId}`, notification, {
      type: 'conversation',
      tags: ['quorum', 'vote', 'notification'],
      partition: 'voting',
      ttl: timeout + 5000 // Slightly longer than vote timeout
    });

    // Emit event for real-time processing
    this.eventBus.emit('quorum:vote:initiated', {
      voteId,
      proposal,
      eligibleVoters: this.getActiveMembers().map(m => m.id),
      quorumManager: this.id
    });
  }

  // Assessment Methods

  private getQuorumStatus(): any {
    const members = Array.from(this.currentQuorum.members.values());
    const activeMembers = members.filter(m => m.status === 'active');
    const totalActiveWeight = activeMembers.reduce((sum, m) => sum + m.weight, 0);

    return {
      totalMembers: members.length,
      activeMembers: activeMembers.length,
      totalWeight: this.currentQuorum.totalWeight,
      activeWeight: totalActiveWeight,
      requiredWeight: this.currentQuorum.requiredWeight,
      threshold: this.currentQuorum.threshold,
      canAchieveQuorum: totalActiveWeight >= this.currentQuorum.requiredWeight
    };
  }

  private assessMembershipHealth(): any {
    const members = Array.from(this.currentQuorum.members.values());
    const currentTime = new Date();
    
    const healthyMembers = members.filter(m => 
      m.status === 'active' && 
      currentTime.getTime() - m.lastHeartbeat.getTime() < this.heartbeatTimeout
    );
    
    const avgReliability = members.length > 0 ? 
      members.reduce((sum, m) => sum + m.reliability, 0) / members.length : 0;
    
    const healthScore = healthyMembers.length / Math.max(members.length, 1);

    return {
      healthyMembers: healthyMembers.length,
      totalMembers: members.length,
      healthScore,
      averageReliability: avgReliability,
      staleMembers: members.filter(m => 
        currentTime.getTime() - m.lastHeartbeat.getTime() >= this.heartbeatTimeout
      ).length
    };
  }

  private getActiveVotingStatus(): any {
    const activeVotes = Array.from(this.activeVotingRounds.values());
    const totalParticipation = activeVotes.reduce((sum, vote) => {
      const voteWeight = Array.from(vote.votes.values())
        .reduce((voteSum, v) => voteSum + v.weight, 0);
      return sum + (voteWeight / this.currentQuorum.totalWeight);
    }, 0);

    return {
      count: activeVotes.length,
      averageParticipation: activeVotes.length > 0 ? totalParticipation / activeVotes.length : 0,
      oldestVoteAge: activeVotes.length > 0 ? 
        Math.max(...activeVotes.map(v => Date.now() - v.startTime.getTime())) : 0
    };
  }

  private getPendingMembershipChanges(): any {
    const pending = Array.from(this.membershipChanges.values())
      .filter(change => !change.approved);

    return {
      count: pending.length,
      types: pending.reduce((acc, change) => {
        acc[change.type] = (acc[change.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
  }

  private assessQuorumViability(): any {
    const status = this.getQuorumStatus();
    const memberHealth = this.assessMembershipHealth();
    
    // Calculate viability score based on multiple factors
    let score = 0;
    
    // Can achieve quorum (40% weight)
    if (status.canAchieveQuorum) score += 0.4;
    
    // Member health (30% weight)
    score += memberHealth.healthScore * 0.3;
    
    // Weight distribution (20% weight) - avoid single points of failure
    const weightDistribution = this.calculateWeightDistribution();
    score += (1 - weightDistribution.concentration) * 0.2;
    
    // Recent activity (10% weight)
    const recentActivity = this.assessRecentActivity();
    score += recentActivity * 0.1;

    return {
      score,
      canAchieveQuorum: status.canAchieveQuorum,
      healthScore: memberHealth.healthScore,
      weightDistribution,
      recentActivity
    };
  }

  private calculateWeightDistribution(): any {
    const members = Array.from(this.currentQuorum.members.values());
    const weights = members.map(m => m.weight);
    const totalWeight = this.currentQuorum.totalWeight;
    
    // Calculate Gini coefficient for weight concentration
    const sortedWeights = weights.sort((a, b) => a - b);
    const n = sortedWeights.length;
    let gini = 0;
    
    if (n > 0 && totalWeight > 0) {
      for (let i = 0; i < n; i++) {
        gini += (2 * (i + 1) - n - 1) * sortedWeights[i];
      }
      gini = gini / (n * totalWeight);
    }

    return {
      concentration: Math.abs(gini), // Higher means more concentrated
      maxWeight: Math.max(...weights),
      minWeight: Math.min(...weights),
      averageWeight: totalWeight / Math.max(n, 1)
    };
  }

  private assessRecentActivity(): number {
    const recentVotes = this.votingHistory.filter(vote => 
      Date.now() - vote.startTime.getTime() < 300000 // Last 5 minutes
    );
    
    return Math.min(recentVotes.length / 5, 1.0); // Normalize to 0-1
  }

  private detectNetworkPartitions(): any {
    const members = Array.from(this.currentQuorum.members.values());
    const currentTime = new Date();
    
    const reachableMembers = members.filter(m => 
      currentTime.getTime() - m.lastHeartbeat.getTime() < this.heartbeatTimeout
    );
    
    const reachableWeight = reachableMembers.reduce((sum, m) => sum + m.weight, 0);
    const partitionDetected = reachableWeight < this.currentQuorum.requiredWeight;

    return {
      detected: partitionDetected,
      reachableMembers: reachableMembers.length,
      reachableWeight,
      requiredWeight: this.currentQuorum.requiredWeight,
      severity: partitionDetected ? 
        (reachableWeight / this.currentQuorum.requiredWeight < 0.5 ? 'high' : 'medium') : 'none'
    };
  }

  private assessVotingLoad(): any {
    const activeVotes = this.activeVotingRounds.size;
    const recentVotes = this.votingHistory.filter(vote => 
      Date.now() - vote.startTime.getTime() < 60000 // Last minute
    ).length;
    
    const efficiency = this.calculateVotingEfficiency({
      activeVotes: { count: activeVotes },
      quorumStatus: this.getQuorumStatus()
    });

    return {
      activeVotes,
      recentVotes,
      efficiency,
      load: activeVotes / Math.max(this.currentQuorum.members.size, 1)
    };
  }

  // Action Selection and Decision Making

  private selectQuorumAction(observation: any): string {
    // Prioritize actions based on quorum health and voting needs
    
    if (!observation.quorumViability.canAchieveQuorum) {
      if (observation.membershipHealth.staleMembers > 0) {
        return 'remove-member'; // Remove stale members
      }
      return 'reconfigure-quorum';
    }

    if (observation.consensusRequests.length > 0) {
      return 'initiate-vote';
    }

    if (observation.activeVotes.oldestVoteAge > this.maxVotingTime * 2) {
      return 'force-vote-resolution';
    }

    if (observation.quorumViability.score < 0.6) {
      return 'adjust-quorum-threshold';
    }

    if (observation.pendingMembershipChanges.count > 0) {
      return 'initiate-vote'; // Process pending membership changes
    }

    return 'monitor-quorum';
  }

  private calculateVotingEfficiency(observation: any): number {
    const activeVotes = observation.activeVotes.count;
    const participationRate = observation.activeVotes.averageParticipation || 0;
    const quorumHealth = observation.quorumStatus?.canAchieveQuorum ? 1 : 0;
    
    // Efficiency is high when we have good participation and can achieve quorum
    return (participationRate * 0.7 + quorumHealth * 0.3) * 
           (activeVotes === 0 ? 1 : Math.max(0.1, 1 - activeVotes * 0.1));
  }

  // State Management

  private async loadQuorumConfiguration(): Promise<void> {
    try {
      const config = await this.memory.retrieve(`quorum:config:${this.id.id}`);
      if (config) {
        this.currentQuorum = {
          ...config,
          members: new Map(config.members || []),
          created: new Date(config.created),
          lastModified: new Date(config.lastModified)
        };
      }
    } catch (error) {
      this.logger.warn('No previous quorum configuration found, using defaults');
    }
  }

  private async loadMembershipData(): Promise<void> {
    try {
      const membershipData = await this.memory.retrieve('quorum:membership');
      if (membershipData) {
        this.membershipChanges = new Map(membershipData.changes || []);
        this.votingHistory = membershipData.votingHistory || [];
      }
    } catch (error) {
      this.logger.warn('No previous membership data found');
    }
  }

  private setupQuorumEventHandlers(): void {
    this.eventBus.on('quorum:vote:cast', async (data) => {
      await this.handleVoteCast(data);
    });

    this.eventBus.on('quorum:member:heartbeat', async (data) => {
      await this.handleMemberHeartbeat(data);
    });
  }

  private startQuorumMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      await this.performQuorumHealthCheck();
    }, 30000); // Every 30 seconds
  }

  private async handleVoteCast(data: any): Promise<void> {
    const { voteId, voterId, decision, reasoning } = data;
    const vote = this.activeVotingRounds.get(voteId);
    const member = this.currentQuorum.members.get(voterId);
    
    if (vote && member && vote.status === 'active') {
      const voteInfo: VoteInfo = {
        voterId,
        decision,
        weight: member.weight,
        timestamp: new Date(),
        reasoning
      };
      
      vote.votes.set(voterId, voteInfo);
      vote.currentWeight = Array.from(vote.votes.values())
        .reduce((sum, v) => sum + v.weight, 0);
      
      // Check if quorum is reached
      if (vote.currentWeight >= vote.requiredWeight) {
        await this.resolveVote(voteId);
      }
    }
  }

  private async handleMemberHeartbeat(data: any): Promise<void> {
    const { memberId, timestamp } = data;
    const member = this.currentQuorum.members.get(memberId);
    
    if (member) {
      member.lastHeartbeat = new Date(timestamp);
      member.status = 'active';
      member.reliability = Math.min(1.0, member.reliability + 0.01);
    }
  }

  private async performQuorumHealthCheck(): Promise<void> {
    const currentTime = new Date();
    
    // Check for stale members
    for (const [memberId, member] of this.currentQuorum.members) {
      const timeSinceHeartbeat = currentTime.getTime() - member.lastHeartbeat.getTime();
      
      if (timeSinceHeartbeat > this.heartbeatTimeout) {
        member.status = 'inactive';
        member.reliability = Math.max(0, member.reliability - 0.05);
        
        if (timeSinceHeartbeat > this.heartbeatTimeout * 3) {
          member.status = 'suspected';
        }
      }
    }
    
    // Store health check results
    await this.memory.store(`quorum:health:${Date.now()}`, {
      quorumStatus: this.getQuorumStatus(),
      membershipHealth: this.assessMembershipHealth(),
      timestamp: currentTime
    }, {
      type: 'metric',
      tags: ['quorum', 'health', 'monitoring'],
      partition: 'monitoring'
    });
  }

  private getQuorumSnapshot(): any {
    return {
      currentQuorum: {
        ...this.currentQuorum,
        members: Array.from(this.currentQuorum.members.entries())
      },
      activeVotingRounds: Array.from(this.activeVotingRounds.entries()),
      membershipChanges: Array.from(this.membershipChanges.entries()),
      votingHistory: this.votingHistory.slice(-10) // Last 10 votes
    };
  }

  // Alternative generation and risk assessment

  private generateQuorumAlternatives(observation: any, selectedAction: string): Alternative[] {
    const alternatives: Alternative[] = [];
    
    if (selectedAction !== 'adjust-quorum-threshold') {
      alternatives.push({
        action: 'adjust-quorum-threshold',
        confidence: 0.6,
        pros: ['May improve consensus speed', 'Adapts to current conditions'],
        cons: ['May compromise security', 'Requires supermajority'],
        reason: 'Adaptive threshold management'
      });
    }
    
    if (selectedAction !== 'reconfigure-quorum') {
      alternatives.push({
        action: 'reconfigure-quorum',
        confidence: 0.7,
        pros: ['Comprehensive solution', 'Addresses systemic issues'],
        cons: ['Disruptive to ongoing processes', 'Complex coordination'],
        reason: 'Complete quorum restructuring'
      });
    }
    
    return alternatives;
  }

  private assessQuorumRisks(observation: any, action: string): Risk[] {
    const risks: Risk[] = [];
    
    if (!observation.quorumViability.canAchieveQuorum) {
      risks.push({
        id: 'quorum-unavailable',
        type: 'availability',
        category: 'consensus',
        severity: 'critical',
        probability: 0.9,
        impact: 'critical',
        description: 'Cannot achieve quorum for decision making',
        mitigation: 'Add members or reduce threshold temporarily'
      });
    }
    
    if (observation.networkPartitions.detected) {
      risks.push({
        id: 'network-partition',
        type: 'network',
        category: 'availability',
        severity: 'high',
        probability: 0.8,
        impact: 'high',
        description: 'Network partition affecting member connectivity',
        mitigation: 'Wait for partition healing or emergency procedures'
      });
    }
    
    return risks;
  }

  private generateQuorumRecommendations(observation: any): string[] {
    const recommendations = [];
    
    if (observation.quorumViability.score < 0.5) {
      recommendations.push('Consider adding more members to improve quorum viability');
    }
    
    if (observation.activeVotes.averageParticipation < 0.7) {
      recommendations.push('Improve member engagement and voting participation');
    }
    
    if (observation.membershipHealth.staleMembers > 0) {
      recommendations.push('Remove or update stale members to maintain quorum health');
    }
    
    return recommendations;
  }

  // Learning and optimization methods

  private async analyzeVotingPatterns(results: any): Promise<void> {
    // Analyze voting patterns to optimize quorum parameters
  }

  private async refineQuorumStrategy(adjustments: any): Promise<void> {
    // Refine quorum strategy based on adjustment outcomes
  }

  private async updateMemberReliability(reliability: any): Promise<void> {
    // Update member reliability models based on performance
  }

  // Placeholder implementations

  private async forceVoteResolution(decision: AgentDecision): Promise<any> {
    const voteId = decision.reasoning.factors.find(f => f.name === 'vote-id')?.value;
    if (voteId) {
      await this.resolveVote(voteId);
      return { voteId, status: 'forced-resolution', timestamp: new Date() };
    }
    return { error: 'No vote ID specified' };
  }

  private async reconfigureQuorum(decision: AgentDecision): Promise<any> {
    return { status: 'quorum-reconfigured', timestamp: new Date() };
  }

  private async applyGenericProposal(proposal: any): Promise<void> {
    this.logger.info(`Applied generic proposal: ${JSON.stringify(proposal)}`);
  }

  private async handleGenericQuorumAction(action: string, decision: AgentDecision): Promise<any> {
    this.logger.warn(`Unhandled quorum action: ${action}`);
    return { status: 'action-not-implemented', action, timestamp: new Date() };
  }

  private generateDecisionId(): string {
    return `quorum-decision-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}