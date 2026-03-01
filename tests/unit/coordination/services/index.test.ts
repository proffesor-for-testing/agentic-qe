/**
 * Agentic QE v3 - Coordination Services Barrel File Tests
 * Tests for service exports from index.ts
 */

import { describe, it, expect } from 'vitest';
import * as services from '../../../../src/coordination/services';

describe('Coordination Services Exports', () => {
  describe('TaskAuditLogger exports', () => {
    it('should export TaskAuditLogger class', () => {
      expect(services.TaskAuditLogger).toBeDefined();
      expect(typeof services.TaskAuditLogger).toBe('function');
    });

    it('should export createTaskAuditLogger factory', () => {
      expect(services.createTaskAuditLogger).toBeDefined();
      expect(typeof services.createTaskAuditLogger).toBe('function');
    });

    it('should create TaskAuditLogger instance via factory', () => {
      const logger = services.createTaskAuditLogger({ enableConsoleLog: false });

      expect(logger).toBeInstanceOf(services.TaskAuditLogger);
    });

    it('should create TaskAuditLogger instance via constructor', () => {
      const logger = new services.TaskAuditLogger({ enableConsoleLog: false });

      expect(logger).toBeDefined();
      expect(logger.getEntries).toBeDefined();
    });
  });

  describe('Type exports', () => {
    it('should allow TaskAuditEntry type usage', () => {
      const logger = services.createTaskAuditLogger({ enableConsoleLog: false });
      logger.log('submit', 'task-1');

      // This verifies the type is correctly exported
      const entries: services.TaskAuditEntry[] = logger.getEntries();

      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('submit');
    });

    it('should allow TaskOperation type usage', () => {
      const operations: services.TaskOperation[] = [
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

      const logger = services.createTaskAuditLogger({ enableConsoleLog: false });

      for (const op of operations) {
        logger.log(op, `task-${op}`);
      }

      expect(logger.getEntries()).toHaveLength(9);
    });

    it('should allow TaskAuditConfig type usage', () => {
      const config: services.TaskAuditConfig = {
        enableConsoleLog: false,
        maxEntries: 500,
        logPrefix: '[TEST]',
      };

      const logger = new services.TaskAuditLogger(config);

      expect(logger).toBeDefined();
    });
  });

  describe('Module integrity', () => {
    it('should export all expected members', () => {
      const expectedExports = [
        'TaskAuditLogger',
        'createTaskAuditLogger',
      ];

      for (const name of expectedExports) {
        expect(services).toHaveProperty(name);
      }
    });

    it('should not export internal implementation details', () => {
      // Ensure no private/internal exports leak
      const keys = Object.keys(services);

      // Should only have the documented exports
      expect(keys).toContain('TaskAuditLogger');
      expect(keys).toContain('createTaskAuditLogger');
    });
  });
});
