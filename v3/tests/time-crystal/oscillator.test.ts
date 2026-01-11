/**
 * Agentic QE v3 - Oscillator Neuron Tests
 * ADR-032: Time Crystal Scheduling
 *
 * Tests for Kuramoto oscillator dynamics and phase synchronization.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  OscillatorNeuron,
  computeOrderParameter,
  computePhaseCoherence,
  createEvenlySpacedOscillators,
  buildRingCouplingMatrix,
  buildAllToAllCouplingMatrix,
} from '../../src/time-crystal/oscillator';

describe('OscillatorNeuron', () => {
  describe('constructor', () => {
    it('should create oscillator with correct initial state', () => {
      const osc = new OscillatorNeuron(0, 1.0, 0);

      expect(osc.getId()).toBe(0);
      expect(osc.getPhase()).toBe(0);
      expect(osc.getAmplitude()).toBe(1.0);
      expect(osc.getActivity()).toBeCloseTo(1.0, 5); // cos(0) = 1
    });

    it('should convert frequency Hz to angular velocity', () => {
      const osc = new OscillatorNeuron(0, 1.0, 0);

      // 1 Hz = 2*PI rad/s = 2*PI/1000 rad/ms
      const expectedOmega = (2 * Math.PI) / 1000;
      expect(osc.getOmega()).toBeCloseTo(expectedOmega, 10);
    });

    it('should initialize with phase offset', () => {
      const phaseOffset = Math.PI / 2;
      const osc = new OscillatorNeuron(0, 1.0, phaseOffset);

      expect(osc.getPhase()).toBeCloseTo(phaseOffset, 5);
      expect(osc.getActivity()).toBeCloseTo(0, 5); // cos(PI/2) = 0
    });

    it('should normalize phase to [0, 2*PI)', () => {
      const osc = new OscillatorNeuron(0, 1.0, 3 * Math.PI);

      expect(osc.getPhase()).toBeCloseTo(Math.PI, 5);
    });

    it('should handle negative phase offset', () => {
      const osc = new OscillatorNeuron(0, 1.0, -Math.PI / 2);

      expect(osc.getPhase()).toBeCloseTo(3 * Math.PI / 2, 5);
    });

    it('should use custom amplitude', () => {
      const osc = new OscillatorNeuron(0, 1.0, 0, 0.5);

      expect(osc.getAmplitude()).toBe(0.5);
      expect(osc.getActivity()).toBeCloseTo(0.5, 5);
    });
  });

  describe('integrate', () => {
    it('should advance phase over time', () => {
      const osc = new OscillatorNeuron(0, 1.0, 0);
      const initialPhase = osc.getPhase();

      osc.integrate(100, 0); // 100ms step, no coupling

      expect(osc.getPhase()).toBeGreaterThan(initialPhase);
    });

    it('should complete full cycle at natural frequency', () => {
      const frequencyHz = 1.0; // 1 Hz
      const osc = new OscillatorNeuron(0, frequencyHz, 0);

      // One full cycle at 1 Hz should take 1000ms
      const steps = 100;
      const dt = 10; // 10ms per step

      for (let i = 0; i < steps; i++) {
        osc.integrate(dt, 0);
      }

      // After 1000ms, phase should complete one full cycle (2*PI)
      // The phase is normalized to [0, 2*PI), so after exactly one cycle
      // it should be close to 0 OR close to 2*PI (depending on numerical precision)
      const phase = osc.getPhase();
      const normalizedPhase = phase < Math.PI ? phase : 2 * Math.PI - phase;
      expect(normalizedPhase).toBeLessThan(0.1);
    });

    it('should respond to coupling input', () => {
      const osc = new OscillatorNeuron(0, 1.0, 0);

      // Positive coupling should advance phase faster
      const positiveCoupling = 0.01;
      osc.integrate(100, positiveCoupling);

      const phaseWithPositive = osc.getPhase();
      osc.reset(0);

      osc.integrate(100, 0);
      const phaseWithNone = osc.getPhase();

      expect(phaseWithPositive).toBeGreaterThan(phaseWithNone);
    });

    it('should slow down with negative coupling', () => {
      const osc = new OscillatorNeuron(0, 1.0, 0);

      osc.integrate(100, 0);
      const normalPhase = osc.getPhase();

      osc.reset(0);
      osc.integrate(100, -osc.getOmega() * 0.5);

      expect(osc.getPhase()).toBeLessThan(normalPhase);
    });

    it('should update activity after integration', () => {
      const osc = new OscillatorNeuron(0, 1.0, 0);

      expect(osc.getActivity()).toBeCloseTo(1.0, 5); // cos(0) = 1

      // Advance to quarter cycle
      const quarterCycleMs = 250;
      osc.integrate(quarterCycleMs, 0);

      // Activity should decrease (cos approaches 0)
      expect(osc.getActivity()).toBeLessThan(1.0);
    });
  });

  describe('integrateWithModulation', () => {
    it('should speed up with positive modulation', () => {
      const osc1 = new OscillatorNeuron(0, 1.0, 0);
      const osc2 = new OscillatorNeuron(1, 1.0, 0);

      osc1.integrate(100, 0);
      osc2.integrateWithModulation(100, 0, 0.5);

      expect(osc2.getPhase()).toBeGreaterThan(osc1.getPhase());
    });

    it('should slow down with negative modulation', () => {
      const osc1 = new OscillatorNeuron(0, 1.0, 0);
      const osc2 = new OscillatorNeuron(1, 1.0, 0);

      osc1.integrate(100, 0);
      osc2.integrateWithModulation(100, 0, -0.5);

      expect(osc2.getPhase()).toBeLessThan(osc1.getPhase());
    });
  });

  describe('reset', () => {
    it('should reset phase to specified value', () => {
      const osc = new OscillatorNeuron(0, 1.0, 0);
      osc.integrate(100, 0);

      osc.reset(Math.PI);

      expect(osc.getPhase()).toBeCloseTo(Math.PI, 5);
      expect(osc.getActivity()).toBeCloseTo(-1.0, 5); // cos(PI) = -1
    });

    it('should normalize reset phase', () => {
      const osc = new OscillatorNeuron(0, 1.0, 0);
      osc.reset(5 * Math.PI);

      expect(osc.getPhase()).toBeCloseTo(Math.PI, 5);
    });
  });

  describe('setFrequency', () => {
    it('should update natural frequency', () => {
      const osc = new OscillatorNeuron(0, 1.0, 0);
      const initialOmega = osc.getOmega();

      osc.setFrequency(2.0);

      expect(osc.getOmega()).toBeCloseTo(initialOmega * 2, 10);
    });
  });

  describe('setAmplitude', () => {
    it('should update amplitude and recalculate activity', () => {
      const osc = new OscillatorNeuron(0, 1.0, 0);

      osc.setAmplitude(0.5);

      expect(osc.getAmplitude()).toBe(0.5);
      expect(osc.getActivity()).toBeCloseTo(0.5, 5);
    });
  });

  describe('computeCouplingFrom', () => {
    it('should compute Kuramoto coupling force', () => {
      const osc1 = new OscillatorNeuron(0, 1.0, 0);
      const osc2 = new OscillatorNeuron(1, 1.0, Math.PI / 2);

      const coupling = osc1.computeCouplingFrom(osc2, 1.0);

      // K * sin(phi2 - phi1) = 1.0 * sin(PI/2 - 0) = 1.0
      expect(coupling).toBeCloseTo(1.0, 5);
    });

    it('should return zero coupling for in-phase oscillators', () => {
      const osc1 = new OscillatorNeuron(0, 1.0, 0);
      const osc2 = new OscillatorNeuron(1, 1.0, 0);

      const coupling = osc1.computeCouplingFrom(osc2, 1.0);

      // sin(0) = 0
      expect(coupling).toBeCloseTo(0, 5);
    });

    it('should return negative coupling for reverse phase', () => {
      const osc1 = new OscillatorNeuron(0, 1.0, Math.PI / 2);
      const osc2 = new OscillatorNeuron(1, 1.0, 0);

      const coupling = osc1.computeCouplingFrom(osc2, 1.0);

      // sin(-PI/2) = -1
      expect(coupling).toBeCloseTo(-1.0, 5);
    });
  });

  describe('isInPhaseWith', () => {
    it('should detect in-phase oscillators', () => {
      const osc1 = new OscillatorNeuron(0, 1.0, 0);
      const osc2 = new OscillatorNeuron(1, 1.0, 0.05);

      expect(osc1.isInPhaseWith(osc2, 0.1)).toBe(true);
    });

    it('should reject out-of-phase oscillators', () => {
      const osc1 = new OscillatorNeuron(0, 1.0, 0);
      const osc2 = new OscillatorNeuron(1, 1.0, Math.PI / 4);

      expect(osc1.isInPhaseWith(osc2, 0.1)).toBe(false);
    });

    it('should handle wrap-around', () => {
      const osc1 = new OscillatorNeuron(0, 1.0, 0.05);
      const osc2 = new OscillatorNeuron(1, 1.0, 2 * Math.PI - 0.05);

      expect(osc1.isInPhaseWith(osc2, 0.2)).toBe(true);
    });
  });

  describe('isAntiPhaseWith', () => {
    it('should detect anti-phase oscillators', () => {
      const osc1 = new OscillatorNeuron(0, 1.0, 0);
      const osc2 = new OscillatorNeuron(1, 1.0, Math.PI);

      expect(osc1.isAntiPhaseWith(osc2, 0.1)).toBe(true);
    });

    it('should reject non-anti-phase oscillators', () => {
      const osc1 = new OscillatorNeuron(0, 1.0, 0);
      const osc2 = new OscillatorNeuron(1, 1.0, Math.PI / 2);

      expect(osc1.isAntiPhaseWith(osc2, 0.1)).toBe(false);
    });
  });

  describe('getState / restoreState', () => {
    it('should save and restore oscillator state', () => {
      const osc = new OscillatorNeuron(5, 2.0, Math.PI / 4, 0.8);
      osc.integrate(100, 0.01);

      const state = osc.getState();
      const osc2 = new OscillatorNeuron(5, 1.0, 0);
      osc2.restoreState(state);

      expect(osc2.getPhase()).toBeCloseTo(osc.getPhase(), 10);
      expect(osc2.getOmega()).toBeCloseTo(osc.getOmega(), 10);
      expect(osc2.getAmplitude()).toBeCloseTo(osc.getAmplitude(), 10);
      expect(osc2.getActivity()).toBeCloseTo(osc.getActivity(), 10);
    });

    it('should throw on state id mismatch', () => {
      const osc1 = new OscillatorNeuron(1, 1.0, 0);
      const osc2 = new OscillatorNeuron(2, 1.0, 0);

      expect(() => osc2.restoreState(osc1.getState())).toThrow('State id mismatch');
    });
  });

  describe('clone', () => {
    it('should create independent copy', () => {
      const osc = new OscillatorNeuron(3, 1.5, Math.PI / 3, 0.9);
      osc.integrate(50, 0.02);

      const clone = osc.clone();

      expect(clone.getId()).toBe(osc.getId());
      expect(clone.getPhase()).toBeCloseTo(osc.getPhase(), 10);
      expect(clone.getOmega()).toBeCloseTo(osc.getOmega(), 10);

      // Modify original, clone should be unaffected
      osc.integrate(100, 0);
      expect(clone.getPhase()).not.toBeCloseTo(osc.getPhase(), 5);
    });
  });
});

describe('computeOrderParameter', () => {
  it('should return r=1 for synchronized oscillators', () => {
    const oscillators = [
      new OscillatorNeuron(0, 1.0, 0),
      new OscillatorNeuron(1, 1.0, 0),
      new OscillatorNeuron(2, 1.0, 0),
    ];

    const { r, psi } = computeOrderParameter(oscillators);

    expect(r).toBeCloseTo(1.0, 5);
    expect(psi).toBeCloseTo(0, 5);
  });

  it('should return r=0 for evenly distributed oscillators', () => {
    const oscillators = [
      new OscillatorNeuron(0, 1.0, 0),
      new OscillatorNeuron(1, 1.0, Math.PI / 2),
      new OscillatorNeuron(2, 1.0, Math.PI),
      new OscillatorNeuron(3, 1.0, 3 * Math.PI / 2),
    ];

    const { r } = computeOrderParameter(oscillators);

    expect(r).toBeCloseTo(0, 5);
  });

  it('should return intermediate r for partial synchronization', () => {
    const oscillators = [
      new OscillatorNeuron(0, 1.0, 0),
      new OscillatorNeuron(1, 1.0, 0.1),
      new OscillatorNeuron(2, 1.0, Math.PI),
    ];

    const { r } = computeOrderParameter(oscillators);

    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(1);
  });

  it('should return correct mean phase', () => {
    const oscillators = [
      new OscillatorNeuron(0, 1.0, Math.PI / 4),
      new OscillatorNeuron(1, 1.0, Math.PI / 4),
    ];

    const { psi } = computeOrderParameter(oscillators);

    expect(psi).toBeCloseTo(Math.PI / 4, 5);
  });

  it('should handle empty array', () => {
    const { r, psi } = computeOrderParameter([]);

    expect(r).toBe(0);
    expect(psi).toBe(0);
  });
});

describe('computePhaseCoherence', () => {
  it('should return 1 for perfectly coherent phases', () => {
    // All oscillators maintain constant phase difference
    const phases = [
      [0, 0.1, 0.2, 0.3],
      [Math.PI, Math.PI + 0.1, Math.PI + 0.2, Math.PI + 0.3],
    ];

    const coherence = computePhaseCoherence(phases);

    expect(coherence).toBeCloseTo(1.0, 5);
  });

  it('should return low value for incoherent phases', () => {
    // Random phase differences
    const phases = [
      [0, Math.PI, 0.5, 2.0],
      [1.0, 0.1, Math.PI, 0.3],
    ];

    const coherence = computePhaseCoherence(phases);

    expect(coherence).toBeLessThan(0.5);
  });

  it('should handle insufficient data', () => {
    expect(computePhaseCoherence([])).toBe(0);
    expect(computePhaseCoherence([[0]])).toBe(0);
  });
});

describe('createEvenlySpacedOscillators', () => {
  it('should create correct number of oscillators', () => {
    const oscillators = createEvenlySpacedOscillators(4, 1.0);

    expect(oscillators).toHaveLength(4);
  });

  it('should space phases evenly', () => {
    const oscillators = createEvenlySpacedOscillators(4, 1.0);
    const expectedPhases = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];

    for (let i = 0; i < 4; i++) {
      expect(oscillators[i].getPhase()).toBeCloseTo(expectedPhases[i], 5);
    }
  });

  it('should assign correct IDs', () => {
    const oscillators = createEvenlySpacedOscillators(3, 1.0);

    expect(oscillators[0].getId()).toBe(0);
    expect(oscillators[1].getId()).toBe(1);
    expect(oscillators[2].getId()).toBe(2);
  });

  it('should use specified frequency', () => {
    const oscillators = createEvenlySpacedOscillators(2, 2.5);

    const expectedOmega = (2 * Math.PI * 2.5) / 1000;
    expect(oscillators[0].getOmega()).toBeCloseTo(expectedOmega, 10);
  });
});

describe('buildRingCouplingMatrix', () => {
  it('should create correct size matrix', () => {
    const matrix = buildRingCouplingMatrix(4, 0.5);

    expect(matrix).toHaveLength(4);
    expect(matrix[0]).toHaveLength(4);
  });

  it('should couple nearest neighbors only', () => {
    const matrix = buildRingCouplingMatrix(4, 0.5);

    // Check oscillator 0: coupled to 3 (prev) and 1 (next)
    expect(matrix[0][3]).toBe(0.5);
    expect(matrix[0][1]).toBe(0.5);
    expect(matrix[0][2]).toBe(0);
    expect(matrix[0][0]).toBe(0); // No self-coupling
  });

  it('should form a ring (wrap around)', () => {
    const matrix = buildRingCouplingMatrix(3, 1.0);

    // Last oscillator coupled to first
    expect(matrix[2][0]).toBe(1.0);
    expect(matrix[0][2]).toBe(1.0);
  });

  it('should use specified coupling strength', () => {
    const matrix = buildRingCouplingMatrix(4, 0.3);

    expect(matrix[1][0]).toBe(0.3);
    expect(matrix[1][2]).toBe(0.3);
  });
});

describe('buildAllToAllCouplingMatrix', () => {
  it('should couple all oscillators', () => {
    const matrix = buildAllToAllCouplingMatrix(3, 0.6);

    // All non-diagonal entries should be non-zero
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (i !== j) {
          expect(matrix[i][j]).toBeGreaterThan(0);
        }
      }
    }
  });

  it('should have no self-coupling', () => {
    const matrix = buildAllToAllCouplingMatrix(4, 1.0);

    for (let i = 0; i < 4; i++) {
      expect(matrix[i][i]).toBe(0);
    }
  });

  it('should normalize coupling strength', () => {
    const matrix = buildAllToAllCouplingMatrix(4, 0.9);

    // Each non-diagonal entry should be K / (N-1)
    const expectedStrength = 0.9 / 3;
    expect(matrix[0][1]).toBeCloseTo(expectedStrength, 10);
  });
});

describe('Kuramoto synchronization dynamics', () => {
  it('should synchronize oscillators over time with all-to-all coupling', () => {
    const n = 4;
    // Use more spread-out initial phases for clearer synchronization effect
    const oscillators = [
      new OscillatorNeuron(0, 0.1, 0),
      new OscillatorNeuron(1, 0.1, Math.PI / 2),
      new OscillatorNeuron(2, 0.1, Math.PI),
      new OscillatorNeuron(3, 0.1, 3 * Math.PI / 2),
    ];

    // Use stronger coupling for clearer synchronization
    const coupling = buildAllToAllCouplingMatrix(n, 1.0);
    const dt = 10;
    const steps = 1000;

    // Run simulation
    for (let step = 0; step < steps; step++) {
      const couplingInputs = new Array(n).fill(0);

      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i !== j) {
            couplingInputs[i] += oscillators[i].computeCouplingFrom(
              oscillators[j],
              coupling[i][j]
            );
          }
        }
      }

      for (let i = 0; i < n; i++) {
        oscillators[i].integrate(dt, couplingInputs[i]);
      }
    }

    const finalR = computeOrderParameter(oscillators).r;

    // With strong coupling and enough time, oscillators should synchronize
    // Order parameter should be reasonably high (>0.5)
    expect(finalR).toBeGreaterThan(0.5);
  });
});
