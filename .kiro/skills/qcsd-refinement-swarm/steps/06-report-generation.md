# Step 6: Generate Refinement Report

## Prerequisites
- Step 5 completed with FINAL RECOMMENDATION
- All agent reports available

## Instructions

Generate the complete Refinement Report and save to `${OUTPUT_FOLDER}/01-executive-summary.md`.

The report MUST include:
1. Executive Summary with recommendation and key metrics
2. SFDIPOT Product Factors Analysis (from qe-product-factors-assessor)
3. BDD Scenarios (from qe-bdd-generator)
4. Requirements Validation (from qe-requirements-validator)
5. Conditional Analysis sections (for each conditional agent that ran)
6. Recommended Actions (P0/P1/P2 prioritized)
7. Test Strategy Summary

### Report Validation Checklist

```
+-- Executive Summary is complete with all metrics
+-- Recommendation matches decision logic
+-- SFDIPOT section covers all 7 factors
+-- BDD section includes all generated scenarios
+-- Requirements section includes INVEST scores
+-- Conditional sections present for all spawned agents
+-- Actions are specific and actionable
+-- Report saved to output folder
```

## Success Criteria
- [ ] Complete report with all sections
- [ ] Report saved to correct path

## Output
Confirmation that report is saved.

## Navigation
- On success: proceed to Step 7 by reading `steps/07-learning-persistence.md`
- On failure: complete missing sections
