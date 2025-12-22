/**
 * Unit Tests for IncrementalIndexer
 *
 * Tests delta updates, content hashing, and index management.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { IncrementalIndexer } from '../../../src/code-intelligence/indexing/IncrementalIndexer.js';

describe('IncrementalIndexer', () => {
  let indexer: IncrementalIndexer;

  beforeEach(() => {
    indexer = new IncrementalIndexer();
  });

  describe('configuration', () => {
    it('should use default config', () => {
      const config = indexer.getConfig();

      expect(config.extensions).toContain('.ts');
      expect(config.extensions).toContain('.py');
      expect(config.excludeDirs).toContain('node_modules');
      expect(config.maxFileSize).toBe(1024 * 1024);
    });

    it('should allow config override', () => {
      const customIndexer = new IncrementalIndexer({
        batchSize: 20,
        maxFileSize: 2048,
      });

      expect(customIndexer.getConfig().batchSize).toBe(20);
      expect(customIndexer.getConfig().maxFileSize).toBe(2048);
    });

    it('should allow config update', () => {
      indexer.updateConfig({ batchSize: 15 });

      expect(indexer.getConfig().batchSize).toBe(15);
    });
  });

  describe('file indexing', () => {
    it('should index a file', async () => {
      const content = 'function hello() { return "world"; }';

      const indexed = await indexer.indexFile('/src/hello.ts', content, 'typescript');

      expect(indexed.filePath).toBe('/src/hello.ts');
      expect(indexed.language).toBe('typescript');
      expect(indexed.status).toBe('pending');
      expect(indexed.contentHash).toBeDefined();
      expect(indexed.contentHash.length).toBe(64); // SHA256 hex
    });

    it('should generate consistent content hash', async () => {
      const content = 'const x = 42;';

      const file1 = await indexer.indexFile('/a.ts', content, 'typescript');
      const file2 = await indexer.indexFile('/b.ts', content, 'typescript');

      expect(file1.contentHash).toBe(file2.contentHash);
    });

    it('should skip re-indexing unchanged files', async () => {
      const content = 'const x = 1;';

      const first = await indexer.indexFile('/file.ts', content, 'typescript');
      const second = await indexer.indexFile('/file.ts', content, 'typescript');

      expect(first.fileId).toBe(second.fileId);
      expect(first.contentHash).toBe(second.contentHash);
    });

    it('should detect changed files', async () => {
      const original = 'const x = 1;';
      const modified = 'const x = 2;';

      await indexer.indexFile('/file.ts', original, 'typescript');

      expect(indexer.needsReindex('/file.ts', original)).toBe(false);
      expect(indexer.needsReindex('/file.ts', modified)).toBe(true);
    });

    it('should mark files as indexed with chunks', async () => {
      await indexer.indexFile('/file.ts', 'code', 'typescript');
      indexer.markIndexed('/file.ts', ['chunk1', 'chunk2', 'chunk3']);

      const file = indexer.getFile('/file.ts');

      expect(file?.status).toBe('indexed');
      expect(file?.chunkIds).toEqual(['chunk1', 'chunk2', 'chunk3']);
      expect(file?.chunkCount).toBe(3);
    });

    it('should mark files with errors', async () => {
      await indexer.indexFile('/file.ts', 'code', 'typescript');
      indexer.markError('/file.ts', 'Parse failed');

      const file = indexer.getFile('/file.ts');

      expect(file?.status).toBe('error');
      expect(file?.error).toBe('Parse failed');
    });
  });

  describe('file removal', () => {
    it('should remove a file and return chunk IDs', async () => {
      await indexer.indexFile('/file.ts', 'code', 'typescript');
      indexer.markIndexed('/file.ts', ['c1', 'c2']);

      const removedChunks = indexer.removeFile('/file.ts');

      expect(removedChunks).toEqual(['c1', 'c2']);
      expect(indexer.getFile('/file.ts')).toBeUndefined();
    });

    it('should update stats on removal', async () => {
      await indexer.indexFile('/f1.ts', 'code1', 'typescript');
      await indexer.indexFile('/f2.ts', 'code2', 'typescript');
      indexer.markIndexed('/f1.ts', ['c1']);
      indexer.markIndexed('/f2.ts', ['c2']);

      expect(indexer.getStats().totalFiles).toBe(2);
      expect(indexer.getStats().totalChunks).toBe(2);

      indexer.removeFile('/f1.ts');

      expect(indexer.getStats().totalFiles).toBe(1);
      expect(indexer.getStats().totalChunks).toBe(1);
    });
  });

  describe('change processing', () => {
    it('should categorize changes by type', async () => {
      const changes = [
        { type: 'add' as const, filePath: '/new.ts', timestamp: Date.now() },
        { type: 'modify' as const, filePath: '/existing.ts', timestamp: Date.now() },
        { type: 'delete' as const, filePath: '/old.ts', timestamp: Date.now() },
      ];

      // Pre-add a file to be deleted
      await indexer.indexFile('/old.ts', 'old code', 'typescript');
      indexer.markIndexed('/old.ts', ['old-chunk']);

      const result = await indexer.processChanges(changes);

      expect(result.added).toEqual(['/new.ts']);
      expect(result.modified).toEqual(['/existing.ts']);
      expect(result.deleted).toEqual(['/old.ts']);
    });
  });

  describe('queries', () => {
    beforeEach(async () => {
      await indexer.indexFile('/a.ts', 'code a', 'typescript');
      await indexer.indexFile('/b.ts', 'code b', 'typescript');
      await indexer.indexFile('/c.ts', 'code c', 'typescript');

      indexer.markIndexed('/a.ts', ['a1']);
      indexer.markError('/b.ts', 'Failed');
      // /c.ts remains pending
    });

    it('should get pending files', () => {
      const pending = indexer.getPendingFiles();

      expect(pending.length).toBe(1);
      expect(pending[0].filePath).toBe('/c.ts');
    });

    it('should get error files', () => {
      const errors = indexer.getErrorFiles();

      expect(errors.length).toBe(1);
      expect(errors[0].filePath).toBe('/b.ts');
    });

    it('should get all files', () => {
      const all = indexer.getAllFiles();

      expect(all.length).toBe(3);
    });

    it('should get chunks for a file', () => {
      const chunks = indexer.getFileChunks('/a.ts');

      expect(chunks).toEqual(['a1']);
    });
  });

  describe('statistics', () => {
    it('should track correct stats', async () => {
      await indexer.indexFile('/a.ts', 'code', 'typescript');
      await indexer.indexFile('/b.ts', 'code', 'typescript');

      indexer.markIndexed('/a.ts', ['c1', 'c2']);
      indexer.markError('/b.ts', 'Error');

      const stats = indexer.getStats();

      expect(stats.totalFiles).toBe(2);
      expect(stats.totalChunks).toBe(2);
      expect(stats.pendingFiles).toBe(0);
      expect(stats.errorFiles).toBe(1);
    });
  });

  describe('persistence', () => {
    it('should export and import state', async () => {
      await indexer.indexFile('/file.ts', 'code', 'typescript');
      indexer.markIndexed('/file.ts', ['chunk1']);

      const exported = indexer.exportState();

      const newIndexer = new IncrementalIndexer();
      newIndexer.importState(exported);

      expect(newIndexer.getFile('/file.ts')?.status).toBe('indexed');
      expect(newIndexer.getStats().totalFiles).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear entire index', async () => {
      await indexer.indexFile('/a.ts', 'code', 'typescript');
      await indexer.indexFile('/b.ts', 'code', 'typescript');

      indexer.clearIndex();

      expect(indexer.getAllFiles().length).toBe(0);
      expect(indexer.getStats().totalFiles).toBe(0);
    });
  });
});
