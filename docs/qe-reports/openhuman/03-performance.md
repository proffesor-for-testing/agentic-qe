# OpenHuman — Performance Review

**Scope reviewed**: `src/` (Rust, 1,345 .rs files), `app/src/` (TypeScript/React, 377 .tsx + 291 .ts files)
**Date**: 2026-05-20
**Reviewer**: V3 QE Performance Reviewer
**Posture score**: **5 / 10** — solid foundations (SSE streaming, HTTP client cache, `spawn_blocking` discipline in some hot tools), but several systemic patterns will hurt under realistic load (bulk WhatsApp ingest, large conversations, voice transcription, vault sync).

---

## Executive summary

OpenHuman has good performance hygiene in some places (`build_runtime_proxy_client` caches `reqwest::Client`s by service key; `GrepTool` correctly wraps its sync walker in `tokio::task::spawn_blocking`; SSE streaming uses `bytes_stream` not full-buffer reads) but is undermined by **five systemic issues**:

1. **No SQLite connection pooling and no transactions for bulk writes.** Stores like `whatsapp_data/store.rs` and `vault/store.rs` open a fresh `Connection` per call and execute INSERT/UPDATE rows in a `for` loop with no transaction and no `prepare_cached`. The WhatsApp message upsert path is particularly bad: O(N) `INSERT ON CONFLICT` statements + an UPDATE with two correlated COUNT(*)/MAX subqueries per affected chat.
2. **Voice transcription transcodes audio to JSON `number[]` and ships it across Tauri IPC.** `Array.from(new Uint8Array(...))` blows up a binary blob ~8× in memory and JSON serialization cost. A 30-second 48kHz mono clip (~1MB raw) becomes a ~8MB JS array, then a ~25MB JSON string.
3. **No code-splitting in the React app.** Every route — including the WebGL `three.js` welcome screen, the `remotion`/`MascotCharacter` page, `react-joyride`, and full `react-markdown` — is imported at top level and ships in the main bundle. Vite has no `manualChunks` configured.
4. **The largest page component (`Conversations.tsx`, 2125 LOC, 39 hook calls, ~30 `useState`) recomputes derived data on every render.** `visibleMessages`, `latestVisibleAgentMessage`, `activeToolTimelineEntry`, `selectedThreadParent`-via-`find` and several `[...arr].reverse().find(...)` clones run *every render*, none are memoized. Message bubbles (`BubbleMarkdown` → `react-markdown`) are NOT wrapped in `React.memo`, so every keystroke in the composer re-renders every visible message.
5. **Sync `std::fs` I/O inside `async fn` without `spawn_blocking`** in `vault/sync.rs` (the entire vault walk + per-file read is inline-blocking inside `pub async fn sync_vault`). One file-system tree walk = one tokio worker blocked for the full duration.

The codebase shows comments that indicate past perf surgery (the `html2md` removal note in `Cargo.toml` is exemplary), so the team is performance-aware — these findings are about the next wave of fixes.

---

## Findings by category

### 1. Algorithmic complexity / hot loops with allocations

#### 1.1 Streaming SSE buffer re-allocates per chunk — **MEDIUM**
**File**: `src/openhuman/inference/provider/compatible.rs:911-923`
```rust
let mut bytes_stream = response.bytes_stream();
let mut buffer = String::new();
while let Some(item) = bytes_stream.next().await {
    let bytes = item?;
    buffer.push_str(&String::from_utf8_lossy(&bytes));   // L916: allocates Cow<str>→String per chunk
    while let Some(sep_idx) = buffer.find("\n\n") {
        let event = buffer[..sep_idx].to_string();       // L922: full copy of event
        buffer.drain(..sep_idx + 2);                     // L923: O(n) shift
        ...
```
Three allocations per SSE event in the chat-streaming hot path. `from_utf8_lossy` allocates a `String` even when the bytes are valid UTF-8 (the common case). `buffer.drain` shifts the remaining tail on every event. For a long streaming completion (10K+ events for a multi-thousand-token response) this is noticeable GC/alloc pressure.

**Fix**: Use a `BytesMut`/`bytes::Bytes` ring buffer or read into a `Vec<u8>` and split on `\n\n` boundaries before doing UTF-8 decode once; reuse the buffer instead of `drain`. Or use the `eventsource-stream` crate.

**Impact**: Reduces allocations roughly N×events. Streaming feels less janky on long completions on low-RAM laptops.

