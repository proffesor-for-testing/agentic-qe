/**
 * aqe-mod (plugins/agentic-qe-fleet/hooks): the pure guard and the status
 * payload, run under the repo's vitest. The engine-level tests (hooks wired
 * through `$`) live in plugins/agentic-qe-fleet/tests and run with
 * `claude plugin test plugins/agentic-qe-fleet`.
 */
import { describe, expect, it } from 'vitest'

import { answer } from '../../../../plugins/agentic-qe-fleet/hooks/command'
import { judge, judgeBash, segments } from '../../../../plugins/agentic-qe-fleet/hooks/guard'
import { readOptions } from '../../../../plugins/agentic-qe-fleet/hooks/options'
import { globReachesData, normalisePath, protectedKind } from '../../../../plugins/agentic-qe-fleet/hooks/paths'
import {
  MOD_NAME,
  newStats,
  segmentText,
  STATUS_DIR_RULE,
  STATUS_MAX_BYTES,
  STATUS_PATH,
  statusPayload,
  statusText,
  SUMMARY,
} from '../../../../plugins/agentic-qe-fleet/hooks/status'
import { ATTACKS } from '../../../../plugins/agentic-qe-fleet/tests/corpus/attacks'
import { BENIGN } from '../../../../plugins/agentic-qe-fleet/tests/corpus/benign'

/** The ruflo console's reading rules (ruflo-console hooks/data/mods.ts), restated so a drift here fails. */
const CONSOLE = {
  dir: /^[a-z0-9][a-z0-9-]{0,40}-mod$/,
  maxBytes: 8192,
  version: /^[0-9][0-9A-Za-z.+-]{0,15}$/,
  summaryMax: 120,
  denyClasses: ['secret', 'destructive', 'path', 'network', 'policy', 'other'],
}

describe('aqe-mod guard: corpus', () => {
  it.each(ATTACKS.map(c => [c.name, c] as const))('refuses attack: %s', (_name, c) => {
    expect(judge(c.tool, c.input)?.cls).toBe('destructive')
  })

  it.each(BENIGN.map(c => [c.name, c] as const))('allows benign: %s', (_name, c) => {
    expect(judge(c.tool, c.input)).toBeUndefined()
  })
})

describe('aqe-mod guard: paths', () => {
  it('should classify the directory, data files and globs, and nothing else', () => {
    expect(protectedKind('.agentic-qe')).toBe('dir')
    expect(protectedKind('/abs/p/.agentic-qe/')).toBe('dir')
    expect(protectedKind('.agentic-qe/memory.db')).toBe('file')
    expect(protectedKind('.Agentic-QE/Memory.DB')).toBe('file')
    expect(protectedKind('--db=.agentic-qe/memory.db')).toBe('file')
    expect(protectedKind('.agentic-qe/*.db')).toBe('glob')
    expect(protectedKind('.agentic-qe/*.log')).toBeUndefined()
    expect(protectedKind('.agentic-qe/memory.db.bak-1')).toBeUndefined()
    expect(protectedKind('.agentic-qe/agents/x.db')).toBeUndefined()
    expect(protectedKind('memory.db')).toBeUndefined()
    expect(protectedKind('memory.db', true)).toBe('file')
  })

  it('should normalise dot segments before matching', () => {
    expect(normalisePath('src/../.agentic-qe/./memory.db')).toBe('.agentic-qe/memory.db')
    expect(normalisePath('a//b')).toBe('a/b')
  })

  it('should decide whether a glob can reach a data file', () => {
    expect(globReachesData('*')).toBe(true)
    expect(globReachesData('memory.*')).toBe(true)
    expect(globReachesData('*.db-[ws]??')).toBe(true)
    expect(globReachesData('*.yaml')).toBe(false)
  })

  it('should split compound commands at every separator', () => {
    expect(segments('a && b || c; d | e & f\ng $(h) `i`')).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'])
  })

  it('should let an empty or missing command through', () => {
    expect(judgeBash('')).toBeUndefined()
    expect(judge('Bash', { command: 42 })).toBeUndefined()
    expect(judge('Bash', null)).toBeUndefined()
  })
})

describe('aqe-mod status file: console contract', () => {
  it('should live in a folder the console lists', () => {
    expect(STATUS_DIR_RULE.source).toBe(CONSOLE.dir.source)
    expect(CONSOLE.dir.test(MOD_NAME)).toBe(true)
    expect(STATUS_PATH).toBe('.claude-flow/aqe-mod/status.json')
  })

  it('should write version 1 with the fields the console reads', () => {
    const stats = { ...newStats(), calls: 3, blocked: 1, lastDenied: 'destructive' as const, startedMs: 1000 }
    const p = statusPayload(stats, 'enforce', 2000)
    expect(p).toEqual({
      version: 1,
      modVersion: '0.1.0',
      summary: SUMMARY,
      guard: true,
      mode: 'enforce',
      calls: 3,
      blocked: 1,
      flagged: 0,
      lastDenied: 'destructive',
      startedMs: 1000,
      updatedMs: 2000,
    })
    expect(CONSOLE.version.test(p.modVersion)).toBe(true)
    expect(p.summary.length).toBeLessThanOrEqual(CONSOLE.summaryMax)
    expect(CONSOLE.denyClasses).toContain(p.lastDenied)
  })

  it('should stay well under the size cap and omit absent optional fields', () => {
    const text = statusText(newStats(), 'off', 1)
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(Math.min(STATUS_MAX_BYTES, CONSOLE.maxBytes))
    const parsed = JSON.parse(text) as Record<string, unknown>
    expect(parsed.guard).toBe(false)
    expect('lastDenied' in parsed).toBe(false)
    expect('startedMs' in parsed).toBe(false)
  })

  it('should never put a command, path or reason text in the file', () => {
    const text = statusText({ ...newStats(), blocked: 1, lastDenied: 'destructive' }, 'enforce', 1)
    expect(text).not.toMatch(/rm |memory\.db"|refused/)
  })

  it('should describe the mode in the status-bar segment', () => {
    expect(segmentText(newStats(), 'off')).toBe('aqe guard off')
    expect(segmentText({ ...newStats(), blocked: 2 }, 'enforce')).toBe('aqe enforce · 2 blocked')
    expect(segmentText(newStats(), 'notify').length).toBeLessThanOrEqual(48)
  })
})

describe('aqe-mod options and command', () => {
  it('should default the guard to enforce', () => {
    expect(readOptions(undefined).mode).toBe('enforce')
    expect(readOptions({ guardMode: 'notify' }).mode).toBe('notify')
    expect(readOptions({ guardMode: false }).mode).toBe('off')
  })

  it('should report unknown rather than invent MCP-only facts', async () => {
    const deps = { mode: 'enforce' as const, stats: newStats(), tools: async () => [] as string[], aqeDir: async () => null }
    expect(await answer('gate', deps)).toContain('verdict: unknown')
    const fleet = await answer('fleet', deps)
    expect(fleet).toContain('not found')
    expect(fleet).toContain('AQE MCP tools connected: none')
  })

  it('should say unknown when the tool list cannot be read', async () => {
    const deps = { mode: 'enforce' as const, stats: newStats(), tools: async () => Promise.reject(new Error('no')), aqeDir: async () => [] }
    expect(await answer('gate', deps)).toContain('connected: unknown')
  })
})
