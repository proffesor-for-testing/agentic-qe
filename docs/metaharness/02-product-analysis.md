# 02 — MetaHarness Product Analysis

**Repo:** `ruvnet/agent-harness-generator` · **CLI:** `metaharness` · **Library:** `@ruvnet/agent-harness-generator` · **Studio:** https://ruvnet.github.io/agent-harness-generator/
**Evaluator:** AQE fleet (agentic-qe). **Reviewed at:** `working-may` snapshot, 2026-06-15. Static analysis only (no repo code executed; npm-liveness of `@metaharness/*` not network-verified).

**Verdict in one line:** A genuinely novel, well-architected idea with a surprisingly real implementation underneath — undermined by documentation that oversells maturity, several internal count/claim contradictions, and at least one load-bearing guarantee (CLI↔Studio byte-parity) that is asserted but **not actually tested**.

---

## 1. Product thesis & positioning

### The thesis
MetaHarness reframes the unit of value. The pitch is not "a framework to build agents" but **"a factory that mints agent *harnesses*"** — where a harness is the durable, branded, governed operating layer *around* a swappable model: a repo-aware `npx <name>` CLI, a default-deny MCP server, a scoped memory namespace, a governance policy, Ed25519 witness-signed provenance, and per-host config for up to 9 hosts. The slogan — *"The model is replaceable; the harness is the product"* (`README.md:29`) — is the whole bet.

This is a **coherent and defensible** framing, and it's the strongest thing about the project:

- **It picks a real, under-served job.** "I want my own branded agent CLI for *my* repo/org, that I own and `npm publish`, that runs on whatever host my team uses" is a genuine gap. `create-agent-harness` is to vertical agent systems what `create-vite` is to web apps — and that analogy is explicit and apt (`ADR-001:16`, `docs/OVERVIEW.md:3`).
- **The wedge vs frameworks (LangChain, etc.) is clean.** The FAQ nails it: *"Frameworks help developers build agents. MetaHarness helps repositories ship agents"* (`README.md:313`). Frameworks are libraries you assemble; MetaHarness is a scaffolder that emits a finished, governed, publishable artifact. It is not competing on agent-loop expressiveness — it's competing on *packaging, governance, provenance, and multi-host portability*, which frameworks treat as an afterthought.
- **The wedge vs other scaffolders (Yeoman/Plop/`create-next-app`) is also clear** and well-reasoned (`ADR-001:158`): those scaffold generic projects; MetaHarness bakes in agent-specific primitives (MCP policy, memory namespace, witness signing) that a generic scaffolder can't.

### Why now
The "why now" (`ADR-001:10`) is credible: (1) **host fragmentation** — Claude Code is no longer the only runtime (Codex, Hermes, pi.dev, Copilot, OpenCode all now exist), so "write once, target 9 hosts" has real pull; (2) **fork pressure** on the parent product `ruflo` — people fork to rebrand, which is a one-way door losing all future kernel updates; (3) **supply-chain anxiety around MCP** — a generator that emits *governed* MCP servers at scale is timely.

### Where the framing strains
- The "factory" metaphor is elegant but **layered to the point of vertigo**: you operate a meta-harness (`metaharness`) that produces a harness (`harness`) that wraps a kernel (`@metaharness/kernel`) that loads a host adapter that calls an LLM (`README.md:242`, `ARCHITECTURE.md:7`). The naming rule "before generation = `metaharness`; inside generated harness = `harness`" (`ADR-035:71`) is necessary precisely because this is confusing. First-time users will struggle to locate themselves in the stack.
- The positioning leans on a parent product (`ruflo`) that the target user has never heard of. Multiple docs explain MetaHarness *in terms of* ruflo ("the meta-harness this generator factors apart," `README.md:293`). That's inside-baseball that should be invisible to an adopter.

**Bottom line on §1:** The thesis is original and defensible, the framing is mostly coherent, and the "harness is the product" line is a genuine insight. The cost is conceptual heaviness that the docs amplify rather than hide.

---

## 2. Personas

