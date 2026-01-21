# Browser P2P Security Review

**Review Date:** 2026-01-03
**Scope:** P2P services for browser-based execution
**Components Reviewed:**
- `/workspaces/agentic-qe/src/edge/p2p/crypto/` - Ed25519 identity and key management
- `/workspaces/agentic-qe/src/edge/p2p/webrtc/` - WebRTC transport layer
- `/workspaces/agentic-qe/src/edge/webapp/` - Web application integration

---

## Executive Summary

This security review covers the P2P implementation for browser environments. The current implementation has a solid foundation with password-based key encryption using PBKDF2 and AES-GCM. However, several security improvements are recommended before production deployment, particularly around key storage, peer verification, and XSS prevention.

**Risk Rating:** MEDIUM - Suitable for development/testing; requires hardening for production.

---

## 1. Key Storage Security

### Current Implementation

The `KeyManager` class (`/workspaces/agentic-qe/src/edge/p2p/crypto/KeyManager.ts`) stores Ed25519 private keys in IndexedDB with the following protections:

- **Encryption at Rest:** Private keys are encrypted with AES-256-GCM before storage
- **Key Derivation:** PBKDF2 with SHA-256, 100,000 iterations by default
- **Random Salt:** 32-byte random salt per identity
- **Random IV:** 12-byte random IV for each encryption operation

```typescript
// Current storage format (from types.ts)
interface EncryptedKeyPair {
  publicKey: string;              // Base64-encoded public key (unencrypted)
  encryptedPrivateKey: string;    // AES-GCM encrypted private key
  salt: string;                   // Base64-encoded salt
  iv: string;                     // Base64-encoded IV
  kdf: 'PBKDF2';
  iterations: number;
}
```

### Security Assessment

| Aspect | Status | Notes |
|--------|--------|-------|
| Encryption algorithm | GOOD | AES-256-GCM is appropriate |
| Key derivation | GOOD | PBKDF2 with 100k iterations meets current OWASP recommendations |
| Salt handling | GOOD | Per-identity random salt |
| IV uniqueness | GOOD | Random IV per operation |
| Memory protection | WARNING | Unlocked keys cached in Map without timeout by default |
| IndexedDB access | WARNING | No additional access controls beyond origin |

### Recommendations

#### R1.1: Enable Auto-Lock by Default (MEDIUM PRIORITY)

Currently `autoLockTimeout` defaults to 0 (disabled). Unlocked keys remain in memory indefinitely.

```typescript
// Current (KeyManager.ts:31-35)
const DEFAULT_CONFIG: Required<KeyStorageConfig> = {
  dbName: 'agentic-qe-keystore',
  storeName: 'identities',
  autoLockTimeout: 0, // Disabled by default - SECURITY CONCERN
};

// RECOMMENDED: Set a reasonable default timeout
const DEFAULT_CONFIG: Required<KeyStorageConfig> = {
  dbName: 'agentic-qe-keystore',
  storeName: 'identities',
  autoLockTimeout: 300000, // 5 minutes
};
```

#### R1.2: Consider WebCrypto Non-Extractable Keys (HIGH PRIORITY)

For enhanced security, consider using WebCrypto's CryptoKey with `extractable: false`:

```typescript
// Current approach - extractable keys
const keyPair = await this.generateKeyPair();
const privateKeyData = this.base64ToArray(keyPair.privateKey);

// RECOMMENDED: Use non-extractable CryptoKey objects
const cryptoKey = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' }, // Ed25519 not yet supported in WebCrypto
  false,  // non-extractable - key cannot be exported
  ['sign', 'verify']
);
```

**Note:** WebCrypto does not yet support Ed25519 natively in all browsers. Consider:
- Using `@noble/ed25519` library with careful memory management
- Using P-256/P-384 ECDSA as a fallback with WebCrypto protection
- Implementing key wrapping for storage

#### R1.3: Clear Memory After Use (MEDIUM PRIORITY)

Explicitly clear sensitive data from memory after use:

```typescript
// Add to KeyManager.ts
private clearSensitiveData(data: Uint8Array): void {
  crypto.getRandomValues(data); // Overwrite with random data
}

// Use after decryption operations
const privateKey = this.base64ToArray(keyPair.privateKey);
try {
  // ... use key ...
} finally {
  this.clearSensitiveData(privateKey);
}
```

#### R1.4: Implement Storage Event Monitoring (LOW PRIORITY)

Monitor for storage tampering from other tabs:

```typescript
window.addEventListener('storage', (event) => {
  if (event.key?.startsWith('agentic-qe')) {
    console.warn('External storage modification detected');
    // Trigger re-verification or lock
  }
});
```

---

## 2. CORS and CSP Requirements

### WebRTC Signaling Connection

The `SignalingClient` (`/workspaces/agentic-qe/src/edge/p2p/webrtc/SignalingClient.ts`) uses WebSocket for signaling:

```typescript
// SignalingClient.ts:182-188
const url = new URL(this.config.serverUrl);
url.searchParams.set('peerId', this.config.peerId);
if (this.config.authToken) {
  url.searchParams.set('token', this.config.authToken);
}
this.socket = new WebSocket(url.toString());
```

### Required CSP Directives

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';

  connect-src
    'self'
    wss://signal.your-domain.com   /* WebSocket signaling server */
    stun:stun.l.google.com:19302   /* STUN servers */
    stun:stun1.l.google.com:19302
    turn:turn.your-domain.com      /* TURN servers if used */
  ;

  script-src
    'self'
    'wasm-unsafe-eval'             /* For WASM if used */
  ;

  style-src 'self' 'unsafe-inline'; /* For Tailwind CSS */

  worker-src 'self' blob:;          /* For Web Workers if used */
