/**
 * Agentic QE DevTools Panel
 *
 * Main panel implementation for monitoring browser-based QE agents.
 * Communicates with BrowserAgent instances via window messaging.
 *
 * @module edge/devtools/panel
 * @version 1.0.0
 */

// Types
interface AgentInfo {
  id: string;
  name: string;
  type: string;
  status: 'idle' | 'running' | 'error';
  tasksCompleted: number;
  lastActivity: number;
}

interface MemoryStats {
  vectorCount: number;
  indexSizeBytes: number;
  memoryUsedBytes: number;
  searchLatencyMs: number;
}

interface SearchMetrics {
  totalSearches: number;
  avgLatency: number;
  p50Latency: number;
  p99Latency: number;
}

interface PatternResult {
  id: string;
  type: string;
  domain: string;
  content: string;
  score: number;
}

// State
let connected = false;
let agents: AgentInfo[] = [];
let memoryStats: MemoryStats = {
  vectorCount: 0,
  indexSizeBytes: 0,
  memoryUsedBytes: 0,
  searchLatencyMs: 0,
};
let searchMetrics: SearchMetrics = {
  totalSearches: 0,
  avgLatency: 0,
  p50Latency: 0,
  p99Latency: 0,
};

// DOM Elements
const statusBadge = document.getElementById('status-badge')!;
const statusText = document.getElementById('status-text')!;
const agentsList = document.getElementById('agents-list')!;
const vectorCount = document.getElementById('vector-count')!;
const indexSize = document.getElementById('index-size')!;
const memoryUsed = document.getElementById('memory-used')!;
const searchLatency = document.getElementById('search-latency')!;
const totalSearches = document.getElementById('total-searches')!;
const avgLatency = document.getElementById('avg-latency')!;
const p50Latency = document.getElementById('p50-latency')!;
const p99Latency = document.getElementById('p99-latency')!;
const patternSearch = document.getElementById('pattern-search') as HTMLInputElement;
const searchBtn = document.getElementById('search-btn')!;
const patternsList = document.getElementById('patterns-list')!;
const lastUpdated = document.getElementById('last-updated')!;

// Initialize panel
function initializePanel(): void {
  console.log('[DevTools Panel] Initializing...');

  // Setup tab switching
  setupTabs();

  // Setup event listeners
  setupEventListeners();

  // Connect to page
  connectToPage();

  // Start polling for updates
  startPolling();
}

// Setup tab switching
function setupTabs(): void {
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');

      tabs.forEach((t) => t.classList.remove('active'));
      contents.forEach((c) => c.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(`${targetTab}-tab`)?.classList.add('active');
    });
  });
}

// Setup event listeners
function setupEventListeners(): void {
  // Refresh agents button
  document.getElementById('refresh-agents')?.addEventListener('click', () => {
    sendMessage({ type: 'getAgents' });
  });

  // Clear memory button
  document.getElementById('clear-memory')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all vector memory?')) {
      sendMessage({ type: 'clearMemory' });
    }
  });

  // Pattern search
  searchBtn.addEventListener('click', () => {
    const query = patternSearch.value.trim();
    if (query) {
      sendMessage({ type: 'searchPatterns', query });
    }
  });

  patternSearch.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      searchBtn.click();
    }
  });
}

// Connect to page via messaging
function connectToPage(): void {
  // Listen for messages from the page
  window.addEventListener('message', handleMessage);

  // Inject content script to establish connection
  chrome.devtools.inspectedWindow.eval(
    `
    (function() {
      if (window.__agenticQEDevTools) return;
      window.__agenticQEDevTools = true;

      // Listen for requests from DevTools
      window.addEventListener('message', function(event) {
        if (event.data && event.data.source === 'agentic-qe-devtools') {
          // Handle request and send response back
          handleDevToolsRequest(event.data);
        }
      });

      function handleDevToolsRequest(request) {
        const response = { source: 'agentic-qe-page', requestId: request.id };

        switch (request.type) {
          case 'ping':
            response.data = { connected: true };
            break;
          case 'getAgents':
            response.data = window.__agenticQEAgents || [];
            break;
          case 'getMemoryStats':
            response.data = window.__agenticQEMemoryStats || {};
            break;
          case 'getMetrics':
            response.data = window.__agenticQEMetrics || {};
            break;
          case 'searchPatterns':
            // Trigger pattern search if available
            if (window.__agenticQESearch) {
              window.__agenticQESearch(request.query).then(results => {
                window.postMessage({ ...response, data: results }, '*');
              });
              return;
            }
            response.data = [];
            break;
          case 'clearMemory':
            if (window.__agenticQEClearMemory) {
              window.__agenticQEClearMemory();
            }
            response.data = { cleared: true };
            break;
        }

        window.postMessage(response, '*');
      }

      console.log('[Agentic QE] DevTools connection established');
    })();
    `,
    (result, error) => {
      if (error) {
        console.error('[DevTools Panel] Failed to inject:', error);
      } else {
        sendMessage({ type: 'ping' });
      }
    }
  );
}

