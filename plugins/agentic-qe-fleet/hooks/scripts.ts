/**
 * The guard's view of commands that run code it can read: `sqlite3` (SQL and
 * dot-commands) and interpreter one-liners (`node -e`, `python3 -c`, heredocs).
 *
 * Each rule is scoped to its own segment: SQL is read only in a `sqlite3`
 * command (with the SQL piped or heredoc'd into it), and code only in an
 * interpreter command, so `grep -rn "DROP TABLE" src` next to `ls .agentic-qe`
 * is not a refusal. Pure: no `$`.
 */
import { isDataFileOrGlob, pathTokens, textNamesData, textNamesDataFile, type Ctx } from './context'
import type { Segment } from './shell'

/** SQL that destroys rows, columns or schema, and sqlite dot-commands that replace the open database. */
export const DESTRUCTIVE_SQL =
  /\b(drop\s+(table|index|view|trigger)|delete\s+from|truncate(\s+table)?\s+\w|alter\s+table\s+\S+\s+drop\b)|(^|[\s"';])\.(restore|drop)\b/i

/** sqlite3 dot-commands that write a file named after them (`.backup FILE`, `.output FILE`). */
const DOT_WRITE = /(?:^|[\s;"'])\.(backup|save|output|once)\b([^\n;]*)/gi
/** sqlite3 dot-commands that run a shell command. */
const DOT_SHELL = /(?:^|[\s;"'])\.(shell|system)\b([^\n]*)/gi

/** sqlite3 options that take a separate value. */
const SQLITE_VALUED = new Set(['-cmd', '-init', '-separator', '-newline', '-nullvalue', '-vfs', '-lookaside', '-pagecache', '-heap', '-mmap', '-maxsize', '-escape', '-A', '-pcachetrace'])

/** SQL with its string literals and comments removed: text inside `'...'` never runs. */
const sqlCode = (sql: string): string => sql.replace(/'(?:[^']|'')*'/g, "''").replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')

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

  const opens = /(^|[\s;"'])\.open\b|\battach\b/i.test(sql)
  const onData = isDataFileOrGlob(db, ctx) || (opens && textNamesDataFile(sql, ctx))
  if (!onData) return undefined
  // A read-only connection cannot change the store (its ATTACHed databases are read-only too); `.open` reopens read-write.
  if (readonly && !/(^|[\s;"'])\.open\b/i.test(sql)) return undefined
  return DESTRUCTIVE_SQL.test(sqlCode(sql)) ? 'destructive SQL (DROP/DELETE FROM/TRUNCATE/ALTER ... DROP/.restore) against an AQE learning database' : undefined
}

/** Interpreters whose one-liners and stdin scripts the guard reads. */
export const INTERPRETER = /^(node(js)?|deno|bun|tsx|ts-node|python[0-9.]*|pypy[0-9.]*|perl[0-9.]*|ruby[0-9.]*|php[0-9.]*|lua[0-9.]*|Rscript|julia|osascript)$/

/** In-language deletes, moves and overwrites (Node/Deno/Bun, Python, Perl, Ruby, PHP). */
const CODE_DESTROY = new RegExp(
  [
    String.raw`\b(unlink|unlinkSync|rm|rmSync|rmdir|rmdirSync|rmtree|remove_tree|rename|renameSync|renames|copyFile|copyFileSync|copyfile|copy2|copytree|copyfileobj|cp|cpSync|writeFile|writeFileSync|appendFile|appendFileSync|truncate|truncateSync|ftruncate|ftruncateSync|createWriteStream|remove|removeSync|removedirs|emptyDir|emptyDirSync|outputFile|outputFileSync|move|moveSync|mv|writeTextFile|writeTextFileSync|file_put_contents|rm_rf|rm_r|rm_f|remove_entry|remove_dir|write_text|write_bytes)\s*\(`,
    String.raw`\b(os\.replace|shutil\.copy|File\.(write|delete|unlink|rename)|Files\.(delete|deleteIfExists|write|move|copy)|Bun\.write|Deno\.(remove|rename|truncate|writeFile|writeTextFile|copyFile)|FileUtils\.\w+)\b`,
    // Perl's paren-less calls: unlink "x", rmtree $dir, rename $a, $b
    String.raw`\b(unlink|rmtree|remove_tree|rename|truncate)\s+["'$\x60]`,
    // open(path, 'w' | 'a' | 'r+' | 'x' ...) and Perl's open(F, '>', path) / open(F, ">path")
    String.raw`\bopen(Sync)?\s*\([^)]*?['"\x60](?:[rbt]*[wax+][rwaxbt+]*|\+?>{1,2}[^'"\x60]*)['"\x60]`,
  ].join('|'),
)
/** Python's `Path(...).replace(...)` / `str.replace` look alike; only Python's is taken as a move. */
const PY_REPLACE = /\.replace\s*\(/
/** Code that starts a process: its string arguments are read as a shell command. */
const SPAWN = /\b(system|exec|execSync|execFile|execFileSync|spawn|spawnSync|popen|Popen|check_call|check_output|call|run|Command|shell_exec|passthru)\s*\(|`|\bqx\b/

/** String literals in code (single, double, backtick). */
const literals = (code: string): string[] => [...code.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map(m => m[1] ?? m[2] ?? m[3] ?? '')

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
  // SQL in code lives inside string literals, so the code is read whole.
  if (DESTRUCTIVE_SQL.test(code)) return `a \`${verb}\` script runs destructive SQL against an AQE learning database`
  if (SPAWN.test(code)) {
    const lits = literals(code)
    const what = ctx.bash(lits.join(' '), ctx) ?? lits.map(l => ctx.bash(l, ctx)).find(w => w !== undefined)
    if (what !== undefined) return `a \`${verb}\` script runs ${what}`
  }
  return undefined
}
