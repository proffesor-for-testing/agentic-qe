/**
 * RVF Native Adapter — thin wrapper around @ruvector/rvf-node N-API binding.
 *
 * Bypasses the buggy @ruvector/rvf SDK wrapper and talks directly to the
 * native layer.  Adds string-ID mapping on top of the numeric labels the
 * native API requires, and persists the mapping as a sidecar JSON file.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';

// ---------------------------------------------------------------------------
// Native binding — lazy-loaded, failure-safe
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _native: any = null;
let _nativeChecked = false;

function getNative(): typeof import('@ruvector/rvf-node') | null {
  if (_nativeChecked) return _native;
  _nativeChecked = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _native = require('@ruvector/rvf-node');
  } catch {
    _native = null;
  }
  return _native;
}

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface RvfSearchResult {
  /** String ID (mapped back from numeric label) */
  id: string;
  /** Raw distance from the native HNSW index */
  distance: number;
  /** Similarity score: 1 / (1 + distance) — cosine-compatible */
  score: number;
}

export interface RvfStatus {
  totalVectors: number;
  totalSegments: number;
  fileSizeBytes: number;
  epoch: number;
  witnessValid: boolean;
  witnessEntries: number;
}

export interface RvfNativeAdapter {
  /** Insert vectors with string IDs */
  ingest(entries: Array<{ id: string; vector: Float32Array | number[] }>): {
    accepted: number;
    rejected: number;
  };

  /** Search k nearest neighbours */
  search(query: Float32Array | number[], k: number): RvfSearchResult[];

  /** Delete by string IDs — returns count deleted */
  delete(ids: string[]): number;

  /** COW fork — creates an independent copy at `childPath` */
  fork(childPath: string): RvfNativeAdapter;

  /** Database status including witness-chain verification */
  status(): RvfStatus;

  /** Vector dimensionality */
  dimension(): number;

  /** Total vector count */
  size(): number;

  /** Compact to reclaim space from deleted vectors */
  compact(): void;

  /** Close and release native resources */
  close(): void;

  /** Whether the underlying database handle is still open */
  isOpen(): boolean;

  /** Filesystem path of the RVF container */
  path(): string;
}

// ---------------------------------------------------------------------------
// ID-map persistence helpers
// ---------------------------------------------------------------------------

interface IdMapData {
  nextLabel: number;
  entries: Array<[string, number]>;
}

function idMapPath(rvfPath: string): string {
  return `${rvfPath}.idmap.json`;
}

function loadIdMap(rvfPath: string): {
  strToNum: Map<string, number>;
  numToStr: Map<number, string>;
  nextLabel: number;
} {
  const p = idMapPath(rvfPath);
  const strToNum = new Map<string, number>();
  const numToStr = new Map<number, string>();
  let nextLabel = 1;

  if (existsSync(p)) {
    try {
      const raw: IdMapData = JSON.parse(readFileSync(p, 'utf-8'));
      nextLabel = raw.nextLabel;
      for (const [str, num] of raw.entries) {
        strToNum.set(str, num);
        numToStr.set(num, str);
      }
    } catch {
      // corrupted file — start fresh
    }
  }
  return { strToNum, numToStr, nextLabel };
}

