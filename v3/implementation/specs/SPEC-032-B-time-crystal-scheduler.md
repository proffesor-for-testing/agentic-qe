# SPEC-032-B: Time Crystal Scheduler

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-032-B |
| **Parent ADR** | [ADR-032](../adrs/ADR-032-time-crystal-scheduling.md) |
| **Version** | 1.0 |
| **Status** | Draft |
| **Last Updated** | 2026-01-20 |
| **Author** | Architecture Team |

---

## Overview

This specification defines the Time Crystal Scheduler that orchestrates self-sustaining test phase oscillation using coupled oscillator dynamics. It implements the Central Pattern Generator (CPG) pattern for emergent scheduling.

---

## Phase Transition Types

```typescript
export interface PhaseTransition {
  from: number;
  to: number;
  timestamp: number;
  fromPhase: TestPhase;
  toPhase: TestPhase;
}

export interface PhaseResult {
  phaseId: number;
  passRate: number;
  flakyRatio: number;
  coverage: number;
  duration: number;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
}
```

---

## TimeCrystalScheduler Implementation

```typescript
export class TimeCrystalScheduler {
  private oscillators: OscillatorNeuron[];
  private coupling: number[][];
  private phases: TestPhase[];
  private currentPhase: number = 0;
  private config: CPGConfig;
  private time: number = 0;
  private phaseHistory: number[] = [];
  private running: boolean = false;

  constructor(phases: TestPhase[], config: CPGConfig = DEFAULT_CPG_CONFIG) {
    this.phases = phases;
    this.config = config;
    this.initializeOscillators();
    this.initializeCoupling();
  }

  private initializeOscillators(): void {
    const n = this.config.numPhases;
    this.oscillators = [];

    for (let i = 0; i < n; i++) {
      const phaseOffset = (2 * Math.PI * i) / n;
      this.oscillators.push(
        new OscillatorNeuron(i, this.config.frequency, phaseOffset)
      );
    }
  }

  private initializeCoupling(): void {
    const n = this.config.numPhases;
    this.coupling = Array(n).fill(null).map(() => Array(n).fill(0));

    // Nearest-neighbor coupling (ring topology)
    for (let i = 0; i < n; i++) {
      const prev = (i + n - 1) % n;
      const next = (i + 1) % n;
      this.coupling[i][prev] = this.config.coupling;
      this.coupling[i][next] = this.config.coupling;
    }
  }

  /** Run one integration tick - returns new phase if transition occurred */
  tick(): PhaseTransition | null {
    const dt = this.config.dt;
    this.time += dt;

    // 1. Compute coupling inputs (Kuramoto model)
    const n = this.oscillators.length;
    const couplingInputs = new Array(n).fill(0);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j && this.coupling[i][j] !== 0) {
          const phaseDiff = this.oscillators[j].getPhase() - this.oscillators[i].getPhase();
          couplingInputs[i] += this.coupling[i][j] * Math.sin(phaseDiff);
        }
      }
    }

    // 2. Integrate oscillator dynamics
    for (let i = 0; i < n; i++) {
      this.oscillators[i].integrate(dt, couplingInputs[i]);
    }

    // 3. Winner-take-all: highest activity determines phase
    let winner = 0;
    let maxActivity = this.oscillators[0].getActivity();

    for (let i = 1; i < n; i++) {
      const activity = this.oscillators[i].getActivity();
      if (activity > maxActivity) {
        maxActivity = activity;
        winner = i;
      }
    }

    // 4. Check for phase transition
    if (winner !== this.currentPhase) {
      const oldPhase = this.currentPhase;
      this.currentPhase = winner;
      this.phaseHistory.push(winner);

      // Prune history
      if (this.phaseHistory.length > 1000) {
        this.phaseHistory.shift();
      }

      return {
        from: oldPhase,
        to: winner,
        timestamp: this.time,
        fromPhase: this.phases[oldPhase],
        toPhase: this.phases[winner],
      };
    }

    return null;
  }

  /** Start the crystal oscillation loop */
  async start(): Promise<void> {
    this.running = true;
    console.log('[TimeCrystal] Starting self-sustaining scheduling');

    while (this.running) {
      const transition = this.tick();

      if (transition) {
        console.log(`[TimeCrystal] Phase transition: ${transition.fromPhase.name} -> ${transition.toPhase.name}`);
        await this.executePhase(transition.toPhase);
      }

      await this.sleep(this.config.dt);
    }
  }

  /** Execute tests for a specific phase */
  private async executePhase(phase: TestPhase): Promise<PhaseResult> {
    console.log(`[TimeCrystal] Executing phase ${phase.id}: ${phase.name}`);

    const executor = new PhaseExecutor(phase);
    const result = await executor.run();

    // Verify quality thresholds
    if (result.passRate < phase.qualityThresholds.minPassRate) {
      console.warn(`[TimeCrystal] Phase ${phase.name} failed quality gate`);
      this.repairCrystal();
    }

    return result;
  }

  /** Repair crystal structure after quality failure */
  private repairCrystal(): void {
    console.log('[TimeCrystal] Repairing crystal structure');

    // Re-synchronize oscillators
    const n = this.oscillators.length;
    for (let i = 0; i < n; i++) {
      const targetPhase = (2 * Math.PI * i) / n;
      this.oscillators[i].reset(targetPhase);
    }
  }

  /** Check if crystal is exhibiting stable periodic behavior */
  isStable(): boolean {
    if (this.phaseHistory.length < this.config.numPhases * 2) {
      return false;
    }

    const period = this.config.numPhases;
    const recent = this.phaseHistory.slice(-period * 2);

    for (let i = 0; i < period; i++) {
      if (recent[i] !== recent[i + period]) {
        return false;
      }
    }

    return true;
  }

  stop(): void {
    this.running = false;
  }

  getCurrentPhase(): TestPhase {
    return this.phases[this.currentPhase];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## Swarm Integration

```typescript
// In hierarchical-coordinator.ts
import { TimeCrystalScheduler, DEFAULT_TEST_PHASES } from '../time-crystal';

