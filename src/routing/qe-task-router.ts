/**
 * QE Task Router
 * ADR-022: Adaptive QE Agent Routing
 *
 * ML-based task routing that combines:
 * - Vector similarity (semantic matching via transformer embeddings)
 * - Historical performance (agent success rates from feedback)
 * - Capability matching (task requirements vs agent capabilities)
 */

import { performance } from 'perf_hooks';
import type {
  QEAgentProfile,
  QETask,
  QERoutingDecision,
  AgentScore,
  QERouterConfig,
  AgentCapability,
  ComplexityLevel,
} from './types.js';
import { DEFAULT_ROUTER_CONFIG } from './types.js';
import { QE_AGENT_REGISTRY, getAgentById } from './qe-agent-registry.js';
import type { QEDomain } from '../learning/qe-patterns.js';
import {
  computeRealEmbedding,
  cosineSimilarity,
} from '../learning/real-embeddings.js';

// ============================================================================
// Task Keyword Detection
// ============================================================================

/**
 * Keywords that indicate specific QE domains
 */
const DOMAIN_KEYWORDS: Record<QEDomain, string[]> = {
  'test-generation': [
    'generate', 'create', 'write', 'test', 'tests', 'unit', 'spec', 'tdd', 'bdd',
    'scenario', 'case', 'suite', 'coverage', 'mock', 'stub', 'fixture',
  ],
  'test-execution': [
    'run', 'execute', 'parallel', 'retry', 'flaky', 'timeout', 'runner',
    'orchestrate', 'schedule', 'ci', 'pipeline',
  ],
  'coverage-analysis': [
    'coverage', 'gap', 'uncovered', 'branch', 'line', 'function', 'statement',
    'untested', 'missing', 'analyze', 'analysis',
  ],
  'quality-assessment': [
    'quality', 'gate', 'metric', 'score', 'ready', 'deploy', 'release',
    'standard', 'review', 'complexity',
  ],
  'defect-intelligence': [
    'defect', 'bug', 'regression', 'predict', 'risk', 'incident', 'production',
    'failure', 'root cause',
  ],
  'requirements-validation': [
    'requirement', 'bdd', 'gherkin', 'cucumber', 'feature', 'scenario',
    'acceptance', 'testability', 'specification',
  ],
  'code-intelligence': [
    'code', 'ast', 'semantic', 'knowledge', 'graph', 'understand', 'analyze',
    'pattern', 'structure',
  ],
  'security-compliance': [
    'security', 'vulnerability', 'owasp', 'sast', 'dast', 'scan', 'audit',
    'compliance', 'gdpr', 'hipaa', 'pci', 'cve',
  ],
  'contract-testing': [
    'api', 'contract', 'pact', 'openapi', 'swagger', 'graphql', 'schema',
    'integration', 'consumer', 'provider',
  ],
  'visual-accessibility': [
    'visual', 'screenshot', 'regression', 'percy', 'chromatic', 'accessibility',
    'a11y', 'wcag', 'aria', 'screen reader', 'contrast',
  ],
  'chaos-resilience': [
    'chaos', 'resilience', 'fault', 'injection', 'load', 'stress', 'performance',
    'k6', 'artillery', 'benchmark',
  ],
  'learning-optimization': [
    'learn', 'optimize', 'pattern', 'memory', 'hnsw', 'vector', 'embedding',
    'swarm', 'coordinate', 'orchestrate',
  ],
};

/**
 * Keywords that indicate specific capabilities
 */
