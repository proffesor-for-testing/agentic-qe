# GOAP Implementation Plan: @claude-flow/browser Integration into AQE v3

**Document Version:** 1.0.0
**Created:** 2026-01-21
**Status:** Ready for Execution
**Strategy:** COMPLEMENT (Strategic Import)

---

## Executive Summary

This document provides a Goal-Oriented Action Planning (GOAP) implementation plan for integrating selected high-value components from `@claude-flow/browser` v3.0.0-alpha.2 into AQE v3. Following the Six Thinking Hats analysis recommendation, we adopt a **COMPLEMENT** strategy: keep existing AgentBrowserClient as foundation while strategically importing security scanner, workflow templates, trajectory learning, and swarm coordination.

---

## 1. Goal State Definition

### 1.1 Current State (World State T0)

```typescript
interface CurrentState {
  // Existing AQE v3 capabilities
  domains: {
    visualAccessibility: {
      hasAccessibilityTester: true,
      hasVisualRegression: true,
      hasViewportCapture: true,
      hasAxeCoreIntegration: true,
      hasSecurityScanner: false,        // GAP
      hasWorkflowTemplates: false,      // GAP
      hasTrajectoryLearning: false,     // GAP
      hasSwarmCoordination: false,      // GAP
    },
    testExecution: {
      hasE2ERunner: true,
      hasParallelExecution: true,
      hasFlakyDetection: true,
      hasWorkflowTemplates: false,      // GAP
    },
    learningOptimization: {
      hasQEReasoningBank: true,
      hasPatternStore: true,
      hasHNSWIndexing: true,
      hasTrajectoryAdapter: false,      // GAP
      hasBrowserTrajectoryLearning: false, // GAP
    },
  },
  dependencies: {
    vibium: "^0.1.2",                   // Base browser automation
    axeCore: "^4.11.1",                 // Accessibility
    claudeFlowBrowser: null,           // NOT INSTALLED
  },
  integration: {
    resultPatternAdapter: false,        // Need Result<T,E> wrapper
    processCleanupIntegrated: true,     // Already have
  },
}
```

### 1.2 Goal State (World State TN)

```typescript
interface GoalState {
  domains: {
    visualAccessibility: {
      hasAccessibilityTester: true,
      hasVisualRegression: true,
      hasViewportCapture: true,
      hasAxeCoreIntegration: true,
      hasSecurityScanner: true,          // ACHIEVED
      hasWorkflowTemplates: true,        // ACHIEVED
      hasTrajectoryLearning: true,       // ACHIEVED
      hasSwarmCoordination: true,        // ACHIEVED
    },
    testExecution: {
      hasE2ERunner: true,
      hasParallelExecution: true,
      hasFlakyDetection: true,
      hasWorkflowTemplates: true,        // ACHIEVED
    },
    learningOptimization: {
      hasQEReasoningBank: true,
      hasPatternStore: true,
      hasHNSWIndexing: true,
      hasTrajectoryAdapter: true,        // ACHIEVED
      hasBrowserTrajectoryLearning: true,// ACHIEVED
    },
  },
  dependencies: {
    vibium: "^0.1.2",
    axeCore: "^4.11.1",
    claudeFlowBrowser: "^3.0.0",        // OPTIONAL PEER DEP
  },
  integration: {
    resultPatternAdapter: true,          // ACHIEVED
    processCleanupIntegrated: true,
  },
  // Success metrics
  metrics: {
    securityScanCoverage: ">= 95%",
    workflowTemplatesAvailable: 9,
    trajectoryLearningAccuracy: ">= 80%",
    parallelViewportSpeedup: ">= 3x",
    skillIntegrationComplete: true,
  },
}
```

---

## 2. Action Inventory

### 2.1 Available Actions

| Action ID | Name | Preconditions | Effects | Cost | Agent Type |
|-----------|------|---------------|---------|------|------------|
| A01 | AddOptionalPeerDep | package.json exists | claudeFlowBrowser available | 1 | coder |
| A02 | CreateResultAdapter | A01 complete | Can wrap plain objects to Result<T,E> | 2 | architect |
| A03 | ImportSecurityScanner | A01, A02 complete | BrowserSecurityScanner available | 3 | coder |
| A04 | IntegrateSecurityScanner | A03 complete | Security scanning in visual-accessibility | 2 | qe-integration-tester |
| A05 | CopyWorkflowTemplates | A01 complete | 9 workflow templates available | 2 | coder |
| A06 | IntegrateWorkflowsTestExecution | A05 complete | Workflows in test-execution domain | 2 | qe-test-architect |
| A07 | IntegrateWorkflowsVisualAccessibility | A05 complete | Workflows in visual-accessibility domain | 2 | qe-visual-tester |
| A08 | CreateTrajectoryAdapter | A02 complete | TrajectoryAdapter for ReasoningBank | 4 | architect |
| A09 | IntegrateTrajectoryLearning | A08 complete | Trajectory learning operational | 3 | qe-test-architect |
| A10 | ImplementSwarmPattern | A01 complete | BrowserSwarmCoordinator pattern | 4 | architect |
| A11 | IntegrateParallelViewports | A10 complete | Multi-viewport parallel testing | 3 | qe-visual-tester |
| A12 | BuildSecurityVisualSkill | A04, A07 complete | Integrated skill available | 3 | coder |
| A13 | WriteUnitTests | Per component | Tests passing | 2 | tester |
| A14 | WriteIntegrationTests | Per integration | E2E tests passing | 3 | qe-integration-tester |
| A15 | DocumentIntegration | All complete | Documentation ready | 1 | researcher |

