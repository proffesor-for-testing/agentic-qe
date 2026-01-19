# GOAP: Vibium Browser Automation Integration for AQE v3

**Version:** 1.0.0
**Created:** 2026-01-19
**Status:** Planning
**Estimated Effort:** 5-8 weeks

---

## 1. World State Analysis

### 1.1 Current State (Initial World)

```
WorldState {
  // Browser Automation
  browserAutomationAvailable: false
  vibiumIntegrated: false
  mcpServerConfigured: false

  // Visual-Accessibility Domain
  accessibilityTesterHasBrowserMode: false
  accessibilityUsesHeuristics: true          // Current: URL pattern analysis only
  realDOMInspection: false
  axeCoreIntegrated: false

  // Visual Testing
  visualRegressionCapability: false
  screenshotCapture: false
  baselineStorage: false
  pixelDiffing: false
  multiViewportTesting: false

  // E2E Testing
  e2eTestRunnerExists: false
  browserTestExecution: false
  userFlowTesting: false
  stepBasedTestFormat: false

  // Integration Infrastructure
  vibiumClientWrapper: false
  vibiumTypes: false
  connectionManagement: false
  retryLogic: false

  // Domain Integration
  testExecutionBrowserSupport: false
  visualAccessibilityBrowserMode: false
  crossDomainE2ECoordination: false
}
```

### 1.2 Goal State (Target World)

```
WorldState {
  // Browser Automation
  browserAutomationAvailable: true
  vibiumIntegrated: true
  mcpServerConfigured: true

  // Visual-Accessibility Domain
  accessibilityTesterHasBrowserMode: true
  accessibilityUsesHeuristics: true          // Keep as fallback
  realDOMInspection: true
  axeCoreIntegrated: true

  // Visual Testing
  visualRegressionCapability: true
  screenshotCapture: true
  baselineStorage: true
  pixelDiffing: true
  multiViewportTesting: true

  // E2E Testing
  e2eTestRunnerExists: true
  browserTestExecution: true
  userFlowTesting: true
  stepBasedTestFormat: true

  // Integration Infrastructure
  vibiumClientWrapper: true
  vibiumTypes: true
  connectionManagement: true
  retryLogic: true

  // Domain Integration
  testExecutionBrowserSupport: true
  visualAccessibilityBrowserMode: true
  crossDomainE2ECoordination: true
}
```

### 1.3 Gap Analysis

| Area | Gap | Impact | Priority |
|------|-----|--------|----------|
| Browser Control | No real browser automation | High - limits all browser testing | P0 |
| Accessibility | Heuristics only, no real DOM | High - inaccurate results | P0 |
| Visual Testing | No screenshots/regression | Medium - no visual QA | P1 |
| E2E Testing | No browser-based e2e | Medium - no user flow tests | P1 |
| Integration | No Vibium wrapper | High - blocks all features | P0 |

---

## 2. Goal Definition

### 2.1 Primary Goals

| Goal ID | Description | Success Criteria |
|---------|-------------|------------------|
| G1 | Vibium MCP Integration | MCP server configured, tools callable from agents |
| G2 | TypeScript Client Wrapper | Type-safe wrapper in `v3/src/integrations/vibium/` |
| G3 | Browser-Mode Accessibility | `AccessibilityTesterService` can run real axe-core audits |
| G4 | Visual Regression Testing | Capture, store, and diff screenshots across viewports |
| G5 | E2E Test Runner | Execute step-based browser tests with assertions |

### 2.2 Success Metrics

```typescript
interface IntegrationMetrics {
  // Phase 1
  vibiumMCPToolsAvailable: 7;       // All 7 MCP tools accessible
  typesCoverage: 100;               // 100% TypeScript coverage
  connectionReliability: 99.5;      // % uptime

  // Phase 2
  accessibilityAccuracy: 95;        // % accuracy vs axe-core standalone
  viewportsSupported: 5;            // mobile, tablet, desktop, wide, 4k
  screenshotDiffThreshold: 0.1;     // 0.1% pixel difference tolerance

  // Phase 3
  e2eStepTypes: 6;                  // navigate, click, type, find, screenshot, assert
  parallelBrowsers: 4;              // Concurrent browser instances
  testReportFormats: 3;             // JSON, HTML, JUnit
}
```

