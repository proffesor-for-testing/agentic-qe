/**
 * BTSP Adapter Serializer
 *
 * Handles serialization and deserialization of Behavioral Timescale
 * Synaptic Plasticity (BTSP) adapter state, including weights,
 * Fisher diagonal for EWC, and learned associations.
 *
 * @module nervous-system/persistence/BTSPSerializer
 */

import type { BTSPSerializedState } from './INervousSystemStore.js';
import type { BTSPAdapterConfig } from '../adapters/BTSPAdapter.js';

/**
 * Current serialization schema version
 */
const SCHEMA_VERSION = 1;

/**
 * Options for BTSP serialization
 */
export interface BTSPSerializerOptions {
  /** Include associations in serialization (default: true) */
  includeAssociations?: boolean;
  /** Maximum associations to include (0 = all) */
  maxAssociations?: number;
  /** Include EWC Fisher diagonal (default: true) */
  includeEwc?: boolean;
}

/**
 * Interface for a serializable BTSP adapter
 * Defines what the adapter must expose for serialization
 */
export interface SerializableBTSPAdapter {
  /** Get the configuration */
  getConfig(): BTSPAdapterConfig;
  /** Get BTSP layer weights */
  getWeights(): Float32Array;
  /** Get Fisher diagonal for EWC */
  getFisherDiagonal(): Float32Array;
  /** Get consolidated weights reference */
  getConsolidatedWeights(): Float32Array;
  /** Get association count */
  getAssociationCount(): number;
  /** Get all associations */
  getAssociations(): Array<{ pattern: Float32Array; target: Float32Array }>;
}

/**
 * Interface for a restorable BTSP adapter
 */
export interface RestorableBTSPAdapter {
  /** Restore weights from array */
  restoreWeights(weights: Float32Array): void;
  /** Restore Fisher diagonal */
  restoreFisherDiagonal(fisher: Float32Array): void;
  /** Restore consolidated weights */
  restoreConsolidatedWeights(weights: Float32Array): void;
  /** Restore associations */
  restoreAssociations(associations: Array<{ pattern: Float32Array; target: Float32Array }>): void;
  /** Restore association count */
  restoreAssociationCount(count: number): void;
}

/**
 * Convert Float32Array to regular number array for JSON serialization
 */
function float32ToArray(arr: Float32Array): number[] {
  return Array.from(arr);
}

/**
 * Convert regular number array back to Float32Array
 */
function arrayToFloat32(arr: number[]): Float32Array {
  return new Float32Array(arr);
}

/**
 * Serialize a BTSP adapter to storable format
 *
 * @param adapter - The BTSP adapter to serialize
 * @param options - Serialization options
 * @returns Serialized state ready for storage
 */
export function serializeBTSP(
  adapter: SerializableBTSPAdapter,
  options: BTSPSerializerOptions = {}
): BTSPSerializedState {
  const {
    includeAssociations = true,
    maxAssociations = 0,
    includeEwc = true,
  } = options;

  const config = adapter.getConfig();
  const weights = adapter.getWeights();
  const associationCount = adapter.getAssociationCount();

  // Build serialized state
  const state: BTSPSerializedState = {
    version: SCHEMA_VERSION,
    config: {
      inputSize: config.inputSize,
      outputSize: config.outputSize,
      tau: config.tau,
      plateauThreshold: config.plateauThreshold,
      ewcLambda: config.ewcLambda,
      maxCapacity: config.maxCapacity,
    },
    weights: float32ToArray(weights),
    fisherDiagonal: [],
    consolidatedWeights: [],
    associationCount,
    associations: [],
    serializedAt: Date.now(),
  };

  // Include EWC state if requested
  if (includeEwc) {
    state.fisherDiagonal = float32ToArray(adapter.getFisherDiagonal());
    state.consolidatedWeights = float32ToArray(adapter.getConsolidatedWeights());
  }

  // Include associations if requested
  if (includeAssociations) {
    const associations = adapter.getAssociations();
    const limit = maxAssociations > 0 ? Math.min(maxAssociations, associations.length) : associations.length;

    for (let i = 0; i < limit; i++) {
      const { pattern, target } = associations[i];
      state.associations.push({
        pattern: float32ToArray(pattern),
        target: float32ToArray(target),
      });
    }
  }

  return state;
}

/**
 * Deserialize stored state back into a BTSP adapter
 *
 * @param state - Serialized state from storage
 * @param adapter - The adapter to restore state into
 */
