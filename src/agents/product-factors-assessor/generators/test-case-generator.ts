/**
 * Test Case Generator - Generates comprehensive test cases from HTSM analysis
 */

import { v4 as uuidv4 } from 'uuid';
import {
  TestCase,
  TestStep,
  TestPriority,
  TestType,
  HTSMCategory,
  HTSMSubcategory,
  HTSMCoverage,
  HTSMAnalysisResult,
  TestOpportunity,
  RiskAssessment,
  Traceability,
  UserStory,
  TestSuite,
  HTSMCoverageReport,
  TraceabilityMatrix,
  TraceabilityRow,
  CoverageGap,
} from '../types/htsm.types';

export class TestCaseGenerator {
  /**
   * Generate test cases from HTSM analysis results
   */
  generateFromAnalysis(
    htsmResults: Map<HTSMCategory, HTSMAnalysisResult>,
    userStories: UserStory[]
  ): TestCase[] {
    const testCases: TestCase[] = [];

    htsmResults.forEach((result, category) => {
      result.testOpportunities.forEach((opportunity) => {
        const testCase = this.generateTestCase(opportunity, userStories);
        testCases.push(testCase);
      });
    });

    return this.prioritizeAndDeduplicate(testCases);
  }

  /**
   * Generate a single test case from a test opportunity
   */
  private generateTestCase(opportunity: TestOpportunity, userStories: UserStory[]): TestCase {
    const id = `TC-${opportunity.htsmCategory.substring(0, 4)}-${uuidv4().substring(0, 8).toUpperCase()}`;

    return {
      id,
      name: this.generateTestName(opportunity),
      description: opportunity.description,
      type: this.determineTestType(opportunity),
      htsm: this.createHTSMCoverage(opportunity),
      priority: opportunity.priority,
      risk: this.assessRisk(opportunity),
      traceability: this.createTraceability(opportunity, userStories),
      preconditions: this.generatePreconditions(opportunity),
      steps: this.generateTestSteps(opportunity),
      expectedResults: this.generateExpectedResults(opportunity),
      testData: this.generateTestData(opportunity),
      tags: this.generateTags(opportunity),
      estimatedDurationMs: this.estimateDuration(opportunity),
      automated: this.canBeAutomated(opportunity),
    };
  }

  /**
   * Generate test name from opportunity with appropriate action verb
   */
  private generateTestName(opportunity: TestOpportunity): string {
    // Clean up the description - remove existing action verbs and all prefixes
    let description = opportunity.description
      // Remove action verbs at the start
      .replace(/^(Verify|Test|Check|Validate|Confirm|Ensure)\s+(that\s+)?/gi, '')
      // Remove HTSM category prefixes
      .replace(/^(structure|function|data|interfaces|platform|operations|time):\s*/gi, '')
      // Remove subcategory-style prefixes (e.g., "Security:", "Error handling for:", "Calculation:")
      .replace(/^(security|error handling for|calculation|verify|valid input processing for|invalid input rejection for|boundary values for|behavior with|api|endpoint|ui|data flow|time handling|database compatibility|compatibility with|memory|cpu|functionality for user role|common use|protection against|service):\s*/gi, '')
      // Remove "rest interface:" prefix
      .replace(/^rest interface:\s*/gi, '')
      .trim();

    // Handle special cases for better readability
    description = this.improveDescriptionReadability(description, opportunity);

    // Get appropriate action verb based on subcategory and context
    const actionVerb = this.getActionVerbForSubcategory(
      opportunity.htsmCategory,
      opportunity.htsmSubcategory,
      description
    );

    // Construct the final test idea name with proper capitalization
    let finalDescription = description.charAt(0).toLowerCase() + description.slice(1);

    // Remove any duplicate phrases that may have been introduced
    const result = `${actionVerb} ${finalDescription}`;
    return this.cleanupFinalTestName(result);
  }

