# AQE Fleet v3 Improvements - GOAP Implementation Plan

**Version:** 1.0.0
**Date:** 2026-01-18
**Based On:** AQE_V3_IMPROVEMENT_ANALYSIS.md (ForgeCMS Alpha Assessment)
**Target:** Improve AQE Fleet accuracy from 65% to 85%+

---

## Executive Summary

This plan uses Goal-Oriented Action Planning (GOAP) methodology to implement five key improvements to AQE Fleet v3, prioritized based on accuracy impact:

| Priority | Improvement | Target Accuracy Gain |
|----------|-------------|---------------------|
| P0 | Code Intelligence Auto-Scan | +15% metric accuracy |
| P1 | Multi-Model Verification | +30% security accuracy |
| P1 | Tiny-Dancer Neural Routing | +10% cost efficiency |
| P1 | Claim Verification Agent | +20% false positive reduction |
| P1 | Real Metric Measurement | +35% metric accuracy |

---

## GOAP World State Model

### Current State (Before Implementation)

```typescript
interface WorldState {
  // Code Intelligence
  codeIntelligenceAutoScan: false;
  codeIntelligenceNamespace: 'code-intelligence:kg';
  kgEntryCount: 0; // For new projects, 22,757 for existing

  // Multi-Model
  multiModelVerification: false;
  consensusEngine: null;

  // Tiny-Dancer
  tinyDancerRouting: false;
  confidenceThreshold: null;

  // Claim Verification
  claimVerificationAgent: false;
  verificationPipeline: null;

  // Metrics
  realMetricMeasurement: false;
  metricToolingIntegrated: false;

  // Overall
  overallAccuracy: 0.65;
  securityAccuracy: 0.27;
  metricAccuracy: 0.60;
}
```

### Goal State (After Implementation)

```typescript
interface GoalState {
  codeIntelligenceAutoScan: true;
  multiModelVerification: true;
  tinyDancerRouting: true;
  claimVerificationAgent: true;
  realMetricMeasurement: true;

  overallAccuracy: 0.85; // Target >= 85%
  securityAccuracy: 0.75; // Target >= 75%
  metricAccuracy: 0.95;  // Target >= 95%
}
```

---

## Phase 1: Code Intelligence Auto-Scan (P0)

### Goal
Make code intelligence pre-scan automatic for new projects and detect/prompt for existing projects.

### Preconditions
- `aqe init` command exists
- Knowledge Graph service (`code-intelligence:kg` namespace) exists
- Memory backend available

### Effects
- New projects automatically indexed on `aqe init`
- Existing projects prompted to run scan if `code-intelligence:kg` is empty
- 80% token reduction via semantic search
- Accurate file inventory and LOC counts

### Tasks

| Task ID | Description | Effort | Agent | Dependencies | Parallel Group |
|---------|-------------|--------|-------|--------------|----------------|
| CI-001 | Add namespace check function to detect existing KG entries | 2h | qe-coder | - | A |
| CI-002 | Create `hasCodeIntelligenceIndex()` helper in memory backend | 2h | qe-coder | - | A |
| CI-003 | Add auto-scan step to InitOrchestrator | 4h | qe-system-architect | CI-001, CI-002 | B |
| CI-004 | Create user prompt for existing projects without index | 2h | qe-coder | CI-002 | B |
| CI-005 | Integrate with fleet-wizard for new project flow | 3h | qe-coder | CI-003 | C |
| CI-006 | Add `--skip-code-scan` flag for manual override | 1h | qe-coder | CI-005 | C |
| CI-007 | Update progress display for indexing phase | 2h | qe-coder | CI-003 | C |
| CI-008 | Write integration tests for auto-scan flow | 4h | qe-tester | CI-003, CI-004, CI-005 | D |
| CI-009 | Update documentation for new init behavior | 2h | qe-doc-writer | CI-008 | E |

### Implementation Details

#### CI-001: Namespace Check Function

**File:** `/workspaces/agentic-qe/v3/src/kernel/memory/sqlite-backend.ts`

```typescript
/**
 * Check if the code-intelligence:kg namespace has entries
 * @returns Promise<boolean> - true if entries exist
 */
async hasCodeIntelligenceIndex(): Promise<boolean> {
  const count = await this.count('code-intelligence:kg');
  return count > 0;
}
```

#### CI-003: Auto-Scan Step in InitOrchestrator

**File:** `/workspaces/agentic-qe/v3/src/init/init-wizard.ts`

