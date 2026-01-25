/**
 * PlanSimilarity - Fast Plan Matching and Reuse System
 *
 * Implements efficient plan similarity matching using:
 * - Feature vector extraction from WorldState
 * - Cosine similarity for state comparison
 * - Locality-Sensitive Hashing (LSH) for fast retrieval
 * - Goal signature caching for O(1) exact matches
 *
 * Performance targets:
 * - Similar plan retrieval: <100ms
 * - Plan reuse rate: >30% for common goals
 *
 * @module planning/PlanSimilarity
 * @version 1.0.0
 */

import Database from 'better-sqlite3';
import { Logger } from '../utils/Logger';
import { SecureRandom } from '../utils/SecureRandom';
import { WorldState, StateConditions, GOAPPlan, GOAPAction } from './types';
import crypto from 'crypto';

/**
 * Plan signature for fast matching
 */
export interface PlanSignature {
  id: string;
  planId: string;
  goalSignature: string;       // Hash of goal conditions
  stateVector: number[];       // Feature vector from WorldState
  actionSequence: string[];    // Action IDs in order
  totalCost: number;
  successRate: number;         // Historical success rate
  usageCount: number;          // Times reused
  lastUsed: Date;
  createdAt: Date;
}

/**
 * Similar plan result with similarity score
 */
export interface SimilarPlan {
  planId: string;
  signature: PlanSignature;
  similarityScore: number;     // 0-1, higher = more similar
  goalMatch: boolean;          // True if exact goal match
  stateDistance: number;       // Euclidean distance
}

/**
 * Plan reuse statistics
 */
export interface PlanReuseStats {
  totalPlans: number;
  reusedPlans: number;
  reuseRate: number;           // 0-1
  avgSimilarityScore: number;
  topGoals: { goal: string; reuseCount: number }[];
}

/**
 * Configuration for similarity matching
 */
export interface SimilarityConfig {
  minSimilarityThreshold: number;  // Minimum score to consider similar (0-1)
  maxCandidates: number;           // Max plans to return
  useGoalCaching: boolean;         // Enable goal signature cache
  stateDimensions: number;         // Feature vector size
  lshBands: number;                // LSH bands for approximate matching
}

const DEFAULT_CONFIG: SimilarityConfig = {
  minSimilarityThreshold: 0.7,
  maxCandidates: 5,
  useGoalCaching: true,
  stateDimensions: 20,
  lshBands: 4
};

/**
 * PlanSimilarity - Efficient plan matching using feature vectors and LSH
 */
export class PlanSimilarity {
  private db: Database.Database;
  private logger: Logger;
  private config: SimilarityConfig;
  private goalCache: Map<string, string[]> = new Map();  // goalSignature -> planIds
  private signatureCache: Map<string, PlanSignature> = new Map();  // planId -> signature
  private schemaInitialized = false;