  /**
   * Final cleanup of test name to remove awkward phrasing and duplicates
   */
  private cleanupFinalTestName(text: string): string {
    let cleaned = text
      // Fix common capitalization issues first
      .replace(/\bcPU\b/g, 'CPU')
      .replace(/\bcpu\b/gi, 'CPU')
      .replace(/\baPi\b/g, 'API')
      .replace(/\bApi\b/g, 'API')
      .replace(/\bUrl\b/g, 'URL')
      .replace(/\bHtml\b/g, 'HTML')
      .replace(/\bCss\b/g, 'CSS')
      .replace(/\bSql\b/g, 'SQL')
      .replace(/\bmySQL\b/gi, 'MySQL')
      .replace(/\bredis\b/g, 'Redis')
      .replace(/\bwebsocket\b/gi, 'WebSocket')
      .replace(/real-time Updates/g, 'real-time updates')
      .replace(/Real-time Updates/g, 'real-time updates')
      // Fix HTTP method capitalization (pOST -> POST, gET -> GET, etc.) - case insensitive prefix matching
      .replace(/\bp[oO][sS][tT]\b/g, 'POST')
      .replace(/\bg[eE][tT]\b/g, 'GET')
      .replace(/\bp[uU][tT]\b/g, 'PUT')
      .replace(/\bd[eE][lL][eE][tT][eE]\b/g, 'DELETE')
      .replace(/\bp[aA][tT][cC][hH]\b/g, 'PATCH')
      .replace(/\bh[eE][aA][dD]\b/g, 'HEAD')
      .replace(/\bo[pP][tT][iI][oO][nN][sS]\b/g, 'OPTIONS')
      // Fix "Verify that X usage within acceptable limits" -> "Verify that X usage is within acceptable limits"
      .replace(/Verify that (.+?) usage within acceptable limits/gi,
        'Verify that $1 usage is within acceptable limits')
      // Fix "Verify that API endpoint <name> (websocket)" patterns
      .replace(/Verify that API endpoint\s+(.+?)\s+\(websocket\)$/gi,
        'Verify that $1 WebSocket endpoint handles connections correctly')
      // Fix "Verify that API endpoint <name> (rest)" patterns - already exists but ensure it's comprehensive
      .replace(/Verify that API endpoint\s+real-time\s+Updates\s+\(websocket\)$/gi,
        'Verify that real-time updates WebSocket endpoint handles connections correctly')
      // Fix incomplete API endpoint sentences - the key pattern that needs to be sensible
      // Pattern: "Verify that API endpoint POST /api/events/:id/reminder" (incomplete)
      .replace(/Verify that API endpoint\s+(POST|GET|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\/\S+)$/gi,
        'Verify that $1 $2 endpoint processes requests correctly')
      // Pattern: "Verify that API endpoint /path" (no method, incomplete)
      .replace(/Verify that API endpoint\s+(\/\S+)$/gi,
        'Verify that $1 API endpoint responds correctly')
      // Pattern: "Verify that POST /api/path endpoint" (incomplete at end)
      .replace(/Verify that\s+(POST|GET|PUT|DELETE|PATCH)\s+(\/\S+)\s+endpoint$/gi,
        'Verify that $1 $2 endpoint handles requests correctly')
      // Pattern: "Verify endpoint: METHOD /path" - old pattern
      .replace(/Verify endpoint:\s*(POST|GET|PUT|DELETE|PATCH)\s*(\/\S+)/gi,
        'Verify that $1 $2 endpoint handles requests correctly')
      // Pattern: just "Verify that METHOD /path" without 'endpoint'
      .replace(/Verify that\s+(POST|GET|PUT|DELETE|PATCH)\s+(\/[^\s]+)$/gi,
        'Verify that $1 $2 endpoint handles requests correctly')
      // Fix "Verify that API endpoint <name> (rest)" patterns
      .replace(/Verify that API endpoint\s+(.+?)\s+\(rest\)$/gi,
        'Verify that $1 REST API endpoint responds correctly')
      .replace(/Verify that API endpoint\s+(.+?)\s+\(event\)$/gi,
        'Verify that $1 webhook event is processed correctly')
      // Fix standalone API references like "Verify that auth API"
      .replace(/Verify that\s+(\w+)\s+API$/gi,
        'Verify that $1 API integration works correctly')
      // Fix "Verify rejection of invalid input for X validates Y" -> better phrasing
      .replace(/rejection of invalid input for (.+?) validates (.+)/gi, (_, context, field) =>
        `rejection of invalid ${field} in ${context}`)
      // Fix "Validate processing of X validates Y"
      .replace(/processing of (.+?) validates (.+)/gi, (_, context, field) =>
        `correct processing of ${field} in ${context}`)
      // Fix "Check boundary values for X validates Y"
      .replace(/boundary values for (.+?) validates (.+)/gi, (_, context, field) =>
        `boundary values for ${field} in ${context}`)
      // Fix "Verify time handling for X validates Y" patterns
      .replace(/time handling for (.+?) validates (.+)/gi, (_, context, field) =>
        `time-sensitive validation of ${field} in ${context}`)
      // Fix vague/incomplete time handling patterns
      .replace(/Verify time handling for users can\s+/gi, 'Verify that users can ')
      .replace(/Verify time handling for (.+?) expires after/gi, 'Verify that $1 expires correctly after')
      .replace(/Verify time handling for dashboard shows/gi, 'Verify that dashboard displays')
      .replace(/Verify time handling for\s+/gi, 'Verify temporal behavior of ')
      // Fix "Verify that UI X" -> "Verify that X" (UI is redundant)
      .replace(/Verify that UI\s+/gi, 'Verify that ')
      // Fix double API patterns
      .replace(/(\w+)\s+API\s+API\s+endpoint/gi, '$1 API endpoint')
      // Fix "Verify that to " -> "Verify ability to "
      .replace(/Verify that to\s+/gi, 'Verify ability to ')
      // Fix "Verify that untitled Story"
      .replace(/Verify that untitled Story/gi, 'Verify core user journey workflow')
      // Fix "Verify that service:" prefix
      .replace(/Verify that service:\s*/gi, 'Verify that ')
      // Fix incomplete sentences ending with just a path
      .replace(/Verify that (\/\S+)$/gi, 'Verify that $1 endpoint responds correctly')
      // Fix incomplete patterns ending with HTTP method
      .replace(/Verify that\s+(POST|GET|PUT|DELETE|PATCH)$/gi,
        'Verify that $1 requests are handled correctly')
      // Fix patterns like "Verify data flow for X validates Y"
      .replace(/Verify data flow for (.+?) validates (.+)/gi,
        'Verify that $2 data flows correctly through $1')
      // Fix "Verify functionality for X validates Y" patterns
      .replace(/Verify functionality for (.+?) validates (.+)/gi,
        'Verify that $2 functionality works correctly for $1')
      // Fix awkward title case in user stories
      .replace(/three-Tier/gi, 'three-tier')
      .replace(/(\s)Membership(\s)/gi, '$1membership$2')
      .replace(/(\s)Model(\s|$)/gi, '$1model$2')
      .replace(/(\s)Registration(\s)/gi, '$1registration$2')
      .replace(/(\s)Verification(\s|$)/gi, '$1verification$2')
      .replace(/(\s)Integration(\s|$)/gi, '$1integration$2')
      .replace(/(\s)Paywall(\s)/gi, '$1paywall$2')
      .replace(/(\s)System(\s|$)/gi, '$1system$2')
      .replace(/(\s)Compliance(\s)/gi, '$1compliance$2')
      .replace(/(\s)Management(\s)/gi, '$1management$2')
      .replace(/(\s)Dashboard(\s|$)/gi, '$1dashboard$2')
      // Fix specific patterns
      .replace(/Email Verification/gi, 'email verification')
      .replace(/Data Management/gi, 'data management')
      // Fix duplicate words
      .replace(/displays current current/gi, 'displays current')
      .replace(/current current/gi, 'current')
      // Fix sentences starting with "Verify that" followed by a capitalized verb (service description)
      // e.g., "Verify that Manages author following" -> "Verify that the system manages author following correctly"
      // NOT case-insensitive to only match actual capitalized verbs
      .replace(/Verify that\s+(Manages|Handles|Provides|Creates|Processes|Stores|Tracks|Generates|Validates|Coordinates)\s+(.+)$/g,
        (_, verb, rest) => `Verify that the system ${verb.toLowerCase()} ${rest} correctly`)
      // Fix "Verify that Author metrics, rankings, and gamification" - capitalized noun phrases
      // NOT case-insensitive to only match actual capitalized starts
      .replace(/Verify that\s+([A-Z][a-z]+\s+[a-z,\s]+(?:and\s+[a-z]+)?)$/g,
        (_, nouns) => `Verify that ${nouns.toLowerCase()} features work correctly`)
      // Fix "Verify that reading list / bookmark functionality" patterns
      .replace(/Verify that\s+(.+?)\s+\/\s+(.+?)\s+functionality$/gi,
        'Verify that $1 and $2 functionality works correctly')
      // Fix sentences that end with just "functionality"
      .replace(/Verify that\s+(.+?)\s+functionality$/gi,
        'Verify that $1 functionality works correctly')
      // Fix sentences that end abruptly without making sense
      .replace(/Verify that\s+handles$/gi, 'Verify that the system handles requests correctly')
      .replace(/Verify that\s+processes$/gi, 'Verify that the system processes data correctly')
      // Fix incomplete sentences ending with component/service names (only if no verb phrase already present)
      .replace(/Verify that\s+(?!.*(?:correctly|properly|successfully|works|handles|processes))(.+?)\s+(Service|Component|Module|System)$/gi,
        'Verify that $1 $2 functions correctly')
      // Clean up sentences that are just "Verify that <noun>" without a verb
      .replace(/Verify that\s+([a-z]+)\s*$/gi, (match, word) => {
        // If it's just a single word without action, make it sensible
        if (!word.match(/(correctly|properly|successfully|works|handles|processes|responds)$/i)) {
          return `Verify that ${word} functions correctly`;
        }
        return match;
      });

    // Apply duplicate removal
    return this.removeDuplicatePhrases(cleaned);
  }

