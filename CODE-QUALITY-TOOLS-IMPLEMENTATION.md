# Code Quality Tools Implementation

**Status:** COMPLETE
**Date:** 2025-11-09
**Version:** 1.5.0

## Overview

Implemented two production-quality tools in `/src/mcp/tools/qe/code-quality/`:

1. **analyzeComplexity** (547 lines) - Cyclomatic & cognitive complexity with hotspot detection
2. **calculateQualityMetrics** (664 lines) - Maintainability, reliability, security scoring

## Tool 1: Code Complexity Analysis

### File
**Location:** `/workspaces/agentic-qe-cf/src/mcp/tools/qe/code-quality/analyze-complexity.ts`

### Function Signature
```typescript
export async function analyzeComplexity(
  params: ComplexityAnalysisParams
): Promise<ComplexityAnalysisResult>
```

### Key Features

#### Input Parameters
```typescript
interface ComplexityAnalysisParams {
  sourceCode: string;              // Code to analyze
  filePath: string;                // File path for context
  language: 'typescript' | 'javascript' | 'python' | 'java';
  cyclomaticThreshold?: number;    // Default: 10
  cognitiveThreshold?: number;     // Default: 15
  includePerFunction?: boolean;    // Default: true
  includeRecommendations?: boolean; // Default: true
}
```

#### Output Structure
```typescript
{
  filePath: string;
  overallMetrics: ComplexityMetric;          // Overall file metrics
  functionMetrics?: FunctionComplexity[];    // Per-function breakdown
  hotspots: ComplexityHotspot[];            // Detected problem areas
  qualityScore: number;                      // 0-100 quality rating
  summary: {                                  // Summary statistics
    totalFunctions: number;
    hotspotsDetected: number;
    criticalHotspots: number;
    averageComplexity: number;
    maxComplexity: number;
  };
  recommendations?: string[];                // Actionable improvements
  metadata: {                                 // Analysis context
    timestamp: string;
    analysisTimeMs: number;
    language: string;
    linesAnalyzed: number;
  };
}
```

### Analysis Algorithms

#### 1. Cyclomatic Complexity
Counts decision points in code:
- if/else if statements
- for/foreach/while/do-while loops
- case statements in switches
- catch blocks
- ternary operators (? :)
- logical operators (&&, ||)

**Formula:** `CC = decision_points + 1`

#### 2. Cognitive Complexity
Extends cyclomatic with nesting penalty:
- Base: cyclomatic complexity
- Nesting penalty: `(nesting_level - 1) * 2`
- Higher penalty for nested structures (easier to understand flat code)

#### 3. Function-Level Analysis
For each function:
- Cyclomatic complexity
- Cognitive complexity
- Lines of code
- Parameter count
- Maximum nesting depth
- Hotspot status (exceeds threshold)

#### 4. Hotspot Detection
Identifies functions exceeding thresholds:
- **Type:** cyclomatic, cognitive, or size
- **Severity:** low, medium, high, critical
- **Severity Calculation:** `((current - threshold) / threshold) * 100`
  - < 50%: low
  - 50-99%: medium
  - 100-199%: high
  - >= 200%: critical

### Quality Scoring

Score calculation (0-100, higher is better):
```
base_score = 100
for each hotspot:
  deduct: low=3, medium=8, high=15, critical=25

if cyclomatic > 15: deduct 10
if avg_complexity > 15: deduct 15
if loc > 500: deduct 5

final_score = max(0, min(100, base_score))
```

### Recommendations Generated

Smart recommendations based on detected patterns:

1. **Cyclomatic Hotspots:**
   - Extract Method refactoring
   - Strategy/State patterns for conditionals
   - Polymorphism instead of switches

2. **Cognitive Hotspots:**
   - Early returns (guard clauses)
   - Extract nested loops/conditionals
   - Replace ternary operators

3. **Size Hotspots:**
   - Split into focused methods
   - Single Responsibility Principle

## Tool 2: Quality Metrics Calculator

### File
**Location:** `/workspaces/agentic-qe-cf/src/mcp/tools/qe/code-quality/calculate-quality-metrics.ts`

### Function Signature
```typescript
export async function calculateQualityMetrics(
  params: QualityMetricsParams
): Promise<QualityMetricsResult>
```

