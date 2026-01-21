/**
 * PatternSynthesis - Identifies patterns from captured experiences
 *
 * Synthesizes actionable patterns from captured agent executions using
 * clustering and analysis techniques.
 *
 * Part of the Nightly-Learner Phase 1 implementation.
 *
 * @version 1.0.0
 * @module src/learning/synthesis/PatternSynthesis
 */

import { EventEmitter } from 'events';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import { Logger } from '../../utils/Logger';
import { SecureRandom } from '../../utils/SecureRandom';
import { CapturedExperience } from '../capture/ExperienceCapture';

export type PatternType =
  | 'success_strategy'      // Patterns that lead to successful outcomes
  | 'failure_avoidance'     // Patterns to avoid failures
  | 'efficiency_optimization'; // Patterns for better performance

export interface SynthesizedPattern {
  id: string;
  type: PatternType;
  description: string;
  conditions: string[];           // When to apply
  actions: string[];              // What to do
  confidence: number;             // 0-1
  supportingExperiences: string[]; // Experience IDs
  effectiveness: number;          // Measured improvement 0-1
  agentTypes: string[];           // Applicable agent types
  taskTypes: string[];            // Applicable task types
  createdAt: Date;
  updatedAt: Date;
}

export interface Cluster {
  id: string;
  experiences: CapturedExperience[];
  centroid?: number[];
  size: number;
  averageQuality: number;
  commonAgentTypes: string[];
  commonTaskTypes: string[];
}

export interface SynthesisOptions {
  /** Specific experience IDs to process */
  experienceIds?: string[];
  /** Minimum experiences to form pattern. Default: 3 */
  minSupport?: number;
  /** Minimum confidence threshold. Default: 0.7 */
  minConfidence?: number;
  /** Maximum patterns to generate. Default: 20 */
  maxPatterns?: number;
  /** Focus on specific agent types */
  agentTypes?: string[];
  /** Focus on specific task types */
  taskTypes?: string[];
}

export interface SynthesisResult {
  patterns: SynthesizedPattern[];
  clustersAnalyzed: number;
  experiencesProcessed: number;
  duration: number;
  stats: {
    successStrategies: number;
    failureAvoidances: number;
    efficiencyOptimizations: number;
    averageConfidence: number;
  };
}

export interface PatternSynthesisConfig {
  /** Database path. Default: .agentic-qe/memory.db */
  dbPath?: string;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * PatternSynthesis identifies patterns from agent experiences
 *
 * @example
 * ```typescript
 * const synthesis = new PatternSynthesis();
 *
 * const result = await synthesis.synthesize({
 *   minSupport: 3,
 *   minConfidence: 0.7,
 *   maxPatterns: 20,
 * });
 *
 * console.log(`Discovered ${result.patterns.length} patterns`);
 * ```
 */
export class PatternSynthesis extends EventEmitter {
  private config: Required<PatternSynthesisConfig>;
  private db: BetterSqlite3.Database;
  private logger: Logger;

  constructor(config?: PatternSynthesisConfig) {
    super();
    this.logger = Logger.getInstance();

    this.config = {
      dbPath: config?.dbPath || path.join(process.cwd(), '.agentic-qe', 'memory.db'),
      debug: config?.debug ?? false,
    };

    this.db = new BetterSqlite3(this.config.dbPath);
    this.initializeSchema();
  }

