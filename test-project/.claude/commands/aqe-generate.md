---
name: aqe-generate
description: Generate comprehensive test suites using AI-powered analysis and sublinear optimization
---

# AQE Generate Tests

Generate comprehensive test suites using AI-powered analysis and sublinear optimization algorithms.

## Usage

```bash
aqe generate <target> [options]
# or
/aqe-generate <target> [options]
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `target` | path | **required** | Source code path to generate tests for |
| `--type` | enum | `unit` | Test type: unit, integration, e2e, performance, security |
| `--framework` | string | `jest` | Testing framework: jest, mocha, cypress, playwright, vitest |
| `--coverage` | number | `95` | Target coverage percentage (0-100) |
| `--property-based` | boolean | `false` | Enable property-based testing |
| `--mutation` | boolean | `false` | Enable mutation testing |
| `--parallel` | boolean | `true` | Generate tests in parallel |
| `--output` | path | `./tests` | Output directory for generated tests |
| `--swagger` | path | - | OpenAPI/Swagger spec for API testing |
| `--dry-run` | boolean | `false` | Preview without writing files |

## Examples

### Basic Unit Test Generation

```bash
aqe generate src/services/user-service.ts
```

Generates unit tests for a single service file using default settings (Jest, 95% coverage).

### E2E Tests from API Spec

```bash
aqe generate src/api --type e2e --swagger api-spec.yaml --framework cypress
```

Generates end-to-end tests from OpenAPI specification using Cypress.

### Property-Based Testing

```bash
aqe generate src/utils --type unit --property-based --coverage 98
```

Generates property-based tests for utility functions with high coverage target.

### Security Test Suite

```bash
aqe generate src/ --type security --framework jest --mutation
```

Generates comprehensive security tests with mutation testing enabled.

### Multi-Framework Generation

```bash
# Generate Jest unit tests
aqe generate src/services --type unit --framework jest

# Generate Cypress E2E tests
aqe generate src/features --type e2e --framework cypress

# Generate Playwright integration tests
aqe generate src/api --type integration --framework playwright
```

## Integration with Claude Code

### Spawning Test Generator Agent

```javascript
// Use Claude Code's Task tool to spawn the test generator agent
Task("Generate comprehensive test suite", `
  Generate tests for the user authentication module:
  - Path: src/services/auth/
  - Framework: Jest
  - Coverage target: 95%
  - Include property-based tests
  - Generate boundary tests for edge cases

  Coordinate with coverage analyzer for gap analysis.
  Store results in memory under: aqe/test-generation/auth-module
`, "qe-test-generator")
```

### Parallel Generation Workflow

```javascript
// Spawn multiple test generators in parallel for different modules
[Single Message]:
  Task("Generate API tests", "Create tests for API endpoints", "qe-test-generator")
  Task("Generate Service tests", "Create tests for service layer", "qe-test-generator")
  Task("Generate Utils tests", "Create tests for utilities", "qe-test-generator")

  TodoWrite({ todos: [
    {content: "Generate API tests", status: "in_progress", activeForm: "Generating API tests"},
    {content: "Generate Service tests", status: "in_progress", activeForm: "Generating Service tests"},
    {content: "Generate Utils tests", status: "in_progress", activeForm: "Generating Utils tests"},
    {content: "Analyze coverage gaps", status: "pending", activeForm: "Analyzing coverage gaps"}
  ]})
```

## Agent Coordination

### Primary Agent
- **qe-test-generator**: Main agent responsible for test generation

### Supporting Agents
- **qe-coverage-analyzer**: Analyzes existing coverage to identify gaps
- **qe-quality-gate**: Validates generated test quality

### Coordination Flow

```
1. Pre-Task Hook
   ├─> Retrieve existing coverage data
   ├─> Retrieve test patterns from neural learning
   └─> Analyze source code structure

2. Test Generation
   ├─> Parse source code and dependencies
   ├─> Generate test cases using AI
   ├─> Apply framework-specific patterns
   └─> Validate test syntax

