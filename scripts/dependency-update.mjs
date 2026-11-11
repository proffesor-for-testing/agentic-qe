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
// What this does (#1403: fail closed, classify every transition):
//   1. Snapshot the pre-update lockfile bytes, the optional platform entries and
//      an in-repo audit. An unreadable lockfile or audit rejects the run.
//   2. Run the chosen update command (in-range only) and record its exit status,
//      signal and stderr tail.
//   3. Compare the UNION of lock paths before/after and classify each change as
//      UPGRADE, DOWNGRADE, ADDED, REMOVED or REPLACED (semver comparison via the
//      `semver` package; aliases, git/file/tarball sources and integrity-only
//      changes are REPLACED, never ordered).
//   4. Decide a disposition:
//        REJECTED         command failed or was signalled, a lockfile or audit
//                         could not be read, or an optional platform dep was
//                         pruned. The pre-update lock bytes are restored.
//        NO_CHANGE        command succeeded and the lockfile did not move.
//        REVIEW_REQUIRED  any DOWNGRADE, REMOVED or REPLACED transition, or the
//                         lockfile moved without a version transition.
//        ADMITTED         only UPGRADE and ADDED transitions.
//
// Writes reports/dependency-update.{json,md} for every disposition, and
// `disposition=<X>` to $GITHUB_OUTPUT when set. Exits 1 on REJECTED, else 0.
// =============================================================================

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import semver from 'semver';
import { runRepoAudit } from './dependency-audit.mjs';

const ROOT = resolve(process.cwd());
const LOCK = join(ROOT, 'package-lock.json');
const STDERR_TAIL = 2000;
const REVIEW_KINDS = ['DOWNGRADE', 'REMOVED', 'REPLACED'];
const KINDS = ['UPGRADE', 'DOWNGRADE', 'ADDED', 'REMOVED', 'REPLACED'];

function run(cmd, args) {
  try {
    const stdout = execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    return { stdout, status: 0, signal: null, stderr: '' };
  } catch (e) {
    return {
      stdout: (e.stdout ?? '').toString(),
      status: typeof e.status === 'number' ? e.status : null,
      signal: e.signal ?? null,
      stderr: (e.stderr ?? '').toString() || String(e.message ?? ''),
    };
  }
}

/** Parse a lockfile; throws a descriptive error instead of yielding an empty map. */
export function parseLock(lockText, label = 'lockfile') {
  let lock;
  try { lock = JSON.parse(lockText); } catch (e) { throw new Error(`${label} is not valid JSON: ${e.message}`); }
  if (!lock || typeof lock.packages !== 'object' || lock.packages === null) {
    throw new Error(`${label} has no "packages" map (lockfileVersion 2+ required)`);
  }
  return lock;
}

/** Map of `node_modules/...` path -> resolved version, from a lockfile string. */
export function lockVersions(lockText) {
  const out = new Map();
  for (const [path, node] of Object.entries(parseLock(lockText).packages)) {
    if (path && node?.version) out.set(path, node.version);
  }
  return out;
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

const pathName = (path) => path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);

function sourceType(node) {
  if (node.link) return 'link';
  const r = node.resolved ?? '';
  if (!r) return 'none';
  if (/^git(\+[a-z]+)?:/.test(r) || r.startsWith('github:')) return 'git';
  if (r.startsWith('file:')) return 'file';
  if (/^https?:\/\/.*\/-\/[^/]+\.tgz$/.test(r)) return 'registry';
  return 'tarball';
}

function scopeOf(node) {
  if (node.devOptional || (node.dev && node.optional)) return 'dev-optional';
  if (node.dev) return 'dev';
  if (node.optional) return 'optional';
  return 'prod';
}

function directNames(lock) {
  const root = lock.packages[''] ?? {};
  return new Set(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
    .flatMap((k) => Object.keys(root[k] ?? {})));
}

/** Package names (from either lock) that declare a dependency on `name`, for "why is it here". */
function requiredBy(name, locks) {
  const out = new Set();
  for (const lock of locks) {
    for (const [path, node] of Object.entries(lock.packages)) {
      if (!path) continue;
      const deps = { ...node.dependencies, ...node.optionalDependencies, ...node.peerDependencies };
      if (Object.prototype.hasOwnProperty.call(deps, name)) out.add(node.name ?? pathName(path));
    }
  }
  return [...out].sort().slice(0, 5);
}

