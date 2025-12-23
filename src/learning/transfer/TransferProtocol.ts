/**
 * TransferProtocol - Full cross-agent pattern transfer implementation
 *
 * Extends TransferPrototype with stricter thresholds, validation,
 * and registry tracking for production use.
 *
 * Part of the Nightly-Learner Phase 2 implementation.
 *
 * @version 1.0.0
 * @module src/learning/transfer/TransferProtocol
 */

import { EventEmitter } from 'events';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import { Logger } from '../../utils/Logger';
import { SecureRandom } from '../../utils/SecureRandom';
import { TransferPrototype, AgentDomain } from './TransferPrototype';

export interface TransferRequest {
  id: string;
  sourceAgent: string;
  targetAgent: string;
  patternIds: string[];
  priority: 'high' | 'medium' | 'low';
  reason: string;
  requestedAt: Date;
  requestedBy?: string;
}

export interface TransferResult {
  requestId: string;
  sourceAgent: string;
  targetAgent: string;
  patternsTransferred: number;
  patternsSkipped: number;
  patternsRejected: number;
  successRate: number;
  details: TransferDetail[];
  duration: number;
  validationPassed: boolean;
}

export interface TransferDetail {
  patternId: string;
  status: 'transferred' | 'skipped' | 'rejected';
  reason?: string;
  compatibilityScore: number;
  validationResult?: ValidationResult;
}

export interface ValidationResult {
  passed: boolean;
  tests: ValidationTest[];
  overallScore: number;
}

export interface ValidationTest {
  name: string;
  passed: boolean;
  score: number;
  message?: string;
}

export interface TransferProtocolConfig {
  /** Database path. Default: .agentic-qe/memory.db */
  dbPath?: string;
  /** Minimum compatibility score for transfer. Default: 0.5 */
  compatibilityThreshold?: number;
  /** Enable post-transfer validation. Default: true */
  enableValidation?: boolean;
  /** Maximum patterns per transfer. Default: 50 */
  maxPatternsPerTransfer?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export interface TransferStats {
  totalRequests: number;
  successfulTransfers: number;
  failedTransfers: number;
  overallSuccessRate: number;
  byAgentPair: Map<string, { success: number; fail: number }>;
  averageCompatibilityScore: number;
}

/**
 * TransferProtocol manages cross-agent pattern transfer with validation
 *
 * @example
 * ```typescript
 * const protocol = new TransferProtocol({ compatibilityThreshold: 0.5 });
 *
 * const request = await protocol.createRequest({
 *   sourceAgent: 'test-generator',
 *   targetAgent: 'coverage-analyzer',
 *   patternIds: ['pattern-1', 'pattern-2'],
 *   priority: 'high',
 *   reason: 'Share test optimization patterns',
 * });
 *
 * const result = await protocol.executeTransfer(request);
 * console.log(`Transferred ${result.patternsTransferred} patterns`);
 * ```
 */
export class TransferProtocol extends EventEmitter {
  private config: Required<TransferProtocolConfig>;
  private prototype: TransferPrototype;
  private db: BetterSqlite3.Database;
  private logger: Logger;

  // Agent domains (shared with prototype)
  private agentDomains!: Map<string, AgentDomain>;

