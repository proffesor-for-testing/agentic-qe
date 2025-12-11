/**
 * DreamEngine - Main orchestrator for dream-based pattern discovery
 *
 * Coordinates ConceptGraph, SpreadingActivation, and InsightGenerator
 * to discover novel patterns through simulated "dreaming".
 *
 * Part of the Nightly-Learner Phase 2 implementation.
 *
 * @version 1.0.0
 * @module src/learning/dream/DreamEngine
 */

import { EventEmitter } from 'events';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import { ConceptGraph, ConceptNode, ConceptType } from './ConceptGraph';
import { SpreadingActivation, Association, DreamResult } from './SpreadingActivation';
import { InsightGenerator, DreamInsight, InsightType } from './InsightGenerator';
import { Logger } from '../../utils/Logger';
import { SecureRandom } from '../../utils/SecureRandom';

export interface DreamEngineConfig {
  /** Database path. Default: .agentic-qe/memory.db */
  dbPath?: string;
  /** Duration of dream cycle in ms. Default: 20 * 60 * 1000 (20 minutes) */
  cycleDuration?: number;
  /** Minimum insights to generate per cycle. Default: 5 */
  targetInsights?: number;
  /** Novelty threshold for insights. Default: 0.5 */
  noveltyThreshold?: number;
  /** Noise level for dreaming. Default: 0.2 */
  dreamNoise?: number;
  /** Auto-load patterns from existing patterns table. Default: true */
  autoLoadPatterns?: boolean;
  /** Enable debug logging */
  debug?: boolean;
}

export interface DreamCycleResult {
  cycleId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  conceptsProcessed: number;
  associationsFound: number;
  insightsGenerated: number;
  insights: DreamInsight[];
  dreamResult: DreamResult;
  status: 'completed' | 'interrupted' | 'failed';
  error?: string;
}

export interface DreamEngineState {
  isRunning: boolean;
  currentCycleId?: string;
  cyclesCompleted: number;
  totalInsightsGenerated: number;
  lastCycleTime?: Date;
  averageInsightsPerCycle: number;
}

/**
 * DreamEngine orchestrates dream-based pattern discovery
 *
 * @example
 * ```typescript
 * const engine = new DreamEngine({ cycleDuration: 30000 }); // 30 second cycles for testing
 * await engine.initialize();
 *
 * // Run a dream cycle
 * const result = await engine.dream();
 * console.log(`Generated ${result.insightsGenerated} insights`);
 *
 * // Get pending insights
 * const insights = engine.getPendingInsights();
 * ```
 */
export class DreamEngine extends EventEmitter {
  private config: Required<DreamEngineConfig>;
  private graph: ConceptGraph;
  private activation: SpreadingActivation;
  private generator: InsightGenerator;
  private db: BetterSqlite3.Database;
  private logger: Logger;

  private state: DreamEngineState = {
    isRunning: false,
    cyclesCompleted: 0,
    totalInsightsGenerated: 0,
    averageInsightsPerCycle: 0,
  };

  private abortController?: AbortController;

  constructor(config?: DreamEngineConfig) {
    super();
    this.logger = Logger.getInstance();

    this.config = {
      dbPath: config?.dbPath || path.join(process.cwd(), '.agentic-qe', 'memory.db'),
      cycleDuration: config?.cycleDuration ?? 20 * 60 * 1000, // 20 minutes
      targetInsights: config?.targetInsights ?? 5,
      noveltyThreshold: config?.noveltyThreshold ?? 0.5,
      dreamNoise: config?.dreamNoise ?? 0.2,
      autoLoadPatterns: config?.autoLoadPatterns ?? true,
      debug: config?.debug ?? false,
    };

    this.db = new BetterSqlite3(this.config.dbPath);

    // Initialize components
    this.graph = new ConceptGraph({
      dbPath: this.config.dbPath,
      debug: this.config.debug,
    });

    this.activation = new SpreadingActivation(this.graph, {
      noise: this.config.dreamNoise,
      debug: this.config.debug,
    });

    this.generator = new InsightGenerator(this.graph, {
      dbPath: this.config.dbPath,
      noveltyThreshold: this.config.noveltyThreshold,
      debug: this.config.debug,
    });

    this.initializeSchema();
  }

  /**
   * Initialize the dream engine
   */
  async initialize(): Promise<void> {
    await this.graph.initialize();

    if (this.config.autoLoadPatterns) {
      await this.loadPatternsAsConcepts();
      await this.loadExperiencesAsConcepts();
    }

    this.logger.info('[DreamEngine] Initialized', {
      concepts: this.graph.getStats().nodeCount,
      cycleDuration: this.config.cycleDuration,
    });
  }

