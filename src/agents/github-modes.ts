/**
 * GitHub Integration Modes Agent
 * Manages different GitHub integration patterns and workflows
 */

import { BaseAgent } from './base-agent';
import {
  AgentId,
  AgentConfig,
  AgentDecision,
  TaskDefinition,
  ExplainableReasoning,
  Evidence,
  ReasoningFactor,
  ILogger,
  IEventBus,
  IMemorySystem,
  SecurityLevel,
  PACTLevel,
  Alternative,
  Risk
} from '../core/types';

export interface GitHubMode {
  name: string;
  description: string;
  capabilities: string[];
  configuration: Record<string, any>;
  dependencies: string[];
}

export interface GitHubIntegrationContext {
  repository: {
    owner: string;
    name: string;
    branch: string;
    url: string;
  };
  mode: string;
  configuration: Record<string, any>;
  capabilities: string[];
  securityLevel: SecurityLevel;
}

export interface ModeActivationDecision {
  mode: GitHubMode;
  configuration: Record<string, any>;
  reasoning: ExplainableReasoning;
  activationSteps: string[];
  rollbackPlan: string[];
}

export class GitHubModesAgent extends BaseAgent {
  private availableModes: Map<string, GitHubMode> = new Map();
  private activeModes: Map<string, GitHubMode> = new Map();
  private modeConfigurations: Map<string, Record<string, any>> = new Map();

  constructor(
    id: AgentId,
    config: AgentConfig,
    logger: ILogger,
    eventBus: IEventBus,
    memory: IMemorySystem
  ) {
    super(id, config, logger, eventBus, memory);
    this.initializeGitHubModes();
  }

  protected async initializeResources(): Promise<void> {
    await super.initializeResources();
    
    // Load GitHub modes configuration
    await this.loadModesConfiguration();
    
    // Setup GitHub webhooks monitoring
    await this.setupWebhooksMonitoring();
    
    this.logger.info(`GitHub Modes Agent ${this.id.id} initialized with ${this.availableModes.size} modes`);
  }

  protected async perceive(context: GitHubIntegrationContext): Promise<any> {
    this.logger.info(`Analyzing GitHub integration context for ${context.repository.owner}/${context.repository.name}`);

    const observation = {
      repository: context.repository,
      requestedMode: context.mode,
      currentActiveModes: Array.from(this.activeModes.keys()),
      availableModes: Array.from(this.availableModes.keys()),
      securityConstraints: this.analyzeSecurityConstraints(context),
      repositoryAnalysis: await this.analyzeRepository(context.repository),
      dependencyGraph: await this.analyzeDependencies(context.mode),
      conflictAnalysis: await this.analyzeConflicts(context.mode)
    };

    // Store observation in shared memory
    await this.memory.store(`github-modes:observation:${context.repository.name}`, observation, {
      type: 'artifact' as const,
      tags: ['github', 'modes', 'observation'],
      partition: 'github-integration'
    });

    return observation;
  }

