/**
 * HDC Memory Serializer
 *
 * Handles serialization and deserialization of Hyperdimensional Computing
 * memory state, including codebooks, role vectors, and stored patterns.
 *
 * @module nervous-system/persistence/HdcSerializer
 */

import type { HdcSerializedState } from './INervousSystemStore.js';
import type { Hypervector, HdcMemory } from '../wasm-loader.js';

/**
 * Expected size of a 10,000-bit hypervector in bytes
 * 10,000 bits / 8 bits per byte = 1,250 bytes
 */
const HYPERVECTOR_BYTES = 1250;

/**
 * Current serialization schema version
 */
const SCHEMA_VERSION = 1;

/**
 * Codebook key names for type patterns
 */
const TYPE_KEYS = [
  'edge-case',
  'boundary-condition',
  'null-handling',
  'exception',
  'performance',
  'security',
  'integration',
  'unit',
  'regression',
  'smoke',
] as const;

/**
 * Codebook key names for domain patterns
 */
const DOMAIN_KEYS = [
  'unit-test',
  'integration-test',
  'e2e-test',
  'performance-test',
  'security-test',
] as const;

/**
 * Codebook key names for framework patterns
 */
const FRAMEWORK_KEYS = [
  'jest',
  'mocha',
  'cypress',
  'vitest',
  'jasmine',
  'ava',
] as const;

/**
 * Options for serialization
 */
export interface HdcSerializerOptions {
  /** Include stored patterns in serialization (default: true) */
  includePatterns?: boolean;
  /** Include codebooks in serialization (default: true) */
  includeCodebooks?: boolean;
  /** Maximum patterns to include (0 = all) */
  maxPatterns?: number;
}

/**
 * Serializes a Hypervector to Uint8Array
 * Uses the WASM to_bytes() method if available
 */
export function serializeHypervector(vector: Hypervector): Uint8Array {
  // The Hypervector class has a to_bytes() method that returns Uint8Array
  return vector.to_bytes();
}

/**
 * Deserializes Uint8Array back to Hypervector
 * Uses the WASM from_bytes() static method
 */
export function deserializeHypervector(
  bytes: Uint8Array,
  HypervectorClass: typeof Hypervector
): Hypervector {
  return HypervectorClass.from_bytes(bytes);
}

/**
 * Serializes an HdcMemoryAdapter to a storable format
 *
 * @param adapter - The HDC memory adapter to serialize
 * @param options - Serialization options
 * @returns Serialized state ready for storage
 */
export function serializeHdcMemory(
  adapter: {
    getCodebooks: () => {
      type: Map<string, Hypervector>;
      domain: Map<string, Hypervector>;
      framework: Map<string, Hypervector>;
    };
    getRoleVectors: () => {
      type: Hypervector;
      domain: Hypervector;
      content: Hypervector;
      framework: Hypervector;
    };
    getStoredPatterns: () => Map<string, { vector: Hypervector; metadata?: Record<string, unknown> }>;
    getDimension: () => number;
  },
  options: HdcSerializerOptions = {}
): HdcSerializedState {
  const {
    includePatterns = true,
    includeCodebooks = true,
    maxPatterns = 0,
  } = options;

  const dimension = adapter.getDimension();

  // Serialize codebooks
  const codebooks: HdcSerializedState['codebooks'] = {
    type: [],
    domain: [],
    framework: [],
  };

  if (includeCodebooks) {
    const cb = adapter.getCodebooks();

    for (const [key, vector] of cb.type) {
      codebooks.type.push([key, serializeHypervector(vector)]);
    }

    for (const [key, vector] of cb.domain) {
      codebooks.domain.push([key, serializeHypervector(vector)]);
    }

    for (const [key, vector] of cb.framework) {
      codebooks.framework.push([key, serializeHypervector(vector)]);
    }
  }

  // Serialize role vectors
  const rv = adapter.getRoleVectors();
  const roleVectors: HdcSerializedState['roleVectors'] = {
    type: serializeHypervector(rv.type),
    domain: serializeHypervector(rv.domain),
    content: serializeHypervector(rv.content),
    framework: serializeHypervector(rv.framework),
  };

  // Serialize stored patterns
  const patterns: HdcSerializedState['patterns'] = [];

  if (includePatterns) {
    const storedPatterns = adapter.getStoredPatterns();
    let count = 0;

    for (const [key, { vector, metadata }] of storedPatterns) {
      if (maxPatterns > 0 && count >= maxPatterns) break;

      patterns.push({
        key,
        vector: serializeHypervector(vector),
        metadata,
      });
      count++;
    }
  }

  return {
    version: SCHEMA_VERSION,
    dimension,
    codebooks,
    roleVectors,
    patterns,
    serializedAt: Date.now(),
  };
}

/**
 * Deserializes stored state back into an HdcMemoryAdapter
 *
 * @param state - Serialized state from storage
 * @param adapter - The adapter to restore state into
 * @param HypervectorClass - The Hypervector class for deserialization
 */
