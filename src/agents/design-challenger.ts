/**
 * Design Challenger Agent
 * Questions design decisions and proposes alternative approaches for better quality
 */

import { BaseAgent } from './base-agent';
import {
  AgentId,
  AgentConfig,
  AgentDecision,
  TaskDefinition,
  RSTHeuristic,
  ReasoningFactor,
  Evidence,
  ExplainableReasoning,
  PACTLevel,
  SecurityLevel,
  ILogger,
  IEventBus,
  IMemorySystem,
  Alternative,
  Risk
} from '../core/types';

export interface DesignDecision {
  id: string;
  title: string;
  description: string;
  category: 'architectural' | 'algorithmic' | 'data-structure' | 'interface' | 'security' | 'performance';
  rationale: string;
  alternatives: DesignAlternative[];
  context: DesignContext;
  assumptions: string[];
  constraints: string[];
  tradeoffs: Tradeoff[];
  qualityImpact: QualityImpact;
}

export interface DesignAlternative {
  id: string;
  name: string;
  description: string;
  pros: string[];
  cons: string[];
  complexity: 'low' | 'medium' | 'high';
  feasibility: number; // 0-1
  qualityScore: number; // 0-1
  implementationEffort: 'small' | 'medium' | 'large';
  riskLevel: 'low' | 'medium' | 'high';
  evidence: Evidence[];
}

export interface DesignContext {
  domain: string;
  scale: 'small' | 'medium' | 'large' | 'enterprise';
  criticality: 'low' | 'medium' | 'high' | 'mission-critical';
  timeline: string;
  budget: 'limited' | 'moderate' | 'flexible';
  team: {
    size: number;
    experience: 'junior' | 'mixed' | 'senior';
    expertise: string[];
  };
  technology: {
    stack: string[];
    constraints: string[];
    preferences: string[];
  };
}

export interface Tradeoff {
  dimension1: string;
  dimension2: string;
  description: string;
  impact: 'minor' | 'moderate' | 'significant';
  mitigation?: string;
}

export interface QualityImpact {
  maintainability: number; // -1 to 1
  performance: number;
  reliability: number;
  security: number;
  usability: number;
  testability: number;
  overall: number;
}

export interface Challenge {
  id: string;
  type: 'question' | 'alternative' | 'concern' | 'improvement';
  title: string;
  description: string;
  severity: 'info' | 'minor' | 'major' | 'critical';
  category: string;
  evidence: Evidence[];
  recommendations: Recommendation[];
  impact: QualityImpact;
  confidence: number;
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  effort: 'small' | 'medium' | 'large';
  benefits: string[];
  risks: string[];
  implementation: ImplementationGuidance;
}

export interface ImplementationGuidance {
  steps: string[];
  timeline: string;
  resources: string[];
  dependencies: string[];
  successCriteria: string[];
}

export interface ChallengeSession {
  id: string;
  target: string;
  startTime: Date;
  endTime?: Date;
  participants: string[];
  decisions: DesignDecision[];
  challenges: Challenge[];
  outcomes: SessionOutcome[];
  followUp: string[];
}

export interface SessionOutcome {
  type: 'decision-modified' | 'alternative-adopted' | 'risk-mitigated' | 'no-action';
  description: string;
  rationale: string;
  impact: string;
}

export class DesignChallengerAgent extends BaseAgent {
  private challengePatterns: Map<string, any> = new Map();
  private designPrinciples: Map<string, any> = new Map();
  private qualityHeuristics: Map<string, any> = new Map();
  private challengeSessions: Map<string, ChallengeSession> = new Map();
  private alternativeLibrary: Map<string, DesignAlternative[]> = new Map();
  private challengeHistory: Challenge[] = [];
  private challengingStyle = 'socratic'; // socratic, devil's-advocate, collaborative

  constructor(
    id: AgentId,
    config: AgentConfig,
    logger: ILogger,
    eventBus: IEventBus,
    memory: IMemorySystem
  ) {
    super(id, config, logger, eventBus, memory);
  }

  protected async initializeResources(): Promise<void> {
    await super.initializeResources();
    this.initializeChallengePatterns();
    this.initializeDesignPrinciples();
    this.initializeQualityHeuristics();
  }

  protected async perceive(context: any): Promise<any> {
    this.logger.info(`Design Challenger perceiving context for ${context.designTarget || 'unknown design'}`);

    // Analyze design decisions
    const designAnalysis = await this.analyzeDesignDecisions(context.design);
    
    // Identify assumptions and constraints
    const assumptionAnalysis = await this.analyzeAssumptions(context.design);
    
    // Assess quality implications
    const qualityAssessment = await this.assessQualityImplications(context.design);
    
    // Identify potential alternatives
    const alternativeOpportunities = await this.identifyAlternativeOpportunities(context.design);
    
    // Analyze context and constraints
    const contextAnalysis = await this.analyzeDesignContext(context);
    
    // Identify challenging opportunities
    const challengeOpportunities = await this.identifyChallengingOpportunities(designAnalysis, qualityAssessment);

    return {
      designAnalysis,
      assumptionAnalysis,
      qualityAssessment,
      alternativeOpportunities,
      contextAnalysis,
      challengeOpportunities,
      riskFactors: await this.identifyRiskFactors(context.design)
    };
  }