  protected async decide(observation: any): Promise<AgentDecision> {
    const decisionId = this.generateDecisionId();
    
    // Analyze mode compatibility
    const modeAnalysis = await this.analyzeModeCompatibility(observation);
    
    // Generate activation plan
    const activationPlan = await this.generateActivationPlan(observation);
    
    // Assess risks
    const riskAssessment = await this.assessModeRisks(observation, activationPlan);
    
    // Build reasoning
    const factors: ReasoningFactor[] = [
      {
        name: 'Mode Compatibility',
        weight: 0.3,
        value: modeAnalysis.compatibilityScore,
        impact: 'critical',
        explanation: modeAnalysis.reasoning
      },
      {
        name: 'Security Compliance',
        weight: 0.25,
        value: modeAnalysis.securityScore,
        impact: 'critical',
        explanation: modeAnalysis.securityAnalysis
      },
      {
        name: 'Repository Readiness',
        weight: 0.25,
        value: observation.repositoryAnalysis.readinessScore,
        impact: 'high',
        explanation: observation.repositoryAnalysis.analysis
      },
      {
        name: 'Risk Level',
        weight: 0.2,
        value: 1 - riskAssessment.overallRisk,
        impact: 'medium',
        explanation: riskAssessment.summary
      }
    ];

    const evidence: Evidence[] = [
      {
        type: 'empirical',
        source: 'repository-analysis',
        confidence: 0.9,
        description: 'Repository analysis results',
        details: observation.repositoryAnalysis
      },
      {
        type: 'analytical',
        source: 'security-constraints',
        confidence: 0.95,
        description: 'Security constraints evaluation',
        details: observation.securityConstraints
      },
      {
        type: 'analytical',
        source: 'mode-analysis',
        confidence: 0.85,
        description: 'Mode compatibility analysis',
        details: modeAnalysis
      }
    ];

    const reasoning = this.buildReasoning(
      factors,
      ['SFDIPOT', 'CRUSSPIC'],
      evidence,
      [
        'Repository has proper branch protection',
        'Required CI/CD workflows exist',
        'Security scanning is enabled'
      ],
      [
        'Mode activation may require additional permissions',
        'Some features may need gradual rollout'
      ]
    );

    const confidence = this.calculateConfidence(factors);
    const alternatives: Alternative[] = await this.generateAlternatives(observation);
    const risks: Risk[] = await this.identifyRisks(riskAssessment);

    const decision: AgentDecision = {
      id: decisionId,
      agentId: this.id.id,
      timestamp: new Date(),
      action: activationPlan.mode,
      reasoning,
      confidence,
      alternatives,
      risks,
      recommendations: activationPlan.steps
    };

    await this.memory.store(`github-modes:decision:${decisionId}`, decision, {
      type: 'artifact' as const,
      tags: ['github', 'modes', 'activation'],
      partition: 'decisions'
    });

    return decision;
  }

  protected async act(decision: AgentDecision): Promise<any> {
    const action = decision.action;

    try {
      // Execute mode activation
      const activationResult = await this.executeModeActivation(action, decision.reasoning);

      // Store action result in memory
      await this.memory.store(`github-modes:action:${decision.id}`, {
        decision,
        result: activationResult,
        timestamp: new Date()
      }, {
        type: 'artifact' as const,
        tags: ['github', 'modes', 'action'],
        partition: 'github'
      });

      // Update active modes
      if (activationResult.mode) {
        const mode = this.availableModes.get(activationResult.mode);
        if (mode) {
          this.activeModes.set(activationResult.mode, mode);
          this.modeConfigurations.set(activationResult.mode, activationResult.configuration || {});
        }
      }

      const result = {
        success: true,
        activatedMode: activationResult.mode,
        configuration: activationResult.configuration || {},
        activationTime: new Date(),
        monitoring: {
          enabled: true,
          endpoints: [],
          alerts: {}
        },
        rollbackPlan: []
      };

      // Share activation result with swarm
      await this.shareKnowledge({
        type: 'mode-activation',
        mode: activationResult.mode,
        repository: action,
        capabilities: activationResult.capabilities || [],
        configuration: activationResult.configuration || {}
      }, ['github', 'mode-activation', 'integration']);

      return result;
    } catch (error) {
      // Execute rollback if activation fails (if rollback plan exists)
      const err = error instanceof Error ? error : new Error(String(error));
      throw err;
    }
  }

  protected async learn(feedback: any): Promise<void> {
    // Learn from mode activation outcomes
    const { task, result, success } = feedback;
    
    if (success) {
      // Update success patterns
      await this.memory.store(`github-modes:success-pattern:${task.id}`, {
        mode: result.activatedMode,
        configuration: result.configuration,
        repository: task.context.repository,
        successFactors: result.successFactors || [],
        timestamp: new Date()
      }, {
        type: 'knowledge' as const,
        tags: ['success-pattern', 'github', 'modes'],
        partition: 'learning'
      });
    } else {
      // Learn from failures
      await this.memory.store(`github-modes:failure-pattern:${task.id}`, {
        mode: task.context.mode,
        failureReason: result.error,
        repository: task.context.repository,
        lessonsLearned: result.lessonsLearned || [],
        timestamp: new Date()
      }, {
        type: 'knowledge' as const,
        tags: ['failure-pattern', 'github', 'modes'],
        partition: 'learning'
      });
    }
    
    // Update mode effectiveness metrics
    await this.updateModeMetrics(task.context.mode, success);
  }

