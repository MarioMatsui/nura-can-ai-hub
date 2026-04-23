---
name: Prescription engine
description: Receituário+ — RAG sanitizado por termo, anexos alinhados ao chat-ai (PDF/img/DOC multimodal, TXT inline), max_tokens 8000, sem temperature fixa, prioridade de anexos no system layer
type: feature
---

# Receituário+ engine — alinhamento com chat-ai

A função `generate-prescription` foi alinhada com `chat-ai` para reduzir divergência clínica.

## Arquitetura
- Modelo: `google/gemini-2.5-pro`
- System: `MEDICAL_SYSTEM_PROMPT` + `PRESCRIPTION_TASK_LAYER` + `ATTACHMENT_PRIORITY_NOTE` (mesma camada de prioridade que o chat usa)
- User: texto do caso + anexos multimodais
- Sem histórico (one-shot por natureza da tarefa)

## Anexos (igual ao chat-ai)
- PDF / imagem → multimodal via `image_url` base64
- DOC / DOCX / RTF / ODT → multimodal binário (mesmo padrão do chat)
- TXT / MD / CSV / JSON / XML → texto puro decodificado e embutido no prompt como FONTE PRIMÁRIA
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
- Sem `temperature` explícita (usa default do provedor) — antes era 0.7/0.4 fixo

## Cache de extração + proteção de memória
- `ensureExtraction` só reutiliza cache de qualidade:
  - catálogo: precisa ter `metadata.products.length > 0` E `extracted_content > 200 chars`
  - prontuário: precisa ter `main_complaint` ou `symptoms.length > 0` E `extracted_content > 200 chars`
- `extracted_content` armazenado: até 80k chars
- **CRÍTICO MEMÓRIA**: arquivos > 6MB pulam a extração com Gemini Flash. O Gemini Pro multimodal lê o PDF original direto, então a extração estruturada com Flash é redundante e dobra o uso de RAM.
- **Download SEQUENCIAL** (não paralelo). Antes: 2 PDFs base64 + 2 extrações em paralelo + 2 anexos = pico > 256MB. Agora: 1 PDF na fase de extração, ambos só coexistem na chamada final do Pro.
- `uint8ToBase64`: constrói a string binária inteira em chunks de 8KB (loop simples por byte, sem `String.fromCharCode.apply` que estoura stack do V8) e chama `btoa()` **UMA ÚNICA VEZ** no final. **NUNCA** chamar `btoa()` por chunk — cada chunk vira um bloco base64 com padding `=` próprio, corrompendo alinhamento de 3 bytes → 4 chars. Provider rejeita com HTTP 400 "Base64 decoding failed". Para PDF de 10MB a binary tem ~10MB e o base64 ~13MB, cabe folgado nos 256MB.
- `assertValidBase64`: validação antes do envio ao Gemini. Confere `length === Math.ceil(bytes/3)*4` e que `=` só aparece nas últimas 2 posições. Aborta com erro claro em vez de mandar payload corrompido.

## Logs de comparação
A função emite resumo objetivo a cada chamada:
- RAG chunks count
- Tipo de anexo de cada arquivo (multimodal? texto puro?)
- Tamanho do system prompt e do user text
- finish_reason + tokens input/output da resposta

## Formato de saída
- Camada de receituário (`PRESCRIPTION_TASK_LAYER`) é MOLDURA, não centro do raciocínio
- Estrutura sugerida (não obrigatória): resumo, análise, produtos, monitoramento, considerações, aviso
- Múltiplos produtos preferidos quando clinicamente plausíveis; produto único é aceitável

## Não tocar
- `chat-ai` permanece intacto como referência
- RLS dos buckets `prescription-files` e tabelas `prescription_*`
