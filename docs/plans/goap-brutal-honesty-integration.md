# GOAP: Brutal Honesty Integration for QE Product Factors Assessor

## Executive Summary

This document presents a Goal-Oriented Action Plan (GOAP) for enhancing the `qe-product-factors-assessor` agent with domain-specific context understanding capabilities derived from the `brutal-honesty-review` skill's pattern-based analysis approach.

---

## 1. State Assessment

### 1.1 Current State (What is True Now)

#### Brutal Honesty Review Skill - Strengths
| Capability | Implementation | Key Insight |
|------------|---------------|-------------|
| **Pattern-Based Detection** | 8 vagueness patterns, 6 missing context patterns, 4 unrealistic metric patterns, 6 buzzword patterns | Uses regex-based rules for deterministic detection without LLM calls |
| **Contextual Scoring** | 4 category scores (clarity, completeness, measurability, realism) weighted to overall score | Provides quantifiable quality metrics |
| **Evidence-Based Findings** | Each finding includes: evidence, recommendation, impactIfIgnored | Actionable and traceable output |
| **Multi-Mode Analysis** | Bach (BS detection), Ramsay (standards), Linus (precision) | Flexible severity and focus |

#### QE Product Factors Assessor - Current Capabilities
| Capability | Implementation | Gap Identified |
|------------|---------------|----------------|
| **Domain Detection** | 9 domains via keyword counting (ecommerce, healthcare, etc.) | Detection is shallow - counts keywords but doesn't extract domain-specific entities |
| **Entity Extraction** | Extracts actors, features, dataTypes, integrations, actions | Generic extraction - doesn't use domain knowledge to validate entities |
| **Test Idea Generation** | Templates with placeholders like `{actor}`, `{feature}` | Templates are generic - same output regardless of domain complexity |
| **Brutal Honesty Integration** | BrutalHonestyAnalyzer validates test ideas post-generation | Validation happens too late - doesn't inform generation |
| **Quality Scoring** | Rejects ideas below minQualityScore threshold | Score inflation - most ideas get 85-100 due to shallow validation |

### 1.2 Goal State (What Should Be True)

```
GOAL_STATE = {
  domainContextAccuracy: >= 85%,           // Domain-specific patterns correctly identified
  testIdeaSpecificity: >= 70%,             // Test ideas reference domain entities
  falsePositiveReduction: >= 50%,          // Reduction in inflated quality scores
  coverageGapDetection: TRUE,              // Missing coverage types identified
  deterministic: TRUE,                     // Works without LLM calls
  backwardCompatible: TRUE                 // Existing API unchanged
}
```

### 1.3 Gap Analysis

| Gap ID | Current State | Goal State | Impact |
|--------|--------------|------------|--------|
| **GAP-001** | Domain keywords counted | Domain-specific entity patterns extracted | Low: Generic test ideas |
| **GAP-002** | Post-generation validation | Pre-generation context enrichment | Medium: Wasted computation |
| **GAP-003** | Template placeholders generic | Domain-specific template selection | High: Non-actionable output |
| **GAP-004** | Single BS_PATTERNS set | Domain-specific BS patterns | Medium: Missed domain concerns |
| **GAP-005** | Quality score always high | Calibrated scoring per domain | Critical: False confidence |
| **GAP-006** | Coverage gaps counted | Coverage gaps explained with domain context | Low: Missing rationale |

---

## 2. Action Analysis

### 2.1 Available Actions (Preconditions + Effects)

