# Baseline Performance Report — chat-ai

**Project:** Nura AI Hub
**Phase:** 0 (Diagnosis)
**Branch:** `feat/perf-optimization`
**Author:** ZenithCraft
**Date measured:** ___ (YYYY-MM-DD)
**Environment:** ___ (staging / production)

> **Status:** TEMPLATE — fill in the `___` placeholders with results from running [`baseline/queries.sql`](baseline/queries.sql). Procedure is documented in [`baseline/RUNBOOK.md`](baseline/RUNBOOK.md).

---

## 1. Methodology

- **Instrumentation:** `chat_perf_metrics` table populated by the `chat-ai` edge function on every request. See `flushPerfMetrics()` in `supabase/functions/chat-ai/index.ts`.
- **Test workload:** 20 representative queries from [`baseline/test-questions.json`](baseline/test-questions.json), 4 per model_type (generic, medical, legal, veterinary, specialist), submitted 3 times each.
- **Sample window:** ___ days
- **Sample size:** ___ requests
- **Test user plan:** specialist (full access)
- **Cost reference window:** last 30 days from `ai_usage` table (production data)

---

## 2. End-to-end latency (Q1)

| Phase | p50 | p95 | Notes |
|---|---|---|---|
| **Total request** | ___ ms | ___ ms | What the user feels |
| Auth + setup | ___ ms | ___ ms | Should be <100ms |
| RAG search | ___ ms | ___ ms | Biggest target for Phase 3 |
| LLM call | ___ ms | ___ ms | Targeted by Phase 1 (streaming) + Phase 2 (model swap) |
| Response shipping | ___ ms | ___ ms | Should be near zero |

**Sample count:** ___ rows (status_code = 200, last 7 days)

---

## 3. Latency by model type (Q2)

| model_type | requests | total p95 | rag p95 | llm p95 | avg chunks | avg in/out tokens |
|---|---|---|---|---|---|---|
| generic | ___ | ___ ms | ___ ms | ___ ms | ___ | ___ / ___ |
| medical | ___ | ___ ms | ___ ms | ___ ms | ___ | ___ / ___ |
| legal | ___ | ___ ms | ___ ms | ___ ms | ___ | ___ / ___ |
| veterinary | ___ | ___ ms | ___ ms | ___ ms | ___ | ___ / ___ |
| specialist | ___ | ___ ms | ___ ms | ___ ms | ___ | ___ / ___ |

**Observation:** _(fill in: which model_type is slowest? Specialist is expected to be slowest because it queries all 3 knowledge types. Confirm or refute.)_

---

## 4. Cost baseline (Q3, Q4)

### Aggregate (last 30 days)

| Metric | Value |
|---|---|
| Total messages | ___ |
| Total tokens in / out | ___ / ___ |
| Avg tokens in / out per message | ___ / ___ |
| **Total cost (USD)** | $___ |
| **Avg cost per message** | $___ |
| p95 output tokens | ___ |

### By model

| model | messages | total cost | avg cost / msg |
|---|---|---|---|
| ___ | ___ | $___ | $___ |
| ___ | ___ | $___ | $___ |

