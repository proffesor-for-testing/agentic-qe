# Phase 3 Agent Documentation Update Guide

**Status**: 3 of 17 agents updated
**Last Updated**: 2025-11-08
**Task**: Replace placeholder `./servers/qe-tools/` imports with real Phase 3 paths

## ✅ Completed Updates

### 1. qe-coverage-analyzer.md
- **Domain**: Coverage Analysis
- **Types Used**: `SublinearCoverageParams`, `CoverageGapDetectionParams`, `CoverageReport`
- **Import Path**: `agentic-qe/tools/qe/coverage`
- **Status**: ✅ Complete with comprehensive examples

### 2. qe-flaky-test-hunter.md
- **Domain**: Flaky Test Detection
- **Types Used**: `FlakyTestDetectionParams`, `FlakyAnalysisConfig`, `TestResult`
- **Import Path**: `agentic-qe/tools/qe/flaky-detection`
- **Status**: ✅ Complete with ML and statistical analysis examples

### 3. qe-performance-tester.md
- **Domain**: Performance Testing
- **Types Used**: `PerformanceBenchmarkParams`, `RealtimeMonitorParams`
- **Import Path**: `agentic-qe/tools/qe/performance`
- **Status**: ✅ Complete with benchmarking and monitoring examples

## 🔄 Remaining Updates (14 agents)

### Priority 1: Domain-Specific Agents (6 agents)

#### 4. qe-security-scanner.md
```typescript
import type {
  SecurityScanParams,
  SecurityScanResults,
  Vulnerability
} from 'agentic-qe/tools/qe/shared/types';

// Import from: 'agentic-qe/tools/qe/security'
```

#### 5. qe-visual-tester.md
```typescript
// NOTE: Visual testing types not yet defined in types.ts
// Need to add VisualTestParams, VisualDiffParams, etc.
// Import from: 'agentic-qe/tools/qe/visual'
```

#### 6. qe-api-contract-validator.md
```typescript
import type {
  BreakingChangeParams
} from 'agentic-qe/tools/qe/shared/types';

// Import from: 'agentic-qe/tools/qe/security'
```

#### 7. qe-test-executor.md
```typescript
import type {
  UnitTestGenerationParams,
  TestResult,
  TestResultsSummary
} from 'agentic-qe/tools/qe/shared/types';

// Import from: 'agentic-qe/tools/qe/test-execution'
```

#### 8. qe-test-data-architect.md
```typescript
import type {
  UnitTestGenerationParams,
  IntegrationTestGenerationParams
} from 'agentic-qe/tools/qe/shared/types';

// Import from: 'agentic-qe/tools/qe/test-generation'
```

### Priority 2: Quality Gate Agents (3 agents)

#### 9. qe-quality-gate.md
```typescript
import type {
  QualityGateExecutionParams,
  QualityPolicy,
  QualityMetrics
} from 'agentic-qe/tools/qe/shared/types';

// Import from: 'agentic-qe/tools/qe/quality-gates'
```

#### 10. qe-quality-analyzer.md
```typescript
import type {
  QualityMetrics,
  CodeQualityMetrics
} from 'agentic-qe/tools/qe/shared/types';

// Import from: 'agentic-qe/tools/qe/quality-analysis'
```

#### 11. qe-deployment-readiness.md
```typescript
import type {
  QualityGateExecutionParams,
  QualityMetrics,
  Environment
} from 'agentic-qe/tools/qe/shared/types';

// Import from: 'agentic-qe/tools/qe/deployment'
```

### Priority 3: Strategic Agents (5 agents)

#### 12. qe-regression-risk-analyzer.md
```typescript
import type {
  RegressionRiskParams,
  CodeChange,
  QualityMetrics
} from 'agentic-qe/tools/qe/shared/types';

// Import from: 'agentic-qe/tools/qe/regression'
```

#### 13-16. Generic Agents (4 agents)
- qe-requirements-validator.md
- qe-production-intelligence.md
- qe-fleet-commander.md
- qe-chaos-engineer.md

**Pattern for Generic Agents**:
```typescript
/**
 * Phase 3 QE Tools
 *
 * This agent uses general QE patterns.
 * Import from: 'agentic-qe/tools/qe/utils'
 */
import type { QEToolResponse } from 'agentic-qe/tools/qe/shared/types';
```

#### 17. qe-code-complexity.md
```typescript
import type {
  CodeQualityMetrics
} from 'agentic-qe/tools/qe/shared/types';

// Import from: 'agentic-qe/tools/qe/analysis'
```

## 📋 Update Template

Use this template for all remaining agents:

```typescript
/**
 * Phase 3 [Domain] Tools
 *
 * IMPORTANT: Phase 3 domain-specific tools are coming soon!
 * These examples show the REAL API that will be available.
 *
 * Import path: 'agentic-qe/tools/qe/[domain]'
 * Type definitions: 'agentic-qe/tools/qe/shared/types'
 */

import type {
  [RelevantType1],
  [RelevantType2],
  QEToolResponse
} from 'agentic-qe/tools/qe/shared/types';

// Phase 3 [domain] tools (coming soon)
// import {
//   [toolFunction1],
//   [toolFunction2]
// } from 'agentic-qe/tools/qe/[domain]';

// Example: [Use case description]
const params: [RelevantType1] = {
  // Type-safe parameters from types.ts
};

// const result: QEToolResponse<[ReturnType]> =
//   await [toolFunction1](params);
//
// if (result.success && result.data) {
//   console.log('Results:', result.data);
// }

console.log('✅ [Domain] operation complete');
```

### Phase 3 Tool Discovery Template

```bash
# Once Phase 3 is implemented, tools will be at:
# /workspaces/agentic-qe-cf/src/mcp/tools/qe/[domain]/

# List available [domain] tools (Phase 3)
ls node_modules/agentic-qe/dist/mcp/tools/qe/[domain]/

# Check type definitions
cat node_modules/agentic-qe/dist/mcp/tools/qe/shared/types.d.ts | grep -A 20 "[TypeName]"

# Via CLI (Phase 3)
# aqe [domain] [command] --[options]
```

## 🔧 Batch Update Script

For efficient batch updates, use this script:

```bash
#!/bin/bash
# update-agent-docs.sh - Batch update agent documentation

AGENTS=(
  "qe-security-scanner:security:SecurityScanParams"
  "qe-visual-tester:visual:VisualTestParams"
  "qe-api-contract-validator:security:BreakingChangeParams"
  "qe-test-executor:test-execution:TestResult"
  "qe-test-data-architect:test-generation:UnitTestGenerationParams"
  "qe-quality-gate:quality-gates:QualityGateExecutionParams"
  "qe-quality-analyzer:quality-analysis:QualityMetrics"
  "qe-deployment-readiness:deployment:QualityMetrics"
  "qe-regression-risk-analyzer:regression:RegressionRiskParams"
  "qe-code-complexity:analysis:CodeQualityMetrics"
)

for agent_info in "${AGENTS[@]}"; do
  IFS=':' read -r agent domain type <<< "$agent_info"
  echo "Updating $agent with domain=$domain, type=$type"

  # Run sed or Edit tool to replace placeholder imports
  # Example: sed -i "s|from './servers/qe-tools/.*'|from 'agentic-qe/tools/qe/$domain'|g" .claude/agents/$agent.md
done
```

## ✅ Verification Checklist

After updating each agent:

1. ✅ Imports use correct paths: `agentic-qe/tools/qe/[domain]`
2. ✅ Types imported from: `agentic-qe/tools/qe/shared/types`
3. ✅ Phase 3 comment present explaining coming soon status
4. ✅ Code examples are commented out (awaiting implementation)
5. ✅ Type usage is correct (no `any` types)
6. ✅ Placeholder console.log statements present
7. ✅ Tool discovery section updated with correct paths
8. ✅ CLI examples show future Phase 3 commands

## 📊 Progress Tracking

Update this section as agents are completed:

- [x] qe-coverage-analyzer.md (3 comprehensive examples)
- [x] qe-flaky-test-hunter.md (4 comprehensive examples)
- [x] qe-performance-tester.md (2 comprehensive examples)
- [ ] qe-security-scanner.md
- [ ] qe-visual-tester.md
- [ ] qe-api-contract-validator.md
- [ ] qe-test-executor.md
- [ ] qe-test-data-architect.md
- [ ] qe-quality-gate.md
- [ ] qe-quality-analyzer.md
- [ ] qe-deployment-readiness.md
- [ ] qe-regression-risk-analyzer.md
- [ ] qe-requirements-validator.md
- [ ] qe-production-intelligence.md
- [ ] qe-fleet-commander.md
- [ ] qe-chaos-engineer.md
- [ ] qe-code-complexity.md

**Progress**: 3/17 (17.6%)

## 🎯 Next Steps

1. **Immediate**: Continue updating domain-specific agents (Priority 1)
2. **Short-term**: Update quality gate agents (Priority 2)
3. **Long-term**: Update strategic agents (Priority 3)
4. **Final**: Update init.ts templates to use correct imports
5. **Validation**: Run TypeScript compiler to verify all examples

## 📝 Notes

- All type definitions are already in `/workspaces/agentic-qe-cf/src/mcp/tools/qe/shared/types.ts`
- Phase 3 domain tools will be implemented at `/workspaces/agentic-qe-cf/src/mcp/tools/qe/[domain]/`
- Use `qe-coverage-analyzer.md` as the gold standard reference
- Reference agents show working patterns users can copy-paste once Phase 3 is implemented
