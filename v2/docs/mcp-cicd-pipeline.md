# MCP CI/CD Pipeline Documentation

## Overview

The MCP CI/CD pipeline ensures all Model Context Protocol (MCP) tools are tested and validated on every PR and commit to prevent regressions.

## Pipeline Architecture

### Workflows

The pipeline consists of 4 main jobs orchestrated by GitHub Actions:

```
┌─────────────────────┐
│  mcp-unit-tests     │ ── Coverage ──> Codecov
└─────────────────────┘
          │
          ├─────────────────────┐
          │                     │
┌─────────────────────┐  ┌─────────────────────┐
│ mcp-integration     │  │  mcp-validation     │
│      -tests         │  │                     │
└─────────────────────┘  └─────────────────────┘
          │                     │
          └──────────┬──────────┘
                     │
            ┌─────────────────┐
            │  mcp-summary    │
            └─────────────────┘
```

### Job Details

#### 1. MCP Unit Tests (`mcp-unit-tests`)
- **Purpose**: Test individual MCP tool handlers
- **Timeout**: 10 minutes
- **Memory**: 768MB
- **Command**: `npm run test:mcp`
- **Outputs**:
  - Coverage reports → Codecov
  - Test results → Artifacts
  - JUnit XML reports

#### 2. MCP Integration Tests (`mcp-integration-tests`)
- **Purpose**: Test MCP tools in integrated scenarios
- **Timeout**: 15 minutes
- **Memory**: 1024MB
- **Command**: `npm run test:integration:mcp`
- **Outputs**:
  - Test reports via dorny/test-reporter
  - Test results → Artifacts

#### 3. MCP Validation (`mcp-validation`)
- **Purpose**: Validate all MCP tools have required components
- **Timeout**: 5 minutes
- **Checks**:
  - Handler implementation exists
  - Schema definition exists
  - Unit tests exist
  - Integration tests exist (warning only)
  - Documentation exists
- **Commands**:
  - `npm run mcp:validate` - Validation
  - `npm run mcp:report` - Report generation
- **Outputs**:
  - Validation JSON report → Artifacts
  - Markdown report → Artifacts

#### 4. MCP Summary (`mcp-summary`)
- **Purpose**: Aggregate results and comment on PR
- **Runs**: Always (even if previous jobs fail)
- **Outputs**:
  - PR comment with test summary
  - Validation statistics
  - Coverage metrics

## NPM Scripts

### Added Scripts

```json
{
  "mcp:validate": "node scripts/validate-mcp-tools.js",
  "mcp:report": "node scripts/generate-mcp-report.js",
  "test:mcp:integration": "jest tests/integration/phase2/phase2-mcp-integration.test.ts --runInBand"
}
```

### Existing Scripts (Used by Pipeline)

```json
{
  "test:mcp": "jest tests/mcp --runInBand",
  "test:integration:phase2:mcp": "jest tests/integration/phase2/phase2-mcp-integration.test.ts --runInBand"
}
```

## Validation Script

### `/workspaces/agentic-qe-cf/scripts/validate-mcp-tools.js`

**Purpose**: Validates all MCP tools have required components.

**Validation Checks**:
1. ✅ Handler implementation exists
2. ✅ Schema definition exists (via tools.ts)
3. ✅ Unit tests exist
4. ⚠️  Integration tests exist (optional warning)

**Exit Codes**:
- `0` - All validations passed
- `1` - One or more validations failed

**Output**: JSON report in `reports/mcp-validation-{timestamp}.json`

**Example Report**:
```json
{
  "totalTools": 54,
  "validTools": 52,
  "invalidTools": 2,
  "coverage": 96,
  "tools": [
    {
      "name": "mcp__agentic_qe__fleet_init",
      "valid": true,
      "hasHandler": true,
      "hasTests": true,
      "hasIntegrationTests": true
    },
    {
      "name": "mcp__agentic_qe__some_tool",
      "valid": false,
      "hasHandler": false,
      "hasTests": true,
      "issues": ["Missing handler implementation"]
    }
  ]
}
```

## Report Generator

### `/workspaces/agentic-qe-cf/scripts/generate-mcp-report.js`

**Purpose**: Generates comprehensive markdown report from validation and test results.

**Inputs**:
- Validation report JSON
- Coverage summary JSON
- MCP tools definitions

**Output**: Markdown report in `reports/mcp-report-{timestamp}.md`

**Report Sections**:
1. Executive Summary
   - Total tools
   - Valid/invalid counts
   - Coverage percentages
2. Tools by Category
   - Core Fleet Management
   - Test Generation & Execution
   - Quality & Coverage Analysis
   - Memory & Coordination
   - Advanced Testing
   - Streaming & Real-time
3. Validation Issues
4. Test Coverage Details
5. Recommendations

## Pre-commit Hook

### `/workspaces/agentic-qe-cf/.husky/pre-commit`

**Status**: DISABLED by default (per CLAUDE.md policy)

**Policy**: Respects the CLAUDE.md git operations policy:
- NEVER auto-commit without explicit user request
- User must manually enable validation

