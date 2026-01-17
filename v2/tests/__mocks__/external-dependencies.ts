// Mock external dependencies for testing
// This file provides consistent mocks for external services and libraries

import { jest } from '@jest/globals';

// Mock axios for HTTP requests
export const mockAxios = {
  get: jest.fn(() => Promise.resolve({ data: {} })),
  post: jest.fn(() => Promise.resolve({ data: {} })),
  put: jest.fn(() => Promise.resolve({ data: {} })),
  delete: jest.fn(() => Promise.resolve({ data: {} })),
  create: jest.fn(() => mockAxios),
  defaults: {
    headers: {
      common: {},
      get: {},
      post: {},
      put: {},
      delete: {}
    },
    timeout: 5000
  },
  interceptors: {
    request: {
      use: jest.fn(),
      eject: jest.fn()
    },
    response: {
      use: jest.fn(),
      eject: jest.fn()
    }
  }
};

// Mock file system operations
export const mockFs = {
  readFile: jest.fn(() => Promise.resolve('mock file content')),
  writeFile: jest.fn(() => Promise.resolve()),
  mkdir: jest.fn(() => Promise.resolve()),
  rm: jest.fn(() => Promise.resolve()),
  stat: jest.fn(() => Promise.resolve({ isFile: () => true, isDirectory: () => false })),
  access: jest.fn(() => Promise.resolve()),
  readdir: jest.fn(() => Promise.resolve(['file1.ts', 'file2.ts']))
};

// Mock child process operations
export const mockChildProcess = {
  spawn: jest.fn(() => ({
    stdout: {
      on: jest.fn(),
      pipe: jest.fn()
    },
    stderr: {
      on: jest.fn(),
      pipe: jest.fn()
    },
    on: jest.fn(),
    kill: jest.fn()
  })),
  exec: jest.fn((cmd, callback) => {
    if (callback) {
      callback(null, 'mock output', '');
    }
    return {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn()
    };
  }),
  execSync: jest.fn(() => 'mock sync output')
};

// Mock path operations
export const mockPath = {
  join: jest.fn((...args) => args.join('/')),
  resolve: jest.fn((...args) => '/' + args.join('/')),
  dirname: jest.fn((path) => path.split('/').slice(0, -1).join('/')),
  basename: jest.fn((path) => path.split('/').pop()),
  extname: jest.fn((path) => '.' + path.split('.').pop()),
  relative: jest.fn(() => 'relative/path'),
  isAbsolute: jest.fn((path) => path.startsWith('/'))
};

// Mock database connections
export const mockDatabase = {
  connect: jest.fn(() => Promise.resolve()),
  disconnect: jest.fn(() => Promise.resolve()),
  query: jest.fn(() => Promise.resolve({ rows: [], rowCount: 0 })),
  transaction: jest.fn((fn) => fn(mockDatabase)),
  beginTransaction: jest.fn(() => Promise.resolve()),
  commit: jest.fn(() => Promise.resolve()),
  rollback: jest.fn(() => Promise.resolve())
};

// Mock Redis/Cache operations
export const mockCache = {
  get: jest.fn(() => Promise.resolve(null)),
  set: jest.fn(() => Promise.resolve('OK')),
  del: jest.fn(() => Promise.resolve(1)),
  exists: jest.fn(() => Promise.resolve(0)),
  expire: jest.fn(() => Promise.resolve(1)),
  flushall: jest.fn(() => Promise.resolve('OK'))
};

// Mock external AI services
export const mockAIService = {
  generateTests: jest.fn(() => Promise.resolve({
    tests: [
      {
        name: 'should test basic functionality',
        code: 'it("should work", () => { expect(true).toBe(true); });'
      }
    ],
    coverage: 85.5
  })),
  optimizeTestSuite: jest.fn(() => Promise.resolve({
    optimizations: ['remove redundant test', 'add edge case'],
    efficiency: 1.25
  })),
  predictTestEffectiveness: jest.fn(() => Promise.resolve({
    effectiveness: 0.92,
    confidence: 0.87
  }))
};

// Mock message queue/event bus
export const mockMessageBus = {
  publish: jest.fn(() => Promise.resolve()),
  subscribe: jest.fn(() => 'subscription-id'),
  unsubscribe: jest.fn(() => Promise.resolve()),
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  once: jest.fn()
};

// Mock metrics/monitoring services
export const mockMetrics = {
  recordMetric: jest.fn(),
  incrementCounter: jest.fn(),
  recordTiming: jest.fn(),
  recordHistogram: jest.fn(),
  setGauge: jest.fn(),
  flush: jest.fn(() => Promise.resolve())
};

