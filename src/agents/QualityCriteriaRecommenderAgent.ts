/**
 * QualityCriteriaRecommenderAgent - Recommends quality criteria using HTSM v6.3 categories
 *
 * Core capabilities:
 * - HTSM quality category analysis (10 categories from James Bach's model)
 * - Quality criteria prioritization using risk-based/value-based methods
 * - Product factors assessment integration
 * - Quality test strategy recommendations
 * - Quality criteria traceability mapping
 * - Stakeholder-specific quality views
 *
 * Memory namespaces:
 * - aqe/qcsd/ideation/* - QCSD Ideation phase data
 * - aqe/quality-criteria/* - Generated quality criteria
 * - aqe/htsm-assessments/* - HTSM assessment results
 */

import { BaseAgent, BaseAgentConfig } from './BaseAgent';
import { QETask, QEAgentType, QualityCriteriaRecommenderConfig } from '../types';

// ============================================================================
// Type Definitions
// ============================================================================

export interface QualityCriteriaRecommenderAgentConfig extends BaseAgentConfig {
  /** HTSM configuration */
  htsmCategories?: QualityCriteriaRecommenderConfig['htsmCategories'];
  /** Prioritization settings */
  prioritization?: QualityCriteriaRecommenderConfig['prioritization'];
  /** Integration settings */
  integration?: QualityCriteriaRecommenderConfig['integration'];
}

/**
 * HTSM v6.3 Quality Categories (James Bach's Heuristic Test Strategy Model)
 */
export interface HTSMCategory {
  id: string;
  name: string;
  description: string;
  weight: number;
  subcategories: string[];
}

export interface QualityCriteria {
  id: string;
  category: string;
  subcategory?: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  rationale: string;
  testingApproach: string[];
  acceptanceCriteria: string[];
  riskIfNeglected: string;
  effortEstimate: 'low' | 'medium' | 'high';
}

export interface ProductFactorsInput {
  epicId: string;
  epicName: string;
  description: string;
  userStories?: string[];
  acceptanceCriteria?: string[];
  technicalConstraints?: string[];
  businessContext?: {
    userBase?: string;
    marketPosition?: string;
    timeline?: string;
    budget?: string;
  };
}

export interface HTSMAssessment {
  productFactors: ProductFactorsInput;
  timestamp: Date;
  assessor: string;
  categories: {
    capability: CategoryAssessment;
    reliability: CategoryAssessment;
    usability: CategoryAssessment;
    charisma: CategoryAssessment;
    security: CategoryAssessment;
    scalability: CategoryAssessment;
    compatibility: CategoryAssessment;
    performance: CategoryAssessment;
    installability: CategoryAssessment;
    development: CategoryAssessment;
  };
  overallRiskScore: number;
  prioritizedCriteria: QualityCriteria[];
  recommendations: string[];
}

export interface CategoryAssessment {
  relevance: number; // 0-10
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  keyConsiderations: string[];
  suggestedCriteria: QualityCriteria[];
}

// ============================================================================
// HTSM v6.3 Category Definitions
// ============================================================================

const HTSM_CATEGORIES: HTSMCategory[] = [
  {
    id: 'capability',
    name: 'Capability',
    description: 'Can the product perform its required functions?',
    weight: 1.0,
    subcategories: ['Features', 'Accuracy', 'Completeness', 'Data handling']
  },
  {
    id: 'reliability',
    name: 'Reliability',
    description: 'Will the product work well and resist failure under all conditions?',
    weight: 1.0,
    subcategories: ['Error handling', 'Recovery', 'Stability', 'Predictability']
  },
  {
    id: 'usability',
    name: 'Usability',
    description: 'How easy is it for a real user to use the product?',
    weight: 0.9,
    subcategories: ['Learnability', 'Efficiency', 'Accessibility', 'User experience']
  },
  {
    id: 'charisma',
    name: 'Charisma',
    description: 'How appealing is the product?',
    weight: 0.7,
    subcategories: ['Aesthetics', 'Satisfaction', 'Professionalism', 'First impression']
  },
  {
    id: 'security',
    name: 'Security',
    description: 'How well protected is the product against unauthorized access?',
    weight: 1.2,
    subcategories: ['Authentication', 'Authorization', 'Data protection', 'Audit']
  },
  {
    id: 'scalability',
    name: 'Scalability',
    description: 'How well does the product perform under increased load?',
    weight: 1.0,
    subcategories: ['Load handling', 'Resource usage', 'Growth capacity', 'Elasticity']
  },
  {
    id: 'compatibility',
    name: 'Compatibility',
    description: 'How well does the product work with external components?',
    weight: 0.8,
    subcategories: ['Browser/Device', 'Integration', 'Standards', 'Backward compatibility']
  },
  {
    id: 'performance',
    name: 'Performance',
    description: 'How fast and responsive is the product?',
    weight: 1.1,
    subcategories: ['Response time', 'Throughput', 'Resource efficiency', 'Optimization']
  },
  {
    id: 'installability',
    name: 'Installability',
    description: 'How easily can the product be installed and deployed?',
    weight: 0.6,
    subcategories: ['Setup', 'Configuration', 'Upgrade', 'Uninstall']
  },
  {
    id: 'development',
    name: 'Development',
    description: 'How well does the product support ongoing development?',
    weight: 0.8,
    subcategories: ['Maintainability', 'Testability', 'Code quality', 'Documentation']
  }
];

