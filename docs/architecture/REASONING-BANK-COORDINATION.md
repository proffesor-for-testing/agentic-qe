# ReasoningBank Coordination Guide (Phase 2)

## Overview

This document defines the coordination contracts between the ReasoningBank Architect and other Phase 2 agents.

---

## 1. Coordination with Pattern-Extraction-Specialist

**Agent:** `pattern-extraction-specialist`
**Milestone:** `pattern-extraction`
**Memory Key:** `phase2/pattern-extraction-contract`

### 1.1 Code Signature Format Contract

The Pattern Extraction Specialist must generate `CodeSignature` objects that match this specification:

```typescript
interface CodeSignature {
    functionName?: string;
    parameters: Array<{
        name: string;
        type: string;
        optional: boolean;
    }>;
    returnType?: string;
    imports: Array<{
        module: string;
        identifiers: string[];
    }>;
    dependencies: string[];
    complexity: {
        cyclomaticComplexity: number;
        cognitiveComplexity: number;
    };
    testStructure: {
        describeBlocks: number;
        itBlocks: number;
        hooks: string[];  // 'beforeEach', 'afterEach', etc.
    };
}
```

### 1.2 Required Deliverables

1. **AST Parser Module** (`src/reasoning/extractors/ASTParser.ts`)
   - Parse TypeScript/JavaScript test files to AST
   - Support Jest, Mocha, Cypress syntax
   - Extract test structure (describe/it blocks)

2. **Signature Extractor** (`src/reasoning/extractors/SignatureExtractor.ts`)
   - Extract function signatures from source code
   - Compute complexity metrics (cyclomatic, cognitive)
   - Normalize signatures for consistent hashing

3. **Template Generator** (`src/reasoning/extractors/TemplateGenerator.ts`)
   - Convert concrete tests to reusable templates
   - Identify placeholders ({{functionName}}, {{params}}, etc.)
   - Generate assertion templates

4. **Quality Scorer** (`src/reasoning/extractors/QualityScorer.ts`)
   - Compute pattern quality metrics
   - Calculate coverage contribution
   - Assess maintainability and reliability

### 1.3 Integration Points

**Input:** Test file paths (glob patterns)
**Output:** Array of `TestPattern` objects

```typescript
// Example usage
const extractor = new PatternExtractor();
const patterns = await extractor.extractFromFiles({
    testFiles: ['./tests/**/*.test.ts'],
    framework: 'jest',
    projectId: 'my-app',
    minQuality: 0.7
});

for (const pattern of patterns) {
    await reasoningBank.storePattern(pattern);
}
```

### 1.4 Performance Requirements

- **Extraction Speed:** < 250ms per test file (p95)
- **Accuracy:** > 90% pattern identification rate
- **Quality Scoring:** < 50ms per pattern
- **Memory Usage:** < 100MB for 100 test files

### 1.5 Coordination Actions

- [ ] Review `CodeSignature` interface in `/src/reasoning/types.ts`
- [ ] Implement AST parsing for Jest, Mocha, Cypress
- [ ] Validate extracted signatures against schema
- [ ] Share sample extracted patterns in `phase2/sample-patterns` memory key

---

## 2. Coordination with Integration-Coordinator

**Agent:** `integration-coordinator`
**Milestone:** `integration`
**Memory Key:** `phase2/integration-contracts`

### 2.1 API Integration Contracts

#### 2.1.1 TestGeneratorAgent Integration

**Contract ID:** `INT-001`

```typescript
// TestGeneratorAgent → ReasoningBank query flow
class TestGeneratorAgent {
    async generateTests(targetFile: string): Promise<TestSuite> {
        // 1. Extract code signature from target file
        const signature = await this.extractCodeSignature(targetFile);

        // 2. Query ReasoningBank for similar patterns
        const matches = await this.reasoningBank.findPatterns({
            codeSignature: signature,
            framework: this.framework,
            minSimilarity: 0.75,
            limit: 5,
            sortBy: 'similarity'
        });

        // 3. Use top matches as templates
        const tests = await this.generateFromPatterns(targetFile, matches);

        // 4. Store successful patterns back to ReasoningBank
        for (const test of tests) {
            if (test.quality.coverage > 0.8) {
                await this.reasoningBank.storePattern(test.pattern);
            }
        }

        return tests;
    }
}
```

**SLA:**
- Pattern lookup: < 50ms (p95)
- Match accuracy: > 85%
- Cache hit rate: > 80%

#### 2.1.2 CoverageAnalyzerAgent Integration