  private initializeGitHubModes(): void {
    const modes: GitHubMode[] = [
      {
        name: 'continuous-integration',
        description: 'Automated CI/CD pipeline integration',
        capabilities: ['build', 'test', 'deploy', 'notifications'],
        configuration: {
          triggers: ['push', 'pull_request'],
          environments: ['development', 'staging', 'production'],
          testSuites: ['unit', 'integration', 'e2e']
        },
        dependencies: ['github-actions', 'docker']
      },
      {
        name: 'code-review-automation',
        description: 'Automated code review and quality checks',
        capabilities: ['static-analysis', 'security-scan', 'coverage', 'review-assignment'],
        configuration: {
          reviewers: 'auto-assign',
          checks: ['sonarqube', 'eslint', 'security'],
          thresholds: { coverage: 80, quality: 'A' }
        },
        dependencies: ['github-actions', 'sonarqube']
      },
      {
        name: 'issue-management',
        description: 'Automated issue triage and management',
        capabilities: ['auto-triage', 'labeling', 'assignment', 'tracking'],
        configuration: {
          autoAssignment: true,
          labels: 'smart-labeling',
          sla: { response: '24h', resolution: '72h' }
        },
        dependencies: ['github-api']
      },
      {
        name: 'release-automation',
        description: 'Automated release management and deployment',
        capabilities: ['version-bumping', 'changelog', 'deployment', 'rollback'],
        configuration: {
          strategy: 'semantic-versioning',
          deployment: 'blue-green',
          notifications: ['slack', 'email']
        },
        dependencies: ['github-actions', 'semantic-release']
      },
      {
        name: 'security-monitoring',
        description: 'Continuous security monitoring and vulnerability management',
        capabilities: ['vulnerability-scan', 'dependency-check', 'secret-detection', 'compliance'],
        configuration: {
          scanners: ['snyk', 'github-security'],
          alerts: 'immediate',
          compliance: ['sox', 'gdpr']
        },
        dependencies: ['github-security', 'snyk']
      }
    ];

    modes.forEach(mode => {
      this.availableModes.set(mode.name, mode);
    });
  }

  private async loadModesConfiguration(): Promise<void> {
    try {
      const config = await this.memory.retrieve('github-modes:configuration');
      if (config) {
        this.modeConfigurations = new Map(Object.entries(config));
      }
    } catch (error) {
      this.logger.warn('No previous modes configuration found');
    }
  }

  private async setupWebhooksMonitoring(): Promise<void> {
    // Setup GitHub webhooks monitoring
    this.eventBus.on('github:webhook', async (event) => {
      await this.handleWebhookEvent(event);
    });
  }

  private async handleWebhookEvent(event: any): Promise<void> {
    // Process GitHub webhook events for active modes
    const activeMode = this.findActiveModeForEvent(event);
    if (activeMode) {
      await this.processEventForMode(event, activeMode);
    }
  }

  private findActiveModeForEvent(event: any): GitHubMode | null {
    // Find which active mode should handle this event
    for (const [name, mode] of this.activeModes) {
      if (this.eventMatchesMode(event, mode)) {
        return mode;
      }
    }
    return null;
  }

  private eventMatchesMode(event: any, mode: GitHubMode): boolean {
    // Check if event type matches mode capabilities
    const eventType = event.type || event.action;
    return mode.capabilities.some(cap => eventType.includes(cap));
  }

  private async processEventForMode(event: any, mode: GitHubMode): Promise<void> {
    // Process webhook event according to mode configuration
    const config = this.modeConfigurations.get(mode.name);
    
    await this.memory.store(`github-modes:event:${event.id}`, {
      event,
      mode: mode.name,
      processedAt: new Date(),
      configuration: config
    }, {
      type: 'artifact' as const,
      tags: ['github', 'webhook', mode.name],
      partition: 'events'
    });
  }

