/**
 * Agentic QE v3 - Compliance Checker Worker
 * ADR-014: Background Workers for QE Monitoring
 *
 * Checks ADR and DDD compliance including:
 * - Architecture Decision Record compliance
 * - Domain-Driven Design pattern adherence
 * - Naming convention enforcement
 * - Structural compliance verification
 */

import { BaseWorker } from '../base-worker';
import {
  WorkerConfig,
  WorkerContext,
  WorkerResult,
  WorkerFinding,
  WorkerRecommendation,
} from '../interfaces';
import { DomainName, ALL_DOMAINS } from '../../shared/types';
import { QualityAssessmentExtendedAPI } from '../../domains/quality-assessment/plugin';

const CONFIG: WorkerConfig = {
  id: 'compliance-checker',
  name: 'ADR/DDD Compliance Checker',
  description: 'Verifies compliance with Architecture Decision Records and DDD patterns',
  intervalMs: 30 * 60 * 1000, // 30 minutes
  priority: 'normal',
  targetDomains: ['quality-assessment'],
  enabled: true,
  timeoutMs: 240000,
  retryCount: 2,
  retryDelayMs: 30000,
};

interface ADRCompliance {
  adrId: string;
  title: string;
  status: 'compliant' | 'partial' | 'non-compliant';
  score: number;
  violations: string[];
  lastChecked: Date;
}

interface DDDCompliance {
  domain: DomainName;
  hasCoordinator: boolean;
  hasPlugin: boolean;
  hasInterfaces: boolean;
  hasServices: boolean;
  hasEntities: boolean;
  hasEvents: boolean;
  hasRepositories: boolean;
  namingCompliant: boolean;
  score: number;
  violations: string[];
}

interface StructuralCompliance {
  category: string;
  rule: string;
  compliant: boolean;
  details: string;
}

export class ComplianceCheckerWorker extends BaseWorker {
  constructor() {
    super(CONFIG);
  }

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    const startTime = Date.now();
    context.logger.info('Starting compliance checking');

    const findings: WorkerFinding[] = [];
    const recommendations: WorkerRecommendation[] = [];

    // Check ADR compliance
    const adrResults = await this.checkADRCompliance(context);

    // Check DDD compliance
    const dddResults = await this.checkDDDCompliance(context);

    // Check structural compliance
    const structuralResults = await this.checkStructuralCompliance(context);

    // Analyze results
    this.analyzeADRCompliance(adrResults, findings, recommendations);
    this.analyzeDDDCompliance(dddResults, findings, recommendations);
    this.analyzeStructuralCompliance(structuralResults, findings, recommendations);

    // Store results
    await context.memory.set('compliance:adr', adrResults);
    await context.memory.set('compliance:ddd', dddResults);
    await context.memory.set('compliance:structural', structuralResults);
    await context.memory.set('compliance:lastCheck', new Date().toISOString());

    const healthScore = this.calculateHealthScore(adrResults, dddResults, structuralResults);

    context.logger.info('Compliance checking complete', {
      healthScore,
      adrChecks: adrResults.length,
      domainChecks: dddResults.length,
    });

