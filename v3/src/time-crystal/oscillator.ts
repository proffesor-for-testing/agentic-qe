/**
 * Agentic QE v3 - Oscillator Neuron
 * ADR-032: Kuramoto CPG oscillators for self-sustaining scheduling
 *
 * Implements the Kuramoto model for phase synchronization:
 *   dφ/dt = ω + K * Σ sin(φⱼ - φᵢ)
 *
 * Where:
 *   φ = phase angle
 *   ω = natural frequency
 *   K = coupling strength
 */

import { OscillatorState } from './types';

/**
 * Oscillator Neuron implementing Kuramoto dynamics
 *
 * Models a single oscillator in the CPG network.
 * Uses cosine activation for activity level.
 */
export class OscillatorNeuron {
  private id: number;
  private phase: number;           // Current phase angle (0 to 2π)
  private omega: number;           // Natural angular frequency (rad/ms)
  private amplitude: number;
  private activity: number;

  /**
   * Create a new oscillator neuron
   *
   * @param id - Unique oscillator identifier
   * @param frequencyHz - Natural frequency in Hz
   * @param phaseOffset - Initial phase offset in radians
   * @param amplitude - Oscillation amplitude (default 1.0)
   */
  constructor(
    id: number,
    frequencyHz: number,
    phaseOffset: number = 0,
    amplitude: number = 1.0
  ) {
    this.id = id;
    // Convert Hz to rad/ms: ω = 2π * f / 1000
    this.omega = (2 * Math.PI * frequencyHz) / 1000;
    this.phase = this.normalizePhase(phaseOffset);
    this.amplitude = amplitude;
    this.activity = this.amplitude * Math.cos(this.phase);
  }

  /**
   * Integrate oscillator dynamics over one time step
   *
   * Implements Kuramoto-like dynamics:
   *   dφ/dt = ω + coupling_input
   *
   * Where coupling_input is the sum of:
   *   K * sin(φⱼ - φᵢ) for all coupled oscillators j
   *
   * @param dt - Time step in milliseconds
   * @param couplingInput - Sum of coupling forces from other oscillators
   */
  integrate(dt: number, couplingInput: number): void {
    // Compute phase change: dφ = (ω + coupling) * dt
    const dPhase = (this.omega + couplingInput) * dt;
    this.phase += dPhase;

    // Normalize phase to [0, 2π)
    this.phase = this.normalizePhase(this.phase);

    // Update activity using cosine function
    // Activity ranges from -amplitude to +amplitude
    this.activity = this.amplitude * Math.cos(this.phase);
  }

  /**
   * Integrate with external phase forcing
   *
   * Allows modulating the natural frequency with quality feedback
   *
   * @param dt - Time step in milliseconds
   * @param couplingInput - Sum of coupling forces
   * @param frequencyModulation - Modulation to natural frequency (-1 to 1)
   */
  integrateWithModulation(
    dt: number,
    couplingInput: number,
    frequencyModulation: number = 0
  ): void {
    // Modulate frequency: slow down on poor quality, speed up on good
    const modulatedOmega = this.omega * (1 + frequencyModulation * 0.5);
    const dPhase = (modulatedOmega + couplingInput) * dt;
    this.phase += dPhase;
    this.phase = this.normalizePhase(this.phase);
    this.activity = this.amplitude * Math.cos(this.phase);
  }

  /**
   * Get the current phase angle
   *
   * @returns Phase in radians [0, 2π)
   */
  getPhase(): number {
    return this.phase;
  }

  /**
   * Get the current activity level
   *
   * @returns Activity level [-amplitude, +amplitude]
   */
  getActivity(): number {
    return this.activity;
  }

  /**
   * Get the oscillator's unique identifier
   */
  getId(): number {
    return this.id;
  }

  /**
   * Get the natural angular frequency
   *
   * @returns Angular frequency in rad/ms
   */
  getOmega(): number {
    return this.omega;
  }

  /**
   * Get the oscillation amplitude
   */
  getAmplitude(): number {
    return this.amplitude;
  }