### 2.2 Action Dependency Graph

```
A01 (AddOptionalPeerDep)
  |
  +---> A02 (CreateResultAdapter)
  |       |
  |       +---> A03 (ImportSecurityScanner) ---> A04 (IntegrateSecurityScanner)
  |       |                                            |
  |       +---> A08 (CreateTrajectoryAdapter)          |
  |               |                                    |
  |               +---> A09 (IntegrateTrajectoryLearning)
  |                                                    |
  +---> A05 (CopyWorkflowTemplates)                    |
  |       |                                            |
  |       +---> A06 (IntegrateWorkflowsTestExecution)  |
  |       |                                            |
  |       +---> A07 (IntegrateWorkflowsVisualAccessibility)
  |                     |                              |
  +---> A10 (ImplementSwarmPattern)                    |
          |                                            |
          +---> A11 (IntegrateParallelViewports)       |
                                                       |
                                                       v
                                              A12 (BuildSecurityVisualSkill)
                                                       |
                                                       v
                                              A15 (DocumentIntegration)
```

---

## 3. Milestone Breakdown

### Milestone 0: Foundation (Day 1)

**Goal:** Establish @claude-flow/browser as available dependency

| Task | Action ID | Preconditions | Effects | Agents |
|------|-----------|---------------|---------|--------|
| Add optional peer dependency | A01 | package.json exists | Dependency available | coder |
| Create Result<T,E> adapter | A02 | A01 complete | Pattern adapter ready | architect |

**Parallel Execution Group 0:** A01 then A02 (sequential - dependency required)

**Success Criteria:**
- [ ] `@claude-flow/browser` in optionalDependencies
- [ ] `BrowserResultAdapter` class with `wrapResult<T,E>(value: T): Result<T,E>`
- [ ] Unit tests for adapter passing

**Risk Checkpoint:**
- Verify package resolves correctly
- Confirm no version conflicts with vibium
- Fallback: If dependency fails, proceed with local copies

---

### Milestone 1: Security Scanner Integration (Days 2-3)

**Goal:** BrowserSecurityScanner operational in visual-accessibility domain

| Task | Action ID | Preconditions | Effects | Agents |
|------|-----------|---------------|---------|--------|
| Import BrowserSecurityScanner | A03 | A02 complete | Scanner available | coder, researcher |
| Integrate into visual-accessibility | A04 | A03 complete | Domain uses scanner | qe-integration-tester, qe-security-scanner |
| Write security scanner tests | A13 | A04 complete | Tests passing | tester |

**Parallel Execution Group 1A:** A03 (Import)
**Parallel Execution Group 1B:** A04 + A13 (after A03)

**Security Scanner Features to Import:**
```typescript
interface BrowserSecurityScanner {
  // URL validation - prevents SSRF, open redirects
  validateUrl(url: string): SecurityResult;

  // Phishing detection - checks against known patterns
  detectPhishing(url: string): PhishingResult;

  // PII scanning - detects sensitive data exposure
  scanForPII(content: string): PIIResult;

  // XSS prevention - sanitizes injected content
  preventXSS(input: string): SanitizedResult;
}
```

**Integration Points:**
1. `visual-accessibility/services/visual-tester.ts` - Pre-capture URL validation
2. `visual-accessibility/services/accessibility-tester.ts` - Content scanning
3. `visual-accessibility/coordinator.ts` - Security-first audit mode

**Success Criteria:**
- [ ] `BrowserSecurityScanner` imported with AQE Result adapter
- [ ] URL validation before every screenshot capture
- [ ] PII detection in accessibility audit reports
- [ ] Security scan metrics exposed in domain health
- [ ] Unit tests: 15+ test cases
- [ ] Integration test: Full security audit workflow

**Risk Checkpoint:**
- Test against known phishing URLs (sanitized test set)
- Verify no false positives on legitimate URLs
- Fallback: Graceful degradation if scanner unavailable

---

### Milestone 2: Workflow Templates (Days 2-3)

**Goal:** 9 workflow templates available in test-execution and visual-accessibility

| Task | Action ID | Preconditions | Effects | Agents |
|------|-----------|---------------|---------|--------|
| Copy workflow templates | A05 | A01 complete | Templates available | coder |
| Integrate into test-execution | A06 | A05 complete | Test workflows ready | qe-test-architect |
| Integrate into visual-accessibility | A07 | A05 complete | Visual workflows ready | qe-visual-tester |
| Write workflow tests | A13 | A06, A07 complete | Tests passing | tester |

