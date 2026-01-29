/**
 * RiskAssessorAgent - Assesses risks across multiple categories for QCSD phases
 *
 * Core capabilities:
 * - Multi-category risk assessment (technical, business, security, compliance, operational)
 * - Qualitative, quantitative, and hybrid scoring methods
 * - Risk mitigation suggestion and tracking
 * - Risk heat map generation
 * - Risk trend analysis
 * - Integration with QCSD workflow
 *
 * Memory namespaces:
 * - aqe/qcsd/ideation/* - QCSD Ideation phase data
 * - aqe/risk-assessment/* - Risk assessment results
 * - aqe/mitigations/* - Mitigation tracking
 */

import { BaseAgent, BaseAgentConfig } from './BaseAgent';
import { QETask, QEAgentType, RiskAssessorConfig } from '../types';

// ============================================================================
// Type Definitions
// ============================================================================

export interface RiskAssessorAgentConfig extends BaseAgentConfig {
  /** Risk categories configuration */
  riskCategories?: RiskAssessorConfig['riskCategories'];
  /** Scoring configuration */
  scoring?: RiskAssessorConfig['scoring'];
  /** Mitigation configuration */
  mitigation?: RiskAssessorConfig['mitigation'];
}

export interface RiskItem {
  id: string;
  category: RiskCategory;
  title: string;
  description: string;
  source: string; // e.g., epic ID, requirement ID
  identifiedBy: string;
  identifiedAt: Date;
}

export type RiskCategory = 'technical' | 'business' | 'security' | 'compliance' | 'operational';

export interface RiskScore {
  riskId: string;
  impact: number; // 1-10
  probability: number; // 1-10
  riskLevel: number; // impact * probability
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0-100%
  rationale: string;
}

export interface RiskMitigation {
  id: string;
  riskId: string;
  strategy: 'avoid' | 'mitigate' | 'transfer' | 'accept';
  description: string;
  owner?: string;
  status: 'proposed' | 'in-progress' | 'implemented' | 'verified';
  effectiveness: number; // Expected risk reduction %
  effort: 'low' | 'medium' | 'high';
  deadline?: Date;
}

export interface RiskAssessmentInput {
  epicId: string;
  epicName: string;
  description: string;
  technicalDetails?: string[];
  businessContext?: {
    userBase?: string;
    revenue?: string;
    strategic?: boolean;
    deadline?: string;
  };
  dependencies?: string[];
  constraints?: string[];
}

export interface RiskAssessmentResult {
  assessmentId: string;
  input: RiskAssessmentInput;
  timestamp: Date;
  assessor: string;
  risks: RiskItem[];
  scores: RiskScore[];
  mitigations: RiskMitigation[];
  overallRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  overallScore: number;
  summary: {
    totalRisks: number;
    criticalRisks: number;
    highRisks: number;
    mitigatedRisks: number;
    risksByCategory: Record<RiskCategory, number>;
  };
  recommendations: string[];
}

export interface RiskHeatMap {
  cells: {
    riskId: string;
    impact: number;
    probability: number;
    category: RiskCategory;
    title: string;
  }[];
  legend: {
    green: string;
    yellow: string;
    orange: string;
    red: string;
  };
}

// ============================================================================
// Risk Assessment Constants
// ============================================================================

const RISK_KEYWORDS: Record<RiskCategory, string[]> = {
  technical: [
    'integration', 'api', 'migration', 'legacy', 'complex', 'architecture',
    'database', 'performance', 'scalability', 'dependency', 'third-party',
    'framework', 'version', 'compatibility', 'technical-debt', 'refactor'
  ],
  business: [
    'revenue', 'customer', 'competitor', 'market', 'deadline', 'budget',
    'stakeholder', 'requirement', 'scope', 'change', 'priority', 'resource',
    'timeline', 'launch', 'contract', 'partnership'
  ],
  security: [
    'authentication', 'authorization', 'encryption', 'vulnerability', 'attack',
    'breach', 'credential', 'token', 'session', 'injection', 'xss', 'csrf',
    'penetration', 'audit', 'access', 'permission'
  ],
  compliance: [
    'gdpr', 'hipaa', 'pci', 'sox', 'regulation', 'legal', 'privacy',
    'data-protection', 'consent', 'audit', 'retention', 'right-to-erasure',
    'accessibility', 'wcag', 'ada', 'license'
  ],
  operational: [
    'deployment', 'monitoring', 'incident', 'support', 'maintenance',
    'backup', 'recovery', 'disaster', 'availability', 'sla', 'downtime',
    'on-call', 'runbook', 'alert', 'logging'
  ]
};

