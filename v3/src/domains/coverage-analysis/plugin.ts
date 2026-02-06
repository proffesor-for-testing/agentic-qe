/**
 * Agentic QE v3 - Coverage Analysis Domain Plugin
 * Plugin implementation for the microkernel architecture
 */

import { DomainName, DomainEvent, Result, ok, err } from '../../shared/types';
import { EventBus, MemoryBackend, DomainHealth } from '../../kernel/interfaces';
import { BaseDomainPlugin, TaskHandler } from '../domain-interface';
import { TestExecutionEvents } from '../../shared/events';
import { CoverageAnalysisAPI } from './interfaces';
import { CoverageAnalysisCoordinator } from './coordinator';

// ============================================================================
// Plugin Implementation
// ============================================================================

export class CoverageAnalysisPlugin extends BaseDomainPlugin {
  private static readonly VERSION = '1.0.0';
  private readonly coordinator: CoverageAnalysisCoordinator;
  private _activeAnalyses = 0;

  constructor(eventBus: EventBus, memory: MemoryBackend) {
    super(eventBus, memory);
    this.coordinator = new CoverageAnalysisCoordinator(eventBus, memory);
  }

  // ============================================================================
  // DomainPlugin Implementation
  // ============================================================================

  get name(): DomainName {
    return 'coverage-analysis';
  }

  get version(): string {
    return CoverageAnalysisPlugin.VERSION;
  }

  get dependencies(): DomainName[] {
    // Coverage analysis can consume test execution results
    return ['test-execution'];
  }

  /**
   * Get the domain's public API
   */
  getAPI<T>(): T {
    return this.coordinator as unknown as T;
  }

  /**
   * Get typed API accessor
   */
  getCoverageAPI(): CoverageAnalysisAPI {
    return this.coordinator;
  }

  // ============================================================================
  // Task Handlers (Queen-Domain Integration)
  // ============================================================================

  /**
   * Get task handlers for direct Queen-Domain integration
   * Maps task types to coordinator methods
   */
  protected override getTaskHandlers(): Map<string, TaskHandler> {
    return new Map([
      // Analyze coverage task - main task type for this domain
      ['analyze-coverage', async (payload): Promise<Result<unknown, Error>> => {
        const coverageData = payload.coverageData as Parameters<CoverageAnalysisAPI['analyze']>[0]['coverageData'] | undefined;

        if (!coverageData) {
          return err(new Error('Invalid analyze-coverage payload: missing coverageData'));
        }

        this._activeAnalyses++;
        this.updateAgentMetrics();

        try {
          return await this.coordinator.analyze({
            coverageData,
            threshold: payload.threshold as number | undefined,
            includeFileDetails: payload.includeFileDetails as boolean | undefined,
          });
        } finally {
          this._activeAnalyses--;
          this.updateAgentMetrics();
        }
      }],

      // Detect gaps task
      ['detect-gaps', async (payload): Promise<Result<unknown, Error>> => {
        const coverageData = payload.coverageData as Parameters<CoverageAnalysisAPI['detectGaps']>[0]['coverageData'] | undefined;

        if (!coverageData) {
          return err(new Error('Invalid detect-gaps payload: missing coverageData'));
        }

        this._activeAnalyses++;
        this.updateAgentMetrics();

        try {
          return await this.coordinator.detectGaps({
            coverageData,
            minCoverage: payload.minCoverage as number | undefined,
            prioritize: payload.prioritize as 'risk' | 'size' | 'recent-changes' | undefined,
          });
        } finally {
          this._activeAnalyses--;
          this.updateAgentMetrics();
        }
      }],

      // Calculate risk task
      ['calculate-risk', async (payload): Promise<Result<unknown, Error>> => {
        const file = payload.file as string | undefined;
        const uncoveredLines = payload.uncoveredLines as number[] | undefined;

        if (!file || !uncoveredLines) {
          return err(new Error('Invalid calculate-risk payload: missing file or uncoveredLines'));
        }

        this._activeAnalyses++;
        this.updateAgentMetrics();

        try {
          return await this.coordinator.calculateRisk({
            file,
            uncoveredLines,
            factors: payload.factors as Parameters<CoverageAnalysisAPI['calculateRisk']>[0]['factors'] | undefined,
          });
        } finally {
          this._activeAnalyses--;
          this.updateAgentMetrics();
        }
      }],

      // ADR-059: Ghost coverage analysis task
      ['analyze-ghost-coverage', async (payload): Promise<Result<unknown, Error>> => {
        const existingTests = payload.existingTests as string[] | undefined;
        const codeContext = payload.codeContext as string | undefined;

        if (!existingTests || !codeContext) {
          return err(new Error('Invalid analyze-ghost-coverage payload: missing existingTests or codeContext'));
        }

        this._activeAnalyses++;
        this.updateAgentMetrics();

        try {
          return await this.coordinator.analyzeGhostCoverage(existingTests, codeContext);
        } finally {
          this._activeAnalyses--;
          this.updateAgentMetrics();
        }
      }],
    ]);
  }

