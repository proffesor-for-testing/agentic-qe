#!/usr/bin/env node
// =============================================================================
// Dependency Update (ADR-115) — controlled, in-range lockfile refresh.
//
// Why a custom updater instead of Dependabot/Renovate:
//   This repo declares 15 optionalDependencies — the @ruvector/* native
//   binaries (per-platform), hnswlib-node, rvlite. Dependabot regenerates the
//   lockfile on the runner's single platform and PRUNES the optional entries
//   for every OTHER platform. The pruned lock then fails `npm ci` with EUSAGE
//   on those platforms (this broke a real install). So the off-the-shelf bot is
//   actively wrong for us. (See: dependabot-lockfile-drops-optional-deps note.)
//
// Two modes (both in-range only — never --force, never a major bump):
//   (default)  Security-targeted: `npm audit fix --package-lock-only`. Touches
//              ONLY packages with a known advisory, applying the in-range fix
//              (the @grpc/grpc-js 1.14.3 -> 1.14.4 case). Small, reviewable,
//              security-relevant diffs — safe to automate into a PR.
//   --all      Lockfile maintenance: `npm update --package-lock-only`. Refreshes
//              every dependency to its newest in-range version. Much broader
//              churn (loose-range transitives can still cross majors), so this
//              is opt-in for a human-reviewed periodic sweep, not the bot.
//
// What this does:
//   1. Snapshot the pre-update lockfile + the set of optional platform entries.
//   2. Run the chosen update command (in-range only).
//   3. GUARD: assert no optional platform dep was dropped. If any vanished, the
//      lockfile is corrupt for cross-platform `npm ci` — restore from git and
//      fail loudly rather than open a lock-breaking PR.
//   4. Diff versions + run an in-repo audit before/after, and report the delta.
//
// Writes reports/dependency-update.{json,md}. Exits 0 whether or not there were
// changes (the workflow opens a PR only when package-lock.json actually moved);
// exits 1 only on the optional-dep guard tripping.
// =============================================================================

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runRepoAudit } from './dependency-audit.mjs';

const ROOT = resolve(process.cwd());
const LOCK = join(ROOT, 'package-lock.json');

function run(cmd, args) {
  try { return { stdout: execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }), status: 0 }; }
  catch (e) { return { stdout: (e.stdout ?? '').toString(), status: e.status ?? 1, stderr: (e.stderr ?? '').toString() }; }
}

/** Map of `node_modules/...` path -> resolved version, from a lockfile string. */
export function lockVersions(lockText) {
  const lock = JSON.parse(lockText);
  const out = new Map();
  for (const [path, node] of Object.entries(lock.packages ?? {})) {
    if (path && node?.version) out.set(path, node.version);
  }
  return out;
}

/** The optional platform deps that Dependabot prunes — our guard set. */
function optionalGuardSet() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return new Set(Object.keys(pkg.optionalDependencies ?? {}));
}

/** Which guard-set packages have a lockfile entry (any node_modules/... path). */
export function presentOptionals(versions, guard) {
  const present = new Set();
  for (const path of versions.keys()) {
    for (const name of guard) {
      if (path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`)) present.add(name);
    }
  }
  return present;
}

function summariseAudit(a) {
  const t = a.totals ?? {};
  return { critical: t.critical ?? 0, high: t.high ?? 0, moderate: t.moderate ?? 0, low: t.low ?? 0 };
}

function main() {
  const all = process.argv.includes('--all');
  const mode = all ? 'maintenance' : 'security';
  const guard = optionalGuardSet();
  const beforeText = readFileSync(LOCK, 'utf8');
  const beforeVersions = lockVersions(beforeText);
  const beforeOptionals = presentOptionals(beforeVersions, guard);
  const auditBefore = summariseAudit(runRepoAudit());

  // Security default fixes only vulnerable packages in-range; --all is a full
  // in-range lockfile refresh. Neither uses --force (no major bumps).
  const cmd = all ? ['update', '--package-lock-only'] : ['audit', 'fix', '--package-lock-only'];
  console.log(`[deps:update] mode=${mode} — running \`npm ${cmd.join(' ')}\`...`);
  const upd = run('npm', cmd);
  if (upd.status !== 0) console.error('[deps:update] npm reported:', upd.stderr?.trim());

  const afterText = readFileSync(LOCK, 'utf8');
  const afterVersions = lockVersions(afterText);
  const afterOptionals = presentOptionals(afterVersions, guard);

  // GUARD: any optional platform dep dropped => cross-platform `npm ci` breakage.
  const dropped = [...beforeOptionals].filter((n) => !afterOptionals.has(n));
  if (dropped.length) {
    console.error(`[deps:update] GUARD TRIPPED — optional platform deps pruned: ${dropped.join(', ')}`);
    console.error('[deps:update] restoring package-lock.json from git; not proposing a lock-breaking update.');
    run('git', ['checkout', '--', 'package-lock.json']);
    process.exit(1);
  }

  // Diff resolved versions (dedupe by package name + version pair).
  const changes = [];
  const seen = new Set();
  for (const [path, after] of afterVersions) {
    const before = beforeVersions.get(path);
    if (before && before !== after) {
      const name = path.split('node_modules/').pop();
      const key = `${name}@${before}->${after}`;
      if (!seen.has(key)) { seen.add(key); changes.push({ name, from: before, to: after }); }
    }
  }
  changes.sort((a, b) => a.name.localeCompare(b.name));

  const auditAfter = summariseAudit(runRepoAudit());
  const changed = beforeText !== afterText;

  const report = {
    generatedAt: new Date().toISOString(),
    mode,
    changed,
    optionalDepsPreserved: true,
    optionalDepsTracked: [...guard].length,
    changes,
    audit: { before: auditBefore, after: auditAfter },
  };
  mkdirSync(join(ROOT, 'reports'), { recursive: true });
  writeFileSync(join(ROOT, 'reports', 'dependency-update.json'), JSON.stringify(report, null, 2));

  const md = [];
  md.push(`# Automated in-range dependency update (${mode})`);
  md.push('');
  md.push(changed
    ? `Updated **${changes.length}** package(s) within existing semver ranges (\`${mode}\` mode).`
    : `No in-range ${mode} updates available — lockfile unchanged.`);
  md.push('');
  md.push(`Audit (in-repo): high ${auditBefore.high} → ${auditAfter.high}, ` +
    `critical ${auditBefore.critical} → ${auditAfter.critical}, moderate ${auditBefore.moderate} → ${auditAfter.moderate}`);
  md.push(`Optional platform deps preserved: ✅ (${[...guard].length} tracked, 0 dropped)`);
  if (changes.length) {
    md.push('');
    md.push('| Package | From | To |');
    md.push('|---|---|---|');
    for (const c of changes) md.push(`| \`${c.name}\` | ${c.from} | ${c.to} |`);
  }
  md.push('');
  md.push('> In-range only (no major bumps). Generated by `scripts/dependency-update.mjs` per ADR-115.');
  writeFileSync(join(ROOT, 'reports', 'dependency-update.md'), md.join('\n') + '\n');

  console.log(`[deps:update] ${changed ? `${changes.length} package(s) updated` : 'no changes'}; ` +
    `high ${auditBefore.high}->${auditAfter.high}, critical ${auditBefore.critical}->${auditAfter.critical}; ` +
    `optional deps preserved (${[...guard].length} tracked).`);
}

// Run as CLI; stay importable (without shelling out to npm) for unit tests.
if (import.meta.url === `file://${process.argv[1]}`) main();
