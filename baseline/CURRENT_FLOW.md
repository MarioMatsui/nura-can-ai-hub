# Current Chat Message Flow — Pre-Phase 1 Snapshot

Captured Day 3 (2026-05-07). This document maps the existing message lifecycle and identifies the exact integration points where Phase 1 (SSE streaming) will land. Read this before writing any streaming code.

---

## 1. Files involved

| File | Role |
|---|---|
| [src/pages/Dashboard.tsx](../src/pages/Dashboard.tsx) | Top-level state; owns `messages`, `conversations`, `subscriptions`. Calls `chat-ai`. Saves both user and AI messages to DB. |
| [src/components/dashboard/ChatArea.tsx](../src/components/dashboard/ChatArea.tsx) | UI. Holds input state, model selector, `isProcessing` flag. Calls `onSendMessage` callback up to Dashboard. |
| [src/components/dashboard/MarkdownMessage.tsx](../src/components/dashboard/MarkdownMessage.tsx) | Renders message content. Re-parses markdown on every render. **Phase 1.18 target.** |
| [src/components/dashboard/TypingIndicator.tsx](../src/components/dashboard/TypingIndicator.tsx) | "AI is thinking" placeholder shown while waiting. Will become unnecessary once tokens stream. |
| [supabase/functions/chat-ai/index.ts](../supabase/functions/chat-ai/index.ts) | Edge function. Auth, RAG, LLM call. Returns full response as JSON. **Phase 1.1–1.9 target.** |

---

## 2. Today's sequence (no streaming)

```
USER                FRONTEND (Dashboard.tsx)              SUPABASE             chat-ai EDGE FN          GEMINI
 │                          │                                │                       │                     │
 │── click send ──────────► │                                │                       │                     │
 │                          │                                │                       │                     │
 │                          │── INSERT messages (user) ─────►│                       │                     │
 │                          │◄────── inserted row ───────────│                       │                     │
 │                          │                                                        │                     │
 │                          │── setMessages([…, user msg]) ─►│ (state update only)                         │
 │                          │                                                        │                     │
 │                          │── functions.invoke('chat-ai') ──────────────────────► │                     │
 │                          │                                                        │── auth.getUser ────►│
 │                          │                                                        │── SELECT plans ────►│
 │                          │                                                        │── rate-limit check                       │
 │                          │                                                        │── daily-limit check                      │
 │                          │                                                        │── SELECT messages ─►│ (load history)
 │                          │                                                        │── searchKnowledge ─►│ (RAG, sequential)
 │                          │                                                        │── fetch ────────────────────────────────►│
 │                          │                                                        │                     │  (15-25 sec)        │
 │                          │   (UI shows TypingIndicator,                           │◄─── full response ──┴──── full response ──│
 │                          │    isProcessing=true)                                  │                     │                     │
 │                          │                                                        │── auth.getUser AGAIN (for usage logging)  │
 │                          │                                                        │── INSERT ai_usage                         │
 │                          │                                                        │── INSERT chat_perf_metrics (Phase 0 added)│
 │                          │◄──────────── { response: "..." } ─────────────────────│                                            │
 │                          │                                                        │                                            │
 │                          │── INSERT messages (assistant) ►│                                                                    │
 │                          │◄──── inserted row ─────────────│                                                                    │
 │                          │                                                                                                     │
 │                          │── setMessages([…, ai msg]) ───►│ (state update only)                                                │
 │                          │── isProcessing=false                                                                                 │
 │ ◄── full response shown ─│                                                                                                     │
```

**Key observations:**
- The user sees a `TypingIndicator` for 15-25 seconds, then the full response appears at once.
- `messages` table writes happen on the **frontend** (lines 373 and 431 in Dashboard.tsx).
- `chat-ai` does not touch the `messages` table. It only reads history.
- Daily-limit error returns HTTP 200 with `{ error: 'limite_diario' }` body — caller distinguishes by inspecting `aiData.error`.

---

## 3. Where each piece of data lives

