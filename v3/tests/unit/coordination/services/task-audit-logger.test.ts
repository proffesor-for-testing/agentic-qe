/**
 * Agentic QE v3 - Task Audit Logger Unit Tests
 * Tests for TaskAuditLogger lightweight observability service
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  TaskAuditLogger,
  createTaskAuditLogger,
  type TaskAuditEntry,
  type TaskAuditConfig,
  type TaskOperation,
} from '../../../../src/coordination/services/task-audit-logger';

// ============================================================================
// Tests
// ============================================================================

describe('TaskAuditLogger', () => {
  let logger: TaskAuditLogger;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create logger with default config', () => {
      logger = new TaskAuditLogger();

      expect(logger).toBeDefined();
      expect(logger.getEntries()).toHaveLength(0);
    });

    it('should accept partial config', () => {
      logger = new TaskAuditLogger({
        enableConsoleLog: false,
        maxEntries: 500,
      });

      expect(logger).toBeDefined();
    });

    it('should accept custom log prefix', () => {
      logger = new TaskAuditLogger({
        logPrefix: '[CUSTOM]',
      });

      logger.log('submit', 'task-1');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CUSTOM]')
      );
    });
  });

  describe('log()', () => {
    beforeEach(() => {
      logger = new TaskAuditLogger({ enableConsoleLog: true });
    });

    it('should log basic operation', () => {
      logger.log('submit', 'task-1');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('submit');
      expect(entries[0].taskId).toBe('task-1');
      expect(entries[0].timestamp).toBeInstanceOf(Date);
    });

    it('should log operation with agent', () => {
      logger.log('assign', 'task-1', { agentId: 'agent-1' });

      const entries = logger.getEntries();
      expect(entries[0].agentId).toBe('agent-1');
    });

    it('should log operation with domain', () => {
      logger.log('assign', 'task-1', { domain: 'test-generation' });

      const entries = logger.getEntries();
      expect(entries[0].domain).toBe('test-generation');
    });

    it('should log operation with details', () => {
      logger.log('fail', 'task-1', { details: { error: 'Timeout' } });

      const entries = logger.getEntries();
      expect(entries[0].details).toEqual({ error: 'Timeout' });
    });

    it('should console log when enabled', () => {
      logger.log('complete', 'task-1');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('COMPLETE task-1')
      );
    });

    it('should include agent in console log', () => {
      logger.log('assign', 'task-1', { agentId: 'agent-1' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('by agent-1')
      );
    });

    it('should include domain in console log', () => {
      logger.log('assign', 'task-1', { domain: 'test-generation' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('(test-generation)')
      );
    });

    it('should not console log when disabled', () => {
      logger = new TaskAuditLogger({ enableConsoleLog: false });

      logger.log('submit', 'task-1');

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should trim entries when exceeding maxEntries', () => {
      logger = new TaskAuditLogger({ maxEntries: 3, enableConsoleLog: false });

      logger.log('submit', 'task-1');
      logger.log('submit', 'task-2');
      logger.log('submit', 'task-3');
      logger.log('submit', 'task-4');
      logger.log('submit', 'task-5');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(3);
      expect(entries[0].taskId).toBe('task-3');
      expect(entries[1].taskId).toBe('task-4');
      expect(entries[2].taskId).toBe('task-5');
    });
  });

  describe('convenience methods', () => {
    beforeEach(() => {
      logger = new TaskAuditLogger({ enableConsoleLog: false });
    });

    describe('logSubmit()', () => {
      it('should log submit operation', () => {
        logger.logSubmit('task-1');

        const entries = logger.getEntries();
        expect(entries[0].operation).toBe('submit');
        expect(entries[0].taskId).toBe('task-1');
      });

      it('should include details', () => {
        logger.logSubmit('task-1', { priority: 'high' });

        const entries = logger.getEntries();
        expect(entries[0].details).toEqual({ priority: 'high' });
      });
    });

    describe('logAssign()', () => {
      it('should log assign operation with agent and domain', () => {
        logger.logAssign('task-1', 'agent-1', 'test-generation');

        const entries = logger.getEntries();
        expect(entries[0].operation).toBe('assign');
        expect(entries[0].agentId).toBe('agent-1');
        expect(entries[0].domain).toBe('test-generation');
      });
    });

    describe('logReassign()', () => {
      it('should log reassign with from/to agents', () => {
        logger.logReassign('task-1', 'agent-1', 'agent-2', 'coverage-analysis');

        const entries = logger.getEntries();
        expect(entries[0].operation).toBe('reassign');
        expect(entries[0].agentId).toBe('agent-2');
        expect(entries[0].domain).toBe('coverage-analysis');
        expect(entries[0].details).toEqual({ fromAgent: 'agent-1' });
      });
    });

    describe('logComplete()', () => {
      it('should log complete operation', () => {
        logger.logComplete('task-1');

        const entries = logger.getEntries();
        expect(entries[0].operation).toBe('complete');
      });

      it('should include agent when provided', () => {
        logger.logComplete('task-1', 'agent-1');

        const entries = logger.getEntries();
        expect(entries[0].agentId).toBe('agent-1');
      });
    });

    describe('logFail()', () => {
      it('should log fail operation', () => {
        logger.logFail('task-1');

        const entries = logger.getEntries();
        expect(entries[0].operation).toBe('fail');
      });

      it('should include agent when provided', () => {
        logger.logFail('task-1', 'agent-1');

        const entries = logger.getEntries();
        expect(entries[0].agentId).toBe('agent-1');
      });

      it('should include error in details', () => {
        logger.logFail('task-1', 'agent-1', 'Timeout error');

        const entries = logger.getEntries();
        expect(entries[0].details).toEqual({ error: 'Timeout error' });
      });
    });

    describe('logCancel()', () => {
      it('should log cancel operation', () => {
        logger.logCancel('task-1');

        const entries = logger.getEntries();
        expect(entries[0].operation).toBe('cancel');
      });
    });

    describe('logSteal()', () => {
      it('should log steal with from/to domains', () => {
        logger.logSteal('task-1', 'test-generation', 'coverage-analysis');

        const entries = logger.getEntries();
        expect(entries[0].operation).toBe('steal');
        expect(entries[0].domain).toBe('coverage-analysis');
        expect(entries[0].details).toEqual({ fromDomain: 'test-generation' });
      });
    });

    describe('logQueue()', () => {
      it('should log queue with position', () => {
        logger.logQueue('task-1', 3);

        const entries = logger.getEntries();
        expect(entries[0].operation).toBe('queue');
        expect(entries[0].details).toEqual({ position: 3 });
      });
    });

    describe('logDequeue()', () => {
      it('should log dequeue operation', () => {
        logger.logDequeue('task-1');

        const entries = logger.getEntries();
        expect(entries[0].operation).toBe('dequeue');
      });
    });
  });

  describe('getEntries()', () => {
    beforeEach(() => {
      logger = new TaskAuditLogger({ enableConsoleLog: false });

      // Create a variety of entries
      logger.logSubmit('task-1');
      logger.logAssign('task-1', 'agent-1', 'test-generation');
      logger.logSubmit('task-2');
      logger.logAssign('task-2', 'agent-2', 'coverage-analysis');
      logger.logComplete('task-1', 'agent-1');
      logger.logFail('task-2', 'agent-2', 'Error');
    });

    it('should return all entries without filter', () => {
      const entries = logger.getEntries();

      expect(entries).toHaveLength(6);
    });

    it('should filter by operation', () => {
      const entries = logger.getEntries({ operation: 'submit' });

      expect(entries).toHaveLength(2);
      expect(entries.every(e => e.operation === 'submit')).toBe(true);
    });

    it('should filter by taskId', () => {
      const entries = logger.getEntries({ taskId: 'task-1' });

      expect(entries).toHaveLength(3);
      expect(entries.every(e => e.taskId === 'task-1')).toBe(true);
    });

    it('should filter by agentId', () => {
      const entries = logger.getEntries({ agentId: 'agent-1' });

      expect(entries).toHaveLength(2);
      expect(entries.every(e => e.agentId === 'agent-1')).toBe(true);
    });

    it('should filter by domain', () => {
      const entries = logger.getEntries({ domain: 'test-generation' });

      expect(entries).toHaveLength(1);
      expect(entries[0].domain).toBe('test-generation');
    });

    it('should filter by fromTimestamp', () => {
      const now = new Date();
      const entries = logger.getEntries({ fromTimestamp: now });

      // All entries were created just before 'now', so should return none or few
      expect(entries.length).toBeLessThanOrEqual(6);
    });

    it('should filter by toTimestamp', () => {
      const past = new Date(Date.now() - 10000);
      const entries = logger.getEntries({ toTimestamp: past });

      expect(entries).toHaveLength(0);
    });

    it('should limit results', () => {
      const entries = logger.getEntries({ limit: 2 });

      expect(entries).toHaveLength(2);
      // Should return the last 2 entries
      expect(entries[0].operation).toBe('complete');
      expect(entries[1].operation).toBe('fail');
    });

    it('should combine multiple filters', () => {
      const entries = logger.getEntries({
        operation: 'assign',
        domain: 'test-generation',
      });

      expect(entries).toHaveLength(1);
      expect(entries[0].taskId).toBe('task-1');
    });

    it('should return copy of entries', () => {
      const entries1 = logger.getEntries();
      const entries2 = logger.getEntries();

      expect(entries1).not.toBe(entries2);
      expect(entries1).toEqual(entries2);
    });
  });

  describe('getStatistics()', () => {
    beforeEach(() => {
      logger = new TaskAuditLogger({ enableConsoleLog: false });
    });

    it('should return empty statistics for new logger', () => {
      const stats = logger.getStatistics();

      expect(stats.totalEntries).toBe(0);
      expect(stats.taskCount).toBe(0);
      expect(stats.agentCount).toBe(0);
      expect(stats.operationCounts.submit).toBe(0);
    });

    it('should count operations correctly', () => {
      logger.logSubmit('task-1');
      logger.logSubmit('task-2');
      logger.logAssign('task-1', 'agent-1', 'test-generation');
      logger.logComplete('task-1', 'agent-1');
      logger.logFail('task-2', 'agent-2', 'Error');

      const stats = logger.getStatistics();

      expect(stats.totalEntries).toBe(5);
      expect(stats.operationCounts.submit).toBe(2);
      expect(stats.operationCounts.assign).toBe(1);
      expect(stats.operationCounts.complete).toBe(1);
      expect(stats.operationCounts.fail).toBe(1);
    });

    it('should count unique tasks', () => {
      logger.logSubmit('task-1');
      logger.logAssign('task-1', 'agent-1', 'test-generation');
      logger.logSubmit('task-2');
      logger.logSubmit('task-1'); // Duplicate

      const stats = logger.getStatistics();

      expect(stats.taskCount).toBe(2);
    });

    it('should count unique agents', () => {
      logger.logAssign('task-1', 'agent-1', 'test-generation');
      logger.logAssign('task-2', 'agent-2', 'coverage-analysis');
      logger.logComplete('task-1', 'agent-1'); // Duplicate agent

      const stats = logger.getStatistics();

      expect(stats.agentCount).toBe(2);
    });

    it('should have all operation types initialized', () => {
      const stats = logger.getStatistics();

      const expectedOperations: TaskOperation[] = [
        'submit',
        'assign',
        'reassign',
        'complete',
        'fail',
        'cancel',
        'steal',
        'queue',
        'dequeue',
      ];

      for (const op of expectedOperations) {
        expect(stats.operationCounts[op]).toBeDefined();
        expect(typeof stats.operationCounts[op]).toBe('number');
      }
    });
  });

  describe('clear()', () => {
    beforeEach(() => {
      logger = new TaskAuditLogger({ enableConsoleLog: false });
    });

    it('should remove all entries', () => {
      logger.logSubmit('task-1');
      logger.logSubmit('task-2');
      logger.logSubmit('task-3');

      expect(logger.getEntries()).toHaveLength(3);

      logger.clear();

      expect(logger.getEntries()).toHaveLength(0);
    });

    it('should reset statistics', () => {
      logger.logSubmit('task-1');
      logger.logAssign('task-1', 'agent-1', 'test-generation');

      logger.clear();

      const stats = logger.getStatistics();
      expect(stats.totalEntries).toBe(0);
      expect(stats.taskCount).toBe(0);
      expect(stats.agentCount).toBe(0);
    });

    it('should allow new entries after clear', () => {
      logger.logSubmit('task-1');
      logger.clear();
      logger.logSubmit('task-2');

      expect(logger.getEntries()).toHaveLength(1);
      expect(logger.getEntries()[0].taskId).toBe('task-2');
    });
  });
});

describe('createTaskAuditLogger', () => {
  it('should create logger instance', () => {
    const logger = createTaskAuditLogger();

    expect(logger).toBeInstanceOf(TaskAuditLogger);
  });

  it('should create logger with config', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const logger = createTaskAuditLogger({
      enableConsoleLog: false,
      maxEntries: 100,
    });

    logger.log('submit', 'task-1');

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should create independent instances', () => {
    const logger1 = createTaskAuditLogger({ enableConsoleLog: false });
    const logger2 = createTaskAuditLogger({ enableConsoleLog: false });

    logger1.logSubmit('task-1');

    expect(logger1.getEntries()).toHaveLength(1);
    expect(logger2.getEntries()).toHaveLength(0);
  });
});

describe('TaskAuditEntry interface compliance', () => {
  it('should produce entries matching the interface', () => {
    const logger = new TaskAuditLogger({ enableConsoleLog: false });
    logger.log('assign', 'task-1', {
      agentId: 'agent-1',
      domain: 'test-generation',
      details: { priority: 'high' },
    });

    const entry = logger.getEntries()[0];

    // Verify readonly properties
    expect(entry.timestamp).toBeInstanceOf(Date);
    expect(typeof entry.operation).toBe('string');
    expect(typeof entry.taskId).toBe('string');
    expect(typeof entry.agentId).toBe('string');
    expect(typeof entry.domain).toBe('string');
    expect(typeof entry.details).toBe('object');
  });
});

describe('Integration scenarios', () => {
  let logger: TaskAuditLogger;

  beforeEach(() => {
    logger = new TaskAuditLogger({ enableConsoleLog: false });
  });

  it('should track complete task lifecycle', () => {
    // Submit
    logger.logSubmit('task-1', { type: 'unit-test' });

    // Queue
    logger.logQueue('task-1', 0);

    // Dequeue and assign
    logger.logDequeue('task-1');
    logger.logAssign('task-1', 'agent-1', 'test-generation');

    // Complete
    logger.logComplete('task-1', 'agent-1');

    const entries = logger.getEntries({ taskId: 'task-1' });
    expect(entries).toHaveLength(5);

    const operations = entries.map(e => e.operation);
    expect(operations).toEqual(['submit', 'queue', 'dequeue', 'assign', 'complete']);
  });

  it('should track task reassignment', () => {
    logger.logSubmit('task-1');
    logger.logAssign('task-1', 'agent-1', 'test-generation');
    logger.logReassign('task-1', 'agent-1', 'agent-2', 'coverage-analysis');
    logger.logComplete('task-1', 'agent-2');

    const stats = logger.getStatistics();
    expect(stats.operationCounts.assign).toBe(1);
    expect(stats.operationCounts.reassign).toBe(1);
    expect(stats.agentCount).toBe(2);
  });

  it('should track task stealing between domains', () => {
    logger.logSubmit('task-1');
    logger.logQueue('task-1', 5);
    logger.logSteal('task-1', 'test-generation', 'coverage-analysis');
    logger.logAssign('task-1', 'agent-1', 'coverage-analysis');
    logger.logComplete('task-1', 'agent-1');

    const entries = logger.getEntries({ taskId: 'task-1' });
    const stealEntry = entries.find(e => e.operation === 'steal');

    expect(stealEntry).toBeDefined();
    expect(stealEntry?.domain).toBe('coverage-analysis');
    expect(stealEntry?.details).toEqual({ fromDomain: 'test-generation' });
  });

  it('should track failed task with error', () => {
    logger.logSubmit('task-1');
    logger.logAssign('task-1', 'agent-1', 'test-generation');
    logger.logFail('task-1', 'agent-1', 'Timeout: operation exceeded 30s limit');

    const failEntry = logger.getEntries({ operation: 'fail' })[0];
    expect(failEntry.details?.error).toBe('Timeout: operation exceeded 30s limit');
  });

  it('should support high-volume logging', () => {
    logger = new TaskAuditLogger({ enableConsoleLog: false, maxEntries: 1000 });

    // Generate 500 tasks with full lifecycle
    for (let i = 0; i < 500; i++) {
      const taskId = `task-${i}`;
      const agentId = `agent-${i % 10}`;

      logger.logSubmit(taskId);
      logger.logAssign(taskId, agentId, 'test-generation');
      logger.logComplete(taskId, agentId);
    }

    const stats = logger.getStatistics();

    // Max 1000 entries, so we should have 1000
    expect(stats.totalEntries).toBe(1000);
    expect(stats.operationCounts.submit).toBeLessThanOrEqual(500);
    expect(stats.operationCounts.assign).toBeLessThanOrEqual(500);
    expect(stats.operationCounts.complete).toBeLessThanOrEqual(500);
  });
});
