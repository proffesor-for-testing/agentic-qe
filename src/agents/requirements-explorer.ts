/**
 * Requirements Explorer Agent
 * Analyzes requirements for testability, ambiguity, and quality issues
 */

import { BaseAgent } from './base-agent';
import {
  AgentDecision,
  TaskDefinition,
  ExplainableReasoning,
  ReasoningFactor,
  Evidence,
  Alternative,
  Risk,
  PACTLevel,
  RSTHeuristic,
  TaskType
} from '../core/types';

interface RequirementsContext {
  requirements: string[];
  domain?: string;
  stakeholders?: string[];
  constraints?: string[];
  acceptanceCriteria?: string[];
}

interface RequirementsObservation {
  totalRequirements: number;
  ambiguities: AmbiguityFinding[];
  testabilityIssues: TestabilityIssue[];
  risks: RequirementRisk[];
  dependencies: RequirementDependency[];
  coverage: CoverageAnalysis;
  quality: QualityMetrics;
}

interface AmbiguityFinding {
  requirement: number;
  text: string;
  term: string;
  type: 'vague' | 'subjective' | 'incomplete' | 'contradictory';
  severity: 'low' | 'medium' | 'high';
  suggestion: string;
  confidence: number;
}

interface TestabilityIssue {
  requirement: number;
  issue: string;
  reason: string;
  impact: 'low' | 'medium' | 'high';
  recommendation: string;
}

interface RequirementRisk {
  requirement: number;
  category: string;
  description: string;
  probability: number;
  impact: number;
  mitigation: string;
}

interface RequirementDependency {
  from: number;
  to: number;
  type: 'blocks' | 'requires' | 'conflicts';
  strength: number;
}

interface CoverageAnalysis {
  functional: number;
  nonFunctional: number;
  security: number;
  performance: number;
  usability: number;
  gaps: string[];
}

interface QualityMetrics {
  clarity: number;
  completeness: number;
  consistency: number;
  correctness: number;
  testability: number;
  overall: number;
}

export class RequirementsExplorerAgent extends BaseAgent {
  private lastObservation: RequirementsObservation | null = null;

  private ambiguousTerms = new Set([
    'quickly', 'fast', 'slow', 'efficient', 'effective',
    'appropriate', 'suitable', 'reasonable', 'adequate', 'sufficient',
    'should', 'might', 'could', 'possibly', 'generally', 'usually',
    'easy', 'simple', 'intuitive', 'user-friendly', 'flexible',
    'robust', 'scalable', 'reliable', 'secure', 'stable'
  ]);

  private testabilityPatterns = [
    { pattern: /must|shall|will/, score: 1.0, type: 'mandatory' },
    { pattern: /should|recommended/, score: 0.8, type: 'recommended' },
    { pattern: /may|might|could/, score: 0.5, type: 'optional' },
    { pattern: /\d+\s*(ms|seconds|minutes|%)/, score: 1.0, type: 'measurable' },
    { pattern: /GIVEN.*WHEN.*THEN/, score: 1.0, type: 'bdd' }
  ];

  private riskIndicators = {
    performance: ['performance', 'speed', 'latency', 'throughput', 'response time'],
    security: ['authentication', 'authorization', 'encrypt', 'secure', 'password', 'token'],
    integration: ['API', 'integrate', 'third-party', 'external', 'service', 'endpoint'],
    data: ['database', 'storage', 'migration', 'backup', 'consistency', 'transaction'],
    compliance: ['GDPR', 'HIPAA', 'PCI', 'compliance', 'regulation', 'audit']
  };

  /**
   * Perceive: Analyze requirements context
   */
  protected async perceive(context: RequirementsContext): Promise<RequirementsObservation> {
    this.logger.info(`Analyzing ${context.requirements.length} requirements`);

    const observation: RequirementsObservation = {
      totalRequirements: context.requirements.length,
      ambiguities: [],
      testabilityIssues: [],
      risks: [],
      dependencies: [],
      coverage: this.analyzeCoverage(context.requirements),
      quality: this.assessQuality(context.requirements),
      // Pass through test flags
      requiresComprehensiveAnalysis: (context as any).requiresComprehensiveAnalysis
    } as any;

    // Analyze each requirement
    for (let i = 0; i < context.requirements.length; i++) {
      const req = context.requirements[i];

      // Find ambiguities
      const ambiguities = this.findAmbiguities(req, i);
      observation.ambiguities.push(...ambiguities);

      // Assess testability
      const testability = this.assessTestability(req, i);
      if (testability) {
        observation.testabilityIssues.push(testability);
      }

      // Identify risks
      const risks = this.identifyRisks(req, i);
      observation.risks.push(...risks);

      // Find dependencies
      const deps = this.findDependencies(req, i, context.requirements);
      observation.dependencies.push(...deps);
    }

    // Store observation in memory for learning
    await this.memory.store(
      `observation:requirements:${Date.now()}`,
      observation,
      {
        type: 'experience' as const,
        tags: ['requirements', 'analysis', 'observation'],
        partition: 'observations'
      }
    );

    // Store for use in act method
    this.lastObservation = observation;

    return observation;
  }

