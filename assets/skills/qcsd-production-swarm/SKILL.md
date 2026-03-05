---
name: qcsd-production-swarm
description: "QCSD Production Telemetry phase swarm for post-release production health assessment using DORA metrics, root cause analysis, defect prediction, and cross-phase feedback loops. Consumes CI/CD outputs (RELEASE/REMEDIATE/BLOCK decisions, release readiness metrics) and produces feedback signals to Ideation and Refinement."
category: qcsd-phases
priority: critical
version: 1.0.0
tokenEstimate: 32000
# DDD Domain Mapping (from QCSD-AGENTIC-QE-MAPPING-FRAMEWORK.md)
domains:
  primary:
    - domain: learning-optimization
      agents: [qe-metrics-optimizer]
    - domain: defect-intelligence
      agents: [qe-defect-predictor, qe-root-cause-analyzer]
  conditional:
    - domain: chaos-resilience
      agents: [qe-chaos-engineer, qe-performance-tester]
    - domain: defect-intelligence
      agents: [qe-regression-analyzer, qe-pattern-learner]
    - domain: enterprise-integration
      agents: [qe-middleware-validator, qe-sap-rfc-tester, qe-sod-analyzer]
  feedback:
    - domain: learning-optimization
      agents: [qe-learning-coordinator, qe-transfer-specialist]
# Agent Inventory
agents:
  core: [qe-metrics-optimizer, qe-defect-predictor, qe-root-cause-analyzer]
  conditional: [qe-chaos-engineer, qe-performance-tester, qe-regression-analyzer, qe-pattern-learner, qe-middleware-validator, qe-sap-rfc-tester, qe-sod-analyzer]
  feedback: [qe-learning-coordinator, qe-transfer-specialist]
  total: 12
  sub_agents: 0
skills: [shift-right-testing, chaos-engineering-resilience, quality-metrics, performance-testing, holistic-testing-pact]
# Execution Models (Task Tool is PRIMARY)
execution:
  primary: task-tool
  alternatives: [mcp-tools, cli]
swarm_pattern: true
parallel_batches: 3
last_updated: 2026-02-17
enforcement_level: strict
tags: [qcsd, production, telemetry, dora, rca, defect-prediction, feedback-loop, learning, swarm, parallel, ddd]
trust_tier: 3
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
  eval_path: evals/qcsd-production-swarm.yaml

---

# QCSD Production Swarm v1.0

Post-release production health assessment and QCSD feedback loop closure.

---

## Overview

The Production Swarm takes releases that passed CI/CD verification and assesses their
health in the live production environment. Where the CI/CD Swarm asks "Is this change
safe to release?", the Production Swarm asks "Is the release healthy in production?"

This swarm operates at the production telemetry level, analyzing DORA metrics, incident
reports, defect patterns, SLA compliance, and root cause data to render a
HEALTHY / DEGRADED / CRITICAL decision. It is the only QCSD phase with dual
responsibility: assessing current production health AND closing the feedback loop
back to Ideation and Refinement phases.

### QCSD Phase Positioning

| Phase | Swarm | Question | Decision | When |
|-------|-------|----------|----------|------|
| Ideation | qcsd-ideation-swarm | Should we build this? | GO / CONDITIONAL / NO-GO | PI/Sprint Planning |
| Refinement | qcsd-refinement-swarm | How should we test this? | READY / CONDITIONAL / NOT-READY | Sprint Refinement |
| Development | qcsd-development-swarm | Is the code quality sufficient? | SHIP / CONDITIONAL / HOLD | During Sprint |
| Verification | qcsd-cicd-swarm | Is this change safe to release? | RELEASE / REMEDIATE / BLOCK | Pre-Release / CI-CD |
| **Production** | **qcsd-production-swarm** | **Is the release healthy in production?** | **HEALTHY / DEGRADED / CRITICAL** | **Post-Release** |

### Key Differentiators from CI/CD Swarm

| Dimension | CI/CD Swarm | Production Swarm |
|-----------|-------------|-----------------|
| Framework | Quality Gates + Regression + Stability | DORA Metrics + RCA + Defect Intelligence |
| Agents | 10 (3 core + 6 conditional + 1 analysis) | 12 (3 core + 7 conditional + 2 feedback) |
| Core Output | Release readiness assessment | Production health assessment + feedback loops |
| Decision | RELEASE / REMEDIATE / BLOCK | HEALTHY / DEGRADED / CRITICAL |
| Flags | HAS_SECURITY_PIPELINE, HAS_PERFORMANCE_PIPELINE, HAS_INFRA_CHANGE, HAS_MIDDLEWARE, HAS_SAP_INTEGRATION, HAS_AUTHORIZATION | HAS_INFRASTRUCTURE_CHANGE, HAS_PERFORMANCE_SLA, HAS_REGRESSION_RISK, HAS_RECURRING_INCIDENTS, HAS_MIDDLEWARE, HAS_SAP_INTEGRATION, HAS_AUTHORIZATION |
| Phase | Pre-Release / CI-CD Pipeline | Post-Release / Production Telemetry |
| Input | Pipeline artifacts + test results + build output | Production telemetry + incident reports + DORA data |
| Final Step | Deployment readiness advisory | Learning synthesis + knowledge transfer |
| Unique Role | Last gate before production | Only phase with dual responsibility: analyze + feedback |

**Architectural Note:** Production is the only swarm with 12 agents (not 10) and 2 always-run feedback agents (not 1 always-run analysis agent). This is explicit: Production has dual responsibility -- assessing current health AND closing the QCSD feedback loop.

**Design Decision: SAP Agent Reuse** -- Production reuses qe-sap-rfc-tester (also used in Ideation) because RFC/BAPI health checking is the most relevant SAP validation for live production systems. There are 4 SAP agents total (qe-sap-rfc-tester, qe-odata-contract-tester, qe-sap-idoc-tester, qe-soap-tester) distributed across 5 QCSD phases, necessitating one reuse.

---

### Parameters

- `TELEMETRY_DATA`: Path to production telemetry, incident reports, and DORA metrics (required, e.g., `production/telemetry/`)
- `RELEASE_ID`: Release identifier for tracking (optional, e.g., `v3.6.9`)
- `OUTPUT_FOLDER`: Where to save reports (default: `${PROJECT_ROOT}/Agentic QCSD/production/`)
- `SLA_DEFINITIONS`: Path to SLA/SLO target definitions (optional)

---

## ENFORCEMENT RULES - READ FIRST

**These rules are NON-NEGOTIABLE. Violation means skill execution failure.**

| Rule | Enforcement |
|------|-------------|
| **E1** | You MUST spawn ALL THREE core agents (qe-metrics-optimizer, qe-defect-predictor, qe-root-cause-analyzer) in Phase 2. No exceptions. |
| **E2** | You MUST put all parallel Task calls in a SINGLE message. |
| **E3** | You MUST STOP and WAIT after each batch. No proceeding early. |
| **E4** | You MUST spawn conditional agents if flags are TRUE. No skipping. |
| **E5** | You MUST apply HEALTHY/DEGRADED/CRITICAL logic exactly as specified in Phase 5. |
| **E6** | You MUST generate the full report structure. No abbreviated versions. |
| **E7** | Each agent MUST read its reference files before analysis. |
| **E8** | You MUST run BOTH qe-learning-coordinator AND qe-transfer-specialist in Phase 8 SEQUENTIALLY (coordinator first, then specialist). Always. Both agents. Never in parallel. |
| **E9** | You MUST execute Phase 7 learning persistence. Store production findings to memory BEFORE Phase 8. No skipping. |

**PROHIBITED BEHAVIORS:**
- Summarizing instead of spawning agents
- Skipping agents "for brevity"
- Proceeding before background tasks complete
- Providing your own analysis instead of spawning specialists
- Omitting report sections
- Using placeholder text like "[details here]"
- Skipping the feedback loop synthesis
- Skipping learning persistence (Phase 7) or treating it as optional
- Generating production analysis yourself instead of using specialist agents

---

## PHASE 1: Analyze Production Context (Flag Detection)

**MANDATORY: You must complete this analysis before Phase 2.**

### Step 0: Retrieve CI/CD Phase Signals (Cross-Phase Consumption)

Before analyzing production context, retrieve the most recent CI/CD phase signals from memory.
These provide the release readiness baseline that the Production Swarm builds upon.

**MCP Method (preferred):**

```javascript
mcp__agentic-qe__memory_query({
  pattern: "qcsd-cicd-*",
  namespace: "qcsd-cicd",
  limit: 1
})
```

**CLI Fallback:**

```bash
npx @claude-flow/cli@latest memory search --query "qcsd-cicd" --namespace qcsd-cicd --limit 1
```

**Extract and record CI/CD baseline (if available):**

```
+-------------------------------------------------------------+
|                CI/CD PHASE BASELINE                          |
+-------------------------------------------------------------+
|                                                              |
|  Retrieved:     [YES / NO - memory query failed]             |
|                                                              |
|  Release Decision:       [RELEASE / REMEDIATE / BLOCK / N/A] |
|  Deployment Risk Score:  [value / N/A]                       |
|  Quality Gate Status:    [PASSED / FAILED / N/A]             |
|  Known Issues:           [list / NONE]                       |
|  Monitoring Recommendations: [list / NONE]                   |
|                                                              |
|  If NO CI/CD baseline: Proceed without baseline.             |
|  Note "NO CI/CD BASELINE AVAILABLE" in report.               |
|                                                              |
+-------------------------------------------------------------+
```

**DO NOT skip this step.** If memory retrieval fails, proceed without baseline but document the gap.

---

### Step 0.5: Auto-Detect Pre-Collected Telemetry

Before requiring manual telemetry input, check if the GitHub Actions telemetry collection
workflow has pre-collected DORA metrics. This runs automatically after every npm publish
and weekly on schedule.

**Check for pre-collected telemetry:**

```bash
TELEMETRY_FILE="docs/telemetry/production/latest.json"
```

**If the file exists and is recent (< 7 days old):**
- Use it as the primary TELEMETRY_DATA source
- The DORA metrics (deployment frequency, lead time, change failure rate, MTTR) are already
  computed from GitHub API — the qe-metrics-optimizer agent should validate and enrich these,
  not recompute from scratch
- Record: `TELEMETRY SOURCE: GHA pre-collected (${collectionTimestamp from JSON})`
- Extract the `releaseId` from the JSON if RELEASE_ID was not provided as a parameter

**If the file does not exist or is stale (> 7 days old):**
- Proceed with the manually provided TELEMETRY_DATA parameter as currently specified
- Record: `TELEMETRY SOURCE: Manual input`

**This step is non-blocking.** If pre-collected telemetry is unavailable, the swarm
operates exactly as before. Pre-collected telemetry simply accelerates Phase 2 by
giving qe-metrics-optimizer a validated starting point.

---

### Step 1: Scan Production Context and Detect Flags

Scan the production telemetry, incident reports, DORA data, and release context to SET these flags. Do not skip any flag.

### Flag Detection (Check ALL SEVEN)

```
HAS_INFRASTRUCTURE_CHANGE = FALSE
  Set TRUE if input mentions RECENT infrastructure changes since last release:
  Kubernetes config changes, container image updates, cloud resource modifications,
  deployment topology changes, scaling policy updates, network rule changes,
  load balancer updates, DNS changes, certificate rotations, CDN changes.
  NOTE: General mentions of infrastructure existing do NOT trigger this flag.
  Only RECENT CHANGES to infrastructure trigger it.

HAS_PERFORMANCE_SLA = FALSE
  Set TRUE if input mentions ANY of: SLA, SLO, SLI, response time requirements,
  latency targets, error budgets, throughput thresholds, availability targets,
  uptime requirements, p95 latency, p99 latency, error rate targets

HAS_REGRESSION_RISK = FALSE
  Set TRUE if input mentions ANY of: user-reported issues, error rate increases,
  degraded functionality, rollback consideration, feature flag incidents,
  A/B test anomalies, customer complaints, support ticket spikes,
  monitoring alerts, degraded performance post-deploy

HAS_RECURRING_INCIDENTS = FALSE
  Set TRUE if input mentions ANY of: repeated incidents, known recurring issues,
  incident patterns, chronic alerts, previously-seen failure modes,
  flapping services, repeat offender modules, recurring pages,
  same-root-cause incidents, deja-vu failures

HAS_MIDDLEWARE = FALSE
  Set TRUE if input mentions ANY of: middleware, ESB, message broker, MQ,
  Kafka, RabbitMQ, integration bus, API gateway, message queue, pub/sub,
  event bus, service bus, ActiveMQ, NATS, Redis Streams

HAS_SAP_INTEGRATION = FALSE
  Set TRUE if input mentions ANY of: SAP, RFC, BAPI, IDoc, OData,
  S/4HANA, EWM, ECC, ABAP, CDS view, Fiori, SAP Cloud Integration,
  SAP PI/PO, SAP Gateway, SAP connector

HAS_AUTHORIZATION = FALSE
  Set TRUE if input mentions ANY of: SoD, segregation of duties,
  role conflict, authorization object, T-code, user role,
  access control matrix, GRC, RBAC policy, permission matrix,
  privilege escalation, role assignment
```

### Validation Checkpoint

Before proceeding to Phase 2, confirm:

```
+-- I have read the production telemetry and incident reports
+-- I have read the DORA metrics data
+-- I have reviewed the release context and CI/CD phase signals
+-- I have evaluated ALL SEVEN flags
+-- I have recorded which flags are TRUE
+-- I understand which conditional agents will be needed
```

**DO NOT proceed to Phase 2 until all checkboxes are confirmed.**

### MANDATORY: Output Flag Detection Results

You MUST output flag detection results before proceeding:

```
+-------------------------------------------------------------+
|                    FLAG DETECTION RESULTS                    |
+-------------------------------------------------------------+
|                                                             |
|  HAS_INFRASTRUCTURE_CHANGE: [TRUE/FALSE]                    |
|  Evidence:                  [what triggered it - specific]  |
|                                                             |
|  HAS_PERFORMANCE_SLA:       [TRUE/FALSE]                    |
|  Evidence:                  [what triggered it - specific]  |
|                                                             |
|  HAS_REGRESSION_RISK:       [TRUE/FALSE]                    |
|  Evidence:                  [what triggered it - specific]  |
|                                                             |
|  HAS_RECURRING_INCIDENTS:   [TRUE/FALSE]                    |
|  Evidence:                  [what triggered it - specific]  |
|                                                             |
|  HAS_MIDDLEWARE:             [TRUE/FALSE]                    |
|  Evidence:                  [what triggered it - specific]  |
|                                                             |
|  HAS_SAP_INTEGRATION:       [TRUE/FALSE]                    |
|  Evidence:                  [what triggered it - specific]  |
|                                                             |
|  HAS_AUTHORIZATION:          [TRUE/FALSE]                    |
|  Evidence:                  [what triggered it - specific]  |
|                                                             |
|  EXPECTED AGENTS:                                           |
|  - Core: 3 (always)                                         |
|  - Conditional: [count based on TRUE flags]                 |
|  - Feedback: 2 (always)                                     |
|  - TOTAL: [3 + conditional count + 2]                       |
|                                                             |
+-------------------------------------------------------------+
```