  /**
   * Set the oscillation amplitude
   *
   * @param amplitude - New amplitude value
   */
  setAmplitude(amplitude: number): void {
    this.amplitude = amplitude;
    this.activity = this.amplitude * Math.cos(this.phase);
  }

  /**
   * Set the natural frequency
   *
   * @param frequencyHz - New frequency in Hz
   */
  setFrequency(frequencyHz: number): void {
    this.omega = (2 * Math.PI * frequencyHz) / 1000;
  }

  /**
   * Reset the oscillator to a specific phase
   *
   * @param phase - Phase angle in radians
   */
  reset(phase: number): void {
    this.phase = this.normalizePhase(phase);
    this.activity = this.amplitude * Math.cos(this.phase);
  }

  /**
   * Get the complete state of the oscillator
   */
  getState(): OscillatorState {
    return {
      id: this.id,
      phase: this.phase,
      omega: this.omega,
      amplitude: this.amplitude,
      activity: this.activity,
    };
  }

  /**
   * Restore oscillator from state
   *
   * @param state - State to restore
   */
  restoreState(state: OscillatorState): void {
    if (state.id !== this.id) {
      throw new Error(`State id mismatch: expected ${this.id}, got ${state.id}`);
    }
    this.phase = state.phase;
    this.omega = state.omega;
    this.amplitude = state.amplitude;
    this.activity = state.activity;
  }

  /**
   * Compute Kuramoto coupling input from another oscillator
   *
   * @param other - The other oscillator
   * @param couplingStrength - Coupling strength K
   * @returns Coupling force: K * sin(φⱼ - φᵢ)
   */
  computeCouplingFrom(other: OscillatorNeuron, couplingStrength: number): number {
    const phaseDiff = other.getPhase() - this.phase;
    return couplingStrength * Math.sin(phaseDiff);
  }

  /**
   * Check if this oscillator is in phase with another
   *
   * @param other - The other oscillator
   * @param tolerance - Phase difference tolerance in radians
   * @returns True if oscillators are in phase
   */
  isInPhaseWith(other: OscillatorNeuron, tolerance: number = 0.1): boolean {
    const phaseDiff = Math.abs(this.phase - other.getPhase());
    // Account for wrap-around
    const normalizedDiff = Math.min(phaseDiff, 2 * Math.PI - phaseDiff);
    return normalizedDiff <= tolerance;
  }

  /**
   * Check if this oscillator is anti-phase with another
   *
   * @param other - The other oscillator
   * @param tolerance - Phase difference tolerance in radians
   * @returns True if oscillators are anti-phase
   */
  isAntiPhaseWith(other: OscillatorNeuron, tolerance: number = 0.1): boolean {
    const phaseDiff = Math.abs(this.phase - other.getPhase());
    const normalizedDiff = Math.min(phaseDiff, 2 * Math.PI - phaseDiff);
    return Math.abs(normalizedDiff - Math.PI) <= tolerance;
  }

  /**
   * Normalize phase to [0, 2π) range
   */
  private normalizePhase(phase: number): number {
    const TWO_PI = 2 * Math.PI;
    while (phase >= TWO_PI) {
      phase -= TWO_PI;
    }
    while (phase < 0) {
      phase += TWO_PI;
    }
    return phase;
  }

  /**
   * Create a copy of this oscillator
   */
  clone(): OscillatorNeuron {
    const clone = new OscillatorNeuron(
      this.id,
      0, // Frequency will be set via state
      0,
      this.amplitude
    );
    clone.restoreState(this.getState());
    return clone;
  }
}

/**
 * Compute the Kuramoto order parameter for a set of oscillators
 *
 * The order parameter r measures synchronization:
 *   r * e^(iψ) = (1/N) * Σ e^(iφⱼ)
 *
 * Where:
 *   r = magnitude (0 = desynchronized, 1 = fully synchronized)
 *   ψ = mean phase
 *
 * @param oscillators - Array of oscillator neurons
 * @returns Object containing order parameter r and mean phase psi
 */
