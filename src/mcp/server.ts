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
import { agenticQETools, TOOL_NAMES } from './tools.js';
import { FleetInitHandler } from './handlers/fleet-init.js';
import { AgentSpawnHandler } from './handlers/agent-spawn.js';
import { TestGenerateHandler } from './handlers/test-generate.js';
import { TestExecuteHandler } from './handlers/test-execute.js';
import { QualityAnalyzeHandler } from './handlers/quality-analyze.js';
import { PredictDefectsHandler } from './handlers/predict-defects.js';
import { FleetStatusHandler } from './handlers/fleet-status.js';
import { TaskOrchestrateHandler } from './handlers/task-orchestrate.js';
import { OptimizeTestsHandler } from './handlers/optimize-tests.js';
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
import { QualityGateExecuteHandler } from './handlers/quality/quality-gate-execute.js';
import { QualityValidateMetricsHandler } from './handlers/quality/quality-validate-metrics.js';
import { QualityRiskAssessHandler } from './handlers/quality/quality-risk-assess.js';
import { QualityDecisionMakeHandler } from './handlers/quality/quality-decision-make.js';
import { QualityPolicyCheckHandler } from './handlers/quality/quality-policy-check.js';
import { FlakyTestDetectHandler } from './handlers/prediction/flaky-test-detect.js';
import { PredictDefectsAIHandler } from './handlers/prediction/predict-defects-ai.js';
import { RegressionRiskAnalyzeHandler } from './handlers/prediction/regression-risk-analyze.js';
import { VisualTestRegressionHandler } from './handlers/prediction/visual-test-regression.js';
import { DeploymentReadinessCheckHandler } from './handlers/prediction/deployment-readiness-check.js';
import { CoverageAnalyzeSublinearHandler } from './handlers/analysis/coverage-analyze-sublinear-handler.js';
import { CoverageGapsDetectHandler } from './handlers/analysis/coverage-gaps-detect-handler.js';
import { PerformanceBenchmarkRunHandler } from './handlers/analysis/performance-benchmark-run-handler.js';
import { PerformanceMonitorRealtimeHandler } from './handlers/analysis/performance-monitor-realtime-handler.js';
import { SecurityScanComprehensiveHandler } from './handlers/analysis/security-scan-comprehensive-handler.js';
import { AgentRegistry, getAgentRegistry } from './services/AgentRegistry.js';
import { HookExecutor, getHookExecutor } from './services/HookExecutor.js';
import { SwarmMemoryManager } from '../core/memory/SwarmMemoryManager.js';
import { TestExecuteStreamHandler } from './streaming/TestExecuteStreamHandler.js';
import { CoverageAnalyzeStreamHandler } from './streaming/CoverageAnalyzeStreamHandler.js';
import { Phase2ToolsHandler } from './handlers/phase2/Phase2Tools.js';
import { Phase3DomainToolsHandler } from './handlers/phase3/Phase3DomainTools.js';
import { EventEmitter } from 'events';

// Phase 3: Domain-specific tool functions
import {
  validateApiContract,
  detectBreakingChanges,
  validateApiVersioning
} from './tools/qe/api-contract/index.js';
import {
  generateTestData,
  maskSensitiveData,
  analyzeSchema
} from './tools/qe/test-data/index.js';
import {
  analyzeRegressionRisk,
  selectRegressionTests
} from './tools/qe/regression/index.js';
import {
  validateRequirements,
  generateBddScenarios
} from './tools/qe/requirements/index.js';
import {
  analyzeComplexity,
  calculateQualityMetrics
} from './tools/qe/code-quality/index.js';
import {
  coordinateFleet,
  getAgentStatus
} from './tools/qe/fleet/index.js';

/**
 * Agentic QE MCP Server
 *
 * Handles MCP tool requests and coordinates with QE fleet components.
 * Integrates with Claude Flow coordination patterns and sublinear-core optimization.
 */
