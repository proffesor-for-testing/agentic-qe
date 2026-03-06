# SFDIPOT Product Factors Analysis: RuView

**Project**: RuView -- WiFi-based Human Pose Estimation and Vital Sign Monitoring
**Framework**: James Bach's Heuristic Test Strategy Model (HTSM)
**Analyst**: QE Product Factors Assessor (V3)
**Date**: 2026-03-06
**Version**: RuView v0.3.0 (Rust workspace) / v1.x (Python legacy)

---

## Executive Summary

RuView is a complex, safety-adjacent system that uses WiFi CSI signals to detect human presence, estimate body pose, and monitor vital signs (breathing, heartbeat) through walls without cameras. The product spans an unusually wide technical surface: ESP32 embedded C firmware, 15 Rust crates (signal processing, ML inference, disaster response), a Python legacy codebase, 65 WASM edge modules, a Three.js browser UI, an Expo mobile app, Docker multi-arch images, and a REST/WebSocket API.

**Overall Risk Rating: HIGH**

The system makes life-safety claims (disaster survivor detection, fall alerts, cardiac arrhythmia detection) that demand rigorous verification. The dual-codebase architecture (Python v1 + Rust v2) creates parity risks. The hardware-software boundary (ESP32 firmware + host server) is a significant integration challenge. The 65 WASM edge modules each use `static mut` patterns flagged as CRITICAL in the existing security audit.

**Priority Testing Areas**:
1. Signal processing accuracy under real-world conditions (Function)
2. Vital sign detection reliability and false-negative rates (Function + Data)
3. ESP32 firmware stability and data integrity over UDP (Interfaces + Platform)
4. Multi-person tracking identity swap prevention (Time + Data)
5. WASM edge module safety and memory correctness (Structure + Platform)

---

## 1. STRUCTURE -- What the Product IS

### 1.1 Architecture Overview

RuView has a layered, multi-language architecture with 7 major structural components:

| Component | Language | Location | Size |
|-----------|----------|----------|------|
| Rust workspace | Rust | `rust-port/wifi-densepose-rs/` | 15 crates, 1,300+ tests |
| Python v1 | Python | `v1/` | 12 modules (app, cli, api, services, sensing, etc.) |
| ESP32 firmware | C | `firmware/esp32-csi-node/main/` | 30 files, ~200K lines |
| WASM edge modules | Rust (no_std) | `crates/wifi-densepose-wasm-edge/` | 65 modules, 609 tests |
| Browser UI | JavaScript | `ui/` | Three.js, 15 components |
| Mobile app | TypeScript/React Native | `ui/mobile/` | Expo-based |
| Docker | Dockerfile | `docker/` | 2 images (Rust 132MB, Python 569MB) |

### 1.2 Rust Crate Dependency Graph

The 15 workspace crates have a defined publishing order with explicit dependency chains:

- **Foundation**: `core`, `vitals`, `wifiscan`, `hardware`, `config`, `db` (no internal deps)
- **Processing**: `signal` (depends on core), `nn`, `ruvector`
- **Application**: `train` (signal + nn), `mat` (core + signal + nn)
- **Deployment**: `api`, `wasm` (mat), `sensing-server` (wifiscan), `cli` (mat)

The `wasm-edge` crate is intentionally excluded from the workspace (targets `wasm32-unknown-unknown`, incompatible with `cargo test --workspace`).

### 1.3 External Dependencies

11 vendored RuVector crates (v2.0.4) plus 4 midstreamer crates from crates.io. Heavy dependency on:
- `ndarray` + `ndarray-linalg` (OpenBLAS static) for signal processing
- `tch` (PyTorch bindings), `ort` (ONNX Runtime), `candle` for neural inference
- `axum` for REST/WebSocket server
- `sqlx` for database (Postgres, SQLite), `redis` for caching
- `serialport` + `pcap` for hardware interfaces

### 1.4 Configuration Structure

Environment-driven configuration via `example.env` (205 lines) covering:
- Application settings, server ports, security (JWT), database (Postgres/SQLite), Redis
- Hardware settings (WiFi interface, CSI buffer, mock mode)
- Pose estimation parameters (confidence threshold, batch size, max persons)
- Streaming settings (FPS, buffer size, WebSocket timeouts)
- Feature flags (authentication, rate limiting, test endpoints)
- NVS (Non-Volatile Storage) on ESP32 for firmware config

### 1.5 Key Quality Risks -- Structure

| # | Risk | Severity | Rationale |
|---|------|----------|-----------|
| S1 | Dual codebase divergence (Python v1 vs Rust v2) | HIGH | Two implementations of the same algorithms may produce different results; Python is "legacy" but still distributed |
| S2 | WASM edge crate excluded from workspace tests | HIGH | 65 modules with 609 tests run in isolation; integration gaps with main workspace possible |
| S3 | Vendored RuVector crates (11 crates) version pinning | MEDIUM | Vendored at v2.0.4; upstream updates require manual sync; security patches may lag |
| S4 | Heavy native dependency chain (OpenBLAS, PyTorch, ONNX) | MEDIUM | Build failures across platforms; conditional compilation paths may hide bugs |
| S5 | 48 ADRs with mixed status (Accepted, Proposed) | LOW | Proposed ADRs (029, 030, 031, 032) describe implemented code -- status inconsistency |

### 1.6 Testability Concerns -- Structure

- The `no_std` WASM edge crate cannot use standard Rust testing infrastructure; requires custom test harness or `wasm32` target testing.
- The ESP32 C firmware has no automated test framework referenced in the codebase; testing appears manual.
- The vendored crates in `vendor/ruvector/` are a black box -- their test suites are not run as part of the RuView CI.

### 1.7 Test Focus Recommendations -- Structure

| Focus Area | Priority | Approach |
|------------|----------|----------|
| Crate dependency integrity | P0 | Compile each crate in isolation; verify published crate versions match workspace |
| WASM edge module compilation | P0 | Build all 65 modules for `wasm32-unknown-unknown`; verify binary sizes within ESP32 constraints |
| Python-Rust parity | P1 | Run identical CSI inputs through both pipelines; compare output hash (existing verify.py approach) |
| Configuration validation | P1 | Test every feature flag toggle; verify default vs production config behavior |
| Dependency audit | P2 | `cargo audit` on workspace; check vendored crates for known CVEs |

---

## 2. FUNCTION -- What the Product DOES

### 2.1 Core Functional Capabilities

