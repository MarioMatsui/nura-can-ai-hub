-- =============================================================================
-- Baseline measurement queries for chat-ai performance
-- Run these in Supabase SQL editor (or psql) AFTER the perf instrumentation
-- has been deployed and the 20 test questions have been submitted.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Q1. Overall latency p50/p95 by phase (last 7 days, successful only)
-- -----------------------------------------------------------------------------
SELECT
  COUNT(*)                                                                                      AS sample_count,
  PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY duration_total_ms)::int                          AS total_p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_total_ms)::int                          AS total_p95_ms,
  PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY duration_auth_ms)::int                           AS auth_p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_auth_ms)::int                           AS auth_p95_ms,
  PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY duration_rag_ms) FILTER (WHERE duration_rag_ms > 0)::int  AS rag_p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_rag_ms) FILTER (WHERE duration_rag_ms > 0)::int  AS rag_p95_ms,
  PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY duration_llm_ms)::int                            AS llm_p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_llm_ms)::int                            AS llm_p95_ms,
  PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY duration_response_ms)::int                       AS response_p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_response_ms)::int                       AS response_p95_ms
FROM chat_perf_metrics
WHERE status_code = 200
  AND created_at > now() - interval '7 days';

-- -----------------------------------------------------------------------------
-- Q2. Latency breakdown per model_type
-- -----------------------------------------------------------------------------
SELECT
  model_type,
  COUNT(*)                                                                                      AS requests,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_total_ms)::int                          AS total_p95_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_rag_ms) FILTER (WHERE duration_rag_ms > 0)::int  AS rag_p95_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_llm_ms)::int                            AS llm_p95_ms,
  ROUND(AVG(rag_chunk_count)::numeric, 1)                                                       AS avg_chunks,
  ROUND(AVG(tokens_input)::numeric, 0)                                                          AS avg_in,
  ROUND(AVG(tokens_output)::numeric, 0)                                                         AS avg_out
FROM chat_perf_metrics
WHERE status_code = 200
  AND created_at > now() - interval '7 days'
GROUP BY model_type
ORDER BY total_p95_ms DESC;

-- -----------------------------------------------------------------------------
-- Q3. Cost baseline from ai_usage (last 30 days)
-- -----------------------------------------------------------------------------
SELECT
  COUNT(*)                                                                                      AS total_messages,
  SUM(tokens_input)                                                                             AS sum_tokens_in,
  SUM(tokens_output)                                                                            AS sum_tokens_out,
  ROUND(AVG(tokens_input)::numeric, 0)                                                          AS avg_tokens_in,
  ROUND(AVG(tokens_output)::numeric, 0)                                                         AS avg_tokens_out,
  ROUND(SUM(cost)::numeric, 4)                                                                  AS total_cost_usd,
  ROUND(AVG(cost)::numeric, 6)                                                                  AS avg_cost_per_msg_usd,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY tokens_output)::int                              AS p95_output_tokens
FROM ai_usage
WHERE created_at > now() - interval '30 days';

-- -----------------------------------------------------------------------------
-- Q4. Cost broken down by model
-- -----------------------------------------------------------------------------
SELECT
  model,
  COUNT(*)                                            AS messages,
  ROUND(SUM(cost)::numeric, 4)                        AS total_cost_usd,
  ROUND(AVG(cost)::numeric, 6)                        AS avg_cost_per_msg_usd
FROM ai_usage
WHERE created_at > now() - interval '30 days'
GROUP BY model
ORDER BY total_cost_usd DESC;

-- -----------------------------------------------------------------------------
-- Q5. Hourly traffic pattern (helps pick a low-traffic deploy window)
-- -----------------------------------------------------------------------------
SELECT
  EXTRACT(hour FROM created_at)::int  AS hour_utc,
  COUNT(*)                            AS requests
FROM chat_perf_metrics
WHERE created_at > now() - interval '7 days'
GROUP BY hour_utc
ORDER BY hour_utc;

-- -----------------------------------------------------------------------------
-- Q6. Error rate by status_code
-- -----------------------------------------------------------------------------
SELECT
  status_code,
  COUNT(*)                                                          AS occurrences,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2)                AS pct
FROM chat_perf_metrics
WHERE created_at > now() - interval '7 days'
GROUP BY status_code
ORDER BY occurrences DESC;

-- -----------------------------------------------------------------------------
-- Q7. Knowledge base size (informs pgvector vs. trgm decision in Phase 3)
-- -----------------------------------------------------------------------------
SELECT
  COUNT(*)                                AS total_chunks,
  COUNT(DISTINCT kd.id)                   AS total_documents,
  ROUND(AVG(LENGTH(dc.content))::numeric, 0) AS avg_chunk_length,
  pg_size_pretty(pg_total_relation_size('document_chunks'::regclass)) AS table_size
FROM document_chunks dc
LEFT JOIN knowledge_documents kd ON kd.id = dc.document_id;

-- -----------------------------------------------------------------------------
-- Q8. Slowest 10 RAG searches in the sample (qualitative inspection)
-- -----------------------------------------------------------------------------
SELECT
  created_at,
  model_type,
  duration_rag_ms,
  rag_chunk_count,
  duration_llm_ms,
  tokens_input,
  tokens_output
FROM chat_perf_metrics
WHERE status_code = 200
  AND duration_rag_ms IS NOT NULL
  AND created_at > now() - interval '7 days'
ORDER BY duration_rag_ms DESC
LIMIT 10;
