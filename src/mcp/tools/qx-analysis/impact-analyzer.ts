/**
 * Agentic QE v3 - Impact Analyzer
 *
 * Analyzes visible and invisible impacts of quality experience.
 * Identifies immutable requirements and overall impact scores.
 *
 * QX Methodology by Lalitkumar Bhamare / Tales of Testing
 */

import { QXContext, ProblemAnalysis, ImpactAnalysis } from './types';

// ============================================================================
// Impact Analyzer
// ============================================================================

export class ImpactAnalyzer {
  // ==========================================================================
  // Load time feeling thresholds: [minMs, maxMs, feeling]
  // Evaluated in order; first match wins.
  // ==========================================================================
  private static readonly LOAD_TIME_FEELINGS: ReadonlyArray<[number, number, string]> = [
    [4001, Infinity, 'Impatient - Very slow load time causes significant frustration'],
    [3001, 4000, 'Impatient - Slow load time causes frustration'],
    [2001, 3000, 'Mildly Annoyed - Noticeable load time'],
    [0, 1499, 'Delighted - Fast load time enhances experience'],
    [1500, 1999, 'Satisfied - Good load time meets expectations'],
  ];

  // ==========================================================================
  // Domain keyword to immutable requirements lookup
  // ==========================================================================
  private static readonly DOMAIN_REQUIREMENTS: ReadonlyArray<[string[], string[]]> = [
    [
      ['health', 'medical', 'care'],
      ['Must comply with healthcare accessibility standards', 'Must protect patient data privacy'],
    ],
    [
      ['bank', 'finance', 'payment'],
      ['Must maintain PCI DSS compliance for payment data', 'Must support secure authentication flows'],
    ],
  ];

  // ==========================================================================
  // Visible score adjustments: [sentimentKeywords, scoreDelta]
  // ==========================================================================
  private static readonly VISIBLE_SCORE_ADJUSTMENTS: ReadonlyArray<[string[], number]> = [
    [['Positive', 'Satisfied', 'Delighted'], 20],
    [['Oriented'], 10],
    [['Frustrated', 'Confused', 'Impatient'], -15],
    [['Disoriented'], -10],
  ];

  /**
   * Analyze impacts from context and problem analysis
   */
  analyze(context: QXContext, problemAnalysis: ProblemAnalysis): ImpactAnalysis {
    const guiFlowEndUser = this.analyzeEndUserFlow(context);
    const guiFlowInternal = this.analyzeInternalFlow(context);
    const userFeelings = this.analyzeUserFeelings(context);
    const performance = this.analyzePerformance(context);
    const security = this.analyzeSecurity(context);
    const immutableRequirements = this.analyzeImmutableRequirements(context, problemAnalysis);

    const visibleScore = this.calculateVisibleScore(guiFlowEndUser, userFeelings);
    const invisibleScore = this.calculateInvisibleScore(performance, security);
    const overallImpactScore = Math.round((visibleScore + invisibleScore) / 2);

    return {
      visible: {
        guiFlow: {
          forEndUser: guiFlowEndUser,
          forInternalUser: guiFlowInternal,
        },
        userFeelings,
        score: visibleScore,
      },
      invisible: {
        performance,
        security,
        score: invisibleScore,
      },
      immutableRequirements,
      overallImpactScore,
    };
  }

  // ==========================================================================
  // Extracted Sub-Analysis Methods
  // ==========================================================================

  private analyzeEndUserFlow(context: QXContext): string[] {
    const results: string[] = [];
    const interactiveElements = context.domMetrics?.interactiveElements || 0;
    const forms = context.domMetrics?.forms || 0;

    if (interactiveElements > 0) {
      results.push(`${interactiveElements} interactive elements affect user journey`);
    }
    if (forms > 0) {
      results.push(`${forms} forms impact user input flows`);
    }
    if (context.domMetrics?.semanticStructure?.hasNav) {
      results.push('Navigation structure enables exploration flow');
    }
    if (context.domMetrics?.semanticStructure?.hasMain) {
      results.push('Clear main content area guides user focus');
    }
    return results;
  }

  private analyzeInternalFlow(context: QXContext): string[] {
    const results: string[] = [];
    const forms = context.domMetrics?.forms || 0;

    if (forms > 0) {
      results.push('Form submissions create data processing workflows');
    }
    if (context.domMetrics?.semanticStructure?.hasAside) {
      results.push('Sidebar content may require separate management');
    }
    return results;
  }