  /**
   * Initialize database schema for patterns
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS synthesized_patterns (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        conditions TEXT NOT NULL,
        actions TEXT NOT NULL,
        confidence REAL NOT NULL,
        supporting_experiences TEXT NOT NULL,
        effectiveness REAL NOT NULL,
        agent_types TEXT NOT NULL,
        task_types TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_synth_type ON synthesized_patterns(type);
      CREATE INDEX IF NOT EXISTS idx_synth_confidence ON synthesized_patterns(confidence);
      CREATE INDEX IF NOT EXISTS idx_synth_effectiveness ON synthesized_patterns(effectiveness);
    `);
  }

  /**
   * Synthesize patterns from experiences
   */
  async synthesize(options: SynthesisOptions = {}): Promise<SynthesisResult> {
    const startTime = Date.now();
    const { minSupport = 3, minConfidence = 0.7, maxPatterns = 20 } = options;

    this.logger.info('[PatternSynthesis] Starting synthesis', { options });

    // 1. Retrieve experiences
    const experiences = await this.getExperiences(options);
    this.logger.debug('[PatternSynthesis] Retrieved experiences', { count: experiences.length });

    if (experiences.length < minSupport) {
      this.logger.info('[PatternSynthesis] Insufficient experiences for synthesis', {
        found: experiences.length,
        required: minSupport,
      });
      return {
        patterns: [],
        clustersAnalyzed: 0,
        experiencesProcessed: experiences.length,
        duration: Date.now() - startTime,
        stats: { successStrategies: 0, failureAvoidances: 0, efficiencyOptimizations: 0, averageConfidence: 0 },
      };
    }

    // 2. Cluster experiences
    const clusters = await this.clusterExperiences(experiences);
    this.logger.debug('[PatternSynthesis] Created clusters', { count: clusters.length });

    // 3. Extract patterns from clusters
    const patterns: SynthesizedPattern[] = [];

    for (const cluster of clusters) {
      if (cluster.size < minSupport) continue;
      if (patterns.length >= maxPatterns) break;

      const pattern = this.extractPatternFromCluster(cluster);
      if (pattern.confidence >= minConfidence) {
        patterns.push(pattern);
        this.emit('pattern:discovered', pattern);
      }
    }

    // 4. Store patterns
    await this.storePatterns(patterns);

    // 5. Calculate stats
    const result: SynthesisResult = {
      patterns,
      clustersAnalyzed: clusters.length,
      experiencesProcessed: experiences.length,
      duration: Date.now() - startTime,
      stats: {
        successStrategies: patterns.filter(p => p.type === 'success_strategy').length,
        failureAvoidances: patterns.filter(p => p.type === 'failure_avoidance').length,
        efficiencyOptimizations: patterns.filter(p => p.type === 'efficiency_optimization').length,
        averageConfidence: patterns.length > 0
          ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
          : 0,
      },
    };

    this.logger.info('[PatternSynthesis] Synthesis complete', {
      patterns: result.patterns.length,
      duration: result.duration,
    });

    this.emit('synthesis:complete', result);
    return result;
  }

  /**
   * Get stored patterns
   */
  getPatterns(options: {
    type?: PatternType;
    minConfidence?: number;
    agentType?: string;
    limit?: number;
  } = {}): SynthesizedPattern[] {
    let query = 'SELECT * FROM synthesized_patterns WHERE 1=1';
    const params: any[] = [];

    if (options.type) {
      query += ' AND type = ?';
      params.push(options.type);
    }

    if (options.minConfidence) {
      query += ' AND confidence >= ?';
      params.push(options.minConfidence);
    }

    if (options.agentType) {
      query += ' AND agent_types LIKE ?';
      params.push(`%${options.agentType}%`);
    }

    query += ' ORDER BY effectiveness DESC, confidence DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => this.rowToPattern(row));
  }

  /**
   * Get pattern by ID
   */
  getPattern(id: string): SynthesizedPattern | null {
    const row = this.db.prepare('SELECT * FROM synthesized_patterns WHERE id = ?').get(id) as any;
    return row ? this.rowToPattern(row) : null;
  }

  /**
   * Update pattern effectiveness based on new evidence
   */
  updateEffectiveness(patternId: string, success: boolean): void {
    const pattern = this.getPattern(patternId);
    if (!pattern) return;

    // Exponential moving average
    const alpha = 0.1;
    const newEffectiveness = pattern.effectiveness * (1 - alpha) + (success ? 1 : 0) * alpha;

    this.db.prepare(`
      UPDATE synthesized_patterns
      SET effectiveness = ?, updated_at = ?
      WHERE id = ?
    `).run(newEffectiveness, Date.now(), patternId);

    this.logger.debug('[PatternSynthesis] Updated pattern effectiveness', {
      patternId,
      oldEffectiveness: pattern.effectiveness,
      newEffectiveness,
    });
  }

