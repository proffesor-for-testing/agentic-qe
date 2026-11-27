# Step 7: Store Learnings & Persist State

## Prerequisites
- Step 6 completed

## Instructions

### ALWAYS RUN. NOT OPTIONAL.

Store verification findings to memory:

```bash
aqe memory store \
  --key "qcsd-cicd-${buildId}-${Date.now()}" \
  --namespace "qcsd-cicd" \
  --value '{...}' \
  --json
```

Save persistence record to `${OUTPUT_FOLDER}/11-learning-persistence.json`.

## Success Criteria
- [ ] Memory stored
- [ ] Persistence JSON saved

## Navigation
- On success: proceed to Step 8 by reading `steps/08-deployment-advisor.md`
