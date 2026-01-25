/**
 * Prompt Cache Integration Examples (CO-1)
 *
 * Demonstrates how to integrate PromptCacheManager with QE agents:
 * - qe-test-generator
 * - qe-coverage-analyzer
 * - qe-security-scanner
 *
 * These examples show:
 * - Proper system prompt caching
 * - Project context caching
 * - Cache statistics tracking
 * - Cost savings monitoring
 *
 * @module utils/prompt-cache-examples
 */

import { PromptCacheManager } from './prompt-cache';
import Anthropic from '@anthropic-ai/sdk';

/**
 * System prompt for Test Generator Agent
 *
 * This is a large system prompt (>1024 tokens) that defines the agent's
 * behavior and capabilities. Perfect candidate for caching.
 */
const TEST_GENERATOR_SYSTEM_PROMPT = `
You are an expert Test Generator Agent specialized in creating high-quality, comprehensive test suites.

Your capabilities include:
1. Generating unit tests, integration tests, and E2E tests
2. Optimizing test coverage using sublinear algorithms (O(log n))
3. Identifying edge cases and boundary conditions
4. Creating parameterized tests for reusability
5. Following testing best practices (AAA, DRY, FIRST principles)

When generating tests:
- Analyze code complexity and structure
- Identify critical paths and edge cases
- Generate diverse test scenarios
- Use appropriate assertions
- Follow framework-specific conventions (Jest, Vitest, etc.)
- Optimize for maximum coverage with minimum tests

Your test generation follows these principles:
- Tests should be deterministic and repeatable
- Tests should be isolated and independent
- Tests should have clear, descriptive names
- Tests should follow the Arrange-Act-Assert pattern
- Tests should cover happy paths, error cases, and edge cases

Format your test output as valid TypeScript/JavaScript code compatible with the specified framework.
`.trim();

/**
 * System prompt for Coverage Analyzer Agent
 */
const COVERAGE_ANALYZER_SYSTEM_PROMPT = `
You are an expert Coverage Analyzer Agent specialized in identifying gaps in test coverage.

Your capabilities include:
1. Analyzing code coverage reports (lcov, istanbul, etc.)
2. Identifying untested code paths using O(log n) sublinear search
3. Prioritizing coverage gaps by risk and impact
4. Recommending specific tests to close gaps
5. Calculating coverage metrics and projections

When analyzing coverage:
- Parse coverage data from multiple formats
- Identify critical uncovered paths
- Calculate branch and line coverage
- Assess risk of uncovered code
- Provide actionable recommendations

Your analysis focuses on:
- High-risk uncovered code (error handling, security)
- Business-critical paths
- Complex logic with low coverage
- Recently changed code
- Public APIs and interfaces

Format your analysis as structured JSON with clear priorities and recommendations.
`.trim();

/**
 * System prompt for Security Scanner Agent
 */
const SECURITY_SCANNER_SYSTEM_PROMPT = `
You are an expert Security Scanner Agent specialized in identifying security vulnerabilities.

Your capabilities include:
1. Scanning code for OWASP Top 10 vulnerabilities
2. Detecting SQL injection, XSS, CSRF risks
3. Identifying authentication and authorization flaws
4. Finding hardcoded secrets and sensitive data exposure
5. Analyzing dependencies for known vulnerabilities

When scanning:
- Use static analysis patterns
- Check for common vulnerability patterns
- Validate input sanitization
- Review authentication mechanisms
- Assess cryptographic usage
- Identify sensitive data exposure

Your scan focuses on:
- Injection vulnerabilities (SQL, NoSQL, OS command)
- Broken authentication and session management
- Sensitive data exposure
- XML external entities (XXE)
- Broken access control
- Security misconfigurations
- Cross-site scripting (XSS)
- Insecure deserialization
- Using components with known vulnerabilities
- Insufficient logging and monitoring

Format your findings as structured JSON with severity levels, descriptions, and remediation steps.
`.trim();

/**
 * Example: Test Generator with Prompt Caching
 *
 * Demonstrates caching system prompt and project context for test generation.
 */
