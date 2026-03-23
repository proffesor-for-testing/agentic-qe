/**
 * Agentic QE v3 - Time Crystal CI/CD Coordination Controller
 * ADR-047: MinCut Self-Organizing QE Integration - Phase 4
 * ADR-032: Kuramoto CPG oscillators for self-sustaining scheduling
 */

import { v4 as uuidv4 } from 'uuid';
import { DomainEvent } from '../../shared/types';
import { EventBus } from '../../kernel/interfaces';
import type { UnifiedMemoryManager } from '../../kernel/unified-memory.js';
import type { StrangeLoopController } from './strange-loop';
import type { MinCutHealthMonitor } from './mincut-health-monitor';
import type { TestFailureCausalGraph } from './causal-discovery';
import {
  KuramotoCPG,
  createKuramotoCPG,
  type CPGPhaseTransition,
  DEFAULT_CPG_CONFIG,
} from './kuramoto-cpg';

// Re-export everything from sub-modules so barrel imports remain unchanged
export {
  TIME_CRYSTAL_SOURCE,
  type TemporalAttractor,
  type PhaseState,
  type ExecutionMetrics,
  type TimeCrystalPhase,
  type TemporalDependency,
  type CrystalLattice,
  type LatticeNode,
  type CrystalObservation,
  type CrystalAnomaly,
  type ScheduleOptimization,
  type StabilizationAction,
  type PhaseExecutor,
  type TimeCrystalConfig,
  type TimeCrystalEventType,
  DEFAULT_TIME_CRYSTAL_CONFIG,
} from './time-crystal-types';

export { DefaultPhaseExecutor, createDefaultPhaseExecutor } from './phase-executor';

import {
  TIME_CRYSTAL_SOURCE,
  DEFAULT_TIME_CRYSTAL_CONFIG,
  DEFAULT_CRYSTAL_PHASES,
  type TemporalAttractor,
  type ExecutionMetrics,
  type TimeCrystalPhase,
  type TemporalDependency,
  type CrystalLattice,
  type LatticeNode,
  type CrystalObservation,
  type ScheduleOptimization,
  type StabilizationAction,
  type PhaseExecutor,
  type TimeCrystalConfig,
  type TimeCrystalEventType,
} from './time-crystal-types';
import { DefaultPhaseExecutor } from './phase-executor';
import {
  initializeTimeCrystalDb,
  persistTimeCrystalToKv,
  loadTimeCrystalFromKv,
  PERSIST_INTERVAL,
} from './time-crystal-persistence';
import {
  collectMetrics,
  detectAttractor,
  detectAnomalies,
  predictPhase,
  determineStabilization,
} from './time-crystal-analysis';
import {
  determineOptimization,
  rebuildLatticeFromCausalGraph,
} from './time-crystal-scheduling';

/**
 * Time Crystal Controller - Orchestrates temporal CI/CD coordination
 *
 * Implements the observe -> predict -> optimize -> stabilize cycle
 * for CI/CD pipeline optimization based on temporal patterns.
 */
export class TimeCrystalController {
  private readonly config: TimeCrystalConfig;
  private readonly eventBus?: EventBus;
  private readonly strangeLoop?: StrangeLoopController;
  private readonly healthMonitor?: MinCutHealthMonitor;
  private readonly causalGraph?: TestFailureCausalGraph;

  private readonly kuramotoCPG: KuramotoCPG;
  private readonly phaseExecutor: PhaseExecutor;
  private cpgStartPromise: Promise<void> | null = null;

  private db: UnifiedMemoryManager | null = null;
  private persistCount = 0;

  private running = false;
  private observationTimer: NodeJS.Timeout | null = null;
  private observations: CrystalObservation[] = [];
  private phases: Map<string, TimeCrystalPhase> = new Map();
  private lattice: CrystalLattice;
  private currentAttractor: TemporalAttractor = 'stable';
  private metricsHistory: ExecutionMetrics[] = [];

  private stats = {
    totalObservations: 0,
    totalOptimizations: 0,
    totalStabilizations: 0,
    attractorTransitions: 0,
    anomaliesDetected: 0,
    phasesCompleted: 0,
    cpgTransitions: 0,
    cpgPhasesExecuted: 0,
    cpgQualityFailures: 0,
  };

