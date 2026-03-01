/**
 * Agentic QE v3 - QX Heuristics Engine
 *
 * Programmatic implementation of 23+ QX heuristics.
 * Ported from V2 QXPartnerAgent for consistent, high-quality analysis.
 *
 * QX Methodology by Lalitkumar Bhamare / Tales of Testing
 */

import {
  QXHeuristic,
  QXHeuristicResult,
  HeuristicCategory,
  QXContext,
  ProblemAnalysis,
  UserNeedsAnalysis,
  BusinessNeedsAnalysis,
} from './types';

// ============================================================================
// Heuristics Engine
// ============================================================================

export class QXHeuristicsEngine {
  private enabledHeuristics: QXHeuristic[];
  private minConfidence: number;

  constructor(options: { enabledHeuristics?: QXHeuristic[]; minConfidence?: number } = {}) {
    this.enabledHeuristics = options.enabledHeuristics || Object.values(QXHeuristic);
    this.minConfidence = options.minConfidence || 0.7;
  }

  /**
   * Apply all enabled heuristics
   */
  async applyAll(
    context: QXContext,
    problemAnalysis: ProblemAnalysis,
    userNeeds: UserNeedsAnalysis,
    businessNeeds: BusinessNeedsAnalysis
  ): Promise<QXHeuristicResult[]> {
    const results: QXHeuristicResult[] = [];

    for (const heuristic of this.enabledHeuristics) {
      const result = await this.apply(heuristic, context, problemAnalysis, userNeeds, businessNeeds);
      results.push(result);
    }

    return results;
  }

