# Phase 1 + Phase 2 Integration - Action Plan

**Date**: 2025-10-16
**Status**: Ready for Execution
**Duration**: 4 weeks (20 days)
**Team**: 1-2 developers

---

## Quick Reference

| Sprint | Duration | Focus | Deliverables |
|--------|----------|-------|--------------|
| Sprint 1 | 5 days | Router Integration | 2 agents with cost optimization |
| Sprint 2 | 7 days | Learning Integration | ML detection, pattern-based generation |
| Sprint 3 | 4 days | CLI & MCP Tools | User-facing interfaces |
| Sprint 4 | 4 days | Documentation & Testing | Complete integration docs |

**Total**: 20 days, ~120-160 hours

---

## Sprint 1: Router Integration (5 days)

### Goal
Wire Phase 1 Multi-Model Router into key agents for immediate 70% cost savings.

### Day 1-2: Foundation & TestGeneratorAgent

**Task 1.1**: Create AdaptiveModelRouterIntegration Utility
- **File**: `/src/core/routing/AgentRouterIntegration.ts`
- **Purpose**: Helper class for easy router integration into agents
- **Estimated Time**: 4 hours

```typescript
export class AgentRouterIntegration {
  constructor(private router: AdaptiveModelRouter) {}

  async executeWithOptimalModel(
    task: string,
    complexity: 'simple' | 'medium' | 'complex' | 'critical',
    options?: { stream?: boolean }
  ): Promise<any> {
    // Auto-select model based on complexity
    // Handle streaming if requested
    // Track costs
  }

  async streamWithProgress(
    task: string,
    complexity: string,
    onProgress: (event: any) => void
  ): Promise<any> {
    // Streaming wrapper with progress callbacks
  }
}
```

**Task 1.2**: Update TestGeneratorAgent
- **File**: `/src/agents/TestGeneratorAgent.ts`
- **Changes**:
  - Add `router?: AdaptiveModelRouter` property
  - Add `setRouter(router: AdaptiveModelRouter)` method
  - Modify `generateTests()` to use router
  - Add streaming progress
- **Estimated Time**: 6 hours

**Example Enhancement**:
```typescript
export class TestGeneratorAgent extends BaseAgent {
  private router?: AdaptiveModelRouter;
  private routerIntegration?: AgentRouterIntegration;

  setRouter(router: AdaptiveModelRouter): void {
    this.router = router;
    this.routerIntegration = new AgentRouterIntegration(router);
  }

  async generateTests(request: TestGenerationRequest): Promise<TestSuite> {
    if (!this.router) {
      // Fallback to original implementation
      return await this.generateTestsDefault(request);
    }

    // Use cost-optimized routing
    const complexity = this.assessComplexity(request.sourceCode);

    const tests = await this.routerIntegration!.streamWithProgress(
      this.buildPrompt(request),
      complexity,
      (event) => {
        this.emitEvent('test.generation.progress', {
          testName: event.data.testName,
          progress: event.progress
        });
      }
    );

    return this.parseTestsFromResponse(tests);
  }

  private assessComplexity(code: string): 'simple' | 'medium' | 'complex' {
    const loc = code.split('\n').length;
    const complexity = this.calculateCyclomaticComplexity(code);

    if (loc < 100 && complexity < 5) return 'simple';
    if (loc < 300 && complexity < 10) return 'medium';
    return 'complex';
  }
}
```

**Deliverables**:
- ✅ AgentRouterIntegration utility class
- ✅ TestGeneratorAgent with router support
- ✅ Unit tests
- ✅ Integration tests

### Day 3-4: FlakyTestHunterAgent Enhancement

**Task 1.3**: Add ML Detection to FlakyTestHunterAgent
- **File**: `/src/agents/FlakyTestHunterAgent.ts`
- **Changes** (ALREADY DONE - see file modifications):
  - ✅ Added `mlDetector: FlakyTestDetector` property
  - ✅ Hybrid detection in `detectFlakyTests()`
  - ✅ ML-enhanced root cause analysis
  - ✅ Detection metrics tracking
