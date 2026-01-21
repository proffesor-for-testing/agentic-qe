import * as zlib from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);
const deflateAsync = promisify(zlib.deflate);
const inflateAsync = promisify(zlib.inflate);

export type CompressionAlgorithm = 'gzip' | 'deflate';

export interface CompressionMetadata {
  algorithm: CompressionAlgorithm;
  compressed: boolean;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  timestamp: number;
}

/**
 * CompressionManager - Handles compression and decompression of large data
 *
 * Features:
 * - Gzip and Deflate compression
 * - Automatic compression for large values
 * - Compression ratio tracking
 * - Base64 encoding for storage
 * - Configurable compression thresholds
 */
export class CompressionManager {
  private static readonly DEFAULT_ALGORITHM: CompressionAlgorithm = 'gzip';
  private static readonly DEFAULT_THRESHOLD = 1024; // 1KB
  private static readonly COMPRESSION_PREFIX = 'COMPRESSED:';

  /**
   * Compress data using specified algorithm
   */
  async compress(
    data: string,
    algorithm: CompressionAlgorithm = CompressionManager.DEFAULT_ALGORITHM
  ): Promise<string> {
    try {
      const buffer = Buffer.from(data, 'utf8');
      let compressed: Buffer;

      if (algorithm === 'gzip') {
        compressed = await gzipAsync(buffer);
      } else if (algorithm === 'deflate') {
        compressed = await deflateAsync(buffer);
      } else {
        throw new Error(`Unsupported compression algorithm: ${algorithm}`);
      }

      // Format: COMPRESSED:algorithm:base64data
      return `${CompressionManager.COMPRESSION_PREFIX}${algorithm}:${compressed.toString('base64')}`;
    } catch (error) {
      throw new Error(`Compression failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decompress data
   */
  async decompress(
    compressedData: string,
    algorithm?: CompressionAlgorithm
  ): Promise<string> {
    try {
      // Parse compressed format
      if (!compressedData.startsWith(CompressionManager.COMPRESSION_PREFIX)) {
        throw new Error('Invalid compressed data format');
      }

      const withoutPrefix = compressedData.substring(CompressionManager.COMPRESSION_PREFIX.length);
      const parts = withoutPrefix.split(':');

      if (parts.length !== 2) {
        throw new Error('Invalid compressed data format');
      }

      const detectedAlgorithm = parts[0] as CompressionAlgorithm;
      const base64Data = parts[1];

      const compressionAlgorithm = algorithm || detectedAlgorithm;
      const buffer = Buffer.from(base64Data, 'base64');

      let decompressed: Buffer;

      if (compressionAlgorithm === 'gzip') {
        decompressed = await gunzipAsync(buffer);
      } else if (compressionAlgorithm === 'deflate') {
        decompressed = await inflateAsync(buffer);
      } else {
        throw new Error(`Unsupported compression algorithm: ${compressionAlgorithm}`);
      }

      return decompressed.toString('utf8');
    } catch (error) {
      throw new Error(`Decompression failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if data should be compressed based on size threshold
   */
  shouldCompress(
    data: string,
    threshold: number = CompressionManager.DEFAULT_THRESHOLD
  ): boolean {
    const size = Buffer.byteLength(data, 'utf8');
    return size > threshold;
  }

  /**
   * Check if data is compressed
   */
  isCompressed(data: string): boolean {
    return data.startsWith(CompressionManager.COMPRESSION_PREFIX);
  }

  /**
   * Get compression metadata from compressed data
   */
  getCompressionMetadata(compressedData: string): Partial<CompressionMetadata> {
    if (!this.isCompressed(compressedData)) {
      return { compressed: false };
    }

    const withoutPrefix = compressedData.substring(CompressionManager.COMPRESSION_PREFIX.length);
    const parts = withoutPrefix.split(':');

    if (parts.length !== 2) {
      return { compressed: false };
    }

    return {
      algorithm: parts[0] as CompressionAlgorithm,
      compressed: true,
      compressedSize: Buffer.byteLength(compressedData, 'utf8'),
      timestamp: Date.now()
    };
  }

  /**
   * Calculate compression ratio
   */
  getCompressionRatio(originalData: string, compressedData: string): number {
    const originalSize = Buffer.byteLength(originalData, 'utf8');
    const compressedSize = Buffer.byteLength(compressedData, 'utf8');

    if (originalSize === 0) {
      return 0;
    }

    return compressedSize / originalSize;
  }

  /**
   * Compress with automatic algorithm selection
   */
  async compressAuto(data: string): Promise<string> {
    // Try both algorithms and use the one with better compression
    const gzipped = await this.compress(data, 'gzip');
    const deflated = await this.compress(data, 'deflate');

    return gzipped.length < deflated.length ? gzipped : deflated;
  }

  /**
   * Compress only if beneficial (size reduction)
   */
  async compressIfBeneficial(
    data: string,
    minCompressionRatio: number = 0.9
  ): Promise<{ compressed: boolean; data: string; ratio?: number }> {
    const compressed = await this.compress(data);
    const ratio = this.getCompressionRatio(data, compressed);

    if (ratio < minCompressionRatio) {
      return { compressed: true, data: compressed, ratio };
    }

    return { compressed: false, data };
  }

  /**
   * Compress object to string
   */
  async compressObject(
    obj: any,
    algorithm?: CompressionAlgorithm
  ): Promise<string> {
    const jsonString = JSON.stringify(obj);
    return this.compress(jsonString, algorithm);
  }

  /**
   * Decompress to object
   */
  async decompressObject<T = any>(
    compressedData: string,
    algorithm?: CompressionAlgorithm
  ): Promise<T> {
    const decompressed = await this.decompress(compressedData, algorithm);
    return JSON.parse(decompressed);
  }

  /**
   * Get compression statistics for data
   */
  async getCompressionStats(
    data: string,
    algorithm?: CompressionAlgorithm
  ): Promise<CompressionMetadata> {
    const originalSize = Buffer.byteLength(data, 'utf8');
    const compressed = await this.compress(data, algorithm);
    const compressedSize = Buffer.byteLength(compressed, 'utf8');
    const compressionRatio = compressedSize / originalSize;

    const metadata = this.getCompressionMetadata(compressed);

    return {
      algorithm: metadata.algorithm || CompressionManager.DEFAULT_ALGORITHM,
      compressed: true,
      originalSize,
      compressedSize,
      compressionRatio,
      timestamp: Date.now()
    };
  }

  /**
   * Estimate compression ratio without actually compressing
   */
  estimateCompressionRatio(data: string): number {
    // Simple heuristic: count repeated patterns
    const uniqueChars = new Set(data).size;
    const totalChars = data.length;

    if (totalChars === 0) {
      return 1;
    }

    // More repeated characters = better compression
    const entropy = uniqueChars / totalChars;
    return Math.max(0.1, Math.min(1, entropy));
  }

  /**
   * Batch compress multiple values
   */
  async compressBatch(
    values: string[],
    algorithm?: CompressionAlgorithm
  ): Promise<string[]> {
    return Promise.all(values.map(value => this.compress(value, algorithm)));
  }

  /**
   * Batch decompress multiple values
   */
  async decompressBatch(
    compressedValues: string[],
    algorithm?: CompressionAlgorithm
  ): Promise<string[]> {
    return Promise.all(compressedValues.map(value => this.decompress(value, algorithm)));
  }
}
