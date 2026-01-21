# SPEC-032-A: Oscillator Neuron

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-032-A |
| **Parent ADR** | [ADR-032](../adrs/ADR-032-time-crystal-scheduling.md) |
| **Version** | 1.0 |
| **Status** | Draft |
| **Last Updated** | 2026-01-20 |
| **Author** | Architecture Team |

---

## Overview

This specification defines the Oscillator Neuron component that implements Kuramoto-like dynamics for self-sustaining phase oscillation. Each neuron represents a test phase and oscillates with coupling to adjacent phases.

---

## Configuration

```typescript
export interface CPGConfig {
  /** Number of phases in the crystal */
  numPhases: number;

  /** Oscillation frequency (Hz) - how fast phases cycle */
  frequency: number;

  /** Coupling strength between adjacent phases */
  coupling: number;

  /** Stability threshold for phase transitions */
  stabilityThreshold: number;

  /** Time step for simulation (ms) */
  dt: number;

  /** Phase transition threshold */
  transitionThreshold: number;
}

export const DEFAULT_CPG_CONFIG: CPGConfig = {
  numPhases: 4,
  frequency: 0.1,        // 0.1 Hz = 10s per cycle in demo mode
  coupling: 0.3,
  stabilityThreshold: 0.1,
  dt: 100,               // 100ms time steps
  transitionThreshold: 0.8,
};

export const PRODUCTION_CPG_CONFIG: CPGConfig = {
  numPhases: 4,
  frequency: 0.001,      // 0.001 Hz = ~17 min per full cycle
  coupling: 0.3,
  stabilityThreshold: 0.1,
  dt: 1000,              // 1s time steps
  transitionThreshold: 0.8,
};
```

---

## Test Phase Types

```typescript
export interface TestPhase {
  /** Phase identifier (0 to n-1) */
  id: number;

  /** Phase name */
  name: string;

  /** Test types executed in this phase */
  testTypes: TestType[];

  /** Expected duration (ms) */
  expectedDuration: number;

  /** Quality thresholds for phase completion */
  qualityThresholds: PhaseThresholds;

  /** Phase-specific agent configuration */
  agentConfig: PhaseAgentConfig;
}

export type TestType =
  | 'unit'
  | 'integration'
  | 'e2e'
  | 'performance'
  | 'security'
  | 'visual'
  | 'accessibility'
  | 'contract';

export interface PhaseThresholds {
  /** Minimum pass rate to proceed */
  minPassRate: number;

  /** Maximum flaky test tolerance */
  maxFlakyRatio: number;

  /** Coverage requirement */
  minCoverage: number;
}
```

---

## OscillatorNeuron Implementation

```typescript
export class OscillatorNeuron {
  private id: number;
  private phase: number;          // Current phase (0 to 2*PI)
  private omega: number;          // Natural frequency (rad/ms)
  private amplitude: number;
  private activity: number;

  constructor(id: number, frequencyHz: number, phaseOffset: number) {
    this.id = id;
    this.omega = 2 * Math.PI * frequencyHz / 1000;
    this.phase = phaseOffset;
    this.amplitude = 1.0;
    this.activity = Math.cos(phaseOffset);
  }

  /** Kuramoto-like dynamics: d_phi/dt = omega + K*sin(phi_coupled - phi) */
  integrate(dt: number, couplingInput: number): void {
    const dPhase = this.omega + couplingInput;
    this.phase += dPhase * dt;

    // Keep phase in [0, 2*PI]
    while (this.phase >= 2 * Math.PI) {
      this.phase -= 2 * Math.PI;
    }
    while (this.phase < 0) {
      this.phase += 2 * Math.PI;
    }

    // Update activity
    this.activity = this.amplitude * Math.cos(this.phase);
  }

  getPhase(): number { return this.phase; }
  getActivity(): number { return this.activity; }
  reset(phase: number): void {
    this.phase = phase;
    this.activity = Math.cos(phase);
  }
}
```

---

## Default Test Phases

```typescript
export const DEFAULT_TEST_PHASES: TestPhase[] = [
  {
    id: 0,
    name: 'Unit',
    testTypes: ['unit'],
    expectedDuration: 30000,
    qualityThresholds: {
      minPassRate: 0.99,
      maxFlakyRatio: 0.01,
      minCoverage: 0.80,
    },
    agentConfig: {
      agents: ['qe-test-executor'],
      parallelism: 8,
    },
  },
  {
    id: 1,
    name: 'Integration',
    testTypes: ['integration', 'contract'],
    expectedDuration: 120000,
    qualityThresholds: {
      minPassRate: 0.95,
      maxFlakyRatio: 0.05,
      minCoverage: 0.70,
    },
    agentConfig: {
      agents: ['qe-test-executor', 'qe-api-contract-validator'],
      parallelism: 4,
    },
  },
  {
    id: 2,
    name: 'E2E',
    testTypes: ['e2e', 'visual', 'accessibility'],
    expectedDuration: 300000,
    qualityThresholds: {
      minPassRate: 0.90,
      maxFlakyRatio: 0.10,
      minCoverage: 0.60,
    },
    agentConfig: {
      agents: ['qe-test-executor', 'qe-visual-tester'],
      parallelism: 2,
    },
  },
  {
    id: 3,
    name: 'Performance',
    testTypes: ['performance', 'security'],
    expectedDuration: 600000,
    qualityThresholds: {
      minPassRate: 0.95,
      maxFlakyRatio: 0.02,
      minCoverage: 0.50,
    },
    agentConfig: {
      agents: ['qe-performance-tester', 'qe-security-scanner'],
      parallelism: 1,
    },
  },
];
```

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-032-A-001 | frequency must be > 0 | Error |
| SPEC-032-A-002 | numPhases must be >= 2 | Error |
| SPEC-032-A-003 | coupling must be 0-1 | Warning |
| SPEC-032-A-004 | dt must be > 0 | Error |

---

## Related Specifications

| Spec ID | Title | Relationship |
|---------|-------|--------------|
| SPEC-032-B | Time Crystal Scheduler | Uses oscillators |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-20 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-032-time-crystal-scheduling.md)
- [Kuramoto model](https://en.wikipedia.org/wiki/Kuramoto_model)