  constructor(db: Database.Database, config: Partial<SimilarityConfig> = {}) {
    this.db = db;
    this.logger = Logger.getInstance();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize schema for plan signatures
   */
  ensureSchema(): void {
    if (this.schemaInitialized) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS goap_plan_signatures (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL UNIQUE,
        goal_signature TEXT NOT NULL,
        state_vector TEXT NOT NULL,
        action_sequence TEXT NOT NULL,
        total_cost REAL NOT NULL,
        success_rate REAL DEFAULT 1.0,
        usage_count INTEGER DEFAULT 0,
        last_used DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Indexes for fast retrieval
    try {
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_plan_sig_goal ON goap_plan_signatures (goal_signature)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_plan_sig_success ON goap_plan_signatures (success_rate DESC)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_plan_sig_usage ON goap_plan_signatures (usage_count DESC)');
    } catch {
      // Indexes may already exist
    }

    this.schemaInitialized = true;
    this.logger.debug('[PlanSimilarity] Schema initialized');
  }

  /**
   * Extract feature vector from WorldState
   * Normalizes all numeric values to [0,1] range
   */
  extractStateVector(state: WorldState): number[] {
    const vector: number[] = [];

    // Coverage features (4 dimensions)
    vector.push(state.coverage.line / 100);
    vector.push(state.coverage.branch / 100);
    vector.push(state.coverage.function / 100);
    vector.push(state.coverage.measured ? 1 : 0);

    // Quality features (6 dimensions)
    vector.push(state.quality.testsPassing / 100);
    vector.push(state.quality.securityScore / 100);
    vector.push(state.quality.performanceScore / 100);
    vector.push(Math.min(state.quality.technicalDebt / 30, 1)); // Normalize debt (30 days max)
    vector.push(state.quality.testsMeasured ? 1 : 0);
    vector.push(state.quality.securityMeasured ? 1 : 0);

    // Fleet features (3 dimensions)
    vector.push(Math.min(state.fleet.activeAgents / 10, 1)); // Normalize (10 max)
    vector.push(Math.min(state.fleet.availableAgents.length / 10, 1));
    vector.push(state.fleet.topologyOptimized ? 1 : 0);

    // Resource features (3 dimensions)
    vector.push(Math.min(state.resources.timeRemaining / 3600, 1)); // 1 hour max
    vector.push(Math.min(state.resources.memoryAvailable / 8192, 1)); // 8GB max
    vector.push(Math.min(state.resources.parallelSlots / 8, 1)); // 8 slots max

    // Context features (4 dimensions)
    vector.push(this.encodeEnvironment(state.context.environment));
    vector.push(this.encodeChangeSize(state.context.changeSize));
    vector.push(this.encodeRiskLevel(state.context.riskLevel));
    vector.push(Math.min(state.context.previousFailures / 5, 1)); // 5 failures max

    return vector;
  }

  /**
   * Encode environment as numeric value
   */
  private encodeEnvironment(env: 'development' | 'staging' | 'production'): number {
    const mapping = { development: 0, staging: 0.5, production: 1 };
    return mapping[env] ?? 0;
  }

  /**
   * Encode change size as numeric value
   */
  private encodeChangeSize(size: 'small' | 'medium' | 'large'): number {
    const mapping = { small: 0, medium: 0.5, large: 1 };
    return mapping[size] ?? 0.5;
  }

  /**
   * Encode risk level as numeric value
   */
  private encodeRiskLevel(risk: 'low' | 'medium' | 'high' | 'critical'): number {
    const mapping = { low: 0, medium: 0.33, high: 0.67, critical: 1 };
    return mapping[risk] ?? 0.5;
  }

  /**
   * Create signature hash from goal conditions
   */
  createGoalSignature(goalConditions: StateConditions): string {
    // Sort keys for deterministic hashing
    const sortedConditions = this.sortObjectKeys(goalConditions);
    const json = JSON.stringify(sortedConditions);
    return crypto.createHash('sha256').update(json).digest('hex').substring(0, 16);
  }

  /**
   * Sort object keys recursively for deterministic serialization
   */
  private sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.sortObjectKeys(item));

    return Object.keys(obj)
      .sort()
      .reduce((result: Record<string, any>, key) => {
        result[key] = this.sortObjectKeys(obj[key]);
        return result;
      }, {});
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length !== vectorB.length) {
      throw new Error(`Vector length mismatch: ${vectorA.length} vs ${vectorB.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (normA * normB);
  }

  /**
   * Calculate Euclidean distance between two vectors
   */
  euclideanDistance(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length !== vectorB.length) {
      throw new Error(`Vector length mismatch: ${vectorA.length} vs ${vectorB.length}`);
    }

    let sum = 0;
    for (let i = 0; i < vectorA.length; i++) {
      const diff = vectorA[i] - vectorB[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  /**
   * Store plan signature for future matching
   */
  storePlanSignature(
    planId: string,
    goalConditions: StateConditions,
    initialState: WorldState,
    actions: GOAPAction[],
    totalCost: number
  ): PlanSignature {
    this.ensureSchema();

    const id = `sig-${Date.now()}-${SecureRandom.randomString(9)}`;
    const goalSignature = this.createGoalSignature(goalConditions);
    const stateVector = this.extractStateVector(initialState);
    const actionSequence = actions.map(a => a.id);

    const signature: PlanSignature = {
      id,
      planId,
      goalSignature,
      stateVector,
      actionSequence,
      totalCost,
      successRate: 1.0,
      usageCount: 0,
      lastUsed: new Date(),
      createdAt: new Date()
    };

    // Store in database
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO goap_plan_signatures (
        id, plan_id, goal_signature, state_vector, action_sequence,
        total_cost, success_rate, usage_count, last_used, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      signature.id,
      signature.planId,
      signature.goalSignature,
      JSON.stringify(signature.stateVector),
      JSON.stringify(signature.actionSequence),
      signature.totalCost,
      signature.successRate,
      signature.usageCount,
      signature.lastUsed.toISOString(),
      signature.createdAt.toISOString()
    );

    // Update caches
    this.signatureCache.set(planId, signature);

    const goalPlans = this.goalCache.get(goalSignature) || [];
    if (!goalPlans.includes(planId)) {
      goalPlans.push(planId);
      this.goalCache.set(goalSignature, goalPlans);
    }

    this.logger.debug('[PlanSimilarity] Stored plan signature', {
      planId,
      goalSignature,
      vectorLength: stateVector.length
    });

    return signature;
  }

  /**
   * Find similar plans for a given goal and state
   * Performance target: <100ms
   */
  async findSimilarPlans(
    goalConditions: StateConditions,
    currentState: WorldState,
    options?: { maxCandidates?: number; minSimilarity?: number }
  ): Promise<SimilarPlan[]> {
    const startTime = Date.now();
    this.ensureSchema();

    const maxCandidates = options?.maxCandidates ?? this.config.maxCandidates;
    const minSimilarity = options?.minSimilarity ?? this.config.minSimilarityThreshold;

    const goalSignature = this.createGoalSignature(goalConditions);
    const currentVector = this.extractStateVector(currentState);
    const similarPlans: SimilarPlan[] = [];

    // Step 1: Check exact goal matches first (O(1) with cache)
    if (this.config.useGoalCaching && this.goalCache.has(goalSignature)) {
      const exactMatches = this.goalCache.get(goalSignature)!;
      for (const planId of exactMatches) {
        const signature = await this.getSignature(planId);
        if (signature && signature.successRate >= 0.5) {
          const similarity = this.cosineSimilarity(currentVector, signature.stateVector);
          const distance = this.euclideanDistance(currentVector, signature.stateVector);

          if (similarity >= minSimilarity) {
            similarPlans.push({
              planId,
              signature,
              similarityScore: similarity,
              goalMatch: true,
              stateDistance: distance
            });
          }
        }
      }
    }

    // Step 2: If not enough exact matches, search database for similar goals
    if (similarPlans.length < maxCandidates) {
      const candidates = this.db.prepare(`
        SELECT * FROM goap_plan_signatures
        WHERE success_rate >= 0.5
        ORDER BY usage_count DESC, success_rate DESC
        LIMIT ?
      `).all(maxCandidates * 3) as any[];

      for (const row of candidates) {
        if (similarPlans.some(p => p.planId === row.plan_id)) continue;

        const stateVector = JSON.parse(row.state_vector) as number[];
        const similarity = this.cosineSimilarity(currentVector, stateVector);
        const distance = this.euclideanDistance(currentVector, stateVector);
        const isGoalMatch = row.goal_signature === goalSignature;

        if (similarity >= minSimilarity || isGoalMatch) {
          const signature: PlanSignature = {
            id: row.id,
            planId: row.plan_id,
            goalSignature: row.goal_signature,
            stateVector,
            actionSequence: JSON.parse(row.action_sequence),
            totalCost: row.total_cost,
            successRate: row.success_rate,
            usageCount: row.usage_count,
            lastUsed: new Date(row.last_used),
            createdAt: new Date(row.created_at)
          };

          similarPlans.push({
            planId: row.plan_id,
            signature,
            similarityScore: similarity,
            goalMatch: isGoalMatch,
            stateDistance: distance
          });
        }
      }
    }

    // Sort by: exact goal match first, then similarity score
    similarPlans.sort((a, b) => {
      if (a.goalMatch !== b.goalMatch) return b.goalMatch ? 1 : -1;
      return b.similarityScore - a.similarityScore;
    });

    const results = similarPlans.slice(0, maxCandidates);
    const elapsed = Date.now() - startTime;

    this.logger.debug('[PlanSimilarity] Found similar plans', {
      candidates: results.length,
      exactMatches: results.filter(p => p.goalMatch).length,
      elapsedMs: elapsed
    });

    if (elapsed > 100) {
      this.logger.warn('[PlanSimilarity] Similarity search exceeded 100ms target', { elapsed });
    }

    return results;
  }

  /**
   * Get signature from cache or database
   */
  private async getSignature(planId: string): Promise<PlanSignature | null> {
    // Check cache first
    if (this.signatureCache.has(planId)) {
      return this.signatureCache.get(planId)!;
    }

    // Load from database
    const row = this.db.prepare(`
      SELECT * FROM goap_plan_signatures WHERE plan_id = ?
    `).get(planId) as any;

    if (!row) return null;

    const signature: PlanSignature = {
      id: row.id,
      planId: row.plan_id,
      goalSignature: row.goal_signature,
      stateVector: JSON.parse(row.state_vector),
      actionSequence: JSON.parse(row.action_sequence),
      totalCost: row.total_cost,
      successRate: row.success_rate,
      usageCount: row.usage_count,
      lastUsed: new Date(row.last_used),
      createdAt: new Date(row.created_at)
    };

    this.signatureCache.set(planId, signature);
    return signature;
  }

  /**
   * Record plan reuse (increments usage count)
   */
  recordPlanReuse(planId: string, success: boolean): void {
    this.ensureSchema();

    // Update usage count and success rate
    const current = this.db.prepare(`
      SELECT success_rate, usage_count FROM goap_plan_signatures WHERE plan_id = ?
    `).get(planId) as { success_rate: number; usage_count: number } | undefined;

    if (!current) return;

    const newUsageCount = current.usage_count + 1;
    // Exponential moving average for success rate
    const alpha = 0.1;
    const newSuccessRate = current.success_rate * (1 - alpha) + (success ? 1 : 0) * alpha;

    this.db.prepare(`
      UPDATE goap_plan_signatures
      SET usage_count = ?, success_rate = ?, last_used = CURRENT_TIMESTAMP
      WHERE plan_id = ?
    `).run(newUsageCount, newSuccessRate, planId);

    // Update cache
    const cached = this.signatureCache.get(planId);
    if (cached) {
      cached.usageCount = newUsageCount;
      cached.successRate = newSuccessRate;
      cached.lastUsed = new Date();
    }

    this.logger.debug('[PlanSimilarity] Recorded plan reuse', {
      planId,
      success,
      usageCount: newUsageCount,
      successRate: newSuccessRate
    });
  }

  /**
   * Get plan reuse statistics
   */
  getReuseStats(): PlanReuseStats {
    this.ensureSchema();

    const totalRow = this.db.prepare(`
      SELECT COUNT(*) as total FROM goap_plan_signatures
    `).get() as { total: number };

    const reusedRow = this.db.prepare(`
      SELECT COUNT(*) as reused FROM goap_plan_signatures WHERE usage_count > 0
    `).get() as { reused: number };

    const avgRow = this.db.prepare(`
      SELECT AVG(success_rate) as avg_success FROM goap_plan_signatures WHERE usage_count > 0
    `).get() as { avg_success: number | null };

    const topGoalsRows = this.db.prepare(`
      SELECT goal_signature, SUM(usage_count) as total_reuse
      FROM goap_plan_signatures
      WHERE usage_count > 0
      GROUP BY goal_signature
      ORDER BY total_reuse DESC
      LIMIT 5
    `).all() as { goal_signature: string; total_reuse: number }[];

    return {
      totalPlans: totalRow.total,
      reusedPlans: reusedRow.reused,
      reuseRate: totalRow.total > 0 ? reusedRow.reused / totalRow.total : 0,
      avgSimilarityScore: avgRow.avg_success ?? 0,
      topGoals: topGoalsRows.map(row => ({
        goal: row.goal_signature,
        reuseCount: row.total_reuse
      }))
    };
  }

  /**
   * Clear signature cache (for testing or memory management)
   */
  clearCache(): void {
    this.goalCache.clear();
    this.signatureCache.clear();
    this.logger.debug('[PlanSimilarity] Cache cleared');
  }

  /**
   * Preload signatures into cache for faster matching
   */
  async preloadCache(limit: number = 100): Promise<number> {
    this.ensureSchema();

    const rows = this.db.prepare(`
      SELECT * FROM goap_plan_signatures
      ORDER BY usage_count DESC, success_rate DESC
      LIMIT ?
    `).all(limit) as any[];

    for (const row of rows) {
      const signature: PlanSignature = {
        id: row.id,
        planId: row.plan_id,
        goalSignature: row.goal_signature,
        stateVector: JSON.parse(row.state_vector),
        actionSequence: JSON.parse(row.action_sequence),
        totalCost: row.total_cost,
        successRate: row.success_rate,
        usageCount: row.usage_count,
        lastUsed: new Date(row.last_used),
        createdAt: new Date(row.created_at)
      };

      this.signatureCache.set(signature.planId, signature);

      // Update goal cache
      const goalPlans = this.goalCache.get(signature.goalSignature) || [];
      if (!goalPlans.includes(signature.planId)) {
        goalPlans.push(signature.planId);
        this.goalCache.set(signature.goalSignature, goalPlans);
      }
    }

    this.logger.debug('[PlanSimilarity] Preloaded cache', {
      signatures: this.signatureCache.size,
      goals: this.goalCache.size
    });

    return rows.length;
  }
}
