

## Correção do erro 400 "Base64 decoding failed"

**Problema:** A função `uint8ToBase64` em `generate-prescription/index.ts` codifica PDFs em chunks isolados com `btoa` separado por chunk. Isso corrompe o base64 quando os chunks não são múltiplos de 3 bytes (padding `=` no meio da string) e quando a variável `binary` é reutilizada entre chunks. Para o catálogo de ~10MB, há centenas de pontos de corrupção, e o Google AI Studio rejeita o payload com HTTP 400.

**Por que só aparece agora:** O prontuário de 80KB era pequeno o bastante para passar batido em alguns casos. O catálogo de 10MB expõe o bug em escala.

## Solução

Reescrever `uint8ToBase64` para construir a string binária inteira primeiro (de forma segura para o stack do V8) e fazer **um único `btoa`** no final. A abordagem correta:

1. Construir a string binária em chunks de 8KB usando `String.fromCharCode(...slice)` com spread controlado, **acumulando numa única string**.
2. Chamar `btoa()` **uma única vez** sobre a string binária completa.
3. Liberar a string binária imediatamente após.

Isso garante alinhamento correto dos grupos de 3 bytes e elimina o padding intermediário.

```ts
function uint8ToBase64(buf: Uint8Array): string {
  const CHUNK = 0x8000; // 32KB - seguro pro stack
  let binary = '';
  for (let i = 0; i < buf.length; i += CHUNK) {
    const slice = buf.subarray(i, Math.min(i + CHUNK, buf.length));
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
}
```

**Sobre memória:** Para um PDF de 10MB, a string binary terá ~10MB e o base64 final ~13.3MB. Isso cabe folgadamente nos 256MB do edge function — o crash anterior de memória foi resolvido com downloads sequenciais e skip de extração para arquivos grandes (já implementados). Não há motivo real para fragmentar o `btoa`.

## Validação adicional

Adicionar uma verificação leve antes de enviar ao Gemini: confirmar que o base64 resultante tem comprimento esperado (`Math.ceil(bytes / 3) * 4`) e não contém `=` fora do final. Se a validação falhar, abortar com mensagem clara em vez de mandar payload corrompido pro provider.

## Arquivos alterados

- `supabase/functions/generate-prescription/index.ts` — corrigir `uint8ToBase64` e adicionar validação de integridade.
- `mem://features/prescription-engine` — registrar o aprendizado: **nunca** chamar `btoa()` por chunk; sempre acumular a string binária inteira primeiro.

## Resultado esperado

- O catálogo de 10MB é codificado corretamente em base64 íntegro.
- O Google AI Studio aceita o payload multimodal e gera o receituário normalmente.
- Memória continua dentro do limite (downloads sequenciais já garantem isso).

