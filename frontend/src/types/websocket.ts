/**
 * WebSocket Message Types and Interfaces
 * Phase 3 - Real-time Event Streaming
 */

export enum WebSocketMessageType {
  // Client -> Server
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  PING = 'ping',

  // Server -> Client
  EVENT = 'event',
  PONG = 'pong',
  ERROR = 'error',
  SUBSCRIBED = 'subscribed',
  UNSUBSCRIBED = 'unsubscribed',
}

export enum ConnectionStatus {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

export interface WebSocketMessage {
  type: WebSocketMessageType;
  payload?: any;
  timestamp?: number;
  id?: string;
}

export interface EventMessage extends WebSocketMessage {
  type: WebSocketMessageType.EVENT;
  payload: {
    id: string;
    timestamp: string;
    agent_id: string;
    session_id: string;
    event_type: string;
    severity: 'info' | 'warning' | 'error';
    data: Record<string, any>;
  };
}

export interface SubscribeMessage extends WebSocketMessage {
  type: WebSocketMessageType.SUBSCRIBE;
  payload: {
    agents?: string[];
    event_types?: string[];
    sessions?: string[];
    severity?: string[];
  };
}

export interface UnsubscribeMessage extends WebSocketMessage {
  type: WebSocketMessageType.UNSUBSCRIBE;
  payload?: {
    agents?: string[];
    event_types?: string[];
    sessions?: string[];
  };
}

export interface ErrorMessage extends WebSocketMessage {
  type: WebSocketMessageType.ERROR;
  payload: {
    message: string;
    code?: string;
    details?: any;
  };
}

export interface WebSocketStats {
  messagesSent: number;
  messagesReceived: number;
  reconnectAttempts: number;
  lastConnected: number | null;
  lastDisconnected: number | null;
  uptime: number;
  avgLatency: number;
}

export interface SubscriptionFilter {
  agents?: string[];
  event_types?: string[];
  sessions?: string[];
  severity?: string[];
}

export type MessageHandler = (message: WebSocketMessage) => void;
export type EventHandler = (event: EventMessage['payload']) => void;
export type ConnectionHandler = (status: ConnectionStatus) => void;
export type ErrorHandler = (error: Error) => void;
