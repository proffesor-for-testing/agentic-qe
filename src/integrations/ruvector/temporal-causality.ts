/**
 * Granger Causality for Test Failure Prediction (R12, ADR-087 Milestone 4)
 *
 * Temporal causal discovery: finds causal chains between test failures.
 * E.g. "when test_login fails, test_checkout fails 5min later at 87%."
 *
 * Algorithm: Bivariate VAR(p) + F-test with OLS via Gaussian elimination
 * and regularized incomplete beta function for F-distribution CDF.
 *
 * @module integrations/ruvector/temporal-causality
 */

// -- Types ------------------------------------------------------------------

/** A time series of test execution outcomes */
export interface TestExecutionHistory {
  testId: string;
  /** Sorted ascending */
  timestamps: number[];
  /** 1 = pass, 0 = fail */
  outcomes: number[];
}

/** A discovered causal link between two tests */
export interface CausalLink {
  sourceTestId: string;
  targetTestId: string;
  lag: number;
  fStatistic: number;
  pValue: number;
  /** Average absolute coefficient magnitude */
  strength: number;
  direction: 'positive' | 'negative';
}

/** Configuration for the Granger analyzer */
export interface GrangerConfig {
  maxLag: number;
  alpha: number;
  minSeriesLength: number;
}

const DEFAULT_CONFIG: GrangerConfig = { maxLag: 5, alpha: 0.05, minSeriesLength: 30 };
const BETA_CF_MAX_ITER = 200;
const BETA_CF_EPS = 1e-10;
const OLS_EPS = 1e-12;

// -- Statistical math: lnGamma, incomplete beta, F-distribution CDF ---------

/** Lanczos approximation of ln(Gamma(z)). */
function lnGamma(z: number): number {
  if (z <= 0) return Infinity;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function lnBeta(a: number, b: number): number {
  return lnGamma(a) + lnGamma(b) - lnGamma(a + b);
}

/** Regularized incomplete beta I_x(a,b) via continued fraction (Lentz). */
function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (a <= 0 || b <= 0) return NaN;
  if (x > (a + 1) / (a + b + 2)) return 1 - regularizedIncompleteBeta(1 - x, b, a);

  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta(a, b) - Math.log(a));
  let c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < BETA_CF_EPS) d = BETA_CF_EPS;
  d = 1 / d;
  let f = d;

  for (let m = 1; m <= BETA_CF_MAX_ITER; m++) {
    let num = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + num * d; if (Math.abs(d) < BETA_CF_EPS) d = BETA_CF_EPS;
    c = 1 + num / c; if (Math.abs(c) < BETA_CF_EPS) c = BETA_CF_EPS;
    d = 1 / d; f *= c * d;

    num = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d; if (Math.abs(d) < BETA_CF_EPS) d = BETA_CF_EPS;
    c = 1 + num / c; if (Math.abs(c) < BETA_CF_EPS) c = BETA_CF_EPS;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < BETA_CF_EPS) break;
  }
  return front * f;
}

/** F-distribution CDF via incomplete beta: P(F<=x) = I_{d1*x/(d1*x+d2)}(d1/2, d2/2) */
function fDistributionCDF(x: number, d1: number, d2: number): number {
  if (x <= 0) return 0;
  if (d1 <= 0 || d2 <= 0) return NaN;
  if (!isFinite(x)) return 1;
  return regularizedIncompleteBeta((d1 * x) / (d1 * x + d2), d1 / 2, d2 / 2);
}

// -- OLS Regression ---------------------------------------------------------

/** Solve A*x = b via Gaussian elimination with partial pivoting. */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxVal = Math.abs(aug[col][col]), maxRow = col;
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(aug[row][col]);
      if (v > maxVal) { maxVal = v; maxRow = row; }
    }
    if (maxVal < OLS_EPS) return null;
    if (maxRow !== col) [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    for (let row = col + 1; row < n; row++) {
      const f = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) aug[row][j] -= f * aug[col][j];
    }
  }

  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    if (Math.abs(aug[row][row]) < OLS_EPS) return null;
    let sum = aug[row][n];
    for (let j = row + 1; j < n; j++) sum -= aug[row][j] * x[j];
    x[row] = sum / aug[row][row];
  }
  return x;
}