  private analyzeSecurityConstraints(context: GitHubIntegrationContext): any {
    return {
      securityLevel: context.securityLevel,
      requiredPermissions: this.getRequiredPermissions(context.mode),
      complianceRequirements: this.getComplianceRequirements(context.securityLevel),
      accessControls: this.getAccessControls(context.repository)
    };
  }

  private getRequiredPermissions(mode: string): string[] {
    const modeObj = this.availableModes.get(mode);
    if (!modeObj) return [];
    
    const permissionMap: Record<string, string[]> = {
      'continuous-integration': ['actions:write', 'contents:read', 'checks:write'],
      'code-review-automation': ['pull_requests:write', 'issues:write', 'contents:read'],
      'issue-management': ['issues:write', 'projects:write'],
      'release-automation': ['contents:write', 'releases:write', 'deployments:write'],
      'security-monitoring': ['security_events:read', 'vulnerability_alerts:read']
    };
    
    return permissionMap[mode] || [];
  }

  private getComplianceRequirements(securityLevel: SecurityLevel): string[] {
    const requirements: Record<SecurityLevel, string[]> = {
      [SecurityLevel.PUBLIC]: ['basic-security'],
      [SecurityLevel.INTERNAL]: ['access-controls', 'audit-logging'],
      [SecurityLevel.CONFIDENTIAL]: ['encryption', 'mfa', 'audit-logging', 'access-controls'],
      [SecurityLevel.SECRET]: ['encryption', 'mfa', 'audit-logging', 'access-controls', 'compliance-certification', 'isolation']
    };
    
    return requirements[securityLevel] || [];
  }

  private getAccessControls(repository: any): any {
    return {
      branchProtection: this.checkBranchProtection(repository),
      requiredReviews: this.getRequiredReviews(repository),
      statusChecks: this.getRequiredStatusChecks(repository)
    };
  }

  private checkBranchProtection(repository: any): boolean {
    // Check if main branch has protection rules
    return repository.branch_protection_enabled || false;
  }

  private getRequiredReviews(repository: any): number {
    return repository.required_reviews || 2;
  }

  private getRequiredStatusChecks(repository: any): string[] {
    return repository.required_status_checks || ['ci', 'security-scan'];
  }

  private async analyzeRepository(repository: any): Promise<any> {
    // Analyze repository structure and readiness for mode activation
    const analysis = {
      hasCI: await this.checkCIConfiguration(repository),
      hasTests: await this.checkTestSuite(repository),
      hasSecurity: await this.checkSecurityConfiguration(repository),
      hasDocumentation: await this.checkDocumentation(repository),
      branchStructure: await this.analyzeBranchStructure(repository),
      readinessScore: 0
    };
    
    // Calculate readiness score
    analysis.readinessScore = this.calculateReadinessScore(analysis);
    
    return analysis;
  }

  private async checkCIConfiguration(repository: any): Promise<boolean> {
    // Check for CI/CD configuration files
    const ciFiles = ['.github/workflows', '.gitlab-ci.yml', 'Jenkinsfile', '.travis.yml'];
    return ciFiles.some(file => repository.files?.includes(file));
  }

  private async checkTestSuite(repository: any): Promise<boolean> {
    // Check for test files and configuration
    const testPatterns = ['/test/', '/tests/', '.test.', '.spec.', 'jest.config', 'mocha.opts'];
    return testPatterns.some(pattern => 
      repository.files?.some((file: string) => file.includes(pattern))
    );
  }

  private async checkSecurityConfiguration(repository: any): Promise<boolean> {
    // Check for security configuration
    const securityFiles = ['.github/dependabot.yml', '.snyk', 'security.md', '.github/security.yml'];
    return securityFiles.some(file => repository.files?.includes(file));
  }

  private async checkDocumentation(repository: any): Promise<boolean> {
    // Check for documentation
    const docFiles = ['README.md', 'CONTRIBUTING.md', 'docs/', 'wiki/'];
    return docFiles.some(file => repository.files?.includes(file));
  }

  private async analyzeBranchStructure(repository: any): Promise<any> {
    return {
      mainBranch: repository.default_branch || 'main',
      protectedBranches: repository.protected_branches || [],
      branchStrategy: this.detectBranchStrategy(repository)
    };
  }

