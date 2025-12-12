/**
 * ExperienceCapture Integration Test
 *
 * MISSION: Validate experience capture functionality for learning
 *
 * This test validates:
 * 1. ExperienceCapture singleton pattern
 * 2. Capturing agent execution events
 * 3. Buffer management and flushing
 * 4. Database persistence
 * 5. Experience retrieval and querying
 * 6. Statistics tracking
 */

import { ExperienceCapture, AgentExecutionEvent, CapturedExperience } from '../../../src/learning/capture/ExperienceCapture';
import path from 'path';
import fs from 'fs/promises';

describe('ExperienceCapture Integration', () => {
  const testDbPath = path.join(process.cwd(), '.test-data', 'experience-capture-test.db');
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

  describe('Singleton Pattern', () => {
    it('should create shared instance', async () => {
      const instance1 = await ExperienceCapture.getSharedInstance({ dbPath: testDbPath });
      const instance2 = await ExperienceCapture.getSharedInstance({ dbPath: testDbPath });

      expect(instance1).toBe(instance2);

      await instance1.stop();
      instance1.close();
    });

    it('should handle concurrent initialization', async () => {
      const instances = await Promise.all([
        ExperienceCapture.getSharedInstance({ dbPath: testDbPath }),
        ExperienceCapture.getSharedInstance({ dbPath: testDbPath }),
        ExperienceCapture.getSharedInstance({ dbPath: testDbPath }),
      ]);

      expect(instances[0]).toBe(instances[1]);
      expect(instances[1]).toBe(instances[2]);

      await instances[0].stop();
      instances[0].close();
    });

    it('should reset instance for testing', async () => {
      const instance1 = await ExperienceCapture.getSharedInstance({ dbPath: testDbPath });
      await instance1.stop();
      instance1.close();

      ExperienceCapture.resetInstance();

      const instance2 = await ExperienceCapture.getSharedInstance({ dbPath: testDbPath });
      expect(instance2).not.toBe(instance1);

      await instance2.stop();
      instance2.close();
    });
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', async () => {
      experienceCapture = new ExperienceCapture({ dbPath: testDbPath });
      await experienceCapture.start();

      const stats = experienceCapture.getStats();
      expect(stats.totalCaptured).toBe(0);
      expect(stats.bufferSize).toBe(0);
    });

    it('should initialize with custom configuration', async () => {
      experienceCapture = new ExperienceCapture({
        dbPath: testDbPath,
        bufferSize: 50,
        flushInterval: 15000,
        debug: true,
      });

      await experienceCapture.start();
      const stats = experienceCapture.getStats();
      expect(stats).toBeDefined();
    });

    it('should create database schema on initialization', async () => {
      experienceCapture = new ExperienceCapture({ dbPath: testDbPath });

      // Schema should be created in constructor
      const experiences = experienceCapture.getRecentExperiences(1);
      expect(Array.isArray(experiences)).toBe(true);
    });
  });

  describe('Lifecycle Management', () => {
    it('should start and stop capture', async () => {
      experienceCapture = new ExperienceCapture({ dbPath: testDbPath });

      let startedEmitted = false;
      experienceCapture.on('started', () => {
        startedEmitted = true;
      });

      await experienceCapture.start();
      expect(startedEmitted).toBe(true);

      let stoppedEmitted = false;
      experienceCapture.on('stopped', () => {
        stoppedEmitted = true;
      });

      await experienceCapture.stop();
      expect(stoppedEmitted).toBe(true);
    });

    it('should not start multiple times', async () => {
      experienceCapture = new ExperienceCapture({ dbPath: testDbPath });

      await experienceCapture.start();
      await experienceCapture.start(); // Should warn but not error

      await experienceCapture.stop();
    });

    it('should flush buffer on stop', async () => {
      experienceCapture = new ExperienceCapture({
        dbPath: testDbPath,
        bufferSize: 100,
      });

      await experienceCapture.start();

      // Capture some events
      const event: AgentExecutionEvent = {
        agentId: 'agent-1',
        agentType: 'test-generator',
        taskId: 'task-1',
        taskType: 'unit-test-generation',
        input: { sourceFile: 'test.ts' },
        output: { testsGenerated: 5 },
        duration: 1000,
        success: true,
        timestamp: new Date(),
      };

      await experienceCapture.captureExecution(event);

      const statsBeforeStop = experienceCapture.getStats();
      expect(statsBeforeStop.bufferSize).toBe(1);

      await experienceCapture.stop();

      const statsAfterStop = experienceCapture.getStats();
      expect(statsAfterStop.bufferSize).toBe(0);
      expect(statsAfterStop.totalFlushed).toBe(1);
    });
  });

  describe('Capturing Executions', () => {
    beforeEach(async () => {
      experienceCapture = new ExperienceCapture({
        dbPath: testDbPath,
        bufferSize: 10,
        flushInterval: 60000, // Long interval to control flushing
      });
      await experienceCapture.start();
    });

    it('should capture successful execution', async () => {
      const event: AgentExecutionEvent = {
        agentId: 'agent-123',
        agentType: 'test-generator',
        taskId: 'task-456',
        taskType: 'unit-test-generation',
        input: { sourceFile: 'UserService.ts' },
        output: { testsGenerated: 10, patterns: ['pattern-1'] },
        duration: 2000,
        success: true,
        metrics: { coverage: 85, testsGenerated: 10 },
        timestamp: new Date(),
      };

      const expId = await experienceCapture.captureExecution(event);

      expect(expId).toBeDefined();
      expect(expId.startsWith('exp-')).toBe(true);

      const stats = experienceCapture.getStats();
      expect(stats.totalCaptured).toBe(1);
      expect(stats.bufferSize).toBe(1);
      expect(stats.byAgentType['test-generator']).toBe(1);
      expect(stats.byTaskType['unit-test-generation']).toBe(1);
      expect(stats.successRate).toBe(1.0);
    });

    it('should capture failed execution', async () => {
      const event: AgentExecutionEvent = {
        agentId: 'agent-789',
        agentType: 'coverage-analyzer',
        taskId: 'task-999',
        taskType: 'coverage-analysis',
        input: { targetFile: 'app.ts' },
        output: {},
        duration: 500,
        success: false,
        error: new Error('Analysis failed'),
        timestamp: new Date(),
      };

      const expId = await experienceCapture.captureExecution(event);

      expect(expId).toBeDefined();

      const stats = experienceCapture.getStats();
      expect(stats.totalCaptured).toBe(1);
      expect(stats.successRate).toBe(0.0);
    });

    it('should emit captured event', async () => {
      let capturedExp: CapturedExperience | null = null;
      experienceCapture.on('captured', (exp: CapturedExperience) => {
        capturedExp = exp;
      });

      const event: AgentExecutionEvent = {
        agentId: 'agent-1',
        agentType: 'test-generator',
        taskId: 'task-1',
        taskType: 'unit-test',
        input: {},
        output: {},
        duration: 1000,
        success: true,
        timestamp: new Date(),
      };

      await experienceCapture.captureExecution(event);

      expect(capturedExp).not.toBeNull();
      expect(capturedExp?.agentType).toBe('test-generator');
      expect(capturedExp?.taskType).toBe('unit-test');
    });

    it('should extract patterns and decisions', async () => {
      const event: AgentExecutionEvent = {
        agentId: 'agent-1',
        agentType: 'test-generator',
        taskId: 'task-1',
        taskType: 'test-generation',
        input: {},
        output: {
          patterns: ['pattern-1', 'pattern-2'],
          framework: 'jest',
          strategy: 'TDD',
        },
        duration: 1000,
        success: true,
        timestamp: new Date(),
      };

      let capturedExp: CapturedExperience | null = null;
      experienceCapture.on('captured', (exp) => {
        capturedExp = exp;
      });

      await experienceCapture.captureExecution(event);

      expect(capturedExp?.context.patterns_used.length).toBeGreaterThan(0);
      expect(capturedExp?.context.decisions_made).toContain('framework:jest');
      expect(capturedExp?.context.decisions_made).toContain('strategy:TDD');
    });

    it('should calculate quality scores', async () => {
      const highQualityEvent: AgentExecutionEvent = {
        agentId: 'agent-1',
        agentType: 'test-generator',
        taskId: 'task-1',
        taskType: 'test',
        input: {},
        output: {},
        duration: 2000,
        success: true,
        metrics: { coverage: 95, testsGenerated: 20, duration: 3000 },
        timestamp: new Date(),
      };

      let capturedExp: CapturedExperience | null = null;
      experienceCapture.on('captured', (exp) => {
        capturedExp = exp;
      });

      await experienceCapture.captureExecution(highQualityEvent);

      expect(capturedExp?.outcome.quality_score).toBeGreaterThan(0.5);
      expect(capturedExp?.outcome.quality_score).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Buffer Management', () => {
    it('should auto-flush when buffer is full', async () => {
      experienceCapture = new ExperienceCapture({
        dbPath: testDbPath,
        bufferSize: 3,
        flushInterval: 60000,
      });

      await experienceCapture.start();

      let flushedCount = 0;
      experienceCapture.on('flushed', ({ count }) => {
        flushedCount += count;
      });

      // Add 3 events to fill buffer
      for (let i = 0; i < 3; i++) {
        await experienceCapture.captureExecution({
          agentId: `agent-${i}`,
          agentType: 'test-agent',
          taskId: `task-${i}`,
          taskType: 'test-task',
          input: {},
          output: {},
          duration: 1000,
          success: true,
          timestamp: new Date(),
        });
      }

      expect(flushedCount).toBe(3);

      const stats = experienceCapture.getStats();
      expect(stats.bufferSize).toBe(0); // Buffer cleared
      expect(stats.totalFlushed).toBe(3);
    });

    it('should flush periodically', async () => {
      experienceCapture = new ExperienceCapture({
        dbPath: testDbPath,
        bufferSize: 100,
        flushInterval: 500, // 500ms for testing
      });

      await experienceCapture.start();

      let flushed = false;
      experienceCapture.on('flushed', () => {
        flushed = true;
      });

      // Add one event
      await experienceCapture.captureExecution({
        agentId: 'agent-1',
        agentType: 'test',
        taskId: 'task-1',
        taskType: 'test',
        input: {},
        output: {},
        duration: 1000,
        success: true,
        timestamp: new Date(),
      });

      // Wait for periodic flush
      await new Promise(resolve => setTimeout(resolve, 600));

      expect(flushed).toBe(true);
    });

    it('should manually flush buffer', async () => {
      experienceCapture = new ExperienceCapture({
        dbPath: testDbPath,
        bufferSize: 100,
        flushInterval: 60000,
      });

      await experienceCapture.start();

      // Add events
      await experienceCapture.captureExecution({
        agentId: 'agent-1',
        agentType: 'test',
        taskId: 'task-1',
        taskType: 'test',
        input: {},
        output: {},
        duration: 1000,
        success: true,
        timestamp: new Date(),
      });

      const statsBefore = experienceCapture.getStats();
      expect(statsBefore.bufferSize).toBe(1);

      const flushedCount = await experienceCapture.flush();

      expect(flushedCount).toBe(1);

      const statsAfter = experienceCapture.getStats();
      expect(statsAfter.bufferSize).toBe(0);
      expect(statsAfter.totalFlushed).toBe(1);
    });
  });

  describe('Database Persistence', () => {
    it('should persist experiences to database', async () => {
      experienceCapture = new ExperienceCapture({
        dbPath: testDbPath,
        bufferSize: 1,
      });

      await experienceCapture.start();

      await experienceCapture.captureExecution({
        agentId: 'agent-1',
        agentType: 'test-generator',
        taskId: 'task-1',
        taskType: 'unit-test',
        input: { file: 'test.ts' },
        output: { tests: 5 },
        duration: 1000,
        success: true,
        timestamp: new Date(),
      });

      // Should auto-flush due to bufferSize: 1
      const experiences = experienceCapture.getUnprocessedExperiences(10);

      expect(experiences.length).toBe(1);
      expect(experiences[0].agentType).toBe('test-generator');
      expect(experiences[0].taskType).toBe('unit-test');
    });

    it('should retrieve unprocessed experiences', async () => {
      experienceCapture = new ExperienceCapture({
        dbPath: testDbPath,
        bufferSize: 1,
      });

      await experienceCapture.start();

      // Add multiple experiences
      for (let i = 0; i < 5; i++) {
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

      const unprocessed = experienceCapture.getUnprocessedExperiences(10);
      expect(unprocessed.length).toBe(5);
    });

    it('should mark experiences as processed', async () => {
      experienceCapture = new ExperienceCapture({
        dbPath: testDbPath,
        bufferSize: 1,
      });

      await experienceCapture.start();

      await experienceCapture.captureExecution({
        agentId: 'agent-1',
        agentType: 'test',
        taskId: 'task-1',
        taskType: 'test',
        input: {},
        output: {},
        duration: 1000,
        success: true,
        timestamp: new Date(),
      });

      const unprocessed = experienceCapture.getUnprocessedExperiences(10);
      expect(unprocessed.length).toBe(1);

      const expId = unprocessed[0].id;
      experienceCapture.markAsProcessed([expId]);

      const stillUnprocessed = experienceCapture.getUnprocessedExperiences(10);
      expect(stillUnprocessed.length).toBe(0);
    });
  });

  describe('Experience Retrieval', () => {
    beforeEach(async () => {
      experienceCapture = new ExperienceCapture({
        dbPath: testDbPath,
        bufferSize: 1,
      });
      await experienceCapture.start();
    });

    it('should get experiences by agent type', async () => {
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

      const testGenExperiences = experienceCapture.getExperiencesByAgentType('test-generator', 10);
      expect(testGenExperiences.length).toBe(1);
      expect(testGenExperiences[0].agentType).toBe('test-generator');
    });

    it('should get recent experiences', async () => {
      // Add old experience (24+ hours ago)
      const oldTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000);

      await experienceCapture.captureExecution({
        agentId: 'agent-old',
        agentType: 'test',
        taskId: 'task-old',
        taskType: 'test',
        input: {},
        output: {},
        duration: 1000,
        success: true,
        timestamp: oldTimestamp,
      });

      // Add recent experience
      await experienceCapture.captureExecution({
        agentId: 'agent-recent',
        agentType: 'test',
        taskId: 'task-recent',
        taskType: 'test',
        input: {},
        output: {},
        duration: 1000,
        success: true,
        timestamp: new Date(),
      });

      const recentExperiences = experienceCapture.getRecentExperiences(24, 10);
      expect(recentExperiences.length).toBeGreaterThan(0);
      // Should include only recent ones (implementation specific)
    });
  });

  describe('Statistics Tracking', () => {
    beforeEach(async () => {
      experienceCapture = new ExperienceCapture({
        dbPath: testDbPath,
        bufferSize: 10,
      });
      await experienceCapture.start();
    });

    it('should track total captured and flushed', async () => {
      await experienceCapture.captureExecution({
        agentId: 'agent-1',
        agentType: 'test',
        taskId: 'task-1',
        taskType: 'test',
        input: {},
        output: {},
        duration: 1000,
        success: true,
        timestamp: new Date(),
      });

      const stats = experienceCapture.getStats();
      expect(stats.totalCaptured).toBe(1);
      expect(stats.bufferSize).toBe(1);
      expect(stats.totalFlushed).toBe(0);

      await experienceCapture.flush();

      const statsAfterFlush = experienceCapture.getStats();
      expect(statsAfterFlush.totalFlushed).toBe(1);
    });

    it('should track by agent type', async () => {
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
        agentType: 'test-generator',
        taskId: 'task-2',
        taskType: 'test',
        input: {},
        output: {},
        duration: 1000,
        success: true,
        timestamp: new Date(),
      });

      const stats = experienceCapture.getStats();
      expect(stats.byAgentType['test-generator']).toBe(2);
    });

    it('should track by task type', async () => {
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

      const stats = experienceCapture.getStats();
      expect(stats.byTaskType['unit-test']).toBe(1);
      expect(stats.byTaskType['integration-test']).toBe(1);
    });

    it('should calculate success rate', async () => {
      await experienceCapture.captureExecution({
        agentId: 'agent-1',
        agentType: 'test',
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
        agentType: 'test',
        taskId: 'task-2',
        taskType: 'test',
        input: {},
        output: {},
        duration: 1000,
        success: false,
        timestamp: new Date(),
      });

      const stats = experienceCapture.getStats();
      expect(stats.successRate).toBe(0.5);
    });

    it('should track last flush time', async () => {
      await experienceCapture.captureExecution({
        agentId: 'agent-1',
        agentType: 'test',
        taskId: 'task-1',
        taskType: 'test',
        input: {},
        output: {},
        duration: 1000,
        success: true,
        timestamp: new Date(),
      });

      const statsBefore = experienceCapture.getStats();
      expect(statsBefore.lastFlush).toBeNull();

      await experienceCapture.flush();

      const statsAfter = experienceCapture.getStats();
      expect(statsAfter.lastFlush).toBeInstanceOf(Date);
    });
  });
});
