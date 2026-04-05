/**
 * Agentic QE v3 - Agent Coordinator
 * Manages agent lifecycle with max concurrent agents limit
 */

import { v4 as uuidv4 } from 'uuid';
import { AgentStatus, DomainName, Result, ok, err } from '../shared/types';
import {
  AgentCoordinator,
  AgentSpawnConfig,
  AgentFilter,
  AgentInfo,
  ProgressiveContextConfig,
  FileRequestRecord,
} from './interfaces';
import { AGENT_CONSTANTS } from './constants.js';

interface ManagedAgent {
  id: string;
  name: string;
  domain: DomainName;
  type: string;
  status: AgentStatus;
  capabilities: string[];
  config: Record<string, unknown>;
  startedAt?: Date;
  completedAt?: Date;
}

export class DefaultAgentCoordinator implements AgentCoordinator {
  private agents: Map<string, ManagedAgent> = new Map();
  private maxAgents: number;
  // ADR-067: Optional agent memory branching service
  private memoryBranch: import('../coordination/agent-memory-branch.js').AgentMemoryBranch | null = null;

  constructor(maxAgents: number = AGENT_CONSTANTS.MAX_CONCURRENT_AGENTS) {
    this.maxAgents = maxAgents;
  }

  /** Attach an AgentMemoryBranch service for per-agent COW isolation (ADR-067) */
  setMemoryBranch(branch: import('../coordination/agent-memory-branch.js').AgentMemoryBranch): void {
    this.memoryBranch = branch;
  }

  async spawn(config: AgentSpawnConfig): Promise<Result<string, Error>> {
    // Check agent limit
    if (!this.canSpawn()) {
      return err(
        new Error(
          `Cannot spawn agent: maximum concurrent agents (${this.maxAgents}) reached. ` +
          `Active: ${this.getActiveCount()}`
        )
      );
    }

    // ADR-062 Action 5: Progressive context loading
    // When enabled, predict which files the agent will need instead of loading everything
    let resolvedConfig = config.config ?? {};
    const progressiveEnabled =
      config.progressiveContext?.strategy === 'predictive' ||
      process.env.AQE_PROGRESSIVE_CONTEXT_ENABLED === 'true';

    if (progressiveEnabled) {
      try {
        const taskDescription =
          (resolvedConfig.taskDescription as string | undefined) || config.name || '';
        const availableFiles =
          (resolvedConfig.availableFiles as string[] | undefined) || [];

        if (taskDescription && availableFiles.length > 0) {
          const loader = new ProgressiveContextLoader(config.progressiveContext);
          const predictedFiles = loader.predictFilesForTask(taskDescription, availableFiles);
          resolvedConfig = {
            ...resolvedConfig,
            availableFiles: predictedFiles,
            contextFiles: predictedFiles,
            initialFiles: predictedFiles,
            progressiveContextApplied: true,
          };
        }
      } catch {
        // Progressive context must not break agent spawning
      }
    }

    const id = uuidv4();
    const agent: ManagedAgent = {
      id,
      name: config.name,
      domain: config.domain,
      type: config.type,
      status: 'running',
      capabilities: config.capabilities,
      config: resolvedConfig,
      startedAt: new Date(),
    };

    this.agents.set(id, agent);

    // ADR-067: Create memory branch for isolated agent workspace
    if (this.memoryBranch) {
      try {
        const handle = this.memoryBranch.createBranch(id);
        agent.config = {
          ...agent.config,
          _memoryBranchPath: handle.childPath,
          // Expose a recordIngest callback so the agent can log vectors for merge replay
          _memoryBranchRecordIngest: (entries: Array<{ id: string; vector: Float32Array }>) => {
            this.memoryBranch?.recordIngest(id, entries);
          },
        };
      } catch (error) {
        // Branch creation must not block agent spawning
        console.warn(`[AgentCoordinator] Memory branch creation failed for ${id}:`, error);
      }
    }

    return ok(id);
  }

  getStatus(agentId: string): AgentStatus | undefined {
    return this.agents.get(agentId)?.status;
  }

  listAgents(filter?: AgentFilter): AgentInfo[] {
    let agents = Array.from(this.agents.values());

    if (filter) {
      if (filter.domain) {
        agents = agents.filter((a) => a.domain === filter.domain);
      }
      if (filter.status) {
        agents = agents.filter((a) => a.status === filter.status);
      }
      if (filter.type) {
        agents = agents.filter((a) => a.type === filter.type);
      }
    }

    return agents.map((a) => ({
      id: a.id,
      name: a.name,
      domain: a.domain,
      type: a.type,
      status: a.status,
      startedAt: a.startedAt,
    }));
  }