  protected async decide(observation: any): Promise<AgentDecision> {
    const decisionId = this.generateDecisionId();
    
    // Determine challenging strategy
    const challengeStrategy = await this.determineChallengeStrategy(observation);
    
    // Select challenge priorities
    const challengePriorities = await this.selectChallengePriorities(observation.challengeOpportunities);
    
    // Plan challenge session
    const sessionPlan = await this.planChallengeSession(observation, challengeStrategy);
    
    // Prepare alternatives
    const alternativePreparation = await this.prepareAlternatives(observation.alternativeOpportunities);
    
    // Apply RST heuristics for design challenging
    const heuristics = this.applyDesignChallengeHeuristics(observation);
    
    // Build reasoning factors
    const factors: ReasoningFactor[] = [
      {
        name: 'design_complexity',
        weight: 0.25,
        value: observation.designAnalysis.complexity,
        impact: 'high',
        explanation: 'Design complexity affects maintainability and development velocity'
      },
      {
        name: 'quality_risk',
        weight: 0.3,
        value: observation.qualityAssessment.riskLevel,
        impact: 'critical',
        explanation: 'Quality risks can impact system reliability and user satisfaction'
      },
      {
        name: 'assumption_count',
        weight: 0.2,
        value: observation.assumptionAnalysis.unvalidatedCount,
        impact: 'medium',
        explanation: 'Unvalidated assumptions introduce uncertainty and potential failures'
      },
      {
        name: 'alternative_potential',
        weight: 0.25,
        value: observation.alternativeOpportunities.score,
        impact: 'medium',
        explanation: 'Alternative approaches may offer better solutions'
      }
    ];

    const evidence: Evidence[] = [
      {
        type: 'analytical',
        source: 'design_analysis',
        confidence: 0.9,
        description: `${observation.designAnalysis.decisionCount} design decisions identified for review`,
        details: observation.designAnalysis
      },
      {
        type: 'analytical',
        source: 'quality_assessment',
        confidence: 0.8,
        description: `Overall quality score: ${observation.qualityAssessment.overallScore}`,
        details: observation.qualityAssessment
      }
    ];

    const reasoning = this.buildReasoning(
      factors,
      heuristics,
      evidence,
      ['Design documentation is available', 'Context information is sufficient for analysis'],
      ['Some design rationale may be implicit', 'Alternative feasibility depends on team capabilities']
    );

    const alternatives: Alternative[] = await this.generateAlternatives(observation);
    const risks: Risk[] = await this.identifyChallengingRisks(observation);

    return {
      id: decisionId,
      agentId: this.id.id,
      timestamp: new Date(),
      action: 'execute_design_challenge',
      reasoning,
      confidence: this.calculateChallengingConfidence(observation),
      alternatives,
      risks,
      recommendations: [
        'Review design decisions systematically',
        'Validate key assumptions',
        'Consider alternative approaches'
      ]
    };
  }

  protected async act(decision: AgentDecision): Promise<any> {
    this.logger.info(`Design Challenger executing: ${decision.action}`);

    const action = decision.action;
    const results = {
      sessionId: this.generateSessionId(),
      challengesRaised: 0,
      decisionsQuestioned: 0,
      alternativesProposed: 0,
      qualityImprovements: [] as any[],
      challengesSummary: [] as Challenge[],
      recommendations: [] as string[],
      sessionOutcomes: [] as SessionOutcome[],
      participantFeedback: [] as any[],
      followUpActions: [] as string[],
      qualityImpact: null as any
    };

    try {
      // Start challenge session
      const session = await this.startChallengeSession(decision.reasoning);

      // Execute design challenges
      const challengeResults = await this.executeDesignChallenges(decision.reasoning);
      results.challengesRaised = challengeResults.length;
      results.challengesSummary = challengeResults;

      // Generate alternatives
      results.alternativesProposed = decision.alternatives.length;
      results.recommendations = decision.recommendations;
      
      // Assess quality improvements
      const qualityAnalysis = this.assessSessionQualityImpact(results.challengesSummary);
      results.qualityImprovements = qualityAnalysis.improvements;
      results.qualityImpact = qualityAnalysis.impact;

      // Capture session outcomes
      results.sessionOutcomes = await this.captureSessionOutcomes(session, results);

      // Plan follow-up actions
      results.followUpActions = await this.planFollowUpActions(results.sessionOutcomes);

      // End session
      await this.endChallengeSession(session);

      // Update agent metrics
      this.updateChallengeMetrics(results);

      // Store action result in memory
      await this.memory.store(`design-challenger:action:${decision.id}`, {
        decision,
        results,
        timestamp: new Date()
      }, {
        type: 'artifact' as const,
        tags: ['design', 'challenge', 'action'],
        partition: 'design'
      });
      
      // Store challenge results in shared memory
      await this.memory.store(`design-challenge:results:${results.sessionId}`, {
        type: 'design_challenge_results',
        sessionId: results.sessionId,
        challengesRaised: results.challengesRaised,
        qualityImpact: results.qualityImpact,
        keyRecommendations: results.recommendations.slice(0, 3)
      }, {
        type: 'artifact' as const,
        tags: ['design-review', 'quality-improvement', 'architecture'],
        partition: 'knowledge'
      });

      return results;
      
    } catch (error) {
      this.logger.error('Design challenging session failed:', error as Error);
      const err = error instanceof Error ? error : new Error(String(error)); throw err;
    }
  }

