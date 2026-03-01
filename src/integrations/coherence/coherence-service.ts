/**
 * Agentic QE v3 - Coherence Service
 *
 * Main facade that wraps all 6 Prime Radiant engines for coherence verification.
 * Provides mathematical coherence gates for multi-agent coordination.
 *
 * **Architecture Overview:**
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                    AQE v3 COHERENCE ARCHITECTURE                    │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │                                                                     │
 * │  ┌────────────────┐     ┌─────────────────────┐     ┌────────────┐ │
 * │  │ QE Agent       │────▶│ COHERENCE GATE      │────▶│ Execution  │ │
 * │  │ Decision       │     │ (Prime Radiant)     │     │ Layer      │ │
 * │  └────────────────┘     └─────────────────────┘     └────────────┘ │
 * │                                │                                    │
 * │                    ┌───────────┼───────────┐                       │
 * │                    ▼           ▼           ▼                       │
 * │              ┌──────────┐ ┌──────────┐ ┌──────────┐                │
 * │              │ REFLEX   │ │ RETRIEVAL│ │ ESCALATE │                │
 * │              │ E < 0.1  │ │ E: 0.1-0.4│ │ E > 0.4  │                │
 * │              │ <1ms     │ │ ~10ms    │ │ Queen    │                │
 * │              └──────────┘ └──────────┘ └──────────┘                │
 * │                                                                     │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * @module integrations/coherence/coherence-service
 */

import type {
  CoherenceNode,
  CoherenceResult,
  CoherenceServiceConfig,
  CoherenceStats,
  ComputeLane,
  ComputeLaneConfig,
  Belief,
  Contradiction,
  SwarmState,
  AgentHealth,
  CollapseRisk,
  CausalData,
  CausalVerification,
  TypedPipeline,
  TypeVerification,
  Decision,
  WitnessRecord,
  ReplayResult,
  AgentVote,
  ConsensusResult,
  HasEmbedding,
  IWasmLoader,
  CoherenceLogger,
} from './types';

import {
  DEFAULT_COHERENCE_CONFIG,
  DEFAULT_LANE_CONFIG,
  DEFAULT_COHERENCE_LOGGER,
  WasmNotLoadedError,
  CoherenceError,
  CoherenceCheckError,
  CoherenceTimeoutError,
} from './types';

import { toErrorMessage, toError } from '../../shared/error-utils.js';
import {
  CohomologyAdapter,
  SpectralAdapter,
  CausalAdapter,
  CategoryAdapter,
  HomotopyAdapter,
  WitnessAdapter,
} from './engines';

// ============================================================================
// Coherence Service Interface
// ============================================================================

/**
 * Interface for the main Coherence Service
 */
export interface ICoherenceService {
  /**
   * Initialize the service (loads WASM modules)
   */
  initialize(): Promise<void>;

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean;

  /**
   * Core coherence checking for a set of nodes
   *
   * @param nodes - Nodes to check for coherence
   * @returns Coherence result with energy, lane, and contradictions
   */
  checkCoherence(nodes: CoherenceNode[]): Promise<CoherenceResult>;

  /**
   * Detect contradictions in a set of beliefs
   *
   * @param beliefs - Beliefs to check for contradictions
   * @returns Array of detected contradictions
   */
  detectContradictions(beliefs: Belief[]): Promise<Contradiction[]>;

  /**
   * Predict collapse risk for a swarm
   *
   * @param state - Current swarm state
   * @returns Collapse risk assessment
   */
  predictCollapse(state: SwarmState): Promise<CollapseRisk>;

  /**
   * Verify a causal relationship
   *
   * @param cause - Name of the cause variable
   * @param effect - Name of the effect variable
   * @param data - Observation data
   * @returns Causal verification result
   */
  verifyCausality(cause: string, effect: string, data: CausalData): Promise<CausalVerification>;

  /**
   * Verify type consistency in a pipeline
   *
   * @param pipeline - Typed pipeline to verify
   * @returns Type verification result
   */
  verifyTypes(pipeline: TypedPipeline): Promise<TypeVerification>;

