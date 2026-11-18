# Step 3: Wait for Batch 1 & Extract Results

## Prerequisites
- Step 2: All 3 core agents spawned

## Instructions

### WAIT for all three agents to complete. Do NOT proceed early.

### Extract from each agent:

**From qe-product-factors-assessor:**
- SFDIPOT factor scores and priorities
- Key quality risks identified
- Product factor coverage assessment

**From qe-bdd-generator:**
- Number of BDD scenarios generated
- Coverage of acceptance criteria
- Edge cases and negative scenarios

**From qe-requirements-validator:**
- INVEST validation score
- Testability score
- Acceptance criteria completeness percentage
- Missing requirements identified

### Output Metrics Summary Box with all extracted values.

## Success Criteria
- [ ] All three agents returned results
- [ ] All metrics extracted
- [ ] Summary box output with actual values

## Output
Complete Batch 1 metrics for use in subsequent steps.

## Navigation
- On success: proceed to Step 4 by reading `steps/04-conditional-agents.md`
- On failure: retry failed agents
