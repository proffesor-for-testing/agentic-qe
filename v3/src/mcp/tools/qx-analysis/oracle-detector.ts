/**
 * Agentic QE v3 - Oracle Problem Detector
 *
 * Detects situations where testers cannot determine quality criteria.
 * Identifies user vs business conflicts, missing information, and stakeholder conflicts.
 *
 * QX Methodology by Lalitkumar Bhamare / Tales of Testing
 */

import {
  QXContext,
  UserNeedsAnalysis,
  BusinessNeedsAnalysis,
  OracleProblem,
} from './types';

// ============================================================================
// Oracle Detector
// ============================================================================

export class OracleDetector {
  private minSeverity: 'low' | 'medium' | 'high' | 'critical';

  constructor(minSeverity: 'low' | 'medium' | 'high' | 'critical' = 'medium') {
    this.minSeverity = minSeverity;
  }

  /**
   * Detect oracle problems from context and analysis
   */
  detect(
    context: QXContext,
    userNeeds: UserNeedsAnalysis,
    businessNeeds: BusinessNeedsAnalysis
  ): OracleProblem[] {
    const problems: OracleProblem[] = [];

    // Check for user vs business conflicts
    if (Math.abs(userNeeds.alignmentScore - businessNeeds.alignmentScore) > 20) {
      problems.push({
        type: 'user-vs-business',
        description: 'Significant gap between user needs and business objectives',
        severity: 'high',
        stakeholders: ['Users', 'Business'],
        resolutionApproach: [
          'Gather supporting data from both perspectives',
          'Facilitate discussion between stakeholders',
          'Find compromise solutions that address both needs',
        ],
      });
    }

    // Check for missing information
    if (userNeeds.challenges.length > 0 || businessNeeds.compromisesUX) {
      problems.push({
        type: 'unclear-criteria',
        description: 'Quality criteria unclear due to conflicting information',
        severity: 'medium',
        missingInfo: userNeeds.challenges,
        resolutionApproach: [
          'Collect missing information from stakeholders',
          'Define clear acceptance criteria',
        ],
      });
    }

    // DOMAIN-SPECIFIC Oracle Problems
    const titleLower = (context.title || '').toLowerCase();
    const descLower = (context.metadata?.description || '').toLowerCase();

    // E-commerce/Travel/Booking: Conversion vs UX quality
    if (
      titleLower.includes('hotel') ||
      titleLower.includes('booking') ||
      titleLower.includes('travel') ||
      titleLower.includes('shop') ||
      titleLower.includes('store') ||
      descLower.includes('book')
    ) {
      if (
        businessNeeds.kpisAffected.some(
          (k) => k.toLowerCase().includes('conversion') || k.toLowerCase().includes('engagement')
        )
      ) {
        problems.push({
          type: 'user-vs-business',
          description:
            'Potential conflict between conversion optimization (business) and user experience quality (user trust)',
          severity: 'medium',
          stakeholders: ['Marketing', 'Product', 'Users'],
          resolutionApproach: [
            'A/B test aggressive vs. subtle conversion tactics',
            'Measure both conversion rate and user satisfaction metrics',
            'Balance urgency messaging with transparent communication',
          ],
        });
      }

      // Price transparency oracle
      problems.push({
        type: 'unclear-criteria',
        description: 'Unclear criteria for price display timing - when to show fees, taxes, and final price',
        severity: 'medium',
        stakeholders: ['Users', 'Legal', 'Business'],
        resolutionApproach: [
          'Define regulatory compliance requirements for price display',
          'Balance business desire for competitive base pricing vs user need for full price transparency',
          'Establish clear standards for fee disclosure timing',
        ],
      });
    }

    // Content sites: Quality vs. Quantity
    if (
      titleLower.includes('blog') ||
      titleLower.includes('article') ||
      titleLower.includes('news') ||
      titleLower.includes('magazine') ||
      titleLower.includes('testing')
    ) {
      problems.push({
        type: 'user-vs-business',
        description:
          'Content depth (user need) vs. publication frequency (business engagement goals) trade-off',
        severity: 'low',
        stakeholders: ['Readers', 'Content Team', 'Editorial'],
        resolutionApproach: [
          'Define content quality standards and acceptance criteria',
          'Balance editorial calendar with quality thresholds',
          'Consider mix of in-depth and quick-read content formats',
        ],
      });
    }

    // Healthcare: Compliance vs UX
    if (
      titleLower.includes('health') ||
      titleLower.includes('medical') ||
      titleLower.includes('patient') ||
      titleLower.includes('care') ||
      titleLower.includes('nhs')
    ) {
      problems.push({
        type: 'stakeholder-conflict',
        description:
          'Healthcare compliance requirements may conflict with streamlined user experience',
        severity: 'medium',
        stakeholders: ['Patients', 'Healthcare Providers', 'Compliance', 'Legal'],
        resolutionApproach: [
          'Map regulatory requirements to UX touchpoints',
          'Identify where compliance can be achieved without friction',
          'Engage compliance team early in UX design reviews',
          'Document consent and data handling requirements clearly',
        ],
      });

      // Accessibility in healthcare is critical
      if (context.accessibility && (context.accessibility.altTextsCoverage || 0) < 80) {
        problems.push({
          type: 'technical-constraint',
          description:
            'Healthcare accessibility requirements not fully met - critical for patient inclusivity',
          severity: 'high',
          stakeholders: ['Patients', 'Accessibility Team', 'Legal'],
          resolutionApproach: [
            'Prioritize WCAG 2.1 AA compliance for healthcare content',
            'Ensure screen reader compatibility for medical information',
            'Test with assistive technology users',
          ],
        });
      }
    }

    // Finance: Security vs Convenience
    if (
      titleLower.includes('bank') ||
      titleLower.includes('finance') ||
      titleLower.includes('payment') ||
      titleLower.includes('money')
    ) {
      problems.push({
        type: 'stakeholder-conflict',
        description: 'Security requirements vs user convenience - authentication friction vs fraud prevention',
        severity: 'high',
        stakeholders: ['Users', 'Security Team', 'Product', 'Compliance'],
        resolutionApproach: [
          'Implement risk-based authentication to reduce friction for trusted sessions',
          'Use biometrics where available for convenient yet secure access',
          'A/B test authentication flows for security effectiveness and user completion rates',
        ],
      });
    }

    // Complex sites: Technical constraints
    if (
      (context.domMetrics?.totalElements || 0) > 500 ||
      (context.domMetrics?.interactiveElements || 0) > 50
    ) {
      problems.push({
        type: 'technical-constraint',
        description:
          'Platform technical limitations may restrict advanced UX features or accessibility enhancements',
        severity: 'low',
        stakeholders: ['Development', 'Product', 'Users'],
        resolutionApproach: [
          'Evaluate platform capabilities and constraints',
          'Prioritize features based on user impact vs. implementation complexity',
          'Consider gradual enhancement approach',
        ],
      });
    }

    // Performance oracle
    if (context.performance && (context.performance.loadTime || 0) > 3000) {
      problems.push({
        type: 'technical-constraint',
        description: 'Performance optimization needed but may require trade-offs with visual richness',
        severity: 'medium',
        stakeholders: ['Users', 'Development', 'Design'],
        resolutionApproach: [
          'Profile and identify performance bottlenecks',
          'Consider progressive loading for visual elements',
          'Balance image quality with load time',
        ],
      });
    }

    return problems.filter((p) => this.meetsMinimumSeverity(p.severity));
  }

  /**
   * Check if severity meets minimum threshold
   */
  private meetsMinimumSeverity(severity: string): boolean {
    const severityLevels = ['low', 'medium', 'high', 'critical'];
    const minIndex = severityLevels.indexOf(this.minSeverity);
    const currentIndex = severityLevels.indexOf(severity);
    return currentIndex >= minIndex;
  }
}