```typescript
interface GOAPAction {
  name: string;
  preconditions: string[];
  effects: string[];
  cost: number;  // 1-10, lower is better
}

const AVAILABLE_ACTIONS: GOAPAction[] = [
  // Domain Context Enhancement Actions
  {
    name: "CreateDomainPatternRegistry",
    preconditions: ["brutal_honesty_patterns_analyzed"],
    effects: ["domain_patterns_available"],
    cost: 3
  },
  {
    name: "ExtendContextDetection",
    preconditions: ["domain_patterns_available"],
    effects: ["enhanced_domain_detection"],
    cost: 4
  },
  {
    name: "CreateDomainSpecificBSPatterns",
    preconditions: ["domain_patterns_available", "bs_patterns_analyzed"],
    effects: ["domain_specific_bs_detection"],
    cost: 5
  },

  // Test Idea Enhancement Actions
  {
    name: "CreateDomainTestTemplates",
    preconditions: ["enhanced_domain_detection"],
    effects: ["domain_specific_templates"],
    cost: 6
  },
  {
    name: "IntegratePreGenerationValidation",
    preconditions: ["domain_specific_bs_detection"],
    effects: ["early_quality_gating"],
    cost: 4
  },
  {
    name: "CalibrateQualityScoring",
    preconditions: ["domain_specific_bs_detection", "domain_specific_templates"],
    effects: ["accurate_quality_scores"],
    cost: 5
  },

  // Coverage Analysis Actions
  {
    name: "CreateDomainCoverageHeuristics",
    preconditions: ["enhanced_domain_detection"],
    effects: ["domain_aware_coverage_analysis"],
    cost: 3
  },
  {
    name: "EnhanceClarifyingQuestions",
    preconditions: ["domain_aware_coverage_analysis", "domain_specific_bs_detection"],
    effects: ["context_aware_questions"],
    cost: 4
  }
];
```

### 2.2 Action Dependency Graph

```
                    ┌─────────────────────────────────────┐
                    │   CreateDomainPatternRegistry       │
                    │   (analyzes brutal-honesty patterns)│
                    └─────────────────┬───────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼                       ▼                       ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│ExtendContextDetection│  │CreateDomainSpecific │  │                     │
│(enhance detectDomain)│  │BSPatterns           │  │                     │
└─────────┬───────────┘  └─────────┬───────────┘  │                     │
          │                        │              │                     │
          │    ┌───────────────────┘              │                     │
          │    │                                  │                     │
          ▼    ▼                                  ▼                     ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│CreateDomainTest     │  │IntegratePreGeneration│  │CreateDomainCoverage │
│Templates            │  │Validation           │  │Heuristics           │
└─────────┬───────────┘  └─────────┬───────────┘  └─────────┬───────────┘
          │                        │                        │
          └────────────────────────┼────────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────────┐
                    │     CalibrateQualityScoring         │
                    │  (accurate scores based on domain)  │
                    └─────────────────┬───────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────────┐
                    │     EnhanceClarifyingQuestions      │
                    │   (context-aware gap questions)     │
                    └─────────────────────────────────────┘
```

---

## 3. Plan Generation (Optimal Action Sequence)

### 3.1 A* Search Result

Using A* pathfinding with:
- **g(n)** = cumulative action cost
- **h(n)** = estimated remaining cost to goal (Manhattan distance)

**Optimal Plan (Total Cost: 34)**

```
PLAN = [
  Phase 1: Foundation (Cost: 7)
  ─────────────────────────────
  1. CreateDomainPatternRegistry     [cost: 3]
  2. ExtendContextDetection          [cost: 4]

  Phase 2: Quality Enhancement (Cost: 14)
  ─────────────────────────────────────
  3. CreateDomainSpecificBSPatterns  [cost: 5]
  4. IntegratePreGenerationValidation[cost: 4]
  5. CalibrateQualityScoring         [cost: 5]

  Phase 3: Output Enhancement (Cost: 13)
  ─────────────────────────────────────
  6. CreateDomainTestTemplates       [cost: 6]
  7. CreateDomainCoverageHeuristics  [cost: 3]
  8. EnhanceClarifyingQuestions      [cost: 4]
]
```

### 3.2 Alternative Plans Considered

| Plan | Actions | Total Cost | Rejected Because |
|------|---------|------------|------------------|
| A | All parallel | 34 | Violates dependencies |
| B | Templates first | 38 | Templates need domain context |
| C | Skip pre-validation | 30 | Doesn't address score inflation |
| **D (Selected)** | Foundation > Quality > Output | 34 | Optimal for dependencies |

---

## 4. Detailed Action Specifications

### 4.1 Phase 1: Foundation

#### Action 1: CreateDomainPatternRegistry

