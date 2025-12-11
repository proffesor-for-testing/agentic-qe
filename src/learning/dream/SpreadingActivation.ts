/**
 * SpreadingActivation - Activation propagation for Dream Engine
 *
 * Implements spreading activation algorithm for concept association
 * discovery. Simulates the neural activation patterns seen in memory
 * consolidation during sleep.
 *
 * Part of the Nightly-Learner Phase 2 implementation.
 *
 * @version 1.0.0
 * @module src/learning/dream/SpreadingActivation
 */

import { EventEmitter } from 'events';
import { ConceptGraph, ConceptNode } from './ConceptGraph';
import { Logger } from '../../utils/Logger';
import { SecureRandom } from '../../utils/SecureRandom';

export interface ActivationConfig {
  /** How fast activation decays (0-1). Default: 0.9 */
  decayRate: number;
  /** How much activation spreads to neighbors (0-1). Default: 0.5 */
  spreadFactor: number;
  /** Minimum activation to spread from a node. Default: 0.2 */
  threshold: number;
  /** Maximum iterations to prevent infinite loops. Default: 10 */
  maxIterations: number;
  /** Random activation noise for dreaming (0-1). Default: 0.1 */
  noise: number;
  /** Enable debug logging */
  debug?: boolean;
}

export interface Association {
  /** Co-activated node IDs */
  nodes: string[];
  /** Combined activation strength */
  strength: number;
  /** How unexpected this association is (0-1) */
  novelty: number;
  /** Types of nodes involved */
  nodeTypes: string[];
  /** When this association was detected */
  detectedAt: Date;
}

export interface ActivationResult {
  /** Number of spread iterations performed */
  iterations: number;
  /** Number of nodes that became activated */
  nodesActivated: number;
  /** Peak activation level reached */
  peakActivation: number;
  /** Associations discovered during activation */
  associations: Association[];
  /** Duration of activation spread in ms */
  duration: number;
}

export interface DreamResult {
  /** Total duration of dream cycle */
  duration: number;
  /** All associations discovered */
  associations: Association[];
  /** Novel associations (novelty > threshold) */
  novelAssociations: Association[];
  /** Number of random activations performed */
  randomActivations: number;
  /** Average novelty score */
  averageNovelty: number;
}

/**
 * SpreadingActivation implements neural-inspired activation spreading
 *
 * @example
 * ```typescript
 * const graph = new ConceptGraph();
 * const activation = new SpreadingActivation(graph, { noise: 0.2 });
 *
 * // Activate a concept and spread
 * const result = await activation.activate('pattern-1', 1.0);
 *
 * // Or run dream mode
 * const dreamResult = await activation.dream(5000); // 5 second dream
 * ```
 */
export class SpreadingActivation extends EventEmitter {
  private graph: ConceptGraph;
  private config: Required<ActivationConfig>;
  private logger: Logger;
  private activationHistory: Map<string, number[]> = new Map();

  constructor(graph: ConceptGraph, config?: Partial<ActivationConfig>) {
    super();
    this.graph = graph;
    this.logger = Logger.getInstance();

    this.config = {
      decayRate: 0.9,
      spreadFactor: 0.5,
      threshold: 0.2,
      maxIterations: 10,
      noise: 0.1,
      debug: false,
      ...config,
    };
  }

