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
 * Updated in Phase 3 to integrate with actual learning modules.
 *
 * @version 2.0.0
 * @module src/learning/scheduler/SleepCycle
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import { Logger } from '../../utils/Logger';
import { LearningBudget } from './SleepScheduler';
import { ExperienceCapture, CapturedExperience } from '../capture/ExperienceCapture';
import { PatternSynthesis, SynthesizedPattern, SynthesisResult } from '../synthesis/PatternSynthesis';
import { DreamEngine, DreamCycleResult } from '../dream/DreamEngine';
import { TransferProtocol, TransferResult } from '../transfer/TransferProtocol';

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
  /** Database path. Default: .agentic-qe/memory.db */
  dbPath?: string;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * SleepCycle manages the execution of learning phases
 *
 * Now integrates with actual learning modules:
 * - ExperienceCapture for N1_CAPTURE
 * - PatternSynthesis for N2_PROCESS
 * - DreamEngine for REM_DREAM
 * - TransferProtocol for cross-agent transfer
 */
export class SleepCycle extends EventEmitter {
  private id: string;
  private config: SleepCycleConfig;
  private logger: Logger;
  private dbPath: string;

  private phaseDurations: Map<SleepPhase, number>;
  private currentPhase: SleepPhase | null = null;
  private phaseResults: PhaseResult[] = [];
  private _isActive: boolean = false;
  private _isAborted: boolean = false;
  private startTime: Date | null = null;

  // Integrated learning modules
  private experienceCapture: ExperienceCapture | null = null;
  private patternSynthesis: PatternSynthesis | null = null;
  private dreamEngine: DreamEngine | null = null;
  private transferProtocol: TransferProtocol | null = null;

  // Collected data during cycle
  private capturedExperienceData: CapturedExperience[] = [];
  private synthesizedPatterns: SynthesizedPattern[] = [];
  private dreamResult: DreamCycleResult | null = null;
  private transferResults: TransferResult[] = [];
  private processedAgents: Set<string> = new Set();

  constructor(config: SleepCycleConfig) {
    super();
    this.id = `cycle-${Date.now()}`;
    this.config = config;
    this.logger = Logger.getInstance();
    this.dbPath = config.dbPath || path.join(process.cwd(), '.agentic-qe', 'memory.db');

    // Set phase durations with defaults
    this.phaseDurations = new Map([
      ['N1_CAPTURE', config.phaseDurations?.N1_CAPTURE ?? 5 * 60 * 1000],      // 5 minutes
      ['N2_PROCESS', config.phaseDurations?.N2_PROCESS ?? 10 * 60 * 1000],     // 10 minutes
      ['N3_CONSOLIDATE', config.phaseDurations?.N3_CONSOLIDATE ?? 15 * 60 * 1000], // 15 minutes
      ['REM_DREAM', config.phaseDurations?.REM_DREAM ?? 20 * 60 * 1000],       // 20 minutes
    ]);

    // Initialize learning modules
    this.initializeModules();
  }