Add new step after project analysis:

```typescript
// Step 2.5: Code Intelligence Pre-Scan (P0 improvement)
const kgIndexed = await this.runStep('Code Intelligence Pre-Scan', async () => {
  const hasIndex = await this.checkCodeIntelligenceIndex();

  if (!hasIndex) {
    // New project or no existing index - run full scan
    console.log(chalk.gray('  Building knowledge graph...'));
    return await this.runCodeIntelligenceScan(analysis.projectPath);
  }

  // Existing index - use it
  return { status: 'existing', entries: await this.getKGEntryCount() };
});
```

### Success Criteria
- [ ] `aqe init` automatically runs code intelligence scan for new projects
- [ ] Existing projects with empty `code-intelligence:kg` namespace get prompted
- [ ] `--skip-code-scan` flag allows skipping auto-scan
- [ ] Integration tests pass for all flows

### Milestone: CI-COMPLETE
**Deliverables:**
1. Modified `init-wizard.ts` with auto-scan step
2. Updated `fleet-wizard.ts` with KG check
3. New `hasCodeIntelligenceIndex()` method in memory backend
4. Integration tests for auto-scan
5. Updated CLI help text

---

## Phase 2: Multi-Model Verification (P1)

### Goal
Enable multi-model consensus for security findings to improve detection accuracy from 27% to 75%+.

### Preconditions
- Phase 1 complete (code intelligence indexed)
- Multiple LLM providers configured
- Security domain exists

### Effects
- CRITICAL/HIGH security findings verified by 2+ models
- Consensus engine determines finding validity
- False positive rate reduced from 30% to <10%

### Tasks

| Task ID | Description | Effort | Agent | Dependencies | Parallel Group |
|---------|-------------|--------|-------|--------------|----------------|
| MM-001 | Design ConsensusEngine interface | 4h | qe-system-architect | CI-COMPLETE | A |
| MM-002 | Implement model provider abstraction | 6h | qe-coder | - | A |
| MM-003 | Create Claude provider adapter | 4h | qe-coder | MM-002 | B |
| MM-004 | Create GPT provider adapter | 4h | qe-coder | MM-002 | B |
| MM-005 | Create Gemini provider adapter (optional) | 4h | qe-coder | MM-002 | B |
| MM-006 | Implement ConsensusEngine with threshold logic | 8h | qe-coder | MM-001 | C |
| MM-007 | Integrate with security-compliance coordinator | 6h | qe-coder | MM-006, MM-003, MM-004 | D |
| MM-008 | Add `multiModel` config to QEFleetConfig | 2h | qe-coder | MM-006 | C |
| MM-009 | Create dispute resolution workflow | 4h | qe-coder | MM-006 | C |
| MM-010 | Write unit tests for consensus logic | 4h | qe-tester | MM-006 | D |
| MM-011 | Write integration tests for multi-model flow | 6h | qe-tester | MM-007 | E |
| MM-012 | Performance benchmark multi-model overhead | 2h | qe-performance-tester | MM-007 | E |

### Implementation Details

#### MM-001: ConsensusEngine Interface

**File:** `/workspaces/agentic-qe/v3/src/coordination/consensus/interfaces.ts`

```typescript
export interface ConsensusEngine {
  /**
   * Verify a finding using multiple models
   * @param finding - The security finding to verify
   * @param options - Verification options
   * @returns ConsensusResult with verdict and model votes
   */
  verify(finding: SecurityFinding, options?: VerificationOptions): Promise<ConsensusResult>;

  /**
   * Get consensus threshold
   */
  getThreshold(): number;

  /**
   * Configure which models to use
   */
  setModels(models: ModelProvider[]): void;
}

export interface ConsensusResult {
  verdict: 'verified' | 'disputed' | 'rejected';
  confidence: number; // 0-1
  votes: ModelVote[];
  requiresHumanReview: boolean;
  reasoning: string;
}

export interface ModelVote {
  modelId: string;
  agrees: boolean;
  confidence: number;
  reasoning: string;
  executionTime: number;
}

export interface VerificationOptions {
  models?: string[]; // Specific models to use
  consensusThreshold?: number; // Override default (2/3)
  timeout?: number;
  maxRetries?: number;
}
```

#### MM-006: ConsensusEngine Implementation

**File:** `/workspaces/agentic-qe/v3/src/coordination/consensus/consensus-engine.ts`

