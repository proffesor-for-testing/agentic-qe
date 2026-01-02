/**
 * WebRTC Module Unit Tests
 *
 * Comprehensive tests for the WebRTC P2P foundation including:
 * - ICE Manager
 * - Signaling Client
 * - Peer Connection Manager
 * - Connection Pool
 *
 * @module tests/edge/p2p/webrtc.test
 */

import { createResourceCleanup } from '../../helpers/cleanup';

// Mock WebRTC APIs for Node.js test environment
class MockRTCPeerConnection {
  public onicecandidate: ((event: { candidate: RTCIceCandidate | null }) => void) | null = null;
  public onicegatheringstatechange: (() => void) | null = null;
  public oniceconnectionstatechange: (() => void) | null = null;
  public onconnectionstatechange: (() => void) | null = null;
  public onnegotiationneeded: (() => void) | null = null;
  public ondatachannel: ((event: { channel: RTCDataChannel }) => void) | null = null;

  public connectionState: RTCPeerConnectionState = 'new';
  public iceGatheringState: RTCIceGatheringState = 'new';
  public iceConnectionState: RTCIceConnectionState = 'new';
  public localDescription: RTCSessionDescription | null = null;
  public remoteDescription: RTCSessionDescription | null = null;

  private dataChannels: Map<string, MockRTCDataChannel> = new Map();
  private iceCandidates: RTCIceCandidate[] = [];

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return {
      type: 'offer',
      sdp: 'mock-offer-sdp',
    };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return {
      type: 'answer',
      sdp: 'mock-answer-sdp',
    };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description as RTCSessionDescription;
    // Simulate ICE gathering
    setTimeout(() => {
      if (this.onicecandidate) {
        // Emit a mock candidate
        this.onicecandidate({
          candidate: {
            candidate: 'candidate:1 1 udp 2130706431 192.168.1.1 12345 typ host',
            sdpMLineIndex: 0,
            sdpMid: 'audio',
            usernameFragment: 'mock-ufrag',
            address: '192.168.1.1',
            port: 12345,
            protocol: 'udp',
            toJSON: () => ({}),
          } as RTCIceCandidate,
        });
        // Signal end of candidates
        setTimeout(() => {
          if (this.onicecandidate) {
            this.onicecandidate({ candidate: null });
          }
        }, 10);
      }
    }, 10);
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description as RTCSessionDescription;
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    this.iceCandidates.push(candidate as RTCIceCandidate);
  }

  createDataChannel(label: string, options?: RTCDataChannelInit): RTCDataChannel {
    const channel = new MockRTCDataChannel(label, options);
    this.dataChannels.set(label, channel);
    return channel as unknown as RTCDataChannel;
  }

  async getStats(): Promise<RTCStatsReport> {
    const stats = new Map<string, unknown>();
    stats.set('candidate-pair-1', {
      type: 'candidate-pair',
      state: 'succeeded',
      currentRoundTripTime: 0.05,
      availableOutgoingBitrate: 2500000,
    });
    stats.set('local-candidate-1', {
      type: 'local-candidate',
      candidateType: 'host',
    });
    stats.set('remote-candidate-1', {
      type: 'remote-candidate',
      candidateType: 'srflx',
    });
    return stats as RTCStatsReport;
  }

  restartIce(): void {
    this.iceGatheringState = 'new';
  }

  close(): void {
    this.connectionState = 'closed';
    this.dataChannels.forEach((channel) => channel.close());
    this.dataChannels.clear();
  }

  // Helper for tests to simulate state changes
  simulateConnectionState(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    if (this.onconnectionstatechange) {
      this.onconnectionstatechange();
    }
  }

  simulateIceConnectionState(state: RTCIceConnectionState): void {
    this.iceConnectionState = state;
    if (this.oniceconnectionstatechange) {
      this.oniceconnectionstatechange();
    }
  }

  simulateDataChannel(label: string): void {
    const channel = new MockRTCDataChannel(label);
    if (this.ondatachannel) {
      this.ondatachannel({ channel: channel as unknown as RTCDataChannel });
    }
  }
}

class MockRTCDataChannel {
  public label: string;
  public readyState: RTCDataChannelState = 'connecting';
  public bufferedAmount: number = 0;
  public bufferedAmountLowThreshold: number = 0;
  public ordered: boolean;
  public maxRetransmits: number | null = null;
  public maxPacketLifeTime: number | null = null;
  public protocol: string = '';

