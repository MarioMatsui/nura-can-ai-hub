# Baseline Measurement Runbook

End-to-end procedure for collecting Phase 0 baseline metrics. **Total time: ~45 minutes** of human work + waiting.

---

## Prerequisites

- Supabase project access (admin or service role)
- `supabase` CLI installed and logged in
- Repository checked out on branch `feat/perf-optimization`
- Decision made: **deploy to staging or to production?**
  - **Staging recommended.** The instrumentation is fire-and-forget and safe, but adding a new table to production should be a deliberate choice.
  - If no staging exists yet, the cleanest option is creating a separate Supabase project and importing the schema. ~30 min one-time setup.

---

## Step 1 — Apply the migration

```powershell
# From repo root, with supabase CLI linked to the target project
supabase db push
```

Verify the table exists:
```sql
SELECT count(*) FROM chat_perf_metrics;  -- should return 0
```

---

## Step 2 — Deploy the instrumented function

```powershell
supabase functions deploy chat-ai
```

Verify the deploy via Supabase Studio → Edge Functions → chat-ai → check the latest deployment timestamp.

---

## Step 3 — Smoke test

Send **one** test message via the chat UI in the deployed environment, then run:

```sql
SELECT *
FROM chat_perf_metrics
ORDER BY created_at DESC
LIMIT 1;
```

You should see:
- A row with `status_code = 200`
- All four `duration_*_ms` columns populated
- `tokens_input` and `tokens_output` non-zero
- `rag_chunk_count > 0` (if the model_type triggers RAG)

If any of these are NULL or 0, **stop and debug** before proceeding.

---

## Step 4 — Submit the 20 baseline queries

Two options:

### Option A — Manual (45 min, lower risk)
Open the chat UI, switch through each model_type, send each question from `baseline/test-questions.json`. Wait for full response between each. Repeat the full set 3 times.

### Option B — Scripted (30 min setup + 10 min run)
Write a Node script that:
1. Authenticates as a test user with all subscriptions active
2. POSTs each question to the chat endpoint
3. Awaits full response, then 2-second cool-down between requests
4. Repeats 3 times

The script does not exist in this repo yet — only build it if you'll re-run baselines often.

**Either way, end goal:** ~60 rows in `chat_perf_metrics` covering all 5 model_types.

---

## Step 5 — Run baseline queries

Open Supabase Studio → SQL Editor. Paste each query from [`baseline/queries.sql`](queries.sql) one at a time. Save the results.

Alternative (CLI):
```powershell
supabase db remote query --file baseline/queries.sql
```

---

## Step 6 — Fill in BASELINE_REPORT.md

Open [`BASELINE_REPORT.md`](../BASELINE_REPORT.md) at repo root and replace every `___` placeholder with the actual numbers from Step 5.

Commit the filled-in report:
```powershell
git add BASELINE_REPORT.md
git -c user.email="..." -c user.name="ZenithCraft" commit -m "Add Phase 0 baseline report"
```

---

## Step 7 — Send to client

Email or Slack the filled-in report. Wait for explicit go-ahead before starting Phase 1.

---

## Cleanup (optional)

The instrumentation stays in place — it's needed for Phase 4 verification too. The `chat_perf_metrics` table grows continuously; if storage becomes a concern after the project ends, add a retention policy:

```sql
-- Example: keep 90 days of metrics
DELETE FROM chat_perf_metrics WHERE created_at < now() - interval '90 days';
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `chat_perf_metrics` exists but stays empty after smoke test | Edge function not redeployed after migration | `supabase functions deploy chat-ai` |
| `duration_rag_ms` is NULL for all rows | RAG was skipped (knowledge_type is null for the model) | Confirm `getKnowledgeType()` returns non-null |
| `tokens_input/output` always 0 | Lovable Gateway not returning usage in response | Check raw response shape; may need to estimate |
| `perf insert error: permission denied` in logs | Service role key not configured in edge function env | Set `SUPABASE_SERVICE_ROLE_KEY` env var |
| All durations look very small (<50ms) but UI is slow | Function deployed but UI is hitting cached old version | Hard reload UI; check function URL |
