# Learning System Implementation Guide

**Version**: 1.4.0
**Date**: 2025-10-31
**Audience**: Development Team

---

## Quick Start

This guide provides step-by-step instructions for implementing the Learning System and Pattern Bank architecture.

## Prerequisites

- Node.js 18+
- TypeScript 5.0+
- SQLite 3.35+
- Git

## Implementation Checklist

### Sprint 1: Database Schema (Week 1)

#### Task 1.1: Create Migration SQL

**File**: `migrations/001_add_learning_tables.sql`

```sql
-- Create patterns table
CREATE TABLE IF NOT EXISTS patterns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  framework TEXT NOT NULL,
  language TEXT NOT NULL,
  template TEXT NOT NULL,
  examples TEXT NOT NULL,
  confidence REAL NOT NULL,
  quality REAL,
  success_rate REAL NOT NULL DEFAULT 0.0,
  usage_count INTEGER NOT NULL DEFAULT 0,
  embedding TEXT,
  metadata TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes (see full SQL in architecture doc)
CREATE INDEX IF NOT EXISTS idx_patterns_framework ON patterns(framework);
-- ... (add all indexes)

-- Create other tables: pattern_usage, learning_history, q_values, etc.
-- (See Section 2 of LEARNING-SYSTEM-ARCHITECTURE.md)
```

**Tests**:
```typescript
// tests/database/migration.test.ts
describe('Database Migration', () => {
  it('should create all tables', async () => {
    const db = new Database(':memory:');
    await runMigration(db);

    const tables = await db.all(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );

    expect(tables.map(t => t.name)).toContain('patterns');
    expect(tables.map(t => t.name)).toContain('pattern_usage');
    expect(tables.map(t => t.name)).toContain('learning_history');
  });
});
```

**Verification**:
```bash
# Apply migration
npm run db:migrate

# Verify tables
sqlite3 data/fleet.db ".tables"
# Expected: patterns, pattern_usage, learning_history, q_values, ...

# Verify indexes
sqlite3 data/fleet.db ".indices patterns"
# Expected: idx_patterns_framework, idx_patterns_category, ...
```

---

#### Task 1.2: Implement Migration Runner

**File**: `src/database/migrations/runMigration.ts`

```typescript
import { Database } from '../../utils/Database';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function runMigrations(db: Database): Promise<void> {
  const logger = Logger.getInstance();

  // Create migrations table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Check if migration already applied
  const result = await db.get(
    "SELECT version FROM schema_migrations WHERE version = ?",
    ['001_learning_system']
  );

  if (result) {
    logger.info('Migration 001_learning_system already applied');
    return;
  }

  // Read migration SQL
  const migrationPath = join(__dirname, '../../../migrations/001_add_learning_tables.sql');
  const migrationSQL = readFileSync(migrationPath, 'utf-8');

  // Run migration
  logger.info('Applying migration 001_learning_system...');
  await db.exec(migrationSQL);

  // Record migration
  await db.run(
    "INSERT INTO schema_migrations (version) VALUES (?)",
    ['001_learning_system']
  );

  logger.info('Migration 001_learning_system applied successfully');
}
```

**Integration**:
```typescript
// src/utils/Database.ts
async initialize(): Promise<void> {
  // ... existing initialization ...

  // Run migrations (NEW)
  await runMigrations(this);

  this.isInitialized = true;
}
```

---

### Sprint 2: QEReasoningBank Integration (Week 2)

#### Task 2.1: Add Database Parameter

**File**: `src/reasoning/QEReasoningBank.ts`

```typescript
export class QEReasoningBank {
  // Existing fields
  private patterns: Map<string, TestPattern> = new Map();
  private patternIndex: Map<string, Set<string>> = new Map();
  // ...

  // NEW: Database integration
  private database?: Database;
  private isLoaded: boolean = false;

  constructor(config: {
    minQuality?: number;
    database?: Database; // NEW: optional database
  } = {}) {
    this.database = config.database;
    this.vectorSimilarity = new VectorSimilarity({ useIDF: true });
    this.qualityScorer = new PatternQualityScorer();
    this.minQuality = config.minQuality ?? 0.7;
    this.performanceMetrics = { /* ... */ };
  }
}
```

