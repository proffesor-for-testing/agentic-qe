/**
 * HybridRouter Model Selection Example
 *
 * Demonstrates intelligent model selection using ModelCapabilityRegistry
 * for task-aware routing and quality-based model recommendations.
 *
 * @example
 * npx tsx examples/hybrid-router-model-selection.ts
 */

import {
  HybridRouterModelSelection,
  createModelSelection
} from '../src/providers/HybridRouterModelSelection';
import { TaskComplexity } from '../src/providers/HybridRouter';
import type { LLMCompletionOptions } from '../src/providers/ILLMProvider';

// Example 1: Basic Task Detection
console.log('\n=== Example 1: Task Type Detection ===\n');

const selection = createModelSelection();

const testPrompts = [
  'Generate unit tests for the UserService class',
  'Review this pull request for code quality issues',
  'Find bugs in this authentication logic',
  'Analyze test coverage gaps in the API module',
  'Write API documentation with JSDoc comments'
];

testPrompts.forEach(prompt => {
  const options: LLMCompletionOptions = {
    model: 'auto',
    messages: [{ role: 'user', content: prompt }]
  };

  const taskType = selection.detectTaskType(options);
  console.log(`Prompt: "${prompt}"`);
  console.log(`Detected Task: ${taskType}\n`);
});

// Example 2: Model Selection with Constraints
console.log('\n=== Example 2: Model Selection with Constraints ===\n');

// Simple test generation with local-only constraint
const simpleTask = selection.selectBestModel(
  'test-generation',
  TaskComplexity.SIMPLE,
  { requiresLocal: true }
);

console.log('Simple Test Generation (Local Only):');
console.log(`  Provider: ${simpleTask.provider}`);
console.log(`  Model: ${simpleTask.model}`);
console.log(`  Reason: ${simpleTask.reason}\n`);

// Complex code review with cost constraint
const complexTask = selection.selectBestModel(
  'code-review',
  TaskComplexity.COMPLEX,
  { maxCostPer1M: 2.0 }
);

console.log('Complex Code Review (Budget: $2/1M tokens):');
console.log(`  Provider: ${complexTask.provider}`);
console.log(`  Model: ${complexTask.model}`);
console.log(`  Reason: ${complexTask.reason}\n`);

// Example 3: Full Model Recommendation
console.log('\n=== Example 3: Full Model Recommendation ===\n');

const complexPrompt: LLMCompletionOptions = {
  model: 'auto',
  messages: [
    {
      role: 'user',
      content: `
        Generate comprehensive test suites for a microservices architecture.
        Include unit tests, integration tests, and contract tests.
        Ensure 90%+ code coverage with edge cases and error scenarios.
      `
    }
  ],
  maxTokens: 4000
};

const recommendation = selection.getModelRecommendation(complexPrompt, {
  minContextWindow: 16000
});

console.log('Comprehensive Test Suite Generation:');
console.log(`\nPrimary Model: ${recommendation.primary.modelId}`);
console.log(`  Provider: ${recommendation.primary.provider}`);
console.log(`  Context Window: ${recommendation.primary.contextWindow.toLocaleString()} tokens`);
console.log(`  Confidence: ${(recommendation.confidence * 100).toFixed(1)}%`);

console.log(`\nAlternative Models (${recommendation.alternatives.length}):`);
recommendation.alternatives.forEach((alt, index) => {
  console.log(`  ${index + 1}. ${alt.modelId} (${alt.provider})`);
});

console.log(`\nReasoning:\n  ${recommendation.reasoning}\n`);

// Example 4: Adaptive Learning
console.log('\n=== Example 4: Adaptive Learning ===\n');

// Simulate successful task with fast latency
console.log('Simulating model performance feedback...');

// Before update
const beforeModel = selection.getRegistry().getModel('qwen-2.5-coder-32b');
const beforeRating = beforeModel?.qualityRatings?.['test-generation'] || 0.5;

console.log(`\nBefore: qwen-2.5-coder-32b quality rating = ${(beforeRating * 100).toFixed(1)}%`);

// Update with successful outcome and fast latency (1.5 seconds)
selection.updateModelQuality(
  'qwen-2.5-coder-32b',
  'test-generation',
  true,  // success
  1500   // latency in ms
);

// After update
const afterModel = selection.getRegistry().getModel('qwen-2.5-coder-32b');
const afterRating = afterModel?.qualityRatings?.['test-generation'] || 0.5;

console.log(`After (success + fast):  qwen-2.5-coder-32b quality rating = ${(afterRating * 100).toFixed(1)}%`);
console.log(`Improvement: ${((afterRating - beforeRating) * 100).toFixed(1)}%\n`);

// Simulate failure with slow latency
selection.updateModelQuality(
  'deepseek-coder-33b',
  'bug-detection',
  false, // failure
  8000   // slow latency (8 seconds)
);

const failedModel = selection.getRegistry().getModel('deepseek-coder-33b');
const failedRating = failedModel?.qualityRatings?.['bug-detection'] || 0.5;

console.log(`After (failure + slow): deepseek-coder-33b quality rating = ${(failedRating * 100).toFixed(1)}%`);
console.log('Rating decreased due to failure and high latency\n');

// Example 5: Cost-Optimized Selection
console.log('\n=== Example 5: Cost-Optimized Model Selection ===\n');

const costConstraints = [
  { maxCostPer1M: 0, label: 'Free Only' },
  { maxCostPer1M: 1.0, label: 'Budget: $1/1M' },
  { maxCostPer1M: 5.0, label: 'Budget: $5/1M' },
  { label: 'No Limit' }
];

costConstraints.forEach(constraint => {
  const result = selection.selectBestModel(
    'test-generation',
    TaskComplexity.MODERATE,
    constraint.maxCostPer1M !== undefined ? { maxCostPer1M: constraint.maxCostPer1M } : undefined
  );

  console.log(`${constraint.label}:`);
  console.log(`  Model: ${result.model}`);
  console.log(`  Provider: ${result.provider}\n`);
});

// Example 6: Privacy-First Selection
console.log('\n=== Example 6: Privacy-First Local Models ===\n');

const privacySensitivePrompt: LLMCompletionOptions = {
  model: 'auto',
  messages: [
    {
      role: 'user',
      content: 'Review this authentication code that handles user passwords and API keys'
    }
  ]
};

const privacyRec = selection.getModelRecommendation(privacySensitivePrompt, {
  requiresLocal: true
});

console.log('Privacy-Sensitive Code Review:');
console.log(`  Model: ${privacyRec.primary.modelId}`);
console.log(`  Provider: ${privacyRec.primary.provider}`);
console.log(`  Deployment: ${privacyRec.primary.availableOn.join(', ')}`);
console.log(`  VRAM Required: ${privacyRec.primary.vramRequired || 'N/A'} GB`);

console.log('\n=== Examples Complete ===\n');

// Export for use in other examples
export {
  selection,
  testPrompts,
  complexPrompt
};
