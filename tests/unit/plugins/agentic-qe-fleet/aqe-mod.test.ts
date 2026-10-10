/**
 * aqe-mod (plugins/agentic-qe-fleet/hooks): the pure guard and the status
 * payload, run under the repo's vitest. The engine-level tests (hooks wired
 * through `$`) live in plugins/agentic-qe-fleet/tests and run with
 * `claude plugin test plugins/agentic-qe-fleet`.
 */
import { describe, expect, it } from 'vitest'

import { answer } from '../../../../plugins/agentic-qe-fleet/hooks/command'
import { fallbackVerdict, GUARD_FAILED, judge, judgeBash, segments } from '../../../../plugins/agentic-qe-fleet/hooks/guard'
import { readOptions } from '../../../../plugins/agentic-qe-fleet/hooks/options'
import { globMatch } from '../../../../plugins/agentic-qe-fleet/hooks/glob'
import { globReachesData, MAX_PATH, normalisePath, protectedKind } from '../../../../plugins/agentic-qe-fleet/hooks/paths'
import { expandVars } from '../../../../plugins/agentic-qe-fleet/hooks/context'
import { BRACE_MAX_DEPTH, BRACE_MAX_LENGTH, expandBraces, parse, readAnsiC } from '../../../../plugins/agentic-qe-fleet/hooks/shell'
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
    expect(normalisePath('./memory.db')).toBe('memory.db')
    expect(normalisePath('./')).toBe('.')
    expect(normalisePath('./../x')).toBe('../x')
    expect(protectedKind('./memory.db', true)).toBe('file')
    expect(protectedKind('./*', true)).toBe('glob')
  })

  it('should treat a glob component that can match the directory as the directory', () => {
    expect(protectedKind('.agentic*')).toBe('dir')
    expect(protectedKind('.[a]gentic-qe/memory.db')).toBe('file')
    expect(protectedKind('.*')).toBe('dir')
    expect(protectedKind('*')).toBeUndefined()
    expect(protectedKind('.eslint*')).toBeUndefined()
  })

  it('should not protect backup-named copies', () => {
    expect(protectedKind('.agentic-qe/memory-backup-20261009.db')).toBeUndefined()
    expect(protectedKind('.agentic-qe/memory.bak.db')).toBeUndefined()
    expect(protectedKind('.agentic-qe/memory.db')).toBe('file')
    expect(protectedKind('.agentic-qe/bakery.db')).toBe('file')
  })

  it('should protect every .agentic-qe, a temp-directory fixture included, root or not (review B1/B2)', () => {
    for (const scope of [undefined, { root: '/work/p' }]) {
      expect(judge('Bash', { command: 'rm -rf /tmp/fixture/.agentic-qe' }, scope)?.cls).toBe('destructive')
      expect(judge('Write', { file_path: '/tmp/fixture/.agentic-qe/memory.db' }, scope)?.cls).toBe('destructive')
      expect(judge('Bash', { command: 'rm /home/dev/other/.agentic-qe/memory.db' }, scope)?.cls).toBe('destructive')
    }
  })

  it('should refuse the CLAUDE.md restore flow in enforce mode, by design (review O3)', () => {
    expect(judge('Bash', { command: 'cp .agentic-qe/memory.db.bak-1700000000 .agentic-qe/memory.db' })?.cls).toBe('destructive')
    expect(judge('Bash', { command: 'rm -f .agentic-qe/memory.db-wal .agentic-qe/memory.db-shm' })?.cls).toBe('destructive')
  })

  it('should guard Monitor and PowerShell commands and nothing else new', () => {
    expect(judge('Monitor', { command: 'rm -f .agentic-qe/memory.db' })?.cls).toBe('destructive')
    expect(judge('PowerShell', { command: 'Remove-Item .agentic-qe\\memory.db' })?.cls).toBe('destructive')
    expect(judge('Monitor', { ws: { url: 'wss://x' } })).toBeUndefined()
    expect(judge('Grep', { pattern: 'rm .agentic-qe/memory.db' })).toBeUndefined()
  })

  it('should decide whether a glob can reach a data file', () => {
    expect(globReachesData('*')).toBe(true)
    expect(globReachesData('memory.*')).toBe(true)
    expect(globReachesData('*.db-[ws]??')).toBe(true)
    expect(globReachesData('*.yaml')).toBe(false)
  })

  it('should split compound commands at every separator, substitutions first and kept in their word', () => {
    expect(segments('a && b || c; d | e & f\ng $(h) `i`')).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'h', 'i', 'g $(h) `i`'])
  })

  it('should keep quoted words and command substitutions whole', () => {
    const [sub, rm] = parse('rm "$(pwd)/.agentic-qe/memory.db"')
    expect(sub?.words).toEqual(['pwd'])
    expect(rm?.words).toEqual(['rm', '$(pwd)/.agentic-qe/memory.db'])
    expect(parse("grep -rn 'x > y' src")[0]?.redirects).toEqual([])
    expect(parse('echo x 2>/dev/null >> out.txt')[0]?.redirects).toEqual([
      { op: '>', target: '/dev/null' },
      { op: '>>', target: 'out.txt' },
    ])
  })

  it('should feed heredocs and earlier pipeline stages to a command', () => {
    const segs = parse('cat <<EOF | sqlite3 db\nDELETE FROM t;\nEOF\nls')
    expect(segs.map(s => s.words[0])).toEqual(['cat', 'sqlite3', 'ls'])
    expect(segs[0]?.stdin).toContain('DELETE FROM t;')
    expect(segs[1]?.piped).toBe(true)
    expect(segs[1]?.upstream).toContain('DELETE FROM t;')
    expect(segs[2]?.piped).toBe(false)
  })

  it('should expand braces as bash does, falling back to a glob past the limit', () => {
    expect(expandBraces('memory.db{,-wal,-shm}')).toEqual(['memory.db', 'memory.db-wal', 'memory.db-shm'])
    expect(expandBraces('{a,{b,c}}.db')).toEqual(['a.db', 'b.db', 'c.db'])
    expect(expandBraces('x{1..3}')).toEqual(['x1', 'x2', 'x3'])
    expect(expandBraces('${HOME}/{}')).toEqual(['${HOME}/{}'])
    const many = `.agentic-qe/{${Array.from({ length: 300 }, (_, i) => `n${i}`).join(',')},memory.db}`
    expect(expandBraces(many).some(w => protectedKind(w) !== undefined)).toBe(true)
  })

  it('should let an empty or missing command through', () => {
    expect(judgeBash('')).toBeUndefined()
    expect(judge('Bash', { command: 42 })).toBeUndefined()
    expect(judge('Bash', null)).toBeUndefined()
  })
})