---

## 3. Action Library

### 3.1 Phase 1: MCP Server Integration (Foundation)

#### Action: A1.1 - Configure Vibium MCP Server

```yaml
id: A1.1
name: ConfigureVibiumMCP
description: Add Vibium as MCP server to AQE v3 configuration
preconditions:
  - vibiumIntegrated: false
  - mcpServerConfigured: false
effects:
  - mcpServerConfigured: true
  - browserAutomationAvailable: true
cost: 1
estimatedHours: 2
agentType: infrastructure
parallelizable: true
```

**Implementation:**
```json
// Add to .claude/mcp-servers.json or project settings
{
  "mcpServers": {
    "vibium": {
      "command": "npx",
      "args": ["-y", "vibium"],
      "env": {}
    }
  }
}
```

#### Action: A1.2 - Create Vibium TypeScript Types

```yaml
id: A1.2
name: CreateVibiumTypes
description: Define TypeScript interfaces for Vibium API
preconditions:
  - mcpServerConfigured: true
  - vibiumTypes: false
effects:
  - vibiumTypes: true
cost: 2
estimatedHours: 4
agentType: coder
parallelizable: true
```

**Target Files:**
- `v3/src/integrations/vibium/types.ts`
- `v3/src/integrations/vibium/errors.ts`

#### Action: A1.3 - Create Vibium Client Wrapper

```yaml
id: A1.3
name: CreateVibiumClientWrapper
description: Build TypeScript wrapper with connection management and retry logic
preconditions:
  - vibiumTypes: true
effects:
  - vibiumClientWrapper: true
  - connectionManagement: true
  - retryLogic: true
cost: 4
estimatedHours: 8
agentType: coder
parallelizable: false
dependencies: [A1.2]
```

**Target Files:**
- `v3/src/integrations/vibium/client.ts`
- `v3/src/integrations/vibium/connection-manager.ts`
- `v3/src/integrations/vibium/index.ts`

#### Action: A1.4 - Write Integration Tests for Vibium Client

```yaml
id: A1.4
name: WriteVibiumIntegrationTests
description: Test Vibium client wrapper with real browser
preconditions:
  - vibiumClientWrapper: true
effects:
  - vibiumIntegrated: true
cost: 3
estimatedHours: 6
agentType: tester
parallelizable: false
dependencies: [A1.3]
```

**Target Files:**
- `v3/tests/integration/vibium-client.test.ts`

---

### 3.2 Phase 2: Visual Testing Enhancement

#### Action: A2.1 - Add Browser Mode to AccessibilityTester

```yaml
id: A2.1
name: AddBrowserModeAccessibility
description: Extend AccessibilityTesterService with real browser auditing
preconditions:
  - vibiumClientWrapper: true
  - accessibilityTesterHasBrowserMode: false
effects:
  - accessibilityTesterHasBrowserMode: true
  - realDOMInspection: true
cost: 5
estimatedHours: 12
agentType: coder
parallelizable: true
dependencies: [A1.3]
```

**Implementation Pattern:**
```typescript
// Add to AccessibilityTesterService
async auditWithBrowser(url: string, options?: BrowserAuditOptions): Promise<Result<AccessibilityReport, Error>> {
  const vibium = await this.vibiumClient.launch({ headless: true });
  try {
    await vibium.go(url);
    const violations = await this.runAxeCore(vibium);
    const screenshot = await vibium.screenshot();
    return ok(this.transformAxeResults(violations, screenshot));
  } finally {
    await vibium.quit();
  }
}
```

#### Action: A2.2 - Integrate axe-core for Real Accessibility Checks

