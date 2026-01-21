# AQE Fleet v3 Improvement Analysis

**Analysis Date:** 2026-01-18
**Based On:** ForgeCMS Alpha QE Analysis vs Lyle's Accuracy Assessment
**Author:** QE Improvement Analysis Agent

---

## Executive Summary

The AQE Fleet v3 achieved **65% overall accuracy** on the ForgeCMS Alpha project, with significant weaknesses in security analysis (**27% accuracy**) and metric verification. This document analyzes root causes and proposes improvements including code intelligence pre-scanning, multi-model verification, and tiny-dancer neural routing integration.

---

## 1. Root Cause Analysis

### 1.1 What QE Agents Did Well

| Capability | Accuracy | Evidence |
|------------|----------|----------|
| **Project structure mapping** | ~90% | Correctly identified architecture, DDD patterns, repository pattern |
| **Technology stack identification** | 100% | Rust + Axum + SeaORM, React 19 + TypeScript 5.3 |
| **Testing gap identification** | ~85% | Correctly identified empty unit test directory, missing frontend tests |
| **Performance bottleneck patterns** | ~70% | Identified Argon2 blocking, WASM search O(n) |
| **Accessibility framework** | Unknown | WCAG findings not independently verified |
| **Documentation coverage** | ~95% | ADR count (28 vs 27 actual) |

### 1.2 What QE Agents Did Poorly

| Capability | Accuracy | Root Cause |
|------------|----------|------------|
| **Security vulnerability detection** | 27% | Pattern matching without data flow analysis |
| **Code metrics (LOC, test counts)** | 60-65% | Estimation instead of actual measurement |
| **Security implementation verification** | 30% | Claims without verification (timing attack) |
| **Unwrap count** | 19% | Likely counted dependencies/generated code |
| **Cross-component security** | <20% | Missed multi-tenant data leak, RLS injection |

### 1.3 Critical Failures Identified

#### A. Security Analysis Failures (21 vulnerabilities missed)

| Severity | Missed | Example | Why Missed |
|----------|--------|---------|------------|
| **CRITICAL (4)** | All 4 | SQL injection in products listing | Pattern matched parameterized queries but missed QueryBuilder string concatenation |
| **HIGH (9)** | 6 of 9 | Canvas multi-tenant data leak | Analyzed auth pattern but didn't trace data access paths |

**Root Cause:** The security scanner used **pattern matching** (found parameterized queries = "SQL injection prevented") rather than **data flow analysis** (trace how user input reaches database).

#### B. False Positive: Timing Attack Prevention

**QE Report Claimed:**
> "Timing attack prevention implemented correctly"

**Reality:**
- Platform auth had NO timing attack prevention
- Client auth had partial implementation
- The claim was based on finding `DUMMY_HASH` in ONE file, not all auth flows

**Root Cause:** Single-file analysis without cross-verification across all similar components.

#### C. Metric Inflation

| Metric | Claimed | Actual | Error |
|--------|---------|--------|-------|
| Rust LOC | ~9,982 | 6,423 | +36% |
| Backend tests | 80+ | 47 | +70% |
| Unwrap calls | 127+ | 24 | +429% |

**Root Cause:** Metrics were **estimated from patterns** rather than **actually measured** using tooling.

---

## 2. Proposed Improvements

### 2.1 Code Intelligence Pre-Scan (HIGH PRIORITY)

**Recommendation: YES - Run code intelligence agents BEFORE QE fleet**

#### Implementation Approach

```
Phase 1: Code Intelligence (5-10 minutes)
├── File inventory with exact counts
├── LOC measurement per language
├── Dependency graph construction
├── Function/class extraction
├── Test file identification and count
└── Store results in memory namespace: "codebase-metrics"

Phase 2: QE Fleet (uses pre-computed metrics)
├── Security agents receive accurate file inventory
├── Coverage agents receive actual test counts
├── Performance agents receive dependency graph
└── All agents access verified metrics
```

#### Benefits

1. **Accurate metrics** - No more estimation-based inflation
2. **Dependency-aware security** - Trace data flow across components
3. **Complete coverage** - Ensure all relevant files are analyzed
4. **Faster analysis** - Pre-computed indexes speed up pattern matching

