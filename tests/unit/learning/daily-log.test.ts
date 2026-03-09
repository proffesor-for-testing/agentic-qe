/**
 * Unit Tests for DailyLogger
 *
 * Tests the daily log tier that writes human-readable Markdown
 * audit trails of learning activities.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DailyLogger, DailyLogEntry } from '../../../src/learning/daily-log.js';

// ============================================================================
// Helpers
// ============================================================================

let tmpDir: string;

function makeEntry(overrides?: Partial<DailyLogEntry>): DailyLogEntry {
  return {
    timestamp: new Date('2026-03-09T14:30:00.000Z'),
    type: 'pattern-learned',
    summary: 'Learned vitest mocking pattern',
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('DailyLogger', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-daily-log-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ==========================================================================
  // Buffering
  // ==========================================================================

  describe('buffering', () => {
    it('should buffer entries without writing until flush', () => {
      const logger = new DailyLogger({ logDir: tmpDir });
      logger.log(makeEntry());

      // No file should exist yet (only 1 entry, auto-flush at 10)
      const files = fs.readdirSync(tmpDir);
      expect(files).toHaveLength(0);

      logger.dispose();
    });

    it('should auto-flush when buffer reaches 10 entries', () => {
      const logger = new DailyLogger({ logDir: tmpDir });

      for (let i = 0; i < 10; i++) {
        logger.log(makeEntry({ summary: `Entry ${i}` }));
      }

      const files = fs.readdirSync(tmpDir);
      expect(files.length).toBeGreaterThanOrEqual(1);

      logger.dispose();
    });
  });

  // ==========================================================================
  // Markdown Output
  // ==========================================================================

  describe('markdown output', () => {
    it('should create valid Markdown with header and table rows', () => {
      const logger = new DailyLogger({ logDir: tmpDir });
      logger.log(makeEntry());
      logger.flush();

      const files = fs.readdirSync(tmpDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}\.md$/);

      const content = fs.readFileSync(path.join(tmpDir, files[0]), 'utf-8');
      expect(content).toContain('# AQE Daily Log');
      expect(content).toContain('| Time | Event | Summary |');
      expect(content).toContain('|------|-------|---------|');
      expect(content).toContain('pattern-learned');
      expect(content).toContain('Learned vitest mocking pattern');

      logger.dispose();
    });

    it('should include time from the entry timestamp', () => {
      const logger = new DailyLogger({ logDir: tmpDir });
      logger.log(makeEntry({ timestamp: new Date('2026-03-09T08:15:42.000Z') }));
      logger.flush();

      const files = fs.readdirSync(tmpDir);
      const content = fs.readFileSync(path.join(tmpDir, files[0]), 'utf-8');
      expect(content).toContain('08:15:42');

      logger.dispose();
    });
  });

  // ==========================================================================
  // Header deduplication
  // ==========================================================================

  describe('header deduplication', () => {
    it('should only add header for new files, not on subsequent flushes', () => {
      const logger = new DailyLogger({ logDir: tmpDir });

      logger.log(makeEntry({ summary: 'First entry' }));
      logger.flush();

      logger.log(makeEntry({ summary: 'Second entry' }));
      logger.flush();

      const files = fs.readdirSync(tmpDir);
      const content = fs.readFileSync(path.join(tmpDir, files[0]), 'utf-8');

      // Header should appear exactly once
      const headerMatches = content.match(/# AQE Daily Log/g);
      expect(headerMatches).toHaveLength(1);

      // Both entries should be present
      expect(content).toContain('First entry');
      expect(content).toContain('Second entry');

      logger.dispose();
    });
  });

  // ==========================================================================
  // Disabled mode
  // ==========================================================================

  describe('disabled mode', () => {
    it('should not write anything when disabled', () => {
      const logger = new DailyLogger({ logDir: tmpDir, enabled: false });

      logger.log(makeEntry());
      logger.log(makeEntry());
      logger.flush();

      const files = fs.readdirSync(tmpDir);
      expect(files).toHaveLength(0);

      logger.dispose();
    });
  });

  // ==========================================================================
  // dispose()
  // ==========================================================================

  describe('dispose', () => {
    it('should flush remaining buffered entries on dispose', () => {
      const logger = new DailyLogger({ logDir: tmpDir });
      logger.log(makeEntry({ summary: 'Disposed entry' }));

      // Not flushed yet
      expect(fs.readdirSync(tmpDir)).toHaveLength(0);

      logger.dispose();

      // Now flushed
      const files = fs.readdirSync(tmpDir);
      expect(files).toHaveLength(1);

      const content = fs.readFileSync(path.join(tmpDir, files[0]), 'utf-8');
      expect(content).toContain('Disposed entry');
    });
  });

  // ==========================================================================
  // Special character escaping
  // ==========================================================================

  describe('escaping', () => {
    it('should escape pipe characters in summary', () => {
      const logger = new DailyLogger({ logDir: tmpDir });
      logger.log(makeEntry({ summary: 'value | other | end' }));
      logger.flush();

      const files = fs.readdirSync(tmpDir);
      const content = fs.readFileSync(path.join(tmpDir, files[0]), 'utf-8');
      expect(content).toContain('value \\| other \\| end');

      logger.dispose();
    });

    it('should replace newlines in summary with spaces', () => {
      const logger = new DailyLogger({ logDir: tmpDir });
      logger.log(makeEntry({ summary: 'line1\nline2\nline3' }));
      logger.flush();

      const files = fs.readdirSync(tmpDir);
      const content = fs.readFileSync(path.join(tmpDir, files[0]), 'utf-8');
      expect(content).toContain('line1 line2 line3');
      expect(content).not.toMatch(/line1\nline2/);

      logger.dispose();
    });
  });

  // ==========================================================================
  // getTodayLogPath
  // ==========================================================================

  describe('getTodayLogPath', () => {
    it('should return a path ending in YYYY-MM-DD.md', () => {
      const logger = new DailyLogger({ logDir: tmpDir });
      const logPath = logger.getTodayLogPath();

      expect(logPath).toMatch(/\d{4}-\d{2}-\d{2}\.md$/);
      expect(logPath.startsWith(tmpDir)).toBe(true);

      logger.dispose();
    });
  });
});
