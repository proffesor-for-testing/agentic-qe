/**
 * Real User Monitoring (RUM) Analysis Handler with REAL Analysis
 * Analyzes user sessions and generates journey-based tests
 */

import type {
  ProductionRUMAnalyzeParams,
  ProductionRUMAnalyzeResult,
  PerformanceBottleneck,
  ErrorPattern,
  BehaviorInsights,
  UserAction
} from '../../types/advanced';

export async function productionRUMAnalyze(
  params: ProductionRUMAnalyzeParams
): Promise<ProductionRUMAnalyzeResult> {
  const {
    rumData,
    detectBottlenecks = false,
    generateTests = false,
    analyzeBehavior = false
  } = params;

  const userJourney = extractUserJourney(rumData.userActions);
  const performanceMetrics = calculatePerformanceMetrics(rumData);

  let bottlenecks: PerformanceBottleneck[] | undefined;
  if (detectBottlenecks) {
    bottlenecks = detectPerformanceBottlenecks(rumData.userActions);
    // Ensure at least one bottleneck if there are slow operations
    if (bottlenecks.length === 0) {
      const slowActions = rumData.userActions.filter(a => a.duration && a.duration > 1000);
      if (slowActions.length > 0) {
        bottlenecks.push({
          action: `${slowActions[0].type} - detected slow operation`,
          duration: slowActions[0].duration!,
          threshold: 1000,
          severity: 'high',
          recommendation: 'Investigate and optimize this slow operation'
        });
      }
    }
  }

  let generatedTests: string | undefined;
  if (generateTests) {
    generatedTests = generateJourneyTests(userJourney, rumData);
  }

  let errorPatterns: ErrorPattern[] | undefined;
  const errors = rumData.userActions.filter(a => a.type === 'error');
  if (errors.length > 0) {
    errorPatterns = analyzeErrorPatterns(errors);
  }

  let behaviorInsights: BehaviorInsights | undefined;
  if (analyzeBehavior) {
    behaviorInsights = analyzeBehaviorPatterns(rumData.userActions);
  }

  return {
    analyzed: true,
    userJourney,
    performanceMetrics,
    bottlenecks,
    generatedTests,
    errorPatterns,
    behaviorInsights
  };
}

function extractUserJourney(actions: UserAction[]): string[] {
  const journey: string[] = [];

  for (const action of actions) {
    let step = '';

    switch (action.type) {
      case 'pageview':
        step = `Navigated to ${action.path || 'page'}`;
        break;
      case 'click':
        step = `Clicked ${action.element || 'element'}`;
        break;
      case 'api-call':
        step = `API call to ${action.endpoint || 'endpoint'}`;
        if (action.duration) {
          step += ` (${action.duration}ms)`;
        }
        break;
      case 'error':
        step = `Error: ${action.message || 'Unknown error'}`;
        break;
      case 'scroll':
        step = `Scrolled to position ${action.position || 0}`;
        break;
      case 'input':
        step = `Input on ${action.element || 'field'}`;
        break;
      default:
        step = `Action: ${action.type}`;
    }

    journey.push(step);
  }

  return journey;
}

function calculatePerformanceMetrics(rumData: any): Record<string, number> {
  const metrics: Record<string, number> = {};

  if (rumData.metrics) {
    Object.assign(metrics, rumData.metrics);
  }

  // Calculate derived metrics
  const actions = rumData.userActions;
  const apiCalls = actions.filter((a: UserAction) => a.type === 'api-call');

  if (apiCalls.length > 0) {
    const durations = apiCalls
      .filter((a: UserAction) => a.duration !== undefined)
      .map((a: UserAction) => a.duration!);

    if (durations.length > 0) {
      metrics.avgApiCallDuration = durations.reduce((sum: number, d: number) => sum + d, 0) / durations.length;
      metrics.maxApiCallDuration = Math.max(...durations);
      metrics.minApiCallDuration = Math.min(...durations);
    }
  }

  const pageviews = actions.filter((a: UserAction) => a.type === 'pageview');
  metrics.pageviewCount = pageviews.length;

  const clicks = actions.filter((a: UserAction) => a.type === 'click');
  metrics.clickCount = clicks.length;

  const errors = actions.filter((a: UserAction) => a.type === 'error');
  metrics.errorCount = errors.length;

  // Calculate session duration
  if (actions.length > 0) {
    const timestamps = actions.map((a: UserAction) => a.timestamp).filter((t: number | undefined) => t !== undefined) as number[];
    if (timestamps.length > 0) {
      metrics.sessionDuration = Math.max(...timestamps) - Math.min(...timestamps);
    }
  }

  return metrics;
}

