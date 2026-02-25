/**
 * Belief Reconciler
 * ADR-052: Strange Loop Belief Reconciliation Protocol
 *
 * Handles contradictory beliefs detected by the CoherenceService.
 * When the sheaf Laplacian energy indicates high incoherence,
 * this module identifies conflicting beliefs, determines the optimal
 * resolution strategy, applies reconciliation, and creates audit records.
 *
 * The reconciliation process follows this pattern:
 * ```
 *    Detect Contradiction
 *           |
 *           v
 *    Select Strategy -----> latest | authority | consensus | merge | escalate
 *           |
 *           v
 *    Apply Resolution
 *           |
 *           v
 *    Create Witness Record
 * ```
 *
 * @module strange-loop/belief-reconciler
 */

import { randomUUID } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type {
  Contradiction,
  Belief,
  WitnessRecord,
} from '../integrations/coherence/types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Strategy for reconciling conflicting beliefs
 *
 * | Strategy | Description | Use Case |
 * |----------|-------------|----------|
 * | latest | Prefer most recent observation | Temporal data, state updates |
 * | authority | Prefer higher-confidence agent | Expert systems, hierarchical |
 * | consensus | Query all agents for votes | Democratic decisions |
 * | merge | Attempt to merge compatible beliefs | Complementary partial views |
 * | escalate | Defer to Queen coordinator | Critical/ambiguous conflicts |
 */
export type ReconciliationStrategy =
  | 'latest'
  | 'authority'
  | 'consensus'
  | 'merge'
  | 'escalate';

/**
 * Result of a reconciliation attempt
 */
export interface ReconciliationResult {
  /** Whether reconciliation succeeded */
  success: boolean;

  /** Strategy that was applied */
  strategy: ReconciliationStrategy;

  /** Contradictions that were successfully resolved */
  resolvedContradictions: Contradiction[];

  /** Contradictions that could not be resolved */
  unresolvedContradictions: Contradiction[];

  /** New beliefs created as a result of reconciliation */
  newBeliefs: Belief[];

  /** Witness record ID for audit trail (if witness adapter available) */
  witnessId?: string;

  /** Duration of reconciliation in milliseconds */
  durationMs: number;
}

/**
 * Record of a reconciliation for history tracking
 */
export interface ReconciliationRecord {
  /** Unique identifier for this record */
  id: string;

  /** Contradictions that were processed */
  contradictions: Contradiction[];

  /** Result of the reconciliation */
  result: ReconciliationResult;

  /** Timestamp when reconciliation occurred */
  timestamp: number;
}

/**
 * A vote from an agent on which belief to accept
 */
export interface BeliefVote {
  /** Agent ID casting the vote */
  agentId: string;

  /** Belief ID being voted for */
  beliefId: string;

  /** Confidence in this vote (0-1) */
  confidence: number;

  /** Optional reasoning */
  reasoning?: string;
}

/**
 * Configuration for the belief reconciler
 */
export interface BeliefReconcilerConfig {
  /** Default reconciliation strategy */
  defaultStrategy: ReconciliationStrategy;

  /** Minimum confidence threshold for authority strategy (0-1) */
  authorityThreshold: number;

  /** Minimum consensus percentage required (0-1) */
  consensusThreshold: number;

  /** Maximum time to wait for consensus votes in milliseconds */
  consensusTimeoutMs: number;

  /** Whether to create witness records for audit trail */
  enableWitness: boolean;

  /** Maximum reconciliation history to retain */
  maxHistorySize: number;

  /** Similarity threshold for merge strategy (0-1) */
  mergeSimilarityThreshold: number;

  /** Whether to auto-escalate on repeated failures */
  autoEscalateOnFailure: boolean;

  /** Number of failures before auto-escalation */
  failuresBeforeEscalate: number;
}

/**
 * Default configuration for belief reconciler
 */
