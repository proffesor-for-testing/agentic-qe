/**
 * CoverageGapVisualization - Enhanced Coverage Gap Detection and Visualization
 *
 * Provides advanced coverage gap visualization including:
 * - Heat map visualization of coverage density
 * - Interactive minimap showing coverage gaps
 * - Function-level coverage breakdown
 * - Risk-based prioritization of coverage gaps
 *
 * Phase 1: P1-004 - Coverage Gap Visualization
 *
 * @module vscode-extension/providers/CoverageGapVisualization
 * @version 0.1.0
 */

import * as vscode from 'vscode';
import type { AnalysisService, FileAnalysis, FunctionInfo } from '../services/AnalysisService';
import type { CoverageSummary } from './CoverageDecorationProvider';

/**
 * Coverage gap with risk assessment
 */
export interface CoverageGap {
  /** Function info */
  function: FunctionInfo;
  /** Start line */
  startLine: number;
  /** End line */
  endLine: number;
  /** Coverage percentage (0-100) */
  coverage: number;
  /** Risk level (high, medium, low) */
  riskLevel: 'high' | 'medium' | 'low';
  /** Risk score (0-100) */
  riskScore: number;
  /** Reason for risk assessment */
  riskReason: string;
  /** Suggested test types */
  suggestedTestTypes: string[];
}

/**
 * Coverage heat map data
 */
export interface HeatMapData {
  /** File path */
  filePath: string;
  /** Heat map cells (line -> coverage) */
  cells: Map<number, HeatMapCell>;
  /** Aggregate statistics */
  stats: HeatMapStats;
}

/**
 * Heat map cell
 */
export interface HeatMapCell {
  line: number;
  coverage: number;
  heatLevel: 'cold' | 'cool' | 'warm' | 'hot' | 'burning';
  functionName?: string;
}

/**
 * Heat map statistics
 */
export interface HeatMapStats {
  totalLines: number;
  coveredLines: number;
  uncoveredLines: number;
  hotspotCount: number;
  coldspotCount: number;
  averageCoverage: number;
}

/**
 * CoverageGapVisualization
 *
 * Enhanced coverage gap detection and visualization provider.
 */
export class CoverageGapVisualization implements vscode.Disposable {
  /**
   * Heat map decoration types (5 levels)
   */
  private readonly heatMapDecorations: vscode.TextEditorDecorationType[] = [];

  /**
   * Gap indicator decoration
   */
  private readonly gapIndicatorDecoration: vscode.TextEditorDecorationType;

  /**
   * High-risk gap decoration
   */
  private readonly highRiskDecoration: vscode.TextEditorDecorationType;

  /**
   * Status bar item for coverage
   */
  private readonly statusBarItem: vscode.StatusBarItem;

  /**
   * Cached gaps per file
   */
  private gapsCache: Map<string, CoverageGap[]> = new Map();

  /**
   * Cached heat maps per file
   */
  private heatMapCache: Map<string, HeatMapData> = new Map();

