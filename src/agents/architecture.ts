/**
 * Architecture Agent
 *
 * Specializes in the Architecture phase of SPARC methodology
 * Designs system architecture, defines components, interfaces, and structure
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

interface SystemComponent {
  id: string;
  name: string;
  type: 'service' | 'module' | 'library' | 'database' | 'gateway' | 'controller' | 'repository' | 'utility';
  responsibilities: string[];
  interfaces: ComponentInterface[];
  dependencies: string[];
  technology_stack: string[];
  scalability_requirements: string[];
  security_considerations: string[];
  performance_requirements: Record<string, any>;
}

interface ComponentInterface {
  name: string;
  type: 'api' | 'event' | 'database' | 'file' | 'message_queue';
  protocol: string;
  methods: InterfaceMethod[];
  data_contracts: DataContract[];
  security_requirements: string[];
  versioning_strategy: string;
}

interface InterfaceMethod {
  name: string;
  parameters: Parameter[];
  return_type: string;
  error_conditions: string[];
  performance_requirements: Record<string, any>;
}

interface Parameter {
  name: string;
  type: string;
  required: boolean;
  validation_rules: string[];
}

interface DataContract {
  name: string;
  schema: Record<string, any>;
  validation_rules: string[];
  versioning: string;
}

interface ArchitecturalPattern {
  name: string;
  description: string;
  benefits: string[];
  trade_offs: string[];
  implementation_considerations: string[];
  suitable_for: string[];
}

interface ArchitectureDocument {
  project: string;
  feature: string;
  version: string;
  components: SystemComponent[];
  architectural_patterns: ArchitecturalPattern[];
  deployment_model: DeploymentModel;
  quality_attributes: QualityAttribute[];
  constraints: string[];
  assumptions: string[];
  risks: ArchitecturalRisk[];
  design_decisions: DesignDecision[];
  completeness_score: number;
  consistency_score: number;
  implementability_score: number;
}

interface DeploymentModel {
  strategy: 'monolithic' | 'microservices' | 'serverless' | 'hybrid';
  environments: Environment[];
  scaling_strategy: string;
  monitoring_requirements: string[];
  disaster_recovery: string[];
}

interface Environment {
  name: string;
  infrastructure: string[];
  configuration: Record<string, any>;
  security_requirements: string[];
}

interface QualityAttribute {
  attribute: 'performance' | 'security' | 'scalability' | 'maintainability' | 'reliability' | 'usability';
  requirements: string[];
  metrics: Record<string, any>;
  implementation_strategies: string[];
}

interface ArchitecturalRisk {
  id: string;
  description: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  probability: 'low' | 'medium' | 'high';
  mitigation_strategies: string[];
}

interface DesignDecision {
  id: string;
  decision: string;
  rationale: string;
  alternatives_considered: string[];
  implications: string[];
  stakeholders: string[];
}

interface ArchitectureContext {
  specification: any;
  pseudocode: any;
  quality_requirements: Record<string, any>;
  technical_constraints: string[];
  business_constraints: string[];
  existing_architecture?: any;
  technology_preferences: string[];
  team_expertise: string[];
  deployment_constraints: string[];
}

export class ArchitectureAgent extends BaseAgent {
  private componentCounter = 0;
  private decisionCounter = 0;
  private qualityThresholds = {
    min_completeness: 0.85,
    min_consistency: 0.9,
    min_implementability: 0.8
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

  protected async perceive(context: any): Promise<ArchitectureContext> {
    this.logger.debug('Architecture agent perceiving system context', { agentId: this.id });

    // Retrieve SPARC artifacts from previous phases
    const specification = await this.memory.retrieve(`sparc_specification:${context.project}:${context.feature}`);
    const pseudocode = await this.memory.retrieve(`sparc_pseudocode:${context.project}:${context.feature}`);

    // Get existing architecture if available
    const existingArchitecture = await this.memory.retrieve(`architecture:${context.project}`) || null;

    // Get team and technology context
    const teamContext = await this.memory.retrieve(`team_context:${context.project}`) || {};
    const technologyContext = await this.memory.retrieve(`technology_context:${context.project}`) || {};

    const architectureContext: ArchitectureContext = {
      specification: specification || context.specification,
      pseudocode: pseudocode || context.pseudocode,
      quality_requirements: context.quality_requirements || {},
      technical_constraints: context.technical_constraints || [],
      business_constraints: context.business_constraints || [],
      existing_architecture: existingArchitecture,
      technology_preferences: technologyContext.preferences || [],
      team_expertise: teamContext.expertise || [],
      deployment_constraints: context.deployment_constraints || []
    };

    // Store context for other agents
    await this.memory.store(`architecture_context:${context.project}:${context.feature}`, architectureContext, {
      type: 'knowledge' as const,
      tags: ['sparc', 'architecture', 'system-design'],
      partition: 'sparc'
    });

    return architectureContext;
  }

  protected async decide(observation: ArchitectureContext): Promise<AgentDecision> {
    this.logger.debug('Architecture agent making design decision', { agentId: this.id });

    const analysisResults = this.analyzeRequirements(observation);

    let decision: AgentDecision;

    if (analysisResults.requires_pattern_selection) {
      decision = {
        id: this.generateId(),
        agentId: this.id.id,
        timestamp: new Date(),
        action: 'select_architectural_patterns',
        confidence: 0.8,
        reasoning: this.buildReasoning([
          { name: 'pattern_selection_needed', value: 'true', weight: 0.4, impact: 'high', explanation: 'Pattern selection needed for architecture' },
          { name: 'quality_requirements_defined', value: Object.keys(observation.quality_requirements).length > 0, weight: 0.3, impact: 'medium', explanation: 'Quality requirements are defined' },
          { name: 'constraints_understood', value: 'true', weight: 0.3, impact: 'medium', explanation: 'Constraints are understood' }
        ], ['CRUSSPIC'], [
          { type: 'empirical', source: 'specification_pseudocode', confidence: 0.8, description: 'Architectural patterns needed' }
        ]),
        alternatives: [],
        risks: [],
        recommendations: ['Select appropriate architectural patterns']
      };
    } else if (analysisResults.requires_component_design) {
      decision = {
        id: this.generateId(),
        agentId: this.id.id,
        timestamp: new Date(),
        action: 'design_components',
        confidence: 0.85,
        reasoning: this.buildReasoning([
          { name: 'patterns_selected', value: 'true', weight: 0.3, impact: 'medium', explanation: 'Patterns have been selected' },
          { name: 'requirements_clear', value: analysisResults.requirements_clarity, weight: 0.4, impact: 'high', explanation: 'Requirements clarity assessed' },
          { name: 'pseudocode_available', value: !!observation.pseudocode, weight: 0.3, impact: 'medium', explanation: 'Pseudocode availability checked' }
        ], ['SFDIPOT'], [
          { type: 'analytical', source: 'pattern_analysis', confidence: 0.85, description: 'Ready for component design' }
        ]),
        alternatives: [],
        risks: [],
        recommendations: ['Design system components']
      };
    } else {
      decision = {
        id: this.generateId(),
        agentId: this.id.id,
        timestamp: new Date(),
        action: 'finalize_architecture',
        confidence: 0.9,
        reasoning: this.buildReasoning([
          { name: 'components_designed', value: 'complete', weight: 0.4, impact: 'high', explanation: 'Components have been designed' },
          { name: 'interfaces_defined', value: 'complete', weight: 0.3, impact: 'high', explanation: 'Interfaces have been defined' },
          { name: 'quality_validated', value: 'pending', weight: 0.3, impact: 'medium', explanation: 'Quality validation pending' }
        ], ['FEW_HICCUPPS'], [
          { type: 'analytical', source: 'component_design', confidence: 0.9, description: 'Architecture ready for finalization' }
        ]),
        alternatives: [],
        risks: [],
        recommendations: ['Finalize architecture design']
      };
    }

    return decision;
  }

  protected async act(decision: AgentDecision): Promise<any> {
    this.logger.info('Architecture agent executing action', {
      agentId: this.id,
      action: decision.action
    });

    let result: any;

    switch (decision.action) {
      case 'select_architectural_patterns':
        result = await this.selectArchitecturalPatterns({ action: decision.action });
        break;

      case 'design_components':
        result = await this.designComponents({ action: decision.action });
        break;

      case 'finalize_architecture':
        result = await this.finalizeArchitecture({ action: decision.action });
        break;

      default:
        this.logger.warn('Unknown architecture action requested', { action: decision.action });
        result = { success: false, error: 'Unknown action' };
    }

    // Store action result
    await this.memory.store(`architecture_action:${decision.id}`, {
      decision,
      result,
      timestamp: Date.now()
    }, {
      type: 'artifact' as const,
      tags: ['sparc', 'architecture', decision.action],
      partition: 'sparc'
    });

    return result;
  }

  protected async learn(feedback: any): Promise<void> {
    this.logger.debug('Architecture agent learning from feedback', { agentId: this.id });

    if (feedback.implementation_feedback) {
      const implFeedback = feedback.implementation_feedback;

      // Adjust based on implementation difficulties
      if (implFeedback.component_complexity > 0.8) {
        this.qualityThresholds.min_implementability = Math.min(0.9, this.qualityThresholds.min_implementability + 0.05);
      }

      if (implFeedback.interface_issues) {
        this.qualityThresholds.min_consistency = Math.min(0.95, this.qualityThresholds.min_consistency + 0.03);
      }
    }

    if (feedback.deployment_feedback) {
      const deployFeedback = feedback.deployment_feedback;

      // Learn from deployment challenges
      if (deployFeedback.scalability_issues) {
        this.qualityThresholds.min_completeness = Math.min(0.95, this.qualityThresholds.min_completeness + 0.02);
      }
    }

    // Store learning outcomes
    await this.memory.store('architecture_agent_learning', {
      timestamp: Date.now(),
      qualityThresholds: this.qualityThresholds,
      feedback
    }, {
      type: 'experience' as const,
      tags: ['sparc', 'architecture', 'adaptation'],
      partition: 'sparc'
    });
  }

  private analyzeRequirements(context: ArchitectureContext): any {
    const specification = context.specification;
    const pseudocode = context.pseudocode;

    // Determine complexity level
    const complexity_level = this.assessComplexity(specification, pseudocode, context);

    // Analyze scalability needs
    const scalability_needs = this.identifyScalabilityNeeds(specification, context.quality_requirements);

    // Check if patterns are already selected
    const requires_pattern_selection = !context.existing_architecture?.patterns;

    // Check if components need design
    const requires_component_design = requires_pattern_selection ||
      !context.existing_architecture?.components ||
      context.existing_architecture.components.length === 0;

    // Extract functional requirements
    const functional_requirements = specification?.requirements?.filter((req: any) => req.type === 'functional') || [];

    return {
      complexity_level,
      scalability_needs,
      requires_pattern_selection,
      requires_component_design,
      functional_requirements,
      requirements_clarity: functional_requirements.length > 0 ? 0.8 : 0.4,
      selected_patterns: context.existing_architecture?.patterns || [],
      designed_components: context.existing_architecture?.components || [],
      designed_interfaces: context.existing_architecture?.interfaces || [],
      deployment_strategy: context.existing_architecture?.deployment || null
    };
  }

  private assessComplexity(specification: any, pseudocode: any, context: ArchitectureContext): 'low' | 'medium' | 'high' {
    let complexityScore = 0;

    // Functional complexity
    const requirements = specification?.requirements || [];
    if (requirements.length > 10) complexityScore += 1;
    if (requirements.some((req: any) => req.type === 'non-functional')) complexityScore += 1;

    // Algorithmic complexity
    if (pseudocode?.algorithms?.some((alg: any) => ['O(n²)', 'O(2^n)'].includes(alg.complexity))) {
      complexityScore += 2;
    }

    // Integration complexity
    if (context.technical_constraints.some(constraint =>
      constraint.toLowerCase().includes('integration') ||
      constraint.toLowerCase().includes('legacy'))) {
      complexityScore += 1;
    }

    // Quality requirements complexity
    if (Object.keys(context.quality_requirements).length > 5) complexityScore += 1;

    if (complexityScore >= 4) return 'high';
    if (complexityScore >= 2) return 'medium';
    return 'low';
  }

  private identifyScalabilityNeeds(specification: any, qualityRequirements: Record<string, any>): string[] {
    const needs: string[] = [];

    // Check for explicit scalability requirements
    if (qualityRequirements.scalability) {
      needs.push('horizontal_scaling');
    }

    // Check for performance requirements that imply scale
    if (qualityRequirements.performance?.concurrent_users > 1000) {
      needs.push('load_balancing');
    }

    // Check for data volume requirements
    if (qualityRequirements.data_volume === 'large') {
      needs.push('data_partitioning');
    }

    // Check specification for scale indicators
    const requirements = specification?.requirements || [];
    requirements.forEach((req: any) => {
      const desc = req.description?.toLowerCase() || '';
      if (desc.includes('scale') || desc.includes('concurrent') || desc.includes('distributed')) {
        if (!needs.includes('horizontal_scaling')) needs.push('horizontal_scaling');
      }
    });

    return needs;
  }

  private async selectArchitecturalPatterns(parameters: any): Promise<any> {
    const qualityRequirements = parameters.quality_requirements;
    const constraints = parameters.constraints;
    const complexityLevel = parameters.complexity_level;

    const selectedPatterns = this.recommendPatterns(qualityRequirements, constraints, complexityLevel);

    const patternDetails = selectedPatterns.map(pattern => ({
      name: pattern,
      description: this.getPatternDescription(pattern),
      benefits: this.getPatternBenefits(pattern),
      trade_offs: this.getPatternTradeOffs(pattern),
      implementation_considerations: this.getImplementationConsiderations(pattern),
      suitable_for: this.getSuitableScenarios(pattern)
    }));

    return {
      success: true,
      selected_patterns: patternDetails,
      pattern_count: patternDetails.length,
      next_action: 'design_components',
      recommendations: this.generatePatternRecommendations(patternDetails)
    };
  }

  private async designComponents(parameters: any): Promise<any> {
    const functionalRequirements = parameters.functional_requirements;
    const dataStructures = parameters.data_structures;
    const algorithms = parameters.algorithms;
    const patterns = parameters.patterns;

    // Design system components
    const components = this.generateComponents(functionalRequirements, dataStructures, algorithms, patterns);

    // Design interfaces
    const interfaces = this.generateInterfaces(components, functionalRequirements);

    // Create deployment model
    const deploymentModel = this.createDeploymentModel(components, patterns);

    return {
      success: true,
      components,
      interfaces,
      deployment_model: deploymentModel,
      component_count: components.length,
      interface_count: interfaces.reduce((sum, comp) => sum + comp.interfaces.length, 0),
      next_action: 'finalize_architecture'
    };
  }

  private async finalizeArchitecture(parameters: any): Promise<any> {
    const components = parameters.components;
    const interfaces = parameters.interfaces;
    const deploymentModel = parameters.deployment_model;

    // Create quality attributes
    const qualityAttributes = this.defineQualityAttributes();

    // Identify risks
    const risks = this.identifyArchitecturalRisks(components, deploymentModel);

    // Document design decisions
    const designDecisions = this.documentDesignDecisions(components, deploymentModel);

    // Create final architecture document
    const architectureDoc: ArchitectureDocument = {
      project: components[0]?.name?.split('-')[0] || 'unknown',
      feature: components[0]?.name?.split('-')[1] || 'unknown',
      version: '1.0.0',
      components,
      architectural_patterns: [], // Will be populated from earlier selections
      deployment_model: deploymentModel,
      quality_attributes: qualityAttributes,
      constraints: [],
      assumptions: this.extractArchitecturalAssumptions(),
      risks,
      design_decisions: designDecisions,
      completeness_score: this.calculateArchitectureCompleteness(components, interfaces),
      consistency_score: this.calculateArchitectureConsistency(components),
      implementability_score: this.calculateImplementability(components, deploymentModel)
    };

    // Store architecture document
    await this.memory.store(`sparc_architecture:${architectureDoc.project}:${architectureDoc.feature}`, architectureDoc, {
      type: 'artifact' as const,
      tags: ['sparc', 'architecture', 'system-design'],
      partition: 'sparc'
    });

    return {
      success: true,
      architecture_document: architectureDoc,
      component_count: components.length,
      risk_count: risks.length,
      decision_count: designDecisions.length,
      overall_quality: (architectureDoc.completeness_score + architectureDoc.consistency_score + architectureDoc.implementability_score) / 3
    };
  }

  // Pattern recommendation methods
  private recommendPatterns(qualityRequirements: Record<string, any>, constraints: string[], complexityLevel: string): string[] {
    const patterns: string[] = [];

    // Based on quality requirements
    if (qualityRequirements.scalability) {
      patterns.push('microservices', 'load_balancer');
    }

    if (qualityRequirements.security) {
      patterns.push('authentication_gateway', 'encryption_layer');
    }

    if (qualityRequirements.performance) {
      patterns.push('caching_layer', 'database_optimization');
    }

    // Based on complexity
    if (complexityLevel === 'high') {
      patterns.push('layered_architecture', 'dependency_injection');
    }

    // Based on constraints
    if (constraints.some(c => c.includes('legacy'))) {
      patterns.push('adapter_pattern', 'facade_pattern');
    }

    return [...new Set(patterns)]; // Remove duplicates
  }

  private getPatternDescription(pattern: string): string {
    const descriptions: Record<string, string> = {
      'microservices': 'Decompose application into small, independent services',
      'layered_architecture': 'Organize code into logical layers with clear separation',
      'load_balancer': 'Distribute incoming requests across multiple instances',
      'caching_layer': 'Store frequently accessed data for quick retrieval',
      'authentication_gateway': 'Centralized authentication and authorization',
      'dependency_injection': 'Manage dependencies through inversion of control'
    };

    return descriptions[pattern] || 'Architectural pattern for system design';
  }

  private getPatternBenefits(pattern: string): string[] {
    const benefits: Record<string, string[]> = {
      'microservices': ['Independent deployment', 'Technology diversity', 'Fault isolation'],
      'layered_architecture': ['Clear separation of concerns', 'Maintainability', 'Testability'],
      'load_balancer': ['High availability', 'Scalability', 'Performance'],
      'caching_layer': ['Improved performance', 'Reduced database load', 'Better user experience']
    };

    return benefits[pattern] || ['Improved system design'];
  }

  private getPatternTradeOffs(pattern: string): string[] {
    const tradeOffs: Record<string, string[]> = {
      'microservices': ['Increased complexity', 'Network overhead', 'Distributed system challenges'],
      'layered_architecture': ['Performance overhead', 'Potential rigidity', 'Layer violation risks'],
      'load_balancer': ['Additional infrastructure', 'Single point of failure', 'Configuration complexity'],
      'caching_layer': ['Cache invalidation complexity', 'Memory overhead', 'Consistency challenges']
    };

    return tradeOffs[pattern] || ['Increased complexity'];
  }

  private getImplementationConsiderations(pattern: string): string[] {
    const considerations: Record<string, string[]> = {
      'microservices': ['Service discovery', 'API versioning', 'Data consistency'],
      'layered_architecture': ['Clear interfaces', 'Dependency management', 'Error handling'],
      'load_balancer': ['Health checks', 'Session management', 'Failover strategies'],
      'caching_layer': ['Cache strategies', 'Expiration policies', 'Cache warming']
    };

    return considerations[pattern] || ['Standard implementation practices'];
  }

  private getSuitableScenarios(pattern: string): string[] {
    const scenarios: Record<string, string[]> = {
      'microservices': ['Large teams', 'Independent scaling', 'Technology diversity'],
      'layered_architecture': ['Clear business domains', 'Standard CRUD operations', 'Team familiarity'],
      'load_balancer': ['High traffic', 'Availability requirements', 'Horizontal scaling'],
      'caching_layer': ['Read-heavy workloads', 'Performance requirements', 'Expensive computations']
    };

    return scenarios[pattern] || ['General purpose applications'];
  }

  private generatePatternRecommendations(patterns: any[]): string[] {
    const recommendations: string[] = [];

    if (patterns.some(p => p.name === 'microservices')) {
      recommendations.push('Consider API gateway for service coordination');
      recommendations.push('Implement distributed tracing for observability');
    }

    if (patterns.some(p => p.name === 'caching_layer')) {
      recommendations.push('Design cache invalidation strategy carefully');
      recommendations.push('Monitor cache hit ratios and performance');
    }

    return recommendations;
  }

  // Component design methods
  private generateComponents(requirements: any[], dataStructures: any[], algorithms: any[], patterns: any[]): SystemComponent[] {
    const components: SystemComponent[] = [];

    // Generate components based on functional requirements
    requirements.forEach((req: any) => {
      const component = this.createComponentFromRequirement(req, dataStructures, algorithms);
      components.push(component);
    });

    // Add infrastructure components based on patterns
    patterns.forEach((pattern: any) => {
      if (pattern.name === 'caching_layer') {
        components.push(this.createCacheComponent());
      }
      if (pattern.name === 'authentication_gateway') {
        components.push(this.createAuthComponent());
      }
    });

    return components;
  }

  private createComponentFromRequirement(requirement: any, dataStructures: any[], algorithms: any[]): SystemComponent {
    return {
      id: `COMP-${String(++this.componentCounter).padStart(3, '0')}`,
      name: this.generateComponentName(requirement.description),
      type: this.determineComponentType(requirement.description),
      responsibilities: [requirement.description, ...this.generateAdditionalResponsibilities(requirement)],
      interfaces: [this.createComponentInterface(requirement)],
      dependencies: this.identifyDependencies(requirement, dataStructures),
      technology_stack: ['typescript', 'node.js'],
      scalability_requirements: this.extractScalabilityRequirements(requirement),
      security_considerations: this.extractSecurityConsiderations(requirement),
      performance_requirements: this.extractPerformanceRequirements(requirement)
    };
  }

  private generateComponentName(description: string): string {
    const words = description.toLowerCase().split(' ');
    const actionWords = ['create', 'manage', 'process', 'handle', 'validate', 'generate'];
    const entityWords = ['user', 'data', 'file', 'report', 'notification'];

    let name = '';
    for (const word of words) {
      if (entityWords.includes(word)) {
        name += word.charAt(0).toUpperCase() + word.slice(1);
      }
    }

    for (const word of words) {
      if (actionWords.includes(word)) {
        name += word.charAt(0).toUpperCase() + word.slice(1) + 'r';
        break;
      }
    }

    return name || 'FeatureComponent';
  }

  private determineComponentType(description: string): SystemComponent['type'] {
    const desc = description.toLowerCase();

    if (desc.includes('database') || desc.includes('store') || desc.includes('persist')) {
      return 'repository';
    }
    if (desc.includes('api') || desc.includes('endpoint') || desc.includes('request')) {
      return 'controller';
    }
    if (desc.includes('service') || desc.includes('business') || desc.includes('logic')) {
      return 'service';
    }
    if (desc.includes('utility') || desc.includes('helper') || desc.includes('tool')) {
      return 'utility';
    }

    return 'module';
  }

  private generateAdditionalResponsibilities(requirement: any): string[] {
    const responsibilities: string[] = [];

    if (requirement.type === 'functional') {
      responsibilities.push('Input validation', 'Error handling', 'Logging');
    }

    if (requirement.priority === 'high') {
      responsibilities.push('Performance monitoring', 'Security validation');
    }

    return responsibilities;
  }

  private createComponentInterface(requirement: any): ComponentInterface {
    return {
      name: `${this.generateComponentName(requirement.description)}Interface`,
      type: 'api',
      protocol: 'HTTP/REST',
      methods: [this.createInterfaceMethod(requirement)],
      data_contracts: [this.createDataContract(requirement)],
      security_requirements: ['Authentication', 'Authorization'],
      versioning_strategy: 'URL versioning'
    };
  }

  private createInterfaceMethod(requirement: any): InterfaceMethod {
    return {
      name: this.generateMethodName(requirement.description),
      parameters: [
        {
          name: 'input',
          type: 'object',
          required: true,
          validation_rules: ['required', 'type:object']
        }
      ],
      return_type: 'Promise<Result>',
      error_conditions: ['ValidationError', 'ProcessingError', 'SystemError'],
      performance_requirements: {
        response_time: '< 2000ms',
        throughput: '> 100 req/sec'
      }
    };
  }

  private generateMethodName(description: string): string {
    const words = description.toLowerCase().split(' ');
    const actionWords = ['create', 'get', 'update', 'delete', 'process', 'validate'];

    for (const word of words) {
      if (actionWords.includes(word)) {
        return word + 'Data';
      }
    }

    return 'processRequest';
  }

  private createDataContract(requirement: any): DataContract {
    return {
      name: `${this.generateComponentName(requirement.description)}Data`,
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          data: { type: 'object' },
          timestamp: { type: 'string', format: 'date-time' }
        },
        required: ['id', 'data']
      },
      validation_rules: ['schema_validation', 'business_rules'],
      versioning: '1.0.0'
    };
  }

  private identifyDependencies(requirement: any, dataStructures: any[]): string[] {
    const dependencies: string[] = [];

    if (requirement.description.toLowerCase().includes('database')) {
      dependencies.push('database_service');
    }

    if (requirement.description.toLowerCase().includes('notification')) {
      dependencies.push('notification_service');
    }

    if (dataStructures.length > 0) {
      dependencies.push('data_access_layer');
    }

    return dependencies;
  }

  private extractScalabilityRequirements(requirement: any): string[] {
    const requirements: string[] = [];

    if (requirement.priority === 'high') {
      requirements.push('horizontal_scaling');
    }

    if (requirement.description.toLowerCase().includes('concurrent')) {
      requirements.push('load_balancing');
    }

    return requirements;
  }

  private extractSecurityConsiderations(requirement: any): string[] {
    const considerations = ['Input validation', 'Output sanitization'];

    if (requirement.description.toLowerCase().includes('user')) {
      considerations.push('Authentication required', 'Authorization checks');
    }

    if (requirement.description.toLowerCase().includes('data')) {
      considerations.push('Data encryption', 'Access logging');
    }

    return considerations;
  }

  private extractPerformanceRequirements(requirement: any): Record<string, any> {
    const requirements: Record<string, any> = {
      response_time: '< 2000ms',
      throughput: '> 50 req/sec'
    };

    if (requirement.priority === 'high') {
      requirements.response_time = '< 1000ms';
      requirements.throughput = '> 100 req/sec';
    }

    return requirements;
  }

  private generateInterfaces(components: SystemComponent[], requirements: any[]): SystemComponent[] {
    // Interfaces are already included in components
    return components;
  }

  private createDeploymentModel(components: SystemComponent[], patterns: any[]): DeploymentModel {
    const strategy = this.determineDeploymentStrategy(components, patterns);

    return {
      strategy,
      environments: this.createEnvironments(),
      scaling_strategy: this.determineScalingStrategy(components),
      monitoring_requirements: this.defineMonitoringRequirements(),
      disaster_recovery: this.defineDisasterRecovery()
    };
  }

  private determineDeploymentStrategy(components: SystemComponent[], patterns: any[]): DeploymentModel['strategy'] {
    if (patterns.some((p: any) => p.name === 'microservices')) {
      return 'microservices';
    }

    if (components.length > 5) {
      return 'hybrid';
    }

    return 'monolithic';
  }

  private createEnvironments(): Environment[] {
    return [
      {
        name: 'development',
        infrastructure: ['docker', 'local_database'],
        configuration: { log_level: 'debug', cache_enabled: false },
        security_requirements: ['basic_auth']
      },
      {
        name: 'production',
        infrastructure: ['kubernetes', 'cloud_database', 'load_balancer'],
        configuration: { log_level: 'error', cache_enabled: true },
        security_requirements: ['ssl_encryption', 'oauth2', 'firewall']
      }
    ];
  }

  private determineScalingStrategy(components: SystemComponent[]): string {
    const hasHighPerformanceReqs = components.some(comp =>
      comp.performance_requirements.throughput?.includes('> 100')
    );

    return hasHighPerformanceReqs ? 'auto_scaling' : 'manual_scaling';
  }

  private defineMonitoringRequirements(): string[] {
    return [
      'Application performance monitoring',
      'Error tracking and alerting',
      'Resource utilization monitoring',
      'Business metrics tracking'
    ];
  }

  private defineDisasterRecovery(): string[] {
    return [
      'Automated backups',
      'Multi-region deployment',
      'Failover procedures',
      'Data replication'
    ];
  }

  // Additional utility components
  private createCacheComponent(): SystemComponent {
    return {
      id: `COMP-${String(++this.componentCounter).padStart(3, '0')}`,
      name: 'CacheService',
      type: 'service',
      responsibilities: ['Data caching', 'Cache invalidation', 'Performance optimization'],
      interfaces: [{
        name: 'CacheInterface',
        type: 'api',
        protocol: 'Redis',
        methods: [{
          name: 'get',
          parameters: [{ name: 'key', type: 'string', required: true, validation_rules: ['required'] }],
          return_type: 'Promise<any>',
          error_conditions: ['KeyNotFound', 'ConnectionError'],
          performance_requirements: { response_time: '< 10ms' }
        }],
        data_contracts: [],
        security_requirements: ['Access control'],
        versioning_strategy: 'backward_compatible'
      }],
      dependencies: ['redis_client'],
      technology_stack: ['redis', 'node.js'],
      scalability_requirements: ['clustering'],
      security_considerations: ['Access control', 'Data encryption'],
      performance_requirements: { response_time: '< 10ms', throughput: '> 1000 req/sec' }
    };
  }

  private createAuthComponent(): SystemComponent {
    return {
      id: `COMP-${String(++this.componentCounter).padStart(3, '0')}`,
      name: 'AuthenticationService',
      type: 'gateway',
      responsibilities: ['User authentication', 'Token validation', 'Authorization'],
      interfaces: [{
        name: 'AuthInterface',
        type: 'api',
        protocol: 'HTTP/REST',
        methods: [{
          name: 'authenticate',
          parameters: [{ name: 'credentials', type: 'object', required: true, validation_rules: ['required', 'credentials'] }],
          return_type: 'Promise<AuthToken>',
          error_conditions: ['InvalidCredentials', 'AccountLocked'],
          performance_requirements: { response_time: '< 1000ms' }
        }],
        data_contracts: [],
        security_requirements: ['Encrypted communication', 'Secure token storage'],
        versioning_strategy: 'URL versioning'
      }],
      dependencies: ['user_repository', 'token_service'],
      technology_stack: ['jwt', 'bcrypt', 'node.js'],
      scalability_requirements: ['stateless_design'],
      security_considerations: ['Password hashing', 'Token security', 'Rate limiting'],
      performance_requirements: { response_time: '< 1000ms', throughput: '> 200 req/sec' }
    };
  }

  // Quality and validation methods
  private defineQualityAttributes(): QualityAttribute[] {
    return [
      {
        attribute: 'performance',
        requirements: ['Response time < 2s', 'Throughput > 100 req/s'],
        metrics: { response_time: 'milliseconds', throughput: 'requests_per_second' },
        implementation_strategies: ['Caching', 'Load balancing', 'Database optimization']
      },
      {
        attribute: 'security',
        requirements: ['Authentication required', 'Data encryption', 'Access control'],
        metrics: { vulnerabilities: 'count', security_score: 'percentage' },
        implementation_strategies: ['OAuth2', 'HTTPS', 'Input validation']
      },
      {
        attribute: 'scalability',
        requirements: ['Horizontal scaling', 'Load distribution'],
        metrics: { concurrent_users: 'count', resource_utilization: 'percentage' },
        implementation_strategies: ['Microservices', 'Load balancers', 'Auto-scaling']
      }
    ];
  }

  private identifyArchitecturalRisks(components: SystemComponent[], deployment: DeploymentModel): ArchitecturalRisk[] {
    const risks: ArchitecturalRisk[] = [];

    // Dependency risks
    if (components.some(comp => comp.dependencies.length > 5)) {
      risks.push({
        id: `RISK-001`,
        description: 'High component coupling may impact maintainability',
        impact: 'medium',
        probability: 'medium',
        mitigation_strategies: ['Reduce dependencies', 'Implement interfaces', 'Use dependency injection']
      });
    }

    // Scalability risks
    if (deployment.strategy === 'monolithic' && components.length > 10) {
      risks.push({
        id: `RISK-002`,
        description: 'Monolithic architecture may limit scalability',
        impact: 'high',
        probability: 'high',
        mitigation_strategies: ['Consider microservices', 'Implement horizontal scaling', 'Optimize performance']
      });
    }

    return risks;
  }

  private documentDesignDecisions(components: SystemComponent[], deployment: DeploymentModel): DesignDecision[] {
    const decisions: DesignDecision[] = [];

    decisions.push({
      id: `DEC-${String(++this.decisionCounter).padStart(3, '0')}`,
      decision: `Selected ${deployment.strategy} deployment strategy`,
      rationale: 'Balances complexity and scalability requirements',
      alternatives_considered: ['Microservices', 'Serverless', 'Monolithic'],
      implications: ['Development complexity', 'Deployment strategy', 'Maintenance overhead'],
      stakeholders: ['Development team', 'Operations team', 'Product owner']
    });

    if (components.some(comp => comp.type === 'service')) {
      decisions.push({
        id: `DEC-${String(++this.decisionCounter).padStart(3, '0')}`,
        decision: 'Implemented service-oriented component structure',
        rationale: 'Provides clear separation of concerns and testability',
        alternatives_considered: ['Layered architecture', 'Event-driven architecture'],
        implications: ['Service boundaries', 'Interface contracts', 'Testing strategy'],
        stakeholders: ['Development team', 'Quality assurance team']
      });
    }

    return decisions;
  }

  private extractArchitecturalAssumptions(): string[] {
    return [
      'System will be deployed in cloud environment',
      'Team has expertise in selected technology stack',
      'External dependencies are reliable and available',
      'Performance requirements are accurately specified',
      'Security requirements meet compliance standards'
    ];
  }

  private calculateArchitectureCompleteness(components: SystemComponent[], interfaces: any[]): number {
    let score = 0;

    // Component completeness
    if (components.length > 0) score += 0.3;
    if (components.every(comp => comp.interfaces.length > 0)) score += 0.2;
    if (components.every(comp => comp.responsibilities.length > 0)) score += 0.2;

    // Interface completeness
    const allInterfaces = components.flatMap(comp => comp.interfaces);
    if (allInterfaces.every(iface => iface.methods.length > 0)) score += 0.2;

    // Security and performance coverage
    if (components.every(comp => comp.security_considerations.length > 0)) score += 0.1;

    return score;
  }

  private calculateArchitectureConsistency(components: SystemComponent[]): number {
    let score = 1.0;

    // Check technology stack consistency
    const techStacks = components.map(comp => comp.technology_stack.join(','));
    const uniqueStacks = [...new Set(techStacks)];
    if (uniqueStacks.length > 3) score -= 0.2; // Too many different tech stacks

    // Check naming consistency
    const hasConsistentNaming = components.every(comp =>
      comp.name.includes('Service') || comp.name.includes('Component') || comp.name.includes('Controller')
    );
    if (!hasConsistentNaming) score -= 0.1;

    // Check interface consistency
    const interfaceTypes = components.flatMap(comp => comp.interfaces.map(iface => iface.type));
    const uniqueInterfaceTypes = [...new Set(interfaceTypes)];
    if (uniqueInterfaceTypes.length > 4) score -= 0.1; // Too many interface types

    return Math.max(0, score);
  }

  private calculateImplementability(components: SystemComponent[], deployment: DeploymentModel): number {
    let score = 0.8; // Base score

    // Check dependency complexity
    const avgDependencies = components.reduce((sum, comp) => sum + comp.dependencies.length, 0) / components.length;
    if (avgDependencies > 5) score -= 0.2;

    // Check deployment complexity
    if (deployment.strategy === 'microservices' && components.length < 3) score -= 0.1; // Over-engineering
    if (deployment.strategy === 'monolithic' && components.length > 15) score -= 0.2; // Too complex for monolith

    // Check technology stack feasibility
    const complexTechnologies = ['kubernetes', 'distributed_cache', 'message_queue'];
    const hasComplexTech = components.some(comp =>
      comp.technology_stack.some(tech => complexTechnologies.includes(tech))
    );
    if (hasComplexTech && deployment.environments.length < 2) score -= 0.1; // Complex tech without proper environments

    return Math.max(0, Math.min(1, score));
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
      assumptions: ['Requirements are stable', 'Technology choices are appropriate'],
      limitations: ['Architecture may need refinement during implementation', 'Performance characteristics are estimates']
    };
  }
}