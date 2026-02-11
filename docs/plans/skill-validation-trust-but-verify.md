# GOAP Implementation Plan: Trust But Verify Skill Validation System

**Version**: 1.0.0
**Created**: 2026-02-02
**Author**: QE Architecture Team
**Status**: Planning

## Executive Summary

This plan implements a 4-layer "Trust But Verify" validation system for AQE skills, transforming 93.7% declarative-only skills into machine-verifiable, testable components that integrate with the ReasoningBank learning system.

```
Current State                          Goal State
--------------                         ----------
93.7% declarative (SKILL.md only)  ->  100% with JSON schemas (Level 1)
6.3% with validators (4 skills)    ->  100% P0 skills with validators (Level 2)
0% with evaluation suites          ->  P0 skills with eval suites (Level 3)
0% CI pipeline validation          ->  Multi-model CI validation pipeline
```

## Architecture Overview

```
+-----------------------------------------------------------+
|  Level 3: Evaluation Suite (evals/*.yaml)                 |
|  - Test cases with expected outputs                        |
|  - Multi-model behavior comparison                         |
|  - Success criteria verification                           |
+-----------------------------------------------------------+
|  Level 2: Executable Validator (scripts/validate-skill.cjs)      |
|  - Runtime output verification                             |
|  - Tool availability checks                                |
|  - Graceful degradation                                    |
+-----------------------------------------------------------+
|  Level 1: JSON Schema (schemas/output.json)               |
|  - Structured output definition                            |
|  - Required fields specification                           |
|  - Type validation                                         |
+-----------------------------------------------------------+
|  Level 0: SKILL.md Instructions (existing)                |
|  - Guidance intent                                         |
|  - Best practices                                          |
|  - Agent coordination hints                                |
+-----------------------------------------------------------+
```

---

## SPARC-GOAP Milestone Plan

### Phase 1: Foundation (SPECIFICATION)

#### Milestone 1.1: Define Trust Tier Schema
**Description**: Create YAML frontmatter extension for trust tiers
**Complexity**: Low
**Estimated Hours**: 4
**Agent Assignment**: qe-test-architect
**Dependencies**: None
**Parallel Opportunity**: Yes (can run with 1.2, 1.3)

**Deliverables**:
- `docs/schemas/skill-frontmatter.schema.json` - JSON Schema for SKILL.md frontmatter
- Updated SKILL.md template with trust_tier fields

**Success Criteria**:
- [ ] Schema validates all existing skills
- [ ] Schema defines trust_tier: 0-3
- [ ] Schema defines validation block (schema_path, validator_path, eval_path)
- [ ] Schema integrated with skill-builder skill

**Trust Tier Frontmatter Extension**:
```yaml
---
name: security-testing
trust_tier: 2
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
  eval_path: evals/security-testing.yaml
  last_validated: 2026-02-02
  validation_status: passing
---
```

---

#### Milestone 1.2: Create Output Schema Template
**Description**: Define JSON Schema template for skill outputs
**Complexity**: Low
**Estimated Hours**: 4
**Agent Assignment**: qe-api-contract-validator
**Dependencies**: None
**Parallel Opportunity**: Yes (can run with 1.1, 1.3)

**Deliverables**:
- `docs/schemas/skill-output.template.json` - Template schema
- `docs/schemas/skill-output-meta.schema.json` - Meta-schema for validation

**Success Criteria**:
- [ ] Template covers common output types (report, findings, recommendations)
- [ ] Template includes required metadata fields
- [ ] Template validates against JSON Schema Draft 2020-12
- [ ] Example outputs for testability-scoring pass validation

