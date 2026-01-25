/**
 * Agentic QE v3 - Coverage Analysis Domain Plugin
 * Plugin implementation for the microkernel architecture
 */

import { DomainName, DomainEvent } from '../../shared/types';
import { EventBus, MemoryBackend, DomainHealth } from '../../kernel/interfaces';
import { BaseDomainPlugin } from '../domain-interface';
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