// Mock logger
export const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  child: jest.fn(() => mockLogger),
  level: 'info'
};

// Mock configuration service
export const mockConfig = {
  get: jest.fn((key) => {
    const defaults: Record<string, any> = {
      'app.name': 'agentic-qe',
      'app.version': '1.0.0',
      'testing.timeout': 30000,
      'testing.parallelism': 4,
      'coverage.threshold': 80,
      'quality.gates': ['unit', 'integration', 'e2e']
    };
    return defaults[key] || 'mock-value';
  }),
  set: jest.fn(),
  has: jest.fn(() => true),
  getAll: jest.fn(() => ({})),
  validate: jest.fn(() => true)
};

// Mock notification service
export const mockNotificationService = {
  sendNotification: jest.fn(() => Promise.resolve()),
  sendEmail: jest.fn(() => Promise.resolve()),
  sendSlack: jest.fn(() => Promise.resolve()),
  createAlert: jest.fn(() => Promise.resolve()),
  subscribeToAlerts: jest.fn(() => 'subscription-id')
};

// Mock Git operations
export const mockGit = {
  clone: jest.fn(() => Promise.resolve()),
  pull: jest.fn(() => Promise.resolve()),
  push: jest.fn(() => Promise.resolve()),
  commit: jest.fn(() => Promise.resolve()),
  branch: jest.fn(() => Promise.resolve('main')),
  status: jest.fn(() => Promise.resolve({ staged: [], unstaged: [] })),
  log: jest.fn(() => Promise.resolve([])),
  diff: jest.fn(() => Promise.resolve(''))
};

// Mock Docker operations
export const mockDocker = {
  build: jest.fn(() => Promise.resolve()),
  run: jest.fn(() => Promise.resolve()),
  stop: jest.fn(() => Promise.resolve()),
  remove: jest.fn(() => Promise.resolve()),
  logs: jest.fn(() => Promise.resolve('container logs')),
  exec: jest.fn(() => Promise.resolve('command output'))
};

// Mock Kubernetes operations
export const mockKubernetes = {
  apply: jest.fn(() => Promise.resolve()),
  delete: jest.fn(() => Promise.resolve()),
  get: jest.fn(() => Promise.resolve({})),
  scale: jest.fn(() => Promise.resolve()),
  logs: jest.fn(() => Promise.resolve('pod logs')),
  exec: jest.fn(() => Promise.resolve('command output'))
};

// Mock cloud services (AWS, Azure, GCP)
export const mockCloudServices = {
  aws: {
    s3: {
      upload: jest.fn(() => Promise.resolve({ Location: 'https://s3.bucket/file' })),
      download: jest.fn(() => Promise.resolve(Buffer.from('file content'))),
      delete: jest.fn(() => Promise.resolve())
    },
    lambda: {
      invoke: jest.fn(() => Promise.resolve({ StatusCode: 200, Payload: '{}' })),
      deploy: jest.fn(() => Promise.resolve())
    }
  },
  azure: {
    blob: {
      upload: jest.fn(() => Promise.resolve()),
      download: jest.fn(() => Promise.resolve(Buffer.from('file content')))
    },
    functions: {
      deploy: jest.fn(() => Promise.resolve())
    }
  },
  gcp: {
    storage: {
      upload: jest.fn(() => Promise.resolve()),
      download: jest.fn(() => Promise.resolve(Buffer.from('file content')))
    },
    functions: {
      deploy: jest.fn(() => Promise.resolve())
    }
  }
};

// Export all mocks for easy importing
export const allMocks = {
  axios: mockAxios,
  fs: mockFs,
  childProcess: mockChildProcess,
  path: mockPath,
  database: mockDatabase,
  cache: mockCache,
  aiService: mockAIService,
  messageBus: mockMessageBus,
  metrics: mockMetrics,
  logger: mockLogger,
  config: mockConfig,
  notificationService: mockNotificationService,
  git: mockGit,
  docker: mockDocker,
  kubernetes: mockKubernetes,
  cloudServices: mockCloudServices
};

// Reset all mocks function
export const resetAllMocks = () => {
  Object.values(allMocks).forEach(mockCategory => {
    if (typeof mockCategory === 'object' && mockCategory !== null) {
      Object.values(mockCategory).forEach(mock => {
        if (jest.isMockFunction(mock)) {
          mock.mockReset();
        } else if (typeof mock === 'object' && mock !== null) {
          Object.values(mock).forEach(nestedMock => {
            if (jest.isMockFunction(nestedMock)) {
              nestedMock.mockReset();
            }
          });
        }
      });
    }
  });
};
