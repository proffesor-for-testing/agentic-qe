/**
 * Agentic QE v3 - Time Crystal Scheduler
 * ADR-032: Kuramoto CPG oscillators for self-sustaining scheduling
 *
 * The Time Crystal Scheduler uses coupled oscillators (Central Pattern Generator)
 * to create emergent, self-sustaining test execution schedules without external timing.
 *
 * Key features:
 * - Kuramoto model for phase synchronization
 * - Winner-take-all phase selection
 * - Quality-gated phase transitions
 * - Self-repair on quality failures
 * - Crystal stability detection
 *
 * REAL TEST EXECUTION:
 * For production use, provide a TestRunner via SchedulerOptions.testRunner:
 * ```typescript
 * import { VitestTestRunner } from './test-runner';
 *
 * const scheduler = new TimeCrystalScheduler(phases, config, {
 *   testRunner: new VitestTestRunner({ cwd: '/path/to/project' })
 * });
 * ```
 *
 * Without a TestRunner, the scheduler uses MOCK MODE with deterministic fake data.
 */

import {
  CPGConfig,
  DEFAULT_CPG_CONFIG,
  PhaseTransition,
  PhaseResult,
  TestPhase,
  SchedulerState,
  SchedulerOptions,
  DEFAULT_SCHEDULER_OPTIONS,
  CrystalHealth,
  CrystalHealthStatus,
  CrystalIssue,
  TimeCrystalEvent,
} from './types';
import {
  OscillatorNeuron,
  computeOrderParameter,
  createEvenlySpacedOscillators,
  buildRingCouplingMatrix,
} from './oscillator';
import type { TestRunner, TestRunnerOptions, TestRunnerResult } from './phase-executor';

/**
 * Event emitter type for the scheduler
 */
export type TimeCrystalEventHandler = (event: TimeCrystalEvent) => void;

/**
 * Time Crystal Scheduler - CPG Controller for Test Execution
 *
 * Creates a self-sustaining schedule by using coupled oscillators that
 * naturally cycle through test phases without external timing signals.
 */
export class TimeCrystalScheduler {
  private readonly phases: TestPhase[];
  private readonly config: CPGConfig;
  private readonly options: SchedulerOptions;

  private oscillators: OscillatorNeuron[];
  private coupling: number[][];
  private currentPhase: number = 0;
  private time: number = 0;
  private phaseHistory: number[] = [];
  private running: boolean = false;
  private paused: boolean = false;

  // Phase tracking
  private phaseStartTime: Map<number, number> = new Map();
  private phaseResults: Map<number, PhaseResult[]> = new Map();
  private cycleCount: number = 0;
  private lastCycleStartTime: number = 0;
  private cycleDurations: number[] = [];

  // Event handlers
  private eventHandlers: TimeCrystalEventHandler[] = [];

  // Quality tracking
  private qualityFailures: number = 0;
  private consecutiveFailures: number = 0;

  // Test execution
  private readonly testRunner?: TestRunner;
  private readonly mockMode: boolean;

  /**
   * Create a new Time Crystal Scheduler
   *
   * @param phases - Test execution phases
   * @param config - CPG configuration (optional, uses DEFAULT_CPG_CONFIG)
   * @param options - Scheduler options (include testRunner for REAL test execution)
   */
  constructor(
    phases: TestPhase[],
    config: CPGConfig = DEFAULT_CPG_CONFIG,
    options: Partial<SchedulerOptions> = {}
  ) {
    if (phases.length === 0) {
      throw new Error('At least one test phase is required');
    }

    this.phases = phases;
    this.config = { ...config, numPhases: phases.length };
    this.options = {
      ...DEFAULT_SCHEDULER_OPTIONS,
      ...options,
      cpgConfig: this.config,
    };

    // Store test runner for real execution
    this.testRunner = options.testRunner;
    this.mockMode = !this.testRunner;

    if (this.mockMode) {
      console.warn(
        '[TimeCrystalScheduler] MOCK MODE: No TestRunner provided. ' +
          'Phase execution will use deterministic fake data. ' +
          'For production, provide a TestRunner via options.testRunner.'
      );
    }

    this.initializeOscillators();
    this.initializeCoupling();

    // Initialize phase results tracking
    for (let i = 0; i < this.phases.length; i++) {
      this.phaseResults.set(i, []);
    }
  }