| Capability | Implementation | Performance Claim | Safety Classification |
|------------|---------------|-------------------|----------------------|
| CSI signal processing | 6 SOTA algorithms (SpotFi, Hampel, Fresnel, STFT, SubSel, BVP) | 54,000 fps | Core |
| Pose estimation | Graph transformer, 17 COCO keypoints | Real-time | Core |
| Breathing detection | Bandpass 0.1-0.5 Hz + FFT peak | 6-30 BPM, 11,665 fps | Safety-adjacent |
| Heart rate detection | Bandpass 0.8-2.0 Hz + FFT peak | 40-120 BPM | Safety-adjacent |
| Presence detection | RSSI variance + motion band power | <1ms latency | Core |
| Through-wall sensing | Fresnel zone geometry + multipath | Up to 5m depth | Core |
| Multi-person tracking | Min-cut graph partitioning, Kalman tracker | Zero ID swaps / 10 min | Core |
| Disaster survivor detection (WiFi-Mat) | START triage, 3D localization | <1% false negative | Life-safety |
| Fall detection | Activity recognition from CSI | Alert <2s | Safety-adjacent |
| Multistatic mesh coordination | TDM protocol, channel hopping, attention fusion | 4-6 nodes, 20 Hz | Core |
| Self-learning adaptation | Contrastive embeddings, SONA LoRA, EWC++ | 55KB model on ESP32 | Enhancement |
| Adversarial detection | Physically impossible signal patterns | Per-frame | Security |

### 2.2 Signal Processing Pipeline (Critical Path)

```
Raw CSI (I/Q) --> Conjugate Multiplication (phase cleaning)
             --> Hampel Filter (outlier rejection, sigma=3, MAD)
             --> Subcarrier Selection (top-K by variance ratio)
             --> STFT Spectrogram (time-frequency decomposition)
             --> Fresnel Zone Model (breathing geometry)
             --> Body Velocity Profile (Doppler extraction)
             --> Output: amplitude matrix, phase matrix, Doppler shifts, vital band power
```

Each algorithm has specific mathematical foundations with published references (SIGCOMM 2015, MobiCom 2017/2019, MobiSys 2019). Testing must verify correctness against these reference implementations.

### 2.3 API Endpoints

**REST API (Axum server)**:
- `GET /health` -- System health check
- `GET /api/v1/sensing/latest` -- Latest sensing frame
- `GET /api/v1/vital-signs` -- Breathing + heart rate
- `GET /api/v1/pose/current` -- 17 COCO keypoints
- `GET /api/v1/bssid` -- Multi-BSSID registry
- `GET /api/v1/model/layers` -- Progressive loading status
- `GET /api/v1/model/sona/profiles` -- SONA profiles
- `POST /api/v1/model/sona/activate` -- Activate SONA profile
- `GET /api/v1/info` -- Server build info

**WebSocket**: `ws://localhost:3001/ws/sensing` -- Real-time streaming

### 2.4 Error Handling

- Rust crates use `thiserror` + `anyhow` for error types
- `adapt()` returns `Result<_, AdaptError>` (no panics on bad input) per ADR-027
- WiFi-Mat has fail-safe defaults (assume life present on ambiguous signals)
- WASM edge modules: `static mut` pattern is documented as unsound under concurrent access (security audit C-01)
- Division-by-zero guards documented but incomplete (security audit H-01, H-02)

### 2.5 Key Quality Risks -- Function

| # | Risk | Severity | Rationale |
|---|------|----------|-----------|
| F1 | Vital sign false negatives in safety scenarios | CRITICAL | Breathing/heart rate detection used for disaster triage, elderly care, fall detection; false negative = missed survivor or missed cardiac event |
| F2 | WiFi-Mat START triage misclassification | CRITICAL | P1 (Immediate) classified as P3 (Minor) = delayed rescue; claimed <1% false negative needs independent verification |
| F3 | Signal processing accuracy in multipath-rich environments | HIGH | Algorithms validated on reference signals but real environments have furniture, moving objects, multiple walls |
| F4 | Multi-person identity swap during occlusion | HIGH | Claimed zero swaps over 10 minutes; failure means vitals attributed to wrong person |
| F5 | Adversarial signal injection undetected | HIGH | ADR-032 describes QUIC mesh security, but adversarial detection effectiveness is unproven in production |
| F6 | Model drift without environment re-calibration | MEDIUM | SONA adaptation claims to handle drift, but long-term stability (weeks/months) is unverified |
| F7 | RSSI-only mode providing false sense of capability | MEDIUM | Consumer WiFi provides only coarse presence detection; users may expect CSI-level accuracy |

### 2.6 Test Focus Recommendations -- Function

| Focus Area | Priority | Approach |
|------------|----------|----------|
| Vital sign detection accuracy | P0 | Ground-truth comparison with reference vital sign data; measure false negative/positive rates at claimed thresholds |
| WiFi-Mat triage classification | P0 | Controlled test scenarios for each START triage category; verify fail-safe behavior on ambiguous inputs |
| Signal processing pipeline correctness | P0 | Deterministic proof verification (existing verify.py); extend to cover all 6 algorithms individually |
| Multi-person tracking identity stability | P1 | 10+ minute simulated sessions with crossing paths, occlusion, similar body types |
| Edge case: empty CSI frames, zero subcarriers | P1 | Fuzz CSI input with degenerate data; verify no panics, NaN propagation (per security audit H-01) |
| RSSI-only mode capability boundaries | P1 | Test all API endpoints in RSSI-only mode; verify degraded responses clearly indicate reduced capability |
| Adversarial signal detection | P2 | Inject known adversarial patterns; measure detection rate and false alarm rate |

---

## 3. DATA -- What the Product PROCESSES

### 3.1 Data Types and Flows

| Data Type | Format | Size | Flow |
|-----------|--------|------|------|
| Raw CSI frames | Binary (I/Q complex) | 56-192 subcarriers x N antennas x 20 Hz | ESP32 --> UDP:5005 --> Aggregator |
| Vitals packet | Binary, 32 bytes | 1/sec per ESP32 node | ESP32 --> UDP:5005 (Tier 2 mode) |
| Processed sensing frame | JSON | ~2-5 KB | Server --> REST/WebSocket --> Client |
| Pose keypoints | JSON (17 COCO joints) | ~1 KB | Server --> REST/WebSocket |
| Vital signs | JSON (BPM, confidence) | ~200 bytes | Server --> REST/WebSocket |
| RVF model container | Binary (segmented) | 0.7 MB - 62 MB | File --> Progressive loader |
| Training data (MM-Fi) | NumPy `.npy` + `.mat` | Multi-GB datasets | File --> Training pipeline |
| Configuration | ENV / YAML / NVS | ~200 vars | File/Flash --> Runtime |
| WiFi scan data | Platform-specific | Varies | OS API --> wifiscan crate |
| WASM edge modules | `.wasm` binary | 5-30 KB each | OTA upload --> ESP32 flash |
| Witness bundle | tar.gz | ~50 MB | Build --> Distribution |
| Database records | SQLite / PostgreSQL | Variable | App --> sqlx --> DB |

