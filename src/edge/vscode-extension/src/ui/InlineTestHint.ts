/**
 * InlineTestHint - Inline Decoration for Test Suggestions
 *
 * Uses VS Code's TextEditorDecorationType API to display inline hints
 * showing test suggestions after function declarations. Clicking on hints
 * triggers test generation.
 *
 * @module vscode-extension/ui/InlineTestHint
 * @version 0.1.0
 */

import * as vscode from 'vscode';
import type { AnalysisService, FunctionInfo, TestSuggestion } from '../services/AnalysisService';

/**
 * Hint data associated with a decoration
 */
export interface TestHintData {
  /**
   * Function information
   */
  functionInfo: FunctionInfo;

  /**
   * Associated test suggestions
   */
  suggestions: TestSuggestion[];

  /**
   * Decoration range
   */
  range: vscode.Range;

  /**
   * Number of suggested tests
   */
  suggestionCount: number;

  /**
   * Testability score (0-100)
   */
  testabilityScore: number;
}

/**
 * InlineTestHint
 *
 * Manages inline decorations showing test suggestions for functions.
 * Decorations appear after function declarations and show the number
 * of available test suggestions.
 */
export class InlineTestHint implements vscode.Disposable {
  /**
   * Decoration type for test hints with suggestions
   */
  private readonly hintDecorationType: vscode.TextEditorDecorationType;

  /**
   * Decoration type for untested functions (warning)
   */
  private readonly warningDecorationType: vscode.TextEditorDecorationType;

  /**
   * Decoration type for well-tested functions
   */
  private readonly successDecorationType: vscode.TextEditorDecorationType;

  /**
   * Decoration type for low testability score
   */
  private readonly lowTestabilityDecorationType: vscode.TextEditorDecorationType;

  /**
   * Map of document URI to hint data
   */
  private hintDataMap: Map<string, TestHintData[]> = new Map();

  /**
   * Debounce timer for updates
   */
  private updateDebounceTimer: NodeJS.Timeout | undefined;

  /**
   * Debounce delay in milliseconds
   */
  private readonly debounceDelayMs = 300;

  /**
   * Event emitter for hint clicks
   */
  private readonly _onHintClick = new vscode.EventEmitter<TestHintData>();

  /**
   * Event fired when a hint is clicked
   */
  public readonly onHintClick = this._onHintClick.event;