  constructor(
    config: Partial<TimeCrystalConfig> = {},
    eventBus?: EventBus,
    strangeLoop?: StrangeLoopController,
    healthMonitor?: MinCutHealthMonitor,
    causalGraph?: TestFailureCausalGraph,
    phaseExecutor?: PhaseExecutor
  ) {
    this.config = { ...DEFAULT_TIME_CRYSTAL_CONFIG, ...config };
    this.eventBus = eventBus;
    this.strangeLoop = strangeLoop;
    this.healthMonitor = healthMonitor;
    this.causalGraph = causalGraph;
    this.phaseExecutor = phaseExecutor ?? new DefaultPhaseExecutor('time-crystal-executor');

    this.kuramotoCPG = createKuramotoCPG(
      this.config.cpgPhases,
      this.config.cpgConfig ? { ...DEFAULT_CPG_CONFIG, ...this.config.cpgConfig } : undefined
    );

    this.kuramotoCPG.setTransitionHandler(async (transition) => {
      await this.handleCPGTransition(transition);
    });

    this.kuramotoCPG.setTickHandler((state) => {
      this.emitEvent('crystal.cpg.tick', {
        time: state.time,
        currentPhase: state.currentPhase,
        orderParameter: state.orderParameter,
      });
    });

    this.lattice = {
      nodes: new Map(),
      dependencies: [],
      executionOrder: [],
      parallelGroups: [],
      lastOptimized: new Date(),
    };

    this.initializeDefaultPhases();
  }

  private async handleCPGTransition(transition: CPGPhaseTransition): Promise<void> {
    this.stats.cpgTransitions++;

    await this.emitEvent('crystal.cpg.transition', {
      from: transition.from,
      to: transition.to,
      fromPhase: transition.fromPhase.name,
      toPhase: transition.toPhase.name,
      orderParameter: transition.orderParameter,
      timestamp: transition.timestamp,
    });

    if (this.phaseExecutor.isReady()) {
      this.stats.cpgPhasesExecuted++;
      const result = await this.phaseExecutor.execute(transition.toPhase);
      this.kuramotoCPG.recordPhaseResult(result);

      if (!result.qualityMet) this.stats.cpgQualityFailures++;

      const crystalPhase = this.phases.get(transition.toPhase.name.toLowerCase() + '-tests');
      if (crystalPhase) {
        crystalPhase.executionCount++;
        crystalPhase.successRate =
          (crystalPhase.successRate * (crystalPhase.executionCount - 1) + (result.qualityMet ? 1 : 0)) /
          crystalPhase.executionCount;
        crystalPhase.avgActualDuration =
          (crystalPhase.avgActualDuration * (crystalPhase.executionCount - 1) + result.duration) /
          crystalPhase.executionCount;
      }

      await this.emitEvent('crystal.phase.completed', {
        phaseId: result.phaseId, phaseName: result.phaseName,
        passRate: result.passRate, qualityMet: result.qualityMet,
        duration: result.duration, testsRun: result.testsRun,
      });
    }
  }

  // -- Lifecycle --------------------------------------------------------------

  start(): void {
    if (this.running || !this.config.enabled) return;
    this.running = true;

    if (this.config.useCPGScheduling) {
      this.cpgStartPromise = this.kuramotoCPG.start();
      this.emitEvent('crystal.cpg.started', {
        config: this.kuramotoCPG.getConfig(),
        phases: this.kuramotoCPG.getPhases().map((p) => p.name),
      });
    }

    this.observationTimer = setInterval(() => this.runCycle(), this.config.observationIntervalMs);
    this.runCycle();
  }

  stop(): void {
    if (this.config.useCPGScheduling && this.kuramotoCPG.isRunning()) {
      this.kuramotoCPG.stop();
      this.emitEvent('crystal.cpg.stopped', { stats: this.kuramotoCPG.getStats() });
    }
    if (this.observationTimer) {
      clearInterval(this.observationTimer);
      this.observationTimer = null;
    }
    this.running = false;
    this.cpgStartPromise = null;
  }

  pauseCPG(): void { if (this.config.useCPGScheduling) this.kuramotoCPG.pause(); }
  resumeCPG(): void { if (this.config.useCPGScheduling) this.kuramotoCPG.resume(); }
  getCPG(): KuramotoCPG { return this.kuramotoCPG; }
  getPhaseExecutor(): PhaseExecutor { return this.phaseExecutor; }
  isRunning(): boolean { return this.running; }

