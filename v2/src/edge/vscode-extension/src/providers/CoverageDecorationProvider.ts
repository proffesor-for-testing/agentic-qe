/**
 * CoverageDecorationProvider - Editor Decoration Provider for Coverage Visualization
 *
 * Provides visual coverage decorations in the VS Code editor gutter.
 * Shows covered, uncovered, and partially covered lines using color-coded
 * decorations.
 *
 * @module vscode-extension/providers/CoverageDecorationProvider
 * @version 0.1.0
 */

import * as vscode from 'vscode';
import type { AnalysisService, FileAnalysis, FunctionInfo } from '../services/AnalysisService';

/**
 * Coverage level for a line
 */
export enum CoverageLevel {
  /** Line is fully covered by tests */
  COVERED = 'covered',
  /** Line is partially covered */
  PARTIAL = 'partial',
  /** Line is not covered by tests */
  UNCOVERED = 'uncovered',
  /** Line is not executable (comments, blank lines) */
  NOT_EXECUTABLE = 'not_executable',
}

/**
 * Coverage information for a line
 */
export interface LineCoverage {
  line: number;
  level: CoverageLevel;
  hitCount?: number;
  branchCoverage?: number;
}

/**
 * CoverageDecorationProvider
 *
 * Manages editor decorations to visualize test coverage in the gutter
 * and inline within the code.
 */
export class CoverageDecorationProvider implements vscode.Disposable {
  /**
   * Decoration type for covered lines (green)
   */
  private readonly coveredDecorationType: vscode.TextEditorDecorationType;

  /**
   * Decoration type for partially covered lines (yellow)
   */
  private readonly partialDecorationType: vscode.TextEditorDecorationType;

  /**
   * Decoration type for uncovered lines (red)
   */
  private readonly uncoveredDecorationType: vscode.TextEditorDecorationType;

  /**
   * Decoration type for functions without tests
   */
  private readonly untestedFunctionDecorationType: vscode.TextEditorDecorationType;

  /**
   * Currently active decorations per editor
   */
  private activeDecorations: Map<string, EditorDecorations> = new Map();

