# harness-eval — Performance Review (04)

Static (read-only) performance analysis of `/tmp/harness-eval`. No code was run; no
real-spend commands executed. Findings are tagged **[reasoned]** (grounded in the code
path) or **[speculative]** (plausible but needs a benchmark to confirm). File:line
references are to the target repo.

---

## Executive Summary

The **run orchestrator is the well-engineered part**: `runMatrix` uses a correct
bounded worker-pool (no unbounded `Promise.all` fan-out), budgets/wall-clock caps are
enforced, sandbox teardown is time-boxed with a leak-logging escape hatch, and the
daemon-holds-stdout footgun is genuinely mitigated (output is redirected to a file, not
the exec stream). Resource cleanup (timers, abort listeners, live-source registration,
tmp dirs, fixtures) is disciplined and uses `try/finally` consistently.

The performance risk is concentrated **downstream of the run**, in three places:

1. **Grading is fully serial at every level** — trials, criteria, and samples all run
   one-at-a-time. A single graded run is ~`trials × 15` sequential LLM agent loops. This
   is the dominant wall-clock cost and the biggest throughput lever.
2. **Transcript handling reads-and-parses whole files into memory, repeatedly**, with two
   genuinely quadratic hot spots (the live-tap re-parse loop; the whole-file re-read per
   poll) and no streaming/pagination to the browser.
3. **Read-only aggregation endpoints (`/api/inverse-scaling`, `/api/bracket`) re-scan and
   re-parse the entire `runs/` tree on every request** with no caching, unlike the
   mtime-cached run index they sit beside.

None of these bite at the current tiny scale (a handful of runs, short transcripts). All
of them degrade super-linearly as runs accumulate and as agent transcripts grow into the
multi-MB / thousands-of-turns range that long framework builds produce.

---

## Hot Paths Map