  protected async learn(feedback: any): Promise<void> {
    // Learn from challenge effectiveness
    await this.learnFromChallengeEffectiveness(feedback.challengeResults);
    
    // Learn from alternative adoption
    await this.learnFromAlternativeAdoption(feedback.alternativeOutcomes);
    
    // Learn from team response
    await this.learnFromTeamResponse(feedback.teamFeedback);
    
    // Update challenging patterns
    await this.updateChallengingPatterns(feedback.patterns);
    
    // Improve questioning techniques
    await this.improveQuestioningTechniques(feedback.questioningEffectiveness);
  }

  private initializeChallengePatterns(): void {
    const patterns = [
      {
        name: 'assumption-validation',
        trigger: 'unvalidated-assumption',
        question: 'What evidence supports this assumption?',
        alternatives: ['validate-through-prototype', 'research-similar-cases', 'gather-user-feedback']
      },
      {
        name: 'complexity-questioning',
        trigger: 'high-complexity-solution',
        question: 'Is there a simpler approach that achieves the same goal?',
        alternatives: ['decompose-problem', 'use-existing-patterns', 'reduce-scope']
      },
      {
        name: 'scalability-challenge',
        trigger: 'potential-bottleneck',
        question: 'How will this perform under 10x load?',
        alternatives: ['horizontal-scaling', 'caching-strategy', 'async-processing']
      },
      {
        name: 'maintainability-concern',
        trigger: 'complex-coupling',
        question: 'How easily can this be modified or extended?',
        alternatives: ['dependency-injection', 'plugin-architecture', 'modular-design']
      },
      {
        name: 'security-scrutiny',
        trigger: 'security-sensitive-area',
        question: 'What are the potential attack vectors?',
        alternatives: ['defense-in-depth', 'zero-trust', 'principle-of-least-privilege']
      }
    ];

    patterns.forEach(pattern => this.challengePatterns.set(pattern.name, pattern));
  }

  private initializeDesignPrinciples(): void {
    const principles = [
      {
        name: 'SOLID',
        description: 'Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion',
        categories: ['architectural', 'maintainability']
      },
      {
        name: 'DRY',
        description: 'Don\'t Repeat Yourself',
        categories: ['maintainability', 'consistency']
      },
      {
        name: 'KISS',
        description: 'Keep It Simple, Stupid',
        categories: ['simplicity', 'maintainability']
      },
      {
        name: 'YAGNI',
        description: 'You Aren\'t Gonna Need It',
        categories: ['simplicity', 'performance']
      },
      {
        name: 'Separation of Concerns',
        description: 'Different aspects should be separated into distinct modules',
        categories: ['architectural', 'maintainability']
      },
      {
        name: 'Fail Fast',
        description: 'Detect and report failures as early as possible',
        categories: ['reliability', 'debugging']
      }
    ];

    principles.forEach(principle => this.designPrinciples.set(principle.name, principle));
  }

  private initializeQualityHeuristics(): void {
    const heuristics = [
      {
        name: 'coupling-cohesion',
        description: 'Low coupling, high cohesion',
        assessment: (design: any) => this.assessCouplingCohesion(design)
      },
      {
        name: 'performance-implications',
        description: 'Consider performance impact of design decisions',
        assessment: (design: any) => this.assessPerformanceImplications(design)
      },
      {
        name: 'testability',
        description: 'Design should facilitate easy testing',
        assessment: (design: any) => this.assessTestability(design)
      },
      {
        name: 'error-handling',
        description: 'Comprehensive error handling strategy',
        assessment: (design: any) => this.assessErrorHandling(design)
      },
      {
        name: 'extensibility',
        description: 'Design should accommodate future changes',
        assessment: (design: any) => this.assessExtensibility(design)
      }
    ];

    heuristics.forEach(heuristic => this.qualityHeuristics.set(heuristic.name, heuristic));
  }

  private async analyzeDesignDecisions(design: any): Promise<any> {
    return {
      decisionCount: this.countDesignDecisions(design),
      categories: this.categorizeDecisions(design),
      complexity: this.assessDesignComplexity(design),
      patterns: this.identifyDesignPatterns(design),
      antiPatterns: this.identifyAntiPatterns(design),
      documentation: this.assessDocumentation(design)
    };
  }

  private async analyzeAssumptions(design: any): Promise<any> {
    const assumptions = this.extractAssumptions(design);
    
    return {
      totalCount: assumptions.length,
      validatedCount: assumptions.filter(a => a.validated).length,
      unvalidatedCount: assumptions.filter(a => !a.validated).length,
      riskLevel: this.assessAssumptionRisk(assumptions),
      categories: this.categorizeAssumptions(assumptions)
    };
  }

  private async assessQualityImplications(design: any): Promise<any> {
    const qualityScores: any = {};
    
    for (const [name, heuristic] of this.qualityHeuristics.entries()) {
      qualityScores[name] = heuristic.assessment(design);
    }
    
    return {
      scores: qualityScores,
      overallScore: this.calculateOverallQualityScore(qualityScores),
      riskLevel: this.calculateQualityRiskLevel(qualityScores),
      strengths: this.identifyQualityStrengths(qualityScores),
      weaknesses: this.identifyQualityWeaknesses(qualityScores)
    };
  }

