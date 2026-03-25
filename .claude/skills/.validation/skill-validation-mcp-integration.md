# Skill Validation MCP Integration Specification

**Version**: 1.0.0
**Created**: 2026-02-02
**Status**: Active

## Overview

All skill validation components MUST use AQE MCP tool calls for shared learning. This ensures validation patterns, outcomes, and insights are stored in the ReasoningBank and shared across the QE agent fleet.

## Required MCP Tool Calls

### 1. Pattern Storage

Skills MUST store successful validation patterns for future reference:

```bash
// After successful validation
aqe memory store \
  --key "skill-validation-${skillName}-${timestamp}" \
  --namespace "skill-validation" \
  --value '{...}' \
  --json
```

### 2. Pattern Query

Before validation, query for existing patterns:

```bash
// Query learned patterns
const existingPatterns = await aqe memory search --pattern "*" --namespace "skill-validation" --limit 10 --json

// Use patterns to inform validation expectations
```

### 3. Outcome Tracking

Track all validation outcomes for the learning feedback loop:

```bash
// Record validation outcome
aqe hooks post-task --json
```

### 4. Cross-Agent Learning Share

Share validation insights with the learning coordinator:

```bash
// Share learning with fleet
aqe memory share \
  --from "unknown" \
  --to "qe-learning-coordinator,qe-queen-coordinator" \
  --domain "skill-validation" \
  --content '{...}' --json
```

### 5. Quality Gate Integration

Update skill quality scores via quality assessment:

```bash
// After validation completes
aqe quality --json
```

## Memory Namespace Structure

```
aqe/skill-validation/
├── patterns/
│   ├── security-testing/*       - Security validation patterns
│   ├── accessibility-testing/*  - A11y validation patterns
│   └── {skill-name}/*          - Per-skill patterns
├── outcomes/
│   ├── by-skill/               - Outcomes grouped by skill
│   ├── by-model/               - Outcomes grouped by model
│   └── by-date/                - Outcomes grouped by date
├── insights/
│   ├── cross-model/            - Cross-model behavior differences
│   ├── regressions/            - Detected regressions
│   └── improvements/           - Improvement recommendations
└── confidence/
    └── {skill-name}/           - Confidence scores per skill
```

## Eval Runner Integration

The `scripts/run-skill-eval.ts` evaluation runner MUST:

1. **Before running evals**: Query ReasoningBank for learned patterns
2. **During evals**: Track each test case outcome
3. **After evals**: Store patterns and share learning
4. **On regression**: Alert via quality gate

```bash
// Evaluation runner pseudocode
async function runSkillEval(skill: string, model: string) {
  // 1. Query existing patterns
  const patterns = await aqe memory search --pattern "*" --namespace "skill-validation" --json;

  // 2. Run evaluation test cases
  const results = await runTestCases(skill, model, patterns);

  // 3. Track outcomes
  for (const result of results) {
    await aqe hooks post-task --json;
  }

  // 4. Store new patterns
  await aqe memory store \
  --key "skill-validation-${skill}-${Date.now()}" \
  --namespace "skill-validation" \
  --value '{...}' \
  --json;

  // 5. Share learning
  aqe memory share \
    --from "eval-runner" \
    --to "qe-learning-coordinator" \
    --domain "skill-validation" \
    --content '{"data": "summarized results"}' --json;

  // 6. Update quality gate
  await aqe quality --json;

  return results;
}
```

## Validator Script Integration

Bash validators should call the MCP tools via the CLI wrapper:

```bash
# In validate-skill.cjs after validation
store_validation_result() {
  local skill="$1"
  local result="$2"

  npx aqe memory store \
    --key "skill-validation-${skill}-$(date +%s)" \
    --value "$result" \
    --namespace skill-validation
}

track_outcome() {
  local test_id="$1"
  local passed="$2"

  npx aqe feedback track \
    --test-id "$test_id" \
    --passed "$passed"
}
```

## CI Pipeline Integration

GitHub Actions workflow MUST use MCP tools:

```yaml
- name: Query Baseline Patterns
  run: |
    npx aqe memory query \
      --pattern "skill-validation-${{ matrix.skill }}-*" \
      --namespace skill-validation \
      --limit 5 \
      --output baseline-patterns.json

- name: Run Validation
  run: |
    npx ts-node scripts/run-skill-eval.ts \
      --skill "${{ matrix.skill }}" \
      --model "${{ matrix.model }}" \
      --use-mcp-learning

- name: Share Results with Fleet
  run: |
    npx aqe memory share \
      --source "ci-validator" \
      --targets "qe-learning-coordinator" \
      --domain "skill-validation" \
      --data-file validation-results.json
```

## Success Criteria

- [ ] All validators call `memory_store` after validation
- [ ] Eval runner queries patterns before running
- [ ] Outcomes tracked via `test_outcome_track`
- [ ] Learning shared with coordinator
- [ ] Quality gate updated with validation metrics
- [ ] CI pipeline uses MCP tools for learning

## References

- [ADR-056: Deterministic Skill Validation System](../v3/implementation/adrs/ADR-056-skill-validation-system.md)
- [ADR-021: QE ReasoningBank](../v3/implementation/adrs/v3-adrs.md#adr-021)
- [ADR-023: Quality Feedback Loop](../v3/implementation/adrs/v3-adrs.md#adr-023)
- [AQE MCP Tools Reference](../reference/aqe-fleet.md)