// ============================================================================
// QualityCriteriaRecommenderAgent Implementation
// ============================================================================

export class QualityCriteriaRecommenderAgent extends BaseAgent {
  private readonly agentConfig: QualityCriteriaRecommenderAgentConfig;
  private htsmCategories: Map<string, HTSMCategory> = new Map();

  constructor(config: QualityCriteriaRecommenderAgentConfig) {
    super({
      ...config,
      id: config.id || `quality-criteria-recommender-${Date.now()}`,
      type: QEAgentType.QUALITY_CRITERIA_RECOMMENDER,
      capabilities: [
        {
          name: 'htsm-assessment',
          version: '1.0.0',
          description: 'Assess product against HTSM v6.3 quality categories'
        },
        {
          name: 'quality-criteria-generation',
          version: '1.0.0',
          description: 'Generate prioritized quality criteria recommendations'
        },
        {
          name: 'risk-based-prioritization',
          version: '1.0.0',
          description: 'Prioritize criteria based on risk and business value'
        },
        {
          name: 'test-strategy-recommendation',
          version: '1.0.0',
          description: 'Recommend testing approaches for each quality criterion'
        },
        {
          name: 'stakeholder-view-generation',
          version: '1.0.0',
          description: 'Generate stakeholder-specific quality views'
        }
      ]
    });

    this.agentConfig = {
      ...config,
      htsmCategories: config.htsmCategories || {
        capability: true,
        reliability: true,
        usability: true,
        charisma: true,
        security: true,
        scalability: true,
        compatibility: true,
        performance: true,
        installability: true,
        development: true
      },
      prioritization: config.prioritization || {
        method: 'risk-based',
        maxCriteria: 20,
        includeRationale: true
      }
    };
  }

  // ============================================================================
  // Lifecycle Hooks
  // ============================================================================

  protected async onPreTask(data: { assignment: any }): Promise<void> {
    await super.onPreTask(data);

    // Load historical assessments
    const history = await this.memoryStore.retrieve(
      `aqe/${this.agentId.type}/history`
    );

    if (history) {
      console.log(`Loaded ${history.length} historical HTSM assessments`);
    }

    console.log(`[${this.agentId.type}] Starting quality criteria recommendation task`, {
      taskId: data.assignment.id,
      taskType: data.assignment.task.type
    });
  }

  protected async onPostTask(data: { assignment: any; result: any }): Promise<void> {
    await super.onPostTask(data);

    // Store assessment results
    await this.memoryStore.store(
      `aqe/${this.agentId.type}/results/${data.assignment.id}`,
      {
        result: data.result,
        timestamp: new Date(),
        taskType: data.assignment.task.type,
        success: data.result?.success !== false,
        criteriaGenerated: data.result?.prioritizedCriteria?.length || 0,
        categoriesAssessed: data.result?.categories ? Object.keys(data.result.categories).length : 0
      },
      86400 // 24h TTL
    );

    // Emit completion event for QCSD coordination
    this.emitEvent('qcsd.quality.criteria.recommended', {
      agentId: this.agentId,
      result: data.result,
      criteriaCount: data.result?.prioritizedCriteria?.length || 0,
      timestamp: new Date()
    }, 'high');

    console.log(`[${this.agentId.type}] Quality criteria recommendation completed`, {
      taskId: data.assignment.id,
      criteriaGenerated: data.result?.prioritizedCriteria?.length || 0
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
        timestamp: new Date(),
        taskType: data.assignment.task.type
      },
      604800 // 7d TTL
    );

    console.error(`[${this.agentId.type}] Quality criteria recommendation failed`, {
      taskId: data.assignment.id,
      error: data.error.message
    });
  }

  // ============================================================================
  // BaseAgent Abstract Method Implementations
  // ============================================================================

  protected async initializeComponents(): Promise<void> {
    console.log(`QualityCriteriaRecommenderAgent ${this.agentId.id} initializing components`);

    // Initialize HTSM categories map
    for (const category of HTSM_CATEGORIES) {
      this.htsmCategories.set(category.id, category);
    }

    // Register for QCSD coordination events
    this.registerEventHandler({
      eventType: 'qcsd.ideation.started',
      handler: async (event) => {
        console.log('QCSD Ideation phase started, preparing for quality criteria assessment');
      }
    });

    this.registerEventHandler({
      eventType: 'qcsd.product.factors.assessed',
      handler: async (event) => {
        console.log('Product factors assessed, integrating into quality criteria recommendations');
      }
    });

    console.log('QualityCriteriaRecommenderAgent components initialized successfully');
  }