**To Enable**:
```bash
# Edit .husky/pre-commit and uncomment:
npm run mcp:validate -- --bail --findRelatedTests
```

## Trigger Conditions

### Push Events
```yaml
on:
  push:
    branches: [main, testing-with-qe]
    paths:
      - 'src/mcp/**'
      - 'tests/mcp/**'
      - 'tests/integration/mcp/**'
      - 'package.json'
```

### Pull Request Events
```yaml
on:
  pull_request:
    branches: [main]
    paths:
      - 'src/mcp/**'
      - 'tests/mcp/**'
      - 'tests/integration/mcp/**'
      - 'package.json'
```

## Artifacts

### Retention Policy
All artifacts are retained for **30 days**.

### Artifact Types

1. **mcp-unit-test-results**
   - `coverage/`
   - `test-results/`
   - `junit.xml`

2. **mcp-integration-test-results**
   - `test-results/`
   - `junit.xml`

3. **mcp-validation-report**
   - `reports/mcp-validation-*.json`

4. **mcp-report**
   - `reports/mcp-report-*.md`

## Coverage Integration

### Codecov

Coverage reports are automatically uploaded to Codecov with:
- **Flags**: `mcp-unit`
- **Name**: `mcp-unit-coverage`
- **Fail CI**: `false` (warning only)

### Coverage Thresholds

No hard thresholds are enforced, but teams should aim for:
- **Lines**: 80%+
- **Statements**: 80%+
- **Functions**: 75%+
- **Branches**: 70%+

## Local Testing

### Run Full Pipeline Locally

```bash
# 1. Run unit tests
npm run test:mcp

# 2. Run integration tests
npm run test:integration:mcp

# 3. Validate tools
npm run mcp:validate

# 4. Generate report
npm run mcp:report
```

### Quick Validation

```bash
npm run mcp:validate
```

### View Reports

```bash
# View latest validation report
cat reports/mcp-validation-*.json | jq

# View latest markdown report
cat reports/mcp-report-*.md
```

## Adding New MCP Tools

When adding a new MCP tool, ensure:

1. **Schema Definition** in `src/mcp/tools.ts`:
   ```typescript
   {
     name: 'mcp__agentic_qe__my_tool',
     description: 'Description',
     inputSchema: { /* ... */ }
   }
   ```

2. **Handler Implementation** in `src/mcp/handlers/my-tool.ts`:
   ```typescript
   export async function handleMyTool(params: MyToolParams) {
     // Implementation
   }
   ```

3. **Unit Tests** in `tests/mcp/my-tool.test.ts`:
   ```typescript
   describe('mcp__agentic_qe__my_tool', () => {
     it('should handle valid input', async () => {
       // Test
     });
   });
   ```

4. **Integration Tests** (optional) in `tests/integration/phase2/phase2-mcp-integration.test.ts`:
   ```typescript
   it('should integrate my_tool with other tools', async () => {
     // Integration test
   });
   ```

## Success Criteria

### Pipeline Passes When:
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ All MCP tools have handlers
- ✅ All MCP tools have unit tests
- ✅ Validation coverage ≥ 95%
- ✅ Pipeline completes in < 10 minutes

### Pipeline Fails When:
- ❌ Unit tests fail
- ❌ Integration tests fail
- ❌ Validation finds missing handlers
- ❌ Validation finds missing tests
- ❌ Timeout exceeded

## Troubleshooting

### Validation Fails

**Issue**: `Missing handler implementation`
**Solution**: Create handler in `src/mcp/handlers/{tool-name}.ts`

**Issue**: `Missing unit tests`
**Solution**: Create tests in `tests/mcp/{tool-name}.test.ts`

### Tests Timeout

**Issue**: Memory exhaustion (OOM)
**Solution**: Tests already run with `--runInBand` and memory limits. If issues persist, review test implementation.

### Coverage Not Uploaded

**Issue**: Coverage report not found
**Solution**: Ensure `npm run test:mcp` generates coverage in `coverage/` directory.

## Performance Metrics

### Target Execution Times
- Unit tests: < 5 minutes
- Integration tests: < 10 minutes
- Validation: < 2 minutes
- Total pipeline: < 15 minutes

### Current Performance
Monitor via GitHub Actions UI:
- Job duration
- Test counts
- Success rates

## Maintenance

### Regular Tasks

1. **Weekly**:
   - Review failed pipelines
   - Check coverage trends
   - Review validation reports

2. **Monthly**:
   - Archive old reports (> 90 days)
   - Review and update validation rules
   - Optimize slow tests

3. **Per Release**:
   - Verify all tools validated
   - Review coverage reports
   - Update documentation

## Related Documentation

- [CLAUDE.md](/workspaces/agentic-qe-cf/CLAUDE.md) - Project instructions
- [MCP Tools](/workspaces/agentic-qe-cf/src/mcp/tools.ts) - Tool definitions
- [Test Documentation](/workspaces/agentic-qe-cf/tests/README.md) - Testing guidelines

---

**Generated**: 2025-10-30
**Version**: 1.0.0
**Maintained by**: Agentic QE Team