| Persona | Job-to-be-done | What they get | Friction |
|---|---|---|---|
| **OSS maintainer** (the sharpest fit) | "Ship a repo-aware agent so contributors/users get a tuned `npx my-repo-agent` instead of generic Claude Code." | `harness analyze-repo .` → scaffold → `npm publish`. The `vertical:repo-maintainer` template + `@metaharness/repo-maintainer` wrapper target this exactly. | Must trust shallow static analysis; must still write the real prompts/skills (docs are honest that it scaffolds "80%," `USERGUIDE.md:134`). |
| **Platform / DevEx team** (strongest *commercial* fit) | "Give the whole org one versioned, governed agent that everyone runs identically." | The killer line: *"Rename it, set your scope, and `npm publish` — now anyone runs `npx @your-org/your-harness` and gets the same repo-tuned agent. One command, org-wide, versioned like any other dependency"* (`README.md:56`). Default-deny MCP + witness signing + SBOM are exactly what a platform team needs for governance. | Multi-host config drift; key management for witness signing is "real work" (`ADR-011:194`); the upgrade/drift story (`harness upgrade`) is make-or-break and unproven at scale. |
| **Vertical SaaS builder** | "Stand up a domain agent pod (support, trading, legal, research) fast." | 19 vertical templates + 10 published vertical wrapper packages, each shipping "bespoke domain agents (with system prompts), skills, commands" (`README.md:144`). | The sensitive verticals' safety framing (trading "paper-by-default," legal "drafts only") is **README prose, not enforced code in the example packages** (see §6). A SaaS builder relying on those guarantees would be misled by the wrappers. |
| **Solo dev / indie** | "I want a branded agent for my project without building infra." | Zero-install browser Studio → download `.zip` → `npm install`. No account, no backend, no telemetry (verified). | Needs Node comfort (`USERGUIDE.md:151`); default-deny means manually allowing every tool — correct but adds first-run friction. |
| **Enterprise governance / compliance** | "Prove what an agent can touch, sign releases, produce SBOM/threat-model artifacts for audit." | `harness threat-model`, `harness sbom` (SPDX-2.3), `harness mcp-scan` ("npm audit for agent tools"), Ed25519 witness + npm provenance, OIA manifest. A genuinely differentiated bundle for this persona. | OIA integration is **Proposed/deferred** (`ADR-034`); remote MCP auth is "a bearer-token starting point, not a full OAuth/mTLS stack" (`ADR-022:72`); witness key rotation/recovery is operator burden. |
| **Existing ruflo user (migration)** | "Eject my customized ruflo setup into my own branded harness without losing memory/patterns." | `npx metaharness --from-existing ./` lifts agents/skills/commands and renames ruflo references (`USAGE.md:181`). | Niche persona (only existing ruflo users); eject "starts with a fresh memory" by design — data-loss-adjacent surprise. |

**Strongest personas:** Platform/DevEx team and OSS maintainer. **Weakest:** Enterprise-governance-today (too many of its headline features are Proposed/partial) and the migration persona (tiny audience).

---

## 3. Major user journeys

### (a) Browser Studio — zero install
**Smooth.** The Studio is a real, polished client-side React/Vite SPA (verified: `apps/web-ui/`), with all four claimed tabs present in code (`apps/web-ui/src/App.tsx`):
1. **Repo → Harness** (`RepoImporter.tsx`): paste GitHub URL → fetches high-signal files via GitHub's public contents API → archetype-scored, confidence-ranked editable plan; inferred commands rendered `trust: inferred · execution: disabled`.
2. **Create harness** (`HarnessBuilder.tsx`): edit name (kebab-case validated, blocks download on invalid), hosts, template, agents/skills/commands, and an MCP off/local/remote panel with a default-deny policy sub-panel → live `FileTree` preview → `.zip` download via JSZip.
3. **Skill / Agent / Command** (`ArtifactBuilder.tsx`): author a single `SKILL.md` → download as `.md` or `.zip`.
4. **Verify** (`VerifyPanel.tsx` + `verify.ts`): drop a `.zip` → unzip in-browser → structured checks (package.json, kernel dep, host adapter, MCP policy default-deny/audit/timeout, `.env` secret-deny) → VERIFIED/ISSUES verdict.

The **"nothing leaves your machine"** claim holds: exhaustive grep found exactly two network surfaces — GitHub's public API (file list) and an opt-in HuggingFace MiniLM model download (lazy, WebGPU→WASM, lexical fallback default, per ADR-025). **No telemetry, no backend POST, no analytics.** This is the journey most likely to convert a beta tester, and it's the most finished part of the product.

### (b) `npx metaharness --wizard`
**Mostly smooth, doc-rough.** `wizard.ts` exists; the wizard is a 4-question form (name → template → host → description) that prints the equivalent flag-driven command afterward (`USAGE.md:34`). Good UX. The roughness is documentation: `USAGE.md:24` still says *"Once `metaharness` is published to npm (currently in Phase 1 development)"* and `docs/OVERVIEW.md:5` says *"Pre-implementation. The repo does not exist yet"* — directly contradicting the README's "production-ready" status and the live packages. A beta tester reading OVERVIEW first will be confused about whether the thing even exists.

