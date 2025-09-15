/**
 * Specification Linter Agent
 * Analyzes and validates specifications for clarity, completeness, and testability
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
  IMemorySystem
} from '../core/types';

export interface SpecificationRule {
  id: string;
  name: string;
  category: 'clarity' | 'completeness' | 'testability' | 'consistency' | 'traceability';
  severity: 'error' | 'warning' | 'info' | 'suggestion';
  description: string;
  pattern?: RegExp;
  checker: (spec: any) => SpecificationViolation[];
  autofix?: boolean;
  examples: {
    good: string[];
    bad: string[];
  };
}

export interface SpecificationViolation {
  ruleId: string;
  severity: 'error' | 'warning' | 'info' | 'suggestion';
  message: string;
  location: {
    section?: string;
    line?: number;
    column?: number;
    context?: string;
  };
  suggestion?: string;
  autofix?: {
    available: boolean;
    description: string;
    replacement?: string;
  };
  confidence: number;
}

export interface SpecificationMetrics {
  clarity: {
    score: number;
    readabilityIndex: number;
    ambiguityCount: number;
    jargonUsage: number;
  };
  completeness: {
    score: number;
    missingElements: string[];
    coveragePercentage: number;
    traceabilityGaps: number;
  };
  testability: {
    score: number;
    testableRequirements: number;
    totalRequirements: number;
    acceptanceCriteria: number;
  };
  consistency: {
    score: number;
    contradictions: number;
    terminologyConsistency: number;
    formatConsistency: number;
  };
  overall: {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    recommendations: string[];
  };
}

export interface SpecificationAnalysis {
  id: string;
  specification: any;
  metrics: SpecificationMetrics;
  violations: SpecificationViolation[];
  suggestions: Suggestion[];
  fixableIssues: number;
  criticalIssues: number;
  timestamp: Date;
}

export interface Suggestion {
  type: 'improvement' | 'addition' | 'clarification' | 'restructure';
  priority: 'high' | 'medium' | 'low';
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  section?: string;
}

export interface TerminologyGlossary {
  terms: Map<string, TermDefinition>;
  aliases: Map<string, string>;
  categories: Map<string, string[]>;
}

export interface TermDefinition {
  term: string;
  definition: string;
  category: string;
  usage: number;
  consistency: number;
  alternatives: string[];
}

export class SpecLinterAgent extends BaseAgent {
  private lintingRules: Map<string, SpecificationRule> = new Map();
  private terminologyGlossary: TerminologyGlossary = {
    terms: new Map(),
    aliases: new Map(),
    categories: new Map()
  };
  private specificationPatterns: Map<string, RegExp> = new Map();
  private qualityThresholds = {
    clarity: 0.8,
    completeness: 0.85,
    testability: 0.9,
    consistency: 0.95
  };
  private analysisHistory: Map<string, SpecificationAnalysis> = new Map();

  constructor(
    id: AgentId,
    config: AgentConfig,
    logger: ILogger,
    eventBus: IEventBus,
    memory: IMemorySystem
  ) {
    super(id, config, logger, eventBus, memory);
    this.initializeLintingRules();
    this.initializeTerminologyGlossary();
    this.initializePatterns();
  }

  protected async perceive(context: any): Promise<any> {
    this.logger.info(`Spec Linter perceiving context for ${context.specificationId || 'unknown specification'}`);

    // Parse specification structure
    const structureAnalysis = await this.analyzeSpecificationStructure(context.specification);
    
    // Extract requirements and user stories
    const requirementsAnalysis = await this.extractRequirements(context.specification);
    
    // Analyze language and terminology
    const languageAnalysis = await this.analyzeLanguage(context.specification);
    
    // Assess traceability links
    const traceabilityAnalysis = await this.analyzeTraceability(context.specification);
    
    // Check against quality standards
    const standardsCompliance = await this.checkStandardsCompliance(context.specification);
    
    // Assess testability factors
    const testabilityFactors = await this.assessTestabilityFactors(requirementsAnalysis);

    return {
      structureAnalysis,
      requirementsAnalysis,
      languageAnalysis,
      traceabilityAnalysis,
      standardsCompliance,
      testabilityFactors,
      specificationMetadata: await this.extractMetadata(context.specification)
    };
  }

  protected async decide(observation: any): Promise<AgentDecision> {
    const decisionId = this.generateDecisionId();
    
    // Determine linting strategy
    const strategy = await this.determineLintingStrategy(observation);
    
    // Select applicable rules
    const applicableRules = await this.selectApplicableRules(observation);
    
    // Plan analysis approach
    const analysisApproach = await this.planAnalysisApproach(observation, applicableRules);
    
    // Prioritize quality dimensions
    const qualityPriorities = await this.prioritizeQualityDimensions(observation);
    
    // Apply RST heuristics for specification analysis
    const heuristics = this.applySpecificationHeuristics(observation);
    
    // Build reasoning
    const reasoning = this.buildReasoning(
      [
        { name: 'structure_complexity', weight: 0.2, value: observation.structureAnalysis.complexity, impact: 'medium', explanation: 'Complex structure affects linting accuracy' },
        { name: 'language_clarity', weight: 0.25, value: observation.languageAnalysis.clarity, impact: 'high', explanation: 'Clear language improves specification quality' },
        { name: 'requirements_count', weight: 0.2, value: observation.requirementsAnalysis.count, impact: 'medium', explanation: 'Number of requirements affects analysis depth' },
        { name: 'testability_score', weight: 0.35, value: observation.testabilityFactors.score, impact: 'high', explanation: 'Testability is crucial for specification quality' }
      ],
      heuristics,
      [
        {
          type: 'analytical',
          source: 'requirements_analysis',
          confidence: 0.95,
          description: `Found ${observation.requirementsAnalysis.count} requirements`
        },
        {
          type: 'empirical',
          source: 'language_analysis',
          confidence: 0.8,
          description: `Readability score: ${observation.languageAnalysis.readabilityScore}`
        }
      ],
      ['Specification format is recognizable', 'Natural language processing tools are available'],
      ['Domain-specific terminology may require manual review', 'Automated testability assessment has limitations']
    );

    return {
      id: decisionId,
      agentId: this.id.id,
      timestamp: new Date(),
      action: 'execute_specification_linting',
      reasoning,
      confidence: this.calculateLintingConfidence(observation),
      alternatives: await this.generateAlternatives(observation),
      risks: await this.identifyLintingRisks(observation),
      recommendations: [
        'Focus on high-severity violations first',
        'Review auto-fix suggestions before applying',
        'Consider domain-specific requirements when interpreting results'
      ]
    };
  }

  protected async act(decision: AgentDecision): Promise<any> {
    this.logger.info(`Spec Linter executing: ${decision.action}`);

    const action = decision.action;
    const results = {
      analysisId: this.generateAnalysisId(),
      violations: [],
      metrics: null,
      suggestions: [],
      autofixApplied: 0,
      qualityScore: 0,
      grade: 'F' as const,
      improvementPlan: [],
      terminologyIssues: [],
      traceabilityGaps: [],
      processingTime: 0
    };

    try {
      const startTime = Date.now();
      
      // Execute linting rules
      const applicableRules = decision.reasoning?.factors?.[0]?.value || [];
      const analysisApproach = decision.reasoning?.evidence?.[0] || {};
      const violations = await this.executeLintingRules(applicableRules, analysisApproach);
      results.violations = violations as any;
      
      // Calculate quality metrics
      const metrics = await this.calculateQualityMetrics(violations, (analysisApproach as any)?.analysisApproach);
      results.metrics = metrics as any;
      
      // Generate suggestions
      const suggestions = await this.generateSuggestions(violations, metrics);
      results.suggestions = suggestions as any;
      
      // Apply automatic fixes where possible
      const autofixResults = await this.applyAutomaticFixes(violations);
      results.autofixApplied = autofixResults.fixedCount;
      
      // Calculate overall quality score and grade
      const qualityAssessment = await this.assessOverallQuality(metrics);
      results.qualityScore = qualityAssessment.score;
      results.grade = qualityAssessment.grade;
      
      // Generate improvement plan
      results.improvementPlan = await this.generateImprovementPlan(violations, suggestions, metrics) as any;
      
      // Identify terminology issues
      results.terminologyIssues = await this.identifyTerminologyIssues(violations) as any;
      
      // Find traceability gaps
      results.traceabilityGaps = await this.findTraceabilityGaps(violations, metrics) as any;
      
      results.processingTime = Date.now() - startTime;
      
      // Store analysis for future reference
      const analysis = await this.createAnalysisRecord(results, (analysisApproach as any)?.analysisApproach);
      this.analysisHistory.set(analysis.id, analysis);
      
      // Update agent metrics
      this.updateSpecLinterMetrics(results);
      
      // Share knowledge with team
      await this.shareKnowledge({
        type: 'specification_linting_results',
        analysisId: results.analysisId,
        qualityScore: results.qualityScore,
        criticalIssues: violations.filter(v => v.severity === 'error').length,
        recommendations: results.improvementPlan
      }, ['specification-quality', 'requirements-analysis', 'linting']);

      return results;
      
    } catch (error) {
      this.logger.error('Specification linting failed:', error);
      const err = error instanceof Error ? error : new Error(String(error)); throw err;
    }
  }

  protected async learn(feedback: any): Promise<void> {
    // Learn from rule effectiveness
    await this.learnFromRuleEffectiveness(feedback.violations);
    
    // Learn from quality improvements
    await this.learnFromQualityImprovements(feedback.qualityScore);
    
    // Learn from terminology usage
    await this.learnFromTerminologyUsage(feedback.terminologyIssues);
    
    // Update linting rules
    await this.updateLintingRules(feedback.suggestions);
    
    // Improve pattern recognition
    await this.improvePatternRecognition(feedback.patterns);
  }

  private initializeLintingRules(): void {
    const rules: SpecificationRule[] = [
      {
        id: 'req-001',
        name: 'Requirements Must Have Acceptance Criteria',
        category: 'testability',
        severity: 'error',
        description: 'Every functional requirement must have defined acceptance criteria',
        checker: (spec) => this.checkAcceptanceCriteria(spec),
        autofix: false,
        examples: {
          good: ['The system shall validate user input. Acceptance: Input validation returns clear error messages for invalid data.'],
          bad: ['The system shall validate user input.']
        }
      },
      {
        id: 'lang-001',
        name: 'Avoid Ambiguous Language',
        category: 'clarity',
        severity: 'warning',
        description: 'Avoid words like "should", "might", "could" in requirements',
        pattern: /\b(should|might|could|may|probably|perhaps)\b/gi,
        checker: (spec) => this.checkAmbiguousLanguage(spec),
        autofix: false,
        examples: {
          good: ['The system shall authenticate users.', 'The system must validate input.'],
          bad: ['The system should authenticate users.', 'The system might validate input.']
        }
      },
      {
        id: 'struct-001',
        name: 'Requirements Must Be Uniquely Identified',
        category: 'traceability',
        severity: 'error',
        description: 'Each requirement must have a unique identifier',
        checker: (spec) => this.checkUniqueIdentifiers(spec),
        autofix: true,
        examples: {
          good: ['REQ-001: The system shall...', 'FR-AUTH-001: Authentication shall...'],
          bad: ['The system shall...', 'Requirements: Various system behaviors']
        }
      },
      {
        id: 'comp-001',
        name: 'Missing Non-Functional Requirements',
        category: 'completeness',
        severity: 'warning',
        description: 'Specification should include non-functional requirements',
        checker: (spec) => this.checkNonFunctionalRequirements(spec),
        autofix: false,
        examples: {
          good: ['Performance: System shall respond within 2 seconds', 'Security: All data shall be encrypted'],
          bad: ['Missing performance, security, usability requirements']
        }
      },
      {
        id: 'term-001',
        name: 'Inconsistent Terminology',
        category: 'consistency',
        severity: 'warning',
        description: 'Terms should be used consistently throughout the specification',
        checker: (spec) => this.checkTerminologyConsistency(spec),
        autofix: false,
        examples: {
          good: ['User consistently used throughout', 'Customer consistently used throughout'],
          bad: ['User, End-user, Client used interchangeably without definition']
        }
      }
    ];

    rules.forEach(rule => this.lintingRules.set(rule.id, rule));
  }

  private initializeTerminologyGlossary(): void {
    this.terminologyGlossary = {
      terms: new Map(),
      aliases: new Map(),
      categories: new Map()
    };

    // Add common software terms
    const commonTerms = [
      { term: 'user', definition: 'Person who interacts with the system', category: 'actor' },
      { term: 'system', definition: 'The software application being specified', category: 'technical' },
      { term: 'requirement', definition: 'A condition or capability needed by the system', category: 'process' },
      { term: 'authentication', definition: 'Process of verifying user identity', category: 'security' },
      { term: 'authorization', definition: 'Process of granting access rights', category: 'security' }
    ];

    commonTerms.forEach(({ term, definition, category }) => {
      this.terminologyGlossary.terms.set(term, {
        term,
        definition,
        category,
        usage: 0,
        consistency: 1.0,
        alternatives: []
      });
    });
  }

  private initializePatterns(): void {
    this.specificationPatterns.set('requirement-id', /^\s*(?:REQ|FR|NFR|US)-[A-Z0-9]+-\d+/m);
    this.specificationPatterns.set('user-story', /^\s*As\s+a\s+.+\s+I\s+want\s+.+\s+so\s+that\s+.+/mi);
    this.specificationPatterns.set('acceptance-criteria', /^\s*(?:Given|When|Then|And|But)\s+.+/mi);
    this.specificationPatterns.set('shall-statement', /\b(?:shall|must|will)\b/gi);
    this.specificationPatterns.set('measurable-criteria', /\b\d+(?:\.\d+)?\s*(?:seconds?|minutes?|hours?|%|percent|users?|requests?)\b/gi);
  }

  private async analyzeSpecificationStructure(specification: any): Promise<any> {
    return {
      sections: this.identifySections(specification),
      hierarchy: this.analyzeHierarchy(specification),
      formatting: this.assessFormatting(specification),
      organization: this.assessOrganization(specification),
      complexity: this.calculateStructuralComplexity(specification)
    };
  }

  private async extractRequirements(specification: any): Promise<any> {
    const requirements = this.parseRequirements(specification);
    
    return {
      count: requirements.length,
      types: this.categorizeRequirements(requirements),
      identifiers: this.extractIdentifiers(requirements),
      priorities: this.extractPriorities(requirements),
      dependencies: this.analyzeDependencies(requirements),
      testability: this.assessRequirementTestability(requirements)
    };
  }

  private async analyzeLanguage(specification: any): Promise<any> {
    const text = this.extractText(specification);
    
    return {
      readabilityScore: this.calculateReadability(text),
      clarity: this.assessClarity(text),
      ambiguityIndicators: this.findAmbiguityIndicators(text),
      terminologyUsage: this.analyzeTerminologyUsage(text),
      sentenceComplexity: this.analyzeSentenceComplexity(text),
      passiveVoiceUsage: this.detectPassiveVoice(text)
    };
  }

  private async analyzeTraceability(specification: any): Promise<any> {
    return {
      forwardTraceability: this.checkForwardTraceability(specification),
      backwardTraceability: this.checkBackwardTraceability(specification),
      crossReferences: this.findCrossReferences(specification),
      orphanedRequirements: this.findOrphanedRequirements(specification),
      traceabilityMatrix: this.buildTraceabilityMatrix(specification)
    };
  }

  private async checkStandardsCompliance(specification: any): Promise<any> {
    return {
      iso29148: this.checkISO29148Compliance(specification),
      ieee830: this.checkIEEE830Compliance(specification),
      agileStandards: this.checkAgileStandards(specification),
      domainStandards: this.checkDomainStandards(specification)
    };
  }

  private async assessTestabilityFactors(requirementsAnalysis: any): Promise<any> {
    return {
      score: this.calculateTestabilityScore(requirementsAnalysis),
      acceptanceCriteria: this.countAcceptanceCriteria(requirementsAnalysis),
      measurableRequirements: this.countMeasurableRequirements(requirementsAnalysis),
      verifiableRequirements: this.countVerifiableRequirements(requirementsAnalysis),
      testableLanguage: this.assessTestableLanguage(requirementsAnalysis)
    };
  }

  private async extractMetadata(specification: any): Promise<any> {
    return {
      version: this.extractVersion(specification),
      authors: this.extractAuthors(specification),
      lastModified: this.extractLastModified(specification),
      reviewStatus: this.extractReviewStatus(specification),
      approvalStatus: this.extractApprovalStatus(specification)
    };
  }

  private applySpecificationHeuristics(observation: any): RSTHeuristic[] {
    const heuristics: RSTHeuristic[] = ['SFDIPOT']; // Structure, Function, Data focus
    
    if (observation.requirementsAnalysis.count > 50) {
      heuristics.push('RCRCRC'); // Risk-based for large specifications
    }
    
    if (observation.testabilityFactors.score < 0.7) {
      heuristics.push('CRUSSPIC'); // Quality assessment focus
    }
    
    return heuristics;
  }

  private async determineLintingStrategy(observation: any): Promise<string> {
    if (observation.structureAnalysis.complexity > 0.8) {
      return 'comprehensive-deep-analysis';
    }
    if (observation.testabilityFactors.score < 0.5) {
      return 'testability-focused';
    }
    if (observation.languageAnalysis.ambiguityIndicators.length > 10) {
      return 'clarity-focused';
    }
    return 'balanced-analysis';
  }

  private async selectApplicableRules(observation: any): Promise<SpecificationRule[]> {
    const applicableRules = [];
    
    for (const rule of this.lintingRules.values()) {
      if (this.isRuleApplicable(rule, observation)) {
        applicableRules.push(rule);
      }
    }
    
    return applicableRules.sort((a, b) => this.prioritizeRule(a) - this.prioritizeRule(b));
  }

  private async planAnalysisApproach(observation: any, rules: SpecificationRule[]): Promise<any> {
    return {
      phases: this.planAnalysisPhases(observation, rules),
      parallelization: this.determinePossibleParallelization(rules),
      resourceEstimate: this.estimateResourceRequirements(observation, rules),
      qualityGates: this.defineQualityGates(observation)
    };
  }

  private async prioritizeQualityDimensions(observation: any): Promise<any> {
    const priorities = [];
    
    if (observation.testabilityFactors.score < this.qualityThresholds.testability) {
      priorities.push({ dimension: 'testability', priority: 'high', gap: this.qualityThresholds.testability - observation.testabilityFactors.score });
    }
    
    if (observation.languageAnalysis.clarity < this.qualityThresholds.clarity) {
      priorities.push({ dimension: 'clarity', priority: 'high', gap: this.qualityThresholds.clarity - observation.languageAnalysis.clarity });
    }
    
    return priorities.sort((a, b) => b.gap - a.gap);
  }

  private calculateLintingConfidence(observation: any): number {
    let confidence = 0.5;
    
    // Boost confidence for structured specifications
    if (observation.structureAnalysis.organization > 0.7) {
      confidence += 0.2;
    }
    
    // Boost confidence for clear language
    if (observation.languageAnalysis.readabilityScore > 0.7) {
      confidence += 0.15;
    }
    
    // Reduce confidence for very complex specifications
    if (observation.structureAnalysis.complexity > 0.9) {
      confidence -= 0.1;
    }
    
    return Math.max(0, Math.min(1, confidence));
  }

  private async generateAlternatives(observation: any): Promise<any[]> {
    return [
      {
        description: 'Manual specification review by domain experts',
        confidence: 0.8,
        tradeoffs: 'Higher accuracy but slower and more expensive'
      },
      {
        description: 'Automated NLP-based analysis only',
        confidence: 0.6,
        tradeoffs: 'Faster but may miss domain-specific issues'
      },
      {
        description: 'Template-based specification validation',
        confidence: 0.7,
        tradeoffs: 'Good for standardization but less flexible'
      }
    ];
  }

  private async identifyLintingRisks(observation: any): Promise<any[]> {
    return [
      {
        description: 'False positives due to domain-specific terminology',
        probability: 0.4,
        impact: 'medium',
        mitigation: 'Maintain domain glossary and allow custom rule configuration'
      },
      {
        description: 'Missing subtle semantic issues that require human judgment',
        probability: 0.6,
        impact: 'medium',
        mitigation: 'Combine automated analysis with expert review'
      },
      {
        description: 'Performance issues with very large specifications',
        probability: 0.2,
        impact: 'low',
        mitigation: 'Implement chunking and parallel processing'
      }
    ];
  }

  private estimateLintingDuration(observation: any, rules: SpecificationRule[]): number {
    const baseTime = 60000; // 1 minute base
    const complexityMultiplier = 1 + observation.structureAnalysis.complexity;
    const rulesMultiplier = 1 + (rules.length / 10);
    
    return baseTime * complexityMultiplier * rulesMultiplier;
  }

  private async executeLintingRules(rules: SpecificationRule[], approach: any): Promise<SpecificationViolation[]> {
    const violations: SpecificationViolation[] = [];
    
    for (const rule of rules) {
      const ruleViolations = await this.executeRule(rule, approach);
      violations.push(...ruleViolations);
    }
    
    return violations.sort((a, b) => this.prioritizeViolation(a) - this.prioritizeViolation(b));
  }

  private async executeRule(rule: SpecificationRule, approach: any): Promise<SpecificationViolation[]> {
    try {
      // Mock specification for rule execution
      const mockSpec = this.createMockSpecification();
      return rule.checker(mockSpec);
    } catch (error) {
      this.logger.warn(`Rule ${rule.id} execution failed:`, error);
      return [];
    }
  }

  private async calculateQualityMetrics(violations: SpecificationViolation[], approach: any): Promise<SpecificationMetrics> {
    const errorCount = violations.filter(v => v.severity === 'error').length;
    const warningCount = violations.filter(v => v.severity === 'warning').length;
    const totalIssues = violations.length;
    
    const clarity = this.calculateClarityScore(violations);
    const completeness = this.calculateCompletenessScore(violations);
    const testability = this.calculateTestabilityScore(violations);
    const consistency = this.calculateConsistencyScore(violations);
    
    const overallScore = (clarity.score + completeness.score + testability.score + consistency.score) / 4;
    
    return {
      clarity,
      completeness,
      testability,
      consistency,
      overall: {
        score: overallScore,
        grade: this.calculateGrade(overallScore),
        recommendations: this.generateMetricRecommendations(overallScore, violations)
      }
    };
  }

  private async generateSuggestions(violations: SpecificationViolation[], metrics: SpecificationMetrics): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];
    
    // Generate suggestions based on violations
    for (const violation of violations) {
      if (violation.suggestion) {
        suggestions.push({
          type: 'improvement',
          priority: this.mapSeverityToPriority(violation.severity),
          description: violation.suggestion,
          impact: `Addresses ${violation.ruleId}`,
          effort: violation.autofix?.available ? 'low' : 'medium',
          section: violation.location.section
        });
      }
    }
    
    // Generate strategic suggestions based on metrics
    if (metrics.testability.score < 0.7) {
      suggestions.push({
        type: 'addition',
        priority: 'high',
        description: 'Add acceptance criteria to requirements lacking testable conditions',
        impact: 'Significantly improves testability score',
        effort: 'medium'
      });
    }
    
    if (metrics.clarity.score < 0.7) {
      suggestions.push({
        type: 'clarification',
        priority: 'high',
        description: 'Replace ambiguous language with precise, measurable terms',
        impact: 'Improves specification clarity and reduces interpretation errors',
        effort: 'medium'
      });
    }
    
    return suggestions.sort((a, b) => this.prioritizeSuggestion(a) - this.prioritizeSuggestion(b));
  }

  private async applyAutomaticFixes(violations: SpecificationViolation[]): Promise<any> {
    let fixedCount = 0;
    const appliedFixes = [];
    
    for (const violation of violations) {
      if (violation.autofix?.available) {
        const fix = await this.applyAutofix(violation);
        if (fix.success) {
          fixedCount++;
          appliedFixes.push(fix);
        }
      }
    }
    
    return {
      fixedCount,
      appliedFixes,
      potentialFixes: violations.filter(v => v.autofix?.available).length
    };
  }

  private async assessOverallQuality(metrics: SpecificationMetrics): Promise<any> {
    const score = metrics.overall.score;
    const grade = this.calculateGrade(score);
    
    return {
      score,
      grade,
      breakdown: {
        clarity: metrics.clarity.score,
        completeness: metrics.completeness.score,
        testability: metrics.testability.score,
        consistency: metrics.consistency.score
      },
      strengths: this.identifyStrengths(metrics),
      weaknesses: this.identifyWeaknesses(metrics)
    };
  }

  private async generateImprovementPlan(violations: SpecificationViolation[], suggestions: Suggestion[], metrics: SpecificationMetrics): Promise<any[]> {
    const plan = [];
    
    // Immediate actions (critical errors)
    const criticalViolations = violations.filter(v => v.severity === 'error');
    if (criticalViolations.length > 0) {
      plan.push({
        phase: 'immediate',
        priority: 'critical',
        actions: criticalViolations.map(v => `Fix: ${v.message}`),
        estimatedEffort: 'high',
        impact: 'Resolves blocking issues'
      });
    }
    
    // Short-term improvements
    const highPrioritySuggestions = suggestions.filter(s => s.priority === 'high');
    if (highPrioritySuggestions.length > 0) {
      plan.push({
        phase: 'short-term',
        priority: 'high',
        actions: highPrioritySuggestions.map(s => s.description),
        estimatedEffort: 'medium',
        impact: 'Significant quality improvement'
      });
    }
    
    // Long-term strategic improvements
    plan.push({
      phase: 'long-term',
      priority: 'medium',
      actions: [
        'Establish specification review process',
        'Create domain-specific glossary',
        'Implement continuous quality monitoring'
      ],
      estimatedEffort: 'low',
      impact: 'Prevents future quality issues'
    });
    
    return plan;
  }

  private async identifyTerminologyIssues(violations: SpecificationViolation[]): Promise<any[]> {
    return violations
      .filter(v => v.ruleId.startsWith('term-'))
      .map(v => ({
        type: 'terminology',
        issue: v.message,
        location: v.location,
        suggestion: v.suggestion
      }));
  }

  private async findTraceabilityGaps(violations: SpecificationViolation[], metrics: SpecificationMetrics): Promise<any[]> {
    const gaps = [];
    
    // Missing traceability links
    if (metrics.completeness.traceabilityGaps > 0) {
      gaps.push({
        type: 'missing-links',
        count: metrics.completeness.traceabilityGaps,
        description: 'Requirements without proper traceability links'
      });
    }
    
    // Broken references
    const brokenRefs = violations.filter(v => v.message.includes('reference'));
    if (brokenRefs.length > 0) {
      gaps.push({
        type: 'broken-references',
        count: brokenRefs.length,
        description: 'References to non-existent requirements or sections'
      });
    }
    
    return gaps;
  }

  private async createAnalysisRecord(results: any, approach: any): Promise<SpecificationAnalysis> {
    return {
      id: results.analysisId,
      specification: {}, // Would contain actual spec
      metrics: results.metrics,
      violations: results.violations,
      suggestions: results.suggestions,
      fixableIssues: results.autofixApplied,
      criticalIssues: results.violations.filter((v: any) => v.severity === 'error').length,
      timestamp: new Date()
    };
  }

  private updateSpecLinterMetrics(results: any): void {
    this.metrics.requirementsAnalyzed += 1; // Approximation
    this.metrics.ambiguitiesDetected += results.violations.filter((v: any) => v.ruleId.includes('ambiguous')).length;
    
    // Update success rate based on quality score
    const qualitySuccess = results.qualityScore > 0.7 ? 1 : 0;
    this.metrics.successRate = (this.metrics.successRate + qualitySuccess) / 2;
  }

  // Rule implementation methods
  private checkAcceptanceCriteria(spec: any): SpecificationViolation[] {
    const violations: SpecificationViolation[] = [];
    
    // Mock check for acceptance criteria
    const requirementsWithoutAC = 3; // Mock count
    
    for (let i = 0; i < requirementsWithoutAC; i++) {
      violations.push({
        ruleId: 'req-001',
        severity: 'error',
        message: `Requirement REQ-${i + 1} lacks acceptance criteria`,
        location: {
          section: 'Functional Requirements',
          line: 10 + i * 5,
          context: `REQ-${i + 1}: The system shall...`
        },
        suggestion: 'Add specific, measurable acceptance criteria that define when this requirement is satisfied',
        confidence: 0.9
      });
    }
    
    return violations;
  }

  private checkAmbiguousLanguage(spec: any): SpecificationViolation[] {
    const violations: SpecificationViolation[] = [];
    
    const ambiguousWords = ['should', 'might', 'could'];
    
    ambiguousWords.forEach((word, index) => {
      violations.push({
        ruleId: 'lang-001',
        severity: 'warning',
        message: `Ambiguous word "${word}" found in requirement`,
        location: {
          section: 'Requirements',
          line: 15 + index * 3,
          context: `The system ${word} validate input`
        },
        suggestion: `Replace "${word}" with "shall" or "must" for mandatory requirements`,
        confidence: 0.85
      });
    });
    
    return violations;
  }

  private checkUniqueIdentifiers(spec: any): SpecificationViolation[] {
    const violations: SpecificationViolation[] = [];
    
    // Mock check for duplicate or missing IDs
    violations.push({
      ruleId: 'struct-001',
      severity: 'error',
      message: 'Requirement found without unique identifier',
      location: {
        section: 'User Interface Requirements',
        line: 45,
        context: 'The login screen shall display...' 
      },
      suggestion: 'Add unique identifier like "REQ-UI-001"',
      autofix: {
        available: true,
        description: 'Automatically generate unique identifier',
        replacement: 'REQ-UI-001: The login screen shall display...'
      },
      confidence: 0.95
    });
    
    return violations;
  }

  private checkNonFunctionalRequirements(spec: any): SpecificationViolation[] {
    const violations: SpecificationViolation[] = [];
    
    const missingNFRs = ['performance', 'security', 'usability', 'reliability'];
    
    missingNFRs.forEach(nfr => {
      violations.push({
        ruleId: 'comp-001',
        severity: 'warning',
        message: `Missing ${nfr} requirements section`,
        location: {
          section: 'Table of Contents',
          context: 'Non-functional requirements not found'
        },
        suggestion: `Add ${nfr} requirements section with specific, measurable criteria`,
        confidence: 0.8
      });
    });
    
    return violations;
  }

  private checkTerminologyConsistency(spec: any): SpecificationViolation[] {
    const violations: SpecificationViolation[] = [];
    
    // Mock terminology inconsistency
    violations.push({
      ruleId: 'term-001',
      severity: 'warning',
      message: 'Inconsistent terminology: "user" vs "customer" used interchangeably',
      location: {
        section: 'Multiple sections',
        context: 'Terms used without clear distinction'
      },
      suggestion: 'Define terms in glossary and use consistently, or clarify the distinction between user and customer',
      confidence: 0.75
    });
    
    return violations;
  }

  // Helper methods for analysis
  private identifySections(specification: any): string[] {
    return ['Introduction', 'Functional Requirements', 'Non-Functional Requirements', 'Constraints']; // Mock
  }

  private analyzeHierarchy(specification: any): any {
    return { depth: 3, balance: 0.8 }; // Mock
  }

  private assessFormatting(specification: any): any {
    return { consistency: 0.7, standardCompliance: 0.8 }; // Mock
  }

  private assessOrganization(specification: any): any {
    return 0.75; // Mock organization score
  }

  private calculateStructuralComplexity(specification: any): number {
    return 0.6; // Mock complexity
  }

  private parseRequirements(specification: any): any[] {
    // Mock requirement parsing
    return [
      { id: 'REQ-001', type: 'functional', text: 'System shall authenticate users' },
      { id: 'REQ-002', type: 'functional', text: 'System shall validate input' },
      { type: 'non-functional', text: 'System should respond quickly' } // Missing ID
    ];
  }

  private categorizeRequirements(requirements: any[]): any {
    return {
      functional: requirements.filter(r => r.type === 'functional').length,
      nonFunctional: requirements.filter(r => r.type === 'non-functional').length,
      constraints: 0
    };
  }

  private extractIdentifiers(requirements: any[]): string[] {
    return requirements.filter(r => r.id).map(r => r.id);
  }

  private extractPriorities(requirements: any[]): any {
    return { high: 2, medium: 1, low: 0 }; // Mock priorities
  }

  private analyzeDependencies(requirements: any[]): any[] {
    return []; // Mock dependencies
  }

  private assessRequirementTestability(requirements: any[]): number {
    return 0.6; // Mock testability score
  }

  private extractText(specification: any): string {
    return 'Mock specification text with various requirements and descriptions.';
  }

  private calculateReadability(text: string): number {
    // Simple readability approximation
    const sentences = text.split(/[.!?]+/).length;
    const words = text.split(/\s+/).length;
    const avgWordsPerSentence = words / sentences;
    
    // Flesch-like score (simplified)
    return Math.max(0, Math.min(1, (avgWordsPerSentence < 20 ? 0.8 : 0.4)));
  }

  private assessClarity(text: string): number {
    const ambiguousPatterns = /\b(should|might|could|may|probably|perhaps)\b/gi;
    const matches = text.match(ambiguousPatterns) || [];
    return Math.max(0, 1 - (matches.length / 100)); // Reduce score for ambiguous words
  }

  private findAmbiguityIndicators(text: string): string[] {
    const indicators = [];
    const patterns = {
      'vague-quantifiers': /\b(some|many|few|several|various)\b/gi,
      'ambiguous-modal': /\b(should|might|could|may)\b/gi,
      'unclear-references': /\b(it|this|that|these|those)\b/gi
    };
    
    for (const [type, pattern] of Object.entries(patterns)) {
      const matches = text.match(pattern);
      if (matches && matches.length > 2) {
        indicators.push(type);
      }
    }
    
    return indicators;
  }

  private analyzeTerminologyUsage(text: string): any {
    return {
      uniqueTerms: 50,
      domainSpecific: 15,
      consistencyScore: 0.8
    };
  }

  private analyzeSentenceComplexity(text: string): any {
    const sentences = text.split(/[.!?]+/);
    const avgLength = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length;
    
    return {
      averageLength: avgLength,
      complexity: avgLength > 25 ? 'high' : avgLength > 15 ? 'medium' : 'low'
    };
  }

  private detectPassiveVoice(text: string): number {
    const passivePatterns = /\b(is|are|was|were|be|been|being)\s+\w+ed\b/gi;
    const matches = text.match(passivePatterns) || [];
    const sentences = text.split(/[.!?]+/).length;
    return matches.length / sentences;
  }

  // Additional helper methods...
  private checkForwardTraceability(specification: any): any {
    return { coverage: 0.8, missingLinks: 5 };
  }

  private checkBackwardTraceability(specification: any): any {
    return { coverage: 0.75, orphanedItems: 3 };
  }

  private findCrossReferences(specification: any): any[] {
    return []; // Mock cross-references
  }

  private findOrphanedRequirements(specification: any): any[] {
    return []; // Mock orphaned requirements
  }

  private buildTraceabilityMatrix(specification: any): any {
    return { rows: 10, columns: 8, coverage: 0.8 };
  }

  private checkISO29148Compliance(specification: any): any {
    return { compliant: true, gaps: [] };
  }

  private checkIEEE830Compliance(specification: any): any {
    return { compliant: false, gaps: ['Missing stakeholder analysis'] };
  }

  private checkAgileStandards(specification: any): any {
    return { userStoriesPresent: true, acceptanceCriteriaRatio: 0.6 };
  }

  private checkDomainStandards(specification: any): any {
    return { applicable: [], compliance: {} };
  }

  private countAcceptanceCriteria(requirementsAnalysis: any): number {
    return 8; // Mock count
  }

  private countMeasurableRequirements(requirementsAnalysis: any): number {
    return 5; // Mock count
  }

  private countVerifiableRequirements(requirementsAnalysis: any): number {
    return 7; // Mock count
  }

  private assessTestableLanguage(requirementsAnalysis: any): number {
    return 0.7; // Mock score
  }

  private extractVersion(specification: any): string {
    return '1.0'; // Mock version
  }

  private extractAuthors(specification: any): string[] {
    return ['Author 1', 'Author 2']; // Mock authors
  }

  private extractLastModified(specification: any): Date {
    return new Date(); // Mock date
  }

  private extractReviewStatus(specification: any): string {
    return 'in-review'; // Mock status
  }

  private extractApprovalStatus(specification: any): string {
    return 'pending'; // Mock status
  }

  // Quality calculation methods
  private calculateClarityScore(violations: SpecificationViolation[]): any {
    const clarityViolations = violations.filter(v => v.ruleId.startsWith('lang-'));
    const score = Math.max(0, 1 - (clarityViolations.length / 10));
    
    return {
      score,
      readabilityIndex: 0.8,
      ambiguityCount: clarityViolations.length,
      jargonUsage: 0.2
    };
  }

  private calculateCompletenessScore(violations: SpecificationViolation[]): any {
    const completenessViolations = violations.filter(v => v.ruleId.startsWith('comp-'));
    const score = Math.max(0, 1 - (completenessViolations.length / 8));
    
    return {
      score,
      missingElements: completenessViolations.map(v => v.message),
      coveragePercentage: score * 100,
      traceabilityGaps: 2
    };
  }

  private calculateTestabilityScore(violations: SpecificationViolation[]): any {
    const testabilityViolations = violations.filter(v => v.ruleId.startsWith('req-'));
    const score = Math.max(0, 1 - (testabilityViolations.length / 5));
    
    return {
      score,
      testableRequirements: 8,
      totalRequirements: 10,
      acceptanceCriteria: 6
    };
  }

  private calculateConsistencyScore(violations: SpecificationViolation[]): any {
    const consistencyViolations = violations.filter(v => v.ruleId.startsWith('term-') || v.ruleId.startsWith('struct-'));
    const score = Math.max(0, 1 - (consistencyViolations.length / 6));
    
    return {
      score,
      contradictions: 1,
      terminologyConsistency: 0.8,
      formatConsistency: 0.9
    };
  }

  private calculateGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 0.9) return 'A';
    if (score >= 0.8) return 'B';
    if (score >= 0.7) return 'C';
    if (score >= 0.6) return 'D';
    return 'F';
  }

  private generateMetricRecommendations(score: number, violations: SpecificationViolation[]): string[] {
    const recommendations = [];
    
    if (score < 0.7) {
      recommendations.push('Specification requires significant improvement before implementation');
    }
    
    const errorCount = violations.filter(v => v.severity === 'error').length;
    if (errorCount > 0) {
      recommendations.push(`Address ${errorCount} critical errors immediately`);
    }
    
    return recommendations;
  }

  // Helper methods for processing
  private isRuleApplicable(rule: SpecificationRule, observation: any): boolean {
    // Determine if rule should be applied based on context
    if (rule.category === 'testability' && observation.testabilityFactors.score < 0.5) {
      return true;
    }
    if (rule.category === 'clarity' && observation.languageAnalysis.ambiguityIndicators.length > 0) {
      return true;
    }
    return true; // Apply all rules by default
  }

  private prioritizeRule(rule: SpecificationRule): number {
    const priorities = { error: 1, warning: 2, info: 3, suggestion: 4 };
    return priorities[rule.severity];
  }

  private planAnalysisPhases(observation: any, rules: SpecificationRule[]): string[] {
    return ['structure-analysis', 'content-analysis', 'quality-assessment', 'report-generation'];
  }

  private determinePossibleParallelization(rules: SpecificationRule[]): boolean {
    return rules.length > 5; // Parallelize if many rules
  }

  private estimateResourceRequirements(observation: any, rules: SpecificationRule[]): any {
    return {
      memory: '256MB',
      cpu: 'medium',
      duration: rules.length * 10 + 'seconds'
    };
  }

  private defineQualityGates(observation: any): any[] {
    return [
      { metric: 'critical-errors', threshold: 0, action: 'fail' },
      { metric: 'testability-score', threshold: 0.7, action: 'warn' }
    ];
  }

  private prioritizeViolation(violation: SpecificationViolation): number {
    const severityPriority = { error: 1, warning: 2, info: 3, suggestion: 4 };
    return severityPriority[violation.severity] * (1 - violation.confidence);
  }

  private createMockSpecification(): any {
    return {
      sections: ['Introduction', 'Requirements'],
      requirements: [
        { id: 'REQ-001', text: 'System shall authenticate users', type: 'functional' },
        { text: 'System should be fast', type: 'non-functional' } // Missing ID
      ],
      description: 'Mock specification content with requirements'
    };
  }

  private mapSeverityToPriority(severity: string): 'high' | 'medium' | 'low' {
    const mapping = { error: 'high', warning: 'medium', info: 'low', suggestion: 'low' };
    return (mapping[severity as keyof typeof mapping] || 'low') as 'high' | 'medium' | 'low';
  }

  private prioritizeSuggestion(suggestion: Suggestion): number {
    const priorities = { high: 1, medium: 2, low: 3 };
    const efforts = { low: 1, medium: 2, high: 3 };
    return priorities[suggestion.priority] + efforts[suggestion.effort];
  }

  private async applyAutofix(violation: SpecificationViolation): Promise<any> {
    // Mock autofix application
    return {
      success: true,
      description: violation.autofix?.description,
      appliedChange: violation.autofix?.replacement
    };
  }

  private identifyStrengths(metrics: SpecificationMetrics): string[] {
    const strengths = [];
    
    if (metrics.consistency.score > 0.8) strengths.push('High consistency in terminology and format');
    if (metrics.clarity.score > 0.8) strengths.push('Clear and unambiguous language');
    if (metrics.testability.score > 0.8) strengths.push('Well-defined testable requirements');
    
    return strengths;
  }

  private identifyWeaknesses(metrics: SpecificationMetrics): string[] {
    const weaknesses = [];
    
    if (metrics.completeness.score < 0.7) weaknesses.push('Missing critical specification elements');
    if (metrics.testability.score < 0.7) weaknesses.push('Requirements lack clear acceptance criteria');
    if (metrics.clarity.score < 0.7) weaknesses.push('Ambiguous language reduces clarity');
    
    return weaknesses;
  }

  // Learning methods
  private async learnFromRuleEffectiveness(violations: SpecificationViolation[]): Promise<void> {
    const ruleStats = new Map<string, { triggered: number; falsePositives: number }>();
    
    violations.forEach(violation => {
      const existing = ruleStats.get(violation.ruleId) || { triggered: 0, falsePositives: 0 };
      existing.triggered++;
      if (violation.confidence < 0.5) existing.falsePositives++;
      ruleStats.set(violation.ruleId, existing);
    });
    
    await this.memory.store('spec-linting:rule-effectiveness', {
      ruleStats: Object.fromEntries(ruleStats),
      timestamp: new Date()
    }, {
      type: 'knowledge' as const,
      tags: ['rule-effectiveness', 'linting'],
      partition: 'learning'
    });
  }

  private async learnFromQualityImprovements(qualityScore: number): Promise<void> {
    await this.memory.store('spec-linting:quality-trends', {
      score: qualityScore,
      trend: qualityScore > 0.8 ? 'improving' : 'needs-attention',
      timestamp: new Date()
    }, {
      type: 'knowledge' as const,
      tags: ['quality-trends', 'metrics'],
      partition: 'learning'
    });
  }

  private async learnFromTerminologyUsage(terminologyIssues: any[]): Promise<void> {
    const terminologyPatterns = terminologyIssues.map(issue => ({
      pattern: issue.issue,
      location: issue.location,
      frequency: 1
    }));
    
    await this.memory.store('spec-linting:terminology-patterns', {
      patterns: terminologyPatterns,
      commonIssues: terminologyIssues.slice(0, 5),
      timestamp: new Date()
    }, {
      type: 'knowledge' as const,
      tags: ['terminology', 'patterns'],
      partition: 'learning'
    });
  }

  private async updateLintingRules(suggestions: Suggestion[]): Promise<void> {
    // Update rule weights based on suggestion effectiveness
    const ruleUpdates = suggestions
      .filter(s => s.type === 'improvement')
      .map(s => ({
        suggestion: s.description,
        priority: s.priority,
        impact: s.impact
      }));
    
    await this.memory.store('spec-linting:rule-updates', {
      updates: ruleUpdates,
      timestamp: new Date()
    }, {
      type: 'knowledge',
      tags: ['rules', 'improvement'],
      partition: 'rules'
    });
  }

  private async improvePatternRecognition(patterns: any): Promise<void> {
    if (patterns && patterns.length > 0) {
      await this.memory.store('spec-linting:pattern-learning', {
        newPatterns: patterns,
        effectiveness: 'to-be-evaluated',
        timestamp: new Date()
      }, {
        type: 'knowledge' as const,
        tags: ['patterns', 'recognition'],
        partition: 'learning'
      });
    }
  }

  // ID generators
  private generateDecisionId(): string {
    return `spec-linter-decision-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateAnalysisId(): string {
    return `spec-analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
