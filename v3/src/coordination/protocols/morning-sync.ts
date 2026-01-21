/**
 * Agentic QE v3 - Morning Sync Protocol
 *
 * Daily coordination protocol that runs at 9am or session start
 * Participants: All 12 domains
 * Actions: Review overnight results, identify risks, prioritize work
 */

import { v4 as uuidv4 } from 'uuid';
import {
  DomainEvent,
  DomainName,
  Result,
  ok,
  err,
  Severity,
  Priority,
  ALL_DOMAINS,
} from '../../shared/types';
import { EventBus } from '../../kernel/interfaces';

// ============================================================================
// Protocol Types
// ============================================================================

/**
 * Configuration for morning sync execution
 */
export interface MorningSyncConfig {
  /** Time window to look back for results (default: 24 hours) */
  lookbackHours: number;
  /** Minimum severity threshold for risk identification */
  riskSeverityThreshold: Severity;
  /** Maximum number of priority items to generate */
  maxPriorityItems: number;
  /** Domains to include (default: all) */
  includedDomains: DomainName[];
}

/**
 * Overnight results from a single domain
 */
export interface DomainOvernightResults {
  domain: DomainName;
  /** Test execution results */
  testResults?: TestExecutionSummary;
  /** Coverage analysis results */
  coverageResults?: CoverageSummary;
  /** Quality metrics */
  qualityMetrics?: QualityMetricsSummary;
  /** Defect predictions */
  defectPredictions?: DefectPredictionSummary;
  /** Security findings */
  securityFindings?: SecurityFindingsSummary;
  /** Errors encountered */
  errors: string[];
  /** Timestamp of last activity */
  lastActivity?: Date;
}

export interface TestExecutionSummary {
  totalRuns: number;
  passed: number;
  failed: number;
  skipped: number;
  flakyTests: number;
  averageDuration: number;
  failedTestIds: string[];
}

export interface CoverageSummary {
  line: number;
  branch: number;
  function: number;
  statement: number;
  delta: number;
  trend: 'improving' | 'declining' | 'stable';
  gapsIdentified: number;
  criticalGaps: CriticalGap[];
}

export interface CriticalGap {
  file: string;
  lines: number[];
  riskScore: number;
}

export interface QualityMetricsSummary {
  overallScore: number;
  gatesPassed: number;
  gatesFailed: number;
  failedGates: string[];
  deploymentsBlocked: number;
}

export interface DefectPredictionSummary {
  highRiskFiles: number;
  predictedDefects: number;
  topRiskFiles: Array<{ file: string; probability: number }>;
}

export interface SecurityFindingsSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  newVulnerabilities: number;
  resolvedVulnerabilities: number;
  complianceScore: number;
}

/**
 * Identified risk from overnight analysis
 */
export interface IdentifiedRisk {
  id: string;
  severity: Severity;
  priority: Priority;
  domain: DomainName;
  title: string;
  description: string;
  source: string;
  impact: string;
  recommendation: string;
  relatedItems: string[];
  detectedAt: Date;
}

/**
 * Prioritized work item
 */
export interface PrioritizedWorkItem {
  id: string;
  priority: Priority;
  type: 'fix' | 'test' | 'review' | 'investigate' | 'improve';
  title: string;
  description: string;
  estimatedEffort: 'trivial' | 'small' | 'medium' | 'large';
  domains: DomainName[];
  relatedRisks: string[];
  suggestedAssignee?: string;
  deadline?: Date;
}

/**
 * Morning sync report
 */
export interface MorningSyncReport {
  syncId: string;
  timestamp: Date;
  duration: number;
  config: MorningSyncConfig;
  /** Aggregated overnight results by domain */
  overnightResults: Map<DomainName, DomainOvernightResults>;
  /** Identified risks */
  risks: IdentifiedRisk[];
  /** Prioritized work items */
  workItems: PrioritizedWorkItem[];
  /** Summary statistics */
  summary: MorningSyncSummary;
}

