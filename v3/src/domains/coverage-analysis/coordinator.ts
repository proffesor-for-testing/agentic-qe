/**
 * Agentic QE v3 - Coverage Analysis Coordinator
 * Orchestrates coverage analysis workflow and domain events
 * Integrates Q-Learning for intelligent test prioritization
 */

import { Result, ok, err, DomainName, Severity } from '../../shared/types';
import { EventBus, MemoryBackend } from '../../kernel/interfaces';
import {
  createEvent,
  CoverageAnalysisEvents,
  CoverageReportPayload,
  CoverageGapPayload,
} from '../../shared/events';
import {
  CoverageAnalysisAPI,
  AnalyzeCoverageRequest,
  CoverageReport,
  GapDetectionRequest,
  CoverageGaps,
  RiskCalculationRequest,
  RiskReport,
  TrendRequest,
  CoverageTrend,
  SimilarityRequest,
  SimilarPatterns,
  CoverageGap,
  TrendPoint,
  CoverageQLState,
  CoverageQLAction,
  CoverageQLPrediction,
  QLPrioritizedTests,
  PrioritizedTest,
  FileCoverage,
} from './interfaces';
import {
  CoverageAnalyzerService,
  GapDetectorService,
  RiskScorerService,
} from './services';
import { GhostCoverageAnalyzerService, type GhostCoverageAnalyzerDependencies } from './services/ghost-coverage-analyzer';
import { createHNSWIndex } from './services/hnsw-index';
import { createCoverageEmbedder } from './services/coverage-embedder';
import { QLearningAlgorithm } from '../../integrations/rl-suite/algorithms/q-learning';
import type {
  RLState,
  RLAction,
  RLExperience,
  RewardContext,
} from '../../integrations/rl-suite/interfaces';
import { COVERAGE_REWARDS } from '../../integrations/rl-suite/interfaces';

// ============================================================================
// MinCut & Consensus Mixin Imports (ADR-047, MM-001)
// ============================================================================

import {
  MinCutAwareDomainMixin,
  createMinCutAwareMixin,
  type IMinCutAwareDomain,
  type MinCutAwareConfig,
} from '../../coordination/mixins/mincut-aware-domain';

import {
  ConsensusEnabledMixin,
  createConsensusEnabledMixin,
  type IConsensusEnabledDomain,
  type ConsensusEnabledConfig,
} from '../../coordination/mixins/consensus-enabled-domain';

// ADR-058: Governance-aware mixin for MemoryWriteGate integration
import {
  GovernanceAwareDomainMixin,
  createGovernanceAwareMixin,
} from '../../coordination/mixins/governance-aware-domain.js';

import type { QueenMinCutBridge } from '../../coordination/mincut/queen-integration';

import {
  type DomainFinding,
  createDomainFinding,
} from '../../coordination/consensus/domain-findings';

import { v4 as uuidv4 } from 'uuid';
import type { WeakVertex } from '../../coordination/mincut/interfaces';

// ============================================================================
// Coordinator Interface
// ============================================================================

/**
 * Configuration for the coverage analysis coordinator
 */
export interface CoverageAnalysisCoordinatorConfig {
  // MinCut integration config (ADR-047)
  enableMinCutAwareness: boolean;
  topologyHealthThreshold: number;
  pauseOnCriticalTopology: boolean;
  // Consensus integration config (MM-001)
  enableConsensus: boolean;
  consensusThreshold: number;
  consensusStrategy: 'majority' | 'weighted' | 'unanimous';
  consensusMinModels: number;
}

const DEFAULT_CONFIG: CoverageAnalysisCoordinatorConfig = {
  // MinCut integration defaults (ADR-047)
  enableMinCutAwareness: true,
  topologyHealthThreshold: 0.5,
  pauseOnCriticalTopology: false,
  // Consensus integration defaults (MM-001)
  enableConsensus: true,
  consensusThreshold: 0.7,
  consensusStrategy: 'weighted',
  consensusMinModels: 2,
};

export interface ICoverageAnalysisCoordinator extends CoverageAnalysisAPI {
  /** Initialize the coordinator */
  initialize(): Promise<void>;

  /** Dispose resources */
  dispose(): Promise<void>;

  /** Check if coordinator is ready */
  isReady(): boolean;

  /** Get Q-Learning recommendations for test prioritization */
  getQLRecommendations(gaps: CoverageGap[], limit?: number): Promise<Result<QLPrioritizedTests, Error>>;

  /** Train Q-Learning with execution results */
  trainQL(experience: RLExperience): Promise<void>;

  /** Get Q-Learning prediction for specific coverage gap */
  predictQL(gap: CoverageGap): Promise<CoverageQLPrediction>;

  /** ADR-059: Analyze ghost coverage (what's MISSING) */
  analyzeGhostCoverage(existingTests: string[], codeContext: string): Promise<Result<import('./interfaces').PhantomSurface, Error>>;

