# Trust Tier Badges

> Generated: 2026-02-02T10:30:07.656Z
> Policy: ADR-056 - Trust But Verify

## Overview

![Tier 3 (Verified)](https://img.shields.io/badge/Tier%203%20(Verified)-46-brightgreen)
![Tier 2 (Validated)](https://img.shields.io/badge/Tier%202%20(Validated)-7-green)
![Tier 1 (Structured)](https://img.shields.io/badge/Tier%201%20(Structured)-5-yellow)
![Tier 0 (Advisory)](https://img.shields.io/badge/Tier%200%20(Advisory)-39-lightgrey)

**Total Skills**: 97

## Trust Tier Distribution

| Tier | Count | Description |
|------|-------|-------------|
| 3 - Verified | 46 | Full evaluation test suite |
| 2 - Validated | 7 | Has executable validator |
| 1 - Structured | 5 | Has JSON output schema |
| 0 - Advisory | 39 | SKILL.md only |

## Validation Status

| Status | Count |
|--------|-------|
| Passing | 46 |
| Failing | 0 |
| Unknown | 12 |
| Skipped | 39 |

---

## Tier 3 Skills (Fully Verified)

These skills have complete validation infrastructure: JSON schema, validator script, and evaluation test suite.

| Skill | Category | Schema | Validator | Eval Suite | Status |
|-------|----------|--------|-----------|------------|--------|
| a11y-ally | specialized-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/a11y-ally.yaml` | Passing |
| accessibility-testing | specialized-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/accessibility-testing.yaml` | Passing |
| api-testing-patterns | testing-methodologies | `schemas/output.json` | `scripts/validate.sh` | `evals/api-testing-patterns.yaml` | Passing |
| chaos-engineering-resilience | specialized-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/chaos-engineering-resilience.yaml` | Passing |
| cicd-pipeline-qe-orchestrator | infrastructure | `schemas/output.json` | `scripts/validate.sh` | `evals/cicd-pipeline-qe-orchestrator.yaml` | Passing |
| compatibility-testing | specialized-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/compatibility-testing.yaml` | Passing |
| compliance-testing | specialized-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/compliance-testing.yaml` | Passing |
| contract-testing | testing-methodologies | `schemas/output.json` | `scripts/validate.sh` | `evals/contract-testing.yaml` | Passing |
| database-testing | specialized-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/database-testing.yaml` | Passing |
| localization-testing | specialized-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/localization-testing.yaml` | Passing |
| mobile-testing | specialized-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/mobile-testing.yaml` | Passing |
| mutation-testing | specialized-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/mutation-testing.yaml` | Passing |
| n8n-expression-testing | n8n-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/n8n-expression-testing.yaml` | Passing |
| n8n-integration-testing-patterns | n8n-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/n8n-integration-testing-patterns.yaml` | Passing |
| n8n-security-testing | n8n-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/n8n-security-testing.yaml` | Passing |
| n8n-trigger-testing-strategies | n8n-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/n8n-trigger-testing-strategies.yaml` | Passing |
| n8n-workflow-testing-fundamentals | n8n-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/n8n-workflow-testing-fundamentals.yaml` | Passing |
| performance-analysis | monitoring | `schemas/output.json` | `scripts/validate.sh` | `evals/performance-analysis.yaml` | Passing |
| performance-testing | specialized-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/performance-testing.yaml` | Passing |
| qcsd-ideation-swarm | qcsd-phases | `schemas/output.json` | `scripts/validate.sh` | `evals/qcsd-ideation-swarm.yaml` | Passing |
| qe-chaos-resilience | - | `schemas/output.json` | `scripts/validate.sh` | `evals/qe-chaos-resilience.yaml` | Passing |
| qe-code-intelligence | - | `schemas/output.json` | `scripts/validate.sh` | `evals/qe-code-intelligence.yaml` | Passing |
| qe-contract-testing | - | `schemas/output.json` | `scripts/validate.sh` | `evals/qe-contract-testing.yaml` | Passing |
| qe-coverage-analysis | - | `schemas/output.json` | `scripts/validate.sh` | `evals/qe-coverage-analysis.yaml` | Passing |
| qe-defect-intelligence | - | `schemas/output.json` | `scripts/validate.sh` | `evals/qe-defect-intelligence.yaml` | Passing |
| qe-learning-optimization | - | `schemas/output.json` | `scripts/validate.sh` | `evals/qe-learning-optimization.yaml` | Passing |
| qe-quality-assessment | - | `schemas/output.json` | `scripts/validate.sh` | `evals/qe-quality-assessment.yaml` | Passing |
| qe-requirements-validation | - | `schemas/output.json` | `scripts/validate.sh` | `evals/qe-requirements-validation.yaml` | Passing |
| qe-security-compliance | - | `schemas/output.json` | `scripts/validate.sh` | `evals/qe-security-compliance.yaml` | Passing |
| qe-test-execution | - | `schemas/output.json` | `scripts/validate.sh` | `evals/qe-test-execution.yaml` | Passing |
| qe-test-generation | - | `schemas/output.json` | `scripts/validate.sh` | `evals/qe-test-generation.yaml` | Passing |
| qe-visual-accessibility | - | `schemas/output.json` | `scripts/validate.sh` | `evals/qe-visual-accessibility.yaml` | Passing |
| quality-metrics | testing-methodologies | `schemas/output.json` | `scripts/validate.sh` | `evals/quality-metrics.yaml` | Passing |
| regression-testing | specialized-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/regression-testing.yaml` | Passing |
| risk-based-testing | testing-methodologies | `schemas/output.json` | `scripts/validate.sh` | `evals/risk-based-testing.yaml` | Passing |
| security-testing | specialized-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/security-testing.yaml` | Passing |
| security-visual-testing | specialized-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/security-visual-testing.yaml` | Passing |
| shift-left-testing | testing-methodologies | `schemas/output.json` | `scripts/validate.sh` | `evals/shift-left-testing.yaml` | Passing |
| shift-right-testing | testing-methodologies | `schemas/output.json` | `scripts/validate.sh` | `evals/shift-right-testing.yaml` | Passing |
| test-automation-strategy | testing-methodologies | `schemas/output.json` | `scripts/validate.sh` | `evals/test-automation-strategy.yaml` | Passing |
| test-data-management | specialized-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/test-data-management.yaml` | Passing |
| test-design-techniques | specialized-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/test-design-techniques.yaml` | Passing |
| test-reporting-analytics | analytics | `schemas/output.json` | `scripts/validate.sh` | `evals/test-reporting-analytics.yaml` | Passing |
| testability-scoring | testing-methodologies | `schemas/output.json` | `scripts/validate.sh` | `evals/testability-scoring.yaml` | Passing |
| verification-quality | quality-assurance | `schemas/output.json` | `scripts/validate.sh` | `evals/verification-quality.yaml` | Passing |
| visual-testing-advanced | specialized-testing | `schemas/output.json` | `scripts/validate.sh` | `evals/visual-testing-advanced.yaml` | Passing |

---

## Tier 2 Skills (Validated)

These skills have a validator script but no evaluation test suite yet.

| Skill | Category | Schema | Validator | Status |
|-------|----------|--------|-----------|--------|
| brutal-honesty-review | quality-review | `schemas/output.json` | `scripts/validate.sh` | Unknown |
| bug-reporting-excellence | quality-communication | `schemas/output.json` | `scripts/validate.sh` | Unknown |
| code-review-quality | development-practices | `schemas/output.json` | `scripts/validate.sh` | Unknown |
| qe-iterative-loop | - | `schemas/output.json` | `scripts/validate.sh` | Unknown |
| refactoring-patterns | development-practices | `schemas/output.json` | `scripts/validate.sh` | Unknown |
| sherlock-review | quality-review | `schemas/output.json` | `scripts/validate.sh` | Unknown |
| tdd-london-chicago | development-practices | `schemas/output.json` | `scripts/validate.sh` | Unknown |

---

## Tier 1 Skills (Structured)

These skills have a JSON output schema but no validator yet.

| Skill | Category | Schema |
|-------|----------|--------|
| agentic-quality-engineering | qe-core | `schemas/output.json` |
| aqe-v2-v3-migration | - | `schemas/output.json` |
| consultancy-practices | professional-practice | `schemas/output.json` |
| technical-writing | communication | `schemas/output.json` |
| test-environment-management | specialized-testing | `schemas/output.json` |

---

## Upgrading Skills

To upgrade a skill to a higher trust tier:

### Tier 0 -> Tier 1 (Add Schema)
1. Create `{skill}/schemas/output.json` with JSON Schema
2. Add `trust_tier: 1` to frontmatter
3. Run `npx tsx scripts/update-skill-manifest.ts`

### Tier 1 -> Tier 2 (Add Validator)
1. Create `{skill}/scripts/validate.sh` (or .ts/.js)
2. Add `trust_tier: 2` and validation paths to frontmatter
3. Run `npx tsx scripts/update-skill-manifest.ts`

### Tier 2 -> Tier 3 (Add Evals)
1. Create `{skill}/evals/{skill}.yaml` with test cases
2. Add `trust_tier: 3` and eval_path to frontmatter
3. Run `npx tsx scripts/update-skill-manifest.ts`

---

## CI Integration

Add this to your GitHub Actions workflow:

```yaml
- name: Validate Skill Manifest
  run: npx tsx scripts/update-skill-manifest.ts --dry-run

- name: Check Tier 3 Skills Pass
  run: |
    for skill in api-testing-patterns security-testing performance-testing; do
      .claude/skills/$skill/scripts/validate.sh --self-test
    done
```

---

*Generated by update-skill-manifest.ts per ADR-056*
