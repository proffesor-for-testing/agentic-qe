/**
 * Troubleshoot Command
 * Troubleshoots specific issues with diagnosis and suggestions
 */

import * as fs from 'fs';
import * as path from 'path';

export interface TroubleshootOptions {
  issue: string;
  context?: any;
  logFile?: string;
  export?: 'json' | 'yaml';
  outputDir?: string;
  stepByStep?: boolean;
  searchKB?: boolean;
}

export interface ResolutionStep {
  step: number;
  action: string;
  description: string;
  command?: string;
}

export interface SimilarIssue {
  title: string;
  solution: string;
  relevance: number;
}

export interface TroubleshootResult {
  success: boolean;
  diagnosis: string;
  suggestions: string[];
  resolutionSteps?: ResolutionStep[];
  similarIssues?: SimilarIssue[];
  errorPatterns?: string[];
  reportPath?: string;
}

/**
 * Troubleshoot specific issue
 */
export async function troubleshoot(options: TroubleshootOptions): Promise<TroubleshootResult> {
  try {
    let diagnosis = '';
    let suggestions: string[] = [];
    let resolutionSteps: ResolutionStep[] | undefined;
    let errorPatterns: string[] | undefined;

    switch (options.issue) {
      case 'test-failure':
        ({ diagnosis, suggestions, resolutionSteps } = await troubleshootTestFailure(options));
        break;

      case 'coverage-gap':
        ({ diagnosis, suggestions, resolutionSteps } = await troubleshootCoverageGap(options));
        break;

      case 'agent-failure':
        ({ diagnosis, suggestions, resolutionSteps } = await troubleshootAgentFailure(options));
        break;

      case 'error-analysis':
        ({ diagnosis, suggestions, errorPatterns } = await analyzeErrorLogs(options));
        break;

      default:
        ({ diagnosis, suggestions } = await troubleshootGeneric(options));
    }

    // Search knowledge base if requested
    let similarIssues: SimilarIssue[] | undefined;
    if (options.searchKB) {
      similarIssues = await searchKnowledgeBase(options.issue);
    }

    // Export report if requested
    let reportPath: string | undefined;
    if (options.export) {
      const outputDir = options.outputDir || path.join(process.cwd(), '.swarm', 'reports');
      fs.mkdirSync(outputDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const report = {
        issue: options.issue,
        timestamp: Date.now(),
        diagnosis,
        suggestions,
        resolutionSteps,
        errorPatterns,
        similarIssues,
        context: options.context,
      };

      if (options.export === 'json') {
        reportPath = path.join(outputDir, `troubleshoot-${timestamp}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      } else if (options.export === 'yaml') {
        const yaml = await import('yaml');
        reportPath = path.join(outputDir, `troubleshoot-${timestamp}.yaml`);
        fs.writeFileSync(reportPath, yaml.stringify(report));
      }
    }

    return {
      success: true,
      diagnosis,
      suggestions,
      resolutionSteps,
      similarIssues,
      errorPatterns,
      reportPath,
    };
  } catch (error: any) {
    return {
      success: false,
      diagnosis: 'Failed to troubleshoot issue',
      suggestions: [error.message],
    };
  }
}

async function troubleshootTestFailure(options: TroubleshootOptions) {
  const testFile = options.context?.testFile || 'unknown';

  const diagnosis = `Test failure detected in ${testFile}. Common causes: incorrect assertions, missing setup/teardown, race conditions, or environment issues.`;

  const suggestions = [
    'Run the test in isolation to rule out interdependencies',
    'Check test logs for specific error messages',
    'Verify test fixtures and mock data are correct',
    'Ensure async operations are properly awaited',
    'Check for race conditions in parallel tests',
    'Verify environment variables are set correctly',
  ];

  const resolutionSteps: ResolutionStep[] = options.stepByStep ? [
    {
      step: 1,
      action: 'Isolate the failing test',
      description: 'Run only the failing test to confirm it fails consistently',
      command: `npm test -- ${testFile} -t "test name"`,
    },
    {
      step: 2,
      action: 'Check test logs',
      description: 'Review console output and error messages',
      command: `npm test -- ${testFile} --verbose`,
    },
    {
      step: 3,
      action: 'Verify test setup',
      description: 'Ensure beforeEach/afterEach hooks are working correctly',
    },
    {
      step: 4,
      action: 'Debug the test',
      description: 'Use debugger or add console.log statements',
      command: `node --inspect-brk node_modules/.bin/vitest ${testFile}`,
    },
    {
      step: 5,
      action: 'Check for race conditions',
      description: 'Add delays or use waitFor utilities for async operations',
    },
  ] : [];

  return { diagnosis, suggestions, resolutionSteps };
}

async function troubleshootCoverageGap(options: TroubleshootOptions) {
  const file = options.context?.file || 'unknown';
  const coverage = options.context?.coverage || 0;

  const diagnosis = `Coverage gap detected in ${file} (${coverage}% coverage). Need to add tests for uncovered code paths.`;

  const suggestions = [
    'Identify uncovered lines using coverage report',
    'Write tests for edge cases and error paths',
    'Add tests for conditional branches',
    'Test exception handling',
    'Consider property-based testing for complex logic',
  ];

  const resolutionSteps: ResolutionStep[] = options.stepByStep ? [
    {
      step: 1,
      action: 'Generate coverage report',
      description: 'Run tests with coverage to see uncovered lines',
      command: `npm test -- --coverage ${file}`,
    },
    {
      step: 2,
      action: 'Identify uncovered code',
      description: 'Review coverage report to find gaps',
      command: `open coverage/lcov-report/index.html`,
    },
    {
      step: 3,
      action: 'Write tests for gaps',
      description: 'Add test cases for uncovered branches and lines',
    },
    {
      step: 4,
      action: 'Verify coverage improvement',
      description: 'Run coverage again to confirm improvement',
      command: `npm test -- --coverage ${file}`,
    },
  ] : [];

  return { diagnosis, suggestions, resolutionSteps };
}

async function troubleshootAgentFailure(options: TroubleshootOptions) {
  const agentName = options.context?.agentName || 'unknown';
  const error = options.context?.error || 'unknown';

  const diagnosis = `Agent ${agentName} failed with error: ${error}. This could be due to resource constraints, configuration issues, or runtime errors.`;

  const suggestions = [
    'Check agent logs for detailed error messages',
    'Verify agent configuration is correct',
    'Ensure sufficient system resources (CPU, memory)',
    'Check for conflicting agents or processes',
    'Restart the agent fleet',
    'Update agent dependencies',
  ];

  const resolutionSteps: ResolutionStep[] = options.stepByStep ? [
    {
      step: 1,
      action: 'Check agent status',
      description: 'Verify agent state and configuration',
      command: `aqe debug agent ${agentName}`,
    },
    {
      step: 2,
      action: 'Review agent logs',
      description: 'Check logs for error details',
      command: `aqe debug agent ${agentName} --verbose`,
    },
    {
      step: 3,
      action: 'Check system resources',
      description: 'Ensure adequate CPU and memory',
      command: `aqe diagnostics run --checks memory,cpu`,
    },
    {
      step: 4,
      action: 'Restart agent',
      description: 'Stop and start the agent',
      command: `aqe agent stop ${agentName} && aqe agent start ${agentName}`,
    },
    {
      step: 5,
      action: 'Verify agent is working',
      description: 'Run a test task to confirm functionality',
      command: `aqe agent execute --name ${agentName} --task "test task"`,
    },
  ] : [];

  return { diagnosis, suggestions, resolutionSteps };
}

async function analyzeErrorLogs(options: TroubleshootOptions) {
  const errorPatterns: string[] = [];
  let diagnosis = 'No errors found in logs';
  const suggestions: string[] = [];

  if (options.logFile && fs.existsSync(options.logFile)) {
    const logContent = fs.readFileSync(options.logFile, 'utf-8');
    const lines = logContent.split('\n');

    // Common error patterns
    const patterns = [
      { regex: /Error: /gi, type: 'Generic Error' },
      { regex: /TypeError: /gi, type: 'Type Error' },
      { regex: /ReferenceError: /gi, type: 'Reference Error' },
      { regex: /SyntaxError: /gi, type: 'Syntax Error' },
      { regex: /ENOENT/gi, type: 'File Not Found' },
      { regex: /EACCES/gi, type: 'Permission Denied' },
      { regex: /timeout/gi, type: 'Timeout' },
      { regex: /out of memory/gi, type: 'Out of Memory' },
    ];

    for (const pattern of patterns) {
      const matches = logContent.match(pattern.regex);
      if (matches && matches.length > 0) {
        errorPatterns.push(`${pattern.type}: ${matches.length} occurrence(s)`);
      }
    }

    if (errorPatterns.length > 0) {
      diagnosis = `Found ${errorPatterns.length} error pattern(s) in logs`;
      suggestions.push('Review error patterns above');
      suggestions.push('Check for common causes of each error type');
      suggestions.push('Fix most frequent errors first');
    }
  } else {
    suggestions.push('Provide log file path to analyze errors');
  }

  return { diagnosis, suggestions, errorPatterns };
}

async function troubleshootGeneric(options: TroubleshootOptions) {
  const diagnosis = `Generic troubleshooting for: ${options.issue}`;

  const suggestions = [
    'Check system logs for errors',
    'Verify configuration is correct',
    'Review recent changes',
    'Restart affected components',
    'Check documentation for known issues',
    'Search knowledge base for similar problems',
  ];

  return { diagnosis, suggestions };
}

async function searchKnowledgeBase(issue: string): Promise<SimilarIssue[]> {
  // Simulated knowledge base
  const knowledgeBase: Record<string, SimilarIssue[]> = {
    'test-failure': [
      {
        title: 'Async test timing out',
        solution: 'Increase test timeout or ensure promises are properly awaited',
        relevance: 0.85,
      },
      {
        title: 'Mock not being called',
        solution: 'Verify mock is set up before function call',
        relevance: 0.75,
      },
    ],
    'coverage-gap': [
      {
        title: 'Cannot reach 100% coverage',
        solution: 'Some code paths may be unreachable or defensive',
        relevance: 0.80,
      },
    ],
    'agent-failure': [
      {
        title: 'Agent timeout',
        solution: 'Increase agent timeout or optimize task complexity',
        relevance: 0.90,
      },
    ],
  };

  return knowledgeBase[issue] || [];
}