**Purpose**: Extract and organize domain-specific patterns from brutal-honesty-review skill.

**Input**:
- `/workspaces/agentic-qe/.claude/skills/brutal-honesty-review/SKILL.md`
- `/workspaces/agentic-qe/.claude/skills/brutal-honesty-review/resources/assessment-rubrics.md`

**Output**: New file at `/workspaces/agentic-qe/src/agents/qe-product-factors-assessor/analyzers/domain-patterns.ts`

**Implementation**:
```typescript
// Domain-specific patterns registry
export const DOMAIN_PATTERNS: Record<ProjectDomain, DomainPatternSet> = {
  ecommerce: {
    criticalEntities: ['cart', 'checkout', 'payment', 'inventory', 'order', 'SKU'],
    riskPatterns: [
      { pattern: /price.*calculation/i, category: 'financial', severity: 'CRITICAL' },
      { pattern: /inventory.*update/i, category: 'data-integrity', severity: 'HIGH' },
      { pattern: /payment.*process/i, category: 'security', severity: 'CRITICAL' },
    ],
    requiredTestCoverage: ['pricing', 'inventory-boundaries', 'payment-errors', 'cart-persistence'],
    bsIndicators: [
      { pattern: /seamless.*checkout/i, issue: 'Define checkout flow steps and error handling' },
      { pattern: /real-time.*inventory/i, issue: 'Specify sync frequency and conflict resolution' },
    ],
  },
  healthcare: {
    criticalEntities: ['patient', 'PHI', 'diagnosis', 'prescription', 'HIPAA'],
    riskPatterns: [
      { pattern: /patient.*data/i, category: 'compliance', severity: 'CRITICAL' },
      { pattern: /audit.*log/i, category: 'compliance', severity: 'HIGH' },
    ],
    requiredTestCoverage: ['phi-access-controls', 'audit-logging', 'consent-management'],
    bsIndicators: [
      { pattern: /hipaa.*compliant/i, issue: 'Specify which HIPAA controls are implemented' },
    ],
  },
  finance: {
    criticalEntities: ['transaction', 'balance', 'ledger', 'decimal', 'audit-trail'],
    riskPatterns: [
      { pattern: /money.*calculation/i, category: 'financial', severity: 'CRITICAL' },
      { pattern: /decimal.*precision/i, category: 'data-integrity', severity: 'CRITICAL' },
    ],
    requiredTestCoverage: ['decimal-precision', 'transaction-atomicity', 'balance-consistency'],
    bsIndicators: [
      { pattern: /real-time.*transaction/i, issue: 'Specify settlement time and consistency model' },
    ],
  },
  // ... other domains
};
```

**Success Criteria**:
- [ ] Patterns for all 9 supported domains
- [ ] At least 3 risk patterns per domain
- [ ] At least 3 BS indicators per domain
- [ ] TypeScript compiles without errors

---

#### Action 2: ExtendContextDetection

**Purpose**: Enhance `detectContext()` to use domain patterns for deeper entity extraction.

**Files Modified**:
- `/workspaces/agentic-qe/src/agents/qe-product-factors-assessor/index.ts` (detectDomain, extractEntities)

**Before**:
```typescript
private detectDomain(content: string): ProjectContext['domain'] {
  // Simple keyword counting
  const domainKeywords = { ecommerce: ['cart', 'checkout', ...] };
  // Returns domain with most keyword matches
}
```

**After**:
```typescript
private detectDomain(content: string): DomainDetectionResult {
  // Phase 1: Keyword-based detection (existing)
  const primaryDomain = this.detectPrimaryDomain(content);

  // Phase 2: Entity validation using domain patterns
  const domainPatterns = DOMAIN_PATTERNS[primaryDomain];
  const detectedEntities = this.extractDomainEntities(content, domainPatterns);

  // Phase 3: Confidence scoring
  const confidence = this.calculateDomainConfidence(detectedEntities, domainPatterns);

  return {
    domain: primaryDomain,
    confidence,
    detectedEntities,
    missingCriticalEntities: this.findMissingCritical(detectedEntities, domainPatterns),
  };
}
```

