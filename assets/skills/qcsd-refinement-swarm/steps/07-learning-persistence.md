# Step 7: Store Learnings & Persist State

## Prerequisites
- Step 6 completed
- All metrics and flags available

## Instructions

### ENFORCEMENT: ALWAYS RUN. NOT OPTIONAL.

Store refinement findings to memory for cross-phase feedback:

**Step 1: Store to memory**

```bash
aqe memory store \
  --key "qcsd-refinement-${storyId}-${Date.now()}" \
  --namespace "qcsd-refinement" \
  --value '{...}' \
  --json
```

**Step 2: Share learnings**

```bash
aqe memory share \
  --from "qcsd-refinement-swarm" \
  --to "qe-test-idea-rewriter" \
  --domain "refinement-test-patterns" \
  --content '{...}' --json
```

**Step 3: Save persistence record**

Save to `${OUTPUT_FOLDER}/11-learning-persistence.json` with complete metrics, flags, and cross-phase signals.

### Fallback: CLI commands if MCP unavailable.

## Success Criteria
- [ ] Memory store executed with actual values
- [ ] Learning persistence JSON saved
- [ ] Cross-phase signals documented

## Output
Confirmation of persistence.

## Navigation
- On success: proceed to Step 8 by reading `steps/08-transformation.md`
- On failure: retry persistence
