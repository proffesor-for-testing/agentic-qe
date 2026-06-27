---
name: "qe-test-generation"
description: "Generates durable-first tests — invariants, contracts, and property-based tests at boundaries that survive a reimplementation — plus unit, integration, and e2e coverage. Use when creating tests for new or changed code, filling coverage gaps, or migrating test suites between Jest, Vitest, and Playwright."
trust_tier: 3
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
  eval_path: evals/qe-test-generation.yaml
---

# QE Test Generation

## Purpose

Guide the use of v3's AI-powered test generation capabilities including pattern-based test synthesis, multi-framework support, and intelligent test case derivation from code analysis.

## Write durable-first (the core rule)

When AI makes code cheap to regenerate, the durable asset is the test that still
holds after the implementation is thrown away and rewritten. Generate tests in
**durability tiers**, and lead with the durable ones (ADR-113):

| Tier | What it is | Survives a rewrite? | When to write |
|------|-----------|---------------------|---------------|
| **Durable** | Invariants, contracts/schemas, property-based tests, behavioral e2e — specified at the module's public boundary | **Yes** | **Always — ≥1 per target** |
| **Ephemeral** | Example-based unit tests, mock-call/interaction tests (TDD-London style) | No (coupled to impl) | For the red-green loop; label them, delete freely |
| **Live** | Monitoring / drift / cost assertions that run against reality | Continuously | For deployed behavior |

**The language-swap heuristic:** *if reimplementing this module in another language
would invalidate the test, the test is at the wrong boundary.* Push it up a tier —
assert on the observable contract, not on how the current code happens to work.

Every generated target MUST include at least one **durable** assertion (an invariant,
a contract check, or a property). Mock-call assertions (`toHaveBeenCalledWith`) are
ephemeral by definition — never let them be the only thing testing a target. Tag each
generated test `// @tier durable|ephemeral|live` so its lifetime is explicit.

These tests are graded as **oracles**: a good test passes against the real code and
*fails* against a seeded bug (mutant). A test that asserts nothing, or only the happy
path, kills no mutants and is rejected — see `/mutation-testing` and ADR-113.

## Activation

- When generating tests for new code
- When improving test coverage
- When migrating tests between frameworks
- When applying TDD patterns
- When generating edge case tests

## Quick Start

```bash
# Generate unit tests for a file
aqe test generate --file src/services/UserService.ts --framework jest

# Generate tests with coverage target
aqe test generate --scope src/api/ --coverage 90 --type unit

# Generate integration tests
aqe test generate --file src/controllers/AuthController.ts --type integration

# Generate from patterns
aqe test generate --pattern repository --target src/repositories/
```

## Agent Workflow

```typescript
// Spawn test generation agents — durable-first
Task("Generate durable-first tests", `
  Analyze src/services/PaymentService.ts and generate Jest tests in tier order.
  1. DURABLE (write these first, >=1 per public method):
     - Invariants ("a refund never makes a balance negative")
     - Contract/schema checks on inputs and outputs crossing the boundary
     - Property-based tests (fast-check) over input ranges, not single examples
  2. EPHEMERAL (the red-green loop; tag '// @tier ephemeral'):
     - Specific happy-path examples and error paths
     - Mock external dependencies ONLY — never let a mock-call assertion be the
       only test for a method
  Apply the language-swap check: if a Python rewrite of PaymentService would break
  the test, move it up to the durable tier.
  Output to tests/unit/services/PaymentService.test.ts
`, "qe-test-architect")

// Property + contract generation (first-class, not opt-in)
Task("Generate property and contract tests", `
  For src/repositories/, derive:
  - Properties: round-trip (write→read returns same), idempotence, ordering invariants
  - Contracts: the repository interface schema, enforced on every CRUD result
  These survive a storage-engine swap; example-based CRUD tests do not.
`, "qe-property-tester")
```

## Test Generation Strategies

### 1. Code Analysis Based

```typescript
await testGenerator.analyzeAndGenerate({
  source: 'src/services/OrderService.ts',
  analysis: {
    methods: true,
    branches: true,
    dependencies: true,
    errorPaths: true
  },
  output: {
    framework: 'jest',
    style: 'describe-it',
    assertions: 'expect'
  }
});
```

### 2. Pattern-Based Generation

```typescript
await testGenerator.applyPattern({
  pattern: 'service-layer',
  targets: ['src/services/*.ts'],
  customizations: {
    mockStrategy: 'jest.mock',
    asyncHandling: 'async-await',
    errorAssertion: 'toThrow'
  }
});
```

### 3. Coverage-Driven Generation

```typescript
await testGenerator.fillCoverageGaps({
  coverageReport: 'coverage/lcov.info',
  targetCoverage: 90,
  prioritize: ['uncovered-branches', 'error-paths'],
  maxTests: 50
});
```

## Framework Support

| Framework | Unit | Integration | E2E | Mocking |
|-----------|------|-------------|-----|---------|
| Jest | ✅ | ✅ | ⚠️ | jest.mock |
| Vitest | ✅ | ✅ | ⚠️ | vi.mock |
| Mocha | ✅ | ✅ | ❌ | sinon |
| Pytest | ✅ | ✅ | ❌ | pytest-mock |
| JUnit | ✅ | ✅ | ❌ | Mockito |

## Test Quality Checks

```yaml
quality_checks:
  durability:                  # the primary check (ADR-113)
    durable_assertions_per_target: 1   # >=1 invariant/contract/property each
    language_swap_safe: true           # would survive a reimplementation
    tier_tags_present: true            # every test tagged durable|ephemeral|live

  fault_detection:             # do the tests actually catch bugs?
    mutation_score_min: 0.6            # kill rate against seeded mutants
    no_assertionless_tests: true       # reject tests that kill 0 mutants

  assertions:
    minimum_per_test: 1
    meaningful: true

  isolation:
    no_shared_state: true
    proper_setup_teardown: true

  naming:
    descriptive: true
    follows_convention: true

  coverage:                    # necessary but NOT sufficient — see fault_detection
    branches: 80
    statements: 85
```

## Skill Composition

- **After generating tests** → Run `/mutation-testing` to verify test quality
- **Before generating** → Use `/test-automation-strategy` to choose framework and patterns
- **Related** → `/qe-coverage-analysis` to find where tests are needed most

## Gotchas

- Agent truncates output on files >3000 lines — scope generation to individual modules, not entire directories
- Components that pass unit tests individually may have zero integration wiring — always generate at least one integration test per module boundary
- When generating tests for a new codebase, check which framework is installed (jest vs vitest vs mocha) — they have different mock APIs and Claude will use the wrong one
- Completion theater: agent may claim "comprehensive tests generated" but leave stubs or hardcoded values — always run the generated tests before accepting
- Fleet must be initialized before using QE agents: run `aqe health` to diagnose, or `aqe init` to re-initialize if you get "Fleet not initialized"

## Coordination

**Primary Agents**: qe-test-generator, qe-pattern-matcher, qe-test-architect
**Coordinator**: qe-test-generation-coordinator
**Related Skills**: qe-coverage-analysis, qe-test-execution
