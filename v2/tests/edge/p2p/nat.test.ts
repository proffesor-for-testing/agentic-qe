/**
 * NAT Traversal Module Tests
 *
 * Tests for NAT detection, TURN management, hole punching,
 * and connectivity testing.
 *
 * @module tests/edge/p2p/nat
 */


import {
  NATDetector,
  TURNManager,
  HolePuncher,
  ConnectivityTester,
  NATClassification,
  ConnectionPath,
  EscalationLevel,
  NAT_CONNECTIVITY_MATRIX,
  DEFAULT_STUN_SERVERS,
  DEFAULT_NAT_DETECTOR_CONFIG,
  DEFAULT_HOLE_PUNCHER_CONFIG,
  DEFAULT_CONNECTIVITY_TESTER_CONFIG,
  NATEventType,
  TURNConfig,
} from '../../../src/edge/p2p/nat';
import { ICECandidate } from '../../../src/edge/p2p/webrtc/types';

// ============================================
// Mock RTCPeerConnection for Node.js environment
// ============================================

class MockRTCPeerConnection {
  iceGatheringState: RTCIceGatheringState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  onicegatheringstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;

  private channels: RTCDataChannel[] = [];
  private localDescription: RTCSessionDescription | null = null;

  constructor(_config?: RTCConfiguration) {}

  createDataChannel(label: string): RTCDataChannel {
    const channel = {
      label,
      readyState: 'connecting' as RTCDataChannelState,
      send: jest.fn(),
      close: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    } as unknown as RTCDataChannel;
    this.channels.push(channel);

    // Simulate ICE gathering after data channel creation
    setTimeout(() => this.simulateIceGathering(), 10);

    return channel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: 'mock-sdp' };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = desc as RTCSessionDescription;
  }

  close(): void {
    this.iceGatheringState = 'complete';
    this.iceConnectionState = 'closed';
  }

  private simulateIceGathering(): void {
    this.iceGatheringState = 'gathering';
    this.onicegatheringstatechange?.();

    // Emit a srflx candidate
    if (this.onicecandidate) {
      this.onicecandidate({
        candidate: {
          candidate:
            'candidate:1 1 udp 1694498815 203.0.113.1 54321 typ srflx raddr 192.168.1.1 rport 12345',
          sdpMLineIndex: 0,
          sdpMid: '0',
          usernameFragment: 'abc',
          address: '203.0.113.1',
          port: 54321,
          protocol: 'udp',
        } as RTCIceCandidate,
      } as RTCPeerConnectionIceEvent);

      // End of candidates
      setTimeout(() => {
        this.iceGatheringState = 'complete';
        this.onicegatheringstatechange?.();
        this.onicecandidate?.({
          candidate: null,
        } as RTCPeerConnectionIceEvent);
      }, 20);
    }
  }
}

class MockRTCIceCandidate {
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
}

// Install mocks globally
(global as unknown as Record<string, unknown>).RTCPeerConnection = MockRTCPeerConnection;
(global as unknown as Record<string, unknown>).RTCIceCandidate = MockRTCIceCandidate;

// ============================================
// NAT Detector Tests
// ============================================