  /**
   * Initialize oscillator neurons with evenly distributed phases
   */
  private initializeOscillators(): void {
    this.oscillators = createEvenlySpacedOscillators(
      this.config.numPhases,
      this.config.frequency
    );
  }

  /**
   * Initialize coupling matrix with ring topology
   */
  private initializeCoupling(): void {
    this.coupling = buildRingCouplingMatrix(
      this.config.numPhases,
      this.config.coupling
    );
  }

  /**
   * Run one integration tick
   *
   * @returns PhaseTransition if a transition occurred, null otherwise
   */
  tick(): PhaseTransition | null {
    if (!this.running || this.paused) {
      return null;
    }

    const dt = this.config.dt;
    this.time += dt;

    // 1. Compute Kuramoto coupling inputs
    const n = this.oscillators.length;
    const couplingInputs = new Array(n).fill(0);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j && this.coupling[i][j] !== 0) {
          couplingInputs[i] += this.oscillators[i].computeCouplingFrom(
            this.oscillators[j],
            this.coupling[i][j]
          );
        }
      }
    }

    // 2. Integrate oscillator dynamics
    for (let i = 0; i < n; i++) {
      this.oscillators[i].integrate(dt, couplingInputs[i]);
    }

    // 3. Winner-take-all: highest activity determines current phase
    let winner = 0;
    let maxActivity = this.oscillators[0].getActivity();

    for (let i = 1; i < n; i++) {
      const activity = this.oscillators[i].getActivity();
      if (activity > maxActivity) {
        maxActivity = activity;
        winner = i;
      }
    }

    // Emit tick event
    this.emitEvent('crystal:tick', {
      time: this.time,
      currentPhase: this.currentPhase,
      winner,
      maxActivity,
      oscillatorStates: this.oscillators.map(o => o.getState()),
    });

    // 4. Check for phase transition
    if (winner !== this.currentPhase && maxActivity >= this.config.transitionThreshold) {
      const oldPhase = this.currentPhase;
      this.currentPhase = winner;
      this.phaseHistory.push(winner);

      // Check for cycle completion (returned to phase 0)
      if (winner === 0 && oldPhase === this.phases.length - 1) {
        this.cycleCount++;
        const cycleDuration = this.time - this.lastCycleStartTime;
        this.cycleDurations.push(cycleDuration);
        this.lastCycleStartTime = this.time;

        // Keep only recent cycle durations
        if (this.cycleDurations.length > 100) {
          this.cycleDurations.shift();
        }
      }

      // Prune history
      if (this.phaseHistory.length > this.options.maxHistoryLength) {
        this.phaseHistory.shift();
      }

      const transition: PhaseTransition = {
        from: oldPhase,
        to: winner,
        timestamp: this.time,
        fromPhase: this.phases[oldPhase],
        toPhase: this.phases[winner],
      };

      // Emit transition event
      this.emitEvent('phase:transition', {
        transition,
        time: this.time,
      });

      return transition;
    }

    return null;
  }

  /**
   * Start the crystal oscillation loop
   *
   * Runs asynchronously, calling tick() and executing phases on transitions
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.paused = false;
    this.lastCycleStartTime = this.time;

    this.emitEvent('crystal:started', {
      time: this.time,
      config: this.config,
      phases: this.phases.map(p => p.name),
    });

    while (this.running) {
      if (this.paused) {
        await this.sleep(100);
        continue;
      }

      const transition = this.tick();

      if (transition) {
        // Execute the new phase
        await this.executePhase(transition.toPhase);
      }

      await this.sleep(this.config.dt);
    }
  }

  /**
   * Stop the crystal oscillation
   */
  stop(): void {
    this.running = false;
    this.paused = false;

    this.emitEvent('crystal:stopped', {
      time: this.time,
      cycleCount: this.cycleCount,
      phaseHistory: this.phaseHistory.slice(-20),
    });
  }

  /**
   * Pause the crystal (maintains state)
   */
  pause(): void {
    this.paused = true;
  }

  /**
   * Resume from pause
   */
  resume(): void {
    this.paused = false;
  }

  /**
   * Execute tests for a specific phase
   *
   * @param phase - The phase to execute
   * @returns Phase execution result
   */
  async executePhase(phase: TestPhase): Promise<PhaseResult> {
    this.phaseStartTime.set(phase.id, this.time);

    this.emitEvent('phase:started', {
      phaseId: phase.id,
      phaseName: phase.name,
      time: this.time,
    });

    let result: PhaseResult;

    if (this.options.onPhaseExecute) {
      // Use provided executor
      result = await this.options.onPhaseExecute(phase);
    } else {
      // Default executor (simulated for testing)
      result = await this.defaultPhaseExecutor(phase);
    }

    // Store result
    const results = this.phaseResults.get(phase.id) || [];
    results.push(result);
    if (results.length > 100) {
      results.shift();
    }
    this.phaseResults.set(phase.id, results);

    // Check quality thresholds
    if (!result.qualityMet) {
      this.qualityFailures++;
      this.consecutiveFailures++;

      this.emitEvent('quality:failure', {
        phaseId: phase.id,
        phaseName: phase.name,
        result,
        time: this.time,
      });

      // Invoke quality failure callback
      if (this.options.onQualityFailure) {
        await this.options.onQualityFailure(phase, result);
      }

      // Repair crystal if too many consecutive failures
      if (this.consecutiveFailures >= 3) {
        await this.repairCrystal();
      }
    } else {
      this.consecutiveFailures = 0;

      this.emitEvent('phase:completed', {
        phaseId: phase.id,
        phaseName: phase.name,
        result,
        time: this.time,
      });
    }

    // Invoke transition callback
    if (this.options.onPhaseTransition) {
      // Create a pseudo-transition for the callback
      const nextPhaseIdx = (phase.id + 1) % this.phases.length;
      const pseudoTransition: PhaseTransition = {
        from: phase.id,
        to: nextPhaseIdx,
        timestamp: this.time,
        fromPhase: phase,
        toPhase: this.phases[nextPhaseIdx],
      };
      await this.options.onPhaseTransition(pseudoTransition);
    }

    return result;
  }

  /**
   * Default phase executor
   *
   * Uses real TestRunner if provided, otherwise falls back to MOCK MODE
   * with deterministic fake data for development/testing.
   */
  private async defaultPhaseExecutor(phase: TestPhase): Promise<PhaseResult> {
    const startTime = Date.now();

    if (this.testRunner) {
      // REAL MODE: Execute actual tests via TestRunner
      return this.executeRealTests(phase, startTime);
    }

    // MOCK MODE: Use deterministic fake data (no Math.random())
    return this.executeMockTests(phase, startTime);
  }

  /**
   * Execute REAL tests using the configured TestRunner
   */
  private async executeRealTests(phase: TestPhase, startTime: number): Promise<PhaseResult> {
    if (!this.testRunner) {
      throw new Error('TestRunner not configured - cannot execute real tests');
    }

    const runnerResult = await this.testRunner.run(phase.testTypes, {
      parallelism: phase.agentConfig.parallelism,
      timeout: phase.expectedDuration * 2,
      collectCoverage: true,
      retryFailed: true,
      maxRetries: 2,
    });

    const duration = Date.now() - startTime;

    // Calculate metrics from real results
    const passRate = runnerResult.total > 0
      ? runnerResult.passed / runnerResult.total
      : 0;

    const flakyRatio = runnerResult.total > 0
      ? runnerResult.flaky / runnerResult.total
      : 0;

    return {
      phaseId: phase.id,
      phaseName: phase.name,
      passRate,
      flakyRatio,
      coverage: runnerResult.coverage,
      duration,
      testsRun: runnerResult.total,
      testsPassed: runnerResult.passed,
      testsFailed: runnerResult.failed,
      testsSkipped: runnerResult.skipped,
      qualityMet: this.evaluateQualityGates(phase, passRate, flakyRatio, runnerResult.coverage),
    };
  }

  /**
   * MOCK MODE: Generate deterministic fake test results.
   *
   * WARNING: For development/testing only. Does NOT run real tests.
   * Provides deterministic values based on phase configuration.
   */
  private async executeMockTests(phase: TestPhase, startTime: number): Promise<PhaseResult> {
    // Shortened execution time for fast iteration in mock mode
    const simulatedDuration = Math.min(phase.expectedDuration, 1000);
    await this.sleep(simulatedDuration / 10);

    const duration = Date.now() - startTime;

    // DETERMINISTIC values based on phase configuration (no Math.random())
    // Calculate base test count from phase test types
    const testTypeCounts: Record<string, number> = {
      unit: 100,
      integration: 50,
      e2e: 20,
      performance: 10,
      security: 15,
      visual: 25,
      accessibility: 30,
      contract: 40,
    };

    const baseTests = phase.testTypes.reduce(
      (sum, type) => sum + (testTypeCounts[type] || 30),
      0
    );

    // Deterministic offset based on phase ID for variety
    const deterministicOffset = (phase.id % 3) * 5;
    const testsRun = baseTests + deterministicOffset;

    // Deterministic pass rate based on test type
    let passRate: number;
    if (phase.testTypes.includes('unit')) {
      passRate = 0.98;
    } else if (phase.testTypes.includes('integration')) {
      passRate = 0.95;
    } else if (phase.testTypes.includes('e2e')) {
      passRate = 0.90;
    } else {
      passRate = 0.93;
    }

    const testsPassed = Math.floor(testsRun * passRate);
    const testsFailed = Math.floor((testsRun - testsPassed) * 0.8);
    const testsSkipped = testsRun - testsPassed - testsFailed;

    // Deterministic flaky ratio: 1 per 100 tests
    const flakyRatio = 0.01;

    // Deterministic coverage based on test type
    let coverage: number;
    if (phase.testTypes.includes('unit')) {
      coverage = 0.85;
    } else if (phase.testTypes.includes('integration')) {
      coverage = 0.75;
    } else if (phase.testTypes.includes('e2e')) {
      coverage = 0.65;
    } else {
      coverage = 0.60;
    }

    return {
      phaseId: phase.id,
      phaseName: phase.name,
      passRate,
      flakyRatio,
      coverage,
      duration,
      testsRun,
      testsPassed,
      testsFailed,
      testsSkipped,
      qualityMet: this.evaluateQualityGates(phase, passRate, flakyRatio, coverage),
    };
  }

  /**
   * Evaluate quality gates for a phase
   */
  private evaluateQualityGates(
    phase: TestPhase,
    passRate: number,
    flakyRatio: number,
    coverage: number
  ): boolean {
    const thresholds = phase.qualityThresholds;

    if (passRate < thresholds.minPassRate) {
      return false;
    }
    if (flakyRatio > thresholds.maxFlakyRatio) {
      return false;
    }
    if (coverage < thresholds.minCoverage) {
      return false;
    }

    return true;
  }

  /**
   * Repair crystal structure after quality failures
   *
   * Re-synchronizes oscillators to restore stable periodic behavior
   */
  async repairCrystal(): Promise<void> {
    this.emitEvent('crystal:repair', {
      time: this.time,
      consecutiveFailures: this.consecutiveFailures,
    });

    // Re-synchronize oscillators to their initial phase offsets
    const n = this.oscillators.length;
    for (let i = 0; i < n; i++) {
      const targetPhase = (2 * Math.PI * i) / n;
      this.oscillators[i].reset(targetPhase);
    }

    // Reset consecutive failures counter
    this.consecutiveFailures = 0;

    // Brief pause to let system stabilize
    await this.sleep(this.config.dt * 2);
  }

  /**
   * Check if crystal is exhibiting stable periodic behavior
   *
   * @returns True if the crystal is stable
   */
  isStable(): boolean {
    if (this.phaseHistory.length < this.config.numPhases * 2) {
      return false;
    }

    const period = this.config.numPhases;
    const recent = this.phaseHistory.slice(-period * 2);

    // Check if pattern repeats
    for (let i = 0; i < period; i++) {
      if (recent[i] !== recent[i + period]) {
        return false;
      }
    }

    // Also check order parameter for synchronization
    const { r } = computeOrderParameter(this.oscillators);
    if (r < 0.5) {
      return false;
    }

    return true;
  }

  /**
   * Get the current test phase
   */
  getCurrentPhase(): TestPhase {
    return this.phases[this.currentPhase];
  }

  /**
   * Get the current phase index
   */
  getCurrentPhaseIndex(): number {
    return this.currentPhase;
  }

  /**
   * Get all phases
   */
  getPhases(): readonly TestPhase[] {
    return this.phases;
  }

  /**
   * Get current simulation time
   */
  getTime(): number {
    return this.time;
  }

  /**
   * Get number of completed cycles
   */
  getCycleCount(): number {
    return this.cycleCount;
  }

  /**
   * Get the complete scheduler state
   */
  getState(): SchedulerState {
    return {
      running: this.running,
      time: this.time,
      currentPhase: this.currentPhase,
      phaseHistory: [...this.phaseHistory],
      oscillatorStates: this.oscillators.map(o => o.getState()),
      isStable: this.isStable(),
    };
  }

  /**
   * Get crystal health status
   */
  getHealth(): CrystalHealth {
    const { r: orderParameter, psi: _psi } = computeOrderParameter(this.oscillators);
    const issues: CrystalIssue[] = [];

    // Determine health status
    let status: CrystalHealthStatus = 'healthy';

    if (orderParameter < 0.3) {
      status = 'broken';
      issues.push({
        type: 'desynchronization',
        severity: 'critical',
        message: 'Oscillators are severely desynchronized',
        timestamp: this.time,
      });
    } else if (orderParameter < 0.5) {
      status = 'unstable';
      issues.push({
        type: 'desynchronization',
        severity: 'high',
        message: 'Oscillators are losing synchronization',
        timestamp: this.time,
      });
    } else if (orderParameter < 0.7) {
      status = 'degraded';
      issues.push({
        type: 'desynchronization',
        severity: 'medium',
        message: 'Oscillator synchronization is weakening',
        timestamp: this.time,
      });
    }

    // Check quality failure rate
    const totalPhaseExecutions = Array.from(this.phaseResults.values())
      .reduce((sum, results) => sum + results.length, 0);
    const phaseSuccessRate = totalPhaseExecutions > 0
      ? (totalPhaseExecutions - this.qualityFailures) / totalPhaseExecutions
      : 1;

    if (phaseSuccessRate < 0.8) {
      if (status === 'healthy') status = 'degraded';
      issues.push({
        type: 'quality_failure',
        severity: 'medium',
        message: `Phase success rate is ${(phaseSuccessRate * 100).toFixed(1)}%`,
        timestamp: this.time,
      });
    }

    // Check for stalls
    if (this.running && this.phaseHistory.length > 0) {
      const lastTransition = this.phaseHistory.length > 0
        ? this.time - (this.config.dt * 10)
        : 0;
      if (this.time - lastTransition > this.config.dt * 100) {
        issues.push({
          type: 'stall',
          severity: 'high',
          message: 'No phase transitions detected recently',
          timestamp: this.time,
          affectedPhase: this.currentPhase,
        });
      }
    }

    // Compute coherence from recent phases
    const coherence = this.computeCoherence();

    // Average cycle duration
    const averageCycleDuration = this.cycleDurations.length > 0
      ? this.cycleDurations.reduce((a, b) => a + b, 0) / this.cycleDurations.length
      : 0;

    return {
      status,
      synchronized: orderParameter > 0.7,
      orderParameter,
      coherence,
      completedCycles: this.cycleCount,
      averageCycleDuration,
      phaseSuccessRate,
      issues,
    };
  }

  /**
   * Compute phase coherence from oscillator history
   */
  private computeCoherence(): number {
    if (this.phaseHistory.length < 4) {
      return 0;
    }

    // Check if phases cycle in order
    const period = this.phases.length;
    let correctTransitions = 0;
    let totalTransitions = 0;

    for (let i = 1; i < this.phaseHistory.length; i++) {
      const prev = this.phaseHistory[i - 1];
      const curr = this.phaseHistory[i];
      const expected = (prev + 1) % period;
      if (curr === expected) {
        correctTransitions++;
      }
      totalTransitions++;
    }

    return totalTransitions > 0 ? correctTransitions / totalTransitions : 0;
  }

  /**
   * Get phase execution results
   */
  getPhaseResults(phaseId: number): readonly PhaseResult[] {
    return this.phaseResults.get(phaseId) || [];
  }

  /**
   * Register an event handler
   */
  on(handler: TimeCrystalEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Remove an event handler
   */
  off(handler: TimeCrystalEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index !== -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  /**
   * Emit an event to all handlers
   */
  private emitEvent(type: TimeCrystalEvent['type'], payload: Record<string, unknown>): void {
    const event: TimeCrystalEvent = {
      type,
      timestamp: this.time,
      payload,
    };

    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (e) {
        console.error('[TimeCrystal] Event handler error:', e);
      }
    }
  }

  /**
   * Get configuration
   */
  getConfig(): CPGConfig {
    return { ...this.config };
  }

  /**
   * Check if scheduler is in mock mode (no real test execution)
   *
   * @returns true if no TestRunner was provided and mock data is being used
   */
  isMockMode(): boolean {
    return this.mockMode;
  }

  /**
   * Get the configured test runner, if any
   */
  getTestRunner(): TestRunner | undefined {
    return this.testRunner;
  }

  /**
   * Update coupling strength
   */
  setCouplingStrength(strength: number): void {
    for (let i = 0; i < this.coupling.length; i++) {
      for (let j = 0; j < this.coupling[i].length; j++) {
        if (this.coupling[i][j] !== 0) {
          this.coupling[i][j] = strength;
        }
      }
    }
  }

  /**
   * Get the oscillator order parameter (synchronization measure)
   */
  getOrderParameter(): number {
    const { r } = computeOrderParameter(this.oscillators);
    return r;
  }

  /**
   * Force a phase transition (for testing/debugging)
   */
  forcePhaseTransition(targetPhase: number): void {
    if (targetPhase < 0 || targetPhase >= this.phases.length) {
      throw new Error(`Invalid phase: ${targetPhase}`);
    }

    const oldPhase = this.currentPhase;
    this.currentPhase = targetPhase;
    this.phaseHistory.push(targetPhase);

    // Reset oscillators to align with forced phase
    const n = this.oscillators.length;
    for (let i = 0; i < n; i++) {
      const offset = ((i - targetPhase + n) % n) * (2 * Math.PI / n);
      this.oscillators[i].reset(offset);
    }

    this.emitEvent('phase:transition', {
      transition: {
        from: oldPhase,
        to: targetPhase,
        timestamp: this.time,
        fromPhase: this.phases[oldPhase],
        toPhase: this.phases[targetPhase],
      },
      time: this.time,
      forced: true,
    });
  }

  /**
   * Run for a specified number of ticks (for testing)
   *
   * @param ticks - Number of ticks to run
   * @returns Array of phase transitions that occurred
   */
  runTicks(ticks: number): PhaseTransition[] {
    const wasRunning = this.running;
    this.running = true;
    this.paused = false;

    const transitions: PhaseTransition[] = [];

    for (let i = 0; i < ticks; i++) {
      const transition = this.tick();
      if (transition) {
        transitions.push(transition);
      }
    }

    if (!wasRunning) {
      this.running = false;
    }

    return transitions;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Check if scheduler is paused
   */
  isPaused(): boolean {
    return this.paused;
  }
}

/**
 * Create a Time Crystal Scheduler with default test phases
 */
export function createDefaultScheduler(
  config: CPGConfig = DEFAULT_CPG_CONFIG,
  options: Partial<SchedulerOptions> = {}
): TimeCrystalScheduler {
  // Import default phases - avoiding circular dependency
  const defaultPhases: TestPhase[] = [
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

  return new TimeCrystalScheduler(defaultPhases, config, options);
}
