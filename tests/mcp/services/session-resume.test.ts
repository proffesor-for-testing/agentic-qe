/**
 * IMP-04: Session Resume Tests
 * Verifies session resumption from JSONL files including:
 * - well-formed files, corrupt lines, missing files
 * - bounded full-file validation with a capped recent-entry projection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { resumeSession as inspectSession } from '../../../src/mcp/services/session-resume';
import type { SessionEntry } from '../../../src/mcp/services/session-store';

// ============================================================================
// Helpers
// ============================================================================

let tmpDir: string;

const resumeSession = (filePath: string) => inspectSession(filePath, {
  sessionRoot: tmpDir,
  allowLegacyUnverified: true,
});

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
    it('should reject corrupt lines in the recoverable prefix', () => {
      const sessionId = randomUUID();
      const filePath = path.join(tmpDir, `${sessionId}.jsonl`);

      const entries = buildLinkedEntries(5, 4000);
      const lines = entries.map(e => JSON.stringify(e));

      // Inject corrupt lines
      lines.splice(2, 0, '{{NOT VALID JSON!!!');
      lines.splice(4, 0, 'also broken {{{');

      fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');

      const result = resumeSession(filePath);

      expect(result.canResume).toBe(false);
      expect(result.disposition).toBe('INVALID');
      expect(result.metadata.entryCount).toBe(0);
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

  describe('trust and integrity boundary', () => {
    it('should require explicit opt-in before resuming an uncommitted legacy transcript', () => {
      const filePath = path.join(tmpDir, 'legacy.jsonl');
      writeJsonlFile(filePath, buildLinkedEntries(2));

      const result = inspectSession(filePath, { sessionRoot: tmpDir });

      expect(result.canResume).toBe(false);
      expect(result.disposition).toBe('LEGACY_UNVERIFIED');
      expect(result.diagnostics).toContain('legacy JSONL has no durable commit marker');
    });

    it('should reject a symlink without reading its target', () => {
      const target = path.join(tmpDir, 'target.jsonl');
      const link = path.join(tmpDir, 'link.jsonl');
      writeJsonlFile(target, buildLinkedEntries(2));
      fs.symlinkSync(target, link);

      const result = inspectSession(link, { sessionRoot: tmpDir, allowLegacyUnverified: true });

      expect(result.canResume).toBe(false);
      expect(result.disposition).toBe('UNTRUSTED');
      expect(result.metadata.entryCount).toBe(0);
    });

    it('should reject a path outside the configured session root', () => {
      const outside = path.join(os.tmpdir(), `outside-${randomUUID()}.jsonl`);
      writeJsonlFile(outside, buildLinkedEntries(1));
      try {
        const result = inspectSession(outside, { sessionRoot: tmpDir, allowLegacyUnverified: true });
        expect(result.canResume).toBe(false);
        expect(result.disposition).toBe('UNTRUSTED');
      } finally {
        fs.unlinkSync(outside);
      }
    });

    it('should reject a broken parent lineage instead of reconstructing a suffix', () => {
      const filePath = path.join(tmpDir, 'broken-chain.jsonl');
      const entries = buildLinkedEntries(3);
      entries[1].parentUuid = randomUUID();
      writeJsonlFile(filePath, entries);

      const result = resumeSession(filePath);

      expect(result.canResume).toBe(false);
      expect(result.disposition).toBe('INVALID');
      expect(result.diagnostics).toContain('broken parentUuid lineage');
    });

    it('should enforce the file-size bound before parsing', () => {
      const filePath = path.join(tmpDir, 'oversized.jsonl');
      writeJsonlFile(filePath, buildLinkedEntries(2));

      const result = inspectSession(filePath, {
        sessionRoot: tmpDir, allowLegacyUnverified: true, maxFileBytes: 8,
      });

      expect(result.canResume).toBe(false);
      expect(result.disposition).toBe('RESOURCE_LIMIT');
    });

    it('should reject invalid UTF-8 before JSON parsing', () => {
      const filePath = path.join(tmpDir, 'invalid-utf8.jsonl');
      fs.writeFileSync(filePath, Buffer.from([0xc3, 0x28, 0x0a]));

      const result = resumeSession(filePath);

      expect(result.canResume).toBe(false);
      expect(result.disposition).toBe('INVALID');
      expect(result.diagnostics).toContain('transcript is not valid UTF-8');
    });
  });

  describe('bounded validation for larger files', () => {
    it('should validate the full bounded transcript and cap returned recent entries', () => {
      const sessionId = randomUUID();
      const filePath = path.join(tmpDir, `${sessionId}.jsonl`);

      // Create enough entries to exceed the recent-entry projection.
      const entries = buildLinkedEntries(500, 10000);
      writeJsonlFile(filePath, entries);

      const stat = fs.statSync(filePath);
      expect(stat.size).toBeGreaterThan(64 * 1024);

      const result = resumeSession(filePath);

      expect(result.canResume).toBe(true);
      expect(result.metadata.entryCount).toBe(500);
      expect(result.metadata.createdAt).toBe(10000);
      expect(result.metadata.lastActivityAt).toBe(10499);

      // Full validation counts every entry while the returned projection stays bounded.
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
