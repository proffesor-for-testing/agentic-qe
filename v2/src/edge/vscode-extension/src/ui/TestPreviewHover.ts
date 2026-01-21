/**
 * TestPreviewHover - Hover Provider for Test Previews
 *
 * Provides hover functionality showing preview of suggested test code
 * when hovering over test hints. Includes actions for inserting tests
 * and viewing similar patterns.
 *
 * @module vscode-extension/ui/TestPreviewHover
 * @version 0.1.0
 */

import * as vscode from 'vscode';
import type { AnalysisService, FunctionInfo, TestSuggestion } from '../services/AnalysisService';
import type { InlineTestHint, TestHintData } from './InlineTestHint';

/**
 * Similar pattern from history
 */
export interface SimilarPattern {
  /**
   * Pattern ID
   */
  id: string;

  /**
   * Pattern title
   */
  title: string;

  /**
   * Similarity score (0-1)
   */
  similarity: number;

  /**
   * Test code preview
   */
  preview: string;

  /**
   * Source file
   */
  sourceFile?: string;

  /**
   * Framework used
   */
  framework?: string;
}

/**
 * TestPreviewHover
 *
 * Implements HoverProvider to show test previews and actions
 * when hovering over inline test hints.
 */
export class TestPreviewHover implements vscode.HoverProvider, vscode.Disposable {
  /**
   * Maximum lines to show in preview
   */
  private readonly maxPreviewLines = 15;

  /**
   * Maximum similar patterns to show
   */
  private readonly maxSimilarPatterns = 3;