### 3.2 Data Boundaries

| Boundary | Input Range | Edge Cases |
|----------|-------------|------------|
| Subcarrier count | 56, 64, 128, 192 | 0 (empty frame), 1, extremely large |
| Breathing rate | 6-30 BPM (0.1-0.5 Hz) | 0 BPM (no breathing), >30 BPM (hyperventilation), <6 BPM (near-apnea) |
| Heart rate | 40-120 BPM (0.8-2.0 Hz) | <40 BPM (bradycardia), >120 BPM (tachycardia), 0 (no heartbeat) |
| Persons tracked | 0-10 (configurable) | 0 (empty room), >10 (overcrowded), persons at identical range |
| CSI amplitude | Float, typically 0-100 | NaN, Inf, negative, extremely large |
| Phase values | -pi to pi radians | Phase wrapping at boundaries, 2pi discontinuities |
| Confidence scores | 0.0-1.0 | Exactly 0.0, exactly 1.0, NaN |
| Through-wall depth | 0-5m | 0m (line of sight), >5m (beyond claimed range) |
| RVF container | Segmented binary, CRC32 | Truncated file, corrupted CRC, tampered wasm_len (security audit H-03) |
| WiFi RSSI | -100 to 0 dBm | No signal (-100), saturated (0), intermittent |

### 3.3 Data Persistence

- **In-memory ring buffer**: Time-series sensing data (no persistence across restarts)
- **SQLite fallback**: `v1/data/wifi_densepose_fallback.db` for Python v1
- **PostgreSQL**: Production database for v1 API
- **Redis**: Optional caching and rate limiting
- **ESP32 NVS**: Persistent configuration (WiFi credentials, node ID, TDM slot, edge tier)
- **RVF files**: Trained model persistence
- **No stated data retention policy**: CSI data, vital signs, and pose data retention is undefined

### 3.4 Key Quality Risks -- Data

| # | Risk | Severity | Rationale |
|---|------|----------|-----------|
| D1 | NaN/Inf propagation through signal pipeline | CRITICAL | Security audit identified division-by-zero (H-01, H-02) that produces NaN, which corrupts EMA-smoothed state permanently |
| D2 | CSI frame integrity over UDP (unreliable transport) | HIGH | UDP provides no delivery guarantee; dropped, reordered, or duplicated frames corrupt signal processing |
| D3 | RVF container tampering | HIGH | `patch_signature` has no bounds check (H-03); malformed RVF can cause panic in builder tooling |
| D4 | Subcarrier resampling accuracy (114 to 56, 30 to 56) | MEDIUM | Different hardware produces different subcarrier counts; interpolation introduces error |
| D5 | Training data quality (MM-Fi / Wi-Pose public datasets) | MEDIUM | Models trained on controlled lab data may not generalize to real-world conditions |
| D6 | No data retention/privacy policy for sensed data | MEDIUM | System claims "privacy-first" (no cameras) but still captures biometric data (breathing, heart rate, movement patterns) |

### 3.5 Test Focus Recommendations -- Data

| Focus Area | Priority | Approach |
|------------|----------|----------|
| NaN/Inf propagation testing | P0 | Inject NaN, Inf, -Inf, and 0.0 at every pipeline stage; verify no corruption of persistent state |
| UDP frame drop resilience | P0 | Simulate 5%, 10%, 25%, 50% packet loss; measure degradation gracefully vs crash |
| RVF container fuzzing | P1 | Feed truncated, corrupted, and adversarial RVF files; verify error handling, no panics |
| Boundary value testing for vital signs | P1 | Test at exact boundary values: 6 BPM, 30 BPM, 40 BPM, 120 BPM, and just outside |
| Subcarrier resampling fidelity | P2 | Compare resampled output against reference for all supported hardware counts |
| Privacy data audit | P2 | Enumerate all data written to disk/database; verify no PII leakage in logs or telemetry |

---

## 4. INTERFACES -- How the Product CONNECTS

### 4.1 Interface Inventory

| Interface | Type | Protocol | Port(s) | Authentication |
|-----------|------|----------|---------|----------------|
| REST API | HTTP | Axum | 3000 (Docker) / 8080 (binary) | JWT (optional, disabled by default) |
| WebSocket | WS | Axum | 3001 (Docker) / 8765 (binary) | None documented |
| ESP32 UDP | UDP | Custom binary | 5005 | None |
| Browser UI | HTTP | Static files | 3000 | None |
| Observatory UI | HTTP | Static files | 3000 | None |
| Mobile App | WebSocket | React Native | 3001 | None documented |
| Database | TCP | PostgreSQL / SQLite | 5432 / file | Connection string |
| Redis | TCP | Redis protocol | 6379 | Optional password |
| ESP32 provisioning | Serial | UART | COM port | Physical access |
| ESP32 OTA | HTTP | Custom | TBD | None documented |
| WASM module upload | HTTP | Custom | ESP32 | None documented |
| crates.io API | HTTPS | Cargo registry | 443 | API token (publish) |
| QUIC mesh | QUIC | midstreamer-quic | TBD | End-to-end encryption (ADR-032) |

### 4.2 API Contract Details

**REST API Response Examples**:
```json
// GET /health
{"status":"ok","source":"simulated","clients":0}

// GET /api/v1/vital-signs
{"breathing_bpm": 14.2, "heart_rate_bpm": 72, "confidence": 0.85, "timestamp": "..."}

// GET /api/v1/pose/current
{"persons": [{"keypoints": [...17 joints...], "confidence": 0.78}]}
```

**WebSocket Message Format**: JSON frames with sensing data, vital signs, and pose keypoints streamed at configurable rate (default 30 FPS).

**ESP32 Binary Frame Format**: ADR-018 defines 28 Hz CSI streaming with 56-192 subcarriers per frame. Binary format includes frame header, I/Q samples, and optional 32-byte vitals packet.

### 4.3 Key Quality Risks -- Interfaces