  /**
   * Get experiences for synthesis
   */
  private async getExperiences(options: SynthesisOptions): Promise<CapturedExperience[]> {
    let query = `
      SELECT * FROM captured_experiences
      WHERE processed = 0
    `;
    const params: any[] = [];

    if (options.experienceIds && options.experienceIds.length > 0) {
      const placeholders = options.experienceIds.map(() => '?').join(',');
      query = `SELECT * FROM captured_experiences WHERE id IN (${placeholders})`;
      params.push(...options.experienceIds);
    } else {
      if (options.agentTypes && options.agentTypes.length > 0) {
        const placeholders = options.agentTypes.map(() => '?').join(',');
        query += ` AND agent_type IN (${placeholders})`;
        params.push(...options.agentTypes);
      }

      if (options.taskTypes && options.taskTypes.length > 0) {
        const placeholders = options.taskTypes.map(() => '?').join(',');
        query += ` AND task_type IN (${placeholders})`;
        params.push(...options.taskTypes);
      }

      query += ' ORDER BY created_at DESC LIMIT 1000';
    }

    try {
      const rows = this.db.prepare(query).all(...params) as any[];
      return rows.map(row => this.rowToExperience(row));
    } catch (error) {
      this.logger.warn('[PatternSynthesis] Error fetching experiences, returning empty', { error });
      return [];
    }
  }

  /**
   * Cluster experiences by similarity
   */
  private async clusterExperiences(experiences: CapturedExperience[]): Promise<Cluster[]> {
    // Group by agent type and task type for simple clustering
    const clusterMap = new Map<string, CapturedExperience[]>();

    for (const exp of experiences) {
      // Cluster key: agentType + success/failure
      const key = `${exp.agentType}:${exp.execution.success ? 'success' : 'failure'}`;
      const existing = clusterMap.get(key) || [];
      existing.push(exp);
      clusterMap.set(key, existing);
    }

    // Convert to cluster objects
    const clusters: Cluster[] = [];
    let clusterId = 0;

    for (const [key, exps] of clusterMap) {
      const qualities = exps.map(e => e.outcome.quality_score);
      const agentTypes = [...new Set(exps.map(e => e.agentType))];
      const taskTypes = [...new Set(exps.map(e => e.taskType))];

      clusters.push({
        id: `cluster-${clusterId++}`,
        experiences: exps,
        size: exps.length,
        averageQuality: qualities.reduce((a, b) => a + b, 0) / qualities.length,
        commonAgentTypes: agentTypes,
        commonTaskTypes: taskTypes,
      });
    }

    // Sort by size descending
    clusters.sort((a, b) => b.size - a.size);

    return clusters;
  }

