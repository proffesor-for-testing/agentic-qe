/**
 * V2 to V3 Data Migration Module
 * ADR-038: V3 QE Memory Unification
 *
 * Migrates data from V2 AQE fleet (.agentic-qe/memory.db) to V3 systems:
 * - patterns → RealQEReasoningBank (.agentic-qe/memory.db)
 * - captured_experiences → QEUnifiedMemory learning domain
 * - learning_experiences → RL training data
 * - concept_nodes/edges → Code intelligence knowledge graph
 *
 * @module migration
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { QEDomain, QEPatternType } from './qe-patterns.js';
import type { QEMemoryDomain } from './qe-unified-memory.js';

// ============================================================================
// Types
// ============================================================================

export interface V2MigrationConfig {
  /** Path to V2 memory.db file */
  v2DbPath: string;
  /** Path to V3 memory.db file */
  v3PatternsDbPath: string;
  /** Progress callback */
  onProgress?: (progress: V2MigrationProgress) => void;
}

export interface V2MigrationProgress {
  stage: 'connecting' | 'reading' | 'migrating' | 'validating' | 'complete';
  table?: string;
  current: number;
  total: number;
  message: string;
}

export interface V2MigrationResult {
  success: boolean;
  tablesMigrated: string[];
  counts: Record<string, number>;
  errors: string[];
  duration: number;
}

// ============================================================================
// V2 Database Schema Interfaces
// ============================================================================

interface V2Pattern {
  id: string;
  pattern: string;
  confidence: number;
  usage_count: number;
  metadata: string | null;
  ttl: number;
  expires_at: number | null;
  created_at: number;
  agent_id: string | null;
  domain: string;
  success_rate: number;
}

interface V2CapturedExperience {
  id: string;
  agent_id: string;
  agent_type: string;
  task_type: string;
  execution: string; // JSON
  context: string; // JSON
  outcome: string; // JSON
  embedding: Buffer | null;
  created_at: number;
  processed: number;
}

interface V2LearningExperience {
  id: number;
  agent_id: string;
  task_id: string | null;
  task_type: string;
  state: string; // JSON
  action: string;
  reward: number;
  next_state: string; // JSON
  episode_id: string | null;
  metadata: string | null;
  created_at: number;
}

interface V2ConceptNode {
  id: string;
  name: string;
  type: string;
  domain: string | null;
  properties: string | null; // JSON
  embedding: string | null; // JSON array
  created_at: number;
  updated_at: number;
  activation_level: number;
  last_activated: number | null;
}

interface V2ConceptEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  type: string;
  evidence: number;
  created_at: number;
  updated_at: number;
}

// ============================================================================
// V2 to V3 Migration Class
// ============================================================================

export class V2ToV3Migrator {
  private readonly config: V2MigrationConfig;
  private v2Db: Database.Database | null = null;
  private v3Db: Database.Database | null = null;
  private startTime = 0;

  constructor(config: V2MigrationConfig) {
    this.config = config;
  }

