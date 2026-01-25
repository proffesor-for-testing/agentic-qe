/**
 * Unit Tests for FileWatcher
 *
 * Tests file watching, debouncing, and event handling.
 * Note: Uses manual mode since chokidar is optional.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { FileWatcher } from '../../../src/code-intelligence/indexing/FileWatcher.js';

// Helper to wait for debounce
const waitForDebounce = (ms: number = 150) =>
  new Promise(resolve => setTimeout(resolve, ms));

describe('FileWatcher', () => {
  let watcher: FileWatcher;

  beforeEach(() => {
    // Use short debounce for faster tests
    watcher = new FileWatcher({ debounceMs: 50 });
  });

  afterEach(async () => {
    await watcher.stop();
  });

  describe('configuration', () => {
    it('should use default config', () => {
      const defaultWatcher = new FileWatcher();
      const config = defaultWatcher.getConfig();

      expect(config.patterns).toContain('**/*.ts');
      expect(config.ignorePatterns).toContain('**/node_modules/**');
      expect(config.debounceMs).toBe(300); // default
    });

    it('should allow config override', () => {
      const custom = new FileWatcher({
        debounceMs: 500,
        usePolling: true,
      });

      expect(custom.getConfig().debounceMs).toBe(500);
      expect(custom.getConfig().usePolling).toBe(true);
    });

    it('should allow config update', () => {
      watcher.updateConfig({ debounceMs: 200 });

      expect(watcher.getConfig().debounceMs).toBe(200);
    });
  });

  describe('pattern matching', () => {
    it('should match TypeScript files', () => {
      expect(watcher.shouldWatch('src/index.ts')).toBe(true);
      expect(watcher.shouldWatch('src/components/Button.tsx')).toBe(true);
    });

    it('should match other supported languages', () => {
      expect(watcher.shouldWatch('main.py')).toBe(true);
      expect(watcher.shouldWatch('server.go')).toBe(true);
      expect(watcher.shouldWatch('lib.rs')).toBe(true);
    });

    it('should exclude node_modules', () => {
      expect(watcher.shouldWatch('node_modules/express/index.js')).toBe(false);
    });

    it('should exclude .git', () => {
      expect(watcher.shouldWatch('.git/config')).toBe(false);
    });
  });

  describe('manual change registration', () => {
    it('should register and flush changes', async () => {
      const callback = jest.fn();
      watcher.onChanges(callback);

      await watcher.start();

      watcher.registerChange({
        type: 'add',
        path: 'src/new.ts',
        timestamp: Date.now(),
      });

      // Wait for debounce
      await waitForDebounce(100);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'add',
          filePath: 'src/new.ts',
        }),
      ]);
    });

    it('should debounce multiple changes', async () => {
      const callback = jest.fn();
      watcher.onChanges(callback);

      await watcher.start();

      watcher.registerChange({ type: 'add', path: 'a.ts', timestamp: 1 });
      watcher.registerChange({ type: 'change', path: 'b.ts', timestamp: 2 });
      watcher.registerChange({ type: 'unlink', path: 'c.ts', timestamp: 3 });

      // Before debounce expires
      await waitForDebounce(20);
      expect(callback).not.toHaveBeenCalled();

      // After debounce expires
      await waitForDebounce(80);
      expect(callback).toHaveBeenCalledTimes(1);

      const changes = callback.mock.calls[0][0];
      expect(changes.length).toBe(3);
    });

    it('should convert event types correctly', async () => {
      const callback = jest.fn();
      watcher.onChanges(callback);

      await watcher.start();

      watcher.registerChange({ type: 'add', path: 'new.ts', timestamp: 1 });
      watcher.registerChange({ type: 'change', path: 'mod.ts', timestamp: 2 });
      watcher.registerChange({ type: 'unlink', path: 'del.ts', timestamp: 3 });

      await waitForDebounce(100);

      const changes = callback.mock.calls[0][0];
      expect(changes.find((c: any) => c.filePath === 'new.ts').type).toBe('add');
      expect(changes.find((c: any) => c.filePath === 'mod.ts').type).toBe('modify');
      expect(changes.find((c: any) => c.filePath === 'del.ts').type).toBe('delete');
    });

    it('should deduplicate changes to same file', async () => {
      const callback = jest.fn();
      watcher.onChanges(callback);

      await watcher.start();

      // Multiple changes to same file
      watcher.registerChange({ type: 'change', path: 'file.ts', timestamp: 1 });
      watcher.registerChange({ type: 'change', path: 'file.ts', timestamp: 2 });
      watcher.registerChange({ type: 'change', path: 'file.ts', timestamp: 3 });

      await waitForDebounce(100);

      const changes = callback.mock.calls[0][0];
      expect(changes.length).toBe(1);
      expect(changes[0].filePath).toBe('file.ts');
    });
  });

  describe('callback management', () => {
    it('should support multiple callbacks', async () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();

      watcher.onChanges(cb1);
      watcher.onChanges(cb2);

      await watcher.start();

      watcher.registerChange({ type: 'add', path: 'file.ts', timestamp: 1 });
      await waitForDebounce(100);

      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
    });

    it('should remove callback', async () => {
      const cb = jest.fn();

      watcher.onChanges(cb);
      watcher.offChanges(cb);

      await watcher.start();

      watcher.registerChange({ type: 'add', path: 'file.ts', timestamp: 1 });
      await waitForDebounce(100);

      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('events', () => {
    it('should emit ready event on start', async () => {
      const readyHandler = jest.fn();
      watcher.on('ready', readyHandler);

      await watcher.start();

      expect(readyHandler).toHaveBeenCalled();
    });

    it('should emit change event', async () => {
      const changeHandler = jest.fn();
      watcher.on('change', changeHandler);

      await watcher.start();

      watcher.registerChange({ type: 'add', path: 'file.ts', timestamp: 1 });
      await waitForDebounce(100);

      expect(changeHandler).toHaveBeenCalled();
    });
  });

  describe('lifecycle', () => {
    it('should report active status', async () => {
      expect(watcher.isActive()).toBe(false);

      await watcher.start();
      expect(watcher.isActive()).toBe(true);

      await watcher.stop();
      expect(watcher.isActive()).toBe(false);
    });

    it('should be safe to start multiple times', async () => {
      await watcher.start();
      await watcher.start();

      expect(watcher.isActive()).toBe(true);
    });

    it('should be safe to stop multiple times', async () => {
      await watcher.start();
      await watcher.stop();
      await watcher.stop();

      expect(watcher.isActive()).toBe(false);
    });
  });
});
