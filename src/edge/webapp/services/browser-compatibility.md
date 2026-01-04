# Browser Compatibility Guide for P2P Services

This document details the browser compatibility considerations, required polyfills, and
implementation notes for the P2P adapter layer in the webapp.

## Overview

The P2PAdapter (`P2PAdapter.ts`) provides a browser-compatible wrapper for P2P services.
It uses native browser APIs wherever possible and documents known compatibility issues.

## Browser API Requirements

### Core APIs Used

| API | Purpose | Browser Support |
|-----|---------|-----------------|
| WebRTC (RTCPeerConnection) | Peer-to-peer connections | Chrome 56+, Firefox 44+, Safari 11+, Edge 79+ |
| RTCDataChannel | Data transmission | Chrome 56+, Firefox 44+, Safari 11+, Edge 79+ |
| WebSocket | Signaling transport | All modern browsers |
| SubtleCrypto | Cryptographic operations | All modern browsers |
| crypto.getRandomValues | Secure random generation | All modern browsers |
| IndexedDB | Key storage | All modern browsers |
| TextEncoder/TextDecoder | String encoding | All modern browsers |
| btoa/atob | Base64 encoding | All modern browsers |

### Minimum Browser Versions

- **Chrome/Chromium**: 56+
- **Firefox**: 44+
- **Safari**: 11+
- **Edge**: 79+ (Chromium-based)

## Cryptography Compatibility

### Ed25519 Support

**Issue**: Web Crypto API does not natively support Ed25519 in most browsers.

**Current Solution**: The P2PAdapter uses HMAC-SHA256 as a fallback for signing and
verification. This provides:

- Message authentication
- Replay protection (via nonces)
- Deterministic signatures

**Limitations**:
- Not true Ed25519 signatures
- Not interoperable with standard Ed25519 implementations

**Production Recommendation**: For production use with true Ed25519 support, consider:

1. **tweetnacl** (recommended)
   ```bash
   npm install tweetnacl
   ```
   - Pure JavaScript implementation
   - 32KB minified
   - Well-audited and widely used

2. **@noble/ed25519**
   ```bash
   npm install @noble/ed25519
   ```
   - Modern TypeScript library
   - Smaller bundle size (~5KB)
   - Audited implementation

### SubtleCrypto Operations

The following SubtleCrypto operations are used and fully supported:

| Operation | Algorithm | Purpose |
|-----------|-----------|---------|
| digest | SHA-256, SHA-512 | Hashing |
| encrypt/decrypt | AES-GCM | Private key encryption |
| deriveKey | PBKDF2 | Password-based key derivation |
| importKey | HMAC | Signature key import |
| sign/verify | HMAC-SHA256 | Message signing (fallback) |

### Key Derivation

Password-based encryption uses:
- **Algorithm**: PBKDF2
- **Hash**: SHA-256
- **Iterations**: 100,000 (configurable)
- **Salt**: 32 random bytes
- **Output**: AES-256-GCM key

## WebRTC Compatibility

### ICE Server Configuration

Default STUN servers:
```javascript
[
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]
```

For production, add TURN servers for NAT traversal:
```javascript
{
  urls: 'turn:turn.example.com:3478',
  username: 'user',
  credential: 'password',
}
```

### Data Channel Configuration

Two default channels are created:

1. **reliable**: Ordered, guaranteed delivery
   ```javascript
   { label: 'reliable', ordered: true }
   ```

2. **unreliable**: Unordered, best-effort (for real-time data)
   ```javascript
   { label: 'unreliable', ordered: false, maxRetransmits: 0 }
   ```

### Known WebRTC Issues

1. **Safari ICE Gathering**
   - Safari may take longer for ICE gathering
   - Increase gathering timeout if needed

2. **Firefox Unified Plan**
   - Firefox uses Unified Plan by default
   - SDP format may differ slightly from Chrome

3. **Mobile Browsers**
   - WebRTC works on iOS Safari 11+ and Chrome for Android
   - Some devices may have limited data channel throughput

## No Polyfills Required

The P2PAdapter is designed to work without polyfills in modern browsers. However,
for legacy browser support, consider:

### Optional Polyfills

