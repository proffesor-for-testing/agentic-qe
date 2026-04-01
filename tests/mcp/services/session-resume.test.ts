/**
 * IMP-04: Session Resume Tests
 * Verifies session resumption from JSONL files including:
 * - well-formed files, corrupt lines, missing files
 * - head+tail reading behavior for large files
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { resumeSession } from '../../../src/mcp/services/session-resume';
import type { SessionEntry } from '../../../src/mcp/services/session-store';

// ============================================================================
// Helpers
// ============================================================================

let tmpDir: string;

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'session-resume-test-'));
}

function makeEntry(overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    uuid: overrides.uuid ?? randomUUID(),
    parentUuid: overrides.parentUuid ?? null,
    timestamp: overrides.timestamp ?? Date.now(),
    type: overrides.type ?? 'tool_call',
    toolName: overrides.toolName ?? 'test_tool',
    params: overrides.params ?? { key: 'value' },
    state: overrides.state ?? 'idle',
  };
}

function writeJsonlFile(filePath: string, entries: SessionEntry[]): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(filePath, content, 'utf-8');
}

function buildLinkedEntries(count: number, startTime: number = 1000): SessionEntry[] {
  const entries: SessionEntry[] = [];
  let lastUuid: string | null = null;
  for (let i = 0; i < count; i++) {
    const uuid = randomUUID();
    entries.push(
      makeEntry({
        uuid,
        parentUuid: lastUuid,
        timestamp: startTime + i,
        state: i === count - 1 ? 'idle' : 'running',
      })
    );
    lastUuid = uuid;
  }
  return entries;
}

// ============================================================================
// Tests
// ============================================================================

describe('resumeSession', () => {
  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('well-formed files', () => {
    it('should resume from a file with valid entries', () => {
      const sessionId = randomUUID();
      const filePath = path.join(tmpDir, `${sessionId}.jsonl`);
      const entries = buildLinkedEntries(5, 1000);
      writeJsonlFile(filePath, entries);

      const result = resumeSession(filePath);

      expect(result.canResume).toBe(true);
      expect(result.metadata.sessionId).toBe(sessionId);
      expect(result.metadata.entryCount).toBe(5);
      expect(result.metadata.createdAt).toBe(1000);
      expect(result.metadata.lastActivityAt).toBe(1004);
      expect(result.lastState).toBe('idle');
      expect(result.recentEntries.length).toBeGreaterThan(0);
    });

    it('should reconstruct parentUuid chain from recent entries', () => {
      const sessionId = randomUUID();
      const filePath = path.join(tmpDir, `${sessionId}.jsonl`);
      const entries = buildLinkedEntries(3, 2000);
      writeJsonlFile(filePath, entries);

      const result = resumeSession(filePath);

      // Verify the chain in recent entries
      for (let i = 1; i < result.recentEntries.length; i++) {
        expect(result.recentEntries[i].parentUuid).toBe(
          result.recentEntries[i - 1].uuid
        );
      }
    });

    it('should return correct last state from final entry', () => {
      const sessionId = randomUUID();
      const filePath = path.join(tmpDir, `${sessionId}.jsonl`);
      const entries = buildLinkedEntries(3, 3000);
      // Override last entry state
      entries[entries.length - 1].state = 'requires_action';
      writeJsonlFile(filePath, entries);

      const result = resumeSession(filePath);
      expect(result.lastState).toBe('requires_action');
    });
  });

  describe('corrupt lines', () => {
    it('should skip corrupt lines and parse valid ones', () => {
      const sessionId = randomUUID();
      const filePath = path.join(tmpDir, `${sessionId}.jsonl`);

      const entries = buildLinkedEntries(5, 4000);
      const lines = entries.map(e => JSON.stringify(e));

      // Inject corrupt lines
      lines.splice(2, 0, '{{NOT VALID JSON!!!');
      lines.splice(4, 0, 'also broken {{{');

      fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');

      const result = resumeSession(filePath);

      // Should have parsed the 5 valid entries, skipping 2 corrupt ones
      expect(result.canResume).toBe(true);
      expect(result.metadata.entryCount).toBe(5);
    });

    it('should handle a file that is entirely corrupt', () => {
      const sessionId = randomUUID();
      const filePath = path.join(tmpDir, `${sessionId}.jsonl`);

      fs.writeFileSync(
        filePath,
        'not json\nalso not json\n{bad: true}\n',
        'utf-8'
      );

      const result = resumeSession(filePath);

      expect(result.canResume).toBe(false);
      expect(result.metadata.entryCount).toBe(0);
    });
  });

  describe('missing files', () => {
    it('should return canResume: false when file does not exist', () => {
      const filePath = path.join(tmpDir, 'nonexistent.jsonl');

      const result = resumeSession(filePath);

      expect(result.canResume).toBe(false);
      expect(result.metadata.sessionId).toBe('nonexistent');
      expect(result.metadata.entryCount).toBe(0);
      expect(result.recentEntries).toEqual([]);
      expect(result.lastState).toBe('idle');
    });

    it('should return canResume: false for an empty file', () => {
      const sessionId = randomUUID();
      const filePath = path.join(tmpDir, `${sessionId}.jsonl`);
      fs.writeFileSync(filePath, '', 'utf-8');

      const result = resumeSession(filePath);

      expect(result.canResume).toBe(false);
      expect(result.metadata.entryCount).toBe(0);
    });
  });

  describe('head+tail reading for large files', () => {
    it('should not read the entire middle of a large file', () => {
      const sessionId = randomUUID();
      const filePath = path.join(tmpDir, `${sessionId}.jsonl`);

      // Create a file large enough that head (4KB) + tail (64KB) < total size
      // Each entry is roughly 200 bytes. We need > 68KB = ~350 entries
      const entries = buildLinkedEntries(500, 10000);
      writeJsonlFile(filePath, entries);

      const stat = fs.statSync(filePath);
      // Verify file is larger than head + tail combined
      expect(stat.size).toBeGreaterThan(4 * 1024 + 64 * 1024);

      const result = resumeSession(filePath);

      expect(result.canResume).toBe(true);
      expect(result.metadata.entryCount).toBe(500);
      expect(result.metadata.createdAt).toBe(10000);
      expect(result.metadata.lastActivityAt).toBe(10499);

      // Recent entries should come from the tail and NOT include all 500
      // (head parses ~20 entries from 4KB, tail parses ~300 from 64KB)
      expect(result.recentEntries.length).toBeGreaterThan(0);
      expect(result.recentEntries.length).toBeLessThan(500);

      // The last recent entry should be the last entry overall
      const lastRecent = result.recentEntries[result.recentEntries.length - 1];
      expect(lastRecent.timestamp).toBe(10499);
      expect(lastRecent.state).toBe('idle');
    });

    it('should handle small files where head+tail overlap', () => {
      const sessionId = randomUUID();
      const filePath = path.join(tmpDir, `${sessionId}.jsonl`);

      // Small file: 3 entries, well within 4KB
      const entries = buildLinkedEntries(3, 5000);
      writeJsonlFile(filePath, entries);

      const result = resumeSession(filePath);

      expect(result.canResume).toBe(true);
      expect(result.metadata.entryCount).toBe(3);
      // All entries should be in recent (file is tiny)
      expect(result.recentEntries.length).toBe(3);
    });
  });
});
