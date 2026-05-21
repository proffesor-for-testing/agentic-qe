# OpenHuman — Quality Experience (QX) Analysis

**Subject:** OpenHuman desktop AI assistant
**Repo path:** `/tmp/openhuman` (commit at time of audit: see `.git/HEAD`)
**Surface analyzed:** React 19 / TypeScript frontend under `app/src/` (382 `.tsx` files), Tauri shell, README, install scripts, gitbook docs, `.env.example`.
**Method:** static read of source, no runtime execution. Findings quote `file:line` where load-bearing.
**Stance:** opinionated. This is a product review through a QA + UX lens, not a code review.

---

## Executive Summary

OpenHuman is unusually mature for an "Early Beta" desktop AI app. The product has a coherent, opinionated point of view (privacy-first, local-by-default, mascot-led) and that point of view is *consistently expressed in code*, not just on the README. The team has clearly thought about the things most AI desktop apps fumble — error recovery, consent, multi-language users, boot stalls, mic permissions, OS indicators.

Where it falls down is **breadth of polish vs. ambition**. The product markets itself in five languages on the README but only ships translations for six (and not the same six). It funnels everything through a 2,125-line `Conversations.tsx` god-component with one Error Boundary at the root. Accessibility is patchy — strong in some surfaces (mic composer, error fallback, dialogs), weak in others (chat error banner has no `role="alert"`, language selector's accessible name is hardcoded English even when the UI is in Hindi).

The trust posture is the strongest part of the product. The `WhatLeavesLink` + `WhatLeavesMyComputerSheet` pattern, the explicit consent gate in `analytics.ts`, the honest "what leaves" copy that refuses to claim "100% local", and the Sentry `beforeSend` filter that strips PII at the boundary — these are signals of a team that takes "Private" seriously, not as a marketing word.

**Headline verdict:** the product has good bones and good intentions. The gaps are mostly fit-and-finish, not architectural. Most of them are 1-day fixes that would push the experience meaningfully forward.

**QX maturity score: 6.5 / 10** (rationale at the bottom).

---

## User Journey Snapshot

From `app/src/AppRoutes.tsx:1-143` and the Tauri shell, the in-app journey looks like this:

1. **First launch** → `BootCheckGate` (`App.tsx:107`) runs prerequisite checks → `PersistRehydrationScreen` (`components/PersistRehydrationScreen.tsx`) covers Redux rehydration with a **10-second deadline + recovery CTA** (`REHYDRATION_WARN_TIMEOUT_MS = 10_000`, line 14). Best-in-class boot UX detail.
2. **Welcome** (`/`) → `pages/Welcome.tsx`. Public route, redirects to `/home` if already authed.
3. **Onboarding** (`/onboarding/*`) → `pages/onboarding/Onboarding.tsx`. Linear stepper: `welcome → runtime-choice → (cloud → /home | custom → inference → voice → oauth → /home)`. Forcibly gated by `onboardingPending` in `App.tsx:121-138` — you cannot escape onboarding by URL-hacking.
4. **Home** (`/home`) → mascot, banners (`HomeBanners.tsx`), 3-way connectivity status (`Home.tsx:73-105`, internet vs core vs backend — *not* a conflated "offline").
5. **Chat** (`/chat`) → `pages/Accounts.tsx` (alias) — the heavy lifter is `pages/Conversations.tsx` (2,125 lines).
6. **Adjacent surfaces** → `/human` (mascot), `/intelligence` (memory tree), `/skills`, `/channels`, `/notifications`, `/rewards`, `/settings/*`, `/invites`.
7. **Walkthrough** — post-onboarding Joyride tour (`components/walkthrough/AppWalkthrough.tsx`), persisted via localStorage with try/catch around every storage call.
8. **Catastrophic crash** → `Sentry.ErrorBoundary` → `ErrorFallbackScreen.tsx`, which is exemplary: three recovery actions (Try Recover / Reload App / Download Latest), error name + message visible, component stack hidden in `<details>`. Self-contained (no Redux, no Router, no context) so a render error in any provider doesn't take the fallback with it.

The structure is sensible. The shape is "one big chat surface with sidebars + a settings flyout" — closer to Discord than to ChatGPT. There is no global keyboard shortcut surface I can see (no command palette wired into `CommandProvider` from a user-discoverable place), though `cmdk` is in dependencies, suggesting it exists somewhere.

---

## Findings by QX Dimension

### 1. Empty / Loading / Error States — **Good, but uneven**

**What works:**
- Empty states are i18n'd and have a `title + hint` pattern with a CTA seed:
  - `components/intelligence/MemoryEmptyPlaceholder.tsx:13-15` — `memory.empty` + `memory.emptyHint`, meditative no-CTA approach (deliberate per the file comment).
  - `components/notifications/NotificationCenter.tsx:201-202` — `notifications.center.empty` + `emptyHint`.
  - `components/intelligence/IntelligenceTasksTab.tsx:140-142` — same pattern.
  - `components/webhooks/WebhookActivity.tsx:38`, `components/skills/SkillResourceTree.tsx:85`, `components/webhooks/TunnelList.tsx:129`, `pages/Notifications.tsx:101` — empty states everywhere they're needed.
- Chat loading uses inline skeleton bars: `pages/Conversations.tsx:1506-1517` — alternating left/right pulse blocks that match the message layout. Good.
- Boot/rehydration: `PersistRehydrationScreen` with a 10s recovery deadline (`PersistRehydrationScreen.tsx:14, 47-50`). This is **better than most production apps**, which leave users staring at a frozen splash forever.
- Error → settings deep-link: when `sendError.code` matches a setup error, the banner offers a one-click jump to `/settings/voice` (`Conversations.tsx:1965-1980`). Errors point to the fix.

**What's missing:**
- Only **one** `Skeleton` usage across the whole app (`grep -rEn "Skeleton" app/src --include="*.tsx" | wc -l` → 1). There's no reusable `<Skeleton>` primitive in `components/ui/` (which contains only `Button`, `Card`, `Input`). Loading shimmers are inlined ad-hoc.
- Only **one ErrorBoundary**, at the app root (`App.tsx:84`). A render error inside `Conversations.tsx` (2,125 lines, complex state) crashes the entire app to the fallback screen. There are no route-level boundaries to keep the rest of the app alive.
- The chat-send error banner (`Conversations.tsx:1959-1988`) is rendered as `<p className="text-xs text-coral-500">` with **no `role="alert"`, no `aria-live`**. Screen readers will not announce it.

### 2. Accessibility (a11y) — **Above average for a beta, gaps are concentrated**

**Strong evidence:**
- 102 `aria-label`, 62 `aria-hidden`, 47 `aria-checked`, 17 `aria-modal`, 14 `aria-pressed`, 12 `aria-live`, 12 `aria-labelledby` (`grep -rEoh 'aria-[a-z]+' app/src --include="*.tsx" --include="*.ts"`).
- 18 `role="dialog"`, 14 `role="switch"`, 11 `role="status"`, 9 `role="alert"`, 4 `role="radiogroup"` + 4 `role="radio"`, 3 `role="tab"` + 2 `role="tablist"`, 2 `role="progressbar"`.
- **Zero `onClick` on `<div>`** across `app/src`. This is the single biggest a11y anti-pattern in React, and OpenHuman avoids it completely. Everything clickable is a `<button>`.
- `components/ui/Button.tsx:14-16` has `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/25 focus-visible:ring-offset-2` baked into BASE — keyboard focus is **always visible**, no exceptions.
- Chat send button is properly labeled: `Conversations.tsx:2030-2031` — `aria-label={t('chat.send')} title={t('chat.send')}`.
- Mic composer has the correct labels and toggles: `features/human/MicComposer.tsx:437,452` — `aria-label="Microphone device"` (selector) and `aria-label={isRecording ? t('mic.stopRecording') : t('mic.startRecording')}` (button).
- Sentry ErrorBoundary fallback uses a `<details>` for the stack trace (`ErrorFallbackScreen.tsx:71-80`) — keyboard-operable and progressively disclosed.

**Gaps:**
- `components/ui/Input.tsx:20-23` has an `invalid` prop that styles a red border but **does not propagate `aria-invalid`**. Screen-reader users have no signal that the field is invalid. One-line fix.
- `components/LanguageSelect.tsx:40,49` — `ariaLabel = 'Language'` default is **hardcoded English**, never localized. A Hindi user on this picker hears "Language" announced in English. Should be `t('settings.language.ariaLabel')`.
- Chat send-error banner (`Conversations.tsx:1959-1988`) has no `role="alert"` / `aria-live="polite"`. SR users miss every send failure.
- Only **5 files use `tabIndex`** — most components rely on natural tab order, which is fine, but a few custom widgets (e.g. the streaming preview bubble) may not be keyboard-reachable. Worth a focused audit.
- No skip-to-content link visible at the app root (`App.tsx:209-237`) — desktop apps get away with this more than the web, but it's still a gap.
- No evidence of a high-contrast mode beyond Tailwind dark-mode classes. Color-only signals (e.g. `text-coral-500` for errors, `text-stone-400` for hints) need a secondary cue for users with low vision. The `ErrorFallbackScreen` does pair color with an icon + heading, so the pattern exists — it's just not enforced.

### 3. Internationalization (i18n) — **Ambitious infrastructure, dishonest marketing**

This is the most important QX finding in the report.

**What's there:**
- A custom i18n system (`app/src/lib/i18n/I18nContext.tsx`) with `useT()` hook, RTL handling (`I18nContext.tsx:38`, `RTL_LOCALES = ['ar']`), `<html lang>` + `dir` mirroring (lines 71-78), defensive CJS/ESM unwrap (lines 41-55), and English fallback for missing keys.
- 12 locales declared in `app/src/lib/i18n/types.ts:1-13`: `en, zh-CN, hi, es, ar, fr, bn, pt, ru, id, it, ko`.
- **Real, populated translation catalogs** in `app/src/lib/i18n/chunks/`. Key counts (`grep -c "': '"`):
  - `en`: 1,739 keys
  - `zh-CN`: 1,848 keys
  - `ar`: 1,792 keys
  - `es`: 1,732 keys
  - `ko`: 1,687 keys
  - `fr`: 1,530 keys
  - Other locales (`bn, pt, ru, hi, id, it`): chunks exist, key counts not validated here but they exist in the build.
- `LanguageSelect.tsx:8-21` lists 12 languages with native labels (한국어, हिन्दी, العربية, বাংলা, etc.).
- `useT()` is widely adopted — seen in `WelcomeStep.tsx:10`, `ErrorFallbackScreen.tsx:29`, `RouteLoadingScreen.tsx:7`, `MicComposer.tsx:65`, `Home.tsx:54`, all settings panels, the empty-state components, etc. This is not aspirational i18n — it's wired in.

**The painful gap:**
- **The README is published in EN, ZH, JA, KO, DE** (`README.md:33`).
- **The app does not ship Japanese (`ja`) or German (`de`).** They are not in the `Locale` union type (`types.ts:1-13`), not in `LanguageSelect`'s `LOCALE_OPTIONS` (`LanguageSelect.tsx:8-21`), and there are no `ja-*.ts` or `de-*.ts` chunks under `app/src/lib/i18n/chunks/`.
- **The reverse is also true:** the app ships Arabic, Bengali, Hindi, Indonesian, Portuguese, Russian, Italian, and Spanish — none of which have README translations. A Bangla speaker who installs the app sees a localized UI but cannot read the README that brought them there.

This is a **classic marketing/product mismatch**. A German user reading `README.de.md` who installs the app gets an English UI with no German option in the picker. The trust cost of "you advertised support you don't have" is real.

**Other i18n bugs to fix:**
- `pages/Home.tsx:67` — `welcomeVariants` is hardcoded English: `` [`Welcome, ${userName} 👋`, `Let's cook, ${userName} 🧑‍🍳.`, `Time to Zone In 🧘🏻`] ``. A Korean user opening Home gets the localized nav and three English welcome variants typed character-by-character.
- `LanguageSelect.tsx:40` — default `ariaLabel = 'Language'` (English, not localized).
- No `Intl.PluralRules` / ICU MessageFormat usage detected. Pluralization is faked with `.replace('{n}', String(min))` (`pages/Notifications.tsx:21-25`). This produces "1 minutes ago" in English and breaks worse in Russian/Polish/Arabic (which have multi-form plurals). The i18n script `scripts/i18n-coverage.ts` exists but no plural infrastructure.
- RTL is wired (`I18nContext.tsx:38`) but only Arabic is marked RTL. Hebrew, Persian, Urdu would all need to be added if they're ever shipped.

### 4. Trust & Transparency — **Strongest part of the product**

OpenHuman markets itself as "Private, Simple and extremely powerful" (`README.md:20`). Most products that say this are lying. OpenHuman appears to back it up.

- `features/privacy/whatLeavesItems.ts:11-31` — the file is *labeled in code* as the "honest list" with the comment `// Copy source: repo README + handoff doc. Do not soften this list — the point is to not lie about "100% local".` That is a team that's internalized the trust posture.
- The three items: Cloud AI Inference (only when a feature needs it), Third-party integrations (only with permission), Sentry + GA (opt-out, no PII, no content). Headline: `"Local by default. Cloud when you ask."` (line 32).
- `features/privacy/WhatLeavesLink.tsx` — a *reusable* privacy disclosure trigger that the onboarding `WelcomeStep.tsx:24-26` opts into. The principle is "invisible when not needed, one click away when it is" (file comment line 11-13). This is a UX pattern more apps should copy.
- `services/analytics.ts:5-26` documents the privacy guarantees in the module docstring:
  - Sentry: no breadcrumbs / extras / contexts, no frame-locals, no source-context, anonymous user id only, `sendDefaultPii: false`.
  - GA4: explicit allowlist (`GA_ALLOWED_EVENTS`), no content/messages/credentials/PII, ad personalization off, skipped in dev.
- Consent gating: `analytics.ts:47` — `let gaEnabled = false;` (default-deny). `setAnalyticsConsent` re-syncs both Sentry and GA (lines 215-235). Toggleable from Settings → Privacy & Security.
- `SECURITY.md` is short but complete: scope, disclosure email path, safe harbor, OS-level credential storage (Keychain / Windows Credential Manager), "message content is processed on request and not retained for training or long-term storage".

The one thing missing is a per-message "this went to the cloud" indicator. The `WhatLeavesLink` tells you *that* cloud calls happen; it doesn't tell you *when this specific reply* used one. For an app whose differentiator is "local by default", showing the user which messages stayed local vs. used cloud inference would close the loop.

### 5. Onboarding & Discoverability — **Short and gated, with one big gotcha**

- The flow is short: `welcome → runtime-choice → (cloud → home | custom → inference → voice → oauth → home)` (`pages/onboarding/Onboarding.tsx:18-26`). Cloud users get one click to working.
- `OnboardingNextButton` is a single component shared across steps — consistent visual rhythm.
- `WelcomeStep.tsx:24-26` puts `WhatLeavesLink` directly under the welcome CTA. Setting the privacy frame *before* the user hands over an OAuth token is exactly the right placement.
- Hard gate: `App.tsx:121-138` forces any non-`/onboarding` route back to onboarding while incomplete. You cannot skip it by URL. Once complete, `/onboarding` redirects to `/home`. Idempotent and safe.
- Post-onboarding Joyride walkthrough (`AppWalkthrough.tsx`) for *existing-user upgrades* (`isWalkthroughPending(userIsOnboarded)`, line 21-29). Migration from non-walkthrough versions is handled. Try/catch around every localStorage call (lines 25-29, 47-51, 60-66) — robust to private-browsing / quota.
- README install path: one curl/irm command (`README.md:53-60`) or a website download. **Friction here is low** — the `.env.example` (260 lines) is a contributor concern, not a desktop-user concern. Desktop users never touch it.

**Friction points:**
- `RuntimeChoicePage` (custom route → 4 sub-pages: inference, voice, oauth, ~~search~~, ~~memory~~) shows the team has *already cut* steps from the custom flow. Two more are commented out in `Onboarding.tsx:9-11,38-39`. Cutting custom-flow steps is the right instinct.
- The "Configure later" callout exists (`components/ConfigureLaterCallout.tsx`) — good escape hatch.
- The README's "first 5 minutes" is reasonable but the comparison table (`README.md:122-133`) is a marketing artifact, not a getting-started cue. A newcomer wanting to *try the thing* has to scroll past Discord/Reddit/X/Docs links, badges, a feature dump, and a competitor comparison before seeing the install command. That's normal for OSS but it's not lean.

**Beta posture (good):** `README.md:37,47` — both a badge and a callout: `> **Early Beta**: Under active development. Expect rough edges.` Honest. Sets expectations.

### 6. Error Messaging Quality — **Structured at the source, mediocre at the surface**

The structured-error pattern (`chat/chatSendError.ts:1-25`) is excellent:
```ts
export type ChatSendErrorCode =
  | 'socket_disconnected' | 'local_model_failed' | 'cloud_send_failed'
  | 'voice_transcription' | 'stt_not_ready' | 'voice_synthesis' | 'tts_not_ready'
  | 'microphone_unavailable' | 'microphone_recording' | 'microphone_access'
  | 'voice_playback' | 'safety_timeout' | 'usage_limit_reached'
  | 'prompt_blocked' | 'prompt_review';
```
- Stable `code`s mean tests can assert error states deterministically (and analytics can aggregate them).
- The chat-send error banner (`Conversations.tsx:1961`) renders `data-chat-send-error-code={sendError.code}` — testable from outside.
- Contextual recovery: voice/STT/TTS errors render a "Setup" CTA that navigates to `/settings/voice` (`Conversations.tsx:1965-1980`).
- `ErrorFallbackScreen.tsx:35-36, 64-69` shows the actual `errorName` and `errorMessage` to the user — not a generic "Something went wrong." That's honest, and useful for users filing issues.

But:
- The banner is just `<p className="text-xs text-coral-500">`. No `role="alert"`. SR users miss the failure entirely (covered in §2).
- Some `setSendError` calls pass raw English strings instead of i18n keys: `Conversations.tsx:910` (`'Microphone recording failed.'`), `:925` (`` `Microphone access failed: ${message}` ``), `:961` (`'Failed to play voice reply.'`). A Korean user sees Korean UI, then an English error.
- The `componentStack` shown in `ErrorFallbackScreen` is dev-friendly text. For a non-engineer who hits a render crash, seeing `at AppShell at App at Provider` is noise. Hide it behind "Show technical details" with friendlier framing.

### 7. Performance Perception — **Good streaming bones, missing skeletons**

- Streaming is wired: `streamingAssistantByThread` (`Conversations.tsx:269-270`), inference lifecycle (`'started' → 'streaming'`) tracked per-thread (`:772`, `:1103`). The streaming preview bubble takes over from the 3-dot placeholder once tokens arrive (`:1721-1723`).
- Loading skeletons exist for chat history (`Conversations.tsx:1506-1517`).
- Optimistic UI for user-sent messages isn't explicitly visible in the snippets read, but `streamingAssistantByThread` + a `pendingTurn` pattern is the right shape.
- The `Sentry.ErrorBoundary` is split out into a standalone screen that *doesn't* depend on Redux, Router, or i18n provider (`ErrorFallbackScreen.tsx:8-12` comment). That means even a Provider-time crash renders correctly.

Missing:
- No global `<Skeleton>` primitive. Loading shimmers are inlined per-feature.
- The streaming preview suppresses the 3-dot placeholder once a token arrives (`Conversations.tsx:1721-1723`), but the transition from "nothing" to "first token" is the longest-perceived part of a chat turn and could use a discrete "thinking" affordance. The mascot animation may already cover this — not verified from code alone.

### 8. Documentation Experience — **Forking paths, mostly clear**

- `gitbooks/SUMMARY.md` is a proper TOC: Overview, Features (12+ subpages), Developing (10+ subpages), Legal. 48 markdown files total.
- `CONTRIBUTING.md` (320 lines) for general contributors; `CONTRIBUTING-BEGINNERS.md` (378 lines) for first-timers, with a copy-paste AI-agent prompt option (`README.md:81`). This is a thoughtful split — most projects have one wall-of-text CONTRIBUTING that scares new contributors off.
- `CLAUDE.md` (25KB) sits at the root for AI-coding-agent guidance. Whether you like that or not is a values question; from a QX perspective it signals the team is intentional about AI-assisted contribution.
- The README itself does triple duty: marketing pitch, install instructions, contributor quickstart, competitive comparison. It's long (12.6KB) and the "I want to try this" person has to skim past a lot of context to find the curl line.

**Friction:**
- `docs/` (repo-internal) vs `gitbooks/` (user-facing) are not labeled as such anywhere I can see. A new user clicking into `docs/PROMPT_INJECTION_GUARD.md` or `docs/AGENT_SELF_LEARNING.md` is getting team-internal notes, not product docs. The split is visible to readers but not signposted.
- No standalone "Quickstart" page in `gitbooks/overview/` (just `getting-started.md`). The README *is* the quickstart, and it's overloaded.

### 9. Sample Component Polish

Quick rotation of components, rated 1-5 for fit and finish:

| File | Lines | Polish | Notes |
|------|-------|--------|-------|
| `components/ErrorFallbackScreen.tsx` | 105 | 5/5 | Icon + heading + subhead + hint + collapsible stack + three action buttons. Self-contained. |
| `components/PersistRehydrationScreen.tsx` | ~120 | 5/5 | 10s timeout → recovery CTA. Defensive against stuck boots. |
| `components/walkthrough/AppWalkthrough.tsx` | ~200 | 4/5 | Try/catch around all storage; clean Joyride wiring. Wins by being defensive. |
| `components/ui/Button.tsx` | 67 | 4/5 | 4 variants × 5 sizes, focus-visible ring built in. No `loading` prop or `aria-busy` — every caller renders its own spinner (see chat send button, `Conversations.tsx:2037-2052`). |
| `components/ui/Input.tsx` | 36 | 3/5 | `invalid` prop styles but doesn't propagate `aria-invalid`. No label association helper. |
| `components/LanguageSelect.tsx` | 60 | 3/5 | Native labels + flags is great. Hardcoded English `aria-label` default and 12 languages vs. README's 5 markets is a coordination smell. |
| `features/human/MicComposer.tsx` | ~470 | 4/5 | Releases mic on unmount (`disposedRef` lines 79-95), guards re-tap during `getUserMedia`, prefers AAC-in-MP4 with documented reason. Comments explain the *why*. |
| `pages/Conversations.tsx` | 2,125 | 2/5 | God-component. Mixes thread list, composer, streaming, error UI, voice, agent-profile editing, kanban. The pieces *inside* are well-built; the file is just too large. |
| `pages/Home.tsx` | 80+ | 3/5 | Hardcoded English `welcomeVariants` (line 67) in an otherwise i18n'd page. 3-way connectivity status is the redeeming detail. |

---

## Top 10 QX Improvements, Ranked by User Impact

| # | Improvement | User Impact | Effort | Where |
|---|-------------|-------------|--------|-------|
| 1 | **Reconcile README languages with app languages.** Either ship `ja-*.ts` + `de-*.ts` chunks (and add to `Locale` type + `LanguageSelect`), or remove the JA/DE README translations and the language badges. Add README translations for the locales that exist (AR, ES, PT, BN, HI). | A user installs in their language because the README promised it. Today: trust hit on first launch. | Add chunks: ~1 week per language (LLM-translate + review). Or trim README: 1 day. | `README.md:33,42-46` + `app/src/lib/i18n/types.ts` + `LanguageSelect.tsx:8-21` |
| 2 | **Add `role="alert"` / `aria-live="polite"` to the chat send-error banner.** SR users currently get no signal when a send fails. | Every blind / low-vision user who hits a send error is left wondering why nothing happened. | 1-line. | `pages/Conversations.tsx:1959-1963` |
| 3 | **Add route-level Error Boundaries.** One Sentry boundary at the root means a render error inside `Conversations.tsx` blanks the whole app. Wrap each route in `AppRoutes.tsx` with a smaller boundary. | A crash on /chat still lets the user reach /settings or /home to recover. Today: full app reload. | Half-day. Sentry's `withErrorBoundary` HOC + a route-scoped fallback. | `app/src/AppRoutes.tsx`, new `components/RouteErrorBoundary.tsx` |
| 4 | **Localize the hardcoded `welcomeVariants` on Home.** A non-English user sees "Welcome, 김민준 👋" then "Let's cook…" typed character by character. Move to `t('home.welcomeVariant.1')`, etc. | Daily friction for every non-English user. | 1 hour. | `pages/Home.tsx:67` |
| 5 | **Decompose `Conversations.tsx`.** 2,125 lines is a maintainability and quality risk. Extract `ChatComposer`, `ChatErrorBanner`, `MessageList`, `AgentProfileEditor`, `KanbanPanel`. Each extracted piece gets its own route-level Error Boundary too. | Improves stability and lets each surface get tested independently. Indirect but large. | 2-3 days. | `pages/Conversations.tsx` |
| 6 | **Propagate `aria-invalid` from `Input`'s `invalid` prop.** Currently the prop styles a red border with no SR signal. | All form errors silently invisible to SR users. | 1-line. | `components/ui/Input.tsx:20-23` |
| 7 | **Localize chat error messages.** `Conversations.tsx:910,925,961` pass raw English strings to `setSendError`. Replace with `t()` keys. | Non-English users see EN errors interrupting an otherwise localized flow. | Half-day (find all hardcoded `setSendError(... 'string' ...)` calls). | `pages/Conversations.tsx:910,925,961` and similar |
| 8 | **Per-message "stayed local / used cloud" indicator.** OpenHuman markets "local by default, cloud when you ask" but the user has no per-turn proof. A small badge on each assistant message (🏠 local / ☁ cloud) closes the loop. | Converts trust-by-promise into trust-by-evidence. Differentiating. | 2-3 days (the routing layer already knows). | New `components/chat/InferenceProvenanceBadge.tsx` |
| 9 | **Add a real `<Skeleton>` primitive in `components/ui/` and migrate inline skeletons to it.** Currently 4 inlined skeleton bars (`Conversations.tsx:1508-1516`) and no shared component. Other surfaces (Notifications, Memory, Skills) just go from spinner → content with no transition. | Perceived performance + consistent visual rhythm. | 1 day. | New `components/ui/Skeleton.tsx` |
| 10 | **Localize `LanguageSelect`'s `ariaLabel`.** The accessible name of the language picker is hardcoded English. A Bangla SR user hears "Language combobox" announced in English while the rest of the UI is Bangla. | Small, but symbolic — it's the *language picker*, of all things. | 1-line. | `components/LanguageSelect.tsx:40,49` |

---

## Trust / Privacy Posture Assessment

**Score: 9/10 — best-in-class for the category.**

| Dimension | Evidence | Verdict |
|-----------|----------|---------|
| Honest marketing copy | `features/privacy/whatLeavesItems.ts:18` — "Core assistant features run locally by default. Cloud inference is only used when a feature explicitly needs stronger hosted models or network-backed services." Refuses the "100% local" lie. | Strong |
| Default-deny consent | `services/analytics.ts:47` — `let gaEnabled = false;`. GA + Sentry both skip until consent is set (lines 122-145, 215-235). | Strong |
| PII stripping at the boundary | `services/analytics.ts:7-13` — Sentry `beforeSend` strips breadcrumbs, extras, contexts, source-context, anonymizes user. `sendDefaultPii: false`. | Strong |
| Allowlist not denylist | `GA_ALLOWED_EVENTS` Set (`analytics.ts:64+`) — only declared events ship to GA. Anything else dropped with a warning. | Strong |
| In-product disclosure | `features/privacy/WhatLeavesLink.tsx` — reusable inline trigger, shown at onboarding welcome (`WelcomeStep.tsx:24-26`). Comment line 11-13: "Invisible when not needed, one click away when it is." | Strong |
| Toggle-able in Settings | Mentioned in `whatLeavesItems.ts:26` ("Toggle anytime in Settings → Privacy & Security"). Need to verify the toggle is actually wired and respected. | Verified via `setAnalyticsConsent` flow. |
| Per-message provenance | No per-turn local/cloud indicator visible. | **Gap** — see improvement #8. |
| Crash-report opt-out before first crash | Sentry initializes pre-consent for the **smoke-test event** only (`SENTRY_SMOKE_TEST`, gated explicitly). Real errors gated on consent. | Strong, but worth verifying the smoke-test bypass cannot leak. |
| OS-level credentials | `SECURITY.md:48-52` — macOS Keychain, Windows Credential Manager. No plain-text secrets claim. | Strong |
| Content retention | `SECURITY.md:50` — "Message content is processed on request and not retained for training or long-term storage." | Strong claim. (Out of scope to verify here.) |

The team understands trust UX. The one missing piece is **per-message provenance** — turn the abstract promise into a per-turn observable.

---

## QX Maturity Score: 6.5 / 10

**Breakdown:**

| Dimension | Score | Why |
|-----------|-------|-----|
| Boot & recovery UX | 9/10 | 10s rehydration deadline, structured `ErrorFallbackScreen`, defensive localStorage in walkthrough. Best-in-class. |
| Onboarding | 7/10 | Short, gated, escape hatch present. Privacy framing in the right place. Step count already reduced once. |
| Empty / loading / error states | 7/10 | Empty states are i18n'd and pervasive. Skeleton is inlined ad-hoc. Error UI doesn't announce to SR. |
| Accessibility | 6/10 | Zero clickable divs, real ARIA usage, focus-visible everywhere. Specific gaps: `aria-invalid`, `role="alert"` on send error, localized aria-labels. |
| Internationalization | 5/10 | Solid infrastructure, real catalogs in 6+ languages. Marketing/product mismatch (DE/JA missing, but advertised). Hardcoded EN strings in Home, error messages, aria-labels. No plural-form handling. |
| Error messaging | 7/10 | Structured error codes with contextual recovery CTAs. Some unlocalized raw strings leak through. SR-invisible. |
| Performance perception | 7/10 | Streaming wired, inline skeleton for chat history. No shared `<Skeleton>`. |
| Trust & privacy posture | 9/10 | Honest copy, default-deny, PII stripped, allowlist GA, in-product disclosure. Missing per-message provenance. |
| Documentation experience | 6/10 | Two CONTRIBUTING tiers is smart. README is overloaded. `docs/` vs `gitbooks/` boundary unsignposted to outsiders. |
| Component polish | 6/10 | UI primitives are minimal (Button, Card, Input). `Conversations.tsx` is a 2.1k-line god component. Most other components are clean. |

**Weighted overall: 6.5 / 10.** This is a *high* score for an "Early Beta" — most apps at this label sit at 3-4. OpenHuman's distinctive strengths are the trust posture and the resilient boot UX. Its distinctive weakness is the gap between i18n ambition and i18n delivery, compounded by one big component that's accreting features faster than it's being decomposed.

**Path to 8/10:** ship items 1-7 from the improvement list. None of them are architectural rewrites. The product is already most of the way there — what's left is fit-and-finish.

---

## Notes on Method

- All findings are based on static reading of source files in `/tmp/openhuman`. No runtime execution.
- File references use the project-relative path under `/tmp/openhuman/`. Line numbers reflect the snapshot read at the time of analysis.
- "Polish" ratings are subjective and based on a 5-10 file sample per surface — they signal direction, not certainty.
- The "QX maturity score" weighting is opinion. Reasonable QX reviewers could land 0.5-1.0 in either direction.
- No browser automation was used (the report is a static-only audit). The next pass should drive the actual desktop binary with Vibium or Appium and verify keyboard-only navigation, screen-reader announcement order, and the per-locale visual rendering.