  private async identifyAlternativeOpportunities(design: any): Promise<any> {
    return {
      score: this.calculateAlternativeScore(design),
      opportunities: this.findAlternativeOpportunities(design),
      feasibilityAnalysis: this.assessAlternativeFeasibility(design),
      impactAssessment: this.assessAlternativeImpact(design)
    };
  }

  private async analyzeDesignContext(context: any): Promise<DesignContext> {
    return {
      domain: context.domain || 'general',
      scale: this.determineScale(context),
      criticality: this.determineCriticality(context),
      timeline: context.timeline || 'moderate',
      budget: this.determineBudget(context),
      team: {
        size: context.team?.size || 5,
        experience: this.assessTeamExperience(context.team),
        expertise: context.team?.expertise || ['general']
      },
      technology: {
        stack: context.technology?.stack || [],
        constraints: context.technology?.constraints || [],
        preferences: context.technology?.preferences || []
      }
    };
  }

  private async identifyChallengingOpportunities(designAnalysis: any, qualityAssessment: any): Promise<any[]> {
    const opportunities = [];
    
    // High complexity areas
    if (designAnalysis.complexity > 0.7) {
      opportunities.push({
        type: 'complexity-reduction',
        priority: 'high',
        description: 'Question high complexity design decisions',
        target: designAnalysis.patterns.complex
      });
    }
    
    // Low quality scores
    for (const [aspect, score] of Object.entries(qualityAssessment.scores)) {
      if (typeof score === 'number' && score < 0.6) {
        opportunities.push({
          type: 'quality-improvement',
          priority: 'medium',
          description: `Challenge decisions affecting ${aspect}`,
          target: aspect
        });
      }
    }
    
    // Anti-patterns
    if (designAnalysis.antiPatterns.length > 0) {
      opportunities.push({
        type: 'anti-pattern-elimination',
        priority: 'high',
        description: 'Address identified anti-patterns',
        target: designAnalysis.antiPatterns
      });
    }
    
    return opportunities;
  }

  private async identifyRiskFactors(design: any): Promise<any[]> {
    return [
      {
        factor: 'high-coupling',
        impact: 'maintainability',
        likelihood: 'medium',
        mitigation: 'Introduce abstractions and interfaces'
      },
      {
        factor: 'performance-bottleneck',
        impact: 'scalability',
        likelihood: 'low',
        mitigation: 'Implement caching and optimization strategies'
      }
    ];
  }

  private applyDesignChallengeHeuristics(observation: any): RSTHeuristic[] {
    const heuristics: RSTHeuristic[] = ['SFDIPOT']; // Structure, Function, Data focus
    
    if (observation.qualityAssessment.riskLevel > 0.7) {
      heuristics.push('RCRCRC'); // Risk-based for high-risk designs
    }
    
    if (observation.designAnalysis.complexity > 0.8) {
      heuristics.push('FEW_HICCUPPS'); // Comprehensive for complex designs
    }
    
    return heuristics;
  }

  private async determineChallengeStrategy(observation: any): Promise<string> {
    if (observation.contextAnalysis.team.experience === 'senior') {
      return 'collaborative-questioning';
    }
    if (observation.qualityAssessment.riskLevel > 0.8) {
      return 'devil-advocate';
    }
    if (observation.designAnalysis.complexity > 0.7) {
      return 'socratic-method';
    }
    return 'constructive-inquiry';
  }

  private async selectChallengePriorities(challengeOpportunities: any[]): Promise<any[]> {
    return challengeOpportunities
      .sort((a, b) => this.prioritizeChallenge(a) - this.prioritizeChallenge(b))
      .slice(0, 5); // Focus on top 5 priorities
  }

  private async planChallengeSession(observation: any, strategy: string): Promise<any> {
    return {
      strategy,
      targetDecisions: this.selectTargetDecisions(observation.designAnalysis),
      questioningApproach: this.selectQuestioningApproach(strategy),
      duration: this.estimateSessionDuration(observation),
      participants: this.identifyParticipants(observation.contextAnalysis),
      agenda: this.createSessionAgenda(observation)
    };
  }

  private async prepareAlternatives(alternativeOpportunities: any): Promise<any> {
    return {
      researchedAlternatives: this.researchAlternatives(alternativeOpportunities.opportunities),
      feasibilityAnalysis: alternativeOpportunities.feasibilityAnalysis,
      impactAnalysis: alternativeOpportunities.impactAssessment,
      implementationGuidance: this.prepareImplementationGuidance(alternativeOpportunities)
    };
  }

  private calculateChallengingConfidence(observation: any): number {
    let confidence = 0.5;
    
    // Boost confidence for clear quality issues
    if (observation.qualityAssessment.weaknesses.length > 0) {
      confidence += 0.2;
    }
    
    // Boost confidence for well-documented design
    if (observation.designAnalysis.documentation > 0.7) {
      confidence += 0.15;
    }
    
    // Reduce confidence for very simple designs
    if (observation.designAnalysis.complexity < 0.3) {
      confidence -= 0.1;
    }
    
    return Math.max(0, Math.min(1, confidence));
  }

  private async generateAlternatives(observation: any): Promise<any[]> {
    return [
      {
        description: 'Code review with focus on design patterns',
        confidence: 0.7,
        tradeoffs: 'Less systematic but more familiar to teams'
      },
      {
        description: 'Formal architecture review board',
        confidence: 0.8,
        tradeoffs: 'More thorough but slower and more bureaucratic'
      },
      {
        description: 'Pair design sessions with senior architects',
        confidence: 0.75,
        tradeoffs: 'Good knowledge transfer but resource intensive'
      }
    ];
  }

