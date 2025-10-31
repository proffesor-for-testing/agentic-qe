/**
 * Pattern Persistence Integration Tests
 *
 * Tests database persistence of test patterns as identified in CRITICAL-LEARNING-SYSTEM-ANALYSIS.md
 *
 * Test Coverage:
 * 1. Pattern storage to database (currently fails - in-memory only)
 * 2. Pattern retrieval from database
 * 3. Pattern updates and versioning
 * 4. Pattern usage tracking
 * 5. Concurrent pattern access
 * 6. Database consistency across restarts
 *
 * **Expected Failures**: These tests WILL FAIL until database integration is implemented
 * This is intentional - tests document what SHOULD work based on README claims
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { QEReasoningBank, TestPattern } from '@reasoning/QEReasoningBank';
import { Database } from '@utils/Database';
import * as fs from 'fs';
import * as path from 'path';

describe('Pattern Persistence Integration Tests', () => {
  let reasoningBank: QEReasoningBank;
  let database: Database;
  let testDbPath: string;

  beforeEach(async () => {
    // Create temporary test database
    testDbPath = path.join(__dirname, '../temp', `test-patterns-${Date.now()}.db`);

    // Ensure temp directory exists
    const tempDir = path.dirname(testDbPath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Initialize database with patterns table
    database = new Database(testDbPath);
    await database.initialize();

    // Create patterns table (this should be in Database.ts but isn't)
    await database.run(`
      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        framework TEXT NOT NULL,
        language TEXT NOT NULL,
        template TEXT NOT NULL,
        examples TEXT,
        confidence REAL NOT NULL,
        usage_count INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 0,
        quality REAL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await database.run(`
      CREATE TABLE IF NOT EXISTS pattern_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_id TEXT NOT NULL,
        project_id TEXT,
        used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        success BOOLEAN DEFAULT TRUE,
        FOREIGN KEY (pattern_id) REFERENCES patterns (id)
      )
    `);

    reasoningBank = new QEReasoningBank({ minQuality: 0.6 });
  });

  afterEach(async () => {
    // Cleanup test database
    if (database) {
      await database.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  /**
   * Test 1: Pattern Storage to Database
   * **Expected**: FAIL - QEReasoningBank uses in-memory Map, doesn't write to DB
   */
  describe('Pattern Storage to Database', () => {
    it('should persist pattern to database when stored', async () => {
      const pattern: TestPattern = {
        id: 'test-pattern-001',
        name: 'API Controller Test Pattern',
        description: 'Pattern for testing REST API controllers',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: `
          describe('{{controller}}', () => {
            it('should return {{status}} on {{method}} {{endpoint}}', async () => {
              const response = await request(app)
                .{{method}}('{{endpoint}}')
                .send({{payload}});
              expect(response.status).toBe({{status}});
            });
          });
        `,
        examples: [
          'describe("UserController", () => { it("should return 200 on GET /users", async () => { ... }); });'
        ],
        confidence: 0.85,
        usageCount: 0,
        successRate: 0,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['api', 'controller', 'rest']
        }
      };

      // Store pattern
      await reasoningBank.storePattern(pattern);

      // ❌ EXPECTED TO FAIL: Pattern should be in database but isn't
      // QEReasoningBank.storePattern() only stores in memory Map
      const rows = await database.all('SELECT * FROM patterns WHERE id = ?', [pattern.id]);

      expect(rows.length).toBe(1); // Will FAIL - 0 rows
      expect(rows[0]?.id).toBe(pattern.id);
      expect(rows[0]?.name).toBe(pattern.name);
      expect(rows[0]?.framework).toBe(pattern.framework);
    });

    it('should store pattern with correct quality score', async () => {
      const pattern: TestPattern = {
        id: 'test-pattern-002',
        name: 'Integration Test Pattern',
        description: 'Pattern for integration tests',
        category: 'integration',
        framework: 'jest',
        language: 'typescript',
        template: 'describe(...)',
        examples: ['example test'],
        confidence: 0.9,
        usageCount: 5,
        successRate: 0.95,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['integration']
        }
      };

      await reasoningBank.storePattern(pattern);

      // ❌ EXPECTED TO FAIL: Quality should be calculated and stored
      const rows = await database.all('SELECT quality FROM patterns WHERE id = ?', [pattern.id]);

      expect(rows.length).toBe(1); // Will FAIL
      expect(rows[0]?.quality).toBeGreaterThan(0);
      expect(rows[0]?.quality).toBeLessThanOrEqual(1);
    });
  });

  /**
   * Test 2: Pattern Retrieval from Database
   * **Expected**: FAIL - No patterns in database to retrieve
   */
  describe('Pattern Retrieval from Database', () => {
    it('should load patterns from database on initialization', async () => {
      // Manually insert pattern into database (simulating previous session)
      await database.run(`
        INSERT INTO patterns (
          id, name, description, category, framework, language,
          template, examples, confidence, usage_count, success_rate, quality, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'persisted-pattern-001',
        'Persisted Test Pattern',
        'A pattern from previous session',
        'unit',
        'jest',
        'typescript',
        'describe(...)',
        JSON.stringify(['example']),
        0.88,
        10,
        0.92,
        0.85,
        JSON.stringify({
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: '1.0.0',
          tags: ['persisted']
        })
      ]);

      // Create new ReasoningBank (simulating app restart)
      const newReasoningBank = new QEReasoningBank();

      // ❌ EXPECTED TO FAIL: ReasoningBank should load patterns from DB but doesn't
      // QEReasoningBank has no initialize() method that loads from database
      const patterns = await newReasoningBank.getAllPatterns();

      expect(patterns.length).toBe(1); // Will FAIL - 0 patterns
      expect(patterns[0]?.id).toBe('persisted-pattern-001');
      expect(patterns[0]?.usageCount).toBe(10);
    });

    it('should retrieve pattern by ID from database', async () => {
      // Insert pattern
      await database.run(`
        INSERT INTO patterns (
          id, name, description, category, framework, language,
          template, examples, confidence, usage_count, success_rate, quality, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'retrieve-pattern-001',
        'Retrievable Pattern',
        'Pattern to retrieve',
        'unit',
        'jest',
        'typescript',
        'test template',
        JSON.stringify(['example']),
        0.85,
        5,
        0.9,
        0.82,
        JSON.stringify({ createdAt: new Date(), updatedAt: new Date(), version: '1.0.0', tags: [] })
      ]);

      // ❌ EXPECTED TO FAIL: Pattern not loaded from database
      const pattern = await reasoningBank.getPattern('retrieve-pattern-001');

      expect(pattern).toBeDefined(); // Will FAIL - undefined
      expect(pattern?.name).toBe('Retrievable Pattern');
    });
  });

  /**
   * Test 3: Pattern Updates
   * **Expected**: FAIL - Updates only in memory, not persisted
   */
  describe('Pattern Updates', () => {
    it('should update pattern in database when modified', async () => {
      const pattern: TestPattern = {
        id: 'update-pattern-001',
        name: 'Updateable Pattern',
        description: 'Pattern to update',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'original template',
        examples: ['original example'],
        confidence: 0.75,
        usageCount: 0,
        successRate: 0,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['update']
        }
      };

      // Store original
      await reasoningBank.storePattern(pattern);

      // Update pattern
      pattern.template = 'updated template';
      pattern.usageCount = 5;
      pattern.successRate = 0.9;
      pattern.metadata.version = '1.1.0';
      pattern.metadata.updatedAt = new Date();

      await reasoningBank.storePattern(pattern);

      // ❌ EXPECTED TO FAIL: Updated values not in database
      const rows = await database.all('SELECT * FROM patterns WHERE id = ?', [pattern.id]);

      expect(rows.length).toBe(1); // Will FAIL
      expect(rows[0]?.template).toBe('updated template');
      expect(rows[0]?.usage_count).toBe(5);
      expect(rows[0]?.success_rate).toBe(0.9);
    });

    it('should track pattern version history', async () => {
      const pattern: TestPattern = {
        id: 'versioned-pattern-001',
        name: 'Versioned Pattern',
        description: 'Pattern with versions',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'v1 template',
        examples: [],
        confidence: 0.8,
        usageCount: 0,
        successRate: 0,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: []
        }
      };

      // Store v1
      await reasoningBank.storePattern(pattern);

      // Update to v2
      pattern.template = 'v2 template';
      pattern.metadata.version = '2.0.0';
      await reasoningBank.storePattern(pattern);

      // Update to v3
      pattern.template = 'v3 template';
      pattern.metadata.version = '3.0.0';
      await reasoningBank.storePattern(pattern);

      // ❌ EXPECTED TO FAIL: Version history not persisted
      const history = await reasoningBank.getPatternHistory(pattern.id);

      expect(history.length).toBe(3); // Will FAIL
      expect(history[0]?.metadata.version).toBe('1.0.0');
      expect(history[2]?.metadata.version).toBe('3.0.0');
    });
  });

  /**
   * Test 4: Pattern Usage Tracking
   * **Expected**: FAIL - Usage not tracked in database
   */
  describe('Pattern Usage Tracking', () => {
    it('should record pattern usage in database', async () => {
      // Insert pattern
      await database.run(`
        INSERT INTO patterns (
          id, name, description, category, framework, language,
          template, examples, confidence, usage_count, success_rate, quality, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'tracked-pattern-001',
        'Tracked Pattern',
        'Pattern with usage tracking',
        'unit',
        'jest',
        'typescript',
        'template',
        JSON.stringify([]),
        0.85,
        0,
        0,
        0.8,
        JSON.stringify({ createdAt: new Date(), updatedAt: new Date(), version: '1.0.0', tags: [] })
      ]);

      // ❌ EXPECTED TO FAIL: trackUsage method doesn't exist
      await reasoningBank.trackUsage('tracked-pattern-001', 'project-123', true);
      await reasoningBank.trackUsage('tracked-pattern-001', 'project-123', true);
      await reasoningBank.trackUsage('tracked-pattern-001', 'project-456', false);

      // Check usage tracking
      const usageRows = await database.all(
        'SELECT * FROM pattern_usage WHERE pattern_id = ?',
        ['tracked-pattern-001']
      );

      expect(usageRows.length).toBe(3); // Will FAIL - 0 rows
      expect(usageRows.filter(r => r.success).length).toBe(2);

      // Check usage count updated
      const patternRows = await database.all(
        'SELECT usage_count, success_rate FROM patterns WHERE id = ?',
        ['tracked-pattern-001']
      );

      expect(patternRows[0]?.usage_count).toBe(3);
      expect(patternRows[0]?.success_rate).toBeCloseTo(2 / 3, 2);
    });
  });

  /**
   * Test 5: Concurrent Pattern Access
   * **Expected**: FAIL - Database not thread-safe, no transactions
   */
  describe('Concurrent Pattern Access', () => {
    it('should handle concurrent pattern storage', async () => {
      const patterns: TestPattern[] = Array.from({ length: 10 }, (_, i) => ({
        id: `concurrent-pattern-${i}`,
        name: `Concurrent Pattern ${i}`,
        description: `Pattern ${i}`,
        category: 'unit' as const,
        framework: 'jest' as const,
        language: 'typescript' as const,
        template: `template ${i}`,
        examples: [],
        confidence: 0.8 + (i * 0.01),
        usageCount: 0,
        successRate: 0,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: [`concurrent-${i}`]
        }
      }));

      // Store all patterns concurrently
      await Promise.all(patterns.map(p => reasoningBank.storePattern(p)));

      // ❌ EXPECTED TO FAIL: Not all patterns persisted
      const rows = await database.all('SELECT COUNT(*) as count FROM patterns');

      expect(rows[0]?.count).toBe(10); // Will FAIL - 0
    });

    it('should handle concurrent pattern updates', async () => {
      // Insert pattern
      await database.run(`
        INSERT INTO patterns (
          id, name, description, category, framework, language,
          template, examples, confidence, usage_count, success_rate, quality, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'concurrent-update-001',
        'Update Pattern',
        'Pattern for concurrent updates',
        'unit',
        'jest',
        'typescript',
        'template',
        JSON.stringify([]),
        0.85,
        0,
        0,
        0.8,
        JSON.stringify({ createdAt: new Date(), updatedAt: new Date(), version: '1.0.0', tags: [] })
      ]);

      // Simulate concurrent usage tracking
      const updates = Array.from({ length: 100 }, (_, i) =>
        reasoningBank.trackUsage('concurrent-update-001', `project-${i}`, Math.random() > 0.2)
      );

      await Promise.all(updates);

      // ❌ EXPECTED TO FAIL: Race condition in usage counting
      const rows = await database.all(
        'SELECT usage_count FROM patterns WHERE id = ?',
        ['concurrent-update-001']
      );

      expect(rows[0]?.usage_count).toBe(100); // Will FAIL - race conditions
    });
  });

  /**
   * Test 6: Database Consistency Across Restarts
   * **Expected**: FAIL - Critical issue from CRITICAL-LEARNING-SYSTEM-ANALYSIS.md
   */
  describe('Database Consistency Across Restarts', () => {
    it('should persist patterns across agent restarts', async () => {
      // Session 1: Store patterns
      const patterns: TestPattern[] = [
        {
          id: 'restart-pattern-001',
          name: 'Restart Test Pattern 1',
          description: 'First pattern',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: 'template 1',
          examples: ['example 1'],
          confidence: 0.85,
          usageCount: 5,
          successRate: 0.9,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['restart']
          }
        },
        {
          id: 'restart-pattern-002',
          name: 'Restart Test Pattern 2',
          description: 'Second pattern',
          category: 'integration',
          framework: 'jest',
          language: 'typescript',
          template: 'template 2',
          examples: ['example 2'],
          confidence: 0.88,
          usageCount: 10,
          successRate: 0.95,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['restart']
          }
        }
      ];

      for (const pattern of patterns) {
        await reasoningBank.storePattern(pattern);
      }

      // Verify patterns stored
      const allPatterns1 = await reasoningBank.getAllPatterns();
      expect(allPatterns1.length).toBe(2);

      // Session 2: Simulate restart by creating new instance
      const newReasoningBank = new QEReasoningBank();
      // ❌ MISSING: newReasoningBank.initialize(database) - doesn't exist

      // ❌ EXPECTED TO FAIL: Patterns not loaded from database
      const allPatterns2 = await newReasoningBank.getAllPatterns();

      expect(allPatterns2.length).toBe(2); // Will FAIL - 0 patterns
      expect(allPatterns2.find(p => p.id === 'restart-pattern-001')).toBeDefined();
      expect(allPatterns2.find(p => p.id === 'restart-pattern-002')).toBeDefined();
    });

    it('should maintain pattern quality scores across restarts', async () => {
      const pattern: TestPattern = {
        id: 'quality-persist-001',
        name: 'Quality Test Pattern',
        description: 'Pattern with quality score',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'high quality template with detailed examples',
        examples: [
          'example 1',
          'example 2',
          'example 3'
        ],
        confidence: 0.92,
        usageCount: 20,
        successRate: 0.95,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['quality', 'tested']
        }
      };

      await reasoningBank.storePattern(pattern);

      const storedPattern = await reasoningBank.getPattern(pattern.id);
      const originalQuality = storedPattern?.quality;

      expect(originalQuality).toBeDefined();
      expect(originalQuality).toBeGreaterThan(0.7); // High quality pattern

      // Restart
      const newReasoningBank = new QEReasoningBank();

      // ❌ EXPECTED TO FAIL: Quality score not persisted/reloaded
      const reloadedPattern = await newReasoningBank.getPattern(pattern.id);

      expect(reloadedPattern).toBeDefined(); // Will FAIL
      expect(reloadedPattern?.quality).toBe(originalQuality);
    });
  });

  /**
   * Test 7: Integration with Database Schema
   * **Expected**: FAIL - Schema mismatch issues from analysis
   */
  describe('Database Schema Integration', () => {
    it('should use correct table structure', async () => {
      // Verify patterns table exists
      const tables = await database.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='patterns'"
      );

      expect(tables.length).toBe(1);

      // Verify correct columns
      const columns = await database.all('PRAGMA table_info(patterns)');
      const columnNames = columns.map((c: any) => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('template');
      expect(columnNames).toContain('quality');
      expect(columnNames).toContain('usage_count');
      expect(columnNames).toContain('success_rate');
    });

    it('should create indexes for fast lookup', async () => {
      // ❌ EXPECTED TO FAIL: No indexes created for performance
      const indexes = await database.all(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='patterns'"
      );

      // Should have indexes on commonly queried fields
      const indexNames = indexes.map((i: any) => i.name);

      expect(indexNames.some(n => n.includes('framework'))).toBe(true); // Will FAIL
      expect(indexNames.some(n => n.includes('category'))).toBe(true);
      expect(indexNames.some(n => n.includes('quality'))).toBe(true);
    });
  });
});