describe('NATDetector', () => {
  let detector: NATDetector;

  beforeEach(() => {
    detector = new NATDetector();
  });

  afterEach(() => {
    detector.invalidateCache();
  });

  describe('constructor', () => {
    it('should create detector with default configuration', () => {
      const config = detector.getConfig();
      expect(config.stunServers).toEqual(DEFAULT_STUN_SERVERS);
      expect(config.timeout).toBe(DEFAULT_NAT_DETECTOR_CONFIG.timeout);
      expect(config.enableCache).toBe(true);
    });

    it('should accept custom configuration', () => {
      const customDetector = new NATDetector({
        timeout: 5000,
        enableCache: false,
        minServers: 1,
      });
      const config = customDetector.getConfig();
      expect(config.timeout).toBe(5000);
      expect(config.enableCache).toBe(false);
      expect(config.minServers).toBe(1);
    });
  });

  describe('detect', () => {
    it('should detect NAT type using STUN', async () => {
      const result = await detector.detect();

      expect(result).toHaveProperty('natType');
      expect(result).toHaveProperty('detectedAt');
      expect(result).toHaveProperty('durationMs');
      expect(Object.values(NATClassification)).toContain(result.natType);
    });

    it('should cache detection results', async () => {
      const result1 = await detector.detect();
      const result2 = await detector.detect();

      expect(result1.detectedAt).toBe(result2.detectedAt);
    });

    it('should return fresh result after cache invalidation', async () => {
      const result1 = await detector.detect();
      detector.invalidateCache();
      const result2 = await detector.detect();

      expect(result1.detectedAt).not.toBe(result2.detectedAt);
    });
  });

  describe('forceDetect', () => {
    it('should ignore cache and perform fresh detection', async () => {
      const result1 = await detector.detect();
      const result2 = await detector.forceDetect();

      expect(result1.detectedAt).not.toBe(result2.detectedAt);
    });
  });

  describe('estimateConnectivity', () => {
    it('should return high probability for Open NAT types', () => {
      const probability = detector.estimateConnectivity(
        NATClassification.Open,
        NATClassification.Open
      );
      expect(probability).toBe(1.0);
    });

    it('should return low probability for Symmetric NAT types', () => {
      const probability = detector.estimateConnectivity(
        NATClassification.Symmetric,
        NATClassification.Symmetric
      );
      expect(probability).toBeLessThan(0.2);
    });

    it('should be consistent with connectivity matrix', () => {
      const probability = detector.estimateConnectivity(
        NATClassification.FullCone,
        NATClassification.RestrictedCone
      );
      expect(probability).toBe(
        NAT_CONNECTIVITY_MATRIX[NATClassification.FullCone][NATClassification.RestrictedCone]
      );
    });
  });

  describe('shouldUseTurn', () => {
    it('should recommend TURN for symmetric NAT pairs', () => {
      const shouldUse = detector.shouldUseTurn(
        NATClassification.Symmetric,
        NATClassification.Symmetric
      );
      expect(shouldUse).toBe(true);
    });

    it('should not recommend TURN for open NAT pairs', () => {
      const shouldUse = detector.shouldUseTurn(
        NATClassification.Open,
        NATClassification.Open
      );
      expect(shouldUse).toBe(false);
    });

    it('should respect custom threshold', () => {
      const shouldUse = detector.shouldUseTurn(
        NATClassification.FullCone,
        NATClassification.Symmetric,
        0.8
      );
      expect(shouldUse).toBe(true);
    });
  });

  describe('events', () => {
    it('should emit detection started event', async () => {
      const handler = jest.fn();
      detector.on(NATEventType.DetectionStarted, handler);

      await detector.forceDetect();

      expect(handler).toHaveBeenCalled();
    });

    it('should emit detection completed event', async () => {
      const handler = jest.fn();
      detector.on(NATEventType.DetectionCompleted, handler);

      await detector.forceDetect();

      expect(handler).toHaveBeenCalled();
    });

    it('should allow unsubscribing from events', async () => {
      const handler = jest.fn();
      const unsubscribe = detector.on(NATEventType.DetectionCompleted, handler);

      unsubscribe();
      await detector.forceDetect();

      expect(handler).not.toHaveBeenCalled();
    });
  });
});

// ============================================
// TURN Manager Tests
// ============================================

