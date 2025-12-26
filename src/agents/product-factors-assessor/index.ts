/**
 * Product Factors Assessment Agent
 *
 * An intelligent assessment agent that analyzes user stories and technical architecture
 * to generate comprehensive test ideas based on the Product Factors (SFDIPOT) framework
 * from James Bach's Heuristic Test Strategy Model (HTSM).
 */

import { DocumentParser, documentParser } from './parsers/document-parser';
import { HTSMAnalyzer, htsmAnalyzer } from './analyzers/htsm-analyzer';
import { TestCaseGenerator, testCaseGenerator } from './generators/test-case-generator';
import { GherkinFormatter, gherkinFormatter } from './formatters/gherkin-formatter';
import {
  UserStory,
  Epic,
  FunctionalSpec,
  TechnicalArchitecture,
  TestCase,
  TestSuite,
  HTSMCategory,
  HTSMAnalysisResult,
  TestableElement,
} from './types/htsm.types';

export interface ProductFactorsAssessmentInput {
  userStories?: string | UserStory[];
  epics?: string | Epic[];
  functionalSpecs?: string | FunctionalSpec[];
  architecture?: string | TechnicalArchitecture;
  outputFormat?: 'gherkin' | 'json' | 'markdown' | 'html' | 'all';
  includeCategories?: HTSMCategory[];
  /** Name/title for the assessment (e.g., "Epic3-Premium-Membership") */
  assessmentName?: string;
}

export interface ProductFactorsAssessmentOutput {
  testSuite: TestSuite;
  gherkinFeatures?: Map<string, string>;
  jsonOutput?: string;
  markdownOutput?: string;
  htmlOutput?: string;
  htsmAnalysis: Map<HTSMCategory, HTSMAnalysisResult>;
  testableElements: TestableElement[];
  summary: {
    totalTests: number;
    byCategory: Record<HTSMCategory, number>;
    byPriority: Record<string, number>;
    coverageScore: number;
    traceabilityScore: number;
  };
  /** Assessment name for output file naming */
  assessmentName: string;
}

export class ProductFactorsAssessment {
  private parser: DocumentParser;
  private analyzer: HTSMAnalyzer;
  private generator: TestCaseGenerator;
  private formatter: GherkinFormatter;

  constructor() {
    this.parser = documentParser;
    this.analyzer = htsmAnalyzer;
    this.generator = testCaseGenerator;
    this.formatter = gherkinFormatter;
  }

  /**
   * Main entry point - generate Product Factors assessment from input documents
   */
  async assess(input: ProductFactorsAssessmentInput): Promise<ProductFactorsAssessmentOutput> {
    // Phase 1: Parse documents
    const userStories = this.parseUserStories(input.userStories);
    const specs = this.parseFunctionalSpecs(input.functionalSpecs);
    const architecture = this.parseArchitecture(input.architecture);

    // Phase 2: Extract testable elements
    const testableElements = this.parser.extractTestableElements(
      userStories,
      specs,
      architecture
    );

    // Phase 3: Perform HTSM analysis
    const htsmAnalysis = this.analyzer.analyzeAll(
      testableElements,
      userStories,
      specs,
      architecture
    );

    // Filter by requested categories if specified
    if (input.includeCategories && input.includeCategories.length > 0) {
      const filteredAnalysis = new Map<HTSMCategory, HTSMAnalysisResult>();
      input.includeCategories.forEach((cat) => {
        const result = htsmAnalysis.get(cat);
        if (result) filteredAnalysis.set(cat, result);
      });
    }

    // Phase 4: Generate test cases
    const testCases = this.generator.generateFromAnalysis(htsmAnalysis, userStories);

    // Phase 5: Create test suite
    const testSuite = this.generator.createTestSuite(
      `Product Factors (SFDIPOT) based Test Ideas - ${new Date().toISOString().split('T')[0]}`,
      testCases,
      userStories
    );

    // Determine assessment name from input or generate from context
    const assessmentName = input.assessmentName || this.generateAssessmentName(userStories);

    // Phase 6: Format outputs
    const output: ProductFactorsAssessmentOutput = {
      testSuite,
      htsmAnalysis,
      testableElements,
      summary: this.createSummary(testCases, testSuite),
      assessmentName,
    };

    const format = input.outputFormat || 'all';

    if (format === 'gherkin' || format === 'all') {
      output.gherkinFeatures = this.formatter.formatTestSuite(testSuite, userStories);
    }

    if (format === 'json' || format === 'all') {
      output.jsonOutput = JSON.stringify(testSuite, null, 2);
    }

    if (format === 'markdown' || format === 'all') {
      output.markdownOutput = this.formatAsMarkdown(testSuite, htsmAnalysis, userStories, assessmentName);
    }

    if (format === 'html' || format === 'all') {
      output.htmlOutput = this.formatAsHTML(testSuite, htsmAnalysis, userStories, assessmentName);
    }

    return output;
  }

  /**
   * Generate assessment name from user stories context
   */
  private generateAssessmentName(userStories: UserStory[]): string {
    if (userStories.length === 0) return 'Assessment';

    // Try to extract epic name from first story
    const firstStory = userStories[0];
    if (firstStory.epicId) {
      // Convert to kebab-case title
      const epicPart = firstStory.epicId.replace(/[^a-zA-Z0-9]+/g, '-');
      return epicPart;
    }

    // Fall back to first story title
    const titlePart = firstStory.title
      .replace(/[^a-zA-Z0-9\s]+/g, '')
      .split(/\s+/)
      .slice(0, 4)
      .join('-');
    return titlePart || 'Assessment';
  }

  /**
   * Parse user stories from string or array
   */
  private parseUserStories(input?: string | UserStory[]): UserStory[] {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    return this.parser.parseUserStories(input);
  }

  /**
   * Parse functional specs from string or array
   */
  private parseFunctionalSpecs(input?: string | FunctionalSpec[]): FunctionalSpec[] {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    return [this.parser.parseFunctionalSpec(input)];
  }

  /**
   * Parse architecture from string or object
   */
  private parseArchitecture(input?: string | TechnicalArchitecture): TechnicalArchitecture | undefined {
    if (!input) return undefined;
    if (typeof input === 'object') return input;
    return this.parser.parseTechnicalArchitecture(input);
  }

  /**
   * Create summary statistics
   */
  private createSummary(
    testCases: TestCase[],
    testSuite: TestSuite
  ): ProductFactorsAssessmentOutput['summary'] {
    const byCategory: Record<HTSMCategory, number> = {
      STRUCTURE: 0,
      FUNCTION: 0,
      DATA: 0,
      INTERFACES: 0,
      PLATFORM: 0,
      OPERATIONS: 0,
      TIME: 0,
    };

    const byPriority: Record<string, number> = {
      P0: 0,
      P1: 0,
      P2: 0,
      P3: 0,
    };

    testCases.forEach((tc) => {
      byCategory[tc.htsm.primary.category]++;
      byPriority[tc.priority]++;
    });

    return {
      totalTests: testCases.length,
      byCategory,
      byPriority,
      coverageScore: testSuite.htsmCoverage.overall,
      traceabilityScore: testSuite.traceabilityMatrix.coverage,
    };
  }

  /**
   * Determine automation fitness for a test case based on its characteristics
   */
  private determineAutomationFitness(testCase: TestCase): string {
    const subcategory = testCase.htsm.primary.subcategory;
    const category = testCase.htsm.primary.category;
    const name = testCase.name.toLowerCase();

    // API-level automation candidates
    const apiAutomationSubcategories = [
      'ApiSdk', 'SystemInterfaces', 'InputOutput', 'InvalidNoise',
      'ErrorHandling', 'Calculation', 'SecurityRelated', 'Lifecycle'
    ];
    if (apiAutomationSubcategories.includes(subcategory)) {
      if (name.includes('api') || name.includes('endpoint') || name.includes('data flow')) {
        return 'Automate on API level';
      }
      if (name.includes('rejection') || name.includes('validation') || name.includes('processing')) {
        return 'Automate on API level';
      }
    }

    // E2E automation candidates
    const e2eAutomationSubcategories = [
      'UserInterfaces', 'BusinessRules', 'StateTransitions', 'Interactions'
    ];
    if (e2eAutomationSubcategories.includes(subcategory)) {
      if (name.includes('form') || name.includes('button') || name.includes('displayed') ||
          name.includes('checkout') || name.includes('registration') || name.includes('login')) {
        return 'Automate on E2E level';
      }
    }

    // Visual/UI check candidates
    if (subcategory === 'UserInterfaces') {
      if (name.includes('displayed') || name.includes('table') || name.includes('banner') ||
          name.includes('comparison') || name.includes('layout')) {
        return 'Automate on Visual level';
      }
    }

    // Integration test candidates
    if (subcategory === 'Code' || subcategory === 'Service') {
      if (name.includes('integrates') || name.includes('component') || name.includes('dependencies')) {
        return 'Automate on Integration level';
      }
      if (name.includes('health check') || name.includes('starts successfully')) {
        return 'Automate on Integration level';
      }
    }

    // Performance/load test candidates
    if (subcategory === 'ExtremeUse' || subcategory === 'ProductFootprint') {
      if (name.includes('load') || name.includes('volume') || name.includes('memory') ||
          name.includes('cpu') || name.includes('performance')) {
        return 'Automated Performance Tests';
      }
    }

    // Concurrency/timing test candidates
    if (subcategory === 'Concurrency' || subcategory === 'Pacing' || subcategory === 'InputOutputTiming') {
      if (name.includes('concurrent') || name.includes('race condition') || name.includes('timeout') ||
          name.includes('burst') || name.includes('delayed')) {
        return 'Automated Concurrency Tests';
      }
    }

    // Compatibility test candidates - specific types
    if (subcategory === 'ExternalSoftware' || subcategory === 'ExternalHardware') {
      // Browser compatibility
      if (name.includes('chrome') || name.includes('firefox') || name.includes('safari') ||
          name.includes('edge') || name.includes('browser')) {
        return 'Automated Browser Compatibility Test';
      }
      // Database compatibility
      if (name.includes('postgresql') || name.includes('mysql') || name.includes('mongodb') ||
          name.includes('redis') || name.includes('database') || name.includes('db')) {
        return 'Automated DB Compatibility Test';
      }
      // Device/OS compatibility
      if (name.includes('ios') || name.includes('android') || name.includes('mobile') ||
          name.includes('tablet') || name.includes('device') || name.includes('windows') ||
          name.includes('macos') || name.includes('linux')) {
        return 'Automated Device Compatibility Test';
      }
      // API/Service compatibility
      if (name.includes('stripe') || name.includes('api') || name.includes('integration') ||
          name.includes('third-party') || name.includes('external service')) {
        return 'Automated API Compatibility Test';
      }
      // Runtime/Platform compatibility
      if (name.includes('node') || name.includes('runtime') || name.includes('version')) {
        return 'Automated Platform Compatibility Test';
      }
      // Generic fallback
      return 'Automated Compatibility Test';
    }

    // Contract/schema validation
    if (subcategory === 'BigLittle' || subcategory === 'Cardinality') {
      if (name.includes('boundary') || name.includes('zero items') || name.includes('many items')) {
        return 'Automate on API level';
      }
    }

    // Security automation
    if (subcategory === 'DisfavoredUse') {
      if (name.includes('injection') || name.includes('xss') || name.includes('protection')) {
        return 'Automated Security Tests';
      }
    }

    // Human exploration required
    const humanExplorationSubcategories = [
      'CommonUse', 'UncommonUse', 'Users', 'Environment', 'Collateral'
    ];
    if (humanExplorationSubcategories.includes(subcategory)) {
      return 'Human testers must explore';
    }

    // Check for exploratory indicators in the test name
    if (name.includes('usability') || name.includes('user experience') || name.includes('intuitive') ||
        name.includes('clarity') || name.includes('workflow') || name.includes('journey') ||
        name.includes('functionality for')) {
      return 'Human testers must explore';
    }

    // Policy/compliance often needs human review
    if (name.includes('compliance') || name.includes('policy') || name.includes('gdpr') ||
        name.includes('privacy') || name.includes('consent') || name.includes('agreements')) {
      return 'Human testers must explore';
    }

    // Time-related data often needs contextual understanding
    if (subcategory === 'TimeRelatedData') {
      if (name.includes('expires') || name.includes('timeout')) {
        return 'Automate on API level';
      }
      return 'Human testers must explore';
    }

    // Default based on category
    const categoryDefaults: Record<string, string> = {
      STRUCTURE: 'Automate on Integration level',
      FUNCTION: 'Automate on E2E level',
      DATA: 'Automate on API level',
      INTERFACES: 'Automate on API level',
      PLATFORM: 'Automated Compatibility Test',
      OPERATIONS: 'Human testers must explore',
      TIME: 'Automated Concurrency Tests',
    };

    return categoryDefaults[category] || 'Human testers must explore';
  }