const SEVERITY_THRESHOLDS = {
  critical: 70,
  high: 50,
  medium: 30,
  low: 0
};

// ============================================================================
// RiskAssessorAgent Implementation
// ============================================================================

export class RiskAssessorAgent extends BaseAgent {
  private readonly agentConfig: RiskAssessorAgentConfig;
  private riskRegistry: Map<string, RiskItem> = new Map();
  private mitigationRegistry: Map<string, RiskMitigation[]> = new Map();

  constructor(config: RiskAssessorAgentConfig) {
    super({
      ...config,
      id: config.id || `risk-assessor-${Date.now()}`,
      type: QEAgentType.RISK_ASSESSOR,
      capabilities: [
        {
          name: 'multi-category-risk-assessment',
          version: '1.0.0',
          description: 'Assess risks across technical, business, security, compliance, and operational categories'
        },
        {
          name: 'risk-scoring',
          version: '1.0.0',
          description: 'Score risks using qualitative, quantitative, or hybrid methods'
        },
        {
          name: 'mitigation-recommendation',
          version: '1.0.0',
          description: 'Generate and track risk mitigation strategies'
        },
        {
          name: 'risk-heat-map',
          version: '1.0.0',
          description: 'Generate visual risk heat maps'
        },
        {
          name: 'risk-trend-analysis',
          version: '1.0.0',
          description: 'Analyze risk trends over time'
        }
      ]
    });

    this.agentConfig = {
      ...config,
      riskCategories: config.riskCategories || {
        technical: true,
        business: true,
        security: true,
        compliance: true,
        operational: true
      },
      scoring: config.scoring || {
        method: 'hybrid',
        impactScale: 10,
        probabilityScale: 10
      },
      mitigation: config.mitigation || {
        autoSuggest: true,
        trackMitigations: true,
        escalationThreshold: 70
      }
    };
  }

  // ============================================================================
  // Lifecycle Hooks
  // ============================================================================

  protected async onPreTask(data: { assignment: any }): Promise<void> {
    await super.onPreTask(data);

    const history = await this.memoryStore.retrieve(
      `aqe/${this.agentId.type}/history`
    );

    if (history) {
      console.log(`Loaded ${history.length} historical risk assessments`);
    }

    console.log(`[${this.agentId.type}] Starting risk assessment task`, {
      taskId: data.assignment.id,
      taskType: data.assignment.task.type
    });
  }

  protected async onPostTask(data: { assignment: any; result: any }): Promise<void> {
    await super.onPostTask(data);

    await this.memoryStore.store(
      `aqe/${this.agentId.type}/results/${data.assignment.id}`,
      {
        result: data.result,
        timestamp: new Date(),
        taskType: data.assignment.task.type,
        success: data.result?.success !== false,
        risksIdentified: data.result?.risks?.length || 0,
        mitigationsProposed: data.result?.mitigations?.length || 0
      },
      86400
    );

    this.emitEvent('qcsd.risk.assessed', {
      agentId: this.agentId,
      result: data.result,
      timestamp: new Date()
    }, 'high');

    console.log(`[${this.agentId.type}] Risk assessment completed`, {
      taskId: data.assignment.id,
      risksIdentified: data.result?.risks?.length || 0
    });
  }

  protected async onTaskError(data: { assignment: any; error: Error }): Promise<void> {
    await super.onTaskError(data);

    await this.memoryStore.store(
      `aqe/${this.agentId.type}/errors/${Date.now()}`,
      {
        taskId: data.assignment.id,
        error: data.error.message,
        stack: data.error.stack,
        timestamp: new Date()
      },
      604800
    );

    console.error(`[${this.agentId.type}] Risk assessment failed`, {
      taskId: data.assignment.id,
      error: data.error.message
    });
  }