```typescript
export class MultiModelConsensusEngine implements ConsensusEngine {
  private models: ModelProvider[] = [];
  private threshold: number = 2/3; // 2 of 3 models must agree

  async verify(finding: SecurityFinding, options?: VerificationOptions): Promise<ConsensusResult> {
    const modelsToUse = options?.models
      ? this.models.filter(m => options.models!.includes(m.id))
      : this.models;

    // Run verification in parallel
    const votes = await Promise.all(
      modelsToUse.map(model => this.getModelVote(model, finding))
    );

    // Calculate consensus
    const agreementCount = votes.filter(v => v.agrees).length;
    const agreementRatio = agreementCount / votes.length;

    const verdict: ConsensusResult['verdict'] =
      agreementRatio >= this.threshold ? 'verified' :
      agreementRatio <= (1 - this.threshold) ? 'rejected' :
      'disputed';

    return {
      verdict,
      confidence: Math.abs(agreementRatio - 0.5) * 2, // 0 at 50%, 1 at 0% or 100%
      votes,
      requiresHumanReview: verdict === 'disputed',
      reasoning: this.generateReasoning(votes, verdict),
    };
  }

  private async getModelVote(model: ModelProvider, finding: SecurityFinding): Promise<ModelVote> {
    const prompt = this.createVerificationPrompt(finding);
    const start = Date.now();

    const response = await model.complete(prompt);

    return {
      modelId: model.id,
      agrees: this.parseAgreement(response),
      confidence: this.parseConfidence(response),
      reasoning: response,
      executionTime: Date.now() - start,
    };
  }
}
```

### Success Criteria
- [ ] ConsensusEngine interface defined and implemented
- [ ] At least 2 model providers integrated (Claude, GPT)
- [ ] All CRITICAL/HIGH security findings automatically verified
- [ ] Disputed findings flagged for human review
- [ ] Unit and integration tests pass

### Milestone: MM-COMPLETE
**Deliverables:**
1. ConsensusEngine interface and implementation
2. Claude, GPT provider adapters
3. Security coordinator integration
4. Configuration schema update
5. Test suite for consensus logic

---

## Phase 3: Tiny-Dancer Neural Routing (P1)

### Goal
Integrate tiny-dancer for intelligent task routing based on complexity and confidence.

### Preconditions
- Phase 1 complete
- `@ruvector/tiny-dancer` package available
- Task routing infrastructure exists

### Effects
- Simple tasks routed to Haiku (fast, cheap)
- Complex tasks routed to Opus (thorough)
- Low-confidence results trigger multi-model verification
- 75% cost reduction on simple tasks

### Tasks

| Task ID | Description | Effort | Agent | Dependencies | Parallel Group |
|---------|-------------|--------|-------|--------------|----------------|
| TD-001 | Install and configure `@ruvector/tiny-dancer` | 2h | qe-coder | - | A |
| TD-002 | Create TinyDancerRouter wrapper class | 4h | qe-coder | TD-001 | B |
| TD-003 | Define task complexity classification | 4h | qe-system-architect | - | A |
| TD-004 | Integrate router with Queen Coordinator | 6h | qe-coder | TD-002, TD-003 | C |
| TD-005 | Add confidence threshold configuration | 2h | qe-coder | TD-002 | B |
| TD-006 | Connect low-confidence to multi-model (Phase 2) | 4h | qe-coder | TD-004, MM-COMPLETE | D |
| TD-007 | Create task type -> model mapping | 3h | qe-coder | TD-003 | B |
| TD-008 | Implement circuit breaker for model failures | 4h | qe-coder | TD-004 | D |
| TD-009 | Add routing metrics and logging | 3h | qe-coder | TD-004 | D |
| TD-010 | Write unit tests for routing logic | 4h | qe-tester | TD-004 | E |
| TD-011 | Benchmark routing performance | 2h | qe-performance-tester | TD-004 | E |

### Implementation Details

#### TD-002: TinyDancerRouter Wrapper

**File:** `/workspaces/agentic-qe/v3/src/routing/tiny-dancer-router.ts`

