/**
 * Agentic QE v3 - Causal Test Failure Discovery
 * ADR-047: MinCut Self-Organizing QE Integration - Phase 2
 *
 * Implements causal discovery for test failures using graph-based analysis.
 * Tracks failure cascades, identifies root causes, and suggests targeted fixes.
 *
 * Key Features:
 * - Temporal causality tracking (A → B if A always fails before B)
 * - Dependency-based causality (shared code/resources)
 * - Root cause identification using MinCut analysis
 * - Intelligent fix suggestions based on causal chains
 *
 * Reference: RuVector Causal Discovery Pattern
 */

import { v4 as uuidv4 } from 'uuid';
import { DomainName, Severity } from '../../shared/types';
import { MinCutPriority } from './interfaces';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * A test failure event
 */
export interface TestFailure {
  /** Unique failure ID */
  readonly id: string;

  /** Test identifier */
  readonly testId: string;

  /** Test name */
  readonly testName: string;

  /** Test file path */
  readonly filePath: string;

  /** Failure timestamp */
  readonly timestamp: Date;

  /** Error message */
  readonly errorMessage: string;

  /** Stack trace */
  readonly stackTrace?: string;

  /** Related code files touched */
  readonly relatedFiles: string[];

  /** Test domain */
  readonly domain?: DomainName;

  /** Run ID (groups failures from same run) */
  readonly runId: string;
}

/**
 * Causal relationship between failures
 */
export interface CausalLink {
  /** Source failure (cause) */
  readonly causeId: string;

  /** Target failure (effect) */
  readonly effectId: string;

  /** Causality score (0-1, higher = stronger causality) */
  readonly score: number;

  /** Type of causal relationship */
  readonly type: 'temporal' | 'dependency' | 'shared_resource' | 'code_coverage';

  /** Evidence for the causal relationship */
  readonly evidence: string;

  /** Number of times this pattern was observed */
  readonly observationCount: number;
}

/**
 * Root cause analysis result
 */
export interface RootCauseAnalysis {
  /** Root cause failure ID */
  readonly rootCauseId: string;

  /** Root cause test */
  readonly rootCauseTest: string;

  /** Cascading failures caused by root */
  readonly cascadingFailures: string[];

  /** Total impact (number of tests affected) */
  readonly impact: number;

  /** Confidence score */
  readonly confidence: number;

  /** Suggested fix */
  readonly suggestedFix: FixSuggestion;

  /** Analysis timestamp */
  readonly analyzedAt: Date;
}

/**
 * Suggested fix for a failure chain
 */
export interface FixSuggestion {
  /** Type of fix */
  readonly type: 'code_change' | 'test_isolation' | 'dependency_fix' | 'resource_cleanup' | 'order_fix';

  /** Priority */
  readonly priority: MinCutPriority;

  /** Description */
  readonly description: string;

  /** Files to examine */
  readonly filesToExamine: string[];

  /** Estimated effort (1-5, higher = more effort) */
  readonly estimatedEffort: number;
}

/**
 * Causal graph statistics
 */
export interface CausalGraphStats {
  /** Total failures tracked */
  readonly totalFailures: number;

  /** Total causal links */
  readonly totalLinks: number;

  /** Number of root causes identified */
  readonly rootCauseCount: number;

  /** Average cascade depth */
  readonly averageCascadeDepth: number;

  /** Most impactful root causes */
  readonly topRootCauses: Array<{ testId: string; impact: number }>;
}

/**
 * Causal Discovery configuration
 */
export interface CausalDiscoveryConfig {
  /** Minimum causality score to consider a link */
  minCausalityScore: number;

  /** Time window for temporal causality (ms) */
  temporalWindowMs: number;

  /** Maximum failures to track */
  maxFailuresTracked: number;

  /** Minimum observations for confident causality */
  minObservationsForConfidence: number;

