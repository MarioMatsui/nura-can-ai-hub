

## Diagnóstico — dois erros distintos, mesma causa raiz

Olhando os logs e o código, há **dois erros que se alternam** dependendo do tamanho do catálogo:

### Erro 1 — `Memory limit exceeded` (logs 03:30 e 03:31, mais recentes)
A função estoura os 256MB do edge runtime durante o download do CATÁLOGO, antes de chegar no Gemini. Mesmo com download sequencial, no momento em que o catálogo de 16MB é convertido para base64, **o RECORD ainda está vivo na memória** (precisa estar, porque será anexado depois junto com o catalog na chamada final do Pro).

Cálculo real:
- RECORD em base64 (~80KB → ~107KB): irrelevante
- CATALOG em base64 (~16MB → ~21MB)
- **String binária intermediária `binary` (~16MB)** durante o `uint8ToBase64`
- **Buffer da resposta do `data.arrayBuffer()` (~16MB)** ainda referenciado
- Concatenação por `+=` em loop de 8KB: V8 mantém shadow copies da rope string

Pico real durante a conversão do catalog ≈ **60–80MB só para o catalog**, somado ao resto do runtime + record + system prompt + RAG chunks = estoura.

### Erro 2 — `400 Base64 decoding failed` (log 03:26)
Olhando o início do payload rejeitado: `JVBERi0xLjQK...` é literalmente `%PDF-1.4` em base64 — **o base64 está íntegro**. O Google AI Studio rejeitou porque o **inline_data do Gemini tem limite prático de ~7MB por parte**. Catálogos de 10MB+ batem nesse limite e o provider responde com a mensagem genérica "Base64 decoding failed", o que é enganoso — o problema real é tamanho.

A correção anterior do `btoa()` único foi correta, mas não é suficiente: mesmo com base64 perfeito, o Gemini não aceita inline_data tão grande.

## Solução definitiva — Files API do Gemini

O Gemini tem uma **Files API** específica para arquivos grandes (até 2GB). Em vez de mandar o PDF inline em base64 dentro do prompt, fazemos upload prévio para o Google e passamos apenas a **URI do arquivo** no payload. Isso resolve os dois problemas de uma vez:

1. **Memória do edge function**: o PDF é enviado em streaming direto do Storage → Google, sem precisar materializar base64 em RAM.
2. **Limite do inline_data**: a Files API foi feita exatamente para isso, suporta arquivos de até 2GB e o limite de 7MB do inline deixa de existir.

### Como o Gateway da Lovable suporta isso

O Lovable AI Gateway repassa requests no formato OpenAI-compatible para o Google. Para anexar um arquivo via URI, usamos o tipo `image_url` com uma URL HTTP pública assinada (signed URL do Supabase Storage) em vez de `data:base64,...`. O Gemini busca o arquivo direto da URL, sem passar pelo edge function nem pelo gateway como base64.

```ts
// Em vez de:
{ type: 'image_url', image_url: { url: `data:${mt};base64,${huge_base64}` } }

// Passamos:
{ type: 'image_url', image_url: { url: signedUrl } }
```

A signed URL do Supabase Storage é válida por tempo configurável (usaremos 10min, suficiente para o Gemini baixar). Funciona para PDF e imagem.

## Mudanças no `supabase/functions/generate-prescription/index.ts`

### 1. Nova helper `getSignedUrl()`
Gera signed URL de 600s para o arquivo no bucket `prescription-files`.

```ts
async function getSignedUrl(supabase: any, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('prescription-files')
    .createSignedUrl(path, 600);
  return error ? null : data.signedUrl;
}
```

### 2. `downloadFileAsBase64` deixa de baixar quando o arquivo é grande
Para arquivos `> 2MB`, não baixamos mais. Apenas geramos signed URL e devolvemos `{ signedUrl, mimeType, sizeBytes }`. Para arquivos pequenos (< 2MB), mantemos o fluxo atual com base64 inline (mais rápido, sem round-trip extra).

```ts
const INLINE_THRESHOLD = 2 * 1024 * 1024; // 2MB
```

### 3. `ensureExtraction` se adapta ao novo retorno
Quando recebe um arquivo "via URL" (sem base64 carregado), e a extração estruturada é necessária, baixa só naquele momento (escopo isolado) e libera ao terminar. Para arquivos grandes (> 6MB) já pulamos a extração, então o caso comum nem precisa baixar.

### 4. Anexação no payload final usa URL quando disponível
```ts
const url = file.signedUrl ?? `data:${file.mimeType};base64,${file.base64}`;
userContent.push({ type: 'image_url', image_url: { url } });
```

### 5. Remover `assertValidBase64` do caminho de URL
Validação só roda quando temos base64 inline.

### 6. Logs claros indicando qual caminho foi usado
```
PRONTUÁRIO via signed URL (16.2MB) — sem materializar base64
CATÁLOGO via base64 inline (1.3MB)
```

## Comportamento esperado por tamanho de arquivo

| Tamanho do arquivo | Caminho |
|---|---|
| < 2 MB | Base64 inline (rápido, mesmo de antes) |
| 2 MB – 2 GB | Signed URL → Gemini busca direto do Storage |

Memória do edge function fica praticamente constante independente do tamanho do PDF.

## Validação pós-deploy

Depois do deploy, testar com o catálogo de 16MB + prontuário de 80KB. Critérios de sucesso nos logs:

- `CATÁLOGO via signed URL (16.06MB)` — confirma novo caminho
- Sem `Memory limit exceeded`
- Sem `400 Base64 decoding failed`
- `finish_reason: stop` e tokens de saída > 0

## Arquivos alterados

- `supabase/functions/generate-prescription/index.ts` — nova lógica de signed URL para arquivos grandes
- `mem://features/prescription-engine` — registrar a regra: PDFs > 2MB vão via signed URL, nunca inline base64

## Por que não tentar comprimir / quebrar / streamar manualmente

Considerei e descartei:
- **Comprimir o PDF**: dá ganho marginal e não resolve o limite do inline_data
- **Quebrar o catálogo em chunks**: perde contexto entre páginas, o Gemini precisa ver o catálogo inteiro pra cruzar produtos
- **Pular o catálogo no payload e confiar só no extracted_content**: derrota o propósito de usar Pro multimodal e volta ao problema de qualidade que motivou o alinhamento com o chat-ai

Signed URL é a solução padrão para esse caso e está alinhada com o que a documentação do Google recomenda para arquivos > 20MB.

