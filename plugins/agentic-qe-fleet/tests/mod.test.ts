import type { On } from 'claude-code'
import { describe, expect, test, tier } from 'claude-code/testing'

import { answer } from '../hooks/command'
import { fallbackVerdict, GUARD_FAILED } from '../hooks/guard'
import { readOptions } from '../hooks/options'
import { newStats, STATUS_DIR_RULE, STATUS_MAX_BYTES } from '../hooks/status'

tier('user')

const ROOT = '/work'
const NOW = 1_700_000_000_000
const START = { surface: 'terminal', isInteractive: true, cwd: ROOT } as const
const STATUS = `${ROOT}/.claude-flow/aqe-mod/status.json`
const slash = (args: string) => ({ command: 'aqe-mod', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } }) as const

/** The engine beneath the mod: a root, a clock, a file system in a map, and a tool that answers `ran`. */
function world(on: On) {
  const files = new Map<string, string>()
  const ran: string[] = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: ROOT }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('fs.write', ($, e) => (files.set(e.path, e.text), { value: undefined }))
  on('fs.exists', ($, e) => ({ value: e.path === `${ROOT}/.agentic-qe` }))
  on('fs.list', () => ({
    value: [
      { name: 'memory.db', kind: 'file', size: 778240, mtimeMs: NOW, isLink: false },
      { name: 'config.yaml', kind: 'file', size: 2264, mtimeMs: NOW, isLink: false },
    ],
  }))
  on('tool.list', () => ({ value: [{ name: 'mcp__agentic-qe__fleet_status', description: '', mcp: true }, { name: 'Bash', description: '', mcp: false }] }))
  on('clock.now', () => ({ value: NOW }))
  on('tool.call', ($, e) => (ran.push(String((e as { command?: string }).command ?? e.tool)), { result: 'ran' }))
  const status = () => JSON.parse(files.get(STATUS) ?? '{}') as Record<string, unknown>
  return { files, ran, status }
}

describe('status file (ruflo console contract)', () => {
  test('written at session start, version 1, under a folder the console lists', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    const text = w.files.get(STATUS) ?? ''
    expect(text.length).toBeGreaterThan(0)
    expect(text.length).toBeLessThanOrEqual(STATUS_MAX_BYTES)
    expect(STATUS_DIR_RULE.test('aqe-mod')).toBe(true)
    expect(w.status()).toMatchObject({ version: 1, modVersion: '0.1.0', guard: true, mode: 'enforce', calls: 0, blocked: 0, startedMs: NOW, updatedMs: NOW })
    expect(String(w.status().summary).length).toBeLessThanOrEqual(120)
    expect(w.status().lastDenied).toBeUndefined()
  })
})

describe('tool.call guard (enforce, the default)', () => {
  test('a destructive command is refused before it runs and counted as destructive', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    const out = JSON.stringify(await $.tool.call({ tool: 'Bash', command: 'rm -f .agentic-qe/memory.db' } as never))
    expect(out).toContain('aqe-mod refused this')
    expect(w.ran).toEqual([])
    expect(w.status()).toMatchObject({ calls: 1, blocked: 1, lastDenied: 'destructive' })
  })

  test('a file tool aimed at the store is refused', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    const out = JSON.stringify(await $.tool.call({ tool: 'Write', file_path: `${ROOT}/.agentic-qe/memory.db`, content: '' } as never))
    expect(out).toContain('aqe-mod refused this')
    expect(w.ran).toEqual([])
  })

  test('backups, reads and other tools pass through unchanged', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    const backup = 'cp .agentic-qe/memory.db .agentic-qe/memory.db.bak-1700000000'
    const check = 'sqlite3 .agentic-qe/memory.db "PRAGMA integrity_check"'
    expect(JSON.stringify(await $.tool.call({ tool: 'Bash', command: backup } as never))).toContain('ran')
    expect(JSON.stringify(await $.tool.call({ tool: 'Bash', command: check } as never))).toContain('ran')
    expect(JSON.stringify(await $.tool.call({ tool: 'Read', file_path: '.agentic-qe/memory.db' } as never))).toContain('ran')
    expect(w.ran).toEqual([backup, check, 'Read'])
  })
})

