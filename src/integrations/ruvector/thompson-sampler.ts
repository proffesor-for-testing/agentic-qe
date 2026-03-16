/**
 * Thompson Sampling with Beta Priors (Task 2.3, ADR-084)
 *
 * Provides a Thompson Sampler for balancing exploration/exploitation in
 * cross-domain transfer decisions. Each domain pair maintains a Beta(alpha, beta)
 * distribution that is updated based on transfer outcomes.
 *
 * @module integrations/ruvector/thompson-sampler
 */

// ============================================================================
// Thompson Sampler
// ============================================================================

/**
 * Thompson Sampling with Beta priors for exploration/exploitation balance.
 *
 * Each domain pair maintains a Beta(alpha, beta) distribution where:
 * - alpha = number of successes + 1 (prior)
 * - beta = number of failures + 1 (prior)
 *
 * Sampling from this distribution naturally balances exploration (uncertain
 * pairs with wide distributions) and exploitation (proven pairs with
 * narrow distributions centered on high success rates).
 */
export class ThompsonSampler {
  /** Beta distribution alpha params: successes + 1 */
  private alphas: Map<string, number> = new Map();
  /** Beta distribution beta params: failures + 1 */
  private betas: Map<string, number> = new Map();

  /**
   * Sample from the Beta distribution for a domain pair.
   *
   * @param domainPair - Key identifying the source->target pair
   * @returns Sampled probability of transfer success
   */
  sample(domainPair: string): number {
    const alpha = this.alphas.get(domainPair) ?? 1;
    const beta = this.betas.get(domainPair) ?? 1;
    return this.sampleBeta(alpha, beta);
  }

  /**
   * Update the Beta distribution after observing a transfer outcome.
   *
   * @param domainPair - Key identifying the source->target pair
   * @param success - Whether the transfer was successful
   */
  update(domainPair: string, success: boolean): void {
    if (success) {
      this.alphas.set(domainPair, (this.alphas.get(domainPair) ?? 1) + 1);
    } else {
      this.betas.set(domainPair, (this.betas.get(domainPair) ?? 1) + 1);
    }
  }

  /** Get the mean of the Beta distribution: alpha / (alpha + beta) */
  getMean(domainPair: string): number {
    const alpha = this.alphas.get(domainPair) ?? 1;
    const beta = this.betas.get(domainPair) ?? 1;
    return alpha / (alpha + beta);
  }

  /** Get the total number of observations (excluding priors) */
  getObservationCount(domainPair: string): number {
    const alpha = this.alphas.get(domainPair) ?? 1;
    const beta = this.betas.get(domainPair) ?? 1;
    return (alpha - 1) + (beta - 1);
  }

  /** Get the alpha (success count + 1) for a domain pair */
  getAlpha(domainPair: string): number {
    return this.alphas.get(domainPair) ?? 1;
  }

  /** Get the beta (failure count + 1) for a domain pair */
  getBeta(domainPair: string): number {
    return this.betas.get(domainPair) ?? 1;
  }

  /**
   * Sample from Beta(alpha, beta) via the Gamma-ratio method:
   * X ~ Gamma(alpha, 1), Y ~ Gamma(beta, 1), return X / (X + Y).
   */
  private sampleBeta(alpha: number, beta: number): number {
    const x = this.sampleGamma(alpha);
    const y = this.sampleGamma(beta);
    if (x + y === 0) return 0.5;
    return x / (x + y);
  }

  /**
   * Sample from Gamma(shape, 1) using Marsaglia-Tsang for shape >= 1
   * and rejection method for shape < 1.
   */
  private sampleGamma(shape: number): number {
    if (shape < 1) {
      const u = Math.random();
      return this.sampleGamma(shape + 1) * Math.pow(u, 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    for (;;) {
      let x: number;
      let v: number;

      do {
        x = this.standardNormal();
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  /** Standard normal sample via Box-Muller transform */
  private standardNormal(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
  }
}