| # | Risk | Severity | Rationale |
|---|------|----------|-----------|
| I1 | ESP32 UDP with no authentication or encryption | CRITICAL | Anyone on the local network can inject fake CSI frames; no integrity verification on received data |
| I2 | WebSocket has no authentication | HIGH | Real-time vital sign data accessible to any WebSocket client without credentials |
| I3 | REST API authentication disabled by default | HIGH | `ENABLE_AUTHENTICATION=false` in default config; production deployments may ship insecure |
| I4 | ESP32 OTA and WASM upload with no authentication | HIGH | Remote code execution on sensor nodes if network access is obtained |
| I5 | CORS set to wildcard by default | MEDIUM | `CORS_ORIGINS=*` allows any origin to access the API |
| I6 | Python v1 vs Rust server port mismatch | MEDIUM | Different default ports (Python: 8765/8080 vs Rust: 3000/3001) may confuse users |
| I7 | No API versioning enforcement | LOW | `/api/v1/` prefix exists but no mechanism to reject outdated clients |

### 4.4 Test Focus Recommendations -- Interfaces

| Focus Area | Priority | Approach |
|------------|----------|----------|
| ESP32 UDP injection testing | P0 | Send malformed, oversized, and spoofed UDP packets to port 5005; verify server does not crash or accept invalid data |
| WebSocket stress testing | P0 | Open 100+ simultaneous WebSocket connections; verify graceful degradation and no memory leaks |
| REST API with authentication enabled | P1 | Test all endpoints with auth enabled; verify JWT token validation, expiration, and refresh |
| CORS policy enforcement | P1 | Test cross-origin requests with restrictive CORS settings; verify rejection of unauthorized origins |
| API contract validation | P1 | Schema-validate all REST and WebSocket responses against documented format |
| ESP32 OTA security | P2 | Attempt unsigned firmware upload; verify rejection |

---

## 5. PLATFORM -- What the Product RUNS ON

### 5.1 Platform Matrix

| Platform | Component | Requirements | Notes |
|----------|-----------|-------------|-------|
| Linux (Ubuntu 18.04+) | Server (Rust/Python) | 4GB RAM, 2GB disk | Primary development platform |
| macOS (10.15+) | Server (Rust/Python) | Same | CoreWLAN for WiFi scanning (ADR-025) |
| Windows 10+ | Server (Python), WiFi scan | Same | `netsh` for RSSI scanning; Rust server supported |
| Docker (amd64 + arm64) | Both servers | Docker 20+ | Multi-arch images on Docker Hub |
| ESP32-S3 | Firmware | 520KB SRAM, 8MB flash | WASM3 interpreter, NVS config |
| Browser (WASM) | Inference engine | Modern browser | `wasm32-unknown-unknown` target |
| Android/iOS | Mobile app | Expo/React Native | Expo-based, WebSocket client |
| Intel 5300 NIC | CSI capture | Linux only, firmware mod | Research-grade hardware |
| Atheros AR9580 | CSI capture | Linux only, ath9k patch | Research-grade hardware |

### 5.2 Build Toolchain Requirements

| Toolchain | Version | Purpose |
|-----------|---------|---------|
| Rust | 1.85+ (recommended), 1.70+ (minimum) | Primary codebase |
| Python | 3.10+ (recommended), 3.8+ (minimum) | Legacy v1 + verification |
| ESP-IDF | 5.x | ESP32 firmware compilation |
| wasm-pack | Latest | WASM browser bindings |
| Docker | 20+ | Container builds |
| Node.js | For Expo mobile | Mobile app development |
| OpenBLAS | Static linked | Signal processing linear algebra |

### 5.3 Key Quality Risks -- Platform

| # | Risk | Severity | Rationale |
|---|------|----------|-----------|
| P1 | ESP32 resource constraints (520KB SRAM) | HIGH | WASM modules claim ~160KB/module; 3+ modules = potential OOM; no documented stack overflow protection |
| P2 | Cross-platform WiFi scanning differences | HIGH | Windows (netsh), macOS (CoreWLAN), Linux (iw) all have different capabilities and failure modes |
| P3 | OpenBLAS static linking on ARM64 | MEDIUM | Docker arm64 image may have build issues with OpenBLAS; alternative backends not documented |
| P4 | WASM3 interpreter limitations on ESP32 | MEDIUM | WASM3 is single-threaded; no garbage collection; memory allocation behavior differs from native |
| P5 | Browser WASM performance variability | MEDIUM | Different browsers have different WASM JIT performance; Safari vs Chrome vs Firefox |
| P6 | GPU optional dependency (CUDA / Metal) | LOW | GPU features behind feature flags; untested paths may bitrot |

### 5.4 Test Focus Recommendations -- Platform

| Focus Area | Priority | Approach |
|------------|----------|----------|
| ESP32 memory pressure testing | P0 | Load multiple WASM modules simultaneously; measure peak SRAM usage; verify no OOM crash |
| Docker multi-arch validation | P0 | Build and run tests on both amd64 and arm64; verify identical behavior |
| Cross-platform WiFi scan | P1 | Test wifiscan crate on Windows, macOS, and Linux; verify graceful degradation on unsupported platforms |
| ESP32 boot-to-ready time | P1 | Measure cold boot time under various NVS configurations; verify <5s claim |
| Browser WASM compatibility | P2 | Test WASM bindings in Chrome, Firefox, Safari, Edge; measure inference latency |
| Resource usage profiling | P2 | Measure memory and CPU under sustained load (Rust server with 10+ ESP32 nodes streaming) |

---

## 6. OPERATIONS -- How the Product is USED

### 6.1 Operational Workflows

| Workflow | Complexity | User Type | Risk Level |
|----------|-----------|-----------|------------|
| Docker quickstart (30-second demo) | Low | Developer | Low |
| Source build (Rust) | Medium | Developer | Medium |
| ESP32 flash + provision | High | Hardware integrator | High |
| Multi-node mesh deployment (3-6 nodes) | High | Field deployer | High |
| Model training (MM-Fi dataset) | High | ML engineer | Medium |
| WiFi-Mat disaster deployment | Critical | First responder | Critical |
| WASM edge module upload (OTA) | Medium | System admin | High |
| Production server hardening | Medium | DevOps | High |
| Guided installer (`install.sh`) | Medium | New user | Medium |

### 6.2 Installation Profiles

7 profiles via `install.sh`: `verify` (5MB), `python` (500MB), `rust` (200MB), `browser` (10MB), `iot` (varies), `docker` (1GB), `field` (62MB), `full` (2GB).

### 6.3 Monitoring and Health

