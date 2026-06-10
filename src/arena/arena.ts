/**
 * Agentic QE v3 - Competitive Test-Strategy Arena (ADR-104, Phase 1)
 *
 * Strategies are deterministic selections of fixture test groups; fitness
 * comes from REAL runs: mutation kill rate (built-in operator mutants,
 * `node --test` per mutant) + line coverage − a runtime penalty. The
 * tournament produces Wolfram-style pairwise competitive arrays; optional
 * hill-climb evolves the winner by seeded group flips with re-evaluation.
 *
 * Reproducibility contract: with the same seed and fixture, every field
 * of the result envelope is identical across runs EXCEPT
 * `informational.runtimesMs` (real wall-clock, reported but excluded —
 * the fitness runtime term uses ordinal rank, which is stable because
 * group runtimes differ by design).
 */

import * as fs from 'fs';
import * as path from 'path';
import { mulberry32, nextInt, type Rng } from './rng.js';
import { enumerateMutants, applyMutant, type Mutant } from './mutator.js';
import {
  discoverFixture,
  prepareWorkspace,
  runNodeTest,
  makeTmpRoot,
  cleanupTmpRoot,
  type FixtureLayout,
} from './runner.js';

export interface ArenaStrategy {
  id: string;
  name: string;
  groups: string[];
}

export interface EvaluatedStrategy extends ArenaStrategy {
  baselinePassed: boolean;
  mutantsKilled: number;
  mutantsTotal: number;
  killRate: number;
  coveragePct: number | null;
  /** Deterministic runtime proxy: selected groups / total groups (0..1) */
  suiteCostRatio: number;
  fitness: number;
}

export interface ArenaResult {
  contract: 'arena-result@1';
  seed: number;
  target: string;
  weights: { kill: number; coverage: number; runtimePenalty: number };
  mutantsTotal: number;
  strategies: EvaluatedStrategy[];
  /** strategy ids best→worst */
  ranking: string[];
  /** competitiveArray[i][j]: 1 if strategies[i] beats [j], -1 if loses, 0 tie (by fitness) */
  competitiveArray: number[][];
  evolution: Array<{ step: number; groups: string[]; fitness: number; accepted: boolean }>;
  informational: { runtimesMs: Record<string, number> };
}

export interface ArenaOptions {
  target: string;
  strategies?: number;
  seed?: number;
  maxMutants?: number;
  evolveSteps?: number;
  log?: (line: string) => void;
}

const WEIGHTS = { kill: 0.6, coverage: 0.3, runtimePenalty: 0.1 } as const;

/** First strategy is always the full suite; the rest are seeded distinct subsets. */
export function buildStrategies(groups: string[], n: number, rng: Rng): ArenaStrategy[] {
  const sorted = [...groups].sort();
  const seen = new Set<string>([sorted.join('+')]);
  const strategies: ArenaStrategy[] = [
    { id: 's1', name: `all(${sorted.join('+')})`, groups: sorted },
  ];
  let guard = 0;
  while (strategies.length < n && guard++ < 200) {
    const subset = sorted.filter(() => rng() < 0.5);
    if (subset.length === 0) continue;
    const key = subset.join('+');
    if (seen.has(key)) continue;
    seen.add(key);
    strategies.push({ id: `s${strategies.length + 1}`, name: key, groups: subset });
  }
  return strategies;
}

/**
 * Fitness with a DETERMINISTIC runtime term: at fixture scale, measured
 * wall-clock is jitter-dominated (node boot ≈ the suite runtime), so the
 * penalty uses suite-size ratio as the runtime proxy. Real per-strategy
 * milliseconds are still reported under `informational`.
 */
function fitnessOf(killRate: number, coveragePct: number | null, suiteCostRatio: number): number {
  const coverageTerm = coveragePct === null ? 0 : coveragePct / 100;
  const f = WEIGHTS.kill * killRate + WEIGHTS.coverage * coverageTerm - WEIGHTS.runtimePenalty * suiteCostRatio;
  return Math.round(f * 10000) / 10000;
}

function evaluateStrategy(
  layout: FixtureLayout,
  strategy: ArenaStrategy,
  mutantsByFile: Array<{ relPath: string; source: string; mutants: Mutant[] }>,
  tmpRoot: string
): { baselinePassed: boolean; killed: number; total: number; coveragePct: number | null; runtimeMs: number } {
  const baselineDir = prepareWorkspace({ layout, groups: strategy.groups }, tmpRoot);
  const baseline = runNodeTest(baselineDir, { coverage: true });
  if (!baseline.ok) {
    return { baselinePassed: false, killed: 0, total: 0, coveragePct: baseline.coveragePct, runtimeMs: baseline.durationMs };
  }

  let killed = 0;
  let total = 0;
  for (const file of mutantsByFile) {
    for (const mutant of file.mutants) {
      total++;
      const dir = prepareWorkspace(
        { layout, groups: strategy.groups, mutatedFile: { relPath: file.relPath, content: applyMutant(file.source, mutant) } },
        tmpRoot
      );
      const run = runNodeTest(dir);
      if (!run.ok) killed++;
    }
  }
  return { baselinePassed: true, killed, total, coveragePct: baseline.coveragePct, runtimeMs: baseline.durationMs };
}