export function deserializeBTSP(
  state: BTSPSerializedState,
  adapter: RestorableBTSPAdapter
): void {
  // Handle version migration if needed
  if (state.version !== SCHEMA_VERSION) {
    migrateState(state);
  }

  // Restore weights
  const weights = arrayToFloat32(state.weights);
  adapter.restoreWeights(weights);

  // Restore EWC state if present
  if (state.fisherDiagonal.length > 0) {
    adapter.restoreFisherDiagonal(arrayToFloat32(state.fisherDiagonal));
  }

  if (state.consolidatedWeights.length > 0) {
    adapter.restoreConsolidatedWeights(arrayToFloat32(state.consolidatedWeights));
  }

  // Restore association count
  adapter.restoreAssociationCount(state.associationCount);

  // Restore associations
  if (state.associations.length > 0) {
    const associations = state.associations.map(({ pattern, target }) => ({
      pattern: arrayToFloat32(pattern),
      target: arrayToFloat32(target),
    }));
    adapter.restoreAssociations(associations);
  }
}

/**
 * Migrate state from older schema versions
 */
function migrateState(state: BTSPSerializedState): void {
  // Future: Add migration logic as schema evolves
  // For now, just update version
  state.version = SCHEMA_VERSION;
}

/**
 * Calculate approximate size of serialized state in bytes
 */
export function calculateStateSize(state: BTSPSerializedState): number {
  let size = 0;

  // Weights (4 bytes per float32)
  size += state.weights.length * 4;
  size += state.fisherDiagonal.length * 4;
  size += state.consolidatedWeights.length * 4;

  // Associations
  for (const assoc of state.associations) {
    size += assoc.pattern.length * 4;
    size += assoc.target.length * 4;
  }

  // Config and metadata overhead (rough estimate)
  size += 200;

  return size;
}

/**
 * Validate serialized state integrity
 */
export function validateBTSPState(state: BTSPSerializedState): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check version
  if (typeof state.version !== 'number' || state.version < 1) {
    errors.push('Invalid schema version');
  }

  // Check config
  if (!state.config) {
    errors.push('Missing config');
  } else {
    if (typeof state.config.inputSize !== 'number' || state.config.inputSize < 1) {
      errors.push('Invalid inputSize in config');
    }
    if (typeof state.config.outputSize !== 'number' || state.config.outputSize < 1) {
      errors.push('Invalid outputSize in config');
    }
  }

  // Check weights
  if (!Array.isArray(state.weights)) {
    errors.push('Weights is not an array');
  } else if (state.weights.length !== state.config.inputSize) {
    errors.push(`Weights size mismatch: ${state.weights.length} vs config.inputSize ${state.config.inputSize}`);
  }

  // Check Fisher diagonal if present
  if (state.fisherDiagonal.length > 0) {
    if (state.fisherDiagonal.length !== state.config.inputSize) {
      errors.push(`Fisher diagonal size mismatch: ${state.fisherDiagonal.length}`);
    }
  }

  // Check consolidated weights if present
  if (state.consolidatedWeights.length > 0) {
    if (state.consolidatedWeights.length !== state.config.inputSize) {
      errors.push(`Consolidated weights size mismatch: ${state.consolidatedWeights.length}`);
    }
  }

  // Check associations
  if (!Array.isArray(state.associations)) {
    errors.push('Associations is not an array');
  } else {
    for (let i = 0; i < state.associations.length; i++) {
      const assoc = state.associations[i];
      if (!Array.isArray(assoc.pattern) || !Array.isArray(assoc.target)) {
        errors.push(`Association ${i} has invalid pattern or target`);
      }
    }
  }

  // Check association count
  if (typeof state.associationCount !== 'number' || state.associationCount < 0) {
    errors.push('Invalid association count');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create an empty state for initialization
 */
export function createEmptyBTSPState(config: BTSPAdapterConfig): BTSPSerializedState {
  return {
    version: SCHEMA_VERSION,
    config: {
      inputSize: config.inputSize,
      outputSize: config.outputSize,
      tau: config.tau,
      plateauThreshold: config.plateauThreshold,
      ewcLambda: config.ewcLambda,
      maxCapacity: config.maxCapacity,
    },
    weights: new Array(config.inputSize).fill(0),
    fisherDiagonal: new Array(config.inputSize).fill(0),
    consolidatedWeights: new Array(config.inputSize).fill(0),
    associationCount: 0,
    associations: [],
    serializedAt: Date.now(),
  };
}

/**
 * Export types
 */
export type { BTSPSerializedState };