**Success Criteria**:
- [ ] Domain detection includes confidence score
- [ ] Critical entities identified per domain
- [ ] Missing critical entities flagged
- [ ] Backward compatible (existing tests pass)

---

### 4.2 Phase 2: Quality Enhancement

#### Action 3: CreateDomainSpecificBSPatterns

**Purpose**: Extend BS detection to include domain-specific vagueness indicators.

**Files Modified**:
- `/workspaces/agentic-qe/src/agents/qe-product-factors-assessor/analyzers/brutal-honesty-analyzer.ts`

**Enhancement**:
```typescript
analyzeRequirements(requirements: string, domain?: ProjectDomain): RequirementsQualityScore {
  // Existing generic patterns
  const genericFindings = this.analyzeGenericPatterns(requirements);

  // NEW: Domain-specific patterns
  const domainFindings: BrutalHonestyFinding[] = [];
  if (domain && domain !== 'generic') {
    const domainPatterns = DOMAIN_PATTERNS[domain];

    // Check for domain-specific BS indicators
    for (const indicator of domainPatterns.bsIndicators) {
      if (indicator.pattern.test(requirements)) {
        domainFindings.push({
          id: this.generateFindingId(),
          mode: BrutalHonestyMode.BACH,
          severity: BrutalHonestySeverity.HIGH,
          category: `Domain: ${domain}`,
          title: `${domain.toUpperCase()} Domain Concern`,
          description: indicator.issue,
          evidence: requirements.match(indicator.pattern)?.[0] || '',
          recommendation: `For ${domain} domain: ${indicator.issue}`,
          impactIfIgnored: `Domain-specific risk unaddressed`,
        });
      }
    }

    // Check for missing critical coverage
    for (const coverage of domainPatterns.requiredTestCoverage) {
      if (!this.isCoverageMentioned(requirements, coverage)) {
        domainFindings.push({
          // ... finding for missing coverage
        });
      }
    }
  }

  return this.combineFindings(genericFindings, domainFindings);
}
```

**Success Criteria**:
- [ ] Domain-specific findings generated for ecommerce, healthcare, finance
- [ ] Missing critical coverage identified
- [ ] Findings include domain-specific recommendations

---

#### Action 4: IntegratePreGenerationValidation

**Purpose**: Validate requirements BEFORE generating test ideas to filter early.

**Files Modified**:
- `/workspaces/agentic-qe/src/agents/qe-product-factors-assessor/index.ts` (assess method)

**Before (Current Flow)**:
```
Input -> Parse -> DetectContext -> GenerateTestIdeas -> ValidateIdeas -> Output
                                                       ↑
                                           (validation too late)
```

**After (Enhanced Flow)**:
```
Input -> Parse -> DetectContext -> PRE-VALIDATE -> GenerateTestIdeas -> Output
                                       ↓
                            (early quality gating)
                                       ↓
                            - Domain confidence check
                            - Requirements quality check
                            - Missing coverage warning
```

**Implementation**:
```typescript
public async assess(input: AssessmentInput): Promise<AssessmentOutput> {
  // Step 1: Parse input documents
  const parsedInput = await this.parseInput(input);

  // Step 2: Detect project context with confidence
  const contextResult = await this.detectContextWithConfidence(parsedInput);

  // Step 2.5: PRE-GENERATION VALIDATION (NEW)
  const preValidation = this.performPreGenerationValidation(parsedInput, contextResult);

  if (preValidation.requirementsQuality.score < 40) {
    console.warn(`[${this.agentId.id}] Requirements quality too low (${preValidation.requirementsQuality.score}/100). Consider clarification before test generation.`);
  }

  // Step 3: Generate test ideas (now informed by pre-validation)
  const categoryAnalysis = await this.performSFDIPOTAnalysis(
    parsedInput,
    contextResult.context,
    preValidation  // Pass pre-validation results
  );

  // ... rest of assessment
}
```

**Success Criteria**:
- [ ] Pre-validation runs before test generation
- [ ] Low-quality requirements trigger warning
- [ ] Pre-validation results inform generation
- [ ] No breaking changes to public API

