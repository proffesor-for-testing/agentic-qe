# Step 2: Spawn Core Agents (Parallel Batch 1)

## Prerequisites
- Step 1 (Flag Detection) completed
- User story content available
- OUTPUT_FOLDER determined

## Instructions

### CRITICAL: Spawn ALL THREE core agents in ONE message

| Agent | Domain | Role |
|-------|--------|------|
| qe-product-factors-assessor | requirements-validation | SFDIPOT (7 factors, 37 subcategories) analysis |
| qe-bdd-generator | requirements-validation | BDD Gherkin scenario generation |
| qe-requirements-validator | requirements-validation | INVEST validation and testability scoring |

### Agent 1: Product Factors Assessor
Analyze the story using SFDIPOT product factors (Structure, Function, Data, Interface, Platform, Operations, Time). Must read the SFDIPOT reference material first. Save to: `${OUTPUT_FOLDER}/02-product-factors.md`

### Agent 2: BDD Generator
Generate comprehensive BDD Gherkin scenarios from the story acceptance criteria. Must produce Given/When/Then scenarios covering happy paths, edge cases, and negative cases. Save to: `${OUTPUT_FOLDER}/03-bdd-scenarios.md`

### Agent 3: Requirements Validator
Validate the story against INVEST criteria (Independent, Negotiable, Valuable, Estimable, Small, Testable). Assess testability scoring and acceptance criteria completeness. Save to: `${OUTPUT_FOLDER}/04-requirements-validation.md`

### Post-Spawn Confirmation
Tell the user all 3 core agents are running and WAIT.

## Success Criteria
- [ ] All THREE agents spawned in ONE message
- [ ] Each agent has complete story content
- [ ] Post-spawn confirmation sent

## Output
Confirmation that 3 agents are running in background.

## Navigation
- On success: proceed to Step 3 by reading `steps/03-batch1-results.md`
- On failure: respawn missing agents