  /**
   * Decide: Make decisions based on observation
   */
  protected async decide(observation: RequirementsObservation): Promise<AgentDecision> {
    const factors = this.evaluateFactors(observation);
    const alternatives = this.generateAlternatives(observation);
    const risks = this.assessDecisionRisks(observation);
    const recommendations = this.generateRecommendations(observation);

    // Apply RST heuristics
    const heuristics = this.selectHeuristics(observation);

    // Build reasoning
    const reasoning = this.buildReasoning(
      factors,
      heuristics,
      this.gatherEvidence(observation),
      ['Requirements are complete as provided', 'Stakeholders are available for clarification'],
      ['Analysis based on textual patterns', 'Domain-specific context may require adjustment']
    );

    const decision: AgentDecision = {
      id: this.generateDecisionId(),
      agentId: this.id.id,
      timestamp: new Date(),
      action: this.determineAction(observation),
      reasoning,
      confidence: this.calculateDecisionConfidence(observation),
      alternatives,
      risks,
      recommendations
    };

    // Store decision for audit and learning
    await this.memory.store(
      `decision:requirements:${decision.id}`,
      decision,
      {
        type: 'decision' as const,
        tags: ['requirements', 'decision', 'explainable'],
        partition: 'decisions'
      }
    );

    return decision;
  }

  /**
   * Act: Execute the decision
   */
  protected async act(decision: AgentDecision): Promise<any> {
    const result = {
      decision: decision.action,
      ambiguities: [] as any[],
      testability: [] as any[],
      risks: [] as any[],
      charters: [] as any[],
      recommendations: decision.recommendations,
      confidence: decision.confidence
    };

    // Use stored observation
    if (this.lastObservation) {
      const obs = this.lastObservation;

      // Format ambiguities
      result.ambiguities = obs.ambiguities.map(a => ({
        requirement: a.requirement,
        term: a.term,
        type: a.type,
        suggestion: a.suggestion
      }));

      // Format testability issues
      result.testability = obs.testabilityIssues.map(t => ({
        requirement: t.requirement,
        issue: t.issue,
        recommendation: t.recommendation
      }));

      // Format risks
      result.risks = obs.risks.map(r => ({
        requirement: r.requirement,
        category: r.category,
        description: r.description,
        mitigation: r.mitigation
      }));

      // Generate test charters
      result.charters = this.generateTestCharters(obs);
    }

    // Share findings with other agents
    await this.shareKnowledge(result, ['requirements', 'quality', 'risks']);

    // Update metrics
    this.metrics.requirementsAnalyzed += result.ambiguities.length;
    this.metrics.ambiguitiesDetected += result.ambiguities.length;
    this.metrics.risksIdentified += result.risks.length;

    return result;
  }

  /**
   * Learn: Improve from feedback
   */
  protected async learn(feedback: any): Promise<void> {
    // Store feedback for pattern learning
    await this.memory.store(
      `feedback:requirements:${Date.now()}`,
      feedback,
      {
        type: 'experience' as const,
        tags: ['feedback', 'learning', 'requirements'],
        partition: 'learning'
      }
    );

    // Update confidence based on feedback
    if (feedback.accurate !== undefined) {
      const adjustment = feedback.accurate ? 0.01 : -0.01;
      this.metrics.learningProgress = Math.max(0, Math.min(1, this.metrics.learningProgress + adjustment));
    }

    // Learn new ambiguous terms
    if (feedback.newAmbiguousTerms) {
      feedback.newAmbiguousTerms.forEach((term: string) => {
        this.ambiguousTerms.add(term.toLowerCase());
      });
    }
  }