  /**
   * Initialize database schema for dream cycles
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dream_cycles (
        id TEXT PRIMARY KEY,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        duration INTEGER,
        concepts_processed INTEGER,
        associations_found INTEGER,
        insights_generated INTEGER,
        status TEXT NOT NULL,
        error TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_dream_cycle_status ON dream_cycles(status);
      CREATE INDEX IF NOT EXISTS idx_dream_cycle_time ON dream_cycles(start_time);
    `);
  }

  /**
   * Load existing patterns as concepts
   */
  private async loadPatternsAsConcepts(): Promise<void> {
    try {
      const patterns = this.db.prepare(`
        SELECT id, content, metadata, created_at
        FROM patterns
        LIMIT 500
      `).all() as any[];

      this.logger.info('[DreamEngine] Loading patterns as concepts', { count: patterns.length });

      for (const pattern of patterns) {
        const metadata = pattern.metadata ? JSON.parse(pattern.metadata) : {};

        await this.graph.addConcept({
          id: `pattern-${pattern.id}`,
          type: 'pattern',
          content: pattern.content || `Pattern ${pattern.id}`,
          metadata: {
            originalId: pattern.id,
            source: 'patterns_table',
            ...metadata,
          },
        });
      }

      // Also load from synthesized_patterns
      const synthesized = this.db.prepare(`
        SELECT id, description, type, conditions, actions, confidence, agent_types, task_types
        FROM synthesized_patterns
        LIMIT 500
      `).all() as any[];

      for (const sp of synthesized) {
        const type: ConceptType = this.mapPatternType(sp.type);

        await this.graph.addConcept({
          id: `synth-${sp.id}`,
          type,
          content: sp.description || `Synthesized pattern: ${sp.type}`,
          metadata: {
            originalId: sp.id,
            source: 'synthesized_patterns',
            patternType: sp.type,
            conditions: sp.conditions ? JSON.parse(sp.conditions) : [],
            actions: sp.actions ? JSON.parse(sp.actions) : [],
            confidence: sp.confidence,
            agentTypes: sp.agent_types ? JSON.parse(sp.agent_types) : [],
            taskTypes: sp.task_types ? JSON.parse(sp.task_types) : [],
          },
        });
      }

      this.logger.info('[DreamEngine] Loaded patterns as concepts', {
        patterns: patterns.length,
        synthesized: synthesized.length,
        total: this.graph.getStats().nodeCount,
      });
    } catch (error) {
      // Tables might not exist yet
      if (this.config.debug) {
        this.logger.debug('[DreamEngine] Could not load patterns', { error });
      }
    }
  }

