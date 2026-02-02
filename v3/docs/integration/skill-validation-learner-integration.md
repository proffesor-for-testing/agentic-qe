# Skill Validation Learner Integration Guide

**ADR-056: Skill Validation System Integration with ReasoningBank**

This document describes how to integrate the Skill Validation Learner with your skill evaluation workflow.

## Overview

The `SkillValidationLearner` bridges skill validation outcomes with the ReasoningBank learning system, enabling:

- Pattern storage from successful validations
- Cross-model behavior tracking and anomaly detection
- Skill confidence scoring based on validation history
- Integration with QualityFeedbackLoop for continuous improvement

## Memory Namespace Structure

```
aqe/skill-validation/
├── skill-confidence-{skill}/   - Confidence scores per skill
│   └── Contains: avgScore, outcomes[], trend, byLevel
├── cross-model-{skill}/        - Cross-model behavior tracking
│   └── Contains: models{}, variance, hasAnomalies, anomalies[]
├── patterns/                   - Validation patterns
│   ├── {skill-name}-validation-*  - Per-skill validation patterns
│   └── by-model/               - Patterns organized by model
└── trends/                     - Historical validation trends
```

## Integration with Eval Runner

### Step 1: Initialize the Learner

```typescript
import { createRealQEReasoningBank } from '@agentic-qe/v3';
import { createSkillValidationLearner } from '@agentic-qe/v3/learning';
import { createQualityFeedbackLoop } from '@agentic-qe/v3/feedback';

// Initialize ReasoningBank
const reasoningBank = createRealQEReasoningBank({
  sqlite: { dbPath: '.agentic-qe/memory.db' },
  enableLearning: true,
});
await reasoningBank.initialize();

// Create learner
const learner = createSkillValidationLearner(reasoningBank);

// Optionally connect to feedback loop for routing analysis
const feedbackLoop = createQualityFeedbackLoop();
feedbackLoop.connectReasoningBank(reasoningBank);
learner.connectFeedbackLoop(feedbackLoop);
```

### Step 2: Record Validation Outcomes

After each skill evaluation run:

```typescript
import type { SkillValidationOutcome, TestCaseResult } from '@agentic-qe/v3/learning';

// Convert your test results to the expected format
const testCaseResults: TestCaseResult[] = evalResults.test_results.map(r => ({
  testId: r.id,
  passed: r.passed,
  expectedPatterns: r.validation_details.must_contain_matches.concat(
    r.validation_details.regex_matches
  ),
  actualPatterns: r.validation_details.must_contain_matches,
  reasoningQuality: r.reasoning_quality_score,
  executionTimeMs: r.execution_time_ms,
  category: r.category,
  priority: r.priority as 'critical' | 'high' | 'medium' | 'low',
  error: r.error,
}));

// Create the outcome
const outcome: SkillValidationOutcome = {
  skillName: evalResults.skill,
  trustTier: 3, // Level 3 = has eval suite
  validationLevel: 'eval',
  model: evalResults.model,
  passed: evalResults.success_criteria_met,
  score: evalResults.pass_rate,
  testCaseResults,
  timestamp: new Date(evalResults.timestamp),
  runId: evalResults.run_id,
  metadata: {
    version: evalResults.version,
    duration: evalResults.total_execution_time_ms,
    criticalPassRate: evalResults.critical_pass_rate,
  },
};

// Record the outcome
await learner.recordValidationOutcome(outcome);
```

### Step 3: Query Learned Patterns (Before Running Evals)

```typescript
// Get confidence score for the skill
const confidence = await learner.getSkillConfidence('security-testing');
if (confidence) {
  console.log(`Current skill confidence: ${(confidence.avgScore * 100).toFixed(1)}%`);
  console.log(`Trend: ${confidence.trend}`);
  console.log(`Confidence by level:`, confidence.byLevel);
}

// Get cross-model analysis
const crossModel = await learner.getCrossModelAnalysis('security-testing');
if (crossModel) {
  console.log(`Cross-model variance: ${crossModel.variance.toFixed(3)}`);
  if (crossModel.hasAnomalies) {
    console.log('Detected anomalies:', crossModel.anomalies);
  }
}

// Query validation patterns
const patterns = await learner.queryValidationPatterns('security-testing', 10);
console.log(`Found ${patterns.length} validation patterns`);

// Get validation trends
const trends = await learner.getValidationTrends('security-testing');
if (trends) {
  console.log(`Overall trend: ${trends.overall}`);
  console.log(`Recent pass rate: ${(trends.recentPassRate * 100).toFixed(1)}%`);
}
```

