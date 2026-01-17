# Migration Guide: Issue #115 MCP Tool Optimization

**Version**: v2.1.0
**Date**: December 2025
**Impact**: Breaking changes to MCP tool names and loading strategy

---

## Overview

### What Changed

Issue #115 introduced a **lazy-loading tool architecture** that achieves:
- **87% token reduction** in tool context (170K → 22K tokens)
- **Faster initialization** via on-demand domain loading
- **Improved tool discovery** with keyword-based categorization
- **Consolidated quality gate tools** (9 tools → 3 tools)

### Why This Matters

The previous approach loaded all 50+ tools upfront, consuming excessive token budget and slowing down initialization. The new architecture:
1. Loads core meta-tools immediately (`tools_discover`, `tools_load_domain`)
2. Lazy-loads domain-specific tools only when needed
3. Uses intelligent keyword detection to auto-load relevant domains
4. Reduces token overhead by 87% while maintaining full functionality

---

## Tool Mapping Reference

### Renamed Tools

| **Old Tool Name** | **New Tool Name** | **Domain** | **Notes** |
|------------------|------------------|-----------|-----------|
| `test_generate` | `test_generate_enhanced` | `test-generation` | Enhanced with AI pattern recognition |
| `quality_analyze` | `qe_qualitygate_evaluate` | `quality-gates` | Consolidated quality evaluation |
| `predict_defects` | `predict_defects_ai` | `ai-analysis` | AI-powered defect prediction |
| `optimize_tests` | `test_optimize_sublinear` | `test-optimization` | Sublinear optimization algorithms |
| `requirements_validate` | `qe_requirements_validate` | `requirements` | Requirements validation |
| `requirements_generate_bdd` | `qe_requirements_generate_bdd` | `requirements` | BDD scenario generation |
| `regression_risk_analyze` | `qe_regression_analyze_risk` | `regression` | Regression risk analysis |

### Consolidated Tools (Quality Gates)

The following **9 legacy tools** have been **merged into 3 new tools**:

#### Legacy Tools (Removed):
- `quality_gate_execute`
- `quality_validate_metrics`
- `quality_risk_assess`
- `quality_decision_make` ❌
- `quality_policy_check` ❌

#### New Tools:
1. **`qe_qualitygate_evaluate`** - Comprehensive quality gate evaluation (replaces `quality_gate_execute`, `quality_decision_make`, `quality_policy_check`)
2. **`qe_qualitygate_validate_metrics`** - Metrics validation (replaces `quality_validate_metrics`)
3. **`qe_qualitygate_assess_risk`** - Risk assessment (replaces `quality_risk_assess`)

---

## New Meta-Tools

### 1. `tools_discover` - Discover Available Domains

**Purpose**: List all available tool domains and their capabilities.

**Usage**:
```typescript
// Discover all domains
mcp__agentic-qe__tools_discover({
  format: "summary" // or "detailed", "json"
})

// Filter by keyword
mcp__agentic-qe__tools_discover({
  keyword: "quality",
  format: "detailed"
})
```

**Response Example**:
```json
{
  "domains": [
    {
      "id": "quality-gates",
      "name": "Quality Gates & Validation",
      "toolCount": 3,
      "keywords": ["quality", "gate", "validation", "metrics", "risk"],
      "description": "Comprehensive quality gate evaluation and validation"
    },
    {
      "id": "test-generation",
      "name": "Test Generation",
      "toolCount": 2,
      "keywords": ["test", "generate", "create", "ai"],
      "description": "AI-powered test generation and enhancement"
    }
  ],
  "totalDomains": 8,
  "totalTools": 24
}
```

### 2. `tools_load_domain` - Load Domain-Specific Tools

**Purpose**: Lazy-load tools for a specific domain on demand.

**Usage**:
```typescript
// Load quality gates tools
mcp__agentic-qe__tools_load_domain({
  domain: "quality-gates"
})

// Load multiple domains
mcp__agentic-qe__tools_load_domain({
  domain: "test-generation,test-execution"
})
```

**Response**:
```json
{
  "loaded": ["quality-gates"],
  "tools": [
    "qe_qualitygate_evaluate",
    "qe_qualitygate_validate_metrics",
    "qe_qualitygate_assess_risk"
  ],
  "tokenCount": 3420
}
```

---

## Migration Examples

### Example 1: Quality Gate Evaluation

#### Before (v2.0.x):
```typescript
// Old approach - 9 separate tools
mcp__agentic-qe__quality_gate_execute({
  gateName: "pre-release",
  metrics: { coverage: 85, passRate: 95 }
})

mcp__agentic-qe__quality_validate_metrics({
  metrics: { coverage: 85, passRate: 95 },
  thresholds: { coverage: 80, passRate: 90 }
})

mcp__agentic-qe__quality_decision_make({
  gateResults: {...}
})
```

#### After (v2.1.x):
```typescript
// Step 1: Discover quality tools (optional - auto-loads via keywords)
mcp__agentic-qe__tools_discover({
  keyword: "quality"
})

// Step 2: Use consolidated tool
mcp__agentic-qe__qe_qualitygate_evaluate({
  gateName: "pre-release",
  metrics: { coverage: 85, passRate: 95 },
  thresholds: { coverage: 80, passRate: 90 },
  autoDecision: true // Replaces quality_decision_make
})
```

