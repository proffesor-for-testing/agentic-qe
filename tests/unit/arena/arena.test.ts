/**
 * Unit + integration tests for qe-arena Phase 1 (ADR-104)
 *
 * Pure pieces (rng, mutator, strategy building) are tested directly;
 * the integration test runs the REAL engine against the committed demo
 * fixture with `node --test` — no native modules involved, no simulation.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { mulberry32, sample } from '../../../src/arena/rng';
import { enumerateMutants, applyMutant } from '../../../src/arena/mutator';
import { buildStrategies, runArena, type ArenaResult } from '../../../src/arena/arena';

const FIXTURE = path.resolve(__dirname, '../../../fixtures/arena-demo');

describe('mulberry32', () => {
  it('should produce the same sequence for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);

    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('should produce different sequences for different seeds', () => {
    expect(mulberry32(42)()).not.toBe(mulberry32(43)());
  });

  it('should sample deterministically', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];

    expect(sample(mulberry32(7), items, 3)).toEqual(sample(mulberry32(7), items, 3));
  });
});

describe('enumerateMutants', () => {
  const source = fs.readFileSync(path.join(FIXTURE, 'src/pricing.mjs'), 'utf8');

  it('should enumerate a stable, position-sorted mutant list', () => {
    const a = enumerateMutants(source, 'pricing');
    const b = enumerateMutants(source, 'pricing');

    expect(a.length).toBeGreaterThan(10);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x.index - y.index)).toEqual(a);
  });

  it('should not mutate inside string literals', () => {
    const mutants = enumerateMutants(source, 'pricing');
    const msgIndex = source.indexOf('price must be >= 0');

    const inString = mutants.filter(
      (m) => m.index >= msgIndex && m.index < msgIndex + 'price must be >= 0'.length
    );
    expect(inString).toEqual([]);
  });

  it('should not mutate the > of an arrow function', () => {
    const arrowSource = 'const f = (x) => x > 1;';

    const mutants = enumerateMutants(arrowSource, 't');

    expect(mutants.some((m) => m.index === arrowSource.indexOf('=>') + 1)).toBe(false);
    expect(mutants.some((m) => m.from === '>' && m.index === arrowSource.indexOf('x > 1') + 2)).toBe(true);
  });

  it('should apply a mutant as an exact splice', () => {
    const src = 'if (a === b) { c = a + b; }';
    const mutants = enumerateMutants(src, 't');
    const eq = mutants.find((m) => m.from === '===')!;

    expect(applyMutant(src, eq)).toBe('if (a !== b) { c = a + b; }');
  });
});

describe('buildStrategies', () => {
  it('should always lead with the full suite and be seed-deterministic', () => {
    const groups = ['boundary', 'errors', 'exhaustive', 'happy'];

    const a = buildStrategies(groups, 4, mulberry32(42));
    const b = buildStrategies(groups, 4, mulberry32(42));

    expect(a[0].groups).toEqual(['boundary', 'errors', 'exhaustive', 'happy']);
    expect(a).toEqual(b);
    expect(new Set(a.map((s) => s.name)).size).toBe(a.length);
  });
});

describe('runArena (real engine, demo fixture)', { timeout: 180_000 }, () => {
  const stripNondeterministic = (r: ArenaResult) => {
    const { informational: _informational, ...deterministic } = r;
    return deterministic;
  };

  it('should be byte-reproducible under the same seed (excluding wall-clock)', () => {
    const opts = { target: FIXTURE, strategies: 3, seed: 42, maxMutants: 6 };

    const first = runArena(opts);
    const second = runArena(opts);

    expect(stripNondeterministic(second)).toEqual(stripNondeterministic(first));
  });

  it('should rank the full suite at or above the weakest subset on kill rate', () => {
    const result = runArena({ target: FIXTURE, strategies: 3, seed: 42, maxMutants: 6 });

    const full = result.strategies.find((s) => s.id === 's1')!;
    expect(full.baselinePassed).toBe(true);
    expect(full.mutantsTotal).toBe(6);
    for (const s of result.strategies) {
      expect(full.killRate).toBeGreaterThanOrEqual(s.killRate * 0.999);
    }
    // competitive array is antisymmetric with a zero diagonal
    result.competitiveArray.forEach((row, i) => {
      expect(row[i]).toBe(0);
      row.forEach((v, j) => expect(v + result.competitiveArray[j][i]).toBe(0));
    });
  });

  it('should attach a darwin-guard screen that is a no-op on an all-valid honest population', () => {
    const result = runArena({ target: FIXTURE, strategies: 3, seed: 42, maxMutants: 6 });

    // Honest strategies are all structurally valid → nothing excluded, and the
    // guard seeds selection from the same winner the raw ranking would.
    expect(result.guard.contract).toBe('darwin-guard@1');
    expect(result.guard.excluded).toEqual([]);
    expect(result.guard.validRanking).toEqual(result.ranking);
    expect(result.guard.seededWinner).toBe(result.ranking[0]);
    expect(result.guard.population.count).toBe(result.strategies.length);
  });
});