describe('tool.call guard: notify mode, Monitor, scope', () => {
  test('notify lets a destructive call run, toasts, and counts it as flagged', { options: { guardMode: 'notify' } }, async ($, on) => {
    const w = world(on)
    const toasts: string[] = []
    on('ui.toast', ($, e) => (toasts.push(JSON.stringify(e)), { value: undefined }))
    await $.session.start(START)
    const out = JSON.stringify(await $.tool.call({ tool: 'Bash', command: 'rm -f .agentic-qe/memory.db' } as never))
    expect(out).toContain('ran')
    expect(out).not.toContain('aqe-mod refused this')
    expect(w.ran).toEqual(['rm -f .agentic-qe/memory.db'])
    expect(toasts.join(' ')).toContain('aqe-mod (notify)')
    expect(w.status()).toMatchObject({ mode: 'notify', calls: 1, blocked: 0, flagged: 1, lastDenied: 'destructive' })
  })

  test('off reads nothing', { options: { guardMode: 'off' } }, async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    expect(JSON.stringify(await $.tool.call({ tool: 'Bash', command: 'rm -rf .agentic-qe' } as never))).toContain('ran')
    expect(w.status()).toMatchObject({ mode: 'off', calls: 0 })
  })

  test('a Monitor command is judged like Bash', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    const out = JSON.stringify(await $.tool.call({ tool: 'Monitor', command: 'rm -f .agentic-qe/memory.db', description: 'x', timeout_ms: 1000 } as never))
    expect(out).toContain('aqe-mod refused this')
    expect(w.ran).toEqual([])
  })

  test('a review bypass (keyword before the verb) is refused through the engine', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    const out = JSON.stringify(await $.tool.call({ tool: 'Bash', command: 'if true; then rm .agentic-qe/memory.db; fi' } as never))
    expect(out).toContain('aqe-mod refused this')
    expect(w.ran).toEqual([])
  })

  test('every .agentic-qe is protected, a temp-directory fixture included (review B1/B2)', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    expect(JSON.stringify(await $.tool.call({ tool: 'Bash', command: 'rm -rf /tmp/fixture/.agentic-qe' } as never))).toContain('aqe-mod refused this')
    expect(JSON.stringify(await $.tool.call({ tool: 'Bash', command: 'rm -rf /tmp/*/.agentic-qe' } as never))).toContain('aqe-mod refused this')
    expect(JSON.stringify(await $.tool.call({ tool: 'Bash', command: `rm -rf ${ROOT}/.agentic-qe` } as never))).toContain('aqe-mod refused this')
    expect(w.ran).toEqual([])
  })

  test('the session root widens find: find <root> -name "*.db" -delete is refused', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    expect(JSON.stringify(await $.tool.call({ tool: 'Bash', command: `find ${ROOT} -name '*.db' -delete` } as never))).toContain('aqe-mod refused this')
    expect(JSON.stringify(await $.tool.call({ tool: 'Bash', command: `find ${ROOT}/dist -name '*.db' -delete` } as never))).toContain('ran')
    expect(w.ran).toEqual([`find ${ROOT}/dist -name '*.db' -delete`])
  })
})

describe('tool.call guard: the .catch handler (fail closed)', () => {
  // A test's own hooks may not make $ calls, so a re-entry or an overrun cannot be raised here;
  // the handler's whole decision is fallbackVerdict, which register.ts returns as-is.
  const throwing = {
    get command(): string {
      throw new Error('unreadable input')
    },
  }

  test('re-entry in enforce: judged once, refusing what the pure check refuses', () => {
    expect(fallbackVerdict('enforce', 'Bash', { command: 'rm .agentic-qe/memory.db' }, false, 're-entry')?.deny).toContain('aqe-mod refused this')
    expect(fallbackVerdict('enforce', 'Bash', { command: 'ls .agentic-qe' }, false, 're-entry')).toBeUndefined()
    expect(fallbackVerdict('enforce', 'Read', { file_path: '.agentic-qe/memory.db' }, false, 're-entry')).toBeUndefined()
  })

  test('re-entry in enforce: a check that throws refuses the call', () => {
    expect(fallbackVerdict('enforce', 'Bash', throwing, false, 're-entry')).toEqual({ deny: GUARD_FAILED })
  })

  test('a hook that threw or overran is refused outright, without judging again', () => {
    expect(fallbackVerdict('enforce', 'Bash', { command: 'ls .agentic-qe' }, false, 'throw')).toEqual({ deny: GUARD_FAILED })
    expect(fallbackVerdict('enforce', 'Bash', throwing, false, 'timeout')).toEqual({ deny: GUARD_FAILED })
  })

  test('next already ran: its result is replayed, nothing is judged twice', () => {
    expect(fallbackVerdict('enforce', 'Bash', { command: 'rm .agentic-qe/memory.db' }, true, 'throw')).toBeUndefined()
    expect(fallbackVerdict('enforce', 'Bash', throwing, true, 're-entry')).toBeUndefined()
  })

  test('notify and off never refuse from the handler', () => {
    expect(fallbackVerdict('notify', 'Bash', { command: 'rm .agentic-qe/memory.db' }, false, 'timeout')).toBeUndefined()
    expect(fallbackVerdict('off', 'Bash', throwing, false, 're-entry')).toBeUndefined()
  })
})

describe('/aqe-mod', () => {
  test('status, check, fleet and gate answer locally; unknown verbs get the help', async ($, on) => {
    world(on)
    await $.session.start(START)
    expect((await $.command.run(slash('status'))).text).toContain('guard: enforce')
    expect((await $.command.run(slash('check rm -rf .agentic-qe'))).text).toContain('refused')
    expect((await $.command.run(slash('check ls .agentic-qe'))).text).toContain('allowed')
    const fleet = (await $.command.run(slash('fleet'))).text
    expect(fleet).toContain('memory.db')
    expect(fleet).not.toContain('config.yaml')
    expect(fleet).toContain('AQE MCP tools connected: 1')
    expect(fleet).toContain('fleet health: unknown')
    expect((await $.command.run(slash('gate'))).text).toContain('verdict: unknown')
    expect((await $.command.run(slash('bogus'))).text).toContain('/aqe-mod gate')
  })
})

describe('options', () => {
  test('mode defaults to enforce; off/notify/enforce and on/off-style values are read', () => {
    expect(readOptions(undefined).mode).toBe('enforce')
    expect(readOptions({ guardMode: 'nonsense' }).mode).toBe('enforce')
    expect(readOptions({ guardMode: 'notify' }).mode).toBe('notify')
    expect(readOptions({ guardMode: 'off' }).mode).toBe('off')
    expect(readOptions({ guardMode: 'on' }).mode).toBe('enforce')
  })

  test('notify status reports the guard as not refusing', async () => {
    const text = await answer('status', { mode: 'notify', stats: newStats(), tools: async () => [], aqeDir: async () => null })
    expect(text).toContain('guard: notify')
  })
})
