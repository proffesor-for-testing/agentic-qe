/**
 * Test Idea Transformer Service
 *
 * Transforms passive "Verify X" test patterns to active, observable test actions.
 * This is a RULE-BASED transformation that can be done programmatically.
 *
 * Pattern: "Verify X" → "[ACTION] that causes observable outcome"
 */

// ============================================================================
// Types
// ============================================================================

export interface TransformationRule {
  pattern: RegExp;
  transform: (match: RegExpMatchArray) => string;
  description: string;
}

export interface TransformationResult {
  original: string;
  transformed: string;
  ruleApplied: string;
  wasTransformed: boolean;
}

export interface TestIdeaTransformerConfig {
  preserveCase?: boolean;
  customRules?: TransformationRule[];
}

export interface TransformHTMLResult {
  html: string;
  transformations: TransformationResult[];
  verifyPatternCount: number;
  successfulTransformations: number;
}

// ============================================================================
// Action Verb Reference
// ============================================================================

const ACTION_VERBS = {
  interaction: ['Click', 'Tap', 'Swipe', 'Drag', 'Type', 'Submit', 'Navigate', 'Scroll', 'Hover', 'Focus'],
  trigger: ['Send', 'Inject', 'Force', 'Simulate', 'Load', 'Fire', 'Invoke', 'Initiate'],
  measurement: ['Measure', 'Time', 'Count', 'Profile', 'Benchmark', 'Record', 'Capture'],
  state: ['Set', 'Configure', 'Enable', 'Disable', 'Toggle', 'Switch', 'Change', 'Update'],
  observation: ['Confirm', 'Assert', 'Check', 'Observe', 'Monitor', 'Inspect'], // Used at END
} as const;

// ============================================================================
// Default Transformation Rules
// ============================================================================

