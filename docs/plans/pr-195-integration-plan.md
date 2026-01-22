# PR #195 Integration Plan: Quality Criteria Recommender → AQE v3

## Executive Summary

PR #195 from `fndlalit/agentic-qe:qe-quality-criteria-recommender` introduces three new agents focused on shift-left quality engineering using the QCSD (Quality Conscious Software Delivery) framework. This plan outlines the integration strategy into AQE v3.

**Branch cloned to:** `/tmp/agentic-qe-fork`

---

## 1. PR Analysis

### 1.1 What Already Exists in Main Branch

| Component | Status | Details |
|-----------|--------|---------|
| `qe-product-factors-assessor.md` | ✅ Exists (109 lines) | Concise agent definition |
| `v3/services/product-factors-assessment/` | ✅ Exists (36KB+ service) | Full TypeScript implementation with analyzers, formatters, generators, parsers |
| `v3/services/product-factors-bridge.ts` | ✅ Exists | Code intelligence integration |
| `qe-quality-criteria-recommender.md` | ❌ Does NOT exist | |
| `qe-test-idea-rewriter.md` | ❌ Does NOT exist | |
| `docs/templates/` | ❌ Does NOT exist | |

### 1.2 What PR #195 Brings

| Component | Change Type | Size | Purpose |
|-----------|-------------|------|---------|
| `qe-quality-criteria-recommender.md` | **NEW** | 1,266 lines | HTSM-based Quality Criteria analysis with QCSD framework |
| `qe-product-factors-assessor.md` | **EXPANSION** | 109 → 2,595 lines (24x) | Major expansion with template compliance rules, validation checklists |
| `qe-test-idea-rewriter.md` | **NEW** | 124 lines | Transform "Verify X" patterns to action verbs |
| `quality-criteria-reference-template.html` | **NEW** | 30KB | HTML output template for Quality Criteria reports |
| `sfdipot-reference-template.html` | **NEW** | 85KB | HTML output template for SFDIPOT assessments |
| `learning-config.json` | **UPDATED** | +37 lines | GNN, LoRA, EWC++ self-learning configuration |

### 1.2 New Capabilities

1. **HTSM v6.3 Quality Criteria Analysis** - 10 category coverage:
   - Capability, Reliability, Usability, Charisma, Security
   - Scalability, Compatibility, Performance, Installability, Development

2. **Evidence Classification System**:
   - **Direct**: Actual code/doc quotes
   - **Inferred**: Logical deductions
   - **Claimed**: Requires verification

3. **QCSD Framework Integration**:
   - Shift-left quality discussions during PI/Sprint Planning
   - Evidence-based recommendations with business impact quantification
   - Citation-backed business impact claims

4. **Test Idea Transformation Pipeline**:
   - Eliminates passive "Verify X" patterns
   - Transforms to active, observable test actions

### 1.3 Key Integration Decision: qe-product-factors-assessor.md

The PR expands `qe-product-factors-assessor.md` from 109 → 2,595 lines (24x increase).

**Current main branch approach:**
- Concise 109-line agent definition
- Heavy lifting done by TypeScript service (`product-factors-service.ts` - 36KB)
- Clean separation: Agent prompt (what) vs. Service (how)

**PR approach:**
- Massive 2,595-line agent definition with:
  - Detailed HTML template compliance rules
  - Embedded CSS snippets
  - Mandatory section checklists
  - Validation rules baked into prompt

**Recommendation:**
1. **Keep existing concise agent definition** for `qe-product-factors-assessor.md`
2. **Extract compliance rules** from PR into separate validation config/tests
3. **Add templates** to `docs/templates/` as reference
4. **Integrate new agents** (`qe-quality-criteria-recommender`, `qe-test-idea-rewriter`) as-is

This maintains the v3 architecture principle: agent prompts define behavior, services implement logic.

---

## 2. V3 Integration Architecture

### 2.1 Domain Mapping

The new agents map to existing v3 domains:

```
┌─────────────────────────────────────────────────────────────┐
│                    AQE v3 Domain Layer                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  requirements-validation/        quality-assessment/         │
│  ├── RequirementsValidator       ├── QualityGateService     │
│  ├── BDDScenarioWriter          ├── QualityAnalyzer        │
│  ├── TestabilityScorer          └── DeploymentAdvisor      │
│  │                                                          │
│  └── NEW: QualityCriteriaService ◄──────┐                  │
│      ├── HTSMAnalyzer                    │                  │
│      ├── EvidenceCollector               │                  │
│      └── TestIdeaTransformer             │                  │
│                                          │                  │
├──────────────────────────────────────────┼──────────────────┤
│                                          │                  │
│  FROM PR #195:                           │                  │
│  ├── qe-quality-criteria-recommender ────┘                  │
│  ├── qe-product-factors-assessor                            │
│  └── qe-test-idea-rewriter                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Recommended Integration Point

**Primary:** `v3/src/domains/requirements-validation/`

**Rationale:**
- Quality Criteria analysis happens pre-development (shift-left)
- Aligns with existing RequirementsValidator and BDDScenarioWriter
- Natural workflow: Requirements → HTSM Analysis → BDD Scenarios → Test Generation

**Alternative:** Create new `quality-criteria/` domain
- Higher isolation but more complexity
- Consider if scope grows significantly

---

## 3. Implementation Phases

### Phase 1: Agent Definition Integration (Week 1) - COMPLETED

**Approach: Concise agents with extracted helpers (following v3 patterns)**

Instead of copying the massive 1,266-line agent definition, we created a concise 105-line version (12x reduction) that references helper files.

**Files Created:**

| File | Lines | Purpose |
|------|-------|---------|
| `.claude/agents/qe-quality-criteria-recommender.md` | 105 | Concise agent definition |
| `docs/reference/htsm-categories.md` | 142 | HTSM category details |
| `docs/reference/evidence-classification.md` | 127 | Evidence type guidelines |
| `docs/templates/quality-criteria-reference-template.html` | ~800 | HTML output template |
| `scripts/validate-quality-criteria.ts` | 140 | Output validation script |

**Comparison:**
```
PR Version:     1,266 lines (monolithic)
Our Version:      105 lines (agent) + 409 lines (helpers) = 514 lines total
Reduction:        59% fewer lines, better separation of concerns
```

**Remaining Tasks:**
- [ ] Copy `qe-test-idea-rewriter.md` from PR
- [ ] Copy `sfdipot-reference-template.html` for product-factors-assessor
- [ ] Update `.claude/aqe-fleet.json` to include new agents
- [ ] Update `.claude/settings.json` with agent registration

### Phase 2: V3 Service Implementation (Week 2-3)

**New Files to Create:**

```
v3/src/domains/requirements-validation/services/
├── quality-criteria-analyzer.ts      # Core HTSM analysis
├── evidence-collector.ts             # Evidence classification
├── test-idea-transformer.ts          # Verify → Action transformation
└── htsm-categories.ts               # Category definitions
```

**Interface Design:**

```typescript
// v3/src/domains/requirements-validation/interfaces.ts (additions)

export interface QualityCriteriaAnalysis {
  epic: string;
  coverageMetric: `${number} of 10 HTSM Categories`;
  recommendations: QualityCriteriaRecommendation[];
  crossCuttingConcerns: CrossCuttingConcern[];
  piPlanningGuidance: PIGuidanceItem[];
}

export interface QualityCriteriaRecommendation {
  category: HTSMCategory;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  evidencePoints: EvidencePoint[];
  testFocusAreas: string[];
  automationFitness: 'high' | 'medium' | 'low';
  businessImpact: string;
}

export interface EvidencePoint {
  sourceReference: string;  // file_path:line_range format
  type: 'Direct' | 'Inferred' | 'Claimed';
  qualityImplication: string;
  reasoning: string;
}

export type HTSMCategory =
  | 'Capability' | 'Reliability' | 'Usability' | 'Charisma'
  | 'Security' | 'Scalability' | 'Compatibility'
  | 'Performance' | 'Installability' | 'Development';