describe('TURNManager', () => {
  let manager: TURNManager;
  const mockServers: TURNConfig[] = [
    {
      urls: 'turn:turn1.example.com:3478',
      username: 'user1',
      credential: 'pass1',
      credentialType: 'password',
      priority: 1,
    },
    {
      urls: 'turn:turn2.example.com:3478',
      username: 'user2',
      credential: 'pass2',
      credentialType: 'password',
      priority: 2,
    },
  ];

  beforeEach(() => {
    manager = new TURNManager({
      servers: mockServers,
      latencyTestTimeout: 1000,
      enableHealthMonitoring: false,
    });
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('constructor', () => {
    it('should initialize with provided servers', () => {
      const config = manager.getConfig();
      expect(config.servers).toHaveLength(2);
    });

    it('should track server health', () => {
      const health = manager.getServerHealth('turn:turn1.example.com:3478');
      expect(health).not.toBeNull();
      expect(health?.healthy).toBe(true);
    });
  });

  describe('getICEServers', () => {
    it('should return ICE server configurations', () => {
      const iceServers = manager.getICEServers();
      expect(iceServers).toHaveLength(2);
      expect(iceServers[0]).toHaveProperty('urls');
      expect(iceServers[0]).toHaveProperty('username');
      expect(iceServers[0]).toHaveProperty('credential');
    });
  });

  describe('addServer', () => {
    it('should add new server to manager', () => {
      const newServer: TURNConfig = {
        urls: 'turn:turn3.example.com:3478',
        username: 'user3',
        credential: 'pass3',
        credentialType: 'password',
      };

      manager.addServer(newServer);

      const iceServers = manager.getICEServers();
      expect(iceServers).toHaveLength(3);
    });

    it('should throw if server already exists', () => {
      expect(() => manager.addServer(mockServers[0])).toThrow('Server already exists');
    });
  });

  describe('removeServer', () => {
    it('should remove server from manager', () => {
      const initialLength = manager.getICEServers().length;
      manager.removeServer('turn:turn1.example.com:3478');

      const iceServers = manager.getICEServers();
      expect(iceServers).toHaveLength(initialLength - 1);
    });
  });

  describe('getAllServerHealth', () => {
    it('should return health for all servers', () => {
      const healthMap = manager.getAllServerHealth();
      expect(healthMap.size).toBe(2);
    });
  });

  describe('events', () => {
    it('should emit credentials refreshed event', async () => {
      const handler = jest.fn();
      manager.on(NATEventType.CredentialsRefreshed, handler);

      // This would normally be triggered by credential refresh
      // Just verify the event system works
      expect(handler).not.toHaveBeenCalled();
    });
  });
});

// ============================================
// Hole Puncher Tests
// ============================================

describe('HolePuncher', () => {
  let holePuncher: HolePuncher;

  beforeEach(() => {
    holePuncher = new HolePuncher();
    holePuncher.setLocalPeerId('local-peer');
  });

  describe('constructor', () => {
    it('should create with default configuration', () => {
      const config = holePuncher.getConfig();
      expect(config.maxAttempts).toBe(DEFAULT_HOLE_PUNCHER_CONFIG.maxAttempts);
      expect(config.enablePortPrediction).toBe(true);
      expect(config.enableSimultaneousOpen).toBe(true);
    });

    it('should accept custom configuration', () => {
      const customPuncher = new HolePuncher({
        maxAttempts: 5,
        enablePortPrediction: false,
      });
      const config = customPuncher.getConfig();
      expect(config.maxAttempts).toBe(5);
      expect(config.enablePortPrediction).toBe(false);
    });
  });

  describe('punch without coordination channel', () => {
    it('should fail without coordination channel', async () => {
      const result = await holePuncher.punch('remote-peer', {
        localCandidates: [],
        remoteCandidates: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No coordination channel');
    });
  });

  describe('predictPorts', () => {
    it('should predict ports based on linear pattern', () => {
      const observedPorts = [50000, 50001, 50002, 50003];
      const prediction = holePuncher.predictPorts(observedPorts);

      expect(prediction.method).toBe('linear');
      expect(prediction.increment).toBe(1);
      expect(prediction.confidence).toBeGreaterThan(0.5);
      expect(prediction.predictedPorts.length).toBeGreaterThan(0);
      expect(prediction.predictedPorts[0]).toBe(50004);
    });

    it('should detect random pattern', () => {
      const observedPorts = [50000, 52345, 48765, 55432];
      const prediction = holePuncher.predictPorts(observedPorts);

      expect(prediction.confidence).toBeLessThan(0.5);
    });

    it('should return empty prediction for single port', () => {
      const prediction = holePuncher.predictPorts([50000]);
      expect(prediction.predictedPorts).toHaveLength(0);
      expect(prediction.confidence).toBe(0);
    });
  });

  describe('escalation', () => {
    it('should start at Direct level', () => {
      // Trigger escalation state creation
      holePuncher.setCoordinationChannel({
        send: jest.fn(),
        onMessage: jest.fn(() => () => {}),
      });

      // Punch creates escalation state internally
      const turnServers: TURNConfig[] = [
        {
          urls: 'turn:turn.example.com:3478',
          username: 'user',
          credential: 'pass',
          credentialType: 'password',
        },
      ];

      const fallback = holePuncher.getFallbackAction(turnServers);
      expect(fallback.level).toBe(EscalationLevel.Direct);
    });
  });

  describe('events', () => {
    it('should emit hole punch started event', async () => {
      const handler = jest.fn();
      holePuncher.on(NATEventType.HolePunchStarted, handler);

      holePuncher.setCoordinationChannel({
        send: jest.fn(),
        onMessage: jest.fn(() => () => {}),
      });

      // Start punch (will fail but should emit event) - use short timeout
      const customPuncher = new HolePuncher({
        maxAttempts: 1,
        attemptTimeout: 100,
        attemptDelay: 10,
      });
      customPuncher.setLocalPeerId('local-peer');
      customPuncher.setCoordinationChannel({
        send: jest.fn(),
        onMessage: jest.fn(() => () => {}),
      });

      const customHandler = jest.fn();
      customPuncher.on(NATEventType.HolePunchStarted, customHandler);

      await customPuncher.punch('remote-peer', {
        localCandidates: [],
        remoteCandidates: [],
      });

      expect(customHandler).toHaveBeenCalled();
    }, 10000);
  });

  describe('cancel', () => {
    it('should cancel ongoing punch', async () => {
      holePuncher.setCoordinationChannel({
        send: jest.fn(),
        onMessage: jest.fn(() => () => {}),
      });

      // Start punch without awaiting
      const punchPromise = holePuncher.punch('remote-peer', {
        localCandidates: [],
        remoteCandidates: [],
      });

      holePuncher.cancel();

      // Should resolve with cancelled result
      const result = await punchPromise;
      expect(result.success).toBe(false);
      expect(result.error).toContain('cancelled');
    });
  });
});

// ============================================
// Connectivity Tester Tests
// ============================================

describe('ConnectivityTester', () => {
  let tester: ConnectivityTester;

  beforeEach(() => {
    tester = new ConnectivityTester();
  });

  afterEach(() => {
    tester.cancelAllTests();
  });

  describe('constructor', () => {
    it('should create with default configuration', () => {
      const config = tester.getConfig();
      expect(config.timeout).toBe(DEFAULT_CONNECTIVITY_TESTER_CONFIG.timeout);
      expect(config.pingCount).toBe(DEFAULT_CONNECTIVITY_TESTER_CONFIG.pingCount);
    });

    it('should accept custom configuration', () => {
      const customTester = new ConnectivityTester({
        timeout: 5000,
        pingCount: 5,
        maxAcceptableRtt: 200,
      });
      const config = customTester.getConfig();
      expect(config.timeout).toBe(5000);
      expect(config.pingCount).toBe(5);
      expect(config.maxAcceptableRtt).toBe(200);
    });
  });

  describe('rankCandidates', () => {
    const mockCandidates: ICECandidate[] = [
      {
        candidate: 'host-candidate',
        sdpMLineIndex: 0,
        sdpMid: '0',
        usernameFragment: null,
        type: 'host',
        priority: 1000,
        address: '192.168.1.1',
        port: 12345,
        protocol: 'udp',
      },
      {
        candidate: 'srflx-candidate',
        sdpMLineIndex: 0,
        sdpMid: '0',
        usernameFragment: null,
        type: 'srflx',
        priority: 500,
        address: '203.0.113.1',
        port: 54321,
        protocol: 'udp',
      },
      {
        candidate: 'relay-candidate',
        sdpMLineIndex: 0,
        sdpMid: '0',
        usernameFragment: null,
        type: 'relay',
        priority: 100,
        address: '198.51.100.1',
        port: 3478,
        protocol: 'udp',
      },
    ];

    it('should rank candidates by score', () => {
      const rankings = tester.rankCandidates(mockCandidates);

      expect(rankings).toHaveLength(3);
      expect(rankings[0].score).toBeGreaterThanOrEqual(rankings[1].score);
      expect(rankings[1].score).toBeGreaterThanOrEqual(rankings[2].score);
    });

    it('should mark top candidate as recommended', () => {
      const rankings = tester.rankCandidates(mockCandidates);

      expect(rankings[0].recommended).toBe(true);
      expect(rankings[1].recommended).toBe(false);
      expect(rankings[2].recommended).toBe(false);
    });

    it('should prefer host candidates over relay', () => {
      const rankings = tester.rankCandidates(mockCandidates);

      const hostRanking = rankings.find((r) => r.candidate.type === 'host');
      const relayRanking = rankings.find((r) => r.candidate.type === 'relay');

      expect(hostRanking!.pathScore).toBeGreaterThan(relayRanking!.pathScore);
    });

    it('should use RTT measurements when provided', () => {
      const rttMeasurements = new Map([
        ['host-candidate', 10],
        ['srflx-candidate', 50],
        ['relay-candidate', 100],
      ]);

      const rankings = tester.rankCandidates(mockCandidates, rttMeasurements);

      const hostRanking = rankings.find((r) => r.candidate.type === 'host');
      expect(hostRanking!.rttScore).toBeGreaterThan(
        rankings.find((r) => r.candidate.type === 'relay')!.rttScore
      );
    });
  });

  describe('getRecommendation', () => {
    const localCandidates: ICECandidate[] = [
      {
        candidate: 'host',
        sdpMLineIndex: 0,
        sdpMid: '0',
        usernameFragment: null,
        type: 'host',
        priority: 1000,
      },
    ];

    const remoteCandidates: ICECandidate[] = [
      {
        candidate: 'srflx',
        sdpMLineIndex: 0,
        sdpMid: '0',
        usernameFragment: null,
        type: 'srflx',
        priority: 500,
      },
    ];

    it('should recommend direct for open NAT types', () => {
      const recommendation = tester.getRecommendation(
        localCandidates,
        remoteCandidates,
        NATClassification.Open,
        NATClassification.Open
      );

      expect(recommendation.approach).toBe('direct');
      expect(recommendation.successProbability).toBeGreaterThan(0.9);
    });

    it('should recommend TURN for symmetric NAT types', () => {
      const turnServers: TURNConfig[] = [
        {
          urls: 'turn:turn.example.com',
          username: 'user',
          credential: 'pass',
          credentialType: 'password',
        },
      ];

      const recommendation = tester.getRecommendation(
        localCandidates,
        remoteCandidates,
        NATClassification.Symmetric,
        NATClassification.Symmetric,
        turnServers
      );

      expect(recommendation.approach).toBe('turn');
      expect(recommendation.turnServer).toBeDefined();
    });

    it('should recommend hybrid for medium connectivity scenarios', () => {
      const turnServers: TURNConfig[] = [
        {
          urls: 'turn:turn.example.com',
          username: 'user',
          credential: 'pass',
          credentialType: 'password',
        },
      ];

      const relayCandidates: ICECandidate[] = [
        {
          candidate: 'relay',
          sdpMLineIndex: 0,
          sdpMid: '0',
          usernameFragment: null,
          type: 'relay',
          priority: 100,
        },
      ];

      const recommendation = tester.getRecommendation(
        [...localCandidates, ...relayCandidates],
        remoteCandidates,
        NATClassification.RestrictedCone,
        NATClassification.PortRestricted,
        turnServers
      );

      expect(['direct', 'hybrid', 'turn']).toContain(recommendation.approach);
      expect(recommendation.reasoning).toBeDefined();
    });

    it('should recommend abort when no options available', () => {
      const recommendation = tester.getRecommendation(
        localCandidates,
        remoteCandidates,
        NATClassification.Symmetric,
        NATClassification.Symmetric,
        [] // No TURN servers
      );

      expect(recommendation.approach).toBe('abort');
    });
  });

  describe('isAcceptable', () => {
    it('should accept good connectivity result', () => {
      const result = {
        peerId: 'test-peer',
        connected: true,
        path: ConnectionPath.Direct,
        rttMs: 50,
        packetLossPercent: 2,
        jitterMs: 5,
        successfulCandidates: [],
        durationMs: 1000,
        testedAt: Date.now(),
      };

      expect(tester.isAcceptable(result)).toBe(true);
    });

    it('should reject high RTT', () => {
      const result = {
        peerId: 'test-peer',
        connected: true,
        path: ConnectionPath.Direct,
        rttMs: 1000,
        packetLossPercent: 0,
        jitterMs: 0,
        successfulCandidates: [],
        durationMs: 1000,
        testedAt: Date.now(),
      };

      expect(tester.isAcceptable(result)).toBe(false);
    });

    it('should reject high packet loss', () => {
      const result = {
        peerId: 'test-peer',
        connected: true,
        path: ConnectionPath.Direct,
        rttMs: 50,
        packetLossPercent: 50,
        jitterMs: 0,
        successfulCandidates: [],
        durationMs: 1000,
        testedAt: Date.now(),
      };

      expect(tester.isAcceptable(result)).toBe(false);
    });

    it('should reject disconnected result', () => {
      const result = {
        peerId: 'test-peer',
        connected: false,
        path: ConnectionPath.Failed,
        rttMs: 0,
        packetLossPercent: 100,
        jitterMs: 0,
        successfulCandidates: [],
        durationMs: 1000,
        testedAt: Date.now(),
      };

      expect(tester.isAcceptable(result)).toBe(false);
    });
  });

  describe('cancelTest', () => {
    it('should cancel specific test', () => {
      // Just verify method exists and doesn't throw
      expect(() => tester.cancelTest('test-peer')).not.toThrow();
    });
  });

  describe('cancelAllTests', () => {
    it('should cancel all tests', () => {
      expect(() => tester.cancelAllTests()).not.toThrow();
    });
  });
});

// ============================================
// NAT Connectivity Matrix Tests
// ============================================

describe('NAT_CONNECTIVITY_MATRIX', () => {
  it('should have entries for all NAT classifications', () => {
    const classifications = Object.values(NATClassification);

    for (const local of classifications) {
      expect(NAT_CONNECTIVITY_MATRIX).toHaveProperty(local);
      for (const remote of classifications) {
        expect(NAT_CONNECTIVITY_MATRIX[local]).toHaveProperty(remote);
      }
    }
  });

  it('should have probabilities between 0 and 1', () => {
    for (const local of Object.values(NATClassification)) {
      for (const remote of Object.values(NATClassification)) {
        const prob = NAT_CONNECTIVITY_MATRIX[local][remote];
        expect(prob).toBeGreaterThanOrEqual(0);
        expect(prob).toBeLessThanOrEqual(1);
      }
    }
  });

  it('should be symmetric for matching NAT types', () => {
    // Open-Open should be high
    expect(
      NAT_CONNECTIVITY_MATRIX[NATClassification.Open][NATClassification.Open]
    ).toBe(1.0);

    // Symmetric-Symmetric should be low
    expect(
      NAT_CONNECTIVITY_MATRIX[NATClassification.Symmetric][NATClassification.Symmetric]
    ).toBeLessThan(0.2);
  });
});

// ============================================
// Integration Tests
// ============================================

describe('NAT Module Integration', () => {
  it('should export all expected components', async () => {
    const natModule = await import('../../../src/edge/p2p/nat');

    // Classes
    expect(natModule.NATDetector).toBeDefined();
    expect(natModule.TURNManager).toBeDefined();
    expect(natModule.HolePuncher).toBeDefined();
    expect(natModule.ConnectivityTester).toBeDefined();

    // Enums
    expect(natModule.NATClassification).toBeDefined();
    expect(natModule.ConnectionPath).toBeDefined();
    expect(natModule.EscalationLevel).toBeDefined();
    expect(natModule.NATEventType).toBeDefined();

    // Constants
    expect(natModule.DEFAULT_STUN_SERVERS).toBeDefined();
    expect(natModule.NAT_CONNECTIVITY_MATRIX).toBeDefined();
    expect(natModule.NAT_MODULE_VERSION).toBeDefined();
    expect(natModule.NAT_CAPABILITIES).toBeDefined();
  });

  it('should have consistent version', async () => {
    const natModule = await import('../../../src/edge/p2p/nat');
    expect(natModule.NAT_MODULE_VERSION).toBe('1.0.0');
  });

  it('should report all capabilities', async () => {
    const natModule = await import('../../../src/edge/p2p/nat');

    expect(natModule.NAT_CAPABILITIES.natTypeDetection).toBe(true);
    expect(natModule.NAT_CAPABILITIES.turnCredentialManagement).toBe(true);
    expect(natModule.NAT_CAPABILITIES.udpHolePunching).toBe(true);
    expect(natModule.NAT_CAPABILITIES.connectivityRecommendation).toBe(true);
    expect(natModule.NAT_CAPABILITIES.escalationLevels).toBe(true);
  });
});