  /**
   * Activate a concept and spread activation to neighbors
   */
  async activate(conceptId: string, initialActivation: number = 1.0): Promise<ActivationResult> {
    const startTime = Date.now();
    const associations: Association[] = [];

    // Set initial activation
    const node = this.graph.getConcept(conceptId);
    if (!node) {
      return {
        iterations: 0,
        nodesActivated: 0,
        peakActivation: 0,
        associations: [],
        duration: 0,
      };
    }

    this.graph.setActivation(conceptId, initialActivation);
    this.recordActivation(conceptId, initialActivation);

    if (this.config.debug) {
      this.logger.debug('[SpreadingActivation] Starting activation', {
        conceptId,
        initialActivation,
      });
    }

    // Spread activation iteratively
    let iteration = 0;
    let peakActivation = initialActivation;

    while (iteration < this.config.maxIterations) {
      const activeNodes = this.graph.getActiveNodes(this.config.threshold);

      if (activeNodes.length === 0) {
        if (this.config.debug) {
          this.logger.debug('[SpreadingActivation] No active nodes, stopping');
        }
        break;
      }

      // Spread from each active node
      for (const activeNode of activeNodes) {
        const edges = this.graph.getEdges(activeNode.id);

        for (const edge of edges) {
          const targetNode = this.graph.getConcept(edge.target);
          if (!targetNode) continue;

          // Calculate spread amount
          const spreadAmount = activeNode.activationLevel * edge.weight * this.config.spreadFactor;
          const newActivation = Math.min(1, targetNode.activationLevel + spreadAmount);

          this.graph.setActivation(edge.target, newActivation);
          this.recordActivation(edge.target, newActivation);

          if (newActivation > peakActivation) {
            peakActivation = newActivation;
          }
        }
      }

      // Decay all activations
      this.graph.decayActivations(this.config.decayRate);

      // Detect co-activations (potential insights)
      const coActivated = this.graph.getActiveNodes(0.5);
      if (coActivated.length >= 2) {
        const association = this.detectAssociation(coActivated);
        associations.push(association);
        this.emit('association:detected', association);
      }

      iteration++;
    }

    const result: ActivationResult = {
      iterations: iteration,
      nodesActivated: this.graph.getActiveNodes(0.1).length,
      peakActivation,
      associations,
      duration: Date.now() - startTime,
    };

    if (this.config.debug) {
      this.logger.debug('[SpreadingActivation] Activation complete', {
        iterations: result.iterations,
        nodesActivated: result.nodesActivated,
        associations: result.associations.length,
      });
    }

    return result;
  }

  /**
   * Dream mode: Random activation with increased noise
   * Simulates the "reduced logical filtering" of REM sleep
   */
  async dream(durationMs: number): Promise<DreamResult> {
    const startTime = Date.now();
    const associations: Association[] = [];
    let randomActivations = 0;

    this.logger.info('[SpreadingActivation] Starting dream cycle', { durationMs });

    while (Date.now() - startTime < durationMs) {
      // Get all concepts
      const allNodes = this.graph.getAllConcepts(0);

      if (allNodes.length === 0) {
        await this.sleep(100);
        continue;
      }

      // Randomly select a concept to activate
      const randomIndex = Math.floor(SecureRandom.randomFloat() * allNodes.length);
      const randomNode = allNodes[randomIndex];

      if (randomNode) {
        // Apply noise to activation
        const noiseActivation = this.config.noise + SecureRandom.randomFloat() * this.config.noise;
        const currentActivation = randomNode.activationLevel;
        const newActivation = Math.min(1, currentActivation + noiseActivation);

        this.graph.setActivation(randomNode.id, newActivation);
        randomActivations++;

        // Let activation spread
        const result = await this.activate(randomNode.id, newActivation);
        associations.push(...result.associations);

        this.emit('dream:activation', {
          nodeId: randomNode.id,
          activation: newActivation,
          associations: result.associations.length,
        });
      }

      // Small delay to prevent CPU spike and allow for graceful interruption
      await this.sleep(50 + SecureRandom.randomFloat() * 50);
    }

    // Filter to novel associations
    const novelAssociations = this.filterNovelAssociations(associations);

    const averageNovelty = associations.length > 0
      ? associations.reduce((sum, a) => sum + a.novelty, 0) / associations.length
      : 0;

    const result: DreamResult = {
      duration: Date.now() - startTime,
      associations,
      novelAssociations,
      randomActivations,
      averageNovelty,
    };

    this.logger.info('[SpreadingActivation] Dream cycle complete', {
      duration: result.duration,
      totalAssociations: associations.length,
      novelAssociations: novelAssociations.length,
      randomActivations,
      averageNovelty: averageNovelty.toFixed(3),
    });

    this.emit('dream:complete', result);
    return result;
  }

