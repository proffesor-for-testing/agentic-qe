/**
 * The guard's rules for one simple shell command, by its command word.
 * Pure: no `$`. Nested shell text (`bash -c`, `eval`, heredocs) goes back
 * through `ctx.bash`, so every rule applies at any depth.
 */
import { isVerb, SHELLS, verbName } from './commands'
import { expandVars, expandWords, isData, isDataFileOrGlob, textNamesData, WORD_BUDGET, type Ctx } from './context'
import { judgeFind } from './find'
import { hasGlob, MAX_PATH, underAqe } from './paths'
import { fedByProducer, opaqueScript } from './producers'
import { INTERPRETER, judgeInterpreter, judgeSqlite } from './scripts'
import { commandStart, expandBraces, isOption, type Segment } from './shell'
import { judgeGit, judgeWriters } from './writers'

export { isVerb } from './commands'

const WRITE_OPS = new Set(['>', '>>', '>|', '&>', '&>>', '<>'])
/** Commands that read names (or a script) from stdin: a feed matters to them. */
const FEED_CONSUMERS = /(^|\/)(xargs|parallel|read|mapfile|readarray|bash|sh|zsh|dash|ksh|fish|eval)$/

/**
 * `cd`/`pushd`: entering `.agentic-qe` makes bare `memory.db` the store; leaving it does the
 * opposite. A target the guard cannot resolve (`cd "$DIR"`, `cd $(dirname ...)`) may be it.
 */
function changeDir(targets: readonly string[], ctx: Ctx): void {
  const target = targets[0]
  if (targets.some(t => underAqe(t) || (hasGlob(t) && t !== '-'))) ctx.inAqe = true
  else if (target === undefined || target === '~' || target === '-' || target.startsWith('/') || target.startsWith('~')) ctx.inAqe = false
  else if (target === '..' || target.startsWith('../')) ctx.inAqe = false
}

/** A value as it is remembered: one too long to be a path reads as `*`, so values cannot grow without bound. */
const remembered = (v: string): string => (v.length > MAX_PATH ? '*' : v)

/** A word as the shell expands it here (variables, arrays, substitutions). */
const expanded = (w: string, ctx: Ctx): string[] => expandVars(w, ctx.vars, WORD_BUDGET, inner => ctx.subst(inner, ctx))

/**
 * What may reach this command's stdin that names the store: the expanded words of earlier
 * pipeline stages (`echo "$dbs" | xargs rm`), a producer that lists it (`find ... | xargs rm`),
 * here-strings (`<<< "$(find ...)"`), and a `< <(...)` on the line.
 */
function feedValues(seg: Segment, ctx: Ctx): string[] {
  const out: string[] = []
  if (seg.piped) {
    for (const stage of seg.stages) for (const w of stage) out.push(...expanded(w, ctx).filter(v => isData(v, ctx)))
    if (fedByProducer(seg, ctx)) out.push('.agentic-qe/memory.db', '.agentic-qe')
  }
  for (const w of seg.hereStrings ?? []) out.push(...expanded(w, ctx).filter(v => isData(v, ctx)))
  return out
}