- **Status**: **COMPLETE** ✅

**Task 1.4**: Add Router Support to FlakyTestHunterAgent
- **File**: `/src/agents/FlakyTestHunterAgent.ts`
- **Changes**:
  - Add `router?: AdaptiveModelRouter` property
  - Use router for root cause analysis (complex task)
  - Use router for fix recommendation generation
  - Stream stabilization progress
- **Estimated Time**: 4 hours

**Example Enhancement**:
```typescript
export class FlakyTestHunterAgent extends BaseAgent {
  private mlDetector: FlakyTestDetector;  // DONE ✅
  private router?: AdaptiveModelRouter;   // TODO

  setRouter(router: AdaptiveModelRouter): void {
    this.router = router;
  }

  private async analyzeRootCauseML(
    mlTest: MLFlakyTest,
    stats: any
  ): Promise<RootCauseAnalysis> {
    if (!this.router) {
      return await this.analyzeRootCauseDefault(mlTest, stats);
    }

    // Use router for AI-powered root cause analysis (complex task)
    const analysis = await this.router.complete({
      prompt: this.buildRootCausePrompt(mlTest, stats),
      complexity: 'complex',
      stream: false
    });

    return this.parseRootCauseFromResponse(analysis);
  }
}
```

**Deliverables**:
- ✅ FlakyTestHunterAgent with hybrid detection (DONE)
- ✅ Router integration for root cause analysis
- ✅ Updated tests
- ✅ Performance benchmarks

### Day 5: Integration Testing & Validation

**Task 1.5**: Create Integration Tests
- **File**: `/tests/integration/phase1-router/agent-router-integration.test.ts`
- **Test Scenarios**:
  - TestGeneratorAgent with router (simple/medium/complex tasks)
  - FlakyTestHunterAgent with router
  - Cost tracking validation
  - Streaming progress validation
  - Graceful degradation (router disabled)
- **Estimated Time**: 6 hours

**Task 1.6**: Performance Benchmarking
- **File**: `/tests/benchmarks/router-integration-benchmark.ts`
- **Metrics**:
  - Cost reduction: Baseline vs. Router (target: 70%)
  - Generation time: Baseline vs. Router
  - Streaming latency
  - Model selection accuracy
- **Estimated Time**: 2 hours

**Deliverables**:
- ✅ Integration test suite (90%+ coverage)
- ✅ Performance benchmarks
- ✅ Cost savings report

---

## Sprint 2: Learning Integration (7 days)

### Goal
Integrate Phase 2 learning components (LearningEngine, QEReasoningBank) with agents.

### Day 6-7: QEReasoningBank Integration

**Task 2.1**: Pattern-Based Test Generation
- **File**: `/src/agents/TestGeneratorAgent.ts`
- **Changes**:
  - Add `reasoningBank?: QEReasoningBank` property
  - Query patterns before AI generation
  - Generate tests from patterns (fast, free)
  - Store successful patterns
- **Estimated Time**: 8 hours