">
```

### CORS Configuration for Signaling Server

The signaling server must be configured to accept connections from webapp origins:

```javascript
// Signaling server CORS configuration
const corsOptions = {
  origin: [
    'https://your-webapp.com',
    'http://localhost:3000', // Development
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  credentials: true,
};

// WebSocket upgrade handling
wss.on('headers', (headers, request) => {
  const origin = request.headers.origin;
  if (allowedOrigins.includes(origin)) {
    headers.push(`Access-Control-Allow-Origin: ${origin}`);
  }
});
```

### Recommendations

#### R2.1: Implement Signaling Server Authentication (HIGH PRIORITY)

The current implementation passes auth token in URL query string:

```typescript
// Current approach - token in URL (visible in logs)
url.searchParams.set('token', this.config.authToken);

// RECOMMENDED: Use subprotocol or first message for auth
const socket = new WebSocket(url.toString(), ['auth-' + authToken]);

// Or authenticate in first message after connection
socket.onopen = () => {
  socket.send(JSON.stringify({ type: 'auth', token: authToken }));
};
```

#### R2.2: Use Secure WebSocket (WSS) Only (HIGH PRIORITY)

Enforce secure WebSocket connections:

```typescript
// Add validation in SignalingClient constructor
if (!config.serverUrl.startsWith('wss://')) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Insecure WebSocket connections not allowed in production');
  }
  console.warn('Using insecure WebSocket - development only');
}
```

#### R2.3: Implement CSP Report-Only Mode First (MEDIUM PRIORITY)

Deploy CSP in report-only mode before enforcement:

```html
<meta http-equiv="Content-Security-Policy-Report-Only" content="...">
```

---

## 3. WebRTC Security (DTLS/SRTP)

### Current Implementation

The `PeerConnectionManager` (`/workspaces/agentic-qe/src/edge/p2p/webrtc/PeerConnectionManager.ts`) and `ICEManager` use standard WebRTC:

```typescript
// PeerConnectionManager.ts:189-190
const rtcConfig = iceManager.getRTCConfiguration();
const rtcConnection = new RTCPeerConnection(rtcConfig);
```

### WebRTC Built-in Security

WebRTC provides mandatory security through:

1. **DTLS (Datagram Transport Layer Security):** All WebRTC data channels are encrypted with DTLS 1.2+
2. **SRTP (Secure Real-time Transport Protocol):** Media streams use SRTP with key exchange via DTLS-SRTP
3. **ICE Credential Verification:** ICE candidates include username fragments for authentication

### Security Assessment

| Feature | Browser Enforcement | Status |
|---------|---------------------|--------|
| DTLS encryption | Mandatory | GOOD - Automatic |
| Certificate fingerprint | In SDP offer/answer | GOOD - Automatic |
| Perfect Forward Secrecy | DTLS 1.2+ cipher suites | GOOD - Automatic |
| Data channel encryption | SCTP over DTLS | GOOD - Automatic |

### ICE Server Configuration

Current configuration uses public STUN servers:

```typescript
// types.ts:690-693
export const DEFAULT_ICE_SERVERS: ICEServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
```

### Recommendations

#### R3.1: Validate TURN Server Credentials (HIGH PRIORITY)

If TURN servers are used, credentials should be:
- Short-lived (generated per session)
- Using time-based HMAC authentication

```typescript
// Example TURN credential generation (server-side)
function generateTurnCredentials(userId: string): ICEServer {
  const ttl = 3600; // 1 hour
  const timestamp = Math.floor(Date.now() / 1000) + ttl;
  const username = `${timestamp}:${userId}`;
  const credential = crypto
    .createHmac('sha1', TURN_SECRET)
    .update(username)
    .digest('base64');

  return {
    urls: 'turn:turn.example.com:3478',
    username,
    credential,
    credentialType: 'password',
  };
}
```

#### R3.2: Enable ICE Transport Policy Restrictions (MEDIUM PRIORITY)

For environments requiring only relay connections (max privacy):

```typescript
// Force TURN relay only
const iceConfig: ICEManagerConfig = {
  iceServers: [...],
  iceTransportPolicy: 'relay', // Only use TURN, no direct connections
  enableTrickle: true,
};
```

#### R3.3: Monitor ICE Candidate Types (MEDIUM PRIORITY)

The current implementation detects NAT types. Add security logging:

```typescript
// Add to ICEManager.analyzeCandidate
private analyzeCandidate(candidate: ICECandidate): void {
  // Security logging for connection type visibility
  if (candidate.type === 'host' && candidate.address) {
    // Host candidate exposes local IP
    console.info('[Security] Local IP exposed in host candidate');
  }
  if (candidate.type === 'relay') {
    console.info('[Security] Using TURN relay - IP hidden');
  }
}
```

---

## 4. Peer Verification

### Current Implementation

The `Signer` class (`/workspaces/agentic-qe/src/edge/p2p/crypto/Signer.ts`) provides:

```typescript
// Identity proof for authentication
interface IdentityProof {
  agentId: string;
  publicKey: string;
  challenge: string;
  signature: string;
  timestamp: string;
  expiresIn: number;
}
```

### Challenge-Response Protocol

```typescript
// Signer.ts:191-214
static async createIdentityProof(
  keyPair: KeyPair,
  identity: AgentIdentity,
  challenge: string,
  expiresIn: number = DEFAULT_PROOF_EXPIRY_MS
): Promise<IdentityProof>
```

### Security Assessment

| Aspect | Status | Notes |
|--------|--------|-------|
| Challenge uniqueness | GOOD | Uses `crypto.getRandomValues` |
| Proof expiration | GOOD | Default 5 minutes, configurable |
| Signature binding | GOOD | Includes agentId, challenge, timestamp |
| Replay prevention | PARTIAL | Nonce exists but no server-side tracking |

### Recommendations

#### R4.1: Implement Mutual Authentication on Connection (HIGH PRIORITY)

Add challenge-response to WebRTC connection establishment:

```typescript
// Add to PeerConnectionManager.connect()
async connect(peerId: PeerId, options: ConnectOptions = {}): Promise<PeerConnection> {
  // ... existing connection setup ...

  // After data channel opens, perform mutual authentication
  const challengeChannel = connection.dataChannels.get('reliable');

  // 1. Generate challenge for remote peer
  const ourChallenge = Signer.generateChallenge(32);

  // 2. Send challenge request
  challengeChannel.send(JSON.stringify({
    type: 'auth:challenge',
    challenge: ourChallenge,
    publicKey: localIdentity.publicKey,
  }));

  // 3. Receive and verify peer's proof
  // 4. Send our proof in response to peer's challenge

  // 5. Mark connection as authenticated
  connection.isAuthenticated = true;
}
```

#### R4.2: Maintain Seen Challenges Set (MEDIUM PRIORITY)

Prevent replay attacks by tracking seen challenge-proof pairs:

```typescript
class ChallengeTracker {
  private seenChallenges: Map<string, number> = new Map();
  private readonly maxAge = 10 * 60 * 1000; // 10 minutes

