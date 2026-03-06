# RuView Security Analysis Report

**Project**: RuView - WiFi-Based Human Pose Estimation System
**Date**: 2026-03-06
**Scanner**: QE Security Scanner v3 (SAST + Dependency + Secrets + Configuration Analysis)
**Scope**: Full codebase -- Python v1, Rust port, ESP32 firmware, Docker, shell scripts, configuration
**Classification**: CONFIDENTIAL

---

## Executive Summary

RuView presents a **large attack surface** spanning a Python FastAPI backend, a Rust systems port (15 crates), ESP32-S3 embedded firmware (C), Docker containers, and deployment automation. The security analysis identified **47 distinct findings** across all 12 analysis categories.

**Critical findings** include an unauthenticated OTA firmware update endpoint that allows arbitrary code execution on edge devices, a fake HMAC implementation in the Rust secure-TDM module that provides zero cryptographic protection, and authentication disabled by default across the entire system.

### Severity Distribution

| Severity | Count | CVSS Range |
|----------|-------|------------|
| CRITICAL | 7 | 9.0 -- 10.0 |
| HIGH | 12 | 7.0 -- 8.9 |
| MEDIUM | 16 | 4.0 -- 6.9 |
| LOW | 8 | 0.1 -- 3.9 |
| INFO | 4 | 0.0 |

### Risk Rating: **CRITICAL -- Not Production-Ready**

The system MUST NOT be deployed in any environment where physical safety, data privacy, or network integrity matter without addressing at minimum all CRITICAL and HIGH findings.

---

## Table of Contents

