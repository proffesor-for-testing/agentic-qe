import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { LocalPluginSource } from '../../../src/plugins/sources/local';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

const VALID_MANIFEST = JSON.stringify({
  name: 'test-plugin',
  version: '1.0.0',
  description: 'A test plugin',
  author: 'Test Author',
  domains: ['test-generation'],
  entryPoint: 'index.js',
});

describe('LocalPluginSource', () => {
  let source: LocalPluginSource;

  beforeEach(() => {
    source = new LocalPluginSource();
    vi.clearAllMocks();
  });

  it('should have type "local"', () => {
    expect(source.type).toBe('local');
  });

  describe('resolve', () => {
    it('should resolve a manifest from a local directory', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(VALID_MANIFEST);

      const manifest = await source.resolve('/path/to/plugin');

      expect(fs.existsSync).toHaveBeenCalledWith(
        path.resolve('/path/to/plugin', 'qe-plugin.json'),
      );
      expect(manifest.name).toBe('test-plugin');
      expect(manifest.version).toBe('1.0.0');
    });

    it('should throw if qe-plugin.json does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(source.resolve('/missing')).rejects.toThrow('No qe-plugin.json found');
    });
  });

  describe('getPluginPath', () => {
    it('should return the absolute path of an existing directory', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await source.getPluginPath('/some/plugin');

      expect(result).toBe(path.resolve('/some/plugin'));
    });

    it('should throw if the directory does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(source.getPluginPath('/nonexistent')).rejects.toThrow(
        'Plugin directory does not exist',
      );
    });
  });
});
