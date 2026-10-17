/**
 * Agentic QE v3 - Background worker environment switches (#1061)
 *
 * Parses the environment variables that control the background worker
 * daemon hosted by the MCP server:
 *
 * - `AQE_WORKERS_ENABLED`: `false` / `0` / `off` / `no` disables the whole
 *   worker daemon, including the QualityDaemon. Unset, empty or any other
 *   value keeps the default behaviour (workers on). `aqe init` writes `true`
 *   for normal installs and `false` for `--no-database` installs (#533).
 * - `AQE_DISABLED_WORKERS`: comma-separated worker ids that are not
 *   registered (for example `learning-consolidation`). Matched without
 *   regard to case (#1066).
 * - `AQE_DREAM_INSIGHTS_RETENTION_DAYS`: retention window for unapplied
 *   `dream_insights` rows. Default 30. `0`, `off`, `false`, `no`, `disabled`,
 *   `none` or `never` disables the sweep. Any other value that is not a whole
 *   number of days is rejected with a warning and also disables the sweep, so
 *   a typo never deletes anything (#1066).
 */

export type WorkerEnv = Readonly<Record<string, string | undefined>>;

const FALSY_VALUES = new Set(['false', '0', 'off', 'no']);

/**
 * Values of `AQE_DREAM_INSIGHTS_RETENTION_DAYS` that turn the sweep off: the
 * `AQE_WORKERS_ENABLED` falsy set plus a few spellings people use for "keep".
 */
const RETENTION_OFF_VALUES = new Set([...FALSY_VALUES, 'disabled', 'disable', 'none', 'never']);

/** Default retention window for unapplied dream insights (days). */
export const DEFAULT_DREAM_INSIGHTS_RETENTION_DAYS = 30;

/** Upper bound accepted for the retention window (100 years). */
const MAX_DREAM_INSIGHTS_RETENTION_DAYS = 36500;

/**
 * Whether background workers should start. Only an explicit falsy value
 * disables them, so existing installs keep today's behaviour.
 */
export function isWorkersEnabled(env: WorkerEnv = process.env): boolean {
  const raw = env.AQE_WORKERS_ENABLED;
  if (raw === undefined) return true;
  return !FALSY_VALUES.has(raw.trim().toLowerCase());
}

/**
 * Worker ids listed in `AQE_DISABLED_WORKERS`, trimmed, lower-cased,
 * de-duplicated and with empty entries removed. Worker ids are lower-case, so
 * `Learning-Consolidation` disables `learning-consolidation` (#1066).
 */
export function parseDisabledWorkers(env: WorkerEnv = process.env): string[] {
  const raw = env.AQE_DISABLED_WORKERS;
  if (!raw) return [];
  const ids = raw
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter((id) => id.length > 0);
  return Array.from(new Set(ids));
}

export interface DreamInsightsRetention {
  /** Retention window in days, or `null` when the sweep is disabled. */
  retentionDays: number | null;
  /** Set when the configured value was rejected (default applied). */
  warning?: string;
}

/**
 * Resolve `AQE_DREAM_INSIGHTS_RETENTION_DAYS`.
 *
 * - unset / empty: default (30 days)
 * - `0`, `off`, `false`, `no`, `disabled`, `none`, `never`: sweep disabled
 *   (`retentionDays: null`)
 * - a whole number from 1 to 36500: that many days
 * - anything else: sweep disabled, with a warning describing the rejected
 *   value. The sweep deletes user data, so an unreadable setting fails safe
 *   (#1066).
 */
export function resolveDreamInsightsRetention(
  env: WorkerEnv = process.env,
): DreamInsightsRetention {
  const raw = env.AQE_DREAM_INSIGHTS_RETENTION_DAYS;
  if (raw === undefined || raw.trim() === '') {
    return { retentionDays: DEFAULT_DREAM_INSIGHTS_RETENTION_DAYS };
  }

  const value = raw.trim().toLowerCase();
  if (RETENTION_OFF_VALUES.has(value)) {
    return { retentionDays: null };
  }

  if (/^\d+$/.test(value)) {
    const days = Number(value);
    if (days >= 1 && days <= MAX_DREAM_INSIGHTS_RETENTION_DAYS) {
      return { retentionDays: days };
    }
  }

  return {
    retentionDays: null,
    warning:
      `Invalid AQE_DREAM_INSIGHTS_RETENTION_DAYS=${JSON.stringify(raw)}; ` +
      `expected a whole number of days (1-${MAX_DREAM_INSIGHTS_RETENTION_DAYS}), ` +
      `0 or "off". The dream_insights retention sweep is off until this is fixed; nothing is deleted.`,
  };
}