**Example Enhancement**:
```typescript
export class TestGeneratorAgent extends BaseAgent {
  private router?: AdaptiveModelRouter;
  private reasoningBank?: QEReasoningBank;

  setPhase2Components(
    router: AdaptiveModelRouter,
    reasoningBank: QEReasoningBank
  ): void {
    this.router = router;
    this.reasoningBank = reasoningBank;
  }

  async generateTests(request: TestGenerationRequest): Promise<TestSuite> {
    // Step 1: Try pattern-based generation (FAST, FREE)
    if (this.reasoningBank) {
      const codeSignature = this.extractCodeSignature(request.sourceCode);
      const patterns = await this.reasoningBank.findPatterns({
        codeSignature: codeSignature.hash,
        framework: request.framework,
        minSuccessRate: 0.85,
        limit: 5
      });

      if (patterns.length > 0) {
        console.log(`📦 Found ${patterns.length} matching patterns - using pattern-based generation`);

        const tests = await this.generateFromPatterns(patterns, request);

        // Store success in reasoning bank
        for (const pattern of patterns) {
          await this.reasoningBank.updatePatternSuccess(
            pattern.id,
            true,
            {
              coverage: tests.coverage || 0,
              executionTime: Date.now()
            }
          );
        }

        return tests; // DONE - No AI cost!
      }

      console.log('📝 No matching patterns - using AI generation');
    }

    // Step 2: AI generation with cost optimization
    if (this.router) {
      const complexity = this.assessComplexity(request.sourceCode);
      const tests = await this.routerIntegration!.executeWithOptimalModel(
        this.buildPrompt(request),
        complexity,
        { stream: true }
      );

      // Store new pattern in reasoning bank
      if (this.reasoningBank && tests.coverage && tests.coverage >= 0.9) {
        const pattern = await this.createPatternFromTests(tests, request);
        await this.reasoningBank.storePattern(pattern);
        console.log(`💾 Stored new pattern: ${pattern.id}`);
      }

      return tests;
    }

    // Step 3: Fallback
    return await this.generateTestsDefault(request);
  }

  private async generateFromPatterns(
    patterns: QEPattern[],
    request: TestGenerationRequest
  ): Promise<TestSuite> {
    // Merge patterns and adapt to current code
    const tests: TestCase[] = [];

    for (const pattern of patterns) {
      const adaptedTests = await this.adaptPatternToCode(
        pattern,
        request.sourceCode
      );
      tests.push(...adaptedTests);
    }

    return {
      framework: request.framework,
      tests,
      coverage: await this.estimateCoverage(tests, request.sourceCode)
    };
  }
}
```

**Deliverables**:
- ✅ Pattern-based test generation
- ✅ Pattern storage on success
- ✅ Cost comparison (patterns vs AI)

**Task 2.2**: LearningAgent Documentation
- **File**: `/docs/LEARNING-AGENT-GUIDE.md`
- **Content**:
  - Architecture overview
  - Usage examples
  - API reference
  - Configuration options
  - Integration patterns
- **Estimated Time**: 4 hours

**Deliverables**:
- ✅ Complete LearningAgent documentation

### Day 8-9: LearningEngine Integration

**Task 2.3**: Agent Lifecycle Learning
- **Files**:
  - `/src/agents/TestGeneratorAgent.ts`
  - `/src/agents/FlakyTestHunterAgent.ts`
  - `/src/agents/BaseAgent.ts`
- **Changes**:
  - Add `learningEngine?: LearningEngine` to agents
  - Report task results to LearningEngine
  - Track routing decisions
  - Performance metrics
- **Estimated Time**: 6 hours

**Example Enhancement**:
```typescript
export class BaseAgent {
  protected learningEngine?: LearningEngine;

  setLearningEngine(engine: LearningEngine): void {
    this.learningEngine = engine;
  }

  protected async onPostTask(data: PostTaskData): Promise<void> {
    // Original lifecycle
    await this.validateTaskResult(data);

    // Phase 2: Learning feedback
    if (this.learningEngine) {
      await this.learningEngine.learnFromExecution(
        data.assignment.task,
        data.result,
        undefined // feedback (optional)
      );
    }

    // Emit completion event
    this.emitEvent('task.completed', {
      taskId: data.assignment.id,
      result: data.result
    });
  }
}
```

**Task 2.4**: Router Decision Tracking
- **File**: `/src/learning/types.ts`
- **Changes**:
  - Extend `LearningFeedback` interface with routing metadata
  - Track model selection decisions
  - Track costs and alternatives
- **Estimated Time**: 2 hours