  /**
   * Load captured experiences as concepts for dream processing
   * This connects real agent execution data to the concept graph
   */
  private async loadExperiencesAsConcepts(): Promise<void> {
    try {
      // Check if table exists
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='captured_experiences'
      `).get();

      if (!tableExists) {
        if (this.config.debug) {
          this.logger.debug('[DreamEngine] captured_experiences table does not exist yet');
        }
        return;
      }

      const experiences = this.db.prepare(`
        SELECT id, agent_id, agent_type, task_type, execution, context, outcome, created_at
        FROM captured_experiences
        WHERE processed = 0 OR created_at > ?
        ORDER BY created_at DESC
        LIMIT 500
      `).all(Date.now() - 7 * 24 * 60 * 60 * 1000) as any[]; // Last 7 days

      this.logger.info('[DreamEngine] Loading experiences as concepts', { count: experiences.length });

      for (const exp of experiences) {
        const execution = JSON.parse(exp.execution);
        const context = JSON.parse(exp.context);
        const outcome = JSON.parse(exp.outcome);

        // Create concept for the agent execution
        const executionConcept: ConceptType = execution.success ? 'outcome' : 'error';

        await this.graph.addConcept({
          id: `exp-${exp.id}`,
          type: executionConcept,
          content: this.buildExperienceContent(exp, execution, context, outcome),
          metadata: {
            source: 'captured_experiences',
            agentId: exp.agent_id,
            agentType: exp.agent_type,
            taskType: exp.task_type,
            success: execution.success,
            duration: execution.duration,
            qualityScore: outcome.quality_score,
            patternsUsed: context.patterns_used || [],
            decisionsMode: context.decisions_made || [],
            errorsEncountered: context.errors_encountered || [],
            capturedAt: exp.created_at,
          },
        });

        // Also create concepts for patterns used in this execution
        if (context.patterns_used && context.patterns_used.length > 0) {
          for (const patternId of context.patterns_used) {
            const patternConceptId = `exp-pattern-${patternId}-${exp.id.substring(0, 8)}`;

            // Check if concept already exists to avoid duplicates
            const existingConcept = this.graph.getConcept(patternConceptId);
            if (!existingConcept) {
              await this.graph.addConcept({
                id: patternConceptId,
                type: 'pattern',
                content: `Pattern ${patternId} used by ${exp.agent_type} agent`,
                metadata: {
                  source: 'experience_pattern',
                  patternId,
                  agentType: exp.agent_type,
                  taskType: exp.task_type,
                  success: execution.success,
                },
              });

              // Create edge between experience and pattern concept
              this.graph.addEdge({
                source: `exp-${exp.id}`,
                target: patternConceptId,
                weight: execution.success ? 0.8 : 0.3, // Higher weight for successful patterns
                type: 'uses_pattern',
              });
            }
          }
        }

        // Create concepts for decisions made
        if (context.decisions_made && context.decisions_made.length > 0) {
          for (const decision of context.decisions_made) {
            const decisionConceptId = `exp-decision-${SecureRandom.randomString(8, 'alphanumeric')}`;

            await this.graph.addConcept({
              id: decisionConceptId,
              type: 'technique',
              content: `Decision: ${decision}`,
              metadata: {
                source: 'experience_decision',
                decision,
                agentType: exp.agent_type,
                taskType: exp.task_type,
                success: execution.success,
              },
            });

            // Link decision to experience
            this.graph.addEdge({
              source: `exp-${exp.id}`,
              target: decisionConceptId,
              weight: execution.success ? 0.7 : 0.4,
              type: 'made_decision',
            });
          }
        }

        // Create concepts for errors encountered (learning from failures)
        if (context.errors_encountered && context.errors_encountered.length > 0) {
          for (const error of context.errors_encountered) {
            const errorConceptId = `exp-error-${SecureRandom.randomString(8, 'alphanumeric')}`;

            await this.graph.addConcept({
              id: errorConceptId,
              type: 'error',
              content: `Error: ${error}`,
              metadata: {
                source: 'experience_error',
                error,
                agentType: exp.agent_type,
                taskType: exp.task_type,
              },
            });

            // Link error to experience
            this.graph.addEdge({
              source: `exp-${exp.id}`,
              target: errorConceptId,
              weight: 0.9, // High weight for error associations
              type: 'encountered_error',
            });
          }
        }
      }

      this.logger.info('[DreamEngine] Loaded experiences as concepts', {
        experiences: experiences.length,
        totalConcepts: this.graph.getStats().nodeCount,
      });
    } catch (error) {
      // Table might not exist yet or other issue
      if (this.config.debug) {
        this.logger.debug('[DreamEngine] Could not load experiences', { error });
      }
    }
  }

  /**
   * Build descriptive content for an experience concept
   */
  private buildExperienceContent(
    exp: any,
    execution: any,
    context: any,
    outcome: any
  ): string {
    const status = execution.success ? 'successful' : 'failed';
    const quality = outcome.quality_score >= 0.7 ? 'high-quality' :
                   outcome.quality_score >= 0.4 ? 'medium-quality' : 'low-quality';

    let content = `${status} ${exp.agent_type} execution for ${exp.task_type}`;

    if (context.patterns_used && context.patterns_used.length > 0) {
      content += ` using ${context.patterns_used.length} pattern(s)`;
    }

    if (context.decisions_made && context.decisions_made.length > 0) {
      content += ` with ${context.decisions_made.length} decision(s)`;
    }

    content += ` (${quality}, ${execution.duration}ms)`;

    return content;
  }

  /**
   * Map pattern type to concept type
   */
  private mapPatternType(type: string): ConceptType {
    switch (type) {
      case 'success_strategy':
      case 'efficiency_optimization':
        return 'technique';
      case 'failure_avoidance':
        return 'outcome';
      default:
        return 'pattern';
    }
  }

  /**
   * Run a dream cycle
   */
  async dream(): Promise<DreamCycleResult> {
    if (this.state.isRunning) {
      throw new Error('Dream cycle already in progress');
    }

    const cycleId = `dream-${Date.now()}-${SecureRandom.randomString(6, 'alphanumeric')}`;
    const startTime = new Date();

    this.state.isRunning = true;
    this.state.currentCycleId = cycleId;
    this.abortController = new AbortController();

    this.logger.info('[DreamEngine] Starting dream cycle', {
      cycleId,
      duration: this.config.cycleDuration,
      concepts: this.graph.getStats().nodeCount,
    });

    this.emit('dream:start', { cycleId, startTime });

    // Store cycle start
    this.db.prepare(`
      INSERT INTO dream_cycles (id, start_time, status, created_at)
      VALUES (?, ?, 'running', ?)
    `).run(cycleId, startTime.getTime(), startTime.getTime());

    let result: DreamCycleResult;

    try {
      // Run spreading activation dream
      const dreamResult = await this.activation.dream(this.config.cycleDuration);

      // Generate insights from associations
      const insights = await this.generator.generateInsights(dreamResult.novelAssociations);

      const endTime = new Date();

      result = {
        cycleId,
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        conceptsProcessed: this.graph.getStats().nodeCount,
        associationsFound: dreamResult.associations.length,
        insightsGenerated: insights.length,
        insights,
        dreamResult,
        status: 'completed',
      };

      // Update state
      this.state.cyclesCompleted++;
      this.state.totalInsightsGenerated += insights.length;
      this.state.lastCycleTime = endTime;
      this.state.averageInsightsPerCycle =
        this.state.totalInsightsGenerated / this.state.cyclesCompleted;

      // Update database
      this.db.prepare(`
        UPDATE dream_cycles
        SET end_time = ?, duration = ?, concepts_processed = ?,
            associations_found = ?, insights_generated = ?, status = ?
        WHERE id = ?
      `).run(
        endTime.getTime(),
        result.duration,
        result.conceptsProcessed,
        result.associationsFound,
        result.insightsGenerated,
        'completed',
        cycleId
      );

      this.logger.info('[DreamEngine] Dream cycle completed', {
        cycleId,
        duration: result.duration,
        associations: result.associationsFound,
        insights: result.insightsGenerated,
      });

      this.emit('dream:complete', result);
    } catch (error) {
      const endTime = new Date();
      const errorMessage = error instanceof Error ? error.message : String(error);

      result = {
        cycleId,
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        conceptsProcessed: 0,
        associationsFound: 0,
        insightsGenerated: 0,
        insights: [],
        dreamResult: {
          duration: 0,
          associations: [],
          novelAssociations: [],
          randomActivations: 0,
          averageNovelty: 0,
        },
        status: 'failed',
        error: errorMessage,
      };

      this.db.prepare(`
        UPDATE dream_cycles
        SET end_time = ?, duration = ?, status = ?, error = ?
        WHERE id = ?
      `).run(
        endTime.getTime(),
        result.duration,
        'failed',
        errorMessage,
        cycleId
      );

      this.logger.error('[DreamEngine] Dream cycle failed', { cycleId, error: errorMessage });
      this.emit('dream:error', { cycleId, error: errorMessage });
    } finally {
      this.state.isRunning = false;
      this.state.currentCycleId = undefined;
      this.abortController = undefined;
    }

    return result;
  }

  /**
   * Abort current dream cycle
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.logger.info('[DreamEngine] Dream cycle aborted');
    }
  }

  /**
   * Add a concept to the graph
   */
  async addConcept(concept: Omit<ConceptNode, 'activationLevel' | 'lastActivated'>): Promise<ConceptNode> {
    return this.graph.addConcept(concept);
  }

  /**
   * Get pending insights
   */
  getPendingInsights(limit: number = 10): DreamInsight[] {
    return this.generator.getPendingInsights(limit);
  }

  /**
   * Get insights by type
   */
  getInsightsByType(type: InsightType, limit: number = 10): DreamInsight[] {
    return this.generator.getInsightsByType(type, limit);
  }

  /**
   * Apply an insight
   */
  async applyInsight(insightId: string, feedback?: string): Promise<void> {
    return this.generator.applyInsight(insightId, feedback);
  }

  /**
   * Get engine state
   */
  getState(): DreamEngineState {
    return { ...this.state };
  }

  /**
   * Get graph statistics
   */
  getGraphStats() {
    return this.graph.getStats();
  }

  /**
   * Get recent dream cycles
   */
  getRecentCycles(limit: number = 10): any[] {
    return this.db.prepare(`
      SELECT * FROM dream_cycles
      ORDER BY start_time DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Reset activation levels
   */
  resetActivations(): void {
    this.activation.resetActivations();
  }

  /**
   * Close all connections
   */
  close(): void {
    this.graph.close();
    this.generator.close();
    this.db.close();
  }
}

export default DreamEngine;