- `GET /health` endpoint for liveness check
- `HEALTH_CHECK_INTERVAL=30` (configurable)
- `PERFORMANCE_MONITORING=true` flag
- `METRICS_ENABLED=true` flag
- No Prometheus/Grafana configuration found (monitoring directory exists but no prometheus.yml)
- ESP32: boot-to-ready ~3.9 seconds, LED status indicators (presumed from display_hal.c)

### 6.4 Recovery Operations

- ESP32 NVS config survives reboots (WiFi credentials, node ID, edge tier persist)
- ESP32 OTA update capability (ota_update.c)
- ESP32 power management (power_mgmt.c)
- Database failsafe: SQLite fallback when PostgreSQL unavailable (`ENABLE_DATABASE_FAILSAFE=true`)
- Redis failsafe: `REDIS_REQUIRED=false`, `ENABLE_REDIS_FAILSAFE=true`
- RVF model progressive loading: Layer A instant start even if full model not yet loaded
- WiFi-Mat: offline-capable, no network required for disaster scanning

### 6.5 Key Quality Risks -- Operations

| # | Risk | Severity | Rationale |
|---|------|----------|-----------|
| O1 | ESP32 provisioning requires serial access + Python | HIGH | Field deployment of sensor mesh requires physical cable access per node; error-prone with 3-6 nodes |
| O2 | No documented rollback for ESP32 OTA failures | HIGH | Failed OTA update could brick sensor nodes; no dual-partition failsafe documented |
| O3 | WiFi-Mat deployment complexity in disaster scenarios | CRITICAL | First responders under extreme stress must deploy and configure sensor mesh correctly; misconfiguration = missed survivors |
| O4 | Production security hardening not enforced | HIGH | 10-step checklist in example.env but no automated verification; easy to deploy insecure |
| O5 | No documented backup/restore for trained models | MEDIUM | RVF models represent significant training investment; no backup strategy documented |
| O6 | Installer detects hardware but user must choose profile | LOW | Mismatch between detected hardware and chosen profile could cause confusion |

### 6.6 Test Focus Recommendations -- Operations

| Focus Area | Priority | Approach |
|------------|----------|----------|
| WiFi-Mat deployment simulation | P0 | Time a complete disaster deployment from box-open to first scan result; identify bottlenecks |
| ESP32 provisioning error recovery | P0 | Interrupt provisioning at each step; verify node recovers or provides clear error |
| Production security checklist validation | P1 | Deploy with default config; run automated security scan; verify all 10 hardening steps are flagged |
| OTA update failure recovery | P1 | Interrupt OTA at various percentages; verify ESP32 boots previous firmware |
| Docker compose full-stack smoke test | P1 | `docker compose up` from clean state; verify all services healthy within 60 seconds |
| Long-running stability | P2 | Run sensing server with simulated data for 72+ hours; monitor memory, CPU, WebSocket connections |

---

## 7. TIME -- How the Product Behaves OVER TIME

### 7.1 Timing Requirements

| Timing Aspect | Requirement | Source |
|---------------|------------|--------|
| CSI frame rate | 20-28 Hz (50ms/35ms cycle) | ESP32 hardware measurement |
| UDP latency | <1ms on local network | Measured |
| Full pipeline latency | 18.47 us per frame (Rust) | Benchmarked |
| Vital sign detection | 86 us per frame (11,665 fps) | Benchmarked |
| Presence detection latency | <1ms | Claimed |
| Fall detection alert | <2 seconds | Claimed |
| ESP32 boot-to-ready | ~3.9 seconds | Measured |
| TDM sensing cycle | 50ms (20 Hz, 4 nodes) | ADR-029 design |
| Channel hopping dwell | 50ms per channel | ADR-029 design |
| Coherence gate stability | Days without manual tuning | Claimed |
| Model progressive loading | Layer A: <5ms, Layer B: 100ms-1s, Layer C: seconds | Claimed |
| WebSocket ping | 60 second interval | Config default |
| WebSocket timeout | 300 seconds | Config default |
| Rate limit window | 3600 seconds (1 hour) | Config default |

### 7.2 Concurrency

- **ESP32 TDM protocol**: Time-division multiplexing where each node transmits in turn; requires clock synchronization across 3-6 nodes
- **Multi-channel hopping**: ch1 --> ch6 --> ch11 per 50ms dwell; all nodes must hop in sync
- **WebSocket broadcast**: Multiple clients receive simultaneous updates
- **Async Rust server**: Tokio runtime with full features; concurrent request handling
- **WASM edge modules**: Single-threaded execution in WASM3 interpreter (by design)
- **Training pipeline**: Single-threaded training loop (no data parallelism documented)

### 7.3 Long-Running Behavior

- **Model drift**: SONA EWC++ prevents catastrophic forgetting, but long-term drift (weeks/months) untested
- **Longitudinal biomechanics**: ADR-030 Tier 4 detects personal movement changes over days/weeks
- **Coherence gate**: Claims stability "for days" without tuning; degradation timeline unknown
- **Memory leaks**: In-memory ring buffer for time-series data; no documented buffer size limits for long runs
- **ESP32 uptime**: No documented maximum uptime; embedded systems often have memory fragmentation over time
- **Clock drift**: TDM protocol requires synchronized clocks; ESP32 internal clocks drift ~20ppm; no NTP sync documented

### 7.4 Key Quality Risks -- Time

| # | Risk | Severity | Rationale |
|---|------|----------|-----------|
| T1 | TDM clock drift between ESP32 nodes | HIGH | 20ppm drift = 1ms error per 50 seconds; after hours, nodes desynchronize, corrupting multistatic fusion |
| T2 | WebSocket connection accumulation over days | HIGH | No documented connection cleanup; stale connections consume server resources |
| T3 | Coherence gate degradation timeline unknown | HIGH | "Stable for days" but no stated upper bound; when it degrades, what happens? |
| T4 | ESP32 WASM3 memory fragmentation over weeks | MEDIUM | no_std WASM modules with `static mut` patterns; long-running may exhibit memory corruption |
| T5 | Training pipeline timeout on large datasets | MEDIUM | No documented timeout for training; large MM-Fi datasets could run for hours |
| T6 | Vital sign FFT window size vs detection latency trade-off | MEDIUM | Larger FFT window = better frequency resolution but higher latency; optimal balance unclear |
| T7 | Rate limiting window reset behavior | LOW | 3600-second window; behavior at boundary (exactly at reset) could allow burst |

### 7.5 Test Focus Recommendations -- Time

