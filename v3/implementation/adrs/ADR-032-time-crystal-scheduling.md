# ADR-032: Time Crystal Scheduling

**Status:** Accepted
**Date:** 2026-01-10
**Decision Makers:** Architecture Team
**Source:** RuVector MinCut Analysis (time_crystal.rs)

---

## Context

Current v3 AQE test scheduling relies on external triggers:
- CI/CD webhooks
- Cron-based schedules
- Manual execution requests
- Event-driven pipelines

This approach has limitations:
1. **External dependency**: Scheduling requires external orchestrators
2. **No self-organization**: Test suites don't adapt scheduling to quality signals
3. **Static timing**: No phase-aware prioritization
4. **Fragile coordination**: Multi-agent coordination depends on message passing

RuVector's Time Crystal CPG (Central Pattern Generator) demonstrates a powerful pattern:
> Time crystals exhibit periodic self-sustaining patterns. The SNN equivalent is a Central Pattern Generator - coupled oscillators that produce rhythmic output without external timing.

This creates **emergent scheduling** - the system doesn't need external cron jobs because it *generates its own periodic patterns*.

### The Time Crystal Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    TIME CRYSTAL CPG                         │
│                                                             │
│   Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 0  │
│     │           │           │           │           │       │
│   [Unit]    [Integ]     [E2E]       [Perf]      [Unit]     │
│   Tests      Tests      Tests       Tests        Tests      │
│                                                             │
│   Self-sustaining oscillation without external timer        │
└─────────────────────────────────────────────────────────────┘
```

---

## Decision

**Implement time crystal scheduling using coupled oscillator dynamics for self-organizing test execution phases.**

### Core Components

#### 1. Test Execution Phases

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

#### 2. Oscillator Configuration

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

#### 3. Oscillator Neuron

```typescript
export class OscillatorNeuron {
  private id: number;
  private phase: number;          // Current phase (0 to 2π)
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

  /** Kuramoto-like dynamics: dφ/dt = ω + K*sin(φ_coupled - φ) */
  integrate(dt: number, couplingInput: number): void {
    const dPhase = this.omega + couplingInput;
    this.phase += dPhase * dt;

    // Keep phase in [0, 2π]
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

#### 4. Time Crystal CPG Controller

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
        console.log(`[TimeCrystal] Phase transition: ${transition.fromPhase.name} → ${transition.toPhase.name}`);
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

#### 5. Default Test Phases

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

## Integration with Swarm Coordination

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

## Success Metrics

- [ ] Self-sustaining oscillation without external timer
- [ ] 4-phase test execution cycle operational
- [ ] Phase transition detection <100ms
- [ ] Quality-gated phase progression
- [ ] Crystal stability detection
- [ ] 50+ unit tests

---

## References

- [ruvector-mincut/src/snn/time_crystal.rs](https://github.com/ruvnet/ruvector/blob/main/crates/ruvector-mincut/src/snn/time_crystal.rs)
- [Kuramoto model](https://en.wikipedia.org/wiki/Kuramoto_model)
- [Central Pattern Generators](https://en.wikipedia.org/wiki/Central_pattern_generator)
- [Time Crystals](https://en.wikipedia.org/wiki/Time_crystal)
