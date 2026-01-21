# Coverage Quick Reference Guide

**Last Updated:** 2025-10-17
**Status:** ✅ Coverage instrumentation working correctly

---

## Quick Commands

### Run Coverage Collection
```bash
# Recommended: Safe mode with memory optimization
npm run test:coverage-safe

# Alternative: Standard coverage collection
npm run test:coverage

# Alternative: Full test suite with coverage
npm test -- --coverage
```

### View Coverage Results
```bash
# Terminal summary (quick view)
npm run test:coverage-safe | grep "% Stmts"

# JSON summary (detailed metrics)
cat coverage/coverage-summary.json | jq '.total'

# HTML report (interactive, best for analysis)
open coverage/lcov-report/index.html  # macOS
xdg-open coverage/lcov-report/index.html  # Linux
```

### Check Coverage Files
```bash
# List all coverage artifacts
ls -lh coverage/

# Check report size
du -sh coverage/

# View specific file coverage
cat coverage/lcov-report/index.html
```

---

## Coverage Artifacts

### Generated Files

| File | Purpose | Size | Format |
|------|---------|------|--------|
| `coverage-summary.json` | Machine-readable summary | 66KB | JSON |
| `lcov.info` | Line coverage data | 583KB | LCOV |
| `lcov-report/index.html` | Interactive HTML report | 30KB | HTML |
| `coverage/` (total) | All coverage artifacts | 31MB | Mixed |

### Directory Structure
```
coverage/
├── adapters/              # Per-module coverage
├── agents/                # Per-module coverage
├── cli/                   # Per-module coverage
├── core/                  # Per-module coverage
├── coverage-summary.json  # ⭐ Summary metrics
├── index.html             # ⭐ Main report
├── lcov.info              # ⭐ LCOV data
└── lcov-report/           # ⭐ Interactive reports
    ├── index.html         # Coverage overview
    ├── base.css           # Styling
    ├── prettify.js        # Code highlighting
    └── [module dirs]/     # Per-file reports
```

---

## Current Coverage Status

### Overall Metrics (2025-10-17)

```
Lines:      0.95%  (215 / 22,474)
Statements: 0.91%  (216 / 23,685)
Functions:  0.98%  (43 / 4,382)
Branches:   0.24%  (29 / 11,788)
```

### Coverage by Category

| Category | Files | Lines | Coverage |
|----------|-------|-------|----------|
| **Total Codebase** | 22,474 | 22,474 | 0.95% |
| **Covered** | 215 | 215 | - |
| **Uncovered** | 22,259 | 22,259 | - |

### Target vs Actual

| Metric | Target | Actual | Gap |
|--------|--------|--------|-----|
| Lines | 70% | 0.95% | 69.05% |
| Statements | 70% | 0.91% | 69.09% |
| Functions | 70% | 0.98% | 69.02% |
| Branches | 70% | 0.24% | 69.76% |

---

## Interpreting Coverage Reports

### Coverage Percentage Colors (HTML Report)

| Color | Coverage | Status |
|-------|----------|--------|
| 🟢 **Green** | ≥90% | Excellent |
| 🟡 **Yellow** | 70-89% | Good |
| 🟠 **Orange** | 50-69% | Fair |
| 🔴 **Red** | <50% | Poor |

### What Each Metric Means

**Lines Coverage:**
- Percentage of code lines executed during tests
- Most intuitive metric for coverage

**Statements Coverage:**
- Percentage of statements executed
- Similar to lines but counts logical statements

**Functions Coverage:**
- Percentage of functions called during tests
- Identifies untested functions

**Branches Coverage:**
- Percentage of code branches (if/else, switch) tested
- Most strict metric - requires testing all paths

---

## Common Tasks

### 1. Find Uncovered Files
```bash
# List files with 0% coverage
cat coverage/coverage-summary.json | jq -r 'to_entries[] | select(.value.lines.pct == 0) | .key' | head -20

# Count uncovered files
cat coverage/coverage-summary.json | jq '[to_entries[] | select(.value.lines.pct == 0)] | length'
```

### 2. Find Best Covered Files
```bash
# List files with highest coverage
cat coverage/coverage-summary.json | jq -r 'to_entries[] | select(.value.lines.pct > 0) | "\(.value.lines.pct)% - \(.key)"' | sort -rn | head -10
```

