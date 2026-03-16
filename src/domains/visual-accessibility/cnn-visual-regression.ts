/**
 * Agentic QE v3 - CNN Visual Regression Testing
 *
 * TypeScript spatial pooling visual regression with optional Sobel edge detection.
 * No native CNN package exists — the spatial pooling implementation IS the
 * production implementation.
 *
 * - TypeScript spatial-pooling (8x8 grid, RGB channels)
 * - Optional Sobel edge detection for gradient/structural change sensitivity
 * - Supports regions of interest masking to ignore dynamic areas
 * - Contrastive threshold learning from labeled positive/negative pairs
 *
 * @module domains/visual-accessibility/cnn-visual-regression
 */

/** Result of comparing two image embeddings */
export interface ComparisonResult {
  readonly similarity: number;
  readonly isMatch: boolean;
  readonly threshold: number;
  readonly regionSimilarities?: ReadonlyArray<{
    readonly regionIndex: number;
    readonly similarity: number;
  }>;
}

/** A labeled pair of images for contrastive threshold learning */
export interface LabeledPair {
  readonly embedA: Float32Array;
  readonly embedB: Float32Array;
  readonly isMatch: boolean;
}

/** Region of interest definition for selective comparison */
export interface RegionOfInterest {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Options for embedding computation */
export interface EmbeddingOptions {
  readonly gridSize?: number;
  readonly channels?: number;
  readonly maskRegions?: ReadonlyArray<RegionOfInterest>;
  readonly useEdgeDetection?: boolean;
}

/** Configuration for the CNN visual regression engine */
export interface CNNVisualRegressionConfig {
  readonly defaultThreshold?: number;
  readonly defaultGridSize?: number;
  readonly tryNativeBackend?: boolean;
  readonly useEdgeDetection?: boolean;
}

interface NativeCNNBackend {
  computeEmbedding(pixels: Uint8Array, width: number, height: number): Float32Array;
}

/**
 * Compute cosine similarity between two vectors of equal length.
 * Returns 0 if either vector has zero norm.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** L2-normalize a vector in place and return it. */
function l2Normalize(vec: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  }
  return vec;
}

/**
 * CNN-based visual regression testing using embedding comparison.
 *
 * Images are projected into a compact embedding space via spatial average
 * pooling. Cosine similarity determines whether two images represent the
 * same visual state.
 *
 * @example
 * ```typescript
 * const cnn = new CNNVisualRegression();
 * const baseline = cnn.computeEmbedding(baselinePixels, 1024, 768);
 * const current = cnn.computeEmbedding(currentPixels, 1024, 768);
 * if (cnn.isRegression(baseline, current)) {
 *   console.log('Visual regression detected!');
 * }
 * ```
 */
export class CNNVisualRegression {
  private readonly defaultThreshold: number;
  private readonly defaultGridSize: number;
  private readonly tryNative: boolean;
  private readonly useEdgeDetection: boolean;
  private nativeBackend: NativeCNNBackend | null = null;
  private nativeLoadAttempted = false;

  constructor(config?: CNNVisualRegressionConfig) {
    this.defaultThreshold = config?.defaultThreshold ?? 0.95;
    this.defaultGridSize = config?.defaultGridSize ?? 8;
    this.tryNative = config?.tryNativeBackend ?? true;
    this.useEdgeDetection = config?.useEdgeDetection ?? false;
  }

  /**
   * Check for native CNN backend.
   * No native package exists — always returns false.
   * The TypeScript spatial pooling implementation is used.
   */
  private async tryLoadNativeBackend(): Promise<boolean> {
    if (this.nativeLoadAttempted) return this.nativeBackend !== null;
    this.nativeLoadAttempted = true;
    return false;
  }

  /**
   * Compute a feature embedding for an image using spatial average pooling.
   * When edge detection is enabled (via config or options), the embedding
   * concatenates spatial pooling of the original pixels with spatial pooling
   * of the Sobel edge map, then L2-normalizes the result.
   *
   * @param imageData Raw pixel data in RGBA format (4 bytes per pixel)
   * @param width Image width in pixels
   * @param height Image height in pixels
   * @param options Configuration for grid size, masking, and edge detection
   * @returns L2-normalized embedding vector
   */
  computeEmbedding(
    imageData: Uint8Array, width: number, height: number, options?: EmbeddingOptions,
  ): Float32Array {
    this.validateImageInput(imageData, width, height);
    const gridSize = options?.gridSize ?? this.defaultGridSize;
    const channels = options?.channels ?? 3;
    let pixels = imageData;
    if (options?.maskRegions && options.maskRegions.length > 0) {
      pixels = this.applyMask(imageData, width, height, options.maskRegions);
    }

    const edgeEnabled = this.useEdgeDetection || (options?.useEdgeDetection === true);
    if (edgeEnabled) {
      const spatialEmbed = this.computeSpatialPoolingEmbedding(pixels, width, height, gridSize, channels);
      const edgeMap = this.applySobelEdgeDetection(pixels, width, height);
      const edgeEmbed = this.computeSpatialPoolingEmbedding(edgeMap, width, height, gridSize, channels);
      const combined = new Float32Array(spatialEmbed.length + edgeEmbed.length);
      combined.set(spatialEmbed, 0);
      combined.set(edgeEmbed, spatialEmbed.length);
      return l2Normalize(combined);
    }

    return this.computeSpatialPoolingEmbedding(pixels, width, height, gridSize, channels);
  }