/** OLS: beta = (X'X)^{-1} X'y via normal equations. */
function olsRegression(X: number[][], y: number[]): number[] | null {
  const n = y.length, p = X[0].length;
  const XtX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = i; j < p; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += X[k][i] * X[k][j];
      XtX[i][j] = s; XtX[j][i] = s;
    }
  }
  const Xty = new Array(p).fill(0);
  for (let i = 0; i < p; i++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += X[k][i] * y[k];
    Xty[i] = s;
  }
  return solveLinearSystem(XtX, Xty);
}

/** Residual sum of squares for y = X * beta. */
function computeRSS(X: number[][], y: number[], beta: number[]): number {
  let rss = 0;
  for (let i = 0; i < y.length; i++) {
    let pred = 0;
    for (let j = 0; j < beta.length; j++) pred += X[i][j] * beta[j];
    const r = y[i] - pred;
    rss += r * r;
  }
  return rss;
}

// -- Time series alignment --------------------------------------------------

/** Align two series to a common time grid (nearest-neighbor binning). */
function alignTimeSeries(
  source: TestExecutionHistory, target: TestExecutionHistory,
): { sourceOutcomes: number[]; targetOutcomes: number[] } | null {
  const minT = Math.max(source.timestamps[0] ?? Infinity, target.timestamps[0] ?? Infinity);
  const maxT = Math.min(
    source.timestamps[source.timestamps.length - 1] ?? -Infinity,
    target.timestamps[target.timestamps.length - 1] ?? -Infinity,
  );
  if (minT >= maxT) return null;

  const intervals: number[] = [];
  for (const ts of [source, target])
    for (let i = 1; i < ts.timestamps.length; i++) {
      const dt = ts.timestamps[i] - ts.timestamps[i - 1];
      if (dt > 0) intervals.push(dt);
    }
  if (intervals.length === 0) return null;
  intervals.sort((a, b) => a - b);
  const bin = intervals[Math.floor(intervals.length / 2)];
  if (bin <= 0) return null;

  const nBins = Math.floor((maxT - minT) / bin) + 1;
  if (nBins < 2) return null;

  const srcOut = new Array(nBins).fill(0);
  const tgtOut = new Array(nBins).fill(0);
  for (const [series, out] of [[source, srcOut], [target, tgtOut]] as const) {
    for (let i = 0; i < series.timestamps.length; i++) {
      const b = Math.round((series.timestamps[i] - minT) / bin);
      if (b >= 0 && b < nBins) out[b] = series.outcomes[i];
    }
  }
  return { sourceOutcomes: srcOut, targetOutcomes: tgtOut };
}

// -- Granger Analyzer -------------------------------------------------------

export class GrangerAnalyzer {
  private readonly config: GrangerConfig;

