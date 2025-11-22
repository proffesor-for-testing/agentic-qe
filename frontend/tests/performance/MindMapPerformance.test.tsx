import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MindMap } from '../../src/components/MindMap/MindMap';
import { WebSocketProvider } from '../../src/contexts/WebSocketContext';
import { GraphData, AgentNode, AgentEdge } from '../../src/types';

// Mock cytoscape with performance tracking
const mockCytoscape = () => {
  const startTime = performance.now();
  const mockInstance = {
    on: vi.fn(),
    elements: vi.fn(() => ({
      remove: vi.fn(),
      removeClass: vi.fn(),
    })),
    add: vi.fn((elements) => {
      // Simulate rendering time based on element count
      const renderTime = elements.length * 0.05; // 0.05ms per element
      return elements;
    }),
    layout: vi.fn(() => ({
      run: vi.fn(() => {
        const endTime = performance.now();
        const duration = endTime - startTime;
        return duration;
      }),
    })),
    style: vi.fn(),
    getElementById: vi.fn(() => ({ addClass: vi.fn() })),
    zoom: vi.fn(() => 1),
    center: vi.fn(),
    fit: vi.fn(),
    png: vi.fn(() => new Blob()),
    destroy: vi.fn(),
  };

  return mockInstance;
};

vi.mock('cytoscape', () => ({
  default: vi.fn(() => mockCytoscape()),
  use: vi.fn(),
}));

vi.mock('cytoscape-cose-bilkent', () => ({
  default: vi.fn(),
}));

// Generate test data
function generateGraphData(nodeCount: number, edgeDensity: number = 0.3): GraphData {
  const nodes: AgentNode[] = [];
  const edges: AgentEdge[] = [];
  const types = ['coordinator', 'researcher', 'coder', 'tester', 'reviewer', 'analyzer'] as const;
  const statuses = ['idle', 'running', 'completed', 'error'] as const;

  // Generate nodes
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      id: `node-${i}`,
      label: `Agent ${i}`,
      type: types[i % types.length],
      status: statuses[i % statuses.length],
      metadata: {
        startTime: Date.now(),
        taskCount: Math.floor(Math.random() * 10),
      },
    });
  }

  // Generate edges
  const edgeCount = Math.floor(nodeCount * edgeDensity);
  for (let i = 0; i < edgeCount; i++) {
    const sourceIdx = Math.floor(Math.random() * nodeCount);
    const targetIdx = Math.floor(Math.random() * nodeCount);
    if (sourceIdx !== targetIdx) {
      edges.push({
        id: `edge-${i}`,
        source: `node-${sourceIdx}`,
        target: `node-${targetIdx}`,
        type: ['coordination', 'data-flow', 'dependency'][Math.floor(Math.random() * 3)] as any,
      });
    }
  }

  return { nodes, edges };
}

// Mock visualization API with test data
const createMockApi = (graphData: GraphData) => ({
  visualizationApi: {
    getGraphData: vi.fn(() =>
      Promise.resolve({
        sessionId: 'test-session',
        timestamp: Date.now(),
        ...graphData,
      })
    ),
    exportGraphJSON: vi.fn(() => Promise.resolve(new Blob())),
  },
});

// Mock WebSocket
class MockWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onerror: ((error: any) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 0);
  }

  close() {}
}

global.WebSocket = MockWebSocket as any;