**Example Enhancement**:
```typescript
export interface LearningFeedback {
  // Existing fields
  taskId: string;
  agentId: string;
  result: 'success' | 'failure';
  metrics: {
    coverageAchieved: number;
    executionTime: number;
    qualityScore: number;
  };

  // NEW: Phase 1 routing metadata
  routing?: {
    modelUsed: string;              // 'gpt-3.5-turbo'
    modelSelected: 'simple' | 'medium' | 'complex' | 'critical';
    cost: number;
    alternativeModels: string[];
    selectionReason: string;
    overrideUsed: boolean;
  };

  // NEW: Phase 2 pattern usage
  patterns?: {
    usedPatterns: boolean;
    patternIds: string[];
    patternsFound: number;
    patternSuccessRate: number;
  };
}
```

**Deliverables**:
- ✅ Agent lifecycle learning
- ✅ Router decision tracking
- ✅ Pattern usage tracking
- ✅ Learning metrics dashboard

### Day 10: Phase2Integration Coordinator

**Task 2.5**: Create Phase2Integration Class
- **File**: `/src/core/Phase2Integration.ts`
- **Purpose**: Coordinate initialization and wiring of Phase 2 components
- **Estimated Time**: 6 hours

```typescript
export class Phase2Integration {
  private reasoningBank?: QEReasoningBank;
  private learningEngine?: LearningEngine;
  private router: AdaptiveModelRouter;
  private memoryManager: SwarmMemoryManager;
  private eventBus: EventBus;

  constructor(
    router: AdaptiveModelRouter,
    memoryManager: SwarmMemoryManager,
    eventBus: EventBus,
    config: Phase2Config
  ) {
    this.router = router;
    this.memoryManager = memoryManager;
    this.eventBus = eventBus;
  }

  async initialize(): Promise<void> {
    const steps = [
      { name: 'QEReasoningBank', fn: () => this.initReasoningBank(), critical: true },
      { name: 'LearningEngine', fn: () => this.initLearningEngine(), critical: false },
      { name: 'ComponentWiring', fn: () => this.wireComponents(), critical: true }
    ];

    for (const step of steps) {
      try {
        await step.fn();
        console.log(`✅ ${step.name} initialized`);
      } catch (error) {
        if (step.critical) {
          throw new Error(`Critical component failed: ${step.name}`);
        }
        console.warn(`⚠️ ${step.name} failed, continuing with degradation`);
      }
    }
  }

  enhanceAgent(agent: BaseAgent): void {
    // Inject Phase 1 + Phase 2 capabilities
    if (this.router) {
      (agent as any).setRouter?.(this.router);
    }

    if (this.reasoningBank) {
      (agent as any).setPhase2Components?.(
        this.router,
        this.reasoningBank,
        this.learningEngine
      );
    }
  }

  getReasoningBank(): QEReasoningBank | undefined {
    return this.reasoningBank;
  }

  getLearningEngine(): LearningEngine | undefined {
    return this.learningEngine;
  }
}
```

**Deliverables**:
- ✅ Phase2Integration coordinator
- ✅ Agent enhancement utility
- ✅ Graceful degradation

---

## Sprint 3: CLI & MCP Tools (4 days)

### Goal
Create user-facing interfaces for Phase 2 features.

### Day 11-12: CLI Commands

**Task 3.1**: Create `aqe learn` Command Group
- **File**: `/src/cli/commands/learning/index.ts`
- **Commands**:
  - `aqe learn status` - Show learning status
  - `aqe learn report` - Generate learning report
  - `aqe learn reset` - Reset learning state
- **Estimated Time**: 6 hours

**Task 3.2**: Create `aqe patterns` Command Group
- **File**: `/src/cli/commands/patterns/index.ts`
- **Commands**:
  - `aqe patterns list` - List all patterns
  - `aqe patterns search <query>` - Search patterns
  - `aqe patterns stats` - Pattern statistics
  - `aqe patterns export <file>` - Export patterns
  - `aqe patterns import <file>` - Import patterns
- **Estimated Time**: 8 hours

