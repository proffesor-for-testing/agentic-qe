/**
 * TestSuggestionProvider - Code Action Provider for Test Suggestions
 *
 * Provides intelligent test suggestions as VS Code code actions.
 * Uses pattern matching from @ruvector/edge to find similar test patterns
 * and suggest relevant tests for functions and classes.
 *
 * Enhanced with:
 * - Lightbulb with "Generate Tests" option
 * - Quick fix for low testability scores
 * - Integration with InlineTestHint
 * - Testability scoring
 *
 * @module vscode-extension/providers/TestSuggestionProvider
 * @version 0.2.0
 */

import * as vscode from 'vscode';
import type { AnalysisService, TestSuggestion, FunctionInfo } from '../services/AnalysisService';

/**
 * Testability analysis result
 */
export interface TestabilityAnalysis {
  /**
   * Overall score (0-100)
   */
  score: number;

  /**
   * Issues affecting testability
   */
  issues: TestabilityIssue[];

  /**
   * Refactoring suggestions
   */
  suggestions: RefactoringSuggestion[];
}

/**
 * Testability issue
 */
export interface TestabilityIssue {
  /**
   * Issue type
   */
  type: 'complexity' | 'coupling' | 'size' | 'dependencies' | 'side-effects';

  /**
   * Severity (1-3)
   */
  severity: 1 | 2 | 3;

  /**
   * Issue description
   */
  description: string;

  /**
   * Line number (optional)
   */
  line?: number;
}

/**
 * Refactoring suggestion
 */
export interface RefactoringSuggestion {
  /**
   * Suggestion title
   */
  title: string;

  /**
   * Detailed description
   */
  description: string;

  /**
   * Expected improvement in testability score
   */
  expectedImprovement: number;
}

/**
 * TestSuggestionProvider
 *
 * Implements CodeActionProvider to offer test suggestions as quick fixes
 * and refactoring options in the editor.
 */
