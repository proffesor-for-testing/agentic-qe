/**
 * Voting orchestrator for parallel agent coordination
 * Handles timeout, retries, and result aggregation
 */

import {
  VotingAgent,
  VotingTask,
  Vote,
  VotingResult,
  VotingPanelConfig,
  VotingOrchestrator as IVotingOrchestrator,
  PanelAssemblyResult,
  OrchestrationLog,
  OrchestrationMetrics,
  OrchestrationEvent,
  AgentPool,
  VotingStrategy,
  ConsensusMethod
} from './types';
import { PanelAssembler } from './panel-assembly';
import { majorityConsensus, weightedConsensus } from './consensus';

export class VotingOrchestrator implements IVotingOrchestrator {
  private assembler: PanelAssembler;
  private logs: OrchestrationLog[] = [];
  private votes: Map<string, Vote[]> = new Map();
  private activeVoting: Map<string, Promise<Vote>[]> = new Map();
  private metrics: OrchestrationMetrics = {
    totalTasks: 0,
    successfulVotes: 0,
    failedVotes: 0,
    timeoutVotes: 0,
    averageExecutionTime: 0,
    consensusRate: 0,
    participationRate: 0,
    retryRate: 0
  };

  constructor(
    private readonly pool: AgentPool,
    private readonly strategy: VotingStrategy,
    private readonly voteExecutor: (agent: VotingAgent, task: VotingTask) => Promise<Vote>
  ) {
    this.assembler = new PanelAssembler(pool, strategy);
  }

  /**
   * Assemble voting panel for task
   */
  async assemblePanel(config: VotingPanelConfig): Promise<PanelAssemblyResult> {
    const task: VotingTask = {
      id: `task-${Date.now()}`,
      type: 'panel-assembly',
      description: 'Assemble voting panel',
      context: {},
      priority: 'medium'
    };

    const result = await this.assembler.assemblePanel(task, config);

    this.log(task.id, 'panel-assembled', {
      panelSize: result.panel.length,
      assemblyTime: result.assemblyTime,
      coverage: result.coverage
    });

    return result;
  }

  /**
   * Distribute task to panel and collect votes in parallel
   */
  async distributeTask(task: VotingTask, panel: VotingAgent[]): Promise<void> {
    this.metrics.totalTasks++;
    this.votes.set(task.id, []);

    this.log(task.id, 'voting-started', {
      panelSize: panel.length,
      taskPriority: task.priority
    });

    // Create parallel voting promises
    const votingPromises = panel.map(agent =>
      this.executeVote(agent, task, 1)
    );

    this.activeVoting.set(task.id, votingPromises);
  }

  /**
   * Collect votes with timeout handling
   */
  async collectVotes(taskId: string, timeoutMs: number): Promise<Vote[]> {
    const promises = this.activeVoting.get(taskId);
    if (!promises) {
      throw new Error(`No active voting for task ${taskId}`);
    }

    const votes: Vote[] = [];
    const startTime = Date.now();

    // Create timeout promise
    const timeoutPromise = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Collection timeout')), timeoutMs)
    );

    try {
      // Race between all votes completing and timeout
      await Promise.race([
        Promise.allSettled(promises),
        timeoutPromise
      ]);
    } catch (error) {
      // Timeout occurred, but allSettled is still running
      this.log(taskId, 'vote-timeout', { timeoutMs });
    }

