# RuView Exploratory Testing Charters (Rust Codebase)

**Date**: 2026-03-06
**Prepared by**: AQE Queen Swarm
**Scope**: Rust port (15 crates + 65 WASM edge modules + ESP32 firmware)
**Estimated total effort**: 5 days (10 sessions, ~4 hours each)

---

## How to Use These Charters

Each charter follows the format:
- **Explore** [target area] **with** [resources/techniques] **to discover** [information sought]
- Time-boxed to ~4 hours per session
- Record all bugs, questions, and observations in session notes
- Debrief with team after each session

---

## Charter 1: Vital Sign Detection Boundary Conditions

**Explore** the vital sign detection pipeline (vitals crate: breathing 6-30 BPM, heartbeat 40-120 BPM)
**With** crafted signals at boundary values, noise injection, and combined vital signs
**To discover** false negatives, false positives, and accuracy degradation at boundaries

### Areas to Probe
- Breathing at exact boundaries: 6 BPM (minimum), 30 BPM (maximum), 5.9 BPM, 30.1 BPM
- Heartbeat at boundaries: 40 BPM (minimum), 120 BPM (maximum), 39 BPM, 121 BPM
- Simultaneous breathing + heartbeat detection (signal superposition)
- Signal with progressively increasing noise (SNR from 30dB down to 0dB)
- Flatline signal (no vital signs) -- does it correctly report "no detection"?
- Sudden change: 60 BPM -> 120 BPM in one second
- Very weak signal (subject far from sensor, through 2 walls)
- What happens when breathing and heartbeat frequencies overlap? (e.g., 30 BPM breathing ~ 0.5 Hz, 30 BPM heart ~ impossible but edge of filter)

### Risk Focus
Life-safety: A false negative in disaster response = missed survivor.

---

## Charter 2: Sensing Server Monolith Under Stress

**Explore** the sensing-server (main.rs, 3,741 lines) under concurrent client load and unusual request patterns
**With** multiple WebSocket clients, rapid connect/disconnect, oversized messages, and concurrent REST calls
**To discover** crashes, memory leaks, race conditions, and degraded responses

### Areas to Probe
- Connect 100 WebSocket clients simultaneously -- does the server survive?
- Rapid connect/disconnect cycling (100 connections/sec)
- Send oversized WebSocket frames (1MB, 10MB, 100MB)
- Send binary data to a text WebSocket endpoint
- Call REST endpoints while WebSocket streaming is active under load
- Kill a client mid-stream without clean close -- does the server clean up?
- What happens to the 37-field AppStateInner under concurrent mutation?
- Leave server running for 4 hours with continuous client traffic -- memory growth?
- Send malformed JSON to REST endpoints
- Call /health while all other services are degraded

### Risk Focus
The CC=65 main() function and 37-field god object suggest hidden state management bugs.

---

## Charter 3: ESP32 Firmware Resilience

**Explore** the ESP32 CSI capture firmware behavior under adverse conditions
**With** WiFi interference, power cycling, NVS corruption simulation, and timing stress
**To discover** data loss, crash loops, recovery failures, and TDM protocol breakdowns

### Areas to Probe
- Power cycle ESP32 mid-CSI-capture -- does it recover cleanly?
- Corrupt NVS configuration -- does firmware boot with defaults?
- WiFi AP disappears during capture -- reconnection behavior?
- TDM time slot drift: what if two nodes transmit simultaneously?
- UDP packet loss simulation: drop 10%, 30%, 50% of packets -- graceful degradation?
- Fill NVS storage completely -- behavior on next config write?
- Rapid channel hopping under high CSI load
- What happens if the host server is unreachable? Does firmware buffer or discard?
- OTA update interrupted at 50% -- does firmware recover? (bricked?)
- Maximum CSI frame rate the firmware can sustain before dropping

### Risk Focus
Firmware reliability directly impacts all sensing accuracy claims.

---

## Charter 4: WiFi-Mat Disaster Triage Classification

**Explore** the WiFi-Mat mass casualty assessment tool (mat crate) triage classification logic
**With** edge-case survivor scenarios, ambiguous vital signs, and multi-person overlapping signals
**To discover** misclassification risks, confidence threshold sensitivity, and boundary behavior

### Areas to Probe
- START triage edge cases: P1 Immediate vs P2 Delayed boundary
- Survivor with breathing but no detectable heartbeat -- classification?
- Survivor with heartbeat but no detectable breathing -- classification?
- Very weak signal that could be survivor or noise -- threshold behavior?
- Multiple survivors at same location (overlapping signals) -- separation accuracy?
- Signal that transitions P3 -> P1 over 5 minutes (deteriorating patient)
- Complete signal loss (deceased vs out-of-range) -- how does it differentiate?
- Debris/rubble signal attenuation modeling -- accuracy at 3m, 5m, 10m depth?
- False positive: environmental movement (fan, curtain, pet) classified as survivor?
- What confidence level triggers an alert? Is it configurable? What if too low/high?