```

### Phase 3: Coordinator Integration (Week 4)

**Update RequirementsValidationCoordinator:**

```typescript
// Add to v3/src/domains/requirements-validation/coordinator.ts

async analyzeQualityCriteria(
  input: QualityCriteriaInput
): Promise<QualityCriteriaAnalysis> {
  // 1. Parse documentation sources
  // 2. Perform semantic analysis (not keyword matching)
  // 3. Generate HTSM category coverage
  // 4. Collect and classify evidence
  // 5. Generate recommendations with priorities
  // 6. Transform test ideas (remove "Verify" patterns)
  // 7. Output HTML/JSON/Markdown formats
}
```

**New Workflow:**

```
RequirementsAnalysis Flow (Enhanced):
┌─────────────────────────────────────────────────────────────┐
│ 1. Input: Epic/User Stories/Architecture Docs               │
│    ↓                                                        │
│ 2. RequirementsValidator.validate()                         │
│    ↓                                                        │
│ 3. NEW: QualityCriteriaAnalyzer.analyze() ◄─ HTSM v6.3     │
│    ↓                                                        │
│ 4. TestabilityScorer.score()                                │
│    ↓                                                        │
│ 5. BDDScenarioWriter.generate()                             │
│    ↓                                                        │
│ 6. NEW: TestIdeaTransformer.transform() ◄─ Remove "Verify" │
│    ↓                                                        │
│ 7. Output: Enhanced Requirements Package                     │
└─────────────────────────────────────────────────────────────┘
```

### Phase 4: Learning System Integration (Week 5)

**Update Learning Configuration:**

```typescript
// Add to learning namespace
export const QE_LEARNING_NAMESPACES = {
  QUALITY_CRITERIA: 'aqe/quality-criteria',
  HTSM_PATTERNS: 'aqe/learning/patterns/quality-criteria',
  EVIDENCE: 'aqe/quality-criteria/evidence',
};
```

**Learning Protocol:**
1. Pre-task: Query past HTSM analysis patterns
2. Post-task: Store experience with quality gate validation
3. Pattern discovery: Store correlations between evidence and categories

### Phase 5: MCP Tool Exposure (Week 6)

**New MCP Tools:**

```typescript
// v3/src/mcp/tools/quality-criteria.ts

export const qualityCriteriaTools = {
  'qe-criteria-analyze': {
    description: 'Analyze project for HTSM Quality Criteria recommendations',
    parameters: {
      epicPath: { type: 'string', description: 'Path to epic/requirements' },
      sourcePaths: { type: 'array', description: 'Paths to analyze' },
      outputFormat: { enum: ['html', 'json', 'markdown'] },
    },
  },

  'qe-criteria-transform-tests': {
    description: 'Transform "Verify X" test ideas to action patterns',
    parameters: {
      inputFile: { type: 'string', description: 'HTML file with test ideas' },
    },
  },
};
```

---

## 4. Critical Implementation Notes

### 4.1 Semantic Analysis (Not Keyword Matching)

The agent explicitly requires semantic understanding:

```
❌ WRONG: "Found keyword 'password' → Security category"
✅ RIGHT: "User expectation of cross-session persistence implies
          data must survive server restarts → Reliability (Data Integrity)"
