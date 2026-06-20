# Release Notes

All Agentic QE release notes organized by version.

| Version | Date | Highlights |
|---------|------|------------|
| [v3.11.0](v3.11.0.md) | 2026-06-20 | Free-tier local test generation (opt-in, `AQE_FREE_TIER=1`): cheap-first on local/OpenRouter/OpenAI-compatible models with a repair loop, auto-escalation to paid tiers, and self-learning routing feedback. Restores Dependabot-dropped `@ruvector/ruvllm-*` deps (#541). |
| [v3.10.9](v3.10.9.md) | 2026-06-17 | MCP reliability + db-free completeness (@nagoodman): `agentic-qe mcp` runs in-process so real clients get `tools/list` (#528); `memory_delete` no longer masked by stale session cache (#535); `--no-database` reaches all editor MCP configs (#533); new `--no-claude` exclusive install (#532). |
| [v3.10.8](v3.10.8.md) | 2026-06-16 | Database-free OpenCode install (`--no-database`/`--memory memory`, #530/#534) + MCP stdio client-compat fixes (#527 stdout purity + negotiated protocol, #529 loadable OpenCode assets) from @nagoodman; cleared protobufjs + ws production CVEs; vite → 8.0.16. |
| [v3.10.7](v3.10.7.md) | 2026-06-12 | Learning-integrity + supply chain: fix silent self-learning loss (hook swallowed native-binary errors; SONA reward feedback was inert, fixed via `@ruvector/sona` 0.1.7); shift-left consumer-tarball audit gate; refresh QE skill evals to current models. |
| [v3.10.6](v3.10.6.md) | 2026-06-11 | Pattern Space cross-pollination (#522): evidence-class labels on findings, pass/fail safety eval for data-protection rules, shipped-agent invariant CI, benchmark lineage + interaction benchmark, kept-nulls learning. ADR-105–110. |
| [v3.10.5](v3.10.5.md) | 2026-06-10 | Fable 5 parity (#520): CLI fleet/memory commands fixed, prompt caching wired, reasoning-scrub for clean learning, adversarial QCSD reviews, `aqe arena` tournaments. ADR-099–104. |
| [v3.10.4](v3.10.4.md) | 2026-06-08 | Keep project learning in its own `.agentic-qe/` (#516: nearest-root + RVF resolution); stop orphaned `aqe-mcp` busy-loop / SIGTERM-ignore (#513); opt-in local Nagual hub + LLM judge. |
| [v3.10.3](v3.10.3.md) | 2026-06-03 | TS/JS code intelligence with no `typescript` dependency via bundled tree-sitter WASM grammars (#511); fixes MCP domain tools hanging on fresh install, `code deps`/`search` returning empty, CLI↔MCP graph namespace; repaired stale WASM grammars; lint cleanup. |
| [v3.10.2](v3.10.2.md) | 2026-06-02 | Self-learning hardening: fixes #508 (post-task hook recorded every trajectory `success=0`/`agent=unknown`) + #509 (stale dream readout); EWC++ forgetting protection, contradiction detection, MCP/learning verification harnesses, ADR-098. |
| [v3.10.1](v3.10.1.md) | 2026-05-22 | ADR-043 LLM router actually wired: kernel singleton threaded through 11 domains + MCP tools, persistent `aqe llm config --set`, Gemini `GOOGLE_API_KEY` alias, 2 fallback-chain bug fixes, 10-finding audit hardening. |
| [v3.10.0](v3.10.0.md) | 2026-05-20 | Optional external embedder endpoint (#503, ADR-097): OpenAI-compatible `/v1/embeddings` over HTTP or Unix socket, identity fingerprint + drift detection, hard-fail (no hash poisoning), TLS knobs. |
| [v3.9.36](v3.9.36.md) | 2026-05-19 | Close the self-learning routing Q-loop (#499): post-route now trains `rl_q_values`, post-task fires Q-update even when pre-task bridge is absent, Q-state collapsed from 4-dim to 3-dim for ~11× faster convergence. ADR-096. |
| [v3.9.35](v3.9.35.md) | 2026-05-19 | Restore ESM subpath import of `HnswAdapter` (#497) + dismantle cumulative-growth pattern in vitest fork workers (#448 steps 2+3): split heavy learning tests, release module singletons between tests |
| [v3.9.34](v3.9.34.md) | 2026-05-18 | Stop unbounded `patterns.rvf`/`brain.rvf` growth — fixes #495 sibling init runaway + adds post-dream compaction, boot-time size guard, bounded SQLite→RVF backfill |
| [v3.9.33](v3.9.33.md) | 2026-05-18 | Supply-chain cleanup: 0 consumer-side CVEs (was 4 high + 1 critical), ~480 fewer transitive packages, zero ERESOLVE warnings; new consumer-side audit gate prevents regressions |
| [v3.9.32](v3.9.32.md) | 2026-05-17 | Fix #491 chain — daemon/kernel wiring, namespace-aware reads, timestamp rehydration, loop-health try/finally. Adds daemon-runtime release gate (`test:integration:fast` + A23) |
| [v3.9.31](v3.9.31.md) | 2026-05-15 | Self-learning loop ships end-to-end: kernel-side dream cycles (ADR-094), three-signal routing with Q-blend + ε-greedy + mincut gate (ADR-095), `aqe learning loop-health` dashboard, retention pruner, daemon pidfile fix (#480, #486, #487, #488) |
| [v3.9.30](v3.9.30.md) | 2026-05-14 | Six MCP fixes: ESM __dirname polyfill, real ONNX embeddings, coherence_collapse NaN guard, default test phases, session cache wired, test_generate language validation (#467,#469,#470,#472,#473,#474) |
| [v3.9.29](v3.9.29.md) | 2026-05-14 | Hotfix: bridge publishes learning.ExperienceCaptured with the canonical nested payload shape so handler destructure resolves and recordExperience runs (#482 round 3) |
| [v3.9.28](v3.9.28.md) | 2026-05-14 | Hotfix: bridge eagerly loads domain plugins before starting so subscribers are wired when the first drain publishes (#482) |
| [v3.9.27](v3.9.27.md) | 2026-05-14 | Two architectural fixes: AbortSignal bounds session-start init (no more 43 GB patterns.rvf leak, #478), CapturedExperienceBridge wires hook activity to domain plugins (#479) |
| [v3.9.26](v3.9.26.md) | 2026-05-13 | Ten learning-pipeline fixes: post-edit stdin file_path, getStats DB fallback, pattern promotion, dream apply, Q-learning agent key, concurrent-dream guard, RVF orphan purge, tokens_saved, cli-hook consolidation, stale sentinel sweep (#453–#465) |
| [v3.9.25](v3.9.25.md) | 2026-05-12 | Fix: new `post-route` Stop hook closes route sentinels 1:1 — `routing_outcomes` no longer accumulates `quality_score=-1` rows (#451) |
| [v3.9.24](v3.9.24.md) | 2026-05-12 | Fix: `post-task` no longer skips Stream B/D/F when `--task-id` is missing — `rl_q_values` populates on every invocation (#449) |
| [v3.9.23](v3.9.23.md) | 2026-05-11 | Two self-learning fixes: bootstrap patterns now reach HNSW (#445), `qe_pattern_usage` no longer permanently empty after `ON CONFLICT` upserts (#447) |
| [v3.9.22](v3.9.22.md) | 2026-05-09 | Non-destructive consolidation safety valve (no more silent Exp counter shrinkage) + CLI-only `aqe init` flow now persists hooked experiences |
| [v3.9.21](v3.9.21.md) | 2026-05-08 | Windows install unblocked (#439), RVF FsyncFailed root-cause fix, hypergraph `untested` / `impacted` queries return useful results |
| [v3.9.20](v3.9.20.md) | 2026-05-08 | Second wave wire-gap fixes: HNSW A in routing, hook-side embeddings inline, dream cycle busy_timeout, pattern quality_score moves on hook flow, TrajectoryBridge → unified memory |
| [v3.9.19](v3.9.19.md) | 2026-05-05 | Self-learning loop wire-gap fixes: workers tick, HNSW loads on boot, hook outputs persist, multi-dim quality |
| [v3.9.18](v3.9.18.md) | 2026-04-30 | Four MCP fixes (governance throttle, jest output, temp-path leak, coverage error msg) + `agentic-qe-fleet` plugin |
| [v3.9.17](v3.9.17.md) | 2026-04-27 | Fix: UserPromptSubmit hook now reads stdin event JSON — closes the routing learning loop for fresh `aqe init` |
| [v3.9.16](v3.9.16.md) | 2026-04-24 | Brain-export tooling: `aqe brain diff`/`search`, native-binding advisor `aqe upgrade` |
| [v3.9.15](v3.9.15.md) | 2026-04-22 | qe-browser Implemented (ADR-091): `aqe eval run` CLI, CI gate, Linux ARM64 browser hint |
| [v3.9.14](v3.9.14.md) | 2026-04-20 | Security + supply-chain: 15 critical vulns fixed, tarball -52%, command injection patched |
| [v3.9.13](v3.9.13.md) | 2026-04-17 | Opus 4.7 migration (ADR-093): Sonnet 4.6 default, `xhigh` fleet-wide, cyber agents pinned |
| [v3.9.12](v3.9.12.md) | 2026-04-16 | Fix: hook duplication after ruflo init, init hang from pretrain, faster CF detection |
| [v3.9.11](v3.9.11.md) | 2026-04-13 | Fix: `aqe init --auto` now correctly updates agents and helpers on version upgrade |
| [v3.9.10](v3.9.10.md) | 2026-04-13 | Multi-provider advisor routing: use any LLM for QE tasks, auto-failover, PII redaction |
| [v3.9.9](v3.9.9.md) | 2026-04-09 | qe-browser fleet skill: Vibium engine (10MB vs 300MB Playwright), typed assertions, visual diff, injection scan (ADR-091) |
| [v3.9.8](v3.9.8.md) | 2026-04-08 | Release-process maturity: codeload mirror, PR template CI enforcement, chaos workflow, VERIFICATION.md (#401 follow-ups) |
| [v3.9.7](v3.9.7.md) | 2026-04-07 | Release-gate corpus + `aqe init --json` + phase 06 stops lying about success (#401) |
| [v3.9.6](v3.9.6.md) | 2026-04-06 | Native HNSW works again — replaced @ruvector/router with hnswlib-node, no more vectors.db cruft |
| [v3.9.5](v3.9.5.md) | 2026-04-06 | Root-cause fix: disable native HNSW (deadlocks on certain inputs), faster JS backend by default |
| [v3.9.4](v3.9.4.md) | 2026-04-06 | Hotfix: governance phase chunk-split regression, `--skip-code-index` escape hatch, per-file logging |
| [v3.9.3](v3.9.3.md) | 2026-04-06 | Proper fix: `aqe init` watchdog, lazy bootstrap, remove daemon spawn, MCP entry regression |
| [v3.9.2](v3.9.2.md) | 2026-04-06 | Hotfix: `aqe init --auto` RVF lock deadlock, CLI exit hang |
| [v3.9.1](v3.9.1.md) | 2026-04-05 | RVF persistent vectors, agent COW branching, HNSW unification, StrongDM |
| [v3.9.0](v3.9.0.md) | 2026-04-02 | 11 CC-internals improvements, 4-tier compaction, plugin system, QE daemon |
| [v3.8.14](v3.8.14.md) | 2026-03-31 | SQL injection fix, remove faker from generators (~6 MB), 3 P0 blockers resolved |
| [v3.8.13](v3.8.13.md) | 2026-03-30 | Code intelligence CLI (complexity, --incremental, --git-since), security fix, doc cleanup |
| [v3.8.12](v3.8.12.md) | 2026-03-29 | RuVector Phase 5: pattern intelligence, graph learning, scale optimization |
| [v3.8.11](v3.8.11.md) | 2026-03-27 | YAML pipelines, heartbeat CLI, economic routing, session cache (Tier 3) |
| [v3.8.10](v3.8.10.md) | 2026-03-26 | Fix coverage data pipeline — eliminate fabricated scores, unify key ecosystem |
| [v3.8.9](v3.8.9.md) | 2026-03-25 | Multi-language coverage parsers, SHA-256 witness security, P1 scale benchmarks |
| [v3.8.8](v3.8.8.md) | 2026-03-24 | MCP-free agents, `aqe memory` CLI, WASM parsers, skill description improvements |
| [v3.8.7](v3.8.7.md) | 2026-03-23 | Unified hypergraph persistence, CLI/MCP query tools, code index extractor |
| [v3.8.6](v3.8.6.md) | 2026-03-23 | Security ReDoS fixes, flaky timer elimination, module decomposition |
| [v3.8.5](v3.8.5.md) | 2026-03-21 | Both P1 items resolved, structured logging, hooks decomposition, test stability |
| [v3.8.4](v3.8.4.md) | 2026-03-19 | P0 security fixes, DB corruption repair, 30-40% smaller bundles, CI parallelization |
| [v3.8.3](v3.8.3.md) | 2026-03-18 | ADR-086 skill overhaul (84 skills), 5 new skills, 7 bug fixes |
| [v3.8.2](v3.8.2.md) | 2026-03-17 | 8 bug fixes from user testing, validation pipeline helper, ruflo rebrand |
| [v3.8.1](v3.8.1.md) | 2026-03-17 | Fix MCP tool prefix mismatch in 8 agent files, permission pattern fix |
| [v3.8.0](v3.8.0.md) | 2026-03-16 | RuVector: native HNSW (150x faster), neural routing, coherence safety gates |
| [v3.7.22](v3.7.22.md) | 2026-03-14 | Hook path resolution fix, SQLite corruption prevention, v2 migration removal |
| [v3.7.21](v3.7.21.md) | 2026-03-13 | Agent dependency intelligence, shell injection fixes, semgrep parallel SAST |
| [v3.7.20](v3.7.20.md) | 2026-03-12 | Fix duplicate brain-checkpoint hooks and governance time budget blocking tools |
| [v3.7.19](v3.7.19.md) | 2026-03-12 | YAML pipelines, validation pipeline, cross-phase signals, heartbeat scheduler, context sources |
| [v3.7.18](v3.7.18.md) | 2026-03-11 | Hotfix: agents not installed on `aqe init --auto` upgrade |
| [v3.7.17](v3.7.17.md) | 2026-03-11 | BMAD-inspired: adversarial review, agent overlays, validation pipelines, branch enumerator |
| [v3.7.16](v3.7.16.md) | 2026-03-10 | Critical: test DB isolation fix, Tier 3 baselines, MCP persistence pipeline |
| [v3.7.15](v3.7.15.md) | 2026-03-09 | Six Hats learning improvements, Proof-of-Quality CLI, MCP tool scoping, test stability |
| [v3.7.14](v3.7.14.md) | 2026-03-08 | Brain export v3.0 (25 tables), witness chain v3, streaming, npm packaging fix |
| [v3.7.13](v3.7.13.md) | 2026-03-07 | Trigger optimizer, version comparator, skill intent classification |
| [v3.7.12](v3.7.12.md) | 2026-03-06 | Fix CLI crash on global install (lazy-load typescript), release verification hardening |
| [v3.7.11](v3.7.11.md) | 2026-03-06 | Full @claude-flow/guidance governance integration across all 8 modules |
| [v3.7.10](v3.7.10.md) | 2026-03-05 | Fix MCP path resolution, CRLF skill parsing, stale v3/ refs; README rewrite |
| [v3.7.9](v3.7.9.md) | 2026-03-05 | Multi-language test gen (8 langs), 384-dim embedding standardization, trust tier evals |
| [v3.7.8](v3.7.8.md) | 2026-03-04 | Loki-Mode: 7 adversarial quality gates (anti-sycophancy, test gates, EMA, auto-escalation) |
| [v3.7.7](v3.7.7.md) | 2026-03-02 | Scrapling-inspired browser: adaptive locators, resource blocking, stealth client, page pool |
| [v3.7.6](v3.7.6.md) | 2026-03-02 | 30 MCP tools wired, 9 security fixes, dependency cleanup, dead code removal |
| [v3.7.5](v3.7.5.md) | 2026-03-01 | Flat project structure, RVF binary brain export, native module crash fix |
| [v3.7.4](v3.7.4.md) | 2026-02-28 | 8 new platform integrations (Copilot, Cursor, Cline, Kilo, Roo, Codex, Windsurf, Continue.dev), 202 new tests |
| [v3.7.3](v3.7.3.md) | 2026-02-27 | 17 bug fixes (Phase 0), CI-native exit codes, Phase 1 complete |
| [v3.7.2](v3.7.2.md) | 2026-02-25 | AWS Kiro IDE integration, hono security patch |
| [v3.7.1](v3.7.1.md) | 2026-02-24 | OpenCode integration, RVF production wiring, 8 bug fixes |
| [v3.7.0](v3.7.0.md) | 2026-02-23 | RVF Cognitive Container integration: MinCut routing, witness chain, brain CLI, HNSW unification |
| [v3.6.19](v3.6.19.md) | 2026-02-22 | 6 learning pipeline fixes, event-driven trajectories, 25 new tests |
| [v3.6.18](v3.6.18.md) | 2026-02-21 | 6 new Agent Teams MCP tools, auto-team-wiring, team enriched responses |
| [v3.6.17](v3.6.17.md) | 2026-02-21 | QE Queen Coordinator 7 fixes, HNSW semantic search, hierarchical topology |
| [v3.6.16](v3.6.16.md) | 2026-02-21 | Node.js node:test generator, smart assertions, 12 bug fixes |
| [v3.6.15](v3.6.15.md) | 2026-02-20 | Fix 11 test generation bugs (#295), fix cloud sync pg loading |
| [v3.6.14](v3.6.14.md) | 2026-02-20 | Fix test OOM crashes, CI artifact upload, flaky test stabilization |
| [v3.6.13](v3.6.13.md) | 2026-02-19 | Fix test stubs, MCP crash, vector mismatch, coverage, security scan |
| [v3.6.12](v3.6.12.md) | 2026-02-19 | Fix HNSW crash, real security scanning, hooks directory, 5 issues fixed |
| [v3.6.11](v3.6.11.md) | 2026-02-18 | MCP stability, multi-language support, smart init merge, 9 issues fixed |
| [v3.6.10](v3.6.10.md) | 2026-02-18 | QCSD Production Telemetry, eval-driven workflow, KG test generation |
| [v3.6.9](v3.6.9.md) | 2026-02-17 | Code quality overhaul, self-learning feedback loop, P0 security fixes |
| [v3.6.8](v3.6.8.md) | 2026-02-15 | MCP auto-init fleet, unified experience persistence, fix #262 |
| [v3.6.7](v3.6.7.md) | 2026-02-14 | Fix DB corruption, remove VACUUM, eliminate dual-DB split-brain |
| [v3.6.6](v3.6.6.md) | 2026-02-13 | Fix Node 22+ crash, restore self-learning hooks, single-DB resolution |
| [v3.6.5](v3.6.5.md) | 2026-02-13 | Fix fleet_init dimension mismatch (#255), agent asset sync, README fixes |
| [v3.6.4](v3.6.4.md) | 2026-02-12 | Security hardening, Dream Scheduler, QE pattern seeding, delta scanning |
| [v3.6.3](v3.6.3.md) | 2026-02-11 | QX Analysis, SFDIPOT product factors, cross-platform compatibility |
| [v3.6.2](v3.6.2.md) | 2026-02-10 | Init stability fixes (YAML parser, agent helper file placement) |
| [v3.6.1](v3.6.1.md) | 2026-02-09 | Agent Teams Integration, Distributed Tracing, Dynamic Scaling |
| [v3.6.0](v3.6.0.md) | 2026-02-08 | Enterprise Integration Domain, 8 new agents, Pentest Validation |
| [v3.5.0](v3.5.0.md) | 2026-02-04 | Governance by default, QCSD 2.0 Lifecycle, Self-Healing Enterprise |
| [v3.4.2](v3.4.2.md) | 2026-02-02 | Skill Validation System, Trust Tiers |
| [v3.4.0](v3.4.0.md) | 2026-02-01 | AG-UI, A2A, A2UI Protocols |

For the full changelog with all minor and patch versions, see [v3/CHANGELOG.md](../../v3/CHANGELOG.md).