  /**
   * Generate contextual examples for each priority level based on test cases
   * Extracts meaningful examples from actual test case names for the Priority Legend
   */
  private generatePriorityExamples(testCases: TestCase[]): Record<string, string> {
    const examplesByPriority: Record<string, string[]> = {
      P0: [],
      P1: [],
      P2: [],
      P3: [],
    };

    // Keywords to extract meaningful concepts from test names
    const extractConcepts = (name: string): string[] => {
      const concepts: string[] = [];
      const nameLower = name.toLowerCase();

      // Security-related concepts
      if (nameLower.includes('xss') || nameLower.includes('injection')) concepts.push('XSS/injection protection');
      if (nameLower.includes('authentication') || nameLower.includes('auth')) concepts.push('authentication security');
      if (nameLower.includes('password') || nameLower.includes('credential')) concepts.push('credential handling');
      if (nameLower.includes('permission') || nameLower.includes('access control')) concepts.push('access control');
      if (nameLower.includes('encrypt') || nameLower.includes('security')) concepts.push('data security');

      // Payment/financial concepts
      if (nameLower.includes('payment') || nameLower.includes('billing')) concepts.push('payment processing');
      if (nameLower.includes('subscription') || nameLower.includes('renewal')) concepts.push('subscription management');
      if (nameLower.includes('refund') || nameLower.includes('chargeback')) concepts.push('refund handling');
      if (nameLower.includes('pricing') || nameLower.includes('tier')) concepts.push('pricing tiers');

      // Integration concepts
      if (nameLower.includes('api') || nameLower.includes('endpoint')) concepts.push('API integrations');
      if (nameLower.includes('webhook') || nameLower.includes('callback')) concepts.push('webhook handling');
      if (nameLower.includes('stripe') || nameLower.includes('gateway')) concepts.push('payment gateway');
      if (nameLower.includes('email') || nameLower.includes('notification')) concepts.push('email notifications');

      // Service/infrastructure concepts
      if (nameLower.includes('health check') || nameLower.includes('service start')) concepts.push('service health checks');
      if (nameLower.includes('integrates correctly')) concepts.push('service integrations');
      if (nameLower.includes('database') || nameLower.includes('db')) concepts.push('database operations');

      // User experience concepts
      if (nameLower.includes('form') || nameLower.includes('input')) concepts.push('form validation');
      if (nameLower.includes('display') || nameLower.includes('ui')) concepts.push('UI components');
      if (nameLower.includes('navigation') || nameLower.includes('menu')) concepts.push('navigation');
      if (nameLower.includes('responsive') || nameLower.includes('mobile')) concepts.push('responsive design');

      // Data concepts
      if (nameLower.includes('gdpr') || nameLower.includes('privacy')) concepts.push('GDPR compliance');
      if (nameLower.includes('export') || nameLower.includes('download')) concepts.push('data export');
      if (nameLower.includes('validation') || nameLower.includes('boundary')) concepts.push('data validation');

      // Community/engagement concepts
      if (nameLower.includes('comment') || nameLower.includes('reply')) concepts.push('commenting system');
      if (nameLower.includes('profile') || nameLower.includes('biography')) concepts.push('user profiles');
      if (nameLower.includes('follow') || nameLower.includes('subscriber')) concepts.push('follow/subscribe features');
      if (nameLower.includes('bookmark') || nameLower.includes('reading list')) concepts.push('bookmarks');
      if (nameLower.includes('leaderboard') || nameLower.includes('ranking')) concepts.push('leaderboards');
      if (nameLower.includes('contributor') || nameLower.includes('submission')) concepts.push('contributor portal');
      if (nameLower.includes('newsletter') || nameLower.includes('personalized')) concepts.push('personalized newsletters');
      if (nameLower.includes('calendar') || nameLower.includes('event')) concepts.push('events calendar');
      if (nameLower.includes('moderation') || nameLower.includes('spam')) concepts.push('content moderation');

      // Compatibility concepts
      if (nameLower.includes('browser') || nameLower.includes('chrome') || nameLower.includes('firefox')) concepts.push('browser compatibility');
      if (nameLower.includes('compatibility')) concepts.push('platform compatibility');

      // Performance concepts
      if (nameLower.includes('load') || nameLower.includes('performance')) concepts.push('performance testing');
      if (nameLower.includes('concurrent') || nameLower.includes('race')) concepts.push('concurrency handling');
      if (nameLower.includes('timeout') || nameLower.includes('retry')) concepts.push('timeout handling');

      return concepts;
    };

    // Process test cases and extract concepts by priority
    testCases.forEach(tc => {
      const concepts = extractConcepts(tc.name);
      if (concepts.length > 0) {
        examplesByPriority[tc.priority].push(...concepts);
      }
    });

    // Deduplicate and limit to top 3 examples per priority
    const result: Record<string, string> = {};
    Object.entries(examplesByPriority).forEach(([priority, concepts]) => {
      // Count occurrences and sort by frequency
      const counts = new Map<string, number>();
      concepts.forEach(c => counts.set(c, (counts.get(c) || 0) + 1));
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const topConcepts = sorted.slice(0, 3).map(([concept]) => concept);
      result[priority] = topConcepts.length > 0 ? topConcepts.join(', ') : 'Edge cases, minor variations';
    });

    return result;
  }

  /**
   * Extract contextual entities from user stories for dynamic question generation
   * This extracts features, actors, data types, integrations, and actions
   */
  private extractContextualEntities(userStories: UserStory[]): {
    features: string[];
    actors: string[];
    dataTypes: string[];
    integrations: string[];
    actions: string[];
    themes: string[];
  } {
    const allText = userStories.map(s =>
      `${s.title} ${s.asA} ${s.iWant} ${s.soThat} ${(s.acceptanceCriteria || []).join(' ')}`
    ).join(' ').toLowerCase();

    // Extract features (nouns that represent system capabilities)
    const featurePatterns: Record<string, string[]> = {
      'authentication': ['login', 'logout', 'sign in', 'sign up', 'register', 'password', 'credential', 'session', 'token'],
      'payment processing': ['payment', 'checkout', 'billing', 'invoice', 'charge', 'refund', 'transaction'],
      'subscription management': ['subscription', 'tier', 'plan', 'membership', 'upgrade', 'downgrade', 'renewal'],
      'user management': ['user', 'account', 'profile', 'settings', 'preferences'],
      'content management': ['content', 'article', 'post', 'media', 'document', 'file', 'upload'],
      'search functionality': ['search', 'filter', 'sort', 'query', 'find'],
      'notification system': ['notification', 'alert', 'email', 'sms', 'message', 'notify'],
      'reporting': ['report', 'analytics', 'dashboard', 'metrics', 'statistics'],
      'order management': ['order', 'cart', 'purchase', 'checkout', 'shipping'],
      'inventory': ['inventory', 'stock', 'product', 'catalog', 'item'],
      'data export/import': ['export', 'import', 'download', 'backup', 'migrate'],
      'access control': ['permission', 'role', 'access', 'authorize', 'restrict', 'paywall'],
      'scheduling': ['schedule', 'calendar', 'appointment', 'booking', 'reservation'],
      'messaging': ['chat', 'message', 'conversation', 'comment', 'reply'],
      'social features': ['share', 'like', 'follow', 'friend', 'connect'],
      'compliance': ['gdpr', 'privacy', 'consent', 'compliance', 'audit', 'retention'],
    };

    const features: string[] = [];
    Object.entries(featurePatterns).forEach(([feature, keywords]) => {
      if (keywords.some(kw => allText.includes(kw))) {
        features.push(feature);
      }
    });

    // Extract actors (user types)
    const actorPatterns: Record<string, string[]> = {
      'end user': ['user', 'customer', 'visitor', 'member', 'subscriber'],
      'administrator': ['admin', 'administrator', 'manager', 'moderator'],
      'developer': ['developer', 'api user', 'integrator'],
      'guest': ['guest', 'visitor', 'anonymous'],
      'enterprise user': ['enterprise', 'team', 'organization', 'business'],
    };

    const actors: string[] = [];
    Object.entries(actorPatterns).forEach(([actor, keywords]) => {
      if (keywords.some(kw => allText.includes(kw))) {
        actors.push(actor);
      }
    });

    // Extract data types
    const dataPatterns: Record<string, string[]> = {
      'user data': ['name', 'email', 'address', 'phone', 'profile'],
      'financial data': ['payment', 'card', 'bank', 'invoice', 'price', 'amount', 'currency'],
      'content data': ['article', 'document', 'file', 'image', 'video', 'media'],
      'transactional data': ['order', 'transaction', 'purchase', 'subscription'],
      'configuration data': ['settings', 'preferences', 'config', 'options'],
      'analytics data': ['metrics', 'statistics', 'logs', 'events', 'tracking'],
      'sensitive data': ['password', 'token', 'secret', 'credential', 'personal'],
    };

    const dataTypes: string[] = [];
    Object.entries(dataPatterns).forEach(([dataType, keywords]) => {
      if (keywords.some(kw => allText.includes(kw))) {
        dataTypes.push(dataType);
      }
    });

    // Extract third-party integrations
    const integrationPatterns: Record<string, string[]> = {
      'payment gateway': ['stripe', 'paypal', 'braintree', 'square', 'payment gateway'],
      'email service': ['sendgrid', 'mailchimp', 'ses', 'smtp', 'email service'],
      'authentication provider': ['oauth', 'saml', 'ldap', 'sso', 'auth0', 'okta'],
      'cloud storage': ['s3', 'azure blob', 'gcs', 'cloudinary', 'storage'],
      'analytics': ['google analytics', 'mixpanel', 'amplitude', 'segment'],
      'database': ['postgresql', 'mysql', 'mongodb', 'redis', 'database'],
      'search engine': ['elasticsearch', 'algolia', 'solr', 'search service'],
      'cdn': ['cloudflare', 'fastly', 'akamai', 'cdn'],
      'messaging': ['twilio', 'sms', 'push notification'],
    };

    const integrations: string[] = [];
    Object.entries(integrationPatterns).forEach(([integration, keywords]) => {
      if (keywords.some(kw => allText.includes(kw))) {
        integrations.push(integration);
      }
    });

    // Extract actions (verbs)
    const actionPatterns = [
      'create', 'read', 'update', 'delete', 'view', 'edit', 'save',
      'submit', 'send', 'receive', 'process', 'validate', 'verify',
      'approve', 'reject', 'cancel', 'confirm', 'notify', 'alert',
      'export', 'import', 'upload', 'download', 'share', 'publish',
      'search', 'filter', 'sort', 'paginate', 'navigate',
      'login', 'logout', 'register', 'authenticate', 'authorize',
      'purchase', 'checkout', 'pay', 'refund', 'subscribe', 'unsubscribe',
    ];

    const actions = actionPatterns.filter(action => allText.includes(action));

    // Generate themes summary
    const themes = features.length > 0 ? features.slice(0, 4) : ['general application functionality'];

    return { features, actors, dataTypes, integrations, actions, themes };
  }