| Data | Created by | Stored in | Read by |
|---|---|---|---|
| Conversation row | Dashboard.tsx `handleSendMessage` line 348 | `conversations` table | All chat list queries |
| User message row | Dashboard.tsx `handleSendMessage` line 373 | `messages` table | `fetchMessages` + chat-ai history load |
| AI response row | Dashboard.tsx `handleSendMessage` line 431 | `messages` table | `fetchMessages` + chat-ai history load |
| AI usage record | chat-ai/index.ts line ~1024 | `ai_usage` table | Cost reports, AdminFinance |
| Perf metrics | chat-ai/index.ts `flushPerfMetrics` (Phase 0) | `chat_perf_metrics` table | Baseline + ongoing observability |

**Important:** the AI response is persisted **only after** the full Gemini response returns. If the user closes the tab mid-call today, the response is lost (chat-ai has no record of it). With streaming, this gets worse unless we move persistence to the backend.

---

## 4. Edge cases the current flow handles

| Edge case | Where handled | Notes |
|---|---|---|
| Daily limit (free plan, 5 msg/day) | chat-ai returns HTTP 200 with `error: 'limite_diario'`; Dashboard checks `aiData.error` | Quirky — uses 200 status with error payload. Streaming response must preserve this somehow. |
| Rate limit (per-user, in-memory) | chat-ai returns HTTP 429 | In-memory Map is broken across edge instances (Phase 4 fix) |
| LLM error (429/402/500) | chat-ai returns HTTP 500 with error body | Frontend catches in try/catch |
| Network error | Frontend try/catch | Generic toast |
| Conversation does not exist | chat-ai returns HTTP 404 | Frontend catches |
| User does not own conversation | chat-ai returns HTTP 403 | Frontend catches |
| Auth invalid | chat-ai returns HTTP 401 | Frontend catches |
| Attachments (images/PDF/text) | chat-ai builds multimodal `messageContent` array (line 810+) | Streaming must keep this intact |

---

## 5. Phase 1 target sequence (with streaming)

```
USER                FRONTEND (Dashboard.tsx)              SUPABASE             chat-ai EDGE FN          GEMINI
 │                          │                                │                       │                     │
 │── click send ──────────► │                                │                       │                     │
 │                          │                                │                       │                     │
 │                          │── INSERT messages (user) ─────►│                       │                     │
 │                          │── setMessages([…, user msg])                           │                     │
 │                          │                                                        │                     │
 │                          │── fetch (POST) ───────────────────────────────────────►│                     │
 │                          │   { stream: true expected }                            │── auth/RAG/etc ────►│
 │                          │                                                        │── fetch stream:true ►│
 │                          │                                                        │◄── SSE chunk 1 ─────│
 │ ◄── token "Olá" ─────────│◄── data: {"delta":"Olá"} ──────────────────────────────│                     │
 │ ◄── token ", como" ──────│◄── data: {"delta":", como"} ───────────────────────────│◄── SSE chunk 2 ─────│
 │ ◄── token " posso" ──────│◄── data: {"delta":" posso"} ───────────────────────────│◄── SSE chunk 3 ─────│
 │   …                      │   (UI throttles re-renders to ~50ms)                   │   …                 │
 │                          │                                                        │── stream complete                          │
 │                          │                                                        │── INSERT messages (assistant) ─────►(NEW POSITION)
 │                          │                                                        │── INSERT ai_usage                          │
 │                          │                                                        │── INSERT chat_perf_metrics                 │
 │                          │◄── data: {"done":true,"messageId":"…","usage":{…}} ────│                                            │
 │                          │── setMessages: replace streaming msg with persisted    │                                            │
 │                          │── isProcessing=false                                                                                 │
```

**Key changes from today:**
1. Frontend uses `fetch()` directly, not `supabase.functions.invoke()` (invoke does not handle SSE).
2. Backend writes the assistant message to `messages` table — moves ownership from frontend.
3. Frontend renders tokens incrementally to a transient "streaming message" state, then swaps for the persisted row when `done` event arrives.
4. `TypingIndicator` only briefly shows before the first token (TTFT ~1s).

---

## 6. Concrete integration points for Phase 1

### Backend (chat-ai/index.ts)