  hasSeenChallenge(challenge: string): boolean {
    this.cleanup();
    return this.seenChallenges.has(challenge);
  }

  recordChallenge(challenge: string): void {
    this.seenChallenges.set(challenge, Date.now());
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [challenge, timestamp] of this.seenChallenges) {
      if (now - timestamp > this.maxAge) {
        this.seenChallenges.delete(challenge);
      }
    }
  }
}
```

#### R4.3: Bind Public Key to WebRTC Fingerprint (HIGH PRIORITY)

Associate identity public keys with DTLS certificate fingerprints:

```typescript
// Extract certificate fingerprint from SDP
function extractFingerprint(sdp: string): string | null {
  const match = sdp.match(/a=fingerprint:sha-256 ([A-F0-9:]+)/i);
  return match ? match[1] : null;
}

// Verify during connection
async function verifyPeerBinding(
  peerPublicKey: string,
  sdpFingerprint: string,
  signedFingerprint: string
): Promise<boolean> {
  // Verify peer signed their DTLS fingerprint with their identity key
  return Signer.verifyRaw(peerPublicKey, signedFingerprint,
    new TextEncoder().encode(sdpFingerprint));
}
```

---

## 5. XSS Risk Assessment

### Data Flow Analysis

The webapp receives data from peers through WebRTC data channels and renders it in React components.

#### Data Entry Points

1. **Signaling Messages** (`SignalingClient.ts:457-466`)
   ```typescript
   private handleMessage(data: string): void {
     let message: SignalingMessage;
     try {
       message = JSON.parse(data) as SignalingMessage; // Entry point
     } catch (error) {
       console.error('Failed to parse signaling message:', error);
       return;
     }
     // ... routing based on message.type ...
   }
   ```

2. **Data Channel Messages** (`PeerConnectionManager.ts:586-615`)
   ```typescript
   channel.onmessage = (event) => {
     let message: DataChannelMessage;
     try {
       if (typeof event.data === 'string') {
         message = JSON.parse(event.data); // Entry point
       }
     } catch {
       message = { type: 'raw', data: event.data, timestamp: Date.now() };
     }
     // ... message handling ...
   }
   ```

3. **Peer Metadata** (`SignalingClient.ts:514-518`)
   ```typescript
   private handleOffer(message: SignalingOfferMessage): void {
     this.eventHandlers.onOffer?.(
       message.from,
       message.payload.sdp,
       message.payload.metadata  // User-controlled metadata
     );
   }
   ```

#### Rendering Points (React Components)

From `/workspaces/agentic-qe/src/edge/webapp/components/PeerList.tsx` (needs verification):
- Peer display names
- Peer metadata
- Connection state messages

### Security Assessment

| Risk Area | Status | Notes |
|-----------|--------|-------|
| React JSX escaping | GOOD | React escapes by default |
| `dangerouslySetInnerHTML` | CHECK | Review all components |
| URL handling | CHECK | Ensure validation before navigation |
| Event handlers | CHECK | No inline handlers from peer data |
| CSS injection | LOW | Tailwind CSS, static classes |

### Recommendations

#### R5.1: Audit All Rendering of Peer Data (HIGH PRIORITY)

Review all components that render peer-provided data:

```typescript
// DANGEROUS - Never do this
<div dangerouslySetInnerHTML={{ __html: peerMessage }} />

// DANGEROUS - href from untrusted source
<a href={peer.profileUrl}>Profile</a>

