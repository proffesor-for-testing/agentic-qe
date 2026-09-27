import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportBrain, importBrain } from '../../src/integrations/ruvector/brain-exporter.js';
import { exportBrainToRvf, importBrainFromRvf } from '../../src/integrations/ruvector/brain-rvf-exporter.js';
import { ensureTargetTables, mergeGenericRow } from '../../src/integrations/ruvector/brain-shared.js';

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

for (const format of ['jsonl', 'rvf'] as const) {
  describe(`${format} independently seeded pattern imports`, () => {
    for (const strategy of ['skip-conflicts', 'latest-wins', 'highest-confidence'] as const) {
      it.each([[true, false], [true, true], [false, false], [false, true]])(`${strategy} preserves target identity and remaps children (unique: %s, target vector: %s)`, (unique, targetVector) => {
        const source = new Database(':memory:');
        const target = new Database(':memory:');
        const dir = mkdtempSync(join(tmpdir(), 'aqe-natural-key-'));
        directories.push(dir);
        try {
          for (const db of [source, target]) {
            ensureTargetTables(db);
            db.pragma('foreign_keys = ON');
            if (unique) db.exec('CREATE UNIQUE INDEX pattern_natural_key ON qe_patterns(name, qe_domain, pattern_type)');
          }
          const seed = (db: Database.Database, id: string, name: string, confidence: number, date: string) => db.prepare(
            `INSERT INTO qe_patterns(id, name, pattern_type, qe_domain, domain, confidence, updated_at)
             VALUES (?, ?, 'test-template', 'test-generation', 'test-generation', ?, ?)`
          ).run(id, name, confidence, date);
          seed(source, 'incoming', 'AAA Unit Test', 0.9, '2026-09-01');
          seed(source, 'new', 'Only in source', 0.7, '2026-09-01');
          seed(target, 'retained', 'AAA Unit Test', 0.4, '2025-01-01');
          target.prepare('UPDATE qe_patterns SET description = ?').run('Retained content');
          source.prepare('UPDATE qe_patterns SET description = ?').run('Incoming content');
          if (targetVector) target.prepare('INSERT INTO qe_pattern_embeddings(pattern_id, embedding, dimension) VALUES (?, ?, ?)')
            .run('retained', Buffer.from(new Float32Array([1, 0]).buffer), 2);
          source.prepare('INSERT INTO qe_pattern_embeddings(pattern_id, embedding, dimension) VALUES (?, ?, ?)')
            .run('incoming', Buffer.from(new Float32Array([0.5, 0.5]).buffer), 2);
          source.prepare('INSERT INTO qe_pattern_usage(pattern_id, success, created_at) VALUES (?, 1, ?)').run('incoming', '2026-09-02');
          target.prepare('INSERT INTO qe_pattern_usage(pattern_id, success, created_at) VALUES (?, 1, ?)').run('retained', '2025-01-02');
          source.prepare(`INSERT INTO pattern_relationships(id, source_pattern_id, target_pattern_id, relationship_type)
            VALUES ('relation', 'incoming', 'new', 'similar')`).run();
          const outputPath = join(dir, format === 'rvf' ? 'brain.rvf' : 'export');
          if (format === 'jsonl') exportBrain(source, { outputPath, includeVectors: true });
          else exportBrainToRvf(source, { outputPath, dimension: 2 });
          const result = format === 'jsonl'
            ? importBrain(target, outputPath, { mergeStrategy: strategy })
            : importBrainFromRvf(target, outputPath, { mergeStrategy: strategy });
          expect(result.conflicts).toBeGreaterThanOrEqual(1);
          expect(target.prepare('SELECT id, confidence FROM qe_patterns WHERE name = ?').get('AAA Unit Test'))
            .toEqual({ id: 'retained', confidence: strategy === 'skip-conflicts' ? 0.4 : 0.9 });
          expect(target.prepare('SELECT COUNT(*) AS n FROM qe_patterns').get()).toEqual({ n: 2 });
          const embedding = target.prepare('SELECT pattern_id, embedding FROM qe_pattern_embeddings').get();
          expect(embedding).toEqual(strategy === 'skip-conflicts' && !targetVector ? undefined : {
            pattern_id: 'retained',
            embedding: Buffer.from(new Float32Array(strategy === 'skip-conflicts' ? [1, 0] : [0.5, 0.5]).buffer),
          });
          expect(target.prepare('SELECT pattern_id FROM qe_pattern_usage').all()).toEqual([{ pattern_id: 'retained' }, { pattern_id: 'retained' }]);
          expect(target.prepare('SELECT source_pattern_id, target_pattern_id FROM pattern_relationships').get())
            .toEqual({ source_pattern_id: 'retained', target_pattern_id: 'new' });
          expect(target.pragma('foreign_key_check')).toEqual([]);
          expect(target.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
        } finally { source.close(); target.close(); }
      });
    }
  });
  it.each([true, false])(`${format} keeps the ultimate winner vector for duplicate natural keys (best first: %s)`, bestFirst => {
    const source = new Database(':memory:');
    const target = new Database(':memory:');
    const dir = mkdtempSync(join(tmpdir(), 'aqe-natural-duplicates-')); directories.push(dir);
    try {
      for (const db of [source, target]) ensureTargetTables(db);
      const seed = (db: Database.Database, id: string, confidence: number) => db.prepare(
        `INSERT INTO qe_patterns(id,name,pattern_type,qe_domain,domain,description,confidence)
         VALUES (?, 'Duplicate', 'test-template', 'test-generation', 'test-generation', ?, ?)`
      ).run(id, id, confidence);
      for (const id of bestFirst ? ['best', 'other'] : ['other', 'best']) {
        seed(source, id, id === 'best' ? 0.9 : 0.8);
        source.prepare('INSERT INTO qe_pattern_embeddings(pattern_id,embedding,dimension) VALUES (?,?,2)')
          .run(id, Buffer.from(new Float32Array(id === 'best' ? [1,0] : [0,1]).buffer));
      }
      seed(target, 'retained', 0.4);
      const outputPath = join(dir, format === 'rvf' ? 'brain.rvf' : 'export');
      if (format === 'jsonl') exportBrain(source, { outputPath, includeVectors: true });
      else exportBrainToRvf(source, { outputPath, dimension: 2 });
      if (format === 'jsonl') importBrain(target, outputPath, { mergeStrategy: 'highest-confidence' });
      else importBrainFromRvf(target, outputPath, { mergeStrategy: 'highest-confidence' });
      expect(target.prepare('SELECT id,description,confidence FROM qe_patterns').all())
        .toEqual([{ id: 'retained', description: 'best', confidence: 0.9 }]);
      expect(target.prepare('SELECT pattern_id,embedding FROM qe_pattern_embeddings').all())
        .toEqual([{ pattern_id: 'retained', embedding: Buffer.from(new Float32Array([1,0]).buffer) }]);
    } finally { source.close(); target.close(); }
  });

}


it.each([false, true])('preserves metadata-only vectors and invalidates changed content (changed: %s)', changed => {
  const db = new Database(':memory:');
  try {
    ensureTargetTables(db);
    db.prepare(`INSERT INTO qe_patterns(id,name,pattern_type,qe_domain,domain,template_json,confidence)
      VALUES ('target','Same','test-template','test-generation','test-generation','{"body":"kept"}',0.4)`).run();
    db.prepare('INSERT INTO qe_pattern_embeddings(pattern_id,embedding,dimension) VALUES (?,?,2)')
      .run('target', Buffer.from(new Float32Array([1,0]).buffer));
    const incoming = { id: 'source', name: 'Same', pattern_type: 'test-template', qe_domain: 'test-generation', confidence: 0.9,
      ...(changed ? { template_json: '{"body":"changed"}' } : {}) };
    mergeGenericRow(db, 'qe_patterns', incoming, 'id', 'highest-confidence', undefined, 'confidence', new Map(), new Map());
    expect(db.prepare('SELECT COUNT(*) AS n FROM qe_pattern_embeddings').get()).toEqual({ n: changed ? 0 : 1 });
    expect(db.prepare('SELECT template_json FROM qe_patterns').get()).toEqual({ template_json: changed ? '{"body":"changed"}' : '{"body":"kept"}' });
  } finally { db.close(); }
});
