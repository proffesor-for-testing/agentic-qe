/**
 * Agentic QE v3 - Append-Only JSONL Session Store
 *
 * IMP-04: Transcript-First Session Durability
 * Provides an append-only JSONL log of all tool calls, results, and state
 * changes within a session. Supports write batching (100ms window) and
 * lazy file creation (no file until first append).
 *
 * @module mcp/services/session-store
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { findProjectRoot } from '../../kernel/project-root.js';

// ============================================================================
// Types
// ============================================================================

export interface SessionEntry {
  uuid: string;
  parentUuid: string | null;
  timestamp: number;
  type: 'tool_call' | 'tool_result' | 'state_change' | 'error';
  toolName?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  state: 'idle' | 'running' | 'requires_action';
  tokenEstimate?: number;
}

export interface SessionMetadata {
  sessionId: string;
  createdAt: number;
  lastActivityAt: number;
  entryCount: number;
  state: 'idle' | 'running' | 'requires_action';
}

export type SessionEntryInput = Omit<SessionEntry, 'uuid' | 'parentUuid'>;

// ============================================================================
// Session Store
// ============================================================================

const DEFAULT_SESSION_DIR = '.agentic-qe/sessions';
const BATCH_FLUSH_MS = 100;
const MAX_BUFFERED_ENTRIES = 1024;
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;

/** Admission failed; no UUID, chain, or accepted metadata was advanced. */
export class SessionBufferLimitError extends Error {
  constructor() {
    super('Session journal buffer limit reached; transcript incomplete until storage recovers');
    this.name = 'SessionBufferLimitError';
  }
}

export class SessionStore {
  private readonly sessionDir: string;
  private sessionId: string | null = null;
  private filePath: string | null = null;
  private fileCreated = false;
  private lastUuid: string | null = null;
  private entryCount = 0;
  private createdAt = 0;
  private lastActivityAt = 0;
  private currentState: 'idle' | 'running' | 'requires_action' = 'idle';
  private writeBuffer: string[] = [];
  private bufferedBytes = 0;
  private backpressured = false;
  private rejectedEntries = 0;
  private rejectedToolResults = 0;
  private rejectedToolCalls = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  // Database-free mode (#534): keep session bookkeeping in memory but never
  // write .agentic-qe/sessions/*.jsonl to disk.
  private readonly persistDisabled: boolean = process.env.AQE_MEMORY_BACKEND === 'memory';

  constructor(sessionDir?: string) {
    // #735: a cwd-relative default created `<subdir>/.agentic-qe/sessions`
    // on the first MCP tool call, which later runs then adopted as the
    // nearest project store. Anchor the default at the project root.
    this.sessionDir = sessionDir ?? path.join(findProjectRoot(), DEFAULT_SESSION_DIR);
  }

  /**
   * Start a new session. Returns the sessionId (UUID).
   * File is NOT created until the first append (lazy creation).
   */
  startSession(): string {
    if (this.sessionId !== null) {
      this.close();
    }

    this.sessionId = randomUUID();
    this.filePath = path.join(this.sessionDir, `${this.sessionId}.jsonl`);
    this.fileCreated = false;
    this.lastUuid = null;
    this.entryCount = 0;
    this.createdAt = Date.now();
    this.lastActivityAt = this.createdAt;
    this.currentState = 'idle';
    this.writeBuffer = [];
    this.bufferedBytes = 0;
    this.backpressured = false;
    this.rejectedEntries = 0;
    this.rejectedToolResults = 0;
    this.rejectedToolCalls = 0;
    this.flushTimer = null;
    this.closed = false;

    return this.sessionId;
  }