  /**
   * Apply a specific heuristic
   */
  async apply(
    heuristic: QXHeuristic,
    context: QXContext,
    problemAnalysis: ProblemAnalysis,
    userNeeds: UserNeedsAnalysis,
    businessNeeds: BusinessNeedsAnalysis
  ): Promise<QXHeuristicResult> {
    const category = this.getHeuristicCategory(heuristic);
    const findings: string[] = [];
    const issues: Array<{ description: string; severity: 'low' | 'medium' | 'high' | 'critical' }> = [];
    const recommendations: string[] = [];
    let score = 75; // Base score

    // Apply specific heuristic logic based on type
    switch (heuristic) {
      // ========== Design Quality Heuristics (H7.x) ==========
      case QXHeuristic.CONSISTENCY_ANALYSIS:
        if (context.domMetrics?.semanticStructure?.hasHeader && context.domMetrics?.semanticStructure?.hasFooter) {
          score = 85;
          findings.push('Consistent page structure with header and footer');
        } else {
          score = 60;
          recommendations.push('Add consistent header/footer structure');
        }
        break;

      case QXHeuristic.INTUITIVE_DESIGN:
        const hasNav = context.domMetrics?.semanticStructure?.hasNav;
        const focusable = context.accessibility?.focusableElementsCount || 0;
        if (hasNav && focusable > 10) {
          score = 82;
          findings.push('Intuitive navigation and interaction design');
        } else {
          score = 55;
          issues.push({ description: 'Navigation or interaction patterns unclear', severity: 'medium' });
        }
        break;

      case QXHeuristic.EXACTNESS_AND_CLARITY:
        score = 70;
        const hasSemanticStructure = context.domMetrics?.semanticStructure;
        const structureScore = [
          hasSemanticStructure?.hasHeader,
          hasSemanticStructure?.hasMain,
          hasSemanticStructure?.hasNav,
          hasSemanticStructure?.hasFooter,
        ].filter(Boolean).length;

        score = 50 + structureScore * 10;
        if (structureScore >= 3) {
          findings.push('Strong visual hierarchy with semantic HTML elements');
        } else if (structureScore >= 2) {
          findings.push('Moderate visual hierarchy - some semantic elements present');
          recommendations.push('Add more semantic HTML5 elements for clarity');
        } else {
          issues.push({ description: 'Weak visual hierarchy - missing semantic structure', severity: 'high' });
          recommendations.push('Implement semantic HTML5: header, nav, main, footer');
        }

        if (context.metadata?.description && context.metadata.description.length > 20) {
          score += 10;
          findings.push('Page has descriptive metadata');
        }
        break;

      case QXHeuristic.COUNTER_INTUITIVE_DESIGN:
        score = 85; // High score means few counter-intuitive elements (good)
        const confusingNav =
          !context.domMetrics?.semanticStructure?.hasNav && (context.domMetrics?.interactiveElements || 0) > 10;
        const poorStructure =
          !context.domMetrics?.semanticStructure?.hasHeader && !context.domMetrics?.semanticStructure?.hasFooter;

        if (confusingNav) {
          score = 45;
          issues.push({ description: 'Navigation structure may be counter-intuitive', severity: 'high' });
          recommendations.push('Add semantic navigation elements');
        }
        if (poorStructure) {
          score -= 15;
          issues.push({ description: 'Page structure lacks expected header/footer', severity: 'medium' });
        }
        if (score > 75) {
          findings.push('No counter-intuitive design patterns detected');
        }
        break;

      // ========== Impact Analysis Heuristics (H5.x) ==========
      case QXHeuristic.USER_FEELINGS_IMPACT:
        const altCoverage = context.accessibility?.altTextsCoverage || 0;
        const loadTime = context.performance?.loadTime || 0;
        const ariaLabels = context.accessibility?.ariaLabelsCount || 0;
        const focusableElements = context.accessibility?.focusableElementsCount || 0;

        score = 60;

        // Accessibility impact on feelings (35% weight)
        if (altCoverage >= 90) {
          score += 20;
          findings.push('Excellent accessibility (90%+ alt coverage) creates inclusive, positive experience');
        } else if (altCoverage >= 70) {
          score += 12;
          findings.push('Good accessibility creates generally positive user feelings');
        } else if (altCoverage < 50) {
          score -= 15;
          issues.push({
            description: 'Poor accessibility (<50% alt coverage) frustrates users with disabilities',
            severity: 'high',
          });
          recommendations.push('Improve alt text coverage to at least 80% for better accessibility');
        }

        // ARIA support impact
        if (ariaLabels > 5) {
          score += 8;
          findings.push('Strong ARIA labeling enhances screen reader experience');
        }

        // Performance impact on feelings (35% weight)
        if (loadTime < 1500) {
          score += 15;
          findings.push('Very fast load time (<1.5s) delights users');
        } else if (loadTime < 2500) {
          score += 8;
          findings.push('Fast load time enhances user satisfaction');
        } else if (loadTime > 4000) {
          score -= 20;
          issues.push({ description: 'Very slow load time (>4s) causes significant frustration', severity: 'critical' });
          recommendations.push('Optimize page load time - target under 2.5 seconds');
        } else if (loadTime > 3000) {
          score -= 12;
          issues.push({ description: 'Slow load time causes user frustration', severity: 'high' });
        }

        // Error visibility impact
        if (context.errorIndicators?.hasErrorMessages) {
          score -= 12;
          issues.push({ description: 'Visible errors reduce user confidence and satisfaction', severity: 'high' });
          recommendations.push('Review and fix visible error messages');
        }

        // Interaction capability
        if (focusableElements > 20) {
          score += 5;
          findings.push('Rich interactive elements provide user control and engagement');
        } else if (focusableElements < 5) {
          score -= 8;
          issues.push({ description: 'Limited interactivity may feel restrictive', severity: 'medium' });
        }

        score = Math.max(20, Math.min(100, score));
        break;

      case QXHeuristic.GUI_FLOW_IMPACT:
        const interactiveElements = context.domMetrics?.interactiveElements || 0;
        const forms = context.domMetrics?.forms || 0;

        if (interactiveElements > 20) {
          score = 75;
          findings.push(`${interactiveElements} interactive elements provide user control`);
        }
        if (forms > 0) {
          findings.push(`${forms} forms impact user input flows`);
          score = Math.min(100, score + 10);
        }
        if (interactiveElements === 0) {
          score = 30;
          issues.push({ description: 'Limited user interaction capability', severity: 'high' });
        }
        break;

      case QXHeuristic.CROSS_FUNCTIONAL_IMPACT:
        score = 70;
        if (context.accessibility && (context.accessibility.altTextsCoverage || 0) < 100) {
          findings.push('Content team needed for alt text creation');
        }
        if (context.performance && (context.performance.loadTime || 0) > 2000) {
          findings.push('Engineering team needed for performance optimization');
        }
        if (problemAnalysis.complexity === 'complex') {
          findings.push('QA team needed for comprehensive testing');
        }
        score = 70 + findings.length * 5;
        break;

      case QXHeuristic.DATA_DEPENDENT_IMPACT:
        if (context.domMetrics?.forms && context.domMetrics.forms > 0) {
          score = 75;
          findings.push(`${context.domMetrics.forms} forms depend on backend data processing`);
        } else {
          score = 50;
          findings.push('Limited data-dependent features');
        }
        break;

      // ========== Problem Analysis Heuristics (H1.x) ==========
      case QXHeuristic.PROBLEM_UNDERSTANDING:
        score = problemAnalysis.clarityScore;
        if (problemAnalysis.clarityScore > 80) {
          findings.push('Problem is well-defined');
        } else {
          issues.push({ description: 'Problem clarity needs improvement', severity: 'medium' });
        }
        findings.push(...problemAnalysis.breakdown);
        break;

      case QXHeuristic.RULE_OF_THREE:
        score = problemAnalysis.potentialFailures.length >= 3 ? 85 : 60;
        findings.push(`${problemAnalysis.potentialFailures.length} potential failure modes identified`);
        if (problemAnalysis.potentialFailures.length < 3) {
          recommendations.push('Identify at least 3 potential failure modes (Rule of Three)');
        }
        break;

      case QXHeuristic.PROBLEM_COMPLEXITY:
        score = problemAnalysis.complexity === 'simple' ? 90 : problemAnalysis.complexity === 'moderate' ? 75 : 60;
        findings.push(`Problem complexity: ${problemAnalysis.complexity}`);
        break;

      // ========== User Needs Heuristics (H2.x) ==========
      case QXHeuristic.USER_NEEDS_IDENTIFICATION:
        score = userNeeds.alignmentScore;
        findings.push(`${userNeeds.needs.length} user needs identified`);
        const mustHave = userNeeds.needs.filter((n) => n.priority === 'must-have').length;
        findings.push(`${mustHave} must-have features`);
        if (userNeeds.challenges.length > 0) {
          issues.push({ description: `${userNeeds.challenges.length} user need challenges found`, severity: 'medium' });
        }
        break;

      case QXHeuristic.USER_NEEDS_SUITABILITY:
        score =
          userNeeds.suitability === 'excellent'
            ? 95
            : userNeeds.suitability === 'good'
            ? 80
            : userNeeds.suitability === 'adequate'
            ? 65
            : 45;
        findings.push(`User needs suitability: ${userNeeds.suitability}`);
        break;

      case QXHeuristic.USER_NEEDS_VALIDATION:
        const addressedNeeds = userNeeds.needs.filter((n) => n.addressed).length;
        score = userNeeds.needs.length > 0 ? (addressedNeeds / userNeeds.needs.length) * 100 : 50;
        findings.push(`${addressedNeeds}/${userNeeds.needs.length} needs validated and addressed`);
        break;

      // ========== Business Needs Heuristics (H3.x) ==========
      case QXHeuristic.BUSINESS_NEEDS_IDENTIFICATION:
        score = businessNeeds.alignmentScore;
        findings.push(`Primary goal: ${businessNeeds.primaryGoal}`);
        findings.push(`${businessNeeds.kpisAffected.length} KPIs affected`);
        findings.push(`${businessNeeds.crossTeamImpact.length} cross-team impacts`);
        break;

      case QXHeuristic.USER_VS_BUSINESS_BALANCE:
        const balanceScore = 100 - Math.abs(userNeeds.alignmentScore - businessNeeds.alignmentScore);
        score = balanceScore;
        if (balanceScore > 80) {
          findings.push('Good balance between user and business needs');
        } else {
          issues.push({ description: 'Imbalance between user and business priorities', severity: 'medium' });
          recommendations.push('Align user and business objectives more closely');
        }
        break;

      case QXHeuristic.KPI_IMPACT_ANALYSIS:
        score = businessNeeds.impactsKPIs ? 85 : 50;
        findings.push(`KPIs impacted: ${businessNeeds.kpisAffected.join(', ')}`);
        if (businessNeeds.compromisesUX) {
          issues.push({ description: 'Business ease compromises user experience', severity: 'high' });
          score -= 20;
        }
        break;

      // ========== Balance / Oracle Heuristics (H4.x) ==========
      case QXHeuristic.ORACLE_PROBLEM_DETECTION:
        score = 75;
        findings.push('Oracle problem detection capability active');
        break;

      case QXHeuristic.WHAT_MUST_NOT_CHANGE:
        score = 80;
        if (context.domMetrics?.semanticStructure?.hasMain) {
          findings.push('Main content structure is immutable');
        }
        if (context.accessibility && (context.accessibility.focusableElementsCount || 0) > 0) {
          findings.push('Keyboard navigation support must be maintained');
        }
        break;

      case QXHeuristic.SUPPORTING_DATA_ANALYSIS:
        score = 75;
        const hasData =
          (context.domMetrics?.forms || 0) > 0 || (context.domMetrics?.interactiveElements || 0) > 20;
        if (hasData) {
          score = 82;
          findings.push('Sufficient data points for informed decision-making');
        } else {
          score = 60;
          issues.push({ description: 'Limited data for comprehensive analysis', severity: 'medium' });
          recommendations.push('Collect more user interaction data');
        }
        break;

      // ========== Creativity Heuristics (H6.x) ==========
      case QXHeuristic.COMPETITIVE_ANALYSIS:
        score = 70;
        findings.push('Competitive analysis capability available');
        if (
          context.domMetrics?.semanticStructure?.hasNav &&
          context.domMetrics?.interactiveElements &&
          context.domMetrics.interactiveElements > 15
        ) {
          score = 78;
          findings.push('Navigation and interaction patterns follow industry standards');
        } else {
          recommendations.push('Compare interaction patterns with leading competitors');
        }
        break;

      case QXHeuristic.DOMAIN_INSPIRATION:
        score = 72;
        const hasModernElements = context.accessibility && (context.accessibility.ariaLabelsCount || 0) > 0;
        if (hasModernElements) {
          score = 80;
          findings.push('Modern accessibility patterns show domain inspiration');
        } else {
          recommendations.push('Research domain-specific design patterns and best practices');
        }
        break;

      case QXHeuristic.INNOVATIVE_SOLUTIONS:
        score = 65;
        const hasAdvancedFeatures = (context.accessibility?.landmarkRoles || 0) > 3;
        if (hasAdvancedFeatures) {
          score = 75;
          findings.push('Advanced accessibility features show innovative thinking');
        } else {
          recommendations.push('Explore innovative UX patterns to differentiate experience');
        }
        break;

      default:
        // Generic heuristic evaluation based on category
        if (category === 'user-needs') {
          score = userNeeds.alignmentScore;
        } else if (category === 'business-needs') {
          score = businessNeeds.alignmentScore;
        } else if (category === 'problem') {
          score = problemAnalysis.clarityScore;
        }
        break;
    }

    return {
      id: heuristic,
      name: this.getHeuristicName(heuristic),
      category,
      applied: true,
      score: Math.min(100, Math.max(0, score)),
      findings,
      issues,
      recommendations,
    };
  }