  /**
   * Remove duplicate phrases from the test name
   */
  private removeDuplicatePhrases(text: string): string {
    return text
      // Fix "Verify compatibility with compatibility with X" -> "Verify compatibility with X"
      .replace(/compatibility with compatibility with/gi, 'compatibility with')
      // Fix "Verify protection against protection against X" -> "Verify protection against X"
      .replace(/protection against protection against/gi, 'protection against')
      // Fix "Verify rejection of invalid input for invalid input" patterns
      .replace(/rejection of invalid input for invalid input/gi, 'rejection of invalid input')
      // Fix "Verify that API endpoint API:" patterns
      .replace(/API endpoint API:/gi, 'API endpoint')
      // Fix "Verify that UI UI" patterns
      .replace(/that UI UI/gi, 'that UI')
      // Fix "Verify data flow for data flow" patterns
      .replace(/data flow for data flow/gi, 'data flow for')
      // Fix "Verify behavior with behavior with" patterns
      .replace(/behavior with behavior with/gi, 'behavior with')
      // Fix double "that that"
      .replace(/that that/gi, 'that')
      // Fix "integrates correctly with X Service functions correctly" - double completion
      .replace(/integrates correctly with (.+?) (Service|Component|Module) functions correctly$/gi,
        'integrates correctly with $1 $2')
      // Fix "works correctly ... functions correctly" - double completion
      .replace(/(works|functions|operates) correctly (.+?) (Service|Component|Module) functions correctly$/gi,
        '$1 correctly with $2 $3')
      // Fix any sentence ending with "X correctly Y correctly"
      .replace(/(\w+ly)\s+(.+?)\s+\1$/gi, '$1 $2')
      // Clean up any double spaces
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Improve description readability based on context
   */
  private improveDescriptionReadability(description: string, opportunity: TestOpportunity): string {
    const subcategory = opportunity.htsmSubcategory;

    // Handle service health checks
    if (subcategory === 'Service' && description.toLowerCase().includes('service health')) {
      const serviceName = description.replace(/\s*service health and startup\s*/i, '').trim();
      return `${serviceName} service starts successfully and passes health checks`;
    }

    // Handle component structure tests
    if (description.toLowerCase().includes('component structure and dependencies')) {
      const componentName = description.replace(/\s*component structure and dependencies\s*/i, '').trim();
      return `${componentName} component has correct structure and dependencies`;
    }

    // Handle integration tests
    if (description.toLowerCase().includes('correctly integrates with')) {
      return description.replace('correctly integrates with', 'integrates correctly with');
    }

    // Handle data lifecycle tests
    if (subcategory === 'Lifecycle') {
      if (description.toLowerCase() === 'data creation') return 'data can be created successfully';
      if (description.toLowerCase() === 'data modification') return 'data can be modified successfully';
      if (description.toLowerCase() === 'data deletion') return 'data can be deleted successfully';
    }

    // Handle cardinality tests
    if (subcategory === 'Cardinality') {
      if (description.toLowerCase().includes('zero items')) return 'zero items (empty state)';
      if (description.toLowerCase().includes('one item')) return 'exactly one item';
      if (description.toLowerCase().includes('many items')) return 'many items (bulk data)';
    }

    // Handle timing tests
    if (subcategory === 'InputOutputTiming' && description.toLowerCase() === 'timeout handling') {
      return 'timeout handling works correctly';
    }

    // Handle concurrency tests
    if (subcategory === 'Concurrency') {
      if (description.toLowerCase().includes('concurrent user access')) return 'concurrent user access is handled correctly';
      if (description.toLowerCase().includes('race condition')) return 'race conditions are prevented';
    }

    // Handle pacing tests
    if (subcategory === 'Pacing') {
      if (description.toLowerCase().includes('rapid input')) return 'rapid input (burst traffic)';
      if (description.toLowerCase().includes('slow')) return 'slow/delayed input';
    }

    // Handle extreme use tests
    if (subcategory === 'ExtremeUse') {
      if (description.toLowerCase().includes('high load')) return 'high load conditions';
      if (description.toLowerCase().includes('maximum data')) return 'maximum data volume';
    }

    return description;
  }

  /**
   * Get appropriate action verb based on HTSM category and subcategory
   */
  private getActionVerbForSubcategory(
    category: HTSMCategory,
    subcategory: HTSMSubcategory,
    description: string
  ): string {
    // Subcategory-specific action verbs
    const subcategoryVerbs: Partial<Record<HTSMSubcategory, string>> = {
      // STRUCTURE subcategories
      Code: 'Verify that',
      Service: 'Check that',
      Hardware: 'Verify that',
      NonExecutableFiles: 'Validate that',
      Collateral: 'Verify that',

      // FUNCTION subcategories
      BusinessRules: 'Verify that',
      SecurityRelated: 'Verify that',
      ErrorHandling: 'Check that',
      Calculation: 'Validate that',
      MultiUserSocial: 'Verify that',
      Transformations: 'Verify that',
      StateTransitions: 'Check that',
      Multimedia: 'Verify that',
      Interactions: 'Verify that',
      Testability: 'Check that',

      // DATA subcategories
      InvalidNoise: 'Verify rejection of invalid input for',
      InputOutput: 'Validate processing of',
      Preset: 'Verify that',
      Persistent: 'Verify that',
      Interdependent: 'Verify that',
      SequencesCombinations: 'Verify that',
      Cardinality: 'Verify behavior with',
      BigLittle: 'Check boundary values for',
      Lifecycle: 'Verify',

      // INTERFACES subcategories
      UserInterfaces: 'Verify that UI',
      SystemInterfaces: 'Verify data flow for',
      ApiSdk: 'Verify that API endpoint',
      ImportExport: 'Validate that',

      // PLATFORM subcategories
      ExternalHardware: 'Verify compatibility with',
      ExternalSoftware: 'Verify compatibility with',
      EmbeddedComponents: 'Verify that',
      ProductFootprint: 'Verify that',

      // OPERATIONS subcategories
      Users: 'Verify functionality for',
      Environment: 'Verify behavior in',
      CommonUse: 'Verify that',
      UncommonUse: 'Verify that',
      ExtremeUse: 'Verify behavior under',
      DisfavoredUse: 'Verify protection against',

      // TIME subcategories
      TimeRelatedData: 'Verify time handling for',
      InputOutputTiming: 'Verify that',
      Pacing: 'Check behavior with',
      Concurrency: 'Verify that',
    };

    // Check if we have a specific verb for this subcategory
    const specificVerb = subcategoryVerbs[subcategory];
    if (specificVerb) {
      return specificVerb;
    }

    // Fall back to category-based defaults
    const categoryDefaults: Record<HTSMCategory, string> = {
      STRUCTURE: 'Verify that',
      FUNCTION: 'Verify that',
      DATA: 'Validate that',
      INTERFACES: 'Verify that',
      PLATFORM: 'Check that',
      OPERATIONS: 'Verify that',
      TIME: 'Check that',
    };

    return categoryDefaults[category] || 'Verify that';
  }

  /**
   * Determine test type based on HTSM category
   */
  private determineTestType(opportunity: TestOpportunity): TestType {
    switch (opportunity.htsmCategory) {
      case 'STRUCTURE':
        return 'integration';
      case 'FUNCTION':
        return opportunity.htsmSubcategory === 'SecurityRelated' ? 'security' : 'unit';
      case 'DATA':
        return 'unit';
      case 'INTERFACES':
        return opportunity.htsmSubcategory === 'ApiSdk' ? 'api' : 'e2e';
      case 'PLATFORM':
        return 'e2e';
      case 'OPERATIONS':
        return opportunity.htsmSubcategory === 'ExtremeUse' ? 'performance' : 'e2e';
      case 'TIME':
        return opportunity.htsmSubcategory === 'Concurrency' ? 'performance' : 'integration';
      default:
        return 'integration';
    }
  }

  /**
   * Create HTSM coverage classification
   */
  private createHTSMCoverage(opportunity: TestOpportunity): HTSMCoverage {
    return {
      primary: {
        category: opportunity.htsmCategory,
        subcategory: opportunity.htsmSubcategory,
        confidence: 0.9,
        rationale: `Direct mapping from ${opportunity.technique} analysis`,
      },
      secondary: [],
    };
  }

  /**
   * Assess risk for the test opportunity
   */
  private assessRisk(opportunity: TestOpportunity): RiskAssessment {
    const factors: string[] = [];
    let score = 0.5;

    // Priority-based risk
    if (opportunity.priority === 'P0') {
      score += 0.3;
      factors.push('critical-priority');
    } else if (opportunity.priority === 'P1') {
      score += 0.2;
      factors.push('high-priority');
    }

    // Category-based risk
    if (opportunity.htsmCategory === 'FUNCTION' && opportunity.htsmSubcategory === 'SecurityRelated') {
      score += 0.2;
      factors.push('security');
    }
    if (opportunity.htsmCategory === 'DATA' && opportunity.htsmSubcategory === 'InvalidNoise') {
      score += 0.15;
      factors.push('input-validation');
    }
    if (opportunity.htsmCategory === 'OPERATIONS' && opportunity.htsmSubcategory === 'DisfavoredUse') {
      score += 0.2;
      factors.push('misuse-prevention');
    }

    score = Math.min(score, 1);

    return {
      score,
      factors,
      businessImpact: score >= 0.8 ? 'critical' : score >= 0.6 ? 'high' : score >= 0.4 ? 'medium' : 'low',
      technicalComplexity: this.assessComplexity(opportunity),
    };
  }

  /**
   * Assess technical complexity
   */
  private assessComplexity(opportunity: TestOpportunity): 'high' | 'medium' | 'low' {
    const highComplexity = ['Concurrency', 'StateTransitions', 'Interactions', 'SecurityRelated'];
    const lowComplexity = ['UserInterfaces', 'CommonUse', 'Preset'];

    if (highComplexity.includes(opportunity.htsmSubcategory)) return 'high';
    if (lowComplexity.includes(opportunity.htsmSubcategory)) return 'low';
    return 'medium';
  }

  /**
   * Create traceability links
   */
  private createTraceability(opportunity: TestOpportunity, userStories: UserStory[]): Traceability {
    const traceability: Traceability = {};

    // Find linked user story
    for (const story of userStories) {
      if (opportunity.sourceElements.includes(story.id)) {
        traceability.userStoryId = story.id;
        traceability.epicId = story.epicId;
        break;
      }

      // Check acceptance criteria
      for (const ac of story.acceptanceCriteria) {
        if (opportunity.sourceElements.includes(ac.id)) {
          traceability.userStoryId = story.id;
          traceability.acceptanceCriteriaId = ac.id;
          traceability.epicId = story.epicId;
          break;
        }
      }
    }

    return traceability;
  }

  /**
   * Generate preconditions based on HTSM category
   */
  private generatePreconditions(opportunity: TestOpportunity): string[] {
    const preconditions: string[] = [];

    switch (opportunity.htsmCategory) {
      case 'FUNCTION':
        preconditions.push('System is in a known initial state');
        if (opportunity.htsmSubcategory === 'SecurityRelated') {
          preconditions.push('User authentication is configured');
        }
        break;
      case 'DATA':
        preconditions.push('Test data is prepared');
        preconditions.push('Database is in clean state');
        break;
      case 'INTERFACES':
        if (opportunity.htsmSubcategory === 'ApiSdk') {
          preconditions.push('API server is running');
          preconditions.push('Valid authentication token is available');
        }
        break;
      case 'PLATFORM':
        preconditions.push('Target platform is available');
        break;
      case 'OPERATIONS':
        preconditions.push('User account exists with appropriate role');
        break;
      case 'TIME':
        preconditions.push('System clock is synchronized');
        if (opportunity.htsmSubcategory === 'Concurrency') {
          preconditions.push('Multiple test clients are ready');
        }
        break;
    }

    return preconditions;
  }

  /**
   * Generate test steps in Given-When-Then format
   */
  private generateTestSteps(opportunity: TestOpportunity): TestStep[] {
    const steps: TestStep[] = [];

    // Generate context-specific steps
    switch (opportunity.htsmCategory) {
      case 'FUNCTION':
        steps.push(
          { type: 'given', text: 'the system is ready to process requests' },
          { type: 'when', text: `the ${opportunity.description.toLowerCase()} is executed` },
          { type: 'then', text: 'the operation completes successfully' },
          { type: 'and', text: 'the expected output is produced' }
        );
        break;

      case 'DATA':
        if (opportunity.htsmSubcategory === 'InvalidNoise') {
          steps.push(
            { type: 'given', text: 'invalid input data is prepared' },
            { type: 'when', text: 'the invalid data is submitted' },
            { type: 'then', text: 'the system rejects the input' },
            { type: 'and', text: 'an appropriate error message is displayed' }
          );
        } else {
          steps.push(
            { type: 'given', text: 'valid test data is prepared' },
            { type: 'when', text: 'the data is processed' },
            { type: 'then', text: 'the data is correctly transformed' },
            { type: 'and', text: 'data integrity is maintained' }
          );
        }
        break;

      case 'INTERFACES':
        if (opportunity.htsmSubcategory === 'ApiSdk') {
          steps.push(
            { type: 'given', text: 'a valid API request is prepared' },
            { type: 'and', text: 'authentication headers are set' },
            { type: 'when', text: 'the API endpoint is called' },
            { type: 'then', text: 'a valid response is returned' },
            { type: 'and', text: 'the response matches the expected schema' }
          );
        } else {
          steps.push(
            { type: 'given', text: 'the user is on the relevant page' },
            { type: 'when', text: 'the user interacts with the interface' },
            { type: 'then', text: 'the interface responds correctly' }
          );
        }
        break;

      case 'OPERATIONS':
        if (opportunity.htsmSubcategory === 'DisfavoredUse') {
          steps.push(
            { type: 'given', text: 'a malicious input is prepared' },
            { type: 'when', text: 'the malicious input is submitted' },
            { type: 'then', text: 'the system blocks the attempt' },
            { type: 'and', text: 'no security breach occurs' },
            { type: 'and', text: 'the attempt is logged' }
          );
        } else {
          steps.push(
            { type: 'given', text: `a user with the ${opportunity.htsmSubcategory.toLowerCase()} profile` },
            { type: 'when', text: 'the user performs the workflow' },
            { type: 'then', text: 'the workflow completes as expected' }
          );
        }
        break;

      case 'TIME':
        if (opportunity.htsmSubcategory === 'Concurrency') {
          steps.push(
            { type: 'given', text: 'multiple concurrent users are ready' },
            { type: 'when', text: 'all users perform operations simultaneously' },
            { type: 'then', text: 'all operations complete without deadlock' },
            { type: 'and', text: 'data consistency is maintained' }
          );
        } else {
          steps.push(
            { type: 'given', text: 'time-sensitive data is set up' },
            { type: 'when', text: 'the time condition is triggered' },
            { type: 'then', text: 'the system responds within the expected timeframe' }
          );
        }
        break;

      default:
        steps.push(
          { type: 'given', text: 'the preconditions are met' },
          { type: 'when', text: `${opportunity.description.toLowerCase()}` },
          { type: 'then', text: 'the expected result is achieved' }
        );
    }

    return steps;
  }

  /**
   * Generate expected results
   */
  private generateExpectedResults(opportunity: TestOpportunity): string[] {
    const results: string[] = [];

    switch (opportunity.htsmCategory) {
      case 'FUNCTION':
        results.push('Function executes successfully');
        results.push('Output matches specification');
        if (opportunity.htsmSubcategory === 'ErrorHandling') {
          results.push('Error is caught and handled gracefully');
          results.push('Appropriate error message is displayed');
        }
        break;

      case 'DATA':
        results.push('Data is correctly processed');
        results.push('Data integrity is maintained');
        if (opportunity.htsmSubcategory === 'InvalidNoise') {
          results.push('Invalid data is rejected');
          results.push('No data corruption occurs');
        }
        break;

      case 'INTERFACES':
        results.push('Interface responds correctly');
        if (opportunity.htsmSubcategory === 'ApiSdk') {
          results.push('HTTP status code is correct');
          results.push('Response body matches schema');
        }
        break;

      case 'PLATFORM':
        results.push('Feature works on target platform');
        results.push('No platform-specific issues');
        break;

      case 'OPERATIONS':
        results.push('User can complete the operation');
        if (opportunity.htsmSubcategory === 'DisfavoredUse') {
          results.push('Malicious input is blocked');
          results.push('Security is not compromised');
        }
        break;

      case 'TIME':
        results.push('Operation completes within time limit');
        if (opportunity.htsmSubcategory === 'Concurrency') {
          results.push('No race conditions occur');
          results.push('Data consistency is preserved');
        }
        break;
    }

    return results;
  }

  /**
   * Generate test data based on technique
   */
  private generateTestData(opportunity: TestOpportunity): Record<string, unknown> {
    const testData: Record<string, unknown> = {};

    switch (opportunity.technique) {
      case 'boundary-value-analysis':
        testData.boundaryValues = {
          min: 'minimum_value',
          justAboveMin: 'min + 1',
          nominal: 'typical_value',
          justBelowMax: 'max - 1',
          max: 'maximum_value',
        };
        break;

      case 'equivalence-partitioning':
        testData.partitions = {
          valid: 'representative_valid_value',
          invalid: 'representative_invalid_value',
        };
        break;

      case 'decision-table':
        testData.conditions = ['condition1', 'condition2'];
        testData.combinations = [
          { condition1: true, condition2: true, expectedResult: 'result_A' },
          { condition1: true, condition2: false, expectedResult: 'result_B' },
          { condition1: false, condition2: true, expectedResult: 'result_C' },
          { condition1: false, condition2: false, expectedResult: 'result_D' },
        ];
        break;

      case 'error-guessing':
        testData.errorCases = [
          'empty_input',
          'null_value',
          'special_characters',
          'sql_injection_attempt',
          'xss_attempt',
        ];
        break;
    }

    return testData;
  }

  /**
   * Generate tags for the test case
   */
  private generateTags(opportunity: TestOpportunity): string[] {
    const tags: string[] = [
      `htsm:${opportunity.htsmCategory.toLowerCase()}`,
      `htsm:${opportunity.htsmSubcategory}`,
      `technique:${opportunity.technique}`,
      `priority:${opportunity.priority}`,
    ];

    // Add category-specific tags
    if (opportunity.htsmSubcategory === 'SecurityRelated' || opportunity.htsmSubcategory === 'DisfavoredUse') {
      tags.push('security');
    }
    if (opportunity.htsmCategory === 'TIME' && opportunity.htsmSubcategory === 'Concurrency') {
      tags.push('concurrency');
    }
    if (opportunity.priority === 'P0') {
      tags.push('critical');
      tags.push('smoke');
    }

    return tags;
  }

  /**
   * Estimate test duration in milliseconds
   */
  private estimateDuration(opportunity: TestOpportunity): number {
    const baseTime = 1000; // 1 second base

    // Multiply based on complexity
    switch (opportunity.htsmCategory) {
      case 'STRUCTURE':
        return baseTime * 3;
      case 'FUNCTION':
        return baseTime * 2;
      case 'DATA':
        return baseTime * 2;
      case 'INTERFACES':
        return opportunity.htsmSubcategory === 'UserInterfaces' ? baseTime * 5 : baseTime * 3;
      case 'PLATFORM':
        return baseTime * 10;
      case 'OPERATIONS':
        return baseTime * 5;
      case 'TIME':
        return opportunity.htsmSubcategory === 'Concurrency' ? baseTime * 15 : baseTime * 3;
      default:
        return baseTime * 2;
    }
  }

  /**
   * Determine if test can be automated
   */
  private canBeAutomated(opportunity: TestOpportunity): boolean {
    // Most tests can be automated except certain exploratory scenarios
    const hardToAutomate = ['Environment', 'Aesthetics', 'Usability'];
    return !hardToAutomate.some((h) => opportunity.htsmSubcategory.includes(h));
  }

  /**
   * Prioritize and remove duplicate test cases
   */
  private prioritizeAndDeduplicate(testCases: TestCase[]): TestCase[] {
    // Sort by priority (P0 first) then by risk score
    const sorted = testCases.sort((a, b) => {
      const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.risk.score - a.risk.score;
    });

    // Remove duplicates based on description similarity
    const seen = new Set<string>();
    return sorted.filter((tc) => {
      const key = tc.description.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Create a complete test suite with coverage report
   */
  createTestSuite(
    name: string,
    testCases: TestCase[],
    userStories: UserStory[]
  ): TestSuite {
    return {
      id: `TS-${uuidv4().substring(0, 8).toUpperCase()}`,
      name,
      description: `HTSM-based test suite generated from ${userStories.length} user stories`,
      sourceRequirements: userStories.map((s) => s.id),
      tests: testCases,
      htsmCoverage: this.calculateHTSMCoverage(testCases),
      traceabilityMatrix: this.buildTraceabilityMatrix(testCases, userStories),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Calculate HTSM coverage report
   */
  private calculateHTSMCoverage(testCases: TestCase[]): HTSMCoverageReport {
    const categories: HTSMCategory[] = [
      'STRUCTURE',
      'FUNCTION',
      'DATA',
      'INTERFACES',
      'PLATFORM',
      'OPERATIONS',
      'TIME',
    ];

    const byCategory: Record<HTSMCategory, { category: HTSMCategory; testCount: number; subcategories: Record<string, number>; coverage: number }> = {} as any;

    categories.forEach((cat) => {
      const categoryTests = testCases.filter((tc) => tc.htsm.primary.category === cat);
      const subcategories: Record<string, number> = {};

      categoryTests.forEach((tc) => {
        const sub = tc.htsm.primary.subcategory;
        subcategories[sub] = (subcategories[sub] || 0) + 1;
      });

      byCategory[cat] = {
        category: cat,
        testCount: categoryTests.length,
        subcategories,
        coverage: categoryTests.length > 0 ? 100 : 0,
      };
    });

    // Identify gaps
    const gaps: CoverageGap[] = [];
    categories.forEach((cat) => {
      if (byCategory[cat].testCount === 0) {
        gaps.push({
          category: cat,
          severity: cat === 'FUNCTION' || cat === 'DATA' ? 'critical' : 'medium',
          recommendation: `Add tests for ${cat} category`,
        });
      }
    });

    const overall = Math.round(
      (categories.filter((c) => byCategory[c].testCount > 0).length / categories.length) * 100
    );

    return {
      overall,
      byCategory,
      gaps,
    };
  }

  /**
   * Build traceability matrix with intelligent linking
   * Links tests to user stories by:
   * 1. Direct userStoryId match
   * 2. Tag-based matching (test tags vs user story tags)
   * 3. Content-based matching (test description contains user story keywords)
   * 4. Cross-cutting categories (PLATFORM, TIME) apply to all requirements
   */
  private buildTraceabilityMatrix(testCases: TestCase[], userStories: UserStory[]): TraceabilityMatrix {
    // Cross-cutting categories that apply to all user stories
    const crossCuttingCategories: HTSMCategory[] = ['PLATFORM', 'TIME'];
    const crossCuttingTests = testCases.filter(tc =>
      crossCuttingCategories.includes(tc.htsm.primary.category)
    );

    const rows: TraceabilityRow[] = userStories.map((story) => {
      // Get directly linked tests
      const directlyLinked = testCases.filter(
        (tc) => tc.traceability.userStoryId === story.id
      );

      // Get tests linked by tags (for architecture-derived tests without userStoryId)
      const storyTags = new Set((story.tags || []).map(t => t.toLowerCase()));
      const storyKeywords = this.extractKeywords(story.title + ' ' + story.asA + ' ' + story.iWant);

      const tagLinked = testCases.filter((tc) => {
        // Skip if already directly linked or cross-cutting (handled separately)
        if (tc.traceability.userStoryId) return false;
        if (crossCuttingCategories.includes(tc.htsm.primary.category)) return false;

        // Check tag overlap
        const hasTagMatch = tc.tags.some(tag => storyTags.has(tag.toLowerCase()));
        if (hasTagMatch) return true;

        // Check keyword overlap in test name/description
        const testKeywords = this.extractKeywords(tc.name + ' ' + tc.description);
        const keywordOverlap = testKeywords.filter(k => storyKeywords.includes(k)).length;
        return keywordOverlap >= 2; // At least 2 keyword matches
      });

      // Combine all linked tests including cross-cutting ones
      const linkedTests = [...directlyLinked, ...tagLinked, ...crossCuttingTests];
      const uniqueTests = Array.from(new Map(linkedTests.map(tc => [tc.id, tc])).values());

      return {
        requirementId: story.id,
        requirementDescription: story.title,
        testCaseIds: uniqueTests.map((tc) => tc.id),
        htsmCategories: [...new Set(uniqueTests.map((tc) => tc.htsm.primary.category))] as HTSMCategory[],
        coverage: uniqueTests.length === 0 ? 'none' : uniqueTests.length >= 3 ? 'full' : 'partial',
      };
    });

    const coveredCount = rows.filter((r) => r.coverage !== 'none').length;
    const coverage = Math.round((coveredCount / rows.length) * 100);

    return {
      requirements: rows,
      coverage,
    };
  }

  /**
   * Extract meaningful keywords from text for matching
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then',
      'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
      'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own',
      'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'or', 'if',
      'that', 'this', 'these', 'those', 'i', 'my', 'me', 'we', 'our', 'you', 'your',
      'they', 'their', 'it', 'its', 'verify', 'test', 'check', 'ensure', 'validate'
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }
}

export const testCaseGenerator = new TestCaseGenerator();
