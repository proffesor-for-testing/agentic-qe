/**
 * Tiered Compression for Vector Storage
 * Achieves 2-32x memory reduction with automatic tier management
 */

export type CompressionTier = 'f32' | 'f16' | 'pq8' | 'pq4' | 'binary';

export interface TierConfig {
  tier: CompressionTier;
  accessThreshold: number;  // Minimum access frequency (0-1) to stay in tier
  compressionRatio: number;
  accuracyRetention: number;
}

export const DEFAULT_TIERS: TierConfig[] = [
  { tier: 'f32', accessThreshold: 0.8, compressionRatio: 1, accuracyRetention: 1.0 },
  { tier: 'f16', accessThreshold: 0.4, compressionRatio: 2, accuracyRetention: 0.99 },
  { tier: 'pq8', accessThreshold: 0.1, compressionRatio: 8, accuracyRetention: 0.97 },
  { tier: 'pq4', accessThreshold: 0.01, compressionRatio: 16, accuracyRetention: 0.95 },
  { tier: 'binary', accessThreshold: 0, compressionRatio: 32, accuracyRetention: 0.90 },
];

export interface CompressedVector {
  id: string;
  tier: CompressionTier;
  data: ArrayBuffer;
  originalDimension: number;
  accessCount: number;
  lastAccessed: number;
  createdAt: number;
}

/**
 * Float16 encoding/decoding
 */
export function encodeF16(vector: Float32Array): Uint16Array {
  const result = new Uint16Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    result[i] = float32ToFloat16(vector[i]);
  }
  return result;
}

export function decodeF16(data: Uint16Array): Float32Array {
  const result = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = float16ToFloat32(data[i]);
  }
  return result;
}

function float32ToFloat16(val: number): number {
  const floatView = new Float32Array(1);
  const int32View = new Int32Array(floatView.buffer);
  floatView[0] = val;
  const x = int32View[0];

  let bits = (x >> 16) & 0x8000;
  let m = (x >> 12) & 0x07ff;
  const e = (x >> 23) & 0xff;

  if (e < 103) return bits;
  if (e > 142) {
    bits |= 0x7c00;
    bits |= (e === 255 ? 0 : 1) && (x & 0x007fffff);
    return bits;
  }
  if (e < 113) {
    m |= 0x0800;
    bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
    return bits;
  }

  bits |= ((e - 112) << 10) | (m >> 1);
  bits += m & 1;
  return bits;
}

function float16ToFloat32(h: number): number {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7c00) >> 10;
  const f = h & 0x03ff;

  if (e === 0) {
    return (s ? -1 : 1) * Math.pow(2, -14) * (f / Math.pow(2, 10));
  } else if (e === 0x1f) {
    return f ? NaN : ((s ? -1 : 1) * Infinity);
  }
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / Math.pow(2, 10));
}

/**
 * Product Quantization (PQ) encoding
 */
export class ProductQuantizer {
  private codebooks: Float32Array[][] = [];
  private subvectorSize: number;
  private numSubvectors: number;
  private numCentroids: number;

  constructor(dimension: number, bits: 8 | 4 = 8) {
    this.numCentroids = bits === 8 ? 256 : 16;
    this.numSubvectors = bits === 8 ? 48 : 96;  // For 384-dim vectors
    this.subvectorSize = Math.ceil(dimension / this.numSubvectors);
    this.initializeCodebooks();
  }

  private initializeCodebooks(): void {
    // Initialize with random centroids (would normally train on data)
    for (let i = 0; i < this.numSubvectors; i++) {
      this.codebooks[i] = [];
      for (let j = 0; j < this.numCentroids; j++) {
        const centroid = new Float32Array(this.subvectorSize);
        for (let k = 0; k < this.subvectorSize; k++) {
          centroid[k] = (Math.random() - 0.5) * 2;
        }
        this.codebooks[i].push(centroid);
      }
    }
  }

  encode(vector: Float32Array): Uint8Array {
    const codes = new Uint8Array(this.numSubvectors);

    for (let i = 0; i < this.numSubvectors; i++) {
      const start = i * this.subvectorSize;
      const end = Math.min(start + this.subvectorSize, vector.length);
      const subvector = vector.slice(start, end);

      // Find nearest centroid
      let bestIdx = 0;
      let bestDist = Infinity;

      for (let j = 0; j < this.numCentroids; j++) {
        let dist = 0;
        for (let k = 0; k < subvector.length; k++) {
          const diff = subvector[k] - (this.codebooks[i][j][k] || 0);
          dist += diff * diff;
        }
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = j;
        }
      }

      codes[i] = bestIdx;
    }

    return codes;
  }

  decode(codes: Uint8Array): Float32Array {
    const vector = new Float32Array(this.numSubvectors * this.subvectorSize);

    for (let i = 0; i < this.numSubvectors; i++) {
      const centroid = this.codebooks[i][codes[i]];
      const start = i * this.subvectorSize;
      for (let k = 0; k < this.subvectorSize && k < centroid.length; k++) {
        vector[start + k] = centroid[k];
      }
    }

    return vector;
  }
}