  /** Whether to track code coverage overlap */
  trackCodeCoverage: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_CAUSAL_DISCOVERY_CONFIG: CausalDiscoveryConfig = {
  minCausalityScore: 0.5,
  temporalWindowMs: 60000, // 1 minute
  maxFailuresTracked: 1000,
  minObservationsForConfidence: 3,
  trackCodeCoverage: true,
};

// ============================================================================
// Causal Graph Implementation
// ============================================================================

/**
 * Graph-based causal relationship tracker for test failures
 *
 * Note: Named TestFailureCausalGraph to distinguish from the STDP-based
 * CausalGraph in /causal-discovery/ which operates on abstract TestEventType.
 * This class tracks concrete TestFailure objects with error messages,
 * stack traces, and file paths for failure cascade analysis.
 *
 * For compatibility, exported as CausalGraph from mincut/index.ts
 */
export class TestFailureCausalGraph {
  private failures: Map<string, TestFailure> = new Map();
  private links: Map<string, CausalLink[]> = new Map(); // causeId -> links
  private reverseLinks: Map<string, CausalLink[]> = new Map(); // effectId -> links
  private coOccurrences: Map<string, Map<string, number>> = new Map(); // testId -> testId -> count
  private readonly config: CausalDiscoveryConfig;

  constructor(config: Partial<CausalDiscoveryConfig> = {}) {
    this.config = { ...DEFAULT_CAUSAL_DISCOVERY_CONFIG, ...config };
  }

  /**
   * Add a test failure to the graph
   */
  addFailure(failure: TestFailure): void {
    this.failures.set(failure.id, failure);

    // Enforce max failures limit
    if (this.failures.size > this.config.maxFailuresTracked) {
      const oldest = this.getOldestFailure();
      if (oldest) {
        this.removeFailure(oldest);
      }
    }
  }

  /**
   * Add a batch of failures from a test run
   */
  addFailureBatch(failures: TestFailure[]): void {
    // Sort by timestamp
    const sorted = [...failures].sort((a, b) =>
      a.timestamp.getTime() - b.timestamp.getTime()
    );

    // Add each failure
    for (const failure of sorted) {
      this.addFailure(failure);
    }

    // Discover causal links within this batch
    this.discoverLinksInBatch(sorted);
  }

  /**
   * Discover causal links within a batch of failures
   */
  private discoverLinksInBatch(failures: TestFailure[]): void {
    for (let i = 0; i < failures.length; i++) {
      for (let j = i + 1; j < failures.length; j++) {
        const cause = failures[i];
        const effect = failures[j];

        // Check temporal causality
        const timeDiff = effect.timestamp.getTime() - cause.timestamp.getTime();
        if (timeDiff > 0 && timeDiff <= this.config.temporalWindowMs) {
          this.updateTemporalLink(cause, effect, timeDiff);
        }

        // Check dependency causality
        const sharedFiles = this.findSharedFiles(cause, effect);
        if (sharedFiles.length > 0) {
          this.updateDependencyLink(cause, effect, sharedFiles);
        }

        // Update co-occurrence tracking
        this.updateCoOccurrence(cause.testId, effect.testId);
      }
    }
  }

  /**
   * Update temporal causal link
   */
  private updateTemporalLink(cause: TestFailure, effect: TestFailure, timeDiff: number): void {
    // Score based on time proximity (closer = higher score)
    const timeScore = 1 - (timeDiff / this.config.temporalWindowMs);

    this.addOrUpdateLink({
      causeId: cause.id,
      effectId: effect.id,
      score: timeScore * 0.7, // Base temporal score
      type: 'temporal',
      evidence: `Effect occurred ${timeDiff}ms after cause`,
      observationCount: 1,
    });
  }

  /**
   * Update dependency causal link
   */
  private updateDependencyLink(cause: TestFailure, effect: TestFailure, sharedFiles: string[]): void {
    // Score based on number of shared files
    const dependencyScore = Math.min(1, sharedFiles.length * 0.2);

    this.addOrUpdateLink({
      causeId: cause.id,
      effectId: effect.id,
      score: dependencyScore,
      type: 'dependency',
      evidence: `Shared files: ${sharedFiles.slice(0, 3).join(', ')}`,
      observationCount: 1,
    });
  }

