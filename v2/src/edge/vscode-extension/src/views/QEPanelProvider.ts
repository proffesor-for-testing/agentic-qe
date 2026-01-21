/**
 * QEPanelProvider - Webview Panel Provider for QE Dashboard
 *
 * Provides a webview panel in the VS Code sidebar that displays:
 * - Coverage statistics
 * - Test suggestions
 * - Pattern storage stats
 * - Analysis history
 *
 * The webview uses the @ruvector/edge code from src/edge for WASM operations.
 *
 * @module vscode-extension/views/QEPanelProvider
 * @version 0.1.0
 */

import * as vscode from 'vscode';
import type { EdgeAgentService } from '../services/EdgeAgentService';
import type { AnalysisService, FileAnalysis } from '../services/AnalysisService';

/**
 * Message types for webview communication
 */
export type WebviewMessage =
  | { type: 'analyze'; uri: string }
  | { type: 'generateTests'; code: string; fileName: string }
  | { type: 'getStats' }
  | { type: 'clearPatterns' }
  | { type: 'searchPatterns'; query: string }
  | { type: 'refresh' }
  | { type: 'openFile'; uri: string; line?: number };

/**
 * Message types sent from extension to webview
 */
export type ExtensionMessage =
  | { type: 'analysis'; data: FileAnalysis }
  | { type: 'stats'; data: StatsData }
  | { type: 'patterns'; data: PatternData[] }
  | { type: 'suggestions'; data: SuggestionData[] }
  | { type: 'error'; message: string }
  | { type: 'loading'; loading: boolean }
  | { type: 'stateUpdate'; state: PanelState };

/**
 * Stats data for the panel
 */
interface StatsData {
  patternCount: number;
  vectorDimension: number;
  qps: number;
  p50Latency: number;
  p99Latency: number;
  implementation: string;
}

/**
 * Pattern data for display
 */
interface PatternData {
  id: string;
  type: string;
  domain: string;
  content: string;
  score?: number;
}

/**
 * Suggestion data for display
 */
interface SuggestionData {
  title: string;
  description: string;
  code: string;
  confidence: number;
}

/**
 * Panel state
 */
interface PanelState {
  currentFile?: string;
  coveragePercentage?: number;
  functionCount?: number;
  suggestionsCount?: number;
  lastAnalysisTime?: number;
}

/**
 * QEPanelProvider
 *
 * Implements WebviewViewProvider to provide the QE Dashboard in the sidebar.
 */
export class QEPanelProvider implements vscode.WebviewViewProvider {
  /**
   * View type identifier
   */
  public static readonly viewType = 'aqe.panel';

  /**
   * Current webview reference
   */
  private webviewView?: vscode.WebviewView;

  /**
   * Current panel state
   */
  private state: PanelState = {};