### Input Parameters
```typescript
interface QualityMetricsParams {
  sourceCode: string;              // Code to analyze
  filePath: string;                // File path
  language: 'typescript' | 'javascript' | 'python' | 'java';
  coveragePercentage?: number;     // Test coverage (0-100), default: 60
  codeSmells?: number;             // Count of detected smells, default: 5
  duplicationPercentage?: number;  // Duplication %, default: 5
  includeSecurityAnalysis?: boolean; // Default: true
  includeTechnicalDebt?: boolean;  // Default: true
}
```

### Output Structure

```typescript
{
  filePath: string;
  maintainability: MaintainabilityScore;     // 0-100 index + components
  reliability: ReliabilityScore;             // 0-100 index + components
  security: SecurityScore;                   // 0-100 index + components
  overallScore: number;                      // Weighted average: 0-100
  rating: 'A' | 'B' | 'C' | 'D' | 'F';      // Quality grade
  technicalDebt?: TechnicalDebt;             // Hours of debt + breakdown
  interpretation: string;                    // Human-readable explanation
  priorities: Array<{                        // Top 5 improvement areas
    category: string;
    issue: string;
    impact: 'high' | 'medium' | 'low';
    effort: 'high' | 'medium' | 'low';
  }>;
  metadata: { ... };                         // Analysis context
}
```

### Maintainability Score Components

**Index Calculation (0-100):**
```
50%: Readability     (Halstead metrics)
25%: Modularity      (avg LOC per function)
15%: Documentation   (doc comment coverage)
10%: Consistency     (indentation, naming)
```

**Readability Algorithm:**
- Halstead metrics: vocabulary size & complexity ratio
- Penalizes large vocabulary with few tokens (cryptic)
- Rewards balanced vocabulary

**Modularity Scoring:**
- Ideal: 50-100 LOC per function → 90+ score
- < 50 LOC: excellent modularity (90)
- 100-200 LOC: good (75)
- 200-500 LOC: poor (50)
- > 500 LOC: critical (25)

**Documentation Coverage:**
- < 5%: 30/100
- 5-10%: 50/100
- 10-20%: 70/100
- 20-40%: 90/100
- > 40%: 100/100

**Consistency Check:**
- Mixed tabs/spaces: -20
- Inconsistent naming conventions: -15

### Reliability Score Components

**Index Calculation (0-100):**
```
35%: Test Coverage       (non-linear, favors high coverage)
25%: Error Handling      (try-catch, logging, validation)
25%: Code Smell Density  (100 - smells * 10)
15%: Complexity Impact   (decision point ratio)
```

**Test Coverage Impact:**
- >= 90%: 100 points
- >= 80%: 90 points
- >= 70%: 75 points
- >= 50%: 50 points
- >= 30%: 30 points
- < 30%: 10 points

**Error Handling Score:**
- Base: 50 points
- +30: try-catch coverage
- +15: error logging detected
- +5: validation patterns present

**Complexity Impact:**
- < 0.1 decision/line: 100 points
- < 0.2: 85 points
- < 0.35: 70 points
- < 0.5: 50 points
- > 0.5: 25 points

### Security Score Components

**Index Calculation (0-100):**
```
35%: Vulnerability Risk   (detects dangerous patterns)
25%: Input Validation     (sanitize/validate/escape)
20%: Dependency Safety    (version checks, audits)
20%: Sensitive Data       (hardcoded secrets detection)
```

**Vulnerability Detection:**
Scans for dangerous patterns:
- `eval()` usage: -10 each
- `new Function()`: -10 each
- `innerHTML` assignment: -10 each (XSS risk)
- SQL injection patterns: -10 each
- Hardcoded passwords: -10 each
- Hardcoded secrets: -10 each
- Hardcoded API keys: -10 each

**Input Validation:**
- Looks for: sanitize, validate, escape, encodeURI
- Each found: +5 points

### Technical Debt Calculation

**Debt Breakdown by Category:**

1. **Maintainability Debt**
   - Formula: `(100 - maintainability) / 100 * loc/100 * 2`
   - 2x multiplier: high impact on long-term maintenance

