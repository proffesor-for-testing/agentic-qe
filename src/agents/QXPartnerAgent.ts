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
import { EventEmitter } from 'events';
import { chromium, Browser, Page } from 'playwright';
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

// Simple logger interface
interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

class ConsoleLogger implements Logger {
  info(message: string, ...args: unknown[]): void {
    console.log(`[INFO] ${message}`, ...args);
  }
  warn(message: string, ...args: unknown[]): void {
    console.warn(`[WARN] ${message}`, ...args);
  }
  error(message: string, ...args: unknown[]): void {
    console.error(`[ERROR] ${message}`, ...args);
  }
  debug(message: string, ...args: unknown[]): void {
    console.debug(`[DEBUG] ${message}`, ...args);
  }
}

export class QXPartnerAgent extends BaseAgent {
  private readonly config: QXPartnerConfig;
  protected readonly logger: Logger = new ConsoleLogger();
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

    // 5. Detect oracle problems
    const oracleProblems = this.config.detectOracleProblems 
      ? await this.detectOracleProblemsFromContext(context, userNeeds, businessNeeds)
      : [];

    // 6. Perform impact analysis
    const impactAnalysis = await this.analyzeImpact(context, problemAnalysis);

    // 7. Apply heuristics
    const heuristics = await this.applyAllHeuristics(context, problemAnalysis, userNeeds, businessNeeds);

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

    return analysis;
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
    businessNeeds: BusinessNeedsAnalysis
  ): Promise<QXHeuristicResult[]> {
    if (!this.heuristicsEngine) {
      throw new Error('Heuristics engine not initialized');
    }

    return this.heuristicsEngine.applyAll(context, problemAnalysis, userNeeds, businessNeeds);
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

  private formatHeuristicName(heuristic: string): string {
    return heuristic
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Calculate overall QX score
   */
  private calculateOverallQXScore(
    problemAnalysis: ProblemAnalysis,
    userNeeds: UserNeedsAnalysis,
    businessNeeds: BusinessNeedsAnalysis,
    impactAnalysis: ImpactAnalysis,
    heuristics: QXHeuristicResult[]
  ): number {
    // Weighted average of all components
    const weights = {
      problem: 0.20,
      userNeeds: 0.25,
      businessNeeds: 0.20,
      impact: 0.15,
      heuristics: 0.20
    };

    const heuristicsAvg = heuristics.length > 0
      ? heuristics.reduce((sum, h) => sum + h.score, 0) / heuristics.length
      : 70;

    const impactScore = Math.max(0, 100 - impactAnalysis.overallImpactScore);

    const score =
      problemAnalysis.clarityScore * weights.problem +
      userNeeds.alignmentScore * weights.userNeeds +
      businessNeeds.alignmentScore * weights.businessNeeds +
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
      await this.storeSharedMemory(QEAgentType.QX_PARTNER, 'oracle-patterns', patterns);
    }
  }

  private async saveHeuristicsInsights(): Promise<void> {
    // Save heuristics insights for other agents
    const insights = await this.retrieveMemory('heuristics-knowledge');
    if (insights) {
      await this.storeSharedMemory(QEAgentType.QX_PARTNER, 'heuristics-insights', insights);
    }
  }

  private async shareCollaborationInsights(): Promise<void> {
    if (this.config.collaboration?.shareWithQualityAnalyzer) {
      const qxInsights = await this.retrieveMemory('qx-state');
      if (qxInsights) {
        await this.storeSharedMemory(QEAgentType.QUALITY_ANALYZER, 'qx-insights', qxInsights);
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
}