```yaml
id: A2.2
name: IntegrateAxeCore
description: Inject and run axe-core in browser context
preconditions:
  - accessibilityTesterHasBrowserMode: true
  - axeCoreIntegrated: false
effects:
  - axeCoreIntegrated: true
cost: 4
estimatedHours: 8
agentType: coder
parallelizable: true
dependencies: [A2.1]
```

**Target Files:**
- `v3/src/domains/visual-accessibility/services/axe-runner.ts`
- `v3/src/domains/visual-accessibility/services/accessibility-tester.ts` (update)

#### Action: A2.3 - Add Multi-Viewport Screenshot Capture

```yaml
id: A2.3
name: AddMultiViewportCapture
description: Capture screenshots across multiple viewport sizes
preconditions:
  - vibiumClientWrapper: true
  - screenshotCapture: false
effects:
  - screenshotCapture: true
  - multiViewportTesting: true
cost: 3
estimatedHours: 6
agentType: coder
parallelizable: true
dependencies: [A1.3]
```

**Target Files:**
- `v3/src/domains/visual-accessibility/services/viewport-capture.ts`
- `v3/src/domains/visual-accessibility/services/responsive-tester.ts` (update)

#### Action: A2.4 - Implement Visual Regression Comparison

```yaml
id: A2.4
name: ImplementVisualRegression
description: Add baseline storage and pixel-level comparison
preconditions:
  - screenshotCapture: true
  - baselineStorage: false
effects:
  - baselineStorage: true
  - pixelDiffing: true
  - visualRegressionCapability: true
cost: 5
estimatedHours: 10
agentType: coder
parallelizable: false
dependencies: [A2.3]
```

**Target Files:**
- `v3/src/domains/visual-accessibility/services/baseline-store.ts`
- `v3/src/domains/visual-accessibility/services/visual-diff.ts`
- `v3/src/domains/visual-accessibility/services/visual-tester.ts` (update)

#### Action: A2.5 - Write Visual Testing Tests

```yaml
id: A2.5
name: WriteVisualTestingTests
description: Integration tests for visual regression features
preconditions:
  - visualRegressionCapability: true
effects:
  - (validation milestone)
cost: 3
estimatedHours: 6
agentType: tester
parallelizable: false
dependencies: [A2.4]
```

**Target Files:**
- `v3/tests/integration/visual-regression.test.ts`
- `v3/tests/integration/accessibility-browser.test.ts`

---

### 3.3 Phase 3: E2E Testing Integration

#### Action: A3.1 - Create E2E Test Step Types

```yaml
id: A3.1
name: CreateE2EStepTypes
description: Define step-based test format interfaces
preconditions:
  - vibiumClientWrapper: true
  - stepBasedTestFormat: false
effects:
  - stepBasedTestFormat: true
cost: 2
estimatedHours: 4
agentType: coder
parallelizable: true
dependencies: [A1.3]
```

**Target Files:**
- `v3/src/domains/test-execution/e2e/interfaces.ts`
- `v3/src/domains/test-execution/e2e/step-types.ts`

#### Action: A3.2 - Build E2E Test Runner Service

```yaml
id: A3.2
name: BuildE2ETestRunner
description: Create service for executing browser-based test steps
preconditions:
  - stepBasedTestFormat: true
  - e2eTestRunnerExists: false
effects:
  - e2eTestRunnerExists: true
  - browserTestExecution: true
cost: 6
estimatedHours: 14
agentType: coder
parallelizable: false
dependencies: [A3.1]
```

**Target Files:**
- `v3/src/domains/test-execution/e2e/e2e-test-runner.ts`
- `v3/src/domains/test-execution/e2e/step-executor.ts`
- `v3/src/domains/test-execution/e2e/assertion-handler.ts`

#### Action: A3.3 - Add User Flow Test Generation

```yaml
id: A3.3
name: AddUserFlowGeneration
description: Generate E2E tests from user flow descriptions
preconditions:
  - e2eTestRunnerExists: true
  - userFlowTesting: false
effects:
  - userFlowTesting: true
cost: 4
estimatedHours: 8
agentType: coder
parallelizable: true
dependencies: [A3.2]
```