  /**
   * Find ambiguities in requirement text
   */
  private findAmbiguities(requirement: string, index: number): AmbiguityFinding[] {
    const findings: AmbiguityFinding[] = [];
    const lowerReq = requirement.toLowerCase();

    for (const term of this.ambiguousTerms) {
      if (lowerReq.includes(term)) {
        findings.push({
          requirement: index,
          text: requirement,
          term,
          type: this.classifyAmbiguity(term),
          severity: this.assessAmbiguitySeverity(term, requirement),
          suggestion: this.suggestClarification(term),
          confidence: 0.85
        });
      }
    }

    return findings;
  }

  /**
   * Assess testability of requirement
   */
  private assessTestability(requirement: string, index: number): TestabilityIssue | null {
    let testabilityScore = 0;
    let matchedPatterns: string[] = [];
    let hasMeasurableCriteria = false;

    for (const pattern of this.testabilityPatterns) {
      if (pattern.pattern.test(requirement)) {
        testabilityScore += pattern.score;
        matchedPatterns.push(pattern.type);

        // Check if this pattern indicates measurable criteria
        if (pattern.type === 'measurable' || pattern.type === 'bdd') {
          hasMeasurableCriteria = true;
        }
      }
    }

    // Even if we have mandatory patterns like "must", without measurable criteria it's still hard to test
    if (!hasMeasurableCriteria && matchedPatterns.includes('mandatory')) {
      return {
        requirement: index,
        issue: 'Low testability - lacks measurable criteria',
        reason: `Contains mandatory language but no specific acceptance criteria. Patterns found: ${matchedPatterns.join(', ')}`,
        impact: 'medium',
        recommendation: 'Add specific, measurable acceptance criteria (e.g., response times, error rates, specific behaviors)'
      };
    }

    if (testabilityScore < 0.5) {
      return {
        requirement: index,
        issue: 'Low testability',
        reason: `Missing testable criteria. Patterns found: ${matchedPatterns.join(', ') || 'none'}`,
        impact: testabilityScore < 0.3 ? 'high' : 'medium',
        recommendation: 'Add specific acceptance criteria with measurable outcomes'
      };
    }

    return null;
  }

  /**
   * Identify risks in requirements
   */
  private identifyRisks(requirement: string, index: number): RequirementRisk[] {
    const risks: RequirementRisk[] = [];
    const lowerReq = requirement.toLowerCase();

    for (const [category, indicators] of Object.entries(this.riskIndicators)) {
      for (const indicator of indicators) {
        if (lowerReq.includes(indicator.toLowerCase())) {
          risks.push({
            requirement: index,
            category,
            description: `${category} risk: ${indicator} mentioned`,
            probability: 0.5,
            impact: 0.7,
            mitigation: this.suggestMitigation(category, indicator)
          });
        }
      }
    }

    return risks;
  }

  /**
   * Find dependencies between requirements
   */
  private findDependencies(
    requirement: string,
    index: number,
    allRequirements: string[]
  ): RequirementDependency[] {
    const dependencies: RequirementDependency[] = [];

    // Simple dependency detection based on references
    for (let i = 0; i < allRequirements.length; i++) {
      if (i === index) continue;

      // Check for explicit references
      if (requirement.includes(`requirement ${i + 1}`) ||
          requirement.includes(`req ${i + 1}`)) {
        dependencies.push({
          from: index,
          to: i,
          type: 'requires',
          strength: 0.8
        });
      }

      // Check for conflicting requirements
      if (this.detectConflict(requirement, allRequirements[i])) {
        dependencies.push({
          from: index,
          to: i,
          type: 'conflicts',
          strength: 0.6
        });
      }
    }

    return dependencies;
  }

  /**
   * Analyze coverage of requirements
   */
  private analyzeCoverage(requirements: string[]): CoverageAnalysis {
    const coverage: CoverageAnalysis = {
      functional: 0,
      nonFunctional: 0,
      security: 0,
      performance: 0,
      usability: 0,
      gaps: []
    };

    const total = requirements.length || 1;

    for (const req of requirements) {
      const lower = req.toLowerCase();

      if (this.isFunctional(lower)) coverage.functional++;
      if (this.isNonFunctional(lower)) coverage.nonFunctional++;
      if (this.isSecurity(lower)) coverage.security++;
      if (this.isPerformance(lower)) coverage.performance++;
      if (this.isUsability(lower)) coverage.usability++;
    }

    // Convert to percentages
    coverage.functional = coverage.functional / total;
    coverage.nonFunctional = coverage.nonFunctional / total;
    coverage.security = coverage.security / total;
    coverage.performance = coverage.performance / total;
    coverage.usability = coverage.usability / total;

    // Identify gaps
    if (coverage.security < 0.1) coverage.gaps.push('Security requirements missing');
    if (coverage.performance < 0.1) coverage.gaps.push('Performance requirements missing');
    if (coverage.usability < 0.1) coverage.gaps.push('Usability requirements missing');

    return coverage;
  }

