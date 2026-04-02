import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubPluginSource } from '../../../src/plugins/sources/github';

// Mock child_process and fs
vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

import { execFileSync } from 'child_process';
import * as fs from 'fs';

describe('GitHubPluginSource', () => {
  let source: GitHubPluginSource;

  beforeEach(() => {
    source = new GitHubPluginSource('/tmp/test-cache');
    vi.clearAllMocks();
  });

  it('should have type "github"', () => {
    expect(source.type).toBe('github');
  });

  describe('input validation', () => {
    it('should reject repo names with shell metacharacters', async () => {
      await expect(source.getPluginPath('owner/repo; rm -rf /')).rejects.toThrow(
        'Invalid GitHub repo',
      );
    });

    it('should reject repo names with spaces', async () => {
      await expect(source.getPluginPath('ow ner/repo')).rejects.toThrow(
        'Invalid GitHub repo',
      );
    });

    it('should reject tags with shell metacharacters', async () => {
      await expect(source.getPluginPath('owner/repo@v1; echo pwned')).rejects.toThrow(
        'Invalid tag',
      );
    });

    it('should accept valid owner/repo format', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(execFileSync).mockReturnValue(Buffer.from(''));

      // Should not throw on the validation step
      // (may throw on clone step in mock, but not on validation)
      await source.getPluginPath('valid-owner/valid-repo').catch(() => {});

      expect(execFileSync).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['clone']),
        expect.any(Object),
      );
    });

    it('should accept valid owner/repo@tag format', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(execFileSync).mockReturnValue(Buffer.from(''));

      await source.getPluginPath('owner/repo@v1.0.0').catch(() => {});

      expect(execFileSync).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['--branch', 'v1.0.0']),
        expect.any(Object),
      );
    });
  });

  describe('getPluginPath', () => {
    it('should return cached path if directory already exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await source.getPluginPath('owner/repo');

      expect(result).toContain('owner__repo');
      expect(execFileSync).not.toHaveBeenCalled();
    });

    it('should use execFileSync with array args (no shell injection)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(execFileSync).mockReturnValue(Buffer.from(''));

      await source.getPluginPath('owner/repo').catch(() => {});

      expect(execFileSync).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['clone', '--depth', '1']),
        expect.objectContaining({ stdio: 'pipe', timeout: 60_000 }),
      );
    });

    it('should clean up target dir on clone failure', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('clone failed');
      });

      await expect(source.getPluginPath('owner/repo')).rejects.toThrow('Failed to clone');
      expect(fs.rmSync).toHaveBeenCalled();
    });
  });

  describe('parseLocation', () => {
    it('should reject locations without owner/repo format', async () => {
      await expect(source.getPluginPath('just-a-name')).rejects.toThrow('Invalid GitHub location');
    });
  });
});
