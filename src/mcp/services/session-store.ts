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
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(sessionDir?: string) {
    this.sessionDir = sessionDir ?? DEFAULT_SESSION_DIR;
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

    const uuid = randomUUID();
    const fullEntry: SessionEntry = {
      ...entry,
      uuid,
      parentUuid: this.lastUuid,
    };

    this.lastUuid = uuid;
    this.entryCount++;
    this.lastActivityAt = fullEntry.timestamp;
    this.currentState = fullEntry.state;

    const line = JSON.stringify(fullEntry) + '\n';

    if (!this.fileCreated) {
      // First write: synchronous for write-ahead guarantee
      this.ensureDirectory();
      fs.appendFileSync(this.filePath!, line, 'utf-8');
      this.fileCreated = true;
    } else {
      // Subsequent writes: buffer and batch
      this.writeBuffer.push(line);
      this.scheduleBatchFlush();
    }

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
      this.writeBuffer = [];
      fs.appendFileSync(this.filePath, batch, 'utf-8');
    }
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

  private scheduleBatchFlush(): void {
    if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, BATCH_FLUSH_MS);
    }
  }
}