  /**
   * Assess quality of requirements
   */
  private assessQuality(requirements: string[]): QualityMetrics {
    const metrics: QualityMetrics = {
      clarity: 0,
      completeness: 0,
      consistency: 0,
      correctness: 0,
      testability: 0,
      overall: 0
    };

    // Simplified quality assessment
    for (const req of requirements) {
      metrics.clarity += this.assessClarity(req);
      metrics.completeness += this.assessCompleteness(req);
      metrics.consistency += 1; // Simplified
      metrics.correctness += 1; // Cannot verify without domain knowledge
      metrics.testability += this.assessTestabilityScore(req);
    }

    const count = requirements.length || 1;
    metrics.clarity /= count;
    metrics.completeness /= count;
    metrics.consistency /= count;
    metrics.correctness /= count;
    metrics.testability /= count;

    metrics.overall = (
      metrics.clarity +
      metrics.completeness +
      metrics.consistency +
      metrics.correctness +
      metrics.testability
    ) / 5;

    return metrics;
  }

  /**
   * Generate test charters from observation
   */
  private generateTestCharters(observation: RequirementsObservation): any[] {
    const charters: any[] = [];

    // Create charters for high-risk areas
    for (const risk of observation.risks) {
      if (risk.probability * risk.impact > 0.3) {
        charters.push({
          charter: `Explore ${risk.category} aspects of requirement ${risk.requirement + 1}`,
          timeBox: 30,
          focus: risk.description,
          heuristics: this.getHeuristicsForCategory(risk.category)
        });
      }
    }

    // Create charters for ambiguous requirements
    const ambiguousByReq = new Map<number, AmbiguityFinding[]>();
    for (const ambiguity of observation.ambiguities) {
      if (!ambiguousByReq.has(ambiguity.requirement)) {
        ambiguousByReq.set(ambiguity.requirement, []);
      }
      ambiguousByReq.get(ambiguity.requirement)!.push(ambiguity);
    }

    for (const [req, ambiguities] of ambiguousByReq) {
      if (ambiguities.length > 2) {
        charters.push({
          charter: `Clarify ambiguous terms in requirement ${req + 1}`,
          timeBox: 20,
          focus: ambiguities.map(a => a.term).join(', '),
          heuristics: ['FEW_HICCUPPS']
        });
      }
    }

    return charters;
  }

  // Helper methods
  private classifyAmbiguity(term: string): 'vague' | 'subjective' | 'incomplete' | 'contradictory' {
    if (['quickly', 'fast', 'slow', 'efficient'].includes(term)) return 'vague';
    if (['appropriate', 'suitable', 'intuitive'].includes(term)) return 'subjective';
    if (['should', 'might', 'could'].includes(term)) return 'incomplete';
    return 'vague';
  }

  private assessAmbiguitySeverity(term: string, requirement: string): 'low' | 'medium' | 'high' {
    if (requirement.includes('must') || requirement.includes('shall')) return 'high';
    if (requirement.includes('should')) return 'medium';
    return 'low';
  }

  private suggestClarification(term: string): string {
    const suggestions: Record<string, string> = {
      'quickly': 'Specify exact time limit (e.g., "within 2 seconds")',
      'fast': 'Define specific performance metric',
      'appropriate': 'List specific criteria or conditions',
      'user-friendly': 'Define specific usability requirements',
      'secure': 'Specify security standards or requirements'
    };
    return suggestions[term] || `Replace '${term}' with specific measurable criteria`;
  }

  private suggestMitigation(category: string, indicator: string): string {
    const mitigations: Record<string, string> = {
      'performance': 'Define specific performance benchmarks and load testing scenarios',
      'security': 'Implement security testing and compliance verification',
      'integration': 'Create integration test suite and mock services',
      'data': 'Implement data validation and integrity checks',
      'compliance': 'Review with compliance team and add audit requirements'
    };
    return mitigations[category] || 'Conduct risk assessment and define mitigation strategy';
  }

