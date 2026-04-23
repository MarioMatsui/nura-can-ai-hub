---
name: Prescription engine
description: Receituário+ — RAG sanitizado por termo, anexos via signed URL para arquivos > 2MB (memória constante), base64 inline só para arquivos pequenos
type: feature
---

# Receituário+ engine — alinhamento com chat-ai

A função `generate-prescription` foi alinhada com `chat-ai` para reduzir divergência clínica.

## Arquitetura
- Modelo: `google/gemini-2.5-pro`
- System: `MEDICAL_SYSTEM_PROMPT` + `PRESCRIPTION_TASK_LAYER` + `ATTACHMENT_PRIORITY_NOTE` (mesma camada de prioridade que o chat usa)
- User: texto do caso + anexos multimodais
- Sem histórico (one-shot por natureza da tarefa)

## Anexos: signed URL vs base64 inline (CRÍTICO)

**Regra:** arquivos > 2MB **NUNCA** são carregados em base64 dentro do edge function. Em vez disso, geramos uma **signed URL do Supabase Storage** (válida por 600s) e passamos como `image_url.url` no payload OpenAI-compatible. O Gemini busca o arquivo direto do Storage, sem passar pelo edge function nem pelo gateway como base64.

| Tamanho | Caminho | Por quê |
|---|---|---|
| < 2 MB | Base64 inline (`data:mime;base64,...`) | Mais rápido, sem round-trip extra |
| 2 MB – 2 GB | Signed URL (`https://...`) | Evita estouro de RAM e o limite prático de ~7MB do `inline_data` do Gemini |

### Por que signed URL é obrigatório acima de 2MB
1. **Memória do edge function (256MB):** materializar 16MB de PDF como base64 (~21MB) + buffer da response (~16MB) + string binária intermediária (~16MB) = pico > 60MB só para um arquivo. Com dois PDFs, estoura.
2. **Limite do `inline_data` do Gemini:** o provider tem teto prático de ~7MB por parte. Acima disso responde com `400 Base64 decoding failed` (mensagem enganosa — o base64 está íntegro, mas tamanho excede). Signed URL bypassa esse limite e suporta arquivos até 2GB.

### Fluxo de carregamento (`loadFile`)
1. `getSignedUrl(bucket, path, 600s)` — sempre gera, é barato.
2. `HEAD signedUrl` para descobrir `content-length` e `content-type` sem baixar.
3. Se `size > 2MB`: retorna `{ base64: null, signedUrl, mimeType, sizeBytes, bucket, path }` — **sem download**.
4. Se `size <= 2MB`: baixa, converte para base64, retorna ambos (`base64` E `signedUrl`).

### Anexação no payload (`attachIfMultimodal`)
- Se há `signedUrl` e (não tem base64 OU é > 2MB): usa signed URL.
- Senão: usa `data:mime;base64,...`.
- Logs explicitam o caminho usado e o tamanho.

## Tipos de anexo (igual ao chat-ai)
- PDF / imagem → multimodal (signed URL ou base64 conforme tamanho)
- DOC / DOCX / RTF / ODT → multimodal binário (mesmo padrão do chat)
- TXT / MD / CSV / JSON / XML → texto puro decodificado e embutido no prompt como FONTE PRIMÁRIA (só funciona se o arquivo for pequeno o suficiente para ter base64; arquivos de texto > 2MB caem no caminho de URL)
- Quando o original é anexado, o texto extraído entra apenas como APOIO resumido (8k chars prontuário, 12k catálogo)
- Quando o original NÃO é anexado, o texto extraído é a FONTE PRIMÁRIA (30k prontuário, 40k catálogo)

## RAG médico
- Reutiliza `searchKnowledgeBase` lógica do chat-ai (mesmo `TERM_ALIASES`, `generateSearchQueries`, score)
- Query construída a partir de: queixa principal + sintomas + diagnósticos + comorbidades + histórico + observações
- **CRÍTICO**: cada termo é sanitizado via `sanitizeSearchTerm` antes de entrar no `.or(content.ilike...)` — remove acentos, vírgulas, pontos e qualquer caractere não-alfanumérico. Sem isso, queries com pontuação quebram o "logic tree" do PostgREST.
- Limite por chunk: 8000 chars
- Top 8 chunks

## Parâmetros de inferência (alinhados ao chat-ai)
- `max_tokens: 8000`
- Sem `temperature` explícita (usa default do provedor)

## Cache de extração + proteção de memória
- `ensureExtraction` só reutiliza cache de qualidade:
  - catálogo: precisa ter `metadata.products.length > 0` E `extracted_content > 200 chars`
  - prontuário: precisa ter `main_complaint` ou `symptoms.length > 0` E `extracted_content > 200 chars`
- `extracted_content` armazenado: até 80k chars
- **Arquivos > 6MB pulam a extração com Gemini Flash.** O Gemini Pro multimodal lê o PDF original direto via signed URL, então a extração estruturada com Flash é redundante.
- **Arquivos entre 2MB e 6MB:** se cache inválido, baixamos APENAS naquele momento (em escopo isolado via `downloadAsBase64Once`) para rodar a extração com Flash, e descartamos o base64 imediatamente após.
- **Download SEQUENCIAL** (não paralelo) — record primeiro, catalog depois.
- `uint8ToBase64`: chunks de 8KB, **um único `btoa()`** no final. Nunca chamar `btoa()` por chunk (corrompe alinhamento de 3 bytes → 4 chars).
- `assertValidBase64`: validação só roda no caminho de base64 inline.

## Logs de comparação
A função emite resumo objetivo a cada chamada:
- Caminho usado por cada arquivo (signed URL ou base64 inline) + tamanho em MB
- RAG chunks count
- Tamanho do system prompt e do user text
- finish_reason + tokens input/output da resposta

## Formato de saída
- Camada de receituário (`PRESCRIPTION_TASK_LAYER`) é MOLDURA, não centro do raciocínio
- Estrutura sugerida (não obrigatória): resumo, análise, produtos, monitoramento, considerações, aviso
- Múltiplos produtos preferidos quando clinicamente plausíveis; produto único é aceitável

## Não tocar
- `chat-ai` permanece intacto como referência
- RLS dos buckets `prescription-files` e tabelas `prescription_*`
