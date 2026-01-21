/**
 * Unit tests for AuditLogger
 *
 * @module tests/unit/infrastructure/network/AuditLogger.test
 * @see Issue #146 - Security Hardening: SP-3 Network Policy Enforcement
 */

import { AuditLogger } from '../../../../src/infrastructure/network/AuditLogger.js';
import type { AuditEntry, AuditQueryFilter } from '../../../../src/infrastructure/network/types.js';
import { writeFile, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('AuditLogger', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = new AuditLogger({ maxEntries: 100 });
  });

  afterEach(async () => {
    await logger.close();
  });

  describe('constructor', () => {
    it('should create logger with default config', () => {
      const log = new AuditLogger();
      expect(log.size()).toBe(0);
      log.close();
    });

    it('should create logger with custom config', () => {
      const log = new AuditLogger({ maxEntries: 50, debug: true });
      expect(log.size()).toBe(0);
      log.close();
    });
  });

  describe('log', () => {
    it('should log entry with auto-generated id and timestamp', async () => {
      const entry = await logger.log({
        agentId: 'agent-1',
        agentType: 'qe-test-generator',
        domain: 'api.example.com',
        action: 'allowed',
      });

      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(entry.agentId).toBe('agent-1');
      expect(entry.action).toBe('allowed');
    });

    it('should increment size', async () => {
      await logger.log({
        agentId: 'agent-1',
        agentType: 'test',
        domain: 'example.com',
        action: 'allowed',
      });

      expect(logger.size()).toBe(1);

      await logger.log({
        agentId: 'agent-2',
        agentType: 'test',
        domain: 'example.com',
        action: 'blocked',
      });

      expect(logger.size()).toBe(2);
    });

    it('should evict oldest entry when over limit', async () => {
      const smallLogger = new AuditLogger({ maxEntries: 3 });

      await smallLogger.log({
        agentId: 'agent-1',
        agentType: 'test',
        domain: 'first.com',
        action: 'allowed',
      });
      await smallLogger.log({
        agentId: 'agent-2',
        agentType: 'test',
        domain: 'second.com',
        action: 'allowed',
      });
      await smallLogger.log({
        agentId: 'agent-3',
        agentType: 'test',
        domain: 'third.com',
        action: 'allowed',
      });
      await smallLogger.log({
        agentId: 'agent-4',
        agentType: 'test',
        domain: 'fourth.com',
        action: 'allowed',
      });

      expect(smallLogger.size()).toBe(3);

      // First entry should be evicted
      const entries = await smallLogger.query({});
      expect(entries.some((e) => e.domain === 'first.com')).toBe(false);
      expect(entries.some((e) => e.domain === 'fourth.com')).toBe(true);

      await smallLogger.close();
    });
  });

  describe('logAllowed', () => {
    it('should log allowed action', async () => {
      const entry = await logger.logAllowed('agent-1', 'qe-test-generator', 'api.example.com');

      expect(entry.action).toBe('allowed');
      expect(entry.agentId).toBe('agent-1');
      expect(entry.agentType).toBe('qe-test-generator');
      expect(entry.domain).toBe('api.example.com');
    });

    it('should accept additional options', async () => {
      const entry = await logger.logAllowed('agent-1', 'test', 'example.com', {
        responseTimeMs: 150,
        responseStatus: 200,
      });

      expect(entry.responseTimeMs).toBe(150);
      expect(entry.responseStatus).toBe(200);
    });
  });

  describe('logBlocked', () => {
    it('should log blocked action with reason', async () => {
      const entry = await logger.logBlocked(
        'agent-1',
        'test',
        'blocked.com',
        'Domain not whitelisted'
      );

      expect(entry.action).toBe('blocked');
      expect(entry.reason).toBe('Domain not whitelisted');
    });
  });

  describe('logRateLimited', () => {
    it('should log rate_limited action', async () => {
      const entry = await logger.logRateLimited('agent-1', 'test', 'api.example.com');

      expect(entry.action).toBe('rate_limited');
      expect(entry.reason).toBe('Rate limit exceeded');
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      // Add sample entries
      await logger.logAllowed('agent-1', 'type-a', 'domain-1.com');
      await logger.logBlocked('agent-2', 'type-b', 'domain-2.com', 'Blocked');
      await logger.logRateLimited('agent-1', 'type-a', 'domain-1.com');
      await logger.logAllowed('agent-3', 'type-a', 'domain-3.com');
    });

    it('should return all entries without filter', async () => {
      const entries = await logger.query({});
      expect(entries.length).toBe(4);
    });

    it('should filter by agentId', async () => {
      const entries = await logger.query({ agentId: 'agent-1' });
      expect(entries.length).toBe(2);
      expect(entries.every((e) => e.agentId === 'agent-1')).toBe(true);
    });

    it('should filter by agentType', async () => {
      const entries = await logger.query({ agentType: 'type-a' });
      expect(entries.length).toBe(3);
      expect(entries.every((e) => e.agentType === 'type-a')).toBe(true);
    });

    it('should filter by domain', async () => {
      const entries = await logger.query({ domain: 'domain-1.com' });
      expect(entries.length).toBe(2);
    });

    it('should filter by action', async () => {
      const entries = await logger.query({ action: 'allowed' });
      expect(entries.length).toBe(2);
    });

    it('should filter by time range', async () => {
      const now = new Date();
      const entries = await logger.query({
        since: new Date(now.getTime() - 1000),
        until: new Date(now.getTime() + 1000),
      });
      expect(entries.length).toBe(4);
    });

    it('should apply limit', async () => {
      const entries = await logger.query({ limit: 2 });
      expect(entries.length).toBe(2);
    });

    it('should apply offset', async () => {
      const allEntries = await logger.query({});
      const offsetEntries = await logger.query({ offset: 2 });

      expect(offsetEntries.length).toBe(2);
      expect(offsetEntries[0].id).toBe(allEntries[2].id);
    });

    it('should combine filters', async () => {
      const entries = await logger.query({
        agentType: 'type-a',
        action: 'allowed',
      });
      expect(entries.length).toBe(2);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await logger.logAllowed('agent-1', 'type-a', 'domain-1.com', { responseTimeMs: 100 });
      await logger.logAllowed('agent-2', 'type-b', 'domain-1.com', { responseTimeMs: 200 });
      await logger.logBlocked('agent-1', 'type-a', 'domain-2.com', 'Blocked');
      await logger.logRateLimited('agent-3', 'type-a', 'domain-3.com');
    });

    it('should calculate total requests', async () => {
      const stats = await logger.getStats();
      expect(stats.totalRequests).toBe(4);
    });

    it('should count by action type', async () => {
      const stats = await logger.getStats();
      expect(stats.allowedRequests).toBe(2);
      expect(stats.blockedRequests).toBe(1);
      expect(stats.rateLimitedRequests).toBe(1);
    });

    it('should count by domain', async () => {
      const stats = await logger.getStats();
      expect(stats.byDomain['domain-1.com']).toBe(2);
      expect(stats.byDomain['domain-2.com']).toBe(1);
      expect(stats.byDomain['domain-3.com']).toBe(1);
    });

    it('should count by agent type', async () => {
      const stats = await logger.getStats();
      expect(stats.byAgentType['type-a']).toBe(3);
      expect(stats.byAgentType['type-b']).toBe(1);
    });

    it('should calculate average response time', async () => {
      const stats = await logger.getStats();
      expect(stats.avgResponseTimeMs).toBe(150); // (100 + 200) / 2
    });

    it('should filter by since date', async () => {
      const futureDate = new Date(Date.now() + 60000);
      const stats = await logger.getStats(futureDate);
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('getRecent', () => {
    it('should return most recent entries', async () => {
      for (let i = 0; i < 5; i++) {
        await logger.log({
          agentId: `agent-${i}`,
          agentType: 'test',
          domain: `domain-${i}.com`,
          action: 'allowed',
        });
      }

      const recent = logger.getRecent(3);
      expect(recent.length).toBe(3);
      expect(recent[0].agentId).toBe('agent-2');
      expect(recent[2].agentId).toBe('agent-4');
    });

    it('should return all entries if count exceeds size', async () => {
      await logger.logAllowed('agent-1', 'test', 'example.com');

      const recent = logger.getRecent(10);
      expect(recent.length).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all entries', async () => {
      await logger.logAllowed('agent-1', 'test', 'example.com');
      await logger.logAllowed('agent-2', 'test', 'example.com');

      expect(logger.size()).toBe(2);

      logger.clear();

      expect(logger.size()).toBe(0);
    });
  });

  describe('file persistence', () => {
    const testDir = join(tmpdir(), 'audit-logger-test');
    const testFile = join(testDir, 'audit.json');

    beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it('should export to JSON file', async () => {
      await logger.logAllowed('agent-1', 'test', 'example.com');
      await logger.logBlocked('agent-2', 'test', 'blocked.com', 'Not allowed');

      await logger.exportToJson(testFile);

      // Create new logger and import
      const newLogger = new AuditLogger();
      const count = await newLogger.importFromJson(testFile);

      expect(count).toBe(2);
      expect(newLogger.size()).toBe(2);

      await newLogger.close();
    });

    it('should handle import of non-existent file', async () => {
      const count = await logger.importFromJson('/nonexistent/path.json');
      expect(count).toBe(0);
    });

    it('should persist and load with config', async () => {
      const persistLogger = new AuditLogger({
        persistToFile: true,
        filePath: testFile,
      });

      await persistLogger.logAllowed('agent-1', 'test', 'example.com');
      await persistLogger.save();
      await persistLogger.close();

      // Create new logger and load
      const loadLogger = new AuditLogger({
        persistToFile: true,
        filePath: testFile,
      });
      await loadLogger.load();

      expect(loadLogger.size()).toBe(1);

      await loadLogger.close();
    });
  });
});
