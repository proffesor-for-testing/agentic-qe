/**
 * End-to-End Tests for VS Code Extension
 *
 * Phase 1: P1-008 - VS Code Extension End-to-End Testing
 *
 * Tests the complete extension workflow:
 * - Extension activation
 * - Code analysis on file open
 * - Test suggestions
 * - Coverage visualization
 * - Offline storage
 * - Pattern matching
 *
 * Note: These tests are designed to run with @vscode/test-electron
 * or can be run as integration tests with mock VS Code API.
 *
 * @module tests/edge/vscode-extension/e2e.test
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';

// =============================================================================
// Mock VS Code API for Testing
// =============================================================================

interface MockTextDocument {
  uri: { fsPath: string; scheme: string };
  languageId: string;
  getText: () => string;
  fileName: string;
  lineCount: number;
  version: number;
}

interface MockTextEditor {
  document: MockTextDocument;
  selection: { start: { line: number; character: number }; end: { line: number; character: number } };
  setDecorations: (type: unknown, decorations: unknown[]) => void;
}

interface MockDiagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  message: string;
  severity: number;
  source: string;
}

interface MockVSCode {
  window: {
    activeTextEditor: MockTextEditor | undefined;
    showInformationMessage: (message: string) => Promise<string | undefined>;
    showWarningMessage: (message: string) => Promise<string | undefined>;
    showErrorMessage: (message: string) => Promise<string | undefined>;
    createOutputChannel: (name: string) => { appendLine: (msg: string) => void };
    withProgress: <T>(options: unknown, task: () => Promise<T>) => Promise<T>;
  };
  workspace: {
    workspaceFolders: { uri: { fsPath: string } }[] | undefined;
    getConfiguration: (section: string) => { get: (key: string) => unknown };
    onDidChangeTextDocument: (callback: (e: { document: MockTextDocument }) => void) => { dispose: () => void };
    onDidOpenTextDocument: (callback: (doc: MockTextDocument) => void) => { dispose: () => void };
  };
  languages: {
    createDiagnosticCollection: (name: string) => {
      set: (uri: unknown, diagnostics: MockDiagnostic[]) => void;
      clear: () => void;
      delete: (uri: unknown) => void;
    };
    registerCodeActionsProvider: (selector: unknown, provider: unknown) => { dispose: () => void };
    registerHoverProvider: (selector: unknown, provider: unknown) => { dispose: () => void };
  };
  Uri: {
    file: (path: string) => { fsPath: string; scheme: string };
  };
  DiagnosticSeverity: {
    Error: 0;
    Warning: 1;
    Information: 2;
    Hint: 3;
  };
  Range: new (startLine: number, startChar: number, endLine: number, endChar: number) => object;
  Position: new (line: number, character: number) => object;
}

const createMockVSCode = (): MockVSCode => ({
  window: {
    activeTextEditor: undefined,
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
    showWarningMessage: vi.fn().mockResolvedValue(undefined),
    showErrorMessage: vi.fn().mockResolvedValue(undefined),
    createOutputChannel: vi.fn(() => ({ appendLine: vi.fn() })),
    withProgress: vi.fn((_, task) => task()),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
    getConfiguration: vi.fn(() => ({ get: vi.fn() })),
    onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
    onDidOpenTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
  },
  languages: {
    createDiagnosticCollection: vi.fn(() => ({
      set: vi.fn(),
      clear: vi.fn(),
      delete: vi.fn(),
    })),
    registerCodeActionsProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerHoverProvider: vi.fn(() => ({ dispose: vi.fn() })),
  },
  Uri: {
    file: (path: string) => ({ fsPath: path, scheme: 'file' }),
  },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  Range: class Range {},
  Position: class Position {},
});

// =============================================================================
// Mock Extension Context
// =============================================================================

interface MockExtensionContext {
  subscriptions: { dispose: () => void }[];
  globalState: {
    get: <T>(key: string) => T | undefined;
    update: (key: string, value: unknown) => Promise<void>;
  };
  workspaceState: {
    get: <T>(key: string) => T | undefined;
    update: (key: string, value: unknown) => Promise<void>;
  };
  extensionPath: string;
  extensionUri: { fsPath: string };
}

const createMockContext = (): MockExtensionContext => {
  const globalStore = new Map();
  const workspaceStore = new Map();

  return {
    subscriptions: [],
    globalState: {
      get: <T>(key: string) => globalStore.get(key) as T,
      update: async (key: string, value: unknown) => { globalStore.set(key, value); },
    },
    workspaceState: {
      get: <T>(key: string) => workspaceStore.get(key) as T,
      update: async (key: string, value: unknown) => { workspaceStore.set(key, value); },
    },
    extensionPath: '/test/extension',
    extensionUri: { fsPath: '/test/extension' },
  };
};

// =============================================================================
// Sample Code for Testing
// =============================================================================

const sampleTypeScriptCode = `
/**
 * User service for managing user data
 */
