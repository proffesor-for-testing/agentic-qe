/**
 * Specification Agent
 *
 * Specializes in the Specification phase of SPARC methodology
 * Analyzes requirements, formalizes specifications, and defines acceptance criteria
 */

import { BaseAgent } from './base-agent';
import {
  AgentId,
  AgentConfig,
  AgentDecision,
  TaskDefinition,
  TaskResult,
  ExplainableReasoning,
  ReasoningFactor,
  Evidence,
  ILogger,
  IEventBus,
  IMemorySystem
} from '../core/types';

interface Requirement {
  id: string;
  type: 'functional' | 'non-functional' | 'constraint' | 'assumption';
  priority: 'high' | 'medium' | 'low';
  description: string;
  source: string;
  acceptance_criteria: AcceptanceCriterion[];
  dependencies: string[];
  risks: string[];
  testable: boolean;
  clarity_score: number;
}

interface AcceptanceCriterion {
  id: string;
  scenario: string;
  given: string[];
  when: string[];
  then: string[];
  testable: boolean;
  priority: 'high' | 'medium' | 'low';
}

interface SpecificationDocument {
  project: string;
  feature: string;
  version: string;
  requirements: Requirement[];
  glossary: Record<string, string>;
  assumptions: string[];
  constraints: string[];
  success_criteria: string[];
  quality_attributes: Record<string, any>;
  specification_completeness: number;
  clarity_score: number;
  testability_score: number;
}

interface SpecificationContext {
  raw_requirements: string[];
  stakeholder_input: any[];
  domain_knowledge: any;
  existing_specifications?: SpecificationDocument[];
  project_constraints: string[];
  business_context: any;
  technical_context: any;
  quality_standards: Record<string, number>;
}

export class SpecificationAgent extends BaseAgent {
  private requirementCounter = 0;
  private criterionCounter = 0;
  private qualityThresholds = {
    min_clarity: 0.8,
    min_testability: 0.85,
    min_completeness: 0.9
  };

  constructor(
    id: AgentId,
    config: AgentConfig,
    logger: ILogger,
    eventBus: IEventBus,
    memory: IMemorySystem
  ) {
    super(id, config, logger, eventBus, memory);
  }

  protected async perceive(context: any): Promise<SpecificationContext> {
    this.logger.debug('Specification agent perceiving requirements context', { agentId: this.id });

    // Retrieve existing project knowledge
    const existingSpecs = await this.memory.retrieve(`specifications:${context.project}`) || [];
    const domainKnowledge = await this.memory.retrieve(`domain_knowledge:${context.domain}`) || {};
    const projectContext = await this.memory.retrieve(`project_context:${context.project}`) || {};

    const specificationContext: SpecificationContext = {
      raw_requirements: context.requirements || [],
      stakeholder_input: context.stakeholder_input || [],
      domain_knowledge: domainKnowledge,
      existing_specifications: existingSpecs,
      project_constraints: context.constraints || [],
      business_context: context.business_context || {},
      technical_context: context.technical_context || {},
      quality_standards: {
        ...this.qualityThresholds,
        ...context.quality_standards
      }
    };

    // Store context for other agents
    await this.memory.store(`specification_context:${context.project}:${context.feature}`, specificationContext, {
      type: 'experience' as const,
      tags: ['sparc', 'specification', 'requirements'],
      partition: 'sparc'
    });

    return specificationContext;
  }

