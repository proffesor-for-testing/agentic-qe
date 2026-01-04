/**
 * Circadian Controller Serializer
 *
 * Handles serialization and deserialization of CircadianController state.
 * Since circadian state is all primitives and simple objects, we use JSON.
 *
 * @module nervous-system/persistence/CircadianSerializer
 */

import type { CircadianSerializedState } from './INervousSystemStore.js';
import type {
  CircadianPhase,
  CircadianState,
  CircadianMetrics,
  CircadianModulation,
  CircadianConfig,
} from '../adapters/CircadianController.js';

/**
 * Current serialization schema version
 */
const SCHEMA_VERSION = 1;

/**
 * Options for circadian serialization
 */
export interface CircadianSerializerOptions {
  /** Include metrics history (default: true) */
  includeMetrics?: boolean;
  /** Include modulation state (default: true) */
  includeModulation?: boolean;
}

/**
 * Interface for a serializable circadian controller
 */
export interface SerializableCircadianController {
  /** Get current state */
  getState(): CircadianState;
  /** Get accumulated metrics */
  getMetrics(): CircadianMetrics;
  /** Get last phase change timestamp */
  getLastPhaseChangeTime(): number;
  /** Get modulation start time if active */
  getModulationStartTime(): number | undefined;
}

/**
 * Interface for a restorable circadian controller
 */
export interface RestorableCircadianController {
  /** Restore state from saved values */
  restoreState(
    phase: CircadianPhase,
    cycleTime: number,
    phaseTime: number,
    cyclesCompleted: number,
    energyRemaining: number,
    modulation: CircadianModulation | null
  ): void;
  /** Restore metrics */
  restoreMetrics(metrics: CircadianMetrics): void;
  /** Restore last phase change time */
  restoreLastPhaseChangeTime(time: number): void;
  /** Restore modulation start time */
  restoreModulationStartTime(time: number | undefined): void;
}

/**
 * Serialize a CircadianController to storable format
 *
 * @param controller - The controller to serialize
 * @param options - Serialization options
 * @returns Serialized state ready for storage
 */
export function serializeCircadian(
  controller: SerializableCircadianController,
  options: CircadianSerializerOptions = {}
): CircadianSerializedState {
  const {
    includeMetrics = true,
    includeModulation = true,
  } = options;

  const state = controller.getState();
  const metrics = controller.getMetrics();
  const lastPhaseChange = controller.getLastPhaseChangeTime();
  const modulationStartTime = controller.getModulationStartTime();

  // Build serialized state
  const serialized: CircadianSerializedState = {
    version: SCHEMA_VERSION,
    state: {
      phase: state.phase,
      cycleTime: state.cycleTime,
      phaseTime: state.phaseTime,
      energyRemaining: state.energyRemaining,
      cyclesCompleted: state.cyclesCompleted,
      activeModulation: includeModulation ? state.activeModulation : null,
      timeToNextPhase: state.timeToNextPhase,
      wasmEnabled: state.wasmEnabled,
    },
    metrics: includeMetrics ? { ...metrics } : createEmptyMetrics(),
    lastPhaseChange,
    modulationStartTime: includeModulation ? modulationStartTime : undefined,
    serializedAt: Date.now(),
  };

  return serialized;
}

/**
 * Deserialize stored state back into a CircadianController
 *
 * @param state - Serialized state from storage
 * @param controller - The controller to restore state into
 */
export function deserializeCircadian(
  state: CircadianSerializedState,
  controller: RestorableCircadianController
): void {
  // Handle version migration if needed
  if (state.version !== SCHEMA_VERSION) {
    migrateState(state);
  }

  // Restore core state
  controller.restoreState(
    state.state.phase,
    state.state.cycleTime,
    state.state.phaseTime,
    state.state.cyclesCompleted,
    state.state.energyRemaining,
    state.state.activeModulation
  );

  // Restore metrics
  if (state.metrics) {
    controller.restoreMetrics(state.metrics);
  }

  // Restore timing
  controller.restoreLastPhaseChangeTime(state.lastPhaseChange);

  if (state.modulationStartTime !== undefined) {
    controller.restoreModulationStartTime(state.modulationStartTime);
  }
}

/**
 * Migrate state from older schema versions
 */
function migrateState(state: CircadianSerializedState): void {
  // Future: Add migration logic as schema evolves
  state.version = SCHEMA_VERSION;
}

/**
 * Create empty metrics structure
 */
function createEmptyMetrics(): CircadianMetrics {
  return {
    phaseTime: {
      Active: 0,
      Dawn: 0,
      Dusk: 0,
      Rest: 0,
    },
    reactionsPerPhase: {
      Active: 0,
      Dawn: 0,
      Dusk: 0,
      Rest: 0,
    },
    rejectionsPerPhase: {
      Active: 0,
      Dawn: 0,
      Dusk: 0,
      Rest: 0,
    },
    averageDutyFactor: 0,
    totalEnergyConsumed: 0,
    phaseTransitions: 0,
    hysteresisActivations: 0,
    wtaCompetitions: 0,
  };
}