export function runArena(options: ArenaOptions): ArenaResult {
  const seed = options.seed ?? 42;
  const log = options.log ?? (() => {});
  const rng = mulberry32(seed);
  const layout = discoverFixture(options.target);
  const tmpRoot = makeTmpRoot();

  try {
    // Enumerate + deterministically sample mutants
    const maxMutants = options.maxMutants ?? 24;
    const mutantsByFile = layout.sourceFiles.map((relPath) => {
      const source = fs.readFileSync(path.join(layout.root, relPath), 'utf8');
      return { relPath, source, mutants: enumerateMutants(source, relPath) };
    });
    let allMutants = mutantsByFile.flatMap((f) => f.mutants.map((m) => ({ file: f.relPath, m })));
    if (allMutants.length > maxMutants) {
      const picked = new Set<string>();
      while (picked.size < maxMutants) {
        picked.add(allMutants[nextInt(rng, allMutants.length)].m.id);
      }
      for (const f of mutantsByFile) {
        f.mutants = f.mutants.filter((m) => picked.has(m.id));
      }
      allMutants = mutantsByFile.flatMap((f) => f.mutants.map((m) => ({ file: f.relPath, m })));
    }
    log(`mutants: ${allMutants.length} (of ${mutantsByFile.reduce((n, f) => n + enumerateMutants(f.source, f.relPath).length, 0)} enumerated)`);

    // Build + evaluate strategies (real runs)
    const strategies = buildStrategies(Object.keys(layout.testGroups), options.strategies ?? 4, rng);
    const runtimesMs: Record<string, number> = {};
    const raw = strategies.map((s) => {
      log(`evaluating ${s.id} [${s.name}] ...`);
      const e = evaluateStrategy(layout, s, mutantsByFile, tmpRoot);
      runtimesMs[s.id] = e.runtimeMs;
      return { s, e };
    });

    const totalGroups = Object.keys(layout.testGroups).length;
    const evaluated: EvaluatedStrategy[] = raw.map(({ s, e }) => {
      const killRate = e.total > 0 ? Math.round((e.killed / e.total) * 10000) / 10000 : 0;
      const suiteCostRatio = Math.round((s.groups.length / totalGroups) * 10000) / 10000;
      return {
        ...s,
        baselinePassed: e.baselinePassed,
        mutantsKilled: e.killed,
        mutantsTotal: e.total,
        killRate,
        coveragePct: e.coveragePct,
        suiteCostRatio,
        fitness: e.baselinePassed ? fitnessOf(killRate, e.coveragePct, suiteCostRatio) : 0,
      };
    });

    const ranking = [...evaluated]
      .sort((a, b) => b.fitness - a.fitness || a.id.localeCompare(b.id))
      .map((s) => s.id);
    const competitiveArray = evaluated.map((a) =>
      evaluated.map((b) => (a.fitness > b.fitness ? 1 : a.fitness < b.fitness ? -1 : 0))
    );

    // Optional hill-climb from the winner: seeded single-group flips,
    // accept only on real fitness improvement
    const evolution: ArenaResult['evolution'] = [];
    if (options.evolveSteps && options.evolveSteps > 0) {
      const allGroups = Object.keys(layout.testGroups).sort();
      let bestGroups = evaluated.find((s) => s.id === ranking[0])!.groups;
      let bestFitness = evaluated.find((s) => s.id === ranking[0])!.fitness;
      for (let step = 1; step <= options.evolveSteps; step++) {
        const flip = allGroups[nextInt(rng, allGroups.length)];
        const candidate = bestGroups.includes(flip)
          ? bestGroups.filter((g) => g !== flip)
          : [...bestGroups, flip].sort();
        if (candidate.length === 0) {
          evolution.push({ step, groups: candidate, fitness: 0, accepted: false });
          continue;
        }
        const e = evaluateStrategy(layout, { id: `evo${step}`, name: candidate.join('+'), groups: candidate }, mutantsByFile, tmpRoot);
        const killRate = e.total > 0 ? e.killed / e.total : 0;
        const f = e.baselinePassed ? fitnessOf(killRate, e.coveragePct, candidate.length / allGroups.length) : 0;
        const accepted = f > bestFitness;
        evolution.push({ step, groups: candidate, fitness: f, accepted });
        if (accepted) {
          bestGroups = candidate;
          bestFitness = f;
        }
      }
    }

    return {
      contract: 'arena-result@1',
      seed,
      target: path.relative(process.cwd(), layout.root) || '.',
      weights: { ...WEIGHTS },
      mutantsTotal: allMutants.length,
      strategies: evaluated,
      ranking,
      competitiveArray,
      evolution,
      informational: { runtimesMs },
    };
  } finally {
    cleanupTmpRoot(tmpRoot);
  }
}
