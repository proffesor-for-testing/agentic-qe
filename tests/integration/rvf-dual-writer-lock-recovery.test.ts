import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { RvfDualWriter } from '../../src/integrations/ruvector/rvf-dual-writer.js';
import { createRvfStore, isRvfNativeAvailable } from '../../src/integrations/ruvector/rvf-native-adapter.js';
import { verifyOrCreateEmbeddingSpaceManifest } from '../../src/learning/embedding-space.js';
import { quarantineUnusableStore } from '../../src/integrations/ruvector/rvf-store-integrity.js';

const dirs: string[] = [];
const describeNative = isRvfNativeAvailable() ? describe : describe.skip;

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function testPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aqe-rvf-dual-lock-'));
  dirs.push(dir);
  return join(dir, 'brain.rvf');
}

function writeDeadOwnerLock(path: string, lock: Buffer): void {
  const stale = Buffer.from(lock);
  stale.writeUInt32LE(0x7fffffff, 4);
  writeFileSync(`${path}.lock`, stale);
}

describeNative('RvfDualWriter stale-lock recovery', () => {
  it.each(['RVF error 0x0300: LockHeld', 'EACCES: permission denied'])(
    'refuses quarantine after a non-structural open failure: %s', (openError) => {
      const path = testPath();
      const store = createRvfStore(path, 384);
      store.ingest([{ id: 'retained', vector: new Array(384).fill(0.1) }]);
      store.close();
      const originalBytes = readFileSync(path);

      expect(quarantineUnusableStore(path, 'create failed', new Error(openError))).toBeNull();
      expect(readFileSync(path).equals(originalBytes)).toBe(true);
      expect(readdirSync(dirname(path)).filter(name => name.includes('.corrupt-'))).toEqual([]);
    },
  );

  it('reopens a populated healthy store after its prior owner dies without quarantining it', async () => {
    const path = testPath();
    const store = createRvfStore(path, 384);
    const lock = readFileSync(`${path}.lock`);
    verifyOrCreateEmbeddingSpaceManifest(path, 'lock-recovery-test-space', 0);
    store.ingest([{ id: 'retained', vector: new Array(384).fill(0.1) }]);
    store.close();
    const originalBytes = readFileSync(path);
    writeDeadOwnerLock(path, lock);

    const db = new Database(':memory:');
    const writer = new RvfDualWriter(db, {
      rvfPath: path, mode: 'dual-write', embeddingSpaceId: 'lock-recovery-test-space',
    });
    try {
      await writer.initialize();
      expect(writer.status().rvf?.totalVectors).toBe(1);
      expect(readFileSync(path).equals(originalBytes)).toBe(true);
      expect(readdirSync(dirname(path)).filter(name => name.includes('.corrupt-'))).toEqual([]);
    } finally {
      writer.close();
      db.close();
    }
  });

  it('does not disturb a store still locked by a live owner', async () => {
    const path = testPath();
    const owner = createRvfStore(path, 384);
    const originalBytes = readFileSync(path);
    const db = new Database(':memory:');
    const writer = new RvfDualWriter(db, {
      rvfPath: path, mode: 'dual-write', embeddingSpaceId: 'lock-recovery-test-space',
    });
    try {
      await writer.initialize();
      expect(writer.status().rvf).toBeNull();
      expect(readFileSync(path).equals(originalBytes)).toBe(true);
      expect(readdirSync(dirname(path)).filter(name => name.includes('.corrupt-'))).toEqual([]);
    } finally {
      writer.close();
      owner.close();
      db.close();
    }
  });

  it('still quarantines structurally corrupt bytes behind a dead-owner lock', async () => {
    const path = testPath();
    const store = createRvfStore(path, 384);
    const lock = readFileSync(`${path}.lock`);
    store.close();
    const corrupt = Buffer.from('not an RVF store');
    writeFileSync(path, corrupt);
    writeDeadOwnerLock(path, lock);

    const db = new Database(':memory:');
    const writer = new RvfDualWriter(db, {
      rvfPath: path, mode: 'dual-write', embeddingSpaceId: 'lock-recovery-test-space',
    });
    try {
      await writer.initialize();
      expect(writer.status().rvf?.totalVectors).toBe(0);
      const quarantines = readdirSync(dirname(path)).filter(name => name.includes('.corrupt-'));
      expect(quarantines).toHaveLength(1);
      expect(readFileSync(join(dirname(path), quarantines[0])).equals(corrupt)).toBe(true);
    } finally {
      writer.close();
      db.close();
    }
  });

  it('closes an opened RVF handle when manifest verification rejects it', async () => {
    const path = testPath();
    const store = createRvfStore(path, 384);
    verifyOrCreateEmbeddingSpaceManifest(path, 'original-space', 0);
    store.close();

    const db = new Database(':memory:');
    const writer = new RvfDualWriter(db, {
      rvfPath: path, mode: 'dual-write', embeddingSpaceId: 'different-space',
    });
    try {
      await writer.initialize();
      expect(writer.status().rvf).toBeNull();
      expect(readdirSync(dirname(path))).not.toContain('brain.rvf.lock');
      expect(readdirSync(dirname(path)).filter(name => name.includes('.corrupt-'))).toEqual([]);
    } finally {
      writer.close();
      db.close();
    }
  });
});