  /**
   * Add or update a causal link
   */
  private addOrUpdateLink(link: CausalLink): void {
    const causeLinks = this.links.get(link.causeId) || [];
    const existing = causeLinks.find(l => l.effectId === link.effectId && l.type === link.type);

    if (existing) {
      // Update existing link
      const updated: CausalLink = {
        ...existing,
        score: (existing.score * existing.observationCount + link.score) / (existing.observationCount + 1),
        observationCount: existing.observationCount + 1,
      };

      const index = causeLinks.indexOf(existing);
      causeLinks[index] = updated;
    } else {
      causeLinks.push(link);
    }

    this.links.set(link.causeId, causeLinks);

    // Update reverse links
    const effectLinks = this.reverseLinks.get(link.effectId) || [];
    const existingReverse = effectLinks.find(l => l.causeId === link.causeId && l.type === link.type);
    if (!existingReverse) {
      effectLinks.push(link);
      this.reverseLinks.set(link.effectId, effectLinks);
    }
  }

  /**
   * Find shared files between two failures
   */
  private findSharedFiles(a: TestFailure, b: TestFailure): string[] {
    const aFiles = new Set(a.relatedFiles);
    return b.relatedFiles.filter(f => aFiles.has(f));
  }

  /**
   * Update co-occurrence tracking
   */
  private updateCoOccurrence(testIdA: string, testIdB: string): void {
    // Ensure alphabetical order for consistent keys
    const [first, second] = testIdA < testIdB ? [testIdA, testIdB] : [testIdB, testIdA];

    const firstMap = this.coOccurrences.get(first) || new Map();
    const count = firstMap.get(second) || 0;
    firstMap.set(second, count + 1);
    this.coOccurrences.set(first, firstMap);
  }

  /**
   * Find root causes for a failure
   */
  findRootCauses(failureId: string): RootCauseAnalysis[] {
    const analyses: RootCauseAnalysis[] = [];
    const failure = this.failures.get(failureId);
    if (!failure) return analyses;

    // Traverse backwards through causal links
    const rootCandidates = this.findUpstreamRoots(failureId, new Set());

    for (const rootId of rootCandidates) {
      const root = this.failures.get(rootId);
      if (!root) continue;

      // Find all downstream effects
      const downstream = this.findDownstreamEffects(rootId, new Set());

      // Calculate confidence
      const linksToRoot = this.reverseLinks.get(rootId) || [];
      const confidence = linksToRoot.length === 0 ? 0.9 : // No upstream = likely root
        Math.max(0.5, 1 - (linksToRoot.length * 0.1));

      analyses.push({
        rootCauseId: rootId,
        rootCauseTest: root.testName,
        cascadingFailures: [...downstream],
        impact: downstream.size,
        confidence,
        suggestedFix: this.suggestFix(root, [...downstream].map(id => this.failures.get(id)!)),
        analyzedAt: new Date(),
      });
    }

    // Sort by confidence and impact
    return analyses.sort((a, b) =>
      (b.confidence * b.impact) - (a.confidence * a.impact)
    );
  }

  /**
   * Find upstream root causes
   */
  private findUpstreamRoots(failureId: string, visited: Set<string>): Set<string> {
    if (visited.has(failureId)) return new Set();
    visited.add(failureId);

    const upstreamLinks = this.reverseLinks.get(failureId) || [];
    const significantLinks = upstreamLinks.filter(l => l.score >= this.config.minCausalityScore);

    if (significantLinks.length === 0) {
      // This is a root
      return new Set([failureId]);
    }

    const roots = new Set<string>();
    for (const link of significantLinks) {
      const upstream = this.findUpstreamRoots(link.causeId, visited);
      upstream.forEach(r => roots.add(r));
    }

    return roots;
  }

  /**
   * Find downstream effects
   */
  private findDownstreamEffects(failureId: string, visited: Set<string>): Set<string> {
    if (visited.has(failureId)) return new Set();
    visited.add(failureId);

    const effects = new Set<string>();
    const downstreamLinks = this.links.get(failureId) || [];

    for (const link of downstreamLinks) {
      if (link.score >= this.config.minCausalityScore) {
        effects.add(link.effectId);
        const downstream = this.findDownstreamEffects(link.effectId, visited);
        downstream.forEach(e => effects.add(e));
      }
    }

    return effects;
  }

