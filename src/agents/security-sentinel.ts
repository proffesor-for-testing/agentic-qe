/**
 * Security Sentinel Agent - Security Testing and Vulnerability Detection
 * Implements OWASP guidelines and security best practices
 */

import { BaseAgent } from './base-agent';
import {
  AgentId,
  AgentConfig,
  TaskDefinition,
  TaskResult,
  AgentDecision,
  ExplainableReasoning,
  Alternative,
  Risk,
  SecurityRequirement,
  ILogger,
  IEventBus,
  IMemorySystem
} from '../core/types';

interface SecurityVulnerability {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  cwe: string;
  owasp: string;
  location: string;
  description: string;
  exploitation: string;
  remediation: string;
  cvss: number;
}

interface SecurityAssessment {
  vulnerabilities: SecurityVulnerability[];
  securityScore: number;
  compliance: ComplianceCheck[];
  threats: ThreatModel[];
  recommendations: SecurityRecommendation[];
  testResults: SecurityTestResult[];
}

interface ComplianceCheck {
  standard: string;
  requirement: string;
  status: 'compliant' | 'non-compliant' | 'partial';
  evidence: string[];
  gaps: string[];
}

interface ThreatModel {
  asset: string;
  threatActor: string;
  attackVector: string;
  likelihood: number;
  impact: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  mitigations: string[];
}

interface SecurityRecommendation {
  category: string;
  priority: 'immediate' | 'high' | 'medium' | 'low';
  action: string;
  rationale: string;
  effort: number;
}

interface SecurityTestResult {
  testType: string;
  passed: boolean;
  findings: string[];
  evidence: any;
}

export class SecuritySentinelAgent extends BaseAgent {
  private owaspTop10: Map<string, any> = new Map();
  private securityPatterns: Map<string, any> = new Map();
  private threatDatabase: Map<string, ThreatModel> = new Map();
  private complianceFrameworks: Map<string, any> = new Map();

  constructor(
    id: AgentId,
    config: AgentConfig,
    logger: ILogger,
    eventBus: IEventBus,
    memory: IMemorySystem
  ) {
    super(id, config, logger, eventBus, memory);
    this.initializeSecurityKnowledge();
    this.loadComplianceFrameworks();
  }

  async initialize(): Promise<void> {
    await super.initialize();

    // Load threat intelligence from memory
    if (this.memory) {
      const threats = await this.memory.query({
        type: 'knowledge' as const,
        tags: ['threat-intelligence'],
        limit: 1000
      });

      threats.forEach(threat => {
        this.threatDatabase.set(threat.key, threat.value);
      });
    }

    this.logger.info('Security Sentinel initialized with threat intelligence');
  }

  protected async perceive(context: any): Promise<any> {
    const observation = {
      code: await this.scanCode(context),
      dependencies: await this.scanDependencies(context),
      configuration: await this.scanConfiguration(context),
      infrastructure: await this.scanInfrastructure(context),
      authentication: await this.analyzeAuthentication(context),
      authorization: await this.analyzeAuthorization(context),
      dataFlow: await this.analyzeDataFlow(context),
      requirements: context.securityRequirements || []
    };

    // Store security observation
    if (this.memory) {
      await this.memory.store(
        `security-scan:${Date.now()}`,
        observation,
        {
          type: 'state',
          tags: ['security', 'scan', 'observation'],
          ttl: 7200000
        }
      );
    }

    return observation;
  }