#### Suggested Pre-Scan Agents

| Agent | Purpose | Output |
|-------|---------|--------|
| `qe-code-intelligence` | Build knowledge graph, 80% token reduction | File inventory, dependency graph |
| `code-analyzer` | Deep code analysis, complexity metrics | Verified LOC, cyclomatic complexity |
| `qe-dependency-mapper` | Coupling metrics, circular detection | Cross-component data flows |
| `qe-kg-builder` | Knowledge graph with entity extraction | HNSW-indexed semantic search |

---

### 2.2 Multi-Model Verification (HIGH PRIORITY)

**Recommendation: YES - Enable multi-model verification for security findings**

#### Why Multi-Model Helps

1. **Different models catch different vulnerabilities**
   - Claude excels at reasoning about complex data flows
   - GPT models often catch pattern-based vulnerabilities
   - Specialized security models (if available) provide domain expertise

2. **Consensus reduces false positives/negatives**
   - If 2/3 models agree on a vulnerability, confidence is high
   - If models disagree, flag for human review

3. **Cross-verification catches assumptions**
   - Model A claims "timing attack prevented"
   - Model B asked to verify: "Is timing attack prevention implemented in ALL auth flows?"
   - Model B finds the gap in platform auth

#### Implementation Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   QE Fleet Coordinator                    │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Model A    │  │   Model B    │  │   Model C    │   │
│  │ (e.g. Claude │  │ (e.g. GPT-5) │  │ (e.g. Gemini)│   │
│  │   Sonnet)    │  │              │  │              │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│         │                │                  │            │
│         └────────────────┴──────────────────┘            │
│                          │                               │
│                  ┌───────┴───────┐                       │
│                  │   Consensus   │                       │
│                  │    Engine     │                       │
│                  └───────────────┘                       │
│                          │                               │
│         ┌────────────────┼────────────────┐             │
│         │                │                │              │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐     │
│  │  Verified   │  │  Disputed   │  │   Missed    │     │
│  │  (2/3+)     │  │  (1/3)      │  │  (new find) │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│         │                │                │              │
│         │         Human Review           │              │
│         └────────────────┬───────────────┘              │
│                          │                               │
│                  ┌───────┴───────┐                       │
│                  │ Final Report  │                       │
│                  └───────────────┘                       │
└──────────────────────────────────────────────────────────┘
```

#### Configuration Option

```typescript
interface QEFleetConfig {
  multiModel: {
    enabled: boolean;
    models: ['claude-sonnet', 'gpt-4.5', 'gemini-pro'];
    consensusThreshold: 2;  // 2/3 must agree
    criticalVerification: true;  // All CRITICAL findings get multi-model review
    securityVerification: true;  // All security findings get multi-model review
  };
}
```

---

### 2.3 Tiny-Dancer Neural Routing Integration (MEDIUM-HIGH PRIORITY)

**Recommendation: YES - Integrate tiny-dancer for intelligent routing**

#### How Tiny-Dancer Improves QE Accuracy

1. **Performance-aware routing**: Direct complex security analysis to more capable models
2. **Confidence scoring**: Flag low-confidence findings for deeper analysis
3. **Uncertainty awareness**: Trigger multi-model verification when confidence < threshold
4. **Cost optimization**: Use simpler models for straightforward metrics (LOC counting)

#### Integration Points

```
┌─────────────────────────────────────────────────────────┐
│                    QE Task Submitted                      │
├───────────────────────────────────────────────────────────┤
│                          │                                │
│                  ┌───────┴───────┐                        │
│                  │  Tiny-Dancer  │                        │
│                  │ Neural Router │                        │
│                  └───────────────┘                        │
│                          │                                │
│    ┌─────────────────────┼─────────────────────┐         │
│    │                     │                     │          │
│  Simple Task         Complex Task      Critical Security  │
│  (metrics)           (perf analysis)   (vuln detection)   │
│    │                     │                     │          │
│  Haiku              Sonnet              Opus + Multi-Model │
│  (fast/cheap)       (balanced)         (thorough)         │
│    │                     │                     │          │
│ Confidence: 0.95    Confidence: 0.85    Confidence: 0.70  │
│    │                     │                     │          │
│ Accept              Accept              Verify with        │
│                                         second model       │
└──────────────────────────────────────────────────────────┘
```

#### Specific Use Cases

| Task Type | Tiny-Dancer Action | Model Selection |
|-----------|-------------------|-----------------|
| Count files/LOC | Route to simple model | Haiku (fast, cheap) |
| Pattern matching (imports) | Route to simple model | Haiku |
| Dependency graph | Route to balanced model | Sonnet |
| Security analysis | Route to capable model + verify | Opus + multi-model |
| Complex data flow | Route to capable model | Opus |
| Cross-component analysis | Route + flag for review | Opus + human review |

#### Configuration

```typescript
import { TinyDancer } from '@ruvector/tiny-dancer';