  // ============================================================================
  // BaseAgent Abstract Method Implementations
  // ============================================================================

  protected async initializeComponents(): Promise<void> {
    console.log(`RiskAssessorAgent ${this.agentId.id} initializing components`);

    // Register for QCSD coordination events
    this.registerEventHandler({
      eventType: 'qcsd.ideation.started',
      handler: async (_event) => {
        console.log('QCSD Ideation started, preparing for risk assessment');
      }
    });

    this.registerEventHandler({
      eventType: 'qcsd.quality.criteria.recommended',
      handler: async (event) => {
        console.log('Quality criteria recommended, cross-referencing with risks');
      }
    });

    console.log('RiskAssessorAgent components initialized successfully');
  }

  protected async loadKnowledge(): Promise<void> {
    console.log('Loading risk assessor knowledge base');

    // Load historical risk patterns
    const priorPatterns = await this.retrieveMemory('risk-patterns');
    if (priorPatterns) {
      console.log('Loaded historical risk patterns');
    }

    // Load organization risk appetite
    const riskAppetite = await this.memoryStore.retrieve('aqe/qcsd/ideation/risk-appetite');
    if (riskAppetite) {
      console.log('Loaded organization risk appetite configuration');
    }

    console.log('Risk assessor knowledge loaded successfully');
  }

  protected async cleanup(): Promise<void> {
    console.log(`RiskAssessorAgent ${this.agentId.id} cleaning up resources`);

    // Save learned patterns
    await this.storeMemory('risk-patterns', Array.from(this.riskRegistry.entries()));

    console.log('RiskAssessorAgent cleanup completed');
  }

  protected async performTask(task: QETask): Promise<any> {
    const taskType = task.type;
    const taskData = task.payload;

    switch (taskType) {
      case 'assess-risks':
        return await this.assessRisks(taskData.input);

      case 'score-risk':
        return await this.scoreRisk(taskData.risk);

      case 'suggest-mitigations':
        return await this.suggestMitigations(taskData.risks);

      case 'generate-heat-map':
        return await this.generateHeatMap(taskData.assessment);

      case 'analyze-trends':
        return await this.analyzeTrends(taskData.epicId, taskData.timeRange);

      case 'update-mitigation':
        return await this.updateMitigation(taskData.mitigationId, taskData.status);

      case 'batch-assess':
        return await this.batchAssess(taskData.inputs);

      default:
        throw new Error(`Unsupported task type: ${taskType}`);
    }
  }

  // ============================================================================
  // Core Capabilities
  // ============================================================================

  /**
   * Perform comprehensive risk assessment
   */
  public async assessRisks(input: RiskAssessmentInput): Promise<RiskAssessmentResult> {
    console.log(`Assessing risks for epic: ${input.epicId}`);

    const assessmentId = `ra-${input.epicId}-${Date.now()}`;

    // Identify risks across all enabled categories
    const risks = await this.identifyRisks(input);

    // Score each risk
    const scores = await Promise.all(
      risks.map(risk => this.scoreRisk(risk))
    );

    // Generate mitigations if enabled
    let mitigations: RiskMitigation[] = [];
    if (this.agentConfig.mitigation?.autoSuggest) {
      mitigations = await this.suggestMitigations(risks);
    }

    // Calculate overall risk level
    const overallScore = this.calculateOverallScore(scores);
    const overallRiskLevel = this.scoreToSeverity(overallScore);

    // Generate summary
    const summary = this.generateSummary(risks, scores, mitigations);

    // Generate recommendations
    const recommendations = this.generateRecommendations(risks, scores, overallRiskLevel);

    const result: RiskAssessmentResult = {
      assessmentId,
      input,
      timestamp: new Date(),
      assessor: this.agentId.id,
      risks,
      scores,
      mitigations,
      overallRiskLevel,
      overallScore,
      summary,
      recommendations
    };

    // Store assessment
    await this.memoryStore.store(
      `aqe/qcsd/ideation/risk-assessment/${input.epicId}`,
      result
    );

    // Emit event
    this.emitEvent('qcsd.risk.assessed', {
      epicId: input.epicId,
      overallRiskLevel,
      overallScore,
      totalRisks: risks.length,
      criticalRisks: summary.criticalRisks
    }, overallRiskLevel === 'critical' ? 'critical' : 'high');

    console.log(`Risk assessment complete for ${input.epicId}. Level: ${overallRiskLevel}, Score: ${overallScore}`);

    return result;
  }

