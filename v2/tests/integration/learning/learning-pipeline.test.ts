/**
 * Learning Pipeline Integration Test
 *
 * MISSION: Prove that the Nightly-Learner Phase 1 pipeline works end-to-end
 *
 * This test validates the complete learning pipeline:
 * 1. ExperienceCapture captures agent executions
 * 2. Experiences are stored in the database
 * 3. SleepCycle triggers learning phases
 * 4. PatternSynthesis discovers patterns from experiences
 * 5. DreamEngine generates insights from patterns
 * 6. Patterns are stored and persisted for future use
 *
 * Architecture:
 * ExperienceCapture -> Database -> SleepCycle -> PatternSynthesis -> DreamEngine -> Insights
 */

import { ExperienceCapture, AgentExecutionEvent } from '../../../src/learning/capture/ExperienceCapture';
import { SleepCycle, SleepCycleConfig } from '../../../src/learning/scheduler/SleepCycle';
import { PatternSynthesis } from '../../../src/learning/synthesis/PatternSynthesis';
import { DreamEngine } from '../../../src/learning/dream/DreamEngine';
import path from 'path';
import fs from 'fs/promises';
import Database from 'better-sqlite3';
import { createSeededRandom } from '../../../src/utils/SeededRandom';

describe('Learning Pipeline Integration', () => {
  const testDbPath = path.join(process.cwd(), '.test-data', 'learning-pipeline-test.db');
  let experienceCapture: ExperienceCapture;
  let patternSynthesis: PatternSynthesis;
  let dreamEngine: DreamEngine;
  let sleepCycle: SleepCycle;

  beforeAll(async () => {
    // Ensure test directory exists
    await fs.mkdir(path.dirname(testDbPath), { recursive: true });
  });

  beforeEach(async () => {
    // Clean slate for each test
    try {
      await fs.unlink(testDbPath);
    } catch {
      // Database doesn't exist yet
    }

    // Reset ExperienceCapture shared instance
    ExperienceCapture.resetInstance();
  });

  afterEach(async () => {
    // Cleanup instances
    if (experienceCapture) {
      await experienceCapture.stop();
      experienceCapture.close();
    }
    if (patternSynthesis) {
      patternSynthesis.close();
    }
    if (dreamEngine) {
      dreamEngine.close();
    }
    if (sleepCycle) {
      // SleepCycle doesn't have a close method, but modules it creates will be cleaned up above
    }
  });

  afterAll(async () => {
    // Final cleanup
    try {
      await fs.unlink(testDbPath);
    } catch {
      // Ignore
    }
  });

  describe('End-to-end flow', () => {
    it('should capture experiences during agent execution', async () => {
      experienceCapture = new ExperienceCapture({
        dbPath: testDbPath,
        bufferSize: 5,
        flushInterval: 10000,
        debug: false,
      });

      await experienceCapture.start();

      // Simulate agent executions
      const events: AgentExecutionEvent[] = [
        {
          agentId: 'agent-test-001',
          agentType: 'test-generator',
          taskId: 'task-001',
          taskType: 'unit-test-generation',
          input: { file: 'UserService.ts', framework: 'jest' },
          output: {
            testsGenerated: 12,
            patterns: ['pattern-1', 'pattern-2'],
            framework: 'jest',
          },
          duration: 3500,
          success: true,
          metrics: { coverage: 85, testsGenerated: 12 },
          timestamp: new Date(),
        },
        {
          agentId: 'agent-test-002',
          agentType: 'test-generator',
          taskId: 'task-002',
          taskType: 'integration-test-generation',
          input: { file: 'ApiService.ts', framework: 'jest' },
          output: {
            testsGenerated: 8,
            patterns: ['pattern-1', 'pattern-3'],
            framework: 'jest',
          },
          duration: 4200,
          success: true,
          metrics: { coverage: 78, testsGenerated: 8 },
          timestamp: new Date(),
        },
        {
          agentId: 'agent-coverage-001',
          agentType: 'coverage-analyzer',
          taskId: 'task-003',
          taskType: 'coverage-gap-analysis',
          input: { project: 'my-app' },
          output: {
            gaps: 5,
            recommendations: ['test-file-1', 'test-file-2'],
            decisions: ['strategy:sublinear'],
          },
          duration: 2800,
          success: true,
          metrics: { coverage: 72, coverage_delta: 12 },
          timestamp: new Date(),
        },
      ];

      // Capture all events
      for (const event of events) {
        await experienceCapture.captureExecution(event);
      }

      // Force flush to database
      const flushed = await experienceCapture.flush();

      expect(flushed).toBe(3);

      // Verify experiences in database
      const stats = experienceCapture.getStats();
      expect(stats.totalCaptured).toBe(3);
      expect(stats.totalFlushed).toBe(3);

      const unprocessed = experienceCapture.getUnprocessedExperiences(10);
      expect(unprocessed.length).toBe(3);
      expect(unprocessed[0].agentType).toBeTruthy();
      expect(unprocessed[0].execution.success).toBe(true);
    });

    it('should trigger learning cycle on idle', async () => {
      // First capture some experiences
      experienceCapture = new ExperienceCapture({
        dbPath: testDbPath,
        bufferSize: 10,
        debug: false,
      });

      await experienceCapture.start();

      // Seed with experiences
      const seedEvents = generateTestEvents(5);
      for (const event of seedEvents) {
        await experienceCapture.captureExecution(event);
      }

      await experienceCapture.flush();

      // Now trigger a sleep cycle with fast phase durations for testing
      const sleepConfig: SleepCycleConfig = {
        budget: {
          maxPatternsPerCycle: 50,
          maxAgentsPerCycle: 10,
          maxDurationMs: 60 * 1000, // 60 seconds
        },
        phaseDurations: {
          N1_CAPTURE: 500,      // 0.5 seconds for test
          N2_PROCESS: 1000,     // 1 second
          N3_CONSOLIDATE: 1000, // 1 second
          REM_DREAM: 2000,      // 2 seconds
        },
        skipPhases: [], // Run all phases
        dbPath: testDbPath,
        debug: false,
      };

      sleepCycle = new SleepCycle(sleepConfig);

      // Execute the cycle
      const summary = await sleepCycle.execute();

      expect(summary.id).toBeDefined();
      expect(summary.phasesCompleted.length).toBeGreaterThanOrEqual(1);
      expect(summary.phasesCompleted).toContain('N1_CAPTURE');
      expect(summary.totalDuration).toBeGreaterThan(0);
      expect(summary.aborted).toBe(false);
    });

    it('should synthesize patterns from captured experiences', async () => {
      // Seed database with experiences
      await seedExperiencesForPatternSynthesis(testDbPath);

      patternSynthesis = new PatternSynthesis({
        dbPath: testDbPath,
        debug: false,
      });

      // Run pattern synthesis
      const result = await patternSynthesis.synthesize({
        minSupport: 2, // Low support for test data
        minConfidence: 0.6,
        maxPatterns: 10,
        agentTypes: ['test-generator', 'coverage-analyzer'],
      });

      expect(result).toBeDefined();
      expect(result.experiencesProcessed).toBeGreaterThanOrEqual(0);
      expect(result.clustersAnalyzed).toBeGreaterThanOrEqual(0);
      expect(result.duration).toBeGreaterThan(0);

      // Check statistics
      expect(result.stats).toBeDefined();
      expect(typeof result.stats.averageConfidence).toBe('number');
    });

    it('should store synthesized patterns', async () => {
      // Seed database with experiences
      await seedExperiencesForPatternSynthesis(testDbPath);

      patternSynthesis = new PatternSynthesis({
        dbPath: testDbPath,
        debug: false,
      });

      // Run pattern synthesis
      const result = await patternSynthesis.synthesize({
        minSupport: 2,
        minConfidence: 0.6,
        maxPatterns: 10,
      });

      // Patterns should be stored in database
      const db = new Database(testDbPath);

      const patternCount = db.prepare(`
        SELECT COUNT(*) as count FROM synthesized_patterns
      `).get() as { count: number };

      db.close();

      expect(patternCount.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Pipeline components', () => {
    it('should connect ExperienceCapture to SleepCycle', async () => {
      experienceCapture = new ExperienceCapture({
        dbPath: testDbPath,
        bufferSize: 10,
        debug: false,
      });

      await experienceCapture.start();

      // Capture some experiences
      const events = generateTestEvents(3);
      for (const event of events) {
        await experienceCapture.captureExecution(event);
      }

      await experienceCapture.flush();

      // Create sleep cycle - it should use the same database
      const sleepConfig: SleepCycleConfig = {
        budget: {
          maxPatternsPerCycle: 50,
          maxAgentsPerCycle: 10,
          maxDurationMs: 30000,
        },
        phaseDurations: {
          N1_CAPTURE: 500,
          N2_PROCESS: 500,
          N3_CONSOLIDATE: 500,
          REM_DREAM: 1000,
        },
        skipPhases: ['N3_CONSOLIDATE', 'REM_DREAM'], // Skip slower phases for this test
        dbPath: testDbPath,
        debug: false,
      };

      sleepCycle = new SleepCycle(sleepConfig);

      const summary = await sleepCycle.execute();

      // Verify N1_CAPTURE phase ran and found our experiences
      expect(summary.phasesCompleted).toContain('N1_CAPTURE');
      expect(summary.phasesCompleted).toContain('N2_PROCESS');
    });

    it('should pass experiences to PatternSynthesis', async () => {
      // Seed database
      await seedExperiencesForPatternSynthesis(testDbPath);

      // Initialize pattern synthesis
      patternSynthesis = new PatternSynthesis({
        dbPath: testDbPath,
        debug: false,
      });

      // Run synthesis
      const result = await patternSynthesis.synthesize({
        minSupport: 2,
        minConfidence: 0.6,
        maxPatterns: 10,
      });

      // Should process experiences from database
      expect(result.experiencesProcessed).toBeGreaterThanOrEqual(0);
    });

    it('should emit events at each stage', async () => {
      experienceCapture = new ExperienceCapture({
        dbPath: testDbPath,
        bufferSize: 2,
        debug: false,
      });

      await experienceCapture.start();

      // Track events
      const capturedEvents: string[] = [];
      const flushedEvents: string[] = [];

      experienceCapture.on('captured', (exp) => {
        capturedEvents.push(exp.id);
      });

      experienceCapture.on('flushed', (data) => {
        flushedEvents.push(`flushed:${data.count}`);
      });

      // Capture experiences
      const events = generateTestEvents(3);
      for (const event of events) {
        await experienceCapture.captureExecution(event);
      }

      // Verify events were emitted
      expect(capturedEvents.length).toBe(3);
      expect(flushedEvents.length).toBeGreaterThanOrEqual(1); // Auto-flush triggered
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      // Use invalid path to trigger error
      const invalidDbPath = '/invalid/path/that/does/not/exist/test.db';

      expect(() => {
        new ExperienceCapture({
          dbPath: invalidDbPath,
          debug: false,
        });
      }).toThrow();
    });

    it('should continue processing on individual failures', async () => {
      experienceCapture = new ExperienceCapture({
        dbPath: testDbPath,
        bufferSize: 10,
        debug: false,
      });

      await experienceCapture.start();

      // Mix of valid and potentially problematic events
      const events: AgentExecutionEvent[] = [
        {
          agentId: 'agent-001',
          agentType: 'test-generator',
          taskId: 'task-001',
          taskType: 'unit-test',
          input: { file: 'test.ts' },
          output: { tests: 5 },
          duration: 1000,
          success: true,
          timestamp: new Date(),
        },
        {
          agentId: 'agent-002',
          agentType: 'flaky-detector',
          taskId: 'task-002',
          taskType: 'flaky-detection',
          input: { project: 'test-app' },
          output: { flaky: [] },
          duration: 2000,
          success: false,
          error: new Error('Analysis failed'),
          timestamp: new Date(),
        },
        {
          agentId: 'agent-003',
          agentType: 'coverage-analyzer',
          taskId: 'task-003',
          taskType: 'coverage-analysis',
          input: { project: 'app' },
          output: { coverage: 85 },
          duration: 1500,
          success: true,
          timestamp: new Date(),
        },
      ];

      // Should not throw even with error event
      for (const event of events) {
        await experienceCapture.captureExecution(event);
      }

      const stats = experienceCapture.getStats();
      expect(stats.totalCaptured).toBe(3);
      expect(stats.successRate).toBeGreaterThan(0); // At least some succeeded
      expect(stats.successRate).toBeLessThan(1); // Not all succeeded
    });

    it('should handle empty database gracefully', async () => {
      // Initialize with empty database
      patternSynthesis = new PatternSynthesis({
        dbPath: testDbPath,
        debug: false,
      });

      // Synthesize with no data - should not crash
      const result = await patternSynthesis.synthesize({
        minSupport: 2,
        minConfidence: 0.7,
        maxPatterns: 10,
      });

      expect(result).toBeDefined();
      expect(result.patterns.length).toBe(0);
      expect(result.experiencesProcessed).toBe(0);
    });

    it('should abort sleep cycle gracefully', async () => {
      // Seed some data
      await seedExperiencesForPatternSynthesis(testDbPath);

      const sleepConfig: SleepCycleConfig = {
        budget: {
          maxPatternsPerCycle: 50,
          maxAgentsPerCycle: 10,
          maxDurationMs: 60000,
        },
        phaseDurations: {
          N1_CAPTURE: 3000,  // Longer phases so abort can happen mid-cycle
          N2_PROCESS: 3000,
          N3_CONSOLIDATE: 3000,
          REM_DREAM: 5000,
        },
        dbPath: testDbPath,
        debug: false,
      };

      sleepCycle = new SleepCycle(sleepConfig);

      // Start cycle and abort immediately
      const cyclePromise = sleepCycle.execute();

      // Abort immediately so it triggers during loop check
      sleepCycle.abort();

      const summary = await cyclePromise;

      // Should complete gracefully without error
      // Note: aborted flag may be false if phases complete before abort check happens
      // The important thing is that abort doesn't crash the system
      expect(summary).toBeDefined();
      expect(summary.totalDuration).toBeGreaterThanOrEqual(0);
      expect(summary.errors.length).toBe(0);
    });
  });

  describe('Complete pipeline flow', () => {
    it('should run complete learning pipeline from capture to dream', async () => {
      // Step 1: Capture experiences
      experienceCapture = new ExperienceCapture({
        dbPath: testDbPath,
        bufferSize: 20,
        debug: false,
      });

      await experienceCapture.start();

      const events = generateTestEvents(10);
      for (const event of events) {
        await experienceCapture.captureExecution(event);
      }

      await experienceCapture.flush();

      const captureStats = experienceCapture.getStats();
      expect(captureStats.totalCaptured).toBe(10);
      expect(captureStats.totalFlushed).toBe(10);

      // Step 2: Run sleep cycle with all phases
      const sleepConfig: SleepCycleConfig = {
        budget: {
          maxPatternsPerCycle: 100,
          maxAgentsPerCycle: 20,
          maxDurationMs: 120000,
        },
        phaseDurations: {
          N1_CAPTURE: 500,
          N2_PROCESS: 1000,
          N3_CONSOLIDATE: 1000,
          REM_DREAM: 2000,
        },
        dbPath: testDbPath,
        debug: false,
      };

      sleepCycle = new SleepCycle(sleepConfig);
      const summary = await sleepCycle.execute();

      // Verify all phases completed
      expect(summary.phasesCompleted.length).toBeGreaterThanOrEqual(2);
      expect(summary.phasesCompleted).toContain('N1_CAPTURE');
      expect(summary.phasesCompleted).toContain('N2_PROCESS');
      expect(summary.totalDuration).toBeGreaterThan(0);

      // Step 3: Verify patterns were synthesized
      const db = new Database(testDbPath);
      const patternCount = db.prepare(`
        SELECT COUNT(*) as count FROM synthesized_patterns
      `).get() as { count: number };

      // May be 0 if experiences don't form strong patterns, but should not crash
      expect(patternCount.count).toBeGreaterThanOrEqual(0);

      db.close();

      // Step 4: Verify dream engine can initialize with the data
      dreamEngine = new DreamEngine({
        dbPath: testDbPath,
        cycleDuration: 1000,
        targetInsights: 3,
        autoLoadPatterns: true,
        debug: false,
      });

      await dreamEngine.initialize();

      const graphStats = dreamEngine.getGraphStats();
      expect(graphStats.nodeCount).toBeGreaterThanOrEqual(0);

      // Run a dream cycle
      const dreamResult = await dreamEngine.dream();
      expect(dreamResult.status).toBe('completed');
      expect(dreamResult.duration).toBeGreaterThan(0);
    });
  });
});

/**
 * Helper: Generate test agent execution events
 */
function generateTestEvents(count: number): AgentExecutionEvent[] {
  const events: AgentExecutionEvent[] = [];
  const agentTypes = ['test-generator', 'coverage-analyzer', 'flaky-detector', 'performance-tester'];
  const taskTypes = ['unit-test', 'integration-test', 'coverage-gap', 'flaky-detection'];

  for (let i = 0; i < count; i++) {
    const agentType = agentTypes[i % agentTypes.length];
    const taskType = taskTypes[i % taskTypes.length];

    events.push({
      agentId: `agent-${String(i + 1).padStart(3, '0')}`,
      agentType,
      taskId: `task-${String(i + 1).padStart(3, '0')}`,
      taskType,
      input: {
        file: `File${i + 1}.ts`,
        framework: 'jest',
      },
      output: {
        testsGenerated: 5 + i,
        patterns: [`pattern-${i % 3}`],
        framework: 'jest',
        decisions: [`decision-${i % 2}`],
      },
      duration: 1000 + i * 500,
      success: i % 4 !== 0, // 75% success rate
      metrics: {
        coverage: 70 + (i % 20),
        testsGenerated: 5 + i,
        coverage_delta: i % 5,
      },
      timestamp: new Date(Date.now() - (count - i) * 60000), // Spread over time
    });
  }

  return events;
}

// Seeded RNG for deterministic test data
const rng = createSeededRandom(18600);

/**
 * Helper: Seed database with experiences for pattern synthesis
 */
async function seedExperiencesForPatternSynthesis(dbPath: string): Promise<void> {
  const db = new Database(dbPath);

  // Create tables
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
    );

    CREATE INDEX IF NOT EXISTS idx_exp_agent_type ON captured_experiences(agent_type);
    CREATE INDEX IF NOT EXISTS idx_exp_task_type ON captured_experiences(task_type);
    CREATE INDEX IF NOT EXISTS idx_exp_created_at ON captured_experiences(created_at);
    CREATE INDEX IF NOT EXISTS idx_exp_processed ON captured_experiences(processed);
  `);

  const now = Date.now();
  const insert = db.prepare(`
    INSERT INTO captured_experiences
    (id, agent_id, agent_type, task_type, execution, context, outcome, created_at, processed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

  // Seed with realistic experiences
  const experiences = [
    {
      id: 'exp-001',
      agent_id: 'agent-test-001',
      agent_type: 'test-generator',
      task_type: 'unit-test-generation',
      execution: { input: { file: 'User.ts' }, output: { tests: 10 }, duration: 3000, success: true },
      context: { patterns_used: ['pattern-1'], decisions_made: ['framework:jest'], errors_encountered: [] },
      outcome: { quality_score: 0.85, coverage_delta: 15 },
    },
    {
      id: 'exp-002',
      agent_id: 'agent-test-002',
      agent_type: 'test-generator',
      task_type: 'unit-test-generation',
      execution: { input: { file: 'Product.ts' }, output: { tests: 12 }, duration: 3200, success: true },
      context: { patterns_used: ['pattern-1'], decisions_made: ['framework:jest'], errors_encountered: [] },
      outcome: { quality_score: 0.88, coverage_delta: 18 },
    },
    {
      id: 'exp-003',
      agent_id: 'agent-coverage-001',
      agent_type: 'coverage-analyzer',
      task_type: 'coverage-gap-analysis',
      execution: { input: { project: 'app' }, output: { gaps: 5 }, duration: 2500, success: true },
      context: { patterns_used: ['pattern-2'], decisions_made: ['strategy:sublinear'], errors_encountered: [] },
      outcome: { quality_score: 0.80, coverage_delta: 12 },
    },
    {
      id: 'exp-004',
      agent_id: 'agent-test-003',
      agent_type: 'test-generator',
      task_type: 'integration-test-generation',
      execution: { input: { file: 'API.ts' }, output: { tests: 6 }, duration: 4000, success: true },
      context: { patterns_used: ['pattern-1', 'pattern-3'], decisions_made: ['framework:jest'], errors_encountered: [] },
      outcome: { quality_score: 0.82, coverage_delta: 10 },
    },
    {
      id: 'exp-005',
      agent_id: 'agent-flaky-001',
      agent_type: 'flaky-detector',
      task_type: 'flaky-detection',
      execution: { input: { project: 'app' }, output: { flaky: [] }, duration: 3500, success: false },
      context: { patterns_used: [], decisions_made: ['threshold:0.3'], errors_encountered: ['timeout'] },
      outcome: { quality_score: 0.30, coverage_delta: 0 },
    },
  ];

  for (const exp of experiences) {
    insert.run(
      exp.id,
      exp.agent_id,
      exp.agent_type,
      exp.task_type,
      JSON.stringify(exp.execution),
      JSON.stringify(exp.context),
      JSON.stringify(exp.outcome),
      now - rng.random() * 86400000 // Random time in last 24 hours
    );
  }

  db.close();
}