| Change | Today's location | Day 4-5 work |
|---|---|---|
| Request streaming from Gemini | Line ~968 `body: { ..., max_tokens: 8000 }` | Add `stream: true` |
| Read response | Line 1032 `await response.json()` | Replace with `for await (const chunk of response.body)` parser |
| Send response to client | Line 1072 single JSON return | Switch to `text/event-stream` with `ReadableStream` controller |
| Save assistant message | **Not done today (frontend does it)** | After stream complete, INSERT into `messages` table; return `messageId` in `done` event |
| Save ai_usage / perf | Today after `await response.json()` | After stream complete, before sending `done` event |
| Daily-limit signaling | Today: HTTP 200 + `{error:'limite_diario'}` JSON | Send `data: {"error":"limite_diario","message":"..."}` SSE event before closing |
| Auth getUser duplication | Lines 626 and ~1055 | Fix by reusing `userData.user` (Phase 1.8) |

### Frontend (Dashboard.tsx + ChatArea.tsx)

| Change | Today's location | Day 6-8 work |
|---|---|---|
| Invoke chat-ai | `Dashboard.tsx:400` `supabase.functions.invoke('chat-ai', ...)` | Replace with `fetch(SUPABASE_URL + '/functions/v1/chat-ai', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({...}) })` |
| Read streaming body | N/A | `for await (const chunk of response.body.pipeThrough(new TextDecoderStream()))` + line-buffer + parse `data: {...}` |
| Streaming UI state | N/A — `messages` is the source today | Add `streamingMessage: { id?: string, content: string } \| null` |
| Save assistant message | `Dashboard.tsx:431` frontend INSERT | **Remove** — backend now owns this. On `done` event, fetch the persisted message or use the `messageId` from the event. |
| TypingIndicator | `ChatArea.tsx:488` `{isProcessing && <TypingIndicator />}` | Show only between send and first token |
| Markdown re-render cost | `ChatArea.tsx:479` `<MarkdownMessage>` per message | Wrap MarkdownMessage in `React.memo`; useMemo the message list |
| Abort streaming | N/A | Add AbortController; wire "stop generating" button |

---

## 7. Risks specifically introduced by streaming

| Risk | Mitigation |
|---|---|
| User closes tab mid-stream | Backend persists at end of stream regardless — partial responses are NOT saved |
| Network drop mid-stream | Backend completes stream and persists; frontend reconnect must re-fetch from `messages` table |
| Two simultaneous sends | AbortController; disable send button while `streamingMessage !== null` |
| Markdown rendering cost during stream | Throttle re-render to ~50ms; memoize completed messages |
| Edge function timeout (Supabase: 150s default) | Long responses (>2 min) may truncate. Acceptable risk for Phase 1; mitigated by `max_tokens: 2000` in Phase 2 |
| Daily-limit error during streaming | Send error event before any deltas; frontend short-circuits |
| Lovable Gateway not supporting `stream: true` | Discovered in Phase 0 smoke test — fallback is direct Gemini API (adds 4h to Phase 1) |

---

## 8. Pre-Phase 1 checklist

Before writing streaming code:

- [ ] Phase 0 baseline collected and signed off by client
- [ ] Confirmed Lovable AI Gateway supports `stream: true` (curl test against gateway with `stream: true` and inspect response)
- [ ] Decided who saves the assistant message (recommend: backend)
- [ ] Decided how the `done` event signals the persisted `messageId` (recommend: include in event payload)
- [ ] Staging environment is ready
- [ ] Feature flag mechanism in place (recommend: env var `STREAMING_ENABLED` on the edge function — instant rollback)

---

## 9. Notes from reading the code

- `Dashboard.tsx:373-391` — user message INSERT happens BEFORE AI call. So even if streaming fails, the user message is preserved. Good.
- `Dashboard.tsx:411-419` — daily limit check is awkward (HTTP 200 + error in body). Easy to miss. Document well in the streaming protocol.
- `ChatArea.tsx:122-124` — `scrollToBottom` runs on every `messages` change. With streaming, we need it on every chunk too — but throttled.
- `ChatArea.tsx:117` — uses `setTimeout(..., 100)` for scroll; this will lag during streaming. Switch to `requestAnimationFrame` or remove the delay.
- `chat-ai/index.ts:732-736` — full conversation history reloaded each turn. Streaming doesn't change this; window/summarization is Phase 4 (out of scope for Option 1).
- `MarkdownMessage` is a pure function of `{ content, className }` — no state, refs, or context (read 2026-05-07). `React.memo` with default shallow equality will work as-is. Minor follow-up: the `components` prop object is rebuilt on every render (inline arrow functions); moving it to a module-level constant would let ReactMarkdown skip some internal work. Optional micro-optimization for Phase 1.
