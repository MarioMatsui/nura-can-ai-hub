# Nura AI Hub — Development Plan

**Scope:** Option 1 — Quick Wins Package
**Budget:** $2,500 USD (~45 hours)
**Duration:** 2–3 weeks
**Branch:** `feat/perf-optimization`
**Goal:** TTFT 15s → ~1s, full response 25s → 6–8s

---

## Acceptance criteria (final delivery)

The project is considered complete when **all** of the following are measurably true in production:

- [ ] Time-to-first-token (TTFT) p95 ≤ 1.5s
- [ ] Full response time p95 ≤ 9s for typical queries (≤ 1500 output tokens)
- [ ] RAG search time p95 ≤ 2s
- [ ] Zero regressions in chat persistence (every streamed message is saved correctly to `messages` table)
- [ ] Zero regressions in attachment handling (PDF, image, text)
- [ ] No new error rate above baseline
- [ ] Baseline + final report delivered to client
- [ ] Code merged to `main` and deployed
- [ ] 2 weeks of stable production observed

---

## Phase 0 — Diagnosis & Baseline (Days 1–3, 8h)

**Goal:** establish "before" metrics. No production code changes.

### Tasks

- [x] **0.1** — Create branch `feat/perf-optimization` off `main`
- [ ] **0.2** — Set up staging environment (separate Supabase project or feature-flagged branch) — **blocked: needs client decision**
- [x] **0.3** — Add timing instrumentation to `chat-ai/index.ts`:
  - Log `t_request_start`, `t_auth_done`, `t_rag_start`, `t_rag_done`, `t_llm_start`, `t_llm_done`, `t_response_sent` (first_token deferred to Phase 1 once streaming exists)
  - Persisted to new `chat_perf_metrics` table (migration `20260505000001_*`)
- [ ] **0.4** — Run 20 representative queries against staging, capture metrics — **prepared:** [`baseline/test-questions.json`](baseline/test-questions.json), procedure in [`baseline/RUNBOOK.md`](baseline/RUNBOOK.md). Execution blocked on env access (0.2).
- [ ] **0.5** — Query `ai_usage` table for current cost baseline (last 30 days) — **prepared:** SQL ready in [`baseline/queries.sql`](baseline/queries.sql) (Q3, Q4). Execution blocked on env access.
- [x] **0.6** — Write `BASELINE_REPORT.md` (template at repo root). Numbers will be filled in after 0.4/0.5 run.
- [ ] **0.7** — Send report to client. **Hold for go-ahead before Phase 1.**


---

## Phase 1 — SSE Streaming (Days 4–10, 20h)

**Goal:** TTFT 15s → ~1s. Largest single win.

### 1A. Backend streaming (`supabase/functions/chat-ai/index.ts`)

- [x] **1.1** — Added `stream: true` to gateway request body
- [x] **1.2** — Replaced `await response.json()` with `ReadableStream` + `getReader()` SSE parser; chunks forwarded as `data: {"delta":"..."}\n\n`
- [x] **1.3** — Success path returns `text/event-stream`; pre-stream errors (429/402/500-config) stay JSON so client can branch on Content-Type
- [x] **1.4** — Full content accumulated in `fullContent` while streaming
- [x] **1.5** — Backend now INSERTs the assistant `messages` row after stream completes (architectural shift from frontend ownership)
- [x] **1.6** — Final SSE event: `data: {"done":true,"messageId":"<uuid>","usage":{...}}\n\n`
- [x] **1.7** — `ai_usage` insert moved inside the stream `start` callback, after the LLM stream completes
- [x] **1.8** — Duplicate `auth.getUser()` eliminated; reuses `authenticatedUserId` from outer scope
- [x] **1.9** — Stream errors caught, sent as `data: {"error":"..."}\n\n`, controller closed via `finally`. `cancel()` handler calls `upstream.body.cancel()` if client disconnects.

### 1B. Frontend streaming (`src/components/dashboard/ChatArea.tsx` + `Dashboard.tsx`)