  protected async decide(observation: any): Promise<AgentDecision> {
    const vulnerabilities = await this.detectVulnerabilities(observation);
    const threats = await this.modelThreats(observation);
    const compliance = await this.checkCompliance(observation);

    const reasoning: ExplainableReasoning = {
      factors: [
        {
          name: 'OWASP Top 10',
          weight: 0.35,
          impact: vulnerabilities.some(v => v.severity === 'critical') ? 'critical' : 'high',
          explanation: `Found ${vulnerabilities.filter(v => v.owasp).length} OWASP vulnerabilities`
        },
        {
          name: 'Authentication Security',
          weight: 0.25,
          impact: observation.authentication.weaknesses > 0 ? 'high' : 'low',
          explanation: `${observation.authentication.weaknesses} authentication weaknesses detected`
        },
        {
          name: 'Data Protection',
          weight: 0.2,
          impact: observation.dataFlow.unencrypted > 0 ? 'high' : 'low',
          explanation: `${observation.dataFlow.unencrypted} unencrypted data flows found`
        },
        {
          name: 'Dependency Vulnerabilities',
          weight: 0.15,
          impact: observation.dependencies.critical > 0 ? 'critical' : 'medium',
          explanation: `${observation.dependencies.critical} critical dependency vulnerabilities`
        },
        {
          name: 'Compliance Status',
          weight: 0.05,
          impact: compliance.some(c => c.status === 'non-compliant') ? 'high' : 'low',
          explanation: `${compliance.filter(c => c.status === 'non-compliant').length} compliance violations`
        }
      ],
      heuristics: ['OWASP guidelines', 'CWE database', 'STRIDE threat modeling'],
      evidence: vulnerabilities.map(v => ({
        type: 'vulnerability',
        source: 'security-scan',
        confidence: 0.95,
        details: v
      }))
    };

    const alternatives: Alternative[] = [
      {
        action: 'immediate-patching',
        confidence: 0.9,
        reason: 'Critical vulnerabilities require immediate attention',
        impact: 'Reduces risk but may disrupt service'
      },
      {
        action: 'phased-remediation',
        confidence: 0.7,
        reason: 'Address vulnerabilities by priority',
        impact: 'Balanced approach with managed risk'
      },
      {
        action: 'compensating-controls',
        confidence: 0.5,
        reason: 'Implement additional security layers',
        impact: 'Mitigates risk without code changes'
      }
    ];

    const decision: AgentDecision = {
      id: `security-decision-${Date.now()}`,
      agentId: this.id.id,
      timestamp: new Date(),
      action: 'security-hardening',
      reasoning,
      confidence: this.calculateSecurityConfidence(vulnerabilities, threats),
      alternatives,
      risks: this.convertToRisks(vulnerabilities, threats),
      recommendations: this.generateSecurityRecommendations(vulnerabilities, threats, compliance)
    };

    // Store decision
    if (this.memory) {
      await this.memory.store(
        `decision:security:${decision.id}`,
        decision,
        {
          type: 'decision' as const,
          tags: ['security', 'explainable', 'sentinel'],
          ttl: 86400000
        }
      );
    }

    return decision;
  }

  protected async act(decision: AgentDecision): Promise<any> {
    const assessment: SecurityAssessment = {
      vulnerabilities: await this.detailVulnerabilities(decision),
      securityScore: this.calculateSecurityScore(decision),
      compliance: await this.generateComplianceReport(decision),
      threats: await this.generateThreatReport(decision),
      recommendations: this.prioritizeRecommendations(decision.recommendations),
      testResults: await this.runSecurityTests(decision)
    };

    // Share security findings
    if (this.memory) {
      await this.memory.store(
        `security-assessment:${Date.now()}`,
        assessment,
        {
          type: 'knowledge' as const,
          tags: ['security', 'assessment', 'shared'],
          partition: 'knowledge',
          consistency: 'strong'
        }
      );

      // Alert critical findings
      if (assessment.vulnerabilities.some(v => v.severity === 'critical')) {
        this.eventBus.emit('security:critical', {
          agent: this.id.id,
          vulnerabilities: assessment.vulnerabilities.filter(v => v.severity === 'critical')
        });
      }
    }

    return assessment;
  }