describe('aqe-mod guard: .catch handler decision (fail closed)', () => {
  const throwing = {
    get command(): string {
      throw new Error('unreadable input')
    },
  }

  it('should refuse in enforce what the pure check refuses and pass the rest', () => {
    expect(fallbackVerdict('enforce', 'Bash', { command: 'rm .agentic-qe/memory.db' }, false, 're-entry')?.deny).toContain('aqe-mod refused this')
    expect(fallbackVerdict('enforce', 'Bash', { command: 'ls .agentic-qe' }, false, 're-entry')).toBeUndefined()
  })

  it('should refuse outright when the check itself throws on a re-entry', () => {
    expect(fallbackVerdict('enforce', 'Bash', throwing, false, 're-entry')).toEqual({ deny: GUARD_FAILED })
  })

  it('should refuse a hook that threw or overran without running the judge again', () => {
    let reads = 0
    const counted = {
      get command(): string {
        reads++
        return 'ls'
      },
    }
    expect(fallbackVerdict('enforce', 'Bash', counted, false, 'timeout')).toEqual({ deny: GUARD_FAILED })
    expect(fallbackVerdict('enforce', 'Bash', counted, false, 'throw')).toEqual({ deny: GUARD_FAILED })
    expect(reads).toBe(0)
  })

  it('should replay next when it already ran, and never refuse in notify or off', () => {
    expect(fallbackVerdict('enforce', 'Bash', throwing, true, 'throw')).toBeUndefined()
    expect(fallbackVerdict('notify', 'Bash', { command: 'rm .agentic-qe/memory.db' }, false, 'timeout')).toBeUndefined()
    expect(fallbackVerdict('off', 'Bash', throwing, false, 're-entry')).toBeUndefined()
  })
})