  /**
   * Generate clarifying questions for missing or underrepresented subcategories
   * Questions are dynamically generated based on HTSM subcategory definitions
   * and contextual entities extracted from user stories.
   */
  private generateClarifyingQuestions(
    category: HTSMCategory,
    categoryTests: TestCase[],
    userStories: UserStory[]
  ): { preamble: string; questions: Array<{ subcategory: string; rationale: string; questions: string[] }> } {
    const result: { preamble: string; questions: Array<{ subcategory: string; rationale: string; questions: string[] }> } = {
      preamble: '',
      questions: []
    };

    // Extract contextual entities from user stories
    const context = this.extractContextualEntities(userStories);
    const themesText = context.themes.join(', ');

    // Generate contextual preamble
    result.preamble = `Since the user stories focus on **${themesText}**, the following subcategories have limited or no test coverage.`;

    // HTSM-based question templates with placeholders for contextual entities
    // Based on James Bach's HTSM v6.3 Product Factors definitions
    const subcategoryTemplates: Record<HTSMCategory, Record<string, {
      definition: string;  // HTSM definition
      rationale: (ctx: typeof context) => string;
      questions: (ctx: typeof context) => string[];
    }>> = {
      STRUCTURE: {
        Code: {
          definition: 'The code structures that constitute the product, from executables to individual routines.',
          rationale: (ctx) => `The user stories describe ${ctx.features.slice(0, 2).join(' and ') || 'features'} but don't specify the underlying code structure. Understanding dependencies helps identify integration risks.`,
          questions: (ctx) => [
            `What third-party libraries and their versions are used for ${ctx.features[0] || 'core functionality'}?`,
            `Are there shared modules that multiple features depend on? Breaking changes could affect ${ctx.features.slice(0, 2).join(', ') || 'the system'}.`,
            `What database schemas store ${ctx.dataTypes.slice(0, 2).join(' and ') || 'application data'}? Schema changes could break existing functionality.`,
          ],
        },
        Hardware: {
          definition: 'Any hardware component that is integral to the product.',
          rationale: (ctx) => `The user stories mention ${ctx.features[0] || 'functionality'} but don't specify device requirements. Modern flows often involve hardware features.`,
          questions: (ctx) => [
            `Should ${ctx.features[0] || 'the application'} support biometric authentication (Face ID/Touch ID) on mobile devices?`,
            `Does ${ctx.actions.includes('upload') ? 'file upload' : 'any feature'} require camera or other hardware access?`,
            `Should we test ${ctx.features[0] || 'core flows'} on devices without specific hardware capabilities?`,
          ],
        },
        Service: {
          definition: 'Any server or process running independently of others that may constitute the product.',
          rationale: (ctx) => `The user stories don't specify the service architecture. Understanding service boundaries helps identify deployment and scaling requirements.`,
          questions: (ctx) => [
            `What services/microservices handle ${ctx.features[0] || 'core functionality'}? How do they communicate?`,
            `Are there background jobs or workers for ${ctx.actions.includes('process') || ctx.actions.includes('send') ? 'processing and notifications' : 'async operations'}?`,
            `What is the service discovery and health check mechanism?`,
          ],
        },
        NonExecutable: {
          definition: 'Any files other than multimedia or programs, like text files, sample data, or help files.',
          rationale: (ctx) => `${ctx.features[0] || 'The application'} likely requires configuration files. Missing config can cause production failures.`,
          questions: (ctx) => [
            `What environment variables configure ${ctx.integrations[0] || 'external services'}? Are there separate configs for test/production?`,
            `Are there feature flags controlling ${ctx.features[0] || 'feature'} behavior or access levels?`,
            `What static assets (images, icons, templates) need testing across locales?`,
          ],
        },
        Collateral: {
          definition: 'Anything beyond that is also part of the product, such as paper documents, web pages, packaging, license agreements, etc.',
          rationale: (ctx) => `${ctx.features.slice(0, 2).join(' and ') || 'Features'} require clear user documentation. Incorrect help content could lead to support tickets${ctx.features.includes('compliance') ? ' or compliance issues' : ''}.`,
          questions: (ctx) => [
            `Is there help documentation explaining ${ctx.features[0] || 'core features'} and related policies?`,
            `Are tooltips and explanations accurate and ${ctx.features.includes('compliance') ? 'legally reviewed' : 'user-friendly'}?`,
            `Do error messages guide users to resolve issues themselves?`,
          ],
        },
      },
      FUNCTION: {
        BusinessRules: {
          definition: 'Constraints on input fields, conditional behavior, boundaries, requirements that shape the product\'s behavior.',
          rationale: (ctx) => `${ctx.features[0] || 'The feature'} has implicit rules not fully specified in the user stories.`,
          questions: (ctx) => [
            `What are the exact business rules for ${ctx.features[0] || 'core functionality'}? Are there edge cases?`,
            `What happens when ${ctx.actors[0] || 'a user'} attempts an invalid state transition?`,
            `What features exactly are limited for different ${ctx.actors.includes('enterprise user') ? 'tiers or roles' : 'user types'}?`,
          ],
        },
        MultiUserSocial: {
          definition: 'Any function designed to facilitate interaction among people or to allow concurrent access to the same resources.',
          rationale: (ctx) => `The user stories don't detail multi-user scenarios for ${ctx.features[0] || 'shared resources'}.`,
          questions: (ctx) => [
            `Can multiple ${ctx.actors[0] || 'users'} access the same ${ctx.dataTypes[0] || 'resource'} simultaneously?`,
            `How are conflicts resolved when multiple users modify the same data?`,
            `Are there collaboration features that need testing (sharing, permissions, notifications)?`,
          ],
        },
        Calculation: {
          definition: 'Any arithmetic function or arithmetic operations embedded in other functions.',
          rationale: (ctx) => `${ctx.features.includes('payment processing') || ctx.dataTypes.includes('financial data') ? 'Pricing and billing' : 'Calculations'} don't specify exact rules. Incorrect calculations can cause issues.`,
          questions: (ctx) => [
            `What are the exact calculation rules for ${ctx.dataTypes.includes('financial data') ? 'pricing, proration, and taxes' : 'numeric operations'}?`,
            `How are ${ctx.dataTypes.includes('financial data') ? 'currencies and exchange rates' : 'units and conversions'} handled?`,
            `What rounding rules apply? How is precision maintained?`,
          ],
        },
        SecurityRelated: {
          definition: 'Rights of each class of user; protection of data; encryption; front end vs. back end protections; vulnerabilities in sub-systems.',
          rationale: (ctx) => `${ctx.features.includes('authentication') ? 'Authentication and authorization' : 'Security'} features require specific controls beyond what's in the user stories.`,
          questions: (ctx) => [
            `What ${ctx.features.includes('authentication') ? 'password complexity and session timeout' : 'authentication'} requirements apply?`,
            `What ${ctx.dataTypes.includes('sensitive data') ? 'sensitive data' : 'user data'} should be encrypted at rest and in transit?`,
            `What data should be masked in logs? (${ctx.dataTypes.includes('financial data') ? 'card numbers, ' : ''}passwords, ${ctx.dataTypes.includes('user data') ? 'email addresses' : 'PII'})`,
          ],
        },
        Transformations: {
          definition: 'Functions that modify or transform something.',
          rationale: (ctx) => `Data transformation rules for ${ctx.dataTypes[0] || 'application data'} aren't specified.`,
          questions: (ctx) => [
            `What transformations apply to ${ctx.dataTypes[0] || 'input data'} (formatting, normalization, sanitization)?`,
            `How are ${ctx.actions.includes('upload') ? 'uploaded files' : 'data imports'} processed and validated?`,
            `What happens during ${ctx.actions.includes('update') || ctx.actions.includes('edit') ? 'updates' : 'modifications'} - full replace or partial update?`,
          ],
        },
        StateTransitions: {
          definition: 'Any process that changes a view, configuration, or context; making the product sensitive or insensitive to certain inputs.',
          rationale: (ctx) => `${ctx.features[0] || 'The system'} has multiple states with complex transitions.`,
          questions: (ctx) => [
            `What are all valid states for ${ctx.dataTypes.includes('transactional data') ? 'transactions/orders' : 'entities'}? What transitions are allowed?`,
            `Can a ${ctx.actions.includes('cancel') ? 'cancelled' : 'completed'} item be reactivated? Under what conditions?`,
            `What happens to items in "pending" state for extended periods?`,
          ],
        },
        ErrorHandling: {
          definition: 'Any functions that detect and recover from errors, including all error messages.',
          rationale: (ctx) => `${ctx.features[0] || 'Application'} flows have many failure points. Clear error handling prevents user frustration.`,
          questions: (ctx) => [
            `What should happen when ${ctx.integrations[0] || 'an external service'} is unavailable? Retry? Queue? Notify user?`,
            `How should expired sessions be handled mid-operation? Should the operation be recoverable?`,
            `What specific error messages should ${ctx.actors[0] || 'users'} see for different failure scenarios?`,
          ],
        },
        Interactions: {
          definition: 'Any interactions between functions within the product.',
          rationale: (ctx) => `The user stories mention ${ctx.features.includes('notification system') ? 'notifications' : 'interactions'} but don't detail all system interactions.`,
          questions: (ctx) => [
            `What triggers each ${ctx.features.includes('notification system') ? 'notification' : 'system event'}? (${ctx.actions.slice(0, 3).join(', ') || 'create, update, delete'})`,
            `What analytics events should be captured for ${ctx.features[0] || 'key actions'}?`,
            `How do ${ctx.features.slice(0, 2).join(' and ') || 'features'} interact? Cache invalidation? State sync?`,
          ],
        },
        Testability: {
          definition: 'Any functions provided to help test the product, such as diagnostics, log files, asserts, test menus, etc.',
          rationale: (ctx) => `Testing ${ctx.features[0] || 'the application'} requires specific testability features.`,
          questions: (ctx) => [
            `Are there test/sandbox modes for ${ctx.integrations[0] || 'external integrations'}?`,
            `What logging is available to diagnose issues in ${ctx.features[0] || 'production'}?`,
            `Can ${ctx.dataTypes[0] || 'data'} states be easily set up for testing edge cases?`,
          ],
        },
      },
      DATA: {
        InputOutput: {
          definition: 'Any data that is processed by the product, and any data that results from that processing.',
          rationale: (ctx) => `${ctx.features.includes('user management') ? 'Forms' : 'Inputs'} accept ${ctx.dataTypes[0] || 'user input'}, but limits aren't specified. Missing limits create security and UX issues.`,
          questions: (ctx) => [
            `What are maximum lengths for ${ctx.dataTypes.includes('user data') ? 'name, email, address' : 'text'} fields?`,
            `${ctx.actions.includes('upload') ? 'What file formats and sizes are allowed for uploads?' : 'What input formats are accepted?'}`,
            `What format should API responses use for ${ctx.dataTypes.includes('financial data') ? 'monetary values (cents vs decimal, currency codes)' : 'data output'}?`,
          ],
        },
        Preset: {
          definition: 'Any data that is supplied as part of the product, or otherwise built into it, such as prefabricated databases, default values, etc.',
          rationale: (ctx) => `Default values for ${ctx.features[0] || 'the system'} affect user experience but aren't specified.`,
          questions: (ctx) => [
            `What are the default ${ctx.features.includes('user management') ? 'user settings and preferences' : 'configuration values'}?`,
            `What preset/seed data is required for ${ctx.features[0] || 'the application'} to function?`,
            `What default ${ctx.features.includes('notification system') ? 'notification preferences' : 'options'} are set for new ${ctx.actors[0] || 'users'}?`,
          ],
        },
        Persistent: {
          definition: 'Any data that is expected to persist over multiple operations.',
          rationale: (ctx) => `Persistence requirements for ${ctx.dataTypes[0] || 'application data'} need clarification.`,
          questions: (ctx) => [
            `What ${ctx.dataTypes[0] || 'data'} must persist across sessions? Across system restarts?`,
            `How is ${ctx.dataTypes.includes('configuration data') ? 'configuration' : 'state'} data synchronized across instances?`,
            `What is the backup and recovery strategy for ${ctx.dataTypes.includes('transactional data') ? 'transactional' : 'critical'} data?`,
          ],
        },
        BigLittle: {
          definition: 'Variations in the size and aggregation of data.',
          rationale: (ctx) => `${ctx.features[0] || 'The system'} doesn't specify limits. Undefined limits cause performance issues at scale.`,
          questions: (ctx) => [
            `What are the limits for ${ctx.actors.includes('enterprise user') ? 'team size, users per account' : 'data volume'}?`,
            `Are there ${ctx.features[0] || 'usage'} limits per ${ctx.actors[0] || 'user'} type?`,
            `What happens when a limit is exceeded? Soft limit with warning? Hard block?`,
          ],
        },
        Cardinality: {
          definition: 'Numbers of objects or fields may vary (e.g. zero, one, many, max, open limit). Some may have to be unique.',
          rationale: (ctx) => `${ctx.dataTypes[0] || 'Entity'} relationships need clarification for edge cases.`,
          questions: (ctx) => [
            `Can a single ${ctx.actors[0] || 'user'} have multiple ${ctx.dataTypes.includes('transactional data') ? 'active subscriptions/orders' : 'of the same entity'}?`,
            `How many ${ctx.dataTypes[0] || 'items'} can be stored per ${ctx.actors[0] || 'account'}? Is there a limit?`,
            `Can one ${ctx.dataTypes.includes('user data') ? 'email' : 'identifier'} be used for multiple accounts?`,
          ],
        },
        InvalidNoise: {
          definition: 'Any data or state that is invalid, corrupted, out of bounds, or produced in an uncontrolled or incorrect fashion.',
          rationale: (ctx) => `${ctx.features.includes('authentication') ? 'Authentication and input' : 'Input'} forms are attack vectors. Security testing requires knowing expected behavior for malicious input.`,
          questions: (ctx) => [
            `How should the system handle Unicode/emoji in ${ctx.dataTypes.includes('user data') ? 'names and addresses' : 'text fields'}? Special characters?`,
            `${ctx.dataTypes.includes('user data') ? 'What happens with disposable email addresses? Block them? Allow them?' : 'How are invalid inputs handled?'}`,
            `How are SQL injection or XSS attempts in form fields handled? Silent rejection? Logged alert?`,
          ],
        },
        Lifecycle: {
          definition: 'Transformations over the lifetime of a data entity as it is created, accessed, modified, and deleted.',
          rationale: (ctx) => `${ctx.features.includes('compliance') ? 'Compliance requirements mention' : 'The system handles'} data deletion but doesn't specify retention policies for all data types.`,
          questions: (ctx) => [
            `How long is ${ctx.dataTypes[0] || 'user data'} retained after deletion? ${ctx.dataTypes.includes('financial data') ? 'Financial records may need 7-year retention for tax compliance.' : ''}`,
            `What is the archival policy for inactive ${ctx.actors[0] || 'accounts'}? Delete? Anonymize?`,
            `Are deleted ${ctx.actors[0] || 'user'}'s ${ctx.dataTypes.includes('analytics data') ? 'analytics events' : 'associated data'} retained or purged?`,
          ],
        },
      },
      INTERFACES: {
        UserInterfaces: {
          definition: 'Any element that mediates the exchange of data with the user (e.g. displays, buttons, fields, whether physical or virtual).',
          rationale: (ctx) => `${ctx.features[0] || 'Application'} pages need to work across devices and for users with disabilities.`,
          questions: (ctx) => [
            `What responsive breakpoints must ${ctx.features[0] || 'the application'} support? Mobile-first design?`,
            `Are there keyboard navigation requirements for ${ctx.features[0] || 'key workflows'}?`,
            `What WCAG compliance level is required? What screen readers must be supported?`,
          ],
        },
        SystemInterfaces: {
          definition: 'Any interface with something other than a user, such as engineering logs, other programs, hard disk, network, etc.',
          rationale: (ctx) => `The architecture mentions ${ctx.integrations.length > 0 ? ctx.integrations.slice(0, 2).join(' and ') : 'services'} but their interfaces need testing.`,
          questions: (ctx) => [
            `What internal APIs connect ${ctx.features.slice(0, 2).join(' and ') || 'system components'}?`,
            `Are there message queues for async operations like ${ctx.features.includes('notification system') ? 'notifications' : 'background processing'}?`,
            `How do services communicate failures? Circuit breaker patterns? Health checks?`,
          ],
        },
        ApiSdk: {
          definition: 'Any programmatic interfaces or tools intended to allow the development of new applications using this product.',
          rationale: (ctx) => `${ctx.actors.includes('developer') || ctx.actors.includes('enterprise user') ? 'API access is mentioned' : 'External integration'} but details aren't specified.`,
          questions: (ctx) => [
            `What rate limits apply to the API? Per endpoint or global?`,
            `What authentication methods does the API support? API keys? OAuth? JWT?`,
            `What API versioning strategy is used? How are breaking changes communicated?`,
          ],
        },
        ImportExport: {
          definition: 'Any functions that package data for use by a different product, or interpret data from a different product.',
          rationale: (ctx) => `${ctx.features.includes('data export/import') || ctx.features.includes('compliance') ? 'Data portability is required' : 'Data export/import'} but format and scope aren't defined.`,
          questions: (ctx) => [
            `What formats should ${ctx.features.includes('compliance') ? 'GDPR/compliance data export' : 'data export'} support? JSON? CSV? PDF?`,
            `Can ${ctx.actors[0] || 'users'} import ${ctx.dataTypes[0] || 'data'} from other platforms?`,
            `Can ${ctx.dataTypes.includes('transactional data') ? 'transaction history' : 'records'} be exported in bulk?`,
          ],
        },
      },
      PLATFORM: {
        ExternalHardware: {
          definition: 'Hardware components and configurations that are not part of the shipping product, but are required (or optional) for the product to work.',
          rationale: (ctx) => `${ctx.features[0] || 'Application'} pages need to work on various devices, but requirements aren't specified.`,
          questions: (ctx) => [
            `What are minimum device specifications? (memory, screen size, CPU)`,
            `Are there network bandwidth requirements? Will ${ctx.features[0] || 'the app'} work on slow connections?`,
            `Should offline capabilities exist? Can ${ctx.actors[0] || 'users'} access ${ctx.features.includes('content management') ? 'cached content' : 'data'} without connectivity?`,
          ],
        },
        ExternalSoftware: {
          definition: 'Software components and configurations that are not a part of the shipping product, but are required (or optional) for the product to work.',
          rationale: (ctx) => `User stories don't specify browser or platform requirements. ${ctx.integrations[0] || 'Integrations'} have specific compatibility needs.`,
          questions: (ctx) => [
            `What are the minimum supported browser versions? (Chrome, Firefox, Safari, Edge)`,
            `What ${ctx.integrations.includes('database') ? 'database versions' : 'dependencies'} must be supported? Migration considerations?`,
            `What CDN is used? Are there caching requirements that affect ${ctx.features[0] || 'behavior'}?`,
          ],
        },
        EmbeddedComponents: {
          definition: 'Libraries and other components that are embedded in your product but are produced outside your project.',
          rationale: (ctx) => `Third-party components used for ${ctx.features[0] || 'functionality'} need version tracking and security monitoring.`,
          questions: (ctx) => [
            `What third-party UI component libraries are used? Version requirements?`,
            `What ${ctx.integrations[0] || 'external'} SDKs are embedded? How are updates managed?`,
            `Are there shared ${ctx.features.includes('authentication') ? 'authentication' : 'utility'} libraries across services?`,
          ],
        },
        ProductFootprint: {
          definition: 'The resources in the environment that are used, reserved, or consumed by the product.',
          rationale: (ctx) => `Resource usage for ${ctx.features[0] || 'the application'} isn't specified. This affects hosting and scaling decisions.`,
          questions: (ctx) => [
            `What are the memory and CPU requirements for ${ctx.features[0] || 'the application'}?`,
            `What storage requirements exist for ${ctx.dataTypes[0] || 'application data'}?`,
            `What network bandwidth is consumed by ${ctx.features[0] || 'typical usage'}?`,
          ],
        },
      },
      OPERATIONS: {
        Users: {
          definition: 'The attributes of the various kinds of users (normal end users, admin users, developers using API, etc.)',
          rationale: (ctx) => `User stories mention "${ctx.actors[0] || 'users'}" but don't detail user roles or accessibility.`,
          questions: (ctx) => [
            `Are there ${ctx.actors.includes('administrator') ? 'different admin levels' : 'admin/moderator roles'} beyond regular users? What permissions do they have?`,
            `What accessibility accommodations are required? Screen reader support? High contrast mode?`,
            `Are there ${ctx.actors.includes('enterprise user') ? 'B2B users with different workflows than B2C users' : 'different user personas to consider'}?`,
          ],
        },
        Environment: {
          definition: 'The physical environment in which the product operates, including such elements as noise, light, and distractions.',
          rationale: (ctx) => `The operating environment for ${ctx.features[0] || 'the application'} may affect usability.`,
          questions: (ctx) => [
            `In what environments will ${ctx.actors[0] || 'users'} use ${ctx.features[0] || 'the application'}? (office, mobile, public)`,
            `Are there environmental factors affecting ${ctx.features.includes('authentication') ? 'authentication' : 'usage'}? (lighting for cameras, noise for voice)`,
            `How does ${ctx.features[0] || 'the application'} perform in low-connectivity environments?`,
          ],
        },
        CommonUse: {
          definition: 'Patterns and sequences of input that the product will typically encounter.',
          rationale: (ctx) => `While individual features are specified, the complete ${ctx.actors[0] || 'user'} journey isn't detailed.`,
          questions: (ctx) => [
            `What is the typical ${ctx.actors[0] || 'user'} journey for ${ctx.features[0] || 'key tasks'}? What touchpoints exist?`,
            `What are the most frequently used features? This affects testing priority.`,
            `How do most ${ctx.actors[0] || 'users'} discover and engage with ${ctx.features[0] || 'the product'}?`,
          ],
        },
        UncommonUse: {
          definition: 'Occasional or periodic expected activity (backup, updates, report generation, downtime for maintenance).',
          rationale: (ctx) => `Edge cases in ${ctx.features[0] || 'application'} flows need specific handling.`,
          questions: (ctx) => [
            `What happens if ${ctx.actors[0] || 'a user'} tries to ${ctx.actions[0] || 'perform an action'} that's already been completed?`,
            `How do ${ctx.actors[0] || 'users'} recover from failed ${ctx.actions.includes('process') ? 'processes' : 'operations'}? Retry logic? Support escalation?`,
            `Can ${ctx.actors[0] || 'users'} modify ${ctx.dataTypes.includes('user data') ? 'their email/credentials' : 'critical data'}? What verification is required?`,
          ],
        },
        ExtremeUse: {
          definition: 'Challenging patterns and sequences of input that are consistent with the intended use of the product.',
          rationale: (ctx) => `${ctx.features[0] || 'The system'} may experience load spikes during ${ctx.features.includes('payment processing') ? 'promotions or renewal cycles' : 'peak usage'}.`,
          questions: (ctx) => [
            `What is expected peak concurrent ${ctx.actors[0] || 'users'}? During ${ctx.features.includes('payment processing') ? 'promotions or renewal cycles' : 'peak periods'}?`,
            `How many API requests per minute should ${ctx.features[0] || 'the system'} handle?`,
            `What happens during traffic spikes? Auto-scaling? Graceful degradation?`,
          ],
        },
        DisfavoredUse: {
          definition: 'Patterns of input produced by ignorant, mistaken, careless or malicious use.',
          rationale: (ctx) => `${ctx.features.includes('payment processing') || ctx.features.includes('authentication') ? 'Payment and authentication' : ctx.features[0] || 'The'} systems are targets for fraud and abuse.`,
          questions: (ctx) => [
            `What abuse scenarios should be prevented? ${ctx.features.includes('authentication') ? 'Credential stuffing? Account sharing?' : 'Scraping? Automation?'}`,
            `Are there ${ctx.features.includes('payment processing') ? 'fraud detection' : 'abuse detection'} requirements?`,
            `How are ${ctx.features.includes('payment processing') ? 'chargebacks and disputes' : 'malicious actions'} handled? Prevention measures?`,
          ],
        },
      },
      TIME: {
        TimeRelatedData: {
          definition: 'Time-out settings; time zones; business holidays; terms and warranty periods; chronograph functions.',
          rationale: (ctx) => `${ctx.dataTypes.includes('transactional data') ? 'Billing dates and renewals' : 'Time-sensitive data'} are timezone-dependent.`,
          questions: (ctx) => [
            `In what timezone are ${ctx.dataTypes.includes('transactional data') ? 'billing dates' : 'timestamps'} calculated? UTC? User's local timezone?`,
            `How are ${ctx.features[0] || 'operations'} handled across daylight saving time changes?`,
            `What happens if a scheduled date falls on a weekend/holiday? Or Feb 29?`,
          ],
        },
        InputOutputTiming: {
          definition: 'When input is provided, when output created, and any timing relationships (delays, intervals, etc.) among them.',
          rationale: (ctx) => `${ctx.integrations[0] || 'External integrations'} have timeout and retry considerations.`,
          questions: (ctx) => [
            `What is the timeout for ${ctx.integrations[0] || 'external API'} responses? What happens on timeout?`,
            `How long should ${ctx.features.includes('notification system') ? 'notification' : 'webhook'} retries continue before giving up?`,
            `What is the SLA for ${ctx.features.includes('notification system') ? 'notification delivery' : 'response times'}?`,
          ],
        },
        Pacing: {
          definition: 'Testing with fast or slow input; variations of fast and slow (spikes, bursts, hangs, bottlenecks); interrupting or letting it sit.',
          rationale: (ctx) => `${ctx.features[0] || 'Application'} operations have implicit timing requirements.`,
          questions: (ctx) => [
            `What are expected response times for ${ctx.features[0] || 'key operations'}? Under 3 seconds?`,
            `Are there batch processing windows for ${ctx.features.includes('subscription management') ? 'renewals' : 'scheduled tasks'}?`,
            `How quickly should ${ctx.actors[0] || 'users'} see updates after ${ctx.actions[0] || 'making changes'}?`,
          ],
        },
        Concurrency: {
          definition: 'More than one thing happening at once (multi-user, time-sharing, threads, and semaphores, shared data).',
          rationale: (ctx) => `${ctx.actors[0] || 'Users'} may access ${ctx.features[0] || 'the system'} from multiple devices simultaneously.`,
          questions: (ctx) => [
            `What happens if the same ${ctx.actors[0] || 'user'} logs in from multiple devices? Single session? Multiple allowed?`,
            `How are concurrent modifications to ${ctx.dataTypes[0] || 'shared data'} handled?`,
            `Can multiple ${ctx.actors.includes('enterprise user') ? 'team members' : 'users'} use the same ${ctx.features.includes('subscription management') ? 'subscription' : 'resource'} simultaneously?`,
          ],
        },
      },
    };

    // Get templates for this category
    const categoryTemplates = subcategoryTemplates[category];
    if (!categoryTemplates) return result;

    // Count tests per subcategory
    const subcategoryCounts: Record<string, number> = {};
    categoryTests.forEach(tc => {
      const sub = tc.htsm.primary.subcategory;
      subcategoryCounts[sub] = (subcategoryCounts[sub] || 0) + 1;
    });

    // Generate questions for missing or low-coverage subcategories
    Object.entries(categoryTemplates).forEach(([subcategory, template]) => {
      const count = subcategoryCounts[subcategory] || 0;

      if (count === 0) {
        // No coverage - add all questions with full rationale
        result.questions.push({
          subcategory,
          rationale: template.rationale(context),
          questions: template.questions(context),
        });
      } else if (count < 3) {
        // Limited coverage - add first question with rationale
        const questions = template.questions(context);
        result.questions.push({
          subcategory,
          rationale: template.rationale(context),
          questions: [questions[0]],
        });
      }
    });

    return result;
  }

