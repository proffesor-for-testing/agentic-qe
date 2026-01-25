/**
 * useConnection Hook
 *
 * React hook for tracking WebRTC connection state and network status.
 * Provides connection quality metrics and reconnection handling.
 *
 * @module edge/webapp/hooks/useConnection
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ConnectionStatus, SystemMetrics, WebAppEvent } from '../types';
import { getP2PService, P2PServiceImpl } from '../services/P2PService';

// ============================================
// Types
// ============================================

/**
 * Connection quality level based on metrics
 */
export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected';

/**
 * Extended connection info with computed properties
 */
export interface ConnectionInfo {
  /** Current connection status */
  status: ConnectionStatus;

  /** Overall connection quality */
  quality: ConnectionQuality;

  /** Whether currently connected */
  isConnected: boolean;

  /** Whether currently connecting */
  isConnecting: boolean;

  /** Whether there's a connection error */
  hasError: boolean;

  /** Network latency in milliseconds */
  latencyMs: number;

  /** Messages processed per second */
  messagesPerSecond: number;

  /** Memory usage in MB */
  memoryUsageMB: number;

  /** Connection uptime in milliseconds */
  uptimeMs: number;

  /** Human-readable uptime string */
  uptimeFormatted: string;

  /** Timestamp of last state change */
  lastStateChange: number;
}

/**
 * Connection event for callbacks
 */
export interface ConnectionEvent {
  type: 'connected' | 'disconnected' | 'reconnecting' | 'error' | 'quality_change';
  previousStatus?: ConnectionStatus;
  newStatus?: ConnectionStatus;
  previousQuality?: ConnectionQuality;
  newQuality?: ConnectionQuality;
  error?: string;
  timestamp: number;
}

/**
 * Options for the useConnection hook
 */
export interface UseConnectionOptions {
  /** Callback when connection events occur */
  onConnectionEvent?: (event: ConnectionEvent) => void;

  /** Callback when connection status changes */
  onStatusChange?: (status: ConnectionStatus) => void;

  /** Callback when connection quality changes */
  onQualityChange?: (quality: ConnectionQuality) => void;

  /** Interval to update metrics (ms, default: 5000) */
  metricsInterval?: number;
}

/**
 * Return value from useConnection hook
 */
export interface UseConnectionReturn {
  /** Current connection info */
  connection: ConnectionInfo;

  /** Current connection status */
  status: ConnectionStatus;

  /** Current connection quality */
  quality: ConnectionQuality;

  /** Whether connected to the P2P network */
  isConnected: boolean;

  /** Whether currently reconnecting */
  isReconnecting: boolean;

  /** System metrics */
  metrics: SystemMetrics;

  /** Last error message */
  lastError: string | null;

  /** Time since last activity (ms) */
  timeSinceActivity: number;