  /**
   * Suggest fix based on failure pattern
   */
  private suggestFix(root: TestFailure, cascading: TestFailure[]): FixSuggestion {
    // Analyze error patterns
    const errorTypes = this.categorizeError(root.errorMessage);

    // Collect all related files
    const allFiles = new Set<string>(root.relatedFiles);
    for (const f of cascading) {
      f.relatedFiles.forEach(file => allFiles.add(file));
    }

    // Determine fix type based on error pattern
    if (errorTypes.includes('timeout') || errorTypes.includes('connection')) {
      return {
        type: 'resource_cleanup',
        priority: 'high',
        description: 'Resource or connection issue detected. Consider adding cleanup/retry logic.',
        filesToExamine: [...allFiles].slice(0, 5),
        estimatedEffort: 2,
      };
    }

    if (errorTypes.includes('undefined') || errorTypes.includes('null')) {
      return {
        type: 'code_change',
        priority: 'high',
        description: 'Null/undefined error. Add proper null checks or initialization.',
        filesToExamine: root.relatedFiles.slice(0, 3),
        estimatedEffort: 1,
      };
    }

    if (errorTypes.includes('state') || errorTypes.includes('shared')) {
      return {
        type: 'test_isolation',
        priority: 'medium',
        description: 'Shared state issue. Tests may need better isolation.',
        filesToExamine: [...allFiles].slice(0, 5),
        estimatedEffort: 3,
      };
    }

    if (cascading.length > 5) {
      return {
        type: 'dependency_fix',
        priority: 'critical',
        description: 'High-impact failure affecting many tests. Fix the core dependency.',
        filesToExamine: root.relatedFiles.slice(0, 5),
        estimatedEffort: 4,
      };
    }

    // Default suggestion
    return {
      type: 'code_change',
      priority: 'medium',
      description: 'Review the failing test and related code.',
      filesToExamine: root.relatedFiles.slice(0, 3),
      estimatedEffort: 2,
    };
  }

  /**
   * Categorize error by type
   */
  private categorizeError(message: string): string[] {
    const types: string[] = [];
    const lower = message.toLowerCase();

    if (lower.includes('timeout')) types.push('timeout');
    if (lower.includes('connection') || lower.includes('econnrefused')) types.push('connection');
    if (lower.includes('undefined') || lower.includes('is not defined')) types.push('undefined');
    if (lower.includes('null') || lower.includes('cannot read property')) types.push('null');
    if (lower.includes('state') || lower.includes('already')) types.push('state');
    if (lower.includes('shared') || lower.includes('race')) types.push('shared');
    if (lower.includes('assert')) types.push('assertion');
    if (lower.includes('expect')) types.push('expectation');

    return types.length > 0 ? types : ['unknown'];
  }

  /**
   * Get causal links for a failure
   */
  getLinks(failureId: string): CausalLink[] {
    return this.links.get(failureId) || [];
  }

  /**
   * Get failures caused by a given failure
   */
  getEffects(failureId: string): TestFailure[] {
    const links = this.links.get(failureId) || [];
    return links
      .filter(l => l.score >= this.config.minCausalityScore)
      .map(l => this.failures.get(l.effectId)!)
      .filter(Boolean);
  }

  /**
   * Get failures that caused a given failure
   */
  getCauses(failureId: string): TestFailure[] {
    const links = this.reverseLinks.get(failureId) || [];
    return links
      .filter(l => l.score >= this.config.minCausalityScore)
      .map(l => this.failures.get(l.causeId)!)
      .filter(Boolean);
  }

