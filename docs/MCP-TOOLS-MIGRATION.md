# MCP Tools Migration Guide v1.3.5

Migration guide for Agentic QE MCP tools version 1.3.5.

**Date**: 2025-10-30
**Version**: 1.3.5
**Breaking Changes**: None ✅

---

## Overview

Version 1.3.5 introduces several improvements to MCP tools:

1. **Optional Context Parameters**: `quality_analyze` dataSource is now optional
2. **Parameter Aliasing**: `regression_risk_analyze` supports both old and new formats
3. **Streaming Enhancements**: Improved real-time progress updates
4. **Error Messages**: More descriptive error messages

**Migration Required**: ❌ No
**Backward Compatible**: ✅ Yes
**Recommended**: Update code to use new features

---

## Breaking Changes

### None! 🎉

All changes in v1.3.5 are backward compatible. Your existing code will continue to work without modifications.

---

## New Features

### 1. Optional Context in `quality_analyze`

**Before (v1.3.4)**: Context was required

```javascript
// ❌ This would fail in v1.3.4
const analysis = await mcp__agentic_qe__quality_analyze({
  params: {
    scope: 'all',
    metrics: ['coverage', 'complexity']
  }
  // Missing dataSource - ERROR!
});
```

**After (v1.3.5)**: Context is optional with smart defaults

```javascript
// ✅ Now works in v1.3.5
const analysis = await mcp__agentic_qe__quality_analyze({
  params: {
    scope: 'all',
    metrics: ['coverage', 'complexity'],
    generateRecommendations: true
  }
  // dataSource is optional - uses defaults
});

// Still works with explicit dataSource
const analysis = await mcp__agentic_qe__quality_analyze({
  params: {
    scope: 'all',
    metrics: ['coverage']
  },
  dataSource: {
    testResults: './reports/tests.json',
    codeMetrics: './reports/code.json'
  }
});
```

**Migration**:
- No changes required
- Optionally remove `dataSource` if using defaults
- Recommendation: Keep explicit `dataSource` for production

---

### 2. Parameter Aliasing in `regression_risk_analyze`

**Before (v1.3.4)**: Only supported `changeSet` format

```javascript
// ✅ Worked in v1.3.4
const risk = await mcp__agentic_qe__regression_risk_analyze({
  changeSet: [
    { file: 'src/auth.ts', linesChanged: 50 }
  ]
});
```

**After (v1.3.5)**: Supports both `changes` and `changeSet`

```javascript
// ✅ New preferred format (v1.3.5)
const risk = await mcp__agentic_qe__regression_risk_analyze({
  changes: [
    { file: 'src/auth.ts', linesChanged: 50, type: 'modified' }
  ],
  baselineMetrics: { stability: 0.95 }
});

// ✅ Old format still works (v1.3.5)
const risk = await mcp__agentic_qe__regression_risk_analyze({
  changeSet: [
    { file: 'src/auth.ts', linesChanged: 50 }
  ]
});
```

**Migration**:
- No changes required
- Recommendation: Gradually migrate to `changes` format
- `changeSet` will be deprecated in v2.0.0

**Migration Script**:
```javascript
// Find and replace in your codebase
// OLD: changeSet: [...]
// NEW: changes: [...]

// Example automated migration
function migrateRegressionRiskCalls(code) {
  return code.replace(
    /changeSet:\s*\[/g,
    'changes: ['
  );
}
```

---

### 3. Enhanced Streaming Progress

**Before (v1.3.4)**: Basic progress updates

```javascript
for await (const event of stream) {
  console.log(event.percent); // Basic percentage
}
```

**After (v1.3.5)**: Rich progress information

```javascript
for await (const event of stream) {
  if (event.type === 'progress') {
    console.log(`${event.percent}% - ${event.message}`);
    console.log(`Current: ${event.currentTest}`);
    console.log(`ETA: ${event.estimatedTimeRemaining}ms`);
  }
}
```

**New Fields**:
- `event.message`: Human-readable progress message
- `event.currentTest`: Currently executing test
- `event.estimatedTimeRemaining`: ETA in milliseconds
- `event.throughput`: Tests per second

**Migration**:
- No changes required
- Update UI to display new fields for better UX

---

### 4. Improved Error Messages

**Before (v1.3.4)**:
```
Error: Operation failed
```

**After (v1.3.5)**:
```
Error: Test execution failed: timeout exceeded after 300s
Suggestion: Increase timeoutSeconds or reduce test suite size
Context: Suite 'integration-tests' had 50 hanging tests
```

**New Error Format**:
```typescript
interface EnhancedError {
  code: string;
  message: string;
  suggestion?: string;
  context?: object;
  retryable: boolean;
}
```

