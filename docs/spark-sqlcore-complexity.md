# Apache Spark SQL Core Module - Code Complexity Analysis

**Module**: `/tmp/spark/sql/core`
**Analysis Date**: 2025-12-16
**Scope**: sql/core module only

## Executive Summary

**Total Files**: 1,711 source files (.scala, .java)
**Total LOC**: 1,150,590 lines
**Files Over 300 LOC**: 492 (28.7%)

## Top 5 Most Complex Files by LOC

| Rank | File | LOC | Test Methods |
|------|------|-----|--------------|
| 1 | MergeIntoTableSuiteBase.scala | 6,500 | 123 |
| 2 | DataFrameFunctionsSuite.scala | 6,318 | 143 |
| 3 | SQLQuerySuite.scala | 5,093 | 249 |
| 4 | JsonSuite.scala | 4,283 | N/A |
| 5 | RocksDBSuite.scala | 4,198 | N/A |

## Top 3 Complexity Hotspots

### 1. MergeIntoTableSuiteBase.scala (6,500 LOC)
**Location**: `/tmp/spark/sql/core/src/test/scala/org/apache/spark/sql/connector/MergeIntoTableSuiteBase.scala`

**Issues**:
- Critical file size (21.7x threshold of 300 LOC)
- 123 test methods in single file
- Abstract test base with extensive MERGE INTO scenarios

**Recommendations**:
- Split into 8-10 specialized test suites by scenario type
- Extract helper methods to separate utilities
- Create focused test classes for: conflict resolution, schema evolution, partitioning, default values

### 2. DataFrameFunctionsSuite.scala (6,318 LOC)
**Location**: `/tmp/spark/sql/core/src/test/scala/org/apache/spark/sql/DataFrameFunctionsSuite.scala`

**Issues**:
- Critical file size (21.1x threshold)
- 143 test methods covering all DataFrame functions
- Complex function parity validation logic

**Recommendations**:
- Organize by function category: string, date/time, aggregate, window, array
- Extract parity validation logic to separate test
- Split into 6-8 category-specific test suites

### 3. SQLQuerySuite.scala (5,093 LOC)
**Location**: `/tmp/spark/sql/core/src/test/scala/org/apache/spark/sql/SQLQuerySuite.scala`

**Issues**:
- Critical file size (17.0x threshold)
- 249 test methods (highest count)
- Covers broad SQL query functionality

**Recommendations**:
- Decompose by SQL operation: SELECT, JOIN, aggregation, subqueries
- Extract test data setup to shared fixtures
- Create 10-12 focused test suites by SQL feature area

## Quality Impact

**Risk Level**: HIGH

- 28.7% of files exceed maintainability threshold (300 LOC)
- Top 3 files average 17-22x over threshold
- Test suites dominate complexity (all top 5 are test files)
- High coupling in test base classes increases fragility

## Recommendations Summary

1. **Immediate**: Split MergeIntoTableSuiteBase into 8+ focused test classes
2. **Short-term**: Refactor DataFrameFunctionsSuite by function categories
3. **Long-term**: Establish 500 LOC limit for test files with automated enforcement

---

**Analyzer**: QE Code Complexity Agent
**Analysis Type**: LOC-based complexity assessment
**Thresholds**: Cyclomatic: 10, Cognitive: 15, LOC: 300
