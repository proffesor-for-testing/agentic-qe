# Step 7: Store Learnings & Persist State

## Prerequisites
- Step 6 completed

## Instructions

### ALWAYS RUN.

Store ideation findings:
```bash
aqe memory store \
  --key "qcsd-ideation-${epicId}-${Date.now()}" \
  --namespace "qcsd-ideation" \
  --value '{...}' \
  --json
```

Save to `${OUTPUT_FOLDER}/11-learning-persistence.json`.

### Follow-up Recommendations

If HAS_VIDEO is TRUE, output a prominent box recommending `/a11y-ally` for video caption generation.

## Success Criteria
- [ ] Persistence completed

## Navigation
- On success: proceed to Step 8 by reading `steps/08-final-output.md`
