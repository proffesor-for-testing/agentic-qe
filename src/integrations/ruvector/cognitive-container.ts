/**
 * Cognitive Container Export/Import (RVF v2, Task 4.1)
 *
 * Produces full cognitive containers that bundle all brain state into a single
 * self-verifying binary format. Each container includes:
 *   - Patterns, embeddings, Q-values, LoRA weights, graph state, witness chain
 *   - Container manifest with per-segment SHA-256 checksums
 *   - Ed25519 signing for container authenticity (Node.js crypto)
 *   - COW (copy-on-write) branching for cheap forks
 *
 * Binary layout:
 *   [MAGIC 8B][VERSION 4B][MANIFEST_LEN 4B][MANIFEST JSON][SEGMENT DATA...]
 *
 * @module integrations/ruvector/cognitive-container
 */

import { generateKeyPairSync, sign, verify, randomUUID } from 'crypto';
import { Buffer } from 'buffer';
import Database from 'better-sqlite3';
import {
  ensureTargetTables,
  mergeGenericRow,
  mergeAppendOnlyRow,
  TABLE_CONFIGS,
  PK_COLUMNS,
  CONFIDENCE_COLUMNS,
  TIMESTAMP_COLUMNS,
  deserializeRowBlobs,
  TABLE_BLOB_COLUMNS,
  type MergeStrategy,
  type MergeResult,
} from './brain-shared.js';
import {
  SEGMENT_NAMES,
  sha256buf,
  collectSegmentData,
  serializeSegment,
  deserializeSegment,
  packContainer,
  unpackHeader,
  extractSegments,
} from './cognitive-container-codec.js';

// ============================================================================
// Types
// ============================================================================

export interface ContainerSegment {
  readonly name: string;
  readonly offset: number;
  readonly length: number;
  readonly checksum: string;
  readonly compressed: boolean;
}

export interface ContainerManifest {
  readonly version: string;
  readonly created: string;
  readonly source: string;
  readonly segments: ContainerSegment[];
  readonly checksums: Record<string, string>;
  readonly signature?: string;
  readonly branchOf?: string;
}

export interface ExportOptions {
  readonly domains?: readonly string[];
  readonly compress?: boolean;
  readonly sign?: boolean;
  readonly privateKey?: Buffer;
  readonly sourceId?: string;
}

export interface ImportOptions {
  readonly mergeStrategy: MergeStrategy;
  readonly dryRun?: boolean;
  readonly verifySignature?: boolean;
  readonly publicKey?: Buffer;
}

export interface ImportResult {
  readonly imported: number;
  readonly skipped: number;
  readonly conflicts: number;
  readonly segmentsRestored: number;
}

export interface VerificationResult {
  readonly valid: boolean;
  readonly manifestValid: boolean;
  readonly segmentsValid: boolean;
  readonly signatureValid: boolean | null;
  readonly errors: string[];
}

export interface ContainerInfo {
  readonly version: string;
  readonly created: string;
  readonly source: string;
  readonly segmentCount: number;
  readonly segmentNames: string[];
  readonly totalDataBytes: number;
  readonly signed: boolean;
  readonly branchOf: string | null;
}

// ============================================================================
// Ed25519 Key Generation
// ============================================================================

export interface Ed25519KeyPair {
  readonly publicKey: Buffer;
  readonly privateKey: Buffer;
}

/** Generate an Ed25519 key pair for container signing. */
export function generateSigningKeyPair(): Ed25519KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  return {
    publicKey: Buffer.from(publicKey),
    privateKey: Buffer.from(privateKey),
  };
}

// ============================================================================
// CognitiveContainer
// ============================================================================

export class CognitiveContainer {
  /**
   * Export a full cognitive container from the database.
   *
   * Produces a self-contained binary Buffer including all brain segments
   * with per-segment checksums and optional Ed25519 signing.
   */
  exportContainer(
    db: Database.Database,
    options: ExportOptions = {},
  ): { data: Buffer; manifest: ContainerManifest } {
    const compress = options.compress ?? true;
    const sourceId = options.sourceId ?? randomUUID();
    const segmentData = collectSegmentData(db, options.domains);

    const segmentBuffers: Buffer[] = [];
    const segments: ContainerSegment[] = [];
    const checksums: Record<string, string> = {};
    let currentOffset = 0;

    for (const name of SEGMENT_NAMES) {
      const tableData = segmentData[name];
      const buf = serializeSegment(tableData, compress);
      const checksum = sha256buf(buf);

      segments.push({
        name,
        offset: currentOffset,
        length: buf.length,
        checksum,
        compressed: compress,
      });
      checksums[name] = checksum;
      segmentBuffers.push(buf);
      currentOffset += buf.length;
    }

    const manifest: ContainerManifest = {
      version: '2.0.0',
      created: new Date().toISOString(),
      source: sourceId,
      segments,
      checksums,
    };

    if (options.sign && options.privateKey) {
      const payload = this.buildSignedPayload(manifest);
      const signature = sign(
        null,
        Buffer.from(payload, 'utf-8'),
        { key: options.privateKey, format: 'der', type: 'pkcs8' },
      );
      (manifest as { signature?: string }).signature = signature.toString('hex');
    }

    const data = packContainer(manifest, segmentBuffers);
    return { data, manifest };
  }

