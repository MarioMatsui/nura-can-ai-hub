# Nura AI Hub — System Architecture

Visual reference for the full system after Option 1 optimization work. Renders in VS Code (with Markdown Preview), GitHub, GitLab, and most modern markdown viewers.

---

## 1. High-level system architecture

```mermaid
flowchart TB
    subgraph Browser["User's Browser"]
        UI["React App<br/>(Vite + TypeScript + shadcn/ui)"]
    end

    subgraph Hosting["Hosting Layer"]
        CDN["Static Hosting<br/>(Lovable / Vercel / Netlify)"]
    end

    subgraph Supabase["Supabase Project (dikgmythsvmdbdpjdjmc)"]
        Auth["Supabase Auth<br/>(JWT, sessions)"]
        Storage["Supabase Storage<br/>(chat-attachments,<br/>document-images,<br/>prescription-files)"]
        DB[("Postgres<br/>(pgvector, pg_trgm)")]
        EdgeFn["Edge Functions<br/>(Deno)"]
    end

    subgraph EdgeFunctions["18 Edge Functions"]
        ChatAI["chat-ai<br/>(streaming SSE)"]
        Prescription["generate-prescription"]
        Document["process-document<br/>process-catalog-pdf"]
        Stripe["create-checkout-session<br/>create-portal-session<br/>stripe-webhook<br/>+ 8 others"]
    end

    subgraph External["External Services"]
        Lovable["Lovable AI Gateway<br/>https://ai.gateway.lovable.dev"]
        Gemini["Google Gemini<br/>(Flash + Pro)"]
        StripeAPI["Stripe<br/>(live mode)"]
    end

    UI -->|HTTPS| CDN
    UI -->|Auth API| Auth
    UI -->|REST + RLS<br/>publishable key| DB
    UI -->|Upload<br/>file/image| Storage
    UI -->|fetch SSE<br/>w/ JWT| ChatAI
    UI -->|invoke| Prescription
    UI -->|redirect| StripeAPI

    Auth --> DB
    EdgeFn --> DB
    EdgeFn --> Storage
    ChatAI -->|stream: true| Lovable
    Lovable --> Gemini
    Stripe --> StripeAPI
    StripeAPI -->|webhooks| Stripe

    classDef new fill:#fff4d6,stroke:#d97706,stroke-width:2px
    class ChatAI new
```

The yellow-highlighted **chat-ai** is what Option 1 modified.

---

## 2. Chat request flow (after Option 1)

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Frontend<br/>(Dashboard.tsx)
    participant DB as Supabase Postgres
    participant EF as chat-ai<br/>(edge function)
    participant LLM as Lovable AI Gateway<br/>→ Gemini

    U->>FE: Click send
    FE->>DB: INSERT messages (user)
    DB-->>FE: row id
    FE-->>FE: setMessages(prev, userMsg)

    Note over FE,EF: Streaming begins
    FE->>EF: POST /functions/v1/chat-ai<br/>(fetch + AbortController)

    EF->>DB: auth.getUser(token)
    EF->>DB: SELECT user_plans (rate limit / daily limit)
    EF->>DB: SELECT messages (history)

    par RAG search (parallel)
        EF->>DB: ILIKE %term1% AND ...<br/>(5 queries × N kTypes,<br/>via Promise.all)
    end
    DB-->>EF: top-8 chunks scored

    EF->>LLM: POST chat/completions<br/>{ stream: true }

    loop For each token chunk
        LLM-->>EF: data: {delta: "..."}
        EF-->>FE: data: {delta: "..."}
        FE-->>FE: throttle 50ms,<br/>append to streamingContent
        FE-->>U: Render incrementally
    end

    EF->>DB: INSERT messages (assistant)
    DB-->>EF: messageId
    EF->>DB: INSERT ai_usage
    EF->>DB: INSERT chat_perf_metrics
    EF-->>FE: data: {done, messageId, usage}

    FE-->>FE: setMessages(prev, assistantMsg)<br/>setStreamingContent(null)
    FE-->>U: Final bubble persisted