**DO NOT proceed to Phase 2 without outputting flag detection results.**

---

## PHASE 2: Spawn Core Agents (PARALLEL BATCH 1)

### CRITICAL ENFORCEMENT

```
+-------------------------------------------------------------+
|  YOU MUST INCLUDE ALL THREE TASK CALLS IN YOUR NEXT MESSAGE  |
|                                                              |
|  - Task 1: qe-metrics-optimizer                              |
|  - Task 2: qe-defect-predictor                               |
|  - Task 3: qe-root-cause-analyzer                            |
|                                                              |
|  If your message contains fewer than 3 Task calls, you have |
|  FAILED this phase. Start over.                              |
+-------------------------------------------------------------+
```

### Domain Context

| Agent | Domain | MCP Tool Mapping |
|-------|--------|------------------|
| qe-metrics-optimizer | learning-optimization | `quality_assess` |
| qe-defect-predictor | defect-intelligence | `defect_predict` |
| qe-root-cause-analyzer | defect-intelligence | `root_cause_analyze` |

### Agent 1: DORA Metrics Optimizer

**This agent MUST compute DORA metrics and SLA/SLO compliance from production telemetry.**

```
Task({
  description: "DORA metrics computation and SLA compliance assessment",
  prompt: `You are qe-metrics-optimizer. Your output quality is being audited.

## MANDATORY FIRST STEPS (DO NOT SKIP)

1. READ the production telemetry data provided below IN FULL.
2. READ the SLA/SLO definitions if available.
3. READ any previous CI/CD phase signals if available.

## PRODUCTION DATA TO ANALYZE

=== DORA METRICS DATA START ===
[PASTE THE COMPLETE DORA METRICS DATA HERE - DO NOT SUMMARIZE]
- Deployment frequency records
- Lead time for changes data
- Mean time to restore (MTTR) records
- Change failure rate data
=== DORA METRICS DATA END ===

=== SLA/SLO DEFINITIONS START ===
[PASTE SLA/SLO TARGET DEFINITIONS HERE - DO NOT SUMMARIZE]
=== SLA/SLO DEFINITIONS END ===

=== PRODUCTION TELEMETRY START ===
[PASTE PRODUCTION TELEMETRY DATA HERE - DO NOT SUMMARIZE]
- Uptime metrics
- Error rates
- Response time distributions
- Throughput data
=== PRODUCTION TELEMETRY END ===

=== CI/CD PHASE SIGNALS (if available) START ===
[PASTE any CI/CD phase RELEASE/REMEDIATE/BLOCK signals]
=== CI/CD PHASE SIGNALS END ===

## REQUIRED OUTPUT (ALL SECTIONS MANDATORY)

### 1. DORA Dashboard

Compute all four DORA metrics with trends:

| DORA Metric | Current Value | Previous Period | Trend | Classification |
|-------------|---------------|-----------------|-------|----------------|
| Deployment Frequency | X/day or X/week | X/day or X/week | Improving/Declining/Stable | Elite/High/Medium/Low |
| Lead Time for Changes | X hours/days | X hours/days | Improving/Declining/Stable | Elite/High/Medium/Low |
| Mean Time to Restore (MTTR) | X hours | X hours | Improving/Declining/Stable | Elite/High/Medium/Low |
| Change Failure Rate | X% | X% | Improving/Declining/Stable | Elite/High/Medium/Low |

**DORA Classification Thresholds:**
| Metric | Elite | High | Medium | Low |
|--------|-------|------|--------|-----|
| Deployment Frequency | On-demand (multiple/day) | Weekly-Monthly | Monthly-Biannual | Biannual+ |
| Lead Time | < 1 hour | 1 day - 1 week | 1 week - 1 month | 1-6 months |
| MTTR | < 1 hour | < 1 day | < 1 week | 1 week+ |
| Change Failure Rate | 0-5% | 5-10% | 10-15% | 15%+ |

**OVERALL DORA CLASSIFICATION: [Elite/High/Medium/Low]**

### 2. SLA Compliance Matrix

| SLA/SLO | Target | Actual | Compliance | Status | Burn Rate |
|---------|--------|--------|------------|--------|-----------|
| Availability | X% | X% | X% | PASS/WARN/FAIL | [error budget remaining] |
| Response Time (p50) | Xms | Xms | X% | PASS/WARN/FAIL | N/A |
| Response Time (p95) | Xms | Xms | X% | PASS/WARN/FAIL | N/A |
| Response Time (p99) | Xms | Xms | X% | PASS/WARN/FAIL | N/A |
| Error Rate | <= X% | X% | X% | PASS/WARN/FAIL | [error budget remaining] |
| Throughput | >= X req/s | X req/s | X% | PASS/WARN/FAIL | N/A |

**SLA COMPLIANCE: X% (count of passing SLAs / total SLAs)**

### 3. Quality Metrics Optimization

| Quality Metric | Current | Target | Gap | Trend | Action |
|---------------|---------|--------|-----|-------|--------|
| Defect Escape Rate | X% | <= X% | +/-X% | Improving/Declining | [action] |
| Test Effectiveness | X% | >= X% | +/-X% | Improving/Declining | [action] |
| Automation Coverage | X% | >= X% | +/-X% | Improving/Declining | [action] |
| Mean Time to Detect | X hours | <= X hours | +/-X hours | Improving/Declining | [action] |
| Customer-Reported vs Internal | X:Y ratio | <= X:Y | +/-X | Improving/Declining | [action] |

### 4. Composite DORA Score

Calculate normalized score (0-1):

| Metric | Raw Score | Weight | Weighted Score |
|--------|-----------|--------|----------------|
| Deployment Frequency | X/1.0 | 0.25 | X |
| Lead Time | X/1.0 | 0.25 | X |
| MTTR | X/1.0 | 0.25 | X |
| Change Failure Rate | X/1.0 | 0.25 | X |

**COMPOSITE DORA SCORE: X.XX (0-1 scale)**

Scoring guide:
- Elite: 0.85 - 1.0
- High: 0.7 - 0.84
- Medium: 0.4 - 0.69
- Low: 0.0 - 0.39

**MINIMUM: Compute all 4 DORA metrics with classifications and produce SLA compliance matrix.**

## OUTPUT FORMAT

Save your complete analysis in Markdown to:
${OUTPUT_FOLDER}/02-dora-metrics.md

Use the Write tool to save BEFORE completing.
Report MUST be complete - no placeholders.

## VALIDATION BEFORE SUBMITTING

+-- Did I read all production telemetry and DORA data?
+-- Did I compute all 4 DORA metrics with trends?
+-- Did I classify each metric (Elite/High/Medium/Low)?
+-- Did I evaluate SLA/SLO compliance for all targets?
+-- Did I calculate the composite DORA score (0-1)?
+-- Did I assess quality metrics optimization opportunities?
+-- Did I save the report to the correct output path?`,
  subagent_type: "qe-metrics-optimizer",
  run_in_background: true
})
```

### Agent 2: Defect Predictor

**This agent MUST analyze defect trends and predict future defect density from production telemetry patterns.**

```
Task({
  description: "ML-powered defect prediction and trend analysis from production data",
  prompt: `You are qe-defect-predictor. Your output quality is being audited.

## PRODUCTION DATA TO ANALYZE

=== DEFECT DATA START ===
[PASTE THE COMPLETE DEFECT/BUG REPORT DATA HERE - DO NOT SUMMARIZE]
- All defects discovered post-release
- Severity classifications
- Component/module mapping
- Discovery date and resolution status
=== DEFECT DATA END ===

=== PRODUCTION TELEMETRY START ===
[PASTE PRODUCTION ERROR LOGS, EXCEPTION DATA, MONITORING ALERTS]
=== PRODUCTION TELEMETRY END ===

=== HISTORICAL DEFECT DATA (if available) START ===
[PASTE historical defect data from previous releases]
=== HISTORICAL DEFECT DATA END ===

## REQUIRED OUTPUT (ALL SECTIONS MANDATORY)

### 1. Defect Trend Analysis

| Period | Defects Found | Severity Distribution | Density (per KLOC) | Trend |
|--------|--------------|----------------------|---------------------|-------|
| Current Release | X | P0:X P1:X P2:X P3:X P4:X | X.XX | - |
| Previous Release | X | P0:X P1:X P2:X P3:X P4:X | X.XX | - |
| 3-Release Average | X | P0:X P1:X P2:X P3:X P4:X | X.XX | - |
| 6-Release Average | X | P0:X P1:X P2:X P3:X P4:X | X.XX | - |

**DEFECT TREND DIRECTION: [declining / stable / increasing]**

### 2. Predicted Defect Density

| Prediction Horizon | Predicted Density | Confidence | Method |
|--------------------|-------------------|------------|--------|
| Next 7 days | X.XX per KLOC | High/Medium/Low | [regression/trend/pattern] |
| Next 30 days | X.XX per KLOC | High/Medium/Low | [regression/trend/pattern] |
| Next release cycle | X.XX per KLOC | High/Medium/Low | [regression/trend/pattern] |

**PREDICTED DEFECT DENSITY: X.XX per KLOC**

### 3. Hotspot Identification

| Component/Module | Defect Count | Density | Risk Rank | Contributing Factors |
|-----------------|-------------|---------|-----------|---------------------|
| [module 1] | X | X.XX | 1 (Highest) | [complexity, churn, coupling, etc.] |
| [module 2] | X | X.XX | 2 | [factors] |
| [module 3] | X | X.XX | 3 | [factors] |
| [module 4] | X | X.XX | 4 | [factors] |
| [module 5] | X | X.XX | 5 | [factors] |

### 4. Pattern Analysis

| Pattern | Occurrences | Modules Affected | Root Cause Category | Preventability |
|---------|-------------|-----------------|--------------------|--------------------|
| [pattern 1] | X | [modules] | [code/design/config/env] | High/Medium/Low |
| [pattern 2] | X | [modules] | [code/design/config/env] | High/Medium/Low |
| [pattern 3] | X | [modules] | [code/design/config/env] | High/Medium/Low |

### 5. Escape Analysis

For each defect found in production, identify which QCSD phase SHOULD have caught it:

| Defect ID | Severity | Escaped From | Why Escaped | Prevention Strategy |
|-----------|----------|-------------|-------------|---------------------|
| DEF-001 | P0/P1/P2/P3/P4 | Ideation/Refinement/Development/Verification | [why not caught] | [what to change] |
| DEF-002 | P0/P1/P2/P3/P4 | Ideation/Refinement/Development/Verification | [why not caught] | [what to change] |

**Escape Summary:**
| Escaped From Phase | Count | Percentage | Key Gap |
|-------------------|-------|------------|---------|
| Ideation | X | X% | [missing risk assessment] |
| Refinement | X | X% | [missing test strategy] |
| Development | X | X% | [missing test coverage] |
| Verification | X | X% | [missing pipeline check] |

**MINIMUM: Analyze defect trends, calculate density, identify at least 5 hotspots, and perform escape analysis for all defects.**

## OUTPUT FORMAT

Save your complete analysis in Markdown to:
${OUTPUT_FOLDER}/03-defect-prediction.md

Use the Write tool to save BEFORE completing.
Report MUST be complete - no placeholders.

## VALIDATION BEFORE SUBMITTING

+-- Did I analyze defect data across multiple release periods?
+-- Did I calculate trend direction (declining/stable/increasing)?
+-- Did I predict future defect density with confidence levels?
+-- Did I identify at least 5 defect hotspots?
+-- Did I perform escape analysis mapping defects to QCSD phases?
+-- Did I identify at least 3 defect patterns?
+-- Did I save the report to the correct output path?`,
  subagent_type: "qe-defect-predictor",
  run_in_background: true
})
```

### Agent 3: Root Cause Analyzer

**This agent MUST perform systematic RCA of all production incidents since release. Incident severity tracking is mandatory.**

```
Task({
  description: "Systematic root cause analysis of production incidents",
  prompt: `You are qe-root-cause-analyzer. Your output quality is being audited.

## PRODUCTION DATA TO ANALYZE

=== INCIDENT REPORTS START ===
[PASTE THE COMPLETE INCIDENT REPORTS HERE - DO NOT SUMMARIZE]
- All P0-P4 incidents since release
- Incident timelines
- Resolution actions
- Post-mortems if available
=== INCIDENT REPORTS END ===

=== PRODUCTION LOGS START ===
[PASTE RELEVANT PRODUCTION LOGS AND ERROR DATA]
=== PRODUCTION LOGS END ===

=== MONITORING ALERTS START ===
[PASTE MONITORING ALERTS AND ALERT HISTORY]
=== MONITORING ALERTS END ===

## REQUIRED OUTPUT (ALL SECTIONS MANDATORY)

### 1. Incident Inventory

Complete inventory of all incidents since release:

| Incident ID | Severity | Status | Summary | Duration | Impact | Detected By |
|-------------|----------|--------|---------|----------|--------|-------------|
| INC-001 | P0/P1/P2/P3/P4 | Open/Resolved/Mitigated | [summary] | X hours | [users/revenue/data] | [monitoring/user/support] |
| INC-002 | P0/P1/P2/P3/P4 | Open/Resolved/Mitigated | [summary] | X hours | [users/revenue/data] | [monitoring/user/support] |

**TOTAL INCIDENTS: X (P0: X, P1: X, P2: X, P3: X, P4: X)**
**MAXIMUM OPEN SEVERITY: [P0/P1/P2/P3/P4/NONE]**

### 2. Root Cause Analysis (per incident)

For EACH incident, provide structured RCA:

#### INC-XXX: [Title]

| RCA Dimension | Finding |
|---------------|---------|
| **What happened** | [factual description of the incident] |
| **Timeline** | [detection -> diagnosis -> mitigation -> resolution] |
| **Root cause** | [the underlying technical cause] |
| **Contributing factors** | [what made the incident possible or worse] |
| **Why not detected earlier** | [gap in monitoring, testing, or review] |
| **5-Why Analysis** | 1. Why? -> 2. Why? -> 3. Why? -> 4. Why? -> 5. Why? -> Root |
| **Category** | [code-defect/config-error/infra-failure/capacity/dependency/human-error] |

### 3. Resolution and Prevention Strategies

| Incident | Resolution Applied | Time to Resolve | Prevention Strategy | Owner | Status |
|----------|-------------------|----------------|--------------------|---------|----|
| INC-XXX | [what was done] | X hours | [what prevents recurrence] | [team] | Implemented/Planned/Backlogged |

### 4. Time to Detect and Resolve