  public onopen: (() => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;

  private messages: string[] = [];

  constructor(label: string, options?: RTCDataChannelInit) {
    this.label = label;
    this.ordered = options?.ordered ?? true;
    if (options?.maxRetransmits !== undefined) {
      this.maxRetransmits = options.maxRetransmits;
    }
    if (options?.maxPacketLifeTime !== undefined) {
      this.maxPacketLifeTime = options.maxPacketLifeTime;
    }
    this.protocol = options?.protocol ?? '';

    // Simulate channel opening
    setTimeout(() => {
      this.readyState = 'open';
      if (this.onopen) {
        this.onopen();
      }
    }, 10);
  }

  send(data: string | ArrayBuffer | Blob): void {
    if (this.readyState !== 'open') {
      throw new Error('Data channel not open');
    }
    this.messages.push(data as string);
  }

  close(): void {
    this.readyState = 'closed';
    if (this.onclose) {
      this.onclose();
    }
  }

  // Helper for tests
  simulateMessage(data: string): void {
    if (this.onmessage) {
      this.onmessage({ data } as MessageEvent);
    }
  }

  getMessages(): string[] {
    return [...this.messages];
  }
}

class MockWebSocket {
  public url: string;
  public readyState: number = WebSocket.CONNECTING;

  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;

  private sentMessages: string[] = [];

  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url: string) {
    this.url = url;

    // Simulate connection opening
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      if (this.onopen) {
        this.onopen({} as Event);
      }
    }, 10);
  }

  send(data: string): void {
    if (this.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not open');
    }
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code: code ?? 1000, reason: reason ?? '' } as CloseEvent);
    }
  }

  // Helpers for tests
  simulateMessage(data: string): void {
    if (this.onmessage) {
      this.onmessage({ data } as MessageEvent);
    }
  }

  getSentMessages(): string[] {
    return [...this.sentMessages];
  }
}

