# Step 5: Synthesize Results & Determine Recommendation

## Prerequisites
- Step 3 (Batch 1 Results) completed with core metrics
- Step 4 (Conditional Agents) completed with all conditional scores
- All agent reports saved to OUTPUT_FOLDER

## Instructions

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

## Success Criteria
- [ ] All metrics derived from actual agent outputs
- [ ] CRITICAL conditions checked exhaustively
- [ ] HEALTHY conditions checked only if no CRITICAL triggered
- [ ] Decision recording completed with all fields filled
- [ ] FINAL RECOMMENDATION determined: HEALTHY, DEGRADED, or CRITICAL
- [ ] Rationale documented

## Output
Provide to the next step:
- FINAL RECOMMENDATION (HEALTHY / DEGRADED / CRITICAL)
- Complete metrics summary
- Decision rationale
- Improvement/remediation actions (if DEGRADED or CRITICAL)

## Navigation
- On success: proceed to Step 6 (Report Generation) by reading `steps/06-report-generation.md`
- On failure: if metrics are missing, return to the appropriate step to retrieve them