    // Collect results ONCE after race completes or times out
    const results = await Promise.allSettled(promises);
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        votes.push(result.value);
        this.metrics.successfulVotes++;
      } else {
        this.metrics.failedVotes++;
        this.log(taskId, 'vote-failed', {
          error: result.reason?.message
        });
      }
    });

    const executionTime = Date.now() - startTime;
    this.updateAverageExecutionTime(executionTime);

    // Store collected votes
    this.votes.set(taskId, votes);
    this.activeVoting.delete(taskId);

    this.log(taskId, 'result-aggregated', {
      votesCollected: votes.length,
      executionTime
    });

    return votes;
  }

  /**
   * Aggregate voting results using consensus algorithm
   */
  aggregateResults(votes: Vote[], method: ConsensusMethod): VotingResult {
    if (votes.length === 0) {
      throw new Error('No votes to aggregate');
    }

    const taskId = votes[0].taskId;

    // Calculate final score and consensus using simple aggregation
    // NOTE: Direct aggregation used instead of ConsensusFactory due to type compatibility
    let consensusReached = false;
    let finalScore = 0;
    let confidence = 0;

    if (method === 'majority') {
      // Simple majority: average score weighted by confidence
      const weightedSum = votes.reduce((sum, v) => sum + v.score * v.confidence, 0);
      const totalWeight = votes.reduce((sum, v) => sum + v.confidence, 0);
      finalScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
      confidence = totalWeight / votes.length;
      consensusReached = confidence >= 0.6; // 60% confidence threshold
    } else if (method === 'weighted-average') {
      // Weighted average: use agent weights (from Vote metadata)
      const weightedSum = votes.reduce((sum, v) => {
        const weight = (v.metadata?.weight as number) || 1;
        return sum + v.score * v.confidence * weight;
      }, 0);
      const totalWeight = votes.reduce((sum, v) => {
        const weight = (v.metadata?.weight as number) || 1;
        return sum + v.confidence * weight;
      }, 0);
      finalScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
      confidence = totalWeight / votes.length;
      consensusReached = confidence >= 0.6;
    } else {
      // Default fallback to majority
      const weightedSum = votes.reduce((sum, v) => sum + v.score * v.confidence, 0);
      const totalWeight = votes.reduce((sum, v) => sum + v.confidence, 0);
      finalScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
      confidence = totalWeight / votes.length;
      consensusReached = confidence >= 0.6;
    }

    if (consensusReached) {
      this.metrics.consensusRate =
        (this.metrics.consensusRate * (this.metrics.totalTasks - 1) + 1) /
        this.metrics.totalTasks;
    }

    const result: VotingResult = {
      taskId,
      consensusReached,
      finalScore,
      votes,
      aggregationMethod: method,
      executionTime: votes.reduce(
        (max, v) => Math.max(max, v.timestamp.getTime()),
        0
      ) - Math.min(...votes.map(v => v.timestamp.getTime())),
      participationRate: 1.0, // All collected votes participated (100%)
      metadata: {
        totalAgents: votes.length,
        votingAgents: votes.length,
        timedOut: 0,
        failed: 0,
        averageConfidence: votes.reduce((sum, v) => sum + v.confidence, 0) / votes.length
      }
    };

    this.log(taskId, consensusReached ? 'consensus-reached' : 'consensus-failed', {
      finalScore,
      confidence,
      votesCount: votes.length
    });

    return result;
  }

  /**
   * Handle vote timeout
   */
  async handleTimeout(agentId: string, taskId: string): Promise<void> {
    this.metrics.timeoutVotes++;

    this.log(taskId, 'vote-timeout', { agentId });

    // Mark agent as potentially slow (don't fail immediately)
    // Could implement adaptive timeouts here
  }

  /**
   * Handle vote failure
   */
  async handleFailure(
    agentId: string,
    taskId: string,
    error: Error
  ): Promise<void> {
    this.metrics.failedVotes++;

    this.log(taskId, 'vote-failed', {
      agentId,
      error: error.message
    });

    // Mark agent as failed in pool
    this.pool.markFailed(agentId);
  }

  /**
   * Retry failed vote
   */
  async retry(
    agentId: string,
    taskId: string,
    attempt: number
  ): Promise<Vote | null> {
    const task = this.pool.busy.get(agentId);
    if (!task) {
      return null;
    }

    const agent = this.pool.available.find(a => a.id === agentId);
    if (!agent) {
      return null;
    }

    if (!this.strategy.shouldRetry(agent, task, attempt)) {
      return null;
    }

    this.metrics.retryRate =
      (this.metrics.retryRate * this.metrics.totalTasks + 1) /
      this.metrics.totalTasks;

    this.log(taskId, 'vote-retry', {
      agentId,
      attempt
    });

    try {
      const vote = await this.executeVote(agent, task, attempt);
      this.metrics.successfulVotes++;
      return vote;
    } catch (error) {
      this.metrics.failedVotes++;
      this.log(taskId, 'vote-failed', {
        agentId,
        attempt,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Get orchestration metrics
   */
  getMetrics(): OrchestrationMetrics {
    return { ...this.metrics };
  }

  /**
   * Get orchestration logs
   */
  getLogs(taskId?: string): OrchestrationLog[] {
    if (taskId) {
      return this.logs.filter(log => log.taskId === taskId);
    }
    return [...this.logs];
  }

  /**
   * Execute vote with timeout and retry handling
   */
  private async executeVote(
    agent: VotingAgent,
    task: VotingTask,
    attempt: number
  ): Promise<Vote> {
    const agentLoad = this.pool.busy.size / this.pool.available.length;
    const timeout = this.strategy.adjustTimeout(5000, attempt, agentLoad);

    const votePromise = this.voteExecutor(agent, task);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Vote timeout after ${timeout}ms`)),
        timeout
      )
    );

    try {
      const vote = await Promise.race([votePromise, timeoutPromise]);

      this.log(task.id, 'vote-received', {
        agentId: agent.id,
        score: vote.score,
        confidence: vote.confidence,
        attempt
      });

      return vote;
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        await this.handleTimeout(agent.id, task.id);

        // Try retry
        if (this.strategy.shouldRetry(agent, task, attempt)) {
          return this.executeVote(agent, task, attempt + 1);
        }
      }

      await this.handleFailure(
        agent.id,
        task.id,
        error instanceof Error ? error : new Error(String(error))
      );

      throw error;
    }
  }

  /**
   * Log orchestration event
   */
  private log(
    taskId: string,
    event: OrchestrationEvent,
    details: Record<string, unknown>
  ): void {
    this.logs.push({
      taskId,
      timestamp: new Date(),
      event,
      details
    });
  }

  /**
   * Update average execution time metric
   */
  private updateAverageExecutionTime(executionTime: number): void {
    const totalTasks = this.metrics.totalTasks;
    this.metrics.averageExecutionTime =
      (this.metrics.averageExecutionTime * (totalTasks - 1) + executionTime) /
      totalTasks;
  }
}