#### 1.2 Conversations page recomputes derived state every render — **HIGH**
**File**: `app/src/pages/Conversations.tsx:1036-1047`
```tsx
const visibleMessages = messages.filter(msg => !msg.extraMetadata?.hidden);   // alloc Vec
const latestVisibleMessage = visibleMessages[visibleMessages.length - 1] ?? null;
const latestVisibleAgentMessage = [...visibleMessages]                         // FULL CLONE
  .reverse()
  .find(msg => msg.sender === 'agent');
const activeSubagentTimelineEntry = selectedThreadToolTimeline.find(...);
const activeToolTimelineEntry = [...selectedThreadToolTimeline]                // FULL CLONE
  .reverse()
  .find(entry => entry.status === 'running' && !entry.name.startsWith('subagent:'));
```
Every render of this 2125-LOC component clones the entire `visibleMessages` array and the entire `selectedThreadToolTimeline` array just to find the *last* matching element. With 30+ `useState` calls in the same component and Redux events arriving every SSE chunk, this runs constantly. Each clone forces a new array identity, so any downstream `useEffect`/`useMemo` keyed on these values re-fires.

**Fix**: Wrap each derived value in `useMemo` keyed on the source array; replace `[...arr].reverse().find(p)` with `findLast(p)` (ES2023, no allocation).

**Impact**: HIGH — this is the most visible chat-interaction surface. Removing the clones cuts per-render allocator pressure dramatically and stabilizes hook deps.

#### 1.3 WhatsApp upsert: N+1 + correlated subqueries + no transaction — **HIGH**
**File**: `src/openhuman/whatsapp_data/store.rs:184-249`
```rust
fn upsert_messages_inner(&self, account_id: &str, msgs: &[IngestMessage]) -> Result<usize> {
    let conn = self.open_conn()?;                              // L181: NEW connection
    for m in msgs {
        conn.execute("INSERT INTO wa_messages ... ON CONFLICT ... DO UPDATE ...", ...)?;  // L195-228: per-row
    }
    if count > 0 {
        conn.execute("UPDATE wa_chats SET message_count = (SELECT COUNT(*) FROM wa_messages WHERE ...), last_message_ts = COALESCE((SELECT MAX(timestamp) FROM wa_messages WHERE ...), ...) WHERE account_id = ?2", ...)?;  // L234-247: scan-per-chat
    }
}
```
And in `prune_old_messages_inner` (L273-319): same pattern but the post-prune UPDATE is run **once per affected chat** (`for (acct, chat_id) in &affected`), each containing two correlated subqueries that scan `wa_messages`.

Plus zero `prepare_cached` calls anywhere in the repo (`grep -rn prepare_cached src/openhuman` = 0 matches), so every iteration re-parses SQL.

**Fix**:
- Wrap the loop in `conn.transaction()` (or `unchecked_transaction`) — single fsync instead of N
- `prepare_cached` the INSERT statement and reuse across the loop
- For the chat-stats refresh: do a single set-based UPDATE … FROM (SELECT … GROUP BY) instead of one UPDATE per chat
- Use a shared connection pool (`r2d2_sqlite` or a single long-lived connection + WAL) instead of `open_conn` per call

**Impact**: For an initial WhatsApp backfill of 50K messages across 200 chats, current code does ~50K + 1 statements plus 200 multi-subquery updates. A batched transactional version drops this to ~50K statements in ONE transaction (typically 20-100× faster on SSD, more on HDD) plus a single aggregate UPDATE.

#### 1.4 Vault per-file read: in-loop sync I/O on async fn — **HIGH**
**File**: `src/openhuman/vault/sync.rs:78` (signature: `pub async fn sync_vault`) + `:130` (sync `WalkDir`) + `:217` (sync `std::fs::read_to_string`)

`sync_vault` is `async fn` but contains a sync `walkdir::WalkDir` iteration plus `std::fs::read_to_string` per file (and a `sha256_hex` over the contents). Nothing in `src/openhuman/vault/sync.rs` calls `tokio::task::spawn_blocking` (`grep -rn spawn_blocking src/openhuman/vault` = no matches). For a 10K-file vault, this monopolizes a tokio worker for seconds-to-minutes.

**Fix**: Wrap the entire walk/read body in `spawn_blocking`, or move the walk to a dedicated thread that streams `(path, hash, mtime)` tuples back to the async side via a bounded channel.

