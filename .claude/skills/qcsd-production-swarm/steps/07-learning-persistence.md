# Step 7: Store Learnings & Persist State

## Prerequisites
- Step 6 (Report Generation) completed
- All metrics available from Steps 3-5
- All flag values from Step 1

## Instructions

### ENFORCEMENT: ALWAYS RUN THIS STEP

```
+-------------------------------------------------------------+
|  LEARNING PERSISTENCE MUST ALWAYS EXECUTE                    |
|                                                              |
|  This is NOT optional. It runs on EVERY production scan.     |
|  It stores findings for cross-phase feedback loops,          |
|  historical DORA tracking, and pattern learning.             |
|                                                              |
|  DO NOT skip this step for any reason.                       |
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

```bash
aqe memory store \
  --key "qcsd-production-${releaseId}-${Date.now()}" \
  --namespace "qcsd-production" \
  --value '{...}' \
  --json
```

**Step 2: Share learnings with feedback agents**

```bash
aqe memory share \
  --from "qcsd-production-swarm" \
  --to "qe-learning-coordinator,qe-transfer-specialist" \
  --domain "production-health-patterns" \
  --content '{...}' --json
```

**Step 3: Save learning persistence record to output folder**

Save a JSON record to `${OUTPUT_FOLDER}/09-learning-persistence.json`:

```json
{
  "phase": "QCSD-Production",
  "releaseId": "[release ID]",
  "releaseName": "[release name]",
  "recommendation": "[HEALTHY/DEGRADED/CRITICAL]",
  "memoryKey": "qcsd-production-[releaseId]-[timestamp]",
  "namespace": "qcsd-production",
  "metrics": {
    "doraScore": "[0-1]",
    "slaCompliance": "[0-100]",
    "incidentSeverity": "[P0-P4 or NONE]",
    "rcaCompleteness": "[0-100]",
    "defectTrend": "[declining/stable/increasing]",
    "defectDensity": "[N.NN]",
    "regressionCount": "[N or null]",
    "chaosResilience": "[N or null]",
    "middlewareHealth": "[N or null]",
    "sapHealth": "[N or null]",
    "sodCompliance": "[N or null]"
  },
  "flags": {
    "HAS_INFRASTRUCTURE_CHANGE": "true/false",
    "HAS_PERFORMANCE_SLA": "true/false",
    "HAS_REGRESSION_RISK": "true/false",
    "HAS_RECURRING_INCIDENTS": "true/false",
    "HAS_MIDDLEWARE": "true/false",
    "HAS_SAP_INTEGRATION": "true/false",
    "HAS_AUTHORIZATION": "true/false"
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
npx --no-install ruflo memory store \
  --key "qcsd-production-${RELEASE_ID}-$(date +%s)" \
  --value '{"recommendation":"[VALUE]","doraScore":[N],"slaCompliance":[N],"incidentSeverity":"[P_]","defectTrend":"[VALUE]"}' \
  --namespace qcsd-production

npx --no-install ruflo hooks post-task \
  --task-id "qcsd-production-${RELEASE_ID}" \
  --success true
```

### Cross-Phase Signal Consumption

The Production Swarm both consumes and produces signals:

```
CONSUMES (from CI/CD phase):
+-- Loop 5 (CI/CD): RELEASE/REMEDIATE/BLOCK decisions
+-- Loop 6 (Pipeline History): Previous production assessments

PRODUCES (for other phases):
+-- To Ideation Phase (Strategic): DORA trends + defect patterns
+-- To Refinement Phase (Tactical): RCA patterns + escape analysis
```

### Validation Before Proceeding

```
+-- Did I execute aqe memory store with actual values?
+-- Did I execute aqe memory share to propagate learnings?
+-- Did I save 09-learning-persistence.json to the output folder?
+-- Does the JSON contain the correct recommendation from Step 5?
+-- Does the JSON contain actual metrics from Steps 2-4?
+-- Does the JSON contain actual flag values from Step 1?
+-- Does the JSON contain crossPhaseSignals with toIdeation and toRefinement?
```

**If ANY validation check fails, DO NOT proceed to Step 8.**

## Success Criteria
- [ ] Memory store executed with actual values
- [ ] Memory share executed to propagate learnings
- [ ] 09-learning-persistence.json saved with complete data
- [ ] Cross-phase signals documented

## Output
Provide to the next step:
- Confirmation that learnings are persisted
- Summary of cross-phase signals for feedback agents

## Navigation
- On success: proceed to Step 8 (Feedback Loop Closure) by reading `steps/08-feedback-loop.md`
- On failure: retry memory persistence before proceeding