export function deserializeHdcMemory(
  state: HdcSerializedState,
  adapter: {
    restoreCodebooks: (codebooks: {
      type: Map<string, Hypervector>;
      domain: Map<string, Hypervector>;
      framework: Map<string, Hypervector>;
    }) => void;
    restoreRoleVectors: (roleVectors: {
      type: Hypervector;
      domain: Hypervector;
      content: Hypervector;
      framework: Hypervector;
    }) => void;
    restorePatterns: (patterns: Map<string, { vector: Hypervector; metadata?: Record<string, unknown> }>) => void;
  },
  HypervectorClass: typeof Hypervector
): void {
  // Handle version migration if needed
  if (state.version !== SCHEMA_VERSION) {
    migrateState(state);
  }

  // Restore codebooks
  const codebooks = {
    type: new Map<string, Hypervector>(),
    domain: new Map<string, Hypervector>(),
    framework: new Map<string, Hypervector>(),
  };

  for (const [key, bytes] of state.codebooks.type) {
    codebooks.type.set(key, deserializeHypervector(bytes, HypervectorClass));
  }

  for (const [key, bytes] of state.codebooks.domain) {
    codebooks.domain.set(key, deserializeHypervector(bytes, HypervectorClass));
  }

  for (const [key, bytes] of state.codebooks.framework) {
    codebooks.framework.set(key, deserializeHypervector(bytes, HypervectorClass));
  }

  adapter.restoreCodebooks(codebooks);

  // Restore role vectors
  const roleVectors = {
    type: deserializeHypervector(state.roleVectors.type, HypervectorClass),
    domain: deserializeHypervector(state.roleVectors.domain, HypervectorClass),
    content: deserializeHypervector(state.roleVectors.content, HypervectorClass),
    framework: deserializeHypervector(state.roleVectors.framework, HypervectorClass),
  };

  adapter.restoreRoleVectors(roleVectors);

  // Restore patterns
  const patterns = new Map<string, { vector: Hypervector; metadata?: Record<string, unknown> }>();

  for (const { key, vector, metadata } of state.patterns) {
    patterns.set(key, {
      vector: deserializeHypervector(vector, HypervectorClass),
      metadata,
    });
  }

  adapter.restorePatterns(patterns);
}

/**
 * Migrate state from older schema versions
 */
function migrateState(state: HdcSerializedState): void {
  // Future: Add migration logic as schema evolves
  // For now, just update version
  state.version = SCHEMA_VERSION;
}

/**
 * Calculate approximate size of serialized state in bytes
 */
export function calculateStateSize(state: HdcSerializedState): number {
  let size = 0;

  // Codebooks
  size += state.codebooks.type.length * HYPERVECTOR_BYTES;
  size += state.codebooks.domain.length * HYPERVECTOR_BYTES;
  size += state.codebooks.framework.length * HYPERVECTOR_BYTES;

  // Role vectors (4 vectors)
  size += 4 * HYPERVECTOR_BYTES;

  // Patterns
  size += state.patterns.length * HYPERVECTOR_BYTES;

  // Metadata overhead (rough estimate)
  size += state.patterns.reduce((acc, p) => {
    return acc + p.key.length + (p.metadata ? JSON.stringify(p.metadata).length : 0);
  }, 0);

  return size;
}

/**
 * Validate serialized state integrity
 */
export function validateHdcState(state: HdcSerializedState): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check version
  if (typeof state.version !== 'number' || state.version < 1) {
    errors.push('Invalid schema version');
  }

  // Check dimension
  if (typeof state.dimension !== 'number' || state.dimension < 1) {
    errors.push('Invalid dimension');
  }

  // Check role vectors
  const expectedBytes = state.dimension / 8;
  const roleVectorNames = ['type', 'domain', 'content', 'framework'] as const;

  for (const name of roleVectorNames) {
    const rv = state.roleVectors[name];
    if (!(rv instanceof Uint8Array)) {
      errors.push(`Role vector ${name} is not Uint8Array`);
    } else if (rv.length !== expectedBytes) {
      errors.push(`Role vector ${name} has wrong size: ${rv.length} vs expected ${expectedBytes}`);
    }
  }

  // Check patterns
  for (let i = 0; i < state.patterns.length; i++) {
    const pattern = state.patterns[i];
    if (!pattern.key || typeof pattern.key !== 'string') {
      errors.push(`Pattern ${i} has invalid key`);
    }
    if (!(pattern.vector instanceof Uint8Array)) {
      errors.push(`Pattern ${i} vector is not Uint8Array`);
    } else if (pattern.vector.length !== expectedBytes) {
      errors.push(`Pattern ${i} vector has wrong size`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Alias for calculateStateSize (for naming consistency)
 */
export const calculateHdcStateSize = calculateStateSize;

/**
 * Export types
 */
export type { HdcSerializedState };