  /**
   * Get graph statistics
   */
  getStats(): CausalGraphStats {
    // Find all root causes (failures with no significant upstream causes)
    const rootCauses: Array<{ testId: string; impact: number }> = [];

    for (const [failureId, failure] of this.failures) {
      const upstream = this.reverseLinks.get(failureId) || [];
      const significantUpstream = upstream.filter(l => l.score >= this.config.minCausalityScore);

      if (significantUpstream.length === 0) {
        const downstream = this.findDownstreamEffects(failureId, new Set());
        if (downstream.size > 0) {
          rootCauses.push({ testId: failure.testId, impact: downstream.size });
        }
      }
    }

    // Sort by impact
    rootCauses.sort((a, b) => b.impact - a.impact);

    // Calculate total links
    let totalLinks = 0;
    for (const links of this.links.values()) {
      totalLinks += links.length;
    }

    // Calculate average cascade depth
    let totalDepth = 0;
    let depthCount = 0;
    for (const { testId } of rootCauses) {
      const failureId = [...this.failures.entries()].find(([_, f]) => f.testId === testId)?.[0];
      if (failureId) {
        const depth = this.calculateCascadeDepth(failureId, new Set());
        if (depth > 0) {
          totalDepth += depth;
          depthCount++;
        }
      }
    }

    return {
      totalFailures: this.failures.size,
      totalLinks,
      rootCauseCount: rootCauses.length,
      averageCascadeDepth: depthCount > 0 ? totalDepth / depthCount : 0,
      topRootCauses: rootCauses.slice(0, 5),
    };
  }

  /**
   * Calculate cascade depth from a failure
   */
  private calculateCascadeDepth(failureId: string, visited: Set<string>): number {
    if (visited.has(failureId)) return 0;
    visited.add(failureId);

    const links = this.links.get(failureId) || [];
    const significantLinks = links.filter(l => l.score >= this.config.minCausalityScore);

    if (significantLinks.length === 0) return 0;

    let maxDepth = 0;
    for (const link of significantLinks) {
      const depth = this.calculateCascadeDepth(link.effectId, visited);
      maxDepth = Math.max(maxDepth, depth);
    }

    return maxDepth + 1;
  }

  /**
   * Get oldest failure (for eviction)
   */
  private getOldestFailure(): string | undefined {
    let oldest: { id: string; timestamp: Date } | undefined;

    for (const [id, failure] of this.failures) {
      if (!oldest || failure.timestamp < oldest.timestamp) {
        oldest = { id, timestamp: failure.timestamp };
      }
    }

    return oldest?.id;
  }

  /**
   * Remove a failure and its links
   */
  private removeFailure(failureId: string): void {
    this.failures.delete(failureId);
    this.links.delete(failureId);
    this.reverseLinks.delete(failureId);

    // Clean up references in other link lists
    for (const [key, links] of this.links) {
      this.links.set(key, links.filter(l => l.effectId !== failureId));
    }
    for (const [key, links] of this.reverseLinks) {
      this.reverseLinks.set(key, links.filter(l => l.causeId !== failureId));
    }
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.failures.clear();
    this.links.clear();
    this.reverseLinks.clear();
    this.coOccurrences.clear();
  }

  /**
   * Get a failure by ID
   */
  getFailure(id: string): TestFailure | undefined {
    return this.failures.get(id);
  }

  /**
   * Get all failures
   */
  getAllFailures(): TestFailure[] {
    return [...this.failures.values()];
  }

  /**
   * Get failure count
   */
  get failureCount(): number {
    return this.failures.size;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a test failure causal graph
 */
export function createTestFailureCausalGraph(
  config?: Partial<CausalDiscoveryConfig>
): TestFailureCausalGraph {
  return new TestFailureCausalGraph(config);
}

/**
 * Alias for backward compatibility
 * @deprecated Use createTestFailureCausalGraph instead
 */
export function createCausalGraph(
  config?: Partial<CausalDiscoveryConfig>
): TestFailureCausalGraph {
  return new TestFailureCausalGraph(config);
}

/**
 * Alias for backward compatibility with existing imports
 * @deprecated Use TestFailureCausalGraph instead
 */
export { TestFailureCausalGraph as CausalGraph };

/**
 * Create a test failure object
 */
export function createTestFailure(
  testId: string,
  testName: string,
  filePath: string,
  errorMessage: string,
  runId: string,
  options: Partial<Omit<TestFailure, 'id' | 'testId' | 'testName' | 'filePath' | 'errorMessage' | 'runId'>> = {}
): TestFailure {
  return {
    id: uuidv4(),
    testId,
    testName,
    filePath,
    errorMessage,
    runId,
    timestamp: options.timestamp ?? new Date(),
    stackTrace: options.stackTrace,
    relatedFiles: options.relatedFiles ?? [filePath],
    domain: options.domain,
  };
}
