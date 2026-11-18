/**
 * #1436: one-off cleanup of duplicated rows in aqe.learning_experiences.
 *
 * Before migration 004 the table had no sync key, so every full sync inserted each
 * captured experience again. Those rows have `local_id IS NULL` ("legacy" rows).
 * After migration 004 and a full sync, every local experience also has a row with
 * its `local_id` ("keyed" rows), which later syncs match instead of adding a row.
 *
 * For one environment, a legacy row is a duplicate when
 *   - a keyed row has the same content: every uploaded column (agent_id, task_id,
 *     task_type, state, action, reward, next_state, episode_id, created_at) is equal;
 *   - or exactly one keyed row has the same identity (agent_id, task_id, task_type,
 *     created_at): the same experience, whose content changed locally after the
 *     legacy upload (consolidation updates quality, retention clears result_json).
 *     When two keyed rows share an identity, only a full-content match counts;
 *   - or, with no keyed match, an earlier legacy row has the same content.
 * So every keyed row is kept, and of legacy rows with no keyed match (an experience
 * since deleted locally) one copy per distinct content is kept. Rows are never
 * compared across environments.
 *
 * `applyExperienceDedupe` copies the rows it deletes into a backup table first, in
 * the same transaction as the delete, which holds a write lock on the table.
 */
import { validateIdentifier } from '../../shared/sql-safety.js';

export interface DedupeDb {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<void>;
}

export interface ExperienceDedupePlan {
  environment: string;
  /** Rows of this environment before the cleanup. */
  totalRows: number;
  /** Rows uploaded with a local_id (kept). */
  keyedRows: number;
  /** Local experiences the upload sends, when known: keyed rows should cover them. */
  localExperiences?: number;
  /** Rows uploaded before migration 004 (local_id NULL). */
  legacyRows: number;
  /** Legacy rows whose content matches a keyed row (deleted). */
  legacyWithKeyedTwin: number;
  /** Legacy rows of an experience whose content changed since (one keyed row, same identity; deleted). */
  legacyChanged: number;
  /** Legacy rows with no keyed match that repeat an earlier legacy row (deleted). */
  legacyRepeats: number;
  /** Legacy rows with no keyed match kept, one per distinct content. */
  legacyKept: number;
  /** Rows the cleanup deletes. */
  toDelete: number;
  /** Rows left for this environment afterwards. */
  rowsAfter: number;
  /** Why the cleanup must not run yet, if it must not. */
  blocked?: string;
}

export interface ExperienceDedupeResult extends ExperienceDedupePlan {
  deleted: number;
  backupTable: string | null;
  /** Rows of this environment counted after the delete. */
  verifiedRowsAfter: number;
}

const TABLE = 'aqe.learning_experiences';
const MIGRATION = 'migration-004.sql (src/sync/schema/ in the agentic-qe package)';

const CONTENT_COLUMNS = ['agent_id', 'task_id', 'task_type', 'state', 'action', 'reward', 'next_state', 'episode_id', 'created_at'];
const IDENTITY_COLUMNS = ['agent_id', 'task_id', 'task_type', 'created_at'];

/** Equal on `columns`; NULL equals NULL. */
const same = (columns: string[], a: string, b: string) =>
  columns.map((c) => `${a}.${c} IS NOT DISTINCT FROM ${b}.${c}`).join(' AND ');

const KEYED = (alias: string) => `${alias}.source_env = l.source_env AND ${alias}.local_id IS NOT NULL`;

/** Legacy rows of $1, classified against the keyed rows of the same environment. */
const CLASSIFIED_LEGACY = `
  SELECT l.id,
         EXISTS (
           SELECT 1 FROM ${TABLE} k WHERE ${KEYED('k')} AND ${same(CONTENT_COLUMNS, 'k', 'l')}
         ) AS has_keyed_twin,
         (
           SELECT COUNT(*) FROM ${TABLE} k WHERE ${KEYED('k')} AND ${same(IDENTITY_COLUMNS, 'k', 'l')}
         ) = 1 AS has_unique_keyed_identity,
         ROW_NUMBER() OVER (
           PARTITION BY ${CONTENT_COLUMNS.map((c) => `l.${c}`).join(', ')}
           ORDER BY l.id
         ) AS rn
  FROM ${TABLE} l
  WHERE l.source_env = $1 AND l.local_id IS NULL`;