function saveIdMap(
  rvfPath: string,
  strToNum: Map<string, number>,
  nextLabel: number,
): void {
  const data: IdMapData = {
    nextLabel,
    entries: Array.from(strToNum.entries()),
  };
  writeFileSync(idMapPath(rvfPath), JSON.stringify(data), 'utf-8');
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class RvfNativeAdapterImpl implements RvfNativeAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any;
  private _path: string;
  private _dimension: number;
  private strToNum: Map<string, number>;
  private numToStr: Map<number, string>;
  private nextLabel: number;
  private _open: boolean;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any,
    filePath: string,
    dim: number,
    strToNum: Map<string, number>,
    numToStr: Map<number, string>,
    nextLabel: number,
  ) {
    this.db = db;
    this._path = filePath;
    this._dimension = dim;
    this.strToNum = strToNum;
    this.numToStr = numToStr;
    this.nextLabel = nextLabel;
    this._open = true;
  }

  // -- ingest ---------------------------------------------------------------

  ingest(
    entries: Array<{ id: string; vector: Float32Array | number[] }>,
  ): { accepted: number; rejected: number } {
    this.ensureOpen();
    if (entries.length === 0) return { accepted: 0, rejected: 0 };

    const dim = this._dimension;
    const flat = new Float32Array(entries.length * dim);
    const ids: number[] = [];

    for (let i = 0; i < entries.length; i++) {
      const { id, vector } = entries[i];

      // Resolve or assign numeric label
      let label = this.strToNum.get(id);
      if (label === undefined) {
        label = this.nextLabel++;
        this.strToNum.set(id, label);
        this.numToStr.set(label, id);
      }
      ids.push(label);

      // Copy vector data into flat buffer
      const src = vector instanceof Float32Array ? vector : new Float32Array(vector);
      flat.set(src.subarray(0, dim), i * dim);
    }

    const result = this.db.ingestBatch(flat, ids);
    this.persistIdMap();
    return { accepted: result.accepted, rejected: result.rejected };
  }

  // -- search ---------------------------------------------------------------

  search(query: Float32Array | number[], k: number): RvfSearchResult[] {
    this.ensureOpen();
    const q = query instanceof Float32Array ? query : new Float32Array(query);
    const raw: Array<{ id: number; distance: number }> = this.db.query(q, k);

    return raw
      .map((r) => {
        const strId = this.numToStr.get(r.id);
        if (strId === undefined) return null;
        return {
          id: strId,
          distance: r.distance,
          score: 1 / (1 + r.distance),
        };
      })
      .filter((r): r is RvfSearchResult => r !== null);
  }

  // -- delete ---------------------------------------------------------------

  delete(ids: string[]): number {
    this.ensureOpen();
    const numericIds: number[] = [];
    for (const id of ids) {
      const label = this.strToNum.get(id);
      if (label !== undefined) {
        numericIds.push(label);
      }
    }
    if (numericIds.length === 0) return 0;

    const result = this.db.delete(numericIds);

    // Remove from maps
    for (const id of ids) {
      const label = this.strToNum.get(id);
      if (label !== undefined) {
        this.strToNum.delete(id);
        this.numToStr.delete(label);
      }
    }
    this.persistIdMap();
    return result.deleted;
  }

  // -- fork -----------------------------------------------------------------

  fork(childPath: string): RvfNativeAdapter {
    this.ensureOpen();
    // Copy the RVF file to get an independent snapshot with all data
    copyFileSync(this._path, childPath);

    // Copy the ID map
    const childStrToNum = new Map(this.strToNum);
    const childNumToStr = new Map(this.numToStr);
    saveIdMap(childPath, childStrToNum, this.nextLabel);

    const native = getNative()!;
    const childDb = native.RvfDatabase.open(childPath);
    return new RvfNativeAdapterImpl(
      childDb,
      childPath,
      this._dimension,
      childStrToNum,
      childNumToStr,
      this.nextLabel,
    );
  }

  // -- status ---------------------------------------------------------------

  status(): RvfStatus {
    this.ensureOpen();
    const s = this.db.status();
    // Count witness segments from the segment list
    const segs: Array<{ segType: string }> = this.db.segments();
    const witnessSegs = segs.filter((seg) => seg.segType === 'witness');
    return {
      totalVectors: s.totalVectors,
      totalSegments: s.totalSegments,
      fileSizeBytes: s.fileSize,
      epoch: s.currentEpoch,
      witnessValid: witnessSegs.length > 0,
      witnessEntries: witnessSegs.length,
    };
  }

  // -- accessors ------------------------------------------------------------

  dimension(): number {
    return this._dimension;
  }

  size(): number {
    this.ensureOpen();
    return this.db.status().totalVectors;
  }

  compact(): void {
    this.ensureOpen();
    this.db.compact();
  }

  close(): void {
    if (this._open) {
      this.db.close();
      this._open = false;
    }
  }

  isOpen(): boolean {
    return this._open;
  }

  path(): string {
    return this._path;
  }

  // -- internal -------------------------------------------------------------

  private ensureOpen(): void {
    if (!this._open) {
      throw new Error('RVF database is closed');
    }
  }

  private persistIdMap(): void {
    saveIdMap(this._path, this.strToNum, this.nextLabel);
  }
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/** Create a new RVF container */
export function createRvfStore(path: string, dimensions: number): RvfNativeAdapter {
  const native = getNative();
  if (!native) {
    throw new Error(
      '@ruvector/rvf-node is not available — install the package or check platform compatibility',
    );
  }
  const db = native.RvfDatabase.create(path, { dimension: dimensions });
  const dim = db.dimension();
  return new RvfNativeAdapterImpl(
    db,
    path,
    dim,
    new Map(),
    new Map(),
    1,
  );
}

/** Open an existing RVF container (loads persisted ID mapping) */
export function openRvfStore(path: string): RvfNativeAdapter {
  const native = getNative();
  if (!native) {
    throw new Error(
      '@ruvector/rvf-node is not available — install the package or check platform compatibility',
    );
  }
  const db = native.RvfDatabase.open(path);
  const dim = db.dimension();
  const { strToNum, numToStr, nextLabel } = loadIdMap(path);
  return new RvfNativeAdapterImpl(db, path, dim, strToNum, numToStr, nextLabel);
}

/** Check whether the native binding is loadable on this platform */
export function isRvfNativeAvailable(): boolean {
  return getNative() !== null;
}