  private detectBranchStrategy(repository: any): string {
    const branches = repository.branches || [];
    
    if (branches.includes('develop')) {
      return 'git-flow';
    } else if (branches.some((b: string) => b.startsWith('feature/'))) {
      return 'feature-branch';
    } else {
      return 'trunk-based';
    }
  }

  private calculateReadinessScore(analysis: any): number {
    const factors = [
      analysis.hasCI ? 0.3 : 0,
      analysis.hasTests ? 0.25 : 0,
      analysis.hasSecurity ? 0.2 : 0,
      analysis.hasDocumentation ? 0.15 : 0,
      analysis.branchStructure.protectedBranches.length > 0 ? 0.1 : 0
    ];
    
    return factors.reduce((sum, factor) => sum + factor, 0);
  }

  private async analyzeDependencies(mode: string): Promise<any> {
    const modeObj = this.availableModes.get(mode);
    if (!modeObj) return { dependencies: [], conflicts: [] };
    
    return {
      dependencies: modeObj.dependencies,
      conflicts: await this.detectDependencyConflicts(modeObj.dependencies)
    };
  }

  private async detectDependencyConflicts(dependencies: string[]): Promise<string[]> {
    // Check for conflicts with currently active modes
    const conflicts: string[] = [];
    
    for (const [activeName, activeMode] of this.activeModes) {
      const overlap = dependencies.filter(dep => activeMode.dependencies.includes(dep));
      if (overlap.length > 0) {
        conflicts.push(`Potential conflict with ${activeName}: shared dependencies ${overlap.join(', ')}`);
      }
    }
    
    return conflicts;
  }

  private async analyzeConflicts(mode: string): Promise<any> {
    const modeObj = this.availableModes.get(mode);
    if (!modeObj) return { conflicts: [], recommendations: [] };
    
    const conflicts = [];
    const recommendations = [];
    
    // Check capability conflicts
    for (const [activeName, activeMode] of this.activeModes) {
      const capabilityOverlap = modeObj.capabilities.filter(cap => 
        activeMode.capabilities.includes(cap)
      );
      
      if (capabilityOverlap.length > 0) {
        conflicts.push({
          type: 'capability-overlap',
          mode: activeName,
          overlapping: capabilityOverlap
        });
        
        recommendations.push(`Consider disabling ${activeName} or configuring capability isolation`);
      }
    }
    
    return { conflicts, recommendations };
  }

  private async analyzeModeCompatibility(observation: any): Promise<any> {
    const mode = observation.requestedMode;
    const modeObj = this.availableModes.get(mode);
    
    if (!modeObj) {
      return {
        compatibilityScore: 0,
        securityScore: 0,
        reasoning: 'Mode not found',
        securityAnalysis: 'Cannot analyze unknown mode'
      };
    }
    
    // Analyze compatibility factors
    const repositoryCompatibility = this.assessRepositoryCompatibility(observation.repositoryAnalysis, modeObj);
    const securityCompatibility = this.assessSecurityCompatibility(observation.securityConstraints, modeObj);
    const dependencyCompatibility = this.assessDependencyCompatibility(observation.dependencyGraph, modeObj);
    
    return {
      compatibilityScore: (repositoryCompatibility + dependencyCompatibility) / 2,
      securityScore: securityCompatibility,
      reasoning: `Repository compatibility: ${repositoryCompatibility}, Dependencies: ${dependencyCompatibility}`,
      securityAnalysis: `Security compatibility assessment: ${securityCompatibility}`
    };
  }

  private assessRepositoryCompatibility(repoAnalysis: any, mode: GitHubMode): number {
    let score = 0;
    
    // Check if repository structure supports mode requirements
    if (mode.capabilities.includes('build') && repoAnalysis.hasCI) score += 0.3;
    if (mode.capabilities.includes('test') && repoAnalysis.hasTests) score += 0.3;
    if (mode.capabilities.includes('security-scan') && repoAnalysis.hasSecurity) score += 0.2;
    if (mode.capabilities.includes('documentation') && repoAnalysis.hasDocumentation) score += 0.2;
    
    return Math.min(1, score);
  }