export class HierarchicalCoordinator {
  private scheduler: TimeCrystalScheduler;

  async initialize(): Promise<void> {
    // Start time crystal scheduling
    this.scheduler = new TimeCrystalScheduler(DEFAULT_TEST_PHASES);

    // Run in background
    this.scheduler.start().catch(err => {
      console.error('[Coordinator] Time crystal error:', err);
    });
  }

  /** Called when phase changes - coordinate agent swarm */
  async onPhaseTransition(transition: PhaseTransition): Promise<void> {
    const phase = transition.toPhase;

    // Spawn agents for this phase
    for (const agentType of phase.agentConfig.agents) {
      await this.spawnAgent(agentType, {
        phase: phase.id,
        testTypes: phase.testTypes,
        parallelism: phase.agentConfig.parallelism,
      });
    }
  }
}
```

---

## Implementation Plan

### Phase 1: Core Oscillator (Days 1-2)
```
v3/src/time-crystal/
├── index.ts
├── types.ts
├── oscillator.ts           # OscillatorNeuron
├── cpg-controller.ts       # TimeCrystalScheduler
└── default-phases.ts       # DEFAULT_TEST_PHASES
```

### Phase 2: Phase Execution (Days 3-4)
```
├── phase-executor.ts       # Execute tests for a phase
├── quality-gates.ts        # Phase quality thresholds
└── crystal-repair.ts       # Re-synchronization logic
```

### Phase 3: Integration (Day 5)
- Integrate with hierarchical-coordinator
- Add to swarm topology options
- Create MCP tool for phase status

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-032-B-001 | phases array must not be empty | Error |
| SPEC-032-B-002 | phases.length must equal numPhases | Error |
| SPEC-032-B-003 | Phase IDs must be sequential from 0 | Warning |

---

## Related Specifications

| Spec ID | Title | Relationship |
|---------|-------|--------------|
| SPEC-032-A | Oscillator Neuron | Core component |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-20 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-032-time-crystal-scheduling.md)
- [Central Pattern Generators](https://en.wikipedia.org/wiki/Central_pattern_generator)
- [Time Crystals](https://en.wikipedia.org/wiki/Time_crystal)