### (c) `harness analyze-repo` → scaffold
**Smooth and honest.** `analyze-repo.ts` is real; the local, deterministic, no-code-execution analysis (`README.md:87`) mirrors the browser core (ADR-026). Honesty is a strength here: the docs repeatedly disclaim that analysis is "deterministic and shallow… it doesn't read every line of code" (`USERGUIDE.md:140`). `--scaffold` materializes the recommended harness in one step. The `harness genome <repo>` pre-flight ("is this REPO ready for an agent?") with a verdict/exit-code scorecard is a nice touch.

### (d) Tune + `npm publish` your own org harness
**Conceptually smooth, operationally unproven.** The flow is well-documented (`USAGE.md` §4–6): scaffold → edit/trim agents → `harness validate` (6-check umbrella) → `npm publish --provenance`. The "keep only what your repo needs, then ship it as your org's package" narrative (`README.md:48`) is the product's best story. Caveat: the most valuable promise — *trim it down and it stays healthy* — rests on `harness doctor`/`validate`/`upgrade`, whose robustness against real-world hand-edited harnesses isn't demonstrated.

### (e) Day-2 ops (doctor/validate/score/upgrade/sign/verify/mcp-scan)
**Real surface, genuinely broad.** All ~21 subcommands exist as real source files (`packages/create-agent-harness/src/`: `validate.ts`, `score.ts`, `genome.ts`, `threat-model.ts`, `mcp-scan.ts`, `sbom-cmd.ts`, `audit-cmd.ts`, `upgrade-cmd.ts`, `compare-cmd.ts`, `diag.ts`, `oia-manifest.ts`, `export-config.ts`, `federate.ts`, `completions-cmd.ts`, witness via `witness-client.ts` → Rust `crates/kernel/src/witness.rs`, 272 lines of real Ed25519 code). The day-2 toolkit is the most differentiated part of the CLI. **Rough edge:** `harness upgrade`'s three-way merge (`USAGE.md:164`) is the highest-risk, least-evidenced command — drift/upgrade is explicitly "make-or-break" per ADR-008/012, and there's no evidence it survives messy real harnesses.

---

## 4. Use cases, ranked

**Strong / real (ranked):**
1. **Org-wide branded agent CLI** — `npx @your-org/agent`, versioned like a dependency. The clearest value, clearest buyer (platform teams).
2. **OSS repo companion agent** — maintainers shipping a repo-aware agent; `repo-maintainer` vertical is purpose-built.
3. **Governed MCP server scaffolding** — default-deny + `mcp-scan` + witness-bound policy is a real, timely need even for users who don't want the whole harness.
4. **Multi-host portability** — "same harness, 9 hosts, one brand" genuinely saves the per-host integration tax (`ADR-001:130`).
5. **Supply-chain/provenance artifacts for agents** — SBOM + Ed25519 witness + npm provenance + threat-model, as a bundle, for compliance-minded teams.

**Weak / speculative:**
- **Self-evolving routing** (`USAGE.md:226`, ADR-014) — explicitly caveated by the underlying package itself: *"a diagnostic signal, not a proven early-warning lead vs a fair baseline… bench it before relying on it"* (`USAGE.md:250`). Honest, but it means this headline feature is unproven.
- **Federation / cross-instance witness** (ADR-014) — exotic, thin real-world demand.
- **Regulated-domain memory merkle attestation** (`ADR-011:113`) — impressive on paper, no evidence of a real consumer.
- **Sensitive verticals as turnkey safe products** (trading/legal/health) — the *safety* is the value prop, and it's not enforced in the shipped wrappers (§6). Speculative until proven.

---

## 5. Differentiators — which are real vs table-stakes