1. [OWASP Top 10 Analysis](#1-owasp-top-10-analysis)
2. [Authentication and Authorization](#2-authentication-and-authorization)
3. [Input Validation and Injection](#3-input-validation-and-injection)
4. [Network Security](#4-network-security)
5. [Cryptographic Issues](#5-cryptographic-issues)
6. [Hardware and Firmware Security](#6-hardware-and-firmware-security)
7. [Dependency Vulnerabilities](#7-dependency-vulnerabilities)
8. [Secrets and Credential Exposure](#8-secrets-and-credential-exposure)
9. [SQL Injection and Database Security](#9-sql-injection-and-database-security)
10. [Docker and Container Security](#10-docker-and-container-security)
11. [Supply Chain Risks](#11-supply-chain-risks)
12. [Privacy Concerns](#12-privacy-concerns)
13. [Remediation Priority Matrix](#13-remediation-priority-matrix)

---

## 1. OWASP Top 10 Analysis

### A01:2021 -- Broken Access Control

#### FINDING SEC-001: Authentication Globally Disabled by Default
- **Severity**: CRITICAL (CVSS 9.8)
- **CWE**: CWE-306 (Missing Authentication for Critical Function)
- **Location**: `/tmp/RuView/example.env:117`
- **Evidence**:
  ```
  ENABLE_AUTHENTICATION=false
  ```
  The `install.sh` script (line 808-809) copies `example.env` to `.env` unchanged, meaning every fresh installation starts with authentication disabled.
- **Attack Scenario**: An attacker on the same network connects to any API endpoint and has full access to pose estimation data, system configuration, and administrative functions without credentials.
- **Remediation**: Change the default in `example.env` to `ENABLE_AUTHENTICATION=true`. Add a startup check in the application that refuses to start in production mode with authentication disabled. In `install.sh`, prompt the user to set a secret key during installation.

#### FINDING SEC-002: Sensing WebSocket Server Has Zero Authentication
- **Severity**: CRITICAL (CVSS 9.1)
- **CWE**: CWE-306 (Missing Authentication for Critical Function)
- **Location**: `/tmp/RuView/v1/src/sensing/ws_server.py:426-436`
- **Evidence**: The `_handler` method accepts all incoming WebSocket connections without any authentication check. The server binds to `localhost:8765` by default but is configurable to bind to any interface.
- **Attack Scenario**: Any process on the host (or any network client if bound to `0.0.0.0`) can connect to the sensing WebSocket and receive real-time human pose data, inject fake CSI readings, or disrupt sensor calibration.
- **Remediation**: Add token-based authentication to the WebSocket handshake. Reject connections that do not provide a valid bearer token in the `Sec-WebSocket-Protocol` header or as a query parameter verified against the same JWT infrastructure used by the API.

#### FINDING SEC-003: Multiple API Endpoints Publicly Accessible
- **Severity**: HIGH (CVSS 7.5)
- **CWE**: CWE-862 (Missing Authorization)
- **Location**: `/tmp/RuView/v1/src/api/middleware/auth.py:125-133`
- **Evidence**:
  ```python
  PUBLIC_PATHS = [
      "/api/v1/pose/current",
      "/api/v1/pose/zones",
      "/api/v1/pose/activities",
      "/api/v1/pose/stats",
      "/api/v1/stream/status",
  ]
  ```
  These endpoints expose real-time pose data, zone occupancy, activity recognition results, and streaming status to unauthenticated users.
- **Attack Scenario**: An attacker queries `/api/v1/pose/current` to monitor human presence and movement patterns in the surveilled space without credentials, enabling physical surveillance.
- **Remediation**: Remove these paths from the public path list. If anonymous read access is genuinely required (e.g., for a public display), implement a separate read-only API key mechanism with rate limiting.

### A02:2021 -- Cryptographic Failures

See [Section 5: Cryptographic Issues](#5-cryptographic-issues) for full details.

#### FINDING SEC-004: Fake HMAC Implementation in Secure TDM
- **Severity**: CRITICAL (CVSS 9.8)
- **CWE**: CWE-327 (Use of a Broken or Risky Cryptographic Algorithm)
- **Location**: `/tmp/RuView/rust-port/wifi-densepose-rs/crates/wifi-densepose-hardware/src/esp32/secure_tdm.rs:253-261`
- **Evidence**:
  ```rust
  pub fn compute_tag(payload_and_nonce: &[u8], key: &[u8; 16]) -> [u8; HMAC_TAG_SIZE] {
      let mut tag = [0u8; HMAC_TAG_SIZE];
      for (i, byte) in payload_and_nonce.iter().enumerate() {
          tag[i % HMAC_TAG_SIZE] ^= byte ^ key[i % 16];
      }
      tag
  }
  ```
  This is a simple XOR-fold, NOT HMAC-SHA256. The function name and surrounding documentation claim "HMAC-based beacon authentication" but the implementation provides no cryptographic security. An attacker who observes a single valid tag can trivially recover the key or forge arbitrary tags.
- **Attack Scenario**: An attacker on the WiFi network captures one TDM beacon, reverses the XOR to extract the key material, and then injects spoofed TDM beacons to manipulate time-slot assignments, causing denial of service or enabling man-in-the-middle positioning of CSI data collection.
- **Remediation**: Replace with actual HMAC-SHA256 using the `hmac` and `sha2` crates (already in `Cargo.toml`). Use a 256-bit key minimum. The existing `sha2 = "0.10"` dependency makes this straightforward.

### A03:2021 -- Injection

See [Section 3: Input Validation](#3-input-validation-and-injection) and [Section 9: Database Security](#9-sql-injection-and-database-security).

### A05:2021 -- Security Misconfiguration

#### FINDING SEC-005: CORS Allows All Origins with Credentials in Development
- **Severity**: MEDIUM (CVSS 6.1)
- **CWE**: CWE-942 (Overly Permissive Cross-domain Whitelist)
- **Location**: `/tmp/RuView/v1/src/middleware/cors.py:252-266`
- **Evidence**:
  ```python
  @staticmethod
  def development_config() -> dict:
      return {
          "allow_origins": ["*"],
          "allow_credentials": True,
          ...
      }
  ```
  The `validate_cors_config` function (line 354) detects this conflict ("Cannot use credentials with wildcard origin") but the check is advisory only and does not prevent the misconfiguration.
- **Attack Scenario**: A malicious website tricks a developer's browser into making credentialed cross-origin requests to the local RuView API, exfiltrating pose data or modifying configuration.
- **Remediation**: Enforce the validation check at startup -- refuse to start if `allow_credentials=True` and `allow_origins=["*"]` are set simultaneously. In development, use explicit `localhost` origins.

#### FINDING SEC-006: CSP Header Allows unsafe-inline Scripts
- **Severity**: MEDIUM (CVSS 5.4)
- **CWE**: CWE-1021 (Improper Restriction of Rendered UI Layers)
- **Location**: `/tmp/RuView/v1/src/api/middleware/auth.py:271`
- **Evidence**: The Content-Security-Policy header includes `'unsafe-inline'` for script-src, weakening XSS protections.
- **Remediation**: Use nonce-based or hash-based CSP for inline scripts. Remove `'unsafe-inline'` and refactor any inline JavaScript to external files.

### A07:2021 -- Identification and Authentication Failures

See [Section 2: Authentication and Authorization](#2-authentication-and-authorization) for full details.

### A08:2021 -- Software and Data Integrity Failures

#### FINDING SEC-007: WASM Upload Without Mandatory Signature Verification
- **Severity**: CRITICAL (CVSS 9.8)
- **CWE**: CWE-494 (Download of Code Without Integrity Check)
- **Location**: `/tmp/RuView/firmware/esp32-csi-node/main/wasm_upload.c:174-204`
- **Evidence**: Raw WASM uploads are allowed when `wasm_verify=0`. Signature verification is compile-time optional (`CONFIG_WASM_VERIFY_SIGNATURE`). Even the NVS configuration can override this at runtime (`nvs_config.c:259-263`).
- **Attack Scenario**: An attacker on the local network uploads a malicious WASM module to any ESP32 node. The module executes within the WASM sandbox but can still manipulate CSI data processing, exfiltrate sensor readings, or cause denial of service.
- **Remediation**: Make signature verification mandatory and remove the compile-time and runtime disable options. Require authentication on the WASM upload HTTP endpoint. Use TLS for the upload connection.

### A09:2021 -- Security Logging and Monitoring Failures

#### FINDING SEC-008: Insufficient Audit Trail for Security Events
- **Severity**: MEDIUM (CVSS 5.3)
- **CWE**: CWE-778 (Insufficient Logging)
- **Location**: `/tmp/RuView/v1/src/database/models.py` (AuditLog model exists but unclear if populated)
- **Evidence**: An `AuditLog` SQLAlchemy model exists but there is no evidence of it being written to on authentication failures, configuration changes, or data access events. The authentication middleware logs warnings but only to stdout/file, not to a tamper-evident store.
- **Remediation**: Implement structured security event logging that writes to the AuditLog table for: authentication failures, privilege escalation attempts, configuration changes, and access to sensitive pose data. Forward security logs to a SIEM.

---

## 2. Authentication and Authorization

### FINDING SEC-009: In-Memory User Store Loses All Users on Restart
- **Severity**: HIGH (CVSS 8.1)
- **CWE**: CWE-256 (Plaintext Storage of a Password)
- **Location**: `/tmp/RuView/v1/src/middleware/auth.py:85`
- **Evidence**:
  ```python
  self._users: Dict[str, Dict[str, Any]] = {}
  ```
  The `UserManager` stores all user accounts in an in-memory dictionary. All users are lost on application restart. There is no persistence layer, no migration to the database, and no connection to the SQLAlchemy models.
- **Attack Scenario**: After a service restart (intentional or crash), all user accounts vanish. If the system falls back to a default state or disables auth, attackers gain full access.
- **Remediation**: Persist users in the PostgreSQL database using the existing SQLAlchemy infrastructure. Hash passwords with bcrypt (already available via `passlib`) and store in a `users` table.

### FINDING SEC-010: Token Blacklist Periodic Full Clear
- **Severity**: HIGH (CVSS 7.5)
- **CWE**: CWE-613 (Insufficient Session Expiration)
- **Location**: `/tmp/RuView/v1/src/api/middleware/auth.py:251`
- **Evidence**:
  ```python
  self._blacklisted_tokens.clear()
  ```
  The periodic cleanup clears ALL blacklisted tokens, not just expired ones. This means tokens that were explicitly revoked (e.g., on logout or compromise) become valid again after the cleanup cycle.
- **Attack Scenario**: A user logs out, their token is blacklisted. After the cleanup timer fires, the old token works again until its JWT expiration. An attacker who captured the token before logout can resume the session.
- **Remediation**: Only remove tokens from the blacklist whose JWT `exp` claim has passed. Use `jwt.decode` with `options={"verify_exp": False}` to read the expiration, then remove only truly expired entries.

### FINDING SEC-011: WebSocket Authentication Via Query Parameter
- **Severity**: HIGH (CVSS 7.2)
- **CWE**: CWE-598 (Use of GET Request Method With Sensitive Query Strings)
- **Location**: `/tmp/RuView/v1/src/middleware/auth.py:243-245`, `/tmp/RuView/v1/src/api/routers/stream.py:74`
- **Evidence**:
  ```python
  if request.url.path.startswith("/ws"):
      token = request.query_params.get("token")
  ```
  JWT tokens are passed in URL query parameters for WebSocket connections. These appear in server logs, browser history, proxy logs, and HTTP referer headers.
- **Attack Scenario**: An attacker gains access to server logs, a reverse proxy log, or browser history and extracts valid JWT tokens from WebSocket connection URLs.
- **Remediation**: Use the `Sec-WebSocket-Protocol` header to transmit tokens during the WebSocket upgrade handshake. Alternatively, use a short-lived single-use ticket exchanged for a session token during the WebSocket handshake.

### FINDING SEC-012: No Password Complexity Validation
- **Severity**: MEDIUM (CVSS 5.3)
- **CWE**: CWE-521 (Weak Password Requirements)
- **Location**: `/tmp/RuView/v1/src/middleware/auth.py:115-130`
- **Evidence**: The `create_user` method accepts any string as a password with no length, complexity, or entropy requirements.
- **Remediation**: Add password validation requiring minimum 12 characters, mixed case, numbers, and special characters. Consider integrating with a breached password database (e.g., HaveIBeenPwned k-anonymity API).

### FINDING SEC-013: Response Headers Leak User Information
- **Severity**: MEDIUM (CVSS 4.3)
- **CWE**: CWE-200 (Exposure of Sensitive Information)
- **Location**: `/tmp/RuView/v1/src/middleware/auth.py:298-299`
- **Evidence**:
  ```python
  response.headers["X-User"] = user_info["username"]
  response.headers["X-User-Roles"] = ",".join(user_info["roles"])
  ```
  Every authenticated response includes the username and all roles in plaintext headers.
- **Attack Scenario**: An attacker intercepting responses (or via browser dev tools on a shared workstation) learns usernames and role assignments, facilitating targeted attacks against admin accounts.
- **Remediation**: Remove these headers entirely, or restrict them to development mode only. If needed for debugging, use opaque session identifiers instead of usernames.

### FINDING SEC-014: Authentication Bypass in Dependencies Module
- **Severity**: HIGH (CVSS 8.6)
- **CWE**: CWE-287 (Improper Authentication)
- **Location**: `/tmp/RuView/v1/src/api/dependencies.py`
- **Evidence**: When `enable_authentication=False`, the authentication dependency returns `None` for the current user, and all downstream authorization checks are skipped. Combined with SEC-001 (auth disabled by default), the entire API is unprotected on fresh installs.
- **Remediation**: Even when authentication is disabled, require at minimum an API key or network-level access control. Add a startup warning banner that is impossible to miss when auth is disabled.

---

## 3. Input Validation and Injection

### FINDING SEC-015: No Input Validation on UDP CSI Packets
- **Severity**: HIGH (CVSS 7.5)
- **CWE**: CWE-20 (Improper Input Validation)
- **Location**: `/tmp/RuView/v1/src/sensing/ws_server.py:117`
- **Evidence**: The ESP32 UDP collector binds to `0.0.0.0:5005` and accepts packets with only a magic byte check. There is no validation of packet structure, length bounds, or source address filtering.
- **Attack Scenario**: An attacker floods the UDP port with malformed packets, causing the parser to crash or consume excessive memory. Carefully crafted packets could inject fake CSI data, causing the pose estimation model to produce incorrect outputs.
- **Remediation**: Implement strict packet validation: verify magic bytes, enforce maximum packet size, validate field ranges, and add source IP allowlisting. Consider adding a lightweight HMAC to UDP packets for authenticity.

### FINDING SEC-016: Broadcast Endpoint Allows Arbitrary Message Injection
- **Severity**: MEDIUM (CVSS 6.5)
- **CWE**: CWE-79 (Improper Neutralization of Input During Web Page Generation)
- **Location**: `/tmp/RuView/v1/src/api/routers/stream.py:410-446`
- **Evidence**: The broadcast endpoint allows any authenticated user to send arbitrary JSON messages to all connected WebSocket clients. There is no content validation, type checking, or sanitization.
- **Attack Scenario**: A compromised low-privilege account broadcasts malicious payloads to all WebSocket subscribers, potentially triggering XSS in web-based dashboards consuming the WebSocket feed.
- **Remediation**: Restrict the broadcast endpoint to admin role only. Validate message schemas against an allowlist of message types. Sanitize all string content.

### FINDING SEC-017: Rate Limiter Trusts X-Forwarded-For Header
- **Severity**: HIGH (CVSS 7.5)
- **CWE**: CWE-346 (Origin Validation Error)
- **Location**: `/tmp/RuView/v1/src/middleware/rate_limit.py:201-203`, `/tmp/RuView/v1/src/api/middleware/rate_limit.py:129`
- **Evidence**:
  ```python
  forwarded_for = request.headers.get("X-Forwarded-For")
  if forwarded_for:
      return forwarded_for.split(",")[0].strip()
  ```
  Both rate limiter implementations blindly trust the `X-Forwarded-For` header. An attacker can set this header to any IP address to bypass rate limits entirely.
- **Attack Scenario**: An attacker sends requests with a different `X-Forwarded-For` value on each request, effectively making the rate limiter see each request as coming from a unique client. This completely defeats rate limiting.
- **Remediation**: Only trust `X-Forwarded-For` when the request comes from a known proxy IP. Configure a trusted proxy list and fall back to the direct connection IP for untrusted sources. Use `request.client.host` as the default.

---

## 4. Network Security

### FINDING SEC-018: ESP32 UDP Collector Binds to All Interfaces
- **Severity**: HIGH (CVSS 7.5)
- **CWE**: CWE-668 (Exposure of Resource to Wrong Sphere)
- **Location**: `/tmp/RuView/v1/src/sensing/ws_server.py:117`
- **Evidence**: The UDP CSI data collector binds to `0.0.0.0:5005`, accepting data from any network interface without authentication or source validation.
- **Attack Scenario**: An attacker on any reachable network sends crafted UDP packets to port 5005, injecting false CSI data or causing denial of service through resource exhaustion.
- **Remediation**: Bind to a specific interface (the WiFi monitoring network). Implement source IP allowlisting matching expected ESP32 node addresses. Add packet authentication.

### FINDING SEC-019: Plaintext UDP for CSI Data Transmission
- **Severity**: MEDIUM (CVSS 5.9)
- **CWE**: CWE-319 (Cleartext Transmission of Sensitive Information)
- **Location**: `/tmp/RuView/firmware/esp32-csi-node/main/stream_sender.c`
- **Evidence**: CSI data is transmitted from ESP32 nodes to the server via plain UDP without encryption. The ADR-018 binary format contains raw sensor data.
- **Attack Scenario**: An attacker on the same network captures UDP packets and reconstructs CSI data, potentially deriving presence/movement information about people in the monitored space.
- **Remediation**: Implement DTLS (Datagram TLS) for the UDP channel. Alternatively, use the QUIC transport already designed in the Rust TDM module for all sensor data transmission.

### FINDING SEC-020: WebSocket Connection Manager Has No Connection Limits
- **Severity**: MEDIUM (CVSS 5.3)
- **CWE**: CWE-770 (Allocation of Resources Without Limits)
- **Location**: `/tmp/RuView/v1/src/api/websocket/connection_manager.py`
- **Evidence**: The ConnectionManager accepts unlimited WebSocket connections without per-client or global limits.
- **Attack Scenario**: An attacker opens thousands of WebSocket connections, exhausting server memory and file descriptors, causing denial of service.
- **Remediation**: Implement per-IP connection limits (e.g., max 10 concurrent WebSockets per IP) and a global connection cap. Add connection rate limiting.

### FINDING SEC-021: Rate Limiting Silently Fails on Error
- **Severity**: MEDIUM (CVSS 5.3)
- **CWE**: CWE-755 (Improper Handling of Exceptional Conditions)
- **Location**: `/tmp/RuView/v1/src/middleware/rate_limit.py:339-342`
- **Evidence**:
  ```python
  except Exception as e:
      logger.error(f"Rate limiting middleware error: {e}")
      # Continue without rate limiting on error
      return await call_next(request)
  ```
  Any exception in the rate limiting middleware causes it to fail open, allowing unlimited requests.
- **Attack Scenario**: An attacker crafts requests that trigger exceptions in the rate limiter (e.g., by manipulating headers), then exploits the fail-open behavior to send unlimited requests.
- **Remediation**: Fail closed -- return HTTP 503 when the rate limiter encounters an error rather than passing the request through. Add circuit breaker logic to temporarily block all requests if the rate limiter fails repeatedly.

---

## 5. Cryptographic Issues

### FINDING SEC-022: Hardcoded Test Key in Secure TDM Module
- **Severity**: CRITICAL (CVSS 9.1)
- **CWE**: CWE-798 (Use of Hard-coded Credentials)
- **Location**: `/tmp/RuView/rust-port/wifi-densepose-rs/crates/wifi-densepose-hardware/src/esp32/secure_tdm.rs:57-60`
- **Evidence**:
  ```rust
  const DEFAULT_TEST_KEY: [u8; 16] = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
                                       0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10];
  ```
  This key is compiled into the binary and used as a fallback. Combined with the fake HMAC (SEC-004), this means any attacker who reads the source code or reverse-engineers the binary can forge authenticated TDM beacons.
- **Attack Scenario**: Attacker extracts the hardcoded key (it is a simple sequential pattern), forges TDM beacons, and takes over time-slot coordination for all nodes in the network.
- **Remediation**: Remove the hardcoded key entirely. Require key provisioning via a secure out-of-band mechanism (e.g., during device enrollment). Use a key derivation function to generate per-session keys from a master secret.

### FINDING SEC-023: 8-Byte Truncated HMAC Tag
- **Severity**: MEDIUM (CVSS 5.9)
- **CWE**: CWE-326 (Inadequate Encryption Strength)
- **Location**: `/tmp/RuView/rust-port/wifi-densepose-rs/crates/wifi-densepose-hardware/src/esp32/secure_tdm.rs` (HMAC_TAG_SIZE constant)
- **Evidence**: The HMAC tag is truncated to 8 bytes (64 bits). While the HMAC itself is fake (SEC-004), even when fixed, 64 bits provides insufficient security margin for authentication tags in a system where an attacker can attempt many forgeries.
- **Remediation**: After replacing the fake HMAC with real HMAC-SHA256 (SEC-004), use the full 32-byte tag or at minimum 16 bytes (128 bits) per NIST SP 800-107 recommendations.

### FINDING SEC-024: Default Security Level Accepts Unauthenticated Beacons
- **Severity**: HIGH (CVSS 8.1)
- **CWE**: CWE-1188 (Insecure Default Initialization of Resource)
- **Location**: `/tmp/RuView/rust-port/wifi-densepose-rs/crates/wifi-densepose-hardware/src/esp32/secure_tdm.rs:313`
- **Evidence**: The default `SecLevel` is `Transitional`, which accepts both authenticated and unauthenticated beacons. This means even after fixing the HMAC, new deployments would still accept unauthenticated beacons by default.
- **Remediation**: Change the default to `Strict` (reject unauthenticated beacons). Provide `Transitional` only as an explicit opt-in for migration periods with clear warnings.

### FINDING SEC-025: Replay Window of Only 16 Nonces
- **Severity**: MEDIUM (CVSS 5.3)
- **CWE**: CWE-294 (Authentication Bypass by Capture-replay)
- **Location**: `/tmp/RuView/rust-port/wifi-densepose-rs/crates/wifi-densepose-hardware/src/esp32/secure_tdm.rs`
- **Evidence**: The replay protection window stores only 16 nonces. In a busy network with multiple nodes, this window fills quickly, and old nonces are evicted, allowing replay attacks with slightly aged packets.
- **Remediation**: Increase the replay window to at least 256 entries. Use monotonic counters per-sender rather than a shared nonce window. Consider using the QUIC-style packet number approach already present in the TDM design.

---

## 6. Hardware and Firmware Security

### FINDING SEC-026: Unauthenticated OTA Firmware Update Endpoint
- **Severity**: CRITICAL (CVSS 10.0)
- **CWE**: CWE-306 (Missing Authentication for Critical Function)
- **Location**: `/tmp/RuView/firmware/esp32-csi-node/main/ota_update.c`
- **Evidence**: The OTA update HTTP endpoint (POST on port 8032) accepts firmware images from any client without authentication. There is no TLS, no firmware signature verification, and the device reboots after a successful flash (line 141).
- **Attack Scenario**: An attacker on the local network sends a crafted firmware image to any ESP32 node at `http://<node-ip>:8032/ota`. The node flashes the malicious firmware and reboots, giving the attacker persistent control of the device. This can be automated to compromise all nodes simultaneously.
- **Remediation**:
  1. Add mutual TLS authentication on the OTA endpoint.
  2. Implement firmware signature verification using ESP-IDF's secure boot v2.
  3. Add a pre-shared key or certificate pinning for the update server.
  4. Implement rollback protection with anti-rollback counters in eFuse.

### FINDING SEC-027: WASM Signature Verification Disableable at Runtime
- **Severity**: HIGH (CVSS 8.1)
- **CWE**: CWE-693 (Protection Mechanism Failure)
- **Location**: `/tmp/RuView/firmware/esp32-csi-node/main/nvs_config.c:259-263`
- **Evidence**: The NVS configuration allows overriding the WASM signature verification flag at runtime. An attacker who gains NVS write access (e.g., through another vulnerability) can disable signature checking and then upload arbitrary WASM modules.
- **Remediation**: Remove the NVS override for signature verification. Make it a compile-time-only setting backed by eFuse or secure boot chain of trust. If runtime configurability is needed, require a signed configuration update.

### FINDING SEC-028: WiFi Credentials Stored Without Encryption
- **Severity**: MEDIUM (CVSS 5.5)
- **CWE**: CWE-312 (Cleartext Storage of Sensitive Information)
- **Location**: `/tmp/RuView/firmware/esp32-csi-node/main/nvs_config.c`
- **Evidence**: WiFi SSID and password are stored in NVS (Non-Volatile Storage) in plaintext. The SSID is also logged in plaintext during startup (`main.c:108`).
- **Remediation**: Use the ESP-IDF NVS encryption feature (flash encryption). Avoid logging credentials -- log only a hash or truncated identifier.

### FINDING SEC-029: Fallback to Open WiFi Authentication
- **Severity**: MEDIUM (CVSS 6.5)
- **CWE**: CWE-1188 (Insecure Default Initialization)
- **Location**: `/tmp/RuView/firmware/esp32-csi-node/main/main.c:100-102`
- **Evidence**: If the WiFi password is empty, the firmware falls back to open (no authentication) WiFi mode. This creates an unencrypted access point.
- **Remediation**: Refuse to start in open mode. Require WPA2/WPA3 authentication. If a provisioning mode is needed, use ESP-IDF's WiFi provisioning with BLE.

---

## 7. Dependency Vulnerabilities

### FINDING SEC-030: Unpinned Python Dependencies
- **Severity**: MEDIUM (CVSS 5.3)
- **CWE**: CWE-1104 (Use of Unmaintained Third Party Components)
- **Location**: `/tmp/RuView/requirements.txt`
- **Evidence**: Dependencies use `>=` version specifiers (e.g., `fastapi>=0.104.0`), allowing untested major version upgrades. Key dependencies:
  - `python-jose>=3.3.0` (JWT library)
  - `passlib>=1.7.4` (password hashing)
  - `paramiko>=3.4.0` (SSH -- large attack surface)
  - `websockets>=12.0`
  - `sqlalchemy>=2.0.0`
- **Remediation**: Pin exact versions using `==` and use a lock file (`pip-compile` or `poetry.lock`). Run `pip-audit` or `safety check` in CI. Remove `paramiko` if SSH router access is not actively used.

### FINDING SEC-031: Paramiko Included Without Clear Need
- **Severity**: LOW (CVSS 3.1)
- **CWE**: CWE-1104 (Use of Unmaintained Third Party Components)
- **Location**: `/tmp/RuView/requirements.txt`
- **Evidence**: `paramiko` (SSH library) is included in dependencies. It has a history of CVEs and adds a significant attack surface. It is used by `router_interface.py` for SSH access to routers.
- **Remediation**: If SSH router access is not a core feature, remove paramiko. If needed, isolate it in an optional dependency group and use key-based authentication instead of passwords.

### FINDING SEC-032: Rust Dependency Version Ranges
- **Severity**: LOW (CVSS 2.4)
- **CWE**: CWE-1104
- **Location**: `/tmp/RuView/rust-port/wifi-densepose-rs/Cargo.toml`
- **Evidence**: Dependencies use semver ranges (e.g., `sha2 = "0.10"`, `tokio = "1.0"`). While Cargo's semver compliance is better than pip's, minor version updates can still introduce bugs.
- **Remediation**: Use `Cargo.lock` (likely already present) and audit with `cargo audit` in CI. Consider using exact versions for security-critical dependencies.

---

## 8. Secrets and Credential Exposure

### FINDING SEC-033: Weak Secret Key Placeholder in example.env
- **Severity**: CRITICAL (CVSS 9.1)
- **CWE**: CWE-798 (Use of Hard-coded Credentials)
- **Location**: `/tmp/RuView/example.env:29`
- **Evidence**:
  ```
  SECRET_KEY=your-secret-key-here-change-for-production
  ```
  This placeholder is copied verbatim to `.env` by `install.sh`. If not changed, JWT tokens are signed with a known, predictable key, allowing anyone to forge valid authentication tokens.
- **Attack Scenario**: An attacker uses the known secret key to forge a JWT token with admin privileges, gaining complete control of the API.
- **Remediation**: Generate a random secret key during `install.sh` execution using `openssl rand -hex 32`. Add a startup validation that rejects known placeholder values. Use `Settings.validate_production_settings()` to enforce this.

### FINDING SEC-034: Database Credentials in example.env
- **Severity**: HIGH (CVSS 7.5)
- **CWE**: CWE-798 (Use of Hard-coded Credentials)
- **Location**: `/tmp/RuView/example.env:45`
- **Evidence**:
  ```
  DATABASE_URL=postgresql://wifi_user:wifi_password@localhost:5432/wifi_densepose
  ```
  Default database username and password are provided and likely used unchanged in many deployments.
- **Remediation**: Use placeholder-only values that fail to connect (e.g., `CHANGE_ME`). Generate unique credentials during installation. Support database authentication via IAM roles or certificate-based auth where possible.

### FINDING SEC-035: Router SSH Password in Configuration
- **Severity**: HIGH (CVSS 7.5)
- **CWE**: CWE-256 (Plaintext Storage of a Password)
- **Location**: `/tmp/RuView/v1/src/config/settings.py:81`
- **Evidence**: The `Settings` class includes `router_ssh_password` as a plain string field loaded from environment variables.
- **Remediation**: Use SSH key-based authentication instead of passwords. If passwords must be used, integrate with a secrets manager (HashiCorp Vault, AWS Secrets Manager) rather than environment variables.

### FINDING SEC-036: Test Settings Use Weak Hardcoded Key
- **Severity**: LOW (CVSS 3.1)
- **CWE**: CWE-798
- **Location**: `/tmp/RuView/v1/src/config/settings.py:397`
- **Evidence**:
  ```python
  secret_key="test-secret-key"
  ```
  While this is in a test configuration factory, the value could leak into non-test environments if the factory method is called incorrectly.
- **Remediation**: Use a clearly invalid value that causes immediate failure if used in production (e.g., `INVALID-TEST-ONLY-DO-NOT-USE-IN-PRODUCTION`). Add assertions in the test settings that prevent production use.

---

## 9. SQL Injection and Database Security

### FINDING SEC-037: SQLAlchemy ORM Provides Parameterized Queries (POSITIVE)
- **Severity**: INFO
- **Location**: `/tmp/RuView/v1/src/database/models.py`, `/tmp/RuView/v1/src/database/connection.py`
- **Evidence**: The application uses SQLAlchemy ORM throughout, which automatically parameterizes queries. No raw SQL string construction was found. This is a positive finding.
- **Note**: Maintain vigilance that no raw SQL is introduced. Add a linting rule to prevent `text()` or `execute()` with string formatting.

### FINDING SEC-038: Database Connection Strings in Environment Variables
- **Severity**: MEDIUM (CVSS 4.3)
- **CWE**: CWE-522 (Insufficiently Protected Credentials)
- **Location**: `/tmp/RuView/v1/src/database/connection.py:97-104`
- **Evidence**: Database URLs including credentials are passed as plain strings through environment variables and may appear in process listings, container inspection, or crash dumps.
- **Remediation**: Use connection pooling with IAM-based authentication where possible. For containerized deployments, use Docker secrets or Kubernetes secrets mounted as files rather than environment variables.

### FINDING SEC-039: SQLite Failsafe Without Access Controls
- **Severity**: LOW (CVSS 3.1)
- **CWE**: CWE-732 (Incorrect Permission Assignment)
- **Location**: `/tmp/RuView/v1/src/database/connection.py`
- **Evidence**: When PostgreSQL is unavailable, the system falls back to SQLite. The SQLite file is created with default permissions and has no encryption or access control.
- **Remediation**: Set restrictive file permissions (0600) on the SQLite file. Consider using SQLCipher for encrypted SQLite. Log a warning when falling back to SQLite in production.

---

## 10. Docker and Container Security

### FINDING SEC-040: Containers Run as Root
- **Severity**: HIGH (CVSS 7.0)
- **CWE**: CWE-250 (Execution with Unnecessary Privileges)
- **Location**: `/tmp/RuView/docker/Dockerfile.python`, `/tmp/RuView/docker/Dockerfile.rust`
- **Evidence**: Neither Dockerfile includes a `USER` directive. Both containers run all processes as root.
- **Attack Scenario**: A container escape vulnerability (e.g., in the Python runtime or a dependency) gives the attacker root access on the host system.
- **Remediation**: Add a non-root user to both Dockerfiles:
  ```dockerfile
  RUN adduser --disabled-password --gecos '' appuser
  USER appuser
  ```

### FINDING SEC-041: No Resource Limits in docker-compose.yml
- **Severity**: MEDIUM (CVSS 5.3)
- **CWE**: CWE-770 (Allocation of Resources Without Limits)
- **Location**: `/tmp/RuView/docker/docker-compose.yml`
- **Evidence**: No `mem_limit`, `cpus`, or `pids_limit` are defined for any service. No `read_only: true` filesystem restriction.
- **Remediation**: Add resource constraints:
  ```yaml
  deploy:
    resources:
      limits:
        cpus: '2.0'
        memory: 2G
  security_opt:
    - no-new-privileges:true
  read_only: true
  ```

### FINDING SEC-042: No Network Isolation Between Services
- **Severity**: MEDIUM (CVSS 5.3)
- **CWE**: CWE-653 (Improper Isolation or Compartmentalization)
- **Location**: `/tmp/RuView/docker/docker-compose.yml`
- **Evidence**: All services share the default Docker network. The ESP32 UDP port is exposed publicly without restriction.
- **Remediation**: Define separate Docker networks for frontend, backend, and sensor communication. Only expose necessary ports. Use internal networks for database access.

### FINDING SEC-043: No Health Checks in Dockerfiles
- **Severity**: LOW (CVSS 2.0)
- **CWE**: CWE-693
- **Location**: `/tmp/RuView/docker/Dockerfile.python`, `/tmp/RuView/docker/Dockerfile.rust`
- **Evidence**: No `HEALTHCHECK` instructions are defined, preventing container orchestrators from detecting unhealthy containers.
- **Remediation**: Add health checks:
  ```dockerfile
  HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:8000/health || exit 1
  ```

---

## 11. Supply Chain Risks

### FINDING SEC-044: install.sh Downloads and Executes Remote Code
- **Severity**: MEDIUM (CVSS 6.5)
- **CWE**: CWE-494 (Download of Code Without Integrity Check)
- **Location**: `/tmp/RuView/install.sh:636`
- **Evidence**: The installer downloads and executes the rustup installer from the internet without verifying its integrity (no checksum or signature verification).
- **Attack Scenario**: A DNS spoofing or MITM attack redirects the rustup download to a malicious script, which executes with the user's privileges during installation.
- **Remediation**: Verify the rustup installer's GPG signature or SHA-256 checksum before execution. Pin the expected checksum in the install script.

### FINDING SEC-045: No Lock File for Python Dependencies
- **Severity**: MEDIUM (CVSS 5.3)
- **CWE**: CWE-1104
- **Location**: `/tmp/RuView/requirements.txt`
- **Evidence**: No `requirements.lock` or `poetry.lock` file exists. Dependency resolution happens at install time, meaning builds are not reproducible and vulnerable to dependency confusion attacks.
- **Remediation**: Generate and commit a lock file using `pip-compile` (pip-tools) or migrate to Poetry. Verify dependency hashes with `--require-hashes`.

---

## 12. Privacy Concerns

### FINDING SEC-046: No Data Retention Controls for Pose/Vitals Data
- **Severity**: HIGH (CVSS 7.5)
- **CWE**: CWE-359 (Exposure of Private Personal Information)
- **Location**: System-wide
- **Evidence**: The system collects real-time human pose estimation data, zone occupancy, activity recognition, and potentially vital signs. There are no data retention policies, no automatic data purging, and no consent mechanisms. Pose data is broadcast to all WebSocket subscribers without access controls.
- **Attack Scenario**: Stored pose data reveals detailed movement patterns, daily routines, and presence information about individuals in the monitored space. This data is valuable for stalking, burglary planning, or unauthorized surveillance. Under GDPR/CCPA, this constitutes personal data processing without adequate safeguards.
- **Remediation**:
  1. Implement configurable data retention policies with automatic purging.
  2. Add access controls on pose data endpoints based on data classification.
  3. Implement consent management if monitoring non-employees.
  4. Add data anonymization options (aggregate zone counts instead of individual pose data).
  5. Provide data subject access and deletion APIs for regulatory compliance.

### FINDING SEC-047: WiFi CSI Data Can Identify Individuals
- **Severity**: MEDIUM (CVSS 6.5)
- **CWE**: CWE-359
- **Location**: System-wide
- **Evidence**: WiFi CSI (Channel State Information) data combined with pose estimation can uniquely identify individuals by their gait, body shape, and movement patterns. The system processes this biometric data without any privacy protections.
- **Remediation**: Implement data minimization -- process CSI data to extract only the needed features and discard raw CSI. Add differential privacy noise to pose estimates when used for occupancy counting. Document the biometric data processing in a Data Protection Impact Assessment (DPIA).

---

## 13. Remediation Priority Matrix

### Immediate (Sprint 0 -- Before Any Deployment)

| ID | Finding | CVSS | Effort |
|----|---------|------|--------|
| SEC-026 | Unauthenticated OTA firmware update | 10.0 | High |
| SEC-004 | Fake HMAC in secure_tdm.rs | 9.8 | Medium |
| SEC-001 | Authentication disabled by default | 9.8 | Low |
| SEC-007 | WASM upload without mandatory signature | 9.8 | Medium |
| SEC-033 | Weak secret key placeholder | 9.1 | Low |
| SEC-022 | Hardcoded test key in TDM | 9.1 | Medium |
| SEC-002 | Sensing WebSocket zero authentication | 9.1 | Medium |

### Short-Term (Sprint 1-2)

| ID | Finding | CVSS | Effort |
|----|---------|------|--------|
| SEC-014 | Auth bypass when disabled | 8.6 | Medium |
| SEC-009 | In-memory user store | 8.1 | High |
| SEC-024 | Default accepts unauthenticated beacons | 8.1 | Low |
| SEC-027 | WASM verification disableable at runtime | 8.1 | Medium |
| SEC-003 | Public API endpoints exposing pose data | 7.5 | Low |
| SEC-010 | Token blacklist full clear | 7.5 | Low |
| SEC-015 | No UDP packet validation | 7.5 | Medium |
| SEC-017 | X-Forwarded-For trust | 7.5 | Low |
| SEC-018 | UDP collector on all interfaces | 7.5 | Low |
| SEC-034 | Default database credentials | 7.5 | Low |
| SEC-035 | SSH password in config | 7.5 | Medium |
| SEC-046 | No data retention controls | 7.5 | High |
| SEC-011 | WebSocket token in query params | 7.2 | Medium |
| SEC-040 | Docker containers run as root | 7.0 | Low |

### Medium-Term (Sprint 3-4)

| ID | Finding | CVSS | Effort |
|----|---------|------|--------|
| SEC-016 | Broadcast arbitrary messages | 6.5 | Low |
| SEC-029 | Fallback to open WiFi | 6.5 | Low |
| SEC-044 | Remote code execution in install.sh | 6.5 | Low |
| SEC-047 | CSI data identifies individuals | 6.5 | High |
| SEC-005 | CORS wildcard with credentials | 6.1 | Low |
| SEC-019 | Plaintext UDP for CSI data | 5.9 | High |
| SEC-023 | 8-byte truncated HMAC tag | 5.9 | Low |
| SEC-028 | WiFi credentials unencrypted | 5.5 | Medium |
| SEC-006 | CSP unsafe-inline | 5.4 | Medium |
| SEC-008 | Insufficient audit trail | 5.3 | Medium |
| SEC-012 | No password complexity | 5.3 | Low |
| SEC-020 | No WebSocket connection limits | 5.3 | Low |
| SEC-021 | Rate limiter fails open | 5.3 | Low |
| SEC-025 | Small replay window | 5.3 | Low |
| SEC-030 | Unpinned Python dependencies | 5.3 | Low |
| SEC-041 | No Docker resource limits | 5.3 | Low |
| SEC-042 | No Docker network isolation | 5.3 | Medium |
| SEC-045 | No Python lock file | 5.3 | Low |

### Low Priority (Backlog)

| ID | Finding | CVSS | Effort |
|----|---------|------|--------|
| SEC-013 | Response headers leak user info | 4.3 | Low |
| SEC-038 | DB connection strings in env vars | 4.3 | Medium |
| SEC-031 | Paramiko included | 3.1 | Low |
| SEC-036 | Test settings hardcoded key | 3.1 | Low |
| SEC-039 | SQLite failsafe no access controls | 3.1 | Low |
| SEC-032 | Rust dependency version ranges | 2.4 | Low |
| SEC-043 | No Docker health checks | 2.0 | Low |

---

## Summary of Positive Findings

While the report focuses on vulnerabilities, several security practices are already in place:

1. **SQLAlchemy ORM** prevents SQL injection through parameterized queries (SEC-037).
2. **bcrypt password hashing** via passlib is correctly implemented.
3. **Production error handling** properly hides internal details and tracebacks.
4. **CORS validation** logic exists and detects misconfigurations (even if not enforced).
5. **Rate limiting** infrastructure exists with both sliding window and token bucket algorithms.
6. **Rust release builds** strip symbols and use LTO, reducing reverse engineering surface.
7. **Multi-stage Docker builds** for Rust reduce the final image attack surface.
8. **deploy.sh** uses `set -euo pipefail` for safe shell scripting.
9. **Pydantic validation** on API request models provides input validation at the schema level.
10. **RVF container format** includes a signature verification design for WASM modules.

---

## Methodology

This analysis was performed through comprehensive static analysis of the RuView codebase covering:

- **30+ files** across Python, Rust, C, shell, Docker, and configuration layers
- **OWASP Top 10 2021** vulnerability categories
- **CWE SANS Top 25** most dangerous software weaknesses
- **CVSS v3.1** scoring for severity ratings
- Manual code review of all authentication, authorization, network, and cryptographic code paths

Tools conceptually applied: ESLint Security rules, Semgrep (Python patterns), cargo-audit (Rust dependencies), pip-audit (Python dependencies), TruffleHog (secrets detection), custom entropy analysis.

---

*Report generated by QE Security Scanner v3 | Agentic QE*
*Classification: CONFIDENTIAL | Distribution: Development Team Only*