**Parallel Execution Group 2:** A05, then (A06 || A07) in parallel, then A13

**Workflow Templates to Import:**
```typescript
const WORKFLOW_TEMPLATES = [
  'login-flow',           // Authentication testing
  'oauth-flow',           // OAuth2/OIDC testing
  'scraping-workflow',    // Data extraction patterns
  'visual-regression',    // Screenshot comparison workflow
  'form-validation',      // Input validation testing
  'navigation-flow',      // Multi-page navigation
  'api-integration',      // Browser-API hybrid tests
  'performance-audit',    // Lighthouse-style audits
  'accessibility-audit',  // WCAG compliance workflow
];
```

**Storage Location:**
```
v3/src/workflows/
  browser/
    templates/
      login-flow.yaml
      oauth-flow.yaml
      visual-regression.yaml
      ...
    index.ts
    workflow-loader.ts
```

**Success Criteria:**
- [ ] 9 workflow templates in `v3/src/workflows/browser/templates/`
- [ ] `WorkflowLoader` class with `load(templateName)` method
- [ ] Integration with `test-execution` E2E runner
- [ ] Integration with `visual-accessibility` coordinator
- [ ] Unit tests for each template
- [ ] Integration test: Execute login-flow end-to-end

**Risk Checkpoint:**
- Verify YAML structure compatibility
- Test template variable substitution
- Fallback: Manual workflow definition if templates fail

---

### Milestone 3: Trajectory Learning Adapter (Days 4-6)

**Goal:** Browser trajectories feed into QEReasoningBank for pattern learning

| Task | Action ID | Preconditions | Effects | Agents |
|------|-----------|---------------|---------|--------|
| Create TrajectoryAdapter | A08 | A02 complete | Adapter ready | architect |
| Integrate with ReasoningBank | A09 | A08 complete | Learning operational | qe-test-architect, coder |
| Write trajectory tests | A13 | A09 complete | Tests passing | tester |
| Write integration tests | A14 | A09 complete | E2E tests passing | qe-integration-tester |

**Parallel Execution Group 3:** A08 then (A09 + A13 + A14)

**TrajectoryAdapter Architecture:**

```typescript
/**
 * Adapter between @claude-flow/browser trajectories and QEReasoningBank
 *
 * @claude-flow/browser uses:
 *   - trajectoryId: string
 *   - steps: Array<{ action, result, timestamp }>
 *   - outcome: 'success' | 'failure'
 *
 * QEReasoningBank expects:
 *   - QEPattern with patternType: 'browser-trajectory'
 *   - LearningOutcome for feedback
 */
interface TrajectoryAdapter {
  // Convert browser trajectory to QE pattern
  toQEPattern(trajectory: BrowserTrajectory): CreateQEPatternOptions;

  // Convert trajectory outcome to learning outcome
  toLearningOutcome(trajectory: BrowserTrajectory): LearningOutcome;

  // Extract reusable action sequences
  extractActionSequences(trajectories: BrowserTrajectory[]): ActionSequence[];

  // Store trajectory for future similarity matching
  storeTrajectory(trajectory: BrowserTrajectory): Promise<Result<string>>;

  // Find similar successful trajectories
  findSimilarSuccessful(currentContext: BrowserContext): Promise<BrowserTrajectory[]>;
}
```

**Integration with QEReasoningBank:**

```typescript
// New pattern type for browser trajectories
type QEPatternType =
  | 'test-template'
  | 'mock-pattern'
  | 'coverage-strategy'
  | 'flaky-fix'
  | 'browser-trajectory'  // NEW
  | 'visual-workflow';    // NEW

// Extended context for browser patterns
interface QEPatternContext {
  // ... existing fields ...
  browserContext?: {
    initialUrl?: string;
    targetSelectors?: string[];
    workflowType?: string;
  };
}
```

**Success Criteria:**
- [ ] `TrajectoryAdapter` class implemented
- [ ] New pattern types registered in QEReasoningBank
- [ ] Browser trajectories stored with HNSW embeddings
- [ ] Similar trajectory lookup working (< 100ms p95)
- [ ] Pattern success rate tracking for browser workflows
- [ ] Unit tests: 20+ test cases
- [ ] Integration test: Full trajectory storage and retrieval

**Risk Checkpoint:**
- Memory overhead assessment (HNSW with trajectory vectors)
- Embedding quality validation
- Fallback: Disable trajectory storage if memory > threshold

---

### Milestone 4: Parallel Viewport Swarm (Days 4-6)

**Goal:** Multi-session browser coordination for parallel viewport testing

| Task | Action ID | Preconditions | Effects | Agents |
|------|-----------|---------------|---------|--------|
| Implement swarm pattern | A10 | A01 complete | Coordinator ready | architect |
| Integrate parallel viewports | A11 | A10 complete | Multi-viewport testing | qe-visual-tester, coder |
| Write swarm tests | A13 | A11 complete | Tests passing | tester |
| Write performance tests | A14 | A11 complete | Performance validated | qe-integration-tester |

**Parallel Execution Group 4:** A10 then (A11 + A13 + A14)