**Example Implementation**:
```typescript
// /src/cli/commands/learning/status.ts
export async function showLearningStatus(options: any): Promise<void> {
  const integration = await loadPhase2Integration();
  const engine = integration.getLearningEngine();

  if (!engine) {
    console.log(chalk.yellow('⚠️  Learning engine not initialized'));
    return;
  }

  const status = await engine.getStatus();

  console.log(chalk.blue.bold('\n📚 Learning Engine Status\n'));
  console.log(`Status: ${status.enabled ? chalk.green('ENABLED') : chalk.red('DISABLED')}`);
  console.log(`Total Experiences: ${status.totalExperiences}`);
  console.log(`Patterns Learned: ${status.patterns}`);
  console.log(`Active Tests: ${status.activeTests}`);

  if (status.improvement) {
    console.log(chalk.blue.bold('\n📈 Performance Improvement\n'));
    console.log(`Improvement Rate: ${(status.improvement.rate * 100).toFixed(1)}%`);
    console.log(`Success Rate: ${(status.improvement.successRate * 100).toFixed(1)}%`);
  }
}
```

**Deliverables**:
- ✅ `aqe learn` command group (3 commands)
- ✅ `aqe patterns` command group (5 commands)
- ✅ CLI help documentation

### Day 13-14: MCP Tools

**Task 3.3**: Create MCP Tools for ReasoningBank
- **Directory**: `/src/mcp/handlers/learning/`
- **Files**:
  - `reasoning-bank-query.ts` - Query patterns
  - `reasoning-bank-store.ts` - Store patterns
  - `reasoning-bank-stats.ts` - Statistics
- **Estimated Time**: 6 hours

**Example Implementation**:
```typescript
// /src/mcp/handlers/learning/reasoning-bank-query.ts
export async function handleReasoningBankQuery(params: {
  codeSignature: string;
  framework: string;
  minSuccessRate: number;
  limit: number;
}): Promise<QEPattern[]> {
  const integration = getPhase2Integration();
  const bank = integration.getReasoningBank();

  if (!bank) {
    throw new Error('ReasoningBank not initialized');
  }

  const patterns = await bank.findPatterns({
    codeSignature: params.codeSignature,
    framework: params.framework,
    minSuccessRate: params.minSuccessRate || 0.8,
    limit: params.limit || 10
  });

  return patterns;
}
```

**Task 3.4**: Create MCP Tools for LearningEngine
- **Directory**: `/src/mcp/handlers/learning/`
- **Files**:
  - `learning-status.ts` - Get learning status
  - `learning-feedback.ts` - Submit feedback
  - `learning-report.ts` - Generate report
- **Estimated Time**: 4 hours

**Task 3.5**: Update MCP Tool Registry
- **File**: `/src/mcp/tools.ts`
- **Changes**:
  - Add Phase 2 tool definitions
  - Wire handlers
  - Update documentation
- **Estimated Time**: 2 hours

**Deliverables**:
- ✅ 4 MCP tools for ReasoningBank
- ✅ 3 MCP tools for LearningEngine
- ✅ Updated MCP tool registry

---

## Sprint 4: Documentation & Testing (4 days)

### Goal
Complete integration documentation and comprehensive testing.

### Day 15-16: Documentation

**Task 4.1**: Create PHASE2-INTEGRATION-GUIDE.md
- **File**: `/docs/PHASE2-INTEGRATION-GUIDE.md`
- **Content**:
  - Phase 1 + Phase 2 integration overview
  - Initialization sequence
  - Configuration merging
  - Usage examples
  - Best practices
- **Estimated Time**: 6 hours

**Task 4.2**: Update README.md
- **File**: `/README.md`
- **Changes**:
  - Add Phase 2 section (v1.1.0 preview)
  - Update agent count (16 → 17 with LearningAgent)
  - Add learning capabilities
  - Link to Phase 2 documentation
- **Estimated Time**: 2 hours

**Task 4.3**: Create User Guide
- **File**: `/docs/guides/LEARNING-SYSTEM.md`
- **Content**:
  - How learning improves test quality
  - Interpreting learning metrics
  - Tuning learning parameters
  - Best practices
  - Troubleshooting
- **Estimated Time**: 4 hours