// SAFE - React auto-escapes
<span>{peerMessage}</span>
<div>{peer.displayName}</div>
```

Create checklist for component review:
- [ ] `PeerList.tsx` - Review peer.displayName, peer.metadata rendering
- [ ] `CRDTVisualizer.tsx` - Review CRDT value rendering
- [ ] `StatusCard.tsx` - Review any dynamic content
- [ ] `Dashboard.tsx` - Review aggregated displays

#### R5.2: Implement Content Sanitization (HIGH PRIORITY)

Add sanitization layer for all peer-provided text:

```typescript
// utils/sanitize.ts
import DOMPurify from 'dompurify';

export function sanitizeText(text: unknown): string {
  if (typeof text !== 'string') {
    return String(text);
  }
  // Remove any HTML/JS even though React escapes
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
}

export function sanitizeUrl(url: unknown): string | null {
  if (typeof url !== 'string') {
    return null;
  }
  try {
    const parsed = new URL(url);
    // Only allow safe protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}
```

#### R5.3: Validate Message Schemas (HIGH PRIORITY)

Add runtime validation for incoming messages:

```typescript
// Using zod for runtime validation
import { z } from 'zod';

const PeerMetadataSchema = z.object({
  displayName: z.string().max(100).optional(),
  version: z.string().max(50).optional(),
  // Explicitly define allowed fields
}).strict(); // Reject unknown fields

const DataChannelMessageSchema = z.object({
  type: z.string().max(50),
  data: z.unknown(),
  id: z.string().optional(),
  timestamp: z.number(),
});

// Validate in message handler
channel.onmessage = (event) => {
  try {
    const parsed = JSON.parse(event.data);
    const validated = DataChannelMessageSchema.parse(parsed);
    // Use validated data
  } catch (error) {
    console.warn('Invalid message format', error);
    return;
  }
};
```

#### R5.4: Implement CSP with Nonce (MEDIUM PRIORITY)

Use nonces for inline scripts (if any):

```typescript
// Server generates nonce per request
const nonce = crypto.randomBytes(16).toString('base64');

// CSP header
`script-src 'self' 'nonce-${nonce}'`

// In HTML
<script nonce="<%= nonce %>">
  // Allowed inline script
</script>
```

---

## 6. Additional Security Recommendations

### R6.1: Implement Rate Limiting (HIGH PRIORITY)

Add rate limiting for:
- Connection attempts per peer
- Messages per second per data channel
- Pattern sync requests

```typescript
class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  isAllowed(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    const recent = timestamps.filter(t => now - t < windowMs);

    if (recent.length >= limit) {
      return false;
    }

    recent.push(now);
    this.requests.set(key, recent);
    return true;
  }
}

// Usage
const limiter = new RateLimiter();
if (!limiter.isAllowed(peerId, 100, 1000)) {
  console.warn(`Rate limit exceeded for ${peerId}`);
  return;
}
```

### R6.2: Add Security Headers for Webapp (MEDIUM PRIORITY)

Configure Vite to add security headers in production:

```typescript
// vite.config.ts additions
export default defineConfig({
  server: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    },
  },
});
```

### R6.3: Implement Audit Logging (MEDIUM PRIORITY)

Log security-relevant events:

```typescript
interface SecurityEvent {
  timestamp: number;
  type: 'auth_success' | 'auth_failure' | 'connection' | 'key_unlock' | 'key_lock';
  peerId?: string;
  details: Record<string, unknown>;
}

class SecurityLogger {
  private events: SecurityEvent[] = [];

  log(event: Omit<SecurityEvent, 'timestamp'>): void {
    this.events.push({ ...event, timestamp: Date.now() });
    console.info('[Security]', event);
    // Could send to analytics service
  }

  getRecentEvents(minutes: number): SecurityEvent[] {
    const cutoff = Date.now() - minutes * 60 * 1000;
    return this.events.filter(e => e.timestamp > cutoff);
  }
}
```

### R6.4: Add Subresource Integrity (LOW PRIORITY)

For any external scripts (though currently none are used):

```html
<script
  src="https://cdn.example.com/library.js"
  integrity="sha384-..."
  crossorigin="anonymous"