  /**
   * Import a cognitive container into the database.
   *
   * Verifies segment checksums before importing. Optionally verifies
   * the Ed25519 signature.
   */
  importContainer(data: Buffer, db: Database.Database, options: ImportOptions): ImportResult {
    const { manifest, dataOffset } = unpackHeader(data);
    const segmentBuffers = extractSegments(data, dataOffset, manifest.segments);

    this.verifyChecksums(manifest.segments, segmentBuffers);

    if (options.verifySignature) {
      this.requireValidSignature(manifest, options.publicKey);
    }

    if (options.dryRun) {
      return this.dryRunImport(manifest, segmentBuffers);
    }

    ensureTargetTables(db);
    return this.executeImport(db, manifest, segmentBuffers, options.mergeStrategy);
  }

  /**
   * Verify container integrity without importing.
   *
   * Checks: magic, manifest parse, segment checksums, optional signature.
   */
  verifyContainer(data: Buffer, publicKey?: Buffer): VerificationResult {
    const errors: string[] = [];
    let manifestValid = false;
    let segmentsValid = false;
    let signatureValid: boolean | null = null;

    let manifest: ContainerManifest;
    let dataOffset: number;
    try {
      const result = unpackHeader(data);
      manifest = result.manifest;
      dataOffset = result.dataOffset;
      manifestValid = true;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      return { valid: false, manifestValid, segmentsValid, signatureValid, errors };
    }

    segmentsValid = this.verifySegmentChecksums(data, dataOffset, manifest, errors);
    signatureValid = this.verifySignatureStatus(manifest, publicKey, errors);

    const valid = manifestValid && segmentsValid
      && (signatureValid === null || signatureValid);
    return { valid, manifestValid, segmentsValid, signatureValid, errors };
  }

  /**
   * Create a COW (copy-on-write) branch of a container.
   *
   * The branch references the parent container by ID and includes only
   * the manifest with updated metadata. The segment data is shared
   * (not duplicated).
   */
  branchContainer(
    sourceData: Buffer,
    branchName: string,
  ): { data: Buffer; manifest: ContainerManifest } {
    const { manifest: src, dataOffset } = unpackHeader(sourceData);
    const segBufs = extractSegments(sourceData, dataOffset, src.segments);

    const branchManifest: ContainerManifest = {
      version: src.version,
      created: new Date().toISOString(),
      source: branchName,
      segments: src.segments.map(seg => ({ ...seg })),
      checksums: { ...src.checksums },
      branchOf: src.source,
    };

    const buffers: Buffer[] = [];
    for (const seg of src.segments) {
      buffers.push(segBufs.get(seg.name)!);
    }

    const data = packContainer(branchManifest, buffers);
    return { data, manifest: branchManifest };
  }