- [x] **1.10** — `handleSendMessage` in `Dashboard.tsx` was the right entry point
- [x] **1.11** — Replaced `supabase.functions.invoke()` with `fetch(${SUPABASE_URL}/functions/v1/chat-ai, { signal })`. Branches on `Content-Type` (JSON for daily-limit/errors, SSE for stream)
- [x] **1.12** — Added `streamingContent: string \| null` state in `Dashboard`, passed down as prop to `ChatArea` (cleaner: messages list lives in Dashboard, so streaming display follows)
- [x] **1.13** — Each `data: {"delta":"..."}` event appends to a per-request `buffer` accumulator
- [x] **1.14** — 50ms `setTimeout`-based throttle. `cancelFlush()` clears any pending flush on `done`, `error`, or `abort` to prevent stale state writes after we move on
- [x] **1.15** — On `done`, optimistically appends `{ id: messageId, role: 'assistant', content: buffer, ... }` to `messages` using the messageId returned by the backend. Falls back to `fetchMessages()` if backend reported no messageId (insert failed server-side)
- [x] **1.16** — `AbortController` ref. New `handleStopGenerating` exposed. ChatArea swaps the Send icon for a destructive Square (stop) button while `streamingContent !== null`
- [x] **1.17** — try/catch around stream loop. AbortError swallowed (re-fetches messages to recover any partial content backend persisted). All other errors toast.

### 1C. Frontend memoization

- [x] **1.18** — `MarkdownMessage` now wrapped with `memo()`. Renamed inner to `MarkdownMessageInner`
- [x] **1.19** — `renderedMessages = useMemo(...)` in `ChatArea` — only recomputes when `messages` array reference changes
- [x] **1.20** — Keys remain `message.id` (verified)
- [ ] **1.21** — Profile with React DevTools — **manual step, deferred to staging deploy**

### 1D. Testing

- [ ] **1.22** — Manual test: send message, verify tokens appear progressively
- [ ] **1.23** — Manual test: long response (>2000 tokens) — no UI lag
- [ ] **1.24** — Manual test: rapid-fire 5 messages — no race conditions
- [ ] **1.25** — Manual test: disconnect network mid-stream — graceful error
- [ ] **1.26** — Manual test: refresh during streaming — message saved correctly
- [ ] **1.27** — Verify `messages` table has the complete final response after streaming ends
- [ ] **1.28** — Verify `ai_usage` row created with correct token counts

### Acceptance criteria for Phase 1
- [ ] First token appears in UI within 1.5s of send (p95)
- [ ] No regression in message persistence
- [ ] No regression in attachment flow
- [ ] React DevTools confirms only the streaming message re-renders during a stream

### Milestone payment trigger
**40% ($1,000) released after Phase 1 deployed to production and verified for 48h.**

---

## Phase 2 — Model & Token Tuning (Day 11, 3h)

**Goal:** 3–5× faster token throughput, ~50% cost reduction.

### Tasks

- [x] **2.1** — Default model: Flash for non-specialist, Pro for specialist
- [x] **2.2** — `max_tokens: 8000` → `2000`
- [ ] **2.3** — Per-model temperature — deferred (no relevance issues observed yet)
- [ ] **2.4** — Flash vs. Pro relevance comparison — **blocked on staging**
- [ ] **2.5** — Document model decision in BASELINE_REPORT.md after 2.4

### Acceptance criteria
- [ ] Output tokens/second measurably 3× higher than Phase 1
- [ ] Relevance subjectively comparable for non-specialist queries
- [ ] Cost per message reduced by ≥40%

---

## Phase 3 — Parallelized RAG + Index (Days 12–14, 10h)

**Goal:** RAG search 10s → 1–2s.

### 3A. Database

- [x] **3.1** — Migration created: `supabase/migrations/20260510000001_*.sql` (pg_trgm extension + GIN index on `document_chunks.content`)
- [ ] **3.2** — Apply migration to staging — **blocked**
- [ ] **3.3** — Verify query plan via `EXPLAIN ANALYZE` — **blocked**

### 3B. Backend RAG refactor (`chat-ai/index.ts:195-290`)

- [x] **3.4** — `generateSearchQueries()` cap: 15 → 5
- [x] **3.5** — Nested loops collapsed into single `Promise.all`. Tasks built up as array, then awaited at once.
- [x] **3.6** — Scoring/dedup runs in a single pass after `Promise.all` resolves
- [x] **3.7** — `specialist` / `all` knowledge type already fans out across all 3 types in the same `Promise.all`
- [x] **3.8** — Top-8 cap preserved
- [x] **3.9** — Timing log already present (Phase 0 added `t_rag_done - t_rag_start`); same field reused

### 3C. Testing

- [ ] **3.10** — Run same 20 baseline queries — measure RAG time
- [ ] **3.11** — Verify result quality (top chunks subjectively similar to before)
- [ ] **3.12** — Stress test: 10 concurrent users, no DB pool exhaustion