**Target Files:**
- `v3/src/domains/test-generation/services/e2e-generator.ts`
- `v3/src/domains/test-generation/services/flow-parser.ts`

#### Action: A3.4 - Integrate E2E with Test Execution Domain

```yaml
id: A3.4
name: IntegrateE2EWithTestExecution
description: Connect E2E runner to test-execution domain plugin
preconditions:
  - e2eTestRunnerExists: true
  - testExecutionBrowserSupport: false
effects:
  - testExecutionBrowserSupport: true
  - crossDomainE2ECoordination: true
cost: 3
estimatedHours: 6
agentType: coder
parallelizable: false
dependencies: [A3.2]
```

**Updates:**
- `v3/src/domains/test-execution/interfaces.ts` (add E2E types)
- `v3/src/domains/test-execution/coordinator.ts` (add E2E methods)
- `v3/src/domains/test-execution/plugin.ts` (add E2E API)

#### Action: A3.5 - Write E2E Integration Tests

```yaml
id: A3.5
name: WriteE2EIntegrationTests
description: Test E2E runner with real browser scenarios
preconditions:
  - testExecutionBrowserSupport: true
effects:
  - (validation milestone)
cost: 4
estimatedHours: 8
agentType: tester
parallelizable: false
dependencies: [A3.4]
```

**Target Files:**
- `v3/tests/integration/e2e-runner.test.ts`
- `v3/tests/integration/e2e-domain-integration.test.ts`

---

## 4. Dependencies Graph

```
                    PHASE 1: Foundation
                    ==================

    A1.1 ─────────────────┐
    (MCP Config)          │
         │                │
         ▼                │
    A1.2 ─────────────────┼───────────────────────────────────┐
    (Types)               │                                   │
         │                │                                   │
         ▼                │                                   │
    A1.3 ─────────────────┴───────────────────────────────────┤
    (Client Wrapper)                                          │
         │                                                    │
         ├────────────────┬────────────────┬─────────────────┤
         │                │                │                  │
         ▼                ▼                ▼                  │
                                                              │
                    PHASE 2: Visual                           │
                    ==============                            │
                                                              │
    A2.1              A2.3              A3.1 ◄────────────────┘
    (Browser Mode)    (Viewport Cap)    (E2E Types)
         │                │                │
         ▼                ▼                │
    A2.2              A2.4                 │
    (axe-core)        (Visual Diff)       │
         │                │                │
         └───────┬────────┘                │
                 │                         │
                 ▼                         │
            A2.5                           │
            (Visual Tests)                 │
                                           │
                    PHASE 3: E2E           │
                    ============           │
                                           │
                                      A3.2 ◄┘
                                      (E2E Runner)
                                           │
                              ┌────────────┼────────────┐
                              │            │            │
                              ▼            ▼            ▼
                          A3.3         A3.4
                          (Flow Gen)   (Integration)
                              │            │
                              └─────┬──────┘
                                    │
                                    ▼
                                  A3.5
                                  (E2E Tests)
```

### Parallel Execution Opportunities

| Parallel Group | Actions | Prerequisites |
|----------------|---------|---------------|
| PG1 | A1.1 | None |
| PG2 | A1.2 | A1.1 |
| PG3 | A2.1, A2.3, A3.1 | A1.3 (after Phase 1 complete) |
| PG4 | A2.2, A3.3 | A2.1, A3.2 respectively |

---

## 5. Agent Assignments

### 5.1 Claude Flow Agent Mapping