function compareEntries(a, b) {
  const nameA = a.name ?? null;
  const nameB = b.name ?? null;
  if (nameA !== nameB) return { kind: 'REPLACED', detail: `package changed (${nameA ?? 'path name'} -> ${nameB ?? 'path name'})` };
  const srcA = sourceType(a);
  const srcB = sourceType(b);
  if (srcA !== srcB) return { kind: 'REPLACED', detail: `source changed (${srcA} -> ${srcB})` };
  const va = semver.valid(a.version ?? '');
  const vb = semver.valid(b.version ?? '');
  if (va && vb && srcA === 'registry') {
    const cmp = semver.compare(vb, va);
    if (cmp > 0) return { kind: 'UPGRADE', detail: '' };
    if (cmp < 0) return { kind: 'DOWNGRADE', detail: '' };
    return { kind: 'REPLACED', detail: 'same version, different resolved/integrity' };
  }
  return { kind: 'REPLACED', detail: `non-semver or non-registry version (${srcA})` };
}

const identity = (n) => JSON.stringify([n.name ?? null, n.version ?? null, n.resolved ?? null, n.integrity ?? null, !!n.link]);

/**
 * Every lock path that changed identity between the two lockfiles, classified.
 * Throws when either lockfile cannot be parsed.
 */
export function classifyTransitions(beforeText, afterText) {
  const before = parseLock(beforeText, 'pre-update lockfile');
  const after = parseLock(afterText, 'post-update lockfile');
  const direct = new Set([...directNames(before), ...directNames(after)]);
  const paths = new Set([...Object.keys(before.packages), ...Object.keys(after.packages)]);
  paths.delete('');
  const out = [];
  for (const path of [...paths].sort()) {
    const a = before.packages[path];
    const b = after.packages[path];
    if (a && b && identity(a) === identity(b)) continue;
    const node = b ?? a;
    const name = node.name ?? pathName(path);
    const { kind, detail } = !a ? { kind: 'ADDED', detail: '' } : !b ? { kind: 'REMOVED', detail: '' } : compareEntries(a, b);
    out.push({
      path,
      name,
      kind,
      from: a?.version ?? null,
      to: b?.version ?? null,
      fromSource: a ? sourceType(a) : null,
      toSource: b ? sourceType(b) : null,
      detail,
      scope: scopeOf(node),
      direct: path === `node_modules/${pathName(path)}` && direct.has(pathName(path)),
      requiredBy: requiredBy(name, [before, after]),
    });
  }
  return out;
}

/** An audit is usable only if npm's output parsed and carried vulnerability totals. */
export function auditUsable(audit) {
  return audit?.ok === true && Number.isFinite(audit?.totals?.total);
}

export function countKinds(transitions) {
  const counts = Object.fromEntries(KINDS.map((k) => [k, 0]));
  for (const t of transitions) counts[t.kind] += 1;
  return counts;
}

/** Overall verdict for a run. Pure; `errors` carries parse failures from main(). */
export function decideDisposition({ command, lockChanged, transitions, auditBefore, auditAfter, droppedOptionals, errors = [] }) {
  const reasons = [];
  if (command?.signal) reasons.push(`update command was terminated by ${command.signal}`);
  else if (command?.status !== 0) reasons.push(`update command exited with status ${command?.status ?? 'unknown'}`);
  reasons.push(...errors);
  // `undefined` = not attempted (an earlier step already failed); anything else must be usable.
  if (auditBefore !== undefined && !auditUsable(auditBefore)) reasons.push('pre-update npm audit output could not be read');
  if (auditAfter !== undefined && !auditUsable(auditAfter)) reasons.push('post-update npm audit output could not be read');
  if (droppedOptionals?.length) reasons.push(`optional platform deps pruned: ${droppedOptionals.join(', ')}`);
  if (reasons.length) return { disposition: 'REJECTED', reasons };

  if (!lockChanged) return { disposition: 'NO_CHANGE', reasons: [] };
  const counts = countKinds(transitions);
  const review = REVIEW_KINDS.filter((k) => counts[k] > 0).map((k) => `${counts[k]} ${k}`);
  if (review.length) return { disposition: 'REVIEW_REQUIRED', reasons: [`lockfile has ${review.join(', ')}`] };
  if (transitions.length === 0) return { disposition: 'REVIEW_REQUIRED', reasons: ['lockfile changed without any version transition'] };
  return { disposition: 'ADMITTED', reasons: [] };
}

