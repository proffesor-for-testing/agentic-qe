/**
 * Agentic QE v3 - Ghost Coverage Analyzer Service (ADR-059)
 *
 * Phantom coverage gap detection inspired by AISP 5.1 Ghost Intent Search:
 * psi_g = psi_* - psi_have. Computes what is MISSING from coverage via
 * HNSW vector subtraction: ghost = ideal surface - actual surface.
 *
 * @module coverage-analysis/ghost-coverage-analyzer
 */

import { Result, ok, err, Severity } from '../../../shared/types';
import { normalize, cosineSimilarity, magnitude } from '../../../shared/utils/vector-math.js';
import { CoverageData, FileCoverage } from '../interfaces';
import { IHNSWIndex, HNSWSearchResult } from './hnsw-index';
import { ICoverageEmbedder } from './coverage-embedder';
import { toError } from '../../../shared/error-utils.js';

/** Categories of phantom coverage gaps -- classes of tests that should exist but do not. */
export type PhantomGapCategory =
  | 'missing-error-handler'
  | 'absent-boundary-validation'
  | 'unprotected-state-transition'
  | 'missing-integration-contract'
  | 'absent-edge-case'
  | 'missing-security-check';

const ALL_CATEGORIES: PhantomGapCategory[] = [
  'missing-error-handler', 'absent-boundary-validation', 'unprotected-state-transition',
  'missing-integration-contract', 'absent-edge-case', 'missing-security-check',
];

/** Configuration for the GhostCoverageAnalyzerService. */
export interface GhostCoverageConfig {
  dimensions: number;
  minConfidence: number;
  maxGaps: number;
  riskWeight: number;
  distanceWeight: number;
  namespace: string;
  idealSurfaceDecay: number;
}

const DEFAULT_CONFIG: GhostCoverageConfig = {
  dimensions: 768, minConfidence: 0.3, maxGaps: 50,
  riskWeight: 0.6, distanceWeight: 0.4,
  namespace: 'ghost-surface', idealSurfaceDecay: 0.95,
};

/** A single phantom gap: a test that should exist but does not. */
export interface PhantomGap {
  id: string; file: string; category: PhantomGapCategory;
  ghostDistance: number; riskScore: number; severity: Severity;
  confidence: number; description: string; suggestedLines: number[];
}

/** The phantom surface: the complete ghost analysis result for a project. */
export interface PhantomSurface {
  ghostVectors: Map<string, number[]>; idealSurface: number[]; actualSurface: number[];
  phantomRatio: number; computedAt: number; filesAnalyzed: number;
}

/** Context about the project for building the ideal surface. */
export interface ProjectContext {
  name: string; sourcePatterns: string[];
  riskAreas?: string[]; defectHistory?: string[];
  complexityScores?: Map<string, number>;
}

/** A learned pattern used to build the ideal surface. */
export interface IdealSurfacePattern {
  id: string; category: PhantomGapCategory; vector: number[];
  weight: number; source: string;
}

/** Dependencies for GhostCoverageAnalyzerService. */
export interface GhostCoverageAnalyzerDependencies {
  hnswIndex: IHNSWIndex; embedder: ICoverageEmbedder;
}

interface CategoryDetection {
  category: PhantomGapCategory; confidence: number; suggestedLines: number[];
}

/**
 * Ghost Coverage Analyzer Service
 *
 * Computes the "ghost" of coverage -- what SHOULD be tested but is not.
 * Uses HNSW vector subtraction (psi_g = psi_* - psi_have) to find
 * entire missing categories of tests, not just weak coverage spots.
 */
export class GhostCoverageAnalyzerService {
  private readonly config: GhostCoverageConfig;
  private readonly hnswIndex: IHNSWIndex;
  private readonly embedder: ICoverageEmbedder;
  private idealSurfacePatterns: IdealSurfacePattern[] = [];
  private cachedIdealSurface: number[] | null = null;
  private cachedPhantomRatio: number = 1.0;
  private initialized = false;

  constructor(deps: GhostCoverageAnalyzerDependencies, config: Partial<GhostCoverageConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.hnswIndex = deps.hnswIndex;
    this.embedder = deps.embedder;
  }

