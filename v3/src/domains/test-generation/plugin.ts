/**
 * Agentic QE v3 - Test Generation Domain Plugin
 * Integrates the test generation domain into the kernel
 */

import { DomainName, DomainEvent } from '../../shared/types';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
} from '../../kernel/interfaces';
import { BaseDomainPlugin } from '../domain-interface';
import {
  TestGenerationAPI,
  GenerateTestsRequest,
  GeneratedTests,
  TDDRequest,
  TDDResult,
  PropertyTestRequest,
  PropertyTests,
  TestDataRequest,
  TestData,
  LearnPatternsRequest,
  LearnedPatterns,
} from './interfaces';
import {
  TestGenerationCoordinator,
  ITestGenerationCoordinator,
  CoordinatorConfig,
} from './coordinator';
import {
  TestGeneratorService,
  ITestGenerationService,
  TestGeneratorConfig,
} from './services/test-generator';
import {
  PatternMatcherService,
  IPatternMatchingService,
  PatternMatcherConfig,
} from './services/pattern-matcher';
// TestGenerationEvents imported for future event publishing enhancements
// import { TestGenerationEvents } from '../../shared/events/domain-events';

/**
 * Plugin configuration options
 */
export interface TestGenerationPluginConfig {
  coordinator?: Partial<CoordinatorConfig>;
  testGenerator?: Partial<TestGeneratorConfig>;
  patternMatcher?: Partial<PatternMatcherConfig>;
}

/**
 * Extended API with internal access
 */
export interface TestGenerationExtendedAPI extends TestGenerationAPI {
  /** Get the internal coordinator */
  getCoordinator(): ITestGenerationCoordinator;

  /** Get the test generator service */
  getTestGenerator(): ITestGenerationService;

  /** Get the pattern matcher service */
  getPatternMatcher(): IPatternMatchingService;
}

/**
 * Test Generation Domain Plugin
 * Provides AI-powered test generation capabilities
 */
export class TestGenerationPlugin extends BaseDomainPlugin {
  private coordinator: ITestGenerationCoordinator | null = null;
  private testGenerator: ITestGenerationService | null = null;
  private patternMatcher: IPatternMatchingService | null = null;
  private readonly pluginConfig: TestGenerationPluginConfig;

  constructor(
    eventBus: EventBus,
    memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: TestGenerationPluginConfig = {}
  ) {
    super(eventBus, memory);
    this.pluginConfig = config;
  }

  // ============================================================================
  // DomainPlugin Interface Implementation
  // ============================================================================

  get name(): DomainName {
    return 'test-generation';
  }

  get version(): string {
    return '1.0.0';
  }

  get dependencies(): DomainName[] {
    // Test generation can optionally use coverage analysis for gap detection
    return [];
  }

