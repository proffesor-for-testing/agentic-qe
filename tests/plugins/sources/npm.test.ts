import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NpmPluginSource } from '../../../src/plugins/sources/npm';

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
    unlinkSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    readFileSync: vi.fn(),
  };
});

import { execFileSync } from 'child_process';
import * as fs from 'fs';

describe('NpmPluginSource', () => {
  let source: NpmPluginSource;

  beforeEach(() => {
    source = new NpmPluginSource('/tmp/npm-cache');
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockReturnValue([]);
  });

  it('should have type "npm"', () => {
    expect(source.type).toBe('npm');
  });

  describe('input validation', () => {
    it('should reject package names with shell metacharacters', async () => {
      await expect(source.getPluginPath('pkg; rm -rf /')).rejects.toThrow(
        'Invalid npm package name',
      );
    });

    it('should accept valid package names', async () => {
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(execFileSync).mockReturnValue(Buffer.from('pkg-1.0.0.tgz'));

      await source.getPluginPath('my-plugin').catch(() => {});

      expect(execFileSync).toHaveBeenCalledWith(
        'npm',
        expect.arrayContaining(['pack', 'my-plugin']),
        expect.any(Object),
      );
    });

    it('should accept scoped package names', async () => {
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(execFileSync).mockReturnValue(Buffer.from('scope-pkg-1.0.0.tgz'));

      await source.getPluginPath('@scope/pkg').catch(() => {});

      expect(execFileSync).toHaveBeenCalledWith(
        'npm',
        expect.arrayContaining(['pack', '@scope/pkg']),
        expect.any(Object),
      );
    });

    it('should reject versions with shell metacharacters', async () => {
      await expect(source.getPluginPath('pkg@1.0.0; echo pwned')).rejects.toThrow(
        'Invalid version',
      );
    });
  });

  describe('getPluginPath', () => {
    it('should return cached path if directory already exists with content', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['file.js'] as any);

      const result = await source.getPluginPath('my-plugin');

      expect(result).toContain('my-plugin');
      expect(execFileSync).not.toHaveBeenCalled();
    });

    it('should use execFileSync with array args (no shell injection)', async () => {
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(execFileSync).mockReturnValue(Buffer.from('my-plugin-1.0.0.tgz'));

      await source.getPluginPath('my-plugin').catch(() => {});

      // First call: npm pack
      expect(execFileSync).toHaveBeenCalledWith(
        'npm',
        expect.arrayContaining(['pack']),
        expect.objectContaining({ stdio: 'pipe', timeout: 60_000 }),
      );
    });

    it('should extract tarball with tar', async () => {
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(execFileSync)
        .mockReturnValueOnce(Buffer.from('my-plugin-1.0.0.tgz'))  // npm pack
        .mockReturnValueOnce(Buffer.from(''));  // tar extract

      await source.getPluginPath('my-plugin').catch(() => {});

      expect(execFileSync).toHaveBeenCalledWith(
        'tar',
        expect.arrayContaining(['-xzf']),
        expect.objectContaining({ stdio: 'pipe' }),
      );
    });

    it('should clean up target dir on failure', async () => {
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('npm pack failed');
      });

      await expect(source.getPluginPath('my-plugin')).rejects.toThrow('Failed to fetch npm package');
      expect(fs.rmSync).toHaveBeenCalled();
    });

    it('should append version to spec when provided', async () => {
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(execFileSync).mockReturnValue(Buffer.from('pkg-2.0.0.tgz'));

      await source.getPluginPath('my-plugin@2.0.0').catch(() => {});

      expect(execFileSync).toHaveBeenCalledWith(
        'npm',
        expect.arrayContaining(['pack', 'my-plugin@2.0.0']),
        expect.any(Object),
      );
    });
  });

  describe('parseLocation', () => {
    it('should parse scoped packages with version', async () => {
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(execFileSync).mockReturnValue(Buffer.from('pkg-1.0.0.tgz'));

      // @scope/pkg@1.0.0 → name=@scope/pkg, version=1.0.0
      await source.getPluginPath('@scope/pkg@1.0.0').catch(() => {});

      expect(execFileSync).toHaveBeenCalledWith(
        'npm',
        expect.arrayContaining(['pack', '@scope/pkg@1.0.0']),
        expect.any(Object),
      );
    });
  });
});