---

#### Action 5: CalibrateQualityScoring

**Purpose**: Fix score inflation by calibrating against domain-specific criteria.

**Problem**: Current scoring gives 85-100 to almost all test ideas because it only checks for vague patterns, not domain appropriateness.

**Files Modified**:
- `/workspaces/agentic-qe/src/agents/qe-product-factors-assessor/analyzers/brutal-honesty-analyzer.ts`

**Calibration Rules**:
```typescript
interface QualityCalibration {
  // Base score starts at 100, penalties applied
  baseScore: 100;

  penalties: {
    // Generic description without domain context
    genericDescription: -20,

    // Missing expected outcome
    missingOutcome: -15,

    // No specific data/values mentioned
    noSpecificValues: -10,

    // Vague action (verify, check, ensure without specifics)
    vagueAction: -15,

    // Domain mismatch (healthcare test in ecommerce context)
    domainMismatch: -25,

    // Priority inflation (P0 without critical keywords)
    priorityInflation: -10,
  };

  bonuses: {
    // Mentions specific domain entity
    domainEntityMentioned: +10,

    // Includes expected outcome
    hasExpectedOutcome: +5,

    // Boundary/edge case mentioned
    boundaryMentioned: +5,
  };
}
```

**Success Criteria**:
- [ ] Average score drops from ~90 to ~65-75 range
- [ ] Domain-specific tests score higher than generic
- [ ] Clear penalty breakdown in findings
- [ ] No false positives on good test ideas

---

### 4.3 Phase 3: Output Enhancement

#### Action 6: CreateDomainTestTemplates

**Purpose**: Generate domain-specific test idea templates instead of generic ones.

**Files Modified**:
- `/workspaces/agentic-qe/src/agents/qe-product-factors-assessor/generators/test-idea-generator.ts`

**Enhancement**:
```typescript
private getTestTemplates(
  category: HTSMCategory,
  subcategory: string,
  domain: ProjectDomain  // NEW parameter
): TestTemplate[] {
  // Try domain-specific templates first
  const domainKey = `${domain}-${category}-${subcategory}`;
  if (DOMAIN_TEST_TEMPLATES[domainKey]) {
    return DOMAIN_TEST_TEMPLATES[domainKey];
  }

  // Fall back to generic templates
  return GENERIC_TEST_TEMPLATES[`${category}-${subcategory}`] || [];
}

const DOMAIN_TEST_TEMPLATES: Record<string, TestTemplate[]> = {
  'ecommerce-FUNCTION-Calculation': [
    {
      description: 'Verify cart total calculation with multiple SKUs, quantities, and unit prices',
      basePriority: Priority.P0,
      tags: ['pricing', 'calculation'],
      rationale: 'Cart totals directly impact revenue and customer trust',
      expectedOutcome: 'Total = SUM(unit_price * quantity) for all line items',
    },
    {
      description: 'Verify discount code application reduces subtotal correctly before tax',
      basePriority: Priority.P0,
      tags: ['pricing', 'promotion'],
      rationale: 'Discount calculation errors cause customer complaints or margin loss',
      expectedOutcome: 'Discounted_total = subtotal - (subtotal * discount_percentage)',
    },
  ],
  'ecommerce-DATA-Boundaries': [
    {
      description: 'Verify order quantity boundaries: min=1, max=inventory_available, reject 0 or negative',
      basePriority: Priority.P1,
      tags: ['inventory', 'validation'],
      rationale: 'Invalid quantities cause fulfillment issues',
      expectedOutcome: 'Error message for qty < 1 or qty > available_inventory',
    },
  ],
  'healthcare-FUNCTION-Security': [
    {
      description: 'Verify PHI access logged with user_id, timestamp, accessed_record, action_type',
      basePriority: Priority.P0,
      tags: ['hipaa', 'audit'],
      rationale: 'HIPAA requires comprehensive audit trail for PHI access',
      expectedOutcome: 'Audit log entry created with all required fields',
    },
  ],
  // ... more domain-specific templates
};
```