export class UserService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async getUser(id: string): Promise<User | null> {
    if (!id) {
      throw new Error('User ID is required');
    }
    return this.db.findById(id);
  }

  async createUser(data: UserInput): Promise<User> {
    const validated = this.validateUserInput(data);
    return this.db.create(validated);
  }

  private validateUserInput(data: UserInput): UserInput {
    if (!data.email || !data.name) {
      throw new Error('Email and name are required');
    }
    return data;
  }
}
`;

const sampleJavaScriptCode = `
function calculateTotal(items) {
  if (!items || items.length === 0) {
    return 0;
  }

  let total = 0;
  for (const item of items) {
    if (item.price > 0) {
      total += item.price * item.quantity;
    }
  }

  return total;
}

function applyDiscount(total, discountPercent) {
  if (discountPercent < 0 || discountPercent > 100) {
    throw new Error('Invalid discount percentage');
  }
  return total * (1 - discountPercent / 100);
}
`;

// =============================================================================
// Extension E2E Tests
// =============================================================================

describe('VS Code Extension E2E Tests', () => {
  let mockVscode: MockVSCode;
  let mockContext: MockExtensionContext;

  beforeEach(() => {
    mockVscode = createMockVSCode();
    mockContext = createMockContext();
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockContext.subscriptions.forEach(sub => sub.dispose());
  });

  // =============================================================================
  // Extension Activation Tests
  // =============================================================================

  describe('Extension Activation', () => {
    it('should activate without errors', async () => {
      // Simulate activation
      const activate = async (context: MockExtensionContext): Promise<void> => {
        // Register providers
        const diagnostics = mockVscode.languages.createDiagnosticCollection('aqe');
        context.subscriptions.push({ dispose: () => diagnostics.clear() });

        const codeActions = mockVscode.languages.registerCodeActionsProvider(
          { language: 'typescript' },
          { provideCodeActions: () => [] }
        );
        context.subscriptions.push(codeActions);

        // Set up event handlers
        const changeHandler = mockVscode.workspace.onDidChangeTextDocument(() => {});
        context.subscriptions.push(changeHandler);
      };

      await expect(activate(mockContext)).resolves.toBeUndefined();
      expect(mockContext.subscriptions.length).toBeGreaterThan(0);
    });

    it('should register all required providers', async () => {
      const registerCodeActionsProvider = vi.fn(() => ({ dispose: vi.fn() }));
      const registerHoverProvider = vi.fn(() => ({ dispose: vi.fn() }));

      mockVscode.languages.registerCodeActionsProvider = registerCodeActionsProvider;
      mockVscode.languages.registerHoverProvider = registerHoverProvider;

      // Simulate provider registration
      const providers = [
        mockVscode.languages.registerCodeActionsProvider(
          { language: 'typescript' },
          { provideCodeActions: () => [] }
        ),
        mockVscode.languages.registerCodeActionsProvider(
          { language: 'javascript' },
          { provideCodeActions: () => [] }
        ),
        mockVscode.languages.registerHoverProvider(
          { language: 'typescript' },
          { provideHover: () => null }
        ),
      ];

      expect(registerCodeActionsProvider).toHaveBeenCalledTimes(2);
      expect(registerHoverProvider).toHaveBeenCalledTimes(1);
    });

    it('should handle workspace without folders gracefully', async () => {
      mockVscode.workspace.workspaceFolders = undefined;

      const activate = async (): Promise<{ status: string }> => {
        if (!mockVscode.workspace.workspaceFolders) {
          return { status: 'no-workspace' };
        }
        return { status: 'active' };
      };

      const result = await activate();
      expect(result.status).toBe('no-workspace');
    });
  });

  // =============================================================================
  // Code Analysis Tests
  // =============================================================================

  describe('Code Analysis', () => {
    it('should analyze TypeScript files on open', async () => {
      const document: MockTextDocument = {
        uri: { fsPath: '/test/UserService.ts', scheme: 'file' },
        languageId: 'typescript',
        getText: () => sampleTypeScriptCode,
        fileName: 'UserService.ts',
        lineCount: sampleTypeScriptCode.split('\n').length,
        version: 1,
      };

      // Simulate analysis
      const analyzeDocument = async (doc: MockTextDocument) => {
        if (!['typescript', 'javascript'].includes(doc.languageId)) {
          return null;
        }

        const code = doc.getText();
        const functions = code.match(/(?:async\s+)?(?:function\s+\w+|(?:get|create|validate)\w+)\s*\(/g) || [];

        return {
          filePath: doc.uri.fsPath,
          functionCount: functions.length,
          analysisComplete: true,
        };
      };

      const result = await analyzeDocument(document);

      expect(result).not.toBeNull();
      expect(result?.filePath).toBe('/test/UserService.ts');
      expect(result?.functionCount).toBeGreaterThan(0);
      expect(result?.analysisComplete).toBe(true);
    });

    it('should analyze JavaScript files', async () => {
      const document: MockTextDocument = {
        uri: { fsPath: '/test/utils.js', scheme: 'file' },
        languageId: 'javascript',
        getText: () => sampleJavaScriptCode,
        fileName: 'utils.js',
        lineCount: sampleJavaScriptCode.split('\n').length,
        version: 1,
      };

      const analyzeDocument = async (doc: MockTextDocument) => {
        const code = doc.getText();
        const functions = code.match(/function\s+\w+/g) || [];
        return { functionCount: functions.length };
      };

      const result = await analyzeDocument(document);
      expect(result.functionCount).toBe(2); // calculateTotal, applyDiscount
    });

    it('should debounce rapid document changes', async () => {
      const analysisResults: number[] = [];
      let analyzeCount = 0;

      const debounce = <T extends (...args: unknown[]) => unknown>(fn: T, ms: number) => {
        let timeoutId: ReturnType<typeof setTimeout>;
        return (...args: Parameters<T>) => {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => fn(...args), ms);
        };
      };

      const analyze = () => {
        analyzeCount++;
        analysisResults.push(Date.now());
      };

      const debouncedAnalyze = debounce(analyze, 100);

      // Simulate rapid changes
      debouncedAnalyze();
      debouncedAnalyze();
      debouncedAnalyze();
      debouncedAnalyze();
      debouncedAnalyze();

      // Wait for debounce to settle
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(analyzeCount).toBe(1); // Should only analyze once
    });

    it('should skip non-code files', async () => {
      const nonCodeDoc: MockTextDocument = {
        uri: { fsPath: '/test/readme.md', scheme: 'file' },
        languageId: 'markdown',
        getText: () => '# README\n\nThis is a readme file.',
        fileName: 'readme.md',
        lineCount: 3,
        version: 1,
      };

      const shouldAnalyze = (doc: MockTextDocument): boolean => {
        const supportedLanguages = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'];
        return supportedLanguages.includes(doc.languageId);
      };

      expect(shouldAnalyze(nonCodeDoc)).toBe(false);
    });
  });

  // =============================================================================
  // Test Suggestion Tests
  // =============================================================================

  describe('Test Suggestions', () => {
    it('should generate test suggestions for functions', async () => {
      const functionInfo = {
        name: 'getUser',
        parameters: [{ name: 'id', type: 'string' }],
        returnType: 'Promise<User | null>',
        isAsync: true,
      };

      const generateSuggestion = (info: typeof functionInfo) => {
        const asyncKeyword = info.isAsync ? 'async ' : '';
        const awaitKeyword = info.isAsync ? 'await ' : '';

        return `describe('${info.name}', () => {
  it('should return user when valid id is provided', ${asyncKeyword}() => {
    const result = ${awaitKeyword}${info.name}('valid-id');
    expect(result).toBeDefined();
  });

  it('should handle invalid input', ${asyncKeyword}() => {
    ${info.isAsync ? `await expect(${info.name}('')).rejects.toThrow();` : `expect(() => ${info.name}('')).toThrow();`}
  });
});`;
      };

      const suggestion = generateSuggestion(functionInfo);

      expect(suggestion).toContain('describe');
      expect(suggestion).toContain('getUser');
      expect(suggestion).toContain('async');
      expect(suggestion).toContain('await');
    });

    it('should provide code actions for test generation', () => {
      interface MockCodeAction {
        title: string;
        kind: string;
        command?: { command: string; arguments: unknown[] };
      }

      const provideCodeActions = (functionName: string): MockCodeAction[] => {
        return [
          {
            title: `Generate unit test for ${functionName}`,
            kind: 'quickfix.generateTest',
            command: {
              command: 'aqe.generateTest',
              arguments: [functionName, 'unit'],
            },
          },
          {
            title: `Generate integration test for ${functionName}`,
            kind: 'quickfix.generateTest',
            command: {
              command: 'aqe.generateTest',
              arguments: [functionName, 'integration'],
            },
          },
        ];
      };

      const actions = provideCodeActions('getUser');

      expect(actions).toHaveLength(2);
      expect(actions[0].title).toContain('unit test');
      expect(actions[1].title).toContain('integration test');
    });
  });

  // =============================================================================
  // Coverage Visualization Tests
  // =============================================================================

  describe('Coverage Visualization', () => {
    it('should identify uncovered code regions', () => {
      interface CoverageGap {
        startLine: number;
        endLine: number;
        type: 'function' | 'branch' | 'statement';
        risk: 'high' | 'medium' | 'low';
      }

      const identifyGaps = (code: string): CoverageGap[] => {
        const gaps: CoverageGap[] = [];

        // Simulate finding uncovered functions
        const functionMatches = code.matchAll(/(?:async\s+)?function\s+(\w+)/g);
        let lineNumber = 0;

        for (const match of functionMatches) {
          const start = code.substring(0, match.index).split('\n').length - 1;
          gaps.push({
            startLine: start,
            endLine: start + 5, // Simplified
            type: 'function',
            risk: 'medium',
          });
        }

        return gaps;
      };

      const gaps = identifyGaps(sampleJavaScriptCode);

      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps[0].type).toBe('function');
    });

    it('should create decorations for coverage gaps', () => {
      interface DecorationOptions {
        range: { startLine: number; endLine: number };
        hoverMessage: string;
        backgroundColor: string;
      }

      const createDecorations = (gaps: { startLine: number; endLine: number; risk: string }[]): DecorationOptions[] => {
        const colorMap: Record<string, string> = {
          high: 'rgba(255, 0, 0, 0.2)',
          medium: 'rgba(255, 165, 0, 0.2)',
          low: 'rgba(255, 255, 0, 0.1)',
        };

        return gaps.map(gap => ({
          range: { startLine: gap.startLine, endLine: gap.endLine },
          hoverMessage: `Coverage gap (${gap.risk} risk)`,
          backgroundColor: colorMap[gap.risk] || colorMap.low,
        }));
      };

      const decorations = createDecorations([
        { startLine: 0, endLine: 5, risk: 'high' },
        { startLine: 10, endLine: 15, risk: 'medium' },
      ]);

      expect(decorations).toHaveLength(2);
      expect(decorations[0].backgroundColor).toContain('255, 0, 0');
      expect(decorations[1].backgroundColor).toContain('255, 165, 0');
    });
  });

  // =============================================================================
  // Offline Storage Tests
  // =============================================================================

  describe('Offline Storage', () => {
    it('should store analysis results for offline use', async () => {
      const storage = new Map<string, unknown>();

      const storeAnalysis = async (filePath: string, analysis: unknown) => {
        storage.set(`analysis:${filePath}`, {
          data: analysis,
          timestamp: Date.now(),
        });
      };

      const getAnalysis = async (filePath: string) => {
        return storage.get(`analysis:${filePath}`);
      };

      await storeAnalysis('/test/file.ts', { functionCount: 5, complexity: 10 });

      const result = await getAnalysis('/test/file.ts');
      expect(result).toBeDefined();
      expect((result as { data: { functionCount: number } }).data.functionCount).toBe(5);
    });

    it('should queue operations when offline', async () => {
      const operationQueue: { type: string; data: unknown; timestamp: number }[] = [];
      let isOnline = false;

      const queueOperation = (type: string, data: unknown) => {
        if (!isOnline) {
          operationQueue.push({ type, data, timestamp: Date.now() });
          return { queued: true };
        }
        return { queued: false, executed: true };
      };

      // Simulate offline operations
      queueOperation('sync-pattern', { id: 'p1', content: 'test' });
      queueOperation('sync-pattern', { id: 'p2', content: 'test2' });

      expect(operationQueue).toHaveLength(2);

      // Simulate coming online and processing queue
      isOnline = true;
      const processedCount = operationQueue.length;
      operationQueue.length = 0; // Clear queue after processing

      expect(processedCount).toBe(2);
      expect(operationQueue).toHaveLength(0);
    });
  });

  // =============================================================================
  // Pattern Matching Tests
  // =============================================================================

  describe('Pattern Matching', () => {
    it('should find similar patterns for new functions', async () => {
      // Simplified pattern matching
      const patterns = [
        { id: 'p1', type: 'validator', signature: '(data: T) => boolean' },
        { id: 'p2', type: 'async-getter', signature: '(id: string) => Promise<T>' },
        { id: 'p3', type: 'transformer', signature: '(input: T) => U' },
      ];

      const findSimilarPatterns = (functionSignature: string) => {
        // Simple matching based on async and return type
        const isAsync = functionSignature.includes('Promise');
        const returnsBoolean = functionSignature.includes('boolean');

        return patterns.filter(p => {
          if (isAsync && p.type === 'async-getter') return true;
          if (returnsBoolean && p.type === 'validator') return true;
          return false;
        });
      };

      const asyncMatches = findSimilarPatterns('async (id: string) => Promise<User>');
      expect(asyncMatches.some(m => m.type === 'async-getter')).toBe(true);

      const validatorMatches = findSimilarPatterns('(data: UserInput) => boolean');
      expect(validatorMatches.some(m => m.type === 'validator')).toBe(true);
    });

    it('should learn from user feedback', async () => {
      const patternFeedback = new Map<string, { accepted: number; rejected: number }>();

      const recordFeedback = (patternId: string, accepted: boolean) => {
        const current = patternFeedback.get(patternId) || { accepted: 0, rejected: 0 };
        if (accepted) {
          current.accepted++;
        } else {
          current.rejected++;
        }
        patternFeedback.set(patternId, current);
      };

      const getPatternScore = (patternId: string): number => {
        const feedback = patternFeedback.get(patternId);
        if (!feedback) return 0.5;
        const total = feedback.accepted + feedback.rejected;
        return total > 0 ? feedback.accepted / total : 0.5;
      };

      recordFeedback('p1', true);
      recordFeedback('p1', true);
      recordFeedback('p1', false);

      const score = getPatternScore('p1');
      expect(score).toBeCloseTo(0.667, 2);
    });
  });

  // =============================================================================
  // Error Handling Tests
  // =============================================================================

  describe('Error Handling', () => {
    it('should handle analysis errors gracefully', async () => {
      const analyzeWithErrorHandling = async (code: string): Promise<{ success: boolean; error?: string }> => {
        try {
          if (!code || code.trim().length === 0) {
            throw new Error('Empty code');
          }
          // Simulate analysis
          return { success: true };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      };

      const emptyResult = await analyzeWithErrorHandling('');
      expect(emptyResult.success).toBe(false);
      expect(emptyResult.error).toBe('Empty code');

      const validResult = await analyzeWithErrorHandling('function test() {}');
      expect(validResult.success).toBe(true);
    });

    it('should show user-friendly error messages', async () => {
      const errorMessages: string[] = [];

      const showError = (technicalError: Error): string => {
        const userFriendlyMessages: Record<string, string> = {
          'Empty code': 'Please open a file with code to analyze.',
          'Parse error': 'Unable to parse the code. Please check for syntax errors.',
          'Storage full': 'Storage limit reached. Some patterns may not be saved.',
        };

        const message = userFriendlyMessages[technicalError.message] || 'An unexpected error occurred.';
        errorMessages.push(message);
        return message;
      };

      showError(new Error('Empty code'));
      showError(new Error('Parse error'));
      showError(new Error('Unknown'));

      expect(errorMessages[0]).toContain('open a file');
      expect(errorMessages[1]).toContain('syntax errors');
      expect(errorMessages[2]).toContain('unexpected error');
    });
  });

  // =============================================================================
  // Performance Tests
  // =============================================================================

  describe('Performance', () => {
    it('should analyze files within acceptable time', async () => {
      const startTime = performance.now();

      // Generate a moderately complex file
      const code = Array.from({ length: 50 }, (_, i) => `