  /**
   * Get the category for a heuristic
   */
  private getHeuristicCategory(heuristic: QXHeuristic): HeuristicCategory {
    if (heuristic.includes('problem')) return 'problem';
    if (heuristic.includes('user-needs') || heuristic.includes('user-vs')) return 'user-needs';
    if (heuristic.includes('business')) return 'business-needs';
    if (heuristic.includes('oracle') || heuristic.includes('balance') || heuristic.includes('what-must') || heuristic.includes('supporting-data'))
      return 'balance';
    if (heuristic.includes('impact') || heuristic.includes('gui-flow') || heuristic.includes('feelings') || heuristic.includes('cross-functional') || heuristic.includes('data-dependent'))
      return 'impact';
    if (heuristic.includes('competitive') || heuristic.includes('inspiration') || heuristic.includes('innovative'))
      return 'creativity';
    return 'design';
  }

  /**
   * Get human-readable name for a heuristic
   */
  private getHeuristicName(heuristic: QXHeuristic): string {
    const names: Record<QXHeuristic, string> = {
      [QXHeuristic.PROBLEM_UNDERSTANDING]: 'Problem Understanding',
      [QXHeuristic.RULE_OF_THREE]: 'Rule of Three',
      [QXHeuristic.PROBLEM_COMPLEXITY]: 'Problem Complexity',
      [QXHeuristic.USER_NEEDS_IDENTIFICATION]: 'User Needs Identification',
      [QXHeuristic.USER_NEEDS_SUITABILITY]: 'User Needs Suitability',
      [QXHeuristic.USER_NEEDS_VALIDATION]: 'User Needs Validation',
      [QXHeuristic.BUSINESS_NEEDS_IDENTIFICATION]: 'Business Needs Identification',
      [QXHeuristic.USER_VS_BUSINESS_BALANCE]: 'User vs Business Balance',
      [QXHeuristic.KPI_IMPACT_ANALYSIS]: 'KPI Impact Analysis',
      [QXHeuristic.ORACLE_PROBLEM_DETECTION]: 'Oracle Problem Detection',
      [QXHeuristic.WHAT_MUST_NOT_CHANGE]: 'What Must Not Change',
      [QXHeuristic.SUPPORTING_DATA_ANALYSIS]: 'Supporting Data Analysis',
      [QXHeuristic.GUI_FLOW_IMPACT]: 'GUI Flow Impact',
      [QXHeuristic.USER_FEELINGS_IMPACT]: 'User Feelings Impact',
      [QXHeuristic.CROSS_FUNCTIONAL_IMPACT]: 'Cross-Functional Impact',
      [QXHeuristic.DATA_DEPENDENT_IMPACT]: 'Data-Dependent Impact',
      [QXHeuristic.COMPETITIVE_ANALYSIS]: 'Competitive Analysis',
      [QXHeuristic.DOMAIN_INSPIRATION]: 'Domain Inspiration',
      [QXHeuristic.INNOVATIVE_SOLUTIONS]: 'Innovative Solutions',
      [QXHeuristic.EXACTNESS_AND_CLARITY]: 'Exactness & Clarity',
      [QXHeuristic.INTUITIVE_DESIGN]: 'Intuitive Design',
      [QXHeuristic.COUNTER_INTUITIVE_DESIGN]: 'Counter-Intuitive Design',
      [QXHeuristic.CONSISTENCY_ANALYSIS]: 'Consistency Analysis',
    };
    return names[heuristic] || heuristic;
  }
}

