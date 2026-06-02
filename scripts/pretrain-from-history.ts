#!/usr/bin/env tsx
/**
 * Pretrain-from-history bootstrap (ADR-077 port — adoption-plan item #9, issue #510).
 *
 * Seeds the AQE pattern store from the repo's OWN git history so a fresh
 * project starts with a non-empty, project-specific pattern store instead of
 * an empty one.
 *
 * Each non-merge commit is treated as a learning trajectory:
 *   - subject (%s)  → task text + domain classification (deriveTaskType)
 *   - normal commit → success=true  (the change shipped and stuck)
 *   - revert commit → success=false (a revert means the reverted change failed)
 *
 * Every commit is recorded through the SAME live-learning code path used at
 * runtime — `persistTaskOutcome()` from hooks-dream-learning.ts — which writes
 * captured_experiences (+ experience_applications + Q updates) via
 * getUnifiedMemory(). After recording, `consolidateExperiencesToPatterns()`
 * distills those experiences into qe_patterns. No bespoke INSERTs: the bootstrap
 * exercises exactly what production exercises, so the seeded store is
 * schema-identical to a naturally-grown one.
 *
 * ── DATA PROTECTION ──────────────────────────────────────────────────
 * This script WRITES learning experiences into the AQE store resolved by
 * getUnifiedMemory(), which honors AQE_PROJECT_ROOT. To target a throwaway
 * store (and never touch the real .agentic-qe/), run with:
 *
 *     AQE_PROJECT_ROOT=$(mktemp -d) npx tsx scripts/pretrain-from-history.ts --limit 200
 *
 * --dry-run records NOTHING (parse + classify + histogram only).
 *
 * Run: npx tsx scripts/pretrain-from-history.ts [--limit N] [--dry-run] [--verbose]
 */

import { execFileSync } from 'child_process';

// ── Types ────────────────────────────────────────────────────────────

export interface ParsedCommit {
  hash: string;
  subject: string;
  author: string;
}

export interface ClassifiedCommit {
  subject: string;
  /** QE domain inferred from the subject via deriveTaskType(). */
  domain: string;
  /** false for reverts (the reverted change didn't work), true otherwise. */
  success: boolean;
}

// ── Pure classifier (unit-tested in tests/unit/scripts/...) ──────────

/**
 * Classify a commit subject into a learning trajectory.
 *
 * Pure + side-effect free so it can be unit-tested without git or a DB:
 *   - `deriveTaskType` (injected) maps the subject to a QE domain.
 *   - a subject starting with `revert` (case-insensitive, tolerant of a
 *     leading conventional-commit type like `revert:` or `Revert "feat: …"`)
 *     is a FAILURE signal — a revert means the reverted change didn't work.
 *
 * @param subject       commit subject line (the %s)
 * @param deriveTaskType the production domain classifier (DI for testability)
 */
export function classifyCommit(
  subject: string,
  deriveTaskType: (description: string) => string,
): ClassifiedCommit {
  const trimmed = subject.trim();
  // revert / Revert "..." / revert: ...  → failure signal
  const isRevert = /^revert\b/i.test(trimmed);
  return {
    subject: trimmed,
    domain: deriveTaskType(trimmed),
    success: !isRevert,
  };
}

/**
 * Decide whether a commit subject is worth recording. Skips empty subjects
 * and trivial auto-generated bumps so we don't seed noise.
 */
export function isTrivialSubject(subject: string): boolean {
  const s = subject.trim().toLowerCase();
  if (s.length === 0) return true;
  // Common auto-generated / no-signal subjects.
  //   - `wip` as a standalone leading word
  //   - git autosquash markers `fixup! …` / `squash! …` / `amend! …`
  if (/^wip\b/.test(s)) return true;
  if (/^(fixup|squash|amend)!/.test(s)) return true;
  if (/^merge\b/.test(s)) return true; // belt-and-suspenders; --no-merges already filters
  return false;
}

// ── CLI arg parsing ──────────────────────────────────────────────────

interface CliOpts {
  limit: number;
  dryRun: boolean;
  verbose: boolean;
}