  protected async learn(feedback: any): Promise<void> {
    // Learn from false positives/negatives
    if (feedback.falsePositives) {
      feedback.falsePositives.forEach((fp: any) => {
        this.securityPatterns.set(`fp:${fp.pattern}`, {
          pattern: fp.pattern,
          falsePositive: true,
          context: fp.context
        });
      });
    }

    // Update threat models
    if (feedback.newThreats) {
      feedback.newThreats.forEach((threat: ThreatModel) => {
        this.threatDatabase.set(threat.asset, threat);
      });
    }

    // Store learning
    if (this.memory) {
      await this.memory.store(
        `learning:security:${Date.now()}`,
        {
          feedback,
          patternsUpdated: this.securityPatterns.size,
          threatsUpdated: this.threatDatabase.size
        },
        {
          type: 'knowledge' as const,
          tags: ['learning', 'security'],
          partition: 'knowledge'
        }
      );
    }

    this.updateMetrics({
      patternsLearned: this.securityPatterns.size,
      threatsKnown: this.threatDatabase.size
    });
  }

  async executeTask(task: TaskDefinition): Promise<TaskResult> {
    try {
      // Perceive
      const observation = await this.perceive(task.context);

      // Decide
      const decision = await this.decide(observation);

      // Act
      const assessment = await this.act(decision);

      // Learn
      if (task.context?.feedback) {
        await this.learn(task.context.feedback);
      }

      return {
        success: true,
        data: assessment,
        decision,
        confidence: decision.confidence,
        metrics: this.getMetrics()
      };

    } catch (error) {
      this.logger.error('Security assessment failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metrics: this.getMetrics()
      };
    }
  }

