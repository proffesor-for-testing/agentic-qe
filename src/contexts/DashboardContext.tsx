import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { WebSocketClient } from '../services/websocket/WebSocketClient';

export interface DashboardFilters {
  sessionId: string | null;
  timeRange: {
    start: Date | null;
    end: Date | null;
  };
  agents: string[];
  searchTerm: string;
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

interface DashboardContextValue {
  // Filters
  filters: DashboardFilters;
  updateFilters: (filters: Partial<DashboardFilters>) => void;
  resetFilters: () => void;

  // WebSocket
  wsClient: WebSocketClient | null;
  wsConnected: boolean;
  wsError: string | null;

  // Notifications
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;

  // Active view
  activeView: 'overview' | 'mindmap' | 'metrics' | 'timeline';
  setActiveView: (view: 'overview' | 'mindmap' | 'metrics' | 'timeline') => void;

  // Export
  exportData: () => void;
  refreshData: () => void;
}

const DashboardContext = createContext<DashboardContextValue | undefined>(undefined);

const DEFAULT_FILTERS: DashboardFilters = {
  sessionId: null,
  timeRange: {
    start: null,
    end: null,
  },
  agents: [],
  searchTerm: '',
};

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [wsClient, setWsClient] = useState<WebSocketClient | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeView, setActiveView] = useState<'overview' | 'mindmap' | 'metrics' | 'timeline'>('overview');

  // Initialize WebSocket connection
  useEffect(() => {
    const client = new WebSocketClient({
      url: process.env.REACT_APP_WS_URL || 'ws://localhost:8081',
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
    });

    client.on('connect', () => {
      setWsConnected(true);
      setWsError(null);
      addNotification({
        type: 'success',
        title: 'Connected',
        message: 'WebSocket connection established',
      });
    });

    client.on('disconnect', () => {
      setWsConnected(false);
      addNotification({
        type: 'warning',
        title: 'Disconnected',
        message: 'WebSocket connection lost',
      });
    });

    client.on('error', (error) => {
      setWsError(error.message);
      addNotification({
        type: 'error',
        title: 'Connection Error',
        message: error.message,
      });
    });

    client.on('event', (event) => {
      // Notify on important events
      if (event.metadata?.severity === 'high' || event.metadata?.quality_gate_failed) {
        addNotification({
          type: event.metadata.quality_gate_failed ? 'error' : 'warning',
          title: `Event: ${event.type}`,
          message: event.metadata.quality_gate_failed
            ? `Quality gate violation: ${event.metadata.quality_gate_name}`
            : event.description || 'New event received',
        });
      }
    });

    client.connect();
    setWsClient(client);

    return () => {
      client.disconnect();
    };
  }, []);

  const updateFilters = useCallback((newFilters: Partial<DashboardFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      read: false,
    };
    setNotifications((prev) => [newNotification, ...prev].slice(0, 50)); // Keep last 50
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((notif) => (notif.id === id ? { ...notif, read: true } : notif))
    );
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const exportData = useCallback(() => {
    // Export all data to JSON
    const data = {
      filters,
      notifications,
      timestamp: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-export-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addNotification({
      type: 'success',
      title: 'Export Complete',
      message: 'Dashboard data exported successfully',
    });
  }, [filters, notifications, addNotification]);

  const refreshData = useCallback(() => {
    // Trigger refresh event
    if (wsClient && wsConnected) {
      wsClient.send({ type: 'refresh', timestamp: new Date().toISOString() });
    }

    addNotification({
      type: 'info',
      title: 'Refreshing',
      message: 'Data refresh requested',
    });
  }, [wsClient, wsConnected, addNotification]);

  const value: DashboardContextValue = {
    filters,
    updateFilters,
    resetFilters,
    wsClient,
    wsConnected,
    wsError,
    notifications,
    addNotification,
    markNotificationRead,
    clearNotifications,
    activeView,
    setActiveView,
    exportData,
    refreshData,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
};

export const useDashboard = (): DashboardContextValue => {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
};