/**
 * Get all heuristics organized by category
 */
export function getHeuristicsByCategory(): Record<HeuristicCategory, QXHeuristic[]> {
  return {
    problem: [QXHeuristic.PROBLEM_UNDERSTANDING, QXHeuristic.RULE_OF_THREE, QXHeuristic.PROBLEM_COMPLEXITY],
    'user-needs': [
      QXHeuristic.USER_NEEDS_IDENTIFICATION,
      QXHeuristic.USER_NEEDS_SUITABILITY,
      QXHeuristic.USER_NEEDS_VALIDATION,
    ],
    'business-needs': [
      QXHeuristic.BUSINESS_NEEDS_IDENTIFICATION,
      QXHeuristic.USER_VS_BUSINESS_BALANCE,
      QXHeuristic.KPI_IMPACT_ANALYSIS,
    ],
    balance: [
      QXHeuristic.ORACLE_PROBLEM_DETECTION,
      QXHeuristic.WHAT_MUST_NOT_CHANGE,
      QXHeuristic.SUPPORTING_DATA_ANALYSIS,
    ],
    impact: [
      QXHeuristic.GUI_FLOW_IMPACT,
      QXHeuristic.USER_FEELINGS_IMPACT,
      QXHeuristic.CROSS_FUNCTIONAL_IMPACT,
      QXHeuristic.DATA_DEPENDENT_IMPACT,
    ],
    creativity: [QXHeuristic.COMPETITIVE_ANALYSIS, QXHeuristic.DOMAIN_INSPIRATION, QXHeuristic.INNOVATIVE_SOLUTIONS],
    design: [
      QXHeuristic.EXACTNESS_AND_CLARITY,
      QXHeuristic.INTUITIVE_DESIGN,
      QXHeuristic.COUNTER_INTUITIVE_DESIGN,
      QXHeuristic.CONSISTENCY_ANALYSIS,
    ],
  };
}
