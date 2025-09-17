# Test Generator Agent

## Purpose
Automated test code generation agent that creates executable test files based on specifications, supporting multiple frameworks and testing patterns.

## Capabilities
- Automated test code generation
- Multi-framework support (Jest, Mocha, Cypress, Playwright)
- Test data generation
- Mock and stub creation
- API test generation
- UI test automation
- Performance test scripts

## Available Commands

### `qe generate-tests`
Generate test files from specifications or existing code.

**Usage:**
```bash
npx aqe generate-tests --spec "tests/specs/login.yaml" --framework "jest" --type "unit"
```

**Options:**
- `--spec` - Test specification file or inline specification
- `--framework` - Testing framework (jest, mocha, cypress, playwright, vitest)
- `--type` - Test type (unit, integration, e2e, performance, security)
- `--output` - Output directory for generated tests
- `--coverage` - Generate coverage-focused tests
- `--mocks` - Auto-generate mocks and stubs

### `qe generate-data`
Generate test data and fixtures.

**Usage:**
```bash
npx aqe generate-data --schema "user-schema.json" --count 100 --format "json"
```

**Options:**
- `--schema` - Data schema definition
- `--count` - Number of test records to generate
- `--format` - Output format (json, csv, sql, yaml)
- `--realistic` - Use realistic data patterns

### `qe generate-mocks`
Create mock objects and API responses.

**Usage:**
```bash
npx aqe generate-mocks --api "api-spec.yaml" --framework "jest" --type "service"
```

## Integration Examples

### With Claude Code Task Tool
```javascript
Task("Test Generator", "Generate Jest unit tests for UserService class with 95% coverage. Include mocks for database and external APIs.", "test-generator")
```

### Batch Generation
```bash
# Generate multiple test types
npx aqe generate-tests --spec "specs/*.yaml" --framework "jest" --type "unit,integration"
```

### API Test Generation
```bash
# Generate API tests from OpenAPI spec
npx aqe generate-tests --spec "api-spec.yaml" --framework "playwright" --type "api"
```

## Supported Frameworks

### Unit Testing
- Jest (JavaScript/TypeScript)
- Mocha + Chai
- Vitest
- pytest (Python)
- JUnit (Java)

### Integration Testing
- Jest + Supertest
- Mocha + Chai-HTTP
- pytest + requests

### E2E Testing
- Cypress
- Playwright
- WebDriver
- Puppeteer

### Performance Testing
- Artillery
- k6
- JMeter scripts

## Output Format
- Executable test files
- Test configuration files
- Mock and fixture files
- Test data files
- Documentation comments

## Coordination Hooks
- `pre-generate` - Validates specifications and dependencies
- `post-generate` - Registers generated tests with runner
- `test-created` - Notifies other agents of new test files

## Memory Keys
- `qe/generated-tests/{feature}` - Generated test file locations
- `qe/test-data/{schema}` - Generated test data sets
- `qe/mocks/{service}` - Created mock objects and APIs