  /**
   * Format output as Markdown
   */
  private formatAsMarkdown(
    testSuite: TestSuite,
    htsmAnalysis: Map<HTSMCategory, HTSMAnalysisResult>,
    userStories: UserStory[],
    assessmentName?: string
  ): string {
    const lines: string[] = [];

    // Generate descriptive title from assessment name or test suite name
    const displayName = assessmentName
      ? assessmentName.replace(/-/g, ' ').replace(/([A-Z])/g, ' $1').trim()
      : testSuite.name;
    lines.push(`# Product Factors assessment of: ${displayName}`);
    lines.push('');
    lines.push('This report contains the assessment of given project artifact based on Product Factors (SFDIPOT) heuristic in [HTSM](https://www.satisfice.com/download/heuristic-test-strategy-model) by James Bach. In this report you will find:');
    lines.push('');
    lines.push('- [ ] **The Test Ideas** - generated for each product factor based on applicable subcategories.');
    lines.push('- [ ] **Automation Fitness** - recommendations against each test idea that testers can consider for drafting suitable automation strategy.');
    lines.push('- [ ] **The Clarifying Questions to address potential coverage gaps** - that surface "unknown unknowns" by systematically checking which Product Factors (SFDIPOT) subcategories lack test coverage.');
    lines.push('');
    lines.push('All in all, this report represents important and unique elements to be considered in the test strategy. Testers are advised to carefully evaluate all the information using critical thinking and context awareness.');
    lines.push('');
    lines.push(`**Generated:** ${testSuite.generatedAt}`);
    lines.push(`**Total Tests:** ${testSuite.tests.length}`);
    lines.push(`**Product Factors (SFDIPOT) Coverage:** ${testSuite.htsmCoverage.overall}%`);
    lines.push(`**Traceability:** ${testSuite.traceabilityMatrix.coverage}%`);
    lines.push('');

    // Coverage summary
    lines.push('## Product Factors (SFDIPOT) Coverage Summary');
    lines.push('');
    lines.push('| Category | Tests | Coverage |');
    lines.push('|----------|-------|----------|');

    Object.entries(testSuite.htsmCoverage.byCategory).forEach(([category, data]) => {
      lines.push(`| ${category} | ${data.testCount} | ${data.coverage}% |`);
    });
    lines.push('');

    // Review needed - requirements either need review or product factor not applicable
    if (testSuite.htsmCoverage.gaps.length > 0) {
      lines.push('## Review Needed');
      lines.push('');
      lines.push('*The following areas have limited coverage. Review each to determine if the product factor applies or confirm it is not relevant:*');
      lines.push('');
      testSuite.htsmCoverage.gaps.forEach((gap) => {
        lines.push(`- **[${gap.severity.toUpperCase()}]** ${gap.category}: ${gap.recommendation}`);
      });
      lines.push('');
    }

    // Risk-Based Priority explanation
    lines.push('## Risk-Based Prioritization');
    lines.push('');
    lines.push('Test ideas are prioritized using a **risk-based approach** that considers:');
    lines.push('');
    lines.push('1. **Business Impact**: Potential revenue loss, customer trust damage, or regulatory penalties');
    lines.push('2. **Likelihood of Failure**: Complexity of implementation, external dependencies, new technology');
    lines.push('3. **User Exposure**: Number of users affected and frequency of feature usage');
    lines.push('4. **Security & Compliance**: Data protection requirements, payment processing, legal obligations');
    lines.push('');
    lines.push('### Priority Legend');
    lines.push('');
    // Generate contextual examples from actual test cases
    const priorityExamples = this.generatePriorityExamples(testSuite.tests);
    lines.push('| Priority | Risk Level | Description | Examples from this Epic |');
    lines.push('|----------|------------|-------------|------------------------|');
    lines.push(`| **P0** | Critical | Security vulnerabilities or core functionality that could cause immediate financial loss, data breach, or complete service failure. Must be tested before any release. | ${priorityExamples.P0 || 'Security testing, authentication'} |`);
    lines.push(`| **P1** | High | Core business flows and integrations essential for revenue generation. Failures would significantly impact user experience or business operations. | ${priorityExamples.P1 || 'Core business flows, API integrations'} |`);
    lines.push(`| **P2** | Medium | Important features that support the core experience. Failures would cause inconvenience but workarounds exist. | ${priorityExamples.P2 || 'UI components, notifications'} |`);
    lines.push(`| **P3** | Low | Edge cases, cosmetic issues, or rarely used features. Failures have minimal business impact. | ${priorityExamples.P3 || 'Edge cases, minor variations'} |`);
    lines.push('');

    // Test ideas by category
    lines.push('## Test Ideas');
    lines.push('');

    // Product Factors (SFDIPOT) Category descriptions based on James Bach's HTSM v6.3
    const categoryDescriptions: Record<HTSMCategory, string> = {
      STRUCTURE: 'Test ideas for everything that comprises the physical product',
      FUNCTION: 'Test ideas for everything that the product does',
      DATA: 'Test ideas for everything that the product processes',
      INTERFACES: 'Test ideas for every conduit by which the product is accessed or accesses other things',
      PLATFORM: 'Test ideas for everything on which the product depends that is outside the project',
      OPERATIONS: 'Test ideas for how the product will be used',
      TIME: 'Test ideas for any relationship between the product and time',
    };

    const categories: HTSMCategory[] = [
      'STRUCTURE',
      'FUNCTION',
      'DATA',
      'INTERFACES',
      'PLATFORM',
      'OPERATIONS',
      'TIME',
    ];

    categories.forEach((category) => {
      const categoryTests = testSuite.tests.filter(
        (tc) => tc.htsm.primary.category === category
      );

      if (categoryTests.length > 0) {
        lines.push(`### ${category}: ${categoryDescriptions[category]} (${categoryTests.length} test ideas)`);
        lines.push('');
        lines.push('| ID | Priority | Subcategory | Test Idea | Automation Fitness |');
        lines.push('|----|----------|-------------|-----------|-------------------|');

        categoryTests.forEach((tc) => {
          const automationFitness = this.determineAutomationFitness(tc);
          lines.push(
            `| ${tc.id} | ${tc.priority} | ${tc.htsm.primary.subcategory} | ${tc.name} | ${automationFitness} |`
          );
        });
        lines.push('');

        // Add clarifying questions section with rationale
        const clarifyingData = this.generateClarifyingQuestions(category, categoryTests, userStories);
        if (clarifyingData.questions.length > 0) {
          lines.push('#### Clarifying Questions to address potential coverage gaps');
          lines.push('');
          lines.push(clarifyingData.preamble);
          lines.push('');

          clarifyingData.questions.forEach((item) => {
            lines.push(`**[${item.subcategory}]**`);
            lines.push('');
            lines.push(`*Rationale: ${item.rationale}*`);
            lines.push('');
            item.questions.forEach((question) => {
              lines.push(`- ${question}`);
            });
            lines.push('');
          });
        }
      }
    });

    // Requirement Traceability matrix
    lines.push('## Requirement Traceability Matrix');
    lines.push('');
    lines.push('| Requirement | Test Ideas | Product Factors (SFDIPOT) Categories | Coverage |');
    lines.push('|-------------|------------|-----------------|----------|');

    // Create a map of requirement IDs to their titles from user stories
    const requirementTitles = new Map<string, string>();
    userStories.forEach((story) => {
      requirementTitles.set(story.id, story.title);
    });

    testSuite.traceabilityMatrix.requirements.forEach((row) => {
      // Get title from user stories if available, otherwise use ID only
      const title = requirementTitles.get(row.requirementId);
      const displayName = title
        ? `${row.requirementId}: ${title}`
        : row.requirementId;
      lines.push(
        `| ${displayName} | ${row.testCaseIds.length} | ${row.htsmCategories.join(', ')} | ${row.coverage} |`
      );
    });

    return lines.join('\n');
  }