  /**
   * Extract a pattern from a cluster
   */
  private extractPatternFromCluster(cluster: Cluster): SynthesizedPattern {
    const now = new Date();

    // Determine pattern type based on cluster characteristics
    let type: PatternType;
    if (cluster.averageQuality > 0.7) {
      type = 'success_strategy';
    } else if (cluster.averageQuality < 0.3) {
      type = 'failure_avoidance';
    } else {
      type = 'efficiency_optimization';
    }

    // Extract common conditions
    const conditions = this.extractConditions(cluster.experiences);

    // Extract common actions
    const actions = this.extractActions(cluster.experiences);

    // Calculate confidence based on cluster consistency
    const confidence = this.calculateConfidence(cluster);

    // Calculate effectiveness
    const effectiveness = cluster.averageQuality;

    return {
      id: `pattern-${Date.now()}-${SecureRandom.randomString(6, 'alphanumeric')}`,
      type,
      description: this.generateDescription(type, cluster),
      conditions,
      actions,
      confidence,
      supportingExperiences: cluster.experiences.map(e => e.id),
      effectiveness,
      agentTypes: cluster.commonAgentTypes,
      taskTypes: cluster.commonTaskTypes,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Extract common conditions from experiences
   */
  private extractConditions(experiences: CapturedExperience[]): string[] {
    const conditions: string[] = [];

    // Common agent type
    const agentTypes = [...new Set(experiences.map(e => e.agentType))];
    if (agentTypes.length === 1) {
      conditions.push(`agent_type == '${agentTypes[0]}'`);
    }

    // Common task type
    const taskTypes = [...new Set(experiences.map(e => e.taskType))];
    if (taskTypes.length === 1) {
      conditions.push(`task_type == '${taskTypes[0]}'`);
    }

    // Extract common context patterns
    for (const exp of experiences) {
      if (exp.context.patterns_used.length > 0) {
        conditions.push(`patterns_available`);
        break;
      }
    }

    return [...new Set(conditions)];
  }

  /**
   * Extract common actions from experiences
   */
  private extractActions(experiences: CapturedExperience[]): string[] {
    const actions: string[] = [];

    // Collect all decisions made
    const allDecisions = experiences.flatMap(e => e.context.decisions_made);
    const decisionCounts = new Map<string, number>();

    for (const decision of allDecisions) {
      decisionCounts.set(decision, (decisionCounts.get(decision) || 0) + 1);
    }

    // Add frequent decisions as actions
    for (const [decision, count] of decisionCounts) {
      if (count >= experiences.length * 0.5) { // Present in at least 50% of experiences
        actions.push(decision);
      }
    }

    // Add generic actions based on outcomes
    const successRate = experiences.filter(e => e.execution.success).length / experiences.length;
    if (successRate > 0.8) {
      actions.push('replicate_approach');
    } else if (successRate < 0.3) {
      actions.push('avoid_approach');
    }

    return actions;
  }

  /**
   * Calculate confidence score for a cluster
   */
  private calculateConfidence(cluster: Cluster): number {
    // Base confidence from cluster size
    let confidence = Math.min(1, cluster.size / 10); // Max out at 10 experiences

    // Bonus for consistent outcomes
    const outcomes = cluster.experiences.map(e => e.execution.success);
    const successRate = outcomes.filter(Boolean).length / outcomes.length;
    const consistency = Math.abs(successRate - 0.5) * 2; // 0 = mixed, 1 = consistent
    confidence = confidence * 0.6 + consistency * 0.4;

    // Bonus for consistent agent types
    if (cluster.commonAgentTypes.length === 1) {
      confidence += 0.1;
    }

    return Math.min(1, confidence);
  }

  /**
   * Generate a human-readable description
   */
  private generateDescription(type: PatternType, cluster: Cluster): string {
    const agentTypes = cluster.commonAgentTypes.join(', ');
    const taskTypes = cluster.commonTaskTypes.join(', ');

    switch (type) {
      case 'success_strategy':
        return `Successful approach for ${agentTypes} when performing ${taskTypes}`;
      case 'failure_avoidance':
        return `Failure pattern to avoid for ${agentTypes} during ${taskTypes}`;
      case 'efficiency_optimization':
        return `Optimization opportunity for ${agentTypes} in ${taskTypes}`;
      default:
        return `Pattern for ${agentTypes}`;
    }
  }

  /**
   * Store patterns in database
   */
  private async storePatterns(patterns: SynthesizedPattern[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO synthesized_patterns
      (id, type, description, conditions, actions, confidence, supporting_experiences,
       effectiveness, agent_types, task_types, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((pats: SynthesizedPattern[]) => {
      for (const p of pats) {
        stmt.run(
          p.id,
          p.type,
          p.description,
          JSON.stringify(p.conditions),
          JSON.stringify(p.actions),
          p.confidence,
          JSON.stringify(p.supportingExperiences),
          p.effectiveness,
          JSON.stringify(p.agentTypes),
          JSON.stringify(p.taskTypes),
          p.createdAt.getTime(),
          p.updatedAt.getTime()
        );
      }
    });

    insertMany(patterns);
    this.logger.info('[PatternSynthesis] Stored patterns', { count: patterns.length });
  }

  /**
   * Convert database row to experience
   */
  private rowToExperience(row: any): CapturedExperience {
    return {
      id: row.id,
      agentId: row.agent_id,
      agentType: row.agent_type,
      taskType: row.task_type,
      execution: JSON.parse(row.execution),
      context: JSON.parse(row.context),
      outcome: JSON.parse(row.outcome),
      timestamp: new Date(row.created_at),
    };
  }

  /**
   * Convert database row to pattern
   */
  private rowToPattern(row: any): SynthesizedPattern {
    return {
      id: row.id,
      type: row.type as PatternType,
      description: row.description,
      conditions: JSON.parse(row.conditions),
      actions: JSON.parse(row.actions),
      confidence: row.confidence,
      supportingExperiences: JSON.parse(row.supporting_experiences),
      effectiveness: row.effectiveness,
      agentTypes: JSON.parse(row.agent_types),
      taskTypes: JSON.parse(row.task_types),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

export default PatternSynthesis;
