# Step 2: Spawn Core Agents (Parallel Batch 1)

## Prerequisites
- Step 1 completed with flags

## Instructions

### Spawn ALL THREE core agents in ONE message

| Agent | Domain | Role |
|-------|--------|------|
| qe-quality-criteria-recommender | requirements-validation | HTSM v6.3 quality criteria analysis |
| qe-risk-assessor | coverage-analysis | Risk storming and risk-based testing |
| qe-requirements-validator | requirements-validation | Requirements completeness validation |

### Agent 1: Quality Criteria Recommender
Apply HTSM v6.3 (10 quality categories) to the epic. Generate quality criteria with priorities. Save to: `${OUTPUT_FOLDER}/02-quality-criteria.md`

### Agent 2: Risk Assessor
Perform risk storming: identify risks, assess likelihood and impact, recommend risk-based test strategies. Save to: `${OUTPUT_FOLDER}/03-risk-assessment.md`

### Agent 3: Requirements Validator
Validate epic completeness, identify gaps, assess testability. Save to: `${OUTPUT_FOLDER}/04-requirements-validation.md`

## Success Criteria
- [ ] All THREE agents spawned

## Navigation
- On success: proceed to Step 3 by reading `steps/03-batch1-results.md`