### Risk Focus
Misclassification in disaster response has life-or-death consequences.

---

## Charter 5: WASM Edge Module Safety & Memory

**Explore** the 65 WASM edge modules (wasm-edge crate) for memory safety, resource exhaustion, and correctness
**With** malformed inputs, resource budget violations, and cross-module interaction
**To discover** panics, memory corruption, budget overruns, and silent failures

### Areas to Probe
- Feed each module a frame of all-zeros, all-NaN, all-Inf, all-negative
- Feed maximum-length frame (65535 subcarriers?) -- stack overflow?
- Module memory budget: what happens at exactly the limit? 1 byte over?
- `static mut` patterns (flagged CRITICAL in security audit) -- concurrent access?
- Module that takes >100ms to process a frame -- timeout behavior?
- Load/unload modules rapidly -- resource leak?
- Module that produces output larger than expected -- buffer overflow?
- Chain two modules (output of module A -> input of module B) with incompatible data formats
- What happens if a module panics? Does it crash the host or is it isolated?
- Hot-reload a module while it's processing a frame

### Risk Focus
65 modules using `static mut` in no_std context is a significant safety surface.

---

## Charter 6: Signal Processing Pipeline Accuracy

**Explore** the RuvSense signal processing modules (signal crate: 14 modules)
**With** reference CSI data, known-good outputs, and adversarial signal conditions
**To discover** numerical errors, drift, calibration failures, and accuracy degradation

### Areas to Probe
- Feed the deterministic reference signal through each ruvsense module individually -- compare outputs to expected
- Phase alignment (`phase_align.rs`): introduce deliberate LO offset -- does iterative estimation converge?
- Coherence scoring (`coherence.rs`): Z-score at exactly the gate threshold -- accept or reject?
- Coherence gate (`coherence_gate.rs`): transition between Accept/PredictOnly/Reject/Recalibrate -- hysteresis behavior?
- Field model (`field_model.rs`): SVD on a rank-deficient matrix -- graceful handling?
- Gesture recognition (`gesture.rs`): DTW with two identical templates -- correct distance = 0?
- Adversarial detection (`adversarial.rs`): craft a physically impossible signal -- does it flag?
- Multi-band fusion (`multiband.rs`): one band has valid data, other bands are noise -- behavior?
- Tomography (`tomography.rs`): ISTA solver with ill-conditioned input -- convergence?
- Kalman tracker (`pose_tracker.rs`): sudden 180-degree pose change -- tracking recovery time?
- Longitudinal stats (`longitudinal.rs`): exactly 1 sample -- Welford variance NaN?
- Cross-room (`cross_room.rs`): transition to unknown environment -- fingerprint mismatch handling?
- Intention detection (`intention.rs`): pre-movement lead time accuracy (200-500ms claim)

### Risk Focus
Every downstream feature (pose, vitals, triage) depends on signal processing accuracy.

---

## Charter 7: Multi-Person Tracking Identity Persistence

**Explore** multi-person tracking (pose_tracker.rs: 17-keypoint Kalman tracker with AETHER re-ID)
**With** scenarios designed to cause identity swaps, occlusion, and tracking loss
**To discover** identity swap frequency, recovery after occlusion, and maximum trackable persons

### Areas to Probe
- Two persons crossing paths (closest approach) -- do IDs swap?
- Person leaves room and returns -- is the same ID assigned?
- Three persons in a line (one behind another from sensor perspective) -- occlusion handling?
- Person stands perfectly still for 5 minutes -- does tracking drift or lose lock?
- Rapid movement (running) -- does Kalman filter keep up?
- Very slow movement (elderly, injured) -- minimum detectable motion?
- Two persons with very similar body dimensions -- identity confusion?
- Add person #4, #5, #6 -- at what count does accuracy degrade?
- Person partially behind a wall (half body visible) -- partial pose estimation?
- Simultaneous entry of 3 people -- correct identity assignment from start?
- AETHER re-ID embedding similarity: two different people -- minimum embedding distance?

### Risk Focus
Identity swaps in vital sign monitoring could assign wrong vitals to wrong person.

---

## Charter 8: Database & State Persistence Under Failure

**Explore** the database layer (db crate: Postgres/SQLite/Redis) and state management
**With** connection failures, concurrent writes, schema edge cases, and recovery scenarios
**To discover** data loss, corruption, inconsistent state, and recovery failures

