import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WitnessChain } from '../../src/audit/witness-chain.js';
import { exportBrain, importBrain } from '../../src/integrations/ruvector/brain-exporter.js';
import { ensureTargetTables } from '../../src/integrations/ruvector/brain-shared.js';

describe('brain import audit chain', () => {
  const databases: Database.Database[] = [];
  const directories: string[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) database.close();
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it('keeps the target chain valid and records the source checksum instead of grafting source history', async () => {
    const source = new Database(':memory:');
    const target = new Database(':memory:');
    databases.push(source, target);
    ensureTargetTables(source);
    ensureTargetTables(target);

    const sourceChain = new WitnessChain(source);
    const targetChain = new WitnessChain(target);
    await sourceChain.initialize();
    await targetChain.initialize();
    sourceChain.append('PATTERN_CREATE', { patternId: 'from-source' }, 'source');
    targetChain.append('PATTERN_CREATE', { patternId: 'already-here' }, 'target');
    expect(sourceChain.verify().valid).toBe(true);
    expect(targetChain.verify().valid).toBe(true);

    const directory = mkdtempSync(join(tmpdir(), 'aqe-brain-audit-'));
    directories.push(directory);
    const manifest = exportBrain(source, { outputPath: directory });
    const first = importBrain(target, directory, { mergeStrategy: 'skip-conflicts' });

    expect(targetChain.verify().valid).toBe(true);
    expect(first.skipped).toBeGreaterThanOrEqual(1);
    const rows = target.prepare('SELECT action_type, action_data, actor FROM witness_chain ORDER BY id').all() as Array<{
      action_type: string; action_data: string; actor: string;
    }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].actor).toBe('target');
    expect(rows[1].action_type).toBe('BRAIN_IMPORT');
    expect(JSON.parse(rows[1].action_data)).toMatchObject({
      sourceChecksum: manifest.checksum,
      sourceWitnessRows: 1,
      importedRecords: 0,
      skippedRecords: 1,
      conflicts: 0,
    });

    importBrain(target, directory, { mergeStrategy: 'skip-conflicts' });
    expect(targetChain.verify().valid).toBe(true);
    expect(target.prepare('SELECT COUNT(*) AS count FROM witness_chain').get()).toMatchObject({ count: 3 });
  });

  it('rolls back the import event during a dry run', async () => {
    const source = new Database(':memory:');
    const target = new Database(':memory:');
    databases.push(source, target);
    ensureTargetTables(source);
    ensureTargetTables(target);
    const directory = mkdtempSync(join(tmpdir(), 'aqe-brain-audit-'));
    directories.push(directory);
    exportBrain(source, { outputPath: directory });

    importBrain(target, directory, { mergeStrategy: 'skip-conflicts', dryRun: true });
    expect(target.prepare('SELECT COUNT(*) AS count FROM witness_chain').get()).toMatchObject({ count: 0 });
  });
});