| Action | Primary Agent | Supporting Agents | Model Tier |
|--------|--------------|-------------------|------------|
| A1.1 | infrastructure | - | Haiku |
| A1.2 | coder | architect | Sonnet |
| A1.3 | coder | reviewer | Sonnet |
| A1.4 | tester | coder | Sonnet |
| A2.1 | coder | architect, reviewer | Opus |
| A2.2 | coder | researcher | Sonnet |
| A2.3 | coder | - | Haiku |
| A2.4 | coder | architect | Sonnet |
| A2.5 | tester | coder | Sonnet |
| A3.1 | architect | coder | Sonnet |
| A3.2 | coder | architect, reviewer | Opus |
| A3.3 | coder | researcher | Sonnet |
| A3.4 | coder | architect | Sonnet |
| A3.5 | tester | coder | Sonnet |

### 5.2 AQE v3 Domain Agent Mapping

| Action | QE Domain | QE Agents |
|--------|-----------|-----------|
| A1.4 | test-execution | qe-parallel-executor |
| A2.1 | visual-accessibility | qe-accessibility-tester |
| A2.2 | visual-accessibility | qe-accessibility-tester |
| A2.3 | visual-accessibility | qe-visual-tester |
| A2.4 | visual-accessibility | qe-visual-tester |
| A2.5 | visual-accessibility | qe-accessibility-tester, qe-visual-tester |
| A3.2 | test-execution | qe-test-executor, qe-parallel-executor |
| A3.3 | test-generation | qe-test-architect |
| A3.5 | test-execution | qe-parallel-executor, qe-flaky-hunter |

### 5.3 Swarm Configuration

```bash
# Phase 1: Foundation (4 agents max)
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical \
  --max-agents 4 \
  --strategy specialized

# Phase 2-3: Full Integration (8 agents)
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical-mesh \
  --max-agents 8 \
  --strategy specialized
```

---

## 6. Milestones

### Milestone 1: Vibium Client Ready (Week 1-2)

**Checkpoint:** End of Phase 1

| Verification | Command | Expected |
|--------------|---------|----------|
| MCP tools available | `claude mcp list` | 7 Vibium tools listed |
| Types compile | `cd v3 && npm run build` | No type errors |
| Client connects | `npm run test:integration -- vibium` | Tests pass |
| Browser launches | Manual verification | Chrome opens |

**Deliverables:**
- [ ] `v3/src/integrations/vibium/` directory complete
- [ ] Integration tests passing
- [ ] Documentation in `docs/integrations/vibium.md`

### Milestone 2: Browser-Mode Accessibility (Week 3-4)

**Checkpoint:** End of Phase 2a

| Verification | Command | Expected |
|--------------|---------|----------|
| Browser audit works | `accessibility.auditWithBrowser(url)` | Real violations detected |
| axe-core runs | Check report source | `tool: 'axe-core'` in report |
| Fallback works | Disconnect browser | Heuristic mode activates |

**Deliverables:**
- [ ] `AccessibilityTesterService.auditWithBrowser()` method
- [ ] axe-core injection and result transformation
- [ ] Configuration for browser vs heuristic mode

### Milestone 3: Visual Regression Complete (Week 4-5)

**Checkpoint:** End of Phase 2

| Verification | Command | Expected |
|--------------|---------|----------|
| Multi-viewport | Capture 5 viewports | 5 screenshots stored |
| Baseline storage | Store + retrieve | Baselines persist |
| Pixel diff | Compare changed page | Diff image generated |
| Threshold | 0.05% change | Passes threshold |

**Deliverables:**
- [ ] Viewport capture service
- [ ] Baseline storage service
- [ ] Visual diff engine
- [ ] Integration with visual-tester domain

### Milestone 4: E2E Test Runner Complete (Week 6-8)

**Checkpoint:** End of Phase 3

| Verification | Command | Expected |
|--------------|---------|----------|
| Step execution | Run 6-step test | All steps complete |
| Assertions | Assert element text | Assertion passes/fails correctly |
| Parallel | 4 concurrent tests | All execute, no conflicts |
| Reports | Generate JUnit XML | Valid XML output |

**Deliverables:**
- [ ] E2E test runner service
- [ ] Step executor with all step types
- [ ] Integration with test-execution domain
- [ ] Report generation (JSON, HTML, JUnit)

---

## 7. Risk Mitigation