### Areas to Probe
- Database connection lost mid-write -- data integrity?
- Concurrent writes to same pose record from multiple WebSocket clients
- Redis unavailable -- fallback behavior? Silent data loss?
- SQLite WAL mode under concurrent readers/writers
- Very large result sets (10K poses) -- pagination? Memory?
- Database full (disk space) -- error handling?
- Schema migration interrupted -- recovery possible?
- Query with SQL injection attempt via CSI metadata fields
- Timestamp handling across timezones (UTC consistency?)
- Connection pool exhaustion under load -- behavior?

### Risk Focus
State persistence affects session continuity and historical data reliability.

---

## Charter 9: Cross-Viewpoint Fusion & Multistatic Mesh

**Explore** the RuVector cross-viewpoint fusion (ruvector crate: 5 modules) and multistatic mesh coordination
**With** multi-node scenarios, timing variations, and geometric edge cases
**To discover** fusion errors, geometric diversity failures, and mesh coordination breakdowns

### Areas to Probe
- 2-node mesh: nodes at 90 degrees -- geometric diversity index?
- 4-node mesh: one node goes offline -- graceful degradation?
- Attention weights (`attention.rs`): do weights sum to 1.0? Negative weights possible?
- Geometric bias: nodes at same location (diversity = 0) -- division by zero?
- Phase phasor coherence: exactly 180-degree phase difference -- gate decision?
- Cramer-Rao bound estimation: singular Fisher Information matrix?
- Fusion with one high-quality and one noisy viewpoint -- does attention correctly downweight noise?
- Clock synchronization drift between nodes -- impact on fusion accuracy?
- Maximum number of nodes before fusion becomes computationally infeasible?
- Domain events from MultistaticArray aggregate -- are all events published correctly?

### Risk Focus
Multistatic fusion is the foundation for multi-person tracking accuracy.

---

## Charter 10: Docker Deployment & Configuration Matrix

**Explore** the Docker deployment (multi-arch: amd64 + arm64) and configuration handling
**With** various configuration combinations, resource constraints, and network conditions
**To discover** deployment failures, configuration conflicts, and operational issues

### Areas to Probe
- Docker build on amd64 and arm64 -- both succeed?
- Minimal configuration (only required env vars) -- does it start?
- All optional features enabled simultaneously -- resource usage?
- Invalid port configuration (port already in use) -- error message?
- Docker with 256MB memory limit -- OOM behavior?
- Docker with no network access -- graceful error?
- Mount invalid volume path -- startup behavior?
- Environment variable with special characters (quotes, spaces, unicode)
- Health check endpoint during startup (before ready) -- response?
- Container restart after ungraceful shutdown -- data recovery?
- Rust Docker image (132MB) vs advertised size -- verify
- Run Docker image with `--read-only` filesystem -- does it work?

### Risk Focus
Docker is the primary deployment mechanism ("30 seconds to live sensing").

---

## Session Template

```markdown
# Exploratory Testing Session Notes

**Charter**: [#]
**Tester**: [name]
**Date**: [date]
**Duration**: [actual time]

## Setup
[Environment, configuration, tools used]

## Observations
1. [What happened, what was expected, what was actual]
2. ...

## Bugs Found
| # | Summary | Severity | Reproduction Steps |
|---|---------|----------|--------------------|
| 1 | | | |

## Questions for Team
1. [Anything unclear or needing clarification]

## Risks Discovered
1. [New risks not in original charter]

## Coverage Notes
[What was covered, what was NOT covered due to time/access]
```

---

## Priority & Scheduling

| Charter | Priority | Depends On | Recommended Week |
|---------|----------|------------|-----------------|
| 1: Vital Sign Boundaries | P0 | Phase 3 reference data | Week 5 |
| 2: Sensing Server Stress | P0 | Phase 2 decomposition | Week 4 |
| 3: ESP32 Firmware | P0 | Physical hardware | Week 7 (or deferred) |
| 4: WiFi-Mat Triage | P0 | Phase 3 triage tests | Week 5 |
| 5: WASM Edge Safety | P1 | Phase 1 fuzz targets | Week 3 |
| 6: Signal Processing | P1 | Reference data available | Week 5 |
| 7: Multi-Person Tracking | P1 | Phase 3 tracking tests | Week 6 |
| 8: Database & State | P2 | Database test setup | Week 6 |
| 9: Cross-Viewpoint Fusion | P2 | Multi-node test data | Week 7 |
| 10: Docker Deployment | P2 | Docker images built | Week 7 |
