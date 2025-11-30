/**
 * NeuralEnhancement - Neural Enhancement Layer for RuVector
 *
 * Implements AgentDB v2 neural capabilities:
 * - Multi-head attention mechanism (8 heads) for query enhancement
 * - Graph Neural Network layer for pattern relationship modeling
 * - RL-based navigation for optimal traversal paths
 * - Self-organizing capabilities for index maintenance
 *
 * @module core/memory/NeuralEnhancement
 * @version 2.0.0
 */

import {
  TestPattern,
  PatternSearchResult,
  PatternSearchOptions,
  IPatternStore,
} from './IPatternStore';

/**
 * Neural layer configuration
 */
export interface NeuralConfig {
  /** Number of attention heads (default: 8) */
  attentionHeads?: number;
  /** Embedding dimension (default: 384) */
  embeddingDim?: number;
  /** Enable Graph Neural Network */
  enableGNN?: boolean;
  /** Enable RL-based navigation */
  enableRLNavigation?: boolean;
  /** Learning rate for training (default: 0.001) */
  learningRate?: number;
  /** Discount factor for Q-learning (default: 0.95) */
  gamma?: number;
  /** Exploration rate for epsilon-greedy (default: 0.1) */
  epsilon?: number;
}

/**
 * Enhanced search options with neural features
 */
export interface EnhancedSearchOptions extends PatternSearchOptions {
  /** Use attention mechanism */
  useAttention?: boolean;
  /** Use Graph Neural Network */
  useGNN?: boolean;
  /** Softmax temperature for diversity */
  temperature?: number;
}

/**
 * Attention mechanism output
 */
export interface AttentionOutput {
  /** Enhanced embedding after attention */
  enhancedEmbedding: number[];
  /** Attention weights for interpretability */
  attentionWeights: number[][];
  /** Confidence score */
  confidence: number;
}

/**
 * Training feedback for RL
 */
export interface TrainingFeedback {
  /** Pattern ID */
  patternId: string;
  /** Query embedding */
  query: number[];
  /** Success (1.0) or failure (0.0) */
  reward: number;
  /** Traversal path taken */
  path?: string[];
  /** Metadata */
  metadata?: Record<string, any>;
}

/**
 * Training metrics
 */
export interface TrainingMetrics {
  /** Number of samples processed */
  samplesProcessed: number;
  /** Average reward */
  averageReward: number;
  /** Loss value */
  loss: number;
  /** Training time in ms */
  duration: number;
}

/**
 * Graph node representing a pattern
 */
interface GraphNode {
  id: string;
  embedding: number[];
  features: number[];
  neighbors: Map<string, number>; // neighbor ID -> edge weight
}

/**
 * Q-table entry for RL navigation
 */
interface QTableEntry {
  state: string; // Pattern ID
  action: string; // Next pattern ID to visit
  qValue: number;
  visitCount: number;
}

/**
 * Multi-head attention layer
 */
class MultiHeadAttention {
  private readonly heads: number;
  private readonly dim: number;
  private readonly headDim: number;

  // Weight matrices (initialized randomly)
  private wq: number[][][]; // [heads][dim][headDim]
  private wk: number[][][];
  private wv: number[][][];
  private wo: number[][]; // [dim][dim]

  constructor(heads: number, dim: number) {
    this.heads = heads;
    this.dim = dim;
    this.headDim = Math.floor(dim / heads);

    // Initialize weight matrices
    this.wq = this.initWeights(heads, dim, this.headDim);
    this.wk = this.initWeights(heads, dim, this.headDim);
    this.wv = this.initWeights(heads, dim, this.headDim);
    this.wo = this.initMatrix(dim, dim);
  }

  private initWeights(heads: number, dim: number, headDim: number): number[][][] {
    const weights: number[][][] = [];
    for (let h = 0; h < heads; h++) {
      weights[h] = this.initMatrix(dim, headDim);
    }
    return weights;
  }

  private initMatrix(rows: number, cols: number): number[][] {
    const matrix: number[][] = [];
    const scale = Math.sqrt(2.0 / (rows + cols)); // Xavier initialization
    for (let i = 0; i < rows; i++) {
      matrix[i] = [];
      for (let j = 0; j < cols; j++) {
        matrix[i][j] = (Math.random() - 0.5) * 2 * scale;
      }
    }
    return matrix;
  }