  // ============================================================================
  // Lifecycle Hooks
  // ============================================================================

  protected async onInitialize(): Promise<void> {
    await this.coordinator.initialize();
    // Issue #205 fix: Start with 'idle' status (0 agents)
    this.updateHealth({
      status: 'idle',
      lastActivity: new Date(),
    });
  }

  protected async onDispose(): Promise<void> {
    await this.coordinator.dispose();
    this.updateHealth({
      status: 'unhealthy',
      agents: { total: 0, active: 0, idle: 0, failed: 0 },
    });
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  protected subscribeToEvents(): void {
    // Subscribe to test execution completion to trigger coverage analysis
    this.eventBus.subscribe(
      TestExecutionEvents.TestRunCompleted,
      this.handleTestRunCompleted.bind(this)
    );
  }

  protected async onEvent(event: DomainEvent): Promise<void> {
    // Handle any domain event that wasn't caught by specific subscriptions
    switch (event.type) {
      case TestExecutionEvents.TestRunCompleted:
        await this.handleTestRunCompleted(event);
        break;
    }
  }

  private async handleTestRunCompleted(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      runId: string;
      passed: number;
      failed: number;
      skipped: number;
      duration: number;
      coverageData?: unknown;
    };

    // If coverage data is available in the test run, analyze it
    if (payload.coverageData) {
      this._activeAnalyses++;
      this.updateAgentMetrics();

      try {
        await this.coordinator.analyze({
          coverageData: payload.coverageData as Parameters<CoverageAnalysisAPI['analyze']>[0]['coverageData'],
          includeFileDetails: true,
        });
      } finally {
        this._activeAnalyses--;
        this.updateAgentMetrics();
      }
    }
  }

  // ============================================================================
  // Health Management
  // ============================================================================

  private updateAgentMetrics(): void {
    const health: DomainHealth = {
      status: this._activeAnalyses > 0 ? 'healthy' : 'healthy',
      agents: {
        total: 3, // Three services: analyzer, gap detector, risk scorer
        active: this._activeAnalyses > 0 ? 1 : 0,
        idle: this._activeAnalyses > 0 ? 2 : 3,
        failed: 0,
      },
      lastActivity: new Date(),
      errors: [],
    };

    this.updateHealth(health);
  }

  getHealth(): DomainHealth {
    return {
      ...this._health,
      agents: {
        total: 3,
        active: this._activeAnalyses > 0 ? 1 : 0,
        idle: this._activeAnalyses > 0 ? 2 : 3,
        failed: 0,
      },
      lastActivity: new Date(),
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Coverage Analysis plugin instance
 */
export function createCoverageAnalysisPlugin(
  eventBus: EventBus,
  memory: MemoryBackend
): CoverageAnalysisPlugin {
  return new CoverageAnalysisPlugin(eventBus, memory);
}