export const DEFAULT_BELIEF_RECONCILER_CONFIG: BeliefReconcilerConfig = {
  defaultStrategy: 'authority',
  authorityThreshold: 0.7,
  consensusThreshold: 0.6,
  consensusTimeoutMs: 5000,
  enableWitness: true,
  maxHistorySize: 1000,
  mergeSimilarityThreshold: 0.8,
  autoEscalateOnFailure: true,
  failuresBeforeEscalate: 3,
};

/**
 * Interface for belief reconciler operations
 */
export interface IBeliefReconciler {
  /**
   * Reconcile a set of contradictions
   * @param contradictions - Detected contradictions to resolve
   * @returns Result of the reconciliation attempt
   */
  reconcile(contradictions: Contradiction[]): Promise<ReconciliationResult>;

  /**
   * Get the current reconciliation strategy
   */
  getStrategy(): ReconciliationStrategy;

  /**
   * Set the reconciliation strategy
   * @param strategy - New strategy to use
   */
  setStrategy(strategy: ReconciliationStrategy): void;

  /**
   * Get reconciliation history
   */
  getHistory(): ReconciliationRecord[];
}

/**
 * Interface for collecting consensus votes from agents
 */
export interface IVoteCollector {
  /**
   * Collect votes from agents on which belief to accept
   * @param beliefs - Conflicting beliefs to vote on
   * @param timeoutMs - Maximum time to wait for votes
   */
  collectVotes(beliefs: Belief[], timeoutMs: number): Promise<BeliefVote[]>;
}

/**
 * Interface for creating witness records
 */
export interface IWitnessAdapter {
  /**
   * Create a witness record for a reconciliation
   * @param data - Data to witness
   */
  createWitness(data: unknown): Promise<WitnessRecord>;
}

/**
 * Event types emitted by the belief reconciler
 */
export type BeliefReconcilerEventType =
  | 'belief_reconciliation_started'
  | 'belief_reconciled'
  | 'belief_reconciliation_failed'
  | 'strategy_changed'
  | 'escalation_requested';

/**
 * Event payload for belief reconciler events
 */
export interface BeliefReconcilerEvent {
  /** Event type */
  type: BeliefReconcilerEventType;

  /** Timestamp of event */
  timestamp: number;

  /** Event data */
  data: unknown;
}

/**
 * Event listener callback type
 */
export type BeliefReconcilerEventListener = (
  event: BeliefReconcilerEvent
) => void;

// ============================================================================
// Default Implementations
// ============================================================================

/**
 * Default vote collector that returns empty votes (for testing)
 */
class NoOpVoteCollector implements IVoteCollector {
  async collectVotes(): Promise<BeliefVote[]> {
    return [];
  }
}

/**
 * Default witness adapter that creates mock records (for testing)
 */
