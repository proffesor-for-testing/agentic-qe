/**
 * Agentic QE v3 - QX Analysis MCP Tool
 *
 * qe/qx/analyze - Comprehensive Quality Experience analysis
 *
 * Combines heuristics engine, oracle detector, and impact analyzer
 * for programmatic QX analysis matching V2 quality.
 *
 * QX Methodology by Lalitkumar Bhamare / Tales of Testing
 */

import { MCPToolBase, MCPToolConfig, MCPToolContext, MCPToolSchema } from '../base';
import { ToolResult } from '../../types';
import { QXHeuristicsEngine } from './heuristics-engine';
import { OracleDetector } from './oracle-detector';
import { ImpactAnalyzer } from './impact-analyzer';
import { toErrorMessage } from '../../../shared/error-utils.js';
import {
  QXAnalyzeParams,
  QXAnalysisResult,
  QXContext,
  QXHeuristic,
  ProblemAnalysis,
  UserNeedsAnalysis,
  BusinessNeedsAnalysis,
  CreativityAnalysis,
  DesignAnalysis,
  QXRecommendation,
} from './types';

// ============================================================================
// Schema
// ============================================================================

const QX_ANALYZE_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    target: {
      type: 'string',
      description: 'Target URL or identifier to analyze',
    },
    context: {
      type: 'object',
      description: 'Pre-collected QX context (optional)',
    },
    mode: {
      type: 'string',
      description: 'Analysis mode: full, quick, or targeted',
      enum: ['full', 'quick', 'targeted'],
      default: 'full',
    },
    heuristics: {
      type: 'array',
      description: 'Specific heuristics to apply (default: all)',
    },
    minOracleSeverity: {
      type: 'string',
      description: 'Minimum oracle problem severity to report',
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    includeCreativity: {
      type: 'boolean',
      description: 'Include creativity analysis from diverse domains',
      default: true,
    },
    includeDesign: {
      type: 'boolean',
      description: 'Include design quality analysis',
      default: true,
    },
  },
  required: ['target'],
};

// ============================================================================
// Tool Implementation
// ============================================================================

