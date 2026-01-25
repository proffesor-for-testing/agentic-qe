/**
 * WebSocket Signaling Server for WebRTC Peer Discovery
 *
 * Handles WebSocket connections for P2P signaling, including:
 * - Room-based peer discovery
 * - SDP offer/answer exchange
 * - ICE candidate relay
 * - Heartbeat/keepalive mechanism
 *
 * @module edge/server/SignalingServer
 * @version 1.0.0
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import {
  PeerId,
  RoomId,
  SignalingMessage,
  SignalingMessageType,
  SignalingPeerJoinedMessage,
  SignalingPeerLeftMessage,
  SignalingRoomInfoMessage,
  SignalingPingMessage,
  SignalingPongMessage,
  SignalingErrorMessage,
  generateId,
} from '../p2p/webrtc/types';

// ============================================
// Types
// ============================================

export interface SignalingServerConfig {
  port: number;
  host?: string;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  maxPeersPerRoom?: number;
  maxRoomsPerPeer?: number;
  authValidator?: (peerId: PeerId, token?: string) => Promise<boolean>;
}

interface ConnectedPeer {
  id: PeerId;
  socket: WebSocket;
  rooms: Set<RoomId>;
  metadata?: Record<string, unknown>;
  lastPingTime: number;
  isAlive: boolean;
  connectedAt: number;
}

interface Room {
  id: RoomId;
  peers: Map<PeerId, { metadata?: Record<string, unknown> }>;
  createdAt: number;
}

export interface SignalingServerStats {
  totalPeers: number;
  totalRooms: number;
  messagesProcessed: number;
  uptime: number;
}

// ============================================
// Default Configuration
// ============================================

const DEFAULT_CONFIG: Omit<Required<SignalingServerConfig>, 'port' | 'authValidator'> = {
  host: '0.0.0.0',
  heartbeatInterval: 30000,
  heartbeatTimeout: 60000,
  maxPeersPerRoom: 100,
  maxRoomsPerPeer: 10,
};

// ============================================
// Signaling Server
// ============================================

export class SignalingServer {
  private readonly config: Required<Omit<SignalingServerConfig, 'authValidator'>> & {
    authValidator?: SignalingServerConfig['authValidator'];
  };
  private wss: WebSocketServer | null = null;
  private peers: Map<PeerId, ConnectedPeer> = new Map();
  private rooms: Map<RoomId, Room> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private messagesProcessed: number = 0;
  private startTime: number = 0;

  constructor(config: SignalingServerConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Start the signaling server
   */
  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port: this.config.port,
          host: this.config.host,
        });

        this.wss.on('connection', (socket, request) => {
          this.handleConnection(socket, request);
        });

        this.wss.on('error', (error) => {
          console.error('[SignalingServer] Server error:', error);
        });

        this.wss.on('listening', () => {
          this.startTime = Date.now();
          this.startHeartbeat();
          console.log(
            `[SignalingServer] Listening on ${this.config.host}:${this.config.port}`
          );
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the signaling server
   */
  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.stopHeartbeat();

      // Disconnect all peers
      Array.from(this.peers.values()).forEach((peer) => {
        peer.socket.close(1000, 'Server shutting down');
      });

      this.peers.clear();
      this.rooms.clear();

      if (this.wss) {
        this.wss.close(() => {
          console.log('[SignalingServer] Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get server statistics
   */
  public getStats(): SignalingServerStats {
    return {
      totalPeers: this.peers.size,
      totalRooms: this.rooms.size,
      messagesProcessed: this.messagesProcessed,
      uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
    };
  }

  /**
   * Get list of peers in a room
   */
  public getRoomPeers(roomId: RoomId): PeerId[] {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.peers.keys()) : [];
  }

  // ============================================
  // Connection Handling
  // ============================================

  private async handleConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const peerId = url.searchParams.get('peerId');
    const token = url.searchParams.get('token') || undefined;

    if (!peerId) {
      this.sendError(socket, 'INVALID_PEER_ID', 'Peer ID is required');
      socket.close(4000, 'Peer ID is required');
      return;
    }

    // Validate auth if configured
    if (this.config.authValidator) {
      const isValid = await this.config.authValidator(peerId, token);
      if (!isValid) {
        this.sendError(socket, 'UNAUTHORIZED', 'Authentication failed');
        socket.close(4001, 'Unauthorized');
        return;
      }
    }

    // Check for duplicate peer
    if (this.peers.has(peerId)) {
      const existingPeer = this.peers.get(peerId)!;
      existingPeer.socket.close(4002, 'Replaced by new connection');
      this.cleanupPeer(peerId);
    }

    // Register peer
    const peer: ConnectedPeer = {
      id: peerId,
      socket,
      rooms: new Set(),
      lastPingTime: Date.now(),
      isAlive: true,
      connectedAt: Date.now(),
    };

    this.peers.set(peerId, peer);
    console.log(`[SignalingServer] Peer connected: ${peerId}`);

    // Set up event handlers
    socket.on('message', (data) => {
      this.handleMessage(peerId, data.toString());
    });

    socket.on('close', (code, reason) => {
      console.log(`[SignalingServer] Peer disconnected: ${peerId} (${code}: ${reason})`);
      this.cleanupPeer(peerId);
    });

    socket.on('error', (error) => {
      console.error(`[SignalingServer] Socket error for ${peerId}:`, error);
    });

    socket.on('pong', () => {
      const p = this.peers.get(peerId);
      if (p) {
        p.isAlive = true;
        p.lastPingTime = Date.now();
      }
    });
  }

  // ============================================
  // Message Handling
  // ============================================

  private handleMessage(peerId: PeerId, data: string): void {
    this.messagesProcessed++;

    let message: SignalingMessage;
    try {
      message = JSON.parse(data) as SignalingMessage;
    } catch (error) {
      console.error(`[SignalingServer] Invalid message from ${peerId}:`, error);
      const peer = this.peers.get(peerId);
      if (peer) {
        this.sendError(peer.socket, 'INVALID_MESSAGE', 'Failed to parse message');
      }
      return;
    }

    const peer = this.peers.get(peerId);
    if (!peer) {
      console.warn(`[SignalingServer] Message from unknown peer: ${peerId}`);
      return;
    }

    switch (message.type) {
      case SignalingMessageType.JOIN_ROOM:
        this.handleJoinRoom(peer, message);
        break;

      case SignalingMessageType.LEAVE_ROOM:
        this.handleLeaveRoom(peer, message);
        break;

      case SignalingMessageType.OFFER:
      case SignalingMessageType.ANSWER:
      case SignalingMessageType.ICE_CANDIDATE:
      case SignalingMessageType.RENEGOTIATE:
        this.relayMessage(peer, message);
        break;

      case SignalingMessageType.PING:
        this.handlePing(peer, message as SignalingPingMessage);
        break;

      case SignalingMessageType.PONG:
        this.handlePong(peer, message as SignalingPongMessage);
        break;

      default:
        console.warn(`[SignalingServer] Unknown message type: ${(message as SignalingMessage).type}`);
    }
  }

  private handleJoinRoom(peer: ConnectedPeer, message: SignalingMessage): void {
    const { roomId, metadata } = (message as { payload: { roomId: RoomId; metadata?: Record<string, unknown> } }).payload;

    // Check room limit per peer
    if (peer.rooms.size >= this.config.maxRoomsPerPeer) {
      this.sendError(peer.socket, 'ROOM_LIMIT_EXCEEDED', 'Maximum rooms per peer exceeded');
      return;
    }

    // Get or create room
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        id: roomId,
        peers: new Map(),
        createdAt: Date.now(),
      };
      this.rooms.set(roomId, room);
      console.log(`[SignalingServer] Room created: ${roomId}`);
    }

    // Check peer limit per room
    if (room.peers.size >= this.config.maxPeersPerRoom) {
      this.sendError(peer.socket, 'ROOM_FULL', 'Room is full');
      return;
    }

    // Add peer to room
    room.peers.set(peer.id, { metadata });
    peer.rooms.add(roomId);
    peer.metadata = metadata;

    console.log(`[SignalingServer] Peer ${peer.id} joined room ${roomId}`);

    // Send room info to joining peer
    this.sendRoomInfo(peer, room);

    // Notify other peers in the room
    const peerJoined: SignalingPeerJoinedMessage = {
      type: SignalingMessageType.PEER_JOINED,
      id: generateId('msg'),
      from: 'server' as PeerId,
      roomId,
      timestamp: Date.now(),
      payload: {
        peerId: peer.id,
        metadata,
      },
    };

    this.broadcastToRoom(roomId, peerJoined, peer.id);
  }

  private handleLeaveRoom(peer: ConnectedPeer, message: SignalingMessage): void {
    const { roomId, reason } = (message as { payload: { roomId: RoomId; reason?: string } }).payload;

    this.removePeerFromRoom(peer, roomId, reason);
  }

  private relayMessage(from: ConnectedPeer, message: SignalingMessage): void {
    if (!message.to) {
      console.warn(`[SignalingServer] Relay message without target from ${from.id}`);
      return;
    }

    const targetPeer = this.peers.get(message.to);
    if (!targetPeer) {
      this.sendError(from.socket, 'PEER_NOT_FOUND', `Target peer ${message.to} not found`);
      return;
    }

    // Verify both peers are in the same room (if room is specified)
    if (message.roomId) {
      const room = this.rooms.get(message.roomId);
      if (!room || !room.peers.has(from.id) || !room.peers.has(message.to)) {
        this.sendError(from.socket, 'NOT_IN_ROOM', 'Peers must be in the same room');
        return;
      }
    }

    // Relay the message
    this.send(targetPeer.socket, message);
  }

  private handlePing(peer: ConnectedPeer, message: SignalingPingMessage): void {
    peer.isAlive = true;
    peer.lastPingTime = Date.now();

    const pong: SignalingPongMessage = {
      type: SignalingMessageType.PONG,
      id: generateId('msg'),
      from: 'server' as PeerId,
      timestamp: Date.now(),
      payload: {
        originalTimestamp: message.payload.timestamp,
        respondTimestamp: Date.now(),
      },
    };

    this.send(peer.socket, pong);
  }

  private handlePong(peer: ConnectedPeer, _message: SignalingPongMessage): void {
    peer.isAlive = true;
    peer.lastPingTime = Date.now();
  }

  // ============================================
  // Room Management
  // ============================================

  private removePeerFromRoom(peer: ConnectedPeer, roomId: RoomId, reason?: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.peers.delete(peer.id);
    peer.rooms.delete(roomId);

    console.log(`[SignalingServer] Peer ${peer.id} left room ${roomId}`);

    // Notify other peers
    const peerLeft: SignalingPeerLeftMessage = {
      type: SignalingMessageType.PEER_LEFT,
      id: generateId('msg'),
      from: 'server' as PeerId,
      roomId,
      timestamp: Date.now(),
      payload: {
        peerId: peer.id,
        reason,
      },
    };

    this.broadcastToRoom(roomId, peerLeft);

    // Delete empty rooms
    if (room.peers.size === 0) {
      this.rooms.delete(roomId);
      console.log(`[SignalingServer] Room deleted (empty): ${roomId}`);
    }
  }

  private cleanupPeer(peerId: PeerId): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    // Remove from all rooms
    Array.from(peer.rooms).forEach((roomId) => {
      this.removePeerFromRoom(peer, roomId, 'Disconnected');
    });

    this.peers.delete(peerId);
  }

  // ============================================
  // Messaging Helpers
  // ============================================

  private send(socket: WebSocket, message: SignalingMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  private sendError(socket: WebSocket, code: string, message: string, details?: unknown): void {
    const error: SignalingErrorMessage = {
      type: SignalingMessageType.ERROR,
      id: generateId('msg'),
      from: 'server' as PeerId,
      timestamp: Date.now(),
      payload: { code, message, details },
    };

    this.send(socket, error);
  }

  private sendRoomInfo(peer: ConnectedPeer, room: Room): void {
    const peers = Array.from(room.peers.entries())
      .filter(([id]) => id !== peer.id)
      .map(([id, data]) => ({
        id,
        metadata: data.metadata,
      }));

    const roomInfo: SignalingRoomInfoMessage = {
      type: SignalingMessageType.ROOM_INFO,
      id: generateId('msg'),
      from: 'server' as PeerId,
      roomId: room.id,
      timestamp: Date.now(),
      payload: {
        roomId: room.id,
        peers,
      },
    };

    this.send(peer.socket, roomInfo);
  }

  private broadcastToRoom(roomId: RoomId, message: SignalingMessage, excludePeerId?: PeerId): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    Array.from(room.peers.keys()).forEach((peerId) => {
      if (peerId === excludePeerId) return;

      const peer = this.peers.get(peerId);
      if (peer) {
        this.send(peer.socket, message);
      }
    });
  }

  // ============================================
  // Heartbeat
  // ============================================

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();

      const peerEntries = Array.from(this.peers.entries());
      for (const [peerId, peer] of peerEntries) {
        if (!peer.isAlive) {
          console.log(`[SignalingServer] Peer timeout: ${peerId}`);
          peer.socket.terminate();
          this.cleanupPeer(peerId);
          continue;
        }

        // Check heartbeat timeout
        if (now - peer.lastPingTime > this.config.heartbeatTimeout) {
          console.log(`[SignalingServer] Peer heartbeat timeout: ${peerId}`);
          peer.socket.terminate();
          this.cleanupPeer(peerId);
          continue;
        }

        peer.isAlive = false;
        peer.socket.ping();
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

export default SignalingServer;