  /**
   * Identify risks from input
   */
  private async identifyRisks(input: RiskAssessmentInput): Promise<RiskItem[]> {
    const risks: RiskItem[] = [];
    const text = `${input.description} ${(input.technicalDetails || []).join(' ')} ${(input.dependencies || []).join(' ')}`.toLowerCase();

    const categories = Object.entries(this.agentConfig.riskCategories || {})
      .filter(([_, enabled]) => enabled)
      .map(([category]) => category as RiskCategory);

    for (const category of categories) {
      const categoryRisks = this.identifyCategoryRisks(category, text, input);
      risks.push(...categoryRisks);
    }

    // Store risks in registry
    for (const risk of risks) {
      this.riskRegistry.set(risk.id, risk);
    }

    return risks;
  }

  private identifyCategoryRisks(
    category: RiskCategory,
    text: string,
    input: RiskAssessmentInput
  ): RiskItem[] {
    const risks: RiskItem[] = [];
    const keywords = RISK_KEYWORDS[category];

    // Find matching keywords and generate risks
    const matchedKeywords = keywords.filter(kw => text.includes(kw));

    if (matchedKeywords.length > 0) {
      // Generate specific risks based on category and matches
      const categoryRisks = this.generateCategorySpecificRisks(category, matchedKeywords, input);
      risks.push(...categoryRisks);
    }

    // Add context-based risks
    risks.push(...this.identifyContextRisks(category, input));

    return risks;
  }

  private generateCategorySpecificRisks(
    category: RiskCategory,
    keywords: string[],
    input: RiskAssessmentInput
  ): RiskItem[] {
    const risks: RiskItem[] = [];
    const baseId = `${category}-${input.epicId}`;

    const riskTemplates: Record<RiskCategory, { title: string; description: string }[]> = {
      technical: [
        { title: 'Integration Complexity', description: 'Risk of integration issues with external systems or APIs' },
        { title: 'Technical Debt', description: 'Risk of accumulating technical debt impacting future development' },
        { title: 'Scalability Limitations', description: 'Risk of performance degradation under increased load' },
        { title: 'Dependency Vulnerabilities', description: 'Risk from outdated or vulnerable third-party dependencies' }
      ],
      business: [
        { title: 'Deadline Pressure', description: 'Risk of quality compromise due to tight deadlines' },
        { title: 'Scope Creep', description: 'Risk of uncontrolled feature expansion' },
        { title: 'Resource Constraints', description: 'Risk of insufficient team capacity' },
        { title: 'Stakeholder Alignment', description: 'Risk of conflicting stakeholder expectations' }
      ],
      security: [
        { title: 'Data Exposure', description: 'Risk of unauthorized data access or leakage' },
        { title: 'Authentication Bypass', description: 'Risk of authentication mechanism vulnerabilities' },
        { title: 'Injection Attacks', description: 'Risk of SQL, XSS, or command injection vulnerabilities' },
        { title: 'Session Management', description: 'Risk of session hijacking or fixation' }
      ],
      compliance: [
        { title: 'Data Privacy Violation', description: 'Risk of GDPR/CCPA non-compliance' },
        { title: 'Accessibility Non-compliance', description: 'Risk of WCAG/ADA violations' },
        { title: 'Audit Readiness', description: 'Risk of insufficient audit trails' },
        { title: 'Consent Management', description: 'Risk of improper consent handling' }
      ],
      operational: [
        { title: 'Deployment Risk', description: 'Risk of failed or problematic deployments' },
        { title: 'Monitoring Gaps', description: 'Risk of undetected production issues' },
        { title: 'Recovery Capability', description: 'Risk of inadequate disaster recovery' },
        { title: 'Support Readiness', description: 'Risk of support team unpreparedness' }
      ]
    };

    const templates = riskTemplates[category] || [];

    // Select relevant templates based on keyword matches
    const relevantTemplates = templates.slice(0, Math.min(keywords.length, 2));

    for (let i = 0; i < relevantTemplates.length; i++) {
      risks.push({
        id: `${baseId}-${i + 1}`,
        category,
        title: relevantTemplates[i].title,
        description: relevantTemplates[i].description,
        source: input.epicId,
        identifiedBy: this.agentId.id,
        identifiedAt: new Date()
      });
    }

    return risks;
  }