  // -- Main Cycle -------------------------------------------------------------

  async runCycle(): Promise<CrystalObservation> {
    const observation = await this.observe();
    this.observations.push(observation);
    this.stats.totalObservations++;
    while (this.observations.length > 1000) this.observations.shift();

    this.predictPhase();

    if (this.config.autoOptimize) {
      const optimization = await this.optimize();
      if (optimization.type !== 'no_change') {
        this.stats.totalOptimizations++;
        await this.emitEvent('crystal.optimization.applied', { optimization });
      }
    }

    if (this.config.autoStabilize && observation.attractor !== 'stable') {
      const stabilization = await this.stabilize();
      if (stabilization.type !== 'no_action') {
        this.stats.totalStabilizations++;
        await this.emitEvent('crystal.stabilization.applied', { stabilization });
      }
    }

    await this.emitEvent('crystal.observation', { observation });
    this.maybePeristToKv();
    return observation;
  }

  // -- Observe ----------------------------------------------------------------

  async observe(): Promise<CrystalObservation> {
    const metrics = collectMetrics(this.observations, this.config, this.healthMonitor, this.strangeLoop);
    this.metricsHistory.push(metrics);
    while (this.metricsHistory.length > 500) this.metricsHistory.shift();

    const attractor = detectAttractor(metrics, this.config, this.healthMonitor);
    if (attractor !== this.currentAttractor) {
      const prev = this.currentAttractor;
      this.currentAttractor = attractor;
      this.stats.attractorTransitions++;
      await this.emitEvent('crystal.attractor.changed', { from: prev, to: attractor });
    }

    const activePhases = this.identifyActivePhases();
    const anomalies = detectAnomalies(metrics, this.metricsHistory, this.phases, this.config, this.causalGraph);
    for (const anomaly of anomalies) {
      this.stats.anomaliesDetected++;
      await this.emitEvent('crystal.anomaly.detected', { anomaly });
    }

    const { phase: predictedNextPhase, confidence: predictionConfidence } =
      predictPhase(this.observations, this.config.minObservationsForPattern);

    return {
      id: uuidv4(), timestamp: new Date(), attractor, metrics, activePhases,
      anomalies, predictedNextPhase, predictionConfidence,
    };
  }

  private identifyActivePhases(): string[] {
    const result: string[] = [];
    for (const [id, phase] of Array.from(this.phases.entries())) {
      if (phase.state === 'active' || phase.state === 'activating') result.push(id);
    }
    return result;
  }

  // -- Predict / Optimize / Stabilize -----------------------------------------

  predictPhase(): { phase: string | undefined; confidence: number } {
    return predictPhase(this.observations, this.config.minObservationsForPattern);
  }

  async optimize(): Promise<ScheduleOptimization> {
    return determineOptimization(this.lattice, this.observations, this.causalGraph, this.config.maxParallelGroups);
  }

  async stabilize(): Promise<StabilizationAction> {
    return determineStabilization(this.observations, this.causalGraph);
  }

  // -- Phase Management -------------------------------------------------------

  private initializeDefaultPhases(): void {
    for (const phaseConfig of DEFAULT_CRYSTAL_PHASES) {
      this.phases.set(phaseConfig.id, {
        ...phaseConfig,
        state: 'dormant',
        successRate: 1,
        avgActualDuration: phaseConfig.expectedDuration,
        executionCount: 0,
      });
    }
  }

  activatePhase(phaseId: string): boolean {
    const phase = this.phases.get(phaseId);
    if (!phase || phase.state !== 'dormant') return false;
    phase.state = 'activating';
    phase.lastActivation = new Date();
    this.emitEvent('crystal.phase.activated', { phaseId, phase });
    setTimeout(() => { if (phase.state === 'activating') phase.state = 'active'; }, 1000);
    return true;
  }