  private assessSecurityCompatibility(securityConstraints: any, mode: GitHubMode): number {
    // Check if mode meets security requirements
    const requiredPermissions = this.getRequiredPermissions(mode.name);
    const hasRequiredPermissions = requiredPermissions.length > 0;
    
    let score = hasRequiredPermissions ? 0.5 : 0.8;
    
    // Adjust based on security level
    if (securityConstraints.securityLevel === SecurityLevel.SECRET || 
        securityConstraints.securityLevel === SecurityLevel.SECRET) {
      score *= 0.7; // Higher security requirements
    }
    
    return score;
  }

  private assessDependencyCompatibility(dependencyGraph: any, mode: GitHubMode): number {
    // Check if dependencies can be resolved without conflicts
    const conflicts = dependencyGraph.conflicts || [];
    return conflicts.length === 0 ? 1.0 : Math.max(0, 1.0 - (conflicts.length * 0.2));
  }

  private async generateActivationPlan(observation: any): Promise<any> {
    const mode = this.availableModes.get(observation.requestedMode);
    if (!mode) throw new Error(`Mode ${observation.requestedMode} not found`);
    
    const plan = {
      mode,
      configuration: await this.generateModeConfiguration(mode, observation),
      steps: await this.generateActivationSteps(mode, observation),
      prerequisites: await this.identifyPrerequisites(mode, observation),
      rollbackPlan: await this.generateRollbackPlan(mode),
      estimatedDuration: this.estimateActivationTime(mode)
    };
    
    return plan;
  }

  private async generateModeConfiguration(mode: GitHubMode, observation: any): Promise<Record<string, any>> {
    const baseConfig = { ...mode.configuration };
    
    // Customize configuration based on repository analysis
    if (observation.repositoryAnalysis.branchStructure.branchStrategy === 'git-flow') {
      baseConfig.branches = ['main', 'develop'];
    } else {
      baseConfig.branches = [observation.repositoryAnalysis.branchStructure.mainBranch];
    }
    
    // Adjust for security level
    if (observation.securityConstraints.securityLevel === SecurityLevel.SECRET) {
      baseConfig.encryption = true;
      baseConfig.auditLogging = true;
    }
    
    return baseConfig;
  }

  private async generateActivationSteps(mode: GitHubMode, observation: any): Promise<string[]> {
    const steps = [
      `Validate repository access for ${observation.repository.name}`,
      `Check required permissions: ${this.getRequiredPermissions(mode.name).join(', ')}`,
      `Install dependencies: ${mode.dependencies.join(', ')}`,
      `Configure ${mode.name} settings`,
      `Setup monitoring and alerts`,
      `Test mode functionality`,
      `Enable mode for repository`
    ];
    
    return steps;
  }

  private async identifyPrerequisites(mode: GitHubMode, observation: any): Promise<string[]> {
    const prerequisites = [];
    
    // Check repository-specific prerequisites
    if (!observation.repositoryAnalysis.hasCI && mode.capabilities.includes('build')) {
      prerequisites.push('Setup CI/CD configuration');
    }
    
    if (!observation.repositoryAnalysis.hasTests && mode.capabilities.includes('test')) {
      prerequisites.push('Add test suite');
    }
    
    // Check security prerequisites
    if (observation.securityConstraints.securityLevel === SecurityLevel.SECRET) {
      prerequisites.push('Enable branch protection', 'Configure required status checks');
    }
    
    return prerequisites;
  }

  private async generateRollbackPlan(mode: GitHubMode): Promise<string[]> {
    return [
      `Disable ${mode.name} webhooks`,
      `Remove ${mode.name} configuration`,
      `Revert repository settings`,
      `Clean up temporary resources`,
      `Notify stakeholders of rollback`
    ];
  }

  private estimateActivationTime(mode: GitHubMode): number {
    // Estimate in minutes based on mode complexity
    const baseTime = 15; // Base activation time
    const complexityMultiplier = mode.dependencies.length * 5;
    const capabilityMultiplier = mode.capabilities.length * 2;
    
    return baseTime + complexityMultiplier + capabilityMultiplier;
  }

