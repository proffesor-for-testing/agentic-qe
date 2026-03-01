/**
 * Agentic QE v3 - Diff Risk Classifier for RuVector Integration
 *
 * Uses RuVector's ML capabilities to classify risk in code changes.
 * Falls back to rule-based classification when RuVector is unavailable.
 */

import { toErrorMessage } from '../../shared/error-utils.js';
import type {
  DiffRiskClassifier,
  RiskClassification,
  DiffContext,
  FileChange,
  RuVectorConfig,
} from './interfaces';
import { FallbackDiffRiskClassifier } from './fallback';
import type { Severity, Priority } from '../../shared/types';
import { getUnifiedMemory, type UnifiedMemoryManager } from '../../kernel/unified-memory.js';

// ============================================================================
// Risk Classification Patterns
// ============================================================================

/**
 * Pattern definitions for risk classification
 */
export interface RiskPatterns {
  /** High-risk code patterns (security, auth, etc.) */
  highRisk: RegExp[];
  /** Sensitive file patterns */
  sensitiveFiles: RegExp[];
  /** Critical path patterns */
  criticalPaths: RegExp[];
  /** Architectural boundary patterns */
  boundaryPatterns: RegExp[];
}

const DEFAULT_RISK_PATTERNS: RiskPatterns = {
  highRisk: [
    /auth/i,
    /security/i,
    /password/i,
    /token/i,
    /secret/i,
    /key/i,
    /payment/i,
    /billing/i,
    /crypto/i,
    /encrypt/i,
    /decrypt/i,
    /database/i,
    /migration/i,
    /schema/i,
    /sql/i,
    /permission/i,
    /role/i,
    /access/i,
    /admin/i,
    /credential/i,
    /certificate/i,
    /oauth/i,
    /jwt/i,
    /session/i,
  ],
  sensitiveFiles: [
    /\.env/,
    /config.*\.(ts|js|json)$/,
    /secrets?\./,
    /credentials?\./,
    /\.pem$/,
    /\.key$/,
    /\.crt$/,
    /password/i,
    /api[_-]?key/i,
  ],
  criticalPaths: [
    /kernel/i,
    /core/i,
    /engine/i,
    /foundation/i,
    /infrastructure/i,
    /bootstrap/i,
    /init/i,
    /startup/i,
  ],
  boundaryPatterns: [
    /interface/i,
    /contract/i,
    /api/i,
    /public/i,
    /external/i,
    /gateway/i,
    /adapter/i,
  ],
};

// ============================================================================
// RuVector Diff Risk Classifier Implementation
// ============================================================================

/**
 * Diff risk classifier that integrates with RuVector
 * Provides ML-enhanced risk classification for code changes
 */
export class RuVectorDiffRiskClassifier implements DiffRiskClassifier {
  private readonly fallback: FallbackDiffRiskClassifier;
  private readonly patterns: RiskPatterns;
  private readonly cache: Map<string, { result: RiskClassification; timestamp: number }> = new Map();
  private db: UnifiedMemoryManager | null = null;
  private persistCount = 0;
  private static readonly PERSIST_INTERVAL = 25;
  private static readonly NAMESPACE = 'diff-risk-cache';
  private static readonly TTL_SECONDS = 86400;

  constructor(
    private readonly config: RuVectorConfig,
    patterns?: Partial<RiskPatterns>
  ) {
    this.fallback = new FallbackDiffRiskClassifier();
    this.patterns = { ...DEFAULT_RISK_PATTERNS, ...patterns };
  }

  async initialize(): Promise<void> {
    try {
      this.db = getUnifiedMemory();
      if (!this.db.isInitialized()) await this.db.initialize();
      await this.loadFromKv();
    } catch (error) {
      console.warn('[RuVectorDiffRiskClassifier] DB init failed, using memory-only:', toErrorMessage(error));
      this.db = null;
    }
  }