  /**
   * Disposables
   */
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly analysisService: AnalysisService,
    private readonly inlineTestHint: InlineTestHint
  ) {}

  /**
   * Provide hover information
   */
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    // Check if we're hovering over a hint
    const hint = this.inlineTestHint.getHintAtPosition(document.uri, position);
    if (!hint) {
      return null;
    }

    // Build hover content
    const contents = await this.buildHoverContent(hint, document);

    return new vscode.Hover(contents, hint.range);
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  /**
   * Build hover content for a hint
   */
  private async buildHoverContent(
    hint: TestHintData,
    document: vscode.TextDocument
  ): Promise<vscode.MarkdownString[]> {
    const contents: vscode.MarkdownString[] = [];

    // Header with function info
    const header = this.createHeader(hint);
    contents.push(header);

    // Test preview if suggestions available
    if (hint.suggestions.length > 0) {
      const preview = await this.createTestPreview(hint);
      contents.push(preview);
    }

    // Similar patterns section
    const similarPatterns = await this.findSimilarPatterns(hint, document);
    if (similarPatterns.length > 0) {
      const patternsSection = this.createPatternsSection(similarPatterns);
      contents.push(patternsSection);
    }

    // Action buttons
    const actions = this.createActions(hint);
    contents.push(actions);

    return contents;
  }

  /**
   * Create header section
   */
  private createHeader(hint: TestHintData): vscode.MarkdownString {
    const { functionInfo, testabilityScore, suggestionCount } = hint;
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    // Title
    const icon = this.getStatusIcon(hint);
    md.appendMarkdown(`## ${icon} ${functionInfo.name}\n\n`);

    // Metrics table
    md.appendMarkdown('| Metric | Value |\n');
    md.appendMarkdown('|--------|-------|\n');
    md.appendMarkdown(`| Type | \`${functionInfo.type}\` |\n`);
    md.appendMarkdown(`| Testability | ${this.getTestabilityBadge(testabilityScore)} |\n`);
    md.appendMarkdown(`| Coverage | ${functionInfo.coverage ?? 0}% |\n`);
    md.appendMarkdown(`| Suggestions | ${suggestionCount} |\n`);

    if (functionInfo.isAsync) {
      md.appendMarkdown(`| Async | Yes |\n`);
    }

    if (functionInfo.parameters.length > 0) {
      md.appendMarkdown(`| Parameters | ${functionInfo.parameters.length} |\n`);
    }

    return md;
  }

  /**
   * Create test preview section
   */
  private async createTestPreview(hint: TestHintData): Promise<vscode.MarkdownString> {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    const suggestion = hint.suggestions[0];
    if (!suggestion) {
      return md;
    }

    md.appendMarkdown('### Test Preview\n\n');

    // Add confidence badge
    const confidencePercent = Math.round(suggestion.confidence * 100);
    const confidenceColor = confidencePercent >= 80 ? 'green' : confidencePercent >= 60 ? 'yellow' : 'red';
    md.appendMarkdown(
      `<span style="background-color:${confidenceColor};padding:2px 6px;border-radius:3px;color:white;">` +
        `${confidencePercent}% confidence</span>\n\n`
    );

    // Code preview with line limit
    const previewCode = this.truncateCode(suggestion.code, this.maxPreviewLines);

    md.appendCodeblock(previewCode, 'typescript');

    // Show if truncated
    if (suggestion.code.split('\n').length > this.maxPreviewLines) {
      md.appendMarkdown(`\n*... ${suggestion.code.split('\n').length - this.maxPreviewLines} more lines*\n`);
    }

    // Pattern type badge
    if (suggestion.patternType) {
      md.appendMarkdown(`\n**Pattern:** \`${suggestion.patternType}\`\n`);
    }

    return md;
  }

  /**
   * Find similar patterns from history
   */
  private async findSimilarPatterns(
    hint: TestHintData,
    document: vscode.TextDocument
  ): Promise<SimilarPattern[]> {
    try {
      // Use analysis service to find similar patterns
      const suggestions = await this.analysisService.suggestTests(
        hint.functionInfo.code,
        document.fileName
      );

      // Convert to SimilarPattern format, excluding the primary suggestion
      return suggestions
        .slice(1, this.maxSimilarPatterns + 1)
        .map((s) => ({
          id: s.patternId ?? `suggestion-${Date.now()}`,
          title: s.title,
          similarity: s.confidence,
          preview: this.truncateCode(s.code, 5),
          framework: s.patternType === 'unit-test' ? 'jest' : undefined,
        }));
    } catch {
      return [];
    }
  }

  /**
   * Create similar patterns section
   */
  private createPatternsSection(patterns: SimilarPattern[]): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown('### Similar Patterns\n\n');

    for (const pattern of patterns) {
      const similarityPercent = Math.round(pattern.similarity * 100);

      md.appendMarkdown(`**${pattern.title}** (${similarityPercent}% similar)`);

      if (pattern.framework) {
        md.appendMarkdown(` - *${pattern.framework}*`);
      }

      md.appendMarkdown('\n');

      // Mini preview
      md.appendCodeblock(pattern.preview, 'typescript');
    }

    return md;
  }

  /**
   * Create action buttons
   */
  private createActions(hint: TestHintData): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown('---\n\n');

    const funcName = encodeURIComponent(hint.functionInfo.name);
    const funcCode = encodeURIComponent(hint.functionInfo.code);

    // Primary action - Insert Test
    if (hint.suggestions.length > 0) {
      const testCode = encodeURIComponent(hint.suggestions[0].code);
      md.appendMarkdown(
        `[$(add) Insert Test](command:aqe.insertTest?${encodeURIComponent(
          JSON.stringify({ code: hint.suggestions[0].code })
        )}) `
      );
    }

    // Copy to clipboard
    if (hint.suggestions.length > 0) {
      md.appendMarkdown(
        `[$(copy) Copy](command:aqe.copyTestToClipboard?${encodeURIComponent(
          JSON.stringify({ code: hint.suggestions[0].code })
        )}) `
      );
    }

    // Generate with options
    md.appendMarkdown(
      `[$(beaker) Generate...](command:aqe.showTestQuickPick?${encodeURIComponent(
        JSON.stringify({ functionName: hint.functionInfo.name, code: hint.functionInfo.code })
      )}) `
    );

    // View all patterns
    md.appendMarkdown(
      `[$(list-tree) All Patterns](command:aqe.viewPatterns?${encodeURIComponent(
        JSON.stringify({ functionName: hint.functionInfo.name })
      )})`
    );

    return md;
  }

  /**
   * Get status icon based on hint state
   */
  private getStatusIcon(hint: TestHintData): string {
    if (hint.testabilityScore < 30) {
      return '$(warning)';
    }

    if (!hint.functionInfo.hasTests) {
      return '$(beaker)';
    }

    if ((hint.functionInfo.coverage ?? 0) >= 80) {
      return '$(check)';
    }

    return '$(info)';
  }

  /**
   * Get testability badge HTML
   */
  private getTestabilityBadge(score: number): string {
    if (score >= 80) {
      return `**${score}%** (Excellent)`;
    }

    if (score >= 60) {
      return `**${score}%** (Good)`;
    }

    if (score >= 40) {
      return `**${score}%** (Fair)`;
    }

    return `**${score}%** (Needs Improvement)`;
  }

  /**
   * Truncate code to max lines
   */
  private truncateCode(code: string, maxLines: number): string {
    const lines = code.split('\n');

    if (lines.length <= maxLines) {
      return code;
    }

    return lines.slice(0, maxLines).join('\n');
  }
}

/**
 * Extended hover provider with rich features
 *
 * Provides enhanced hover with:
 * - Test code syntax highlighting
 * - Interactive action buttons
 * - Similar pattern suggestions
 * - Coverage metrics
 */
export class RichTestPreviewHover extends TestPreviewHover {
  /**
   * Create a rich markdown preview with syntax highlighting
   */
  protected createRichCodePreview(code: string, language: string): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    // Add copy button using HTML
    md.appendMarkdown(
      '<div style="display:flex;justify-content:space-between;align-items:center;">\n' +
        '<span><strong>Preview</strong></span>\n' +
        '</div>\n\n'
    );

    // Syntax highlighted code block
    md.appendCodeblock(code, language);

    return md;
  }
}
