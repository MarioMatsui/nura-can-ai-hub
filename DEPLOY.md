# Deploy Runbook — Option 1 (Performance Optimization)

End-to-end procedure for shipping the `feat/perf-optimization` branch. Reads this before touching production.

**Branch to deploy:** `feat/perf-optimization`
**Base:** `main` (commit `6f93877`)
**7 commits, 4 files of code change + 2 migrations + supporting docs**

---

## What changes when this ships

### Database
- New table: `chat_perf_metrics` (per-request latency tracking)
- New extension: `pg_trgm` (text-similarity index support)
- New index: `idx_chunks_content_trgm` GIN on `document_chunks.content`

### Backend (`supabase/functions/chat-ai`)
- Returns `text/event-stream` on success (streaming) instead of single JSON response
- LLM model: `gemini-2.5-flash` for non-specialist plans; `gemini-2.5-pro` retained for specialist
- `max_tokens`: 8000 → 2000
- RAG search runs in parallel (`Promise.all` of all term/type combinations)
- Backend now persists assistant message (was frontend's responsibility)
- Per-request perf metrics persisted to `chat_perf_metrics`

### Frontend (`src/pages/Dashboard.tsx`, `src/components/dashboard/ChatArea.tsx`, `src/components/dashboard/MarkdownMessage.tsx`)
- `handleSendMessage` uses `fetch` with SSE parsing instead of `supabase.functions.invoke()`
- Streaming bubble renders below messages list while in flight
- "Stop generating" button replaces Send while streaming
- `MarkdownMessage` memoized; persisted message list memoized

---

## Required env vars

The edge function reads these from the Supabase project settings — verify they are set:

| Variable | Used for | Notes |
|---|---|---|
| `LOVABLE_API_KEY` | LLM gateway auth | Existing, unchanged |
| `SUPABASE_URL` | self-reference for service-role client | Existing, unchanged |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypass RLS for message + perf inserts | Existing, unchanged |

The frontend reads:

| Variable | Used for |
|---|---|
| `VITE_SUPABASE_URL` | Constructs the `fetch` URL for the edge function |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Existing; used by the supabase-js client |

Both `VITE_*` variables are already present in `.env`. **Verify before building.**

---

## Step-by-step

### Step 0 — Decide: staging or production?

| | Staging (recommended) | Production |
|---|---|---|
| Risk | Low — separate project, no user impact | Medium — schema change is additive, function change is significant |
| Setup time | ~30 min one-time | None |
| Validation quality | Synthetic queries only (the 20 in `baseline/test-questions.json`) | Real-world traffic |
| Rollback | Drop the project | `git revert`, `supabase functions deploy chat-ai`, drop the index/table |

If unsure, **stage first**. Spin up a free-tier Supabase project, link with `supabase link --project-ref <ref>`, push migrations, deploy function, run baseline.

### Step 1 — Apply migrations

```powershell
# From repo root, with supabase CLI linked to the target project
supabase db push
```

Two migrations will be applied in order:
1. `20260505000001_*.sql` — creates `chat_perf_metrics` table + RLS
2. `20260510000001_*.sql` — installs `pg_trgm`, adds GIN index on `document_chunks.content`

The `pg_trgm` index build time depends on row count. For up to ~50k chunks, expect <30 seconds. If `document_chunks` is larger, build during low-traffic window — see [`baseline/queries.sql`](baseline/queries.sql) Q5 for traffic patterns.

Verify:
```sql
SELECT count(*) FROM chat_perf_metrics;            -- expect 0
SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';   -- expect 1 row
SELECT indexname FROM pg_indexes WHERE indexname = 'idx_chunks_content_trgm';  -- expect 1 row
```

### Step 2 — Deploy the edge function

```powershell
supabase functions deploy chat-ai
```

Confirm in Supabase Studio → Edge Functions → chat-ai → latest deployment timestamp matches now.

### Step 3 — Smoke test the backend

Curl the function with a real session token. Get the token by signing into the app and copying from network tab or:

```powershell
$TOKEN = "<paste session.access_token>"
$BASE = "https://<project-ref>.supabase.co/functions/v1/chat-ai"
$BODY = '{"conversationId":"<existing-conversation-uuid>","message":"O que é CBD?","modelType":"generic","attachments":[]}'

# Use curl to actually see the SSE stream
curl -N -X POST "$BASE" `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -d $BODY
```

Expected output (truncated): a stream of `data: {"delta":"..."}` lines, ending with `data: {"done":true,"messageId":"<uuid>","usage":{...}}`. Total time-to-first-`data:` should be ~1s.

If you get an HTTP error or `Content-Type: application/json` instead of `text/event-stream`, the function is misconfigured — check Supabase function logs.

Then verify the perf row landed:
```sql
SELECT model_type, duration_ttft_ms, duration_total_ms, duration_rag_ms,
       tokens_input, tokens_output, status_code
FROM chat_perf_metrics
ORDER BY created_at DESC
LIMIT 1;
```

A successful row should have:
- `duration_ttft_ms` populated and small (~500-1500ms)
- `duration_rag_ms` smaller than baseline (parallelization should land it under 2s p95)
- `tokens_input` non-zero, `tokens_output` non-zero
- `status_code = 200`, `error = null`

### Step 4 — Build and deploy the frontend

```powershell
npm install
npm run build
```

Bundle output is in `dist/`. Deploy via your existing pipeline (Lovable, Vercel, Netlify, or wherever the frontend is hosted).

If the frontend has a CDN, **invalidate cache** after deploy. Old JS will call `supabase.functions.invoke()` and break against the new SSE backend.

### Step 5 — Smoke test the full stack

In a logged-in browser:
1. Open the chat app
2. Open DevTools → Network tab
3. Send a message
4. Verify:
   - Network request to `/functions/v1/chat-ai` shows `text/event-stream` Content-Type
   - The request stays open and shows growing transferred bytes
   - Tokens appear in the chat UI within ~1 second
   - "Stop" button appears while streaming
   - When response completes, the bubble persists (refresh the page — it should still be there)

Run all 20 queries from `baseline/test-questions.json` (or a subset). For each, log: TTFT (eyeball), full response time, any visual glitches.

### Step 6 — Run baseline + capture metrics

After ~24h of traffic (or after running synthetic baseline):

```sql
-- Phase 0 baseline queries from baseline/queries.sql
\i baseline/queries.sql
```

Or paste each query into Supabase Studio. Fill in [`BASELINE_REPORT.md`](BASELINE_REPORT.md) placeholders with results.

Compare against the original audit's hypotheses:
- TTFT should be ~1s (was 15-25s)
- Full response should be 6-8s (was 25s)
- RAG p95 should be ~1-2s (was 10s)
- Output token cost should drop ~50% (Flash + max_tokens reduction)

### Step 7 — Monitor for 48h

Watch:
- `chat_perf_metrics` for status_code distribution (anything not 200 deserves a look)
- Supabase function logs for `console.error` messages
- User complaints (none expected, but listen)

If error rate exceeds baseline by >2x, **rollback** (Step 9).

### Step 8 — Sign off

Once 48h stable + metrics confirm improvement:
1. Merge `feat/perf-optimization` to `main`
2. Final report sent to client (numbers filled in)
3. Final 30% invoice issued

---

## Rollback procedure

If anything breaks badly:

### Edge function rollback
```powershell
git checkout main
supabase functions deploy chat-ai
```
Backend reverts to the JSON-response, sequential-RAG, Pro-model version. Frontend will work because the new frontend's `Content-Type` branch handles JSON responses too.

### Frontend rollback
Revert your frontend hosting to the previous deploy (use the host's UI for instant rollback).

### Migration rollback (only if necessary)
The new table and index are safe to keep — they don't affect anything if unused. **Recommended: leave them in place** for future use even if rolling back code.

If you must remove:
```sql
DROP INDEX IF EXISTS idx_chunks_content_trgm;
-- Optional: DROP EXTENSION pg_trgm CASCADE;  -- only if nothing else uses it
DROP TABLE IF EXISTS chat_perf_metrics;
```

---

## Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| Frontend shows "no response" indefinitely | Frontend cached old JS, calls deprecated `functions.invoke('chat-ai')` | Invalidate CDN / hard reload (Ctrl+F5) |
| Stream cuts off mid-response | Edge function timeout (Supabase: 150s default) | Should not happen with `max_tokens: 2000`; check function logs for errors. May need to raise timeout in Supabase dashboard. |
| `chat_perf_metrics` stays empty after deploy | Service role env var missing or function not actually redeployed | Re-deploy: `supabase functions deploy chat-ai`. Verify env vars in Supabase dashboard. |
| `pg_trgm` index not used in query plan | Postgres planner choosing seq scan because table is small | Run `ANALYZE document_chunks;` to refresh stats. |
| Specialist plan responses are noticeably slower than others | Expected — specialist still uses Gemini Pro | Compare `duration_llm_ms` in `chat_perf_metrics` grouped by `model_type` to confirm |
| Duplicate assistant messages in chat | Old frontend still deployed somewhere AND new backend is running | Both old frontend (which inserts assistant msg) and new backend (which also inserts) are persisting. Force-deploy the new frontend everywhere; clean up duplicates manually. |
| Daily-limit message stops appearing | Frontend's Content-Type branch is broken — daily-limit is JSON, not SSE | Check `Dashboard.tsx` `if (contentType.includes('application/json'))` branch is intact |

---

## Post-deploy checklist

- [ ] Migrations applied
- [ ] `chat_perf_metrics` table queryable
- [ ] `pg_trgm` extension installed, GIN index present
- [ ] Edge function deployed and shows new code in Studio
- [ ] curl smoke test returns SSE stream
- [ ] Frontend deployed
- [ ] Browser test: token streaming visible
- [ ] Browser test: stop button works
- [ ] Browser test: refresh after stream → message persists
- [ ] Browser test: attachment (PDF) still flows correctly
- [ ] `chat_perf_metrics` populated with at least 5 successful rows
- [ ] No spike in error rate vs. baseline
- [ ] Baseline numbers filled into `BASELINE_REPORT.md`

---

## Out of scope reminders

The following are **not** part of this deploy. They are Option 2 candidates:
- pgvector-based semantic search (infrastructure already exists per `BASELINE_REPORT.md` §9.5)
- Prompt caching (direct Gemini API or gateway-level)
- Sliding-window history / summarization
- Postgres-backed rate limiter (current in-memory Map is broken across instances)
- Attachment processing parallelization

If client wants any of these, scope a new contract.