**Task 4.4**: Update Architecture Documentation
- **File**: `/docs/architecture/agentic-qe-architecture.md`
- **Changes**:
  - Add Phase 2 components
  - Data flow diagrams
  - Integration architecture
- **Estimated Time**: 3 hours

**Deliverables**:
- ✅ PHASE2-INTEGRATION-GUIDE.md
- ✅ Updated README.md
- ✅ LEARNING-SYSTEM.md user guide
- ✅ Updated architecture docs

### Day 17-18: Integration Testing

**Task 4.5**: End-to-End Test Scenarios
- **File**: `/tests/e2e/phase2-integration.test.ts`
- **Scenarios**:
  - Pattern learning flow (generate → execute → learn → reuse)
  - Multi-agent coordination with learning
  - Cost optimization with patterns
  - Graceful degradation
- **Estimated Time**: 8 hours

**Task 4.6**: Performance Benchmarks
- **File**: `/tests/benchmarks/phase2-integration-benchmark.ts`
- **Metrics**:
  - Pattern lookup latency (target: <50ms)
  - Learning overhead (target: <100ms)
  - Memory growth (target: <10MB per 1000 patterns)
  - Cost reduction (target: 85-90% with patterns)
- **Estimated Time**: 4 hours

**Deliverables**:
- ✅ E2E test suite (90%+ coverage)
- ✅ Performance benchmarks
- ✅ Cost savings validation

### Day 19-20: Release Preparation

**Task 4.7**: Version Bump & CHANGELOG
- **Files**:
  - `/package.json` - Bump to v1.1.0
  - `/CHANGELOG.md` - Document all changes
- **Estimated Time**: 2 hours

**Task 4.8**: Build & Package
- **Tasks**:
  - Run full test suite
  - Build TypeScript
  - Run linting
  - Generate type definitions
  - Test NPM package locally
- **Estimated Time**: 3 hours

**Task 4.9**: Pre-Release Testing
- **Tasks**:
  - Test CLI commands
  - Test MCP tools
  - Test agent enhancements
  - Verify backward compatibility
- **Estimated Time**: 4 hours

**Task 4.10**: Release Notes
- **File**: `/docs/releases/v1.1.0.md`
- **Content**:
  - Feature highlights
  - Migration guide
  - Breaking changes (if any)
  - Known issues
- **Estimated Time**: 2 hours

**Deliverables**:
- ✅ v1.1.0 release candidate
- ✅ Complete CHANGELOG
- ✅ Release notes
- ✅ NPM package ready

---

## Daily Progress Tracking

### Week 1 (Sprint 1)

**Day 1**:
- [ ] Create AgentRouterIntegration utility
- [ ] Start TestGeneratorAgent enhancement
- [ ] Daily standup: Progress report

**Day 2**:
- [ ] Complete TestGeneratorAgent enhancement
- [ ] Unit tests for router integration
- [ ] Daily standup: Demo test generation with routing

**Day 3**:
- [ ] Add router support to FlakyTestHunterAgent
- [ ] Integration tests
- [ ] Daily standup: Cost savings metrics

**Day 4**:
- [ ] Complete FlakyTestHunterAgent enhancement
- [ ] Performance benchmarks
- [ ] Daily standup: Benchmark results

**Day 5**:
- [ ] Integration testing
- [ ] Cost analysis report
- [ ] Weekly review: Sprint 1 demo

### Week 2 (Sprint 2)

**Day 6**:
- [ ] Pattern-based test generation
- [ ] QEReasoningBank integration
- [ ] Daily standup: Pattern demo

**Day 7**:
- [ ] Complete pattern integration
- [ ] LearningAgent documentation
- [ ] Daily standup: Documentation review

**Day 8**:
- [ ] Agent lifecycle learning
- [ ] Router decision tracking
- [ ] Daily standup: Learning metrics

**Day 9**:
- [ ] Complete LearningEngine integration
- [ ] Extended LearningFeedback interface
- [ ] Daily standup: Learning demo