**Backward Compatibility**:
```typescript
// Old usage (still works)
const bank = new QEReasoningBank();
// In-memory only, no database

// New usage
const db = new Database('./data/fleet.db');
await db.initialize();
const bank = new QEReasoningBank({ database: db });
await bank.initialize(); // Loads patterns from DB
```

---

#### Task 2.2: Implement Initialize Method

```typescript
/**
 * Initialize ReasoningBank (load patterns from database)
 */
async initialize(): Promise<void> {
  if (!this.database || this.isLoaded) {
    return;
  }

  const startTime = performance.now();

  // Load patterns from database
  const rows = await this.database.all(
    'SELECT * FROM patterns ORDER BY created_at DESC'
  );

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
 * Deserialize pattern from database row
 */
private deserializePattern(row: DatabaseRow): TestPattern {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category as TestPattern['category'],
    framework: row.framework as TestPattern['framework'],
    language: row.language as TestPattern['language'],
    template: row.template,
    examples: JSON.parse(row.examples),
    confidence: row.confidence,
    usageCount: row.usage_count,
    successRate: row.success_rate,
    quality: row.quality,
    metadata: JSON.parse(row.metadata)
  };
}
```

---

#### Task 2.3: Update storePattern Method

```typescript
async storePattern(pattern: TestPattern): Promise<void> {
  // Validate pattern (existing logic)
  this.validatePattern(pattern);

  // Calculate quality if needed (existing logic)
  if (pattern.quality === undefined) {
    pattern.quality = this.qualityScorer.calculateQuality({
      id: pattern.id,
      name: pattern.name,
      code: pattern.examples[0] || pattern.template,
      template: pattern.template,
      description: pattern.description,
      tags: pattern.metadata.tags,
      usageCount: pattern.usageCount,
      metadata: { successRate: pattern.successRate }
    }).overall;
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
```

**Tests**:
```typescript
describe('QEReasoningBank Database Integration', () => {
  let db: Database;
  let bank: QEReasoningBank;

  beforeEach(async () => {
    db = new Database(':memory:');
    await db.initialize();
    bank = new QEReasoningBank({ database: db });
    await bank.initialize();
  });

  it('should persist pattern to database', async () => {
    const pattern: TestPattern = {
      id: 'test-1',
      name: 'Test Pattern',
      description: 'Test description',
      category: 'unit',
      framework: 'jest',
      language: 'typescript',
      template: 'test template',
      examples: ['example 1'],
      confidence: 0.9,
      usageCount: 0,
      successRate: 1.0,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        version: '1.0.0',
        tags: ['test']
      }
    };

    await bank.storePattern(pattern);

    // Verify in database
    const row = await db.get('SELECT * FROM patterns WHERE id = ?', ['test-1']);
    expect(row).toBeDefined();
    expect(row.name).toBe('Test Pattern');
  });

  it('should load patterns on initialize', async () => {
    // Insert pattern directly
    await db.run(`
      INSERT INTO patterns (id, name, description, category, framework, language, template, examples, confidence, success_rate, usage_count, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'test-2', 'Loaded Pattern', 'desc', 'unit', 'jest', 'typescript',
      'template', '["ex1"]', 0.8, 1.0, 0, '{"createdAt":"2025-01-01T00:00:00Z","updatedAt":"2025-01-01T00:00:00Z","version":"1.0.0","tags":[]}'
    ]);

    // Create new bank and initialize
    const bank2 = new QEReasoningBank({ database: db });
    await bank2.initialize();

    const loaded = await bank2.getPattern('test-2');
    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe('Loaded Pattern');
  });
});
```

---

### Sprint 3: LearningEngine Integration (Week 3)

#### Task 3.1: Add Database Parameter

**File**: `src/learning/LearningEngine.ts`

```typescript
export class LearningEngine {
  // Existing fields
  private qTable: Map<string, Map<string, number>>;
  private experiences: TaskExperience[];
  // ...

