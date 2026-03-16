/**
 * Cognitive Container Binary Codec (Task 4.1)
 *
 * Binary pack/unpack helpers for the cognitive container format.
 * Separated from cognitive-container.ts to keep each file under 500 lines.
 *
 * Binary layout:
 *   [MAGIC 8B][VERSION 4B][MANIFEST_LEN 4B][MANIFEST JSON][SEGMENT DATA...]
 *
 * @module integrations/ruvector/cognitive-container-codec
 */

import { createHash } from 'crypto';
import { Buffer } from 'buffer';
import { gunzipSync, gzipSync } from 'zlib';
import Database from 'better-sqlite3';
import {
  queryAll,
  domainFilterForColumn,
  serializeRowBlobs,
  TABLE_CONFIGS,
  TABLE_BLOB_COLUMNS,
} from './brain-shared.js';
import type { ContainerManifest, ContainerSegment } from './cognitive-container.js';

// ============================================================================
// Constants
// ============================================================================

/** 8-byte magic header: "COGCNTNR" */
export const MAGIC = Buffer.from('COGCNTNR', 'ascii');

/** Current container format version */
export const FORMAT_VERSION = 2;

/** Segment names in canonical order */
export const SEGMENT_NAMES = [
  'patterns',
  'embeddings',
  'q-values',
  'lora-weights',
  'graph',
  'witness-chain',
] as const;

export type SegmentName = (typeof SEGMENT_NAMES)[number];

// ============================================================================
// Helpers
// ============================================================================

/** SHA-256 hash of a Buffer, returned as hex. */
export function sha256buf(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Table name to segment name mapping. */
const TABLE_TO_SEGMENT: Record<string, SegmentName> = {
  qe_patterns: 'patterns',
  qe_pattern_embeddings: 'embeddings',
  captured_experiences: 'embeddings',
  sona_patterns: 'embeddings',
  rl_q_values: 'q-values',
  dream_cycles: 'lora-weights',
  dream_insights: 'lora-weights',
  concept_nodes: 'graph',
  concept_edges: 'graph',
  witness_chain: 'witness-chain',
};

/** Assign a segment name for a given table. Defaults to 'patterns'. */
function segmentForTable(tableName: string): SegmentName {
  return TABLE_TO_SEGMENT[tableName] ?? 'patterns';
}

// ============================================================================
// Data Collection
// ============================================================================

/**
 * Collect all table data from the database, grouped by segment.
 */
export function collectSegmentData(
  db: Database.Database,
  domains?: readonly string[],
): Record<SegmentName, Record<string, unknown[]>> {
  const segments: Record<SegmentName, Record<string, unknown[]>> = {
    'patterns': {},
    'embeddings': {},
    'q-values': {},
    'lora-weights': {},
    'graph': {},
    'witness-chain': {},
  };

  for (const config of TABLE_CONFIGS) {
    const [where, params] = config.domainColumn
      ? domainFilterForColumn(domains, config.domainColumn)
      : [undefined, [] as string[]];

    let rows = queryAll(db, config.tableName, where, params);

    const blobCols = TABLE_BLOB_COLUMNS[config.tableName];
    if (blobCols && blobCols.length > 0) {
      rows = rows.map(r => serializeRowBlobs(r as Record<string, unknown>, blobCols));
    }

    const seg = segmentForTable(config.tableName);
    segments[seg][config.tableName] = rows;
  }

  return segments;
}

// ============================================================================
// Segment Serialization
// ============================================================================

/**
 * Serialize a segment's data map to a Buffer, optionally compressed.
 */
export function serializeSegment(data: Record<string, unknown[]>, compress: boolean): Buffer {
  const json = JSON.stringify(data);
  const raw = Buffer.from(json, 'utf-8');
  if (compress) {
    return gzipSync(raw);
  }
  return raw;
}

/**
 * Deserialize a segment Buffer back to its data map.
 */
export function deserializeSegment(buf: Buffer, compressed: boolean): Record<string, unknown[]> {
  const raw = compressed ? gunzipSync(buf) : buf;
  return JSON.parse(raw.toString('utf-8'));
}

// ============================================================================
// Binary Packing
// ============================================================================

/**
 * Write the container binary from a manifest and segment buffers.
 */
export function packContainer(manifest: ContainerManifest, segmentBuffers: Buffer[]): Buffer {
  const manifestJson = JSON.stringify(manifest);
  const manifestBuf = Buffer.from(manifestJson, 'utf-8');

  const headerLen = MAGIC.length + 4 + 4; // MAGIC(8) + VERSION(4) + MANIFEST_LEN(4)
  const totalDataLen = segmentBuffers.reduce((sum, b) => sum + b.length, 0);
  const totalLen = headerLen + manifestBuf.length + totalDataLen;

  const out = Buffer.alloc(totalLen);
  let pos = 0;

  MAGIC.copy(out, pos);
  pos += MAGIC.length;

  out.writeUInt32BE(FORMAT_VERSION, pos);
  pos += 4;

  out.writeUInt32BE(manifestBuf.length, pos);
  pos += 4;

  manifestBuf.copy(out, pos);
  pos += manifestBuf.length;

  for (const buf of segmentBuffers) {
    buf.copy(out, pos);
    pos += buf.length;
  }

  return out;
}

/**
 * Parse the header from container data and return manifest + data offset.
 */
export function unpackHeader(data: Buffer): { manifest: ContainerManifest; dataOffset: number } {
  if (data.length < 16) {
    throw new Error('Container too small: missing header');
  }

  const magic = data.subarray(0, MAGIC.length);
  if (!magic.equals(MAGIC)) {
    throw new Error('Invalid container: bad magic bytes');
  }

  const version = data.readUInt32BE(MAGIC.length);
  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported container version: ${version}`);
  }

  const manifestLen = data.readUInt32BE(MAGIC.length + 4);
  const manifestStart = MAGIC.length + 8;
  const manifestEnd = manifestStart + manifestLen;

  if (data.length < manifestEnd) {
    throw new Error('Container truncated: manifest extends beyond data');
  }

  const manifestJson = data.subarray(manifestStart, manifestEnd).toString('utf-8');
  let manifest: ContainerManifest;
  try {
    manifest = JSON.parse(manifestJson);
  } catch {
    throw new Error('Container corrupt: manifest JSON parse failed');
  }

  return { manifest, dataOffset: manifestEnd };
}

/**
 * Extract segment buffers from container data using manifest offsets.
 */
export function extractSegments(
  data: Buffer,
  dataOffset: number,
  segments: ContainerSegment[],
): Map<string, Buffer> {
  const result = new Map<string, Buffer>();
  for (const seg of segments) {
    const start = dataOffset + seg.offset;
    const end = start + seg.length;
    if (end > data.length) {
      throw new Error(`Segment '${seg.name}' extends beyond container data`);
    }
    result.set(seg.name, data.subarray(start, end));
  }
  return result;
}
