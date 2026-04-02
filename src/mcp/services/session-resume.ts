/**
 * Agentic QE v3 - Session Resume Service
 *
 * IMP-04: Transcript-First Session Durability
 * Reads an existing JSONL session file by sampling the head (first 4KB)
 * and tail (last 64KB) to reconstruct metadata and recent entries
 * without reading the entire file.
 *
 * @module mcp/services/session-resume
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SessionEntry, SessionMetadata } from './session-store';

// ============================================================================
// Types
// ============================================================================

export interface SessionResumeResult {
  metadata: SessionMetadata;
  recentEntries: SessionEntry[];
  lastState: 'idle' | 'running' | 'requires_action';
  canResume: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const HEAD_BYTES = 4 * 1024;  // 4KB
const TAIL_BYTES = 64 * 1024; // 64KB

// ============================================================================
// Public API
// ============================================================================

/**
 * Resume a session from a JSONL file.
 *
 * Reads the first 4KB (head) to extract session start metadata and
 * the last 64KB (tail) to get recent entries. Parses JSONL lines,
 * reconstructs the parentUuid linked list, and returns metadata +
 * recent entries + resume capability.
 *
 * Corrupt or incomplete lines are skipped gracefully.
 */
export function resumeSession(filePath: string): SessionResumeResult {
  // If file doesn't exist, return non-resumable result
  if (!fs.existsSync(filePath)) {
    return {
      metadata: {
        sessionId: extractSessionId(filePath),
        createdAt: 0,
        lastActivityAt: 0,
        entryCount: 0,
        state: 'idle',
      },
      recentEntries: [],
      lastState: 'idle',
      canResume: false,
    };
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  if (fileSize === 0) {
    return {
      metadata: {
        sessionId: extractSessionId(filePath),
        createdAt: 0,
        lastActivityAt: 0,
        entryCount: 0,
        state: 'idle',
      },
      recentEntries: [],
      lastState: 'idle',
      canResume: false,
    };
  }

  // Read head (first 4KB)
  const headEntries = readHead(filePath, fileSize);

  // Read tail (last 64KB)
  const tailEntries = readTail(filePath, fileSize);

  // Merge and deduplicate: use a Map keyed by uuid to ensure uniqueness
  const entryMap = new Map<string, SessionEntry>();
  for (const entry of headEntries) {
    entryMap.set(entry.uuid, entry);
  }
  for (const entry of tailEntries) {
    entryMap.set(entry.uuid, entry);
  }

  const allEntries = Array.from(entryMap.values());
  allEntries.sort((a, b) => a.timestamp - b.timestamp);

  // Reconstruct metadata from available entries
  const firstEntry = headEntries[0] ?? allEntries[0];
  const lastEntry = tailEntries[tailEntries.length - 1] ?? allEntries[allEntries.length - 1];

  // For entry count: if file is small enough that head+tail overlap,
  // allEntries.length is accurate. Otherwise, count total lines.
  let entryCount: number;
  if (fileSize <= HEAD_BYTES + TAIL_BYTES) {
    entryCount = allEntries.length;
  } else {
    entryCount = countLines(filePath);
  }

  const lastState = lastEntry?.state ?? 'idle';

  const metadata: SessionMetadata = {
    sessionId: extractSessionId(filePath),
    createdAt: firstEntry?.timestamp ?? 0,
    lastActivityAt: lastEntry?.timestamp ?? 0,
    entryCount,
    state: lastState,
  };

  return {
    metadata,
    recentEntries: tailEntries,
    lastState,
    canResume: allEntries.length > 0,
  };
}

// ============================================================================
// Private helpers
// ============================================================================

/**
 * Extract session ID from file path (filename without extension).
 */
function extractSessionId(filePath: string): string {
  return path.basename(filePath, '.jsonl');
}

/**
 * Read and parse the first HEAD_BYTES of the file.
 */
function readHead(filePath: string, fileSize: number): SessionEntry[] {
  const bytesToRead = Math.min(HEAD_BYTES, fileSize);
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytesToRead);
    fs.readSync(fd, buffer, 0, bytesToRead, 0);
    const text = buffer.toString('utf-8');
    return parseJsonlLines(text, /* isHead */ true);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Read and parse the last TAIL_BYTES of the file.
 */
function readTail(filePath: string, fileSize: number): SessionEntry[] {
  const bytesToRead = Math.min(TAIL_BYTES, fileSize);
  const offset = Math.max(0, fileSize - bytesToRead);
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytesToRead);
    fs.readSync(fd, buffer, 0, bytesToRead, offset);
    const text = buffer.toString('utf-8');
    // When offset is 0, we read from the start of the file so
    // the first line is complete -- don't skip it.
    const isMidFileRead = offset > 0;
    return parseJsonlLines(text, /* isHead */ false, isMidFileRead);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Parse JSONL text into SessionEntry[], skipping corrupt/incomplete lines.
 * When reading from a mid-file offset (tail), the first partial line is skipped.
 * When reading head, the last partial line is skipped if the chunk doesn't
 * end with a newline.
 *
 * @param text - Raw text from the file chunk
 * @param isHead - Whether this is a head read (skip trailing partial line)
 * @param skipFirstLine - Whether to skip the first line (true for mid-file
 *   tail reads where the first line is likely a partial). Defaults to !isHead.
 */
function parseJsonlLines(
  text: string,
  isHead: boolean,
  skipFirstLine?: boolean,
): SessionEntry[] {
  const lines = text.split('\n');
  const entries: SessionEntry[] = [];

  // Default: skip first line for non-head reads (standard tail behavior)
  const shouldSkipFirst = skipFirstLine ?? !isHead;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Skip first line of mid-file tail read (may be partial)
    if (shouldSkipFirst && i === 0 && lines.length > 1) continue;
    // Skip last line of head read if it may be truncated
    if (isHead && i === lines.length - 1 && lines.length > 1 && !text.endsWith('\n')) continue;

    try {
      const entry = JSON.parse(line) as SessionEntry;
      if (isValidEntry(entry)) {
        entries.push(entry);
      }
    } catch {
      // Skip corrupt lines
      continue;
    }
  }

  return entries;
}

/**
 * Minimal validation that a parsed object looks like a SessionEntry.
 */
function isValidEntry(obj: unknown): obj is SessionEntry {
  if (typeof obj !== 'object' || obj === null) return false;
  const entry = obj as Record<string, unknown>;
  return (
    typeof entry.uuid === 'string' &&
    typeof entry.timestamp === 'number' &&
    typeof entry.type === 'string' &&
    typeof entry.state === 'string'
  );
}

/**
 * Count total lines in a file (for large files where head+tail don't overlap).
 * Only counts non-empty lines that parse as valid JSON.
 */
function countLines(filePath: string): number {
  const content = fs.readFileSync(filePath, 'utf-8');
  let count = 0;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed) {
      try {
        JSON.parse(trimmed);
        count++;
      } catch {
        // Skip corrupt lines in count
      }
    }
  }
  return count;
}