  /** Compute embedding asynchronously, attempting native backend first. */
  async computeEmbeddingAsync(
    imageData: Uint8Array, width: number, height: number, options?: EmbeddingOptions,
  ): Promise<Float32Array> {
    this.validateImageInput(imageData, width, height);
    const hasNative = await this.tryLoadNativeBackend();
    if (hasNative && this.nativeBackend) {
      let pixels = imageData;
      if (options?.maskRegions && options.maskRegions.length > 0) {
        pixels = this.applyMask(imageData, width, height, options.maskRegions);
      }
      return this.nativeBackend.computeEmbedding(pixels, width, height);
    }
    return this.computeEmbedding(imageData, width, height, options);
  }

  /** Compare two embeddings and produce a detailed comparison result. */
  compare(baseline: Float32Array, current: Float32Array, threshold?: number): ComparisonResult {
    const t = threshold ?? this.defaultThreshold;
    const similarity = cosineSimilarity(baseline, current);
    return { similarity, isMatch: similarity >= t, threshold: t };
  }

  /**
   * Compare embeddings with per-region analysis. Computes per-region
   * similarity alongside the global similarity.
   */
  compareWithRegions(
    baseline: Float32Array, current: Float32Array,
    regions: ReadonlyArray<RegionOfInterest>,
    imageWidth: number, imageHeight: number,
    threshold?: number,
  ): ComparisonResult {
    const t = threshold ?? this.defaultThreshold;
    const globalSimilarity = cosineSimilarity(baseline, current);
    const gridSize = this.defaultGridSize;
    const channels = 3;

    const regionSimilarities = regions.map((region, regionIndex) => ({
      regionIndex,
      similarity: this.computeRegionSimilarity(
        baseline, current, region, imageWidth, imageHeight, gridSize, channels,
      ),
    }));

    return { similarity: globalSimilarity, isMatch: globalSimilarity >= t, threshold: t, regionSimilarities };
  }

  /** Check if a visual regression has occurred (similarity below threshold). */
  isRegression(baseline: Float32Array, current: Float32Array, threshold?: number): boolean {
    return cosineSimilarity(baseline, current) < (threshold ?? this.defaultThreshold);
  }

  /**
   * Learn an optimal threshold from labeled positive/negative pairs.
   * Sweeps candidate thresholds and picks the one maximizing accuracy.
   * @throws Error if no examples or all examples share the same label
   */
  learnThreshold(examples: LabeledPair[]): number {
    if (examples.length === 0) {
      throw new Error('At least one labeled pair is required');
    }
    if (!examples.some((e) => e.isMatch) || !examples.some((e) => !e.isMatch)) {
      throw new Error('Examples must contain both matching and non-matching pairs');
    }

    const scored = examples
      .map((ex) => ({ similarity: cosineSimilarity(ex.embedA, ex.embedB), isMatch: ex.isMatch }))
      .sort((a, b) => a.similarity - b.similarity);

    let bestThreshold = 0;
    let bestAccuracy = 0;
    for (const { similarity: candidate } of scored) {
      let correct = 0;
      for (const item of scored) {
        if ((item.similarity >= candidate) === item.isMatch) correct++;
      }
      const accuracy = correct / scored.length;
      if (accuracy > bestAccuracy) {
        bestAccuracy = accuracy;
        bestThreshold = candidate;
      }
    }
    return bestThreshold;
  }

  private computeRegionSimilarity(
    baseline: Float32Array, current: Float32Array,
    region: RegionOfInterest, imageWidth: number, imageHeight: number,
    gridSize: number, channels: number,
  ): number {
    const cellW = imageWidth / gridSize;
    const cellH = imageHeight / gridSize;
    const gxStart = Math.max(0, Math.floor(region.x / cellW));
    const gxEnd = Math.min(gridSize, Math.ceil((region.x + region.width) / cellW));
    const gyStart = Math.max(0, Math.floor(region.y / cellH));
    const gyEnd = Math.min(gridSize, Math.ceil((region.y + region.height) / cellH));

    const regionBaseline: number[] = [];
    const regionCurrent: number[] = [];
    for (let gy = gyStart; gy < gyEnd; gy++) {
      for (let gx = gxStart; gx < gxEnd; gx++) {
        const base = (gy * gridSize + gx) * channels;
        for (let c = 0; c < channels; c++) {
          regionBaseline.push(baseline[base + c]);
          regionCurrent.push(current[base + c]);
        }
      }
    }
    if (regionBaseline.length === 0) return 1.0;
    return cosineSimilarity(new Float32Array(regionBaseline), new Float32Array(regionCurrent));
  }