></script>
```

---

## 7. Cryptographic Implementation Notes

### Current Limitation: Simplified Ed25519

The current implementation uses a simplified signature scheme for browser compatibility:

```typescript
// Signer.ts:318-343 - Using HMAC-SHA256 instead of proper Ed25519
private static async createSignature(
  privateKeyBase64: string,
  message: Uint8Array
): Promise<string> {
  // ... Uses HMAC instead of Ed25519 ...
  const key = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageBuffer);
  return base64Utils.encode(new Uint8Array(signatureBuffer));
}
```

### Recommendation: Use @noble/ed25519 (HIGH PRIORITY)

Replace simplified implementation with proper Ed25519:

```typescript
import * as ed25519 from '@noble/ed25519';

// Proper Ed25519 signing
async function signMessage(privateKey: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  return ed25519.sign(message, privateKey);
}

// Proper Ed25519 verification
async function verifySignature(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): Promise<boolean> {
  return ed25519.verify(signature, message, publicKey);
}
```

---

## 8. Summary of Recommendations by Priority

### Critical (Address Before Production)

| ID | Recommendation | Component |
|----|----------------|-----------|
| R1.2 | Use WebCrypto non-extractable keys | KeyManager |
| R2.1 | Implement signaling server authentication | SignalingClient |
| R2.2 | Enforce WSS-only connections | SignalingClient |
| R4.1 | Implement mutual authentication | PeerConnectionManager |
| R4.3 | Bind public key to DTLS fingerprint | PeerConnectionManager |
| R5.1 | Audit all peer data rendering | Components |
| R5.2 | Implement content sanitization | Utils |
| R5.3 | Validate message schemas | Handlers |
| R6.1 | Implement rate limiting | All |
| R7.1 | Use proper Ed25519 library | Signer |

### High (Address for Production Readiness)

| ID | Recommendation | Component |
|----|----------------|-----------|
| R1.1 | Enable auto-lock by default | KeyManager |
| R3.1 | Validate TURN credentials | ICEManager |
| R6.2 | Add security headers | Vite config |

### Medium (Recommended Improvements)

| ID | Recommendation | Component |
|----|----------------|-----------|
| R1.3 | Clear memory after use | KeyManager |
| R2.3 | Deploy CSP in report-only first | HTML |
| R3.2 | ICE transport policy options | ICEManager |
| R3.3 | Monitor ICE candidate types | ICEManager |
| R4.2 | Track seen challenges | Signer |
| R5.4 | CSP with nonces | HTML |
| R6.3 | Audit logging | New component |

### Low (Nice to Have)

| ID | Recommendation | Component |
|----|----------------|-----------|
| R1.4 | Storage event monitoring | KeyManager |
| R6.4 | Subresource integrity | HTML |

---

## 9. Testing Recommendations

### Security Test Cases

1. **Key Storage Tests**
   - Verify encrypted keys cannot be read without password
   - Test auto-lock timeout behavior
   - Verify salt and IV uniqueness

2. **Authentication Tests**
   - Test challenge-response with invalid signatures
   - Test expired proofs rejection
   - Test replay attack prevention

3. **XSS Prevention Tests**
   - Send HTML/JS in peer display names
   - Send malicious URLs in metadata
   - Test all rendering paths with fuzzing

4. **Rate Limiting Tests**
   - Verify connection rate limiting
   - Verify message rate limiting
   - Test recovery after rate limit expires

5. **WebRTC Security Tests**
   - Verify DTLS is active (check getStats)
   - Test connection with invalid fingerprints
   - Test TURN credential expiration

---

## Appendix: Security Checklist for Deployment

- [ ] All recommendations rated "Critical" addressed
- [ ] Security headers configured in production
- [ ] CSP policy deployed (report-only initially)
- [ ] Rate limiting enabled
- [ ] Audit logging implemented
- [ ] Signaling server uses WSS only
- [ ] TURN credentials are short-lived
- [ ] All components reviewed for XSS
- [ ] @noble/ed25519 or equivalent implemented
- [ ] Penetration testing completed