    return this.createResult(
      Date.now() - startTime,
      {
        itemsAnalyzed: adrResults.length + dddResults.length + structuralResults.length,
        issuesFound: findings.length,
        healthScore,
        trend: 'stable',
        domainMetrics: {
          adrCompliance: `${this.calculateAvgScore(adrResults)}%`,
          dddCompliance: `${this.calculateDDDAvgScore(dddResults)}%`,
          structuralCompliance: `${this.calculateStructuralScore(structuralResults)}%`,
          totalViolations: adrResults.reduce((sum, a) => sum + a.violations.length, 0) +
            dddResults.reduce((sum, d) => sum + d.violations.length, 0),
        },
      },
      findings,
      recommendations
    );
  }

  private async checkADRCompliance(context: WorkerContext): Promise<ADRCompliance[]> {
    // Try to get ADR compliance from the quality-assessment domain service
    const qaAPI = context.domains.getDomainAPI<QualityAssessmentExtendedAPI>('quality-assessment');

    if (!qaAPI) {
      throw new Error(
        'Quality-assessment domain not available - cannot check ADR compliance. ' +
        'Ensure the quality-assessment domain is properly initialized before running this worker.'
      );
    }

    // Query memory for stored ADR compliance data
    const storedCompliance = await context.memory.search('compliance:adr:*');

    if (storedCompliance.length === 0) {
      throw new Error(
        'No ADR compliance data found in memory - cannot check ADR compliance. ' +
        'Ensure ADR compliance data is stored with keys matching "compliance:adr:*" before running this worker.'
      );
    }

    const results: ADRCompliance[] = [];
    const failedKeys: string[] = [];

    for (const key of storedCompliance) {
      try {
        const data = await context.memory.get<ADRCompliance>(key);
        if (data) {
          results.push(data);
        }
      } catch (error) {
        failedKeys.push(key);
      }
    }

    if (results.length === 0) {
      throw new Error(
        `Found ${storedCompliance.length} ADR compliance keys but failed to retrieve any data. ` +
        `Failed keys: ${failedKeys.join(', ')}. Check memory service connectivity.`
      );
    }

    return results;
  }

  private async checkDDDCompliance(context: WorkerContext): Promise<DDDCompliance[]> {
    const results: DDDCompliance[] = [];

    for (const domain of ALL_DOMAINS) {
      try {
        const compliance = await this.checkDomainCompliance(context, domain);
        results.push(compliance);
      } catch (error) {
        context.logger.warn(`Failed to check DDD compliance for ${domain}`, { error });
      }
    }

    return results;
  }

  private async checkDomainCompliance(context: WorkerContext, domain: DomainName): Promise<DDDCompliance> {
    // Try to get domain health and check if domain is loaded
    const domainHealth = context.domains.getDomainHealth(domain);
    const domainAPI = context.domains.getDomainAPI(domain);

    // Determine which components are available based on domain health and API availability
    const hasCoordinator = domainHealth.status !== 'unhealthy';
    const hasPlugin = domainAPI !== undefined;
    const hasInterfaces = hasPlugin;
    const hasServices = hasPlugin;

    // Query memory for stored DDD compliance data for this domain
    const storedData = await context.memory.get<Partial<DDDCompliance>>(`compliance:ddd:${domain}`);

    // Use stored data if available, otherwise use defaults
    const hasEntities = storedData?.hasEntities ?? false;
    const hasEvents = storedData?.hasEvents ?? false;
    const hasRepositories = storedData?.hasRepositories ?? false;
    const namingCompliant = storedData?.namingCompliant ?? hasPlugin;

    const violations: string[] = [];
    if (!hasEntities) violations.push('Missing domain entities');
    if (!hasEvents) violations.push('Missing domain events');
    if (!hasRepositories) violations.push('Missing repositories');
    if (!hasCoordinator) violations.push('Domain coordinator not available');
    if (!hasPlugin) violations.push('Domain plugin not loaded');

    // Calculate score based on components present
    const components = [
      hasCoordinator,
      hasPlugin,
      hasInterfaces,
      hasServices,
      hasEntities,
      hasEvents,
      hasRepositories,
      namingCompliant,
    ];
    const score = Math.round((components.filter(Boolean).length / components.length) * 100);

    return {
      domain,
      hasCoordinator,
      hasPlugin,
      hasInterfaces,
      hasServices,
      hasEntities,
      hasEvents,
      hasRepositories,
      namingCompliant,
      score,
      violations,
    };
  }

  private async checkStructuralCompliance(context: WorkerContext): Promise<StructuralCompliance[]> {
    // Try to get stored structural compliance data from memory
    const storedResults = await context.memory.search('compliance:structural:*');

    if (storedResults.length === 0) {
      throw new Error(
        'No structural compliance data found in memory - cannot check structural compliance. ' +
        'Ensure structural compliance data is stored with keys matching "compliance:structural:*" before running this worker.'
      );
    }

    const results: StructuralCompliance[] = [];
    const failedKeys: string[] = [];

    for (const key of storedResults) {
      try {
        const data = await context.memory.get<StructuralCompliance>(key);
        if (data) {
          results.push(data);
        }
      } catch (error) {
        failedKeys.push(key);
        context.logger.warn(`Failed to retrieve structural compliance data: ${key}`, { error });
      }
    }

    if (results.length === 0) {
      throw new Error(
        `Found ${storedResults.length} structural compliance keys but failed to retrieve any data. ` +
        `Failed keys: ${failedKeys.join(', ')}. Check memory service connectivity.`
      );
    }

    return results;
  }

  private analyzeADRCompliance(
    results: ADRCompliance[],
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    const nonCompliant = results.filter(r => r.status === 'non-compliant');
    const partial = results.filter(r => r.status === 'partial');

    for (const adr of nonCompliant) {
      findings.push({
        type: 'adr-non-compliance',
        severity: 'high',
        domain: 'quality-assessment',
        title: `ADR Non-Compliance: ${adr.adrId}`,
        description: `${adr.title} is not compliant (score: ${adr.score}%)`,
        context: {
          adrId: adr.adrId,
          violations: adr.violations,
        },
      });
    }

    for (const adr of partial) {
      findings.push({
        type: 'adr-partial-compliance',
        severity: 'medium',
        domain: 'quality-assessment',
        title: `ADR Partial Compliance: ${adr.adrId}`,
        description: `${adr.title} is partially compliant (score: ${adr.score}%)`,
        context: {
          adrId: adr.adrId,
          violations: adr.violations,
        },
      });
    }

    if (nonCompliant.length > 0) {
      recommendations.push({
        priority: 'p1',
        domain: 'quality-assessment',
        action: 'Address ADR Non-Compliance',
        description: `${nonCompliant.length} ADRs are not being followed. Review and implement required patterns.`,
        estimatedImpact: 'high',
        effort: 'high',
        autoFixable: false,
      });
    }
  }

  private analyzeDDDCompliance(
    results: DDDCompliance[],
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    const lowCompliance = results.filter(r => r.score < 70);
    const missingEntities = results.filter(r => !r.hasEntities);
    const missingEvents = results.filter(r => !r.hasEvents);

    if (lowCompliance.length > 0) {
      findings.push({
        type: 'ddd-low-compliance',
        severity: 'medium',
        domain: 'quality-assessment',
        title: `${lowCompliance.length} Domains Have Low DDD Compliance`,
        description: 'Some domains are missing required DDD components',
        context: {
          domains: lowCompliance.map(d => ({ domain: d.domain, score: d.score })),
        },
      });
    }

    if (missingEntities.length > 0) {
      findings.push({
        type: 'ddd-missing-entities',
        severity: 'low',
        domain: 'quality-assessment',
        title: 'Domains Missing Entity Definitions',
        description: `${missingEntities.length} domains lack proper entity definitions`,
        context: {
          domains: missingEntities.map(d => d.domain),
        },
      });

      recommendations.push({
        priority: 'p3',
        domain: 'quality-assessment',
        action: 'Add Domain Entities',
        description: 'Define rich domain entities for domains that currently lack them.',
        estimatedImpact: 'medium',
        effort: 'medium',
        autoFixable: false,
      });
    }

    if (missingEvents.length > 0) {
      recommendations.push({
        priority: 'p3',
        domain: 'quality-assessment',
        action: 'Implement Domain Events',
        description: `${missingEvents.length} domains are missing domain event definitions.`,
        estimatedImpact: 'medium',
        effort: 'medium',
        autoFixable: false,
      });
    }
  }

  private analyzeStructuralCompliance(
    results: StructuralCompliance[],
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    const violations = results.filter(r => !r.compliant);

    for (const violation of violations) {
      findings.push({
        type: 'structural-violation',
        severity: 'medium',
        domain: 'quality-assessment',
        title: `Structural Violation: ${violation.category}`,
        description: `Rule "${violation.rule}" is not being followed: ${violation.details}`,
        context: {
          category: violation.category,
          rule: violation.rule,
        },
      });
    }

    if (violations.length > 0) {
      recommendations.push({
        priority: 'p2',
        domain: 'quality-assessment',
        action: 'Fix Structural Violations',
        description: `${violations.length} structural rules are being violated. Review architecture guidelines.`,
        estimatedImpact: 'medium',
        effort: 'medium',
        autoFixable: false,
      });
    }
  }

  private calculateAvgScore(results: ADRCompliance[]): number {
    if (results.length === 0) return 100;
    return Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length);
  }

  private calculateDDDAvgScore(results: DDDCompliance[]): number {
    if (results.length === 0) return 100;
    return Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length);
  }

  private calculateStructuralScore(results: StructuralCompliance[]): number {
    if (results.length === 0) return 100;
    const compliant = results.filter(r => r.compliant).length;
    return Math.round((compliant / results.length) * 100);
  }

  private calculateHealthScore(
    adrResults: ADRCompliance[],
    dddResults: DDDCompliance[],
    structuralResults: StructuralCompliance[]
  ): number {
    const adrScore = this.calculateAvgScore(adrResults) * 0.4;
    const dddScore = this.calculateDDDAvgScore(dddResults) * 0.4;
    const structuralScore = this.calculateStructuralScore(structuralResults) * 0.2;

    return Math.round(adrScore + dddScore + structuralScore);
  }
}
