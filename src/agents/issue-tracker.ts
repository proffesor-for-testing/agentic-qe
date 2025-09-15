/**
 * Issue Tracker Agent
 * Manages issue lifecycle, triage, and automated issue management
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

export interface Issue {
  id: string;
  number: number;
  title: string;
  body: string;
  author: string;
  repository: {
    owner: string;
    name: string;
  };
  state: 'open' | 'closed';
  labels: IssueLabel[];
  assignees: string[];
  milestone?: string;
  priority: 'low' | 'medium' | 'high' | 'critical' | 'unassigned';
  severity: 'info' | 'minor' | 'major' | 'critical' | 'unassessed';
  type: 'bug' | 'feature' | 'enhancement' | 'documentation' | 'question' | 'security' | 'performance' | 'unknown';
  created: Date;
  updated: Date;
  closed?: Date;
  dueDate?: Date;
  estimatedEffort?: number; // hours
  actualEffort?: number; // hours
  comments: IssueComment[];
  linkedPRs: string[];
  dependencies: string[];
  duplicateOf?: string;
}

export interface IssueLabel {
  name: string;
  color: string;
  description?: string;
  category: 'type' | 'priority' | 'severity' | 'area' | 'status' | 'other';
}

export interface IssueComment {
  id: string;
  author: string;
  body: string;
  created: Date;
  reactions?: Record<string, number>;
}

export interface TriageRule {
  id: string;
  name: string;
  description: string;
  conditions: TriageCondition[];
  actions: TriageAction[];
  priority: number;
  enabled: boolean;
}

export interface TriageCondition {
  field: 'title' | 'body' | 'author' | 'labels' | 'repository';
  operator: 'contains' | 'equals' | 'matches' | 'not_contains' | 'not_equals';
  value: string | string[];
  caseSensitive?: boolean;
}

export interface TriageAction {
  type: 'add_label' | 'remove_label' | 'assign' | 'set_priority' | 'set_severity' | 'set_milestone' | 'close' | 'comment' | 'notify';
  value: string | string[];
  reason?: string;
}

export interface IssueAnalysis {
  sentimentScore: number; // -1 to 1
  urgencyScore: number; // 0 to 1
  complexityScore: number; // 0 to 1
  duplicateProbability: number; // 0 to 1
  potentialDuplicates: string[];
  suggestedLabels: string[];
  suggestedAssignees: string[];
  estimatedEffort: number; // hours
  riskFactors: string[];
  technicalTerms: string[];
  affectedComponents: string[];
}

export interface SLAConfiguration {
  responseTime: {
    critical: number; // hours
    high: number;
    medium: number;
    low: number;
  };
  resolutionTime: {
    critical: number; // hours
    high: number;
    medium: number;
    low: number;
  };
  escalationRules: EscalationRule[];
}

export interface EscalationRule {
  condition: string;
  triggerAfter: number; // hours
  action: 'notify_maintainer' | 'increase_priority' | 'assign_to_team' | 'create_incident';
  target?: string[];
}

export interface TeamMember {
  username: string;
  role: 'maintainer' | 'contributor' | 'triager';
  expertise: string[];
  capacity: number;
  currentLoad: number;
  availability: {
    timezone: string;
    workingHours: { start: string; end: string };
    daysOff: string[];
  };
  performance: {
    averageResolutionTime: number;
    issuesResolved: number;
    satisfactionScore: number;
  };
}

export class IssueTrackerAgent extends BaseAgent {
  private activeIssues: Map<string, Issue> = new Map();
  private triageRules: TriageRule[] = [];
  private slaConfiguration: SLAConfiguration = {
    responseTime: { critical: 2, high: 8, medium: 24, low: 72 },
    resolutionTime: { critical: 4, high: 24, medium: 72, low: 168 },
    escalationRules: []
  };
  private teamMembers: Map<string, TeamMember> = new Map();
  private issueMetrics: Map<string, any> = new Map();
  private escalationTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    id: AgentId,
    config: AgentConfig,
    logger: ILogger,
    eventBus: IEventBus,
    memory: IMemorySystem
  ) {
    super(id, config, logger, eventBus, memory);
    this.initializeSLAConfiguration();
  }

  protected async initializeResources(): Promise<void> {
    await super.initializeResources();
    
    // Load active issues from memory
    await this.loadActiveIssues();
    
    // Load triage rules
    await this.loadTriageRules();
    
    // Load team configuration
    await this.loadTeamConfiguration();
    
    // Setup GitHub webhook handlers
    await this.setupWebhookHandlers();
    
    // Initialize triage automation
    await this.initializeTriageAutomation();
    
    // Setup SLA monitoring
    await this.setupSLAMonitoring();
    
    this.logger.info(`Issue Tracker Agent ${this.id.id} initialized with ${this.activeIssues.size} active issues`);
  }

  protected async perceive(context: any): Promise<any> {
    this.logger.info(`Analyzing issue management context for issue: ${context.issue?.title}`);

    const observation = {
      issue: context.issue,
      action: context.action,
      repository: context.repository,
      issueAnalysis: await this.analyzeIssue(context.issue),
      duplicateAnalysis: await this.analyzeDuplicates(context.issue),
      teamAnalysis: await this.analyzeTeamCapacity(),
      slaStatus: await this.analyzeSLAStatus(context.issue),
      historicalContext: await this.analyzeHistoricalContext(context.issue),
      urgencyAssessment: await this.assessUrgency(context.issue),
      complexityAssessment: await this.assessComplexity(context.issue),
      autoTriageRecommendations: await this.generateTriageRecommendations(context.issue)
    };

    // Store observation in shared memory
    await this.memory.store(`issue-tracker:observation:${context.issue.id}`, observation, {
      type: 'experience' as const,
      tags: ['issue', 'triage', 'observation'],
      partition: 'issue-management'
    });

    return observation;
  }

  protected async decide(observation: any): Promise<AgentDecision> {
    const decisionId = this.generateDecisionId();
    const { issue, action } = observation;
    
    // Determine triage actions
    const triageActions = await this.determineTriageActions(observation);
    
    // Assign issue if needed
    const assignmentRecommendation = await this.recommendAssignment(observation);
    
    // Set priority and severity
    const priorityAssessment = await this.assessPriorityAndSeverity(observation);
    
    // Plan follow-up actions
    const followUpPlan = await this.planFollowUpActions(observation);
    
    // Build reasoning
    const factors: ReasoningFactor[] = [
      {
        name: 'Urgency Assessment',
        weight: 0.3,
        value: observation.urgencyAssessment.score,
        impact: 'high' as const,
        explanation: observation.urgencyAssessment.reasoning
      },
      {
        name: 'Complexity Assessment',
        weight: 0.25,
        value: 1 - observation.complexityAssessment.score, // Higher complexity = lower decision confidence
        impact: 'medium' as const,
        explanation: observation.complexityAssessment.reasoning
      },
      {
        name: 'Team Capacity',
        weight: 0.2,
        value: observation.teamAnalysis.availabilityScore,
        impact: 'medium' as const,
        explanation: observation.teamAnalysis.reasoning
      },
      {
        name: 'Historical Success',
        weight: 0.15,
        value: observation.historicalContext.successProbability,
        impact: 'low' as const,
        explanation: observation.historicalContext.patterns
      },
      {
        name: 'SLA Compliance',
        weight: 0.1,
        value: 1 - observation.slaStatus.riskScore,
        impact: 'high' as const,
        explanation: observation.slaStatus.status
      }
    ];

    const evidence: Evidence[] = [
      {
        type: 'analytical' as const,
        source: 'issue-analysis',
        description: 'Technical analysis of issue content and metadata',
        confidence: 0.85
      },
      {
        type: 'empirical' as const,
        source: 'team-analysis',
        description: 'Team capacity analysis',
        confidence: 0.9
      },
      {
        type: 'historical',
        source: 'historical-context',
        description: 'Historical pattern analysis',
        confidence: 0.8
      },
      {
        type: 'heuristic' as const,
        source: 'sla-analysis',
        description: 'SLA compliance analysis',
        confidence: 0.95
      }
    ];

    const reasoning = this.buildReasoning(
      factors,
      ['SFDIPOT', 'CRUSSPIC'],
      evidence,
      [
        'Issue content analyzed for technical indicators',
        'Team capacity verified for assignment',
        'SLA requirements considered'
      ],
      [
        'Urgency assessment based on text analysis',
        'Team availability may change'
      ]
    );

    const confidence = this.calculateConfidence({
      evidence,
      factors,
      actionComplexity: triageActions.complexity
    });

    const decision: AgentDecision = {
      id: decisionId,
      agentId: this.id.id,
      timestamp: new Date(),
      action: JSON.stringify({
        triageActions,
        assignment: assignmentRecommendation,
        priority: priorityAssessment.priority,
        severity: priorityAssessment.severity,
        labels: priorityAssessment.suggestedLabels,
        followUp: followUpPlan,
        slaTarget: observation.slaStatus.target,
        estimatedEffort: observation.complexityAssessment.estimatedHours,
        escalationPlan: followUpPlan.escalation
      }),
      confidence,
      reasoning,
      alternatives: [],
      risks: [],
      recommendations: []
    };

    await this.memory.store(`issue-tracker:decision:${decisionId}`, decision, {
      type: 'decision' as const,
      tags: ['issue', 'triage', 'decision'],
      partition: 'decisions'
    });

    return decision;
  }

  protected async act(decision: AgentDecision): Promise<any> {
    const data = JSON.parse(decision.action);

    try {
      // Execute triage actions
      await this.executeTriageActions(data.triageActions);

      // Assign issue if recommended
      if (data.assignment.assignee) {
        await this.assignIssue(data.assignment);
      }

      // Set priority and severity
      await this.setPriorityAndSeverity(data.priority, data.severity);

      // Apply labels
      await this.applyLabels(data.labels);

      // Setup SLA monitoring
      await this.setupSLATracking(data.slaTarget);

      // Schedule follow-up actions
      await this.scheduleFollowUpActions(data.followUp);

      // Update issue metrics
      await this.updateIssueMetrics(data);
      
      const result = {
        success: true,
        triageCompleted: true,
        actionsExecuted: data.triageActions.actions.length,
        assigned: !!data.assignment.assignee,
        assignee: data.assignment.assignee,
        priority: data.priority,
        severity: data.severity,
        labelsApplied: data.labels.length,
        slaTarget: data.slaTarget,
        followUpScheduled: data.followUp.actions.length,
        executionTime: new Date()
      };
      
      // Share issue management knowledge
      await this.shareKnowledge({
        type: 'issue-management',
        triageActions: data.triageActions.actions.map((a: any) => a.type),
        prioritization: { priority: data.priority, severity: data.severity },
        assignmentStrategy: data.assignment.strategy,
        slaCompliance: data.slaTarget
      }, ['issue', 'triage', 'management']);
      
      return result;
    } catch (error) {
      this.logger.error('Issue management action failed', error);
      const err = error instanceof Error ? error : new Error(String(error)); throw err;
    }
  }

  protected async learn(feedback: any): Promise<void> {
    const { task, result, success } = feedback;
    
    if (success) {
      // Learn from successful issue management
      await this.memory.store(`issue-tracker:success-pattern:${task.id}`, {
        triageActions: result.actionsExecuted,
        assignment: result.assigned,
        priority: result.priority,
        severity: result.severity,
        resolutionTime: result.resolutionTime,
        successFactors: result.successFactors || [],
        timestamp: new Date()
      }, {
        type: 'knowledge' as const,
        tags: ['success-pattern', 'issue', 'triage'],
        partition: 'learning'
      });
      
      // Update team member performance
      if (result.assignee) {
        await this.updateTeamMemberPerformance(result.assignee, true, result.resolutionTime);
      }
    } else {
      // Learn from triage failures
      await this.memory.store(`issue-tracker:failure-pattern:${task.id}`, {
        failureReason: result.error,
        triageActions: task.context.triageActions,
        assignment: task.context.assignment,
        lessonsLearned: result.lessonsLearned || [],
        timestamp: new Date()
      }, {
        type: 'knowledge' as const,
        tags: ['failure-pattern', 'issue', 'triage'],
        partition: 'learning'
      });
      
      // Update team member performance
      if (task.context.assignment?.assignee) {
        await this.updateTeamMemberPerformance(task.context.assignment.assignee, false);
      }
    }
    
    // Update overall issue management metrics
    await this.updateOverallMetrics(task.context.issue.id, success);
  }

  private initializeSLAConfiguration(): void {
    this.slaConfiguration = {
      responseTime: {
        critical: 1, // 1 hour
        high: 4,     // 4 hours
        medium: 24,  // 24 hours
        low: 72      // 72 hours
      },
      resolutionTime: {
        critical: 24,  // 24 hours
        high: 72,      // 72 hours
        medium: 168,   // 1 week
        low: 720       // 1 month
      },
      escalationRules: [
        {
          condition: 'no_response_critical',
          triggerAfter: 0.5, // 30 minutes
          action: 'notify_maintainer',
          target: ['maintainers']
        },
        {
          condition: 'no_response_high',
          triggerAfter: 2, // 2 hours
          action: 'notify_maintainer',
          target: ['maintainers']
        },
        {
          condition: 'stalled_issue',
          triggerAfter: 168, // 1 week
          action: 'increase_priority'
        },
        {
          condition: 'security_issue',
          triggerAfter: 0, // immediate
          action: 'create_incident',
          target: ['security-team']
        }
      ]
    };
  }

  private async loadActiveIssues(): Promise<void> {
    try {
      const issuesData = await this.memory.retrieve('issue-tracker:active-issues');
      if (issuesData) {
        this.activeIssues = new Map(Object.entries(issuesData));
      }
    } catch (error) {
      this.logger.warn('No previous active issues found');
    }
  }

  private async loadTriageRules(): Promise<void> {
    try {
      const rulesData = await this.memory.retrieve('issue-tracker:triage-rules');
      if (rulesData) {
        this.triageRules = rulesData;
      } else {
        await this.initializeDefaultTriageRules();
      }
    } catch (error) {
      this.logger.warn('No triage rules found, initializing defaults');
      await this.initializeDefaultTriageRules();
    }
  }

  private async initializeDefaultTriageRules(): Promise<void> {
    const defaultRules: TriageRule[] = [
      {
        id: 'security-issue',
        name: 'Security Issue Detection',
        description: 'Automatically label and escalate security-related issues',
        conditions: [
          {
            field: 'title',
            operator: 'contains',
            value: ['security', 'vulnerability', 'exploit', 'xss', 'sql injection'],
            caseSensitive: false
          }
        ],
        actions: [
          { type: 'add_label', value: 'security' },
          { type: 'set_priority', value: 'critical' },
          { type: 'set_severity', value: 'critical' },
          { type: 'notify', value: 'security-team' }
        ],
        priority: 1,
        enabled: true
      },
      {
        id: 'performance-issue',
        name: 'Performance Issue Detection',
        description: 'Automatically label performance-related issues',
        conditions: [
          {
            field: 'body',
            operator: 'contains',
            value: ['slow', 'performance', 'timeout', 'memory', 'cpu'],
            caseSensitive: false
          }
        ],
        actions: [
          { type: 'add_label', value: 'performance' },
          { type: 'set_priority', value: 'high' }
        ],
        priority: 2,
        enabled: true
      },
      {
        id: 'bug-report',
        name: 'Bug Report Detection',
        description: 'Automatically label bug reports',
        conditions: [
          {
            field: 'title',
            operator: 'contains',
            value: ['bug', 'error', 'crash', 'broken', 'issue'],
            caseSensitive: false
          }
        ],
        actions: [
          { type: 'add_label', value: 'bug' },
          { type: 'set_priority', value: 'medium' }
        ],
        priority: 3,
        enabled: true
      },
      {
        id: 'feature-request',
        name: 'Feature Request Detection',
        description: 'Automatically label feature requests',
        conditions: [
          {
            field: 'title',
            operator: 'contains',
            value: ['feature', 'enhancement', 'request', 'add', 'support'],
            caseSensitive: false
          }
        ],
        actions: [
          { type: 'add_label', value: 'enhancement' },
          { type: 'set_priority', value: 'low' }
        ],
        priority: 4,
        enabled: true
      },
      {
        id: 'question',
        name: 'Question Detection',
        description: 'Automatically label questions',
        conditions: [
          {
            field: 'title',
            operator: 'contains',
            value: ['how to', 'question', 'help', '?'],
            caseSensitive: false
          }
        ],
        actions: [
          { type: 'add_label', value: 'question' },
          { type: 'set_priority', value: 'low' }
        ],
        priority: 5,
        enabled: true
      }
    ];

    this.triageRules = defaultRules;
    await this.saveTriageRules();
  }

  private async saveTriageRules(): Promise<void> {
    await this.memory.store('issue-tracker:triage-rules', this.triageRules, {
      type: 'knowledge' as const,
      tags: ['triage', 'rules'],
      partition: 'configuration'
    });
  }

  private async loadTeamConfiguration(): Promise<void> {
    try {
      const teamData = await this.memory.retrieve('issue-tracker:team-config');
      if (teamData) {
        this.teamMembers = new Map(Object.entries(teamData));
      } else {
        await this.initializeDefaultTeam();
      }
    } catch (error) {
      this.logger.warn('No team configuration found, initializing defaults');
      await this.initializeDefaultTeam();
    }
  }

  private async initializeDefaultTeam(): Promise<void> {
    const defaultTeam: TeamMember[] = [
      {
        username: 'maintainer1',
        role: 'maintainer',
        expertise: ['javascript', 'typescript', 'react', 'node.js'],
        capacity: 10,
        currentLoad: 3,
        availability: {
          timezone: 'UTC',
          workingHours: { start: '09:00', end: '17:00' },
          daysOff: ['Saturday', 'Sunday']
        },
        performance: {
          averageResolutionTime: 48,
          issuesResolved: 150,
          satisfactionScore: 4.2
        }
      },
      {
        username: 'maintainer2',
        role: 'maintainer',
        expertise: ['python', 'django', 'postgresql', 'docker'],
        capacity: 8,
        currentLoad: 2,
        availability: {
          timezone: 'UTC-8',
          workingHours: { start: '08:00', end: '16:00' },
          daysOff: ['Saturday', 'Sunday']
        },
        performance: {
          averageResolutionTime: 36,
          issuesResolved: 120,
          satisfactionScore: 4.5
        }
      },
      {
        username: 'triager1',
        role: 'triager',
        expertise: ['general', 'user-support', 'documentation'],
        capacity: 15,
        currentLoad: 5,
        availability: {
          timezone: 'UTC+1',
          workingHours: { start: '07:00', end: '15:00' },
          daysOff: ['Saturday', 'Sunday']
        },
        performance: {
          averageResolutionTime: 24,
          issuesResolved: 300,
          satisfactionScore: 4.0
        }
      }
    ];

    defaultTeam.forEach(member => {
      this.teamMembers.set(member.username, member);
    });

    await this.saveTeamConfiguration();
  }

  private async saveTeamConfiguration(): Promise<void> {
    const teamData = Object.fromEntries(this.teamMembers);
    await this.memory.store('issue-tracker:team-config', teamData, {
      type: 'knowledge' as const,
      tags: ['team', 'configuration'],
      partition: 'configuration'
    });
  }

  private async setupWebhookHandlers(): Promise<void> {
    // Setup GitHub webhook event handlers
    this.eventBus.on('github:issues', async (event) => {
      await this.handleIssueEvent(event);
    });
    
    this.eventBus.on('github:issue_comment', async (event) => {
      await this.handleIssueCommentEvent(event);
    });
  }

  private async handleIssueEvent(event: any): Promise<void> {
    const { action, issue } = event;
    
    this.logger.info(`Handling issue event: ${action} for issue #${issue.number}`);
    
    switch (action) {
      case 'opened':
        await this.handleIssueOpened(issue);
        break;
      case 'edited':
        await this.handleIssueEdited(issue);
        break;
      case 'closed':
        await this.handleIssueClosed(issue);
        break;
      case 'reopened':
        await this.handleIssueReopened(issue);
        break;
      case 'assigned':
        await this.handleIssueAssigned(issue, event.assignee);
        break;
      case 'labeled':
        await this.handleIssueLabeled(issue, event.label);
        break;
    }
  }

  private async handleIssueCommentEvent(event: any): Promise<void> {
    const { action, issue, comment } = event;
    
    if (action === 'created') {
      await this.handleCommentAdded(issue, comment);
    }
  }

  private async initializeTriageAutomation(): Promise<void> {
    // Process triage queue every 5 minutes
    setInterval(async () => {
      await this.processTriageQueue();
    }, 300000); // 5 minutes
  }

  private async setupSLAMonitoring(): Promise<void> {
    // Check SLA compliance every hour
    setInterval(async () => {
      await this.checkSLACompliance();
    }, 3600000); // 1 hour
  }

  private async analyzeIssue(issue: Issue): Promise<IssueAnalysis> {
    const analysis: IssueAnalysis = {
      sentimentScore: await this.analyzeSentiment(issue.title + ' ' + issue.body),
      urgencyScore: await this.analyzeUrgency(issue),
      complexityScore: await this.analyzeComplexity(issue),
      duplicateProbability: 0,
      potentialDuplicates: [],
      suggestedLabels: [],
      suggestedAssignees: [],
      estimatedEffort: 0,
      riskFactors: [],
      technicalTerms: this.extractTechnicalTerms(issue.title + ' ' + issue.body),
      affectedComponents: this.identifyAffectedComponents(issue.title + ' ' + issue.body)
    };
    
    // Find potential duplicates
    const duplicates = await this.findPotentialDuplicates(issue);
    analysis.duplicateProbability = duplicates.probability;
    analysis.potentialDuplicates = duplicates.issues;
    
    // Suggest labels based on content
    analysis.suggestedLabels = await this.suggestLabels(issue);
    
    // Suggest assignees based on expertise
    analysis.suggestedAssignees = await this.suggestAssignees(issue, analysis);
    
    // Estimate effort
    analysis.estimatedEffort = this.estimateEffort(analysis);
    
    // Identify risk factors
    analysis.riskFactors = this.identifyRiskFactors(issue, analysis);
    
    return analysis;
  }

  private async analyzeSentiment(text: string): Promise<number> {
    // Simple sentiment analysis - in real implementation would use NLP service
    const positiveWords = ['thank', 'please', 'great', 'awesome', 'love', 'excellent'];
    const negativeWords = ['hate', 'terrible', 'awful', 'broken', 'sucks', 'frustrated'];
    const urgentWords = ['urgent', 'critical', 'asap', 'immediately', 'emergency'];
    
    const words = text.toLowerCase().split(/\s+/);
    let score = 0;
    
    for (const word of words) {
      if (positiveWords.includes(word)) score += 0.1;
      if (negativeWords.includes(word)) score -= 0.2;
      if (urgentWords.includes(word)) score -= 0.3; // Urgent usually means negative sentiment
    }
    
    return Math.max(-1, Math.min(1, score));
  }

  private async analyzeUrgency(issue: Issue): Promise<number> {
    let urgencyScore = 0;
    
    const urgentKeywords = ['urgent', 'critical', 'asap', 'emergency', 'production', 'down', 'broken'];
    const text = (issue.title + ' ' + issue.body).toLowerCase();
    
    for (const keyword of urgentKeywords) {
      if (text.includes(keyword)) {
        urgencyScore += 0.2;
      }
    }
    
    // Check for security indicators
    const securityKeywords = ['security', 'vulnerability', 'exploit', 'breach'];
    for (const keyword of securityKeywords) {
      if (text.includes(keyword)) {
        urgencyScore += 0.3;
      }
    }
    
    // Check existing labels
    const highPriorityLabels = ['critical', 'high', 'urgent', 'security'];
    for (const label of issue.labels) {
      if (highPriorityLabels.includes(label.name.toLowerCase())) {
        urgencyScore += 0.25;
      }
    }
    
    return Math.min(1, urgencyScore);
  }

  private async analyzeComplexity(issue: Issue): Promise<number> {
    let complexityScore = 0;
    
    // Length-based complexity
    const textLength = issue.title.length + issue.body.length;
    complexityScore += Math.min(0.3, textLength / 2000); // Max 0.3 for length
    
    // Technical terms
    const technicalTerms = this.extractTechnicalTerms(issue.title + ' ' + issue.body);
    complexityScore += Math.min(0.3, technicalTerms.length * 0.05); // Max 0.3 for tech terms
    
    // Affected components
    const components = this.identifyAffectedComponents(issue.title + ' ' + issue.body);
    complexityScore += Math.min(0.2, components.length * 0.1); // Max 0.2 for components
    
    // Stack traces or code blocks
    const hasCodeBlocks = issue.body.includes('```') || issue.body.includes('    ');
    if (hasCodeBlocks) complexityScore += 0.2;
    
    return Math.min(1, complexityScore);
  }

  private extractTechnicalTerms(text: string): string[] {
    const technicalPatterns = [
      /\b[A-Z]{2,}\b/g, // Acronyms
      /\b\w+\.\w+\b/g, // Dotted notation (e.g., module.function)
      /\b\w+Error\b/g, // Error types
      /\b\w+Exception\b/g, // Exception types
      /\b[a-zA-Z]+\d+\b/g, // Alphanumeric identifiers
    ];
    
    const terms = new Set<string>();
    
    for (const pattern of technicalPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => terms.add(match));
      }
    }
    
    return Array.from(terms);
  }

  private identifyAffectedComponents(text: string): string[] {
    const componentKeywords = {
      'authentication': ['auth', 'login', 'password', 'token', 'session'],
      'database': ['database', 'db', 'sql', 'query', 'migration'],
      'ui': ['ui', 'interface', 'frontend', 'button', 'form', 'page'],
      'api': ['api', 'endpoint', 'rest', 'graphql', 'webhook'],
      'performance': ['performance', 'slow', 'memory', 'cpu', 'load'],
      'security': ['security', 'vulnerability', 'exploit', 'xss', 'csrf'],
      'documentation': ['docs', 'documentation', 'readme', 'guide'],
      'testing': ['test', 'testing', 'spec', 'unit', 'integration']
    };
    
    const components = [];
    const lowerText = text.toLowerCase();
    
    for (const [component, keywords] of Object.entries(componentKeywords)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          components.push(component);
          break;
        }
      }
    }
    
    return components;
  }

  private async findPotentialDuplicates(issue: Issue): Promise<{ probability: number; issues: string[] }> {
    // Simple duplicate detection based on title similarity
    const duplicates = [];
    const issueWords = new Set(issue.title.toLowerCase().split(/\s+/));
    
    for (const [id, existingIssue] of this.activeIssues) {
      if (id === issue.id) continue;
      
      const existingWords = new Set(existingIssue.title.toLowerCase().split(/\s+/));
      const intersection = new Set([...issueWords].filter(word => existingWords.has(word)));
      const union = new Set([...issueWords, ...existingWords]);
      
      const similarity = intersection.size / union.size;
      
      if (similarity > 0.6) {
        duplicates.push(id);
      }
    }
    
    const probability = duplicates.length > 0 ? Math.min(1, duplicates.length * 0.3) : 0;
    
    return { probability, issues: duplicates };
  }

  private async suggestLabels(issue: Issue): Promise<string[]> {
    const labels = [];
    const text = (issue.title + ' ' + issue.body).toLowerCase();
    
    // Apply triage rules to suggest labels
    for (const rule of this.triageRules) {
      if (this.evaluateTriageConditions(rule.conditions, issue)) {
        const labelActions = rule.actions.filter(action => action.type === 'add_label');
        labels.push(...labelActions.map(action => action.value as string));
      }
    }
    
    return [...new Set(labels)]; // Remove duplicates
  }

  private async suggestAssignees(issue: Issue, analysis: IssueAnalysis): Promise<string[]> {
    const suggestions = [];
    
    // Find team members with relevant expertise
    for (const [username, member] of this.teamMembers) {
      if (member.currentLoad >= member.capacity) continue;
      
      let score = 0;
      
      // Check expertise match
      for (const component of analysis.affectedComponents) {
        if (member.expertise.includes(component)) {
          score += 0.3;
        }
      }
      
      // Check availability
      const availabilityScore = (member.capacity - member.currentLoad) / member.capacity;
      score += availabilityScore * 0.4;
      
      // Check performance
      score += (member.performance.satisfactionScore / 5) * 0.3;
      
      if (score > 0.5) {
        suggestions.push(username);
      }
    }
    
    return suggestions.slice(0, 3); // Return top 3 suggestions
  }

  private estimateEffort(analysis: IssueAnalysis): number {
    // Base effort estimation
    let hours = 2; // Base 2 hours
    
    // Adjust for complexity
    hours *= (1 + analysis.complexityScore * 2);
    
    // Adjust for affected components
    hours += analysis.affectedComponents.length * 0.5;
    
    // Adjust for technical terms
    hours += analysis.technicalTerms.length * 0.1;
    
    return Math.round(hours * 10) / 10; // Round to 1 decimal
  }

  private identifyRiskFactors(issue: Issue, analysis: IssueAnalysis): string[] {
    const risks = [];
    
    if (analysis.urgencyScore > 0.7) {
      risks.push('High urgency');
    }
    
    if (analysis.complexityScore > 0.8) {
      risks.push('High complexity');
    }
    
    if (analysis.duplicateProbability > 0.6) {
      risks.push('Potential duplicate');
    }
    
    if (analysis.affectedComponents.includes('security')) {
      risks.push('Security implications');
    }
    
    if (analysis.affectedComponents.includes('performance')) {
      risks.push('Performance impact');
    }
    
    if (analysis.sentimentScore < -0.5) {
      risks.push('Negative user sentiment');
    }
    
    return risks;
  }

  private async analyzeDuplicates(issue: Issue): Promise<any> {
    const duplicateAnalysis = await this.findPotentialDuplicates(issue);
    
    return {
      hasPotentialDuplicates: duplicateAnalysis.probability > 0.5,
      probability: duplicateAnalysis.probability,
      duplicates: duplicateAnalysis.issues,
      confidence: duplicateAnalysis.probability > 0.8 ? 'high' : 
                 duplicateAnalysis.probability > 0.5 ? 'medium' : 'low'
    };
  }

  private async analyzeTeamCapacity(): Promise<any> {
    const members = Array.from(this.teamMembers.values());
    
    const totalCapacity = members.reduce((sum, member) => sum + member.capacity, 0);
    const currentLoad = members.reduce((sum, member) => sum + member.currentLoad, 0);
    const availableCapacity = totalCapacity - currentLoad;
    
    const availableMembers = members.filter(member => member.currentLoad < member.capacity);
    
    return {
      totalCapacity,
      currentLoad,
      availableCapacity,
      utilizationRate: currentLoad / totalCapacity,
      availableMembers: availableMembers.length,
      availabilityScore: availableCapacity / totalCapacity,
      reasoning: `${availableMembers.length} members available, ${availableCapacity} hours capacity remaining`
    };
  }

  private async analyzeSLAStatus(issue: Issue): Promise<any> {
    const priority = issue.priority === 'unassigned' ? 'medium' : (issue.priority || 'medium');
    const created = issue.created.getTime();
    const now = Date.now();
    const hoursOpen = (now - created) / (1000 * 60 * 60);

    const responseTarget = this.slaConfiguration.responseTime[priority as keyof typeof this.slaConfiguration.responseTime];
    const resolutionTarget = this.slaConfiguration.resolutionTime[priority as keyof typeof this.slaConfiguration.resolutionTime];
    
    const responseRisk = Math.max(0, (hoursOpen - responseTarget) / responseTarget);
    const resolutionRisk = Math.max(0, (hoursOpen - resolutionTarget) / resolutionTarget);
    
    return {
      priority,
      hoursOpen: Math.round(hoursOpen * 10) / 10,
      responseTarget,
      resolutionTarget,
      responseRisk,
      resolutionRisk,
      riskScore: Math.max(responseRisk, resolutionRisk),
      status: responseRisk > 1 ? 'SLA_BREACHED' : responseRisk > 0.8 ? 'AT_RISK' : 'ON_TRACK',
      target: {
        responseBy: new Date(created + responseTarget * 60 * 60 * 1000),
        resolveBy: new Date(created + resolutionTarget * 60 * 60 * 1000)
      }
    };
  }

  private async analyzeHistoricalContext(issue: Issue): Promise<any> {
    // Analyze historical patterns for similar issues
    const author = issue.author;
    const repository = `${issue.repository.owner}/${issue.repository.name}`;
    
    const authorHistory = await this.getAuthorHistory(author);
    const repoHistory = await this.getRepositoryHistory(repository);
    
    return {
      authorReliability: authorHistory.reliability,
      repositoryActivity: repoHistory.activity,
      successProbability: (authorHistory.reliability + repoHistory.resolutionRate) / 2,
      patterns: `Author reliability: ${(authorHistory.reliability * 100).toFixed(1)}%, Repo resolution rate: ${(repoHistory.resolutionRate * 100).toFixed(1)}%`
    };
  }

  private async getAuthorHistory(author: string): Promise<any> {
    try {
      const history = await this.memory.retrieve(`issue-tracker:author-history:${author}`) || {
        totalIssues: 0,
        validIssues: 0,
        reliability: 0.7 // Default
      };
      return history;
    } catch (error) {
      return { totalIssues: 0, validIssues: 0, reliability: 0.7 };
    }
  }

  private async getRepositoryHistory(repository: string): Promise<any> {
    try {
      const history = await this.memory.retrieve(`issue-tracker:repo-history:${repository}`) || {
        totalIssues: 0,
        resolvedIssues: 0,
        resolutionRate: 0.8,
        activity: 'medium'
      };
      return history;
    } catch (error) {
      return { totalIssues: 0, resolvedIssues: 0, resolutionRate: 0.8, activity: 'medium' };
    }
  }

  private async assessUrgency(issue: Issue): Promise<any> {
    const urgencyScore = await this.analyzeUrgency(issue);
    
    let urgencyLevel = 'low';
    if (urgencyScore > 0.7) urgencyLevel = 'critical';
    else if (urgencyScore > 0.5) urgencyLevel = 'high';
    else if (urgencyScore > 0.3) urgencyLevel = 'medium';
    
    return {
      score: urgencyScore,
      level: urgencyLevel,
      reasoning: `Urgency score: ${(urgencyScore * 100).toFixed(1)}% based on content analysis`
    };
  }

  private async assessComplexity(issue: Issue): Promise<any> {
    const complexityScore = await this.analyzeComplexity(issue);
    
    let complexityLevel = 'low';
    if (complexityScore > 0.7) complexityLevel = 'high';
    else if (complexityScore > 0.4) complexityLevel = 'medium';
    
    const estimatedHours = this.estimateEffort({ 
      complexityScore, 
      affectedComponents: this.identifyAffectedComponents(issue.title + ' ' + issue.body),
      technicalTerms: this.extractTechnicalTerms(issue.title + ' ' + issue.body)
    } as IssueAnalysis);
    
    return {
      score: complexityScore,
      level: complexityLevel,
      estimatedHours,
      reasoning: `Complexity score: ${(complexityScore * 100).toFixed(1)}%, estimated ${estimatedHours} hours`
    };
  }

  private async generateTriageRecommendations(issue: Issue): Promise<any> {
    const applicableRules = [];
    
    for (const rule of this.triageRules) {
      if (rule.enabled && this.evaluateTriageConditions(rule.conditions, issue)) {
        applicableRules.push(rule);
      }
    }
    
    // Sort by priority
    applicableRules.sort((a, b) => a.priority - b.priority);
    
    const recommendedActions = [];
    for (const rule of applicableRules) {
      recommendedActions.push(...rule.actions);
    }
    
    return {
      applicableRules: applicableRules.map(r => r.name),
      recommendedActions,
      confidence: applicableRules.length > 0 ? 0.8 : 0.3
    };
  }

  private evaluateTriageConditions(conditions: TriageCondition[], issue: Issue): boolean {
    return conditions.every(condition => {
      let fieldValue = '';
      
      switch (condition.field) {
        case 'title':
          fieldValue = issue.title;
          break;
        case 'body':
          fieldValue = issue.body;
          break;
        case 'author':
          fieldValue = issue.author;
          break;
        case 'labels':
          fieldValue = issue.labels.map(l => l.name).join(' ');
          break;
        case 'repository':
          fieldValue = `${issue.repository.owner}/${issue.repository.name}`;
          break;
      }
      
      if (!condition.caseSensitive) {
        fieldValue = fieldValue.toLowerCase();
      }
      
      const values = Array.isArray(condition.value) ? condition.value : [condition.value];
      
      switch (condition.operator) {
        case 'contains':
          return values.some(value => {
            const checkValue = condition.caseSensitive ? value : value.toLowerCase();
            return fieldValue.includes(checkValue);
          });
        case 'equals':
          return values.some(value => {
            const checkValue = condition.caseSensitive ? value : value.toLowerCase();
            return fieldValue === checkValue;
          });
        case 'matches':
          return values.some(value => {
            const regex = new RegExp(value, condition.caseSensitive ? '' : 'i');
            return regex.test(fieldValue);
          });
        case 'not_contains':
          return !values.some(value => {
            const checkValue = condition.caseSensitive ? value : value.toLowerCase();
            return fieldValue.includes(checkValue);
          });
        case 'not_equals':
          return !values.some(value => {
            const checkValue = condition.caseSensitive ? value : value.toLowerCase();
            return fieldValue === checkValue;
          });
        default:
          return false;
      }
    });
  }

  // Continue with action execution and remaining methods...
  
  private async determineTriageActions(observation: any): Promise<any> {
    const actions = observation.autoTriageRecommendations.recommendedActions;
    
    return {
      actions,
      complexity: actions.length * 0.1,
      reasoning: `${actions.length} triage actions recommended based on rule evaluation`
    };
  }

  private async recommendAssignment(observation: any): Promise<any> {
    const { issueAnalysis, teamAnalysis } = observation;
    
    if (teamAnalysis.availableMembers === 0) {
      return {
        assignee: null,
        strategy: 'queue',
        reasoning: 'No team members available'
      };
    }
    
    const suggestions = issueAnalysis.suggestedAssignees;
    if (suggestions.length > 0) {
      return {
        assignee: suggestions[0],
        strategy: 'expertise-match',
        reasoning: `Assigned to ${suggestions[0]} based on expertise match`
      };
    }
    
    // Find least loaded available member
    const availableMembers = Array.from(this.teamMembers.values())
      .filter(member => member.currentLoad < member.capacity)
      .sort((a, b) => a.currentLoad - b.currentLoad);
    
    if (availableMembers.length > 0) {
      return {
        assignee: availableMembers[0].username,
        strategy: 'load-balancing',
        reasoning: `Assigned to ${availableMembers[0].username} for load balancing`
      };
    }
    
    return {
      assignee: null,
      strategy: 'queue',
      reasoning: 'All team members at capacity'
    };
  }

  private async assessPriorityAndSeverity(observation: any): Promise<any> {
    const { urgencyAssessment, complexityAssessment, issueAnalysis } = observation;
    
    // Determine priority based on urgency and risk factors
    let priority = 'medium';
    if (urgencyAssessment.score > 0.7 || issueAnalysis.riskFactors.includes('Security implications')) {
      priority = 'critical';
    } else if (urgencyAssessment.score > 0.5) {
      priority = 'high';
    } else if (urgencyAssessment.score < 0.3) {
      priority = 'low';
    }
    
    // Determine severity based on complexity and impact
    let severity = 'minor';
    if (issueAnalysis.affectedComponents.includes('security') || 
        issueAnalysis.riskFactors.includes('Security implications')) {
      severity = 'critical';
    } else if (complexityAssessment.score > 0.7) {
      severity = 'major';
    } else if (complexityAssessment.score < 0.3) {
      severity = 'minor';
    } else {
      severity = 'minor';
    }
    
    return {
      priority,
      severity,
      suggestedLabels: issueAnalysis.suggestedLabels
    };
  }

  private async planFollowUpActions(observation: any): Promise<any> {
    const actions = [];
    const { slaStatus, urgencyAssessment } = observation;
    
    // Schedule SLA check
    if (slaStatus.riskScore > 0.5) {
      actions.push({
        type: 'sla-check',
        scheduleIn: 2, // hours
        description: 'Check SLA compliance'
      });
    }
    
    // Schedule follow-up if high urgency
    if (urgencyAssessment.score > 0.7) {
      actions.push({
        type: 'urgency-follow-up',
        scheduleIn: 4, // hours
        description: 'Follow up on high urgency issue'
      });
    }
    
    return {
      actions,
      escalation: {
        enabled: urgencyAssessment.score > 0.8,
        triggerAfter: 2, // hours
        target: 'maintainers'
      }
    };
  }

  // Action execution methods

  private async executeTriageActions(triageActions: any): Promise<void> {
    for (const action of triageActions.actions) {
      await this.executeTriageAction(action);
    }
  }

  private async executeTriageAction(action: TriageAction): Promise<void> {
    this.logger.info(`Executing triage action: ${action.type} - ${action.value}`);
    
    // Implementation would make GitHub API calls
    // For now, just log the action
    
    await this.memory.store(`issue-tracker:triage-action:${Date.now()}`, action, {
      type: 'decision' as const,
      tags: ['triage', 'action'],
      partition: 'triage-actions'
    });
  }

  private async assignIssue(assignment: any): Promise<void> {
    if (!assignment.assignee) return;
    
    this.logger.info(`Assigning issue to ${assignment.assignee}`);
    
    // Update team member load
    const member = this.teamMembers.get(assignment.assignee);
    if (member) {
      member.currentLoad += 1;
      this.teamMembers.set(assignment.assignee, member);
      await this.saveTeamConfiguration();
    }
  }

  private async setPriorityAndSeverity(priority: string, severity: string): Promise<void> {
    this.logger.info(`Setting priority: ${priority}, severity: ${severity}`);
    
    // Implementation would update issue via GitHub API
  }

  private async applyLabels(labels: string[]): Promise<void> {
    if (labels.length === 0) return;
    
    this.logger.info(`Applying labels: ${labels.join(', ')}`);
    
    // Implementation would apply labels via GitHub API
  }

  private async setupSLATracking(slaTarget: any): Promise<void> {
    this.logger.info(`Setting up SLA tracking: response by ${slaTarget.responseBy}`);
    
    await this.memory.store(`issue-tracker:sla-target:${Date.now()}`, slaTarget, {
      type: 'knowledge' as const,
      tags: ['sla', 'tracking'],
      partition: 'sla-tracking'
    });
  }

  private async scheduleFollowUpActions(followUp: any): Promise<void> {
    for (const action of followUp.actions) {
      this.logger.info(`Scheduling follow-up: ${action.description} in ${action.scheduleIn} hours`);
      
      // In real implementation, would schedule actual follow-up actions
      setTimeout(async () => {
        await this.executeFollowUpAction(action);
      }, action.scheduleIn * 60 * 60 * 1000);
    }
  }

  private async executeFollowUpAction(action: any): Promise<void> {
    this.logger.info(`Executing follow-up action: ${action.description}`);
    
    // Implementation would execute the specific follow-up action
  }

  private async updateIssueMetrics(data: any): Promise<void> {
    try {
      const metricsKey = 'issue-tracker:metrics:triage';
      let metrics = await this.memory.retrieve(metricsKey) || {
        totalIssuesTriaged: 0,
        averageTriageTime: 0,
        autoTriageSuccessRate: 0
      };
      
      metrics.totalIssuesTriaged++;
      // Update other metrics...
      
      await this.memory.store(metricsKey, metrics, {
        type: 'metric',
        tags: ['triage', 'metrics'],
        partition: 'metrics'
      });
    } catch (error) {
      this.logger.error('Failed to update issue metrics', error);
    }
  }

  // Event handlers

  private async handleIssueOpened(issue: any): Promise<void> {
    this.logger.info(`Issue opened: #${issue.number}`);
    
    // Add to active issues
    this.activeIssues.set(issue.id, issue);
    
    // Trigger auto-triage
    // Implementation would create a task for the Issue Tracker
  }

  private async handleIssueEdited(issue: any): Promise<void> {
    this.logger.info(`Issue edited: #${issue.number}`);
    
    // Update issue state
    this.activeIssues.set(issue.id, issue);
    
    // Re-evaluate triage if significant changes
  }

  private async handleIssueClosed(issue: any): Promise<void> {
    this.logger.info(`Issue closed: #${issue.number}`);
    
    // Remove from active issues
    this.activeIssues.delete(issue.id);
    
    // Update metrics
    await this.updateOverallMetrics(issue.id, true);
  }

  private async handleIssueReopened(issue: any): Promise<void> {
    this.logger.info(`Issue reopened: #${issue.number}`);
    
    // Add back to active issues
    this.activeIssues.set(issue.id, issue);
  }

  private async handleIssueAssigned(issue: any, assignee: any): Promise<void> {
    this.logger.info(`Issue #${issue.number} assigned to ${assignee.login}`);
    
    // Update team member load
    const member = this.teamMembers.get(assignee.login);
    if (member) {
      member.currentLoad += 1;
      this.teamMembers.set(assignee.login, member);
      await this.saveTeamConfiguration();
    }
  }

  private async handleIssueLabeled(issue: any, label: any): Promise<void> {
    this.logger.info(`Issue #${issue.number} labeled with ${label.name}`);
    
    // Update issue state
    const existingIssue = this.activeIssues.get(issue.id);
    if (existingIssue) {
      existingIssue.labels.push(label);
      this.activeIssues.set(issue.id, existingIssue);
    }
  }

  private async handleCommentAdded(issue: any, comment: any): Promise<void> {
    this.logger.info(`Comment added to issue #${issue.number}`);
    
    // Check if comment affects triage (e.g., adds more information)
    // Could trigger re-evaluation if needed
  }

  private async processTriageQueue(): Promise<void> {
    // Process any pending triage tasks
    this.logger.debug('Processing triage queue');
    
    // Implementation would process queued issues that need triage
  }

  private async checkSLACompliance(): Promise<void> {
    this.logger.debug('Checking SLA compliance');
    
    const now = Date.now();
    
    for (const [issueId, issue] of this.activeIssues) {
      const slaStatus = await this.analyzeSLAStatus(issue);
      
      if (slaStatus.riskScore > 1) {
        await this.escalateIssue(issueId, 'SLA_BREACH');
      } else if (slaStatus.riskScore > 0.8) {
        await this.warnSLARisk(issueId, slaStatus);
      }
    }
  }

  private async escalateIssue(issueId: string, reason: string): Promise<void> {
    this.logger.warn(`Escalating issue ${issueId}: ${reason}`);
    
    // Implementation would notify maintainers and take escalation actions
    
    await this.memory.store(`issue-tracker:escalation:${issueId}`, {
      issueId,
      reason,
      escalatedAt: new Date()
    }, {
      type: 'decision' as const,
      tags: ['escalation', 'sla'],
      partition: 'escalations'
    });
  }

  private async warnSLARisk(issueId: string, slaStatus: any): Promise<void> {
    this.logger.warn(`SLA risk for issue ${issueId}: ${slaStatus.status}`);
    
    // Implementation would send warnings to relevant parties
  }

  private async updateTeamMemberPerformance(username: string, success: boolean, resolutionTime?: number): Promise<void> {
    const member = this.teamMembers.get(username);
    if (!member) return;
    
    member.performance.issuesResolved++;
    
    if (resolutionTime) {
      member.performance.averageResolutionTime = 
        (member.performance.averageResolutionTime * (member.performance.issuesResolved - 1) + resolutionTime) / 
        member.performance.issuesResolved;
    }
    
    // Decrease current load
    member.currentLoad = Math.max(0, member.currentLoad - 1);
    
    this.teamMembers.set(username, member);
    await this.saveTeamConfiguration();
  }

  private async updateOverallMetrics(issueId: string, success: boolean): Promise<void> {
    try {
      const metricsKey = 'issue-tracker:metrics:overall';
      let metrics = await this.memory.retrieve(metricsKey) || {
        totalIssues: 0,
        resolvedIssues: 0,
        resolutionRate: 0,
        averageResolutionTime: 0
      };
      
      metrics.totalIssues++;
      if (success) {
        metrics.resolvedIssues++;
      }
      metrics.resolutionRate = metrics.resolvedIssues / metrics.totalIssues;
      
      await this.memory.store(metricsKey, metrics, {
        type: 'metric',
        tags: ['issue', 'overall-metrics'],
        partition: 'overall-metrics'
      });
    } catch (error) {
      this.logger.error('Failed to update overall metrics', error);
    }
  }

  private generateDecisionId(): string {
    return `issue-tracker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public methods for external interaction

  async getActiveIssues(): Promise<Issue[]> {
    return Array.from(this.activeIssues.values());
  }

  async getTriageRules(): Promise<TriageRule[]> {
    return this.triageRules;
  }

  async addTriageRule(rule: TriageRule): Promise<void> {
    this.triageRules.push(rule);
    await this.saveTriageRules();
    this.logger.info(`Added triage rule: ${rule.name}`);
  }

  async updateTriageRule(ruleId: string, updates: Partial<TriageRule>): Promise<void> {
    const ruleIndex = this.triageRules.findIndex(rule => rule.id === ruleId);
    if (ruleIndex !== -1) {
      this.triageRules[ruleIndex] = { ...this.triageRules[ruleIndex], ...updates };
      await this.saveTriageRules();
      this.logger.info(`Updated triage rule: ${ruleId}`);
    }
  }

  async deleteTriageRule(ruleId: string): Promise<void> {
    this.triageRules = this.triageRules.filter(rule => rule.id !== ruleId);
    await this.saveTriageRules();
    this.logger.info(`Deleted triage rule: ${ruleId}`);
  }

  async getTeamStatus(): Promise<any> {
    const members = Array.from(this.teamMembers.values());
    
    return {
      totalMembers: members.length,
      availableMembers: members.filter(m => m.currentLoad < m.capacity).length,
      totalCapacity: members.reduce((sum, m) => sum + m.capacity, 0),
      currentLoad: members.reduce((sum, m) => sum + m.currentLoad, 0),
      members: members.map(member => ({
        username: member.username,
        role: member.role,
        currentLoad: member.currentLoad,
        capacity: member.capacity,
        utilization: member.currentLoad / member.capacity,
        performance: member.performance
      }))
    };
  }

  async updateSLAConfiguration(config: Partial<SLAConfiguration>): Promise<void> {
    this.slaConfiguration = { ...this.slaConfiguration, ...config };
    
    await this.memory.store('issue-tracker:sla-config', this.slaConfiguration, {
      type: 'knowledge' as const,
      tags: ['sla', 'configuration'],
      partition: 'configuration'
    });
    
    this.logger.info('Updated SLA configuration');
  }

  async getIssueMetrics(): Promise<any> {
    const overallMetrics = await this.memory.retrieve('issue-tracker:metrics:overall') || {};
    const triageMetrics = await this.memory.retrieve('issue-tracker:metrics:triage') || {};
    
    return {
      overall: overallMetrics,
      triage: triageMetrics,
      activeIssues: this.activeIssues.size,
      slaConfiguration: this.slaConfiguration
    };
  }

  async analyzeIssueForTriage(issue: Issue): Promise<IssueAnalysis> {
    return await this.analyzeIssue(issue);
  }

  async manualTriage(issueId: string, actions: TriageAction[]): Promise<void> {
    this.logger.info(`Manual triage for issue ${issueId}`);
    
    for (const action of actions) {
      await this.executeTriageAction(action);
    }
  }
}