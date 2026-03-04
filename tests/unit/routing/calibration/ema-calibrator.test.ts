/**
 * EMA Calibrator Tests
 * Validates EMA-based agent calibration for voting weights
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EMACalibrator,
  DEFAULT_EMA_CONFIG,
  type CalibrationRecord,
} from '../../../../src/routing/calibration/index.js';

describe('EMACalibrator', () => {
  let calibrator: EMACalibrator;

  beforeEach(() => {
    calibrator = new EMACalibrator();
  });

  describe('EMA convergence', () => {
    it('should converge emaAccuracy toward 1.0 after many successes', () => {
      for (let i = 0; i < 100; i++) {
        calibrator.recordOutcome('agent-a', true, 0.9);
      }

      const record = calibrator.getCalibration('agent-a');
      expect(record).not.toBeNull();
      expect(record!.emaAccuracy).toBeGreaterThan(0.99);
    });

    it('should converge emaAccuracy toward 0.0 after many failures', () => {
      // Seed with one success first so EMA starts non-zero
      calibrator.recordOutcome('agent-b', true, 0.5);

      for (let i = 0; i < 100; i++) {
        calibrator.recordOutcome('agent-b', false, 0.1);
      }

      const record = calibrator.getCalibration('agent-b');
      expect(record).not.toBeNull();
      expect(record!.emaAccuracy).toBeLessThan(0.01);
    });

    it('should converge emaAccuracy toward ~0.5 with alternating outcomes', () => {
      for (let i = 0; i < 200; i++) {
        calibrator.recordOutcome('agent-c', i % 2 === 0, 0.5);
      }

      const record = calibrator.getCalibration('agent-c');
      expect(record).not.toBeNull();
      // With alternating success/fail and alpha=0.1, EMA oscillates around 0.5
      expect(record!.emaAccuracy).toBeGreaterThan(0.4);
      expect(record!.emaAccuracy).toBeLessThan(0.6);
    });

    it('should converge emaQuality toward the consistent quality score', () => {
      for (let i = 0; i < 100; i++) {
        calibrator.recordOutcome('agent-d', true, 0.75);
      }

      const record = calibrator.getCalibration('agent-d');
      expect(record).not.toBeNull();
      expect(record!.emaQuality).toBeGreaterThan(0.74);
      expect(record!.emaQuality).toBeLessThan(0.76);
    });
  });

  describe('weight clamping', () => {
    it('should clamp weight to floor (0.2) for very low accuracy', () => {
      // Record enough outcomes to pass minOutcomes threshold
      for (let i = 0; i < 20; i++) {
        calibrator.recordOutcome('low-agent', false, 0.0);
      }

      const record = calibrator.getCalibration('low-agent');
      expect(record).not.toBeNull();
      expect(record!.calibratedWeight).toBe(DEFAULT_EMA_CONFIG.weightFloor);
    });

    it('should clamp weight to ceiling (2.0) for very high accuracy', () => {
      for (let i = 0; i < 20; i++) {
        calibrator.recordOutcome('high-agent', true, 1.0);
      }

      const record = calibrator.getCalibration('high-agent');
      expect(record).not.toBeNull();
      expect(record!.calibratedWeight).toBe(DEFAULT_EMA_CONFIG.weightCeiling);
    });

    it('should use custom floor and ceiling when configured', () => {
      const custom = new EMACalibrator({ weightFloor: 0.5, weightCeiling: 1.5, minOutcomes: 2 });

      // Low accuracy agent
      custom.recordOutcome('lo', false, 0.0);
      custom.recordOutcome('lo', false, 0.0);
      expect(custom.getCalibratedWeight('lo')).toBe(0.5);

      // High accuracy agent
      custom.recordOutcome('hi', true, 1.0);
      custom.recordOutcome('hi', true, 1.0);
      expect(custom.getCalibratedWeight('hi')).toBe(1.5);
    });
  });

  describe('minOutcomes threshold', () => {
    it('should return weight 1.0 until minOutcomes is reached', () => {
      for (let i = 0; i < DEFAULT_EMA_CONFIG.minOutcomes - 1; i++) {
        const record = calibrator.recordOutcome('new-agent', true, 1.0);
        expect(record.calibratedWeight).toBe(1.0);
      }

      // At minOutcomes, calibrated weight kicks in
      const finalRecord = calibrator.recordOutcome('new-agent', true, 1.0);
      expect(finalRecord.calibratedWeight).not.toBe(1.0);
      expect(finalRecord.totalOutcomes).toBe(DEFAULT_EMA_CONFIG.minOutcomes);
    });

    it('should respect custom minOutcomes', () => {
      const custom = new EMACalibrator({ minOutcomes: 3 });

      custom.recordOutcome('x', true, 1.0);
      expect(custom.getCalibratedWeight('x')).toBe(1.0);

      custom.recordOutcome('x', true, 1.0);
      expect(custom.getCalibratedWeight('x')).toBe(1.0);

      custom.recordOutcome('x', true, 1.0);
      // After 3 outcomes, calibrated weight is applied
      expect(custom.getCalibratedWeight('x')).not.toBe(1.0);
    });
  });

  describe('getCalibratedWeight', () => {
    it('should return 1.0 for unknown agent', () => {
      expect(calibrator.getCalibratedWeight('unknown-agent')).toBe(1.0);
    });

    it('should return 1.0 for agent below minOutcomes', () => {
      calibrator.recordOutcome('partial', true, 0.9);
      expect(calibrator.getCalibratedWeight('partial')).toBe(1.0);
    });
  });

  describe('getCalibration', () => {
    it('should return null for unknown agent', () => {
      expect(calibrator.getCalibration('nonexistent')).toBeNull();
    });

    it('should return the record after recording outcomes', () => {
      calibrator.recordOutcome('test-agent', true, 0.8);
      const record = calibrator.getCalibration('test-agent');
      expect(record).not.toBeNull();
      expect(record!.agentId).toBe('test-agent');
      expect(record!.totalOutcomes).toBe(1);
    });
  });

  describe('getAllCalibrations', () => {
    it('should return empty array initially', () => {
      expect(calibrator.getAllCalibrations()).toEqual([]);
    });

    it('should return all recorded agents', () => {
      calibrator.recordOutcome('agent-1', true, 0.9);
      calibrator.recordOutcome('agent-2', false, 0.3);
      calibrator.recordOutcome('agent-3', true, 0.7);

      const all = calibrator.getAllCalibrations();
      expect(all).toHaveLength(3);
      const ids = all.map(r => r.agentId).sort();
      expect(ids).toEqual(['agent-1', 'agent-2', 'agent-3']);
    });
  });

  describe('reset', () => {
    it('should clear all records when called without arguments', () => {
      calibrator.recordOutcome('a', true, 0.9);
      calibrator.recordOutcome('b', false, 0.2);
      expect(calibrator.getAllCalibrations()).toHaveLength(2);

      calibrator.reset();
      expect(calibrator.getAllCalibrations()).toHaveLength(0);
      expect(calibrator.getCalibration('a')).toBeNull();
    });

    it('should clear only the specified agent', () => {
      calibrator.recordOutcome('keep', true, 0.9);
      calibrator.recordOutcome('remove', false, 0.2);

      calibrator.reset('remove');
      expect(calibrator.getCalibration('keep')).not.toBeNull();
      expect(calibrator.getCalibration('remove')).toBeNull();
      expect(calibrator.getAllCalibrations()).toHaveLength(1);
    });
  });

  describe('serialize / deserialize', () => {
    it('should roundtrip correctly', () => {
      calibrator.recordOutcome('agent-x', true, 0.85);
      calibrator.recordOutcome('agent-x', false, 0.4);
      calibrator.recordOutcome('agent-y', true, 0.95);

      const serialized = calibrator.serialize();

      const restored = new EMACalibrator();
      restored.deserialize(serialized);

      const origX = calibrator.getCalibration('agent-x');
      const restoredX = restored.getCalibration('agent-x');
      expect(restoredX).not.toBeNull();
      expect(restoredX!.emaAccuracy).toBe(origX!.emaAccuracy);
      expect(restoredX!.emaQuality).toBe(origX!.emaQuality);
      expect(restoredX!.totalOutcomes).toBe(origX!.totalOutcomes);
      expect(restoredX!.calibratedWeight).toBe(origX!.calibratedWeight);

      const origY = calibrator.getCalibration('agent-y');
      const restoredY = restored.getCalibration('agent-y');
      expect(restoredY).not.toBeNull();
      expect(restoredY!.emaAccuracy).toBe(origY!.emaAccuracy);
    });

    it('should deserialize dates correctly', () => {
      calibrator.recordOutcome('agent-z', true, 0.7);
      const serialized = calibrator.serialize();

      // Simulate JSON roundtrip (dates become strings)
      const jsonRoundtrip = JSON.parse(JSON.stringify(serialized)) as Record<string, CalibrationRecord>;

      const restored = new EMACalibrator();
      restored.deserialize(jsonRoundtrip);

      const record = restored.getCalibration('agent-z');
      expect(record).not.toBeNull();
      expect(record!.lastUpdated).toBeInstanceOf(Date);
    });

    it('should clear previous records on deserialize', () => {
      calibrator.recordOutcome('old-agent', true, 0.5);

      const newData: Record<string, CalibrationRecord> = {
        'new-agent': {
          agentId: 'new-agent',
          emaAccuracy: 0.8,
          emaQuality: 0.7,
          calibratedWeight: 1.6,
          totalOutcomes: 15,
          lastUpdated: new Date(),
        },
      };

      calibrator.deserialize(newData);
      expect(calibrator.getCalibration('old-agent')).toBeNull();
      expect(calibrator.getCalibration('new-agent')).not.toBeNull();
    });
  });

  describe('quality score clamping', () => {
    it('should clamp quality scores above 1 to 1', () => {
      calibrator.recordOutcome('clamp-agent', true, 1.5);
      const record = calibrator.getCalibration('clamp-agent');
      expect(record!.emaQuality).toBeLessThanOrEqual(1.0);
    });

    it('should clamp quality scores below 0 to 0', () => {
      calibrator.recordOutcome('clamp-agent', true, -0.5);
      const record = calibrator.getCalibration('clamp-agent');
      expect(record!.emaQuality).toBeGreaterThanOrEqual(0.0);
    });
  });

  describe('first outcome initialization', () => {
    it('should set emaAccuracy to 1 on first success', () => {
      const record = calibrator.recordOutcome('first', true, 0.5);
      expect(record.emaAccuracy).toBe(1);
    });

    it('should set emaAccuracy to 0 on first failure', () => {
      const record = calibrator.recordOutcome('first', false, 0.5);
      expect(record.emaAccuracy).toBe(0);
    });
  });
});