  completePhase(phaseId: string, success: boolean, actualDuration: number): boolean {
    const phase = this.phases.get(phaseId);
    if (!phase || phase.state !== 'active') return false;
    phase.state = 'completing';
    phase.executionCount++;
    phase.avgActualDuration = (phase.avgActualDuration * (phase.executionCount - 1) + actualDuration) / phase.executionCount;
    phase.successRate = (phase.successRate * (phase.executionCount - 1) + (success ? 1 : 0)) / phase.executionCount;
    this.stats.phasesCompleted++;
    this.emitEvent('crystal.phase.completed', { phaseId, success, actualDuration, successRate: phase.successRate });
    setTimeout(() => {
      if (phase.state === 'completing') {
        phase.state = 'cooldown';
        setTimeout(() => { if (phase.state === 'cooldown') phase.state = 'dormant'; }, 5000);
      }
    }, 1000);
    return true;
  }

  getPhase(phaseId: string): TimeCrystalPhase | undefined { return this.phases.get(phaseId); }
  getAllPhases(): TimeCrystalPhase[] { return Array.from(this.phases.values()); }

  // -- Lattice Management -----------------------------------------------------

  addLatticeNode(node: LatticeNode): void { this.lattice.nodes.set(node.id, node); }
  addDependency(dependency: TemporalDependency): void { this.lattice.dependencies.push(dependency); }
  getLattice(): CrystalLattice { return this.lattice; }

  rebuildLatticeFromTestFailureCausalGraph(): void {
    if (!this.causalGraph) return;
    rebuildLatticeFromCausalGraph(this.lattice, this.causalGraph, this.config.maxParallelGroups);
  }

  // -- Status & Statistics ----------------------------------------------------

  getCurrentAttractor(): TemporalAttractor { return this.currentAttractor; }
  getObservations(limit: number = 10): CrystalObservation[] { return this.observations.slice(-limit); }
  getStats(): typeof this.stats { return { ...this.stats }; }
  getConfig(): TimeCrystalConfig { return { ...this.config }; }

  // -- kv_store Persistence ---------------------------------------------------

  async initializeDb(): Promise<void> {
    this.db = await initializeTimeCrystalDb();
    if (this.db) {
      const snapshot = await loadTimeCrystalFromKv(this.db);
      if (snapshot) this.applySnapshot(snapshot);
    }
  }

  private applySnapshot(snapshot: {
    observations?: CrystalObservation[];
    phases?: [string, TimeCrystalPhase][];
    metricsHistory?: ExecutionMetrics[];
    currentAttractor?: TemporalAttractor;
    stats?: Record<string, unknown>;
  }): void {
    if (snapshot.observations?.length) this.observations = snapshot.observations;
    if (snapshot.phases?.length) {
      for (const [key, phase] of snapshot.phases) this.phases.set(key, phase);
    }
    if (snapshot.metricsHistory?.length) this.metricsHistory = snapshot.metricsHistory;
    if (snapshot.currentAttractor) this.currentAttractor = snapshot.currentAttractor;
    if (snapshot.stats) Object.assign(this.stats, snapshot.stats);
  }

  private maybePeristToKv(): void {
    this.persistCount++;
    if (this.persistCount >= PERSIST_INTERVAL) {
      this.persistCount = 0;
      if (this.db) {
        persistTimeCrystalToKv(
          this.db, this.observations, this.phases,
          this.metricsHistory, this.currentAttractor, this.stats,
        ).catch(() => {});
      }
    }
  }

  // -- Event Emission ---------------------------------------------------------

  private async emitEvent(type: TimeCrystalEventType, payload: Record<string, unknown>): Promise<void> {
    if (!this.eventBus) return;
    const event: DomainEvent = {
      id: uuidv4(), type, source: TIME_CRYSTAL_SOURCE,
      timestamp: new Date(), correlationId: uuidv4(),
      payload: { attractor: this.currentAttractor, ...payload },
    };
    try { await this.eventBus.publish(event); }
    catch (error) { console.error('Failed to publish Time Crystal event:', error); }
  }
}

/** Create a Time Crystal controller */
export function createTimeCrystalController(
  config?: Partial<TimeCrystalConfig>,
  eventBus?: EventBus,
  strangeLoop?: StrangeLoopController,
  healthMonitor?: MinCutHealthMonitor,
  causalGraph?: TestFailureCausalGraph,
  phaseExecutor?: PhaseExecutor
): TimeCrystalController {
  return new TimeCrystalController(config, eventBus, strangeLoop, healthMonitor, causalGraph, phaseExecutor);
}
