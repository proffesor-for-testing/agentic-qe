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
  /**
   * Analyze impacts from context and problem analysis
   */
  analyze(context: QXContext, problemAnalysis: ProblemAnalysis): ImpactAnalysis {
    const guiFlowEndUser: string[] = [];
    const guiFlowInternal: string[] = [];
    const userFeelings: string[] = [];
    const performance: string[] = [];
    const security: string[] = [];
    const immutableRequirements: string[] = [];

    // Analyze visible impacts
    const interactiveElements = context.domMetrics?.interactiveElements || 0;
    const forms = context.domMetrics?.forms || 0;

    if (interactiveElements > 0) {
      guiFlowEndUser.push(`${interactiveElements} interactive elements affect user journey`);
    }
    if (forms > 0) {
      guiFlowEndUser.push(`${forms} forms impact user input flows`);
    }

    // Check for navigation impact
    if (context.domMetrics?.semanticStructure?.hasNav) {
      guiFlowEndUser.push('Navigation structure enables exploration flow');
    }

    // Check for content structure impact
    if (context.domMetrics?.semanticStructure?.hasMain) {
      guiFlowEndUser.push('Clear main content area guides user focus');
    }

    // Internal user impacts
    if (forms > 0) {
      guiFlowInternal.push('Form submissions create data processing workflows');
    }
    if (context.domMetrics?.semanticStructure?.hasAside) {
      guiFlowInternal.push('Sidebar content may require separate management');
    }

    // User feelings based on quality metrics
    const altCoverage = context.accessibility?.altTextsCoverage || 0;
    if (altCoverage > 80) {
      userFeelings.push('Positive - Good accessibility creates inclusive experience');
    } else if (altCoverage >= 50 && altCoverage <= 80) {
      userFeelings.push('Neutral - Moderate accessibility; some users may struggle');
    } else if (altCoverage < 50) {
      userFeelings.push('Frustrated - Poor accessibility excludes some users');
    }

    const loadTime = context.performance?.loadTime || 0;
    if (loadTime > 4000) {
      userFeelings.push('Impatient - Very slow load time causes significant frustration');
    } else if (loadTime > 3000) {
      userFeelings.push('Impatient - Slow load time causes frustration');
    } else if (loadTime > 2000) {
      userFeelings.push('Mildly Annoyed - Noticeable load time');
    } else if (loadTime < 1500) {
      userFeelings.push('Delighted - Fast load time enhances experience');
    } else if (loadTime < 2000) {
      userFeelings.push('Satisfied - Good load time meets expectations');
    }

    if (context.errorIndicators?.hasErrorMessages) {
      userFeelings.push('Confused - Visible errors reduce confidence');
    }

    // Check for visual hierarchy impact on feelings
    const semanticStructure = context.domMetrics?.semanticStructure;
    if (semanticStructure) {
      const structureCount = [
        semanticStructure.hasHeader,
        semanticStructure.hasNav,
        semanticStructure.hasMain,
        semanticStructure.hasFooter,
      ].filter(Boolean).length;

      if (structureCount >= 3) {
        userFeelings.push('Oriented - Clear page structure helps navigation');
      } else if (structureCount < 2) {
        userFeelings.push('Disoriented - Unclear page structure may confuse users');
      }
    }

    // Analyze invisible impacts
    if (loadTime > 2000) {
      performance.push(`Load time ${loadTime}ms impacts user retention`);
    }
    if (!context.metadata?.viewport) {
      performance.push('Missing viewport tag affects mobile performance');
    }

    // First Contentful Paint impact
    if (context.performance?.firstContentfulPaint && context.performance.firstContentfulPaint > 2500) {
      performance.push(`First Contentful Paint ${context.performance.firstContentfulPaint}ms delays perceived readiness`);
    }

    // Security considerations based on forms
    if (forms > 0) {
      security.push('Form data handling requires secure transmission');
    }

    // Accessibility-related security/privacy
    if (context.accessibility && (context.accessibility.ariaLabelsCount || 0) > 0) {
      security.push('ARIA labels may expose internal element names - review for sensitive info');
    }

    // Immutable requirements
    if (context.domMetrics?.semanticStructure?.hasMain) {
      immutableRequirements.push('Must maintain main content accessibility');
    }
    if (context.accessibility && (context.accessibility.focusableElementsCount || 0) > 0) {
      immutableRequirements.push('Must support keyboard navigation');
    }
    if (problemAnalysis.complexity === 'complex') {
      immutableRequirements.push('Must maintain system stability with complex interactions');
    }

    // Domain-specific immutable requirements
    const titleLower = (context.title || '').toLowerCase();
    if (
      titleLower.includes('health') ||
      titleLower.includes('medical') ||
      titleLower.includes('care')
    ) {
      immutableRequirements.push('Must comply with healthcare accessibility standards');
      immutableRequirements.push('Must protect patient data privacy');
    }
    if (titleLower.includes('bank') || titleLower.includes('finance') || titleLower.includes('payment')) {
      immutableRequirements.push('Must maintain PCI DSS compliance for payment data');
      immutableRequirements.push('Must support secure authentication flows');
    }

    // Calculate impact scores
    let visibleScore = 50;
    if (guiFlowEndUser.length > 0) visibleScore += 15;
    if (userFeelings.some((f) => f.includes('Positive') || f.includes('Satisfied') || f.includes('Delighted')))
      visibleScore += 20;
    if (userFeelings.some((f) => f.includes('Oriented'))) visibleScore += 10;
    if (userFeelings.some((f) => f.includes('Frustrated') || f.includes('Confused') || f.includes('Impatient')))
      visibleScore -= 15;
    if (userFeelings.some((f) => f.includes('Disoriented'))) visibleScore -= 10;
    visibleScore = Math.max(0, Math.min(100, visibleScore));

    let invisibleScore = 50;
    if (performance.length === 0) invisibleScore += 20;
    if (security.length === 0) invisibleScore += 10;
    if (performance.length > 2) invisibleScore -= 15;
    invisibleScore = Math.max(0, Math.min(100, invisibleScore));

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
}
