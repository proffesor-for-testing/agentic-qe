import type { GuardMode } from './options'
import { MOD_VERSION } from './version'

export { MOD_VERSION }

/**
 * The status file the ruflo console's Mods section reads (ADR-446; contract in
 * ruflo-console hooks/data/mods.ts): `.claude-flow/<name>-mod/status.json`,
 * `version: 1`, at most 8 KB, stale after 6 hours without a write. The console
 * reads the top-level counters; `totals` and `lastRefusal` are additive fields
 * it ignores, kept so a refusal outlives the session that made it (#924).
 */
export const MOD_NAME = 'aqe-mod'
export const STATUS_DIR = `.claude-flow/${MOD_NAME}`
export const STATUS_PATH = `${STATUS_DIR}/status.json`
/** The console's folder rule; the smoke script and tests hold the name to it. */
export const STATUS_DIR_RULE = /^[a-z0-9][a-z0-9-]{0,40}-mod$/
export const STATUS_MAX_BYTES = 8192
/** One line (at most 120 characters) for the console row. */
export const SUMMARY = 'Guards AQE learning data (.agentic-qe/*.db, -wal, -shm, *.rvf) from rm, overwrite, truncate and DROP/DELETE'
/** The most characters of a refusal reason kept in the file. */
export const REASON_MAX = 200

/** What the guard did with a call it would refuse: refused it (enforce) or let it run with a warning (notify). */
export type Outcome = 'blocked' | 'flagged'

/** The most recent refusal: when, which tool, and the guard's reason, cut short. Never the command itself. */
export type LastRefusal = { atMs: number; tool: string; outcome: Outcome; reason: string }

/** Counters for this session. `calls`: tool calls the guard read; `blocked`: refused; `flagged`: would have refused (notify). */
export type Stats = { calls: number; blocked: number; flagged: number; lastDenied?: 'destructive'; startedMs?: number; lastRefusal?: LastRefusal }

export const newStats = (): Stats => ({ calls: 0, blocked: 0, flagged: 0 })

/** The three counters, as a session or the totals hold them. */
export type Counts = { calls: number; blocked: number; flagged: number }

export const ZERO: Counts = { calls: 0, blocked: 0, flagged: 0 }
export const countsOf = (c: Counts): Counts => ({ calls: c.calls, blocked: c.blocked, flagged: c.flagged })

/** Counts across every session in this project, and when counting began. */
export type Totals = Counts & { since?: number }

/** What the file carries across sessions. */
export type Saved = { totals: Totals; lastRefusal?: LastRefusal }

export const noSaved = (): Saved => ({ totals: { ...ZERO } })

/** What the file holds. Counts and fixed classes, plus the last refusal's reason cut to REASON_MAX: never a command. */
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
  totals: Totals
  lastRefusal?: LastRefusal
}

const CEILING = Number.MAX_SAFE_INTEGER
const DAY_MS = 86_400_000
const whole = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), CEILING) : undefined)
/** A time read from the file: kept only within [0, now + 1 day], else missing (a planted far-future time must not stick). */
const instant = (v: unknown, nowMs: number): number | undefined => {
  const t = whole(v)
  return t !== undefined && t <= nowMs + DAY_MS ? t : undefined
}
const record = (v: unknown): Record<string, unknown> | undefined => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined)
const TOOL = /^[A-Za-z0-9_.-]{1,64}$/
/** C0/C1 controls, and the bidi and zero-width marks that could disguise text (ADR-450 T2). */
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g

/** A tool name fit for the file: the name itself when plain, else `other`. */
export const toolName = (tool: unknown): string => (typeof tool === 'string' && TOOL.test(tool) ? tool : 'other')