**Observation:** _(fill in: any single model dominating cost? Likely gemini-2.5-pro since it's the only one in use.)_

---

## 5. Traffic pattern (Q5)

Hourly request distribution (UTC) over the last 7 days:

```
hour  requests
00    ___
01    ___
...
```

**Lowest-traffic window:** ___ (use this for production deploys)

---

## 6. Error rate (Q6)

| status_code | occurrences | percentage |
|---|---|---|
| 200 | ___ | ___% |
| 429 (rate limit) | ___ | ___% |
| 500 (error) | ___ | ___% |

**Baseline error rate:** ___% (must not exceed this after optimization)

---

## 7. Knowledge base size (Q7)

| Metric | Value |
|---|---|
| Total chunks | ___ |
| Total documents | ___ |
| Avg chunk length (chars) | ___ |
| Table size on disk | ___ |

**Implication for Phase 3:**
- If chunks < 5,000: `pg_trgm` index alone is sufficient
- If chunks 5,000–50,000: `pg_trgm` first; revisit pgvector after Phase 3 measurement
- If chunks > 50,000: pgvector strongly recommended

**Recommendation based on actual size:** _(fill in)_

---

## 8. Top 3 bottlenecks (annotated)

Based on the data above, ranked by impact on user-perceived latency.

### #1 — _(fill in: likely "no streaming")_
- **Evidence:** _(fill in: e.g., LLM p95 = 14,200ms but no first-token metric)_
- **Code:** [`chat-ai/index.ts:998`](../supabase/functions/chat-ai/index.ts#L998) — `const data = await response.json();` blocks until full response
- **Phase 1 will fix this.**

### #2 — _(fill in: likely "sequential RAG")_
- **Evidence:** _(fill in: e.g., RAG p95 = 8,500ms with 45 sequential queries)_
- **Code:** [`chat-ai/index.ts:200-290`](../supabase/functions/chat-ai/index.ts#L200) — nested `for` loops with `await` inside
- **Phase 3 will fix this.**

### #3 — _(fill in: likely "Gemini 2.5 Pro" or "no prompt caching" depending on numbers)_
- **Evidence:** _(fill in)_
- **Code:** [`chat-ai/index.ts:806`](../supabase/functions/chat-ai/index.ts#L806)
- **Phase 2 will fix this.**

---

## 9. Slowest 10 RAG queries (Q8)

Qualitative inspection — paste raw output of Q8 here:

```
created_at | model_type | rag_ms | chunks | llm_ms | tok_in | tok_out
___        | ___        | ___    | ___    | ___    | ___    | ___
```

**Pattern observed:** _(fill in — e.g., specialist queries with broad terms cluster at the top)_

---

## 9.5. Significant finding — pgvector is already installed (added Day 6)

While auditing for the trgm index migration, I discovered that the database already has **pgvector + ivfflat installed** and the `document_chunks.embedding` column is populated with `vector(1536)` (OpenAI-format embeddings). A working `search_similar_chunks(query_embedding, knowledge_type, match_count)` Postgres function also exists.

**The current `searchKnowledgeBase()` in `chat-ai/index.ts` ignores all of this** and uses ILIKE-based text matching instead.

**Implication:** the "definitive RAG fix" (semantic search via pgvector) is much cheaper than the original Option 2 estimate suggested — most of the setup work (extension install, embedding column, backfill, ivfflat index) is already done. The remaining work is:

1. Generate query embeddings at request time (one Gemini/OpenAI call, ~100-200ms)
2. Replace `searchKnowledgeBase()` with a single call to `search_similar_chunks()`
3. Verify embeddings are still populated for all current chunks
4. Drop the ILIKE-based `extractKeyTerms` / `expandTermWithAliases` machinery

Estimated effort: **~1 day instead of 3-5 days**. This is a strong candidate to add to a follow-up Option 2 contract.

Also discovered: the `document_chunks.chunk_index` column was renamed to `chunk_order` at some point but no migration in the repo records the change. There is drift between `migrations/` and the live DB. Not a blocker for Option 1 work but worth flagging for any future schema work.

---

## 10. Conclusions & recommendation

_(Fill in 2–3 sentences after data is collected. Example template:)_

> The data confirms the proposal's hypothesis. The chat-ai function spends ~__% of its time waiting on the LLM (no streaming) and ~__% on sequential RAG queries. Combined, these two account for >__% of perceived latency. The Option 1 plan as scoped should reduce p95 total response time from ___ms to ~___ms, a __% improvement. Recommend proceeding with Phase 1.

---

## Sign-off

- [ ] Report reviewed by client
- [ ] Go-ahead given for Phase 1
- [ ] Date approved: ___