  /**
   * Initialize integrated learning modules
   */
  private initializeModules(): void {
    try {
      this.experienceCapture = new ExperienceCapture({
        dbPath: this.dbPath,
        debug: this.config.debug,
      });

      this.patternSynthesis = new PatternSynthesis({
        dbPath: this.dbPath,
        debug: this.config.debug,
      });

      this.dreamEngine = new DreamEngine({
        dbPath: this.dbPath,
        cycleDuration: this.phaseDurations.get('REM_DREAM') || 20 * 60 * 1000,
        debug: this.config.debug,
      });

      this.transferProtocol = new TransferProtocol({
        dbPath: this.dbPath,
        debug: this.config.debug,
      });

      this.logger.info('[SleepCycle] Learning modules initialized');
    } catch (error) {
      this.logger.error('[SleepCycle] Failed to initialize learning modules', { error });
    }
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
    summary.patternsConsolidated = this.synthesizedPatterns.length + this.transferResults.length;
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
   * Now uses ExperienceCapture.getRecentExperiences() for real data
   */
  private async captureExperiences(maxDuration: number): Promise<{ patterns: number; agents: string[] }> {
    const agents: string[] = [];
    let experienceCount = 0;

    this.logger.info('[SleepCycle:N1] Capturing experiences using ExperienceCapture');

    if (!this.experienceCapture) {
      this.logger.warn('[SleepCycle:N1] ExperienceCapture not available, falling back to empty result');
      return { patterns: 0, agents: [] };
    }

    try {
      // Get recent experiences from the last 24 hours
      const limit = Math.min(100, this.config.budget.maxPatternsPerCycle);
      const experiences = this.experienceCapture.getRecentExperiences(24, limit);

      this.logger.info('[SleepCycle:N1] Retrieved experiences', { count: experiences.length });

      // Group by agent type and collect unique agents
      const agentTypeSet = new Set<string>();
      for (const exp of experiences) {
        if (this._isAborted) break;
        if (agentTypeSet.size >= this.config.budget.maxAgentsPerCycle) break;

        agentTypeSet.add(exp.agentType);
        this.processedAgents.add(exp.agentType);
      }

      agents.push(...agentTypeSet);
      experienceCount = experiences.length;

      // Store for next phase
      this.capturedExperienceData = experiences;

      this.logger.info('[SleepCycle:N1] Captured experiences', {
        experienceCount,
        agentTypes: agents.length,
        agents,
      });

    } catch (error) {
      this.logger.error('[SleepCycle:N1] Failed to capture experiences', { error });
    }

    return { patterns: experienceCount, agents };
  }

  /**
   * N2 Phase: Process experiences into pattern clusters
   * Now uses PatternSynthesis.synthesize() for real pattern extraction
   */
  private async processPatterns(maxDuration: number): Promise<{ patterns: number; agents: string[] }> {
    let patternsFound = 0;

    this.logger.info('[SleepCycle:N2] Processing patterns using PatternSynthesis');

    if (!this.patternSynthesis) {
      this.logger.warn('[SleepCycle:N2] PatternSynthesis not available, falling back to empty result');
      return { patterns: 0, agents: Array.from(this.processedAgents) };
    }

    try {
      // Run pattern synthesis on captured experiences
      const result: SynthesisResult = await this.patternSynthesis.synthesize({
        minSupport: 2, // Lower for more patterns during dev
        minConfidence: 0.6,
        maxPatterns: this.config.budget.maxPatternsPerCycle,
        agentTypes: Array.from(this.processedAgents),
      });

      patternsFound = result.patterns.length;
      this.synthesizedPatterns = result.patterns;

      this.logger.info('[SleepCycle:N2] Pattern synthesis complete', {
        patternsFound,
        clustersAnalyzed: result.clustersAnalyzed,
        experiencesProcessed: result.experiencesProcessed,
        duration: result.duration,
        stats: result.stats,
      });

      // Mark experiences as processed
      if (this.experienceCapture && this.capturedExperienceData.length > 0) {
        const expIds = this.capturedExperienceData.map(e => e.id);
        this.experienceCapture.markAsProcessed(expIds);
        this.logger.debug('[SleepCycle:N2] Marked experiences as processed', { count: expIds.length });
      }

    } catch (error) {
      this.logger.error('[SleepCycle:N2] Failed to process patterns', { error });
    }

    return { patterns: patternsFound, agents: Array.from(this.processedAgents) };
  }

  /**
   * N3 Phase: Consolidate patterns into long-term memory
   * Now uses TransferProtocol for cross-agent knowledge sharing
   */
  private async consolidateMemory(maxDuration: number): Promise<{ patterns: number; agents: string[] }> {
    let consolidated = 0;

    this.logger.info('[SleepCycle:N3] Consolidating memory and initiating cross-agent transfer');

    if (!this.transferProtocol) {
      this.logger.warn('[SleepCycle:N3] TransferProtocol not available, skipping cross-agent transfer');
      return { patterns: this.synthesizedPatterns.length, agents: Array.from(this.processedAgents) };
    }

    try {
      // Get patterns that have high confidence and could benefit other agents
      const highConfidencePatterns = this.synthesizedPatterns.filter(p => p.confidence >= 0.7);

      if (highConfidencePatterns.length === 0) {
        this.logger.info('[SleepCycle:N3] No high-confidence patterns to transfer');
        return { patterns: this.synthesizedPatterns.length, agents: Array.from(this.processedAgents) };
      }

      // For each agent type that produced patterns, try to transfer to compatible agents
      const processedAgentsArray = Array.from(this.processedAgents);

      for (const sourceAgent of processedAgentsArray) {
        if (this._isAborted) break;

        // Get patterns from this agent type
        const agentPatterns = highConfidencePatterns.filter(p =>
          p.agentTypes.includes(sourceAgent)
        );

        if (agentPatterns.length === 0) continue;

        // Broadcast each pattern to compatible agents
        for (const pattern of agentPatterns) {
          if (this._isAborted) break;

          try {
            const results = await this.transferProtocol.broadcastPattern(
              pattern.id,
              sourceAgent
            );

            // Count successful transfers
            const successful = results.filter(r => r.patternsTransferred > 0);
            if (successful.length > 0) {
              this.transferResults.push(...successful);
              consolidated += successful.length;
              this.logger.info('[SleepCycle:N3] Pattern broadcast complete', {
                patternId: pattern.id,
                source: sourceAgent,
                successfulTransfers: successful.length,
              });
            }
          } catch (transferError) {
            this.logger.warn('[SleepCycle:N3] Pattern transfer failed', {
              patternId: pattern.id,
              agent: sourceAgent,
              error: transferError,
            });
          }
        }
      }

      // Consolidation count = synthesized patterns + transferred patterns
      consolidated = this.synthesizedPatterns.length + consolidated;

      this.logger.info('[SleepCycle:N3] Memory consolidation complete', {
        synthesizedPatterns: this.synthesizedPatterns.length,
        crossAgentTransfers: this.transferResults.length,
        totalConsolidated: consolidated,
      });

    } catch (error) {
      this.logger.error('[SleepCycle:N3] Failed to consolidate memory', { error });
    }

    return { patterns: consolidated, agents: Array.from(this.processedAgents) };
  }

  /**
   * REM Phase: Dream engine for creative pattern generation
   * Now uses DreamEngine.dream() for real insight discovery
   */
  private async activateDreamEngine(maxDuration: number): Promise<{ patterns: number; agents: string[] }> {
    let insightsGenerated = 0;

    this.logger.info('[SleepCycle:REM] Activating DreamEngine for pattern discovery');

    if (!this.dreamEngine) {
      this.logger.warn('[SleepCycle:REM] DreamEngine not available, skipping dream phase');
      return { patterns: 0, agents: Array.from(this.processedAgents) };
    }

    try {
      // Initialize dream engine (loads patterns as concepts)
      await this.dreamEngine.initialize();

      // Run the dream cycle
      const result = await this.dreamEngine.dream();

      insightsGenerated = result.insightsGenerated;
      this.dreamResult = result;

      this.logger.info('[SleepCycle:REM] Dream cycle complete', {
        insightsGenerated,
        associationsFound: result.associationsFound,
        duration: result.duration,
        status: result.status,
        actionableInsights: result.insights.filter(i => i.actionable).length,
      });

      // Log notable insights
      for (const insight of result.insights.slice(0, 5)) {
        this.logger.debug('[SleepCycle:REM] Insight discovered', {
          type: insight.type,
          description: insight.description.substring(0, 100),
          novelty: insight.noveltyScore.toFixed(2),
          actionable: insight.actionable,
        });
      }

    } catch (error) {
      this.logger.error('[SleepCycle:REM] Failed to run dream engine', { error });
    }

    return { patterns: insightsGenerated, agents: Array.from(this.processedAgents) };
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
