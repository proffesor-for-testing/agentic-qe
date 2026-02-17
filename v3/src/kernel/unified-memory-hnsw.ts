/**
 * In-Memory HNSW Index for Fast Vector Search
 *
 * Provides O(log n) approximate nearest neighbor search via a multi-layer
 * navigable small-world graph. Extracted from unified-memory.ts.
 *
 * Algorithm reference: Malkov & Yashunin, "Efficient and robust approximate
 * nearest neighbor search using Hierarchical Navigable Small World graphs",
 * IEEE TPAMI 2018.
 */

import { cosineSimilarity } from '../shared/utils/vector-math.js';
import { HNSW_CONSTANTS } from './constants.js';

// ============================================================================
// Binary Heap (used by HNSW beam search)
// ============================================================================

/**
 * Binary min/max heap for O(log n) insertion and extraction.
 * Replaces sorted arrays with O(n) splice in HNSW beam search.
 */
export class BinaryHeap<T> {
  private data: T[] = [];
  private compareFn: (a: T, b: T) => number;

  constructor(compareFn: (a: T, b: T) => number) {
    this.compareFn = compareFn;
  }

  push(item: T): void {
    this.data.push(item);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  peek(): T | undefined {
    return this.data[0];
  }

  size(): number {
    return this.data.length;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compareFn(this.data[i], this.data[parent]) < 0) {
        [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
        i = parent;
      } else {
        break;
      }
    }
  }

  private sinkDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.compareFn(this.data[left], this.data[smallest]) < 0) {
        smallest = left;
      }
      if (right < n && this.compareFn(this.data[right], this.data[smallest]) < 0) {
        smallest = right;
      }
      if (smallest !== i) {
        [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
        i = smallest;
      } else {
        break;
      }
    }
  }
}

// ============================================================================
// HNSW Node Interface
// ============================================================================

interface HNSWNode {
  id: string;
  embedding: number[];
  neighbors: Map<number, string[]>; // level -> neighbor ids
}

// ============================================================================
// HNSW Index
// ============================================================================

/**
 * In-memory HNSW (Hierarchical Navigable Small World) index built from
 * SQLite vectors on startup. Provides O(log n) approximate nearest
 * neighbor search via a multi-layer navigable small-world graph.
 */
export class InMemoryHNSWIndex {
  private nodes: Map<string, HNSWNode> = new Map();
  private readonly M: number = HNSW_CONSTANTS.M_CONNECTIONS;
  private readonly Mmax0: number = HNSW_CONSTANTS.M_CONNECTIONS * 2;
  private readonly efConstruction: number = HNSW_CONSTANTS.EF_CONSTRUCTION;
  private readonly efSearch: number = HNSW_CONSTANTS.EF_SEARCH;
  private readonly mL: number = 1 / Math.log(HNSW_CONSTANTS.M_CONNECTIONS);
  private readonly maxLevel: number = 16;

  private entryPoint: string | null = null;
  private currentMaxLevel: number = -1;

  /**
   * Assign a random layer for a new node using a geometric distribution.
   * level = floor(-ln(uniform_random) * mL), capped at maxLevel.
   */
  private randomLevel(): number {
    return Math.min(
      Math.floor(-Math.log(Math.random()) * this.mL),
      this.maxLevel
    );
  }

  /**
   * Compute cosine similarity between a query vector and a stored node.
   */
  private similarity(query: number[], nodeId: string): number {
    const node = this.nodes.get(nodeId);
    if (!node) return -1;
    return cosineSimilarity(query, node.embedding);
  }

  /**
   * Greedy search at a single layer: starting from a single entry point,
   * greedily move to the neighbor closest to the query until no improvement.
   * Returns the closest node found.
   */
  private searchLayer(
    query: number[],
    entryId: string,
    level: number
  ): string {
    let current = entryId;
    let currentDist = this.similarity(query, current);
    let improved = true;

    while (improved) {
      improved = false;
      const node = this.nodes.get(current);
      if (!node) break;

      const neighbors = node.neighbors.get(level) ?? [];
      for (const neighborId of neighbors) {
        if (!this.nodes.has(neighborId)) continue;
        const dist = this.similarity(query, neighborId);
        if (dist > currentDist) {
          current = neighborId;
          currentDist = dist;
          improved = true;
        }
      }
    }

    return current;
  }