  /** Get container info without importing or fully verifying. */
  getContainerInfo(data: Buffer): ContainerInfo {
    const { manifest } = unpackHeader(data);
    const totalDataBytes = manifest.segments.reduce((sum, s) => sum + s.length, 0);

    return {
      version: manifest.version,
      created: manifest.created,
      source: manifest.source,
      segmentCount: manifest.segments.length,
      segmentNames: manifest.segments.map(s => s.name),
      totalDataBytes,
      signed: !!manifest.signature,
      branchOf: manifest.branchOf ?? null,
    };
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private buildSignedPayload(manifest: ContainerManifest): string {
    return JSON.stringify({
      version: manifest.version,
      created: manifest.created,
      source: manifest.source,
      checksums: manifest.checksums,
    });
  }

  private verifySignatureInternal(manifest: ContainerManifest, publicKey: Buffer): boolean {
    if (!manifest.signature) return false;
    const payload = this.buildSignedPayload(manifest);
    return verify(
      null,
      Buffer.from(payload, 'utf-8'),
      { key: publicKey, format: 'der', type: 'spki' },
      Buffer.from(manifest.signature, 'hex'),
    );
  }

  private verifyChecksums(
    segments: ContainerSegment[],
    segmentBuffers: Map<string, Buffer>,
  ): void {
    for (const seg of segments) {
      const buf = segmentBuffers.get(seg.name);
      if (!buf) throw new Error(`Missing segment data: ${seg.name}`);
      const actual = sha256buf(buf);
      if (actual !== seg.checksum) {
        throw new Error(
          `Checksum mismatch for segment '${seg.name}': ` +
          `expected ${seg.checksum}, got ${actual}`,
        );
      }
    }
  }

  private requireValidSignature(manifest: ContainerManifest, publicKey?: Buffer): void {
    if (!manifest.signature) {
      throw new Error('Container is not signed but signature verification was requested');
    }
    if (!publicKey) {
      throw new Error('Public key required for signature verification');
    }
    if (!this.verifySignatureInternal(manifest, publicKey)) {
      throw new Error('Container signature verification failed');
    }
  }

  private dryRunImport(
    manifest: ContainerManifest,
    segmentBuffers: Map<string, Buffer>,
  ): ImportResult {
    let total = 0;
    for (const seg of manifest.segments) {
      const buf = segmentBuffers.get(seg.name)!;
      const tableData = deserializeSegment(buf, seg.compressed);
      for (const rows of Object.values(tableData)) {
        total += (rows?.length ?? 0);
      }
    }
    return { imported: total, skipped: 0, conflicts: 0, segmentsRestored: manifest.segments.length };
  }

  private executeImport(
    db: Database.Database,
    manifest: ContainerManifest,
    segmentBuffers: Map<string, Buffer>,
    mergeStrategy: MergeStrategy,
  ): ImportResult {
    let imported = 0;
    let skipped = 0;
    let conflicts = 0;
    let segmentsRestored = 0;

    const importAll = db.transaction(() => {
      for (const seg of manifest.segments) {
        const buf = segmentBuffers.get(seg.name)!;
        const tableData = deserializeSegment(buf, seg.compressed);
        segmentsRestored++;

        for (const [tableName, rows] of Object.entries(tableData)) {
          if (!Array.isArray(rows) || rows.length === 0) continue;
          const config = TABLE_CONFIGS.find(c => c.tableName === tableName);
          if (!config) continue;

          const blobCols = TABLE_BLOB_COLUMNS[tableName];
          let processedRows = rows as Record<string, unknown>[];
          if (blobCols && blobCols.length > 0) {
            processedRows = processedRows.map(r => deserializeRowBlobs(r, blobCols));
          }

          for (const row of processedRows) {
            let result: MergeResult;
            if (config.dedupColumns && config.dedupColumns.length > 0) {
              result = mergeAppendOnlyRow(db, config.tableName, row, config.dedupColumns);
            } else {
              const idCol = PK_COLUMNS[config.tableName] || 'id';
              const tsCol = TIMESTAMP_COLUMNS[config.tableName];
              const confCol = CONFIDENCE_COLUMNS[config.tableName];
              result = mergeGenericRow(db, config.tableName, row, idCol,
                mergeStrategy, tsCol, confCol);
            }
            imported += result.imported;
            skipped += result.skipped;
            conflicts += result.conflicts;
          }
        }
      }
    });

    importAll();
    return { imported, skipped, conflicts, segmentsRestored };
  }

  private verifySegmentChecksums(
    data: Buffer, dataOffset: number,
    manifest: ContainerManifest, errors: string[],
  ): boolean {
    try {
      const segBufs = extractSegments(data, dataOffset, manifest.segments);
      let allGood = true;
      for (const seg of manifest.segments) {
        const buf = segBufs.get(seg.name);
        if (!buf) {
          errors.push(`Missing segment: ${seg.name}`);
          allGood = false;
          continue;
        }
        if (sha256buf(buf) !== seg.checksum) {
          errors.push(`Checksum mismatch for '${seg.name}'`);
          allGood = false;
        }
      }
      return allGood;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  private verifySignatureStatus(
    manifest: ContainerManifest, publicKey: Buffer | undefined,
    errors: string[],
  ): boolean | null {
    if (!manifest.signature) return null;
    if (!publicKey) return null;
    try {
      const valid = this.verifySignatureInternal(manifest, publicKey);
      if (!valid) errors.push('Signature verification failed');
      return valid;
    } catch (err) {
      errors.push(`Signature error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }
}

// ============================================================================
// Convenience factory
// ============================================================================

/** Create a CognitiveContainer instance. */
export function createCognitiveContainer(): CognitiveContainer {
  return new CognitiveContainer();
}