const cell = (v) => (v === null || v === undefined || v === '' ? '—' : String(v).replace(/\|/g, '\\|'));

/** Markdown report (also the PR body). Rendered from the same object as the JSON report. */
export function renderMarkdown(report) {
  const { mode, disposition, reasons, command, transitions, counts, audit, optionalDeps } = report;
  const md = [];
  md.push(`# Automated in-range dependency update (${mode})`);
  md.push('');
  if (disposition === 'REVIEW_REQUIRED') {
    md.push(`> **REVIEW REQUIRED** — this update is not upgrades only: ${reasons.join('; ')}. ` +
      'A downgrade, removal or replacement can be legitimate resolver output, but a human must confirm it before merging.');
  } else if (disposition === 'REJECTED') {
    md.push(`> **REJECTED** — nothing is proposed: ${reasons.join('; ')}.`);
  }
  md.push('');
  md.push(`Disposition: **${disposition}** · Command: \`${command.argv.join(' ')}\` → ` +
    (command.signal ? `signal ${command.signal}` : `exit ${command.status ?? 'unknown'}`));
  md.push('');
  md.push(`Transitions: ${KINDS.map((k) => `${k} ${counts[k]}`).join(' · ')}`);
  const fmt = (a) => (a.usable ? `high ${a.high}, critical ${a.critical}, moderate ${a.moderate}` : 'unavailable');
  md.push(`Audit (in-repo): before ${fmt(audit.before)} → after ${fmt(audit.after)}`);
  md.push(`Optional platform deps: ${optionalDeps.tracked} tracked, ` +
    (optionalDeps.dropped.length ? `**dropped: ${optionalDeps.dropped.join(', ')}**` : '0 dropped'));

  const review = transitions.filter((t) => REVIEW_KINDS.includes(t.kind));
  if (review.length) {
    md.push('');
    md.push('## Review required');
    md.push('');
    md.push('| Kind | Package | From | To | Scope | Required by | Detail |');
    md.push('|---|---|---|---|---|---|---|');
    for (const t of review) {
      md.push(`| ${t.kind} | \`${t.name}\` | ${cell(t.from)} | ${cell(t.to)} | ${t.scope} | ${cell(t.requiredBy.join(', '))} | ${cell(t.detail)} |`);
    }
  }
  if (transitions.length) {
    md.push('');
    md.push('## All transitions');
    md.push('');
    md.push('| Kind | Package | Lock path | From | To | Scope | Direct |');
    md.push('|---|---|---|---|---|---|---|');
    for (const t of transitions) {
      md.push(`| ${t.kind} | \`${t.name}\` | \`${t.path}\` | ${cell(t.from)} | ${cell(t.to)} | ${t.scope} | ${t.direct ? 'yes' : 'no'} |`);
    }
  }
  md.push('');
  md.push('> In-range only (no major bumps). Generated by `scripts/dependency-update.mjs` per ADR-115. ' +
    'Which advisory a transition fixes is not inferred.');
  // #1344: this report is the PR body, so it carries the section that
  // scripts/check-pr-body.cjs requires (issue #401).
  md.push('');
  md.push('## Failure modes');
  md.push('');
  md.push('- A bumped package changes behaviour within its semver range: covered by the PR\'s CI test run.');
  md.push('- An optional platform dependency is pruned from the lockfile: the updater rejects the run (ADR-115 guard, tests/unit/scripts/dependency-update.test.ts).');
  md.push('- The update command or npm audit fails: the updater rejects the run and proposes nothing (#1403, same test file).');
  md.push('- A downgrade, removal or replacement is proposed: the run is REVIEW_REQUIRED and listed above (#1403, same test file).');
  md.push('');
  md.push('### Required check (issue #401)');
  md.push('');
  md.push('- [x] **Every failure mode mentioned in this PR description has either (a) a test that exercises it, or (b) a linked tracking issue.**');
  return md.join('\n') + '\n';
}