  /**
   * Beam search at a single layer: starting from an entry point, explore
   * up to `ef` candidates and return the `ef` closest found.
   * Uses a max-heap for candidates and a min-heap for results to achieve
   * O(log n) insertion instead of O(n) Array.splice.
   * Returns results sorted by descending similarity.
   */
  private searchLayerBeam(
    query: number[],
    entryIds: string[],
    level: number,
    ef: number
  ): Array<{ id: string; score: number }> {
    const visited = new Set<string>(entryIds);

    const initial = entryIds
      .filter(id => this.nodes.has(id))
      .map(id => ({ id, score: this.similarity(query, id) }));

    // Max-heap for candidates (best score = highest priority)
    const candidateHeap = new BinaryHeap<{ id: string; score: number }>(
      (a, b) => b.score - a.score // max-heap: highest score first
    );
    // Min-heap for results (worst score at top for fast eviction)
    const resultHeap = new BinaryHeap<{ id: string; score: number }>(
      (a, b) => a.score - b.score // min-heap: lowest score first
    );

    for (const entry of initial) {
      candidateHeap.push(entry);
      resultHeap.push(entry);
    }

    while (candidateHeap.size() > 0) {
      const closest = candidateHeap.pop()!;

      // If the closest candidate is worse than the worst in results
      // and we already have ef results, stop
      if (resultHeap.size() >= ef && closest.score < resultHeap.peek()!.score) {
        break;
      }

      const node = this.nodes.get(closest.id);
      if (!node) continue;

      const neighbors = node.neighbors.get(level) ?? [];
      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        if (!this.nodes.has(neighborId)) continue;

        const score = this.similarity(query, neighborId);
        const worstResult = resultHeap.size() >= ef ? resultHeap.peek()!.score : -Infinity;

        if (resultHeap.size() < ef || score > worstResult) {
          const entry = { id: neighborId, score };
          candidateHeap.push(entry);
          resultHeap.push(entry);

          // Evict worst result if over capacity
          if (resultHeap.size() > ef) {
            resultHeap.pop();
          }
        }
      }
    }