const router = new TinyDancer({
  candidates: [
    { id: 'haiku', successRate: 0.95, avgLatency: 200 },
    { id: 'sonnet', successRate: 0.92, avgLatency: 1500 },
    { id: 'opus', successRate: 0.98, avgLatency: 5000 },
  ],
  confidenceThreshold: 0.80,  // Below this, escalate or multi-verify
  circuitBreaker: {
    failureThreshold: 3,
    recoveryTime: 30000,
  }
});

// Route QE tasks
const routeQETask = async (task: QETask) => {
  const { candidate, confidence, uncertainty } = await router.route(task.description);

  if (task.type === 'security' && confidence < 0.85) {
    // Trigger multi-model verification
    return { model: candidate, multiModel: true };
  }

  if (uncertainty > 0.20) {
    // Flag for human review
    return { model: candidate, humanReview: true };
  }

  return { model: candidate };
};
```

---

### 2.4 Additional Improvement Recommendations

#### A. Verification Agents (Add to Fleet)

**New Agent Type: `qe-claim-verifier`**

Purpose: Verify claims made by other QE agents before publishing.

```typescript
interface VerificationTask {
  claim: string;  // "SQL injection prevention implemented correctly"
  evidence: string[];  // ["forge_core/src/api/rls.rs uses parameterized queries"]
  verificationMethod: 'code_trace' | 'execution' | 'multi_model';
}
```

Actions:
1. For security claims: Trace data flow from input to database
2. For metric claims: Run actual tooling (cloc, cargo test --list)
3. For implementation claims: Find ALL instances, not just one

#### B. Real Execution for Metrics

**Problem:** QE claimed 80+ tests when actual count was 47.

**Solution:** Actually run `cargo test --list` and count:

```bash
# Instead of: "Estimated ~80 tests based on test file analysis"
# Do this: Run actual command
cargo test --list 2>/dev/null | grep -c "test$"
# Result: 47 tests
```

#### C. Cross-Component Security Analysis

**Problem:** Missed multi-tenant data leak because each component was analyzed in isolation.

**Solution:** Add cross-component data flow analysis:

1. Identify all data entry points (API endpoints)
2. Trace data through middleware → handlers → database
3. Verify tenant isolation at EVERY step
4. Check for missing authentication/authorization at each boundary

#### D. Iterative Analysis with Refinement

**Problem:** Single-pass analysis misses interconnected issues.

**Solution:** Multi-pass analysis:

```
Pass 1: Structure & Metrics (verified)
  └── Pass 2: Security Patterns (with verified context)
        └── Pass 3: Security Verification (cross-check findings)
              └── Pass 4: Integration Analysis (cross-component)
                    └── Pass 5: Final Synthesis (with all context)