| Incident | Time to Detect (TTD) | Time to Diagnose | Time to Mitigate | Time to Resolve (TTR) | Total Duration |
|----------|---------------------|-----------------|------------------|----------------------|----------------|
| INC-XXX | X min/hours | X min/hours | X min/hours | X min/hours | X min/hours |

**Average TTD: X hours**
**Average TTR: X hours**

### 5. Escape Phase Analysis

| Incident | Root Cause | Should Have Been Caught In | Why It Escaped | Gap Type |
|----------|-----------|---------------------------|----------------|----------|
| INC-XXX | [root cause] | Ideation/Refinement/Development/Verification | [reason] | Testing/Monitoring/Review/Design |

### 6. RCA Completeness

| Metric | Value |
|--------|-------|
| Total incidents requiring RCA | X |
| RCAs completed | X |
| RCA completeness | X% |
| Incidents with prevention plans | X |
| Prevention implementation rate | X% |

**RCA COMPLETENESS: X%** (completedRcas / totalIncidents * 100)

**MINIMUM: Inventory ALL incidents, perform 5-Why RCA for each P0/P1, and calculate RCA completeness percentage.**

## OUTPUT FORMAT

Save your complete analysis in Markdown to:
${OUTPUT_FOLDER}/04-root-cause-analysis.md

Use the Write tool to save BEFORE completing.
Report MUST be complete - no placeholders.

## VALIDATION BEFORE SUBMITTING

+-- Did I inventory ALL incidents (P0-P4) since the release?
+-- Did I record the maximum open severity?
+-- Did I perform 5-Why RCA for each P0/P1 incident?
+-- Did I document resolution and prevention for each incident?
+-- Did I calculate time to detect and resolve for each incident?
+-- Did I perform escape phase analysis?
+-- Did I calculate RCA completeness percentage?
+-- Did I save the report to the correct output path?`,
  subagent_type: "qe-root-cause-analyzer",
  run_in_background: true
})
```

### Post-Spawn Confirmation

After sending all three Task calls, you MUST tell the user:

```
I've launched 3 core agents in parallel:

  qe-metrics-optimizer [Domain: learning-optimization]
   - Computing DORA metrics (deployment frequency, lead time, MTTR, CFR)
   - Evaluating SLA/SLO compliance across all targets
   - Calculating composite DORA score (0-1)

  qe-defect-predictor [Domain: defect-intelligence]
   - Analyzing defect trends and predicting future density
   - Identifying defect hotspots across modules
   - Performing escape analysis (which phase should have caught each defect)

  qe-root-cause-analyzer [Domain: defect-intelligence]
   - Inventorying all P0-P4 incidents since release
   - Performing systematic 5-Why RCA for each incident
   - Calculating RCA completeness percentage

  WAITING for all agents to complete before proceeding...
```

**DO NOT proceed to Phase 3 until you have sent this confirmation.**

---

## PHASE 3: Wait for Batch 1 Completion

### ENFORCEMENT: NO EARLY PROCEEDING

```
+-------------------------------------------------------------+
|  YOU MUST WAIT FOR ALL THREE BACKGROUND TASKS TO COMPLETE    |
|                                                              |
|  DO NOT summarize what agents "would" find                   |
|  DO NOT proceed to Phase 4 early                             |
|  DO NOT provide your own analysis as substitute              |
|                                                              |
|  WAIT for actual agent results                               |
|  ONLY proceed when all three have returned                   |
+-------------------------------------------------------------+
```

### Results Extraction Checklist

When results return, extract and record:

```
From qe-metrics-optimizer:
[ ] doraScore = __.__ composite score (0-1)
[ ] doraClassification = Elite/High/Medium/Low
[ ] slaCompliance = __% compliance percentage
[ ] deploymentFrequency = __/day or __/week
[ ] leadTime = __ hours/days
[ ] mttr = __ hours
[ ] changeFailureRate = __%

From qe-defect-predictor:
[ ] defectTrend = declining/stable/increasing
[ ] defectDensity = __.__ per KLOC
[ ] hotspotCount = __ hotspots identified
[ ] escapeCount = __ defects escaped from earlier phases
[ ] predictedDensity = __.__ per KLOC (next period)

From qe-root-cause-analyzer:
[ ] incidentCount = __ total incidents
[ ] maxOpenSeverity = P0/P1/P2/P3/P4/NONE
[ ] rcaCompleteness = __% (completed RCAs / total incidents)
[ ] averageTTD = __ hours (time to detect)
[ ] averageTTR = __ hours (time to resolve)
[ ] openP0P1 = __ count of open P0/P1 incidents
```

### Metrics Summary Box

Output extracted metrics:

```
+-------------------------------------------------------------+
|                    BATCH 1 RESULTS SUMMARY                   |
+-------------------------------------------------------------+
|                                                              |
|  DORA Score:                 __.__ (Elite/High/Med/Low)       |
|  Deployment Frequency:       __/day or __/week               |
|  Lead Time:                  __ hours/days                   |
|  MTTR:                       __ hours                        |
|  Change Failure Rate:        __%                             |
|  SLA Compliance:             __%                             |
|                                                              |
|  Defect Trend:               declining/stable/increasing     |
|  Defect Density:             __.__ per KLOC                  |
|  Predicted Density:          __.__ per KLOC                  |
|  Hotspots:                   __                              |
|  Defects Escaped:            __                              |
|                                                              |
|  Incidents (total):          __                              |
|  Max Open Severity:          P_/NONE                         |
|  RCA Completeness:           __%                             |
|  Avg Time to Detect:         __ hours                        |
|  Avg Time to Resolve:        __ hours                        |
|  Open P0/P1:                 __                              |
|                                                              |
+-------------------------------------------------------------+
```

**DO NOT proceed to Phase 4 until ALL fields are filled.**

---

## PHASE 4: Spawn Conditional Agents (PARALLEL BATCH 2)

### ENFORCEMENT: NO SKIPPING CONDITIONAL AGENTS

```
+-------------------------------------------------------------+
|  IF A FLAG IS TRUE, YOU MUST SPAWN THAT AGENT                |
|                                                              |
|  HAS_INFRASTRUCTURE_CHANGE = TRUE -> MUST spawn qe-chaos-engineer       |
|  HAS_PERFORMANCE_SLA = TRUE       -> MUST spawn qe-performance-tester   |
|  HAS_REGRESSION_RISK = TRUE       -> MUST spawn qe-regression-analyzer  |
|  HAS_RECURRING_INCIDENTS = TRUE   -> MUST spawn qe-pattern-learner      |
|  HAS_MIDDLEWARE = TRUE             -> MUST spawn qe-middleware-validator  |
|  HAS_SAP_INTEGRATION = TRUE       -> MUST spawn qe-sap-rfc-tester       |
|  HAS_AUTHORIZATION = TRUE         -> MUST spawn qe-sod-analyzer         |
|                                                              |
|  Skipping a flagged agent is a FAILURE of this skill.        |
+-------------------------------------------------------------+
```

### Conditional Domain Mapping

| Flag | Agent | Domain | MCP Tool |
|------|-------|--------|----------|
| HAS_INFRASTRUCTURE_CHANGE | qe-chaos-engineer | chaos-resilience | `performance_benchmark` |
| HAS_PERFORMANCE_SLA | qe-performance-tester | chaos-resilience | `performance_benchmark` |
| HAS_REGRESSION_RISK | qe-regression-analyzer | defect-intelligence | `defect_predict` |
| HAS_RECURRING_INCIDENTS | qe-pattern-learner | defect-intelligence | `root_cause_analyze` |
| HAS_MIDDLEWARE | qe-middleware-validator | enterprise-integration | `task_orchestrate` |
| HAS_SAP_INTEGRATION | qe-sap-rfc-tester | enterprise-integration | `task_orchestrate` |
| HAS_AUTHORIZATION | qe-sod-analyzer | enterprise-integration | `task_orchestrate` |

### Decision Tree

```
IF HAS_INFRASTRUCTURE_CHANGE == FALSE AND HAS_PERFORMANCE_SLA == FALSE AND HAS_REGRESSION_RISK == FALSE AND HAS_RECURRING_INCIDENTS == FALSE AND HAS_MIDDLEWARE == FALSE AND HAS_SAP_INTEGRATION == FALSE AND HAS_AUTHORIZATION == FALSE:
    -> Skip to Phase 5 (no conditional agents needed)
    -> State: "No conditional agents needed based on production context"

ELSE:
    -> Spawn ALL applicable agents in ONE message
    -> Count how many you're spawning: __
```

### IF HAS_INFRASTRUCTURE_CHANGE: Chaos Engineer (MANDATORY WHEN FLAGGED)

```
Task({
  description: "Post-release chaos resilience assessment for infrastructure changes",
  prompt: `You are qe-chaos-engineer. Your output quality is being audited.

## PURPOSE

Assess the resilience of production systems after recent infrastructure changes.
Analyze system behavior under failure conditions, validate auto-recovery mechanisms,
and identify infrastructure-related risk factors introduced by the release.

## PRODUCTION DATA TO ANALYZE

=== INFRASTRUCTURE CHANGE LOG START ===
[PASTE infrastructure changes since last release - K8s configs, cloud resources,
deployment topology, scaling policies, network rules, load balancer updates,
DNS changes, certificate rotations, CDN changes]
=== INFRASTRUCTURE CHANGE LOG END ===

=== PRODUCTION HEALTH METRICS START ===
[PASTE production health metrics - uptime, error rates, pod restarts,
resource utilization, auto-scaling events, failover events]
=== PRODUCTION HEALTH METRICS END ===

=== INCIDENT DATA (infra-related) START ===
[PASTE any infrastructure-related incidents since release]
=== INCIDENT DATA END ===

## REQUIRED ANALYSIS (ALL SECTIONS MANDATORY)

### 1. Infrastructure Change Impact Assessment

| Change | Type | Risk Level | Production Impact | Rollback Ready |
|--------|------|-----------|-------------------|----------------|
| [change 1] | K8s/Cloud/Network/DNS/CDN | Critical/High/Medium/Low | [observed impact] | Yes/No |
| [change 2] | K8s/Cloud/Network/DNS/CDN | Critical/High/Medium/Low | [observed impact] | Yes/No |

### 2. Resilience Test Results

| Scenario | Target | Outcome | Recovery Time | Auto-Recovered | Status |
|----------|--------|---------|---------------|----------------|--------|
| Pod failure | [service] | Pass/Fail | X seconds | Yes/No | PASS/FAIL |
| Node drain | [node pool] | Pass/Fail | X seconds | Yes/No | PASS/FAIL |
| Dependency timeout | [dependency] | Pass/Fail | X seconds | Yes/No | PASS/FAIL |
| Traffic spike (2x) | [service] | Pass/Fail | X seconds | Yes/No | PASS/FAIL |
| Zone failure | [zone] | Pass/Fail/N-A | X seconds | Yes/No | PASS/FAIL/N-A |
| Network partition | [segment] | Pass/Fail/N-A | X seconds | Yes/No | PASS/FAIL/N-A |

### 3. Auto-Recovery Assessment

| Recovery Mechanism | Configured | Tested | Recovery Time | Status |
|-------------------|------------|--------|---------------|--------|
| Health check probes | Yes/No | Yes/No | X seconds | PASS/FAIL |
| Auto-scaling | Yes/No | Yes/No | X seconds | PASS/FAIL |
| Circuit breakers | Yes/No | Yes/No | X seconds | PASS/FAIL |
| Retry policies | Yes/No | Yes/No | X seconds | PASS/FAIL |
| Failover routing | Yes/No | Yes/No | X seconds | PASS/FAIL |

### 4. Resource Utilization Post-Change

| Resource | Before Change | After Change | Delta | Risk |
|----------|--------------|-------------|-------|------|
| CPU utilization | X% | X% | +/-X% | High/Medium/Low |
| Memory utilization | X% | X% | +/-X% | High/Medium/Low |
| Network throughput | X MB/s | X MB/s | +/-X% | High/Medium/Low |
| Disk I/O | X MB/s | X MB/s | +/-X% | High/Medium/Low |
| Pod restart count | X | X | +/-X | High/Medium/Low |

### 5. Resilience Score

| Dimension | Score (0-25) | Notes |
|-----------|-------------|-------|
| Failure recovery | X/25 | ... |
| Auto-scaling effectiveness | X/25 | ... |
| Redundancy coverage | X/25 | ... |
| Observability depth | X/25 | ... |

**CHAOS RESILIENCE SCORE: X/100 (0-100 scale)**

**MINIMUM: Assess all infrastructure changes, test at least 4 resilience scenarios, and evaluate auto-recovery mechanisms.**

## OUTPUT FORMAT

Save to: ${OUTPUT_FOLDER}/05-chaos-resilience.md
Use the Write tool to save BEFORE completing.

## VALIDATION BEFORE SUBMITTING

+-- Did I inventory all infrastructure changes since release?
+-- Did I test at least 4 resilience scenarios?
+-- Did I evaluate all auto-recovery mechanisms?
+-- Did I assess resource utilization deltas?
+-- Did I calculate the resilience score?
+-- Did I save the report to the correct output path?`,
  subagent_type: "qe-chaos-engineer",
  run_in_background: true
})
```

### IF HAS_PERFORMANCE_SLA: Performance Tester (MANDATORY WHEN FLAGGED)

```
Task({
  description: "Production SLA/SLO compliance and performance assessment",
  prompt: `You are qe-performance-tester. Your output quality is being audited.

## PURPOSE

Validate production performance against SLA/SLO targets. Analyze response time
distributions, throughput metrics, error budgets, and latency percentiles to
determine if the release meets performance contracts.

## PRODUCTION DATA TO ANALYZE

=== SLA/SLO DEFINITIONS START ===
[PASTE SLA/SLO target definitions - availability, latency, throughput, error rate targets]
=== SLA/SLO DEFINITIONS END ===

=== PRODUCTION PERFORMANCE DATA START ===
[PASTE production performance metrics - response times, throughput, error rates,
latency percentiles (p50, p95, p99), resource utilization]
=== PRODUCTION PERFORMANCE DATA END ===

=== BASELINE METRICS (pre-release) START ===
[PASTE performance baselines from before this release]
=== BASELINE METRICS END ===

## REQUIRED ANALYSIS (ALL SECTIONS MANDATORY)

### 1. SLA/SLO Compliance Assessment

| SLA/SLO | Target | Actual | Compliance % | Error Budget Remaining | Status |
|---------|--------|--------|-------------|----------------------|--------|
| Availability | X% | X% | X% | X% / X hours | PASS/WARN/FAIL |
| Response Time (p50) | <= Xms | Xms | X% | N/A | PASS/WARN/FAIL |
| Response Time (p95) | <= Xms | Xms | X% | N/A | PASS/WARN/FAIL |
| Response Time (p99) | <= Xms | Xms | X% | N/A | PASS/WARN/FAIL |
| Error Rate | <= X% | X% | X% | X% remaining | PASS/WARN/FAIL |
| Throughput | >= X req/s | X req/s | X% | N/A | PASS/WARN/FAIL |