  private identifyContextRisks(category: RiskCategory, input: RiskAssessmentInput): RiskItem[] {
    const risks: RiskItem[] = [];
    const baseId = `${category}-${input.epicId}-ctx`;

    // Business context risks
    if (category === 'business' && input.businessContext) {
      if (input.businessContext.deadline?.includes('urgent')) {
        risks.push({
          id: `${baseId}-deadline`,
          category: 'business',
          title: 'Urgent Deadline',
          description: 'Tight deadline increases risk of quality issues',
          source: input.epicId,
          identifiedBy: this.agentId.id,
          identifiedAt: new Date()
        });
      }

      if (input.businessContext.strategic) {
        risks.push({
          id: `${baseId}-strategic`,
          category: 'business',
          title: 'Strategic Initiative',
          description: 'High visibility project with elevated business impact if failed',
          source: input.epicId,
          identifiedBy: this.agentId.id,
          identifiedAt: new Date()
        });
      }
    }

    // Dependency risks
    if (category === 'technical' && input.dependencies && input.dependencies.length > 3) {
      risks.push({
        id: `${baseId}-deps`,
        category: 'technical',
        title: 'Multiple Dependencies',
        description: `${input.dependencies.length} dependencies increase integration complexity`,
        source: input.epicId,
        identifiedBy: this.agentId.id,
        identifiedAt: new Date()
      });
    }

    // Constraint risks
    if (category === 'operational' && input.constraints && input.constraints.length > 0) {
      risks.push({
        id: `${baseId}-constraints`,
        category: 'operational',
        title: 'Multiple Constraints',
        description: 'Operating constraints may limit flexibility',
        source: input.epicId,
        identifiedBy: this.agentId.id,
        identifiedAt: new Date()
      });
    }

    return risks;
  }

  /**
   * Score a risk
   */
  public async scoreRisk(risk: RiskItem): Promise<RiskScore> {
    const method = this.agentConfig.scoring?.method || 'hybrid';

    let impact: number;
    let probability: number;
    let confidence: number;
    let rationale: string;

    switch (method) {
      case 'qualitative':
        ({ impact, probability, confidence, rationale } = this.scoreQualitative(risk));
        break;
      case 'quantitative':
        ({ impact, probability, confidence, rationale } = this.scoreQuantitative(risk));
        break;
      case 'hybrid':
      default:
        ({ impact, probability, confidence, rationale } = this.scoreHybrid(risk));
    }

    const riskLevel = impact * probability;
    const severity = this.scoreToSeverity(riskLevel);

    return {
      riskId: risk.id,
      impact,
      probability,
      riskLevel,
      severity,
      confidence,
      rationale
    };
  }

  private scoreQualitative(risk: RiskItem): { impact: number; probability: number; confidence: number; rationale: string } {
    // Category-based qualitative scoring
    const categoryImpact: Record<RiskCategory, number> = {
      security: 8,
      compliance: 7,
      technical: 6,
      business: 6,
      operational: 5
    };

    const categoryProbability: Record<RiskCategory, number> = {
      technical: 7,
      business: 6,
      operational: 6,
      security: 5,
      compliance: 4
    };

    return {
      impact: categoryImpact[risk.category],
      probability: categoryProbability[risk.category],
      confidence: 60,
      rationale: `Qualitative assessment based on ${risk.category} category defaults`
    };
  }