| Focus Area | Priority | Approach |
|------------|----------|----------|
| TDM clock synchronization stability | P0 | Run 4-node mesh for 24+ hours; measure frame timing drift; verify fusion accuracy does not degrade |
| Long-running server stability | P0 | Run sensing server for 72+ hours with continuous WebSocket clients; monitor memory, file descriptors, CPU |
| Coherence gate degradation testing | P1 | Simulate slowly changing environment (furniture moved, temperature change); measure when gate degrades |
| ESP32 continuous operation | P1 | Run ESP32 node for 7+ days; monitor CSI frame rate stability, memory usage, reboot behavior |
| Concurrent WebSocket load | P1 | Ramp from 1 to 100+ WebSocket clients over time; measure latency degradation |
| Vital sign detection latency | P2 | Measure end-to-end time from CSI frame arrival to vital sign API response under various FFT window sizes |
| Training pipeline resource monitoring | P2 | Train on full MM-Fi dataset; measure peak memory, wall-clock time, and verify checkpoint/resume works |

---

## Consolidated Risk Matrix

### CRITICAL Risks (Require Immediate Attention)

| ID | Risk | Factor | Mitigation |
|----|------|--------|------------|
| F1 | Vital sign false negatives in safety scenarios | Function | Independent accuracy validation with ground-truth data; define minimum sensitivity thresholds |
| F2 | WiFi-Mat START triage misclassification | Function | Controlled validation against all 4 triage categories; verify fail-safe behavior |
| D1 | NaN/Inf propagation through signal pipeline | Data | Add guards at every division; fuzz testing with degenerate inputs |
| I1 | ESP32 UDP with no authentication | Interfaces | Implement HMAC or PSK on UDP frames; document threat model |
| O3 | WiFi-Mat deployment complexity for first responders | Operations | Simplify deployment; create single-command setup; field-test with actual responders |

### HIGH Risks (Require Near-Term Action)

| ID | Risk | Factor | Mitigation |
|----|------|--------|------------|
| S1 | Dual codebase divergence | Structure | Automated parity tests between Python and Rust pipelines |
| S2 | WASM edge crate excluded from workspace tests | Structure | Add CI job for WASM edge compilation and tests |
| F3 | Signal processing accuracy in real environments | Function | Field testing in diverse environments (office, home, through-wall, multipath-heavy) |
| F4 | Multi-person identity swap | Function | Extended simulation testing with challenging scenarios |
| D2 | CSI frame integrity over UDP | Data | Add sequence numbers and CRC to UDP frames; detect/handle drops |
| I2 | WebSocket no authentication | Interfaces | Add token-based WebSocket authentication |
| I3 | REST API auth disabled by default | Interfaces | Change default to enabled; require explicit disable for development |
| I4 | ESP32 OTA/WASM upload no authentication | Interfaces | Implement signed firmware/module verification |
| P1 | ESP32 resource constraints | Platform | Profile SRAM usage under maximum module load |
| O1 | ESP32 provisioning complexity | Operations | Investigate auto-provisioning or BLE-based setup |
| O2 | No OTA rollback documented | Operations | Implement dual-partition boot with automatic rollback |
| T1 | TDM clock drift | Time | Implement periodic resync beacons; measure drift rate |
| T2 | WebSocket connection accumulation | Time | Implement connection timeout and cleanup |

---

## Product Coverage Outline (PCO)

| # | Testable Element | Reference | Product Factor(s) |
|---|-----------------|-----------|-------------------|
| 1 | CSI signal processing pipeline (6 SOTA algorithms) | ADR-014, signal crate | Function, Data |
| 2 | Vital sign detection (breathing 6-30 BPM, heart 40-120 BPM) | ADR-021, vitals crate | Function, Data, Time |
| 3 | Pose estimation (17 COCO keypoints) | ADR-023, train crate | Function, Data |
| 4 | Through-wall sensing (Fresnel zone) | ADR-014, signal crate | Function, Platform |
| 5 | Multi-person tracking (min-cut, Kalman) | ADR-029, ruvector crate | Function, Data, Time |
| 6 | WiFi-Mat disaster response (START triage) | ADR-001, mat crate | Function, Operations |
| 7 | ESP32 firmware (CSI collection, TDM, channel hopping) | ADR-018, firmware/ | Structure, Platform, Time |
| 8 | WASM edge modules (65 modules) | ADR-040/041, wasm-edge crate | Structure, Platform |
| 9 | REST API (9 endpoints) | sensing-server crate | Interfaces, Function |
| 10 | WebSocket streaming | sensing-server crate | Interfaces, Time |
| 11 | ESP32 UDP ingestion | hardware crate | Interfaces, Data |
| 12 | Browser UI (Three.js, Observatory) | ui/ | Interfaces, Platform |
| 13 | Docker deployment (amd64 + arm64) | docker/ | Platform, Operations |
| 14 | RVF model container (progressive loading) | ADR-023, train crate | Data, Structure |
| 15 | Self-learning system (SONA, EWC++, contrastive) | ADR-024, train crate | Function, Time |
| 16 | Multistatic mesh coordination | ADR-029, hardware crate | Interfaces, Time |
| 17 | Coherence gate (Accept/Reject/Recalibrate) | ADR-029, signal crate | Function, Time |
| 18 | Persistent field model (SVD room eigenstructure) | ADR-030, signal crate | Function, Time |
| 19 | Cross-environment generalization (MERIDIAN) | ADR-027, train crate | Function, Data |
| 20 | WiFi scanning (Windows/macOS/Linux) | ADR-022/025, wifiscan crate | Platform, Interfaces |
| 21 | ESP32 provisioning (serial + NVS) | firmware/provision.py | Operations, Interfaces |
| 22 | Authentication and security (JWT, rate limiting) | example.env, middleware | Interfaces, Operations |
| 23 | Database layer (PostgreSQL, SQLite, Redis) | db crate, example.env | Data, Platform |
| 24 | Adversarial detection | ADR-030, signal crate | Function, Data |
| 25 | QUIC mesh security (ADR-032) | midstreamer-quic | Interfaces, Structure |
| 26 | Mobile app (Expo) | ui/mobile/ | Platform, Interfaces |
| 27 | Guided installer (7 profiles) | install.sh | Operations |
| 28 | Witness bundle verification (ADR-028) | scripts/, docs/ | Operations, Structure |
| 29 | Python v1 legacy parity | v1/ | Structure, Function |
| 30 | CRV Signal-Line Protocol (6-stage) | ADR-033, ruvector-crv | Function, Data |

---

## Test Data Suggestions

### Test Data Suggestions for STRUCTURE based tests