3. Post-Task Hook
   ├─> Store generated tests in memory
   ├─> Update coverage projections
   ├─> Train neural patterns
   └─> Notify fleet of completion
```

## Memory Operations

### Input Memory Keys

```bash
# Retrieve existing coverage baseline
npx claude-flow@alpha memory retrieve --key "aqe/coverage-baseline"

# Retrieve learned test patterns
npx claude-flow@alpha memory retrieve --key "aqe/test-patterns"

# Retrieve source code analysis
npx claude-flow@alpha memory retrieve --key "aqe/source-code/${target}"
```

### Output Memory Keys

```bash
# Store generation results
npx claude-flow@alpha memory store \
  --key "aqe/test-generation/results" \
  --value '{"tasksGenerated": 45, "projectedCoverage": 96}'

# Store generated test suite metadata
npx claude-flow@alpha memory store \
  --key "aqe/test-suite/${target}" \
  --value '{"framework": "jest", "testCount": 45, "timestamp": "2025-09-30T10:00:00Z"}'

# Store coverage projection
npx claude-flow@alpha memory store \
  --key "aqe/coverage-projection" \
  --value '{"before": 78, "after": 96, "improvement": 18}'
```

## Hooks and Coordination

### Pre-Task Hook

```bash
npx claude-flow@alpha hooks pre-task \
  --description "Generate tests for ${target}" \
  --agent "qe-test-generator"
```

### Post-Edit Hook (for each generated test file)

```bash
npx claude-flow@alpha hooks post-edit \
  --file "${TEST_FILE}" \
  --memory-key "aqe/test-files/${FILE_NAME}"
```

### Post-Task Hook

```bash
npx claude-flow@alpha hooks post-task \
  --task-id "${TASK_ID}" \
  --results "${GENERATION_RESULTS}"
```

### Notify Fleet

```bash
npx claude-flow@alpha hooks notify \
  --message "Generated ${TEST_COUNT} tests with ${COVERAGE}% projected coverage"
```

## Expected Outputs

### Success Output

```
🚀 Initializing test generation for src/services/user-service.ts...
🧠 Analyzing source code...
📝 Generating test cases...
   ✓ Generated 12 unit tests
   ✓ Generated 5 integration tests
   ✓ Generated 3 edge case tests
✅ Test generation completed successfully!
   Tests: 20
   Coverage: 96%
   Framework: jest
   Output: ./tests/unit
```

### Generated Files

```
tests/
└── unit/
    └── services/
        ├── user-service.test.ts
        ├── user-service.integration.test.ts
        └── user-service.edge-cases.test.ts
```

### Metadata Output

```json
{
  "taskId": "qe-gen-1727683200-12345",
  "target": "src/services/user-service.ts",
  "testsGenerated": 20,
  "projectedCoverage": 96,
  "framework": "jest",
  "testTypes": ["unit", "integration", "edge-cases"],
  "files": [
    "tests/unit/services/user-service.test.ts",
    "tests/unit/services/user-service.integration.test.ts",
    "tests/unit/services/user-service.edge-cases.test.ts"
  ],
  "executionTime": "8.3s",
  "timestamp": "2025-09-30T10:00:00Z"
}
```

## Error Handling

### Invalid Target Path

```bash
❌ Error: Target 'src/nonexistent.ts' not found
```

**Solution:** Verify the target path exists and is accessible.

### Framework Not Installed

```bash
⚠️  Warning: cypress not installed
   Installing cypress...
```

**Solution:** The command will auto-install missing frameworks.

### Coverage Target Validation

```bash
❌ Error: Coverage must be 0-100 (provided: 150)
```

**Solution:** Use a valid coverage percentage (0-100).

## Performance Characteristics

- **Time Complexity**: O(log n) for large codebases using sublinear algorithms
- **Target Time**: <10s for 10 files
- **Memory Usage**: ~512MB peak
- **Parallel Support**: Yes (4-8 workers recommended)

## See Also

- `/aqe-execute` - Execute generated tests
- `/aqe-analyze` - Analyze test coverage
- `/aqe-optimize` - Optimize test suite
- `/aqe-report` - Generate quality reports