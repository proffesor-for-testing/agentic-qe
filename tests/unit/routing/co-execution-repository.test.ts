/**
 * Co-Execution Repository Tests
 * Issue #342, Item 3: Behavioral Co-Execution Tracking
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { CoExecutionRepository } from '../../../src/routing/co-execution-repository.js';

describe('CoExecutionRepository (Issue #342 Item 3)', () => {
  let db: Database.Database;
  let repo: CoExecutionRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    repo = new CoExecutionRepository();
    repo.initialize(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('initialize', () => {
    it('should create co-execution table', () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='qe_agent_co_execution'",
      ).all();
      expect(tables).toHaveLength(1);
    });

    it('should be idempotent', () => {
      // Second initialize should not throw
      repo.initialize(db);
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='qe_agent_co_execution'",
      ).all();
      expect(tables).toHaveLength(1);
    });
  });

  describe('recordCoExecution', () => {
    it('should record a successful co-execution', () => {
      repo.recordCoExecution({
        agentA: 'qe-test-generator',
        agentB: 'qe-coverage-specialist',
        domain: 'test-generation',
        success: true,
      });

      const rows = db.prepare('SELECT * FROM qe_agent_co_execution').all();
      expect(rows).toHaveLength(1);
    });

    it('should normalize agent pair order (sorted alphabetically)', () => {
      repo.recordCoExecution({
        agentA: 'qe-z-agent',
        agentB: 'qe-a-agent',
        domain: 'test-generation',
        success: true,
      });

      const row = db.prepare('SELECT agent_a, agent_b FROM qe_agent_co_execution').get() as {
        agent_a: string; agent_b: string;
      };
      // Should be sorted: qe-a-agent < qe-z-agent
      expect(row.agent_a).toBe('qe-a-agent');
      expect(row.agent_b).toBe('qe-z-agent');
    });

    it('should truncate long task descriptions to 500 chars', () => {
      const longDesc = 'x'.repeat(1000);
      repo.recordCoExecution({
        agentA: 'qe-a',
        agentB: 'qe-b',
        domain: 'test',
        success: true,
        taskDescription: longDesc,
      });

      const row = db.prepare('SELECT task_description FROM qe_agent_co_execution').get() as {
        task_description: string;
      };
      expect(row.task_description.length).toBe(500);
    });

    it('should handle null task description', () => {
      repo.recordCoExecution({
        agentA: 'qe-a',
        agentB: 'qe-b',
        domain: 'test',
        success: false,
      });

      const row = db.prepare('SELECT task_description FROM qe_agent_co_execution').get() as {
        task_description: string | null;
      };
      expect(row.task_description).toBeNull();
    });
  });

  describe('getCoExecutionStats', () => {
    it('should return stats with behavioral confidence', () => {
      // Record 10 successful co-executions
      for (let i = 0; i < 10; i++) {
        repo.recordCoExecution({
          agentA: 'qe-gen',
          agentB: 'qe-cov',
          domain: 'test',
          success: true,
        });
      }

      const stats = repo.getCoExecutionStats('qe-gen', 'qe-cov');

      expect(stats).not.toBeNull();
      expect(stats!.successCount).toBe(10);
      expect(stats!.totalExecutions).toBe(10);
      expect(stats!.successRate).toBe(1.0);
      // Linear ramp: min(1.0, 10/20) = 0.5
      expect(stats!.behavioralConfidence).toBeCloseTo(0.5, 4);
    });

    it('should return full confidence at 20 successes', () => {
      for (let i = 0; i < 20; i++) {
        repo.recordCoExecution({
          agentA: 'qe-a',
          agentB: 'qe-b',
          domain: 'test',
          success: true,
        });
      }

      const stats = repo.getCoExecutionStats('qe-a', 'qe-b');
      expect(stats!.behavioralConfidence).toBe(1.0);
    });

    it('should normalize pair order in lookups', () => {
      repo.recordCoExecution({
        agentA: 'qe-z',
        agentB: 'qe-a',
        domain: 'test',
        success: true,
      });

      // Look up in reverse order -- should still find the record
      const stats = repo.getCoExecutionStats('qe-z', 'qe-a');
      expect(stats).not.toBeNull();
      expect(stats!.totalExecutions).toBe(1);
    });

    it('should return null for unknown pair', () => {
      const stats = repo.getCoExecutionStats('qe-unknown1', 'qe-unknown2');
      expect(stats).toBeNull();
    });

    it('should track mixed success/failure', () => {
      for (let i = 0; i < 8; i++) {
        repo.recordCoExecution({
          agentA: 'qe-a',
          agentB: 'qe-b',
          domain: 'test',
          success: true,
        });
      }
      for (let i = 0; i < 2; i++) {
        repo.recordCoExecution({
          agentA: 'qe-a',
          agentB: 'qe-b',
          domain: 'test',
          success: false,
        });
      }

      const stats = repo.getCoExecutionStats('qe-a', 'qe-b');
      expect(stats!.totalExecutions).toBe(10);
      expect(stats!.successCount).toBe(8);
      expect(stats!.successRate).toBeCloseTo(0.8, 4);
      // Behavioral confidence based on success count: min(1.0, 8/20) = 0.4
      expect(stats!.behavioralConfidence).toBeCloseTo(0.4, 4);
    });
  });

  describe('getCoExecutionPartners', () => {
    it('should return partners sorted by success count', () => {
      // qe-a with qe-b: 5 successes
      for (let i = 0; i < 5; i++) {
        repo.recordCoExecution({ agentA: 'qe-a', agentB: 'qe-b', domain: 'test', success: true });
      }
      // qe-a with qe-c: 10 successes
      for (let i = 0; i < 10; i++) {
        repo.recordCoExecution({ agentA: 'qe-a', agentB: 'qe-c', domain: 'test', success: true });
      }

      const partners = repo.getCoExecutionPartners('qe-a');

      expect(partners).toHaveLength(2);
      expect(partners[0].successCount).toBeGreaterThan(partners[1].successCount);
    });

    it('should respect limit parameter', () => {
      for (const partner of ['qe-b', 'qe-c', 'qe-d', 'qe-e']) {
        repo.recordCoExecution({
          agentA: 'qe-a',
          agentB: partner,
          domain: 'test',
          success: true,
        });
      }

      const partners = repo.getCoExecutionPartners('qe-a', 2);
      expect(partners).toHaveLength(2);
    });

    it('should return empty for unknown agent', () => {
      const partners = repo.getCoExecutionPartners('qe-unknown');
      expect(partners).toHaveLength(0);
    });
  });

  describe('recordSwarmCoExecution', () => {
    it('should record all pairs from a swarm', () => {
      repo.recordSwarmCoExecution(
        ['qe-a', 'qe-b', 'qe-c'],
        'test-generation',
        true,
        'Generate tests for auth module',
      );

      // 3 agents = 3 pairs: (a,b), (a,c), (b,c)
      const rows = db.prepare('SELECT * FROM qe_agent_co_execution').all();
      expect(rows).toHaveLength(3);
    });

    it('should skip if fewer than 2 agents', () => {
      repo.recordSwarmCoExecution(['qe-only'], 'test', true);
      const rows = db.prepare('SELECT * FROM qe_agent_co_execution').all();
      expect(rows).toHaveLength(0);
    });

    it('should normalize pair order within swarm', () => {
      repo.recordSwarmCoExecution(['qe-z', 'qe-a'], 'test', true);

      const row = db.prepare('SELECT agent_a, agent_b FROM qe_agent_co_execution').get() as {
        agent_a: string; agent_b: string;
      };
      expect(row.agent_a).toBe('qe-a');
      expect(row.agent_b).toBe('qe-z');
    });

    it('should handle large swarms efficiently (transaction)', () => {
      const agents = Array.from({ length: 10 }, (_, i) => `qe-agent-${i}`);
      repo.recordSwarmCoExecution(agents, 'test', true);

      // 10 agents = 10*9/2 = 45 pairs
      const count = db.prepare('SELECT COUNT(*) as cnt FROM qe_agent_co_execution').get() as { cnt: number };
      expect(count.cnt).toBe(45);
    });
  });

  describe('Graceful degradation', () => {
    it('should not throw when db is not initialized', () => {
      const uninitRepo = new CoExecutionRepository();

      // All methods should return gracefully
      expect(() => uninitRepo.recordCoExecution({
        agentA: 'a', agentB: 'b', domain: 'test', success: true,
      })).not.toThrow();

      expect(uninitRepo.getCoExecutionStats('a', 'b')).toBeNull();
      expect(uninitRepo.getCoExecutionPartners('a')).toEqual([]);
    });
  });
});
