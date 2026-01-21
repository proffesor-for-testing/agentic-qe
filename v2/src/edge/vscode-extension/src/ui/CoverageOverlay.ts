/**
 * CoverageOverlay - Visual Overlay for Coverage Gaps
 *
 * Provides a visual overlay showing coverage gaps in the editor.
 * Uses VS Code's decoration API to highlight:
 * - Uncovered code regions
 * - Partially covered branches
 * - Coverage percentage indicators
 *
 * @module vscode-extension/ui/CoverageOverlay
 * @version 0.1.0
 */

import * as vscode from 'vscode';
import type { AnalysisService, FunctionInfo, FileAnalysis } from '../services/AnalysisService';

/**
 * Coverage gap information
 */
export interface CoverageGap {
  /**
   * Start line (0-indexed)
   */
  startLine: number;

  /**
   * End line (0-indexed)
   */
  endLine: number;

  /**
   * Gap type
   */
  type: 'uncovered' | 'partial' | 'branch' | 'condition';

  /**
   * Associated function name
   */
  functionName?: string;

  /**
   * Description of the gap
   */
  description: string;

  /**
   * Priority (higher = more important)
   */
  priority: number;
}

/**
 * Coverage summary
 */
export interface CoverageSummary {
  /**
   * Overall coverage percentage
   */
  overall: number;

  /**
   * Statement coverage
   */
  statements: number;

  /**
   * Branch coverage
   */
  branches: number;

  /**
   * Function coverage
   */
  functions: number;

  /**
   * Line coverage
   */
  lines: number;

  /**
   * Number of uncovered lines
   */
  uncoveredLines: number;

  /**
   * Number of partial branches
   */
  partialBranches: number;

  /**
   * List of coverage gaps
   */
  gaps: CoverageGap[];
}

/**
 * CoverageOverlay
 *
 * Manages visual coverage overlays in the editor.
 */
export class CoverageOverlay implements vscode.Disposable {
  /**
   * Decoration type for uncovered code (red background)
   */
  private readonly uncoveredDecorationType: vscode.TextEditorDecorationType;

  /**
   * Decoration type for partial coverage (yellow background)
   */
  private readonly partialDecorationType: vscode.TextEditorDecorationType;

  /**
   * Decoration type for covered code (green gutter)
   */
  private readonly coveredDecorationType: vscode.TextEditorDecorationType;

  /**
   * Decoration type for coverage percentage in gutter
   */
  private readonly gutterDecorationType: vscode.TextEditorDecorationType;

  /**
   * Decoration type for branch indicators
   */
  private readonly branchDecorationType: vscode.TextEditorDecorationType;

  /**
   * Whether overlay is enabled
   */
  private isEnabled = false;

  /**
   * Current coverage data per document
   */
  private coverageData: Map<string, CoverageSummary> = new Map();

  /**
   * Status bar item
   */
  private statusBarItem: vscode.StatusBarItem;