export interface MorningSyncSummary {
  totalTestsRun: number;
  overallPassRate: number;
  coverageChange: number;
  criticalRisks: number;
  highPriorityItems: number;
  domainsWithIssues: DomainName[];
  healthyDomains: DomainName[];
  overallHealth: 'healthy' | 'warning' | 'critical';
}

// ============================================================================
// Protocol Events
// ============================================================================

export interface MorningSyncCompletedPayload {
  syncId: string;
  duration: number;
  risksIdentified: number;
  workItemsGenerated: number;
  criticalIssues: number;
  overallHealth: 'healthy' | 'warning' | 'critical';
}

export interface RiskIdentifiedPayload {
  riskId: string;
  severity: Severity;
  priority: Priority;
  domain: DomainName;
  title: string;
  recommendation: string;
}

export interface WorkPrioritizedPayload {
  syncId: string;
  workItems: Array<{
    id: string;
    priority: Priority;
    type: string;
    title: string;
  }>;
  totalItems: number;
}

export const MorningSyncEvents = {
  MorningSyncStarted: 'coordination.MorningSyncStarted',
  MorningSyncCompleted: 'coordination.MorningSyncCompleted',
  RiskIdentified: 'coordination.RiskIdentified',
  WorkPrioritized: 'coordination.WorkPrioritized',
  DomainResultsCollected: 'coordination.DomainResultsCollected',
} as const;

// ============================================================================
// Domain Data Collectors (Interfaces)
// ============================================================================

/**
 * Interface for collecting overnight data from domains
 */
export interface DomainDataCollector {
  collectTestExecutionResults(since: Date): Promise<Result<TestExecutionSummary | undefined, Error>>;
  collectCoverageResults(since: Date): Promise<Result<CoverageSummary | undefined, Error>>;
  collectQualityMetrics(since: Date): Promise<Result<QualityMetricsSummary | undefined, Error>>;
  collectDefectPredictions(since: Date): Promise<Result<DefectPredictionSummary | undefined, Error>>;
  collectSecurityFindings(since: Date): Promise<Result<SecurityFindingsSummary | undefined, Error>>;
}

// ============================================================================
// Result Type Helpers
// ============================================================================

function isSuccess<T, E>(result: Result<T, E>): result is { success: true; value: T } {
  return result.success;
}

function isFailure<T, E>(result: Result<T, E>): result is { success: false; error: E } {
  return !result.success;
}

// ============================================================================
// Morning Sync Protocol Implementation
// ============================================================================

const DEFAULT_CONFIG: MorningSyncConfig = {
  lookbackHours: 24,
  riskSeverityThreshold: 'medium',
  maxPriorityItems: 20,
  includedDomains: [...ALL_DOMAINS],
};

/**
 * Morning Sync Protocol
 *
 * Coordinates daily synchronization across all 12 QE domains.
 * Collects overnight results, identifies risks, and prioritizes work.
 */
export class MorningSyncProtocol {
  private config: MorningSyncConfig;
  private collectors: Map<DomainName, DomainDataCollector> = new Map();