```

**Key changes vs. before Option 1:**
- Steps 9-13 used to be one blocking request: full response arrived after 15-25s
- Now: first token in step 11 arrives in ~1s
- Step 16 used to happen on the frontend (Dashboard.tsx); moved to backend so responses survive client disconnects

---

## 3. Database schema (key tables for chat flow)

```mermaid
erDiagram
    auth_users ||--o{ profiles : "1:1"
    auth_users ||--o{ user_plans : "1:N (multiple subs)"
    auth_users ||--o{ user_roles : "1:N"
    auth_users ||--o{ conversations : "owns"
    conversations ||--o{ messages : "contains"
    conversations ||--o{ chat_perf_metrics : "tracks"
    conversations ||--o{ ai_usage : "tracks"
    knowledge_documents ||--o{ document_chunks : "split into"

    auth_users {
        uuid id PK
        text email
    }

    profiles {
        uuid id PK_FK
        text full_name
        bool profile_completed
        int receituario_usage_count
    }

    user_plans {
        uuid id PK
        uuid user_id FK
        text plan_type
        text status
        timestamptz current_period_end
        bool cancel_at_period_end
        text stripe_customer_id
    }

    conversations {
        uuid id PK
        uuid user_id FK
        text title
        text model_type
        timestamptz created_at
    }

    messages {
        uuid id PK
        uuid conversation_id FK
        text role
        text content
        jsonb attachments
        timestamptz created_at
    }

    knowledge_documents {
        uuid id PK
        text title
        text knowledge_type "medical/legal/veterinary"
    }

    document_chunks {
        uuid id PK
        uuid document_id FK
        int chunk_order
        text content
        vector embedding "pgvector(1536) - unused"
    }

    ai_usage {
        uuid id PK
        uuid user_id FK
        uuid conversation_id FK
        text model
        int tokens_input
        int tokens_output
        numeric cost
    }

    chat_perf_metrics {
        uuid id PK
        uuid conversation_id FK
        uuid user_id FK
        int duration_total_ms
        int duration_rag_ms
        int duration_llm_ms
        int duration_ttft_ms
        int rag_chunk_count
        int tokens_input
        int tokens_output
    }
```

**`chat_perf_metrics`** is new in Option 1.
**`document_chunks.embedding`** column has populated pgvector embeddings but is currently unused (see Option 2 candidates).

---

## 4. Project structure

```mermaid
graph LR
    Root["nura-can-ai-hub/"] --> Src["src/"]
    Root --> Supabase["supabase/"]
    Root --> Public["public/"]
    Root --> Docs["docs<br/>(*.md at root)"]
    Root --> Baseline["baseline/"]

    Src --> Pages["pages/<br/>(Dashboard, Admin,<br/>Blog, Auth, etc.)"]
    Src --> Components["components/"]
    Src --> Hooks["hooks/"]
    Src --> Integrations["integrations/<br/>(supabase client,<br/>lovable)"]
    Src --> Lib["lib/<br/>(utils, sfx,<br/>prescriptionExtract)"]

    Components --> CompUI["ui/<br/>(48 shadcn primitives)"]
    Components --> CompDash["dashboard/<br/>(ChatArea, Markdown,<br/>SearchModal, etc.)"]
    Components --> CompAdmin["admin/<br/>(UserMgmt, BlogEditor,<br/>PlanMgmt, etc.)"]
    Components --> CompLanding["(landing-page<br/>sections)"]

    Supabase --> SbFunctions["functions/<br/>(18 edge functions)"]
    Supabase --> SbMigrations["migrations/<br/>(57 SQL files)"]

    SbFunctions --> ChatAI["chat-ai/<br/>← Option 1 changes"]
    SbFunctions --> OtherFns["...17 others"]

    Docs --> DevPlan["DEVELOPMENT_PLAN.md"]
    Docs --> Deploy["DEPLOY.md"]
    Docs --> Baseline2["BASELINE_REPORT.md"]
    Docs --> Final["FINAL_REPORT.md"]
    Docs --> Arch["ARCHITECTURE.md<br/>(this file)"]

    Baseline --> CodeReview["CODE_REVIEW.md"]
    Baseline --> CurrentFlow["CURRENT_FLOW.md"]
    Baseline --> Runbook["RUNBOOK.md"]
    Baseline --> Queries["queries.sql"]
    Baseline --> Questions["test-questions.json"]

    classDef option1 fill:#fff4d6,stroke:#d97706,stroke-width:2px
    class ChatAI option1
```

---

## 5. Option 1 work — phase status

```mermaid
flowchart LR
    P0["Phase 0<br/>Diagnosis &amp; Baseline"]
    P1A["Phase 1A<br/>Backend Streaming"]
    P1B["Phase 1B<br/>Frontend Streaming"]
    P1C["Phase 1C<br/>Memoization"]
    P1D["Phase 1D<br/>Manual Tests"]
    P2["Phase 2<br/>Model Swap"]
    P3["Phase 3<br/>RAG Parallel + Index"]
    P4["Phase 4<br/>Verification &amp; Handoff"]

    P0 --> P1A --> P1B --> P1C --> P1D --> P2 --> P3 --> P4

    classDef done fill:#bbf7d0,stroke:#16a34a,stroke-width:2px
    classDef blocked fill:#fed7aa,stroke:#ea580c,stroke-width:2px
    classDef pending fill:#e5e7eb,stroke:#6b7280,stroke-width:2px

    class P1A,P1B,P1C,P2,P3 done
    class P0,P1D,P4 blocked
```

**Legend:** 🟢 done · 🟠 code done, blocked on env access · ⚪ pending

---

## 6. Commit history (Option 1 branch)

```mermaid
gitGraph
    commit id: "main: Atualizou nome do plano"
    branch feat/perf-optimization
    checkout feat/perf-optimization
    commit id: "Day 1: perf instrumentation + metrics table"
    commit id: "Day 2: baseline measurement artifacts"
    commit id: "Day 3: document current flow + integration points"
    commit id: "Day 4: backend SSE streaming + persist message"
    commit id: "Day 5: frontend stream consumer + memoize"
    commit id: "Day 6: Flash model + parallel RAG + trgm"
    commit id: "Day 7: edge-case fix + DEPLOY + FINAL_REPORT"
    commit id: "Day 8: self-review + bug fix"
    commit id: "ALSO: idempotent search_path migration" type: HIGHLIGHT
```

---

## 7. External dependencies map

```mermaid
flowchart LR
    App["Nura AI Hub<br/>(your code)"]

    subgraph React["React Stack"]
        Vite["Vite 5"]
        TS["TypeScript 5.8"]
        Router["React Router 6"]
        TQ["TanStack Query"]
    end

    subgraph UI["UI Layer"]
        Tailwind["Tailwind 3.4"]
        Shadcn["shadcn/ui<br/>(48 components)"]
        Radix["Radix UI primitives"]
        Lucide["Lucide icons"]
    end

    subgraph Content["Content"]
        ReactMD["react-markdown +<br/>remark-gfm + rehype-raw"]
        TipTap["TipTap 3.15<br/>(blog editor)"]
        Recharts["Recharts<br/>(admin finance)"]
    end

    subgraph Forms["Forms"]
        RHF["react-hook-form"]
        Zod["zod validation"]
        DOMPurify["dompurify"]
    end

    subgraph Backend["Backend Services"]
        SupabaseJS["@supabase/supabase-js"]
        StripeRedirect["Stripe Checkout"]
        LovableCloud["@lovable.dev/cloud-auth-js"]
    end

    App --> React
    App --> UI
    App --> Content
    App --> Forms
    App --> Backend
```

---

## 8. The pgvector finding (Option 2 candidate)

```mermaid
flowchart TD
    Query["User asks: 'CBD dosing for epilepsy?'"]

    subgraph Current["Current implementation (ILIKE)"]
        Extract1["extractKeyTerms() splits<br/>into 5 query strings"]
        Loop1["For each (kType × query):<br/>SELECT ... WHERE content ILIKE %term%"]
        Score1["Score in JS (regex match count)"]
        Top1["Top 8 chunks → LLM context"]
    end

    subgraph Available["Already installed but unused"]
        Embed["Embedding API call<br/>(1 round-trip ~150ms)"]
        Vector["search_similar_chunks()<br/>uses ivfflat index<br/>vector cosine ~30ms"]
        Top2["Top N chunks → LLM context"]
    end

    Query --> Extract1
    Extract1 --> Loop1
    Loop1 --> Score1
    Score1 --> Top1

    Query -.alternative.-> Embed
    Embed -.-> Vector
    Vector -.-> Top2

    classDef current fill:#fed7aa,stroke:#ea580c
    classDef available fill:#bbf7d0,stroke:#16a34a
    class Extract1,Loop1,Score1,Top1 current
    class Embed,Vector,Top2 available
```

**Currently:** sequential ILIKE queries (now parallelized in Option 1, ~1-2s p95)
**Available with ~1 day work:** semantic search using already-installed pgvector (~100ms p95, more relevant results)

---

## How to render these diagrams

| Tool | Action |
|---|---|
| **VS Code** | Install "Markdown Preview Mermaid Support" extension, then `Ctrl+Shift+V` on this file |
| **GitHub / GitLab** | Renders automatically when this file is viewed on the web |
| **Mermaid Live Editor** | Copy any `mermaid` block into https://mermaid.live for export to SVG/PNG |
| **CLI (PNG export)** | `npx @mermaid-js/mermaid-cli -i ARCHITECTURE.md -o diagrams.pdf` |
| **Pandoc** | `pandoc ARCHITECTURE.md -o ARCHITECTURE.pdf --filter mermaid-filter` |

If you want individual PNGs, the easiest path is the Mermaid Live Editor — paste each block, hit Export.