  // NEW: Database integration
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
    this.taskCount = 0;
  }
}
```

---

#### Task 3.2: Implement loadFromDatabase

```typescript
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

  const loadTime = performance.now() - startTime;
  this.logger.info(`LearningEngine: Loaded ${qRows.length} Q-values, ${expRows.length} experiences in ${loadTime.toFixed(2)}ms`);
}
```

---

#### Task 3.3: Update learnFromExecution

```typescript
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

  // Increment task count
  this.taskCount++;

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
```

**Tests**:
```typescript
describe('LearningEngine Database Integration', () => {
  it('should persist experiences to database', async () => {
    const db = new Database(':memory:');
    await db.initialize();

    const engine = new LearningEngine(
      'test-agent',
      memoryStore,
      {},
      db
    );
    await engine.initialize();

    // Learn from 10 experiences (triggers persistence)
    for (let i = 0; i < 10; i++) {
      await engine.learnFromExecution(
        { id: `task-${i}`, type: 'test' },
        { success: true, executionTime: 100 }
      );
    }

    // Verify in database
    const rows = await db.all('SELECT * FROM learning_history WHERE agent_id = ?', ['test-agent']);
    expect(rows.length).toBeGreaterThan(0);
  });
});
```

---

### Sprint 4: BaseAgent Integration (Week 4)

#### Task 4.1: Update BaseAgent.initialize

**File**: `src/agents/BaseAgent.ts`

```typescript
async initialize(): Promise<void> {
  // Initialize database (NEW)
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
```

---

#### Task 4.2: Implement onPreTask Hook

```typescript
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

    // Store patterns in task context
    await this.memoryStore.store(
      `task/${data.assignment.id}/patterns`,
      matches,
      { partition: 'task_context' }
    );
  }
}

/**
 * Extract pattern context from task assignment
 */
protected extractPatternContext(assignment: TaskAssignment): PatternSearchContext {
  return {
    codeType: 'test',
    framework: assignment.requirements?.framework || 'jest',
    language: assignment.requirements?.language || 'typescript',
    keywords: this.extractKeywords(assignment)
  };
}

/**
 * Extract keywords from task assignment
 */
protected extractKeywords(assignment: TaskAssignment): string[] {
  const keywords: string[] = [];

  // Extract from task type
  keywords.push(assignment.type);

  // Extract from task name
  const nameWords = assignment.name.toLowerCase().split(/\s+/);
  keywords.push(...nameWords.filter(w => w.length > 3));

  return keywords;
}
```

---

#### Task 4.3: Implement onPostTask Hook

```typescript
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
      undefined
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
 * Should we extract a pattern from this result?
 */
protected shouldExtractPattern(result: any): boolean {
  return result.success && result.quality && result.quality > 0.8;
}

/**
 * Extract pattern from task result (agent-specific, must be implemented by subclasses)
 */
protected abstract extractPattern(
  assignment: TaskAssignment,
  result: any
): Promise<TestPattern | null>;
```

---

### Sprint 5: CLI Commands (Week 5)

#### Task 5.1: Implement Pattern Commands

**File**: `src/cli/commands/patterns.ts`

```typescript
import { Command } from 'commander';
import { Database } from '../../utils/Database';
import { QEReasoningBank } from '../../reasoning/QEReasoningBank';