```typescript
import { TinyDancer } from '@ruvector/tiny-dancer';

export interface RouteResult {
  model: 'haiku' | 'sonnet' | 'opus';
  confidence: number;
  uncertainty: number;
  triggerMultiModel: boolean;
  triggerHumanReview: boolean;
}

export class TinyDancerRouter {
  private router: TinyDancer;
  private confidenceThreshold: number = 0.80;
  private uncertaintyThreshold: number = 0.20;

  constructor(config: TinyDancerConfig) {
    this.router = new TinyDancer({
      candidates: [
        { id: 'haiku', successRate: 0.95, avgLatency: 200 },
        { id: 'sonnet', successRate: 0.92, avgLatency: 1500 },
        { id: 'opus', successRate: 0.98, avgLatency: 5000 },
      ],
      confidenceThreshold: config.confidenceThreshold ?? this.confidenceThreshold,
      circuitBreaker: {
        failureThreshold: 3,
        recoveryTime: 30000,
      },
    });
  }

  async route(task: QETask): Promise<RouteResult> {
    const { candidate, confidence, uncertainty } = await this.router.route(task.description);

    // Security tasks always get verification
    const isSecurity = task.type === 'security-scan' || task.domain === 'security-compliance';

    return {
      model: candidate as RouteResult['model'],
      confidence,
      uncertainty,
      triggerMultiModel: isSecurity && confidence < 0.85,
      triggerHumanReview: uncertainty > this.uncertaintyThreshold,
    };
  }

  recordOutcome(task: QETask, success: boolean): void {
    this.router.recordOutcome(task.description, success);
  }
}
```

#### TD-003: Task Complexity Classification

**File:** `/workspaces/agentic-qe/v3/src/routing/task-classifier.ts`

```typescript
export type TaskComplexity = 'simple' | 'moderate' | 'complex' | 'critical';

export interface ClassificationResult {
  complexity: TaskComplexity;
  recommendedModel: 'haiku' | 'sonnet' | 'opus';
  factors: ComplexityFactor[];
}

export function classifyTask(task: QETask): ClassificationResult {
  const factors: ComplexityFactor[] = [];
  let score = 0;

  // File count factor
  if (task.fileCount && task.fileCount > 10) {
    score += 20;
    factors.push({ name: 'high-file-count', weight: 20 });
  }

  // Domain factor
  const complexDomains = ['security-compliance', 'chaos-resilience', 'defect-intelligence'];
  if (complexDomains.includes(task.domain)) {
    score += 30;
    factors.push({ name: 'complex-domain', weight: 30 });
  }

  // Cross-component factor
  if (task.crossComponent) {
    score += 25;
    factors.push({ name: 'cross-component', weight: 25 });
  }

  // Priority factor
  if (task.priority === 'critical' || task.priority === 'p0') {
    score += 25;
    factors.push({ name: 'critical-priority', weight: 25 });
  }

  // Determine complexity and model
  const complexity: TaskComplexity =
    score >= 70 ? 'critical' :
    score >= 45 ? 'complex' :
    score >= 20 ? 'moderate' :
    'simple';

  const recommendedModel: ClassificationResult['recommendedModel'] =
    complexity === 'critical' ? 'opus' :
    complexity === 'complex' ? 'sonnet' :
    'haiku';

  return { complexity, recommendedModel, factors };
}
```

### Success Criteria
- [ ] TinyDancerRouter integrated with Queen Coordinator
- [ ] Task complexity classification working
- [ ] Low-confidence results trigger multi-model verification
- [ ] Circuit breaker prevents cascading failures
- [ ] Routing metrics visible in status output

### Milestone: TD-COMPLETE
**Deliverables:**
1. TinyDancerRouter implementation
2. Task complexity classifier
3. Queen Coordinator integration
4. Routing metrics dashboard
5. Performance benchmarks

---

## Phase 4: Claim Verification Agent (P1)

### Goal
Add new agent type that verifies claims made by other QE agents before publishing.

### Preconditions
- Phase 1 complete (code intelligence available)
- Agent framework exists
- Security findings workflow exists

### Effects
- All security claims verified before publishing
- Claims traced to evidence (not assumed)
- False claims caught before report generation

### Tasks

| Task ID | Description | Effort | Agent | Dependencies | Parallel Group |
|---------|-------------|--------|-------|--------------|----------------|
| CV-001 | Design ClaimVerifier agent interface | 4h | qe-system-architect | - | A |
| CV-002 | Define claim types and evidence schema | 3h | qe-system-architect | - | A |
| CV-003 | Implement code trace verification method | 8h | qe-coder | CV-001, CI-COMPLETE | B |
| CV-004 | Implement execution verification method | 6h | qe-coder | CV-001 | B |
| CV-005 | Implement cross-file verification method | 6h | qe-coder | CV-001, CI-COMPLETE | B |
| CV-006 | Create ClaimVerificationWorkflow | 4h | qe-coder | CV-003, CV-004, CV-005 | C |
| CV-007 | Integrate with security-compliance coordinator | 4h | qe-coder | CV-006 | D |
| CV-008 | Add agent definition to registry | 2h | qe-coder | CV-001 | B |
| CV-009 | Create claim verification report format | 3h | qe-coder | CV-006 | C |
| CV-010 | Write unit tests for verification methods | 6h | qe-tester | CV-003, CV-004, CV-005 | D |
| CV-011 | Write integration tests for full flow | 4h | qe-tester | CV-007 | E |