  protected async decide(observation: SpecificationContext): Promise<AgentDecision> {
    this.logger.debug('Specification agent making specification decision', { agentId: this.id });

    const analysisResults = this.analyzeRequirements(observation);

    let decision: AgentDecision;

    if (analysisResults.clarity_score < this.qualityThresholds.min_clarity) {
      decision = {
        id: this.generateId(),
        agentId: this.id.id,
        timestamp: new Date(),
        action: 'clarify_requirements',
        confidence: 0.7,
        reasoning: this.buildReasoning([
          { name: 'clarity_score', value: analysisResults.clarity_score, weight: 0.5, impact: 'high', explanation: 'Current clarity score below threshold' },
          { name: 'unclear_count', value: analysisResults.unclear_requirements.length, weight: 0.3, impact: 'medium', explanation: 'Number of unclear requirements' },
          { name: 'stakeholder_availability', value: 1, weight: 0.2, impact: 'low', explanation: 'Stakeholder availability for clarification' }
        ], ['FEW_HICCUPPS'], [
          { type: 'quality', source: 'requirement_analysis', confidence: 0.8, description: 'Requirements need clarification' }
        ]),
        alternatives: [],
        risks: [],
        recommendations: ['Schedule stakeholder meeting for clarification']
      };
    } else if (analysisResults.completeness_score < this.qualityThresholds.min_completeness) {
      decision = {
        id: this.generateId(),
        agentId: this.id.id,
        timestamp: new Date(),
        action: 'elaborate_requirements',
        confidence: 0.8,
        reasoning: this.buildReasoning([
          { name: 'completeness_score', value: analysisResults.completeness_score, weight: 0.6, impact: 'high', explanation: 'Current completeness score below threshold' },
          { name: 'missing_areas_count', value: analysisResults.missing_areas.length, weight: 0.4, impact: 'medium', explanation: 'Number of missing requirement areas' }
        ], ['SFDIPOT'], [
          { type: 'quality', source: 'requirement_analysis', confidence: 0.8, description: 'Requirements need elaboration' }
        ]),
        alternatives: [],
        risks: [],
        recommendations: this.suggestMissingRequirements(observation)
      };
    } else {
      decision = {
        id: this.generateId(),
        agentId: this.id.id,
        timestamp: new Date(),
        action: 'formalize_specification',
        confidence: 0.9,
        reasoning: this.buildReasoning([
          { name: 'clarity_score', value: analysisResults.clarity_score, weight: 0.4, impact: 'high', explanation: 'Requirements clarity score' },
          { name: 'completeness_score', value: analysisResults.completeness_score, weight: 0.4, impact: 'high', explanation: 'Requirements completeness score' },
          { name: 'ready_for_formalization', value: 1, weight: 0.2, impact: 'medium', explanation: 'Readiness for formalization' }
        ], ['CRUSSPIC'], [
          { type: 'quality', source: 'requirement_analysis', confidence: 0.9, description: 'Requirements ready for formalization' }
        ]),
        alternatives: [],
        risks: [],
        recommendations: ['Proceed with formal specification creation']
      };
    }

    return decision;
  }

  protected async act(decision: AgentDecision): Promise<any> {
    this.logger.info('Specification agent executing action', {
      agentId: this.id,
      action: decision.action
    });

    let result: any;

    switch (decision.action) {
      case 'clarify_requirements':
        result = await this.clarifyRequirements(decision.metadata);
        break;

      case 'elaborate_requirements':
        result = await this.elaborateRequirements(decision.metadata);
        break;

      case 'formalize_specification':
        result = await this.formalizeSpecification(decision.metadata);
        break;

      default:
        this.logger.warn('Unknown specification action requested', { action: decision.action });
        result = { success: false, error: 'Unknown action' };
    }

    // Store action result
    await this.memory.store(`specification_action:${decision.id}`, {
      decision,
      result,
      timestamp: Date.now()
    }, {
      type: 'metric' as const,
      tags: ['sparc', 'specification', decision.action],
      partition: 'sparc'
    });

    return result;
  }

  protected async learn(feedback: any): Promise<void> {
    this.logger.debug('Specification agent learning from feedback', { agentId: this.id });

    if (feedback.specification_quality) {
      const quality = feedback.specification_quality;

      // Adjust thresholds based on downstream feedback
      if (quality.pseudocode_generation_success < 0.8) {
        this.qualityThresholds.min_clarity = Math.min(0.95, this.qualityThresholds.min_clarity + 0.05);
      }

      if (quality.test_generation_success < 0.8) {
        this.qualityThresholds.min_testability = Math.min(0.95, this.qualityThresholds.min_testability + 0.03);
      }
    }

    if (feedback.stakeholder_feedback) {
      const stakeholderFeedback = feedback.stakeholder_feedback;

      // Learn from stakeholder satisfaction
      if (stakeholderFeedback.satisfaction_score < 0.7) {
        this.qualityThresholds.min_completeness = Math.min(0.95, this.qualityThresholds.min_completeness + 0.02);
      }
    }

    // Store learning outcomes
    await this.memory.store('specification_agent_learning', {
      timestamp: Date.now(),
      qualityThresholds: this.qualityThresholds,
      feedback
    }, {
      type: 'knowledge' as const,
      tags: ['sparc', 'specification', 'adaptation'],
      partition: 'sparc'
    });
  }

  private analyzeRequirements(context: SpecificationContext): any {
    const requirements = context.raw_requirements;

    // Analyze clarity
    const clarityScores = requirements.map(req => this.calculateClarityScore(req));
    const clarity_score = clarityScores.reduce((sum, score) => sum + score, 0) / clarityScores.length || 0;

    // Analyze completeness
    const completeness_score = this.calculateCompletenessScore(requirements, context);

    // Identify issues
    const unclear_requirements = requirements.filter((req, index) => clarityScores[index] < 0.7);
    const missing_areas = this.identifyMissingAreas(requirements, context);

    return {
      clarity_score,
      completeness_score,
      unclear_requirements,
      missing_areas,
      clarification_questions: this.generateClarificationQuestions(unclear_requirements),
      incomplete_requirements: requirements.filter(req => !this.isComplete(req))
    };
  }

