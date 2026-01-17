/**
 * Basic Multi-Model Router Example
 *
 * This example demonstrates basic model selection and routing.
 */

import { ModelRouter, QETask } from 'agentic-qe';

async function basicRouting() {
  // Initialize router with configuration
  const router = new ModelRouter({
    models: {
      available: [
        {
          id: 'gpt-3.5-turbo',
          provider: 'openai',
          costPer1kTokens: 0.002,
          maxTokens: 4096
        },
        {
          id: 'gpt-4',
          provider: 'openai',
          costPer1kTokens: 0.03,
          maxTokens: 8192
        },
        {
          id: 'claude-sonnet-4.5',
          provider: 'anthropic',
          costPer1kTokens: 0.015,
          maxTokens: 200000
        }
      ],
      defaultModel: 'gpt-3.5-turbo',
      fallbackChain: ['gpt-3.5-turbo', 'gpt-4', 'claude-sonnet-4.5']
    },
    routing: {
      strategy: 'cost-optimized',
      complexity: {
        simple: {
          maxLines: 100,
          maxComplexity: 5,
          model: 'gpt-3.5-turbo'
        },
        moderate: {
          maxLines: 500,
          maxComplexity: 15,
          model: 'gpt-4'
        },
        complex: {
          maxLines: 2000,
          maxComplexity: 30,
          model: 'gpt-4'
        },
        critical: {
          maxLines: Infinity,
          maxComplexity: Infinity,
          model: 'claude-sonnet-4.5'
        }
      }
    }
  });

  // Example 1: Simple task (will select GPT-3.5)
  const simpleTask: QETask = {
    id: 'test-gen-001',
    type: 'test-generation',
    agentType: 'test-generator',
    sourceFile: 'src/utils/string-helper.ts',
    linesOfCode: 50,
    cyclomaticComplexity: 3,
    targetCoverage: 90
  };

  const simpleSelection = await router.selectModel(simpleTask);
  console.log('Simple Task:');
  console.log(`  Selected Model: ${simpleSelection.modelId}`);
  console.log(`  Reason: ${simpleSelection.reason}`);
  console.log(`  Estimated Cost: $${simpleSelection.estimatedCost}`);
  console.log();

  // Example 2: Complex task (will select GPT-4)
  const complexTask: QETask = {
    id: 'test-gen-002',
    type: 'test-generation',
    agentType: 'test-generator',
    sourceFile: 'src/services/payment-processor.ts',
    linesOfCode: 800,
    cyclomaticComplexity: 25,
    targetCoverage: 95,
    metadata: {
      hasAsyncCode: true,
      hasErrorHandling: true
    }
  };

  const complexSelection = await router.selectModel(complexTask);
  console.log('Complex Task:');
  console.log(`  Selected Model: ${complexSelection.modelId}`);
  console.log(`  Reason: ${complexSelection.reason}`);
  console.log(`  Estimated Cost: $${complexSelection.estimatedCost}`);
  console.log();

  // Example 3: Critical task (will select Claude Sonnet)
  const criticalTask: QETask = {
    id: 'security-scan-001',
    type: 'security-scan',
    agentType: 'security-scanner',
    sourceFile: 'src/auth/authentication.ts',
    linesOfCode: 1200,
    cyclomaticComplexity: 35,
    metadata: {
      critical: true,
      priority: 'high'
    }
  };

  const criticalSelection = await router.selectModel(criticalTask);
  console.log('Critical Task:');
  console.log(`  Selected Model: ${criticalSelection.modelId}`);
  console.log(`  Reason: ${criticalSelection.reason}`);
  console.log(`  Estimated Cost: $${criticalSelection.estimatedCost}`);
}

// Run the example
basicRouting().catch(console.error);

/**
 * Expected Output:
 *
 * Simple Task:
 *   Selected Model: gpt-3.5-turbo
 *   Reason: Task complexity is low (score: 0.15), using cost-optimized model
 *   Estimated Cost: $0.02
 *
 * Complex Task:
 *   Selected Model: gpt-4
 *   Reason: Task complexity is high (score: 0.65), requires advanced model
 *   Estimated Cost: $0.10
 *
 * Critical Task:
 *   Selected Model: claude-sonnet-4.5
 *   Reason: Critical security task requires highest accuracy
 *   Estimated Cost: $0.18
 */
