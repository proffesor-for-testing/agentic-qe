/**
 * SleepCycle - State machine for learning cycle phases
 *
 * Implements a sleep-inspired learning cycle with phases:
 * - N1_CAPTURE: Capture recent experiences (light sleep)
 * - N2_PROCESS: Process and cluster patterns (deeper sleep)
 * - N3_CONSOLIDATE: Consolidate into long-term memory (deep sleep)
 * - REM_DREAM: Dream engine activation (REM sleep)
 *
 * Part of the Nightly-Learner Phase 1 implementation.
 *
 * @version 1.0.0
 * @module src/learning/scheduler/SleepCycle
 */

import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { LearningBudget } from './SleepScheduler';

/**
 * Sleep phases modeled after human sleep stages
 */
export type SleepPhase =
  | 'N1_CAPTURE'      // Capture recent experiences (5 min)
  | 'N2_PROCESS'      // Process and cluster patterns (10 min)
  | 'N3_CONSOLIDATE'  // Consolidate into long-term memory (15 min)
  | 'REM_DREAM'       // Dream engine activation (20 min)
  | 'COMPLETE';

export interface PhaseResult {
  phase: SleepPhase;
  startTime: Date;
  endTime: Date;
  duration: number;
  patternsProcessed: number;
  agentsProcessed: string[];
  success: boolean;
  error?: Error;
  metrics: Record<string, number>;
}

export interface CycleSummary {
  id: string;
  startTime: Date;
  endTime: Date;
  totalDuration: number;
  phasesCompleted: SleepPhase[];
  phasesSkipped: SleepPhase[];
  patternsDiscovered: number;
  patternsConsolidated: number;
  agentsProcessed: string[];
  phaseResults: PhaseResult[];
  errors: Error[];
  aborted: boolean;
}

export interface SleepCycleConfig {
  budget: LearningBudget;
  /** Phase durations in ms. Uses defaults if not specified */
  phaseDurations?: Partial<Record<SleepPhase, number>>;
  /** Skip phases if true */
  skipPhases?: SleepPhase[];
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * SleepCycle manages the execution of learning phases
 */
export class SleepCycle extends EventEmitter {
  private id: string;
  private config: SleepCycleConfig;
  private logger: Logger;

  private phaseDurations: Map<SleepPhase, number>;
  private currentPhase: SleepPhase | null = null;
  private phaseResults: PhaseResult[] = [];
  private _isActive: boolean = false;
  private _isAborted: boolean = false;
  private startTime: Date | null = null;

  // Collected data during cycle
  private capturedExperiences: string[] = [];
  private discoveredPatterns: string[] = [];
  private consolidatedPatterns: string[] = [];
  private processedAgents: Set<string> = new Set();

  constructor(config: SleepCycleConfig) {
    super();
    this.id = `cycle-${Date.now()}`;
    this.config = config;
    this.logger = Logger.getInstance();

    // Set phase durations with defaults
    this.phaseDurations = new Map([
      ['N1_CAPTURE', config.phaseDurations?.N1_CAPTURE ?? 5 * 60 * 1000],      // 5 minutes
      ['N2_PROCESS', config.phaseDurations?.N2_PROCESS ?? 10 * 60 * 1000],     // 10 minutes
      ['N3_CONSOLIDATE', config.phaseDurations?.N3_CONSOLIDATE ?? 15 * 60 * 1000], // 15 minutes
      ['REM_DREAM', config.phaseDurations?.REM_DREAM ?? 20 * 60 * 1000],       // 20 minutes
    ]);
  }

  /**
   * Check if cycle is currently active
   */
  get isActive(): boolean {
    return this._isActive;
  }

  /**
   * Check if cycle was aborted
   */
  get isAborted(): boolean {
    return this._isAborted;
  }

  /**
   * Get cycle ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get current phase
   */
  getCurrentPhase(): SleepPhase | null {
    return this.currentPhase;
  }