  private calculateClarityScore(requirement: string): number {
    let score = 1.0;

    // Check for vague terms
    const vagueTerms = ['should', 'might', 'could', 'maybe', 'probably', 'usually'];
    const vagueTermCount = vagueTerms.filter(term => requirement.toLowerCase().includes(term)).length;
    score -= vagueTermCount * 0.1;

    // Check for specific, measurable criteria
    const hasNumbers = /\d+/.test(requirement);
    const hasSpecificTerms = ['must', 'shall', 'will', 'exactly', 'within'].some(term =>
      requirement.toLowerCase().includes(term)
    );

    if (hasNumbers || hasSpecificTerms) score += 0.2;

    return Math.max(0, Math.min(1, score));
  }

  private calculateCompletenessScore(requirements: string[], context: SpecificationContext): number {
    const expectedAreas = ['functional', 'performance', 'security', 'usability', 'reliability'];
    const coveredAreas = expectedAreas.filter(area =>
      requirements.some(req => req.toLowerCase().includes(area))
    );

    return coveredAreas.length / expectedAreas.length;
  }

  private identifyMissingAreas(requirements: string[], context: SpecificationContext): string[] {
    const areas = ['error handling', 'performance criteria', 'security requirements',
                   'data validation', 'user interface', 'integration points'];

    return areas.filter(area =>
      !requirements.some(req => req.toLowerCase().includes(area.replace(' ', '')))
    );
  }

  private generateClarificationQuestions(unclear_requirements: string[]): string[] {
    return unclear_requirements.map(req =>
      `What specific criteria should be used to measure: "${req}"?`
    );
  }

  private isComplete(requirement: string): boolean {
    return requirement.length > 20 && // Minimum length
           requirement.includes('when') || requirement.includes('if') || // Conditional logic
           requirement.includes('must') || requirement.includes('shall'); // Clear obligation
  }

  private suggestMissingRequirements(context: SpecificationContext): string[] {
    const suggestions: string[] = [];

    if (!context.raw_requirements.some(req => req.toLowerCase().includes('performance'))) {
      suggestions.push('Define performance requirements (response time, throughput)');
    }

    if (!context.raw_requirements.some(req => req.toLowerCase().includes('error'))) {
      suggestions.push('Specify error handling and recovery procedures');
    }

    if (!context.raw_requirements.some(req => req.toLowerCase().includes('security'))) {
      suggestions.push('Define security and access control requirements');
    }

    return suggestions;
  }

  private async clarifyRequirements(parameters: any): Promise<any> {
    // Simulate requirement clarification process
    const clarifications = parameters.clarification_questions.map((question: string) => ({
      question,
      suggested_answer: `Clarified: ${question.replace('?', ' should be measured using specific metrics')}`
    }));

    return {
      success: true,
      clarifications,
      next_action: 'review_clarifications',
      stakeholders_notified: parameters.stakeholders.length
    };
  }

  private async elaborateRequirements(parameters: any): Promise<any> {
    const elaborations = parameters.missing_areas.map((area: string) => ({
      area,
      suggested_requirements: parameters.suggested_additions.filter((s: string) =>
        s.toLowerCase().includes(area.replace(' ', ''))
      )
    }));

    return {
      success: true,
      elaborations,
      missing_areas_addressed: parameters.missing_areas.length,
      next_action: 'validate_elaborations'
    };
  }

  private async formalizeSpecification(parameters: any): Promise<any> {
    const requirements = parameters.requirements;
    const context = parameters.context;

    // Create formal requirements
    const formalRequirements: Requirement[] = requirements.map((req: string, index: number) => ({
      id: `REQ-${String(++this.requirementCounter).padStart(3, '0')}`,
      type: this.classifyRequirement(req),
      priority: this.determinePriority(req),
      description: req,
      source: 'stakeholder_input',
      acceptance_criteria: this.generateAcceptanceCriteria(req),
      dependencies: [],
      risks: this.identifyRisks(req),
      testable: this.isTestable(req),
      clarity_score: this.calculateClarityScore(req)
    }));

    const specification: SpecificationDocument = {
      project: context.business_context?.project || 'unknown',
      feature: context.business_context?.feature || 'unknown',
      version: '1.0.0',
      requirements: formalRequirements,
      glossary: this.buildGlossary(requirements),
      assumptions: this.extractAssumptions(context),
      constraints: context.project_constraints,
      success_criteria: this.defineSuccessCriteria(formalRequirements),
      quality_attributes: this.defineQualityAttributes(),
      specification_completeness: this.calculateSpecificationCompleteness(formalRequirements),
      clarity_score: formalRequirements.reduce((sum, req) => sum + req.clarity_score, 0) / formalRequirements.length,
      testability_score: formalRequirements.filter(req => req.testable).length / formalRequirements.length
    };

    // Store specification
    await this.memory.store(`sparc_specification:${specification.project}:${specification.feature}`, specification, {
      type: 'knowledge' as const,
      tags: ['sparc', 'specification', 'formal'],
      partition: 'sparc'
    });

    return {
      success: true,
      specification,
      requirements_count: formalRequirements.length,
      testable_requirements: formalRequirements.filter(req => req.testable).length,
      quality_score: (specification.clarity_score + specification.testability_score + specification.specification_completeness) / 3
    };
  }