  /**
   * Disposables for cleanup
   */
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly edgeAgentService: EdgeAgentService,
    private readonly analysisService: AnalysisService
  ) {}

  /**
   * Resolve webview view (called when the view becomes visible)
   */
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.webviewView = webviewView;

    // Configure webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    // Set the HTML content
    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    // Handle messages from the webview
    this.disposables.push(
      webviewView.webview.onDidReceiveMessage((message: WebviewMessage) =>
        this.handleMessage(message)
      )
    );

    // Handle visibility changes
    this.disposables.push(
      webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible) {
          this.refresh();
        }
      })
    );

    // Register for active editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && this.isSupported(editor.document)) {
          this.analyzeCurrentFile(editor.document);
        }
      })
    );

    // Initial refresh
    this.refresh();
  }

  /**
   * Handle messages from the webview
   */
  private async handleMessage(message: WebviewMessage): Promise<void> {
    try {
      this.sendMessage({ type: 'loading', loading: true });

      switch (message.type) {
        case 'analyze':
          await this.analyzeFile(message.uri);
          break;

        case 'generateTests':
          await this.generateTests(message.code, message.fileName);
          break;

        case 'getStats':
          await this.sendStats();
          break;

        case 'clearPatterns':
          await this.clearPatterns();
          break;

        case 'searchPatterns':
          await this.searchPatterns(message.query);
          break;

        case 'refresh':
          await this.refresh();
          break;

        case 'openFile':
          await this.openFile(message.uri, message.line);
          break;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.sendMessage({ type: 'error', message: errorMessage });
    } finally {
      this.sendMessage({ type: 'loading', loading: false });
    }
  }

  /**
   * Analyze a file by URI
   */
  private async analyzeFile(uri: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
    const analysis = await this.analysisService.analyzeFile(document);

    this.state = {
      currentFile: document.fileName,
      coveragePercentage: this.calculateCoverage(analysis),
      functionCount: analysis.functions.length,
      suggestionsCount: analysis.suggestions.length,
      lastAnalysisTime: Date.now(),
    };

    this.sendMessage({ type: 'analysis', data: analysis });
    this.sendMessage({ type: 'stateUpdate', state: this.state });
  }

  /**
   * Analyze current active file
   */
  private async analyzeCurrentFile(document: vscode.TextDocument): Promise<void> {
    const analysis = await this.analysisService.analyzeFile(document);

    this.state = {
      currentFile: document.fileName,
      coveragePercentage: this.calculateCoverage(analysis),
      functionCount: analysis.functions.length,
      suggestionsCount: analysis.suggestions.length,
      lastAnalysisTime: Date.now(),
    };

    this.sendMessage({ type: 'analysis', data: analysis });
    this.sendMessage({ type: 'stateUpdate', state: this.state });
  }

  /**
   * Generate tests for code
   */
  private async generateTests(code: string, fileName: string): Promise<void> {
    const suggestions = await this.analysisService.suggestTests(code, fileName);

    const suggestionData: SuggestionData[] = suggestions.map((s) => ({
      title: s.title,
      description: s.description,
      code: s.code,
      confidence: s.confidence,
    }));

    this.sendMessage({ type: 'suggestions', data: suggestionData });
  }

  /**
   * Send stats to the webview
   */
  private async sendStats(): Promise<void> {
    const stats = await this.edgeAgentService.getStats();

    const statsData: StatsData = {
      patternCount: stats.count,
      vectorDimension: stats.dimension,
      qps: stats.qps ?? 0,
      p50Latency: stats.p50Latency ?? 0,
      p99Latency: stats.p99Latency ?? 0,
      implementation: stats.implementation,
    };

    this.sendMessage({ type: 'stats', data: statsData });
  }

  /**
   * Clear pattern cache
   */
  private async clearPatterns(): Promise<void> {
    await this.edgeAgentService.clearPatterns();
    await this.sendStats();
  }

  /**
   * Search patterns
   */
  private async searchPatterns(query: string): Promise<void> {
    const patterns = await this.edgeAgentService.searchPatternsByContent(query);

    const patternData: PatternData[] = patterns.map((p) => ({
      id: p.pattern.id,
      type: p.pattern.type,
      domain: p.pattern.domain,
      content: p.pattern.content,
      score: p.score,
    }));

    this.sendMessage({ type: 'patterns', data: patternData });
  }

  /**
   * Open a file in the editor
   */
  private async openFile(uri: string, line?: number): Promise<void> {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
    const editor = await vscode.window.showTextDocument(document);

    if (line !== undefined) {
      const position = new vscode.Position(line, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position));
    }
  }

  /**
   * Refresh the panel
   */
  private async refresh(): Promise<void> {
    // Send stats
    await this.sendStats();

    // Analyze current file if available
    const editor = vscode.window.activeTextEditor;
    if (editor && this.isSupported(editor.document)) {
      await this.analyzeCurrentFile(editor.document);
    }
  }

  /**
   * Send message to webview
   */
  private sendMessage(message: ExtensionMessage): void {
    this.webviewView?.webview.postMessage(message);
  }

  /**
   * Calculate coverage percentage from analysis
   */
  private calculateCoverage(analysis: FileAnalysis): number {
    if (analysis.functions.length === 0) {
      return 0;
    }

    const totalCoverage = analysis.functions.reduce(
      (sum, f) => sum + (f.coverage ?? 0),
      0
    );

    return Math.round(totalCoverage / analysis.functions.length);
  }

  /**
   * Check if a document is supported
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
   * Get HTML content for the webview
   */
  private getHtmlContent(webview: vscode.Webview): string {
    // Get URIs for resources
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview', 'style.css')
    );

    // Use a nonce for security
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Agentic QE Dashboard</title>
  <style>
    :root {
      --vscode-font-family: var(--vscode-editor-font-family, monospace);
      --card-bg: var(--vscode-editor-background);
      --card-border: var(--vscode-panel-border);
      --primary: var(--vscode-button-background);
      --success: #4CAF50;
      --warning: #FFC107;
      --error: #F44336;
    }

    body {
      font-family: var(--vscode-font-family);
      padding: 12px;
      margin: 0;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--card-border);
    }

    .header h1 {
      font-size: 14px;
      font-weight: 600;
      margin: 0;
    }

    .refresh-btn {
      background: transparent;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
    }

    .refresh-btn:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 12px;
    }

    .card-title {
      font-size: 12px;
      font-weight: 600;
      margin: 0 0 8px 0;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .stat-item {
      text-align: center;
      padding: 8px;
      background: var(--vscode-input-background);
      border-radius: 4px;
    }

    .stat-value {
      font-size: 20px;
      font-weight: 700;
      color: var(--primary);
    }

    .stat-label {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }

    .coverage-bar {
      height: 8px;
      background: var(--vscode-input-background);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 8px;
    }

    .coverage-fill {
      height: 100%;
      transition: width 0.3s ease;
    }

    .coverage-fill.high { background: var(--success); }
    .coverage-fill.medium { background: var(--warning); }
    .coverage-fill.low { background: var(--error); }

    .function-list {
      max-height: 200px;
      overflow-y: auto;
    }

    .function-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid var(--card-border);
    }

    .function-item:last-child {
      border-bottom: none;
    }

    .function-name {
      font-size: 12px;
      font-family: var(--vscode-editor-font-family);
    }

    .function-coverage {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 3px;
    }

    .function-coverage.high { background: rgba(76, 175, 80, 0.2); color: var(--success); }
    .function-coverage.medium { background: rgba(255, 193, 7, 0.2); color: var(--warning); }
    .function-coverage.low { background: rgba(244, 67, 54, 0.2); color: var(--error); }

    .suggestion-item {
      padding: 8px;
      background: var(--vscode-input-background);
      border-radius: 4px;
      margin-bottom: 8px;
      cursor: pointer;
    }

    .suggestion-item:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .suggestion-title {
      font-size: 12px;
      font-weight: 500;
    }

    .suggestion-desc {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }

    .loading {
      text-align: center;
      padding: 20px;
      color: var(--vscode-descriptionForeground);
    }

    .spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--card-border);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 8px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .empty-state {
      text-align: center;
      padding: 20px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }

    .btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      width: 100%;
      margin-top: 8px;
    }

    .btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Agentic QE</h1>
    <button class="refresh-btn" id="refreshBtn" title="Refresh">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.451 5.609l-.579-.939-1.068.812-.076.094c-.335.415-.927 1.341-.927 2.424 0 2.206-1.794 4-4 4a3.99 3.99 0 01-2.957-1.302l1.109-1.109-3.1-.5.5 3.1 1.062-1.062A5.48 5.48 0 006.8 12.5c2.757 0 5-2.243 5-5 0-.994-.288-1.951-.849-2.891z"/>
        <path d="M2.549 10.391l.579.939 1.068-.812.076-.094c.335-.415.927-1.341.927-2.424 0-2.206 1.794-4 4-4a3.99 3.99 0 012.957 1.302l-1.109 1.109 3.1.5-.5-3.1-1.062 1.062A5.48 5.48 0 009.2 3.5c-2.757 0-5 2.243-5 5 0 .994.288 1.951.849 2.891z"/>
      </svg>
    </button>
  </div>

  <div id="loading" class="loading" style="display: none;">
    <div class="spinner"></div>
    <div>Analyzing...</div>
  </div>

  <div id="content">
    <div class="card">
      <h3 class="card-title">Coverage</h3>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value" id="coverageValue">0%</div>
          <div class="stat-label">Coverage</div>
        </div>
        <div class="stat-item">
          <div class="stat-value" id="functionCount">0</div>
          <div class="stat-label">Functions</div>
        </div>
      </div>
      <div class="coverage-bar">
        <div class="coverage-fill low" id="coverageFill" style="width: 0%"></div>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">Functions</h3>
      <div class="function-list" id="functionList">
        <div class="empty-state">Open a TypeScript/JavaScript file</div>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">Test Suggestions</h3>
      <div id="suggestions">
        <div class="empty-state">No suggestions yet</div>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">Pattern Store</h3>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value" id="patternCount">0</div>
          <div class="stat-label">Patterns</div>
        </div>
        <div class="stat-item">
          <div class="stat-value" id="qpsValue">0</div>
          <div class="stat-label">QPS</div>
        </div>
      </div>
      <button class="btn btn-secondary" id="clearPatternsBtn">Clear Cache</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // DOM elements
    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('content');
    const coverageValueEl = document.getElementById('coverageValue');
    const functionCountEl = document.getElementById('functionCount');
    const coverageFillEl = document.getElementById('coverageFill');
    const functionListEl = document.getElementById('functionList');
    const suggestionsEl = document.getElementById('suggestions');
    const patternCountEl = document.getElementById('patternCount');
    const qpsValueEl = document.getElementById('qpsValue');
    const refreshBtn = document.getElementById('refreshBtn');
    const clearPatternsBtn = document.getElementById('clearPatternsBtn');

    // Event listeners
    refreshBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'refresh' });
    });

    clearPatternsBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'clearPatterns' });
    });

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
        case 'loading':
          loadingEl.style.display = message.loading ? 'block' : 'none';
          contentEl.style.opacity = message.loading ? '0.5' : '1';
          break;

        case 'analysis':
          renderAnalysis(message.data);
          break;

        case 'stats':
          renderStats(message.data);
          break;

        case 'suggestions':
          renderSuggestions(message.data);
          break;

        case 'stateUpdate':
          // State is handled by individual updates
          break;

        case 'error':
          console.error('Error:', message.message);
          break;
      }
    });

    function renderAnalysis(analysis) {
      // Update coverage
      const coverage = calculateCoverage(analysis.functions);
      coverageValueEl.textContent = coverage + '%';
      coverageFillEl.style.width = coverage + '%';
      coverageFillEl.className = 'coverage-fill ' + getCoverageClass(coverage);

      // Update function count
      functionCountEl.textContent = analysis.functions.length;

      // Render function list
      if (analysis.functions.length === 0) {
        functionListEl.innerHTML = '<div class="empty-state">No functions found</div>';
      } else {
        functionListEl.innerHTML = analysis.functions.map(f => {
          const cov = f.coverage ?? 0;
          return \`
            <div class="function-item">
              <span class="function-name">\${f.name}</span>
              <span class="function-coverage \${getCoverageClass(cov)}">\${cov}%</span>
            </div>
          \`;
        }).join('');
      }

      // Render suggestions
      if (analysis.suggestions.length === 0) {
        suggestionsEl.innerHTML = '<div class="empty-state">No suggestions</div>';
      } else {
        suggestionsEl.innerHTML = analysis.suggestions.slice(0, 5).map(s => \`
          <div class="suggestion-item" onclick="applySuggestion('\${escape(s.code)}')">
            <div class="suggestion-title">\${s.title}</div>
            <div class="suggestion-desc">\${s.description}</div>
          </div>
        \`).join('');
      }
    }

    function renderStats(stats) {
      patternCountEl.textContent = stats.patternCount;
      qpsValueEl.textContent = Math.round(stats.qps);
    }

    function renderSuggestions(suggestions) {
      if (suggestions.length === 0) {
        suggestionsEl.innerHTML = '<div class="empty-state">No suggestions</div>';
      } else {
        suggestionsEl.innerHTML = suggestions.map(s => \`
          <div class="suggestion-item">
            <div class="suggestion-title">\${s.title}</div>
            <div class="suggestion-desc">\${s.description}</div>
          </div>
        \`).join('');
      }
    }

    function calculateCoverage(functions) {
      if (functions.length === 0) return 0;
      const total = functions.reduce((sum, f) => sum + (f.coverage || 0), 0);
      return Math.round(total / functions.length);
    }

    function getCoverageClass(coverage) {
      if (coverage >= 80) return 'high';
      if (coverage >= 50) return 'medium';
      return 'low';
    }

    function escape(str) {
      return str.replace(/'/g, "\\\\'").replace(/"/g, '\\\\"');
    }

    function applySuggestion(code) {
      vscode.postMessage({ type: 'generateTests', code: decodeURIComponent(code), fileName: '' });
    }

    // Initial refresh
    vscode.postMessage({ type: 'refresh' });
  </script>
</body>
</html>`;
  }

  /**
   * Generate a nonce for CSP
   */
  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
