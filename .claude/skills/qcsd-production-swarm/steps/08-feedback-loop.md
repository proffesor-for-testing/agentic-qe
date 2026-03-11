# Step 8: Feedback Loop Closure (Sequential Batch 3)

## Prerequisites
- Step 7 (Learning Persistence) completed
- All production metrics and reports available
- Learnings persisted to memory

## Instructions

### ENFORCEMENT: ALWAYS RUN BOTH AGENTS IN SEQUENCE

```
+-------------------------------------------------------------+
|  BOTH FEEDBACK AGENTS MUST ALWAYS RUN -- SEQUENTIALLY        |
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

Spawn qe-learning-coordinator to synthesize all production findings into cross-domain learnings. This agent must:

1. Create a Learning Synthesis Matrix from ALL agents that ran
2. Consolidate cross-domain patterns
3. Produce Strategic Feedback signals for Ideation phase (DORA trends, defect patterns, SLA data, escape analysis)
4. Produce Tactical Feedback signals for Refinement phase (RCA patterns, escape analysis, hotspot data, regression patterns)
5. Calculate a Learning Quality Score (0-100)

Save output to: `${OUTPUT_FOLDER}/13-feedback-loops.md`

**WAIT for this agent to complete before spawning the transfer specialist.**

### Wait for Learning Coordinator

When the learning coordinator returns:
1. Use the Read tool to read `${OUTPUT_FOLDER}/13-feedback-loops.md`
2. Extract the Learning Synthesis Matrix
3. Extract the Strategic Feedback signals
4. Extract the Tactical Feedback signals
5. THEN spawn qe-transfer-specialist with this data

### Agent 2: Transfer Specialist

**PREREQUISITE: qe-learning-coordinator MUST have completed and saved 13-feedback-loops.md.**

Spawn qe-transfer-specialist to transfer synthesized production learnings to target QCSD phases. This agent must:

1. Create a Knowledge Transfer Plan mapping learnings to target agents
2. Map transfers to specific target agents in Ideation and Refinement
3. Verify transfer status
4. Assess feedback loop closure for all loops
5. Provide continuous improvement recommendations

Append output to: `${OUTPUT_FOLDER}/13-feedback-loops.md`

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

  PROCEEDING to Step 9 (Final Output)...
```

## Success Criteria
- [ ] qe-learning-coordinator spawned, completed, and saved 13-feedback-loops.md
- [ ] Learning coordinator output read before spawning transfer specialist
- [ ] qe-transfer-specialist spawned with learning coordinator data, completed
- [ ] Feedback loop closure status documented
- [ ] Both agents ran SEQUENTIALLY (not in parallel)

## Output
Provide to the next step:
- Learning quality score
- Feedback loops closed count
- Transfer completion percentage

## Navigation
- On success: proceed to Step 9 (Final Output) by reading `steps/09-final-output.md`
- On failure: if either agent failed, retry that agent before proceeding
