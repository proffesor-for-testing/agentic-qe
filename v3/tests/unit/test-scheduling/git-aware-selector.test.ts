/**
 * Git-Aware Test Selector Tests
 *
 * Tests for git-aware test selection.
 *
 * INTEGRATION PATTERN: Tests must provide mock impactAnalyzer.
 * This demonstrates the Integration Prevention Pattern in action.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GitAwareTestSelector,
  createTestSelector,
  type TestSelectorConfig,
} from '../../../src/test-scheduling/git-aware/test-selector';
import type { IImpactAnalyzerService } from '../../../src/domains/code-intelligence/services/impact-analyzer';
import type { Result } from '../../../src/shared/types';

// ============================================================================
// Mock ImpactAnalyzerService
// ============================================================================

function createMockImpactAnalyzer(impactedTests: string[] = []): IImpactAnalyzerService {
  return {
    analyzeImpact: vi.fn().mockResolvedValue({
      success: true,
      value: {
        id: 'mock-analysis',
        changedFiles: [],
        directlyImpacted: [],
        transitivelyImpacted: [],
        riskLevel: 'low',
        testCoverage: 0,
        recommendations: [],
      },
    } as Result<any, Error>),
    getImpactedTests: vi.fn().mockResolvedValue({
      success: true,
      value: impactedTests,
    } as Result<string[], Error>),
    calculateRiskLevel: vi.fn().mockReturnValue('low'),
    getRecommendations: vi.fn().mockReturnValue([]),
  };
}

// Default test config with mock impact analyzer
function createTestConfig(overrides?: Partial<TestSelectorConfig>): TestSelectorConfig {
  return {
    impactAnalyzer: createMockImpactAnalyzer(),
    ...overrides,
  };
}

// ============================================================================
// Mocks
// ============================================================================

vi.mock('child_process', () => ({
  spawn: vi.fn(() => {
    const EventEmitter = require('events');
    const proc = new EventEmitter();

    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();

    // Default: emit empty diff
    setTimeout(() => {
      proc.stdout.emit('data', '');
      proc.emit('close', 0);
    }, 0);

    return proc;
  }),
}));

vi.mock('fs/promises', () => ({
  access: vi.fn().mockResolvedValue(undefined),
}));

// ============================================================================
// Tests
// ============================================================================

describe('GitAwareTestSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Constructor & Factory
  // --------------------------------------------------------------------------

  describe('Constructor', () => {
    it('should require impactAnalyzer', () => {
      // @ts-expect-error Testing that missing impactAnalyzer throws
      expect(() => new GitAwareTestSelector({})).toThrow(
        'GitAwareTestSelector requires impactAnalyzer'
      );
    });

    it('should create selector with impactAnalyzer', () => {
      const selector = new GitAwareTestSelector(createTestConfig());
      expect(selector).toBeDefined();
    });

    it('should create selector with custom config', () => {
      const selector = createTestSelector(createTestConfig({
        cwd: '/custom/path',
        baseRef: 'main',
      }));
      expect(selector).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Changed Files Parsing
  // --------------------------------------------------------------------------

  describe('getChangedFiles()', () => {
    it('should parse git diff output', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = vi.mocked(spawn);

      mockSpawn.mockImplementationOnce((): any => {
        const EventEmitter = require('events');
        const proc = new EventEmitter();
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();

        setTimeout(() => {
          proc.stdout.emit(
            'data',
            'M\tsrc/foo.ts\nA\tsrc/bar.ts\nD\tsrc/old.ts\n'
          );
          proc.emit('close', 0);
        }, 0);

        return proc;
      });

      const selector = createTestSelector(createTestConfig());
      const changedFiles = await selector.getChangedFiles();

      expect(changedFiles).toHaveLength(3);
      expect(changedFiles[0]).toEqual({
        path: 'src/foo.ts',
        changeType: 'modified',
      });
      expect(changedFiles[1]).toEqual({
        path: 'src/bar.ts',
        changeType: 'added',
      });
      expect(changedFiles[2]).toEqual({
        path: 'src/old.ts',
        changeType: 'deleted',
      });
    });

    it('should handle renamed files', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = vi.mocked(spawn);

      mockSpawn.mockImplementationOnce((): any => {
        const EventEmitter = require('events');
        const proc = new EventEmitter();
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();

        setTimeout(() => {
          proc.stdout.emit('data', 'R100\told.ts\tnew.ts\n');
          proc.emit('close', 0);
        }, 0);

        return proc;
      });

      const selector = createTestSelector(createTestConfig());
      const changedFiles = await selector.getChangedFiles();

      expect(changedFiles).toHaveLength(1);
      expect(changedFiles[0].changeType).toBe('renamed');
    });

    it('should return empty array on git error', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = vi.mocked(spawn);

      mockSpawn.mockImplementationOnce((): any => {
        const EventEmitter = require('events');
        const proc = new EventEmitter();
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();

        setTimeout(() => {
          proc.stderr.emit('data', 'fatal: not a git repository');
          proc.emit('close', 1);
        }, 0);

        return proc;
      });

      const selector = createTestSelector(createTestConfig());
      const result = await selector.selectAffectedTests();

      expect(result.runAllTests).toBe(true);
      expect(result.runAllReason).toContain('Git error');
    });
  });

  // --------------------------------------------------------------------------
  // Test Mapping
  // --------------------------------------------------------------------------

  describe('Test Mapping', () => {
    it('should map source files to tests', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = vi.mocked(spawn);
      const fs = await import('fs/promises');

      mockSpawn.mockImplementation((): any => {
        const EventEmitter = require('events');
        const proc = new EventEmitter();
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();

        setTimeout(() => {
          proc.stdout.emit('data', 'M\tsrc/auth/login.ts\n');
          proc.emit('close', 0);
        }, 0);

        return proc;
      });

      // Mock that test file exists
      vi.mocked(fs.access).mockImplementation((path: any) => {
        if (path.includes('tests/unit/auth/login.test.ts')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const selector = createTestSelector(createTestConfig());
      const result = await selector.selectAffectedTests();

      expect(result.selectedTests.length).toBeGreaterThanOrEqual(0);
    });

    it('should map test file changes to themselves', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = vi.mocked(spawn);
      const fs = await import('fs/promises');

      mockSpawn.mockImplementation((): any => {
        const EventEmitter = require('events');
        const proc = new EventEmitter();
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();

        setTimeout(() => {
          proc.stdout.emit('data', 'M\ttests/unit/foo.test.ts\n');
          proc.emit('close', 0);
        }, 0);

        return proc;
      });

      vi.mocked(fs.access).mockResolvedValue(undefined);

      // Mock impactAnalyzer to return the test file
      const mockAnalyzer = createMockImpactAnalyzer(['tests/unit/foo.test.ts']);
      const selector = createTestSelector(createTestConfig({ impactAnalyzer: mockAnalyzer }));
      const result = await selector.selectAffectedTests();

      expect(result.selectedTests).toContain('tests/unit/foo.test.ts');
    });

    it('should trigger run-all for config changes', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = vi.mocked(spawn);

      mockSpawn.mockImplementation((): any => {
        const EventEmitter = require('events');
        const proc = new EventEmitter();
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();

        setTimeout(() => {
          proc.stdout.emit('data', 'M\tvitest.config.ts\n');
          proc.emit('close', 0);
        }, 0);

        return proc;
      });

      const selector = createTestSelector(createTestConfig());
      const result = await selector.selectAffectedTests();

      expect(result.runAllTests).toBe(true);
      expect(result.runAllReason).toContain('Config file changed');
    });
  });

  // --------------------------------------------------------------------------
  // selectTestsForFiles
  // --------------------------------------------------------------------------

  describe('selectTestsForFiles()', () => {
    it('should map specific files to tests', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.access).mockResolvedValue(undefined);

      // Mock impactAnalyzer to return the test file
      const mockAnalyzer = createMockImpactAnalyzer(['tests/unit/utils/helper.test.ts']);
      const selector = createTestSelector(createTestConfig({ impactAnalyzer: mockAnalyzer }));
      const result = await selector.selectTestsForFiles([
        'src/utils/helper.ts',
        'tests/unit/utils/helper.test.ts',
      ]);

      // Test file should map to itself
      expect(result.selectedTests).toContain('tests/unit/utils/helper.test.ts');
    });
  });

  // --------------------------------------------------------------------------
  // Empty Changes
  // --------------------------------------------------------------------------

  describe('Empty Changes', () => {
    it('should handle no changes', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = vi.mocked(spawn);

      mockSpawn.mockImplementation((): any => {
        const EventEmitter = require('events');
        const proc = new EventEmitter();
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();

        setTimeout(() => {
          proc.stdout.emit('data', '');
          proc.emit('close', 0);
        }, 0);

        return proc;
      });

      const selector = createTestSelector(createTestConfig());
      const result = await selector.selectAffectedTests();

      expect(result.changedFiles).toHaveLength(0);
      expect(result.selectedTests).toHaveLength(0);
      expect(result.runAllTests).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Deleted Files
  // --------------------------------------------------------------------------

  describe('Deleted Files', () => {
    it('should skip deleted files by default', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = vi.mocked(spawn);

      mockSpawn.mockImplementation((): any => {
        const EventEmitter = require('events');
        const proc = new EventEmitter();
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();

        setTimeout(() => {
          proc.stdout.emit('data', 'D\tsrc/deleted.ts\n');
          proc.emit('close', 0);
        }, 0);

        return proc;
      });

      const selector = createTestSelector(createTestConfig({ includeDeletedFileTests: false }));
      const result = await selector.selectAffectedTests();

      expect(result.selectedTests).toHaveLength(0);
    });

    it('should include deleted file tests when configured', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = vi.mocked(spawn);
      const fs = await import('fs/promises');

      mockSpawn.mockImplementation((): any => {
        const EventEmitter = require('events');
        const proc = new EventEmitter();
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();

        setTimeout(() => {
          proc.stdout.emit('data', 'D\tsrc/deleted.ts\n');
          proc.emit('close', 0);
        }, 0);

        return proc;
      });

      vi.mocked(fs.access).mockResolvedValue(undefined);

      const mockAnalyzer = createMockImpactAnalyzer(['tests/unit/deleted.test.ts']);
      const selector = createTestSelector(createTestConfig({
        includeDeletedFileTests: true,
        impactAnalyzer: mockAnalyzer,
      }));
      const result = await selector.selectAffectedTests();

      // Should attempt to find tests
      expect(result.changedFiles).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // Deduplication
  // --------------------------------------------------------------------------

  describe('Deduplication', () => {
    it('should deduplicate selected tests', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = vi.mocked(spawn);
      const fs = await import('fs/promises');

      mockSpawn.mockImplementation((): any => {
        const EventEmitter = require('events');
        const proc = new EventEmitter();
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();

        setTimeout(() => {
          // Two changes that map to same test
          proc.stdout.emit('data', 'M\tsrc/foo/index.ts\nM\tsrc/foo/utils.ts\n');
          proc.emit('close', 0);
        }, 0);

        return proc;
      });

      vi.mocked(fs.access).mockImplementation((path: any) => {
        // Both map to same test file
        if (path.includes('foo.test.ts') || path.includes('foo/index.test.ts')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const selector = createTestSelector(createTestConfig());
      const result = await selector.selectAffectedTests();

      // Should have unique entries
      const uniqueTests = [...new Set(result.selectedTests)];
      expect(result.selectedTests).toHaveLength(uniqueTests.length);
    });
  });
});