export async function generateTestsWithCache(params: {
  apiKey: string;
  sourceFile: string;
  sourceCode: string;
  framework: 'jest' | 'vitest';
  projectStructure: any;
  guidelines: string;
}): Promise<{
  testCode: string;
  cacheStats: any;
}> {
  const cacheManager = new PromptCacheManager(params.apiKey);

  // System prompt is large and stable - perfect for caching
  const systemPrompt = TEST_GENERATOR_SYSTEM_PROMPT;

  // Project context changes per project but stable within project
  const projectContext = {
    structure: params.projectStructure,
    guidelines: params.guidelines,
    framework: params.framework,
  };

  // Make cached request
  const response = await cacheManager.createWithCache({
    model: 'claude-sonnet-4',
    systemPrompts: [
      {
        text: systemPrompt,
        priority: 'high', // System prompt is critical and large
      },
    ],
    projectContext: [
      {
        text: JSON.stringify(projectContext.structure, null, 2),
        priority: 'medium',
      },
      {
        text: projectContext.guidelines,
        priority: 'medium',
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Generate ${params.framework} tests for the following code:\n\nFile: ${params.sourceFile}\n\n${params.sourceCode}`,
      },
    ],
    maxTokens: 4096,
    temperature: 0.3, // Lower temperature for more deterministic tests
  });

  // Extract test code from response
  const testCode = response.content[0].type === 'text' ? response.content[0].text : '';

  // Get cache statistics
  const stats = cacheManager.getStats();

  return {
    testCode,
    cacheStats: {
      hitRate: `${(stats.hitRate * 100).toFixed(1)}%`,
      costSavings: `$${stats.costSavings.toFixed(4)}`,
      hits: stats.hits,
      misses: stats.misses,
      tokensRead: stats.tokensRead,
      tokensWritten: stats.tokensWritten,
    },
  };
}

/**
 * Example: Coverage Analyzer with Prompt Caching
 *
 * Demonstrates caching for coverage analysis with large coverage reports.
 */
export async function analyzeCoverageWithCache(params: {
  apiKey: string;
  coverageData: any;
  projectMetadata: {
    name: string;
    threshold: number;
    criticalPaths: string[];
  };
}): Promise<{
  analysis: any;
  cacheStats: any;
}> {
  const cacheManager = new PromptCacheManager(params.apiKey);

  // System prompt defines coverage analysis behavior
  const systemPrompt = COVERAGE_ANALYZER_SYSTEM_PROMPT;

  // Project metadata is stable within project
  const projectContext = JSON.stringify(params.projectMetadata, null, 2);

  // Make cached request
  const response = await cacheManager.createWithCache({
    model: 'claude-sonnet-4',
    systemPrompts: [
      {
        text: systemPrompt,
        priority: 'high',
      },
    ],
    projectContext: [
      {
        text: projectContext,
        priority: 'medium',
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Analyze the following coverage data and identify top gaps:\n\n${JSON.stringify(params.coverageData, null, 2)}`,
      },
    ],
    maxTokens: 4096,
    temperature: 0.2, // Very low temperature for consistent analysis
  });

  // Parse analysis from response
  const analysisText = response.content[0].type === 'text' ? response.content[0].text : '';
  let analysis;
  try {
    analysis = JSON.parse(analysisText);
  } catch {
    analysis = { raw: analysisText };
  }

  // Get cache statistics
  const stats = cacheManager.getStats();

  return {
    analysis,
    cacheStats: {
      hitRate: `${(stats.hitRate * 100).toFixed(1)}%`,
      costSavings: `$${stats.costSavings.toFixed(4)}`,
      hits: stats.hits,
      misses: stats.misses,
    },
  };
}

/**
 * Example: Security Scanner with Prompt Caching
 *
 * Demonstrates caching for security scans with vulnerability patterns.
 */