**Contract ID:** `INT-002`

```typescript
// CoverageAnalyzerAgent → ReasoningBank extraction flow
class CoverageAnalyzerAgent {
    async analyzeCoverage(coverageReport: CoverageReport): Promise<Analysis> {
        const gaps = await this.identifyCoverageGaps(coverageReport);

        for (const gap of gaps) {
            // 1. Query ReasoningBank for patterns matching uncovered code
            const recommendations = await this.reasoningBank.findPatterns({
                codeSignature: gap.signature,
                patternType: gap.type,  // 'edge-case', 'boundary', etc.
                framework: this.framework,
                limit: 3
            });

            gap.recommendedPatterns = recommendations;
        }

        // 2. Extract patterns from existing test suite
        const patterns = await this.reasoningBank.extractPatterns({
            testFiles: this.testFiles,
            framework: this.framework,
            projectId: this.projectId,
            minQuality: 0.7
        });

        return { gaps, extractedPatterns: patterns };
    }
}
```

**SLA:**
- Pattern extraction: < 250ms per file (p95)
- Pattern recommendation: < 100ms
- Minimum 3 recommendations per gap

#### 2.1.3 TestExecutorAgent Integration

**Contract ID:** `INT-003`

```typescript
// TestExecutorAgent → ReasoningBank usage tracking
class TestExecutorAgent {
    async executeTests(testSuite: TestSuite): Promise<ExecutionResult> {
        const results = await this.runTests(testSuite);

        // Update pattern usage statistics
        for (const result of results) {
            const patternId = await this.identifyPattern(result.testCode);

            if (patternId) {
                await this.reasoningBank.updateUsage(patternId, this.projectId, {
                    success: result.passed,
                    coverageGain: result.coverageDelta,
                    executionTime: result.duration,
                    errors: result.errors
                });
            }
        }

        return results;
    }
}
```

**SLA:**
- Usage update: < 10ms (p95)
- Pattern identification: < 50ms
- Batch updates: < 50ms for 100 tests

### 2.2 Event Bus Integration

**Events Emitted by ReasoningBank:**

```typescript
// Pattern stored event
eventBus.emit('pattern:stored', {
    patternId: string,
    framework: Framework,
    patternType: PatternType,
    projectId: string,
    quality: QualityMetrics
});

// Pattern matched event
eventBus.emit('pattern:matched', {
    queryHash: string,
    matchCount: number,
    topSimilarity: number,
    duration: number
});

// Pattern used event
eventBus.emit('pattern:used', {
    patternId: string,
    projectId: string,
    success: boolean,
    coverageGain: number
});

// Pattern quality updated event
eventBus.emit('pattern:quality_updated', {
    patternId: string,
    oldQuality: number,
    newQuality: number,
    trend: 'rising' | 'stable' | 'declining'
});
```

**Events Consumed by ReasoningBank:**

```typescript
// New test generated - extract pattern
eventBus.on('test:generated', async (data) => {
    const pattern = await patternExtractor.extractFromTest(data.testCode);
    if (pattern.metadata.quality.coverage > 0.7) {
        await reasoningBank.storePattern(pattern);
    }
});

// Test executed - update usage stats
eventBus.on('test:executed', async (data) => {
    const patternId = await identifyPattern(data.testCode);
    if (patternId) {
        await reasoningBank.updateUsage(patternId, data.projectId, {
            success: data.passed,
            coverageGain: data.coverageDelta
        });
    }
});

// Coverage analyzed - identify gaps
eventBus.on('coverage:analyzed', async (data) => {
    for (const gap of data.gaps) {
        const recommendations = await reasoningBank.findPatterns({
            codeSignature: gap.signature,
            patternType: gap.type
        });
        gap.recommendations = recommendations;
    }
});
```

### 2.3 Memory Manager Integration

**Purpose:** Share patterns across fleet instances

```typescript
// Publish pattern to fleet memory
await memoryManager.store(
    `patterns/${patternId}`,
    pattern,
    {
        namespace: 'reasoning-bank',
        ttl: 86400000,  // 24 hours
        persist: true,
        metadata: { projectId, framework }
    }
);

// Subscribe to pattern updates
memoryManager.on('store', async (event) => {
    if (event.namespace === 'reasoning-bank') {
        const pattern = event.value as TestPattern;
        await reasoningBank.storePattern(pattern);
    }
});

// Query shared patterns
const sharedPatterns = await memoryManager.search({
    namespace: 'reasoning-bank',
    pattern: '*edge-case*',
    limit: 10
});
```