const DELETABLE_IDS =
  `SELECT id FROM (${CLASSIFIED_LEGACY}) c WHERE c.has_keyed_twin OR c.has_unique_keyed_identity OR c.rn > 1`;

interface CountRow {
  total: string | number;
  keyed: string | number;
  legacy: string | number;
}

interface ClassRow {
  with_twin: string | number;
  changed: string | number;
  repeats: string | number;
  kept: string | number;
}

const num = (v: string | number | null | undefined) => Number(v ?? 0);

/** True when the cloud table has the local_id column (migration 004 applied). */
export async function hasLocalIdColumn(db: DedupeDb): Promise<boolean> {
  const rows = await db.query<{ n: string | number }>(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = 'aqe' AND table_name = 'learning_experiences' AND column_name = 'local_id'`,
  );
  return num(rows[0]?.n) > 0;
}

export interface DedupeOptions {
  /**
   * Local experiences the upload sends for this environment. With it, the plan is
   * blocked until every one of them has a keyed row (a full sync ran after migration 004).
   */
  localExperiences?: number;
}

/** What the cleanup would delete for `environment`; changes nothing. */
export async function planExperienceDedupe(
  db: DedupeDb,
  environment: string,
  options: DedupeOptions = {},
): Promise<ExperienceDedupePlan> {
  if (!environment) throw new Error('An environment is required: rows are only compared within one environment');
  const empty: ExperienceDedupePlan = {
    environment, totalRows: 0, keyedRows: 0, legacyRows: 0, legacyWithKeyedTwin: 0, legacyChanged: 0,
    legacyRepeats: 0, legacyKept: 0, toDelete: 0, rowsAfter: 0,
    ...(options.localExperiences !== undefined ? { localExperiences: options.localExperiences } : {}),
  };
  if (!(await hasLocalIdColumn(db))) {
    return {
      ...empty,
      blocked: `${TABLE} has no local_id column. Apply ${MIGRATION} ` +
        '(or re-apply the cloud schema), run aqe sync --full, then run this again.',
    };
  }

  const [counts] = await db.query<CountRow>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE local_id IS NOT NULL) AS keyed,
            COUNT(*) FILTER (WHERE local_id IS NULL) AS legacy
     FROM ${TABLE} WHERE source_env = $1`,
    [environment],
  );
  const [cls] = await db.query<ClassRow>(
    `SELECT COUNT(*) FILTER (WHERE has_keyed_twin) AS with_twin,
            COUNT(*) FILTER (WHERE NOT has_keyed_twin AND has_unique_keyed_identity) AS changed,
            COUNT(*) FILTER (WHERE NOT has_keyed_twin AND NOT has_unique_keyed_identity AND rn > 1) AS repeats,
            COUNT(*) FILTER (WHERE NOT has_keyed_twin AND NOT has_unique_keyed_identity AND rn = 1) AS kept
     FROM (${CLASSIFIED_LEGACY}) c`,
    [environment],
  );

  const plan: ExperienceDedupePlan = {
    ...empty,
    totalRows: num(counts?.total),
    keyedRows: num(counts?.keyed),
    legacyRows: num(counts?.legacy),
    legacyWithKeyedTwin: num(cls?.with_twin),
    legacyChanged: num(cls?.changed),
    legacyRepeats: num(cls?.repeats),
    legacyKept: num(cls?.kept),
  };
  plan.toDelete = plan.legacyWithKeyedTwin + plan.legacyChanged + plan.legacyRepeats;
  plan.rowsAfter = plan.totalRows - plan.toDelete;

  // Legacy rows are only matched against keyed rows. Until every local experience
  // has one, a legacy copy would be kept as an "only copy", and the next full sync
  // would add the experience again next to it.
  if (plan.legacyRows > 0) {
    const local = options.localExperiences;
    if (plan.keyedRows === 0) {
      plan.blocked = `No row of environment '${environment}' has a local_id yet. ` +
        `Run aqe sync --full --env ${environment} first, so every experience is uploaded with its key.`;
    } else if (local !== undefined && plan.keyedRows < local) {
      plan.blocked = `Only ${plan.keyedRows} of ${local} local experiences have been uploaded with a local_id. ` +
        `Run aqe sync --full --env ${environment} first.`;
    }
  }
  return plan;
}

