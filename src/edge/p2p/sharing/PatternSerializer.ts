/**
 * Pattern Serializer for Binary Encoding and Anonymization
 *
 * Provides efficient binary serialization of patterns for P2P transmission,
 * along with privacy-preserving anonymization and differential privacy helpers.
 *
 * @module edge/p2p/sharing/PatternSerializer
 * @version 1.0.0
 */

import type {
  SharedPattern,
  PatternContent,
  PatternSharingMetadata,
  PatternVersion,
  PatternQualityMetrics,
  PatternSharingConfig,
  PatternSummary,
  AnonymizationConfig,
  AnonymizationResult,
  AnonymizationStats,
  DifferentialPrivacyConfig,
  DPResult,
} from './types';
import {
  PatternCategory,
  PatternQuality,
  SharingPolicy,
  PrivacyLevel,
  SharingError,
  SharingErrorCode,
  MAX_PATTERN_SIZE,
  DEFAULT_ANONYMIZATION_CONFIG,
  DEFAULT_DP_EPSILON,
  DEFAULT_DP_DELTA,
} from './types';

// ============================================
// Constants
// ============================================

/**
 * Magic bytes for pattern binary format
 */
const MAGIC_BYTES = new Uint8Array([0x50, 0x41, 0x54, 0x54]); // "PATT"

/**
 * Binary format version
 */
const FORMAT_VERSION = 1;

/**
 * Reserved keywords to preserve during anonymization
 */
const RESERVED_KEYWORDS = new Set([
  // JavaScript/TypeScript keywords
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'undefined',
  'var',
  'void',
  'while',
  'with',
  'yield',
  // Common types
  'string',
  'number',
  'boolean',
  'object',
  'any',
  'unknown',
  'never',
  'void',
  'Array',
  'Promise',
  'Map',
  'Set',
  'Date',
  'Error',
  'RegExp',
  'JSON',
  'Math',
  'console',
  // Testing
  'describe',
  'it',
  'test',
  'expect',
  'jest',
  'beforeEach',
  'afterEach',
  'beforeAll',
  'afterAll',
  'mock',
  'spy',
]);

// ============================================
// Pattern Serializer Class
// ============================================

/**
 * Serializes and deserializes patterns for P2P transmission
 *
 * @example
 * ```typescript
 * const serializer = new PatternSerializer();
 *
 * // Serialize a pattern
 * const binary = serializer.serialize(pattern);
 *
 * // Deserialize
 * const restored = serializer.deserialize(binary);
 *
 * // Anonymize content
 * const anonymized = serializer.anonymize(pattern);
 * ```
 */
export class PatternSerializer {
  private textEncoder: TextEncoder;
  private textDecoder: TextDecoder;
  private anonymizationConfig: AnonymizationConfig;

  constructor(anonymizationConfig?: Partial<AnonymizationConfig>) {
    this.textEncoder = new TextEncoder();
    this.textDecoder = new TextDecoder();
    this.anonymizationConfig = {
      ...DEFAULT_ANONYMIZATION_CONFIG,
      ...anonymizationConfig,
    };
  }

  // ============================================
  // Serialization
  // ============================================

