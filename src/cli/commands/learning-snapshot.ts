/** Consistent, verified SQLite images for the learning backup/restore commands. */
import { existsSync, realpathSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../../shared/safe-db.js';
import { compressFile, decompressFile } from './learning-helpers.js';

interface SnapshotInfo {
  schemaVersion: number;
  pages: number;
  verification: { valid: true; message: string };
}

function inspectSnapshot(file: string): SnapshotInfo {
  const db = openDatabase(file, { readonly: true, fileMustExist: true });
  try {
    const checks = db.pragma('integrity_check') as { integrity_check: string }[];
    if (checks.length !== 1 || checks[0].integrity_check !== 'ok') {
      throw new Error('Database integrity verification failed');
    }
    const hasVersion = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_version'").get();
    const version = hasVersion
      ? db.prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number } | undefined
      : undefined;
    return {
      schemaVersion: version?.version ?? 0,
      pages: db.pragma('page_count', { simple: true }) as number,
      verification: { valid: true, message: 'Database integrity verified' },
    };
  } finally {
    db.close();
  }
}

function canonicalPath(file: string): string {
  return existsSync(file) ? realpathSync(file) : join(realpathSync(dirname(file)), basename(file));
}

function sameFile(left: string, right: string): boolean {
  if (canonicalPath(left) === canonicalPath(right)) return true;
  if (!existsSync(left) || !existsSync(right)) return false;
  const a = statSync(left);
  const b = statSync(right);
  return a.dev === b.dev && a.ino === b.ino;
}

function assertDistinct(source: string, destination: string): void {
  const sourcePath = canonicalPath(source);
  const destinationPath = canonicalPath(destination);
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    if (sameFile(`${sourcePath}${suffix}`, destination)
      || sameFile(source, `${destinationPath}${suffix}`)) {
      throw new Error('Backup source and destination must not alias the same database or its sidecars');
    }
  }
}

function assertRegularFile(file: string): void {
  if (!statSync(file).isFile()) throw new Error('Backup input must be a regular file');
}

/** Awaiting backup alone is insufficient: a busy destination can report 0/0. */
async function copySqliteSnapshot(
  source: string,
  destination: string,
  options: { expectedPages?: number; standalone?: boolean } = {},
): Promise<SnapshotInfo> {
  const db = openDatabase(source, { readonly: true, fileMustExist: true });
  try {
    const result = await db.backup(destination);
    if (result.totalPages <= 0 || result.remainingPages !== 0
      || (options.expectedPages !== undefined && result.totalPages !== options.expectedPages)) {
      throw new Error('SQLite snapshot did not complete; the source may be empty or the destination busy');
    }
    if (options.standalone) {
      // Only private new images are normalized. A WAL header otherwise makes
      // SQLite try to create sidecars when reading an archive on readonly media.
      const image = openDatabase(destination, { fileMustExist: true, walMode: false });
      try {
        if (image.pragma('journal_mode = DELETE', { simple: true }) !== 'delete') {
          throw new Error('Could not create a standalone SQLite image');
        }
      } finally {
        image.close();
      }
    }
    const inspected = inspectSnapshot(destination);
    if (inspected.pages !== result.totalPages) {
      throw new Error('SQLite snapshot page count does not match the completed backup');
    }
    return inspected;
  } finally {
    db.close();
  }
}

export interface LearningBackupResult {
  backupPath: string;
  sourceSizeKB: number;
  backupSizeKB: number;
  compressed: boolean;
  schemaVersion: number;
  verification: SnapshotInfo['verification'];
}

/** Publish only a complete standalone image; the existing artifact survives staging failures. */
export async function backupLearningDatabase(
  source: string,
  output: string,
  options: { compress?: boolean; verify?: boolean } = {},
): Promise<LearningBackupResult> {
  assertRegularFile(source);
  const finalPath = resolve(options.compress ? `${output}.gz` : output);
  await mkdir(dirname(finalPath), { recursive: true });
  assertDistinct(source, resolve(output));
  assertDistinct(source, finalPath);
  const staging = await mkdtemp(join(dirname(finalPath), '.aqe-backup-'));
  try {
    const image = join(staging, 'snapshot.db');
    const info = await copySqliteSnapshot(source, image, { standalone: true });
    const published = options.compress ? await compressFile(image) : image;
    if (options.compress && options.verify) {
      const checkedImage = join(staging, 'verified.db');
      await decompressFile(published, checkedImage);
      inspectSnapshot(checkedImage);
    }
    const sourceSizeKB = Number(((await stat(source)).size / 1024).toFixed(2));
    const backupSizeKB = Number(((await stat(published)).size / 1024).toFixed(2));
    // An existing DB+WAL pair may be live. Never replace its main file while
    // leaving old sidecars that could be replayed against the new image.
    if (['-wal', '-shm', '-journal'].some(suffix => existsSync(`${finalPath}${suffix}`))) {
      throw new Error('Backup destination has SQLite sidecars; choose an unused output path');
    }
    await rename(published, finalPath);
    return { backupPath: finalPath, sourceSizeKB, backupSizeKB, compressed: !!options.compress,
      schemaVersion: info.schemaVersion, verification: info.verification };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export interface LearningRestoreResult {
  sizeKB: number;
  schemaVersion: number;
  wasCompressed: boolean;
  safetyBackupPath?: string;
}

/**
 * Validate before replacing anything and retain a verified pre-restore image.
 * SQLite mediates the destination write: never unlink its DB/WAL/SHM files.
 * Stop project writers before restore; this does not coordinate later writes
 * from other processes or refresh their in-memory learning caches.
 */
export async function restoreLearningDatabase(
  input: string,
  destination: string,
  options: { force?: boolean } = {},
): Promise<LearningRestoreResult> {
  assertRegularFile(input);
  await mkdir(dirname(destination), { recursive: true });
  assertDistinct(input, destination);
  if (existsSync(destination) && !options.force) {
    throw new Error(`Database already exists at: ${destination}. Use --force to overwrite`);
  }
  const staging = await mkdtemp(join(dirname(destination), '.aqe-restore-'));
  let safetyBackupPath: string | undefined;
  try {
    const wasCompressed = input.endsWith('.gz');
    const image = join(staging, 'snapshot.db');
    let source = input;
    if (wasCompressed) {
      source = join(staging, 'decompressed.db');
      await decompressFile(input, source);
    }
    // A legacy uncompressed backup may still need its companion WAL.
    const info = await copySqliteSnapshot(source, image, { standalone: true });
    const sizeKB = Number(((await stat(image)).size / 1024).toFixed(2));
    if (existsSync(destination)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const candidate = `${destination}.pre-restore-${timestamp}-${randomUUID()}.db`;
      try {
        await copySqliteSnapshot(destination, candidate, { standalone: true });
        safetyBackupPath = candidate;
      } catch (error) {
        await rm(candidate, { force: true });
        throw new Error('Cannot create a verified safety backup of the existing database; restore refused. Stop project processes and preserve the database and its sidecars before restoring into an absent destination.', { cause: error });
      }
    }
    await copySqliteSnapshot(image, destination, { expectedPages: info.pages });
    return { sizeKB, schemaVersion: info.schemaVersion, wasCompressed, safetyBackupPath };
  } catch (error) {
    if (safetyBackupPath) {
      const detail = error instanceof Error ? error.message : 'SQLite snapshot failed';
      throw new Error(`Restore failed: ${detail}; previous database snapshot preserved at ${safetyBackupPath}`, { cause: error });
    }
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