export class AgenticQEMCPServer {
  private server: Server;
  private handlers: Map<string, any>;
  private registry: AgentRegistry;
  private hookExecutor: HookExecutor;
  private memory: SwarmMemoryManager;
  private memoryStore: Map<string, any>;
  private blackboard: Map<string, any[]>;
  private proposals: Map<string, any>;

  constructor() {
    this.server = new Server(
      {
        name: 'agentic-qe-server',
        version: '1.0.0',
        description: 'Agentic Quality Engineering Fleet MCP Server'
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
    this.memory = new SwarmMemoryManager();
    this.memoryStore = new Map();
    this.blackboard = new Map();
    this.proposals = new Map();

    this.handlers = new Map();
    this.initializeHandlers();
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
    this.handlers.set(TOOL_NAMES.TEST_GENERATE, new TestGenerateHandler(this.registry, this.hookExecutor));
    this.handlers.set(TOOL_NAMES.TEST_EXECUTE, new TestExecuteHandler(this.registry, this.hookExecutor));

    // Quality and analysis handlers
    this.handlers.set(TOOL_NAMES.QUALITY_ANALYZE, new QualityAnalyzeHandler(this.registry, this.hookExecutor));
    this.handlers.set(TOOL_NAMES.PREDICT_DEFECTS, new PredictDefectsHandler(this.registry, this.hookExecutor));

    // Orchestration and optimization handlers
    this.handlers.set(TOOL_NAMES.TASK_ORCHESTRATE, new TaskOrchestrateHandler(this.registry, this.hookExecutor, this.memory));
    this.handlers.set(TOOL_NAMES.OPTIMIZE_TESTS, new OptimizeTestsHandler(this.registry, this.hookExecutor));

    // Enhanced test tool handlers
    this.handlers.set(TOOL_NAMES.TEST_GENERATE_ENHANCED, new TestGenerateEnhancedHandler());
    this.handlers.set(TOOL_NAMES.TEST_EXECUTE_PARALLEL, new TestExecuteParallelHandler());
    this.handlers.set(TOOL_NAMES.TEST_OPTIMIZE_SUBLINEAR, new TestOptimizeSublinearHandler());
    this.handlers.set(TOOL_NAMES.TEST_REPORT_COMPREHENSIVE, new TestReportComprehensiveHandler());
    this.handlers.set(TOOL_NAMES.TEST_COVERAGE_DETAILED, new TestCoverageDetailedHandler());

    // Memory management handlers - all share the same memoryStore
    this.handlers.set(TOOL_NAMES.MEMORY_STORE, new MemoryStoreHandler(this.registry, this.hookExecutor, this.memoryStore));
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

    // Quality gate handlers
    this.handlers.set(TOOL_NAMES.QUALITY_GATE_EXECUTE, new QualityGateExecuteHandler(this.registry, this.hookExecutor));
    this.handlers.set(TOOL_NAMES.QUALITY_VALIDATE_METRICS, new QualityValidateMetricsHandler(this.hookExecutor));
    this.handlers.set(TOOL_NAMES.QUALITY_RISK_ASSESS, new QualityRiskAssessHandler(this.hookExecutor));
    this.handlers.set(TOOL_NAMES.QUALITY_DECISION_MAKE, new QualityDecisionMakeHandler(this.hookExecutor));
    this.handlers.set(TOOL_NAMES.QUALITY_POLICY_CHECK, new QualityPolicyCheckHandler(this.hookExecutor));

    // Prediction and analysis handlers
    this.handlers.set(TOOL_NAMES.FLAKY_TEST_DETECT, new FlakyTestDetectHandler(this.registry, this.hookExecutor));
    this.handlers.set(TOOL_NAMES.PREDICT_DEFECTS_AI, new PredictDefectsAIHandler(this.registry, this.hookExecutor));
    this.handlers.set(TOOL_NAMES.REGRESSION_RISK_ANALYZE, new RegressionRiskAnalyzeHandler(this.registry, this.hookExecutor));
    this.handlers.set(TOOL_NAMES.VISUAL_TEST_REGRESSION, new VisualTestRegressionHandler(this.registry, this.hookExecutor));
    this.handlers.set(TOOL_NAMES.DEPLOYMENT_READINESS_CHECK, new DeploymentReadinessCheckHandler(this.registry, this.hookExecutor));

    // Analysis handlers
    this.handlers.set(TOOL_NAMES.COVERAGE_ANALYZE_SUBLINEAR, new CoverageAnalyzeSublinearHandler());
    this.handlers.set(TOOL_NAMES.COVERAGE_GAPS_DETECT, new CoverageGapsDetectHandler());
    this.handlers.set(TOOL_NAMES.PERFORMANCE_BENCHMARK_RUN, new PerformanceBenchmarkRunHandler());
    this.handlers.set(TOOL_NAMES.PERFORMANCE_MONITOR_REALTIME, new PerformanceMonitorRealtimeHandler());
    this.handlers.set(TOOL_NAMES.SECURITY_SCAN_COMPREHENSIVE, new SecurityScanComprehensiveHandler());

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

    // Phase 3 Domain-Specific Tools Handler
    const phase3Handler = new Phase3DomainToolsHandler(this.registry, this.hookExecutor);
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
    // Security Tools
    this.handlers.set(TOOL_NAMES.SECURITY_VALIDATE_AUTH, phase3Handler);
    this.handlers.set(TOOL_NAMES.SECURITY_CHECK_AUTHZ, phase3Handler);
    this.handlers.set(TOOL_NAMES.SECURITY_SCAN_DEPENDENCIES, phase3Handler);
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
    // Quality-Gates Domain (4 tools)
    this.handlers.set(TOOL_NAMES.QE_QUALITYGATE_EVALUATE, phase3Handler);
    this.handlers.set(TOOL_NAMES.QE_QUALITYGATE_ASSESS_RISK, phase3Handler);
    this.handlers.set(TOOL_NAMES.QE_QUALITYGATE_VALIDATE_METRICS, phase3Handler);
    this.handlers.set(TOOL_NAMES.QE_QUALITYGATE_GENERATE_REPORT, phase3Handler);
  }

  /**
   * Setup MCP request handlers
   */
  private setupRequestHandlers(): void {
    // Handle tool listing requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: agenticQETools
      };
    });