**Day 10**:
- [ ] Phase2Integration coordinator
- [ ] End-to-end testing
- [ ] Weekly review: Sprint 2 demo

### Week 3 (Sprint 3)

**Day 11**:
- [ ] `aqe learn` CLI commands
- [ ] CLI testing
- [ ] Daily standup: CLI demo

**Day 12**:
- [ ] `aqe patterns` CLI commands
- [ ] CLI documentation
- [ ] Daily standup: Pattern CLI demo

**Day 13**:
- [ ] MCP tools for ReasoningBank
- [ ] MCP integration tests
- [ ] Daily standup: MCP demo

**Day 14**:
- [ ] MCP tools for LearningEngine
- [ ] Update MCP registry
- [ ] Weekly review: Sprint 3 demo

### Week 4 (Sprint 4)

**Day 15**:
- [ ] PHASE2-INTEGRATION-GUIDE.md
- [ ] Update README.md
- [ ] Daily standup: Documentation review

**Day 16**:
- [ ] LEARNING-SYSTEM.md user guide
- [ ] Architecture documentation
- [ ] Daily standup: Documentation complete

**Day 17**:
- [ ] E2E test scenarios
- [ ] Performance benchmarks
- [ ] Daily standup: Test results

**Day 18**:
- [ ] Complete integration testing
- [ ] Cost savings validation
- [ ] Daily standup: Quality metrics

**Day 19**:
- [ ] Version bump & CHANGELOG
- [ ] Build & package
- [ ] Daily standup: Release candidate

**Day 20**:
- [ ] Pre-release testing
- [ ] Release notes
- [ ] Final review: v1.1.0 release

---

## Success Criteria Checklist

### Functional Success

- [ ] All agents can use AdaptiveModelRouter (optional)
- [ ] TestGeneratorAgent uses pattern-based generation
- [ ] FlakyTestHunterAgent uses hybrid detection (statistical + ML)
- [ ] LearningEngine tracks routing decisions
- [ ] QEReasoningBank stores and retrieves patterns
- [ ] CLI commands work (`aqe learn`, `aqe patterns`)
- [ ] MCP tools integrate with Claude Code

### Performance Success

- [ ] Pattern lookup < 50ms (p95)
- [ ] Learning overhead < 100ms per task
- [ ] Cost reduction: 70% (Phase 1) → 85-90% (Phase 1 + Phase 2)
- [ ] No degradation in test generation quality

### Quality Success

- [ ] Integration test coverage > 80%
- [ ] Zero circular dependencies
- [ ] All documentation complete
- [ ] Backward compatibility maintained
- [ ] All benchmarks pass

---

## Risk Mitigation Plan

### High Risks

**Risk**: Circular dependencies between Learning and Routing
- **Mitigation**: Use event-driven architecture, lazy initialization
- **Validation**: Dependency graph analysis

**Risk**: Performance degradation from learning overhead
- **Mitigation**: Async feedback processing, configurable intervals
- **Validation**: Performance benchmarks

**Risk**: Breaking changes to existing agents
- **Mitigation**: Backward compatible enhancement, feature flags
- **Validation**: Comprehensive testing

### Medium Risks

**Risk**: Configuration complexity
- **Mitigation**: Sensible defaults, validation, clear docs
- **Validation**: User testing

**Risk**: Documentation lag
- **Mitigation**: Documentation-first approach, parallel development
- **Validation**: Peer review

---

## Next Steps

### Immediate (Today)

1. **Review this action plan** with team
2. **Assign agents** to tasks (use Claude Code Task tool)
3. **Create project board** for tracking
4. **Set up daily standups** (15 minutes)

### Tomorrow (Day 1)

1. **Kick off Sprint 1**
2. **Create AgentRouterIntegration utility**
3. **Start TestGeneratorAgent enhancement**
4. **First daily standup**

---

**Ready to Execute** 🚀

Questions or clarifications? Review the detailed integration analysis in `/docs/PHASE1-PHASE2-INTEGRATION-ANALYSIS.md`.