  private classifyRequirement(requirement: string): 'functional' | 'non-functional' | 'constraint' | 'assumption' {
    const lowerReq = requirement.toLowerCase();

    if (lowerReq.includes('performance') || lowerReq.includes('security') || lowerReq.includes('usability')) {
      return 'non-functional';
    }
    if (lowerReq.includes('must not') || lowerReq.includes('cannot') || lowerReq.includes('limited')) {
      return 'constraint';
    }
    if (lowerReq.includes('assume') || lowerReq.includes('given that')) {
      return 'assumption';
    }
    return 'functional';
  }

  private determinePriority(requirement: string): 'high' | 'medium' | 'low' {
    const lowerReq = requirement.toLowerCase();

    if (lowerReq.includes('critical') || lowerReq.includes('must') || lowerReq.includes('essential')) {
      return 'high';
    }
    if (lowerReq.includes('should') || lowerReq.includes('important')) {
      return 'medium';
    }
    return 'low';
  }

  private generateAcceptanceCriteria(requirement: string): AcceptanceCriterion[] {
    return [{
      id: `AC-${String(++this.criterionCounter).padStart(3, '0')}`,
      scenario: `Verify ${requirement.substring(0, 50)}...`,
      given: ['System is operational', 'User has appropriate permissions'],
      when: ['User performs the required action'],
      then: ['System responds as specified', 'Expected outcome is achieved'],
      testable: true,
      priority: 'high'
    }];
  }

  private identifyRisks(requirement: string): string[] {
    const risks: string[] = [];

    if (requirement.toLowerCase().includes('performance')) {
      risks.push('Performance targets may be difficult to achieve');
    }
    if (requirement.toLowerCase().includes('integration')) {
      risks.push('Integration complexity may cause delays');
    }
    if (requirement.toLowerCase().includes('user') || requirement.toLowerCase().includes('interface')) {
      risks.push('User acceptance may vary');
    }

    return risks;
  }

  private isTestable(requirement: string): boolean {
    const testableIndicators = ['measure', 'verify', 'test', 'check', 'validate', 'must', 'shall'];
    return testableIndicators.some(indicator => requirement.toLowerCase().includes(indicator));
  }

  private buildGlossary(requirements: string[]): Record<string, string> {
    // Extract domain-specific terms and provide definitions
    return {
      'user': 'End user of the system',
      'system': 'The software application being developed',
      'response time': 'Time taken for system to respond to user action'
    };
  }

  private extractAssumptions(context: SpecificationContext): string[] {
    return [
      'Users have basic computer literacy',
      'System will be deployed in standard environment',
      'Required infrastructure is available'
    ];
  }

  private defineSuccessCriteria(requirements: Requirement[]): string[] {
    return [
      'All high-priority requirements implemented',
      'System passes all acceptance tests',
      'Performance meets specified criteria',
      'Security requirements verified'
    ];
  }

  private defineQualityAttributes(): Record<string, any> {
    return {
      maintainability: { target: 0.8, metric: 'code_quality_score' },
      reliability: { target: 0.95, metric: 'uptime_percentage' },
      performance: { target: '< 2s', metric: 'response_time' },
      usability: { target: 0.85, metric: 'user_satisfaction' }
    };
  }

  private calculateSpecificationCompleteness(requirements: Requirement[]): number {
    const requiredFields = ['description', 'acceptance_criteria', 'priority', 'type'];
    let totalCompleteness = 0;

    requirements.forEach(req => {
      let fieldCompleteness = 0;
      requiredFields.forEach(field => {
        if (req[field as keyof Requirement] &&
            (Array.isArray(req[field as keyof Requirement]) ?
             (req[field as keyof Requirement] as any[]).length > 0 :
             req[field as keyof Requirement])) {
          fieldCompleteness++;
        }
      });
      totalCompleteness += fieldCompleteness / requiredFields.length;
    });

    return requirements.length > 0 ? totalCompleteness / requirements.length : 0;
  }

  protected generateId(): string {
    return `spec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  buildReasoning(
    factors: ReasoningFactor[],
    heuristics: string[],
    evidence: Evidence[]
  ): ExplainableReasoning {
    return {
      factors,
      heuristics: heuristics as any,
      evidence,
      assumptions: ['Clear requirements lead to better implementation', 'Stakeholder input is accurate'],
      limitations: ['Requirements may evolve during development', 'Perfect clarity is difficult to achieve']
    };
  }
}