  private async loadFromKv(): Promise<void> {
    if (!this.db) return;
    const data = await this.db.kvGet<Record<string, { result: RiskClassification; timestamp: number }>>('cache', RuVectorDiffRiskClassifier.NAMESPACE);
    if (data) {
      for (const [key, entry] of Object.entries(data)) {
        this.cache.set(key, entry);
      }
      console.log(`[RuVectorDiffRiskClassifier] Loaded ${Object.keys(data).length} cached entries from DB`);
    }
  }

  private persistCache(): void {
    if (!this.db) return;
    this.persistCount++;
    if (this.persistCount % RuVectorDiffRiskClassifier.PERSIST_INTERVAL !== 0) return;
    try {
      const entries = Array.from(this.cache.entries()).slice(-200);
      const snapshot = Object.fromEntries(entries);
      this.db.kvSet('cache', snapshot, RuVectorDiffRiskClassifier.NAMESPACE, RuVectorDiffRiskClassifier.TTL_SECONDS).catch(() => {});
    } catch (error) {
      console.warn('[RuVectorDiffRiskClassifier] Persist failed:', toErrorMessage(error));
    }
  }

  /**
   * Classify risk of a diff/changeset
   */
  async classifyDiff(context: DiffContext): Promise<RiskClassification> {
    if (!this.config.enabled) {
      return this.fallback.classifyDiff(context);
    }

    // Check cache
    const cacheKey = this.computeCacheKey(context);
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < (this.config.cacheTtl || 300000)) {
        return cached.result;
      }
    }

    try {
      const result = await this.performClassification(context);

      // Cache result
      if (this.config.cacheEnabled) {
        this.cache.set(cacheKey, { result, timestamp: Date.now() });
        this.persistCache();
      }

      return result;
    } catch (error) {
      console.warn('[RuVectorDiffRiskClassifier] Classification failed, using fallback:', error);
      return this.fallback.classifyDiff(context);
    }
  }

  /**
   * Get files sorted by risk
   */
  async rankFilesByRisk(
    files: FileChange[]
  ): Promise<Array<{ filePath: string; riskScore: number; riskLevel: Severity }>> {
    const rankings = await Promise.all(
      files.map(async (file) => {
        const score = await this.calculateFileRisk(file);
        return {
          filePath: file.filePath,
          riskScore: score,
          riskLevel: this.scoreToLevel(score),
        };
      })
    );

    return rankings.sort((a, b) => b.riskScore - a.riskScore);
  }

  /**
   * Check if change requires security review
   */
  async requiresSecurityReview(context: DiffContext): Promise<boolean> {
    const securityIndicators = [
      // Check for security-related file changes
      context.files.some((f) =>
        this.patterns.highRisk.some((p) => p.test(f.filePath))
      ),
      // Check for sensitive files
      context.files.some((f) =>
        this.patterns.sensitiveFiles.some((p) => p.test(f.filePath))
      ),
      // Check commit message for security keywords
      context.message &&
        /security|vulnerability|cve|exploit|patch|fix.*auth|fix.*token/i.test(context.message),
      // Check for large changes to critical code
      context.files.some(
        (f) =>
          this.patterns.criticalPaths.some((p) => p.test(f.filePath)) &&
          f.additions + f.deletions > 50
      ),
    ];

    return securityIndicators.some(Boolean);
  }

  /**
   * Get recommended reviewers based on risk
   */
  async getRecommendedReviewers(context: DiffContext): Promise<string[]> {
    const reviewers: Set<string> = new Set();

    // Determine reviewer types based on change characteristics
    const hasSecurityChanges = context.files.some((f) =>
      this.patterns.highRisk.some((p) => p.test(f.filePath))
    );
    const hasAPIChanges = context.files.some((f) =>
      this.patterns.boundaryPatterns.some((p) => p.test(f.filePath))
    );
    const hasCoreChanges = context.files.some((f) =>
      this.patterns.criticalPaths.some((p) => p.test(f.filePath))
    );

    // Add reviewer roles based on change types
    if (hasSecurityChanges) {
      reviewers.add('security-team');
    }
    if (hasAPIChanges) {
      reviewers.add('api-owner');
    }
    if (hasCoreChanges) {
      reviewers.add('tech-lead');
    }

    // Add domain-specific reviewers
    const domains = this.identifyDomains(context.files);
    for (const domain of domains) {
      reviewers.add(`${domain}-owner`);
    }

    return Array.from(reviewers);
  }

  /**
   * Predict potential defects in change
   */
  async predictDefects(
    context: DiffContext
  ): Promise<Array<{
    filePath: string;
    probability: number;
    type: string;
    location?: { line: number; column: number };
  }>> {
    const predictions: Array<{
      filePath: string;
      probability: number;
      type: string;
      location?: { line: number; column: number };
    }> = [];

    for (const file of context.files) {
      const riskScore = await this.calculateFileRisk(file);

      // High-risk changes have higher defect probability
      if (riskScore > 0.5) {
        predictions.push({
          filePath: file.filePath,
          probability: riskScore,
          type: this.predictDefectType(file, riskScore),
          location: this.estimateDefectLocation(file),
        });
      }

      // Large additions are prone to new-code defects
      if (file.additions > 100) {
        predictions.push({
          filePath: file.filePath,
          probability: Math.min(0.8, file.additions / 500),
          type: 'new-code-defect',
        });
      }

      // Large deletions might cause regressions
      if (file.deletions > 50 && file.status !== 'deleted') {
        predictions.push({
          filePath: file.filePath,
          probability: Math.min(0.6, file.deletions / 200),
          type: 'regression',
        });
      }
    }

    return predictions.sort((a, b) => b.probability - a.probability);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Perform risk classification
   */
  private async performClassification(context: DiffContext): Promise<RiskClassification> {
    const factors: Array<{ name: string; weight: number; description: string }> = [];
    let totalWeight = 0;
    let weightedSum = 0;

    // Factor: Total change size
    const totalChanges = context.files.reduce(
      (sum, f) => sum + f.additions + f.deletions,
      0
    );
    const changeSizeFactor = this.calculateChangeSizeFactor(totalChanges);
    if (changeSizeFactor.weight > 0) {
      factors.push(changeSizeFactor);
      weightedSum += changeSizeFactor.weight * changeSizeFactor.score;
      totalWeight += changeSizeFactor.weight;
    }

    // Factor: Security-sensitive code
    const securityFactor = this.calculateSecurityFactor(context.files);
    if (securityFactor.weight > 0) {
      factors.push(securityFactor);
      weightedSum += securityFactor.weight * securityFactor.score;
      totalWeight += securityFactor.weight;
    }

    // Factor: Critical path changes
    const criticalPathFactor = this.calculateCriticalPathFactor(context.files);
    if (criticalPathFactor.weight > 0) {
      factors.push(criticalPathFactor);
      weightedSum += criticalPathFactor.weight * criticalPathFactor.score;
      totalWeight += criticalPathFactor.weight;
    }

    // Factor: API boundary changes
    const boundaryFactor = this.calculateBoundaryFactor(context.files);
    if (boundaryFactor.weight > 0) {
      factors.push(boundaryFactor);
      weightedSum += boundaryFactor.weight * boundaryFactor.score;
      totalWeight += boundaryFactor.weight;
    }

    // Factor: File diversity
    const diversityFactor = this.calculateDiversityFactor(context.files);
    if (diversityFactor.weight > 0) {
      factors.push(diversityFactor);
      weightedSum += diversityFactor.weight * diversityFactor.score;
      totalWeight += diversityFactor.weight;
    }

    // Factor: Deleted files
    const deletionFactor = this.calculateDeletionFactor(context.files);
    if (deletionFactor.weight > 0) {
      factors.push(deletionFactor);
      weightedSum += deletionFactor.weight * deletionFactor.score;
      totalWeight += deletionFactor.weight;
    }

    const score = totalWeight > 0 ? weightedSum / totalWeight : 0.2;
    const level = this.scoreToLevel(score);
    const highRiskFiles = await this.identifyHighRiskFiles(context.files);
    const recommendedTests = this.generateTestRecommendations(context, level);

    return {
      level,
      score: Math.min(1, score),
      factors: factors.map((f) => ({
        name: f.name,
        weight: f.weight,
        description: f.description,
      })),
      highRiskFiles,
      recommendedTests,
      usedFallback: false,
    };
  }

  /**
   * Calculate change size risk factor
   */
  private calculateChangeSizeFactor(totalChanges: number): {
    name: string;
    weight: number;
    score: number;
    description: string;
  } {
    if (totalChanges > 1000) {
      return {
        name: 'very-large-change',
        weight: 0.35,
        score: 1,
        description: `Very large changeset with ${totalChanges} lines modified`,
      };
    }
    if (totalChanges > 500) {
      return {
        name: 'large-change',
        weight: 0.3,
        score: 0.8,
        description: `Large changeset with ${totalChanges} lines modified`,
      };
    }
    if (totalChanges > 200) {
      return {
        name: 'moderate-change',
        weight: 0.2,
        score: 0.5,
        description: `Moderate changeset with ${totalChanges} lines modified`,
      };
    }
    return {
      name: 'small-change',
      weight: 0,
      score: 0,
      description: '',
    };
  }

  /**
   * Calculate security-sensitive code factor
   */
  private calculateSecurityFactor(files: FileChange[]): {
    name: string;
    weight: number;
    score: number;
    description: string;
  } {
    const sensitiveFiles = files.filter((f) =>
      this.patterns.highRisk.some((p) => p.test(f.filePath))
    );

    if (sensitiveFiles.length === 0) {
      return { name: '', weight: 0, score: 0, description: '' };
    }

    const sensitiveFileNames = sensitiveFiles.map((f) => f.filePath).slice(0, 3);
    const score = Math.min(1, sensitiveFiles.length / 3);

    return {
      name: 'security-sensitive',
      weight: 0.4,
      score,
      description: `${sensitiveFiles.length} security-sensitive file(s): ${sensitiveFileNames.join(', ')}`,
    };
  }

  /**
   * Calculate critical path factor
   */
  private calculateCriticalPathFactor(files: FileChange[]): {
    name: string;
    weight: number;
    score: number;
    description: string;
  } {
    const criticalFiles = files.filter((f) =>
      this.patterns.criticalPaths.some((p) => p.test(f.filePath))
    );

    if (criticalFiles.length === 0) {
      return { name: '', weight: 0, score: 0, description: '' };
    }

    return {
      name: 'critical-path',
      weight: 0.35,
      score: Math.min(1, criticalFiles.length / 2),
      description: `${criticalFiles.length} file(s) in critical paths`,
    };
  }

  /**
   * Calculate API boundary factor
   */
  private calculateBoundaryFactor(files: FileChange[]): {
    name: string;
    weight: number;
    score: number;
    description: string;
  } {
    const boundaryFiles = files.filter((f) =>
      this.patterns.boundaryPatterns.some((p) => p.test(f.filePath))
    );

    if (boundaryFiles.length === 0) {
      return { name: '', weight: 0, score: 0, description: '' };
    }

    return {
      name: 'api-boundary',
      weight: 0.25,
      score: Math.min(1, boundaryFiles.length / 5),
      description: `${boundaryFiles.length} API boundary file(s) modified`,
    };
  }

  /**
   * Calculate file diversity factor
   */
  private calculateDiversityFactor(files: FileChange[]): {
    name: string;
    weight: number;
    score: number;
    description: string;
  } {
    // Get unique directories
    const directories = new Set(
      files.map((f) => f.filePath.split('/').slice(0, -1).join('/'))
    );

    if (directories.size <= 3) {
      return { name: '', weight: 0, score: 0, description: '' };
    }

    return {
      name: 'high-diversity',
      weight: 0.2,
      score: Math.min(1, directories.size / 10),
      description: `Changes span ${directories.size} different directories`,
    };
  }

  /**
   * Calculate deletion factor
   */
  private calculateDeletionFactor(files: FileChange[]): {
    name: string;
    weight: number;
    score: number;
    description: string;
  } {
    const deletedFiles = files.filter((f) => f.status === 'deleted');

    if (deletedFiles.length === 0) {
      return { name: '', weight: 0, score: 0, description: '' };
    }

    return {
      name: 'file-deletions',
      weight: 0.2,
      score: Math.min(1, deletedFiles.length / 5),
      description: `${deletedFiles.length} file(s) deleted`,
    };
  }

  /**
   * Calculate risk score for a single file
   */
  private async calculateFileRisk(file: FileChange): Promise<number> {
    let risk = 0.2; // Base risk

    // Sensitive file patterns
    if (this.patterns.sensitiveFiles.some((p) => p.test(file.filePath))) {
      risk += 0.35;
    }

    // High-risk code patterns
    if (this.patterns.highRisk.some((p) => p.test(file.filePath))) {
      risk += 0.25;
    }

    // Critical paths
    if (this.patterns.criticalPaths.some((p) => p.test(file.filePath))) {
      risk += 0.2;
    }

    // Change size factor
    const changes = file.additions + file.deletions;
    if (changes > 200) risk += 0.2;
    else if (changes > 100) risk += 0.1;
    else if (changes > 50) risk += 0.05;

    // File type factor
    if (file.filePath.endsWith('.sql') || file.filePath.endsWith('.migration')) {
      risk += 0.15;
    }

    // Deleted files have inherent risk
    if (file.status === 'deleted') risk += 0.1;

    return Math.min(1, risk);
  }

  /**
   * Identify high-risk files
   */
  private async identifyHighRiskFiles(files: FileChange[]): Promise<string[]> {
    const riskScores = await Promise.all(
      files.map(async (f) => ({
        path: f.filePath,
        score: await this.calculateFileRisk(f),
      }))
    );

    return riskScores
      .filter((r) => r.score >= 0.6)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.path);
  }

  /**
   * Convert score to risk level
   */
  private scoreToLevel(score: number): Severity {
    if (score >= 0.8) return 'critical';
    if (score >= 0.6) return 'high';
    if (score >= 0.4) return 'medium';
    if (score >= 0.2) return 'low';
    return 'info';
  }

  /**
   * Generate test recommendations
   */
  private generateTestRecommendations(
    context: DiffContext,
    level: Severity
  ): Array<{
    type: 'unit' | 'integration' | 'e2e' | 'security' | 'performance';
    priority: Priority;
    reason: string;
  }> {
    const tests: Array<{
      type: 'unit' | 'integration' | 'e2e' | 'security' | 'performance';
      priority: Priority;
      reason: string;
    }> = [];

    // Unit tests always recommended
    tests.push({
      type: 'unit',
      priority: level === 'critical' || level === 'high' ? 'p0' : 'p1',
      reason: 'Verify core functionality of changed code',
    });

    // Integration tests for moderate+ risk
    if (level !== 'info' && level !== 'low') {
      tests.push({
        type: 'integration',
        priority: level === 'critical' ? 'p0' : 'p1',
        reason: 'Verify component interactions across boundaries',
      });
    }

    // Security tests for security-related changes
    if (
      context.files.some((f) =>
        this.patterns.highRisk.some((p) => p.test(f.filePath))
      )
    ) {
      tests.push({
        type: 'security',
        priority: 'p0',
        reason: 'Changes affect security-sensitive code paths',
      });
    }

    // E2E tests for critical/high risk
    if (level === 'critical' || level === 'high') {
      tests.push({
        type: 'e2e',
        priority: level === 'critical' ? 'p0' : 'p1',
        reason: 'High-risk changes require end-to-end validation',
      });
    }

    // Performance tests for large changes to core code
    if (
      context.files.some(
        (f) =>
          this.patterns.criticalPaths.some((p) => p.test(f.filePath)) &&
          f.additions + f.deletions > 100
      )
    ) {
      tests.push({
        type: 'performance',
        priority: 'p1',
        reason: 'Large changes to core code may impact performance',
      });
    }

    return tests;
  }

  /**
   * Predict defect type based on file and risk score
   */
  private predictDefectType(file: FileChange, riskScore: number): string {
    if (this.patterns.highRisk.some((p) => p.test(file.filePath))) {
      return 'security-vulnerability';
    }
    if (file.status === 'deleted' || file.deletions > file.additions) {
      return 'regression';
    }
    if (riskScore > 0.7) {
      return 'logic-error';
    }
    return 'new-code-defect';
  }

  /**
   * Estimate defect location in file
   */
  private estimateDefectLocation(
    file: FileChange
  ): { line: number; column: number } | undefined {
    if (file.hunks && file.hunks.length > 0) {
      // Estimate defect near middle of first hunk
      const hunk = file.hunks[0];
      return {
        line: Math.round((hunk.startLine + hunk.endLine) / 2),
        column: 1,
      };
    }
    return undefined;
  }

  /**
   * Identify domains touched by changes
   */
  private identifyDomains(files: FileChange[]): string[] {
    const domains = new Set<string>();

    for (const file of files) {
      // Extract domain from path patterns
      const match = file.filePath.match(/domains?\/([^/]+)/i);
      if (match) {
        domains.add(match[1]);
      }

      // Check for known domain patterns
      if (file.filePath.includes('auth')) domains.add('auth');
      if (file.filePath.includes('payment')) domains.add('payment');
      if (file.filePath.includes('user')) domains.add('user');
      if (file.filePath.includes('api')) domains.add('api');
    }

    return Array.from(domains);
  }

  /**
   * Compute cache key for context
   */
  private computeCacheKey(context: DiffContext): string {
    const fileKeys = context.files
      .map((f) => `${f.filePath}:${f.status}:${f.additions}:${f.deletions}`)
      .sort()
      .join('|');

    return `${context.commitHash || 'unknown'}:${fileKeys}`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

import {
  getRuVectorObservability,
  type FallbackReason,
} from './observability.js';

/**
 * Create diff risk classifier with ML-first approach
 *
 * IMPORTANT: This function tries ML FIRST and only falls back on actual errors.
 * Fallback usage is recorded via observability layer and triggers alerts.
 *
 * @param config - RuVector configuration
 * @param patterns - Optional risk patterns
 * @returns Promise resolving to DiffRiskClassifier (ML or fallback)
 */
export async function createDiffRiskClassifier(
  config: RuVectorConfig,
  patterns?: Partial<RiskPatterns>
): Promise<DiffRiskClassifier> {
  const observability = getRuVectorObservability();
  const startTime = Date.now();

  // If explicitly disabled by config, use fallback but record it
  if (!config.enabled) {
    observability.recordFallback('diff-risk-classifier', 'disabled');
    observability.checkAndAlert();
    return new FallbackDiffRiskClassifier();
  }

  try {
    // Try ML implementation FIRST
    const classifier = new RuVectorDiffRiskClassifier(config, patterns);
    // Record successful ML usage
    observability.recordMLUsage('diff-risk-classifier', true, Date.now() - startTime);
    return classifier;
  } catch (error) {
    // Record fallback with reason
    const reason: FallbackReason = error instanceof Error && error.message.includes('timeout')
      ? 'timeout'
      : 'error';
    observability.recordFallback('diff-risk-classifier', reason);
    // Alert about fallback usage
    observability.checkAndAlert();
    console.warn(
      `[RuVector] Diff risk classifier initialization failed, using fallback: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
    return new FallbackDiffRiskClassifier();
  }
}

/**
 * Create diff risk classifier synchronously (legacy API)
 *
 * @deprecated Use createDiffRiskClassifier() async version for proper observability
 */
export function createDiffRiskClassifierSync(
  config: RuVectorConfig,
  patterns?: Partial<RiskPatterns>
): DiffRiskClassifier {
  const observability = getRuVectorObservability();

  if (!config.enabled) {
    observability.recordFallback('diff-risk-classifier', 'disabled');
    return new FallbackDiffRiskClassifier();
  }

  try {
    const classifier = new RuVectorDiffRiskClassifier(config, patterns);
    observability.recordMLUsage('diff-risk-classifier', true);
    return classifier;
  } catch (error) {
    observability.recordFallback('diff-risk-classifier', 'error');
    return new FallbackDiffRiskClassifier();
  }
}