export function registerPatternCommands(program: Command): void {
  const patterns = program
    .command('patterns')
    .description('Manage test patterns');

  // List patterns
  patterns
    .command('list')
    .description('List all patterns')
    .option('-f, --framework <framework>', 'Filter by framework')
    .option('-c, --category <category>', 'Filter by category')
    .option('-l, --limit <limit>', 'Maximum results', '20')
    .action(async (options) => {
      const db = new Database('./data/fleet.db');
      await db.initialize();

      const bank = new QEReasoningBank({ database: db });
      await bank.initialize();

      const patterns = await bank.findPattern({
        framework: options.framework,
        category: options.category
      }, parseInt(options.limit));

      console.table(patterns.map(m => ({
        ID: m.pattern.id,
        Name: m.pattern.name,
        Framework: m.pattern.framework,
        Category: m.pattern.category,
        Quality: (m.pattern.quality! * 100).toFixed(1) + '%',
        'Success Rate': (m.pattern.successRate * 100).toFixed(1) + '%',
        'Usage Count': m.pattern.usageCount
      })));

      await db.close();
    });

  // Search patterns
  patterns
    .command('search <query>')
    .description('Search patterns')
    .option('-f, --framework <framework>', 'Filter by framework')
    .option('-l, --limit <limit>', 'Maximum results', '10')
    .action(async (query, options) => {
      const db = new Database('./data/fleet.db');
      await db.initialize();

      const bank = new QEReasoningBank({ database: db });
      await bank.initialize();

      const matches = await bank.findPattern({
        query: query,
        framework: options.framework
      }, parseInt(options.limit));

      console.log(`\nFound ${matches.length} matching patterns:\n`);

      for (const match of matches) {
        console.log(`${match.pattern.name} (${match.pattern.framework})`);
        console.log(`  ID: ${match.pattern.id}`);
        console.log(`  Confidence: ${(match.confidence * 100).toFixed(1)}%`);
        console.log(`  Similarity: ${(match.similarity * 100).toFixed(1)}%`);
        console.log(`  Quality: ${(match.pattern.quality! * 100).toFixed(1)}%`);
        console.log();
      }

      await db.close();
    });

  // Show pattern details
  patterns
    .command('show <pattern-id>')
    .description('Show pattern details')
    .action(async (patternId) => {
      const db = new Database('./data/fleet.db');
      await db.initialize();

      const bank = new QEReasoningBank({ database: db });
      await bank.initialize();

      const pattern = await bank.getPattern(patternId);

      if (!pattern) {
        console.error(`Pattern not found: ${patternId}`);
        process.exit(1);
      }

      console.log('\nPattern Details:\n');
      console.log(`ID: ${pattern.id}`);
      console.log(`Name: ${pattern.name}`);
      console.log(`Description: ${pattern.description}`);
      console.log(`Framework: ${pattern.framework}`);
      console.log(`Category: ${pattern.category}`);
      console.log(`Language: ${pattern.language}`);
      console.log(`Quality: ${(pattern.quality! * 100).toFixed(1)}%`);
      console.log(`Success Rate: ${(pattern.successRate * 100).toFixed(1)}%`);
      console.log(`Usage Count: ${pattern.usageCount}`);
      console.log(`\nTemplate:\n`);
      console.log(pattern.template);

      await db.close();
    });
}
```

---

#### Task 5.2: Implement Learning Commands

**File**: `src/cli/commands/learn.ts`

```typescript
import { Command } from 'commander';
import { Database } from '../../utils/Database';
import { LearningEngine } from '../../learning/LearningEngine';
import { SwarmMemoryManager } from '../../core/memory/SwarmMemoryManager';

export function registerLearnCommands(program: Command): void {
  const learn = program
    .command('learn')
    .description('Manage learning system');

  // Learning status
  learn
    .command('status')
    .description('Show learning status')
    .option('-a, --agent <agent>', 'Filter by agent type')
    .action(async (options) => {
      const db = new Database('./data/fleet.db');
      await db.initialize();

      const memoryStore = new SwarmMemoryManager();

      const agentId = options.agent || 'test-generator';
      const engine = new LearningEngine(agentId, memoryStore, {}, db);
      await engine.initialize();

      const stats = engine.getQLearningStats();
      const totalExperiences = engine.getTotalExperiences();

      console.log('\nLearning System Status:\n');
      console.log(`Agent: ${agentId}`);
      console.log(`Total Experiences: ${totalExperiences}`);
      console.log(`Q-Learning Enabled: ${stats.enabled ? 'Yes' : 'No'}`);

      if (stats.enabled && stats.stats) {
        console.log(`Exploration Rate: ${(stats.stats.explorationRate * 100).toFixed(1)}%`);
        console.log(`Q-Table Size: ${stats.stats.tableSize} entries`);
        console.log(`Avg Q-Value: ${stats.stats.avgQValue.toFixed(3)}`);
      }

      await db.close();
    });

  // Learning analytics
  learn
    .command('analytics')
    .description('Show learning analytics')
    .option('-a, --agent <agent>', 'Filter by agent type')
    .option('-t, --timerange <range>', 'Time range (7d, 30d)', '7d')
    .action(async (options) => {
      const db = new Database('./data/fleet.db');
      await db.initialize();

      const memoryStore = new SwarmMemoryManager();

      const agentId = options.agent || 'test-generator';
      const engine = new LearningEngine(agentId, memoryStore, {}, db);
      await engine.initialize();

      const analytics = await engine.getAnalytics(options.timerange);

      console.log('\nLearning Analytics:\n');
      console.log(`Total Experiences: ${analytics.totalExperiences}`);
      console.log(`Average Reward: ${analytics.avgReward.toFixed(3)}`);
      console.log(`Success Rate: ${(analytics.successRate * 100).toFixed(1)}%`);
      console.log('\nLearning Trend:');

      for (const point of analytics.learningTrend) {
        console.log(`  ${point.date}: ${point.avgReward.toFixed(3)}`);
      }

      console.log('\nTop Patterns:');
      for (const pattern of analytics.topPatterns.slice(0, 5)) {
        console.log(`  ${pattern.pattern}: ${(pattern.confidence * 100).toFixed(1)}% confidence`);
      }

      await db.close();
    });
}
```

---

## Testing Guide

### Unit Tests

```bash
# Run all unit tests
npm run test:unit

