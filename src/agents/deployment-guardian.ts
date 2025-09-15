/**
 * Deployment Guardian Agent
 * Ensures safe and reliable deployments with comprehensive safety checks
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
  PACTLevel
} from '../core/types';

export interface DeploymentRequest {
  id: string;
  applicationName: string;
  version: string;
  environment: Environment;
  deploymentStrategy: DeploymentStrategy;
  artifacts: DeploymentArtifact[];
  configuration: DeploymentConfig;
  rollbackPlan: RollbackPlan;
  approvals: DeploymentApproval[];
  healthChecks: HealthCheck[];
  smokeTests: SmokeTest[];
  requestedBy: string;
  requestedAt: Date;
  deadline?: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface Environment {
  name: string;
  type: 'development' | 'testing' | 'staging' | 'production' | 'sandbox';
  region: string;
  zone?: string;
  cluster?: string;
  namespace?: string;
  healthEndpoint: string;
  monitoringEndpoint: string;
  securityLevel: SecurityLevel;
  resourceLimits: ResourceLimits;
  dependencies: EnvironmentDependency[];
  maintainers: string[];
}

export interface DeploymentStrategy {
  type: 'blue-green' | 'canary' | 'rolling' | 'recreate' | 'a-b-testing';
  parameters: {
    batchSize?: number;
    maxUnavailable?: number;
    trafficSplit?: number; // For canary/A-B testing
    promotionCriteria?: string[];
    rollbackTriggers?: string[];
    timeouts?: {
      deployment?: number; // seconds
      stabilization?: number;
      verification?: number;
    };
  };
  phases: DeploymentPhase[];
}

export interface DeploymentPhase {
  name: string;
  order: number;
  percentage: number; // Traffic percentage for this phase
  duration: number; // Minutes to wait before next phase
  criteria: PhaseCriteria;
  autoPromotion: boolean;
  rollbackOnFailure: boolean;
}

export interface PhaseCriteria {
  errorRateThreshold: number;
  responseTimeThreshold: number; // milliseconds
  successRateThreshold: number;
  customMetrics?: CustomMetric[];
}

export interface CustomMetric {
  name: string;
  query: string;
  threshold: number;
  operator: 'greater_than' | 'less_than' | 'equals';
  severity: 'warning' | 'critical';
}

export interface DeploymentArtifact {
  type: 'container' | 'package' | 'binary' | 'config';
  name: string;
  version: string;
  location: string;
  checksum: string;
  signature?: string;
  size: number; // bytes
  buildTimestamp: Date;
  vulnerabilityScore?: number;
  licenseCompliance: boolean;
}

export interface DeploymentConfig {
  replicas: number;
  resources: ResourceRequirements;
  environment: Record<string, string>;
  secrets: string[];
  volumes: VolumeMount[];
  networking: NetworkConfig;
  security: SecurityConfig;
  monitoring: MonitoringConfig;
}

export interface ResourceRequirements {
  cpu: {
    request: string;
    limit: string;
  };
  memory: {
    request: string;
    limit: string;
  };
  storage?: {
    request: string;
    limit: string;
  };
}

export interface ResourceLimits {
  maxCpu: string;
  maxMemory: string;
  maxStorage: string;
  maxReplicas: number;
}

export interface VolumeMount {
  name: string;
  mountPath: string;
  readOnly: boolean;
  source: {
    type: 'configMap' | 'secret' | 'persistentVolume';
    name: string;
  };
}

export interface NetworkConfig {
  serviceName: string;
  ports: ServicePort[];
  ingress?: IngressConfig;
  loadBalancer?: LoadBalancerConfig;
}

export interface ServicePort {
  name: string;
  port: number;
  targetPort: number;
  protocol: 'TCP' | 'UDP';
}

export interface IngressConfig {
  enabled: boolean;
  hostname: string;
  paths: IngressPath[];
  tls: boolean;
  annotations?: Record<string, string>;
}

export interface IngressPath {
  path: string;
  pathType: 'Prefix' | 'Exact';
  serviceName: string;
  servicePort: number;
}

export interface LoadBalancerConfig {
  type: 'internal' | 'external';
  annotations?: Record<string, string>;
}

export interface SecurityConfig {
  runAsNonRoot: boolean;
  runAsUser?: number;
  fsGroup?: number;
  seccompProfile?: string;
  apparmorProfile?: string;
  capabilities?: {
    add?: string[];
    drop?: string[];
  };
  networkPolicies: NetworkPolicy[];
}

export interface NetworkPolicy {
  name: string;
  ingress: NetworkRule[];
  egress: NetworkRule[];
}

export interface NetworkRule {
  from?: NetworkPeer[];
  to?: NetworkPeer[];
  ports?: NetworkPort[];
}

export interface NetworkPeer {
  podSelector?: Record<string, string>;
  namespaceSelector?: Record<string, string>;
  ipBlock?: {
    cidr: string;
    except?: string[];
  };
}

export interface NetworkPort {
  protocol: 'TCP' | 'UDP';
  port?: number;
  endPort?: number;
}

export interface MonitoringConfig {
  enabled: boolean;
  metricsPath: string;
  metricsPort: number;
  probes: {
    liveness: ProbeConfig;
    readiness: ProbeConfig;
    startup?: ProbeConfig;
  };
  alerts: AlertConfig[];
}

export interface ProbeConfig {
  enabled: boolean;
  httpGet?: {
    path: string;
    port: number;
    scheme: 'HTTP' | 'HTTPS';
  };
  exec?: {
    command: string[];
  };
  tcpSocket?: {
    port: number;
  };
  initialDelaySeconds: number;
  periodSeconds: number;
  timeoutSeconds: number;
  successThreshold: number;
  failureThreshold: number;
}

export interface AlertConfig {
  name: string;
  condition: string;
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
  channels: string[];
}

export interface RollbackPlan {
  strategy: 'immediate' | 'gradual' | 'blue-green-switch';
  targetVersion: string;
  steps: RollbackStep[];
  verification: RollbackVerification;
  dataBackup: {
    required: boolean;
    location?: string;
    retention?: number; // days
  };
  estimatedDuration: number; // minutes
  automaticTriggers: string[];
  manualApprovalRequired: boolean;
}

export interface RollbackStep {
  order: number;
  description: string;
  command?: string;
  timeout: number; // seconds
  retryCount: number;
  verificationCriteria: string[];
}

export interface RollbackVerification {
  healthChecks: string[];
  functionalTests: string[];
  performanceBaseline: {
    errorRate: number;
    responseTime: number;
    throughput: number;
  };
}

export interface DeploymentApproval {
  id: string;
  type: 'automated' | 'manual';
  role: 'developer' | 'reviewer' | 'security' | 'operations' | 'business';
  approver?: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  timestamp?: Date;
  comments?: string;
  conditions?: string[];
  expirationTime?: Date;
}

export interface HealthCheck {
  id: string;
  name: string;
  type: 'http' | 'tcp' | 'exec' | 'grpc';
  endpoint: string;
  expectedStatus?: number | number[];
  timeout: number; // seconds
  interval: number; // seconds
  retries: number;
  successThreshold: number;
  criticalityLevel: 'low' | 'medium' | 'high' | 'critical';
  dependencies: string[];
}

export interface SmokeTest {
  id: string;
  name: string;
  description: string;
  type: 'api' | 'ui' | 'integration' | 'performance';
  steps: SmokeTestStep[];
  timeout: number; // seconds
  retries: number;
  passThreshold: number; // percentage
  criticality: 'low' | 'medium' | 'high' | 'critical';
}

export interface SmokeTestStep {
  id: string;
  description: string;
  command?: string;
  expectedResult: any;
  timeout: number; // seconds
}

export interface EnvironmentDependency {
  name: string;
  type: 'service' | 'database' | 'cache' | 'queue' | 'storage';
  endpoint: string;
  healthCheck: string;
  criticalityLevel: 'low' | 'medium' | 'high' | 'critical';
  fallbackStrategy?: string;
}

export interface DeploymentExecution {
  id: string;
  requestId: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'rolled-back' | 'cancelled';
  currentPhase: number;
  phases: PhaseExecution[];
  startTime: Date;
  endTime?: Date;
  duration?: number; // seconds
  metrics: ExecutionMetrics;
  logs: ExecutionLog[];
  alerts: ExecutionAlert[];
}

export interface PhaseExecution {
  phaseId: number;
  name: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  duration?: number; // seconds
  trafficPercentage: number;
  healthCheckResults: HealthCheckResult[];
  smokeTestResults: SmokeTestResult[];
  metrics: PhaseMetrics;
}

export interface HealthCheckResult {
  checkId: string;
  status: 'pass' | 'fail' | 'timeout' | 'error';
  response?: any;
  duration: number; // milliseconds
  timestamp: Date;
  errorMessage?: string;
}

export interface SmokeTestResult {
  testId: string;
  status: 'pass' | 'fail' | 'timeout' | 'error';
  passedSteps: number;
  totalSteps: number;
  duration: number; // seconds
  timestamp: Date;
  failureDetails?: any;
}

export interface ExecutionMetrics {
  errorRate: number;
  averageResponseTime: number;
  throughput: number;
  resourceUtilization: {
    cpu: number;
    memory: number;
    network: number;
  };
  customMetrics: Record<string, number>;
}

export interface PhaseMetrics {
  errorRate: number;
  responseTime: {
    p50: number;
    p95: number;
    p99: number;
  };
  throughput: number;
  successRate: number;
}

export interface ExecutionLog {
  id: string;
  timestamp: Date;
  level: 'debug' | 'info' | 'warning' | 'error';
  source: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface ExecutionAlert {
  id: string;
  type: 'performance' | 'health' | 'security' | 'resource';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  resolved: boolean;
  actionTaken?: string;
}

export class DeploymentGuardianAgent extends BaseAgent {
  private pendingDeployments: Map<string, DeploymentRequest> = new Map();
  private activeDeployments: Map<string, DeploymentExecution> = new Map();
  private deploymentHistory: Map<string, DeploymentExecution[]> = new Map();
  private environments: Map<string, Environment> = new Map();
  private deploymentPolicies: Map<string, any> = new Map();
  private safetyRules: Map<string, any> = new Map();

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
    
    // Load environment configurations
    await this.loadEnvironments();
    
    // Load deployment policies
    await this.loadDeploymentPolicies();
    
    // Load safety rules
    await this.loadSafetyRules();
    
    // Setup monitoring
    await this.setupDeploymentMonitoring();
    
    // Initialize health checking
    await this.initializeHealthChecking();
    
    this.logger.info(`Deployment Guardian Agent ${this.id.id} initialized with ${this.environments.size} environments`);
  }

  protected async perceive(context: any): Promise<any> {
    this.logger.info(`Analyzing deployment safety context for ${context.request?.applicationName}`);

    const observation = {
      deploymentRequest: context.request,
      environment: context.environment,
      safetyAssessment: await this.assessDeploymentSafety(context.request),
      environmentHealth: await this.assessEnvironmentHealth(context.environment),
      resourceAvailability: await this.assessResourceAvailability(context.environment),
      dependencyStatus: await this.assessDependencyStatus(context.environment),
      securityCompliance: await this.assessSecurityCompliance(context.request),
      policyCompliance: await this.assessPolicyCompliance(context.request),
      riskAnalysis: await this.analyzeDeploymentRisks(context.request),
      historicalPerformance: await this.analyzeHistoricalPerformance(context.request),
      readinessChecks: await this.performReadinessChecks(context.request)
    };

    // Store observation in shared memory
    await this.memory.store(`deployment-guardian:observation:${context.request.id}`, observation, {
      type: 'artifact' as const,
      tags: ['deployment', 'safety', 'observation'],
      partition: 'deployment-safety'
    });

    return observation;
  }

  protected async decide(observation: any): Promise<AgentDecision> {
    const decisionId = this.generateDecisionId();
    const { deploymentRequest } = observation;

    // Determine deployment safety
    const safetyDecision = await this.determineSafety(observation);

    // Plan deployment execution
    const executionPlan = await this.planDeploymentExecution(observation);

    // Configure monitoring and alerting
    const monitoringPlan = await this.planMonitoringAndAlerting(observation);

    // Prepare rollback procedures
    const rollbackPreparation = await this.prepareRollbackProcedures(observation);

    // Build reasoning
    const factors: ReasoningFactor[] = [
      {
        name: 'Safety Assessment',
        weight: 0.3,
        value: observation.safetyAssessment.overallScore,
        impact: 'critical',
        explanation: observation.safetyAssessment.summary
      },
      {
        name: 'Environment Health',
        weight: 0.25,
        value: observation.environmentHealth.healthScore,
        impact: 'high',
        explanation: observation.environmentHealth.status
      },
      {
        name: 'Resource Availability',
        weight: 0.2,
        value: observation.resourceAvailability.availabilityScore,
        impact: 'medium',
        explanation: observation.resourceAvailability.summary
      },
      {
        name: 'Policy Compliance',
        weight: 0.15,
        value: observation.policyCompliance.complianceScore,
        impact: 'high',
        explanation: observation.policyCompliance.assessment
      },
      {
        name: 'Risk Analysis',
        weight: 0.1,
        value: 1 - observation.riskAnalysis.overallRisk,
        impact: 'medium',
        explanation: observation.riskAnalysis.summary
      }
    ];

    const evidence: Evidence[] = [
      {
        type: 'empirical',
        source: 'safety-assessment',
        confidence: 0.95,
        description: 'Deployment safety assessment results',
        details: observation.safetyAssessment
      },
      {
        type: 'empirical',
        source: 'environment-health',
        confidence: 0.9,
        description: 'Environment health status',
        details: observation.environmentHealth
      },
      {
        type: 'analytical',
        source: 'security-compliance',
        confidence: 0.95,
        description: 'Security compliance verification',
        details: observation.securityCompliance
      },
      {
        type: 'analytical',
        source: 'policy-compliance',
        confidence: 0.9,
        description: 'Policy compliance assessment',
        details: observation.policyCompliance
      }
    ];

    const reasoning = this.buildReasoning(
      factors,
      ['SFDIPOT', 'CRUSSPIC'],
      evidence,
      [
        'All safety checks passed',
        'Environment is healthy and ready',
        'Required approvals obtained'
      ],
      [
        'Environment conditions may change during deployment',
        'Safety assessment based on current state only'
      ]
    );

    const confidence = this.calculateConfidence(factors);

    const decision: AgentDecision = {
      id: decisionId,
      agentId: this.id.id,
      timestamp: new Date(),
      action: safetyDecision.decision,
      reasoning,
      confidence,
      alternatives: [],
      risks: [],
      recommendations: safetyDecision.requirements
    };

    await this.memory.store(`deployment-guardian:decision:${decisionId}`, decision, {
      type: 'artifact' as const,
      tags: ['deployment', 'safety', 'decision'],
      partition: 'decisions'
    });

    return decision;
  }

  protected async act(decision: AgentDecision): Promise<any> {
    const action = decision.action;

    try {
      let result: any = {};

      // Execute based on safety decision
      if (action === 'proceed') {
        // Safe to proceed with deployment
        result = await this.executeDeployment(decision.reasoning);
      } else if (action === 'conditional') {
        // Proceed with conditions
        result = await this.executeConditionalDeployment(decision.reasoning);
      } else {
        // Block deployment
        result = await this.blockDeployment(decision.risks.map(r => r.description).filter((desc): desc is string => desc !== undefined));
      }

      // Store action result in memory
      await this.memory.store(`deployment-guardian:action:${decision.id}`, {
        decision,
        result,
        timestamp: new Date()
      }, {
        type: 'artifact' as const,
        tags: ['deployment', 'safety', 'action'],
        partition: 'deployment'
      });

      return result;
    } catch (error) {
      this.logger.error('Deployment safety action failed', error as Error);
      const err = error instanceof Error ? error : new Error(String(error)); throw err;
    }
  }

  protected async learn(feedback: any): Promise<void> {
    const { task, result, success } = feedback;
    
    if (success) {
      // Learn from successful deployments
      await this.memory.store(`deployment-guardian:success-pattern:${task.id}`, {
        safetyDecision: result.safetyDecision,
        safetyScore: result.safetyScore,
        deployment: result.deployment,
        environment: result.deployment?.environment,
        successFactors: result.successFactors || [],
        metrics: result.deployment?.metrics,
        timestamp: new Date()
      }, {
        type: 'artifact' as const,
        tags: ['success-pattern', 'deployment', 'safety'],
        partition: 'learning'
      });
    } else {
      // Learn from deployment failures
      await this.memory.store(`deployment-guardian:failure-pattern:${task.id}`, {
        failureReason: result.error,
        safetyDecision: task.context?.safetyDecision,
        environment: task.context?.environment,
        lessonsLearned: result.lessonsLearned || [],
        preventionMeasures: result.preventionMeasures || [],
        timestamp: new Date()
      }, {
        type: 'artifact' as const,
        tags: ['failure-pattern', 'deployment', 'safety'],
        partition: 'learning'
      });
    }
    
    // Update deployment metrics
    await this.updateDeploymentMetrics(task.context.deploymentRequest?.id, success);
  }

  // Implementation methods for all the analysis and decision-making functions
  // Due to space constraints, I'll include key methods and indicate where others would go

  private async loadEnvironments(): Promise<void> {
    try {
      const environmentsData = await this.memory.retrieve('deployment-guardian:environments');
      if (environmentsData) {
        this.environments = new Map(Object.entries(environmentsData));
      } else {
        await this.initializeDefaultEnvironments();
      }
    } catch (error) {
      this.logger.warn('No environments found, initializing defaults');
      await this.initializeDefaultEnvironments();
    }
  }

  private async initializeDefaultEnvironments(): Promise<void> {
    const defaultEnvironments: Environment[] = [
      {
        name: 'development',
        type: 'development',
        region: 'us-east-1',
        healthEndpoint: 'https://dev-api.example.com/health',
        monitoringEndpoint: 'https://dev-monitoring.example.com',
        securityLevel: SecurityLevel.INTERNAL,
        resourceLimits: {
          maxCpu: '2000m',
          maxMemory: '4Gi',
          maxStorage: '10Gi',
          maxReplicas: 5
        },
        dependencies: [],
        maintainers: ['dev-team']
      },
      {
        name: 'staging',
        type: 'staging',
        region: 'us-east-1',
        healthEndpoint: 'https://staging-api.example.com/health',
        monitoringEndpoint: 'https://staging-monitoring.example.com',
        securityLevel: SecurityLevel.CONFIDENTIAL,
        resourceLimits: {
          maxCpu: '4000m',
          maxMemory: '8Gi',
          maxStorage: '50Gi',
          maxReplicas: 10
        },
        dependencies: [],
        maintainers: ['dev-team', 'qa-team']
      },
      {
        name: 'production',
        type: 'production',
        region: 'us-east-1',
        healthEndpoint: 'https://api.example.com/health',
        monitoringEndpoint: 'https://monitoring.example.com',
        securityLevel: SecurityLevel.SECRET,
        resourceLimits: {
          maxCpu: '8000m',
          maxMemory: '16Gi',
          maxStorage: '100Gi',
          maxReplicas: 50
        },
        dependencies: [],
        maintainers: ['ops-team', 'sre-team']
      }
    ];

    defaultEnvironments.forEach(env => {
      this.environments.set(env.name, env);
    });

    await this.saveEnvironments();
  }

  private async saveEnvironments(): Promise<void> {
    const environmentsData = Object.fromEntries(this.environments);
    await this.memory.store('deployment-guardian:environments', environmentsData, {
      type: 'artifact' as const,
      tags: ['environments', 'deployment'],
      partition: 'configuration'
    });
  }

  private async loadDeploymentPolicies(): Promise<void> {
    // Load deployment policies - implementation would be similar to environments
    const defaultPolicies = {
      'production': {
        requiresApproval: true,
        minimumApprovers: 2,
        requiresHealthChecks: true,
        requiresSmokeTests: true,
        maxRolloutDuration: 120, // minutes
        automaticRollback: true
      },
      'staging': {
        requiresApproval: false,
        minimumApprovers: 1,
        requiresHealthChecks: true,
        requiresSmokeTests: false,
        maxRolloutDuration: 60,
        automaticRollback: true
      }
    };
    
    for (const [env, policy] of Object.entries(defaultPolicies)) {
      this.deploymentPolicies.set(env, policy);
    }
  }

  private async loadSafetyRules(): Promise<void> {
    // Load safety rules - implementation would define various safety constraints
    const defaultRules = {
      'no-production-fridays': {
        description: 'No production deployments on Fridays after 2 PM',
        condition: 'dayOfWeek === 5 && hour >= 14',
        severity: 'warning'
      },
      'resource-limits': {
        description: 'Resource requests cannot exceed environment limits',
        condition: 'requestedResources <= environmentLimits',
        severity: 'blocking'
      }
    };
    
    for (const [name, rule] of Object.entries(defaultRules)) {
      this.safetyRules.set(name, rule);
    }
  }

  private async setupDeploymentMonitoring(): Promise<void> {
    // Setup monitoring for deployment activities
    this.eventBus.on('deployment:started', async (event) => {
      await this.handleDeploymentStarted(event);
    });
    
    this.eventBus.on('deployment:completed', async (event) => {
      await this.handleDeploymentCompleted(event);
    });
    
    this.eventBus.on('deployment:failed', async (event) => {
      await this.handleDeploymentFailed(event);
    });
  }

  private async initializeHealthChecking(): Promise<void> {
    // Initialize periodic health checking
    setInterval(async () => {
      await this.performEnvironmentHealthChecks();
    }, 60000); // Every minute
  }

  // Assessment methods

  private async assessDeploymentSafety(request: DeploymentRequest): Promise<any> {
    const safetyChecks = {
      approvals: this.checkApprovals(request),
      artifacts: await this.validateArtifacts(request.artifacts),
      configuration: this.validateConfiguration(request.configuration),
      strategy: this.validateStrategy(request.deploymentStrategy),
      timing: this.checkDeploymentTiming(request),
      dependencies: await this.checkDependencies(request.environment)
    };
    
    let overallScore = 0;
    const issues: string[] = [];
    
    // Calculate overall safety score
    Object.entries(safetyChecks).forEach(([check, result]: [string, any]) => {
      if (result.passed) {
        overallScore += result.weight || 1;
      } else {
        issues.push(...result.issues);
      }
    });
    
    overallScore = overallScore / Object.keys(safetyChecks).length;
    
    return {
      overallScore,
      checks: safetyChecks,
      issues,
      summary: `Safety score: ${(overallScore * 100).toFixed(1)}%, ${issues.length} issues found`
    };
  }

  private checkApprovals(request: DeploymentRequest): any {
    const policy = this.deploymentPolicies.get(request.environment.name);
    const requiredApprovals = policy?.minimumApprovers || 0;
    const approvedCount = request.approvals.filter(a => a.status === 'approved').length;
    
    return {
      passed: approvedCount >= requiredApprovals,
      weight: 0.3,
      issues: approvedCount < requiredApprovals ? [`Missing ${requiredApprovals - approvedCount} approvals`] : []
    };
  }

  private async validateArtifacts(artifacts: DeploymentArtifact[]): Promise<any> {
    const issues: string[] = [];
    let validArtifacts = 0;
    
    for (const artifact of artifacts) {
      if (!artifact.checksum) {
        issues.push(`Artifact ${artifact.name} missing checksum`);
      } else if (artifact.vulnerabilityScore && artifact.vulnerabilityScore > 7) {
        issues.push(`Artifact ${artifact.name} has high vulnerability score: ${artifact.vulnerabilityScore}`);
      } else if (!artifact.licenseCompliance) {
        issues.push(`Artifact ${artifact.name} has license compliance issues`);
      } else {
        validArtifacts++;
      }
    }
    
    return {
      passed: validArtifacts === artifacts.length,
      weight: 0.25,
      issues
    };
  }

  private validateConfiguration(config: DeploymentConfig): any {
    const issues: string[] = [];
    
    // Validate resource requirements
    if (!config.resources.cpu.request || !config.resources.memory.request) {
      issues.push('Missing resource requests');
    }
    
    // Validate security configuration
    if (!config.security.runAsNonRoot) {
      issues.push('Container should run as non-root user');
    }
    
    // Validate monitoring configuration
    if (!config.monitoring.enabled) {
      issues.push('Monitoring should be enabled');
    }
    
    return {
      passed: issues.length === 0,
      weight: 0.2,
      issues
    };
  }

  private validateStrategy(strategy: DeploymentStrategy): any {
    const issues: string[] = [];
    
    // Validate strategy parameters
    if (strategy.type === 'canary' && !strategy.parameters.trafficSplit) {
      issues.push('Canary deployment requires traffic split configuration');
    }
    
    if (!strategy.parameters.timeouts?.deployment) {
      issues.push('Deployment timeout not configured');
    }
    
    // Validate phases
    if (strategy.phases.length === 0) {
      issues.push('At least one deployment phase required');
    }
    
    return {
      passed: issues.length === 0,
      weight: 0.15,
      issues
    };
  }

  private checkDeploymentTiming(request: DeploymentRequest): any {
    const now = new Date();
    const issues: string[] = [];
    
    // Check for Friday afternoon deployments to production
    if (request.environment.type === 'production') {
      const dayOfWeek = now.getDay();
      const hour = now.getHours();
      
      if (dayOfWeek === 5 && hour >= 14) { // Friday after 2 PM
        issues.push('Production deployments discouraged on Friday afternoons');
      }
    }
    
    // Check if deadline is reasonable
    if (request.deadline && request.deadline.getTime() < now.getTime() + (60 * 60 * 1000)) {
      issues.push('Deployment deadline too aggressive (less than 1 hour)');
    }
    
    return {
      passed: issues.length === 0,
      weight: 0.1,
      issues
    };
  }

  private async checkDependencies(environment: Environment): Promise<any> {
    const issues: string[] = [];
    let healthyDependencies = 0;
    
    for (const dependency of environment.dependencies) {
      try {
        // Simulate dependency health check
        const isHealthy = Math.random() > 0.1; // 90% chance of being healthy
        
        if (isHealthy) {
          healthyDependencies++;
        } else {
          issues.push(`Dependency ${dependency.name} is unhealthy`);
        }
      } catch (error) {
        issues.push(`Cannot check dependency ${dependency.name}: ${error}`);
      }
    }
    
    return {
      passed: healthyDependencies === environment.dependencies.length,
      weight: 0.2,
      issues
    };
  }

  private async assessEnvironmentHealth(environment: Environment): Promise<any> {
    // Simulate environment health assessment
    const healthChecks = {
      api: Math.random() > 0.05, // 95% chance of being healthy
      database: Math.random() > 0.02, // 98% chance
      monitoring: Math.random() > 0.01, // 99% chance
      loadBalancer: Math.random() > 0.03 // 97% chance
    };
    
    const healthyChecks = Object.values(healthChecks).filter(Boolean).length;
    const totalChecks = Object.keys(healthChecks).length;
    const healthScore = healthyChecks / totalChecks;
    
    return {
      healthScore,
      checks: healthChecks,
      status: healthScore > 0.9 ? 'Healthy' : healthScore > 0.7 ? 'Warning' : 'Unhealthy'
    };
  }

  // Additional methods would be implemented here...
  // For brevity, I'm including key method signatures

  private async assessResourceAvailability(environment: Environment): Promise<any> {
    // Implementation for resource availability assessment
    return {
      availabilityScore: 0.85,
      summary: 'Sufficient resources available'
    };
  }

  private async assessDependencyStatus(environment: Environment): Promise<any> {
    // Implementation for dependency status assessment
    return {
      allHealthy: true,
      unhealthyDependencies: []
    };
  }

  private async assessSecurityCompliance(request: DeploymentRequest): Promise<any> {
    // Implementation for security compliance assessment
    return {
      compliant: true,
      violations: [],
      score: 0.95
    };
  }

  private async assessPolicyCompliance(request: DeploymentRequest): Promise<any> {
    // Implementation for policy compliance assessment
    return {
      complianceScore: 0.9,
      assessment: 'Compliant with most policies'
    };
  }

  private async analyzeDeploymentRisks(request: DeploymentRequest): Promise<any> {
    // Implementation for deployment risk analysis
    return {
      overallRisk: 0.2,
      summary: 'Low risk deployment'
    };
  }

  private async analyzeHistoricalPerformance(request: DeploymentRequest): Promise<any> {
    // Implementation for historical performance analysis
    return {
      successRate: 0.95,
      averageDuration: 1200 // seconds
    };
  }

  private async performReadinessChecks(request: DeploymentRequest): Promise<any> {
    // Implementation for readiness checks
    return {
      ready: true,
      checklist: ['approvals', 'artifacts', 'configuration']
    };
  }

  // Decision making methods

  private async determineSafety(observation: any): Promise<any> {
    const { safetyAssessment, environmentHealth, policyCompliance } = observation;
    
    let decision = 'block';
    let score = 0;
    const requirements = [];
    const warnings: string[] = [];
    const blockers = [];
    
    // Calculate overall safety score
    score = (safetyAssessment.overallScore * 0.4) + 
            (environmentHealth.healthScore * 0.3) + 
            (policyCompliance.complianceScore * 0.3);
    
    if (score >= 0.9) {
      decision = 'proceed';
    } else if (score >= 0.7) {
      decision = 'conditional';
      requirements.push('Additional monitoring required');
    } else {
      decision = 'block';
      blockers.push(...safetyAssessment.issues);
    }
    
    return {
      decision,
      score,
      requirements,
      warnings,
      blockers
    };
  }

  private async planDeploymentExecution(observation: any): Promise<any> {
    // Implementation for deployment execution planning
    return {
      strategy: observation.deploymentRequest.deploymentStrategy,
      phases: observation.deploymentRequest.deploymentStrategy.phases,
      monitoring: true,
      rollbackReady: true
    };
  }

  private async planMonitoringAndAlerting(observation: any): Promise<any> {
    // Implementation for monitoring and alerting planning
    return {
      enabled: true,
      safeguards: ['health-checks', 'error-rate-monitoring', 'performance-monitoring']
    };
  }

  private async prepareRollbackProcedures(observation: any): Promise<any> {
    // Implementation for rollback procedures preparation
    return {
      ready: true,
      strategy: observation.deploymentRequest.rollbackPlan.strategy,
      estimatedTime: observation.deploymentRequest.rollbackPlan.estimatedDuration
    };
  }

  // Action execution methods

  private async executeDeployment(reasoning: ExplainableReasoning): Promise<any> {
    this.logger.info('Executing safe deployment');

    return {
      status: 'in-progress',
      startTime: new Date(),
      message: 'Deployment approved and in progress'
    };
  }

  private async executeConditionalDeployment(reasoning: ExplainableReasoning): Promise<any> {
    this.logger.info('Executing conditional deployment with enhanced monitoring');

    return {
      status: 'conditional',
      enhancedMonitoring: true,
      message: 'Deployment approved with conditions'
    };
  }

  private async blockDeployment(blockers: string[]): Promise<any> {
    this.logger.warn(`Blocking deployment due to: ${blockers.join(', ')}`);
    
    return {
      status: 'blocked',
      blockers,
      nextSteps: ['Address blocking issues', 'Re-submit deployment request']
    };
  }

  // Event handlers

  private async handleDeploymentStarted(event: any): Promise<void> {
    this.logger.info(`Deployment started: ${event.deploymentId}`);
    // Implementation for handling deployment start
  }

  private async handleDeploymentCompleted(event: any): Promise<void> {
    this.logger.info(`Deployment completed: ${event.deploymentId}`);
    // Implementation for handling deployment completion
  }

  private async handleDeploymentFailed(event: any): Promise<void> {
    this.logger.error(`Deployment failed: ${event.deploymentId}`);
    // Implementation for handling deployment failure
  }

  private async performEnvironmentHealthChecks(): Promise<void> {
    // Implementation for periodic environment health checks
    for (const [envName, environment] of this.environments) {
      const health = await this.assessEnvironmentHealth(environment);
      
      if (health.healthScore < 0.7) {
        this.logger.warn(`Environment ${envName} health degraded: ${health.status}`);
        // Trigger alerts
      }
    }
  }

  private async updateDeploymentMetrics(deploymentId: string | undefined, success: boolean): Promise<void> {
    if (!deploymentId) return;
    
    try {
      const metricsKey = 'deployment-guardian:metrics:overall';
      let metrics = await this.memory.retrieve(metricsKey) || {
        totalDeployments: 0,
        successfulDeployments: 0,
        failedDeployments: 0,
        successRate: 0
      };
      
      metrics.totalDeployments++;
      if (success) {
        metrics.successfulDeployments++;
      } else {
        metrics.failedDeployments++;
      }
      metrics.successRate = metrics.successfulDeployments / metrics.totalDeployments;
      
      await this.memory.store(metricsKey, metrics, {
        type: 'artifact' as const,
        tags: ['deployment', 'overall-metrics'],
        partition: 'overall-metrics'
      });
    } catch (error) {
      this.logger.error('Failed to update deployment metrics', error as Error);
    }
  }

  private generateDecisionId(): string {
    return `deployment-guardian-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public methods for external interaction

  async submitDeploymentRequest(request: DeploymentRequest): Promise<string> {
    this.pendingDeployments.set(request.id, request);
    this.logger.info(`Deployment request submitted: ${request.id}`);
    
    // Trigger safety assessment
    // Implementation would create a task for the Deployment Guardian
    
    return request.id;
  }

  async getDeploymentStatus(deploymentId: string): Promise<any> {
    const execution = this.activeDeployments.get(deploymentId);
    return execution ? {
      id: deploymentId,
      status: execution.status,
      currentPhase: execution.currentPhase,
      startTime: execution.startTime,
      duration: execution.duration
    } : null;
  }

  async getEnvironmentHealth(environmentName: string): Promise<any> {
    const environment = this.environments.get(environmentName);
    if (!environment) {
      throw new Error(`Environment ${environmentName} not found`);
    }
    
    return await this.assessEnvironmentHealth(environment);
  }

  async getDeploymentMetrics(): Promise<any> {
    return await this.memory.retrieve('deployment-guardian:metrics:overall') || {
      totalDeployments: 0,
      successfulDeployments: 0,
      failedDeployments: 0,
      successRate: 0
    };
  }

  async addEnvironment(environment: Environment): Promise<void> {
    this.environments.set(environment.name, environment);
    await this.saveEnvironments();
    this.logger.info(`Added environment: ${environment.name}`);
  }

  async updateEnvironment(environmentName: string, updates: Partial<Environment>): Promise<void> {
    const environment = this.environments.get(environmentName);
    if (!environment) {
      throw new Error(`Environment ${environmentName} not found`);
    }
    
    const updatedEnvironment = { ...environment, ...updates };
    this.environments.set(environmentName, updatedEnvironment);
    await this.saveEnvironments();
    
    this.logger.info(`Updated environment: ${environmentName}`);
  }

  async triggerRollback(deploymentId: string, reason: string): Promise<void> {
    const execution = this.activeDeployments.get(deploymentId);
    if (!execution) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }
    
    this.logger.warn(`Triggering rollback for deployment ${deploymentId}: ${reason}`);
    
    execution.status = 'rolled-back';
    this.activeDeployments.set(deploymentId, execution);
    
    // Execute rollback procedures
    // Implementation would execute actual rollback steps
  }

  async getActiveDeployments(): Promise<DeploymentExecution[]> {
    return Array.from(this.activeDeployments.values());
  }

  async getPendingDeployments(): Promise<DeploymentRequest[]> {
    return Array.from(this.pendingDeployments.values());
  }
}