/**
 * TransferValidator - Validate pattern transfer success
 *
 * Performs post-transfer validation to ensure patterns are
 * correctly transferred and applicable to target agents.
 *
 * Part of the Nightly-Learner Phase 2 implementation.
 *
 * @version 1.0.0
 * @module src/learning/transfer/TransferValidator
 */

import { EventEmitter } from 'events';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import { Logger } from '../../utils/Logger';
import { seededRandom } from '../../utils/SeededRandom';

export interface ValidationConfig {
  /** Database path. Default: .agentic-qe/memory.db */
  dbPath?: string;
  /** Minimum validation score to pass. Default: 0.7 */
  passThreshold?: number;
  /** Enable detailed validation. Default: true */
  detailedValidation?: boolean;
  /** Enable debug logging */
  debug?: boolean;
}

export interface ValidationReport {
  transferId: string;
  patternId: string;
  sourceAgent: string;
  targetAgent: string;
  passed: boolean;
  overallScore: number;
  checks: ValidationCheck[];
  recommendations?: string[];
  validatedAt: Date;
}

export interface ValidationCheck {
  name: string;
  category: 'integrity' | 'applicability' | 'performance' | 'safety';
  passed: boolean;
  score: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface TransferRecord {
  id: string;
  patternId: string;
  sourceAgent: string;
  targetAgent: string;
  transferredAt: Date;
  originalContent: string;
  transferredContent: string;
  compatibilityScore: number;
}

/**
 * TransferValidator validates pattern transfers
 *
 * @example
 * ```typescript
 * const validator = new TransferValidator({ passThreshold: 0.7 });
 *
 * const report = await validator.validate(transferRecord);
 *
 * if (report.passed) {
 *   console.log('Transfer validated successfully');
 * } else {
 *   console.log('Issues:', report.recommendations);
 * }
 * ```
 */
export class TransferValidator extends EventEmitter {
  private config: Required<ValidationConfig>;
  private db: BetterSqlite3.Database;
  private logger: Logger;

