/**
 * Bounded, progress-tracking write buffer for the JSONL session journal (#910).
 *
 * - Writes track byte progress, so a write that fails partway (ENOSPC, EIO)
 *   resumes where it stopped instead of re-appending what reached the disk.
 * - While writes keep failing, the backlog is capped. The oldest unwritten
 *   entries are replaced by one `state_change` gap marker that reuses the last
 *   dropped entry's uuid and the first dropped entry's parentUuid, so the
 *   parentUuid chain on disk stays valid and session-resume still accepts it.
 *
 * @module mcp/services/session-write-buffer
 */

import * as fs from 'fs';
import type { SessionEntry } from './session-store';

/** `result` payload of a gap marker entry. */
export interface JournalGap {
  droppedEntries: number;
  reason: string;
}

interface PendingLine {
  data: Buffer;
  uuid: string;
  parentUuid: string | null;
  timestamp: number;
  state: SessionEntry['state'];
  /** Real entries this line stands for: 1, or the dropped count for a gap marker. */
  represents: number;
}

const GAP_REASON = 'write buffer cap reached while the session journal could not be written';
// Upper bound on a gap marker line, used while choosing how many lines to drop.
const GAP_MARKER_MAX_BYTES = 512;

export function encodeEntry(entry: SessionEntry): Buffer {
  return Buffer.from(JSON.stringify(entry) + '\n', 'utf-8');
}

export class SessionWriteBuffer {
  private lines: PendingLine[] = [];
  /** Bytes of lines[0] already on disk after a write that failed partway. */
  private headWritten = 0;
  private bytes = 0;
  private dropped = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly maxBytes: number,
    /** Called once per drop event with the running dropped total. */
    private readonly onDrop: (droppedTotal: number) => void,
  ) {}

  get size(): number { return this.lines.length; }
  get bufferedBytes(): number { return this.bytes; }
  get droppedEntries(): number { return this.dropped; }
  /** True when part of the oldest line is already on disk. */
  get hasPartialHead(): boolean { return this.headWritten > 0; }

  push(entry: SessionEntry, data: Buffer = encodeEntry(entry)): void {
    this.lines.push({
      data, uuid: entry.uuid, parentUuid: entry.parentUuid,
      timestamp: entry.timestamp, state: entry.state, represents: 1,
    });
    this.bytes += data.length;
    this.enforceCaps();
  }

  /** Remove the newest line (an entry whose first write put nothing on disk). */
  popNewest(): void {
    const line = this.lines.pop();
    if (line) this.bytes -= line.data.length;
  }

  /**
   * Append every buffered line with one write loop over a single buffer, then
   * map the bytes written back onto line boundaries. On failure only the
   * unwritten remainder stays buffered.
   */
  writeTo(filePath: string): void {
    if (this.lines.length === 0) return;
    const pending = Buffer.concat(this.lines.map(line => line.data));
    let offset = this.headWritten;
    const fd = fs.openSync(filePath, 'a');
    try {
      while (offset < pending.length) {
        const count = fs.writeSync(fd, pending, offset, pending.length - offset);
        if (count <= 0) throw new Error(`session journal write made no progress: ${filePath}`);
        offset += count;
      }
    } finally {
      this.settle(offset);
      try {
        fs.closeSync(fd);
      } catch {
        // The bytes were handed to the kernel already; a write error, if any,
        // is the one worth reporting.
      }
    }
  }

  /** Drop the lines fully covered by `offset` bytes and keep partial progress. */
  private settle(offset: number): void {
    let completed = 0;
    let consumed = 0;
    while (completed < this.lines.length && consumed + this.lines[completed].data.length <= offset) {
      consumed += this.lines[completed].data.length;
      completed++;
    }
    if (completed > 0) {
      this.lines.splice(0, completed);
      this.bytes -= consumed;
    }
    this.headWritten = offset - consumed;
  }

  /**
   * Replace the oldest droppable lines with one gap marker until both caps hold.
   * The newest line and a partially written head line are never dropped.
   */
  private enforceCaps(): void {
    const start = this.headWritten > 0 ? 1 : 0;
    const newest = this.lines.length - 1;
    let end = start;
    let removedBytes = 0;
    const over = (): boolean => {
      const removed = end - start;
      const marker = removed > 0 ? 1 : 0;
      return this.lines.length - removed + marker > this.maxEntries
        || this.bytes - removedBytes + marker * GAP_MARKER_MAX_BYTES > this.maxBytes;
    };
    if (!over()) return;
    while (end < newest && over()) {
      removedBytes += this.lines[end].data.length;
      end++;
    }
    // Swapping a single line for a marker frees nothing (caps below 2 lines).
    if (end - start < 2) return;

    const run = this.lines.slice(start, end);
    const first = run[0];
    const last = run[run.length - 1];
    const represents = run.reduce((sum, line) => sum + line.represents, 0);
    // An earlier marker inside the run was already counted.
    const newlyDropped = run.filter(line => line.represents === 1).length;
    const gap: JournalGap = { droppedEntries: represents, reason: GAP_REASON };
    const markerEntry: SessionEntry = {
      uuid: last.uuid, parentUuid: first.parentUuid, timestamp: last.timestamp,
      type: 'state_change', state: last.state, result: { journalGap: gap },
    };
    const data = encodeEntry(markerEntry);
    this.lines.splice(start, run.length, {
      data, uuid: last.uuid, parentUuid: first.parentUuid,
      timestamp: last.timestamp, state: last.state, represents,
    });
    this.bytes += data.length - removedBytes;
    this.dropped += newlyDropped;
    this.onDrop(this.dropped);
  }
}