### Example 2: Test Generation with AI

#### Before (v2.0.x):
```typescript
mcp__agentic-qe__test_generate({
  sourceCode: "class UserService {...}",
  language: "typescript",
  testType: "unit"
})
```

#### After (v2.1.x):
```typescript
// Auto-loads 'test-generation' domain via keyword detection
mcp__agentic-qe__test_generate_enhanced({
  sourceCode: "class UserService {...}",
  language: "typescript",
  testType: "unit",
  aiEnhancement: true, // NEW: AI pattern recognition
  detectAntiPatterns: true // NEW: Anti-pattern detection
})
```

### Example 3: Defect Prediction

#### Before (v2.0.x):
```typescript
mcp__agentic-qe__predict_defects({
  codeMetrics: {...},
  historicalData: [...]
})
```

#### After (v2.1.x):
```typescript
// Auto-loads 'ai-analysis' domain
mcp__agentic-qe__predict_defects_ai({
  codeMetrics: {...},
  historicalData: [...],
  modelType: "neural", // NEW: AI model selection
  confidence: 0.85 // NEW: Confidence threshold
})
```

### Example 4: Test Optimization

#### Before (v2.0.x):
```typescript
mcp__agentic-qe__optimize_tests({
  testSuites: [...],
  optimizationGoal: "reduce-execution-time"
})
```

#### After (v2.1.x):
```typescript
// Auto-loads 'test-optimization' domain
mcp__agentic-qe__test_optimize_sublinear({
  testSuites: [...],
  optimizationGoal: "reduce-execution-time",
  algorithm: "sublinear", // NEW: O(log n) algorithms
  maxExecutionTime: 300 // NEW: Time constraints
})
```

---

## Automatic Domain Loading

The new architecture includes **intelligent keyword detection** that auto-loads domains based on task context:

### Keyword Triggers

| **Keywords** | **Auto-Loaded Domain** |
|-------------|----------------------|
| `quality`, `gate`, `validation`, `metrics` | `quality-gates` |
| `test`, `generate`, `create` | `test-generation` |
| `execute`, `run`, `parallel` | `test-execution` |
| `coverage`, `analyze`, `gap` | `coverage-analysis` |
| `defect`, `predict`, `ai` | `ai-analysis` |
| `optimize`, `sublinear`, `reduce` | `test-optimization` |
| `requirement`, `bdd`, `scenario` | `requirements` |
| `regression`, `risk`, `impact` | `regression` |

**Example**: Saying "analyze test coverage" will auto-load `coverage-analysis` domain.

---

## Deprecation Timeline

### Phase 1: v2.1.0 (Current - December 2025)
- ✅ New tools available alongside legacy tools
- ⚠️ Deprecation warnings for old tool names
- ✅ Full backward compatibility maintained

### Phase 2: v2.1.5 (January 2026)
- ⚠️ Legacy tools marked as deprecated in responses
- ✅ Migration guide prominent in documentation

### Phase 3: v2.2.0 (March 2026)
- ❌ Legacy tools **removed completely**
- ✅ Only new tool names supported
- ✅ Auto-migration script provided

---

## Migration Checklist

### For Users

- [ ] Review [Tool Mapping Reference](#tool-mapping-reference)
- [ ] Update MCP tool calls to new names
- [ ] Test `tools_discover` for domain exploration
- [ ] Verify quality gate consolidation works for your use cases
- [ ] Remove references to deprecated tools (`quality_decision_make`, `quality_policy_check`)

### For Developers

- [ ] Update agent spawning scripts to use new tool names
- [ ] Refactor quality gate logic to use consolidated `qe_qualitygate_evaluate`
- [ ] Add domain loading logic if custom workflows exist
- [ ] Update documentation and examples
- [ ] Add keyword triggers for custom domains (if applicable)

---

## Getting Help

### Resources
- **Issue Tracker**: [#115](https://github.com/proffesor-for-testing/agentic-qe-cf/issues/115)
- **Documentation**: [docs/reference/tools.md](../reference/tools.md)
- **Examples**: [examples/tool-usage/](../../examples/tool-usage/)

### Support Commands
```bash
# Discover available domains
aqe tools discover

# Load specific domain
aqe tools load quality-gates

# Check tool status
aqe tools status
```

### Community
- **Discussions**: [GitHub Discussions](https://github.com/proffesor-for-testing/agentic-qe-cf/discussions)
- **Discord**: [Agentic QE Community](#)

---

## Summary

**Key Takeaways**:
1. **87% token reduction** via lazy loading
2. **Consolidated quality tools** (9 → 3)
3. **Auto-loading domains** via keyword detection
4. **Enhanced AI capabilities** in test generation and defect prediction
5. **Backward compatible** until v2.2.0 (March 2026)

**Migration Path**:
1. Use `tools_discover` to explore new tools
2. Update tool calls to new names using mapping table
3. Leverage auto-loading for common tasks
4. Remove legacy tool references before v2.2.0

---

**Last Updated**: December 6, 2025
**Version**: 2.1.0
**Author**: Agentic QE Team