function summariseAudit(a) {
  const t = a?.totals ?? {};
  return { usable: auditUsable(a), critical: t.critical ?? null, high: t.high ?? null, moderate: t.moderate ?? null, low: t.low ?? null };
}

const sha256 = (text) => (text === null ? null : createHash('sha256').update(text).digest('hex'));

function main() {
  const all = process.argv.includes('--all');
  const mode = all ? 'maintenance' : 'security';
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const guard = new Set(Object.keys(pkg.optionalDependencies ?? {}));
  const argv = ['npm', ...(all ? ['update', '--package-lock-only'] : ['audit', 'fix', '--package-lock-only'])];
  const errors = [];

  const beforeText = readFileSync(LOCK, 'utf8');
  let beforeOptionals = new Set();
  try { beforeOptionals = presentOptionals(lockVersions(beforeText), guard); }
  catch (e) { errors.push(e.message.replace(/^lockfile/, 'pre-update lockfile')); }

  const auditBefore = errors.length ? undefined : runRepoAudit(ROOT);
  let command = { argv, status: null, signal: null, stderrTail: '', skipped: true };
  let afterText = beforeText;
  let auditAfter;
  let transitions = [];
  let dropped = [];

  // Only run the update when the starting point is readable.
  if (!errors.length && auditUsable(auditBefore)) {
    console.log(`[deps:update] mode=${mode} — running \`${argv.join(' ')}\`...`);
    const upd = run(argv[0], argv.slice(1));
    command = { argv, status: upd.status, signal: upd.signal, stderrTail: upd.stderr.slice(-STDERR_TAIL), skipped: false };
    try { afterText = readFileSync(LOCK, 'utf8'); } catch (e) { afterText = null; errors.push(`post-update lockfile unreadable: ${e.message}`); }
    if (afterText !== null) {
      try {
        transitions = classifyTransitions(beforeText, afterText);
        const afterOptionals = presentOptionals(lockVersions(afterText), guard);
        dropped = [...beforeOptionals].filter((n) => !afterOptionals.has(n));
      } catch (e) { errors.push(e.message); }
    }
    auditAfter = runRepoAudit(ROOT);
  }

  const lockChanged = afterText !== beforeText;
  const { disposition, reasons } = decideDisposition({
    command: command.skipped ? { status: 0, signal: null } : command,
    lockChanged, transitions, auditBefore, auditAfter, droppedOptionals: dropped, errors,
  });

  if (disposition === 'REJECTED' && afterText !== beforeText) {
    writeFileSync(LOCK, beforeText); // restore the captured bytes, not a broad git checkout
  }

  const npmVersion = run('npm', ['--version']);
  const report = {
    schema: 'aqe.dependency-update@1',
    generatedAt: new Date().toISOString(),
    mode,
    disposition,
    reasons,
    command,
    nodeVersion: process.version,
    npmVersion: npmVersion.status === 0 ? npmVersion.stdout.trim() : null,
    lock: { beforeSha256: sha256(beforeText), afterSha256: sha256(afterText), changed: lockChanged, restored: disposition === 'REJECTED' && lockChanged },
    transitions,
    counts: countKinds(transitions),
    audit: { before: summariseAudit(auditBefore), after: summariseAudit(auditAfter) },
    optionalDeps: { tracked: guard.size, before: [...beforeOptionals].sort(), dropped },
  };
  mkdirSync(join(ROOT, 'reports'), { recursive: true });
  writeFileSync(join(ROOT, 'reports', 'dependency-update.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(ROOT, 'reports', 'dependency-update.md'), renderMarkdown(report));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `disposition=${disposition}\n`);

  const summary = KINDS.map((k) => `${k.toLowerCase()} ${report.counts[k]}`).join(', ');
  if (disposition === 'REJECTED') {
    console.error(`[deps:update] REJECTED: ${reasons.join('; ')}`);
    if (command.stderrTail) console.error(`[deps:update] npm stderr (tail):\n${command.stderrTail}`);
    if (report.lock.restored) console.error('[deps:update] restored the pre-update package-lock.json bytes.');
    process.exit(1);
  }
  console.log(`[deps:update] ${disposition}${reasons.length ? ` (${reasons.join('; ')})` : ''}; ${summary}.`);
}

// Run as CLI; stay importable (without shelling out to npm) for unit tests.
if (import.meta.url === `file://${process.argv[1]}`) main();