  /**
   * Execute the full migration
   */
  async migrate(): Promise<V2MigrationResult> {
    this.startTime = Date.now();
    const errors: string[] = [];
    const tablesMigrated: string[] = [];
    const counts: Record<string, number> = {};

    try {
      // Step 1: Connect to databases
      await this.reportProgress('connecting', 0, 1, 'Connecting to databases...');
      await this.connect();

      // Step 2: Read V2 data
      await this.reportProgress('reading', 0, 1, 'Reading V2 data...');
      const v2Data = await this.readV2Data();

      // Step 3: Migrate to V3
      await this.reportProgress('migrating', 0, 1, 'Migrating patterns...');

      // Migrate patterns → RealQEReasoningBank
      const patternCount = await this.migratePatterns(v2Data.patterns);
      if (patternCount > 0) {
        tablesMigrated.push('patterns');
        counts.patterns = patternCount;
      }

      await this.reportProgress('migrating', 1, 4, 'Migrating captured experiences...');
      // Migrate captured experiences → learning domain
      const experienceCount = await this.migrateCapturedExperiences(v2Data.capturedExperiences);
      if (experienceCount > 0) {
        tablesMigrated.push('captured_experiences');
        counts.captured_experiences = experienceCount;
      }

      await this.reportProgress('migrating', 2, 4, 'Migrating learning experiences...');
      // Migrate learning experiences → RL data
      const learningCount = await this.migrateLearningExperiences(v2Data.learningExperiences);
      if (learningCount > 0) {
        tablesMigrated.push('learning_experiences');
        counts.learning_experiences = learningCount;
      }

      await this.reportProgress('migrating', 3, 4, 'Migrating concept graph...');
      // Migrate concept nodes/edges → code intelligence
      const conceptCount = await this.migrateConceptGraph(v2Data.conceptNodes, v2Data.conceptEdges);
      if (conceptCount > 0) {
        tablesMigrated.push('concept_graph');
        counts.concept_graph = conceptCount;
      }

      // Step 4: Validate migration
      await this.reportProgress('validating', 0, 1, 'Validating migration...');
      const validationErrors = await this.validateMigration();
      errors.push(...validationErrors);

      await this.reportProgress('complete', 1, 1, 'Migration complete!');

      return {
        success: errors.length === 0,
        tablesMigrated,
        counts,
        errors,
        duration: Date.now() - this.startTime,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        success: false,
        tablesMigrated,
        counts,
        errors,
        duration: Date.now() - this.startTime,
      };
    } finally {
      await this.disconnect();
    }
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  /**
   * Safely parse JSON, returning a wrapper object for non-JSON strings
   * Handles V2 data where state/action columns may contain plain strings like "task-started"
   */
  private safeJsonParse(value: string | null | undefined, fieldName: string = 'value'): Record<string, unknown> {
    if (value === null || value === undefined || value === '') {
      return {};
    }

    // Trim whitespace
    const trimmed = value.trim();

    // Check if it looks like JSON (starts with { or [)
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        // If parsing fails, wrap as string
        return { [fieldName]: trimmed, _parseError: true };
      }
    }