**BrowserSwarmCoordinator Architecture:**

```typescript
interface BrowserSwarmCoordinator {
  // Initialize swarm with viewport configurations
  initialize(viewports: Viewport[]): Promise<void>;

  // Execute task across all viewports in parallel
  executeParallel<T>(
    task: (session: BrowserSession, viewport: Viewport) => Promise<T>
  ): Promise<Map<Viewport, Result<T>>>;

  // Capture screenshots across all viewports
  captureAllViewports(url: string): Promise<Map<Viewport, Screenshot>>;

  // Run accessibility audit across all viewports
  auditAllViewports(url: string): Promise<Map<Viewport, AccessibilityReport>>;

  // Graceful shutdown
  shutdown(): Promise<void>;
}
```

**Standard Viewport Set:**

```typescript
const STANDARD_VIEWPORTS: Viewport[] = [
  { width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true },   // iPhone SE
  { width: 375, height: 812, deviceScaleFactor: 3, isMobile: true, hasTouch: true },   // iPhone X
  { width: 768, height: 1024, deviceScaleFactor: 2, isMobile: false, hasTouch: true }, // iPad
  { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false }, // Laptop
  { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false }, // Desktop
];
```

**Integration with Visual-Accessibility Domain:**

```typescript
// Enhanced coordinator interface
interface IVisualAccessibilityCoordinator {
  // ... existing methods ...

  // NEW: Run visual tests across all viewports in parallel
  runParallelViewportTests(
    urls: string[],
    viewports?: Viewport[]
  ): Promise<Result<ParallelViewportReport>>;

  // NEW: Get swarm status
  getSwarmStatus(): Promise<SwarmStatus>;
}
```

**Success Criteria:**
- [ ] `BrowserSwarmCoordinator` class implemented
- [ ] Parallel viewport capture working
- [ ] Resource management (max concurrent sessions)
- [ ] Process cleanup on failure
- [ ] Performance: >= 3x speedup vs sequential
- [ ] Unit tests: 15+ test cases
- [ ] Performance test: 5 viewports, 10 URLs < 30s

**Risk Checkpoint:**
- Memory usage per session
- Process cleanup verification
- Fallback: Sequential execution if swarm fails

---

### Milestone 5: Security-First Visual Testing Skill (Days 7-8)

**Goal:** Integrated skill combining security scanning and visual testing

| Task | Action ID | Preconditions | Effects | Agents |
|------|-----------|---------------|---------|--------|
| Build integrated skill | A12 | A04, A07 complete | Skill available | coder, architect |
| Write skill tests | A13 | A12 complete | Tests passing | tester |
| Write E2E tests | A14 | A12 complete | E2E tests passing | qe-integration-tester |

**Parallel Execution Group 5:** A12 then (A13 || A14)

**Skill Definition:**

```yaml
# .claude/skills/security-visual-testing.yaml
name: security-visual-testing
version: "1.0.0"
description: |
  Security-first visual testing skill that combines URL validation,
  PII detection, and visual regression testing with parallel viewport support.

dependencies:
  - "@claude-flow/browser"  # Optional
  - "visual-accessibility"  # AQE v3 domain
  - "test-execution"        # AQE v3 domain

capabilities:
  - url-security-validation
  - pii-detection
  - visual-regression
  - parallel-viewport-testing
  - accessibility-audit

workflows:
  security-visual-audit:
    description: "Full security + visual audit pipeline"
    steps:
      - validate-urls
      - scan-for-security-issues
      - capture-parallel-viewports
      - compare-with-baselines
      - audit-accessibility
      - generate-report

  pii-safe-screenshot:
    description: "Screenshot with PII detection and masking"
    steps:
      - validate-url
      - capture-screenshot
      - scan-for-pii
      - mask-sensitive-content
      - save-safe-version
```

**Skill Implementation:**

```typescript
// v3/src/skills/security-visual-testing/index.ts
export class SecurityVisualTestingSkill implements ISkill {
  constructor(
    private readonly securityScanner: BrowserSecurityScanner,
    private readonly visualCoordinator: IVisualAccessibilityCoordinator,
    private readonly swarmCoordinator: BrowserSwarmCoordinator,
    private readonly trajectoryAdapter: TrajectoryAdapter,
  ) {}

  async executeSecurityVisualAudit(
    urls: string[],
    options: SecurityVisualAuditOptions
  ): Promise<Result<SecurityVisualAuditReport>> {
    // 1. Validate all URLs
    const urlResults = await Promise.all(
      urls.map(url => this.securityScanner.validateUrl(url))
    );

    // 2. Run parallel viewport tests
    const viewportResults = await this.swarmCoordinator.executeParallel(
      async (session, viewport) => {
        const screenshot = await session.captureScreenshot(url);
        const piiScan = await this.securityScanner.scanForPII(screenshot);
        const a11yReport = await session.auditAccessibility(url);
        return { screenshot, piiScan, a11yReport };
      }
    );

    // 3. Store successful trajectory for learning
    const trajectory = this.buildTrajectory(urls, viewportResults);
    await this.trajectoryAdapter.storeTrajectory(trajectory);

    // 4. Generate comprehensive report
    return this.generateReport(urlResults, viewportResults);
  }
}
```