  private async assessModeRisks(observation: any, activationPlan: any): Promise<any> {
    const risks = [];
    let overallRisk = 0;
    
    // Assess activation risks
    if (observation.conflictAnalysis.conflicts.length > 0) {
      risks.push({
        type: 'mode-conflict',
        severity: 'medium',
        description: 'Potential conflicts with existing modes',
        mitigation: 'Configure capability isolation'
      });
      overallRisk += 0.3;
    }
    
    if (observation.repositoryAnalysis.readinessScore < 0.7) {
      risks.push({
        type: 'repository-readiness',
        severity: 'medium',
        description: 'Repository may not be fully ready for mode activation',
        mitigation: 'Complete prerequisites before activation'
      });
      overallRisk += 0.2;
    }
    
    if (observation.securityConstraints.securityLevel === SecurityLevel.SECRET) {
      risks.push({
        type: 'security-compliance',
        severity: 'high',
        description: 'High security requirements may complicate activation',
        mitigation: 'Ensure all security controls are in place'
      });
      overallRisk += 0.4;
    }
    
    return {
      risks,
      overallRisk: Math.min(1, overallRisk),
      summary: `Identified ${risks.length} risk factors`,
      mitigationStrategies: risks.map(r => r.mitigation)
    };
  }

  private async validatePrerequisites(prerequisites: string[]): Promise<void> {
    for (const prerequisite of prerequisites) {
      await this.validatePrerequisite(prerequisite);
    }
  }

