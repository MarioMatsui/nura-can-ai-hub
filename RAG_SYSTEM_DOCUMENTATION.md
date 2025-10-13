# Sistema RAG Robusto - Documentação

## Visão Geral

Sistema de Geração Aumentada por Recuperação (RAG) implementado para processar documentos de até 1 MB sem esbarrar em limites de TPM (Tokens Por Minuto) do OpenAI.

## Arquitetura

### 1. Ingestão de Documentos

**Endpoint:** Edge Function `process-document`

**Fluxo:**
1. Documento salvo na tabela `knowledge_documents` com status `queued`
2. Processamento assíncrono iniciado
3. Texto extraído e dividido em chunks de ~2000 tokens
4. Status atualizado para `processing`

### 2. Chunking Otimizado

**Parâmetros:**
- Tamanho do chunk: 2000 tokens (~8000 caracteres)
- Overlap: 200 tokens (~800 caracteres)
- Hash: SHA1 dos primeiros 200 chars + comprimento + ordem

**Benefícios:**
- Chunks previsíveis e consistentes
- Overlap garante continuidade de contexto
- Hash evita duplicação

### 3. Embeddings com Controle de TPM

**Modelo:** `text-embedding-3-small` (1536 dimensões)

**Estratégia Anti-Rate-Limit:**
- Processamento em lotes de 3 chunks (concorrência calculada: `floor(30k TPM / 2k tokens) = 15`, reduzido para 3 por segurança)
- Delay de 1.5s entre lotes
- Exponential backoff em caso de erro 429
- Máximo de 3 tentativas por lote

**Cálculo de Concorrência:**
```
TPM_LIMIT = 30,000
CHUNK_TOKENS = 2,000
SAFE_CONCURRENCY = floor(TPM / CHUNK_TOKENS) / 3 = 3-4
```

### 4. Armazenamento Vetorial

**Tabela:** `document_chunks`

**Índice:** `ivfflat` com `vector_cosine_ops` (100 listas)

**Campos:**
- `id`: BIGSERIAL (chave primária)
- `doc_id`: Referência ao documento
- `chunk_order`: Ordem no documento
- `content`: Texto do chunk
- `embedding`: VECTOR(1536)
- `hash`: Hash único

### 5. Sistema de Status em Tempo Real

**Endpoint:** Edge Function `document-status`

**Status Possíveis:**
- `queued`: Na fila
- `processing`: Processando
- `ready`: Pronto para consultas
- `error`: Erro no processamento

**Progress:**
- 0-10%: Iniciando
- 10-30%: Chunking
- 30-90%: Vetorização (proporcional aos chunks processados)
- 90-100%: Indexação
- 100%: Completo

### 6. Consulta RAG

**Endpoint:** Edge Function `rag-ask`

**Fluxo:**
1. Pergunta é convertida em embedding
2. Busca por similaridade vetorial (top 8 chunks)
3. Chunks reunidos até max 12k caracteres
4. Prompt anti-alucinação construído
5. GPT-4.1-mini gera resposta

**Modelo:** `gpt-4.1-mini-2025-04-14`
- Rápido e barato
- Max 1000 tokens de saída
- Temperature 0.3 (mais determinístico)

**Prompt Anti-Alucinação:**
```
Você é um assistente médico especializado. Responda APENAS com base nos trechos fornecidos.

REGRAS CRÍTICAS:
- Se a informação NÃO estiver nos trechos, diga "Não encontrei essa informação nos documentos fornecidos."
- NÃO invente, deduza ou assuma informações
- Cite os documentos quando possível
- Seja preciso e objetivo
```

## Interface do Usuário

### Componente: DocumentProcessingProgress

**Exibição:**
- Barra de progresso geral
- 4 etapas visuais:
  1. ✓ Extração de Texto
  2. ✓ Chunking
  3. ⏳ Vetorização
  4. ⏳ Indexação

**Polling:**
- Intervalo: 3 segundos
- Endpoint: `/document-status?doc_id=...`
- Para quando status = `ready` ou `error`

## Limites e Performance

### Capacidade
- **Tamanho máximo:** 1 MB por documento
- **Chunks:** Ilimitado (processamento assíncrono)
- **TPM:** Controlado automaticamente

### Escalabilidade
- Processamento não-bloqueante
- Fila automática de documentos
- Retry com backoff exponencial
- Status persistido no banco

### Performance Esperada
- **Documento de 100 KB:**
  - ~12 chunks
  - ~4 lotes
  - Tempo: ~10-15 segundos

- **Documento de 1 MB:**
  - ~125 chunks
  - ~42 lotes
  - Tempo: ~70-90 segundos

## Segurança

### Chaves de API
- OPENAI_API_KEY armazenada como secret do Supabase
- Nunca exposta no frontend
- Todas as chamadas via Edge Functions

### RLS Policies
- `knowledge_documents`: Admins gerenciam, usuários visualizam
- `document_chunks`: Admins gerenciam, usuários visualizam
- `processing_jobs`: Usuários veem apenas jobs de seus documentos

## Endpoints

### POST /process-document
**Body:** `{ documentId: string }`
**Response:** `{ success: boolean, chunks: number }`

### GET /document-status?doc_id=...
**Response:**
```json
{
  "status": "processing",
  "progress": 45,
  "error": null,
  "jobs": [...]
}
```

### POST /rag-ask
**Body:** `{ question: string, doc_id?: string, knowledge_type: string }`
**Response:**
```json
{
  "answer": "...",
  "citations": [...],
  "chunks_used": 8
}
```

## Melhorias Futuras

1. **Map-Reduce para Resumos:**
   - Resumo de cada chunk com GPT-4.1-nano
   - Síntese final com GPT-4.1-mini

2. **Cache de Embeddings:**
   - Evitar reprocessamento de chunks idênticos
   - Verificação via hash

3. **Filas Dedicadas:**
   - Separar extraction, chunking, embedding em workers
   - Melhor paralelização

4. **Monitoramento:**
   - Logs estruturados
   - Métricas de performance
   - Alertas de rate limit

## Troubleshooting

### Erro 429 (Rate Limit)
- **Causa:** TPM excedido
- **Solução:** Automática via backoff exponencial
- **Prevenção:** Concorrência reduzida para 3

### Documento Travado em "processing"
- **Causa:** Erro não capturado
- **Solução:** Verificar logs da edge function
- **Fix:** Sistema marca como `error` automaticamente

### Chunks Duplicados
- **Causa:** Hash collision (raro)
- **Solução:** Constraint UNIQUE no hash previne
- **Log:** Erro será registrado

## Conclusão

Este sistema RAG resolve definitivamente o problema de TPM através de:
1. **Chunking inteligente** com overlap
2. **Processamento assíncrono** com controle de concorrência
3. **Retry automático** com backoff exponencial
4. **UI responsiva** com feedback em tempo real
5. **RAG eficiente** que lê apenas trechos relevantes

**Resultado:** Usuário pode fazer upload de 1 MB e consultar imediatamente após processamento, sem travar a experiência.