**Success Criteria:**
- [ ] Skill definition file in `.claude/skills/`
- [ ] Skill implementation in `v3/src/skills/`
- [ ] MCP tool handlers for skill invocation
- [ ] Full pipeline: URL validate -> screenshot -> PII scan -> a11y audit
- [ ] Trajectory storage after successful runs
- [ ] Unit tests: 10+ test cases
- [ ] E2E test: Full audit of test URL set

**Risk Checkpoint:**
- Skill loading mechanism verification
- Error propagation through pipeline
- Fallback: Individual tool calls if skill fails

---

### Milestone 6: Documentation and Finalization (Day 8)

**Goal:** Complete documentation and final verification

| Task | Action ID | Preconditions | Effects | Agents |
|------|-----------|---------------|---------|--------|
| Write documentation | A15 | All complete | Docs ready | researcher |
| Final integration tests | A14 | All complete | All tests passing | qe-integration-tester |
| Performance validation | - | All complete | Metrics validated | reviewer |

**Parallel Execution Group 6:** A15 || A14 || Performance validation

**Documentation Deliverables:**
1. `docs/integration/claude-flow-browser.md` - Integration guide
2. `docs/api/security-scanner.md` - Security scanner API
3. `docs/api/workflow-templates.md` - Workflow templates reference
4. `docs/api/trajectory-learning.md` - Trajectory learning guide
5. `docs/api/browser-swarm.md` - Swarm coordination guide
6. ADR update for @claude-flow/browser integration decision

**Success Criteria:**
- [ ] All documentation complete
- [ ] All unit tests passing (50+ total)
- [ ] All integration tests passing (10+ total)
- [ ] Performance benchmarks met
- [ ] No critical security vulnerabilities
- [ ] Code review approved

---

## 4. Parallel Execution Groups

### Group Execution Timeline

```
Day 1:
  [Group 0] A01 -> A02 (sequential)

Day 2-3:
  [Group 1] A03 -> A04 + A13 (security scanner)
      ||
  [Group 2] A05 -> (A06 || A07) -> A13 (workflows)

Day 4-6:
  [Group 3] A08 -> (A09 + A13 + A14) (trajectory learning)
      ||
  [Group 4] A10 -> (A11 + A13 + A14) (swarm pattern)

Day 7-8:
  [Group 5] A12 -> (A13 || A14) (skill)
      ||
  [Group 6] A15 || Final validation (documentation)
```

### Resource Allocation

| Day | Active Agents | Parallel Tasks |
|-----|---------------|----------------|
| 1 | 2 | 1-2 |
| 2 | 6 | 4 |
| 3 | 6 | 4 |
| 4 | 6 | 4 |
| 5 | 6 | 4 |
| 6 | 6 | 4 |
| 7 | 5 | 3 |
| 8 | 4 | 3 |

---

## 5. Agent Assignments

### 5.1 Claude-Flow Agents

| Agent | Milestone | Tasks | Responsibilities |
|-------|-----------|-------|------------------|
| **architect** | M0, M3, M4, M5 | A02, A08, A10, A12 | Design adapters, patterns, architecture decisions |
| **coder** | M0, M1, M2, M4, M5 | A01, A03, A05, A11, A12 | Implementation, code changes, dependency management |
| **tester** | M1-M5 | A13 (all) | Unit test creation and execution |
| **researcher** | M1, M6 | A03, A15 | API research, documentation |
| **reviewer** | M6 | Final validation | Code review, performance validation |

### 5.2 AQE v3 Agents

| Agent | Milestone | Tasks | Responsibilities |
|-------|-----------|-------|------------------|
| **qe-test-architect** | M2, M3 | A06, A09 | Test strategy, workflow design |
| **qe-integration-tester** | M1, M3-M6 | A04, A14 (all) | Integration testing, E2E validation |
| **qe-security-scanner** | M1 | A04 | Security validation, vulnerability testing |
| **qe-visual-tester** | M2, M4 | A07, A11 | Visual testing integration |

### 5.3 Agent Capability Mapping

```typescript
const AGENT_TASK_MAPPING = {
  'A01': ['coder'],
  'A02': ['architect'],
  'A03': ['coder', 'researcher'],
  'A04': ['qe-integration-tester', 'qe-security-scanner'],
  'A05': ['coder'],
  'A06': ['qe-test-architect'],
  'A07': ['qe-visual-tester'],
  'A08': ['architect'],
  'A09': ['qe-test-architect', 'coder'],
  'A10': ['architect'],
  'A11': ['qe-visual-tester', 'coder'],
  'A12': ['coder', 'architect'],
  'A13': ['tester'],
  'A14': ['qe-integration-tester'],
  'A15': ['researcher'],
};
```

---

## 6. Memory/Learning Coordination Strategy

### 6.1 Shared Memory Namespaces