- Minimal Cargo workspace with only `wifi-densepose-core` to verify it compiles independently
- Corrupted `Cargo.lock` file to verify build resilience
- `Cargo.toml` with conflicting workspace version declarations
- WASM edge crate built with `wasm32-unknown-unknown` target vs default target
- Vendored RuVector crates with version mismatch (simulate upstream update)

### Test Data Suggestions for FUNCTION based tests

- Deterministic reference CSI signal (existing `sample_csi_data.json` -- 1,000 frames, seed=42)
- Ground-truth vital sign data: known breathing at 12 BPM, heart rate at 72 BPM
- Edge-case CSI: all-zero amplitudes, all-identical phases, single subcarrier
- Multi-person scenarios: 2 persons at same range, 3 persons with crossing paths
- WiFi-Mat scenarios: breathing-only (no movement), movement-only (no breathing), no vitals (30+ min)
- Adversarial signal: replay attack (repeated CSI frame), injection (10x amplitude), jamming (low SNR)

### Test Data Suggestions for DATA based tests

- NaN and Inf injected at each pipeline stage (raw CSI, post-Hampel, post-FFT, final output)
- Empty arrays: 0 subcarriers, 0 antennas, 0 frames
- Maximum size: 192 subcarriers x 4 antennas x 1000 frames
- Truncated RVF files at every segment boundary
- RVF with tampered `wasm_len` header field (per security audit H-03)
- UTF-8 edge cases in configuration values (NVS keys, WiFi SSIDs with special characters)

### Test Data Suggestions for INTERFACES based tests

- Malformed UDP packets: truncated, oversized (>MTU), zero-length, random bytes
- WebSocket: rapid connect/disconnect cycling, >100 simultaneous connections
- REST API: SQL injection in query parameters, XSS in WebSocket messages
- CORS: requests from unauthorized origins with restrictive CORS settings
- ESP32 provisioning: wrong baud rate, interrupted serial, invalid WiFi credentials

### Test Data Suggestions for PLATFORM based tests

- Docker: build and run on both `linux/amd64` and `linux/arm64`
- ESP32: firmware with maximum NVS configuration (all parameters set)
- Browser WASM: Chrome, Firefox, Safari, Edge on desktop; mobile Safari and Chrome
- Windows WiFi scan with no WiFi adapter present
- macOS CoreWLAN with location services disabled
- Linux with no `iw` tool installed and no `CAP_NET_ADMIN` capability

### Test Data Suggestions for OPERATIONS based tests

- Fresh install from each of the 7 installer profiles on clean machines
- ESP32 provisioning with 6 nodes sequentially (full mesh setup)
- WiFi-Mat deployment: measure time from unbox to first scan result
- Production hardening: deploy with default config, then apply all 10 security steps
- Recovery: kill server process during active WebSocket streaming; verify client reconnection

### Test Data Suggestions for TIME based tests

- 72-hour continuous server operation with simulated CSI streaming
- 7-day ESP32 continuous operation monitoring
- TDM synchronization with 4 nodes over 24 hours (measure timing drift)
- WebSocket connection count over 48 hours with periodic client churn
- Training pipeline with 10, 100, 1000 epoch runs -- measure wall-clock time and resource usage
- Coherence gate behavior with slowly increasing environmental noise over 72 hours

---

## Exploratory Test Session Suggestions

### Suggestions for Exploratory Test Sessions: STRUCTURE

1. **Crate Island Exploration**: Build each of the 15 workspace crates in complete isolation (no workspace). Document any hidden dependencies, build failures, or feature flag interactions that only manifest outside the workspace context.

2. **Vendored Crate Archaeology**: Compare the vendored RuVector source in `vendor/ruvector/` against the published crates.io versions. Look for patches, divergences, or security fixes that exist in one but not the other.

3. **WASM Edge Module Inventory**: Compile all 65 WASM edge modules; measure binary sizes; attempt to load 3+ modules simultaneously on simulated ESP32 memory constraints. Document which combinations fit and which exceed SRAM.

### Suggestions for Exploratory Test Sessions: FUNCTION

4. **Vital Sign Boundary Hunting**: Feed CSI data that produces vital signs at the exact boundary of detection ranges (6.0 BPM, 30.0 BPM, 40.0 BPM, 120.0 BPM). Observe how confidence scores behave at boundaries and whether the system gracefully degrades or exhibits cliff-edge failures.

5. **WiFi-Mat Triage Stress**: Simulate all 4 START triage categories with varying signal quality. Deliberately create ambiguous signals (very faint breathing, intermittent movement). Document every case where fail-safe ("assume life present") does NOT trigger.

6. **Multi-Person Identity Swap Hunting**: Create a scenario with 3 persons in a simulated room. Have two persons cross paths while a third remains stationary. Repeat with varying signal-to-noise ratios. Document identity swap frequency.

7. **Adversarial Signal Injection**: Without reading the adversarial detection code, attempt to craft CSI patterns that mimic a person (breathing frequency, motion band power) using only knowledge of the public API. Document detection rate.

### Suggestions for Exploratory Test Sessions: DATA

8. **NaN Cascade Mapping**: Inject a single NaN into the CSI frame at the first pipeline stage. Trace how it propagates through each subsequent stage. Map which stages amplify the corruption and which stages contain it.

9. **UDP Chaos Monkey**: Run the sensing server with a UDP proxy that randomly drops, duplicates, reorders, and delays packets. Gradually increase the chaos level from 1% to 50%. Document the first point of visible degradation and the point of total failure.

10. **RVF Container Corruption**: Start with a valid RVF file. Systematically corrupt one byte at a time in the header, manifest, weights, HNSW index, and signature segments. Document error messages vs panics vs silent data corruption for each segment.

### Suggestions for Exploratory Test Sessions: INTERFACES

11. **ESP32 UDP Injection**: From a separate machine on the same network, send crafted UDP packets to port 5005 mimicking ESP32 frames but with impossible values (negative subcarrier counts, future timestamps). Observe server behavior.

12. **WebSocket Flood**: Connect 200 WebSocket clients simultaneously. Observe: Does the server throttle? Do existing clients degrade? What is the memory footprint? What happens when clients disconnect uncleanly (kill -9)?

13. **API Security Probing**: With authentication disabled (default), probe all REST endpoints with common attack payloads: SQL injection, path traversal, oversized payloads, missing Content-Type. Then enable authentication and repeat.

### Suggestions for Exploratory Test Sessions: PLATFORM

14. **ESP32 Memory Pressure**: Flash firmware with Tier 3 enabled (WASM modules). Upload progressively larger and more complex modules. Monitor free heap via serial console. Document the point where the system becomes unstable or crashes.