  constructor(config?: Partial<GrangerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Analyze all pairs; returns only significant links (p < alpha). */
  analyzeCausality(timeSeries: TestExecutionHistory[]): CausalLink[] {
    if (timeSeries.length < 2) return [];
    const links: CausalLink[] = [];

    for (let i = 0; i < timeSeries.length; i++) {
      for (let j = 0; j < timeSeries.length; j++) {
        if (i === j) continue;
        const src = timeSeries[i], tgt = timeSeries[j];
        if (src.outcomes.length < this.config.minSeriesLength ||
            tgt.outcomes.length < this.config.minSeriesLength) continue;

        let best: CausalLink | null = null;
        for (let lag = 1; lag <= this.config.maxLag; lag++) {
          const link = this.testPairwise(src, tgt, lag);
          if (this.significanceTest(link) && (best === null || link.pValue < best.pValue))
            best = link;
        }
        if (best) links.push(best);
      }
    }
    links.sort((a, b) => a.pValue - b.pValue);
    return links;
  }

  /** Test Granger causality for one pair at one lag via VAR(p) + F-test. */
  testPairwise(source: TestExecutionHistory, target: TestExecutionHistory, lag: number): CausalLink {
    const def: CausalLink = {
      sourceTestId: source.testId, targetTestId: target.testId,
      lag, fStatistic: 0, pValue: 1, strength: 0, direction: 'positive',
    };

    let srcData: number[], tgtData: number[];
    if (this.arraysEqual(source.timestamps, target.timestamps)) {
      srcData = source.outcomes; tgtData = target.outcomes;
    } else {
      const a = alignTimeSeries(source, target);
      if (!a) return def;
      srcData = a.sourceOutcomes; tgtData = a.targetOutcomes;
    }

    const n = tgtData.length, effN = n - lag, dfDenom = effN - 2 * lag - 1;
    if (dfDenom <= 0 || effN < this.config.minSeriesLength) return def;

    const y = new Array(effN);
    for (let t = 0; t < effN; t++) y[t] = tgtData[t + lag];

    const yMean = y.reduce((s: number, v: number) => s + v, 0) / y.length;
    if (y.reduce((s: number, v: number) => s + (v - yMean) ** 2, 0) < OLS_EPS) return def;

    // Restricted: [intercept, Y(t-1)..Y(t-lag)]
    const Xr = new Array(effN);
    for (let t = 0; t < effN; t++) {
      const row = new Array(lag + 1); row[0] = 1;
      for (let k = 1; k <= lag; k++) row[k] = tgtData[t + lag - k];
      Xr[t] = row;
    }
    // Unrestricted: [intercept, Y lags, X lags]
    const Xu = new Array(effN);
    for (let t = 0; t < effN; t++) {
      const row = new Array(2 * lag + 1); row[0] = 1;
      for (let k = 1; k <= lag; k++) row[k] = tgtData[t + lag - k];
      for (let k = 1; k <= lag; k++) row[lag + k] = srcData[t + lag - k];
      Xu[t] = row;
    }

    const betaR = olsRegression(Xr, y);
    if (!betaR) return def;
    const rssR = computeRSS(Xr, y, betaR);

    const betaU = olsRegression(Xu, y);
    if (!betaU) return def;
    const rssU = computeRSS(Xu, y, betaU);
    if (rssU > rssR) return def; // Numerical noise

    const num = (rssR - rssU) / lag;
    const den = rssU / dfDenom;

    const srcCoeffs = betaU.slice(lag + 1, 2 * lag + 1);
    const strength = srcCoeffs.reduce((s, c) => s + Math.abs(c), 0) / lag;
    const avgCoeff = srcCoeffs.reduce((s, c) => s + c, 0) / lag;
    const dir: 'positive' | 'negative' = avgCoeff >= 0 ? 'positive' : 'negative';

    if (den < OLS_EPS) {
      const fS = num > OLS_EPS ? 1e6 : 0;
      return { ...def, fStatistic: fS, pValue: fS > 0 ? 0 : 1, strength, direction: dir };
    }

    const fStat = num / den;
    const pValue = 1 - fDistributionCDF(fStat, lag, dfDenom);

    return {
      sourceTestId: source.testId, targetTestId: target.testId, lag,
      fStatistic: Math.max(0, fStat),
      pValue: Math.max(0, Math.min(1, pValue)),
      strength, direction: dir,
    };
  }

  /** True if the link is statistically significant at the configured alpha. */
  significanceTest(link: CausalLink): boolean {
    return link.pValue < this.config.alpha && link.fStatistic > 0;
  }

  private arraysEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
}

// -- Factory ----------------------------------------------------------------

export function createGrangerAnalyzer(config?: Partial<GrangerConfig>): GrangerAnalyzer {
  return new GrangerAnalyzer(config);
}

// -- Exported internals for testing -----------------------------------------

export {
  regularizedIncompleteBeta as _regularizedIncompleteBeta,
  fDistributionCDF as _fDistributionCDF,
  lnGamma as _lnGamma,
  olsRegression as _olsRegression,
  alignTimeSeries as _alignTimeSeries,
};