### 2. Performance Regression Detection

| Endpoint/Service | Pre-Release | Post-Release | Delta | Regression? | Severity |
|-----------------|------------|-------------|-------|-------------|----------|
| [endpoint 1] | Xms | Xms | +/-X% | Yes/No | Critical/High/Medium |
| [endpoint 2] | Xms | Xms | +/-X% | Yes/No | Critical/High/Medium |

### 3. Error Budget Analysis

| SLO | Monthly Budget | Consumed | Remaining | Burn Rate | Projected Exhaustion |
|-----|---------------|----------|-----------|-----------|---------------------|
| Availability | X min downtime | X min | X min | X% per day | [date or "Safe"] |
| Error Rate | X% allowance | X% used | X% | X% per day | [date or "Safe"] |

### 4. Latency Distribution Analysis

| Percentile | Target | Actual | Status | Trend vs Previous |
|-----------|--------|--------|--------|-------------------|
| p50 | Xms | Xms | PASS/FAIL | Improving/Declining/Stable |
| p75 | Xms | Xms | PASS/FAIL | Improving/Declining/Stable |
| p90 | Xms | Xms | PASS/FAIL | Improving/Declining/Stable |
| p95 | Xms | Xms | PASS/FAIL | Improving/Declining/Stable |
| p99 | Xms | Xms | PASS/FAIL | Improving/Declining/Stable |
| p99.9 | Xms | Xms | PASS/FAIL | Improving/Declining/Stable |

### 5. Performance Score

| Dimension | Score (0-25) | Notes |
|-----------|-------------|-------|
| SLA compliance | X/25 | ... |
| Latency health | X/25 | ... |
| Error budget safety | X/25 | ... |
| Throughput stability | X/25 | ... |

**PERFORMANCE SLA SCORE: X/100 (0-100 scale)**

**MINIMUM: Evaluate all SLA/SLO targets, detect any performance regressions, and analyze error budget burn rate.**

## OUTPUT FORMAT

Save to: ${OUTPUT_FOLDER}/06-performance-sla.md
Use the Write tool to save BEFORE completing.

## VALIDATION BEFORE SUBMITTING

+-- Did I evaluate all SLA/SLO targets?
+-- Did I detect performance regressions vs pre-release baseline?
+-- Did I analyze error budget burn rate?
+-- Did I assess latency distribution across percentiles?
+-- Did I calculate the performance score?
+-- Did I save the report to the correct output path?`,
  subagent_type: "qe-performance-tester",
  run_in_background: true
})
```

### IF HAS_REGRESSION_RISK: Regression Analyzer (MANDATORY WHEN FLAGGED)

```
Task({
  description: "Production regression analysis from user-reported issues and monitoring data",
  prompt: `You are qe-regression-analyzer. Your output quality is being audited.

## PURPOSE

Analyze production regressions discovered after release. Assess user-reported issues,
error rate increases, degraded functionality, and monitoring alerts that indicate
regression behavior introduced by the release.

## PRODUCTION DATA TO ANALYZE

=== USER-REPORTED ISSUES START ===
[PASTE user-reported bugs, support tickets, customer complaints since release]
=== USER-REPORTED ISSUES END ===

=== MONITORING ALERTS START ===
[PASTE monitoring alerts, anomaly detection events, error rate spikes]
=== MONITORING ALERTS END ===

=== ERROR RATE DATA START ===
[PASTE error rate data showing pre-release vs post-release comparison]
=== ERROR RATE DATA END ===

=== FEATURE FLAG STATUS START ===
[PASTE feature flag states, A/B test anomalies, rollback events]
=== FEATURE FLAG STATUS END ===

## REQUIRED ANALYSIS (ALL SECTIONS MANDATORY)

### 1. Regression Inventory

| Regression ID | Source | Description | Severity | Users Affected | Status |
|--------------|--------|-------------|----------|----------------|--------|
| REG-001 | User-report/Monitoring/Support | [description] | Critical/High/Medium/Low | [count/percentage] | Open/Mitigated/Resolved |
| REG-002 | User-report/Monitoring/Support | [description] | Critical/High/Medium/Low | [count/percentage] | Open/Mitigated/Resolved |

**REGRESSION COUNT: X**
**CRITICAL REGRESSIONS: X**

### 2. Error Rate Analysis

| Error Category | Pre-Release Rate | Post-Release Rate | Delta | Trend | Status |
|---------------|-----------------|-------------------|-------|-------|--------|
| HTTP 5xx | X% | X% | +/-X% | Rising/Falling/Stable | OK/WARN/CRITICAL |
| HTTP 4xx (client) | X% | X% | +/-X% | Rising/Falling/Stable | OK/WARN/CRITICAL |
| Application exceptions | X/hour | X/hour | +/-X% | Rising/Falling/Stable | OK/WARN/CRITICAL |
| Timeout errors | X/hour | X/hour | +/-X% | Rising/Falling/Stable | OK/WARN/CRITICAL |

### 3. Regression Root Cause Mapping

| Regression | Changed Component | Change Type | Root Cause | Prevention |
|-----------|------------------|-------------|-----------|------------|
| REG-001 | [module/file] | Code/Config/Infra | [root cause] | [what to add] |

### 4. User Impact Assessment

| Impact Dimension | Measurement | Severity |
|-----------------|-------------|----------|
| Users directly affected | X (X% of total) | High/Medium/Low |
| Revenue impact | $X or N/A | High/Medium/Low |
| Workflows broken | [list] | High/Medium/Low |
| Workaround available | Yes/No | - |
| Support ticket volume | X tickets (X% increase) | High/Medium/Low |

### 5. Regression Risk Score

| Dimension | Score (0-25) | Notes |
|-----------|-------------|-------|
| Regression count and severity | X/25 | ... |
| User impact breadth | X/25 | ... |
| Error rate delta | X/25 | ... |
| Resolution progress | X/25 | ... |

**REGRESSION ANALYSIS SCORE: X/100 (0-100 scale, higher = lower risk, healthier)**

**MINIMUM: Inventory all regressions, analyze error rate deltas, and assess user impact.**

## OUTPUT FORMAT

Save to: ${OUTPUT_FOLDER}/07-regression-analysis.md
Use the Write tool to save BEFORE completing.

## VALIDATION BEFORE SUBMITTING

+-- Did I inventory all discovered regressions?
+-- Did I analyze error rate changes pre vs post-release?
+-- Did I map regressions to root causes?
+-- Did I assess user impact?
+-- Did I calculate the regression count?
+-- Did I save the report to the correct output path?`,
  subagent_type: "qe-regression-analyzer",
  run_in_background: true
})
```

### IF HAS_RECURRING_INCIDENTS: Pattern Learner (MANDATORY WHEN FLAGGED)

```
Task({
  description: "Recurring incident pattern detection and learning",
  prompt: `You are qe-pattern-learner. Your output quality is being audited.

## PURPOSE

Detect recurring incident patterns in production. Identify chronic failures,
flapping services, repeat offender modules, and same-root-cause incidents
that indicate systemic issues requiring structural fixes rather than point patches.

## PRODUCTION DATA TO ANALYZE

=== CURRENT INCIDENT DATA START ===
[PASTE current incidents since release]
=== CURRENT INCIDENT DATA END ===

=== HISTORICAL INCIDENT DATA START ===
[PASTE historical incidents from previous releases showing recurring patterns]
=== HISTORICAL INCIDENT DATA END ===

=== ALERT HISTORY START ===
[PASTE alerting history showing chronic alerts, flapping services, recurring pages]
=== ALERT HISTORY END ===

## REQUIRED ANALYSIS (ALL SECTIONS MANDATORY)

### 1. Recurring Pattern Identification

| Pattern ID | Description | Occurrences (this release) | Occurrences (historical) | Frequency | Severity |
|-----------|-------------|--------------------------|--------------------------|-----------|----------|
| PAT-001 | [pattern description] | X | X (across Y releases) | Daily/Weekly/Per-release | Critical/High/Medium |
| PAT-002 | [pattern description] | X | X (across Y releases) | Daily/Weekly/Per-release | Critical/High/Medium |

### 2. Flapping Service Analysis

| Service | Flap Count | Average Duration | Root Cause | Auto-Recovered | Fix Status |
|---------|-----------|-----------------|------------|----------------|------------|
| [service 1] | X events | X min | [cause] | Yes/No | Fixed/Open/Deferred |
| [service 2] | X events | X min | [cause] | Yes/No | Fixed/Open/Deferred |

### 3. Repeat Offender Modules

| Module | Incident Count (12 months) | Common Root Cause | Structural Fix Needed | Priority |
|--------|---------------------------|--------------------|-----------------------|----------|
| [module 1] | X | [cause category] | [yes: what fix / no] | P0/P1/P2 |
| [module 2] | X | [cause category] | [yes: what fix / no] | P0/P1/P2 |

### 4. Same-Root-Cause Clustering

| Cluster | Root Cause | Incidents In Cluster | First Seen | Still Occurring | Structural Fix |
|---------|-----------|---------------------|------------|----------------|----------------|
| C-001 | [shared root cause] | INC-X, INC-Y, INC-Z | [date] | Yes/No | [fix description] |

### 5. Pattern Learning Recommendations

| Priority | Pattern | Recommendation | Expected Impact | Effort |
|----------|---------|---------------|----------------|--------|
| P0 | [pattern] | [structural fix] | [reduced incidents by X%] | [effort] |
| P1 | [pattern] | [improvement] | [reduced incidents by X%] | [effort] |

**RECURRING PATTERNS TOTAL: X**
**STRUCTURAL FIXES NEEDED: X**

**MINIMUM: Identify all recurring patterns, analyze flapping services, and cluster same-root-cause incidents.**

## OUTPUT FORMAT

Save to: ${OUTPUT_FOLDER}/08-pattern-analysis.md
Use the Write tool to save BEFORE completing.

## VALIDATION BEFORE SUBMITTING

+-- Did I identify all recurring incident patterns?
+-- Did I analyze flapping services?
+-- Did I identify repeat offender modules?
+-- Did I cluster same-root-cause incidents?
+-- Did I provide structural fix recommendations?
+-- Did I save the report to the correct output path?`,
  subagent_type: "qe-pattern-learner",
  run_in_background: true
})
```

### IF HAS_MIDDLEWARE: Middleware Validator (MANDATORY WHEN FLAGGED)

```
Task({
  description: "Production middleware and message broker health assessment",
  prompt: `You are qe-middleware-validator. Your output quality is being audited.

## PURPOSE

Validate middleware and message broker health in the production environment.
Analyze message flow reliability, broker performance, queue health, consumer
lag, and integration point stability for all middleware components.

## PRODUCTION DATA TO ANALYZE

=== MIDDLEWARE HEALTH METRICS START ===
[PASTE middleware health data - broker metrics, queue depths, consumer lag,
message throughput, dead letter queue counts, connection pool status]
=== MIDDLEWARE HEALTH METRICS END ===

=== MESSAGE FLOW DATA START ===
[PASTE message flow data - delivery rates, processing times, error rates,
retry counts, message loss data]
=== MESSAGE FLOW DATA END ===

=== MIDDLEWARE INCIDENT DATA START ===
[PASTE any middleware-related incidents or alerts since release]
=== MIDDLEWARE INCIDENT DATA END ===

## REQUIRED ANALYSIS (ALL SECTIONS MANDATORY)

### 1. Middleware Component Inventory

| Component | Type | Protocol | Production Status | Message Rate | Error Rate |
|-----------|------|----------|-------------------|-------------|------------|
| [name] | Queue/Topic/Exchange/Gateway | AMQP/Kafka/JMS/HTTP | Healthy/Degraded/Failed | [msg/s] | [%] |

### 2. Message Flow Health

| Flow | Producer | Consumer | Delivery Rate | Avg Latency | Error Rate | DLQ Count | Status |
|------|----------|----------|---------------|-------------|------------|-----------|--------|
| [name] | [source] | [target] | X% | Xms | X% | X | PASS/WARN/FAIL |

### 3. Broker Health Assessment

| Metric | Current | Threshold | Status | Trend |
|--------|---------|-----------|--------|-------|
| Queue depth | [value] | [max] | PASS/WARN/FAIL | Rising/Falling/Stable |
| Consumer lag | [value] | [max] | PASS/WARN/FAIL | Rising/Falling/Stable |
| Dead letter count | [value] | 0 | PASS/WARN/FAIL | Rising/Falling/Stable |
| Connection pool | [used/max] | [max] | PASS/WARN/FAIL | Rising/Falling/Stable |
| Memory usage | [value] | [max] | PASS/WARN/FAIL | Rising/Falling/Stable |
| Replication lag | [value] | [max] | PASS/WARN/FAIL | Rising/Falling/Stable |

### 4. Message Loss and Reliability

| Flow | Messages Sent | Messages Received | Loss Rate | Duplicates | Ordering Preserved |
|------|-------------|------------------|-----------|-----------|-------------------|
| [flow] | X | X | X% | X | Yes/No |

### 5. Recommendations

| Priority | Action | Impact | Effort |
|----------|--------|--------|--------|
| P0 | [critical middleware issues in production] | [what risk] | [effort] |
| P1 | [important improvements] | [what risk] | [effort] |

**MIDDLEWARE HEALTH SCORE: X/100 (0-100 scale)**

## OUTPUT FORMAT

Save to: ${OUTPUT_FOLDER}/10-middleware-health.md
Use the Write tool to save BEFORE completing.

## VALIDATION BEFORE SUBMITTING

+-- Did I inventory all middleware components?
+-- Did I assess message flow health for all flows?
+-- Did I evaluate broker health metrics?
+-- Did I analyze message loss and reliability?
+-- Did I calculate the middleware health score?
+-- Did I save the report to the correct output path?`,
  subagent_type: "qe-middleware-validator",
  run_in_background: true
})
```

### IF HAS_SAP_INTEGRATION: SAP RFC Tester (MANDATORY WHEN FLAGGED)

```
Task({
  description: "Production SAP RFC/BAPI health and integration assessment",
  prompt: `You are qe-sap-rfc-tester. Your output quality is being audited.

## PURPOSE

Validate SAP RFC/BAPI integration health in the production environment.
Analyze RFC call success rates, BAPI response times, data integrity across
SAP boundaries, and integration point stability for all SAP connectors.

## PRODUCTION DATA TO ANALYZE

=== SAP INTEGRATION HEALTH START ===
[PASTE SAP integration metrics - RFC call logs, BAPI response data,
connector health, IDoc processing status, OData service metrics]
=== SAP INTEGRATION HEALTH END ===

=== SAP ERROR LOGS START ===
[PASTE SAP-related errors - RFC failures, BAPI exceptions, timeout events,
data mapping errors, authorization failures]
=== SAP ERROR LOGS END ===

=== SAP INCIDENT DATA START ===
[PASTE any SAP-related incidents since release]
=== SAP INCIDENT DATA END ===