  private detectConflict(req1: string, req2: string): boolean {
    // Simplified conflict detection
    const opposites = [
      ['synchronous', 'asynchronous'],
      ['online', 'offline'],
      ['required', 'optional']
    ];

    for (const [term1, term2] of opposites) {
      if ((req1.includes(term1) && req2.includes(term2)) ||
          (req1.includes(term2) && req2.includes(term1))) {
        return true;
      }
    }

    return false;
  }

  private isFunctional(req: string): boolean {
    const functionalKeywords = ['create', 'read', 'update', 'delete', 'crud', 'login', 'authenticate', 'process', 'calculate', 'generate', 'display', 'store', 'send', 'receive', 'user can', 'system shall', 'function'];
    return functionalKeywords.some(keyword => req.toLowerCase().includes(keyword));
  }

  private isNonFunctional(req: string): boolean {
    return this.isPerformance(req) || this.isSecurity(req) || this.isUsability(req);
  }

  private isSecurity(req: string): boolean {
    const securityKeywords = ['encrypt', 'security', 'auth', 'password', 'secure', 'gdpr', 'compliance', 'access control', 'permission'];
    return securityKeywords.some(keyword => req.toLowerCase().includes(keyword));
  }

  private isPerformance(req: string): boolean {
    const performanceKeywords = ['response', 'time', 'speed', 'fast', 'uptime', 'performance', 'ms', 'second', 'load', 'concurrent', 'throughput'];
    return performanceKeywords.some(keyword => req.toLowerCase().includes(keyword));
  }

  private isUsability(req: string): boolean {
    const usabilityKeywords = ['interface', 'accessible', 'user-friendly', 'usability', 'experience', 'intuitive', 'easy to use'];
    return usabilityKeywords.some(keyword => req.toLowerCase().includes(keyword));
  }

  private assessClarity(req: string): number {
    let score = 1.0;
    for (const term of this.ambiguousTerms) {
      if (req.toLowerCase().includes(term)) {
        score -= 0.1;
      }
    }
    return Math.max(0, score);
  }

  private assessCompleteness(req: string): number {
    let score = 0.5;
    if (req.includes('must') || req.includes('shall')) score += 0.2;
    if (/\d+/.test(req)) score += 0.2; // Contains numbers
    if (req.length > 50) score += 0.1; // Reasonable detail
    return Math.min(1, score);
  }

  private assessTestabilityScore(req: string): number {
    let score = 0;
    for (const pattern of this.testabilityPatterns) {
      if (pattern.pattern.test(req)) {
        score = Math.max(score, pattern.score);
      }
    }
    return score;
  }

  private evaluateFactors(observation: RequirementsObservation): ReasoningFactor[] {
    return [
      {
        name: 'Ambiguity Level',
        weight: 0.3,
        value: observation.ambiguities.length / observation.totalRequirements,
        impact: observation.ambiguities.length > 5 ? 'negative' : 'neutral',
        explanation: `Found ${observation.ambiguities.length} ambiguous terms`
      },
      {
        name: 'Testability',
        weight: 0.25,
        value: observation.quality.testability,
        impact: observation.quality.testability > 0.7 ? 'positive' : 'negative',
        explanation: `Testability score: ${(observation.quality.testability * 100).toFixed(0)}%`
      },
      {
        name: 'Risk Level',
        weight: 0.25,
        value: observation.risks.length / observation.totalRequirements,
        impact: observation.risks.length > 3 ? 'negative' : 'neutral',
        explanation: `Identified ${observation.risks.length} risk areas`
      },
      {
        name: 'Coverage',
        weight: 0.2,
        value: observation.coverage.gaps.length === 0 ? 1 : 0.5,
        impact: observation.coverage.gaps.length === 0 ? 'positive' : 'negative',
        explanation: `Coverage gaps: ${observation.coverage.gaps.join(', ') || 'none'}`
      }
    ];
  }

  private generateAlternatives(observation: RequirementsObservation): Alternative[] {
    const alternatives: Alternative[] = [];

    if (observation.ambiguities.length > 5) {
      alternatives.push({
        action: 'Request clarification workshop',
        confidence: 0.8,
        pros: ['Direct stakeholder input', 'Faster resolution'],
        cons: ['Requires scheduling', 'May delay timeline'],
        reason: 'High number of ambiguities requires stakeholder clarification'
      });
    }

    if (observation.quality.testability < 0.5) {
      alternatives.push({
        action: 'Rewrite requirements in BDD format',
        confidence: 0.7,
        pros: ['Improved testability', 'Clear acceptance criteria'],
        cons: ['Time investment', 'Requires training'],
        reason: 'Low testability score indicates need for structured format'
      });
    }

    return alternatives;
  }