// Handle messages from page
function handleMessage(event: MessageEvent): void {
  const data = event.data;
  if (!data || data.source !== 'agentic-qe-page') return;

  console.log('[DevTools Panel] Received:', data);

  switch (data.type) {
    case 'ping':
      setConnected(data.data?.connected ?? false);
      break;
    case 'getAgents':
      updateAgents(data.data || []);
      break;
    case 'getMemoryStats':
      updateMemoryStats(data.data || {});
      break;
    case 'getMetrics':
      updateMetrics(data.data || {});
      break;
    case 'searchPatterns':
      updatePatterns(data.data || []);
      break;
  }

  updateLastUpdated();
}

// Send message to page
function sendMessage(message: { type: string; [key: string]: unknown }): void {
  chrome.devtools.inspectedWindow.eval(
    `window.postMessage(${JSON.stringify({
      source: 'agentic-qe-devtools',
      id: Date.now(),
      ...message,
    })}, '*')`
  );
}

// Set connection status
function setConnected(isConnected: boolean): void {
  connected = isConnected;
  statusBadge.classList.toggle('connected', isConnected);
  statusText.textContent = isConnected ? 'Connected' : 'Disconnected';
}

// Update agents list
function updateAgents(agentData: AgentInfo[]): void {
  agents = agentData;

  if (agents.length === 0) {
    agentsList.innerHTML = '<div class="empty-state">No agents detected</div>';
    return;
  }

  agentsList.innerHTML = agents
    .map(
      (agent) => `
      <div class="agent-item">
        <div class="agent-info">
          <span class="agent-name">${escapeHtml(agent.name || agent.id)}</span>
          <span class="agent-type">${escapeHtml(agent.type)}</span>
        </div>
        <span class="agent-status ${agent.status}">${agent.status}</span>
      </div>
    `
    )
    .join('');
}

// Update memory stats
function updateMemoryStats(stats: Partial<MemoryStats>): void {
  memoryStats = { ...memoryStats, ...stats };

  vectorCount.textContent = memoryStats.vectorCount.toLocaleString();
  indexSize.textContent = formatBytes(memoryStats.indexSizeBytes);
  memoryUsed.textContent = formatBytes(memoryStats.memoryUsedBytes);
  searchLatency.textContent = `${memoryStats.searchLatencyMs.toFixed(2)} ms`;
}

// Update search metrics
function updateMetrics(metrics: Partial<SearchMetrics>): void {
  searchMetrics = { ...searchMetrics, ...metrics };

  totalSearches.textContent = searchMetrics.totalSearches.toLocaleString();
  avgLatency.textContent = `${searchMetrics.avgLatency.toFixed(2)} ms`;
  p50Latency.textContent = `${searchMetrics.p50Latency.toFixed(2)} ms`;
  p99Latency.textContent = `${searchMetrics.p99Latency.toFixed(2)} ms`;
}

// Update patterns list
function updatePatterns(patterns: PatternResult[]): void {
  if (patterns.length === 0) {
    patternsList.innerHTML = '<div class="empty-state">No patterns found</div>';
    return;
  }

  patternsList.innerHTML = patterns
    .map(
      (pattern) => `
      <div class="pattern-item">
        <div class="pattern-header">
          <span class="pattern-type">${escapeHtml(pattern.type)}</span>
          <span class="pattern-score">${(pattern.score * 100).toFixed(1)}%</span>
        </div>
        <div class="pattern-content">${escapeHtml(pattern.content)}</div>
      </div>
    `
    )
    .join('');
}

// Update last updated timestamp
function updateLastUpdated(): void {
  lastUpdated.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
}

// Start polling for updates
function startPolling(): void {
  setInterval(() => {
    if (connected) {
      sendMessage({ type: 'getAgents' });
      sendMessage({ type: 'getMemoryStats' });
      sendMessage({ type: 'getMetrics' });
    } else {
      sendMessage({ type: 'ping' });
    }
  }, 2000);
}

// Utility: Format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Utility: Escape HTML
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Export for devtools.js
(window as unknown as { initializePanel: typeof initializePanel }).initializePanel = initializePanel;

// Auto-initialize if loaded directly
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePanel);
} else {
  initializePanel();
}