export class QXAnalyzeTool extends MCPToolBase<QXAnalyzeParams, QXAnalysisResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/qx/analyze',
    description:
      'Comprehensive Quality Experience (QX) analysis combining QA and UX perspectives. ' +
      'Applies 23+ programmatic heuristics, detects oracle problems, and analyzes impacts. ' +
      'QX = Marriage between QA (Quality Advocacy) and UX (User Experience).',
    domain: 'quality-assessment',
    schema: QX_ANALYZE_SCHEMA,
    streaming: true,
    timeout: 180000,
  };

  async execute(
    params: QXAnalyzeParams,
    context: MCPToolContext
  ): Promise<ToolResult<QXAnalysisResult>> {
    const {
      target,
      context: qxContext = this.createMinimalContext(target),
      mode = 'full',
      heuristics,
      minOracleSeverity = 'medium',
      includeCreativity = true,
      includeDesign = true,
    } = params;

    try {
      this.emitStream(context, {
        status: 'starting',
        message: `Starting QX analysis for: ${target}`,
        phase: 'initialization',
      });

      // 1. Analyze problem
      this.emitStream(context, { status: 'analyzing', phase: 'problem-analysis' });
      const problemAnalysis = this.analyzeProblem(qxContext);

      if (this.isAborted(context)) {
        return { success: false, error: 'Operation aborted' };
      }

      // 2. Analyze user needs
      this.emitStream(context, { status: 'analyzing', phase: 'user-needs' });
      const userNeeds = this.analyzeUserNeeds(qxContext, problemAnalysis);

      // 3. Analyze business needs
      this.emitStream(context, { status: 'analyzing', phase: 'business-needs' });
      const businessNeeds = this.analyzeBusinessNeeds(qxContext, problemAnalysis);

      // 4. Analyze creativity (optional)
      this.emitStream(context, { status: 'analyzing', phase: 'creativity' });
      const creativityAnalysis = includeCreativity
        ? this.analyzeCreativity(qxContext, problemAnalysis)
        : this.createMinimalCreativityAnalysis();

      // 5. Analyze design (optional)
      this.emitStream(context, { status: 'analyzing', phase: 'design' });
      const designAnalysis = includeDesign
        ? this.analyzeDesign(qxContext)
        : this.createMinimalDesignAnalysis();

      // 6. Detect oracle problems
      this.emitStream(context, { status: 'analyzing', phase: 'oracle-detection' });
      const oracleDetector = new OracleDetector(minOracleSeverity);
      const oracleProblems = oracleDetector.detect(qxContext, userNeeds, businessNeeds);

      // 7. Analyze impacts
      this.emitStream(context, { status: 'analyzing', phase: 'impact-analysis' });
      const impactAnalyzer = new ImpactAnalyzer();
      const impactAnalysis = impactAnalyzer.analyze(qxContext, problemAnalysis);

      // 8. Apply heuristics
      this.emitStream(context, { status: 'analyzing', phase: 'heuristics', count: 23 });
      const heuristicsEngine = new QXHeuristicsEngine({
        enabledHeuristics: heuristics || Object.values(QXHeuristic),
      });
      const heuristicResults = await heuristicsEngine.applyAll(
        qxContext,
        problemAnalysis,
        userNeeds,
        businessNeeds
      );

      // 9. Generate recommendations
      this.emitStream(context, { status: 'analyzing', phase: 'recommendations' });
      const recommendations = this.generateRecommendations(
        problemAnalysis,
        userNeeds,
        businessNeeds,
        oracleProblems,
        impactAnalysis,
        heuristicResults
      );

      // 10. Calculate overall score
      const overallScore = this.calculateOverallScore(
        problemAnalysis,
        userNeeds,
        businessNeeds,
        creativityAnalysis,
        designAnalysis,
        impactAnalysis,
        heuristicResults
      );
      const grade = this.scoreToGrade(overallScore);

      const result: QXAnalysisResult = {
        overallScore,
        grade,
        timestamp: new Date().toISOString(),
        target,
        problemAnalysis,
        userNeeds,
        businessNeeds,
        creativityAnalysis,
        designAnalysis,
        oracleProblems,
        impactAnalysis,
        heuristics: heuristicResults,
        recommendations,
        context: qxContext,
      };

      this.emitStream(context, {
        status: 'complete',
        score: overallScore,
        grade,
        heuristicsApplied: heuristicResults.length,
        oracleProblemsFound: oracleProblems.length,
      });

      return {
        success: true,
        data: result,
        metadata: this.createMetadata(context.startTime, context.requestId),
      };
    } catch (error) {
      return {
        success: false,
        error: `QX analysis failed: ${toErrorMessage(error)}`,
      };
    }
  }

  // ============================================================================
  // Analysis Methods (Ported from V2)
  // ============================================================================

  private analyzeProblem(context: QXContext): ProblemAnalysis {
    const title = context.title || 'Untitled page';
    const description = context.metadata?.description || '';
    const hasError = context.errorIndicators?.hasErrorMessages || false;

    let problemStatement = `Evaluate quality experience of "${title}"`;
    if (description) {
      problemStatement += ` - ${description.substring(0, 100)}`;
    }

    const totalElements = context.domMetrics?.totalElements || 0;
    const interactiveElements = context.domMetrics?.interactiveElements || 0;
    const forms = context.domMetrics?.forms || 0;

    let complexity: 'simple' | 'moderate' | 'complex';
    if (totalElements > 500 || interactiveElements > 50 || forms > 3) {
      complexity = 'complex';
    } else if (totalElements > 200 || interactiveElements > 20 || forms > 1) {
      complexity = 'moderate';
    } else {
      complexity = 'simple';
    }

    const breakdown: string[] = [];
    if (context.domMetrics?.semanticStructure?.hasNav) breakdown.push('Navigation structure');
    if (forms > 0) breakdown.push(`Form interactions (${forms} forms)`);
    if (interactiveElements > 0) breakdown.push(`User interactions (${interactiveElements} elements)`);
    if (context.accessibility) breakdown.push('Accessibility compliance');
    if (context.performance) breakdown.push('Performance metrics');

    const potentialFailures: ProblemAnalysis['potentialFailures'] = [];

    // Domain-specific failure modes
    const titleLower = title.toLowerCase();
    if (titleLower.includes('health') || titleLower.includes('care') || titleLower.includes('nhs')) {
      potentialFailures.push({
        description: 'Healthcare information may not be accessible to users with visual impairments',
        severity: 'high',
        likelihood: 'likely',
      });
      potentialFailures.push({
        description: 'Patient journey complexity may cause confusion during registration or booking',
        severity: 'medium',
        likelihood: 'possible',
      });
      potentialFailures.push({
        description: 'Emergency contact information may not be prominently visible',
        severity: 'high',
        likelihood: 'possible',
      });
    }

    // Generic failure modes based on context
    if (!context.domMetrics?.semanticStructure?.hasMain) {
      potentialFailures.push({
        description: 'Missing main content landmark - users may struggle to find primary content',
        severity: 'medium',
        likelihood: 'likely',
      });
    }
    if (context.accessibility && (context.accessibility.altTextsCoverage || 0) < 80) {
      potentialFailures.push({
        description: 'Poor image alt text coverage - screen reader users affected',
        severity: 'high',
        likelihood: 'very-likely',
      });
    }
    if (hasError) {
      potentialFailures.push({
        description: 'Visible error messages detected - potential usability issues',
        severity: 'medium',
        likelihood: 'likely',
      });
    }
    if (context.performance && (context.performance.loadTime || 0) > 3000) {
      potentialFailures.push({
        description: 'Slow load time - user frustration and abandonment risk',
        severity: 'high',
        likelihood: 'very-likely',
      });
    }

    // Ensure Rule of Three
    while (potentialFailures.length < 3) {
      if (complexity === 'complex') {
        potentialFailures.push({
          description: 'Complex interaction flows may confuse first-time users',
          severity: 'medium',
          likelihood: 'possible',
        });
      } else if (complexity === 'moderate') {
        potentialFailures.push({
          description: 'Multiple interactive elements increase cognitive load',
          severity: 'low',
          likelihood: 'possible',
        });
      } else {
        potentialFailures.push({
          description: 'Limited interactivity may not meet user expectations',
          severity: 'low',
          likelihood: 'possible',
        });
      }
    }

    let clarityScore = 50;
    if (title && title !== 'Untitled page') clarityScore += 15;
    if (description) clarityScore += 15;
    if (breakdown.length >= 3) clarityScore += 10;
    if (context.domMetrics?.semanticStructure?.hasMain) clarityScore += 10;
    clarityScore = Math.min(100, clarityScore);

    return {
      problemStatement,
      complexity,
      breakdown,
      potentialFailures: potentialFailures.slice(0, 5),
      clarityScore,
    };
  }

  private analyzeUserNeeds(context: QXContext, problemAnalysis: ProblemAnalysis): UserNeedsAnalysis {
    const needs: UserNeedsAnalysis['needs'] = [];
    const challenges: string[] = [];

    const semantic = context.domMetrics?.semanticStructure;
    const accessibility = context.accessibility;
    const interactiveElements = context.domMetrics?.interactiveElements || 0;
    const forms = context.domMetrics?.forms || 0;

    // Must-have features
    if (semantic?.hasNav) {
      needs.push({ description: 'Clear navigation to find content', priority: 'must-have', addressed: true });
    } else {
      challenges.push('Missing navigation structure - users cannot easily explore site');
      needs.push({ description: 'Clear navigation to find content', priority: 'must-have', addressed: false });
    }

    if (interactiveElements > 0) {
      needs.push({ description: 'Interactive elements for engagement', priority: 'must-have', addressed: true });
    }

    if (accessibility && (accessibility.focusableElementsCount || 0) > 0) {
      needs.push({ description: 'Keyboard navigation support', priority: 'must-have', addressed: true });
    } else {
      challenges.push('Limited keyboard navigation - inaccessible to some users');
      needs.push({ description: 'Keyboard navigation support', priority: 'must-have', addressed: false });
    }

    // Should-have features
    if (semantic?.hasHeader) {
      needs.push({ description: 'Consistent page header for orientation', priority: 'should-have', addressed: true });
    }
    if (semantic?.hasFooter) {
      needs.push({ description: 'Footer with supporting information', priority: 'should-have', addressed: true });
    }
    if (accessibility && (accessibility.altTextsCoverage || 0) > 50) {
      needs.push({ description: 'Image descriptions for screen readers', priority: 'should-have', addressed: true });
    } else if (accessibility && (accessibility.altTextsCoverage || 0) < 50) {
      challenges.push('Poor alt text coverage - images not accessible');
      needs.push({ description: 'Image descriptions for screen readers', priority: 'should-have', addressed: false });
    }
    if (context.performance && (context.performance.loadTime || 0) < 3000) {
      needs.push({ description: 'Fast page load time', priority: 'should-have', addressed: true });
    } else if (context.performance && (context.performance.loadTime || 0) >= 3000) {
      challenges.push('Slow load time - user frustration risk');
      needs.push({ description: 'Fast page load time', priority: 'should-have', addressed: false });
    }

    // Nice-to-have features
    if (semantic?.hasAside) {
      needs.push({ description: 'Supplementary content sections', priority: 'nice-to-have', addressed: true });
    }
    if (accessibility && (accessibility.landmarkRoles || 0) > 3) {
      needs.push({ description: 'Rich ARIA landmarks for navigation', priority: 'nice-to-have', addressed: true });
    }
    if (forms > 0) {
      needs.push({ description: 'Form interactions for user input', priority: 'nice-to-have', addressed: true });
    }

    // Determine suitability
    const addressedMustHaves = needs.filter((n) => n.priority === 'must-have' && n.addressed).length;
    let suitability: 'excellent' | 'good' | 'adequate' | 'poor';
    if (challenges.length === 0 && addressedMustHaves >= 3) {
      suitability = 'excellent';
    } else if (challenges.length <= 1 && addressedMustHaves >= 2) {
      suitability = 'good';
    } else if (challenges.length <= 2 && addressedMustHaves >= 2) {
      suitability = 'adequate';
    } else {
      suitability = 'poor';
    }

    let alignmentScore = 40;
    alignmentScore += addressedMustHaves * 10;
    alignmentScore += needs.filter((n) => n.priority === 'should-have' && n.addressed).length * 5;
    alignmentScore += needs.filter((n) => n.priority === 'nice-to-have' && n.addressed).length * 2;
    alignmentScore -= challenges.length * 8;
    alignmentScore = Math.max(0, Math.min(100, alignmentScore));

    return { needs, suitability, challenges, alignmentScore };
  }

  private analyzeBusinessNeeds(context: QXContext, problemAnalysis: ProblemAnalysis): BusinessNeedsAnalysis {
    const forms = context.domMetrics?.forms || 0;
    const interactiveElements = context.domMetrics?.interactiveElements || 0;
    const performance = context.performance;
    const hasErrors = context.errorIndicators?.hasErrorMessages || false;

    let primaryGoal: 'business-ease' | 'user-experience' | 'balanced';
    let kpisAffected: string[] = [];

    if (forms > 2) {
      primaryGoal = 'business-ease';
      kpisAffected = ['Form completion rate', 'Lead generation', 'User sign-ups'];
    } else if (interactiveElements > 30) {
      primaryGoal = 'user-experience';
      kpisAffected = ['Time on site', 'Click-through rate', 'User engagement'];
    } else {
      primaryGoal = 'balanced';
      kpisAffected = ['Content consumption', 'Bounce rate', 'Page views'];
    }

    // Domain-specific KPIs
    const titleLower = (context.title || '').toLowerCase();
    if (titleLower.includes('health') || titleLower.includes('care')) {
      kpisAffected.push('Patient satisfaction', 'Appointment completion rate', 'Information accessibility');
    }

    const crossTeamImpact: BusinessNeedsAnalysis['crossTeamImpact'] = [];
    if (forms > 0) {
      crossTeamImpact.push({ team: 'Marketing', impactType: 'positive', description: 'Form conversion optimization needed' });
      crossTeamImpact.push({ team: 'Development', impactType: 'neutral', description: 'Form validation and submission handling' });
    }
    if (context.accessibility && (context.accessibility.altTextsCoverage || 0) < 100) {
      crossTeamImpact.push({ team: 'Content', impactType: 'negative', description: 'Image alt text creation required' });
    }
    if (performance && (performance.loadTime || 0) > 2000) {
      crossTeamImpact.push({ team: 'Engineering', impactType: 'negative', description: 'Performance optimization needed' });
    }
    if (problemAnalysis.complexity === 'complex') {
      crossTeamImpact.push({ team: 'QA', impactType: 'neutral', description: 'Comprehensive testing strategy required' });
    }

    let compromisesUX = false;
    if (hasErrors) compromisesUX = true;
    if (context.accessibility && (context.accessibility.altTextsCoverage || 0) < 50) compromisesUX = true;
    if (performance && (performance.loadTime || 0) > 4000) compromisesUX = true;

    let alignmentScore = 50;
    if (kpisAffected.length > 0) alignmentScore += 15;
    if (crossTeamImpact.length > 0) alignmentScore += 10;
    if (!compromisesUX) alignmentScore += 20;
    alignmentScore = Math.min(100, alignmentScore);

    return {
      primaryGoal,
      kpisAffected,
      crossTeamImpact,
      compromisesUX,
      impactsKPIs: kpisAffected.length > 0,
      alignmentScore,
    };
  }

  private analyzeCreativity(context: QXContext, problemAnalysis: ProblemAnalysis): CreativityAnalysis {
    const innovativeApproaches: CreativityAnalysis['innovativeApproaches'] = [];

    if (problemAnalysis.complexity === 'complex' || problemAnalysis.complexity === 'moderate') {
      innovativeApproaches.push({
        description: 'Question fundamental assumptions about user mental models and expected workflows',
        inspirationSource: 'philosophy',
        applicability: 'high',
        novelty: 'moderately-novel',
      });

      if (context.errorIndicators?.hasErrorMessages) {
        innovativeApproaches.push({
          description: 'Apply diagnostic testing - systematically isolate error sources through controlled scenarios',
          inspirationSource: 'medicine',
          applicability: 'high',
          novelty: 'moderately-novel',
        });
      }
    }

    if (context.domMetrics?.forms && context.domMetrics.forms > 0) {
      innovativeApproaches.push({
        description: 'Test checkout/form flows like fashion retail - focus on friction points, abandonment triggers',
        inspirationSource: 'e-commerce',
        applicability: 'high',
        novelty: 'incremental',
      });
    }

    innovativeApproaches.push({
      description: 'Analyze through diverse demographic lenses (age, gender, culture, ability) for inclusive testing',
      inspirationSource: 'social science',
      applicability: 'high',
      novelty: 'moderately-novel',
    });

    if (context.domMetrics?.interactiveElements && context.domMetrics.interactiveElements > 20) {
      innovativeApproaches.push({
        description: 'Test for "game-breaking" exploits - unexpected interaction sequences, boundary conditions',
        inspirationSource: 'gaming',
        applicability: 'medium',
        novelty: 'highly-novel',
      });
    }

    const domainsExplored = [...new Set(innovativeApproaches.map((a) => a.inspirationSource))];
    const perspectives = [
      'Unexperienced user perspective (fresh eyes)',
      'Power user perspective (efficiency focus)',
      'Accessibility perspective (assistive tech users)',
      'International perspective (cultural differences)',
    ];

    let creativityScore = 50;
    creativityScore += innovativeApproaches.length * 8;
    creativityScore += domainsExplored.length * 5;
    creativityScore = Math.min(100, creativityScore);

    return {
      innovativeApproaches,
      domainsExplored,
      perspectives,
      creativityScore,
      notes: [
        'Creativity draws from diverse domains to uncover unconventional testing approaches',
        'Higher complexity problems benefit from cross-disciplinary inspiration',
        `Applied ${innovativeApproaches.length} creative approaches from ${domainsExplored.length} domains`,
      ],
    };
  }

  private analyzeDesign(context: QXContext): DesignAnalysis {
    const clearElements: string[] = [];
    const unclearElements: string[] = [];

    if (context.domMetrics?.semanticStructure?.hasNav) {
      clearElements.push('Navigation structure clearly defined with semantic <nav> element');
    }
    if (context.domMetrics?.semanticStructure?.hasMain) {
      clearElements.push('Main content area clearly identified');
    }
    if (context.domMetrics?.semanticStructure?.hasHeader && context.domMetrics?.semanticStructure?.hasFooter) {
      clearElements.push('Header and footer provide clear page structure');
    }

    const ariaLabels = context.accessibility?.ariaLabelsCount || 0;
    const interactiveElements = context.domMetrics?.interactiveElements || 0;
    if (interactiveElements > 0 && ariaLabels < interactiveElements * 0.5) {
      unclearElements.push('Many interactive elements lack ARIA labels for clarity');
    }

    let exactnessScore = 50 + clearElements.length * 15 - unclearElements.length * 10;
    exactnessScore = Math.max(0, Math.min(100, exactnessScore));
    const clarity: 'excellent' | 'good' | 'adequate' | 'poor' =
      exactnessScore >= 80 ? 'excellent' : exactnessScore >= 60 ? 'good' : exactnessScore >= 40 ? 'adequate' : 'poor';

    const intuitivePatterns: string[] = [];
    const culturalIssues: string[] = [];
    let followsConventions = true;

    if (context.domMetrics?.semanticStructure?.hasNav) {
      intuitivePatterns.push('Standard navigation placement');
    }
    if (context.domMetrics?.semanticStructure?.hasHeader) {
      intuitivePatterns.push('Header follows common layout conventions');
    }
    if (!context.domMetrics?.semanticStructure?.hasNav && interactiveElements > 10) {
      followsConventions = false;
      culturalIssues.push('Non-standard navigation pattern may confuse users from different regions');
    }

    let intuitiveScore = 50 + intuitivePatterns.length * 15;
    if (!followsConventions) intuitiveScore -= 20;
    intuitiveScore = Math.max(0, Math.min(100, intuitiveScore));

    const overallDesignScore = Math.round((exactnessScore + intuitiveScore) / 2);

    return {
      exactness: {
        clarity,
        clearElements,
        unclearElements,
        score: exactnessScore,
      },
      intuitive: {
        followsConventions,
        intuitivePatterns,
        culturalIssues,
        score: intuitiveScore,
      },
      counterIntuitive: {
        deviations: [],
        innovativeJustification: false,
        freshEyesPerspective: true,
        issuesCount: 0,
      },
      overallDesignScore,
    };
  }

  private generateRecommendations(
    problemAnalysis: ProblemAnalysis,
    userNeeds: UserNeedsAnalysis,
    businessNeeds: BusinessNeedsAnalysis,
    oracleProblems: import('./types').OracleProblem[],
    impactAnalysis: import('./types').ImpactAnalysis,
    heuristics: import('./types').QXHeuristicResult[]
  ): QXRecommendation[] {
    const recommendations: QXRecommendation[] = [];
    let priority = 1;

    // High-severity issues from heuristics
    for (const heuristic of heuristics) {
      for (const issue of heuristic.issues) {
        if (issue.severity === 'critical' || issue.severity === 'high') {
          recommendations.push({
            principle: heuristic.name,
            recommendation: issue.description,
            severity: issue.severity,
            impact: issue.severity === 'critical' ? 90 : 75,
            effort: 'medium',
            priority: priority++,
            category: 'qx',
          });
        }
      }
      for (const rec of heuristic.recommendations) {
        recommendations.push({
          principle: heuristic.name,
          recommendation: rec,
          severity: 'medium',
          impact: 60,
          effort: 'medium',
          priority: priority++,
          category: 'qx',
        });
      }
    }

    // Oracle problem resolutions
    for (const oracle of oracleProblems) {
      recommendations.push({
        principle: `Oracle: ${oracle.type}`,
        recommendation: oracle.description,
        severity: oracle.severity,
        impact: oracle.severity === 'critical' ? 95 : oracle.severity === 'high' ? 80 : 60,
        effort: 'high',
        priority: priority++,
        category: 'process',
        evidence: oracle.resolutionApproach,
      });
    }

    // User needs challenges
    for (const challenge of userNeeds.challenges) {
      recommendations.push({
        principle: 'User Needs',
        recommendation: challenge,
        severity: 'medium',
        impact: 65,
        effort: 'medium',
        priority: priority++,
        category: 'ux',
      });
    }

    // Sort by severity and impact
    return recommendations
      .sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
        if (severityDiff !== 0) return severityDiff;
        return b.impact - a.impact;
      })
      .slice(0, 15);
  }

  private calculateOverallScore(
    problemAnalysis: ProblemAnalysis,
    userNeeds: UserNeedsAnalysis,
    businessNeeds: BusinessNeedsAnalysis,
    creativityAnalysis: CreativityAnalysis,
    designAnalysis: DesignAnalysis,
    impactAnalysis: import('./types').ImpactAnalysis,
    heuristics: import('./types').QXHeuristicResult[]
  ): number {
    const heuristicsAvg = heuristics.reduce((sum, h) => sum + h.score, 0) / heuristics.length || 0;

    const score =
      problemAnalysis.clarityScore * 0.1 +
      userNeeds.alignmentScore * 0.2 +
      businessNeeds.alignmentScore * 0.15 +
      creativityAnalysis.creativityScore * 0.1 +
      designAnalysis.overallDesignScore * 0.15 +
      (100 - impactAnalysis.overallImpactScore) * 0.1 +
      heuristicsAvg * 0.2;

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  private scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private createMinimalContext(target: string): QXContext {
    return {
      url: target,
      title: target,
    };
  }

  private createMinimalCreativityAnalysis(): CreativityAnalysis {
    return {
      innovativeApproaches: [],
      domainsExplored: [],
      perspectives: [],
      creativityScore: 50,
      notes: ['Creativity analysis skipped'],
    };
  }

  private createMinimalDesignAnalysis(): DesignAnalysis {
    return {
      exactness: { clarity: 'adequate', clearElements: [], unclearElements: [], score: 50 },
      intuitive: { followsConventions: true, intuitivePatterns: [], culturalIssues: [], score: 50 },
      counterIntuitive: { deviations: [], innovativeJustification: false, freshEyesPerspective: false, issuesCount: 0 },
      overallDesignScore: 50,
    };
  }

  // Helper methods from base class
  protected emitStream(context: MCPToolContext, data: unknown): void {
    if (context.streaming && context.onStream) {
      context.onStream(data);
    }
  }

  protected isAborted(context: MCPToolContext): boolean {
    return context.abortSignal?.aborted || false;
  }

  protected createMetadata(startTime: number, requestId: string): import('../../types').ToolResultMetadata {
    return {
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      requestId,
    };
  }
}

// Export singleton instance
export const qxAnalyzeTool = new QXAnalyzeTool();