**Success Criteria**:
- [ ] Domain templates for top 5 domains (ecommerce, healthcare, finance, saas, infrastructure)
- [ ] At least 5 templates per domain across SFDIPOT categories
- [ ] Templates include expectedOutcome field
- [ ] Generic fallback maintained

---

#### Action 7: CreateDomainCoverageHeuristics

**Purpose**: Identify coverage gaps with domain-specific context.

**Files Modified**:
- `/workspaces/agentic-qe/src/agents/qe-product-factors-assessor/analyzers/sfdipot-analyzer.ts`

**Enhancement**:
```typescript
getCoverageSummary(
  results: Map<HTSMCategory, CategoryAnalysisResult>,
  domain: ProjectDomain
): EnhancedCoverageSummary {
  const basicSummary = this.getBasicCoverageSummary(results);

  // Domain-specific coverage requirements
  const domainPatterns = DOMAIN_PATTERNS[domain];
  const requiredCoverage = domainPatterns.requiredTestCoverage;

  const missingDomainCoverage: string[] = [];
  for (const required of requiredCoverage) {
    if (!this.isCoveragePresent(results, required)) {
      missingDomainCoverage.push(required);
    }
  }

  return {
    ...basicSummary,
    domainSpecific: {
      requiredCoverage,
      presentCoverage: requiredCoverage.filter(r => !missingDomainCoverage.includes(r)),
      missingCoverage: missingDomainCoverage,
      domainCoverageScore: ((requiredCoverage.length - missingDomainCoverage.length) / requiredCoverage.length) * 100,
    },
  };
}
```

**Success Criteria**:
- [ ] Domain coverage requirements checked
- [ ] Missing domain coverage highlighted
- [ ] Domain coverage score calculated
- [ ] Clear mapping from coverage to SFDIPOT categories

---

#### Action 8: EnhanceClarifyingQuestions

**Purpose**: Generate domain-aware questions for coverage gaps.

**Files Modified**:
- `/workspaces/agentic-qe/src/agents/qe-product-factors-assessor/generators/question-generator.ts`

**Enhancement**:
```typescript
generateQuestionsForSubcategory(
  category: HTSMCategory,
  subcategory: string,
  context: ProjectContext,
  missingDomainCoverage: string[]
): ClarifyingQuestion[] {
  const questions: ClarifyingQuestion[] = [];

  // Generic questions (existing)
  questions.push(...this.getGenericQuestions(category, subcategory));

  // Domain-specific questions (NEW)
  if (context.domain !== 'generic') {
    const domainPatterns = DOMAIN_PATTERNS[context.domain];

    // Questions for missing domain coverage
    for (const missing of missingDomainCoverage) {
      const domainQuestion = this.getDomainCoverageQuestion(context.domain, missing);
      if (domainQuestion) {
        questions.push({
          category,
          subcategory,
          question: domainQuestion.question,
          rationale: domainQuestion.rationale,
          source: 'template',
          domainSpecific: true,
          priority: 'HIGH',
        });
      }
    }

    // Questions for domain-specific entities not found
    const missingEntities = context.missingCriticalEntities || [];
    for (const entity of missingEntities) {
      questions.push({
        category,
        subcategory: 'Domain',
        question: `The requirements mention ${context.domain} but do not specify ${entity}. What are the ${entity} requirements?`,
        rationale: `${entity} is typically critical for ${context.domain} applications`,
        source: 'template',
        domainSpecific: true,
        priority: 'MEDIUM',
      });
    }
  }

  return questions;
}
```

**Success Criteria**:
- [ ] Domain-specific questions generated
- [ ] Missing entity questions included
- [ ] Questions prioritized by domain relevance
- [ ] Questions traceable to coverage gaps

---

## 5. Execution Monitoring (OODA Loop)

### 5.1 Observe

| Metric | Measurement Method | Frequency |
|--------|-------------------|-----------|
| Domain detection accuracy | Compare detected vs actual domain on test corpus | Per action |
| Test idea specificity | Count domain entity mentions in generated ideas | Per action |
| Quality score distribution | Histogram of scores, should be 40-90 range | Per action |
| Coverage gap detection rate | % of known gaps identified | Per action |

