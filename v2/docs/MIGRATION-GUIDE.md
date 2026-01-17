# Migration Guide - v1.0.0 to v1.0.1

## Overview

Version 1.0.1 is a **patch release** with security fixes and test infrastructure improvements. Migration is minimal with only one potential breaking change related to the faker package upgrade.

## Changes Summary

### Security Updates

**CRITICAL: faker Package Replacement**

- **Removed**: `faker@6.6.6` (vulnerable, CVE-2022-42003)
- **Added**: `@faker-js/faker@^10.0.0` (secure, official fork)

### Test Infrastructure

- Fixed async timing issues in agent lifecycle tests
- Improved test stability and reliability
- Enhanced memory management in test execution

### Documentation

- Added USER-GUIDE.md
- Added CONFIGURATION.md
- Added TROUBLESHOOTING.md
- Updated README.md

## Migration Steps

### Step 1: Update Package

```bash
# Using npm
npm update -g agentic-qe

# Verify version
aqe --version
# Should show: 1.0.1 or higher
```

### Step 2: Update faker Imports (If Applicable)

**Only required if you have custom tests or scripts using faker.**

#### Before (v1.0.0)
```typescript
import faker from 'faker';

const name = faker.name.findName();
const email = faker.internet.email();
const address = faker.address.streetAddress();
```

#### After (v1.0.1)
```typescript
import { faker } from '@faker-js/faker';

const name = faker.person.fullName();  // API changed
const email = faker.internet.email();  // No change
const address = faker.location.streetAddress();  // API changed
```

#### Common API Changes

| Old API (faker) | New API (@faker-js/faker) |
|-----------------|---------------------------|
| `faker.name.findName()` | `faker.person.fullName()` |
| `faker.name.firstName()` | `faker.person.firstName()` |
| `faker.name.lastName()` | `faker.person.lastName()` |
| `faker.address.streetAddress()` | `faker.location.streetAddress()` |
| `faker.address.city()` | `faker.location.city()` |
| `faker.address.country()` | `faker.location.country()` |
| `faker.random.uuid()` | `faker.string.uuid()` |
| `faker.random.number()` | `faker.number.int()` |

#### Complete Migration Script

```bash
# Find files using old faker
find . -name "*.ts" -o -name "*.js" | xargs grep "from 'faker'"

# Update imports (use with caution)
find tests -name "*.ts" -exec sed -i "s/import faker from 'faker'/import { faker } from '@faker-js\/faker'/g" {} \;

# Manual review recommended
git diff
```

### Step 3: Update Dependencies (If Using Programmatically)

If you're using Agentic QE as a library in `package.json`:

```json
{
  "dependencies": {
    "agentic-qe": "^1.0.1"
  },
  "devDependencies": {
    "@faker-js/faker": "^10.0.0"
  }
}
```

```bash
npm install
npm audit  # Should show 0 high vulnerabilities
```

### Step 4: Verify Installation

```bash
# Run diagnostics
aqe diagnostics

# Check fleet status
aqe status

# Run test suite (if applicable)
npm test
```

## Breaking Changes

### None for Core Functionality

The v1.0.1 release has **no breaking changes** for:
- Core AQE CLI commands
- Agent definitions
- MCP integration
- Configuration files
- Fleet management
- Test generation/execution

### Potential Breaking Change: faker API

**Impact**: Only affects users who:
1. Have custom test files using the old `faker` package
2. Have scripts using faker for data generation

**Severity**: Low - Only affects custom code outside AQE core

**Mitigation**: Follow Step 2 migration guide above

## Configuration Changes

No configuration changes required. All existing configuration files remain compatible.

**Optional**: Review new configuration options in [CONFIGURATION.md](./CONFIGURATION.md)

## Testing Migration

If you experience test failures after upgrade:

### 1. Clear Cache and Rebuild

```bash
# Clear node modules and cache
rm -rf node_modules
npm cache clean --force
npm install

# Rebuild AQE (if installed from source)
npm run build
```

### 2. Update Test Configuration

No changes required for v1.0.1, but recommended optimizations:

```json
// jest.config.js (if using Jest)
{
  "testTimeout": 20000,
  "maxWorkers": 1,
  "workerIdleMemoryLimit": "384MB"
}
```

### 3. Verify Test Execution

```bash
# Run tests in safe mode
npm run test:safe

# Or with AQE
aqe execute --workers 1
```

## Rollback Procedure

If you need to rollback to v1.0.0:

```bash
# Uninstall current version
npm uninstall -g agentic-qe

# Install specific version
npm install -g agentic-qe@1.0.0

# Verify version
aqe --version
```

**Note**: v1.0.0 contains a high-severity security vulnerability (CVE-2022-42003). Rollback is not recommended.

## Known Issues

### Issues Resolved in v1.0.1

- ✅ Agent lifecycle synchronization issues
- ✅ faker.js security vulnerability (CVE-2022-42003)
- ✅ Memory leaks in long-running agents
- ✅ Test timing issues in CI/CD

### Issues Pending (Planned for v1.1.0)

- Coverage baseline measurement (infrastructure ready, pending execution)
- Some integration tests require environment-specific configuration
- Performance benchmarks pending validation

## Post-Migration Checklist

- [ ] Updated to v1.0.1: `aqe --version`
- [ ] Updated faker imports (if applicable)
- [ ] Security audit clean: `npm audit` shows 0 high
- [ ] Tests passing: `npm test` or `aqe execute`
- [ ] Configuration validated: `aqe config validate`
- [ ] Fleet operational: `aqe status`
- [ ] Documentation reviewed:
  - [ ] [USER-GUIDE.md](./USER-GUIDE.md)
  - [ ] [CONFIGURATION.md](./CONFIGURATION.md)
  - [ ] [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

## Getting Help

If you encounter issues during migration:

1. **Documentation**: Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
2. **GitHub Issues**: [Report migration issues](https://github.com/proffesor-for-testing/agentic-qe/issues)
3. **Discussions**: [Ask questions](https://github.com/proffesor-for-testing/agentic-qe/discussions)

## Appendix: Detailed API Changes

### @faker-js/faker API Reference

For complete API changes, see:
- [faker.js Migration Guide](https://fakerjs.dev/guide/upgrading.html)
- [New API Documentation](https://fakerjs.dev/api/)

### Common Patterns

```typescript
// Old pattern (v1.0.0)
import faker from 'faker';
faker.seed(123);

// New pattern (v1.0.1)
import { faker } from '@faker-js/faker';
faker.seed(123);  // No change in seeding

// Old pattern (v1.0.0)
const user = {
  name: faker.name.findName(),
  email: faker.internet.email(),
  phone: faker.phone.phoneNumber()
};

// New pattern (v1.0.1)
const user = {
  name: faker.person.fullName(),
  email: faker.internet.email(),
  phone: faker.phone.number()
};
```

## Version Compatibility Matrix

| AQE Version | Node.js | npm | TypeScript | Jest |
|-------------|---------|-----|------------|------|
| 1.0.1 | ≥18.0.0 | ≥8.0.0 | ≥5.3.0 | ≥29.7.0 |
| 1.0.0 | ≥18.0.0 | ≥8.0.0 | ≥5.3.0 | ≥29.7.0 |

## Timeline

- **October 7, 2025**: v1.0.1 released
- **October 14, 2025**: v1.0.0 deprecation notice
- **November 7, 2025**: v1.0.0 end-of-support

**Recommendation**: Migrate to v1.0.1 immediately to address security vulnerability.