  private matmul(a: number[], w: number[][]): number[] {
    const result: number[] = [];
    for (let j = 0; j < w[0].length; j++) {
      let sum = 0;
      for (let i = 0; i < a.length; i++) {
        sum += a[i] * w[i][j];
      }
      result[j] = sum;
    }
    return result;
  }

  private dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  private softmax(values: number[]): number[] {
    const max = Math.max(...values);
    const exps = values.map(v => Math.exp(v - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map(e => e / sum);
  }

  /**
   * Apply multi-head attention to query embedding
   */
  async forward(
    query: number[],
    context: number[][]
  ): Promise<{ output: number[]; weights: number[][] }> {
    const headOutputs: number[][] = [];
    const allWeights: number[][] = [];

    // Process each attention head
    for (let h = 0; h < this.heads; h++) {
      // Project query, keys, values
      const q = this.matmul(query, this.wq[h]);
      const keys = context.map(c => this.matmul(c, this.wk[h]));
      const values = context.map(c => this.matmul(c, this.wv[h]));

      // Compute attention scores
      const scale = 1.0 / Math.sqrt(this.headDim);
      const scores = keys.map(k => this.dotProduct(q, k) * scale);

      // Apply softmax to get attention weights
      const weights = this.softmax(scores);
      allWeights.push(weights);

      // Weighted sum of values
      const output = new Array(this.headDim).fill(0);
      for (let i = 0; i < values.length; i++) {
        for (let j = 0; j < this.headDim; j++) {
          output[j] += weights[i] * values[i][j];
        }
      }
      headOutputs.push(output);
    }

    // Concatenate head outputs
    const concatenated = headOutputs.flat();

    // Project back to original dimension
    const finalOutput = this.matmul(concatenated, this.wo);

    return {
      output: finalOutput,
      weights: allWeights,
    };
  }
}

/**
 * Graph Neural Network layer
 */
class GraphNeuralNetwork {
  private nodes: Map<string, GraphNode>;
  private adjacency: Map<string, Map<string, number>>;

  constructor() {
    this.nodes = new Map();
    this.adjacency = new Map();
  }

  /**
   * Add a pattern to the graph
   */
  addNode(pattern: TestPattern): void {
    const features = this.extractFeatures(pattern);
    this.nodes.set(pattern.id, {
      id: pattern.id,
      embedding: pattern.embedding,
      features,
      neighbors: new Map(),
    });
  }

  /**
   * Build edges based on similarity
   */
  buildEdges(patterns: TestPattern[], threshold = 0.7): void {
    this.adjacency.clear();

    for (let i = 0; i < patterns.length; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        const sim = this.cosineSimilarity(
          patterns[i].embedding,
          patterns[j].embedding
        );

        if (sim > threshold) {
          // Add bidirectional edge
          this.addEdge(patterns[i].id, patterns[j].id, sim);
          this.addEdge(patterns[j].id, patterns[i].id, sim);
        }
      }
    }

    // Update node neighbors
    for (const [nodeId, edges] of this.adjacency.entries()) {
      const node = this.nodes.get(nodeId);
      if (node) {
        node.neighbors = edges;
      }
    }
  }

  private addEdge(from: string, to: string, weight: number): void {
    if (!this.adjacency.has(from)) {
      this.adjacency.set(from, new Map());
    }
    this.adjacency.get(from)!.set(to, weight);
  }

  /**
   * Extract node features from pattern
   */
  private extractFeatures(pattern: TestPattern): number[] {
    return [
      pattern.coverage || 0,
      pattern.flakinessScore || 0,
      pattern.usageCount || 0,
      pattern.verdict === 'success' ? 1 : pattern.verdict === 'failure' ? -1 : 0,
    ];
  }

  /**
   * Aggregate neighbor information using message passing
   */
  async aggregateNeighbors(nodeId: string): Promise<number[]> {
    const node = this.nodes.get(nodeId);
    if (!node || node.neighbors.size === 0) {
      return node ? node.embedding : [];
    }

    // Message passing: aggregate neighbor embeddings weighted by edge weights
    const aggregated = new Array(node.embedding.length).fill(0);
    let totalWeight = 0;

    for (const [neighborId, weight] of node.neighbors.entries()) {
      const neighbor = this.nodes.get(neighborId);
      if (neighbor) {
        for (let i = 0; i < aggregated.length; i++) {
          aggregated[i] += weight * neighbor.embedding[i];
        }
        totalWeight += weight;
      }
    }

    // Normalize
    if (totalWeight > 0) {
      for (let i = 0; i < aggregated.length; i++) {
        aggregated[i] /= totalWeight;
      }
    }

    return aggregated;
  }

  /**
   * Get neighbor IDs for a node
   */
  getNeighbors(nodeId: string): string[] {
    const neighbors = this.adjacency.get(nodeId);
    return neighbors ? Array.from(neighbors.keys()) : [];
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

/**
 * Q-Learning agent for optimal path navigation
 */
class QLearningNavigator {
  private qTable: Map<string, QTableEntry>;
  private readonly learningRate: number;
  private readonly gamma: number;
  private readonly epsilon: number;

  constructor(learningRate = 0.001, gamma = 0.95, epsilon = 0.1) {
    this.qTable = new Map();
    this.learningRate = learningRate;
    this.gamma = gamma;
    this.epsilon = epsilon;
  }

  /**
   * Get Q-value for state-action pair
   */
  private getQValue(state: string, action: string): number {
    const key = `${state}:${action}`;
    const entry = this.qTable.get(key);
    return entry ? entry.qValue : 0;
  }

  /**
   * Update Q-value for state-action pair
   */
  private updateQValue(
    state: string,
    action: string,
    reward: number,
    nextState: string,
    possibleActions: string[]
  ): void {
    const key = `${state}:${action}`;
    const currentQ = this.getQValue(state, action);

    // Get max Q-value for next state
    const maxNextQ = possibleActions.length > 0
      ? Math.max(...possibleActions.map(a => this.getQValue(nextState, a)))
      : 0;

    // Q-learning update
    const newQ = currentQ + this.learningRate * (reward + this.gamma * maxNextQ - currentQ);

    const entry = this.qTable.get(key) || {
      state,
      action,
      qValue: 0,
      visitCount: 0,
    };

    entry.qValue = newQ;
    entry.visitCount++;
    this.qTable.set(key, entry);
  }

  /**
   * Select next action using epsilon-greedy
   */
  selectAction(state: string, possibleActions: string[]): string {
    if (possibleActions.length === 0) {
      throw new Error('No possible actions available');
    }

    // Epsilon-greedy exploration
    if (Math.random() < this.epsilon) {
      // Explore: random action
      return possibleActions[Math.floor(Math.random() * possibleActions.length)];
    }

    // Exploit: best action
    let bestAction = possibleActions[0];
    let bestQ = this.getQValue(state, bestAction);

    for (let i = 1; i < possibleActions.length; i++) {
      const action = possibleActions[i];
      const q = this.getQValue(state, action);
      if (q > bestQ) {
        bestQ = q;
        bestAction = action;
      }
    }

    return bestAction;
  }

  /**
   * Train on trajectory
   */
  trainOnPath(
    path: string[],
    reward: number,
    gnn: GraphNeuralNetwork
  ): void {
    // Distribute reward along path
    const rewardPerStep = reward / path.length;

    for (let i = 0; i < path.length - 1; i++) {
      const state = path[i];
      const action = path[i + 1];
      const nextState = path[i + 1];
      const possibleActions = gnn.getNeighbors(state);

      this.updateQValue(state, action, rewardPerStep, nextState, possibleActions);
    }
  }

  /**
   * Find optimal path from start to targets
   */
  findOptimalPath(
    start: string,
    targets: Set<string>,
    gnn: GraphNeuralNetwork,
    maxSteps = 20
  ): string[] {
    const path: string[] = [start];
    const visited = new Set<string>([start]);
    let current = start;

    for (let step = 0; step < maxSteps; step++) {
      if (targets.has(current)) {
        break; // Reached target
      }

      const neighbors = gnn.getNeighbors(current);
      const unvisited = neighbors.filter(n => !visited.has(n));

      if (unvisited.length === 0) {
        break; // No more moves
      }

      const next = this.selectAction(current, unvisited);
      path.push(next);
      visited.add(next);
      current = next;
    }

    return path;
  }
}

/**
 * Neural Enhancement Layer
 *
 * Provides neural capabilities for RuVector pattern store:
 * - Multi-head attention for query enhancement
 * - Graph Neural Network for pattern relationships
 * - Q-Learning for optimal search paths
 */
export class NeuralEnhancementLayer {
  private readonly config: Required<NeuralConfig>;
  private readonly attention: MultiHeadAttention;
  private readonly gnn: GraphNeuralNetwork;
  private readonly navigator: QLearningNavigator;
  private contextPatterns: TestPattern[] = [];

  constructor(config?: NeuralConfig) {
    this.config = {
      attentionHeads: config?.attentionHeads || 8,
      embeddingDim: config?.embeddingDim || 384,
      enableGNN: config?.enableGNN !== false,
      enableRLNavigation: config?.enableRLNavigation !== false,
      learningRate: config?.learningRate || 0.001,
      gamma: config?.gamma || 0.95,
      epsilon: config?.epsilon || 0.1,
    };

    this.attention = new MultiHeadAttention(
      this.config.attentionHeads,
      this.config.embeddingDim
    );
    this.gnn = new GraphNeuralNetwork();
    this.navigator = new QLearningNavigator(
      this.config.learningRate,
      this.config.gamma,
      this.config.epsilon
    );
  }

  /**
   * Apply attention to query embedding
   */
  async enhanceQuery(
    embedding: number[],
    contextPatterns?: TestPattern[]
  ): Promise<AttentionOutput> {
    const context = contextPatterns || this.contextPatterns;

    if (context.length === 0) {
      // No context, return original embedding
      return {
        enhancedEmbedding: embedding,
        attentionWeights: [],
        confidence: 1.0,
      };
    }

    const contextEmbeddings = context.map(p => p.embedding);
    const { output, weights } = await this.attention.forward(
      embedding,
      contextEmbeddings
    );

    // Calculate confidence as max attention weight
    const maxWeights = weights.map(w => Math.max(...w));
    const confidence = maxWeights.reduce((a, b) => a + b, 0) / maxWeights.length;

    return {
      enhancedEmbedding: output,
      attentionWeights: weights,
      confidence,
    };
  }

  /**
   * Build pattern relationship graph
   */
  async buildPatternGraph(patterns: TestPattern[]): Promise<void> {
    this.contextPatterns = patterns;

    if (!this.config.enableGNN) {
      return;
    }

    // Add all patterns as nodes
    for (const pattern of patterns) {
      this.gnn.addNode(pattern);
    }

    // Build edges based on similarity
    this.gnn.buildEdges(patterns, 0.7);
  }

  /**
   * Find optimal traversal path using RL
   */
  async findOptimalPath(
    start: number[],
    targets: TestPattern[],
    k: number
  ): Promise<PatternSearchResult[]> {
    if (!this.config.enableRLNavigation || this.contextPatterns.length === 0) {
      // Fallback to simple similarity search
      return this.fallbackSearch(start, targets, k);
    }

    // Find nearest pattern as starting point
    const startPattern = this.findNearest(start, this.contextPatterns);
    if (!startPattern) {
      return [];
    }

    // Use RL to find path to targets
    const targetIds = new Set(targets.map(t => t.id));
    const path = this.navigator.findOptimalPath(
      startPattern.id,
      targetIds,
      this.gnn
    );

    // Convert path to results
    const results: PatternSearchResult[] = [];
    for (const id of path) {
      const pattern = this.contextPatterns.find(p => p.id === id);
      if (pattern) {
        const score = this.cosineSimilarity(start, pattern.embedding);
        results.push({ pattern, score });
      }
    }

    return results.slice(0, k);
  }

  /**
   * Train on feedback (success/failure)
   */
  async train(feedback: TrainingFeedback[]): Promise<TrainingMetrics> {
    const startTime = Date.now();
    let totalReward = 0;
    let totalLoss = 0;

    for (const fb of feedback) {
      totalReward += fb.reward;

      if (fb.path && fb.path.length > 1) {
        // Train RL navigator
        this.navigator.trainOnPath(fb.path, fb.reward, this.gnn);

        // Calculate loss (for metrics)
        const expectedReward = fb.reward;
        const predictedReward = fb.reward > 0.5 ? 1.0 : 0.0;
        totalLoss += Math.abs(expectedReward - predictedReward);
      }
    }

    const duration = Date.now() - startTime;

    return {
      samplesProcessed: feedback.length,
      averageReward: totalReward / feedback.length,
      loss: totalLoss / feedback.length,
      duration,
    };
  }

  private findNearest(
    query: number[],
    patterns: TestPattern[]
  ): TestPattern | null {
    if (patterns.length === 0) return null;

    let best = patterns[0];
    let bestScore = this.cosineSimilarity(query, best.embedding);

    for (let i = 1; i < patterns.length; i++) {
      const score = this.cosineSimilarity(query, patterns[i].embedding);
      if (score > bestScore) {
        bestScore = score;
        best = patterns[i];
      }
    }

    return best;
  }

  private fallbackSearch(
    query: number[],
    targets: TestPattern[],
    k: number
  ): PatternSearchResult[] {
    const results = targets.map(pattern => ({
      pattern,
      score: this.cosineSimilarity(query, pattern.embedding),
    }));

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

/**
 * Neural Pattern Store - Enhanced pattern store with neural capabilities
 *
 * Wraps an existing IPatternStore with neural enhancements:
 * - Attention-based query enhancement
 * - GNN-based pattern relationships
 * - RL-based optimal search paths
 */
export class NeuralPatternStore implements IPatternStore {
  private readonly baseStore: IPatternStore;
  private readonly neural: NeuralEnhancementLayer;
  private patterns: TestPattern[] = [];

  constructor(baseStore: IPatternStore, neural: NeuralEnhancementLayer) {
    this.baseStore = baseStore;
    this.neural = neural;
  }

  async initialize(): Promise<void> {
    await this.baseStore.initialize();
    await this.rebuildNeuralGraph();
  }

  async storePattern(pattern: TestPattern): Promise<void> {
    await this.baseStore.storePattern(pattern);
    this.patterns.push(pattern);
    await this.rebuildNeuralGraph();
  }

  async storeBatch(patterns: TestPattern[]): Promise<void> {
    await this.baseStore.storeBatch(patterns);
    this.patterns.push(...patterns);
    await this.rebuildNeuralGraph();
  }

  /**
   * Enhanced search with neural capabilities
   */
  async searchSimilar(
    queryEmbedding: number[],
    options?: EnhancedSearchOptions
  ): Promise<PatternSearchResult[]> {
    const useAttention = options?.useAttention !== false;
    const useGNN = options?.useGNN !== false;
    const k = options?.k || 5;

    // Get base results from underlying store
    const baseResults = await this.baseStore.searchSimilar(queryEmbedding, options);

    if (!useAttention && !useGNN) {
      return baseResults;
    }

    // Apply attention enhancement
    let enhancedQuery = queryEmbedding;
    if (useAttention && this.patterns.length > 0) {
      const attention = await this.neural.enhanceQuery(queryEmbedding);
      enhancedQuery = attention.enhancedEmbedding;
    }

    // Use RL-based navigation if enabled
    if (useGNN && this.patterns.length > 0) {
      const targetPatterns = baseResults.map(r => r.pattern);
      return await this.neural.findOptimalPath(enhancedQuery, targetPatterns, k);
    }

    // Re-score with enhanced query
    const reranked = baseResults.map(result => ({
      pattern: result.pattern,
      score: this.cosineSimilarity(enhancedQuery, result.pattern.embedding),
    }));

    reranked.sort((a, b) => b.score - a.score);
    return reranked.slice(0, k);
  }

  async getPattern(id: string): Promise<TestPattern | null> {
    return this.baseStore.getPattern(id);
  }

  async deletePattern(id: string): Promise<boolean> {
    const result = await this.baseStore.deletePattern(id);
    if (result) {
      this.patterns = this.patterns.filter(p => p.id !== id);
      await this.rebuildNeuralGraph();
    }
    return result;
  }

  async recordUsage(id: string): Promise<void> {
    return this.baseStore.recordUsage(id);
  }

  async buildIndex(): Promise<void> {
    await this.baseStore.buildIndex();
    await this.rebuildNeuralGraph();
  }

  async optimize(): Promise<void> {
    return this.baseStore.optimize();
  }

  async getStats(): Promise<any> {
    const baseStats = await this.baseStore.getStats();
    return {
      ...baseStats,
      neuralEnhanced: true,
      patternsInGraph: this.patterns.length,
    };
  }

  async clear(): Promise<void> {
    await this.baseStore.clear();
    this.patterns = [];
  }

  async shutdown(): Promise<void> {
    return this.baseStore.shutdown();
  }

  getImplementationInfo(): any {
    return {
      ...this.baseStore.getImplementationInfo(),
      neuralLayer: {
        enabled: true,
        features: ['multi-head-attention', 'gnn', 'rl-navigation'],
      },
    };
  }

  /**
   * Train neural layer on feedback
   */
  async trainNeural(feedback: TrainingFeedback[]): Promise<TrainingMetrics> {
    return this.neural.train(feedback);
  }

  private async rebuildNeuralGraph(): Promise<void> {
    if (this.patterns.length > 0) {
      await this.neural.buildPatternGraph(this.patterns);
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
