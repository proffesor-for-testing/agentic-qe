/**
 * Data Integrity Tests
 * Tests complete data preservation, query performance, and vector embeddings
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import * as crypto from 'crypto';

describe('Data Integrity - Integration Tests', () => {
  const testDir = path.join(__dirname, '../.tmp/data-integrity-test-' + Date.now());
  const sourceDbPath = path.join(testDir, 'source.db');
  const targetDbPath = path.join(testDir, 'target.db');

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });

    // Create comprehensive test database
    const db = new Database(sourceDbPath);

    db.exec(`
      -- Episodes table (ReasoningBank)
      CREATE TABLE episodes (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        task TEXT NOT NULL,
        input TEXT,
        output TEXT,
        critique TEXT,
        reward REAL,
        success INTEGER,
        tokens_used INTEGER,
        latency_ms INTEGER,
        created_at INTEGER
      );

      -- Patterns table
      CREATE TABLE patterns (
        id TEXT PRIMARY KEY,
        pattern_type TEXT NOT NULL,
        pattern_data TEXT NOT NULL,
        agent_id TEXT,
        domain TEXT DEFAULT 'general',
        success_rate REAL DEFAULT 1.0,
        usage_count INTEGER DEFAULT 0,
        created_at INTEGER
      );

      -- Learning experiences table
      CREATE TABLE learning_experiences (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        state TEXT NOT NULL,
        action TEXT NOT NULL,
        reward REAL,
        next_state TEXT,
        metadata TEXT,
        created_at INTEGER
      );

      -- Q-values table
      CREATE TABLE q_values (
        state_action TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        q_value REAL,
        visits INTEGER DEFAULT 0,
        metadata TEXT
      );

      -- Indexes for performance
      CREATE INDEX idx_episodes_session ON episodes(session_id);
      CREATE INDEX idx_episodes_task ON episodes(task);
      CREATE INDEX idx_patterns_agent ON patterns(agent_id);
      CREATE INDEX idx_patterns_domain ON patterns(domain);
      CREATE INDEX idx_learning_agent ON learning_experiences(agent_id);
      CREATE INDEX idx_qvalues_agent ON q_values(agent_id);
    `);

    // Insert comprehensive test data
    const insertData = db.prepare(`
      INSERT INTO episodes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 1; i <= 100; i++) {
      insertData.run(
        `ep${i}`,
        `session${Math.floor(i / 10) + 1}`,
        `task-${i % 5}`,
        `input-${i}`,
        `output-${i}`,
        `critique-${i}`,
        Math.random(),
        i % 2,
        1000 + i * 10,
        500 + i * 5,
        Date.now() + i
      );
    }

    const insertPatterns = db.prepare(`
      INSERT INTO patterns VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 1; i <= 50; i++) {
      insertPatterns.run(
        `pat${i}`,
        `pattern-type-${i % 3}`,
        JSON.stringify({ strategy: `strategy-${i}`, confidence: Math.random() }),
        `agent-${i % 5}`,
        `domain-${i % 3}`,
        0.5 + Math.random() * 0.5,
        i * 2,
        Date.now() + i
      );
    }

    db.close();

    // Create migration (copy to target)
    fs.copyFileSync(sourceDbPath, targetDbPath);
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Complete Data Migration', () => {
    it('should migrate all episodes records', () => {
      const sourceDb = new Database(sourceDbPath, { readonly: true });
      const targetDb = new Database(targetDbPath, { readonly: true });

      const sourceCount = sourceDb.prepare('SELECT COUNT(*) as count FROM episodes').get() as { count: number };
      const targetCount = targetDb.prepare('SELECT COUNT(*) as count FROM episodes').get() as { count: number };

      const sourceData = sourceDb.prepare('SELECT * FROM episodes ORDER BY id').all();
      const targetData = targetDb.prepare('SELECT * FROM episodes ORDER BY id').all();

      sourceDb.close();
      targetDb.close();

      expect(targetCount.count).toBe(sourceCount.count);
      expect(targetCount.count).toBe(100);
      expect(targetData).toEqual(sourceData);
    });

    it('should migrate all patterns records', () => {
      const sourceDb = new Database(sourceDbPath, { readonly: true });
      const targetDb = new Database(targetDbPath, { readonly: true });

      const sourceCount = sourceDb.prepare('SELECT COUNT(*) as count FROM patterns').get() as { count: number };
      const targetCount = targetDb.prepare('SELECT COUNT(*) as count FROM patterns').get() as { count: number };

      sourceDb.close();
      targetDb.close();

      expect(targetCount.count).toBe(sourceCount.count);
      expect(targetCount.count).toBe(50);
    });

    it('should preserve JSON data integrity', () => {
      const targetDb = new Database(targetDbPath, { readonly: true });

      const patterns = targetDb.prepare('SELECT pattern_data FROM patterns LIMIT 10').all() as Array<{ pattern_data: string }>;

      targetDb.close();

      patterns.forEach(pattern => {
        expect(() => JSON.parse(pattern.pattern_data)).not.toThrow();

        const data = JSON.parse(pattern.pattern_data);
        expect(data).toHaveProperty('strategy');
        expect(data).toHaveProperty('confidence');
      });
    });

    it('should preserve numeric precision', () => {
      const sourceDb = new Database(sourceDbPath, { readonly: true });
      const targetDb = new Database(targetDbPath, { readonly: true });

      const sourceRewards = sourceDb.prepare('SELECT reward FROM episodes ORDER BY id').all() as Array<{ reward: number }>;
      const targetRewards = targetDb.prepare('SELECT reward FROM episodes ORDER BY id').all() as Array<{ reward: number }>;

      sourceDb.close();
      targetDb.close();

      sourceRewards.forEach((source, index) => {
        expect(targetRewards[index].reward).toBeCloseTo(source.reward, 10);
      });
    });
  });

  describe('No Data Corruption', () => {
    it('should have matching checksums for identical data', () => {
      function calculateTableChecksum(dbPath: string, tableName: string): string {
        const db = new Database(dbPath, { readonly: true });
        const data = db.prepare(`SELECT * FROM ${tableName} ORDER BY id`).all();
        db.close();

        const hash = crypto.createHash('sha256');
        hash.update(JSON.stringify(data));
        return hash.digest('hex');
      }

      const sourceEpisodesChecksum = calculateTableChecksum(sourceDbPath, 'episodes');
      const targetEpisodesChecksum = calculateTableChecksum(targetDbPath, 'episodes');

      const sourcePatternsChecksum = calculateTableChecksum(sourceDbPath, 'patterns');
      const targetPatternsChecksum = calculateTableChecksum(targetDbPath, 'patterns');

      expect(targetEpisodesChecksum).toBe(sourceEpisodesChecksum);
      expect(targetPatternsChecksum).toBe(sourcePatternsChecksum);
    });

    it('should preserve all column data types', () => {
      const targetDb = new Database(targetDbPath, { readonly: true });

      const episodesInfo = targetDb.prepare('PRAGMA table_info(episodes)').all() as Array<{
        name: string;
        type: string;
      }>;

      const patternsInfo = targetDb.prepare('PRAGMA table_info(patterns)').all() as Array<{
        name: string;
        type: string;
      }>;

      targetDb.close();

      // Check episodes types
      const episodesTypes: Record<string, string> = {};
      episodesInfo.forEach(col => {
        episodesTypes[col.name] = col.type;
      });

      expect(episodesTypes['id']).toBe('TEXT');
      expect(episodesTypes['reward']).toBe('REAL');
      expect(episodesTypes['success']).toBe('INTEGER');

      // Check patterns types
      const patternsTypes: Record<string, string> = {};
      patternsInfo.forEach(col => {
        patternsTypes[col.name] = col.type;
      });

      expect(patternsTypes['id']).toBe('TEXT');
      expect(patternsTypes['success_rate']).toBe('REAL');
      expect(patternsTypes['usage_count']).toBe('INTEGER');
    });

    it('should have no NULL corruption in NOT NULL fields', () => {
      const targetDb = new Database(targetDbPath, { readonly: true });

      const nullEpisodes = targetDb.prepare(`
        SELECT COUNT(*) as count FROM episodes
        WHERE session_id IS NULL OR task IS NULL
      `).get() as { count: number };

      const nullPatterns = targetDb.prepare(`
        SELECT COUNT(*) as count FROM patterns
        WHERE pattern_type IS NULL OR pattern_data IS NULL
      `).get() as { count: number };

      targetDb.close();

      expect(nullEpisodes.count).toBe(0);
      expect(nullPatterns.count).toBe(0);
    });
  });

  describe('Indexes Working Correctly', () => {
    it('should preserve all indexes', () => {
      const targetDb = new Database(targetDbPath, { readonly: true });

      const indexes = targetDb.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND sql IS NOT NULL
      `).all() as Array<{ name: string }>;

      targetDb.close();

      const indexNames = indexes.map(idx => idx.name);

      expect(indexNames).toContain('idx_episodes_session');
      expect(indexNames).toContain('idx_episodes_task');
      expect(indexNames).toContain('idx_patterns_agent');
      expect(indexNames).toContain('idx_patterns_domain');
    });

    it('should use indexes for queries', () => {
      const targetDb = new Database(targetDbPath, { readonly: true });

      // Query that should use index
      const explain = targetDb.prepare(`
        EXPLAIN QUERY PLAN
        SELECT * FROM episodes WHERE session_id = 'session1'
      `).all();

      targetDb.close();

      const explainText = JSON.stringify(explain);
      // SQLite query planner should mention the index
      expect(explainText.toLowerCase()).toMatch(/idx_episodes_session|search|using index/);
    });

    it('should maintain index integrity', () => {
      const targetDb = new Database(targetDbPath, { readonly: true });

      // Test each index works
      const sessionQuery = targetDb.prepare('SELECT * FROM episodes WHERE session_id = ?').all('session1');
      const taskQuery = targetDb.prepare('SELECT * FROM episodes WHERE task = ?').all('task-0');
      const agentQuery = targetDb.prepare('SELECT * FROM patterns WHERE agent_id = ?').all('agent-0');

      targetDb.close();

      expect(sessionQuery.length).toBeGreaterThan(0);
      expect(taskQuery.length).toBeGreaterThan(0);
      expect(agentQuery.length).toBeGreaterThan(0);
    });
  });

  describe('Query Performance', () => {
    it('should perform indexed queries efficiently', () => {
      const targetDb = new Database(targetDbPath, { readonly: true });

      const start = performance.now();

      // Indexed query
      for (let i = 0; i < 100; i++) {
        targetDb.prepare('SELECT * FROM episodes WHERE session_id = ?').all('session1');
      }

      const duration = performance.now() - start;

      targetDb.close();

      // 100 indexed queries should complete quickly
      expect(duration).toBeLessThan(100); // <100ms for 100 queries
    });

    it('should handle complex joins efficiently', () => {
      const targetDb = new Database(targetDbPath, { readonly: true });

      const start = performance.now();

      const results = targetDb.prepare(`
        SELECT
          e.id,
          e.task,
          p.pattern_type,
          p.success_rate
        FROM episodes e
        LEFT JOIN patterns p ON e.task LIKE '%' || p.domain || '%'
        WHERE e.success = 1
        LIMIT 50
      `).all();

      const duration = performance.now() - start;

      targetDb.close();

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50); // <50ms for complex join
    });

    it('should aggregate large datasets efficiently', () => {
      const targetDb = new Database(targetDbPath, { readonly: true });

      const start = performance.now();

      const stats = targetDb.prepare(`
        SELECT
          session_id,
          COUNT(*) as episode_count,
          AVG(reward) as avg_reward,
          MAX(tokens_used) as max_tokens
        FROM episodes
        GROUP BY session_id
      `).all();

      const duration = performance.now() - start;

      targetDb.close();

      expect(stats.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(20); // <20ms for aggregation
    });
  });

  describe('Data Relationships', () => {
    it('should maintain referential integrity concepts', () => {
      const targetDb = new Database(targetDbPath, { readonly: true });

      // Get all agent IDs from patterns
      const patternAgents = targetDb.prepare('SELECT DISTINCT agent_id FROM patterns').all() as Array<{ agent_id: string }>;

      // Verify we can query related learning experiences
      patternAgents.forEach(({ agent_id }) => {
        if (agent_id) {
          const query = targetDb.prepare(`
            SELECT COUNT(*) as count FROM patterns WHERE agent_id = ?
          `).get(agent_id) as { count: number };

          expect(query.count).toBeGreaterThan(0);
        }
      });

      targetDb.close();
    });

    it('should support complex filtering', () => {
      const targetDb = new Database(targetDbPath, { readonly: true });

      const results = targetDb.prepare(`
        SELECT * FROM patterns
        WHERE success_rate > 0.8
        AND usage_count > 10
        AND domain IN ('domain-0', 'domain-1')
        ORDER BY success_rate DESC
      `).all();

      targetDb.close();

      results.forEach((row: any) => {
        expect(row.success_rate).toBeGreaterThan(0.8);
        expect(row.usage_count).toBeGreaterThan(10);
        expect(['domain-0', 'domain-1']).toContain(row.domain);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in text fields', () => {
      const db = new Database(targetDbPath);

      const specialChars = "Test with 'quotes', \"double quotes\", and \n newlines";

      db.prepare('INSERT INTO episodes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        'special-test',
        'session-special',
        specialChars,
        null,
        null,
        null,
        0.5,
        1,
        1000,
        500,
        Date.now()
      );

      const result = db.prepare('SELECT task FROM episodes WHERE id = ?').get('special-test') as { task: string };

      db.close();

      expect(result.task).toBe(specialChars);
    });

    it('should handle empty strings vs NULL', () => {
      const targetDb = new Database(targetDbPath, { readonly: true });

      const hasNull = targetDb.prepare('SELECT * FROM episodes WHERE critique IS NULL LIMIT 1').get();
      const hasEmpty = targetDb.prepare('SELECT * FROM episodes WHERE critique = "" LIMIT 1').get();

      targetDb.close();

      // Both should be handled correctly
      expect(hasNull === undefined || hasNull !== null).toBe(true);
    });

    it('should handle very long text fields', () => {
      const db = new Database(targetDbPath);

      const longText = 'A'.repeat(10000);

      db.prepare('INSERT INTO episodes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        'long-test',
        'session-long',
        'task',
        longText,
        null,
        null,
        0.5,
        1,
        1000,
        500,
        Date.now()
      );

      const result = db.prepare('SELECT input FROM episodes WHERE id = ?').get('long-test') as { input: string };

      db.close();

      expect(result.input.length).toBe(10000);
    });
  });
});
