/**
 * QXPartnerAgent - Quality Experience (QX) Analysis Agent
 * 
 * QX = Marriage between QA (Quality Advocacy) and UX (User Experience)
 * Goal: Co-create Quality Experience for everyone associated with the product
 * 
 * Based on: https://talesoftesting.com/quality-experienceqx-co-creating-quality-experience-for-everyone-associated-with-the-product/
 * 
 * Key Capabilities:
 * - Problem understanding and analysis (Rule of Three)
 * - User needs vs Business needs analysis
 * - Oracle problem detection and resolution
 * - Comprehensive impact analysis (visible & invisible)
 * - UX testing heuristics application
 * - Integration with testability scoring
 * - Contextual recommendations generation
 */

import { BaseAgent, BaseAgentConfig } from './BaseAgent';
import { QETask, AgentCapability, QEAgentType, AgentContext, MemoryStore } from '../types';
import { FlexibleTaskResult } from '../types/hook.types';
import { EventEmitter } from 'events';
import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  QXAnalysis,
  QXPartnerConfig,
  QXTaskType,
  QXTaskParams,
  QXHeuristic,
  QXHeuristicResult,
  QXRecommendation,
  OracleProblem,
  ProblemAnalysis,
  UserNeedsAnalysis,
  BusinessNeedsAnalysis,
  ImpactAnalysis,
  QXContext,
  TestabilityIntegration
} from '../types/qx';

const execAsync = promisify(exec);

// Interfaces for extractTaskMetrics callback typing
interface StakeholderFeedback {
  stakeholder: string;
  satisfaction: number;
  feedback?: string;
}

interface ImmutableRequirement {
  id: string;
  description: string;
  met: boolean;
  evidence?: string;
}

export class QXPartnerAgent extends BaseAgent {
  private readonly config: QXPartnerConfig;
  private heuristicsEngine?: QXHeuristicsEngine;
  private oracleDetector?: OracleDetector;
  private impactAnalyzer?: ImpactAnalyzer;
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(config: QXPartnerConfig & { context: AgentContext; memoryStore: MemoryStore; eventBus: EventEmitter }) {
    const baseConfig: BaseAgentConfig = {
      type: QEAgentType.QX_PARTNER,
      capabilities: QXPartnerAgent.getDefaultCapabilities(),
      context: config.context,
      memoryStore: config.memoryStore,
      eventBus: config.eventBus,
      enableLearning: true // Enable learning for adaptive QX analysis
    };
    
    super(baseConfig);
    
    this.config = {
      analysisMode: config.analysisMode || 'full',
      heuristics: config.heuristics || {
        enabledHeuristics: Object.values(QXHeuristic),
        minConfidence: 0.7,
        enableCompetitiveAnalysis: false
      },
      integrateTestability: config.integrateTestability ?? true,
      testabilityScoringPath: config.testabilityScoringPath || '.claude/skills/testability-scoring',
      detectOracleProblems: config.detectOracleProblems ?? true,
      minOracleSeverity: config.minOracleSeverity || 'medium',
      collaboration: config.collaboration || {
        coordinateWithUX: true,
        coordinateWithQA: true,
        shareWithQualityAnalyzer: true
      },
      outputFormat: config.outputFormat || 'json',
      thresholds: config.thresholds || {
        minQXScore: 70,
        minProblemClarity: 60,
        minUserNeedsAlignment: 70,
        minBusinessAlignment: 70
      }
    };
  }

  /**
   * Get default capabilities for QX Partner Agent
   */
  private static getDefaultCapabilities(): AgentCapability[] {
    return [
      {
        name: 'qx-analysis',
        version: '1.0.0',
        description: 'Comprehensive QX (Quality Experience) analysis combining QA and UX perspectives'
      },
      {
        name: 'oracle-problem-detection',
        version: '1.0.0',
        description: 'Detect and resolve oracle problems when quality criteria are unclear'
      },
      {
        name: 'ux-heuristics',
        version: '1.0.0',
        description: 'Apply UX testing heuristics for comprehensive analysis'
      },
      {
        name: 'impact-analysis',
        version: '1.0.0',
        description: 'Analyze visible and invisible impacts of design changes'
      },
      {
        name: 'balance-finder',
        version: '1.0.0',
        description: 'Find balance between user experience and business needs'
      },
      {
        name: 'testability-integration',
        version: '1.0.0',
        description: 'Integrate with testability scoring for combined insights'
      }
    ];
  }

  /**
   * Initialize QX analysis components
   */
  protected async initializeComponents(): Promise<void> {
    try {
      this.logger.info(`QXPartnerAgent ${this.agentId.id} initializing components`);

      // Initialize heuristics engine
      this.heuristicsEngine = new QXHeuristicsEngine(this.config.heuristics);
      this.logger.info('QX Heuristics Engine initialized');

      // Initialize oracle problem detector
      if (this.config.detectOracleProblems) {
        this.oracleDetector = new OracleDetector(this.config.minOracleSeverity || 'medium');
        this.logger.info('Oracle Problem Detector initialized');
      }

      // Initialize impact analyzer
      this.impactAnalyzer = new ImpactAnalyzer();
      this.logger.info('Impact Analyzer initialized');

      // Validate testability scoring integration
      if (this.config.integrateTestability) {
        await this.validateTestabilityScoringAvailability();
      }

      // Setup collaboration channels
      if (this.config.collaboration) {
        await this.setupCollaborationChannels();
      }

      this.logger.info(`QXPartnerAgent ${this.agentId.id} components initialized successfully`);
    } catch (error) {
      this.logger.error(`Failed to initialize QXPartnerAgent components:`, error);
      throw new Error(`Component initialization failed: ${(error as Error).message}`);
    }
  }

  /**
   * Load QX knowledge and historical patterns
   */
  protected async loadKnowledge(): Promise<void> {
    try {
      this.logger.info('Loading QX knowledge base');

      // Load historical QX analyses
      const historicalQX = await this.retrieveSharedMemory(QEAgentType.QX_PARTNER, 'historical-qx-analyses');
      if (historicalQX) {
        this.logger.info('Loaded historical QX analyses');
        await this.storeMemory('qx-history', historicalQX);
      }

      // Load oracle problem patterns
      const oraclePatterns = await this.retrieveMemory('oracle-patterns');
      if (oraclePatterns) {
        this.logger.info('Loaded oracle problem patterns');
      } else {
        await this.initializeDefaultOraclePatterns();
      }

      // Load UX heuristics knowledge
      const heuristicsKnowledge = await this.retrieveMemory('heuristics-knowledge');
      if (heuristicsKnowledge) {
        this.logger.info('Loaded UX heuristics knowledge');
      }

      // Load collaboration insights from other agents
      if (this.config.collaboration?.coordinateWithUX) {
        const uxInsights = await this.retrieveSharedMemory(QEAgentType.VISUAL_TESTER, 'ux-insights');
        if (uxInsights) {
          this.logger.info('Loaded UX agent insights');
        }
      }

      if (this.config.collaboration?.coordinateWithQA) {
        const qaInsights = await this.retrieveSharedMemory(QEAgentType.QUALITY_ANALYZER, 'qa-insights');
        if (qaInsights) {
          this.logger.info('Loaded QA agent insights');
        }
      }

      this.logger.info('QX knowledge loaded successfully');
    } catch (error) {
      this.logger.warn(`Failed to load some QX knowledge:`, error);
      // Continue with default knowledge
    }
  }

  /**
   * Clean up QX analysis resources
   */
  protected async cleanup(): Promise<void> {
    try {
      this.logger.info(`QXPartnerAgent ${this.agentId.id} cleaning up resources`);

      // Close browser if open
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      // Save current QX analysis state
      await this.saveQXState();

      // Store learned patterns
      await this.saveOraclePatterns();
      await this.saveHeuristicsInsights();

      // Share insights with collaborating agents
      if (this.config.collaboration) {
        await this.shareCollaborationInsights();
      }

      this.logger.info(`QXPartnerAgent ${this.agentId.id} cleanup completed`);
    } catch (error) {
      this.logger.error(`Error during QXPartnerAgent cleanup:`, error);
      throw new Error(`Cleanup failed: ${(error as Error).message}`);
    }
  }

  /**
   * Perform QX analysis task
   */
  protected async performTask(task: QETask): Promise<unknown> {
    const params = task.payload as QXTaskParams;
    const taskType = params.type;

    this.logger.info(`Performing QX task: ${taskType} for target: ${params.target}`);

    switch (taskType) {
      case QXTaskType.FULL_ANALYSIS:
        return await this.performFullQXAnalysis(params);
      
      case QXTaskType.ORACLE_DETECTION:
        return await this.detectOracleProblems(params);
      
      case QXTaskType.BALANCE_ANALYSIS:
        return await this.analyzeUserBusinessBalance(params);
      
      case QXTaskType.IMPACT_ANALYSIS:
        return await this.performImpactAnalysis(params);
      
      case QXTaskType.APPLY_HEURISTIC:
        return await this.applySpecificHeuristic(params);
      
      case QXTaskType.GENERATE_RECOMMENDATIONS:
        return await this.generateQXRecommendations(params);
      
      case QXTaskType.INTEGRATE_TESTABILITY:
        return await this.integrateTestabilityScoring(params);
      
      default:
        throw new Error(`Unsupported QX task type: ${taskType}`);
    }
  }

  // ============================================================================
  // QX Analysis Methods
  // ============================================================================

  /**
   * Perform comprehensive QX analysis
   */
  private async performFullQXAnalysis(params: QXTaskParams): Promise<QXAnalysis> {
    const startTime = Date.now();
    const target = params.target;

    this.logger.info(`Starting full QX analysis for: ${target}`);

    // 1. Collect context
    const context = await this.collectQXContext(target, params.params?.context);

    // 2. Analyze problem
    const problemAnalysis = await this.analyzeProblem(context);

    // 3. Analyze user needs
    const userNeeds = await this.analyzeUserNeeds(context, problemAnalysis);

    // 4. Analyze business needs
    const businessNeeds = await this.analyzeBusinessNeeds(context, problemAnalysis);

    // 5. Analyze creativity - drawing inspiration from diverse domains
    const creativityAnalysis = await this.analyzeCreativity(context, problemAnalysis);

    // 6. Analyze design - exactness, intuitive, and counter-intuitive design
    const designAnalysis = await this.analyzeDesign(context, problemAnalysis);

    // 7. Detect oracle problems
    const oracleProblems = this.config.detectOracleProblems
      ? await this.detectOracleProblemsFromContext(context, userNeeds, businessNeeds)
      : [];

    // 8. Perform impact analysis
    const impactAnalysis = await this.analyzeImpact(context, problemAnalysis);

    // 9. Apply heuristics
    const heuristics = await this.applyAllHeuristics(context, problemAnalysis, userNeeds, businessNeeds, creativityAnalysis, designAnalysis);

    // 8. Integrate testability (if enabled)
    const testabilityIntegration = this.config.integrateTestability
      ? await this.integrateTestabilityScoring(params)
      : undefined;

    // 9. Generate recommendations
    const recommendations = await this.generateRecommendations(
      problemAnalysis,
      userNeeds,
      businessNeeds,
      oracleProblems,
      impactAnalysis,
      heuristics,
      testabilityIntegration
    );

    // 10. Calculate overall score
    const overallScore = this.calculateOverallQXScore(
      problemAnalysis,
      userNeeds,
      businessNeeds,
      creativityAnalysis,
      designAnalysis,
      impactAnalysis,
      heuristics
    );

    const grade = this.scoreToGrade(overallScore);

    const analysis: QXAnalysis = {
      overallScore,
      grade,
      timestamp: new Date(),
      target,
      problemAnalysis,
      userNeeds,
      businessNeeds,
      creativityAnalysis,
      designAnalysis,
      oracleProblems,
      impactAnalysis,
      heuristics,
      recommendations,
      testabilityIntegration,
      context
    };

    // Store analysis in memory
    await this.storeMemory(`qx-analysis:${target}`, analysis);

    const duration = Date.now() - startTime;
    this.logger.info(`QX analysis completed in ${duration}ms. Score: ${overallScore}/100 (${grade})`);

    // Generate HTML report and auto-launch
    try {
      const reportPath = await this.generateHTMLReport(analysis);
      this.logger.info(`HTML report generated: ${reportPath}`);

      // Auto-launch browser
      await this.launchReportInBrowser(reportPath);
      this.logger.info(`Report launched in browser`);
    } catch (error) {
      this.logger.warn(`Failed to generate/launch HTML report:`, error);
      // Don't fail the analysis if report generation fails
    }

    return analysis;
  }

  /**
   * Generate HTML report from QX analysis
   */
  private async generateHTMLReport(analysis: QXAnalysis): Promise<string> {
    const sanitizedTarget = analysis.target.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `qx-report-${sanitizedTarget}-${timestamp}.html`;
    const reportsDir = path.join(process.cwd(), 'docs', 'qx-reports');

    // Ensure reports directory exists
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const reportPath = path.join(reportsDir, filename);
    const html = this.generateHTMLContent(analysis);

    fs.writeFileSync(reportPath, html, 'utf8');

    return reportPath;
  }

