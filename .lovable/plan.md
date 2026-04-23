

## Diagnóstico

Logs confirmam: 63 páginas foram processadas e salvas com sucesso (`✓ checkpoint salvo`). Na página 64, a invocação estourou CPU e voltou erro pro frontend. O frontend então **deu `break` no loop e parou**.

```
[batch start=63 size=1] … (64ª página)
PDF tem 85 páginas. Processando 64–64 de 85 (já processadas: 63).
CPU Time exceeded   ← aqui o loop morreu
```

Causa raiz do "parou em 63/85": frontend sem retry. O backend está correto (checkpoint funcionou: progresso preservado).

## Plano de correção

### 1) Retry automático com backoff no frontend
**Arquivo:** `src/components/dashboard/prescription/UploadDropzone.tsx`

No `while (!done)`:
- Em caso de `procError` ou `r?.error`, **não** dar `break` imediato.
- Tentar até **3 retries** por batch, com `await sleep(1500ms)` entre tentativas.
- Só sair do loop e mostrar erro se as 3 tentativas falharem em sequência.
- Como o backend é reentrante (`effectiveStartPage = max(startPage, existingPages.length)`), retentar é seguro — nunca duplica página.

### 2) Detectar progresso parado e retomar do banco
**Arquivo:** `src/components/dashboard/prescription/UploadDropzone.tsx`

Antes de cada retry, ler `extracted_metadata.pages_count` direto da tabela `prescription_catalogs`. Se o backend salvou checkpoint mesmo a chamada tendo retornado erro (acontece quando o timeout ocorre depois do upload mas antes da resposta HTTP), o loop avança usando o valor real do banco em vez do `startPage` antigo.

### 3) Botão "Continuar processamento" no card do catálogo
**Arquivo:** `src/components/dashboard/prescription/UploadDropzone.tsx`

Quando catálogo PDF está com `pages_count < total_pages` e **não** está processando, mostrar:
```
63/85 páginas processadas
[Continuar processamento]
```
O botão dispara o mesmo loop a partir de `pages_count`, sem precisar reenviar o PDF. Útil para recuperar catálogos que ficaram parados (como o atual de 63/85).

### 4) Pequeno ajuste de mensagem
- Toast de erro intermediário muda para algo acionável:  
  `"Processamento pausado em X/Y páginas. Clique em Continuar processamento para retomar."`

## O que NÃO muda
- Backend `process-catalog-pdf` permanece como está (já é resiliente: checkpoint por página + retomada defensiva).
- Sem mudanças em schema, RLS, buckets, `generate-prescription` ou `chat-ai`.
- Batch continua em 1 página por chamada.

## Resultado esperado
1. No catálogo atual (Zeleno Meds, 63/85): aparece botão **Continuar processamento** → ao clicar, retoma da página 64 e termina as 22 restantes.
2. Em uploads novos: se uma chamada falhar, o frontend tenta novamente automaticamente até 3 vezes antes de pausar. Praticamente todos os catálogos terminam sem intervenção do usuário.
3. Botão "Gerar Receituário" continua só liberando em `pages_count === total_pages`.

## Arquivos a alterar
- `src/components/dashboard/prescription/UploadDropzone.tsx`
- `mem://features/prescription-engine` (documentar retry + retomada manual)