```typescript
const MEMORY_NAMESPACES = {
  // Integration patterns learned
  'browser-integration:patterns': {
    description: 'Successful integration patterns',
    retention: 'permanent',
    agents: ['architect', 'coder'],
  },

  // Security scan results
  'browser-integration:security': {
    description: 'Security validation results',
    retention: '30d',
    agents: ['qe-security-scanner'],
  },

  // Workflow execution traces
  'browser-integration:workflows': {
    description: 'Workflow execution history',
    retention: '7d',
    agents: ['qe-test-architect', 'qe-integration-tester'],
  },

  // Trajectory learning data
  'browser-integration:trajectories': {
    description: 'Browser trajectory patterns',
    retention: 'permanent',
    vectorIndexed: true,
    agents: ['qe-test-architect', 'qe-visual-tester'],
  },

  // Performance metrics
  'browser-integration:metrics': {
    description: 'Performance benchmarks',
    retention: '90d',
    agents: ['reviewer'],
  },
};
```

### 6.2 Cross-Agent Learning Protocol

```typescript
interface LearningProtocol {
  // When task succeeds, store pattern
  onTaskSuccess(task: Task, agent: string): void {
    await memory.store({
      namespace: 'browser-integration:patterns',
      key: `${task.type}-${Date.now()}`,
      value: {
        task: task.description,
        agent,
        approach: task.approach,
        duration: task.duration,
        artifacts: task.artifacts,
      },
    });
  }

  // Before starting task, search for similar patterns
  async findSimilarPatterns(task: Task): Promise<Pattern[]> {
    return await memory.search({
      namespace: 'browser-integration:patterns',
      query: task.description,
      limit: 5,
    });
  }

  // Share learning between domains
  async shareLearning(sourceDomain: string, targetDomains: string[]): void {
    const patterns = await memory.list({
      namespace: `browser-integration:${sourceDomain}`,
    });

    for (const target of targetDomains) {
      await memory.store({
        namespace: `browser-integration:${target}`,
        key: `shared-from-${sourceDomain}`,
        value: patterns,
      });
    }
  }
}
```

### 6.3 ReasoningBank Integration

```typescript
// Store browser integration patterns in QEReasoningBank
const browserPatternTypes: QEPatternType[] = [
  'browser-trajectory',
  'visual-workflow',
  'security-scan',
  'viewport-strategy',
];

// Pattern template for browser workflows
const browserWorkflowPattern: CreateQEPatternOptions = {
  patternType: 'visual-workflow',
  name: 'Security-First Visual Audit',
  description: 'Combined security + visual + a11y audit workflow',
  template: {
    type: 'workflow',
    content: `
      1. Validate URLs for security issues
      2. Capture screenshots across viewports
      3. Scan for PII exposure
      4. Run accessibility audit
      5. Compare with baselines
      6. Generate comprehensive report
    `,
    variables: [
      { name: 'urls', type: 'array', required: true },
      { name: 'viewports', type: 'array', required: false },
    ],
  },
  context: {
    tags: ['security', 'visual-testing', 'accessibility', 'workflow'],
    browserContext: {
      workflowType: 'security-visual-audit',
    },
  },
};
```

---

## 7. Risk Mitigation Checkpoints

### 7.1 Checkpoint Matrix

| Checkpoint | Milestone | Criteria | Fallback |
|------------|-----------|----------|----------|
| C1 | M0 | Dependency resolves | Use local copy |
| C2 | M1 | No false positives | Tune thresholds |
| C3 | M2 | Templates parse | Manual definition |
| C4 | M3 | Memory < 500MB | Disable trajectory storage |
| C5 | M4 | Process cleanup works | Sequential fallback |
| C6 | M5 | Skill loads correctly | Individual tools |
| C7 | M6 | All tests pass | Defer release |

### 7.2 Rollback Procedures

```typescript
interface RollbackProcedure {
  milestone: string;
  trigger: string;
  steps: string[];
}

const ROLLBACK_PROCEDURES: RollbackProcedure[] = [
  {
    milestone: 'M0',
    trigger: 'Dependency conflict',
    steps: [
      'Remove @claude-flow/browser from package.json',
      'Copy required classes locally to v3/src/external/claude-flow-browser/',
      'Update imports to use local copies',
      'Document deviation from integration plan',
    ],
  },
  {
    milestone: 'M1',
    trigger: 'Security scanner false positives > 5%',
    steps: [
      'Increase phishing detection threshold',
      'Add URL whitelist for known safe domains',
      'Create allowlist for test environments',
      'Re-run validation tests',
    ],
  },
  {
    milestone: 'M4',
    trigger: 'Swarm memory > 500MB',
    steps: [
      'Reduce max concurrent sessions to 3',
      'Implement session pooling',
      'Add memory pressure monitoring',
      'Fall back to sequential if pool exhausted',
    ],
  },
];
```

### 7.3 Health Monitoring