# Run specific test suite
npm test src/reasoning/QEReasoningBank.test.ts
npm test src/learning/LearningEngine.test.ts
```

### Integration Tests

```bash
# Run integration tests
npm run test:integration

# Test full learning flow
npm test tests/integration/learning-flow.test.ts
```

### Performance Benchmarks

```bash
# Run performance benchmarks
npm run benchmark:patterns
npm run benchmark:learning

# Expected results:
# - Pattern lookup (cache hit): <5ms ✅
# - Pattern lookup (cache miss): <50ms p95 ✅
# - Pattern storage: <100ms ✅
# - Learning update: <15ms ✅
```

---

## Debugging Guide

### Enable Debug Logging

```typescript
// In your code
import { Logger } from './utils/Logger';

const logger = Logger.getInstance();
logger.setLevel('debug'); // Enable debug logs
```

### Database Inspection

```bash
# Inspect database tables
sqlite3 data/fleet.db

# List all patterns
sqlite> SELECT id, name, framework, quality FROM patterns LIMIT 10;

# Check Q-values
sqlite> SELECT agent_id, COUNT(*) as count FROM q_values GROUP BY agent_id;

# View recent experiences
sqlite> SELECT task_type, reward, timestamp FROM learning_history ORDER BY timestamp DESC LIMIT 20;
```

### Performance Profiling

```typescript
// Measure pattern lookup time
const startTime = performance.now();
const matches = await bank.findMatchingPatterns(context, 10);
const duration = performance.now() - startTime;

console.log(`Pattern lookup: ${duration.toFixed(2)}ms`);

// Get performance metrics
const metrics = bank.getPerformanceMetrics();
console.log('Performance Metrics:', metrics);
```

---

## Common Issues & Solutions

### Issue 1: Slow Pattern Matching

**Symptom**: Pattern lookup takes >100ms

**Solution**:
1. Check cache hit rate: `bank.getPerformanceMetrics().cacheHitRate`
2. If low (<70%), increase cache TTL
3. Verify indexes exist: `sqlite3 data/fleet.db ".indices patterns"`
4. Rebuild indexes: `aqe patterns reindex`

### Issue 2: Database Locked

**Symptom**: `SQLITE_BUSY: database is locked`

**Solution**:
1. Enable WAL mode: `PRAGMA journal_mode=WAL`
2. Reduce concurrent writes
3. Use batch operations for bulk inserts

### Issue 3: Memory Usage High

**Symptom**: Process memory >500MB

**Solution**:
1. Check in-memory cache size
2. Reduce cache TTL (default 5 minutes)
3. Limit pattern count: `aqe patterns cleanup --keep 1000`

---

## Next Steps

1. ✅ Complete Sprint 1 (Database Schema)
2. ✅ Complete Sprint 2 (QEReasoningBank)
3. ✅ Complete Sprint 3 (LearningEngine)
4. ✅ Complete Sprint 4 (BaseAgent)
5. ✅ Complete Sprint 5 (CLI Commands)
6. ✅ Complete Sprint 6 (Testing & Docs)

---

## References

- **Full Architecture**: [LEARNING-SYSTEM-ARCHITECTURE.md](./LEARNING-SYSTEM-ARCHITECTURE.md)
- **Architecture Summary**: [ARCHITECTURE-SUMMARY.md](./ARCHITECTURE-SUMMARY.md)
- **Visual Diagrams**: [ARCHITECTURE-DIAGRAMS.md](./ARCHITECTURE-DIAGRAMS.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-31
**Status**: ✅ Ready for Development
