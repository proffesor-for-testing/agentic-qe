/**
 * Webview Main Script for Agentic QE Dashboard
 *
 * Handles communication between the webview and the VS Code extension.
 * Uses the VS Code API for message passing.
 *
 * @module vscode-extension/webview/main
 * @version 0.1.0
 */

// Declare VS Code API type
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

// Types for messages
interface WebviewMessage {
  type: string;
  data?: unknown;
  message?: string;
  loading?: boolean;
  state?: PanelState;
}

interface FileAnalysis {
  filePath: string;
  language: string;
  functions: FunctionInfo[];
  suggestions: TestSuggestion[];
  duration: number;
  estimatedCoverage?: number;
}

interface FunctionInfo {
  name: string;
  type: string;
  startLine: number;
  endLine: number;
  code: string;
  hasTests: boolean;
  coverage?: number;
  parameters: string[];
  isAsync: boolean;
  isExported: boolean;
}

interface TestSuggestion {
  title: string;
  description: string;
  code: string;
  targetFunction?: string;
  confidence: number;
}

interface StatsData {
  patternCount: number;
  vectorDimension: number;
  qps: number;
  p50Latency: number;
  p99Latency: number;
  implementation: string;
}

interface PanelState {
  currentFile?: string;
  coveragePercentage?: number;
  functionCount?: number;
  suggestionsCount?: number;
}

// Initialize VS Code API
const vscode = acquireVsCodeApi();

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// DOM Elements
const elements = {
  loadingOverlay: document.getElementById('loadingOverlay') as HTMLElement,
  refreshBtn: document.getElementById('refreshBtn') as HTMLButtonElement,
  currentFile: document.getElementById('currentFile') as HTMLElement,
  coverageCircle: document.getElementById('coverageCircle') as HTMLElement,
  coverageValue: document.getElementById('coverageValue') as HTMLElement,
  coverageFill: document.getElementById('coverageFill') as HTMLElement,
  functionCount: document.getElementById('functionCount') as HTMLElement,
  testedCount: document.getElementById('testedCount') as HTMLElement,
  untestedCount: document.getElementById('untestedCount') as HTMLElement,
  functionBadge: document.getElementById('functionBadge') as HTMLElement,
  functionList: document.getElementById('functionList') as HTMLElement,
  suggestionBadge: document.getElementById('suggestionBadge') as HTMLElement,
  suggestionList: document.getElementById('suggestionList') as HTMLElement,
  patternCount: document.getElementById('patternCount') as HTMLElement,
  qpsValue: document.getElementById('qpsValue') as HTMLElement,
  p50Value: document.getElementById('p50Value') as HTMLElement,
  p99Value: document.getElementById('p99Value') as HTMLElement,
  searchPatternsBtn: document.getElementById('searchPatternsBtn') as HTMLButtonElement,
  clearPatternsBtn: document.getElementById('clearPatternsBtn') as HTMLButtonElement,
  implVersion: document.getElementById('implVersion') as HTMLElement,
};

// Event Listeners
elements.refreshBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'refresh' });
});

elements.searchPatternsBtn.addEventListener('click', () => {
  const query = prompt('Enter search query:');
  if (query) {
    vscode.postMessage({ type: 'searchPatterns', query });
  }
});

elements.clearPatternsBtn.addEventListener('click', () => {
  if (confirm('Clear all stored patterns? This cannot be undone.')) {
    vscode.postMessage({ type: 'clearPatterns' });
  }
});

// Message Handler
window.addEventListener('message', (event: MessageEvent<WebviewMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'loading':
      setLoading(message.loading ?? false);
      break;

    case 'analysis':
      renderAnalysis(message.data as FileAnalysis);
      break;

    case 'stats':
      renderStats(message.data as StatsData);
      break;

    case 'suggestions':
      renderSuggestions(message.data as TestSuggestion[]);
      break;

    case 'stateUpdate':
      updateState(message.state as PanelState);
      break;

    case 'error':
      showError(message.message ?? 'An error occurred');
      break;
  }
});

// Render Functions
function setLoading(loading: boolean): void {
  elements.loadingOverlay.style.display = loading ? 'flex' : 'none';
}