  /** Initialize the service. Must be called before analysis operations. */
  async initialize(): Promise<Result<void, Error>> {
    try {
      this.idealSurfacePatterns = this.buildBaselinePatterns();
      this.cachedIdealSurface = this.aggregateIdealSurface();
      this.initialized = true;
      return ok(undefined);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Compute the phantom surface for given coverage data.
   * Builds ideal surface, embeds actual coverage, computes ghost vectors via subtraction.
   */
  async computePhantomSurface(
    coverageData: CoverageData, projectContext: ProjectContext
  ): Promise<Result<PhantomSurface, Error>> {
    try {
      this.ensureInitialized();
      const idealSurface = this.buildIdealSurface(projectContext);
      const ghostVectors = new Map<string, number[]>();
      const actualVectors: number[][] = [];

      for (const file of coverageData.files) {
        const actual = this.embedder.embedFileCoverage(file).vector;
        actualVectors.push(actual);
        ghostVectors.set(file.path, this.computeGhostVector(actual, idealSurface));

        await this.hnswIndex.insert(`${this.config.namespace}:${file.path}`, ghostVectors.get(file.path)!, {
          filePath: file.path,
          lineCoverage: this.ratio(file.lines.covered, file.lines.total) * 100,
          branchCoverage: this.ratio(file.branches.covered, file.branches.total) * 100,
          functionCoverage: this.ratio(file.functions.covered, file.functions.total) * 100,
          statementCoverage: this.ratio(file.statements.covered, file.statements.total) * 100,
          uncoveredLineCount: file.uncoveredLines.length,
          uncoveredBranchCount: file.uncoveredBranches.length,
          riskScore: this.fileRiskScore(file),
          lastUpdated: Date.now(),
          totalLines: file.lines.total,
        });
      }

      const actualSurface = this.aggregateSurface(actualVectors);
      const phantomRatio = this.phantomRatioFromVectors(idealSurface, actualSurface);
      this.cachedIdealSurface = idealSurface;
      this.cachedPhantomRatio = phantomRatio;

      return ok({ ghostVectors, idealSurface, actualSurface, phantomRatio,
        computedAt: Date.now(), filesAnalyzed: coverageData.files.length });
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Detect specific phantom gaps from a computed phantom surface.
   * Classifies ghost vectors into gap categories using HNSW similarity search.
   */
  async detectPhantomGaps(
    surface: PhantomSurface, minConfidence?: number
  ): Promise<Result<PhantomGap[], Error>> {
    try {
      this.ensureInitialized();
      const threshold = minConfidence ?? this.config.minConfidence;
      const gaps: PhantomGap[] = [];

      for (const [filePath, ghostVector] of surface.ghostVectors) {
        if (magnitude(ghostVector) < 0.01) continue;
        const similarGhosts = await this.hnswIndex.search(ghostVector, 5);
        for (const det of this.classifyGhost(ghostVector, similarGhosts)) {
          if (det.confidence < threshold) continue;
          const riskScore = this.gapRiskScore(ghostVector, det.category);
          const ghostDistance = Math.min(1, magnitude(ghostVector));
          gaps.push({
            id: this.gapId(filePath, det.category), file: filePath,
            category: det.category, ghostDistance, riskScore,
            severity: this.toSeverity(ghostDistance, riskScore),
            confidence: det.confidence,
            description: this.gapDescription(filePath, det.category, ghostDistance),
            suggestedLines: det.suggestedLines,
          });
        }
      }

      gaps.sort((a, b) => b.ghostDistance * b.riskScore - a.ghostDistance * a.riskScore);
      return ok(gaps.slice(0, this.config.maxGaps));
    } catch (error) {
      return err(toError(error));
    }
  }

  /** Rank phantom gaps by severity: rank = riskWeight * risk + distanceWeight * distance. */
  rankPhantomGaps(gaps: PhantomGap[]): PhantomGap[] {
    const { riskWeight, distanceWeight } = this.config;
    return [...gaps].sort((a, b) =>
      (riskWeight * b.riskScore + distanceWeight * b.ghostDistance) -
      (riskWeight * a.riskScore + distanceWeight * a.ghostDistance)
    );
  }

  /** Update the ideal surface model with new patterns, applying decay to existing ones. */
  async updateIdealSurface(patterns: IdealSurfacePattern[]): Promise<Result<number, Error>> {
    try {
      this.ensureInitialized();
      for (const p of this.idealSurfacePatterns) p.weight *= this.config.idealSurfaceDecay;
      for (const pattern of patterns) {
        if (pattern.vector.length !== this.config.dimensions) continue;
        const idx = this.idealSurfacePatterns.findIndex((p) => p.id === pattern.id);
        if (idx >= 0) this.idealSurfacePatterns[idx] = pattern;
        else this.idealSurfacePatterns.push(pattern);
      }
      this.idealSurfacePatterns = this.idealSurfacePatterns.filter((p) => p.weight > 0.01);
      this.cachedIdealSurface = this.aggregateIdealSurface();
      return ok(this.idealSurfacePatterns.length);
    } catch (error) {
      return err(toError(error));
    }
  }

  /** Overall phantom score (0-1, lower is better). */
  getPhantomRatio(): number { return this.cachedPhantomRatio; }

  /**
   * Compute ghost vector: ghost[i] = max(0, ideal[i] - actual[i]), then normalize.
   * Positive values = shortfall from ideal; surplus is clamped to 0.
   */
  computeGhostVector(actual: number[], ideal: number[]): number[] {
    const dim = Math.min(actual.length, ideal.length);
    const ghost = new Array<number>(dim);
    for (let i = 0; i < dim; i++) ghost[i] = Math.max(0, ideal[i] - actual[i]);
    return normalize(ghost);
  }

  // -- Private: Ideal Surface --

  private buildBaselinePatterns(): IdealSurfacePattern[] {
    const dim = this.config.dimensions;
    const regionSize = Math.floor(dim / ALL_CATEGORIES.length);
    return ALL_CATEGORIES.map((category, idx) => {
      const vector = new Array<number>(dim).fill(0);
      const start = idx * regionSize;
      const end = Math.min(start + regionSize, dim);
      for (let i = start; i < end; i++) {
        vector[i] = Math.sin(((i - start) / regionSize) * Math.PI) * 0.8 + 0.2;
      }
      vector[0] = 0.9; vector[1] = 0.85; vector[2] = 0.9; vector[3] = 0.85;
      return { id: `baseline-${category}`, category, vector: normalize(vector), weight: 1.0, source: 'baseline' };
    });
  }

  private buildIdealSurface(ctx: ProjectContext): number[] {
    const base = this.aggregateIdealSurface();
    if (ctx.riskAreas?.length) {
      for (let i = 32; i < 48 && i < base.length; i++) base[i] *= 1.2;
    }
    if (ctx.defectHistory?.length) {
      const f = Math.min(1.5, 1 + ctx.defectHistory.length * 0.05);
      for (let i = 0; i < 16 && i < base.length; i++) base[i] *= f;
    }
    return normalize(base);
  }

  private aggregateIdealSurface(): number[] {
    const dim = this.config.dimensions;
    if (this.idealSurfacePatterns.length === 0) return normalize(new Array<number>(dim).fill(1));
    const agg = new Array<number>(dim).fill(0);
    let tw = 0;
    for (const p of this.idealSurfacePatterns) {
      for (let i = 0; i < dim; i++) agg[i] += p.vector[i] * p.weight;
      tw += p.weight;
    }
    if (tw > 0) for (let i = 0; i < dim; i++) agg[i] /= tw;
    return normalize(agg);
  }

  private aggregateSurface(vectors: number[][]): number[] {
    const dim = this.config.dimensions;
    if (vectors.length === 0) return new Array<number>(dim).fill(0);
    const agg = new Array<number>(dim).fill(0);
    for (const v of vectors) for (let i = 0; i < dim && i < v.length; i++) agg[i] += v[i];
    for (let i = 0; i < dim; i++) agg[i] /= vectors.length;
    return normalize(agg);
  }

  // -- Private: Classification --

  private classifyGhost(ghostVector: number[], similar: HNSWSearchResult[]): CategoryDetection[] {
    const dim = this.config.dimensions;
    const regionSize = Math.floor(dim / ALL_CATEGORIES.length);
    const dets: CategoryDetection[] = [];
    let boost = 0;
    for (const s of similar) if (s.score > 0.7) boost += s.score * 0.1;

    for (let ci = 0; ci < ALL_CATEGORIES.length; ci++) {
      const start = ci * regionSize, end = Math.min(start + regionSize, dim);
      let energy = 0;
      for (let i = start; i < end && i < ghostVector.length; i++) energy += ghostVector[i] ** 2;
      energy = Math.sqrt(energy / (end - start));
      const confidence = Math.min(1, energy + boost);
      if (confidence > 0.05) {
        dets.push({ category: ALL_CATEGORIES[ci], confidence,
          suggestedLines: this.suggestLines(ci, ghostVector) });
      }
    }
    return dets.sort((a, b) => b.confidence - a.confidence);
  }

  private suggestLines(catIdx: number, gv: number[]): number[] {
    const gap = gv[0] || 0, fGap = gv[2] || 0;
    if (gap < 0.1 && fGap < 0.1) return [];
    const base = catIdx * 20 + 1, count = Math.ceil(gap * 10);
    const lines: number[] = [];
    for (let i = 0; i < count && lines.length < 10; i++) lines.push(base + i * 5);
    return lines;
  }

  // -- Private: Scoring --

  private static readonly CATEGORY_RISK: Record<PhantomGapCategory, number> = {
    'missing-security-check': 1.5, 'missing-error-handler': 1.3,
    'unprotected-state-transition': 1.2, 'missing-integration-contract': 1.1,
    'absent-boundary-validation': 1.0, 'absent-edge-case': 0.8,
  };

  private gapRiskScore(gv: number[], cat: PhantomGapCategory): number {
    return Math.min(1, magnitude(gv) * (GhostCoverageAnalyzerService.CATEGORY_RISK[cat] ?? 1));
  }

  private fileRiskScore(f: FileCoverage): number {
    return Math.min(1,
      (1 - this.ratio(f.lines.covered, f.lines.total)) * 0.3 +
      (1 - this.ratio(f.branches.covered, f.branches.total)) * 0.4 +
      (1 - this.ratio(f.functions.covered, f.functions.total)) * 0.3);
  }

  private phantomRatioFromVectors(ideal: number[], actual: number[]): number {
    if (!ideal.length || !actual.length) return 1;
    return Math.max(0, Math.min(1, 1 - cosineSimilarity(ideal, actual)));
  }

  private toSeverity(dist: number, risk: number): Severity {
    const c = (dist + risk) / 2;
    if (c >= 0.8) return 'critical';
    if (c >= 0.6) return 'high';
    if (c >= 0.3) return 'medium';
    return 'low';
  }

  // -- Private: Utilities --

  private ensureInitialized(): void {
    if (!this.initialized) throw new Error('GhostCoverageAnalyzerService not initialized. Call initialize() first.');
  }

  private ratio(n: number, d: number): number { return d > 0 ? n / d : 0; }

  private gapId(path: string, cat: PhantomGapCategory): string {
    const h = `${path}:${cat}`.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    return `phantom-${Math.abs(h).toString(16)}`;
  }

  private gapDescription(path: string, cat: PhantomGapCategory, dist: number): string {
    const n = path.split('/').pop() || path;
    const s = dist > 0.7 ? 'significant' : dist > 0.4 ? 'moderate' : 'minor';
    const m: Record<PhantomGapCategory, string> = {
      'missing-error-handler': `${n}: ${s} missing error handler tests. Cover error paths and failure recovery.`,
      'absent-boundary-validation': `${n}: ${s} missing boundary validation tests. Cover input bounds and null checks.`,
      'unprotected-state-transition': `${n}: ${s} missing state transition tests. Cover state changes and race conditions.`,
      'missing-integration-contract': `${n}: ${s} missing integration contract tests. Cover external API boundaries.`,
      'absent-edge-case': `${n}: ${s} missing edge case tests. Cover empty inputs, max values, and timeouts.`,
      'missing-security-check': `${n}: ${s} missing security check tests. Cover auth bypass and injection attacks.`,
    };
    return m[cat];
  }
}

/** Create a new GhostCoverageAnalyzerService instance. */
export function createGhostCoverageAnalyzer(
  deps: GhostCoverageAnalyzerDependencies, config?: Partial<GhostCoverageConfig>
): GhostCoverageAnalyzerService {
  return new GhostCoverageAnalyzerService(deps, config);
}