  /**
   * Get the domain's public API
   */
  getAPI<T>(): T {
    const api: TestGenerationExtendedAPI = {
      // Public API methods
      generateTests: this.generateTests.bind(this),
      generateTDDTests: this.generateTDDTests.bind(this),
      generatePropertyTests: this.generatePropertyTests.bind(this),
      generateTestData: this.generateTestData.bind(this),
      learnPatterns: this.learnPatterns.bind(this),

      // Internal access methods
      getCoordinator: () => this.coordinator!,
      getTestGenerator: () => this.testGenerator!,
      getPatternMatcher: () => this.patternMatcher!,
    };

    return api as T;
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  protected async onInitialize(): Promise<void> {
    // Create services
    this.testGenerator = new TestGeneratorService(
      this.memory,
      this.pluginConfig.testGenerator
    );

    this.patternMatcher = new PatternMatcherService(
      this.memory,
      this.pluginConfig.patternMatcher
    );

    // Create coordinator
    this.coordinator = new TestGenerationCoordinator(
      this.eventBus,
      this.memory,
      this.agentCoordinator,
      this.pluginConfig.coordinator
    );

    // Initialize coordinator
    await this.coordinator.initialize();

    // Update health status
    this.updateHealth({
      status: 'healthy',
      agents: { total: 0, active: 0, idle: 0, failed: 0 },
      lastActivity: new Date(),
      errors: [],
    });
  }

  protected async onDispose(): Promise<void> {
    if (this.coordinator) {
      await this.coordinator.dispose();
    }

    this.coordinator = null;
    this.testGenerator = null;
    this.patternMatcher = null;
  }

  protected subscribeToEvents(): void {
    // Subscribe to coverage gap events
    this.eventBus.subscribe(
      'coverage-analysis.CoverageGapDetected',
      this.handleCoverageGap.bind(this)
    );

    // Subscribe to code intelligence events for context
    this.eventBus.subscribe(
      'code-intelligence.ImpactAnalysisCompleted',
      this.handleImpactAnalysis.bind(this)
    );

    // Subscribe to learning optimization events
    this.eventBus.subscribe(
      'learning-optimization.PatternConsolidated',
      this.handlePatternConsolidation.bind(this)
    );
  }

  protected async onEvent(event: DomainEvent): Promise<void> {
    // Track activity
    this.updateHealth({
      lastActivity: new Date(),
    });

    // Route to appropriate handler based on event type
    switch (event.type) {
      case 'coverage-analysis.CoverageGapDetected':
        await this.handleCoverageGap(event);
        break;
      case 'code-intelligence.ImpactAnalysisCompleted':
        await this.handleImpactAnalysis(event);
        break;
      default:
        // No specific handling needed
        break;
    }
  }

  // ============================================================================
  // API Implementation
  // ============================================================================

  private async generateTests(
    request: GenerateTestsRequest
  ): Promise<import('../../shared/types').Result<GeneratedTests, Error>> {
    this.ensureInitialized();

    try {
      const result = await this.coordinator!.generateTests(request);

      if (result.success) {
        this.trackSuccessfulGeneration(result.value);
      } else {
        this.trackFailedGeneration(result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async generateTDDTests(
    request: TDDRequest
  ): Promise<import('../../shared/types').Result<TDDResult, Error>> {
    this.ensureInitialized();

    try {
      return await this.coordinator!.generateTDDTests(request);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async generatePropertyTests(
    request: PropertyTestRequest
  ): Promise<import('../../shared/types').Result<PropertyTests, Error>> {
    this.ensureInitialized();

    try {
      return await this.coordinator!.generatePropertyTests(request);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async generateTestData(
    request: TestDataRequest
  ): Promise<import('../../shared/types').Result<TestData, Error>> {
    this.ensureInitialized();

    try {
      return await this.coordinator!.generateTestData(request);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async learnPatterns(
    request: LearnPatternsRequest
  ): Promise<import('../../shared/types').Result<LearnedPatterns, Error>> {
    this.ensureInitialized();

    try {
      return await this.coordinator!.learnPatterns(request);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private async handleCoverageGap(event: DomainEvent): Promise<void> {
    // Coverage gap detected - could auto-generate tests
    const payload = event.payload as {
      gapId: string;
      file: string;
      uncoveredLines: number[];
      riskScore: number;
    };

    // Only auto-generate for high-risk gaps
    if (payload.riskScore >= 0.7) {
      // Store gap info for batch processing
      await this.memory.set(
        `test-generation:pending-gaps:${payload.gapId}`,
        payload,
        { namespace: 'test-generation', ttl: 86400 } // 24 hours
      );
    }
  }

  private async handleImpactAnalysis(event: DomainEvent): Promise<void> {
    // Impact analysis completed - could regenerate affected tests
    const payload = event.payload as {
      analysisId: string;
      changedFiles: string[];
      impactedTests: string[];
    };

    // Store for potential test regeneration
    await this.memory.set(
      `test-generation:impact:${payload.analysisId}`,
      payload,
      { namespace: 'test-generation', ttl: 3600 } // 1 hour
    );
  }

  private async handlePatternConsolidation(event: DomainEvent): Promise<void> {
    // Patterns were consolidated - update local pattern cache
    const payload = event.payload as {
      patternCount: number;
      domains: DomainName[];
    };

    if (payload.domains.includes('test-generation')) {
      // Reload patterns from memory
      // This would trigger a refresh of the pattern matcher's cache
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('TestGenerationPlugin is not initialized');
    }

    if (!this.coordinator || !this.testGenerator || !this.patternMatcher) {
      throw new Error('TestGenerationPlugin services are not available');
    }
  }

  private handleError<T>(error: unknown): import('../../shared/types').Result<T, Error> {
    const err = error instanceof Error ? error : new Error(String(error));

    // Track error
    const currentHealth = this.getHealth();
    this.updateHealth({
      errors: [...currentHealth.errors.slice(-9), err.message],
      status: currentHealth.errors.length >= 5 ? 'degraded' : currentHealth.status,
    });

    return { success: false, error: err };
  }

  private trackSuccessfulGeneration(_tests: GeneratedTests): void {
    const health = this.getHealth();
    this.updateHealth({
      agents: {
        ...health.agents,
        total: health.agents.total + 1,
        idle: health.agents.idle + 1,
      },
      lastActivity: new Date(),
    });
  }

  private trackFailedGeneration(error: Error): void {
    const health = this.getHealth();
    this.updateHealth({
      agents: {
        ...health.agents,
        failed: health.agents.failed + 1,
      },
      errors: [...health.errors.slice(-9), error.message],
    });
  }
}

/**
 * Factory function to create a TestGenerationPlugin
 */
export function createTestGenerationPlugin(
  eventBus: EventBus,
  memory: MemoryBackend,
  agentCoordinator: AgentCoordinator,
  config?: TestGenerationPluginConfig
): TestGenerationPlugin {
  return new TestGenerationPlugin(eventBus, memory, agentCoordinator, config);
}
