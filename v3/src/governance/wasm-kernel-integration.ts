/**
 * WASM Kernel Integration for Agentic QE Fleet
 *
 * Provides a unified API for cryptographic operations that automatically
 * uses the WASM kernel when available and falls back to JavaScript
 * implementations when necessary.
 *
 * Key features:
 * - Auto-detection of WASM support
 * - Transparent JS fallback for all operations
 * - Performance metrics collection
 * - Hash chaining for audit trails
 *
 * @module governance/wasm-kernel-integration
 * @see ADR-058-guidance-governance-integration.md
 */

import { createHash, createHmac } from 'node:crypto';
import { toError } from '../shared/error-utils.js';
import { safeJsonParse } from '../shared/safe-json.js';

/**
 * Performance metrics for WASM kernel operations
 */
export interface WasmKernelMetrics {
  backend: 'wasm' | 'js';
  avgHashTimeMs: number;
  totalOperations: number;
  totalTimeMs: number;
  operationCounts: {
    hash: number;
    hashChain: number;
    verify: number;
    hmac: number;
  };
}

/**
 * WASM Kernel Interface from @claude-flow/guidance
 */
interface GuidanceWasmKernel {
  readonly available: boolean;
  readonly version: string;
  sha256(input: string): string;
  hmacSha256(key: string, input: string): string;
  contentHash(jsonInput: string): string;
  signEnvelope(key: string, envelopeJson: string): string;
  verifyChain(chainJson: string, key: string): boolean;
  scanSecrets(content: string): string[];
  detectDestructive(command: string): string | null;
  batchProcess(ops: BatchOp[]): BatchResult[];
}

interface BatchOp {
  op: string;
  payload: string;
  key?: string;
}

interface BatchResult {
  [key: string]: unknown;
}

/**
 * WASM Kernel Integration class
 *
 * Provides a unified API for cryptographic operations with automatic
 * WASM/JS fallback and performance metrics collection.
 */
export class WasmKernelIntegration {
  private kernel: GuidanceWasmKernel | null = null;
  private initialized = false;
  private initError: Error | null = null;
  private metrics: WasmKernelMetrics = {
    backend: 'js',
    avgHashTimeMs: 0,
    totalOperations: 0,
    totalTimeMs: 0,
    operationCounts: {
      hash: 0,
      hashChain: 0,
      verify: 0,
      hmac: 0,
    },
  };