### 2.4 Integration Testing Requirements

1. **End-to-End Pattern Flow** (50+ scenarios)
   - Test generation with pattern lookup
   - Pattern extraction from test suite
   - Cross-framework pattern sharing
   - Usage tracking and quality updates

2. **Performance Benchmarks**
   - Pattern lookup: 1000 queries → < 50ms p95
   - Pattern storage: 100 patterns → < 25ms p95
   - Similarity computation: 1000 pairs → < 100ms p95

3. **Data Validation**
   - Schema validation for all stored patterns
   - Referential integrity (foreign keys)
   - Quality score range validation (0.0 - 1.0)

### 2.5 Coordination Actions

- [ ] Review API contracts in this document
- [ ] Implement event bus integration
- [ ] Implement memory manager integration
- [ ] Create integration test suite
- [ ] Validate performance benchmarks
- [ ] Document API usage examples

---

## 3. Cross-Agent Dependencies

### 3.1 Dependency Graph

```
ReasoningBank Architect
    ↓ (provides API contract)
Pattern Extraction Specialist
    ↓ (provides extractors)
Integration Coordinator
    ↓ (integrates with agents)
Testing Validator
    ↓ (validates integration)
Learning System Developer (uses patterns for RL)
```

### 3.2 Shared Memory Keys

| Key | Namespace | Owner | Purpose |
|-----|-----------|-------|---------|
| `task-assignments` | `phase2` | Integration Coordinator | Task allocation |
| `architecture-decisions` | `phase2` | ReasoningBank Architect | ADRs and contracts |
| `pattern-extraction-contract` | `phase2` | Pattern Extraction Specialist | Code signature format |
| `integration-contracts` | `phase2` | Integration Coordinator | API contracts |
| `sample-patterns` | `phase2` | Pattern Extraction Specialist | Sample extracted patterns |
| `test-results` | `phase2` | Testing Validator | Integration test results |

---

## 4. Communication Protocol

### 4.1 Status Updates

All agents should store status updates in shared memory:

```typescript
await memoryManager.store(
    `status/${agentId}`,
    {
        agent: 'reasoningbank-architect',
        milestone: 'milestone-2.1-reasoningbank',
        status: 'in_progress',
        progress: 0.85,
        blockers: [],
        deliverables_complete: [
            'Architecture Documentation',
            'Database Schema',
            'TypeScript Interfaces',
            'QEReasoningBank Class Stub'
        ],
        deliverables_pending: [
            'Pattern extraction implementation',
            'Similarity scoring algorithm',
            'Integration testing'
        ],
        next_actions: [
            'Coordinate with pattern-extraction-specialist',
            'Coordinate with integration-coordinator'
        ]
    },
    { namespace: 'phase2', ttl: 3600000 }
);
```

### 4.2 Blocker Escalation

If an agent is blocked, store blocker in shared memory:

```typescript
await memoryManager.store(
    `blockers/${agentId}`,
    {
        agent: 'reasoningbank-architect',
        blocker: 'Waiting for code signature format validation from pattern-extraction-specialist',
        severity: 'medium',
        created_at: new Date().toISOString(),
        blocking_tasks: ['Pattern storage implementation'],
        waiting_for: 'pattern-extraction-specialist'
    },
    { namespace: 'phase2' }
);
```

---

## 5. Next Steps

### ReasoningBank Architect (Current Agent)
- [x] Complete architecture documentation
- [x] Create database schema
- [x] Define TypeScript interfaces
- [x] Store architecture decisions in shared memory
- [ ] Review code signature format with pattern-extraction-specialist
- [ ] Review API contracts with integration-coordinator
- [ ] Answer questions and clarify design

### Pattern Extraction Specialist
- [ ] Review `CodeSignature` interface
- [ ] Implement AST parser for Jest, Mocha, Cypress
- [ ] Implement signature extractor
- [ ] Implement template generator
- [ ] Implement quality scorer
- [ ] Share sample patterns in memory

### Integration Coordinator
- [ ] Review API contracts
- [ ] Implement event bus integration
- [ ] Implement memory manager integration
- [ ] Create integration test plan
- [ ] Coordinate agent-to-agent communication

---

## Contact

**Agent:** ReasoningBank Architect
**Swarm ID:** swarm_1760613503507_dnw07hx65
**Agent ID:** agent_1760613527145_j6bvta
**Memory Namespace:** phase2
**Deliverables:** `/docs/architecture/REASONING-BANK-*.md`, `/src/reasoning/types.ts`, `/src/reasoning/QEReasoningBank.ts`