  /**
   * Format output as HTML
   */
  private formatAsHTML(
    testSuite: TestSuite,
    htsmAnalysis: Map<HTSMCategory, HTSMAnalysisResult>,
    userStories: UserStory[],
    assessmentName?: string
  ): string {
    const date = new Date().toISOString().split('T')[0];
    const displayName = assessmentName
      ? assessmentName.replace(/-/g, ' ').replace(/([A-Z])/g, ' $1').trim()
      : testSuite.name;

    const categories: HTSMCategory[] = [
      'STRUCTURE', 'FUNCTION', 'DATA', 'INTERFACES', 'PLATFORM', 'OPERATIONS', 'TIME'
    ];

    const categoryDescriptions: Record<HTSMCategory, string> = {
      STRUCTURE: 'Test ideas for everything that comprises the physical product',
      FUNCTION: 'Test ideas for everything that the product does',
      DATA: 'Test ideas for everything that the product processes',
      INTERFACES: 'Test ideas for every conduit by which the product is accessed or accesses other things',
      PLATFORM: 'Test ideas for everything on which the product depends that is outside the project',
      OPERATIONS: 'Test ideas for how the product will be used',
      TIME: 'Test ideas for any relationship between the product and time',
    };

    // Helper to get automation CSS class
    const getAutomationClass = (fitness: string): string => {
      if (fitness.includes('Human')) return 'automation-human';
      if (fitness.includes('API level')) return 'automation-api';
      if (fitness.includes('E2E level')) return 'automation-e2e';
      if (fitness.includes('Visual level')) return 'automation-visual';
      if (fitness.includes('Integration level')) return 'automation-integration';
      if (fitness.includes('Performance')) return 'automation-performance';
      if (fitness.includes('Concurrency')) return 'automation-concurrency';
      if (fitness.includes('Security')) return 'automation-security';
      if (fitness.includes('Compatibility')) return 'automation-compatibility';
      return 'automation-other';
    };

    // Calculate summary stats
    const byCategory: Record<string, number> = {};
    const byPriority: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
    const byAutomationFitness: Record<string, number> = {};
    testSuite.tests.forEach(tc => {
      byCategory[tc.htsm.primary.category] = (byCategory[tc.htsm.primary.category] || 0) + 1;
      byPriority[tc.priority] = (byPriority[tc.priority] || 0) + 1;
      const fitness = this.determineAutomationFitness(tc);
      byAutomationFitness[fitness] = (byAutomationFitness[fitness] || 0) + 1;
    });

    // Generate priority examples from test cases
    const priorityExamples = this.generatePriorityExamples(testSuite.tests);

    // Generate category sections
    const generateCategorySection = (category: HTSMCategory): string => {
      const tests = testSuite.tests.filter(tc => tc.htsm.primary.category === category);
      if (tests.length === 0) return '';

      const rows = tests.map(tc => {
        const automationFitness = this.determineAutomationFitness(tc);
        const priorityClass = `priority-${tc.priority.toLowerCase()}`;
        const automationClass = getAutomationClass(automationFitness);
        return `<tr>
          <td class="test-id">${tc.id}</td>
          <td><span class="priority ${priorityClass}">${tc.priority}</span></td>
          <td><span class="subcategory">${tc.htsm.primary.subcategory}</span></td>
          <td>${tc.name}</td>
          <td><span class="automation ${automationClass}">${automationFitness}</span></td>
        </tr>`;
      }).join('\n');

      // Generate clarifying questions
      const clarifyingData = this.generateClarifyingQuestions(category, tests, userStories);
      const clarifyingSection = clarifyingData.questions.length > 0 ? `
        <div class="clarifying-questions">
          <h4>Clarifying Questions to address potential coverage gaps</h4>
          <div class="clarifying-intro">
            <p class="preamble">${clarifyingData.preamble.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}</p>
          </div>
          ${clarifyingData.questions.map(item => `
          <div class="subcategory-questions">
            <h5>[${item.subcategory}]</h5>
            <p class="rationale"><em>Rationale: ${item.rationale}</em></p>
            <ul>
              ${item.questions.map(q => `<li>${q}</li>`).join('\n')}
            </ul>
          </div>`).join('\n')}
        </div>` : '';

      const tableId = `table-${category.toLowerCase()}`;
      return `
        <div class="category-section cat-${category.toLowerCase()}" id="${category.toLowerCase()}">
          <div class="category-header collapsible-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <h3>${category}: ${categoryDescriptions[category]} <span class="badge">${tests.length}</span></h3>
            <span class="collapse-icon">▼</span>
          </div>
          <div class="category-content collapsible-content">
            <table class="filterable-table" id="${tableId}">
              <thead>
                <tr>
                  <th style="width: 100px;">ID</th>
                  <th style="width: 70px;">Priority</th>
                  <th style="width: 120px;">Subcategory</th>
                  <th>Test Idea</th>
                  <th style="width: 210px;">Automation Fitness</th>
                </tr>
                <tr class="filter-row">
                  <td><input type="text" class="filter-input" data-col="0" placeholder="Filter..." onkeyup="filterTable('${tableId}')"></td>
                  <td><select class="filter-select" data-col="1" onchange="filterTable('${tableId}')"><option value="">All</option><option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option></select></td>
                  <td><input type="text" class="filter-input" data-col="2" placeholder="Filter..." onkeyup="filterTable('${tableId}')"></td>
                  <td><input type="text" class="filter-input" data-col="3" placeholder="Filter..." onkeyup="filterTable('${tableId}')"></td>
                  <td><select class="filter-select" data-col="4" onchange="filterTable('${tableId}')"><option value="">All</option><option value="Automate on API level">API level</option><option value="Automate on E2E level">E2E level</option><option value="Automate on Integration level">Integration level</option><option value="Human testers must explore">Human Exploration</option><option value="Performance testing recommended">Performance</option><option value="Security testing recommended">Security</option></select></td>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
            ${clarifyingSection}
          </div>
        </div>`;
    };

    // Generate traceability matrix with SFDIPOT coverage per requirement
    const requirementTitles = new Map<string, string>();
    userStories.forEach(story => requirementTitles.set(story.id, story.title));

    const sfdipotCategories: HTSMCategory[] = ['STRUCTURE', 'FUNCTION', 'DATA', 'INTERFACES', 'PLATFORM', 'OPERATIONS', 'TIME'];
    const categoryGaps: Record<string, number> = {};
    sfdipotCategories.forEach(cat => categoryGaps[cat] = 0);

    const traceabilityRows = testSuite.traceabilityMatrix.requirements.map(row => {
      const title = requirementTitles.get(row.requirementId);
      const displayReq = title ? `${title}` : row.requirementId;
      const reqId = row.requirementId;

      // Calculate SFDIPOT coverage for this requirement
      const coveredCategories = new Set(row.htsmCategories);
      let coveredCount = 0;

      const categoryColumns = sfdipotCategories.map(cat => {
        const hasCoverage = coveredCategories.has(cat);
        if (hasCoverage) {
          coveredCount++;
          return `<td style="text-align: center; background: #dcfce7;">✓</td>`;
        } else {
          categoryGaps[cat]++;
          return `<td style="text-align: center; background: #f1f5f9;">–</td>`;
        }
      }).join('\n            ');

      const statusClass = coveredCount >= 6 ? 'p2' : coveredCount >= 4 ? 'p1' : 'p0';

      return `<tr>
            <td><code>${reqId}</code> ${displayReq}</td>
            ${categoryColumns}
            <td style="text-align: center;"><span class="priority priority-${statusClass}">${coveredCount}/7</span></td>
          </tr>`;
    }).join('\n');

    // Identify product factors needing review (any requirement missing coverage)
    const totalReqs = testSuite.traceabilityMatrix.requirements.length;
    const reviewNeeded = sfdipotCategories
      .filter(cat => categoryGaps[cat] > 0)
      .map(cat => {
        const missingCount = categoryGaps[cat];
        const coveredCount = totalReqs - missingCount;
        const descriptions: Record<string, string> = {
          'STRUCTURE': 'code architecture, component integration, dependencies',
          'FUNCTION': 'core functionality, business logic, user workflows',
          'DATA': 'data validation, persistence, transformations',
          'INTERFACES': 'API contracts, UI interactions, external integrations',
          'PLATFORM': 'cross-browser, cross-device, environment compatibility',
          'OPERATIONS': 'installation, configuration, maintenance, recovery',
          'TIME': 'scheduling, timeouts, expiration, time zones, concurrency'
        };
        return `<li><strong>${cat} (${cat.charAt(0)})</strong> - ${coveredCount} of ${totalReqs} requirements linked. Review if applicable or confirm not relevant for remaining. Covers: ${descriptions[cat]}.</li>`;
      }).join('\n          ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product Factors assessment of: ${displayName}</title>
  <style>
    :root {
      --primary: #1e3a5f;
      --primary-dark: #0f2744;
      --primary-light: #2d5a8a;
      --accent: #0066cc;
      --success: #0d7a3f;
      --warning: #b45309;
      --danger: #b91c1c;
      --info: #0369a1;
      --bg-light: #f5f7fa;
      --bg-white: #ffffff;
      --text-dark: #1a1a2e;
      --text-muted: #5c6370;
      --border: #d1d5db;
      --border-light: #e5e7eb;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-light);
      color: var(--text-dark);
      line-height: 1.6;
      font-size: 14px;
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 24px; }
    header {
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      color: white;
      padding: 32px 28px;
      margin-bottom: 24px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    }
    header h1 { font-size: 1.75rem; margin-bottom: 8px; font-weight: 600; }
    header .subtitle { font-size: 0.9rem; opacity: 0.9; line-height: 1.5; }
    .meta-info { display: flex; gap: 16px; margin-top: 20px; flex-wrap: wrap; }
    .meta-card { background: rgba(255,255,255,0.12); padding: 12px 20px; border-radius: 6px; min-width: 140px; }
    .meta-card .label { font-size: 0.7rem; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.5px; }
    .meta-card .value { font-size: 1.5rem; font-weight: 700; }
    .section { background: var(--bg-white); border-radius: 8px; padding: 20px 24px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08); border: 1px solid var(--border-light); }
    .section h2 { color: var(--primary); font-size: 1.1rem; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--primary); font-weight: 600; }
    .section h3 { color: var(--text-dark); font-size: 1rem; margin: 20px 0 12px 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-weight: 600; }
    .section h3 .badge { background: var(--primary); color: white; padding: 3px 10px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 0.85rem; }
    th { background: var(--bg-light); padding: 10px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--border); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.3px; color: var(--text-muted); }
    td { padding: 10px 12px; border-bottom: 1px solid var(--border-light); vertical-align: top; }
    tr:hover { background: #fafbfc; }
    .priority { display: inline-block; padding: 4px 10px; border-radius: 4px; font-weight: 600; font-size: 0.8rem; text-transform: uppercase; }
    .priority-p0 { background: #fef2f2; color: var(--danger); border: 1px solid #fecaca; }
    .priority-p1 { background: #fefce8; color: var(--warning); border: 1px solid #fef08a; }
    .priority-p2 { background: #f0fdf4; color: var(--success); border: 1px solid #bbf7d0; }
    .priority-p3 { background: #f0f9ff; color: var(--info); border: 1px solid #bae6fd; }
    .subcategory { display: inline-block; background: #eff6ff; color: var(--primary); padding: 3px 8px; border-radius: 4px; font-size: 0.8rem; }
    .automation { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: 500; }
    .automation-api { background: #dbeafe; color: #1e40af; }
    .automation-e2e { background: #fce7f3; color: #9d174d; }
    .automation-integration { background: #d1fae5; color: #065f46; }
    .automation-visual { background: #fdf4ff; color: #86198f; }
    .automation-performance { background: #fef3c7; color: #92400e; }
    .automation-concurrency { background: #ffedd5; color: #9a3412; }
    .automation-security { background: #fee2e2; color: #991b1b; }
    .automation-compatibility { background: #ecfccb; color: #3f6212; }
    .automation-human { background: #f3e8ff; color: var(--purple); font-weight: 600; }
    .automation-other { background: #f1f5f9; color: #475569; }
    .clarifying-questions { background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 20px 25px; margin-top: 20px; }
    .clarifying-questions h4 { color: #854d0e; margin-bottom: 16px; font-size: 1.1rem; border-bottom: 2px solid #fef08a; padding-bottom: 10px; }
    .clarifying-intro { background: #fef9c3; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; }
    .clarifying-intro .preamble { color: #713f12; font-size: 0.9rem; line-height: 1.5; margin: 0; }
    .subcategory-questions { background: white; border: 1px solid #fef08a; border-radius: 6px; padding: 15px; margin-bottom: 15px; }
    .subcategory-questions h5 { color: #854d0e; font-size: 0.95rem; margin-bottom: 8px; font-weight: 700; }
    .subcategory-questions .rationale { color: #92400e; font-size: 0.85rem; margin-bottom: 12px; padding: 8px 12px; background: #fef3c7; border-radius: 4px; border-left: 3px solid #f59e0b; }
    .clarifying-questions ul { list-style: none; margin: 0; padding: 0; }
    .clarifying-questions li { padding: 8px 0 8px 20px; position: relative; border-bottom: 1px dashed #fef08a; color: var(--text-dark); font-size: 0.9rem; }
    .clarifying-questions li:before { content: "?"; position: absolute; left: 0; color: #f59e0b; font-weight: bold; }
    .clarifying-questions li:last-child { border-bottom: none; }
    /* Chart styles for compact visualization */
    .charts-container { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
    .chart-panel { background: var(--bg-white); border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
    .chart-panel h3 { font-size: 1.1rem; color: var(--text-dark); margin-bottom: 15px; padding-bottom: 8px; border-bottom: 2px solid var(--border); }
    .bar-chart { display: flex; flex-direction: column; gap: 8px; }
    .bar-row { display: flex; align-items: center; gap: 10px; }
    .bar-label { width: 90px; font-size: 0.8rem; font-weight: 600; color: var(--text-dark); text-align: right; flex-shrink: 0; }
    .bar-track { flex: 1; height: 24px; background: var(--bg-light); border-radius: 4px; overflow: hidden; position: relative; }
    .bar-fill { height: 100%; border-radius: 4px; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; font-size: 0.75rem; font-weight: 600; color: white; min-width: 35px; transition: width 0.3s ease; }
    .bar-value { width: 45px; font-size: 0.85rem; font-weight: 700; color: var(--text-dark); text-align: right; flex-shrink: 0; }
    .bar-structure { background: linear-gradient(90deg, #3b82f6, #2563eb); }
    .bar-function { background: linear-gradient(90deg, #8b5cf6, #7c3aed); }
    .bar-data { background: linear-gradient(90deg, #06b6d4, #0891b2); }
    .bar-interfaces { background: linear-gradient(90deg, #10b981, #059669); }
    .bar-platform { background: linear-gradient(90deg, #f59e0b, #d97706); }
    .bar-operations { background: linear-gradient(90deg, #ec4899, #db2777); }
    .bar-time { background: linear-gradient(90deg, #6366f1, #4f46e5); }
    .bar-p0 { background: linear-gradient(90deg, #ef4444, #dc2626); }
    .bar-p1 { background: linear-gradient(90deg, #f59e0b, #d97706); }
    .bar-p2 { background: linear-gradient(90deg, #22c55e, #16a34a); }
    .bar-p3 { background: linear-gradient(90deg, #06b6d4, #0891b2); }
    .chart-total { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; font-size: 0.9rem; }
    .chart-total .total-label { color: var(--text-muted); }
    .chart-total .total-value { font-weight: 700; color: var(--primary); }
    @media (max-width: 900px) { .charts-container { grid-template-columns: 1fr; } }
    .test-id { font-family: 'SF Mono', 'Consolas', monospace; font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; }
    /* Compact TOC */
    .toc { background: var(--bg-white); padding: 16px 20px; border-radius: 8px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08); border: 1px solid var(--border-light); }
    .toc h2 { font-size: 0.85rem; margin-bottom: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px; border-bottom: 1px solid var(--border-light); }
    .toc-nav { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .toc-nav a { color: var(--primary); text-decoration: none; padding: 6px 12px; border-radius: 4px; font-size: 0.8rem; font-weight: 500; background: var(--bg-light); border: 1px solid var(--border-light); transition: all 0.15s; display: inline-flex; align-items: center; gap: 6px; }
    .toc-nav a:hover { background: var(--primary); color: white; border-color: var(--primary); }
    .toc-nav .count { background: var(--primary); color: white; padding: 1px 6px; border-radius: 3px; font-size: 0.7rem; font-weight: 600; }
    .toc-nav a:hover .count { background: rgba(255,255,255,0.3); }
    .toc-divider { color: var(--border); margin: 0 4px; }
    /* Collapsible sections */
    .collapsible-header { cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: space-between; }
    .collapsible-header:hover { opacity: 0.8; }
    .collapse-icon { transition: transform 0.2s; font-size: 0.8rem; color: var(--text-muted); }
    .collapsed .collapse-icon { transform: rotate(-90deg); }
    .collapsible-content { overflow: hidden; transition: max-height 0.3s ease-out; }
    .collapsed .collapsible-content { max-height: 0 !important; padding-top: 0; padding-bottom: 0; }
    /* Info section collapsible styling */
    .info-section .info-content { overflow: hidden; transition: max-height 0.3s ease-out, padding 0.3s ease-out; max-height: 1000px; }
    .info-section.collapsed .info-content { max-height: 0 !important; padding-top: 0 !important; padding-bottom: 0 !important; }
    .info-section.collapsed .collapse-icon { transform: rotate(-90deg); }
    .info-header:hover { background: rgba(255,255,255,0.05); }
    /* Category section styling */
    .category-section { border-radius: 8px; margin-bottom: 16px; overflow: hidden; border-left: 4px solid var(--border-light); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .category-header { padding: 14px 18px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; }
    .category-header:hover { filter: brightness(0.97); }
    .category-header h3 { margin: 0; font-size: 0.95rem; display: flex; align-items: center; gap: 10px; font-weight: 600; }
    .category-header .badge { font-size: 0.7rem; padding: 3px 10px; border-radius: 12px; font-weight: 600; }
    .category-content { padding: 16px; }
    /* Product Factor Colors - SFDIPOT */
    .category-section.cat-structure { border-left-color: #3b82f6; }
    .category-section.cat-structure .category-header { background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); }
    .category-section.cat-structure .category-content { background: #f8faff; }
    .category-section.cat-structure .badge { background: #3b82f6; color: white; }
    .category-section.cat-function { border-left-color: #10b981; }
    .category-section.cat-function .category-header { background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); }
    .category-section.cat-function .category-content { background: #f8fdfb; }
    .category-section.cat-function .badge { background: #10b981; color: white; }
    .category-section.cat-data { border-left-color: #f59e0b; }
    .category-section.cat-data .category-header { background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); }
    .category-section.cat-data .category-content { background: #fffdf8; }
    .category-section.cat-data .badge { background: #f59e0b; color: white; }
    .category-section.cat-interfaces { border-left-color: #8b5cf6; }
    .category-section.cat-interfaces .category-header { background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); }
    .category-section.cat-interfaces .category-content { background: #faf9ff; }
    .category-section.cat-interfaces .badge { background: #8b5cf6; color: white; }
    .category-section.cat-platform { border-left-color: #14b8a6; }
    .category-section.cat-platform .category-header { background: linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%); }
    .category-section.cat-platform .category-content { background: #f8fefd; }
    .category-section.cat-platform .badge { background: #14b8a6; color: white; }
    .category-section.cat-operations { border-left-color: #6366f1; }
    .category-section.cat-operations .category-header { background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%); }
    .category-section.cat-operations .category-content { background: #f8f9ff; }
    .category-section.cat-operations .badge { background: #6366f1; color: white; }
    .category-section.cat-time { border-left-color: #ec4899; }
    .category-section.cat-time .category-header { background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%); }
    .category-section.cat-time .category-content { background: #fefafc; }
    .category-section.cat-time .badge { background: #ec4899; color: white; }
    .collapsed .category-content { display: none; }
    /* Table filters */
    .filter-row td { padding: 6px 8px; background: #f8fafc; }
    .filter-input, .filter-select { width: 100%; padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 0.75rem; background: white; }
    .filter-input:focus, .filter-select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 2px rgba(30,58,95,0.1); }
    .filter-input::placeholder { color: #94a3b8; }
    @media (max-width: 768px) {
      header h1 { font-size: 1.4rem; }
      table { display: block; overflow-x: auto; }
      .toc-nav { flex-direction: column; align-items: flex-start; }
    }
  </style>
  <script>
    function toggleSection(id) {
      const section = document.getElementById(id);
      if (section) {
        section.classList.toggle('collapsed');
      }
    }
    function expandAll() {
      document.querySelectorAll('.category-section').forEach(s => s.classList.remove('collapsed'));
    }
    function collapseAll() {
      document.querySelectorAll('.category-section').forEach(s => s.classList.add('collapsed'));
    }
  </script>
</head>
<body>
  <div class="container">
    <header>
      <h1>Product Factors assessment of: ${displayName}</h1>
      <div class="meta-inline" style="margin-top: 15px; padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.2); font-size: 0.9rem; opacity: 0.9;">
        <span>Report generated on <strong>${date}</strong></span>
        <span style="margin: 0 15px; opacity: 0.5;">|</span>
        <span>Total Test Ideas: <strong>${testSuite.tests.length}</strong></span>
        <span style="margin: 0 15px; opacity: 0.5;">|</span>
        <span>Product Factors covered: <strong>${Object.keys(testSuite.htsmCoverage.byCategory).length}/7</strong></span>
      </div>
      <nav class="toc" style="margin-top: 15px;">
        <div style="color: var(--text-muted); font-size: 0.85em; font-weight: 600; margin-bottom: 8px;">Quick Navigation</div>
        <div class="toc-nav">
          <a href="#risk">Prioritization</a>
          <a href="#charts">Overview</a>
          <span class="toc-divider">|</span>
          <span style="color: var(--text-muted); font-size: 0.85em; font-weight: 500;">Test Ideas:</span>
          ${categories.map(cat => {
            const count = byCategory[cat] || 0;
            if (count > 0) {
              return `<a href="#${cat.toLowerCase()}">${cat.charAt(0)}${cat.slice(1).toLowerCase()} <span class="count">${count}</span></a>`;
            }
            return '';
          }).filter(Boolean).join('\n          ')}
          <span class="toc-divider">|</span>
          <a href="#traceability">Req. Traceability</a>
        </div>
      </nav>
      <div class="info-section collapsed" style="background: rgba(255,255,255,0.1); border-radius: 8px; margin-top: 15px;">
        <div class="info-header" onclick="this.parentElement.classList.toggle('collapsed')" style="padding: 15px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 1.1rem; opacity: 0.95;">How can this report help you?</h3>
          <span class="collapse-icon" style="transition: transform 0.2s;">▼</span>
        </div>
        <div class="info-content" style="padding: 0 20px 20px 20px;">
          <blockquote style="margin: 0 0 15px 0; padding: 12px 15px; border-left: 3px solid rgba(255,255,255,0.4); font-style: italic; opacity: 0.9;">
            "Requirements are not an end in themselves, but a means to an end—the end of providing value to some person(s)." <span style="opacity: 0.7;">— Jerry Weinberg</span>
          </blockquote>
          <p style="margin: 0 0 12px 0; opacity: 0.9; line-height: 1.7;">In the <a href="https://talesoftesting.com/wp-content/uploads/2022/10/Lalitkumar-Bhamare-Quality-Conscious-Software-Delivery-eBook.pdf" style="color: #93c5fd; text-decoration: underline;">QCSD framework</a>, it is recommended to conduct Product Coverage Sessions or Requirements Engineering Sessions on a regular basis. These sessions can be carried out at the epic level or for complex feature requests and user stories. Testers in the team can analyze the epic or feature story using SFDIPOT (a product factors checklist from <a href="https://www.satisfice.com/download/heuristic-test-strategy-model" style="color: #93c5fd; text-decoration: underline;">Heuristic Test Strategy Model</a> by James Bach) and come up with test ideas, questions about risks, missing information, unconsidered dependencies, identified risks, and more.</p>
          <p style="margin: 0 0 12px 0; opacity: 0.9; line-height: 1.7;">A guided discussion based on this analysis can help teams uncover hidden risks, assess the completeness of the requirements, create a clearer development plan, identify gaps and dependencies, improve estimation with better information at hand, and most importantly - avoid rework caused by discovering issues halfway through development.</p>
          <p style="margin: 0; opacity: 0.9; line-height: 1.7;">If we want to save time and cost while still delivering quality software, it is always cheaper to do things right the first time. The purpose of this report is to facilitate Product Coverage Sessions and help teams achieve exactly that: doing things right the first time.</p>
        </div>
      </div>
      <div class="info-section collapsed" style="background: rgba(255,255,255,0.1); border-radius: 8px; margin-top: 10px;">
        <div class="info-header" onclick="this.parentElement.classList.toggle('collapsed')" style="padding: 15px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 1.1rem; opacity: 0.95;">When to generate this report?</h3>
          <span class="collapse-icon" style="transition: transform 0.2s;">▼</span>
        </div>
        <div class="info-content" style="padding: 0 20px 20px 20px;">
          <p style="margin: 0; opacity: 0.9; line-height: 1.7;">The sooner the better! As soon as testers can access Epic/User Stories or any project artifact they use for test design, this report should be generated. Generate this report and organize "Product Coverage Session" discussion with relevant stakeholders such as programmers, Product Owners, Designers, Architects etc.</p>
        </div>
      </div>
      <div class="info-section collapsed" style="background: rgba(255,255,255,0.1); border-radius: 8px; margin-top: 10px;">
        <div class="info-header" onclick="this.parentElement.classList.toggle('collapsed')" style="padding: 15px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 1.1rem; opacity: 0.95;">How to use this report?</h3>
          <span class="collapse-icon" style="transition: transform 0.2s;">▼</span>
        </div>
        <div class="info-content" style="padding: 0 20px 20px 20px;">
          <p style="margin: 0 0 12px 0; opacity: 0.9;">In this report you will find:</p>
          <div style="margin-left: 5px; line-height: 1.8;">
            <div style="margin-bottom: 8px;">☐ <strong>The Test Ideas</strong> generated for each product factor based on applicable subcategories. Review these test ideas carefully for context relevance, applicability and then derive specific test cases where needed.</div>
            <div style="margin-bottom: 8px;">☐ <strong>Automation Fitness</strong> recommendations against each test idea that can help for drafting suitable automation strategy.</div>
            <div>☐ <strong>The Clarifying Questions</strong> - that surface "unknown unknowns" by systematically checking which Product Factors (SFDIPOT) subcategories lack test coverage. Ensure that Epics, User Stories, Acceptance Criteria etc. are readily updated based on answers derived for each clarifying question listed.</div>
          </div>
          <p style="margin: 15px 0 0 0; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.2); opacity: 0.9; font-size: 0.95rem;">All in all, this report represents important and unique elements to be considered in the test strategy. <strong>Rebuild this report if there are updates made in Epics, User Stories, Acceptance Criteria etc.</strong></p>
          <p style="margin: 10px 0 0 0; opacity: 0.85; font-style: italic; font-size: 0.9rem;">Testers are advised to carefully evaluate all the information using critical thinking and context awareness.</p>
        </div>
      </div>
    </header>

    <section class="section" id="risk">
      <h2>Risk-Based Prioritization</h2>
      <p style="margin-bottom: 15px;">Test ideas are prioritized using a <strong>risk-based approach</strong> that considers:</p>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-bottom: 20px;">
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">Business Impact</strong><br>Potential revenue loss, customer trust damage, or regulatory penalties</div>
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">Likelihood of Failure</strong><br>Complexity of implementation, external dependencies, new technology</div>
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">User Exposure</strong><br>Number of users affected and frequency of feature usage</div>
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">Security &amp; Compliance</strong><br>Data protection requirements, payment processing, legal obligations</div>
      </div>
      <h3>Priority Legend</h3>
      <table>
        <thead>
          <tr><th>Priority</th><th>Risk Level</th><th>Description</th><th>Examples from this Epic</th></tr>
        </thead>
        <tbody>
          <tr><td><span class="priority priority-p0">P0</span></td><td><strong>Critical</strong></td><td>Security vulnerabilities or core functionality that could cause immediate financial loss, data breach, or complete service failure. Must be tested before any release.</td><td>${priorityExamples.P0}</td></tr>
          <tr><td><span class="priority priority-p1">P1</span></td><td><strong>High</strong></td><td>Core business flows and integrations essential for revenue generation. Failures would significantly impact user experience or business operations.</td><td>${priorityExamples.P1}</td></tr>
          <tr><td><span class="priority priority-p2">P2</span></td><td><strong>Medium</strong></td><td>Important features that support the core experience. Failures would cause inconvenience but workarounds exist.</td><td>${priorityExamples.P2}</td></tr>
          <tr><td><span class="priority priority-p3">P3</span></td><td><strong>Low</strong></td><td>Edge cases, cosmetic issues, or rarely used features. Failures have minimal business impact.</td><td>${priorityExamples.P3}</td></tr>
        </tbody>
      </table>
    </section>

    <section class="section" id="charts">
      <h2>Test Ideas Overview</h2>
      <div class="charts-container">
        <div class="chart-panel">
          <h3>Test Ideas by Product Factor (SFDIPOT)</h3>
          <div class="bar-chart">
            ${categories.map(cat => {
              const count = byCategory[cat] || 0;
              const maxCount = Math.max(...categories.map(c => byCategory[c] || 0));
              const width = maxCount > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 5 : 0) : 0;
              return `<div class="bar-row">
              <div class="bar-label">${cat.charAt(0) + cat.slice(1).toLowerCase()}</div>
              <div class="bar-track"><div class="bar-fill bar-${cat.toLowerCase()}" style="width: ${width}%"></div></div>
              <div class="bar-value">${count}</div>
            </div>`;
            }).join('\n            ')}
          </div>
          <div class="chart-total">
            <span class="total-label">Product Factors: 7/7</span>
            <span class="total-value">${testSuite.tests.length} Test Ideas</span>
          </div>
          <div style="margin-top: 10px; padding: 8px 12px; background: #fef9c3; border-radius: 4px; font-size: 0.8rem; color: #92400e;">
            <strong>Clarifying Questions:</strong> Review each category for questions requiring stakeholder input
          </div>
        </div>
        <div class="chart-panel">
          <h3>Test Ideas by Priority</h3>
          <div class="bar-chart">
            ${['P0', 'P1', 'P2', 'P3'].map(p => {
              const count = byPriority[p] || 0;
              const maxCount = Math.max(...['P0', 'P1', 'P2', 'P3'].map(pr => byPriority[pr] || 0));
              const width = maxCount > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 5 : 0) : 0;
              const labels: Record<string, string> = { 'P0': 'Critical', 'P1': 'High', 'P2': 'Medium', 'P3': 'Low' };
              return `<div class="bar-row">
              <div class="bar-label">${p} - ${labels[p]}</div>
              <div class="bar-track"><div class="bar-fill bar-${p.toLowerCase()}" style="width: ${width}%"></div></div>
              <div class="bar-value">${count}</div>
            </div>`;
            }).join('\n            ')}
          </div>

          <h4 style="font-size: 0.85rem; color: var(--text-dark); margin: 14px 0 8px 0; padding-top: 12px; border-top: 1px solid var(--border); font-weight: 600;">Test Ideas by Automation Fitness</h4>
          <div class="bar-chart" style="font-size: 0.85rem;">
            ${Object.entries(byAutomationFitness)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([fitness, count]) => {
                const maxCount = Math.max(...Object.values(byAutomationFitness));
                const width = maxCount > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 5 : 0) : 0;
                const labelMap: Record<string, string> = {
                  'Automate on API level': 'API level',
                  'Automate on E2E level': 'E2E level',
                  'Automate on Integration level': 'Integration level',
                  'Automate on Visual level': 'Visual level',
                  'Automated Performance Tests': 'Performance',
                  'Automated Concurrency Tests': 'Concurrency',
                  'Automated Browser Compatibility Test': 'Browser Compat',
                  'Automated DB Compatibility Test': 'DB Compat',
                  'Automated Device Compatibility Test': 'Device Compat',
                  'Automated API Compatibility Test': 'API Compat',
                  'Automated Platform Compatibility Test': 'Platform Compat',
                  'Automated Compatibility Test': 'Compatibility',
                  'Automated Security Tests': 'Security',
                  'Human testers must explore': 'Human Exploration'
                };
                const label = labelMap[fitness] || fitness;
                return `<div class="bar-row" style="margin-bottom: 4px;">
              <div class="bar-label" style="min-width: 100px; font-size: 0.8rem;">${label}</div>
              <div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: ${width}%; background: linear-gradient(90deg, #6366f1, #8b5cf6);"></div></div>
              <div class="bar-value" style="font-size: 0.8rem;">${count}</div>
            </div>`;
              }).join('\n            ')}
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="test-ideas">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--primary);">
        <h2 style="margin: 0; border: none; padding: 0;">Test Ideas by Product Factor</h2>
        <button onclick="toggleAllSections()" id="toggle-all-btn" style="background: var(--bg-light); border: 1px solid var(--border); padding: 6px 14px; border-radius: 4px; font-size: 0.8rem; cursor: pointer; font-weight: 500; color: var(--text-dark);">Collapse All</button>
      </div>
      <script>
        function toggleAllSections() {
          var sections = document.querySelectorAll('.category-section');
          var btn = document.getElementById('toggle-all-btn');
          var shouldCollapse = btn.textContent === 'Collapse All';
          sections.forEach(function(s) {
            if (shouldCollapse) { s.classList.add('collapsed'); }
            else { s.classList.remove('collapsed'); }
          });
          btn.textContent = shouldCollapse ? 'Expand All' : 'Collapse All';
        }
        function filterTable(tableId) {
          var table = document.getElementById(tableId);
          var filters = table.querySelectorAll('.filter-input, .filter-select');
          var rows = table.querySelectorAll('tbody tr');
          rows.forEach(function(row) {
            var show = true;
            filters.forEach(function(filter) {
              var col = parseInt(filter.dataset.col);
              var cell = row.cells[col];
              if (cell) {
                var text = cell.textContent.toLowerCase();
                var val = filter.value.toLowerCase();
                if (val && text.indexOf(val) === -1) { show = false; }
              }
            });
            row.style.display = show ? '' : 'none';
          });
        }
      </script>
      ${categories.map(cat => generateCategorySection(cat)).join('\n')}
    </section>

    <section class="section" id="traceability">
      <h2>Requirement Traceability</h2>
      <p style="margin-bottom: 15px;">Shows which Product Factors (SFDIPOT) have test ideas mapped to each requirement.</p>

      <div style="display: flex; gap: 20px; margin-bottom: 15px; font-size: 0.85rem;">
        <span><span style="display: inline-block; width: 12px; height: 12px; background: var(--success); border-radius: 2px; margin-right: 5px;"></span> Has test ideas</span>
        <span><span style="display: inline-block; width: 12px; height: 12px; background: var(--border); border-radius: 2px; margin-right: 5px;"></span> Gap - needs review</span>
      </div>

      <table style="font-size: 0.85rem;">
        <thead>
          <tr>
            <th style="min-width: 280px;">Requirement</th>
            <th style="text-align: center; width: 45px;" title="Structure">S</th>
            <th style="text-align: center; width: 45px;" title="Function">F</th>
            <th style="text-align: center; width: 45px;" title="Data">D</th>
            <th style="text-align: center; width: 45px;" title="Interfaces">I</th>
            <th style="text-align: center; width: 45px;" title="Platform">P</th>
            <th style="text-align: center; width: 45px;" title="Operations">O</th>
            <th style="text-align: center; width: 45px;" title="Time">T</th>
            <th style="text-align: center;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${traceabilityRows}
        </tbody>
      </table>

      ${reviewNeeded ? `
      <div style="margin-top: 20px; padding: 15px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;">
        <strong style="color: #1e40af;">ℹ️ Review Needed:</strong>
        <p style="margin: 8px 0; color: #1e3a8a; font-size: 0.9rem;">The following product factors have limited coverage. This may indicate either: (a) requirements need review for applicability, or (b) the product factor is not relevant for those requirements.</p>
        <ul style="margin: 10px 0 0 20px; color: #1e3a8a; font-size: 0.9rem;">
          ${reviewNeeded}
        </ul>
      </div>
      ` : ''}
    </section>
  </div>
</body>
</html>`;
  }
}

// Export singleton instance
export const productFactorsAssessment = new ProductFactorsAssessment();

// Export all types
export * from './types/htsm.types';
export { DocumentParser, documentParser } from './parsers/document-parser';
export { HTSMAnalyzer, htsmAnalyzer } from './analyzers/htsm-analyzer';
export { TestCaseGenerator, testCaseGenerator } from './generators/test-case-generator';
export { GherkinFormatter, gherkinFormatter } from './formatters/gherkin-formatter';