  // MinCut integration methods (ADR-047)
  setMinCutBridge(bridge: QueenMinCutBridge): void;
  isTopologyHealthy(): boolean;
  /** Get topology-based routing for target domains */
  getTopologyBasedRouting(targetDomains: DomainName[]): DomainName[];
  /** Get weak vertices in this domain */
  getDomainWeakVertices(): WeakVertex[];
  /** Check if this domain is a weak point in topology */
  isDomainWeakPoint(): boolean;
  // Consensus integration methods (MM-001)
  isConsensusAvailable(): boolean;
}

// ============================================================================
// Coordinator Implementation
// ============================================================================

export class CoverageAnalysisCoordinator implements ICoverageAnalysisCoordinator {
  private readonly coverageAnalyzer: CoverageAnalyzerService;
  private readonly gapDetector: GapDetectorService;
  private readonly riskScorer: RiskScorerService;
  private ghostAnalyzer: GhostCoverageAnalyzerService | null = null;
  private readonly qLearning: QLearningAlgorithm;
  private _initialized = false;

  // MinCut topology awareness mixin (ADR-047)
  private readonly minCutMixin: MinCutAwareDomainMixin;

  // Consensus verification mixin (MM-001)
  private readonly consensusMixin: ConsensusEnabledMixin;

  // Domain identifier for mixin initialization
  private readonly domainName = 'coverage-analysis';

  // Coordinator configuration
  private readonly config: CoverageAnalysisCoordinatorConfig;

  // ADR-058: Governance mixin for MemoryWriteGate integration
  private readonly governanceMixin: GovernanceAwareDomainMixin;

  private readonly qlConfig = {
    stateSize: 12,
    actionSize: 4,
    hiddenLayers: [128, 64],
    targetUpdateFreq: 50,
    minReplaySize: 50,
    doubleDQN: true,
  };

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    config: Partial<CoverageAnalysisCoordinatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize MinCut-aware mixin (ADR-047)
    this.minCutMixin = createMinCutAwareMixin(this.domainName, {
      enableMinCutAwareness: this.config.enableMinCutAwareness,
      topologyHealthThreshold: this.config.topologyHealthThreshold,
      pauseOnCriticalTopology: this.config.pauseOnCriticalTopology,
    });

    // Initialize Consensus-enabled mixin (MM-001)
    this.consensusMixin = createConsensusEnabledMixin({
      enableConsensus: this.config.enableConsensus,
      consensusThreshold: this.config.consensusThreshold,
      verifyFindingTypes: ['coverage-gap', 'risk-zone', 'quality-regression'],
      strategy: this.config.consensusStrategy,
      minModels: this.config.consensusMinModels,
      modelTimeout: 60000,
      verifySeverities: ['critical', 'high'],
      enableLogging: false,
    });

    // ADR-058: Initialize governance mixin for MemoryWriteGate integration
    this.governanceMixin = createGovernanceAwareMixin(this.domainName);

    this.coverageAnalyzer = new CoverageAnalyzerService(memory);
    this.gapDetector = new GapDetectorService(memory);
    this.riskScorer = new RiskScorerService(memory);