```typescript
interface IntegrationHealth {
  // Overall status
  status: 'healthy' | 'degraded' | 'failed';

  // Per-component health
  components: {
    securityScanner: ComponentHealth;
    workflowTemplates: ComponentHealth;
    trajectoryLearning: ComponentHealth;
    browserSwarm: ComponentHealth;
    skill: ComponentHealth;
  };

  // Performance metrics
  metrics: {
    avgSecurityScanTime: number;
    avgWorkflowExecutionTime: number;
    trajectoryStorageSize: number;
    swarmMemoryUsage: number;
  };

  // Error tracking
  recentErrors: IntegrationError[];
}

// Health check endpoint
async function checkIntegrationHealth(): Promise<IntegrationHealth> {
  const health: IntegrationHealth = {
    status: 'healthy',
    components: {},
    metrics: {},
    recentErrors: [],
  };

  // Check each component
  try {
    await securityScanner.validateUrl('https://example.com');
    health.components.securityScanner = { status: 'healthy', latency: 50 };
  } catch (e) {
    health.components.securityScanner = { status: 'failed', error: e.message };
    health.status = 'degraded';
  }

  // ... check other components

  return health;
}
```

---

## 8. Timeline Summary

| Day | Milestones | Key Deliverables | Risk Checkpoints |
|-----|------------|------------------|------------------|
| 1 | M0 | Dependency + Adapter | C1 |
| 2 | M1, M2 (start) | Security Scanner, Templates (partial) | C2 |
| 3 | M1, M2 (complete) | Security integrated, Templates complete | C3 |
| 4 | M3, M4 (start) | Trajectory Adapter, Swarm (partial) | - |
| 5 | M3, M4 (continue) | Learning integration, Viewports | C4, C5 |
| 6 | M3, M4 (complete) | Full learning + swarm | - |
| 7 | M5 | Skill implementation | C6 |
| 8 | M5, M6 | Skill tests, Documentation | C7 |

---

## 9. Success Metrics

### 9.1 Functional Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Security scan coverage | >= 95% URL validation | Unit test coverage |
| Workflow templates | 9 available | Count in templates/ |
| Trajectory learning accuracy | >= 80% similar match | Integration test |
| Parallel viewport speedup | >= 3x | Benchmark vs sequential |

### 9.2 Quality Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Unit test coverage | >= 80% | vitest coverage |
| Integration test pass rate | 100% | CI pipeline |
| Security vulnerabilities | 0 critical | npm audit |
| Documentation completeness | 100% | Review checklist |

### 9.3 Performance Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Security scan latency p95 | < 100ms | Benchmark |
| Workflow execution p95 | < 5s | Benchmark |
| Trajectory storage p95 | < 50ms | Benchmark |
| Swarm initialization | < 3s | Benchmark |

---

## 10. GOAP Execution Commands

### 10.1 Initialize Planning

```bash
# Store initial world state
npx @claude-flow/cli@latest memory store \
  --key "goap:browser-integration:world-state" \
  --value '{"milestone": 0, "status": "planning"}' \
  --namespace goap

# Store goal state
npx @claude-flow/cli@latest memory store \
  --key "goap:browser-integration:goal-state" \
  --value '{"allMilestonesComplete": true, "metricsValidated": true}' \
  --namespace goap
```

### 10.2 Execute Milestone

```bash
# Route task to optimal agent
npx @claude-flow/cli@latest hooks route \
  --task "Implement BrowserSecurityScanner integration for visual-accessibility domain"

# Pre-task hook for model routing
npx @claude-flow/cli@latest hooks pre-task \
  --description "Import and adapt BrowserSecurityScanner from @claude-flow/browser"

# Spawn agents for parallel execution
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical \
  --max-agents 8 \
  --strategy specialized
```

### 10.3 Track Progress

```bash
# Store milestone completion
npx @claude-flow/cli@latest memory store \
  --key "goap:browser-integration:milestone-1" \
  --value '{"status": "complete", "timestamp": "2026-01-22T18:00:00Z"}' \
  --namespace goap

# Search for learned patterns
npx @claude-flow/cli@latest memory search \
  --query "security scanner integration" \
  --namespace browser-integration:patterns
```

### 10.4 MCP Tool Invocations

```javascript
// Initialize AQE fleet for browser integration
mcp__agentic-qe__fleet_init({
  topology: "hierarchical",
  maxAgents: 8,
  enabledDomains: ["visual-accessibility", "test-execution", "learning-optimization"]
});

// Spawn security specialist agent
mcp__agentic-qe__agent_spawn({
  domain: "security-compliance",
  type: "qe-security-scanner"
});

// Store integration pattern
mcp__agentic-qe__memory_store({
  key: "browser-integration-pattern-security",
  value: {
    component: "BrowserSecurityScanner",
    integration: "visual-accessibility",
    approach: "adapter-pattern",
    successRate: 1.0
  },
  namespace: "browser-integration:patterns"
});
```

---

## Appendix A: File Structure

