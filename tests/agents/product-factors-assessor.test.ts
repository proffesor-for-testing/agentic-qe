/**
 * Product Factors Assessor Agent Tests
 */

// Jest test framework - no imports needed, globals are available
import {
  ProductFactorsAssessment,
  productFactorsAssessment,
  documentParser,
  htsmAnalyzer,
  testCaseGenerator,
  gherkinFormatter,
  UserStory,
  FunctionalSpec,
  TechnicalArchitecture,
} from '../../src/agents/product-factors-assessor';

describe('Product Factors Assessor Agent', () => {
  describe('DocumentParser', () => {
    it('should parse user story from markdown format', () => {
      const markdown = `
## US-001: User Login

**As a** registered user
**I want** to login with my email and password
**So that** I can access my dashboard

### Acceptance Criteria
1. User can login with valid credentials
2. System validates email format
3. Password must be 8+ characters
4. Failed login shows error message
5. Account locks after 5 failed attempts
      `;

      const story = documentParser.parseUserStory(markdown);

      expect(story.id).toBe('US-001');
      expect(story.title).toContain('User Login');
      expect(story.asA).toBe('registered user');
      expect(story.iWant).toContain('login');
      expect(story.soThat).toContain('dashboard');
      expect(story.acceptanceCriteria).toHaveLength(5);
      expect(story.acceptanceCriteria[0].testable).toBe(true);
    });

    it('should extract testable elements from parsed documents', () => {
      const userStories: UserStory[] = [
        {
          id: 'US-001',
          title: 'User Login',
          asA: 'registered user',
          iWant: 'login with my credentials',
          soThat: 'I can access my account',
          acceptanceCriteria: [
            { id: 'AC-1', description: 'Validate email format', testable: true },
            { id: 'AC-2', description: 'Check password strength', testable: true },
          ],
        },
      ];

      const elements = documentParser.extractTestableElements(userStories, [], undefined);

      expect(elements.length).toBeGreaterThan(0);
      expect(elements.some((e) => e.type === 'action')).toBe(true);
      expect(elements.some((e) => e.type === 'condition')).toBe(true);
    });
  });

  describe('HTSMAnalyzer', () => {
    const sampleUserStories: UserStory[] = [
      {
        id: 'US-001',
        title: 'User Authentication',
        asA: 'user',
        iWant: 'to authenticate securely',
        soThat: 'my account is protected',
        acceptanceCriteria: [
          { id: 'AC-1', description: 'Validate password complexity', testable: true },
          { id: 'AC-2', description: 'Issue JWT token on success', testable: true },
          { id: 'AC-3', description: 'Lock account after 5 failures', testable: true },
        ],
      },
    ];

    const sampleSpecs: FunctionalSpec[] = [
      {
        id: 'SPEC-001',
        title: 'Authentication Spec',
        overview: 'User authentication requirements',
        requirements: [
          { id: 'REQ-1', description: 'Support OAuth2', type: 'functional', priority: 'P1', acceptance: [] },
        ],
        constraints: [],
        assumptions: [],
      },
    ];

    const sampleArchitecture: TechnicalArchitecture = {
      components: [
        { name: 'AuthService', type: 'service', description: 'Authentication service', dependencies: ['UserDB'], interfaces: ['REST API'] },
        { name: 'UserDB', type: 'database', description: 'User database', dependencies: [], interfaces: [] },
      ],
      interfaces: [
        { name: 'Auth API', type: 'rest', endpoints: ['/login', '/logout', '/refresh'], dataFormat: 'JSON' },
      ],
      dataFlows: [
        { from: 'AuthService', to: 'UserDB', dataType: 'credentials', protocol: 'TCP' },
      ],
      technologies: [
        { name: 'Node.js', category: 'framework' },
        { name: 'PostgreSQL', category: 'database' },
      ],
      constraints: [],
    };

    it('should analyze all 7 HTSM categories', () => {
      const elements = documentParser.extractTestableElements(sampleUserStories, sampleSpecs, sampleArchitecture);
      const results = htsmAnalyzer.analyzeAll(elements, sampleUserStories, sampleSpecs, sampleArchitecture);

      expect(results.size).toBe(7);
      expect(results.has('STRUCTURE')).toBe(true);
      expect(results.has('FUNCTION')).toBe(true);
      expect(results.has('DATA')).toBe(true);
      expect(results.has('INTERFACES')).toBe(true);
      expect(results.has('PLATFORM')).toBe(true);
      expect(results.has('OPERATIONS')).toBe(true);
      expect(results.has('TIME')).toBe(true);
    });

    it('should generate test opportunities for FUNCTION category', () => {
      const elements = documentParser.extractTestableElements(sampleUserStories, sampleSpecs, sampleArchitecture);
      const results = htsmAnalyzer.analyzeAll(elements, sampleUserStories, sampleSpecs, sampleArchitecture);

      const functionResult = results.get('FUNCTION')!;
      expect(functionResult.testOpportunities.length).toBeGreaterThan(0);

      // Should have business rules tests
      const businessRules = functionResult.testOpportunities.filter(
        (o) => o.htsmSubcategory === 'BusinessRules'
      );
      expect(businessRules.length).toBeGreaterThan(0);

      // Should have security tests
      const securityTests = functionResult.testOpportunities.filter(
        (o) => o.htsmSubcategory === 'SecurityRelated'
      );
      expect(securityTests.length).toBeGreaterThan(0);
    });

    it('should generate test opportunities for DATA category', () => {
      const elements = documentParser.extractTestableElements(sampleUserStories, sampleSpecs, sampleArchitecture);
      const results = htsmAnalyzer.analyzeAll(elements, sampleUserStories, sampleSpecs, sampleArchitecture);

      const dataResult = results.get('DATA')!;
      expect(dataResult.testOpportunities.length).toBeGreaterThan(0);

      // Should have cardinality tests
      const cardinalityTests = dataResult.testOpportunities.filter(
        (o) => o.htsmSubcategory === 'Cardinality'
      );
      expect(cardinalityTests.length).toBeGreaterThan(0);

      // Should have lifecycle tests
      const lifecycleTests = dataResult.testOpportunities.filter(
        (o) => o.htsmSubcategory === 'Lifecycle'
      );
      expect(lifecycleTests.length).toBeGreaterThan(0);
    });

    it('should generate test opportunities for INTERFACES category', () => {
      const elements = documentParser.extractTestableElements(sampleUserStories, sampleSpecs, sampleArchitecture);
      const results = htsmAnalyzer.analyzeAll(elements, sampleUserStories, sampleSpecs, sampleArchitecture);

      const interfacesResult = results.get('INTERFACES')!;
      expect(interfacesResult.testOpportunities.length).toBeGreaterThan(0);

      // Should have API tests from architecture
      const apiTests = interfacesResult.testOpportunities.filter(
        (o) => o.htsmSubcategory === 'ApiSdk'
      );
      expect(apiTests.length).toBeGreaterThan(0);
    });
  });

  describe('TestCaseGenerator', () => {
    const sampleUserStories: UserStory[] = [
      {
        id: 'US-001',
        title: 'Payment Processing',
        asA: 'customer',
        iWant: 'to process payments',
        soThat: 'I can complete my purchase',
        acceptanceCriteria: [
          { id: 'AC-1', description: 'Validate credit card number', testable: true },
          { id: 'AC-2', description: 'Process payment within 2 seconds', testable: true },
        ],
      },
    ];

    it('should generate test cases from HTSM analysis', () => {
      const elements = documentParser.extractTestableElements(sampleUserStories, [], undefined);
      const htsmResults = htsmAnalyzer.analyzeAll(elements, sampleUserStories, [], undefined);

      const testCases = testCaseGenerator.generateFromAnalysis(htsmResults, sampleUserStories);

      expect(testCases.length).toBeGreaterThan(0);
      expect(testCases[0]).toHaveProperty('id');
      expect(testCases[0]).toHaveProperty('name');
      expect(testCases[0]).toHaveProperty('htsm');
      expect(testCases[0]).toHaveProperty('priority');
      expect(testCases[0]).toHaveProperty('steps');
    });

    it('should generate test cases with Given-When-Then steps', () => {
      const elements = documentParser.extractTestableElements(sampleUserStories, [], undefined);
      const htsmResults = htsmAnalyzer.analyzeAll(elements, sampleUserStories, [], undefined);

      const testCases = testCaseGenerator.generateFromAnalysis(htsmResults, sampleUserStories);
      const testWithSteps = testCases.find((tc) => tc.steps.length > 0);

      expect(testWithSteps).toBeDefined();
      expect(testWithSteps!.steps.some((s) => s.type === 'given')).toBe(true);
      expect(testWithSteps!.steps.some((s) => s.type === 'when')).toBe(true);
      expect(testWithSteps!.steps.some((s) => s.type === 'then')).toBe(true);
    });

    it('should create test suite with HTSM coverage report', () => {
      const elements = documentParser.extractTestableElements(sampleUserStories, [], undefined);
      const htsmResults = htsmAnalyzer.analyzeAll(elements, sampleUserStories, [], undefined);
      const testCases = testCaseGenerator.generateFromAnalysis(htsmResults, sampleUserStories);

      const testSuite = testCaseGenerator.createTestSuite('Test Suite', testCases, sampleUserStories);

      expect(testSuite).toHaveProperty('htsmCoverage');
      expect(testSuite.htsmCoverage).toHaveProperty('overall');
      expect(testSuite.htsmCoverage).toHaveProperty('byCategory');
      expect(testSuite.htsmCoverage).toHaveProperty('gaps');
    });

    it('should create traceability matrix linking tests to requirements', () => {
      const elements = documentParser.extractTestableElements(sampleUserStories, [], undefined);
      const htsmResults = htsmAnalyzer.analyzeAll(elements, sampleUserStories, [], undefined);
      const testCases = testCaseGenerator.generateFromAnalysis(htsmResults, sampleUserStories);

      const testSuite = testCaseGenerator.createTestSuite('Test Suite', testCases, sampleUserStories);

      expect(testSuite.traceabilityMatrix.requirements).toHaveLength(sampleUserStories.length);
      expect(testSuite.traceabilityMatrix).toHaveProperty('coverage');
    });
  });

  describe('GherkinFormatter', () => {
    const sampleUserStory: UserStory = {
      id: 'US-001',
      title: 'User Login',
      asA: 'registered user',
      iWant: 'to login securely',
      soThat: 'I can access my account',
      acceptanceCriteria: [
        { id: 'AC-1', description: 'Valid credentials grant access', testable: true },
      ],
      tags: ['auth', 'security'],
    };

    it('should format test suite as Gherkin feature files', () => {
      const elements = documentParser.extractTestableElements([sampleUserStory], [], undefined);
      const htsmResults = htsmAnalyzer.analyzeAll(elements, [sampleUserStory], [], undefined);
      const testCases = testCaseGenerator.generateFromAnalysis(htsmResults, [sampleUserStory]);
      const testSuite = testCaseGenerator.createTestSuite('Test Suite', testCases, [sampleUserStory]);

      const features = gherkinFormatter.formatTestSuite(testSuite, [sampleUserStory]);

      expect(features.size).toBeGreaterThan(0);

      // Check that a feature file was created for the user story
      const featureContent = features.get('US-001.feature');
      expect(featureContent).toBeDefined();
      expect(featureContent).toContain('Feature:');
      expect(featureContent).toContain('Scenario');
      expect(featureContent).toContain('Given');
      expect(featureContent).toContain('When');
      expect(featureContent).toContain('Then');
    });

    it('should include HTSM tags in Gherkin scenarios', () => {
      const elements = documentParser.extractTestableElements([sampleUserStory], [], undefined);
      const htsmResults = htsmAnalyzer.analyzeAll(elements, [sampleUserStory], [], undefined);
      const testCases = testCaseGenerator.generateFromAnalysis(htsmResults, [sampleUserStory]);
      const testSuite = testCaseGenerator.createTestSuite('Test Suite', testCases, [sampleUserStory]);

      const features = gherkinFormatter.formatTestSuite(testSuite, [sampleUserStory]);
      const featureContent = features.get('US-001.feature') || '';

      expect(featureContent).toContain('@HTSM:');
      expect(featureContent).toContain('@Priority:');
    });
  });

  describe('ProductFactorsAssessment Integration', () => {
    it('should generate complete test output from user story markdown', async () => {
      const userStoryMarkdown = `
## US-001: User Registration

**As a** new user
**I want** to register an account
**So that** I can access the platform

### Acceptance Criteria
1. User can register with email and password
2. System validates email uniqueness
3. Password must meet complexity requirements
4. Confirmation email is sent
5. Account is created in pending state
      `;

      const result = await productFactorsAssessment.assess({
        userStories: userStoryMarkdown,
        outputFormat: 'all',
      });

      expect(result.testSuite).toBeDefined();
      expect(result.testSuite.tests.length).toBeGreaterThan(0);
      expect(result.htsmAnalysis.size).toBe(7);
      expect(result.gherkinFeatures).toBeDefined();
      expect(result.jsonOutput).toBeDefined();
      expect(result.markdownOutput).toBeDefined();
      expect(result.summary.totalTests).toBeGreaterThan(0);
      expect(result.summary.coverageScore).toBeGreaterThan(0);
    });

    it('should filter tests by HTSM category when specified', async () => {
      const userStoryMarkdown = `
## US-001: Data Processing

**As a** data analyst
**I want** to process large datasets
**So that** I can generate reports

### Acceptance Criteria
1. System processes CSV files
2. Data is validated before processing
3. Results are stored in database
      `;

      const result = await productFactorsAssessment.assess({
        userStories: userStoryMarkdown,
        includeCategories: ['DATA', 'FUNCTION'],
        outputFormat: 'json',
      });

      expect(result.testSuite.tests.length).toBeGreaterThan(0);

      // All tests should be in DATA or FUNCTION category
      const categories = result.testSuite.tests.map((t) => t.htsm.primary.category);
      expect(categories.every((c) => c === 'DATA' || c === 'FUNCTION')).toBe(true);
    });

    it('should include architecture analysis when provided', async () => {
      const architecture: TechnicalArchitecture = {
        components: [
          { name: 'API Gateway', type: 'api', description: 'Entry point', dependencies: ['AuthService'], interfaces: ['REST'] },
          { name: 'AuthService', type: 'service', description: 'Auth', dependencies: [], interfaces: [] },
        ],
        interfaces: [
          { name: 'Public API', type: 'rest', endpoints: ['/api/v1/*'], dataFormat: 'JSON' },
        ],
        dataFlows: [],
        technologies: [{ name: 'Docker', category: 'infrastructure' }],
        constraints: [],
      };

      const result = await productFactorsAssessment.assess({
        userStories: '## US-001: API Test\n\n**As a** developer\n**I want** API access\n**So that** I can integrate\n\n### AC\n1. API responds',
        architecture,
        outputFormat: 'json',
      });

      // Should have STRUCTURE tests from architecture
      const structureTests = result.testSuite.tests.filter(
        (t) => t.htsm.primary.category === 'STRUCTURE'
      );
      expect(structureTests.length).toBeGreaterThan(0);

      // Should have INTERFACES tests from architecture
      const interfaceTests = result.testSuite.tests.filter(
        (t) => t.htsm.primary.category === 'INTERFACES'
      );
      expect(interfaceTests.length).toBeGreaterThan(0);
    });
  });

  describe('Product Factors (SFDIPOT) Category Coverage', () => {
    const categories = ['STRUCTURE', 'FUNCTION', 'DATA', 'INTERFACES', 'PLATFORM', 'OPERATIONS', 'TIME'] as const;

    categories.forEach((category) => {
      it(`should generate tests for ${category} category`, async () => {
        const result = await productFactorsAssessment.assess({
          userStories: `
## US-001: ${category} Test

**As a** tester
**I want** to test ${category.toLowerCase()}
**So that** quality is ensured

### Acceptance Criteria
1. ${category} behavior is verified
          `,
          outputFormat: 'json',
        });

        const analysisResult = result.htsmAnalysis.get(category);
        expect(analysisResult).toBeDefined();
        expect(analysisResult!.testOpportunities.length).toBeGreaterThan(0);
      });
    });
  });
});