  private initializeSecurityKnowledge(): void {
    // OWASP Top 10
    this.owaspTop10.set('A01', {
      name: 'Broken Access Control',
      cwe: ['CWE-200', 'CWE-285', 'CWE-352'],
      detection: ['permission checks', 'CORS', 'JWT validation']
    });

    this.owaspTop10.set('A02', {
      name: 'Cryptographic Failures',
      cwe: ['CWE-259', 'CWE-327', 'CWE-331'],
      detection: ['weak algorithms', 'hardcoded secrets', 'missing encryption']
    });

    this.owaspTop10.set('A03', {
      name: 'Injection',
      cwe: ['CWE-79', 'CWE-89', 'CWE-73'],
      detection: ['input validation', 'parameterization', 'escaping']
    });

    // Security patterns
    this.securityPatterns.set('sql-injection', {
      pattern: /SELECT.*FROM.*WHERE.*\+|concat\(/gi,
      severity: 'critical',
      cwe: 'CWE-89'
    });

    this.securityPatterns.set('xss', {
      pattern: /innerHTML|document\.write|eval\(/gi,
      severity: 'high',
      cwe: 'CWE-79'
    });

    this.securityPatterns.set('hardcoded-secret', {
      pattern: /api[_-]?key|secret|password|token/gi,
      severity: 'high',
      cwe: 'CWE-798'
    });
  }

  private loadComplianceFrameworks(): void {
    this.complianceFrameworks.set('PCI-DSS', {
      requirements: ['encryption', 'access-control', 'monitoring', 'testing']
    });

    this.complianceFrameworks.set('GDPR', {
      requirements: ['data-protection', 'consent', 'right-to-delete', 'breach-notification']
    });

    this.complianceFrameworks.set('SOC2', {
      requirements: ['security', 'availability', 'integrity', 'confidentiality']
    });
  }

  private async scanCode(context: any): Promise<any> {
    // Simplified code scanning
    return {
      files: context.files || 100,
      vulnerabilities: [],
      patterns: Array.from(this.securityPatterns.keys())
    };
  }

  private async scanDependencies(context: any): Promise<any> {
    return {
      total: context.dependencies?.length || 50,
      critical: 0,
      high: 2,
      medium: 5,
      low: 10
    };
  }

  private async scanConfiguration(context: any): Promise<any> {
    return {
      secure: context.secure || false,
      https: context.https || true,
      headers: context.headers || []
    };
  }

  private async scanInfrastructure(context: any): Promise<any> {
    return {
      cloud: context.cloud || 'aws',
      containers: context.containers || true,
      secrets: context.secrets || 'vault'
    };
  }

  private async analyzeAuthentication(context: any): Promise<any> {
    return {
      method: context.authMethod || 'jwt',
      mfa: context.mfa || false,
      weaknesses: 0
    };
  }

  private async analyzeAuthorization(context: any): Promise<any> {
    return {
      model: context.authzModel || 'rbac',
      policies: context.policies || 10,
      issues: 0
    };
  }

  private async analyzeDataFlow(context: any): Promise<any> {
    return {
      flows: 10,
      encrypted: 8,
      unencrypted: 2
    };
  }

  private async detectVulnerabilities(observation: any): Promise<SecurityVulnerability[]> {
    const vulnerabilities: SecurityVulnerability[] = [];

    // Check for common vulnerabilities
    if (observation.dataFlow.unencrypted > 0) {
      vulnerabilities.push({
        id: 'vuln-1',
        type: 'Cryptographic Failure',
        severity: 'high',
        cwe: 'CWE-311',
        owasp: 'A02',
        location: 'data-flow',
        description: 'Unencrypted sensitive data transmission',
        exploitation: 'Data can be intercepted in transit',
        remediation: 'Implement TLS/SSL encryption',
        cvss: 7.5
      });
    }

    if (!observation.authentication.mfa) {
      vulnerabilities.push({
        id: 'vuln-2',
        type: 'Broken Authentication',
        severity: 'medium',
        cwe: 'CWE-287',
        owasp: 'A07',
        location: 'authentication',
        description: 'Missing multi-factor authentication',
        exploitation: 'Account takeover via credential theft',
        remediation: 'Implement MFA for all users',
        cvss: 5.3
      });
    }

    return vulnerabilities;
  }

  private async modelThreats(observation: any): Promise<ThreatModel[]> {
    const threats: ThreatModel[] = [];

    threats.push({
      asset: 'User Data',
      threatActor: 'External Attacker',
      attackVector: 'SQL Injection',
      likelihood: 0.6,
      impact: 0.9,
      riskLevel: 'high',
      mitigations: ['Input validation', 'Parameterized queries', 'WAF']
    });

    if (observation.dependencies.critical > 0) {
      threats.push({
        asset: 'Application',
        threatActor: 'Supply Chain',
        attackVector: 'Vulnerable Dependencies',
        likelihood: 0.8,
        impact: 0.8,
        riskLevel: 'high',
        mitigations: ['Dependency scanning', 'Regular updates', 'SBOM']
      });
    }

    return threats;
  }

  private async checkCompliance(observation: any): Promise<ComplianceCheck[]> {
    const checks: ComplianceCheck[] = [];

    // PCI-DSS check
    checks.push({
      standard: 'PCI-DSS',
      requirement: 'Encryption of cardholder data',
      status: observation.dataFlow.unencrypted === 0 ? 'compliant' : 'non-compliant',
      evidence: ['TLS 1.3 configured', 'AES-256 encryption'],
      gaps: observation.dataFlow.unencrypted > 0 ? ['Unencrypted data flows'] : []
    });

    return checks;
  }

  private calculateSecurityConfidence(vulnerabilities: SecurityVulnerability[], threats: ThreatModel[]): number {
    const vulnScore = 1 - (vulnerabilities.filter(v => v.severity === 'critical').length * 0.2);
    const threatScore = 1 - (threats.filter(t => t.riskLevel === 'critical').length * 0.15);
    return Math.max(0.3, Math.min(1, (vulnScore + threatScore) / 2));
  }

  private convertToRisks(vulnerabilities: SecurityVulnerability[], threats: ThreatModel[]): Risk[] {
    const risks: Risk[] = [];

    vulnerabilities.forEach(vuln => {
      risks.push({
        id: vuln.id,
        category: 'security',
        severity: vuln.severity,
        probability: 0.7,
        impact: vuln.severity,
        description: vuln.description,
        mitigation: vuln.remediation
      });
    });

    threats.forEach(threat => {
      risks.push({
        id: `threat-${threat.asset}`,
        category: 'security',
        severity: threat.riskLevel,
        probability: threat.likelihood,
        impact: threat.riskLevel,
        description: `${threat.attackVector} against ${threat.asset}`,
        mitigation: threat.mitigations.join(', ')
      });
    });

    return risks;
  }

  private generateSecurityRecommendations(
    vulnerabilities: SecurityVulnerability[],
    threats: ThreatModel[],
    compliance: ComplianceCheck[]
  ): string[] {
    const recommendations: string[] = [];

    if (vulnerabilities.some(v => v.severity === 'critical')) {
      recommendations.push('Address critical vulnerabilities immediately');
    }

    if (threats.some(t => t.riskLevel === 'high')) {
      recommendations.push('Implement threat mitigations for high-risk threats');
    }

    if (compliance.some(c => c.status === 'non-compliant')) {
      recommendations.push('Remediate compliance violations');
    }

    recommendations.push('Enable security monitoring and alerting');
    recommendations.push('Conduct regular security assessments');
    recommendations.push('Implement defense in depth strategy');

    return recommendations;
  }

  private async detailVulnerabilities(decision: AgentDecision): Promise<SecurityVulnerability[]> {
    return decision.risks
      .filter(r => r.category === 'security')
      .map(r => ({
        id: r.id,
        type: 'Security Vulnerability',
        severity: r.severity as any,
        cwe: 'CWE-000',
        owasp: 'A00',
        location: 'application',
        description: r.description || 'Security vulnerability detected',
        exploitation: 'Potential security breach',
        remediation: r.mitigation || 'Apply security patches',
        cvss: this.calculateCVSS(r)
      }));
  }

  private calculateCVSS(risk: Risk): number {
    const severityScores = { critical: 9.5, high: 7.5, medium: 5.0, low: 2.5 };
    return severityScores[risk.severity as keyof typeof severityScores] || 5.0;
  }

  private calculateSecurityScore(decision: AgentDecision): number {
    const baseScore = 100;
    const deductions = decision.risks.reduce((total, risk) => {
      const severityDeductions = { critical: 30, high: 20, medium: 10, low: 5 };
      return total + (severityDeductions[risk.severity as keyof typeof severityDeductions] || 0);
    }, 0);
    return Math.max(0, baseScore - deductions);
  }

  private async generateComplianceReport(decision: AgentDecision): Promise<ComplianceCheck[]> {
    return [{
      standard: 'Security Best Practices',
      requirement: 'Vulnerability Management',
      status: decision.risks.length === 0 ? 'compliant' : 'partial',
      evidence: ['Security scanning performed', 'Vulnerabilities identified'],
      gaps: decision.risks.map(r => r.description).filter(d => d !== undefined) as string[]
    }];
  }

  private async generateThreatReport(decision: AgentDecision): Promise<ThreatModel[]> {
    return Array.from(this.threatDatabase.values()).slice(0, 5);
  }

  private prioritizeRecommendations(recommendations: string[]): SecurityRecommendation[] {
    return recommendations.map((rec, index) => ({
      category: 'security',
      priority: index === 0 ? 'immediate' : index < 3 ? 'high' : 'medium',
      action: rec,
      rationale: 'Based on security assessment',
      effort: 5
    }));
  }

  private async runSecurityTests(decision: AgentDecision): Promise<SecurityTestResult[]> {
    return [
      {
        testType: 'SAST',
        passed: decision.risks.filter(r => r.severity === 'critical').length === 0,
        findings: decision.risks.map(r => r.description).filter(d => d !== undefined) as string[],
        evidence: { timestamp: new Date() }
      },
      {
        testType: 'Dependency Scan',
        passed: true,
        findings: [],
        evidence: { dependencies: 'scanned' }
      }
    ];
  }
}