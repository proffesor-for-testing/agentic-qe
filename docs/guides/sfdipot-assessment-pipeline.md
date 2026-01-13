# SFDIPOT Assessment Pipeline

A three-stage pipeline for generating high-quality Product Factors assessments that pass all quality gates.

## Why a Pipeline?

Single-agent generation struggles with attention dilution: 500+ lines of instructions compete for attention when generating 100+ test ideas. The pipeline separates concerns:

| Stage | Agent | Focus |
|-------|-------|-------|
| 1. Generate | `qe-product-factors-assessor` | Test coverage across SFDIPOT |
| 2. Rewrite | `qe-test-idea-rewriter` (or `coder`) | Transform "Verify" patterns |
| 3. Validate | `validate-sfdipot-assessment.ts` | Enforce quality gates |

## Pipeline Execution

### Stage 1: Generate Assessment

```javascript
Task("Generate assessment", `
  Generate SFDIPOT Product Factors assessment for:
  [Epic/Feature description]

  Output: .agentic-qe/product-factors-assessments/[name].html
`, "qe-product-factors-assessor")
```

The generator focuses on coverage - getting test ideas for all 28 SFDIPOT subcategories.

### Stage 2: Rewrite Test Ideas

```javascript
Task("Rewrite test ideas", `
  Read [assessment].html and transform ALL test ideas starting with "Verify"
  to use action verbs. Save to [assessment]-final.html.

  Pattern: "[ACTION] [trigger]; [OUTCOME] [observable result]"
`, "coder")
```

The rewriter has ONE job: eliminate "Verify" patterns. Small attention space = high success rate.

### Stage 3: Validate Output

```bash
npx tsx scripts/validate-sfdipot-assessment.ts [assessment]-final.html
```

The validator checks 8 quality gates:
- Gate 7: NO "Verify X" patterns (HARD)
- Gate 1: P0 = 8-12%
- Gate 2: P1 ≤ 30% (HARD)
- Gate 3: P2 = 35-45%
- Gate 4: P3 = 20-30%
- Gate 5: Human ≥ 10% (HARD)
- Gate 10a: Human tests have reasoning
- Gate 10b: Human test ideas use "Explore X; assess Y"

## Automatic Validation via Hook

The PostToolUse hook in `.claude/settings.json` automatically runs validation when writing to the `product-factors-assessments` directory:

```json
{
  "matcher": "Write",
  "hooks": [{
    "type": "command",
    "command": "bash scripts/hooks/validate-sfdipot-on-write.sh \"$TOOL_INPUT_file_path\""
  }]
}
```

## Results Comparison

| Version | Pipeline | Verify Count | Result |
|---------|----------|--------------|--------|
| V10 | Single agent | 90 | ❌ FAIL |
| V11 | Single agent + hand-holding | 0 | ✅ PASS |
| V12 | Single agent (no hand-holding) | 28 | ❌ FAIL |
| V13 | V12 + Rewriter | 0 | ✅ PASS |

## When to Use the Pipeline

**Use 3-stage pipeline when:**
- Generating new assessments
- Assessment fails Gate 7 (Verify patterns)
- Consistent quality required

**Single agent is fine when:**
- Operator provides detailed Task prompt (hand-holding)
- Quick iteration on specific sections

## Files

- **Generator**: `.claude/agents/qe-product-factors-assessor.md`
- **Rewriter**: `.claude/agents/qe-test-idea-rewriter.md`
- **Validator**: `scripts/validate-sfdipot-assessment.ts`
- **Hook**: `scripts/hooks/validate-sfdipot-on-write.sh`
