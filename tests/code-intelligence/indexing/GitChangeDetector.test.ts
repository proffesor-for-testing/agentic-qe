/**
 * Unit Tests for GitChangeDetector
 *
 * Tests git-based file change detection for incremental indexing.
 */

import { describe, it, expect, beforeEach, vi } from '@jest/globals';
import { GitChangeDetector } from '../../../src/code-intelligence/indexing/GitChangeDetector.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('GitChangeDetector', () => {
  let detector: GitChangeDetector;

  beforeEach(() => {
    detector = new GitChangeDetector(process.cwd());
  });

  describe('repository detection', () => {
    it('should detect git repository', async () => {
      const isGit = await detector.isGitRepository();

      // The test project should be a git repo
      expect(isGit).toBe(true);
    });

    it('should get current commit hash', async () => {
      const commit = await detector.getCurrentCommit();

      expect(commit).toBeDefined();
      expect(commit.length).toBe(40); // Full SHA
      expect(commit).toMatch(/^[0-9a-f]{40}$/);
    });
  });

  describe('change detection', () => {
    it('should detect changed files between commits', async () => {
      // This test depends on git history
      // In a real test, we'd create test commits
      const changes = await detector.getChangedFiles();

      // Should return an array (even if empty)
      expect(Array.isArray(changes)).toBe(true);
    });

    it('should filter by extensions', async () => {
      const changes = await detector.getChangedFiles();

      // All changes should be in configured extensions
      const config = {
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'],
      };

      for (const change of changes) {
        const hasValidExt = config.extensions.some((ext) =>
          change.filePath.endsWith(ext)
        );
        expect(hasValidExt).toBe(true);
      }
    });

    it('should exclude node_modules', async () => {
      const changes = await detector.getChangedFiles();

      for (const change of changes) {
        expect(change.filePath).not.toContain('node_modules');
      }
    });

    it('should categorize changes by type', async () => {
      const changes = await detector.getChangedFiles();

      for (const change of changes) {
        expect(['add', 'modify', 'delete']).toContain(change.type);
        expect(change.filePath).toBeDefined();
        expect(change.timestamp).toBeGreaterThan(0);
      }
    });
  });

  describe('uncommitted changes', () => {
    it('should detect uncommitted changes', async () => {
      const changes = await detector.getUncommittedChanges();

      expect(Array.isArray(changes)).toBe(true);
    });
  });

  describe('combined changes', () => {
    it('should get all changes (committed + uncommitted)', async () => {
      const allChanges = await detector.getAllChanges();

      expect(Array.isArray(allChanges)).toBe(true);
    });
  });

  describe('file history', () => {
    it('should get commit history for a file', async () => {
      // Use a file that definitely exists and has history
      const history = await detector.getFileHistory('package.json', 5);

      expect(Array.isArray(history)).toBe(true);
      // package.json should have at least some commits
      expect(history.length).toBeGreaterThan(0);

      // Each entry should be a commit hash
      for (const commit of history) {
        expect(commit).toMatch(/^[0-9a-f]{40}$/);
      }
    });
  });

  describe('last commit tracking', () => {
    it('should track and return last commit', () => {
      expect(detector.getLastCommit()).toBeNull();

      detector.setLastCommit('abc123def456789012345678901234567890abcd');
      expect(detector.getLastCommit()).toBe('abc123def456789012345678901234567890abcd');
    });
  });

  describe('path exclusion', () => {
    it('should exclude configured directories', async () => {
      const changes = await detector.getChangedFiles();

      const excludedDirs = ['node_modules', '.git', 'dist', 'build', 'coverage'];

      for (const change of changes) {
        for (const dir of excludedDirs) {
          expect(change.filePath).not.toMatch(new RegExp(`[/\\\\]${dir}[/\\\\]`));
        }
      }
    });
  });
});