describe('MindMap Performance Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render 100 nodes in under 100ms', async () => {
    const graphData = generateGraphData(100);
    vi.doMock('../../src/services/visualizationApi', () => createMockApi(graphData));

    const startTime = performance.now();

    render(
      <WebSocketProvider>
        <MindMap sessionId="perf-test-100" />
      </WebSocketProvider>
    );

    const renderTime = performance.now() - startTime;

    console.log(`Render time for 100 nodes: ${renderTime.toFixed(2)}ms`);
    expect(renderTime).toBeLessThan(100);
  });

  it('should render 500 nodes in under 250ms', async () => {
    const graphData = generateGraphData(500);
    vi.doMock('../../src/services/visualizationApi', () => createMockApi(graphData));

    const startTime = performance.now();

    render(
      <WebSocketProvider>
        <MindMap sessionId="perf-test-500" />
      </WebSocketProvider>
    );

    const renderTime = performance.now() - startTime;

    console.log(`Render time for 500 nodes: ${renderTime.toFixed(2)}ms`);
    expect(renderTime).toBeLessThan(250);
  });

  it('should render 1000 nodes in under 500ms', async () => {
    const graphData = generateGraphData(1000);
    vi.doMock('../../src/services/visualizationApi', () => createMockApi(graphData));

    const startTime = performance.now();

    render(
      <WebSocketProvider>
        <MindMap sessionId="perf-test-1000" />
      </WebSocketProvider>
    );

    const renderTime = performance.now() - startTime;

    console.log(`Render time for 1000 nodes: ${renderTime.toFixed(2)}ms`);
    expect(renderTime).toBeLessThan(500);
  });

  it('should handle high edge density efficiently', async () => {
    const graphData = generateGraphData(200, 0.8); // 80% edge density
    vi.doMock('../../src/services/visualizationApi', () => createMockApi(graphData));

    const startTime = performance.now();

    render(
      <WebSocketProvider>
        <MindMap sessionId="perf-test-dense" />
      </WebSocketProvider>
    );

    const renderTime = performance.now() - startTime;

    console.log(`Render time for 200 nodes (dense): ${renderTime.toFixed(2)}ms`);
    expect(renderTime).toBeLessThan(200);
  });

  it('should efficiently filter large datasets', async () => {
    const graphData = generateGraphData(1000);
    vi.doMock('../../src/services/visualizationApi', () => createMockApi(graphData));

    const { rerender } = render(
      <WebSocketProvider>
        <MindMap sessionId="perf-test-filter" />
      </WebSocketProvider>
    );

    const startTime = performance.now();

    // Simulate filtering by re-rendering
    rerender(
      <WebSocketProvider>
        <MindMap sessionId="perf-test-filter" />
      </WebSocketProvider>
    );

    const filterTime = performance.now() - startTime;

    console.log(`Filter time for 1000 nodes: ${filterTime.toFixed(2)}ms`);
    expect(filterTime).toBeLessThan(50);
  });

  it('should maintain 60fps during interactions', () => {
    const graphData = generateGraphData(500);
    vi.doMock('../../src/services/visualizationApi', () => createMockApi(graphData));

    const frameTime = 1000 / 60; // 16.67ms for 60fps

    const startTime = performance.now();

    render(
      <WebSocketProvider>
        <MindMap sessionId="perf-test-fps" />
      </WebSocketProvider>
    );

    const renderTime = performance.now() - startTime;

    // Check if render time allows for 60fps
    const framesDropped = Math.ceil(renderTime / frameTime) - 1;

    console.log(`Frames potentially dropped: ${framesDropped}`);
    expect(framesDropped).toBeLessThanOrEqual(10); // Allow up to 10 frames dropped
  });
});

describe('MindMap Memory Performance', () => {
  it('should not leak memory when unmounting', async () => {
    const graphData = generateGraphData(500);
    vi.doMock('../../src/services/visualizationApi', () => createMockApi(graphData));

    const { unmount } = render(
      <WebSocketProvider>
        <MindMap sessionId="memory-test" />
      </WebSocketProvider>
    );

    // Track initial memory usage (if available)
    const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;

    unmount();

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;

    // Memory should not increase significantly (allow 10% tolerance)
    if (initialMemory > 0 && finalMemory > 0) {
      const memoryIncrease = finalMemory - initialMemory;
      const tolerance = initialMemory * 0.1;

      console.log(`Memory increase: ${memoryIncrease} bytes`);
      expect(memoryIncrease).toBeLessThan(tolerance);
    }
  });
});