| Path | Trigger | Cost driver |
|------|---------|-------------|
| `runMatrix` → `runTrial` → `executeSessionScript` | every run | LLM/sandbox latency (external, bounded well) |
| `gradeTrials` → `judgeQuality` / `runEvaluator` | every run, post-build | **serial LLM agent loops** (§Concurrency #2) |
| `renderTrial` → `parseTranscript` | archive time + every transcript API hit | full-file read + full parse (§I/O #1) |
| `LiveTurnStream.poll` (SSE tick, 700 ms) | live build, per client | **O(n²) re-parse of accumulated transcript** (§I/O #2) |
| `buildInverseScaling` / `buildBrackets` | every `/api/inverse-scaling`, `/api/bracket` | **uncached full `runs/` rescan** (§Algorithmic #1) |
| `TrialView` Conversation / LiveStream render | trial page open | **un-virtualized turn list** (§Frontend #1) |
| `redactSecrets` / `redactDirectory` | archive time, every text file | multi-pass whole-string scans (§I/O #3) |

---

## Findings

### Concurrency & Parallelism

**C1 — Grading is serial across trials, criteria, and samples. [reasoned] — HIGH (throughput)**
`src/orchestrator/grade.ts:74` iterates trials in a plain `for…of` (`await` per trial).
Inside, `src/grading/judge.ts:169-186` loops the 5 `CRITERIA` sequentially, and for each
runs `samples` (default 3) sequentially (`judge.ts:172`), each sample being an agent loop
of up to 25 sequential `client.messages.create` calls (`judge.ts:99-107`). Net: one run =
`trials × 5 × 3` = `trials × 15` independent, fully serialized LLM agent sessions, plus a
serial evaluator pass per trial.
- **Impact:** grading wall-clock scales linearly with trial count and is the single
  largest post-build latency. A 6-candidate × 3-trial run is 18 trials → ~270 serial
  judge sessions end-to-end.
- **Why it's safe to parallelize:** each trial grades in its own `mkdtemp` isolated copy
  with its own mock port (`grade.ts:85-100`); criteria and samples are independent by
  construction (medians taken after).
- **Fix:** introduce bounded parallelism — a small pool (e.g. 3-4) over trials, and/or
  fan the 3 samples of a criterion out with `Promise.all`. Bound it to respect Anthropic
  rate limits and the `trialTimeoutMs` budget. Even sample-level `Promise.all` alone cuts
  per-criterion latency ~3×. Keep it configurable; grading is real-spend so unbounded
  fan-out would spike rate-limit/429 risk.

**C2 — CLI does not apply the per-provider concurrency default; Daytona overcommit. [reasoned] — MEDIUM (quota/latency)**
The studio path derives concurrency from `defaultConcurrency(provider)` = `1` for Daytona
(`src/studio/options.ts:100-106`, `run-exec.ts:130`), and the Configure UI warns at
`>1`. But the **CLI path** reads `--concurrency` with a flat default of `2`
(`src/cli.ts:149-150`), and `RunConfig.concurrency` also defaults to `2`
(`src/types.ts:134`) — neither is provider-aware. A Daytona run launched via CLI without
`--concurrency 1` therefore starts 2 concurrent sandboxes against a free tier the code
itself documents as effectively concurrency-1, producing quota errors that then burn the
60s×attempt infra-retry backoff (`scheduler.ts:334`).
- **Fix:** clamp/default concurrency by provider in the CLI (reuse `defaultConcurrency`),
  or validate `provider === "daytona" && concurrency > 1` and warn/clamp in the run
  config builder so both entry points behave identically.

**C3 — `runMatrix` worker pool is correct — no action. [reasoned] — POSITIVE**
`src/orchestrator/scheduler.ts:140-164` spins `min(concurrency, queue.length)` workers
that `queue.shift()` cooperatively; abort and budget checks happen per-dequeue. This is
the right pattern (bounded, no `Promise.all(plans.map(...))` fan-out that would provision
every sandbox at once). No change needed.

**C4 — Per-client SSE poll loops exec into the sandbox every 700 ms. [speculative] — LOW**
`src/studio/live-stream.ts:86-178`: each connected browser runs an independent 700ms
`tick` that shells `docker exec` / `daytona exec` / `tail` into the container
(`src/live/tap.ts:47-128`). Multiple tabs on the same building trial multiply container
exec load. Bounded per client, but consider sharing one tail stream per trial across
subscribers. Needs a benchmark under multi-viewer load to confirm it matters.

### Algorithmic Complexity

**A1 — `buildInverseScaling` and `buildBrackets` re-scan all of `runs/` uncached, per request. [reasoned] — HIGH (latency, wasteful recompute)**
`src/report/inverse-scaling.ts:112-200` and `src/bracket/bracket.ts:87-149` both
`readdirSync("runs")`, and for every run `Bun.file(results.json).json()` plus a
`grades.json` read per trial — on **every** call. They are wired directly to the studio
endpoints `/api/inverse-scaling` and `/api/bracket` (`src/studio/index.ts:206-215`) with
no memoization. Cost is `O(runs × trials)` file reads + JSON parses per request. Compare
`src/dashboard/data.ts:17-88`, which mtime-caches the run index — that caching is absent
here.
- **Impact:** each dashboard view of these tabs re-parses the whole corpus; grows linearly
  with accumulated runs and is repeated on every refresh/navigation.
- **Fix:** apply the same mtime/`CacheSlot` pattern as `loadRunIndex` (cache per
  `results.json` + `grades.json` mtime), or memoize the assembled `InverseScaling` /
  `Bracket[]` keyed by the max mtime under `runs/`. Also both functions duplicate the
  `targetBySha` build and the results/grades reattach walk that `loadRunIndex` already
  does — they could share one cached trial-index layer.

**A2 — `getRun` does a full index scan + zod re-parse per trial request. [reasoned] — LOW (cached)**
`src/dashboard/data.ts:90-97` implements `getRun` as `loadRunIndex().find(...)`, so
`/api/runs/:id/trials/:trialId` (`studio/index.ts:286`) re-scans the whole runs dir and
`RunResults.parse`s the whole owning run to return one trial. Mitigated by the mtime cache
(warm calls are cheap), but a cold/changed run pays full zod validation of every embedded
trial to serve a single trial. Acceptable now; revisit if run count grows large. No fix
required short-term.

**A3 — Report/aggregation loops are all linear or n log n. [reasoned] — POSITIVE**
`buildMatrix` (`scheduler.ts:82-100`), the inverse-scaling grouping/fit math, the bracket
seeding (`nextPow2`, adjacent pairing), and `bestTurnMatch` (`TrialView.tsx:528`,
`O(turns × terms)`) are all appropriately bounded. No accidental O(n²) over runs/trials in
the pure-compute paths.

### I/O Efficiency

**I1 — Transcripts are read whole, parsed whole, and serialized whole to the client; no streaming/pagination. [reasoned] — HIGH (memory, latency)**
`src/report/transcript-render.ts:454-461` (`renderTrial`) `readFileSync(path,'utf8')` each
session `.jsonl` in full, `parseTranscript` builds a `Turn[]` for **every** turn, and the
endpoint (`studio/index.ts:301-308` → `studio/transcript.ts:19-31`) returns the entire
`Turn[]` as one JSON body. Long framework builds produce multi-MB JSONL with thousands of
turns; the whole thing is buffered in the server, re-serialized, shipped, and rendered.
- **Impact:** server memory spikes to the full transcript size per request; large JSON
  payload over the wire; client parse + render of the entire structure (compounds with
  Frontend F1).
- **Fix:** paginate/stream turns (offset+limit or session-at-a-time), or stream the JSONL
  line-by-line with a streaming parser rather than `readFileSync(...).split("\n")`. At
  minimum, cap `Turn` payload sizes server-side (the Markdown path already truncates at
  `MAX_INLINE` = 4096 in `fence()`, but the JSON API ships full `tool_result.output` /
  `tool_use.input` untruncated).

**I2 — `LiveTurnStream.poll` re-parses the entire accumulated transcript every tick → O(n²). [reasoned] — HIGH (CPU, live builds)**
`src/live/tap.ts:180-196`: each poll appends new complete lines to `this.accumulated` and
then calls `parseTranscript(this.accumulated)` over the **whole** accumulated string,
slicing off only the new turns. Over a build that emits `n` lines across many 700ms polls,
total parse work is `O(n²)`. Worse, the host-local reader
(`fileLineReader`, `tap.ts:32-42`) `readFileSync`s the **entire file** and `.slice`s from
line N every poll — so the whole file is re-read from disk on each tick too. The `tail -n
+N` container readers avoid the re-read but the accumulated re-parse still dominates.
- **Impact:** studio CPU grows quadratically during a long live build; per-client.
- **Fix:** parse only the newly-arrived lines incrementally and append their turns (the
  parser is stated to be monotonic — appending complete lines only appends turns — so a
  per-delta parse is safe). For `fileLineReader`, track a byte offset and read only the
  tail (e.g. `fs` read from a stored position) instead of re-reading and slicing the whole
  file.

**I3 — `redactSecrets` makes up to 3 full-string passes per secret value, plus a `split` allocation just to count. [reasoned] — MEDIUM (archive-time CPU on large files)**
`src/driver/archive.ts:46-68`: for each secret value it does `out.includes(value)`, then
`out.split(value).length - 1` (allocates an array of every fragment purely to count), then
`out.replaceAll(value, …)` — up to 3 whole-string scans × up to 8 secret env values, then
7 regex passes. `redactDirectory` (`archive.ts:107-128`) applies this to every text file
up to **16 MB** across the whole copied-out workspace, and `archiveTrial` also redacts each
full transcript.
- **Impact:** archive-phase CPU/allocation scales with `secrets × fileBytes` over the whole
  workspace; noticeable on big builds with many large text artifacts.
- **Fix:** count during `replaceAll` (e.g. replace with a counting callback, or derive the
  count from a single `indexOf` loop) to drop the `split`; combine the env-value literals
  into one alternation regex for a single pass; skip values not present via one `indexOf`
  before doing work.

**I4 — Archive re-reads and re-parses the `.jsonl` it just wrote. [reasoned] — LOW**
`src/driver/archive.ts:141-165` writes each redacted transcript to disk, then
`renderTrial(trialDir)` (`archive.ts:178`) reads those same files back off disk and
re-parses them — the redacted text was already in memory moments earlier. A redundant
disk round-trip + parse per trial at archive time.
- **Fix:** pass the already-in-memory redacted transcript strings into a render function
  that accepts text directly, instead of resolving + re-reading via `renderTrial`.

**I5 — `daytona.copyOut` buffers the whole workspace tarball in memory. [reasoned] — LOW**
`src/providers/daytona.ts:123-136`: `downloadFile(tarPath)` returns the full gzip bytes,
held in memory before `writeFileSync`. Fine for typical workspaces; a pathologically large
build workspace would spike host memory. Acceptable; note for scale.

### Frontend

**F1 — Conversation and LiveStream render every turn with no virtualization. [reasoned] — HIGH (render/scroll jank on large transcripts)**
`src/studio/views/TrialView.tsx:725-752` maps `data.sessions[*].turns[*]` straight into
DOM `TurnBlock`s; `LiveStream` (`TrialView.tsx:915-917`) maps the whole `turns` array.
Large payloads collapse behind `<details>` (`Payload`, `:1022`) but the elements are still
mounted. A build with thousands of turns mounts thousands of nodes → slow first paint,
janky scroll, high memory.
- **Fix:** virtualize the turn list (e.g. windowed rendering), or lazy-mount `<details>`
  content on open. Pairs naturally with the API pagination in I1.

**F2 — LiveStream appends via `setTurns(prev => [...prev, ...])` each SSE frame; whole list re-renders, keyed by index. [reasoned] — MEDIUM**
`src/studio/views/TrialView.tsx:847` copies the growing array every frame and re-renders
the full list (`TurnBlock` is not memoized, keys are array indices at `:916`). During a
chatty live build this is repeated per turn-batch, O(n) per frame, O(n²) over the build.
- **Fix:** memoize `TurnBlock` (`React.memo`), key by a stable turn id, and/or append to a
  windowed list; combined with F1 virtualization this bounds re-render cost.

**F3 — Aggregation views recompute over full arrays; some use `useMemo`, dashboard `useFetch` lacks unmount guard. [speculative] — LOW**
`Conversation` correctly memoizes `outline`/`errors` (`TrialView.tsx:600-604`). But the
dashboard's `useFetch` (`src/dashboard/app.tsx:83-92`) has no `live`/unmount guard (the
studio `lib/api.ts:66-79` version does) — a late fetch can `setState` after unmount. Not a
throughput issue, but a correctness/memory smell worth aligning. Reweight/sort on slider
move (`app.tsx:110-120`, `lib/api.ts:83-90`) is over the candidate set (small) — fine.

### Resource Management

**R1 — daemon-holds-stdout footgun is mitigated in code. [reasoned] — POSITIVE (verified)**
CLAUDE.md flags that headless agents spawn daemons inheriting stdout and would hold the
exec stream open forever. `src/driver/claude.ts:16-27` redirects session output to a
**file** (`> ${outFile} 2>&1`) and `src/driver/print-cli.ts:53-62` reads that file in a
**separate** short-lived `exec`, never attaching to the build's stdout. The live tap uses
short-lived `tail` (not `tail -f`) for the same reason (`tap.ts` header). Mitigation
present and consistent.

**R2 — Sandbox teardown is bounded and leak-aware. [reasoned] — POSITIVE**
`scheduler.ts:342-362` runs `destroy()` under a `Promise.race` with a `TEARDOWN_CAP_MS`
(90s) timeout that logs a leak and moves on rather than hanging the run; the abort listener
is removed in `finally` (`:343`); the macOS-VZ OS-level reap (`src/providers/reap.ts`) is
guarded by an `lsof` ownership check so it never kills an unrelated VM. Good hygiene.

**R3 — SSE stream cleans up timers on close/cancel. [reasoned] — POSITIVE**
`src/studio/live-stream.ts:50-60,180-184` clears the poll timer on both `close()` and
stream `cancel()`, with a `MAX_TICKS` (~30 min) hard cap so an abandoned connection can't
poll forever. Preview manager stops all previews on `SIGINT/SIGTERM`
(`studio/index.ts:390-394`). No obvious leak.

**R4 — Synchronous whole-workspace `cpSync` per trial during grading. [reasoned] — LOW**
`src/orchestrator/grade.ts:100` `cpSync(workspace, evalWorkspace, {recursive:true})`
copies the entire built workspace into a tmp dir per trial (needed to break Node's
`package.json` ancestor resolution — a real correctness fix). It's synchronous and blocks
the event loop, but grading is already serial so it doesn't stall other work; noted only as
an I/O cost that scales with workspace size × trials. Cleanup (`rmSync`) is called on both
success and failure paths.

---

## Scalability Assessment

| Dimension | Current | Scales to | Breaks when |
|-----------|---------|-----------|-------------|
| Concurrent trials per run | correct bounded pool | fine | only limited by provider quota (see C2 for Daytona default) |
| Trials **graded** per run | serial × 15 LLM loops each | ~tens of trials, slowly | grading wall-clock becomes the run's bottleneck; large matrices take hours (C1) |
| `runs/` corpus size | uncached rescan on 2 endpoints | dozens of runs | inverse-scaling/bracket latency grows `O(runs×trials)` per request (A1) |
| Transcript size | whole-file read/parse/serialize; O(n²) live re-parse | short builds | multi-MB / thousands-of-turns transcripts spike server memory, live-CPU, and client render (I1, I2, F1) |
| Dashboard turn rendering | un-virtualized | hundreds of turns | thousands of turns → jank/OOM in tab (F1, F2) |

**Verdict:** Architecturally sound for its current "handful of runs, short builds" scale,
with a genuinely well-built orchestrator core. It will **not** scale gracefully along two
axes without work: (a) **grading throughput** as the candidate×trial matrix grows, and
(b) **transcript/aggregation I/O** as builds get long and runs accumulate. Both are
addressable with bounded parallelism + caching + streaming; none require architectural
rework.

---

## Prioritized Recommendations

1. **Parallelize grading with a bounded pool (C1).** Highest wall-clock payoff. Start with
   sample-level `Promise.all` (safe 3× per criterion), then a trial-level pool of 3-4,
   rate-limit-aware.
2. **Cache the inverse-scaling / bracket aggregations (A1).** Reuse the mtime `CacheSlot`
   pattern from `dashboard/data.ts`; ideally a single shared cached trial-index layer that
   `loadRunIndex`, `buildInverseScaling`, and `buildBrackets` all read.
3. **Fix the live-tap O(n²) re-parse + whole-file re-read (I2).** Parse only new-line
   deltas; byte-offset the file reader. Directly reduces studio CPU during long builds.
4. **Paginate/stream the transcript API and virtualize the turn list (I1 + F1).** Bounds
   server memory, payload size, and client render for large transcripts together.
5. **Make CLI concurrency provider-aware (C2).** One-line-ish clamp; prevents Daytona
   free-tier overcommit + wasted retry backoff.
6. **Tighten `redactSecrets` to a single pass + memoize live-tap deltas (I3, F2).** Lower
   value; do alongside the above.

---

## Suggested Benchmarks

Real measurement is needed to confirm the super-linear risks and to size fixes:

- **Grading latency vs matrix size:** time `gradeTrials` for 1 / 6 / 18 trials (mock the
  Anthropic client to a fixed-latency stub) to quantify the serial penalty and the
  parallel-pool speedup ceiling before touching real spend.
- **Live-tap CPU vs transcript length:** feed `LiveTurnStream.poll` a synthetic JSONL that
  grows to 1k / 5k / 20k lines and measure cumulative parse time per poll — should show the
  O(n²) curve and validate the delta-parse fix.
- **Transcript endpoint memory/latency vs size:** hit `/api/runs/:id/trials/:trialId/transcript`
  against archived transcripts of 100 KB / 2 MB / 20 MB; capture server RSS, response
  bytes, and time-to-first-byte (baseline for streaming).
- **Frontend render vs turn count:** React profiler on `TrialView` Conversation at 200 /
  2 000 / 10 000 turns; measure mount time, scroll FPS, tab memory (baseline for
  virtualization).
- **Aggregation endpoint scaling:** replicate `runs/` to 10 / 50 / 200 run dirs and time
  `/api/inverse-scaling` + `/api/bracket` cold vs (proposed) cached.
- **Redaction throughput:** `redactDirectory` over a workspace with N large text files to
  size the multi-pass cost and confirm the single-pass improvement.