function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = { limit: 500, dryRun: false, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') {
      const n = parseInt(argv[++i] ?? '', 10);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`--limit requires a positive integer (got "${argv[i]}")`);
      }
      opts.limit = n;
    } else if (a.startsWith('--limit=')) {
      const n = parseInt(a.slice('--limit='.length), 10);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`--limit requires a positive integer (got "${a}")`);
      }
      opts.limit = n;
    } else if (a === '--dry-run') {
      opts.dryRun = true;
    } else if (a === '--verbose') {
      opts.verbose = true;
    } else if (a === '--help' || a === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

function printUsage(): void {
  console.log(`pretrain-from-history — seed the AQE pattern store from git history (ADR-077)

Usage:
  AQE_PROJECT_ROOT=<dir> npx tsx scripts/pretrain-from-history.ts [options]

Options:
  --limit N     Max commits to scan (default 500)
  --dry-run     Parse + classify + print histogram; record NOTHING
  --verbose     Per-commit classification output
  -h, --help    Show this help

Data protection: set AQE_PROJECT_ROOT to a throwaway dir to avoid touching the
real .agentic-qe/ store.`);
}

// ── Git history ──────────────────────────────────────────────────────

function readGitHistory(limit: number): ParsedCommit[] {
  // %H<TAB>%s<TAB>%an, one commit per line, no merges.
  const raw = execFileSync(
    'git',
    [
      'log',
      '--no-merges',
      '--pretty=format:%H%x09%s%x09%an',
      `--max-count=${limit}`,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  const commits: ParsedCommit[] = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const [hash, subject = '', author = ''] = line.split('\t');
    if (!hash) continue;
    commits.push({ hash, subject, author });
  }
  return commits;
}

// ── Histogram helper ─────────────────────────────────────────────────

function buildHistogram(items: ClassifiedCommit[]): Map<string, number> {
  const hist = new Map<string, number>();
  for (const it of items) {
    hist.set(it.domain, (hist.get(it.domain) ?? 0) + 1);
  }
  return hist;
}

function printHistogram(hist: Map<string, number>): void {
  const rows = [...hist.entries()].sort((a, b) => b[1] - a[1]);
  const max = rows.reduce((m, [, c]) => Math.max(m, c), 1);
  for (const [domain, count] of rows) {
    const barLen = Math.max(1, Math.round((count / max) * 30));
    console.log(`  ${domain.padEnd(24)} ${String(count).padStart(4)}  ${'█'.repeat(barLen)}`);
  }
}

// ── Store counts (read-only, on the SAME store) ──────────────────────

async function readStoreCounts(): Promise<{ experiences: number; patterns: number }> {
  const { getUnifiedMemory } = await import('../src/kernel/unified-memory.js');
  const um = getUnifiedMemory();
  if (!um.isInitialized()) {
    await um.initialize();
  }
  const db = um.getDatabase();

  const countOf = (table: string): number => {
    try {
      const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number } | undefined;
      return row?.c ?? 0;
    } catch {
      // Table may not exist yet on a brand-new store.
      return 0;
    }
  };

  return {
    experiences: countOf('captured_experiences'),
    patterns: countOf('qe_patterns'),
  };
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));

  // Production domain classifier — the SAME one used at routing time.
  const { deriveTaskType } = await import('../src/learning/agent-routing.js');

  const projectRoot = process.env.AQE_PROJECT_ROOT ?? '(auto-detected — REAL store)';
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' AQE pretrain-from-history (ADR-077 / adoption-plan #9)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Store root : ${projectRoot}`);
  console.log(`  Mode       : ${opts.dryRun ? 'DRY-RUN (records nothing)' : 'RECORD'}`);
  console.log(`  Limit      : ${opts.limit}`);
  console.log('');

  // 1. Parse git history.
  const commits = readGitHistory(opts.limit);
  console.log(`Scanned ${commits.length} non-merge commits from git history.`);

  // 2. Classify (skip trivial subjects).
  const classified: ClassifiedCommit[] = [];
  let skipped = 0;
  for (const c of commits) {
    if (isTrivialSubject(c.subject)) {
      skipped++;
      continue;
    }
    const cc = classifyCommit(c.subject, deriveTaskType);
    classified.push(cc);
    if (opts.verbose) {
      const flag = cc.success ? 'ok    ' : 'REVERT';
      console.log(`  [${flag}] ${cc.domain.padEnd(22)} ${cc.subject.slice(0, 70)}`);
    }
  }

  const reverts = classified.filter((c) => !c.success).length;
  const hist = buildHistogram(classified);

  console.log('');
  console.log(`Classified ${classified.length} commits (${skipped} trivial skipped, ${reverts} reverts/failures).`);
  console.log('Domain histogram:');
  printHistogram(hist);
  console.log('');

  // Read BEFORE counts on the same store (read-only).
  const before = await readStoreCounts();

  if (opts.dryRun) {
    console.log('DRY-RUN: nothing recorded.');
    console.log(`  captured_experiences: ${before.experiences} (unchanged)`);
    console.log(`  qe_patterns         : ${before.patterns} (unchanged)`);
    return 0;
  }

  // 3. Record each commit through the LIVE path: persistTaskOutcome().
  //    persistTaskOutcome() runs a single transaction that touches
  //    captured_experiences, experience_applications and qe_trajectories — but
  //    on a brand-new store `um.initialize()` only creates the core schema
  //    (qe_patterns, dream, goap, …), NOT those experience-pipeline tables.
  //    They are created lazily at runtime (MCP startup / reasoning-bank). On a
  //    fresh CLI-only store none of them exist, so we ensure them here:
  //      - ensureAllBrainTables(): the canonical schema-ensure that creates
  //        captured_experiences + experience_applications + qe_trajectories
  //        (with all consolidation columns) in FK-aware order.
  //      - initializeExperienceCapture(): the production lazy-init that also
  //        adds the captured_experiences indexes + any newer consolidation
  //        columns and starts the cleanup timer (mirror persistExperience()).
  const { getUnifiedMemory } = await import('../src/kernel/unified-memory.js');
  const umForSchema = getUnifiedMemory();
  if (!umForSchema.isInitialized()) {
    await umForSchema.initialize();
  }
  const { ensureAllBrainTables } = await import('../src/integrations/ruvector/brain-table-ddl.js');
  ensureAllBrainTables(umForSchema.getDatabase());

  const { initializeExperienceCapture } = await import(
    '../src/learning/experience-capture-middleware.js'
  );
  await initializeExperienceCapture();

  const { persistTaskOutcome, consolidateExperiencesToPatterns } = await import(
    '../src/cli/commands/hooks-handlers/hooks-dream-learning.js'
  );

  let recorded = 0;
  let recordFailures = 0;
  for (const cc of classified) {
    try {
      await persistTaskOutcome({
        taskId: cc.subject.slice(0, 120),
        agent: 'git-history',
        domain: cc.domain,
        success: cc.success,
        durationMs: 0,
      });
      recorded++;
    } catch (err) {
      recordFailures++;
      if (opts.verbose) {
        console.error(`  ! failed to record "${cc.subject.slice(0, 60)}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  console.log(`Recorded ${recorded} experiences through the live path (persistTaskOutcome)${recordFailures ? `, ${recordFailures} failed` : ''}.`);

  // 4. Consolidate experiences → qe_patterns.
  const patternsProduced = await consolidateExperiencesToPatterns();
  console.log(`Consolidation produced ${patternsProduced} pattern create/reinforce ops.`);

  // Read AFTER counts on the same store.
  const after = await readStoreCounts();

  console.log('');
  console.log('─── Summary ────────────────────────────────────────────────');
  console.log(`  Commits scanned        : ${commits.length}`);
  console.log(`  Trivial skipped        : ${skipped}`);
  console.log(`  Experiences recorded   : ${recorded}`);
  console.log(`  Reverts (failures)     : ${reverts}`);
  console.log(`  Patterns produced (ops): ${patternsProduced}`);
  console.log(`  captured_experiences   : ${before.experiences} → ${after.experiences}`);
  console.log(`  qe_patterns            : ${before.patterns} → ${after.patterns}`);
  console.log('────────────────────────────────────────────────────────────');

  return 0;
}

// Only run when invoked directly (e.g. `tsx scripts/pretrain-from-history.ts`),
// NOT when imported by the unit test (which exercises the pure helpers only).
const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  /pretrain-from-history\.[cm]?ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('pretrain-from-history failed:', err instanceof Error ? err.stack ?? err.message : err);
      process.exit(1);
    });
}