  private scoreQuantitative(risk: RiskItem): { impact: number; probability: number; confidence: number; rationale: string } {
    // Keyword-based quantitative scoring
    const text = `${risk.title} ${risk.description}`.toLowerCase();

    let impact = 5;
    let probability = 5;

    // High impact keywords
    if (/(critical|severe|major|significant|catastrophic)/i.test(text)) impact += 3;
    if (/(breach|loss|failure|outage)/i.test(text)) impact += 2;

    // High probability keywords
    if (/(likely|frequent|common|expected)/i.test(text)) probability += 2;
    if (/(complex|difficult|challenging)/i.test(text)) probability += 1;

    // Low probability keywords
    if (/(rare|unlikely|edge-case)/i.test(text)) probability -= 2;

    return {
      impact: Math.min(10, Math.max(1, impact)),
      probability: Math.min(10, Math.max(1, probability)),
      confidence: 75,
      rationale: 'Quantitative assessment based on keyword analysis'
    };
  }

  private scoreHybrid(risk: RiskItem): { impact: number; probability: number; confidence: number; rationale: string } {
    const qualitative = this.scoreQualitative(risk);
    const quantitative = this.scoreQuantitative(risk);

    return {
      impact: Math.round((qualitative.impact + quantitative.impact) / 2),
      probability: Math.round((qualitative.probability + quantitative.probability) / 2),
      confidence: Math.round((qualitative.confidence + quantitative.confidence) / 2),
      rationale: 'Hybrid assessment combining qualitative and quantitative methods'
    };
  }

