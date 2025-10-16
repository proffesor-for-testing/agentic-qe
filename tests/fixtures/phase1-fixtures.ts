/**
 * Test Fixtures for Phase 1
 * Reusable test data for Multi-Model Router and Streaming tests
 */

export const modelConfigs = [
  {
    name: 'gpt-3.5-turbo',
    costPerToken: 0.000002,
    rateLimit: 10000,
    capabilities: ['simple-generation', 'unit-tests'],
    maxTokens: 4096
  },
  {
    name: 'gpt-4',
    costPerToken: 0.00006,
    rateLimit: 5000,
    capabilities: ['complex-generation', 'property-based', 'integration-tests'],
    maxTokens: 8192
  },
  {
    name: 'claude-sonnet-4.5',
    costPerToken: 0.00003,
    rateLimit: 8000,
    capabilities: ['security-tests', 'critical-analysis', 'architecture-review'],
    maxTokens: 200000
  },
  {
    name: 'claude-haiku',
    costPerToken: 0.000008,
    rateLimit: 15000,
    capabilities: ['fallback', 'simple-generation'],
    maxTokens: 100000
  }
];

export const sampleRequests = {
  simple: {
    type: 'test-generation',
    sourceCode: 'function add(a, b) { return a + b; }',
    complexity: 'simple',
    linesOfCode: 1,
    cyclomaticComplexity: 1
  },

  medium: {
    type: 'test-generation',
    sourceCode: `function validateEmail(email) {
      if (!email) return false;
      const regex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
      return regex.test(email);
    }`,
    complexity: 'medium',
    linesOfCode: 4,
    cyclomaticComplexity: 2
  },

  complex: {
    type: 'test-generation',
    sourceCode: `function quickSort(arr, compareFn) {
      if (arr.length <= 1) return arr;

      const pivot = arr[Math.floor(arr.length / 2)];
      const left = arr.filter(x => compareFn(x, pivot) < 0);
      const middle = arr.filter(x => compareFn(x, pivot) === 0);
      const right = arr.filter(x => compareFn(x, pivot) > 0);

      return [...quickSort(left, compareFn), ...middle, ...quickSort(right, compareFn)];
    }`,
    complexity: 'complex',
    linesOfCode: 9,
    cyclomaticComplexity: 6,
    requiresPropertyBased: true
  },

  security: {
    type: 'security-test-generation',
    sourceCode: `function authenticate(username, password) {
      const user = database.findUser(username);
      if (!user) return null;

      const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
      if (user.password === hashedPassword) {
        return generateToken(user);
      }

      return null;
    }`,
    complexity: 'critical',
    linesOfCode: 9,
    cyclomaticComplexity: 3,
    requiresSecurity: true
  },

  async: {
    type: 'test-generation',
    sourceCode: `async function fetchUserData(userId) {
      try {
        const response = await fetch(\`/api/users/\${userId}\`);
        if (!response.ok) throw new Error('User not found');
        return await response.json();
      } catch (error) {
        console.error('Error fetching user:', error);
        return null;
      }
    }`,
    complexity: 'medium',
    linesOfCode: 8,
    cyclomaticComplexity: 3,
    hasAsyncOperations: true,
    hasErrorHandling: true
  }
};

export const expectedSelections = {
  simple: {
    model: 'gpt-3.5-turbo',
    reason: 'simple task - cost-effective model',
    confidence: 0.9
  },

  medium: {
    model: 'gpt-3.5-turbo',
    reason: 'medium complexity - standard model sufficient',
    confidence: 0.8
  },

  complex: {
    model: 'gpt-4',
    reason: 'complex task requiring advanced reasoning',
    confidence: 0.8
  },

  security: {
    model: 'claude-sonnet-4.5',
    reason: 'security testing requires specialized analysis',
    confidence: 0.85
  },

  async: {
    model: 'gpt-4',
    reason: 'async operations require careful analysis',
    confidence: 0.75
  }
};

export const streamingEvents = {
  progress: {
    type: 'progress',
    progress: 50,
    data: { currentTest: 5, total: 10, completed: 5 },
    timestamp: Date.now()
  },

  result: {
    type: 'result',
    data: {
      name: 'test-example',
      status: 'passed',
      duration: 15.5,
      assertions: 3
    },
    timestamp: Date.now()
  },

  error: {
    type: 'error',
    data: {
      error: 'Assertion failed',
      testName: 'test-example',
      line: 42,
      fatal: false
    },
    timestamp: Date.now()
  },

  complete: {
    type: 'complete',
    data: {
      summary: {
        total: 10,
        passed: 8,
        failed: 2,
        skipped: 0,
        duration: 150.5
      },
      usage: {
        inputTokens: 250,
        outputTokens: 500
      }
    },
    timestamp: Date.now()
  }
};

export const costTrackingData = {
  usage1: {
    model: 'gpt-3.5-turbo',
    inputTokens: 100,
    outputTokens: 200,
    taskType: 'test-generation',
    testsGenerated: 5
  },

  usage2: {
    model: 'gpt-4',
    inputTokens: 150,
    outputTokens: 300,
    taskType: 'test-generation',
    testsGenerated: 10
  },

  usage3: {
    model: 'claude-sonnet-4.5',
    inputTokens: 200,
    outputTokens: 400,
    taskType: 'security-test',
    testsGenerated: 3
  }
};

