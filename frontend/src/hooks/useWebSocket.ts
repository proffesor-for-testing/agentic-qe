/**
 * useWebSocket Hook
 * Phase 3 - Real-time Event Streaming
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  ConnectionStatus,
  SubscriptionFilter,
  MessageHandler,
  EventHandler,
  ErrorHandler,
  WebSocketStats,
  WebSocketMessage,
  WebSocketMessageType,
} from '../types/websocket';
import type { EventMessage } from '../types/websocket';
import { createWebSocketService } from '../services/websocket';

export interface UseWebSocketOptions {
  autoConnect?: boolean;
  autoReconnect?: boolean;
  onEvent?: EventHandler;
  onError?: ErrorHandler;
}

export interface UseWebSocketReturn {
  // Connection
  connect: () => void;
  disconnect: () => void;
  isConnected: boolean;
  status: ConnectionStatus;

  // Subscription
  subscribe: (filter: SubscriptionFilter) => void;
  unsubscribe: (filter?: SubscriptionFilter) => void;

  // Message handling
  onMessage: (handler: MessageHandler) => () => void;
  onEvent: (handler: EventHandler) => () => void;
  onError: (handler: ErrorHandler) => () => void;

  // Statistics
  stats: WebSocketStats;

  // Connection quality
  quality: 'excellent' | 'good' | 'poor' | 'disconnected';
}

/**
 * Hook for WebSocket functionality
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const serviceRef = useRef(createWebSocketService());
  const service = serviceRef.current;
  const [status, setStatus] = useState<ConnectionStatus>(service.getStatus());
  const [stats, setStats] = useState<WebSocketStats>(service.getStats());

  const eventHandlersRef = useRef<Set<EventHandler>>(new Set());
  const statsUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-connect on mount
  useEffect(() => {
    if (options.autoConnect !== false) {
      service.connect();
    }

    return () => {
      if (options.autoConnect !== false) {
        service.disconnect();
      }
    };
  }, [options.autoConnect, service]);

  // Subscribe to connection status changes
  useEffect(() => {
    const unsubscribe = service.onConnectionChange((newStatus: ConnectionStatus) => {
      setStatus(newStatus);
    });

    return unsubscribe;
  }, [service]);

  // Subscribe to initial event handler
  useEffect(() => {
    if (options.onEvent) {
      eventHandlersRef.current.add(options.onEvent);
    }
  }, [options.onEvent]);

  // Subscribe to initial error handler
  useEffect(() => {
    if (options.onError) {
      const unsubscribe = service.onError(options.onError);
      return unsubscribe;
    }
  }, [options.onError, service]);

  // Setup message handler for events
  useEffect(() => {
    const unsubscribe = service.onMessage((message: WebSocketMessage) => {
      if (message.type === WebSocketMessageType.EVENT) {
        const eventMessage = message as EventMessage;
        eventHandlersRef.current.forEach((handler) => {
          try {
            handler(eventMessage.payload);
          } catch (error) {
            console.error('Event handler error:', error);
          }
        });
      }
    });

    return unsubscribe;
  }, [service]);

  // Update stats periodically
  useEffect(() => {
    const updateStats = () => {
      setStats(service.getStats());
    };

    updateStats();
    statsUpdateIntervalRef.current = setInterval(updateStats, 5000);

    return () => {
      if (statsUpdateIntervalRef.current) {
        clearInterval(statsUpdateIntervalRef.current);
      }
    };
  }, [service]);

  // Connect method
  const connect = useCallback(() => {
    service.connect();
  }, [service]);

  // Disconnect method
  const disconnect = useCallback(() => {
    service.disconnect();
  }, [service]);

  // Subscribe method
  const subscribe = useCallback((filter: SubscriptionFilter) => {
    service.subscribe(filter);
  }, [service]);

  // Unsubscribe method
  const unsubscribe = useCallback((filter?: SubscriptionFilter) => {
    service.unsubscribe(filter);
  }, [service]);

  // Message handler registration
  const onMessage = useCallback((handler: MessageHandler) => {
    return service.onMessage(handler);
  }, [service]);

  // Event handler registration
  const onEvent = useCallback((handler: EventHandler) => {
    eventHandlersRef.current.add(handler);
    return () => {
      eventHandlersRef.current.delete(handler);
    };
  }, []);

  // Error handler registration
  const onError = useCallback((handler: ErrorHandler) => {
    return service.onError(handler);
  }, [service]);

  // Calculate connection quality
  const quality = useCallback((): 'excellent' | 'good' | 'poor' | 'disconnected' => {
    if (status !== ConnectionStatus.CONNECTED) {
      return 'disconnected';
    }

    const avgLatency = stats.avgLatency;

    if (avgLatency < 100) return 'excellent';
    if (avgLatency < 300) return 'good';
    return 'poor';
  }, [status, stats.avgLatency]);

  return {
    connect,
    disconnect,
    isConnected: status === ConnectionStatus.CONNECTED,
    status,
    subscribe,
    unsubscribe,
    onMessage,
    onEvent,
    onError,
    stats,
    quality: quality(),
  };
}

/**
 * Hook for subscribing to specific events
 */
export function useWebSocketSubscription(
  filter: SubscriptionFilter,
  handler: EventHandler,
  options: UseWebSocketOptions = {}
) {
  const { subscribe, unsubscribe, onEvent } = useWebSocket(options);

  useEffect(() => {
    // Subscribe to events
    subscribe(filter);

    // Register event handler
    const unsubscribeHandler = onEvent(handler);

    return () => {
      // Cleanup
      unsubscribeHandler();
      unsubscribe(filter);
    };
  }, [filter, handler, subscribe, unsubscribe, onEvent]);
}

/**
 * Hook for agent-specific events
 */
export function useAgentEvents(
  agentIds: string[],
  handler: EventHandler,
  options: UseWebSocketOptions = {}
) {
  const filter: SubscriptionFilter = { agents: agentIds };
  useWebSocketSubscription(filter, handler, options);
}

/**
 * Hook for event-type-specific events
 */
export function useEventTypeEvents(
  eventTypes: string[],
  handler: EventHandler,
  options: UseWebSocketOptions = {}
) {
  const filter: SubscriptionFilter = { event_types: eventTypes };
  useWebSocketSubscription(filter, handler, options);
}

/**
 * Hook for session-specific events
 */
export function useSessionEvents(
  sessionIds: string[],
  handler: EventHandler,
  options: UseWebSocketOptions = {}
) {
  const filter: SubscriptionFilter = { sessions: sessionIds };
  useWebSocketSubscription(filter, handler, options);
}
