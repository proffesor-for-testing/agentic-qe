/** Bounded, fail-closed recovery for legacy JSONL session transcripts. */
import * as fs from 'fs';
import * as path from 'path';
import type { SessionEntry, SessionMetadata } from './session-store';

export type SessionRecoveryDisposition =
  | 'MISSING' | 'EMPTY' | 'LEGACY_UNVERIFIED' | 'INVALID' | 'UNTRUSTED' | 'RESOURCE_LIMIT';

export interface SessionResumeOptions {
  /** Canonical directory that must contain the session file. */
  sessionRoot: string;
  /** Explicit compatibility opt-in; legacy JSONL has no commit proof. */
  allowLegacyUnverified?: boolean;
  maxFileBytes?: number;
  maxRecordBytes?: number;
  maxRecords?: number;
}

export interface SessionResumeResult {
  metadata: SessionMetadata;
  recentEntries: SessionEntry[];
  lastState: 'idle' | 'running' | 'requires_action';
  canResume: boolean;
  disposition: SessionRecoveryDisposition;
  diagnostics: string[];
}

const DEFAULT_MAX_FILE_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_RECORD_BYTES = 1024 * 1024;
const DEFAULT_MAX_RECORDS = 100_000;
const RECENT_ENTRY_LIMIT = 256;
const ENTRY_TYPES = new Set(['tool_call', 'tool_result', 'state_change', 'error']);
const ENTRY_STATES = new Set(['idle', 'running', 'requires_action']);

function emptyResult(filePath: string, disposition: SessionRecoveryDisposition, diagnostics: string[] = []): SessionResumeResult {
  return {
    metadata: {
      sessionId: path.basename(filePath, '.jsonl'), createdAt: 0, lastActivityAt: 0,
      entryCount: 0, state: 'idle',
    },
    recentEntries: [], lastState: 'idle', canResume: false, disposition, diagnostics,
  };
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function isValidEntry(value: unknown): value is SessionEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.uuid === 'string' && entry.uuid.length > 0
    && (entry.parentUuid === null || typeof entry.parentUuid === 'string')
    && typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp)
    && typeof entry.type === 'string' && ENTRY_TYPES.has(entry.type)
    && typeof entry.state === 'string' && ENTRY_STATES.has(entry.state);
}

function readExactly(fd: number, fileSize: number): Buffer {
  const buffer = Buffer.alloc(fileSize);
  let offset = 0;
  while (offset < fileSize) {
    const count = fs.readSync(fd, buffer, offset, fileSize - offset, offset);
    if (count === 0) throw new Error('unexpected EOF while reading session transcript');
    offset += count;
  }
  return buffer;
}

/**
 * Inspect a legacy transcript through one no-follow descriptor. Automatic
 * resume requires an explicit opt-in because this format has no commit marker.
 */
export function resumeSession(filePath: string, options: SessionResumeOptions): SessionResumeResult {
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxRecordBytes = options.maxRecordBytes ?? DEFAULT_MAX_RECORD_BYTES;
  const maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS;
  const candidate = path.resolve(filePath);

  let root: string;
  let parent: string;
  try {
    root = fs.realpathSync(options.sessionRoot);
    parent = fs.realpathSync(path.dirname(candidate));
  } catch {
    return emptyResult(filePath, 'UNTRUSTED', ['session root or parent cannot be resolved']);
  }
  if (!isWithin(root, parent)) {
    return emptyResult(filePath, 'UNTRUSTED', ['session path escapes the configured root']);
  }

  let linkStat: fs.Stats;
  try {
    linkStat = fs.lstatSync(candidate);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return emptyResult(filePath, code === 'ENOENT' ? 'MISSING' : 'UNTRUSTED', [`lstat failed: ${code ?? 'UNKNOWN'}`]);
  }
  if (linkStat.isSymbolicLink() || !linkStat.isFile()) {
    return emptyResult(filePath, 'UNTRUSTED', ['session path is not a regular, non-symlink file']);
  }

  let fd: number | undefined;
  try {
    fd = fs.openSync(candidate, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) {
      return emptyResult(filePath, 'UNTRUSTED', ['opened session is not an exclusive regular file']);
    }
    if (stat.size === 0) return emptyResult(filePath, 'EMPTY');
    if (stat.size > maxFileBytes) {
      return emptyResult(filePath, 'RESOURCE_LIMIT', [`file exceeds ${maxFileBytes} bytes`]);
    }

    const bytes = readExactly(fd, stat.size);
    const hasTornTail = bytes[bytes.length - 1] !== 0x0a;
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return emptyResult(filePath, 'INVALID', ['transcript is not valid UTF-8']);
    }
    const lines = text.split('\n');
    if (hasTornTail) lines.pop();
    const entries: SessionEntry[] = [];
    const seen = new Set<string>();
    let previous: SessionEntry | undefined;

    for (const rawLine of lines) {
      if (!rawLine.trim()) continue;
      if (Buffer.byteLength(rawLine, 'utf8') > maxRecordBytes) {
        return emptyResult(filePath, 'RESOURCE_LIMIT', [`record exceeds ${maxRecordBytes} bytes`]);
      }
      if (entries.length >= maxRecords) {
        return emptyResult(filePath, 'RESOURCE_LIMIT', [`record count exceeds ${maxRecords}`]);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawLine);
      } catch {
        return emptyResult(filePath, 'INVALID', ['corrupt JSON occurs before the final torn record']);
      }
      if (!isValidEntry(parsed)) return emptyResult(filePath, 'INVALID', ['entry fails the session schema']);
      if (seen.has(parsed.uuid)) return emptyResult(filePath, 'INVALID', ['duplicate entry UUID']);
      if (previous) {
        if (parsed.parentUuid !== previous.uuid) return emptyResult(filePath, 'INVALID', ['broken parentUuid lineage']);
        if (parsed.timestamp < previous.timestamp) return emptyResult(filePath, 'INVALID', ['timestamps are not monotonic']);
      } else if (parsed.parentUuid !== null) {
        return emptyResult(filePath, 'INVALID', ['first entry has a forged parentUuid']);
      }
      seen.add(parsed.uuid);
      entries.push(parsed);
      previous = parsed;
    }

    if (entries.length === 0) {
      return emptyResult(filePath, hasTornTail ? 'INVALID' : 'EMPTY', hasTornTail ? ['only record is torn'] : []);
    }
    const lastEntry = entries[entries.length - 1];
    const diagnostics = [
      'legacy JSONL has no durable commit marker',
      ...(hasTornTail ? ['discarded an incomplete final record'] : []),
    ];
    return {
      metadata: {
        sessionId: path.basename(filePath, '.jsonl'), createdAt: entries[0].timestamp,
        lastActivityAt: lastEntry.timestamp, entryCount: entries.length, state: lastEntry.state,
      },
      recentEntries: entries.slice(-RECENT_ENTRY_LIMIT), lastState: lastEntry.state,
      canResume: options.allowLegacyUnverified === true,
      disposition: 'LEGACY_UNVERIFIED', diagnostics,
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return emptyResult(filePath, 'UNTRUSTED', [`secure open/read failed: ${code ?? 'UNKNOWN'}`]);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
