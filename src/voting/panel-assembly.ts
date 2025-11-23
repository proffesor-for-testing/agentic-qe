/**
 * Panel assembly logic for voting orchestration
 * Selects optimal agents based on expertise, load, and task requirements
 */

import {
  VotingAgent,
  VotingTask,
  VotingPanelConfig,
  PanelAssemblyResult,
  AgentPool,
  VotingStrategy,
  AgentType
} from './types';

export class PanelAssembler {
  constructor(
    private readonly pool: AgentPool,
    private readonly strategy: VotingStrategy
  ) {}

  /**
   * Assemble optimal voting panel for a task
   */
  async assemblePanel(
    task: VotingTask,
    config: VotingPanelConfig
  ): Promise<PanelAssemblyResult> {
    const startTime = Date.now();

    // Get available agents matching required expertise
    const candidates = this.pool.getAvailable(task.requiredExpertise);

    if (candidates.length < config.minPanelSize) {
      throw new Error(
        `Insufficient agents: need ${config.minPanelSize}, have ${candidates.length}`
      );
    }

    // Select agents using strategy
    const panel = this.strategy.selectAgents(this.pool, task, config);

    // Calculate weights for selected agents
    const weightedPanel = panel.map(agent => ({
      ...agent,
      weight: this.strategy.calculateWeight(agent, task)
    }));

    // Reserve agents in pool
    weightedPanel.forEach(agent => {
      this.pool.reserve(agent.id, task);
    });

    const assemblyTime = Date.now() - startTime;

    return {
      panel: weightedPanel,
      assemblyTime,
      selectionCriteria: this.getSelectionCriteria(task, config),
      coverage: {
        expertise: [...new Set(weightedPanel.flatMap(a => a.expertise))],
        types: [...new Set(weightedPanel.map(a => a.type))],
        totalWeight: weightedPanel.reduce((sum, a) => sum + a.weight, 0)
      }
    };
  }

  /**
   * Release panel agents back to pool
   */
  releasePanel(panel: VotingAgent[]): void {
    panel.forEach(agent => {
      this.pool.release(agent.id);
    });
  }

  /**
   * Get criteria used for panel selection
   */
  private getSelectionCriteria(
    task: VotingTask,
    config: VotingPanelConfig
  ): string[] {
    const criteria: string[] = [];

    if (task.requiredExpertise && task.requiredExpertise.length > 0) {
      criteria.push(`expertise: ${task.requiredExpertise.join(', ')}`);
    }

    criteria.push(`panel size: ${config.minPanelSize}-${config.maxPanelSize}`);
    criteria.push(`consensus: ${config.consensusMethod}`);

    if (config.quorumThreshold) {
      criteria.push(`quorum: ${config.quorumThreshold * 100}%`);
    }

    criteria.push(`priority: ${task.priority}`);

    return criteria;
  }
}

/**
 * Default voting strategy implementation
 */
export class DefaultVotingStrategy implements VotingStrategy {
  selectAgents(
    pool: AgentPool,
    task: VotingTask,
    config: VotingPanelConfig
  ): VotingAgent[] {
    const candidates = pool.getAvailable(task.requiredExpertise);

    // Score each candidate
    const scored = candidates.map(agent => ({
      agent,
      score: this.scoreAgent(agent, task)
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Select top N agents within panel size limits
    const panelSize = Math.min(
      Math.max(config.minPanelSize, scored.length),
      config.maxPanelSize
    );

    return scored.slice(0, panelSize).map(s => s.agent);
  }

  calculateWeight(agent: VotingAgent, task: VotingTask): number {
    let weight = 1.0;

    // Increase weight for matching expertise
    const matchingExpertise = agent.expertise.filter(e =>
      task.requiredExpertise?.includes(e)
    );
    weight += matchingExpertise.length * 0.2;

    // Adjust for agent type relevance
    const typeBonus = this.getTypeBonus(agent.type, task.type);
    weight *= (1 + typeBonus);

    // Apply base agent weight
    weight *= agent.weight;

    return Math.max(0.1, Math.min(5.0, weight)); // Clamp 0.1-5.0
  }

  shouldRetry(
    agent: VotingAgent,
    task: VotingTask,
    attempt: number,
    error?: Error
  ): boolean {
    // Don't retry if max attempts reached
    if (attempt >= 3) {
      return false;
    }

    // Retry on transient errors
    if (error) {
      const transientErrors = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED'];
      const isTransient = transientErrors.some(code =>
        error.message.includes(code)
      );
      return isTransient;
    }

    // Retry low priority tasks less aggressively
    if (task.priority === 'low' && attempt > 1) {
      return false;
    }

    return true;
  }

  adjustTimeout(
    baseTimeout: number,
    attempt: number,
    agentLoad: number
  ): number {
    // Exponential backoff
    const backoff = Math.pow(1.5, attempt - 1);

    // Adjust for agent load (0-1 scale)
    const loadMultiplier = 1 + (agentLoad * 0.5);

    return baseTimeout * backoff * loadMultiplier;
  }

  /**
   * Score an agent for task suitability
   */
  private scoreAgent(agent: VotingAgent, task: VotingTask): number {
    let score = 0;

    // Expertise match
    const matchingExpertise = agent.expertise.filter(e =>
      task.requiredExpertise?.includes(e)
    );
    score += matchingExpertise.length * 10;

    // Type relevance
    score += this.getTypeBonus(agent.type, task.type) * 20;

    // Agent weight
    score += agent.weight * 5;

    return score;
  }

  /**
   * Get bonus score for agent type matching task type
   */
  private getTypeBonus(agentType: AgentType, taskType: string): number {
    const bonusMap: Record<string, AgentType[]> = {
      'test-generation': ['test-generator', 'mutation-tester'],
      'coverage-analysis': ['coverage-analyzer', 'test-generator'],
      'quality-gate': ['quality-gate', 'coverage-analyzer'],
      'performance': ['performance-tester', 'quality-gate'],
      'security': ['security-scanner', 'quality-gate'],
      'flaky-detection': ['flaky-detector', 'test-generator'],
      'visual-testing': ['visual-tester', 'test-generator'],
      'api-testing': ['api-tester', 'test-generator'],
      'requirements': ['requirements-validator', 'test-generator'],
      'data-generation': ['data-generator', 'test-generator'],
      'regression': ['regression-analyzer', 'coverage-analyzer']
    };

    const relevantTypes = bonusMap[taskType] || [];
    return relevantTypes.includes(agentType) ? 1.0 : 0.0;
  }
}

/**
 * Agent pool implementation
 */
export class DefaultAgentPool implements AgentPool {
  available: VotingAgent[];
  busy: Map<string, VotingTask>;
  failed: Set<string>;

  constructor(agents: VotingAgent[]) {
    this.available = [...agents];
    this.busy = new Map();
    this.failed = new Set();
  }

  getAvailable(expertise?: string[]): VotingAgent[] {
    let candidates = this.available.filter(
      agent => !this.busy.has(agent.id) && !this.failed.has(agent.id)
    );

    if (expertise && expertise.length > 0) {
      candidates = candidates.filter(agent =>
        expertise.some(e => agent.expertise.includes(e))
      );
    }

    return candidates;
  }

  reserve(agentId: string, task: VotingTask): void {
    this.busy.set(agentId, task);
  }

  release(agentId: string): void {
    this.busy.delete(agentId);
  }

  markFailed(agentId: string): void {
    this.failed.add(agentId);
    this.busy.delete(agentId);
  }

  restore(agentId: string): void {
    this.failed.delete(agentId);
  }
}