  /**
   * Initialize the WASM kernel integration
   *
   * Attempts to load the WASM kernel from @claude-flow/guidance.
   * Falls back to JS implementation if WASM is unavailable.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamically import the wasm-kernel module
      // Use string literal to avoid TypeScript moduleResolution issues with subpath exports
      const modulePath = '@claude-flow/guidance/wasm-kernel';
      const wasmKernelModule = await import(/* @vite-ignore */ modulePath) as {
        getKernel?: () => GuidanceWasmKernel;
        isWasmAvailable?: () => boolean;
        resetKernel?: () => void;
      };

      if (wasmKernelModule && typeof wasmKernelModule.getKernel === 'function') {
        this.kernel = wasmKernelModule.getKernel();
        this.metrics.backend = this.kernel?.available ? 'wasm' : 'js';
      }
    } catch (error) {
      // WASM kernel module not available - use JS fallback
      this.initError = toError(error);
      this.kernel = null;
      this.metrics.backend = 'js';
    }

    this.initialized = true;
  }

  /**
   * Check if WASM kernel is available
   */
  isWasmAvailable(): boolean {
    return this.kernel?.available ?? false;
  }

  /**
   * Get the kernel version string
   */
  getVersion(): string {
    return this.kernel?.version ?? 'js-fallback';
  }

  /**
   * Get initialization error if any
   */
  getInitError(): Error | null {
    return this.initError;
  }

  /**
   * Hash data using SHA-256
   *
   * @param data - String or Uint8Array to hash
   * @returns Hex-encoded hash string
   */
  hash(data: string | Uint8Array): string {
    const startTime = performance.now();

    let result: string;

    if (this.kernel?.available) {
      // Convert Uint8Array to string if needed
      const input = typeof data === 'string' ? data : Buffer.from(data).toString('utf-8');
      result = this.kernel.sha256(input);
    } else {
      // JS fallback
      result = this.jsHash(data);
    }

    this.recordOperation('hash', performance.now() - startTime);
    return result;
  }

  /**
   * Create HMAC-SHA256 signature
   *
   * @param key - Secret key
   * @param data - Data to sign
   * @returns Hex-encoded HMAC
   */
  hmac(key: string, data: string): string {
    const startTime = performance.now();

    let result: string;

    if (this.kernel?.available) {
      result = this.kernel.hmacSha256(key, data);
    } else {
      // JS fallback
      result = createHmac('sha256', key).update(data).digest('hex');
    }

    this.recordOperation('hmac', performance.now() - startTime);
    return result;
  }

  /**
   * Create a hash chain from multiple hashes
   *
   * Combines hashes in order to create a single chained hash.
   * This is useful for creating tamper-evident audit trails.
   *
   * @param hashes - Array of hash strings to chain
   * @returns Single hash representing the chain
   */
  hashChain(hashes: string[]): string {
    const startTime = performance.now();

    if (hashes.length === 0) {
      this.recordOperation('hashChain', performance.now() - startTime);
      return this.hash('');
    }

    if (hashes.length === 1) {
      this.recordOperation('hashChain', performance.now() - startTime);
      return hashes[0];
    }

    // Chain hashes by concatenating and re-hashing
    let chainedHash = hashes[0];
    for (let i = 1; i < hashes.length; i++) {
      chainedHash = this.hash(chainedHash + hashes[i]);
    }

    this.recordOperation('hashChain', performance.now() - startTime);
    return chainedHash;
  }

  /**
   * Verify that data matches a given hash
   *
   * @param data - Data to verify
   * @param expectedHash - Expected hash value
   * @returns True if hashes match
   */
  verify(data: string, expectedHash: string): boolean {
    const startTime = performance.now();

    const actualHash = this.hash(data);
    const result = actualHash === expectedHash;

    this.recordOperation('verify', performance.now() - startTime);
    return result;
  }

  /**
   * Create a content hash for JSON data
   *
   * Normalizes JSON keys before hashing for consistent results
   * regardless of key ordering.
   *
   * @param jsonData - JSON object or string to hash
   * @returns Hex-encoded content hash
   */
  contentHash(jsonData: string | object): string {
    const startTime = performance.now();

    let result: string;
    const jsonString = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData);

    if (this.kernel?.available) {
      result = this.kernel.contentHash(jsonString);
    } else {
      // JS fallback with key sorting
      result = this.jsContentHash(jsonString);
    }

    this.recordOperation('hash', performance.now() - startTime);
    return result;
  }

  /**
   * Sign an envelope using HMAC
   *
   * @param key - Secret key
   * @param envelope - Envelope data to sign
   * @returns Signature string
   */
  signEnvelope(key: string, envelope: object): string {
    const envelopeJson = JSON.stringify(envelope);

    if (this.kernel?.available) {
      return this.kernel.signEnvelope(key, envelopeJson);
    }

    // JS fallback
    return this.hmac(key, envelopeJson);
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): WasmKernelMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.metrics = {
      backend: this.kernel?.available ? 'wasm' : 'js',
      avgHashTimeMs: 0,
      totalOperations: 0,
      totalTimeMs: 0,
      operationCounts: {
        hash: 0,
        hashChain: 0,
        verify: 0,
        hmac: 0,
      },
    };
  }

  /**
   * Reset the integration (for testing)
   */
  reset(): void {
    this.kernel = null;
    this.initialized = false;
    this.initError = null;
    this.resetMetrics();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * JS fallback for SHA-256 hash
   */
  private jsHash(data: string | Uint8Array): string {
    const hash = createHash('sha256');
    if (typeof data === 'string') {
      hash.update(data);
    } else {
      hash.update(Buffer.from(data));
    }
    return hash.digest('hex');
  }

  /**
   * JS fallback for content hash with key sorting
   */
  private jsContentHash(jsonInput: string): string {
    try {
      const parsed = safeJsonParse<unknown>(jsonInput);
      const sorted = this.sortKeys(parsed);
      return this.jsHash(JSON.stringify(sorted));
    } catch {
      return this.jsHash(jsonInput);
    }
  }

  /**
   * Recursively sort object keys for deterministic hashing
   */
  private sortKeys(value: unknown): unknown {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => this.sortKeys(v));

    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = this.sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  /**
   * Record an operation for metrics
   */
  private recordOperation(
    type: 'hash' | 'hashChain' | 'verify' | 'hmac',
    timeMs: number
  ): void {
    this.metrics.totalOperations++;
    this.metrics.totalTimeMs += timeMs;
    this.metrics.operationCounts[type]++;
    this.metrics.avgHashTimeMs =
      this.metrics.totalTimeMs / this.metrics.totalOperations;
  }
}

/**
 * Singleton instance
 */
export const wasmKernelIntegration = new WasmKernelIntegration();

/**
 * Factory function for creating new instances
 */
export function createWasmKernelIntegration(): WasmKernelIntegration {
  return new WasmKernelIntegration();
}
