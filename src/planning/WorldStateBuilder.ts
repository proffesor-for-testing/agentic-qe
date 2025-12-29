/**
 * World State Builder
 *
 * Builds observable WorldState from various sources:
 * - Quality metrics
 * - Fleet status
 * - Resource constraints
 * - Execution context
 *
 * @module planning/WorldStateBuilder
 * @version 1.0.0
 */

import { WorldState, DEFAULT_WORLD_STATE } from './types';
import { Logger } from '../utils/Logger';

/**
 * Quality metrics input
 */
export interface QualityMetricsInput {
  coverage?: {
    line?: number;
    branch?: number;
    function?: number;
  };
  testsPassing?: number;
  testsTotal?: number;
  securityVulnerabilities?: {
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
  };
  performanceMetrics?: {
    p95Latency?: number;
    throughput?: number;
    errorRate?: number;
  };
  technicalDebt?: {
    days?: number;
    items?: number;
  };
}

/**
 * Fleet status input
 */
export interface FleetStatusInput {
  activeAgents?: number;
  availableAgents?: string[];
  busyAgents?: string[];
  agentTypes?: Record<string, number>;
  maxAgents?: number;
}

/**
 * Resource constraints input
 */
export interface ResourceInput {
  timeRemaining?: number;
  memoryAvailable?: number;
  parallelSlots?: number;
  cpuUsage?: number;
}

/**
 * Execution context input
 */
export interface ContextInput {
  environment?: 'development' | 'staging' | 'production';
  changeSize?: 'small' | 'medium' | 'large';
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  changedFiles?: string[];
  previousFailures?: number;
  projectId?: string;
  branchName?: string;
  isHotfix?: boolean;
}

/**
 * WorldStateBuilder - Constructs WorldState from various inputs
 */
export class WorldStateBuilder {
  private state: WorldState;
  private logger: Logger;

  constructor() {
    this.state = JSON.parse(JSON.stringify(DEFAULT_WORLD_STATE));
    this.logger = Logger.getInstance();
  }

  /**
   * Create builder from quality metrics
   */
  static fromQualityMetrics(metrics: QualityMetricsInput): WorldStateBuilder {
    const builder = new WorldStateBuilder();
    return builder.withQualityMetrics(metrics);
  }

  /**
   * Create builder from fleet status
   */
  static fromFleetStatus(status: FleetStatusInput): WorldStateBuilder {
    const builder = new WorldStateBuilder();
    return builder.withFleetStatus(status);
  }

  /**
   * Set quality metrics
   */
  withQualityMetrics(metrics: QualityMetricsInput): WorldStateBuilder {
    // Coverage
    if (metrics.coverage) {
      this.state.coverage.line = metrics.coverage.line ?? this.state.coverage.line;
      this.state.coverage.branch = metrics.coverage.branch ?? this.state.coverage.branch;
      this.state.coverage.function = metrics.coverage.function ?? this.state.coverage.function;
    }

    // Test passing rate
    if (metrics.testsPassing !== undefined && metrics.testsTotal !== undefined && metrics.testsTotal > 0) {
      this.state.quality.testsPassing = Math.round((metrics.testsPassing / metrics.testsTotal) * 100);
    } else if (metrics.testsPassing !== undefined) {
      this.state.quality.testsPassing = metrics.testsPassing;
    }

    // Security score (inverse of vulnerabilities)
    if (metrics.securityVulnerabilities) {
      const vulns = metrics.securityVulnerabilities;
      const criticalWeight = 25;
      const highWeight = 15;
      const mediumWeight = 5;
      const lowWeight = 1;

      const penalty =
        (vulns.critical ?? 0) * criticalWeight +
        (vulns.high ?? 0) * highWeight +
        (vulns.medium ?? 0) * mediumWeight +
        (vulns.low ?? 0) * lowWeight;

      this.state.quality.securityScore = Math.max(0, 100 - penalty);
    }

    // Performance score
    if (metrics.performanceMetrics) {
      const perf = metrics.performanceMetrics;
      let score = 100;

      // P95 latency penalty (assume 200ms is baseline)
      if (perf.p95Latency !== undefined) {
        const latencyPenalty = Math.max(0, (perf.p95Latency - 200) / 20);
        score -= latencyPenalty;
      }

      // Error rate penalty
      if (perf.errorRate !== undefined) {
        score -= perf.errorRate * 10;
      }

      this.state.quality.performanceScore = Math.max(0, Math.min(100, score));
    }

    // Technical debt
    if (metrics.technicalDebt?.days !== undefined) {
      this.state.quality.technicalDebt = metrics.technicalDebt.days;
    }

    return this;
  }

