/**
 * Raft Consensus Manager Agent
 * Implements Raft consensus algorithm with leader election, log replication, and safety
 * Provides strong consistency for distributed QE coordination
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

type RaftState = 'follower' | 'candidate' | 'leader';

interface RaftNode {
  id: string;
  state: RaftState;
  currentTerm: number;
  votedFor: string | null;
  lastHeartbeat: Date;
  nextIndex: number;
  matchIndex: number;
  voteCount: number;
}

interface LogEntry {
  term: number;
  index: number;
  command: any;
  timestamp: Date;
  committed: boolean;
}

interface RaftMessage {
  type: 'requestVote' | 'voteResponse' | 'appendEntries' | 'appendResponse';
  term: number;
  senderId: string;
  candidateId?: string;
  lastLogIndex?: number;
  lastLogTerm?: number;
  prevLogIndex?: number;
  prevLogTerm?: number;
  entries?: LogEntry[];
  leaderCommit?: number;
  success?: boolean;
  voteGranted?: boolean;
}

interface ElectionState {
  inProgress: boolean;
  startTime: Date;
  votesReceived: number;
  votesNeeded: number;
  timeout: number;
}

export class RaftManager extends BaseAgent {
  private currentState: RaftState = 'follower';
  private currentTerm: number = 0;
  private votedFor: string | null = null;
  private leaderId: string | null = null;
  private log: LogEntry[] = [];
  private commitIndex: number = 0;
  private lastApplied: number = 0;
  private nodes: Map<string, RaftNode> = new Map();
  private electionState: ElectionState;
  private electionTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly minElectionTimeout = 150;
  private readonly maxElectionTimeout = 300;
  private readonly heartbeatInterval_ms = 50;

  constructor(
    id: AgentId,
    config: AgentConfig,
    logger: ILogger,
    eventBus: IEventBus,
    memory: IMemorySystem
  ) {
    super(id, config, logger, eventBus, memory);
    
    this.electionState = {
      inProgress: false,
      startTime: new Date(),
      votesReceived: 0,
      votesNeeded: 0,
      timeout: this.randomElectionTimeout()
    };
  }

  protected async initializeResources(): Promise<void> {
    await this.loadRaftState();
    await this.loadClusterConfiguration();
    this.setupRaftEventHandlers();
    this.startElection();
    
    this.logger.info(`Raft manager initialized as ${this.currentState}, term: ${this.currentTerm}`);
  }

  protected async perceive(context: any): Promise<any> {
    return {
      currentState: this.currentState,
      currentTerm: this.currentTerm,
      leaderId: this.leaderId,
      logSize: this.log.length,
      commitIndex: this.commitIndex,
      clusterSize: this.nodes.size,
      pendingMessages: context.pendingMessages || [],
      leaderElectionStatus: this.getElectionStatus(),
      logReplicationStatus: this.getLogReplicationStatus(),
      nodeHealth: this.assessNodeHealth()
    };
  }

  protected async decide(observation: any): Promise<AgentDecision> {
    const factors: ReasoningFactor[] = [
      {
        name: 'leadership-status',
        weight: 0.3,
        value: this.currentState === 'leader' ? 1 : 0,
        impact: 'critical',
        explanation: 'Current leadership status in Raft cluster'
      },
      {
        name: 'term-currency',
        weight: 0.2,
        value: this.isTermCurrent(observation),
        impact: 'high',
        explanation: 'Whether current term is up-to-date with cluster'
      },
      {
        name: 'log-consistency',
        weight: 0.25,
        value: this.assessLogConsistency(),
        impact: 'critical',
        explanation: 'Consistency of log entries across cluster'
      },
      {
        name: 'cluster-availability',
        weight: 0.25,
        value: observation.nodeHealth.availability,
        impact: 'high',
        explanation: 'Availability of cluster nodes for consensus'
      }
    ];

    const evidence: Evidence[] = [
      {
        type: 'empirical',
        source: 'raft-state',
        confidence: 1.0,
        description: `Current state: ${this.currentState}, term: ${this.currentTerm}`,
        details: { state: this.currentState, term: this.currentTerm, leaderId: this.leaderId }
      },
      {
        type: 'analytical',
        source: 'log-analysis',
        confidence: 0.9,
        description: `Log entries: ${this.log.length}, committed: ${this.commitIndex}`,
        details: this.getLogMetrics()
      }
    ];

    const action = this.selectRaftAction(observation);
    const alternatives = this.generateRaftAlternatives(observation, action);
    const risks = this.assessRaftRisks(observation, action);

    const reasoning: ExplainableReasoning = this.buildReasoning(
      factors,
      ['SFDIPOT', 'RCRCRC'],
      evidence,
      ['Raft safety properties', 'Majority quorum required'],
      ['Network partitions may affect availability']
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
      recommendations: this.generateRaftRecommendations(observation)
    };
  }

  protected async act(decision: AgentDecision): Promise<any> {
    const action = decision.action;
    let result: any = {};

    switch (action) {
      case 'start-election':
        result = await this.startElection();
        break;

      case 'append-entries':
        result = await this.appendEntries(decision);
        break;

      case 'replicate-log':
        result = await this.replicateLog(decision);
        break;

      case 'commit-entries':
        result = await this.commitLogEntries(decision);
        break;

      case 'handle-vote-request':
        result = await this.handleVoteRequest(decision);
        break;

      case 'step-down-leader':
        result = await this.stepDownAsLeader(decision);
        break;

      default:
        result = await this.handleGenericRaftAction(action, decision);
    }

    // Persist Raft state
    await this.persistRaftState();

    // Store action result
    await this.memory.store(`raft:action:${decision.id}`, {
      decision,
      result,
      raftState: this.getRaftState(),
      timestamp: new Date()
    }, {
      type: 'decision' as const,
      tags: ['raft', 'consensus', 'replication'],
      partition: 'consensus'
    });

    return result;
  }

  protected async learn(feedback: any): Promise<void> {
    // Learn from election outcomes
    if (feedback.electionResult) {
      await this.updateElectionStrategy(feedback.electionResult);
    }

    // Learn from log replication efficiency
    if (feedback.replicationMetrics) {
      await this.optimizeReplication(feedback.replicationMetrics);
    }

    // Update leadership patterns
    if (feedback.leadershipPattern) {
      await this.refineLeadershipBehavior(feedback.leadershipPattern);
    }

    this.metrics.learningProgress = Math.min(1.0, this.metrics.learningProgress + 0.03);
  }

  // Raft Algorithm Implementation

  private async startElection(): Promise<any> {
    this.currentTerm++;
    this.currentState = 'candidate';
    this.votedFor = this.id.id;
    this.leaderId = null;
    
    this.electionState = {
      inProgress: true,
      startTime: new Date(),
      votesReceived: 1, // Vote for self
      votesNeeded: Math.floor(this.nodes.size / 2) + 1,
      timeout: this.randomElectionTimeout()
    };

    this.logger.info(`Starting election for term ${this.currentTerm}`);

    // Send RequestVote RPCs to all other nodes
    const lastLogIndex = this.log.length - 1;
    const lastLogTerm = this.log.length > 0 ? this.log[lastLogIndex].term : 0;

    const voteRequest: RaftMessage = {
      type: 'requestVote',
      term: this.currentTerm,
      senderId: this.id.id,
      candidateId: this.id.id,
      lastLogIndex,
      lastLogTerm
    };

    await this.broadcastToCluster(voteRequest);

    // Set election timeout
    this.resetElectionTimer();

    return {
      term: this.currentTerm,
      state: this.currentState,
      votesNeeded: this.electionState.votesNeeded,
      votesReceived: this.electionState.votesReceived
    };
  }

  private async appendEntries(decision: AgentDecision): Promise<any> {
    if (this.currentState !== 'leader') {
      throw new Error('Only leader can append entries');
    }

    const command = decision.reasoning.factors.find(f => f.name === 'command')?.value;
    
    const entry: LogEntry = {
      term: this.currentTerm,
      index: this.log.length,
      command,
      timestamp: new Date(),
      committed: false
    };

    this.log.push(entry);

    this.logger.info(`Leader appended entry ${entry.index} for term ${entry.term}`);

    // Start replication to followers
    await this.replicateToFollowers();

    return {
      entryIndex: entry.index,
      term: entry.term,
      logSize: this.log.length,
      replicationStarted: true
    };
  }

  private async replicateLog(decision: AgentDecision): Promise<any> {
    if (this.currentState !== 'leader') {
      return { error: 'Not a leader' };
    }

    let replicationResults = [];
    
    for (const [nodeId, node] of this.nodes) {
      if (nodeId === this.id.id) continue;

      const prevLogIndex = node.nextIndex - 1;
      const prevLogTerm = prevLogIndex >= 0 ? this.log[prevLogIndex].term : 0;
      const entries = this.log.slice(node.nextIndex);

      const appendMessage: RaftMessage = {
        type: 'appendEntries',
        term: this.currentTerm,
        senderId: this.id.id,
        prevLogIndex,
        prevLogTerm,
        entries,
        leaderCommit: this.commitIndex
      };

      try {
        await this.sendToNode(nodeId, appendMessage);
        replicationResults.push({ nodeId, status: 'sent' });
      } catch (error) {
        replicationResults.push({ nodeId, status: 'failed', error: (error as Error).message });
      }
    }

    return {
      replicationResults,
      logSize: this.log.length,
      commitIndex: this.commitIndex
    };
  }

  private async commitLogEntries(decision: AgentDecision): Promise<any> {
    if (this.currentState !== 'leader') {
      return { error: 'Only leader can commit entries' };
    }

    let newCommitIndex = this.commitIndex;
    
    // Find highest index that majority has replicated
    for (let i = this.commitIndex + 1; i < this.log.length; i++) {
      if (this.log[i].term !== this.currentTerm) continue;
      
      let replicatedCount = 1; // Leader has it
      
      for (const node of this.nodes.values()) {
        if (node.matchIndex >= i) {
          replicatedCount++;
        }
      }
      
      if (replicatedCount > this.nodes.size / 2) {
        newCommitIndex = i;
      }
    }

    if (newCommitIndex > this.commitIndex) {
      const oldCommitIndex = this.commitIndex;
      this.commitIndex = newCommitIndex;
      
      // Mark entries as committed
      for (let i = oldCommitIndex + 1; i <= newCommitIndex; i++) {
        this.log[i].committed = true;
      }
      
      this.logger.info(`Committed entries ${oldCommitIndex + 1} to ${newCommitIndex}`);
      
      // Apply committed entries
      await this.applyCommittedEntries();
    }

    return {
      oldCommitIndex: this.commitIndex,
      newCommitIndex,
      entriesCommitted: newCommitIndex - this.commitIndex
    };
  }

  private async handleVoteRequest(decision: AgentDecision): Promise<any> {
    const voteRequest = decision.reasoning.factors.find(f => f.name === 'vote-request')?.value as RaftMessage;
    
    let voteGranted = false;
    
    // Check if we should grant vote
    if (voteRequest.term > this.currentTerm) {
      this.currentTerm = voteRequest.term;
      this.votedFor = null;
      this.currentState = 'follower';
    }
    
    if (voteRequest.term === this.currentTerm &&
        (this.votedFor === null || this.votedFor === voteRequest.candidateId) &&
        this.isLogUpToDate(voteRequest)) {
      voteGranted = true;
      this.votedFor = voteRequest.candidateId || null;
      this.resetElectionTimer();
    }

    const voteResponse: RaftMessage = {
      type: 'voteResponse',
      term: this.currentTerm,
      senderId: this.id.id,
      voteGranted
    };

    await this.sendToNode(voteRequest.senderId, voteResponse);

    return {
      voteGranted,
      term: this.currentTerm,
      candidateId: voteRequest.candidateId
    };
  }

  private selectRaftAction(observation: any): string {
    // State-based action selection
    switch (this.currentState) {
      case 'follower':
        if (observation.pendingMessages.some((m: RaftMessage) => m.type === 'requestVote')) {
          return 'handle-vote-request';
        }
        if (this.shouldStartElection()) {
          return 'start-election';
        }
        return 'maintain-follower-state';

      case 'candidate':
        if (this.electionState.votesReceived >= this.electionState.votesNeeded) {
          return 'become-leader';
        }
        if (this.hasElectionTimedOut()) {
          return 'restart-election';
        }
        return 'continue-election';

      case 'leader':
        if (observation.pendingMessages.length > 0) {
          return 'append-entries';
        }
        if (this.hasUncommittedEntries()) {
          return 'commit-entries';
        }
        return 'send-heartbeat';

      default:
        return 'maintain-state';
    }
  }

  private shouldStartElection(): boolean {
    const timeSinceLastHeartbeat = Date.now() - (this.leaderId ? 
      this.nodes.get(this.leaderId)?.lastHeartbeat?.getTime() || 0 : 0);
    return timeSinceLastHeartbeat > this.electionState.timeout;
  }

  private hasElectionTimedOut(): boolean {
    return Date.now() - this.electionState.startTime.getTime() > this.electionState.timeout;
  }

  private hasUncommittedEntries(): boolean {
    return this.commitIndex < this.log.length - 1;
  }

  private isLogUpToDate(request: RaftMessage): boolean {
    const lastLogIndex = this.log.length - 1;
    const lastLogTerm = this.log.length > 0 ? this.log[lastLogIndex].term : 0;
    
    if (request.lastLogTerm! > lastLogTerm) return true;
    if (request.lastLogTerm! === lastLogTerm && request.lastLogIndex! >= lastLogIndex) return true;
    
    return false;
  }

  private async replicateToFollowers(): Promise<void> {
    if (this.currentState !== 'leader') return;
    
    for (const [nodeId, node] of this.nodes) {
      if (nodeId === this.id.id) continue;
      
      const prevLogIndex = node.nextIndex - 1;
      const prevLogTerm = prevLogIndex >= 0 ? this.log[prevLogIndex].term : 0;
      const entries = this.log.slice(node.nextIndex);
      
      const appendMessage: RaftMessage = {
        type: 'appendEntries',
        term: this.currentTerm,
        senderId: this.id.id,
        prevLogIndex,
        prevLogTerm,
        entries,
        leaderCommit: this.commitIndex
      };
      
      await this.sendToNode(nodeId, appendMessage);
    }
  }

  private async applyCommittedEntries(): Promise<void> {
    while (this.lastApplied < this.commitIndex) {
      this.lastApplied++;
      const entry = this.log[this.lastApplied];
      
      // Apply entry to state machine
      await this.applyToStateMachine(entry);
    }
  }

  private async applyToStateMachine(entry: LogEntry): Promise<void> {
    // Store applied entry
    await this.memory.store(`raft:applied:${entry.index}`, {
      entry,
      appliedAt: new Date()
    }, {
      type: 'state',
      tags: ['raft', 'applied', 'state-machine'],
      partition: 'consensus'
    });
  }

  // Utility Methods

  private randomElectionTimeout(): number {
    return this.minElectionTimeout + 
           Math.random() * (this.maxElectionTimeout - this.minElectionTimeout);
  }

  private resetElectionTimer(): void {
    if (this.electionTimeout) {
      clearTimeout(this.electionTimeout);
    }
    
    this.electionTimeout = setTimeout(() => {
      if (this.currentState === 'follower') {
        this.startElection();
      }
    }, this.randomElectionTimeout());
  }

  private startHeartbeatTimer(): void {
    if (this.currentState !== 'leader') return;
    
    this.heartbeatInterval = setInterval(async () => {
      await this.sendHeartbeats();
    }, this.heartbeatInterval_ms);
  }

  private stopHeartbeatTimer(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async sendHeartbeats(): Promise<void> {
    if (this.currentState !== 'leader') return;
    
    for (const nodeId of this.nodes.keys()) {
      if (nodeId === this.id.id) continue;
      
      const heartbeat: RaftMessage = {
        type: 'appendEntries',
        term: this.currentTerm,
        senderId: this.id.id,
        prevLogIndex: this.log.length - 1,
        prevLogTerm: this.log.length > 0 ? this.log[this.log.length - 1].term : 0,
        entries: [],
        leaderCommit: this.commitIndex
      };
      
      await this.sendToNode(nodeId, heartbeat);
    }
  }

  private async broadcastToCluster(message: RaftMessage): Promise<void> {
    await this.memory.store(`raft:broadcast:${Date.now()}`, message, {
      type: 'conversation',
      tags: ['raft', 'broadcast', message.type],
      partition: 'consensus'
    });
    
    this.eventBus.emit('raft:broadcast', {
      message,
      sender: this.id,
      recipients: Array.from(this.nodes.keys())
    });
  }

  private async sendToNode(nodeId: string, message: RaftMessage): Promise<void> {
    await this.memory.store(`raft:message:${nodeId}:${Date.now()}`, message, {
      type: 'conversation',
      tags: ['raft', 'message', message.type, nodeId],
      partition: 'consensus'
    });
    
    this.eventBus.emit('raft:message', {
      message,
      sender: this.id,
      recipient: nodeId
    });
  }

  // State Management

  private async loadRaftState(): Promise<void> {
    try {
      const state = await this.memory.retrieve(`raft:state:${this.id.id}`);
      if (state) {
        this.currentTerm = state.currentTerm || 0;
        this.votedFor = state.votedFor || null;
        this.log = state.log || [];
        this.commitIndex = state.commitIndex || 0;
        this.lastApplied = state.lastApplied || 0;
      }
    } catch (error) {
      this.logger.warn('No previous Raft state found, starting fresh');
    }
  }

  private async persistRaftState(): Promise<void> {
    const state = {
      currentTerm: this.currentTerm,
      votedFor: this.votedFor,
      log: this.log,
      commitIndex: this.commitIndex,
      lastApplied: this.lastApplied,
      timestamp: new Date()
    };
    
    await this.memory.store(`raft:state:${this.id.id}`, state, {
      type: 'state',
      tags: ['raft', 'persistent-state'],
      partition: 'consensus'
    });
  }

  private async loadClusterConfiguration(): Promise<void> {
    try {
      const config = await this.memory.retrieve('raft:cluster-config');
      if (config && config.nodes) {
        for (const nodeData of config.nodes) {
          this.nodes.set(nodeData.id, {
            ...nodeData,
            lastHeartbeat: new Date(nodeData.lastHeartbeat || Date.now()),
            nextIndex: this.log.length,
            matchIndex: 0
          });
        }
      }
    } catch (error) {
      this.logger.warn('No cluster configuration found');
    }
  }

  private setupRaftEventHandlers(): void {
    this.eventBus.on('raft:message', async (data) => {
      if (data.recipient === this.id.id) {
        await this.handleRaftMessage(data.message);
      }
    });
  }

  private async handleRaftMessage(message: RaftMessage): Promise<void> {
    // Update term if behind
    if (message.term > this.currentTerm) {
      this.currentTerm = message.term;
      this.votedFor = null;
      if (this.currentState !== 'follower') {
        this.currentState = 'follower';
        this.stopHeartbeatTimer();
      }
    }
    
    switch (message.type) {
      case 'requestVote':
        await this.processVoteRequest(message);
        break;
      case 'voteResponse':
        await this.processVoteResponse(message);
        break;
      case 'appendEntries':
        await this.processAppendEntries(message);
        break;
      case 'appendResponse':
        await this.processAppendResponse(message);
        break;
    }
  }

  private async processVoteRequest(message: RaftMessage): Promise<void> {
    // Implementation would handle vote request processing
  }

  private async processVoteResponse(message: RaftMessage): Promise<void> {
    if (this.currentState === 'candidate' && message.term === this.currentTerm) {
      if (message.voteGranted) {
        this.electionState.votesReceived++;
        
        if (this.electionState.votesReceived >= this.electionState.votesNeeded) {
          await this.becomeLeader();
        }
      }
    }
  }

  private async processAppendEntries(message: RaftMessage): Promise<void> {
    // Implementation would handle append entries processing
  }

  private async processAppendResponse(message: RaftMessage): Promise<void> {
    // Implementation would handle append entries response
  }

  private async becomeLeader(): Promise<void> {
    this.currentState = 'leader';
    this.leaderId = this.id.id;
    this.electionState.inProgress = false;
    
    // Initialize leader state
    for (const node of this.nodes.values()) {
      node.nextIndex = this.log.length;
      node.matchIndex = 0;
    }
    
    this.startHeartbeatTimer();
    
    this.logger.info(`Became leader for term ${this.currentTerm}`);
    
    // Send initial heartbeats
    await this.sendHeartbeats();
  }

  // Assessment Methods

  private getElectionStatus(): any {
    return {
      inProgress: this.electionState.inProgress,
      votesReceived: this.electionState.votesReceived,
      votesNeeded: this.electionState.votesNeeded,
      currentTerm: this.currentTerm,
      state: this.currentState
    };
  }

  private getLogReplicationStatus(): any {
    return {
      logSize: this.log.length,
      commitIndex: this.commitIndex,
      lastApplied: this.lastApplied,
      uncommittedEntries: this.log.length - this.commitIndex - 1
    };
  }

  private assessNodeHealth(): any {
    const activeNodes = Array.from(this.nodes.values())
      .filter(n => Date.now() - n.lastHeartbeat.getTime() < 10000);
    
    return {
      total: this.nodes.size,
      active: activeNodes.length,
      availability: activeNodes.length / Math.max(this.nodes.size, 1),
      quorumAvailable: activeNodes.length > this.nodes.size / 2
    };
  }

  private isTermCurrent(observation: any): number {
    const maxObservedTerm = Math.max(
      ...observation.pendingMessages
        .map((m: RaftMessage) => m.term)
        .concat([this.currentTerm])
    );
    
    return this.currentTerm === maxObservedTerm ? 1 : 0;
  }

  private assessLogConsistency(): number {
    // Simplified consistency assessment
    const committedRatio = this.commitIndex / Math.max(this.log.length, 1);
    return committedRatio;
  }

  private getLogMetrics(): any {
    return {
      totalEntries: this.log.length,
      committedEntries: this.commitIndex,
      appliedEntries: this.lastApplied,
      uncommittedEntries: this.log.length - this.commitIndex,
      commitRatio: this.commitIndex / Math.max(this.log.length, 1)
    };
  }

  private getRaftState(): any {
    return {
      state: this.currentState,
      term: this.currentTerm,
      votedFor: this.votedFor,
      leaderId: this.leaderId,
      logSize: this.log.length,
      commitIndex: this.commitIndex,
      lastApplied: this.lastApplied,
      nodes: Array.from(this.nodes.entries())
    };
  }

  private generateRaftAlternatives(observation: any, selectedAction: string): Alternative[] {
    const alternatives: Alternative[] = [];
    
    if (selectedAction !== 'start-election' && this.currentState === 'follower') {
      alternatives.push({
        action: 'start-election',
        confidence: 0.7,
        pros: ['Could become leader', 'Restore cluster availability'],
        cons: ['May cause split vote', 'Network overhead'],
        reason: 'Leadership change to improve responsiveness'
      });
    }
    
    return alternatives;
  }

  private assessRaftRisks(observation: any, action: string): Risk[] {
    const risks: Risk[] = [];
    
    if (observation.nodeHealth.availability < 0.6) {
      risks.push({
        id: 'insufficient-quorum',
        type: 'availability',
        category: 'consensus',
        severity: 'high',
        probability: 0.8,
        impact: 'critical',
        description: 'Insufficient nodes for quorum',
        mitigation: 'Wait for more nodes or reconfigure cluster'
      });
    }
    
    return risks;
  }

  private generateRaftRecommendations(observation: any): string[] {
    const recommendations = [];
    
    if (observation.nodeHealth.availability < 0.5) {
      recommendations.push('Consider adding more nodes to improve availability');
    }
    
    if (this.log.length - this.commitIndex > 10) {
      recommendations.push('High number of uncommitted entries, check replication');
    }
    
    return recommendations;
  }

  // Learning Methods

  private async updateElectionStrategy(result: any): Promise<void> {
    // Update election timeout based on success/failure patterns
  }

  private async optimizeReplication(metrics: any): Promise<void> {
    // Optimize replication based on performance metrics
  }

  private async refineLeadershipBehavior(pattern: any): Promise<void> {
    // Refine leadership behavior based on observed patterns
  }

  // Placeholder methods

  private async stepDownAsLeader(decision: AgentDecision): Promise<any> {
    this.currentState = 'follower';
    this.leaderId = null;
    this.stopHeartbeatTimer();
    this.resetElectionTimer();
    
    return { status: 'stepped-down', term: this.currentTerm };
  }

  private async handleGenericRaftAction(action: string, decision: AgentDecision): Promise<any> {
    this.logger.warn(`Unhandled Raft action: ${action}`);
    return { status: 'action-not-implemented', action, timestamp: new Date() };
  }

  private generateDecisionId(): string {
    return `raft-decision-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}