  /**
   * Create a witness record for a decision
   *
   * @param decision - Decision to witness
   * @returns Witness record
   */
  createWitness(decision: Decision): Promise<WitnessRecord>;

  /**
   * Replay a decision from a witness
   *
   * @param witnessId - ID of the witness to replay from
   * @returns Replay result
   */
  replayFromWitness(witnessId: string): Promise<ReplayResult>;

  /**
   * Check coherence of swarm agents
   *
   * @param agentHealth - Map of agent ID to health state
   * @returns Coherence result for the swarm
   */
  checkSwarmCoherence(agentHealth: Map<string, AgentHealth>): Promise<CoherenceResult>;

  /**
   * Verify multi-agent consensus mathematically
   *
   * @param votes - Array of agent votes
   * @returns Consensus verification result
   */
  verifyConsensus(votes: AgentVote[]): Promise<ConsensusResult>;

  /**
   * Filter items to only return coherent ones
   *
   * @param items - Items with embeddings to filter
   * @param context - Context for coherence checking
   * @returns Filtered items that are coherent with context
   */
  filterCoherent<T extends HasEmbedding>(items: T[], context: unknown): Promise<T[]>;

  /**
   * Get service statistics
   */
  getStats(): CoherenceStats;

  /**
   * Dispose of service resources
   */
  dispose(): Promise<void>;
}

// ============================================================================
// Coherence Service Implementation
// ============================================================================

/**
 * Main Coherence Service implementation
 *
 * Provides a unified interface to all 6 Prime Radiant engines:
 * 1. CohomologyEngine - Sheaf cohomology for contradiction detection
 * 2. SpectralEngine - Spectral analysis for collapse prediction
 * 3. CausalEngine - Causal inference for spurious correlation detection
 * 4. CategoryEngine - Category theory for type verification
 * 5. HomotopyEngine - HoTT for formal verification
 * 6. WitnessEngine - Blake3 witness chains for audit trails
 *
 * @example
 * ```typescript
 * const service = new CoherenceService(wasmLoader);
 * await service.initialize();
 *
 * // Check coherence
 * const result = await service.checkCoherence(nodes);
 * if (!result.isCoherent) {
 *   console.log('Contradictions found:', result.contradictions);
 * }
 *
 * // Route based on lane
 * switch (result.lane) {
 *   case 'reflex': return executeImmediately();
 *   case 'retrieval': return fetchContextAndRetry();
 *   case 'heavy': return deepAnalysis();
 *   case 'human': return escalateToQueen();
 * }
 * ```
 */
export class CoherenceService implements ICoherenceService {
  private readonly config: CoherenceServiceConfig;
  private readonly logger: CoherenceLogger;

  // Engine adapters
  private cohomologyAdapter: CohomologyAdapter | null = null;
  private spectralAdapter: SpectralAdapter | null = null;
  private causalAdapter: CausalAdapter | null = null;
  private categoryAdapter: CategoryAdapter | null = null;
  private homotopyAdapter: HomotopyAdapter | null = null;
  private witnessAdapter: WitnessAdapter | null = null;

  private initialized = false;

  // Statistics
  private stats: CoherenceStats = {
    totalChecks: 0,
    coherentCount: 0,
    incoherentCount: 0,
    averageEnergy: 0,
    averageDurationMs: 0,
    totalContradictions: 0,
    laneDistribution: { reflex: 0, retrieval: 0, heavy: 0, human: 0 },
    fallbackCount: 0,
    wasmAvailable: false,
  };

  private totalEnergySum = 0;
  private totalDurationSum = 0;

  /**
   * Create a new CoherenceService
   *
   * @param wasmLoader - WASM module loader (dependency injection)
   * @param config - Optional service configuration
   * @param logger - Optional logger for diagnostics
   */
  constructor(
    private readonly wasmLoader: IWasmLoader,
    config: Partial<CoherenceServiceConfig> = {},
    logger?: CoherenceLogger
  ) {
    this.config = { ...DEFAULT_COHERENCE_CONFIG, ...config };
    this.logger = logger || DEFAULT_COHERENCE_LOGGER;
  }