const CAPABILITY_KEYWORDS: Record<AgentCapability, string[]> = {
  'test-generation': ['generate', 'create', 'write', 'new test'],
  'tdd': ['tdd', 'test driven', 'red green', 'failing test first'],
  'bdd': ['bdd', 'behavior', 'gherkin', 'cucumber', 'scenario'],
  'unit-test': ['unit', 'isolated', 'mock', 'stub'],
  'integration-test': ['integration', 'component', 'service'],
  'e2e-test': ['e2e', 'end to end', 'end-to-end', 'full stack'],
  'contract-test': ['contract', 'pact', 'consumer driven'],
  'coverage-analysis': ['coverage', 'branch', 'line', 'function'],
  'gap-detection': ['gap', 'missing', 'uncovered', 'untested'],
  'risk-scoring': ['risk', 'score', 'priority', 'criticality'],
  'sublinear-analysis': ['sublinear', 'o(log n)', 'fast', 'efficient'],
  'branch-coverage': ['branch', 'decision', 'condition'],
  'mutation-testing': ['mutation', 'mutant', 'kill'],
  'test-quality': ['quality', 'effective', 'strength'],
  'api-testing': ['api', 'rest', 'http', 'endpoint'],
  'openapi': ['openapi', 'swagger', 'spec'],
  'graphql': ['graphql', 'query', 'mutation'],
  'pact': ['pact', 'consumer', 'provider'],
  'contract-testing': ['contract', 'breaking change'],
  'sast': ['sast', 'static analysis', 'code scan'],
  'dast': ['dast', 'dynamic', 'runtime'],
  'vulnerability': ['vulnerability', 'cve', 'security bug'],
  'owasp': ['owasp', 'top 10', 'injection', 'xss'],
  'security-scanning': ['security', 'scan', 'audit'],
  'visual-regression': ['visual', 'screenshot', 'pixel'],
  'screenshot': ['screenshot', 'snapshot', 'capture'],
  'percy': ['percy'],
  'chromatic': ['chromatic'],
  'wcag': ['wcag', 'accessibility standard'],
  'aria': ['aria', 'role', 'label'],
  'screen-reader': ['screen reader', 'voiceover', 'nvda'],
  'contrast': ['contrast', 'color', 'visibility'],
  'load-testing': ['load', 'concurrent', 'users'],
  'stress-testing': ['stress', 'breaking point', 'limit'],
  'k6': ['k6'],
  'artillery': ['artillery'],
  'benchmark': ['benchmark', 'perf', 'latency'],
  'chaos-testing': ['chaos', 'monkey', 'failure'],
  'resilience': ['resilience', 'recovery', 'failover'],
  'fault-injection': ['fault', 'inject', 'simulate failure'],
  'flaky-detection': ['flaky', 'intermittent', 'unstable'],
  'test-stability': ['stability', 'reliable', 'consistent'],
  'retry': ['retry', 'rerun', 'attempt'],
  'test-data': ['test data', 'fixture', 'seed', 'fake'],
  'test-orchestration': ['orchestrate', 'coordinate', 'swarm'],
  'quality-gate': ['gate', 'check', 'pass/fail'],
  'deployment-readiness': ['deploy', 'release', 'ready', 'go/no-go'],
};

// ============================================================================
// QE Task Router
// ============================================================================

/**
 * QE Task Router that uses ML-based routing to select optimal agents
 */
export class QETaskRouter {
  private config: QERouterConfig;
  private agentEmbeddings: Map<string, number[]> = new Map();
  private initialized = false;
  private embeddingCache: Map<string, number[]> = new Map();