## REQUIRED ANALYSIS (ALL SECTIONS MANDATORY)

### 1. SAP Service Inventory

| Service | Type | Endpoint | Status | Success Rate | Avg Response Time |
|---------|------|----------|--------|-------------|-------------------|
| [name] | RFC/BAPI/IDoc/OData | [endpoint] | Healthy/Degraded/Failed | X% | Xms |

### 2. RFC/BAPI Health Assessment

| RFC/BAPI | Call Volume | Success Rate | Avg Response | Error Types | Status |
|----------|------------|-------------|-------------|-------------|--------|
| [function] | X calls/day | X% | Xms | [timeout/auth/data/system] | PASS/WARN/FAIL |

### 3. Data Integrity Across SAP Boundaries

| Data Flow | Source | Target | Records Synced | Integrity Check | Discrepancies | Status |
|-----------|--------|--------|---------------|-----------------|---------------|--------|
| [flow] | [source] | [target] | X | Checksum/Count/Field | X | PASS/WARN/FAIL |

### 4. SAP Connector Performance

| Connector | Pool Size | Active | Idle | Timeout Rate | Reconnect Count | Status |
|-----------|-----------|--------|------|-------------|----------------|--------|
| [connector] | X | X | X | X% | X | PASS/WARN/FAIL |

### 5. Recommendations

| Priority | Action | Impact | Effort |
|----------|--------|--------|--------|
| P0 | [critical SAP production issues] | [what risk] | [effort] |
| P1 | [important improvements] | [what risk] | [effort] |

**SAP HEALTH SCORE: X/100 (0-100 scale)**

## OUTPUT FORMAT

Save to: ${OUTPUT_FOLDER}/11-sap-health.md
Use the Write tool to save BEFORE completing.

## VALIDATION BEFORE SUBMITTING

+-- Did I inventory all SAP services?
+-- Did I assess RFC/BAPI health with success rates?
+-- Did I validate data integrity across boundaries?
+-- Did I evaluate connector performance?
+-- Did I calculate the SAP health score?
+-- Did I save the report to the correct output path?`,
  subagent_type: "qe-sap-rfc-tester",
  run_in_background: true
})
```

### IF HAS_AUTHORIZATION: SoD Analyzer (MANDATORY WHEN FLAGGED)

```
Task({
  description: "Production segregation of duties and authorization compliance assessment",
  prompt: `You are qe-sod-analyzer. Your output quality is being audited.

## PURPOSE

Validate segregation of duties and authorization controls in the production
environment. Analyze live role assignments, permission matrices, SoD policy
compliance, and access control effectiveness for all production users.

## PRODUCTION DATA TO ANALYZE

=== AUTHORIZATION AUDIT DATA START ===
[PASTE production authorization data - role assignments, permission matrices,
SoD policy compliance results, access logs, privilege usage data]
=== AUTHORIZATION AUDIT DATA END ===

=== ACCESS CONTROL INCIDENTS START ===
[PASTE any authorization-related incidents - unauthorized access attempts,
privilege escalation events, SoD violations, role conflict detections]
=== ACCESS CONTROL INCIDENTS END ===

=== RBAC POLICY CHANGES START ===
[PASTE any role/permission changes deployed with this release]
=== RBAC POLICY CHANGES END ===

## REQUIRED ANALYSIS (ALL SECTIONS MANDATORY)

### 1. Authorization Compliance Status

| Policy | Status | Violations Found | New Since Release | Remediated | Residual Risk |
|--------|--------|------------------|-------------------|------------|---------------|
| [SoD policy 1] | Compliant/Non-compliant | [count] | [count] | [count] | High/Medium/Low |
| [SoD policy 2] | Compliant/Non-compliant | [count] | [count] | [count] | High/Medium/Low |

### 2. SoD Violation Inventory

| Violation ID | User/Role | Conflicting Permissions | Risk Level | Detection Method | Status |
|-------------|-----------|------------------------|-----------|-----------------|--------|
| SOD-001 | [user/role] | [perm A] vs [perm B] | Critical/High/Medium | Automated/Manual/Incident | Open/Mitigated/Resolved |

### 3. Role Assignment Analysis

| Role | Users Assigned | Privilege Level | SoD Conflicts | Last Reviewed | Status |
|------|---------------|----------------|---------------|---------------|--------|
| [role] | X | High/Medium/Low | X conflicts | [date] | Clean/Flagged |

### 4. Access Control Effectiveness

| Control | Tests Run | Violations Detected | False Positives | Coverage | Status |
|---------|-----------|--------------------|-----------------|-----------|----|
| Positive access | [count] | [count] | [count] | X% | PASS/FAIL |
| Negative access | [count] | [count] | [count] | X% | PASS/FAIL |
| Privilege escalation | [count] | [count] | [count] | X% | PASS/FAIL |
| Cross-role contamination | [count] | [count] | [count] | X% | PASS/FAIL |

### 5. Recommendations

| Priority | Action | Impact | Effort |
|----------|--------|--------|--------|
| P0 | [critical authorization issues in production] | [what risk] | [effort] |
| P1 | [important improvements] | [what risk] | [effort] |

**SOD COMPLIANCE SCORE: X/100 (0-100 scale)**

## OUTPUT FORMAT

Save to: ${OUTPUT_FOLDER}/12-sod-compliance.md
Use the Write tool to save BEFORE completing.

## VALIDATION BEFORE SUBMITTING

+-- Did I assess all SoD policies?
+-- Did I inventory all violations?
+-- Did I analyze role assignments?
+-- Did I evaluate access control effectiveness?
+-- Did I calculate the SoD compliance score?
+-- Did I save the report to the correct output path?`,
  subagent_type: "qe-sod-analyzer",
  run_in_background: true
})
```

### Agent Count Validation

**Before proceeding, verify agent count:**

```
+-------------------------------------------------------------+
|                   AGENT COUNT VALIDATION                     |
+-------------------------------------------------------------+
|                                                              |
|  CORE AGENTS (ALWAYS 3):                                     |
|    [ ] qe-metrics-optimizer - SPAWNED? [Y/N]                |
|    [ ] qe-defect-predictor - SPAWNED? [Y/N]                 |
|    [ ] qe-root-cause-analyzer - SPAWNED? [Y/N]              |
|                                                              |
|  CONDITIONAL AGENTS (based on flags):                        |
|    [ ] qe-chaos-engineer - SPAWNED? [Y/N] (HAS_INFRA)       |
|    [ ] qe-performance-tester - SPAWNED? [Y/N] (HAS_PERF_SLA)|
|    [ ] qe-regression-analyzer - SPAWNED? [Y/N] (HAS_REGRESS)|
|    [ ] qe-pattern-learner - SPAWNED? [Y/N] (HAS_RECURRING)  |
|    [ ] qe-middleware-validator - SPAWNED? [Y/N] (HAS_MIDDLEWARE)  |
|    [ ] qe-sap-rfc-tester - SPAWNED? [Y/N] (HAS_SAP_INTEG)       |
|    [ ] qe-sod-analyzer - SPAWNED? [Y/N] (HAS_AUTHORIZATION)     |
|                                                              |
|  FEEDBACK AGENTS (ALWAYS 2):                                 |
|    [ ] qe-learning-coordinator - PENDING (Phase 8)           |
|    [ ] qe-transfer-specialist - PENDING (Phase 8)            |
|                                                              |
|  VALIDATION:                                                 |
|    Expected agents so far: [3 + count of TRUE flags]         |
|    Actual spawned:  [count]                                  |
|    Status:          [PASS/FAIL]                              |
|                                                              |
|  If ACTUAL < EXPECTED, you have FAILED. Spawn missing        |
|  agents before proceeding.                                   |
|                                                              |
+-------------------------------------------------------------+
```

**DO NOT proceed if validation FAILS.**

### Post-Spawn Confirmation (If Applicable)

```
I've launched [N] conditional agent(s) in parallel:

[IF HAS_INFRASTRUCTURE_CHANGE] qe-chaos-engineer [Domain: chaos-resilience]
                               - Infrastructure change impact, resilience testing, auto-recovery
[IF HAS_PERFORMANCE_SLA]       qe-performance-tester [Domain: chaos-resilience]
                               - SLA/SLO compliance, latency distributions, error budget analysis
[IF HAS_REGRESSION_RISK]       qe-regression-analyzer [Domain: defect-intelligence]
                               - User-reported regression inventory, error rate deltas, impact assessment
[IF HAS_RECURRING_INCIDENTS]   qe-pattern-learner [Domain: defect-intelligence]
                               - Recurring pattern detection, flapping services, same-root-cause clustering
[IF HAS_MIDDLEWARE]            qe-middleware-validator [Domain: enterprise-integration]
                               - Message flow health, broker metrics, delivery reliability
[IF HAS_SAP_INTEGRATION]      qe-sap-rfc-tester [Domain: enterprise-integration]
                               - RFC/BAPI health, SAP connector performance, data integrity
[IF HAS_AUTHORIZATION]         qe-sod-analyzer [Domain: enterprise-integration]
                               - SoD compliance, role assignment analysis, access control effectiveness

  WAITING for conditional agents to complete...
```

---

## PHASE 5: Synthesize Results & Determine Recommendation

### ENFORCEMENT: EXACT DECISION LOGIC

**You MUST apply this logic EXACTLY. No interpretation.**

```
STEP 1: Derive composite metrics from agent outputs
-----------------------------------------------------------
doraScore         = doraMetrics.compositeScore from qe-metrics-optimizer
slaCompliance     = slaReport.compliancePercent from qe-metrics-optimizer
incidentSeverity  = maxOpenSeverity from qe-root-cause-analyzer
rcaCompleteness   = completedRcas / totalIncidents from qe-root-cause-analyzer
defectTrend       = trendDirection from qe-defect-predictor
defectDensity     = predictedDensity from qe-defect-predictor
regressionCount   = regressionCount from qe-regression-analyzer (NULL if not ran)
chaosResilience   = resilienceScore from qe-chaos-engineer (NULL if not ran, 0-100)
middlewareHealth   = healthScore from qe-middleware-validator (NULL if not ran, 0-100)
sapHealth          = healthScore from qe-sap-rfc-tester (NULL if not ran, 0-100)
sodCompliance      = complianceScore from qe-sod-analyzer (NULL if not ran, 0-100)

STEP 2: Check CRITICAL conditions (ANY triggers CRITICAL)
-----------------------------------------------------------
IF incidentSeverity in [P0, P1]        -> CRITICAL ("Active P0/P1 incidents")
IF doraScore < 0.4                     -> CRITICAL ("DORA metrics critically low")
IF slaCompliance < 95.0                -> CRITICAL ("SLA compliance below minimum")
IF defectTrend == "increasing"
   AND defectDensity > 5.0             -> CRITICAL ("Accelerating defect trend")
IF middlewareHealth != NULL
   AND middlewareHealth < 20           -> CRITICAL ("Middleware critically unhealthy")
IF sapHealth != NULL
   AND sapHealth < 20                  -> CRITICAL ("SAP integration critically unhealthy")
IF sodCompliance != NULL
   AND sodCompliance < 20             -> CRITICAL ("Critical SoD violations in production")

STEP 3: Check HEALTHY conditions (ALL required for HEALTHY)
-----------------------------------------------------------
IF doraScore >= 0.7
   AND slaCompliance >= 99.0
   AND incidentSeverity in [P3, P4, NONE]
   AND rcaCompleteness >= 80
   AND defectTrend in ["declining", "stable"]
   AND defectDensity <= 2.0
   AND (regressionCount == NULL OR regressionCount <= 2)
   AND (chaosResilience == NULL OR chaosResilience >= 80)
   AND (middlewareHealth == NULL OR middlewareHealth >= 70)
   AND (sapHealth == NULL OR sapHealth >= 70)
   AND (sodCompliance == NULL OR sodCompliance >= 70)
                                       -> HEALTHY

STEP 4: Default
-----------------------------------------------------------
ELSE                                   -> DEGRADED
```

### Decision Recording

```
METRICS:
- doraScore = __.__ (0-1)
- slaCompliance = __%
- incidentSeverity = P_/NONE (max open)
- rcaCompleteness = __%
- defectTrend = declining/stable/increasing
- defectDensity = __.__ per KLOC
- regressionCount = __ (if applicable, else NULL)
- chaosResilience = __ (if applicable, else NULL, 0-100)
- middlewareHealth = __ (if applicable, else NULL, 0-100)
- sapHealth = __ (if applicable, else NULL, 0-100)
- sodCompliance = __ (if applicable, else NULL, 0-100)

CRITICAL CHECK:
- incidentSeverity in [P0, P1]? __ (YES/NO)
- doraScore < 0.4? __ (YES/NO)
- slaCompliance < 95.0? __ (YES/NO)
- defectTrend == "increasing" AND defectDensity > 5.0? __ (YES/NO)
- middlewareHealth != NULL AND < 20? __ (YES/NO)
- sapHealth != NULL AND < 20? __ (YES/NO)
- sodCompliance != NULL AND < 20? __ (YES/NO)

HEALTHY CHECK (only if no CRITICAL triggered):
- doraScore >= 0.7? __ (YES/NO)
- slaCompliance >= 99.0? __ (YES/NO)
- incidentSeverity in [P3, P4, NONE]? __ (YES/NO)
- rcaCompleteness >= 80? __ (YES/NO)
- defectTrend in ["declining", "stable"]? __ (YES/NO)
- defectDensity <= 2.0? __ (YES/NO)
- regressionCount == NULL OR <= 2? __ (YES/NO)
- chaosResilience == NULL OR >= 80? __ (YES/NO)
- middlewareHealth == NULL OR >= 70? __ (YES/NO)
- sapHealth == NULL OR >= 70? __ (YES/NO)
- sodCompliance == NULL OR >= 70? __ (YES/NO)

FINAL RECOMMENDATION: [HEALTHY / DEGRADED / CRITICAL]
REASON: ___
```

### Degraded Recommendations

If recommendation is DEGRADED, provide specific improvement actions:

| Issue | Current Value | Required Value | Owner | Action |
|-------|--------------|----------------|-------|--------|
| ... | ... | ... | [who] | [what to do] |

If recommendation is CRITICAL, provide mandatory remediation steps:

| Fix | Priority | Effort | Must Complete Before |
|-----|----------|--------|---------------------|
| ... | P0 | [scope] | [production can stabilize] |

---

## PHASE 6: Generate Production Health Report

### ENFORCEMENT: COMPLETE REPORT STRUCTURE

**ALL sections below are MANDATORY. No abbreviations.**