### Acceptance criteria
- [ ] RAG search p95 ≤ 2s
- [ ] No degradation in relevance vs. baseline
- [ ] DB connection pool stable under concurrent load

---

## Phase 4 — Final Verification & Handoff (Day 15, 4h)

### Tasks

- [ ] **4.1** — Run full benchmark suite (same 20 queries used in Phase 0)
- [ ] **4.2** — Generate `FINAL_REPORT.md` with before/after table:

  | Metric | Before | After | Change |
  |---|---|---|---|
  | TTFT p95 | __ s | __ s | __% |
  | Full response p95 | __ s | __ s | __% |
  | RAG p95 | __ s | __ s | __% |
  | Cost per message | $__ | $__ | __% |

- [ ] **4.3** — Deploy to production (merge PR, run migrations, verify)
- [ ] **4.4** — Monitor for 48h, document any issues
- [ ] **4.5** — 1-hour handoff call with client team:
  - Walk through changes
  - Show how to read the perf metrics
  - Discuss what was deferred to Option 2 (pgvector, prompt caching, etc.)
- [ ] **4.6** — Send invoice for final 30% ($750)

### Milestone payment trigger
**Final 30% ($750) released after 2 weeks of stable production.**

---

## Time budget summary

| Phase | Hours | Days | Cumulative |
|---|---|---|---|
| 0 — Diagnosis | 8h | 1–3 | 8h |
| 1 — Streaming + memoization | 20h | 4–10 | 28h |
| 2 — Model swap | 3h | 11 | 31h |
| 3 — RAG parallel + index | 10h | 12–14 | 41h |
| 4 — Verification + handoff | 4h | 15 | 45h |
| **Total** | **45h** | **3 weeks** | |

---

## Out of scope (explicitly NOT in this contract)

The following are **deferred** — not included in the $2,500 budget:

- pgvector / semantic search migration
- Prompt caching (Gemini context caching API)
- Sliding history window / summarization
- Rate limiter rewrite (Postgres / Redis)
- Attachment processing parallelization
- Observability dashboard (Grafana / similar)
- Test suite from scratch
- Any new features or UI changes
- Any work on other edge functions (`generate-prescription`, `process-document`, etc.)

If the client requests any of these, it becomes a separate Option 2 contract.

---

## Risks

| Risk | Mitigation |
|---|---|
| Lovable AI Gateway does not support streaming | Verify in Phase 0; fall back to direct Gemini API (adds 4h) |
| `pg_trgm` index build time too long on production | Build during low-traffic window; test on staging first |
| Streaming breaks message persistence | All work in staging with feature flag before prod |
| Client requests scope additions mid-project | Decline politely, log as Option 2 candidates |
| Frontend re-render throttling causes "jumpy" output | Tune throttle interval (30–80ms range) during testing |

---

## Daily progress log

> Update this section daily. Keep entries to 2–3 lines.