### 3. Check Module Coverage
```bash
# Coverage for specific module
cat coverage/coverage-summary.json | jq '."src/agents/TestGeneratorAgent.ts"'

# Average coverage for module
find coverage -name "*.html" -path "*/agents/*" | wc -l
```

### 4. Export Coverage Data
```bash
# Export summary to CSV
echo "metric,total,covered,pct" > coverage-summary.csv
cat coverage/coverage-summary.json | jq -r '.total | to_entries[] | "\(.key),\(.value.total),\(.value.covered),\(.value.pct)"' >> coverage-summary.csv

# View CSV
column -t -s, coverage-summary.csv
```

---

## Coverage Configuration

### Jest Configuration (jest.config.js)
```javascript
{
  // Coverage enabled via --coverage flag
  collectCoverage: false,

  // What to include in coverage
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/__mocks__/**',
    '!src/**/types/**',
    '!src/**/index.ts'
  ],

  // Where to save coverage
  coverageDirectory: 'coverage',

  // Report formats
  coverageReporters: [
    'text',           // Terminal output
    'lcov',           // Standard format
    'html',           // Interactive reports
    'json-summary'    // Machine-readable
  ],

  // Target thresholds
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 70,
      functions: 70,
      lines: 70
    }
  }
}
```

### Package.json Scripts
```json
{
  "test:coverage": "jest --coverage --maxWorkers=1",
  "test:coverage-safe": "jest --coverage --maxWorkers=1 --bail --forceExit",
  "test:unit": "jest tests/unit --runInBand",
  "test:integration": "jest tests/integration --runInBand"
}
```

---

## Troubleshooting

### Coverage Shows 0%
**Diagnosis:** Check if tests are actually running
```bash
npm run test:coverage-safe | grep "Test Suites:"
# Should show: "Test Suites: X passed, X total"
```

### Coverage Files Not Generated
**Diagnosis:** Check jest.config.js
```bash
grep -A 5 "coverageDirectory" jest.config.js
# Should show: coverageDirectory: 'coverage'
```

### Coverage Incomplete
**Diagnosis:** Check if tests are passing
```bash
npm run test:coverage-safe | grep "Tests:"
# Look for failed tests
```

### Memory Issues During Coverage
**Solution:** Use safe mode
```bash
npm run test:coverage-safe  # Optimized for memory
# Or
npm run test:unit -- --coverage  # Unit tests only
```

---

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Run tests with coverage
  run: npm run test:coverage-safe

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
    flags: unittests
    name: codecov-umbrella
```

### Coverage Badge
```markdown
![Coverage](https://img.shields.io/badge/coverage-0.95%25-red)
```

---

## Next Steps

### Immediate (To Reach 10% Coverage)
1. Run full test suite (currently only 3/132 suites running)
2. Fix failing tests in `fleet-manager.test.ts`
3. Add basic tests for main modules

### Short-term (To Reach 40% Coverage)
1. Add tests for all agents (20 files)
2. Add tests for CLI commands (15+ files)
3. Add tests for core modules

### Long-term (To Reach 70% Target)
1. Add integration tests
2. Add edge case tests
3. Add error handling tests
4. Continuous coverage monitoring

---

## Resources

### Documentation
- [Jest Coverage Documentation](https://jestjs.io/docs/configuration#coverage)
- [LCOV Format Specification](http://ltp.sourceforge.net/coverage/lcov/geninfo.1.php)
- [Istanbul Coverage Reports](https://istanbul.js.org/)

### Tools
- **Coverage Gutters** (VS Code extension): Show coverage in editor
- **Codecov**: Cloud coverage tracking
- **Coveralls**: Alternative coverage tracking

### Project Docs
- [Coverage Instrumentation Analysis](/workspaces/agentic-qe-cf/docs/reports/coverage-instrumentation-analysis.md)
- [TEST-001 Resolution Summary](/workspaces/agentic-qe-cf/docs/reports/TEST-001-RESOLUTION-SUMMARY.md)

---

**Last Updated:** 2025-10-17
**Status:** ✅ Coverage instrumentation working correctly
**Current Coverage:** 0.95% (215/22,474 lines)
**Target Coverage:** 70%
**Gap:** 69.05%