    // Handle tool call requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Validate tool exists
        if (!this.handlers.has(name)) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );
        }

        // Get handler
        const handler = this.handlers.get(name);

        // Special handling for Phase 2 tools - route to specific methods
        if (name.startsWith('mcp__agentic_qe__learning_')) {
          const phase2Handler = handler as Phase2ToolsHandler;
          const safeArgs = args || {};
          let result;
          switch (name) {
            case TOOL_NAMES.LEARNING_STATUS:
              result = await phase2Handler.handleLearningStatus(safeArgs as any);
              break;
            case TOOL_NAMES.LEARNING_TRAIN:
              result = await phase2Handler.handleLearningTrain(safeArgs as any);
              break;
            case TOOL_NAMES.LEARNING_HISTORY:
              result = await phase2Handler.handleLearningHistory(safeArgs as any);
              break;
            case TOOL_NAMES.LEARNING_RESET:
              result = await phase2Handler.handleLearningReset(safeArgs as any);
              break;
            case TOOL_NAMES.LEARNING_EXPORT:
              result = await phase2Handler.handleLearningExport(safeArgs as any);
              break;
            default:
              throw new McpError(ErrorCode.MethodNotFound, `Unknown learning tool: ${name}`);
          }
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        if (name.startsWith('mcp__agentic_qe__pattern_')) {
          const phase2Handler = handler as Phase2ToolsHandler;
          const safeArgs = args || {};
          let result;
          switch (name) {
            case TOOL_NAMES.PATTERN_STORE:
              result = await phase2Handler.handlePatternStore(safeArgs as any);
              break;
            case TOOL_NAMES.PATTERN_FIND:
              result = await phase2Handler.handlePatternFind(safeArgs as any);
              break;
            case TOOL_NAMES.PATTERN_EXTRACT:
              result = await phase2Handler.handlePatternExtract(safeArgs as any);
              break;
            case TOOL_NAMES.PATTERN_SHARE:
              result = await phase2Handler.handlePatternShare(safeArgs as any);
              break;
            case TOOL_NAMES.PATTERN_STATS:
              result = await phase2Handler.handlePatternStats(safeArgs as any);
              break;
            default:
              throw new McpError(ErrorCode.MethodNotFound, `Unknown pattern tool: ${name}`);
          }
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        if (name.startsWith('mcp__agentic_qe__improvement_') || name === TOOL_NAMES.PERFORMANCE_TRACK) {
          const phase2Handler = handler as Phase2ToolsHandler;
          const safeArgs = args || {};
          let result;
          switch (name) {
            case TOOL_NAMES.IMPROVEMENT_STATUS:
              result = await phase2Handler.handleImprovementStatus(safeArgs as any);
              break;
            case TOOL_NAMES.IMPROVEMENT_CYCLE:
              result = await phase2Handler.handleImprovementCycle(safeArgs as any);
              break;
            case TOOL_NAMES.IMPROVEMENT_AB_TEST:
              result = await phase2Handler.handleImprovementABTest(safeArgs as any);
              break;
            case TOOL_NAMES.IMPROVEMENT_FAILURES:
              result = await phase2Handler.handleImprovementFailures(safeArgs as any);
              break;
            case TOOL_NAMES.PERFORMANCE_TRACK:
              result = await phase2Handler.handlePerformanceTrack(safeArgs as any);
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
            result = await phase3Handler.handlePerformanceRunBenchmark(safeArgs);
          } else if (name === TOOL_NAMES.PERFORMANCE_MONITOR_REALTIME_PHASE3) {
            result = await phase3Handler.handlePerformanceMonitorRealtime(safeArgs);
          }
          // Security Tools
          else if (name === TOOL_NAMES.SECURITY_VALIDATE_AUTH) {
            result = await phase3Handler.handleSecurityValidateAuth(safeArgs);
          } else if (name === TOOL_NAMES.SECURITY_CHECK_AUTHZ) {
            result = await phase3Handler.handleSecurityCheckAuthz(safeArgs);
          } else if (name === TOOL_NAMES.SECURITY_SCAN_DEPENDENCIES) {
            result = await phase3Handler.handleSecurityScanDependencies(safeArgs);
          } else if (name === TOOL_NAMES.SECURITY_GENERATE_REPORT) {
            result = await phase3Handler.handleSecurityGenerateReport(safeArgs);
          } else if (name === TOOL_NAMES.SECURITY_SCAN_COMPREHENSIVE_PHASE3) {
            result = await phase3Handler.handleSecurityScanComprehensive(safeArgs);
          }
          // Visual Testing Tools
          else if (name === TOOL_NAMES.VISUAL_COMPARE_SCREENSHOTS) {
            result = await phase3Handler.handleVisualCompareScreenshots(safeArgs);
          } else if (name === TOOL_NAMES.VISUAL_VALIDATE_ACCESSIBILITY) {
            result = await phase3Handler.handleVisualValidateAccessibility(safeArgs);
          } else if (name === TOOL_NAMES.VISUAL_DETECT_REGRESSION) {
            result = await phase3Handler.handleVisualDetectRegression(safeArgs);
          }
          // Phase 3: New Domain Tools Routing
          // Security Domain
          else if (name === TOOL_NAMES.QE_SECURITY_SCAN_COMPREHENSIVE) {
            result = await phase3Handler.handleQeSecurityScanComprehensive(safeArgs);
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
          // Quality-Gates Domain
          else if (name === TOOL_NAMES.QE_QUALITYGATE_EVALUATE) {
            result = await phase3Handler.handleQeQualitygateEvaluate(safeArgs);
          } else if (name === TOOL_NAMES.QE_QUALITYGATE_ASSESS_RISK) {
            result = await phase3Handler.handleQeQualitygateAssessRisk(safeArgs);
          } else if (name === TOOL_NAMES.QE_QUALITYGATE_VALIDATE_METRICS) {
            result = await phase3Handler.handleQeQualitygateValidateMetrics(safeArgs);
          } else if (name === TOOL_NAMES.QE_QUALITYGATE_GENERATE_REPORT) {
            result = await phase3Handler.handleQeQualitygateGenerateReport(safeArgs);
          }
          // API-Contract Domain (3 tools)
          else if (name === TOOL_NAMES.QE_APICONTRACT_VALIDATE) {
            result = await validateApiContract(safeArgs as any);
          } else if (name === TOOL_NAMES.QE_APICONTRACT_BREAKING_CHANGES) {
            result = await detectBreakingChanges(safeArgs as any);
          } else if (name === TOOL_NAMES.QE_APICONTRACT_VERSIONING) {
            result = await validateApiVersioning(safeArgs as any);
          }
          // Test-Data Domain (3 tools)
          else if (name === TOOL_NAMES.QE_TESTDATA_GENERATE) {
            result = await generateTestData(safeArgs as any);
          } else if (name === TOOL_NAMES.QE_TESTDATA_MASK) {
            result = await maskSensitiveData(safeArgs as any);
          } else if (name === TOOL_NAMES.QE_TESTDATA_SCHEMA) {
            result = await analyzeSchema(safeArgs as any);
          }
          // Regression Domain (2 tools)
          else if (name === TOOL_NAMES.QE_REGRESSION_ANALYZE_RISK) {
            result = await analyzeRegressionRisk(safeArgs as any);
          } else if (name === TOOL_NAMES.QE_REGRESSION_SELECT_TESTS) {
            result = await selectRegressionTests(safeArgs as any);
          }
          // Requirements Domain (2 tools)
          else if (name === TOOL_NAMES.QE_REQUIREMENTS_VALIDATE) {
            result = await validateRequirements(safeArgs as any);
          } else if (name === TOOL_NAMES.QE_REQUIREMENTS_BDD) {
            result = await generateBddScenarios(safeArgs as any);
          }
          // Code-Quality Domain (2 tools)
          else if (name === TOOL_NAMES.QE_CODEQUALITY_COMPLEXITY) {
            result = await analyzeComplexity(safeArgs as any);
          } else if (name === TOOL_NAMES.QE_CODEQUALITY_METRICS) {
            result = await calculateQualityMetrics(safeArgs as any);
          }
          // Fleet Management Domain (2 tools)
          else if (name === TOOL_NAMES.QE_FLEET_COORDINATE) {
            result = await coordinateFleet(safeArgs as any);
          } else if (name === TOOL_NAMES.QE_FLEET_STATUS) {
            result = await getAgentStatus(safeArgs as any);
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
          const results: any[] = [];
          let finalResult: any = null;

          try {
            // Execute streaming handler and collect all events
            for await (const event of handler.execute(args)) {
              // Store each event for progressive disclosure
              results.push(event);

              // Keep track of final result
              if (event.type === 'result') {
                finalResult = event.data;
              }

              // Emit progress events to notification channel (if supported)
              if (event.type === 'progress') {
                this.server.notification({
                  method: 'notifications/message',
                  params: {
                    level: 'info',
                    logger: 'agentic-qe-streaming',
                    data: {
                      tool: name,
                      progress: event
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
    const serverTransport = transport || new StdioServerTransport();
    await this.server.connect(serverTransport);

    // Log to stderr to not interfere with MCP stdio protocol
    console.error('Agentic QE MCP Server started successfully');
    console.error(`Available tools: ${agenticQETools.map(t => t.name).join(', ')}`);
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
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