const DEFAULT_RULES: TransformationRule[] = [
  // API/HTTP patterns
  {
    pattern: /^Verify\s+(?:the\s+)?API\s+returns?\s+(\d+)/i,
    transform: (m) => `Send request; confirm ${m[1]} response code`,
    description: 'API status code verification',
  },
  {
    pattern: /^Verify\s+(?:the\s+)?API\s+(?:returns?|responds?)/i,
    transform: () => `Send request; confirm expected response format`,
    description: 'Generic API response',
  },
  {
    pattern: /^Verify\s+(?:the\s+)?response\s+(?:includes?|contains?)\s+(.+)/i,
    transform: (m) => `Send request; confirm response contains ${m[1]}`,
    description: 'Response content verification',
  },

  // Error handling patterns
  {
    pattern: /^Verify\s+(?:an?\s+)?error\s+message\s+(?:is\s+)?display(?:s|ed)?/i,
    transform: () => `Trigger error condition; confirm user-friendly message appears`,
    description: 'Error message display',
  },
  {
    pattern: /^Verify\s+(?:the\s+)?validation\s+error/i,
    transform: () => `Submit invalid input; confirm validation error highlights field`,
    description: 'Validation error',
  },
  {
    pattern: /^Verify\s+(?:proper\s+)?error\s+handling/i,
    transform: () => `Inject error condition; confirm graceful handling with user feedback`,
    description: 'Error handling',
  },

  // Data persistence patterns
  {
    pattern: /^Verify\s+(?:the\s+)?data\s+(?:is\s+)?persist(?:s|ed)?/i,
    transform: () => `Submit data, refresh page; confirm data retained`,
    description: 'Data persistence',
  },
  {
    pattern: /^Verify\s+(?:the\s+)?data\s+(?:is\s+)?sav(?:es?|ed)/i,
    transform: () => `Submit form; confirm data saved to storage`,
    description: 'Data save',
  },

  // Integration patterns
  {
    pattern: /^Verify\s+(?:the\s+)?integration\s+(?:works?|functions?)/i,
    transform: () => `Inject mock response; confirm component handles integration correctly`,
    description: 'Integration verification',
  },

  // Performance patterns
  {
    pattern: /^Verify\s+(?:the\s+)?performance\s+(?:meets?\s+)?SLA/i,
    transform: () => `Load concurrent users; measure p95 latency against SLA threshold`,
    description: 'Performance SLA',
  },
  {
    pattern: /^Verify\s+(?:the\s+)?response\s+time/i,
    transform: () => `Execute operation under load; measure response time < threshold`,
    description: 'Response time',
  },

  // Accessibility patterns
  {
    pattern: /^Verify\s+(?:the\s+)?accessibility/i,
    transform: () => `Navigate via keyboard only; confirm all interactive elements reachable`,
    description: 'Accessibility',
  },
  {
    pattern: /^Verify\s+(?:the\s+)?screen\s+reader/i,
    transform: () => `Activate screen reader; confirm all content announced correctly`,
    description: 'Screen reader',
  },

  // UI interaction patterns
  {
    pattern: /^Verify\s+(?:the\s+)?sorting\s+(?:works?|functions?|functionality)/i,
    transform: () => `Click column header; confirm ascending/descending toggle with data reorder`,
    description: 'Sorting',
  },
  {
    pattern: /^Verify\s+(?:the\s+)?filter(?:ing)?\s+(?:works?|functions?)/i,
    transform: () => `Apply filter criteria; confirm results match filter conditions`,
    description: 'Filtering',
  },
  {
    pattern: /^Verify\s+(?:the\s+)?pagination\s+(?:works?|functions?)?/i,
    transform: () => `Navigate to different page; confirm correct item range displayed`,
    description: 'Pagination',
  },
  {
    pattern: /^Verify\s+(?:the\s+)?search\s+(?:works?|functions?|functionality)/i,
    transform: () => `Enter search query; confirm results match search criteria`,
    description: 'Search',
  },

  // State/behavior patterns
  {
    pattern: /^Verify\s+(?:the\s+)?fallback\s+(?:works?|behavior)/i,
    transform: () => `Disable primary service; confirm graceful degradation to fallback`,
    description: 'Fallback behavior',
  },
  {
    pattern: /^Verify\s+(?:the\s+)?(?:component|element)\s+render(?:s|ed)?/i,
    transform: () => `Mount component; confirm expected DOM structure appears`,
    description: 'Component render',
  },
  {
    pattern: /^Verify\s+(?:the\s+)?(?:button|link)\s+(?:is\s+)?(?:enabled|disabled)/i,
    transform: (m) => {
      const state = m[0].toLowerCase().includes('disabled') ? 'disabled' : 'enabled';
      return `Check element state; confirm ${state} attribute matches expected condition`;
    },
    description: 'Element state',
  },

  // Session/auth patterns
  {
    pattern: /^Verify\s+(?:the\s+)?(?:user\s+)?(?:session|authentication)/i,
    transform: () => `Perform login flow; confirm session established with valid token`,
    description: 'Session/auth',
  },
  {
    pattern: /^Verify\s+(?:the\s+)?(?:user\s+)?(?:is\s+)?(?:logged\s+)?(?:in|out)/i,
    transform: (m) => {
      const loggedIn = m[0].toLowerCase().includes('logged in') || m[0].toLowerCase().includes('logged out') === false;
      return loggedIn
        ? `Complete login; confirm user profile displayed`
        : `Click logout; confirm redirect to login page`;
    },
    description: 'Login state',
  },

  // Notification patterns
  {
    pattern: /^Verify\s+(?:a\s+)?(?:success|confirmation)\s+(?:message|notification)/i,
    transform: () => `Complete action; confirm success notification appears within 2 seconds`,
    description: 'Success notification',
  },

  // Generic fallback patterns (must be last)
  {
    pattern: /^Verify\s+(?:that\s+)?(?:the\s+)?(.+?)\s+(?:is|are)\s+(?:displayed|shown|visible)/i,
    transform: (m) => `Trigger display condition; confirm ${m[1]} visible in viewport`,
    description: 'Display verification',
  },
  {
    pattern: /^Verify\s+(?:that\s+)?(?:the\s+)?(.+?)\s+(?:works?|functions?)/i,
    transform: (m) => `Exercise ${m[1]}; confirm expected behavior observed`,
    description: 'Generic functionality',
  },
  {
    pattern: /^Verify\s+(?:that\s+)?(?:the\s+)?(.+)/i,
    transform: (m) => `Test ${m[1]}; confirm expected outcome`,
    description: 'Generic catch-all',
  },
];