  protected async loadKnowledge(): Promise<void> {
    console.log('Loading quality criteria recommender knowledge base');

    // Load prior HTSM patterns
    const priorPatterns = await this.retrieveMemory('htsm-patterns');
    if (priorPatterns) {
      console.log('Loaded historical HTSM assessment patterns');
    }

    // Load project-specific quality standards
    const projectStandards = await this.memoryStore.retrieve('aqe/qcsd/ideation/project-standards');
    if (projectStandards) {
      console.log('Loaded project-specific quality standards');
    }

    console.log('Quality criteria recommender knowledge loaded successfully');
  }

  protected async cleanup(): Promise<void> {
    console.log(`QualityCriteriaRecommenderAgent ${this.agentId.id} cleaning up resources`);

    // Save learned patterns
    await this.storeMemory('htsm-patterns', Array.from(this.htsmCategories.entries()));

    console.log('QualityCriteriaRecommenderAgent cleanup completed');
  }

  protected async performTask(task: QETask): Promise<any> {
    const taskType = task.type;
    const taskData = task.payload;

    switch (taskType) {
      case 'assess-htsm':
        return await this.assessHTSM(taskData.productFactors);

      case 'generate-quality-criteria':
        return await this.generateQualityCriteria(taskData.productFactors, taskData.categories);

      case 'prioritize-criteria':
        return await this.prioritizeCriteria(taskData.criteria, taskData.method);

      case 'generate-test-strategy':
        return await this.generateTestStrategy(taskData.criteria);

      case 'generate-stakeholder-view':
        return await this.generateStakeholderView(taskData.assessment, taskData.stakeholderType);

      case 'batch-assess':
        return await this.batchAssess(taskData.epics);

      default:
        throw new Error(`Unsupported task type: ${taskType}`);
    }
  }

  // ============================================================================
  // Core Capabilities
  // ============================================================================