  /** Force refresh connection state */
  refresh: () => void;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate connection quality from metrics
 */
function calculateQuality(
  status: ConnectionStatus,
  latencyMs: number,
  _messagesPerSecond: number
): ConnectionQuality {
  if (status !== 'connected') {
    return 'disconnected';
  }

  // Quality based on latency thresholds
  if (latencyMs < 50) {
    return 'excellent';
  } else if (latencyMs < 100) {
    return 'good';
  } else if (latencyMs < 300) {
    return 'fair';
  } else {
    return 'poor';
  }
}

/**
 * Format uptime to human-readable string
 */
function formatUptime(uptimeMs: number): string {
  if (uptimeMs < 1000) {
    return 'Just started';
  }

  const seconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Create default connection info
 */
function createDefaultConnectionInfo(): ConnectionInfo {
  return {
    status: 'disconnected',
    quality: 'disconnected',
    isConnected: false,
    isConnecting: false,
    hasError: false,
    latencyMs: 0,
    messagesPerSecond: 0,
    memoryUsageMB: 0,
    uptimeMs: 0,
    uptimeFormatted: 'Not connected',
    lastStateChange: Date.now(),
  };
}

/**
 * Create default metrics
 */
function createDefaultMetrics(): SystemMetrics {
  return {
    memoryUsage: 0,
    cpuUsage: 0,
    networkLatency: 0,
    messagesPerSecond: 0,
    uptime: 0,
  };
}

// ============================================
// useConnection Hook
// ============================================

/**
 * Hook for tracking WebRTC connection state and quality.
 *
 * @param options - Configuration options
 * @returns Connection state, quality, and metrics
 *
 * @example
 * ```tsx
 * function ConnectionStatus() {
 *   const {
 *     connection,
 *     isConnected,
 *     quality,
 *     metrics,
 *   } = useConnection({
 *     onStatusChange: (status) => console.log('Status:', status),
 *     onQualityChange: (quality) => console.log('Quality:', quality),
 *   });
 *
 *   return (
 *     <div>
 *       <div className={`status-${quality}`}>
 *         {isConnected ? 'Connected' : 'Disconnected'}
 *       </div>
 *       <p>Quality: {quality}</p>
 *       <p>Latency: {connection.latencyMs}ms</p>
 *       <p>Uptime: {connection.uptimeFormatted}</p>
 *       <p>Memory: {metrics.memoryUsage}MB</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useConnection(options: UseConnectionOptions = {}): UseConnectionReturn {
  const {
    onConnectionEvent,
    onStatusChange,
    onQualityChange,
    metricsInterval = 5000,
  } = options;

  // State
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [metrics, setMetrics] = useState<SystemMetrics>(createDefaultMetrics);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastStateChange, setLastStateChange] = useState(Date.now());
  const [timeSinceActivity, setTimeSinceActivity] = useState(0);

  // Refs
  const serviceRef = useRef<P2PServiceImpl | null>(null);
  const unsubscribeStateRef = useRef<(() => void) | null>(null);
  const unsubscribeEventRef = useRef<(() => void) | null>(null);
  const previousStatusRef = useRef<ConnectionStatus>('disconnected');
  const previousQualityRef = useRef<ConnectionQuality>('disconnected');
  const onConnectionEventRef = useRef(onConnectionEvent);
  const onStatusChangeRef = useRef(onStatusChange);
  const onQualityChangeRef = useRef(onQualityChange);
  const mountedRef = useRef(true);

  // Keep callback refs updated
  useEffect(() => {
    onConnectionEventRef.current = onConnectionEvent;
    onStatusChangeRef.current = onStatusChange;
    onQualityChangeRef.current = onQualityChange;
  }, [onConnectionEvent, onStatusChange, onQualityChange]);

  // Calculate quality from current metrics
  const quality = useMemo(
    () => calculateQuality(status, metrics.networkLatency, metrics.messagesPerSecond),
    [status, metrics.networkLatency, metrics.messagesPerSecond]
  );

  // Build connection info
  const connection = useMemo((): ConnectionInfo => {
    return {
      status,
      quality,
      isConnected: status === 'connected',
      isConnecting: status === 'connecting',
      hasError: status === 'error',
      latencyMs: metrics.networkLatency,
      messagesPerSecond: metrics.messagesPerSecond,
      memoryUsageMB: metrics.memoryUsage,
      uptimeMs: metrics.uptime,
      uptimeFormatted: formatUptime(metrics.uptime),
      lastStateChange,
    };
  }, [status, quality, metrics, lastStateChange]);

  // Emit connection event
  const emitEvent = useCallback((event: ConnectionEvent) => {
    onConnectionEventRef.current?.(event);
  }, []);

  // Handle status changes
  useEffect(() => {
    if (status !== previousStatusRef.current) {
      const event: ConnectionEvent = {
        type: status === 'connected' ? 'connected' :
              status === 'connecting' ? 'reconnecting' :
              status === 'error' ? 'error' : 'disconnected',
        previousStatus: previousStatusRef.current,
        newStatus: status,
        timestamp: Date.now(),
      };

      emitEvent(event);
      onStatusChangeRef.current?.(status);
      setLastStateChange(Date.now());
      previousStatusRef.current = status;
    }
  }, [status, emitEvent]);

  // Handle quality changes
  useEffect(() => {
    if (quality !== previousQualityRef.current) {
      const event: ConnectionEvent = {
        type: 'quality_change',
        previousQuality: previousQualityRef.current,
        newQuality: quality,
        timestamp: Date.now(),
      };

      emitEvent(event);
      onQualityChangeRef.current?.(quality);
      previousQualityRef.current = quality;
    }
  }, [quality, emitEvent]);

  // Subscribe to service
  useEffect(() => {
    mountedRef.current = true;
    serviceRef.current = getP2PService();

    // Subscribe to state changes
    unsubscribeStateRef.current = serviceRef.current.subscribe((state) => {
      if (mountedRef.current) {
        setStatus(state.connectionStatus);
        setMetrics(state.metrics);
      }
    });

    // Subscribe to events
    unsubscribeEventRef.current = serviceRef.current.onEvent((event: WebAppEvent) => {
      if (!mountedRef.current) return;

      if (event.type === 'error') {
        setLastError(event.message);
        emitEvent({
          type: 'error',
          error: event.message,
          timestamp: Date.now(),
        });
      }
    });

    // Get initial state
    const initialState = serviceRef.current.getState();
    setStatus(initialState.connectionStatus);
    setMetrics(initialState.metrics);

    return () => {
      mountedRef.current = false;
      if (unsubscribeStateRef.current) {
        unsubscribeStateRef.current();
      }
      if (unsubscribeEventRef.current) {
        unsubscribeEventRef.current();
      }
    };
  }, [emitEvent]);

  // Update time since activity
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (mountedRef.current) {
        setTimeSinceActivity(Date.now() - lastStateChange);
      }
    }, metricsInterval);

    return () => clearInterval(intervalId);
  }, [metricsInterval, lastStateChange]);

  // Refresh connection state
  const refresh = useCallback((): void => {
    if (serviceRef.current) {
      const state = serviceRef.current.getState();
      setStatus(state.connectionStatus);
      setMetrics(state.metrics);
    }
  }, []);

  // Derived state
  const isConnected = status === 'connected';
  const isReconnecting = status === 'connecting';

  return {
    connection,
    status,
    quality,
    isConnected,
    isReconnecting,
    metrics,
    lastError,
    timeSinceActivity,
    refresh,
  };
}

export default useConnection;
