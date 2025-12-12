/**
 * ClusteringEngine - Clusters experiences by embedding similarity
 *
 * Provides simple k-means and hierarchical clustering for grouping
 * similar agent experiences during pattern synthesis.
 *
 * Part of the Nightly-Learner Phase 1 implementation.
 *
 * @version 1.0.0
 * @module src/learning/synthesis/ClusteringEngine
 */

import { Logger } from '../../utils/Logger';
import { SecureRandom } from '../../utils/SecureRandom';
import { CapturedExperience } from '../capture/ExperienceCapture';

/**
 * A cluster of similar experiences
 */
export interface Cluster {
  id: string;
  centroid: number[];
  members: CapturedExperience[];
  size: number;
}

/**
 * Configuration for clustering
 */
export interface ClusteringConfig {
  /** Minimum number of experiences per cluster. Default: 2 */
  minClusterSize?: number;
  /** Maximum number of clusters to form. Default: 10 */
  maxClusters?: number;
  /** Similarity threshold for merging clusters (0-1). Default: 0.85 */
  similarityThreshold?: number;
  /** Use diversity-aware clustering (MMR-style). Default: false */
  diversityAware?: boolean;
  /** Maximum iterations for k-means. Default: 50 */
  maxIterations?: number;
}

/**
 * ClusteringEngine groups experiences by embedding similarity
 *
 * @example
 * ```typescript
 * const engine = new ClusteringEngine();
 *
 * const clusters = engine.cluster(experiences, {
 *   maxClusters: 5,
 *   minClusterSize: 3,
 *   similarityThreshold: 0.8,
 * });
 *
 * console.log(`Created ${clusters.length} clusters`);
 * ```
 */
export class ClusteringEngine {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Cluster experiences using k-means algorithm
   *
   * @param experiences - Experiences to cluster (must have embeddings)
   * @param config - Clustering configuration
   * @returns Array of clusters
   */
  cluster(experiences: CapturedExperience[], config?: ClusteringConfig): Cluster[] {
    const cfg: Required<ClusteringConfig> = {
      minClusterSize: config?.minClusterSize ?? 2,
      maxClusters: config?.maxClusters ?? 10,
      similarityThreshold: config?.similarityThreshold ?? 0.85,
      diversityAware: config?.diversityAware ?? false,
      maxIterations: config?.maxIterations ?? 50,
    };

    // Filter experiences with embeddings
    const withEmbeddings = experiences.filter(exp => exp.embedding && exp.embedding.length > 0);

    if (withEmbeddings.length === 0) {
      this.logger.warn('[ClusteringEngine] No experiences with embeddings');
      return [];
    }

    if (withEmbeddings.length < cfg.minClusterSize) {
      this.logger.debug('[ClusteringEngine] Too few experiences for clustering', {
        count: withEmbeddings.length,
        minRequired: cfg.minClusterSize,
      });
      return [];
    }

    // Determine number of clusters (k)
    const k = Math.min(cfg.maxClusters, Math.floor(withEmbeddings.length / cfg.minClusterSize));

    if (k < 2) {
      // Single cluster with all experiences
      return [this.createCluster(withEmbeddings)];
    }

    // Run k-means clustering
    let clusters = this.kMeans(withEmbeddings, k, cfg.maxIterations);

    // Filter out small clusters
    clusters = clusters.filter(c => c.size >= cfg.minClusterSize);

    // Merge similar clusters if threshold is set
    if (cfg.similarityThreshold > 0) {
      clusters = this.mergeClusters(clusters, cfg.similarityThreshold);
    }

    // Apply diversity-aware selection if requested
    if (cfg.diversityAware) {
      clusters = this.applyDiversitySelection(clusters, cfg.maxClusters);
    }

    this.logger.info('[ClusteringEngine] Clustering complete', {
      totalExperiences: withEmbeddings.length,
      clustersCreated: clusters.length,
      averageSize: clusters.reduce((sum, c) => sum + c.size, 0) / clusters.length,
    });

    return clusters;
  }