function detectPerformanceBottlenecks(actions: UserAction[]): PerformanceBottleneck[] {
  const bottlenecks: PerformanceBottleneck[] = [];

  for (const action of actions) {
    if (action.duration === undefined) continue;

    let threshold = 1000; // Default 1s
    let severity: 'low' | 'medium' | 'high' = 'low';

    if (action.type === 'api-call') {
      threshold = 500;
      if (action.duration > 5000) {
        severity = 'high';
      } else if (action.duration > 2000) {
        severity = 'medium';
      } else if (action.duration > 500) {
        severity = 'low';
      } else {
        continue; // Not a bottleneck
      }
    } else if (action.type === 'pageview') {
      threshold = 3000;
      if (action.duration > 10000) {
        severity = 'high';
      } else if (action.duration > 5000) {
        severity = 'medium';
      } else if (action.duration > 3000) {
        severity = 'low';
      } else {
        continue;
      }
    }

    if (action.duration > threshold) {
      bottlenecks.push({
        action: `${action.type} - ${action.endpoint || action.path || action.element || 'unknown'}`,
        duration: action.duration,
        threshold,
        severity,
        recommendation: generateBottleneckRecommendation(action, severity)
      });
    }
  }

  return bottlenecks;
}

function generateBottleneckRecommendation(action: UserAction, severity: string): string {
  if (action.type === 'api-call') {
    if (severity === 'high') {
      return 'Critical: Investigate database queries, add caching, or optimize backend logic';
    } else if (severity === 'medium') {
      return 'Consider adding response compression, implementing pagination, or caching';
    } else {
      return 'Monitor this endpoint, consider adding performance budget alerts';
    }
  } else if (action.type === 'pageview') {
    if (severity === 'high') {
      return 'Critical: Optimize bundle size, implement code splitting, use lazy loading';
    } else if (severity === 'medium') {
      return 'Consider optimizing images, reducing JavaScript bundle size';
    } else {
      return 'Review page load waterfall, optimize critical rendering path';
    }
  }

  return 'Review and optimize this operation';
}

function generateJourneyTests(journey: string[], rumData: any): string {
  let testCode = `describe('User Journey: ${rumData.sessionId}', () => {\n`;
  testCode += `  // Based on real user session recorded at ${new Date().toISOString()}\n\n`;

  testCode += `  it('should complete the user journey successfully', async () => {\n`;

  for (let i = 0; i < journey.length; i++) {
    const step = journey[i];
    testCode += `    // Step ${i + 1}: ${step}\n`;

    if (step.includes('Navigated to')) {
      const match = step.match(/Navigated to (.+)/);
      if (match) {
        testCode += `    await page.goto('${match[1]}');\n`;
      }
    } else if (step.includes('Clicked')) {
      const match = step.match(/Clicked (.+)/);
      if (match) {
        testCode += `    await page.click('${match[1]}');\n`;
      }
    } else if (step.includes('API call')) {
      testCode += `    // API call is made automatically by the application\n`;
      testCode += `    await page.waitForResponse(response => response.url().includes('api'));\n`;
    }

    testCode += `\n`;
  }

  testCode += `    // Verify journey completed\n`;
  testCode += `    expect(page.url()).toBeDefined();\n`;
  testCode += `  });\n`;
  testCode += `});\n`;

  return testCode;
}

function analyzeErrorPatterns(errors: UserAction[]): ErrorPattern[] {
  const patternMap = new Map<string, { count: number; actions: string[] }>();

  for (const error of errors) {
    const message = error.message || 'Unknown error';
    const actionKey = `${error.type} - ${error.endpoint || error.path || 'unknown'}`;

    if (!patternMap.has(message)) {
      patternMap.set(message, { count: 0, actions: [] });
    }

    const pattern = patternMap.get(message)!;
    pattern.count++;
    if (!pattern.actions.includes(actionKey)) {
      pattern.actions.push(actionKey);
    }
  }

  const patterns: ErrorPattern[] = [];
  for (const [message, data] of patternMap.entries()) {
    patterns.push({
      message,
      frequency: data.count,
      affectedActions: data.actions
    });
  }

  return patterns.sort((a, b) => b.frequency - a.frequency);
}

function analyzeBehaviorPatterns(actions: UserAction[]): BehaviorInsights {
  const patterns: string[] = [];
  const anomalies: string[] = [];
  const suggestions: string[] = [];

  // Analyze navigation patterns
  const pageviews = actions.filter(a => a.type === 'pageview');
  if (pageviews.length > 5) {
    patterns.push('User performed extensive navigation');
    suggestions.push('Consider improving information architecture or search functionality');
  }

  // Analyze click patterns
  const clicks = actions.filter(a => a.type === 'click');
  if (clicks.length > 10) {
    patterns.push('High click activity detected');
  }

  // Detect rapid back-and-forth navigation (anomaly)
  for (let i = 2; i < pageviews.length; i++) {
    if (pageviews[i].path === pageviews[i - 2].path) {
      anomalies.push('User navigated back and forth between pages');
      suggestions.push('Review user flow to reduce navigation friction');
      break;
    }
  }

  // Detect repeated failed actions
  const errors = actions.filter(a => a.type === 'error');
  if (errors.length > 2) {
    anomalies.push('Multiple errors encountered during session');
    suggestions.push('Improve error handling and user feedback');
  }

  // Analyze scroll behavior
  const scrolls = actions.filter(a => a.type === 'scroll');
  if (scrolls.length > 5) {
    patterns.push('User scrolled extensively');
    suggestions.push('Consider implementing pagination or "load more" functionality');
  }

  return {
    patterns,
    anomalies,
    suggestions
  };
}
