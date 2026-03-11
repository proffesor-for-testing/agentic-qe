# Step 3: Wait for Batch 1 & Extract Results

## Prerequisites
- Step 2 (Core Agents) completed: all 3 core agents spawned
- qe-metrics-optimizer, qe-defect-predictor, qe-root-cause-analyzer running in background

## Instructions

### ENFORCEMENT: NO EARLY PROCEEDING

```
+-------------------------------------------------------------+
|  YOU MUST WAIT FOR ALL THREE BACKGROUND TASKS TO COMPLETE    |
|                                                              |
|  DO NOT summarize what agents "would" find                   |
|  DO NOT proceed to Step 4 early                              |
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

**DO NOT proceed to Step 4 until ALL fields are filled.**

## Success Criteria
- [ ] All three core agents returned results
- [ ] All metrics extracted and recorded in summary box
- [ ] No placeholder values remain in the summary
- [ ] Results saved for use in subsequent steps

## Output
Provide to the next step:
- Complete Batch 1 Results Summary with all metrics filled
- Flag values from Step 1 (needed to determine which conditional agents to spawn)

## Navigation
- On success: proceed to Step 4 (Conditional Agents) by reading `steps/04-conditional-agents.md`
- On failure: if any agent failed, retry the failed agent before proceeding
