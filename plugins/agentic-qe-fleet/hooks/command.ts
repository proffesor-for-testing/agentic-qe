import { judgeBash } from './guard'
import type { GuardMode } from './options'
import { DATA_FILE } from './paths'
import { STATUS_PATH, type Stats } from './status'

/** A learning-data file as `$.fs.list` reports it. */
export type DataFile = { readonly name: string; readonly size: number; readonly mtimeMs: number }

/**
 * What `/aqe-mod` reads: all of it local and cheap. Anything only the AQE MCP
 * server knows (the last gate verdict, live fleet health, pattern counts) is
 * reported as unknown, never estimated: this sandboxed mod does not call MCP.
 */
export type CommandDeps = {
  readonly mode: GuardMode
  readonly stats: Stats
  /** Names of the tools connected now. */
  readonly tools: () => Promise<readonly string[]>
  /** The entries of `<root>/.agentic-qe`, or null when it is missing or unreadable. */
  readonly aqeDir: () => Promise<readonly DataFile[] | null>
  /** The project root, when known: `check` then judges exactly as the guard does. */
  readonly root?: string
}

const HELP = [
  '/aqe-mod status          guard mode and this session\'s counts',
  '/aqe-mod check <command> would the guard refuse this shell command? (nothing runs)',
  '/aqe-mod fleet           AQE data files present and AQE MCP tools connected',
  '/aqe-mod gate            what is known about the last quality gate',
].join('\n')

/** AQE's MCP tools, by server name (`mcp__agentic-qe__*`, or the plugin-scoped `mcp__plugin_agentic-qe-fleet_...__*`). */
export const isAqeTool = (name: string): boolean => /^mcp__(plugin_agentic-qe[^_]*_)?[^_]*agentic[-_]qe[^_]*__/i.test(name)

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`)

async function aqeToolCount(deps: CommandDeps): Promise<string> {
  try {
    const n = (await deps.tools()).filter(isAqeTool).length
    return n === 0 ? 'AQE MCP tools connected: none (is the agentic-qe MCP server running?)' : `AQE MCP tools connected: ${n}`
  } catch {
    return 'AQE MCP tools connected: unknown (the tool list was not readable)'
  }
}

function status(deps: CommandDeps): string {
  const { mode, stats } = deps
  const line =
    mode === 'enforce'
      ? 'guard: enforce (refuses destructive operations on .agentic-qe learning data)'
      : mode === 'notify'
        ? 'guard: notify (allows, but warns on destructive operations on .agentic-qe learning data)'
        : 'guard: off (nothing is checked)'
  return [
    line,
    `this session: ${stats.calls} call${stats.calls === 1 ? '' : 's'} checked · ${stats.blocked} blocked · ${stats.flagged} flagged`,
    stats.lastDenied === undefined ? 'last refusal: none' : `last refusal: ${stats.lastDenied}`,
    `status file: ${STATUS_PATH}`,
  ].join('\n')
}

function check(command: string, root: string | undefined): string {
  if (command === '') return 'Usage: /aqe-mod check <shell command>'
  const r = judgeBash(command, { root })
  return r === undefined ? 'allowed: the guard would let this run.' : `refused: ${r.reason}`
}

async function fleet(deps: CommandDeps): Promise<string> {
  let files: readonly DataFile[] | null
  try {
    files = await deps.aqeDir()
  } catch {
    files = null
  }
  const data = (files ?? []).filter(f => DATA_FILE.test(f.name))
  const lines =
    files === null
      ? ['.agentic-qe: not found in this project (run `aqe init`)']
      : data.length === 0
        ? ['.agentic-qe: present, no learning-data files yet']
        : ['.agentic-qe learning data:', ...data.map(f => `  ${f.name}  ${kb(f.size)}  modified ${new Date(f.mtimeMs).toISOString()}`)]
  return [...lines, await aqeToolCount(deps), 'fleet health: unknown here (ask the fleet_status MCP tool or run /aqe-fleet-status)'].join('\n')
}

async function gate(deps: CommandDeps): Promise<string> {
  return [
    'last quality-gate verdict: unknown (it is held by the AQE MCP server; this mod does not call MCP)',
    await aqeToolCount(deps),
    'to evaluate one: the quality_assess MCP tool, or /aqe-report',
  ].join('\n')
}

/** `/aqe-mod`, answered locally: no model turn, and nothing it says is estimated. */
export async function answer(args: string, deps: CommandDeps): Promise<string> {
  const trimmed = args.trim()
  const [verb = '', ...rest] = trimmed.split(/\s+/)
  if (verb === '' || verb === 'help') return HELP
  if (verb === 'status') return status(deps)
  if (verb === 'check') return check(trimmed.slice(verb.length).trim(), deps.root)
  if (verb === 'fleet') return fleet(deps)
  if (verb === 'gate') return gate(deps)
  return `Unknown: ${verb.slice(0, 40)}${rest.length > 0 ? ' …' : ''}\n${HELP}`
}