  /**
   * Generate HTML content for the report
   */
  private generateHTMLContent(analysis: QXAnalysis): string {
    const date = analysis.timestamp.toLocaleDateString();
    const time = analysis.timestamp.toLocaleTimeString();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QX Analysis: ${this.escapeHtml(analysis.target)}</title>
    ${this.getReportStyles()}
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🍵 Quality Experience (QX) Analysis</h1>
            <div class="subtitle">${this.escapeHtml(analysis.target)}</div>
            <div class="meta">
                <strong>URL:</strong> ${this.escapeHtml(analysis.target)}<br>
                <strong>Analysis Date:</strong> ${date} at ${time}<br>
                <strong>Framework:</strong> QX Partner (Quality + UX Advocacy)
            </div>

            <!-- How can this report help you? -->
            <div class="info-section collapsed">
                <div class="info-header" onclick="this.parentElement.classList.toggle('collapsed')">
                    <h3>How can this report help you?</h3>
                    <span class="collapse-icon" style="transition: transform 0.2s;">&#x25BC;</span>
                </div>
                <div class="info-content">
                    <blockquote>
                        "Quality is value to some person." <span style="opacity: 0.7;">— Jerry Weinberg</span>
                    </blockquote>
                    <p>This report is generated by the <strong>QX Partner Agent</strong>, one of the core agents based on the <strong>QCSD (Quality Conscious Software Delivery)</strong> framework. The QX (Quality Experience) concept was introduced to bridge the gap between <em>Quality Advocacy (QA)</em> and <em>User Experience (UX)</em> — recognizing that quality is not just about finding bugs, but about co-creating value for all stakeholders.</p>
                    <p>QX analysis helps answer the fundamental oracle problem: <em>"How do we know if this is working correctly when different stakeholders have different needs?"</em> By analyzing problems through multiple lenses — user needs, business needs, creativity, and design quality — QX surfaces hidden quality risks and opportunities that traditional testing approaches might miss.</p>
                    <p>This analysis uses <strong>AI semantic understanding</strong> to evaluate your product against QX heuristics. It identifies potential failure modes, assesses how well user and business needs are aligned, evaluates creative testing approaches, and provides actionable recommendations to improve quality experience for everyone associated with the product.</p>
                    <p>When multiple stakeholders matter simultaneously (users, business, developers, support teams), QX helps find balance and solve oracle problems — enabling teams to make informed trade-off decisions rather than discovering conflicts during production incidents.</p>
                </div>
            </div>

            <!-- When to perform a QX session? -->
            <div class="info-section collapsed">
                <div class="info-header" onclick="this.parentElement.classList.toggle('collapsed')">
                    <h3>When to perform a QX session?</h3>
                    <span class="collapse-icon" style="transition: transform 0.2s;">&#x25BC;</span>
                </div>
                <div class="info-content">
                    <p><strong>During Feature Definition (QCSD Recommended):</strong> The QCSD framework recommends performing QX analysis as soon as you have a clear problem statement and initial requirements. Ideally, run this before detailed design begins — it helps surface hidden stakeholder conflicts and quality dimensions before they become expensive to address.</p>
                    <p><strong>Before Major Product Decisions:</strong> When making trade-off decisions that affect user experience vs. business needs (e.g., adding friction for security, removing features for simplicity), QX analysis provides structured thinking to evaluate impact across all stakeholders.</p>
                    <p><strong>Post-Release Quality Reviews:</strong> After shipping, use QX analysis to understand how quality was experienced by different stakeholders. Compare intended QX scores against actual user feedback to calibrate future decisions.</p>
                    <p><strong>When Facing Oracle Problems:</strong> If your team struggles to define "what good looks like" or faces conflicting quality criteria from different stakeholders, QX analysis provides a framework to make these implicit expectations explicit.</p>
                    <p><strong>Continuous Improvement:</strong> Run QX analysis periodically on existing products to identify quality debt and opportunities for improvement. As user needs and business context evolve, quality priorities may shift.</p>
                </div>
            </div>

            <!-- How to use this report? -->
            <div class="info-section collapsed">
                <div class="info-header" onclick="this.parentElement.classList.toggle('collapsed')">
                    <h3>How to use this report?</h3>
                    <span class="collapse-icon" style="transition: transform 0.2s;">&#x25BC;</span>
                </div>
                <div class="info-content">
                    <p style="margin-bottom: 12px;">In this report you will find:</p>
                    <div style="margin-left: 5px; line-height: 1.8;">
                        <div class="checklist-item">&#x2610; <strong>Executive Summary</strong> - Overall QX assessment and key findings at a glance.</div>
                        <div class="checklist-item">&#x2610; <strong>Overall QX Score</strong> - Composite score across Problem Clarity, User Needs, Business Alignment, and Impact.</div>
                        <div class="checklist-item">&#x2610; <strong>Problem Analysis</strong> - Clarity assessment, complexity rating, and potential failure modes.</div>
                        <div class="checklist-item">&#x2610; <strong>User Needs Analysis</strong> - How well user needs are identified, prioritized, and addressed.</div>
                        <div class="checklist-item">&#x2610; <strong>Business Needs Analysis</strong> - Business goals, KPIs affected, and UX trade-offs.</div>
                        <div class="checklist-item">&#x2610; <strong>Creativity &amp; Innovation</strong> - Creative testing approaches and diverse perspectives applied.</div>
                        <div class="checklist-item">&#x2610; <strong>Design Quality Analysis</strong> - Exactness, intuitiveness, and quality characteristics.</div>
                        <div class="checklist-item">&#x2610; <strong>Actionable Recommendations</strong> - Prioritized actions to improve QX scores.</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="content">
            <!-- Executive Summary -->
            <div class="section">
                <h2>📊 Executive Summary</h2>
                <p>
                    This comprehensive QX analysis evaluates <strong>${this.escapeHtml(analysis.context.title || analysis.target)}</strong>
                    through the lens of Quality Experience, examining how quality is co-created for all stakeholders.
                </p>
            </div>

            <!-- Overall QX Score -->
            <div class="section">
                <h2>🎯 Overall QX Score</h2>
                <div class="score-card">
                    <div class="score-item">
                        <h4>Problem Clarity</h4>
                        <div class="score-value">${analysis.problemAnalysis.clarityScore}</div>
                        <div class="score-label">/ 100</div>
                    </div>
                    <div class="score-item">
                        <h4>User Needs Alignment</h4>
                        <div class="score-value">${analysis.userNeeds.alignmentScore}</div>
                        <div class="score-label">/ 100</div>
                    </div>
                    <div class="score-item">
                        <h4>Business Alignment</h4>
                        <div class="score-value">${analysis.businessNeeds.alignmentScore}</div>
                        <div class="score-label">/ 100</div>
                    </div>
                    <div class="score-item">
                        <h4>Impact Assessment</h4>
                        <div class="score-value">${100 - analysis.impactAnalysis.overallImpactScore}</div>
                        <div class="score-label">/ 100</div>
                    </div>
                </div>
                <div style="text-align: center; margin-top: 30px;">
                    <div class="score-value" style="font-size: 3em; color: ${this.getScoreColor(analysis.overallScore)};">${analysis.overallScore}</div>
                    <div class="score-label" style="font-size: 1.2em;">OVERALL QX SCORE (Grade: ${analysis.grade})</div>
                </div>
            </div>

            <!-- Problem Analysis -->
            <div class="section">
                <h2>🔍 Problem Analysis</h2>
                <div class="info-box">
                    <h3>Problem Statement</h3>
                    <p>${this.escapeHtml(analysis.problemAnalysis.problemStatement)}</p>
                    <p><strong>Complexity:</strong> ${analysis.problemAnalysis.complexity}</p>
                    <p><strong>Clarity Score:</strong> ${analysis.problemAnalysis.clarityScore}/100</p>
                </div>
                ${analysis.problemAnalysis.potentialFailures.length > 0 ? `
                <div class="improvements">
                    <h3>⚠️ Potential Failure Modes</h3>
                    <ul>
                        ${analysis.problemAnalysis.potentialFailures.map(f => `
                            <li>
                                <strong>[${f.severity.toUpperCase()}]</strong> ${this.escapeHtml(f.description)}
                                <br><small>Likelihood: ${f.likelihood}</small>
                            </li>
                        `).join('')}
                    </ul>
                </div>
                ` : ''}
            </div>

            <!-- User Needs -->
            <div class="section">
                <h2>👥 User Needs Analysis</h2>
                <p><strong>Suitability:</strong> ${analysis.userNeeds.suitability} | <strong>Score:</strong> ${analysis.userNeeds.alignmentScore}/100</p>
                ${analysis.userNeeds.needs.length > 0 ? `
                <div class="strengths">
                    <h3>✅ User Needs</h3>
                    <ul>
                        ${analysis.userNeeds.needs.map(n => `
                            <li>
                                <strong>[${n.priority}]</strong> ${this.escapeHtml(n.description)}
                                ${n.addressed ? '✓ Addressed' : '✗ Not Addressed'}
                            </li>
                        `).join('')}
                    </ul>
                </div>
                ` : ''}
                ${analysis.userNeeds.challenges.length > 0 ? `
                <div class="improvements">
                    <h3>⚠️ User Challenges</h3>
                    <ul>
                        ${analysis.userNeeds.challenges.map(c => `<li>${this.escapeHtml(c)}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
            </div>

            <!-- Business Needs -->
            <div class="section">
                <h2>💼 Business Needs Analysis</h2>
                <p><strong>Primary Goal:</strong> ${analysis.businessNeeds.primaryGoal}</p>
                <p><strong>Compromises UX:</strong> ${analysis.businessNeeds.compromisesUX ? 'Yes ⚠️' : 'No ✓'}</p>
                ${analysis.businessNeeds.kpisAffected.length > 0 ? `
                <div class="info-box">
                    <h3>KPIs Affected</h3>
                    <ul>
                        ${analysis.businessNeeds.kpisAffected.map(k => `<li>${this.escapeHtml(k)}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
            </div>

            <!-- Creativity Analysis -->
            <div class="section">
                <h2>🎨 Creativity & Innovation Analysis</h2>
                <p><strong>Creativity Score:</strong> ${analysis.creativityAnalysis.creativityScore}/100</p>
                <p><strong>Domains Explored:</strong> ${analysis.creativityAnalysis.domainsExplored.join(', ')}</p>
                ${analysis.creativityAnalysis.innovativeApproaches.length > 0 ? `
                <div class="strengths">
                    <h3>✨ Innovative Testing Approaches</h3>
                    <ul>
                        ${analysis.creativityAnalysis.innovativeApproaches.map(a => `
                            <li>
                                <strong>[${a.inspirationSource.toUpperCase()}]</strong> ${this.escapeHtml(a.description)}
                                <br><small>Applicability: ${a.applicability} | Novelty: ${a.novelty}</small>
                            </li>
                        `).join('')}
                    </ul>
                </div>
                ` : ''}
                ${analysis.creativityAnalysis.perspectives.length > 0 ? `
                <div class="info-box">
                    <h3>🔍 Testing Perspectives Applied</h3>
                    <ul>
                        ${analysis.creativityAnalysis.perspectives.map(p => `<li>${this.escapeHtml(p)}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
            </div>

            <!-- Design Quality Analysis -->
            <div class="section">
                <h2>🎯 Design Quality Analysis</h2>
                <p><strong>Overall Design Score:</strong> ${analysis.designAnalysis.overallDesignScore}/100</p>

                <!-- Exactness -->
                <div class="info-box" style="margin-top: 20px;">
                    <h3>📏 Exactness & Clarity (${analysis.designAnalysis.exactness.score}/100)</h3>
                    <p><strong>Clarity Level:</strong> ${analysis.designAnalysis.exactness.clarity}</p>
                    ${analysis.designAnalysis.exactness.clearElements.length > 0 ? `
                    <div style="margin-top: 15px;">
                        <strong>✓ Clear Elements:</strong>
                        <ul>
                            ${analysis.designAnalysis.exactness.clearElements.map(e => `<li>${this.escapeHtml(e)}</li>`).join('')}
                        </ul>
                    </div>
                    ` : ''}
                    ${analysis.designAnalysis.exactness.unclearElements.length > 0 ? `
                    <div style="margin-top: 15px;">
                        <strong>⚠️ Unclear Elements:</strong>
                        <ul>
                            ${analysis.designAnalysis.exactness.unclearElements.map(e => `<li>${this.escapeHtml(e)}</li>`).join('')}
                        </ul>
                    </div>
                    ` : ''}
                </div>

                <!-- Intuitive Design -->
                <div class="strengths" style="margin-top: 20px;">
                    <h3>🧭 Intuitive Design (${analysis.designAnalysis.intuitive.score}/100)</h3>
                    <p><strong>Follows Conventions:</strong> ${analysis.designAnalysis.intuitive.followsConventions ? 'Yes ✓' : 'No ⚠️'}</p>
                    ${analysis.designAnalysis.intuitive.intuitivePatterns.length > 0 ? `
                    <div style="margin-top: 15px;">
                        <strong>Intuitive Patterns Detected:</strong>
                        <ul>
                            ${analysis.designAnalysis.intuitive.intuitivePatterns.map(p => `<li>${this.escapeHtml(p)}</li>`).join('')}
                        </ul>
                    </div>
                    ` : ''}
                    ${analysis.designAnalysis.intuitive.culturalIssues.length > 0 ? `
                    <div style="margin-top: 15px;">
                        <strong>⚠️ Cultural Considerations:</strong>
                        <ul>
                            ${analysis.designAnalysis.intuitive.culturalIssues.map(i => `<li>${this.escapeHtml(i)}</li>`).join('')}
                        </ul>
                    </div>
                    ` : ''}
                </div>

                <!-- Counter-intuitive Design -->
                ${analysis.designAnalysis.counterIntuitive.deviations.length > 0 ? `
                <div class="improvements" style="margin-top: 20px;">
                    <h3>🔄 Counter-intuitive Design Patterns</h3>
                    <p><strong>Issues Found:</strong> ${analysis.designAnalysis.counterIntuitive.issuesCount}</p>
                    <p><strong>Fresh Eyes Perspective Applied:</strong> ${analysis.designAnalysis.counterIntuitive.freshEyesPerspective ? 'Yes ✓' : 'No'}</p>
                    <ul>
                        ${analysis.designAnalysis.counterIntuitive.deviations.map(d => `
                            <li>
                                <strong>${this.escapeHtml(d.element)}</strong>
                                <br>Expected: ${this.escapeHtml(d.expectedBehavior)}
                                <br>Actual: ${this.escapeHtml(d.actualBehavior)}
                                <br><small>Impact: ${d.impact} ${d.justification ? '| ' + this.escapeHtml(d.justification) : ''}</small>
                            </li>
                        `).join('')}
                    </ul>
                </div>
                ` : ''}
            </div>

            <!-- Oracle Problems -->
            ${analysis.oracleProblems.length > 0 ? `
            <div class="section">
                <h2>🔮 Oracle Problems Detected</h2>
                ${analysis.oracleProblems.map(p => `
                <div class="improvements">
                    <h3>[${p.severity.toUpperCase()}] ${p.type}</h3>
                    <p>${this.escapeHtml(p.description)}</p>
                    ${p.stakeholders ? `<p><strong>Stakeholders:</strong> ${p.stakeholders.join(', ')}</p>` : ''}
                    ${p.resolutionApproach ? `
                    <p><strong>Resolution Approach:</strong></p>
                    <ul>
                        ${p.resolutionApproach.map(r => `<li>${this.escapeHtml(r)}</li>`).join('')}
                    </ul>
                    ` : ''}
                </div>
                `).join('')}
            </div>
            ` : ''}

            <!-- Recommendations -->
            <div class="section">
                <h2>💡 Strategic Recommendations</h2>
                ${analysis.recommendations.slice(0, 10).map((rec, idx) => `
                <div class="recommendations">
                    <h3>🎯 Priority ${idx + 1}: ${this.escapeHtml(rec.principle)}</h3>
                    <p>${this.escapeHtml(rec.recommendation)}</p>
                    <p>
                        <strong>Severity:</strong> ${rec.severity} |
                        <strong>Impact:</strong> ${rec.impactPercentage || rec.impact}% |
                        <strong>Effort:</strong> ${rec.estimatedEffort || rec.effort}
                    </p>
                </div>
                `).join('')}
            </div>

            <!-- Heuristics Results -->
            ${analysis.heuristics.length > 0 ? `
            <div class="section">
                <h2>📐 Heuristics Analysis</h2>
                <div class="score-card">
                    ${analysis.heuristics.slice(0, 8).map(h => `
                    <div class="score-item">
                        <h4>${this.formatHeuristicName(h.name)}</h4>
                        <div class="score-value" style="font-size: 1.8em; color: ${this.getScoreColor(h.score)};">${h.score}</div>
                        <div class="score-label">/ 100</div>
                    </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            <!-- Impact Analysis -->
            <div class="section">
                <h2>⚡ Impact Analysis</h2>
                <div class="score-card">
                    <div class="score-item">
                        <h4>Visible Impact</h4>
                        <div class="score-value">${analysis.impactAnalysis.visible.score}</div>
                        <div class="score-label">/ 100</div>
                    </div>
                    <div class="score-item">
                        <h4>Invisible Impact</h4>
                        <div class="score-value">${analysis.impactAnalysis.invisible.score}</div>
                        <div class="score-label">/ 100</div>
                    </div>
                </div>
                ${analysis.impactAnalysis.visible.userFeelings && analysis.impactAnalysis.visible.userFeelings.length > 0 ? `
                <div class="info-box">
                    <h3>User Feelings</h3>
                    <ul>
                        ${analysis.impactAnalysis.visible.userFeelings.map(f => {
                            if (typeof f === 'string') {
                                return `<li>${this.escapeHtml(f)}</li>`;
                            } else {
                                return `<li><strong>${f.feeling}</strong> (${f.likelihood}): ${this.escapeHtml(f.context)}</li>`;
                            }
                        }).join('')}
                    </ul>
                </div>
                ` : ''}
            </div>

            <!-- Conclusion -->
            <div class="section">
                <h2>🎓 Conclusion</h2>
                <p>
                    This QX analysis reveals an overall score of <strong>${analysis.overallScore}/100 (Grade: ${analysis.grade})</strong>.
                    ${this.getScoreInterpretation(analysis.overallScore)}
                </p>
            </div>

            <!-- QX Methodology -->
            <div class="section" style="background: linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%); padding: 30px; border-radius: 8px; margin-top: 40px;">
                <h2>📚 QX Methodology: Key Concepts</h2>

                <div style="margin-top: 20px;">
                    <h3 style="color: #667eea; margin-bottom: 10px;">🤝 What is Quality Experience (QX)?</h3>
                    <p style="text-align: justify;">
                        <strong>Quality Experience (QX)</strong> is the marriage between <strong>Quality Advocacy (QA)</strong> and
                        <strong>User Experience (UX)</strong>. Unlike traditional testing that focuses solely on defects, QX recognizes
                        that quality is co-created by everyone associated with the product—developers, testers, designers, users, and
                        business stakeholders. QX enables testers to collaborate meaningfully with UX professionals by understanding
                        design effectiveness beyond technical correctness.
                    </p>
                </div>

                <div style="margin-top: 25px;">
                    <h3 style="color: #667eea; margin-bottom: 10px;">🎨 Creativity in Testing</h3>
                    <p style="text-align: justify;">
                        QX encourages drawing inspiration from <strong>diverse domains</strong>—philosophy, social science, medicine,
                        e-commerce, fashion, gaming—to generate innovative test ideas when conventional approaches fall short. This
                        cross-disciplinary perspective helps testers uncover unconventional risks and approach problems from fresh angles
                        that technical testing alone might miss.
                    </p>
                </div>

                <div style="margin-top: 25px;">
                    <h3 style="color: #667eea; margin-bottom: 10px;">📏 Exactness & Clarity</h3>
                    <p style="text-align: justify;">
                        <strong>Exactness</strong> evaluates how clearly a product communicates its intent to users. Testers should assess
                        whether menu items, buttons, labels, and terminology are self-evident. Are component interactions obvious? Do users
                        understand what will happen when they click? Exactness testing identifies ambiguities that create confusion, focusing
                        on <em>clarity of communication</em> rather than just functional correctness.
                    </p>
                </div>

                <div style="margin-top: 25px;">
                    <h3 style="color: #667eea; margin-bottom: 10px;">🧭 Intuitive Design</h3>
                    <p style="text-align: justify;">
                        <strong>Intuitive design</strong> follows common conventions and user expectations. QX testing evaluates whether
                        component interactions follow familiar patterns, respect cultural sensitivities, and align with mental models users
                        bring from other products. Intuitive design reduces cognitive load and makes products immediately usable without
                        extensive training.
                    </p>
                </div>

                <div style="margin-top: 25px;">
                    <h3 style="color: #667eea; margin-bottom: 10px;">🔄 Counter-intuitive Design Detection</h3>
                    <p style="text-align: justify;">
                        QX testing deliberately <strong>looks at products like an unexperienced user</strong> to spot design elements that
                        deviate from expectations. Counter-intuitive patterns aren't always bad—they might represent innovation—but they
                        require justification. The key is distinguishing between deliberate, valuable innovations and accidental friction
                        that experienced users have normalized but newcomers will struggle with.
                    </p>
                </div>

                <div style="margin-top: 25px; padding: 20px; background: white; border-left: 4px solid #667eea; border-radius: 4px;">
                    <p style="text-align: justify; font-style: italic;">
                        <strong>The QX Advantage:</strong> By combining quality advocacy with UX design thinking, QX enables testers to
                        contribute informed insights about user-facing quality, bridge the gap between QA and UX teams, and ensure that
                        testing serves the genuine experience quality that all stakeholders care about—not just technical correctness.
                    </p>
                </div>

                <div style="margin-top: 20px; text-align: center;">
                    <p style="font-size: 0.9em;">
                        <strong>Learn more:</strong>
                        <a href="https://talesoftesting.com/quality-experienceqx-co-creating-quality-experience-for-everyone-associated-with-the-product/"
                           target="_blank" rel="noopener noreferrer" style="color: #667eea; text-decoration: none;">
                            Quality Experience (QX) - Tales of Testing
                        </a>
                    </p>
                </div>
            </div>
        </div>

        <footer class="footer">
            <p>Generated by <a href="https://github.com/agentic-qe/agentic-qe" target="_blank" rel="noopener noreferrer">Agentic QE</a> — <strong>qx-partner</strong> (Core QCSD Agent)</p>
            <p>Analysis Method: AI Semantic Understanding | Framework: <a href="https://talesoftesting.com/quality-experienceqx-co-creating-quality-experience-for-everyone-associated-with-the-product/" target="_blank" rel="noopener noreferrer">Quality Experience (QX)</a></p>
            <p>Part of the <strong><a href="https://talesoftesting.com/qcsd/" target="_blank" rel="noopener noreferrer">QCSD Framework</a></strong> — Quality Conscious Software Delivery for shift-left quality engineering</p>
        </footer>
    </div>
</body>
</html>`;
  }

  /**
   * Get CSS styles for the report
   */
  private getReportStyles(): string {
    return `
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        .header h1 { font-size: 2.5em; margin-bottom: 10px; font-weight: 700; }
        .header .subtitle { font-size: 1.2em; opacity: 0.9; }
        .header .meta { margin-top: 20px; font-size: 0.9em; opacity: 0.8; }
        .content { padding: 40px; }
        .section { margin-bottom: 40px; }
        .section h2 {
            color: #667eea;
            font-size: 1.8em;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 3px solid #667eea;
        }
        .section h3 { color: #764ba2; font-size: 1.4em; margin: 25px 0 15px 0; }
        .section p { margin-bottom: 15px; text-align: justify; }
        .score-card {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }
        .score-item {
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            transition: transform 0.3s ease;
        }
        .score-item:hover { transform: translateY(-5px); box-shadow: 0 5px 20px rgba(0,0,0,0.1); }
        .score-item h4 { color: #667eea; font-size: 1.1em; margin-bottom: 10px; }
        .score-value {
            font-size: 2.5em;
            font-weight: bold;
            color: #764ba2;
            margin: 10px 0;
        }
        .score-label {
            font-size: 0.9em;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .strengths, .improvements, .recommendations, .info-box {
            background: #f8f9fa;
            padding: 25px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .strengths { border-left: 5px solid #28a745; }
        .improvements { border-left: 5px solid #ffc107; }
        .recommendations { border-left: 5px solid #17a2b8; }
        .info-box { border-left: 5px solid #6c757d; }
        .strengths h3 { color: #28a745; }
        .improvements h3 { color: #ffc107; }
        .recommendations h3 { color: #17a2b8; }
        .info-box h3 { color: #6c757d; }
        ul { margin-left: 20px; margin-top: 10px; }
        li { margin-bottom: 10px; line-height: 1.8; }
        .footer {
            background: #f8f9fa;
            padding: 30px;
            text-align: center;
            color: #666;
            border-top: 1px solid #e0e0e0;
        }
        .footer p { margin-bottom: 10px; }
        .footer a { color: #667eea; text-decoration: none; }

        /* Info Sections (QCSD Collapsible Help) */
        .info-section {
            background: rgba(255,255,255,0.1);
            border-radius: 8px;
            margin-top: 12px;
            text-align: left;
        }
        .info-header {
            padding: 15px 20px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .info-header h3 {
            margin: 0;
            font-size: 1rem;
            opacity: 0.95;
        }
        .info-content {
            padding: 0 20px 20px 20px;
            overflow: hidden;
            transition: max-height 0.3s ease-out, padding 0.3s ease-out;
            max-height: 1000px;
        }
        .info-section.collapsed .info-content {
            max-height: 0 !important;
            padding-top: 0 !important;
            padding-bottom: 0 !important;
        }
        .info-section.collapsed .collapse-icon {
            transform: rotate(-90deg);
        }
        .info-content blockquote {
            margin: 0 0 15px 0;
            padding: 12px 15px;
            border-left: 3px solid rgba(255,255,255,0.4);
            font-style: italic;
            opacity: 0.9;
        }
        .info-content p {
            margin: 0 0 12px 0;
            opacity: 0.9;
            line-height: 1.7;
            text-align: left;
        }
        .info-content a {
            color: #93c5fd;
            text-decoration: underline;
        }
        .checklist-item {
            margin-bottom: 8px;
            line-height: 1.8;
        }
        .checklist-item strong {
            color: white;
        }

        @media print {
            body { background: white; padding: 0; }
            .container { box-shadow: none; }
        }
    </style>`;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Format heuristic name for display
   */
  private formatHeuristicName(name: string): string {
    return name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Get color based on score
   */
  private getScoreColor(score: number): string {
    if (score >= 90) return '#28a745'; // Green
    if (score >= 80) return '#17a2b8'; // Blue
    if (score >= 70) return '#ffc107'; // Yellow
    if (score >= 60) return '#fd7e14'; // Orange
    return '#dc3545'; // Red
  }

  /**
   * Get score interpretation
   */
  private getScoreInterpretation(score: number): string {
    if (score >= 90) {
      return 'Excellent quality experience with strong alignment across all dimensions.';
    } else if (score >= 80) {
      return 'Good quality experience with minor areas for improvement.';
    } else if (score >= 70) {
      return 'Adequate quality experience but significant improvements recommended.';
    } else if (score >= 60) {
      return 'Below target quality experience. Priority improvements required.';
    } else {
      return 'Poor quality experience. Immediate action needed across multiple areas.';
    }
  }

  /**
   * Launch report in default browser
   */
  private async launchReportInBrowser(reportPath: string): Promise<void> {
    try {
      const platform = process.platform;
      let command: string;

      if (platform === 'darwin') {
        command = `open "${reportPath}"`;
      } else if (platform === 'win32') {
        command = `start "" "${reportPath}"`;
      } else {
        // Linux and others
        command = `xdg-open "${reportPath}"`;
      }

      await execAsync(command);
      this.logger.info(`Launched report in browser: ${reportPath}`);
    } catch (error) {
      this.logger.warn(`Failed to auto-launch browser:`, error);
      this.logger.info(`Report available at: ${reportPath}`);
    }
  }

  /**
   * Collect QX context from target using Playwright
   */
  private async collectQXContext(target: string, additionalContext?: Record<string, unknown>): Promise<QXContext> {
    this.logger.debug(`Collecting QX context for: ${target}`);

    try {
      // Launch browser if not already running
      if (!this.browser) {
        this.logger.debug('Launching browser...');
        this.browser = await chromium.launch({ 
          headless: true,
          timeout: 30000, // 30 second timeout for launch
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // Important for containers
            '--disable-gpu'
          ]
        });
      }

      // Create new page
      this.page = await this.browser.newPage();
      
      this.logger.debug(`Navigating to ${target}...`);
      // Navigate to target with timeout - try quick load first
      try {
        await this.page.goto(target, { waitUntil: 'commit', timeout: 15000 });
      } catch (navError) {
        this.logger.warn(`Quick navigation failed, trying basic load: ${navError}`);
        // Fallback: just navigate without waiting
        await this.page.goto(target, { waitUntil: 'commit', timeout: 10000 });
      }

      // Wait a bit for some content to load
      await this.page.waitForTimeout(1000);
      
      this.logger.debug('Extracting page context...');
      // Extract page context WITH ACTUAL CONTENT for contextual analysis
      const pageContext = await this.page.evaluate(() => {
        const countElements = (selector: string) => document.querySelectorAll(selector).length;
        const getText = (selector: string, limit = 5) => 
          Array.from(document.querySelectorAll(selector)).slice(0, limit).map(el => el.textContent?.trim() || '').filter(t => t.length > 0);
        
        // Extract navigation items for context understanding
        const navItems = getText('nav a, nav button, [role="navigation"] a');
        const headings = {
          h1: getText('h1', 3),
          h2: getText('h2', 5),
          h3: getText('h3', 5)
        };
        
        // Extract form purposes from labels/placeholders
        const formPurposes = Array.from(document.querySelectorAll('form')).map(form => {
          const labels = Array.from(form.querySelectorAll('label, input[placeholder]')).slice(0, 3);
          return labels.map(el => 
            (el as HTMLInputElement).placeholder || el.textContent?.trim() || ''
          ).filter(t => t.length > 0).join(', ');
        });
        
        // Extract button purposes
        const buttonPurposes = getText('button, [role="button"], input[type="submit"]', 10);
        
        // Extract link context (first 20 meaningful links)
        const linkTexts = getText('a[href]:not([href="#"]):not([href=""])', 20);
        
        // Extract main content snippets for purpose understanding
        const mainContent = document.querySelector('main, article, [role="main"]');
        const contentSnippet = mainContent?.textContent?.trim().substring(0, 300) || '';
        
        return {
          title: document.title,
          url: window.location.href,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          },
          content: {
            headings,
            navigationItems: navItems,
            buttonPurposes,
            formPurposes,
            linkTexts,
            mainContentSnippet: contentSnippet
          },
          elements: {
            total: document.querySelectorAll('*').length,
            buttons: countElements('button, [role="button"], input[type="button"], input[type="submit"]'),
            forms: countElements('form'),
            inputs: countElements('input, textarea, select'),
            links: countElements('a'),
            headings: {
              h1: countElements('h1'),
              h2: countElements('h2'),
              h3: countElements('h3')
            },
            images: countElements('img'),
            videos: countElements('video'),
            iframes: countElements('iframe')
          },
          semantic: {
            hasNav: countElements('nav') > 0,
            hasHeader: countElements('header') > 0,
            hasFooter: countElements('footer') > 0,
            hasMain: countElements('main') > 0,
            hasAside: countElements('aside') > 0,
            hasArticle: countElements('article') > 0,
            hasSection: countElements('section') > 0
          },
          accessibility: {
            ariaLabels: countElements('[aria-label]'),
            ariaDescriptions: countElements('[aria-describedby]'),
            altTexts: Array.from(document.querySelectorAll('img')).filter(img => img.hasAttribute('alt')).length,
            totalImages: countElements('img'),
            landmarkRoles: countElements('[role="banner"], [role="navigation"], [role="main"], [role="complementary"], [role="contentinfo"]'),
            focusableElements: countElements('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
          },
          errors: {
            consoleErrors: (window as typeof window & { __errors?: string[] }).__errors || [],
            hasErrorMessages: countElements('.error, [role="alert"], .alert-danger, .text-danger') > 0
          },
          meta: {
            description: (document.querySelector('meta[name="description"]') as HTMLMetaElement)?.content || '',
            keywords: (document.querySelector('meta[name="keywords"]') as HTMLMetaElement)?.content || '',
            viewport: (document.querySelector('meta[name="viewport"]') as HTMLMetaElement)?.content || ''
          }
        };
      });

      // Capture performance metrics
      const performanceMetrics = await this.page.evaluate(() => {
        const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        return {
          loadTime: perf?.loadEventEnd - perf?.fetchStart || 0,
          domReady: perf?.domContentLoadedEventEnd - perf?.fetchStart || 0,
          firstPaint: performance.getEntriesByType('paint').find(e => e.name === 'first-paint')?.startTime || 0
        };
      });

      const context: QXContext = {
        url: target,
        title: pageContext.title,
        domMetrics: {
          totalElements: pageContext.elements.total,
          interactiveElements: pageContext.elements.buttons + pageContext.elements.inputs + pageContext.elements.links,
          forms: pageContext.elements.forms,
          inputs: pageContext.elements.inputs,
          buttons: pageContext.elements.buttons,
          semanticStructure: pageContext.semantic
        },
        accessibility: {
          ariaLabelsCount: pageContext.accessibility.ariaLabels,
          altTextsCoverage: pageContext.accessibility.totalImages > 0 
            ? (pageContext.accessibility.altTexts / pageContext.accessibility.totalImages) * 100 
            : 100,
          focusableElementsCount: pageContext.accessibility.focusableElements,
          landmarkRoles: pageContext.accessibility.landmarkRoles
        },
        performance: performanceMetrics,
        errorIndicators: pageContext.errors,
        metadata: pageContext.meta,
        custom: additionalContext || {}
      };

      // Close page but keep browser for potential reuse
      await this.page.close();
      this.page = null;

      // Store context for later retrieval
      await this.storeMemory(`qx-context:${target}`, context);

      this.logger.debug('Context collection completed successfully');
      return context;
    } catch (error) {
      this.logger.error(`Failed to collect QX context: ${error}`);
      
      // Clean up on error
      if (this.page) {
        try {
          await this.page.close();
        } catch (e) {
          // Ignore close errors
        }
        this.page = null;
      }
      
      // Return minimal context on error
      return {
        url: target,
        custom: additionalContext || {},
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Detect domain-specific failure modes based on site type
   */
  private detectDomainSpecificFailures(
    context: QXContext,
    title: string,
    description: string,
    complexity: 'simple' | 'moderate' | 'complex'
  ): Array<{
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    likelihood: 'unlikely' | 'possible' | 'likely' | 'very-likely';
  }> {
    const failures: Array<{
      description: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      likelihood: 'unlikely' | 'possible' | 'likely' | 'very-likely';
    }> = [];

    const titleLower = title.toLowerCase();
    const descLower = description.toLowerCase();
    const forms = context.domMetrics?.forms || 0;
    const interactiveElements = context.domMetrics?.interactiveElements || 0;

    // E-commerce / Travel Booking sites
    if (titleLower.includes('hotel') || titleLower.includes('booking') || titleLower.includes('travel') ||
        titleLower.includes('shop') || titleLower.includes('store') || titleLower.includes('buy') ||
        descLower.includes('book') || descLower.includes('reservation') || descLower.includes('hotel')) {

      failures.push({
        description: 'Search and filter complexity may overwhelm users with too many options',
        severity: 'medium',
        likelihood: 'likely'
      });

      failures.push({
        description: 'Booking/checkout flow friction points may cause cart abandonment',
        severity: 'high',
        likelihood: 'likely'
      });

      failures.push({
        description: 'Price transparency issues or hidden fees may erode user trust',
        severity: 'high',
        likelihood: 'possible'
      });

      if (complexity === 'complex') {
        failures.push({
          description: 'Multi-step booking process may lose users if progress is not clearly indicated',
          severity: 'medium',
          likelihood: 'likely'
        });
      }
    }

    // Content/Blog/Magazine sites
    else if (titleLower.includes('blog') || titleLower.includes('article') || titleLower.includes('news') ||
             titleLower.includes('magazine') || titleLower.includes('testers') || titleLower.includes('testing')) {

      failures.push({
        description: 'Content discoverability - users may struggle to find relevant articles without robust search',
        severity: 'medium',
        likelihood: 'likely'
      });

      failures.push({
        description: 'Reading experience on mobile devices may not be optimized for long-form content',
        severity: 'medium',
        likelihood: 'possible'
      });

      failures.push({
        description: 'Archive navigation complexity may overwhelm readers looking for specific topics',
        severity: 'low',
        likelihood: 'possible'
      });
    }

    // SaaS / Web Applications
    else if (titleLower.includes('dashboard') || titleLower.includes('app') || titleLower.includes('platform') ||
             interactiveElements > 50) {

      failures.push({
        description: 'Complex workflows may confuse new users without proper onboarding',
        severity: 'medium',
        likelihood: 'likely'
      });

      failures.push({
        description: 'Data visualization and information density may cause cognitive overload',
        severity: 'medium',
        likelihood: 'possible'
      });

      failures.push({
        description: 'Error messages may not provide actionable recovery steps',
        severity: 'medium',
        likelihood: 'likely'
      });
    }

    // Form-heavy sites
    else if (forms > 0) {
      failures.push({
        description: 'Form validation errors may not be clearly communicated to users',
        severity: 'medium',
        likelihood: 'likely'
      });

      failures.push({
        description: 'Required field indicators may not be consistently applied',
        severity: 'low',
        likelihood: 'possible'
      });

      failures.push({
        description: 'Form submission failure recovery path may not be clear',
        severity: 'medium',
        likelihood: 'possible'
      });
    }

    // Return only the most relevant failures (max 5)
    return failures.slice(0, 5);
  }

  /**
   * Analyze problem using Rule of Three and complexity assessment
   */
  private async analyzeProblem(context: QXContext): Promise<ProblemAnalysis> {
    this.logger.debug('Analyzing problem');

    const title = context.title || 'Untitled page';
    const description = context.metadata?.description || '';
    const hasError = context.errorIndicators?.hasErrorMessages || false;

    let problemStatement = `Evaluate quality experience of "${title}"`;
    if (description) {
      problemStatement += ` - ${description.substring(0, 100)}`;
    }

    const totalElements = context.domMetrics?.totalElements || 0;
    const interactiveElements = context.domMetrics?.interactiveElements || 0;
    const forms = context.domMetrics?.forms || 0;
    
    let complexity: 'simple' | 'moderate' | 'complex';
    if (totalElements > 500 || interactiveElements > 50 || forms > 3) {
      complexity = 'complex';
    } else if (totalElements > 200 || interactiveElements > 20 || forms > 1) {
      complexity = 'moderate';
    } else {
      complexity = 'simple';
    }

    const breakdown: string[] = [];
    if (context.domMetrics?.semanticStructure?.hasNav) breakdown.push('Navigation structure');
    if (forms > 0) breakdown.push(`Form interactions (${forms} forms)`);
    if (interactiveElements > 0) breakdown.push(`User interactions (${interactiveElements} elements)`);
    if (context.accessibility) breakdown.push('Accessibility compliance');
    if (context.performance) breakdown.push('Performance metrics');

    const potentialFailures: Array<{
      description: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      likelihood: 'unlikely' | 'possible' | 'likely' | 'very-likely';
    }> = [];
    
    if (!context.domMetrics?.semanticStructure?.hasMain) {
      potentialFailures.push({
        description: 'Missing main content landmark - users may struggle to find primary content',
        severity: 'medium',
        likelihood: 'likely'
      });
    }
    if (context.accessibility && (context.accessibility.altTextsCoverage || 0) < 80) {
      potentialFailures.push({
        description: 'Poor image alt text coverage - screen reader users affected',
        severity: 'high',
        likelihood: 'very-likely'
      });
    }
    if (hasError) {
      potentialFailures.push({
        description: 'Visible error messages detected - potential usability issues',
        severity: 'medium',
        likelihood: 'likely'
      });
    }
    if (context.performance && (context.performance.loadTime || 0) > 3000) {
      potentialFailures.push({
        description: 'Slow load time - user frustration and abandonment risk',
        severity: 'high',
        likelihood: 'very-likely'
      });
    }
    if (!context.metadata?.viewport) {
      potentialFailures.push({
        description: 'Missing viewport meta tag - mobile responsiveness issues',
        severity: 'medium',
        likelihood: 'possible'
      });
    }

    // ENHANCED: Add domain-specific failure modes based on site type and context
    const domainFailures = this.detectDomainSpecificFailures(context, title, description, complexity);
    potentialFailures.push(...domainFailures);

    // Rule of Three: Ensure at least 3 failure modes are identified
    if (potentialFailures.length < 3) {
      // Add generic contextual failures for complex sites
      if (complexity === 'complex') {
        if (potentialFailures.length < 3) {
          potentialFailures.push({
            description: 'Complex interaction flows may confuse first-time users',
            severity: 'medium',
            likelihood: 'possible'
          });
        }
        if (potentialFailures.length < 3) {
          potentialFailures.push({
            description: 'Multiple interactive elements increase cognitive load',
            severity: 'low',
            likelihood: 'possible'
          });
        }
        if (potentialFailures.length < 3) {
          potentialFailures.push({
            description: 'Error recovery paths may not be clear in complex workflows',
            severity: 'medium',
            likelihood: 'possible'
          });
        }
      }
    }

    let clarityScore = 50;
    if (title && title !== 'Untitled page') clarityScore += 15;
    if (description) clarityScore += 15;
    if (breakdown.length >= 3) clarityScore += 10;
    if (context.domMetrics?.semanticStructure?.hasMain) clarityScore += 10;
    clarityScore = Math.min(100, clarityScore);

    return {
      problemStatement,
      complexity,
      breakdown,
      potentialFailures,
      clarityScore
    };
  }

  /**
   * Analyze user needs
   */
  private async analyzeUserNeeds(context: QXContext, problemAnalysis: ProblemAnalysis): Promise<UserNeedsAnalysis> {
    this.logger.debug('Analyzing user needs');

    const needs: Array<{
      description: string;
      priority: 'must-have' | 'should-have' | 'nice-to-have';
      addressed: boolean;
      notes?: string;
    }> = [];
    const challenges: string[] = [];

    const semantic = context.domMetrics?.semanticStructure;
    const accessibility = context.accessibility;
    const interactiveElements = context.domMetrics?.interactiveElements || 0;
    const forms = context.domMetrics?.forms || 0;

    // Must-have features (critical for basic functionality)
    if (semantic?.hasNav) {
      needs.push({ description: 'Clear navigation to find content', priority: 'must-have', addressed: true });
    } else {
      challenges.push('Missing navigation structure - users cannot easily explore site');
      needs.push({ description: 'Clear navigation to find content', priority: 'must-have', addressed: false });
    }

    if (interactiveElements > 0) {
      needs.push({ description: 'Interactive elements for engagement', priority: 'must-have', addressed: true });
    }

    if (accessibility && (accessibility.focusableElementsCount || 0) > 0) {
      needs.push({ description: 'Keyboard navigation support', priority: 'must-have', addressed: true });
    } else {
      challenges.push('Limited keyboard navigation - inaccessible to some users');
      needs.push({ description: 'Keyboard navigation support', priority: 'must-have', addressed: false });
    }

    // Should-have features (important for good UX)
    if (semantic?.hasHeader) {
      needs.push({ description: 'Consistent page header for orientation', priority: 'should-have', addressed: true });
    }

    if (semantic?.hasFooter) {
      needs.push({ description: 'Footer with supporting information', priority: 'should-have', addressed: true });
    }

    if (accessibility && (accessibility.altTextsCoverage || 0) > 50) {
      needs.push({ description: 'Image descriptions for screen readers', priority: 'should-have', addressed: true });
    } else if (accessibility && (accessibility.altTextsCoverage || 0) < 50) {
      challenges.push('Poor alt text coverage - images not accessible');
      needs.push({ description: 'Image descriptions for screen readers', priority: 'should-have', addressed: false });
    }

    if (context.performance && (context.performance.loadTime || 0) < 3000) {
      needs.push({ description: 'Fast page load time', priority: 'should-have', addressed: true });
    } else if (context.performance && (context.performance.loadTime || 0) >= 3000) {
      challenges.push('Slow load time - user frustration risk');
      needs.push({ description: 'Fast page load time', priority: 'should-have', addressed: false });
    }

    // Nice-to-have features (enhancements)
    if (semantic?.hasAside) {
      needs.push({ description: 'Supplementary content sections', priority: 'nice-to-have', addressed: true });
    }

    if (accessibility && (accessibility.landmarkRoles || 0) > 3) {
      needs.push({ description: 'Rich ARIA landmarks for navigation', priority: 'nice-to-have', addressed: true });
    }

    if (forms > 0) {
      needs.push({ description: 'Form interactions for user input', priority: 'nice-to-have', addressed: true });
    }

    // Determine suitability
    const addressedMustHaves = needs.filter(n => n.priority === 'must-have' && n.addressed).length;
    const totalMustHaves = needs.filter(n => n.priority === 'must-have').length;
    
    let suitability: 'excellent' | 'good' | 'adequate' | 'poor';
    if (challenges.length === 0 && addressedMustHaves >= 3) {
      suitability = 'excellent';
    } else if (challenges.length <= 1 && addressedMustHaves >= 2) {
      suitability = 'good';
    } else if (challenges.length <= 2 && addressedMustHaves >= 2) {
      suitability = 'adequate';
    } else {
      suitability = 'poor';
    }

    // Calculate alignment score
    let alignmentScore = 40;
    alignmentScore += addressedMustHaves * 10;
    alignmentScore += needs.filter(n => n.priority === 'should-have' && n.addressed).length * 5;
    alignmentScore += needs.filter(n => n.priority === 'nice-to-have' && n.addressed).length * 2;
    alignmentScore -= challenges.length * 8;
    alignmentScore = Math.max(0, Math.min(100, alignmentScore));

    return {
      needs,
      suitability,
      challenges,
      alignmentScore
    };
  }

  /**
   * Analyze business needs
   */
  private async analyzeBusinessNeeds(context: QXContext, problemAnalysis: ProblemAnalysis): Promise<BusinessNeedsAnalysis> {
    this.logger.debug('Analyzing business needs');

    const forms = context.domMetrics?.forms || 0;
    const interactiveElements = context.domMetrics?.interactiveElements || 0;
    const performance = context.performance;
    const hasErrors = context.errorIndicators?.hasErrorMessages || false;

    let primaryGoal: 'business-ease' | 'user-experience' | 'balanced';
    let kpisAffected: string[] = [];
    
    if (forms > 2) {
      primaryGoal = 'business-ease'; // Conversion focus leans business
      kpisAffected = ['Form completion rate', 'Lead generation', 'User sign-ups'];
    } else if (interactiveElements > 30) {
      primaryGoal = 'user-experience'; // Engagement focus leans UX
      kpisAffected = ['Time on site', 'Click-through rate', 'User engagement'];
    } else {
      primaryGoal = 'balanced';
      kpisAffected = ['Content consumption', 'Bounce rate', 'Page views'];
    }

    const crossTeamImpact: Array<{
      team: string;
      impactType: 'positive' | 'negative' | 'neutral' | 'unknown';
      description: string;
    }> = [];
    
    if (forms > 0) {
      crossTeamImpact.push({
        team: 'Marketing',
        impactType: 'positive',
        description: 'Form conversion optimization needed'
      });
      crossTeamImpact.push({
        team: 'Development',
        impactType: 'neutral',
        description: 'Form validation and submission handling'
      });
    }
    if (context.accessibility && (context.accessibility.altTextsCoverage || 0) < 100) {
      crossTeamImpact.push({
        team: 'Content',
        impactType: 'negative',
        description: 'Image alt text creation required'
      });
    }
    if (performance && (performance.loadTime || 0) > 2000) {
      crossTeamImpact.push({
        team: 'Engineering',
        impactType: 'negative',
        description: 'Performance optimization needed'
      });
    }
    if (problemAnalysis.complexity === 'complex') {
      crossTeamImpact.push({
        team: 'QA',
        impactType: 'neutral',
        description: 'Comprehensive testing strategy required'
      });
    }

    let compromisesUX = false;
    if (hasErrors) {
      compromisesUX = true;
    }
    if (context.accessibility && (context.accessibility.altTextsCoverage || 0) < 50) {
      compromisesUX = true;
    }
    if (performance && (performance.loadTime || 0) > 4000) {
      compromisesUX = true;
    }

    const impactsKPIs = kpisAffected.length > 0;

    let alignmentScore = 50;
    if (kpisAffected.length > 0) alignmentScore += 15;
    if (crossTeamImpact.length > 0) alignmentScore += 10;
    if (!compromisesUX) alignmentScore += 20;
    if (impactsKPIs) alignmentScore += 5;
    alignmentScore = Math.min(100, alignmentScore);

    return {
      primaryGoal,
      kpisAffected,
      crossTeamImpact,
      compromisesUX,
      impactsKPIs,
      alignmentScore
    };
  }

  /**
   * Analyze Creativity - Drawing inspiration from diverse domains
   */
  private async analyzeCreativity(context: QXContext, problemAnalysis: ProblemAnalysis): Promise<import('../types/qx').CreativityAnalysis> {
    this.logger.debug('Analyzing creativity and innovation');

    const innovativeApproaches: Array<{
      description: string;
      inspirationSource: string;
      applicability: 'high' | 'medium' | 'low';
      novelty: 'highly-novel' | 'moderately-novel' | 'incremental';
    }> = [];

    // Analyze based on problem complexity
    if (problemAnalysis.complexity === 'complex' || problemAnalysis.complexity === 'moderate') {
      // Philosophy-inspired: Question fundamental assumptions
      innovativeApproaches.push({
        description: 'Question fundamental assumptions about user mental models and expected workflows',
        inspirationSource: 'philosophy',
        applicability: 'high',
        novelty: 'moderately-novel'
      });

      // Medicine-inspired: Diagnostic approach
      if (context.errorIndicators?.hasErrorMessages) {
        innovativeApproaches.push({
          description: 'Apply diagnostic testing - systematically isolate error sources through controlled scenarios',
          inspirationSource: 'medicine',
          applicability: 'high',
          novelty: 'moderately-novel'
        });
      }
    }

    // E-commerce/Fashion-inspired: User journey and aesthetics
    if (context.domMetrics?.forms && context.domMetrics.forms > 0) {
      innovativeApproaches.push({
        description: 'Test checkout/form flows like fashion retail - focus on friction points, abandonment triggers',
        inspirationSource: 'e-commerce',
        applicability: 'high',
        novelty: 'incremental'
      });
    }

    // Social Science-inspired: Cultural sensitivity and demographics
    innovativeApproaches.push({
      description: 'Analyze through diverse demographic lenses (age, gender, culture, ability) for inclusive testing',
      inspirationSource: 'social science',
      applicability: 'high',
      novelty: 'moderately-novel'
    });

    // Gaming-inspired: Edge cases and exploits
    if (context.domMetrics?.interactiveElements && context.domMetrics.interactiveElements > 20) {
      innovativeApproaches.push({
        description: 'Test for "game-breaking" exploits - unexpected interaction sequences, boundary conditions',
        inspirationSource: 'gaming',
        applicability: 'medium',
        novelty: 'highly-novel'
      });
    }

    const domainsExplored = [...new Set(innovativeApproaches.map(a => a.inspirationSource))];

    const perspectives = [
      'Unexperienced user perspective (fresh eyes)',
      'Power user perspective (efficiency focus)',
      'Accessibility perspective (assistive tech users)',
      'International perspective (cultural differences)'
    ];

    // Calculate creativity score
    let creativityScore = 50; // Base score
    creativityScore += innovativeApproaches.length * 8; // +8 per approach
    creativityScore += domainsExplored.length * 5; // +5 per domain
    creativityScore = Math.min(100, creativityScore);

    return {
      innovativeApproaches,
      domainsExplored,
      perspectives,
      creativityScore,
      notes: [
        'Creativity draws from diverse domains to uncover unconventional testing approaches',
        'Higher complexity problems benefit from cross-disciplinary inspiration',
        `Applied ${innovativeApproaches.length} creative approaches from ${domainsExplored.length} domains`
      ]
    };
  }

  /**
   * Analyze Design - Exactness, Intuitive, and Counter-intuitive Design
   */
  private async analyzeDesign(context: QXContext, _problemAnalysis: ProblemAnalysis): Promise<import('../types/qx').DesignAnalysis> {
    this.logger.debug('Analyzing design quality');

    // 1. Exactness Analysis - How clearly the product communicates its intent
    const clearElements: string[] = [];
    const unclearElements: string[] = [];

    // Check semantic structure for clarity
    if (context.domMetrics?.semanticStructure?.hasNav) {
      clearElements.push('Navigation structure clearly defined with semantic <nav> element');
    }
    if (context.domMetrics?.semanticStructure?.hasMain) {
      clearElements.push('Main content area clearly identified');
    }
    if (context.domMetrics?.semanticStructure?.hasHeader && context.domMetrics?.semanticStructure?.hasFooter) {
      clearElements.push('Header and footer provide clear page structure');
    }

    // Check for unclear elements
    const ariaLabels = context.semanticQuality?.ariaLabels || 0;
    const interactiveElements = context.domMetrics?.interactiveElements || 0;
    if (interactiveElements > 0 && ariaLabels < interactiveElements * 0.5) {
      unclearElements.push('Many interactive elements lack ARIA labels for clarity');
    }

    if (context.errorIndicators?.hasErrorMessages) {
      unclearElements.push('Error messages present - may indicate unclear user guidance');
    }

    const exactnessClarity: 'excellent' | 'good' | 'adequate' | 'poor' =
      unclearElements.length === 0 ? 'excellent' :
      unclearElements.length <= 2 ? 'good' :
      unclearElements.length <= 4 ? 'adequate' : 'poor';

    let exactnessScore = 50;
    exactnessScore += clearElements.length * 10;
    exactnessScore -= unclearElements.length * 8;
    exactnessScore = Math.max(0, Math.min(100, exactnessScore));

    // 2. Intuitive Design Analysis
    const intuitivePatterns: string[] = [];
    const culturalIssues: string[] = [];

    if (context.domMetrics?.semanticStructure?.hasNav) {
      intuitivePatterns.push('Standard navigation patterns (semantic nav element)');
    }
    if (context.domMetrics?.forms && context.domMetrics.forms > 0) {
      intuitivePatterns.push('Standard form patterns detected');
    }
    if (context.metadata?.viewport) {
      intuitivePatterns.push('Responsive design viewport configured');
    }

    // Cultural sensitivity check (basic)
    if (context.title && /[^\x00-\x7F]/.test(context.title || '')) {
      // Non-ASCII characters detected - could be good (internationalization) or need review
      culturalIssues.push('International characters detected - ensure cultural appropriateness');
    }

    const followsConventions = intuitivePatterns.length >= 2;
    let intuitiveScore = followsConventions ? 70 : 50;
    intuitiveScore += intuitivePatterns.length * 8;
    intuitiveScore -= culturalIssues.length * 10;
    intuitiveScore = Math.max(0, Math.min(100, intuitiveScore));

    // 3. Counter-intuitive Design Detection
    const deviations: Array<{
      element: string;
      expectedBehavior: string;
      actualBehavior: string;
      impact: 'positive' | 'negative' | 'neutral';
      justification?: string;
    }> = [];

    // Check for potential counter-intuitive patterns
    const buttons = context.domMetrics?.buttons || 0;
    const forms = context.domMetrics?.forms || 0;
    if (buttons > 20 && forms === 0) {
      deviations.push({
        element: 'Multiple buttons without forms',
        expectedBehavior: 'Forms typically accompany many buttons',
        actualBehavior: 'Many buttons present without traditional forms',
        impact: 'neutral',
        justification: 'May be single-page app or API-driven interface'
      });
    }

    if (!context.domMetrics?.semanticStructure?.hasMain && (context.domMetrics?.totalElements || 0) > 50) {
      deviations.push({
        element: 'Complex page without main landmark',
        expectedBehavior: 'Complex pages typically have <main> landmark',
        actualBehavior: 'No main content landmark defined',
        impact: 'negative',
        justification: 'Reduces accessibility and clarity'
      });
    }

    const innovativeJustification = deviations.some(d => d.impact === 'positive' || d.justification?.includes('innovation'));
    const freshEyesPerspective = deviations.length > 0; // We're looking from unexperienced user view
    const issuesCount = deviations.filter(d => d.impact === 'negative').length;

    // 4. Overall Design Score
    const overallDesignScore = Math.round((exactnessScore + intuitiveScore) / 2);

    return {
      exactness: {
        clarity: exactnessClarity,
        clearElements,
        unclearElements,
        score: exactnessScore
      },
      intuitive: {
        followsConventions,
        intuitivePatterns,
        culturalIssues,
        score: intuitiveScore
      },
      counterIntuitive: {
        deviations,
        innovativeJustification,
        freshEyesPerspective,
        issuesCount
      },
      overallDesignScore
    };
  }

  /**
   * Detect oracle problems from analysis context
   */
  private async detectOracleProblemsFromContext(
    context: QXContext,
    userNeeds: UserNeedsAnalysis,
    businessNeeds: BusinessNeedsAnalysis
  ): Promise<OracleProblem[]> {
    if (!this.oracleDetector) {
      return [];
    }

    return this.oracleDetector.detect(context, userNeeds, businessNeeds);
  }

  /**
   * Perform impact analysis
   */
  private async analyzeImpact(context: QXContext, problemAnalysis: ProblemAnalysis): Promise<ImpactAnalysis> {
    if (!this.impactAnalyzer) {
      throw new Error('Impact analyzer not initialized');
    }

    return this.impactAnalyzer.analyze(context, problemAnalysis);
  }

  /**
   * Apply all enabled heuristics
   */
  private async applyAllHeuristics(
    context: QXContext,
    problemAnalysis: ProblemAnalysis,
    userNeeds: UserNeedsAnalysis,
    businessNeeds: BusinessNeedsAnalysis,
    creativityAnalysis: import('../types/qx').CreativityAnalysis,
    designAnalysis: import('../types/qx').DesignAnalysis
  ): Promise<QXHeuristicResult[]> {
    if (!this.heuristicsEngine) {
      throw new Error('Heuristics engine not initialized');
    }

    // Get standard heuristics
    const standardHeuristics = await this.heuristicsEngine.applyAll(context, problemAnalysis, userNeeds, businessNeeds);

    // Add creativity and design heuristics
    const creativityHeuristic: QXHeuristicResult = {
      name: 'creativity-innovation',
      category: 'creativity',
      applied: true,
      score: creativityAnalysis.creativityScore,
      findings: [
        `Applied ${creativityAnalysis.innovativeApproaches.length} creative approaches`,
        `Explored ${creativityAnalysis.domainsExplored.length} diverse domains: ${creativityAnalysis.domainsExplored.join(', ')}`,
        ...creativityAnalysis.notes
      ],
      issues: creativityAnalysis.innovativeApproaches
        .filter(a => a.applicability === 'low')
        .map(a => ({
          description: `Low applicability approach: ${a.description}`,
          severity: 'low' as const
        })),
      recommendations: creativityAnalysis.innovativeApproaches
        .filter(a => a.applicability === 'high')
        .map(a => `Consider: ${a.description} (${a.inspirationSource})`)
    };

    const designHeuristic: QXHeuristicResult = {
      name: 'design-quality',
      category: 'design',
      applied: true,
      score: designAnalysis.overallDesignScore,
      findings: [
        `Exactness: ${designAnalysis.exactness.clarity} (${designAnalysis.exactness.score}/100)`,
        `Intuitive Design: ${designAnalysis.intuitive.followsConventions ? 'Follows' : 'Deviates from'} conventions (${designAnalysis.intuitive.score}/100)`,
        `Counter-intuitive issues: ${designAnalysis.counterIntuitive.issuesCount}`,
        ...designAnalysis.exactness.clearElements.map(e => `✓ ${e}`),
        ...designAnalysis.intuitive.intuitivePatterns.map(p => `✓ ${p}`)
      ],
      issues: [
        ...designAnalysis.exactness.unclearElements.map(e => ({
          description: e,
          severity: 'medium' as const
        })),
        ...designAnalysis.counterIntuitive.deviations
          .filter(d => d.impact === 'negative')
          .map(d => ({
            description: `${d.element}: ${d.expectedBehavior} vs ${d.actualBehavior}`,
            severity: 'medium' as const
          }))
      ],
      recommendations: [
        ...designAnalysis.exactness.unclearElements.map(e => `Improve clarity: ${e}`),
        ...designAnalysis.intuitive.culturalIssues.map(i => `Address: ${i}`)
      ]
    };

    return [...standardHeuristics, creativityHeuristic, designHeuristic];
  }

  /**
   * Generate QX recommendations
   */
  private async generateRecommendations(
    problemAnalysis: ProblemAnalysis,
    userNeeds: UserNeedsAnalysis,
    businessNeeds: BusinessNeedsAnalysis,
    oracleProblems: OracleProblem[],
    impactAnalysis: ImpactAnalysis,
    heuristics: QXHeuristicResult[],
    _testabilityIntegration?: TestabilityIntegration
  ): Promise<QXRecommendation[]> {
    const recommendations: QXRecommendation[] = [];
    let priorityCounter = 1;

    // Oracle problems (highest priority - match manual report structure)
    for (const problem of oracleProblems) {
      const impactScore = problem.severity === 'critical' ? 90 : problem.severity === 'high' ? 80 : problem.severity === 'medium' ? 60 : 40;
      const impactPct = Math.round((impactScore / 100) * 30); // Up to 30% impact
      recommendations.push({
        principle: 'Oracle Problem',
        recommendation: `Resolve: ${problem.description}`,
        severity: problem.severity,
        impact: impactScore,
        effort: problem.severity === 'critical' || problem.severity === 'high' ? 'high' : 'medium',
        priority: priorityCounter++,
        category: 'qa',
        impactPercentage: impactPct,
        estimatedEffort: problem.severity === 'critical' ? 'High - Critical issue' : problem.severity === 'high' ? 'High' : 'Medium'
      });
    }

    // Problem clarity
    if (problemAnalysis.clarityScore < (this.config.thresholds?.minProblemClarity || 70)) {
      const gap = 70 - problemAnalysis.clarityScore;
      recommendations.push({
        principle: 'Problem Understanding',
        recommendation: 'Improve problem statement clarity with detailed breakdown of failure modes and user scenarios',
        severity: gap > 25 ? 'high' : 'medium',
        impact: Math.round(gap * 1.2),
        effort: 'medium',
        priority: priorityCounter++,
        category: 'qx',
        impactPercentage: Math.round((gap / 70) * 20),
        estimatedEffort: 'Medium - Requires stakeholder workshops'
      });
    }

    // User needs alignment (match manual report priority)
    if (userNeeds.alignmentScore < (this.config.thresholds?.minUserNeedsAlignment || 75)) {
      const gap = 75 - userNeeds.alignmentScore;
      const impactPct = Math.min(35, Math.round((gap / 75) * 100));
      recommendations.push({
        principle: 'User Needs Alignment',
        recommendation: `Improve user needs coverage from ${userNeeds.alignmentScore}/100 to at least 75/100`,
        severity: gap > 20 ? 'high' : 'medium',
        impact: Math.round(gap * 0.9),
        effort: gap > 25 ? 'high' : 'medium',
        priority: priorityCounter++,
        category: 'ux',
        impactPercentage: impactPct,
        estimatedEffort: gap > 25 ? 'High - Major UX redesign' : 'Medium - UX improvements'
      });
    }

    // Heuristic-specific high-impact recommendations
    const lowScoringHeuristics = heuristics
      .filter(h => h.score < 70)
      .sort((a, b) => a.score - b.score)
      .slice(0, 5); // Top 5 worst

    lowScoringHeuristics.forEach(heuristic => {
      const impactScore = 75 - heuristic.score;
      const impactPct = Math.round((impactScore / 75) * 25);
      
      if (heuristic.recommendations.length > 0 && heuristic.heuristicType) {
        recommendations.push({
          principle: this.formatHeuristicName(heuristic.heuristicType),
          recommendation: heuristic.recommendations[0],
          severity: heuristic.score < 50 ? 'high' : 'medium',
          impact: impactScore,
          effort: heuristic.score < 40 ? 'high' : 'medium',
          priority: priorityCounter++,
          category: heuristic.category as 'ux' | 'qa' | 'qx' | 'design',
          impactPercentage: impactPct,
          estimatedEffort: heuristic.score < 40 ? 'High - Significant work required' : 'Medium'
        });
      }
    });

    // High-impact issues from heuristics
    heuristics.forEach(heuristic => {
      if (!heuristic.heuristicType) return;
      
      heuristic.issues
        .filter(issue => issue.severity === 'critical' || issue.severity === 'high')
        .slice(0, 1) // One per heuristic
        .forEach(issue => {
          const impactScore = Math.min(85, 100 - heuristic.score);
          const impactPct = Math.round((impactScore / 100) * 22);
          recommendations.push({
            principle: this.formatHeuristicName(heuristic.heuristicType!),
            recommendation: issue.description,
            severity: issue.severity,
            impact: impactScore,
            effort: issue.severity === 'critical' ? 'high' : 'medium',
            priority: priorityCounter++,
            category: heuristic.category as 'ux' | 'qa' | 'qx' | 'design',
            impactPercentage: impactPct,
            estimatedEffort: issue.severity === 'critical' ? 'High - Critical fix' : 'Medium'
          });
        });
    });

    // Business-user balance
    const balanceDiff = Math.abs(userNeeds.alignmentScore - businessNeeds.alignmentScore);
    if (balanceDiff > 15) {
      const impactPct = Math.round((balanceDiff / 100) * 20);
      const favorsUser = userNeeds.alignmentScore > businessNeeds.alignmentScore;
      recommendations.push({
        principle: 'User-Business Balance',
        recommendation: favorsUser 
          ? 'Strengthen business value metrics while maintaining user experience quality'
          : 'Enhance user experience focus to balance business-centric approach',
        severity: balanceDiff > 30 ? 'high' : 'medium',
        impact: Math.round(balanceDiff * 0.75),
        effort: 'medium',
        priority: priorityCounter++,
        category: 'qx',
        impactPercentage: impactPct,
        estimatedEffort: 'Medium - Requires stakeholder alignment'
      });
    }

    // Business needs (if misaligned)
    if (businessNeeds.alignmentScore < (this.config.thresholds?.minBusinessAlignment || 70)) {
      const gap = 70 - businessNeeds.alignmentScore;
      recommendations.push({
        principle: 'Business Alignment',
        recommendation: 'Improve alignment with business KPIs and objectives',
        severity: gap > 25 ? 'high' : 'medium',
        impact: Math.round(gap * 0.7),
        effort: 'medium',
        priority: priorityCounter++,
        category: 'qx',
        impactPercentage: Math.round((gap / 70) * 18),
        estimatedEffort: 'Medium - Business stakeholder review'
      });
    }

    // Sort by impact percentage and limit to top 10
    const sorted = recommendations
      .sort((a, b) => (b.impactPercentage || 0) - (a.impactPercentage || 0))
      .slice(0, 10);

    // Reassign priorities
    sorted.forEach((rec, idx) => {
      rec.priority = idx + 1;
    });

    return sorted;
  }

  /**
   * Calculate overall QX score
   */
  private calculateOverallQXScore(
    problemAnalysis: ProblemAnalysis,
    userNeeds: UserNeedsAnalysis,
    businessNeeds: BusinessNeedsAnalysis,
    creativityAnalysis: import('../types/qx').CreativityAnalysis,
    designAnalysis: import('../types/qx').DesignAnalysis,
    impactAnalysis: ImpactAnalysis,
    heuristics: QXHeuristicResult[]
  ): number {
    // Weighted average of all components
    const weights = {
      problem: 0.15,        // Reduced from 0.20
      userNeeds: 0.20,      // Reduced from 0.25
      businessNeeds: 0.15,  // Reduced from 0.20
      creativity: 0.15,     // NEW
      design: 0.15,         // NEW
      impact: 0.10,         // Reduced from 0.15
      heuristics: 0.10      // Reduced from 0.20
    };

    const heuristicsAvg = heuristics.length > 0
      ? heuristics.reduce((sum, h) => sum + h.score, 0) / heuristics.length
      : 70;

    const impactScore = Math.max(0, 100 - impactAnalysis.overallImpactScore);

    const score =
      problemAnalysis.clarityScore * weights.problem +
      userNeeds.alignmentScore * weights.userNeeds +
      businessNeeds.alignmentScore * weights.businessNeeds +
      creativityAnalysis.creativityScore * weights.creativity +
      designAnalysis.overallDesignScore * weights.design +
      impactScore * weights.impact +
      heuristicsAvg * weights.heuristics;

    return Math.round(score);
  }

  /**
   * Convert score to grade
   */
  private scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Detect oracle problems (separate task)
   */
  private async detectOracleProblems(params: QXTaskParams): Promise<OracleProblem[]> {
    const context = await this.collectQXContext(params.target, params.params?.context);
    const problemAnalysis = await this.analyzeProblem(context);
    const userNeeds = await this.analyzeUserNeeds(context, problemAnalysis);
    const businessNeeds = await this.analyzeBusinessNeeds(context, problemAnalysis);

    return this.detectOracleProblemsFromContext(context, userNeeds, businessNeeds);
  }

  /**
   * Analyze user vs business balance
   */
  private async analyzeUserBusinessBalance(params: QXTaskParams): Promise<unknown> {
    const context = await this.collectQXContext(params.target, params.params?.context);
    const problemAnalysis = await this.analyzeProblem(context);
    const userNeeds = await this.analyzeUserNeeds(context, problemAnalysis);
    const businessNeeds = await this.analyzeBusinessNeeds(context, problemAnalysis);

    return {
      userNeeds,
      businessNeeds,
      balance: {
        favorsUser: userNeeds.alignmentScore > businessNeeds.alignmentScore,
        favorsBusiness: businessNeeds.alignmentScore > userNeeds.alignmentScore,
        isBalanced: Math.abs(userNeeds.alignmentScore - businessNeeds.alignmentScore) < 10,
        recommendation: this.getBalanceRecommendation(userNeeds, businessNeeds)
      }
    };
  }

  private getBalanceRecommendation(userNeeds: UserNeedsAnalysis, businessNeeds: BusinessNeedsAnalysis): string {
    const diff = userNeeds.alignmentScore - businessNeeds.alignmentScore;
    if (Math.abs(diff) < 10) {
      return 'Good balance between user and business needs';
    } else if (diff > 0) {
      return 'Consider business objectives more to achieve better balance';
    } else {
      return 'Consider user needs more to achieve better balance';
    }
  }

  /**
   * Perform impact analysis (separate task)
   */
  private async performImpactAnalysis(params: QXTaskParams): Promise<ImpactAnalysis> {
    const context = await this.collectQXContext(params.target, params.params?.context);
    const problemAnalysis = await this.analyzeProblem(context);

    return this.analyzeImpact(context, problemAnalysis);
  }

  /**
   * Apply specific heuristic
   */
  private async applySpecificHeuristic(params: QXTaskParams): Promise<QXHeuristicResult> {
    if (!params.params?.heuristic) {
      throw new Error('Heuristic parameter is required');
    }

    const context = await this.collectQXContext(params.target, params.params?.context);
    const problemAnalysis = await this.analyzeProblem(context);
    const userNeeds = await this.analyzeUserNeeds(context, problemAnalysis);
    const businessNeeds = await this.analyzeBusinessNeeds(context, problemAnalysis);

    if (!this.heuristicsEngine) {
      throw new Error('Heuristics engine not initialized');
    }

    return this.heuristicsEngine.apply(params.params.heuristic, context, problemAnalysis, userNeeds, businessNeeds);
  }

  /**
   * Generate QX recommendations (separate task)
   */
  private async generateQXRecommendations(params: QXTaskParams): Promise<QXRecommendation[]> {
    const analysis = await this.performFullQXAnalysis(params);
    return analysis.recommendations;
  }

  /**
   * Integrate with testability scoring
   */
  private async integrateTestabilityScoring(_params: QXTaskParams): Promise<TestabilityIntegration | undefined> {
    if (!this.config.integrateTestability) {
      return undefined;
    }

    this.logger.debug('Integrating with testability scoring');

    // In real implementation, this would invoke the testability-scoring skill
    // For now, return a placeholder structure
    const integration: TestabilityIntegration = {
      qxRelation: [
        'Testability affects QX through observability and controllability',
        'High testability scores typically correlate with better QX scores'
      ],
      combinedInsights: [
        'Consider testability principles in QX analysis',
        'Low observability impacts both testing and user experience'
      ]
    };

    return integration;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async validateTestabilityScoringAvailability(): Promise<void> {
    this.logger.debug('Validating testability scoring availability');
    // In real implementation, check if the skill exists and is accessible
  }

  private async setupCollaborationChannels(): Promise<void> {
    this.logger.debug('Setting up collaboration channels');
    
    if (this.config.collaboration?.coordinateWithUX) {
      this.logger.info('Collaboration with UX agents enabled');
    }
    
    if (this.config.collaboration?.coordinateWithQA) {
      this.logger.info('Collaboration with QA agents enabled');
    }
  }

  private async initializeDefaultOraclePatterns(): Promise<void> {
    const defaultPatterns = {
      patterns: [
        'Revenue vs User Experience conflict',
        'Technical constraints vs User expectations',
        'Business deadlines vs Quality requirements'
      ]
    };
    await this.storeMemory('oracle-patterns', defaultPatterns);
  }

  private async saveQXState(): Promise<void> {
    // Save current state for future reference
    const state = {
      lastAnalysis: new Date(),
      analysisCount: this.performanceMetrics.tasksCompleted
    };
    await this.storeMemory('qx-state', state);
  }

  private async saveOraclePatterns(): Promise<void> {
    // Save learned oracle patterns
    const patterns = await this.retrieveMemory('oracle-patterns');
    if (patterns) {
      await this.storeSharedMemory('qx-partner/oracle-patterns', patterns);
    }
  }

  private async saveHeuristicsInsights(): Promise<void> {
    // Save heuristics insights for other agents
    const insights = await this.retrieveMemory('heuristics-knowledge');
    if (insights) {
      await this.storeSharedMemory('qx-partner/heuristics-insights', insights);
    }
  }

  private async shareCollaborationInsights(): Promise<void> {
    if (this.config.collaboration?.shareWithQualityAnalyzer) {
      const qxInsights = await this.retrieveMemory('qx-state');
      if (qxInsights) {
        await this.storeSharedMemory('quality-analyzer/qx-insights', qxInsights);
      }
    }
  }

  protected async onPreInitialization(): Promise<void> {
    this.logger.info(`QXPartnerAgent initializing in ${this.config.analysisMode} mode`);
  }

  protected async onPostInitialization(): Promise<void> {
    this.logger.info(`QXPartnerAgent ready for QX analysis`);
  }
}

// ============================================================================
// Helper Classes
// ============================================================================

/**
 * QX Heuristics Engine
 */
class QXHeuristicsEngine {
  constructor(private config: QXPartnerConfig['heuristics']) {}

  async applyAll(
    _context: QXContext,
    _problemAnalysis: ProblemAnalysis,
    _userNeeds: UserNeedsAnalysis,
    _businessNeeds: BusinessNeedsAnalysis
  ): Promise<QXHeuristicResult[]> {
    const results: QXHeuristicResult[] = [];

    for (const heuristic of this.config.enabledHeuristics) {
      const result = await this.apply(heuristic, _context, _problemAnalysis, _userNeeds, _businessNeeds);
      results.push(result);
    }

    return results;
  }

  async apply(
    heuristic: QXHeuristic,
    context: QXContext,
    problemAnalysis: ProblemAnalysis,
    userNeeds: UserNeedsAnalysis,
    businessNeeds: BusinessNeedsAnalysis
  ): Promise<QXHeuristicResult> {
    const category = this.getHeuristicCategory(heuristic);
    const findings: string[] = [];
    const issues: Array<{ description: string; severity: 'low' | 'medium' | 'high' | 'critical' }> = [];
    const recommendations: string[] = [];
    let score = 75; // Base score

    // Apply specific heuristic logic based on type
    switch (heuristic) {
      case QXHeuristic.CONSISTENCY_ANALYSIS:
        if (context.domMetrics?.semanticStructure?.hasHeader && context.domMetrics?.semanticStructure?.hasFooter) {
          score = 85;
          findings.push('Consistent page structure with header and footer');
        } else {
          score = 60;
          recommendations.push('Add consistent header/footer structure');
        }
        break;

      case QXHeuristic.INTUITIVE_DESIGN:
        const hasNav = context.domMetrics?.semanticStructure?.hasNav;
        const focusable = context.accessibility?.focusableElementsCount || 0;
        if (hasNav && focusable > 10) {
          score = 82;
          findings.push('Intuitive navigation and interaction design');
        } else {
          score = 55;
          issues.push({ description: 'Navigation or interaction patterns unclear', severity: 'medium' });
        }
        break;

      case QXHeuristic.EXACTNESS_AND_CLARITY:
        // Visual hierarchy and clarity (Design category)
        score = 70;
        const hasSemanticStructure = context.domMetrics?.semanticStructure;
        const structureScore = [
          hasSemanticStructure?.hasHeader,
          hasSemanticStructure?.hasMain,
          hasSemanticStructure?.hasNav,
          hasSemanticStructure?.hasFooter
        ].filter(Boolean).length;
        
        score = 50 + (structureScore * 10);
        if (structureScore >= 3) {
          findings.push('Strong visual hierarchy with semantic HTML elements');
        } else if (structureScore >= 2) {
          findings.push('Moderate visual hierarchy - some semantic elements present');
          recommendations.push('Add more semantic HTML5 elements for clarity');
        } else {
          issues.push({ description: 'Weak visual hierarchy - missing semantic structure', severity: 'high' });
          recommendations.push('Implement semantic HTML5: header, nav, main, footer');
        }
        
        // Title and description clarity
        if (context.metadata?.description && context.metadata.description.length > 20) {
          score += 10;
          findings.push('Page has descriptive metadata');
        }
        break;

      case QXHeuristic.USER_FEELINGS_IMPACT:
        // Comprehensive user feelings analysis (Interaction + Accessibility)
        const altCoverage = context.accessibility?.altTextsCoverage || 0;
        const loadTime = context.performance?.loadTime || 0;
        const ariaLabels = context.accessibility?.ariaLabelsCount || 0;
        const focusableElements = context.accessibility?.focusableElementsCount || 0;
        
        score = 60; // Base
        
        // Accessibility impact on feelings (35% weight)
        if (altCoverage >= 90) {
          score += 20;
          findings.push('Excellent accessibility (90%+ alt coverage) creates inclusive, positive experience');
        } else if (altCoverage >= 70) {
          score += 12;
          findings.push('Good accessibility creates generally positive user feelings');
        } else if (altCoverage < 50) {
          score -= 15;
          issues.push({ description: 'Poor accessibility (<50% alt coverage) frustrates users with disabilities', severity: 'high' });
          recommendations.push('Improve alt text coverage to at least 80% for better accessibility');
        }
        
        // ARIA support impact
        if (ariaLabels > 5) {
          score += 8;
          findings.push('Strong ARIA labeling enhances screen reader experience');
        }
        
        // Performance impact on feelings (35% weight)
        if (loadTime < 1500) {
          score += 15;
          findings.push('Very fast load time (<1.5s) delights users');
        } else if (loadTime < 2500) {
          score += 8;
          findings.push('Fast load time enhances user satisfaction');
        } else if (loadTime > 4000) {
          score -= 20;
          issues.push({ description: 'Very slow load time (>4s) causes significant frustration', severity: 'critical' });
          recommendations.push('Optimize page load time - target under 2.5 seconds');
        } else if (loadTime > 3000) {
          score -= 12;
          issues.push({ description: 'Slow load time causes user frustration', severity: 'high' });
        }
        
        // Error visibility impact (15% weight)
        if (context.errorIndicators?.hasErrorMessages) {
          score -= 12;
          issues.push({ description: 'Visible errors reduce user confidence and satisfaction', severity: 'high' });
          recommendations.push('Review and fix visible error messages');
        }
        
        // Interaction capability (15% weight)
        if (focusableElements > 20) {
          score += 5;
          findings.push('Rich interactive elements provide user control and engagement');
        } else if (focusableElements < 5) {
          score -= 8;
          issues.push({ description: 'Limited interactivity may feel restrictive', severity: 'medium' });
        }
        
        score = Math.max(20, Math.min(100, score));
        break;

      case QXHeuristic.GUI_FLOW_IMPACT:
        const interactiveElements = context.domMetrics?.interactiveElements || 0;
        const forms = context.domMetrics?.forms || 0;
        
        if (interactiveElements > 20) {
          score = 75;
          findings.push(`${interactiveElements} interactive elements provide user control`);
        }
        if (forms > 0) {
          findings.push(`${forms} forms impact user input flows`);
          score = Math.min(100, score + 10);
        }
        if (interactiveElements === 0) {
          score = 30;
          issues.push({ description: 'Limited user interaction capability', severity: 'high' });
        }
        break;

      case QXHeuristic.CROSS_FUNCTIONAL_IMPACT:
        score = 70;
        if (context.accessibility && (context.accessibility.altTextsCoverage || 0) < 100) {
          findings.push('Content team needed for alt text creation');
        }
        if (context.performance && (context.performance.loadTime || 0) > 2000) {
          findings.push('Engineering team needed for performance optimization');
        }
        if (problemAnalysis.complexity === 'complex') {
          findings.push('QA team needed for comprehensive testing');
        }
        score = 70 + (findings.length * 5);
        break;

      case QXHeuristic.DATA_DEPENDENT_IMPACT:
        if (context.domMetrics?.forms && context.domMetrics.forms > 0) {
          score = 75;
          findings.push(`${context.domMetrics.forms} forms depend on backend data processing`);
        } else {
          score = 50;
          findings.push('Limited data-dependent features');
        }
        break;

      case QXHeuristic.PROBLEM_UNDERSTANDING:
        score = problemAnalysis.clarityScore;
        if (problemAnalysis.clarityScore > 80) {
          findings.push('Problem is well-defined');
        } else {
          issues.push({ description: 'Problem clarity needs improvement', severity: 'medium' });
        }
        findings.push(...problemAnalysis.breakdown);
        break;

      case QXHeuristic.RULE_OF_THREE:
        score = problemAnalysis.potentialFailures.length >= 3 ? 85 : 60;
        findings.push(`${problemAnalysis.potentialFailures.length} potential failure modes identified`);
        if (problemAnalysis.potentialFailures.length < 3) {
          recommendations.push('Identify at least 3 potential failure modes');
        }
        break;

      case QXHeuristic.PROBLEM_COMPLEXITY:
        score = problemAnalysis.complexity === 'simple' ? 90 : 
                problemAnalysis.complexity === 'moderate' ? 75 : 60;
        findings.push(`Problem complexity: ${problemAnalysis.complexity}`);
        break;

      case QXHeuristic.USER_NEEDS_IDENTIFICATION:
        score = userNeeds.alignmentScore;
        findings.push(`${userNeeds.needs.length} user needs identified`);
        const mustHave = userNeeds.needs.filter(n => n.priority === 'must-have').length;
        findings.push(`${mustHave} must-have features`);
        if (userNeeds.challenges.length > 0) {
          issues.push({ description: `${userNeeds.challenges.length} user need challenges found`, severity: 'medium' });
        }
        break;

      case QXHeuristic.USER_NEEDS_SUITABILITY:
        score = userNeeds.suitability === 'excellent' ? 95 :
                userNeeds.suitability === 'good' ? 80 :
                userNeeds.suitability === 'adequate' ? 65 : 45;
        findings.push(`User needs suitability: ${userNeeds.suitability}`);
        break;

      case QXHeuristic.USER_NEEDS_VALIDATION:
        const addressedNeeds = userNeeds.needs.filter(n => n.addressed).length;
        score = userNeeds.needs.length > 0 ? (addressedNeeds / userNeeds.needs.length) * 100 : 50;
        findings.push(`${addressedNeeds}/${userNeeds.needs.length} needs validated and addressed`);
        break;

      case QXHeuristic.BUSINESS_NEEDS_IDENTIFICATION:
        score = businessNeeds.alignmentScore;
        findings.push(`Primary goal: ${businessNeeds.primaryGoal}`);
        findings.push(`${businessNeeds.kpisAffected.length} KPIs affected`);
        findings.push(`${businessNeeds.crossTeamImpact.length} cross-team impacts`);
        break;

      case QXHeuristic.USER_VS_BUSINESS_BALANCE:
        const balanceScore = 100 - Math.abs(userNeeds.alignmentScore - businessNeeds.alignmentScore);
        score = balanceScore;
        if (balanceScore > 80) {
          findings.push('Good balance between user and business needs');
        } else {
          issues.push({ description: 'Imbalance between user and business priorities', severity: 'medium' });
          recommendations.push('Align user and business objectives more closely');
        }
        break;

      case QXHeuristic.KPI_IMPACT_ANALYSIS:
        score = businessNeeds.impactsKPIs ? 85 : 50;
        findings.push(`KPIs impacted: ${businessNeeds.kpisAffected.join(', ')}`);
        if (businessNeeds.compromisesUX) {
          issues.push({ description: 'Business ease compromises user experience', severity: 'high' });
          score -= 20;
        }
        break;

      case QXHeuristic.ORACLE_PROBLEM_DETECTION:
        // This is handled separately, score based on whether we can detect issues
        score = 75;
        findings.push('Oracle problem detection capability active');
        break;

      case QXHeuristic.WHAT_MUST_NOT_CHANGE:
        score = 80;
        if (context.domMetrics?.semanticStructure?.hasMain) {
          findings.push('Main content structure is immutable');
        }
        if (context.accessibility && (context.accessibility.focusableElementsCount || 0) > 0) {
          findings.push('Keyboard navigation support must be maintained');
        }
        break;

      case QXHeuristic.SUPPORTING_DATA_ANALYSIS:
        score = 75;
        const hasData = (context.domMetrics?.forms || 0) > 0 || (context.domMetrics?.interactiveElements || 0) > 20;
        if (hasData) {
          score = 82;
          findings.push('Sufficient data points for informed decision-making');
        } else {
          score = 60;
          issues.push({ description: 'Limited data for comprehensive analysis', severity: 'medium' });
          recommendations.push('Collect more user interaction data');
        }
        break;

      case QXHeuristic.COMPETITIVE_ANALYSIS:
        score = 70; // Baseline - actual comparison would need competitor data
        findings.push('Competitive analysis capability available');
        if (context.domMetrics?.semanticStructure?.hasNav && context.domMetrics?.interactiveElements && context.domMetrics.interactiveElements > 15) {
          score = 78;
          findings.push('Navigation and interaction patterns follow industry standards');
        } else {
          recommendations.push('Compare interaction patterns with leading competitors');
        }
        break;

      case QXHeuristic.DOMAIN_INSPIRATION:
        score = 72;
        const hasModernElements = context.accessibility && (context.accessibility.ariaLabelsCount || 0) > 0;
        if (hasModernElements) {
          score = 80;
          findings.push('Modern accessibility patterns show domain inspiration');
        } else {
          recommendations.push('Research domain-specific design patterns and best practices');
        }
        break;

      case QXHeuristic.INNOVATIVE_SOLUTIONS:
        score = 65; // Most sites are conventional
        const hasAdvancedFeatures = (context.accessibility?.landmarkRoles || 0) > 3;
        if (hasAdvancedFeatures) {
          score = 75;
          findings.push('Advanced accessibility features show innovative thinking');
        } else {
          recommendations.push('Explore innovative UX patterns to differentiate experience');
        }
        break;

      case QXHeuristic.COUNTER_INTUITIVE_DESIGN:
        score = 85; // High score means few counter-intuitive elements (good)
        const confusingNav = !context.domMetrics?.semanticStructure?.hasNav && (context.domMetrics?.interactiveElements || 0) > 10;
        const poorStructure = !context.domMetrics?.semanticStructure?.hasHeader && !context.domMetrics?.semanticStructure?.hasFooter;
        
        if (confusingNav) {
          score = 45;
          issues.push({ description: 'Navigation structure may be counter-intuitive', severity: 'high' });
          recommendations.push('Add semantic navigation elements');
        }
        if (poorStructure) {
          score -= 15;
          issues.push({ description: 'Page structure lacks expected header/footer', severity: 'medium' });
        }
        if (score > 75) {
          findings.push('No counter-intuitive design patterns detected');
        }
        break;

      case QXHeuristic.SUPPORTING_DATA_ANALYSIS:
        score = 70;
        if (context.performance) findings.push('Performance data available');
        if (context.accessibility) findings.push('Accessibility metrics available');
        if (context.domMetrics) findings.push('DOM structure data available');
        score = 60 + (findings.length * 10);
        break;

      case QXHeuristic.COMPETITIVE_ANALYSIS:
        score = 65;
        findings.push('Competitive analysis capability available');
        recommendations.push('Compare with competitor sites for benchmarking');
        break;

      case QXHeuristic.DOMAIN_INSPIRATION:
        score = 70;
        findings.push('Consider best practices from similar domains');
        break;

      case QXHeuristic.INNOVATIVE_SOLUTIONS:
        score = 68;
        findings.push('Opportunity for innovative UX solutions');
        break;

      case QXHeuristic.COUNTER_INTUITIVE_DESIGN:
        score = 75;
        findings.push('No counter-intuitive design patterns detected');
        break;

      default:
        // Generic heuristic evaluation based on category
        if (category === 'user-needs') {
          score = userNeeds.alignmentScore;
        } else if (category === 'business-needs') {
          score = businessNeeds.alignmentScore;
        } else if (category === 'problem') {
          score = problemAnalysis.clarityScore;
        }
        break;
    }

    return {
      name: heuristic,
      heuristicType: heuristic,
      category,
      applied: true,
      score: Math.min(100, Math.max(0, score)),
      findings,
      issues,
      recommendations
    };
  }

  private getHeuristicCategory(heuristic: QXHeuristic): 'problem' | 'user-needs' | 'business-needs' | 'balance' | 'impact' | 'creativity' | 'design' {
    if (heuristic.includes('problem')) return 'problem';
    if (heuristic.includes('user')) return 'user-needs';
    if (heuristic.includes('business')) return 'business-needs';
    if (heuristic.includes('oracle') || heuristic.includes('balance')) return 'balance';
    if (heuristic.includes('impact')) return 'impact';
    if (heuristic.includes('competitive') || heuristic.includes('inspiration')) return 'creativity';
    return 'design';
  }
}

/**
 * Oracle Problem Detector
 */
class OracleDetector {
  constructor(private minSeverity: 'low' | 'medium' | 'high' | 'critical') {}

  detect(
    context: QXContext,
    userNeeds: UserNeedsAnalysis,
    businessNeeds: BusinessNeedsAnalysis
  ): OracleProblem[] {
    const problems: OracleProblem[] = [];

    // Check for user vs business conflicts
    if (Math.abs(userNeeds.alignmentScore - businessNeeds.alignmentScore) > 20) {
      problems.push({
        type: 'user-vs-business',
        description: 'Significant gap between user needs and business objectives',
        severity: 'high',
        stakeholders: ['Users', 'Business'],
        resolutionApproach: [
          'Gather supporting data from both perspectives',
          'Facilitate discussion between stakeholders',
          'Find compromise solutions that address both needs'
        ]
      });
    }

    // Check for missing information
    if (userNeeds.challenges.length > 0 || businessNeeds.compromisesUX) {
      problems.push({
        type: 'unclear-criteria',
        description: 'Quality criteria unclear due to conflicting information',
        severity: 'medium',
        missingInfo: userNeeds.challenges,
        resolutionApproach: [
          'Collect missing information from stakeholders',
          'Define clear acceptance criteria'
        ]
      });
    }

    // ENHANCED: Detect contextual oracle problems even for well-built sites
    const titleLower = (context.title || '').toLowerCase();
    const descLower = (context.metadata?.description || '').toLowerCase();

    // E-commerce/Travel booking: Conversion vs UX quality
    if (titleLower.includes('hotel') || titleLower.includes('booking') || titleLower.includes('travel') ||
        titleLower.includes('shop') || titleLower.includes('store') || descLower.includes('book')) {

      if (businessNeeds.kpisAffected.some(k => k.toLowerCase().includes('conversion') || k.toLowerCase().includes('engagement'))) {
        problems.push({
          type: 'user-vs-business',
          description: 'Potential conflict between conversion optimization (business) and user experience quality (user trust)',
          severity: 'medium',
          stakeholders: ['Marketing', 'Product', 'Users'],
          resolutionApproach: [
            'A/B test aggressive vs. subtle conversion tactics',
            'Measure both conversion rate and user satisfaction metrics',
            'Balance urgency messaging with transparent communication'
          ]
        });
      }

      // Price transparency oracle
      problems.push({
        type: 'unclear-criteria',
        description: 'Unclear criteria for price display timing - when to show fees, taxes, and final price',
        severity: 'medium',
        stakeholders: ['Users', 'Legal', 'Business'],
        resolutionApproach: [
          'Define regulatory compliance requirements for price display',
          'Balance business desire for competitive base pricing vs user need for full price transparency',
          'Establish clear standards for fee disclosure timing'
        ]
      });
    }

    // Content sites: Quality vs. Quantity
    if (titleLower.includes('blog') || titleLower.includes('article') || titleLower.includes('news') ||
        titleLower.includes('magazine') || titleLower.includes('testing')) {

      problems.push({
        type: 'user-vs-business',
        description: 'Content depth (user need) vs. publication frequency (business engagement goals) trade-off',
        severity: 'low',
        stakeholders: ['Readers', 'Content Team', 'Editorial'],
        resolutionApproach: [
          'Define content quality standards and acceptance criteria',
          'Balance editorial calendar with quality thresholds',
          'Consider mix of in-depth and quick-read content formats'
        ]
      });
    }

    // Complex sites: Technical constraints
    if ((context.domMetrics?.totalElements || 0) > 500 || (context.domMetrics?.interactiveElements || 0) > 50) {
      problems.push({
        type: 'technical-constraint',
        description: 'Platform technical limitations may restrict advanced UX features or accessibility enhancements',
        severity: 'low',
        stakeholders: ['Development', 'Product', 'Users'],
        resolutionApproach: [
          'Evaluate platform capabilities and constraints',
          'Prioritize features based on user impact vs. implementation complexity',
          'Consider gradual enhancement approach'
        ]
      });
    }

    return problems.filter(p => this.meetsMinimumSeverity(p.severity));
  }

  private meetsMinimumSeverity(severity: string): boolean {
    const severityLevels = ['low', 'medium', 'high', 'critical'];
    const minIndex = severityLevels.indexOf(this.minSeverity);
    const currentIndex = severityLevels.indexOf(severity);
    return currentIndex >= minIndex;
  }
}

/**
 * Impact Analyzer
 */
class ImpactAnalyzer {
  async analyze(context: QXContext, problemAnalysis: ProblemAnalysis): Promise<ImpactAnalysis> {
    const guiFlowEndUser: string[] = [];
    const guiFlowInternal: string[] = [];
    const userFeelings: string[] = [];
    const performance: string[] = [];
    const security: string[] = [];
    const immutableRequirements: string[] = [];

    // Analyze visible impacts
    const interactiveElements = context.domMetrics?.interactiveElements || 0;
    const forms = context.domMetrics?.forms || 0;
    
    if (interactiveElements > 0) {
      guiFlowEndUser.push(`${interactiveElements} interactive elements affect user journey`);
    }
    if (forms > 0) {
      guiFlowEndUser.push(`${forms} forms impact user input flows`);
    }
    
    // User feelings based on quality metrics
    const altCoverage = context.accessibility?.altTextsCoverage || 0;
    if (altCoverage > 80) {
      userFeelings.push('Positive - Good accessibility creates inclusive experience');
    } else if (altCoverage < 50) {
      userFeelings.push('Frustrated - Poor accessibility excludes some users');
    }

    const loadTime = context.performance?.loadTime || 0;
    if (loadTime > 3000) {
      userFeelings.push('Impatient - Slow load time causes frustration');
    } else if (loadTime < 2000) {
      userFeelings.push('Satisfied - Fast load time enhances experience');
    }

    if (context.errorIndicators?.hasErrorMessages) {
      userFeelings.push('Confused - Visible errors reduce confidence');
    }

    // Analyze invisible impacts
    if (loadTime > 2000) {
      performance.push(`Load time ${loadTime}ms impacts user retention`);
    }
    if (!context.metadata?.viewport) {
      performance.push('Missing viewport tag affects mobile performance');
    }

    // Immutable requirements
    if (context.domMetrics?.semanticStructure?.hasMain) {
      immutableRequirements.push('Must maintain main content accessibility');
    }
    if (context.accessibility && (context.accessibility.focusableElementsCount || 0) > 0) {
      immutableRequirements.push('Must support keyboard navigation');
    }
    if (problemAnalysis.complexity === 'complex') {
      immutableRequirements.push('Must maintain system stability with complex interactions');
    }

    // Calculate impact scores
    let visibleScore = 50;
    if (guiFlowEndUser.length > 0) visibleScore += 15;
    if (userFeelings.some(f => f.includes('Positive') || f.includes('Satisfied'))) visibleScore += 20;
    if (userFeelings.some(f => f.includes('Frustrated') || f.includes('Confused'))) visibleScore -= 15;
    visibleScore = Math.max(0, Math.min(100, visibleScore));

    let invisibleScore = 50;
    if (performance.length === 0) invisibleScore += 20;
    if (security.length === 0) invisibleScore += 10;
    invisibleScore = Math.max(0, Math.min(100, invisibleScore));

    const overallImpactScore = Math.round((visibleScore + invisibleScore) / 2);

    return {
      visible: {
        guiFlow: {
          forEndUser: guiFlowEndUser,
          forInternalUser: guiFlowInternal
        },
        userFeelings,
        score: visibleScore
      },
      invisible: {
        performance,
        security,
        score: invisibleScore
      },
      immutableRequirements,
      overallImpactScore
    };
  }

  /**
   * Extract domain-specific metrics for Nightly-Learner
   * Provides rich Quality Experience (QX) metrics for pattern learning
   */
  protected extractTaskMetrics(result: FlexibleTaskResult): Record<string, number> {
    const metrics: Record<string, number> = {};

    if (result && typeof result === 'object') {
      const r = result as Record<string, unknown>;
      // Overall QX scores
      if (typeof r.overallImpactScore === 'number') {
        metrics.overall_impact_score = r.overallImpactScore;
      }

      // Visible quality metrics
      const visible = r.visible as Record<string, unknown> | undefined;
      if (visible) {
        metrics.visible_score = (visible.score as number) || 0;
        const accessibility = visible.accessibility as Record<string, unknown> | undefined;
        if (accessibility) {
          metrics.accessibility_score = (accessibility.score as number) || 0;
          metrics.wcag_violations = (accessibility.violations as unknown[] | undefined)?.length || 0;
        }
        const usability = visible.usability as Record<string, unknown> | undefined;
        if (usability) {
          metrics.usability_score = (usability.score as number) || 0;
          metrics.usability_issues = (usability.issues as unknown[] | undefined)?.length || 0;
        }
        const userFeelings = visible.userFeelings as Record<string, unknown> | undefined;
        if (userFeelings) {
          metrics.user_satisfaction = (userFeelings.satisfaction as number) || 0;
          metrics.frustration_points = (userFeelings.frustrationPoints as unknown[] | undefined)?.length || 0;
        }
      }

      // Invisible quality metrics
      const invisible = r.invisible as Record<string, unknown> | undefined;
      if (invisible) {
        metrics.invisible_score = (invisible.score as number) || 0;
        const performance = invisible.performance as Record<string, unknown> | undefined;
        if (performance) {
          metrics.performance_score = (performance.score as number) || 0;
          metrics.load_time = (performance.loadTime as number) || 0;
        }
        const security = invisible.security as Record<string, unknown> | undefined;
        if (security) {
          metrics.security_score = (security.score as number) || 0;
          metrics.security_risks = (security.risks as unknown[] | undefined)?.length || 0;
        }
      }

      // Stakeholder analysis
      const stakeholders = r.stakeholders as StakeholderFeedback[] | undefined;
      if (stakeholders && Array.isArray(stakeholders)) {
        metrics.stakeholders_analyzed = stakeholders.length;
        metrics.stakeholder_satisfaction_avg = stakeholders.reduce(
          (sum: number, s: StakeholderFeedback) => sum + (s.satisfaction || 0), 0
        ) / Math.max(stakeholders.length, 1);
      }

      // Immutable requirements
      const immutableRequirements = r.immutableRequirements as ImmutableRequirement[] | undefined;
      if (immutableRequirements && Array.isArray(immutableRequirements)) {
        metrics.immutable_requirements = immutableRequirements.length;
        metrics.requirements_met = immutableRequirements.filter((req: ImmutableRequirement) => req.met).length;
      }
    }

    return metrics;
  }
}