**Impact**: Today, a vault sync can starve every other tokio task on the same worker thread (default tokio multi-thread runtime has `num_cpus` workers — on a 4-core laptop that's 25% of compute frozen).

#### 1.5 Grep tool single-threaded inside spawn_blocking — **MEDIUM**
**File**: `src/openhuman/tools/impl/filesystem/grep.rs:118-122` + `:154-202`

Correctly wraps in `spawn_blocking` (good) but `scan_for_matches` walks one file at a time and reads contents synchronously per file. On a workspace with 5–10K files this is bottlenecked on serial syscalls.

**Fix**: Use `ignore::WalkBuilder::threads(num_cpus)` (from `ripgrep`'s `ignore` crate, which the team is already comfortable with given the lint:commands-tokens script) or `rayon::par_bridge()` on `WalkDir`. Same regex, parallel reads.

**Impact**: Multi-core speedup on agent grep tool calls — practically MEDIUM because matches are usually rare hot calls but each can be slow.

---

### 2. Async / concurrency

#### 2.1 `std::fs::write` / `std::fs::read_to_string` inside async paths — **MEDIUM**
**Files (production code, not tests)**:
- `src/openhuman/workspace/ops.rs:23` — `std::fs::write(&path, contents)` (workspace file write)
- `src/openhuman/tree_summarizer/cli.rs:135` — `std::fs::read_to_string(path)` (called from `block_on`)
- `src/openhuman/tree_summarizer/store.rs:175`, `:197`, `:260` — sync `fs::write`, `fs::read_to_string`, `fs::read_dir`
- `src/openhuman/tools/impl/browser/image_output.rs:41` — sync `fs::write` after browser screenshot
- `src/openhuman/vault/sync.rs:217` — see 1.4
- `src/openhuman/webhooks/router.rs:51` — sync read at construction (acceptable — startup)

`webhooks/router.rs:535` correctly offloads to `tokio::task::spawn_blocking` (good pattern). The others don't.

**Fix**: Migrate to `tokio::fs` or wrap in `spawn_blocking`.

#### 2.2 `block_in_place` + `block_on` from inside async — **MEDIUM**
**File**: `src/openhuman/agent/harness/session/builder.rs:1549-1581` (`prefetch_tool_memory_rules_blocking`)

The code is *careful* (checks `runtime_flavor() != MultiThread` and returns empty rather than panicking), but the entire prefetch is on the session-startup hot path. Every chat session spawn pays this cost on the calling thread. It also defeats the `Memory` trait's async-ness — under heavy load (many concurrent sessions starting) all of them serialize through the calling worker.

**Fix**: Make `build_session` (or wherever `prefetch_tool_memory_rules_blocking` is called) genuinely async; `await` the rules. The "no runtime → empty Vec" fallback is fine, but the multi-threaded path should not `block_in_place`.

#### 2.3 Unbounded mpsc channels in hot paths — **MEDIUM**
**Files**:
- `src/openhuman/memory/ingestion/queue.rs:106` — `mpsc::unbounded_channel::<IngestionJob>()`
- `src/openhuman/voice/server.rs:587` — unbounded for voice events
- `src/openhuman/voice/hotkey.rs:196` — unbounded for hotkey events
- `src/openhuman/service/restart.rs:194` — unbounded for restart events

`memory/ingestion/queue.rs` is the most concerning — under a backfill burst (Gmail 3-day backfill binary `gmail-backfill-3d` exists per `Cargo.toml`), an unbounded queue means producer outpaces consumer → unbounded memory growth → OOM. Voice/hotkey/restart are lower volume so practical risk is smaller.

**Fix**: `mpsc::channel(N)` with `N` sized for expected concurrency, plus `try_send` with explicit backpressure logging on the producer side.

#### 2.4 Sequential embedding calls — **HIGH** (during backfills)
**File**: `src/openhuman/memory/tree/score/embed/ollama.rs:151-205`

`embed()` accepts one `&str`, makes one HTTP round-trip. All callsites (`tree_global/digest.rs`, `tree_global/seal.rs`, `tree_source/bucket_seal.rs`, `retrieval/source.rs`) call it inside sequential `await`s. For a multi-chunk seal or a backfill that needs to embed N docs, this is `O(N × RTT)`.

Ollama supports batch via passing `prompt` as an array (or `/api/embed` with `input: [...]`) — the embedder doesn't expose that. Even without batch, `futures::stream::iter(items).buffer_unordered(8)` would parallelize. There's no `join_all`/`FuturesUnordered`/`buffer_unordered` anywhere in `memory/tree/` for embeds.

**Fix**:
- Add `embed_batch(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>>` to the `Embedder` trait
- For Ollama, use `/api/embed` (plural) with `input: [...]`
- For cloud, batch using the Voyage `inputs: [...]` form
- At callsites that loop, switch to `stream::iter(...).buffer_unordered(8).try_collect()`

**Impact**: HIGH for backfills. Today, embedding 200 chunks at ~80ms each = 16s sequential. Even simple `buffer_unordered(8)` drops this to ~2s.

#### 2.5 Embedder rebuilt per call — **LOW**
**File**: `src/openhuman/memory/tree/score/embed/factory.rs:60` — `build_embedder_from_config` is called from every seal/digest. `OllamaEmbedder::new` (`embed/ollama.rs:75`) calls `reqwest::Client::builder().connect_timeout(...).build()` — a new HTTP client every time. `reqwest::Client` is cheap to clone but not free to build (connection pool init, TLS config). The comment at `factory.rs:58` calls this "cheap" but it isn't free in a tight loop.

**Fix**: Cache the embedder in a `OnceCell`/`once_cell::sync::Lazy` keyed on config hash, or pass `Arc<dyn Embedder>` down instead of constructing per call.

---

### 3. Resource management

#### 3.1 Per-request `reqwest::Client::new()` — **MEDIUM**
Several production paths construct a new HTTP client per instance rather than going through the cached `build_runtime_proxy_client`:
- `src/openhuman/channels/providers/telegram/channel_core.rs:32` — `client: reqwest::Client::new()` in `Self { ... }` (per `TelegramChannel`). Fine if the channel is long-lived; but the same file at L72 also has `fn http_client(&self) -> reqwest::Client { build_runtime_proxy_client("channel.telegram") }` — so requests go through *two* client paths inconsistently. The `client` field appears unused for sending if `http_client()` is the canonical method.
- `src/openhuman/channels/providers/linq.rs:25` — `client: reqwest::Client::new()` — no proxy support, doesn't honour `runtime_proxy_config`.
- `src/openhuman/tools/ops.rs:79` — `reqwest::Client::new()` passed into `NodeBootstrap::new(...)` — bootstrap downloads node distros. Probably fine (rare event).
- `src/openhuman/inference/local/service/bootstrap.rs:69` — fallback client construction.
- `src/openhuman/memory/tree/score/embed/ollama.rs:83` — fallback for builder failure (rare path).
- `src/openhuman/routing/health.rs:62` — fallback for builder failure.

`build_runtime_proxy_client` (`config/schema/proxy.rs:438`) caches clients by service key — that's the good pattern. Channels should use it.

**Fix**: Route Linq and Telegram through `build_runtime_proxy_client("channel.linq")` / `"channel.telegram"` for consistent proxy + connection pooling. Drop the per-struct `client` field.

#### 3.2 SQLite `Connection::open` per request, no pool — **HIGH** (under load)
**Files**: 14+ files open a fresh connection per operation:
- `src/openhuman/whatsapp_data/store.rs:88` (`open_conn`)
- `src/openhuman/vault/store.rs:19`
- `src/openhuman/subconscious/store.rs:27`
- `src/openhuman/subconscious/situation_report/hotness.rs:198`
- `src/openhuman/redirect_links/store.rs:208`
- `src/openhuman/notifications/store.rs:69`
- `src/openhuman/embeddings/store.rs:88`
- `src/openhuman/cron/store.rs:565`
- `src/openhuman/memory/tree/read_rpc.rs:1382`
- `src/openhuman/people/store.rs:56`
- `src/openhuman/migration/core.rs:154`

Each call re-runs `PRAGMA journal_mode=WAL`, `busy_timeout`, and pays the open() cost (~1–5ms per open on a warm cache, more if the DB file isn't in the OS page cache). With 10K SQL operations during a backfill that's 10–50s of pure connection-open overhead.

**Fix**: Use `r2d2_sqlite::SqliteConnectionManager` + `r2d2::Pool` with `max_size = num_cpus`. Or hold a single `Arc<Mutex<Connection>>` for writes (SQLite WAL allows concurrent readers without locking). The codebase already has `parking_lot::Mutex` and `tokio::sync::Mutex` so the dependency is in place.

#### 3.3 `redux-persist` serializableCheck on every action — **LOW (dev only)**
**File**: `app/src/store/index.ts:156-166`

`serializableCheck` is left at default (enabled) for dev; with chat-runtime state containing turn timelines this walks a deep object tree on every dispatch. Production builds disable it by default in `@reduxjs/toolkit`, but dev experience is degraded.

**Fix**: `serializableCheck: false` or scope to ignored paths if devs are noticing dev slowdown.

---

### 4. React rendering

#### 4.1 Only ONE `React.memo` in the entire app — **HIGH**
**Measured**: `grep -rn "React.memo\|memo(" app/src --include="*.tsx" --include="*.ts"` returns 1 match (`src/components/intelligence/MemoryResultList.tsx` comment only; no actual `React.memo` call). Zero memoized components.

In a chat UI streaming tokens via Redux dispatch (one `setStreamingAssistantForThread` per SSE chunk), this means **every visible message re-renders on every chunk**. `BubbleMarkdown` (`app/src/pages/conversations/components/AgentMessageBubble.tsx:40-78`) wraps `react-markdown` which is CPU-expensive (full Markdown → AST → React tree per render).

**Fix**:
- `export const AgentMessageBubble = React.memo(function AgentMessageBubble(...) { ... })`
- `export const BubbleMarkdown = React.memo(function BubbleMarkdown(...) { ... })` keyed on `content`
- Same for thread sidebar items (currently inline `sortedThreads.map(thread => (...))` at `Conversations.tsx:1279`)

**Impact**: HIGH — each token streamed today re-Markdowns every visible bubble. For a chat with 50 visible bubbles, that's 50× wasted work per SSE chunk.

#### 4.2 No virtualization for messages or thread list — **MEDIUM**
**Files**:
- `app/src/pages/Conversations.tsx:1279` (sidebar `sortedThreads.map`)
- `app/src/pages/Conversations.tsx:1555` (messages `visibleMessages.map`)
- `app/src/components/intelligence/MemoryResultList.tsx:9-10` (explicit comment "intentionally non-virtualized for now")

`grep -rn "react-window\|react-virtuoso\|virtualized"` returns no library usage. A long conversation (200+ messages) or a power user with 500+ threads will render all DOM nodes.

**Fix**: Add `react-virtuoso` (TS-friendly, simple API). Apply to message list and thread sidebar first.

#### 4.3 Inline new objects/arrays in `useAppSelector` defaults — **MEDIUM**
**File**: `app/src/pages/Conversations.tsx`
- L1031-1032: `toolTimelineByThread[selectedThreadId] ?? []` — new `[]` reference on every render
- L1034: `taskBoardByThread[selectedThreadId] ?? null` — fine for null, but pattern applies elsewhere
- L263: `state.locale?.current ?? 'en'` — fine (primitive)

These aren't *inside* the selector but the `?? []` literal creates a new array reference at render time, which then feeds into the timeline render below. Downstream `useEffect([selectedThreadToolTimeline, ...])` would fire every render.

**Fix**: Move the `?? []` into `useMemo`, or use a module-level `EMPTY_TIMELINE = Object.freeze([])` constant.

#### 4.4 `selectedThreadParent` uses `Array.find` on every render — **LOW**
**File**: `app/src/pages/Conversations.tsx:1217-1226` — IS wrapped in `useMemo([threads, selectedThreadId])`, which is good. But `threads.find(...)` runs twice (current + parent). For a user with 1000 threads, that's 2000 ops on every selection change. Build a `Map<id, Thread>` once.

**Fix**: `const threadById = useMemo(() => new Map(threads.map(t => [t.id, t])), [threads])`, then `threadById.get(id)`.

#### 4.5 Top-level state from `useAppSelector(state => state.thread)` — **MEDIUM**
**File**: `app/src/pages/Conversations.tsx:219` — `} = useAppSelector(state => state.thread);` destructures the entire `thread` slice. Any modification to any field (e.g. setting a single thread's title) re-renders all 2125 lines of this component. With `react-redux` v9 the default equality is reference, so this is acceptable IF the slice carefully maintains stable identity for unchanged sub-slices — but with `redux-persist`, rehydration mutates the whole slice.

**Fix**: Split into field-level selectors: `useAppSelector(s => s.thread.threads)`, `useAppSelector(s => s.thread.selectedThreadId)`, etc.

---

### 5. Database / persistence

#### 5.1 No prepared-statement cache — **MEDIUM**
**Measured**: `grep -rn "prepare_cached" src/openhuman --include="*.rs"` = **0 matches** in production code.
Every `conn.execute("INSERT ... ", ...)` re-parses the SQL on each call. For tight loops (WhatsApp, vault, embeddings store) this is wasted work. `rusqlite::Connection::prepare_cached` exists exactly for this and is the idiomatic fix.

#### 5.2 Correlated subqueries in chat-stats refresh — **MEDIUM**
See §1.3 — `whatsapp_data/store.rs:234-247` and `:298-312`. Two subqueries per row.

**Fix**: One aggregate-based UPDATE: `UPDATE wa_chats SET (message_count, last_message_ts) = (SELECT COUNT(*), MAX(timestamp) FROM wa_messages WHERE wa_messages.account_id = wa_chats.account_id AND wa_messages.chat_id = wa_chats.chat_id), updated_at = ?` keyed on the affected `(account_id, chat_id)` set.

#### 5.3 Bundled subquery in `list_vaults` — **LOW**
**File**: `src/openhuman/vault/store.rs:77-100`
```sql
SELECT v.id, ..., (SELECT COUNT(*) FROM vault_files vf WHERE vf.vault_id = v.id AND vf.status = 'ok') AS file_count
FROM vaults v
```
For each vault row, a COUNT(*) scan over its files. With many vaults this is N+1-shaped (correlated scalar subquery per row). Use a single `LEFT JOIN ... GROUP BY` for one pass.

#### 5.4 No `LIMIT` on many `SELECT` paths — **LOW**
Several `SELECT account_id, chat_id, message_id, sender, ... FROM wa_messages WHERE ...` queries in `whatsapp_data/store.rs:371-484` don't show a LIMIT — they may be intentional dump queries, but for any UI-facing path they should be paginated. Quick audit needed.

---

### 6. LLM / streaming

#### 6.1 Streaming buffer allocations — see §1.1
#### 6.2 Sequential embeds — see §2.4
#### 6.3 Non-SSE fallback buffers full response — **EXPECTED**
`compatible.rs:893` — `response.bytes().await?` when content-type isn't SSE — correct behavior; logged as warning. No action.
#### 6.4 No cancellation on stream — **MEDIUM**
**File**: `src/openhuman/inference/provider/compatible.rs:911-` (main streaming loop)

The `while let Some(item) = bytes_stream.next().await { ... }` loop has no cooperative-cancel checkpoint. If the user hits cancel mid-stream, the only path to stop is dropping the future. That works but until cancellation lands, more chunks keep getting parsed and dispatched. Check for an `AbortHandle` / `CancellationToken` and bail explicitly on each iteration.

---

### 7. Build / startup — bundle size

#### 7.1 No code-splitting — **HIGH**
**Files**: `app/vite.config.ts:107-201` (no `build.rollupOptions.output.manualChunks`), `app/src/AppRoutes.tsx:1-17` (all 13 routes imported eagerly).

Top-level imports include:
| Dep | Used by | Why heavy |
|-----|---------|-----------|
| `three` | `RotatingTetrahedronCanvas.tsx` (Welcome only) | ~600 KB gzipped |
| `remotion` + `@remotion/player` + `@remotion/zod-types` | Mascot, MascotFrameProducer | ~250 KB combined |
| `react-joyride` | Walkthrough only | ~75 KB |
| `react-markdown` | Chat | ~60 KB + unified/remark dep tree |
| `lottie-react` | Mascot animations | ~250 KB |
| `socket.io-client` | Always on | ~100 KB |
| `redux-logger` | Dev only, but is in `dependencies` not `devDependencies` | Tree-shaken via `IS_DEV` guard but still imported |
| `@sentry/react` | Telemetry | ~80 KB |
| `@noble/curves`, `@noble/secp256k1`, `@scure/bip32`, `@scure/bip39` | Wallet only | ~100 KB combined |
| `react-ga4` | Analytics | small but still ships |

**Fix**:
- `const Welcome = React.lazy(() => import('./pages/Welcome'))` etc. for every route in `AppRoutes.tsx`; wrap `<Routes>` in `<Suspense fallback={...}>`
- Dynamic `import('three')` inside `RotatingTetrahedronCanvas` so it ships only when the user lands on `/welcome`
- Dynamic `import('react-joyride')` inside `AppWalkthrough`
- `import('@noble/secp256k1')` inside wallet flows only
- `redux-logger` → move to `devDependencies` (it's in dependencies at `app/package.json:94`)
- Configure `build.rollupOptions.output.manualChunks` to extract `react-markdown`, `socket.io-client`, `@sentry/react` into separate vendor chunks for better caching

**Impact**: HIGH for cold-start of the welcome route in particular; bundle audit should show 30-50% reduction in initial JS payload.

#### 7.2 `redux-logger` in production `dependencies` — **LOW**
**File**: `app/package.json:94` — `"redux-logger": "^3.0.6"` is in `dependencies` (used only in dev per `store/index.ts:162`). Tree-shaken if the bundler proves the branch is dead, but `IS_DEV` is a runtime check — Vite *should* drop it via `import.meta.env.PROD` substitution, but worth confirming with a bundle analyzer.

**Fix**: Move to `devDependencies` AND guard the import: `if (IS_DEV) { const { createLogger } = await import('redux-logger'); ... }`.

#### 7.3 `nodePolyfills` includes `crypto` and `stream` — **MEDIUM**
**File**: `app/vite.config.ts:132-139` — `nodePolyfills` adds shims for `buffer`, `process`, `util`, `os`, `crypto`, `stream`. The wallet code (`@noble/*`) uses these for compatibility but the polyfills add weight to the main bundle if not tree-shaken precisely. Worth a `vite-bundle-visualizer` pass.

---

### 8. I/O patterns

#### 8.1 Audio binary → `number[]` → JSON → IPC — **HIGH**
**File**: `app/src/pages/Conversations.tsx:823` + `app/src/utils/tauriCommands/voice.ts:155-165`
```tsx
const audioBytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
// ...
openhumanVoiceTranscribeBytes(audioBytes, extension, context);  // number[] across IPC
```
A 30-second 48 kHz 16-bit mono blob ≈ 2.9 MB binary. `Array.from(new Uint8Array(...))` produces a JS array where each byte becomes a Number (boxed, ~8 bytes each in V8's small-int form, but the array literal expansion for JSON serialization writes `[0,12,255,...]` — typically ~4 chars/byte) → ~12 MB JSON string. For 1-minute clips this is 25 MB+. Then crosses the Tauri IPC bridge (postMessage), gets JSON-parsed on the Rust side.

**Fix**: Use Tauri's binary IPC path — write the blob to a tempfile via `convertFileSrc` + `writeFile` plugin, then pass the path (this codebase already has `openhumanVoiceTranscribe(audio_path: ...)` at `voice.ts:150` — use it instead of `*Bytes`). Or use the Tauri 2.x `ArrayBuffer` transport directly without the `Array.from` round-trip.

**Impact**: HIGH — for a 60-second recording this swings from ~25 MB JS heap allocation + 25 MB IPC + 25 MB JSON parse on Rust side down to a tiny path string. Also cuts perceived latency by ~100-500 ms.

#### 8.2 `serde_json::Value` on hot LLM paths — **LOW**
**File**: `src/openhuman/inference/provider/traits.rs:296-301` — Anthropic/Gemini/OpenAI tool definitions stored as `Vec<serde_json::Value>`. `serde_json::Value` is convenient but allocation-heavy (every string is a `String`, every object a `Map<String, Value>`). For frequent serialization of tool specs at chat turn start, prefer typed structs.

Not urgent — tool sets are typically <20 entries and serialized once per turn.

---

## Bundle / dependency size observations

(Confirmed via reading `app/package.json` and grep; no `npm` install was run.)

Heavy deps shipping in main bundle (no code-splitting):
- `three` (~600 KB gz) — used only on `/welcome` (`RotatingTetrahedronCanvas`)
- `remotion` + `@remotion/player` + `@remotion/zod-types` (~250 KB gz) — used only on `/human` (Mascot)
- `lottie-react` (~250 KB gz) — used in Mascot
- `react-joyride` (~75 KB gz) — used only when walkthrough is active
- `@noble/curves` + `@noble/secp256k1` + `@scure/bip32` + `@scure/bip39` (~100 KB gz combined) — wallet only
- `react-markdown` + remark/rehype/unified tree (~60 KB gz) — chat (always needed, but message components not memoized — see §4.1)
- `socket.io-client` (~100 KB gz) — always-on
- `@sentry/react` (~80 KB gz) — telemetry
- `redux-logger` (~5 KB but should be devDep)

Cargo / Rust:
- `whisper-rs = "0.16"` (with `metal` on macOS) — large native dep; pinned per-platform, that's correct
- `socketioxide` server + `socket.io-client` browser — full bidi socket support, expected for the use case
- `sentry = "0.47.0"` — `default-features = false` already with curated feature set (the Cargo comment notes the actix bloat the team explicitly avoided — good hygiene)
- `matrix-sdk`, `whatsapp-rust`, `fantoccini`, `pdf-extract` all properly behind feature flags — good
- The `html2md` removal note (`Cargo.toml:36-45`) documents an exemplary perf fix (894 MB heap → linear-time stripper). Keep this culture.

No build-time embedded models found (good — `whisper-rs` bundles the runtime but not the model weights).

---

## Top 10 quick wins (high impact, low effort)

| # | Fix | File:Line | Effort | Impact |
|---|-----|-----------|--------|--------|
| 1 | Wrap WhatsApp `upsert_messages_inner` / `upsert_chats_inner` in `conn.transaction()` + `prepare_cached` | `src/openhuman/whatsapp_data/store.rs:180-230` and `:136-164` | 1 hr | 20-100× faster bulk ingest |
| 2 | Memoize `Conversations.tsx` derived state (`visibleMessages`, `latestVisibleAgentMessage`, `activeToolTimelineEntry`) in `useMemo`; replace `[...arr].reverse().find()` with `findLast()` | `app/src/pages/Conversations.tsx:1036-1047` | 30 min | Cuts per-keystroke allocs; smoother streaming UI |
| 3 | Wrap `BubbleMarkdown` and `AgentMessageBubble` in `React.memo` | `app/src/pages/conversations/components/AgentMessageBubble.tsx:40,80` | 15 min | 50× cheaper streaming render for long chats |
| 4 | Switch voice transcribe call from `*TranscribeBytes(number[])` to file-path version | `app/src/pages/Conversations.tsx:823-833` | 30 min | Cuts ~25 MB allocation per 1-min recording |
| 5 | Add `tokio::task::spawn_blocking` wrapper around `sync_vault`'s walk + read body | `src/openhuman/vault/sync.rs:78-260` | 30 min | Stops vault sync from starving tokio workers |
| 6 | Lazy-load route components in `AppRoutes.tsx` via `React.lazy` + `Suspense` | `app/src/AppRoutes.tsx:1-17` | 1 hr | 30-50% smaller initial bundle, faster cold start |
| 7 | Dynamic-import `three` inside `RotatingTetrahedronCanvas` (used only on `/welcome`) | `app/src/components/RotatingTetrahedronCanvas.tsx:3` | 30 min | Drops ~600 KB from main bundle |
| 8 | Parallelize embedding calls during seal/digest with `stream::iter(...).buffer_unordered(8)` | `src/openhuman/memory/tree/tree_global/digest.rs`, `tree_source/bucket_seal.rs`, `tree_global/seal.rs` | 2 hrs | ~8× faster batch embeds; HIGH for backfills |
| 9 | Route Linq + Telegram channels through `build_runtime_proxy_client` instead of bare `reqwest::Client::new()` | `src/openhuman/channels/providers/linq.rs:25`, `telegram/channel_core.rs:32` | 30 min | Shared connection pool + proxy support consistency |
| 10 | Move `redux-logger` to `devDependencies` and dynamic-import in dev | `app/package.json:94`, `app/src/store/index.ts:2` | 15 min | Smaller prod bundle; guarantees no shipping |

---

## What's already good (worth preserving)

- `build_runtime_proxy_client` HTTP client cache (`src/openhuman/config/schema/proxy.rs:438-451`)
- `GrepTool` correctly uses `spawn_blocking` (`src/openhuman/tools/impl/filesystem/grep.rs:118-122`)
- SSE streaming with `bytes_stream` (`src/openhuman/inference/provider/compatible.rs:911`) — not buffering full response
- `WebhookRouter::persist` offloads to `spawn_blocking` when in tokio runtime (`webhooks/router.rs:547-558`)
- `RoutingHealthChecker` caches `Ollama /api/tags` probe results with TTL (`src/openhuman/routing/health.rs:74-99`)
- Static `Lazy<Regex>` everywhere for redaction patterns (`memory/safety/mod.rs:48-141`, `memory/tree/score/extract/regex.rs`)
- `Rc<str>` for shared markdown heading in `Chunk` (`memory/chunker.rs:20`) — good memory-conscious choice
- `memory/tree/store.rs:323,1218` use `conn.unchecked_transaction()` for batch writes — proves the team knows the pattern, just hasn't applied it to whatsapp_data/vault stores
- `Cargo.toml` comments documenting the `html2md` removal and Sentry feature pruning — institutional perf memory

---

## Performance posture: **5 / 10**

- **+** Structured streaming, careful HTTP client caching, explicit spawn_blocking in some hot tools, regex statics, documented perf wins.
- **−** No connection pool, no bulk transactions in 2 of the busiest stores, no React memoization, no code-splitting, blocking I/O inside one major `async fn`, audio IPC anti-pattern that allocates ~10× the necessary memory, sequential embedding during ingest.

The fixes are well-bounded — none require architectural rework. The top-10 quick wins above are mostly mechanical and should land in two engineer-days of focused work. Once #1, #2, #3, #4, and #6 ship, the score moves to ~7-8 with no other changes.