  /**
   * Serialize a pattern to binary format
   *
   * Binary format:
   * - 4 bytes: Magic "PATT"
   * - 1 byte: Format version
   * - 4 bytes: Total length (BE)
   * - 4 bytes: Embedding length (BE)
   * - N bytes: Embedding (Float32Array)
   * - 4 bytes: JSON length (BE)
   * - M bytes: JSON payload (UTF-8)
   * - 32 bytes: SHA-256 checksum
   */
  async serialize(pattern: SharedPattern): Promise<Uint8Array> {
    // Convert embedding to Float32Array
    const embedding = this.normalizeEmbedding(pattern.embedding);
    const embeddingBytes = new Uint8Array(embedding.buffer);

    // Create JSON payload (without embedding)
    const jsonPayload = this.createJsonPayload(pattern);
    const jsonBytes = this.textEncoder.encode(jsonPayload);

    // Calculate total size
    const totalSize =
      4 + // magic
      1 + // version
      4 + // total length
      4 + // embedding length
      embeddingBytes.length +
      4 + // json length
      jsonBytes.length +
      32; // checksum

    if (totalSize > MAX_PATTERN_SIZE) {
      throw new SharingError(
        `Pattern size ${totalSize} exceeds maximum ${MAX_PATTERN_SIZE}`,
        SharingErrorCode.PATTERN_TOO_LARGE
      );
    }

    // Build buffer
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let offset = 0;

    // Magic bytes
    bytes.set(MAGIC_BYTES, offset);
    offset += 4;

    // Version
    view.setUint8(offset, FORMAT_VERSION);
    offset += 1;

    // Total length
    view.setUint32(offset, totalSize, false);
    offset += 4;

    // Embedding length
    view.setUint32(offset, embeddingBytes.length, false);
    offset += 4;

    // Embedding
    bytes.set(embeddingBytes, offset);
    offset += embeddingBytes.length;

    // JSON length
    view.setUint32(offset, jsonBytes.length, false);
    offset += 4;

    // JSON
    bytes.set(jsonBytes, offset);
    offset += jsonBytes.length;

    // Checksum
    const dataToHash = bytes.slice(0, offset);
    const checksum = await this.sha256(dataToHash);
    bytes.set(new Uint8Array(checksum), offset);

    return bytes;
  }