```

---

## 3. Implementation Priority

### Phase 1: Immediate (Before Next QE Run)

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| Add code intelligence pre-scan | 2-3 days | High | P0 |
| Real metric measurement (not estimation) | 1 day | High | P0 |
| Add claim verification agent | 2-3 days | High | P0 |

### Phase 2: Short-term (Next Sprint)

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| Multi-model verification for security | 1 week | Very High | P1 |
| Cross-component data flow analysis | 1 week | Very High | P1 |
| Tiny-dancer integration | 3-4 days | Medium-High | P1 |

### Phase 3: Medium-term (Q1)

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| Full tiny-dancer routing optimization | 2 weeks | Medium | P2 |
| Iterative multi-pass analysis | 2 weeks | High | P2 |
| Human-in-the-loop for CRITICAL findings | 1 week | High | P2 |

---

## 4. Expected Accuracy Improvements

### With Proposed Changes

| Capability | Current | Target | Improvement |
|------------|---------|--------|-------------|
| Overall Accuracy | 65% | 85%+ | +20% |
| Security Detection | 27% | 75%+ | +48% |
| Metric Accuracy | 60% | 95%+ | +35% |
| False Positive Rate | ~30% | <10% | -20% |
| CRITICAL Vuln Detection | 0/4 | 3/4+ | +75% |

### Key Success Metrics

1. **Security findings verified by second model**: 100% of CRITICAL/HIGH
2. **Metrics match actual tooling output**: >95%
3. **Claims verified before publishing**: 100% of security claims
4. **Cross-component vulnerabilities detected**: >70%

---

## 5. Answers to Specific Questions

### Q1: Should we use fixed code intelligence agents first?

**YES**, strongly recommended. Benefits:
- Accurate baseline metrics (no more inflation)
- Dependency graph for data flow analysis
- Pre-computed context for faster QE analysis
- HNSW-indexed semantic search for pattern matching

### Q2: Should we add multi-model support?

**YES**, especially for security analysis. Benefits:
- Cross-verification catches assumptions
- Consensus reduces false positives/negatives
- Different models catch different vulnerability types
- Would have caught the "timing attack" false claim

### Q3: Should we integrate tiny-dancer?

**YES**, but as Phase 2. Benefits:
- Confidence-aware routing triggers verification when uncertain
- Cost optimization (simple tasks to simple models)
- Circuit breaker prevents cascading failures
- Performance tracking improves over time

---

## 6. Proposed QE Fleet v3.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      QE Fleet v3.1 Architecture                       │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Phase 0: Code Intelligence Pre-Scan                                  │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ qe-code-intelligence → qe-dependency-mapper → qe-kg-builder    │ │
│  │                            ↓                                    │ │
│  │              Memory: "codebase-metrics" namespace               │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                ↓                                      │
│  Phase 1: Tiny-Dancer Task Routing                                    │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  Task → Tiny-Dancer → Model Selection + Confidence Score        │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                ↓                                      │
│  Phase 2: Specialized QE Analysis (Parallel)                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ Security │ │ Quality  │ │  Perf    │ │  QX/A11Y │ │  Test    │  │
│  │ Scanner  │ │ Analyzer │ │ Tester   │ │ Auditor  │ │ Architect│  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│       │            │            │            │            │          │
│       └────────────┴────────────┴────────────┴────────────┘          │
│                                ↓                                      │
│  Phase 3: Multi-Model Verification (For Security/Critical)            │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  Finding → Model A Review → Model B Review → Consensus          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                ↓                                      │
│  Phase 4: Claim Verification                                          │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  qe-claim-verifier: Verify all security claims before publish   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                ↓                                      │
│  Phase 5: Report Synthesis                                            │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  Queen Coordinator: Synthesize verified findings into reports   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 7. Conclusion

The AQE Fleet v3 has strong foundations but needs improvements in:

1. **Verification over assumption** - Don't claim "implemented correctly" without tracing
2. **Measurement over estimation** - Run actual tooling for metrics
3. **Cross-component analysis** - Security issues often span multiple files
4. **Multi-model consensus** - Critical findings need cross-verification

With the proposed improvements, we expect accuracy to increase from **65% to 85%+**, with security detection improving from **27% to 75%+**.

---

**Next Steps:**
1. Implement code intelligence pre-scan
2. Add claim verification agent
3. Enable multi-model verification for security
4. Integrate tiny-dancer for intelligent routing

---

*Analysis generated by QE Improvement Analysis*
*Based on ForgeCMS Alpha assessment by Lyle (2026-01-17)*
