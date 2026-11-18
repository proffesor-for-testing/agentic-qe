# Step 8: Apply Test Idea Rewriter (Transformation)

## Prerequisites
- Step 7 completed
- BDD scenarios from Step 2 available
- All test ideas collected from all agents

## Instructions

### ENFORCEMENT: ALWAYS RUN qe-test-idea-rewriter

Spawn qe-test-idea-rewriter to transform ALL test ideas from passive descriptions
into active, exploratory test charters.

This agent must:
1. Read all BDD scenarios from qe-bdd-generator output
2. Read all test suggestions from other agents
3. Transform each passive test idea ("Verify X works") into an active charter
4. Apply the Session-Based Test Management (SBTM) charter format
5. Prioritize test ideas by risk and SFDIPOT factor weights

Save output to: `${OUTPUT_FOLDER}/12-rewritten-test-ideas.md`

WAIT for the agent to complete.

## Success Criteria
- [ ] qe-test-idea-rewriter spawned and completed
- [ ] All test ideas transformed
- [ ] Output saved to correct path

## Output
Transformed test ideas for final report.

## Navigation
- On success: proceed to Step 9 by reading `steps/09-final-output.md`
- On failure: retry the transformation agent
