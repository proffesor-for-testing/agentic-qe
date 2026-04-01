/**
 * IMP-04: Session Store Tests
 * Verifies the append-only JSONL session store, parentUuid chain,
 * lazy file creation, metadata tracking, and middleware factory.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SessionStore, type SessionEntryInput } from '../../../src/mcp/services/session-store';
import { createSessionDurabilityMiddleware } from '../../../src/mcp/services/session-durability-middleware';

// ============================================================================
// Helpers
// ============================================================================

let tmpDir: string;

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'session-store-test-'));
}

function readJsonlLines(filePath: string): unknown[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

function makeEntry(overrides: Partial<SessionEntryInput> = {}): SessionEntryInput {
  return {
    timestamp: overrides.timestamp ?? Date.now(),
    type: overrides.type ?? 'tool_call',
    toolName: overrides.toolName ?? 'test_tool',
    params: overrides.params ?? { key: 'value' },
    state: overrides.state ?? 'running',
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('SessionStore', () => {
  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('startSession', () => {
    it('should return a valid UUID session ID', () => {
      const store = new SessionStore(tmpDir);
      const sessionId = store.startSession();

      expect(sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('should not create a file until first append (lazy creation)', () => {
      const store = new SessionStore(tmpDir);
      const sessionId = store.startSession();
      const filePath = path.join(tmpDir, `${sessionId}.jsonl`);

      expect(fs.existsSync(filePath)).toBe(false);
    });
  });

  describe('append', () => {
    it('should append 10 entries and produce a JSONL file with 10 lines', () => {
      const store = new SessionStore(tmpDir);
      store.startSession();

      for (let i = 0; i < 10; i++) {
        store.append(makeEntry({ timestamp: 1000 + i }));
      }

      store.flush();

      const filePath = store.getFilePath()!;
      const lines = readJsonlLines(filePath);
      expect(lines).toHaveLength(10);
    });

    it('should form a valid parentUuid linked list', () => {
      const store = new SessionStore(tmpDir);
      store.startSession();

      const uuids: string[] = [];
      for (let i = 0; i < 5; i++) {
        uuids.push(store.append(makeEntry({ timestamp: 1000 + i })));
      }

      store.flush();

      const filePath = store.getFilePath()!;
      const entries = readJsonlLines(filePath) as Array<{
        uuid: string;
        parentUuid: string | null;
      }>;

      // First entry should have null parentUuid
      expect(entries[0].parentUuid).toBeNull();

      // Each subsequent entry's parentUuid should be the previous entry's uuid
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i].parentUuid).toBe(entries[i - 1].uuid);
      }

      // UUIDs returned by append should match entries
      for (let i = 0; i < entries.length; i++) {
        expect(entries[i].uuid).toBe(uuids[i]);
      }
    });

    it('should create the file on first append', () => {
      const store = new SessionStore(tmpDir);
      const sessionId = store.startSession();
      const filePath = path.join(tmpDir, `${sessionId}.jsonl`);

      expect(fs.existsSync(filePath)).toBe(false);

      store.append(makeEntry());

      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should throw if no session is started', () => {
      const store = new SessionStore(tmpDir);
      expect(() => store.append(makeEntry())).toThrow('No active session');
    });

    it('should create nested directories if needed', () => {
      const nestedDir = path.join(tmpDir, 'deep', 'nested', 'dir');
      const store = new SessionStore(nestedDir);
      store.startSession();

      store.append(makeEntry());

      expect(fs.existsSync(nestedDir)).toBe(true);
      expect(fs.existsSync(store.getFilePath()!)).toBe(true);
    });
  });

  describe('flush', () => {
    it('should flush buffered writes to disk', () => {
      const store = new SessionStore(tmpDir);
      store.startSession();

      // First write is synchronous (creates file)
      store.append(makeEntry({ timestamp: 1000 }));

      // Subsequent writes are buffered
      store.append(makeEntry({ timestamp: 1001 }));
      store.append(makeEntry({ timestamp: 1002 }));

      // Force flush
      store.flush();

      const lines = readJsonlLines(store.getFilePath()!);
      expect(lines).toHaveLength(3);
    });

    it('should be safe to call flush with no pending writes', () => {
      const store = new SessionStore(tmpDir);
      store.startSession();

      // No writes at all
      expect(() => store.flush()).not.toThrow();
    });
  });

  describe('getMetadata', () => {
    it('should return correct counts and state', () => {
      const store = new SessionStore(tmpDir);
      store.startSession();

      store.append(makeEntry({ timestamp: 1000, state: 'running' }));
      store.append(makeEntry({ timestamp: 2000, state: 'idle' }));
      store.append(makeEntry({ timestamp: 3000, state: 'requires_action' }));

      const meta = store.getMetadata();
      expect(meta.entryCount).toBe(3);
      expect(meta.state).toBe('requires_action');
      expect(meta.lastActivityAt).toBe(3000);
      expect(meta.createdAt).toBeGreaterThan(0);
      expect(meta.sessionId).toBeTruthy();
    });

    it('should throw if no session is active', () => {
      const store = new SessionStore(tmpDir);
      expect(() => store.getMetadata()).toThrow('No active session');
    });
  });

  describe('getSessionId', () => {
    it('should return null when no session is started', () => {
      const store = new SessionStore(tmpDir);
      expect(store.getSessionId()).toBeNull();
    });

    it('should return the session ID after starting', () => {
      const store = new SessionStore(tmpDir);
      const id = store.startSession();
      expect(store.getSessionId()).toBe(id);
    });
  });

  describe('close', () => {
    it('should flush pending writes on close', () => {
      const store = new SessionStore(tmpDir);
      store.startSession();

      // First write (sync)
      store.append(makeEntry({ timestamp: 1000 }));
      // Buffered writes
      store.append(makeEntry({ timestamp: 1001 }));
      store.append(makeEntry({ timestamp: 1002 }));

      store.close();

      const lines = readJsonlLines(store.getFilePath()!);
      expect(lines).toHaveLength(3);
    });

    it('should be idempotent', () => {
      const store = new SessionStore(tmpDir);
      store.startSession();
      store.append(makeEntry());

      store.close();
      expect(() => store.close()).not.toThrow();
    });

    it('should reject appends after close', () => {
      const store = new SessionStore(tmpDir);
      store.startSession();
      store.close();

      expect(() => store.append(makeEntry())).toThrow('No active session');
    });
  });
});

describe('createSessionDurabilityMiddleware', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should register with correct name and priority', () => {
    const store = new SessionStore(tmpDir);
    store.startSession();

    const mw = createSessionDurabilityMiddleware(store);

    expect(mw.name).toBe('session-durability');
    expect(mw.priority).toBe(50);
  });

  it('should have preToolCall, postToolResult, and onError hooks', () => {
    const store = new SessionStore(tmpDir);
    store.startSession();

    const mw = createSessionDurabilityMiddleware(store);

    expect(typeof mw.preToolCall).toBe('function');
    expect(typeof mw.postToolResult).toBe('function');
    expect(typeof mw.onError).toBe('function');
  });

  it('should append tool_call entry on preToolCall', async () => {
    const store = new SessionStore(tmpDir);
    store.startSession();

    const mw = createSessionDurabilityMiddleware(store);

    const ctx = {
      toolName: 'memory_store',
      params: { key: 'test' },
      timestamp: Date.now(),
      metadata: {},
    };

    const result = await mw.preToolCall!(ctx);

    // Should return context unchanged
    expect(result).toBe(ctx);

    // Should have appended an entry
    const meta = store.getMetadata();
    expect(meta.entryCount).toBe(1);
    expect(meta.state).toBe('running');
  });

  it('should append tool_result entry on postToolResult', async () => {
    const store = new SessionStore(tmpDir);
    store.startSession();

    const mw = createSessionDurabilityMiddleware(store);

    const ctx = {
      toolName: 'memory_store',
      params: { key: 'test' },
      timestamp: Date.now(),
      metadata: {},
    };

    // Pre-hook first
    await mw.preToolCall!(ctx);

    // Post-hook
    const toolResult = { success: true, data: 'stored' };
    const returnedResult = await mw.postToolResult!(ctx, toolResult);

    // Should return result unchanged
    expect(returnedResult).toBe(toolResult);

    const meta = store.getMetadata();
    expect(meta.entryCount).toBe(2);
    expect(meta.state).toBe('idle');
  });

  it('should append error entry on onError', async () => {
    const store = new SessionStore(tmpDir);
    store.startSession();

    const mw = createSessionDurabilityMiddleware(store);

    const ctx = {
      toolName: 'memory_store',
      params: { key: 'test' },
      timestamp: Date.now(),
      metadata: {},
    };

    // Pre-hook first
    await mw.preToolCall!(ctx);

    // Error hook
    await mw.onError!(ctx, new Error('Connection timeout'));

    const meta = store.getMetadata();
    expect(meta.entryCount).toBe(2);
    expect(meta.state).toBe('requires_action');

    // Verify the file content
    store.flush();
    const entries = readJsonlLines(store.getFilePath()!) as Array<{
      type: string;
      state: string;
      result?: { message: string };
    }>;

    const errorEntry = entries.find(e => e.type === 'error');
    expect(errorEntry).toBeDefined();
    expect(errorEntry!.state).toBe('requires_action');
    expect(errorEntry!.result).toHaveProperty('message', 'Connection timeout');
  });
});