### Implementation Details

#### CV-001: ClaimVerifier Agent Interface

**File:** `/workspaces/agentic-qe/v3/src/agents/claim-verifier/interfaces.ts`

```typescript
export interface Claim {
  id: string;
  type: ClaimType;
  statement: string;
  evidence: Evidence[];
  sourceAgent: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  timestamp: Date;
}

export type ClaimType =
  | 'security-implementation'  // "SQL injection prevented"
  | 'security-vulnerability'   // "XSS vulnerability found"
  | 'metric-count'             // "80+ tests exist"
  | 'pattern-implementation'   // "Timing attack prevention implemented"
  | 'coverage-claim';          // "90% coverage achieved"

export interface Evidence {
  type: 'code-snippet' | 'file-reference' | 'command-output' | 'test-result';
  location: string;
  content: string;
  verified?: boolean;
}

export interface VerificationResult {
  claimId: string;
  verified: boolean;
  confidence: number;
  method: VerificationMethod;
  counterEvidence?: Evidence[];
  reasoning: string;
  allInstancesChecked: boolean; // Did we check ALL occurrences, not just one?
}

export type VerificationMethod =
  | 'code-trace'      // Trace data flow through code
  | 'execution'       // Run actual command/tool
  | 'cross-file'      // Check all files for pattern
  | 'multi-model';    // Verify with multiple models

export interface ClaimVerifierAgent {
  /**
   * Verify a single claim
   */
  verify(claim: Claim): Promise<VerificationResult>;

  /**
   * Verify all claims from a QE report
   */
  verifyReport(report: QEReport): Promise<ReportVerification>;

  /**
   * Get verification statistics
   */
  getStats(): VerificationStats;
}
```

#### CV-003: Code Trace Verification

**File:** `/workspaces/agentic-qe/v3/src/agents/claim-verifier/verification-methods.ts`

```typescript
/**
 * Verify a claim by tracing data flow through code
 * Used for claims like "SQL injection prevented" or "input validated"
 */
export async function verifyByCodeTrace(
  claim: Claim,
  codeIntelligence: CodeIntelligenceAPI
): Promise<VerificationResult> {
  // Step 1: Find ALL entry points (not just one)
  const entryPoints = await findAllEntryPoints(claim, codeIntelligence);

  if (entryPoints.length === 0) {
    return {
      claimId: claim.id,
      verified: false,
      confidence: 0.9,
      method: 'code-trace',
      reasoning: 'No entry points found for claimed implementation',
      allInstancesChecked: true,
    };
  }

  // Step 2: Trace each entry point to database/output
  const traceResults = await Promise.all(
    entryPoints.map(ep => traceDataFlow(ep, codeIntelligence))
  );

  // Step 3: Check if ALL paths have the claimed protection
  const allProtected = traceResults.every(tr => tr.hasProtection);
  const unprotectedPaths = traceResults.filter(tr => !tr.hasProtection);

  return {
    claimId: claim.id,
    verified: allProtected,
    confidence: allProtected ? 0.95 : 0.90,
    method: 'code-trace',
    counterEvidence: unprotectedPaths.map(up => ({
      type: 'file-reference',
      location: up.path,
      content: `Missing protection in ${up.path} at line ${up.line}`,
    })),
    reasoning: allProtected
      ? `All ${entryPoints.length} entry points have claimed protection`
      : `${unprotectedPaths.length}/${entryPoints.length} entry points missing protection`,
    allInstancesChecked: true,
  };
}

/**
 * Find ALL entry points for a security claim
 * e.g., for "timing attack prevention", find ALL auth handlers
 */
async function findAllEntryPoints(
  claim: Claim,
  codeIntelligence: CodeIntelligenceAPI
): Promise<EntryPoint[]> {
  // Use knowledge graph to find all relevant files
  const query = buildEntryPointQuery(claim);
  const result = await codeIntelligence.search({
    query,
    type: 'semantic',
    limit: 100, // Get ALL, not just first few
  });

  return result.value.results.map(r => ({
    file: r.file,
    line: r.line,
    type: classifyEntryPoint(r),
  }));
}
```

