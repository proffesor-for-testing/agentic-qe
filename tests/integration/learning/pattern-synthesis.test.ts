/**
 * PatternSynthesis Integration Test
 *
 * MISSION: Validate pattern synthesis from captured experiences
 *
 * This test validates:
 * 1. PatternSynthesis initialization
 * 2. Synthesizing patterns from experiences
 * 3. Pattern confidence scoring
 * 4. Pattern storage and retrieval
 * 5. Pattern effectiveness updates
 */

import { PatternSynthesis, SynthesizedPattern, PatternType } from '../../../src/learning/synthesis/PatternSynthesis';
import { ExperienceCapture, AgentExecutionEvent } from '../../../src/learning/capture/ExperienceCapture';
import path from 'path';
import fs from 'fs/promises';
import Database from 'better-sqlite3';

describe('PatternSynthesis Integration', () => {
  const testDbPath = path.join(process.cwd(), '.test-data', 'pattern-synthesis-test.db');
  let patternSynthesis: PatternSynthesis;
  let experienceCapture: ExperienceCapture;

  beforeAll(async () => {
    // Ensure test directory exists
    await fs.mkdir(path.dirname(testDbPath), { recursive: true });
  });

  beforeEach(async () => {
    // Remove existing test database
    try {
      await fs.unlink(testDbPath);
    } catch {
      // Ignore if doesn't exist
    }

    // Reset singleton
    ExperienceCapture.resetInstance();
  });

  afterEach(async () => {
    if (patternSynthesis) {
      patternSynthesis.close();
    }
    if (experienceCapture) {
      await experienceCapture.stop();
      experienceCapture.close();
    }
  });

  afterAll(async () => {
    // Cleanup test database
    try {
      await fs.unlink(testDbPath);
    } catch {
      // Ignore
    }
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      patternSynthesis = new PatternSynthesis({ dbPath: testDbPath });
      expect(patternSynthesis).toBeDefined();
    });

    it('should initialize with custom configuration', () => {
      patternSynthesis = new PatternSynthesis({
        dbPath: testDbPath,
        debug: true,
      });
      expect(patternSynthesis).toBeDefined();
    });

    it('should create database schema', () => {
      patternSynthesis = new PatternSynthesis({ dbPath: testDbPath });

      // Schema should be created
      const patterns = patternSynthesis.getPatterns({ limit: 10 });
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('Pattern Synthesis', () => {
    beforeEach(async () => {
      // Set up experience capture and synthesis
      experienceCapture = new ExperienceCapture({
        dbPath: testDbPath,
        bufferSize: 1, // Auto-flush immediately
      });
      await experienceCapture.start();

      patternSynthesis = new PatternSynthesis({ dbPath: testDbPath });
    });

    it('should synthesize patterns from successful experiences', async () => {
      // Capture multiple similar successful experiences
      for (let i = 0; i < 5; i++) {
        await experienceCapture.captureExecution({
          agentId: `agent-${i}`,
          agentType: 'test-generator',
          taskId: `task-${i}`,
          taskType: 'unit-test-generation',
          input: { sourceFile: `file${i}.ts` },
          output: {
            testsGenerated: 10 + i,
            patterns: ['pattern-aaa'],
            framework: 'jest',
          },
          duration: 2000,
          success: true,
          metrics: { coverage: 85, testsGenerated: 10 + i },
          timestamp: new Date(),
        });
      }

      const result = await patternSynthesis.synthesize({
        minSupport: 3,
        minConfidence: 0.5,
        maxPatterns: 10,
      });

      expect(result.patterns.length).toBeGreaterThan(0);
      expect(result.experiencesProcessed).toBe(5);
      expect(result.stats.successStrategies).toBeGreaterThan(0);
      expect(result.stats.averageConfidence).toBeGreaterThan(0);
    });

    it('should synthesize failure avoidance patterns', async () => {
      // Capture multiple similar failed experiences
      for (let i = 0; i < 4; i++) {
        await experienceCapture.captureExecution({
          agentId: `agent-${i}`,
          agentType: 'coverage-analyzer',
          taskId: `task-${i}`,
          taskType: 'coverage-analysis',
          input: { targetFile: `app${i}.ts` },
          output: {},
          duration: 500,
          success: false,
          error: new Error('Analysis failed'),
          timestamp: new Date(),
        });
      }

      const result = await patternSynthesis.synthesize({
        minSupport: 3,
        minConfidence: 0.5,
      });

      expect(result.patterns.length).toBeGreaterThan(0);
      const failurePatterns = result.patterns.filter(p => p.type === 'failure_avoidance');
      expect(failurePatterns.length).toBeGreaterThan(0);
    });

    it('should emit pattern:discovered events', async () => {
      // Seed experiences
      for (let i = 0; i < 4; i++) {
        await experienceCapture.captureExecution({
          agentId: `agent-${i}`,
          agentType: 'test-generator',
          taskId: `task-${i}`,
          taskType: 'test',
          input: {},
          output: {},
          duration: 1000,
          success: true,
          timestamp: new Date(),
        });
      }

      const discoveredPatterns: SynthesizedPattern[] = [];
      patternSynthesis.on('pattern:discovered', (pattern) => {
        discoveredPatterns.push(pattern);
      });

      await patternSynthesis.synthesize({
        minSupport: 3,
        minConfidence: 0.5,
      });

      expect(discoveredPatterns.length).toBeGreaterThan(0);
    });

    it('should emit synthesis:complete event', async () => {
      // Seed some experiences first
      seedExperienceData(testDbPath, 3);

      let completeEmitted = false;
      let result: any = null;

      patternSynthesis.on('synthesis:complete', (r) => {
        completeEmitted = true;
        result = r;
      });

      await patternSynthesis.synthesize({
        minSupport: 1,
      });

      expect(completeEmitted).toBe(true);
      expect(result).toBeDefined();
    });

    it('should respect minSupport threshold', async () => {
      // Add only 2 experiences
      for (let i = 0; i < 2; i++) {
        await experienceCapture.captureExecution({
          agentId: `agent-${i}`,
          agentType: 'test',
          taskId: `task-${i}`,
          taskType: 'test',
          input: {},
          output: {},
          duration: 1000,
          success: true,
          timestamp: new Date(),
        });
      }

      const result = await patternSynthesis.synthesize({
        minSupport: 5, // Require at least 5
        minConfidence: 0.5,
      });

      expect(result.patterns.length).toBe(0);
      expect(result.experiencesProcessed).toBe(2);
    });

    it('should respect minConfidence threshold', async () => {
      // Add experiences with mixed outcomes
      for (let i = 0; i < 5; i++) {
        await experienceCapture.captureExecution({
          agentId: `agent-${i}`,
          agentType: 'test',
          taskId: `task-${i}`,
          taskType: 'test',
          input: {},
          output: {},
          duration: 1000,
          success: i % 2 === 0, // Mixed success/failure
          timestamp: new Date(),
        });
      }

      const result = await patternSynthesis.synthesize({
        minSupport: 3,
        minConfidence: 0.95, // Very high confidence required
      });

      // May have no patterns due to high confidence threshold
      expect(result.patterns.every(p => p.confidence >= 0.95)).toBe(true);
    });

    it('should respect maxPatterns limit', async () => {
      // Create multiple diverse experiences to generate many patterns
      const agentTypes = ['test-gen', 'coverage', 'perf', 'security', 'flaky'];

      for (const agentType of agentTypes) {
        for (let i = 0; i < 5; i++) {
          await experienceCapture.captureExecution({
            agentId: `agent-${agentType}-${i}`,
            agentType,
            taskId: `task-${i}`,
            taskType: 'test',
            input: {},
            output: {},
            duration: 1000,
            success: true,
            timestamp: new Date(),
          });
        }
      }

      const result = await patternSynthesis.synthesize({
        minSupport: 3,
        minConfidence: 0.5,
        maxPatterns: 3,
      });

      expect(result.patterns.length).toBeLessThanOrEqual(3);
    });

    it('should filter by agent types', async () => {
      // Add experiences for different agent types
      await experienceCapture.captureExecution({
        agentId: 'agent-1',
        agentType: 'test-generator',
        taskId: 'task-1',
        taskType: 'test',
        input: {},
        output: {},
        duration: 1000,
        success: true,
        timestamp: new Date(),
      });

      await experienceCapture.captureExecution({
        agentId: 'agent-2',
        agentType: 'coverage-analyzer',
        taskId: 'task-2',
        taskType: 'analysis',
        input: {},
        output: {},
        duration: 1000,
        success: true,
        timestamp: new Date(),
      });

      const result = await patternSynthesis.synthesize({
        agentTypes: ['test-generator'],
        minSupport: 1,
      });

      // Should only process test-generator experiences
      expect(result.experiencesProcessed).toBeLessThanOrEqual(1);
    });

    it('should filter by task types', async () => {
      await experienceCapture.captureExecution({
        agentId: 'agent-1',
        agentType: 'test',
        taskId: 'task-1',
        taskType: 'unit-test',
        input: {},
        output: {},
        duration: 1000,
        success: true,
        timestamp: new Date(),
      });

      await experienceCapture.captureExecution({
        agentId: 'agent-2',
        agentType: 'test',
        taskId: 'task-2',
        taskType: 'integration-test',
        input: {},
        output: {},
        duration: 1000,
        success: true,
        timestamp: new Date(),
      });

      const result = await patternSynthesis.synthesize({
        taskTypes: ['unit-test'],
        minSupport: 1,
      });

      expect(result.experiencesProcessed).toBeLessThanOrEqual(1);
    });
  });

  describe('Pattern Storage and Retrieval', () => {
    beforeEach(() => {
      patternSynthesis = new PatternSynthesis({ dbPath: testDbPath });
    });

    it('should store and retrieve patterns', async () => {
      // Seed database with experiences using SQL directly
      seedExperienceData(testDbPath, 5);

      const result = await patternSynthesis.synthesize({
        minSupport: 3,
        minConfidence: 0.5,
      });

      expect(result.patterns.length).toBeGreaterThan(0);

      // Retrieve patterns
      const allPatterns = patternSynthesis.getPatterns({ limit: 10 });
      expect(allPatterns.length).toBe(result.patterns.length);
    });

    it('should get patterns by type', async () => {
      seedExperienceData(testDbPath, 5, true); // Successful experiences

      await patternSynthesis.synthesize({
        minSupport: 3,
        minConfidence: 0.5,
      });

      const successPatterns = patternSynthesis.getPatterns({
        type: 'success_strategy',
      });

      expect(successPatterns.every(p => p.type === 'success_strategy')).toBe(true);
    });

    it('should get patterns by minimum confidence', async () => {
      seedExperienceData(testDbPath, 5);

      await patternSynthesis.synthesize({
        minSupport: 3,
        minConfidence: 0.5,
      });

      const highConfidencePatterns = patternSynthesis.getPatterns({
        minConfidence: 0.8,
      });

      expect(highConfidencePatterns.every(p => p.confidence >= 0.8)).toBe(true);
    });

    it('should get patterns by agent type', async () => {
      seedExperienceData(testDbPath, 5, true, 'test-generator');

      await patternSynthesis.synthesize({
        minSupport: 3,
        minConfidence: 0.5,
      });

      const patterns = patternSynthesis.getPatterns({
        agentType: 'test-generator',
      });

      expect(patterns.every(p => p.agentTypes.includes('test-generator'))).toBe(true);
    });

    it('should get pattern by ID', async () => {
      seedExperienceData(testDbPath, 5);

      const result = await patternSynthesis.synthesize({
        minSupport: 3,
        minConfidence: 0.5,
      });

      if (result.patterns.length > 0) {
        const patternId = result.patterns[0].id;
        const retrieved = patternSynthesis.getPattern(patternId);

        expect(retrieved).not.toBeNull();
        expect(retrieved?.id).toBe(patternId);
      }
    });

    it('should return null for non-existent pattern', () => {
      const pattern = patternSynthesis.getPattern('non-existent-id');
      expect(pattern).toBeNull();
    });
  });

  describe('Pattern Effectiveness', () => {
    beforeEach(async () => {
      patternSynthesis = new PatternSynthesis({ dbPath: testDbPath });
      seedExperienceData(testDbPath, 5);

      await patternSynthesis.synthesize({
        minSupport: 3,
        minConfidence: 0.5,
      });
    });

    it('should update pattern effectiveness on success', () => {
      const patterns = patternSynthesis.getPatterns({ limit: 1 });
      if (patterns.length === 0) {
        // No patterns to test
        return;
      }

      const pattern = patterns[0];
      const initialEffectiveness = pattern.effectiveness;

      // Update with success
      patternSynthesis.updateEffectiveness(pattern.id, true);

      const updated = patternSynthesis.getPattern(pattern.id);
      expect(updated?.effectiveness).toBeGreaterThanOrEqual(initialEffectiveness);
    });

    it('should update pattern effectiveness on failure', () => {
      const patterns = patternSynthesis.getPatterns({ limit: 1 });
      if (patterns.length === 0) {
        return;
      }

      const pattern = patterns[0];
      const initialEffectiveness = pattern.effectiveness;

      // Update with failure
      patternSynthesis.updateEffectiveness(pattern.id, false);

      const updated = patternSynthesis.getPattern(pattern.id);
      expect(updated?.effectiveness).toBeLessThanOrEqual(initialEffectiveness);
    });

    it('should not error on updating non-existent pattern', () => {
      // Should not throw
      patternSynthesis.updateEffectiveness('non-existent-id', true);
    });
  });

  describe('Pattern Content', () => {
    beforeEach(async () => {
      patternSynthesis = new PatternSynthesis({ dbPath: testDbPath });
    });

    it('should extract conditions from experiences', async () => {
      seedExperienceData(testDbPath, 5, true, 'test-generator', 'unit-test');

      const result = await patternSynthesis.synthesize({
        minSupport: 3,
        minConfidence: 0.5,
      });

      if (result.patterns.length > 0) {
        const pattern = result.patterns[0];
        expect(pattern.conditions.length).toBeGreaterThan(0);
        expect(pattern.conditions.some(c => c.includes('test-generator'))).toBe(true);
      }
    });

    it('should extract actions from experiences', async () => {
      seedExperienceData(testDbPath, 5, true);

      const result = await patternSynthesis.synthesize({
        minSupport: 3,
        minConfidence: 0.5,
      });

      if (result.patterns.length > 0) {
        const pattern = result.patterns[0];
        expect(pattern.actions.length).toBeGreaterThan(0);
      }
    });

    it('should generate human-readable descriptions', async () => {
      seedExperienceData(testDbPath, 5, true, 'test-generator', 'unit-test');

      const result = await patternSynthesis.synthesize({
        minSupport: 3,
        minConfidence: 0.5,
      });

      if (result.patterns.length > 0) {
        const pattern = result.patterns[0];
        expect(pattern.description).toBeDefined();
        expect(pattern.description.length).toBeGreaterThan(0);
        expect(pattern.description).toContain('test-generator');
      }
    });

    it('should include supporting experience IDs', async () => {
      seedExperienceData(testDbPath, 5);

      const result = await patternSynthesis.synthesize({
        minSupport: 3,
        minConfidence: 0.5,
      });

      if (result.patterns.length > 0) {
        const pattern = result.patterns[0];
        expect(pattern.supportingExperiences.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('Synthesis Statistics', () => {
    it('should provide synthesis result statistics', async () => {
      patternSynthesis = new PatternSynthesis({ dbPath: testDbPath });
      seedExperienceData(testDbPath, 10, true);

      const result = await patternSynthesis.synthesize({
        minSupport: 3,
        minConfidence: 0.5,
      });

      expect(result.clustersAnalyzed).toBeGreaterThanOrEqual(0);
      expect(result.experiencesProcessed).toBe(10);
      expect(result.duration).toBeGreaterThan(0);
      expect(typeof result.stats.successStrategies).toBe('number');
      expect(typeof result.stats.failureAvoidances).toBe('number');
      expect(typeof result.stats.efficiencyOptimizations).toBe('number');
      expect(typeof result.stats.averageConfidence).toBe('number');
    });
  });
});

/**
 * Helper function to seed experience data for testing
 */
function seedExperienceData(
  dbPath: string,
  count: number,
  success: boolean = true,
  agentType: string = 'test-generator',
  taskType: string = 'test'
): void {
  const db = new Database(dbPath);

  // Ensure experiences table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS captured_experiences (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      task_type TEXT NOT NULL,
      execution TEXT NOT NULL,
      context TEXT NOT NULL,
      outcome TEXT NOT NULL,
      embedding BLOB,
      created_at INTEGER NOT NULL,
      processed INTEGER DEFAULT 0
    )
  `);

  const stmt = db.prepare(`
    INSERT INTO captured_experiences
    (id, agent_id, agent_type, task_type, execution, context, outcome, created_at, processed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

  const now = Date.now();

  for (let i = 0; i < count; i++) {
    stmt.run(
      `exp-${now}-${i}`,
      `agent-${i}`,
      agentType,
      taskType,
      JSON.stringify({
        input: {},
        output: { framework: 'jest' },
        duration: 1000 + i * 100,
        success,
      }),
      JSON.stringify({
        patterns_used: ['pattern-1'],
        decisions_made: ['framework:jest'],
        errors_encountered: [],
      }),
      JSON.stringify({
        quality_score: success ? 0.8 + i * 0.02 : 0.2,
        coverage_delta: success ? 5 : 0,
      }),
      now - i * 1000
    );
  }

  db.close();
}