  /**
   * Detect an association from co-activated nodes
   */
  private detectAssociation(nodes: ConceptNode[]): Association {
    const strength = nodes.reduce((sum, n) => sum + n.activationLevel, 0) / nodes.length;
    const novelty = this.calculateNovelty(nodes);

    return {
      nodes: nodes.map(n => n.id),
      strength,
      novelty,
      nodeTypes: nodes.map(n => n.type),
      detectedAt: new Date(),
    };
  }

  /**
   * Calculate novelty score for a set of co-activated nodes
   *
   * Novelty is higher when:
   * 1. Nodes have different types
   * 2. Nodes have low/no edge weights between them
   * 3. Nodes haven't been co-activated frequently before
   */
  private calculateNovelty(nodes: ConceptNode[]): number {
    let novelty = 0;

    // Type diversity (more diverse = more novel)
    const types = new Set(nodes.map(n => n.type));
    const typeDiversity = types.size / 4; // 4 possible types
    novelty += typeDiversity * 0.4;

    // Edge weakness (weaker/missing edges = more novel)
    let edgeScore = 0;
    let edgeCount = 0;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const edge = this.graph.getEdge(nodes[i].id, nodes[j].id);
        if (!edge) {
          edgeScore += 1.0; // No edge = maximum novelty
        } else {
          edgeScore += (1 - edge.weight); // Weaker edge = more novel
        }
        edgeCount++;
      }
    }

    if (edgeCount > 0) {
      novelty += (edgeScore / edgeCount) * 0.4;
    }

    // Co-activation history (less frequent = more novel)
    const historyScore = this.calculateHistoryNovelty(nodes);
    novelty += historyScore * 0.2;

    return Math.min(1, novelty);
  }

  /**
   * Calculate novelty based on activation history
   */
  private calculateHistoryNovelty(nodes: ConceptNode[]): number {
    // Check if these nodes have been co-activated before
    const nodeIds = nodes.map(n => n.id).sort();
    const historyKey = nodeIds.join(':');

    // Simple heuristic: newer activations are more novel
    let novelty = 1.0;

    for (const node of nodes) {
      const history = this.activationHistory.get(node.id) || [];
      if (history.length > 5) {
        novelty -= 0.1; // Reduce novelty for frequently activated nodes
      }
    }

    return Math.max(0, novelty);
  }

  /**
   * Record activation for history tracking
   */
  private recordActivation(nodeId: string, level: number): void {
    const history = this.activationHistory.get(nodeId) || [];
    history.push(level);

    // Keep only recent history
    if (history.length > 100) {
      history.shift();
    }

    this.activationHistory.set(nodeId, history);
  }

  /**
   * Filter to keep only novel associations
   */
  private filterNovelAssociations(associations: Association[]): Association[] {
    // Remove duplicates based on node sets
    const unique = new Map<string, Association>();

    for (const assoc of associations) {
      const key = assoc.nodes.sort().join(':');
      const existing = unique.get(key);

      if (!existing || assoc.novelty > existing.novelty) {
        unique.set(key, assoc);
      }
    }

    // Filter by novelty threshold and sort
    return Array.from(unique.values())
      .filter(a => a.novelty > 0.5)
      .sort((a, b) => b.novelty - a.novelty)
      .slice(0, 10); // Top 10 novel associations
  }

  /**
   * Reset all activations
   */
  resetActivations(): void {
    const allNodes = this.graph.getAllConcepts(0);
    for (const node of allNodes) {
      this.graph.setActivation(node.id, 0);
    }
    this.activationHistory.clear();
  }

  /**
   * Get configuration
   */
  getConfig(): ActivationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ActivationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Helper to sleep for a duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default SpreadingActivation;