// ============================================================================
// Service Interface
// ============================================================================

export interface ITestIdeaTransformerService {
  transform(testIdea: string): TransformationResult;
  transformHTML(html: string): TransformHTMLResult;
  countVerifyPatterns(text: string): number;
  getRules(): TransformationRule[];
}

// ============================================================================
// Test Idea Transformer Service
// ============================================================================

export class TestIdeaTransformerService implements ITestIdeaTransformerService {
  private rules: TransformationRule[];
  private config: Required<TestIdeaTransformerConfig>;

  constructor(config: TestIdeaTransformerConfig = {}) {
    this.config = {
      preserveCase: config.preserveCase ?? false,
      customRules: config.customRules ?? [],
    };

    // Custom rules take precedence
    this.rules = [...this.config.customRules, ...DEFAULT_RULES];
  }

  /**
   * Transform a single test idea
   */
  transform(testIdea: string): TransformationResult {
    const trimmed = testIdea.trim();

    // Check if it starts with "Verify"
    if (!trimmed.match(/^Verify\s/i)) {
      return {
        original: testIdea,
        transformed: testIdea,
        ruleApplied: 'none',
        wasTransformed: false,
      };
    }

    // Try each rule in order
    for (const rule of this.rules) {
      const match = trimmed.match(rule.pattern);
      if (match) {
        const transformed = rule.transform(match);
        return {
          original: testIdea,
          transformed,
          ruleApplied: rule.description,
          wasTransformed: true,
        };
      }
    }

    // No rule matched - shouldn't happen with catch-all, but just in case
    return {
      original: testIdea,
      transformed: testIdea,
      ruleApplied: 'none',
      wasTransformed: false,
    };
  }

  /**
   * Transform all "Verify" patterns in HTML content
   */
  transformHTML(html: string): TransformHTMLResult {
    const transformations: TransformationResult[] = [];

    // Find all <td> cells containing test ideas starting with "Verify"
    // Pattern: <td>Verify ... </td>
    const tdPattern = /<td>Verify\s[^<]+<\/td>/gi;

    let transformedHTML = html;
    let match;

    // Reset lastIndex for global regex
    while ((match = tdPattern.exec(html)) !== null) {
      const fullMatch = match[0];
      // Extract content between <td> and </td>
      const content = fullMatch.slice(4, -5); // Remove <td> and </td>

      const result = this.transform(content);
      transformations.push(result);

      if (result.wasTransformed) {
        transformedHTML = transformedHTML.replace(fullMatch, `<td>${result.transformed}</td>`);
      }
    }

    return {
      html: transformedHTML,
      transformations,
      verifyPatternCount: this.countVerifyPatterns(transformedHTML),
      successfulTransformations: transformations.filter(t => t.wasTransformed).length,
    };
  }

  /**
   * Count remaining "Verify" patterns
   */
  countVerifyPatterns(text: string): number {
    const matches = text.match(/<td>Verify\s/gi);
    return matches ? matches.length : 0;
  }

  /**
   * Get all transformation rules
   */
  getRules(): TransformationRule[] {
    return [...this.rules];
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createTestIdeaTransformerService(
  config?: TestIdeaTransformerConfig
): TestIdeaTransformerService {
  return new TestIdeaTransformerService(config);
}
