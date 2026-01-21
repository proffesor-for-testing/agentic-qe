/**
 * Batch Query API Usage Example
 *
 * Demonstrates how to use the RuvllmProvider batch completion API
 * for 4x throughput improvement in parallel LLM operations.
 *
 * Phase 0 M0.2 - AQE LLM Independence
 */

import { RuvllmProvider } from '../src/providers/RuvllmProvider';
import type { LLMCompletionOptions } from '../src/providers/ILLMProvider';

/**
 * Example 1: Test Generation Burst
 *
 * Generate tests for multiple methods in parallel
 */
async function testGenerationBurst() {
  const provider = new RuvllmProvider({
    defaultModel: 'llama-3.2-3b-instruct',
    enableTRM: false,
    enableSONA: false
  });

  await provider.initialize();

  // Prepare 20+ test generation requests
  const methods = Array.from({ length: 25 }, (_, i) => `calculateTotal${i}`);
  const requests: LLMCompletionOptions[] = methods.map(method => ({
    messages: [{
      role: 'user',
      content: `Generate comprehensive unit tests for the ${method} method in TypeScript using Vitest. Include edge cases, error handling, and boundary conditions.`
    }],
    maxTokens: 1000,
    temperature: 0.7
  }));

  console.log(`🚀 Generating tests for ${requests.length} methods in batch...`);
  const startTime = Date.now();

  // Process in batch (4x faster than sequential)
  const responses = await provider.batchComplete(requests);

  const duration = Date.now() - startTime;
  const successCount = responses.filter(r => !r.metadata?.error).length;

  console.log(`✅ Batch completed in ${duration}ms`);
  console.log(`   Success: ${successCount}/${requests.length}`);
  console.log(`   Avg latency: ${Math.round(duration / requests.length)}ms per request`);

  // Process results
  responses.forEach((response, index) => {
    if (response.metadata?.error) {
      console.error(`❌ Method ${methods[index]}: ${response.metadata.error}`);
    } else {
      console.log(`✓ Method ${methods[index]}: ${response.content[0].text.substring(0, 100)}...`);
    }
  });

  await provider.shutdown();
}

/**
 * Example 2: Coverage Analysis Across Modules
 *
 * Analyze test coverage for multiple services in parallel
 */
async function coverageAnalysis() {
  const provider = new RuvllmProvider({
    defaultModel: 'llama-3.2-3b-instruct'
  });

  await provider.initialize();

  const modules = [
    'UserService',
    'PaymentService',
    'AuthService',
    'OrderService',
    'ProductService',
    'CartService',
    'NotificationService',
    'AnalyticsService'
  ];

  const requests: LLMCompletionOptions[] = modules.map(module => ({
    messages: [{
      role: 'user',
      content: `Analyze test coverage for ${module}. Identify untested methods, edge cases, and critical paths that need testing. Provide a coverage report with recommendations.`
    }],
    maxTokens: 800,
    temperature: 0.5
  }));

  console.log(`📊 Analyzing coverage for ${modules.length} modules...`);
  const responses = await provider.batchComplete(requests);

  // Display coverage reports
  responses.forEach((response, index) => {
    console.log(`\n=== ${modules[index]} Coverage Report ===`);
    if (response.metadata?.error) {
      console.error(`Error: ${response.metadata.error}`);
    } else {
      console.log(response.content[0].text);
    }
  });

  await provider.shutdown();
}

/**
 * Example 3: Parallel Flaky Test Detection
 *
 * Analyze multiple test files for flaky tests in parallel
 */
async function flakyTestDetection() {
  const provider = new RuvllmProvider({
    defaultModel: 'llama-3.2-3b-instruct'
  });

  await provider.initialize();

  const testFiles = [
    'tests/auth/login.test.ts',
    'tests/payment/checkout.test.ts',
    'tests/user/profile.test.ts',
    'tests/order/create.test.ts',
    'tests/product/search.test.ts',
    'tests/cart/update.test.ts'
  ];

  const requests: LLMCompletionOptions[] = testFiles.map(file => ({
    messages: [{
      role: 'user',
      content: `Analyze ${file} for potential flaky tests. Look for:
- Non-deterministic assertions
- Race conditions
- Time-dependent tests
- External dependencies without mocking
- Improper test isolation

Provide specific line numbers and recommendations for fixes.`
    }],
    maxTokens: 1200,
    temperature: 0.3
  }));

  console.log(`🔍 Analyzing ${testFiles.length} test files for flakiness...`);
  const responses = await provider.batchComplete(requests);

  // Display flaky test reports
  let totalFlaky = 0;
  responses.forEach((response, index) => {
    console.log(`\n📝 ${testFiles[index]}`);
    if (response.metadata?.error) {
      console.error(`   Error: ${response.metadata.error}`);
    } else {
      const text = response.content[0].text;
      console.log(`   ${text}`);

      // Count flaky tests mentioned
      const flakyCount = (text.match(/flaky/gi) || []).length;
      totalFlaky += flakyCount;
    }
  });

  console.log(`\n📈 Total potential flaky tests found: ${totalFlaky}`);

  await provider.shutdown();
}

/**
 * Example 4: Error Handling with Partial Failures
 *
 * Demonstrates graceful handling when some requests fail
 */
async function errorHandlingExample() {
  const provider = new RuvllmProvider({
    defaultModel: 'llama-3.2-3b-instruct'
  });

  await provider.initialize();

  const requests: LLMCompletionOptions[] = [
    {
      messages: [{ role: 'user', content: 'Generate a simple test' }],
      maxTokens: 500
    },
    {
      messages: [{ role: 'user', content: 'Another test' }],
      maxTokens: 500
    },
    {
      // This might fail if the model has issues
      messages: [{ role: 'user', content: 'Complex nested test with many edge cases...' }],
      maxTokens: 5000  // Very large token limit
    }
  ];

  console.log('🔄 Processing batch with potential failures...');

  try {
    const responses = await provider.batchComplete(requests);

    const successCount = responses.filter(r => !r.metadata?.error).length;
    const failureCount = responses.length - successCount;

    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failures: ${failureCount}`);

    // Process results individually
    responses.forEach((response, index) => {
      if (response.metadata?.error) {
        console.log(`Request ${index}: Failed - ${response.metadata.error}`);
      } else {
        console.log(`Request ${index}: Success - ${response.content[0].text.substring(0, 50)}...`);
      }
    });

  } catch (error) {
    // This only happens if ALL requests fail
    console.error('Entire batch failed:', error);
  }

  await provider.shutdown();
}

/**
 * Main execution
 */
async function main() {
  console.log('=== Batch Query API Examples ===\n');

  // Run examples
  console.log('\n1. Test Generation Burst');
  console.log('----------------------------');
  await testGenerationBurst();

  console.log('\n\n2. Coverage Analysis');
  console.log('----------------------------');
  await coverageAnalysis();

  console.log('\n\n3. Flaky Test Detection');
  console.log('----------------------------');
  await flakyTestDetection();

  console.log('\n\n4. Error Handling');
  console.log('----------------------------');
  await errorHandlingExample();
}

// Run examples if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  testGenerationBurst,
  coverageAnalysis,
  flakyTestDetection,
  errorHandlingExample
};