  private analyzeUserFeelings(context: QXContext): string[] {
    const feelings: string[] = [];

    // Accessibility feelings
    const altCoverage = context.accessibility?.altTextsCoverage || 0;
    if (altCoverage > 80) {
      feelings.push('Positive - Good accessibility creates inclusive experience');
    } else if (altCoverage >= 50) {
      feelings.push('Neutral - Moderate accessibility; some users may struggle');
    } else if (altCoverage < 50) {
      feelings.push('Frustrated - Poor accessibility excludes some users');
    }

    // Load time feelings via lookup table
    const loadTime = context.performance?.loadTime || 0;
    for (const [min, max, feeling] of ImpactAnalyzer.LOAD_TIME_FEELINGS) {
      if (loadTime >= min && loadTime <= max) {
        feelings.push(feeling);
        break;
      }
    }

    if (context.errorIndicators?.hasErrorMessages) {
      feelings.push('Confused - Visible errors reduce confidence');
    }

    // Semantic structure feelings
    this.analyzeStructureFeelings(context, feelings);

    return feelings;
  }

  private analyzeStructureFeelings(context: QXContext, feelings: string[]): void {
    const semanticStructure = context.domMetrics?.semanticStructure;
    if (!semanticStructure) return;

    const structureCount = [
      semanticStructure.hasHeader,
      semanticStructure.hasNav,
      semanticStructure.hasMain,
      semanticStructure.hasFooter,
    ].filter(Boolean).length;

    if (structureCount >= 3) {
      feelings.push('Oriented - Clear page structure helps navigation');
    } else if (structureCount < 2) {
      feelings.push('Disoriented - Unclear page structure may confuse users');
    }
  }

  private analyzePerformance(context: QXContext): string[] {
    const results: string[] = [];
    const loadTime = context.performance?.loadTime || 0;

    if (loadTime > 2000) {
      results.push(`Load time ${loadTime}ms impacts user retention`);
    }
    if (!context.metadata?.viewport) {
      results.push('Missing viewport tag affects mobile performance');
    }
    if (context.performance?.firstContentfulPaint && context.performance.firstContentfulPaint > 2500) {
      results.push(`First Contentful Paint ${context.performance.firstContentfulPaint}ms delays perceived readiness`);
    }
    return results;
  }

  private analyzeSecurity(context: QXContext): string[] {
    const results: string[] = [];
    const forms = context.domMetrics?.forms || 0;

    if (forms > 0) {
      results.push('Form data handling requires secure transmission');
    }
    if (context.accessibility && (context.accessibility.ariaLabelsCount || 0) > 0) {
      results.push('ARIA labels may expose internal element names - review for sensitive info');
    }
    return results;
  }

  private analyzeImmutableRequirements(context: QXContext, problemAnalysis: ProblemAnalysis): string[] {
    const requirements: string[] = [];

    if (context.domMetrics?.semanticStructure?.hasMain) {
      requirements.push('Must maintain main content accessibility');
    }
    if (context.accessibility && (context.accessibility.focusableElementsCount || 0) > 0) {
      requirements.push('Must support keyboard navigation');
    }
    if (problemAnalysis.complexity === 'complex') {
      requirements.push('Must maintain system stability with complex interactions');
    }

    // Domain-specific requirements via lookup table
    const titleLower = (context.title || '').toLowerCase();
    for (const [keywords, reqs] of ImpactAnalyzer.DOMAIN_REQUIREMENTS) {
      if (keywords.some((kw) => titleLower.includes(kw))) {
        requirements.push(...reqs);
      }
    }

    return requirements;
  }

  // ==========================================================================
  // Score Calculation
  // ==========================================================================

  private calculateVisibleScore(guiFlowEndUser: string[], userFeelings: string[]): number {
    let score = 50;
    if (guiFlowEndUser.length > 0) score += 15;

    for (const [keywords, delta] of ImpactAnalyzer.VISIBLE_SCORE_ADJUSTMENTS) {
      if (userFeelings.some((f) => keywords.some((kw) => f.includes(kw)))) {
        score += delta;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  private calculateInvisibleScore(performance: string[], security: string[]): number {
    let score = 50;
    if (performance.length === 0) score += 20;
    if (security.length === 0) score += 10;
    if (performance.length > 2) score -= 15;
    return Math.max(0, Math.min(100, score));
  }
}