```

**Implementation:** Use Claude's native reasoning when running as Task agent. Do not implement keyword-based pattern matching.

### 4.2 Evidence Classification Rules

| Type | Requirements |
|------|--------------|
| **Direct** | Must quote actual code/doc, include `file:line` reference |
| **Inferred** | Must show reasoning chain, can use architectural implications |
| **Claimed** | Must state "requires verification", no speculation |

### 4.3 Template Compliance

The HTML output must match reference templates exactly:
- Header: Dark blue gradient background
- Body: Light gray gradient background
- Footer: Must say "AI Semantic Understanding" (not "Heuristic analysis")
- Coverage: Show "X of 10 HTSM Categories" (not percentages)

### 4.4 Quality Gates for Learning

Before storing learning experience with reward > 0.7:

| Gate | Pass Criteria |
|------|---------------|
| No confidence percentages | 0 occurrences of "XX% confidence" |
| Evidence types present | Every row has Type column |
| Coverage defined | "X of 10 HTSM Categories" format |
| Test claims verified | Search results shown for "no tests" claims |
| Impact quantified | Specific numbers, not "many/some" |
| File:line traceability | All evidence has `file:line` format |

---

## 5. Migration Checklist

### 5.1 Files to Add

- [ ] `.claude/agents/qe-quality-criteria-recommender.md`
- [ ] `.claude/agents/qe-test-idea-rewriter.md`
- [ ] `docs/templates/quality-criteria-reference-template.html`
- [ ] `docs/templates/sfdipot-reference-template.html`
- [ ] `v3/src/domains/requirements-validation/services/quality-criteria-analyzer.ts`
- [ ] `v3/src/domains/requirements-validation/services/evidence-collector.ts`
- [ ] `v3/src/domains/requirements-validation/services/test-idea-transformer.ts`
- [ ] `v3/src/mcp/tools/quality-criteria.ts`

### 5.2 Files to Update

- [ ] `.claude/aqe-fleet.json` - Add new agents to fleet
- [ ] `.claude/settings.json` - Register agent prompts
- [ ] `v3/src/domains/requirements-validation/index.ts` - Export new services
- [ ] `v3/src/domains/requirements-validation/interfaces.ts` - Add new types
- [ ] `v3/src/domains/requirements-validation/coordinator.ts` - Add workflow
- [ ] `v3/src/mcp/tools/index.ts` - Register new MCP tools

### 5.3 Tests to Create

- [ ] `v3/tests/domains/requirements-validation/quality-criteria-analyzer.test.ts`
- [ ] `v3/tests/domains/requirements-validation/evidence-collector.test.ts`
- [ ] `v3/tests/domains/requirements-validation/test-idea-transformer.test.ts`
- [ ] `v3/tests/integration/quality-criteria-workflow.test.ts`

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| qe-product-factors-assessor too large (139KB) | High | Medium | Split into smaller modules or lazy-load |
| Template compliance drift | Medium | High | Add validation tests for HTML output |
| Semantic analysis quality | Medium | High | Integration tests with known requirements |
| Learning system complexity | Medium | Medium | Phase in gradually, start with storage |

---

## 7. Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Agent Definitions | 1 week | None |
| Phase 2: Service Implementation | 2 weeks | Phase 1 |
| Phase 3: Coordinator Integration | 1 week | Phase 2 |
| Phase 4: Learning Integration | 1 week | Phase 3 |
| Phase 5: MCP Tools | 1 week | Phase 3 |
| **Total** | **6 weeks** | |

---

## 8. Appendix: Key File Locations

### Fork Repository (Source)
```
/tmp/agentic-qe-fork/
├── .claude/
│   ├── agents/
│   │   ├── qe-quality-criteria-recommender.md  ◄── PRIMARY
│   │   ├── qe-product-factors-assessor.md
│   │   └── qe-test-idea-rewriter.md
│   └── aqe-fleet.json
├── docs/templates/
│   ├── quality-criteria-reference-template.html
│   └── sfdipot-reference-template.html
└── .agentic-qe/
    ├── learning-config.json
    └── product-factors-assessments/  (example outputs)
```

### Target Repository (Destination)
```
/workspaces/agentic-qe/
├── .claude/agents/              ◄── Copy agents here
├── docs/templates/              ◄── Copy templates here
└── v3/src/domains/
    └── requirements-validation/
        └── services/            ◄── Implement v3 services
```

---

## 9. Next Steps

1. **Immediate:** Review this plan with stakeholders
2. **Week 1:** Begin Phase 1 - Copy agent definitions and templates
3. **Parallel:** Create v3 service interface specifications
4. **Ongoing:** Track progress in GitHub issue

---

*Generated: 2026-01-21*
*PR Reference: https://github.com/proffesor-for-testing/agentic-qe/pull/195*
*Source Branch: fndlalit/agentic-qe:qe-quality-criteria-recommender*
