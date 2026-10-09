import type { GuardMode } from './options'

/**
 * The status file the ruflo console's Mods section reads (ADR-446; contract in
 * ruflo-console hooks/data/mods.ts): `.claude-flow/<name>-mod/status.json`,
 * `version: 1`, at most 8 KB, stale after 6 hours without a write.
 */
export const MOD_NAME = 'aqe-mod'
export const STATUS_DIR = `.claude-flow/${MOD_NAME}`
export const STATUS_PATH = `${STATUS_DIR}/status.json`
/** The console's folder rule; the smoke script and tests hold the name to it. */
export const STATUS_DIR_RULE = /^[a-z0-9][a-z0-9-]{0,40}-mod$/
export const STATUS_MAX_BYTES = 8192
/** The mod's own version (the console shows it when it matches ^[0-9][0-9A-Za-z.+-]{0,15}$). */
export const MOD_VERSION = '0.1.0'
/** One line (at most 120 characters) for the console row. */
export const SUMMARY = 'Guards AQE learning data (.agentic-qe/*.db, -wal, -shm, *.rvf) from rm, overwrite, truncate and DROP/DELETE'

/** Counters for this session. `calls`: tool calls the guard read; `blocked`: refused; `flagged`: would have refused (notify). */
export type Stats = { calls: number; blocked: number; flagged: number; lastDenied?: 'destructive'; startedMs?: number }

export const newStats = (): Stats => ({ calls: 0, blocked: 0, flagged: 0 })

/** What the file holds. Only fixed classes and counts: never a command, a path or a reason text. */
export type StatusPayload = {
  version: 1
  modVersion: string
  summary: string
  guard: boolean
  mode: GuardMode
  calls: number
  blocked: number
  flagged: number
  lastDenied?: 'destructive'
  startedMs?: number
  updatedMs: number
}

export function statusPayload(stats: Stats, mode: GuardMode, nowMs: number): StatusPayload {
  return {
    version: 1,
    modVersion: MOD_VERSION,
    summary: SUMMARY,
    guard: mode === 'enforce',
    mode,
    calls: stats.calls,
    blocked: stats.blocked,
    flagged: stats.flagged,
    ...(stats.lastDenied !== undefined && { lastDenied: stats.lastDenied }),
    ...(stats.startedMs !== undefined && { startedMs: stats.startedMs }),
    updatedMs: nowMs,
  }
}

export const statusText = (stats: Stats, mode: GuardMode, nowMs: number): string => `${JSON.stringify(statusPayload(stats, mode, nowMs), null, 2)}\n`

/** The ruflo status-bar segment's text (ruflo cuts it to 48 characters). */
export const segmentText = (stats: Stats, mode: GuardMode): string =>
  mode === 'off' ? 'aqe guard off' : `aqe ${mode}${stats.blocked > 0 ? ` · ${stats.blocked} blocked` : ''}${stats.flagged > 0 ? ` · ${stats.flagged} flagged` : ''}`