  /**
   * Append an entry to the session log.
   * Assigns a uuid, links parentUuid to the previous entry,
   * and writes a JSON line to the file.
   *
   * First write uses appendFileSync for write-ahead guarantee.
   * Subsequent writes are batched for up to 100ms before flushing.
   *
   * Returns the assigned uuid.
   */
  append(entry: SessionEntryInput): string {
    if (!this.sessionId || this.closed) {
      throw new Error('No active session. Call startSession() first.');
    }

    if (!this.persistDisabled && this.backpressured) {
      try { this.flush(); } catch { this.rejectEntry(entry); }
    }

    const uuid = randomUUID();
    const fullEntry: SessionEntry = {
      ...entry,
      uuid,
      parentUuid: this.lastUuid,
    };

    // Database-free mode keeps bookkeeping without serialization or disk I/O.
    if (!this.persistDisabled) {
      let line = JSON.stringify(fullEntry) + '\n';
      if (this.fileCreated && (this.writeBuffer.length >= MAX_BUFFERED_ENTRIES ||
          this.bufferedBytes + Buffer.byteLength(line, 'utf8') > MAX_BUFFERED_BYTES)) {
        try { this.flush(); } catch { this.rejectEntry(entry); }
        // Recovery may have appended a gap marker, which becomes this entry's parent.
        fullEntry.parentUuid = this.lastUuid;
        line = JSON.stringify(fullEntry) + '\n';
        if (Buffer.byteLength(line, 'utf8') > MAX_BUFFERED_BYTES) this.rejectEntry(entry);
      }

      if (!this.fileCreated) {
        // First write: synchronous for write-ahead guarantee
        this.ensureDirectory();
        fs.appendFileSync(this.filePath!, line, 'utf-8');
        this.fileCreated = true;
      } else {
        // Subsequent writes: buffer and batch
        this.writeBuffer.push(line);
        this.bufferedBytes += Buffer.byteLength(line, 'utf8');
        this.scheduleBatchFlush();
      }
    }

    // Only advance the chain and metadata after the entry has been accepted.
    this.lastUuid = uuid;
    this.entryCount++;
    this.lastActivityAt = fullEntry.timestamp;
    this.currentState = fullEntry.state;

    return uuid;
  }

  /**
   * Force sync any buffered writes to disk immediately.
   */
  flush(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.writeBuffer.length > 0 && this.filePath && this.fileCreated) {
      const batch = this.writeBuffer.join('');
      fs.appendFileSync(this.filePath, batch, 'utf-8');
      this.writeBuffer = [];
      this.bufferedBytes = 0;
    }

    if (this.rejectedEntries > 0 && this.filePath && this.fileCreated) {
      // A bounded marker records the omission without inventing missing tool results.
      const marker: SessionEntry = {
        uuid: randomUUID(), parentUuid: this.lastUuid, timestamp: this.lastActivityAt,
        type: 'error', state: 'requires_action',
        result: { code: 'SESSION_TRANSCRIPT_GAP', rejectedEntries: this.rejectedEntries,
          rejectedToolResults: this.rejectedToolResults, rejectedToolCalls: this.rejectedToolCalls },
      };
      const line = JSON.stringify(marker) + '\n';
      this.writeBuffer.push(line);
      this.bufferedBytes = Buffer.byteLength(line, 'utf8');
      this.lastUuid = marker.uuid;
      this.entryCount++;
      this.currentState = marker.state;
      this.rejectedEntries = this.rejectedToolResults = this.rejectedToolCalls = 0;
      // Reuse ordinary batch flushing so its write-progress guarantees also cover
      // the marker. Counters are cleared, so recursion is bounded to one level.
      this.flush();
      return;
    }
    this.backpressured = false;
  }

  /**
   * Returns metadata about the current session.
   */
  getMetadata(): SessionMetadata {
    if (!this.sessionId) {
      throw new Error('No active session. Call startSession() first.');
    }

    return {
      sessionId: this.sessionId,
      createdAt: this.createdAt,
      lastActivityAt: this.lastActivityAt,
      entryCount: this.entryCount,
      state: this.currentState,
    };
  }

  /**
   * Returns the current session ID, or null if no session is active.
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Flush pending writes and mark the session as complete.
   */
  close(): void {
    if (this.closed) return;
    this.flush();
    this.closed = true;
  }

  /**
   * Returns the file path for the current session, or null.
   * Exposed for testing and resume integration.
   */
  getFilePath(): string | null {
    return this.filePath;
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private rejectEntry(entry: SessionEntryInput): never {
    this.backpressured = true;
    this.rejectedEntries = Math.min(Number.MAX_SAFE_INTEGER, this.rejectedEntries + 1);
    if (entry.type === 'tool_result') this.rejectedToolResults = Math.min(Number.MAX_SAFE_INTEGER, this.rejectedToolResults + 1);
    if (entry.type === 'tool_call') this.rejectedToolCalls = Math.min(Number.MAX_SAFE_INTEGER, this.rejectedToolCalls + 1);
    throw new SessionBufferLimitError();
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.filePath!);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private scheduleBatchFlush(): void {
    if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        try { this.flush(); } catch (error) {
          // Accepted rows remain queued. Admission enforces the bound on later calls.
          console.warn(`[MCP] [SessionStore] Journal flush failed: ${String(error)}`);
        }
      }, BATCH_FLUSH_MS);
    }
  }
}
