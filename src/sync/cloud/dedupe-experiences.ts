/**
 * #1436: one-off cleanup of duplicated rows in aqe.learning_experiences.
 *
 * Before migration 004 the table had no sync key, so every full sync inserted each
 * captured experience again. Those rows have `local_id IS NULL` ("legacy" rows).
 * After migration 004 and one full sync, every local experience also has a row
 * with its `local_id` ("keyed" rows), which later syncs update in place.
 *
 * For one environment, a legacy row is a duplicate when
 *   - a keyed row of the same environment has the same content (it was re-uploaded
 *     with its key), or
 *   - an earlier legacy row of the same environment has the same content.
 * So every keyed row is kept, and of legacy rows with no keyed twin (an experience
 * since deleted locally) one copy is kept. Content means every uploaded column:
 * agent_id, task_id, task_type, state, action, reward, next_state, episode_id and
 * created_at. Rows are never compared across environments.
 *
 * `applyExperienceDedupe` copies the rows it deletes into a backup table first, in
 * the same transaction as the delete.
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
  /** Rows uploaded before migration 004 (local_id NULL). */
  legacyRows: number;
  /** Legacy rows whose content matches a keyed row (deleted). */
  legacyWithKeyedTwin: number;
  /** Legacy rows with no keyed twin that repeat an earlier legacy row (deleted). */
  legacyRepeats: number;
  /** Legacy rows with no keyed twin kept, one per distinct content. */
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

/** Same content on every uploaded column; NULL equals NULL. */
const SAME_CONTENT = (a: string, b: string) =>
  ['agent_id', 'task_id', 'task_type', 'state', 'action', 'reward', 'next_state', 'episode_id', 'created_at']
    .map((c) => `${a}.${c} IS NOT DISTINCT FROM ${b}.${c}`)
    .join(' AND ');

/** Legacy rows of $1 with whether a keyed twin exists and their rank among identical legacy rows. */
const CLASSIFIED_LEGACY = `
  SELECT l.id,
         EXISTS (
           SELECT 1 FROM ${TABLE} k
           WHERE k.source_env = l.source_env AND k.local_id IS NOT NULL AND ${SAME_CONTENT('k', 'l')}
         ) AS has_keyed_twin,
         ROW_NUMBER() OVER (
           PARTITION BY l.agent_id, l.task_id, l.task_type, l.state, l.action, l.reward,
                        l.next_state, l.episode_id, l.created_at
           ORDER BY l.id
         ) AS rn
  FROM ${TABLE} l
  WHERE l.source_env = $1 AND l.local_id IS NULL`;

const DELETABLE_IDS = `SELECT id FROM (${CLASSIFIED_LEGACY}) c WHERE c.has_keyed_twin OR c.rn > 1`;

interface CountRow {
  total: string | number;
  keyed: string | number;
  legacy: string | number;
}

interface ClassRow {
  with_twin: string | number;
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

/** What the cleanup would delete for `environment`; changes nothing. */
export async function planExperienceDedupe(db: DedupeDb, environment: string): Promise<ExperienceDedupePlan> {
  if (!environment) throw new Error('An environment is required: rows are only compared within one environment');
  const empty = {
    environment, totalRows: 0, keyedRows: 0, legacyRows: 0, legacyWithKeyedTwin: 0,
    legacyRepeats: 0, legacyKept: 0, toDelete: 0, rowsAfter: 0,
  };
  if (!(await hasLocalIdColumn(db))) {
    return {
      ...empty,
      blocked: `${TABLE} has no local_id column. Apply src/sync/schema/migration-004.sql ` +
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
            COUNT(*) FILTER (WHERE NOT has_keyed_twin AND rn > 1) AS repeats,
            COUNT(*) FILTER (WHERE NOT has_keyed_twin AND rn = 1) AS kept
     FROM (${CLASSIFIED_LEGACY}) c`,
    [environment],
  );

  const plan: ExperienceDedupePlan = {
    environment,
    totalRows: num(counts?.total),
    keyedRows: num(counts?.keyed),
    legacyRows: num(counts?.legacy),
    legacyWithKeyedTwin: num(cls?.with_twin),
    legacyRepeats: num(cls?.repeats),
    legacyKept: num(cls?.kept),
    toDelete: 0,
    rowsAfter: 0,
  };
  plan.toDelete = plan.legacyWithKeyedTwin + plan.legacyRepeats;
  plan.rowsAfter = plan.totalRows - plan.toDelete;

  // Without keyed rows, the next full sync would add every experience again next to
  // the legacy copies kept here. Upload the keyed rows first.
  if (plan.legacyRows > 0 && plan.keyedRows === 0) {
    plan.blocked = `No row of environment '${environment}' has a local_id yet. ` +
      `Run aqe sync --full --env ${environment} first, so every experience is uploaded with its key.`;
  }
  return plan;
}

/** Backup table name for a run at `at`, e.g. aqe.learning_experiences_dedupe_20261118T093000. */
export function backupTableName(at: Date): string {
  const stamp = at.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').toLowerCase();
  return `aqe.learning_experiences_dedupe_${stamp}`;
}

/**
 * Delete the duplicates `planExperienceDedupe` reports, after copying them into a
 * backup table, in one transaction that holds a write lock on the table from the
 * plan to the commit. Refuses when the plan is blocked.
 */
export async function applyExperienceDedupe(
  db: DedupeDb,
  environment: string,
  options: { now?: Date } = {},
): Promise<ExperienceDedupeResult> {
  const backupTable = validateIdentifier(backupTableName(options.now ?? new Date()));
  await db.execute('BEGIN');
  try {
    // A sync running now must not add or change rows between the plan and the delete.
    await db.execute(`LOCK TABLE ${TABLE} IN SHARE ROW EXCLUSIVE MODE`);
    const plan = await planExperienceDedupe(db, environment);
    if (plan.blocked) throw new Error(plan.blocked);
    if (plan.toDelete === 0) {
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
