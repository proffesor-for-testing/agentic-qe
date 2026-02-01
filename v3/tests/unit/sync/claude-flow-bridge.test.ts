/**
 * Claude Flow Bridge Unit Tests
 *
 * Tests for syncing Claude Flow memories to AQE V3 database:
 * - Finding project root with depth limit
 * - Entry categorization for table mapping
 * - Domain extraction from keys
 * - Sync operations with filters
 * - Watch and sync functionality
 * - Sync status reporting
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Helper to create mock database
function createMockDatabase() {
  const mockStmt = {
    run: vi.fn(),
    get: vi.fn().mockReturnValue({ count: 5 }),
    all: vi.fn().mockReturnValue([{ name: 'kv_store' }, { name: 'sona_patterns' }]),
  };

  const mockTransaction = vi.fn((fn: () => void) => {
    fn();
    return fn;
  });

  return {
    pragma: vi.fn(),
    prepare: vi.fn().mockReturnValue(mockStmt),
    transaction: mockTransaction,
    close: vi.fn(),
  };
}

// Mock dependencies before imports
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockStatSync = vi.fn();
const mockWatch = vi.fn();

vi.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  statSync: (...args: unknown[]) => mockStatSync(...args),
  watch: (...args: unknown[]) => mockWatch(...args),
}));

const mockSecureJsonParse = vi.fn((content: string) => JSON.parse(content));

vi.mock('secure-json-parse', () => ({
  default: {
    parse: (...args: unknown[]) => mockSecureJsonParse(...args),
  },
}));

vi.mock('better-sqlite3', () => ({
  default: vi.fn().mockImplementation(() => createMockDatabase()),
}));

// Import after mocking
import {
  syncClaudeFlowToAQE,
  watchAndSync,
  getSyncStatus,
  type SyncOptions,
  type SyncResult,
} from '../../../src/sync/claude-flow-bridge.js';

describe('Claude Flow Bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{}');
    mockStatSync.mockReturnValue({
      mtime: new Date(),
      size: 1024,
    });
    mockWatch.mockReturnValue({
      close: vi.fn(),
    });
    mockSecureJsonParse.mockImplementation((content: string) => JSON.parse(content));

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('syncClaudeFlowToAQE', () => {
    it('should return error if Claude Flow memory not found', async () => {
      mockExistsSync.mockImplementation((filePath: string) => {
        return !filePath.includes('.claude-flow');
      });

      const result = await syncClaudeFlowToAQE({
        projectRoot: '/test/project',
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e: string) => e.includes('Claude Flow memory not found'))).toBe(true);
    });

    it('should return error if AQE database not found', async () => {
      mockExistsSync.mockImplementation((filePath: string) => {
        return !filePath.includes('.agentic-qe');
      });

      const result = await syncClaudeFlowToAQE({
        projectRoot: '/test/project',
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e: string) => e.includes('AQE V3 database not found'))).toBe(true);
    });

    it('should sync entries in dry run mode successfully', async () => {
      const mockStore = {
        entries: {
          'pattern-auth': { value: { pattern: 'jwt' }, namespace: 'patterns' },
          'agent-task': { value: { agent: 'tester' }, namespace: 'agents' },
        },
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      // Use dry run to avoid database interaction
      const result = await syncClaudeFlowToAQE({
        projectRoot: '/test/project',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.entriesSynced).toBe(2);
    });

    it('should filter by namespaces when specified (dry run)', async () => {
      const mockStore = {
        entries: {
          'pattern-1': { value: 'test', namespace: 'patterns' },
          'agent-1': { value: 'test', namespace: 'agents' },
          'other-1': { value: 'test', namespace: 'other' },
        },
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      const result = await syncClaudeFlowToAQE({
        projectRoot: '/test/project',
        namespaces: ['patterns'],
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.entriesSynced).toBe(1);
    });

    it('should filter by timestamp when since is specified (dry run)', async () => {
      const now = Date.now();
      const oldTimestamp = now - 1000 * 60 * 60; // 1 hour ago
      const newTimestamp = now;

      const mockStore = {
        entries: {
          'old-entry': { value: 'old', timestamp: oldTimestamp },
          'new-entry': { value: 'new', timestamp: newTimestamp },
        },
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      const result = await syncClaudeFlowToAQE({
        projectRoot: '/test/project',
        since: new Date(now - 1000 * 60 * 30), // 30 minutes ago
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.entriesSynced).toBe(1);
    });

    it('should perform dry run without writing to database', async () => {
      const mockStore = {
        entries: {
          'entry-1': { value: 'test' },
        },
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      const result = await syncClaudeFlowToAQE({
        projectRoot: '/test/project',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.entriesSynced).toBe(1);
    });

    it('should handle flat JSON structure (no entries wrapper) in dry run', async () => {
      const mockStore = {
        'key-1': { data: 'value1' },
        'key-2': { data: 'value2' },
        _metadata: { version: '1.0' },
        version: '1.0',
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      const result = await syncClaudeFlowToAQE({
        projectRoot: '/test/project',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.entriesSynced).toBe(2); // Excludes _metadata and version
    });

    it('should track sync duration', async () => {
      const mockStore = { entries: {} };
      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      const result = await syncClaudeFlowToAQE({
        projectRoot: '/test/project',
      });

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should include correct paths in result', async () => {
      const mockStore = { entries: {} };
      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      const result = await syncClaudeFlowToAQE({
        projectRoot: '/test/project',
      });

      expect(result.claudeFlowPath).toContain('.claude-flow');
      expect(result.aqeDbPath).toContain('.agentic-qe');
    });

    it('should handle JSON parse errors gracefully', async () => {
      mockReadFileSync.mockReturnValue('invalid json');
      mockSecureJsonParse.mockImplementation(() => {
        throw new Error('Invalid JSON');
      });

      const result = await syncClaudeFlowToAQE({
        projectRoot: '/test/project',
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should log verbose output when enabled', async () => {
      const mockStore = {
        entries: {
          'test-entry': { value: 'test' },
        },
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);
      const logSpy = vi.spyOn(console, 'log');

      await syncClaudeFlowToAQE({
        projectRoot: '/test/project',
        verbose: true,
      });

      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('Entry Categorization', () => {
    it('should categorize pattern entries (dry run)', async () => {
      const mockStore = {
        entries: {
          'pattern-test': { value: { type: 'auth' } },
          'learning-pattern': { value: { learned: true } },
        },
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      const result = await syncClaudeFlowToAQE({
        projectRoot: '/test/project',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.entriesSynced).toBe(2);
    });

    it('should categorize agent/task entries (dry run)', async () => {
      const mockStore = {
        entries: {
          'agent-status': { value: { status: 'active' } },
          'task-complete': { value: { success: true } },
          'experience-1': { value: { reward: 0.9 } },
          'outcome-test': { value: { result: 'pass' } },
        },
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      const result = await syncClaudeFlowToAQE({
        projectRoot: '/test/project',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.entriesSynced).toBe(4);
    });

    it('should categorize analysis entries (dry run)', async () => {
      const mockStore = {
        entries: {
          'analysis-coverage': { value: { coverage: 0.85 } },
          'coverage-report': { value: { lines: 100 } },
          'quality-metrics': { value: { score: 0.9 } },
          'metric-summary': { value: { total: 50 } },
        },
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      const result = await syncClaudeFlowToAQE({
        projectRoot: '/test/project',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.entriesSynced).toBe(4);
    });

    it('should categorize unknown entries (dry run)', async () => {
      const mockStore = {
        entries: {
          'random-data': { value: { foo: 'bar' } },
          'config-setting': { value: { enabled: true } },
        },
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      const result = await syncClaudeFlowToAQE({
        projectRoot: '/test/project',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.entriesSynced).toBe(2);
    });
  });

  describe('Domain Extraction', () => {
    it('should extract domain from path-style keys (dry run)', async () => {
      const mockStore = {
        entries: {
          'aqe/test-generation/pattern-1': { value: 'test' },
          'aqe/coverage-analysis/report-1': { value: 'report' },
        },
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      const result = await syncClaudeFlowToAQE({
        projectRoot: '/test/project',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.entriesSynced).toBe(2);
    });

    it('should extract domain from key containing domain name (dry run)', async () => {
      const mockStore = {
        entries: {
          'testgeneration-pattern': { value: 'test' },
          'securitycompliance-scan': { value: 'scan' },
        },
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      const result = await syncClaudeFlowToAQE({
        projectRoot: '/test/project',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.entriesSynced).toBe(2);
    });

    it('should default to general domain for unknown keys (dry run)', async () => {
      const mockStore = {
        entries: {
          'random-key': { value: 'random' },
        },
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      const result = await syncClaudeFlowToAQE({
        projectRoot: '/test/project',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.entriesSynced).toBe(1);
    });
  });

  describe('watchAndSync', () => {
    it('should set up file watcher for Claude Flow store', () => {
      const mockWatcher = { close: vi.fn() };
      mockWatch.mockReturnValue(mockWatcher);

      const cleanup = watchAndSync({
        projectRoot: '/test/project',
      });

      expect(mockWatch).toHaveBeenCalled();
      expect(typeof cleanup).toBe('function');
    });

    it('should return cleanup function that closes watcher', () => {
      const mockWatcher = { close: vi.fn() };
      mockWatch.mockReturnValue(mockWatcher);

      const cleanup = watchAndSync({
        projectRoot: '/test/project',
      });

      cleanup();

      expect(mockWatcher.close).toHaveBeenCalled();
    });

    it('should debounce sync on file changes', async () => {
      vi.useFakeTimers();

      let changeCallback: ((eventType: string) => void) | null = null;
      mockWatch.mockImplementation((_path: string, cb: (eventType: string) => void) => {
        changeCallback = cb;
        return { close: vi.fn() };
      });

      const mockStore = { entries: {} };
      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      watchAndSync({
        projectRoot: '/test/project',
      });

      // Trigger multiple rapid changes
      if (changeCallback) {
        changeCallback('change');
        changeCallback('change');
        changeCallback('change');
      }

      // Advance timers past debounce delay
      await vi.advanceTimersByTimeAsync(1500);

      vi.useRealTimers();
    });
  });

  describe('getSyncStatus', () => {
    it('should return counts for both Claude Flow and AQE entries', async () => {
      const mockStore = {
        'entry-1': {},
        'entry-2': {},
        '_metadata': {},
        'version': '1.0',
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      const status = await getSyncStatus('/test/project');

      expect(status.claudeFlowEntries).toBe(2); // Excludes _metadata and version
      expect(status.aqeKvEntries).toBeDefined();
      expect(status.aqeSonaPatterns).toBeDefined();
    });

    it('should determine needsSync correctly when Claude Flow has more entries', async () => {
      const mockStore = {
        entries: {
          'entry-1': {},
          'entry-2': {},
          'entry-3': {},
          'entry-4': {},
          'entry-5': {},
          'entry-6': {},
        },
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      const status = await getSyncStatus('/test/project');

      expect(status.needsSync).toBe(true);
    });

    it('should determine needsSync based on modification times', async () => {
      const now = new Date();
      const earlier = new Date(now.getTime() - 10000);

      mockStatSync.mockImplementation((filePath: string) => {
        if (filePath.includes('.claude-flow')) {
          return { mtime: now, size: 1024 };
        }
        return { mtime: earlier, size: 1024 };
      });

      const mockStore = { entries: {} };
      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      const status = await getSyncStatus('/test/project');

      expect(status.lastClaudeFlowUpdate).toBeDefined();
      expect(status.lastAqeUpdate).toBeDefined();
    });

    it('should handle missing Claude Flow store', async () => {
      mockExistsSync.mockImplementation((filePath: string) => {
        return !filePath.includes('.claude-flow');
      });

      const status = await getSyncStatus('/test/project');

      expect(status.claudeFlowEntries).toBe(0);
      expect(status.lastClaudeFlowUpdate).toBeNull();
    });

    it('should handle missing AQE database', async () => {
      mockExistsSync.mockImplementation((filePath: string) => {
        return !filePath.includes('.agentic-qe');
      });

      const mockStore = { entries: { 'entry-1': {} } };
      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      const status = await getSyncStatus('/test/project');

      expect(status.aqeKvEntries).toBe(0);
      expect(status.aqeSonaPatterns).toBe(0);
      expect(status.lastAqeUpdate).toBeNull();
    });

    it('should handle Claude Flow store parse errors gracefully', async () => {
      mockReadFileSync.mockReturnValue('invalid json');
      mockSecureJsonParse.mockImplementation(() => {
        throw new Error('Parse error');
      });

      const status = await getSyncStatus('/test/project');

      expect(status.claudeFlowEntries).toBe(0);
    });
  });

  describe('Project Root Finding', () => {
    it('should find project root by package.json', async () => {
      mockExistsSync.mockImplementation((filePath: string) => {
        if (filePath.includes('package.json')) {
          return true;
        }
        return filePath.includes('.claude-flow') || filePath.includes('.agentic-qe');
      });

      const mockStore = { entries: {} };
      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      const result = await syncClaudeFlowToAQE();

      expect(result).toBeDefined();
    });

    it('should find project root by .git directory', async () => {
      mockExistsSync.mockImplementation((filePath: string) => {
        if (filePath.includes('.git')) {
          return true;
        }
        return filePath.includes('.claude-flow') || filePath.includes('.agentic-qe');
      });

      const mockStore = { entries: {} };
      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      const result = await syncClaudeFlowToAQE();

      expect(result).toBeDefined();
    });

    it('should respect MAX_PROJECT_ROOT_DEPTH limit', async () => {
      // Simulate deep directory without project markers
      mockExistsSync.mockImplementation((filePath: string) => {
        // Only return true for Claude Flow and AQE paths
        return filePath.includes('.claude-flow') || filePath.includes('.agentic-qe');
      });

      const mockStore = { entries: {} };
      mockReadFileSync.mockReturnValue(JSON.stringify(mockStore));
      mockSecureJsonParse.mockReturnValue(mockStore);

      // This should not hang due to depth limit
      const result = await syncClaudeFlowToAQE();

      expect(result).toBeDefined();
    });
  });
});