export function computeOrderParameter(oscillators: OscillatorNeuron[]): {
  r: number;
  psi: number;
} {
  if (oscillators.length === 0) {
    return { r: 0, psi: 0 };
  }

  // Compute complex mean: (1/N) * Σ e^(iφⱼ)
  let sumCos = 0;
  let sumSin = 0;

  for (const osc of oscillators) {
    const phase = osc.getPhase();
    sumCos += Math.cos(phase);
    sumSin += Math.sin(phase);
  }

  const n = oscillators.length;
  const meanCos = sumCos / n;
  const meanSin = sumSin / n;

  // r = magnitude, psi = angle
  const r = Math.sqrt(meanCos * meanCos + meanSin * meanSin);
  const psi = Math.atan2(meanSin, meanCos);

  return { r, psi };
}

/**
 * Compute phase coherence between oscillators
 *
 * Coherence measures how consistent the phase differences are over time
 *
 * @param phases - Array of phase arrays (one per oscillator)
 * @returns Coherence value (0 = incoherent, 1 = perfectly coherent)
 */
export function computePhaseCoherence(phases: number[][]): number {
  if (phases.length < 2 || phases[0].length < 2) {
    return 0;
  }

  const numOscillators = phases.length;
  const numSamples = phases[0].length;

  // Compute mean phase difference variance
  let totalVariance = 0;
  let pairCount = 0;

  for (let i = 0; i < numOscillators; i++) {
    for (let j = i + 1; j < numOscillators; j++) {
      // Compute phase differences for this pair
      const diffs: number[] = [];
      for (let t = 0; t < numSamples; t++) {
        let diff = phases[i][t] - phases[j][t];
        // Normalize to [-π, π]
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        diffs.push(diff);
      }

      // Compute variance of phase differences
      const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const variance = diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / diffs.length;
      totalVariance += variance;
      pairCount++;
    }
  }

  // Normalize: high variance = low coherence
  const avgVariance = pairCount > 0 ? totalVariance / pairCount : 0;
  // Max variance for uniform distribution is π²/3 ≈ 3.29
  const normalizedVariance = avgVariance / (Math.PI * Math.PI / 3);
  const coherence = Math.max(0, 1 - normalizedVariance);

  return coherence;
}

/**
 * Create evenly spaced oscillators for a CPG
 *
 * @param count - Number of oscillators
 * @param frequencyHz - Oscillation frequency in Hz
 * @returns Array of oscillators with evenly distributed initial phases
 */
export function createEvenlySpacedOscillators(
  count: number,
  frequencyHz: number
): OscillatorNeuron[] {
  const oscillators: OscillatorNeuron[] = [];

  for (let i = 0; i < count; i++) {
    const phaseOffset = (2 * Math.PI * i) / count;
    oscillators.push(new OscillatorNeuron(i, frequencyHz, phaseOffset));
  }

  return oscillators;
}

/**
 * Build a ring coupling matrix for nearest-neighbor coupling
 *
 * @param count - Number of oscillators
 * @param couplingStrength - Coupling strength K
 * @returns 2D coupling matrix
 */
export function buildRingCouplingMatrix(
  count: number,
  couplingStrength: number
): number[][] {
  const matrix: number[][] = Array(count)
    .fill(null)
    .map(() => Array(count).fill(0));

  for (let i = 0; i < count; i++) {
    const prev = (i + count - 1) % count;
    const next = (i + 1) % count;
    matrix[i][prev] = couplingStrength;
    matrix[i][next] = couplingStrength;
  }

  return matrix;
}

/**
 * Build an all-to-all coupling matrix
 *
 * @param count - Number of oscillators
 * @param couplingStrength - Coupling strength K
 * @returns 2D coupling matrix
 */
export function buildAllToAllCouplingMatrix(
  count: number,
  couplingStrength: number
): number[][] {
  const matrix: number[][] = Array(count)
    .fill(null)
    .map(() => Array(count).fill(0));

  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      if (i !== j) {
        matrix[i][j] = couplingStrength / (count - 1); // Normalize
      }
    }
  }

  return matrix;
}