  /**
   * Execute the complete sleep cycle
   */
  async execute(): Promise<CycleSummary> {
    this._isActive = true;
    this._isAborted = false;
    this.startTime = new Date();

    const summary: CycleSummary = {
      id: this.id,
      startTime: this.startTime,
      endTime: new Date(),
      totalDuration: 0,
      phasesCompleted: [],
      phasesSkipped: [],
      patternsDiscovered: 0,
      patternsConsolidated: 0,
      agentsProcessed: [],
      phaseResults: [],
      errors: [],
      aborted: false,
    };

    this.logger.info('[SleepCycle] Starting cycle', { id: this.id });

    const phases: SleepPhase[] = ['N1_CAPTURE', 'N2_PROCESS', 'N3_CONSOLIDATE', 'REM_DREAM'];

    for (const phase of phases) {
      if (this._isAborted) {
        this.logger.info('[SleepCycle] Cycle aborted', { lastPhase: this.currentPhase });
        summary.aborted = true;
        break;
      }

      // Check if phase should be skipped
      if (this.config.skipPhases?.includes(phase)) {
        summary.phasesSkipped.push(phase);
        continue;
      }

      // Check budget constraints
      if (!this.checkBudget(summary)) {
        this.logger.info('[SleepCycle] Budget exhausted, ending cycle', {
          patternsProcessed: summary.patternsDiscovered + summary.patternsConsolidated,
          maxPatterns: this.config.budget.maxPatternsPerCycle,
        });
        break;
      }

      this.currentPhase = phase;
      const duration = this.phaseDurations.get(phase) || 0;

      try {
        const result = await this.executePhase(phase, duration);
        this.phaseResults.push(result);
        summary.phaseResults.push(result);
        summary.phasesCompleted.push(phase);
        summary.patternsDiscovered += result.patternsProcessed;

        if (result.error) {
          summary.errors.push(result.error);
        }
      } catch (error) {
        this.logger.error('[SleepCycle] Phase failed', { phase, error });
        summary.errors.push(error as Error);
      }
    }

    this._isActive = false;
    this.currentPhase = 'COMPLETE';
    summary.endTime = new Date();
    summary.totalDuration = summary.endTime.getTime() - summary.startTime.getTime();
    summary.patternsConsolidated = this.consolidatedPatterns.length;
    summary.agentsProcessed = Array.from(this.processedAgents);

    this.logger.info('[SleepCycle] Cycle complete', {
      id: this.id,
      duration: summary.totalDuration,
      phases: summary.phasesCompleted.length,
      patterns: summary.patternsDiscovered,
      agents: summary.agentsProcessed.length,
    });

    return summary;
  }

  /**
   * Abort the current cycle gracefully
   */
  async abort(): Promise<void> {
    if (!this._isActive) return;

    this.logger.info('[SleepCycle] Aborting cycle', { id: this.id, currentPhase: this.currentPhase });
    this._isAborted = true;

    // Allow current phase to complete gracefully
    // The execute loop will check _isAborted and exit
  }

  /**
   * Execute a single phase
   */
  private async executePhase(phase: SleepPhase, maxDuration: number): Promise<PhaseResult> {
    const startTime = new Date();

    this.emit('phase:start', phase);
    this.logger.info('[SleepCycle] Starting phase', { phase, maxDuration });

    let result: { patterns: number; agents: string[] };

    try {
      switch (phase) {
        case 'N1_CAPTURE':
          result = await this.captureExperiences(maxDuration);
          break;
        case 'N2_PROCESS':
          result = await this.processPatterns(maxDuration);
          break;
        case 'N3_CONSOLIDATE':
          result = await this.consolidateMemory(maxDuration);
          break;
        case 'REM_DREAM':
          result = await this.activateDreamEngine(maxDuration);
          break;
        default:
          result = { patterns: 0, agents: [] };
      }

      const phaseResult: PhaseResult = {
        phase,
        startTime,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
        patternsProcessed: result.patterns,
        agentsProcessed: result.agents,
        success: true,
        metrics: {},
      };

      this.emit('phase:complete', phase, phaseResult);
      return phaseResult;

    } catch (error) {
      const phaseResult: PhaseResult = {
        phase,
        startTime,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
        patternsProcessed: 0,
        agentsProcessed: [],
        success: false,
        error: error as Error,
        metrics: {},
      };

      this.emit('phase:error', phase, error);
      return phaseResult;
    }
  }

  /**
   * N1 Phase: Capture recent experiences from agents
   */
  private async captureExperiences(maxDuration: number): Promise<{ patterns: number; agents: string[] }> {
    const deadline = Date.now() + maxDuration;
    const agents: string[] = [];
    let experienceCount = 0;

    this.logger.debug('[SleepCycle:N1] Capturing experiences');

    // In a real implementation, this would:
    // 1. Query the experience buffer for recent executions
    // 2. Filter by quality and relevance
    // 3. Prepare experiences for pattern processing

    // Simulated capture for Phase 1 prototype
    // Phase 3 will integrate with actual ExperienceCapture
    const mockAgents = ['test-generator', 'coverage-analyzer', 'quality-gate'];
    const experiencesPerAgent = Math.min(10, Math.floor(this.config.budget.maxPatternsPerCycle / mockAgents.length));

    for (const agent of mockAgents) {
      if (Date.now() > deadline || this._isAborted) break;
      if (agents.length >= this.config.budget.maxAgentsPerCycle) break;

      // Simulate experience capture
      await this.sleep(100); // Simulate processing time

      agents.push(agent);
      this.processedAgents.add(agent);
      experienceCount += experiencesPerAgent;

      this.logger.debug('[SleepCycle:N1] Captured experiences', { agent, count: experiencesPerAgent });
    }

    this.capturedExperiences = agents.flatMap(a => Array(experiencesPerAgent).fill(`exp-${a}`));

    return { patterns: experienceCount, agents };
  }

