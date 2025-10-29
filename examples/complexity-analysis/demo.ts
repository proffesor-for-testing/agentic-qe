/**
 * CodeComplexityAnalyzerAgent - Example Usage
 *
 * This demonstrates how to use the CodeComplexityAnalyzerAgent to:
 * - Analyze code complexity metrics
 * - Get refactoring recommendations
 * - Integrate with the event system
 * - Store results in memory for coordination
 */

import { CodeComplexityAnalyzerAgent } from '../../src/agents/CodeComplexityAnalyzerAgent';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { AgentStatus, QEAgentType } from '../../src/types';
import { EventEmitter } from 'events';

async function main() {
  console.log('🚀 CodeComplexityAnalyzerAgent Demo\n');

  // ============================================================================
  // Step 1: Initialize the agent
  // ============================================================================

  console.log('Step 1: Initializing agent...');

  const memoryStore = new SwarmMemoryManager(':memory:');
  await memoryStore.initialize();

  const eventBus = new EventEmitter();

  // Listen for events
  eventBus.on('complexity:analysis:completed', (event) => {
    console.log('  ✅ Event received: Analysis completed!', {
      score: event.result.score,
      issues: event.result.issues.length
    });
  });

  const agent = new CodeComplexityAnalyzerAgent({
    type: QEAgentType.QUALITY_ANALYZER,
    capabilities: [],
    context: {
      id: 'demo-complexity-agent',
      type: 'quality-analyzer',
      status: AgentStatus.INITIALIZING
    },
    memoryStore,
    eventBus,
    thresholds: {
      cyclomaticComplexity: 10,
      cognitiveComplexity: 15,
      linesOfCode: 200
    },
    enableRecommendations: true,
    enableLearning: false
  });

  await agent.initialize();
  console.log('  ✅ Agent initialized\n');

  // ============================================================================
  // Step 2: Analyze simple code
  // ============================================================================

  console.log('Step 2: Analyzing simple code...');

  const simpleResult = await agent.analyzeComplexity({
    files: [
      {
        path: 'calculator.ts',
        content: `
          export class Calculator {
            add(a: number, b: number): number {
              return a + b;
            }

            subtract(a: number, b: number): number {
              return a - b;
            }

            multiply(a: number, b: number): number {
              return a * b;
            }
          }
        `,
        language: 'typescript'
      }
    ]
  });

  console.log('  Results:');
  console.log('    Quality Score:', simpleResult.score + '/100');
  console.log('    Issues Found:', simpleResult.issues.length);
  console.log('    Analysis Time:', simpleResult.analysisTime + 'ms');
  console.log('    Cyclomatic Complexity:', simpleResult.overall.cyclomaticComplexity.toFixed(2));
  console.log('    Cognitive Complexity:', simpleResult.overall.cognitiveComplexity.toFixed(2));
  console.log('    Lines of Code:', simpleResult.overall.linesOfCode);
  console.log('    Function Count:', simpleResult.overall.functionCount);
  console.log();

  // ============================================================================
  // Step 3: Analyze complex code
  // ============================================================================

  console.log('Step 3: Analyzing complex code with issues...');

  const complexResult = await agent.analyzeComplexity({
    files: [
      {
        path: 'orderProcessor.ts',
        content: `
          export class OrderProcessor {
            processOrder(order: any): void {
              if (order.status === 'pending') {
                if (order.items && order.items.length > 0) {
                  for (let i = 0; i < order.items.length; i++) {
                    const item = order.items[i];
                    if (item.inStock) {
                      if (item.price > 0) {
                        if (order.customer.isPremium) {
                          if (item.category === 'electronics') {
                            if (item.warranty) {
                              console.log('Premium electronics with warranty');
                            } else {
                              console.log('Premium electronics without warranty');
                            }
                          } else {
                            console.log('Premium non-electronics');
                          }
                        } else {
                          if (item.onSale) {
                            console.log('Regular customer, item on sale');
                          } else {
                            console.log('Regular customer, regular price');
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        language: 'typescript'
      }
    ],
    options: {
      includeRecommendations: true,
      severity: 'all'
    }
  });

  console.log('  Results:');
  console.log('    Quality Score:', complexResult.score + '/100');
  console.log('    Issues Found:', complexResult.issues.length);
  console.log('    Analysis Time:', complexResult.analysisTime + 'ms');
  console.log('    Cyclomatic Complexity:', complexResult.overall.cyclomaticComplexity.toFixed(2));
  console.log('    Cognitive Complexity:', complexResult.overall.cognitiveComplexity.toFixed(2));
  console.log();

  // Print issues
  if (complexResult.issues.length > 0) {
    console.log('  ⚠️  Issues Detected:');
    complexResult.issues.forEach((issue, index) => {
      console.log(`    ${index + 1}. [${issue.severity.toUpperCase()}] ${issue.type}`);
      console.log(`       Current: ${issue.current}, Threshold: ${issue.threshold}`);
      console.log(`       ${issue.recommendation}`);
    });
    console.log();
  }

  // Print recommendations
  if (complexResult.recommendations.length > 0) {
    console.log('  💡 Recommendations:');
    complexResult.recommendations.forEach((rec, index) => {
      console.log(`    ${index + 1}. ${rec}`);
    });
    console.log();
  }

  // ============================================================================
  // Step 4: Analyze multiple files
  // ============================================================================

  console.log('Step 4: Analyzing multiple files...');

  const multiFileResult = await agent.analyzeComplexity({
    files: [
      {
        path: 'userService.ts',
        content: `
          export class UserService {
            createUser(data: any): void {
              if (data.name && data.email) {
                console.log('Creating user');
              }
            }
          }
        `,
        language: 'typescript'
      },
      {
        path: 'authService.ts',
        content: `
          export class AuthService {
            login(username: string, password: string): boolean {
              if (username && password) {
                if (username.length > 0 && password.length > 0) {
                  return true;
                }
              }
              return false;
            }
          }
        `,
        language: 'typescript'
      },
      {
        path: 'validationService.ts',
        content: `
          export class ValidationService {
            validate(input: any): boolean {
              if (!input) return false;
              if (typeof input !== 'object') return false;
              if (Array.isArray(input)) return false;
              return true;
            }
          }
        `,
        language: 'typescript'
      }
    ]
  });

  console.log('  Results:');
  console.log('    Files Analyzed:', multiFileResult.fileMetrics.size);
  console.log('    Overall Quality Score:', multiFileResult.score + '/100');
  console.log('    Total Issues:', multiFileResult.issues.length);
  console.log('    Total Functions:', multiFileResult.overall.functionCount);
  console.log('    Total Lines of Code:', multiFileResult.overall.linesOfCode);
  console.log();

  // Print per-file metrics
  console.log('  Per-File Metrics:');
  multiFileResult.fileMetrics.forEach((metrics, filePath) => {
    console.log(`    ${filePath}:`);
    console.log(`      Cyclomatic: ${metrics.cyclomaticComplexity.toFixed(2)}`);
    console.log(`      Cognitive: ${metrics.cognitiveComplexity.toFixed(2)}`);
    console.log(`      Lines: ${metrics.linesOfCode}`);
    console.log(`      Functions: ${metrics.functionCount}`);
  });
  console.log();

  // ============================================================================
  // Step 5: Check memory storage
  // ============================================================================

  console.log('Step 5: Checking memory storage...');

  const agentId = agent.getStatus().agentId.id;
  const storedResult = await memoryStore.retrieve(
    `aqe/complexity/${agentId}/latest-result`
  );

  if (storedResult) {
    console.log('  ✅ Latest result stored in memory');
    console.log('    Stored score:', storedResult.score);
    console.log('    Stored issues:', storedResult.issues.length);
  }

  const history = await memoryStore.retrieve(
    `aqe/complexity/${agentId}/history`
  );

  if (history && history.length > 0) {
    console.log('  ✅ Analysis history stored:', history.length, 'entries');
  }
  console.log();

  // ============================================================================
  // Step 6: Agent coordination example
  // ============================================================================

  console.log('Step 6: Demonstrating agent coordination...');
  console.log('  Other agents could now:');
  console.log('    - Retrieve complexity results from memory');
  console.log('    - Subscribe to complexity:analysis:completed events');
  console.log('    - Generate tests for complex functions (test-generator agent)');
  console.log('    - Focus testing on high-complexity areas (coverage-analyzer agent)');
  console.log('    - Include complexity in quality gate (quality-gate agent)');
  console.log();

  // ============================================================================
  // Cleanup
  // ============================================================================

  console.log('Cleaning up...');
  await agent.terminate();
  await memoryStore.close();

  console.log('\n✅ Demo completed successfully!');
  console.log('\n📚 Key Learnings:');
  console.log('  1. Agents extend BaseAgent with lifecycle hooks');
  console.log('  2. Memory system enables cross-agent coordination');
  console.log('  3. Event bus provides real-time notifications');
  console.log('  4. Complexity analysis helps identify refactoring needs');
  console.log('  5. Agents can learn and improve over time');
}

// Run the demo
if (require.main === module) {
  main().catch(error => {
    console.error('Demo failed:', error);
    process.exit(1);
  });
}

export { main };
