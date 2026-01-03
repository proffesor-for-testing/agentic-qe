/**
 * Signaling Server Tests
 *
 * Tests for the WebSocket signaling server that handles WebRTC peer discovery.
 *
 * @module tests/edge/server/SignalingServer.test
 */

import { WebSocket } from 'ws';
import { SignalingServer, SignalingServerConfig } from '../../../src/edge/server/SignalingServer';
import { SignalingMessageType, generateId } from '../../../src/edge/p2p/webrtc/types';

describe('SignalingServer', () => {
  let server: SignalingServer;
  const port = 9999;
  const serverUrl = `ws://localhost:${port}`;

  beforeAll(async () => {
    server = new SignalingServer({ port });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('Connection Management', () => {
    it('should accept WebSocket connections with peerId', async () => {
      const peerId = `peer-${Date.now()}`;
      const ws = new WebSocket(`${serverUrl}?peerId=${peerId}`);

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          expect(ws.readyState).toBe(WebSocket.OPEN);
          ws.close();
          resolve();
        });
        ws.on('error', reject);
      });
    });

    it('should reject connections without peerId', async () => {
      const ws = new WebSocket(serverUrl);

      await new Promise<void>((resolve) => {
        ws.on('close', (code) => {
          expect(code).toBe(4000);
          resolve();
        });
        ws.on('error', () => {
          // Expected for rejected connection
          resolve();
        });
      });
    });

    it('should replace existing connections from same peerId', async () => {
      const peerId = `peer-replace-${Date.now()}`;

      // First connection
      const ws1 = new WebSocket(`${serverUrl}?peerId=${peerId}`);
      await new Promise<void>((resolve) => ws1.on('open', resolve));

      // Second connection with same peerId
      const ws2 = new WebSocket(`${serverUrl}?peerId=${peerId}`);
      await new Promise<void>((resolve) => ws2.on('open', resolve));

      // First connection should be closed
      await new Promise<void>((resolve) => {
        ws1.on('close', (code) => {
          expect(code).toBe(4002);
          resolve();
        });
      });

      ws2.close();
    });
  });

  describe('Room Management', () => {
    it('should allow peers to join rooms', async () => {
      const peerId = `peer-room-${Date.now()}`;
      const roomId = 'test-room-1';
      const ws = new WebSocket(`${serverUrl}?peerId=${peerId}`);

      await new Promise<void>((resolve) => ws.on('open', resolve));

      // Join room
      const joinMessage = {
        type: SignalingMessageType.JOIN_ROOM,
        id: generateId('msg'),
        from: peerId,
        roomId,
        timestamp: Date.now(),
        payload: { roomId },
      };

      const roomInfoPromise = new Promise<void>((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === SignalingMessageType.ROOM_INFO) {
            expect(message.payload.roomId).toBe(roomId);
            resolve();
          }
        });
      });

      ws.send(JSON.stringify(joinMessage));
      await roomInfoPromise;

      ws.close();
    });

    it('should notify peers when others join the room', async () => {
      const roomId = `test-room-notify-${Date.now()}`;
      const peer1Id = `peer1-${Date.now()}`;
      const peer2Id = `peer2-${Date.now()}`;

      // Peer 1 joins
      const ws1 = new WebSocket(`${serverUrl}?peerId=${peer1Id}`);
      await new Promise<void>((resolve) => ws1.on('open', resolve));

      ws1.send(JSON.stringify({
        type: SignalingMessageType.JOIN_ROOM,
        id: generateId('msg'),
        from: peer1Id,
        roomId,
        timestamp: Date.now(),
        payload: { roomId },
      }));

      // Wait for room info
      await new Promise<void>((resolve) => {
        ws1.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === SignalingMessageType.ROOM_INFO) {
            resolve();
          }
        });
      });

      // Set up listener for peer joined notification
      const peerJoinedPromise = new Promise<void>((resolve) => {
        ws1.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === SignalingMessageType.PEER_JOINED) {
            expect(message.payload.peerId).toBe(peer2Id);
            resolve();
          }
        });
      });

      // Peer 2 joins same room
      const ws2 = new WebSocket(`${serverUrl}?peerId=${peer2Id}`);
      await new Promise<void>((resolve) => ws2.on('open', resolve));

      ws2.send(JSON.stringify({
        type: SignalingMessageType.JOIN_ROOM,
        id: generateId('msg'),
        from: peer2Id,
        roomId,
        timestamp: Date.now(),
        payload: { roomId },
      }));

      await peerJoinedPromise;

      ws1.close();
      ws2.close();
    });
  });

  describe('Message Relay', () => {
    it('should relay offer messages between peers', async () => {
      const roomId = `test-room-relay-${Date.now()}`;
      const peer1Id = `peer1-relay-${Date.now()}`;
      const peer2Id = `peer2-relay-${Date.now()}`;

      // Connect both peers
      const ws1 = new WebSocket(`${serverUrl}?peerId=${peer1Id}`);
      const ws2 = new WebSocket(`${serverUrl}?peerId=${peer2Id}`);

      await Promise.all([
        new Promise<void>((resolve) => ws1.on('open', resolve)),
        new Promise<void>((resolve) => ws2.on('open', resolve)),
      ]);

      // Both join same room
      for (const [ws, peerId] of [[ws1, peer1Id], [ws2, peer2Id]] as [WebSocket, string][]) {
        ws.send(JSON.stringify({
          type: SignalingMessageType.JOIN_ROOM,
          id: generateId('msg'),
          from: peerId,
          roomId,
          timestamp: Date.now(),
          payload: { roomId },
        }));
      }

      // Wait for room setup
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Set up listener for offer on peer 2
      const offerPromise = new Promise<void>((resolve) => {
        ws2.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === SignalingMessageType.OFFER) {
            expect(message.from).toBe(peer1Id);
            expect(message.payload.sdp).toBe('test-sdp-offer');
            resolve();
          }
        });
      });

      // Peer 1 sends offer to peer 2
      ws1.send(JSON.stringify({
        type: SignalingMessageType.OFFER,
        id: generateId('msg'),
        from: peer1Id,
        to: peer2Id,
        roomId,
        timestamp: Date.now(),
        payload: { sdp: 'test-sdp-offer' },
      }));

      await offerPromise;

      ws1.close();
      ws2.close();
    });
  });

  describe('Server Stats', () => {
    it('should track connected peers and rooms', async () => {
      const peerId = `peer-stats-${Date.now()}`;
      const roomId = `room-stats-${Date.now()}`;
      const ws = new WebSocket(`${serverUrl}?peerId=${peerId}`);

      await new Promise<void>((resolve) => ws.on('open', resolve));

      // Join a room
      ws.send(JSON.stringify({
        type: SignalingMessageType.JOIN_ROOM,
        id: generateId('msg'),
        from: peerId,
        roomId,
        timestamp: Date.now(),
        payload: { roomId },
      }));

      await new Promise((resolve) => setTimeout(resolve, 50));

      const stats = server.getStats();
      expect(stats.totalPeers).toBeGreaterThanOrEqual(1);
      expect(stats.totalRooms).toBeGreaterThanOrEqual(1);

      ws.close();
    });
  });
});
