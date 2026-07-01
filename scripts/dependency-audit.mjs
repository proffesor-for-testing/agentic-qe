#!/usr/bin/env node
// =============================================================================
// Dependency Security Audit (ADR-115) — AQE's own dependency CVE gate.
//
// Two modes, one parser:
//
//   (default)    In-repo audit — `npm audit` from OUR perspective, where the
//                root-level `overrides` block masks patched transitives. Fast;
//                for local dev and PR checks.
//
//   --consumer   Consumer-POV audit — pack the tarball, install it into a clean
//                throwaway project, and audit THERE. Root `overrides` are
//                root-only and do NOT apply downstream, so this is the view a
//                real `npm install agentic-qe` user gets. Authoritative.
//                (Requires `npm run build` to have run first so the tarball
//                matches what publish ships.)
//
// Why this exists: every other dependency check in the repo is triggered by
// CHANGES to package.json / package-lock.json. A CVE freshly disclosed against
// an already-pinned, unchanged dependency (the @grpc/grpc-js 1.14.3 case) stays
// invisible until someone happens to edit a dep file. The scheduled workflow
// runs THIS script daily so newly-disclosed CVEs surface on their own, not when
// a cold-outreach vendor emails us about them.
//
// Exit 1 when any advisory at or above --level (default: high) is reachable.
// Writes reports/dependency-audit.json (machine) + reports/dependency-audit.md
// (human / issue body). Importable: `runAudit()` is exported for the updater.
// =============================================================================

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const ROOT = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : process.cwd());

/** Run a command, returning { stdout, status } without throwing on non-zero. */
function run(cmd, args, opts = {}) {
  try {
    const stdout = execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
    return { stdout, status: 0 };
  } catch (e) {
    // npm audit exits non-zero when vulnerabilities are found; that is data, not failure.
    return { stdout: (e.stdout ?? '').toString(), status: e.status ?? 1, stderr: (e.stderr ?? '').toString() };
  }
}

/** Normalize `npm audit --json` (npm v7+ schema) into a flat finding list. */
export function parseAudit(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return { ok: false, findings: [], totals: {} }; }
  const totals = data.metadata?.vulnerabilities ?? {};
  const findings = [];
  for (const [name, v] of Object.entries(data.vulnerabilities ?? {})) {
    const advisories = (v.via ?? [])
      .filter((x) => typeof x === 'object')
      .map((x) => ({ title: x.title, url: x.url, cve: (x.cwe ? undefined : undefined), severity: x.severity, range: x.range }));
    findings.push({
      name,
      severity: v.severity,
      range: v.range,
      fixAvailable: v.fixAvailable === true ? 'in-range' : (v.fixAvailable ? 'breaking' : 'none'),
      advisories,
    });
  }
  return { ok: true, findings, totals };
}

/** Findings at or above `level`, severity-sorted descending. Pure. */
export function blockingFindings(findings, level = 'high') {
  const minRank = SEVERITY_RANK[level] ?? 3;
  return findings
    .filter((f) => (SEVERITY_RANK[f.severity] ?? 0) >= minRank)
    .sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0));
}

/** In-repo audit (our perspective). Exported for reuse by the updater. */
export function runRepoAudit(cwd = ROOT) {
  const { stdout } = run('npm', ['audit', '--json'], { cwd });
  return parseAudit(stdout);
}

/** Consumer-POV audit: pack tarball, clean-install it, audit the install. */
function runConsumerAudit() {
  const packed = run('npm', ['pack', '--json'], { cwd: ROOT });
  let tarball;
  try { tarball = JSON.parse(packed.stdout)[0].filename; }
  catch { throw new Error('npm pack failed — did you run `npm run build` first?'); }
  const tarballAbs = join(ROOT, tarball);
  const dir = mkdtempSync(join(tmpdir(), 'aqe-consumer-audit-'));
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'audit-consumer', version: '0.0.0', private: true }));
    run('npm', ['install', '--no-audit', '--no-fund', tarballAbs], { cwd: dir });
    const { stdout } = run('npm', ['audit', '--json'], { cwd: dir });
    return parseAudit(stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(tarballAbs, { force: true });
  }
}

