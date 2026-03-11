# Step 7: Store Learnings & Persist State

## Prerequisites
- Step 6 completed
- All metrics and flags available

## Instructions

### ENFORCEMENT: ALWAYS RUN. NOT OPTIONAL.

Store refinement findings to memory for cross-phase feedback:

**Step 1: Store to memory**

```javascript
mcp__agentic-qe__memory_store({
  key: `qcsd-refinement-${storyId}-${Date.now()}`,
  namespace: "qcsd-refinement",
  value: {
    storyId, recommendation, testabilityScore,
    investScore, sfdipotPriorities, bddScenarioCount,
    flags, agentsInvoked, timestamp
  }
})
```

**Step 2: Share learnings**

```javascript
mcp__agentic-qe__memory_share({
  sourceAgentId: "qcsd-refinement-swarm",
  targetAgentIds: ["qe-test-idea-rewriter"],
  knowledgeDomain: "refinement-test-patterns"
})
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
