/**
 * #1239: bounded growth of the learning tables. Real SQLite, real brain DDL.
 *
 * The defaults may only remove rows with no learning value. Anything that
 * drops experience content is opt-in, and a dry run writes nothing.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { createHash, randomUUID } from 'crypto';

import { ensureAllBrainTables } from '../../../src/integrations/ruvector/brain-table-ddl.js';
import {
  applyDefaultRetention,
  capOutcomeConcepts,
  compactConsolidatedExperiences,
  pruneFailedDreamCycles,
  pruneRoutingOutcomes,
  resolveDefaultRetention,
} from '../../../src/learning/learning-retention.js';

let db: DatabaseType;

beforeEach(() => {
  db = new Database(':memory:');
  ensureAllBrainTables(db);
  db.pragma('foreign_keys = OFF'); // the cascade must not be what removes the edges
});
afterEach(() => db.close());

const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();
/** SQLite's own datetime('now') format, as default-valued columns hold it. */
const sqlite = (daysAgo: number) => iso(daysAgo).replace('T', ' ').slice(0, 19);
const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
const snapshot = () => createHash('sha256').update(JSON.stringify(
  ['dream_cycles', 'dream_insights', 'concept_nodes', 'concept_edges', 'captured_experiences', 'routing_outcomes']
    .map(t => db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()),
)).digest('hex');

function cycle(id: string, status: string, daysAgo: number): void {
  db.prepare(`INSERT INTO dream_cycles (id, start_time, end_time, status) VALUES (?, ?, ?, ?)`)
    .run(id, iso(daysAgo), iso(daysAgo), status);
}

function insight(cycleId: string): void {
  db.prepare(`INSERT INTO dream_insights (id, cycle_id, insight_type, source_concepts, description)
    VALUES (?, ?, 'association', '[]', 'insight')`).run(randomUUID(), cycleId);
}

function node(id: string, type: string, minutesAgo: number): void {
  db.prepare(`INSERT INTO concept_nodes (id, concept_type, content, created_at) VALUES (?, ?, 'c', ?)`)
    .run(id, type, new Date(Date.now() - minutesAgo * 60_000).toISOString().replace('T', ' ').slice(0, 19));
}

function edge(source: string, target: string, type = 'co_occurrence'): void {
  db.prepare(`INSERT INTO concept_edges (id, source, target, weight, edge_type) VALUES (?, ?, ?, 0.5, ?)`)
    .run(randomUUID(), source, target, type);
}

function experience(id: string, consolidatedInto: string | null): void {
  db.prepare(`INSERT INTO captured_experiences (id, task, agent, result_json, embedding, embedding_dimension, consolidated_into, application_count)
    VALUES (?, 'task', 'agent', ?, ?, 4, ?, 3)`)
    .run(id, '{"out":"0123456789"}', Buffer.alloc(16, 1), consolidatedInto);
}

describe('pruneFailedDreamCycles', () => {
  beforeEach(() => {
    cycle('old-failed', 'failed', 30);
    cycle('old-interrupted', 'interrupted', 30);
    cycle('recent-failed', 'failed', 2);
    cycle('old-completed', 'completed', 30);
    cycle('old-failed-with-insight', 'failed', 30);
    insight('old-failed-with-insight');
    // Written by SQLite's default, not by the engine: 8 days old.
    db.prepare(`INSERT INTO dream_cycles (id, start_time, status, created_at) VALUES ('sqlite-format', ?, 'failed', ?)`)
      .run(sqlite(8), sqlite(8));
  });

  it('should_removeOnlyOldFailedCyclesWithoutInsights_andReportMeasuredCounts', () => {
    const result = pruneFailedDreamCycles(db, { retentionDays: 7 });

    const left = (db.prepare('SELECT id FROM dream_cycles ORDER BY id').all() as Array<{ id: string }>).map(r => r.id);
    expect(left).toEqual(['old-completed', 'old-failed-with-insight', 'recent-failed']);
    expect(result.affected).toBe(3);
    expect(result.tables).toEqual([
      { table: 'dream_cycles', before: 6, after: n('SELECT COUNT(*) AS n FROM dream_cycles') },
      { table: 'dream_insights', before: 1, after: 1 },
    ]);
  });

  it('should_writeNothing_andProjectTheCounts_when_dryRun', () => {
    const before = snapshot();

    const result = pruneFailedDreamCycles(db, { retentionDays: 7, dryRun: true });

    expect(snapshot()).toBe(before);
    expect(result).toMatchObject({ dryRun: true, affected: 3 });
    expect(result.tables[0]).toEqual({ table: 'dream_cycles', before: 6, after: 3 });
  });
});