export const expectedCosts = {
  'gpt-3.5-turbo': {
    perToken: 0.000002,
    for100Tokens: 0.0002,
    for1000Tokens: 0.002
  },

  'gpt-4': {
    perToken: 0.00006,
    for100Tokens: 0.006,
    for1000Tokens: 0.06
  },

  'claude-sonnet-4.5': {
    perToken: 0.00003,
    for100Tokens: 0.003,
    for1000Tokens: 0.03
  },

  'claude-haiku': {
    perToken: 0.000008,
    for100Tokens: 0.0008,
    for1000Tokens: 0.008
  }
};

export const featureFlagScenarios = {
  disabled: {
    multiModelRouter: false,
    streamingEnabled: true
  },

  enabled: {
    multiModelRouter: true,
    streamingEnabled: true
  },

  streamingOnly: {
    multiModelRouter: false,
    streamingEnabled: true
  },

  routingOnly: {
    multiModelRouter: true,
    streamingEnabled: false
  }
};

export const errorScenarios = {
  rateLimitError: {
    type: 'rate_limit',
    model: 'gpt-4',
    message: 'Rate limit exceeded',
    retryAfter: 60
  },

  apiError: {
    type: 'api_error',
    model: 'gpt-3.5-turbo',
    message: 'API request failed',
    statusCode: 500
  },

  timeoutError: {
    type: 'timeout',
    model: 'claude-sonnet-4.5',
    message: 'Request timeout',
    duration: 30000
  },

  authError: {
    type: 'auth_error',
    model: 'gpt-4',
    message: 'Invalid API key',
    statusCode: 401
  }
};

export const complexityFactors = {
  linesOfCode: {
    simple: { min: 0, max: 10 },
    medium: { min: 10, max: 50 },
    complex: { min: 50, max: 200 },
    veryComplex: { min: 200, max: Infinity }
  },

  cyclomaticComplexity: {
    simple: { min: 1, max: 5 },
    medium: { min: 5, max: 10 },
    complex: { min: 10, max: 20 },
    veryComplex: { min: 20, max: Infinity }
  },

  factors: [
    'low-loc',
    'high-loc',
    'low-complexity',
    'high-complexity',
    'async-operations',
    'error-handling',
    'property-based-required',
    'integration-test',
    'security-critical'
  ]
};

export const performanceTargets = {
  routing: {
    selectionLatency: {
      average: 50,    // ms
      p95: 100,       // ms
      p99: 150        // ms
    },
    complexityAnalysis: {
      average: 20,    // ms
      p95: 50,        // ms
      p99: 75         // ms
    }
  },

  streaming: {
    overhead: 5,      // %
    progressLatency: 10,  // ms
    eventsPerSecond: 1000 // min
  },

  costTracking: {
    recordLatency: 1,     // ms
    aggregationLatency: 10,  // ms
    exportLatency: 10     // ms
  },

  memory: {
    routingLeakLimit: 10,   // MB per 1000 operations
    streamingLeakLimit: 5,  // MB per 500 events
    costTrackingLeakLimit: 5 // MB per 1000 records
  },

  endToEnd: {
    singleRequest: 200,    // ms
    concurrentRequests: 1000  // ms for 10 requests
  }
};

export const testSuites = {
  unit: {
    name: 'Unit Tests',
    tests: [
      { name: 'test-add', fn: () => expect(1 + 1).toBe(2) },
      { name: 'test-subtract', fn: () => expect(2 - 1).toBe(1) },
      { name: 'test-multiply', fn: () => expect(2 * 3).toBe(6) }
    ]
  },

  integration: {
    name: 'Integration Tests',
    tests: [
      { name: 'test-api-call', fn: async () => { /* mock API */ } },
      { name: 'test-database', fn: async () => { /* mock DB */ } }
    ]
  },

  withFailures: {
    name: 'Tests with Failures',
    tests: [
      { name: 'passing-test-1', fn: () => expect(1).toBe(1) },
      { name: 'failing-test', fn: () => expect(1).toBe(2) },
      { name: 'passing-test-2', fn: () => expect(2).toBe(2) }
    ]
  }
};

export const memoryStoreFixtures = {
  modelSelectionHistory: {
    key: 'model-router:history',
    value: [
      { taskId: 'task-1', model: 'gpt-3.5-turbo', complexity: 0.2, timestamp: Date.now() - 10000 },
      { taskId: 'task-2', model: 'gpt-4', complexity: 0.8, timestamp: Date.now() - 5000 },
      { taskId: 'task-3', model: 'gpt-3.5-turbo', complexity: 0.3, timestamp: Date.now() }
    ]
  },

  costMetrics: {
    key: 'cost-tracker:metrics',
    value: {
      totalCost: 0.05,
      costByModel: {
        'gpt-3.5-turbo': 0.01,
        'gpt-4': 0.04
      },
      costByTaskType: {
        'test-generation': 0.04,
        'security-test': 0.01
      },
      testsGenerated: 100,
      averageCostPerTest: 0.0005
    }
  },

  complexityCache: {
    key: 'complexity:task-123',
    value: {
      score: 0.45,
      factors: ['medium-loc', 'medium-complexity'],
      reasoning: 'Medium complexity task'
    }
  }
};
