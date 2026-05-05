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

- [ ] **1.1** — Add `stream: true` to the Lovable AI Gateway request body (line ~968)
- [ ] **1.2** — Replace `await response.json()` (line 998) with streaming response parser:
  - Parse SSE chunks from `response.body.getReader()`
  - Forward each token chunk to client as `data: {"delta":"..."}\n\n`
- [ ] **1.3** — Switch response from `application/json` to `text/event-stream`
- [ ] **1.4** — Buffer the full response in memory while streaming
- [ ] **1.5** — After stream completes, persist final assembled message to `messages` table
- [ ] **1.6** — Send final SSE event `data: {"done":true,"usage":{...}}\n\n`
- [ ] **1.7** — Move `ai_usage` insert (line ~1024) into the post-stream block
- [ ] **1.8** — Eliminate the duplicate `auth.getUser()` call at line 1021 by reusing `userData.user` from earlier
- [ ] **1.9** — Handle stream errors: forward to client as `data: {"error":"..."}\n\n` then close

### 1B. Frontend streaming (`src/components/dashboard/ChatArea.tsx` + `Dashboard.tsx`)

- [ ] **1.10** — Locate the function that calls `chat-ai` (likely `onSendMessage` in [Dashboard.tsx](src/pages/Dashboard.tsx))
- [ ] **1.11** — Replace `supabase.functions.invoke()` with `fetch()` returning `ReadableStream`
- [ ] **1.12** — Add new state in `ChatArea`: `streamingMessage: { id, content }`
- [ ] **1.13** — On each SSE chunk, append delta to `streamingMessage.content`
- [ ] **1.14** — Throttle React updates to ~50ms intervals (use `requestAnimationFrame` or a 50ms buffer)
- [ ] **1.15** — On `done` event, transfer `streamingMessage` into `messages` and clear streaming state
- [ ] **1.16** — Add `AbortController` with a "Stop generating" button
- [ ] **1.17** — Handle network errors and reconnection gracefully

### 1C. Frontend memoization

- [ ] **1.18** — Wrap [MarkdownMessage.tsx](src/components/dashboard/MarkdownMessage.tsx) in `React.memo`
- [ ] **1.19** — Add `useMemo` for the message list rendering in [ChatArea.tsx:447-485](src/components/dashboard/ChatArea.tsx#L447)
- [ ] **1.20** — Verify keys remain stable (already using `message.id` ✓)
- [ ] **1.21** — Profile with React DevTools — confirm only the streaming message re-renders

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

- [ ] **2.1** — Change default model in `chat-ai/index.ts:806`:
  ```ts
  const model = modelType === 'specialist'
    ? 'google/gemini-2.5-pro'
    : 'google/gemini-2.5-flash';
  ```
- [ ] **2.2** — Reduce `max_tokens` from `8000` to `2000` (line 971)
- [ ] **2.3** — Add per-model temperature if relevance issues appear (defer if not needed)
- [ ] **2.4** — Run a 10-query relevance comparison Flash vs. Pro on staging
- [ ] **2.5** — Document the model decision in `BASELINE_REPORT.md` update

### Acceptance criteria
- [ ] Output tokens/second measurably 3× higher than Phase 1
- [ ] Relevance subjectively comparable for non-specialist queries
- [ ] Cost per message reduced by ≥40%

---

## Phase 3 — Parallelized RAG + Index (Days 12–14, 10h)

**Goal:** RAG search 10s → 1–2s.

### 3A. Database

- [ ] **3.1** — Create migration `supabase/migrations/<timestamp>_add_chunks_trgm_index.sql`:
  ```sql
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS idx_chunks_content_trgm
    ON document_chunks USING gin (content gin_trgm_ops);
  ```
- [ ] **3.2** — Apply migration to staging, measure index build time
- [ ] **3.3** — Verify query plan uses the index (`EXPLAIN ANALYZE` on a typical RAG query)

### 3B. Backend RAG refactor (`chat-ai/index.ts:195-290`)

- [ ] **3.4** — Reduce `generateSearchQueries()` cap from 15 → 5 (line 133)
- [ ] **3.5** — Convert nested `for` loops in `searchKnowledgeBase()` to a single `Promise.all`:
  ```ts
  const queryPromises = [];
  for (const kType of knowledgeTypes) {
    for (const query of searchQueries) {
      queryPromises.push(runQuery(kType, query));
    }
  }
  const results = await Promise.all(queryPromises);
  ```
- [ ] **3.6** — Move chunk ranking/scoring after all results return
- [ ] **3.7** — For `specialist`/`generic` (knowledge_type='all'), parallelize across all 3 types in same `Promise.all`
- [ ] **3.8** — Cap total returned chunks at 8 (already done — keep)
- [ ] **3.9** — Add timing log: `t_rag_done - t_rag_start` per request

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
- **Day 3:**
- **Day 4:**
- **Day 5:**

### Week 2
- **Day 6:**
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