  async stop(agentId: string): Promise<Result<void, Error>> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return err(new Error(`Agent not found: ${agentId}`));
    }

    if (agent.status !== 'running') {
      return err(new Error(`Agent ${agentId} is not running (status: ${agent.status})`));
    }

    agent.status = 'completed';
    agent.completedAt = new Date();

    return ok(undefined);
  }

  getActiveCount(): number {
    return Array.from(this.agents.values()).filter(
      (a) => a.status === 'running' || a.status === 'queued'
    ).length;
  }

  canSpawn(): boolean {
    return this.getActiveCount() < this.maxAgents;
  }

  async dispose(): Promise<void> {
    // Stop all running agents
    const runningAgents = Array.from(this.agents.values()).filter(
      (a) => a.status === 'running'
    );

    await Promise.all(runningAgents.map((a) => this.stop(a.id)));
    this.agents.clear();
  }

  // Internal methods for agent status updates
  markCompleted(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent && agent.status === 'running') {
      agent.status = 'completed';
      agent.completedAt = new Date();
      // ADR-067: Merge successful agent's memory branch
      this.handleBranchOnComplete(agentId, 'merge');
    }
  }

  markFailed(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent && agent.status === 'running') {
      agent.status = 'failed';
      agent.completedAt = new Date();
      // ADR-067: Discard failed agent's memory branch
      this.handleBranchOnComplete(agentId, 'discard');
    }
  }

  /** ADR-067: Handle branch merge or discard on agent completion */
  private handleBranchOnComplete(agentId: string, action: 'merge' | 'discard'): void {
    if (!this.memoryBranch) return;
    const handle = this.memoryBranch.getBranch(agentId);
    if (!handle) return;

    try {
      if (action === 'merge') {
        // Fire-and-forget — merge is async but we don't block completion
        this.memoryBranch.mergeBranch(handle).catch(error => {
          console.warn(`[AgentCoordinator] Branch merge failed for ${agentId}:`, error);
        });
      } else {
        this.memoryBranch.discardBranch(handle);
      }
    } catch (error) {
      console.warn(`[AgentCoordinator] Branch ${action} failed for ${agentId}:`, error);
    }
  }

  // Cleanup completed/failed agents older than TTL
  cleanup(ttlMs: number = AGENT_CONSTANTS.DEFAULT_AGENT_TTL_MS): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, agent] of this.agents.entries()) {
      if (
        (agent.status === 'completed' || agent.status === 'failed') &&
        agent.completedAt &&
        now - agent.completedAt.getTime() > ttlMs
      ) {
        this.agents.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// ============================================================================
// ADR-062 Action 5: Progressive Context Loader
// ============================================================================

/** Default configuration for progressive context loading */
const DEFAULT_PROGRESSIVE_CONTEXT_CONFIG: ProgressiveContextConfig = {
  strategy: 'full',
  maxInitialFiles: 10,
  predictionThreshold: 0.7,
  trackFileRequests: true,
};

/**
 * Predicts and manages context files for agent spawning (ADR-062 Action 5).
 *
 * Uses TF-IDF-like keyword matching between the task description and file
 * paths to predict which files an agent will need. This reduces initial
 * token usage by ~40% compared to loading the full codebase context.
 *
 * Feature-gated by `AQE_PROGRESSIVE_CONTEXT_ENABLED` env var (default: false).
 */
export class ProgressiveContextLoader {
  private config: ProgressiveContextConfig;
  private fileRequests: FileRequestRecord[] = [];
  private preloadedFiles: Set<string> = new Set();

  constructor(config?: Partial<ProgressiveContextConfig>) {
    this.config = { ...DEFAULT_PROGRESSIVE_CONTEXT_CONFIG, ...config };
  }

  /**
   * Check if progressive context loading is enabled via feature flag.
   * When disabled, all methods fall back to full-context behavior.
   */
  private isEnabled(): boolean {
    return process.env.AQE_PROGRESSIVE_CONTEXT_ENABLED === 'true';
  }

  /**
   * Predict which files an agent will need based on the task description.
   *
   * Uses simple TF-IDF-like keyword extraction from the task description,
   * then scores each available file path against those keywords. Returns
   * the top N files sorted by relevance score.
   *
   * When the feature flag is disabled or the strategy is 'full', returns
   * all available files (preserving existing behavior).
   *
   * @param taskDescription - Natural language description of the agent's task
   * @param availableFiles - List of file paths the agent could access
   * @returns Sorted list of predicted file paths (most relevant first)
   */
  predictFilesForTask(taskDescription: string, availableFiles: string[]): string[] {
    // Feature flag gate: disabled → return all files
    if (!this.isEnabled() || this.config.strategy === 'full') {
      return [...availableFiles];
    }

    // Empty inputs: return up to maxInitialFiles from available
    if (!taskDescription || taskDescription.trim().length === 0) {
      return availableFiles.slice(0, this.config.maxInitialFiles);
    }

    if (availableFiles.length === 0) {
      return [];
    }

    // Extract keywords from task description
    const keywords = this.extractKeywords(taskDescription);

    if (keywords.length === 0) {
      return availableFiles.slice(0, this.config.maxInitialFiles);
    }

    // Score each file against the keywords
    const scored = availableFiles.map(filePath => ({
      filePath,
      score: this.scoreFile(filePath, keywords),
    }));

    // Sort by score descending, then take top N
    scored.sort((a, b) => b.score - a.score);

    // Track which files were preloaded for accuracy measurement
    const predicted = scored
      .slice(0, this.config.maxInitialFiles)
      .map(s => s.filePath);

    this.preloadedFiles = new Set(predicted);

    return predicted;
  }

  /**
   * Record a file request made by an agent for tracking prediction accuracy.
   *
   * @param record - The file request record to store
   */
  recordFileRequest(record: FileRequestRecord): void {
    if (!this.config.trackFileRequests) {
      return;
    }

    this.fileRequests.push(record);
  }

  /**
   * Calculate how accurately predictions matched actual file usage.
   *
   * @returns Object with prediction stats: predicted count, actually used count, hit rate
   */
  getPredictionAccuracy(): { predicted: number; actuallyUsed: number; hitRate: number } {
    const predicted = this.preloadedFiles.size;
    const actuallyUsed = this.fileRequests.filter(r => r.wasPreloaded).length;

    // Deduplicate actual requests by filePath for hit rate
    const uniqueRequested = new Set(this.fileRequests.map(r => r.filePath));
    const hits = [...uniqueRequested].filter(f => this.preloadedFiles.has(f)).length;

    const hitRate = uniqueRequested.size > 0 ? hits / uniqueRequested.size : 0;

    return { predicted, actuallyUsed, hitRate };
  }

  /**
   * Retrieve the file request history, optionally filtered by agent ID.
   *
   * @param agentId - Optional agent ID to filter by
   * @returns Array of file request records
   */
  getFileRequestHistory(agentId?: string): FileRequestRecord[] {
    if (agentId) {
      return this.fileRequests.filter(r => r.agentId === agentId);
    }
    return [...this.fileRequests];
  }

  /**
   * Extract meaningful keywords from a task description.
   * Splits on whitespace/punctuation, lowercases, removes stop words,
   * and deduplicates.
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
      'before', 'after', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet',
      'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'few',
      'more', 'most', 'other', 'some', 'such', 'no', 'only', 'same', 'than',
      'too', 'very', 'just', 'because', 'if', 'when', 'while', 'that',
      'this', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we',
      'our', 'you', 'your', 'he', 'she', 'his', 'her', 'i', 'me', 'my',
    ]);

    const tokens = text
      .toLowerCase()
      .split(/[\s\-_./\\,;:!?()[\]{}'"]+/)
      .filter(t => t.length > 1 && !stopWords.has(t));

    // Deduplicate while preserving order
    return [...new Set(tokens)];
  }

  /**
   * Score a file path against a list of keywords using TF-IDF-like matching.
   * Checks both the full path and individual path segments.
   */
  private scoreFile(filePath: string, keywords: string[]): number {
    const pathLower = filePath.toLowerCase();

    // Split the path into segments for matching
    const segments = pathLower
      .split(/[\\/.]/)
      .filter(s => s.length > 0);

    let score = 0;

    for (const keyword of keywords) {
      // Exact segment match is worth more
      if (segments.includes(keyword)) {
        score += 2.0;
      }
      // Substring match in the full path
      else if (pathLower.includes(keyword)) {
        score += 1.0;
      }
      // Partial match: keyword is a prefix of a segment or vice versa
      else {
        for (const segment of segments) {
          if (segment.startsWith(keyword) || keyword.startsWith(segment)) {
            score += 0.5;
            break;
          }
        }
      }
    }

    // Normalize by keyword count to get a 0-1 range (roughly)
    return keywords.length > 0 ? score / (keywords.length * 2.0) : 0;
  }
}
