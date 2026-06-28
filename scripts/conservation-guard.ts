#!/usr/bin/env tsx
/**
 * Conservation guard CLI (Phoenix essay 14 / ADR-114).
 *
 * Captures AQE's human/agent-facing surfaces and fails CI on breaking removals
 * that aren't in the deprecation registry. Internals regenerate freely; these
 * surfaces change only additively (or via a deprecation window).
 *
 *   tsx scripts/conservation-guard.ts            # report
 *   tsx scripts/conservation-guard.ts --ci       # exit 1 on breaking change
 *   tsx scripts/conservation-guard.ts --update    # deliberately rebaseline
 *
 * Surfaces covered here: CLI commands, skill output schemas. MCP tool names are
 * guarded separately by `npm run mcp:parity`; the dashboard by its visual snapshot.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { diffSurface, aggregate, formatReport } from '../src/validation/conservation-guard.js';

const BASE_DIR = 'verification/conservation';
const DEPRECATIONS_PATH = join(BASE_DIR, 'deprecations.json');

/** Top-level CLI command names (commander lazy registrations in src/cli/index.ts). */
function extractCliCommands(): string[] {
  const src = readFileSync('src/cli/index.ts', 'utf8');
  const names = new Set<string>();
  for (const m of src.matchAll(/registerLazyHandler\(program,\s*'([^']+)'/g)) names.add(m[1]);
  // object form: registerLazyCommand(program, { name: '...' , ... })
  for (const seg of src.split(/registerLazyCommand\(program,\s*\{/).slice(1)) {
    const m = /name:\s*'([^']+)'/.exec(seg);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

/** `<skill>::<topLevelKey>` for every skill output schema — the consumer contract. */
function extractOutputSchemaKeys(): string[] {
  const skillsDir = '.claude/skills';
  const out: string[] = [];
  if (!existsSync(skillsDir)) return out;
  for (const sk of readdirSync(skillsDir)) {
    const p = join(skillsDir, sk, 'schemas', 'output.json');
    if (!existsSync(p)) continue;
    try {
      const schema = JSON.parse(readFileSync(p, 'utf8')) as { properties?: Record<string, unknown> };
      const props = schema.properties ?? (schema as Record<string, unknown>);
      for (const key of Object.keys(props)) out.push(`${sk}::${key}`);
    } catch {
      /* skip malformed schema */
    }
  }
  return out.sort();
}

/**
 * Public API surface of the qe-dashboard module. The dashboard renders no DOM
 * in-repo (it's a WASM vector-store + clustering library), so its conservation
 * layer is its exported symbols. Rendered UIs use visual-regression instead —
 * see viewport-capture / qe-visual-tester (docs/guides/conservation-layer-policy.md).
 */
function extractDashboardApi(): string[] {
  const dir = 'src/integrations/browser/qe-dashboard';
  if (!existsSync(dir)) return [];
  const names = new Set<string>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/export (?:class|function|const|interface|type|enum) ([A-Za-z0-9_]+)/g)) names.add(m[1]);
    // re-export blocks: export { A, B as C } from '...'
    for (const block of src.matchAll(/export \{([^}]*)\}/g)) {
      for (const part of block[1].split(',')) {
        const id = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (id && /^[A-Za-z0-9_]+$/.test(id)) names.add(id);
      }
    }
  }
  return [...names].sort();
}

/**
 * Skills shipped by the .kiro tree. .kiro is an INTENTIONALLY divergent variant
 * (its own frontmatter convention + some skills carry large .kiro-specific bodies,
 * e.g. qcsd-cicd-swarm), so it is gated by PRESENCE here — a skill disappearing
 * from .kiro is a regression — rather than by body-equality (which would force
 * destroying that divergence). Faithful body-mirrors (assets, plugins) are gated
 * strictly by `npm run verify:skill-parity`.
 */
function extractKiroSkills(): string[] {
  const dir = '.kiro/skills';
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => existsSync(join(dir, n, 'SKILL.md')))
    .sort();
}

function loadDeprecations(): Record<string, string[]> {
  if (!existsSync(DEPRECATIONS_PATH)) return {};
  try {
    const d = JSON.parse(readFileSync(DEPRECATIONS_PATH, 'utf8')) as { surfaces?: Record<string, Array<{ entry: string }>> };
    const out: Record<string, string[]> = {};
    for (const [surface, list] of Object.entries(d.surfaces ?? {})) out[surface] = list.map((e) => e.entry);
    return out;
  } catch {
    return {};
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const update = args.includes('--update');
  const ci = args.includes('--ci');

  const surfaces: Record<string, string[]> = {
    'cli-commands': extractCliCommands(),
    'output-schemas': extractOutputSchemaKeys(),
    'dashboard-api': extractDashboardApi(),
    'kiro-skills': extractKiroSkills(),
  };
  const deprecations = loadDeprecations();
  mkdirSync(BASE_DIR, { recursive: true });

  const diffs = [];
  for (const [name, current] of Object.entries(surfaces)) {
    const baselinePath = join(BASE_DIR, `${name}.json`);
    const fresh = !existsSync(baselinePath);
    if (update || fresh) {
      writeFileSync(baselinePath, JSON.stringify({ surface: name, count: current.length, entries: current }, null, 2) + '\n');
      console.log(`baseline ${fresh ? 'created' : 'updated'}: ${name} (${current.length} entries)`);
      diffs.push(diffSurface(name, current, current));
      continue;
    }
    const baseline = (JSON.parse(readFileSync(baselinePath, 'utf8')) as { entries: string[] }).entries;
    diffs.push(diffSurface(name, baseline, current, deprecations[name] ?? []));
  }

  const report = aggregate(diffs);
  console.log('\n' + formatReport(report));
  console.log('\n(MCP tool names guarded by `npm run mcp:parity`; rendered UIs by visual-regression — see conservation-layer-policy.md.)');

  if (ci && !report.clean) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