### Success Criteria
- [ ] ClaimVerifier agent defined and implemented
- [ ] Code trace verification finds ALL instances (not just one)
- [ ] Execution verification runs actual tools (not estimates)
- [ ] Cross-file verification checks complete codebase
- [ ] Integrated with security report generation

### Milestone: CV-COMPLETE
**Deliverables:**
1. ClaimVerifier agent implementation
2. Verification methods (code-trace, execution, cross-file)
3. Claim verification workflow
4. Report verification integration
5. Test suite

---

## Phase 5: Real Metric Measurement (P1)

### Goal
Use actual tooling instead of estimation for code metrics.

### Preconditions
- Phase 1 complete (file inventory available)
- System can execute commands

### Effects
- LOC counts match actual tooling (cloc, tokei)
- Test counts from actual test runners
- Unwrap/unsafe counts from actual parsing
- Metric accuracy improves from 60% to 95%+

### Tasks

| Task ID | Description | Effort | Agent | Dependencies | Parallel Group |
|---------|-------------|--------|-------|--------------|----------------|
| RM-001 | Design MetricCollector interface | 3h | qe-system-architect | - | A |
| RM-002 | Implement LOC counter using cloc/tokei | 4h | qe-coder | RM-001 | B |
| RM-003 | Implement test counter using test runners | 4h | qe-coder | RM-001 | B |
| RM-004 | Implement language-specific counters (unwrap, unsafe) | 6h | qe-coder | RM-001 | B |
| RM-005 | Create MetricValidation service | 4h | qe-coder | RM-002, RM-003, RM-004 | C |
| RM-006 | Integrate with code-intelligence domain | 4h | qe-coder | RM-005 | D |
| RM-007 | Add metric caching with TTL | 2h | qe-coder | RM-005 | C |
| RM-008 | Create metric comparison report | 3h | qe-coder | RM-005 | C |
| RM-009 | Write unit tests for metric collectors | 4h | qe-tester | RM-002, RM-003, RM-004 | D |
| RM-010 | Benchmark metric collection performance | 2h | qe-performance-tester | RM-005 | E |

### Implementation Details

#### RM-001: MetricCollector Interface

**File:** `/workspaces/agentic-qe/v3/src/domains/code-intelligence/services/metric-collector.ts`

```typescript
export interface MetricCollector {
  /**
   * Collect all metrics for a project
   */
  collectAll(projectPath: string): Promise<ProjectMetrics>;

  /**
   * Count lines of code using actual tooling
   */
  countLOC(projectPath: string): Promise<LOCMetrics>;

  /**
   * Count tests using actual test runners
   */
  countTests(projectPath: string): Promise<TestMetrics>;

  /**
   * Count language-specific patterns (unwrap, unsafe, etc.)
   */
  countPatterns(projectPath: string, language: string): Promise<PatternMetrics>;
}

export interface ProjectMetrics {
  loc: LOCMetrics;
  tests: TestMetrics;
  patterns: PatternMetrics;
  collectedAt: Date;
  toolsUsed: string[];
}

export interface LOCMetrics {
  total: number;
  byLanguage: Record<string, number>;
  source: 'cloc' | 'tokei' | 'fallback';
  excludedDirs: string[];
}

export interface TestMetrics {
  total: number;
  unit: number;
  integration: number;
  e2e: number;
  source: 'vitest' | 'jest' | 'cargo' | 'pytest' | 'fallback';
}
```

#### RM-002: LOC Counter Implementation

**File:** `/workspaces/agentic-qe/v3/src/domains/code-intelligence/services/metric-collector/loc-counter.ts`