  /**
   * Disposables for cleanup
   */
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly analysisService: AnalysisService) {
    // Create decoration types with VS Code theming
    this.coveredDecorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.createGutterIcon('#4CAF50'), // Green
      gutterIconSize: 'contain',
      overviewRulerColor: '#4CAF50',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      isWholeLine: false,
    });

    this.partialDecorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.createGutterIcon('#FFC107'), // Yellow
      gutterIconSize: 'contain',
      overviewRulerColor: '#FFC107',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      isWholeLine: false,
    });

    this.uncoveredDecorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.createGutterIcon('#F44336'), // Red
      gutterIconSize: 'contain',
      overviewRulerColor: '#F44336',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      backgroundColor: 'rgba(244, 67, 54, 0.1)',
      isWholeLine: true,
    });

    this.untestedFunctionDecorationType = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ' // No tests',
        color: new vscode.ThemeColor('editorWarning.foreground'),
        fontStyle: 'italic',
      },
      overviewRulerColor: '#FF9800',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    // Register event handlers
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.refreshDecorations(editor);
        }
      })
    );

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === event.document) {
          // Invalidate cache and refresh after a delay
          this.activeDecorations.delete(event.document.uri.toString());
        }
      })
    );
  }

  /**
   * Update decorations for an editor based on analysis results
   */
  updateDecorations(editor: vscode.TextEditor, analysis: FileAnalysis): void {
    const document = editor.document;
    const uri = document.uri.toString();

    // Clear existing decorations
    this.clearDecorations(editor);

    // Build coverage map from analysis
    const coverageMap = this.buildCoverageMap(document, analysis);

    // Separate lines by coverage level
    const coveredRanges: vscode.DecorationOptions[] = [];
    const partialRanges: vscode.DecorationOptions[] = [];
    const uncoveredRanges: vscode.DecorationOptions[] = [];
    const untestedFunctionRanges: vscode.DecorationOptions[] = [];

    for (const [lineNumber, coverage] of coverageMap) {
      const line = document.lineAt(lineNumber);
      const range = line.range;

      const decoration: vscode.DecorationOptions = {
        range,
        hoverMessage: this.createHoverMessage(coverage),
      };

      switch (coverage.level) {
        case CoverageLevel.COVERED:
          coveredRanges.push(decoration);
          break;
        case CoverageLevel.PARTIAL:
          partialRanges.push(decoration);
          break;
        case CoverageLevel.UNCOVERED:
          uncoveredRanges.push(decoration);
          break;
      }
    }

    // Add decorations for untested functions
    for (const func of analysis.functions) {
      if (!func.hasTests) {
        const line = document.lineAt(func.startLine);
        untestedFunctionRanges.push({
          range: new vscode.Range(
            line.range.end,
            line.range.end
          ),
          hoverMessage: new vscode.MarkdownString(
            `**No tests found for \`${func.name}\`**\n\n` +
            `Click to generate test suggestions.`
          ),
        });
      }
    }

    // Apply decorations
    editor.setDecorations(this.coveredDecorationType, coveredRanges);
    editor.setDecorations(this.partialDecorationType, partialRanges);
    editor.setDecorations(this.uncoveredDecorationType, uncoveredRanges);
    editor.setDecorations(this.untestedFunctionDecorationType, untestedFunctionRanges);

    // Cache decorations
    this.activeDecorations.set(uri, {
      covered: coveredRanges,
      partial: partialRanges,
      uncovered: uncoveredRanges,
      untestedFunctions: untestedFunctionRanges,
    });
  }

  /**
   * Clear all decorations from an editor
   */
  clearDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.coveredDecorationType, []);
    editor.setDecorations(this.partialDecorationType, []);
    editor.setDecorations(this.uncoveredDecorationType, []);
    editor.setDecorations(this.untestedFunctionDecorationType, []);

    this.activeDecorations.delete(editor.document.uri.toString());
  }

  /**
   * Refresh decorations for an editor
   */
  async refreshDecorations(editor: vscode.TextEditor): Promise<void> {
    try {
      const analysis = await this.analysisService.analyzeFile(editor.document);
      this.updateDecorations(editor, analysis);
    } catch (error) {
      // Clear decorations on error
      this.clearDecorations(editor);
    }
  }

  /**
   * Get coverage summary for a document
   */
  getCoverageSummary(uri: string): CoverageSummary | undefined {
    const decorations = this.activeDecorations.get(uri);
    if (!decorations) {
      return undefined;
    }

    const total =
      decorations.covered.length +
      decorations.partial.length +
      decorations.uncovered.length;

    if (total === 0) {
      return undefined;
    }

    const covered = decorations.covered.length + decorations.partial.length * 0.5;
    const percentage = (covered / total) * 100;

    return {
      total,
      covered: decorations.covered.length,
      partial: decorations.partial.length,
      uncovered: decorations.uncovered.length,
      percentage: Math.round(percentage * 10) / 10,
      untestedFunctions: decorations.untestedFunctions.length,
    };
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.coveredDecorationType.dispose();
    this.partialDecorationType.dispose();
    this.uncoveredDecorationType.dispose();
    this.untestedFunctionDecorationType.dispose();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }

    this.activeDecorations.clear();
  }

  /**
   * Build coverage map from analysis results
   */
  private buildCoverageMap(
    document: vscode.TextDocument,
    analysis: FileAnalysis
  ): Map<number, LineCoverage> {
    const coverageMap = new Map<number, LineCoverage>();

    // Mark all executable lines in functions
    for (const func of analysis.functions) {
      for (let line = func.startLine; line <= func.endLine; line++) {
        const text = document.lineAt(line).text.trim();

        // Skip non-executable lines
        if (this.isNonExecutable(text)) {
          continue;
        }

        // Determine coverage level based on function coverage
        let level: CoverageLevel;
        if (func.coverage === undefined) {
          level = func.hasTests ? CoverageLevel.PARTIAL : CoverageLevel.UNCOVERED;
        } else if (func.coverage >= 100) {
          level = CoverageLevel.COVERED;
        } else if (func.coverage >= 50) {
          level = CoverageLevel.PARTIAL;
        } else {
          level = CoverageLevel.UNCOVERED;
        }

        coverageMap.set(line, {
          line,
          level,
          hitCount: func.coverage !== undefined ? Math.round(func.coverage) : undefined,
          branchCoverage: func.branchCoverage,
        });
      }
    }

    return coverageMap;
  }

  /**
   * Check if a line is non-executable
   */
  private isNonExecutable(text: string): boolean {
    if (text === '') return true;
    if (text.startsWith('//')) return true;
    if (text.startsWith('/*') || text.startsWith('*')) return true;
    if (text === '{' || text === '}') return true;
    if (text.startsWith('import ') || text.startsWith('export ')) return true;
    return false;
  }

  /**
   * Create hover message for coverage
   */
  private createHoverMessage(coverage: LineCoverage): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    switch (coverage.level) {
      case CoverageLevel.COVERED:
        md.appendMarkdown('**Coverage:** $(check) Covered');
        break;
      case CoverageLevel.PARTIAL:
        md.appendMarkdown('**Coverage:** $(warning) Partially covered');
        break;
      case CoverageLevel.UNCOVERED:
        md.appendMarkdown('**Coverage:** $(x) Not covered');
        break;
    }

    if (coverage.hitCount !== undefined) {
      md.appendMarkdown(`\n\n**Hit count:** ${coverage.hitCount}%`);
    }

    if (coverage.branchCoverage !== undefined) {
      md.appendMarkdown(`\n\n**Branch coverage:** ${coverage.branchCoverage}%`);
    }

    // Add action links
    if (coverage.level === CoverageLevel.UNCOVERED) {
      md.appendMarkdown('\n\n---\n\n');
      md.appendMarkdown('[Generate test](command:aqe.suggestTests)');
    }

    return md;
  }

  /**
   * Create a data URI for a gutter icon
   */
  private createGutterIcon(color: string): vscode.Uri {
    // Create a simple circle SVG icon
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="4" fill="${color}"/>
    </svg>`;

    const encoded = Buffer.from(svg).toString('base64');
    return vscode.Uri.parse(`data:image/svg+xml;base64,${encoded}`);
  }
}

/**
 * Editor decorations cache
 */
interface EditorDecorations {
  covered: vscode.DecorationOptions[];
  partial: vscode.DecorationOptions[];
  uncovered: vscode.DecorationOptions[];
  untestedFunctions: vscode.DecorationOptions[];
}

/**
 * Coverage summary for a document
 */
export interface CoverageSummary {
  total: number;
  covered: number;
  partial: number;
  uncovered: number;
  percentage: number;
  untestedFunctions: number;
}