  /**
   * Set fleet status
   */
  withFleetStatus(status: FleetStatusInput): WorldStateBuilder {
    if (status.activeAgents !== undefined) {
      this.state.fleet.activeAgents = status.activeAgents;
    }

    if (status.availableAgents) {
      this.state.fleet.availableAgents = [...status.availableAgents];
    }

    if (status.busyAgents) {
      this.state.fleet.busyAgents = [...status.busyAgents];
    }

    if (status.agentTypes) {
      this.state.fleet.agentTypes = { ...status.agentTypes };
    }

    return this;
  }

  /**
   * Set resource constraints
   */
  withResources(resources: ResourceInput): WorldStateBuilder {
    if (resources.timeRemaining !== undefined) {
      this.state.resources.timeRemaining = resources.timeRemaining;
    }

    if (resources.memoryAvailable !== undefined) {
      this.state.resources.memoryAvailable = resources.memoryAvailable;
    }

    if (resources.parallelSlots !== undefined) {
      this.state.resources.parallelSlots = resources.parallelSlots;
    }

    return this;
  }

  /**
   * Set execution context
   */
  withContext(context: ContextInput): WorldStateBuilder {
    if (context.environment) {
      this.state.context.environment = context.environment;
    }

    if (context.changeSize) {
      this.state.context.changeSize = context.changeSize;
    } else if (context.changedFiles) {
      // Infer change size from file count
      const fileCount = context.changedFiles.length;
      if (fileCount <= 5) {
        this.state.context.changeSize = 'small';
      } else if (fileCount <= 20) {
        this.state.context.changeSize = 'medium';
      } else {
        this.state.context.changeSize = 'large';
      }
    }

    if (context.riskLevel) {
      this.state.context.riskLevel = context.riskLevel;
    } else {
      // Infer risk level
      this.state.context.riskLevel = this.inferRiskLevel(context);
    }

    if (context.previousFailures !== undefined) {
      this.state.context.previousFailures = context.previousFailures;
    }

    if (context.projectId) {
      this.state.context.projectId = context.projectId;
    }

    if (context.changedFiles) {
      this.state.context.impactedFiles = [...context.changedFiles];
    }

    return this;
  }

  /**
   * Set coverage target
   */
  withCoverageTarget(target: number): WorldStateBuilder {
    this.state.coverage.target = target;
    return this;
  }

  /**
   * Set quality gate status
   */
  withGateStatus(status: WorldState['quality']['gateStatus']): WorldStateBuilder {
    this.state.quality.gateStatus = status;
    return this;
  }

  /**
   * Infer risk level from context
   */
  private inferRiskLevel(context: ContextInput): 'low' | 'medium' | 'high' | 'critical' {
    // Production environment is always higher risk
    if (context.environment === 'production') {
      if (context.isHotfix) {
        return 'critical';
      }
      return 'high';
    }

    // Staging with many changes
    if (context.environment === 'staging' && context.changeSize === 'large') {
      return 'high';
    }

    // Previous failures increase risk
    if (context.previousFailures && context.previousFailures >= 3) {
      return 'high';
    }
    if (context.previousFailures && context.previousFailures >= 1) {
      return 'medium';
    }

    // Large changes in development
    if (context.changeSize === 'large') {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Build the WorldState
   */
  build(): WorldState {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Get current state without cloning (for inspection)
   */
  peek(): Readonly<WorldState> {
    return this.state;
  }
}

/**
 * Quick factory functions
 */
export const createWorldState = {
  /**
   * Create state for quality gate evaluation
   */
  forQualityGate(metrics: QualityMetricsInput, context?: ContextInput): WorldState {
    const builder = WorldStateBuilder.fromQualityMetrics(metrics);
    if (context) {
      builder.withContext(context);
    }
    return builder.build();
  },

  /**
   * Create state for test strategy planning
   */
  forTestStrategy(
    coverage: { line: number; branch: number; target: number },
    changedFiles: string[],
    timeRemaining: number
  ): WorldState {
    return new WorldStateBuilder()
      .withQualityMetrics({
        coverage: {
          line: coverage.line,
          branch: coverage.branch
        }
      })
      .withCoverageTarget(coverage.target)
      .withContext({ changedFiles })
      .withResources({ timeRemaining })
      .build();
  },

  /**
   * Create state for fleet orchestration
   */
  forFleetOrchestration(
    fleet: FleetStatusInput,
    resources: ResourceInput
  ): WorldState {
    return new WorldStateBuilder()
      .withFleetStatus(fleet)
      .withResources(resources)
      .build();
  },

  /**
   * Create minimal state for testing
   */
  minimal(): WorldState {
    return new WorldStateBuilder().build();
  }
};