```typescript
import { execSync } from 'child_process';

export async function countLOC(projectPath: string): Promise<LOCMetrics> {
  // Try cloc first (most accurate)
  try {
    const clocOutput = execSync(
      `cloc --json --exclude-dir=node_modules,dist,coverage,build "${projectPath}"`,
      { encoding: 'utf-8', timeout: 60000 }
    );
    return parseClocOutput(clocOutput);
  } catch {
    // cloc not available
  }

  // Try tokei (faster, Rust-based)
  try {
    const tokeiOutput = execSync(
      `tokei --output json "${projectPath}"`,
      { encoding: 'utf-8', timeout: 60000 }
    );
    return parseTokeiOutput(tokeiOutput);
  } catch {
    // tokei not available
  }

  // Fallback to manual counting (last resort)
  return manualLOCCount(projectPath);
}

function parseClocOutput(output: string): LOCMetrics {
  const data = JSON.parse(output);
  const byLanguage: Record<string, number> = {};
  let total = 0;

  for (const [lang, stats] of Object.entries(data)) {
    if (lang !== 'header' && lang !== 'SUM') {
      const code = (stats as { code: number }).code;
      byLanguage[lang] = code;
      total += code;
    }
  }

  return {
    total,
    byLanguage,
    source: 'cloc',
    excludedDirs: ['node_modules', 'dist', 'coverage', 'build'],
  };
}
```

#### RM-003: Test Counter Implementation

**File:** `/workspaces/agentic-qe/v3/src/domains/code-intelligence/services/metric-collector/test-counter.ts`

```typescript
import { execSync } from 'child_process';

export async function countTests(projectPath: string): Promise<TestMetrics> {
  // Detect test runner from package.json or config files
  const runner = detectTestRunner(projectPath);

  switch (runner) {
    case 'vitest':
      return countVitestTests(projectPath);
    case 'jest':
      return countJestTests(projectPath);
    case 'cargo':
      return countCargoTests(projectPath);
    case 'pytest':
      return countPytestTests(projectPath);
    default:
      return countTestsByFilePattern(projectPath);
  }
}

function countCargoTests(projectPath: string): TestMetrics {
  // Use `cargo test --list` for ACTUAL test count
  const output = execSync(
    'cargo test --list 2>/dev/null',
    { cwd: projectPath, encoding: 'utf-8', timeout: 60000 }
  );

  // Count lines ending with ": test"
  const testLines = output.split('\n').filter(line => line.endsWith(': test'));

  return {
    total: testLines.length,
    unit: testLines.filter(t => !t.includes('integration')).length,
    integration: testLines.filter(t => t.includes('integration')).length,
    e2e: 0,
    source: 'cargo',
  };
}

function countVitestTests(projectPath: string): TestMetrics {
  // Use vitest --list for actual test discovery
  const output = execSync(
    'npx vitest --reporter=json --run 2>/dev/null || echo "[]"',
    { cwd: projectPath, encoding: 'utf-8', timeout: 120000 }
  );

  // Parse vitest JSON output
  try {
    const results = JSON.parse(output);
    return {
      total: results.numTotalTests || 0,
      unit: results.numPassedTests || 0,
      integration: 0,
      e2e: 0,
      source: 'vitest',
    };
  } catch {
    return countTestsByFilePattern(projectPath);
  }
}
```

### Success Criteria
- [ ] LOC counts within 5% of actual tooling output
- [ ] Test counts match actual test runner output
- [ ] Language-specific patterns counted accurately
- [ ] Metrics cached with appropriate TTL
- [ ] Metric source clearly indicated in reports

### Milestone: RM-COMPLETE
**Deliverables:**
1. MetricCollector implementation
2. LOC counter (cloc/tokei integration)
3. Test counter (multi-runner support)
4. Pattern counter (language-specific)
5. Metric validation service
6. Test suite

---

## Execution Plan

### Timeline Overview

```
Week 1:     Phase 1 (CI-001 to CI-005) - Code Intelligence Auto-Scan
Week 2:     Phase 1 (CI-006 to CI-009) + Phase 2 Start (MM-001, MM-002)
Week 3:     Phase 2 (MM-003 to MM-009) - Multi-Model Verification
Week 4:     Phase 2 (MM-010 to MM-012) + Phase 3 Start (TD-001 to TD-003)
Week 5:     Phase 3 (TD-004 to TD-011) - Tiny-Dancer Routing
Week 6:     Phase 4 (CV-001 to CV-006) - Claim Verification Agent
Week 7:     Phase 4 (CV-007 to CV-011) + Phase 5 Start (RM-001 to RM-004)
Week 8:     Phase 5 (RM-005 to RM-010) - Real Metrics + Integration Testing
```

### Parallel Execution Groups

Tasks within the same parallel group can be executed concurrently:

| Group | Tasks | Description |
|-------|-------|-------------|
| A | CI-001, CI-002, MM-001, MM-002, TD-001, TD-003, CV-001, CV-002, RM-001 | Foundation/Interface design |
| B | CI-003, CI-004, MM-003, MM-004, MM-005, TD-002, TD-005, TD-007, CV-003, CV-004, CV-005, CV-008, RM-002, RM-003, RM-004 | Core implementations |
| C | CI-005, CI-006, CI-007, MM-006, MM-008, MM-009, TD-006, CV-006, CV-009, RM-005, RM-007, RM-008 | Integration work |
| D | CI-008, MM-007, MM-010, TD-004, TD-008, TD-009, CV-007, CV-010, RM-006, RM-009 | Testing & Integration |
| E | CI-009, MM-011, MM-012, TD-010, TD-011, CV-011, RM-010 | Documentation & Benchmarks |

### Agent Assignments

| Agent Type | Primary Tasks | Skills Required |
|------------|---------------|-----------------|
| qe-system-architect | MM-001, TD-003, CV-001, CV-002, RM-001 | System design, interfaces |
| qe-coder | CI-001 to CI-007, MM-002 to MM-009, TD-002 to TD-009, CV-003 to CV-009, RM-002 to RM-008 | TypeScript, API integration |
| qe-tester | CI-008, MM-010, MM-011, TD-010, CV-010, CV-011, RM-009 | Unit testing, integration testing |
| qe-performance-tester | MM-012, TD-011, RM-010 | Benchmarking, performance analysis |
| qe-doc-writer | CI-009 | Technical documentation |

---

## Risk Assessment

### High Risk
1. **Multi-model API costs**: Running 3 models increases costs 3x
   - Mitigation: Use multi-model only for CRITICAL/HIGH findings

2. **Tiny-dancer availability**: Package may not be published
   - Mitigation: Implement fallback routing logic

### Medium Risk
1. **Test runner compatibility**: Different projects use different test frameworks
   - Mitigation: Implement fallback pattern-based counting

2. **cloc/tokei availability**: Tools may not be installed
   - Mitigation: Include fallback manual counting

### Low Risk
1. **Backward compatibility**: Changes to init flow
   - Mitigation: Add `--skip-code-scan` flag

---

## Success Metrics

### Phase 1 Success
- Auto-scan detects 100% of new projects
- Existing projects prompted when KG empty
- Indexing completes in <5 minutes for typical projects

### Phase 2 Success
- Security false positive rate <10%
- CRITICAL vulnerability detection >80%
- Multi-model overhead <30s per finding

### Phase 3 Success
- 75% cost reduction on simple tasks
- Routing latency <50ms
- Circuit breaker prevents 100% of cascading failures

### Phase 4 Success
- 100% of security claims verified before publishing
- False claims detected before report generation
- ALL instances checked (not just one)

### Phase 5 Success
- LOC accuracy >95% (vs actual tooling)
- Test count accuracy >95% (vs test runner)
- Pattern counts within 10% of actual

### Overall Success
- **Overall accuracy**: 65% -> 85%+ (+20%)
- **Security accuracy**: 27% -> 75%+ (+48%)
- **Metric accuracy**: 60% -> 95%+ (+35%)
- **False positive rate**: 30% -> <10% (-20%)

---

## Appendix A: File Locations

| Component | Location |
|-----------|----------|
| Init Wizard | `/workspaces/agentic-qe/v3/src/init/init-wizard.ts` |
| Fleet Wizard | `/workspaces/agentic-qe/v3/src/cli/wizards/fleet-wizard.ts` |
| Code Intelligence | `/workspaces/agentic-qe/v3/src/domains/code-intelligence/` |
| Knowledge Graph | `/workspaces/agentic-qe/v3/src/domains/code-intelligence/services/knowledge-graph.ts` |
| Queen Coordinator | `/workspaces/agentic-qe/v3/src/coordination/queen-coordinator.ts` |
| CLI Entry | `/workspaces/agentic-qe/v3/src/cli/index.ts` |
| Security Domain | `/workspaces/agentic-qe/v3/src/domains/security-compliance/` |

## Appendix B: Namespace Reference

| Namespace | Purpose | Expected Entries |
|-----------|---------|------------------|
| `code-intelligence:kg` | Knowledge graph nodes/edges | 20,000-50,000 for typical project |
| `code-intelligence:metadata:index` | Index metadata | 1 |
| `code-intelligence:edge:*` | Edge relationships | Varies |
| `code-intelligence:node:*` | Node entities | Varies |

---

*Plan generated by QE GOAP Planning Agent*
*Based on ForgeCMS Alpha accuracy assessment by Lyle (2026-01-17)*