### 5.2 Orient

**Decision Matrix for Replanning**:

| Observation | Threshold | Action |
|-------------|-----------|--------|
| Domain accuracy < 70% | Critical | Revert to Action 1, add more patterns |
| Score distribution skewed high (mean > 85) | Warning | Recalibrate Action 5 penalties |
| Coverage gaps missed > 30% | Warning | Enhance Action 7 heuristics |
| Build fails | Blocking | Fix immediately before next action |

### 5.3 Decide

**Replanning Triggers**:
1. **Hard Failure**: TypeScript compilation error -> Fix before proceeding
2. **Test Failure**: Existing tests fail -> Restore backward compatibility
3. **Metric Miss**: Key metric below threshold -> Adjust action implementation

### 5.4 Act

**Execution Order with Checkpoints**:

```
[Action 1] -> Checkpoint: Domain patterns compile, types valid
                ↓
[Action 2] -> Checkpoint: detectContext tests pass, confidence scores generated
                ↓
[Action 3] -> Checkpoint: Domain BS patterns fire correctly on test inputs
                ↓
[Action 4] -> Checkpoint: Pre-validation runs, doesn't break existing flow
                ↓
[Action 5] -> Checkpoint: Score distribution shifts to 40-80 range
                ↓
[Action 6] -> Checkpoint: Domain templates selected for appropriate contexts
                ↓
[Action 7] -> Checkpoint: Domain coverage gaps identified in test corpus
                ↓
[Action 8] -> Checkpoint: Questions reference domain-specific concerns
                ↓
[GOAL ACHIEVED]
```

---

## 6. Success Criteria and Quality Metrics

### 6.1 Quantitative Metrics

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| Domain detection accuracy | ~60% (keyword counting) | >= 85% | Test corpus comparison |
| Test idea domain specificity | ~15% mention domain entities | >= 70% | Entity count in descriptions |
| Quality score inflation | Mean ~92, StdDev ~8 | Mean 65-75, StdDev 15-20 | Score distribution analysis |
| Coverage gap detection | Manual review | Automated for 5 domains | Heuristics fire correctly |
| Backward compatibility | N/A | 100% | Existing tests pass |

### 6.2 Qualitative Criteria

| Criterion | Definition | Verification |
|-----------|------------|--------------|
| Actionable output | Test ideas include expected outcomes | Manual review of generated ideas |
| Domain relevance | Ideas address domain-specific risks | SME review for ecommerce, healthcare, finance |
| Clear rationale | Each finding explains why it matters | Rationale field populated |
| No false positives | Good test ideas not rejected | False positive rate < 5% |

### 6.3 Acceptance Tests

```typescript
describe('Enhanced QEProductFactorsAssessor', () => {
  describe('Domain Detection', () => {
    it('should detect ecommerce domain with high confidence when cart/checkout mentioned', async () => {
      const input = 'User can add products to cart and proceed to checkout with credit card payment';
      const result = await assessor.detectContextWithConfidence({ rawContent: input });
      expect(result.domain).toBe('ecommerce');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should identify missing critical entities for healthcare domain', async () => {
      const input = 'System manages patient appointments';  // Missing PHI, HIPAA
      const result = await assessor.detectContextWithConfidence({ rawContent: input });
      expect(result.missingCriticalEntities).toContain('PHI');
      expect(result.missingCriticalEntities).toContain('HIPAA');
    });
  });

  describe('Quality Scoring', () => {
    it('should score domain-specific test ideas higher than generic', async () => {
      const domainIdea = { description: 'Verify cart total with multiple SKUs' };
      const genericIdea = { description: 'Verify functionality works correctly' };

      const domainScore = assessor.scoreTestIdea(domainIdea, 'ecommerce');
      const genericScore = assessor.scoreTestIdea(genericIdea, 'ecommerce');

      expect(domainScore).toBeGreaterThan(genericScore);
    });

    it('should apply penalty for vague test descriptions', async () => {
      const vagueIdea = { description: 'Ensure proper handling of errors' };
      const score = assessor.scoreTestIdea(vagueIdea, 'ecommerce');

      expect(score).toBeLessThan(70);  // Penalty applied
    });
  });

  describe('Coverage Analysis', () => {
    it('should identify missing ecommerce coverage for pricing', async () => {
      const input = 'User can browse products and view details';  // No pricing tests
      const result = await assessor.assess({ userStories: input });

      expect(result.summary.domainCoverage.missingCoverage).toContain('pricing');
    });
  });
});
```