### 7.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Vibium binary compatibility | Low | High | Pin version, test on CI platforms |
| Chrome download in CI | Medium | Medium | Pre-cache in CI image, skip download flag |
| Browser flakiness | Medium | Medium | Retry logic, auto-wait, timeout tuning |
| Memory issues (headless) | Low | Medium | Single browser instance, explicit quit() |
| WebSocket connection drops | Medium | Low | Reconnection logic, connection pool |

### 7.2 Integration Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| axe-core injection fails | Low | High | Fallback to heuristic mode |
| Type mismatches | Medium | Low | Runtime validation, strict types |
| Domain coupling | Low | Medium | Event-based communication |
| Test isolation | Medium | Medium | Fresh browser per test suite |

### 7.3 Fallback Strategies

```typescript
// Graceful degradation pattern (following RuVector pattern)
class VibiumClient {
  private mode: 'browser' | 'heuristic' = 'browser';

  async initialize(): Promise<void> {
    try {
      await this.checkVibiumAvailability();
      this.mode = 'browser';
    } catch {
      console.warn('Vibium unavailable, using heuristic mode');
      this.mode = 'heuristic';
    }
  }

  async audit(url: string): Promise<AuditResult> {
    if (this.mode === 'browser') {
      return this.auditWithBrowser(url);
    }
    return this.auditWithHeuristics(url);
  }
}
```

---

## 8. Execution Plan

### 8.1 OODA Loop Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                        OBSERVE                                   │
│  - Monitor action completion status                              │
│  - Track test results and coverage                              │
│  - Check for dependency failures                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                         ORIENT                                   │
│  - Compare actual state vs expected state                        │
│  - Identify blockers and deviations                             │
│  - Assess remaining work                                         │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                         DECIDE                                   │
│  - Replan if action failed                                       │
│  - Parallelize if dependencies satisfied                        │
│  - Escalate if risk threshold exceeded                          │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                          ACT                                     │
│  - Execute next action(s)                                        │
│  - Update world state                                            │
│  - Record metrics                                                │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Orchestration Commands

**Start Phase 1:**
```bash
# Initialize swarm for Phase 1
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 4

# Check patterns for similar integrations
npx @claude-flow/cli@latest memory search --query "integration pattern ruvector" --namespace patterns

# Route tasks
npx @claude-flow/cli@latest hooks route --task "Create Vibium TypeScript client wrapper"
```

**Phase 1 Task Orchestration:**
```javascript
// Use MCP tools for orchestration
mcp__claude-flow__task_orchestrate({
  task: "Implement Vibium MCP integration Phase 1",
  strategy: "sequential"  // Phase 1 is mostly sequential
});

// For parallel work in later phases
mcp__claude-flow__task_orchestrate({
  task: "Implement visual testing and E2E foundations",
  strategy: "parallel"
});
```

**AQE Fleet Integration:**
```javascript
// Initialize QE fleet for testing phases
mcp__agentic-qe__fleet_init({
  topology: "hierarchical",
  maxAgents: 8,
  enabledDomains: ["test-execution", "visual-accessibility", "test-generation"]
});

// Generate tests for new services
mcp__agentic-qe__test_generate_enhanced({
  sourceCode: "v3/src/integrations/vibium/client.ts",
  testType: "integration",
  language: "typescript"
});

// Execute tests in parallel
mcp__agentic-qe__test_execute_parallel({
  testFiles: ["v3/tests/integration/vibium-*.test.ts"],
  parallel: true
});
```

### 8.3 Weekly Schedule

| Week | Actions | Focus | Gate |
|------|---------|-------|------|
| 1 | A1.1, A1.2 | MCP setup, Types | Types compile |
| 2 | A1.3, A1.4 | Client wrapper, Tests | Client tests pass |
| 3 | A2.1, A2.3 | Browser mode, Viewport | Browser audit works |
| 4 | A2.2, A2.4 | axe-core, Visual diff | Visual tests pass |
| 5 | A2.5, A3.1 | Visual validation, E2E types | Milestone 3 complete |
| 6 | A3.2 | E2E runner core | Steps execute |
| 7 | A3.3, A3.4 | Flow gen, Integration | Domain integrated |
| 8 | A3.5 | E2E validation | Milestone 4 complete |

