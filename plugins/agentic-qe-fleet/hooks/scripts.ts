/**
 * The guard's view of commands that run code it can read: `sqlite3` (SQL and
 * dot-commands) and interpreter one-liners (`node -e`, `python3 -c`, heredocs).
 *
 * Each rule is scoped to its own segment: SQL is read only in a `sqlite3`
 * command (with the SQL piped or heredoc'd into it), and code only in an
 * interpreter command, so `grep -rn "DROP TABLE" src` next to `ls .agentic-qe`
 * is not a refusal. Pure: no `$`.
 */
import { isDataFileOrGlob, kindOf, pathTokens, textNamesData, textNamesDataFile, type Ctx } from './context'
import { baseName, DATA_FILE } from './paths'
import type { Segment } from './shell'

/** SQL that destroys rows, columns or schema, and sqlite dot-commands that replace the open database. */
export const DESTRUCTIVE_SQL =
  /\b(drop\s+(table|index|view|trigger)|delete\s+from|truncate(\s+table)?\s+\w|alter\s+table\s+\S+\s+drop\b)|(^|[\s"';])\.(restore|drop)\b/i

/** sqlite3 dot-commands that write a file named after them (`.backup FILE`, `.output FILE`). */
const DOT_WRITE = /(?:^|[\s;"'])\.(backup|save|output|once)\b([^\n;]*)/gi
/** sqlite3 dot-commands that run a shell command. */
const DOT_SHELL = /(?:^|[\s;"'])\.(shell|system)\b([^\n]*)/gi
const DOT_OPEN = /(^|[\s;"'])\.open\b/i

/** sqlite3 options that take a separate value. */
const SQLITE_VALUED = new Set(['-cmd', '-init', '-separator', '-newline', '-nullvalue', '-vfs', '-lookaside', '-pagecache', '-heap', '-mmap', '-maxsize', '-escape', '-A', '-pcachetrace'])

/** The index of the quote closing the one at `i` (a doubled quote is an escaped one), or the last index. */
function closing(s: string, i: number, q: string): number {
  for (let j = i + 1; ; ) {
    const k = s.indexOf(q, j)
    if (k === -1) return s.length - 1
    if (s[k + 1] !== q) return k
    j = k + 2
  }
}

/**
 * SQL as it runs: string literals emptied (text inside `'...'` never runs),
 * comments read as a space (`DELETE/**\/FROM` is `DELETE FROM`), and quoted
 * identifiers (`"..."`, `` `...` ``, `[...]`) kept but never taken for the start of a literal.
 */
export function sqlCode(sql: string): string {
  let out = ''
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i] as string
    if (c === "'") {
      out += "''"
      i = closing(sql, i, "'")
    } else if (c === '"' || c === '`') {
      const end = closing(sql, i, c)
      out += sql.slice(i, end + 1)
      i = end
    } else if (c === '[') {
      const end = sql.indexOf(']', i)
      const stop = end === -1 ? sql.length - 1 : end
      out += sql.slice(i, stop + 1)
      i = stop
    } else if (c === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i)
      out += ' '
      i = nl === -1 ? sql.length : nl - 1
    } else if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2)
      out += ' '
      i = end === -1 ? sql.length : end + 1
    } else out += c
  }
  return out
}

/** `sqlite3 DB [SQL...]`: destructive SQL on a learning database, or a dot-command writing over one. */
export function judgeSqlite(args: readonly string[], seg: Segment, ctx: Ctx): string | undefined {
  let readonly = false
  const operands: string[] = []
  const cmds: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (a === '-readonly' || a === '--readonly') readonly = true
    else if (a === '-cmd' || a === '--cmd') cmds.push(args[++i] ?? '')
    else if (SQLITE_VALUED.has(a) || SQLITE_VALUED.has(a.replace(/^--/, '-'))) i++
    else if (a.startsWith('-') && operands.length === 0) continue
    else operands.push(a)
  }
  const db = operands[0] ?? ''
  // A `file:` URI opened read-only (`?mode=ro`, `?immutable=1`) cannot change the store either.
  if (/^file:.*[?&](mode=ro|immutable=1)(&|#|$)/i.test(db)) readonly = true
  const sql = [...cmds, ...operands.slice(1), seg.stdin, seg.piped ? seg.upstream : ''].join('\n')

  // Dot-commands judged whatever the database: `.backup .agentic-qe/memory.db` from an empty one overwrites the store.
  for (const m of sql.matchAll(DOT_WRITE)) {
    const target = pathTokens(m[2] ?? '').filter(t => !t.startsWith('-'))
    const hit = target.find(t => isDataFileOrGlob(t, ctx))
    if (hit !== undefined) return `sqlite3 \`.${m[1] ?? ''}\` writes over ${hit}`
  }
  for (const m of sql.matchAll(DOT_SHELL)) {
    const what = ctx.bash(m[2] ?? '', ctx)
    if (what !== undefined) return `sqlite3 \`.${m[1] ?? ''}\` runs ${what}`
  }

  const opens = DOT_OPEN.test(sql) || /\battach\b/i.test(sql)
  const onData = isDataFileOrGlob(db, ctx) || (opens && textNamesDataFile(sql, ctx))
  if (!onData) return undefined
  // A read-only connection cannot change the store (its ATTACHed databases are read-only too); `.open` reopens read-write.
  if (readonly && !DOT_OPEN.test(sql)) return undefined
  return DESTRUCTIVE_SQL.test(sqlCode(sql)) ? 'destructive SQL (DROP/DELETE FROM/TRUNCATE/ALTER ... DROP/.restore) against an AQE learning database' : undefined
}

/** Interpreters whose one-liners and stdin scripts the guard reads. */
export const INTERPRETER = /^(node(js)?|deno|bun|tsx|ts-node|python[0-9.]*|pypy[0-9.]*|perl[0-9.]*|ruby[0-9.]*|php[0-9.]*|lua[0-9.]*|Rscript|julia|osascript)$/

/** In-language deletes, moves and overwrites (Node/Deno/Bun, Python, Perl, Ruby, PHP). Copies are judged by their destination instead. */
const CODE_DESTROY = new RegExp(
  [
    String.raw`\b(unlink|unlinkSync|rm|rmSync|rmdir|rmdirSync|rmtree|remove_tree|rename|renameSync|renames|writeFile|writeFileSync|appendFile|appendFileSync|truncate|truncateSync|ftruncate|ftruncateSync|createWriteStream|remove|removeSync|removedirs|emptyDir|emptyDirSync|outputFile|outputFileSync|move|moveSync|mv|writeTextFile|writeTextFileSync|file_put_contents|rm_rf|rm_r|rm_f|remove_entry|remove_dir|write_text|write_bytes)\s*\(`,
    String.raw`\b(os\.replace|File\.(write|delete|unlink|rename)|Files\.(delete|deleteIfExists|write|move)|Bun\.write|Deno\.(remove|rename|truncate|writeFile|writeTextFile)|FileUtils\.(?!cp\b|cp_r\b|copy\w*)\w+)\b`,
    // Perl's paren-less calls: unlink "x", rmtree $dir, rename $a, $b
    String.raw`\b(unlink|rmtree|remove_tree|rename|truncate)\s+["'$\x60]`,
    // open(path, 'w' | 'a' | 'r+' | 'x' ...) and Perl's open(F, '>', path) / open(F, ">path"); bounded, so it cannot backtrack far
    String.raw`\bopen(Sync)?\s*\([^)]{0,300}?['"\x60](?:[rbt]{0,3}[wax+][rwaxbt+]{0,4}|\+?>{1,2}[^'"\x60]{0,300})['"\x60]`,
  ].join('|'),
)
/** File copies: harmless from the store, destructive onto it. The second argument decides. */
const CODE_COPY = /\b(copyFile|copyFileSync|copyfile|copy2|copytree|cpSync|cp|shutil\.copy|Files\.copy|Deno\.copyFile(Sync)?|FileUtils\.(cp_r|cp|copy\w*))\s*\(/g
/** Python's `Path(...).replace(...)` / `str.replace` look alike; only Python's is taken as a move. */
const PY_REPLACE = /\.replace\s*\(/
/** Code that starts a process: its string arguments are read as a shell command. */
const SPAWN = /\b(system|exec|execSync|execFile|execFileSync|spawn|spawnSync|popen|Popen|check_call|check_output|call|run|Command|shell_exec|passthru)\s*\(|`|\bqx\b/

/** String literals in code (single, double, backtick). */
const literals = (code: string): string[] => [...code.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map(m => m[1] ?? m[2] ?? m[3] ?? '')

/** A call's top-level arguments, from just past its `(` (bounded scan). */
function callArgs(code: string, from: number): string[] {
  const args: string[] = []
  let depth = 0
  let cur = ''
  let quote: string | undefined
  for (let i = from; i < code.length && i < from + 2000; i++) {
    const c = code[i] as string
    if (quote !== undefined) {
      if (c === '\\') cur += c + (code[++i] ?? '')
      else {
        if (c === quote) quote = undefined
        cur += c
      }
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if (c === '(' || c === '[' || c === '{') depth++
    else if ((c === ')' || c === ']' || c === '}') && depth-- === 0) break
    else if (c === ',' && depth === 0) {
      args.push(cur.trim())
      cur = ''
      continue
    }
    cur += c
  }
  if (cur.trim() !== '') args.push(cur.trim())
  return args
}

/** A plain string-literal argument's text (`'x'`, `"x"`, `dst='x'`), or undefined when it is computed. */
const literalArg = (arg: string | undefined): string | undefined => {
  const m = /^(?:\w+\s*=\s*)?(['"])([^'"\\$`{}]*)\1$/.exec(arg ?? '')
  return m === null ? undefined : m[2]
}

/** The first copy call that writes onto learning data, or whose destination cannot be read while the code names data. */
function copyOntoData(code: string, ctx: Ctx): string | undefined {
  for (const m of code.matchAll(CODE_COPY)) {
    const args = callArgs(code, (m.index ?? 0) + m[0].length)
    if (args.length < 2) continue
    const dest = literalArg(args[1])
    if (dest === undefined) return `\`${m[1] ?? 'copy'}\` to a computed destination`
    const kind = kindOf(dest, ctx)
    const src = literalArg(args[0]) ?? ''
    if (kind === 'file' || kind === 'glob') return `\`${m[1] ?? 'copy'}\` onto ${dest}`
    if (kind === 'dir' && (DATA_FILE.test(baseName(src)) || /tree|cp_r|cpSync|^cp$/.test(m[1] ?? ''))) return `\`${m[1] ?? 'copy'}\` into ${dest}`
  }
  return undefined
}

/** `node -e`, `python3 -c`, `perl -pi`, heredoc'd scripts: code that names learning data and deletes, moves or overwrites. */
export function judgeInterpreter(verb: string, args: readonly string[], seg: Segment, ctx: Ctx): string | undefined {
  // perl -pi -e / ruby -i: in-place edit of the named files.
  if (/^(perl|ruby)/.test(verb) && args.some(a => /^-[a-zA-Z]*i/.test(a))) {
    const hit = args.find(a => !a.startsWith('-') && isDataFileOrGlob(a, ctx))
    if (hit !== undefined) return `\`${verb} -i\` edits ${hit} in place`
  }
  const code = [...args, seg.stdin, seg.piped ? seg.upstream : ''].join('\n')
  if (!textNamesData(code, ctx)) return undefined
  if (CODE_DESTROY.test(code) || (/^(python|pypy)/.test(verb) && PY_REPLACE.test(code))) return `a \`${verb}\` script deletes, moves or overwrites AQE learning data`
  const copy = copyOntoData(code, ctx)
  if (copy !== undefined) return `a \`${verb}\` script runs ${copy}`
  // SQL in code lives inside string literals, so the code is read whole (comments as spaces).
  if (DESTRUCTIVE_SQL.test(code.replace(/\/\*[\s\S]*?\*\//g, ' '))) return `a \`${verb}\` script runs destructive SQL against an AQE learning database`
  if (SPAWN.test(code)) {
    const lits = literals(code)
    const what = ctx.bash(lits.join(' '), ctx) ?? lits.map(l => ctx.bash(l, ctx)).find(w => w !== undefined)
    if (what !== undefined) return `a \`${verb}\` script runs ${what}`
  }
  return undefined
}