  /**
   * Disposables
   */
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly analysisService: AnalysisService) {
    // Create decoration type for normal hints (suggestions available)
    this.hintDecorationType = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: '',
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
        fontStyle: 'italic',
        margin: '0 0 0 1em',
      },
      isWholeLine: false,
    });

    // Create decoration type for warning hints (no tests)
    this.warningDecorationType = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: '',
        color: new vscode.ThemeColor('editorWarning.foreground'),
        fontStyle: 'italic',
        margin: '0 0 0 1em',
      },
      isWholeLine: false,
    });

    // Create decoration type for success hints (well tested)
    this.successDecorationType = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: '',
        color: new vscode.ThemeColor('editorInfo.foreground'),
        fontStyle: 'italic',
        margin: '0 0 0 1em',
      },
      isWholeLine: false,
    });

    // Create decoration type for low testability
    this.lowTestabilityDecorationType = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: '',
        color: new vscode.ThemeColor('editorError.foreground'),
        fontStyle: 'italic',
        margin: '0 0 0 1em',
      },
      backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
      isWholeLine: false,
    });

    // Register for document changes
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(this.onDocumentChange, this),
      vscode.window.onDidChangeActiveTextEditor(this.onActiveEditorChange, this)
    );

    // Initialize current editor
    if (vscode.window.activeTextEditor) {
      this.updateHints(vscode.window.activeTextEditor);
    }
  }

  /**
   * Update hints for an editor
   */
  async updateHints(editor: vscode.TextEditor): Promise<void> {
    const document = editor.document;

    // Only process supported languages
    if (!this.isSupported(document)) {
      this.clearHints(editor);
      return;
    }

    try {
      // Analyze the document
      const analysis = await this.analysisService.analyzeFile(document);

      // Create hint data for each function
      const hints: TestHintData[] = [];

      for (const func of analysis.functions) {
        // Find suggestions for this function
        const suggestions = analysis.suggestions.filter(
          (s) => s.targetFunction === func.name || s.title.includes(func.name)
        );

        // Calculate testability score
        const testabilityScore = this.calculateTestabilityScore(func);

        // Create hint range at end of function declaration line
        const line = document.lineAt(func.startLine);
        const range = new vscode.Range(
          func.startLine,
          line.text.length,
          func.startLine,
          line.text.length
        );

        hints.push({
          functionInfo: func,
          suggestions,
          range,
          suggestionCount: suggestions.length,
          testabilityScore,
        });
      }

      // Store hint data
      this.hintDataMap.set(document.uri.toString(), hints);

      // Apply decorations
      this.applyDecorations(editor, hints);
    } catch (error) {
      console.error('[InlineTestHint] Error updating hints:', error);
    }
  }

  /**
   * Clear hints for an editor
   */
  clearHints(editor: vscode.TextEditor): void {
    editor.setDecorations(this.hintDecorationType, []);
    editor.setDecorations(this.warningDecorationType, []);
    editor.setDecorations(this.successDecorationType, []);
    editor.setDecorations(this.lowTestabilityDecorationType, []);
    this.hintDataMap.delete(editor.document.uri.toString());
  }

  /**
   * Get hint data at a position
   */
  getHintAtPosition(uri: vscode.Uri, position: vscode.Position): TestHintData | undefined {
    const hints = this.hintDataMap.get(uri.toString());
    if (!hints) return undefined;

    return hints.find(
      (hint) => hint.range.start.line === position.line && position.character >= hint.range.start.character
    );
  }

  /**
   * Get all hints for a document
   */
  getHintsForDocument(uri: vscode.Uri): TestHintData[] {
    return this.hintDataMap.get(uri.toString()) ?? [];
  }

  /**
   * Trigger click on a hint
   */
  triggerHintClick(hint: TestHintData): void {
    this._onHintClick.fire(hint);
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.hintDecorationType.dispose();
    this.warningDecorationType.dispose();
    this.successDecorationType.dispose();
    this.lowTestabilityDecorationType.dispose();
    this._onHintClick.dispose();

    if (this.updateDebounceTimer) {
      clearTimeout(this.updateDebounceTimer);
    }

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];

    this.hintDataMap.clear();
  }

  /**
   * Apply decorations to the editor
   */
  private applyDecorations(editor: vscode.TextEditor, hints: TestHintData[]): void {
    const hintDecorations: vscode.DecorationOptions[] = [];
    const warningDecorations: vscode.DecorationOptions[] = [];
    const successDecorations: vscode.DecorationOptions[] = [];
    const lowTestabilityDecorations: vscode.DecorationOptions[] = [];

    for (const hint of hints) {
      const decoration = this.createDecoration(hint);

      if (hint.testabilityScore < 30) {
        // Low testability - needs refactoring
        lowTestabilityDecorations.push(decoration);
      } else if (!hint.functionInfo.hasTests && hint.suggestionCount > 0) {
        // No tests but suggestions available - warning
        warningDecorations.push(decoration);
      } else if (hint.functionInfo.hasTests && (hint.functionInfo.coverage ?? 0) >= 80) {
        // Well tested - success
        successDecorations.push(decoration);
      } else {
        // Normal hint
        hintDecorations.push(decoration);
      }
    }

    // Apply all decorations
    editor.setDecorations(this.hintDecorationType, hintDecorations);
    editor.setDecorations(this.warningDecorationType, warningDecorations);
    editor.setDecorations(this.successDecorationType, successDecorations);
    editor.setDecorations(this.lowTestabilityDecorationType, lowTestabilityDecorations);
  }

  /**
   * Create a decoration for a hint
   */
  private createDecoration(hint: TestHintData): vscode.DecorationOptions {
    const { functionInfo, suggestionCount, testabilityScore } = hint;

    // Build hint text
    let hintText: string;
    let hoverMessage: vscode.MarkdownString;

    if (testabilityScore < 30) {
      hintText = ` // Low testability (${testabilityScore}%) - consider refactoring`;
      hoverMessage = this.createLowTestabilityHover(hint);
    } else if (!functionInfo.hasTests) {
      if (suggestionCount > 0) {
        hintText = ` // ${suggestionCount} test${suggestionCount > 1 ? 's' : ''} suggested`;
      } else {
        hintText = ' // No tests';
      }
      hoverMessage = this.createNoTestsHover(hint);
    } else if ((functionInfo.coverage ?? 0) >= 80) {
      hintText = ` // ${functionInfo.coverage}% covered`;
      hoverMessage = this.createCoveredHover(hint);
    } else {
      hintText = ` // ${functionInfo.coverage ?? 0}% covered, ${suggestionCount} suggestions`;
      hoverMessage = this.createPartialCoverageHover(hint);
    }

    return {
      range: hint.range,
      renderOptions: {
        after: {
          contentText: hintText,
        },
      },
      hoverMessage,
    };
  }

  /**
   * Create hover content for functions with no tests
   */
  private createNoTestsHover(hint: TestHintData): vscode.MarkdownString {
    const { functionInfo, suggestions, testabilityScore } = hint;
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    md.appendMarkdown(`### Test Suggestions for \`${functionInfo.name}\`\n\n`);
    md.appendMarkdown(`**Testability Score:** ${testabilityScore}%\n\n`);

    if (suggestions.length > 0) {
      md.appendMarkdown(`**${suggestions.length} test suggestion${suggestions.length > 1 ? 's' : ''} available:**\n\n`);

      for (const suggestion of suggestions.slice(0, 3)) {
        md.appendMarkdown(`- ${suggestion.title} (${Math.round(suggestion.confidence * 100)}% confidence)\n`);
      }

      md.appendMarkdown('\n---\n\n');
    }

    // Add action links
    md.appendMarkdown(
      `[$(beaker) Generate Tests](command:aqe.generateTestsForFunction?${encodeURIComponent(
        JSON.stringify({ functionName: functionInfo.name })
      )}) | `
    );
    md.appendMarkdown(
      `[$(list-selection) Quick Pick](command:aqe.showTestQuickPick?${encodeURIComponent(
        JSON.stringify({ functionName: functionInfo.name })
      )})`
    );

    return md;
  }

  /**
   * Create hover content for well-covered functions
   */
  private createCoveredHover(hint: TestHintData): vscode.MarkdownString {
    const { functionInfo } = hint;
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(`### \`${functionInfo.name}\` is well tested\n\n`);
    md.appendMarkdown(`**Coverage:** ${functionInfo.coverage}%\n\n`);
    md.appendMarkdown(`**Branch Coverage:** ${functionInfo.branchCoverage ?? 'N/A'}%\n\n`);

    md.appendMarkdown(
      `[$(eye) View Tests](command:aqe.viewTestsForFunction?${encodeURIComponent(
        JSON.stringify({ functionName: functionInfo.name })
      )})`
    );

    return md;
  }

  /**
   * Create hover content for partial coverage
   */
  private createPartialCoverageHover(hint: TestHintData): vscode.MarkdownString {
    const { functionInfo, suggestions, testabilityScore } = hint;
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(`### Improve Coverage for \`${functionInfo.name}\`\n\n`);
    md.appendMarkdown(`**Current Coverage:** ${functionInfo.coverage}%\n\n`);
    md.appendMarkdown(`**Testability Score:** ${testabilityScore}%\n\n`);

    if (suggestions.length > 0) {
      md.appendMarkdown(`**${suggestions.length} improvement suggestion${suggestions.length > 1 ? 's' : ''}:**\n\n`);

      for (const suggestion of suggestions.slice(0, 3)) {
        md.appendMarkdown(`- ${suggestion.title}\n`);
      }

      md.appendMarkdown('\n');
    }

    md.appendMarkdown(
      `[$(beaker) Add Edge Case Tests](command:aqe.generateEdgeCaseTests?${encodeURIComponent(
        JSON.stringify({ functionName: functionInfo.name })
      )})`
    );

    return md;
  }

  /**
   * Create hover content for low testability
   */
  private createLowTestabilityHover(hint: TestHintData): vscode.MarkdownString {
    const { functionInfo, testabilityScore } = hint;
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(`### Low Testability: \`${functionInfo.name}\`\n\n`);
    md.appendMarkdown(`**Testability Score:** ${testabilityScore}%\n\n`);
    md.appendMarkdown(`This function has low testability. Consider:\n\n`);

    // Provide specific refactoring suggestions
    const issues = this.analyzeTestabilityIssues(functionInfo);
    for (const issue of issues) {
      md.appendMarkdown(`- ${issue}\n`);
    }

    md.appendMarkdown('\n');
    md.appendMarkdown(
      `[$(wrench) View Refactoring Suggestions](command:aqe.showRefactoringSuggestions?${encodeURIComponent(
        JSON.stringify({ functionName: functionInfo.name })
      )})`
    );

    return md;
  }

  /**
   * Calculate testability score for a function
   */
  private calculateTestabilityScore(func: FunctionInfo): number {
    let score = 100;

    // Penalize long functions
    const lineCount = func.endLine - func.startLine + 1;
    if (lineCount > 50) score -= 20;
    else if (lineCount > 30) score -= 10;
    else if (lineCount > 20) score -= 5;

    // Penalize many parameters
    if (func.parameters.length > 5) score -= 20;
    else if (func.parameters.length > 3) score -= 10;

    // Penalize complex code patterns
    const code = func.code;

    // Nested callbacks/promises
    const callbackNesting = (code.match(/\=>\s*\{[^}]*\=>\s*\{/g) || []).length;
    score -= callbackNesting * 10;

    // Multiple if/else branches
    const conditionals = (code.match(/if\s*\(/g) || []).length;
    if (conditionals > 5) score -= 15;
    else if (conditionals > 3) score -= 5;

    // External dependencies (imports/requires used inline)
    const externalCalls = (code.match(/\bfetch\b|\baxios\b|\bfs\b|\brequire\b/g) || []).length;
    score -= externalCalls * 5;

    // Bonus for async functions (usually more testable with mocking)
    if (func.isAsync) score += 5;

    // Bonus for JSDoc (indicates intention)
    if (func.jsdoc) score += 5;

    // Bonus for return type (TypeScript)
    if (func.returnType) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Analyze testability issues for a function
   */
  private analyzeTestabilityIssues(func: FunctionInfo): string[] {
    const issues: string[] = [];

    const lineCount = func.endLine - func.startLine + 1;
    if (lineCount > 50) {
      issues.push(`Function is too long (${lineCount} lines). Extract smaller functions.`);
    }

    if (func.parameters.length > 5) {
      issues.push(`Too many parameters (${func.parameters.length}). Consider using an options object.`);
    }

    const code = func.code;

    if ((code.match(/\=>\s*\{[^}]*\=>\s*\{/g) || []).length > 0) {
      issues.push('Deeply nested callbacks. Consider async/await or extracting helper functions.');
    }

    if ((code.match(/if\s*\(/g) || []).length > 5) {
      issues.push('High cyclomatic complexity. Extract conditional logic into separate functions.');
    }

    if (/\bfetch\b|\baxios\b/.test(code)) {
      issues.push('Direct HTTP calls. Inject dependencies for easier mocking.');
    }

    if (/\bfs\b|\brequire\(/.test(code)) {
      issues.push('Direct file system or dynamic imports. Use dependency injection.');
    }

    if (!func.jsdoc) {
      issues.push('Missing documentation. Add JSDoc to clarify expected behavior.');
    }

    return issues;
  }

  /**
   * Handle document change events
   */
  private onDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== event.document) return;

    // Debounce updates
    if (this.updateDebounceTimer) {
      clearTimeout(this.updateDebounceTimer);
    }

    this.updateDebounceTimer = setTimeout(() => {
      this.updateHints(editor);
    }, this.debounceDelayMs);
  }

  /**
   * Handle active editor change
   */
  private onActiveEditorChange(editor: vscode.TextEditor | undefined): void {
    if (editor) {
      this.updateHints(editor);
    }
  }

  /**
   * Check if document is supported
   */
  private isSupported(document: vscode.TextDocument): boolean {
    const supportedLanguages = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'];
    return supportedLanguages.includes(document.languageId);
  }
}