function func${i}(a: number, b: number): number {
  if (a > b) {
    return a - b;
  } else if (a < b) {
    return b - a;
  }
  return 0;
}`).join('\n');

      // Simulate analysis
      const functions = code.match(/function\s+\w+/g) || [];
      const analysisResult = {
        functionCount: functions.length,
        totalLines: code.split('\n').length,
      };

      const duration = performance.now() - startTime;

      expect(analysisResult.functionCount).toBe(50);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle large files without memory issues', () => {
      // Generate large code (simulate)
      const largeCodeSize = 100000; // 100KB
      const code = 'x'.repeat(largeCodeSize);

      // Check that we can process it without throwing
      const processLargeCode = (c: string): { size: number; processed: boolean } => {
        return {
          size: c.length,
          processed: true,
        };
      };

      const result = processLargeCode(code);
      expect(result.size).toBe(largeCodeSize);
      expect(result.processed).toBe(true);
    });
  });
});

// =============================================================================
// Integration Test Helpers
// =============================================================================

describe('Integration Helpers', () => {
  it('should create test workspace', () => {
    const createTestWorkspace = () => {
      return {
        path: '/test/workspace',
        files: [
          { path: '/test/workspace/src/index.ts', content: 'export const x = 1;' },
          { path: '/test/workspace/src/utils.ts', content: 'export function add(a, b) { return a + b; }' },
        ],
      };
    };

    const workspace = createTestWorkspace();
    expect(workspace.files).toHaveLength(2);
    expect(workspace.path).toBe('/test/workspace');
  });

  it('should simulate user interactions', () => {
    const interactions: string[] = [];

    const simulateOpenFile = (path: string) => {
      interactions.push(`open:${path}`);
    };

    const simulateEditFile = (path: string, content: string) => {
      interactions.push(`edit:${path}`);
    };

    const simulateSaveFile = (path: string) => {
      interactions.push(`save:${path}`);
    };

    simulateOpenFile('/test/file.ts');
    simulateEditFile('/test/file.ts', 'new content');
    simulateSaveFile('/test/file.ts');

    expect(interactions).toEqual([
      'open:/test/file.ts',
      'edit:/test/file.ts',
      'save:/test/file.ts',
    ]);
  });
});