export async function scanSecurityWithCache(params: {
  apiKey: string;
  sourceCode: string;
  fileName: string;
  securityRules: string[];
}): Promise<{
  findings: any;
  cacheStats: any;
}> {
  const cacheManager = new PromptCacheManager(params.apiKey);

  // System prompt includes OWASP patterns and rules
  const systemPrompt = SECURITY_SCANNER_SYSTEM_PROMPT;

  // Security rules are project-specific but stable
  const rulesContext = JSON.stringify({
    rules: params.securityRules,
    standards: ['OWASP Top 10', 'CWE', 'SANS 25'],
  }, null, 2);

  // Make cached request
  const response = await cacheManager.createWithCache({
    model: 'claude-sonnet-4',
    systemPrompts: [
      {
        text: systemPrompt,
        priority: 'high',
      },
    ],
    projectContext: [
      {
        text: rulesContext,
        priority: 'medium',
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Scan the following code for security vulnerabilities:\n\nFile: ${params.fileName}\n\n${params.sourceCode}`,
      },
    ],
    maxTokens: 4096,
    temperature: 0.1, // Lowest temperature for consistent security analysis
  });

  // Parse findings from response
  const findingsText = response.content[0].type === 'text' ? response.content[0].text : '';
  let findings;
  try {
    findings = JSON.parse(findingsText);
  } catch {
    findings = { raw: findingsText };
  }

  // Get cache statistics
  const stats = cacheManager.getStats();

  return {
    findings,
    cacheStats: {
      hitRate: `${(stats.hitRate * 100).toFixed(1)}%`,
      costSavings: `$${stats.costSavings.toFixed(4)}`,
      hits: stats.hits,
      misses: stats.misses,
    },
  };
}

/**
 * Example: Batch Test Generation with Cache Monitoring
 *
 * Demonstrates how cache performance improves over multiple calls.
 */
export async function batchGenerateTestsWithCacheMonitoring(params: {
  apiKey: string;
  files: Array<{ path: string; content: string }>;
  framework: 'jest' | 'vitest';
  projectContext: any;
}): Promise<{
  results: Array<{ file: string; testCode: string }>;
  finalStats: {
    hitRate: string;
    costSavings: string;
    totalHits: number;
    totalMisses: number;
    breakEvenAnalysis: {
      hitsNeeded: number;
      actualHits: number;
      metBreakEven: boolean;
    };
  };
}> {
  const cacheManager = new PromptCacheManager(params.apiKey);

  const systemPrompt = TEST_GENERATOR_SYSTEM_PROMPT;
  const projectContextText = JSON.stringify(params.projectContext, null, 2);

  const results: Array<{ file: string; testCode: string }> = [];

  // Process files sequentially to demonstrate cache warming
  for (const file of params.files) {
    const response = await cacheManager.createWithCache({
      model: 'claude-sonnet-4',
      systemPrompts: [
        {
          text: systemPrompt,
          priority: 'high',
        },
      ],
      projectContext: [
        {
          text: projectContextText,
          priority: 'medium',
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Generate ${params.framework} tests for:\n\n${file.path}\n\n${file.content}`,
        },
      ],
    });

    const testCode = response.content[0].type === 'text' ? response.content[0].text : '';
    results.push({ file: file.path, testCode });

    // Log progress
    const stats = cacheManager.getStats();
    console.log(`Processed ${file.path} - Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
  }

  // Final statistics
  const finalStats = cacheManager.getStats();

  // Calculate break-even analysis
  const estimatedCacheTokens = 18000; // Approximate system + context tokens
  const breakEven = PromptCacheManager.calculateBreakEven(estimatedCacheTokens);

  return {
    results,
    finalStats: {
      hitRate: `${(finalStats.hitRate * 100).toFixed(1)}%`,
      costSavings: `$${finalStats.costSavings.toFixed(4)}`,
      totalHits: finalStats.hits,
      totalMisses: finalStats.misses,
      breakEvenAnalysis: {
        hitsNeeded: breakEven.hitsToBreakEven,
        actualHits: finalStats.hits,
        metBreakEven: finalStats.hits >= breakEven.hitsToBreakEven,
      },
    },
  };
}

/**
 * Example: Periodic Cache Maintenance
 *
 * Demonstrates how to set up periodic cache pruning in a long-running service.
 */
export function setupCacheMaintenance(cacheManager: PromptCacheManager): {
  stop: () => void;
} {
  // Prune cache every 5 minutes
  const intervalId = setInterval(() => {
    const pruned = cacheManager.pruneCache();
    if (pruned > 0) {
      console.log(`[Cache Maintenance] Pruned ${pruned} expired entries`);
    }

    // Log statistics
    const stats = cacheManager.getStats();
    console.log(`[Cache Maintenance] Hit rate: ${(stats.hitRate * 100).toFixed(1)}%, Savings: $${stats.costSavings.toFixed(4)}`);
  }, 5 * 60 * 1000);

  return {
    stop: () => {
      clearInterval(intervalId);
      console.log('[Cache Maintenance] Stopped');
    },
  };
}

/**
 * Example: Daily Statistics Reset
 *
 * Demonstrates how to reset statistics at the start of each day for daily reporting.
 */
export function setupDailyStatsReset(cacheManager: PromptCacheManager): {
  stop: () => void;
} {
  // Calculate time until next midnight
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const msUntilMidnight = tomorrow.getTime() - now.getTime();

  // Reset at midnight
  const timeoutId = setTimeout(() => {
    const stats = cacheManager.getStats();
    console.log(`[Daily Stats] Yesterday: ${(stats.hitRate * 100).toFixed(1)}% hit rate, $${stats.costSavings.toFixed(4)} savings`);

    cacheManager.resetStats();
    console.log('[Daily Stats] Reset for new day');

    // Set up daily interval
    const intervalId = setInterval(() => {
      const dailyStats = cacheManager.getStats();
      console.log(`[Daily Stats] ${(dailyStats.hitRate * 100).toFixed(1)}% hit rate, $${dailyStats.costSavings.toFixed(4)} savings`);
      cacheManager.resetStats();
    }, 24 * 60 * 60 * 1000);

    // Store interval ID for cleanup
    (setupDailyStatsReset as any).intervalId = intervalId;
  }, msUntilMidnight);

  return {
    stop: () => {
      clearTimeout(timeoutId);
      if ((setupDailyStatsReset as any).intervalId) {
        clearInterval((setupDailyStatsReset as any).intervalId);
      }
      console.log('[Daily Stats] Stopped');
    },
  };
}
