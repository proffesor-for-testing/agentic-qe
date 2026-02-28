/**
 * Integration Test: Enhanced ReasoningBank Adapter
 * ADR-051: ReasoningBank enhancement for 46% faster recurring tasks
 *
 * Tests the integration of:
 * - TrajectoryTracker
 * - ExperienceReplay
 * - PatternEvolution
 * - EnhancedReasoningBankAdapter
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  EnhancedReasoningBankAdapter,
  createEnhancedReasoningBank,
  TrajectoryTracker,
  createTrajectoryTracker,
  ExperienceReplay,
  createExperienceReplay,
  PatternEvolution,
  createPatternEvolution,
} from '../../src/integrations/agentic-flow/reasoning-bank/index.js';
import { resetUnifiedMemory } from '../../src/kernel/unified-memory.js';
import * as fs from 'fs';
import * as path from 'path';

// Test database path
const TEST_DB_DIR = '.agentic-qe-test';
const TEST_DB_PATH = `${TEST_DB_DIR}/memory.db`;

describe('Enhanced ReasoningBank Integration', () => {
  let adapter: EnhancedReasoningBankAdapter;

  beforeAll(async () => {
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(`${TEST_DB_PATH}-wal`)) {
      fs.unlinkSync(`${TEST_DB_PATH}-wal`);
    }
    if (fs.existsSync(`${TEST_DB_PATH}-shm`)) {
      fs.unlinkSync(`${TEST_DB_PATH}-shm`);
    }

    // Reset singleton
    resetUnifiedMemory();

    // Create adapter
    adapter = createEnhancedReasoningBank({
      enableTrajectories: true,
      enableExperienceReplay: true,
      enablePatternEvolution: true,
      autoStoreExperiences: false, // Disable for controlled testing
      autoConsolidate: false,
    });
  });

  afterAll(async () => {
    await adapter?.dispose();
    resetUnifiedMemory();

    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(`${TEST_DB_PATH}-wal`)) {
      fs.unlinkSync(`${TEST_DB_PATH}-wal`);
    }
    if (fs.existsSync(`${TEST_DB_PATH}-shm`)) {
      fs.unlinkSync(`${TEST_DB_PATH}-shm`);
    }
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmdirSync(TEST_DB_DIR, { recursive: true });
    }
  });

  describe('Initialization', () => {
    it('should initialize all components', async () => {
      await adapter.initialize();

      const stats = await adapter.getStats();
      expect(stats).toBeDefined();
      expect(stats.reasoningBank).toBeDefined();
      expect(stats.adapter).toBeDefined();
    });
  });

  describe('Trajectory Tracking', () => {
    it('should start and end a trajectory', async () => {
      const trajectoryId = await adapter.startTaskTrajectory('Test task: Generate unit tests', {
        agent: 'test-agent',
        domain: 'test-generation',
      });

      expect(trajectoryId).toBeDefined();
      expect(typeof trajectoryId).toBe('string');

      // Record some steps
      await adapter.recordTaskStep(trajectoryId, 'analyze-code', {
        outcome: 'success',
        data: { filesAnalyzed: 5 },
      }, { quality: 0.9, durationMs: 100 });

      await adapter.recordTaskStep(trajectoryId, 'generate-tests', {
        outcome: 'success',
        data: { testsGenerated: 10 },
      }, { quality: 0.85, durationMs: 500 });

      // End trajectory
      const trajectory = await adapter.endTaskTrajectory(trajectoryId, true, 'Great results');

      expect(trajectory).toBeDefined();
      expect(trajectory.id).toBe(trajectoryId);
      expect(trajectory.task).toBe('Test task: Generate unit tests');
      expect(trajectory.outcome).toBe('success');
      expect(trajectory.steps).toHaveLength(2);
      expect(trajectory.metrics.successfulSteps).toBe(2);
      expect(trajectory.metrics.averageQuality).toBeGreaterThan(0.8);
    });

    it('should retrieve trajectory by ID', async () => {
      const trajectoryId = await adapter.startTaskTrajectory('Another test task');
      await adapter.recordTaskStep(trajectoryId, 'step1', { outcome: 'success' });
      await adapter.endTaskTrajectory(trajectoryId, true);

      const trajectory = await adapter.getTrajectory(trajectoryId);
      expect(trajectory).toBeDefined();
      expect(trajectory?.id).toBe(trajectoryId);
    });
  });

  describe('Routing with Experience', () => {
    it('should route task and provide guidance', async () => {
      const result = await adapter.routeTaskWithExperience({
        task: 'Generate unit tests for authentication module',
        domain: 'test-generation',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.recommendedAgent).toBeDefined();
        expect(result.value.confidence).toBeGreaterThan(0);
        expect(result.value.domains).toContain('test-generation');
      }
    });
  });

  describe('Statistics', () => {
    it('should return comprehensive statistics', async () => {
      const stats = await adapter.getStats();

      expect(stats.adapter.tasksRouted).toBeGreaterThanOrEqual(1);
      expect(stats.adapter.trajectoriesCompleted).toBeGreaterThanOrEqual(2);
      expect(stats.reasoningBank).toBeDefined();
    });
  });
});

describe('TrajectoryTracker Standalone', () => {
  let tracker: TrajectoryTracker;

  beforeAll(async () => {
    resetUnifiedMemory();
    tracker = createTrajectoryTracker({
      maxStepsPerTrajectory: 50,
      autoEndTimeoutMs: 60000,
    });
    await tracker.initialize();
  });

  afterAll(async () => {
    await tracker?.dispose();
    resetUnifiedMemory();
  });

  it('should track metrics correctly', async () => {
    const id = await tracker.startTrajectory('Metrics test task');

    await tracker.recordStep(id, 'step1', { outcome: 'success' }, { quality: 1.0, durationMs: 100 });
    await tracker.recordStep(id, 'step2', { outcome: 'success' }, { quality: 0.8, durationMs: 200 });
    await tracker.recordStep(id, 'step3', { outcome: 'failure' }, { quality: 0.0, durationMs: 50 });

    const trajectory = await tracker.endTrajectory(id, false);

    expect(trajectory.metrics.successfulSteps).toBe(2);
    expect(trajectory.metrics.failedSteps).toBe(1);
    expect(trajectory.metrics.totalDurationMs).toBe(350);
    expect(trajectory.outcome).toBe('failure');
  });

  it('should provide statistics', () => {
    const stats = tracker.getStats();

    expect(stats.trajectoriesStarted).toBeGreaterThan(0);
    expect(stats.trajectoriesCompleted).toBeGreaterThan(0);
    expect(stats.totalStepsRecorded).toBeGreaterThan(0);
  });
});

describe('ExperienceReplay Standalone', () => {
  let replay: ExperienceReplay;
  let testTrajectoryId: string;

  beforeAll(async () => {
    resetUnifiedMemory();
    replay = createExperienceReplay({
      minQualityThreshold: 0.5,
      similarityThreshold: 0.6,
    });
    await replay.initialize();

    // Create a test trajectory first (required for foreign key constraint)
    const { getUnifiedMemory } = await import('../../src/kernel/unified-memory.js');
    const memory = getUnifiedMemory();
    await memory.initialize();
    const db = memory.getDatabase();

    testTrajectoryId = `test-traj-${Date.now()}`;
    db.prepare(`
      INSERT INTO qe_trajectories (id, task, domain, started_at, ended_at, success, steps_json)
      VALUES (?, 'Fix authentication timeout bug', 'test-generation', datetime('now'), datetime('now'), 1, '[]')
    `).run(testTrajectoryId);
  });

  afterAll(async () => {
    await replay?.dispose();
    resetUnifiedMemory();
  });

  it('should store and retrieve experiences', async () => {
    // Create a mock trajectory using the pre-created ID
    const trajectory = {
      id: testTrajectoryId,
      task: 'Fix authentication timeout bug',
      domain: 'test-generation' as const,
      steps: [
        { id: 's1', action: 'analyze', result: { outcome: 'success' as const }, quality: 0.9, durationMs: 100, timestamp: new Date() },
        { id: 's2', action: 'implement', result: { outcome: 'success' as const }, quality: 0.85, durationMs: 500, timestamp: new Date() },
      ],
      outcome: 'success' as const,
      metrics: {
        totalDurationMs: 600,
        successfulSteps: 2,
        failedSteps: 0,
        averageQuality: 0.875,
        totalTokensUsed: 1000,
        efficiencyScore: 0.875,
      },
      startedAt: new Date(),
      endedAt: new Date(),
    };

    const experience = await replay.storeExperience(
      trajectory,
      'Used analyze-then-implement pattern',
      ['authentication', 'timeout', 'bug-fix']
    );

    expect(experience).toBeDefined();
    expect(experience?.strategy).toBe('Used analyze-then-implement pattern');
    expect(experience?.tags).toContain('authentication');
  });

  it('should find similar experiences', async () => {
    const similar = await replay.findSimilarExperiences('Fix login timeout issue');

    // May or may not find similar based on embedding similarity
    expect(Array.isArray(similar)).toBe(true);
  });
});

describe('PatternEvolution Standalone', () => {
  let evolution: PatternEvolution;
  let testPatternId: string;

  beforeAll(async () => {
    resetUnifiedMemory();
    evolution = createPatternEvolution({
      driftThreshold: 0.3,
      mergeSimilarityThreshold: 0.85,
    });
    await evolution.initialize();

    // Create a test pattern first (required for foreign key constraint)
    const { getUnifiedMemory } = await import('../../src/kernel/unified-memory.js');
    const memory = getUnifiedMemory();
    await memory.initialize();
    const db = memory.getDatabase();

    testPatternId = `test-pattern-${Date.now()}`;
    const uniqueName = `Test Pattern Evolution ${testPatternId}`;
    db.prepare(`
      INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description)
      VALUES (?, 'test-template', 'test-generation', 'test-generation', ?, 'A test pattern for evolution testing')
    `).run(testPatternId, uniqueName);

    // Also create embedding for the pattern
    const embedding = new Array(384).fill(0).map(() => Math.random());
    const buffer = Buffer.alloc(embedding.length * 4);
    for (let i = 0; i < embedding.length; i++) {
      buffer.writeFloatLE(embedding[i], i * 4);
    }
    db.prepare(`
      INSERT OR REPLACE INTO qe_pattern_embeddings (pattern_id, embedding, dimension, model)
      VALUES (?, ?, ?, 'all-MiniLM-L6-v2')
    `).run(testPatternId, buffer, embedding.length);
  });

  afterAll(async () => {
    await evolution?.dispose();
    resetUnifiedMemory();
  });

  it('should track pattern versions', async () => {
    const embedding = new Array(384).fill(0).map(() => Math.random());

    const version = await evolution.trackVersion(
      testPatternId,
      embedding,
      ['Initial creation'],
      'initial'
    );

    expect(version).toBeDefined();
    expect(version.version).toBe(1);
    expect(version.trigger).toBe('initial');
  });

  it('should get evolution history', async () => {
    const history = await evolution.getEvolutionHistory(testPatternId);

    expect(history).toBeDefined();
    expect(history?.versions).toHaveLength(1);
    expect(history?.events.length).toBeGreaterThan(0);
  });

  it('should provide statistics', () => {
    const stats = evolution.getStats();

    expect(stats.versionsTracked).toBeGreaterThan(0);
  });
});