| Polyfill | When Needed | Package |
|----------|-------------|---------|
| webrtc-adapter | Legacy browser WebRTC compatibility | `webrtc-adapter` |
| webcrypto-shim | Very old browsers | `webcrypto-shim` |
| text-encoding | IE11 support | `text-encoding` |

**Note**: IE11 is not supported due to lack of WebRTC.

## Node.js API Differences

The following Node.js APIs from the P2P modules are replaced with browser alternatives:

| Node.js API | Browser Alternative | Notes |
|-------------|---------------------|-------|
| `Buffer` | `Uint8Array` | No conversion needed |
| `crypto.randomBytes()` | `crypto.getRandomValues()` | Same entropy quality |
| `process.env` | Not used | Config passed explicitly |
| `fs` | `IndexedDB` | For key storage |
| `net`/`dgp` | `WebRTC` | P2P communication |

## Bundle Size Considerations

The P2PAdapter is designed to be lightweight:

| Component | Approximate Size |
|-----------|------------------|
| P2PAdapter core | ~15KB minified |
| BrowserCrypto | ~5KB minified |
| BrowserWebRTCManager | ~8KB minified |
| BrowserSignalingClient | ~4KB minified |

**With Ed25519 library**:
- tweetnacl: +32KB
- @noble/ed25519: +5KB

## Security Considerations

### Secure Context Required

The following APIs require HTTPS (secure context):
- `crypto.subtle`
- `crypto.getRandomValues`

**Development**: Works on `localhost` without HTTPS.

### Content Security Policy

If using CSP, ensure the following are allowed:
```
connect-src wss://signaling-server.example.com;
```

### Cross-Origin Considerations

WebRTC and WebSocket connections are not subject to CORS.
Signaling servers should implement proper authentication.

## Integration Examples

### Basic Usage

```typescript
import { P2PAdapter } from './services/P2PAdapter';

const adapter = new P2PAdapter({
  displayName: 'My Browser Agent',
  signalingUrl: 'wss://signaling.example.com',
});

await adapter.initialize();
```

### Manual SDP Exchange (No Signaling Server)

```typescript
const adapter = new P2PAdapter();
await adapter.initialize();

// Caller side
const offer = await adapter.createOffer('remote-peer');
// ... send offer to peer via your own channel ...

// Callee side (on the other browser)
const answer = await adapter.handleOffer('caller-id', receivedOffer);
// ... send answer back to caller ...

// Caller receives answer
await adapter.handleAnswer('remote-peer', receivedAnswer);

// Exchange ICE candidates via your own channel
adapter.on('ice:candidate', (event) => {
  // Send event.data to remote peer
});
```

### With Signaling Server

```typescript
const adapter = new P2PAdapter({
  signalingUrl: 'wss://signaling.example.com',
});

await adapter.initialize();
await adapter.connectToPeer('remote-peer-id');

// Connection and ICE exchange handled automatically
adapter.on('connection:state-changed', (event) => {
  if (event.data === 'connected') {
    adapter.send('remote-peer-id', 'reliable', {
      type: 'hello',
      data: { message: 'Connected!' },
      timestamp: Date.now(),
    });
  }
});
```

## Testing

### Browser Testing

Run the webapp in development mode:
```bash
npm run webapp:dev
```

### Playwright E2E Tests

```bash
npm run test:e2e:webapp
```

## Troubleshooting

### Common Issues

1. **"Secure context required"**
   - Ensure you're running on HTTPS or localhost

2. **"ICE connection failed"**
   - Check ICE server configuration
   - Ensure TURN server is available for symmetric NAT

3. **"Data channel not open"**
   - Wait for 'connection:state-changed' with 'connected' state
   - Check for connection errors

4. **"Invalid signature"**
   - Ensure both parties use the same signing implementation
   - Check for clock skew (affects timestamp validation)

### Debug Logging

Enable verbose logging in browser console:
```javascript
localStorage.setItem('P2P_DEBUG', 'true');
```

## Version History

| Version | Changes |
|---------|---------|
| 1.0.0 | Initial browser-compatible P2P adapter |

## References

- [WebRTC API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [SubtleCrypto - MDN](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto)
- [WebSocket API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [tweetnacl.js](https://github.com/dchest/tweetnacl-js)
- [@noble/ed25519](https://github.com/paulmillr/noble-ed25519)
