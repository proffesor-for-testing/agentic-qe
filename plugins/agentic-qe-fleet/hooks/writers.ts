/**
 * The guard's rules for commands that delete, move, copy over, rewrite or
 * extract onto files, and for git. Pure: no `$`.
 */
import { COMPRESSORS, COPIERS, DATA_SAMPLES, DELETERS, holdsAqe } from './commands'
import { isData, isDataFileOrGlob, kindOf, type Ctx } from './context'
import { baseName, DATA_FILE, globMatches, globReachesData, hasGlob, normalisePath, underAqe } from './paths'
import { DESTRUCTIVE_SQL, sqlCode } from './scripts'
import { expandBraces, isOption } from './shell'

/** Commands that write the file named by an output option. */
const OUTPUT_FLAGS: Readonly<Record<string, readonly string[]>> = {
  curl: ['-o', '--output'],
  wget: ['-O', '--output-document'],
  sort: ['-o', '--output'],
}

/** `-t DIR` / `--target-directory=DIR` (cp, mv, install, ln), or undefined. */
function targetDir(args: readonly string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (a === '-t' || a === '--target-directory') return args[i + 1]
    if (a.startsWith('--target-directory=')) return a.slice('--target-directory='.length)
  }
  return undefined
}

/** A source that is, or may be (a glob, an unresolved `$X` read as `*`), a data file by name. */
const mayBeDataName = (src: string): boolean => {
  const b = baseName(src)
  return DATA_FILE.test(b) || (hasGlob(b) && globReachesData(b))
}

/** Whether writing to `dest` replaces learning data: a data file or glob, or the directory with a source that may be data-named. */
function overwrites(dest: string, sources: readonly string[], ctx: Ctx): boolean {
  const kind = kindOf(dest, ctx)
  if (kind === 'file' || kind === 'glob') return true
  return kind === 'dir' && sources.some(mayBeDataName)
}

/**
 * A directory copy that lands in `.agentic-qe` replaces the stores in it: `cp -r backup/. .agentic-qe/`,
 * `rsync -a backup/ .agentic-qe/`, or a copied `.agentic-qe` dropped into the project (`cp -r backup/.agentic-qe ./`).
 */
function restoresInto(verb: string, args: readonly string[], dest: string, sources: readonly string[], ctx: Ctx): string | undefined {
  const recursive = verb === 'rsync' || args.some(a => /^-[A-Za-z]*[rRa]/.test(a) || a === '--recursive' || a === '--archive')
  if (!recursive || (verb !== 'cp' && verb !== 'rsync' && verb !== 'scp')) return undefined
  if (kindOf(dest, ctx) === 'dir') return `\`${verb}\` copies a directory over ${dest}`
  // Another `.agentic-qe` (a backup's), not the project's own: copying that one out cannot overwrite it.
  const copied = sources.find(src => kindOf(src, ctx) === 'dir' && baseName(src).toLowerCase() === '.agentic-qe' && normalisePath(src).replace(/\/+$/, '').toLowerCase() !== '.agentic-qe')
  if (copied !== undefined && holdsAqe(dest, ctx)) return `\`${verb}\` copies ${copied} over the project's .agentic-qe`
  return undefined
}


/** `awk -i inplace`, `sponge FILE`, `tar -x -C DIR`, `unzip -d DIR`: rewrites of a store or extractions over it. */
function judgeRewrites(verb: string, args: readonly string[], ctx: Ctx): string | undefined {
  const operands = args.filter(a => !isOption(a))
  if (verb === 'sponge') {
    const hit = operands.find(a => isDataFileOrGlob(a, ctx))
    return hit === undefined ? undefined : `\`sponge\` overwrites ${hit}`
  }
  if ((verb === 'awk' || verb === 'gawk') && args.some((a, i) => (a === '-i' && args[i + 1] === 'inplace') || a === '-iinplace' || a === '--include=inplace')) {
    const hit = operands.find(a => isDataFileOrGlob(a, ctx))
    return hit === undefined ? undefined : `\`${verb} -i inplace\` rewrites ${hit}`
  }
  if (verb === 'tar' && args.some(a => /^-?[A-Za-z]*x/.test(a) && !a.startsWith('--') || a === '--extract' || a === '--get')) {
    const dir = args.find((a, i) => args[i - 1] === '-C' || args[i - 1] === '--directory') ?? args.find(a => a.startsWith('--directory='))?.slice('--directory='.length)
    const into = dir === undefined ? ctx.inAqe : underAqe(dir, ctx.inAqe)
    return into ? `\`tar -x\` extracts over ${dir ?? '.agentic-qe'}` : undefined
  }
  if (verb === 'unzip') {
    const dir = args.find((a, i) => args[i - 1] === '-d')
    const into = dir === undefined ? ctx.inAqe : underAqe(dir, ctx.inAqe)
    return into ? `\`unzip\` extracts over ${dir ?? '.agentic-qe'}` : undefined
  }
  return undefined
}

