/**
 * ADR-122 DoE aggregator — reads the per-cell results JSONL and computes a REAL
 * main-effects factorial ANOVA over the per-replicate BINARY outcomes.
 *
 * Each JSONL row is one CELL: a fixed (model, prompt, retrieval, scaffold, item)
 * run N times, `reps` holding the N pass/fail (0/1) replicate outcomes. A single
 * replicate is the unit of observation, so the within-cell spread of `reps` is
 * genuine stochastic (temperature) error — the ANOVA error term. Without it there
 * is no F-test, which is exactly the CRIT-2 defect in the old range-proxy report.
 *
 * Model (main effects only, no interactions):
 *   Total SS   = Σ_obs (y − grand)²
 *   Factor SS  = Σ_levels n_level·(mean_level − grand)²      (weighted by #obs)
 *   Error SS   = Σ_cells Σ_reps (y − cell_mean)²             (PURE within-cell error)
 *   df_factor  = #levels − 1        df_error = N_obs − #cells
 *   F          = MS_factor / MS_error         p = P(F_{df_f,df_e} > F)
 *
 * The p-value uses the F-distribution survival function expressed through the
 * regularized incomplete beta I_x(a,b) (Numerical Recipes betai/betacf, no deps):
 *   P(F_{d1,d2} > f) = I_{d2/(d2+d1·f)}(d2/2, d1/2).
 *
 * Unbalanced cells (e.g. opus with n=7 replicates vs n=5) are handled honestly:
 * factor SS weights each level mean by its own observation count, and a note is
 * printed whenever replicate counts differ across cells (the design is not
 * perfectly balanced, so main-effect estimates are marginal, not orthogonal).
 *
 * Stat helpers are exported for unit testing (tests/unit/scripts/doe-aggregate.test.ts).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SIG = 0.05; // significance threshold for the F-test

export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

// ---- log-gamma (Lanczos approximation, Numerical Recipes) ----
export function gammaln(x) {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) { y += 1; ser += cof[j] / y; }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

// ---- continued fraction for the incomplete beta (Lentz's method) ----
function betacf(a, b, x) {
  const MAXIT = 300;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/**
 * Regularized incomplete beta I_x(a,b) ∈ [0,1]. This IS the F/Student/beta CDF
 * kernel; validated in the unit test against closed forms (I_x(1,1)=x,
 * I_x(2,2)=x²(3−2x), I_{0.5}(a,a)=0.5).
 */
