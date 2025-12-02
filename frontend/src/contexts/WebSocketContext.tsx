import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { GraphData, QualityMetrics, LifecycleEvent } from '../types';

interface WebSocketContextType {
  connected: boolean;
  graphData: GraphData;
  metrics: QualityMetrics[];
  events: LifecycleEvent[];
  selectedNode: string | null;
  setSelectedNode: (nodeId: string | null) => void;
  reconnect: () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider');
  }
  return context;
};

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [metrics, setMetrics] = useState<QualityMetrics[]>([]);
  const [events, setEvents] = useState<LifecycleEvent[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:8080`;

    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'graph-update':
          setGraphData(message.data);
          break;
        case 'metrics-update':
          setMetrics((prev) => [...prev, message.data].slice(-100)); // Keep last 100
          break;
        case 'lifecycle-event':
          setEvents((prev) => [message.data, ...prev].slice(0, 1000)); // Keep last 1000
          break;
        case 'initial-state':
          // Handle both formats: direct properties or nested in data
          const data = message.data || message;
          setGraphData(data.graphData || { nodes: [], edges: [] });
          setMetrics(data.metrics || []);
          setEvents(data.events || []);
          break;
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    socket.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
      // Attempt reconnection after 3 seconds
      setTimeout(() => connect(), 3000);
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, []);

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);

  const reconnect = useCallback(() => {
    if (ws) {
      ws.close();
    }
    connect();
  }, [ws, connect]);

  return (
    <WebSocketContext.Provider
      value={{
        connected,
        graphData,
        metrics,
        events,
        selectedNode,
        setSelectedNode,
        reconnect,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};