  /**
   * Disposables
   */
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly analysisService: AnalysisService) {
    // Create heat map decoration types (cold -> burning)
    const heatColors = [
      { bg: 'rgba(66, 165, 245, 0.1)', border: '#42A5F5' },  // Cold (blue)
      { bg: 'rgba(102, 187, 106, 0.1)', border: '#66BB6A' }, // Cool (green)
      { bg: 'rgba(255, 238, 88, 0.1)', border: '#FFEE58' },  // Warm (yellow)
      { bg: 'rgba(255, 167, 38, 0.1)', border: '#FFA726' },  // Hot (orange)
      { bg: 'rgba(244, 67, 54, 0.15)', border: '#F44336' },  // Burning (red)
    ];

    for (const color of heatColors) {
      this.heatMapDecorations.push(
        vscode.window.createTextEditorDecorationType({
          backgroundColor: color.bg,
          overviewRulerColor: color.border,
          overviewRulerLane: vscode.OverviewRulerLane.Full,
          isWholeLine: true,
        })
      );
    }

    // Gap indicator decoration (line marker in gutter)
    this.gapIndicatorDecoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.createGapIcon(),
      gutterIconSize: 'contain',
    });

    // High-risk gap decoration
    this.highRiskDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ' ⚠️ High Risk Gap',
        color: new vscode.ThemeColor('errorForeground'),
        fontStyle: 'italic',
      },
      backgroundColor: 'rgba(244, 67, 54, 0.08)',
      isWholeLine: true,
    });

    // Status bar item
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'aqe.showCoverageGaps';
    this.statusBarItem.tooltip = 'Click to view coverage gaps';
    this.disposables.push(this.statusBarItem);

    // Register event handlers
    this.registerEventHandlers();
  }

  /**
   * Analyze and visualize coverage gaps for an editor
   */
  async visualizeGaps(editor: vscode.TextEditor): Promise<CoverageGap[]> {
    const document = editor.document;
    const filePath = document.fileName;

    // Get analysis
    const analysis = await this.analysisService.analyzeFile(document);

    // Detect coverage gaps
    const gaps = this.detectCoverageGaps(analysis);

    // Generate heat map
    const heatMap = this.generateHeatMap(document, analysis);

    // Cache results
    this.gapsCache.set(filePath, gaps);
    this.heatMapCache.set(filePath, heatMap);

    // Apply visualizations
    this.applyHeatMapDecorations(editor, heatMap);
    this.applyGapIndicators(editor, gaps);

    // Update status bar
    this.updateStatusBar(gaps, analysis);

    return gaps;
  }

  /**
   * Detect coverage gaps from analysis
   */
  private detectCoverageGaps(analysis: FileAnalysis): CoverageGap[] {
    const gaps: CoverageGap[] = [];

    for (const func of analysis.functions) {
      // Calculate coverage (default to 0 if no tests)
      const coverage = func.coverage ?? 0;

      // Determine if this is a gap
      if (coverage < 80) {
        const gap = this.assessCoverageGap(func, coverage);
        gaps.push(gap);
      }
    }

    // Sort by risk score (highest first)
    gaps.sort((a, b) => b.riskScore - a.riskScore);

    return gaps;
  }

  /**
   * Assess risk level for a coverage gap
   */
  private assessCoverageGap(func: FunctionInfo, coverage: number): CoverageGap {
    let riskScore = 0;
    const riskFactors: string[] = [];

    // Factor 1: Coverage level
    if (coverage === 0) {
      riskScore += 40;
      riskFactors.push('No test coverage');
    } else if (coverage < 50) {
      riskScore += 30;
      riskFactors.push('Low coverage');
    } else {
      riskScore += 10;
      riskFactors.push('Partial coverage');
    }

    // Factor 2: Function complexity (based on code length)
    const lineCount = func.endLine - func.startLine + 1;
    if (lineCount > 50) {
      riskScore += 25;
      riskFactors.push('Complex function (50+ lines)');
    } else if (lineCount > 20) {
      riskScore += 15;
      riskFactors.push('Moderate complexity');
    }

    // Factor 3: Is exported (API surface)
    if (func.isExported) {
      riskScore += 15;
      riskFactors.push('Exported/public function');
    }

    // Factor 4: Is async (more failure modes)
    if (func.isAsync) {
      riskScore += 10;
      riskFactors.push('Async function');
    }

    // Factor 5: Has many parameters
    if (func.parameters.length > 3) {
      riskScore += 10;
      riskFactors.push(`Many parameters (${func.parameters.length})`);
    }

    // Determine risk level
    let riskLevel: 'high' | 'medium' | 'low';
    if (riskScore >= 60) {
      riskLevel = 'high';
    } else if (riskScore >= 30) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    // Suggest test types
    const suggestedTestTypes = this.suggestTestTypes(func, coverage);

    return {
      function: func,
      startLine: func.startLine,
      endLine: func.endLine,
      coverage,
      riskLevel,
      riskScore,
      riskReason: riskFactors.join(', '),
      suggestedTestTypes,
    };
  }

  /**
   * Suggest test types based on function characteristics
   */
  private suggestTestTypes(func: FunctionInfo, coverage: number): string[] {
    const types: string[] = [];

    // Always suggest unit tests for uncovered functions
    if (coverage === 0) {
      types.push('unit-test');
    }

    // Suggest edge case tests for partially covered
    if (coverage > 0 && coverage < 80) {
      types.push('edge-case-test');
    }

    // Suggest error handling tests for async functions
    if (func.isAsync) {
      types.push('error-handling-test');
    }

    // Suggest integration tests for exported functions
    if (func.isExported) {
      types.push('integration-test');
    }

    // Suggest property-based tests for functions with many params
    if (func.parameters.length > 3) {
      types.push('property-based-test');
    }

    return types;
  }

  /**
   * Generate heat map from analysis
   */
  private generateHeatMap(
    document: vscode.TextDocument,
    analysis: FileAnalysis
  ): HeatMapData {
    const cells = new Map<number, HeatMapCell>();
    let coveredLines = 0;
    let uncoveredLines = 0;
    let hotspotCount = 0;
    let coldspotCount = 0;
    let totalCoverage = 0;
    let lineCount = 0;

    // Process each function
    for (const func of analysis.functions) {
      const coverage = func.coverage ?? 0;

      for (let line = func.startLine; line <= func.endLine; line++) {
        const text = document.lineAt(line).text.trim();

        // Skip non-executable lines
        if (this.isNonExecutable(text)) {
          continue;
        }

        // Determine heat level
        const heatLevel = this.getHeatLevel(coverage);

        cells.set(line, {
          line,
          coverage,
          heatLevel,
          functionName: func.name,
        });

        // Track statistics
        lineCount++;
        totalCoverage += coverage;

        if (coverage >= 80) {
          coveredLines++;
          coldspotCount++;
        } else {
          uncoveredLines++;
          if (coverage < 20) {
            hotspotCount++;
          }
        }
      }
    }

    return {
      filePath: document.fileName,
      cells,
      stats: {
        totalLines: lineCount,
        coveredLines,
        uncoveredLines,
        hotspotCount,
        coldspotCount,
        averageCoverage: lineCount > 0 ? totalCoverage / lineCount : 0,
      },
    };
  }

  /**
   * Get heat level from coverage percentage
   */
  private getHeatLevel(coverage: number): HeatMapCell['heatLevel'] {
    if (coverage >= 80) return 'cold';
    if (coverage >= 60) return 'cool';
    if (coverage >= 40) return 'warm';
    if (coverage >= 20) return 'hot';
    return 'burning';
  }

  /**
   * Apply heat map decorations to editor
   */
  private applyHeatMapDecorations(
    editor: vscode.TextEditor,
    heatMap: HeatMapData
  ): void {
    // Group cells by heat level
    const byLevel: Map<HeatMapCell['heatLevel'], vscode.DecorationOptions[]> = new Map([
      ['cold', []],
      ['cool', []],
      ['warm', []],
      ['hot', []],
      ['burning', []],
    ]);

    for (const [lineNumber, cell] of heatMap.cells) {
      const line = editor.document.lineAt(lineNumber);
      const decoration: vscode.DecorationOptions = {
        range: line.range,
        hoverMessage: this.createCellHoverMessage(cell),
      };
      byLevel.get(cell.heatLevel)!.push(decoration);
    }

    // Apply decorations
    const levels: HeatMapCell['heatLevel'][] = ['cold', 'cool', 'warm', 'hot', 'burning'];
    levels.forEach((level, index) => {
      editor.setDecorations(this.heatMapDecorations[index], byLevel.get(level)!);
    });
  }

  /**
   * Apply gap indicator decorations
   */
  private applyGapIndicators(
    editor: vscode.TextEditor,
    gaps: CoverageGap[]
  ): void {
    const gapIndicators: vscode.DecorationOptions[] = [];
    const highRiskIndicators: vscode.DecorationOptions[] = [];

    for (const gap of gaps) {
      const line = editor.document.lineAt(gap.startLine);

      // Gap indicator in gutter
      gapIndicators.push({
        range: line.range,
        hoverMessage: this.createGapHoverMessage(gap),
      });

      // High-risk inline decoration
      if (gap.riskLevel === 'high') {
        highRiskIndicators.push({
          range: line.range,
          hoverMessage: this.createGapHoverMessage(gap),
        });
      }
    }

    editor.setDecorations(this.gapIndicatorDecoration, gapIndicators);
    editor.setDecorations(this.highRiskDecoration, highRiskIndicators);
  }

  /**
   * Create hover message for heat map cell
   */
  private createCellHoverMessage(cell: HeatMapCell): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    const icon = cell.heatLevel === 'cold' || cell.heatLevel === 'cool'
      ? '$(check)'
      : cell.heatLevel === 'burning'
        ? '$(flame)'
        : '$(warning)';

    md.appendMarkdown(`### ${icon} Coverage: ${cell.coverage.toFixed(1)}%\n\n`);

    if (cell.functionName) {
      md.appendMarkdown(`**Function:** \`${cell.functionName}\`\n\n`);
    }

    md.appendMarkdown(`**Heat Level:** ${cell.heatLevel.toUpperCase()}\n\n`);

    if (cell.heatLevel !== 'cold' && cell.heatLevel !== 'cool') {
      md.appendMarkdown('---\n\n');
      md.appendMarkdown('[Generate Test](command:aqe.suggestTests) | ');
      md.appendMarkdown('[View Gaps](command:aqe.showCoverageGaps)');
    }

    return md;
  }

  /**
   * Create hover message for coverage gap
   */
  private createGapHoverMessage(gap: CoverageGap): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    const riskIcon = gap.riskLevel === 'high'
      ? '$(error)'
      : gap.riskLevel === 'medium'
        ? '$(warning)'
        : '$(info)';

    md.appendMarkdown(`### ${riskIcon} Coverage Gap Detected\n\n`);
    md.appendMarkdown(`**Function:** \`${gap.function.name}\`\n\n`);
    md.appendMarkdown(`**Coverage:** ${gap.coverage.toFixed(1)}%\n\n`);
    md.appendMarkdown(`**Risk Level:** ${gap.riskLevel.toUpperCase()} (${gap.riskScore}/100)\n\n`);
    md.appendMarkdown(`**Risk Factors:** ${gap.riskReason}\n\n`);

    if (gap.suggestedTestTypes.length > 0) {
      md.appendMarkdown('**Suggested Tests:**\n');
      for (const testType of gap.suggestedTestTypes) {
        md.appendMarkdown(`- ${testType}\n`);
      }
      md.appendMarkdown('\n');
    }

    md.appendMarkdown('---\n\n');
    md.appendMarkdown('[Generate Tests](command:aqe.generateTests) | ');
    md.appendMarkdown('[Analyze](command:aqe.analyze)');

    return md;
  }

  /**
   * Update status bar with coverage info
   */
  private updateStatusBar(gaps: CoverageGap[], analysis: FileAnalysis): void {
    const highRiskCount = gaps.filter((g) => g.riskLevel === 'high').length;
    const totalFunctions = analysis.functions.length;
    const testedFunctions = analysis.functions.filter((f) => f.hasTests).length;
    const coverage = analysis.estimatedCoverage ?? 0;

    let icon = '$(check)';
    let color: string | undefined;

    if (highRiskCount > 0) {
      icon = '$(error)';
      color = 'statusBarItem.errorBackground';
    } else if (gaps.length > 0) {
      icon = '$(warning)';
      color = 'statusBarItem.warningBackground';
    }

    this.statusBarItem.text = `${icon} AQE: ${coverage.toFixed(0)}% (${gaps.length} gaps)`;
    this.statusBarItem.backgroundColor = color
      ? new vscode.ThemeColor(color)
      : undefined;
    this.statusBarItem.show();
  }

  /**
   * Show coverage gaps in quick pick
   */
  async showCoverageGaps(editor: vscode.TextEditor): Promise<void> {
    const filePath = editor.document.fileName;
    let gaps = this.gapsCache.get(filePath);

    if (!gaps) {
      gaps = await this.visualizeGaps(editor);
    }

    if (gaps.length === 0) {
      vscode.window.showInformationMessage('No coverage gaps detected!');
      return;
    }

    const items = gaps.map((gap) => ({
      label: `${this.getRiskIcon(gap.riskLevel)} ${gap.function.name}`,
      description: `${gap.coverage.toFixed(0)}% coverage`,
      detail: gap.riskReason,
      gap,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `${gaps.length} coverage gaps found`,
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (selected) {
      // Navigate to gap
      const line = editor.document.lineAt(selected.gap.startLine);
      editor.revealRange(line.range, vscode.TextEditorRevealType.InCenter);
      editor.selection = new vscode.Selection(line.range.start, line.range.start);
    }
  }

  /**
   * Get risk icon
   */
  private getRiskIcon(riskLevel: CoverageGap['riskLevel']): string {
    switch (riskLevel) {
      case 'high':
        return '$(error)';
      case 'medium':
        return '$(warning)';
      case 'low':
        return '$(info)';
    }
  }

  /**
   * Get gaps for a file
   */
  getGaps(filePath: string): CoverageGap[] | undefined {
    return this.gapsCache.get(filePath);
  }

  /**
   * Get heat map for a file
   */
  getHeatMap(filePath: string): HeatMapData | undefined {
    return this.heatMapCache.get(filePath);
  }

  /**
   * Clear caches
   */
  clearCaches(): void {
    this.gapsCache.clear();
    this.heatMapCache.clear();
  }

  /**
   * Register event handlers
   */
  private registerEventHandlers(): void {
    // Update on editor change
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && this.isSupported(editor.document)) {
          this.visualizeGaps(editor);
        } else {
          this.statusBarItem.hide();
        }
      })
    );

    // Update on document save
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (this.isSupported(document)) {
          // Invalidate cache
          this.gapsCache.delete(document.fileName);
          this.heatMapCache.delete(document.fileName);

          // Update if visible
          const editor = vscode.window.visibleTextEditors.find(
            (e) => e.document === document
          );
          if (editor) {
            this.visualizeGaps(editor);
          }
        }
      })
    );
  }

  /**
   * Check if document is supported
   */
  private isSupported(document: vscode.TextDocument): boolean {
    const supportedLanguages = [
      'typescript',
      'javascript',
      'typescriptreact',
      'javascriptreact',
    ];
    return supportedLanguages.includes(document.languageId);
  }

  /**
   * Check if line is non-executable
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
   * Create gap icon SVG
   */
  private createGapIcon(): vscode.Uri {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <path fill="#FF9800" d="M8 1L1 14h14L8 1zm0 3l5.25 9H2.75L8 4z"/>
      <rect fill="#FF9800" x="7" y="6" width="2" height="4"/>
      <rect fill="#FF9800" x="7" y="11" width="2" height="2"/>
    </svg>`;

    const encoded = Buffer.from(svg).toString('base64');
    return vscode.Uri.parse(`data:image/svg+xml;base64,${encoded}`);
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    for (const decoration of this.heatMapDecorations) {
      decoration.dispose();
    }
    this.gapIndicatorDecoration.dispose();
    this.highRiskDecoration.dispose();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }

    this.gapsCache.clear();
    this.heatMapCache.clear();
  }
}

/**
 * Create CoverageGapVisualization instance
 */
export function createCoverageGapVisualization(
  analysisService: AnalysisService
): CoverageGapVisualization {
  return new CoverageGapVisualization(analysisService);
}
