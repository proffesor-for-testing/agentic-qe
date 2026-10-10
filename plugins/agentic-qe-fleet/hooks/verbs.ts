/**
 * The guard's rules for one simple shell command, by its command word.
 * Pure: no `$`. Nested shell text (`bash -c`, `eval`, heredocs) goes back
 * through `ctx.bash`, so every rule applies at any depth.
 */
import { isVerb, SHELLS, verbName } from './commands'
import { expandWords, isData, isDataFileOrGlob, textNamesData, type Ctx } from './context'
import { judgeFind } from './find'
import { hasGlob, MAX_PATH, underAqe } from './paths'
import { fedByProducer, opaqueScript } from './producers'
import { INTERPRETER, judgeInterpreter, judgeSqlite } from './scripts'
import { commandStart, expandBraces, isOption, type Segment } from './shell'
import { judgeGit, judgeWriters } from './writers'

export { isVerb } from './commands'

const WRITE_OPS = new Set(['>', '>>', '>|', '&>', '&>>', '<>'])

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

/** `NAME=value` words before the command word, and `for NAME in ...`, `read NAME`: remembered for `$NAME`. */
function bindVars(ws: readonly string[], start: number, seg: Segment, ctx: Ctx): void {
  // An assignment's word may have expanded to several alternatives (`DB=$(ls ...)`): the variable may hold any of them.
  const assigned = new Map<string, string[]>()
  for (const w of ws.slice(0, start)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(w)
    if (m !== null) assigned.set(m[1] as string, [...(assigned.get(m[1] as string) ?? []), remembered(m[2] as string)])
  }
  for (const [name, values] of assigned) ctx.vars.set(name, [...new Set(values)])
  const verb = ws[start]
  if (verb === 'export' || verb === 'local' || verb === 'declare' || verb === 'readonly' || verb === 'typeset') bindVars(ws.slice(start + 1), ws.length - start - 1, seg, ctx)
  if ((verb === 'for' || verb === 'select') && ws[start + 2] === 'in') ctx.vars.set(ws[start + 1] as string, ws.slice(start + 3).flatMap(w => expandBraces(w)).map(remembered))
  // `read f` holds whatever was piped or `< <(...)`-fed in: unknown (`*`), plus the store when that feed may be it.
  if (verb === 'read') {
    const piped = seg.piped ? (seg.upstream.split(/\s+/).find(w => isData(w, ctx)) ?? (fedByProducer(seg, ctx) ? '.agentic-qe/memory.db' : undefined)) : undefined
    const fed = [...(piped === undefined ? [] : [piped]), ...(ctx.readFed ?? []), '*']
    for (const name of ws.slice(start + 1).filter(w => !isOption(w))) ctx.vars.set(name, [...new Set(fed)])
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
    return ctx.bash(command, ctx)
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
  // Paths a `find`/`ls -A`/`git ls-files -o` stage would print count as named here (`xargs rm`, `while read f`).
  if (seg.piped && fedByProducer(seg, ctx)) ctx.mentionsData = true
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