describe('capOutcomeConcepts', () => {
  beforeEach(() => {
    node('pattern-a', 'pattern', 1000);
    node('pattern-b', 'pattern', 1000);
    edge('pattern-a', 'pattern-b', 'similarity');
    for (let i = 0; i < 150; i++) {
      node(`outcome-${String(i).padStart(3, '0')}`, 'outcome', 150 - i); // outcome-149 is the newest
      edge(`outcome-${String(i).padStart(3, '0')}`, 'pattern-a');
      edge('pattern-b', `outcome-${String(i).padStart(3, '0')}`);
    }
  });

  it('should_keepTheNewestOutcomes_andRemoveTheirEdgesOnly', () => {
    const result = capOutcomeConcepts(db, { maxNodes: 100 });

    expect(n(`SELECT COUNT(*) AS n FROM concept_nodes WHERE concept_type = 'outcome'`)).toBe(100);
    expect(n(`SELECT COUNT(*) AS n FROM concept_nodes WHERE id = 'outcome-049'`)).toBe(0);
    expect(n(`SELECT COUNT(*) AS n FROM concept_nodes WHERE id = 'outcome-050'`)).toBe(1);
    expect(n(`SELECT COUNT(*) AS n FROM concept_nodes WHERE concept_type = 'pattern'`)).toBe(2);
    expect(n(`SELECT COUNT(*) AS n FROM concept_edges WHERE edge_type = 'similarity'`)).toBe(1);
    expect(n(`SELECT COUNT(*) AS n FROM concept_edges e WHERE NOT EXISTS (SELECT 1 FROM concept_nodes x WHERE x.id = e.source)
      OR NOT EXISTS (SELECT 1 FROM concept_nodes x WHERE x.id = e.target)`)).toBe(0);
    expect(result.affected).toBe(50);
    expect(result.tables).toEqual([
      { table: 'concept_nodes', before: 152, after: 102 },
      { table: 'concept_edges', before: 301, after: 201 },
    ]);
  });

  it('should_projectNodesAndEdges_andWriteNothing_when_dryRun', () => {
    const before = snapshot();

    const result = capOutcomeConcepts(db, { maxNodes: 100, dryRun: true });

    expect(snapshot()).toBe(before);
    expect(result.tables).toEqual([
      { table: 'concept_nodes', before: 152, after: 102 },
      { table: 'concept_edges', before: 301, after: 201 },
    ]);
  });

  it('should_refuseACapBelowWhatTheNextDreamReloads', () => {
    expect(() => capOutcomeConcepts(db, { maxNodes: 99 })).toThrow(/maxNodes must be a whole number >= 100/);
  });
});

describe('compactConsolidatedExperiences', () => {
  beforeEach(() => {
    experience('active', null);
    experience('archived', 'archived');
    experience('merged', 'active');
    experience('contradicted', 'contradicted');
  });

  it('should_clearPayloadOfArchivedAndMergedRows_andKeepEveryRowAndCounter', () => {
    const result = compactConsolidatedExperiences(db);

    const rows = db.prepare(`SELECT id, result_json, embedding, application_count FROM captured_experiences ORDER BY id`)
      .all() as Array<{ id: string; result_json: string | null; embedding: Buffer | null; application_count: number }>;
    expect(rows.map(r => [r.id, r.result_json !== null, r.embedding !== null, r.application_count])).toEqual([
      ['active', true, true, 3],
      ['archived', false, false, 3],
      ['contradicted', true, true, 3],
      ['merged', false, false, 3],
    ]);
    expect(result).toMatchObject({ affected: 2, payloadBytes: 2 * (20 + 16) });
    expect(result.tables).toEqual([{ table: 'captured_experiences', before: 4, after: 4 }]);
  });

  it('should_writeNothing_when_dryRun', () => {
    const before = snapshot();

    expect(compactConsolidatedExperiences(db, { dryRun: true }).affected).toBe(2);
    expect(snapshot()).toBe(before);
  });
});

describe('pruneRoutingOutcomes', () => {
  it('should_removeOnlyOutcomesOlderThanTheWindow', () => {
    const insert = db.prepare(`INSERT INTO routing_outcomes (id, task_json, decision_json, used_agent, followed_recommendation,
      success, quality_score, duration_ms, created_at) VALUES (?, '{}', '{}', 'a', 1, 1, 0.5, 1, ?)`);
    insert.run('old', sqlite(40));
    insert.run('old-iso', iso(40));
    insert.run('recent', sqlite(3));

    const result = pruneRoutingOutcomes(db, { olderThanDays: 14 });

    expect((db.prepare('SELECT id FROM routing_outcomes').all() as Array<{ id: string }>).map(r => r.id)).toEqual(['recent']);
    expect(result.tables).toEqual([{ table: 'routing_outcomes', before: 3, after: 1 }]);
  });
});

describe('default retention', () => {
  it('should_neverTouchExperiencesOrRoutingOutcomes', () => {
    experience('archived', 'archived');
    db.prepare(`INSERT INTO routing_outcomes (id, task_json, decision_json, used_agent, followed_recommendation,
      success, quality_score, duration_ms, created_at) VALUES ('old', '{}', '{}', 'a', 1, 1, 0.5, 1, ?)`).run(sqlite(400));
    cycle('old-failed', 'failed', 30);

    const steps = applyDefaultRetention(db, resolveDefaultRetention({}));

    expect(steps.map(s => s.step)).toEqual(['failed-dream-cycles', 'outcome-concepts']);
    expect(n(`SELECT COUNT(*) AS n FROM captured_experiences WHERE result_json IS NOT NULL`)).toBe(1);
    expect(n(`SELECT COUNT(*) AS n FROM routing_outcomes`)).toBe(1);
    expect(n(`SELECT COUNT(*) AS n FROM dream_cycles`)).toBe(0);
  });

  it('should_useDefaults_acceptOff_andTurnAStepOffOnAnUnreadableValue', () => {
    expect(resolveDefaultRetention({})).toEqual({
      failedDreamCycleRetentionDays: 7, outcomeConceptCap: 2000, warnings: [],
    });
    expect(resolveDefaultRetention({ AQE_FAILED_DREAM_CYCLE_RETENTION_DAYS: 'off', AQE_OUTCOME_CONCEPT_CAP: '500' }))
      .toEqual({ failedDreamCycleRetentionDays: null, outcomeConceptCap: 500, warnings: [] });
    const invalid = resolveDefaultRetention({ AQE_OUTCOME_CONCEPT_CAP: '50' });
    expect(invalid.outcomeConceptCap).toBeNull();
    expect(invalid.warnings[0]).toMatch(/Invalid AQE_OUTCOME_CONCEPT_CAP="50"/);
  });
});