    // Initialize Q-Learning with coverage-specific configuration
    this.qLearning = new QLearningAlgorithm(this.qlConfig, COVERAGE_REWARDS);
  }

  /**
   * Initialize the coordinator and its services
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    // Services are stateless, no initialization needed

    // Initialize Consensus engine if enabled (MM-001)
    if (this.config.enableConsensus) {
      try {
        await (this.consensusMixin as any).initializeConsensus();
        console.log(`[${this.domainName}] Consensus engine initialized`);
      } catch (error) {
        console.error(`[${this.domainName}] Failed to initialize consensus engine:`, error);
        console.warn(`[${this.domainName}] Continuing without consensus verification`);
      }
    }

    // ADR-059: Initialize ghost coverage analyzer (lazy — created on first use)

    this._initialized = true;
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    // Dispose Consensus engine (MM-001)
    try {
      await (this.consensusMixin as any).disposeConsensus();
    } catch (error) {
      console.error(`[${this.domainName}] Error disposing consensus engine:`, error);
    }

    // Dispose MinCut mixin (ADR-047)
    this.minCutMixin.dispose();

    this._initialized = false;
  }

  // ============================================================================
  // Q-Learning Integration Methods
  // ============================================================================

  /**
   * Get Q-Learning recommendations for test prioritization
   */
  async getQLRecommendations(gaps: CoverageGap[], limit = 10): Promise<Result<QLPrioritizedTests, Error>> {
    try {
      const prioritized: PrioritizedTest[] = [];

      // Get Q-Learning predictions for each gap
      for (const gap of gaps.slice(0, limit)) {
        const prediction = await this.predictQL(gap);
        const testType = this.actionToTestType(prediction.action);
        const estimatedCoverageGain = this.estimateCoverageGain(gap, prediction.action);
        const estimatedDuration = this.estimateTestDuration(gap, testType);

        prioritized.push({
          filePath: gap.file,
          testType,
          priority: prediction.value,
          estimatedCoverageGain,
          estimatedDuration,
          action: prediction.action,
          confidence: prediction.confidence,
        });
      }

      // Sort by priority (Q-value) descending
      prioritized.sort((a, b) => b.priority - a.priority);

      const totalEstimatedCoverageGain = prioritized.reduce(
        (sum, t) => sum + t.estimatedCoverageGain,
        0
      );
      const totalEstimatedDuration = prioritized.reduce(
        (sum, t) => sum + t.estimatedDuration,
        0
      );

      return ok({
        tests: prioritized,
        totalEstimatedCoverageGain,
        totalEstimatedDuration,
        reasoning: `Q-Learning prioritized ${prioritized.length} tests based on coverage optimization potential`,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get Q-Learning prediction for specific coverage gap
   */
  async predictQL(gap: CoverageGap): Promise<CoverageQLPrediction> {
    try {
      const state = this.gapToQLState(gap);
      const prediction = await this.qLearning.predict(state);

      const estimatedCoverageGain = this.estimateCoverageGain(gap, prediction.action);
      const estimatedTestCount = this.actionToTestCount(prediction.action);

      return {
        action: prediction.action as CoverageQLAction,
        confidence: prediction.confidence,
        value: prediction.value || 0,
        reasoning: prediction.reasoning || '',
        estimatedCoverageGain,
        estimatedTestCount,
      };
    } catch (error) {
      // Return fallback prediction on error
      return {
        action: { type: 'generate-unit', value: 'standard' },
        confidence: 0.3,
        value: 0,
        reasoning: `Fallback prediction due to error: ${(error as Error).message}`,
        estimatedCoverageGain: 0.1,
        estimatedTestCount: 1,
      };
    }
  }

  /**
   * Train Q-Learning with execution results
   */
  async trainQL(experience: RLExperience): Promise<void> {
    try {
      await this.qLearning.trainBatch([experience]);

      // Persist training state periodically
      const stats = this.qLearning.getStats();
      if (stats.episode % 10 === 0) {
        await this.memory.set(
          `coverage:ql:model:latest`,
          {
            stats,
            exportedAt: new Date().toISOString(),
          }
        );
      }
    } catch (error) {
      console.error('Failed to train Q-Learning model:', error);
    }
  }

  // ============================================================================
  // Q-Learning Helper Methods
  // ============================================================================

  /**
   * Convert coverage gap to Q-Learning state
   */
  private gapToQLState(gap: CoverageGap): RLState {
    // Create feature vector for Q-Learning
    const features = [
      gap.riskScore / 10, // Normalized risk score
      Math.min(1, gap.lines.length / 50), // Number of uncovered lines
      Math.min(1, gap.branches.length / 10), // Number of uncovered branches
      this.severityToNumber(gap.severity) / 4, // Severity level
      this.complexityFromPath(gap.file), // Estimated complexity
      this.changeFrequencyFromPath(gap.file), // Estimated change frequency
      this.businessCriticalityFromPath(gap.file), // Business criticality
      gap.lines.length / Math.max(1, gap.branches.length), // Line to branch ratio
      this.calculateCoveragePotential(gap), // Potential coverage gain
      this.calculateFileComplexityScore(gap), // File complexity score
      this.calculateTestComplexity(gap), // Test complexity
      this.calculateExecutionCost(gap), // Execution cost
    ];

    return {
      id: gap.id,
      features,
      metadata: {
        filePath: gap.file,
        lines: gap.lines,
        branches: gap.branches,
        riskScore: gap.riskScore,
        severity: gap.severity,
      },
      timestamp: new Date(),
    };
  }

  /**
   * Estimate coverage gain for a given action
   */
  private estimateCoverageGain(gap: CoverageGap, action: RLAction): number {
    const baseGain = (gap.lines.length + gap.branches.length * 2) / 1000;

    switch (action.type) {
      case 'generate-unit':
        return baseGain * 0.3;
      case 'generate-integration':
        return baseGain * 0.5;
      case 'prioritize':
        return baseGain * 0.7;
      case 'skip':
        return 0;
      default:
        return baseGain * 0.2;
    }
  }

  /**
   * Estimate test duration based on gap and test type
   */
  private estimateTestDuration(gap: CoverageGap, testType: 'unit' | 'integration' | 'e2e'): number {
    const baseDuration = gap.lines.length * 0.5; // 0.5s per line

    switch (testType) {
      case 'unit':
        return baseDuration;
      case 'integration':
        return baseDuration * 2;
      case 'e2e':
        return baseDuration * 5;
      default:
        return baseDuration;
    }
  }

  /**
   * Convert action to test type
   */
  private actionToTestType(action: RLAction): 'unit' | 'integration' | 'e2e' {
    switch (action.type) {
      case 'generate-unit':
        return 'unit';
      case 'generate-integration':
        return 'integration';
      case 'prioritize':
        return 'integration'; // Prioritize usually means integration tests
      default:
        return 'unit';
    }
  }

  /**
   * Estimate number of tests for an action
   */
  private actionToTestCount(action: RLAction): number {
    switch (action.type) {
      case 'generate-unit':
        return 3;
      case 'generate-integration':
        return 2;
      case 'prioritize':
        return 5;
      case 'skip':
        return 0;
      default:
        return 1;
    }
  }

  /**
   * Calculate coverage potential for a gap
   */
  private calculateCoveragePotential(gap: CoverageGap): number {
    // Higher potential for high-risk gaps with many uncovered lines
    const linePotential = Math.min(1, gap.lines.length / 50);
    const branchPotential = Math.min(1, gap.branches.length / 10);
    const riskPotential = gap.riskScore / 10;

    return (linePotential + branchPotential + riskPotential) / 3;
  }

  /**
   * Calculate file complexity score
   */
  private calculateFileComplexityScore(gap: CoverageGap): number {
    // Simple heuristic based on file path
    const pathParts = gap.file.split('/');
    const depth = pathParts.length;
    const hasComplexName = /service|controller|provider|manager/i.test(gap.file);

    return Math.min(1, (depth + (hasComplexName ? 2 : 0)) / 10);
  }

  /**
   * Calculate test complexity
   */
  private calculateTestComplexity(gap: CoverageGap): number {
    // Based on number of uncovered branches and lines
    const branchComplexity = gap.branches.length * 0.6;
    const lineComplexity = gap.lines.length * 0.1;

    return Math.min(1, (branchComplexity + lineComplexity) / 20);
  }

  /**
   * Calculate execution cost
   */
  private calculateExecutionCost(gap: CoverageGap): number {
    // Cost based on file size and complexity
    const sizeCost = Math.min(1, gap.lines.length / 100);
    const riskCost = gap.riskScore / 10;

    return (sizeCost + riskCost) / 2;
  }

  /**
   * Estimate complexity from file path
   */
  private complexityFromPath(filePath: string): number {
    // Simple heuristic based on file path
    const complexityIndicators = ['service', 'controller', 'provider', 'manager', 'handler'];
    const hasComplexName = complexityIndicators.some((indicator) =>
      filePath.toLowerCase().includes(indicator)
    );

    return hasComplexName ? 0.7 : 0.3;
  }

  /**
   * Estimate change frequency from file path
   */
  private changeFrequencyFromPath(filePath: string): number {
    // Files in certain directories change more frequently
    const highFrequencyDirs = ['src', 'lib', 'services', 'controllers'];
    const isHighFrequency = highFrequencyDirs.some((dir) => filePath.includes(dir));

    return isHighFrequency ? 0.6 : 0.2;
  }

  /**
   * Estimate business criticality from file path
   */
  private businessCriticalityFromPath(filePath: string): number {
    // Auth, payment, core files are more critical
    const criticalIndicators = ['auth', 'payment', 'user', 'core', 'api'];
    const isCritical = criticalIndicators.some((indicator) =>
      filePath.toLowerCase().includes(indicator)
    );

    return isCritical ? 0.8 : 0.4;
  }

  /**
   * Check if coordinator is ready
   */
  isReady(): boolean {
    return this._initialized;
  }

  // ============================================================================
  // CoverageAnalysisAPI Implementation
  // ============================================================================

  /**
   * Analyze coverage report and publish results
   * Enhanced with topology awareness per ADR-047
   */
  async analyze(request: AnalyzeCoverageRequest): Promise<Result<CoverageReport, Error>> {
    try {
      // ADR-047: Check topology health before expensive analysis
      if (this.config.enableMinCutAwareness && !this.isTopologyHealthy()) {
        console.warn(`[${this.domainName}] Topology degraded, using conservative analysis mode`);
      }

      // ADR-047: Check if operations should be paused due to critical topology
      if (this.minCutMixin.shouldPauseOperations()) {
        return err(new Error('Coverage analysis paused: topology is in critical state'));
      }

      const result = await this.coverageAnalyzer.analyze(request);

      if (result.success) {
        // Publish coverage report event
        await this.publishCoverageReport(result.value);
      }

      return result;
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Detect coverage gaps using O(log n) vector search
   * Enhanced with topology awareness per ADR-047
   * Enhanced with consensus verification per MM-001
   */
  async detectGaps(request: GapDetectionRequest): Promise<Result<CoverageGaps, Error>> {
    try {
      // ADR-047: Check topology health before gap detection
      if (this.config.enableMinCutAwareness && !this.isTopologyHealthy()) {
        console.warn(`[${this.domainName}] Topology degraded, using conservative gap detection`);
      }

      // ADR-047: Check if operations should be paused due to critical topology
      if (this.minCutMixin.shouldPauseOperations()) {
        return err(new Error('Gap detection paused: topology is in critical state'));
      }

      const result = await this.gapDetector.detectGaps(request);

      if (result.success) {
        // MM-001: Verify high-risk gaps using consensus
        const verifiedGaps: CoverageGap[] = [];

        for (const gap of result.value.gaps) {
          // Only verify high-severity gaps with consensus
          if (this.config.enableConsensus && (gap.severity === 'critical' || gap.severity === 'high')) {
            const confidence = Math.min(0.95, gap.riskScore / 10 + 0.3);
            const isVerified = await this.verifyCoverageGap(gap, confidence);

            if (!isVerified) {
              console.log(`[${this.domainName}] Coverage gap in '${gap.file}' not verified, skipping publication`);
              continue;
            }
          }
          verifiedGaps.push(gap);
        }

        // Publish gap detection events for verified high-risk gaps
        await this.publishGapEvents(verifiedGaps);

        // Return result with verified gaps
        return ok({
          ...result.value,
          gaps: verifiedGaps,
        });
      }

      return result;
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Calculate risk score for uncovered code
   * Enhanced with consensus verification per MM-001 for high-risk zones
   */
  async calculateRisk(request: RiskCalculationRequest): Promise<Result<RiskReport, Error>> {
    try {
      // ADR-047: Check if operations should be paused due to critical topology
      if (this.minCutMixin.shouldPauseOperations()) {
        return err(new Error('Risk calculation paused: topology is in critical state'));
      }

      const result = await this.riskScorer.calculateRisk(request);

      if (result.success) {
        // MM-001: Verify critical risk zones using consensus
        if (this.config.enableConsensus && (result.value.riskLevel === 'critical' || result.value.riskLevel === 'high')) {
          const isVerified = await this.verifyRiskZone(
            {
              file: result.value.file,
              riskScore: result.value.overallRisk,
              factors: result.value.factors.map(f => ({ name: f.name, weight: f.contribution })),
            },
            Math.min(0.95, result.value.overallRisk / 10 + 0.5)
          );

          if (!isVerified) {
            console.warn(`[${this.domainName}] Risk zone '${result.value.file}' not verified, downgrading severity`);
            // Downgrade the risk level if not verified
            return ok({
              ...result.value,
              riskLevel: result.value.riskLevel === 'critical' ? 'high' : 'medium',
            } as RiskReport);
          }
        }

        if (result.value.riskLevel === 'critical') {
          // Publish risk zone identified event for verified critical risks
          await this.publishRiskZoneEvent(result.value);
        }
      }

      return result;
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get coverage trend over time
   */
  async getTrend(request: TrendRequest): Promise<Result<CoverageTrend, Error>> {
    try {
      const { timeRange, granularity } = request;

      // Fetch historical coverage data from memory
      const historyKeys = await this.memory.search('coverage:history:*', 100);

      if (historyKeys.length === 0) {
        return ok({
          dataPoints: [],
          trend: 'stable',
          forecast: 0,
        });
      }

      // Load and filter data points
      const dataPoints: TrendPoint[] = [];

      for (const key of historyKeys) {
        const timestamp = parseInt(key.split(':').pop() || '0', 10);
        const date = new Date(timestamp);

        if (date >= timeRange.start && date <= timeRange.end) {
          const summary = await this.memory.get<{
            line: number;
            branch: number;
            function: number;
            statement: number;
            files: number;
          }>(key);

          if (summary) {
            dataPoints.push({ date, coverage: summary });
          }
        }
      }

      // Sort by date
      dataPoints.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Aggregate by granularity
      const aggregated = this.aggregateByGranularity(dataPoints, granularity);

      // Analyze trend
      const trend = this.analyzeCoverageTrend(aggregated);

      // Forecast next coverage value
      const forecast = this.forecastCoverage(aggregated);

      return ok({
        dataPoints: aggregated,
        trend,
        forecast,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Find similar coverage patterns using vector search
   */
  async findSimilar(request: SimilarityRequest): Promise<Result<SimilarPatterns, Error>> {
    try {
      const { pattern, k } = request;
      const startTime = Date.now();

      // Create embedding for the pattern
      const embedding = this.createGapEmbedding(pattern);

      // Perform O(log n) vector search
      const results = await this.memory.vectorSearch(embedding, k);

      // Map results to gap patterns
      const patterns: Array<{ gap: CoverageGap; similarity: number }> = [];

      for (const result of results) {
        const metadata = result.metadata as {
          file?: string;
          riskScore?: number;
          severity?: Severity;
          lineCount?: number;
        } | undefined;

        if (metadata) {
          patterns.push({
            gap: {
              id: result.key,
              file: metadata.file || 'unknown',
              lines: [],
              branches: [],
              riskScore: metadata.riskScore || 0,
              severity: metadata.severity || 'low',
              recommendation: 'Similar pattern found in codebase',
            },
            similarity: result.score,
          });
        }
      }

      const searchTime = Date.now() - startTime;

      return ok({
        patterns,
        searchTime,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * ADR-059: Analyze ghost coverage — compute what tests are MISSING
   * Uses HNSW vector subtraction to find phantom test surfaces
   */
  async analyzeGhostCoverage(
    existingTests: string[],
    codeContext: string
  ): Promise<Result<import('./interfaces').PhantomSurface, Error>> {
    try {
      if (!this.ghostAnalyzer) {
        // Lazy init with available dependencies
        const deps: GhostCoverageAnalyzerDependencies = {
          hnswIndex: createHNSWIndex(this.memory),
          embedder: createCoverageEmbedder(),
        };
        this.ghostAnalyzer = new GhostCoverageAnalyzerService(deps);
        await this.ghostAnalyzer.initialize();
      }

      // Build CoverageData from existing test paths
      const coverageData = {
        files: existingTests.map(testPath => ({
          path: testPath,
          lines: { covered: 0, total: 100 },
          branches: { covered: 0, total: 10 },
          functions: { covered: 0, total: 5 },
          statements: { covered: 0, total: 100 },
          uncoveredLines: [] as number[],
          uncoveredBranches: [] as number[],
        })),
        summary: { line: 0, branch: 0, function: 0, statement: 0, files: existingTests.length },
      };

      const projectContext = {
        name: codeContext,
        sourcePatterns: existingTests,
      };

      const surfaceResult = await this.ghostAnalyzer.computePhantomSurface(coverageData, projectContext);

      if (!surfaceResult.success) {
        return err(surfaceResult.error);
      }

      const rawSurface = surfaceResult.value;

      // Detect phantom gaps from the computed surface
      const gapsResult = await this.ghostAnalyzer.detectPhantomGaps(rawSurface);
      const rawGaps = gapsResult.success ? gapsResult.value : [];

      // Map service types to interface PhantomSurface
      const phantomSurface: import('./interfaces').PhantomSurface = {
        gaps: rawGaps.map(g => ({
          id: g.id,
          category: g.category as unknown as import('./interfaces').PhantomGapCategory,
          description: g.description,
          confidence: g.confidence,
          severity: g.severity,
          suggestedTest: g.suggestedLines.length > 0
            ? `Add test covering lines ${g.suggestedLines.join(', ')} in ${g.file}`
            : `Add ${g.category} test for ${g.file}`,
        })),
        totalGhostScore: rawSurface.phantomRatio,
        coverageCompleteness: 1 - rawSurface.phantomRatio,
        computedAt: new Date(rawSurface.computedAt),
      };

      return ok(phantomSurface);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Event Publishing Methods
  // ============================================================================

  private async publishCoverageReport(report: CoverageReport): Promise<void> {
    const payload: CoverageReportPayload = {
      reportId: crypto.randomUUID(),
      line: report.summary.line,
      branch: report.summary.branch,
      function: report.summary.function,
      statement: report.summary.statement,
      files: report.summary.files,
    };

    const event = createEvent(
      CoverageAnalysisEvents.CoverageReportCreated,
      'coverage-analysis' as DomainName,
      payload
    );

    await this.eventBus.publish(event);
  }

  private async publishGapEvents(gaps: CoverageGap[]): Promise<void> {
    // Publish events for high-risk gaps
    const highRiskGaps = gaps.filter(
      (g) => g.severity === 'critical' || g.severity === 'high'
    );

    for (const gap of highRiskGaps) {
      const payload: CoverageGapPayload = {
        gapId: gap.id,
        file: gap.file,
        uncoveredLines: gap.lines,
        uncoveredBranches: gap.branches,
        riskScore: gap.riskScore,
      };

      const event = createEvent(
        CoverageAnalysisEvents.CoverageGapDetected,
        'coverage-analysis' as DomainName,
        payload
      );

      await this.eventBus.publish(event);
    }
  }

  private async publishRiskZoneEvent(riskReport: RiskReport): Promise<void> {
    const event = createEvent(
      CoverageAnalysisEvents.RiskZoneIdentified,
      'coverage-analysis' as DomainName,
      {
        file: riskReport.file,
        overallRisk: riskReport.overallRisk,
        riskLevel: riskReport.riskLevel,
        topFactors: riskReport.factors.slice(0, 3).map((f) => f.name),
        recommendations: riskReport.recommendations,
      }
    );

    await this.eventBus.publish(event);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private aggregateByGranularity(
    dataPoints: TrendPoint[],
    granularity: 'daily' | 'weekly' | 'monthly'
  ): TrendPoint[] {
    if (dataPoints.length === 0) return [];

    const buckets = new Map<string, TrendPoint[]>();

    for (const point of dataPoints) {
      const key = this.getBucketKey(point.date, granularity);
      const existing = buckets.get(key) || [];
      existing.push(point);
      buckets.set(key, existing);
    }

    const aggregated: TrendPoint[] = [];

    for (const [, points] of buckets) {
      if (points.length > 0) {
        // Average the coverage metrics
        const avgCoverage = {
          line: points.reduce((sum, p) => sum + p.coverage.line, 0) / points.length,
          branch: points.reduce((sum, p) => sum + p.coverage.branch, 0) / points.length,
          function: points.reduce((sum, p) => sum + p.coverage.function, 0) / points.length,
          statement: points.reduce((sum, p) => sum + p.coverage.statement, 0) / points.length,
          files: Math.round(points.reduce((sum, p) => sum + p.coverage.files, 0) / points.length),
        };

        aggregated.push({
          date: points[0].date,
          coverage: avgCoverage,
        });
      }
    }

    return aggregated.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private getBucketKey(date: Date, granularity: 'daily' | 'weekly' | 'monthly'): string {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    switch (granularity) {
      case 'daily':
        return `${year}-${month}-${day}`;
      case 'weekly':
        const weekNum = Math.floor(day / 7);
        return `${year}-${month}-W${weekNum}`;
      case 'monthly':
        return `${year}-${month}`;
    }
  }

  private analyzeCoverageTrend(
    dataPoints: TrendPoint[]
  ): 'improving' | 'declining' | 'stable' {
    if (dataPoints.length < 2) return 'stable';

    // Calculate overall coverage for each point
    const coverages = dataPoints.map((p) => {
      const c = p.coverage;
      return (c.line + c.branch + c.function + c.statement) / 4;
    });

    // Simple linear regression
    const n = coverages.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += coverages[i];
      sumXY += i * coverages[i];
      sumXX += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

    if (slope > 0.5) return 'improving';
    if (slope < -0.5) return 'declining';
    return 'stable';
  }

  private forecastCoverage(dataPoints: TrendPoint[]): number {
    if (dataPoints.length === 0) return 0;

    // Calculate overall coverage for each point
    const coverages = dataPoints.map((p) => {
      const c = p.coverage;
      return (c.line + c.branch + c.function + c.statement) / 4;
    });

    if (coverages.length === 1) return coverages[0];

    // Exponential moving average forecast
    const alpha = 0.3;
    let forecast = coverages[0];

    for (let i = 1; i < coverages.length; i++) {
      forecast = alpha * coverages[i] + (1 - alpha) * forecast;
    }

    // Adjust based on trend
    const trend = this.analyzeCoverageTrend(dataPoints);
    if (trend === 'improving') {
      forecast = Math.min(100, forecast + 2);
    } else if (trend === 'declining') {
      forecast = Math.max(0, forecast - 2);
    }

    return forecast;
  }

  private createGapEmbedding(gap: CoverageGap): number[] {
    const VECTOR_DIMENSION = 128;
    const embedding = new Array(VECTOR_DIMENSION).fill(0);

    // Encode gap characteristics
    embedding[0] = gap.riskScore;
    embedding[1] = Math.min(1, gap.lines.length / 100);
    embedding[2] = Math.min(1, gap.branches.length / 20);
    embedding[3] = this.severityToNumber(gap.severity) / 4;

    // Encode file path characteristics
    const pathHash = gap.file.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    embedding[4] = (pathHash % 1000) / 1000;

    // Fill remaining with derived features
    for (let i = 5; i < VECTOR_DIMENSION; i++) {
      embedding[i] = Math.sin(i * gap.riskScore) * 0.5 + 0.5;
    }

    return embedding;
  }

  private severityToNumber(severity: Severity): number {
    switch (severity) {
      case 'critical':
        return 4;
      case 'high':
        return 3;
      case 'medium':
        return 2;
      case 'low':
        return 1;
      default:
        return 0;
    }
  }

  // ============================================================================
  // MinCut Integration Methods (ADR-047)
  // ============================================================================

  /**
   * Set the MinCut bridge for topology awareness
   */
  setMinCutBridge(bridge: QueenMinCutBridge): void {
    this.minCutMixin.setMinCutBridge(bridge);
    console.log(`[${this.domainName}] MinCut bridge connected for topology awareness`);
  }

  /**
   * Check if topology is healthy
   */
  isTopologyHealthy(): boolean {
    return this.minCutMixin.isTopologyHealthy();
  }

  /**
   * Get topology-based routing excluding weak domains
   * Per ADR-047: Filters out domains that are currently weak points
   *
   * @param targetDomains - List of potential target domains
   * @returns Filtered list of healthy domains for routing
   */
  getTopologyBasedRouting(targetDomains: DomainName[]): DomainName[] {
    return this.minCutMixin.getTopologyBasedRouting(targetDomains);
  }

  /**
   * Get weak vertices belonging to this domain
   * Per ADR-047: Identifies agents that are single points of failure
   */
  getDomainWeakVertices(): WeakVertex[] {
    return this.minCutMixin.getDomainWeakVertices();
  }

  /**
   * Check if this domain is a weak point in the topology
   * Per ADR-047: Returns true if any weak vertex belongs to coverage-analysis domain
   */
  isDomainWeakPoint(): boolean {
    return this.minCutMixin.isDomainWeakPoint();
  }

  // ============================================================================
  // Consensus Integration Methods (MM-001)
  // ============================================================================

  /**
   * Check if consensus engine is available
   */
  isConsensusAvailable(): boolean {
    return (this.consensusMixin as any).isConsensusAvailable?.() ?? false;
  }

  /**
   * Get consensus statistics
   * Per MM-001: Returns metrics about consensus verification
   */
  getConsensusStats() {
    return this.consensusMixin.getConsensusStats();
  }

  /**
   * Verify coverage gap detection using multi-model consensus
   * Per MM-001: Coverage gap detection is a high-stakes decision affecting test priorities
   *
   * @param gap - The coverage gap to verify
   * @param confidence - Initial confidence in the gap detection
   * @returns true if the gap is verified or doesn't require consensus
   */
  private async verifyCoverageGap(
    gap: CoverageGap,
    confidence: number
  ): Promise<boolean> {
    const finding: DomainFinding<CoverageGap> = createDomainFinding({
      id: uuidv4(),
      type: 'coverage-gap',
      confidence,
      description: `Verify coverage gap in ${gap.file}: ${gap.lines.length} uncovered lines, ${gap.branches.length} uncovered branches`,
      payload: gap,
      detectedBy: 'coverage-analysis-coordinator',
      severity: gap.severity,
    });

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        console.log(`[${this.domainName}] Coverage gap in '${gap.file}' verified by consensus`);
        return true;
      }
      console.warn(`[${this.domainName}] Coverage gap in '${gap.file}' NOT verified: ${result.success ? result.value.verdict : result.error.message}`);
      return false;
    }
    return true; // No consensus needed
  }

  /**
   * Verify risk zone classification using multi-model consensus
   * Per MM-001: Risk zone classification affects deployment and testing decisions
   *
   * @param zone - The risk zone to verify
   * @param confidence - Initial confidence in the classification
   * @returns true if the classification is verified or doesn't require consensus
   */
  private async verifyRiskZone(
    zone: { file: string; riskScore: number; factors: Array<{ name: string; weight: number }> },
    confidence: number
  ): Promise<boolean> {
    const finding: DomainFinding<typeof zone> = createDomainFinding({
      id: uuidv4(),
      type: 'risk-zone',
      confidence,
      description: `Verify risk zone: ${zone.file} with risk score ${zone.riskScore.toFixed(2)}`,
      payload: zone,
      detectedBy: 'coverage-analysis-coordinator',
      severity: zone.riskScore >= 0.8 ? 'critical' : zone.riskScore >= 0.5 ? 'high' : 'medium',
    });

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        console.log(`[${this.domainName}] Risk zone '${zone.file}' classification verified by consensus`);
        return true;
      }
      console.warn(`[${this.domainName}] Risk zone '${zone.file}' classification NOT verified`);
      return false;
    }
    return true; // No consensus needed
  }

  /**
   * Verify quality regression detection using multi-model consensus
   * Per MM-001: Quality regressions trigger alerts and may block deployments
   *
   * @param regression - The quality regression to verify
   * @param confidence - Initial confidence in the regression detection
   * @returns true if the regression is verified or doesn't require consensus
   */
  private async verifyQualityRegression(
    regression: { metric: string; previousValue: number; currentValue: number; threshold: number },
    confidence: number
  ): Promise<boolean> {
    const finding: DomainFinding<typeof regression> = createDomainFinding({
      id: uuidv4(),
      type: 'quality-regression',
      confidence,
      description: `Verify quality regression: ${regression.metric} dropped from ${regression.previousValue.toFixed(1)}% to ${regression.currentValue.toFixed(1)}% (threshold: ${regression.threshold}%)`,
      payload: regression,
      detectedBy: 'coverage-analysis-coordinator',
      severity: 'critical', // Quality regressions are always critical
    });

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        console.log(`[${this.domainName}] Quality regression verified by consensus`);
        return true;
      }
      console.warn(`[${this.domainName}] Quality regression NOT verified: ${result.success ? result.value.verdict : result.error.message}`);
      return false;
    }
    return true; // No consensus needed
  }
}