    // Drain result heap into array sorted descending by score
    const results: Array<{ id: string; score: number }> = [];
    while (resultHeap.size() > 0) {
      results.push(resultHeap.pop()!);
    }
    results.reverse(); // min-heap drains ascending, reverse for descending
    return results;
  }

  /**
   * Select the M best neighbors from candidates for a node, using the
   * simple heuristic (closest M by similarity).
   */
  private selectNeighbors(
    _query: number[],
    candidates: Array<{ id: string; score: number }>,
    maxConnections: number
  ): string[] {
    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, maxConnections)
      .map(c => c.id);
  }

  /**
   * Get max connections allowed at a given level.
   * Level 0 allows Mmax0 (= 2*M), higher levels allow M.
   */
  private getMaxConnections(level: number): number {
    return level === 0 ? this.Mmax0 : this.M;
  }

  /**
   * Add a vector to the HNSW index with proper graph construction.
   * O(log n) amortized via hierarchical layer structure.
   */
  add(id: string, embedding: number[]): void {
    // Handle duplicate: remove old node first
    if (this.nodes.has(id)) {
      this.remove(id);
    }

    const nodeLevel = this.randomLevel();
    const newNode: HNSWNode = {
      id,
      embedding,
      neighbors: new Map(),
    };

    // Initialize neighbor lists for each layer
    for (let l = 0; l <= nodeLevel; l++) {
      newNode.neighbors.set(l, []);
    }

    this.nodes.set(id, newNode);

    // First node: set as entry point
    if (this.entryPoint === null) {
      this.entryPoint = id;
      this.currentMaxLevel = nodeLevel;
      return;
    }

    let currentEntry = this.entryPoint;

    // Phase 1: Traverse layers above the new node's level (greedy descent)
    for (let l = this.currentMaxLevel; l > nodeLevel; l--) {
      currentEntry = this.searchLayer(embedding, currentEntry, l);
    }

    // Phase 2: For each layer from nodeLevel down to 0, find neighbors and link
    for (let l = Math.min(nodeLevel, this.currentMaxLevel); l >= 0; l--) {
      const maxConn = this.getMaxConnections(l);

      // Beam search to find efConstruction nearest neighbors at this layer
      const nearest = this.searchLayerBeam(embedding, [currentEntry], l, this.efConstruction);

      // Select M best neighbors
      const selectedIds = this.selectNeighbors(embedding, nearest, maxConn);

      // Set the new node's neighbors at this layer
      newNode.neighbors.set(l, [...selectedIds]);

      // Add bidirectional connections and prune if over capacity
      for (const neighborId of selectedIds) {
        const neighbor = this.nodes.get(neighborId);
        if (!neighbor) continue;

        const neighborList = neighbor.neighbors.get(l) ?? [];
        neighborList.push(id);

        // Prune if neighbor has too many connections
        if (neighborList.length > maxConn) {
          // Keep the maxConn closest neighbors
          const scored = neighborList
            .filter(nId => this.nodes.has(nId))
            .map(nId => ({
              id: nId,
              score: cosineSimilarity(neighbor.embedding, this.nodes.get(nId)!.embedding),
            }));
          scored.sort((a, b) => b.score - a.score);
          neighbor.neighbors.set(l, scored.slice(0, maxConn).map(s => s.id));
        } else {
          neighbor.neighbors.set(l, neighborList);
        }
      }

      // Update entry for next layer down
      if (nearest.length > 0) {
        currentEntry = nearest[0].id;
      }
    }

    // Update entry point if new node's level exceeds current max
    if (nodeLevel > this.currentMaxLevel) {
      this.entryPoint = id;
      this.currentMaxLevel = nodeLevel;
    }
  }

  /**
   * Remove a node from the HNSW index and repair connections.
   * Orphaned neighbors are reconnected to the removed node's other neighbors.
   */
  remove(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;

    // For each layer the node exists in, remove from neighbor lists and repair
    for (const [level, neighbors] of node.neighbors.entries()) {
      for (const neighborId of neighbors) {
        const neighbor = this.nodes.get(neighborId);
        if (!neighbor) continue;

        const neighborList = neighbor.neighbors.get(level);
        if (!neighborList) continue;

        // Remove the deleted node from this neighbor's list
        const idx = neighborList.indexOf(id);
        if (idx !== -1) {
          neighborList.splice(idx, 1);
        }

        // Try to reconnect: for each of the deleted node's other neighbors,
        // add a connection if capacity allows and not already connected
        const maxConn = this.getMaxConnections(level);
        if (neighborList.length < maxConn) {
          for (const otherNeighborId of neighbors) {
            if (
              otherNeighborId !== neighborId &&
              otherNeighborId !== id &&
              this.nodes.has(otherNeighborId) &&
              !neighborList.includes(otherNeighborId)
            ) {
              neighborList.push(otherNeighborId);
              // Add reverse connection too
              const otherNeighbor = this.nodes.get(otherNeighborId);
              if (otherNeighbor) {
                const otherList = otherNeighbor.neighbors.get(level) ?? [];
                if (!otherList.includes(neighborId) && otherList.length < maxConn) {
                  otherList.push(neighborId);
                  otherNeighbor.neighbors.set(level, otherList);
                }
              }
              if (neighborList.length >= maxConn) break;
            }
          }
        }

        neighbor.neighbors.set(level, neighborList);
      }
    }

    // Delete the node
    this.nodes.delete(id);

    // If the entry point was removed, pick a replacement
    if (this.entryPoint === id) {
      if (this.nodes.size === 0) {
        this.entryPoint = null;
        this.currentMaxLevel = -1;
      } else {
        // Find the node with the highest level to be the new entry point
        let bestId: string | null = null;
        let bestLevel = -1;
        for (const [nodeId, n] of this.nodes.entries()) {
          let maxNodeLevel = -1;
          for (const l of n.neighbors.keys()) {
            if (l > maxNodeLevel) maxNodeLevel = l;
          }
          if (maxNodeLevel > bestLevel) {
            bestLevel = maxNodeLevel;
            bestId = nodeId;
          }
        }
        this.entryPoint = bestId;
        this.currentMaxLevel = bestLevel;
      }
    }

    return true;
  }

  /**
   * Search for k approximate nearest neighbors using HNSW traversal.
   * O(log n) via hierarchical layer descent + beam search at base layer.
   */
  search(query: number[], k: number): Array<{ id: string; score: number }> {
    if (this.nodes.size === 0 || this.entryPoint === null) {
      return [];
    }

    // Single node shortcut
    if (this.nodes.size === 1) {
      const node = this.nodes.get(this.entryPoint)!;
      return [{ id: node.id, score: cosineSimilarity(query, node.embedding) }];
    }

    let currentEntry = this.entryPoint;

    // Phase 1: Greedily traverse layers above base to find local minimum
    for (let l = this.currentMaxLevel; l > 0; l--) {
      currentEntry = this.searchLayer(query, currentEntry, l);
    }

    // Phase 2: Beam search at layer 0 with efSearch candidates
    const ef = Math.max(this.efSearch, k);
    const results = this.searchLayerBeam(query, [currentEntry], 0, ef);

    // Return top-k results sorted by descending similarity
    return results.slice(0, k);
  }

  /**
   * Get index size
   */
  size(): number {
    return this.nodes.size;
  }

  /**
   * Clear the index and reset entry point
   */
  clear(): void {
    this.nodes.clear();
    this.entryPoint = null;
    this.currentMaxLevel = -1;
  }
}