  constructor(config: Partial<QERouterConfig> = {}) {
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };
  }

  /**
   * Initialize router by computing agent embeddings
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Compute embedding for each agent based on their description and capabilities
    for (const agent of QE_AGENT_REGISTRY) {
      const text = this.buildAgentEmbeddingText(agent);
      const embedding = await computeRealEmbedding(text);
      this.agentEmbeddings.set(agent.id, embedding);
    }

    this.initialized = true;
  }

  /**
   * Build text representation of agent for embedding
   */
  private buildAgentEmbeddingText(agent: QEAgentProfile): string {
    const parts = [
      agent.name,
      agent.description,
      ...agent.domains,
      ...agent.capabilities,
      ...(agent.languages || []),
      ...(agent.frameworks || []),
      ...(agent.tags || []),
    ];
    return parts.join(' ');
  }

  /**
   * Route a task to the optimal agent
   */
  async route(task: QETask): Promise<QERoutingDecision> {
    const startTime = performance.now();

    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    // 1. Detect domain and capabilities from task description
    const detectedDomain = task.domain || this.detectDomain(task.description);
    const detectedCapabilities = task.requiredCapabilities || this.detectCapabilities(task.description);

    // 2. Pre-filter agents based on hard requirements
    const candidateAgents = this.filterCandidates(task, detectedDomain, detectedCapabilities);

    if (candidateAgents.length === 0) {
      // Fallback to all agents if no matches
      candidateAgents.push(...QE_AGENT_REGISTRY);
    }

    // 3. Score each candidate agent
    const taskEmbedding = await this.getTaskEmbedding(task.description);
    const scores: AgentScore[] = [];

    for (const agent of candidateAgents) {
      const score = await this.scoreAgent(agent, task, taskEmbedding, detectedCapabilities);
      scores.push(score);
    }

    // 4. Sort by combined score
    scores.sort((a, b) => b.combinedScore - a.combinedScore);

    // 5. Build routing decision
    const topScore = scores[0];
    const alternatives = scores.slice(1, 4).map(s => ({
      agent: s.agent,
      score: s.combinedScore,
      reason: s.reason,
    }));

    const latencyMs = performance.now() - startTime;

    return {
      recommended: topScore.agent,
      confidence: topScore.combinedScore,
      alternatives,
      reasoning: this.buildReasoning(topScore, task, detectedDomain, detectedCapabilities),
      scores: {
        similarity: topScore.similarityScore,
        performance: topScore.performanceScore,
        capabilities: topScore.capabilityScore,
        combined: topScore.combinedScore,
      },
      latencyMs,
      timestamp: new Date(),
    };
  }

  /**
   * Detect QE domain from task description
   */
  private detectDomain(description: string): QEDomain | undefined {
    const lower = description.toLowerCase();
    let bestDomain: QEDomain | undefined;
    let bestScore = 0;

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      const matches = keywords.filter(kw => lower.includes(kw)).length;
      if (matches > bestScore) {
        bestScore = matches;
        bestDomain = domain as QEDomain;
      }
    }

    return bestDomain;
  }

  /**
   * Detect required capabilities from task description
   */
  private detectCapabilities(description: string): AgentCapability[] {
    const lower = description.toLowerCase();
    const detected: AgentCapability[] = [];

    for (const [capability, keywords] of Object.entries(CAPABILITY_KEYWORDS)) {
      if (keywords.some(kw => lower.includes(kw))) {
        detected.push(capability as AgentCapability);
      }
    }

    return detected;
  }

  /**
   * Filter candidate agents based on hard requirements
   */
  private filterCandidates(
    task: QETask,
    domain?: QEDomain,
    capabilities?: AgentCapability[]
  ): QEAgentProfile[] {
    let candidates = [...QE_AGENT_REGISTRY];

    // Filter by domain
    if (domain) {
      const domainCandidates = candidates.filter(a => a.domains.includes(domain));
      if (domainCandidates.length > 0) {
        candidates = domainCandidates;
      }
    }

    // Filter by language
    if (task.language) {
      const langCandidates = candidates.filter(
        a => !a.languages || a.languages.includes(task.language!)
      );
      if (langCandidates.length > 0) {
        candidates = langCandidates;
      }
    }

    // Filter by framework
    if (task.framework) {
      const frameworkCandidates = candidates.filter(
        a => !a.frameworks || a.frameworks.includes(task.framework!)
      );
      if (frameworkCandidates.length > 0) {
        candidates = frameworkCandidates;
      }
    }

    // Filter by complexity
    if (task.complexity) {
      const complexityCandidates = candidates.filter(a =>
        this.complexityMatches(task.complexity!, a.complexity)
      );
      if (complexityCandidates.length > 0) {
        candidates = complexityCandidates;
      }
    }

    // Prefer agents that have at least one matching capability
    if (capabilities && capabilities.length > 0) {
      const capabilityCandidates = candidates.filter(a =>
        capabilities.some(cap => a.capabilities.includes(cap))
      );
      if (capabilityCandidates.length > 0) {
        candidates = capabilityCandidates;
      }
    }

    // If user has a preference, prioritize it
    if (task.context?.preferredAgent) {
      const preferred = candidates.find(a => a.id === task.context?.preferredAgent);
      if (preferred) {
        // Move to front
        candidates = [preferred, ...candidates.filter(a => a.id !== preferred.id)];
      }
    }

    return candidates;
  }

  /**
   * Check if complexity matches agent's range
   */
  private complexityMatches(
    taskComplexity: ComplexityLevel,
    agentComplexity: { min: ComplexityLevel; max: ComplexityLevel }
  ): boolean {
    const order: Record<ComplexityLevel, number> = { simple: 0, medium: 1, complex: 2 };
    const taskOrder = order[taskComplexity];
    return taskOrder >= order[agentComplexity.min] && taskOrder <= order[agentComplexity.max];
  }

  /**
   * Get task embedding (with caching)
   */
  private async getTaskEmbedding(description: string): Promise<number[]> {
    if (this.embeddingCache.has(description)) {
      return this.embeddingCache.get(description)!;
    }

    const embedding = await computeRealEmbedding(description);

    // Cache with LRU-style eviction
    if (this.embeddingCache.size > 1000) {
      const firstKey = this.embeddingCache.keys().next().value;
      if (firstKey) {
        this.embeddingCache.delete(firstKey);
      }
    }
    this.embeddingCache.set(description, embedding);

    return embedding;
  }

  /**
   * Score an agent for a task
   */
  private async scoreAgent(
    agent: QEAgentProfile,
    task: QETask,
    taskEmbedding: number[],
    requiredCapabilities: AgentCapability[]
  ): Promise<AgentScore> {
    // 1. Vector similarity score
    const agentEmbedding = this.agentEmbeddings.get(agent.id);
    const similarityScore = agentEmbedding
      ? cosineSimilarity(taskEmbedding, agentEmbedding)
      : 0;

    // 2. Historical performance score
    let performanceScore: number;
    if (agent.tasksCompleted >= this.config.minTasksForPerformance) {
      // Use actual performance data
      performanceScore = (agent.successRate * 0.6) + (agent.performanceScore * 0.4);
    } else {
      // Use default performance score
      performanceScore = this.config.defaultPerformanceScore;
    }

    // 3. Capability match score
    let capabilityScore = 0;
    if (requiredCapabilities.length > 0) {
      const matchCount = requiredCapabilities.filter(cap =>
        agent.capabilities.includes(cap)
      ).length;
      capabilityScore = matchCount / requiredCapabilities.length;
    } else {
      // If no specific capabilities required, give full score
      capabilityScore = 1.0;
    }

    // 4. Bonus scoring
    let bonus = 0;

    // Bonus for exact framework match
    if (task.framework && agent.frameworks?.includes(task.framework)) {
      bonus += 0.1;
    }

    // Bonus for exact language match
    if (task.language && agent.languages?.includes(task.language)) {
      bonus += 0.1;
    }

    // Bonus for previous agent (continuity)
    if (task.context?.previousAgent === agent.id) {
      bonus += 0.05;
    }

    // 5. Combined weighted score
    const { weights } = this.config;
    const combinedScore = Math.min(1.0,
      (weights.similarity * similarityScore) +
      (weights.performance * performanceScore) +
      (weights.capabilities * capabilityScore) +
      bonus
    );

    // Build reason
    const reasons: string[] = [];
    if (similarityScore > 0.7) reasons.push('high semantic match');
    if (performanceScore > 0.8) reasons.push('strong track record');
    if (capabilityScore === 1.0 && requiredCapabilities.length > 0) reasons.push('all capabilities matched');
    if (bonus > 0) reasons.push('bonus from exact matches');

    return {
      agent: agent.id,
      similarityScore,
      performanceScore,
      capabilityScore,
      combinedScore,
      reason: reasons.length > 0 ? reasons.join(', ') : 'general fit',
    };
  }

  /**
   * Build human-readable reasoning for routing decision
   */
  private buildReasoning(
    topScore: AgentScore,
    task: QETask,
    domain?: QEDomain,
    capabilities?: AgentCapability[]
  ): string {
    const agent = getAgentById(topScore.agent);
    if (!agent) return `Selected ${topScore.agent} based on scoring`;

    const parts: string[] = [];

    parts.push(`Selected ${agent.name} (${agent.id})`);

    if (domain) {
      parts.push(`for ${domain} task`);
    }

    if (capabilities && capabilities.length > 0) {
      parts.push(`requiring ${capabilities.slice(0, 3).join(', ')}`);
    }

    parts.push(`with confidence ${(topScore.combinedScore * 100).toFixed(0)}%`);

    parts.push(
      `(similarity: ${(topScore.similarityScore * 100).toFixed(0)}%, ` +
      `performance: ${(topScore.performanceScore * 100).toFixed(0)}%, ` +
      `capabilities: ${(topScore.capabilityScore * 100).toFixed(0)}%)`
    );

    return parts.join(' ');
  }

  /**
   * Update agent performance based on feedback
   */
  updateAgentPerformance(
    agentId: string,
    success: boolean,
    qualityScore: number,
    durationMs: number
  ): void {
    const agent = getAgentById(agentId);
    if (!agent) return;

    // Update counters
    agent.tasksCompleted++;

    // Update success rate (rolling average)
    const prevTotal = agent.tasksCompleted - 1;
    const prevSuccessCount = agent.successRate * prevTotal;
    agent.successRate = (prevSuccessCount + (success ? 1 : 0)) / agent.tasksCompleted;

    // Update performance score (weighted average with quality)
    agent.performanceScore =
      (agent.performanceScore * 0.9) + (qualityScore * 0.1);

    // Update average duration
    agent.avgDurationMs =
      (agent.avgDurationMs * prevTotal + durationMs) / agent.tasksCompleted;
  }

  /**
   * Get router statistics
   */
  getStats(): {
    initialized: boolean;
    agentCount: number;
    embeddingsCached: number;
    config: QERouterConfig;
  } {
    return {
      initialized: this.initialized,
      agentCount: QE_AGENT_REGISTRY.length,
      embeddingsCached: this.embeddingCache.size,
      config: this.config,
    };
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.embeddingCache.clear();
  }
}

/**
 * Create a new QE task router instance
 */
export function createQETaskRouter(config?: Partial<QERouterConfig>): QETaskRouter {
  return new QETaskRouter(config);
}