### Week 1
- **Day 1 (2026-05-05):** Kickoff. Branch `feat/perf-optimization` already in place. Added perf instrumentation to `chat-ai/index.ts` (request/auth/RAG/LLM/response timing, token counts, RAG chunk count). Created migration `20260505000001_*.sql` adding `chat_perf_metrics` table with admin-readable RLS. Helper `flushPerfMetrics` is fire-and-forget — does not block user response. Staging env (task 0.2) is blocked pending client confirmation.
- **Day 2 (2026-05-06):** Prepared all baseline measurement artifacts so Phase 0 can finish in one session once env access is granted. Created `baseline/` directory with: `test-questions.json` (20 representative queries, 4 per model_type), `queries.sql` (8 SQL queries covering latency p50/p95 by phase + model, cost from ai_usage, traffic pattern, error rate, knowledge base size), and `RUNBOOK.md` (step-by-step execution procedure with troubleshooting). Created `BASELINE_REPORT.md` template at root with placeholder structure ready to fill. **Blocker stands:** tasks 0.4/0.5/0.7 cannot proceed without staging or production access. Recommend client either (a) approve deploy of instrumented function to production (safe — fire-and-forget) or (b) provide staging credentials.
- **Day 3 (2026-05-07):** Phase 0 still blocked on env access for measurement. Used the day for Phase 1 prep: read `Dashboard.tsx` end-to-end, traced full chat send lifecycle (user message INSERT, `functions.invoke('chat-ai')`, assistant message INSERT), audited `MarkdownMessage.tsx` for memoization compatibility (it's a pure function of props — `React.memo` will work cleanly). Documented current architecture, target streaming architecture, and concrete integration points in [`baseline/CURRENT_FLOW.md`](baseline/CURRENT_FLOW.md). Includes ASCII sequence diagrams (today vs. Phase 1), a per-file change matrix, edge-case inventory (daily-limit signaling, attachments, abort), risks introduced by streaming, and a pre-Phase 1 checklist. **Critical finding:** with streaming, the assistant message persistence should move from frontend (current `Dashboard.tsx:431`) to backend (after stream completes) — this is an architectural shift the plan implicitly required but didn't call out. Documented in section 6 of CURRENT_FLOW.md. Day 4 should start with this doc as the design spec.
- **Day 4 (2026-05-08):** Phase 1 section 1A complete (backend streaming). All 9 tasks (1.1–1.9) implemented in [supabase/functions/chat-ai/index.ts](supabase/functions/chat-ai/index.ts). Key changes: (a) LLM call uses `stream: true` and returns SSE; (b) backend now owns assistant message persistence — INSERTs into `messages` after stream completes (was frontend's job); (c) `ai_usage` and `flushPerfMetrics` moved into the post-stream block, eliminating the duplicate `auth.getUser()`; (d) added `t_llm_first_token` to perf tracking + `duration_ttft_ms` column to metrics; (e) ReadableStream `cancel()` handler propagates client disconnect to upstream Gemini call. Pre-stream errors (429 rate-limit from gateway, 402 payment, 500 config) still return JSON so the client can branch on Content-Type. Daily-limit at line 749 untouched — still returns JSON with HTTP 200. **Frontend not yet updated** — currently the existing frontend will break because it expects `{ response: "..." }` JSON, but now gets SSE. Day 5+ will update Dashboard.tsx to consume the stream.
- **Day 5 (2026-05-09):** Phase 1 frontend (sections 1B + 1C) complete. `Dashboard.tsx` `handleSendMessage` rewritten: pulls session token, opens streaming `fetch` with AbortController, branches on `Content-Type`, parses SSE `data:` events with line-buffering, accumulates content into a buffer, throttles state updates to 50ms via setTimeout. On `done` event, optimistically appends the assistant message using the `messageId` returned by backend — no extra DB round-trip. On error/abort, refetches messages to recover any partial content the backend persisted. `ChatArea` accepts `streamingContent` + `onStopGenerating` props; renders the in-flight bubble below the persisted messages, hides `TypingIndicator` once tokens arrive, swaps Send for a destructive Square stop button while streaming. `MarkdownMessage` wrapped in `memo()`. Persisted-message list memoized via `useMemo` keyed on `messages` reference. **TypeScript typecheck passes (`tsc --noEmit -p tsconfig.app.json`, exit 0)**. Phase 1 task 1.21 (DevTools profile) deferred until we can run the app against the deployed function. Remaining Phase 1 work: testing block 1D — all 7 manual tests require staging access.

### Week 2
- **Day 6 (2026-05-10):** Phase 2 + Phase 3 backend changes complete. Phase 2: `model` switched to `gemini-2.5-flash` for non-specialist plans, `gemini-2.5-pro` retained for specialist; `max_tokens: 8000` → `2000`. Phase 3: `generateSearchQueries` capped at 5 (was 15); `searchKnowledgeBase` refactored from sequential nested loops into one `Promise.all` of all (kType, query) pairs, scoring/dedup runs in single post-await pass; new migration `20260510000001_*.sql` adds `pg_trgm` extension and GIN index on `document_chunks.content`. **Critical finding documented in BASELINE_REPORT.md §9.5:** pgvector + ivfflat are already installed and embeddings are populated — semantic search infrastructure exists but `searchKnowledgeBase` ignores it. Migrating to it would slash RAG latency to ~100ms but is out of Option 1 scope; flagged as the highest-value Option 2 candidate. Also flagged: untracked rename of `chunk_index` → `chunk_order` (drift between `migrations/` folder and live DB). Phase 1 testing block 1D and Phase 2/3 staging-dependent tasks all still blocked on env access.
- **Day 7:**
- **Day 8:**
- **Day 9:**
- **Day 10:**

### Week 3
- **Day 11:**
- **Day 12:**
- **Day 13:**
- **Day 14:**
- **Day 15:**

---

## Communication cadence

- **Weekly status email** every Friday with: completed tasks, blockers, next week's plan
- **Slack/email response time:** within 24h on weekdays
- **Demo at end of each phase** via screen share or recorded video
- **Final handoff call:** 1 hour, scheduled in Phase 4