```markdown
# QCSD Production Health Report: [Release Name/ID]

**Generated**: [Date/Time]
**Recommendation**: [HEALTHY / DEGRADED / CRITICAL]
**Agents Executed**: [List all agents that ran]
**Parallel Batches**: [3]
**Release ID**: [RELEASE_ID value]
**Telemetry Source**: [TELEMETRY_DATA path]

---

## Executive Summary

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| DORA Score | X.XX | >= 0.7 (HEALTHY) | PASS/WARN/FAIL |
| SLA Compliance | X% | >= 99% (HEALTHY) | PASS/WARN/FAIL |
| Incident Severity | P_/NONE | P3/P4/NONE (HEALTHY) | PASS/WARN/FAIL |
| Defect Trend | declining/stable/increasing | declining/stable (HEALTHY) | PASS/WARN/FAIL |
| RCA Completeness | X% | >= 80% (HEALTHY) | PASS/WARN/FAIL |

**Recommendation Rationale**: [1-2 sentences explaining why HEALTHY/DEGRADED/CRITICAL]

---

## DORA Metrics Analysis

[EMBED or LINK the full report from qe-metrics-optimizer]

### DORA Dashboard

| Metric | Value | Classification |
|--------|-------|----------------|
[All 4 DORA metrics from qe-metrics-optimizer]

### SLA Compliance Matrix
[Key findings from agent output]

---

## Defect Prediction Analysis

[EMBED or LINK the full report from qe-defect-predictor]

### Trend Summary

| Dimension | Value | Risk |
|-----------|-------|------|
[Key metrics from agent output]

### Escape Analysis
[Which phases should have caught production defects]

---

## Root Cause Analysis

[EMBED or LINK the full report from qe-root-cause-analyzer]

### Incident Summary

| Metric | Value | Status |
|--------|-------|--------|
[Key metrics from agent output]

### Top Incidents
[Summary of highest-severity incidents]

---

## Conditional Analysis

[INCLUDE ONLY IF APPLICABLE - based on which conditional agents ran]

### Chaos Resilience (IF HAS_INFRASTRUCTURE_CHANGE)
[Full output from qe-chaos-engineer]

### Performance SLA (IF HAS_PERFORMANCE_SLA)
[Full output from qe-performance-tester]

### Regression Analysis (IF HAS_REGRESSION_RISK)
[Full output from qe-regression-analyzer]

### Pattern Analysis (IF HAS_RECURRING_INCIDENTS)
[Full output from qe-pattern-learner]

### Middleware Health (IF HAS_MIDDLEWARE)
[Full output from qe-middleware-validator]

### SAP Health (IF HAS_SAP_INTEGRATION)
[Full output from qe-sap-rfc-tester]

### SoD Compliance (IF HAS_AUTHORIZATION)
[Full output from qe-sod-analyzer]

---

## Feedback Loop Synthesis

[Full output from qe-learning-coordinator and qe-transfer-specialist - Phase 8]

### Strategic Feedback (to Ideation)
[DORA trends + defect patterns for risk calibration]

### Tactical Feedback (to Refinement)
[RCA patterns + escape analysis for test strategy improvement]

---

## Recommended Actions

### Immediate Actions (P0 - Blockers)
- [ ] [Action based on findings]

### Short-Term Actions (P1 - Important)
- [ ] [Action based on findings]

### Long-Term Improvements (P2 - Improvement)
- [ ] [Action based on findings]

---

## Appendix: Agent Outputs

[Link to or embed full outputs from each agent]

---

*Generated by QCSD Production Swarm v1.0*
*Execution Model: Task Tool Parallel Swarm*
```

Write the executive summary report to:
`${OUTPUT_FOLDER}/01-executive-summary.md`

### Report Validation Checklist

Before presenting report:

```
+-- Executive Summary table is complete with all 5 metrics
+-- Recommendation matches decision logic output
+-- DORA section includes all 4 metrics with classifications
+-- Defect section includes trend direction and escape analysis
+-- RCA section includes incident severity and completeness
+-- Conditional sections included for all spawned agents
+-- Feedback loop section present (will be filled in Phase 8)
+-- Recommended actions are specific (not generic)
+-- Report saved to output folder
```

**DO NOT present an incomplete report.**

---

## PHASE 7: Store Learnings & Persist State

### ENFORCEMENT: ALWAYS RUN THIS PHASE

```
+-------------------------------------------------------------+
|  LEARNING PERSISTENCE MUST ALWAYS EXECUTE                    |
|                                                              |
|  This is NOT optional. It runs on EVERY production scan.     |
|  It stores findings for cross-phase feedback loops,          |
|  historical DORA tracking, and pattern learning.             |
|                                                              |
|  DO NOT skip this phase for any reason.                      |
|  DO NOT treat this as "nice to have".                        |
|  Enforcement Rule E9 applies.                                |
+-------------------------------------------------------------+
```

### Purpose

Store production findings for:
- Cross-phase feedback loops (Production -> Ideation and Refinement cycles)
- Historical DORA metric tracking across releases
- Defect trend analysis and prediction model improvement
- Incident pattern learning for recurring issue prevention

### Auto-Execution Steps (ALL THREE are MANDATORY)

**Step 1: Store production findings to memory**

You MUST execute this MCP call with actual values from the production analysis:

```javascript
mcp__agentic-qe__memory_store({
  key: `qcsd-production-${releaseId}-${Date.now()}`,
  namespace: "qcsd-production",
  value: {
    releaseId: releaseId,
    releaseName: releaseName,
    recommendation: recommendation,  // HEALTHY, DEGRADED, CRITICAL
    metrics: {
      doraScore: doraScore,
      slaCompliance: slaCompliance,
      incidentSeverity: incidentSeverity,
      rcaCompleteness: rcaCompleteness,
      defectTrend: defectTrend,
      defectDensity: defectDensity,
      regressionCount: regressionCount,  // if applicable
      chaosResilience: chaosResilience,  // if applicable
      middlewareHealth: middlewareHealth,  // if applicable
      sapHealth: sapHealth,              // if applicable
      sodCompliance: sodCompliance       // if applicable
    },
    flags: {
      HAS_INFRASTRUCTURE_CHANGE: HAS_INFRASTRUCTURE_CHANGE,
      HAS_PERFORMANCE_SLA: HAS_PERFORMANCE_SLA,
      HAS_REGRESSION_RISK: HAS_REGRESSION_RISK,
      HAS_RECURRING_INCIDENTS: HAS_RECURRING_INCIDENTS,
      HAS_MIDDLEWARE: HAS_MIDDLEWARE,
      HAS_SAP_INTEGRATION: HAS_SAP_INTEGRATION,
      HAS_AUTHORIZATION: HAS_AUTHORIZATION
    },
    agentsInvoked: agentList,
    timestamp: new Date().toISOString()
  }
})
```

**Step 2: Share learnings with feedback agents**

You MUST execute this MCP call to propagate patterns cross-domain:

```javascript
mcp__agentic-qe__memory_share({
  sourceAgentId: "qcsd-production-swarm",
  targetAgentIds: ["qe-learning-coordinator", "qe-transfer-specialist"],
  knowledgeDomain: "production-health-patterns"
})
```

**Step 3: Save learning persistence record to output folder**

You MUST use the Write tool to save a JSON record of the persisted learnings:

```
Save to: ${OUTPUT_FOLDER}/09-learning-persistence.json

Contents:
{
  "phase": "QCSD-Production",
  "releaseId": "[release ID]",
  "releaseName": "[release name]",
  "recommendation": "[HEALTHY/DEGRADED/CRITICAL]",
  "memoryKey": "qcsd-production-[releaseId]-[timestamp]",
  "namespace": "qcsd-production",
  "metrics": {
    "doraScore": [0-1],
    "slaCompliance": [0-100],
    "incidentSeverity": "[P0-P4 or NONE]",
    "rcaCompleteness": [0-100],
    "defectTrend": "[declining/stable/increasing]",
    "defectDensity": [N.NN],
    "regressionCount": [N or null],
    "chaosResilience": [N or null],
    "middlewareHealth": [N or null],
    "sapHealth": [N or null],
    "sodCompliance": [N or null]
  },
  "flags": {
    "HAS_INFRASTRUCTURE_CHANGE": true/false,
    "HAS_PERFORMANCE_SLA": true/false,
    "HAS_REGRESSION_RISK": true/false,
    "HAS_RECURRING_INCIDENTS": true/false,
    "HAS_MIDDLEWARE": true/false,
    "HAS_SAP_INTEGRATION": true/false,
    "HAS_AUTHORIZATION": true/false
  },
  "agentsInvoked": ["list", "of", "agents"],
  "crossPhaseSignals": {
    "toIdeation": "DORA trends and defect patterns for risk calibration and quality criteria updates",
    "toRefinement": "RCA patterns and escape analysis for test strategy improvement and BDD generation"
  },
  "persistedAt": "[ISO timestamp]"
}
```

### Fallback: CLI Memory Commands

If MCP memory_store tool is unavailable, use CLI instead (STILL MANDATORY):

```bash
npx @claude-flow/cli@latest memory store \
  --key "qcsd-production-${RELEASE_ID}-$(date +%s)" \
  --value '{"recommendation":"[VALUE]","doraScore":[N],"slaCompliance":[N],"incidentSeverity":"[P_]","defectTrend":"[VALUE]"}' \
  --namespace qcsd-production

npx @claude-flow/cli@latest hooks post-task \
  --task-id "qcsd-production-${RELEASE_ID}" \
  --success true
```

### Validation Before Proceeding to Phase 8

```
+-- Did I execute mcp__agentic-qe__memory_store with actual values? (not placeholders)
+-- Did I execute mcp__agentic-qe__memory_share to propagate learnings?
+-- Did I save 09-learning-persistence.json to the output folder?
+-- Does the JSON contain the correct recommendation from Phase 5?
+-- Does the JSON contain actual metrics from Phases 2-4?
+-- Does the JSON contain actual flag values from Phase 1?
+-- Does the JSON contain crossPhaseSignals with toIdeation and toRefinement?
```

**If ANY validation check fails, DO NOT proceed to Phase 8.**

### Cross-Phase Signal Consumption

The Production Swarm both consumes and produces signals for other QCSD phases:

```
CONSUMES (from CI/CD phase):
+-- Loop 5 (CI/CD): RELEASE/REMEDIATE/BLOCK decisions
|   - Release readiness metrics as monitoring baseline
|   - Deployment risk score and accepted risks
|   - Known issues and monitoring recommendations
|
+-- Loop 6 (Pipeline History): Previous production assessments
    - Historical DORA trends
    - Recurring incident patterns
    - SLA compliance baselines

PRODUCES (for other phases):
+-- To Ideation Phase (Strategic): DORA trends + defect patterns
|   - Risk calibration data for qe-risk-assessor
|   - Quality criteria updates for qe-quality-criteria-recommender
|   - SLA performance data for testability scoring
|
+-- To Refinement Phase (Tactical): RCA patterns + escape analysis
    - Root cause patterns for qe-product-factors-assessor
    - Defect hotspot data for qe-bdd-generator
    - Escape analysis: defects that escaped earlier phases
```

---

## PHASE 8: Apply Feedback Loop Closure (SEQUENTIAL BATCH 3)

### ENFORCEMENT: ALWAYS RUN BOTH AGENTS IN SEQUENCE

```
+-------------------------------------------------------------+
|  BOTH FEEDBACK AGENTS MUST ALWAYS RUN — SEQUENTIALLY         |
|                                                              |
|  This is NOT conditional. It runs on EVERY production scan.  |
|  qe-learning-coordinator synthesizes cross-domain learnings. |
|  qe-transfer-specialist transfers knowledge to target phases.|
|                                                              |
|  DO NOT skip either agent for any reason.                    |
|  DO NOT run only one of the two agents.                      |
|  Enforcement Rule E8 applies: BOTH agents, ALWAYS.           |
|                                                              |
|  CRITICAL DATA DEPENDENCY:                                   |
|  qe-transfer-specialist DEPENDS ON qe-learning-coordinator's |
|  output. They CANNOT run in parallel.                        |
+-------------------------------------------------------------+
```

### SEQUENTIAL ENFORCEMENT

```
+-------------------------------------------------------------+
|  YOU MUST RUN THESE AGENTS SEQUENTIALLY (NOT IN PARALLEL)    |
|                                                              |
|  Step A: Spawn qe-learning-coordinator (ONE Task call)       |
|  Step B: WAIT for learning coordinator to complete            |
|  Step C: Read 13-feedback-loops.md produced by Step A        |
|  Step D: Spawn qe-transfer-specialist (ONE Task call)        |
|          with learning coordinator's output as input          |
|  Step E: WAIT for transfer specialist to complete             |
|                                                              |
|  qe-transfer-specialist DEPENDS on qe-learning-coordinator's |
|  saved output. Running them in parallel produces garbage.     |
+-------------------------------------------------------------+
```

### Agent 1: Learning Coordinator

```
Task({
  description: "Cross-domain learning synthesis and feedback loop coordination",
  prompt: `You are qe-learning-coordinator. Your output quality is being audited.

## PURPOSE

Synthesize all production findings into cross-domain learnings that close the
QCSD feedback loop. This is the first half of the dual-responsibility of the
Production Swarm: converting production observations into actionable intelligence
for upstream QCSD phases.

## INPUT: PRODUCTION METRICS FROM ALL PREVIOUS AGENTS

### From DORA Metrics Optimizer (02-dora-metrics.md):
[Summarize: DORA scores, SLA compliance, quality metrics]

### From Defect Predictor (03-defect-prediction.md):
[Summarize: defect trends, hotspots, escape analysis]

### From Root Cause Analyzer (04-root-cause-analysis.md):
[Summarize: incident inventory, RCA findings, prevention strategies]

### From Conditional Agents (if applicable):
[Summarize: chaos resilience, performance SLA, regression, patterns,
middleware health, SAP health, SoD compliance]

### Production Recommendation:
[HEALTHY / DEGRADED / CRITICAL with rationale]

## REQUIRED OUTPUT (ALL SECTIONS MANDATORY)

### 1. Learning Synthesis Matrix

| Finding Source | Key Learning | Domain | Impact Level | Applicable To |
|---------------|-------------|--------|-------------|---------------|
| qe-metrics-optimizer | [learning] | learning-optimization | High/Medium/Low | Ideation/Refinement/Development/Verification |
| qe-defect-predictor | [learning] | defect-intelligence | High/Medium/Low | Ideation/Refinement/Development/Verification |
| qe-root-cause-analyzer | [learning] | defect-intelligence | High/Medium/Low | Ideation/Refinement/Development/Verification |
| [conditional agent] | [learning] | [domain] | High/Medium/Low | [phase(s)] |

### 2. Cross-Domain Pattern Consolidation

| Pattern ID | Pattern Description | Domains Affected | Evidence Sources | Confidence |
|-----------|--------------------|-----------------|--------------------|------------|
| XPAT-001 | [cross-domain pattern] | [domain 1, domain 2] | [agents that identified it] | High/Medium/Low |
| XPAT-002 | [cross-domain pattern] | [domain 1, domain 2] | [agents that identified it] | High/Medium/Low |

### 3. Strategic Feedback (to Ideation Phase)

