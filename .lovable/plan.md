
## Diagnóstico do log

O erro voltou pelo mesmo motivo-base: a função **ainda estoura o limite de CPU por invocação**, mesmo depois de trocar para JPEG.

O log prova isso:

```text
[batch start=0 size=3] ...
PDF carregado: 9.97MB
Inicializando PDFium…
PDF tem 85 páginas. Processando 1–3 de 85.
Página 1/85: 1080x607, JPEG 88KB
Página 2/85: 1080x607, JPEG 100KB
CPU Time exceeded
```

### O que isso significa
- O problema **não é mais** bundle, import, WASM ou autenticação.
- O pipeline já está funcionando até:
  - baixar PDF,
  - inicializar PDFium,
  - renderizar páginas,
  - encodar JPEG,
  - subir arquivos.
- A função morre **antes de terminar o batch de 3 páginas**.

### Leitura prática do tempo
Pelos timestamps do log, a execução inteira morre em algo perto de **6–6,5s**, não com a folga de ~10s que estava sendo assumida.  
Ou seja: **3 páginas continuam altas demais para esse runtime**.

## Problema secundário encontrado no código

Há um segundo bug importante no backend atual:

- as páginas novas só são gravadas em `extracted_metadata` **depois que o batch inteiro termina**;
- como a função cai antes disso, as páginas 1 e 2 podem até já ter sido enviadas ao storage, mas o progresso **não fica salvo no banco**;
- na próxima tentativa, o processamento pode voltar do zero.

Além disso, no frontend existe outro risco:
- hoje o botão **Gerar Receituário** libera quando `pages_count > 0`;
- então, se houver falha com processamento parcial, o usuário pode gerar usando **catálogo incompleto**.

## Plano de correção

### 1) Reduzir o batch para 1 página por invocação
**Arquivo:** `supabase/functions/process-catalog-pdf/index.ts`  
**Arquivo:** `src/components/dashboard/prescription/UploadDropzone.tsx`

Alterar:
- `DEFAULT_BATCH = 3` → `DEFAULT_BATCH = 1`
- no frontend, `batchSize: 3` → `batchSize: 1`

Isso alinha a função com o que o log mostrou: hoje ela aguenta no máximo algo próximo de **1 página por chamada** com segurança.

### 2) Persistir progresso página a página
**Arquivo:** `supabase/functions/process-catalog-pdf/index.ts`

Em vez de esperar o batch inteiro acabar para atualizar `extracted_metadata`, salvar progresso **logo após cada upload bem-sucedido**:
- `pages`
- `pages_count`
- `total_pages`
- `processing_complete`
- `pages_format`
- `pages_render_scale`

Assim, se a função cair no meio:
- o progresso já fica salvo;
- a próxima chamada continua de onde parou;
- não há perda do trabalho já feito.

### 3) Tornar a retomada defensiva
**Arquivo:** `supabase/functions/process-catalog-pdf/index.ts`

Calcular um `effectiveStartPage` com base no progresso salvo, para evitar recomeçar do zero se o frontend mandar `startPage` desatualizado.

Regra:
- usar o maior valor entre `startPage` recebido e o progresso já salvo (`existingPages.length` / `pages_count`).

Isso torna o processamento realmente reentrante.

### 4) Corrigir a condição que libera “Gerar Receituário”
**Arquivo:** `src/components/dashboard/prescription/PrescriptionView.tsx`

Hoje basta ter `pages_count > 0`.  
Isso precisa mudar para, no caso de catálogo PDF:

- só considerar pronto quando:
  - `!catalog.isProcessing`
  - `total_pages` existir
  - `pages_count === total_pages`

Assim o botão não libera com catálogo parcial.

## Ajustes de UX

### 5) Manter o progresso visível mesmo se um batch falhar
**Arquivo:** `src/components/dashboard/prescription/UploadDropzone.tsx`

Quando houver erro intermediário:
- manter `pages_count` e `total_pages` visíveis;
- mostrar mensagem de erro específica;
- não “apagar” a noção de progresso já concluído.

Exemplo de estado:
```text
Processamento interrompido em 12/85 páginas.
```

## O que não precisa mudar
- não precisa mexer em schema;
- não precisa mexer em RLS;
- não precisa mexer no fluxo de geração multimodal;
- JPEG + `RENDER_SCALE = 0.75` continuam corretos por enquanto.

## Resultado esperado após a correção

### Backend
Cada invocação fará:
```text
Baixar PDF
Inicializar PDFium
Processar 1 página
Salvar progresso
Responder
```

### Frontend
O card deve avançar assim:
```text
1/85 → 2/85 → 3/85 → ... → 85/85
```

E o botão **Gerar Receituário** só habilita no final.

## Arquivos a alterar
- `supabase/functions/process-catalog-pdf/index.ts`
- `src/components/dashboard/prescription/UploadDropzone.tsx`
- `src/components/dashboard/prescription/PrescriptionView.tsx`
- `mem://features/prescription-engine`

## Observação técnica
Se mesmo com **batch = 1** ainda houver timeout em catálogos grandes, o próximo passo deixa de ser “reduzir mais batch” e passa a ser **trocar a estratégia de bootstrap do PDFium**. Mas, pelo log atual, a correção mais direta e segura agora é:

1. **1 página por chamada**
2. **checkpoint por página**
3. **bloqueio da geração até 100% completo**