  constructor(
    private readonly eventBus: EventBus,
    config?: Partial<MorningSyncConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register a data collector for a domain
   */
  registerCollector(domain: DomainName, collector: DomainDataCollector): void {
    this.collectors.set(domain, collector);
  }

  /**
   * Execute the morning sync workflow
   */
  async execute(): Promise<Result<MorningSyncReport, Error>> {
    const syncId = uuidv4();
    const startTime = Date.now();

    try {
      // Publish sync started event
      await this.publishEvent(MorningSyncEvents.MorningSyncStarted, {
        syncId,
        timestamp: new Date(),
        config: this.config,
      });

      // Step 1: Gather overnight results from all domains
      const overnightResultsResult = await this.gatherOvernightResults();
      if (isFailure(overnightResultsResult)) {
        return err(overnightResultsResult.error);
      }
      const overnightResults = overnightResultsResult.value;

      // Step 2: Identify risks based on results
      const risksResult = await this.identifyRisks(overnightResults);
      if (isFailure(risksResult)) {
        return err(risksResult.error);
      }
      const risks = risksResult.value;

      // Publish risk events for high-priority items
      for (const risk of risks.filter(r => r.severity === 'critical' || r.severity === 'high')) {
        await this.publishEvent<RiskIdentifiedPayload>(MorningSyncEvents.RiskIdentified, {
          riskId: risk.id,
          severity: risk.severity,
          priority: risk.priority,
          domain: risk.domain,
          title: risk.title,
          recommendation: risk.recommendation,
        });
      }

      // Step 3: Prioritize work based on risks
      const workItemsResult = await this.prioritizeWork(risks, overnightResults);
      if (isFailure(workItemsResult)) {
        return err(workItemsResult.error);
      }
      const workItems = workItemsResult.value;

      // Publish work prioritized event
      await this.publishEvent<WorkPrioritizedPayload>(MorningSyncEvents.WorkPrioritized, {
        syncId,
        workItems: workItems.map(w => ({
          id: w.id,
          priority: w.priority,
          type: w.type,
          title: w.title,
        })),
        totalItems: workItems.length,
      });

      // Step 4: Generate report
      const report = this.generateReport(
        syncId,
        startTime,
        overnightResults,
        risks,
        workItems
      );

      // Publish sync completed event
      await this.publishEvent<MorningSyncCompletedPayload>(MorningSyncEvents.MorningSyncCompleted, {
        syncId,
        duration: Date.now() - startTime,
        risksIdentified: risks.length,
        workItemsGenerated: workItems.length,
        criticalIssues: risks.filter(r => r.severity === 'critical').length,
        overallHealth: report.summary.overallHealth,
      });

      return ok(report);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Gather overnight results from all domains
   */
  async gatherOvernightResults(): Promise<Result<Map<DomainName, DomainOvernightResults>, Error>> {
    const results = new Map<DomainName, DomainOvernightResults>();
    const since = new Date(Date.now() - this.config.lookbackHours * 60 * 60 * 1000);

    for (const domain of this.config.includedDomains) {
      const domainResults: DomainOvernightResults = {
        domain,
        errors: [],
      };

      const collector = this.collectors.get(domain);
      if (!collector) {
        // No collector registered, create empty results
        results.set(domain, domainResults);
        continue;
      }

      // Collect test execution results
      if (domain === 'test-execution' || domain === 'test-generation') {
        const testResult = await collector.collectTestExecutionResults(since);
        if (isSuccess(testResult)) {
          domainResults.testResults = testResult.value;
        } else if (isFailure(testResult)) {
          domainResults.errors.push(`Test execution: ${testResult.error.message}`);
        }
      }

      // Collect coverage results
      if (domain === 'coverage-analysis') {
        const coverageResult = await collector.collectCoverageResults(since);
        if (isSuccess(coverageResult)) {
          domainResults.coverageResults = coverageResult.value;
        } else if (isFailure(coverageResult)) {
          domainResults.errors.push(`Coverage: ${coverageResult.error.message}`);
        }
      }

      // Collect quality metrics
      if (domain === 'quality-assessment') {
        const qualityResult = await collector.collectQualityMetrics(since);
        if (isSuccess(qualityResult)) {
          domainResults.qualityMetrics = qualityResult.value;
        } else if (isFailure(qualityResult)) {
          domainResults.errors.push(`Quality: ${qualityResult.error.message}`);
        }
      }

      // Collect defect predictions
      if (domain === 'defect-intelligence') {
        const defectResult = await collector.collectDefectPredictions(since);
        if (isSuccess(defectResult)) {
          domainResults.defectPredictions = defectResult.value;
        } else if (isFailure(defectResult)) {
          domainResults.errors.push(`Defect prediction: ${defectResult.error.message}`);
        }
      }

      // Collect security findings
      if (domain === 'security-compliance') {
        const securityResult = await collector.collectSecurityFindings(since);
        if (isSuccess(securityResult)) {
          domainResults.securityFindings = securityResult.value;
        } else if (isFailure(securityResult)) {
          domainResults.errors.push(`Security: ${securityResult.error.message}`);
        }
      }

      domainResults.lastActivity = new Date();
      results.set(domain, domainResults);

      // Publish domain results collected event
      await this.publishEvent(MorningSyncEvents.DomainResultsCollected, {
        domain,
        hasResults: domainResults.errors.length === 0,
        errorCount: domainResults.errors.length,
      });
    }

    return ok(results);
  }

  /**
   * Identify risks from overnight results
   */
  async identifyRisks(
    overnightResults: Map<DomainName, DomainOvernightResults>
  ): Promise<Result<IdentifiedRisk[], Error>> {
    const risks: IdentifiedRisk[] = [];

    const entries = Array.from(overnightResults.entries());
    for (const [domain, results] of entries) {
      // Check test execution risks
      if (results.testResults) {
        const testRisks = this.identifyTestRisks(domain, results.testResults);
        risks.push(...testRisks);
      }

      // Check coverage risks
      if (results.coverageResults) {
        const coverageRisks = this.identifyCoverageRisks(domain, results.coverageResults);
        risks.push(...coverageRisks);
      }

      // Check quality risks
      if (results.qualityMetrics) {
        const qualityRisks = this.identifyQualityRisks(domain, results.qualityMetrics);
        risks.push(...qualityRisks);
      }

      // Check defect prediction risks
      if (results.defectPredictions) {
        const defectRisks = this.identifyDefectRisks(domain, results.defectPredictions);
        risks.push(...defectRisks);
      }

      // Check security risks
      if (results.securityFindings) {
        const securityRisks = this.identifySecurityRisks(domain, results.securityFindings);
        risks.push(...securityRisks);
      }
    }

    // Sort by severity and priority
    risks.sort((a, b) => {
      const severityOrder: Record<Severity, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
        info: 4,
      };
      const priorityOrder: Record<Priority, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };

      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return ok(risks);
  }

  /**
   * Prioritize work based on identified risks
   */
  async prioritizeWork(
    risks: IdentifiedRisk[],
    overnightResults: Map<DomainName, DomainOvernightResults>
  ): Promise<Result<PrioritizedWorkItem[], Error>> {
    const workItems: PrioritizedWorkItem[] = [];

    // Generate work items from risks
    for (const risk of risks) {
      const workItem = this.createWorkItemFromRisk(risk);
      workItems.push(workItem);
    }

    // Add proactive work items based on overnight results
    const proactiveItems = this.generateProactiveWorkItems(overnightResults);
    workItems.push(...proactiveItems);

    // Deduplicate and merge related items
    const deduplicatedItems = this.deduplicateWorkItems(workItems);

    // Sort by priority
    deduplicatedItems.sort((a, b) => {
      const priorityOrder: Record<Priority, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // Limit to max configured items
    return ok(deduplicatedItems.slice(0, this.config.maxPriorityItems));
  }

  /**
   * Generate the morning sync summary report
   */
  generateReport(
    syncId: string,
    startTime: number,
    overnightResults: Map<DomainName, DomainOvernightResults>,
    risks: IdentifiedRisk[],
    workItems: PrioritizedWorkItem[]
  ): MorningSyncReport {
    const summary = this.calculateSummary(overnightResults, risks);

    return {
      syncId,
      timestamp: new Date(),
      duration: Date.now() - startTime,
      config: this.config,
      overnightResults,
      risks,
      workItems,
      summary,
    };
  }

  // ============================================================================
  // Private Risk Identification Methods
  // ============================================================================

  private identifyTestRisks(domain: DomainName, testResults: TestExecutionSummary): IdentifiedRisk[] {
    const risks: IdentifiedRisk[] = [];
    const passRate = testResults.totalRuns > 0
      ? testResults.passed / testResults.totalRuns
      : 1;

    // High failure rate
    if (passRate < 0.9) {
      risks.push({
        id: uuidv4(),
        severity: passRate < 0.7 ? 'critical' : 'high',
        priority: passRate < 0.7 ? 'p0' : 'p1',
        domain,
        title: 'High Test Failure Rate',
        description: `Test pass rate is ${(passRate * 100).toFixed(1)}%, below acceptable threshold`,
        source: 'test-execution',
        impact: 'Reduced confidence in code quality, potential release delays',
        recommendation: `Review and fix ${testResults.failed} failing tests immediately`,
        relatedItems: testResults.failedTestIds,
        detectedAt: new Date(),
      });
    }

    // Flaky tests detected
    if (testResults.flakyTests > 0) {
      risks.push({
        id: uuidv4(),
        severity: testResults.flakyTests > 10 ? 'high' : 'medium',
        priority: testResults.flakyTests > 10 ? 'p1' : 'p2',
        domain,
        title: 'Flaky Tests Detected',
        description: `${testResults.flakyTests} flaky tests identified`,
        source: 'test-execution',
        impact: 'Unreliable test results, wasted CI/CD resources',
        recommendation: 'Investigate and stabilize flaky tests',
        relatedItems: [],
        detectedAt: new Date(),
      });
    }

    return risks;
  }

  private identifyCoverageRisks(domain: DomainName, coverageResults: CoverageSummary): IdentifiedRisk[] {
    const risks: IdentifiedRisk[] = [];

    // Low coverage
    if (coverageResults.line < 70) {
      risks.push({
        id: uuidv4(),
        severity: coverageResults.line < 50 ? 'critical' : 'high',
        priority: coverageResults.line < 50 ? 'p0' : 'p1',
        domain,
        title: 'Low Code Coverage',
        description: `Line coverage is ${coverageResults.line}%, below minimum threshold`,
        source: 'coverage-analysis',
        impact: 'High risk of undetected bugs in production',
        recommendation: `Focus on covering ${coverageResults.gapsIdentified} identified gaps`,
        relatedItems: coverageResults.criticalGaps.map(g => g.file),
        detectedAt: new Date(),
      });
    }

    // Coverage declining
    if (coverageResults.trend === 'declining' && coverageResults.delta < -5) {
      risks.push({
        id: uuidv4(),
        severity: 'high',
        priority: 'p1',
        domain,
        title: 'Coverage Declining',
        description: `Coverage dropped by ${Math.abs(coverageResults.delta)}% in the last 24 hours`,
        source: 'coverage-analysis',
        impact: 'Quality regression, increasing technical debt',
        recommendation: 'Review recent changes and add missing tests',
        relatedItems: [],
        detectedAt: new Date(),
      });
    }

    // Critical gaps
    for (const gap of coverageResults.criticalGaps) {
      if (gap.riskScore > 0.8) {
        risks.push({
          id: uuidv4(),
          severity: 'high',
          priority: 'p1',
          domain,
          title: `Critical Coverage Gap: ${gap.file}`,
          description: `High-risk file with ${gap.lines.length} uncovered lines`,
          source: 'coverage-analysis',
          impact: 'High probability of production issues',
          recommendation: `Add tests for lines: ${gap.lines.slice(0, 5).join(', ')}${gap.lines.length > 5 ? '...' : ''}`,
          relatedItems: [gap.file],
          detectedAt: new Date(),
        });
      }
    }

    return risks;
  }

  private identifyQualityRisks(domain: DomainName, qualityMetrics: QualityMetricsSummary): IdentifiedRisk[] {
    const risks: IdentifiedRisk[] = [];

    // Failed quality gates
    if (qualityMetrics.gatesFailed > 0) {
      risks.push({
        id: uuidv4(),
        severity: 'critical',
        priority: 'p0',
        domain,
        title: 'Quality Gates Failing',
        description: `${qualityMetrics.gatesFailed} quality gates are currently failing`,
        source: 'quality-assessment',
        impact: 'Cannot proceed with deployment until resolved',
        recommendation: `Address failing gates: ${qualityMetrics.failedGates.join(', ')}`,
        relatedItems: qualityMetrics.failedGates,
        detectedAt: new Date(),
      });
    }

    // Low quality score
    if (qualityMetrics.overallScore < 60) {
      risks.push({
        id: uuidv4(),
        severity: qualityMetrics.overallScore < 40 ? 'critical' : 'high',
        priority: qualityMetrics.overallScore < 40 ? 'p0' : 'p1',
        domain,
        title: 'Low Quality Score',
        description: `Overall quality score is ${qualityMetrics.overallScore}/100`,
        source: 'quality-assessment',
        impact: 'High maintenance cost, elevated bug risk',
        recommendation: 'Focus on improving code quality metrics',
        relatedItems: [],
        detectedAt: new Date(),
      });
    }

    // Blocked deployments
    if (qualityMetrics.deploymentsBlocked > 0) {
      risks.push({
        id: uuidv4(),
        severity: 'high',
        priority: 'p1',
        domain,
        title: 'Deployments Blocked',
        description: `${qualityMetrics.deploymentsBlocked} deployments were blocked overnight`,
        source: 'quality-assessment',
        impact: 'Delivery delays, potential customer impact',
        recommendation: 'Review and address blocking issues',
        relatedItems: [],
        detectedAt: new Date(),
      });
    }

    return risks;
  }

  private identifyDefectRisks(domain: DomainName, defectPredictions: DefectPredictionSummary): IdentifiedRisk[] {
    const risks: IdentifiedRisk[] = [];

    // High-risk files identified
    if (defectPredictions.highRiskFiles > 0) {
      risks.push({
        id: uuidv4(),
        severity: defectPredictions.highRiskFiles > 5 ? 'high' : 'medium',
        priority: defectPredictions.highRiskFiles > 5 ? 'p1' : 'p2',
        domain,
        title: 'High-Risk Files Detected',
        description: `${defectPredictions.highRiskFiles} files have elevated defect probability`,
        source: 'defect-intelligence',
        impact: 'Increased likelihood of production bugs',
        recommendation: 'Prioritize review and testing of high-risk files',
        relatedItems: defectPredictions.topRiskFiles.map(f => f.file),
        detectedAt: new Date(),
      });
    }

    // Top risk files
    for (const riskFile of defectPredictions.topRiskFiles.filter(f => f.probability > 0.7)) {
      risks.push({
        id: uuidv4(),
        severity: 'high',
        priority: 'p1',
        domain,
        title: `High Defect Probability: ${riskFile.file}`,
        description: `${(riskFile.probability * 100).toFixed(0)}% probability of defects`,
        source: 'defect-intelligence',
        impact: 'Very likely to cause production issues',
        recommendation: 'Thorough code review and additional testing required',
        relatedItems: [riskFile.file],
        detectedAt: new Date(),
      });
    }

    return risks;
  }

  private identifySecurityRisks(domain: DomainName, securityFindings: SecurityFindingsSummary): IdentifiedRisk[] {
    const risks: IdentifiedRisk[] = [];

    // Critical vulnerabilities
    if (securityFindings.critical > 0) {
      risks.push({
        id: uuidv4(),
        severity: 'critical',
        priority: 'p0',
        domain,
        title: 'Critical Security Vulnerabilities',
        description: `${securityFindings.critical} critical vulnerabilities detected`,
        source: 'security-compliance',
        impact: 'Immediate security threat, potential data breach',
        recommendation: 'Fix critical vulnerabilities immediately',
        relatedItems: [],
        detectedAt: new Date(),
      });
    }

    // High vulnerabilities
    if (securityFindings.high > 0) {
      risks.push({
        id: uuidv4(),
        severity: 'high',
        priority: 'p1',
        domain,
        title: 'High Security Vulnerabilities',
        description: `${securityFindings.high} high-severity vulnerabilities detected`,
        source: 'security-compliance',
        impact: 'Significant security risk',
        recommendation: 'Address high-severity vulnerabilities within 24 hours',
        relatedItems: [],
        detectedAt: new Date(),
      });
    }

    // New vulnerabilities
    if (securityFindings.newVulnerabilities > 0) {
      risks.push({
        id: uuidv4(),
        severity: 'medium',
        priority: 'p2',
        domain,
        title: 'New Vulnerabilities Introduced',
        description: `${securityFindings.newVulnerabilities} new vulnerabilities introduced overnight`,
        source: 'security-compliance',
        impact: 'Security posture degradation',
        recommendation: 'Review recent changes for security issues',
        relatedItems: [],
        detectedAt: new Date(),
      });
    }

    // Low compliance score
    if (securityFindings.complianceScore < 80) {
      risks.push({
        id: uuidv4(),
        severity: securityFindings.complianceScore < 60 ? 'high' : 'medium',
        priority: securityFindings.complianceScore < 60 ? 'p1' : 'p2',
        domain,
        title: 'Low Compliance Score',
        description: `Compliance score is ${securityFindings.complianceScore}%`,
        source: 'security-compliance',
        impact: 'Regulatory risk, potential audit findings',
        recommendation: 'Address compliance violations',
        relatedItems: [],
        detectedAt: new Date(),
      });
    }

    return risks;
  }

  // ============================================================================
  // Private Work Item Methods
  // ============================================================================

  private createWorkItemFromRisk(risk: IdentifiedRisk): PrioritizedWorkItem {
    const typeMap: Record<string, PrioritizedWorkItem['type']> = {
      'test-execution': 'fix',
      'coverage-analysis': 'test',
      'quality-assessment': 'improve',
      'defect-intelligence': 'review',
      'security-compliance': 'fix',
    };

    return {
      id: uuidv4(),
      priority: risk.priority,
      type: typeMap[risk.source] || 'investigate',
      title: `[${risk.severity.toUpperCase()}] ${risk.title}`,
      description: `${risk.description}\n\nRecommendation: ${risk.recommendation}`,
      estimatedEffort: this.estimateEffort(risk),
      domains: [risk.domain],
      relatedRisks: [risk.id],
    };
  }

  private estimateEffort(risk: IdentifiedRisk): PrioritizedWorkItem['estimatedEffort'] {
    // Simple estimation based on severity and related items
    if (risk.severity === 'critical') return 'large';
    if (risk.severity === 'high') return risk.relatedItems.length > 3 ? 'large' : 'medium';
    if (risk.severity === 'medium') return risk.relatedItems.length > 5 ? 'medium' : 'small';
    return 'trivial';
  }

  private generateProactiveWorkItems(
    overnightResults: Map<DomainName, DomainOvernightResults>
  ): PrioritizedWorkItem[] {
    const items: PrioritizedWorkItem[] = [];

    // Check for domains with no activity
    const entries = Array.from(overnightResults.entries());
    for (const [domain, results] of entries) {
      if (!results.lastActivity) {
        items.push({
          id: uuidv4(),
          priority: 'p3',
          type: 'investigate',
          title: `No Activity: ${domain}`,
          description: `Domain ${domain} had no activity in the last ${this.config.lookbackHours} hours`,
          estimatedEffort: 'small',
          domains: [domain],
          relatedRisks: [],
        });
      }
    }

    // Add coverage improvement item if coverage is good but could be better
    const coverageResults = overnightResults.get('coverage-analysis')?.coverageResults;
    if (coverageResults && coverageResults.line >= 70 && coverageResults.line < 85) {
      items.push({
        id: uuidv4(),
        priority: 'p3',
        type: 'improve',
        title: 'Proactive Coverage Improvement',
        description: `Coverage is at ${coverageResults.line}%. Consider targeting 85%+ for better quality.`,
        estimatedEffort: 'medium',
        domains: ['coverage-analysis', 'test-generation'],
        relatedRisks: [],
      });
    }

    return items;
  }

  private deduplicateWorkItems(items: PrioritizedWorkItem[]): PrioritizedWorkItem[] {
    const seen = new Map<string, PrioritizedWorkItem>();

    for (const item of items) {
      // Create a key based on type and related items
      const key = `${item.type}-${item.title.substring(0, 50)}`;

      if (!seen.has(key)) {
        seen.set(key, item);
      } else {
        // Merge related risks
        const existing = seen.get(key)!;
        existing.relatedRisks.push(...item.relatedRisks);
        // Keep higher priority
        if (this.priorityValue(item.priority) < this.priorityValue(existing.priority)) {
          existing.priority = item.priority;
        }
      }
    }

    return Array.from(seen.values());
  }

  private priorityValue(priority: Priority): number {
    const map: Record<Priority, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };
    return map[priority];
  }

  // ============================================================================
  // Private Summary Methods
  // ============================================================================

  private calculateSummary(
    overnightResults: Map<DomainName, DomainOvernightResults>,
    risks: IdentifiedRisk[]
  ): MorningSyncSummary {
    let totalTestsRun = 0;
    let totalPassed = 0;
    let coverageChange = 0;
    const domainsWithIssues: DomainName[] = [];
    const healthyDomains: DomainName[] = [];

    const entries = Array.from(overnightResults.entries());
    for (const [domain, results] of entries) {
      if (results.testResults) {
        totalTestsRun += results.testResults.totalRuns;
        totalPassed += results.testResults.passed;
      }

      if (results.coverageResults) {
        coverageChange = results.coverageResults.delta;
      }

      if (results.errors.length > 0) {
        domainsWithIssues.push(domain);
      } else {
        healthyDomains.push(domain);
      }
    }

    const criticalRisks = risks.filter(r => r.severity === 'critical').length;
    const highPriorityItems = risks.filter(r => r.priority === 'p0' || r.priority === 'p1').length;

    // Determine overall health
    let overallHealth: MorningSyncSummary['overallHealth'];
    if (criticalRisks > 0) {
      overallHealth = 'critical';
    } else if (highPriorityItems > 5 || domainsWithIssues.length > 3) {
      overallHealth = 'warning';
    } else {
      overallHealth = 'healthy';
    }

    return {
      totalTestsRun,
      overallPassRate: totalTestsRun > 0 ? totalPassed / totalTestsRun : 1,
      coverageChange,
      criticalRisks,
      highPriorityItems,
      domainsWithIssues,
      healthyDomains,
      overallHealth,
    };
  }

  // ============================================================================
  // Event Publishing
  // ============================================================================

  private async publishEvent<T>(type: string, payload: T): Promise<void> {
    const event: DomainEvent<T> = {
      id: uuidv4(),
      type,
      timestamp: new Date(),
      source: 'test-execution', // Using a valid DomainName as coordination isn't a domain
      payload,
    };
    await this.eventBus.publish(event);
  }
}

// ============================================================================
// Default Data Collector (for when no collector is registered)
// ============================================================================

/**
 * Default collector that returns empty results
 * Used as fallback when domain-specific collectors aren't available
 */
export class DefaultDomainDataCollector implements DomainDataCollector {
  async collectTestExecutionResults(_since: Date): Promise<Result<TestExecutionSummary | undefined, Error>> {
    return ok(undefined);
  }

  async collectCoverageResults(_since: Date): Promise<Result<CoverageSummary | undefined, Error>> {
    return ok(undefined);
  }

  async collectQualityMetrics(_since: Date): Promise<Result<QualityMetricsSummary | undefined, Error>> {
    return ok(undefined);
  }

  async collectDefectPredictions(_since: Date): Promise<Result<DefectPredictionSummary | undefined, Error>> {
    return ok(undefined);
  }

  async collectSecurityFindings(_since: Date): Promise<Result<SecurityFindingsSummary | undefined, Error>> {
    return ok(undefined);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Morning Sync Protocol instance with default configuration
 */
export function createMorningSyncProtocol(
  eventBus: EventBus,
  config?: Partial<MorningSyncConfig>
): MorningSyncProtocol {
  return new MorningSyncProtocol(eventBus, config);
}