| Signal | Data | Target Agent | Action Required |
|--------|------|-------------|-----------------|
| DORA trend signal | [deployment frequency, lead time, MTTR, CFR trends] | qe-risk-assessor | Recalibrate risk thresholds |
| Defect pattern signal | [defect hotspot data, density trends] | qe-quality-criteria-recommender | Update quality criteria weights |
| SLA performance signal | [SLA compliance trends, error budget data] | qe-testability-scorer | Adjust testability scoring inputs |
| Escape analysis signal | [defects that escaped ideation] | qe-risk-assessor | Add new risk categories |

### 4. Tactical Feedback (to Refinement Phase)

| Signal | Data | Target Agent | Action Required |
|--------|------|-------------|-----------------|
| RCA pattern signal | [root cause categories, prevention gaps] | qe-product-factors-assessor | Update product factor weights |
| Escape analysis signal | [defects that escaped refinement] | qe-bdd-generator | Add BDD scenarios for gap areas |
| Hotspot signal | [defect hotspot data] | qe-bdd-generator | Focus scenario generation on hotspots |
| Regression signal | [regression patterns, user impact data] | qe-product-factors-assessor | Increase regression risk factors |

### 5. Learning Quality Score

| Dimension | Score (0-20) | Notes |
|-----------|-------------|-------|
| Data completeness | X/20 | [how much production data was available] |
| Pattern confidence | X/20 | [statistical confidence in identified patterns] |
| Actionability | X/20 | [how actionable are the feedback signals] |
| Cross-domain coverage | X/20 | [how many domains contributed learnings] |
| Historical continuity | X/20 | [how well learnings connect to previous cycles] |

**LEARNING QUALITY SCORE: X/100 (0-100 scale)**

**MINIMUM: Synthesize learnings from ALL agents, produce strategic feedback for Ideation and tactical feedback for Refinement.**

## OUTPUT FORMAT

Save to: ${OUTPUT_FOLDER}/13-feedback-loops.md
Use the Write tool to save BEFORE completing.

## VALIDATION BEFORE SUBMITTING

+-- Did I synthesize learnings from ALL agents that ran?
+-- Did I identify cross-domain patterns?
+-- Did I produce strategic feedback for Ideation phase?
+-- Did I produce tactical feedback for Refinement phase?
+-- Did I map feedback signals to target agents?
+-- Did I calculate the learning quality score?
+-- Did I save the report to the correct output path?`,
  subagent_type: "qe-learning-coordinator",
  run_in_background: true
})
```

### Wait for Learning Coordinator

```
+-------------------------------------------------------------+
|  WAIT for qe-learning-coordinator to complete before         |
|  proceeding to qe-transfer-specialist.                       |
|                                                              |
|  When the learning coordinator returns:                      |
|  1. Read its saved output: ${OUTPUT_FOLDER}/13-feedback-loops.md |
|  2. Extract the Learning Synthesis Matrix                    |
|  3. Extract the Strategic Feedback signals                   |
|  4. Extract the Tactical Feedback signals                    |
|  5. THEN spawn qe-transfer-specialist with this data         |
+-------------------------------------------------------------+
```

### Agent 2: Transfer Specialist

**PREREQUISITE: qe-learning-coordinator MUST have completed and saved 13-feedback-loops.md.**

```
Task({
  description: "Knowledge transfer to target QCSD phases and feedback loop closure",
  prompt: `You are qe-transfer-specialist. Your output quality is being audited.

## PURPOSE

Transfer synthesized production learnings to target QCSD phases and verify
feedback loop closure. This is the second half of the dual-responsibility of
the Production Swarm: ensuring knowledge actually reaches the agents that need
it in Ideation and Refinement phases.

## INPUT: SYNTHESIS FROM qe-learning-coordinator

READ the file ${OUTPUT_FOLDER}/13-feedback-loops.md FIRST. This contains the
learning coordinator's completed output. Do NOT proceed without reading it.

### Learning Synthesis Matrix:
[PASTE the Learning Synthesis Matrix from 13-feedback-loops.md]

### Strategic Feedback (to Ideation):
[PASTE the Strategic Feedback section from 13-feedback-loops.md]

### Tactical Feedback (to Refinement):
[PASTE the Tactical Feedback section from 13-feedback-loops.md]

### Production Recommendation:
[HEALTHY / DEGRADED / CRITICAL with rationale]

## REQUIRED OUTPUT (ALL SECTIONS MANDATORY)

### 1. Knowledge Transfer Plan

| Transfer ID | Source Learning | Target Phase | Target Agent | Transfer Method | Priority |
|-------------|---------------|-------------|--------------|----------------|----------|
| KT-001 | [learning] | Ideation | qe-risk-assessor | memory_share / manual | P0/P1/P2 |
| KT-002 | [learning] | Ideation | qe-quality-criteria-recommender | memory_share / manual | P0/P1/P2 |
| KT-003 | [learning] | Refinement | qe-product-factors-assessor | memory_share / manual | P0/P1/P2 |
| KT-004 | [learning] | Refinement | qe-bdd-generator | memory_share / manual | P0/P1/P2 |

### 2. Target Agent Mapping

| Target Agent | Phase | Learnings Received | Expected Behavior Change | Verification |
|-------------|-------|-------------------|-------------------------|--------------|
| qe-risk-assessor | Ideation | [list of learnings] | [how agent should change behavior] | [how to verify] |
| qe-quality-criteria-recommender | Ideation | [list of learnings] | [how agent should change behavior] | [how to verify] |
| qe-testability-scorer | Ideation | [list of learnings] | [how agent should change behavior] | [how to verify] |
| qe-product-factors-assessor | Refinement | [list of learnings] | [how agent should change behavior] | [how to verify] |
| qe-bdd-generator | Refinement | [list of learnings] | [how agent should change behavior] | [how to verify] |

### 3. Transfer Verification

| Transfer | Status | Memory Key | Verified Stored | Accessible By Target |
|----------|--------|-----------|----------------|---------------------|
| KT-001 | Transferred/Pending/Failed | [memory key] | Yes/No | Yes/No |
| KT-002 | Transferred/Pending/Failed | [memory key] | Yes/No | Yes/No |
| KT-003 | Transferred/Pending/Failed | [memory key] | Yes/No | Yes/No |
| KT-004 | Transferred/Pending/Failed | [memory key] | Yes/No | Yes/No |

### 4. Feedback Loop Closure Status

| Loop | From | To | Signal | Status | Notes |
|------|------|-----|--------|--------|-------|
| Production -> Ideation (Strategic) | qe-metrics-optimizer | qe-risk-assessor | DORA trends | Open/Closed | [details] |
| Production -> Ideation (Quality) | qe-defect-predictor | qe-quality-criteria-recommender | Defect patterns | Open/Closed | [details] |
| Production -> Refinement (RCA) | qe-root-cause-analyzer | qe-product-factors-assessor | RCA patterns | Open/Closed | [details] |
| Production -> Refinement (Escape) | qe-defect-predictor | qe-bdd-generator | Escape analysis | Open/Closed | [details] |

**FEEDBACK LOOPS CLOSED: X/Y**
**TRANSFER COMPLETION: X%**

### 5. Continuous Improvement Recommendations

| Recommendation | Target | Expected Outcome | Timeline |
|---------------|--------|-------------------|----------|
| [improvement 1] | [phase/agent] | [outcome] | Next sprint/Next PI |
| [improvement 2] | [phase/agent] | [outcome] | Next sprint/Next PI |

**MINIMUM: Create transfer plan for all learnings, map to target agents, and verify feedback loop closure status.**

## OUTPUT FORMAT

Append your output to: ${OUTPUT_FOLDER}/13-feedback-loops.md
(This file was created by qe-learning-coordinator in the previous step)

Use the Write tool to save BEFORE completing.

## VALIDATION BEFORE SUBMITTING

+-- Did I create a knowledge transfer plan for all learnings?
+-- Did I map transfers to specific target agents?
+-- Did I verify transfer status?
+-- Did I assess feedback loop closure for all loops?
+-- Did I provide continuous improvement recommendations?
+-- Did I save the report to the correct output path?`,
  subagent_type: "qe-transfer-specialist",
  run_in_background: true
})
```

### Post-Completion Confirmation

After BOTH agents have completed sequentially:

```
Feedback loop closure complete (sequential execution):

  Step A: qe-learning-coordinator [Domain: learning-optimization] - COMPLETE
   - Synthesized cross-domain learnings from all production agents
   - Produced strategic feedback for Ideation phase
   - Produced tactical feedback for Refinement phase
   - Saved output to: 13-feedback-loops.md

  Step B: qe-transfer-specialist [Domain: learning-optimization] - COMPLETE
   - Created knowledge transfer plan to target agents
   - Verified feedback loop closure status
   - Mapped learnings to specific behavioral changes
   - Appended output to: 13-feedback-loops.md

  PROCEEDING to Phase 9 (Final Output)...
```

---

## PHASE 9: Final Output

**At the very end of swarm execution, ALWAYS output this completion summary:**

```
+---------------------------------------------------------------------+
|                  QCSD PRODUCTION SWARM COMPLETE                       |
+---------------------------------------------------------------------+
|                                                                      |
|  Release Assessed: [Release Name/ID]                                  |
|  Reports Generated: [count]                                           |
|  Output Folder: ${OUTPUT_FOLDER}                                     |
|                                                                      |
|  PRODUCTION HEALTH SCORES:                                            |
|  +-- DORA Score:              __.__ (Elite/High/Med/Low)             |
|  +-- SLA Compliance:          __%                                     |
|  +-- Incident Severity:       P_/NONE                                |
|  +-- Defect Trend:            declining/stable/increasing            |
|  +-- RCA Completeness:        __%                                     |
|  +-- Defect Density:          __.__ per KLOC                         |
|  +-- Learning Quality:        __/100                                   |
|  [IF HAS_INFRASTRUCTURE_CHANGE]                                       |
|  +-- Chaos Resilience:        __/100                                  |
|  [IF HAS_PERFORMANCE_SLA]                                             |
|  +-- Performance SLA:         __/100                                  |
|  [IF HAS_REGRESSION_RISK]                                             |
|  +-- Regression Score:        __/100                                  |
|  [IF HAS_RECURRING_INCIDENTS]                                         |
|  +-- Recurring Patterns:      __ identified                          |
|  [IF HAS_MIDDLEWARE]                                                  |
|  +-- Middleware Health:        __/100                                  |
|  [IF HAS_SAP_INTEGRATION]                                            |
|  +-- SAP Health:               __/100                                  |
|  [IF HAS_AUTHORIZATION]                                              |
|  +-- SoD Compliance:           __/100                                  |
|                                                                      |
|  FEEDBACK LOOPS:                                                      |
|  +-- To Ideation:             [X signals transferred]                |
|  +-- To Refinement:           [X signals transferred]                |
|  +-- Loop Closure:            X/Y closed                             |
|                                                                      |
|  RECOMMENDATION: [HEALTHY / DEGRADED / CRITICAL]                      |
|  REASON: [1-2 sentence rationale]                                     |
|                                                                      |
|  DELIVERABLES:                                                        |
|  +-- 01-executive-summary.md                                          |
|  +-- 02-dora-metrics.md                                               |
|  +-- 03-defect-prediction.md                                          |
|  +-- 04-root-cause-analysis.md                                        |
|  [IF HAS_INFRASTRUCTURE_CHANGE]                                       |
|  +-- 05-chaos-resilience.md                                           |
|  [IF HAS_PERFORMANCE_SLA]                                             |
|  +-- 06-performance-sla.md                                            |
|  [IF HAS_REGRESSION_RISK]                                             |
|  +-- 07-regression-analysis.md                                        |
|  [IF HAS_RECURRING_INCIDENTS]                                         |
|  +-- 08-pattern-analysis.md                                           |
|  +-- 09-learning-persistence.json                                     |
|  [IF HAS_MIDDLEWARE]                                                  |
|  +-- 10-middleware-health.md                                          |
|  [IF HAS_SAP_INTEGRATION]                                            |
|  +-- 11-sap-health.md                                                |
|  [IF HAS_AUTHORIZATION]                                              |
|  +-- 12-sod-compliance.md                                            |
|  +-- 13-feedback-loops.md                                             |
|                                                                      |
+---------------------------------------------------------------------+
```

**IF recommendation is CRITICAL, ALSO output this prominent action box:**

```
+---------------------------------------------------------------------+
|  ACTION REQUIRED: PRODUCTION CRITICAL - IMMEDIATE ATTENTION           |
+---------------------------------------------------------------------+
|                                                                      |
|  The following critical issues MUST be resolved immediately:          |
|                                                                      |
|  1. [Critical issue 1 with specific remediation]                      |
|  2. [Critical issue 2 with specific remediation]                      |
|  3. [Critical issue 3 with specific remediation]                      |
|                                                                      |
|  NEXT STEPS:                                                          |
|  - Activate incident response for all P0/P1 incidents                |
|  - Address all critical issues listed above                           |
|  - Consider rollback if production stability cannot be restored      |
|  - Re-run /qcsd-production-swarm after stabilization                 |
|  - Target: DORA >= 0.7, SLA >= 99%, no P0/P1, density <= 2.0        |
|                                                                      |
+---------------------------------------------------------------------+
```

**IF recommendation is DEGRADED, output this guidance box:**

```
+---------------------------------------------------------------------+
|  DEGRADED: PRODUCTION NEEDS ATTENTION                                 |
+---------------------------------------------------------------------+
|                                                                      |
|  The production environment is functional but requires improvement:   |
|                                                                      |
|  1. [Improvement 1 - must be addressed this sprint]                   |
|  2. [Improvement 2 - must be addressed next sprint]                   |
|                                                                      |
|  MONITORING STRATEGY:                                                 |
|  - Increase monitoring frequency for [specific metrics]              |
|  - Set tighter alert thresholds for [conditions]                     |
|  - Schedule follow-up production assessment in [timeframe]           |
|                                                                      |
|  FEEDBACK LOOP ACTIONS:                                               |
|  - Ideation: Update risk criteria based on production learnings      |
|  - Refinement: Add BDD scenarios for escaped defect patterns         |
|  - Development: Increase test coverage for identified hotspots       |
|                                                                      |
+---------------------------------------------------------------------+
```

**DO NOT end the swarm without displaying the completion summary.**

---

## Report Filename Mapping

