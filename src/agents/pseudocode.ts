/**
 * Pseudocode Agent
 *
 * Specializes in the Pseudocode phase of SPARC methodology
 * Transforms formal specifications into algorithmic pseudocode and logical flow designs
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

interface AlgorithmStep {
  id: string;
  sequence: number;
  operation: string;
  description: string;
  inputs: string[];
  outputs: string[];
  conditions?: string[];
  complexity: 'O(1)' | 'O(log n)' | 'O(n)' | 'O(n log n)' | 'O(n²)' | 'O(2^n)';
  error_handling: string[];
}

interface DataStructure {
  name: string;
  type: 'array' | 'object' | 'map' | 'set' | 'tree' | 'graph' | 'queue' | 'stack';
  properties: Record<string, string>;
  operations: string[];
  constraints: string[];
  purpose: string;
}

interface ControlFlow {
  type: 'sequential' | 'conditional' | 'loop' | 'recursive' | 'parallel' | 'event-driven';
  condition?: string;
  branches?: ControlFlow[];
  iteration_logic?: string;
  termination_condition?: string;
  error_handling: string[];
}

interface PseudocodeDocument {
  project: string;
  feature: string;
  version: string;
  algorithms: AlgorithmStep[];
  data_structures: DataStructure[];
  control_flows: ControlFlow[];
  performance_considerations: string[];
  edge_cases: string[];
  assumptions: string[];
  complexity_analysis: {
    time_complexity: string;
    space_complexity: string;
    scalability_notes: string[];
  };
  completeness_score: number;
  clarity_score: number;
  implementability_score: number;
}

interface PseudocodeContext {
  specification: any;
  requirements: any[];
  performance_constraints: Record<string, any>;
  technical_constraints: string[];
  existing_algorithms?: any[];
  domain_patterns: string[];
  quality_standards: Record<string, number>;
  scalability_requirements?: string[];
  algorithm_patterns?: string[];
  data_structures?: string[];
}

export class PseudocodeAgent extends BaseAgent {
  private stepCounter = 0;
  private currentObservation: PseudocodeContext | null = null;
  private qualityThresholds = {
    min_completeness: 0.85,
    min_clarity: 0.8,
    min_implementability: 0.9
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

  protected async perceive(context: any): Promise<PseudocodeContext> {
    this.logger.debug('Pseudocode agent perceiving specification context', { agentId: this.id });

    // Retrieve specification from previous SPARC phase
    const specification = await this.memory.retrieve(`sparc_specification:${context.project}:${context.feature}`);

    // Get domain-specific algorithm patterns
    const domainPatterns = await this.memory.retrieve(`algorithm_patterns:${context.domain}`) || [];

    // Analyze performance constraints
    const performanceConstraints = specification?.quality_attributes || {};

    const pseudocodeContext: PseudocodeContext = {
      specification: specification || context.specification,
      requirements: specification?.requirements || context.requirements || [],
      performance_constraints: performanceConstraints,
      technical_constraints: context.technical_constraints || [],
      existing_algorithms: context.existing_algorithms,
      domain_patterns: domainPatterns,
      quality_standards: {
        ...this.qualityThresholds,
        ...context.quality_standards
      }
    };

    // Store context for other agents
    await this.memory.store(`pseudocode_context:${context.project}:${context.feature}`, pseudocodeContext, {
      type: 'experience' as const,
      tags: ['sparc', 'pseudocode', 'algorithm'],
      partition: 'sparc'
    });

    return pseudocodeContext;
  }

  protected async decide(observation: PseudocodeContext): Promise<AgentDecision> {
    this.logger.debug('Pseudocode agent making algorithm decision', { agentId: this.id });

    this.currentObservation = observation;
    const analysisResults = this.analyzeSpecification(observation);

    let decision: AgentDecision;

    if (analysisResults.complexity_level === 'high' && !analysisResults.has_performance_analysis) {
      decision = {
        id: this.generateId(),
        agentId: this.id.id,
        timestamp: new Date(),
        action: 'analyze_performance_requirements',
        confidence: 0.8,
        alternatives: [],
        risks: [],
        recommendations: [],
        reasoning: this.buildReasoning([
          { name: 'complexity_level', value: 1.0, weight: 0.4, impact: 'high', explanation: 'High complexity level requires detailed performance analysis' },
          { name: 'performance_critical', value: analysisResults.performance_critical ? 1.0 : 0.0, weight: 0.4, impact: 'high', explanation: 'Performance criticality affects algorithm selection' },
          { name: 'scalability_required', value: analysisResults.scalability_needs.length > 0 ? 1.0 : 0.0, weight: 0.2, impact: 'medium', explanation: 'Scalability needs influence algorithmic approach' }
        ], ['CRUSSPIC'], [
          { type: 'analytical', source: 'specification_analysis', confidence: 0.8, description: 'High complexity requires performance analysis' }
        ])
      };
    } else if (analysisResults.algorithm_patterns.length === 0) {
      decision = {
        id: this.generateId(),
        agentId: this.id.id,
        timestamp: new Date(),
        action: 'identify_algorithm_patterns',
        confidence: 0.75,
        alternatives: [],
        risks: [],
        recommendations: [],
        reasoning: this.buildReasoning([
          { name: 'pattern_availability', value: 0.0, weight: 0.5, impact: 'high', explanation: 'No algorithm patterns identified yet requires pattern discovery' },
          { name: 'domain_knowledge', value: observation.domain_patterns.length > 0 ? 1.0 : 0.0, weight: 0.3, impact: 'medium', explanation: 'Domain knowledge availability affects pattern identification' },
          { name: 'requirement_clarity', value: analysisResults.requirement_clarity, weight: 0.2, impact: 'medium', explanation: 'Clear requirements enable better pattern matching' }
        ], ['SFDIPOT'], [
          { type: 'heuristic', source: 'requirement_analysis', confidence: 0.7, description: 'Need to identify suitable algorithm patterns' }
        ])
      };
    } else {
      decision = {
        id: this.generateId(),
        agentId: this.id.id,
        timestamp: new Date(),
        action: 'generate_pseudocode',
        confidence: 0.9,
        alternatives: [],
        risks: [],
        recommendations: [],
        reasoning: this.buildReasoning([
          { name: 'specification_complete', value: analysisResults.specification_completeness, weight: 0.4, impact: 'high', explanation: 'Complete specification enables accurate pseudocode generation' },
          { name: 'patterns_identified', value: Math.min(1.0, analysisResults.algorithm_patterns.length / 3), weight: 0.3, impact: 'medium', explanation: 'Identified patterns provide foundation for pseudocode structure' },
          { name: 'data_structures_clear', value: Math.min(1.0, analysisResults.suggested_data_structures.length / 3), weight: 0.3, impact: 'medium', explanation: 'Clear data structures guide pseudocode implementation approach' }
        ], ['FEW_HICCUPPS'], [
          { type: 'empirical', source: 'specification_analysis', confidence: 0.9, description: 'Ready to generate pseudocode' }
        ])
      };
    }

    return decision;
  }

  protected async act(decision: AgentDecision): Promise<any> {
    this.logger.info('Pseudocode agent executing action', {
      agentId: this.id,
      action: decision.action
    });

    let result: any;

    switch (decision.action) {
      case 'analyze_performance_requirements':
        result = await this.analyzePerformanceRequirements(this.currentObservation);
        break;

      case 'identify_algorithm_patterns':
        result = await this.identifyAlgorithmPatterns(this.currentObservation);
        break;

      case 'generate_pseudocode':
        result = await this.generatePseudocode(this.currentObservation);
        break;

      default:
        this.logger.warn('Unknown pseudocode action requested', { action: decision.action });
        result = { success: false, error: 'Unknown action' };
    }

    // Store action result
    await this.memory.store(`pseudocode_action:${decision.id}`, {
      decision,
      result,
      timestamp: Date.now()
    }, {
      type: 'artifact' as const,
      tags: ['sparc', 'pseudocode', decision.action],
      partition: 'sparc'
    });

    return result;
  }

  protected async learn(feedback: any): Promise<void> {
    this.logger.debug('Pseudocode agent learning from feedback', { agentId: this.id });

    if (feedback.architecture_feedback) {
      const archFeedback = feedback.architecture_feedback;

      // Adjust based on architecture phase feedback
      if (archFeedback.implementability_score < 0.8) {
        this.qualityThresholds.min_implementability = Math.min(0.95, this.qualityThresholds.min_implementability + 0.03);
      }

      if (archFeedback.complexity_issues) {
        this.qualityThresholds.min_clarity = Math.min(0.9, this.qualityThresholds.min_clarity + 0.05);
      }
    }

    if (feedback.coding_feedback) {
      const codingFeedback = feedback.coding_feedback;

      // Learn from coding phase outcomes
      if (codingFeedback.implementation_difficulty > 0.7) {
        this.qualityThresholds.min_completeness = Math.min(0.95, this.qualityThresholds.min_completeness + 0.02);
      }
    }

    // Store learning outcomes
    await this.memory.store('pseudocode_agent_learning', {
      timestamp: Date.now(),
      qualityThresholds: this.qualityThresholds,
      feedback
    }, {
      type: 'knowledge' as const,
      tags: ['sparc', 'pseudocode', 'adaptation'],
      partition: 'sparc'
    });
  }

  private analyzeSpecification(context: PseudocodeContext): any {
    const specification = context.specification;
    const requirements = context.requirements;

    // Analyze complexity
    const complexityIndicators = ['concurrent', 'parallel', 'distributed', 'real-time', 'optimization'];
    const complexity_level = requirements.some((req: any) =>
      complexityIndicators.some(indicator =>
        req.description?.toLowerCase().includes(indicator)
      )
    ) ? 'high' : 'medium';

    // Check for performance requirements
    const performance_critical = Object.keys(context.performance_constraints).length > 0;
    const has_performance_analysis = performance_critical && context.performance_constraints.response_time;

    // Identify scalability needs
    const scalability_needs = requirements.filter((req: any) =>
      req.description?.toLowerCase().includes('scale') ||
      req.description?.toLowerCase().includes('load') ||
      req.description?.toLowerCase().includes('concurrent')
    );

    // Suggest algorithm patterns
    const algorithm_patterns = this.suggestAlgorithmPatterns(requirements, context.domain_patterns);

    // Suggest data structures
    const suggested_data_structures = this.suggestDataStructures(requirements);

    return {
      complexity_level,
      performance_critical,
      has_performance_analysis,
      scalability_needs,
      algorithm_patterns,
      suggested_data_structures,
      specification_completeness: specification ? 0.9 : 0.5,
      requirement_clarity: requirements.length > 0 ? 0.8 : 0.3,
      complex_requirements: requirements.filter((req: any) =>
        req.type === 'non-functional' && req.priority === 'high'
      )
    };
  }

  private suggestAlgorithmPatterns(requirements: any[], domainPatterns: string[]): string[] {
    const patterns: string[] = [];

    requirements.forEach((req: any) => {
      const desc = req.description?.toLowerCase() || '';

      if (desc.includes('search') || desc.includes('find')) {
        patterns.push('search_algorithm');
      }
      if (desc.includes('sort') || desc.includes('order')) {
        patterns.push('sorting_algorithm');
      }
      if (desc.includes('optimize') || desc.includes('minimize')) {
        patterns.push('optimization_algorithm');
      }
      if (desc.includes('graph') || desc.includes('network')) {
        patterns.push('graph_algorithm');
      }
      if (desc.includes('cache') || desc.includes('memory')) {
        patterns.push('caching_pattern');
      }
    });

    // Add domain-specific patterns
    patterns.push(...domainPatterns.filter(pattern => !patterns.includes(pattern)));

    return [...new Set(patterns)]; // Remove duplicates
  }

  private suggestDataStructures(requirements: any[]): DataStructure[] {
    const structures: DataStructure[] = [];

    requirements.forEach((req: any) => {
      const desc = req.description?.toLowerCase() || '';

      if (desc.includes('list') || desc.includes('sequence')) {
        structures.push({
          name: 'ItemList',
          type: 'array',
          properties: { items: 'any[]', length: 'number' },
          operations: ['add', 'remove', 'find', 'iterate'],
          constraints: ['ordered', 'dynamic_size'],
          purpose: 'Store sequential items'
        });
      }

      if (desc.includes('map') || desc.includes('key') || desc.includes('lookup')) {
        structures.push({
          name: 'LookupMap',
          type: 'map',
          properties: { entries: 'Map<string, any>' },
          operations: ['get', 'set', 'has', 'delete'],
          constraints: ['unique_keys', 'fast_lookup'],
          purpose: 'Fast key-based retrieval'
        });
      }

      if (desc.includes('queue') || desc.includes('fifo')) {
        structures.push({
          name: 'ProcessingQueue',
          type: 'queue',
          properties: { items: 'T[]', front: 'number', rear: 'number' },
          operations: ['enqueue', 'dequeue', 'peek', 'isEmpty'],
          constraints: ['fifo_order', 'bounded_size'],
          purpose: 'Sequential processing'
        });
      }
    });

    return structures;
  }

  private async analyzePerformanceRequirements(observation: PseudocodeContext | null): Promise<any> {
    if (!observation) {
      return { success: false, error: 'No observation available' };
    }

    const analysis = {
      time_complexity_targets: this.extractTimeComplexityTargets(observation.performance_constraints),
      space_complexity_limits: this.extractSpaceComplexityLimits(observation.performance_constraints),
      scalability_requirements: observation.scalability_requirements || [],
      optimization_opportunities: this.identifyOptimizationOpportunities(observation.specification)
    };

    return {
      success: true,
      performance_analysis: analysis,
      recommendations: [
        'Consider caching for frequently accessed data',
        'Use appropriate data structures for performance',
        'Implement lazy loading where applicable'
      ],
      next_action: 'identify_algorithm_patterns'
    };
  }

  private async identifyAlgorithmPatterns(observation: PseudocodeContext | null): Promise<any> {
    if (!observation) {
      return { success: false, error: 'No observation available' };
    }
    const requirements = observation.requirements;
    const domainPatterns = observation.domain_patterns;

    const identifiedPatterns = this.suggestAlgorithmPatterns(requirements, domainPatterns);
    const patternDetails = identifiedPatterns.map(pattern => ({
      name: pattern,
      description: this.getPatternDescription(pattern),
      complexity: this.getPatternComplexity(pattern),
      use_cases: this.getPatternUseCases(pattern)
    }));

    return {
      success: true,
      identified_patterns: patternDetails,
      recommendations: this.generatePatternRecommendations(patternDetails),
      next_action: 'generate_pseudocode'
    };
  }

  private async generatePseudocode(observation: PseudocodeContext | null): Promise<any> {
    if (!observation) {
      return { success: false, error: 'No observation available' };
    }

    const specification = observation.specification;
    const algorithmPatterns = observation.algorithm_patterns || [];
    const dataStructures = this.suggestDataStructures(observation.requirements || []);

    // Generate algorithm steps
    const algorithms = this.generateAlgorithmSteps(specification, algorithmPatterns);

    // Generate control flows
    const controlFlows = this.generateControlFlows(specification);

    // Create pseudocode document
    const pseudocodeDoc: PseudocodeDocument = {
      project: specification.project,
      feature: specification.feature,
      version: '1.0.0',
      algorithms,
      data_structures: dataStructures,
      control_flows: controlFlows,
      performance_considerations: this.generatePerformanceConsiderations(algorithms),
      edge_cases: this.identifyEdgeCases(specification),
      assumptions: this.extractAssumptions(specification),
      complexity_analysis: this.analyzeComplexity(algorithms),
      completeness_score: this.calculateCompleteness(algorithms, dataStructures, controlFlows),
      clarity_score: this.calculateClarity(algorithms),
      implementability_score: this.calculateImplementability(algorithms, dataStructures)
    };

    // Store pseudocode document
    await this.memory.store(`sparc_pseudocode:${pseudocodeDoc.project}:${pseudocodeDoc.feature}`, pseudocodeDoc, {
      type: 'artifact' as const,
      tags: ['sparc', 'pseudocode', 'algorithm'],
      partition: 'sparc'
    });

    return {
      success: true,
      pseudocode_document: pseudocodeDoc,
      algorithm_count: algorithms.length,
      data_structure_count: dataStructures.length,
      overall_quality: (pseudocodeDoc.completeness_score + pseudocodeDoc.clarity_score + pseudocodeDoc.implementability_score) / 3
    };
  }

  private generateAlgorithmSteps(specification: any, patterns: string[]): AlgorithmStep[] {
    const steps: AlgorithmStep[] = [];

    specification.requirements?.forEach((req: any, reqIndex: number) => {
      if (req.type === 'functional') {
        const stepCount = this.estimateStepCount(req.description);

        for (let i = 0; i < stepCount; i++) {
          steps.push({
            id: `STEP-${String(++this.stepCounter).padStart(3, '0')}`,
            sequence: i + 1,
            operation: this.generateOperationName(req.description, i),
            description: this.generateStepDescription(req.description, i),
            inputs: this.identifyInputs(req.description),
            outputs: this.identifyOutputs(req.description),
            conditions: this.extractConditions(req.description),
            complexity: this.estimateComplexity(req.description, i),
            error_handling: this.generateErrorHandling(req.description)
          });
        }
      }
    });

    return steps;
  }

  private generateControlFlows(specification: any): ControlFlow[] {
    const flows: ControlFlow[] = [];

    specification.requirements?.forEach((req: any) => {
      const desc = req.description?.toLowerCase() || '';

      if (desc.includes('if') || desc.includes('when') || desc.includes('condition')) {
        flows.push({
          type: 'conditional',
          condition: this.extractCondition(req.description),
          branches: this.generateBranches(req.description),
          error_handling: ['Handle invalid conditions', 'Provide default behavior']
        });
      }

      if (desc.includes('loop') || desc.includes('repeat') || desc.includes('each')) {
        flows.push({
          type: 'loop',
          iteration_logic: this.extractIterationLogic(req.description),
          termination_condition: this.extractTerminationCondition(req.description),
          error_handling: ['Prevent infinite loops', 'Handle empty collections']
        });
      }
    });

    return flows;
  }

  // Helper methods for algorithm generation
  private estimateStepCount(description: string): number {
    const complexityWords = ['process', 'calculate', 'validate', 'transform', 'analyze'];
    const matchCount = complexityWords.filter(word => description.toLowerCase().includes(word)).length;
    return Math.max(2, Math.min(8, matchCount + 2));
  }

  private generateOperationName(description: string, stepIndex: number): string {
    const operations = ['validate', 'process', 'transform', 'calculate', 'store', 'retrieve', 'analyze', 'format'];
    return operations[stepIndex % operations.length] + '_data';
  }

  private generateStepDescription(description: string, stepIndex: number): string {
    const templates = [
      'Validate input parameters and constraints',
      'Process data according to business rules',
      'Transform data to required format',
      'Calculate results based on inputs',
      'Store results in appropriate structure',
      'Retrieve necessary data for processing',
      'Analyze data for patterns or anomalies',
      'Format output for presentation'
    ];
    return templates[stepIndex % templates.length];
  }

  private identifyInputs(description: string): string[] {
    // Extract potential inputs from requirement description
    const inputs = ['user_input', 'system_data', 'configuration'];

    if (description.toLowerCase().includes('file')) inputs.push('file_data');
    if (description.toLowerCase().includes('user')) inputs.push('user_credentials');
    if (description.toLowerCase().includes('database')) inputs.push('database_connection');

    return inputs.slice(0, 3); // Limit to 3 inputs for clarity
  }

  private identifyOutputs(description: string): string[] {
    const outputs = ['processed_result', 'status_code'];

    if (description.toLowerCase().includes('report')) outputs.push('report_data');
    if (description.toLowerCase().includes('notification')) outputs.push('notification_message');
    if (description.toLowerCase().includes('file')) outputs.push('file_path');

    return outputs.slice(0, 2); // Limit to 2 outputs for clarity
  }

  private extractConditions(description: string): string[] {
    const conditions: string[] = [];

    if (description.toLowerCase().includes('valid')) conditions.push('input_is_valid');
    if (description.toLowerCase().includes('authorized')) conditions.push('user_is_authorized');
    if (description.toLowerCase().includes('available')) conditions.push('resource_is_available');

    return conditions;
  }

  private estimateComplexity(description: string, stepIndex: number): AlgorithmStep['complexity'] {
    const complexityKeywords = {
      'O(1)': ['get', 'set', 'access', 'assign'],
      'O(log n)': ['search', 'binary', 'tree'],
      'O(n)': ['iterate', 'scan', 'traverse', 'validate'],
      'O(n log n)': ['sort', 'merge', 'heap'],
      'O(n²)': ['compare', 'matrix', 'nested'],
      'O(2^n)': ['recursive', 'backtrack', 'permutation']
    };

    const desc = description.toLowerCase();

    for (const [complexity, keywords] of Object.entries(complexityKeywords)) {
      if (keywords.some(keyword => desc.includes(keyword))) {
        return complexity as AlgorithmStep['complexity'];
      }
    }

    return 'O(n)'; // Default complexity
  }

  private generateErrorHandling(description: string): string[] {
    const errorHandling = ['Validate input parameters', 'Handle null/undefined values'];

    if (description.toLowerCase().includes('file')) {
      errorHandling.push('Handle file not found', 'Handle file permission errors');
    }
    if (description.toLowerCase().includes('network') || description.toLowerCase().includes('api')) {
      errorHandling.push('Handle network timeouts', 'Handle API errors');
    }
    if (description.toLowerCase().includes('database')) {
      errorHandling.push('Handle database connection errors', 'Handle transaction failures');
    }

    return errorHandling.slice(0, 4); // Limit to 4 error handling scenarios
  }

  private extractCondition(description: string): string {
    // Extract condition from requirement description
    const conditionPatterns = [
      /if\s+(.+?)\s+then/i,
      /when\s+(.+?)\s+,/i,
      /provided\s+(.+)/i
    ];

    for (const pattern of conditionPatterns) {
      const match = description.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return 'specified_condition_is_met';
  }

  private generateBranches(description: string): ControlFlow[] {
    return [
      {
        type: 'sequential',
        error_handling: ['Handle positive case']
      },
      {
        type: 'sequential',
        error_handling: ['Handle alternative case']
      }
    ];
  }

  private extractIterationLogic(description: string): string {
    if (description.toLowerCase().includes('each')) {
      return 'for_each_item_in_collection';
    }
    if (description.toLowerCase().includes('while')) {
      return 'while_condition_is_true';
    }
    return 'iterate_through_data_set';
  }

  private extractTerminationCondition(description: string): string {
    return 'all_items_processed_or_condition_met';
  }

  private generatePerformanceConsiderations(algorithms: AlgorithmStep[]): string[] {
    const considerations: string[] = [];

    const hasHighComplexity = algorithms.some(step =>
      ['O(n²)', 'O(2^n)'].includes(step.complexity)
    );

    if (hasHighComplexity) {
      considerations.push('Consider optimization for high-complexity operations');
    }

    considerations.push(
      'Monitor memory usage for large datasets',
      'Implement caching for frequently accessed data',
      'Consider parallel processing for independent operations'
    );

    return considerations;
  }

  private identifyEdgeCases(specification: any): string[] {
    return [
      'Empty input data',
      'Maximum input size',
      'Invalid input format',
      'Network connectivity issues',
      'Resource exhaustion scenarios'
    ];
  }

  private extractAssumptions(specification: any): string[] {
    const assumptions = specification.assumptions || [];

    return [
      ...assumptions,
      'Input data follows expected format',
      'System resources are sufficient',
      'Dependencies are available and functional'
    ];
  }

  private analyzeComplexity(algorithms: AlgorithmStep[]): any {
    const complexities = algorithms.map(step => step.complexity);
    const worstCase = this.findWorstComplexity(complexities);

    return {
      time_complexity: worstCase,
      space_complexity: this.estimateSpaceComplexity(algorithms),
      scalability_notes: this.generateScalabilityNotes(worstCase)
    };
  }

  private findWorstComplexity(complexities: string[]): string {
    const order = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(2^n)'];

    let worst = 'O(1)';
    complexities.forEach(complexity => {
      if (order.indexOf(complexity) > order.indexOf(worst)) {
        worst = complexity;
      }
    });

    return worst;
  }

  private estimateSpaceComplexity(algorithms: AlgorithmStep[]): string {
    // Simplified space complexity estimation
    const hasRecursive = algorithms.some(step =>
      step.description.toLowerCase().includes('recursive')
    );

    if (hasRecursive) return 'O(n)';
    return 'O(1)';
  }

  private generateScalabilityNotes(complexity: string): string[] {
    const notes: string[] = [];

    switch (complexity) {
      case 'O(n²)':
      case 'O(2^n)':
        notes.push('Consider optimization for large datasets');
        notes.push('May require alternative algorithms for scale');
        break;
      case 'O(n log n)':
        notes.push('Good scalability for most use cases');
        break;
      case 'O(n)':
        notes.push('Linear scaling suitable for most scenarios');
        break;
      default:
        notes.push('Excellent scalability characteristics');
    }

    return notes;
  }

  private calculateCompleteness(algorithms: AlgorithmStep[], dataStructures: DataStructure[], controlFlows: ControlFlow[]): number {
    let score = 0;

    // Algorithm completeness
    if (algorithms.length > 0) score += 0.4;
    if (algorithms.every(alg => alg.inputs.length > 0 && alg.outputs.length > 0)) score += 0.2;

    // Data structure completeness
    if (dataStructures.length > 0) score += 0.2;

    // Control flow completeness
    if (controlFlows.length > 0) score += 0.2;

    return score;
  }

  private calculateClarity(algorithms: AlgorithmStep[]): number {
    if (algorithms.length === 0) return 0;

    const clarityScores = algorithms.map(alg => {
      let score = 0.5; // Base score

      if (alg.description.length > 20) score += 0.2; // Good description
      if (alg.error_handling.length > 0) score += 0.2; // Error handling defined
      if (alg.conditions && alg.conditions.length > 0) score += 0.1; // Conditions specified

      return Math.min(1, score);
    });

    return clarityScores.reduce((sum, score) => sum + score, 0) / clarityScores.length;
  }

  private calculateImplementability(algorithms: AlgorithmStep[], dataStructures: DataStructure[]): number {
    let score = 0;

    // Check if algorithms have clear operations
    if (algorithms.every(alg => alg.operation && alg.description)) score += 0.4;

    // Check if data structures are well-defined
    if (dataStructures.every(ds => ds.operations.length > 0)) score += 0.3;

    // Check complexity feasibility
    const hasReasonableComplexity = algorithms.every(alg =>
      !['O(2^n)'].includes(alg.complexity)
    );
    if (hasReasonableComplexity) score += 0.3;

    return score;
  }

  // Utility methods
  private extractTimeComplexityTargets(constraints: Record<string, any>): string[] {
    const targets: string[] = [];

    if (constraints.response_time) {
      targets.push(`Response time: ${constraints.response_time}`);
    }
    if (constraints.throughput) {
      targets.push(`Throughput: ${constraints.throughput}`);
    }

    return targets;
  }

  private extractSpaceComplexityLimits(constraints: Record<string, any>): string[] {
    const limits: string[] = [];

    if (constraints.memory_limit) {
      limits.push(`Memory limit: ${constraints.memory_limit}`);
    }
    if (constraints.storage_limit) {
      limits.push(`Storage limit: ${constraints.storage_limit}`);
    }

    return limits;
  }

  private identifyOptimizationOpportunities(requirements: any[]): string[] {
    return [
      'Implement caching for repeated operations',
      'Use lazy loading for large datasets',
      'Consider parallel processing',
      'Optimize database queries'
    ];
  }

  private getPatternDescription(pattern: string): string {
    const descriptions: Record<string, string> = {
      'search_algorithm': 'Efficient data retrieval using search techniques',
      'sorting_algorithm': 'Data ordering using optimal sorting methods',
      'optimization_algorithm': 'Finding optimal solutions within constraints',
      'graph_algorithm': 'Processing relationships and network structures',
      'caching_pattern': 'Storing frequently accessed data for quick retrieval'
    };

    return descriptions[pattern] || 'General algorithmic pattern';
  }

  private getPatternComplexity(pattern: string): string {
    const complexities: Record<string, string> = {
      'search_algorithm': 'O(log n) to O(n)',
      'sorting_algorithm': 'O(n log n)',
      'optimization_algorithm': 'O(n²) to O(2^n)',
      'graph_algorithm': 'O(V + E)',
      'caching_pattern': 'O(1)'
    };

    return complexities[pattern] || 'O(n)';
  }

  private getPatternUseCases(pattern: string): string[] {
    const useCases: Record<string, string[]> = {
      'search_algorithm': ['Data lookup', 'Information retrieval', 'Pattern matching'],
      'sorting_algorithm': ['Data ordering', 'Report generation', 'Data processing'],
      'optimization_algorithm': ['Resource allocation', 'Path finding', 'Cost minimization'],
      'graph_algorithm': ['Network analysis', 'Relationship mapping', 'Dependency resolution'],
      'caching_pattern': ['Performance optimization', 'Data persistence', 'Quick access']
    };

    return useCases[pattern] || ['General purpose'];
  }

  private generatePatternRecommendations(patterns: any[]): string[] {
    const recommendations: string[] = [];

    patterns.forEach(pattern => {
      if (pattern.complexity.includes('O(2^n)')) {
        recommendations.push(`Consider optimizing ${pattern.name} for better performance`);
      }
      if (pattern.name.includes('search')) {
        recommendations.push('Implement indexing for faster search operations');
      }
    });

    if (recommendations.length === 0) {
      recommendations.push('Patterns are well-suited for the requirements');
    }

    return recommendations;
  }

  protected generateId(): string {
    return `pseudo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  protected buildReasoning(
    factors: ReasoningFactor[],
    heuristics: string[],
    evidence: Evidence[]
  ): ExplainableReasoning {
    return {
      factors,
      heuristics: heuristics as any,
      evidence,
      assumptions: ['Specifications are accurate', 'Algorithm patterns are applicable'],
      limitations: ['Performance analysis is estimated', 'Implementation may reveal additional complexity']
    };
  }
}