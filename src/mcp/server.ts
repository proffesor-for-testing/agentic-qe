/**
 * MCP Server for Agentic QE Fleet System
 * 
 * This module implements the Model Context Protocol server that handles
 * tool requests and coordinates with the Agentic QE Fleet components.
 * 
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import * as path from 'path';
import { agenticQETools, TOOL_NAMES } from './tools.js';
import { getToolLoader } from './lazy-loader.js';
import {
  CORE_TOOLS,
  DOMAIN_TOOLS,
  SPECIALIZED_TOOLS,
  COORDINATION_TOOLS,
  DOMAIN_KEYWORDS,
  TOOL_STATS,
  getToolCategorySummary
} from './tool-categories.js';
import { SERVER_INSTRUCTIONS } from './server-instructions.js';
import { FleetInitHandler } from './handlers/fleet-init.js';
import { AgentSpawnHandler } from './handlers/agent-spawn.js';
// REMOVED: TestGenerateHandler - use TestGenerateEnhancedHandler instead (Issue #115 Phase 1)
import { TestExecuteHandler } from './handlers/test-execute.js';
// REMOVED: QualityAnalyzeHandler - use QE_QUALITYGATE_EVALUATE instead (Issue #115 Phase 1)
// REMOVED: PredictDefectsHandler - use PredictDefectsAIHandler instead (Issue #115 Phase 1)
import { FleetStatusHandler } from './handlers/fleet-status.js';
import { TaskOrchestrateHandler } from './handlers/task-orchestrate.js';
// REMOVED: OptimizeTestsHandler - use TestOptimizeSublinearHandler instead (Issue #115 Phase 1)
import { MemoryStoreHandler } from './handlers/memory/memory-store.js';
import { MemoryRetrieveHandler } from './handlers/memory/memory-retrieve.js';
import { MemoryQueryHandler } from './handlers/memory/memory-query.js';
import { MemoryShareHandler } from './handlers/memory/memory-share.js';
import { MemoryBackupHandler } from './handlers/memory/memory-backup.js';
import { BlackboardPostHandler } from './handlers/memory/blackboard-post.js';
import { BlackboardReadHandler } from './handlers/memory/blackboard-read.js';
import { ConsensusProposeHandler } from './handlers/memory/consensus-propose.js';
import { ConsensusVoteHandler } from './handlers/memory/consensus-vote.js';
import { ArtifactManifestHandler } from './handlers/memory/artifact-manifest.js';
import { WorkflowCreateHandler } from './handlers/coordination/workflow-create.js';
import { WorkflowExecuteHandler } from './handlers/coordination/workflow-execute.js';
import { WorkflowCheckpointHandler } from './handlers/coordination/workflow-checkpoint.js';
import { WorkflowResumeHandler } from './handlers/coordination/workflow-resume.js';
import { TaskStatusHandler } from './handlers/coordination/task-status.js';
import { EventEmitHandler } from './handlers/coordination/event-emit.js';
import { EventSubscribeHandler } from './handlers/coordination/event-subscribe.js';
import { TestGenerateEnhancedHandler } from './handlers/test/test-generate-enhanced.js';
import { TestExecuteParallelHandler } from './handlers/test/test-execute-parallel.js';
import { TestOptimizeSublinearHandler } from './handlers/test/test-optimize-sublinear.js';
import { TestReportComprehensiveHandler } from './handlers/test/test-report-comprehensive.js';
import { TestCoverageDetailedHandler } from './handlers/test/test-coverage-detailed.js';
// REMOVED: QualityGateExecuteHandler - use QE_QUALITYGATE_EVALUATE instead (Issue #115 Phase 1)
// REMOVED: QualityValidateMetricsHandler - use QE_QUALITYGATE_VALIDATE_METRICS instead (Issue #115 Phase 1)
// REMOVED: QualityRiskAssessHandler - use QE_QUALITYGATE_ASSESS_RISK instead (Issue #115 Phase 1)
// REMOVED: QualityDecisionMakeHandler - merged into QE_QUALITYGATE_EVALUATE (Issue #115 Phase 1)
// REMOVED: QualityPolicyCheckHandler - merged into QE_QUALITYGATE_EVALUATE (Issue #115 Phase 1)
import { FlakyTestDetectHandler } from './handlers/prediction/flaky-test-detect.js';
import { PredictDefectsAIHandler } from './handlers/prediction/predict-defects-ai.js';
// REMOVED: RegressionRiskAnalyzeHandler - use QE_REGRESSION_ANALYZE_RISK instead (Issue #115)
import { VisualTestRegressionHandler } from './handlers/prediction/visual-test-regression.js';
import { DeploymentReadinessCheckHandler } from './handlers/prediction/deployment-readiness-check.js';
import { CoverageAnalyzeSublinearHandler } from './handlers/analysis/coverage-analyze-sublinear-handler.js';
import { CoverageGapsDetectHandler } from './handlers/analysis/coverage-gaps-detect-handler.js';
// REMOVED: PerformanceBenchmarkRunHandler - use PERFORMANCE_RUN_BENCHMARK instead (Issue #115)
import { PerformanceMonitorRealtimeHandler } from './handlers/analysis/performance-monitor-realtime-handler.js';
import { SecurityScanComprehensiveHandler } from './handlers/analysis/security-scan-comprehensive-handler.js';
import { AgentRegistry, getAgentRegistry } from './services/AgentRegistry.js';
import { HookExecutor, getHookExecutor } from './services/HookExecutor.js';
import { SwarmMemoryManager } from '../core/memory/SwarmMemoryManager.js';
import { getSharedMemoryManager } from '../core/memory/MemoryManagerFactory.js';
import { TestExecuteStreamHandler } from './streaming/TestExecuteStreamHandler.js';
import { CoverageAnalyzeStreamHandler } from './streaming/CoverageAnalyzeStreamHandler.js';
import { Phase2ToolsHandler } from './handlers/phase2/Phase2Tools.js';
import { LearningFeedback } from '../learning/types.js';
import { TestPattern } from '../reasoning/QEReasoningBank.js';
import {
  Phase3DomainToolsHandler,
  PerformanceRunBenchmarkArgs,
  PerformanceMonitorRealtimeArgs,
  VisualCompareScreenshotsArgs,
  VisualValidateAccessibilityArgs,
  VisualDetectRegressionArgs,
  QeSecurityScanComprehensiveArgs,
  QeQualitygateEvaluateArgs,
  QeQualitygateEvaluateGoapArgs,
  QeQualitygateGenerateReportArgs
} from './handlers/phase3/Phase3DomainTools.js';
import { EventEmitter } from 'events';
import { LearningStoreExperienceHandler } from './handlers/learning/learning-store-experience.js';
import { LearningStoreQValueHandler } from './handlers/learning/learning-store-qvalue.js';
import { LearningQueryHandler } from './handlers/learning/learning-query.js';
import { LearningStorePatternHandler } from './handlers/learning/learning-store-pattern.js';
import { LearningEventListener, initLearningEventListener } from './services/LearningEventListener.js';
import { SleepScheduler } from '../learning/scheduler/SleepScheduler.js';

// Phase 3: Domain-specific tool functions
import {
  validateApiContract,
  detectBreakingChanges,
  validateApiVersioning,
  ValidateApiContractParams,
  DetectBreakingChangesParams,
  ValidateApiVersioningParams
} from './tools/qe/api-contract/index.js';
import {
  scanComprehensive,
  ScanComprehensiveParams
} from './tools/qe/accessibility/index.js';
import {
  generateTestData,
  maskSensitiveData,
  analyzeSchema,
  GenerateTestDataParams,
  MaskSensitiveDataParams,
  AnalyzeSchemaParams
} from './tools/qe/test-data/index.js';
import {
  analyzeRegressionRisk,
  selectRegressionTests,
  RegressionRiskAnalysisParams,
  SmartTestSelectionParams
} from './tools/qe/regression/index.js';
import {
  validateRequirements,
  generateBddScenarios,
  ValidateRequirementsParams,
  GenerateBddScenariosParams
} from './tools/qe/requirements/index.js';
import {
  analyzeComplexity,
  calculateQualityMetrics,
  ComplexityAnalysisParams,
  QualityMetricsParams
} from './tools/qe/code-quality/index.js';
import {
  coordinateFleet,
  getAgentStatus,
  FleetCoordinationParams,
  AgentStatusParams
} from './tools/qe/fleet/index.js';

/**
 * Agentic QE MCP Server
 *
 * Handles MCP tool requests and coordinates with QE fleet components.
 * Integrates with Claude Flow coordination patterns and sublinear-core optimization.
 */