  constructor(config?: ValidationConfig) {
    super();
    this.logger = Logger.getInstance();

    this.config = {
      dbPath: config?.dbPath || path.join(process.cwd(), '.agentic-qe', 'memory.db'),
      passThreshold: config?.passThreshold ?? 0.7,
      detailedValidation: config?.detailedValidation ?? true,
      debug: config?.debug ?? false,
    };

    this.db = new BetterSqlite3(this.config.dbPath);
    this.initializeSchema();
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transfer_validations (
        id TEXT PRIMARY KEY,
        transfer_id TEXT NOT NULL,
        pattern_id TEXT NOT NULL,
        source_agent TEXT NOT NULL,
        target_agent TEXT NOT NULL,
        passed INTEGER NOT NULL,
        overall_score REAL NOT NULL,
        checks TEXT NOT NULL,
        recommendations TEXT,
        validated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_validation_transfer ON transfer_validations(transfer_id);
      CREATE INDEX IF NOT EXISTS idx_validation_pattern ON transfer_validations(pattern_id);
      CREATE INDEX IF NOT EXISTS idx_validation_passed ON transfer_validations(passed);
    `);
  }

  /**
   * Validate a pattern transfer
   */
  async validate(record: TransferRecord): Promise<ValidationReport> {
    const checks: ValidationCheck[] = [];

    // Integrity checks
    checks.push(await this.checkPatternIntegrity(record));
    checks.push(await this.checkDataConsistency(record));

    // Applicability checks
    checks.push(await this.checkAgentApplicability(record));
    checks.push(await this.checkContextPreservation(record));

    // Performance checks
    if (this.config.detailedValidation) {
      checks.push(await this.checkConfidencePreservation(record));
      checks.push(await this.checkDuplicateDetection(record));
    }

    // Safety checks
    checks.push(await this.checkSafetyConstraints(record));

    // Calculate overall score
    const passedChecks = checks.filter(c => c.passed);
    const overallScore = checks.reduce((sum, c) => sum + c.score, 0) / checks.length;
    const passed = overallScore >= this.config.passThreshold;

    // Generate recommendations
    const recommendations = this.generateRecommendations(checks, passed);

    const report: ValidationReport = {
      transferId: record.id,
      patternId: record.patternId,
      sourceAgent: record.sourceAgent,
      targetAgent: record.targetAgent,
      passed,
      overallScore,
      checks,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
      validatedAt: new Date(),
    };

    // Store validation
    await this.storeValidation(report);

    this.logger.info('[TransferValidator] Validation complete', {
      transferId: record.id,
      passed,
      score: overallScore.toFixed(3),
      checksTotal: checks.length,
      checksPassed: passedChecks.length,
    });

    this.emit('validation:complete', report);
    return report;
  }

  /**
   * Check pattern integrity
   */
  private async checkPatternIntegrity(record: TransferRecord): Promise<ValidationCheck> {
    // Verify pattern exists in target context
    const exists = this.db.prepare(`
      SELECT COUNT(*) as count FROM patterns
      WHERE id LIKE ? AND agent_id = ?
    `).get(`%${record.patternId}%`, record.targetAgent) as any;

    const passed = exists.count > 0;

    return {
      name: 'Pattern Integrity',
      category: 'integrity',
      passed,
      score: passed ? 1.0 : 0,
      message: passed
        ? 'Pattern exists in target agent context'
        : 'Pattern not found in target agent context',
      details: { count: exists.count },
    };
  }

  /**
   * Check data consistency
   */
  private async checkDataConsistency(record: TransferRecord): Promise<ValidationCheck> {
    // Verify content is similar (allowing for minor adaptations)
    const original = record.originalContent || '';
    const transferred = record.transferredContent || '';

    // Calculate similarity
    const similarity = this.calculateContentSimilarity(original, transferred);
    const passed = similarity >= 0.7; // Allow 30% adaptation

    return {
      name: 'Data Consistency',
      category: 'integrity',
      passed,
      score: similarity,
      message: passed
        ? 'Content preserved within acceptable range'
        : 'Content significantly altered during transfer',
      details: { similarity: similarity.toFixed(3) },
    };
  }

  /**
   * Check agent applicability
   */
  private async checkAgentApplicability(record: TransferRecord): Promise<ValidationCheck> {
    // Verify pattern is applicable to target agent's domain
    const compatibility = record.compatibilityScore;
    const passed = compatibility >= 0.5;

    return {
      name: 'Agent Applicability',
      category: 'applicability',
      passed,
      score: compatibility,
      message: passed
        ? 'Pattern applicable to target agent'
        : 'Pattern may not be suitable for target agent',
      details: { compatibilityScore: compatibility.toFixed(3) },
    };
  }

  /**
   * Check context preservation
   */
  private async checkContextPreservation(record: TransferRecord): Promise<ValidationCheck> {
    // Verify transfer context was recorded
    const registry = this.db.prepare(`
      SELECT * FROM transfer_registry
      WHERE pattern_id = ? AND target_agent = ?
    `).get(record.patternId, record.targetAgent) as any;

    const hasContext = registry && registry.source_agent === record.sourceAgent;

    return {
      name: 'Context Preservation',
      category: 'applicability',
      passed: hasContext,
      score: hasContext ? 1.0 : 0.5,
      message: hasContext
        ? 'Transfer context preserved'
        : 'Transfer context incomplete',
      details: { hasRegistry: !!registry },
    };
  }

  /**
   * Check confidence preservation
   */
  private async checkConfidencePreservation(record: TransferRecord): Promise<ValidationCheck> {
    // Get transferred pattern's confidence
    const pattern = this.db.prepare(`
      SELECT confidence FROM patterns
      WHERE id LIKE ? AND agent_id = ?
    `).get(`%${record.patternId}%`, record.targetAgent) as any;

    if (!pattern) {
      return {
        name: 'Confidence Preservation',
        category: 'performance',
        passed: false,
        score: 0,
        message: 'Pattern not found for confidence check',
      };
    }

    // Expect ~90% confidence retention (10% reduction for transfer)
    const expectedConfidence = 0.5; // Minimum acceptable
    const passed = pattern.confidence >= expectedConfidence;

    return {
      name: 'Confidence Preservation',
      category: 'performance',
      passed,
      score: Math.min(1, pattern.confidence / 0.7),
      message: passed
        ? `Confidence preserved: ${(pattern.confidence * 100).toFixed(1)}%`
        : `Confidence too low: ${(pattern.confidence * 100).toFixed(1)}%`,
      details: { confidence: pattern.confidence },
    };
  }

  /**
   * Check for duplicate transfers
   */
  private async checkDuplicateDetection(record: TransferRecord): Promise<ValidationCheck> {
    // Check if same pattern was transferred multiple times
    const duplicates = this.db.prepare(`
      SELECT COUNT(*) as count FROM transfer_registry
      WHERE pattern_id = ? AND target_agent = ?
    `).get(record.patternId, record.targetAgent) as any;

    const noDuplicates = duplicates.count <= 1;

    return {
      name: 'Duplicate Detection',
      category: 'performance',
      passed: noDuplicates,
      score: noDuplicates ? 1.0 : 0.5,
      message: noDuplicates
        ? 'No duplicate transfers detected'
        : `Pattern transferred ${duplicates.count} times`,
      details: { transferCount: duplicates.count },
    };
  }

  /**
   * Check safety constraints
   */
  private async checkSafetyConstraints(record: TransferRecord): Promise<ValidationCheck> {
    // Verify no unsafe patterns are being transferred
    const unsafePatterns = [
      'delete', 'drop', 'truncate', 'rm -rf',
      'password', 'secret', 'credential',
    ];

    const content = (record.transferredContent || '').toLowerCase();
    const hasUnsafe = unsafePatterns.some(p => content.includes(p));

    return {
      name: 'Safety Constraints',
      category: 'safety',
      passed: !hasUnsafe,
      score: hasUnsafe ? 0.5 : 1.0,
      message: hasUnsafe
        ? 'Warning: Pattern contains potentially unsafe content'
        : 'Pattern passes safety checks',
      details: { flagged: hasUnsafe },
    };
  }

  /**
   * Calculate content similarity
   */
  private calculateContentSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    if (a === b) return 1;

    // Simple word overlap
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));

    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const union = new Set([...wordsA, ...wordsB]);

    return intersection.length / union.size;
  }

  /**
   * Generate recommendations based on validation
   */
  private generateRecommendations(checks: ValidationCheck[], passed: boolean): string[] {
    const recommendations: string[] = [];

    for (const check of checks) {
      if (!check.passed) {
        switch (check.category) {
          case 'integrity':
            recommendations.push(`Fix ${check.name}: ${check.message}`);
            break;
          case 'applicability':
            recommendations.push(`Review applicability: ${check.message}`);
            break;
          case 'performance':
            recommendations.push(`Optimize: ${check.message}`);
            break;
          case 'safety':
            recommendations.push(`Security review required: ${check.message}`);
            break;
        }
      }
    }

    if (!passed && recommendations.length === 0) {
      recommendations.push('Overall score below threshold - review transfer parameters');
    }

    return recommendations;
  }

  /**
   * Store validation result
   */
  private async storeValidation(report: ValidationReport): Promise<void> {
    const id = `val-${Date.now()}-${seededRandom.randomInt(0, 99999999).toString(36).padStart(8, '0')}`;

    this.db.prepare(`
      INSERT INTO transfer_validations
      (id, transfer_id, pattern_id, source_agent, target_agent, passed, overall_score, checks, recommendations, validated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      report.transferId,
      report.patternId,
      report.sourceAgent,
      report.targetAgent,
      report.passed ? 1 : 0,
      report.overallScore,
      JSON.stringify(report.checks),
      report.recommendations ? JSON.stringify(report.recommendations) : null,
      report.validatedAt.getTime()
    );
  }

  /**
   * Get validation history for a pattern
   */
  getValidationHistory(patternId: string): ValidationReport[] {
    const rows = this.db.prepare(`
      SELECT * FROM transfer_validations
      WHERE pattern_id = ?
      ORDER BY validated_at DESC
    `).all(patternId) as any[];

    return rows.map(row => ({
      transferId: row.transfer_id,
      patternId: row.pattern_id,
      sourceAgent: row.source_agent,
      targetAgent: row.target_agent,
      passed: row.passed === 1,
      overallScore: row.overall_score,
      checks: JSON.parse(row.checks),
      recommendations: row.recommendations ? JSON.parse(row.recommendations) : undefined,
      validatedAt: new Date(row.validated_at),
    }));
  }

  /**
   * Get validation statistics
   */
  getStats(): { total: number; passed: number; failed: number; avgScore: number } {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN passed = 0 THEN 1 ELSE 0 END) as failed,
        AVG(overall_score) as avg_score
      FROM transfer_validations
    `).get() as any;

    return {
      total: stats.total || 0,
      passed: stats.passed || 0,
      failed: stats.failed || 0,
      avgScore: stats.avg_score || 0,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

export default TransferValidator;