  /**
   * Perform comprehensive HTSM assessment for product factors
   */
  public async assessHTSM(productFactors: ProductFactorsInput): Promise<HTSMAssessment> {
    console.log(`Assessing HTSM categories for epic: ${productFactors.epicId}`);

    const categories = {
      capability: await this.assessCategory('capability', productFactors),
      reliability: await this.assessCategory('reliability', productFactors),
      usability: await this.assessCategory('usability', productFactors),
      charisma: await this.assessCategory('charisma', productFactors),
      security: await this.assessCategory('security', productFactors),
      scalability: await this.assessCategory('scalability', productFactors),
      compatibility: await this.assessCategory('compatibility', productFactors),
      performance: await this.assessCategory('performance', productFactors),
      installability: await this.assessCategory('installability', productFactors),
      development: await this.assessCategory('development', productFactors)
    };

    // Calculate overall risk score
    const overallRiskScore = this.calculateOverallRisk(categories);

    // Generate prioritized criteria from all categories
    const allCriteria: QualityCriteria[] = [];
    for (const cat of Object.values(categories)) {
      allCriteria.push(...cat.suggestedCriteria);
    }

    const prioritizedCriteria = await this.prioritizeCriteria(
      allCriteria,
      this.agentConfig.prioritization?.method || 'risk-based'
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(categories, overallRiskScore);

    const assessment: HTSMAssessment = {
      productFactors,
      timestamp: new Date(),
      assessor: this.agentId.id,
      categories,
      overallRiskScore,
      prioritizedCriteria,
      recommendations
    };

    // Store assessment in memory
    await this.memoryStore.store(
      `aqe/qcsd/ideation/htsm-assessment/${productFactors.epicId}`,
      assessment
    );

    // Emit assessment complete event
    this.emitEvent('qcsd.htsm.assessment.complete', {
      epicId: productFactors.epicId,
      overallRiskScore,
      criteriaCount: prioritizedCriteria.length,
      highRiskCategories: Object.entries(categories)
        .filter(([_, cat]) => cat.riskLevel === 'high' || cat.riskLevel === 'critical')
        .map(([name]) => name)
    }, 'high');

    console.log(`HTSM assessment complete for ${productFactors.epicId}. Risk score: ${overallRiskScore}`);

    return assessment;
  }

  /**
   * Assess a specific HTSM category against product factors
   */
  private async assessCategory(
    categoryId: string,
    productFactors: ProductFactorsInput
  ): Promise<CategoryAssessment> {
    const category = this.htsmCategories.get(categoryId);
    if (!category) {
      throw new Error(`Unknown HTSM category: ${categoryId}`);
    }

    const text = `${productFactors.description} ${(productFactors.userStories || []).join(' ')}`.toLowerCase();

    // Calculate relevance based on keyword matches
    const relevance = this.calculateCategoryRelevance(category, text);

    // Determine risk level
    const riskLevel = this.determineCategoryRisk(categoryId, text, productFactors);

    // Generate key considerations
    const keyConsiderations = this.generateKeyConsiderations(category, productFactors);

    // Generate suggested criteria
    const suggestedCriteria = this.generateCategorySpecificCriteria(category, productFactors, riskLevel);

    return {
      relevance,
      riskLevel,
      keyConsiderations,
      suggestedCriteria
    };
  }

  private calculateCategoryRelevance(category: HTSMCategory, text: string): number {
    let relevance = 5; // Base relevance

    const keywords: Record<string, string[]> = {
      capability: ['feature', 'function', 'requirement', 'data', 'process', 'workflow'],
      reliability: ['error', 'fail', 'recover', 'stable', 'robust', 'consistent'],
      usability: ['user', 'easy', 'intuitive', 'learn', 'accessible', 'experience'],
      charisma: ['design', 'look', 'feel', 'brand', 'appeal', 'polish'],
      security: ['auth', 'secure', 'encrypt', 'protect', 'access', 'permission'],
      scalability: ['scale', 'load', 'concurrent', 'growth', 'capacity', 'elastic'],
      compatibility: ['browser', 'device', 'integration', 'api', 'standard', 'mobile'],
      performance: ['fast', 'speed', 'latency', 'response', 'throughput', 'optimize'],
      installability: ['deploy', 'install', 'setup', 'config', 'upgrade', 'migrate'],
      development: ['maintain', 'test', 'code', 'document', 'debug', 'refactor']
    };

    const categoryKeywords = keywords[category.id] || [];
    for (const keyword of categoryKeywords) {
      if (text.includes(keyword)) {
        relevance += 0.5;
      }
    }

    return Math.min(10, relevance);
  }

  private determineCategoryRisk(
    categoryId: string,
    text: string,
    productFactors: ProductFactorsInput
  ): 'low' | 'medium' | 'high' | 'critical' {
    let riskScore = 2; // Base risk

    // High-risk indicators by category
    const riskIndicators: Record<string, string[]> = {
      capability: ['critical', 'core', 'essential', 'must-have', 'regulatory'],
      reliability: ['24/7', 'mission-critical', 'uptime', 'sla', 'disaster'],
      usability: ['accessibility', 'wcag', 'ada', 'inclusive', 'elderly'],
      charisma: ['brand', 'competitive', 'market-leader', 'premium'],
      security: ['pii', 'sensitive', 'financial', 'healthcare', 'gdpr', 'pci'],
      scalability: ['million', 'global', 'viral', 'enterprise', 'peak'],
      compatibility: ['legacy', 'multi-platform', 'offline', 'cross-browser'],
      performance: ['real-time', 'sub-second', 'critical-path', 'latency-sensitive'],
      installability: ['zero-downtime', 'blue-green', 'canary', 'automated'],
      development: ['legacy', 'technical-debt', 'complex', 'monolith']
    };

    const indicators = riskIndicators[categoryId] || [];
    for (const indicator of indicators) {
      if (text.includes(indicator)) {
        riskScore += 1.5;
      }
    }

    // Consider business context
    if (productFactors.businessContext) {
      if (productFactors.businessContext.userBase?.includes('million')) riskScore += 1;
      if (productFactors.businessContext.timeline?.includes('urgent')) riskScore += 1;
    }

    // Technical constraints impact
    if (productFactors.technicalConstraints && productFactors.technicalConstraints.length > 3) {
      riskScore += 1;
    }

    if (riskScore >= 8) return 'critical';
    if (riskScore >= 6) return 'high';
    if (riskScore >= 4) return 'medium';
    return 'low';
  }

  private generateKeyConsiderations(
    category: HTSMCategory,
    productFactors: ProductFactorsInput
  ): string[] {
    const considerations: string[] = [];

    // Add category-specific considerations
    const categoryConsiderations: Record<string, string[]> = {
      capability: [
        'Verify all functional requirements are testable',
        'Ensure data handling meets accuracy requirements',
        'Validate workflow completeness'
      ],
      reliability: [
        'Define error handling scenarios',
        'Plan recovery testing',
        'Establish stability metrics'
      ],
      usability: [
        'Include real user testing sessions',
        'Test with assistive technologies',
        'Measure task completion rates'
      ],
      charisma: [
        'Conduct visual regression testing',
        'Validate brand consistency',
        'Test first impressions'
      ],
      security: [
        'Perform threat modeling',
        'Test authentication/authorization paths',
        'Validate data protection measures'
      ],
      scalability: [
        'Define load testing scenarios',
        'Test with realistic data volumes',
        'Validate auto-scaling behavior'
      ],
      compatibility: [
        'Test across target browsers/devices',
        'Validate third-party integrations',
        'Check backward compatibility'
      ],
      performance: [
        'Define response time SLAs',
        'Identify performance-critical paths',
        'Plan for performance regression testing'
      ],
      installability: [
        'Test deployment automation',
        'Validate rollback procedures',
        'Check configuration management'
      ],
      development: [
        'Ensure adequate test coverage',
        'Review code complexity metrics',
        'Validate documentation accuracy'
      ]
    };

    considerations.push(...(categoryConsiderations[category.id] || []));

    // Add context-specific considerations based on product factors
    if (productFactors.technicalConstraints) {
      for (const constraint of productFactors.technicalConstraints) {
        if (category.id === 'performance' && constraint.toLowerCase().includes('latency')) {
          considerations.push(`Technical constraint: ${constraint}`);
        }
      }
    }

    return considerations;
  }

  private generateCategorySpecificCriteria(
    category: HTSMCategory,
    productFactors: ProductFactorsInput,
    riskLevel: 'low' | 'medium' | 'high' | 'critical'
  ): QualityCriteria[] {
    const criteria: QualityCriteria[] = [];
    const priority = this.riskToPriority(riskLevel);

    // Generate 2-4 criteria per category based on relevance
    const criteriaTemplates: Record<string, Omit<QualityCriteria, 'id'>[]> = {
      capability: [
        {
          category: 'capability',
          description: 'All functional requirements are implemented and testable',
          priority,
          rationale: 'Core functionality must work correctly for product viability',
          testingApproach: ['Functional testing', 'User acceptance testing', 'Regression testing'],
          acceptanceCriteria: ['All features pass functional tests', 'No P1/P2 defects in core flows'],
          riskIfNeglected: 'Missing or broken features lead to user dissatisfaction',
          effortEstimate: 'high'
        },
        {
          category: 'capability',
          description: 'Data accuracy and integrity maintained throughout workflows',
          priority: priority === 'critical' ? 'critical' : 'high',
          rationale: 'Data corruption or loss damages trust and may have legal implications',
          testingApproach: ['Data validation testing', 'Boundary testing', 'Integration testing'],
          acceptanceCriteria: ['Data validation passes', 'No data loss in transactions'],
          riskIfNeglected: 'Data corruption, compliance violations',
          effortEstimate: 'medium'
        }
      ],
      reliability: [
        {
          category: 'reliability',
          description: 'System handles errors gracefully without data loss',
          priority,
          rationale: 'Graceful degradation maintains user trust during failures',
          testingApproach: ['Error injection testing', 'Fault tolerance testing', 'Recovery testing'],
          acceptanceCriteria: ['All error scenarios show user-friendly messages', 'No unhandled exceptions'],
          riskIfNeglected: 'System crashes, data loss, poor user experience',
          effortEstimate: 'medium'
        },
        {
          category: 'reliability',
          description: 'System recovers automatically from transient failures',
          priority: priority === 'critical' ? 'high' : 'medium',
          rationale: 'Auto-recovery minimizes downtime and manual intervention',
          testingApproach: ['Chaos testing', 'Failover testing', 'Circuit breaker testing'],
          acceptanceCriteria: ['Recovery within SLA', 'No manual intervention required'],
          riskIfNeglected: 'Extended downtime, manual recovery costs',
          effortEstimate: 'high'
        }
      ],
      security: [
        {
          category: 'security',
          description: 'Authentication and authorization controls properly enforced',
          priority: 'critical',
          rationale: 'Security breaches can cause significant financial and reputational damage',
          testingApproach: ['Penetration testing', 'Access control testing', 'Session testing'],
          acceptanceCriteria: ['No unauthorized access possible', 'Session management secure'],
          riskIfNeglected: 'Data breach, compliance violations, legal liability',
          effortEstimate: 'high'
        },
        {
          category: 'security',
          description: 'Sensitive data encrypted at rest and in transit',
          priority: 'critical',
          rationale: 'Data protection is fundamental to security and compliance',
          testingApproach: ['Encryption testing', 'TLS configuration testing', 'Key management testing'],
          acceptanceCriteria: ['All PII encrypted', 'TLS 1.2+ enforced'],
          riskIfNeglected: 'Data exposure, compliance violations',
          effortEstimate: 'medium'
        }
      ],
      performance: [
        {
          category: 'performance',
          description: 'Response times meet defined SLAs under normal load',
          priority,
          rationale: 'Performance directly impacts user experience and conversion',
          testingApproach: ['Load testing', 'Response time measurement', 'Performance profiling'],
          acceptanceCriteria: ['P95 response time < 200ms', 'No timeout errors'],
          riskIfNeglected: 'User abandonment, poor experience',
          effortEstimate: 'high'
        },
        {
          category: 'performance',
          description: 'Core Web Vitals meet Google thresholds',
          priority: priority === 'low' ? 'medium' : priority,
          rationale: 'CWV impacts SEO rankings and user experience',
          testingApproach: ['Lighthouse testing', 'Real user monitoring', 'Synthetic monitoring'],
          acceptanceCriteria: ['LCP < 2.5s', 'FID < 100ms', 'CLS < 0.1'],
          riskIfNeglected: 'SEO penalty, poor user experience',
          effortEstimate: 'medium'
        }
      ],
      usability: [
        {
          category: 'usability',
          description: 'Interface is intuitive and learnable for target users',
          priority,
          rationale: 'Usability directly impacts adoption and user satisfaction',
          testingApproach: ['Usability testing', 'User journey testing', 'Heuristic evaluation'],
          acceptanceCriteria: ['Task completion rate > 90%', 'Error rate < 5%'],
          riskIfNeglected: 'Low adoption, user frustration',
          effortEstimate: 'medium'
        }
      ],
      scalability: [
        {
          category: 'scalability',
          description: 'System handles expected peak load without degradation',
          priority,
          rationale: 'Scalability ensures system works during traffic spikes',
          testingApproach: ['Load testing', 'Stress testing', 'Spike testing'],
          acceptanceCriteria: ['Handles 2x normal load', 'Auto-scales within 5 minutes'],
          riskIfNeglected: 'System outages during peak',
          effortEstimate: 'high'
        }
      ],
      compatibility: [
        {
          category: 'compatibility',
          description: 'Works across all supported browsers and devices',
          priority,
          rationale: 'Cross-browser compatibility ensures full market reach',
          testingApproach: ['Cross-browser testing', 'Device testing', 'Responsive testing'],
          acceptanceCriteria: ['Works on Chrome/Firefox/Safari/Edge', 'Mobile-friendly'],
          riskIfNeglected: 'Lost users, fragmented experience',
          effortEstimate: 'medium'
        }
      ],
      charisma: [
        {
          category: 'charisma',
          description: 'Visual design is consistent with brand guidelines',
          priority: priority === 'critical' ? 'high' : priority,
          rationale: 'Visual consistency builds brand trust',
          testingApproach: ['Visual regression testing', 'Design review', 'Brand audit'],
          acceptanceCriteria: ['No visual regressions', 'Brand colors/fonts consistent'],
          riskIfNeglected: 'Brand dilution, unprofessional appearance',
          effortEstimate: 'low'
        }
      ],
      installability: [
        {
          category: 'installability',
          description: 'Deployment process is automated and repeatable',
          priority,
          rationale: 'Reliable deployments reduce risk and enable faster releases',
          testingApproach: ['Deployment testing', 'Rollback testing', 'Configuration testing'],
          acceptanceCriteria: ['Zero-downtime deployment', 'Rollback < 5 minutes'],
          riskIfNeglected: 'Failed deployments, extended downtime',
          effortEstimate: 'medium'
        }
      ],
      development: [
        {
          category: 'development',
          description: 'Code is maintainable and well-documented',
          priority: priority === 'critical' ? 'high' : priority,
          rationale: 'Maintainability reduces long-term costs and enables faster changes',
          testingApproach: ['Code review', 'Static analysis', 'Documentation review'],
          acceptanceCriteria: ['Test coverage > 80%', 'No critical code smells'],
          riskIfNeglected: 'Technical debt, slow development',
          effortEstimate: 'medium'
        }
      ]
    };

    const templates = criteriaTemplates[category.id] || [];
    for (let i = 0; i < templates.length; i++) {
      criteria.push({
        id: `${category.id}-${productFactors.epicId}-${i + 1}`,
        ...templates[i]
      });
    }

    return criteria;
  }

  private riskToPriority(risk: 'low' | 'medium' | 'high' | 'critical'): 'low' | 'medium' | 'high' | 'critical' {
    return risk;
  }

  /**
   * Generate quality criteria from assessed categories
   */
  public async generateQualityCriteria(
    productFactors: ProductFactorsInput,
    categories?: string[]
  ): Promise<QualityCriteria[]> {
    const criteria: QualityCriteria[] = [];

    const categoriesToProcess = categories || Array.from(this.htsmCategories.keys());

    for (const categoryId of categoriesToProcess) {
      if (!this.agentConfig.htsmCategories?.[categoryId as keyof typeof this.agentConfig.htsmCategories]) {
        continue; // Skip disabled categories
      }

      const category = this.htsmCategories.get(categoryId);
      if (category) {
        const assessment = await this.assessCategory(categoryId, productFactors);
        criteria.push(...assessment.suggestedCriteria);
      }
    }

    return criteria;
  }

  /**
   * Prioritize criteria using specified method
   */
  public async prioritizeCriteria(
    criteria: QualityCriteria[],
    method: 'risk-based' | 'value-based' | 'moscow' = 'risk-based'
  ): Promise<QualityCriteria[]> {
    let sorted: QualityCriteria[];

    switch (method) {
      case 'risk-based':
        sorted = this.prioritizeByRisk(criteria);
        break;
      case 'value-based':
        sorted = this.prioritizeByValue(criteria);
        break;
      case 'moscow':
        sorted = this.prioritizeByMoscow(criteria);
        break;
      default:
        sorted = criteria;
    }

    // Limit to configured max criteria
    const maxCriteria = this.agentConfig.prioritization?.maxCriteria || 20;
    return sorted.slice(0, maxCriteria);
  }

  private prioritizeByRisk(criteria: QualityCriteria[]): QualityCriteria[] {
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...criteria].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  private prioritizeByValue(criteria: QualityCriteria[]): QualityCriteria[] {
    const effortOrder: Record<string, number> = { low: 0, medium: 1, high: 2 };
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

    // Value = Priority / Effort (higher priority with lower effort = higher value)
    return [...criteria].sort((a, b) => {
      const valueA = (3 - priorityOrder[a.priority]) / (effortOrder[a.effortEstimate] + 1);
      const valueB = (3 - priorityOrder[b.priority]) / (effortOrder[b.effortEstimate] + 1);
      return valueB - valueA;
    });
  }

  private prioritizeByMoscow(criteria: QualityCriteria[]): QualityCriteria[] {
    // MOSCOW: Must > Should > Could > Won't
    // Map priority: critical = Must, high = Should, medium = Could, low = Won't
    return this.prioritizeByRisk(criteria);
  }

  /**
   * Generate test strategy recommendations for criteria
   */
  public async generateTestStrategy(criteria: QualityCriteria[]): Promise<{
    criteria: QualityCriteria;
    strategy: {
      testTypes: string[];
      estimatedEffort: string;
      dependencies: string[];
      risks: string[];
    };
  }[]> {
    return criteria.map(criterion => ({
      criteria: criterion,
      strategy: {
        testTypes: criterion.testingApproach,
        estimatedEffort: criterion.effortEstimate,
        dependencies: this.inferDependencies(criterion),
        risks: [criterion.riskIfNeglected]
      }
    }));
  }

  private inferDependencies(criterion: QualityCriteria): string[] {
    const dependencies: string[] = [];

    if (criterion.category === 'security') {
      dependencies.push('Authentication service available');
      dependencies.push('Test credentials configured');
    }

    if (criterion.category === 'performance') {
      dependencies.push('Performance testing environment');
      dependencies.push('Load testing tools configured');
    }

    if (criterion.category === 'compatibility') {
      dependencies.push('Browser testing infrastructure');
      dependencies.push('Device lab or cloud testing service');
    }

    return dependencies;
  }

  /**
   * Generate stakeholder-specific view of assessment
   */
  public async generateStakeholderView(
    assessment: HTSMAssessment,
    stakeholderType: 'executive' | 'technical' | 'product' | 'qa'
  ): Promise<{
    summary: string;
    keyFindings: string[];
    recommendedActions: string[];
    metrics: Record<string, number>;
  }> {
    const views: Record<string, () => { summary: string; keyFindings: string[]; recommendedActions: string[]; metrics: Record<string, number> }> = {
      executive: () => ({
        summary: `Overall quality risk score: ${assessment.overallRiskScore}/10. ${assessment.prioritizedCriteria.length} quality criteria identified.`,
        keyFindings: [
          `${assessment.prioritizedCriteria.filter(c => c.priority === 'critical').length} critical quality criteria require attention`,
          `Security and performance are ${assessment.categories.security.riskLevel === 'high' ? 'high risk' : 'under control'}`,
          `Recommended investment: ${assessment.prioritizedCriteria.filter(c => c.effortEstimate === 'high').length} high-effort items`
        ],
        recommendedActions: assessment.recommendations.slice(0, 3),
        metrics: {
          overallRisk: assessment.overallRiskScore,
          criticalItems: assessment.prioritizedCriteria.filter(c => c.priority === 'critical').length,
          totalCriteria: assessment.prioritizedCriteria.length
        }
      }),
      technical: () => ({
        summary: `Technical quality assessment for ${assessment.productFactors.epicName}`,
        keyFindings: Object.entries(assessment.categories)
          .filter(([_, cat]) => cat.riskLevel === 'high' || cat.riskLevel === 'critical')
          .map(([name, cat]) => `${name}: ${cat.riskLevel} risk - ${cat.keyConsiderations[0]}`),
        recommendedActions: assessment.prioritizedCriteria
          .filter(c => c.category === 'performance' || c.category === 'security' || c.category === 'scalability')
          .slice(0, 5)
          .map(c => c.description),
        metrics: {
          securityRisk: assessment.categories.security.relevance,
          performanceRisk: assessment.categories.performance.relevance,
          scalabilityRisk: assessment.categories.scalability.relevance
        }
      }),
      product: () => ({
        summary: `User-facing quality criteria for ${assessment.productFactors.epicName}`,
        keyFindings: Object.entries(assessment.categories)
          .filter(([name]) => ['usability', 'capability', 'charisma', 'performance'].includes(name))
          .map(([name, cat]) => `${name}: ${cat.keyConsiderations[0]}`),
        recommendedActions: assessment.prioritizedCriteria
          .filter(c => ['usability', 'capability', 'charisma'].includes(c.category))
          .slice(0, 5)
          .map(c => c.description),
        metrics: {
          usabilityRelevance: assessment.categories.usability.relevance,
          capabilityRelevance: assessment.categories.capability.relevance
        }
      }),
      qa: () => ({
        summary: `Test planning guide for ${assessment.productFactors.epicName}`,
        keyFindings: assessment.prioritizedCriteria.slice(0, 10).map(c =>
          `[${c.priority.toUpperCase()}] ${c.category}: ${c.description}`
        ),
        recommendedActions: assessment.prioritizedCriteria.slice(0, 5).flatMap(c => c.testingApproach),
        metrics: {
          totalTestCriteria: assessment.prioritizedCriteria.length,
          criticalTests: assessment.prioritizedCriteria.filter(c => c.priority === 'critical').length,
          highEffortTests: assessment.prioritizedCriteria.filter(c => c.effortEstimate === 'high').length
        }
      })
    };

    return views[stakeholderType]();
  }

  private calculateOverallRisk(categories: HTSMAssessment['categories']): number {
    const riskScores: Record<string, number> = { low: 2, medium: 4, high: 7, critical: 10 };
    let totalScore = 0;
    let totalWeight = 0;

    for (const [id, assessment] of Object.entries(categories)) {
      const category = this.htsmCategories.get(id);
      const weight = category?.weight || 1.0;
      totalScore += riskScores[assessment.riskLevel] * weight;
      totalWeight += weight;
    }

    return Math.round((totalScore / totalWeight) * 10) / 10;
  }

  private generateRecommendations(
    categories: HTSMAssessment['categories'],
    overallRiskScore: number
  ): string[] {
    const recommendations: string[] = [];

    // Add risk-based recommendations
    if (overallRiskScore >= 7) {
      recommendations.push('Consider dedicated quality engineering sprint before release');
      recommendations.push('Engage security team for early review');
    }

    // Add category-specific recommendations
    for (const [name, cat] of Object.entries(categories)) {
      if (cat.riskLevel === 'critical' || cat.riskLevel === 'high') {
        recommendations.push(`Priority focus on ${name}: ${cat.keyConsiderations[0]}`);
      }
    }

    // Limit recommendations
    return recommendations.slice(0, 10);
  }

  /**
   * Batch assess multiple epics
   */
  public async batchAssess(epics: ProductFactorsInput[]): Promise<{
    assessments: HTSMAssessment[];
    summary: {
      totalEpics: number;
      highRiskCount: number;
      totalCriteria: number;
      categoryBreakdown: Record<string, number>;
    };
  }> {
    const assessments = await Promise.all(
      epics.map(epic => this.assessHTSM(epic))
    );

    const highRiskCount = assessments.filter(a => a.overallRiskScore >= 7).length;
    const totalCriteria = assessments.reduce((sum, a) => sum + a.prioritizedCriteria.length, 0);

    const categoryBreakdown: Record<string, number> = {};
    for (const assessment of assessments) {
      for (const [name, cat] of Object.entries(assessment.categories)) {
        if (cat.riskLevel === 'high' || cat.riskLevel === 'critical') {
          categoryBreakdown[name] = (categoryBreakdown[name] || 0) + 1;
        }
      }
    }

    return {
      assessments,
      summary: {
        totalEpics: epics.length,
        highRiskCount,
        totalCriteria,
        categoryBreakdown
      }
    };
  }

  /**
   * Extract domain-specific metrics for learning
   */
  protected extractTaskMetrics(result: any): Record<string, number> {
    const metrics: Record<string, number> = {};

    if (result && typeof result === 'object') {
      if (result.overallRiskScore !== undefined) {
        metrics.overall_risk_score = result.overallRiskScore;
      }

      if (result.prioritizedCriteria) {
        metrics.criteria_generated = result.prioritizedCriteria.length;
        metrics.critical_criteria = result.prioritizedCriteria.filter((c: any) => c.priority === 'critical').length;
        metrics.high_criteria = result.prioritizedCriteria.filter((c: any) => c.priority === 'high').length;
      }

      if (result.categories) {
        const riskMap: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
        let totalRisk = 0;
        let count = 0;
        for (const cat of Object.values(result.categories) as CategoryAssessment[]) {
          totalRisk += riskMap[cat.riskLevel] || 0;
          count++;
        }
        metrics.avg_category_risk = count > 0 ? totalRisk / count : 0;
      }
    }

    return metrics;
  }
}