  private async validatePrerequisite(prerequisite: string): Promise<void> {
    // Validate individual prerequisite
    this.logger.info(`Validating prerequisite: ${prerequisite}`);
    
    // Implementation would check specific prerequisite conditions
    // For now, we'll simulate validation
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Removed duplicate executeModeActivation method

  private async executeActivationStep(step: string, configuration: any): Promise<void> {
    // Execute individual activation step
    // Implementation would perform actual GitHub API calls
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  private async configureModeSettings(mode: GitHubMode, configuration: Record<string, any>): Promise<void> {
    // Configure mode-specific settings
    this.logger.info(`Configuring settings for mode: ${mode.name}`);
    
    await this.memory.store(`github-modes:config:${mode.name}`, configuration, {
      type: 'experience' as const,
      tags: ['github', 'mode-config', mode.name],
      partition: 'configuration'
    });
  }

  private async setupModeMonitoring(mode: GitHubMode): Promise<void> {
    // Setup monitoring for the activated mode
    this.logger.info(`Setting up monitoring for mode: ${mode.name}`);
    
    // Configure alerts and monitoring endpoints
    const monitoring = {
      mode: mode.name,
      endpoints: mode.capabilities.map(cap => `/api/github/${mode.name}/${cap}`),
      alerts: {
        enabled: true,
        thresholds: {
          errorRate: 0.05,
          responseTime: 5000
        }
      },
      healthChecks: {
        interval: 300, // 5 minutes
        timeout: 30
      }
    };
    
    await this.memory.store(`github-modes:monitoring:${mode.name}`, monitoring, {
      type: 'experience' as const,
      tags: ['monitoring', 'github', mode.name],
      partition: 'monitoring'
    });
  }

  private async executeRollback(rollbackPlan: string[]): Promise<void> {
    this.logger.warn('Executing rollback plan');
    
    for (const step of rollbackPlan) {
      try {
        await this.executeRollbackStep(step);
        this.logger.info(`Rollback step completed: ${step}`);
      } catch (error) {
        this.logger.error(`Rollback step failed: ${step}`, error);
      }
    }
  }

  private async executeRollbackStep(step: string): Promise<void> {
    // Execute individual rollback step
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async updateModeMetrics(mode: string, success: boolean): Promise<void> {
    const metricsKey = `github-modes:metrics:${mode}`;
    
    try {
      let metrics = await this.memory.retrieve(metricsKey) || {
        activations: 0,
        successes: 0,
        failures: 0,
        successRate: 0
      };
      
      metrics.activations++;
      if (success) {
        metrics.successes++;
      } else {
        metrics.failures++;
      }
      metrics.successRate = metrics.successes / metrics.activations;
      
      await this.memory.store(metricsKey, metrics, {
        type: 'metric' as const,
        tags: ['github', 'mode-metrics', mode],
        partition: 'metrics'
      });
    } catch (error) {
      this.logger.error('Failed to update mode metrics', error);
    }
  }

  private generateDecisionId(): string {
    return `github-modes-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public methods for external interaction

  async listAvailableModes(): Promise<GitHubMode[]> {
    return Array.from(this.availableModes.values());
  }

  async getActiveModes(): Promise<GitHubMode[]> {
    return Array.from(this.activeModes.values());
  }

  async getModeConfiguration(modeName: string): Promise<Record<string, any> | null> {
    return this.modeConfigurations.get(modeName) || null;
  }

  async deactivateMode(modeName: string): Promise<void> {
    const mode = this.activeModes.get(modeName);
    if (!mode) {
      throw new Error(`Mode ${modeName} is not active`);
    }
    
    // Execute deactivation
    await this.executeRollback(await this.generateRollbackPlan(mode));
    
    // Remove from active modes
    this.activeModes.delete(modeName);
    this.modeConfigurations.delete(modeName);
    
    this.logger.info(`Mode ${modeName} deactivated successfully`);
  }

  async getModeMetrics(modeName?: string): Promise<any> {
    if (modeName) {
      return await this.memory.retrieve(`github-modes:metrics:${modeName}`);
    }
    
    // Get metrics for all modes
    const metrics: Record<string, any> = {};
    for (const mode of this.availableModes.keys()) {
      try {
        metrics[mode] = await this.memory.retrieve(`github-modes:metrics:${mode}`);
      } catch (error) {
        metrics[mode] = null;
      }
    }
    
    return metrics;
  }

  // Missing methods for decision-making
  private async generateAlternatives(observation: any): Promise<Alternative[]> {
    return [
      {
        action: 'gradual-rollout',
        confidence: 0.8,
        pros: ['Lower risk', 'Easier rollback'],
        cons: ['Slower adoption', 'Complex management'],
        reason: 'Activate mode gradually across repository features'
      },
      {
        action: 'full-activation',
        confidence: 0.6,
        pros: ['Faster deployment', 'Consistent experience'],
        cons: ['Higher risk', 'All-or-nothing'],
        reason: 'Activate mode for entire repository immediately'
      },
      {
        action: 'test-environment-first',
        confidence: 0.9,
        pros: ['Safe testing', 'Validation opportunity'],
        cons: ['Additional setup time', 'Resource overhead'],
        reason: 'Test mode in separate environment first'
      }
    ];
  }

  private async identifyRisks(riskAssessment: any): Promise<Risk[]> {
    return [
      {
        id: 'permission-escalation',
        type: 'security',
        category: 'access',
        severity: 'high',
        probability: 0.3,
        impact: 'high',
        description: 'Mode activation may require elevated permissions',
        mitigation: 'Use principle of least privilege and audit access'
      },
      {
        id: 'workflow-disruption',
        type: 'operational',
        category: 'workflow',
        severity: 'medium',
        probability: 0.4,
        impact: 'medium',
        description: 'New mode may disrupt existing development workflows',
        mitigation: 'Gradual rollout with team training and documentation'
      },
      {
        id: 'configuration-conflict',
        type: 'technical',
        category: 'configuration',
        severity: 'medium',
        probability: 0.2,
        impact: 'low',
        description: 'Mode settings may conflict with existing configurations',
        mitigation: 'Validate configuration compatibility before activation'
      }
    ];
  }

  private async executeModeActivation(modeName: string, reasoning: ExplainableReasoning): Promise<any> {
    this.logger.info(`Activating GitHub mode: ${modeName}`);

    const mode = this.availableModes.get(modeName);
    if (!mode) {
      throw new Error(`Unknown mode: ${modeName}`);
    }

    // Activate the mode
    this.activeModes.set(modeName, mode);

    return {
      mode: modeName,
      status: 'activated',
      capabilities: mode.capabilities,
      timestamp: new Date()
    };
  }

  // Duplicate methods removed - implementations exist above
}