  /** Spatial average pooling: divides image into grid, averages RGB per cell, L2-normalizes. */
  private computeSpatialPoolingEmbedding(
    pixels: Uint8Array, width: number, height: number, gridSize: number, channels: number,
  ): Float32Array {
    const embedding = new Float32Array(gridSize * gridSize * channels);
    const cellW = width / gridSize;
    const cellH = height / gridSize;

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        const sums = new Float64Array(channels);
        let count = 0;
        const yStart = Math.floor(gy * cellH);
        const yEnd = Math.floor((gy + 1) * cellH);
        const xStart = Math.floor(gx * cellW);
        const xEnd = Math.floor((gx + 1) * cellW);

        for (let y = yStart; y < yEnd; y++) {
          for (let x = xStart; x < xEnd; x++) {
            const idx = (y * width + x) * 4;
            for (let c = 0; c < channels; c++) sums[c] += pixels[idx + c];
            count++;
          }
        }
        const base = (gy * gridSize + gx) * channels;
        for (let c = 0; c < channels; c++) {
          embedding[base + c] = count > 0 ? sums[c] / count / 255 : 0;
        }
      }
    }
    return l2Normalize(embedding);
  }

  /** Zero out pixel data in masked regions. Returns a copy. */
  private applyMask(
    pixels: Uint8Array, width: number, height: number,
    regions: ReadonlyArray<RegionOfInterest>,
  ): Uint8Array {
    const masked = new Uint8Array(pixels);
    for (const region of regions) {
      const xStart = Math.max(0, Math.min(region.x, width));
      const xEnd = Math.max(0, Math.min(region.x + region.width, width));
      const yStart = Math.max(0, Math.min(region.y, height));
      const yEnd = Math.max(0, Math.min(region.y + region.height, height));
      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const idx = (y * width + x) * 4;
          masked[idx] = 0; masked[idx + 1] = 0; masked[idx + 2] = 0; masked[idx + 3] = 0;
        }
      }
    }
    return masked;
  }

  /**
   * Apply Sobel edge detection to an RGBA image.
   * Converts to grayscale, applies 3x3 Sobel kernels for horizontal and
   * vertical gradients, computes the magnitude, and returns the result
   * as RGBA (edge magnitude in R,G,B channels, alpha=255).
   */
  applySobelEdgeDetection(pixels: Uint8Array, width: number, height: number): Uint8Array {
    // Convert RGBA to grayscale
    const gray = new Float64Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      gray[i] = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
    }

    const output = new Uint8Array(width * height * 4);

    // Sobel kernels
    // Gx = [[-1,0,1],[-2,0,2],[-1,0,1]]
    // Gy = [[-1,-2,-1],[0,0,0],[1,2,1]]
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let gx = 0;
        let gy = 0;

        // Apply 3x3 kernel centered at (x, y)
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const sy = Math.min(Math.max(y + ky, 0), height - 1);
            const sx = Math.min(Math.max(x + kx, 0), width - 1);
            const val = gray[sy * width + sx];

            // Gx kernel
            if (kx === -1) {
              gx -= val * (ky === 0 ? 2 : 1);
            } else if (kx === 1) {
              gx += val * (ky === 0 ? 2 : 1);
            }

            // Gy kernel
            if (ky === -1) {
              gy -= val * (kx === 0 ? 2 : 1);
            } else if (ky === 1) {
              gy += val * (kx === 0 ? 2 : 1);
            }
          }
        }

        const magnitude = Math.min(Math.sqrt(gx * gx + gy * gy), 255);
        const outIdx = (y * width + x) * 4;
        const mag = Math.round(magnitude);
        output[outIdx] = mag;
        output[outIdx + 1] = mag;
        output[outIdx + 2] = mag;
        output[outIdx + 3] = 255;
      }
    }

    return output;
  }

  private validateImageInput(imageData: Uint8Array, width: number, height: number): void {
    if (width <= 0 || height <= 0) {
      throw new Error(`Invalid image dimensions: ${width}x${height}`);
    }
    const expectedLength = width * height * 4;
    if (imageData.length < expectedLength) {
      throw new Error(
        `Image data too small: expected at least ${expectedLength} bytes for ${width}x${height} RGBA, got ${imageData.length}`,
      );
    }
  }

  getDefaultThreshold(): number { return this.defaultThreshold; }

  getEmbeddingDimension(gridSize?: number): number {
    const base = (gridSize ?? this.defaultGridSize) ** 2 * 3;
    return this.useEdgeDetection ? base * 2 : base;
  }

  isNativeBackendLoaded(): boolean { return this.nativeBackend !== null; }
}