export class TestSuggestionProvider implements vscode.CodeActionProvider {
  /**
   * Code action kinds provided by this provider
   */
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.Refactor,
    vscode.CodeActionKind.Source,
  ];

  /**
   * Diagnostic collection for test coverage warnings
   */
  private diagnosticCollection: vscode.DiagnosticCollection;

  /**
   * Cache of suggestions per document
   */
  private suggestionCache: Map<string, CachedSuggestions> = new Map();

  /**
   * Cache of testability analyses
   */
  private testabilityCache: Map<string, Map<string, TestabilityAnalysis>> = new Map();

  /**
   * Cache expiry time in milliseconds
   */
  private readonly cacheExpiryMs = 30000; // 30 seconds

  /**
   * Low testability threshold
   */
  private readonly lowTestabilityThreshold = 50;

  constructor(private readonly analysisService: AnalysisService) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('aqe-tests');
  }

  /**
   * Provide code actions for the given document and range
   */
  async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeAction[]> {
    const actions: vscode.CodeAction[] = [];

    try {
      // Get cached or fresh analysis
      const analysis = await this.getCachedAnalysis(document);

      // Find functions in the selected range
      const functionsInRange = analysis.functions.filter((f) =>
        this.rangeOverlaps(range, f.startLine, f.endLine)
      );

      // Add test suggestion actions for each function
      for (const func of functionsInRange) {
        const funcActions = await this.createActionsForFunction(document, func, analysis.suggestions);
        actions.push(...funcActions);

        // Check testability and add refactoring suggestions
        const testability = this.analyzeTestability(func);
        if (testability.score < this.lowTestabilityThreshold) {
          const refactorActions = this.createRefactoringActions(document, func, testability);
          actions.push(...refactorActions);
        }
      }

      // If selection is not empty, add action for selected code
      if (!range.isEmpty) {
        const selectionAction = this.createSelectionAction(document, range);
        actions.push(selectionAction);
      }

      // Add actions for diagnostics
      for (const diagnostic of context.diagnostics) {
        if (diagnostic.source === 'aqe-tests') {
          const diagnosticActions = this.createDiagnosticActions(document, diagnostic);
          actions.push(...diagnosticActions);
        }
      }

      // Add source action for generating all tests
      if (functionsInRange.length > 0) {
        const sourceAction = this.createGenerateAllTestsAction(document, functionsInRange);
        actions.push(sourceAction);
      }
    } catch (error) {
      // Return empty array on error - don't break the editor
      console.error('[TestSuggestionProvider] Error providing code actions:', error);
    }

    return actions;
  }

  /**
   * Resolve additional details for a code action
   */
  async resolveCodeAction(
    codeAction: vscode.CodeAction,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeAction> {
    // If the action has a command, resolve it
    if (codeAction.command?.command === 'aqe.insertTest') {
      const testCode = codeAction.command.arguments?.[0] as string;
      if (testCode) {
        codeAction.edit = await this.createTestInsertEdit(testCode);
      }
    }

    return codeAction;
  }

  /**
   * Update diagnostics for a document
   */
  async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
    try {
      const analysis = await this.getCachedAnalysis(document);
      const diagnostics: vscode.Diagnostic[] = [];

      // Add diagnostics for functions without tests
      for (const func of analysis.functions) {
        if (!func.hasTests) {
          const range = new vscode.Range(
            func.startLine,
            0,
            func.startLine,
            func.name.length + 10
          );

          const diagnostic = new vscode.Diagnostic(
            range,
            `Function '${func.name}' has no test coverage`,
            vscode.DiagnosticSeverity.Information
          );
          diagnostic.source = 'aqe-tests';
          diagnostic.code = 'no-test';
          diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];

          diagnostics.push(diagnostic);
        }
      }

      // Add diagnostics for low coverage
      for (const func of analysis.functions) {
        if (func.coverage !== undefined && func.coverage < 80) {
          const range = new vscode.Range(
            func.startLine,
            0,
            func.startLine,
            func.name.length + 10
          );

          const diagnostic = new vscode.Diagnostic(
            range,
            `Function '${func.name}' has low test coverage (${func.coverage}%)`,
            vscode.DiagnosticSeverity.Warning
          );
          diagnostic.source = 'aqe-tests';
          diagnostic.code = 'low-coverage';

          diagnostics.push(diagnostic);
        }
      }

      // Add diagnostics for low testability
      for (const func of analysis.functions) {
        const testability = this.analyzeTestability(func);
        if (testability.score < this.lowTestabilityThreshold) {
          const range = new vscode.Range(
            func.startLine,
            0,
            func.startLine,
            func.name.length + 10
          );

          const diagnostic = new vscode.Diagnostic(
            range,
            `Function '${func.name}' has low testability score (${testability.score}%) - consider refactoring`,
            vscode.DiagnosticSeverity.Warning
          );
          diagnostic.source = 'aqe-tests';
          diagnostic.code = 'low-testability';
          diagnostic.relatedInformation = testability.issues.map(
            (issue) =>
              new vscode.DiagnosticRelatedInformation(
                new vscode.Location(
                  document.uri,
                  new vscode.Position(issue.line ?? func.startLine, 0)
                ),
                issue.description
              )
          );

          diagnostics.push(diagnostic);
        }
      }

      this.diagnosticCollection.set(document.uri, diagnostics);
    } catch (error) {
      console.error('[TestSuggestionProvider] Error updating diagnostics:', error);
    }
  }

  /**
   * Clear diagnostics for a document
   */
  clearDiagnostics(document: vscode.TextDocument): void {
    this.diagnosticCollection.delete(document.uri);
  }

  /**
   * Get testability analysis for a function
   */
  getTestabilityAnalysis(document: vscode.TextDocument, functionName: string): TestabilityAnalysis | undefined {
    const docCache = this.testabilityCache.get(document.uri.toString());
    return docCache?.get(functionName);
  }

  /**
   * Analyze testability of a function
   */
  analyzeTestability(func: FunctionInfo): TestabilityAnalysis {
    const issues: TestabilityIssue[] = [];
    const suggestions: RefactoringSuggestion[] = [];
    let score = 100;

    const code = func.code;
    const lineCount = func.endLine - func.startLine + 1;

    // Check function size
    if (lineCount > 50) {
      issues.push({
        type: 'size',
        severity: 3,
        description: `Function is too long (${lineCount} lines). Consider breaking into smaller functions.`,
      });
      suggestions.push({
        title: 'Extract smaller functions',
        description: 'Break this function into smaller, focused functions that are easier to test.',
        expectedImprovement: 20,
      });
      score -= 20;
    } else if (lineCount > 30) {
      issues.push({
        type: 'size',
        severity: 2,
        description: `Function is moderately long (${lineCount} lines).`,
      });
      score -= 10;
    }

    // Check parameter count
    if (func.parameters.length > 5) {
      issues.push({
        type: 'complexity',
        severity: 3,
        description: `Too many parameters (${func.parameters.length}). Consider using an options object.`,
      });
      suggestions.push({
        title: 'Use options object',
        description: 'Replace multiple parameters with a single options object for better testability.',
        expectedImprovement: 15,
      });
      score -= 20;
    } else if (func.parameters.length > 3) {
      issues.push({
        type: 'complexity',
        severity: 2,
        description: `Many parameters (${func.parameters.length}).`,
      });
      score -= 10;
    }

    // Check cyclomatic complexity (if statements)
    const conditionalCount = (code.match(/\bif\s*\(/g) || []).length;
    const switchCount = (code.match(/\bswitch\s*\(/g) || []).length;
    const ternaryCount = (code.match(/\?[^?]*:/g) || []).length;
    const totalBranches = conditionalCount + switchCount + ternaryCount;

    if (totalBranches > 10) {
      issues.push({
        type: 'complexity',
        severity: 3,
        description: `High cyclomatic complexity (${totalBranches} branches). Consider extracting conditional logic.`,
      });
      suggestions.push({
        title: 'Reduce complexity',
        description: 'Extract conditional branches into separate functions or use polymorphism.',
        expectedImprovement: 25,
      });
      score -= 25;
    } else if (totalBranches > 5) {
      issues.push({
        type: 'complexity',
        severity: 2,
        description: `Moderate cyclomatic complexity (${totalBranches} branches).`,
      });
      score -= 10;
    }

    // Check for nested callbacks
    const callbackNesting = (code.match(/=>\s*\{[^}]*=>\s*\{/g) || []).length;
    if (callbackNesting > 0) {
      issues.push({
        type: 'complexity',
        severity: 2,
        description: `Nested callbacks detected (${callbackNesting}). Consider using async/await.`,
      });
      suggestions.push({
        title: 'Use async/await',
        description: 'Replace nested callbacks with async/await for better readability and testability.',
        expectedImprovement: 10,
      });
      score -= callbackNesting * 10;
    }

    // Check for external dependencies
    const hasHttpCalls = /\bfetch\b|\baxios\b|\.get\(|\.post\(|\.put\(|\.delete\(/.test(code);
    const hasFileSystem = /\bfs\b|readFile|writeFile|readdir/.test(code);
    const hasDynamicImports = /\brequire\s*\(|import\s*\(/.test(code);

    if (hasHttpCalls) {
      issues.push({
        type: 'dependencies',
        severity: 2,
        description: 'Direct HTTP calls detected. Inject HTTP client for easier mocking.',
      });
      suggestions.push({
        title: 'Inject HTTP client',
        description: 'Pass HTTP client as a parameter or use dependency injection.',
        expectedImprovement: 10,
      });
      score -= 10;
    }

    if (hasFileSystem) {
      issues.push({
        type: 'dependencies',
        severity: 2,
        description: 'Direct file system access. Inject file system abstraction.',
      });
      score -= 10;
    }

    if (hasDynamicImports) {
      issues.push({
        type: 'dependencies',
        severity: 1,
        description: 'Dynamic imports detected. Consider static imports for easier testing.',
      });
      score -= 5;
    }

    // Check for side effects
    const hasSideEffects = /\bconsole\.|window\.|document\.|global\./.test(code);
    if (hasSideEffects) {
      issues.push({
        type: 'side-effects',
        severity: 2,
        description: 'Global side effects detected. Consider isolating side effects.',
      });
      suggestions.push({
        title: 'Isolate side effects',
        description: 'Move side effects to the caller or inject them as dependencies.',
        expectedImprovement: 10,
      });
      score -= 10;
    }

    // Bonus for good practices
    if (func.jsdoc) score += 5;
    if (func.returnType) score += 5;
    if (func.isAsync) score += 5; // Async functions are generally more testable with mocking

    // Ensure score is between 0 and 100
    score = Math.max(0, Math.min(100, score));

    return { score, issues, suggestions };
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.diagnosticCollection.dispose();
    this.suggestionCache.clear();
    this.testabilityCache.clear();
  }

  /**
   * Get cached analysis or fetch fresh
   */
  private async getCachedAnalysis(document: vscode.TextDocument): Promise<CachedAnalysis> {
    const cacheKey = document.uri.toString();
    const cached = this.suggestionCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheExpiryMs) {
      return cached.analysis;
    }

    const analysis = await this.analysisService.analyzeFile(document);

    // Cache testability analyses
    const testabilityMap = new Map<string, TestabilityAnalysis>();
    for (const func of analysis.functions) {
      testabilityMap.set(func.name, this.analyzeTestability(func));
    }
    this.testabilityCache.set(cacheKey, testabilityMap);

    this.suggestionCache.set(cacheKey, {
      analysis,
      timestamp: Date.now(),
    });

    return analysis;
  }

  /**
   * Create code actions for a function
   */
  private async createActionsForFunction(
    document: vscode.TextDocument,
    func: FunctionInfo,
    suggestions: TestSuggestion[]
  ): Promise<vscode.CodeAction[]> {
    const actions: vscode.CodeAction[] = [];

    // Find suggestions relevant to this function
    const relevantSuggestions = suggestions.filter(
      (s) => s.targetFunction === func.name || s.title.includes(func.name)
    );

    // Create action for each suggestion
    for (const suggestion of relevantSuggestions.slice(0, 3)) {
      const action = new vscode.CodeAction(
        `$(beaker) ${suggestion.title}`,
        vscode.CodeActionKind.QuickFix
      );

      action.command = {
        command: 'aqe.insertTest',
        title: 'Insert Test',
        arguments: [suggestion.code, document.uri],
      };

      action.diagnostics = [];
      action.isPreferred = suggestion === relevantSuggestions[0];

      actions.push(action);
    }

    // Add generic "Generate Tests" action with lightbulb
    const generateAction = new vscode.CodeAction(
      `$(lightbulb) Generate tests for ${func.name}`,
      vscode.CodeActionKind.Refactor
    );

    generateAction.command = {
      command: 'aqe.showTestQuickPick',
      title: 'Generate Tests',
      arguments: [{ functionName: func.name, code: func.code }],
    };

    actions.push(generateAction);

    // Add quick pick action if no specific suggestions
    if (relevantSuggestions.length === 0) {
      const quickPickAction = new vscode.CodeAction(
        `$(list-selection) Choose test type for ${func.name}`,
        vscode.CodeActionKind.Refactor
      );

      quickPickAction.command = {
        command: 'aqe.showTestQuickPick',
        title: 'Choose Test Type',
        arguments: [{ functionName: func.name, code: func.code, sourceFile: document.fileName }],
      };

      actions.push(quickPickAction);
    }

    return actions;
  }

  /**
   * Create refactoring actions for low testability
   */
  private createRefactoringActions(
    document: vscode.TextDocument,
    func: FunctionInfo,
    testability: TestabilityAnalysis
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Add quick fix for low testability
    const fixAction = new vscode.CodeAction(
      `$(wrench) Improve testability of ${func.name} (score: ${testability.score}%)`,
      vscode.CodeActionKind.QuickFix
    );

    fixAction.command = {
      command: 'aqe.showRefactoringSuggestions',
      title: 'View Refactoring Suggestions',
      arguments: [{ functionName: func.name, testability }],
    };

    fixAction.diagnostics = [];
    actions.push(fixAction);

    // Add individual refactoring suggestions as actions
    for (const suggestion of testability.suggestions.slice(0, 2)) {
      const suggestionAction = new vscode.CodeAction(
        `$(symbol-property) ${suggestion.title} (+${suggestion.expectedImprovement}%)`,
        vscode.CodeActionKind.RefactorRewrite
      );

      suggestionAction.command = {
        command: 'aqe.applyRefactoring',
        title: suggestion.title,
        arguments: [{ functionName: func.name, suggestion }],
      };

      actions.push(suggestionAction);
    }

    return actions;
  }

  /**
   * Create action for selected code
   */
  private createSelectionAction(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      '$(beaker) Generate tests for selection',
      vscode.CodeActionKind.Refactor
    );

    action.command = {
      command: 'aqe.generateTests',
      title: 'Generate Tests',
      arguments: [document.getText(range)],
    };

    return action;
  }

  /**
   * Create actions for diagnostics
   */
  private createDiagnosticActions(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    if (diagnostic.code === 'no-test') {
      const action = new vscode.CodeAction(
        '$(beaker) Generate missing test',
        vscode.CodeActionKind.QuickFix
      );

      action.command = {
        command: 'aqe.suggestTests',
        title: 'Generate Test',
      };

      action.diagnostics = [diagnostic];
      action.isPreferred = true;

      actions.push(action);
    }

    if (diagnostic.code === 'low-coverage') {
      const action = new vscode.CodeAction(
        '$(beaker) Improve test coverage',
        vscode.CodeActionKind.QuickFix
      );

      action.command = {
        command: 'aqe.suggestTests',
        title: 'Improve Coverage',
      };

      action.diagnostics = [diagnostic];

      actions.push(action);
    }

    if (diagnostic.code === 'low-testability') {
      const action = new vscode.CodeAction(
        '$(wrench) View refactoring suggestions',
        vscode.CodeActionKind.QuickFix
      );

      action.command = {
        command: 'aqe.showRefactoringSuggestions',
        title: 'View Suggestions',
      };

      action.diagnostics = [diagnostic];

      actions.push(action);
    }

    return actions;
  }

  /**
   * Create "Generate All Tests" source action
   */
  private createGenerateAllTestsAction(
    document: vscode.TextDocument,
    functions: FunctionInfo[]
  ): vscode.CodeAction {
    const untestedCount = functions.filter((f) => !f.hasTests).length;

    const action = new vscode.CodeAction(
      `$(file-add) Generate tests for all functions (${untestedCount} untested)`,
      vscode.CodeActionKind.Source.append('generateTests')
    );

    action.command = {
      command: 'aqe.generateAllTests',
      title: 'Generate All Tests',
      arguments: [{ documentUri: document.uri.toString(), functions: functions.map((f) => f.name) }],
    };

    return action;
  }

  /**
   * Create workspace edit to insert test code
   */
  private async createTestInsertEdit(testCode: string): Promise<vscode.WorkspaceEdit> {
    const edit = new vscode.WorkspaceEdit();

    // Get active editor's document
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return edit;
    }

    const document = editor.document;
    const testPath = this.getTestFilePath(document.fileName);

    try {
      // Try to open existing test file
      const testUri = vscode.Uri.file(testPath);
      const testDoc = await vscode.workspace.openTextDocument(testUri);

      // Append to end of file
      const lastLine = testDoc.lineCount - 1;
      const lastChar = testDoc.lineAt(lastLine).text.length;
      edit.insert(testUri, new vscode.Position(lastLine, lastChar), '\n\n' + testCode);
    } catch {
      // Test file doesn't exist, create it
      const testUri = vscode.Uri.file(testPath);
      edit.createFile(testUri, { ignoreIfExists: true });
      edit.insert(
        testUri,
        new vscode.Position(0, 0),
        this.getTestFileHeader(document.fileName) + '\n\n' + testCode
      );
    }

    return edit;
  }

  /**
   * Check if range overlaps with line range
   */
  private rangeOverlaps(range: vscode.Range, startLine: number, endLine: number): boolean {
    return range.start.line <= endLine && range.end.line >= startLine;
  }

  /**
   * Get test file path from source file path
   */
  private getTestFilePath(sourcePath: string): string {
    const ext = sourcePath.match(/\.(tsx?|jsx?)$/)?.[0] || '.ts';
    const basePath = sourcePath.replace(/\.(tsx?|jsx?)$/, '');
    return `${basePath}.test${ext}`;
  }

  /**
   * Get test file header
   */
  private getTestFileHeader(sourcePath: string): string {
    const fileName = sourcePath.split('/').pop()?.replace(/\.(tsx?|jsx?)$/, '') || 'module';
    return `/**
 * Tests for ${fileName}
 * Generated by Agentic QE Companion
 */

import { describe, it, expect } from 'jest';
`;
  }
}

/**
 * Cached analysis result
 */
interface CachedAnalysis {
  functions: FunctionInfo[];
  suggestions: TestSuggestion[];
}

/**
 * Cached suggestions with timestamp
 */
interface CachedSuggestions {
  analysis: CachedAnalysis;
  timestamp: number;
}