**Output Schema Template**:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "skill-output-template",
  "type": "object",
  "required": ["skillName", "version", "timestamp", "status", "output"],
  "properties": {
    "skillName": { "type": "string" },
    "version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "timestamp": { "type": "string", "format": "date-time" },
    "status": { "enum": ["success", "partial", "failed", "skipped"] },
    "trustTier": { "type": "integer", "minimum": 0, "maximum": 3 },
    "output": { "type": "object" },
    "metadata": {
      "type": "object",
      "properties": {
        "executionTimeMs": { "type": "integer" },
        "toolsUsed": { "type": "array", "items": { "type": "string" } },
        "agentId": { "type": "string" }
      }
    }
  }
}
```

---

#### Milestone 1.3: Create Validator Script Template
**Description**: Define bash validator template with graceful degradation
**Complexity**: Medium
**Estimated Hours**: 6
**Agent Assignment**: qe-test-generator
**Dependencies**: None
**Parallel Opportunity**: Yes (can run with 1.1, 1.2)

**Deliverables**:
- `docs/templates/validate.template.sh` - Validator script template
- `docs/templates/validator-lib.cjs` - Shared validation functions

**Success Criteria**:
- [ ] Template includes tool availability checks
- [ ] Template provides graceful fallbacks
- [ ] Template outputs JSON-formatted results
- [ ] Template integrates with CI exit codes (0=pass, 1=fail, 2=skip)

**Validator Template Structure**:
```bash
#!/bin/bash
# Skill Validator Template
# Usage: node validate-skill.cjs <output-file> [options]

set -euo pipefail

# Source shared library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
const validatorLib = require("../../../docs/templates/validator-lib.cjs");

# =============================================================================
# Configuration
# =============================================================================
SKILL_NAME="skill-name"
REQUIRED_TOOLS=("tool1" "tool2")
OPTIONAL_TOOLS=("tool3")
SCHEMA_PATH="$SCRIPT_DIR/../schemas/output.json"

# =============================================================================
# Tool Availability Checks
# =============================================================================
check_required_tools() {
  for tool in "${REQUIRED_TOOLS[@]}"; do
    if ! command_exists "$tool"; then
      warn "Required tool missing: $tool"
      return 1
    fi
  done
  return 0
}

check_optional_tools() {
  local available=()
  for tool in "${OPTIONAL_TOOLS[@]}"; do
    if command_exists "$tool"; then
      available+=("$tool")
    fi
  done
  echo "${available[@]}"
}

# =============================================================================
# Validation Functions
# =============================================================================
validate_schema() {
  local output_file="$1"
  if command_exists "ajv"; then
    ajv validate -s "$SCHEMA_PATH" -d "$output_file"
  elif command_exists "jsonschema"; then
    jsonschema -i "$output_file" "$SCHEMA_PATH"
  else
    warn "No JSON Schema validator available, skipping schema validation"
    return 2  # Skip
  fi
}

validate_content() {
  local output_file="$1"
  # Skill-specific validation logic here
  return 0
}

# =============================================================================
# Main
# =============================================================================
main() {
  local output_file="${1:-}"

  if [[ -z "$output_file" ]]; then
    error "Usage: $0 <output-file>"
    exit 1
  fi

  info "Validating $SKILL_NAME output: $output_file"

  # Check tools
  if ! check_required_tools; then
    warn "Missing required tools, validation skipped"
    output_result "skipped" "Missing required tools"
    exit 2
  fi

  # Validate schema
  local schema_result
  schema_result=$(validate_schema "$output_file" 2>&1) || {
    case $? in
      1) error "Schema validation failed: $schema_result"; exit 1 ;;
      2) warn "Schema validation skipped" ;;
    esac
  }

  # Validate content
  if ! validate_content "$output_file"; then
    error "Content validation failed"
    exit 1
  fi

  success "Validation passed"
  output_result "passed" "All validations successful"
  exit 0
}

main "$@"
```

---

#### Milestone 1.4: Create Evaluation Framework
**Description**: Define YAML-based evaluation test case format
**Complexity**: Medium
**Estimated Hours**: 8
**Agent Assignment**: qe-quality-analyzer
**Dependencies**: 1.1, 1.2
**Parallel Opportunity**: No (depends on schema definitions)

**Deliverables**:
- `docs/schemas/skill-eval.schema.json` - Evaluation YAML schema
- `docs/templates/eval.template.yaml` - Evaluation template
- `scripts/run-skill-eval.ts` - Evaluation runner

**Success Criteria**:
- [ ] Eval format supports input/expected-output pairs
- [ ] Eval format supports multi-model testing
- [ ] Eval runner integrates with ReasoningBank for learning
- [ ] Eval results feed into QualityFeedbackLoop

**Evaluation Template**:
```yaml
# Skill Evaluation Test Suite
# schema: skill-eval.schema.json