/** Render a markdown summary suitable for a tracking issue body. */
function toMarkdown({ mode, level, blocking, totals, generatedAt }) {
  const sev = (s) => ({ critical: '🔴', high: '🟠', moderate: '🟡', low: '⚪', info: 'ℹ️' }[s] ?? '•');
  const lines = [];
  lines.push(`# Dependency audit — ${mode} view`);
  lines.push('');
  lines.push(`Generated: ${generatedAt} · Gate level: \`${level}\` · ` +
    (blocking.length ? `**${blocking.length} blocking finding(s)** ❌` : 'clean ✅'));
  lines.push('');
  lines.push(`Totals: critical ${totals.critical ?? 0} · high ${totals.high ?? 0} · ` +
    `moderate ${totals.moderate ?? 0} · low ${totals.low ?? 0}`);
  if (blocking.length) {
    lines.push('');
    lines.push('| Package | Sev | Fix | Advisory |');
    lines.push('|---|---|---|---|');
    for (const f of blocking) {
      const adv = f.advisories.map((a) => a.url ? `[${a.title?.slice(0, 60) ?? 'advisory'}](${a.url})` : (a.title ?? '')).join('<br>');
      lines.push(`| \`${f.name}\` (${f.range}) | ${sev(f.severity)} ${f.severity} | ${f.fixAvailable} | ${adv} |`);
    }
    lines.push('');
    lines.push('**Fix guidance:** `in-range` ⇒ `node scripts/dependency-update.mjs` (or `npm update <pkg> --package-lock-only`). ' +
      '`breaking` ⇒ manual major bump / replace / drop the path. See `docs/guides/dependency-security-policy.md`.');
  }
  return lines.join('\n') + '\n';
}

function main() {
  const args = process.argv.slice(2);
  const consumer = args.includes('--consumer');
  const levelArg = args.find((a) => a.startsWith('--level='));
  const level = levelArg ? levelArg.split('=')[1] : 'high';
  const wantJson = args.includes('--json');
  const generatedAt = new Date().toISOString();

  let result;
  try {
    result = consumer ? runConsumerAudit() : runRepoAudit();
  } catch (e) {
    console.error(`[deps:audit] ${e.message}`);
    process.exit(2);
  }
  if (!result.ok) {
    console.error('[deps:audit] could not parse `npm audit --json` output');
    process.exit(2);
  }

  const blocking = blockingFindings(result.findings, level);

  const report = { mode: consumer ? 'consumer' : 'in-repo', level, generatedAt, totals: result.totals, blocking, allFindings: result.findings };
  mkdirSync(join(ROOT, 'reports'), { recursive: true });
  writeFileSync(join(ROOT, 'reports', 'dependency-audit.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(ROOT, 'reports', 'dependency-audit.md'), toMarkdown({ ...report, blocking }));

  if (wantJson) { console.log(JSON.stringify(report, null, 2)); }
  else {
    console.log(`[deps:audit] ${report.mode} view — critical ${result.totals.critical ?? 0}, high ${result.totals.high ?? 0}, ` +
      `moderate ${result.totals.moderate ?? 0} (gate: ${level})`);
    for (const f of blocking) console.log(`  ❌ ${f.name} (${f.range}) — ${f.severity} — fix: ${f.fixAvailable}`);
  }

  if (blocking.length) {
    console.error(`[deps:audit] FAIL — ${blocking.length} finding(s) >= ${level} reachable in ${report.mode} view`);
    process.exit(1);
  }
  console.log(`[deps:audit] PASS — no findings >= ${level}`);
}

// Run as CLI; stay importable when required by the updater.
if (import.meta.url === `file://${process.argv[1]}`) main();