  /**
   * Initialize the service by loading all WASM modules
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.info('Initializing CoherenceService');

    const isAvailable = await this.wasmLoader.isAvailable();

    if (!isAvailable && !this.config.fallbackEnabled) {
      throw new WasmNotLoadedError(
        'WASM module is not available and fallback is disabled. ' +
        'Enable fallbackEnabled in config to use TypeScript fallback.'
      );
    }

    this.stats.wasmAvailable = isAvailable;

    if (isAvailable) {
      // Initialize all adapters
      try {
        this.cohomologyAdapter = new CohomologyAdapter(this.wasmLoader, this.logger);
        this.spectralAdapter = new SpectralAdapter(this.wasmLoader, this.logger);
        this.causalAdapter = new CausalAdapter(this.wasmLoader, this.logger);
        this.categoryAdapter = new CategoryAdapter(this.wasmLoader, this.logger);
        this.homotopyAdapter = new HomotopyAdapter(this.wasmLoader, this.logger);
        this.witnessAdapter = new WitnessAdapter(this.wasmLoader, this.logger);

        // Initialize all adapters in parallel
        await Promise.all([
          this.cohomologyAdapter.initialize(),
          this.spectralAdapter.initialize(),
          this.causalAdapter.initialize(),
          this.categoryAdapter.initialize(),
          this.homotopyAdapter.initialize(),
          this.witnessAdapter.initialize(),
        ]);

        this.logger.info('All coherence engine adapters initialized');
      } catch (error) {
        if (!this.config.fallbackEnabled) {
          throw error;
        }
        this.logger.warn('WASM initialization failed, using fallback', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        this.stats.wasmAvailable = false;
      }
    } else {
      this.logger.info('WASM not available, using TypeScript fallback');
    }

    this.initialized = true;
    this.logger.info('CoherenceService initialized', {
      wasmAvailable: this.stats.wasmAvailable,
      fallbackEnabled: this.config.fallbackEnabled,
    });
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Ensure the service is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new CoherenceError(
        'CoherenceService not initialized. Call initialize() first.',
        'NOT_INITIALIZED'
      );
    }
  }

  /**
   * Check coherence of a set of nodes
   */
  async checkCoherence(nodes: CoherenceNode[]): Promise<CoherenceResult> {
    this.ensureInitialized();

    const startTime = Date.now();

    try {
      // Use WASM adapter if available
      const adapterInitialized = this.cohomologyAdapter?.isInitialized();

      if (adapterInitialized) {
        return await this.checkCoherenceWithWasm(nodes, startTime);
      }

      // Fallback to TypeScript implementation
      return this.checkCoherenceWithFallback(nodes, startTime);
    } catch (error) {
      this.logger.error(
        'Coherence check failed',
        toError(error)
      );

      // Return safe fallback result
      return {
        energy: 1.0, // High energy = incoherent
        isCoherent: false,
        lane: 'human',
        contradictions: [],
        recommendations: ['Coherence check failed. Manual review recommended.'],
        durationMs: Date.now() - startTime,
        usedFallback: true,
      };
    }
  }

  /**
   * Check coherence using WASM adapter
   */
  private async checkCoherenceWithWasm(
    nodes: CoherenceNode[],
    startTime: number
  ): Promise<CoherenceResult> {
    // Clear and rebuild graph
    this.cohomologyAdapter!.clear();

    // Add all nodes
    for (const node of nodes) {
      this.cohomologyAdapter!.addNode(node);
    }

    // Add edges based on similarity
    this.buildEdgesFromNodes(nodes);

    // Compute energy and detect contradictions
    const energy = this.cohomologyAdapter!.computeEnergy();
    const contradictions = this.cohomologyAdapter!.detectContradictions(
      this.config.coherenceThreshold
    );

    const lane = this.computeLane(energy);
    const durationMs = Date.now() - startTime;

    // Update statistics
    this.updateStats(energy, durationMs, contradictions.length, lane, false);

    return {
      energy,
      isCoherent: energy < this.config.coherenceThreshold,
      lane,
      contradictions,
      recommendations: this.generateRecommendations(energy, lane, contradictions),
      durationMs,
      usedFallback: false,
    };
  }