  /**
   * Disposables
   */
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly analysisService: AnalysisService) {
    // Create uncovered decoration type (red)
    this.uncoveredDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor('diffEditor.removedTextBackground'),
      isWholeLine: true,
      overviewRulerColor: new vscode.ThemeColor('editorError.foreground'),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    // Create partial coverage decoration type (yellow)
    this.partialDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor('diffEditor.removedLineBackground'),
      isWholeLine: true,
      overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    // Create covered decoration type (green gutter)
    this.coveredDecorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.parse(
        'data:image/svg+xml;base64,' +
          Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="4" fill="#4CAF50"/></svg>'
          ).toString('base64')
      ),
      gutterIconSize: 'contain',
    });

    // Create gutter coverage percentage decoration
    this.gutterDecorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.parse(
        'data:image/svg+xml;base64,' +
          Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#2196F3"/></svg>'
          ).toString('base64')
      ),
      gutterIconSize: 'contain',
    });

    // Create branch indicator decoration
    this.branchDecorationType = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ' [branch]',
        color: new vscode.ThemeColor('editorWarning.foreground'),
        fontStyle: 'italic',
      },
    });

    // Create status bar item
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = 'aqe.toggleCoverageOverlay';
    this.disposables.push(this.statusBarItem);

    // Register event handlers
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && this.isEnabled) {
          this.updateOverlay(editor);
        }
      })
    );

    // Initial update
    this.updateStatusBar();
  }

  /**
   * Toggle the coverage overlay
   */
  toggle(): void {
    this.isEnabled = !this.isEnabled;
    this.updateStatusBar();

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      if (this.isEnabled) {
        this.updateOverlay(editor);
      } else {
        this.clearOverlay(editor);
      }
    }
  }

  /**
   * Enable the coverage overlay
   */
  enable(): void {
    this.isEnabled = true;
    this.updateStatusBar();

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.updateOverlay(editor);
    }
  }

  /**
   * Disable the coverage overlay
   */
  disable(): void {
    this.isEnabled = false;
    this.updateStatusBar();

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.clearOverlay(editor);
    }
  }

  /**
   * Update overlay for an editor
   */
  async updateOverlay(editor: vscode.TextEditor): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    const document = editor.document;

    if (!this.isSupported(document)) {
      this.clearOverlay(editor);
      return;
    }

    try {
      // Get coverage summary
      const summary = await this.getCoverageSummary(document);
      this.coverageData.set(document.uri.toString(), summary);

      // Apply decorations
      this.applyDecorations(editor, summary);

      // Update status bar
      this.updateStatusBar(summary);
    } catch (error) {
      console.error('[CoverageOverlay] Error updating overlay:', error);
    }
  }

  /**
   * Clear overlay for an editor
   */
  clearOverlay(editor: vscode.TextEditor): void {
    editor.setDecorations(this.uncoveredDecorationType, []);
    editor.setDecorations(this.partialDecorationType, []);
    editor.setDecorations(this.coveredDecorationType, []);
    editor.setDecorations(this.gutterDecorationType, []);
    editor.setDecorations(this.branchDecorationType, []);
  }

  /**
   * Get coverage summary for a document
   */
  async getCoverageSummary(document: vscode.TextDocument): Promise<CoverageSummary> {
    // Analyze the file
    const analysis = await this.analysisService.analyzeFile(document);

    // Calculate coverage metrics
    const gaps: CoverageGap[] = [];
    let totalLines = 0;
    let coveredLines = 0;
    let totalBranches = 0;
    let coveredBranches = 0;

    for (const func of analysis.functions) {
      const lineCount = func.endLine - func.startLine + 1;
      totalLines += lineCount;

      const funcCoverage = func.coverage ?? 0;
      coveredLines += Math.round((funcCoverage / 100) * lineCount);

      // Analyze coverage gaps
      if (funcCoverage === 0) {
        gaps.push({
          startLine: func.startLine,
          endLine: func.endLine,
          type: 'uncovered',
          functionName: func.name,
          description: `Function ${func.name} has no test coverage`,
          priority: 3,
        });
      } else if (funcCoverage < 80) {
        // Identify partial coverage
        const partialGaps = this.identifyPartialCoverage(func, document);
        gaps.push(...partialGaps);
      }

      // Count branches
      const branches = this.countBranches(func.code);
      totalBranches += branches.total;
      coveredBranches += Math.round((funcCoverage / 100) * branches.total);
    }

    // Calculate percentages
    const lineCoverage = totalLines > 0 ? Math.round((coveredLines / totalLines) * 100) : 0;
    const branchCoverage = totalBranches > 0 ? Math.round((coveredBranches / totalBranches) * 100) : 0;
    const functionCoverage =
      analysis.functions.length > 0
        ? Math.round(
            (analysis.functions.filter((f) => f.hasTests).length / analysis.functions.length) * 100
          )
        : 0;

    return {
      overall: Math.round((lineCoverage + branchCoverage + functionCoverage) / 3),
      statements: lineCoverage,
      branches: branchCoverage,
      functions: functionCoverage,
      lines: lineCoverage,
      uncoveredLines: totalLines - coveredLines,
      partialBranches: totalBranches - coveredBranches,
      gaps: gaps.sort((a, b) => b.priority - a.priority),
    };
  }

  /**
   * Get coverage gaps for a document
   */
  getCoverageGaps(uri: vscode.Uri): CoverageGap[] {
    const summary = this.coverageData.get(uri.toString());
    return summary?.gaps ?? [];
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.uncoveredDecorationType.dispose();
    this.partialDecorationType.dispose();
    this.coveredDecorationType.dispose();
    this.gutterDecorationType.dispose();
    this.branchDecorationType.dispose();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];

    this.coverageData.clear();
  }

  /**
   * Apply decorations to editor
   */
  private applyDecorations(editor: vscode.TextEditor, summary: CoverageSummary): void {
    const uncoveredDecorations: vscode.DecorationOptions[] = [];
    const partialDecorations: vscode.DecorationOptions[] = [];
    const branchDecorations: vscode.DecorationOptions[] = [];
    const coveredDecorations: vscode.DecorationOptions[] = [];

    for (const gap of summary.gaps) {
      const range = new vscode.Range(gap.startLine, 0, gap.endLine, 0);

      const decorationOptions: vscode.DecorationOptions = {
        range,
        hoverMessage: this.createGapHoverMessage(gap),
      };

      switch (gap.type) {
        case 'uncovered':
          uncoveredDecorations.push(decorationOptions);
          break;

        case 'partial':
          partialDecorations.push(decorationOptions);
          break;

        case 'branch':
        case 'condition':
          branchDecorations.push(decorationOptions);
          break;
      }
    }

    // Apply decorations
    editor.setDecorations(this.uncoveredDecorationType, uncoveredDecorations);
    editor.setDecorations(this.partialDecorationType, partialDecorations);
    editor.setDecorations(this.branchDecorationType, branchDecorations);
    editor.setDecorations(this.coveredDecorationType, coveredDecorations);
  }

  /**
   * Create hover message for a coverage gap
   */
  private createGapHoverMessage(gap: CoverageGap): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    // Icon and title
    const icon = gap.type === 'uncovered' ? '$(error)' : gap.type === 'partial' ? '$(warning)' : '$(info)';
    md.appendMarkdown(`### ${icon} Coverage Gap\n\n`);

    // Description
    md.appendMarkdown(`**${gap.description}**\n\n`);

    // Gap details
    md.appendMarkdown(`- **Type:** ${gap.type}\n`);
    md.appendMarkdown(`- **Lines:** ${gap.startLine + 1} - ${gap.endLine + 1}\n`);

    if (gap.functionName) {
      md.appendMarkdown(`- **Function:** \`${gap.functionName}\`\n`);
    }

    md.appendMarkdown('\n---\n\n');

    // Action links
    if (gap.functionName) {
      md.appendMarkdown(
        `[$(beaker) Generate Tests](command:aqe.generateTestsForFunction?${encodeURIComponent(
          JSON.stringify({ functionName: gap.functionName })
        )}) | `
      );
    }

    md.appendMarkdown(
      `[$(list-selection) View All Gaps](command:aqe.showCoverageGaps?${encodeURIComponent(
        JSON.stringify({ line: gap.startLine })
      )})`
    );

    return md;
  }

  /**
   * Identify partial coverage gaps in a function
   */
  private identifyPartialCoverage(func: FunctionInfo, document: vscode.TextDocument): CoverageGap[] {
    const gaps: CoverageGap[] = [];
    const code = func.code;
    const lines = code.split('\n');

    // Find if/else branches that might be uncovered
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const absoluteLine = func.startLine + i;

      // Check for conditional statements
      if (/\bif\s*\(/.test(line)) {
        // Find else branch
        let elseIndex = -1;
        let braceCount = 0;

        for (let j = i; j < lines.length; j++) {
          braceCount += (lines[j].match(/\{/g) || []).length;
          braceCount -= (lines[j].match(/\}/g) || []).length;

          if (braceCount === 0 && /\belse\b/.test(lines[j + 1] || '')) {
            elseIndex = j + 1;
            break;
          }
        }

        if (elseIndex > 0) {
          gaps.push({
            startLine: func.startLine + elseIndex,
            endLine: func.startLine + elseIndex,
            type: 'branch',
            functionName: func.name,
            description: `Else branch may need additional coverage`,
            priority: 2,
          });
        }
      }

      // Check for ternary operators
      if (/\?.*:/.test(line)) {
        gaps.push({
          startLine: absoluteLine,
          endLine: absoluteLine,
          type: 'condition',
          functionName: func.name,
          description: `Ternary condition - both paths should be tested`,
          priority: 1,
        });
      }

      // Check for short-circuit evaluation
      if (/\&\&|\|\|/.test(line)) {
        gaps.push({
          startLine: absoluteLine,
          endLine: absoluteLine,
          type: 'condition',
          functionName: func.name,
          description: `Short-circuit evaluation - all paths should be tested`,
          priority: 1,
        });
      }

      // Check for switch statements
      if (/\bswitch\s*\(/.test(line)) {
        gaps.push({
          startLine: absoluteLine,
          endLine: absoluteLine,
          type: 'branch',
          functionName: func.name,
          description: `Switch statement - all cases should be tested`,
          priority: 2,
        });
      }
    }

    return gaps;
  }

  /**
   * Count branches in code
   */
  private countBranches(code: string): { total: number; covered: number } {
    let total = 0;

    // Count if statements (2 branches each)
    total += (code.match(/\bif\s*\(/g) || []).length * 2;

    // Count ternary operators (2 branches each)
    total += (code.match(/\?.*:/g) || []).length * 2;

    // Count switch cases
    total += (code.match(/\bcase\s+/g) || []).length;

    // Count default case
    total += (code.match(/\bdefault\s*:/g) || []).length;

    // Count && and || (each adds a branch)
    total += (code.match(/\&\&|\|\|/g) || []).length;

    // Count catch blocks
    total += (code.match(/\bcatch\s*\(/g) || []).length;

    return { total, covered: 0 }; // Covered would come from actual coverage data
  }

  /**
   * Update status bar item
   */
  private updateStatusBar(summary?: CoverageSummary): void {
    if (!this.isEnabled) {
      this.statusBarItem.text = '$(eye-closed) Coverage Off';
      this.statusBarItem.tooltip = 'Click to enable coverage overlay';
      this.statusBarItem.backgroundColor = undefined;
    } else if (summary) {
      const icon = summary.overall >= 80 ? '$(check)' : summary.overall >= 60 ? '$(warning)' : '$(error)';
      this.statusBarItem.text = `${icon} Coverage: ${summary.overall}%`;
      this.statusBarItem.tooltip = this.createStatusBarTooltip(summary);

      if (summary.overall < 60) {
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.warningBackground'
        );
      } else {
        this.statusBarItem.backgroundColor = undefined;
      }
    } else {
      this.statusBarItem.text = '$(eye) Coverage On';
      this.statusBarItem.tooltip = 'Coverage overlay enabled';
    }

    this.statusBarItem.show();
  }

  /**
   * Create tooltip for status bar
   */
  private createStatusBarTooltip(summary: CoverageSummary): string {
    return `Coverage Summary
----------------
Overall: ${summary.overall}%
Statements: ${summary.statements}%
Branches: ${summary.branches}%
Functions: ${summary.functions}%

Uncovered Lines: ${summary.uncoveredLines}
Partial Branches: ${summary.partialBranches}
Coverage Gaps: ${summary.gaps.length}

Click to toggle overlay`;
  }

  /**
   * Check if document is supported
   */
  private isSupported(document: vscode.TextDocument): boolean {
    const supportedLanguages = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'];
    return supportedLanguages.includes(document.languageId);
  }
}

/**
 * Coverage gap quick pick
 *
 * Shows a quick pick with all coverage gaps for easy navigation.
 */
export class CoverageGapQuickPick {
  /**
   * Show quick pick with coverage gaps
   */
  static async show(coverageOverlay: CoverageOverlay, editor: vscode.TextEditor): Promise<void> {
    const gaps = coverageOverlay.getCoverageGaps(editor.document.uri);

    if (gaps.length === 0) {
      vscode.window.showInformationMessage('No coverage gaps found');
      return;
    }

    // Create quick pick items
    const items: (vscode.QuickPickItem & { gap: CoverageGap })[] = gaps.map((gap) => {
      const icon =
        gap.type === 'uncovered'
          ? '$(error)'
          : gap.type === 'partial'
            ? '$(warning)'
            : '$(info)';

      return {
        label: `${icon} Line ${gap.startLine + 1}`,
        description: gap.functionName ?? '',
        detail: gap.description,
        gap,
      };
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a coverage gap to navigate to',
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (selected) {
      // Navigate to the gap
      const position = new vscode.Position(selected.gap.startLine, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenter
      );
    }
  }
}