function renderAnalysis(analysis: FileAnalysis): void {
  // Update current file
  const fileName = analysis.filePath.split('/').pop() ?? 'Unknown';
  elements.currentFile.innerHTML = `
    <span class="file-name" title="${escapeHtml(analysis.filePath)}">${escapeHtml(fileName)}</span>
    <span class="file-language">${escapeHtml(analysis.language)}</span>
  `;

  // Calculate coverage stats
  const tested = analysis.functions.filter((f) => f.hasTests).length;
  const untested = analysis.functions.length - tested;
  const coverage = analysis.estimatedCoverage ?? 0;

  // Update coverage display
  elements.coverageValue.textContent = `${coverage}%`;
  elements.coverageFill.style.width = `${coverage}%`;
  elements.coverageFill.className = `coverage-fill ${getCoverageClass(coverage)}`;
  elements.coverageCircle.className = `coverage-circle ${getCoverageClass(coverage)}`;

  elements.functionCount.textContent = String(analysis.functions.length);
  elements.testedCount.textContent = String(tested);
  elements.untestedCount.textContent = String(untested);

  // Update function badge
  elements.functionBadge.textContent = String(analysis.functions.length);

  // Render function list
  if (analysis.functions.length === 0) {
    elements.functionList.innerHTML = `
      <div class="empty-state">
        <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" opacity="0.5">
          <path d="M14 4.5V14a2 2 0 01-2 2H4a2 2 0 01-2-2V2a2 2 0 012-2h5.5L14 4.5zM9.5 3.5v-2L13 5h-2.5A1 1 0 019.5 3.5z"/>
        </svg>
        <p>No functions found</p>
      </div>
    `;
  } else {
    // Clear and rebuild using DOM methods for security
    elements.functionList.textContent = '';

    analysis.functions.forEach((func, index) => {
      const item = document.createElement('div');
      item.className = 'function-item';

      const coverage = func.coverage ?? 0;
      const coverageClass = getCoverageClass(coverage);
      const iconSvg = func.hasTests
        ? '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" class="icon-success"><path d="M12.736 3.97a.733.733 0 011.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 01-1.065.02L3.217 8.384a.757.757 0 010-1.06.733.733 0 011.047 0l3.052 3.093 5.4-6.425a.247.247 0 01.02-.022z"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" class="icon-warning"><path d="M8.982 1.566a1.13 1.13 0 00-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 01-1.1 0L7.1 5.995A.905.905 0 018 5zm.002 6a1 1 0 110 2 1 1 0 010-2z"/></svg>';

      // Build structure with textContent for user data (safe)
      const iconDiv = document.createElement('div');
      iconDiv.className = 'function-icon';
      iconDiv.innerHTML = iconSvg; // Safe: static SVG, no user data

      const infoDiv = document.createElement('div');
      infoDiv.className = 'function-info';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'function-name';
      nameSpan.textContent = func.name; // Safe: textContent escapes automatically

      const typeSpan = document.createElement('span');
      typeSpan.className = 'function-type';
      typeSpan.textContent = (func.isAsync ? 'async ' : '') + func.type; // Safe: textContent

      infoDiv.appendChild(nameSpan);
      infoDiv.appendChild(typeSpan);

      const coverageDiv = document.createElement('div');
      coverageDiv.className = `function-coverage ${coverageClass}`;
      coverageDiv.textContent = `${coverage}%`;

      item.appendChild(iconDiv);
      item.appendChild(infoDiv);
      item.appendChild(coverageDiv);

      // Add click handler directly
      item.addEventListener('click', () => {
        vscode.postMessage({
          type: 'openFile',
          uri: `file://${analysis.filePath}`,
          line: func.startLine,
        });
      });

      elements.functionList.appendChild(item);
    });
  }

  // Update suggestion badge
  elements.suggestionBadge.textContent = String(analysis.suggestions.length);

  // Render suggestions
  renderSuggestions(analysis.suggestions);
}

function renderSuggestions(suggestions: TestSuggestion[]): void {
  if (suggestions.length === 0) {
    elements.suggestionList.innerHTML = `
      <div class="empty-state">
        <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" opacity="0.5">
          <path d="M8 15A7 7 0 108 1a7 7 0 000 14zm0 1A8 8 0 118 0a8 8 0 010 16z"/>
          <path d="M5.255 5.786a.237.237 0 00.241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 00.25.246h.811a.25.25 0 00.25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286zm1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94z"/>
        </svg>
        <p>No suggestions available</p>
      </div>
    `;
    return;
  }

  elements.suggestionList.innerHTML = suggestions
    .slice(0, 10)
    .map((s, i) => renderSuggestionItem(s, i))
    .join('');

  // Add click handlers
  document.querySelectorAll('.suggestion-item').forEach((item, index) => {
    item.addEventListener('click', () => {
      const suggestion = suggestions[index];
      vscode.postMessage({
        type: 'generateTests',
        code: suggestion.code,
        fileName: suggestion.targetFunction ?? '',
      });
    });
  });
}

function renderSuggestionItem(suggestion: TestSuggestion, index: number): string {
  const confidence = Math.round(suggestion.confidence * 100);
  const confidenceClass =
    confidence >= 80 ? 'high' : confidence >= 50 ? 'medium' : 'low';

  return `
    <div class="suggestion-item" data-index="${index}">
      <div class="suggestion-header">
        <span class="suggestion-title">${escapeHtml(suggestion.title)}</span>
        <span class="suggestion-confidence ${confidenceClass}">${confidence}%</span>
      </div>
      <div class="suggestion-description">${escapeHtml(suggestion.description)}</div>
      ${
        suggestion.targetFunction
          ? `<div class="suggestion-target">Target: ${escapeHtml(suggestion.targetFunction)}</div>`
          : ''
      }
    </div>
  `;
}

function renderStats(stats: StatsData): void {
  elements.patternCount.textContent = String(stats.patternCount);
  elements.qpsValue.textContent = String(Math.round(stats.qps));
  elements.p50Value.textContent = stats.p50Latency.toFixed(1);
  elements.p99Value.textContent = stats.p99Latency.toFixed(1);
  elements.implVersion.textContent = `v${stats.implementation}`;
}

function updateState(state: PanelState): void {
  // State updates are handled through analysis/stats
}

function showError(message: string): void {
  console.error('[Webview Error]', message);
  // Could show a toast notification here
}

function getCoverageClass(coverage: number): string {
  if (coverage >= 80) return 'high';
  if (coverage >= 50) return 'medium';
  return 'low';
}

// Initial refresh
vscode.postMessage({ type: 'refresh' });