/** SQLite tools other than the sqlite3 shell (`sqlite-utils`, `litecli`, `better-sqlite3-cli`), and any command handed a store and destructive SQL. */
function judgeSqlTools(verb: string, args: readonly string[], ctx: Ctx): string | undefined {
  const operands = args.filter(a => !isOption(a))
  const store = operands.find(a => isDataFileOrGlob(a, ctx))
  if (store === undefined) return undefined
  if (verb === 'sqlite-utils') {
    const sub = operands[0] ?? ''
    if (!['tables', 'views', 'rows', 'schema', 'indexes', 'triggers', 'query', 'search', 'dump', 'analyze-tables'].includes(sub)) return `\`sqlite-utils ${sub}\` changes ${store}`
  }
  if (verb === 'litecli' && !args.some(a => a === '-e' || a === '--execute')) return `\`litecli\` opens ${store} for statements the guard cannot read`
  return args.some(a => DESTRUCTIVE_SQL.test(sqlCode(a))) ? `destructive SQL against ${store}` : undefined
}

/** git options before the subcommand that take a separate value. */
const GIT_VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix', '--exec-path'])

/** Whether git-clean exclude patterns keep every learning-data file (`-e .agentic-qe`, `-e '*.db*' -e '*.rvf'`). */
function excludesData(patterns: readonly string[]): boolean {
  const keeps = (pattern: string, file: string): boolean => {
    const bare = pattern.replace(/^\/+|\/+$/g, '').replace(/^\*\*\//, '')
    if (/^\.agentic-qe(\/\*{1,2})?$/i.test(bare)) return true
    const name = bare.replace(/^\.agentic-qe\//i, '')
    return !name.includes('/') && expandBraces(name).some(n => globMatches(n, file))
  }
  return DATA_SAMPLES.every(f => patterns.some(p => keeps(p, f)))
}

/** `git clean -x/-X` (deletes the ignored .agentic-qe) and `git checkout/restore/rm` on data files. */
export function judgeGit(args: readonly string[], ctx: Ctx): string | undefined {
  let i = 0
  let local = ctx
  for (; i < args.length; i++) {
    const a = args[i] as string
    if (!isOption(a)) break
    if (GIT_VALUED.has(a)) {
      const v = args[++i] ?? ''
      if (a === '-C') local = { ...local, inAqe: underAqe(v, local.inAqe) && v !== '' }
    }
  }
  const sub = args[i]
  const rest = args.slice(i + 1)
  if (sub === 'clean') {
    const flags = rest.filter(a => /^-[A-Za-z]+$/.test(a)).join('')
    const dry = flags.includes('n') || rest.includes('--dry-run')
    const patterns: string[] = []
    const paths: string[] = []
    for (let j = 0; j < rest.length; j++) {
      const a = rest[j] as string
      if (a === '-e' || a === '--exclude') patterns.push(rest[++j] ?? '')
      else if (a.startsWith('--exclude=')) patterns.push(a.slice('--exclude='.length))
      else if (/^-e./.test(a)) patterns.push(a.slice(2))
      else if (!isOption(a)) paths.push(a)
    }
    if (!/[xX]/.test(flags) || dry || excludesData(patterns)) return undefined
    // Pathspecs that cannot reach .agentic-qe (`git clean -fdx dist/`) leave it alone.
    const reaches = paths.length === 0 || local.inAqe || paths.some(p => p === '.' || p === './' || p === ':/' || /[*?[]/.test(p) || underAqe(p) || p.startsWith('/'))
    return reaches ? '`git clean -x` deletes the git-ignored .agentic-qe directory' : undefined
  }
  // `git rm --cached` only drops the file from the index; the working copy stays.
  if (sub === 'rm' && rest.includes('--cached')) return undefined
  if (sub === 'checkout' || sub === 'restore' || sub === 'rm') {
    const hit = rest.find(a => isData(a, local))
    return hit === undefined ? undefined : `\`git ${sub}\` on ${hit}`
  }
  return undefined
}

/** The deleting, moving and overwriting commands. */
export function judgeWriters(verb: string, args: readonly string[], ctx: Ctx, piped: boolean): string | undefined {
  const operands = args.filter(a => !isOption(a))
  if (DELETERS.has(verb) || verb === 'truncate') {
    const hit = operands.find(a => (verb === 'truncate' ? isDataFileOrGlob(a, ctx) : isData(a, ctx)))
    if (hit !== undefined) return `\`${verb}\` on ${hit}`
    return piped && ctx.mentionsData ? `\`xargs ${verb}\` fed learning-data paths` : undefined
  }
  if (COMPRESSORS.has(verb)) {
    const keeps = args.some(a => /^-[A-Za-z]*[kcdt]/.test(a) || a === '--keep' || a === '--stdout' || a === '--decompress' || a === '--test')
    const hit = keeps ? undefined : operands.find(a => isDataFileOrGlob(a, ctx))
    return hit === undefined ? undefined : `\`${verb}\` replaces ${hit} with an archive`
  }
  if (verb === 'mv') {
    const dir = targetDir(args)
    const dest = dir ?? operands[operands.length - 1]
    const sources = dir === undefined ? operands.slice(0, -1) : operands.filter(o => o !== dir)
    const moved = sources.find(a => isData(a, ctx))
    if (moved !== undefined) return `\`mv\` moves ${moved} away`
    if (dest !== undefined && overwrites(dest, sources, ctx)) return `\`mv\` overwrites ${dest}`
    return piped && ctx.mentionsData ? '`xargs mv` fed learning-data paths' : undefined
  }
  if (COPIERS.has(verb)) {
    const dir = targetDir(args)
    const dest = dir ?? operands[operands.length - 1]
    if (dest === undefined) return undefined
    const sources = dir === undefined ? operands.slice(0, -1) : operands.filter(o => o !== dir)
    if (overwrites(dest, sources, ctx)) return `\`${verb}\` overwrites ${dest}`
    const restore = restoresInto(verb, args, dest, sources, ctx)
    if (restore !== undefined) return restore
    if (verb === 'rsync' && args.some(a => a.startsWith('--delete')) && underAqe(dest, ctx.inAqe)) return `\`rsync --delete\` into ${dest}`
    if (verb === 'rsync' && args.includes('--remove-source-files') && sources.some(s => underAqe(s, ctx.inAqe))) return '`rsync --remove-source-files` moves learning data away'
    return undefined
  }
  if (verb === 'dd') {
    const of = args.find(a => a.startsWith('of=') && isDataFileOrGlob(a.slice(3), ctx))
    return of === undefined ? undefined : `\`dd ${of}\``
  }
  if (verb === 'tee') {
    const hit = operands.find(a => isDataFileOrGlob(a, ctx))
    return hit === undefined ? undefined : `\`tee\` overwrites ${hit}`
  }
  if (verb === 'sed' && args.some(a => /^-[A-Za-z]*i/.test(a) || a.startsWith('--in-place'))) {
    const hit = operands.find(a => isDataFileOrGlob(a, ctx))
    return hit === undefined ? undefined : `\`sed -i\` rewrites ${hit}`
  }
  const flags = OUTPUT_FLAGS[verb]
  if (flags !== undefined) {
    const at = args.findIndex((a, i) => flags.includes(a) && isDataFileOrGlob(args[i + 1] ?? '', ctx))
    if (at !== -1) return `\`${verb} ${args[at] ?? ''}\` overwrites ${args[at + 1] ?? ''}`
  }
  return judgeRewrites(verb, args, ctx) ?? judgeSqlTools(verb, args, ctx)
}