export function betai(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/**
 * Upper-tail p-value of the F distribution: P(F_{d1,d2} > f).
 * Validated: fPValue(1, d, d) = 0.5 (F=1 at equal df); f≤0 → 1; f→∞ → 0.
 */
export function fPValue(f, d1, d2) {
  if (!(f > 0) || !(d1 > 0) || !(d2 > 0)) return 1;
  const x = d2 / (d2 + d1 * f);
  return betai(d2 / 2, d1 / 2, x);
}

/**
 * Main-effects factorial ANOVA over per-replicate binary outcomes.
 * @param {Array<Object>} rows  cells with { <factor>: level, reps: number[] }
 * @param {string[]} factors    factor column names
 * @returns aggregate + per-factor { levels:[{level,n,mean}], ss, df, ms, F, p, dfError }
 */
export function anovaMainEffects(rows, factors) {
  // Flatten each replicate into one observation, tagged with its cell key.
  const obs = [];
  for (const r of rows) {
    const reps = Array.isArray(r.reps) ? r.reps : [];
    const cellKey = factors.map((f) => r[f]).join('|');
    for (const y of reps) obs.push({ row: r, y: Number(y), cellKey });
  }
  const N = obs.length;
  const grand = mean(obs.map((o) => o.y));
  const totalSS = obs.reduce((s, o) => s + (o.y - grand) ** 2, 0);

  // Pure within-cell error (the replication / temperature variance).
  const cells = new Map();
  for (const o of obs) {
    if (!cells.has(o.cellKey)) cells.set(o.cellKey, []);
    cells.get(o.cellKey).push(o.y);
  }
  let errorSS = 0;
  for (const ys of cells.values()) {
    const m = mean(ys);
    errorSS += ys.reduce((s, y) => s + (y - m) ** 2, 0);
  }
  const numCells = cells.size;
  const dfError = N - numCells;
  const msError = dfError > 0 ? errorSS / dfError : NaN;

  const perFactor = {};
  for (const f of factors) {
    const levels = [...new Set(rows.map((r) => r[f]))];
    const levelStats = levels.map((lv) => {
      const ys = obs.filter((o) => o.row[f] === lv).map((o) => o.y);
      return { level: lv, n: ys.length, mean: mean(ys) };
    });
    const ss = levelStats.reduce((s, ls) => s + ls.n * (ls.mean - grand) ** 2, 0);
    const df = levels.length - 1;
    const ms = df > 0 ? ss / df : 0;
    const F = df > 0 && Number.isFinite(msError) && msError > 0 ? ms / msError : NaN;
    const p = Number.isFinite(F) ? fPValue(F, df, dfError) : NaN;
    perFactor[f] = { levels: levelStats, ss, df, ms, F, p, dfError };
  }

  // Balance: are all cells the same replicate count?
  const repCounts = [...cells.values()].map((ys) => ys.length);
  const balanced = repCounts.every((c) => c === repCounts[0]);

  return { N, grand, totalSS, errorSS, dfError, msError, numCells, perFactor, balanced, repCounts };
}

// ---------------------------------------------------------------------------
// CLI (skipped when imported, e.g. by the unit test).
// ---------------------------------------------------------------------------
function main(file) {
  const rows = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const factors = ['model', 'prompt', 'retrieval', 'scaffold'];
  const a = anovaMainEffects(rows, factors);

  const item = rows[0]?.item ?? '(unknown)';
  console.log(`\n=== ADR-122 DoE SCREEN — ${rows.length} cells, ${a.N} binary replicate observations ===`);
  console.log(`fixed anchor item: ${item}   grand pass-rate: ${a.grand.toFixed(3)}   cells: ${a.numCells}`);
  if (!a.balanced) {
    console.log(`NOTE: unbalanced design — replicate counts per cell vary (${Math.min(...a.repCounts)}..${Math.max(...a.repCounts)}); `
      + `main effects are marginal (weighted by #obs), not orthogonal.`);
  }
  console.log(`error term (within-cell): SS=${a.errorSS.toFixed(3)}  df=${a.dfError}  MS=${Number.isFinite(a.msError) ? a.msError.toFixed(4) : 'n/a'}\n`);

  console.log('=== MAIN EFFECTS (real ANOVA F-test on per-replicate pass/fail) ===');
  for (const f of factors) {
    const pf = a.perFactor[f];
    console.log(`\n${f}:`);
    for (const ls of pf.levels) {
      console.log(`  ${String(ls.level).padEnd(16)} passRate=${ls.mean.toFixed(3)}  (n=${ls.n} reps)`);
    }
    const fStr = Number.isFinite(pf.F) ? pf.F.toFixed(3) : 'n/a';
    const pStr = Number.isFinite(pf.p) ? pf.p.toExponential(2) : 'n/a';
    const sig = Number.isFinite(pf.p) && pf.p < SIG ? `SIGNIFICANT (p<${SIG})` : `not significant (p≥${SIG})`;
    console.log(`  → F(${pf.df},${pf.dfError})=${fStr}  p=${pStr}  ${sig}`);
  }

  // Rank factors by variance actually explained (SS share), not by a raw range.
  console.log('\n=== which factor explains the most pass-rate variance (SS share) ===');
  const denom = factors.reduce((s, f) => s + a.perFactor[f].ss, 0) + a.errorSS;
  factors
    .map((f) => ({ f, ss: a.perFactor[f].ss, p: a.perFactor[f].p }))
    .sort((x, y) => y.ss - x.ss)
    .forEach((r) => {
      const share = denom > 0 ? (100 * r.ss) / denom : 0;
      const pStr = Number.isFinite(r.p) ? r.p.toExponential(2) : 'n/a';
      console.log(`  ${r.f.padEnd(10)} SS=${r.ss.toFixed(3)}  (${share.toFixed(1)}% of total)  p=${pStr}`);
    });

  // beads check on the two FEATURE factors — "no quality gain" is now decided by
  // the F-test p-value, not by an eyeballed mean delta.
  console.log('\n=== FEATURE verdict (beads: cost up + no SIGNIFICANT quality gain = drop it) ===');
  for (const f of ['retrieval', 'scaffold']) {
    const pf = a.perFactor[f];
    const significant = Number.isFinite(pf.p) && pf.p < SIG;
    const baseLv = f === 'retrieval' ? 'off' : 'none';
    const baseStat = pf.levels.find((l) => l.level === baseLv) ?? pf.levels[0];
    const baseCost = mean(rows.filter((r) => r[f] === baseStat.level).map((r) => r.cost ?? 0));
    for (const ls of pf.levels) {
      if (ls.level === baseStat.level) continue;
      const dPP = ls.mean - baseStat.mean;
      const dCost = mean(rows.filter((r) => r[f] === ls.level).map((r) => r.cost ?? 0)) - baseCost;
      let verdict;
      if (!significant) verdict = dCost > 0 ? 'DROP (beads: +cost, effect not significant)' : 'neutral (effect not significant)';
      else verdict = dPP > 0 ? 'KEEP (significant quality gain)' : 'DROP (significant but NEGATIVE)';
      const pStr = Number.isFinite(pf.p) ? pf.p.toExponential(2) : 'n/a';
      console.log(`  ${f}=${ls.level} vs ${baseStat.level}:  ΔpassRate=${dPP >= 0 ? '+' : ''}${dPP.toFixed(3)}  `
        + `ΔmeanCost=${dCost >= 0 ? '+' : ''}$${dCost.toFixed(4)}  (factor p=${pStr}) => ${verdict}`);
    }
  }

  const totalCost = rows.reduce((s, r) => s + (r.cost ?? 0), 0);
  console.log(`\nTOTAL SPEND: $${totalCost.toFixed(3)} across ${rows.length} cells / ${a.N} generations.`);
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node scripts/doe-aggregate.mjs <results.jsonl>'); process.exit(2); }
  main(file);
}