| Agent | Report Filename | Phase |
|-------|----------------|-------|
| qe-metrics-optimizer | `02-dora-metrics.md` | Batch 1 |
| qe-defect-predictor | `03-defect-prediction.md` | Batch 1 |
| qe-root-cause-analyzer | `04-root-cause-analysis.md` | Batch 1 |
| qe-chaos-engineer | `05-chaos-resilience.md` | Batch 2 (conditional) |
| qe-performance-tester | `06-performance-sla.md` | Batch 2 (conditional) |
| qe-regression-analyzer | `07-regression-analysis.md` | Batch 2 (conditional) |
| qe-pattern-learner | `08-pattern-analysis.md` | Batch 2 (conditional) |
| qe-middleware-validator | `10-middleware-health.md` | Batch 2 (conditional) |
| qe-sap-rfc-tester | `11-sap-health.md` | Batch 2 (conditional) |
| qe-sod-analyzer | `12-sod-compliance.md` | Batch 2 (conditional) |
| qe-learning-coordinator + qe-transfer-specialist | `13-feedback-loops.md` | Batch 3 (feedback) |
| Learning Persistence | `09-learning-persistence.json` | Phase 7 (auto-execute) |
| Synthesis | `01-executive-summary.md` | Phase 6 |

---

## DDD Domain Integration

This swarm operates across **2 primary domains**, **3 conditional domains**,
and **1 feedback domain**:

```
+-----------------------------------------------------------------------------+
|                  QCSD PRODUCTION TELEMETRY - DOMAIN MAP                      |
+-----------------------------------------------------------------------------+
|                                                                              |
|  PRIMARY DOMAINS (Always Active)                                             |
|  +-------------------------------+  +-------------------------------+       |
|  |    learning-optimization      |  |     defect-intelligence       |       |
|  |  ---------------------------  |  |  ---------------------------  |       |
|  |  - qe-metrics-optimizer       |  |  - qe-defect-predictor       |       |
|  |    (DORA metrics, SLA/SLO,    |  |    (defect trends, density,   |       |
|  |     quality optimization)     |  |     escape analysis)          |       |
|  +-------------------------------+  |                               |       |
|                                     |  - qe-root-cause-analyzer     |       |
|                                     |    (incident RCA, 5-Why,      |       |
|                                     |     prevention strategies)    |       |
|                                     +-------------------------------+       |
|                                                                              |
|  CONDITIONAL DOMAINS (Based on Production Context)                           |
|  +-----------------------+  +-----------------------+                       |
|  |  chaos-resilience     |  | defect-intelligence   |                       |
|  |  ──────────────────── |  | ───────────────────── |                       |
|  |  qe-chaos-engineer    |  | qe-regression-analyzer|                       |
|  |  [IF HAS_INFRA]       |  | [IF HAS_REGRESSION]   |                       |
|  |                       |  |                       |                       |
|  |  qe-performance-tester|  | qe-pattern-learner    |                       |
|  |  [IF HAS_PERF_SLA]    |  | [IF HAS_RECURRING]    |                       |
|  +-----------------------+  +-----------------------+                       |
|                                                                              |
|  +-----------------------------------------------------------------------+  |
|  |                  enterprise-integration                                |  |
|  |  -----------------------------------------------------------------   |  |
|  |  - qe-middleware-validator [IF HAS_MIDDLEWARE]                        |  |
|  |  - qe-sap-rfc-tester [IF HAS_SAP_INTEGRATION]                       |  |
|  |  - qe-sod-analyzer [IF HAS_AUTHORIZATION]                           |  |
|  +-----------------------------------------------------------------------+  |
|                                                                              |
|  FEEDBACK DOMAIN (Always Active)                                             |
|  +-----------------------------------------------------------------------+  |
|  |                    learning-optimization                               |  |
|  |  -----------------------------------------------------------------   |  |
|  |  - qe-learning-coordinator (synthesis, strategic + tactical feedback)|  |
|  |  - qe-transfer-specialist (knowledge transfer, loop closure)         |  |
|  +-----------------------------------------------------------------------+  |
|                                                                              |
+-----------------------------------------------------------------------------+
```

---

## Execution Model Options

This skill supports **3 execution models**. Choose based on your environment:

| Model | When to Use | Pros | Cons |
|-------|-------------|------|------|
| **Task Tool** (PRIMARY) | Claude Code sessions | Full agent capabilities, parallel execution | Requires Claude Code |
| **MCP Tools** | MCP server available | Fleet coordination, memory persistence | Requires MCP setup |
| **CLI** | Terminal/scripts | Works anywhere, scriptable | Sequential only |

### Quick Start by Model

**Option A: Task Tool (RECOMMENDED)**
```
Just follow the skill phases above - uses Task() calls with run_in_background: true
```

**Option B: MCP Tools**
```javascript
// Initialize fleet for Production domains
mcp__agentic-qe__fleet_init({
  topology: "hierarchical",
  enabledDomains: ["learning-optimization", "defect-intelligence", "chaos-resilience", "enterprise-integration"],
  maxAgents: 12
})

// Orchestrate production assessment task
mcp__agentic-qe__task_orchestrate({
  task: "qcsd-production-assessment",
  strategy: "parallel"
})
```

**Option C: CLI**
```bash
# Initialize coordination
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 12

# Route task
npx @claude-flow/cli@latest hooks pre-task --description "QCSD Production Assessment for [Release]"

# Execute agents
npx @claude-flow/cli@latest agent spawn --type qe-metrics-optimizer
npx @claude-flow/cli@latest agent spawn --type qe-defect-predictor
npx @claude-flow/cli@latest agent spawn --type qe-root-cause-analyzer
```

---

## Quick Reference

### Enforcement Summary

| Phase | Must Do | Failure Condition |
|-------|---------|-------------------|
| 1 | Check ALL 7 flags | Missing flag evaluation |
| 2 | Spawn ALL 3 core agents in ONE message | Fewer than 3 Task calls |
| 3 | WAIT for completion | Proceeding before results |
| 4 | Spawn ALL flagged conditional agents | Skipping a TRUE flag |
| 5 | Apply EXACT decision logic | Wrong recommendation |
| 6 | Generate COMPLETE report | Missing sections |
| 7 | ALWAYS store learnings + save 09-learning-persistence.json | Pattern loss, missing audit trail |
| 8 | ALWAYS run BOTH feedback agents SEQUENTIALLY | Skipping feedback synthesis or running in parallel |
| 9 | Output completion summary | Missing final output |

### Quality Gate Thresholds

| Metric | HEALTHY | DEGRADED | CRITICAL |
|--------|---------|----------|----------|
| DORA Score | >= 0.7 | 0.4 - 0.69 | < 0.4 |
| SLA Compliance | >= 99% | 95 - 98.9% | < 95% |
| Incident Severity | P3/P4/NONE | P2 | P0/P1 |
| Defect Trend | declining/stable | stable (density > 2) | increasing + density > 5 |
| RCA Completeness | >= 80% | 50 - 79% | < 50% |
| Chaos Resilience | >= 80/100 | 20 - 79 | < 20 |
| Middleware Health | >= 70/100 | 20 - 69 | < 20 |
| SAP Health | >= 70/100 | 20 - 69 | < 20 |
| SoD Compliance | >= 70/100 | 20 - 69 | < 20 |

### Domain-to-Agent Mapping

| Domain | Agent | Phase | Batch |
|--------|-------|-------|-------|
| learning-optimization | qe-metrics-optimizer | Core | 1 |
| defect-intelligence | qe-defect-predictor | Core | 1 |
| defect-intelligence | qe-root-cause-analyzer | Core | 1 |
| chaos-resilience | qe-chaos-engineer | Conditional (HAS_INFRASTRUCTURE_CHANGE) | 2 |
| chaos-resilience | qe-performance-tester | Conditional (HAS_PERFORMANCE_SLA) | 2 |
| defect-intelligence | qe-regression-analyzer | Conditional (HAS_REGRESSION_RISK) | 2 |
| defect-intelligence | qe-pattern-learner | Conditional (HAS_RECURRING_INCIDENTS) | 2 |
| enterprise-integration | qe-middleware-validator | Conditional (HAS_MIDDLEWARE) | 2 |
| enterprise-integration | qe-sap-rfc-tester | Conditional (HAS_SAP_INTEGRATION) | 2 |
| enterprise-integration | qe-sod-analyzer | Conditional (HAS_AUTHORIZATION) | 2 |
| learning-optimization | qe-learning-coordinator | Feedback (ALWAYS) | 3 |
| learning-optimization | qe-transfer-specialist | Feedback (ALWAYS) | 3 |

### Execution Model Quick Reference

| Model | Initialization | Agent Spawn | Memory Store |
|-------|---------------|-------------|--------------|
| **Task Tool** | N/A | `Task({ subagent_type, run_in_background: true })` | N/A (use MCP) |
| **MCP Tools** | `fleet_init({})` | `task_submit({})` | `memory_store({})` |
| **CLI** | `swarm init` | `agent spawn` | `memory store` |

### MCP Tools Quick Reference

```javascript
// Initialization
mcp__agentic-qe__fleet_init({
  topology: "hierarchical",
  enabledDomains: ["learning-optimization", "defect-intelligence", "chaos-resilience", "enterprise-integration"],
  maxAgents: 12
})

// Task submission
mcp__agentic-qe__task_submit({ type: "...", priority: "p0", payload: {...} })
mcp__agentic-qe__task_orchestrate({ task: "...", strategy: "parallel" })

// Status
mcp__agentic-qe__fleet_status({ verbose: true })
mcp__agentic-qe__task_list({ status: "pending" })

// Memory
mcp__agentic-qe__memory_store({ key: "...", value: {...}, namespace: "qcsd-production" })
mcp__agentic-qe__memory_query({ pattern: "qcsd-production-*", namespace: "qcsd-production" })
mcp__agentic-qe__memory_share({
  sourceAgentId: "qcsd-production-swarm",
  targetAgentIds: ["qe-learning-coordinator", "qe-transfer-specialist"],
  knowledgeDomain: "production-health-patterns"
})
```

### CLI Quick Reference

```bash
# Initialization
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 12

# Agent operations
npx @claude-flow/cli@latest agent spawn --type [agent-type] --task "[description]"
npx @claude-flow/cli@latest hooks pre-task --description "[task]"
npx @claude-flow/cli@latest hooks post-task --task-id "[id]" --success true

# Status
npx @claude-flow/cli@latest swarm status

# Memory
npx @claude-flow/cli@latest memory store --key "[key]" --value "[json]" --namespace qcsd-production
npx @claude-flow/cli@latest memory search --query "[query]" --namespace qcsd-production
npx @claude-flow/cli@latest memory list --namespace qcsd-production
```

---

## Swarm Topology

```
                 QCSD PRODUCTION SWARM v1.0
                          |
          BATCH 1 (Core - Parallel)
          +-----------+---+-----------+
          |           |               |
    +-----v-----+ +---v--------+ +---v-----------+
    |  DORA     | | Defect     | |  Root Cause   |
    |  Metrics  | | Predictor  | |  Analyzer     |
    | (Optimize)| | (Predict)  | |  (Incidents)  |
    |-----------| |------------| |---------------|
    | learn-opt | | dfct-intel | | dfct-intel    |
    +-----+-----+ +-----+------+ +------+--------+
          |              |               |
          +--------------+---------------+
                         |
                  [METRICS GATE]
                         |
          BATCH 2 (Conditional - Parallel)
          +-----------+---+-----------+
          |           |               |
    +-----v-----+ +---v--------+ +---v----------+
    | Chaos     | | Perf       | | Regression   |
    | Engineer  | | Tester     | | Analyzer     |
    | [IF INFRA]| | [IF SLA]   | | [IF REGRESS] |
    |-----------| |------------| |--------------|
    | chaos-res | | chaos-res  | | dfct-intel   |
    +-----------+ +------------+ +--------------+
          +----------+---+-----------+
          |          |               |
    +-----v----+ +---v--------+ +---v----------+
    | Pattern  | | Middleware | | SAP RFC      |
    | Learner  | | Validator  | | Tester       |
    |[IF RECUR]| | [IF MIDW]  | | [IF SAP]     |
    |----------| |------------| |--------------|
    | dfct-int | | ent-integ  | | ent-integ    |
    +----------+ +------------+ +--------------+
                       |
                 +-----v------+
                 | SoD        |
                 | Analyzer   |
                 | [IF AUTH]  |
                 |------------|
                 | ent-integ  |
                 +-----+------+
                       |
                [SYNTHESIS]
                       |
          PHASE 7 (Learning Persistence - Always)
                       |
               +-------v-------+
               | memory_store  |
               | memory_share  |
               | 09-learning-  |
               | persistence   |
               | (ALWAYS RUNS) |
               +-------+-------+
                       |
          BATCH 3 (Feedback - Sequential, Always)
                     |
              +------v---------+
              | Learning       |
              | Coordinator    |
              | (ALWAYS - 1st) |
              |----------------|
              | learn-opt      |
              +------+---------+
                     |
              [WAIT FOR OUTPUT]
                     |
              +------v---------+
              | Transfer       |
              | Specialist     |
              | (ALWAYS - 2nd) |
              |----------------|
              | learn-opt      |
              +------+---------+
                     |
              [FINAL REPORT]
```

---

## Inventory Summary

| Resource Type | Count | Primary | Conditional | Feedback |
|---------------|:-----:|:-------:|:-----------:|:--------:|
| **Agents** | 12 | 3 | 7 | 2 |
| **Sub-agents** | 0 | - | - | - |
| **Skills** | 5 | 3 | - | 2 |
| **Domains** | 4 | 2 | 3 | 1 |
| **Parallel Batches** | 3 | 1 | 1 | 1 |

**Skills Used:**
1. `shift-right-testing` - Post-deploy monitoring and observability patterns
2. `chaos-engineering-resilience` - Chaos engineering and resilience assessment
3. `quality-metrics` - DORA metrics and quality measurement frameworks
4. `performance-testing` - Performance SLA validation and benchmarking
5. `holistic-testing-pact` - Holistic testing model for cross-phase feedback

**Frameworks Applied:**
1. DORA Metrics Assessment - Four key metrics with Elite/High/Medium/Low classification
2. Root Cause Analysis (5-Why) - Systematic incident investigation
3. Defect Prediction - ML-powered trend analysis and density forecasting
4. Escape Analysis - Cross-phase defect tracking (which phase should have caught it)
5. SLA/SLO Compliance - Error budget and burn rate analysis
6. Feedback Loop Closure - Bidirectional knowledge transfer to Ideation and Refinement

---

## Key Principle

**Production health is measured by outcomes, not intentions. This swarm provides evidence-based production assessment and closes the QCSD feedback loop.**

This swarm provides:
1. **Are DORA metrics healthy?** -> DORA Metrics Assessment (4 dimensions)
2. **Are SLAs being met?** -> SLA/SLO Compliance (error budgets, burn rates)
3. **What is the defect trajectory?** -> Defect Prediction (trends, density, hotspots)
4. **What caused production incidents?** -> Root Cause Analysis (5-Why per incident)
5. **Which phase should have caught each defect?** -> Escape Analysis (cross-phase)
6. **Are recurring patterns being addressed?** -> Pattern Learning (if recurring incidents)
7. **Is infrastructure stable post-change?** -> Chaos Resilience (if infra changes)
8. **What should upstream phases learn?** -> Feedback Loop Closure (always)
9. **Is the release healthy?** -> HEALTHY/DEGRADED/CRITICAL decision