skill: security-testing
version: 1.0.0
models_to_test:
  - claude-3.5-sonnet
  - claude-3-haiku
  - gpt-4o  # Cross-model validation

test_cases:
  - id: tc001_sql_injection_detection
    description: "Detect SQL injection vulnerability in user input"
    category: injection
    priority: critical

    input:
      code: |
        const query = `SELECT * FROM users WHERE id = ${req.params.id}`;
        db.query(query);
      context:
        language: javascript
        framework: express

    expected_output:
      must_contain:
        - "SQL injection"
        - "parameterized query"
        - "prepared statement"
      must_not_contain:
        - "no vulnerabilities"
        - "code is secure"
      severity_classification: critical

    validation:
      schema_check: true
      keyword_match_threshold: 0.8
      reasoning_quality_min: 0.7

  - id: tc002_xss_detection
    description: "Detect XSS vulnerability in HTML output"
    category: injection
    priority: high

    input:
      code: |
        app.get('/profile', (req, res) => {
          res.send(`<h1>Hello ${req.query.name}</h1>`);
        });
      context:
        language: javascript
        framework: express

    expected_output:
      must_contain:
        - "XSS"
        - "cross-site scripting"
        - "sanitize"
        - "escape"
      severity_classification: high

success_criteria:
  pass_rate: 0.9
  critical_pass_rate: 1.0
  avg_reasoning_quality: 0.75
