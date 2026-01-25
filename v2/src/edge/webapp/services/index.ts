/**
 * Service Exports
 *
 * @module edge/webapp/services
 */

// Original P2P Service (uses Node.js P2P modules)
export {
  P2PServiceImpl,
  getP2PService,
  resetP2PService,
} from './P2PService';

// Browser-compatible P2P Adapter (pure browser APIs)
export {
  P2PAdapter,
  BrowserCrypto,
  BrowserSigner,
  BrowserWebRTCManager,
  BrowserSignalingClient,
  // Types
  type P2PAdapterConfig,
  type BrowserKeyPair,
  type BrowserAgentIdentity,
  type BrowserSignedMessage,
  type BrowserPeerInfo,
  type DataChannelMessage,
  type ICECandidateInfo,
  type SignalingMessage,
  type SignalingMessageType,
  type PeerConnectionState,
  type P2PAdapterEventType,
  type P2PAdapterEvent,
  type P2PAdapterEventHandler,
  type VerificationResult,
} from './P2PAdapter';