### Step 4: Extract Learned Patterns for Continuous Improvement

```typescript
// After collecting multiple validation outcomes
const learnedPatterns = await learner.extractLearnedPatterns('security-testing');

for (const pattern of learnedPatterns) {
  console.log(`Category: ${pattern.category}`);
  console.log(`  Confidence: ${(pattern.confidence * 100).toFixed(1)}%`);
  console.log(`  Success indicators: ${pattern.successIndicators.join(', ')}`);
  console.log(`  Failure indicators: ${pattern.failureIndicators.join(', ')}`);
  console.log(`  Models: ${pattern.models.join(', ')}`);
  console.log(`  Observations: ${pattern.observationCount}`);
}
```

## Complete Eval Runner Integration Example

```typescript
// scripts/run-skill-eval-with-learning.ts

import { createRealQEReasoningBank } from '../v3/src/learning/real-qe-reasoning-bank.js';
import { createSkillValidationLearner } from '../v3/src/learning/skill-validation-learner.js';
import type { SkillValidationOutcome } from '../v3/src/learning/skill-validation-learner.js';

async function runEvalWithLearning(skill: string, model: string) {
  // 1. Initialize learning infrastructure
  const reasoningBank = createRealQEReasoningBank();
  await reasoningBank.initialize();
  const learner = createSkillValidationLearner(reasoningBank);

  // 2. Query existing patterns before running
  console.log('\\n--- Querying Learned Patterns ---');
  const confidence = await learner.getSkillConfidence(skill);
  if (confidence) {
    console.log(`Previous confidence: ${(confidence.avgScore * 100).toFixed(1)}%`);
    console.log(`Trend: ${confidence.trend || 'unknown'}`);
  } else {
    console.log('No previous validation data found');
  }

  // 3. Run your eval suite
  const evalResult = await runEvalSuite(skill, model);

  // 4. Record the outcome
  console.log('\\n--- Recording Validation Outcome ---');
  const outcome: SkillValidationOutcome = {
    skillName: skill,
    trustTier: 3,
    validationLevel: 'eval',
    model,
    passed: evalResult.success_criteria_met,
    score: evalResult.pass_rate,
    testCaseResults: evalResult.test_results.map(r => ({
      testId: r.id,
      passed: r.passed,
      expectedPatterns: [],
      actualPatterns: [],
      reasoningQuality: r.reasoning_quality_score,
    })),
    timestamp: new Date(),
    runId: evalResult.run_id,
  };

  await learner.recordValidationOutcome(outcome);
  console.log('Outcome recorded successfully');

  // 5. Get updated confidence
  const updatedConfidence = await learner.getSkillConfidence(skill);
  if (updatedConfidence) {
    console.log(`Updated confidence: ${(updatedConfidence.avgScore * 100).toFixed(1)}%`);
  }

  // 6. Check cross-model analysis (if eval level)
  const crossModel = await learner.getCrossModelAnalysis(skill);
  if (crossModel && Object.keys(crossModel.models).length > 1) {
    console.log('\\n--- Cross-Model Analysis ---');
    console.log(`Variance: ${crossModel.variance.toFixed(3)}`);
    if (crossModel.hasAnomalies) {
      console.log('WARNING: Cross-model anomalies detected:');
      crossModel.anomalies?.forEach(a => {
        console.log(`  - ${a.model}: ${a.description}`);
      });
    }
  }

  // 7. Cleanup
  await reasoningBank.dispose();
}
```

## Success Criteria Verification

The skill validation learner integration is complete when:

- [x] Validation outcomes stored in ReasoningBank via `storeQEPattern`
- [x] Patterns learned from successful validations (confidence tracking)
- [x] Cross-model behavior differences tracked (variance, anomalies)
- [x] Skill confidence scores updated based on validation history
- [x] Integration with QualityFeedbackLoop for routing outcomes

## Related Documentation

- [ADR-056: Deterministic Skill Validation System](/v3/implementation/adrs/ADR-056-skill-validation-system.md)
- [Skill Validation MCP Integration](/.claude/skills/.validation/skill-validation-mcp-integration.md)
- [QualityFeedbackLoop](/v3/src/feedback/feedback-loop.ts)
- [RealQEReasoningBank](/v3/src/learning/real-qe-reasoning-bank.ts)