```

---

### Phase 2: P0 Skill Validation (ARCHITECTURE)

#### Milestone 2.1: Security Testing Validation
**Description**: Implement full validation stack for security-testing skill
**Complexity**: High
**Estimated Hours**: 16
**Agent Assignment**: qe-security-scanner
**Dependencies**: 1.1, 1.2, 1.3, 1.4
**Parallel Opportunity**: Yes (can run with 2.2-2.5)

**Deliverables**:
- `.claude/skills/security-testing/schemas/output.json`
- `.claude/skills/security-testing/scripts/validate-skill.cjs`
- `.claude/skills/security-testing/evals/security-testing.yaml`
- Updated SKILL.md with trust_tier: 3

**Success Criteria**:
- [ ] Schema validates OWASP Top 10 findings structure
- [ ] Validator checks for npm audit, semgrep, trivy availability
- [ ] Eval suite covers injection, auth, crypto failures
- [ ] 90%+ pass rate on eval suite with Sonnet

**Memory Namespace**:
```
aqe/skill-validation/security-testing/
├── validation-results/*     - Validation run results
├── eval-outcomes/*          - Evaluation test outcomes
├── patterns/*               - Learned validation patterns
└── model-comparison/*       - Cross-model behavior data
```

---

#### Milestone 2.2: Accessibility Testing Validation
**Description**: Implement full validation stack for accessibility-testing skill
**Complexity**: High
**Estimated Hours**: 16
**Agent Assignment**: qe-visual-tester
**Dependencies**: 1.1, 1.2, 1.3, 1.4
**Parallel Opportunity**: Yes (can run with 2.1, 2.3-2.5)

**Deliverables**:
- `.claude/skills/accessibility-testing/schemas/output.json`
- `.claude/skills/accessibility-testing/scripts/validate-skill.cjs`
- `.claude/skills/accessibility-testing/evals/accessibility-testing.yaml`
- Updated SKILL.md with trust_tier: 3

**Success Criteria**:
- [ ] Schema validates WCAG 2.2 findings structure
- [ ] Validator checks for axe-core, pa11y availability
- [ ] Eval suite covers POUR principles
- [ ] 90%+ pass rate on eval suite

---

#### Milestone 2.3: API Testing Patterns Validation
**Description**: Implement full validation stack for api-testing-patterns skill
**Complexity**: High
**Estimated Hours**: 16
**Agent Assignment**: qe-api-contract-validator
**Dependencies**: 1.1, 1.2, 1.3, 1.4
**Parallel Opportunity**: Yes (can run with 2.1-2.2, 2.4-2.5)

**Deliverables**:
- `.claude/skills/api-testing-patterns/schemas/output.json`
- `.claude/skills/api-testing-patterns/scripts/validate-skill.cjs`
- `.claude/skills/api-testing-patterns/evals/api-testing-patterns.yaml`
- Updated SKILL.md with trust_tier: 3

**Success Criteria**:
- [ ] Schema validates contract, integration, component test structures
- [ ] Validator checks for supertest, pact availability
- [ ] Eval suite covers REST/GraphQL patterns
- [ ] 90%+ pass rate on eval suite

---

#### Milestone 2.4: Compliance Testing Validation
**Description**: Implement full validation stack for compliance-testing skill
**Complexity**: High
**Estimated Hours**: 16
**Agent Assignment**: qe-quality-gate
**Dependencies**: 1.1, 1.2, 1.3, 1.4
**Parallel Opportunity**: Yes (can run with 2.1-2.3, 2.5)

**Deliverables**:
- `.claude/skills/compliance-testing/schemas/output.json`
- `.claude/skills/compliance-testing/scripts/validate-skill.cjs`
- `.claude/skills/compliance-testing/evals/compliance-testing.yaml`
- Updated SKILL.md with trust_tier: 3

**Success Criteria**:
- [ ] Schema validates GDPR, HIPAA, SOC2 findings structure
- [ ] Validator checks compliance rule engines
- [ ] Eval suite covers major compliance frameworks
- [ ] 90%+ pass rate on eval suite

---

#### Milestone 2.5: Mutation Testing Validation
**Description**: Implement full validation stack for mutation-testing skill
**Complexity**: Medium
**Estimated Hours**: 12
**Agent Assignment**: qe-test-generator
**Dependencies**: 1.1, 1.2, 1.3, 1.4
**Parallel Opportunity**: Yes (can run with 2.1-2.4)

**Deliverables**:
- `.claude/skills/mutation-testing/schemas/output.json`
- `.claude/skills/mutation-testing/scripts/validate-skill.cjs`
- `.claude/skills/mutation-testing/evals/mutation-testing.yaml`
- Updated SKILL.md with trust_tier: 3

**Success Criteria**:
- [ ] Schema validates mutation score, survivors structure
- [ ] Validator checks for stryker availability
- [ ] Eval suite covers mutation operators
- [ ] 90%+ pass rate on eval suite

---

### Phase 3: Remaining P0 Skills (REFINEMENT)

#### Milestone 3.1: Performance Testing Validation
**Description**: Implement validation for performance-testing skill
**Complexity**: High
**Estimated Hours**: 14
**Agent Assignment**: qe-performance-tester
**Dependencies**: Phase 2 complete
**Parallel Opportunity**: Yes (batch with 3.2-3.5)

**Deliverables**:
- Full validation stack for performance-testing
- Integration with k6, artillery validation

---

#### Milestone 3.2: Chaos Engineering Validation
**Description**: Implement validation for chaos-engineering-resilience skill
**Complexity**: High
**Estimated Hours**: 14
**Agent Assignment**: qe-chaos-engineer
**Dependencies**: Phase 2 complete
**Parallel Opportunity**: Yes (batch with 3.1, 3.3-3.5)

**Deliverables**:
- Full validation stack for chaos-engineering-resilience
- Integration with chaos monkey, litmus validation

---

#### Milestone 3.3: Database Testing Validation
**Description**: Implement validation for database-testing skill
**Complexity**: Medium
**Estimated Hours**: 12
**Agent Assignment**: qe-test-data-architect
**Dependencies**: Phase 2 complete
**Parallel Opportunity**: Yes (batch with 3.1-3.2, 3.4-3.5)

**Deliverables**:
- Full validation stack for database-testing
- Integration with SQL validation tools

---

#### Milestone 3.4: Contract Testing Validation
**Description**: Implement validation for contract-testing skill
**Complexity**: Medium
**Estimated Hours**: 12
**Agent Assignment**: qe-api-contract-validator
**Dependencies**: Phase 2 complete
**Parallel Opportunity**: Yes (batch with 3.1-3.3, 3.5)

**Deliverables**:
- Full validation stack for contract-testing
- Integration with Pact, Spring Cloud Contract validation

---

#### Milestone 3.5: Extend Testability Scoring
**Description**: Enhance existing testability-scoring with Level 3 evaluation suite
**Complexity**: Low
**Estimated Hours**: 8
**Agent Assignment**: qe-quality-analyzer
**Dependencies**: Phase 2 complete
**Parallel Opportunity**: Yes (batch with 3.1-3.4)

**Deliverables**:
- `.claude/skills/testability-scoring/evals/testability-scoring.yaml`
- Enhanced schema with additional fields
- Updated trust_tier to 3

---

### Phase 4: CI/CD Integration (COMPLETION)

#### Milestone 4.1: GitHub Actions Skill Validation Workflow
**Description**: Create CI workflow for skill validation
**Complexity**: High
**Estimated Hours**: 16
**Agent Assignment**: qe-fleet-commander
**Dependencies**: Phase 3 complete
**Parallel Opportunity**: No (integration point)

**Deliverables**:
- `.github/workflows/skill-validation.yml`
- Matrix testing across models
- PR comment reporting

**Success Criteria**:
- [ ] Workflow runs on skill file changes
- [ ] Matrix tests Claude Sonnet, Haiku, GPT-4o
- [ ] Results posted to PR as comment
- [ ] Validation failures block merge for P0 skills

**Workflow Structure**:
```yaml
name: Skill Validation

on:
  pull_request:
    paths:
      - '.claude/skills/**'
  workflow_dispatch:
    inputs:
      skill:
        description: 'Skill to validate (or "all")'
        required: true
        default: 'all'

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      skills: ${{ steps.detect.outputs.skills }}
    steps:
      - uses: actions/checkout@v4
      - id: detect
        run: |
          if [ "${{ github.event_name }}" == "workflow_dispatch" ]; then
            if [ "${{ inputs.skill }}" == "all" ]; then
              skills=$(ls .claude/skills | jq -R -s -c 'split("\n")[:-1]')
            else
              skills='["${{ inputs.skill }}"]'
            fi
          else
            skills=$(git diff --name-only ${{ github.event.pull_request.base.sha }} \
              | grep '.claude/skills/' \
              | cut -d'/' -f3 \
              | sort -u \
              | jq -R -s -c 'split("\n")[:-1]')
          fi
          echo "skills=$skills" >> $GITHUB_OUTPUT

  validate-schema:
    needs: detect-changes
    runs-on: ubuntu-latest
    strategy:
      matrix:
        skill: ${{ fromJson(needs.detect-changes.outputs.skills) }}
    steps:
      - uses: actions/checkout@v4
      - name: Validate JSON Schema
        run: |
          SCHEMA_PATH=".claude/skills/${{ matrix.skill }}/schemas/output.json"
          if [ -f "$SCHEMA_PATH" ]; then
            npx ajv validate -s docs/schemas/skill-output-meta.schema.json -d "$SCHEMA_PATH"
          else
            echo "No schema found, trust_tier < 1"
          fi

  run-validators:
    needs: [detect-changes, validate-schema]
    runs-on: ubuntu-latest
    strategy:
      matrix:
        skill: ${{ fromJson(needs.detect-changes.outputs.skills) }}
    steps:
      - uses: actions/checkout@v4
      - name: Run Validator
        run: |
          VALIDATOR=".claude/skills/${{ matrix.skill }}/scripts/validate-skill.cjs"
          if [ -f "$VALIDATOR" ]; then
            chmod +x "$VALIDATOR"
            "$VALIDATOR" --self-test || exit $?
          else
            echo "No validator found, trust_tier < 2"
          fi

  run-evals:
    needs: [detect-changes, run-validators]
    runs-on: ubuntu-latest
    strategy:
      matrix:
        skill: ${{ fromJson(needs.detect-changes.outputs.skills) }}
        model: [claude-sonnet, claude-haiku]
    steps:
      - uses: actions/checkout@v4
      - name: Run Evaluation Suite
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          EVAL_PATH=".claude/skills/${{ matrix.skill }}/evals/"
          if [ -d "$EVAL_PATH" ]; then
            npx ts-node scripts/run-skill-eval.ts \
              --skill "${{ matrix.skill }}" \
              --model "${{ matrix.model }}" \
              --output "eval-results-${{ matrix.skill }}-${{ matrix.model }}.json"
          else
            echo "No evals found, trust_tier < 3"
          fi

  report:
    needs: [validate-schema, run-validators, run-evals]
    runs-on: ubuntu-latest
    if: always() && github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - name: Generate Report
        run: npx ts-node scripts/generate-validation-report.ts
      - name: Comment on PR
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = fs.readFileSync('validation-report.md', 'utf8');
            // ... post comment
```

---

#### Milestone 4.2: ReasoningBank Integration
**Description**: Integrate validation results with ReasoningBank learning
**Complexity**: High
**Estimated Hours**: 20
**Agent Assignment**: qe-learning-coordinator
**Dependencies**: 4.1
**Parallel Opportunity**: No (integration point)

**Deliverables**:
- `v3/src/learning/skill-validation-learner.ts`
- Integration with QualityFeedbackLoop
- Pattern storage for validation outcomes

**Success Criteria**:
- [ ] Validation outcomes stored in ReasoningBank
- [ ] Patterns learned from successful validations
- [ ] Cross-model behavior differences tracked
- [ ] Skill confidence scores updated based on validation history

**Integration Architecture**:
```typescript
// v3/src/learning/skill-validation-learner.ts
import { RealQEReasoningBank } from './real-qe-reasoning-bank.js';
import { QualityFeedbackLoop } from '../feedback/feedback-loop.js';

export interface SkillValidationOutcome {
  skillName: string;
  trustTier: number;
  validationLevel: 'schema' | 'validator' | 'eval';
  model: string;
  passed: boolean;
  score: number;
  testCaseResults: TestCaseResult[];
  timestamp: Date;
}

export class SkillValidationLearner {
  constructor(
    private reasoningBank: RealQEReasoningBank,
    private feedbackLoop: QualityFeedbackLoop
  ) {}

  async recordValidationOutcome(outcome: SkillValidationOutcome): Promise<void> {
    // Store pattern for skill validation
    await this.reasoningBank.storePattern({
      patternType: 'skill-validation',
      name: `${outcome.skillName}-validation-${outcome.validationLevel}`,
      description: `Validation outcome for ${outcome.skillName} at level ${outcome.validationLevel}`,
      context: {
        tags: ['skill-validation', outcome.skillName, outcome.model],
        testType: 'skill-eval',
      },
      template: {
        type: 'data',
        content: JSON.stringify(outcome),
        variables: [],
      },
    });

    // Update skill confidence in memory
    await this.updateSkillConfidence(outcome);

    // Record in feedback loop
    await this.feedbackLoop.recordTestOutcome({
      testId: `skill-${outcome.skillName}-${outcome.validationLevel}`,
      passed: outcome.passed,
      flaky: false,
      executionTimeMs: 0,
      patternId: undefined,
    });
  }

  private async updateSkillConfidence(outcome: SkillValidationOutcome): Promise<void> {
    const key = `skill-confidence-${outcome.skillName}`;
    const existing = await this.reasoningBank.memory.get(key, 'skill-validation');

    const history = existing ? JSON.parse(existing) : { outcomes: [], avgScore: 0 };
    history.outcomes.push({
      score: outcome.score,
      timestamp: outcome.timestamp,
      model: outcome.model,
    });

    // Keep last 100 outcomes
    if (history.outcomes.length > 100) {
      history.outcomes = history.outcomes.slice(-100);
    }

    history.avgScore = history.outcomes.reduce((sum, o) => sum + o.score, 0) / history.outcomes.length;

    await this.reasoningBank.memory.set(key, JSON.stringify(history), 'skill-validation');
  }
}
```

---

#### Milestone 4.3: Skill Manifest Auto-Update
**Description**: Automatically update skills-manifest.json with trust tiers
**Complexity**: Medium
**Estimated Hours**: 8
**Agent Assignment**: qe-fleet-commander
**Dependencies**: 4.1, 4.2
**Parallel Opportunity**: No (depends on validation results)

**Deliverables**:
- `scripts/update-skill-manifest.ts`
- CI step to update manifest on validation
- Trust tier badge generation

**Success Criteria**:
- [ ] Manifest auto-updates with trust_tier on validation pass
- [ ] Validation status tracked in manifest
- [ ] Badges generated for README

---

### Phase 5: Parallel Execution Support

#### Milestone 5.1: Claude Flow Swarm Integration
**Description**: Enable parallel skill validation via claude-flow
**Complexity**: Medium
**Estimated Hours**: 12
**Agent Assignment**: qe-fleet-commander
**Dependencies**: Phase 4 complete
**Parallel Opportunity**: N/A (enables parallelism)

**Deliverables**:
- `scripts/validate-skills-swarm.ts`
- Swarm topology configuration for skill validation
- Progress reporting for parallel execution

**Success Criteria**:
- [ ] Skills validated in parallel batches
- [ ] Topology: hierarchical with coordinator
- [ ] Max agents: 8 for validation tasks
- [ ] Results aggregated by coordinator

**Swarm Configuration**:
```typescript
// Skill validation swarm
const validationSwarm = await FleetManager.coordinate({
  strategy: 'skill-validation',
  topology: 'hierarchical',
  maxAgents: 8,
  agents: [
    { type: 'qe-fleet-commander', role: 'coordinator' },
    { type: 'qe-security-scanner', skills: ['security-testing'] },
    { type: 'qe-visual-tester', skills: ['accessibility-testing'] },
    { type: 'qe-api-contract-validator', skills: ['api-testing-patterns', 'contract-testing'] },
    { type: 'qe-performance-tester', skills: ['performance-testing'] },
    { type: 'qe-chaos-engineer', skills: ['chaos-engineering-resilience'] },
    { type: 'qe-test-data-architect', skills: ['database-testing'] },
    { type: 'qe-test-generator', skills: ['mutation-testing'] },
  ],
  coordination: {
    batchSize: 4,
    failFast: false,
    resultAggregation: 'coordinator',
  },
});
```

---

## Dependency Graph

```
Phase 1: Foundation
├── 1.1 Trust Tier Schema ─────────┐
├── 1.2 Output Schema Template ────┼──> 1.4 Evaluation Framework
└── 1.3 Validator Template ────────┘
                                   │
                                   v
Phase 2: P0 Skills (Parallel Batch)
├── 2.1 Security Testing ──────────┐
├── 2.2 Accessibility Testing ─────┤
├── 2.3 API Testing Patterns ──────┼──> Phase 3
├── 2.4 Compliance Testing ────────┤
└── 2.5 Mutation Testing ──────────┘
                                   │
                                   v
Phase 3: Remaining P0 (Parallel Batch)
├── 3.1 Performance Testing ───────┐
├── 3.2 Chaos Engineering ─────────┤
├── 3.3 Database Testing ──────────┼──> Phase 4
├── 3.4 Contract Testing ──────────┤
└── 3.5 Testability Scoring ───────┘
                                   │
                                   v
Phase 4: CI/CD Integration
├── 4.1 GitHub Actions Workflow ───┤
├── 4.2 ReasoningBank Integration ─┼──> 4.3 Manifest Auto-Update
└── 4.3 Manifest Auto-Update ──────┘
                                   │
                                   v
Phase 5: Parallel Support
└── 5.1 Claude Flow Swarm ─────────┘
```

---

## Resource Allocation

### Agent Assignments Summary

| Agent | Milestones | Estimated Hours |
|-------|------------|-----------------|
| qe-test-architect | 1.1 | 4 |
| qe-api-contract-validator | 1.2, 2.3, 3.4 | 32 |
| qe-test-generator | 1.3, 2.5 | 18 |
| qe-quality-analyzer | 1.4, 3.5 | 16 |
| qe-security-scanner | 2.1 | 16 |
| qe-visual-tester | 2.2 | 16 |
| qe-quality-gate | 2.4 | 16 |
| qe-performance-tester | 3.1 | 14 |
| qe-chaos-engineer | 3.2 | 14 |
| qe-test-data-architect | 3.3 | 12 |
| qe-fleet-commander | 4.1, 4.3, 5.1 | 36 |
| qe-learning-coordinator | 4.2 | 20 |

**Total Estimated Hours**: 214 hours

### Parallel Execution Plan

```
Week 1: Foundation (Phase 1)
├── Day 1-2: 1.1, 1.2, 1.3 (parallel)
└── Day 3-5: 1.4 (depends on 1.1, 1.2)

Week 2: P0 Skills Batch 1 (Phase 2)
├── Day 1-4: 2.1, 2.2, 2.3, 2.4, 2.5 (parallel)
└── Day 5: Review and integration

Week 3: P0 Skills Batch 2 (Phase 3)
├── Day 1-4: 3.1, 3.2, 3.3, 3.4, 3.5 (parallel)
└── Day 5: Review and integration

Week 4: CI/CD Integration (Phase 4-5)
├── Day 1-3: 4.1 GitHub Actions
├── Day 3-5: 4.2 ReasoningBank (overlap)
├── Day 4-5: 4.3 Manifest Auto-Update
└── Day 5: 5.1 Swarm Integration
```

---

## Memory Namespaces

```
aqe/skill-validation/
├── schemas/                 - Schema definitions and versions
├── validators/              - Validator configurations
├── evals/                   - Evaluation test suites
├── outcomes/                - Validation run results
│   ├── {skill-name}/
│   │   ├── schema/          - Schema validation results
│   │   ├── validator/       - Validator run results
│   │   └── eval/            - Evaluation suite results
├── patterns/                - Learned validation patterns
├── model-comparison/        - Cross-model behavior data
├── confidence/              - Skill confidence scores
└── trends/                  - Historical validation trends
```

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Tool unavailability in CI | High | Medium | Graceful degradation in validators |
| Model behavior variance | Medium | High | Multi-model testing, baseline establishment |
| Schema evolution breaks validation | High | Low | Versioned schemas, backward compatibility |
| Eval suite false positives | Medium | Medium | Human review of eval results, confidence thresholds |
| ReasoningBank integration complexity | High | Medium | Incremental integration, fallback to file storage |

---

## Success Metrics

### Phase 1 Completion Criteria
- [ ] All templates created and documented
- [ ] Templates validated against existing exemplars
- [ ] Integration points defined

### Phase 2-3 Completion Criteria
- [ ] All 10 P0 skills have trust_tier: 3
- [ ] 90%+ pass rate on evaluation suites
- [ ] Validators handle tool unavailability gracefully

### Phase 4-5 Completion Criteria
- [ ] CI workflow validates all skills on PR
- [ ] ReasoningBank stores validation patterns
- [ ] Swarm parallel execution reduces validation time by 50%

### Overall Success Criteria
- [ ] 100% of skills have at least trust_tier: 1 (schema)
- [ ] 100% of P0 skills have trust_tier: 3 (full validation)
- [ ] Validation results feed into pattern learning
- [ ] Cross-model behavior tracked and anomalies flagged

---

## Related Documents

- [ADR-021: QE ReasoningBank](../adrs/adr-021-qe-reasoningbank.md)
- [ADR-023: Quality Feedback Loop](../adrs/adr-023-quality-feedback-loop.md)
- [Skills Manifest Schema](../schemas/skills-manifest.schema.json)
- [Existing Validator: testability-scoring](../../.claude/skills/testability-scoring/scripts/)
- [Existing Validator: brutal-honesty-review](../../.claude/skills/brutal-honesty-review/scripts/)

---

## Appendix A: Trust Tier Definitions

| Tier | Name | Requirements | Verification |
|------|------|--------------|--------------|
| 0 | Declarative | SKILL.md only | Human review |
| 1 | Structured | + JSON output schema | Schema validation |
| 2 | Validated | + Executable validator | CI validation |
| 3 | Evaluated | + Evaluation test suite | Multi-model testing |

---

## Appendix B: Priority Skills Rationale

P0 skills were selected based on:
1. **Risk Impact**: Security, compliance, accessibility have legal/safety implications
2. **Usage Frequency**: API testing, mutation testing are commonly invoked
3. **Output Complexity**: These skills produce structured reports requiring validation
4. **Learning Value**: High-value patterns for ReasoningBank

---

*Document generated following SPARC methodology with GOAP action planning.*
