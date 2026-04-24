

## Permitir catálogos grandes (até 100 páginas, 10MB+) sem timeout na geração

### Diagnóstico real

Você tem razão: o pipeline de pré-renderização página-a-página **deve** continuar funcionando como está — ele já resolveu o problema de upload de catálogos grandes. O problema é **só na hora da geração**:

A edge `generate-prescription` monta um payload com 85 signed URLs de PNGs + prontuário + RAG, dispara um único `fetch` pro `ai.gateway.lovable.dev`, e morre no `shutdown` antes da resposta voltar. Os logs confirmam: nenhum `=== PRESCRIPTION RESPONSE ===`, só `Shutdown`.

A causa não é o tamanho do PDF original (10MB), nem o sidecar de produto/posologia. É o **wall-clock da edge function** (~150s) sendo excedido enquanto o Gemini baixa e processa as 85 imagens em sequência multimodal.

### Solução — manter as 85 páginas, mas processar em background

Em vez de cortar páginas (que degradaria a qualidade), mover a chamada à IA para **background task** com `EdgeRuntime.waitUntil()`. A edge responde imediatamente com um `job_id`, o front faz polling, e o trabalho pesado roda até ~400s em background sem matar a função.

#### Mudança 1 — Nova tabela `prescription_jobs`

Migration para criar tabela de jobs com RLS por `user_id`:
```sql
create table public.prescription_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status text not null default 'processing', -- processing | completed | failed
  catalog_id uuid not null,
  record_id uuid not null,
  observations text,
  progress text, -- ex: "Analisando catálogo (85 páginas)…"
  ai_response text,
  result_id uuid, -- fk pro prescription_results criado ao final
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.prescription_jobs enable row level security;

create policy "users read own jobs" on public.prescription_jobs
  for select using (auth.uid() = user_id);

-- INSERT/UPDATE feitos pela edge com service role (bypass RLS)
```

Trigger de `updated_at` via função genérica já existente no projeto.

#### Mudança 2 — Refatorar `supabase/functions/generate-prescription/index.ts`

Estrutura nova:

```ts
Deno.serve(async (req) => {
  // ... auth + validação atuais ...

  // 1. Cria job
  const { data: job } = await admin
    .from('prescription_jobs')
    .insert({ user_id, catalog_id, record_id, observations, status: 'processing' })
    .select()
    .single();

  // 2. Dispara processamento em background
  EdgeRuntime.waitUntil(runGeneration(job.id, { user_id, catalog_id, record_id, observations }));

  // 3. Responde imediatamente
  return new Response(JSON.stringify({ jobId: job.id }), { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

async function runGeneration(jobId, params) {
  try {
    // Toda a lógica atual: carregar catálogo, prontuário, RAG, montar userContent,
    // chamar ai.gateway.lovable.dev, parsear resposta, salvar prescription_results.
    // Atualizar progress em pontos chave:
    await updateJob(jobId, { progress: 'Preparando catálogo (85 páginas)…' });
    // ... fetch IA ...
    await updateJob(jobId, { progress: 'Analisando com IA…' });
    // ... salvar resultado ...
    await updateJob(jobId, { status: 'completed', ai_response, result_id });
  } catch (e) {
    await updateJob(jobId, { status: 'failed', error_message: e.message });
  }
}
```

**Zero mudanças** na lógica de RAG, sanitização, sidecar JSON, regex de extração, formatação de saída — só envelopa tudo num background task.

#### Mudança 3 — Frontend: polling em `PrescriptionView.tsx`

Substituir o `await supabase.functions.invoke(...)` síncrono por:

```ts
const { data, error } = await supabase.functions.invoke('generate-prescription', {...});
if (error || !data?.jobId) throw new Error(...);

const jobId = data.jobId;
// Polling a cada 3s, timeout total de 8min
const result = await pollJob(jobId, {
  onProgress: (msg) => setProgressMessage(msg),
  intervalMs: 3000,
  timeoutMs: 8 * 60 * 1000,
});

if (result.status === 'failed') {
  toast.error(result.error_message || 'Falha ao gerar receituário.');
  return;
}

setAiResponse(result.ai_response);
playSfx('receita');
toast.success('Receituário gerado.');
loadHistory();
```

`pollJob` faz `supabase.from('prescription_jobs').select(...).eq('id', jobId).maybeSingle()` em loop até `status !== 'processing'`.

**Bonus UX:** mostrar `progress` da tabela no botão/loading state ("Analisando com IA…" em vez de só spinner).

#### Mudança 4 — Mensagem de erro útil

Caso o polling estoure timeout (8min) ou o job venha `failed`, toast claro:
```
'Falha ao gerar receituário. Tente novamente em alguns minutos.'
```

### Garantias

- **Catálogo 85 páginas / 10MB:** todas as páginas continuam sendo enviadas pra IA, processamento até 400s sem morrer.
- **Catálogos pequenos:** mesmo caminho, só com overhead de ~3s do primeiro polling. Aceitável.
- **Reload de página durante geração:** job continua rodando em background; usuário pode voltar e ver no histórico (próxima iteração — fora do escopo agora).
- **Erros de IA (rate limit, payment required):** capturados no `runGeneration`, gravados em `error_message`, exibidos no toast.
- **RLS:** usuário só lê os próprios jobs. Edge usa service role pra UPDATE.
- **Zero impacto** em upload, processamento de páginas, sidecar, sanitização, RAG, prontuário.

### Arquivos

- **Nova migration:** criar `prescription_jobs` com RLS.
- **Editado:** `supabase/functions/generate-prescription/index.ts` — envelopa lógica atual em `EdgeRuntime.waitUntil`, retorna `jobId` em 202.
- **Editado:** `src/components/dashboard/prescription/PrescriptionView.tsx` — `handleGenerate` faz polling do job; opcional exibir `progress` no botão.

