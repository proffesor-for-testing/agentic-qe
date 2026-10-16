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
 *   registered (for example `learning-consolidation`).
 * - `AQE_DREAM_INSIGHTS_RETENTION_DAYS`: retention window for unapplied
 *   `dream_insights` rows. Default 30. `0` or `off` disables the sweep.
 *   Invalid values are rejected with a warning and fall back to the default.
 */

export type WorkerEnv = Readonly<Record<string, string | undefined>>;

const FALSY_VALUES = new Set(['false', '0', 'off', 'no']);

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
 * Worker ids listed in `AQE_DISABLED_WORKERS`, trimmed, de-duplicated and
 * with empty entries removed.
 */
export function parseDisabledWorkers(env: WorkerEnv = process.env): string[] {
  const raw = env.AQE_DISABLED_WORKERS;
  if (!raw) return [];
  const ids = raw
    .split(',')
    .map((id) => id.trim())
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
 * - `0` or `off`: sweep disabled (`retentionDays: null`)
 * - a whole number from 1 to 36500: that many days
 * - anything else: default, with a warning describing the rejected value
 */
export function resolveDreamInsightsRetention(
  env: WorkerEnv = process.env,
): DreamInsightsRetention {
  const raw = env.AQE_DREAM_INSIGHTS_RETENTION_DAYS;
  if (raw === undefined || raw.trim() === '') {
    return { retentionDays: DEFAULT_DREAM_INSIGHTS_RETENTION_DAYS };
  }

  const value = raw.trim().toLowerCase();
  if (value === 'off' || value === '0') {
    return { retentionDays: null };
  }

  if (/^\d+$/.test(value)) {
    const days = Number(value);
    if (days >= 1 && days <= MAX_DREAM_INSIGHTS_RETENTION_DAYS) {
      return { retentionDays: days };
    }
  }

  return {
    retentionDays: DEFAULT_DREAM_INSIGHTS_RETENTION_DAYS,
    warning:
      `Invalid AQE_DREAM_INSIGHTS_RETENTION_DAYS=${JSON.stringify(raw)}; ` +
      `expected a whole number of days (1-${MAX_DREAM_INSIGHTS_RETENTION_DAYS}), ` +
      `0 or "off". Using the default of ${DEFAULT_DREAM_INSIGHTS_RETENTION_DAYS} days.`,
  };
}