class NoOpWitnessAdapter implements IWitnessAdapter {
  async createWitness(data: unknown): Promise<WitnessRecord> {
    const hash = `mock-${Date.now()}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    return {
      witnessId: uuidv4(),
      decisionId: (data as { id?: string })?.id || uuidv4(),
      hash,
      chainPosition: 0,
      timestamp: new Date(),
    };
  }
}

// ============================================================================
// Belief Reconciler Implementation
// ============================================================================

/**
 * Reconciles contradictory beliefs in the swarm
 *
 * @example
 * ```typescript
 * const reconciler = createBeliefReconciler({
 *   defaultStrategy: 'authority',
 *   authorityThreshold: 0.8
 * });
 *
 * const result = await reconciler.reconcile(contradictions);
 * if (result.success) {
 *   // Apply new beliefs
 *   for (const belief of result.newBeliefs) {
 *     await beliefStore.add(belief);
 *   }
 * }
 * ```
 */
export class BeliefReconciler implements IBeliefReconciler {
  private config: BeliefReconcilerConfig;
  private strategy: ReconciliationStrategy;
  private history: ReconciliationRecord[] = [];
  private eventListeners: Map<
    BeliefReconcilerEventType,
    Set<BeliefReconcilerEventListener>
  > = new Map();
  private voteCollector: IVoteCollector;
  private witnessAdapter: IWitnessAdapter | null;
  private consecutiveFailures: number = 0;

  /** Belief store for looking up beliefs by ID */
  private beliefStore: Map<string, Belief> = new Map();

  constructor(
    config: Partial<BeliefReconcilerConfig> = {},
    options?: {
      voteCollector?: IVoteCollector;
      witnessAdapter?: IWitnessAdapter;
    }
  ) {
    this.config = { ...DEFAULT_BELIEF_RECONCILER_CONFIG, ...config };
    this.strategy = this.config.defaultStrategy;
    this.voteCollector = options?.voteCollector || new NoOpVoteCollector();
    this.witnessAdapter = this.config.enableWitness
      ? options?.witnessAdapter || new NoOpWitnessAdapter()
      : null;
  }

  /**
   * Register a belief for lookup during reconciliation
   */
  registerBelief(belief: Belief): void {
    this.beliefStore.set(belief.id, belief);
  }

  /**
   * Register multiple beliefs
   */
  registerBeliefs(beliefs: Belief[]): void {
    for (const belief of beliefs) {
      this.registerBelief(belief);
    }
  }

  /**
   * Clear all registered beliefs
   */
  clearBeliefs(): void {
    this.beliefStore.clear();
  }

  /**
   * Reconcile contradictions using the configured strategy
   */
  async reconcile(
    contradictions: Contradiction[]
  ): Promise<ReconciliationResult> {
    const startTime = Date.now();

    // Emit start event
    this.emit('belief_reconciliation_started', {
      contradictionCount: contradictions.length,
      strategy: this.strategy,
    });

    if (contradictions.length === 0) {
      return {
        success: true,
        strategy: this.strategy,
        resolvedContradictions: [],
        unresolvedContradictions: [],
        newBeliefs: [],
        durationMs: Date.now() - startTime,
      };
    }

    // Check for auto-escalation
    const effectiveStrategy = this.shouldAutoEscalate()
      ? 'escalate'
      : this.strategy;

    let result: ReconciliationResult;

    try {
      switch (effectiveStrategy) {
        case 'latest':
          result = await this.reconcileByLatest(contradictions, startTime);
          break;

        case 'authority':
          result = await this.reconcileByAuthority(contradictions, startTime);
          break;

        case 'consensus':
          result = await this.reconcileByConsensus(contradictions, startTime);
          break;

        case 'merge':
          result = await this.reconcileByMerge(contradictions, startTime);
          break;

        case 'escalate':
          result = await this.reconcileByEscalation(contradictions, startTime);
          break;

        default:
          // Fallback to authority if unknown strategy
          result = await this.reconcileByAuthority(contradictions, startTime);
      }

      // Track failures for auto-escalation
      if (!result.success) {
        this.consecutiveFailures++;
        this.emit('belief_reconciliation_failed', {
          result,
          failureCount: this.consecutiveFailures,
        });
      } else {
        this.consecutiveFailures = 0;
        this.emit('belief_reconciled', {
          result,
          resolvedCount: result.resolvedContradictions.length,
        });
      }

      // Create witness record if enabled
      if (this.witnessAdapter && result.success) {
        const witness = await this.witnessAdapter.createWitness({
          id: uuidv4(),
          type: 'reconciliation',
          strategy: effectiveStrategy,
          contradictions,
          result,
          timestamp: Date.now(),
        });
        result.witnessId = witness.witnessId;
      }

      // Record in history
      this.addToHistory(contradictions, result);

      return result;
    } catch (error) {
      this.consecutiveFailures++;

      const errorResult: ReconciliationResult = {
        success: false,
        strategy: effectiveStrategy,
        resolvedContradictions: [],
        unresolvedContradictions: contradictions,
        newBeliefs: [],
        durationMs: Date.now() - startTime,
      };

      this.emit('belief_reconciliation_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        failureCount: this.consecutiveFailures,
      });

      this.addToHistory(contradictions, errorResult);

      return errorResult;
    }
  }

  /**
   * Get the current reconciliation strategy
   */
  getStrategy(): ReconciliationStrategy {
    return this.strategy;
  }

  /**
   * Set the reconciliation strategy
   */
  setStrategy(strategy: ReconciliationStrategy): void {
    const oldStrategy = this.strategy;
    this.strategy = strategy;
    this.consecutiveFailures = 0; // Reset failure count on strategy change

    this.emit('strategy_changed', {
      oldStrategy,
      newStrategy: strategy,
    });
  }

  /**
   * Get reconciliation history
   */
  getHistory(): ReconciliationRecord[] {
    return [...this.history];
  }

  /**
   * Clear reconciliation history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Get reconciliation statistics
   */
  getStats(): {
    totalReconciliations: number;
    successfulReconciliations: number;
    failedReconciliations: number;
    totalContradictionsResolved: number;
    avgDurationMs: number;
    strategyDistribution: Record<ReconciliationStrategy, number>;
  } {
    const stats = {
      totalReconciliations: this.history.length,
      successfulReconciliations: 0,
      failedReconciliations: 0,
      totalContradictionsResolved: 0,
      avgDurationMs: 0,
      strategyDistribution: {
        latest: 0,
        authority: 0,
        consensus: 0,
        merge: 0,
        escalate: 0,
      } as Record<ReconciliationStrategy, number>,
    };

    let totalDuration = 0;

    for (const record of this.history) {
      if (record.result.success) {
        stats.successfulReconciliations++;
        stats.totalContradictionsResolved +=
          record.result.resolvedContradictions.length;
      } else {
        stats.failedReconciliations++;
      }

      totalDuration += record.result.durationMs;
      stats.strategyDistribution[record.result.strategy]++;
    }

    if (this.history.length > 0) {
      stats.avgDurationMs = totalDuration / this.history.length;
    }

    return stats;
  }

  /**
   * Add event listener
   */
  on(
    event: BeliefReconcilerEventType,
    listener: BeliefReconcilerEventListener
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  /**
   * Remove event listener
   */
  off(
    event: BeliefReconcilerEventType,
    listener: BeliefReconcilerEventListener
  ): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  // ============================================================================
  // Strategy Implementations
  // ============================================================================

  /**
   * Reconcile by preferring the most recent belief
   */
  private async reconcileByLatest(
    contradictions: Contradiction[],
    startTime: number
  ): Promise<ReconciliationResult> {
    const resolved: Contradiction[] = [];
    const unresolved: Contradiction[] = [];
    const newBeliefs: Belief[] = [];

    for (const contradiction of contradictions) {
      const [belief1, belief2] = this.getConflictingBeliefs(contradiction);

      if (!belief1 || !belief2) {
        unresolved.push(contradiction);
        continue;
      }

      // Compare timestamps - prefer the newer belief
      const newer =
        belief1.timestamp > belief2.timestamp ? belief1 : belief2;
      const older =
        belief1.timestamp > belief2.timestamp ? belief2 : belief1;

      // Create a new belief that supersedes both
      const reconciledBelief = this.createReconciledBelief(
        newer,
        older,
        'latest'
      );

      newBeliefs.push(reconciledBelief);
      resolved.push(contradiction);
    }

    return {
      success: resolved.length > 0,
      strategy: 'latest',
      resolvedContradictions: resolved,
      unresolvedContradictions: unresolved,
      newBeliefs,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Reconcile by preferring higher-confidence beliefs
   */
  private async reconcileByAuthority(
    contradictions: Contradiction[],
    startTime: number
  ): Promise<ReconciliationResult> {
    const resolved: Contradiction[] = [];
    const unresolved: Contradiction[] = [];
    const newBeliefs: Belief[] = [];

    for (const contradiction of contradictions) {
      const [belief1, belief2] = this.getConflictingBeliefs(contradiction);

      if (!belief1 || !belief2) {
        unresolved.push(contradiction);
        continue;
      }

      // Check if either belief meets the authority threshold
      const maxConfidence = Math.max(belief1.confidence, belief2.confidence);

      if (maxConfidence < this.config.authorityThreshold) {
        // Neither belief is authoritative enough - cannot resolve
        unresolved.push(contradiction);
        continue;
      }

      // Prefer the higher confidence belief
      const authoritative =
        belief1.confidence >= belief2.confidence ? belief1 : belief2;
      const subordinate =
        belief1.confidence >= belief2.confidence ? belief2 : belief1;

      const reconciledBelief = this.createReconciledBelief(
        authoritative,
        subordinate,
        'authority'
      );

      newBeliefs.push(reconciledBelief);
      resolved.push(contradiction);
    }

    return {
      success: resolved.length > 0,
      strategy: 'authority',
      resolvedContradictions: resolved,
      unresolvedContradictions: unresolved,
      newBeliefs,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Reconcile by collecting votes from agents
   */
  private async reconcileByConsensus(
    contradictions: Contradiction[],
    startTime: number
  ): Promise<ReconciliationResult> {
    const resolved: Contradiction[] = [];
    const unresolved: Contradiction[] = [];
    const newBeliefs: Belief[] = [];

    for (const contradiction of contradictions) {
      const [belief1, belief2] = this.getConflictingBeliefs(contradiction);

      if (!belief1 || !belief2) {
        unresolved.push(contradiction);
        continue;
      }

      // Collect votes from agents
      const votes = await this.voteCollector.collectVotes(
        [belief1, belief2],
        this.config.consensusTimeoutMs
      );

      if (votes.length === 0) {
        // No votes received - cannot reach consensus
        unresolved.push(contradiction);
        continue;
      }

      // Tally votes (weighted by confidence)
      const voteTally = new Map<string, number>();
      let totalWeight = 0;

      for (const vote of votes) {
        const currentWeight = voteTally.get(vote.beliefId) || 0;
        voteTally.set(vote.beliefId, currentWeight + vote.confidence);
        totalWeight += vote.confidence;
      }

      // Check if consensus threshold is met
      const winningBeliefId = Array.from(voteTally.entries()).reduce(
        (max, [id, weight]) => (weight > max.weight ? { id, weight } : max),
        { id: '', weight: 0 }
      );

      const consensusPercentage = winningBeliefId.weight / totalWeight;

      if (consensusPercentage < this.config.consensusThreshold) {
        // Consensus threshold not met
        unresolved.push(contradiction);
        continue;
      }

      // Consensus reached
      const winningBelief =
        winningBeliefId.id === belief1.id ? belief1 : belief2;
      const losingBelief =
        winningBeliefId.id === belief1.id ? belief2 : belief1;

      const reconciledBelief = this.createReconciledBelief(
        winningBelief,
        losingBelief,
        'consensus',
        { consensusPercentage, voteCount: votes.length }
      );

      newBeliefs.push(reconciledBelief);
      resolved.push(contradiction);
    }

    return {
      success: resolved.length > 0,
      strategy: 'consensus',
      resolvedContradictions: resolved,
      unresolvedContradictions: unresolved,
      newBeliefs,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Reconcile by attempting to merge compatible beliefs
   *
   * Uses category theory principles to find a compatible merge:
   * - If beliefs are about different aspects of the same entity, merge them
   * - If beliefs can be generalized to a higher-level belief, do so
   * - If beliefs represent partial views, combine them
   */
  private async reconcileByMerge(
    contradictions: Contradiction[],
    startTime: number
  ): Promise<ReconciliationResult> {
    const resolved: Contradiction[] = [];
    const unresolved: Contradiction[] = [];
    const newBeliefs: Belief[] = [];

    for (const contradiction of contradictions) {
      const [belief1, belief2] = this.getConflictingBeliefs(contradiction);

      if (!belief1 || !belief2) {
        unresolved.push(contradiction);
        continue;
      }

      // Check if beliefs are mergeable (similar enough in embedding space)
      const similarity = this.computeEmbeddingSimilarity(
        belief1.embedding,
        belief2.embedding
      );

      if (similarity < this.config.mergeSimilarityThreshold) {
        // Beliefs are too different to merge
        unresolved.push(contradiction);
        continue;
      }

      // Attempt to merge the beliefs
      const mergedBelief = this.mergeBeliefsCategorial(belief1, belief2);

      if (!mergedBelief) {
        unresolved.push(contradiction);
        continue;
      }

      newBeliefs.push(mergedBelief);
      resolved.push(contradiction);
    }

    return {
      success: resolved.length > 0,
      strategy: 'merge',
      resolvedContradictions: resolved,
      unresolvedContradictions: unresolved,
      newBeliefs,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Escalate contradictions to the Queen coordinator
   */
  private async reconcileByEscalation(
    contradictions: Contradiction[],
    startTime: number
  ): Promise<ReconciliationResult> {
    // Emit escalation event for Queen to handle
    this.emit('escalation_requested', {
      contradictions,
      reason:
        this.consecutiveFailures >= this.config.failuresBeforeEscalate
          ? 'repeated_failures'
          : 'explicit_escalation',
      timestamp: Date.now(),
    });

    // Escalation is always "successful" in that we've deferred the decision
    // The contradictions are marked as unresolved until Queen responds
    return {
      success: true,
      strategy: 'escalate',
      resolvedContradictions: [],
      unresolvedContradictions: contradictions,
      newBeliefs: [],
      durationMs: Date.now() - startTime,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Get the beliefs involved in a contradiction
   */
  private getConflictingBeliefs(
    contradiction: Contradiction
  ): [Belief | null, Belief | null] {
    const [id1, id2] = contradiction.nodeIds;
    return [
      this.beliefStore.get(id1) || null,
      this.beliefStore.get(id2) || null,
    ];
  }

  /**
   * Create a new belief from reconciliation
   */
  private createReconciledBelief(
    primary: Belief,
    secondary: Belief,
    strategy: ReconciliationStrategy,
    metadata?: Record<string, unknown>
  ): Belief {
    return {
      id: uuidv4(),
      statement: primary.statement,
      embedding: primary.embedding,
      confidence: this.computeReconciledConfidence(primary, secondary, strategy),
      source: `reconciled:${strategy}`,
      timestamp: new Date(),
      evidence: [
        ...(primary.evidence || []),
        `Reconciled from ${primary.id} (${strategy})`,
        `Supersedes: ${secondary.id}`,
        ...(metadata ? [JSON.stringify(metadata)] : []),
      ],
    };
  }

  /**
   * Compute confidence for a reconciled belief
   */
  private computeReconciledConfidence(
    primary: Belief,
    secondary: Belief,
    strategy: ReconciliationStrategy
  ): number {
    switch (strategy) {
      case 'latest':
        // Newer belief gets a small boost if recent
        return Math.min(primary.confidence * 1.05, 1.0);

      case 'authority':
        // Authoritative belief keeps its confidence
        return primary.confidence;

      case 'consensus':
        // Consensus-backed belief gets a boost
        return Math.min(primary.confidence * 1.1, 1.0);

      case 'merge':
        // Merged belief gets the average confidence
        return (primary.confidence + secondary.confidence) / 2;

      case 'escalate':
        // Escalated beliefs get reduced confidence until resolved
        return primary.confidence * 0.8;

      default:
        return primary.confidence;
    }
  }

  /**
   * Compute cosine similarity between two embeddings
   */
  private computeEmbeddingSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) {
      return 0;
    }

    return dotProduct / magnitude;
  }

  /**
   * Merge two beliefs using category theory principles
   *
   * This implements a simplified pullback construction:
   * - Find the common "generalization" of both beliefs
   * - Create a new belief that captures both perspectives
   */
  private mergeBeliefsCategorial(
    belief1: Belief,
    belief2: Belief
  ): Belief | null {
    // Compute the merged embedding (midpoint in embedding space)
    const mergedEmbedding = belief1.embedding.map(
      (v, i) => (v + belief2.embedding[i]) / 2
    );

    // Normalize the merged embedding
    const norm = Math.sqrt(
      mergedEmbedding.reduce((sum, v) => sum + v * v, 0)
    );
    const normalizedEmbedding =
      norm > 0 ? mergedEmbedding.map((v) => v / norm) : mergedEmbedding;

    // Create a merged statement
    const mergedStatement = this.mergeStatements(
      belief1.statement,
      belief2.statement
    );

    // Combine evidence
    const combinedEvidence = [
      ...(belief1.evidence || []),
      ...(belief2.evidence || []),
      `Merged from: ${belief1.id} + ${belief2.id}`,
    ];

    return {
      id: uuidv4(),
      statement: mergedStatement,
      embedding: normalizedEmbedding,
      confidence: (belief1.confidence + belief2.confidence) / 2,
      source: `merged:${belief1.source}+${belief2.source}`,
      timestamp: new Date(),
      evidence: combinedEvidence,
    };
  }

  /**
   * Merge two statements into a combined statement
   */
  private mergeStatements(statement1: string, statement2: string): string {
    // Simple approach: combine both perspectives
    if (statement1 === statement2) {
      return statement1;
    }

    // Check if one is a subset of the other
    if (statement1.includes(statement2)) {
      return statement1;
    }
    if (statement2.includes(statement1)) {
      return statement2;
    }

    // Combine with conjunction
    return `${statement1} (merged with: ${statement2})`;
  }

  /**
   * Check if auto-escalation should be triggered
   */
  private shouldAutoEscalate(): boolean {
    return (
      this.config.autoEscalateOnFailure &&
      this.consecutiveFailures >= this.config.failuresBeforeEscalate
    );
  }

  /**
   * Add a reconciliation to history
   */
  private addToHistory(
    contradictions: Contradiction[],
    result: ReconciliationResult
  ): void {
    const record: ReconciliationRecord = {
      id: uuidv4(),
      contradictions,
      result,
      timestamp: Date.now(),
    };

    this.history.push(record);

    // Trim history if needed
    while (this.history.length > this.config.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * Emit an event to listeners
   */
  private emit(type: BeliefReconcilerEventType, data: unknown): void {
    const event: BeliefReconcilerEvent = {
      type,
      timestamp: Date.now(),
      data,
    };

    const listeners = this.eventListeners.get(type);
    if (listeners) {
      const listenerArray = Array.from(listeners);
      for (let i = 0; i < listenerArray.length; i++) {
        try {
          listenerArray[i](event);
        } catch (error) {
          // Non-critical: event listener errors should not affect other listeners
          console.debug('[BeliefReconciler] Event listener error:', error instanceof Error ? error.message : error);
        }
      }
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a belief reconciler with optional configuration
 *
 * @param config - Partial configuration to override defaults
 * @param options - Optional dependencies (vote collector, witness adapter)
 * @returns Configured BeliefReconciler instance
 *
 * @example
 * ```typescript
 * // Basic usage
 * const reconciler = createBeliefReconciler();
 *
 * // With custom configuration
 * const reconciler = createBeliefReconciler({
 *   defaultStrategy: 'consensus',
 *   consensusThreshold: 0.7
 * });
 *
 * // With dependencies
 * const reconciler = createBeliefReconciler(
 *   { enableWitness: true },
 *   {
 *     voteCollector: myVoteCollector,
 *     witnessAdapter: myWitnessAdapter
 *   }
 * );
 * ```
 */
export function createBeliefReconciler(
  config?: Partial<BeliefReconcilerConfig>,
  options?: {
    voteCollector?: IVoteCollector;
    witnessAdapter?: IWitnessAdapter;
  }
): BeliefReconciler {
  return new BeliefReconciler(config, options);
}