2. **Reliability Debt**
   - Formula: `(100 - reliability) / 100 * loc/100 * 1.5`
   - 1.5x multiplier: moderate impact

3. **Security Debt**
   - Formula: `(100 - security) / 100 * loc/100 * 2.5`
   - 2.5x multiplier: highest impact (security critical)

4. **Code Smell Debt**
   - Formula: `codeSmells * 0.5 hours/smell`
   - Each smell: 30 min to 1 hour to fix

**Payoff Time:**
- Assumes part-time refactoring: `total_debt / 4 hours`

### Quality Ratings

| Score | Rating | Interpretation |
|-------|--------|-----------------|
| >= 90 | A | Excellent. Well-maintained, reliable, secure. |
| >= 80 | B | Good. Minor improvements recommended. |
| >= 70 | C | Acceptable. Significant improvements needed. |
| >= 60 | D | Poor. Major refactoring required. |
| < 60  | F | Critical. Immediate action required. |

### Improvement Priorities

Generates up to 5 actionable priorities:

1. **Maintainability Issues** (index < 70)
   - Critical if < 50
   - Major if < 70

2. **Documentation Gaps**
   - Coverage < 30%

3. **Reliability Issues** (index < 50)
   - High impact

4. **Testing Gaps**
   - Coverage < 50%

5. **Code Smell Density** (< 70)

6. **Security Issues** (index < 60)

7. **Input Validation** (< 70)

## Integration Pattern

Both tools follow the established pattern from coverage tools:

```typescript
// Helper for consistent response formatting
export function createResponse<T>(data: T, startTime: number): QEToolResponse<T> {
  return {
    success: true,
    data,
    metadata: {
      requestId: `code-quality-${Date.now()}`,
      timestamp: new Date().toISOString(),
      executionTime: Date.now() - startTime,
      version: VERSION
    }
  };
}
```

## Supported Languages

- **TypeScript/JavaScript:** Function patterns, async functions, arrow functions
- **Python:** `def` functions, `async def`, decorators
- **Java:** Public/private methods, static functions, annotations
- Generic fallback for unknown languages

## Code Quality Metrics

Both files:
- **Type Safety:** Full TypeScript, no `any` types
- **Error Handling:** Try-catch with proper cleanup
- **Performance:** O(n) or better for single-pass analysis
- **Testability:** Pure functions, testable algorithms
- **Documentation:** JSDoc comments on all exports
- **Following Pattern:** Mirrors `coverage/calculate-trends.ts` structure

## Files Created

1. **analyze-complexity.ts** (547 lines)
   - 10 helper functions
   - 6 exported types
   - Main export: `analyzeComplexity()`

2. **calculate-quality-metrics.ts** (664 lines)
   - 8 helper functions
   - 9 exported types
   - Main export: `calculateQualityMetrics()`

3. **index.ts** (Updated)
   - Exports both tools
   - Helper response formatter
   - Proper version management

## Compilation Status

✓ TypeScript compilation successful
✓ No type errors
✓ Full type safety across exports
✓ ESM module format with `.js` extensions
✓ Compatible with QE tools framework

## Usage Example

```typescript
import { analyzeComplexity, calculateQualityMetrics } from './qe/code-quality/index.js';

// Analyze complexity with hotspot detection
const complexityResult = await analyzeComplexity({
  sourceCode: codeString,
  filePath: 'src/services/user.ts',
  language: 'typescript',
  cyclomaticThreshold: 10,
  cognitiveThreshold: 15,
  includeRecommendations: true
});

// Calculate comprehensive quality metrics
const qualityResult = await calculateQualityMetrics({
  sourceCode: codeString,
  filePath: 'src/services/user.ts',
  language: 'typescript',
  coveragePercentage: 85,
  codeSmells: 3,
  includeSecurityAnalysis: true,
  includeTechnicalDebt: true
});
```

## Next Steps

These tools can be:
1. Integrated into MCP handlers for agent use
2. Called by quality gates for PR checks
3. Used by coverage analyzer for comprehensive analysis
4. Integrated into CI/CD pipelines for code metrics
5. Exposed via CLI commands for developer feedback

---

**Implementation by:** Code Implementation Agent
**Framework:** Agentic QE Fleet v1.5.0