/** Every reason the guard's `judge` gives starts with this; a stored reason that does not is dropped. */
export const REASON_PREFIX = 'aqe-mod refused this: '
/** A backticked span kept as written: a verb and its flags (`rm`, `xargs rm -c`, `.backup`, `Remove-Item -Force`). */
const VERB = /^(?=.{1,40}$)[A-Za-z0-9 ._+-]+(\/-[a-z]+)?$/
/** A word that is an operand: a path, an expansion, a quote, a glob, or a data file. */
const OPERAND = /[/\\~$="(){}*?[\]]|^'|agentic|\.(db|rvf)$|-(wal|shm)$/i
/** The guard's own prose that has slashes: SQL keyword lists (`DROP/DELETE`, `UPDATE/.restore`). */
const PROSE = /^[A-Z]+(\/(\.[a-z]+|[A-Z]+))+$/
const STORE = /\.agentic-qe(?=[/\\]|$)/i

/** An operand as the file may keep it: its `.agentic-qe/...` suffix when it has one, else `<path>`. */
function operand(word: string): string {
  const m = STORE.exec(word)
  return m === null ? '<path>' : word.slice(m.index).replace(/\\/g, '/')
}

/**
 * The reason without operands that could carry a secret (a path such as
 * `/home/u/<token>/.agentic-qe`): a backticked expression becomes `<expr>`,
 * any other operand its `.agentic-qe/...` suffix or `<path>`. The verb and what
 * was refused stay.
 */
export function redactReason(text: string): string {
  return text
    .split(/(`[^`]*`)/)
    .map((part, i) => {
      if (i % 2 === 1) return VERB.test(part.slice(1, -1)) ? part : '`<expr>`'
      return part.replace(/\S+/g, word => {
        const m = /^(\(*)(.*?)([.,;:)]*)$/.exec(word) as RegExpExecArray
        const core = m[2] as string
        return core !== '' && OPERAND.test(core) && !PROSE.test(core) ?`${m[1] as string}${operand(core)}${m[3] as string}` : word
      })
    })
    .join('')
}

/**
 * A refusal reason fit for the file: `advice` (the guard's fixed back-up-first
 * suffix) dropped, control and bidi characters removed, whitespace collapsed,
 * operands redacted (redactReason), and cut to REASON_MAX characters.
 */
export function cleanReason(reason: unknown, advice = ''): string {
  let text = typeof reason === 'string' ? reason : ''
  if (advice !== '' && text.endsWith(advice)) text = text.slice(0, -advice.length)
  text = redactReason(text.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim())
  return text.length <= REASON_MAX ? text : `${text.slice(0, REASON_MAX - 1)}…`
}

function refusalOf(v: unknown, nowMs: number): LastRefusal | undefined {
  const r = record(v)
  const atMs = instant(r?.atMs, nowMs)
  if (r === undefined || atMs === undefined || typeof r.reason !== 'string') return undefined
  const reason = cleanReason(r.reason)
  if (!reason.startsWith(REASON_PREFIX)) return undefined
  const outcome: Outcome = r.outcome === 'flagged' ? 'flagged' : 'blocked'
  return { atMs, tool: toolName(r.tool), outcome, reason }
}

/**
 * What an earlier status file carried across sessions, or null when it is
 * missing, too large, not JSON or not version 1. A file from before #924 has
 * no `totals`: its session counters seed them. A time past `nowMs` + 1 day is
 * dropped, and so is a last refusal whose reason is not the guard's.
 */
export function parseSaved(text: unknown, nowMs: number): Saved | null {
  if (typeof text !== 'string' || text.length > STATUS_MAX_BYTES) return null
  let value: Record<string, unknown> | undefined
  try {
    value = record(JSON.parse(text))
  } catch {
    return null
  }
  if (value === undefined || value.version !== 1) return null
  const from = record(value.totals) ?? value
  const since = instant(record(value.totals) === undefined ? value.startedMs : from.since, nowMs)
  const lastRefusal = refusalOf(value.lastRefusal, nowMs)
  return {
    totals: { calls: whole(from.calls) ?? 0, blocked: whole(from.blocked) ?? 0, flagged: whole(from.flagged) ?? 0, ...(since !== undefined && { since }) },
    ...(lastRefusal !== undefined && { lastRefusal }),
  }
}

const add = (a: number, b: number): number => Math.min(a + Math.max(b, 0), CEILING)

/**
 * `prior` (what the file holds now, other sessions included) plus this
 * session's counts not yet written (`stats` less `written`), and the newer of
 * the two last refusals.
 */
export function mergeSaved(prior: Saved, stats: Stats, written: Counts): Saved {
  const since = prior.totals.since ?? stats.startedMs
  const mine = stats.lastRefusal
  const theirs = prior.lastRefusal
  const lastRefusal = mine === undefined ? theirs : theirs === undefined || mine.atMs >= theirs.atMs ? mine : theirs
  return {
    totals: {
      calls: add(prior.totals.calls, stats.calls - written.calls),
      blocked: add(prior.totals.blocked, stats.blocked - written.blocked),
      flagged: add(prior.totals.flagged, stats.flagged - written.flagged),
      ...(since !== undefined && { since }),
    },
    ...(lastRefusal !== undefined && { lastRefusal }),
  }
}

export function statusPayload(stats: Stats, mode: GuardMode, nowMs: number, saved: Saved = mergeSaved(noSaved(), stats, ZERO)): StatusPayload {
  const denied = stats.lastDenied ?? (saved.lastRefusal !== undefined ? 'destructive' : undefined)
  return {
    version: 1,
    modVersion: MOD_VERSION,
    summary: SUMMARY,
    guard: mode === 'enforce',
    mode,
    calls: stats.calls,
    blocked: stats.blocked,
    flagged: stats.flagged,
    ...(denied !== undefined && { lastDenied: denied }),
    ...(stats.startedMs !== undefined && { startedMs: stats.startedMs }),
    updatedMs: nowMs,
    totals: saved.totals,
    ...(saved.lastRefusal !== undefined && { lastRefusal: saved.lastRefusal }),
  }
}

export const statusText = (stats: Stats, mode: GuardMode, nowMs: number, saved?: Saved): string => `${JSON.stringify(statusPayload(stats, mode, nowMs, saved), null, 2)}\n`

/** The ruflo status-bar segment's text (ruflo cuts it to 48 characters). */
export const segmentText = (stats: Stats, mode: GuardMode): string =>
  mode === 'off' ? 'aqe guard off' : `aqe ${mode}${stats.blocked > 0 ? ` · ${stats.blocked} blocked` : ''}${stats.flagged > 0 ? ` · ${stats.flagged} flagged` : ''}`