  /**
   * Deserialize a pattern from binary format
   */
  async deserialize(data: Uint8Array): Promise<SharedPattern> {
    if (data.length < 45) {
      // Minimum size
      throw new SharingError(
        'Invalid binary data: too short',
        SharingErrorCode.SERIALIZATION_ERROR
      );
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 0;

    // Verify magic bytes
    const magic = data.slice(offset, offset + 4);
    if (!this.arrayEquals(magic, MAGIC_BYTES)) {
      throw new SharingError(
        'Invalid binary data: wrong magic bytes',
        SharingErrorCode.SERIALIZATION_ERROR
      );
    }
    offset += 4;

    // Version
    const version = view.getUint8(offset);
    if (version > FORMAT_VERSION) {
      throw new SharingError(
        `Unsupported format version: ${version}`,
        SharingErrorCode.SERIALIZATION_ERROR
      );
    }
    offset += 1;

    // Total length
    const totalLength = view.getUint32(offset, false);
    if (totalLength !== data.length) {
      throw new SharingError(
        `Length mismatch: expected ${totalLength}, got ${data.length}`,
        SharingErrorCode.SERIALIZATION_ERROR
      );
    }
    offset += 4;

    // Embedding length
    const embeddingLength = view.getUint32(offset, false);
    offset += 4;

    // Embedding
    const embeddingBytes = data.slice(offset, offset + embeddingLength);
    const embedding = new Float32Array(
      embeddingBytes.buffer,
      embeddingBytes.byteOffset,
      embeddingLength / 4
    );
    offset += embeddingLength;

    // JSON length
    const jsonLength = view.getUint32(offset, false);
    offset += 4;

    // JSON
    const jsonBytes = data.slice(offset, offset + jsonLength);
    const jsonPayload = this.textDecoder.decode(jsonBytes);
    offset += jsonLength;

    // Checksum
    const storedChecksum = data.slice(offset, offset + 32);
    const dataToHash = data.slice(0, offset);
    const computedChecksum = await this.sha256(dataToHash);

    if (!this.arrayEquals(new Uint8Array(storedChecksum), new Uint8Array(computedChecksum))) {
      throw new SharingError(
        'Checksum verification failed',
        SharingErrorCode.SERIALIZATION_ERROR
      );
    }

    // Parse JSON and reconstruct pattern
    const parsed = JSON.parse(jsonPayload);
    return {
      ...parsed,
      embedding: Array.from(embedding),
    } as SharedPattern;
  }

  /**
   * Serialize pattern summary (lightweight)
   */
  serializeSummary(summary: PatternSummary): Uint8Array {
    const json = JSON.stringify(summary);
    return this.textEncoder.encode(json);
  }

  /**
   * Deserialize pattern summary
   */
  deserializeSummary(data: Uint8Array): PatternSummary {
    const json = this.textDecoder.decode(data);
    return JSON.parse(json) as PatternSummary;
  }

  // ============================================
  // Anonymization
  // ============================================

  /**
   * Anonymize a pattern's content
   */
  anonymize(
    pattern: SharedPattern,
    config?: Partial<AnonymizationConfig>
  ): SharedPattern {
    const cfg = { ...this.anonymizationConfig, ...config };
    const result = this.anonymizeContent(pattern.content.raw, cfg);

    return {
      ...pattern,
      content: {
        ...pattern.content,
        anonymized: result.content,
      },
      metadata: this.anonymizeMetadata(pattern.metadata),
    };
  }

  /**
   * Anonymize content string
   */
  anonymizeContent(content: string, config: AnonymizationConfig): AnonymizationResult {
    const stats: AnonymizationStats = {
      identifiersReplaced: 0,
      stringsReplaced: 0,
      numbersReplaced: 0,
      commentsRemoved: 0,
      charactersChanged: 0,
    };

    let result = content;
    const originalLength = content.length;
    const mapping: Record<string, string> = {};

    // Identifier counter for consistent replacement
    let identifierCounter = 0;
    const identifierMap = new Map<string, string>();

    // Remove comments if configured
    if (config.removeComments) {
      const before = result.length;
      result = this.removeComments(result);
      stats.commentsRemoved = Math.max(0, before - result.length);
    }

    // Replace string literals
    if (config.replaceStrings) {
      result = result.replace(
        /(["'`])(?:(?!\1)[^\\]|\\.)*\1/g,
        (match, quote) => {
          const isTemplateString = quote === '`' && match.includes('${');
          if (isTemplateString && config.preserveStructure) {
            // Preserve template structure but anonymize content
            return match.replace(
              /\$\{[^}]+\}/g,
              '${var}'
            );
          }
          stats.stringsReplaced++;
          const replacement = `${quote}str_${stats.stringsReplaced}${quote}`;
          mapping[match] = replacement;
          return replacement;
        }
      );
    }

    // Replace numbers
    if (config.replaceNumbers) {
      result = result.replace(
        /\b\d+(\.\d+)?\b/g,
        (match) => {
          stats.numbersReplaced++;
          return '0';
        }
      );
    }

    // Replace identifiers
    if (config.replaceIdentifiers) {
      const preserveWords = new Set([
        ...RESERVED_KEYWORDS,
        ...(config.preserveWords || []),
      ]);

      result = result.replace(
        /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g,
        (match) => {
          // Skip reserved words
          if (preserveWords.has(match) || preserveWords.has(match.toLowerCase())) {
            return match;
          }

          // Skip short identifiers (likely loop variables)
          if (match.length <= 2) {
            return match;
          }

          // Check if already mapped
          if (identifierMap.has(match)) {
            return identifierMap.get(match)!;
          }

          // Create new mapping
          const replacement = `var_${identifierCounter++}`;
          identifierMap.set(match, replacement);
          mapping[match] = replacement;
          stats.identifiersReplaced++;
          return replacement;
        }
      );
    }

    // Replace file paths
    if (config.replaceFilePaths) {
      result = result.replace(
        /(['"`])([\/\\]?(?:[\w.-]+[\/\\])+[\w.-]+)\1/g,
        (match, quote) => {
          return `${quote}/path/to/file${quote}`;
        }
      );
    }

    // Apply custom patterns
    if (config.customPatterns) {
      for (const pattern of config.customPatterns) {
        result = result.replace(pattern, '[REDACTED]');
      }
    }

    stats.charactersChanged = Math.abs(result.length - originalLength);

    return {
      content: result,
      mapping,
      stats,
    };
  }

  /**
   * Anonymize metadata
   */
  private anonymizeMetadata(metadata: PatternSharingMetadata): PatternSharingMetadata {
    return {
      ...metadata,
      sourceId: metadata.sourceId ? this.hashIdentifier(metadata.sourceId) : undefined,
      filePath: metadata.filePath ? '/path/to/file' : undefined,
      custom: undefined, // Remove custom metadata
    };
  }

  /**
   * Remove comments from code
   */
  private removeComments(code: string): string {
    // Remove single-line comments
    let result = code.replace(/\/\/.*$/gm, '');

    // Remove multi-line comments
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');

    return result;
  }

  // ============================================
  // Differential Privacy
  // ============================================

  /**
   * Apply differential privacy to an embedding
   */
  applyDifferentialPrivacy(
    embedding: Float32Array | number[],
    config?: Partial<DifferentialPrivacyConfig>
  ): DPResult {
    const dpConfig: DifferentialPrivacyConfig = {
      epsilon: config?.epsilon ?? DEFAULT_DP_EPSILON,
      delta: config?.delta ?? DEFAULT_DP_DELTA,
      mechanism: config?.mechanism ?? 'laplace',
      sensitivity: config?.sensitivity ?? 1.0,
      clipNorm: config?.clipNorm ?? 1.0,
    };

    // Convert to Float32Array
    const input = embedding instanceof Float32Array
      ? embedding
      : new Float32Array(embedding);

    // Clip to bounded norm
    const clipped = this.clipToNorm(input, dpConfig.clipNorm);

    // Add noise based on mechanism
    const noised =
      dpConfig.mechanism === 'laplace'
        ? this.addLaplaceNoise(clipped, dpConfig.epsilon, dpConfig.sensitivity)
        : this.addGaussianNoise(clipped, dpConfig.epsilon, dpConfig.delta, dpConfig.sensitivity);

    // Calculate noise magnitude
    const noiseMagnitude = this.calculateNoiseMagnitude(input, noised);

    return {
      data: noised,
      noiseMagnitude,
      budgetConsumed: dpConfig.epsilon,
    };
  }

  /**
   * Clip embedding to bounded L2 norm
   */
  private clipToNorm(embedding: Float32Array, maxNorm: number): Float32Array {
    let norm = 0;
    for (let i = 0; i < embedding.length; i++) {
      norm += embedding[i] * embedding[i];
    }
    norm = Math.sqrt(norm);

    if (norm <= maxNorm) {
      return embedding;
    }

    const scale = maxNorm / norm;
    const result = new Float32Array(embedding.length);
    for (let i = 0; i < embedding.length; i++) {
      result[i] = embedding[i] * scale;
    }
    return result;
  }

  /**
   * Add Laplace noise for differential privacy
   */
  private addLaplaceNoise(
    embedding: Float32Array,
    epsilon: number,
    sensitivity: number
  ): Float32Array {
    const scale = sensitivity / epsilon;
    const result = new Float32Array(embedding.length);

    for (let i = 0; i < embedding.length; i++) {
      result[i] = embedding[i] + this.sampleLaplace(scale);
    }

    return result;
  }

  /**
   * Add Gaussian noise for differential privacy
   */
  private addGaussianNoise(
    embedding: Float32Array,
    epsilon: number,
    delta: number,
    sensitivity: number
  ): Float32Array {
    // Compute sigma for (epsilon, delta)-DP
    const sigma = (sensitivity * Math.sqrt(2 * Math.log(1.25 / delta))) / epsilon;
    const result = new Float32Array(embedding.length);

    for (let i = 0; i < embedding.length; i++) {
      result[i] = embedding[i] + this.sampleGaussian(0, sigma);
    }

    return result;
  }

  /**
   * Sample from Laplace distribution
   */
  private sampleLaplace(scale: number): number {
    const u = Math.random() - 0.5;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  /**
   * Sample from Gaussian distribution (Box-Muller transform)
   */
  private sampleGaussian(mean: number, stddev: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + stddev * z;
  }

  /**
   * Calculate noise magnitude (L2 distance)
   */
  private calculateNoiseMagnitude(original: Float32Array, noised: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < original.length; i++) {
      const diff = original[i] - noised[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Create JSON payload (pattern without embedding)
   */
  private createJsonPayload(pattern: SharedPattern): string {
    const { embedding, ...rest } = pattern;
    return JSON.stringify(rest);
  }

  /**
   * Normalize embedding to Float32Array
   */
  private normalizeEmbedding(embedding: Float32Array | number[]): Float32Array {
    if (embedding instanceof Float32Array) {
      return embedding;
    }
    return new Float32Array(embedding);
  }

  /**
   * Calculate SHA-256 hash
   */
  private async sha256(data: Uint8Array): Promise<ArrayBuffer> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      return crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
    }

    // Fallback for environments without SubtleCrypto
    // Simple hash function (not cryptographically secure, but works for checksums)
    const hash = new Uint8Array(32);
    for (let i = 0; i < data.length; i++) {
      hash[i % 32] ^= data[i];
      hash[(i + 1) % 32] = (hash[(i + 1) % 32] + data[i]) % 256;
    }
    return hash.buffer;
  }

  /**
   * Hash an identifier for anonymization
   */
  private hashIdentifier(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `anon_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Compare two arrays for equality
   */
  private arrayEquals(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Calculate content hash
   */
  async calculateContentHash(content: string): Promise<string> {
    const data = this.textEncoder.encode(content);
    const hash = await this.sha256(data);
    const bytes = new Uint8Array(hash);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Create a pattern from raw components
   */
  createPattern(
    id: string,
    category: PatternCategory,
    type: string,
    domain: string,
    content: string,
    embedding: number[] | Float32Array,
    options?: {
      language?: string;
      framework?: string;
      tags?: string[];
      name?: string;
      description?: string;
    }
  ): SharedPattern {
    const now = new Date().toISOString();
    const contentHash = this.simpleHash(content);

    return {
      id,
      category,
      type,
      domain,
      content: {
        raw: content,
        contentHash,
        language: options?.language || 'typescript',
        framework: options?.framework,
      },
      embedding: Array.from(embedding),
      metadata: {
        name: options?.name,
        description: options?.description,
        tags: options?.tags || [],
      },
      version: {
        semver: '1.0.0',
        vectorClock: { clock: {} },
      },
      quality: {
        level: PatternQuality.UNVERIFIED,
        successRate: 0,
        usageCount: 0,
        uniqueUsers: 0,
        avgConfidence: 0,
        feedbackScore: 0,
      },
      sharing: {
        policy: SharingPolicy.PUBLIC,
        privacyLevel: PrivacyLevel.ANONYMIZED,
        differentialPrivacy: false,
        redistributable: true,
        requireAttribution: false,
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Simple synchronous hash for content
   */
  private simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Validate a pattern structure
   */
  validatePattern(pattern: SharedPattern): boolean {
    if (!pattern.id || typeof pattern.id !== 'string') return false;
    if (!pattern.category || !Object.values(PatternCategory).includes(pattern.category)) return false;
    if (!pattern.type || typeof pattern.type !== 'string') return false;
    if (!pattern.domain || typeof pattern.domain !== 'string') return false;
    if (!pattern.content || typeof pattern.content.raw !== 'string') return false;
    if (!pattern.embedding || (!Array.isArray(pattern.embedding) && !(pattern.embedding instanceof Float32Array))) return false;
    if (!pattern.metadata || !Array.isArray(pattern.metadata.tags)) return false;
    if (!pattern.version || typeof pattern.version.semver !== 'string') return false;
    if (!pattern.quality || typeof pattern.quality.successRate !== 'number') return false;
    if (!pattern.sharing || !Object.values(SharingPolicy).includes(pattern.sharing.policy)) return false;

    return true;
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new pattern serializer
 */
export function createPatternSerializer(
  config?: Partial<AnonymizationConfig>
): PatternSerializer {
  return new PatternSerializer(config);
}

/**
 * Serialize a pattern to bytes
 */
export async function serializePattern(pattern: SharedPattern): Promise<Uint8Array> {
  const serializer = new PatternSerializer();
  return serializer.serialize(pattern);
}

/**
 * Deserialize a pattern from bytes
 */
export async function deserializePattern(data: Uint8Array): Promise<SharedPattern> {
  const serializer = new PatternSerializer();
  return serializer.deserialize(data);
}

/**
 * Anonymize pattern content
 */
export function anonymizePattern(
  pattern: SharedPattern,
  config?: Partial<AnonymizationConfig>
): SharedPattern {
  const serializer = new PatternSerializer(config);
  return serializer.anonymize(pattern);
}
