#!/usr/bin/env tsx
/**
 * Skill-tree parity checker (ADR-113, P4).
 *
 * Detects when a mirror tree's SKILL.md bodies drift from the canonical
 * .claude/skills source. Frontmatter-agnostic (per-tree frontmatter is allowed).
 *
 *   tsx scripts/check-skill-parity.ts            # report all mirrors
 *   tsx scripts/check-skill-parity.ts --ci       # exit 1 if any mirror has drift
 *   tsx scripts/check-skill-parity.ts --mirror assets/skills
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { buildParityReport, type ParityReport } from '../src/validation/skill-parity.js';

const CANONICAL = '.claude/skills';
// Trees expected to mirror canonical bodies. plugins/ and .kiro/ are independent
// distributions today (own conventions + content); add them here once reconciled.
const DEFAULT_MIRRORS = ['assets/skills'];

function listSkills(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() && existsSync(join(p, 'SKILL.md'));
  });
}

function readSkillMap(dir: string, skills: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const sk of skills) {
    const p = join(dir, sk, 'SKILL.md');
    out[sk] = existsSync(p) ? readFileSync(p, 'utf8') : undefined;
  }
  return out;
}

function reportFor(mirror: string, canonicalSkills: string[], canonicalMap: Record<string, string>): ParityReport {
  const mirrorMap = readSkillMap(mirror, canonicalSkills);
  return buildParityReport(mirror, canonicalMap, mirrorMap);
}

function main(): void {
  const args = process.argv.slice(2);
  const ci = args.includes('--ci');
  const mirrorArg = args.includes('--mirror') ? args[args.indexOf('--mirror') + 1] : undefined;
  const mirrors = mirrorArg ? [mirrorArg] : DEFAULT_MIRRORS;

  const canonicalSkills = listSkills(CANONICAL);
  const canonicalMap: Record<string, string> = {};
  for (const sk of canonicalSkills) canonicalMap[sk] = readFileSync(join(CANONICAL, sk, 'SKILL.md'), 'utf8');

  let anyDrift = false;
  for (const mirror of mirrors) {
    const report = reportFor(mirror, canonicalSkills, canonicalMap);
    if (!report.clean) anyDrift = true;
    console.log(
      `\n${mirror}: ${report.match}/${report.total} match · ${report.drift} drift · ${report.absent} absent`,
    );
    for (const e of report.entries) {
      if (e.status === 'drift') console.log(`  [DRIFT] ${e.skill}`);
    }
    if (report.drift === 0) console.log('  ✓ no drift');
  }

  if (ci && anyDrift) {
    console.error('\n✗ Skill parity check failed: mirror trees have drifted from .claude/skills (canonical).');
    console.error('  Reconcile each [DRIFT] skill (decide canonical direction), then re-run.');
    process.exit(1);
  }
  console.log(anyDrift ? '\n(report-only; pass --ci to fail on drift)' : '\n✓ all mirrors clean');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