  private scoreToSeverity(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= SEVERITY_THRESHOLDS.critical) return 'critical';
    if (score >= SEVERITY_THRESHOLDS.high) return 'high';
    if (score >= SEVERITY_THRESHOLDS.medium) return 'medium';
    return 'low';
  }

  /**
   * Suggest mitigations for risks
   */
  public async suggestMitigations(risks: RiskItem[]): Promise<RiskMitigation[]> {
    const mitigations: RiskMitigation[] = [];

    for (const risk of risks) {
      const riskMitigations = this.generateMitigationsForRisk(risk);
      mitigations.push(...riskMitigations);

      // Store in registry
      this.mitigationRegistry.set(risk.id, riskMitigations);
    }

    return mitigations;
  }

  private generateMitigationsForRisk(risk: RiskItem): RiskMitigation[] {
    const mitigations: RiskMitigation[] = [];
    const baseId = `mit-${risk.id}`;

    const mitigationTemplates: Record<RiskCategory, { strategy: RiskMitigation['strategy']; description: string; effort: RiskMitigation['effort']; effectiveness: number }[]> = {
      technical: [
        { strategy: 'mitigate', description: 'Implement comprehensive automated testing', effort: 'medium', effectiveness: 40 },
        { strategy: 'mitigate', description: 'Add monitoring and alerting', effort: 'low', effectiveness: 30 },
        { strategy: 'avoid', description: 'Simplify architecture where possible', effort: 'high', effectiveness: 50 }
      ],
      business: [
        { strategy: 'mitigate', description: 'Establish clear communication channels with stakeholders', effort: 'low', effectiveness: 30 },
        { strategy: 'mitigate', description: 'Implement scope change management process', effort: 'medium', effectiveness: 40 },
        { strategy: 'transfer', description: 'Negotiate timeline or scope adjustments', effort: 'medium', effectiveness: 35 }
      ],
      security: [
        { strategy: 'mitigate', description: 'Conduct security review and penetration testing', effort: 'high', effectiveness: 60 },
        { strategy: 'mitigate', description: 'Implement security scanning in CI/CD', effort: 'medium', effectiveness: 45 },
        { strategy: 'avoid', description: 'Use established security libraries and patterns', effort: 'medium', effectiveness: 50 }
      ],
      compliance: [
        { strategy: 'mitigate', description: 'Engage compliance team early', effort: 'medium', effectiveness: 50 },
        { strategy: 'mitigate', description: 'Implement audit logging and consent management', effort: 'medium', effectiveness: 45 },
        { strategy: 'avoid', description: 'Design for privacy by default', effort: 'high', effectiveness: 60 }
      ],
      operational: [
        { strategy: 'mitigate', description: 'Implement blue-green deployments', effort: 'medium', effectiveness: 45 },
        { strategy: 'mitigate', description: 'Create runbooks and train support team', effort: 'medium', effectiveness: 40 },
        { strategy: 'mitigate', description: 'Establish monitoring and incident response', effort: 'medium', effectiveness: 50 }
      ]
    };

    const templates = mitigationTemplates[risk.category] || [];

    for (let i = 0; i < Math.min(templates.length, 2); i++) {
      mitigations.push({
        id: `${baseId}-${i + 1}`,
        riskId: risk.id,
        strategy: templates[i].strategy,
        description: templates[i].description,
        status: 'proposed',
        effectiveness: templates[i].effectiveness,
        effort: templates[i].effort
      });
    }

    return mitigations;
  }

  /**
   * Generate risk heat map
   */
  public async generateHeatMap(assessment: RiskAssessmentResult): Promise<RiskHeatMap> {
    const cells = assessment.scores.map(score => {
      const risk = assessment.risks.find(r => r.id === score.riskId);
      return {
        riskId: score.riskId,
        impact: score.impact,
        probability: score.probability,
        category: risk?.category || 'technical',
        title: risk?.title || 'Unknown Risk'
      };
    });

    return {
      cells,
      legend: {
        green: 'Low Risk (1-30): Monitor',
        yellow: 'Medium Risk (31-50): Plan mitigations',
        orange: 'High Risk (51-70): Actively mitigate',
        red: 'Critical Risk (71-100): Immediate action required'
      }
    };
  }

  /**
   * Analyze risk trends over time
   */
  public async analyzeTrends(epicId: string, timeRange: { start: Date; end: Date }): Promise<{
    epicId: string;
    timeRange: { start: Date; end: Date };
    assessments: number;
    trend: 'improving' | 'stable' | 'worsening';
    avgRiskScore: number;
    criticalRisksTrend: number[];
    recommendations: string[];
  }> {
    // Retrieve historical assessments
    const history = await this.memoryStore.retrieve(
      `aqe/${this.agentId.type}/history/${epicId}`
    ) || [];

    const assessmentCount = history.length;
    const avgScore = assessmentCount > 0
      ? history.reduce((sum: number, a: any) => sum + (a.overallScore || 0), 0) / assessmentCount
      : 0;

    // Determine trend
    let trend: 'improving' | 'stable' | 'worsening' = 'stable';
    if (history.length >= 2) {
      const recent = history.slice(-2);
      const scoreDiff = (recent[1]?.overallScore || 0) - (recent[0]?.overallScore || 0);
      if (scoreDiff > 5) trend = 'worsening';
      if (scoreDiff < -5) trend = 'improving';
    }

    return {
      epicId,
      timeRange,
      assessments: assessmentCount,
      trend,
      avgRiskScore: Math.round(avgScore * 10) / 10,
      criticalRisksTrend: history.map((a: any) => a.summary?.criticalRisks || 0),
      recommendations: [
        trend === 'worsening' ? 'Risk increasing - schedule risk review meeting' : '',
        avgScore > 50 ? 'High average risk - consider additional mitigations' : '',
        'Continue monitoring and updating mitigations'
      ].filter(r => r)
    };
  }

  /**
   * Update mitigation status
   */
  public async updateMitigation(
    mitigationId: string,
    status: RiskMitigation['status']
  ): Promise<RiskMitigation | null> {
    // Find mitigation in registry
    for (const [riskId, mitigations] of this.mitigationRegistry.entries()) {
      const mitigation = mitigations.find(m => m.id === mitigationId);
      if (mitigation) {
        mitigation.status = status;

        // Store update
        await this.memoryStore.store(
          `aqe/mitigations/${mitigationId}`,
          mitigation
        );

        return mitigation;
      }
    }

    return null;
  }

  /**
   * Batch assess multiple inputs
   */
  public async batchAssess(inputs: RiskAssessmentInput[]): Promise<{
    assessments: RiskAssessmentResult[];
    summary: {
      totalInputs: number;
      criticalRiskInputs: number;
      totalRisks: number;
      totalMitigations: number;
    };
  }> {
    const assessments = await Promise.all(
      inputs.map(input => this.assessRisks(input))
    );

    return {
      assessments,
      summary: {
        totalInputs: inputs.length,
        criticalRiskInputs: assessments.filter(a => a.overallRiskLevel === 'critical').length,
        totalRisks: assessments.reduce((sum, a) => sum + a.risks.length, 0),
        totalMitigations: assessments.reduce((sum, a) => sum + a.mitigations.length, 0)
      }
    };
  }

  private calculateOverallScore(scores: RiskScore[]): number {
    if (scores.length === 0) return 0;

    // Weight by severity
    const weightedSum = scores.reduce((sum, score) => {
      const weight = score.severity === 'critical' ? 2 : score.severity === 'high' ? 1.5 : 1;
      return sum + score.riskLevel * weight;
    }, 0);

    const totalWeight = scores.reduce((sum, score) => {
      return sum + (score.severity === 'critical' ? 2 : score.severity === 'high' ? 1.5 : 1);
    }, 0);

    return Math.round((weightedSum / totalWeight) * 10) / 10;
  }

  private generateSummary(
    risks: RiskItem[],
    scores: RiskScore[],
    mitigations: RiskMitigation[]
  ): RiskAssessmentResult['summary'] {
    const risksByCategory: Record<RiskCategory, number> = {
      technical: 0,
      business: 0,
      security: 0,
      compliance: 0,
      operational: 0
    };

    for (const risk of risks) {
      risksByCategory[risk.category]++;
    }

    return {
      totalRisks: risks.length,
      criticalRisks: scores.filter(s => s.severity === 'critical').length,
      highRisks: scores.filter(s => s.severity === 'high').length,
      mitigatedRisks: mitigations.filter(m => m.status === 'implemented' || m.status === 'verified').length,
      risksByCategory
    };
  }

  private generateRecommendations(
    risks: RiskItem[],
    scores: RiskScore[],
    overallLevel: 'low' | 'medium' | 'high' | 'critical'
  ): string[] {
    const recommendations: string[] = [];

    if (overallLevel === 'critical') {
      recommendations.push('CRITICAL: Schedule immediate risk review with stakeholders');
      recommendations.push('Consider delaying release until critical risks are mitigated');
    }

    if (overallLevel === 'high' || overallLevel === 'critical') {
      recommendations.push('Implement all proposed mitigations before proceeding');
      recommendations.push('Add contingency time to schedule for risk management');
    }

    // Category-specific recommendations
    const securityRisks = risks.filter(r => r.category === 'security').length;
    if (securityRisks > 0) {
      recommendations.push('Engage security team for early review');
    }

    const complianceRisks = risks.filter(r => r.category === 'compliance').length;
    if (complianceRisks > 0) {
      recommendations.push('Validate compliance requirements with legal/compliance team');
    }

    return recommendations.slice(0, 8);
  }

  /**
   * Extract domain-specific metrics for learning
   */
  protected extractTaskMetrics(result: any): Record<string, number> {
    const metrics: Record<string, number> = {};

    if (result && typeof result === 'object') {
      if (result.overallScore !== undefined) {
        metrics.overall_risk_score = result.overallScore;
      }

      if (result.risks) {
        metrics.risks_identified = result.risks.length;
      }

      if (result.summary) {
        metrics.critical_risks = result.summary.criticalRisks || 0;
        metrics.high_risks = result.summary.highRisks || 0;
        metrics.mitigated_risks = result.summary.mitigatedRisks || 0;
      }

      if (result.mitigations) {
        metrics.mitigations_proposed = result.mitigations.length;
      }

      const severityMap: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
      if (result.overallRiskLevel) {
        metrics.overall_severity = severityMap[result.overallRiskLevel] || 0;
      }
    }

    return metrics;
  }
}