---

## 9. File Structure (Planned)

```
v3/src/integrations/vibium/
├── index.ts                    # Public exports
├── types.ts                    # TypeScript interfaces
├── errors.ts                   # Custom error types
├── client.ts                   # VibiumClient class
├── connection-manager.ts       # Connection pooling, retry
├── interfaces.ts               # Internal interfaces
└── feature-flags.ts            # Feature toggle support

v3/src/domains/visual-accessibility/services/
├── accessibility-tester.ts     # UPDATE: Add browser mode
├── axe-runner.ts               # NEW: axe-core integration
├── viewport-capture.ts         # NEW: Multi-viewport screenshots
├── baseline-store.ts           # NEW: Baseline storage
├── visual-diff.ts              # NEW: Pixel diffing
└── visual-tester.ts            # UPDATE: Add regression

v3/src/domains/test-execution/e2e/
├── interfaces.ts               # NEW: E2E interfaces
├── step-types.ts               # NEW: Step definitions
├── e2e-test-runner.ts          # NEW: Test runner service
├── step-executor.ts            # NEW: Step execution
└── assertion-handler.ts        # NEW: Assertions

v3/tests/integration/
├── vibium-client.test.ts       # NEW: Client tests
├── accessibility-browser.test.ts # NEW: Browser a11y tests
├── visual-regression.test.ts   # NEW: Visual tests
├── e2e-runner.test.ts          # NEW: E2E runner tests
└── e2e-domain-integration.test.ts # NEW: Domain tests
```

---

## 10. References

- [Vibium Integration Analysis](/workspaces/agentic-qe/docs/reference/vibium-integration-analysis.md)
- [Vibium GitHub](https://github.com/VibiumDev/vibium)
- [RuVector Integration Pattern](/workspaces/agentic-qe/v3/src/integrations/ruvector/index.ts)
- [AQE v3 Domain Interface](/workspaces/agentic-qe/v3/src/domains/domain-interface.ts)
- [Test Execution Domain](/workspaces/agentic-qe/v3/src/domains/test-execution/)
- [Visual Accessibility Domain](/workspaces/agentic-qe/v3/src/domains/visual-accessibility/)

---

## Appendix A: Action Cost Summary

| Phase | Actions | Total Cost | Hours |
|-------|---------|------------|-------|
| Phase 1 | A1.1-A1.4 | 10 | 20 |
| Phase 2 | A2.1-A2.5 | 20 | 42 |
| Phase 3 | A3.1-A3.5 | 19 | 40 |
| **Total** | **14 actions** | **49** | **102** |

*Note: Costs are relative units for GOAP planning. Hours are estimates.*

---

## Appendix B: State Transition Table

| Action | State Changes |
|--------|---------------|
| A1.1 | `mcpServerConfigured: true`, `browserAutomationAvailable: true` |
| A1.2 | `vibiumTypes: true` |
| A1.3 | `vibiumClientWrapper: true`, `connectionManagement: true`, `retryLogic: true` |
| A1.4 | `vibiumIntegrated: true` |
| A2.1 | `accessibilityTesterHasBrowserMode: true`, `realDOMInspection: true` |
| A2.2 | `axeCoreIntegrated: true` |
| A2.3 | `screenshotCapture: true`, `multiViewportTesting: true` |
| A2.4 | `baselineStorage: true`, `pixelDiffing: true`, `visualRegressionCapability: true` |
| A3.1 | `stepBasedTestFormat: true` |
| A3.2 | `e2eTestRunnerExists: true`, `browserTestExecution: true` |
| A3.3 | `userFlowTesting: true` |
| A3.4 | `testExecutionBrowserSupport: true`, `crossDomainE2ECoordination: true` |