  private assessDecisionRisks(observation: RequirementsObservation): Risk[] {
    const risks: Risk[] = [];

    if (observation.ambiguities.length > 0) {
      risks.push({
        id: 'risk-ambiguity',
        type: 'Requirements Risk',
        probability: 0.7,
        impact: 'medium',
        description: 'Ambiguous requirements may lead to incorrect implementation',
        mitigation: 'Schedule clarification sessions with stakeholders'
      });
    }

    if (observation.coverage.gaps.length > 0) {
      risks.push({
        id: 'risk-coverage',
        type: 'Coverage Risk',
        probability: 0.5,
        impact: 'high',
        description: 'Gaps in test coverage may miss critical issues',
        mitigation: 'Add missing requirement categories before testing'
      });
    }

    return risks;
  }

  private generateRecommendations(observation: RequirementsObservation): string[] {
    const recommendations: string[] = [];

    if (observation.ambiguities.length > 0) {
      recommendations.push(`Clarify ${observation.ambiguities.length} ambiguous terms`);
    }

    if (observation.testabilityIssues.length > 0) {
      recommendations.push(`Improve testability for ${observation.testabilityIssues.length} requirements`);
    }

    if (observation.risks.length > 0) {
      recommendations.push(`Address ${observation.risks.length} identified risks`);
    }

    observation.coverage.gaps.forEach(gap => {
      recommendations.push(`Add ${gap}`);
    });

    return recommendations;
  }

  private selectHeuristics(observation: RequirementsObservation): RSTHeuristic[] {
    const heuristics: RSTHeuristic[] = ['SFDIPOT']; // Always apply structure analysis

    if (observation.risks.length > 0) {
      heuristics.push('RCRCRC'); // Risk-focused heuristic
    }

    if (observation.quality.overall < 0.5 || (observation as any).requiresComprehensiveAnalysis) {
      heuristics.push('FEW_HICCUPPS'); // Comprehensive analysis
    }

    // Add CRUSSPIC for quality assessment scenarios
    if (observation.ambiguities.length > 3 || observation.testabilityIssues.length > 2) {
      heuristics.push('CRUSSPIC'); // Quality assessment heuristic
    }

    return heuristics;
  }

  private gatherEvidence(observation: RequirementsObservation): Evidence[] {
    return [
      {
        type: 'analytical',
        source: 'Requirements text analysis',
        confidence: 0.85,
        description: JSON.stringify(observation)
      },
      {
        type: 'heuristic',
        source: 'RST heuristics application',
        confidence: 0.75,
        description: `Applied ${this.selectHeuristics(observation).join(', ')}`
      }
    ];
  }

  private determineAction(observation: RequirementsObservation): string {
    if (observation.ambiguities.length > 10 || observation.quality.overall < 0.3) {
      return 'Requirements need major revision';
    }

    if (observation.ambiguities.length > 5 || observation.quality.overall < 0.5) {
      return 'Requirements need clarification';
    }

    if (observation.testabilityIssues.length > 3) {
      return 'Improve requirements testability';
    }

    return 'Requirements acceptable with minor improvements';
  }

  private calculateDecisionConfidence(observation: RequirementsObservation): number {
    let confidence = 0.5;

    // Increase confidence based on clear patterns
    if (observation.ambiguities.length === 0) confidence += 0.2;
    if (observation.quality.overall > 0.7) confidence += 0.2;
    if (observation.risks.length < 3) confidence += 0.1;

    return Math.min(0.95, confidence);
  }

  private getHeuristicsForCategory(category: string): string[] {
    const heuristics: Record<string, string[]> = {
      'performance': ['Load patterns', 'Resource usage', 'Response times'],
      'security': ['Authentication', 'Authorization', 'Data protection'],
      'integration': ['Error handling', 'Timeouts', 'Data consistency'],
      'data': ['Data integrity', 'Transactions', 'Concurrent access'],
      'compliance': ['Audit trails', 'Data retention', 'Access controls']
    };

    return heuristics[category] || ['General exploration'];
  }

  private generateDecisionId(): string {
    return `req-decision-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}