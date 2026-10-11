/**
 * Agentic QE v3 - Append-Only JSONL Session Store
 *
 * IMP-04: Transcript-First Session Durability
 * Provides an append-only JSONL log of all tool calls, results, and state
 * changes within a session. Supports write batching (100ms window) and
 * lazy file creation (no file until first append).
 *
 * Issue #910: writes track progress byte by byte, so a write that fails partway
 * (ENOSPC, EIO) resumes where it stopped instead of re-appending what already
 * reached the disk. The unwritten backlog is bounded while the disk keeps
 * failing; dropped entries become one gap marker that keeps the transcript
 * resumable (see session-write-buffer.ts).
 *
 * @module mcp/services/session-store
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { findProjectRoot } from '../../kernel/project-root.js';
import { SessionWriteBuffer, encodeEntry } from './session-write-buffer.js';

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

export interface SessionStoreOptions {
  /** Most unwritten entries held while writes fail. Oldest are dropped beyond it. */
  maxBufferedEntries?: number;
  /** Most unwritten bytes held while writes fail. Oldest are dropped beyond it. */
  maxBufferedBytes?: number;
}

export interface SessionWriteBufferStats {
  bufferedEntries: number;
  bufferedBytes: number;
  /** Entries replaced by a gap marker in this session because the buffer hit a cap. */
  droppedEntries: number;
}

// ============================================================================
// Session Store
// ============================================================================

const DEFAULT_SESSION_DIR = '.agentic-qe/sessions';
const BATCH_FLUSH_MS = 100;
const DEFAULT_MAX_BUFFERED_ENTRIES = 10_000;
// Matches the largest transcript session-resume will read.
const DEFAULT_MAX_BUFFERED_BYTES = 16 * 1024 * 1024;

function positiveLimit(name: string, value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`SessionStore ${name} must be a positive integer, got ${value}`);
  }
  return value;
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
  /** Lines not yet fully on disk, oldest first. */
  private writeBuffer: SessionWriteBuffer;
  private dropWarned = false;
  private readonly maxBufferedEntries: number;
  private readonly maxBufferedBytes: number;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  // Database-free mode (#534): keep session bookkeeping in memory but never
  // write .agentic-qe/sessions/*.jsonl to disk.
  private readonly persistDisabled: boolean = process.env.AQE_MEMORY_BACKEND === 'memory';

  constructor(sessionDir?: string, options: SessionStoreOptions = {}) {
    this.maxBufferedEntries = positiveLimit('maxBufferedEntries', options.maxBufferedEntries, DEFAULT_MAX_BUFFERED_ENTRIES);
    this.maxBufferedBytes = positiveLimit('maxBufferedBytes', options.maxBufferedBytes, DEFAULT_MAX_BUFFERED_BYTES);
    this.writeBuffer = this.createWriteBuffer();
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
    this.writeBuffer = this.createWriteBuffer();
    this.dropWarned = false;
    this.flushTimer = null;
    this.closed = false;

    return this.sessionId;
  }

  /**
   * Append an entry to the session log.
   * Assigns a uuid, links parentUuid to the previous entry,
   * and writes a JSON line to the file.
   *
   * The first write is synchronous for a write-ahead guarantee.
   * Subsequent writes are batched for up to 100ms before flushing.
   *
   * Returns the assigned uuid.
   */
  append(entry: SessionEntryInput): string {
    if (!this.sessionId || this.closed) {
      throw new Error('No active session. Call startSession() first.');
    }

    const uuid = randomUUID();
    const fullEntry: SessionEntry = {
      ...entry,
      uuid,
      parentUuid: this.lastUuid,
    };

    // Database-free mode keeps bookkeeping without serialization or disk I/O.
    if (!this.persistDisabled) {
      const line = encodeEntry(fullEntry);

      if (!this.fileCreated) {
        // First write: synchronous for write-ahead guarantee
        this.ensureDirectory();
        this.writeBuffer.push(fullEntry, line);
        try {
          this.writePending();
        } catch (error) {
          if (!this.writeBuffer.hasPartialHead) {
            // Nothing reached the disk: reject the entry and leave the chain as it was.
            this.writeBuffer.popNewest();
            throw error;
          }
          // Part of the line is on disk. Keep it so a retry completes the record
          // rather than leaving a torn prefix for the next line to glue onto.
          this.fileCreated = true;
          this.accept(fullEntry);
          this.scheduleBatchFlush();
          throw error;
        }
        this.fileCreated = true;
      } else {
        // Subsequent writes: buffer and batch
        this.writeBuffer.push(fullEntry, line);
        this.scheduleBatchFlush();
      }
    }

    // Only advance the chain and metadata after the entry has been accepted.
    this.accept(fullEntry);
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

    if (this.fileCreated) {
      this.writePending();
    }
  }

  /**
   * Size of the unwritten backlog and how many entries the cap has dropped.
   */
  getWriteBufferStats(): SessionWriteBufferStats {
    return {
      bufferedEntries: this.writeBuffer.size,
      bufferedBytes: this.writeBuffer.bufferedBytes,
      droppedEntries: this.writeBuffer.droppedEntries,
    };
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

  private ensureDirectory(): void {
    const dir = path.dirname(this.filePath!);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private accept(entry: SessionEntry): void {
    this.lastUuid = entry.uuid;
    this.entryCount++;
    this.lastActivityAt = entry.timestamp;
    this.currentState = entry.state;
  }

  private writePending(): void {
    if (this.filePath) this.writeBuffer.writeTo(this.filePath);
  }

  private createWriteBuffer(): SessionWriteBuffer {
    return new SessionWriteBuffer(this.maxBufferedEntries, this.maxBufferedBytes, () => {
      if (this.dropWarned) return;
      this.dropWarned = true;
      // "[AQE] WARN" passes the MCP entry's stderr filter.
      console.error(
        `[AQE] WARN session journal ${this.filePath}: writes keep failing and the buffer reached its cap `
        + `(${this.maxBufferedEntries} entries / ${this.maxBufferedBytes} bytes). The oldest unwritten entries `
        + 'are replaced by one gap marker: their content is lost, but the transcript stays resumable. '
        + 'The dropped count is in getWriteBufferStats() and in the marker.',
      );
    });
  }

  private scheduleBatchFlush(): void {
    if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, BATCH_FLUSH_MS);
    }
  }
}