    // Not JSON - wrap the plain string value
    return { [fieldName]: trimmed, _isPlainString: true };
  }

  private async reportProgress(
    stage: V2MigrationProgress['stage'],
    current: number,
    total: number,
    message: string,
    table?: string
  ): Promise<void> {
    if (this.config.onProgress) {
      this.config.onProgress({ stage, table, current, total, message });
    }
  }

  private async connect(): Promise<void> {
    // Connect to V2 database (readonly)
    this.v2Db = new Database(this.config.v2DbPath, { readonly: true });
    // Skip WAL mode for readonly database

    // Connect to V3 patterns database (readwrite)
    this.v3Db = new Database(this.config.v3PatternsDbPath);
    this.v3Db.pragma('journal_mode = WAL');

    // Ensure V3 schema exists
    this.createV3Schema();
  }

  private async disconnect(): Promise<void> {
    if (this.v2Db) {
      this.v2Db.close();
      this.v2Db = null;
    }
    if (this.v3Db) {
      this.v3Db.close();
      this.v3Db = null;
    }
  }

  private createV3Schema(): void {
    if (!this.v3Db) throw new Error('V3 database not connected');

    // This schema should match SQLitePatternStore's schema
    this.v3Db.exec(`
      CREATE TABLE IF NOT EXISTS qe_patterns (
        id TEXT PRIMARY KEY,
        pattern_type TEXT NOT NULL,
        qe_domain TEXT NOT NULL,
        domain TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        confidence REAL DEFAULT 0.5,
        usage_count INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 0.0,
        quality_score REAL DEFAULT 0.0,
        tier TEXT DEFAULT 'short-term',
        template_json TEXT,
        context_json TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        last_used_at TEXT,
        successful_uses INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS qe_pattern_embeddings (
        pattern_id TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        dimension INTEGER NOT NULL,
        model TEXT DEFAULT 'all-MiniLM-L6-v2',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (pattern_id) REFERENCES qe_patterns(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS qe_pattern_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_id TEXT NOT NULL,
        success INTEGER NOT NULL,
        metrics_json TEXT,
        feedback TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_patterns_domain ON qe_patterns(qe_domain);
      CREATE INDEX IF NOT EXISTS idx_patterns_type ON qe_patterns(pattern_type);
      CREATE INDEX IF NOT EXISTS idx_patterns_tier ON qe_patterns(tier);
    `);
  }

  private async readV2Data(): Promise<{
    patterns: V2Pattern[];
    capturedExperiences: V2CapturedExperience[];
    learningExperiences: V2LearningExperience[];
    conceptNodes: V2ConceptNode[];
    conceptEdges: V2ConceptEdge[];
  }> {
    if (!this.v2Db) throw new Error('V2 database not connected');

    // Helper to safely read from a table that might not exist
    const safeReadTable = <T>(tableName: string): T[] => {
      try {
        // Check if table exists first
        const tableExists = this.v2Db!.prepare(`
          SELECT name FROM sqlite_master
          WHERE type='table' AND name=?
        `).get(tableName);

        if (!tableExists) {
          console.log(`  [V2Migration] Table '${tableName}' not found, skipping...`);
          return [];
        }

        return this.v2Db!.prepare(`SELECT * FROM ${tableName}`).all() as T[];
      } catch (error) {
        console.warn(`  [V2Migration] Could not read table '${tableName}': ${error instanceof Error ? error.message : String(error)}`);
        return [];
      }
    };

    return {
      patterns: safeReadTable<V2Pattern>('patterns'),
      capturedExperiences: safeReadTable<V2CapturedExperience>('captured_experiences'),
      learningExperiences: safeReadTable<V2LearningExperience>('learning_experiences'),
      conceptNodes: safeReadTable<V2ConceptNode>('concept_nodes'),
      conceptEdges: safeReadTable<V2ConceptEdge>('concept_edges'),
    };
  }

  /**
   * Migrate V2 patterns to V3 qe_patterns table
   */
  private async migratePatterns(patterns: V2Pattern[]): Promise<number> {
    if (!this.v3Db) throw new Error('V3 database not connected');
    if (patterns.length === 0) return 0;

    const insert = this.v3Db.prepare(`
      INSERT OR REPLACE INTO qe_patterns (
        id, pattern_type, qe_domain, domain, name, description,
        confidence, usage_count, success_rate, tier, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertEmbedding = this.v3Db.prepare(`
      INSERT OR REPLACE INTO qe_pattern_embeddings (pattern_id, embedding, dimension, model)
      VALUES (?, ?, ?, ?)
    `);

    let count = 0;
    const transaction = this.v3Db.transaction(() => {
      for (const pattern of patterns) {
        try {
          // Parse V2 pattern data - use safe parsing for non-JSON values
          const patternData = this.safeJsonParse(pattern.pattern, 'pattern');
          const metadata = this.safeJsonParse(pattern.metadata, 'metadata');

          // Map V2 domain to V3 QEDomain
          const qeDomain = this.mapV2DomainToV3(pattern.domain || String(metadata.domain || 'general'));

          // Determine pattern type from metadata or pattern content
          const patternType = this.inferPatternType(patternData, metadata as Record<string, unknown>);

          // Calculate quality score from confidence and success rate
          const qualityScore = (pattern.confidence * 0.6) + (pattern.success_rate * 0.4);

          // Get pattern name safely
          const patternName = String(patternData.name || metadata.name || pattern.pattern.substring(0, 50));

          // Insert pattern
          insert.run(
            pattern.id,
            patternType,
            qeDomain,
            pattern.domain || 'general',
            patternName,
            String(patternData.description || metadata.description || '') || null,
            pattern.confidence,
            pattern.usage_count,
            pattern.success_rate,
            this.calculateTier(pattern.usage_count, qualityScore),
            new Date(pattern.created_at * 1000).toISOString()
          );

          // TODO: Migrate embeddings if available (V2 doesn't store them in patterns table)
          // Would need to generate embeddings or migrate from captured_experiences

          count++;
        } catch (error) {
          console.warn(`[V2Migration] Failed to migrate pattern ${pattern.id}:`, error);
        }
      }
    });

    transaction();
    return count;
  }

  /**
   * Migrate captured experiences to learning domain
   * These are stored in memory_entries for now, could be moved to QEUnifiedMemory
   */
  private async migrateCapturedExperiences(experiences: V2CapturedExperience[]): Promise<number> {
    if (!this.v3Db) throw new Error('V3 database not connected');
    if (experiences.length === 0) return 0;

    // Store captured experiences as learning patterns
    const insert = this.v3Db.prepare(`
      INSERT OR REPLACE INTO qe_patterns (
        id, pattern_type, qe_domain, domain, name, description,
        confidence, usage_count, success_rate, tier, context_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let count = 0;
    for (const exp of experiences) {
      try {
        // Use safe parsing - V2 may store non-JSON values
        const execution = this.safeJsonParse(exp.execution, 'execution');
        const context = this.safeJsonParse(exp.context, 'context');
        const outcome = this.safeJsonParse(exp.outcome, 'outcome');

        const qeDomain = this.mapTaskTypeToDomain(exp.task_type);

        // Safely access outcome.success with fallback
        const isSuccess = typeof outcome.success === 'boolean' ? outcome.success : false;

        insert.run(
          exp.id, // Use original ID
          'test-template', // Captured experiences become templates
          qeDomain,
          exp.task_type,
          `Experience: ${exp.task_type}`,
          `Agent: ${exp.agent_type}, Task: ${exp.task_type}`,
          isSuccess ? 0.8 : 0.3, // Confidence based on outcome
          1, // One usage
          isSuccess ? 1.0 : 0.0, // Success rate
          'short-term',
          JSON.stringify({ context, execution, outcome }),
          new Date(exp.created_at * 1000).toISOString()
        );

        count++;
      } catch (error) {
        console.warn(`[V2Migration] Failed to migrate experience ${exp.id}:`, error);
      }
    }

    return count;
  }

  /**
   * Migrate learning experiences (RL data)
   * Store as learning patterns for SONA integration
   */
  private async migrateLearningExperiences(experiences: V2LearningExperience[]): Promise<number> {
    if (!this.v3Db) throw new Error('V3 database not connected');
    if (experiences.length === 0) return 0;

    const insert = this.v3Db.prepare(`
      INSERT OR REPLACE INTO qe_patterns (
        id, pattern_type, qe_domain, domain, name, description,
        confidence, usage_count, success_rate, tier, context_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let count = 0;
    for (const exp of experiences) {
      try {
        // Use safe parsing - V2 may store plain strings like "task-started" instead of JSON
        const state = this.safeJsonParse(exp.state, 'state');
        const nextState = exp.next_state ? this.safeJsonParse(exp.next_state, 'nextState') : null;
        const metadata = this.safeJsonParse(exp.metadata, 'metadata');

        const qeDomain = this.mapTaskTypeToDomain(exp.task_type);

        insert.run(
          `le_${exp.id}`, // Prefix to avoid ID collision
          'test-template',
          qeDomain,
          exp.task_type,
          `RL Experience: ${exp.task_type}`,
          `Action: ${exp.action}, Reward: ${exp.reward.toFixed(2)}`,
          Math.min(1.0, Math.max(0.1, exp.reward)), // Confidence from reward
          1,
          exp.reward > 0 ? 1.0 : 0.0,
          'short-term',
          JSON.stringify({ state, action: exp.action, reward: exp.reward, nextState, metadata }),
          new Date(exp.created_at).toISOString()
        );

        count++;
      } catch (error) {
        console.warn(`[V2Migration] Failed to migrate learning experience ${exp.id}:`, error);
      }
    }

    return count;
  }

  /**
   * Migrate concept graph (nodes and edges) for code intelligence
   */
  private async migrateConceptGraph(
    nodes: V2ConceptNode[],
    edges: V2ConceptEdge[]
  ): Promise<number> {
    if (!this.v3Db) throw new Error('V3 database not connected');
    if (nodes.length === 0) return 0;

    const insert = this.v3Db.prepare(`
      INSERT OR REPLACE INTO qe_patterns (
        id, pattern_type, qe_domain, domain, name, description,
        confidence, usage_count, success_rate, tier, context_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let count = 0;

    // Store concept nodes as knowledge graph patterns
    for (const node of nodes) {
      try {
        // Use safe parsing for non-JSON values
        const properties = this.safeJsonParse(node.properties, 'properties');
        const embedding = this.safeJsonParse(node.embedding, 'embedding');

        insert.run(
          `cn_${node.id}`, // Prefix for concept node
          'test-template',
          'code-intelligence',
          node.type,
          node.name,
          String(properties.description || '') || `Concept: ${node.name}`,
          node.activation_level || 0.5,
          0,
          1.0, // Concepts are valid by default
          'medium-term',
          JSON.stringify({
            type: node.type,
            domain: node.domain,
            properties,
            embedding,
            activationLevel: node.activation_level,
          }),
          new Date(node.created_at * 1000).toISOString()
        );

        count++;
      } catch (error) {
        console.warn(`[V2Migration] Failed to migrate concept node ${node.id}:`, error);
      }
    }

    // Store edges as relationship patterns
    for (const edge of edges) {
      try {
        insert.run(
          `ce_${edge.id}`, // Prefix for concept edge
          'test-template',
          'code-intelligence',
          edge.type,
          `${edge.source} → ${edge.target}`,
          `Weight: ${edge.weight.toFixed(2)}, Evidence: ${edge.evidence}`,
          edge.weight,
          0,
          1.0,
          'short-term',
          JSON.stringify({
            source: edge.source,
            target: edge.target,
            weight: edge.weight,
            evidence: edge.evidence,
          }),
          new Date(edge.created_at * 1000).toISOString()
        );

        count++;
      } catch (error) {
        console.warn(`[V2Migration] Failed to migrate concept edge ${edge.id}:`, error);
      }
    }

    return count;
  }

  /**
   * Validate migration results
   */
  private async validateMigration(): Promise<string[]> {
    if (!this.v3Db) throw new Error('V3 database not connected');

    const errors: string[] = [];

    // Check pattern counts (0 is valid if v2 had no patterns)
    const patternCount = this.v3Db.prepare('SELECT COUNT(*) as count FROM qe_patterns').get() as { count: number };
    if (patternCount.count === 0) {
      // Not an error - v2 might have had no patterns to migrate
      console.log('  [V2Migration] Note: No patterns were migrated (v2 database may have been empty)');
    }

    // Check for duplicate IDs (actual error)
    const duplicates = this.v3Db.prepare(`
      SELECT id, COUNT(*) as count FROM qe_patterns GROUP BY id HAVING count > 1
    `).all() as { id: string; count: number }[];

    if (duplicates.length > 0) {
      errors.push(`${duplicates.length} duplicate pattern IDs found`);
    }

    return errors;
  }

  // -------------------------------------------------------------------------
  // Mapping Helpers
  // -------------------------------------------------------------------------

  private mapV2DomainToV3(v2Domain: string): QEDomain {
    const domainMap: Record<string, QEDomain> = {
      'test-generation': 'test-generation',
      'test': 'test-generation',
      'testing': 'test-generation',
      'coverage': 'coverage-analysis',
      'coverage-analysis': 'coverage-analysis',
      'quality': 'quality-assessment',
      'defect': 'defect-intelligence',
      'security': 'security-compliance',
      'code-intelligence': 'code-intelligence',
      'knowledge': 'code-intelligence',
      'learning': 'learning-optimization',
      'contract': 'contract-testing',
      'visual': 'visual-accessibility',
      'a11y': 'visual-accessibility',
      'chaos': 'chaos-resilience',
      'performance': 'chaos-resilience',
      'requirements': 'requirements-validation',
      'general': 'test-generation', // Default to test-generation
    };

    return domainMap[v2Domain.toLowerCase()] || 'test-generation';
  }

  private mapTaskTypeToDomain(taskType: string): QEDomain {
    const typeLower = taskType.toLowerCase();

    if (typeLower.includes('test') || typeLower.includes('spec')) return 'test-generation';
    if (typeLower.includes('coverage')) return 'coverage-analysis';
    if (typeLower.includes('defect') || typeLower.includes('bug')) return 'defect-intelligence';
    if (typeLower.includes('security') || typeLower.includes('vuln')) return 'security-compliance';
    if (typeLower.includes('concept') || typeLower.includes('semantic')) return 'code-intelligence';
    if (typeLower.includes('learn') || typeLower.includes('pattern')) return 'learning-optimization';
    if (typeLower.includes('contract') || typeLower.includes('api')) return 'contract-testing';
    if (typeLower.includes('visual') || typeLower.includes('a11y')) return 'visual-accessibility';
    if (typeLower.includes('chaos') || typeLower.includes('performance')) return 'chaos-resilience';

    return 'test-generation'; // Default
  }

  private inferPatternType(patternData: unknown, metadata: Record<string, unknown>): QEPatternType {
    const data = patternData as Record<string, unknown>;
    const meta = metadata || {};

    // Check metadata first
    if (meta.patternType) return String(meta.patternType) as QEPatternType;
    if (data.type) return String(data.type) as QEPatternType;

    // Infer from pattern content
    const patternStr = JSON.stringify(patternData).toLowerCase();
    const metaStr = JSON.stringify(metadata).toLowerCase();

    if (patternStr.includes('mock') || metaStr.includes('mock')) return 'mock-pattern';
    if (patternStr.includes('assert') || metaStr.includes('assert')) return 'assertion-pattern';
    if (patternStr.includes('coverage')) return 'coverage-strategy';
    if (patternStr.includes('mutation')) return 'mutation-strategy';
    if (patternStr.includes('contract') || patternStr.includes('api')) return 'api-contract';
    if (patternStr.includes('visual') || patternStr.includes('snapshot')) return 'visual-baseline';
    if (patternStr.includes('a11y') || patternStr.includes('accessibility')) return 'a11y-check';
    if (patternStr.includes('performance') || patternStr.includes('benchmark')) return 'perf-benchmark';
    if (patternStr.includes('flaky')) return 'flaky-fix';
    if (patternStr.includes('refactor')) return 'refactor-safe';

    return 'test-template'; // Default
  }

  private calculateTier(usageCount: number, qualityScore: number): string {
    if (usageCount >= 10 && qualityScore >= 0.8) return 'long-term';
    if (usageCount >= 5 || qualityScore >= 0.6) return 'medium-term';
    return 'short-term';
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create and execute a V2 to V3 migration
 */
export async function migrateV2ToV3(
  v2DbPath: string = '.agentic-qe/memory.db',
  v3PatternsDbPath: string = '.agentic-qe/memory.db',
  onProgress?: (progress: V2MigrationProgress) => void
): Promise<V2MigrationResult> {
  const migrator = new V2ToV3Migrator({
    v2DbPath,
    v3PatternsDbPath,
    onProgress,
  });

  return migrator.migrate();
}