describe('aqe-mod guard: bounded cost (review B5)', () => {
  const stars = (n: number) => '*'.repeat(n)
  const deepSubst = (n: number) => `${'echo $('.repeat(n)}rm .agentic-qe/memory.db${')'.repeat(n)}`
  const cases: Array<[string, string, 'refused' | 'allowed' | 'either']> = [
    ['rm with 20 stars', `rm .agentic-qe/${stars(20)}x`, 'either'],
    ['rm with 200 stars', `rm .agentic-qe/${stars(200)}x`, 'either'],
    ['find -name with 20 stars', `find . -name "${stars(20)}x" -delete`, 'either'],
    ['find -name with 200 stars', `find . -name "${stars(200)}x" -delete`, 'either'],
    ['find -path with 200 stars', `find . -path "${stars(200)}x" -delete`, 'either'],
    ['git clean -e with 200 stars', `git clean -fdx -e "${stars(200)}x"`, 'either'],
    ['200 nested $(', deepSubst(200), 'refused'],
    ['2000 nested $(', deepSubst(2000), 'refused'],
    ['10k true;', 'true; '.repeat(10_000), 'allowed'],
    ['10k-stage pipeline', `${'cat x | '.repeat(10_000)}cat`, 'allowed'],
    ['10k redirects', 'echo x 2>/dev/null '.repeat(10_000), 'allowed'],
    ['long open( with many quotes', `node -e "open(${"'a',".repeat(5000)} .agentic-qe/memory.db"`, 'either'],
    // third review (6c8d8187) P1-P3 and other bombs
    ['P1 for over 32 words, 5 x $V', `for V in ${Array.from({ length: 32 }, (_, i) => `w${i}`).join(' ')}; do rm ${'$V'.repeat(5)}; done`, 'either'],
    ['P1 for over 32 words, 50 x $V', `for V in ${Array.from({ length: 32 }, (_, i) => `w${i}`).join(' ')}; do rm ${'$V'.repeat(50)}; done`, 'either'],
    ['P1 50 x $V under the directory', `for V in a b c; do rm .agentic-qe/${'$V'.repeat(50)}; done`, 'refused'],
    ['P2 20000 nested braces', `rm x${'{'.repeat(20_000)}a,b${'}'.repeat(20_000)}`, 'either'],
    ['P2 60000 nested braces', `rm x${'{'.repeat(60_000)}a,b${'}'.repeat(60_000)}`, 'either'],
    ['P2 60000 nested braces under the directory', `rm .agentic-qe/${'{'.repeat(60_000)}a,b${'}'.repeat(60_000)}`, 'refused'],
    ['P3 80000 escaped quotes in a literal', `python3 -c "os.system('.agentic-qe/' ${"'\\\\".repeat(80_000)}"`, 'either'],
    ['10000 nested ${a:-', `rm ${'${a:-'.repeat(10_000)}x${'}'.repeat(10_000)}`, 'either'],
    ['100000 open brackets', `rm .agentic-qe/${'['.repeat(100_000)}`, 'either'],
    ['extglob with 50000 alternatives', `rm .agentic-@(${'a|'.repeat(50_000)}qe)`, 'refused'],
    ['POSIX classes x 20000', `rm .agentic-qe/${'[[:alpha:]]'.repeat(20_000)}`, 'either'],
    // fourth review: a value that doubles 28 times, and substitutions classified on every word
    ['a value doubled 28 times', `X0=ab; ${Array.from({ length: 28 }, (_, i) => `X${i + 1}="$X${i}$X${i}"`).join('; ')}; rm -rf $X28`, 'either'],
    ['1000 words each a $(find ...)', `rm ${"$(find . -name '*.tmp') ".repeat(1000)}`, 'allowed'],
    // seventh review: here-strings replay the line's assignments once, not per segment
    ['10k here-strings after assignments', 'd=x; read -r f <<< "$d"; '.repeat(10_000), 'allowed'],
  ]

  // The median of 5 runs under 250 ms: one slow run, or two suites sharing the CPU, does not fail the test; a real bomb
  // (exponential or quadratic) takes seconds on every run.
  it.each(cases)('should judge %s in under 250 ms (median of 5)', (_name, command, expected) => {
    judge('Bash', { command: 'ls' })
    const times: number[] = []
    let r: ReturnType<typeof judge>
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now()
      r = judge('Bash', { command })
      times.push(performance.now() - t0)
    }
    expect(times.sort((a, b) => a - b)[2]).toBeLessThan(250)
    if (expected === 'refused') expect(r?.cls).toBe('destructive')
    if (expected === 'allowed') expect(r).toBeUndefined()
  })

  it('should refuse a command too long to read', () => {
    expect(judge('Bash', { command: `echo ${'a'.repeat(300 * 1024)}` })?.reason).toContain('too long')
  })

  it('should match globs linearly, `*` stopping at `/` unless asked', () => {
    expect(globMatch('*.db', 'memory.db')).toBe(true)
    expect(globMatch('*', 'a/b')).toBe(false)
    expect(globMatch('*', 'a/b', true)).toBe(true)
    expect(globMatch('memory.d[!x]', 'memory.db')).toBe(true)
    expect(globMatch('memory.d[a-c]', 'memory.db')).toBe(true)
    expect(globMatch('.AGENTIC*', '.agentic-qe')).toBe(true)
    expect(globMatch(`${stars(500)}x`, 'y'.repeat(500))).toBe(false)
  })

  it('should read unresolved expansions as `*` and stay within the word budget (third review B4/P1)', () => {
    const none = new Map<string, readonly string[]>()
    expect(expandVars('.agentic-qe/$DB', none)).toEqual(['.agentic-qe/*'])
    expect(expandVars('.agentic-q${X}e', none)).toEqual(['.agentic-q*e'])
    expect(expandVars('${X:-.agentic-qe}', none)).toEqual(['.agentic-qe', '*'])
    expect(expandVars('a$(pwd)b`date`c$@', none)).toEqual(['a*b*c*'])
    expect(expandVars('$V$V$V', new Map([['V', ['x', 'y']]]))).toHaveLength(8)
    const big = new Map([['V', Array.from({ length: 32 }, (_, i) => `w${i}`)]])
    expect(expandVars('$V'.repeat(50), big)).toEqual(['*'.repeat(50)])
  })

  it('should read past-limit words as the glob they cover (fail closed)', () => {
    const long = `x{a,b}${'y'.repeat(BRACE_MAX_LENGTH)}`
    expect(expandBraces(long)).toEqual([`x*${'y'.repeat(BRACE_MAX_LENGTH)}`])
    const deep = `x${'{'.repeat(BRACE_MAX_DEPTH + 1)}a,b${'}'.repeat(BRACE_MAX_DEPTH + 1)}`
    expect(expandBraces(deep)).toEqual(['x*'])
    expect(protectedKind(`.agentic-qe/${'x'.repeat(MAX_PATH)}`)).toBe('glob')
    expect(judge('Bash', { command: `rm .agentic-qe/${'x'.repeat(MAX_PATH)}` })?.cls).toBe('destructive')
  })

  it('should refuse a script with more path-like literals than it reads', () => {
    const lits = Array.from({ length: 70 }, (_, i) => `'.agentic-qe/n${i}'`).join(', ')
    expect(judge('Bash', { command: `python3 -c "import os; os.chdir('.agentic-qe'); os.system(' '.join([${lits}]))"` })?.reason).toContain('more commands than the guard reads')
  })

  it('should refuse text mentioning agentic past the eval/bash -c depth it follows', () => {
    expect(judge('Bash', { command: `${'eval '.repeat(8)}touch .agentic-qeX` })?.reason).toContain('nested too deeply')
    expect(judge('Bash', { command: `${'eval '.repeat(8)}touch notes.txt` })).toBeUndefined()
    expect(judge('Bash', { command: `${'eval '.repeat(3)}touch .agentic-qeX` })).toBeUndefined()
  })

  it('should fail fast on a run of unclosable brackets', () => {
    const t0 = performance.now()
    expect(globMatch(`${'['.repeat(100_000)}x`, 'y')).toBe(false)
    expect(performance.now() - t0).toBeLessThan(250)
  })

  it('should not overflow the stack on a unit with very many values (fifth review)', () => {
    const many = new Map([['V', Array.from({ length: 200_000 }, (_, i) => `v${i}`)]])
    expect(() => expandVars('$V', many)).not.toThrow()
    expect(expandVars('$V', many)[0]).toBe('*')
  })

  it('should decode ANSI-C quoting as bash does', () => {
    expect(readAnsiC("\\x2eagentic-qe'", 0).text).toBe('.agentic-qe')
    expect(readAnsiC("\\056agentic-qe'", 0).text).toBe('.agentic-qe')
    expect(readAnsiC("a\\nb\\'c'", 0).text).toBe("a\nb'c")
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