```
v3/
  src/
    external/
      claude-flow-browser/           # Optional local copies
        security-scanner.ts
        workflow-templates/
    adapters/
      browser-result-adapter.ts      # M0
      trajectory-adapter.ts          # M3
    workflows/
      browser/
        templates/                   # M2
          login-flow.yaml
          oauth-flow.yaml
          visual-regression.yaml
          ...
        index.ts
        workflow-loader.ts
    domains/
      visual-accessibility/
        services/
          browser-security-scanner.ts  # M1
          browser-swarm-coordinator.ts # M4
    skills/
      security-visual-testing/       # M5
        index.ts
        skill.yaml
  tests/
    unit/
      adapters/
        browser-result-adapter.test.ts
        trajectory-adapter.test.ts
      workflows/
        workflow-loader.test.ts
      domains/
        visual-accessibility/
          browser-security-scanner.test.ts
          browser-swarm-coordinator.test.ts
    integration/
      browser-integration/
        security-scanner.integration.test.ts
        trajectory-learning.integration.test.ts
        parallel-viewports.integration.test.ts
        skill.integration.test.ts
docs/
  integration/
    claude-flow-browser.md
  api/
    security-scanner.md
    workflow-templates.md
    trajectory-learning.md
    browser-swarm.md
```

---

## Appendix B: Code Templates

### B.1 Result Adapter Template

```typescript
// v3/src/adapters/browser-result-adapter.ts
import { Result, ok, err } from '../shared/types/index.js';

/**
 * Adapter to convert @claude-flow/browser plain objects to AQE v3 Result<T,E>
 */
export class BrowserResultAdapter {
  /**
   * Wrap a value in a success Result
   */
  static wrapSuccess<T>(value: T): Result<T, Error> {
    return ok(value);
  }

  /**
   * Wrap an error in a failure Result
   */
  static wrapError<T>(error: unknown): Result<T, Error> {
    if (error instanceof Error) {
      return err(error);
    }
    return err(new Error(String(error)));
  }

  /**
   * Convert a Promise to Result-wrapped Promise
   */
  static async wrapAsync<T>(
    promise: Promise<T>
  ): Promise<Result<T, Error>> {
    try {
      const value = await promise;
      return ok(value);
    } catch (error) {
      return BrowserResultAdapter.wrapError(error);
    }
  }

  /**
   * Convert @claude-flow/browser response to Result
   */
  static fromBrowserResponse<T>(
    response: { success: boolean; data?: T; error?: string }
  ): Result<T, Error> {
    if (response.success && response.data !== undefined) {
      return ok(response.data);
    }
    return err(new Error(response.error || 'Unknown browser error'));
  }
}
```

### B.2 Security Scanner Wrapper Template

```typescript
// v3/src/domains/visual-accessibility/services/browser-security-scanner.ts
import type { Result } from '../../../shared/types/index.js';
import { ok, err } from '../../../shared/types/index.js';
import { BrowserResultAdapter } from '../../../adapters/browser-result-adapter.js';

export interface SecurityScanResult {
  safe: boolean;
  threats: string[];
  score: number;
}

export interface PIIScanResult {
  hasPII: boolean;
  detectedTypes: string[];
  locations: Array<{ type: string; start: number; end: number }>;
}

/**
 * AQE v3 wrapper for @claude-flow/browser BrowserSecurityScanner
 */
export class BrowserSecurityScanner {
  private scanner: any | null = null;

  async initialize(): Promise<void> {
    try {
      const { BrowserSecurityScanner: Scanner } = await import(
        '@claude-flow/browser'
      );
      this.scanner = new Scanner();
    } catch {
      console.warn(
        '[BrowserSecurityScanner] @claude-flow/browser not available, using fallback'
      );
      this.scanner = null;
    }
  }

  /**
   * Validate URL for security issues (SSRF, phishing, etc.)
   */
  async validateUrl(url: string): Promise<Result<SecurityScanResult, Error>> {
    if (!this.scanner) {
      // Fallback: basic URL validation
      try {
        new URL(url);
        return ok({ safe: true, threats: [], score: 1.0 });
      } catch {
        return err(new Error('Invalid URL'));
      }
    }

    return BrowserResultAdapter.wrapAsync(
      this.scanner.validateUrl(url)
    );
  }

  /**
   * Scan content for PII exposure
   */
  async scanForPII(content: string): Promise<Result<PIIScanResult, Error>> {
    if (!this.scanner) {
      // Fallback: basic regex-based PII detection
      const emailPattern = /[\w.-]+@[\w.-]+\.\w+/g;
      const ssnPattern = /\d{3}-\d{2}-\d{4}/g;

      const emails = content.match(emailPattern) || [];
      const ssns = content.match(ssnPattern) || [];

      return ok({
        hasPII: emails.length > 0 || ssns.length > 0,
        detectedTypes: [
          ...(emails.length > 0 ? ['email'] : []),
          ...(ssns.length > 0 ? ['ssn'] : []),
        ],
        locations: [],
      });
    }

    return BrowserResultAdapter.wrapAsync(
      this.scanner.scanForPII(content)
    );
  }

  /**
   * Check if scanner is available
   */
  isAvailable(): boolean {
    return this.scanner !== null;
  }
}
```

---

**Document Prepared By:** GOAP Planning Agent
**Review Status:** Ready for Execution
**Next Action:** Execute Milestone 0 - Add Optional Peer Dependency