/** Backup table name for a run at `at`, e.g. aqe.learning_experiences_dedupe_20261118t093000. */
export function backupTableName(at: Date): string {
  const stamp = at.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').toLowerCase();
  return `aqe.learning_experiences_dedupe_${stamp}`;
}

/** SQL that puts the rows of a backup table back. */
export function restoreStatement(backupTable: string): string {
  return `INSERT INTO ${TABLE} SELECT * FROM ${validateIdentifier(backupTable)};`;
}

/**
 * Delete the duplicates `planExperienceDedupe` reports, after copying them into a
 * backup table, in one transaction that holds a write lock on the table from the
 * plan to the commit. A blocked plan changes nothing and is returned as it is.
 */
export async function applyExperienceDedupe(
  db: DedupeDb,
  environment: string,
  options: DedupeOptions & { now?: Date; lockTimeout?: string } = {},
): Promise<ExperienceDedupeResult> {
  const backupTable = validateIdentifier(backupTableName(options.now ?? new Date()));
  const lockTimeout = options.lockTimeout ?? '10s';
  if (!/^\d+(ms|s|min)?$/.test(lockTimeout)) throw new Error(`Invalid lock timeout: ${lockTimeout}`);
  await db.execute('BEGIN');
  try {
    // Fail fast instead of queueing behind (and then blocking) a running sync.
    await db.execute(`SET LOCAL lock_timeout = '${lockTimeout}'`);
    // A sync running now must not add or change rows between the plan and the delete.
    await db.execute(`LOCK TABLE ${TABLE} IN SHARE ROW EXCLUSIVE MODE`);
    const plan = await planExperienceDedupe(db, environment, options);
    if (plan.blocked || plan.toDelete === 0) {
      await db.execute('ROLLBACK');
      return { ...plan, deleted: 0, backupTable: null, verifiedRowsAfter: plan.totalRows };
    }
    await db.execute(
      `CREATE TABLE ${backupTable} AS SELECT * FROM ${TABLE} WHERE id IN (${DELETABLE_IDS})`,
      [environment],
    );
    const [backedUp] = await db.query<{ n: string | number }>(`SELECT COUNT(*) AS n FROM ${backupTable}`);
    if (num(backedUp?.n) !== plan.toDelete) {
      throw new Error(`Backup holds ${num(backedUp?.n)} rows, expected ${plan.toDelete}; nothing was deleted`);
    }
    const deletedRows = await db.query<{ id: number }>(
      `DELETE FROM ${TABLE} WHERE id IN (SELECT id FROM ${backupTable}) AND source_env = $1 RETURNING id`,
      [environment],
    );
    if (deletedRows.length !== plan.toDelete) {
      throw new Error(`Deleted ${deletedRows.length} rows, expected ${plan.toDelete}; rolled back`);
    }
    const [after] = await db.query<{ n: string | number }>(
      `SELECT COUNT(*) AS n FROM ${TABLE} WHERE source_env = $1`,
      [environment],
    );
    if (num(after?.n) !== plan.rowsAfter) {
      throw new Error(`Environment has ${num(after?.n)} rows after the delete, expected ${plan.rowsAfter}; rolled back`);
    }
    await db.execute('COMMIT');
    return { ...plan, deleted: deletedRows.length, backupTable, verifiedRowsAfter: num(after?.n) };
  } catch (error) {
    await db.execute('ROLLBACK').catch(() => undefined);
    throw error;
  }
}
