# Skill Validation Guide

> ADR-056: Trust But Verify - Ensuring skill outputs are deterministic and trustworthy

## Overview

AQE v3.4.2 introduces a 4-layer skill validation system with **trust tiers** that let you know how reliable each skill's output is.

## Trust Tiers

| Tier | Badge | Description | Skills |
|------|-------|-------------|--------|
| **Tier 3 - Verified** | ![Tier 3](https://img.shields.io/badge/Tier%203-Verified-brightgreen) | Full evaluation test suite | 46 |
| **Tier 2 - Validated** | ![Tier 2](https://img.shields.io/badge/Tier%202-Validated-green) | Has executable validator | 7 |
| **Tier 1 - Structured** | ![Tier 1](https://img.shields.io/badge/Tier%201-Structured-yellow) | Has JSON output schema | 5 |
| **Tier 0 - Advisory** | ![Tier 0](https://img.shields.io/badge/Tier%200-Advisory-lightgrey) | SKILL.md guidance only | 39 |

**Total: 97 skills**

## Quick Start

### Check Skill Trust Tier

```bash
# View skill validation status
aqe eval status --skill security-testing

# Output:
# Skill: security-testing
# Trust Tier: 3 (Verified)
# Schema: ✓ schemas/output.json
# Validator: ✓ scripts/validate-skill.cjs
# Eval Suite: ✓ evals/security-testing.yaml (8 test cases)
```

### Run Skill Evaluation

```bash
# Run evaluation for a single skill
aqe eval run --skill security-testing --model claude-sonnet-4

# Run evaluations for all Tier 3 skills
aqe eval run-all --skills-tier 3 --models "claude-sonnet-4,claude-haiku"

# Generate evaluation report
aqe eval report --skill security-testing --format markdown
```

### Validate Skill Output

```bash
# Validate output against schema
cd .claude/skills/security-testing
node scripts/validate-skill.cjs output.json

# Output: PASS: All validations passed
```

### Generate Validation Reports

```bash
# Aggregate results from multiple runs
aqe skill report --input results/ --output validation-report.md

# Quick summary
aqe skill summary --input results/

# Compare runs for regression detection
aqe skill compare --current results/ --baseline .baseline/ --threshold 0.05
```

## Tier 3 Skills (Verified)

These skills have complete validation infrastructure and are recommended for production use:

### Testing Methodologies
- `api-testing-patterns` - API testing with contract validation
- `contract-testing` - Consumer-driven contract testing
- `risk-based-testing` - Risk-prioritized testing
- `shift-left-testing` / `shift-right-testing` - Testing strategy
- `test-automation-strategy` - Automation framework design
- `testability-scoring` - Code testability assessment

### Specialized Testing
- `security-testing` - OWASP vulnerability scanning
- `accessibility-testing` - WCAG 2.2 compliance
- `performance-testing` - Load and stress testing
- `chaos-engineering-resilience` - Fault injection
- `database-testing` - Data integrity validation
- `mutation-testing` - Test quality assessment
- `visual-testing-advanced` - Visual regression

### QE Domains
- `qe-test-generation` - AI-powered test creation
- `qe-test-execution` - Parallel test execution
- `qe-coverage-analysis` - O(log n) gap detection
- `qe-quality-assessment` - Quality gates
- `qe-security-compliance` - Security auditing
- `qe-code-intelligence` - Knowledge graph analysis

[Full list: `.claude/skills/TRUST-TIERS.md`]

## Validation Architecture

```
┌─────────────────────────────────────────────────────┐
│ Layer 0: SKILL.md (Intent)                          │
│ - Human-readable instructions                       │
├─────────────────────────────────────────────────────┤
│ Layer 1: schemas/output.json (Structure)            │
│ - JSON Schema validation                            │
├─────────────────────────────────────────────────────┤
│ Layer 2: scripts/validate-skill.cjs (Correctness)          │
│ - Deterministic output verification                 │
├─────────────────────────────────────────────────────┤
│ Layer 3: evals/*.yaml (Behavior)                    │
│ - Test cases with expected behaviors                │
└─────────────────────────────────────────────────────┘
```

## For Skill Authors

### Upgrade Skill to Higher Tier

**Tier 0 → Tier 1 (Add Schema):**
```bash
# Create schema
mkdir -p .claude/skills/my-skill/schemas
# Copy template and customize
cp .claude/skills/.validation/templates/skill-output.template.json \
   .claude/skills/my-skill/schemas/output.json
```

**Tier 1 → Tier 2 (Add Validator):**
```bash
mkdir -p .claude/skills/my-skill/scripts
cp .claude/skills/.validation/templates/validate.template.sh \
   .claude/skills/my-skill/scripts/validate-skill.cjs
chmod +x .claude/skills/my-skill/scripts/validate-skill.cjs
```

**Tier 2 → Tier 3 (Add Evals):**
```bash
mkdir -p .claude/skills/my-skill/evals
cp .claude/skills/.validation/templates/eval.template.yaml \
   .claude/skills/my-skill/evals/my-skill.yaml
```

### Update Skill Frontmatter

Add trust tier to your SKILL.md:

```yaml
---
trust_tier: 3
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
  eval_path: evals/my-skill.yaml
---
```

### Run Manifest Update

```bash
npx tsx scripts/update-skill-manifest.ts
```

## CI Integration

Add to your GitHub Actions workflow:

```yaml
- name: Validate Skills
  run: |
    aqe eval run-all --skills-tier 3 --output results/
    aqe skill report --input results/ --output skill-validation.md

- name: Check for Regressions
  run: |
    aqe skill compare --current results/ --baseline .baseline/ --threshold 0.05
```

## Related Documentation

- [ADR-056: Skill Validation System](../v3/implementation/adrs/ADR-056-skill-validation-system.md)
- [Trust Tier Badges](../.claude/skills/TRUST-TIERS.md)
- [Validation Infrastructure README](../.claude/skills/.validation/README.md)

---

*Part of AQE v3.4.2 - Trust But Verify*