  /**
   * N2 Phase: Process experiences into pattern clusters
   */
  private async processPatterns(maxDuration: number): Promise<{ patterns: number; agents: string[] }> {
    const deadline = Date.now() + maxDuration;
    let patternsFound = 0;

    this.logger.debug('[SleepCycle:N2] Processing patterns');

    // In a real implementation, this would:
    // 1. Cluster experiences by similarity using RuVector
    // 2. Extract common patterns from clusters
    // 3. Score patterns by confidence and support

    // Simulated processing for Phase 1 prototype
    // Phase 3 will integrate with actual PatternSynthesis
    const clusterCount = Math.min(5, Math.ceil(this.capturedExperiences.length / 3));

    for (let i = 0; i < clusterCount; i++) {
      if (Date.now() > deadline || this._isAborted) break;

      // Simulate pattern extraction
      await this.sleep(200);

      const patternId = `pattern-${this.id}-${i}`;
      this.discoveredPatterns.push(patternId);
      patternsFound++;

      this.logger.debug('[SleepCycle:N2] Pattern discovered', { patternId });
    }

    return { patterns: patternsFound, agents: Array.from(this.processedAgents) };
  }

  /**
   * N3 Phase: Consolidate patterns into long-term memory
   */
  private async consolidateMemory(maxDuration: number): Promise<{ patterns: number; agents: string[] }> {
    const deadline = Date.now() + maxDuration;
    let consolidated = 0;

    this.logger.debug('[SleepCycle:N3] Consolidating memory');

    // In a real implementation, this would:
    // 1. Merge new patterns with existing knowledge
    // 2. Update Q-values based on new evidence
    // 3. Prune low-confidence patterns
    // 4. Store in persistent memory

    // Simulated consolidation for Phase 1 prototype
    // Phase 3 will integrate with actual memory consolidation
    for (const pattern of this.discoveredPatterns) {
      if (Date.now() > deadline || this._isAborted) break;

      // Simulate consolidation
      await this.sleep(150);

      this.consolidatedPatterns.push(pattern);
      consolidated++;

      this.logger.debug('[SleepCycle:N3] Pattern consolidated', { pattern });
    }

    return { patterns: consolidated, agents: Array.from(this.processedAgents) };
  }

  /**
   * REM Phase: Dream engine for creative pattern generation
   */
  private async activateDreamEngine(maxDuration: number): Promise<{ patterns: number; agents: string[] }> {
    const deadline = Date.now() + maxDuration;
    let dreamsGenerated = 0;

    this.logger.debug('[SleepCycle:REM] Activating dream engine');

    // In a real implementation, this would:
    // 1. Generate hypothetical scenarios from patterns
    // 2. Test pattern combinations
    // 3. Identify cross-agent transfer opportunities
    // 4. Create "what-if" experiences for future learning

    // Simulated dreaming for Phase 1 prototype
    // Phase 3 will integrate with actual DreamEngine
    const dreamCount = Math.min(3, Math.ceil(this.consolidatedPatterns.length / 2));

    for (let i = 0; i < dreamCount; i++) {
      if (Date.now() > deadline || this._isAborted) break;

      // Simulate dream generation
      await this.sleep(300);

      dreamsGenerated++;
      this.logger.debug('[SleepCycle:REM] Dream generated', { dreamId: `dream-${i}` });
    }

    return { patterns: dreamsGenerated, agents: Array.from(this.processedAgents) };
  }

  /**
   * Check if we're within budget constraints
   */
  private checkBudget(summary: CycleSummary): boolean {
    const totalPatterns = summary.patternsDiscovered + summary.patternsConsolidated;

    if (totalPatterns >= this.config.budget.maxPatternsPerCycle) {
      return false;
    }

    if (summary.agentsProcessed.length >= this.config.budget.maxAgentsPerCycle) {
      return false;
    }

    if (summary.totalDuration >= this.config.budget.maxDurationMs) {
      return false;
    }

    return true;
  }

  /**
   * Helper to sleep for a duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default SleepCycle;