  constructor(config?: TransferProtocolConfig) {
    super();
    this.logger = Logger.getInstance();

    this.config = {
      dbPath: config?.dbPath || path.join(process.cwd(), '.agentic-qe', 'memory.db'),
      compatibilityThreshold: config?.compatibilityThreshold ?? 0.5, // Stricter than prototype
      enableValidation: config?.enableValidation ?? true,
      maxPatternsPerTransfer: config?.maxPatternsPerTransfer ?? 50,
      debug: config?.debug ?? false,
    };

    this.db = new BetterSqlite3(this.config.dbPath);
    this.prototype = new TransferPrototype(this.config.dbPath);

    this.initializeSchema();
    this.initializeAgentDomains();
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transfer_requests (
        id TEXT PRIMARY KEY,
        source_agent TEXT NOT NULL,
        target_agent TEXT NOT NULL,
        pattern_ids TEXT NOT NULL,
        priority TEXT NOT NULL,
        reason TEXT NOT NULL,
        requested_at INTEGER NOT NULL,
        requested_by TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        result TEXT,
        completed_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS transfer_registry (
        id TEXT PRIMARY KEY,
        pattern_id TEXT NOT NULL,
        source_agent TEXT NOT NULL,
        target_agent TEXT NOT NULL,
        transfer_id TEXT NOT NULL,
        compatibility_score REAL NOT NULL,
        validation_passed INTEGER,
        transferred_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        FOREIGN KEY (transfer_id) REFERENCES transfer_requests(id)
      );

      CREATE INDEX IF NOT EXISTS idx_transfer_req_status ON transfer_requests(status);
      CREATE INDEX IF NOT EXISTS idx_transfer_req_source ON transfer_requests(source_agent);
      CREATE INDEX IF NOT EXISTS idx_transfer_reg_pattern ON transfer_registry(pattern_id);
      CREATE INDEX IF NOT EXISTS idx_transfer_reg_target ON transfer_registry(target_agent);
    `);
  }

  /**
   * Initialize agent domain definitions
   */
  private initializeAgentDomains(): void {
    this.agentDomains = new Map([
      ['test-generator', {
        agentType: 'test-generator',
        capabilities: ['test-generation', 'code-analysis', 'pattern-matching', 'assertion-generation'],
        frameworks: ['jest', 'mocha', 'vitest', 'pytest', 'playwright'],
        taskTypes: ['unit-test', 'integration-test', 'e2e-test', 'component-test'],
      }],
      ['coverage-analyzer', {
        agentType: 'coverage-analyzer',
        capabilities: ['coverage-analysis', 'gap-detection', 'report-generation', 'branch-analysis'],
        frameworks: ['istanbul', 'c8', 'jest-coverage', 'nyc'],
        taskTypes: ['coverage-analysis', 'gap-detection', 'coverage-report', 'branch-coverage'],
      }],
      ['performance-tester', {
        agentType: 'performance-tester',
        capabilities: ['load-testing', 'benchmark', 'profiling', 'bottleneck-detection'],
        frameworks: ['k6', 'artillery', 'autocannon', 'lighthouse'],
        taskTypes: ['load-test', 'stress-test', 'benchmark', 'performance-audit'],
      }],
      ['security-scanner', {
        agentType: 'security-scanner',
        capabilities: ['vulnerability-scan', 'dependency-audit', 'code-analysis', 'secret-detection'],
        frameworks: ['snyk', 'owasp', 'eslint-security', 'trivy'],
        taskTypes: ['security-scan', 'dependency-check', 'compliance', 'penetration-test'],
      }],
      ['flaky-test-hunter', {
        agentType: 'flaky-test-hunter',
        capabilities: ['flaky-detection', 'test-analysis', 'stability-scoring', 'retry-optimization'],
        frameworks: ['jest', 'mocha', 'playwright', 'cypress'],
        taskTypes: ['flaky-detection', 'test-stability', 'retry-analysis', 'quarantine-management'],
      }],
      ['quality-gate', {
        agentType: 'quality-gate',
        capabilities: ['quality-check', 'threshold-validation', 'gate-evaluation', 'metric-aggregation'],
        frameworks: ['sonarqube', 'custom-gates', 'eslint', 'prettier'],
        taskTypes: ['quality-gate', 'deployment-check', 'release-validation', 'code-review'],
      }],
    ]);
  }

  /**
   * Create a transfer request
   */
  async createRequest(params: {
    sourceAgent: string;
    targetAgent: string;
    patternIds: string[];
    priority?: 'high' | 'medium' | 'low';
    reason: string;
    requestedBy?: string;
  }): Promise<TransferRequest> {
    const request: TransferRequest = {
      id: `transfer-${Date.now()}-${SecureRandom.randomString(8, 'alphanumeric')}`,
      sourceAgent: params.sourceAgent,
      targetAgent: params.targetAgent,
      patternIds: params.patternIds.slice(0, this.config.maxPatternsPerTransfer),
      priority: params.priority || 'medium',
      reason: params.reason,
      requestedAt: new Date(),
      requestedBy: params.requestedBy,
    };

    // Store request
    this.db.prepare(`
      INSERT INTO transfer_requests
      (id, source_agent, target_agent, pattern_ids, priority, reason, requested_at, requested_by, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      request.id,
      request.sourceAgent,
      request.targetAgent,
      JSON.stringify(request.patternIds),
      request.priority,
      request.reason,
      request.requestedAt.getTime(),
      request.requestedBy || null
    );

    this.logger.info('[TransferProtocol] Request created', {
      id: request.id,
      source: request.sourceAgent,
      target: request.targetAgent,
      patterns: request.patternIds.length,
    });

    this.emit('request:created', request);
    return request;
  }

  /**
   * Execute a transfer request
   */
  async executeTransfer(request: TransferRequest): Promise<TransferResult> {
    const startTime = Date.now();

    this.logger.info('[TransferProtocol] Executing transfer', {
      id: request.id,
      source: request.sourceAgent,
      target: request.targetAgent,
    });

    const details: TransferDetail[] = [];
    let patternsTransferred = 0;
    let patternsSkipped = 0;
    let patternsRejected = 0;

    // Update request status
    this.db.prepare(`UPDATE transfer_requests SET status = 'executing' WHERE id = ?`)
      .run(request.id);

    // Process each pattern
    for (const patternId of request.patternIds) {
      const pattern = await this.getPattern(patternId);

      if (!pattern) {
        details.push({
          patternId,
          status: 'skipped',
          reason: 'Pattern not found',
          compatibilityScore: 0,
        });
        patternsSkipped++;
        continue;
      }

      // Calculate compatibility
      const compatibility = this.calculateCompatibility(pattern, request.sourceAgent, request.targetAgent);

      if (compatibility.score < this.config.compatibilityThreshold) {
        details.push({
          patternId,
          status: 'rejected',
          reason: compatibility.reason || 'Below compatibility threshold',
          compatibilityScore: compatibility.score,
        });
        patternsRejected++;
        continue;
      }

      // Perform transfer
      const transferSuccess = await this.performTransfer(pattern, request.targetAgent);

      // Validate if enabled
      let validationResult: ValidationResult | undefined;
      if (this.config.enableValidation && transferSuccess) {
        validationResult = await this.validateTransfer(pattern, request.targetAgent);
      }

      const status = transferSuccess
        ? (validationResult?.passed !== false ? 'transferred' : 'rejected')
        : 'rejected';

      details.push({
        patternId,
        status,
        compatibilityScore: compatibility.score,
        validationResult,
        reason: status === 'rejected' ? (validationResult?.tests[0]?.message || 'Transfer failed') : undefined,
      });

      if (status === 'transferred') {
        patternsTransferred++;
        this.registerTransfer(patternId, request, compatibility.score, validationResult?.passed ?? true);
      } else {
        patternsRejected++;
      }
    }

    const duration = Date.now() - startTime;
    const totalProcessed = patternsTransferred + patternsSkipped + patternsRejected;
    const successRate = totalProcessed > 0 ? patternsTransferred / totalProcessed : 0;
    const validationPassed = successRate >= 0.7; // Phase 2 target: 70%

    const result: TransferResult = {
      requestId: request.id,
      sourceAgent: request.sourceAgent,
      targetAgent: request.targetAgent,
      patternsTransferred,
      patternsSkipped,
      patternsRejected,
      successRate,
      details,
      duration,
      validationPassed,
    };

    // Update request with result
    this.db.prepare(`
      UPDATE transfer_requests
      SET status = ?, result = ?, completed_at = ?
      WHERE id = ?
    `).run(
      validationPassed ? 'completed' : 'partial',
      JSON.stringify(result),
      Date.now(),
      request.id
    );

    this.logger.info('[TransferProtocol] Transfer complete', {
      id: request.id,
      transferred: patternsTransferred,
      skipped: patternsSkipped,
      rejected: patternsRejected,
      successRate: (successRate * 100).toFixed(1) + '%',
      validationPassed,
    });

    this.emit('transfer:complete', result);
    return result;
  }

  /**
   * Get a pattern from the database
   */
  private async getPattern(patternId: string): Promise<PatternData | null> {
    // Try patterns table (actual schema: id, pattern, confidence, agent_id, domain)
    let row = this.db.prepare(`
      SELECT id, pattern as content, domain as type, confidence, metadata as context, agent_id
      FROM patterns WHERE id = ?
    `).get(patternId) as any;

    if (row) {
      return {
        id: row.id,
        type: row.type || 'general',
        content: row.content,
        confidence: row.confidence || 0.7,
        context: row.context,
        agentId: row.agent_id,
      };
    }

    // Try synthesized_patterns table
    row = this.db.prepare(`
      SELECT id, type, description as content, confidence, agent_types, task_types
      FROM synthesized_patterns WHERE id = ?
    `).get(patternId) as any;

    if (row) {
      return {
        id: row.id,
        type: row.type || 'general',
        content: row.content,
        confidence: row.confidence || 0.7,
        context: JSON.stringify({ agentTypes: row.agent_types, taskTypes: row.task_types }),
      };
    }

    return null;
  }

  /**
   * Calculate compatibility between pattern and target agent
   */
  private calculateCompatibility(
    pattern: PatternData,
    sourceAgent: string,
    targetAgent: string
  ): { score: number; reason?: string } {
    const sourceDomain = this.agentDomains.get(sourceAgent);
    const targetDomain = this.agentDomains.get(targetAgent);

    if (!sourceDomain || !targetDomain) {
      return { score: 0.3, reason: 'Unknown agent domain' };
    }

    // Factor weights
    const CAPABILITY_WEIGHT = 0.35;
    const FRAMEWORK_WEIGHT = 0.25;
    const TASK_WEIGHT = 0.25;
    const QUALITY_WEIGHT = 0.15;

    // Calculate overlaps with semantic similarity
    const capabilityScore = this.calculateOverlapWithSemantic(
      sourceDomain.capabilities,
      targetDomain.capabilities
    );

    const frameworkScore = this.calculateOverlapWithSemantic(
      sourceDomain.frameworks,
      targetDomain.frameworks
    );

    const taskScore = this.calculateOverlapWithSemantic(
      sourceDomain.taskTypes,
      targetDomain.taskTypes
    );

    const qualityScore = pattern.confidence || 0.7;

    const score =
      capabilityScore * CAPABILITY_WEIGHT +
      frameworkScore * FRAMEWORK_WEIGHT +
      taskScore * TASK_WEIGHT +
      qualityScore * QUALITY_WEIGHT;

    if (this.config.debug) {
      this.logger.debug('[TransferProtocol] Compatibility breakdown', {
        source: sourceAgent,
        target: targetAgent,
        capability: (capabilityScore * 100).toFixed(1) + '%',
        framework: (frameworkScore * 100).toFixed(1) + '%',
        task: (taskScore * 100).toFixed(1) + '%',
        quality: (qualityScore * 100).toFixed(1) + '%',
        total: (score * 100).toFixed(1) + '%',
      });
    }

    let reason: string | undefined;
    if (score < this.config.compatibilityThreshold) {
      if (capabilityScore < 0.4) reason = 'Low capability overlap';
      else if (frameworkScore < 0.3) reason = 'Incompatible frameworks';
      else if (taskScore < 0.3) reason = 'Task types not applicable';
      else reason = 'Pattern not generalizable';
    }

    return { score: Math.min(1, Math.max(0, score)), reason };
  }

  /**
   * Calculate overlap with semantic similarity
   */
  private calculateOverlapWithSemantic(set1: string[], set2: string[]): number {
    if (set1.length === 0 || set2.length === 0) return 0;

    // Exact match (Jaccard)
    const intersection = set1.filter(item => set2.includes(item));
    const union = [...new Set([...set1, ...set2])];
    const exactScore = intersection.length / union.length;

    // Semantic similarity
    const semanticScore = this.semanticSimilarity(set1, set2);

    return exactScore * 0.4 + semanticScore * 0.6;
  }

  /**
   * Calculate semantic similarity between sets
   * Uses expanded concept groups to capture related capabilities
   */
  private semanticSimilarity(set1: string[], set2: string[]): number {
    // Expanded concept groups that capture test-related concepts
    const conceptGroups: Record<string, string[]> = {
      'analysis': ['analysis', 'detection', 'scanning', 'audit', 'check', 'stability', 'scoring', 'pattern'],
      'testing': ['test', 'testing', 'benchmark', 'validation', 'flaky', 'retry', 'unit', 'integration', 'e2e', 'component'],
      'generation': ['generation', 'generator', 'creating', 'assertion'],
      'quality': ['quality', 'gate', 'threshold', 'metric', 'coverage', 'gap'],
      'security': ['security', 'vulnerability', 'compliance', 'audit'],
      'performance': ['performance', 'load', 'stress', 'profiling', 'optimization'],
      'code': ['code', 'pattern', 'matching', 'analysis'],
    };

    const getGroups = (items: string[]): Set<string> => {
      const groups = new Set<string>();
      for (const item of items) {
        const lower = item.toLowerCase();
        for (const [group, keywords] of Object.entries(conceptGroups)) {
          if (keywords.some(kw => lower.includes(kw))) {
            groups.add(group);
          }
        }
      }
      return groups;
    };

    const groups1 = getGroups(set1);
    const groups2 = getGroups(set2);

    if (groups1.size === 0 || groups2.size === 0) return 0.3;

    const groupIntersection = [...groups1].filter(g => groups2.has(g));
    const groupUnion = new Set([...groups1, ...groups2]);

    // Boost score for having any overlap, since having shared concept groups is significant
    const jaccard = groupIntersection.length / groupUnion.size;
    return Math.max(0.3, jaccard + (groupIntersection.length > 0 ? 0.2 : 0));
  }

  /**
   * Perform the actual pattern transfer
   */
  private async performTransfer(pattern: PatternData, targetAgent: string): Promise<boolean> {
    try {
      // Copy pattern to target agent's context
      const newPatternId = `${pattern.id}-${targetAgent}-${Date.now()}`;
      const now = Date.now();

      // Modify content slightly to avoid UNIQUE constraint on pattern column
      // Append transfer metadata to content to make it unique
      const transferredContent = `${pattern.content} [transferred from ${pattern.agentId || 'unknown'} to ${targetAgent}]`;

      // Use actual patterns table schema: id, pattern, confidence, metadata, agent_id, domain
      this.db.prepare(`
        INSERT INTO patterns
        (id, pattern, confidence, metadata, agent_id, domain, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        newPatternId,
        transferredContent,
        pattern.confidence * 0.9, // Slight confidence reduction for transferred patterns
        JSON.stringify({
          transferredFrom: pattern.id,
          originalAgent: pattern.agentId,
          originalContent: pattern.content,
          transferDate: new Date().toISOString(),
        }),
        targetAgent,
        pattern.type || 'general',
        now
      );

      return true;
    } catch (error) {
      this.logger.warn('[TransferProtocol] Transfer failed', { pattern: pattern.id, error });
      return false;
    }
  }

  /**
   * Validate a transferred pattern
   */
  private async validateTransfer(pattern: PatternData, targetAgent: string): Promise<ValidationResult> {
    const tests: ValidationTest[] = [];

    // Test 1: Pattern exists in target context (column is 'pattern' not 'content')
    const exists = this.db.prepare(`
      SELECT COUNT(*) as count FROM patterns
      WHERE agent_id = ? AND pattern LIKE ?
    `).get(targetAgent, `%${pattern.content.substring(0, 50)}%`) as any;

    tests.push({
      name: 'Pattern Existence',
      passed: exists.count > 0,
      score: exists.count > 0 ? 1.0 : 0,
      message: exists.count > 0 ? 'Pattern stored' : 'Pattern not found',
    });

    // Test 2: Confidence preserved
    const preservedConfidence = pattern.confidence * 0.9 >= 0.5;
    tests.push({
      name: 'Confidence Threshold',
      passed: preservedConfidence,
      score: preservedConfidence ? 1.0 : 0.5,
      message: preservedConfidence ? 'Confidence acceptable' : 'Confidence below threshold',
    });

    // Test 3: No duplicate transfers
    const duplicates = this.db.prepare(`
      SELECT COUNT(*) as count FROM transfer_registry
      WHERE pattern_id = ? AND target_agent = ?
    `).get(pattern.id, targetAgent) as any;

    tests.push({
      name: 'No Duplicates',
      passed: duplicates.count === 0,
      score: duplicates.count === 0 ? 1.0 : 0.5,
      message: duplicates.count === 0 ? 'First transfer' : 'Previously transferred',
    });

    const overallScore = tests.reduce((sum, t) => sum + t.score, 0) / tests.length;
    const passed = overallScore >= 0.7;

    return { passed, tests, overallScore };
  }

  /**
   * Register a successful transfer
   */
  private registerTransfer(
    patternId: string,
    request: TransferRequest,
    compatibilityScore: number,
    validationPassed: boolean
  ): void {
    const id = `reg-${Date.now()}-${SecureRandom.randomString(6, 'alphanumeric')}`;

    this.db.prepare(`
      INSERT INTO transfer_registry
      (id, pattern_id, source_agent, target_agent, transfer_id, compatibility_score, validation_passed, transferred_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      id,
      patternId,
      request.sourceAgent,
      request.targetAgent,
      request.id,
      compatibilityScore,
      validationPassed ? 1 : 0,
      Date.now()
    );
  }

  /**
   * Get transfer statistics
   */
  getStats(): TransferStats {
    const requests = this.db.prepare(`
      SELECT COUNT(*) as count FROM transfer_requests
    `).get() as any;

    const results = this.db.prepare(`
      SELECT result FROM transfer_requests WHERE result IS NOT NULL
    `).all() as any[];

    let successfulTransfers = 0;
    let failedTransfers = 0;
    let totalCompatibility = 0;
    let compatibilityCount = 0;
    const byAgentPair = new Map<string, { success: number; fail: number }>();

    for (const row of results) {
      if (!row.result) continue;
      const result = JSON.parse(row.result) as TransferResult;

      successfulTransfers += result.patternsTransferred;
      failedTransfers += result.patternsRejected + result.patternsSkipped;

      const pairKey = `${result.sourceAgent}->${result.targetAgent}`;
      const pair = byAgentPair.get(pairKey) || { success: 0, fail: 0 };
      pair.success += result.patternsTransferred;
      pair.fail += result.patternsRejected;
      byAgentPair.set(pairKey, pair);

      for (const detail of result.details) {
        if (detail.compatibilityScore > 0) {
          totalCompatibility += detail.compatibilityScore;
          compatibilityCount++;
        }
      }
    }

    return {
      totalRequests: requests.count,
      successfulTransfers,
      failedTransfers,
      overallSuccessRate: (successfulTransfers + failedTransfers) > 0
        ? successfulTransfers / (successfulTransfers + failedTransfers)
        : 0,
      byAgentPair,
      averageCompatibilityScore: compatibilityCount > 0
        ? totalCompatibility / compatibilityCount
        : 0,
    };
  }

  /**
   * Get pending transfer requests
   */
  getPendingRequests(): TransferRequest[] {
    const rows = this.db.prepare(`
      SELECT * FROM transfer_requests WHERE status = 'pending' ORDER BY
        CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        requested_at ASC
    `).all() as any[];

    return rows.map(row => ({
      id: row.id,
      sourceAgent: row.source_agent,
      targetAgent: row.target_agent,
      patternIds: JSON.parse(row.pattern_ids),
      priority: row.priority,
      reason: row.reason,
      requestedAt: new Date(row.requested_at),
      requestedBy: row.requested_by,
    }));
  }

  /**
   * Broadcast a pattern to all compatible agents
   */
  async broadcastPattern(patternId: string, sourceAgent: string): Promise<TransferResult[]> {
    const results: TransferResult[] = [];

    for (const [agentType] of this.agentDomains) {
      if (agentType === sourceAgent) continue;

      const request = await this.createRequest({
        sourceAgent,
        targetAgent: agentType,
        patternIds: [patternId],
        priority: 'low',
        reason: 'Pattern broadcast',
      });

      const result = await this.executeTransfer(request);
      results.push(result);
    }

    return results;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.prototype.close();
    this.db.close();
  }
}

interface PatternData {
  id: string;
  type: string;
  content: string;
  confidence: number;
  context?: string;
  agentId?: string;
}

export default TransferProtocol;