---

## 7. Implementation Timeline

### 7.1 Estimated Effort

| Phase | Actions | Effort (hours) | Dependencies |
|-------|---------|----------------|--------------|
| Phase 1: Foundation | Actions 1-2 | 4-6h | None |
| Phase 2: Quality | Actions 3-5 | 8-10h | Phase 1 |
| Phase 3: Output | Actions 6-8 | 6-8h | Phase 2 |
| **Total** | 8 actions | **18-24h** | Sequential |

### 7.2 Milestones

| Milestone | Checkpoint | Deliverable |
|-----------|------------|-------------|
| M1: Domain Patterns | Action 1 complete | `domain-patterns.ts` file |
| M2: Enhanced Detection | Action 2 complete | Enhanced `detectContext()` |
| M3: Quality Gating | Actions 3-5 complete | Pre-validation + calibrated scoring |
| M4: Domain Templates | Action 6 complete | Domain-specific test templates |
| M5: Final Delivery | Actions 7-8 complete | Full integration, tests passing |

---

## 8. Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Pattern overfit to training data | Medium | Domain detection fails on new inputs | Use diverse test corpus, add fallback |
| Score calibration too aggressive | Medium | Good ideas rejected | Adjust penalties iteratively, track false positive rate |
| Backward compatibility break | Low | Existing integrations fail | Run full test suite after each action |
| Domain template maintenance | High | Templates become stale | Document template update process |
| LLM dependency creep | Low | Deterministic mode breaks | Ensure all enhancements work without LLM |

---

## 9. Appendix: Pattern Analysis from brutal-honesty-review

### 9.1 Key Patterns Identified

**From BS_PATTERNS (Bach Mode)**:
```typescript
// These patterns work because they:
// 1. Are specific enough to avoid false positives
// 2. Include the surrounding context (e.g., "improve\s+performance")
// 3. Have clear remediation guidance

vagueness: [
  /improve\s+(performance|quality|experience)/i,  // Vague without baseline
  /seamless\s+(integration|experience)/i,         // Marketing speak
  /real-?time/i,                                   // Needs latency SLA
]
```

**From TEST_IDEA_QUALITY_STANDARDS (Ramsay Mode)**:
```typescript
// These standards work because they:
// 1. Check for specific coverage types
// 2. Validate priority assignment
// 3. Identify vague descriptions

mustCover: ['happy-path', 'error-handling', 'boundary-conditions', 'edge-cases'],
redFlags: [
  /verify.*works/i,        // Too vague
  /test.*functionality/i,  // Generic
]
```

### 9.2 Extension Points for Domain Patterns

The brutal-honesty-review skill provides a proven template for:
1. **Pattern structure**: `{ pattern: RegExp, issue: string }`
2. **Scoring model**: Deduct from 100, floor at 0
3. **Finding format**: Evidence + recommendation + impact

These can be directly extended to domain-specific concerns.

---

## 10. References

- `/workspaces/agentic-qe/.claude/skills/brutal-honesty-review/SKILL.md`
- `/workspaces/agentic-qe/.claude/skills/brutal-honesty-review/resources/assessment-rubrics.md`
- `/workspaces/agentic-qe/src/agents/qe-product-factors-assessor/index.ts`
- `/workspaces/agentic-qe/src/agents/qe-product-factors-assessor/analyzers/brutal-honesty-analyzer.ts`
- `/workspaces/agentic-qe/src/agents/qe-product-factors-assessor/generators/test-idea-generator.ts`
- James Bach's HTSM v6.3 Product Factors

---

**Document Version**: 1.0.0
**Created**: 2025-12-28
**Author**: GOAP Planner Agent
**Status**: Ready for Review