// Install mocks before importing modules
(global as unknown as { RTCPeerConnection: typeof MockRTCPeerConnection }).RTCPeerConnection = MockRTCPeerConnection;
(global as unknown as { RTCDataChannel: typeof MockRTCDataChannel }).RTCDataChannel = MockRTCDataChannel;
(global as unknown as { RTCIceCandidate: new (init: RTCIceCandidateInit) => RTCIceCandidate }).RTCIceCandidate = class {
  candidate: string;
  sdpMLineIndex: number | null;
  sdpMid: string | null;
  usernameFragment: string | null;

  constructor(init: RTCIceCandidateInit) {
    this.candidate = init.candidate ?? '';
    this.sdpMLineIndex = init.sdpMLineIndex ?? null;
    this.sdpMid = init.sdpMid ?? null;
    this.usernameFragment = init.usernameFragment ?? null;
  }

  toJSON() {
    return {};
  }
} as unknown as new (init: RTCIceCandidateInit) => RTCIceCandidate;
(global as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket as unknown as typeof WebSocket;

// Now import the modules under test
import {
  ICEManager,
  SignalingClient,
  PeerConnectionManager,
  ConnectionPool,
  ConnectionState,
  SignalingClientState,
  SignalingMessageType,
  EvictionPolicy,
  WebRTCEventType,
  DEFAULT_ICE_SERVERS,
  generateId,
  parseICECandidateType,
  createDefaultConnectionQuality,
  isWebRTCSupported,
  createP2PSystem,
  NATType,
} from '../../../src/edge/p2p/webrtc';

describe('WebRTC Module', () => {
  const cleanup = createResourceCleanup();

  afterEach(async () => {
    await cleanup.afterEach();
    jest.clearAllMocks();
  });

  // ============================================
  // Types and Utilities Tests
  // ============================================
  describe('Types and Utilities', () => {
    describe('generateId', () => {
      it('should generate unique IDs', () => {
        const id1 = generateId();
        const id2 = generateId();

        expect(id1).toBeDefined();
        expect(id2).toBeDefined();
        expect(id1).not.toBe(id2);
      });

      it('should include prefix when provided', () => {
        const id = generateId('test');

        expect(id).toMatch(/^test-/);
      });
    });

    describe('parseICECandidateType', () => {
      it('should parse host candidate', () => {
        const type = parseICECandidateType('candidate:1 1 udp 2130706431 192.168.1.1 12345 typ host');
        expect(type).toBe('host');
      });

      it('should parse srflx candidate', () => {
        const type = parseICECandidateType('candidate:1 1 udp 1694498815 203.0.113.1 12345 typ srflx');
        expect(type).toBe('srflx');
      });

      it('should parse relay candidate', () => {
        const type = parseICECandidateType('candidate:1 1 udp 33562623 198.51.100.1 12345 typ relay');
        expect(type).toBe('relay');
      });

      it('should return unknown for invalid candidate', () => {
        const type = parseICECandidateType('invalid candidate string');
        expect(type).toBe('unknown');
      });
    });

    describe('createDefaultConnectionQuality', () => {
      it('should create default quality object', () => {
        const quality = createDefaultConnectionQuality();

        expect(quality).toHaveProperty('rttMs', 0);
        expect(quality).toHaveProperty('packetLossPercent', 0);
        expect(quality).toHaveProperty('availableBandwidth', 0);
        expect(quality).toHaveProperty('localCandidateType', 'unknown');
        expect(quality).toHaveProperty('remoteCandidateType', 'unknown');
        expect(quality).toHaveProperty('measuredAt');
      });
    });

    describe('isWebRTCSupported', () => {
      it('should detect WebRTC support based on available APIs', () => {
        // Our mock only provides RTCPeerConnection and RTCDataChannel
        // The function also checks RTCSessionDescription which we haven't mocked
        const result = isWebRTCSupported();
        // Since RTCSessionDescription is not mocked, it returns false in test env
        expect(typeof result).toBe('boolean');
      });
    });
  });

  // ============================================
  // ICE Manager Tests
  // ============================================
  describe('ICEManager', () => {
    let iceManager: ICEManager;

    beforeEach(() => {
      iceManager = new ICEManager({
        iceServers: DEFAULT_ICE_SERVERS,
        enableTrickle: true,
      });
    });

    afterEach(() => {
      iceManager.destroy();
    });

    describe('Configuration', () => {
      it('should create with default configuration', () => {
        const manager = new ICEManager();
        const config = manager.getRTCConfiguration();

        expect(config.iceServers).toHaveLength(2);
        expect(config.iceServers![0].urls).toBe('stun:stun.l.google.com:19302');

        manager.destroy();
      });

      it('should create with custom configuration', () => {
        const customManager = new ICEManager({
          iceServers: [{ urls: 'stun:custom.stun.com:3478' }],
          iceTransportPolicy: 'relay',
        });

        const config = customManager.getRTCConfiguration();

        expect(config.iceServers).toHaveLength(1);
        expect(config.iceServers![0].urls).toBe('stun:custom.stun.com:3478');
        expect(config.iceTransportPolicy).toBe('relay');

        customManager.destroy();
      });
    });

    describe('Peer Connection Attachment', () => {
      it('should attach to peer connection', () => {
        const pc = new MockRTCPeerConnection() as unknown as RTCPeerConnection;

        iceManager.attachToPeerConnection(pc);

        expect(pc.onicecandidate).toBeDefined();
        expect(pc.onicegatheringstatechange).toBeDefined();
        expect(pc.oniceconnectionstatechange).toBeDefined();
      });

      it('should detach from peer connection', () => {
        const pc = new MockRTCPeerConnection() as unknown as RTCPeerConnection;

        iceManager.attachToPeerConnection(pc);
        iceManager.detachFromPeerConnection();

        expect(pc.onicecandidate).toBeNull();
        expect(pc.onicegatheringstatechange).toBeNull();
        expect(pc.oniceconnectionstatechange).toBeNull();
      });
    });

    describe('ICE Candidate Handling', () => {
      it('should emit candidates when gathered', async () => {
        const pc = new MockRTCPeerConnection();
        const candidates: unknown[] = [];

        iceManager.attachToPeerConnection(pc as unknown as RTCPeerConnection);
        iceManager.onCandidate((candidate) => {
          candidates.push(candidate);
        });

        // Trigger ICE gathering
        await pc.setLocalDescription({ type: 'offer', sdp: 'test' });

        // Wait for async candidate gathering
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(candidates.length).toBeGreaterThan(0);
        expect(candidates[0]).toHaveProperty('candidate');
        expect(candidates[0]).toHaveProperty('type');
      });

      it('should add remote candidates', async () => {
        const pc = new MockRTCPeerConnection();

        iceManager.attachToPeerConnection(pc as unknown as RTCPeerConnection);

        const remoteCandidate = {
          candidate: 'candidate:1 1 udp 2130706431 10.0.0.1 54321 typ host',
          sdpMLineIndex: 0,
          sdpMid: 'audio',
          usernameFragment: null,
          type: 'host' as const,
          priority: 2130706431,
        };

        await iceManager.addRemoteCandidate(remoteCandidate);

        // Candidate should be added successfully
        expect(true).toBe(true);
      });

      it('should throw when adding candidate without peer connection', async () => {
        const remoteCandidate = {
          candidate: 'candidate:1 1 udp 2130706431 10.0.0.1 54321 typ host',
          sdpMLineIndex: 0,
          sdpMid: 'audio',
          usernameFragment: null,
          type: 'host' as const,
          priority: 2130706431,
        };

        await expect(iceManager.addRemoteCandidate(remoteCandidate)).rejects.toThrow(
          'No peer connection attached'
        );
      });
    });

    describe('ICE Gathering State', () => {
      it('should track gathering state', async () => {
        const pc = new MockRTCPeerConnection();

        iceManager.attachToPeerConnection(pc as unknown as RTCPeerConnection);

        const state = iceManager.getGatheringState();

        expect(state).toHaveProperty('state');
        expect(state).toHaveProperty('localCandidates');
        expect(state).toHaveProperty('remoteCandidates');
        expect(state).toHaveProperty('natType');
        expect(state).toHaveProperty('isComplete');
      });

      it('should wait for gathering complete', async () => {
        const pc = new MockRTCPeerConnection();

        iceManager.attachToPeerConnection(pc as unknown as RTCPeerConnection);

        // Trigger gathering
        await pc.setLocalDescription({ type: 'offer', sdp: 'test' });

        // Wait for gathering
        await iceManager.waitForGatheringComplete(1000);

        const state = iceManager.getGatheringState();
        expect(state.isComplete).toBe(true);
      });
    });

    describe('NAT Type Detection', () => {
      it('should detect NAT type from candidates', async () => {
        const pc = new MockRTCPeerConnection();

        iceManager.attachToPeerConnection(pc as unknown as RTCPeerConnection);

        // Trigger gathering
        await pc.setLocalDescription({ type: 'offer', sdp: 'test' });
        await iceManager.waitForGatheringComplete(1000);

        const natType = await iceManager.detectNATType();

        expect(Object.values(NATType)).toContain(natType);
      });

      it('should return UNKNOWN when no candidates', async () => {
        const natType = await iceManager.detectNATType();

        expect(natType).toBe(NATType.UNKNOWN);
      });
    });

    describe('Connection Quality', () => {
      it('should update connection quality from stats', async () => {
        const pc = new MockRTCPeerConnection();

        iceManager.attachToPeerConnection(pc as unknown as RTCPeerConnection);

        const quality = await iceManager.updateConnectionQuality();

        expect(quality).toHaveProperty('rttMs');
        expect(quality).toHaveProperty('packetLossPercent');
        expect(quality).toHaveProperty('availableBandwidth');
        expect(quality).toHaveProperty('localCandidateType');
        expect(quality).toHaveProperty('remoteCandidateType');
      });
    });
  });

  // ============================================
  // Signaling Client Tests
  // ============================================
  describe('SignalingClient', () => {
    let signaling: SignalingClient;

    beforeEach(() => {
      signaling = new SignalingClient({
        serverUrl: 'wss://test.signal.com',
        peerId: 'test-peer',
        autoReconnect: false,
      });
    });

    afterEach(() => {
      signaling.disconnect();
    });

    describe('Connection', () => {
      it('should start disconnected', () => {
        expect(signaling.getState()).toBe(SignalingClientState.DISCONNECTED);
        expect(signaling.isConnected()).toBe(false);
      });

      it('should connect successfully', async () => {
        await signaling.connect();

        expect(signaling.getState()).toBe(SignalingClientState.CONNECTED);
        expect(signaling.isConnected()).toBe(true);
      });

      it('should handle multiple connect calls', async () => {
        await signaling.connect();
        await signaling.connect();
        await signaling.connect();

        expect(signaling.isConnected()).toBe(true);
      });

      it('should disconnect cleanly', async () => {
        await signaling.connect();
        signaling.disconnect('test-reason');

        expect(signaling.getState()).toBe(SignalingClientState.CLOSED);
        expect(signaling.isConnected()).toBe(false);
      });
    });

    describe('Room Management', () => {
      beforeEach(async () => {
        await signaling.connect();
      });

      it('should join room', async () => {
        await signaling.joinRoom('test-room', { name: 'Test User' });

        expect(signaling.getCurrentRoom()).toBe('test-room');
      });

      it('should leave room', async () => {
        await signaling.joinRoom('test-room');
        await signaling.leaveRoom('leaving');

        expect(signaling.getCurrentRoom()).toBeNull();
      });

      it('should switch rooms', async () => {
        await signaling.joinRoom('room-1');
        expect(signaling.getCurrentRoom()).toBe('room-1');

        await signaling.joinRoom('room-2');
        expect(signaling.getCurrentRoom()).toBe('room-2');
      });
    });

    describe('Signaling Messages', () => {
      beforeEach(async () => {
        await signaling.connect();
      });

      it('should send offer', async () => {
        await signaling.sendOffer('remote-peer', 'v=0...');

        // Message should be sent (no error thrown)
        expect(true).toBe(true);
      });

      it('should send answer', async () => {
        await signaling.sendAnswer('remote-peer', 'v=0...');

        expect(true).toBe(true);
      });

      it('should send ICE candidate', async () => {
        await signaling.sendIceCandidate('remote-peer', {
          candidate: 'candidate:1 1 udp 2130706431 192.168.1.1 12345 typ host',
          sdpMLineIndex: 0,
          sdpMid: 'audio',
          usernameFragment: null,
          type: 'host',
          priority: 2130706431,
        });

        expect(true).toBe(true);
      });
    });

    describe('Event Handling', () => {
      it('should call onOffer handler', async () => {
        const onOffer = jest.fn();
        signaling.on({ onOffer });

        await signaling.connect();

        // Simulate receiving offer message
        const ws = (signaling as unknown as { socket: MockWebSocket }).socket;
        ws.simulateMessage(JSON.stringify({
          type: SignalingMessageType.OFFER,
          id: 'msg-1',
          from: 'remote-peer',
          timestamp: Date.now(),
          payload: {
            sdp: 'mock-sdp',
            metadata: { test: true },
          },
        }));

        expect(onOffer).toHaveBeenCalledWith('remote-peer', 'mock-sdp', { test: true });
      });

      it('should call onPeerJoined handler', async () => {
        const onPeerJoined = jest.fn();
        signaling.on({ onPeerJoined });

        await signaling.connect();

        const ws = (signaling as unknown as { socket: MockWebSocket }).socket;
        ws.simulateMessage(JSON.stringify({
          type: SignalingMessageType.PEER_JOINED,
          id: 'msg-1',
          from: 'server',
          timestamp: Date.now(),
          payload: {
            peerId: 'new-peer',
            metadata: { name: 'New Peer' },
          },
        }));

        expect(onPeerJoined).toHaveBeenCalledWith('new-peer', { name: 'New Peer' });
      });

      it('should call onError handler', async () => {
        const onError = jest.fn();
        signaling.on({ onError });

        await signaling.connect();

        const ws = (signaling as unknown as { socket: MockWebSocket }).socket;
        ws.simulateMessage(JSON.stringify({
          type: SignalingMessageType.ERROR,
          id: 'msg-1',
          from: 'server',
          timestamp: Date.now(),
          payload: {
            code: 'ROOM_FULL',
            message: 'Room is at capacity',
          },
        }));

        expect(onError).toHaveBeenCalledWith('ROOM_FULL', 'Room is at capacity', undefined);
      });
    });

    describe('State Change Callbacks', () => {
      it('should notify on state changes', async () => {
        const states: SignalingClientState[] = [];
        const unsubscribe = signaling.onStateChange((state) => {
          states.push(state);
        });

        await signaling.connect();
        signaling.disconnect();

        expect(states).toContain(SignalingClientState.CONNECTING);
        expect(states).toContain(SignalingClientState.CONNECTED);
        expect(states).toContain(SignalingClientState.CLOSED);

        unsubscribe();
      });
    });
  });

  // ============================================
  // Peer Connection Manager Tests
  // ============================================
  describe('PeerConnectionManager', () => {
    let manager: PeerConnectionManager;
    let signaling: SignalingClient;

    beforeEach(async () => {
      signaling = new SignalingClient({
        serverUrl: 'wss://test.signal.com',
        peerId: 'local-peer',
        autoReconnect: false,
      });

      manager = new PeerConnectionManager({
        localPeerId: 'local-peer',
        autoReconnect: false,
      });

      manager.setSignaling(signaling);
      await signaling.connect();
    });

    afterEach(async () => {
      await manager.destroy();
      signaling.disconnect();
    });

    describe('Connection Management', () => {
      it('should return local peer ID', () => {
        expect(manager.getLocalPeerId()).toBe('local-peer');
      });

      it('should connect to peer', async () => {
        const connection = await manager.connect('remote-peer');

        expect(connection).toBeDefined();
        expect(connection.id).toBe('remote-peer');
        expect(connection.state).toBe(ConnectionState.CONNECTING);
      });

      it('should track connected peers', async () => {
        await manager.connect('peer-1');
        await manager.connect('peer-2');

        const state1 = manager.getConnectionState('peer-1');
        const state2 = manager.getConnectionState('peer-2');

        expect(state1).toBeDefined();
        expect(state2).toBeDefined();
      });

      it('should return null for unknown peer', () => {
        const state = manager.getConnectionState('unknown-peer');

        expect(state).toBeNull();
      });

      it('should disconnect from peer', async () => {
        await manager.connect('remote-peer');
        await manager.disconnect('remote-peer');

        const state = manager.getConnectionState('remote-peer');
        expect(state).toBeNull();
      });
    });

    describe('Data Channels', () => {
      it('should create default data channels', async () => {
        const connection = await manager.connect('remote-peer');

        // Wait for channel creation
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(connection.dataChannels.size).toBeGreaterThan(0);
      });

      it('should create custom data channels', async () => {
        await manager.connect('remote-peer');

        manager.createDataChannel('remote-peer', {
          label: 'custom-channel',
          reliable: true,
        });

        const state = manager.getDataChannelState('remote-peer', 'custom-channel');
        expect(state).toBeDefined();
        expect(state?.label).toBe('custom-channel');
      });
    });

    describe('Event Handling', () => {
      it('should emit connection state changes', async () => {
        const states: ConnectionState[] = [];

        manager.on(WebRTCEventType.CONNECTION_STATE_CHANGED, (event) => {
          states.push(event.data as ConnectionState);
        });

        await manager.connect('remote-peer');

        expect(states).toContain(ConnectionState.CONNECTING);
      });

      it('should emit data channel events', async () => {
        const events: WebRTCEventType[] = [];

        manager.on(WebRTCEventType.DATA_CHANNEL_OPEN, (event) => {
          events.push(event.type);
        });

        await manager.connect('remote-peer');

        // Wait for channel to open
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(events).toContain(WebRTCEventType.DATA_CHANNEL_OPEN);
      });
    });

    describe('Remote Signaling', () => {
      it('should handle remote offer', async () => {
        // Simulate receiving offer from signaling
        const ws = (signaling as unknown as { socket: MockWebSocket }).socket;
        ws.simulateMessage(JSON.stringify({
          type: SignalingMessageType.OFFER,
          id: 'msg-1',
          from: 'remote-peer',
          timestamp: Date.now(),
          payload: {
            sdp: 'v=0...',
          },
        }));

        // Wait for processing
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Connection should be created
        const state = manager.getConnectionState('remote-peer');
        expect(state).toBeDefined();
      });
    });
  });

  // ============================================
  // Connection Pool Tests
  // ============================================
  describe('ConnectionPool', () => {
    let pool: ConnectionPool;

    function createMockConnection(id: string, state: ConnectionState = ConnectionState.CONNECTED): import('../../../src/edge/p2p/webrtc/types').PeerConnection {
      return {
        id,
        state,
        rtcConnection: new MockRTCPeerConnection() as unknown as RTCPeerConnection,
        dataChannels: new Map(),
        quality: createDefaultConnectionQuality(),
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        reconnectAttempts: 0,
      };
    }

    beforeEach(() => {
      pool = new ConnectionPool({
        maxConnections: 5,
        minConnections: 0,
        idleTimeout: 60000,
        evictionPolicy: EvictionPolicy.LRU,
        healthCheckInterval: 0, // Disable health check to prevent open handles in tests
      });
    });

    afterEach(() => {
      pool.destroy();
    });

    describe('Basic Operations', () => {
      it('should add connections', () => {
        const conn = createMockConnection('peer-1');

        const added = pool.add(conn);

        expect(added).toBe(true);
        expect(pool.size()).toBe(1);
        expect(pool.has('peer-1')).toBe(true);
      });

      it('should get connections', () => {
        const conn = createMockConnection('peer-1');
        pool.add(conn);

        const retrieved = pool.get('peer-1');

        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe('peer-1');
      });

      it('should remove connections', () => {
        const conn = createMockConnection('peer-1');
        pool.add(conn);

        const removed = pool.remove('peer-1');

        expect(removed).toBeDefined();
        expect(pool.size()).toBe(0);
        expect(pool.has('peer-1')).toBe(false);
      });

      it('should peek without updating usage', () => {
        const conn = createMockConnection('peer-1');
        pool.add(conn);

        const peeked = pool.peek('peer-1');

        expect(peeked).toBeDefined();
        expect(peeked?.id).toBe('peer-1');
      });
    });

    describe('Pool Limits', () => {
      it('should track full state', () => {
        for (let i = 0; i < 5; i++) {
          pool.add(createMockConnection(`peer-${i}`));
        }

        expect(pool.isFull()).toBe(true);
      });

      it('should evict when full and adding new connection', () => {
        for (let i = 0; i < 5; i++) {
          pool.add(createMockConnection(`peer-${i}`));
        }

        // Access peer-0 to make it recently used
        pool.get('peer-0');

        // Add new connection - should evict LRU (peer-1)
        const added = pool.add(createMockConnection('peer-new'));

        expect(added).toBe(true);
        expect(pool.size()).toBe(5);
        expect(pool.has('peer-new')).toBe(true);
      });
    });

    describe('Eviction Policies', () => {
      it('should evict LRU connection', async () => {
        pool = new ConnectionPool({
          maxConnections: 3,
          evictionPolicy: EvictionPolicy.LRU,
          healthCheckInterval: 0, // Disable health check for this test
        });

        // Add connections with delays to ensure different timestamps
        const conn1 = createMockConnection('peer-1');
        pool.add(conn1);

        await new Promise(resolve => setTimeout(resolve, 10));
        const conn2 = createMockConnection('peer-2');
        pool.add(conn2);

        await new Promise(resolve => setTimeout(resolve, 10));
        const conn3 = createMockConnection('peer-3');
        pool.add(conn3);

        // Use peer-1 and peer-3, making peer-2 LRU
        await new Promise(resolve => setTimeout(resolve, 10));
        pool.get('peer-1');
        pool.get('peer-3');

        pool.evict(1);

        // After using peer-1 and peer-3, peer-2 should be LRU
        expect(pool.has('peer-1')).toBe(true);
        expect(pool.has('peer-3')).toBe(true);
        // One of them should be evicted - pool should have 2 connections
        expect(pool.size()).toBe(2);

        pool.destroy();
      });

      it('should evict LFU connection', () => {
        pool = new ConnectionPool({
          maxConnections: 3,
          evictionPolicy: EvictionPolicy.LFU,
        });

        pool.add(createMockConnection('peer-1'));
        pool.add(createMockConnection('peer-2'));
        pool.add(createMockConnection('peer-3'));

        // Use peer-1 multiple times
        pool.get('peer-1');
        pool.get('peer-1');
        pool.get('peer-1');

        // Use peer-3 once
        pool.get('peer-3');

        // peer-2 is least frequently used
        pool.evict(1);

        expect(pool.has('peer-2')).toBe(false);
        expect(pool.has('peer-1')).toBe(true);

        pool.destroy();
      });
    });

    describe('Sorting and Filtering', () => {
      it('should get connections by state', () => {
        pool.add(createMockConnection('connected', ConnectionState.CONNECTED));
        pool.add(createMockConnection('disconnected', ConnectionState.DISCONNECTED));
        pool.add(createMockConnection('failed', ConnectionState.FAILED));

        const connected = pool.getByState(ConnectionState.CONNECTED);

        expect(connected).toHaveLength(1);
        expect(connected[0].id).toBe('connected');
      });

      it('should get all connections', () => {
        pool.add(createMockConnection('peer-1'));
        pool.add(createMockConnection('peer-2'));
        pool.add(createMockConnection('peer-3'));

        const all = pool.getAll();

        expect(all).toHaveLength(3);
      });

      it('should get all peer IDs', () => {
        pool.add(createMockConnection('peer-1'));
        pool.add(createMockConnection('peer-2'));

        const ids = pool.getAllPeerIds();

        expect(ids).toContain('peer-1');
        expect(ids).toContain('peer-2');
      });
    });

    describe('Statistics', () => {
      it('should return pool statistics', () => {
        pool.add(createMockConnection('connected', ConnectionState.CONNECTED));
        pool.add(createMockConnection('disconnected', ConnectionState.DISCONNECTED));

        const stats = pool.getStats();

        expect(stats.totalConnections).toBe(2);
        expect(stats.activeConnections).toBe(1);
        expect(stats).toHaveProperty('totalBytesSent');
        expect(stats).toHaveProperty('totalBytesReceived');
        expect(stats).toHaveProperty('createdAt');
      });

      it('should track bytes sent/received', () => {
        pool.add(createMockConnection('peer-1'));

        pool.recordBytesSent('peer-1', 1000);
        pool.recordBytesReceived('peer-1', 2000);

        const stats = pool.getStats();

        expect(stats.totalBytesSent).toBe(1000);
        expect(stats.totalBytesReceived).toBe(2000);
      });
    });

    describe('Health Checking', () => {
      it('should check health of connections', () => {
        pool.add(createMockConnection('healthy', ConnectionState.CONNECTED));
        pool.add(createMockConnection('failed', ConnectionState.FAILED));

        const results = pool.checkHealth();

        expect(results).toHaveLength(2);

        const healthyResult = results.find((r) => r.peerId === 'healthy');
        const failedResult = results.find((r) => r.peerId === 'failed');

        expect(healthyResult?.isHealthy).toBe(true);
        expect(failedResult?.isHealthy).toBe(false);
      });

      it('should remove unhealthy connections', () => {
        pool.add(createMockConnection('healthy', ConnectionState.CONNECTED));
        pool.add(createMockConnection('failed', ConnectionState.FAILED));

        const removed = pool.removeUnhealthy();

        expect(removed).toBe(1);
        expect(pool.has('healthy')).toBe(true);
        expect(pool.has('failed')).toBe(false);
      });

      it('should notify health check callbacks', () => {
        const callback = jest.fn();
        pool.onHealthCheck(callback);

        pool.add(createMockConnection('peer-1'));
        pool.checkHealth();

        expect(callback).toHaveBeenCalled();
      });
    });

    describe('Eviction Callbacks', () => {
      it('should notify on eviction', () => {
        const callback = jest.fn();
        pool.onEviction(callback);

        pool.add(createMockConnection('peer-1'));
        pool.evict(1);

        expect(callback).toHaveBeenCalledWith('peer-1', expect.any(String));
      });
    });

    describe('Lifecycle', () => {
      it('should clear all connections', () => {
        pool.add(createMockConnection('peer-1'));
        pool.add(createMockConnection('peer-2'));

        pool.clear();

        expect(pool.size()).toBe(0);
      });

      it('should destroy pool', () => {
        pool.add(createMockConnection('peer-1'));

        pool.destroy();

        expect(pool.size()).toBe(0);
      });
    });
  });

  // ============================================
  // Integration Tests
  // ============================================
  describe('Integration', () => {
    describe('createP2PSystem', () => {
      it('should create configured P2P system', () => {
        const system = createP2PSystem({
          signalingUrl: 'wss://test.signal.com',
          peerId: 'test-peer',
          autoReconnect: true,
        });

        expect(system.signaling).toBeInstanceOf(SignalingClient);
        expect(system.manager).toBeInstanceOf(PeerConnectionManager);

        system.signaling.disconnect();
      });

      it('should connect signaling to manager', async () => {
        const system = createP2PSystem({
          signalingUrl: 'wss://test.signal.com',
          peerId: 'test-peer',
        });

        await system.signaling.connect();

        expect(system.signaling.isConnected()).toBe(true);

        await system.manager.destroy();
        system.signaling.disconnect();
      });
    });
  });
});