/**
 * Calculate approximate size of serialized state in bytes
 */
export function calculateStateSize(state: CircadianSerializedState): number {
  // JSON serialization is compact for this simple structure
  return JSON.stringify(state).length;
}

/**
 * Validate serialized state integrity
 */
export function validateCircadianState(state: CircadianSerializedState): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check version
  if (typeof state.version !== 'number' || state.version < 1) {
    errors.push('Invalid schema version');
  }

  // Check state
  if (!state.state) {
    errors.push('Missing state object');
  } else {
    // Check phase
    const validPhases: CircadianPhase[] = ['Active', 'Dawn', 'Dusk', 'Rest'];
    if (!validPhases.includes(state.state.phase)) {
      errors.push(`Invalid phase: ${state.state.phase}`);
    }

    // Check numeric fields
    if (typeof state.state.cycleTime !== 'number' || state.state.cycleTime < 0) {
      errors.push('Invalid cycleTime');
    }
    if (typeof state.state.phaseTime !== 'number' || state.state.phaseTime < 0) {
      errors.push('Invalid phaseTime');
    }
    if (typeof state.state.energyRemaining !== 'number') {
      errors.push('Invalid energyRemaining');
    }
    if (typeof state.state.cyclesCompleted !== 'number' || state.state.cyclesCompleted < 0) {
      errors.push('Invalid cyclesCompleted');
    }
  }

  // Check metrics
  if (!state.metrics) {
    errors.push('Missing metrics object');
  } else {
    // Check phase time records
    const phases: CircadianPhase[] = ['Active', 'Dawn', 'Dusk', 'Rest'];
    for (const phase of phases) {
      if (typeof state.metrics.phaseTime[phase] !== 'number') {
        errors.push(`Missing phaseTime for ${phase}`);
      }
      if (typeof state.metrics.reactionsPerPhase[phase] !== 'number') {
        errors.push(`Missing reactionsPerPhase for ${phase}`);
      }
      if (typeof state.metrics.rejectionsPerPhase[phase] !== 'number') {
        errors.push(`Missing rejectionsPerPhase for ${phase}`);
      }
    }
  }

  // Check timestamps
  if (typeof state.lastPhaseChange !== 'number') {
    errors.push('Invalid lastPhaseChange timestamp');
  }
  if (typeof state.serializedAt !== 'number') {
    errors.push('Invalid serializedAt timestamp');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create a default serialized state for new controllers
 */
export function createDefaultCircadianState(
  initialPhase: CircadianPhase = 'Active',
  energyBudget: number = 0
): CircadianSerializedState {
  return {
    version: SCHEMA_VERSION,
    state: {
      phase: initialPhase,
      cycleTime: 0,
      phaseTime: 0,
      energyRemaining: energyBudget,
      cyclesCompleted: 0,
      activeModulation: null,
      timeToNextPhase: 0,
      wasmEnabled: false,
    },
    metrics: createEmptyMetrics(),
    lastPhaseChange: Date.now(),
    serializedAt: Date.now(),
  };
}

/**
 * Calculate energy savings from metrics
 */
export function calculateEnergySavings(state: CircadianSerializedState): {
  savingsPercentage: number;
  totalRestTime: number;
  totalActiveTime: number;
  averageDutyFactor: number;
  costReductionFactor: number;
} {
  const { phaseTime } = state.metrics;

  const totalTime = phaseTime.Active + phaseTime.Dawn + phaseTime.Dusk + phaseTime.Rest;
  const totalRestTime = phaseTime.Rest;
  const totalActiveTime = phaseTime.Active;

  if (totalTime === 0) {
    return {
      savingsPercentage: 0,
      totalRestTime: 0,
      totalActiveTime: 0,
      averageDutyFactor: 1,
      costReductionFactor: 1,
    };
  }

  // Calculate weighted average duty factor
  // Active: 1.0, Dawn: 0.6, Dusk: 0.4, Rest: 0.1
  const weightedDuty =
    (phaseTime.Active * 1.0 +
      phaseTime.Dawn * 0.6 +
      phaseTime.Dusk * 0.4 +
      phaseTime.Rest * 0.1) / totalTime;

  const savingsPercentage = (1 - weightedDuty) * 100;
  const costReductionFactor = 1 / weightedDuty;

  return {
    savingsPercentage,
    totalRestTime,
    totalActiveTime,
    averageDutyFactor: weightedDuty,
    costReductionFactor,
  };
}

/**
 * Export types
 */
export type { CircadianSerializedState };