  private async identifyChallengingRisks(observation: any): Promise<any[]> {
    return [
      {
        description: 'Challenging may be perceived as obstructionist',
        probability: 0.3,
        impact: 'medium',
        mitigation: 'Frame challenges as collaborative improvement opportunities'
      },
      {
        description: 'Alternatives may not be feasible within constraints',
        probability: 0.4,
        impact: 'low',
        mitigation: 'Thoroughly assess feasibility before proposing alternatives'
      },
      {
        description: 'Session may lead to analysis paralysis',
        probability: 0.2,
        impact: 'medium',
        mitigation: 'Set clear time boundaries and decision deadlines'
      }
    ];
  }

  private estimateChallengingDuration(sessionPlan: any): number {
    const baseTime = 3600000; // 1 hour
    const complexityMultiplier = sessionPlan.targetDecisions.length * 0.2;
    const strategyMultiplier = sessionPlan.strategy === 'socratic-method' ? 1.5 : 1.2;
    
    return baseTime * (1 + complexityMultiplier) * strategyMultiplier;
  }

  private async startChallengeSession(sessionPlan: any): Promise<ChallengeSession> {
    const session: ChallengeSession = {
      id: this.generateSessionId(),
      target: sessionPlan.targetDecisions.join(', '),
      startTime: new Date(),
      participants: sessionPlan.participants,
      decisions: [],
      challenges: [],
      outcomes: [],
      followUp: []
    };
    
    this.challengeSessions.set(session.id, session);
    
    await this.memory.store(`challenge-session:${session.id}`, session, {
      type: 'artifact' as const,
      tags: ['design-challenge', sessionPlan.strategy],
      partition: 'sessions'
    });
    
    return session;
  }

  private async executeChallenge(priority: any, strategy: string): Promise<any> {
    const challenges = [];
    let challengeCount = 0;
    let alternativeCount = 0;
    
    // Apply appropriate challenge pattern
    const pattern = this.selectChallengePattern(priority.type);
    
    if (pattern) {
      const challenge = await this.applyChallengePattern(pattern, priority, strategy);
      challenges.push(challenge);
      challengeCount++;
      
      // Challenge interface doesn't have alternatives property
      // alternativeCount += (challenge as any).alternatives?.length || 0;
    }
    
    return {
      challengeCount,
      alternativeCount,
      challenges
    };
  }

  private async questionDesignDecisions(targetDecisions: any[]): Promise<Challenge[]> {
    const challenges: Challenge[] = [];
    
    for (const decision of targetDecisions) {
      const challenge = await this.createDecisionChallenge(decision);
      challenges.push(challenge);
    }
    
    return challenges;
  }

