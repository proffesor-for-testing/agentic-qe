import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MindMap } from '../../src/components/MindMap/MindMap';
import { WebSocketProvider } from '../../src/contexts/WebSocketContext';
import { GraphData } from '../../src/types';

// Mock cytoscape
vi.mock('cytoscape', () => {
  const mockCy = {
    on: vi.fn(),
    elements: vi.fn(() => ({
      remove: vi.fn(),
      removeClass: vi.fn(),
    })),
    add: vi.fn(),
    layout: vi.fn(() => ({ run: vi.fn() })),
    style: vi.fn(),
    getElementById: vi.fn(() => ({ addClass: vi.fn() })),
    zoom: vi.fn(() => 1),
    center: vi.fn(),
    fit: vi.fn(),
    png: vi.fn(() => new Blob()),
    destroy: vi.fn(),
  };

  return {
    default: vi.fn(() => mockCy),
    use: vi.fn(),
  };
});

// Mock cytoscape-cose-bilkent
vi.mock('cytoscape-cose-bilkent', () => ({
  default: vi.fn(),
}));

// Mock visualization API
vi.mock('../../src/services/visualizationApi', () => ({
  visualizationApi: {
    getGraphData: vi.fn(() =>
      Promise.resolve({
        sessionId: 'test-session',
        timestamp: Date.now(),
        nodes: [
          {
            id: 'agent-1',
            label: 'Coordinator',
            type: 'coordinator',
            status: 'running',
            metadata: {},
          },
          {
            id: 'agent-2',
            label: 'Researcher',
            type: 'researcher',
            status: 'idle',
            metadata: {},
          },
        ],
        edges: [
          {
            id: 'edge-1',
            source: 'agent-1',
            target: 'agent-2',
            type: 'coordination',
          },
        ],
      })
    ),
    exportGraphJSON: vi.fn(() => Promise.resolve(new Blob())),
  },
}));

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

describe('MindMap Component', () => {
  const mockGraphData: GraphData = {
    nodes: [
      {
        id: 'node-1',
        label: 'Test Agent',
        type: 'coordinator',
        status: 'running',
        metadata: {},
      },
    ],
    edges: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(
      <WebSocketProvider>
        <MindMap sessionId="test-session" />
      </WebSocketProvider>
    );

    expect(screen.getByText(/Agent Type:/)).toBeInTheDocument();
  });

  it('displays loading state initially', () => {
    render(
      <WebSocketProvider>
        <MindMap sessionId="test-session" />
      </WebSocketProvider>
    );

    expect(screen.getByText(/Loading graph data.../)).toBeInTheDocument();
  });

  it('renders layout algorithm controls', () => {
    render(
      <WebSocketProvider>
        <MindMap sessionId="test-session" />
      </WebSocketProvider>
    );

    expect(screen.getByText(/Layout:/)).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(
      <WebSocketProvider>
        <MindMap sessionId="test-session" />
      </WebSocketProvider>
    );

    const searchInput = screen.getByPlaceholderText('Search nodes...');
    expect(searchInput).toBeInTheDocument();
  });

  it('renders filter buttons', () => {
    render(
      <WebSocketProvider>
        <MindMap sessionId="test-session" />
      </WebSocketProvider>
    );

    expect(screen.getByText('coordinator')).toBeInTheDocument();
    expect(screen.getByText('researcher')).toBeInTheDocument();
    expect(screen.getByText('idle')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('renders legend', () => {
    render(
      <WebSocketProvider>
        <MindMap sessionId="test-session" />
      </WebSocketProvider>
    );

    expect(screen.getByText('Agent Types')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Edge Types')).toBeInTheDocument();
  });

  it('loads graph data from API', async () => {
    render(
      <WebSocketProvider>
        <MindMap sessionId="test-session" />
      </WebSocketProvider>
    );

    await waitFor(
      () => {
        expect(screen.queryByText(/Loading graph data.../)).not.toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });

  it('handles empty graph data', () => {
    const emptyGraphData: GraphData = { nodes: [], edges: [] };

    render(
      <WebSocketProvider>
        <MindMap sessionId="empty-session" />
      </WebSocketProvider>
    );

    expect(screen.getByText(/Agent Type:/)).toBeInTheDocument();
  });
});