| Differentiator | Real? | Assessment |
|---|---|---|
| **Default-deny MCP + `mcp-scan`** | **Genuinely differentiated.** | ADR-022 is the strongest ADR in the set. Default-deny with opt-*in* capability, policy emitted as both enforced TS and inert scannable JSON, `mcp-scan` exiting 1 on HIGH as a CI gate — a real, well-reasoned security posture most scaffolders lack. The "safe state must be the default state" stance (`ADR-022:82`) is correct and rare. |
| **Witness-signed provenance (Ed25519)** | **Real Rust code; degraded in the shipping JS path** (see `03` §C). | `crates/kernel/src/witness.rs` is real, tested Rust; deterministic-seed signing across runners is a genuine property. But the npm product's witness path (`witness-client.ts`) falls through to a degraded "valid" when the kernel binary is absent. Differentiated *concept*, not yet load-bearing in shipped form. |
| **Determinism (byte-stable output)** | **Partially real, partially unproven.** | The reproducible-zip machinery (fixed dates) is real. But the headline **CLI↔Studio byte-parity guarantee is NOT tested** — ADR-027 names `apps/web-ui/__tests__/parity.test.ts` as its "sole enforcement," and **that file does not exist.** The web-UI generator is an independent behavior-port that doesn't import CLI code, so drift would go undetected. The most serious gap: a stated guarantee with no enforcement. |
| **Multi-host breadth (9 hosts)** | **Real, the broadest in market.** | All 9 host adapter packages exist (`packages/host-*`). Breadth is genuine and a real moat. Caveat: depth per host varies (Claude Code is "richest"; others are config-emitters — `host-claude-code/src/index.ts` is only 77 lines, so "adapter" ≈ config templating, not deep integration). |
| **Drift detection (`harness upgrade`)** | **Real code, unproven robustness.** | The three-way-merge copier model is sound in theory; whether it survives real hand-edited harnesses is undemonstrated. Table-stakes *concept* (copier does it), differentiated *for agent harnesses*. |
| **Witness ↔ npm provenance dual-signing** | **Real, somewhat over-engineered** for current demand. | Thoughtful (behavioral vs build authenticity, `ADR-011:26`) but ahead of any user actually asking for it. |

**Genuinely differentiated:** default-deny MCP governance, multi-host breadth, the provenance *concept*. **Table-stakes-or-unproven:** determinism (parity untested), drift detection, shipping witness path.

---

## 6. Product maturity / beta-readiness

The substrate is **more real than the "pre-implementation" docs suggest** — but the *documentation* is the least trustworthy layer, and a beta tester will hit contradictions in the first 10 minutes.

**What's genuinely polished:**
- The **Studio**: zero TODO/FIXME in non-test `.ts/.tsx`, ~2,559 lines of working generator code, 48 unit tests + a 10-test Playwright e2e covering every tab and the zip download. Shippable.
- The **kernel**: 11 real Rust subsystems (`crates/kernel/src/`: claims, cost, dispatch, federation, hooks, intel, mcp, memory, routing, witness), with real Ed25519 witness code. Not vaporware — though mostly unreachable from the npm product (see `03`).
- The **CLI subcommand surface**: ~21 real source files; not stubs.
- 20 templates present (minimal + 19 verticals), 9 host adapters present.

**What's half-built or contradictory (beta-tester landmines):**
1. **"Production-ready" vs "Pre-implementation."** `README.md:220` says production-ready; `docs/OVERVIEW.md:5` says *"Pre-implementation. The repo does not exist yet"*; `docs/USAGE.md:24` says *"currently in Phase 1 development."* These three ship in the same repo. **P0 doc fix.**
2. **Count contradictions everywhere.** README says **18** published packages in one place and **19 verticals** elsewhere; the directory actually holds **19** packages (`examples-packages/`); README "Status" table says **17 subcommands** while the body says **21** and USAGE says **20**; README says hosts are **6** in the FAQ (`README.md:330`) but **9** in the Hosts table; `examples-packages/README.md:55` says "8 hosts" while shipping a 9th. The **Status table is stale** (`README.md:223`: "6 host adapters," "17 subcommands," "568/568 tests") vs the body's 9 hosts / 21 commands.
3. **Status table claims vs reality.** It lists ADRs as "Proposed" (ADR-001, ADR-011) for features the README presents as shipped. The CHANGELOG tops out at **iter 102 / v0.1.1**, but docs reference iter 113/121/146-147 and `metaharness@0.1.5` — the CHANGELOG is behind the prose.
4. **The byte-parity test named as "the only thing preventing drift" does not exist** (§5). A core guarantee with zero enforcement.
5. **Example packages oversell.** The 19 `@metaharness/*` wrappers are 4-file thin aliases that `npx metaharness … --template X --host Y --force`. Their READMEs show **fabricated `harness doctor`/pipeline transcripts** (e.g. `trading/README.md:30-35` invents `PAPER_TRADING=true` settings and a `broker.live.*` deny-list; `research/README.md:44-52` invents "38 sources fetched, $1.21/$1.50 cap"). None of that ships in the package — it's asserted output of the downstream template. The "matching `@metaharness/host-<name>` adapter dependency" promise (`examples-packages/README.md:38`) appears in no package.json. **The sensitive-vertical safety guarantees (trading/legal/health) are README adjectives, not enforced code in the wrappers** — a real risk if anyone takes "paper-by-default" at face value.
6. Version reality: everything is `0.1.x`. That's *fine* for a beta — but it clashes with "production-ready release pipeline" language. Be one or the other.