export class AgenticQEMCPServer {
  private server: Server;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- handlers have varied signatures from MCP SDK
  private handlers: Map<string, any>;
  private registry: AgentRegistry;
  private hookExecutor: HookExecutor;
  private memory: SwarmMemoryManager;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shared maps used by multiple handlers with different structures
  private memoryStore: Map<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- blackboard messages have handler-specific structure
  private blackboard: Map<string, any[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- proposals have handler-specific structure
  private proposals: Map<string, any>;
  private eventBus: EventEmitter;
  private learningListener: LearningEventListener | null;
  private sleepScheduler: SleepScheduler | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'agentic-qe-server',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {},
          logging: {}
        }
      }
    );

    // Initialize services
    this.registry = getAgentRegistry({
      maxAgents: 50,
      enableMetrics: true
    });

    this.hookExecutor = getHookExecutor({
      enabled: true,
      dryRun: false,
      timeout: 30000
    });

    // Initialize shared memory structures for coordination
    // Use singleton pattern to ensure all components share the same database connection
    // This prevents data fragmentation where data written by one component isn't visible to others
    this.memory = getSharedMemoryManager('.agentic-qe/memory.db');
    this.memoryStore = new Map();
    this.blackboard = new Map();
    this.proposals = new Map();

    // Initialize event bus for learning event coordination
    this.eventBus = new EventEmitter();
    this.eventBus.setMaxListeners(100); // Support many concurrent agents
    this.learningListener = null; // Will be initialized after handlers

    this.handlers = new Map();
    this.initializeHandlers();
    this.initializeLearningListener(); // Initialize learning listener after handlers
    this.setupRequestHandlers();
  }

  /**
   * Initialize tool handlers
   */
  private initializeHandlers(): void {
    // Core fleet management handlers
    this.handlers.set(TOOL_NAMES.FLEET_INIT, new FleetInitHandler(this.registry, this.hookExecutor));
    this.handlers.set(TOOL_NAMES.AGENT_SPAWN, new AgentSpawnHandler(this.registry, this.hookExecutor));
    this.handlers.set(TOOL_NAMES.FLEET_STATUS, new FleetStatusHandler(this.registry, this.hookExecutor));

    // Test lifecycle handlers
    // REMOVED: TEST_GENERATE - use TEST_GENERATE_ENHANCED instead (Issue #115 Phase 1)
    this.handlers.set(TOOL_NAMES.TEST_EXECUTE, new TestExecuteHandler(this.registry, this.hookExecutor));

    // Orchestration handlers
    this.handlers.set(TOOL_NAMES.TASK_ORCHESTRATE, new TaskOrchestrateHandler(this.registry, this.hookExecutor, this.memory));
    // REMOVED: OPTIMIZE_TESTS - use TEST_OPTIMIZE_SUBLINEAR instead (Issue #115 Phase 1)
    // REMOVED: QUALITY_ANALYZE - use QE_QUALITYGATE_EVALUATE instead (Issue #115 Phase 1)
    // REMOVED: PREDICT_DEFECTS - use PREDICT_DEFECTS_AI instead (Issue #115 Phase 1)

    // Enhanced test tool handlers
    // Pass registry to enable automatic learning from every execution
    this.handlers.set(TOOL_NAMES.TEST_GENERATE_ENHANCED, new TestGenerateEnhancedHandler(this.registry));
    this.handlers.set(TOOL_NAMES.TEST_EXECUTE_PARALLEL, new TestExecuteParallelHandler());
    this.handlers.set(TOOL_NAMES.TEST_OPTIMIZE_SUBLINEAR, new TestOptimizeSublinearHandler());
    this.handlers.set(TOOL_NAMES.TEST_REPORT_COMPREHENSIVE, new TestReportComprehensiveHandler());
    this.handlers.set(TOOL_NAMES.TEST_COVERAGE_DETAILED, new TestCoverageDetailedHandler());

    // Memory management handlers - all share the same memoryStore
    // Issue #79 Fix: Pass SwarmMemoryManager for persistent storage
    this.handlers.set(TOOL_NAMES.MEMORY_STORE, new MemoryStoreHandler(this.registry, this.hookExecutor, this.memoryStore, this.memory));
    this.handlers.set(TOOL_NAMES.MEMORY_RETRIEVE, new MemoryRetrieveHandler(this.registry, this.hookExecutor, this.memoryStore));
    this.handlers.set(TOOL_NAMES.MEMORY_QUERY, new MemoryQueryHandler(this.registry, this.hookExecutor, this.memoryStore));
    this.handlers.set(TOOL_NAMES.MEMORY_SHARE, new MemoryShareHandler(this.registry, this.hookExecutor, this.memoryStore));
    this.handlers.set(TOOL_NAMES.MEMORY_BACKUP, new MemoryBackupHandler(this.registry, this.hookExecutor, this.memoryStore));

    // Blackboard pattern handlers - share the same blackboard
    this.handlers.set(TOOL_NAMES.BLACKBOARD_POST, new BlackboardPostHandler(this.registry, this.hookExecutor, this.blackboard));
    this.handlers.set(TOOL_NAMES.BLACKBOARD_READ, new BlackboardReadHandler(this.registry, this.hookExecutor, this.blackboard));

    // Consensus handlers - share the same proposals
    this.handlers.set(TOOL_NAMES.CONSENSUS_PROPOSE, new ConsensusProposeHandler(this.registry, this.hookExecutor, this.proposals));
    this.handlers.set(TOOL_NAMES.CONSENSUS_VOTE, new ConsensusVoteHandler(this.registry, this.hookExecutor, this.proposals));

    // Artifact management handlers
    this.handlers.set(TOOL_NAMES.ARTIFACT_MANIFEST, new ArtifactManifestHandler(this.registry, this.hookExecutor));

    // Coordination handlers (Phase 1)
    this.handlers.set(TOOL_NAMES.WORKFLOW_CREATE, new WorkflowCreateHandler(this.registry, this.hookExecutor));
    this.handlers.set(TOOL_NAMES.WORKFLOW_EXECUTE, new WorkflowExecuteHandler(this.registry, this.hookExecutor, this.memory));
    this.handlers.set(TOOL_NAMES.WORKFLOW_CHECKPOINT, new WorkflowCheckpointHandler(this.memory));
    this.handlers.set(TOOL_NAMES.WORKFLOW_RESUME, new WorkflowResumeHandler(this.memory, this.hookExecutor));
    this.handlers.set(TOOL_NAMES.TASK_STATUS, new TaskStatusHandler(this.memory));
    this.handlers.set(TOOL_NAMES.EVENT_EMIT, new EventEmitHandler(this.memory));
    this.handlers.set(TOOL_NAMES.EVENT_SUBSCRIBE, new EventSubscribeHandler(this.memory));

    // Quality gate handlers - REMOVED (Issue #115 Phase 1)
    // Use QE_QUALITYGATE_* handlers instead (qe_qualitygate_evaluate, qe_qualitygate_validate_metrics, etc.)

    // Prediction and analysis handlers
    // this.handlers.set(TOOL_NAMES.FLAKY_TEST_DETECT, new FlakyTestDetectHandler(this.registry, this.hookExecutor)); // DEPRECATED - absorbed into FLAKY_DETECT_STATISTICAL
    this.handlers.set(TOOL_NAMES.PREDICT_DEFECTS_AI, new PredictDefectsAIHandler(this.registry, this.hookExecutor));
    // this.handlers.set(TOOL_NAMES.REGRESSION_RISK_ANALYZE, new RegressionRiskAnalyzeHandler(this.registry, this.hookExecutor)); // REMOVED - use QE_REGRESSION_ANALYZE_RISK instead (Issue #115)
    this.handlers.set(TOOL_NAMES.VISUAL_TEST_REGRESSION, new VisualTestRegressionHandler(this.registry, this.hookExecutor));
    this.handlers.set(TOOL_NAMES.DEPLOYMENT_READINESS_CHECK, new DeploymentReadinessCheckHandler(this.registry, this.hookExecutor));

    // Analysis handlers
    this.handlers.set(TOOL_NAMES.COVERAGE_ANALYZE_SUBLINEAR, new CoverageAnalyzeSublinearHandler());
    this.handlers.set(TOOL_NAMES.COVERAGE_GAPS_DETECT, new CoverageGapsDetectHandler());
    // this.handlers.set(TOOL_NAMES.PERFORMANCE_BENCHMARK_RUN, new PerformanceBenchmarkRunHandler()); // DEPRECATED - absorbed into PERFORMANCE_RUN_BENCHMARK
    this.handlers.set(TOOL_NAMES.PERFORMANCE_MONITOR_REALTIME, new PerformanceMonitorRealtimeHandler());
    // this.handlers.set(TOOL_NAMES.SECURITY_SCAN_COMPREHENSIVE, new SecurityScanComprehensiveHandler()); // DEPRECATED - use QE_SECURITY_SCAN_COMPREHENSIVE

    // Streaming handlers (v1.0.5) - Note: These require special handling for AsyncGenerator
    // They use the same memoryStore and eventBus as other handlers
    // Create a shared EventEmitter for streaming if memory doesn't have one
    const streamingEventBus = new EventEmitter();
    this.handlers.set(TOOL_NAMES.TEST_EXECUTE_STREAM,
      new TestExecuteStreamHandler(this.memoryStore, streamingEventBus));
    this.handlers.set(TOOL_NAMES.COVERAGE_ANALYZE_STREAM,
      new CoverageAnalyzeStreamHandler(this.memoryStore, streamingEventBus));

    // Phase 2 Management Tools Handler
    const phase2Handler = new Phase2ToolsHandler(this.registry, this.hookExecutor, this.memory);
    this.handlers.set(TOOL_NAMES.LEARNING_STATUS, phase2Handler);
    this.handlers.set(TOOL_NAMES.LEARNING_TRAIN, phase2Handler);
    this.handlers.set(TOOL_NAMES.LEARNING_HISTORY, phase2Handler);
    this.handlers.set(TOOL_NAMES.LEARNING_RESET, phase2Handler);
    this.handlers.set(TOOL_NAMES.LEARNING_EXPORT, phase2Handler);
    this.handlers.set(TOOL_NAMES.PATTERN_STORE, phase2Handler);
    this.handlers.set(TOOL_NAMES.PATTERN_FIND, phase2Handler);
    this.handlers.set(TOOL_NAMES.PATTERN_EXTRACT, phase2Handler);
    this.handlers.set(TOOL_NAMES.PATTERN_SHARE, phase2Handler);
    this.handlers.set(TOOL_NAMES.PATTERN_STATS, phase2Handler);
    this.handlers.set(TOOL_NAMES.IMPROVEMENT_STATUS, phase2Handler);
    this.handlers.set(TOOL_NAMES.IMPROVEMENT_CYCLE, phase2Handler);
    this.handlers.set(TOOL_NAMES.IMPROVEMENT_AB_TEST, phase2Handler);
    this.handlers.set(TOOL_NAMES.IMPROVEMENT_FAILURES, phase2Handler);
    this.handlers.set(TOOL_NAMES.PERFORMANCE_TRACK, phase2Handler);

    // Phase 6: Learning Service Tools (Hybrid Approach - Option C)
    // These tools enable learning persistence when using Claude Code Task tool
    // Pass eventBus to enable explicit learning tracking (prevents duplicate auto-storage)
    this.handlers.set(TOOL_NAMES.LEARNING_STORE_EXPERIENCE, new LearningStoreExperienceHandler(this.registry, this.hookExecutor, this.memory, this.eventBus));
    this.handlers.set(TOOL_NAMES.LEARNING_STORE_QVALUE, new LearningStoreQValueHandler(this.registry, this.hookExecutor, this.memory, this.eventBus));
    this.handlers.set(TOOL_NAMES.LEARNING_STORE_PATTERN, new LearningStorePatternHandler(this.registry, this.hookExecutor, this.memory, this.eventBus));
    this.handlers.set(TOOL_NAMES.LEARNING_QUERY, new LearningQueryHandler(this.registry, this.hookExecutor, this.memory));

    // Phase 3 Domain-Specific Tools Handler
    const phase3Handler = new Phase3DomainToolsHandler(this.registry, this.hookExecutor);
    // Accessibility Tools
    this.handlers.set(TOOL_NAMES.A11Y_SCAN_COMPREHENSIVE, phase3Handler);
    // Coverage Domain Tools
    this.handlers.set(TOOL_NAMES.COVERAGE_ANALYZE_WITH_RISK_SCORING, phase3Handler);
    this.handlers.set(TOOL_NAMES.COVERAGE_DETECT_GAPS_ML, phase3Handler);
    this.handlers.set(TOOL_NAMES.COVERAGE_RECOMMEND_TESTS, phase3Handler);
    this.handlers.set(TOOL_NAMES.COVERAGE_CALCULATE_TRENDS, phase3Handler);
    // Flaky Detection Tools
    this.handlers.set(TOOL_NAMES.FLAKY_DETECT_STATISTICAL, phase3Handler);
    this.handlers.set(TOOL_NAMES.FLAKY_ANALYZE_PATTERNS, phase3Handler);
    this.handlers.set(TOOL_NAMES.FLAKY_STABILIZE_AUTO, phase3Handler);
    // Performance Tools
    this.handlers.set(TOOL_NAMES.PERFORMANCE_ANALYZE_BOTTLENECKS, phase3Handler);
    this.handlers.set(TOOL_NAMES.PERFORMANCE_GENERATE_REPORT, phase3Handler);
    this.handlers.set(TOOL_NAMES.PERFORMANCE_RUN_BENCHMARK, phase3Handler);
    // Security Tools (legacy tools deprecated - use qe_security_* instead)
    // this.handlers.set(TOOL_NAMES.SECURITY_VALIDATE_AUTH, phase3Handler); // DEPRECATED
    // this.handlers.set(TOOL_NAMES.SECURITY_CHECK_AUTHZ, phase3Handler); // DEPRECATED
    // this.handlers.set(TOOL_NAMES.SECURITY_SCAN_DEPENDENCIES, phase3Handler); // DEPRECATED
    this.handlers.set(TOOL_NAMES.SECURITY_GENERATE_REPORT, phase3Handler);
    // Visual Testing Tools
    this.handlers.set(TOOL_NAMES.VISUAL_COMPARE_SCREENSHOTS, phase3Handler);
    this.handlers.set(TOOL_NAMES.VISUAL_VALIDATE_ACCESSIBILITY, phase3Handler);
    this.handlers.set(TOOL_NAMES.VISUAL_DETECT_REGRESSION, phase3Handler);

    // Phase 3: New Domain Tools Registration
    // Security Domain (3 tools)
    this.handlers.set(TOOL_NAMES.QE_SECURITY_SCAN_COMPREHENSIVE, phase3Handler);
    this.handlers.set(TOOL_NAMES.QE_SECURITY_DETECT_VULNERABILITIES, phase3Handler);
    this.handlers.set(TOOL_NAMES.QE_SECURITY_VALIDATE_COMPLIANCE, phase3Handler);
    // Test-Generation Domain (4 tools)
    this.handlers.set(TOOL_NAMES.QE_TESTGEN_GENERATE_UNIT, phase3Handler);
    this.handlers.set(TOOL_NAMES.QE_TESTGEN_GENERATE_INTEGRATION, phase3Handler);
    this.handlers.set(TOOL_NAMES.QE_TESTGEN_OPTIMIZE_SUITE, phase3Handler);
    this.handlers.set(TOOL_NAMES.QE_TESTGEN_ANALYZE_QUALITY, phase3Handler);
    // Quality-Gates Domain (5 tools - includes GOAP)
    this.handlers.set(TOOL_NAMES.QE_QUALITYGATE_EVALUATE, phase3Handler);
    this.handlers.set(TOOL_NAMES.QE_QUALITYGATE_EVALUATE_GOAP, phase3Handler);
    this.handlers.set(TOOL_NAMES.QE_QUALITYGATE_ASSESS_RISK, phase3Handler);
    this.handlers.set(TOOL_NAMES.QE_QUALITYGATE_VALIDATE_METRICS, phase3Handler);
    this.handlers.set(TOOL_NAMES.QE_QUALITYGATE_GENERATE_REPORT, phase3Handler);
  }

  /**
   * Initialize Learning Event Listener (Phase 6 - Hybrid Approach)
   *
   * This sets up automatic learning persistence as a safety net when agents
   * don't explicitly call MCP learning tools. It's part of our hybrid approach:
   * - PRIMARY: Agents call MCP tools explicitly (Claude Flow's pattern)
   * - FALLBACK: Event listener auto-stores (our innovation)
   */
  private initializeLearningListener(): void {
    try {
      const storeExperienceHandler = this.handlers.get(TOOL_NAMES.LEARNING_STORE_EXPERIENCE) as LearningStoreExperienceHandler;
      const storeQValueHandler = this.handlers.get(TOOL_NAMES.LEARNING_STORE_QVALUE) as LearningStoreQValueHandler;
      const storePatternHandler = this.handlers.get(TOOL_NAMES.LEARNING_STORE_PATTERN) as LearningStorePatternHandler;

      if (!storeExperienceHandler || !storeQValueHandler || !storePatternHandler) {
        console.warn('[AgenticQEMCPServer] Learning handlers not initialized - skipping event listener');
        return;
      }

      this.learningListener = initLearningEventListener(
        this.eventBus,
        this.memory,
        {
          storeExperienceHandler,
          storeQValueHandler,
          storePatternHandler
        },
        {
          enabled: true,
          autoStore: true
        }
      );

      console.log('[AgenticQEMCPServer] ✅ Learning Event Listener initialized (Hybrid Approach)');
      console.log('[AgenticQEMCPServer]    PRIMARY: Explicit MCP tool calls');
      console.log('[AgenticQEMCPServer]    FALLBACK: Automatic event-based persistence');

    } catch (error) {
      console.error('[AgenticQEMCPServer] Failed to initialize learning listener:', error);
      this.learningListener = null;
    }
  }

  /**
   * Setup MCP request handlers
   */
  private setupRequestHandlers(): void {
    // Handle tool listing requests
    // Issue #115 Phase 2: Use lazy loader to return only core tools initially
    // This reduces token count by ~80% (14 core tools vs 87 total)
    // Domain-specific tools are loaded on-demand via tools_load_domain
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const loader = getToolLoader();
      const coreTools = loader.getCoreTools();
      const stats = loader.getStats();

      // Log stats for debugging (can be removed in production)
      console.error(`[Lazy Loader] Returning ${coreTools.length} core tools (${stats.totalAvailable} available)`);

      return {
        tools: coreTools
      };
    });

    // Handle tool call requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Meta-tools for hierarchical tool loading (Phase 2 Optimization - Issue #115)
        // These are handled inline before regular handler validation
        if (name === TOOL_NAMES.TOOLS_DISCOVER) {
          const safeArgs = (args || {}) as { category?: string; includeDescriptions?: boolean };
          const categoryInput = safeArgs.category || 'all';
          const includeDescriptions = safeArgs.includeDescriptions || false;
          const toolLoader = getToolLoader();
          const stats = toolLoader.getStats();

          // Support multiple categories (comma-separated)
          const requestedCategories = categoryInput.split(',').map(c => c.trim().toLowerCase());
          const shouldIncludeCategory = (cat: string) =>
            requestedCategories.includes('all') || requestedCategories.includes(cat);

          // Calculate statistics
          const totalAvailable = TOOL_STATS.total;
          const totalLoaded = stats.totalLoaded;
          const loadingPercentage = totalAvailable > 0
            ? Math.round((totalLoaded / totalAvailable) * 100)
            : 0;

          const result: Record<string, unknown> = {
            success: true,
            timestamp: new Date().toISOString(),

            // Overall statistics
            statistics: {
              totalAvailable,
              totalLoaded,
              loadingPercentage: `${loadingPercentage}%`,
              breakdown: {
                core: {
                  available: TOOL_STATS.core,
                  loaded: TOOL_STATS.core,
                  status: 'always loaded'
                },
                domains: {
                  available: TOOL_STATS.domains,
                  loaded: stats.loadedDomains.filter(d =>
                    Object.keys(DOMAIN_TOOLS).includes(d)
                  ).reduce((sum, d) => sum + DOMAIN_TOOLS[d as keyof typeof DOMAIN_TOOLS].length, 0),
                  loadedDomains: stats.loadedDomains.filter(d =>
                    Object.keys(DOMAIN_TOOLS).includes(d)
                  ),
                  availableDomains: Object.keys(DOMAIN_TOOLS)
                },
                specialized: {
                  available: TOOL_STATS.specialized,
                  loaded: stats.loadedDomains.filter(d =>
                    Object.keys(SPECIALIZED_TOOLS).includes(d)
                  ).reduce((sum, d) => sum + SPECIALIZED_TOOLS[d as keyof typeof SPECIALIZED_TOOLS].length, 0),
                  loadedDomains: stats.loadedDomains.filter(d =>
                    Object.keys(SPECIALIZED_TOOLS).includes(d)
                  ),
                  availableDomains: Object.keys(SPECIALIZED_TOOLS)
                },
                coordination: {
                  available: TOOL_STATS.coordination,
                  loaded: stats.loadedDomains.includes('coordination') ? TOOL_STATS.coordination : 0,
                  status: stats.loadedDomains.includes('coordination') ? 'loaded' : 'available'
                }
              }
            },

            // Category-specific details
            categories: {} as Record<string, unknown>
          };

          // Core tools
          if (shouldIncludeCategory('core')) {
            (result.categories as Record<string, unknown>).core = {
              description: 'Always-loaded essential QE tools',
              count: TOOL_STATS.core,
              status: 'loaded',
              tools: includeDescriptions
                ? CORE_TOOLS.map(t => ({ name: t, loaded: true, category: 'core' }))
                : CORE_TOOLS.slice()
            };
          }

          // Domain tools
          if (shouldIncludeCategory('domains')) {
            const domainDetails = Object.entries(DOMAIN_TOOLS).map(([domain, tools]) => ({
              domain,
              count: tools.length,
              loaded: stats.loadedDomains.includes(domain),
              keywords: DOMAIN_KEYWORDS[domain as keyof typeof DOMAIN_KEYWORDS],
              tools: includeDescriptions ? tools.map(t => ({
                name: t,
                loaded: stats.loadedDomains.includes(domain),
                category: 'domain',
                domain
              })) : tools.slice()
            }));

            (result.categories as Record<string, unknown>).domains = {
              description: 'Domain-specific tools loaded on demand via keyword detection',
              totalCount: TOOL_STATS.domains,
              loadedCount: domainDetails.filter(d => d.loaded).reduce((sum, d) => sum + d.count, 0),
              availableDomains: domainDetails
            };
          }

          // Specialized tools
          if (shouldIncludeCategory('specialized')) {
            const specializedDetails = Object.entries(SPECIALIZED_TOOLS).map(([domain, tools]) => ({
              domain,
              count: tools.length,
              loaded: stats.loadedDomains.includes(domain),
              loadMethod: 'explicit request via tools_load_domain',
              tools: includeDescriptions ? tools.map(t => ({
                name: t,
                loaded: stats.loadedDomains.includes(domain),
                category: 'specialized',
                domain
              })) : tools.slice()
            }));

            (result.categories as Record<string, unknown>).specialized = {
              description: 'Advanced tools for expert use, loaded explicitly',
              totalCount: TOOL_STATS.specialized,
              loadedCount: specializedDetails.filter(d => d.loaded).reduce((sum, d) => sum + d.count, 0),
              availableDomains: specializedDetails
            };
          }

          // Coordination tools
          if (shouldIncludeCategory('coordination')) {
            (result.categories as Record<string, unknown>).coordination = {
              description: 'Workflow and inter-agent coordination tools',
              count: TOOL_STATS.coordination,
              loaded: stats.loadedDomains.includes('coordination'),
              tools: includeDescriptions
                ? COORDINATION_TOOLS.map(t => ({
                    name: t,
                    loaded: stats.loadedDomains.includes('coordination'),
                    category: 'coordination'
                  }))
                : COORDINATION_TOOLS.slice()
            };
          }

          // Add usage hints if all categories requested
          if (requestedCategories.includes('all')) {
            (result as Record<string, unknown>).usage = {
              tips: [
                'Filter by category: use category="core,domains" for multiple categories',
                'Load domain tools: use tools_load_domain with domain name',
                'Auto-loading: Domain tools load automatically when keywords are detected',
                'Include descriptions: set includeDescriptions=true for detailed tool info'
              ],
              availableCategories: ['core', 'domains', 'specialized', 'coordination', 'all'],
              loadableDomains: [
                ...Object.keys(DOMAIN_TOOLS),
                ...Object.keys(SPECIALIZED_TOOLS),
                'coordination'
              ]
            };
          }

          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        if (name === TOOL_NAMES.TOOLS_LOAD_DOMAIN) {
          type DomainType = 'security' | 'performance' | 'coverage' | 'quality' | 'flaky' | 'visual' | 'requirements' | 'learning' | 'advanced';
          const safeArgs = (args || {}) as { domain?: string; preload?: boolean };
          const domain = safeArgs.domain as DomainType;
          const preload = safeArgs.preload || false;

          if (!domain) {
            throw new McpError(ErrorCode.InvalidParams, 'domain parameter is required');
          }

          const toolLoader = getToolLoader();
          const loadResult = toolLoader.loadDomain(domain);
          const stats = toolLoader.getStats();

          const result: Record<string, unknown> = {
            success: loadResult.success,
            timestamp: new Date().toISOString(),
            domain,
            toolsLoaded: loadResult.toolsLoaded.length,
            tools: loadResult.toolsLoaded,
            alreadyLoaded: loadResult.alreadyLoaded,
            totalLoadedDomains: stats.loadedDomains,
            message: loadResult.alreadyLoaded
              ? `Domain '${domain}' was already loaded`
              : loadResult.toolsLoaded.length > 0
                ? `Successfully loaded ${loadResult.toolsLoaded.length} tools from ${domain} domain`
                : `Domain '${domain}' not found`
          };

          // Optionally preload related domains
          if (preload && loadResult.toolsLoaded.length > 0) {
            const relatedDomains: Record<string, DomainType[]> = {
              security: ['coverage', 'quality'],
              performance: ['coverage', 'quality'],
              coverage: ['quality'],
              quality: ['coverage'],
              flaky: ['coverage', 'performance'],
              visual: ['requirements'],
              requirements: ['visual']
            };

            const related = relatedDomains[domain] || [];
            const preloadedTools: string[] = [];

            for (const relatedDomain of related) {
              const relatedResult = toolLoader.loadDomain(relatedDomain);
              preloadedTools.push(...relatedResult.toolsLoaded);
            }

            const updatedStats = toolLoader.getStats();
            if (preloadedTools.length > 0) {
              result.preloaded = {
                domains: related.filter(d => updatedStats.loadedDomains.includes(d)),
                tools: preloadedTools
              };
            }
          }

          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        // Validate tool exists (for non-meta-tools)
        if (!this.handlers.has(name)) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );
        }

        // Get handler - already validated above so we assert non-null
        const handler = this.handlers.get(name)!;

        // Phase 6 learning tools have dedicated handlers - call them directly
        if (name === TOOL_NAMES.LEARNING_STORE_EXPERIENCE ||
            name === TOOL_NAMES.LEARNING_STORE_QVALUE ||
            name === TOOL_NAMES.LEARNING_STORE_PATTERN ||
            name === TOOL_NAMES.LEARNING_QUERY) {
          const result = await handler.handle(args || {});
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        // Special handling for Phase 2 tools - route to specific methods
        // Note: Args come from external MCP input, cast through unknown for type safety
        if (name.startsWith('mcp__agentic_qe__learning_')) {
          const phase2Handler = handler as Phase2ToolsHandler;
          const safeArgs = (args || {}) as unknown;
          let result: unknown;
          switch (name) {
            case TOOL_NAMES.LEARNING_STATUS:
              result = await phase2Handler.handleLearningStatus(safeArgs as { agentId?: string; detailed?: boolean });
              break;
            case TOOL_NAMES.LEARNING_TRAIN:
              result = await phase2Handler.handleLearningTrain(safeArgs as { agentId: string; task: Record<string, unknown>; result: Record<string, unknown>; feedback?: LearningFeedback });
              break;
            case TOOL_NAMES.LEARNING_HISTORY:
              result = await phase2Handler.handleLearningHistory(safeArgs as { agentId: string; limit?: number });
              break;
            case TOOL_NAMES.LEARNING_RESET:
              result = await phase2Handler.handleLearningReset(safeArgs as { agentId: string; confirm: boolean });
              break;
            case TOOL_NAMES.LEARNING_EXPORT:
              result = await phase2Handler.handleLearningExport(safeArgs as { agentId?: string; format?: 'json' | 'csv' });
              break;
            default:
              throw new McpError(ErrorCode.MethodNotFound, `Unknown learning tool: ${name}`);
          }
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        if (name.startsWith('mcp__agentic_qe__pattern_')) {
          const phase2Handler = handler as Phase2ToolsHandler;
          const safeArgs = (args || {}) as unknown;
          let result: unknown;
          switch (name) {
            case TOOL_NAMES.PATTERN_STORE:
              result = await phase2Handler.handlePatternStore(safeArgs as { pattern: TestPattern });
              break;
            case TOOL_NAMES.PATTERN_FIND:
              result = await phase2Handler.handlePatternFind(safeArgs as { query: { framework?: string; language?: string; keywords?: string[]; codeType?: string }; minConfidence?: number; limit?: number });
              break;
            case TOOL_NAMES.PATTERN_EXTRACT:
              result = await phase2Handler.handlePatternExtract(safeArgs as { testFiles: string[]; projectId: string });
              break;
            case TOOL_NAMES.PATTERN_SHARE:
              result = await phase2Handler.handlePatternShare(safeArgs as { patternId: string; projectIds: string[] });
              break;
            case TOOL_NAMES.PATTERN_STATS:
              result = await phase2Handler.handlePatternStats(safeArgs as Record<string, unknown>);
              break;
            default:
              throw new McpError(ErrorCode.MethodNotFound, `Unknown pattern tool: ${name}`);
          }
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        if (name.startsWith('mcp__agentic_qe__improvement_') || name === TOOL_NAMES.PERFORMANCE_TRACK) {
          const phase2Handler = handler as Phase2ToolsHandler;
          const safeArgs = (args || {}) as unknown;
          let result: unknown;
          switch (name) {
            case TOOL_NAMES.IMPROVEMENT_STATUS:
              result = await phase2Handler.handleImprovementStatus(safeArgs as { agentId?: string });
              break;
            case TOOL_NAMES.IMPROVEMENT_CYCLE:
              result = await phase2Handler.handleImprovementCycle(safeArgs as { agentId: string; force?: boolean });
              break;
            case TOOL_NAMES.IMPROVEMENT_AB_TEST:
              result = await phase2Handler.handleImprovementABTest(safeArgs as { strategyA: string; strategyB: string; iterations?: number });
              break;
            case TOOL_NAMES.IMPROVEMENT_FAILURES:
              result = await phase2Handler.handleImprovementFailures(safeArgs as { agentId?: string; limit?: number });
              break;
            case TOOL_NAMES.PERFORMANCE_TRACK:
              result = await phase2Handler.handlePerformanceTrack(safeArgs as { agentId: string; metrics: { tasksCompleted: number; successRate: number; averageExecutionTime: number; errorRate: number; userSatisfaction: number; resourceEfficiency: number } });
              break;
            default:
              throw new McpError(ErrorCode.MethodNotFound, `Unknown improvement tool: ${name}`);
          }
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        // Phase 3 Domain-Specific Tools routing
        if (name.startsWith('mcp__agentic_qe__coverage_') ||
            name.startsWith('mcp__agentic_qe__flaky_') ||
            name.startsWith('mcp__agentic_qe__performance_') ||
            name.startsWith('mcp__agentic_qe__security_') ||
            name.startsWith('mcp__agentic_qe__visual_') ||
            name.startsWith('mcp__agentic_qe__qe_security_') ||
            name.startsWith('mcp__agentic_qe__qe_testgen_') ||
            name.startsWith('mcp__agentic_qe__qe_qualitygate_')) {
          const phase3Handler = handler as Phase3DomainToolsHandler;
          const safeArgs = args || {};
          let result;

          // Coverage Domain Tools
          if (name === TOOL_NAMES.COVERAGE_ANALYZE_WITH_RISK_SCORING) {
            result = await phase3Handler.handleCoverageAnalyzeWithRiskScoring(safeArgs);
          } else if (name === TOOL_NAMES.COVERAGE_DETECT_GAPS_ML) {
            result = await phase3Handler.handleCoverageDetectGapsML(safeArgs);
          } else if (name === TOOL_NAMES.COVERAGE_RECOMMEND_TESTS) {
            result = await phase3Handler.handleCoverageRecommendTests(safeArgs);
          } else if (name === TOOL_NAMES.COVERAGE_CALCULATE_TRENDS) {
            result = await phase3Handler.handleCoverageCalculateTrends(safeArgs);
          }
          // Flaky Detection Tools
          else if (name === TOOL_NAMES.FLAKY_DETECT_STATISTICAL) {
            result = await phase3Handler.handleFlakyDetectStatistical(safeArgs);
          } else if (name === TOOL_NAMES.FLAKY_ANALYZE_PATTERNS) {
            result = await phase3Handler.handleFlakyAnalyzePatterns(safeArgs);
          } else if (name === TOOL_NAMES.FLAKY_STABILIZE_AUTO) {
            result = await phase3Handler.handleFlakyStabilizeAuto(safeArgs);
          }
          // Performance Tools
          else if (name === TOOL_NAMES.PERFORMANCE_ANALYZE_BOTTLENECKS) {
            result = await phase3Handler.handlePerformanceAnalyzeBottlenecks(safeArgs);
          } else if (name === TOOL_NAMES.PERFORMANCE_GENERATE_REPORT) {
            result = await phase3Handler.handlePerformanceGenerateReport(safeArgs);
          } else if (name === TOOL_NAMES.PERFORMANCE_RUN_BENCHMARK) {
            result = await phase3Handler.handlePerformanceRunBenchmark(safeArgs as unknown as PerformanceRunBenchmarkArgs);
          } else if (name === TOOL_NAMES.PERFORMANCE_MONITOR_REALTIME) {
            result = await phase3Handler.handlePerformanceMonitorRealtime(safeArgs as unknown as PerformanceMonitorRealtimeArgs);
          }
          // Security Tools (legacy tools deprecated - use qe_security_* instead)
          // else if (name === TOOL_NAMES.SECURITY_VALIDATE_AUTH) { // DEPRECATED
          //   result = await phase3Handler.handleSecurityValidateAuth(safeArgs);
          // } else if (name === TOOL_NAMES.SECURITY_CHECK_AUTHZ) { // DEPRECATED
          //   result = await phase3Handler.handleSecurityCheckAuthz(safeArgs);
          // } else if (name === TOOL_NAMES.SECURITY_SCAN_DEPENDENCIES) { // DEPRECATED
          //   result = await phase3Handler.handleSecurityScanDependencies(safeArgs);
          // }
          else if (name === TOOL_NAMES.SECURITY_GENERATE_REPORT) {
            result = await phase3Handler.handleSecurityGenerateReport(safeArgs);
          }
          // else if (name === TOOL_NAMES.SECURITY_SCAN_COMPREHENSIVE) { // DEPRECATED - use QE_SECURITY_SCAN_COMPREHENSIVE
          //   result = await phase3Handler.handleSecurityScanComprehensive(safeArgs);
          // }
          // Visual Testing Tools
          else if (name === TOOL_NAMES.VISUAL_COMPARE_SCREENSHOTS) {
            result = await phase3Handler.handleVisualCompareScreenshots(safeArgs as unknown as VisualCompareScreenshotsArgs);
          } else if (name === TOOL_NAMES.VISUAL_VALIDATE_ACCESSIBILITY) {
            result = await phase3Handler.handleVisualValidateAccessibility(safeArgs as unknown as VisualValidateAccessibilityArgs);
          } else if (name === TOOL_NAMES.VISUAL_DETECT_REGRESSION) {
            result = await phase3Handler.handleVisualDetectRegression(safeArgs as unknown as VisualDetectRegressionArgs);
          }
          // Phase 3: New Domain Tools Routing
          // Security Domain
          else if (name === TOOL_NAMES.QE_SECURITY_SCAN_COMPREHENSIVE) {
            result = await phase3Handler.handleQeSecurityScanComprehensive(safeArgs as unknown as QeSecurityScanComprehensiveArgs);
          } else if (name === TOOL_NAMES.QE_SECURITY_DETECT_VULNERABILITIES) {
            result = await phase3Handler.handleQeSecurityDetectVulnerabilities(safeArgs);
          } else if (name === TOOL_NAMES.QE_SECURITY_VALIDATE_COMPLIANCE) {
            result = await phase3Handler.handleQeSecurityValidateCompliance(safeArgs);
          }
          // Test-Generation Domain
          else if (name === TOOL_NAMES.QE_TESTGEN_GENERATE_UNIT) {
            result = await phase3Handler.handleQeTestgenGenerateUnit(safeArgs);
          } else if (name === TOOL_NAMES.QE_TESTGEN_GENERATE_INTEGRATION) {
            result = await phase3Handler.handleQeTestgenGenerateIntegration(safeArgs);
          } else if (name === TOOL_NAMES.QE_TESTGEN_OPTIMIZE_SUITE) {
            result = await phase3Handler.handleQeTestgenOptimizeSuite(safeArgs);
          } else if (name === TOOL_NAMES.QE_TESTGEN_ANALYZE_QUALITY) {
            result = await phase3Handler.handleQeTestgenAnalyzeQuality(safeArgs);
          }
          // Quality-Gates Domain (5 tools - includes GOAP)
          else if (name === TOOL_NAMES.QE_QUALITYGATE_EVALUATE) {
            result = await phase3Handler.handleQeQualitygateEvaluate(safeArgs as unknown as QeQualitygateEvaluateArgs);
          } else if (name === TOOL_NAMES.QE_QUALITYGATE_EVALUATE_GOAP) {
            result = await phase3Handler.handleQeQualitygateEvaluateGoap(safeArgs as unknown as QeQualitygateEvaluateGoapArgs);
          } else if (name === TOOL_NAMES.QE_QUALITYGATE_ASSESS_RISK) {
            result = await phase3Handler.handleQeQualitygateAssessRisk(safeArgs);
          } else if (name === TOOL_NAMES.QE_QUALITYGATE_VALIDATE_METRICS) {
            result = await phase3Handler.handleQeQualitygateValidateMetrics(safeArgs);
          } else if (name === TOOL_NAMES.QE_QUALITYGATE_GENERATE_REPORT) {
            result = await phase3Handler.handleQeQualitygateGenerateReport(safeArgs as unknown as QeQualitygateGenerateReportArgs);
          }
          // Accessibility Domain (1 tool)
          else if (name === TOOL_NAMES.A11Y_SCAN_COMPREHENSIVE) {
            result = await scanComprehensive(safeArgs as unknown as ScanComprehensiveParams);
          }
          // API-Contract Domain (3 tools)
          else if (name === TOOL_NAMES.QE_APICONTRACT_VALIDATE) {
            result = await validateApiContract(safeArgs as unknown as ValidateApiContractParams);
          } else if (name === TOOL_NAMES.QE_APICONTRACT_BREAKING_CHANGES) {
            result = await detectBreakingChanges(safeArgs as unknown as DetectBreakingChangesParams);
          } else if (name === TOOL_NAMES.QE_APICONTRACT_VERSIONING) {
            result = await validateApiVersioning(safeArgs as unknown as ValidateApiVersioningParams);
          }
          // Test-Data Domain (3 tools)
          else if (name === TOOL_NAMES.QE_TESTDATA_GENERATE) {
            result = await generateTestData(safeArgs as unknown as GenerateTestDataParams);
          } else if (name === TOOL_NAMES.QE_TESTDATA_MASK) {
            result = await maskSensitiveData(safeArgs as unknown as MaskSensitiveDataParams);
          } else if (name === TOOL_NAMES.QE_TESTDATA_SCHEMA) {
            result = await analyzeSchema(safeArgs as unknown as AnalyzeSchemaParams);
          }
          // Regression Domain (2 tools)
          else if (name === TOOL_NAMES.QE_REGRESSION_ANALYZE_RISK) {
            result = await analyzeRegressionRisk(safeArgs as unknown as RegressionRiskAnalysisParams);
          } else if (name === TOOL_NAMES.QE_REGRESSION_SELECT_TESTS) {
            result = await selectRegressionTests(safeArgs as unknown as SmartTestSelectionParams);
          }
          // Requirements Domain (2 tools)
          else if (name === TOOL_NAMES.QE_REQUIREMENTS_VALIDATE) {
            result = await validateRequirements(safeArgs as unknown as ValidateRequirementsParams);
          } else if (name === TOOL_NAMES.QE_REQUIREMENTS_BDD) {
            result = await generateBddScenarios(safeArgs as unknown as GenerateBddScenariosParams);
          }
          // Code-Quality Domain (2 tools)
          else if (name === TOOL_NAMES.QE_CODEQUALITY_COMPLEXITY) {
            result = await analyzeComplexity(safeArgs as unknown as ComplexityAnalysisParams);
          } else if (name === TOOL_NAMES.QE_CODEQUALITY_METRICS) {
            result = await calculateQualityMetrics(safeArgs as unknown as QualityMetricsParams);
          }
          // Fleet Management Domain (2 tools)
          else if (name === TOOL_NAMES.QE_FLEET_COORDINATE) {
            result = await coordinateFleet(safeArgs as unknown as FleetCoordinationParams);
          } else if (name === TOOL_NAMES.QE_FLEET_STATUS) {
            result = await getAgentStatus(safeArgs as unknown as AgentStatusParams);
          } else {
            throw new McpError(ErrorCode.MethodNotFound, `Unknown Phase 3 tool: ${name}`);
          }

          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        // Check if this is a streaming handler (has execute method returning AsyncGenerator)
        const isStreamingHandler = handler.execute &&
                                   typeof handler.execute === 'function' &&
                                   handler.execute.constructor.name === 'AsyncGeneratorFunction';

        if (isStreamingHandler) {
          // Handle streaming execution
          interface StreamingEvent {
            type: string;
            data?: unknown;
            [key: string]: unknown;
          }
          const results: StreamingEvent[] = [];
          let finalResult: unknown = null;

          try {
            // Execute streaming handler and collect all events
            for await (const event of handler.execute!(args)) {
              const streamEvent = event as StreamingEvent;
              // Store each event for progressive disclosure
              results.push(streamEvent);

              // Keep track of final result
              if (streamEvent.type === 'result') {
                finalResult = streamEvent.data;
              }

              // Emit progress events to notification channel (if supported)
              if (streamEvent.type === 'progress') {
                this.server.notification({
                  method: 'notifications/message',
                  params: {
                    level: 'info',
                    logger: 'agentic-qe-streaming',
                    data: {
                      tool: name,
                      progress: streamEvent
                    }
                  }
                });
              }
            }

            // Return final result with streaming metadata
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    streaming: true,
                    result: finalResult,
                    events: results,
                    summary: {
                      totalEvents: results.length,
                      progressUpdates: results.filter(e => e.type === 'progress').length,
                      errors: results.filter(e => e.type === 'error').length
                    }
                  }, null, 2)
                }
              ]
            };

          } catch (streamError) {
            // Handle streaming-specific errors
            throw new McpError(
              ErrorCode.InternalError,
              `Streaming execution failed: ${streamError instanceof Error ? streamError.message : String(streamError)}`
            );
          }
        } else {
          // Handle non-streaming execution (original behavior)
          const result = await handler.handle(args);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        }

      } catch (error) {
        // Handle known MCP errors
        if (error instanceof McpError) {
          throw error;
        }

        // Handle unexpected errors
        this.server.notification({
          method: 'notifications/message',
          params: {
            level: 'error',
            logger: 'agentic-qe-server',
            data: {
              tool: name,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined
            }
          }
        });

        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    // Handle logging - removed as onNotification doesn't exist in new SDK
    // this.server.notification('notifications/message', (notification: any) => {
    //   const { level, logger, data } = notification.params;
    //   console.log(`[${level}] ${logger}:`, data);
    // });
  }

  /**
   * Start the MCP server
   */
  async start(transport?: StdioServerTransport): Promise<void> {
    // Initialize database before starting server
    await this.memory.initialize();

    const serverTransport = transport || new StdioServerTransport();
    await this.server.connect(serverTransport);

    // P1 Implementation: Auto-start SleepScheduler for background learning
    await this.startSleepScheduler();

    // Log to stderr to not interfere with MCP stdio protocol
    console.error('Agentic QE MCP Server started successfully');
    console.error(`Available tools: ${agenticQETools.map(t => t.name).join(', ')}`);
  }

  /**
   * Start the SleepScheduler for background learning
   * P1 Implementation: Dream Scheduler Auto-Start
   */
  private async startSleepScheduler(): Promise<void> {
    try {
      // Check if learning is enabled via config file
      const fs = await import('fs-extra');
      const path = await import('path');
      const configPath = path.join(process.cwd(), '.agentic-qe', 'learning-config.json');

      if (!await fs.pathExists(configPath)) {
        console.error('[SleepScheduler] Learning config not found, skipping scheduler start');
        return;
      }

      const config = await fs.readJson(configPath);
      if (!config.enabled) {
        console.error('[SleepScheduler] Learning is disabled in config');
        return;
      }

      // Create and start the scheduler
      this.sleepScheduler = new SleepScheduler({
        mode: config.scheduler?.mode || 'hybrid',
        schedule: config.scheduler?.schedule,
        learningBudget: config.scheduler?.learningBudget || {
          maxPatternsPerCycle: 50,
          maxAgentsPerCycle: 5,
          maxDurationMs: 3600000
        }
      });

      await this.sleepScheduler.start();
      console.error('[SleepScheduler] Background learning scheduler started');
    } catch (error) {
      // Non-critical - log and continue
      console.error('[SleepScheduler] Failed to start:', error instanceof Error ? error.message : String(error));
      this.sleepScheduler = null;
    }
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    // Stop the SleepScheduler if running
    if (this.sleepScheduler) {
      try {
        await this.sleepScheduler.stop();
        console.error('[SleepScheduler] Background learning scheduler stopped');
      } catch (error) {
        console.error('[SleepScheduler] Error stopping scheduler:', error);
      }
      this.sleepScheduler = null;
    }

    // Cleanup all agents
    await this.registry.clearAll();

    await this.server.close();
    console.error('Agentic QE MCP Server stopped');
  }

  /**
   * Get server instance for testing
   */
  getServer(): Server {
    return this.server;
  }

  /**
   * Get available tools
   */
  getTools() {
    return agenticQETools;
  }

  /**
   * Check if tool is supported
   */
  supportsTool(toolName: string): boolean {
    return this.handlers.has(toolName);
  }
}

/**
 * Factory function to create and start MCP server
 */
export async function createAgenticQEServer(): Promise<AgenticQEMCPServer> {
  const server = new AgenticQEMCPServer();
  await server.start();
  return server;
}

/**
 * Main entry point for standalone server execution
 */
export async function main(): Promise<void> {
  try {
    const server = await createAgenticQEServer();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nReceived SIGINT, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\nReceived SIGTERM, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    // Keep process alive
    process.stdin.resume();
  } catch (error) {
    console.error('Failed to start Agentic QE MCP Server:', error);
    process.exit(1);
  }
}

// Start server if this file is run directly
// Note: import.meta requires ES module configuration
// if (import.meta.url === `file://${process.argv[1]}`) {
//   main().catch(console.error);
// }