  private async proposeAlternatives(alternativePreparation: any): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];
    
    for (const alternative of alternativePreparation.researchedAlternatives) {
      const recommendation = this.createAlternativeRecommendation(alternative, alternativePreparation);
      recommendations.push(recommendation);
    }
    
    return recommendations;
  }

  private async assessQualityImprovements(challenges: Challenge[]): Promise<any> {
    const improvements = [];
    let overallImpact = { overall: 0, maintainability: 0, performance: 0, reliability: 0, security: 0, usability: 0, testability: 0 };
    
    for (const challenge of challenges) {
      if (challenge.type === 'improvement' || challenge.type === 'alternative') {
        improvements.push({
          area: challenge.category,
          description: challenge.description,
          impact: challenge.impact
        });
        
        // Aggregate impact
        for (const [key, value] of Object.entries(challenge.impact)) {
          overallImpact[key as keyof typeof overallImpact] += value;
        }
      }
    }
    
    // Normalize impact
    const challengeCount = challenges.length;
    if (challengeCount > 0) {
      for (const key of Object.keys(overallImpact)) {
        overallImpact[key as keyof typeof overallImpact] /= challengeCount;
      }
    }
    
    return {
      improvements,
      impact: overallImpact
    };
  }

  private async generateRecommendations(challenges: Challenge[], qualityAnalysis: any): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];
    
    // Generate recommendations from high-severity challenges
    const criticalChallenges = challenges.filter(c => c.severity === 'critical' || c.severity === 'major');
    
    for (const challenge of criticalChallenges) {
      recommendations.push(...challenge.recommendations);
    }
    
    // Generate strategic recommendations from quality analysis
    if (qualityAnalysis.impact.maintainability < -0.2) {
      recommendations.push({
        id: this.generateRecommendationId(),
        title: 'Improve Design Maintainability',
        description: 'Address design decisions that negatively impact maintainability',
        priority: 'high',
        effort: 'medium',
        benefits: ['Easier future modifications', 'Reduced technical debt'],
        risks: ['Requires refactoring existing code'],
        implementation: {
          steps: ['Identify coupling points', 'Introduce abstractions', 'Refactor incrementally'],
          timeline: '2-3 sprints',
          resources: ['Senior developer', 'Architecture review'],
          dependencies: ['Team alignment', 'Regression testing'],
          successCriteria: ['Reduced coupling metrics', 'Improved code review feedback']
        }
      });
    }
    
    return recommendations.slice(0, 10); // Limit to top 10
  }

  private async captureSessionOutcomes(session: ChallengeSession, results: any): Promise<SessionOutcome[]> {
    const outcomes: SessionOutcome[] = [];
    
    // Mock session outcomes based on results
    if (results.challengesRaised > 0) {
      outcomes.push({
        type: 'decision-modified',
        description: `${results.challengesRaised} design decisions reviewed and improved`,
        rationale: 'Challenges revealed areas for improvement',
        impact: 'Improved overall design quality'
      });
    }
    
    if (results.alternativesProposed > 0) {
      outcomes.push({
        type: 'alternative-adopted',
        description: `${results.alternativesProposed} alternatives considered`,
        rationale: 'Alternative approaches provided better quality characteristics',
        impact: 'Enhanced solution robustness'
      });
    }
    
    session.outcomes = outcomes;
    return outcomes;
  }

  private async planFollowUpActions(sessionOutcomes: SessionOutcome[]): Promise<string[]> {
    const actions = [];
    
    for (const outcome of sessionOutcomes) {
      switch (outcome.type) {
        case 'decision-modified':
          actions.push('Update design documentation with modified decisions');
          actions.push('Communicate changes to implementation team');
          break;
        case 'alternative-adopted':
          actions.push('Prototype alternative approaches');
          actions.push('Update project timeline for implementation changes');
          break;
        case 'risk-mitigated':
          actions.push('Implement risk mitigation strategies');
          actions.push('Monitor risk indicators');
          break;
      }
    }
    
    return actions;
  }

  private async endChallengeSession(session: ChallengeSession): Promise<void> {
    session.endTime = new Date();
    
    await this.memory.store(`challenge-session:${session.id}:completed`, session, {
      type: 'artifact' as const,
      tags: ['design-challenge', 'completed'],
      partition: 'sessions'
    });
  }

  private updateChallengeMetrics(results: any): void {
    // Update challenge history
    this.challengeHistory.push(...results.challengesSummary);
    
    // Update general agent metrics
    this.metrics.requirementsAnalyzed += results.decisionsQuestioned;
    this.metrics.risksIdentified += results.challengesRaised;
    
    // Calculate success rate based on quality improvements
    const improvementScore = results.qualityImpact?.overall > 0 ? 1 : 0;
    this.metrics.successRate = (this.metrics.successRate + improvementScore) / 2;
  }

  // Helper methods for various assessments and calculations
  private countDesignDecisions(design: any): number {
    return 5; // Mock count
  }

  private categorizeDecisions(design: any): any {
    return {
      architectural: 2,
      algorithmic: 1,
      'data-structure': 1,
      interface: 1
    };
  }

  private assessDesignComplexity(design: any): number {
    return 0.6; // Mock complexity
  }

  private identifyDesignPatterns(design: any): any {
    return {
      identified: ['singleton', 'observer'],
      complex: ['observer']
    };
  }

  private identifyAntiPatterns(design: any): string[] {
    return ['god-object']; // Mock anti-patterns
  }

  private assessDocumentation(design: any): number {
    return 0.7; // Mock documentation score
  }

  private extractAssumptions(design: any): any[] {
    return [
      { assumption: 'Users will have stable internet', validated: false },
      { assumption: 'Database will handle 1000 concurrent users', validated: true }
    ];
  }

  private assessAssumptionRisk(assumptions: any[]): number {
    const unvalidated = assumptions.filter(a => !a.validated).length;
    return Math.min(1, unvalidated / assumptions.length);
  }

  private categorizeAssumptions(assumptions: any[]): any {
    return {
      technical: 1,
      business: 1,
      user: 0
    };
  }

  // Quality assessment methods
  private assessCouplingCohesion(design: any): number {
    return 0.7; // Mock assessment
  }

  private assessPerformanceImplications(design: any): number {
    return 0.8; // Mock assessment
  }

  private assessTestability(design: any): number {
    return 0.6; // Mock assessment
  }

  private assessErrorHandling(design: any): number {
    return 0.5; // Mock assessment
  }

  private assessExtensibility(design: any): number {
    return 0.8; // Mock assessment
  }

  private calculateOverallQualityScore(qualityScores: any): number {
    const scores = Object.values(qualityScores) as number[];
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  private calculateQualityRiskLevel(qualityScores: any): number {
    const minScore = Math.min(...Object.values(qualityScores) as number[]);
    return 1 - minScore; // Higher risk for lower scores
  }

  private identifyQualityStrengths(qualityScores: any): string[] {
    const strengths = [];
    for (const [aspect, score] of Object.entries(qualityScores)) {
      if ((score as number) > 0.8) {
        strengths.push(aspect);
      }
    }
    return strengths;
  }

  private identifyQualityWeaknesses(qualityScores: any): string[] {
    const weaknesses = [];
    for (const [aspect, score] of Object.entries(qualityScores)) {
      if ((score as number) < 0.6) {
        weaknesses.push(aspect);
      }
    }
    return weaknesses;
  }

  private calculateAlternativeScore(design: any): number {
    return 0.7; // Mock score
  }

  private findAlternativeOpportunities(design: any): any[] {
    return [
      { area: 'data-storage', opportunity: 'NoSQL instead of relational' },
      { area: 'caching', opportunity: 'Redis instead of in-memory' }
    ];
  }

  private assessAlternativeFeasibility(design: any): any {
    return { overall: 0.8, technical: 0.9, resource: 0.7 };
  }

  private assessAlternativeImpact(design: any): any {
    return { quality: 0.3, performance: 0.5, complexity: -0.2 };
  }

  private determineScale(context: any): 'small' | 'medium' | 'large' | 'enterprise' {
    const userCount = context.expectedUsers || 1000;
    if (userCount > 100000) return 'enterprise';
    if (userCount > 10000) return 'large';
    if (userCount > 1000) return 'medium';
    return 'small';
  }

  private determineCriticality(context: any): 'low' | 'medium' | 'high' | 'mission-critical' {
    return context.criticality || 'medium';
  }

  private determineBudget(context: any): 'limited' | 'moderate' | 'flexible' {
    return context.budget || 'moderate';
  }

  private assessTeamExperience(team: any): 'junior' | 'mixed' | 'senior' {
    return team?.experience || 'mixed';
  }

  private prioritizeChallenge(challenge: any): number {
    const priorities = { critical: 1, major: 2, minor: 3, info: 4 };
    const typePriorities = { 'anti-pattern-elimination': 1, 'quality-improvement': 2, 'complexity-reduction': 3 };
    
    return (priorities[challenge.severity as keyof typeof priorities] || 4) + 
           (typePriorities[challenge.type as keyof typeof typePriorities] || 4);
  }

  private selectTargetDecisions(designAnalysis: any): any[] {
    // Select the most complex or risky decisions
    return [
      { id: 'arch-001', description: 'Microservices vs Monolith', complexity: 0.8 },
      { id: 'data-001', description: 'Database selection', complexity: 0.6 }
    ];
  }

  private selectQuestioningApproach(strategy: string): string {
    const approaches = {
      'socratic-method': 'guided-questioning',
      'devil-advocate': 'contrarian-probing',
      'collaborative-questioning': 'team-inquiry',
      'constructive-inquiry': 'solution-focused'
    };
    
    return approaches[strategy as keyof typeof approaches] || 'general-questioning';
  }

  private estimateSessionDuration(observation: any): number {
    return 2; // 2 hours
  }

  private identifyParticipants(contextAnalysis: DesignContext): string[] {
    const participants = ['architect', 'lead-developer'];
    
    if (contextAnalysis.team.size > 5) {
      participants.push('product-manager');
    }
    
    if (contextAnalysis.criticality === 'mission-critical') {
      participants.push('senior-architect');
    }
    
    return participants;
  }

  private createSessionAgenda(observation: any): string[] {
    return [
      'Review design decisions and rationale',
      'Challenge key assumptions',
      'Explore alternative approaches',
      'Assess quality implications',
      'Document outcomes and next steps'
    ];
  }

  private researchAlternatives(opportunities: any[]): any[] {
    return opportunities.map(opp => ({
      ...opp,
      researched: true,
      feasibility: 0.7,
      pros: ['Better performance', 'Lower cost'],
      cons: ['Higher complexity', 'Team learning curve']
    }));
  }

  private prepareImplementationGuidance(alternativeOpportunities: any): any {
    return {
      planning: 'Define clear migration strategy',
      execution: 'Implement incrementally with rollback plan',
      validation: 'Measure impact on quality metrics'
    };
  }

  private selectChallengePattern(challengeType: string): any {
    const patternMap = {
      'complexity-reduction': 'complexity-questioning',
      'quality-improvement': 'assumption-validation',
      'anti-pattern-elimination': 'maintainability-concern'
    };
    
    const patternName = patternMap[challengeType as keyof typeof patternMap];
    return patternName ? this.challengePatterns.get(patternName) : null;
  }

  private async applyChallengePattern(pattern: any, priority: any, strategy: string): Promise<Challenge> {
    return {
      id: this.generateChallengeId(),
      type: 'question',
      title: `Challenge: ${priority.description}`,
      description: pattern.question,
      severity: priority.priority === 'high' ? 'major' : 'minor',
      category: priority.type,
      evidence: [],
      recommendations: pattern.alternatives.map((alt: string) => ({
        id: this.generateRecommendationId(),
        title: alt,
        description: `Consider ${alt} as an alternative approach`,
        priority: 'medium',
        effort: 'medium',
        benefits: ['Improved quality'],
        risks: ['Implementation complexity'],
        implementation: {
          steps: [`Research ${alt}`, 'Prototype solution', 'Evaluate results'],
          timeline: '2 weeks',
          resources: ['Developer time'],
          dependencies: [],
          successCriteria: ['Improved quality metrics']
        }
      })),
      impact: {
        maintainability: 0.2,
        performance: 0.1,
        reliability: 0.1,
        security: 0.0,
        usability: 0.0,
        testability: 0.1,
        overall: 0.1
      },
      confidence: 0.8
    };
  }

  private async createDecisionChallenge(decision: any): Promise<Challenge> {
    return {
      id: this.generateChallengeId(),
      type: 'question',
      title: `Question: ${decision.description}`,
      description: `What alternatives were considered for ${decision.description}?`,
      severity: 'minor',
      category: 'decision-rationale',
      evidence: [],
      recommendations: [],
      impact: {
        maintainability: 0.1,
        performance: 0.0,
        reliability: 0.0,
        security: 0.0,
        usability: 0.0,
        testability: 0.0,
        overall: 0.05
      },
      confidence: 0.7
    };
  }

  private createAlternativeRecommendation(alternative: any, preparation: any): Recommendation {
    return {
      id: this.generateRecommendationId(),
      title: `Alternative: ${alternative.area}`,
      description: alternative.opportunity,
      priority: 'medium',
      effort: 'medium',
      benefits: alternative.pros || ['Improved design'],
      risks: alternative.cons || ['Implementation risk'],
      implementation: {
        steps: ['Evaluate feasibility', 'Create proof of concept', 'Implement gradually'],
        timeline: '3-4 weeks',
        resources: ['Development team', 'Architecture review'],
        dependencies: ['Stakeholder approval'],
        successCriteria: ['Quality metrics improvement']
      }
    };
  }

  // Learning methods
  private async learnFromChallengeEffectiveness(challengeResults: any): Promise<void> {
    await this.memory.store('challenge-learning:effectiveness', {
      challengesRaised: challengeResults?.count || 0,
      adoption: challengeResults?.adoptionRate || 0.5,
      impact: challengeResults?.qualityImprovement || 0.1,
      timestamp: new Date()
    }, {
      type: 'knowledge' as const,
      tags: ['challenge-effectiveness', 'design-review'],
      partition: 'learning'
    });
  }

  private async learnFromAlternativeAdoption(alternativeOutcomes: any): Promise<void> {
    await this.memory.store('challenge-learning:alternatives', {
      proposedCount: alternativeOutcomes?.proposed || 0,
      adoptedCount: alternativeOutcomes?.adopted || 0,
      successfulCount: alternativeOutcomes?.successful || 0,
      patterns: 'Simple alternatives more likely to be adopted',
      timestamp: new Date()
    }, {
      type: 'knowledge' as const,
      tags: ['alternatives', 'adoption'],
      partition: 'learning'
    });
  }

  private async learnFromTeamResponse(teamFeedback: any): Promise<void> {
    await this.memory.store('challenge-learning:team-response', {
      feedback: teamFeedback || {},
      engagement: 'high',
      resistance: 'low',
      insights: 'Teams respond well to collaborative challenging approach',
      timestamp: new Date()
    }, {
      type: 'knowledge' as const,
      tags: ['team-feedback', 'collaboration'],
      partition: 'learning'
    });
  }

  private async updateChallengingPatterns(patterns: any): Promise<void> {
    if (patterns && patterns.length > 0) {
      await this.memory.store('challenge-learning:patterns', {
        newPatterns: patterns,
        effectiveness: 'to-be-evaluated',
        timestamp: new Date()
      }, {
        type: 'artifact' as const,
        tags: ['challenge-patterns'],
        partition: 'patterns'
      });
    }
  }

  private async improveQuestioningTechniques(questioningEffectiveness: any): Promise<void> {
    await this.memory.store('challenge-learning:questioning', {
      effectiveness: questioningEffectiveness || {},
      improvements: 'Focus on open-ended questions that encourage exploration',
      techniques: ['socratic-method', 'appreciative-inquiry'],
      timestamp: new Date()
    }, {
      type: 'knowledge' as const,
      tags: ['questioning', 'techniques'],
      partition: 'learning'
    });
  }

  // ID generators
  private generateDecisionId(): string {
    return `design-challenger-decision-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSessionId(): string {
    return `challenge-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateChallengeId(): string {
    return `challenge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRecommendationId(): string {
    return `recommendation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Additional missing methods for the act method
  private async executeDesignChallenges(reasoning: ExplainableReasoning): Promise<Challenge[]> {
    // Execute design challenges based on reasoning
    const challenges: Challenge[] = [];

    // Create challenges based on reasoning factors
    for (const factor of reasoning.factors) {
      if (factor.value < 0.7) { // Challenge low-scoring factors
        const challenge: Challenge = {
          id: this.generateChallengeId(),
          type: 'concern',
          title: `Challenge: ${factor.name}`,
          description: `${factor.explanation} - Score: ${factor.value}`,
          severity: factor.impact === 'critical' ? 'critical' : 'minor',
          category: factor.name,
          evidence: reasoning.evidence.filter(e => e.source.includes(factor.name)),
          recommendations: [],
          impact: {
            maintainability: 0.1,
            performance: 0.1,
            reliability: 0.1,
            security: 0.0,
            usability: 0.0,
            testability: 0.1,
            overall: 0.1
          },
          confidence: 0.8
        };
        challenges.push(challenge);
      }
    }

    return challenges;
  }

  private assessSessionQualityImpact(challenges: Challenge[]): any {
    const improvements: any[] = [];
    const impact = {
      maintainability: 0,
      performance: 0,
      reliability: 0,
      security: 0,
      usability: 0,
      testability: 0,
      overall: 0
    };

    for (const challenge of challenges) {
      if (challenge.type === 'improvement' || challenge.type === 'alternative') {
        improvements.push({
          area: challenge.category,
          description: challenge.description,
          impact: challenge.impact
        });

        // Aggregate impact
        for (const [key, value] of Object.entries(challenge.impact)) {
          impact[key as keyof typeof impact] += value;
        }
      }
    }

    // Normalize by challenge count
    const challengeCount = Math.max(challenges.length, 1);
    for (const key of Object.keys(impact)) {
      impact[key as keyof typeof impact] /= challengeCount;
    }

    return { improvements, impact };
  }
}
