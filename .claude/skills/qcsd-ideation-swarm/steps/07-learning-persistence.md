# Step 7: Store Learnings & Persist State

## Prerequisites
- Step 6 completed

## Instructions

### ALWAYS RUN.

Store ideation findings:
```javascript
mcp__agentic-qe__memory_store({
  key: `qcsd-ideation-${epicId}-${Date.now()}`,
  namespace: "qcsd-ideation",
  value: { recommendation, testabilityScore, riskCount, qualityCriteriaCount, flags, timestamp }
})
```

Save to `${OUTPUT_FOLDER}/11-learning-persistence.json`.

### Follow-up Recommendations

If HAS_VIDEO is TRUE, output a prominent box recommending `/a11y-ally` for video caption generation.

## Success Criteria
- [ ] Persistence completed

## Navigation
- On success: proceed to Step 8 by reading `steps/08-final-output.md`