**First-10-minutes beta-tester experience:** The Studio will delight them. Then they'll read OVERVIEW.md ("does not exist yet"), notice the README test badge (568) doesn't match the Status table, count the packages and get 19 not 18, and start distrusting every number. The *product* is more ready than the *docs* claim in some places and far less ready than they claim in others — and that inconsistency is itself the headline beta problem.

---

## 7. Top product feedback for Ruv (prioritized)

**P0 — credibility blockers (fix before broad beta):**
1. **Reconcile the status story.** Pick one: "v0.1.x beta" *or* "production-ready." Then delete/rewrite `docs/OVERVIEW.md:5` ("Pre-implementation… does not exist yet") and `docs/USAGE.md:24` ("Phase 1 development"). Right now the three primary docs disagree.
2. **Single source of truth for all counts.** Hosts, verticals, subcommands, published packages, test count — generate these into docs from the actual catalog (you already have `catalog.json`). Today: 18≠19 packages, 6≠9 hosts, 17≠20≠21 subcommands. The README "Status" table is the worst offender — it's stale.
3. **Make CLI↔Studio byte-parity true or stop claiming it.** ADR-027 says `apps/web-ui/__tests__/parity.test.ts` is the sole guard against drift, and it doesn't exist. Either write a real cross-package `Buffer.equal` parity test, or downgrade the claim from "byte-identical" to "behaviorally equivalent." Customers will rely on this.
4. **Stop fabricating CLI output in example READMEs.** The invented `harness doctor` transcripts and the unenforced "paper-by-default / drafts-only" safety claims in `trading`/`legal`/`research` are reputationally dangerous. Either generate those READMEs from real `--scaffold` output, or clearly mark transcripts as illustrative and move safety enforcement into the actual template (and prove it).

**P1 — adoption frictions:**
5. **Bury the ruflo lineage from the adopter path.** Lead docs (README, USERGUIDE) explain MetaHarness via ruflo. An adopter shouldn't need to know what ruflo is. Keep the lineage in ADRs/CONTRIBUTING.
6. **De-vertigo the naming stack.** One diagram, early, that places the user: *you run `metaharness` → it emits a harness → users run `harness`*. The current explanation is spread across ADR-035 and three docs.
7. **Prove `harness upgrade` on a messy harness.** The drift/upgrade three-way merge is make-or-break for the "own it and still get updates" promise. Ship a worked example (hand-edit a scaffold, run upgrade, show conflict resolution) — it's the feature platform teams will stress first.
8. **Clarify host *depth* vs *breadth*.** Be explicit that non-Claude-Code adapters are config emitters (77-line `host-claude-code/src/index.ts` sets expectations). "9 hosts" shouldn't imply 9 equally deep integrations.

**P2 — polish & honest scoping:**
9. **Label exotic features as experimental in-product.** Self-evolving routing, federation, memory-merkle attestation — the docs are honest in prose (`USAGE.md:250`) but the README/Status table present them as shipped capabilities. Add an "experimental" tag.
10. **Sync the CHANGELOG with the prose.** It stops at iter 102 while docs cite iter 146; readers use the CHANGELOG to gauge momentum.
11. **Tighten the keyword/SEO sprawl** in `README.md:349` — the 60+ keyword dump reads as slop and slightly undercuts the otherwise-serious provenance story.

---

### Closing read
MetaHarness has a real idea ("the harness is the product"), a real implementation (Rust kernel + working Studio + 21 commands + 9 adapters), and a genuinely differentiated security/provenance posture (default-deny MCP, witness signing). It is held back not by the engineering but by **documentation that can't decide if it's a spec, a beta, or a 1.0** — producing contradictions a discerning beta tester will catch immediately — and by **example packages that promise more than they ship.** Fix the credibility layer (P0) and this is a compelling beta. Leave it as-is and the most common first reaction will be "wait, which of these numbers do I believe?"
