# Learning System & Pattern Bank Architecture

**Version**: 1.4.0-ARCHITECTURE
**Status**: 🏗️ Design Phase
**Date**: 2025-10-31
**Author**: System Architecture Designer

---

## Executive Summary

This document defines the production-ready architecture for integrating the Learning System and Pattern Bank into the Agentic QE Fleet. The design addresses critical gaps identified in the [CRITICAL-LEARNING-SYSTEM-ANALYSIS.md](../CRITICAL-LEARNING-SYSTEM-ANALYSIS.md) and provides a complete blueprint for implementation.

### Architecture Goals

1. **Database-Backed Persistence**: Replace in-memory storage with SQLite-backed persistence
2. **Zero Data Loss**: Ensure patterns and learning data survive process restarts
3. **Performance**: Maintain <50ms p95 latency for pattern matching
4. **Integration**: Seamless integration with existing agent execution flow
5. **Observability**: Full CLI commands for monitoring and analytics
6. **Scalability**: Support 1000+ patterns per project with efficient indexing

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Database Schema Design](#2-database-schema-design)
3. [Component Architecture](#3-component-architecture)
4. [Data Flow Architecture](#4-data-flow-architecture)
5. [API Design](#5-api-design)
6. [Performance Architecture](#6-performance-architecture)
7. [Migration Strategy](#7-migration-strategy)
8. [Risk Assessment](#8-risk-assessment)
9. [Implementation Roadmap](#9-implementation-roadmap)

---

## 1. System Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Agentic QE Fleet                            │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Test Gen     │  │ Coverage     │  │ Flaky Test   │          │
│  │ Agent        │  │ Analyzer     │  │ Hunter       │  ... (18) │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                   │
│         └──────────────────┴──────────────────┘                  │
│                            │                                      │
│                 ┌──────────▼──────────┐                          │
│                 │   BaseAgent         │                          │
│                 │   (Lifecycle Hooks) │                          │
│                 └──────────┬──────────┘                          │
│                            │                                      │
│         ┌──────────────────┴──────────────────┐                 │
│         │                                      │                 │
│  ┌──────▼──────────┐              ┌───────────▼──────────┐      │
│  │ LearningEngine  │              │ QEReasoningBank     │      │
│  │ (Q-Learning)    │              │ (Pattern Storage)   │      │
│  └──────┬──────────┘              └───────────┬─────────┘      │
│         │                                      │                 │
│         │         ┌────────────────────────────┘                │
│         │         │                                              │
│  ┌──────▼─────────▼──────────────────────────┐                 │
│  │      Database Persistence Layer           │                 │
│  │  (SQLite via Database.ts)                 │                 │
│  │                                            │                 │
│  │  ┌─────────┐  ┌─────────┐  ┌──────────┐  │                 │
│  │  │patterns │  │pattern_ │  │learning_ │  │                 │
│  │  │         │  │usage    │  │history   │  │                 │
│  │  └─────────┘  └─────────┘  └──────────┘  │                 │
│  └───────────────────────────────────────────┘                 │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

CLI Layer:
  aqe learn status    →  Query learning_history
  aqe patterns list   →  Query patterns table
  aqe patterns search →  QEReasoningBank.findPattern()
```

### 1.2 Component Relationships

**Data Flow**:
1. Agent executes task → BaseAgent.performTask()
2. Result stored → BaseAgent.onPostTask() hook
3. Pattern extracted → QEReasoningBank.storePattern()
4. Pattern persisted → Database.run(INSERT INTO patterns...)
5. Learning recorded → LearningEngine.learnFromExecution()
6. Q-values updated → Database.run(INSERT INTO learning_history...)

**Key Integration Points**:
- BaseAgent lifecycle hooks (onPreTask, onPostTask, onTaskError)
- SwarmMemoryManager for cross-session state
- Database.ts for SQL persistence
- CLI commands for user interaction

---

## 2. Database Schema Design

### 2.1 Pattern Storage Schema

#### 2.1.1 `patterns` Table (Primary Pattern Storage)

```sql
CREATE TABLE IF NOT EXISTS patterns (
  -- Primary Key
  id TEXT PRIMARY KEY,

  -- Pattern Metadata
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK(category IN ('unit', 'integration', 'e2e', 'performance', 'security')),

  -- Pattern Content
  framework TEXT NOT NULL CHECK(framework IN ('jest', 'mocha', 'vitest', 'playwright', 'cypress', 'jasmine', 'ava')),
  language TEXT NOT NULL CHECK(language IN ('typescript', 'javascript', 'python')),
  template TEXT NOT NULL,
  examples TEXT NOT NULL, -- JSON array

  -- Quality Metrics
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  quality REAL CHECK(quality >= 0 AND quality <= 1),
  success_rate REAL NOT NULL DEFAULT 0.0 CHECK(success_rate >= 0 AND success_rate <= 1),
  usage_count INTEGER NOT NULL DEFAULT 0,

  -- Vector Embedding (for similarity search)
  embedding TEXT, -- JSON array of floats

  -- Metadata
  metadata TEXT NOT NULL, -- JSON: {createdAt, updatedAt, version, tags[]}

  -- Timestamps
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_patterns_framework ON patterns(framework);
CREATE INDEX IF NOT EXISTS idx_patterns_category ON patterns(category);
CREATE INDEX IF NOT EXISTS idx_patterns_language ON patterns(language);
CREATE INDEX IF NOT EXISTS idx_patterns_quality ON patterns(quality DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_usage_count ON patterns(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_created_at ON patterns(created_at DESC);

-- Full-Text Search Index (for pattern discovery)
CREATE VIRTUAL TABLE IF NOT EXISTS patterns_fts USING fts5(
  id, name, description, tags,
  content='patterns',
  content_rowid='rowid'
);

-- FTS trigger to keep index in sync
CREATE TRIGGER IF NOT EXISTS patterns_fts_insert AFTER INSERT ON patterns BEGIN
  INSERT INTO patterns_fts(id, name, description, tags)
  VALUES (new.id, new.name, new.description, json_extract(new.metadata, '$.tags'));
END;

CREATE TRIGGER IF NOT EXISTS patterns_fts_update AFTER UPDATE ON patterns BEGIN
  DELETE FROM patterns_fts WHERE id = old.id;
  INSERT INTO patterns_fts(id, name, description, tags)
  VALUES (new.id, new.name, new.description, json_extract(new.metadata, '$.tags'));
END;

CREATE TRIGGER IF NOT EXISTS patterns_fts_delete AFTER DELETE ON patterns BEGIN
  DELETE FROM patterns_fts WHERE id = old.id;
END;
```

#### 2.1.2 `pattern_usage` Table (Usage Tracking)

```sql
CREATE TABLE IF NOT EXISTS pattern_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Foreign Keys
  pattern_id TEXT NOT NULL,
  agent_id TEXT,
  task_id TEXT,
  project_id TEXT,

  -- Usage Context
  context TEXT, -- JSON: task context when pattern was used

  -- Outcome Metrics
  success BOOLEAN NOT NULL DEFAULT TRUE,
  execution_time INTEGER, -- milliseconds
  coverage_achieved REAL, -- 0-1

  -- Timestamp
  used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
);

-- Indexes for analytics
CREATE INDEX IF NOT EXISTS idx_pattern_usage_pattern_id ON pattern_usage(pattern_id);
CREATE INDEX IF NOT EXISTS idx_pattern_usage_agent_id ON pattern_usage(agent_id);
CREATE INDEX IF NOT EXISTS idx_pattern_usage_success ON pattern_usage(success);
CREATE INDEX IF NOT EXISTS idx_pattern_usage_used_at ON pattern_usage(used_at DESC);

-- Trigger to update pattern success_rate on usage
CREATE TRIGGER IF NOT EXISTS update_pattern_metrics AFTER INSERT ON pattern_usage
BEGIN
  UPDATE patterns
  SET
    usage_count = usage_count + 1,
    success_rate = (
      SELECT AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END)
      FROM pattern_usage
      WHERE pattern_id = NEW.pattern_id
    ),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.pattern_id;
END;
```

#### 2.1.3 `pattern_versions` Table (Version History)

```sql
CREATE TABLE IF NOT EXISTS pattern_versions (
  version_id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern_id TEXT NOT NULL,

  -- Snapshot of pattern at this version
  pattern_snapshot TEXT NOT NULL, -- Full JSON snapshot

  -- Version metadata
  version_number INTEGER NOT NULL,
  change_description TEXT,
  created_by TEXT,

  -- Timestamp
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pattern_versions_pattern_id ON pattern_versions(pattern_id);
CREATE INDEX IF NOT EXISTS idx_pattern_versions_created_at ON pattern_versions(created_at DESC);
```

### 2.2 Learning System Schema

#### 2.2.1 `learning_history` Table (Q-Learning Experience Replay)

```sql
CREATE TABLE IF NOT EXISTS learning_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Experience Identification
  experience_id TEXT NOT NULL UNIQUE,
  agent_id TEXT NOT NULL,
  task_id TEXT,
  task_type TEXT NOT NULL,

  -- Q-Learning Components
  state TEXT NOT NULL, -- JSON: TaskState
  action TEXT NOT NULL, -- JSON: AgentAction
  reward REAL NOT NULL,
  next_state TEXT NOT NULL, -- JSON: TaskState

  -- Context
  context TEXT, -- JSON: additional context

  -- Timestamp
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for experience replay and analytics
CREATE INDEX IF NOT EXISTS idx_learning_history_agent_id ON learning_history(agent_id);
CREATE INDEX IF NOT EXISTS idx_learning_history_task_type ON learning_history(task_type);
CREATE INDEX IF NOT EXISTS idx_learning_history_timestamp ON learning_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_learning_history_reward ON learning_history(reward DESC);
```

#### 2.2.2 `q_values` Table (Q-Table Persistence)

```sql
CREATE TABLE IF NOT EXISTS q_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Q-Value Identification
  agent_id TEXT NOT NULL,
  state_key TEXT NOT NULL, -- Encoded state string
  action_key TEXT NOT NULL, -- Encoded action string

  -- Q-Value
  q_value REAL NOT NULL,

  -- Learning Metadata
  update_count INTEGER NOT NULL DEFAULT 1,
  confidence REAL, -- Based on update_count

  -- Timestamp
  last_updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Composite unique constraint
  UNIQUE(agent_id, state_key, action_key)
);

-- Indexes for Q-value lookup
CREATE INDEX IF NOT EXISTS idx_q_values_agent_id ON q_values(agent_id);
CREATE INDEX IF NOT EXISTS idx_q_values_state_key ON q_values(state_key);
CREATE INDEX IF NOT EXISTS idx_q_values_lookup ON q_values(agent_id, state_key);
CREATE INDEX IF NOT EXISTS idx_q_values_last_updated ON q_values(last_updated DESC);
```

#### 2.2.3 `learned_patterns` Table (Pattern Discovery)

```sql
CREATE TABLE IF NOT EXISTS learned_patterns (
  id TEXT PRIMARY KEY,

  -- Pattern
  pattern TEXT NOT NULL,
  agent_id TEXT NOT NULL,

  -- Metrics
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  success_rate REAL NOT NULL CHECK(success_rate >= 0 AND success_rate <= 1),
  usage_count INTEGER NOT NULL DEFAULT 0,

  -- Context
  contexts TEXT NOT NULL, -- JSON array of task types

  -- Timestamps
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_learned_patterns_agent_id ON learned_patterns(agent_id);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_confidence ON learned_patterns(confidence DESC);
```

#### 2.2.4 `failure_patterns` Table (Failure Analysis)

```sql
CREATE TABLE IF NOT EXISTS failure_patterns (
  id TEXT PRIMARY KEY,

  -- Pattern
  pattern TEXT NOT NULL,
  agent_id TEXT,

  -- Metrics
  frequency INTEGER NOT NULL DEFAULT 1,
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),

  -- Context
  contexts TEXT NOT NULL, -- JSON array

  -- Remediation
  suggested_actions TEXT, -- JSON array of suggested fixes

  -- Timestamps
  identified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_failure_patterns_agent_id ON failure_patterns(agent_id);
CREATE INDEX IF NOT EXISTS idx_failure_patterns_frequency ON failure_patterns(frequency DESC);
```

### 2.3 Schema Migration Strategy

**Migration File**: `migrations/001_add_learning_tables.sql`

```sql
-- Migration: Add Learning System and Pattern Bank tables
-- Version: 1.4.0
-- Date: 2025-10-31

-- Check if migration already applied
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Pattern Storage Schema
-- (Include all CREATE TABLE statements from above)

-- Learning System Schema
-- (Include all CREATE TABLE statements from above)

-- Record migration
INSERT OR IGNORE INTO schema_migrations (version) VALUES ('001_learning_system');
```

**Migration Script**: `src/database/migrations/runMigration.ts`

```typescript
import { Database } from '../../utils/Database';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function runMigrations(db: Database): Promise<void> {
  const migrationPath = join(__dirname, '001_add_learning_tables.sql');
  const migrationSQL = readFileSync(migrationPath, 'utf-8');

  // Check if already applied
  const result = await db.get(
    "SELECT version FROM schema_migrations WHERE version = ?",
    ['001_learning_system']
  );

  if (result) {
    console.log('Migration 001_learning_system already applied');
    return;
  }

  // Run migration
  await db.exec(migrationSQL);
  console.log('Migration 001_learning_system applied successfully');
}
```

---

## 3. Component Architecture

### 3.1 QEReasoningBank - Database Integration

#### 3.1.1 Updated Architecture

```typescript
/**
 * QEReasoningBank with Database Persistence
 *
 * Architecture:
 * - In-memory cache for performance (existing Map-based storage)
 * - SQLite persistence for durability (NEW)
 * - Lazy loading on first access
 * - Write-through cache policy
 */
export class QEReasoningBank {
  // In-memory cache (existing)
  private patterns: Map<string, TestPattern> = new Map();
  private patternIndex: Map<string, Set<string>> = new Map();
  private keywordIndex: Map<string, Set<string>> = new Map();
  private frameworkIndex: Map<string, Set<string>> = new Map();
  private versionHistory: Map<string, TestPattern[]> = new Map();

  // Database integration (NEW)
  private database?: Database;
  private isLoaded: boolean = false;

  // Performance metrics (existing)
  private vectorSimilarity: VectorSimilarity;
  private qualityScorer: PatternQualityScorer;
  private performanceMetrics: PerformanceMetrics;

  constructor(config: {
    minQuality?: number;
    database?: Database; // NEW: optional database
  } = {}) {
    this.database = config.database;
    this.vectorSimilarity = new VectorSimilarity({ useIDF: true });
    this.qualityScorer = new PatternQualityScorer();
    this.performanceMetrics = { /* ... */ };
  }

  /**
   * Initialize ReasoningBank (load patterns from database)
   */
  async initialize(): Promise<void> {
    if (!this.database || this.isLoaded) {
      return;
    }

    const startTime = performance.now();

    // Load patterns from database
    const rows = await this.database.all('SELECT * FROM patterns ORDER BY created_at DESC');

    for (const row of rows) {
      const pattern = this.deserializePattern(row);

      // Store in memory cache
      this.patterns.set(pattern.id, pattern);

      // Rebuild indexes
      this.updateIndex(pattern);

      // Generate and cache vector embedding
      const patternText = this.getPatternText(pattern);
      this.vectorSimilarity.indexDocument(patternText);
      const vector = this.vectorSimilarity.generateEmbedding(patternText);
      this.vectorCache.set(pattern.id, vector);
    }

    this.isLoaded = true;
    const loadTime = performance.now() - startTime;

    console.log(`QEReasoningBank: Loaded ${rows.length} patterns in ${loadTime.toFixed(2)}ms`);
  }

  /**
   * Store pattern with database persistence
   */
  async storePattern(pattern: TestPattern): Promise<void> {
    // Validate pattern (existing logic)
    this.validatePattern(pattern);

    // Calculate quality if needed (existing logic)
    if (pattern.quality === undefined) {
      pattern.quality = this.qualityScorer.calculateQuality(/* ... */);
    }

    // Version existing pattern (existing logic)
    if (this.patterns.has(pattern.id)) {
      await this.versionPattern(pattern.id);
    }

    // Store in memory cache (existing)
    this.patterns.set(pattern.id, { ...pattern });

    // Update indexes (existing)
    this.updateIndex(pattern);

    // Generate vector embedding (existing)
    const patternText = this.getPatternText(pattern);
    this.vectorSimilarity.indexDocument(patternText);
    const vector = this.vectorSimilarity.generateEmbedding(patternText);
    this.vectorCache.set(pattern.id, vector);

    // **NEW: Persist to database**
    if (this.database) {
      await this.persistPattern(pattern);
    }
  }

  /**
   * Persist pattern to database (NEW)
   */
  private async persistPattern(pattern: TestPattern): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO patterns (
        id, name, description, category, framework, language,
        template, examples, confidence, quality, success_rate,
        usage_count, embedding, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    const vector = this.vectorCache.get(pattern.id);

    await this.database!.run(sql, [
      pattern.id,
      pattern.name,
      pattern.description,
      pattern.category,
      pattern.framework,
      pattern.language,
      pattern.template,
      JSON.stringify(pattern.examples),
      pattern.confidence,
      pattern.quality || null,
      pattern.successRate,
      pattern.usageCount,
      vector ? JSON.stringify(vector) : null,
      JSON.stringify(pattern.metadata),
      pattern.metadata.createdAt.toISOString()
    ]);
  }

  /**
   * Version pattern (save to pattern_versions table)
   */
  private async versionPattern(patternId: string): Promise<void> {
    const existing = this.patterns.get(patternId)!;

    // Store in memory history (existing)
    const history = this.versionHistory.get(patternId) || [];
    history.push({ ...existing });
    this.versionHistory.set(patternId, history);

    // **NEW: Persist to database**
    if (this.database) {
      const sql = `
        INSERT INTO pattern_versions (
          pattern_id, pattern_snapshot, version_number,
          change_description, created_by
        ) VALUES (?, ?, ?, ?, ?)
      `;

      const versionNumber = history.length;
      const snapshot = JSON.stringify(existing);

      await this.database.run(sql, [
        patternId,
        snapshot,
        versionNumber,
        `Auto-versioned before update`,
        'system'
      ]);
    }
  }

  /**
   * Record pattern usage (NEW)
   */
  async recordUsage(
    patternId: string,
    context: {
      agentId: string;
      taskId: string;
      success: boolean;
      executionTime: number;
      coverageAchieved?: number;
    }
  ): Promise<void> {
    // Update in-memory metrics (existing)
    await this.updatePatternMetrics(patternId, context.success);

    // **NEW: Record usage in database**
    if (this.database) {
      const sql = `
        INSERT INTO pattern_usage (
          pattern_id, agent_id, task_id, context,
          success, execution_time, coverage_achieved
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      await this.database.run(sql, [
        patternId,
        context.agentId,
        context.taskId,
        JSON.stringify({ /* task context */ }),
        context.success ? 1 : 0,
        context.executionTime,
        context.coverageAchieved || null
      ]);
    }
  }

  /**
   * Deserialize pattern from database row (NEW)
   */
  private deserializePattern(row: DatabaseRow): TestPattern {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      framework: row.framework,
      language: row.language,
      template: row.template,
      examples: JSON.parse(row.examples),
      confidence: row.confidence,
      usageCount: row.usage_count,
      successRate: row.success_rate,
      quality: row.quality,
      metadata: JSON.parse(row.metadata)
    };
  }
}
```

### 3.2 LearningEngine - Database Integration

#### 3.2.1 Updated Architecture

```typescript
/**
 * LearningEngine with Database Persistence
 *
 * Architecture:
 * - Q-table stored in database (q_values table)
 * - Experience replay from database (learning_history table)
 * - Batch loading for performance
 * - Periodic persistence (every N experiences)
 */
export class LearningEngine {
  private readonly logger: Logger;
  private readonly memoryStore: SwarmMemoryManager;
  private readonly agentId: string;
  private config: LearningConfig;

  // In-memory state (for performance)
  private qTable: Map<string, Map<string, number>>; // state-action values
  private experiences: TaskExperience[];
  private patterns: Map<string, LearnedPattern>;
  private failurePatterns: Map<string, FailurePattern>;

  // Database integration (NEW)
  private database?: Database;
  private persistenceCounter: number = 0;
  private readonly persistenceInterval: number = 10; // Persist every 10 experiences

  constructor(
    agentId: string,
    memoryStore: SwarmMemoryManager,
    config: Partial<LearningConfig> = {},
    database?: Database // NEW
  ) {
    this.agentId = agentId;
    this.memoryStore = memoryStore;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.database = database;
    this.qTable = new Map();
    this.experiences = [];
    this.patterns = new Map();
    this.failurePatterns = new Map();
  }

  /**
   * Initialize learning engine (load from database)
   */
  async initialize(): Promise<void> {
    if (this.database) {
      await this.loadFromDatabase();
    } else {
      // Fallback to memory store (existing logic)
      await this.loadState();
    }
  }

  /**
   * Load Q-table and experiences from database (NEW)
   */
  private async loadFromDatabase(): Promise<void> {
    const startTime = performance.now();

    // Load Q-values
    const qRows = await this.database!.all(
      'SELECT state_key, action_key, q_value FROM q_values WHERE agent_id = ?',
      [this.agentId]
    );

    for (const row of qRows) {
      if (!this.qTable.has(row.state_key)) {
        this.qTable.set(row.state_key, new Map());
      }
      this.qTable.get(row.state_key)!.set(row.action_key, row.q_value);
    }

    // Load recent experiences (last 1000)
    const expRows = await this.database!.all(
      `SELECT state, action, reward, next_state, task_type, timestamp
       FROM learning_history
       WHERE agent_id = ?
       ORDER BY timestamp DESC
       LIMIT 1000`,
      [this.agentId]
    );

    this.experiences = expRows.map(row => ({
      taskId: '', // Not stored in DB
      taskType: row.task_type,
      state: JSON.parse(row.state),
      action: JSON.parse(row.action),
      reward: row.reward,
      nextState: JSON.parse(row.next_state),
      timestamp: new Date(row.timestamp),
      agentId: this.agentId
    }));

    // Load learned patterns
    const patternRows = await this.database!.all(
      'SELECT * FROM learned_patterns WHERE agent_id = ?',
      [this.agentId]
    );

    for (const row of patternRows) {
      this.patterns.set(row.pattern, {
        id: row.id,
        pattern: row.pattern,
        confidence: row.confidence,
        successRate: row.success_rate,
        usageCount: row.usage_count,
        contexts: JSON.parse(row.contexts),
        createdAt: new Date(row.created_at),
        lastUsedAt: new Date(row.last_used_at)
      });
    }

    const loadTime = performance.now() - startTime;
    this.logger.info(`LearningEngine: Loaded ${qRows.length} Q-values, ${expRows.length} experiences in ${loadTime.toFixed(2)}ms`);
  }

  /**
   * Learn from execution with database persistence
   */
  async learnFromExecution(
    task: any,
    result: any,
    feedback?: LearningFeedback
  ): Promise<LearningOutcome> {
    if (!this.config.enabled) {
      return this.createOutcome(false, 0, 0);
    }

    // Extract experience (existing logic)
    const experience = this.extractExperience(task, result, feedback);
    const reward = this.calculateReward(result, feedback);
    experience.reward = reward;

    // Store in memory (existing)
    this.experiences.push(experience);

    // Update Q-table in memory (existing)
    await this.updateQTable(experience);

    // **NEW: Persist to database periodically**
    this.persistenceCounter++;
    if (this.database && this.persistenceCounter >= this.persistenceInterval) {
      await this.persistToDatabase(experience);
      this.persistenceCounter = 0;
    }

    // Update patterns (existing)
    await this.updatePatterns(experience);

    // Detect failure patterns (existing)
    if (!result.success) {
      await this.detectFailurePattern(experience);
    }

    // Calculate improvement (existing)
    const improvement = await this.calculateImprovement();

    return improvement;
  }

  /**
   * Persist experience and Q-values to database (NEW)
   */
  private async persistToDatabase(experience: TaskExperience): Promise<void> {
    // Persist experience
    const expSql = `
      INSERT INTO learning_history (
        experience_id, agent_id, task_id, task_type,
        state, action, reward, next_state, context
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.database!.run(expSql, [
      uuidv4(),
      this.agentId,
      experience.taskId,
      experience.taskType,
      JSON.stringify(experience.state),
      JSON.stringify(experience.action),
      experience.reward,
      JSON.stringify(experience.nextState),
      JSON.stringify({})
    ]);

    // Persist Q-values (batch update)
    const stateKey = this.encodeState(experience.state);
    const actionKey = this.encodeAction(experience.action);
    const qValue = this.qTable.get(stateKey)?.get(actionKey) || 0;

    const qSql = `
      INSERT OR REPLACE INTO q_values (
        agent_id, state_key, action_key, q_value,
        update_count, last_updated
      ) VALUES (
        ?, ?, ?, ?,
        COALESCE((SELECT update_count + 1 FROM q_values WHERE agent_id = ? AND state_key = ? AND action_key = ?), 1),
        CURRENT_TIMESTAMP
      )
    `;

    await this.database!.run(qSql, [
      this.agentId, stateKey, actionKey, qValue,
      this.agentId, stateKey, actionKey
    ]);
  }

  /**
   * Get learning analytics from database (NEW)
   */
  async getAnalytics(timeRange: string = '7d'): Promise<{
    totalExperiences: number;
    avgReward: number;
    successRate: number;
    learningTrend: Array<{ date: string; avgReward: number }>;
    topPatterns: LearnedPattern[];
  }> {
    if (!this.database) {
      throw new Error('Database required for analytics');
    }

    // Total experiences
    const totalResult = await this.database.get(
      'SELECT COUNT(*) as count FROM learning_history WHERE agent_id = ?',
      [this.agentId]
    );
    const totalExperiences = totalResult?.count || 0;

    // Average reward and success rate
    const statsResult = await this.database.get(
      `SELECT
        AVG(reward) as avg_reward,
        AVG(CASE WHEN reward > 0 THEN 1.0 ELSE 0.0 END) as success_rate
       FROM learning_history
       WHERE agent_id = ? AND timestamp >= datetime('now', '-${timeRange}')`,
      [this.agentId]
    );

    // Learning trend (daily aggregates)
    const trendRows = await this.database.all(
      `SELECT
        date(timestamp) as date,
        AVG(reward) as avg_reward
       FROM learning_history
       WHERE agent_id = ? AND timestamp >= datetime('now', '-${timeRange}')
       GROUP BY date(timestamp)
       ORDER BY date`,
      [this.agentId]
    );

    // Top patterns by success rate
    const patternRows = await this.database.all(
      `SELECT * FROM learned_patterns
       WHERE agent_id = ?
       ORDER BY confidence * success_rate DESC
       LIMIT 10`,
      [this.agentId]
    );

    return {
      totalExperiences,
      avgReward: statsResult?.avg_reward || 0,
      successRate: statsResult?.success_rate || 0,
      learningTrend: trendRows.map(row => ({
        date: row.date,
        avgReward: row.avg_reward
      })),
      topPatterns: patternRows.map(row => ({
        id: row.id,
        pattern: row.pattern,
        confidence: row.confidence,
        successRate: row.success_rate,
        usageCount: row.usage_count,
        contexts: JSON.parse(row.contexts),
        createdAt: new Date(row.created_at),
        lastUsedAt: new Date(row.last_used_at)
      }))
    };
  }
}
```

### 3.3 BaseAgent - Hook Integration

#### 3.3.1 Updated Lifecycle Hooks

```typescript
/**
 * BaseAgent with Learning System Integration
 *
 * Lifecycle:
 * 1. initialize() → Load patterns and Q-values
 * 2. onPreTask() → Retrieve patterns for reuse
 * 3. performTask() → Execute task
 * 4. onPostTask() → Store patterns, record learning
 * 5. onTaskError() → Record failure patterns
 */
export abstract class BaseAgent {
  protected learningEngine?: LearningEngine;
  protected performanceTracker?: PerformanceTracker;
  protected reasoningBank?: QEReasoningBank;
  protected database?: Database;

  /**
   * Initialize agent with learning system
   */
  async initialize(): Promise<void> {
    // Initialize database
    this.database = new Database(this.getDatabasePath());
    await this.database.initialize();

    // Initialize learning engine (with database)
    if (this.enableLearning) {
      this.learningEngine = new LearningEngine(
        this.agentId.toString(),
        this.memoryStore,
        this.learningConfig,
        this.database // Pass database
      );
      await this.learningEngine.initialize();
    }

    // Initialize reasoning bank (with database)
    this.reasoningBank = new QEReasoningBank({
      database: this.database
    });
    await this.reasoningBank.initialize();

    // Initialize performance tracker
    if (this.enableLearning) {
      this.performanceTracker = new PerformanceTracker(
        this.agentId.toString(),
        this.memoryStore
      );
      await this.performanceTracker.initialize();
    }

    // Initialize agent-specific components
    await this.initializeComponents();
  }

  /**
   * Pre-task hook: Retrieve relevant patterns
   */
  protected async onPreTask(data: { assignment: TaskAssignment }): Promise<void> {
    if (!this.reasoningBank) return;

    // Search for relevant patterns
    const context = this.extractPatternContext(data.assignment);
    const matches = await this.reasoningBank.findMatchingPatterns(context, 5);

    if (matches.length > 0) {
      this.logger.info(`Found ${matches.length} relevant patterns`, {
        patterns: matches.map(m => ({
          id: m.pattern.id,
          confidence: m.confidence,
          similarity: m.similarity
        }))
      });

      // Store patterns in task context for use in performTask
      await this.memoryStore.store(
        `task/${data.assignment.id}/patterns`,
        matches,
        { partition: 'task_context' }
      );
    }
  }

  /**
   * Post-task hook: Store patterns, record learning
   */
  protected async onPostTask(data: { assignment: TaskAssignment; result: any }): Promise<void> {
    const { assignment, result } = data;

    // Extract and store pattern (if applicable)
    if (this.reasoningBank && this.shouldExtractPattern(result)) {
      const pattern = await this.extractPattern(assignment, result);
      if (pattern) {
        await this.reasoningBank.storePattern(pattern);
        this.logger.info(`Stored new pattern: ${pattern.id}`);
      }
    }

    // Record usage of patterns (if used)
    const usedPatterns = await this.memoryStore.retrieve(
      `task/${assignment.id}/patterns`,
      { partition: 'task_context' }
    ) as PatternMatch[] | null;

    if (usedPatterns && usedPatterns.length > 0) {
      for (const match of usedPatterns) {
        await this.reasoningBank!.recordUsage(match.pattern.id, {
          agentId: this.agentId.toString(),
          taskId: assignment.id,
          success: result.success,
          executionTime: result.executionTime || 0,
          coverageAchieved: result.coverage
        });
      }
    }

    // Record learning
    if (this.learningEngine) {
      await this.learningEngine.learnFromExecution(
        assignment,
        result,
        undefined // No explicit feedback yet
      );
    }

    // Track performance
    if (this.performanceTracker) {
      await this.performanceTracker.recordMetric({
        metricType: 'task_execution',
        metricName: 'duration',
        metricValue: result.executionTime || 0,
        taskId: assignment.id
      });
    }
  }

  /**
   * Error hook: Record failure patterns
   */
  protected async onTaskError(data: { assignment: TaskAssignment; error: Error }): Promise<void> {
    // Store error in database
    if (this.database) {
      await this.database.run(
        `INSERT INTO failure_patterns (
          id, pattern, agent_id, contexts, confidence
        ) VALUES (?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          `${data.assignment.type}:error:${error.name}`,
          this.agentId.toString(),
          JSON.stringify([data.assignment.type]),
          0.5
        ]
      );
    }

    // Record in learning engine
    if (this.learningEngine) {
      await this.learningEngine.learnFromExecution(
        data.assignment,
        { success: false, error: error.message },
        undefined
      );
    }
  }

  /**
   * Extract pattern from task result (agent-specific)
   */
  protected abstract extractPattern(
    assignment: TaskAssignment,
    result: any
  ): Promise<TestPattern | null>;

  /**
   * Should we extract a pattern from this result?
   */
  protected shouldExtractPattern(result: any): boolean {
    return result.success && result.quality && result.quality > 0.8;
  }
}
```

---

## 4. Data Flow Architecture

### 4.1 Pattern Creation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Pattern Creation Flow                                            │
│ Target: <100ms end-to-end, <50ms p95 pattern matching           │
└─────────────────────────────────────────────────────────────────┘

1. Agent Executes Task
   ├─ TestGeneratorAgent.performTask()
   ├─ Generates test suite
   └─ Returns result with quality metrics

2. BaseAgent.onPostTask() Hook Triggered
   ├─ Checks if pattern extraction needed
   │  └─ result.success && result.quality > 0.8
   └─ Calls agent.extractPattern()

3. Agent Extracts Pattern
   ├─ TestGeneratorAgent.extractPattern()
   ├─ Analyzes generated test
   ├─ Extracts template and examples
   └─ Calculates initial confidence

4. Pattern Quality Scoring
   ├─ PatternQualityScorer.calculateQuality()
   ├─ Analyzes pattern completeness
   ├─ Checks code quality
   └─ Returns quality score (0-1)

5. Store in QEReasoningBank (In-Memory)
   ├─ QEReasoningBank.storePattern()
   ├─ Validates pattern
   ├─ Versions existing pattern (if update)
   ├─ Stores in patterns Map
   ├─ Updates indexes (category, framework, keywords)
   └─ Generates vector embedding

6. Persist to Database (NEW)
   ├─ QEReasoningBank.persistPattern()
   ├─ INSERT OR REPLACE INTO patterns (...)
   ├─ Database write: ~5-10ms
   └─ Transaction committed

7. Pattern Available for Reuse
   ├─ Indexed by framework, category, keywords
   ├─ Vector embedding cached
   └─ Ready for fast lookup (<50ms)

Total Time: ~60-80ms (pattern extraction + DB write)
```

### 4.2 Pattern Retrieval Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Pattern Retrieval Flow                                           │
│ Target: <50ms p95 for pattern matching                          │
└─────────────────────────────────────────────────────────────────┘

1. Agent Receives Task Assignment
   ├─ BaseAgent.executeTask()
   └─ Triggers onPreTask() hook

2. BaseAgent.onPreTask() Hook
   ├─ Extracts pattern context from task
   │  └─ {codeType, framework, language, keywords}
   └─ Searches for matching patterns

3. Check Cache (In-Memory)
   ├─ QEReasoningBank.findMatchingPatterns()
   ├─ Check similarityCache Map
   ├─ Cache hit: return cached results (~1ms)
   └─ Cache miss: proceed to search

4. Fast Indexed Lookup
   ├─ Query frameworkIndex Map
   ├─ Query keywordIndex Map
   ├─ Get candidate pattern IDs
   └─ Time: ~2-5ms (in-memory Map lookup)

5. Vector Similarity Scoring
   ├─ Generate query embedding
   ├─ Retrieve cached pattern vectors
   ├─ Calculate cosine similarity
   ├─ Hybrid scoring (60% vector + 40% rule-based)
   └─ Time: ~10-20ms (for 100 candidates)

6. Quality Filtering & Ranking
   ├─ Filter by minQuality threshold
   ├─ Calculate applicability score
   ├─ Sort by applicability
   └─ Time: ~5ms

7. Return Top Matches
   ├─ Slice to limit (default 10)
   ├─ Cache results for 5 minutes
   └─ Total time: ~20-30ms (p50), ~40-50ms (p95)

8. Store in Task Context
   ├─ memoryStore.store('task/{id}/patterns', matches)
   └─ Available to performTask()

Performance Breakdown:
- Cache hit: ~1ms ✅
- Cache miss + indexed search: ~20-30ms ✅
- Cache miss + full scan: ~40-50ms ✅
- Target: <50ms p95 ✅
```

### 4.3 Learning Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Q-Learning Flow                                                  │
│ Target: <100ms learning update, batch persistence               │
└─────────────────────────────────────────────────────────────────┘

1. Task Execution Completes
   ├─ BaseAgent.onPostTask()
   └─ Triggers learning engine

2. Extract Experience
   ├─ LearningEngine.extractExperience()
   ├─ State: {complexity, capabilities, resources}
   ├─ Action: {strategy, tools, parallelization}
   ├─ Reward: calculated from result
   └─ Time: ~5ms

3. Calculate Reward
   ├─ LearningEngine.calculateReward()
   ├─ Success/failure: ±1.0
   ├─ Execution time factor: 0-0.5
   ├─ Quality bonus: 0-0.5
   └─ Time: ~1ms

4. Update Q-Table (In-Memory)
   ├─ LearningEngine.updateQTable()
   ├─ Q(s,a) = Q(s,a) + α[r + γ*max(Q(s',a')) - Q(s,a)]
   ├─ Update Map<string, Map<string, number>>
   └─ Time: ~2ms

5. Store Experience (In-Memory)
   ├─ experiences.push(experience)
   └─ Time: <1ms

6. Periodic Database Persistence
   ├─ Every 10 experiences
   ├─ INSERT INTO learning_history (...)
   ├─ INSERT OR REPLACE INTO q_values (...)
   ├─ Batch write: ~20-30ms
   └─ Non-blocking (async)

7. Pattern Discovery
   ├─ Update learned_patterns map
   ├─ Calculate confidence and success rate
   └─ Time: ~5ms

8. Batch Update (Every 10 tasks)
   ├─ Re-train on recent batch
   ├─ Improve Q-value estimates
   └─ Time: ~50ms (background)

Total Per-Task Time: ~10-15ms (+ async persistence)
```

### 4.4 Analytics Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Analytics & Reporting Flow                                       │
│ Target: <500ms for dashboard queries                            │
└─────────────────────────────────────────────────────────────────┘

1. User Runs CLI Command
   ├─ aqe learn status --agent test-gen
   └─ CLI invokes LearningEngine.getAnalytics()

2. Query Database for Metrics
   ├─ SELECT COUNT(*) FROM learning_history
   ├─ SELECT AVG(reward), AVG(success) FROM learning_history
   ├─ SELECT date, AVG(reward) FROM learning_history GROUP BY date
   └─ Time: ~50-100ms (indexed queries)

3. Query Top Patterns
   ├─ SELECT * FROM learned_patterns ORDER BY confidence DESC
   └─ Time: ~20ms

4. Calculate Statistics
   ├─ Aggregate results
   ├─ Calculate trends
   └─ Time: ~10ms

5. Format and Display
   ├─ Render tables/charts
   └─ Time: ~50ms

Total Time: ~150-200ms ✅

Query Performance:
- Total experiences: ~10ms
- Avg reward: ~20ms (with date filter)
- Learning trend: ~50ms (GROUP BY date)
- Top patterns: ~20ms (indexed sort)
- Failure patterns: ~30ms
```

---

## 5. API Design

### 5.1 QEReasoningBank Public API

```typescript
/**
 * QEReasoningBank - Pattern Storage and Retrieval API
 */
export interface IQEReasoningBank {
  /**
   * Initialize pattern bank (load from database)
   * Must be called before any other operations
   */
  initialize(): Promise<void>;

  /**
   * Store a test pattern with quality scoring
   * @param pattern - Test pattern to store
   * @throws Error if pattern is invalid or database write fails
   */
  storePattern(pattern: TestPattern): Promise<void>;

  /**
   * Find matching patterns using hybrid search
   * @param context - Search context (framework, language, keywords)
   * @param limit - Maximum number of results (default 10)
   * @returns Ranked pattern matches
   */
  findMatchingPatterns(
    context: PatternSearchContext,
    limit?: number
  ): Promise<PatternMatch[]>;

  /**
   * Find patterns using flexible criteria
   * @param criteria - Search criteria (category, framework, tags, etc.)
   * @param limit - Maximum number of results
   * @returns Ranked pattern matches
   */
  findPattern(
    criteria: PatternSearchCriteria,
    limit?: number
  ): Promise<PatternMatch[]>;

  /**
   * Get pattern by ID
   * @param id - Pattern ID
   * @returns Pattern or null if not found
   */
  getPattern(id: string): Promise<TestPattern | null>;

  /**
   * Record pattern usage and update metrics
   * @param patternId - Pattern ID
   * @param context - Usage context (agent, task, success, etc.)
   */
  recordUsage(patternId: string, context: PatternUsageContext): Promise<void>;

  /**
   * Get pattern statistics
   * @returns Statistics including total patterns, avg quality, etc.
   */
  getStatistics(): Promise<PatternStatistics>;

  /**
   * Get performance metrics
   * @returns Performance metrics (latency, cache hit rate, etc.)
   */
  getPerformanceMetrics(): PerformanceMetrics;

  /**
   * Export patterns for sharing
   * @param filter - Optional filter criteria
   * @returns Array of patterns
   */
  exportPatterns(filter?: Partial<TestPattern>): TestPattern[];

  /**
   * Import patterns from another project
   * @param patterns - Patterns to import
   */
  importPatterns(patterns: TestPattern[]): Promise<void>;

  /**
   * Load patterns from registry file
   * @param registryPath - Path to registry JSON file
   * @returns Number of patterns loaded
   */
  loadFromRegistry(registryPath: string): Promise<number>;

  /**
   * Save patterns to registry file
   * @param registryPath - Path to save registry
   * @param filter - Optional filter criteria
   */
  saveToRegistry(registryPath: string, filter?: Partial<TestPattern>): Promise<void>;

  /**
   * Get version history for a pattern
   * @param patternId - Pattern ID
   * @returns Array of historical versions
   */
  getVersionHistory(patternId: string): Promise<TestPattern[]>;

  /**
   * Search patterns by tags
   * @param tags - Tags to search for
   * @returns Matching patterns sorted by relevance
   */
  searchByTags(tags: string[]): Promise<TestPattern[]>;
}

/**
 * Pattern search context
 */
export interface PatternSearchContext {
  codeType: string;
  framework?: string;
  language?: string;
  keywords?: string[];
  sourceCode?: string; // For code-based matching
}

/**
 * Pattern search criteria
 */
export interface PatternSearchCriteria {
  query?: string; // Full-text search query
  category?: TestPattern['category'];
  framework?: TestPattern['framework'];
  language?: TestPattern['language'];
  tags?: string[];
  minConfidence?: number;
  minQuality?: number;
}

/**
 * Pattern usage context
 */
export interface PatternUsageContext {
  agentId: string;
  taskId: string;
  success: boolean;
  executionTime: number;
  coverageAchieved?: number;
}

/**
 * Pattern statistics
 */
export interface PatternStatistics {
  totalPatterns: number;
  averageConfidence: number;
  averageSuccessRate: number;
  averageQuality: number;
  byCategory: Record<string, number>;
  byFramework: Record<string, number>;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  avgLookupTime: number; // milliseconds
  p95LookupTime: number; // milliseconds
  p99LookupTime: number; // milliseconds
  cacheHitRate: number; // percentage
  totalLookups: number;
}
```

### 5.2 LearningEngine Public API

```typescript
/**
 * LearningEngine - Q-Learning API
 */
export interface ILearningEngine {
  /**
   * Initialize learning engine (load from database)
   */
  initialize(): Promise<void>;

  /**
   * Learn from task execution
   * @param task - Task that was executed
   * @param result - Execution result
   * @param feedback - Optional user feedback
   * @returns Learning outcome with improvement metrics
   */
  learnFromExecution(
    task: any,
    result: any,
    feedback?: LearningFeedback
  ): Promise<LearningOutcome>;

  /**
   * Recommend best strategy for a given state
   * @param state - Current task state
   * @returns Strategy recommendation with confidence
   */
  recommendStrategy(state: TaskState): Promise<StrategyRecommendation>;

  /**
   * Get learned patterns
   * @returns Array of learned patterns sorted by confidence
   */
  getPatterns(): LearnedPattern[];

  /**
   * Get failure patterns
   * @returns Array of failure patterns sorted by frequency
   */
  getFailurePatterns(): FailurePattern[];

  /**
   * Get learning analytics
   * @param timeRange - Time range for analytics (e.g., '7d', '30d')
   * @returns Analytics including trends, top patterns, etc.
   */
  getAnalytics(timeRange?: string): Promise<LearningAnalytics>;

  /**
   * Enable Q-learning mode
   * @param config - Optional Q-learning configuration
   */
  enableQLearning(config?: Partial<QLearningConfig>): void;

  /**
   * Disable Q-learning mode
   */
  disableQLearning(): void;

  /**
   * Check if Q-learning is enabled
   */
  isQLearningEnabled(): boolean;

  /**
   * Get Q-learning statistics
   */
  getQLearningStats(): QLearningStatistics;

  /**
   * Get current exploration rate
   */
  getExplorationRate(): number;

  /**
   * Get total experiences
   */
  getTotalExperiences(): number;

  /**
   * Enable/disable learning
   * @param enabled - Whether learning is enabled
   */
  setEnabled(enabled: boolean): void;

  /**
   * Check if learning is enabled
   */
  isEnabled(): boolean;
}

/**
 * Learning outcome
 */
export interface LearningOutcome {
  improved: boolean;
  previousPerformance: number;
  newPerformance: number;
  improvementRate: number; // percentage
  confidence: number; // 0-1
  patterns: LearnedPattern[];
  timestamp: Date;
}

/**
 * Strategy recommendation
 */
export interface StrategyRecommendation {
  strategy: string;
  confidence: number; // 0-1
  expectedImprovement: number; // percentage
  reasoning: string;
  alternatives: Array<{
    strategy: string;
    confidence: number;
  }>;
}

/**
 * Learning analytics
 */
export interface LearningAnalytics {
  totalExperiences: number;
  avgReward: number;
  successRate: number;
  learningTrend: Array<{
    date: string;
    avgReward: number;
  }>;
  topPatterns: LearnedPattern[];
}

/**
 * Q-learning statistics
 */
export interface QLearningStatistics {
  enabled: boolean;
  stats?: {
    steps: number;
    episodes: number;
    tableSize: number;
    explorationRate: number;
    avgQValue: number;
    maxQValue: number;
    minQValue: number;
  };
}
```

### 5.3 CLI Command Structure

```typescript
/**
 * CLI Commands for Learning System and Pattern Bank
 */

// ============================================================================
// Pattern Commands
// ============================================================================

/**
 * List all patterns
 * Usage: aqe patterns list [options]
 */
interface PatternListOptions {
  framework?: string; // Filter by framework
  category?: string; // Filter by category
  limit?: number; // Max results (default 20)
  sortBy?: 'quality' | 'usage' | 'created'; // Sort order
}

/**
 * Search patterns
 * Usage: aqe patterns search <query> [options]
 */
interface PatternSearchOptions {
  framework?: string;
  category?: string;
  minQuality?: number;
  limit?: number;
}

/**
 * Show pattern details
 * Usage: aqe patterns show <pattern-id>
 */
interface PatternShowOptions {
  includeHistory?: boolean; // Show version history
  includeUsage?: boolean; // Show usage statistics
}

/**
 * Extract patterns from tests
 * Usage: aqe patterns extract <test-dir> [options]
 */
interface PatternExtractOptions {
  framework: string; // Test framework
  minQuality?: number; // Min quality threshold (default 0.7)
  dryRun?: boolean; // Don't save, just show what would be extracted
}

/**
 * Export patterns
 * Usage: aqe patterns export <output-file> [options]
 */
interface PatternExportOptions {
  framework?: string;
  category?: string;
  format?: 'json' | 'yaml'; // Output format
}

/**
 * Import patterns
 * Usage: aqe patterns import <input-file>
 */
interface PatternImportOptions {
  merge?: boolean; // Merge with existing (default: replace)
  dryRun?: boolean;
}

// ============================================================================
// Learning Commands
// ============================================================================

/**
 * Show learning status
 * Usage: aqe learn status [options]
 */
interface LearnStatusOptions {
  agent?: string; // Filter by agent type
  detailed?: boolean; // Show detailed metrics
}

/**
 * Show learning history
 * Usage: aqe learn history [options]
 */
interface LearnHistoryOptions {
  agent?: string;
  limit?: number; // Max experiences to show (default 50)
  timeRange?: string; // e.g., '7d', '30d'
  format?: 'table' | 'json'; // Output format
}

/**
 * Export learning data
 * Usage: aqe learn export <output-file> [options]
 */
interface LearnExportOptions {
  agent?: string;
  format?: 'json' | 'csv';
  includeQTable?: boolean; // Include Q-values
  includeExperiences?: boolean; // Include experience history
}

/**
 * Show learning analytics
 * Usage: aqe learn analytics [options]
 */
interface LearnAnalyticsOptions {
  agent?: string;
  timeRange?: string;
  chart?: boolean; // Show ASCII charts
}

// ============================================================================
// Improvement Commands
// ============================================================================

/**
 * Start continuous improvement loop
 * Usage: aqe improve start [options]
 */
interface ImproveStartOptions {
  agent?: string; // Run for specific agent
  interval?: number; // Check interval in minutes
}

/**
 * Check improvement status
 * Usage: aqe improve status
 */
interface ImproveStatusOptions {
  detailed?: boolean;
}

/**
 * Run single improvement cycle
 * Usage: aqe improve cycle [options]
 */
interface ImproveCycleOptions {
  agent?: string;
  tasks?: number; // Number of tasks to run
}

/**
 * Stop continuous improvement
 * Usage: aqe improve stop
 */
interface ImproveStopOptions {
  graceful?: boolean; // Wait for current cycle
}
```

---

## 6. Performance Architecture

### 6.1 Performance Targets

| Operation | Target Latency | Scaling |
|-----------|---------------|---------|
| Pattern lookup (cache hit) | <5ms | O(1) |
| Pattern lookup (cache miss) | <50ms (p95) | O(log n) |
| Pattern storage | <100ms | O(1) |
| Database write | <10ms | O(1) |
| Q-value update | <5ms | O(1) |
| Learning analytics query | <500ms | O(n) |
| Pattern import (100 patterns) | <2s | O(n) |

### 6.2 Caching Strategy

```typescript
/**
 * Multi-Level Caching Strategy
 */

// Level 1: In-Memory Pattern Cache (QEReasoningBank)
class PatternCache {
  private patterns: Map<string, TestPattern> = new Map();
  private similarityCache: Map<string, PatternMatch[]> = new Map();
  private vectorCache: Map<string, number[]> = new Map();

  // Cache TTL: 5 minutes for similarity results
  private cacheExpiryTime: number = 5 * 60 * 1000;
  private lastCacheCleanup: number = Date.now();

  /**
   * Get pattern (O(1) lookup)
   */
  get(id: string): TestPattern | undefined {
    return this.patterns.get(id);
  }

  /**
   * Get cached similarity results
   */
  getSimilarityResults(cacheKey: string): PatternMatch[] | undefined {
    return this.similarityCache.get(cacheKey);
  }

  /**
   * Cleanup expired cache entries
   */
  cleanupIfNeeded(): void {
    const now = Date.now();
    if (now - this.lastCacheCleanup > this.cacheExpiryTime) {
      this.similarityCache.clear();
      this.lastCacheCleanup = now;
    }
  }
}

// Level 2: Indexed Lookup (Multi-Index Strategy)
class IndexedLookup {
  private frameworkIndex: Map<string, Set<string>> = new Map();
  private keywordIndex: Map<string, Set<string>> = new Map();
  private categoryIndex: Map<string, Set<string>> = new Map();

  /**
   * Get candidate IDs using indexes (O(1) index lookup)
   * Returns candidate IDs in ~2-5ms for 1000+ patterns
   */
  getCandidates(context: PatternSearchContext): string[] {
    const candidates = new Set<string>();

    // Framework index (most specific)
    if (context.framework && this.frameworkIndex.has(context.framework)) {
      this.frameworkIndex.get(context.framework)!.forEach(id => candidates.add(id));
    }

    // Keyword index
    if (context.keywords) {
      for (const keyword of context.keywords) {
        if (this.keywordIndex.has(keyword.toLowerCase())) {
          this.keywordIndex.get(keyword.toLowerCase())!.forEach(id => candidates.add(id));
        }
      }
    }

    return Array.from(candidates);
  }
}

// Level 3: Database Query with Indexes
class DatabaseQuery {
  /**
   * Query patterns with optimized indexes
   * Uses framework, category, quality indexes for fast filtering
   */
  async query(criteria: PatternSearchCriteria): Promise<TestPattern[]> {
    // Leverages SQLite indexes:
    // - idx_patterns_framework
    // - idx_patterns_category
    // - idx_patterns_quality

    const sql = `
      SELECT * FROM patterns
      WHERE
        (? IS NULL OR framework = ?)
        AND (? IS NULL OR category = ?)
        AND (? IS NULL OR quality >= ?)
      ORDER BY quality DESC, usage_count DESC
      LIMIT ?
    `;

    // Query time: ~10-20ms for 1000+ patterns
    const rows = await this.database.all(sql, [
      criteria.framework, criteria.framework,
      criteria.category, criteria.category,
      criteria.minQuality, criteria.minQuality,
      criteria.limit || 10
    ]);

    return rows.map(row => this.deserializePattern(row));
  }
}
```

### 6.3 Batch Operations

```typescript
/**
 * Batch Operations for Performance
 */

class BatchOperations {
  private pendingWrites: Array<{ sql: string; params: any[] }> = [];
  private batchSize: number = 50;
  private flushInterval: number = 5000; // 5 seconds
  private lastFlush: number = Date.now();

  /**
   * Queue write operation for batch processing
   */
  queueWrite(sql: string, params: any[]): void {
    this.pendingWrites.push({ sql, params });

    // Auto-flush if batch size reached
    if (this.pendingWrites.length >= this.batchSize) {
      this.flush();
    }
  }

  /**
   * Flush pending writes to database
   * Uses transaction for atomicity and performance
   */
  async flush(): Promise<void> {
    if (this.pendingWrites.length === 0) return;

    const writes = this.pendingWrites.splice(0, this.pendingWrites.length);

    await this.database.exec('BEGIN TRANSACTION');

    try {
      for (const { sql, params } of writes) {
        await this.database.run(sql, params);
      }
      await this.database.exec('COMMIT');
    } catch (error) {
      await this.database.exec('ROLLBACK');
      throw error;
    }

    this.lastFlush = Date.now();
  }

  /**
   * Periodic flush (called from setInterval)
   */
  async periodicFlush(): Promise<void> {
    const now = Date.now();
    if (now - this.lastFlush >= this.flushInterval) {
      await this.flush();
    }
  }
}
```

### 6.4 Memory Management

```typescript
/**
 * Memory Management Strategy
 */

class MemoryManager {
  private maxMemoryBytes: number = 100 * 1024 * 1024; // 100MB
  private currentMemoryBytes: number = 0;

  /**
   * Check memory usage and trigger cleanup if needed
   */
  checkMemoryUsage(): void {
    this.currentMemoryBytes = this.calculateMemoryUsage();

    if (this.currentMemoryBytes > this.maxMemoryBytes) {
      this.cleanup();
    }
  }

  /**
   * Calculate current memory usage
   */
  private calculateMemoryUsage(): number {
    // In-memory patterns
    const patternsSize = JSON.stringify(
      Array.from(this.patterns.values())
    ).length;

    // Vector cache
    const vectorsSize = this.vectorCache.size * 512 * 4; // ~512 dims * 4 bytes/float

    // Experiences
    const experiencesSize = JSON.stringify(this.experiences).length;

    return patternsSize + vectorsSize + experiencesSize;
  }

  /**
   * Cleanup least-used items to free memory
   */
  private cleanup(): void {
    // Clear similarity cache
    this.similarityCache.clear();

    // Keep only recent experiences (last 1000)
    if (this.experiences.length > 1000) {
      this.experiences = this.experiences.slice(-1000);
    }

    // Remove least-used patterns (if memory still high)
    if (this.calculateMemoryUsage() > this.maxMemoryBytes) {
      this.removeLeastUsedPatterns(100);
    }
  }

  /**
   * Remove least-used patterns from cache
   * (They'll be reloaded from DB if needed)
   */
  private removeLeastUsedPatterns(count: number): void {
    const patterns = Array.from(this.patterns.values())
      .sort((a, b) => a.usageCount - b.usageCount)
      .slice(0, count);

    for (const pattern of patterns) {
      this.patterns.delete(pattern.id);
      this.vectorCache.delete(pattern.id);
    }
  }
}
```

---

## 7. Migration Strategy

### 7.1 Migration Phases

#### Phase 1: Database Schema (Week 1)

**Goal**: Add database tables without breaking existing functionality

**Steps**:
1. Create migration SQL file: `migrations/001_add_learning_tables.sql`
2. Add migration runner: `src/database/migrations/runMigration.ts`
3. Update `Database.ts` to run migrations on initialize
4. Test migration on clean database
5. Test migration on existing database (should add new tables)

**Verification**:
```bash
# Check tables exist
sqlite3 data/fleet.db ".tables"

# Expected output:
# patterns  pattern_usage  pattern_versions
# learning_history  q_values  learned_patterns  failure_patterns

# Check no data lost
sqlite3 data/fleet.db "SELECT COUNT(*) FROM agents"
```

#### Phase 2: QEReasoningBank Integration (Week 1-2)

**Goal**: Add database persistence to QEReasoningBank

**Steps**:
1. Add `database` constructor parameter (optional, backward compatible)
2. Add `initialize()` method to load patterns from database
3. Update `storePattern()` to persist to database
4. Update `recordUsage()` to write to pattern_usage table
5. Add `versionPattern()` to save to pattern_versions table
6. Test in-memory mode still works (no database)
7. Test database mode loads and persists correctly

**Backward Compatibility**:
```typescript
// Old usage (still works)
const reasoningBank = new QEReasoningBank();
await reasoningBank.storePattern(pattern); // In-memory only

// New usage
const reasoningBank = new QEReasoningBank({ database: db });
await reasoningBank.initialize(); // Load from DB
await reasoningBank.storePattern(pattern); // Persist to DB
```

#### Phase 3: LearningEngine Integration (Week 2)

**Goal**: Add database persistence to LearningEngine

**Steps**:
1. Add `database` constructor parameter (optional)
2. Add `loadFromDatabase()` method
3. Update `learnFromExecution()` to persist periodically
4. Add `persistToDatabase()` method (batched writes)
5. Add `getAnalytics()` method (query database)
6. Test memory-only mode still works
7. Test database mode persists and loads correctly

#### Phase 4: BaseAgent Integration (Week 2-3)

**Goal**: Wire up agents to use learning system

**Steps**:
1. Update `BaseAgent.initialize()` to pass database to components
2. Update `onPreTask()` to retrieve patterns
3. Update `onPostTask()` to store patterns and record learning
4. Update `onTaskError()` to record failure patterns
5. Test with TestGeneratorAgent (pattern extraction)
6. Test with CoverageAnalyzerAgent (learning from analysis)
7. Verify no breaking changes to existing agents

#### Phase 5: CLI Commands (Week 3)

**Goal**: Implement user-facing CLI commands

**Steps**:
1. Implement `aqe patterns list` command
2. Implement `aqe patterns search` command
3. Implement `aqe patterns show` command
4. Implement `aqe patterns extract` command
5. Implement `aqe learn status` command
6. Implement `aqe learn history` command
7. Implement `aqe learn analytics` command
8. Add comprehensive help text and examples

#### Phase 6: Testing & Documentation (Week 4)

**Goal**: Comprehensive testing and documentation

**Steps**:
1. Integration tests for full learning flow
2. Performance benchmarks (verify <50ms p95 latency)
3. Load testing (1000+ patterns)
4. Update README with accurate feature descriptions
5. Write architecture documentation (this document)
6. Write user guide for CLI commands
7. Create video tutorial (optional)

### 7.2 Rollout Plan

#### Development Environment

```bash
# 1. Merge architecture PR
git checkout main
git pull origin main

# 2. Create implementation branch
git checkout -b feature/learning-system-persistence

# 3. Implement Phase 1 (database schema)
npm run db:migrate

# 4. Run tests after each phase
npm run test:unit
npm run test:integration

# 5. Benchmark performance
npm run test:performance
```

#### Testing Environment

```bash
# 1. Deploy to test environment
npm run deploy:test

# 2. Run end-to-end tests
npm run test:e2e

# 3. Run load tests
npm run test:load

# 4. Verify no regressions
npm run test:regression
```

#### Production Rollout

```bash
# 1. Feature flag rollout
export AQE_LEARNING_ENABLED=true

# 2. Gradual rollout (10% → 50% → 100%)
aqe fleet config set learning_enabled true --rollout 10

# 3. Monitor metrics
aqe learn analytics --timeRange 24h

# 4. Full rollout (if no issues)
aqe fleet config set learning_enabled true --rollout 100
```

### 7.3 Rollback Plan

**If issues occur during rollout**:

```bash
# 1. Disable feature flag
export AQE_LEARNING_ENABLED=false

# 2. Revert to previous version
git revert <commit-sha>
npm run deploy:prod

# 3. Investigate issue
npm run debug:learning-system

# 4. Fix and re-deploy
git checkout -b hotfix/learning-system-issue
# ... make fixes ...
npm run deploy:prod
```

**Database Rollback**:

```sql
-- If migration needs to be reverted
DROP TABLE IF EXISTS patterns;
DROP TABLE IF EXISTS pattern_usage;
DROP TABLE IF EXISTS pattern_versions;
DROP TABLE IF EXISTS learning_history;
DROP TABLE IF EXISTS q_values;
DROP TABLE IF EXISTS learned_patterns;
DROP TABLE IF EXISTS failure_patterns;
DROP TABLE IF EXISTS patterns_fts;

-- Remove migration record
DELETE FROM schema_migrations WHERE version = '001_learning_system';
```

---

## 8. Risk Assessment

### 8.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Performance Degradation** | Medium | High | - Comprehensive benchmarking<br>- Caching strategy<br>- Indexed database queries<br>- Rollback plan |
| **Data Loss** | Low | Critical | - Database transactions<br>- Backup strategy<br>- Migration testing<br>- Version control |
| **Breaking Changes** | Medium | High | - Backward compatibility<br>- Optional parameters<br>- Feature flags<br>- Gradual rollout |
| **Memory Leaks** | Low | Medium | - Memory limits<br>- Periodic cleanup<br>- Memory profiling<br>- Monitoring |
| **Database Corruption** | Low | Critical | - SQLite integrity checks<br>- Regular backups<br>- Transaction isolation<br>- Error handling |

### 8.2 Risk Mitigation Strategies

#### Performance Degradation

**Detection**:
```typescript
// Performance monitoring
const performanceMetrics = reasoningBank.getPerformanceMetrics();

if (performanceMetrics.p95LookupTime > 50) {
  logger.warn('Pattern lookup latency exceeds target', {
    p95: performanceMetrics.p95LookupTime,
    cacheHitRate: performanceMetrics.cacheHitRate
  });
}
```

**Mitigation**:
- Multi-level caching (in-memory + database)
- Database indexes on frequently queried columns
- Batch operations for writes
- Lazy loading of patterns
- Periodic cache cleanup

#### Data Loss

**Prevention**:
```typescript
// Database transactions for atomicity
async function storePatternSafely(pattern: TestPattern): Promise<void> {
  await db.exec('BEGIN TRANSACTION');

  try {
    // Store pattern
    await db.run('INSERT INTO patterns (...) VALUES (...)', [...]);

    // Update indexes
    await db.run('INSERT INTO pattern_usage (...) VALUES (...)', [...]);

    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}
```

**Recovery**:
```bash
# Automated backups (cron job)
0 0 * * * sqlite3 data/fleet.db ".backup /backups/fleet-$(date +\%Y\%m\%d).db"

# Point-in-time recovery
sqlite3 data/fleet.db ".restore /backups/fleet-20250131.db"
```

#### Breaking Changes

**Backward Compatibility**:
```typescript
// Optional database parameter
constructor(config: {
  minQuality?: number;
  database?: Database; // Optional - defaults to in-memory mode
} = {}) {
  this.database = config.database;
  // ... rest of constructor
}

// Graceful degradation
async storePattern(pattern: TestPattern): Promise<void> {
  // Always store in memory (existing behavior)
  this.patterns.set(pattern.id, pattern);

  // Optionally persist to database (new behavior)
  if (this.database) {
    await this.persistPattern(pattern);
  }
}
```

### 8.3 Success Criteria

**Must Have** (v1.4.0):
- ✅ Patterns persist across process restarts
- ✅ Learning data survives agent restarts
- ✅ CLI commands functional: `aqe patterns list`, `aqe learn status`
- ✅ <50ms p95 latency for pattern matching
- ✅ No data loss on crash recovery
- ✅ Backward compatible with existing agents

**Should Have** (v1.4.1):
- ✅ Full CLI command suite implemented
- ✅ Learning analytics dashboard
- ✅ Pattern import/export functionality
- ✅ Performance dashboard in CLI
- ✅ Comprehensive test coverage (>90%)

**Nice to Have** (v1.5.0):
- ⚠️ Web UI for pattern browser
- ⚠️ Pattern marketplace for sharing
- ⚠️ Advanced analytics and visualizations
- ⚠️ Multi-project pattern sharing
- ⚠️ Cloud backup and sync

---

## 9. Implementation Roadmap

### 9.1 Sprint 1: Foundation (Week 1)

**Goal**: Database schema and migration infrastructure

**Tasks**:
1. ✅ Create migration SQL file
2. ✅ Implement migration runner
3. ✅ Update Database.ts with schema
4. ✅ Add schema validation tests
5. ✅ Test migration on clean/existing databases
6. ✅ Document migration process

**Deliverables**:
- `/migrations/001_add_learning_tables.sql`
- `/src/database/migrations/runMigration.ts`
- Unit tests for migration
- Migration documentation

**Success Metrics**:
- ✅ Migration runs without errors
- ✅ All tables created with correct schema
- ✅ Indexes created successfully
- ✅ No data loss from existing tables

### 9.2 Sprint 2: QEReasoningBank Integration (Week 2)

**Goal**: Add database persistence to pattern storage

**Tasks**:
1. ✅ Add database parameter to constructor
2. ✅ Implement `initialize()` method
3. ✅ Update `storePattern()` with persistence
4. ✅ Implement `persistPattern()` method
5. ✅ Implement `recordUsage()` tracking
6. ✅ Add `versionPattern()` functionality
7. ✅ Write integration tests
8. ✅ Performance benchmark tests

**Deliverables**:
- Updated `QEReasoningBank.ts`
- Integration tests
- Performance benchmarks
- API documentation

**Success Metrics**:
- ✅ Patterns load from database on initialize
- ✅ Patterns persist to database on store
- ✅ Usage tracked in pattern_usage table
- ✅ <100ms pattern storage time
- ✅ <50ms p95 pattern lookup time

### 9.3 Sprint 3: LearningEngine Integration (Week 3)

**Goal**: Add database persistence to Q-learning

**Tasks**:
1. ✅ Add database parameter to constructor
2. ✅ Implement `loadFromDatabase()` method
3. ✅ Update `learnFromExecution()` with persistence
4. ✅ Implement `persistToDatabase()` method
5. ✅ Add `getAnalytics()` query method
6. ✅ Implement batch persistence (every 10 experiences)
7. ✅ Write integration tests
8. ✅ Test cross-session learning

**Deliverables**:
- Updated `LearningEngine.ts`
- Integration tests
- Analytics queries
- Documentation

**Success Metrics**:
- ✅ Q-values load from database
- ✅ Experiences persist periodically
- ✅ Learning survives process restart
- ✅ <15ms per-task learning time
- ✅ <500ms analytics queries

### 9.4 Sprint 4: BaseAgent Integration (Week 4)

**Goal**: Wire up agents to use learning system

**Tasks**:
1. ✅ Update `BaseAgent.initialize()` method
2. ✅ Implement `onPreTask()` pattern retrieval
3. ✅ Implement `onPostTask()` pattern storage
4. ✅ Implement `onTaskError()` failure tracking
5. ✅ Update `TestGeneratorAgent` with pattern extraction
6. ✅ Test with 3+ agent types
7. ✅ Write end-to-end tests
8. ✅ Performance testing

**Deliverables**:
- Updated `BaseAgent.ts`
- Updated agent implementations
- End-to-end tests
- Performance benchmarks

**Success Metrics**:
- ✅ Agents load patterns before tasks
- ✅ Agents store patterns after tasks
- ✅ Learning recorded for all tasks
- ✅ No breaking changes to existing agents
- ✅ <200ms total overhead per task

### 9.5 Sprint 5: CLI Commands (Week 5)

**Goal**: Implement user-facing CLI commands

**Tasks**:
1. ✅ Implement `aqe patterns list` command
2. ✅ Implement `aqe patterns search` command
3. ✅ Implement `aqe patterns show` command
4. ✅ Implement `aqe patterns extract` command
5. ✅ Implement `aqe learn status` command
6. ✅ Implement `aqe learn history` command
7. ✅ Implement `aqe learn analytics` command
8. ✅ Add help text and examples
9. ✅ Write CLI tests

**Deliverables**:
- CLI command implementations
- Help text and documentation
- CLI tests
- User guide

**Success Metrics**:
- ✅ All commands functional
- ✅ Clear error messages
- ✅ Helpful documentation
- ✅ <2s command execution time

### 9.6 Sprint 6: Testing & Documentation (Week 6)

**Goal**: Comprehensive testing and release preparation

**Tasks**:
1. ✅ Write integration test suite
2. ✅ Write performance benchmark suite
3. ✅ Load testing (1000+ patterns)
4. ✅ Update README with accurate features
5. ✅ Write architecture documentation (this doc)
6. ✅ Write user guide for CLI
7. ✅ Create migration guide
8. ✅ Record demo video (optional)
9. ✅ Security audit
10. ✅ Release candidate testing

**Deliverables**:
- Integration test suite (>90% coverage)
- Performance benchmarks
- Architecture documentation
- User guide
- Migration guide
- Release notes

**Success Metrics**:
- ✅ >90% test coverage
- ✅ All performance targets met
- ✅ Zero critical bugs
- ✅ Documentation complete
- ✅ Ready for v1.4.0 release

---

## 10. Appendices

### Appendix A: SQL Schema Reference

**Complete SQL DDL**: See [Section 2](#2-database-schema-design)

### Appendix B: API Reference

**TypeScript Interfaces**: See [Section 5](#5-api-design)

### Appendix C: Performance Benchmarks

**Target Metrics**:
- Pattern lookup (cache hit): <5ms ✅
- Pattern lookup (cache miss): <50ms p95 ✅
- Pattern storage: <100ms ✅
- Database write: <10ms ✅
- Q-value update: <5ms ✅
- Analytics query: <500ms ✅

**Benchmark Suite**:
```bash
npm run benchmark:patterns
npm run benchmark:learning
npm run benchmark:integration
```

### Appendix D: Monitoring & Observability

**Key Metrics to Monitor**:
1. Pattern lookup latency (p50, p95, p99)
2. Cache hit rate
3. Database write latency
4. Memory usage
5. Learning improvement rate
6. Pattern quality distribution
7. Agent performance trends

**Monitoring Dashboard**:
```bash
aqe monitoring dashboard --live
```

### Appendix E: Troubleshooting Guide

**Common Issues**:

1. **Slow pattern matching**
   - Check cache hit rate: `aqe patterns stats`
   - Rebuild indexes: `aqe patterns reindex`
   - Verify database not corrupted: `sqlite3 data/fleet.db "PRAGMA integrity_check"`

2. **Memory usage high**
   - Check in-memory cache size: `aqe memory stats`
   - Cleanup cache: `aqe memory cleanup`
   - Reduce cache TTL in config

3. **Learning not improving**
   - Check exploration rate: `aqe learn status`
   - Verify Q-table size: `aqe learn stats`
   - Check reward calculations: `aqe learn history --detailed`

---

## Conclusion

This architecture provides a production-ready blueprint for implementing the Learning System and Pattern Bank with database persistence. The design prioritizes:

1. **Zero Data Loss**: All patterns and learning data persist to SQLite
2. **Performance**: <50ms p95 latency maintained through multi-level caching
3. **Backward Compatibility**: Optional database integration, no breaking changes
4. **Observability**: Full CLI commands for monitoring and analytics
5. **Scalability**: Supports 1000+ patterns with efficient indexing

The phased implementation plan (6 sprints, 6 weeks) provides a clear roadmap from database schema to production deployment, with comprehensive testing and documentation at each stage.

**Next Steps**:
1. Review and approve architecture
2. Create implementation tickets for Sprint 1
3. Begin development on `feature/learning-system-persistence` branch
4. Weekly progress reviews and adjustments

---

**Document Version**: 1.0
**Last Updated**: 2025-10-31
**Status**: ✅ Ready for Review