  /**
   * Check coherence using TypeScript fallback
   */
  private checkCoherenceWithFallback(
    nodes: CoherenceNode[],
    startTime: number
  ): CoherenceResult {
    this.stats.fallbackCount++;

    // Simple fallback: compute average pairwise distance
    let totalDistance = 0;
    let comparisons = 0;
    const contradictions: Contradiction[] = [];

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const distance = this.euclideanDistance(
          nodes[i].embedding,
          nodes[j].embedding
        );
        totalDistance += distance;
        comparisons++;

        // Detect contradictions based on distance
        if (distance > 1.5) {
          contradictions.push({
            nodeIds: [nodes[i].id, nodes[j].id],
            severity: distance > 2 ? 'critical' : 'high',
            description: `High distance (${distance.toFixed(2)}) between nodes`,
            confidence: Math.min(1, distance / 2),
          });
        }
      }
    }

    const energy = comparisons > 0 ? totalDistance / comparisons : 0;
    const lane = this.computeLane(energy);
    const durationMs = Date.now() - startTime;

    this.updateStats(energy, durationMs, contradictions.length, lane, true);

    return {
      energy,
      isCoherent: energy < this.config.coherenceThreshold,
      lane,
      contradictions,
      recommendations: this.generateRecommendations(energy, lane, contradictions),
      durationMs,
      usedFallback: true,
    };
  }

  /**
   * Build edges between nodes based on similarity
   */
  private buildEdgesFromNodes(nodes: CoherenceNode[]): void {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const similarity = this.cosineSimilarity(
          nodes[i].embedding,
          nodes[j].embedding
        );

        // Only add edges for sufficiently similar nodes
        if (similarity > 0.3) {
          this.cohomologyAdapter!.addEdge({
            source: nodes[i].id,
            target: nodes[j].id,
            weight: similarity,
          });
        }
      }
    }
  }

  /**
   * Detect contradictions in beliefs
   */
  async detectContradictions(beliefs: Belief[]): Promise<Contradiction[]> {
    this.ensureInitialized();

    // Convert beliefs to coherence nodes
    const nodes: CoherenceNode[] = beliefs.map(belief => ({
      id: belief.id,
      embedding: belief.embedding,
      weight: belief.confidence,
      metadata: {
        statement: belief.statement,
        source: belief.source,
      },
    }));

    const result = await this.checkCoherence(nodes);
    return result.contradictions;
  }

  /**
   * Predict collapse risk for a swarm
   */
  async predictCollapse(state: SwarmState): Promise<CollapseRisk> {
    this.ensureInitialized();

    // Edge case: need agents to analyze
    if (!state.agents || state.agents.length === 0) {
      return {
        risk: 0,
        fiedlerValue: 0,
        collapseImminent: false,
        weakVertices: [],
        recommendations: ['No agents to analyze'],
        durationMs: 0,
        usedFallback: true,
      };
    }

    if (this.spectralAdapter?.isInitialized()) {
      try {
        return this.spectralAdapter.analyzeSwarmState(state);
      } catch (error) {
        // WASM error - fall back to heuristic analysis
        this.logger.warn('Spectral collapse prediction failed, using fallback', {
          error: toErrorMessage(error),
          agentCount: state.agents.length,
        });
        return this.predictCollapseWithFallback(state);
      }
    }

    // Fallback implementation
    return this.predictCollapseWithFallback(state);
  }

  /**
   * Fallback collapse prediction using simple heuristics
   */
  private predictCollapseWithFallback(state: SwarmState): CollapseRisk {
    const startTime = Date.now();

    // Simple heuristics
    const avgHealth = state.agents.reduce((sum, a) => sum + a.health, 0) /
      Math.max(state.agents.length, 1);
    const avgSuccessRate = state.agents.reduce((sum, a) => sum + a.successRate, 0) /
      Math.max(state.agents.length, 1);

    // Risk factors
    let risk = 0;
    risk += (1 - avgHealth) * 0.3;
    risk += (1 - avgSuccessRate) * 0.3;
    risk += state.errorRate * 0.2;
    risk += (state.utilization > 0.9 ? 0.2 : state.utilization * 0.1);

    // Identify weak agents
    const weakVertices = state.agents
      .filter(a => a.health < 0.5 || a.successRate < 0.5)
      .map(a => a.agentId);

    return {
      risk: Math.min(1, risk),
      fiedlerValue: avgHealth * avgSuccessRate, // Approximation
      collapseImminent: risk > 0.7,
      weakVertices,
      recommendations: risk > 0.5
        ? ['System health degraded. Consider spawning additional agents.']
        : ['System health is acceptable.'],
      durationMs: Date.now() - startTime,
      usedFallback: true,
    };
  }

  /**
   * Verify a causal relationship
   */
  async verifyCausality(
    cause: string,
    effect: string,
    data: CausalData
  ): Promise<CausalVerification> {
    this.ensureInitialized();

    if (this.causalAdapter?.isInitialized()) {
      return this.causalAdapter.verifyCausality(cause, effect, data);
    }

    // Fallback: simple correlation analysis
    return this.verifyCausalityWithFallback(cause, effect, data);
  }

  /**
   * Fallback causality verification using correlation
   */
  private verifyCausalityWithFallback(
    cause: string,
    effect: string,
    data: CausalData
  ): CausalVerification {
    const startTime = Date.now();

    // Compute correlation coefficient
    const correlation = this.computeCorrelation(data.causeValues, data.effectValues);
    const absCorrelation = Math.abs(correlation);

    return {
      isCausal: absCorrelation > 0.5,
      effectStrength: absCorrelation,
      relationshipType: absCorrelation < 0.2 ? 'none' :
                        absCorrelation > 0.5 ? 'causal' : 'spurious',
      confidence: Math.min(0.7, data.sampleSize / 100), // Lower confidence for fallback
      confounders: [],
      explanation: `Correlation-based analysis: r=${correlation.toFixed(3)}. ` +
                   'Note: Correlation does not imply causation. ' +
                   'This is a fallback analysis without full causal inference.',
      durationMs: Date.now() - startTime,
      usedFallback: true,
    };
  }

  /**
   * Verify type consistency in a pipeline
   */
  async verifyTypes(pipeline: TypedPipeline): Promise<TypeVerification> {
    this.ensureInitialized();

    if (this.categoryAdapter?.isInitialized()) {
      return this.categoryAdapter.verifyPipeline(pipeline);
    }

    // Fallback: simple type matching
    return this.verifyTypesWithFallback(pipeline);
  }

  /**
   * Fallback type verification using simple matching
   */
  private verifyTypesWithFallback(pipeline: TypedPipeline): TypeVerification {
    const startTime = Date.now();
    const mismatches: TypeVerification['mismatches'] = [];

    // Check that elements chain correctly
    let currentType = pipeline.inputType;
    for (const element of pipeline.elements) {
      if (element.inputType !== currentType && currentType !== 'any') {
        mismatches.push({
          location: element.name,
          expected: currentType,
          actual: element.inputType,
          severity: 'high',
        });
      }
      currentType = element.outputType;
    }

    // Check final output
    if (currentType !== pipeline.outputType && currentType !== 'any') {
      mismatches.push({
        location: 'pipeline output',
        expected: pipeline.outputType,
        actual: currentType,
        severity: 'critical',
      });
    }

    return {
      isValid: mismatches.length === 0,
      mismatches,
      warnings: ['Using fallback type verification. Full categorical analysis unavailable.'],
      durationMs: Date.now() - startTime,
      usedFallback: true,
    };
  }

  /**
   * Create a witness for a decision
   */
  async createWitness(decision: Decision): Promise<WitnessRecord> {
    this.ensureInitialized();

    if (this.witnessAdapter?.isInitialized()) {
      return this.witnessAdapter.createWitness(decision);
    }

    // Fallback: create simple witness
    return {
      witnessId: `witness-fallback-${Date.now()}`,
      decisionId: decision.id,
      hash: this.simpleHash(JSON.stringify(decision)),
      chainPosition: 0,
      timestamp: new Date(),
    };
  }

  /**
   * Replay a decision from a witness
   */
  async replayFromWitness(witnessId: string): Promise<ReplayResult> {
    this.ensureInitialized();

    if (this.witnessAdapter?.isInitialized()) {
      return this.witnessAdapter.replayFromWitness(witnessId);
    }

    return {
      success: false,
      decision: {
        id: '',
        type: 'routing',
        inputs: {},
        output: null,
        agents: [],
        timestamp: new Date(),
      },
      matchesOriginal: false,
      differences: ['Replay not available in fallback mode'],
      durationMs: 0,
    };
  }

  /**
   * Check coherence of swarm agents
   */
  async checkSwarmCoherence(
    agentHealth: Map<string, AgentHealth>
  ): Promise<CoherenceResult> {
    this.ensureInitialized();

    // Convert agent health to coherence nodes
    const nodes: CoherenceNode[] = [];

    agentHealth.forEach((health, agentId) => {
      // Create embedding from agent state
      const embedding = this.agentHealthToEmbedding(health);

      nodes.push({
        id: agentId,
        embedding,
        weight: health.health,
        metadata: {
          agentType: health.agentType,
          successRate: health.successRate,
          errorCount: health.errorCount,
        },
      });
    });

    return this.checkCoherence(nodes);
  }

  /**
   * Verify multi-agent consensus
   */
  async verifyConsensus(votes: AgentVote[]): Promise<ConsensusResult> {
    this.ensureInitialized();

    const startTime = Date.now();

    // Edge case: need at least 2 votes for meaningful consensus analysis
    if (votes.length < 2) {
      return {
        isValid: votes.length === 1,
        confidence: votes.length === 1 ? votes[0].confidence : 0,
        isFalseConsensus: false,
        fiedlerValue: votes.length === 1 ? 1 : 0,
        collapseRisk: 0,
        recommendation: votes.length === 0
          ? 'No votes to analyze'
          : 'Single vote - consensus trivially achieved',
        durationMs: Date.now() - startTime,
        usedFallback: true,
      };
    }

    if (this.spectralAdapter?.isInitialized()) {
      try {
        // Build spectral graph from votes
        this.spectralAdapter.clear();

        // Add agents as nodes
        for (const vote of votes) {
          this.spectralAdapter.addNode(vote.agentId);
        }

        // Connect agents that agree - count edges for validation
        let edgeCount = 0;
        for (let i = 0; i < votes.length; i++) {
          for (let j = i + 1; j < votes.length; j++) {
            if (votes[i].verdict === votes[j].verdict) {
              this.spectralAdapter.addEdge(
                votes[i].agentId,
                votes[j].agentId,
                Math.min(votes[i].confidence, votes[j].confidence)
              );
              edgeCount++;
            }
          }
        }

        // Edge case: no agreement edges means completely disconnected graph
        // Fall back to majority analysis instead of risking WASM error
        if (edgeCount === 0) {
          this.logger.debug('No agreement edges, using fallback consensus');
          return this.verifyConsensusWithFallback(votes, startTime);
        }

        const collapseRisk = this.spectralAdapter.predictCollapseRisk();
        const fiedlerValue = this.spectralAdapter.computeFiedlerValue();

        return {
          isValid: collapseRisk < 0.3 && fiedlerValue > 0.1,
          confidence: 1 - collapseRisk,
          isFalseConsensus: fiedlerValue < 0.05,
          fiedlerValue,
          collapseRisk,
          recommendation: collapseRisk > 0.3
            ? 'Spawn independent reviewer'
            : 'Consensus verified',
          durationMs: Date.now() - startTime,
          usedFallback: false,
        };
      } catch (error) {
        // WASM error - fall back to simple majority analysis
        this.logger.warn('Spectral consensus verification failed, using fallback', {
          error: toErrorMessage(error),
          voteCount: votes.length,
        });
        return this.verifyConsensusWithFallback(votes, startTime);
      }
    }

    // Fallback: simple majority analysis
    return this.verifyConsensusWithFallback(votes, startTime);
  }

  /**
   * Fallback consensus verification
   */
  private verifyConsensusWithFallback(
    votes: AgentVote[],
    startTime: number
  ): ConsensusResult {
    // Count verdicts
    const verdictCounts = new Map<string, number>();
    for (const vote of votes) {
      const key = String(vote.verdict);
      verdictCounts.set(key, (verdictCounts.get(key) || 0) + 1);
    }

    // Find majority
    let maxCount = 0;
    verdictCounts.forEach(count => {
      maxCount = Math.max(maxCount, count);
    });

    const majorityRatio = maxCount / votes.length;
    const avgConfidence = votes.reduce((sum, v) => sum + v.confidence, 0) / votes.length;

    return {
      isValid: majorityRatio > 0.6,
      confidence: majorityRatio * avgConfidence,
      isFalseConsensus: verdictCounts.size === 1 && votes.length > 2,
      fiedlerValue: majorityRatio, // Approximation
      collapseRisk: 1 - majorityRatio,
      recommendation: majorityRatio < 0.6
        ? 'No clear majority. Consider spawning additional agents.'
        : majorityRatio === 1 && verdictCounts.size === 1
          ? 'Unanimous consensus may indicate false consensus. Consider adding diversity.'
          : 'Majority consensus achieved.',
      durationMs: Date.now() - startTime,
      usedFallback: true,
    };
  }

  /**
   * Filter items to only return coherent ones
   */
  async filterCoherent<T extends HasEmbedding>(
    items: T[],
    context: unknown
  ): Promise<T[]> {
    this.ensureInitialized();

    if (items.length === 0) return [];
    if (items.length === 1) return items;

    // Convert to coherence nodes
    const nodes: CoherenceNode[] = items.map(item => ({
      id: item.id,
      embedding: item.embedding,
    }));

    // Check coherence
    const result = await this.checkCoherence(nodes);

    if (result.isCoherent) {
      return items;
    }

    // Filter out items involved in contradictions
    const contradictingIds = new Set<string>();
    for (const contradiction of result.contradictions) {
      contradiction.nodeIds.forEach(id => contradictingIds.add(id));
    }

    // Keep items not involved in critical contradictions
    return items.filter(item => !contradictingIds.has(item.id));
  }

  /**
   * Get service statistics
   */
  getStats(): CoherenceStats {
    return {
      ...this.stats,
      averageEnergy: this.stats.totalChecks > 0
        ? this.totalEnergySum / this.stats.totalChecks
        : 0,
      averageDurationMs: this.stats.totalChecks > 0
        ? this.totalDurationSum / this.stats.totalChecks
        : 0,
      lastCheckAt: this.stats.lastCheckAt,
    };
  }

  /**
   * Dispose of service resources
   */
  async dispose(): Promise<void> {
    this.cohomologyAdapter?.dispose();
    this.spectralAdapter?.dispose();
    this.causalAdapter?.dispose();
    this.categoryAdapter?.dispose();
    this.homotopyAdapter?.dispose();
    this.witnessAdapter?.dispose();

    this.cohomologyAdapter = null;
    this.spectralAdapter = null;
    this.causalAdapter = null;
    this.categoryAdapter = null;
    this.homotopyAdapter = null;
    this.witnessAdapter = null;

    this.initialized = false;

    this.logger.info('CoherenceService disposed');
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Compute the appropriate compute lane based on energy
   */
  private computeLane(energy: number): ComputeLane {
    const { laneConfig } = this.config;

    if (energy < laneConfig.reflexThreshold) return 'reflex';
    if (energy < laneConfig.retrievalThreshold) return 'retrieval';
    if (energy < laneConfig.heavyThreshold) return 'heavy';
    return 'human';
  }

  /**
   * Update statistics after a coherence check
   */
  private updateStats(
    energy: number,
    durationMs: number,
    contradictionCount: number,
    lane: ComputeLane,
    usedFallback: boolean
  ): void {
    this.stats.totalChecks++;
    this.totalEnergySum += energy;
    this.totalDurationSum += durationMs;
    this.stats.totalContradictions += contradictionCount;
    this.stats.laneDistribution[lane]++;
    this.stats.lastCheckAt = new Date();

    if (energy < this.config.coherenceThreshold) {
      this.stats.coherentCount++;
    } else {
      this.stats.incoherentCount++;
    }

    if (usedFallback) {
      this.stats.fallbackCount++;
    }
  }

  /**
   * Generate recommendations based on coherence result
   */
  private generateRecommendations(
    energy: number,
    lane: ComputeLane,
    contradictions: Contradiction[]
  ): string[] {
    const recommendations: string[] = [];

    if (lane === 'reflex') {
      recommendations.push('Low energy detected. Safe to proceed with immediate execution.');
    } else if (lane === 'retrieval') {
      recommendations.push('Moderate energy detected. Consider fetching additional context before proceeding.');
    } else if (lane === 'heavy') {
      recommendations.push('High energy detected. Deep analysis recommended before proceeding.');
    } else {
      recommendations.push('Critical energy level. Escalate to human review (Queen agent).');
    }

    if (contradictions.length > 0) {
      const critical = contradictions.filter(c => c.severity === 'critical');
      if (critical.length > 0) {
        recommendations.push(
          `Found ${critical.length} critical contradiction(s) that must be resolved.`
        );
      }
    }

    return recommendations;
  }

  /**
   * Convert agent health to a numerical embedding
   */
  private agentHealthToEmbedding(health: AgentHealth): number[] {
    // Defensive: handle agents without beliefs array
    const beliefs = health.beliefs ?? [];

    // Create a fixed-size embedding from agent state
    return [
      health.health,
      health.successRate,
      Math.min(1, health.errorCount / 10),
      this.agentTypeToNumber(health.agentType),
      beliefs.length / 10,
      // Add belief embeddings (first 3 beliefs, padded)
      ...(beliefs[0]?.embedding.slice(0, 5) || [0, 0, 0, 0, 0]),
      ...(beliefs[1]?.embedding.slice(0, 5) || [0, 0, 0, 0, 0]),
      ...(beliefs[2]?.embedding.slice(0, 5) || [0, 0, 0, 0, 0]),
    ];
  }

  /**
   * Convert agent type to a number for embedding
   */
  private agentTypeToNumber(type: string): number {
    const types = ['coordinator', 'specialist', 'analyzer', 'generator',
                   'validator', 'tester', 'reviewer', 'optimizer'];
    const index = types.indexOf(type);
    return index >= 0 ? index / types.length : 0.5;
  }

  /**
   * Compute Euclidean distance between two vectors
   */
  private euclideanDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) return Infinity;

    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
  }

  /**
   * Compute cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Compute Pearson correlation coefficient
   */
  private computeCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length < 2) return 0;

    const n = x.length;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denominator = Math.sqrt(denomX * denomY);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Simple hash function for fallback
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create and initialize a CoherenceService
 *
 * @param wasmLoader - WASM module loader
 * @param config - Optional service configuration
 * @param logger - Optional logger
 * @returns Initialized service
 *
 * @example
 * ```typescript
 * const service = await createCoherenceService(wasmLoader);
 *
 * const result = await service.checkCoherence(nodes);
 * if (!result.isCoherent) {
 *   console.log('Contradictions:', result.contradictions);
 * }
 * ```
 */
export async function createCoherenceService(
  wasmLoader: IWasmLoader,
  config?: Partial<CoherenceServiceConfig>,
  logger?: CoherenceLogger
): Promise<CoherenceService> {
  const service = new CoherenceService(wasmLoader, config, logger);
  await service.initialize();
  return service;
}
