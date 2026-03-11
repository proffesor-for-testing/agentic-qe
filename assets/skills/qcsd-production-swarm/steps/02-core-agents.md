# Step 2: Spawn Core Agents (Parallel Batch 1)

## Prerequisites
- Step 1 (Flag Detection) completed successfully
- All seven flags evaluated and recorded
- Production telemetry data available
- OUTPUT_FOLDER determined

## Instructions

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

**DO NOT proceed to Step 3 until you have sent this confirmation.**

## Success Criteria
- [ ] All THREE core agents spawned in a SINGLE message
- [ ] Each agent received complete production data (not summaries)
- [ ] Post-spawn confirmation message sent to user
- [ ] All agents running in background

## Output
Provide to the next step:
- Confirmation that all 3 agents are spawned and running
- The Task IDs for tracking (if available)

## Navigation
- On success: proceed to Step 3 (Wait & Extract Results) by reading `steps/03-batch1-results.md`
- On failure: if fewer than 3 agents spawned, respawn missing agents before proceeding