  /**
   * Find k most similar clusters to a given embedding
   *
   * @param embedding - Query embedding
   * @param clusters - Clusters to search
   * @param k - Number of similar clusters to return. Default: 3
   * @returns Top k similar clusters
   */
  findSimilar(embedding: number[], clusters: Cluster[], k: number = 3): Cluster[] {
    if (clusters.length === 0) return [];

    // Calculate similarity to each cluster centroid
    const similarities = clusters.map(cluster => ({
      cluster,
      similarity: this.calculateSimilarity(embedding, cluster.centroid),
    }));

    // Sort by similarity descending
    similarities.sort((a, b) => b.similarity - a.similarity);

    // Return top k
    return similarities.slice(0, Math.min(k, similarities.length)).map(s => s.cluster);
  }

  /**
   * Calculate cosine similarity between two vectors
   *
   * @param a - First vector
   * @param b - Second vector
   * @returns Cosine similarity (0-1)
   */
  calculateSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }

    if (a.length === 0) return 0;

    // Cosine similarity: (a · b) / (||a|| * ||b||)
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) return 0;

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Merge clusters that are above similarity threshold
   *
   * @param clusters - Clusters to merge
   * @param threshold - Similarity threshold for merging (0-1)
   * @returns Merged clusters
   */
  mergeClusters(clusters: Cluster[], threshold: number): Cluster[] {
    if (clusters.length <= 1) return clusters;

    const merged: Cluster[] = [];
    const processed = new Set<string>();

    for (const cluster of clusters) {
      if (processed.has(cluster.id)) continue;

      let currentCluster = cluster;
      processed.add(cluster.id);

      // Find similar clusters to merge
      for (const other of clusters) {
        if (processed.has(other.id)) continue;

        const similarity = this.calculateSimilarity(currentCluster.centroid, other.centroid);

        if (similarity >= threshold) {
          // Merge other into current
          const combinedMembers = [...currentCluster.members, ...other.members];
          currentCluster = this.createCluster(combinedMembers);
          processed.add(other.id);
        }
      }

      merged.push(currentCluster);
    }

    this.logger.debug('[ClusteringEngine] Merged clusters', {
      before: clusters.length,
      after: merged.length,
      threshold,
    });

    return merged;
  }

  /**
   * K-means clustering algorithm (simplified implementation)
   *
   * @param experiences - Experiences with embeddings
   * @param k - Number of clusters
   * @param maxIterations - Maximum iterations
   * @returns Array of clusters
   */
  private kMeans(experiences: CapturedExperience[], k: number, maxIterations: number): Cluster[] {
    // Initialize centroids with k-means++ for better initial placement
    let centroids = this.initializeCentroidsKMeansPlusPlus(experiences, k);

    let assignments: number[] = new Array(experiences.length).fill(0);
    let converged = false;
    let iteration = 0;

    while (!converged && iteration < maxIterations) {
      // Assignment step: assign each experience to nearest centroid
      const newAssignments = experiences.map(exp =>
        this.findNearestCentroid(exp.embedding!, centroids)
      );

      // Check convergence
      converged = newAssignments.every((a, i) => a === assignments[i]);
      assignments = newAssignments;

      if (converged) break;

      // Update step: recalculate centroids
      const newCentroids: number[][] = [];
      for (let i = 0; i < k; i++) {
        const clusterExperiences = experiences.filter((_, idx) => assignments[idx] === i);
        if (clusterExperiences.length > 0) {
          newCentroids.push(this.calculateCentroid(clusterExperiences));
        } else {
          // Keep old centroid if cluster is empty
          newCentroids.push(centroids[i]);
        }
      }
      centroids = newCentroids;

      iteration++;
    }

    // Create cluster objects
    const clusters: Cluster[] = [];
    for (let i = 0; i < k; i++) {
      const members = experiences.filter((_, idx) => assignments[idx] === i);
      if (members.length > 0) {
        clusters.push({
          id: `cluster-${SecureRandom.randomString(8, 'alphanumeric')}`,
          centroid: centroids[i],
          members,
          size: members.length,
        });
      }
    }

    this.logger.debug('[ClusteringEngine] K-means completed', {
      k,
      iterations: iteration,
      converged,
      clustersCreated: clusters.length,
    });

    return clusters;
  }

  /**
   * Initialize centroids using k-means++ algorithm
   * This provides better initial centroid placement than random selection
   */
  private initializeCentroidsKMeansPlusPlus(
    experiences: CapturedExperience[],
    k: number
  ): number[][] {
    const centroids: number[][] = [];

    // Choose first centroid randomly
    const firstIdx = Math.floor(Math.random() * experiences.length);
    centroids.push([...experiences[firstIdx].embedding!]);

    // Choose remaining centroids
    for (let i = 1; i < k; i++) {
      // Calculate distance to nearest centroid for each point
      const distances = experiences.map(exp => {
        const minDist = Math.min(
          ...centroids.map(c => 1 - this.calculateSimilarity(exp.embedding!, c))
        );
        return minDist * minDist; // Square the distance
      });

      // Choose next centroid with probability proportional to distance
      const totalDist = distances.reduce((sum, d) => sum + d, 0);
      let threshold = Math.random() * totalDist;

      let chosenIdx = 0;
      for (let j = 0; j < distances.length; j++) {
        threshold -= distances[j];
        if (threshold <= 0) {
          chosenIdx = j;
          break;
        }
      }

      centroids.push([...experiences[chosenIdx].embedding!]);
    }

    return centroids;
  }

  /**
   * Find the nearest centroid for an embedding
   */
  private findNearestCentroid(embedding: number[], centroids: number[][]): number {
    let maxSimilarity = -1;
    let nearestIdx = 0;

    for (let i = 0; i < centroids.length; i++) {
      const similarity = this.calculateSimilarity(embedding, centroids[i]);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        nearestIdx = i;
      }
    }

    return nearestIdx;
  }

  /**
   * Calculate the centroid (mean) of a group of experiences
   */
  private calculateCentroid(experiences: CapturedExperience[]): number[] {
    if (experiences.length === 0) {
      throw new Error('Cannot calculate centroid of empty cluster');
    }

    const dimension = experiences[0].embedding!.length;
    const centroid = new Array(dimension).fill(0);

    for (const exp of experiences) {
      for (let i = 0; i < dimension; i++) {
        centroid[i] += exp.embedding![i];
      }
    }

    // Average
    for (let i = 0; i < dimension; i++) {
      centroid[i] /= experiences.length;
    }

    // Normalize (important for cosine similarity)
    const magnitude = Math.sqrt(centroid.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < dimension; i++) {
        centroid[i] /= magnitude;
      }
    }

    return centroid;
  }

  /**
   * Create a cluster from a group of experiences
   */
  private createCluster(members: CapturedExperience[]): Cluster {
    return {
      id: `cluster-${SecureRandom.randomString(8, 'alphanumeric')}`,
      centroid: this.calculateCentroid(members),
      members,
      size: members.length,
    };
  }

  /**
   * Apply diversity-aware selection (MMR-style)
   * Selects diverse clusters to maximize coverage
   */
  private applyDiversitySelection(clusters: Cluster[], maxClusters: number): Cluster[] {
    if (clusters.length <= maxClusters) return clusters;

    const selected: Cluster[] = [];
    const remaining = [...clusters];

    // Select first cluster (largest)
    remaining.sort((a, b) => b.size - a.size);
    selected.push(remaining.shift()!);

    // Iteratively select most diverse remaining cluster
    while (selected.length < maxClusters && remaining.length > 0) {
      let maxMinSimilarity = -1;
      let mostDiverseIdx = 0;

      // Find cluster most different from selected clusters
      for (let i = 0; i < remaining.length; i++) {
        // Calculate minimum similarity to any selected cluster
        const minSimilarity = Math.min(
          ...selected.map(s => this.calculateSimilarity(remaining[i].centroid, s.centroid))
        );

        // We want the cluster with maximum min-similarity (most different)
        if (minSimilarity > maxMinSimilarity) {
          maxMinSimilarity = minSimilarity;
          mostDiverseIdx = i;
        }
      }

      selected.push(remaining.splice(mostDiverseIdx, 1)[0]);
    }

    this.logger.debug('[ClusteringEngine] Applied diversity selection', {
      before: clusters.length,
      after: selected.length,
    });

    return selected;
  }
}

export default ClusteringEngine;