/**
 * Binary quantization (sign-based)
 */
export function encodeBinary(vector: Float32Array): Uint8Array {
  const numBytes = Math.ceil(vector.length / 8);
  const result = new Uint8Array(numBytes);

  for (let i = 0; i < vector.length; i++) {
    if (vector[i] > 0) {
      result[Math.floor(i / 8)] |= (1 << (i % 8));
    }
  }

  return result;
}

export function decodeBinary(data: Uint8Array, dimension: number): Float32Array {
  const result = new Float32Array(dimension);

  for (let i = 0; i < dimension; i++) {
    const bit = (data[Math.floor(i / 8)] >> (i % 8)) & 1;
    result[i] = bit ? 1 : -1;
  }

  return result;
}

/**
 * Tiered Compression Manager
 */
export class TieredCompressionManager {
  private tiers: TierConfig[];
  private pq8: ProductQuantizer;
  private pq4: ProductQuantizer;
  private accessCounts: Map<string, number> = new Map();
  private totalAccesses: number = 0;
  private dimension: number;

  constructor(dimension: number = 384, tiers?: TierConfig[]) {
    this.dimension = dimension;
    this.tiers = tiers || DEFAULT_TIERS;
    this.pq8 = new ProductQuantizer(dimension, 8);
    this.pq4 = new ProductQuantizer(dimension, 4);
  }

  /**
   * Compress vector to specified tier
   */
  compress(vector: Float32Array, tier: CompressionTier): ArrayBuffer {
    switch (tier) {
      case 'f32': {
        const buf = vector.buffer.slice(0);
        return buf instanceof SharedArrayBuffer ? new ArrayBuffer(buf.byteLength) : buf;
      }
      case 'f16': {
        const encoded = encodeF16(vector);
        const buf = encoded.buffer;
        return buf instanceof SharedArrayBuffer ? new ArrayBuffer(buf.byteLength) : buf;
      }
      case 'pq8': {
        const encoded = this.pq8.encode(vector);
        const buf = encoded.buffer;
        return buf instanceof SharedArrayBuffer ? new ArrayBuffer(buf.byteLength) : buf;
      }
      case 'pq4': {
        const encoded = this.pq4.encode(vector);
        const buf = encoded.buffer;
        return buf instanceof SharedArrayBuffer ? new ArrayBuffer(buf.byteLength) : buf;
      }
      case 'binary': {
        const encoded = encodeBinary(vector);
        const buf = encoded.buffer;
        return buf instanceof SharedArrayBuffer ? new ArrayBuffer(buf.byteLength) : buf;
      }
      default: {
        const buf = vector.buffer.slice(0);
        return buf instanceof SharedArrayBuffer ? new ArrayBuffer(buf.byteLength) : buf;
      }
    }
  }

  /**
   * Decompress vector from specified tier
   */
  decompress(data: ArrayBuffer, tier: CompressionTier): Float32Array {
    switch (tier) {
      case 'f32':
        return new Float32Array(data);
      case 'f16':
        return decodeF16(new Uint16Array(data));
      case 'pq8':
        return this.pq8.decode(new Uint8Array(data));
      case 'pq4':
        return this.pq4.decode(new Uint8Array(data));
      case 'binary':
        return decodeBinary(new Uint8Array(data), this.dimension);
      default:
        return new Float32Array(data);
    }
  }

  /**
   * Record access and return recommended tier
   */
  recordAccess(id: string): CompressionTier {
    const count = (this.accessCounts.get(id) || 0) + 1;
    this.accessCounts.set(id, count);
    this.totalAccesses++;

    const frequency = count / Math.max(this.totalAccesses, 1);
    return this.recommendTier(frequency);
  }

  /**
   * Recommend tier based on access frequency
   */
  recommendTier(accessFrequency: number): CompressionTier {
    for (const tier of this.tiers) {
      if (accessFrequency >= tier.accessThreshold) {
        return tier.tier;
      }
    }
    return 'binary';
  }

  /**
   * Get compression statistics
   */
  getStats(): {
    tierDistribution: Record<CompressionTier, number>;
    avgCompressionRatio: number;
    memoryReduction: number;
  } {
    const distribution: Record<CompressionTier, number> = {
      f32: 0, f16: 0, pq8: 0, pq4: 0, binary: 0
    };

    let totalRatio = 0;
    let count = 0;

    // Use Array.from to iterate Map
    Array.from(this.accessCounts.entries()).forEach(([id, accessCount]) => {
      const freq = accessCount / this.totalAccesses;
      const tier = this.recommendTier(freq);
      distribution[tier]++;

      const tierConfig = this.tiers.find(t => t.tier === tier);
      if (tierConfig) {
        totalRatio += tierConfig.compressionRatio;
        count++;
      }
    });

    const avgRatio = count > 0 ? totalRatio / count : 1;

    return {
      tierDistribution: distribution,
      avgCompressionRatio: avgRatio,
      memoryReduction: 1 - (1 / avgRatio),
    };
  }
}