/** `NAME=value` words before the command word, and `for NAME in ...`, `read NAME`: remembered for `$NAME`. */
function bindVars(ws: readonly string[], start: number, seg: Segment, ctx: Ctx): void {
  // An assignment's word may have expanded to several alternatives (`DB=$(ls ...)`): the variable may hold any of them.
  // An array (`arr=(a $(find ...))`) holds each of its elements; `NAME+=...` adds to what NAME held.
  const assigned = new Map<string, string[]>()
  for (const w of ws.slice(0, start)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)(\+?)=(.*)$/s.exec(w)
    if (m === null) continue
    const name = m[1] as string
    const value = m[3] as string
    const array = /^\(([\s\S]*)\)$/.exec(value)
    // Elements keep their quotes inside the word (`files+=("$f")`): unquote each one.
    const values = array === null ? [value] : (array[1] as string).split(/\s+/).filter(v => v !== '').map(v => v.replace(/^(['"])([\s\S]*)\1$/, '$2'))
    const before = assigned.get(name) ?? (m[2] === '+' ? [...(ctx.vars.get(name) ?? [])] : [])
    // `arr+=(x)` adds elements; `s+=x` extends the string (`P=.agentic; P+=-qe`).
    const added = array !== null || m[2] !== '+' || before.length === 0 ? [...before, ...values] : before.map(b => b + value)
    assigned.set(name, added.map(remembered))
  }
  for (const [name, values] of assigned) ctx.vars.set(name, [...new Set(values)])
  const verb = ws[start]
  if (verb === 'export' || verb === 'local' || verb === 'declare' || verb === 'readonly' || verb === 'typeset') bindVars(ws.slice(start + 1), ws.length - start - 1, seg, ctx)
  if ((verb === 'for' || verb === 'select') && ws[start + 2] === 'in') ctx.vars.set(ws[start + 1] as string, ws.slice(start + 3).flatMap(w => expandBraces(w)).map(remembered))
  // `read f`, `mapfile -t arr`, `readarray arr` hold whatever is fed in: unknown (`*`), plus the store when the feed may be it.
  if (verb === 'mapfile' || verb === 'readarray' || verb === 'read') {
    const fed = [...new Set([...feedValues(seg, ctx), ...(ctx.readFed ?? []), '*'])]
    // Options that take a value differ: `mapfile -t` is a flag, `read -t 5` a timeout.
    const valued = verb === 'read' ? /^-[dnNptui]$/ : /^-[dnOsuCc]$/
    const names = ws.slice(start + 1).filter((w, i, all) => !isOption(w) && !valued.test(all[i - 1] ?? ''))
    if (verb === 'read') for (const name of names) ctx.vars.set(name, fed)
    else ctx.vars.set(names[names.length - 1] ?? 'MAPFILE', fed)
  }
}

/** The raw (unexpanded) word after a shell's `-c` flag, or the words after `eval`. */
function rawScripts(seg: Segment): readonly string[] {
  const at = commandStart(seg.words, isVerb)
  const rest = seg.words.slice(at + 1)
  if (verbName(seg.words[at] ?? '') === 'eval') return rest
  const c = rest.findIndex(a => /^-[A-Za-z]*c[A-Za-z]*$/.test(a))
  return c === -1 ? [] : rest.slice(c + 1, c + 2)
}

/** `bash -c CMD`, `bash -lc CMD`, `sh -ec CMD`, `eval ...`, `bash <<EOF`, `... | sh`. */
function judgeShell(verb: string, args: readonly string[], seg: Segment, ctx: Ctx, viaXargs: boolean): string | undefined {
  // A script that is wholly an unknown expansion (`bash -c "$(... | base64 -d)"`, `eval "$CMD"`) cannot be read: refuse.
  if (rawScripts(seg).some(w => opaqueScript(w, ctx))) return `\`${verb}\` runs a script the guard cannot read`
  if (verb === 'eval') return ctx.bash(args.join(' '), ctx)
  let command: string | undefined
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (/^[-+][oO]$/.test(a)) i++
    else if (/^-[A-Za-z]*c[A-Za-z]*$/.test(a)) {
      command = args.slice(i + 1).find(x => !isOption(x)) ?? ''
      break
    } else if (!isOption(a)) break
  }
  if (command !== undefined) {
    if (viaXargs && ctx.mentionsData) return `\`xargs ${verb} -c\` fed learning-data paths`
    // The script as written: prefix assignments (`D=.agentic-qe bash -c 'rm -rf $D'`) are bound by now,
    // so the inner judge expands `$D` itself; the outer expansion read it as unknown.
    return ctx.bash(rawScripts(seg)[0] ?? command, ctx)
  }
  // A heredoc the guard cannot see the end of is a script it cannot read.
  if (seg.opaqueStdin) return `\`${verb}\` reads a script the guard cannot see`
  if (seg.stdin !== '') {
    const what = ctx.bash(seg.stdin, ctx)
    if (what !== undefined) return what
  }
  if (seg.piped && seg.upstream.split(/\s+/).some(w => isData(w, ctx))) return `a script piped into \`${verb}\` names learning data`
  return undefined
}

/** One simple command's refusal, or undefined. */
export function judgeSegment(seg: Segment, ctx: Ctx, viaXargs = false): string | undefined {
  // Text nested past what the reader follows is not judged piecemeal: it is refused when it names learning data.
  if (seg.dropped !== undefined) return /agentic/i.test(seg.dropped) || textNamesData(seg.dropped, ctx) ? 'a command nested too deeply to read names learning data' : undefined
  // What a pipe, producer or here-string feeds in counts as named here (`xargs rm`, `while read f`).
  // Only commands that take names on stdin need it, so most pipeline stages skip the work.
  const consumes = seg.words.some(w => FEED_CONSUMERS.test(w))
  if (consumes && (seg.piped || (seg.hereStrings ?? []).length > 0) && feedValues(seg, ctx).length > 0) ctx.mentionsData = true
  const ws = expandWords(seg, ctx)
  const start = commandStart(ws, isVerb)
  bindVars(ws, start, seg, ctx)

  const redirect = seg.redirects.find(r => WRITE_OPS.has(r.op) && isDataFileOrGlob(r.target, ctx))
  if (redirect !== undefined) return `a shell redirect overwrites ${redirect.target}`
  if (start >= ws.length) return undefined

  const verb = verbName(ws[start] as string)
  const args = ws.slice(start + 1)
  const piped = viaXargs || ws.slice(0, start).some(w => verbName(w) === 'xargs' || verbName(w) === 'parallel')

  if (verb === 'cd' || verb === 'pushd') {
    changeDir(args.filter(a => !isOption(a)), ctx)
    return undefined
  }
  if (SHELLS.has(verb) || verb === 'eval') return judgeShell(verb, args, seg, ctx, piped)
  // `pwsh -c ...` / `powershell -Command ...` from a shell: the PowerShell rules read it.
  if (/^(pwsh|powershell)(\.exe)?$/i.test(verb)) {
    const c = args.findIndex(a => /^-(c|command|encodedcommand|ec|e)$/i.test(a))
    if (c === -1) return seg.opaqueStdin || seg.piped ? `\`${verb}\` reads a script the guard cannot see` : undefined
    if (/^-(encodedcommand|ec|e)$/i.test(args[c] as string)) return `\`${verb} -EncodedCommand\` runs a script the guard cannot read`
    return ctx.pwsh(args.slice(c + 1).join(' '), ctx)
  }
  if (verb === 'su') {
    const c = args.findIndex(a => a === '-c' || a === '--command')
    return c === -1 ? undefined : ctx.bash(args[c + 1] ?? '', ctx)
  }
  if (verb === 'sqlite3' || verb === 'sqlite') return judgeSqlite(args, seg, ctx)
  if (INTERPRETER.test(verb)) return judgeInterpreter(verb, args, seg, ctx)
  if (verb === 'find') return judgeFind(args, ctx)
  if (verb === 'git') return judgeGit(args, ctx)
  return judgeWriters(verb, args, ctx, piped)
}