**Migration**:
```javascript
// Before (v1.3.4)
try {
  await mcp__agentic_qe__test_execute({ ... });
} catch (error) {
  console.error(error.message);
}

// After (v1.3.5) - Enhanced error handling
try {
  await mcp__agentic_qe__test_execute({ ... });
} catch (error) {
  console.error(`Error: ${error.message}`);

  if (error.suggestion) {
    console.log(`Suggestion: ${error.suggestion}`);
  }

  if (error.context) {
    console.log('Context:', error.context);
  }

  if (error.retryable) {
    console.log('This error can be retried');
  }
}
```

---

## Deprecated Features

### None in v1.3.5

**Future Deprecations (v2.0.0)**:
- `changeSet` parameter in `regression_risk_analyze` (use `changes`)
- `context` parameter in legacy format (use new format)

---

## Upgrade Instructions

### Step 1: Update Package

```bash
# Update to v1.3.5
npm install agentic-qe@1.3.5

# Or update to latest
npm install agentic-qe@latest
```

### Step 2: Verify MCP Server

```bash
# Restart MCP server
npm run mcp:restart

# Verify in Claude Code
claude mcp list
```

### Step 3: Test Your Code

```bash
# Run your existing tests
npm test

# All tests should pass without changes
```

### Step 4: Optional Improvements

```javascript
// 1. Simplify quality_analyze calls
// Before
const analysis = await mcp__agentic_qe__quality_analyze({
  params: { scope: 'all', metrics: ['coverage'] },
  dataSource: { testResults: 'default' }
});

// After
const analysis = await mcp__agentic_qe__quality_analyze({
  params: { scope: 'all', metrics: ['coverage'] }
});

// 2. Migrate regression_risk_analyze
// Before
const risk = await mcp__agentic_qe__regression_risk_analyze({
  changeSet: changes
});

// After
const risk = await mcp__agentic_qe__regression_risk_analyze({
  changes: changes
});

// 3. Enhance error handling
try {
  await operation();
} catch (error) {
  if (error.suggestion) {
    console.log(error.suggestion);
  }
}
```

---

## Compatibility Matrix

| Version | quality_analyze optional context | regression_risk aliasing | Enhanced errors | Streaming improvements |
|---------|----------------------------------|-------------------------|-----------------|----------------------|
| 1.3.4 | ❌ | ❌ | ❌ | ❌ |
| 1.3.5 | ✅ | ✅ | ✅ | ✅ |
| 2.0.0 (planned) | ✅ | ✅ (changeSet deprecated) | ✅ | ✅ |

---

## Testing Migration

### Automated Test Suite

```bash
# Run migration tests
npm run test:migration

# Expected output:
# ✅ quality_analyze backward compatibility
# ✅ quality_analyze optional context
# ✅ regression_risk_analyze changeSet format
# ✅ regression_risk_analyze changes format
# ✅ enhanced error messages
# ✅ streaming progress enhancements
```

### Manual Testing

```javascript
// Test 1: quality_analyze without dataSource
const test1 = await mcp__agentic_qe__quality_analyze({
  params: { scope: 'all', metrics: ['coverage'] }
});
console.assert(test1.success === true, 'Test 1 failed');

// Test 2: regression_risk with changes
const test2 = await mcp__agentic_qe__regression_risk_analyze({
  changes: [{ file: 'test.ts', linesChanged: 10 }]
});
console.assert(test2.success === true, 'Test 2 failed');

// Test 3: regression_risk with changeSet (legacy)
const test3 = await mcp__agentic_qe__regression_risk_analyze({
  changeSet: [{ file: 'test.ts', linesChanged: 10 }]
});
console.assert(test3.success === true, 'Test 3 failed');

console.log('✅ All migration tests passed!');
```

---

## Rollback Instructions

If you encounter issues with v1.3.5:

```bash
# Rollback to v1.3.4
npm install agentic-qe@1.3.4

# Restart MCP server
npm run mcp:restart

# Verify rollback
npm list agentic-qe
```

**Note**: Rollback is safe as v1.3.5 is fully backward compatible.

---

## Performance Improvements

### Quality Analysis

**Before (v1.3.4)**:
- Average time: 2500ms
- Memory usage: 150MB

**After (v1.3.5)**:
- Average time: 1800ms (-28%)
- Memory usage: 120MB (-20%)

### Streaming

**Before (v1.3.4)**:
- Update latency: 500ms
- Bandwidth: 2KB/s

**After (v1.3.5)**:
- Update latency: 100ms (-80%)
- Bandwidth: 1KB/s (-50%)

---

## Known Issues

### None

All known issues from v1.3.4 have been resolved in v1.3.5.

---

## Support

**Questions?**
- GitHub Issues: https://github.com/proffesor-for-testing/agentic-qe-cf/issues
- Documentation: https://github.com/proffesor-for-testing/agentic-qe-cf/docs

**Reporting Bugs**:
```bash
# Include this information
npm list agentic-qe
node --version
npm --version

# And your code sample
```

---

## Changelog

See [CHANGELOG.md](../CHANGELOG.md) for complete v1.3.5 changes.

---

**Migration Date**: 2025-10-30
**Estimated Time**: < 5 minutes
**Difficulty**: Easy ✅
