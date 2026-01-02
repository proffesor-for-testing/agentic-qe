/**
 * P2P Module for @ruvector/edge
 *
 * Provides peer-to-peer communication infrastructure for browser agents.
 * Built on Ed25519 cryptographic identities for secure agent communication.
 *
 * @module edge/p2p
 * @version 1.0.0
 */

// Cryptographic Identity System
export * from './crypto';

/**
 * P2P Module version
 */
export const P2P_VERSION = '1.0.0';

/**
 * P2P Module phase
 */
export const P2P_PHASE = 'P2-Foundation';