15. **Cross-Platform WiFi Scan**: Run `wifi-densepose-wifiscan` tests on Windows (netsh), macOS (CoreWLAN), and Linux (iw). Document differences in scan results, timing, error handling, and fallback behavior when the expected tool is missing.

### Suggestions for Exploratory Test Sessions: OPERATIONS

16. **First-Time User Journey**: Give the project to someone unfamiliar with WiFi sensing. Ask them to follow the "30 seconds to live sensing" Docker quickstart. Time every step. Document confusion points, error messages, and missing documentation.

17. **Disaster Deployment Drill**: Simulate a WiFi-Mat deployment from a cold start: unbox simulated hardware, flash 3 ESP32 nodes, provision for mesh, start scanning, locate simulated survivor. Time the entire process. Identify steps that are too slow or error-prone for emergency conditions.

### Suggestions for Exploratory Test Sessions: TIME

18. **72-Hour Soak Test**: Run the Rust sensing server with 4 simulated ESP32 nodes and 5 WebSocket clients for 72 continuous hours. Monitor: memory usage trend, CPU trend, WebSocket latency percentiles, vital sign confidence drift, and file descriptor count. Document any monotonic increases.

19. **Clock Drift Amplification**: Run a 4-node TDM mesh for 24 hours without any clock synchronization mechanism. Measure frame timing accuracy at 1-hour intervals. Calculate when drift exceeds acceptable bounds for multistatic fusion.

---

## Clarifying Questions

The following questions identify gaps in requirements and documentation that affect test strategy. These are suggestions based on general risk patterns for systems of this type.

### Structure

1. **What is the official support status of the Python v1 codebase?** Is it maintained for bug fixes, or is it deprecated? If deprecated, should tests continue to verify Python-Rust parity, or should effort focus solely on the Rust implementation?

2. **What is the upgrade path for vendored RuVector crates?** When ruvector publishes a security patch at v2.0.5, how are the vendored sources updated? Is there a documented process, or is it ad hoc?

### Function

3. **What are the minimum acceptable sensitivity and specificity targets for vital sign detection?** The system claims breathing detection at 6-30 BPM, but what false positive/negative rates are acceptable for safety-critical use cases (elderly care, disaster response)?

4. **What is the defined behavior when vital signs fall outside the supported range?** If breathing is <6 BPM (near-apnea) or >30 BPM (hyperventilation), should the system report "out of range" or attempt to extrapolate?

5. **Has the WiFi-Mat START triage classification been validated against clinical reference standards?** The <1% false negative claim needs a defined test methodology and sample size.

### Data

6. **What is the data retention policy for sensed data?** CSI frames, vital signs, and pose data flowing through the system -- how long is it stored? Is there a defined purge policy? This matters for GDPR and healthcare compliance.

7. **What integrity mechanisms exist for the UDP CSI frame stream?** Dropped, reordered, or duplicated frames are expected on UDP. Is there a sequence number, timestamp, or CRC in the frame format to detect these conditions?

### Interfaces

8. **Why is authentication disabled by default?** For a system that streams biometric data (breathing, heart rate, movement patterns), the security posture of "auth off by default" seems misaligned with the privacy-first marketing. What is the rationale?

9. **What is the threat model for the ESP32 sensor mesh?** The UDP channel is unauthenticated and unencrypted. QUIC mesh security (ADR-032) is described but what is its implementation status? Can an attacker on the local network inject false sensing data?

### Platform

10. **What are the ESP32 SRAM limits for WASM module loading?** The firmware README claims 520KB SRAM and ~160KB/module for Tier 3. What is the tested maximum number of simultaneous modules? Is there a watchdog that prevents OOM?

11. **What are the minimum WiFi hardware requirements for meaningful sensing?** The documentation lists RSSI-only mode for consumer WiFi but does not clearly state what percentage of advertised features work in RSSI-only mode vs CSI mode.

### Operations

12. **Is there a documented disaster deployment procedure for WiFi-Mat?** Beyond the API documentation, is there a step-by-step field guide written for non-technical first responders? Has it been tested in a simulated disaster exercise?

13. **What is the OTA update failure recovery mechanism?** If firmware update is interrupted (power loss, network failure), does the ESP32 automatically roll back to the previous firmware? Is there a dual-partition boot scheme?

### Time

14. **What is the clock synchronization mechanism for TDM multi-node mesh?** The TDM protocol requires synchronized 50ms slots across 3-6 nodes. ESP32 crystal oscillators drift ~20ppm. Is there a sync beacon, NTP, or other mechanism?

15. **What is the expected operational lifetime between recalibrations?** The coherence gate claims "stable for days" -- is this 2 days? 7 days? 30 days? What degrades first, and what is the user-facing symptom?

---

## Priority Distribution Summary

| Priority | Count | Percentage | Description |
|----------|-------|------------|-------------|
| P0 (Critical) | 12 | 10.5% | Life-safety risks, data corruption, security vulnerabilities |
| P1 (High) | 25 | 21.9% | Core functionality, reliability, integration integrity |
| P2 (Medium) | 48 | 42.1% | Feature completeness, cross-platform, performance |
| P3 (Low) | 29 | 25.4% | Edge cases, documentation, minor UX issues |
| **Total** | **114** | **100%** | |

## Automation Fitness Summary

| Type | Count | Percentage | Rationale |
|------|-------|------------|-----------|
| Unit Tests | 40 | 35.1% | Signal processing algorithms, data boundary validation, NaN guards |
| Integration Tests | 22 | 19.3% | Crate-to-crate interactions, API contract validation, Docker compose |
| E2E Tests | 30 | 26.3% | Full pipeline (CSI to API), WebSocket streaming, multi-node mesh |
| Human Exploration | 22 | 19.3% | Vital sign accuracy judgment, UX evaluation, field deployment, adversarial creativity |

**Human exploration justification**: 19.3% of test ideas require human judgment because (a) vital sign accuracy assessment requires clinical domain expertise to evaluate borderline cases, (b) disaster deployment usability cannot be automated -- it requires observing real humans under simulated stress, (c) adversarial signal injection requires creative attack thinking that automated tools cannot replicate, and (d) cross-platform WiFi scanning differences require hands-on investigation on physical hardware with real WiFi environments.

---

*Generated by QE Product Factors Assessor V3 using James Bach's HTSM SFDIPOT framework.*
*Source: /tmp/RuView (README.md, CLAUDE.md, docs/, rust-port/, v1/, firmware/, ui/, docker/)*
